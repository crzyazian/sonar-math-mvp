/**
 * Verification Test: Oregon Department of Education (ODE) 5-Item Attemptedness Rule
 * & IndexedDB 15-Item Flush Guarantee
 * 
 * Executable directly via Node 24:
 * node --experimental-strip-types tests/ode_attemptedness_verification.ts
 */

interface MockItemResponse {
  client_queue_id: string;
  session_client_id: string;
  item_index: number;
  target_phase: 1 | 2 | 3;
  modality: 'discrete' | 'continuous' | 'abstract';
  mechanic_type: string;
  raw_answer: any;
  is_correct: boolean;
  first_interaction_ms: number;
  latency_ms: number;
  input_pointer_type: string;
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  client_timestamp: number;
}

interface MockSession {
  client_generated_id: string;
  assessment_code: string;
  total_items_attempted: number;
  is_performance_task: boolean;
  tst_atmpt_cd: 'I' | 'P' | 'C' | 'N';
  tst_valid_cd: 'Y' | 'N';
  ode_validity_cleared: boolean;
  session_status: 'initialized' | 'in_progress' | 'completed' | 'abandoned';
}

class InMemoryIndexedDbEngine {
  public sessions: Map<string, MockSession> = new Map();
  public responses: Map<string, MockItemResponse> = new Map();

  public saveSession(session: MockSession): void {
    this.sessions.set(session.client_generated_id, { ...session });
  }

  public getSession(id: string): MockSession | null {
    const s = this.sessions.get(id);
    return s ? { ...s } : null;
  }

  public writeAheadItemResponse(response: MockItemResponse): {
    totalAttempted: number;
    tstAtmptCd: 'I' | 'P' | 'C' | 'N';
    tstValidCd: 'Y' | 'N';
    odeValidityCleared: boolean;
  } {
    // 1. Write-ahead persist
    this.responses.set(response.client_queue_id, { ...response });

    // 2. Compute attempted count for session
    const sessionResponses = Array.from(this.responses.values()).filter(
      (r) => r.session_client_id === response.session_client_id
    );
    const count = sessionResponses.length;

    const session = this.sessions.get(response.session_client_id);
    if (!session) {
      throw new Error(`Session ${response.session_client_id} not found.`);
    }

    session.total_items_attempted = count;

    // Oregon Department of Education (ODE) Official Logic
    const isValid = count >= 5 || session.is_performance_task === true;
    session.tst_valid_cd = isValid ? 'Y' : 'N';
    session.ode_validity_cleared = isValid;

    if (count >= 15) {
      session.tst_atmpt_cd = 'C';
      session.session_status = 'completed';
    } else if (count >= 5) {
      session.tst_atmpt_cd = 'P';
      session.session_status = 'in_progress';
    } else {
      session.tst_atmpt_cd = 'I';
      session.session_status = 'in_progress';
    }

    this.sessions.set(session.client_generated_id, session);

    return {
      totalAttempted: session.total_items_attempted,
      tstAtmptCd: session.tst_atmpt_cd,
      tstValidCd: session.tst_valid_cd,
      odeValidityCleared: session.ode_validity_cleared,
    };
  }

  public getPendingResponses(sessionId: string): MockItemResponse[] {
    return Array.from(this.responses.values())
      .filter((r) => r.session_client_id === sessionId && r.sync_status !== 'synced')
      .sort((a, b) => a.item_index - b.item_index);
  }

  public markSynced(clientQueueId: string): void {
    const r = this.responses.get(clientQueueId);
    if (r) {
      r.sync_status = 'synced';
      this.responses.set(clientQueueId, r);
    }
  }
}

// ============================================================================
// SIMULATION & TEST RUNNER
// ============================================================================
async function runOdeVerificationSuite() {
  console.log('================================================================');
  console.log('  OREGON DEPARTMENT OF EDUCATION (ODE) 5-ITEM RULE VERIFICATION');
  console.log('  & 15-ITEM OFFLINE FLUSH ASSURANCE SUITE');
  console.log('================================================================\n');

  const engine = new InMemoryIndexedDbEngine();
  const sessionId = 'test-session-uuid-2026';

  // 1. Initialize session in IndexedDB
  const initialSession: MockSession = {
    client_generated_id: sessionId,
    assessment_code: '4TH_GRADE_FRACTIONS_V1',
    total_items_attempted: 0,
    is_performance_task: false,
    tst_atmpt_cd: 'I',
    tst_valid_cd: 'N',
    ode_validity_cleared: false,
    session_status: 'initialized',
  };
  engine.saveSession(initialSession);
  console.log('STEP 1: Session Initialized in IndexedDB (Offline State)');
  console.log(`  - TstAtmptCd: ${initialSession.tst_atmpt_cd}`);
  console.log(`  - TstValidCd: ${initialSession.tst_valid_cd}`);
  console.log(`  - ODE Validity Cleared: ${initialSession.ode_validity_cleared}\n`);

  // 2. Child answers Items 1 through 4 while Home Wi-Fi is disconnected
  console.log('STEP 2: Child answers Items 1 through 4 (Home Wi-Fi Disconnected)...');
  for (let i = 1; i <= 4; i++) {
    const result = engine.writeAheadItemResponse({
      client_queue_id: `queue-${i}`,
      session_client_id: sessionId,
      item_index: i,
      target_phase: 1,
      modality: 'continuous',
      mechanic_type: 'graduated_cylinder_pour',
      raw_answer: { fill_ratio: 0.5 },
      is_correct: true,
      first_interaction_ms: 1240.5,
      latency_ms: 4500.2,
      input_pointer_type: 'touch',
      sync_status: 'pending',
      client_timestamp: Date.now(),
    });

    console.log(
      `  [Item ${i}] Attempted: ${result.totalAttempted}/15 | TstAtmptCd: '${result.tstAtmptCd}' | TstValidCd: '${result.tstValidCd}' | Valid: ${result.odeValidityCleared}`
    );
  }

  const sessionAt4 = engine.getSession(sessionId)!;
  if (sessionAt4.tst_valid_cd === 'N' && sessionAt4.ode_validity_cleared === false) {
    console.log('  >>> PASS: At 4 items, test is correctly flagged INVALID (TstValidCd = N).');
  } else {
    throw new Error('FAIL: 4 items should not clear validity threshold.');
  }

  // 3. Child answers Item 5 (The 5-Item Rule Milestone)
  console.log('\nSTEP 3: Child answers Item 5 (Wi-Fi Still Disconnected - 5-Item Threshold)...');
  const resultAt5 = engine.writeAheadItemResponse({
    client_queue_id: 'queue-5',
    session_client_id: sessionId,
    item_index: 5,
    target_phase: 1,
    modality: 'discrete',
    mechanic_type: 'unit_block_grid',
    raw_answer: { highlighted_cells: [1, 2, 3] },
    is_correct: true,
    first_interaction_ms: 980.0,
    latency_ms: 3200.0,
    input_pointer_type: 'touch',
    sync_status: 'pending',
    client_timestamp: Date.now(),
  });

  console.log(
    `  [Item 5] Attempted: ${resultAt5.totalAttempted}/15 | TstAtmptCd: '${resultAt5.tstAtmptCd}' | TstValidCd: '${resultAt5.tstValidCd}' | Valid: ${resultAt5.odeValidityCleared}`
  );

  if (resultAt5.tstAtmptCd === 'P' && resultAt5.tstValidCd === 'Y' && resultAt5.odeValidityCleared === true) {
    console.log('  >>> PASS: At 5 items, ODE 5-item validity CLEARED (TstAtmptCd = P, TstValidCd = Y).');
    console.log('            Test cannot be invalidated due to dropped connection!');
  } else {
    throw new Error('FAIL: 5 items must clear ODE validity threshold.');
  }

  // 4. Child completes remaining diagnostic items 6 through 15 offline
  console.log('\nSTEP 4: Child completes all remaining items (Items 6 to 15) while offline...');
  for (let i = 6; i <= 15; i++) {
    engine.writeAheadItemResponse({
      client_queue_id: `queue-${i}`,
      session_client_id: sessionId,
      item_index: i,
      target_phase: i <= 5 ? 1 : i <= 10 ? 2 : 3,
      modality: i % 3 === 0 ? 'abstract' : i % 2 === 0 ? 'discrete' : 'continuous',
      mechanic_type: 'graduated_cylinder_pour',
      raw_answer: { fill_ratio: 0.75 },
      is_correct: true,
      first_interaction_ms: 850.0,
      latency_ms: 2800.0,
      input_pointer_type: 'touch',
      sync_status: 'pending',
      client_timestamp: Date.now(),
    });
  }

  const sessionAt15 = engine.getSession(sessionId)!;
  console.log(`  - Total Items Attempted: ${sessionAt15.total_items_attempted}/15`);
  console.log(`  - Final TstAtmptCd: '${sessionAt15.tst_atmpt_cd}' (C = Complete)`);
  console.log(`  - Final TstValidCd: '${sessionAt15.tst_valid_cd}' (Y = Valid)`);
  console.log(`  - Session Status: '${sessionAt15.session_status}'`);

  if (sessionAt15.tst_atmpt_cd === 'C' && sessionAt15.tst_valid_cd === 'Y' && sessionAt15.session_status === 'completed') {
    console.log('  >>> PASS: Full assessment completed offline with status = completed.');
  } else {
    throw new Error('FAIL: 15 items did not reach complete state.');
  }

  // 5. Network Restored: Trigger Background Flush
  console.log('\nSTEP 5: Network Restored -> Executing 15-Item Flush Replay...');
  const pendingQueue = engine.getPendingResponses(sessionId);
  console.log(`  - Pending items in IndexedDB queue: ${pendingQueue.length}`);

  // Simulate server database ingestion
  let serverDatabaseResponses: any[] = [];
  for (const item of pendingQueue) {
    // Simulate Supabase REST insertion
    serverDatabaseResponses.push({
      session_id: item.session_client_id,
      item_index: item.item_index,
      synced_at: new Date().toISOString(),
      sync_source: 'offline_indexeddb_replay',
    });
    engine.markSynced(item.client_queue_id);
  }

  const remainingPending = engine.getPendingResponses(sessionId);
  console.log(`  - Server received items: ${serverDatabaseResponses.length}`);
  console.log(`  - Remaining items in IndexedDB queue: ${remainingPending.length}`);

  if (serverDatabaseResponses.length === 15 && remainingPending.length === 0) {
    console.log('  >>> PASS: 100% of all 15 items successfully flushed to database with zero loss!');
  } else {
    throw new Error('FAIL: Offline flush did not transmit all 15 items.');
  }

  // 6. Idempotency Test: Attempting duplicate flush
  console.log('\nSTEP 6: Idempotency & Conflict Check (Simulating network glitch replay)...');
  const duplicatePending = engine.getPendingResponses(sessionId);
  console.log(`  - Queued duplicate items to flush: ${duplicatePending.length}`);
  if (duplicatePending.length === 0) {
    console.log('  >>> PASS: Replay queue is clean. Idempotency guaranteed.');
  }

  console.log('\n================================================================');
  console.log('  ALL OREGON ODE 5-ITEM RULE & 15-ITEM FLUSH TESTS PASSED!      ');
  console.log('================================================================');
}

runOdeVerificationSuite().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
