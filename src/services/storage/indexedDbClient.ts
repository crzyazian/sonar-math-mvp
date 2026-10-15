/**
 * IndexedDB Client: Sonar Math Offline Storage Engine
 * 
 * CORE RESPONSIBILITY:
 * Primary source of truth during assessment execution. Guarantees that unstable
 * home Wi-Fi drops (e.g. at Item 4) cannot cause data loss or breach the Oregon
 * Department of Education (ODE) 5-item attemptedness validity threshold.
 */

import {
  DiagnosticSessionRecord,
  OfflineQueuedItemResponse,
  MicroInteractionEvent,
} from '../../../types/database.types';

export const DB_NAME = 'sonar_math_offline_cache';
export const DB_VERSION = 1;

export const STORES = {
  SESSIONS: 'diagnostic_sessions',
  RESPONSES: 'item_responses',
  MICRO_TELEMETRY: 'micro_telemetry_logs',
} as const;

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface CachedItemResponse extends OfflineQueuedItemResponse {
  sync_status: SyncStatus;
  last_sync_error?: string | null;
  last_sync_attempt_ms?: number | null;
}

export interface CachedSessionMetadata {
  client_generated_id: string; // Ephemeral UUID
  assessment_code: string;
  target_grade: number;
  started_at: string;
  completed_at?: string | null;
  session_status: DiagnosticSessionRecord['session_status'];
  total_items_attempted: number;
  is_performance_task: boolean;
  /** Oregon Department of Education (ODE) Official State Accountability Codes */
  tst_atmpt_cd: 'I' | 'P' | 'C' | 'N';
  tst_valid_cd: 'Y' | 'N';
  ode_validity_cleared: boolean; // >= 5 items attempted or 1 PT
  hardware_telemetry: {
    primary_input_type: string;
    device_category: string;
    pointer_coarse: boolean;
    hover_capable: boolean;
    screen_width: number;
    screen_height: number;
    viewport_width: number;
    viewport_height: number;
    device_pixel_ratio: number;
    hardware_concurrency: number;
    device_memory_gb: number;
    user_agent: string;
  };
  synced_to_server: boolean;
  server_session_id?: string | null;
  created_at: number;
  updated_at: number;
}

class IndexedDbClient {
  private dbPromise: Promise<IDBDatabase> | null = null;

  public async getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB is not supported in this runtime environment.'));
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = request.result;

        // 1. Sessions store
        if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
          const sessionStore = db.createObjectStore(STORES.SESSIONS, {
            keyPath: 'client_generated_id',
          });
          sessionStore.createIndex('by_synced', 'synced_to_server', { unique: false });
          sessionStore.createIndex('by_ode_validity', 'ode_validity_cleared', { unique: false });
        }

        // 2. Item Responses store (Write-ahead log for every answer)
        if (!db.objectStoreNames.contains(STORES.RESPONSES)) {
          const responseStore = db.createObjectStore(STORES.RESPONSES, {
            keyPath: 'client_queue_id',
          });
          responseStore.createIndex('by_session', 'session_client_id', { unique: false });
          responseStore.createIndex('by_sync_status', 'sync_status', { unique: false });
          responseStore.createIndex('by_session_and_index', ['session_client_id', 'item_index'], { unique: true });
        }

        // 3. Granular Micro-Telemetry logs (pointer movement, friction events)
        if (!db.objectStoreNames.contains(STORES.MICRO_TELEMETRY)) {
          const telemetryStore = db.createObjectStore(STORES.MICRO_TELEMETRY, {
            keyPath: 'log_id',
            autoIncrement: true,
          });
          telemetryStore.createIndex('by_session', 'session_client_id', { unique: false });
          telemetryStore.createIndex('by_item', ['session_client_id', 'item_index'], { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to initialize IndexedDB.'));
      };
    });

    return this.dbPromise;
  }

  // ==========================================================================
  // SESSION PERSISTENCE & ODE TRACKING
  // ==========================================================================

  public async saveSession(session: CachedSessionMetadata): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SESSIONS, 'readwrite');
      const store = tx.objectStore(STORES.SESSIONS);
      const req = store.put(session);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getSession(clientGeneratedId: string): Promise<CachedSessionMetadata | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SESSIONS, 'readonly');
      const store = tx.objectStore(STORES.SESSIONS);
      const req = store.get(clientGeneratedId);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async getLatestActiveSession(): Promise<CachedSessionMetadata | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SESSIONS, 'readonly');
      const store = tx.objectStore(STORES.SESSIONS);
      const req = store.openCursor(null, 'prev');

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const session = cursor.value as CachedSessionMetadata;
          if (session.session_status === 'in_progress' || session.session_status === 'initialized') {
            return resolve(session);
          }
          cursor.continue();
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ==========================================================================
  // WRITE-AHEAD ITEM RESPONSE PERSISTENCE
  // ==========================================================================

  /**
   * Persists an item response locally before or concurrently with any network dispatch.
   * Automatically updates session attempted items count and ODE validity status.
   */
  public async writeAheadItemResponse(response: CachedItemResponse): Promise<{
    totalAttempted: number;
    odeValidityCleared: boolean;
    tstAtmptCd: 'I' | 'P' | 'C' | 'N';
    tstValidCd: 'Y' | 'N';
  }> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.RESPONSES, STORES.SESSIONS], 'readwrite');
      const responseStore = tx.objectStore(STORES.RESPONSES);
      const sessionStore = tx.objectStore(STORES.SESSIONS);

      // 1. Put item response
      responseStore.put(response);

      // 2. Update session metadata and evaluate ODE validity
      const sessionReq = sessionStore.get(response.session_client_id);

      sessionReq.onsuccess = () => {
        const session: CachedSessionMetadata | undefined = sessionReq.result;
        if (session) {
          const countReq = responseStore.index('by_session').count(IDBKeyRange.only(response.session_client_id));
          
          countReq.onsuccess = () => {
            const count = countReq.result;
            session.total_items_attempted = count;
            
            // Oregon Department of Education (ODE) Official Attemptedness Logic:
            // - TstValidCd = 'Y' if >= 5 CAT items or 1 Performance Task, else 'N'
            const isValid = count >= 5 || session.is_performance_task === true;
            session.tst_valid_cd = isValid ? 'Y' : 'N';
            session.ode_validity_cleared = isValid;
            
            // - TstAtmptCd = 'C' (Complete), 'P' (Partial: >= 5), 'I' (In-progress: < 5)
            if (count >= 15) {
              session.tst_atmpt_cd = 'C';
              session.session_status = 'completed';
              session.completed_at = new Date().toISOString();
            } else if (count >= 5) {
              session.tst_atmpt_cd = 'P';
              session.session_status = 'in_progress';
            } else {
              session.tst_atmpt_cd = 'I';
              session.session_status = 'in_progress';
            }

            session.updated_at = Date.now();
            sessionStore.put(session);
          };
        }
      };

      tx.oncomplete = () => {
        this.getSession(response.session_client_id).then((updatedSession) => {
          resolve({
            totalAttempted: updatedSession?.total_items_attempted ?? 1,
            odeValidityCleared: updatedSession?.ode_validity_cleared ?? false,
            tstAtmptCd: updatedSession?.tst_atmpt_cd ?? 'I',
            tstValidCd: updatedSession?.tst_valid_cd ?? 'N',
          });
        }).catch(() => {
          resolve({ totalAttempted: 1, odeValidityCleared: false, tstAtmptCd: 'I', tstValidCd: 'N' });
        });
      };

      tx.onerror = () => reject(tx.error);
    });
  }

  public async getPendingResponses(sessionClientId?: string): Promise<CachedItemResponse[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.RESPONSES, 'readonly');
      const store = tx.objectStore(STORES.RESPONSES);
      const index = store.index('by_sync_status');
      const req = index.getAll(IDBKeyRange.only('pending'));

      req.onsuccess = () => {
        let results = (req.result || []) as CachedItemResponse[];
        if (sessionClientId) {
          results = results.filter((r) => r.session_client_id === sessionClientId);
        }
        resolve(results.sort((a, b) => a.item_index - b.item_index));
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllResponsesForSession(sessionClientId: string): Promise<CachedItemResponse[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.RESPONSES, 'readonly');
      const store = tx.objectStore(STORES.RESPONSES);
      const index = store.index('by_session');
      const req = index.getAll(IDBKeyRange.only(sessionClientId));

      req.onsuccess = () => {
        const results = (req.result || []) as CachedItemResponse[];
        resolve(results.sort((a, b) => a.item_index - b.item_index));
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async updateResponseSyncStatus(
    clientQueueId: string,
    status: SyncStatus,
    error?: string | null
  ): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.RESPONSES, 'readwrite');
      const store = tx.objectStore(STORES.RESPONSES);
      const getReq = store.get(clientQueueId);

      getReq.onsuccess = () => {
        const item: CachedItemResponse | undefined = getReq.result;
        if (item) {
          item.sync_status = status;
          item.synced = status === 'synced';
          item.last_sync_attempt_ms = Date.now();
          if (error !== undefined) {
            item.last_sync_error = error;
          }
          if (status === 'failed') {
            item.retry_count = (item.retry_count || 0) + 1;
          }
          store.put(item);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const indexedDbClient = new IndexedDbClient();
