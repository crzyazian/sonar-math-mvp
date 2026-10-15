/**
 * Offline Sync Manager: Sonar Math MVP
 * 
 * CORE RESPONSIBILITY:
 * Automatically synchronizes cached responses when network connectivity returns.
 * Specifically engineered to survive home Wi-Fi dropout scenarios:
 * - If connection blips during item 4, responses 1-4 are safely cached locally.
 * - Auto-sync flushes queued items once online, ensuring the session clears
 *   the Oregon Department of Education (ODE) 5-item validity rule.
 */

import {
  indexedDbClient,
  CachedItemResponse,
  CachedSessionMetadata,
} from './indexedDbClient';

export type NetworkStatus = 'online' | 'offline' | 'flaky';

export interface SyncProgressUpdate {
  networkStatus: NetworkStatus;
  isSyncing: boolean;
  pendingCount: number;
  syncedCount: number;
  totalAttempted: number;
  /** Oregon Department of Education (ODE) Official State Accountability Codes */
  tstAtmptCd: 'I' | 'P' | 'C' | 'N';
  tstValidCd: 'Y' | 'N';
  odeValidityCleared: boolean;
  lastSyncTimestamp?: number;
}

export type SyncListener = (status: SyncProgressUpdate) => void;

class OfflineSyncManager {
  private networkStatus: NetworkStatus = typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline';
  private isSyncing = false;
  private syncTimer: any = null;
  private listeners: Set<SyncListener> = new Set();
  private maxRetries = 10;
  private baseBackoffMs = 1500;
  private maxBackoffMs = 30000;

  constructor() {
    this.initNetworkListeners();
  }

  private initNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.networkStatus = 'online';
      this.notifyListeners();
      // Wi-Fi restored: immediately trigger auto-sync
      this.triggerAutoSync();
    });

    window.addEventListener('offline', () => {
      this.networkStatus = 'offline';
      this.notifyListeners();
    });

    // Heartbeat check every 20 seconds to catch silent captive portals / dead routers
    setInterval(() => {
      if (this.networkStatus === 'online') {
        this.verifyRealConnectivity();
      }
    }, 20000);
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.getSyncProgress().then(listener);
    return () => this.listeners.delete(listener);
  }

  private async notifyListeners(): Promise<void> {
    const progress = await this.getSyncProgress();
    for (const listener of this.listeners) {
      try {
        listener(progress);
      } catch (err) {
        console.error('Error notifying sync listener:', err);
      }
    }
  }

  public async getSyncProgress(): Promise<SyncProgressUpdate> {
    const activeSession = await indexedDbClient.getLatestActiveSession();
    const sessionClientId = activeSession?.client_generated_id;

    if (!sessionClientId) {
      return {
        networkStatus: this.networkStatus,
        isSyncing: this.isSyncing,
        pendingCount: 0,
        syncedCount: 0,
        totalAttempted: 0,
        tstAtmptCd: 'I',
        tstValidCd: 'N',
        odeValidityCleared: false,
      };
    }

    const allResponses = await indexedDbClient.getAllResponsesForSession(sessionClientId);
    const pending = allResponses.filter((r) => r.sync_status === 'pending' || r.sync_status === 'failed');
    const synced = allResponses.filter((r) => r.sync_status === 'synced');

    return {
      networkStatus: this.networkStatus,
      isSyncing: this.isSyncing,
      pendingCount: pending.length,
      syncedCount: synced.length,
      totalAttempted: allResponses.length,
      tstAtmptCd: activeSession.tst_atmpt_cd || (allResponses.length >= 15 ? 'C' : allResponses.length >= 5 ? 'P' : 'I'),
      tstValidCd: activeSession.tst_valid_cd || (allResponses.length >= 5 ? 'Y' : 'N'),
      odeValidityCleared: (activeSession.tst_valid_cd === 'Y') || (allResponses.length >= 5),
      lastSyncTimestamp: Date.now(),
    };
  }

  /**
   * Health ping to confirm actual internet routing beyond local router Wi-Fi association
   */
  public async verifyRealConnectivity(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.networkStatus = 'offline';
      this.notifyListeners();
      return false;
    }

    try {
      // Fast lightweight HEAD request or DNS check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      // In production, hits Supabase health endpoint or /api/health
      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      // If server responded or at least network didn't fail at transport level
      const isReachable = response !== null && (response.status < 500 || response.status === 404);
      this.networkStatus = isReachable ? 'online' : 'flaky';
      this.notifyListeners();
      return isReachable;
    } catch {
      this.networkStatus = 'flaky';
      this.notifyListeners();
      return false;
    }
  }

  /**
   * Primary entry point for auto-sync. Safe to call anytime; deduplicates concurrent syncs.
   */
  public async triggerAutoSync(): Promise<void> {
    if (this.isSyncing) return;
    if (this.networkStatus === 'offline') return;

    this.isSyncing = true;
    this.notifyListeners();

    try {
      const activeSession = await indexedDbClient.getLatestActiveSession();
      if (!activeSession) {
        this.isSyncing = false;
        this.notifyListeners();
        return;
      }

      // Step 1: Ensure session metadata is synced to telemetry.diagnostic_sessions
      await this.syncSessionMetadata(activeSession);

      // Step 2: Flush pending item responses in strict chronological order
      const pendingItems = await indexedDbClient.getPendingResponses(activeSession.client_generated_id);

      for (const item of pendingItems) {
        await this.syncSingleItemWithRetry(item);
      }
    } catch (err) {
      console.error('Auto-sync execution error:', err);
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  private async syncSessionMetadata(session: CachedSessionMetadata): Promise<void> {
    if (session.synced_to_server) return;

    try {
      // In production, payload posts to Supabase telemetry.diagnostic_sessions
      // Marking sync_source = 'offline_indexeddb_replay' if items were queued offline
      const payload = {
        client_generated_id: session.client_generated_id,
        assessment_code: session.assessment_code,
        target_grade: session.target_grade,
        started_at: session.started_at,
        session_status: session.session_status,
        device_category: session.hardware_telemetry.device_category,
        primary_input_type: session.hardware_telemetry.primary_input_type,
        viewport_width: session.hardware_telemetry.viewport_width,
        viewport_height: session.hardware_telemetry.viewport_height,
        device_pixel_ratio: session.hardware_telemetry.device_pixel_ratio,
        hardware_concurrency: session.hardware_telemetry.hardware_concurrency,
        device_memory_gb: session.hardware_telemetry.device_memory_gb,
        user_agent: session.hardware_telemetry.user_agent,
        sync_source: 'offline_indexeddb_replay',
      };

      const response = await fetch('/api/telemetry/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);

      if (response && (response.ok || response.status === 409)) {
        session.synced_to_server = true;
        session.updated_at = Date.now();
        await indexedDbClient.saveSession(session);
      }
    } catch (err) {
      console.warn('Session metadata sync deferred:', err);
    }
  }

  private async syncSingleItemWithRetry(item: CachedItemResponse): Promise<boolean> {
    await indexedDbClient.updateResponseSyncStatus(item.client_queue_id, 'syncing');

    try {
      const payload = {
        session_client_id: item.session_client_id,
        item_index: item.item_index,
        target_phase: item.target_phase,
        modality: item.modality,
        mechanic_type: item.mechanic_type,
        prompt_key: item.prompt_key,
        raw_answer: item.raw_answer,
        is_correct: item.is_correct,
        first_interaction_ms: item.first_interaction_ms,
        latency_ms: item.latency_ms,
        input_pointer_type: item.input_pointer_type,
        friction_events_count: item.friction_events_count,
        micro_interactions_log: item.micro_interactions_log || [],
        client_timestamp: new Date(item.client_timestamp).toISOString(),
      };

      const response = await fetch('/api/telemetry/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);

      if (response && (response.ok || response.status === 409)) {
        // 200 OK or 409 Conflict (already recorded idempotently)
        await indexedDbClient.updateResponseSyncStatus(item.client_queue_id, 'synced');
        return true;
      } else {
        const errorMsg = response ? `HTTP ${response.status}` : 'Network unreachable';
        await indexedDbClient.updateResponseSyncStatus(item.client_queue_id, 'failed', errorMsg);
        this.scheduleExponentialBackoff(item.retry_count || 1);
        return false;
      }
    } catch (err: any) {
      await indexedDbClient.updateResponseSyncStatus(item.client_queue_id, 'failed', err?.message || 'Unknown network error');
      this.scheduleExponentialBackoff(item.retry_count || 1);
      return false;
    }
  }

  /**
   * Explicitly flushes all pending responses for a session and validates
   * that all 15 items have been successfully recorded and synced.
   */
  public async flushAllSessionResponses(sessionClientId?: string): Promise<{
    sessionClientId: string;
    totalAttempted: number;
    totalSynced: number;
    totalPending: number;
    tstAtmptCd: 'I' | 'P' | 'C' | 'N';
    tstValidCd: 'Y' | 'N';
    all15ItemsFlushed: boolean;
    isValidOdeAttempt: boolean;
  }> {
    const activeSession = sessionClientId
      ? await indexedDbClient.getSession(sessionClientId)
      : await indexedDbClient.getLatestActiveSession();

    if (!activeSession) {
      throw new Error('No active session found to flush.');
    }

    // 1. Flush metadata first
    await this.syncSessionMetadata(activeSession);

    // 2. Retrieve all pending items and sync sequentially
    const pendingItems = await indexedDbClient.getPendingResponses(activeSession.client_generated_id);
    for (const item of pendingItems) {
      await this.syncSingleItemWithRetry(item);
    }

    // 3. Post-sync verification audit from IndexedDB
    const allResponses = await indexedDbClient.getAllResponsesForSession(activeSession.client_generated_id);
    const syncedItems = allResponses.filter((r) => r.sync_status === 'synced');
    const stillPending = allResponses.filter((r) => r.sync_status !== 'synced');

    const totalAttempted = allResponses.length;
    const isComplete = totalAttempted >= 15;
    const isValid = totalAttempted >= 5 || activeSession.is_performance_task;

    const tstAtmptCd = isComplete ? 'C' : isValid ? 'P' : 'I';
    const tstValidCd = isValid ? 'Y' : 'N';

    return {
      sessionClientId: activeSession.client_generated_id,
      totalAttempted,
      totalSynced: syncedItems.length,
      totalPending: stillPending.length,
      tstAtmptCd,
      tstValidCd,
      all15ItemsFlushed: totalAttempted >= 15 && stillPending.length === 0,
      isValidOdeAttempt: tstValidCd === 'Y',
    };
  }

  private scheduleExponentialBackoff(retryCount: number): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);

    // Exponential backoff with full jitter: min(maxBackoff, base * 2^retry) * rand()
    const exponent = Math.min(retryCount, 6);
    const calculatedBackoff = Math.min(this.maxBackoffMs, this.baseBackoffMs * Math.pow(2, exponent));
    const jitteredBackoff = Math.floor(calculatedBackoff * (0.5 + Math.random() * 0.5));

    this.syncTimer = setTimeout(() => {
      this.triggerAutoSync();
    }, jitteredBackoff);
  }
}

export const offlineSyncManager = new OfflineSyncManager();

