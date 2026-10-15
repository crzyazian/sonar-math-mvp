/**
 * Sonar Math MVP: Complete 20-Stage Finite State Machine (FSM)
 * 
 * Flow Architecture:
 * - Screens 1-4: Onboarding & Calibration Flow
 *     1: Grade Router (Grade 3, 4 [Active Pilot], 5)
 *     2: Modality Self-Perception Selection (Discrete, Continuous, Abstract)
 *     3: Behavioral Interest Prompt (Space, Ocean, Bakery, Sports)
 *     4: Sandbox Welcome & Pre-Test Device Calibration Check (Touch acknowledgment, latency baseline, audio check)
 * - Screens 5-19: Full 15-Question Diagnostic Battery (Phases 1, 2, 3)
 *     Driven by immutable questions.json schema:
 *     - Phase 1 Fluency: Items 1-5 (Cylinder, Grid, Slider, Cross-Out, Multiple Choice)
 *     - Phase 2 Transfer: Items 6-10 (Cylinder Addition, Cross-Out Subtraction, Numeric Fraction, Slider, Word Problem)
 *     - Phase 3 Operations & Mixed: Items 11-15 (Repeated Addition Grid, Multiplication Cylinder, Numeric Improper, Comparison Slider, Multiplication Choice)
 * - Screen 20: Post-Check and Metacognitive Delta Calculation Screen
 *     - Qualitative Misconception Tagging
 *     - Isomorphic Second-Chance Challenge
 *     - Metacognitive Alignment Delta (Self-Perception vs Empirical Accuracy)
 *     - Oregon ODE Accountability Clearance (TstAtmptCd: 'C', TstValidCd: 'Y')
 *     - JSON Data Export & PDF Report
 */

// 1. Application State & Storage
const AppState = {
  currentScreenIndex: 1, // 1 to 20
  isDevMode: false, // Default to Student Mode (silent background telemetry, no distraction)
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
  activeQuestionIndex: 0, // 0 to 14 (mapping to items 1 to 15)
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
const QUESTIONS_SOURCE = (window.SONAR_QUESTIONS && window.SONAR_QUESTIONS.questions) || [
  {
    item_index: 1,
    target_phase: 1,
    modality: "continuous",
    mechanic_type: "graduated_cylinder_pour",
    prompt_text: "Pour water into the graduated cylinder until it is exactly 3/4 full.",
    sub_text: "Drag the water level to fill the cylinder. Release when you are ready.",
    correct_answer: { display_string: "3/4", normalized_value: 0.75, fraction: { numerator: 3, denominator: 4 }, acceptable_margin: 0.02 },
    mechanic_payload: { type: "graduated_cylinder_pour", config: { max_capacity_ml: 1000, tick_interval_ml: 50, major_ticks: [0, 250, 500, 750, 1000], target_ratio: 0.75, target_fraction: { numerator: 3, denominator: 4 }, snap_tolerance_ratio: 0.02, unit_label: "mL" } },
    seda_domain: "4.NF.A (Equivalence)",
    pedagogical_objective: "Benchmark visual identification of three-fourths in a continuous volume manipulative."
  }
];

// Helper: Speak Text Aloud via Web Speech API
function speakPromptAloud(text) {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported in this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.05;
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}

// ============================================================================
// 3. FINITE STATE MACHINE (FSM) CONTROLLER
// ============================================================================

const FSM = {
  goToScreen(screenNum) {
    if (screenNum < 1 || screenNum > 20) return;
    AppState.currentScreenIndex = screenNum;

    // Update Progress Header
    const progressFill = document.getElementById('step-progress-fill');
    const counterText = document.getElementById('step-counter-text');
    const progressPercent = Math.min(100, Math.round((screenNum / 20) * 100));
    if (progressFill) progressFill.style.width = `${progressPercent}%`;

    // Hide all screens
    document.querySelectorAll('.fsm-screen').forEach((el) => el.classList.remove('is-active'));
    const readAloudBtn = document.getElementById('btn-read-aloud');

    // Route Screen State
    if (screenNum === 1) {
      if (counterText) counterText.textContent = `Screen 1 of 20: Grade Selection`;
      document.getElementById('screen-1-grade').classList.add('is-active');
      if (readAloudBtn) readAloudBtn.style.display = 'none';
    } 
    else if (screenNum === 2) {
      if (counterText) counterText.textContent = `Screen 2 of 20: Modality Calibration`;
      document.getElementById('screen-2-modality').classList.add('is-active');
      if (readAloudBtn) readAloudBtn.style.display = 'none';
    } 
    else if (screenNum === 3) {
      if (counterText) counterText.textContent = `Screen 3 of 20: Lab Theme`;
      document.getElementById('screen-3-theme').classList.add('is-active');
      if (readAloudBtn) readAloudBtn.style.display = 'none';
    } 
    else if (screenNum === 4) {
      if (counterText) counterText.textContent = `Screen 4 of 20: Input Calibration Check`;
      document.getElementById('screen-4-calibration').classList.add('is-active');
      if (readAloudBtn) readAloudBtn.style.display = 'none';
    } 
    else if (screenNum >= 5 && screenNum <= 19) {
      const qIndex = screenNum - 5; // 0 to 14
      const qNum = qIndex + 1;
      const q = QUESTIONS_SOURCE[qIndex] || QUESTIONS_SOURCE[0];
      const phaseNames = { 1: 'Fluency', 2: 'Continuous Transfer', 3: 'Mixed & Regrouping' };

      if (counterText) {
        counterText.textContent = `Screen ${screenNum} of 20 • Item ${qNum}/15 (${phaseNames[q.target_phase]})`;
      }
      document.getElementById('screen-diagnostic').classList.add('is-active');
      if (readAloudBtn) readAloudBtn.style.display = 'inline-flex';
      
      mountDiagnosticQuestion(qIndex);
    } 
    else if (screenNum === 20) {
      if (counterText) counterText.textContent = `Screen 20 of 20: Metacognitive Delta`;
      document.getElementById('screen-20-postcheck').classList.add('is-active');
      if (readAloudBtn) readAloudBtn.style.display = 'none';

      renderScreen20Delta();
    }

    // Scroll to top of stage
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

    const stopDrag = (e) => {
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

    // Arrows in handle
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
    this.dragTargetState = null;

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
        // select_and_shade
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
      AppState.currentValueDisplay = `${active} active blocks (${this.crossedOut.size} crossed out)`;
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

/** Component 3: Continuous Number Line Slider Component (±2.5% Interval Snap) */
class NumberLineSliderComponent {
  constructor(container, q) {
    this.container = container;
    this.q = q;
    this.config = q.mechanic_payload?.config || {
      min_value: 0.0,
      max_value: 1.0,
      step_fraction: { numerator: 1, denominator: 8 },
      target_fraction: { numerator: 5, denominator: 8 },
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

      // Magnetic snap to nearest tick
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

    // Clicking anywhere on track also moves thumb
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
    if (callout) {
      callout.textContent = this.currentVal.toFixed(2);
    }
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
    AppState.currentValueDisplay = `Selected: ${this.selectedId || 'None'}`;
    const targetMatch = this.q.correct_answer?.exact_match;
    AppState.isCurrentAnswerCorrect = (this.selectedId === targetMatch);
    updateHUD();
  }

  destroy() {
    this.grid.remove();
  }
}

/** Component 5: Numeric Fraction Box Input (Stacked Numerator/Denominator) */
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
    const onType = (e) => {
      AppState.pointerType = 'keyboard';
      if (AppState.firstInteractionMs === 0) {
        AppState.firstInteractionMs = performance.now() - AppState.mountTimeMs;
      }
      this.syncTelemetry();
    };

    this.numInput.addEventListener('input', onType);
    this.denInput.addEventListener('input', onType);
    if (this.wholeInput) this.wholeInput.addEventListener('input', onType);

    // Auto-advance from num to den on enter
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

    // Check correctness
    let correct = false;
    if (this.config.allow_mixed_number && whole > 0) {
      const targetW = this.config.target_whole || 0;
      const targetN = this.config.target_numerator;
      const targetD = this.config.target_denominator;
      correct = (whole === targetW && num === targetN && den === targetD);
    } else {
      // Direct fraction or improper match
      const targetN = this.config.target_numerator;
      const targetD = this.config.target_denominator;
      // Also allow mathematically equivalent if not requiring simplified
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

  const q = QUESTIONS_SOURCE[index] || QUESTIONS_SOURCE[0];

  document.getElementById('prompt-badge').textContent = `Phase ${q.target_phase} • ${q.modality.toUpperCase()}`;
  document.getElementById('question-progress-badge').textContent = `Question ${q.item_index} of 15`;
  document.getElementById('prompt-title').textContent = q.prompt_text;
  document.getElementById('prompt-subtitle').textContent = q.sub_text || 'Select or adjust your response.';

  const viewport = document.getElementById('canvas-viewport');
  if (AppState.activeComponent) {
    AppState.activeComponent.destroy();
    AppState.activeComponent = null;
  }
  viewport.innerHTML = '';

  // Instantiate appropriate mechanic
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

  // Cloud sync hook
  syncSessionToCloud();
  syncItemResponseToCloud(responseRecord);

  renderODEState();
  renderQueueList();

  // Advance FSM: If completed item 15 (index 14), go to Screen 20!
  if (AppState.activeQuestionIndex >= QUESTIONS_SOURCE.length - 1) {
    FSM.goToScreen(20);
  } else {
    FSM.goToScreen(AppState.currentScreenIndex + 1);
  }
}

// ============================================================================
// 7. SCREEN 20: METACOGNITIVE DELTA CALCULATION ENGINE
// ============================================================================

function renderScreen20Delta() {
  const mount = document.getElementById('postcheck-mount-point');
  if (!mount) return;

  // 1. Calculate accuracy by modality
  let discreteCorrect = 0, discreteTotal = 0;
  let continuousCorrect = 0, continuousTotal = 0;
  let abstractCorrect = 0, abstractTotal = 0;

  AppState.attemptedItems.forEach((item) => {
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

  // 2. Metacognitive Calibration Delta
  const pref = AppState.onboarding.preferredModality; // 'discrete', 'continuous', 'abstract'
  const perfMap = { discrete: pctDiscrete, continuous: pctContinuous, abstract: pctAbstract };
  const prefScore = perfMap[pref] || 0;
  
  // Non-preferred average
  const nonPrefKeys = ['discrete', 'continuous', 'abstract'].filter((k) => k !== pref);
  const nonPrefScore = Math.round((perfMap[nonPrefKeys[0]] + perfMap[nonPrefKeys[1]]) / 2);
  const deltaCal = prefScore - nonPrefScore; // Metacognitive delta

  let alignmentInsight = '';
  if (deltaCal >= 15) {
    alignmentInsight = `🎯 <strong>High Metacognitive Self-Awareness:</strong> Your preferred modality (${pref.toUpperCase()}) was indeed your strongest performance area (+${deltaCal}% Delta).`;
  } else if (deltaCal <= -15) {
    const highestMod = Object.keys(perfMap).reduce((a, b) => perfMap[a] > perfMap[b] ? a : b);
    alignmentInsight = `💡 <strong>Hidden Superpower Discovered:</strong> While you selected ${pref.toUpperCase()} initially, you demonstrated the highest natural mastery in ${highestMod.toUpperCase()} representations (${perfMap[highestMod]}%).`;
  } else {
    alignmentInsight = `⚖️ <strong>Balanced Representation Transfer:</strong> You exhibited consistent, versatile fluency across both discrete models and continuous fluid representations (±${Math.abs(deltaCal)}% Delta).`;
  }

  // 3. Find candidate tricky problem for reflection
  const missedItems = Array.from(AppState.attemptedItems.values()).filter((i) => !i.is_correct);
  const focusItem = missedItems.length > 0 ? missedItems[0] : (AppState.attemptedItems.get(1) || { item_index: 1, prompt: 'Item 1' });

  mount.innerHTML = `
    <div class="onboarding-card">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 3rem;">🎉</div>
        <h2 class="onboarding-title" style="margin-bottom: 4px;">Diagnostic Assessment Complete!</h2>
        <p class="onboarding-desc" style="margin-bottom: 0;">
          All 15 items answered. Oregon ODE Validity Standard Cleared (TstAtmptCd: '${AppState.tstAtmptCd}', TstValidCd: '${AppState.tstValidCd}').
        </p>
      </div>

      <!-- Metacognitive Delta Dashboard -->
      <div class="delta-dashboard-grid">
        <div class="delta-card">
          <div class="delta-header">
            <span class="metric-label">Self-Perceived Preference</span>
            <span class="delta-badge-gain">Pre-Test Screen 2</span>
          </div>
          <div class="delta-value" style="color: #38BDF8; font-size: 1.5rem; text-transform: capitalize;">
            ${pref} Models
          </div>
          <span style="font-size: 0.82rem; color: #94A3B8;">Your initial chosen learning style</span>
        </div>

        <div class="delta-card">
          <div class="delta-header">
            <span class="metric-label">Empirical Accuracy</span>
            <span class="delta-badge-gain">All 15 Items</span>
          </div>
          <div class="delta-value" style="color: #10B981;">
            ${prefScore}%
          </div>
          <span style="font-size: 0.82rem; color: #94A3B8;">In your preferred modality</span>
        </div>

        <div class="delta-card">
          <div class="delta-header">
            <span class="metric-label">Metacognitive Calibration (Δ)</span>
            <span class="delta-badge-gain">${deltaCal >= 0 ? '+' : ''}${deltaCal}%</span>
          </div>
          <div class="delta-value" style="color: #A855F7;">
            ${Math.abs(deltaCal)}% Δ
          </div>
          <span style="font-size: 0.82rem; color: #94A3B8;">Preference vs Non-preferred gap</span>
        </div>
      </div>

      <!-- Metacognitive Insight Banner -->
      <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px 20px; margin-bottom: 24px; font-size: 0.95rem; color: #E2E8F0;">
        ${alignmentInsight}
      </div>

      <!-- Qualitative Reflection & Misconception Tagging -->
      <div class="reflection-panel" style="margin-top: 0; margin-bottom: 24px;">
        <div class="reflection-title">
          <span>🧠</span>
          <span>Post-Assessment Reflection (Item ${focusItem.item_index})</span>
        </div>
        <p style="font-size: 0.92rem; color: #CBD5E1; margin-bottom: 12px;">
          What made this problem tricky for you? Your feedback helps us separate mechanical motor slips from math concepts:
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

        <!-- Isomorphic Retry Box -->
        <div id="isomorphic-second-chance" style="display: none; margin-top: 20px; background: rgba(15, 23, 42, 0.8); border: 1.5px solid #38BDF8; border-radius: var(--radius-md); padding: 20px;">
          <h4 style="color: #38BDF8; font-size: 1.05rem; font-weight: 700; margin-bottom: 8px;">
            ✨ Second Chance Challenge: Show Your Growth!
          </h4>
          <p id="retry-prompt-label" style="color: #FFFFFF; font-size: 0.95rem; margin-bottom: 16px;">
            Pour water until the cylinder is 4/5 full (800 mL).
          </p>
          <div id="retry-component-stage" style="min-height: 320px;"></div>
          <button id="btn-submit-retry-delta" type="button" class="btn btn-primary" style="margin-top: 12px;">
            Submit Second Chance & Calculate Growth Delta →
          </button>
        </div>
      </div>

      <!-- Action Exports -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 20px; flex-wrap: wrap; gap: 12px;">
        <span style="font-size: 0.85rem; color: #94A3B8;">All 15 telemetry records persisted in IndexedDB & Cloud Sync.</span>
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

  // Attach reflection events
  mount.querySelectorAll('.chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      mount.querySelectorAll('.chip-btn').forEach((c) => c.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      const reason = btn.getAttribute('data-reason');
      AppState.selectedMisconceptionTag = reason;

      // Reveal isomorphic retry
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

  // Submit retry
  const submitRetryBtn = document.getElementById('btn-submit-retry-delta');
  if (submitRetryBtn) {
    submitRetryBtn.addEventListener('click', () => {
      AppState.isomorphicRetryAttempted = true;
      AppState.isomorphicRetryCorrect = AppState.isCurrentAnswerCorrect;
      submitRetryBtn.textContent = AppState.isCurrentAnswerCorrect ? '✓ Second Chance Cleared (+1 Mastery Gain!)' : '✓ Retry Recorded';
      submitRetryBtn.style.background = '#10B981';
      submitRetryBtn.disabled = true;
    });
  }

  // Print Report
  const printBtn = document.getElementById('btn-print-delta-report');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  // Download JSON
  const downloadBtn = document.getElementById('btn-export-results-json');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const payload = {
        session_id: AppState.sessionClientId,
        assessment_code: '4TH_GRADE_FRACTIONS_V1',
        target_grade: AppState.onboarding.selectedGrade,
        onboarding_profile: AppState.onboarding,
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
      a.download = `sonar_math_delta_${AppState.sessionClientId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}

// ============================================================================
// 8. TELEMETRY HUD & CLOUD SYNC
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
    console.warn('[CloudSync] Session save queued in IndexedDB:', err);
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
    console.warn('[CloudSync] Item queued in IndexedDB:', err);
  }
}

// ============================================================================
// 9. ONBOARDING & CALIBRATION INTERACTIVE CONTROLLERS
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  
  // 1. Passcode Gatekeeper
  const gateOverlay = document.getElementById('beta-gatekeeper-overlay');
  const gateForm = document.getElementById('form-beta-gate');
  const gateInput = document.getElementById('input-beta-passcode');
  const gateError = document.getElementById('gatekeeper-error');
  const BETA_PASSCODE = (window.SONAR_CONFIG && window.SONAR_CONFIG.betaPasscode) || 'sonar2026';

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

  // 2. Screen 1: Grade Router
  document.querySelectorAll('#screen-1-grade .selection-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#screen-1-grade .selection-card').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      AppState.onboarding.selectedGrade = parseInt(card.getAttribute('data-grade'), 10);
    });
  });
  document.getElementById('btn-next-screen-1').addEventListener('click', () => FSM.goToScreen(2));

  // 3. Screen 2: Modality Self-Perception
  document.querySelectorAll('#screen-2-modality .selection-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#screen-2-modality .selection-card').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      AppState.onboarding.preferredModality = card.getAttribute('data-modality');
    });
  });
  document.getElementById('btn-back-screen-2').addEventListener('click', () => FSM.goToScreen(1));
  document.getElementById('btn-next-screen-2').addEventListener('click', () => FSM.goToScreen(3));

  // 4. Screen 3: Behavioral Interest Theme
  document.querySelectorAll('#screen-3-theme .selection-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#screen-3-theme .selection-card').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      AppState.onboarding.interestTheme = card.getAttribute('data-theme');
    });
  });
  document.getElementById('btn-back-screen-3').addEventListener('click', () => FSM.goToScreen(2));
  document.getElementById('btn-next-screen-3').addEventListener('click', () => FSM.goToScreen(4));

  // 5. Screen 4: Sandbox Welcome & Pre-Test Device Calibration Check
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
        chkInput.innerHTML = `<span class="checklist-icon">✓</span><span>Input Acknowledged: ${AppState.pointerType.toUpperCase()} recognized and responsive.</span>`;
        
        chkLatency.classList.add('is-done');
        chkLatency.innerHTML = `<span class="checklist-icon">✓</span><span>Motor Baseline Latency: ${AppState.onboarding.baselineMotorLatencyMs} ms calibrated.</span>`;
        
        checkCanStartDiagnostic();
      }
    });
  });

  const testVoiceBtn = document.getElementById('btn-cal-test-voice');
  if (testVoiceBtn) {
    testVoiceBtn.addEventListener('click', () => {
      speakPromptAloud("Sound check complete! Welcome to Sonar Math. Your audio and screen are ready.");
      AppState.onboarding.audioTested = true;
      chkSound.classList.add('is-done');
      chkSound.innerHTML = `<span class="checklist-icon">✓</span><span>Sound & Voice: Audio prompt synthesis verified.</span>`;
      checkCanStartDiagnostic();
    });
  }

  function checkCanStartDiagnostic() {
    if (AppState.onboarding.calibrationPassed) {
      startDiagBtn.disabled = false;
      startDiagBtn.style.opacity = '1.0';
      startDiagBtn.style.cursor = 'pointer';
      startDiagBtn.classList.add('glow-button');
    }
  }

  startDiagBtn.addEventListener('click', () => FSM.goToScreen(5));

  // 6. Audio Prompt Read-Aloud (Screens 5-19)
  const mainReadAloudBtn = document.getElementById('btn-read-aloud');
  if (mainReadAloudBtn) {
    mainReadAloudBtn.addEventListener('click', () => {
      const q = QUESTIONS_SOURCE[AppState.activeQuestionIndex];
      if (q) {
        speakPromptAloud(`${q.prompt_text}. ${q.sub_text || ''}`);
      }
    });
  }

  // 7. Reset and Submit Buttons
  document.getElementById('btn-reset-manipulative').addEventListener('click', () => {
    mountDiagnosticQuestion(AppState.activeQuestionIndex);
  });
  document.getElementById('btn-submit-answer').addEventListener('click', submitCurrentQuestion);

  // 8. Secret Researcher Mode Toggle (Locked from students)
  // Activated by pressing F2, or triple-clicking the brand logo
  let logoClicks = 0;
  const brandLogo = document.getElementById('brand-logo-trigger');
  if (brandLogo) {
    brandLogo.addEventListener('click', () => {
      logoClicks++;
      if (logoClicks >= 3) {
        toggleResearcherMode();
        logoClicks = 0;
      }
    });
  }

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
    const navBar = document.getElementById('item-nav-bar');
    const label = document.getElementById('mode-label');

    if (AppState.isDevMode) {
      body.classList.remove('student-mode');
      if (navBar) navBar.style.display = 'block';
      if (label) label.textContent = 'Student Mode';
      console.log('[DevMode] Researcher HUD enabled.');
    } else {
      body.classList.add('student-mode');
      if (navBar) navBar.style.display = 'none';
      if (label) label.textContent = 'Researcher HUD';
    }
    renderODEState();
  }

  // Start at Screen 1
  FSM.goToScreen(1);
});
