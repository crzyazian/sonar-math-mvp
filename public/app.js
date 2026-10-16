/**
 * Sonar Math MVP: Complete Application & Finite State Machine Engine
 * 
 * Features:
 * - Home Landing Page: Welcoming introduction, diagnostic purpose, 3 training modalities.
 * - Educator / Admin Results Portal: Live statistics, student submission table, CSV/JSON export.
 * - Screens 1-4: Onboarding (Grade router, modality self-perception, theme, input calibration).
 * - Screens 5-19: 15-Question Diagnostic Battery (Phases 1, 2, 3) across 5 interactive mechanics.
 * - Screen 20: Post-Assessment Page with Metacognitive Delta Calculation.
 * - Interactive Missed Questions Reviewer: Pop-up explanations across all 3 training modalities.
 */

// 1. Application State & Storage
const AppState = {
  currentScreenIndex: 'home', // 'home' | 'admin' | 1..20
  isDevMode: false,
  sessionClientId: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'sess_' + Math.random().toString(36).substring(2, 11),
  
  // Onboarding Profile
  onboarding: {
    selectedGrade: 4,
    preferredModality: 'discrete', // 'discrete' | 'continuous' | 'abstract'
    interestTheme: 'space',       // 'space' | 'ocean' | 'culinary' | 'sports'
    calibrationTapsCount: 0,
    calibrationPassed: false,
    audioTested: false,
    baselineMotorLatencyMs: 0
  },

  // Active Diagnostic Item State
  activeQuestionIndex: 0, // 0 to 14
  activeComponent: null,
  mountTimeMs: performance.now(),
  firstInteractionMs: 0,
  currentLatencyMs: 0,
  frictionEventsCount: 0,
  pointerType: 'unknown',
  snapApplied: false,
  currentValueDisplay: '',
  isCurrentAnswerCorrect: false,

  // Responses & ODE State
  attemptedItems: new Map(), // item_index -> response object
  isSimulatedOffline: false,
  totalItemsAttempted: 0,
  tstAtmptCd: 'I',
  tstValidCd: 'N',
  odeValidityCleared: false,

  // Post-Assessment Reflection State
  selectedMisconceptionTag: null,
  retryComponent: null,
  isomorphicRetryAttempted: false,
  isomorphicRetryCorrect: false,
};

// 2. Load Questions from questions.data.js (or fallback)
const QUESTIONS_SOURCE = (window.SONAR_QUESTIONS && window.SONAR_QUESTIONS.questions) || [];

// Helper: Speak Text Aloud via Web Speech API
function speakPromptAloud(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.05;
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}

// Helper: Save Completed Session to LocalStorage for Admin Portal
function persistCompletedSessionLocally() {
  try {
    const sessions = JSON.parse(localStorage.getItem('sonar_assessment_sessions') || '[]');
    let discreteCorrect = 0, discreteTotal = 0;
    let continuousCorrect = 0, continuousTotal = 0;
    let abstractCorrect = 0, abstractTotal = 0;
    let totalScore = 0;

    AppState.attemptedItems.forEach((item) => {
      if (item.is_correct) totalScore++;
      if (item.modality === 'discrete') {
        discreteTotal++;
        if (item.is_correct) discreteCorrect++;
      } else if (item.modality === 'continuous') {
        continuousTotal++;
        if (item.is_correct) continuousCorrect++;
      } else if (item.modality === 'abstract') {
        abstractTotal++;
        if (item.is_correct) abstractCorrect++;
      }
    });

    const perfMap = {
      discrete: discreteTotal > 0 ? Math.round((discreteCorrect / discreteTotal) * 100) : 0,
      continuous: continuousTotal > 0 ? Math.round((continuousCorrect / continuousTotal) * 100) : 0,
      abstract: abstractTotal > 0 ? Math.round((abstractCorrect / abstractTotal) * 100) : 0
    };

    const pref = AppState.onboarding.preferredModality;
    const prefScore = perfMap[pref] || 0;
    const nonPrefKeys = ['discrete', 'continuous', 'abstract'].filter((k) => k !== pref);
    const nonPrefScore = Math.round(((perfMap[nonPrefKeys[0]] || 0) + (perfMap[nonPrefKeys[1]] || 0)) / 2);
    const deltaCal = prefScore - nonPrefScore;

    const sessionSummary = {
      sessionId: AppState.sessionClientId,
      timestamp: new Date().toLocaleString(),
      grade: AppState.onboarding.selectedGrade,
      preferredModality: pref,
      theme: AppState.onboarding.interestTheme,
      score: totalScore,
      totalItems: AppState.totalItemsAttempted,
      accuracyPct: Math.round((totalScore / Math.max(1, AppState.totalItemsAttempted)) * 100),
      tstAtmptCd: AppState.tstAtmptCd,
      tstValidCd: AppState.tstValidCd,
      deltaCal: deltaCal,
      baselineLatencyMs: AppState.onboarding.baselineMotorLatencyMs,
      pointerType: AppState.pointerType,
      responses: Array.from(AppState.attemptedItems.values())
    };

    // Prepend new session
    sessions.unshift(sessionSummary);
    localStorage.setItem('sonar_assessment_sessions', JSON.stringify(sessions));
  } catch (err) {
    console.warn('[Storage] Failed to save session summary locally:', err);
  }
}

// Helper: Open Admin Gatekeeper Passcode Modal
function openAdminGatekeeperModal() {
  const adminOverlay = document.getElementById('admin-gatekeeper-overlay');
  const adminInput = document.getElementById('input-admin-passcode');
  const adminError = document.getElementById('admin-gate-error');
  if (adminError) adminError.style.display = 'none';
  if (adminInput) {
    adminInput.value = '';
    adminInput.style.borderColor = 'var(--border-subtle)';
  }
  if (adminOverlay) {
    adminOverlay.style.display = 'flex';
    setTimeout(() => adminInput && adminInput.focus(), 100);
  }
}

// ============================================================================
// 3. FINITE STATE MACHINE (FSM) CONTROLLER
// ============================================================================

const FSM = {
  goToScreen(target) {
    AppState.currentScreenIndex = target;

    // Hide all screens
    document.querySelectorAll('.fsm-screen').forEach((el) => el.classList.remove('is-active'));
    const progressWrapper = document.getElementById('step-progress-wrapper');
    const readAloudBtn = document.getElementById('btn-read-aloud');
    const progressFill = document.getElementById('step-progress-fill');
    const counterText = document.getElementById('step-counter-text');

    if (target === 'home') {
      if (progressWrapper) progressWrapper.style.display = 'none';
      if (readAloudBtn) readAloudBtn.style.display = 'none';
      document.getElementById('screen-home').classList.add('is-active');
    }
    else if (target === 'admin') {
      if (sessionStorage.getItem('sonar_admin_auth') !== 'true') {
        openAdminGatekeeperModal();
        return;
      }
      if (progressWrapper) progressWrapper.style.display = 'none';
      if (readAloudBtn) readAloudBtn.style.display = 'none';
      document.getElementById('screen-admin-dashboard').classList.add('is-active');
      renderAdminDashboard();
    }
    else if (target === 1) {
      if (progressWrapper) progressWrapper.style.display = 'flex';
      if (counterText) counterText.textContent = `Screen 1 of 20: Grade Selection`;
      if (progressFill) progressFill.style.width = `5%`;
      if (readAloudBtn) readAloudBtn.style.display = 'none';
      document.getElementById('screen-1-grade').classList.add('is-active');
    }
    else if (target === 2) {
      if (progressWrapper) progressWrapper.style.display = 'flex';
      if (counterText) counterText.textContent = `Screen 2 of 20: Modality Calibration`;
      if (progressFill) progressFill.style.width = `10%`;
      if (readAloudBtn) readAloudBtn.style.display = 'none';
      document.getElementById('screen-2-modality').classList.add('is-active');
    }
    else if (target === 3) {
      if (progressWrapper) progressWrapper.style.display = 'flex';
      if (counterText) counterText.textContent = `Screen 3 of 20: Lab Theme`;
      if (progressFill) progressFill.style.width = `15%`;
      if (readAloudBtn) readAloudBtn.style.display = 'none';
      document.getElementById('screen-3-theme').classList.add('is-active');
    }
    else if (target === 4) {
      if (progressWrapper) progressWrapper.style.display = 'flex';
      if (counterText) counterText.textContent = `Screen 4 of 20: Device Calibration`;
      if (progressFill) progressFill.style.width = `20%`;
      if (readAloudBtn) readAloudBtn.style.display = 'none';
      document.getElementById('screen-4-calibration').classList.add('is-active');
    }
    else if (typeof target === 'number' && target >= 5 && target <= 19) {
      if (progressWrapper) progressWrapper.style.display = 'flex';
      const qIndex = target - 5;
      const qNum = qIndex + 1;
      const q = QUESTIONS_SOURCE[qIndex] || QUESTIONS_SOURCE[0];
      const phaseNames = { 1: 'Fluency', 2: 'Continuous Transfer', 3: 'Mixed & Regrouping' };

      const pct = Math.round((target / 20) * 100);
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (counterText) {
        counterText.textContent = `Screen ${target} of 20 • Item ${qNum}/15 (${phaseNames[q.target_phase]})`;
      }
      if (readAloudBtn) readAloudBtn.style.display = 'inline-flex';
      document.getElementById('screen-diagnostic').classList.add('is-active');

      mountDiagnosticQuestion(qIndex);
    }
    else if (target === 20) {
      if (progressWrapper) progressWrapper.style.display = 'none';
      if (readAloudBtn) readAloudBtn.style.display = 'none';
      document.getElementById('screen-20-postcheck').classList.add('is-active');

      persistCompletedSessionLocally();
      renderScreen20Delta();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// ============================================================================
// 4. INTERACTIVE MANIPULATIVE COMPONENTS
// ============================================================================

/** Component 1: Continuous Graduated Cylinder Fluid Canvas (±2% Snap) */
class CylinderComponent {
  constructor(container, q) {
    this.container = container;
    this.q = q;
    this.config = q.mechanic_payload?.config || {
      max_capacity_ml: 1000,
      tick_interval_ml: 50,
      major_ticks: [0, 250, 500, 750, 1000],
      target_ratio: 0.75,
      snap_tolerance_ratio: 0.02,
      unit_label: 'mL',
      liquid_color: '#2563EB'
    };

    this.currentRatio = 0.0;
    this.isDragging = false;
    this.wavePhase = 0;
    this.snapTolerance = this.config.snap_tolerance_ratio || 0.02;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'graduated-cylinder-canvas';
    this.canvas.style.touchAction = 'none';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '340px';
    this.ctx = this.canvas.getContext('2d');
    this.container.appendChild(this.canvas);

    this.onResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.initPointerEvents();
    this.handleResize();
    this.startLoop();
  }

  handleResize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = 340;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  initPointerEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.isDragging = true;
      AppState.pointerType = e.pointerType || 'mouse';
      if (AppState.firstInteractionMs === 0) {
        AppState.firstInteractionMs = performance.now() - AppState.mountTimeMs;
      }
      this.updateFromPointer(e.clientY);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      this.updateFromPointer(e.clientY);
    });

    const stopDrag = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.applySnap();
      this.syncTelemetry();
    };

    this.canvas.addEventListener('pointerup', stopDrag);
    this.canvas.addEventListener('pointercancel', stopDrag);
  }

  updateFromPointer(clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const paddingY = 40;
    const cylinderHeight = rect.height - paddingY * 2;
    const relY = clientY - rect.top - paddingY;
    const rawRatio = 1.0 - (relY / cylinderHeight);
    this.currentRatio = Math.max(0.0, Math.min(1.0, rawRatio));
    this.syncTelemetry();
  }

  applySnap() {
    const target = this.config.target_ratio;
    if (Math.abs(this.currentRatio - target) <= this.snapTolerance) {
      this.currentRatio = target;
      AppState.snapApplied = true;
    } else {
      AppState.snapApplied = false;
    }
  }

  syncTelemetry() {
    const ml = Math.round(this.currentRatio * this.config.max_capacity_ml);
    AppState.currentValueDisplay = `${(this.currentRatio * 100).toFixed(0)}% (${ml} ${this.config.unit_label || 'mL'})`;
    const target = this.config.target_ratio;
    AppState.isCurrentAnswerCorrect = Math.abs(this.currentRatio - target) <= this.snapTolerance;
    updateHUD();
  }

  startLoop() {
    const animate = () => {
      this.wavePhase += 0.05;
      this.render();
      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    const cylW = Math.min(180, w * 0.4);
    const cylH = h - 80;
    const cylX = (w - cylW) / 2;
    const cylY = 40;

    // Glass Background
    ctx.fillStyle = 'rgba(30, 41, 59, 0.4)';
    ctx.fillRect(cylX, cylY, cylW, cylH);

    // Liquid Fill
    const fillH = cylH * this.currentRatio;
    const fillY = cylY + cylH - fillH;

    if (this.currentRatio > 0.005) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cylX, cylY, cylW, cylH);
      ctx.clip();

      const liquidColor = this.config.liquid_color || '#3B82F6';
      ctx.fillStyle = liquidColor;
      ctx.beginPath();
      ctx.moveTo(cylX, cylY + cylH);
      ctx.lineTo(cylX, fillY);

      // Subtle Meniscus Wave
      const waveAmp = this.isDragging ? 3 : 1;
      for (let x = cylX; x <= cylX + cylW; x += 10) {
        const yWave = fillY + Math.sin((x - cylX) * 0.08 + this.wavePhase) * waveAmp;
        ctx.lineTo(x, yWave);
      }
      ctx.lineTo(cylX + cylW, cylY + cylH);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Tick Markings
    const ticks = this.config.major_ticks || [0, 250, 500, 750, 1000];
    const maxVal = this.config.max_capacity_ml || 1000;

    ticks.forEach((tickVal) => {
      const ratio = tickVal / maxVal;
      const tickY = cylY + cylH - (cylH * ratio);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cylX + cylW - 20, tickY);
      ctx.lineTo(cylX + cylW, tickY);
      ctx.stroke();

      ctx.fillStyle = '#CBD5E1';
      ctx.font = '600 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${tickVal}`, cylX + cylW + 8, tickY + 4);
    });

    // Glass Borders
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cylX, cylY);
    ctx.lineTo(cylX, cylY + cylH);
    ctx.lineTo(cylX + cylW, cylY + cylH);
    ctx.lineTo(cylX + cylW, cylY);
    ctx.stroke();

    // Interactive Drag Handle
    const handleY = Math.max(cylY, Math.min(cylY + cylH, fillY));
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cylX - 18, handleY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.font = '800 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↕', cylX - 18, handleY + 4);
  }

  destroy() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.onResize);
    this.canvas.remove();
  }
}

/** Component 2: Discrete Unit Block Area Grid (Tap & Drag Shading / Cross-Out) */
class GridComponent {
  constructor(container, q) {
    this.container = container;
    this.q = q;
    this.config = q.mechanic_payload?.config || {
      grid_rows: 3,
      grid_columns: 4,
      total_cells: 12,
      target_cell_count: 8,
      action_mode: 'select_and_shade',
      initial_highlighted_cells: []
    };

    this.rows = this.config.grid_rows || 3;
    this.cols = this.config.grid_columns || 4;
    this.actionMode = this.config.action_mode || 'select_and_shade';

    this.highlighted = new Set(this.config.initial_highlighted_cells || []);
    this.crossedOut = new Set();
    this.isPointerDown = false;

    this.root = document.createElement('div');
    this.root.className = 'grid-manipulative-root';
    this.root.style.display = 'flex';
    this.root.style.justifyContent = 'center';
    this.root.style.padding = '24px';
    this.container.appendChild(this.root);

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'discrete-block-grid';
    this.gridEl.style.display = 'grid';
    this.gridEl.style.gridTemplateColumns = `repeat(${this.cols}, minmax(54px, 72px))`;
    this.gridEl.style.gridTemplateRows = `repeat(${this.rows}, minmax(54px, 72px))`;
    this.gridEl.style.gap = '8px';
    this.gridEl.style.touchAction = 'none';
    this.root.appendChild(this.gridEl);

    this.cells = [];
    this.renderBlocks();
    this.initEvents();
    this.syncTelemetry();
  }

  renderBlocks() {
    const total = this.rows * this.cols;
    for (let i = 0; i < total; i++) {
      const cell = document.createElement('div');
      cell.className = 'unit-block-cell';
      cell.setAttribute('data-index', i);
      cell.style.width = '100%';
      cell.style.height = '100%';
      cell.style.minHeight = '54px';
      cell.style.borderRadius = '8px';
      cell.style.border = '2px solid rgba(255, 255, 255, 0.2)';
      cell.style.background = 'rgba(15, 23, 42, 0.7)';
      cell.style.cursor = 'pointer';
      cell.style.position = 'relative';
      cell.style.transition = 'all 0.15s ease';

      if (this.highlighted.has(i)) {
        cell.classList.add('is-shaded');
        cell.style.background = '#3B82F6';
        cell.style.borderColor = '#60A5FA';
      }

      this.gridEl.appendChild(cell);
      this.cells.push(cell);
    }
  }

  initEvents() {
    const handleAction = (cell, e) => {
      AppState.pointerType = e.pointerType || 'mouse';
      if (AppState.firstInteractionMs === 0) {
        AppState.firstInteractionMs = performance.now() - AppState.mountTimeMs;
      }

      const idx = parseInt(cell.getAttribute('data-index'), 10);
      if (this.actionMode === 'cross_out') {
        if (this.crossedOut.has(idx)) {
          this.crossedOut.delete(idx);
          cell.innerHTML = '';
        } else {
          this.crossedOut.add(idx);
          cell.innerHTML = `
            <svg viewBox="0 0 40 40" style="position:absolute; inset:0; width:100%; height:100%; stroke:#EF4444; stroke-width:3;">
              <line x1="6" y1="6" x2="34" y2="34" />
              <line x1="34" y1="6" x2="6" y2="34" />
            </svg>
          `;
        }
      } else {
        if (this.highlighted.has(idx)) {
          this.highlighted.delete(idx);
          cell.classList.remove('is-shaded');
          cell.style.background = 'rgba(15, 23, 42, 0.7)';
          cell.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        } else {
          this.highlighted.add(idx);
          cell.classList.add('is-shaded');
          cell.style.background = '#3B82F6';
          cell.style.borderColor = '#60A5FA';
        }
      }
      this.syncTelemetry();
    };

    this.cells.forEach((cell) => {
      cell.addEventListener('pointerdown', (e) => {
        this.isPointerDown = true;
        handleAction(cell, e);
      });
      cell.addEventListener('pointerenter', (e) => {
        if (this.isPointerDown) handleAction(cell, e);
      });
    });

    window.addEventListener('pointerup', () => { this.isPointerDown = false; });
  }

  syncTelemetry() {
    const total = this.rows * this.cols;
    let active = 0;
    if (this.actionMode === 'cross_out') {
      const initial = this.config.initial_highlighted_cells?.length || total;
      active = initial - this.crossedOut.size;
      AppState.currentValueDisplay = `${active} active blocks`;
    } else {
      active = this.highlighted.size;
      AppState.currentValueDisplay = `${active} / ${total} shaded`;
    }

    const targetCount = this.config.target_cell_count || 1;
    AppState.isCurrentAnswerCorrect = (active === targetCount);
    updateHUD();
  }

  destroy() {
    this.root.remove();
  }
}

/** Component 3: Continuous Number Line Slider Component (±2.5% Snap) */
class NumberLineSliderComponent {
  constructor(container, q) {
    this.container = container;
    this.q = q;
    this.config = q.mechanic_payload?.config || {
      min_value: 0.0,
      max_value: 1.0,
      step_fraction: { numerator: 1, denominator: 8 },
      target_decimal: 0.625,
      snap_tolerance: 0.025
    };

    this.min = this.config.min_value;
    this.max = this.config.max_value;
    this.target = this.config.target_decimal;
    this.step = (this.config.step_fraction?.numerator || 1) / (this.config.step_fraction?.denominator || 8);
    this.currentVal = this.min;
    this.isDragging = false;

    this.root = document.createElement('div');
    this.root.className = 'number-line-container';
    this.container.appendChild(this.root);

    this.trackWrapper = document.createElement('div');
    this.trackWrapper.className = 'number-line-track-wrapper';
    this.root.appendChild(this.trackWrapper);

    this.axis = document.createElement('div');
    this.axis.className = 'number-line-axis';
    this.trackWrapper.appendChild(this.axis);

    this.ticksContainer = document.createElement('div');
    this.ticksContainer.className = 'number-line-ticks-container';
    this.trackWrapper.appendChild(this.ticksContainer);

    this.renderTicks();

    this.thumb = document.createElement('div');
    this.thumb.className = 'nl-slider-thumb';
    this.thumb.innerHTML = `
      <div class="nl-callout" id="nl-callout-bubble">${this.currentVal.toFixed(2)}</div>
      <div style="width:12px; height:12px; background:#3B82F6; border-radius:50%;"></div>
    `;
    this.trackWrapper.appendChild(this.thumb);

    this.initEvents();
    this.updateThumbPosition();
    this.syncTelemetry();
  }

  renderTicks() {
    const range = this.max - this.min;
    const numSteps = Math.round(range / this.step);

    for (let i = 0; i <= numSteps; i++) {
      const val = this.min + i * this.step;
      const pct = ((val - this.min) / range) * 100;

      const tick = document.createElement('div');
      const isMajor = (i === 0 || i === numSteps || Math.abs(val - Math.round(val)) < 0.001);
      tick.className = `nl-tick ${isMajor ? 'major' : 'minor'}`;
      tick.style.left = `${pct}%`;
      this.ticksContainer.appendChild(tick);

      if (isMajor) {
        const label = document.createElement('div');
        label.className = 'nl-label';
        label.style.left = `${pct}%`;
        label.textContent = Number.isInteger(val) ? val.toString() : val.toFixed(1);
        this.ticksContainer.appendChild(label);
      }
    }
  }

  initEvents() {
    const onMove = (clientX) => {
      if (!this.isDragging) return;
      const rect = this.trackWrapper.getBoundingClientRect();
      const rawPct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      let val = this.min + rawPct * (this.max - this.min);

      const nearestStep = Math.round((val - this.min) / this.step);
      const snappedVal = this.min + nearestStep * this.step;
      if (Math.abs(val - snappedVal) <= (this.config.snap_tolerance || 0.025)) {
        val = snappedVal;
        AppState.snapApplied = true;
      } else {
        AppState.snapApplied = false;
      }

      this.currentVal = Math.max(this.min, Math.min(this.max, val));
      this.updateThumbPosition();
      this.syncTelemetry();
    };

    this.thumb.addEventListener('pointerdown', (e) => {
      this.thumb.setPointerCapture(e.pointerId);
      this.isDragging = true;
      AppState.pointerType = e.pointerType || 'mouse';
      if (AppState.firstInteractionMs === 0) {
        AppState.firstInteractionMs = performance.now() - AppState.mountTimeMs;
      }
    });

    this.thumb.addEventListener('pointermove', (e) => onMove(e.clientX));
    const stop = () => { this.isDragging = false; };
    this.thumb.addEventListener('pointerup', stop);
    this.thumb.addEventListener('pointercancel', stop);

    this.trackWrapper.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      onMove(e.clientX);
    });
  }

  updateThumbPosition() {
    const range = this.max - this.min;
    const pct = ((this.currentVal - this.min) / range) * 100;
    this.thumb.style.left = `${pct}%`;
    const callout = document.getElementById('nl-callout-bubble');
    if (callout) callout.textContent = this.currentVal.toFixed(2);
  }

  syncTelemetry() {
    AppState.currentValueDisplay = `${this.currentVal.toFixed(3)}`;
    const tol = this.config.snap_tolerance || 0.025;
    AppState.isCurrentAnswerCorrect = Math.abs(this.currentVal - this.target) <= tol;
    updateHUD();
  }

  destroy() {
    this.root.remove();
  }
}

/** Component 4: High-Touch Multiple Choice Option Cards */
class MultipleChoiceComponent {
  constructor(container, q) {
    this.container = container;
    this.q = q;
    this.options = q.mechanic_payload?.config?.options || [];
    this.selectedId = null;

    this.grid = document.createElement('div');
    this.grid.className = 'mc-grid';
    this.container.appendChild(this.grid);

    this.letters = ['A', 'B', 'C', 'D'];
    this.cards = [];
    this.render();
  }

  render() {
    this.options.forEach((opt, idx) => {
      const card = document.createElement('div');
      card.className = 'mc-card';
      card.setAttribute('data-id', opt.id);

      card.innerHTML = `
        <div class="mc-letter-badge">${this.letters[idx] || idx + 1}</div>
        <div class="mc-text-content">${opt.text}</div>
      `;

      card.addEventListener('pointerdown', (e) => {
        AppState.pointerType = e.pointerType || 'mouse';
        if (AppState.firstInteractionMs === 0) {
          AppState.firstInteractionMs = performance.now() - AppState.mountTimeMs;
        }

        this.cards.forEach((c) => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        this.selectedId = opt.id;
        this.syncTelemetry();
      });

      this.grid.appendChild(card);
      this.cards.push(card);
    });
  }

  syncTelemetry() {
    AppState.currentValueDisplay = `Option ${this.selectedId || 'None'}`;
    const targetMatch = this.q.correct_answer?.exact_match;
    AppState.isCurrentAnswerCorrect = (this.selectedId === targetMatch);
    updateHUD();
  }

  destroy() {
    this.grid.remove();
  }
}

/** Component 5: Numeric Fraction Box Input */
class NumericFractionInputComponent {
  constructor(container, q) {
    this.container = container;
    this.q = q;
    this.config = q.mechanic_payload?.config || {
      require_simplified: false,
      allow_mixed_number: false,
      target_numerator: 9,
      target_denominator: 12
    };

    this.root = document.createElement('div');
    this.root.className = 'fraction-input-container';
    this.container.appendChild(this.root);

    if (this.config.allow_mixed_number) {
      this.wholeInput = document.createElement('input');
      this.wholeInput.className = 'whole-input';
      this.wholeInput.type = 'number';
      this.wholeInput.placeholder = 'W';
      this.wholeInput.inputMode = 'numeric';
      this.root.appendChild(this.wholeInput);
    }

    const box = document.createElement('div');
    box.className = 'fraction-box';

    this.numInput = document.createElement('input');
    this.numInput.className = 'fraction-input';
    this.numInput.type = 'number';
    this.numInput.placeholder = 'Num';
    this.numInput.inputMode = 'numeric';
    box.appendChild(this.numInput);

    const line = document.createElement('div');
    line.className = 'fraction-line';
    box.appendChild(line);

    this.denInput = document.createElement('input');
    this.denInput.className = 'fraction-input';
    this.denInput.type = 'number';
    this.denInput.placeholder = 'Den';
    this.denInput.inputMode = 'numeric';
    box.appendChild(this.denInput);

    this.root.appendChild(box);
    this.initEvents();
  }

  initEvents() {
    const onType = () => {
      AppState.pointerType = 'keyboard';
      if (AppState.firstInteractionMs === 0) {
        AppState.firstInteractionMs = performance.now() - AppState.mountTimeMs;
      }
      this.syncTelemetry();
    };

    this.numInput.addEventListener('input', onType);
    this.denInput.addEventListener('input', onType);
    if (this.wholeInput) this.wholeInput.addEventListener('input', onType);

    this.numInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        this.denInput.focus();
      }
    });
  }

  syncTelemetry() {
    const num = parseInt(this.numInput.value, 10);
    const den = parseInt(this.denInput.value, 10);
    const whole = this.wholeInput ? parseInt(this.wholeInput.value, 10) : 0;

    let display = `${num || 0}/${den || 0}`;
    if (this.wholeInput && whole > 0) display = `${whole} ${display}`;
    AppState.currentValueDisplay = display;

    let correct = false;
    if (this.config.allow_mixed_number && whole > 0) {
      const targetW = this.config.target_whole || 0;
      const targetN = this.config.target_numerator;
      const targetD = this.config.target_denominator;
      correct = (whole === targetW && num === targetN && den === targetD);
    } else {
      const targetN = this.config.target_numerator;
      const targetD = this.config.target_denominator;
      const val = den > 0 ? num / den : -1;
      const targetVal = targetD > 0 ? targetN / targetD : -2;
      correct = Math.abs(val - targetVal) < 0.001;
    }

    AppState.isCurrentAnswerCorrect = correct;
    updateHUD();
  }

  destroy() {
    this.root.remove();
  }
}

// ============================================================================
// 5. MOUNT DIAGNOSTIC QUESTION (SCREENS 5 TO 19)
// ============================================================================

function mountDiagnosticQuestion(index) {
  AppState.activeQuestionIndex = index;
  AppState.mountTimeMs = performance.now();
  AppState.firstInteractionMs = 0;
  AppState.frictionEventsCount = 0;
  AppState.snapApplied = false;
  AppState.currentValueDisplay = '';
  AppState.isCurrentAnswerCorrect = false;

  const modalityFriendly = {
    continuous: '🧪 Water & Sliders',
    discrete: '🟦 Blocks & Grids',
    abstract: '🔢 Numbers & Equations'
  };
  document.getElementById('prompt-badge').textContent = modalityFriendly[q.modality] || 'Math Challenge';
  document.getElementById('question-progress-badge').textContent = `Question ${q.item_index} of 15`;
  document.getElementById('prompt-title').textContent = q.prompt_text;
  document.getElementById('prompt-subtitle').textContent = q.sub_text || 'Select or adjust your response.';

  const viewport = document.getElementById('canvas-viewport');
  if (AppState.activeComponent) {
    AppState.activeComponent.destroy();
    AppState.activeComponent = null;
  }
  viewport.innerHTML = '';

  const mType = q.mechanic_type;
  if (mType === 'graduated_cylinder_pour') {
    AppState.activeComponent = new CylinderComponent(viewport, q);
  } else if (mType === 'unit_block_grid') {
    AppState.activeComponent = new GridComponent(viewport, q);
  } else if (mType === 'number_line_slider') {
    AppState.activeComponent = new NumberLineSliderComponent(viewport, q);
  } else if (mType === 'multiple_choice') {
    AppState.activeComponent = new MultipleChoiceComponent(viewport, q);
  } else if (mType === 'numeric_fraction_input') {
    AppState.activeComponent = new NumericFractionInputComponent(viewport, q);
  }

  updateHUD();
}

// ============================================================================
// 6. SUBMISSION & OREGON ODE STATE ENGINE
// ============================================================================

function submitCurrentQuestion() {
  const q = QUESTIONS_SOURCE[AppState.activeQuestionIndex];
  const responseRecord = {
    item_index: q.item_index,
    target_phase: q.target_phase,
    modality: q.modality,
    prompt: q.prompt_text,
    value: AppState.currentValueDisplay,
    is_correct: AppState.isCurrentAnswerCorrect,
    first_interaction_ms: Number(AppState.firstInteractionMs.toFixed(1)),
    latency_ms: Number((performance.now() - AppState.mountTimeMs).toFixed(1)),
    pointer_type: AppState.pointerType,
    friction_events: AppState.frictionEventsCount,
    timestamp: new Date().toLocaleTimeString(),
    synced: !AppState.isSimulatedOffline,
    metacognitive_feedback: null,
  };

  AppState.attemptedItems.set(q.item_index, responseRecord);
  AppState.totalItemsAttempted = AppState.attemptedItems.size;

  // Oregon ODE Attemptedness State
  if (AppState.totalItemsAttempted >= 15) {
    AppState.tstAtmptCd = 'C';
    AppState.tstValidCd = 'Y';
    AppState.odeValidityCleared = true;
  } else if (AppState.totalItemsAttempted >= 5) {
    AppState.tstAtmptCd = 'P';
    AppState.tstValidCd = 'Y';
    AppState.odeValidityCleared = true;
  } else {
    AppState.tstAtmptCd = 'I';
    AppState.tstValidCd = 'N';
    AppState.odeValidityCleared = false;
  }

  syncSessionToCloud();
  syncItemResponseToCloud(responseRecord);

  renderODEState();
  renderQueueList();

  if (AppState.activeQuestionIndex >= QUESTIONS_SOURCE.length - 1) {
    FSM.goToScreen(20);
  } else {
    FSM.goToScreen(AppState.currentScreenIndex + 1);
  }
}

// ============================================================================
// 7. SCREEN 20: POST-ASSESSMENT & METACOGNITIVE DELTA CALCULATION
// ============================================================================

function renderScreen20Delta() {
  const mount = document.getElementById('postcheck-mount-point');
  if (!mount) return;

  // 1. Calculate accuracy by modality
  let discreteCorrect = 0, discreteTotal = 0;
  let continuousCorrect = 0, continuousTotal = 0;
  let abstractCorrect = 0, abstractTotal = 0;
  let totalScore = 0;

  AppState.attemptedItems.forEach((item) => {
    if (item.is_correct) totalScore++;
    if (item.modality === 'discrete') {
      discreteTotal++;
      if (item.is_correct) discreteCorrect++;
    } else if (item.modality === 'continuous') {
      continuousTotal++;
      if (item.is_correct) continuousCorrect++;
    } else if (item.modality === 'abstract') {
      abstractTotal++;
      if (item.is_correct) abstractCorrect++;
    }
  });

  const pctDiscrete = discreteTotal > 0 ? Math.round((discreteCorrect / discreteTotal) * 100) : 0;
  const pctContinuous = continuousTotal > 0 ? Math.round((continuousCorrect / continuousTotal) * 100) : 0;
  const pctAbstract = abstractTotal > 0 ? Math.round((abstractCorrect / abstractTotal) * 100) : 0;

  const pref = AppState.onboarding.preferredModality;
  const perfMap = { discrete: pctDiscrete, continuous: pctContinuous, abstract: pctAbstract };
  const prefScore = perfMap[pref] || 0;
  
  const nonPrefKeys = ['discrete', 'continuous', 'abstract'].filter((k) => k !== pref);
  const nonPrefScore = Math.round((perfMap[nonPrefKeys[0]] + perfMap[nonPrefKeys[1]]) / 2);
  const deltaCal = prefScore - nonPrefScore;

  const friendlyModNames = {
    discrete: 'Blocks & Grids',
    continuous: 'Water & Sliders',
    abstract: 'Numbers & Equations'
  };
  const friendlyPref = friendlyModNames[pref] || 'Blocks & Grids';

  let alignmentInsight = '';
  if (deltaCal >= 15) {
    alignmentInsight = `🎯 <strong>Awesome Job!</strong> Your favorite way to solve math (${friendlyPref}) was also your highest scoring area!`;
  } else if (deltaCal <= -15) {
    const highestMod = Object.keys(perfMap).reduce((a, b) => perfMap[a] > perfMap[b] ? a : b);
    const friendlyHighest = friendlyModNames[highestMod] || highestMod;
    alignmentInsight = `💡 <strong>Surprise Superpower!</strong> You did amazingly well when solving problems with ${friendlyHighest}!`;
  } else {
    alignmentInsight = `⚖️ <strong>Well-Rounded Math Star!</strong> You did great across blocks, water pouring, and written numbers!`;
  }

  // Find missed items for review
  const missedItems = Array.from(AppState.attemptedItems.values()).filter((i) => !i.is_correct);
  const focusItem = missedItems.length > 0 ? missedItems[0] : (AppState.attemptedItems.get(1) || { item_index: 1, prompt: 'Item 1' });

  mount.innerHTML = `
    <div class="onboarding-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <span class="onboarding-title-badge">Screen 20 of 20 • Post-Assessment Report</span>
        <button id="btn-report-back-home" type="button" class="btn btn-secondary">
          🏠 Return to Home Page
        </button>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 3rem;">🎉</div>
        <h2 class="onboarding-title" style="margin-bottom: 4px;">Diagnostic Assessment Complete!</h2>
        <p class="onboarding-desc" style="margin-bottom: 0;">
          Final Score: <strong>${totalScore} / 15 (${Math.round((totalScore / 15) * 100)}%)</strong> • 
          All 15 questions completed!
        </p>
      </div>

      <!-- Learning Match Dashboard -->
      <div class="delta-dashboard-grid">
        <div class="delta-card">
          <div class="delta-header">
            <span class="metric-label">Favorite Style</span>
            <span class="delta-badge-gain">Step 2 Choice</span>
          </div>
          <div class="delta-value" style="color: #38BDF8; font-size: 1.35rem;">
            ${friendlyPref}
          </div>
          <span style="font-size: 0.82rem; color: #94A3B8;">How you like to solve math</span>
        </div>

        <div class="delta-card">
          <div class="delta-header">
            <span class="metric-label">Favorite Style Score</span>
            <span class="delta-badge-gain">Questions</span>
          </div>
          <div class="delta-value" style="color: #10B981;">
            ${prefScore}%
          </div>
          <span style="font-size: 0.82rem; color: #94A3B8;">Accuracy in your favorite style</span>
        </div>

        <div class="delta-card">
          <div class="delta-header">
            <span class="metric-label">Style Comparison</span>
            <span class="delta-badge-gain">${deltaCal >= 0 ? '+' : ''}${deltaCal}%</span>
          </div>
          <div class="delta-value" style="color: #A855F7;">
            ${Math.abs(deltaCal)}%
          </div>
          <span style="font-size: 0.82rem; color: #94A3B8;">Difference across styles</span>
        </div>
      </div>

      <!-- Insight Banner -->
      <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px 20px; margin-bottom: 24px; font-size: 0.95rem; color: #E2E8F0;">
        ${alignmentInsight}
      </div>

      <!-- Qualitative Reflection -->
      <div class="reflection-panel" style="margin-top: 0; margin-bottom: 24px;">
        <div class="reflection-title">
          <span>🧠</span>
          <span>Quick Reflection (Question ${focusItem.item_index})</span>
        </div>
        <p style="font-size: 0.92rem; color: #CBD5E1; margin-bottom: 12px;">
          What made this problem tricky for you? Tap one reason below:
        </p>

        <div class="misconception-chips" id="delta-reflection-chips">
          <button type="button" class="chip-btn" data-reason="motor_slip_or_touch_error">
            🖐️ My finger slipped while dragging
          </button>
          <button type="button" class="chip-btn" data-reason="conceptual_fractions_different_denominators">
            ⚖️ The bottom numbers (denominators) were tricky
          </button>
          <button type="button" class="chip-btn" data-reason="misread_or_unclear_prompt">
            📖 I wasn't sure what the question was asking
          </button>
          <button type="button" class="chip-btn" data-reason="wild_guess">
            🎲 I made a lucky/unlucky guess
          </button>
        </div>

        <!-- Second Chance Box -->
        <div id="isomorphic-second-chance" style="display: none; margin-top: 20px; background: rgba(15, 23, 42, 0.8); border: 1.5px solid #38BDF8; border-radius: var(--radius-md); padding: 20px;">
          <h4 style="color: #38BDF8; font-size: 1.05rem; font-weight: 700; margin-bottom: 8px;">
            ✨ Second Chance: Try It Again!
          </h4>
          <p id="retry-prompt-label" style="color: #FFFFFF; font-size: 0.95rem; margin-bottom: 16px;">
            Pour water until the cylinder is 4/5 full (800 mL).
          </p>
          <div id="retry-component-stage" style="min-height: 320px;"></div>
          <button id="btn-submit-retry-delta" type="button" class="btn btn-primary" style="margin-top: 12px;">
            Submit Second Chance →
          </button>
        </div>
      </div>

      <!-- ================================================================
           REVIEW QUESTIONS & 3 WAYS TO LEARN
           ================================================================ -->
      <div class="review-section-container">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="color: #FFFFFF; font-size: 1.25rem; font-weight: 800;">🔍 Review Your Questions</h3>
            <p style="color: #94A3B8; font-size: 0.88rem;">Check your answers and see three fun ways to solve each question!</p>
          </div>
          <button id="btn-toggle-review-missed" type="button" class="btn btn-primary" style="font-size: 0.9rem; padding: 10px 20px;">
            ${missedItems.length > 0 ? `Review Missed Questions (${missedItems.length}) ▼` : `Review All Questions ▼`}
          </button>
        </div>

        <div id="missed-questions-wrapper" style="display: block;">
          <div id="missed-questions-list">
            <!-- Populated by renderMissedQuestionsList() -->
          </div>
        </div>
      </div>

      <!-- Action Exports -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 24px; margin-top: 24px; flex-wrap: wrap; gap: 12px;">
        <button id="btn-bottom-return-home" type="button" class="btn btn-secondary">
          🏠 Return to Landing Page
        </button>
        <div style="display: flex; gap: 10px;">
          <button id="btn-export-results-json" type="button" class="btn btn-secondary">
            📥 Download Results (JSON)
          </button>
          <button id="btn-print-delta-report" type="button" class="btn btn-primary">
            🖨️ Print / Save PDF Report
          </button>
        </div>
      </div>
    </div>
  `;

  // Render missed questions list
  renderMissedQuestionsList(missedItems.length > 0 ? missedItems : Array.from(AppState.attemptedItems.values()).slice(0, 3));

  // Toggle review accordion
  const toggleReviewBtn = document.getElementById('btn-toggle-review-missed');
  const reviewWrapper = document.getElementById('missed-questions-wrapper');
  if (toggleReviewBtn && reviewWrapper) {
    toggleReviewBtn.addEventListener('click', () => {
      const isHidden = reviewWrapper.style.display === 'none';
      reviewWrapper.style.display = isHidden ? 'block' : 'none';
      toggleReviewBtn.textContent = isHidden 
        ? `${missedItems.length > 0 ? `Hide Missed Questions (${missedItems.length}) ▲` : `Hide Questions ▲`}`
        : `${missedItems.length > 0 ? `Review Missed Questions (${missedItems.length}) ▼` : `Review All Questions ▼`}`;
    });
  }

  // Reflection selection
  mount.querySelectorAll('.chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      mount.querySelectorAll('.chip-btn').forEach((c) => c.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      const reason = btn.getAttribute('data-reason');
      AppState.selectedMisconceptionTag = reason;

      const retryBox = document.getElementById('isomorphic-second-chance');
      const stage = document.getElementById('retry-component-stage');
      if (retryBox && stage) {
        retryBox.style.display = 'block';
        stage.innerHTML = '';
        AppState.retryComponent = new CylinderComponent(stage, {
          item_index: 99,
          target_phase: 1,
          mechanic_type: 'graduated_cylinder_pour',
          mechanic_payload: {
            type: 'graduated_cylinder_pour',
            config: { max_capacity_ml: 1000, tick_interval_ml: 50, major_ticks: [0, 200, 400, 600, 800, 1000], target_ratio: 0.80, snap_tolerance_ratio: 0.02, unit_label: 'mL', liquid_color: '#10B981' }
          }
        });
      }
    });
  });

  // Second chance submit
  const submitRetryBtn = document.getElementById('btn-submit-retry-delta');
  if (submitRetryBtn) {
    submitRetryBtn.addEventListener('click', () => {
      AppState.isomorphicRetryAttempted = true;
      AppState.isomorphicRetryCorrect = AppState.isCurrentAnswerCorrect;
      submitRetryBtn.textContent = AppState.isCurrentAnswerCorrect ? '✓ Second Chance Cleared!' : '✓ Retry Recorded';
      submitRetryBtn.style.background = '#10B981';
      submitRetryBtn.disabled = true;
    });
  }

  // Navigation: Back to Home
  document.getElementById('btn-report-back-home').addEventListener('click', () => FSM.goToScreen('home'));
  document.getElementById('btn-bottom-return-home').addEventListener('click', () => FSM.goToScreen('home'));

  // Print PDF
  document.getElementById('btn-print-delta-report').addEventListener('click', () => window.print());

  // Download JSON
  document.getElementById('btn-export-results-json').addEventListener('click', () => {
    const payload = {
      session_id: AppState.sessionClientId,
      assessment_code: '4TH_GRADE_FRACTIONS_V1',
      target_grade: AppState.onboarding.selectedGrade,
      onboarding_profile: AppState.onboarding,
      score: totalScore,
      total_items: 15,
      ode_accountability: {
        tst_atmpt_cd: AppState.tstAtmptCd,
        tst_valid_cd: AppState.tstValidCd,
        total_items_attempted: AppState.totalItemsAttempted
      },
      metacognitive_delta: {
        preferred_modality: pref,
        empirical_accuracy: perfMap,
        calibration_delta_pct: deltaCal,
        misconception_tag: AppState.selectedMisconceptionTag,
        retry_attempted: AppState.isomorphicRetryAttempted,
        retry_correct: AppState.isomorphicRetryCorrect
      },
      responses: Array.from(AppState.attemptedItems.values()),
      exported_at: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonar_math_report_${AppState.sessionClientId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ============================================================================
// 8. MISSED QUESTIONS REVIEWER & 3 WAYS TO LEARN EXPLAINERS
// ============================================================================

function renderMissedQuestionsList(items) {
  const container = document.getElementById('missed-questions-list');
  if (!container) return;
  container.innerHTML = '';

  const friendlyModNames = {
    discrete: 'Blocks & Grids',
    continuous: 'Water & Sliders',
    abstract: 'Numbers & Equations'
  };

  items.forEach((item) => {
    const qObj = QUESTIONS_SOURCE.find((q) => q.item_index === item.item_index) || QUESTIONS_SOURCE[0];
    const card = document.createElement('div');
    card.className = 'missed-question-card';

    const statusBadge = item.is_correct 
      ? '<span style="color:#10B981; font-weight:700; font-size:0.8rem;">✓ CORRECT</span>'
      : '<span style="color:#F87171; font-weight:700; font-size:0.8rem;">✗ NEEDS REVIEW</span>';

    const friendlyMod = friendlyModNames[qObj.modality] || 'Math Problem';

    card.innerHTML = `
      <div class="missed-question-header">
        <div>
          <strong style="color: #38BDF8; font-size: 0.95rem;">Question ${item.item_index} • ${friendlyMod}</strong>
          <h4 style="color: #FFFFFF; font-size: 1.05rem; margin-top: 2px;">${item.prompt}</h4>
        </div>
        ${statusBadge}
      </div>

      <div class="answer-comparison-box">
        <div><span style="color:#94A3B8;">Your Answer:</span> <strong style="color:${item.is_correct ? '#10B981' : '#F87171'};">${item.value || 'None'}</strong></div>
        <div><span style="color:#94A3B8;">Correct Answer:</span> <strong style="color:#38BDF8;">${qObj.correct_answer?.display_string || 'Target'}</strong></div>
      </div>

      <div>
        <span style="font-size: 0.82rem; font-weight: 700; color: #94A3B8; text-transform: uppercase; margin-bottom: 8px; display: block;">
          See How to Solve It (Pick a way to learn):
        </span>
        <div class="modality-explainer-row">
          <button type="button" class="modality-pill-btn btn-discrete" data-qindex="${item.item_index}" data-modality="discrete" title="See how to solve with shaded blocks">
            🟦 Blocks & Grids
          </button>
          <button type="button" class="modality-pill-btn btn-continuous" data-qindex="${item.item_index}" data-modality="continuous" title="See how to solve with water pouring and sliders">
            🧪 Water & Sliders
          </button>
          <button type="button" class="modality-pill-btn btn-abstract" data-qindex="${item.item_index}" data-modality="abstract" title="See how to solve with numbers and math facts">
            🔢 Numbers & Equations
          </button>
        </div>
      </div>
    `;

    // Hook explainer buttons
    card.querySelectorAll('.modality-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qIdx = parseInt(btn.getAttribute('data-qindex'), 10);
        const mod = btn.getAttribute('data-modality');
        openModalityExplanationModal(qIdx, mod);
      });
    });

    container.appendChild(card);
  });
}

function openModalityExplanationModal(itemIndex, modality) {
  const modal = document.getElementById('modality-explainer-modal');
  const iconEl = document.getElementById('explainer-modal-icon');
  const titleEl = document.getElementById('explainer-modal-title');
  const bodyEl = document.getElementById('explainer-modal-body');

  const q = QUESTIONS_SOURCE.find((item) => item.item_index === itemIndex) || QUESTIONS_SOURCE[0];
  const explanation = getPedagogicalExplanation(q, modality);

  iconEl.textContent = explanation.icon;
  titleEl.textContent = `${explanation.modalityTitle}: Question ${itemIndex}`;
  bodyEl.innerHTML = `
    <div style="background: rgba(255,255,255,0.04); border-radius: 8px; padding: 14px; margin-bottom: 16px; border-left: 3px solid #38BDF8;">
      <div style="font-size: 0.82rem; color: #94A3B8; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Question Scenario</div>
      <div style="color: #FFFFFF; font-size: 0.98rem; font-weight: 600; margin-bottom: 6px;">${q.prompt_text}</div>
      <div style="font-size: 0.88rem; color: #10B981;">Correct Answer: <strong>${q.correct_answer?.display_string}</strong></div>
    </div>
    <div style="line-height: 1.6; font-size: 0.95rem;">
      ${explanation.contentHtml}
    </div>
  `;

  modal.style.display = 'flex';
}

function getPedagogicalExplanation(q, modality) {
  const targetStr = q.correct_answer.display_string;

  if (modality === 'discrete') {
    return {
      icon: '🟦',
      modalityTitle: 'Blocks & Grids',
      contentHtml: `
        <div style="padding: 16px; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; margin-bottom: 12px;">
          <div style="color: #60A5FA; font-weight: 700; font-size: 1.05rem; margin-bottom: 8px;">Solving with Blocks & Pictures:</div>
          <p style="margin: 0 0 10px 0; color: #E2E8F0; line-height: 1.6;">
            1. <strong>Bottom Number (Denominator):</strong> Count all the equal boxes that make up one whole block.<br>
            2. <strong>Top Number (Numerator):</strong> Color in or count just the pieces you need.<br>
            3. Together, the shaded picture shows the answer: <strong>${targetStr}</strong>!
          </p>
        </div>
        <p style="font-size: 0.88rem; color: #94A3B8; margin: 0;">
          💡 <em>Tip: Drawing rectangles and dividing them into equal squares makes fractions easy to see!</em>
        </p>
      `
    };
  } else if (modality === 'continuous') {
    return {
      icon: '🧪',
      modalityTitle: 'Water & Sliders',
      contentHtml: `
        <div style="padding: 16px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; margin-bottom: 12px;">
          <div style="color: #34D399; font-weight: 700; font-size: 1.05rem; margin-bottom: 8px;">Solving with Water & Number Lines:</div>
          <p style="margin: 0 0 10px 0; color: #E2E8F0; line-height: 1.6;">
            1. <strong>Look at the marks:</strong> Check where 0 is at the bottom and 1 whole is at the top.<br>
            2. <strong>Find halfway:</strong> Use 1/2 as a benchmark to help you see if your fraction is smaller or larger than half.<br>
            3. Pouring or sliding to exactly <strong>${targetStr}</strong> fills the container to the right line!
          </p>
        </div>
        <p style="font-size: 0.88rem; color: #94A3B8; margin: 0;">
          💡 <em>Tip: Think of pouring milk into a measuring cup when baking cookies!</em>
        </p>
      `
    };
  } else {
    return {
      icon: '🔢',
      modalityTitle: 'Numbers & Equations',
      contentHtml: `
        <div style="padding: 16px; background: rgba(168, 85, 247, 0.12); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 8px; margin-bottom: 12px;">
          <div style="color: #C084FC; font-weight: 700; font-size: 1.05rem; margin-bottom: 8px;">Solving with Written Numbers:</div>
          <p style="margin: 0 0 10px 0; color: #E2E8F0; line-height: 1.6;">
            1. <strong>Keep the bottom numbers:</strong> When you add or subtract fractions with the same denominator, the bottom number stays the same.<br>
            2. <strong>Do math on top:</strong> Add or subtract the top numbers just like regular numbers.<br>
            3. Calculating gives you the final answer: <strong>${targetStr}</strong>!
          </p>
        </div>
        <p style="font-size: 0.88rem; color: #94A3B8; margin: 0;">
          💡 <em>Tip: The bottom number names the fraction piece, and the top number counts how many pieces you have!</em>
        </p>
      `
    };
  }
}

// ============================================================================
// 9. EDUCATOR & ADMIN RESULTS DASHBOARD ENGINE
// ============================================================================

function renderAdminDashboard() {
  const sessions = JSON.parse(localStorage.getItem('sonar_assessment_sessions') || '[]');
  const totalEl = document.getElementById('admin-stat-total-sessions');
  const avgScoreEl = document.getElementById('admin-stat-avg-score');
  const validRateEl = document.getElementById('admin-stat-valid-rate');
  const latencyEl = document.getElementById('admin-stat-avg-latency');
  const tbody = document.getElementById('admin-sessions-tbody');

  totalEl.textContent = sessions.length;

  if (sessions.length === 0) {
    avgScoreEl.textContent = '--%';
    validRateEl.textContent = '--%';
    latencyEl.textContent = '-- ms';
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: #64748B; padding: 32px;">
          No student assessment sessions recorded yet. Completed assessments will appear here automatically.
        </td>
      </tr>
    `;
    return;
  }

  // Calculate averages
  let sumScore = 0;
  let validCount = 0;
  let sumLatency = 0;

  sessions.forEach((s) => {
    sumScore += s.accuracyPct || 0;
    if (s.tstValidCd === 'Y') validCount++;
    sumLatency += s.baselineLatencyMs || 0;
  });

  avgScoreEl.textContent = `${Math.round(sumScore / sessions.length)}%`;
  validRateEl.textContent = `${Math.round((validCount / sessions.length) * 100)}%`;
  latencyEl.textContent = `${Math.round(sumLatency / sessions.length)} ms`;

  // Render Table Rows
  tbody.innerHTML = '';
  sessions.forEach((s, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.timestamp}</td>
      <td><span style="font-family:monospace; color:#38BDF8;">${s.sessionId.slice(0, 8)}</span></td>
      <td>Grade ${s.grade || 4}</td>
      <td style="text-transform:capitalize;">${s.preferredModality || 'discrete'}</td>
      <td><strong>${s.score}/${s.totalItems || 15}</strong> (${s.accuracyPct}%)</td>
      <td>
        <span class="status-chip ${s.tstValidCd === 'Y' ? 'is-valid' : 'is-pending'}" style="font-size:0.75rem; padding:2px 8px;">
          ${s.tstAtmptCd}: ${s.tstValidCd === 'Y' ? 'Valid' : 'Incomplete'}
        </span>
      </td>
      <td><strong style="color:#A855F7;">${s.deltaCal >= 0 ? '+' : ''}${s.deltaCal}%</strong></td>
      <td style="text-transform:uppercase;">${s.pointerType || 'touch'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function exportSessionsToCsv() {
  const sessions = JSON.parse(localStorage.getItem('sonar_assessment_sessions') || '[]');
  if (sessions.length === 0) {
    alert('No assessment sessions available to export.');
    return;
  }

  let csv = 'Timestamp,Session_ID,Grade,Preferred_Modality,Score,Total_Items,Accuracy_Pct,TstAtmptCd,TstValidCd,Delta_Calibration_Pct,Baseline_Latency_Ms,Pointer_Type\n';

  sessions.forEach((s) => {
    csv += `"${s.timestamp}","${s.sessionId}",${s.grade},"${s.preferredModality}",${s.score},${s.totalItems},${s.accuracyPct},"${s.tstAtmptCd}","${s.tstValidCd}",${s.deltaCal},${s.baselineLatencyMs},"${s.pointerType}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sonar_math_all_sessions_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function seedDemoClassroomData() {
  const now = Date.now();
  const demoSessions = [
    {
      sessionId: 'sess_or_4091a',
      timestamp: new Date(now - 3600000 * 5).toLocaleString(),
      grade: 4,
      preferredModality: 'discrete',
      theme: 'space',
      score: 13,
      totalItems: 15,
      accuracyPct: 87,
      tstAtmptCd: 'P',
      tstValidCd: 'Y',
      deltaCal: 12,
      baselineLatencyMs: 310,
      pointerType: 'touch',
      responses: []
    },
    {
      sessionId: 'sess_or_4092b',
      timestamp: new Date(now - 3600000 * 3).toLocaleString(),
      grade: 4,
      preferredModality: 'continuous',
      theme: 'ocean',
      score: 11,
      totalItems: 15,
      accuracyPct: 73,
      tstAtmptCd: 'P',
      tstValidCd: 'Y',
      deltaCal: -8,
      baselineLatencyMs: 440,
      pointerType: 'mouse',
      responses: []
    },
    {
      sessionId: 'sess_or_4093c',
      timestamp: new Date(now - 3600000 * 1).toLocaleString(),
      grade: 4,
      preferredModality: 'abstract',
      theme: 'culinary',
      score: 14,
      totalItems: 15,
      accuracyPct: 93,
      tstAtmptCd: 'P',
      tstValidCd: 'Y',
      deltaCal: 18,
      baselineLatencyMs: 295,
      pointerType: 'touch',
      responses: []
    }
  ];
  localStorage.setItem('sonar_assessment_sessions', JSON.stringify(demoSessions));
  renderAdminDashboard();
}

// ============================================================================
// 10. TELEMETRY HUD & CLOUD SYNC
// ============================================================================

function updateHUD() {
  const latency = performance.now() - AppState.mountTimeMs;
  AppState.currentLatencyMs = latency;

  const firstTouch = document.getElementById('telemetry-first-interaction');
  if (firstTouch) firstTouch.textContent = AppState.firstInteractionMs > 0 ? `${AppState.firstInteractionMs.toFixed(0)} ms` : '-- ms';

  const latencyEl = document.getElementById('telemetry-latency');
  if (latencyEl) latencyEl.textContent = `${(latency / 1000).toFixed(1)} s`;

  const inputEl = document.getElementById('telemetry-input');
  if (inputEl) inputEl.textContent = AppState.pointerType.toUpperCase();

  const currentValEl = document.getElementById('telemetry-current-val');
  if (currentValEl) currentValEl.textContent = AppState.currentValueDisplay || '0.0%';

  const snapEl = document.getElementById('telemetry-snap');
  if (snapEl) snapEl.textContent = AppState.snapApplied ? 'ACTIVE (±2%)' : 'SEEKING...';

  const frictionEl = document.getElementById('telemetry-friction');
  if (frictionEl) frictionEl.textContent = `${AppState.frictionEventsCount} events`;

  const accEl = document.getElementById('telemetry-accuracy');
  if (accEl) {
    accEl.textContent = AppState.isCurrentAnswerCorrect ? 'CORRECT' : 'ADJUSTING';
    accEl.className = AppState.isCurrentAnswerCorrect ? 'metric-value highlight-green' : 'metric-value highlight-amber';
  }
}

function renderODEState() {
  const chip = document.getElementById('ode-status-chip');
  const codeBadge = document.getElementById('ode-codes-badge');
  const countEl = document.getElementById('ode-attempted-count');

  if (countEl) countEl.textContent = `${AppState.totalItemsAttempted} / 15`;

  if (AppState.odeValidityCleared) {
    if (chip) {
      chip.className = 'status-chip is-valid';
      chip.innerHTML = '<span class="pulse-dot"></span> ODE Valid Cleared';
    }
    if (codeBadge) {
      codeBadge.textContent = `TstAtmptCd: '${AppState.tstAtmptCd}' • TstValidCd: '${AppState.tstValidCd}'`;
      codeBadge.className = 'metric-value highlight-green';
    }
  } else {
    if (chip) {
      chip.className = 'status-chip is-pending';
      chip.innerHTML = '<span class="pulse-dot"></span> ODE Invalidation Risk (< 5 items)';
    }
    if (codeBadge) {
      codeBadge.textContent = `TstAtmptCd: '${AppState.tstAtmptCd}' • TstValidCd: '${AppState.tstValidCd}'`;
      codeBadge.className = 'metric-value highlight-amber';
    }
  }
}

function renderQueueList() {
  const list = document.getElementById('offline-queue-list');
  if (!list) return;
  list.innerHTML = '';

  AppState.attemptedItems.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'offline-item-row';
    const tagClass = item.synced ? 'synced' : 'pending';
    const tagText = item.synced ? 'Synced' : 'Cached Offline';

    row.innerHTML = `
      <div>
        <strong>Item ${item.item_index}</strong> (${item.first_interaction_ms}ms)
        <div style="font-size: 0.72rem; color: #64748B;">${item.timestamp} • ${item.pointer_type}</div>
      </div>
      <span class="sync-tag ${tagClass}">${tagText}</span>
    `;
    list.appendChild(row);
  });
}

async function syncSessionToCloud() {
  const cfg = window.SONAR_CONFIG;
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  try {
    const payload = {
      client_generated_id: AppState.sessionClientId,
      assessment_code: '4TH_GRADE_FRACTIONS_V1',
      target_grade: AppState.onboarding.selectedGrade,
      session_status: AppState.totalItemsAttempted >= 15 ? 'completed' : 'in_progress',
      total_items_attempted: AppState.totalItemsAttempted,
      tst_atmpt_cd: AppState.tstAtmptCd,
      tst_valid_cd: AppState.tstValidCd,
      ode_validity_cleared: AppState.odeValidityCleared,
      primary_input_type: AppState.pointerType,
      screen_width: window.innerWidth,
      screen_height: window.innerHeight,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      device_pixel_ratio: window.devicePixelRatio || 1,
      user_agent: navigator.userAgent
    };
    await fetch(`${cfg.supabaseUrl}/rest/v1/diagnostic_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.supabaseAnonKey,
        'Authorization': `Bearer ${cfg.supabaseAnonKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('[CloudSync] Session save queued:', err);
  }
}

async function syncItemResponseToCloud(record) {
  const cfg = window.SONAR_CONFIG;
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  try {
    const itemPayload = {
      session_client_id: AppState.sessionClientId,
      item_index: record.item_index,
      target_phase: record.target_phase,
      modality: record.modality,
      prompt_key: `ITEM_${record.item_index}`,
      raw_answer: { display: record.value },
      is_correct: record.is_correct,
      first_interaction_ms: record.first_interaction_ms,
      latency_ms: record.latency_ms,
      input_pointer_type: record.pointer_type,
      friction_events_count: record.friction_events,
      metacognitive_feedback: record.metacognitive_feedback
    };
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/item_responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.supabaseAnonKey,
        'Authorization': `Bearer ${cfg.supabaseAnonKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(itemPayload)
    });
    if (res.ok) {
      record.synced = true;
      renderQueueList();
    }
  } catch (err) {
    console.warn('[CloudSync] Item queued:', err);
  }
}

// ============================================================================
// 11. INITIALIZATION & GLOBAL CONTROLS
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {

  // 1. Passcode Gatekeeper (Assessment Access)
  const gateOverlay = document.getElementById('beta-gatekeeper-overlay');
  const gateForm = document.getElementById('form-beta-gate');
  const gateInput = document.getElementById('input-beta-passcode');
  const gateError = document.getElementById('gatekeeper-error');
  const BETA_PASSCODE = (window.SONAR_CONFIG && window.SONAR_CONFIG.betaPasscode) || 'math';

  if (sessionStorage.getItem('sonar_beta_auth') === 'true') {
    gateOverlay.style.display = 'none';
  } else {
    gateOverlay.style.display = 'flex';
  }

  if (gateForm) {
    gateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const entered = (gateInput.value || '').trim().toLowerCase();
      if (entered === BETA_PASSCODE) {
        sessionStorage.setItem('sonar_beta_auth', 'true');
        gateOverlay.style.display = 'none';
      } else {
        gateError.style.display = 'block';
        gateInput.style.borderColor = '#EF4444';
      }
    });
  }

  // 1b. Admin Access Gatekeeper Modal & Credentials
  const adminGateForm = document.getElementById('form-admin-gate');
  const adminGateInput = document.getElementById('input-admin-passcode');
  const adminGateError = document.getElementById('admin-gate-error');
  const adminGateOverlay = document.getElementById('admin-gatekeeper-overlay');
  const ADMIN_PASSCODE = (window.SONAR_CONFIG && window.SONAR_CONFIG.adminPasscode) || 'l33t';

  if (adminGateForm) {
    adminGateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const entered = (adminGateInput.value || '').trim();
      if (entered === ADMIN_PASSCODE) {
        sessionStorage.setItem('sonar_admin_auth', 'true');
        if (adminGateOverlay) adminGateOverlay.style.display = 'none';
        FSM.goToScreen('admin');
      } else {
        if (adminGateError) adminGateError.style.display = 'block';
        if (adminGateInput) {
          adminGateInput.style.borderColor = '#EF4444';
          adminGateInput.focus();
        }
      }
    });
  }

  const cancelAdminBtn = document.getElementById('btn-cancel-admin-auth');
  if (cancelAdminBtn) {
    cancelAdminBtn.addEventListener('click', () => {
      if (adminGateOverlay) adminGateOverlay.style.display = 'none';
    });
  }

  const lockAdminBtn = document.getElementById('btn-admin-lock-portal');
  if (lockAdminBtn) {
    lockAdminBtn.addEventListener('click', () => {
      sessionStorage.removeItem('sonar_admin_auth');
      FSM.goToScreen('home');
    });
  }

  // 2. Navigation: Home Landing Page Buttons
  document.getElementById('btn-landing-start-assessment').addEventListener('click', () => FSM.goToScreen(1));
  document.getElementById('btn-landing-open-admin').addEventListener('click', () => {
    if (sessionStorage.getItem('sonar_admin_auth') === 'true') {
      FSM.goToScreen('admin');
    } else {
      openAdminGatekeeperModal();
    }
  });

  document.getElementById('btn-header-home').addEventListener('click', () => {
    if (typeof AppState.currentScreenIndex === 'number' && AppState.currentScreenIndex >= 5 && AppState.currentScreenIndex <= 19) {
      if (confirm('Are you sure you want to return to the Home page? Your current question progress is saved.')) {
        FSM.goToScreen('home');
      }
    } else {
      FSM.goToScreen('home');
    }
  });

  const brandLogo = document.getElementById('brand-logo-trigger');
  if (brandLogo) brandLogo.addEventListener('click', () => FSM.goToScreen('home'));

  const brandTitle = document.getElementById('nav-brand-title');
  if (brandTitle) brandTitle.addEventListener('click', () => FSM.goToScreen('home'));

  // 3. Admin Portal Actions
  document.getElementById('btn-admin-back-home').addEventListener('click', () => FSM.goToScreen('home'));
  document.getElementById('btn-admin-export-csv').addEventListener('click', exportSessionsToCsv);
  document.getElementById('btn-admin-export-json').addEventListener('click', () => {
    const sessions = localStorage.getItem('sonar_assessment_sessions') || '[]';
    const blob = new Blob([sessions], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonar_math_all_sessions_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-admin-clear-data').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all stored assessment records? This action cannot be undone.')) {
      localStorage.removeItem('sonar_assessment_sessions');
      renderAdminDashboard();
    }
  });

  const loadDemoBtn = document.getElementById('btn-admin-load-demo');
  if (loadDemoBtn) {
    loadDemoBtn.addEventListener('click', () => {
      seedDemoClassroomData();
    });
  }

  // 4. Screen 1: Grade Router
  document.querySelectorAll('#screen-1-grade .selection-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#screen-1-grade .selection-card').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      AppState.onboarding.selectedGrade = parseInt(card.getAttribute('data-grade'), 10);
    });
  });
  document.getElementById('btn-back-to-home-from-grade').addEventListener('click', () => FSM.goToScreen('home'));
  document.getElementById('btn-next-screen-1').addEventListener('click', () => FSM.goToScreen(2));

  // 5. Screen 2: Modality Self-Perception
  document.querySelectorAll('#screen-2-modality .selection-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#screen-2-modality .selection-card').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      AppState.onboarding.preferredModality = card.getAttribute('data-modality');
    });
  });
  document.getElementById('btn-back-screen-2').addEventListener('click', () => FSM.goToScreen(1));
  document.getElementById('btn-next-screen-2').addEventListener('click', () => FSM.goToScreen(3));

  // 6. Screen 3: Behavioral Interest Theme
  document.querySelectorAll('#screen-3-theme .selection-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#screen-3-theme .selection-card').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      AppState.onboarding.interestTheme = card.getAttribute('data-theme');
    });
  });
  document.getElementById('btn-back-screen-3').addEventListener('click', () => FSM.goToScreen(2));
  document.getElementById('btn-next-screen-3').addEventListener('click', () => FSM.goToScreen(4));

  // 7. Screen 4: Sandbox Welcome & Pre-Test Calibration Check
  const startDiagBtn = document.getElementById('btn-start-diagnostic');
  const chkInput = document.getElementById('chk-input-ready');
  const chkSound = document.getElementById('chk-sound-ready');
  const chkLatency = document.getElementById('chk-latency-ready');

  const targets = [
    document.getElementById('cal-target-1'),
    document.getElementById('cal-target-2'),
    document.getElementById('cal-target-3')
  ];

  let calibrationTaps = new Set();
  let calStartMs = performance.now();

  targets.forEach((target, idx) => {
    target.addEventListener('pointerdown', (e) => {
      AppState.pointerType = e.pointerType || 'touch';
      target.classList.add('is-checked');
      target.innerHTML = '<span>✓</span><span>OK</span>';
      calibrationTaps.add(idx + 1);

      if (calibrationTaps.size === 3) {
        AppState.onboarding.calibrationPassed = true;
        AppState.onboarding.baselineMotorLatencyMs = Math.round((performance.now() - calStartMs) / 3);
        
        chkInput.classList.add('is-done');
        chkInput.innerHTML = `<span class="checklist-icon">✓</span><span>Screen check passed! Touch and clicks are working.</span>`;
        
        chkLatency.classList.add('is-done');
        chkLatency.innerHTML = `<span class="checklist-icon">✓</span><span>Ready to go! All 3 circles tapped.</span>`;
        
        startDiagBtn.disabled = false;
        startDiagBtn.style.opacity = '1.0';
        startDiagBtn.style.cursor = 'pointer';
        startDiagBtn.classList.add('glow-button');
      }
    });
  });

  document.getElementById('btn-cal-test-voice').addEventListener('click', () => {
    speakPromptAloud("Sound check complete! Welcome to Sonar Math. Your audio and screen are ready.");
    AppState.onboarding.audioTested = true;
    chkSound.classList.add('is-done');
    chkSound.innerHTML = `<span class="checklist-icon">✓</span><span>Sound check passed! Voice audio is working.</span>`;
  });

  startDiagBtn.addEventListener('click', () => FSM.goToScreen(5));

  // 8. Question Screen Controls
  const mainReadAloudBtn = document.getElementById('btn-read-aloud');
  if (mainReadAloudBtn) {
    mainReadAloudBtn.addEventListener('click', () => {
      const q = QUESTIONS_SOURCE[AppState.activeQuestionIndex];
      if (q) speakPromptAloud(`${q.prompt_text}. ${q.sub_text || ''}`);
    });
  }

  document.getElementById('btn-reset-manipulative').addEventListener('click', () => {
    mountDiagnosticQuestion(AppState.activeQuestionIndex);
  });
  document.getElementById('btn-submit-answer').addEventListener('click', submitCurrentQuestion);

  // 9. Modality Explainer Modal Close
  const explainerModal = document.getElementById('modality-explainer-modal');
  document.getElementById('btn-close-explainer-modal').addEventListener('click', () => {
    explainerModal.style.display = 'none';
  });
  document.getElementById('btn-dismiss-explainer-modal').addEventListener('click', () => {
    explainerModal.style.display = 'none';
  });

  // 10. Researcher Mode Secret Key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2' || (e.ctrlKey && e.shiftKey && e.key === 'D')) {
      e.preventDefault();
      toggleResearcherMode();
    }
  });

  const devToggleBtn = document.getElementById('btn-toggle-mode');
  if (devToggleBtn) devToggleBtn.addEventListener('click', toggleResearcherMode);

  function toggleResearcherMode() {
    AppState.isDevMode = !AppState.isDevMode;
    const body = document.body;
    const label = document.getElementById('mode-label');

    if (AppState.isDevMode) {
      body.classList.remove('student-mode');
      if (label) label.textContent = 'Student Mode';
    } else {
      body.classList.add('student-mode');
      if (label) label.textContent = 'Researcher HUD';
    }
    renderODEState();
  }

  // Start on Home Landing Page
  FSM.goToScreen('home');
});
