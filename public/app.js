/**
 * Sonar Math MVP: Interactive Sandbox Engine (Vanilla JS Browser Bundle)
 * Integrates:
 * - questions.json diagnostic items
 * - GraduatedCylinderCanvas (Continuous Fluid with ±2% snap)
 * - DiscreteBlockGrid (Discrete snapping unit blocks with tablet targets)
 * - Micro-Telemetry HUD (performance.now, latency, friction markers)
 * - IndexedDB write-ahead cache simulation & Oregon ODE threshold monitor
 */

// 1. Diagnostic Questions Data
const QUESTIONS = [
  {
    item_index: 1,
    target_phase: 1,
    modality: "continuous",
    mechanic_type: "graduated_cylinder_pour",
    prompt_text: "Pour water into the graduated cylinder until it is exactly 3/4 full.",
    sub_text: "Drag the water handle to pour. It magnetically snaps when you are within ±2% of 3/4 (750 mL).",
    target_ratio: 0.75,
    max_capacity_ml: 1000,
    unit_label: "mL",
    target_fraction: { numerator: 3, denominator: 4 },
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
  },
  {
    item_index: 3,
    target_phase: 1,
    modality: "continuous",
    mechanic_type: "graduated_cylinder_pour",
    prompt_text: "Pour liquid into the beaker to reach 1/2 of 1000 mL (500 mL).",
    sub_text: "Release within the ±2% snap window to achieve a perfect benchmark pour.",
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
    sub_text: "This is Item 5! Submitting this item officially clears the Oregon ODE 5-item validity rule.",
    grid_rows: 1,
    grid_columns: 6,
    total_cells: 6,
    target_count: 3,
    action_mode: "select_and_shade",
  }
];

// 2. State & Telemetry Store
const AppState = {
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
      // Check intermediate quarter ticks (0.25, 0.50, 0.75, 1.0)
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

      // Left tick
      this.ctx.beginPath();
      this.ctx.moveTo(m.cylLeft, y);
      this.ctx.lineTo(m.cylLeft + (isMajor ? 16 : 8), y);
      this.ctx.stroke();

      // Right tick
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

    // Arrows
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
    this.isPointerDown = false;
    this.dragAction = null;

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

  // Update tabs
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

// 6. Micro-Telemetry HUD & Oregon ODE Accountability State
function updateHUD() {
  const latency = performance.now() - AppState.mountTimeMs;
  AppState.currentLatencyMs = latency;

  document.getElementById('telemetry-first-interaction').textContent = AppState.firstInteractionMs > 0 ? `${AppState.firstInteractionMs.toFixed(0)} ms` : '-- ms';
  document.getElementById('telemetry-latency').textContent = `${(latency / 1000).toFixed(1)} s`;
  document.getElementById('telemetry-input').textContent = AppState.pointerType.toUpperCase();
  document.getElementById('telemetry-current-val').textContent = AppState.currentValueDisplay;
  document.getElementById('telemetry-friction').textContent = `${AppState.frictionEventsCount} events`;

  const snapTag = document.getElementById('telemetry-snap');
  if (AppState.snapApplied) {
    snapTag.textContent = 'ACTIVE (±2%)';
    snapTag.className = 'metric-value highlight-green';
  } else {
    snapTag.textContent = 'SEEKING...';
    snapTag.className = 'metric-value';
  }

  const ansTag = document.getElementById('telemetry-accuracy');
  if (AppState.isCurrentAnswerCorrect) {
    ansTag.textContent = 'CORRECT';
    ansTag.className = 'metric-value highlight-green';
  } else {
    ansTag.textContent = 'ADJUSTING';
    ansTag.className = 'metric-value highlight-amber';
  }
}

setInterval(() => {
  if (AppState.activeComponent) {
    const latency = performance.now() - AppState.mountTimeMs;
    document.getElementById('telemetry-latency').textContent = `${(latency / 1000).toFixed(1)} s`;
  }
}, 500);

// 7. IndexedDB Write-Ahead Caching & ODE 5-Item Rule Submission
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
  };

  AppState.attemptedItems.set(q.item_index, responseRecord);
  AppState.totalItemsAttempted = AppState.attemptedItems.size;

  // Oregon ODE Attemptedness Evaluation: >= 5 items = Valid Attempt (TstAtmptCd: 'P', TstValidCd: 'Y')
  if (AppState.totalItemsAttempted >= 15) {
    AppState.tstAtmptCd = 'C'; // Complete
    AppState.tstValidCd = 'Y';
    AppState.odeValidityCleared = true;
  } else if (AppState.totalItemsAttempted >= 5) {
    AppState.tstAtmptCd = 'P'; // Partial Attempt
    AppState.tstValidCd = 'Y'; // Valid
    AppState.odeValidityCleared = true;
  } else {
    AppState.tstAtmptCd = 'I'; // In-Progress
    AppState.tstValidCd = 'N'; // Invalid (< 5 items)
    AppState.odeValidityCleared = false;
  }

  renderODEState();
  renderQueueList();

  // Advance to next question if available
  if (AppState.activeQuestionIndex < QUESTIONS.length - 1) {
    mountQuestion(AppState.activeQuestionIndex + 1);
  }
}

function renderODEState() {
  const chip = document.getElementById('ode-status-chip');
  const codeBadge = document.getElementById('ode-codes-badge');
  const progressCount = document.getElementById('ode-attempted-count');

  progressCount.textContent = `${AppState.totalItemsAttempted} / 15`;

  if (AppState.odeValidityCleared) {
    chip.className = 'status-chip is-valid';
    chip.innerHTML = '<span class="pulse-dot"></span> ODE Valid Attempt Cleared';
    codeBadge.textContent = `TstAtmptCd: '${AppState.tstAtmptCd}' • TstValidCd: '${AppState.tstValidCd}'`;
    codeBadge.className = 'metric-value highlight-green';
  } else {
    chip.className = 'status-chip is-pending';
    chip.innerHTML = '<span class="pulse-dot"></span> ODE Invalidation Risk (< 5 items)';
    codeBadge.textContent = `TstAtmptCd: '${AppState.tstAtmptCd}' • TstValidCd: '${AppState.tstValidCd}'`;
    codeBadge.className = 'metric-value highlight-amber';
  }
}

function renderQueueList() {
  const list = document.getElementById('offline-queue-list');
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

function toggleWifiSimulation() {
  AppState.isSimulatedOffline = !AppState.isSimulatedOffline;
  const btn = document.getElementById('btn-toggle-wifi');
  const netStatus = document.getElementById('net-status-badge');

  if (AppState.isSimulatedOffline) {
    btn.textContent = 'Restore Wi-Fi Connection';
    btn.className = 'btn btn-secondary';
    netStatus.textContent = 'Home Wi-Fi Disconnected (Offline Queue)';
    netStatus.style.color = '#F59E0B';
  } else {
    btn.textContent = 'Simulate Home Wi-Fi Blip';
    btn.className = 'btn btn-secondary';
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

// 8. Bootstrap Sandbox on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  // Build Tabs
  const tabsContainer = document.getElementById('item-tabs');
  QUESTIONS.forEach((q, idx) => {
    const btn = document.createElement('button');
    btn.className = `item-tab ${idx === 0 ? 'is-active' : ''}`;
    btn.textContent = `Item ${q.item_index} (${q.modality.slice(0, 4)})`;
    btn.addEventListener('click', () => mountQuestion(idx));
    tabsContainer.appendChild(btn);
  });

  // Action Buttons
  document.getElementById('btn-submit-answer').addEventListener('click', submitCurrentItem);
  document.getElementById('btn-reset-manipulative').addEventListener('click', () => {
    mountQuestion(AppState.activeQuestionIndex);
  });
  document.getElementById('btn-toggle-wifi').addEventListener('click', toggleWifiSimulation);
  document.getElementById('btn-sync-now').addEventListener('click', triggerAutoSync);

  // Mount initial question
  mountQuestion(0);
  renderODEState();
});
