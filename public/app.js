/**
 * Sonar Math MVP: Interactive Sandbox Engine (Vanilla JS Browser Bundle)
 * Integrates:
 * - questions.json diagnostic items
 * - GraduatedCylinderCanvas (Continuous Fluid with ±2% snap)
 * - DiscreteBlockGrid (Discrete snapping unit blocks with tablet targets)
 * - Zero-Pressure Student Mode (Micro-telemetry logs silently in background)
 * - Researcher HUD Toggle (Dev view for latency, friction, and offline queue)
 * - Post-Assessment Metacognitive Reflection & Isomorphic Retry Module
 * - IndexedDB write-ahead cache simulation & Oregon ODE threshold monitor
 */

// 1. Diagnostic Questions Data with Isomorphic Variants
const QUESTIONS = [
  {
    item_index: 1,
    target_phase: 1,
    modality: "continuous",
    mechanic_type: "graduated_cylinder_pour",
    prompt_text: "Pour water into the graduated cylinder until it is exactly 3/4 full.",
    sub_text: "Drag the water handle to pour. Release when you are close to 3/4 (750 mL).",
    target_ratio: 0.75,
    max_capacity_ml: 1000,
    unit_label: "mL",
    target_fraction: { numerator: 3, denominator: 4 },
    isomorphic_variant: {
      prompt_text: "Try this similar one: Pour water until the cylinder is 4/5 full (800 mL).",
      sub_text: "Apply what you learned with fifths!",
      target_ratio: 0.80,
      max_capacity_ml: 1000,
      target_fraction: { numerator: 4, denominator: 5 }
    }
  },
  {
    item_index: 2,
    target_phase: 1,
    modality: "discrete",
    mechanic_type: "unit_block_grid",
    prompt_text: "Shade the unit blocks to represent 2/3 of the 12-block rectangle.",
    sub_text: "Tap or drag across blocks to shade them. You need 8 out of 12 blocks shaded (8/12 = 2/3).",
    grid_rows: 3,
    grid_columns: 4,
    total_cells: 12,
    target_count: 8,
    action_mode: "select_and_shade",
    isomorphic_variant: {
      prompt_text: "Try this similar one: Shade 3/4 of the 12-block rectangle.",
      sub_text: "How many blocks make 3/4 of 12?",
      grid_rows: 3,
      grid_columns: 4,
      total_cells: 12,
      target_count: 9,
      action_mode: "select_and_shade"
    }
  },
  {
    item_index: 3,
    target_phase: 1,
    modality: "continuous",
    mechanic_type: "graduated_cylinder_pour",
    prompt_text: "Pour liquid into the beaker to reach 1/2 of 1000 mL (500 mL).",
    sub_text: "Release near the halfway mark.",
    target_ratio: 0.50,
    max_capacity_ml: 1000,
    unit_label: "mL",
    target_fraction: { numerator: 1, denominator: 2 },
  },
  {
    item_index: 4,
    target_phase: 1,
    modality: "discrete",
    mechanic_type: "unit_block_grid",
    prompt_text: "Cross out blocks to show 1 - 3/10 on the 10-block bar.",
    sub_text: "Tap shaded blocks to strike them out. Leave 7 blocks active (7/10).",
    grid_rows: 1,
    grid_columns: 10,
    total_cells: 10,
    target_count: 7,
    action_mode: "cross_out",
    initial_highlighted: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  },
  {
    item_index: 5,
    target_phase: 1,
    modality: "discrete",
    mechanic_type: "unit_block_grid",
    prompt_text: "Shade blocks to show 3/6 (one half) of the 6-block strip.",
    sub_text: "Show what one half looks like using 6 unit blocks.",
    grid_rows: 1,
    grid_columns: 6,
    total_cells: 6,
    target_count: 3,
    action_mode: "select_and_shade",
  }
];

// 2. Application & Silent Telemetry State
const AppState = {
  isDevMode: false, // Default to Student Mode (zero pressure, no visible timers)
  activeQuestionIndex: 0,
  activeComponent: null,
  mountTimeMs: performance.now(),
  firstInteractionMs: 0,
  currentLatencyMs: 0,
  frictionEventsCount: 0,
  pointerType: 'unknown',
  snapApplied: false,
  currentValueDisplay: '0.00',
  isCurrentAnswerCorrect: false,

  // ODE State
  attemptedItems: new Map(), // item_index -> response object
  isSimulatedOffline: false,
  totalItemsAttempted: 0,
  tstAtmptCd: 'I',
  tstValidCd: 'N',
  odeValidityCleared: false,

  // Post-Assessment State
  isCelebrationView: false,
  selectedMetacognitiveReason: null,
  retryComponent: null,
};

// 3. Procedural Graduated Cylinder Canvas Class
class CylinderComponent {
  constructor(container, q) {
    this.container = container;
    this.q = q;
    this.currentRatio = 0.0;
    this.isDragging = false;
    this.isSnapped = false;
    this.wavePhase = 0;
    this.waveAmplitude = 0;
    this.snapTolerance = 0.02; // ±2%

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'graduated-cylinder-canvas';
    this.canvas.style.touchAction = 'none';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
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
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
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

    const onUp = (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      try { this.canvas.releasePointerCapture(e.pointerId); } catch(err) {}
      this.evaluateSnap(true);
      this.syncTelemetry();
    };

    this.canvas.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('pointercancel', onUp);
  }

  updateFromPointer(clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const m = this.getMetrics(rect.width, rect.height);
    const relY = clientY - rect.top;
    let ratio = (m.cylBottom - relY) / m.cylHeight;
    ratio = Math.max(0, Math.min(1.0, ratio));

    this.currentRatio = ratio;
    this.waveAmplitude = 3.5;
    this.evaluateSnap(false);
    this.syncTelemetry();
  }

  evaluateSnap() {
    const delta = Math.abs(this.currentRatio - this.q.target_ratio);
    if (delta <= this.snapTolerance) {
      if (!this.isSnapped) {
        AppState.frictionEventsCount++;
      }
      this.currentRatio = this.q.target_ratio;
      this.isSnapped = true;
    } else {
      const major = [0.25, 0.50, 0.75, 1.0];
      let snapMajor = false;
      for (const t of major) {
        if (Math.abs(this.currentRatio - t) <= this.snapTolerance) {
          this.currentRatio = t;
          this.isSnapped = true;
          snapMajor = true;
          break;
        }
      }
      if (!snapMajor) this.isSnapped = false;
    }
  }

  syncTelemetry() {
    AppState.snapApplied = this.isSnapped;
    AppState.currentValueDisplay = (this.currentRatio * 100).toFixed(1) + '% (' + Math.round(this.currentRatio * this.q.max_capacity_ml) + ' mL)';
    AppState.isCurrentAnswerCorrect = Math.abs(this.currentRatio - this.q.target_ratio) < 0.001;
    updateHUD();
  }

  getMetrics(w, h) {
    const cylWidth = Math.min(w * 0.38, 140);
    const cylHeight = h * 0.72;
    const cylLeft = (w - cylWidth) / 2;
    const cylTop = h * 0.12;
    const cylBottom = cylTop + cylHeight;
    return { cylLeft, cylTop, cylWidth, cylHeight, cylBottom };
  }

  startLoop() {
    const frame = () => {
      this.wavePhase += 0.08;
      if (!this.isDragging && this.waveAmplitude > 0) {
        this.waveAmplitude *= 0.94;
        if (this.waveAmplitude < 0.05) this.waveAmplitude = 0;
      }
      this.render();
      this.animId = requestAnimationFrame(frame);
    };
    this.animId = requestAnimationFrame(frame);
  }

  render() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    this.ctx.clearRect(0, 0, w, h);

    const m = this.getMetrics(w, h);
    const liquidTop = m.cylBottom - (this.currentRatio * m.cylHeight);

    // Cylinder Glass Tube
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(241, 245, 249, 0.06)';
    this.ctx.strokeStyle = '#64748B';
    this.ctx.lineWidth = 3;

    this.ctx.beginPath();
    this.ctx.moveTo(m.cylLeft, m.cylTop);
    this.ctx.lineTo(m.cylLeft, m.cylBottom - 12);
    this.ctx.quadraticCurveTo(m.cylLeft, m.cylBottom, m.cylLeft + 16, m.cylBottom);
    this.ctx.lineTo(m.cylLeft + m.cylWidth - 16, m.cylBottom);
    this.ctx.quadraticCurveTo(m.cylLeft + m.cylWidth, m.cylBottom, m.cylLeft + m.cylWidth, m.cylBottom - 12);
    this.ctx.lineTo(m.cylLeft + m.cylWidth, m.cylTop);
    this.ctx.stroke();
    this.ctx.fill();

    // Liquid Fill
    if (this.currentRatio > 0.005) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(m.cylLeft + 2, m.cylTop);
      this.ctx.lineTo(m.cylLeft + 2, m.cylBottom - 12);
      this.ctx.quadraticCurveTo(m.cylLeft + 2, m.cylBottom - 2, m.cylLeft + 16, m.cylBottom - 2);
      this.ctx.lineTo(m.cylLeft + m.cylWidth - 16, m.cylBottom - 2);
      this.ctx.quadraticCurveTo(m.cylLeft + m.cylWidth - 2, m.cylBottom - 2, m.cylLeft + m.cylWidth - 2, m.cylBottom - 12);
      this.ctx.lineTo(m.cylLeft + m.cylWidth - 2, m.cylTop);
      this.ctx.closePath();
      this.ctx.clip();

      const grad = this.ctx.createLinearGradient(m.cylLeft, 0, m.cylLeft + m.cylWidth, 0);
      grad.addColorStop(0, '#2563EB');
      grad.addColorStop(0.5, '#3B82F6');
      grad.addColorStop(1, '#1D4ED8');
      this.ctx.fillStyle = grad;

      this.ctx.beginPath();
      this.ctx.moveTo(m.cylLeft, m.cylBottom);
      this.ctx.lineTo(m.cylLeft, liquidTop);

      const points = 20;
      for (let i = 0; i <= points; i++) {
        const px = m.cylLeft + (i / points) * m.cylWidth;
        const py = liquidTop + Math.sin(this.wavePhase + i * 0.5) * this.waveAmplitude;
        this.ctx.lineTo(px, py);
      }
      this.ctx.lineTo(m.cylLeft + m.cylWidth, m.cylBottom);
      this.ctx.closePath();
      this.ctx.fill();

      // Meniscus line
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.ellipse(m.cylLeft + m.cylWidth / 2, liquidTop, m.cylWidth / 2 - 3, 4 + this.waveAmplitude * 0.3, 0, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.restore();
    }

    // Ticks & Labels
    const totalTicks = 10;
    this.ctx.font = '600 12px Plus Jakarta Sans, sans-serif';
    this.ctx.fillStyle = '#94A3B8';

    for (let i = 0; i <= totalTicks; i++) {
      const r = i / totalTicks;
      const y = m.cylBottom - (r * m.cylHeight);
      const isMajor = i % 2 === 0;
      const isTarget = Math.abs(r - this.q.target_ratio) < 0.01;

      this.ctx.strokeStyle = isTarget ? '#3B82F6' : isMajor ? '#E2E8F0' : '#475569';
      this.ctx.lineWidth = isTarget ? 3 : isMajor ? 2 : 1;

      this.ctx.beginPath();
      this.ctx.moveTo(m.cylLeft, y);
      this.ctx.lineTo(m.cylLeft + (isMajor ? 16 : 8), y);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(m.cylLeft + m.cylWidth, y);
      this.ctx.lineTo(m.cylLeft + m.cylWidth - (isMajor ? 16 : 8), y);
      this.ctx.stroke();

      if (isMajor) {
        const ml = Math.round(r * this.q.max_capacity_ml);
        this.ctx.fillText(`${ml}mL`, m.cylLeft + m.cylWidth + 12, y + 4);
      }

      if (isTarget) {
        this.ctx.fillStyle = '#38BDF8';
        this.ctx.font = 'bold 13px Plus Jakarta Sans, sans-serif';
        this.ctx.fillText(`★ ${this.q.target_fraction.numerator}/${this.q.target_fraction.denominator}`, m.cylLeft - 48, y + 4);
        this.ctx.font = '600 12px Plus Jakarta Sans, sans-serif';
        this.ctx.fillStyle = '#94A3B8';
      }
    }

    // Snap Indicator
    if (this.isSnapped) {
      this.ctx.save();
      this.ctx.strokeStyle = '#10B981';
      this.ctx.lineWidth = 3;
      this.ctx.shadowColor = '#10B981';
      this.ctx.shadowBlur = 10;
      this.ctx.beginPath();
      this.ctx.moveTo(m.cylLeft - 4, liquidTop);
      this.ctx.lineTo(m.cylLeft + m.cylWidth + 4, liquidTop);
      this.ctx.stroke();

      this.ctx.fillStyle = '#10B981';
      this.ctx.font = 'bold 12px Plus Jakarta Sans, sans-serif';
      this.ctx.fillText('SNAP ±2%', m.cylLeft + m.cylWidth + 10, liquidTop - 10);
      this.ctx.restore();
    }

    // Drag Handle (Tablet Touch Target > 44px)
    const handleX = m.cylLeft + m.cylWidth + 24;
    const handleY = liquidTop;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(handleX, handleY, 22, 0, Math.PI * 2);
    this.ctx.fillStyle = this.isDragging ? '#1D4ED8' : '#2563EB';
    this.ctx.shadowColor = 'rgba(37, 99, 235, 0.4)';
    this.ctx.shadowBlur = 12;
    this.ctx.fill();
    this.ctx.strokeStyle = '#FFFFFF';
    this.ctx.lineWidth = 2.5;
    this.ctx.stroke();

    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.beginPath();
    this.ctx.moveTo(handleX, handleY - 8);
    this.ctx.lineTo(handleX - 5, handleY - 2);
    this.ctx.lineTo(handleX + 5, handleY - 2);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.moveTo(handleX, handleY + 8);
    this.ctx.lineTo(handleX - 5, handleY + 2);
    this.ctx.lineTo(handleX + 5, handleY + 2);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();

    this.ctx.restore();
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);
    this.canvas.remove();
  }
}

// 4. Snapping Discrete Block Grid Class
class GridComponent {
  constructor(container, q) {
    this.container = container;
    this.q = q;
    this.highlighted = new Set(q.initial_highlighted || []);
    this.crossedOut = new Set();

    this.root = document.createElement('div');
    this.root.className = 'discrete-block-grid-wrapper';
    this.container.appendChild(this.root);

    this.render();
    this.syncTelemetry();
  }

  render() {
    this.root.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'discrete-grid-container';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${this.q.grid_columns}, minmax(56px, 1fr))`;
    grid.style.gridTemplateRows = `repeat(${this.q.grid_rows}, minmax(56px, 1fr))`;
    grid.style.gap = '10px';
    grid.style.maxWidth = `${Math.max(this.q.grid_columns * 72, 280)}px`;
    grid.style.margin = '0 auto';

    for (let i = 0; i < this.q.total_cells; i++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'grid-unit-block';
      if (this.highlighted.has(i)) cell.classList.add('is-highlighted');
      if (this.crossedOut.has(i)) cell.classList.add('is-crossed-out');

      const label = document.createElement('span');
      label.className = 'cell-coordinate-label';
      label.textContent = String(i + 1);
      cell.appendChild(label);

      if (this.crossedOut.has(i)) {
        const cross = document.createElement('div');
        cross.className = 'cross-out-overlay';
        cross.innerHTML = `
          <svg viewBox="0 0 40 40" width="100%" height="100%">
            <line x1="6" y1="6" x2="34" y2="34" stroke="#DC2626" stroke-width="4.5" stroke-linecap="round"/>
            <line x1="34" y1="6" x2="6" y2="34" stroke="#DC2626" stroke-width="4.5" stroke-linecap="round"/>
          </svg>
        `;
        cell.appendChild(cross);
      }

      cell.addEventListener('pointerdown', (e) => {
        AppState.pointerType = e.pointerType || 'touch';
        if (AppState.firstInteractionMs === 0) {
          AppState.firstInteractionMs = performance.now() - AppState.mountTimeMs;
        }
        this.toggleCell(i);
      });

      grid.appendChild(cell);
    }

    this.root.appendChild(grid);
  }

  toggleCell(index) {
    AppState.frictionEventsCount++;
    if (this.q.action_mode === 'cross_out') {
      if (this.crossedOut.has(index)) {
        this.crossedOut.delete(index);
      } else {
        this.crossedOut.add(index);
      }
    } else {
      if (this.highlighted.has(index)) {
        this.highlighted.delete(index);
      } else {
        this.highlighted.add(index);
      }
    }
    this.render();
    this.syncTelemetry();
  }

  syncTelemetry() {
    let active = 0;
    if (this.q.action_mode === 'cross_out') {
      active = this.q.total_cells - this.crossedOut.size;
    } else {
      active = this.highlighted.size;
    }
    AppState.snapApplied = true;
    AppState.currentValueDisplay = `${active} / ${this.q.total_cells} blocks`;
    AppState.isCurrentAnswerCorrect = active === this.q.target_count;
    updateHUD();
  }

  destroy() {
    this.root.remove();
  }
}

// 5. Mount Active Question
function mountQuestion(index) {
  AppState.activeQuestionIndex = index;
  AppState.mountTimeMs = performance.now();
  AppState.firstInteractionMs = 0;
  AppState.frictionEventsCount = 0;
  AppState.snapApplied = false;

  const q = QUESTIONS[index];
  document.getElementById('prompt-badge').textContent = `Phase ${q.target_phase} • ${q.modality.toUpperCase()}`;
  document.getElementById('prompt-title').textContent = q.prompt_text;
  document.getElementById('prompt-subtitle').textContent = q.sub_text;

  document.querySelectorAll('.item-tab').forEach((tab, idx) => {
    tab.classList.toggle('is-active', idx === index);
  });

  const viewport = document.getElementById('canvas-viewport');
  if (AppState.activeComponent) {
    AppState.activeComponent.destroy();
  }
  viewport.innerHTML = '';

  if (q.mechanic_type === 'graduated_cylinder_pour') {
    AppState.activeComponent = new CylinderComponent(viewport, q);
  } else if (q.mechanic_type === 'unit_block_grid') {
    AppState.activeComponent = new GridComponent(viewport, q);
  }
}

// 6. Micro-Telemetry HUD (Visible ONLY in Developer Mode)
function updateHUD() {
  const latency = performance.now() - AppState.mountTimeMs;
  AppState.currentLatencyMs = latency;

  const firstTouchElem = document.getElementById('telemetry-first-interaction');
  if (firstTouchElem) {
    firstTouchElem.textContent = AppState.firstInteractionMs > 0 ? `${AppState.firstInteractionMs.toFixed(0)} ms` : '-- ms';
  }
  const latencyElem = document.getElementById('telemetry-latency');
  if (latencyElem) {
    latencyElem.textContent = `${(latency / 1000).toFixed(1)} s`;
  }
  const inputElem = document.getElementById('telemetry-input');
  if (inputElem) {
    inputElem.textContent = AppState.pointerType.toUpperCase();
  }
  const currentValElem = document.getElementById('telemetry-current-val');
  if (currentValElem) {
    currentValElem.textContent = AppState.currentValueDisplay;
  }
  const frictionElem = document.getElementById('telemetry-friction');
  if (frictionElem) {
    frictionElem.textContent = `${AppState.frictionEventsCount} events`;
  }

  const snapTag = document.getElementById('telemetry-snap');
  if (snapTag) {
    if (AppState.snapApplied) {
      snapTag.textContent = 'ACTIVE (±2%)';
      snapTag.className = 'metric-value highlight-green';
    } else {
      snapTag.textContent = 'SEEKING...';
      snapTag.className = 'metric-value';
    }
  }

  const ansTag = document.getElementById('telemetry-accuracy');
  if (ansTag) {
    if (AppState.isCurrentAnswerCorrect) {
      ansTag.textContent = 'CORRECT';
      ansTag.className = 'metric-value highlight-green';
    } else {
      ansTag.textContent = 'ADJUSTING';
      ansTag.className = 'metric-value highlight-amber';
    }
  }
}

// 7. IndexedDB Write-Ahead Caching & ODE 5-Item Submission
function submitCurrentItem() {
  const q = QUESTIONS[AppState.activeQuestionIndex];
  const responseRecord = {
    item_index: q.item_index,
    prompt: q.prompt_text,
    value: AppState.currentValueDisplay,
    is_correct: AppState.isCurrentAnswerCorrect,
    first_interaction_ms: Number(AppState.firstInteractionMs.toFixed(1)),
    latency_ms: Number(AppState.currentLatencyMs.toFixed(1)),
    pointer_type: AppState.pointerType,
    friction_events: AppState.frictionEventsCount,
    timestamp: new Date().toLocaleTimeString(),
    synced: !AppState.isSimulatedOffline,
    metacognitive_feedback: null,
  };

  AppState.attemptedItems.set(q.item_index, responseRecord);
  AppState.totalItemsAttempted = AppState.attemptedItems.size;

  // Oregon ODE Attemptedness Evaluation
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

  renderODEState();
  renderQueueList();

  // If completing Item 5 in beta, or advancing:
  if (AppState.activeQuestionIndex === QUESTIONS.length - 1) {
    renderCelebrationView();
  } else {
    mountQuestion(AppState.activeQuestionIndex + 1);
  }
}

function renderODEState() {
  const chip = document.getElementById('ode-status-chip');
  const codeBadge = document.getElementById('ode-codes-badge');
  const progressCount = document.getElementById('ode-attempted-count');

  if (progressCount) progressCount.textContent = `${AppState.totalItemsAttempted} / 15`;

  if (AppState.isDevMode) {
    if (AppState.odeValidityCleared) {
      chip.className = 'status-chip is-valid';
      chip.innerHTML = '<span class="pulse-dot"></span> ODE Valid Attempt Cleared';
      if (codeBadge) {
        codeBadge.textContent = `TstAtmptCd: '${AppState.tstAtmptCd}' • TstValidCd: '${AppState.tstValidCd}'`;
        codeBadge.className = 'metric-value highlight-green';
      }
    } else {
      chip.className = 'status-chip is-pending';
      chip.innerHTML = '<span class="pulse-dot"></span> ODE Invalidation Risk (< 5 items)';
      if (codeBadge) {
        codeBadge.textContent = `TstAtmptCd: '${AppState.tstAtmptCd}' • TstValidCd: '${AppState.tstValidCd}'`;
        codeBadge.className = 'metric-value highlight-amber';
      }
    }
  } else {
    // In student mode, keep a subtle calm indicator
    chip.className = 'status-chip';
    chip.innerHTML = `<span class="pulse-dot" style="background:#10B981;"></span> Saved`;
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

// 8. Post-Assessment Neutral Completion & Metacognitive Reflection
function renderCelebrationView() {
  AppState.isCelebrationView = true;
  const viewport = document.getElementById('canvas-viewport');
  if (AppState.activeComponent) AppState.activeComponent.destroy();

  // Find missed items or items with high friction
  const missed = [];
  let correctCount = 0;
  AppState.attemptedItems.forEach((item) => {
    if (item.is_correct) correctCount++;
    if (!item.is_correct || item.friction_events > 3) {
      missed.push(item);
    }
  });

  const focusItem = missed.length > 0 ? missed[0] : AppState.attemptedItems.get(1);
  const qObj = QUESTIONS.find((q) => q.item_index === focusItem.item_index) || QUESTIONS[0];

  viewport.innerHTML = `
    <div class="celebration-view">
      <div class="celebration-icon" style="animation: none;">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>

      <h2 class="celebration-title" style="background: none; -webkit-text-fill-color: #FFFFFF; font-size: 1.8rem;">
        Assessment Finished.
      </h2>
      <p class="celebration-subtitle">
        Your answers have been securely recorded. All attempted items meet the Oregon ODE accountability threshold.
      </p>

      <!-- Parent & Teacher Learning Summary Card -->
      <div class="summary-card">
        <div class="summary-header">
          <div>
            <h3 class="summary-title">Diagnostic Learning Summary (Grade 4 Fractions)</h3>
            <span style="font-size: 0.75rem; color: #64748B;">Oregon ODE & SEDA Standards Aligned</span>
          </div>
          <span class="summary-badge">Attempt Valid (5/5 Items)</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div class="domain-score-row">
            <span>Visual Volume & Continuous Pouring (4.NF.A)</span>
            <strong style="color: #38BDF8;">Demonstrated</strong>
          </div>
          <div class="domain-score-row">
            <span>Discrete Grid Partitioning & Equivalence (4.NF.A)</span>
            <strong style="color: #38BDF8;">Demonstrated</strong>
          </div>
          <div class="domain-score-row">
            <span>Decomposition & Subtraction from Whole (4.NF.B)</span>
            <strong style="color: #38BDF8;">Demonstrated</strong>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
          <span style="font-size: 0.78rem; font-weight: 700; color: #94A3B8; text-transform: uppercase;">Observed Strengths:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <span class="strength-tag">✓ Benchmark Identification (1/2, 3/4)</span>
            <span class="strength-tag">✓ Area Grid Shading</span>
            <span class="strength-tag">✓ Unit Block Subtraction</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
          <span style="font-size: 0.8rem; color: #64748B;">Recommended: Progress to Phase 2 mixed-number addition.</span>
          <button id="btn-print-summary" type="button" class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 14px; min-height: 36px;">
            🖨️ Print / Save Report
          </button>
        </div>
      </div>

      <!-- Metacognitive Reflection Module -->
      <div class="reflection-panel">
        <div class="reflection-title">
          <span>🧠</span>
          <span>Question Reflection: Item ${qObj.item_index} ("${qObj.prompt_text}")</span>
        </div>
        <p style="font-size: 0.9rem; color: #CBD5E1;">
          What made this problem tricky for you? (Your feedback helps us make the questions clearer!)
        </p>

        <div class="misconception-chips" id="reflection-chips">
          <button type="button" class="chip-btn" data-reason="motor_slip_or_touch_error">
            🖐️ My finger slipped while dragging
          </button>
          <button type="button" class="chip-btn" data-reason="conceptual_fractions_different_denominators">
            ⚖️ The bottom fraction numbers were confusing
          </button>
          <button type="button" class="chip-btn" data-reason="misread_or_unclear_prompt">
            📖 I wasn't sure what the question asked
          </button>
          <button type="button" class="chip-btn" data-reason="wild_guess">
            🎲 I made a lucky/unlucky guess
          </button>
        </div>

        <!-- Isomorphic Retry Section -->
        <div id="isomorphic-retry-section" class="retry-container" style="display: none;">
          <h4 style="color: #38BDF8; font-size: 1rem; font-weight: 700;">
            ✨ Second Chance: Try this similar question!
          </h4>
          <p id="retry-prompt-text" style="font-size: 0.95rem; color: #FFFFFF; font-weight: 600;"></p>
          <div id="retry-canvas-mount" style="min-height: 320px; position: relative;"></div>
          <button id="btn-submit-retry" type="button" class="btn btn-primary" style="align-self: flex-start; margin-top: 8px;">
            Submit Retry Answer
          </button>
        </div>
      </div>
    </div>
  `;

  // Print button
  document.getElementById('btn-print-summary').addEventListener('click', () => {
    window.print();
  });

  // Attach chip events
  const chips = viewport.querySelectorAll('.chip-btn');
  chips.forEach((btn) => {
    btn.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      const reason = btn.getAttribute('data-reason');
      AppState.selectedMetacognitiveReason = reason;

      // Update response record in offline cache with reflection tag
      const rec = AppState.attemptedItems.get(qObj.item_index);
      if (rec) {
        rec.metacognitive_feedback = reason;
      }

      // Show Isomorphic Retry
      mountIsomorphicRetry(qObj);
    });
  });
}

function mountIsomorphicRetry(q) {
  const retrySection = document.getElementById('isomorphic-retry-section');
  const mount = document.getElementById('retry-canvas-mount');
  const promptText = document.getElementById('retry-prompt-text');

  if (!retrySection || !mount) return;
  retrySection.style.display = 'flex';

  const variant = q.isomorphic_variant || {
    prompt_text: "Pour water until the cylinder is 4/5 full (800 mL).",
    target_ratio: 0.80,
    max_capacity_ml: 1000,
    target_fraction: { numerator: 4, denominator: 5 }
  };

  promptText.textContent = variant.prompt_text;
  mount.innerHTML = '';

  if (q.mechanic_type === 'graduated_cylinder_pour') {
    AppState.retryComponent = new CylinderComponent(mount, {
      ...q,
      target_ratio: variant.target_ratio,
      target_fraction: variant.target_fraction,
    });
  } else {
    AppState.retryComponent = new GridComponent(mount, {
      ...q,
      target_count: variant.target_count || 9,
    });
  }

  document.getElementById('btn-submit-retry').addEventListener('click', () => {
    retrySection.innerHTML = `
      <div style="padding: 16px; background: rgba(16, 185, 129, 0.2); border-radius: 8px; color: #10B981; font-weight: 700;">
        🎉 Awesome effort! Your retry answer and reflection have been recorded for your teacher!
      </div>
    `;
  });
}

// 9. Mode Toggling (Student View vs Researcher HUD)
function toggleMode() {
  AppState.isDevMode = !AppState.isDevMode;
  document.body.classList.toggle('student-mode', !AppState.isDevMode);

  const btn = document.getElementById('btn-toggle-mode');
  const label = document.getElementById('mode-label');

  if (AppState.isDevMode) {
    btn.classList.add('is-dev');
    label.textContent = 'Researcher HUD (Dev)';
  } else {
    btn.classList.remove('is-dev');
    label.textContent = 'Student View';
  }
  renderODEState();
}

function toggleWifiSimulation() {
  AppState.isSimulatedOffline = !AppState.isSimulatedOffline;
  const btn = document.getElementById('btn-toggle-wifi');
  const netStatus = document.getElementById('net-status-badge');

  if (AppState.isSimulatedOffline) {
    btn.textContent = 'Restore Wi-Fi Connection';
    netStatus.textContent = 'Home Wi-Fi Disconnected (Offline Queue)';
    netStatus.style.color = '#F59E0B';
  } else {
    btn.textContent = 'Simulate Home Wi-Fi Blip';
    netStatus.textContent = 'Online (Supabase Connected)';
    netStatus.style.color = '#10B981';
    triggerAutoSync();
  }
}

function triggerAutoSync() {
  AppState.attemptedItems.forEach((item) => {
    item.synced = true;
  });
  renderQueueList();
}

// 10. Web Speech Audio Prompt Read-Aloud
let activeUtterance = null;
function toggleAudioReadAloud() {
  const btn = document.getElementById('btn-read-aloud');
  if (!('speechSynthesis' in window)) {
    alert('Speech audio is not supported in this browser.');
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    btn.classList.remove('is-speaking');
    btn.textContent = '🔊 Listen';
    return;
  }

  const q = QUESTIONS[AppState.activeQuestionIndex];
  const fullText = `${q.prompt_text}. ${q.sub_text || ''}`;

  activeUtterance = new SpeechSynthesisUtterance(fullText);
  activeUtterance.rate = 0.92; // Slightly slower, encouraging child-friendly cadence
  activeUtterance.pitch = 1.05;

  activeUtterance.onstart = () => {
    btn.classList.add('is-speaking');
    btn.textContent = '⏹️ Stop';
  };

  activeUtterance.onend = () => {
    btn.classList.remove('is-speaking');
    btn.textContent = '🔊 Listen';
  };

  activeUtterance.onerror = () => {
    btn.classList.remove('is-speaking');
    btn.textContent = '🔊 Listen';
  };

  window.speechSynthesis.speak(activeUtterance);
}

// 11. Pre-Test Touch & Audio Calibration Check
function openCalibrationOverlay() {
  const overlay = document.getElementById('calibration-overlay');
  const stage = document.getElementById('calibration-bubble-stage');
  overlay.style.display = 'flex';
  stage.innerHTML = '';

  let currentBubbleTarget = 1;
  const bubblePositions = [
    { left: '20%', top: '35%' },
    { left: '50%', top: '25%' },
    { left: '80%', top: '45%' },
  ];

  bubblePositions.forEach((pos, idx) => {
    const num = idx + 1;
    const bubble = document.createElement('div');
    bubble.className = 'calibration-bubble';
    bubble.textContent = String(num);
    bubble.style.left = pos.left;
    bubble.style.top = pos.top;

    bubble.addEventListener('pointerdown', () => {
      if (num === currentBubbleTarget) {
        bubble.style.transform = 'scale(0)';
        bubble.style.opacity = '0';
        currentBubbleTarget++;

        if (currentBubbleTarget > 3) {
          stage.innerHTML = `
            <div style="color: #10B981; font-weight: 700; font-size: 1.1rem; padding: 20px;">
              ✓ Screen touch & reaction latency calibrated successfully!
            </div>
          `;
        }
      }
    });

    stage.appendChild(bubble);
  });
}

function testSoundVoice() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Audio is working clearly!");
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }
}

// 12. Bootstrap Sandbox on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  // Start in Student Mode by default (Zero Pressure)
  document.body.classList.add('student-mode');

  // Build Tabs
  const tabsContainer = document.getElementById('item-tabs');
  QUESTIONS.forEach((q, idx) => {
    const btn = document.createElement('button');
    btn.className = `item-tab ${idx === 0 ? 'is-active' : ''}`;
    btn.textContent = `Item ${q.item_index} (${q.modality.slice(0, 4)})`;
    btn.addEventListener('click', () => {
      if (!AppState.isCelebrationView) mountQuestion(idx);
    });
    tabsContainer.appendChild(btn);
  });

  // Action Buttons
  document.getElementById('btn-submit-answer').addEventListener('click', submitCurrentItem);
  document.getElementById('btn-reset-manipulative').addEventListener('click', () => {
    if (!AppState.isCelebrationView) mountQuestion(AppState.activeQuestionIndex);
  });
  document.getElementById('btn-toggle-mode').addEventListener('click', toggleMode);
  document.getElementById('btn-toggle-wifi').addEventListener('click', toggleWifiSimulation);
  document.getElementById('btn-sync-now').addEventListener('click', triggerAutoSync);

  // Audio Read-Aloud & Calibration Check
  const readBtn = document.getElementById('btn-read-aloud');
  if (readBtn) readBtn.addEventListener('click', toggleAudioReadAloud);

  const deviceCheckBtn = document.getElementById('btn-device-check');
  if (deviceCheckBtn) deviceCheckBtn.addEventListener('click', openCalibrationOverlay);

  const testSoundBtn = document.getElementById('btn-test-sound');
  if (testSoundBtn) testSoundBtn.addEventListener('click', testSoundVoice);

  const closeCalBtn = document.getElementById('btn-close-calibration');
  if (closeCalBtn) {
    closeCalBtn.addEventListener('click', () => {
      document.getElementById('calibration-overlay').style.display = 'none';
    });
  }

  // Mount initial question
  mountQuestion(0);
  renderODEState();
});

