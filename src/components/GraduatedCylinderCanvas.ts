/**
 * GraduatedCylinderCanvas: 2D Procedural Continuous Fluid Manipulative
 * 
 * FEATURES:
 * - HiDPI / Retina responsive scaling (devicePixelRatio aware).
 * - W3C Pointer Events (touch, mouse, stylus) with element pointer capture.
 * - Normalized float volume space (0.0 to 1.0) invariant to screen resolution.
 * - ±2% Magnetic Snap Tolerance: eliminates false math errors caused by motor-skill jitter.
 * - Procedural fluid physics with dynamic surface meniscus and gentle wave perturbation.
 * - Micro-telemetry logging (first_interaction_ms, latency_ms, friction_events).
 */

export interface CylinderOptions {
  maxCapacityMl: number;
  tickIntervalMl: number;
  majorTicks: number[];
  targetRatio: number; // e.g. 0.75 for 3/4
  targetFraction: { numerator: number; denominator: number };
  snapTolerance: number; // default 0.02 (±2%)
  liquidColor?: string;
  unitLabel?: string;
  onUpdate?: (state: CylinderState) => void;
  onSubmit?: (state: CylinderState) => void;
}

export interface CylinderState {
  currentRatio: number; // 0.0 to 1.0
  currentVolumeMl: number;
  isSnapped: boolean;
  snappedRatio?: number;
  isCorrect: boolean;
  firstInteractionMs: number;
  latencyMs: number;
  frictionEventsCount: number;
  pointerType: 'mouse' | 'touch' | 'pen' | 'unknown';
}

export class GraduatedCylinderCanvas {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: CylinderOptions;

  // Interaction State
  private isDragging = false;
  private currentRatio = 0.0;
  private targetRatio = 0.75;
  private snapTolerance = 0.02; // ±2%
  private isSnapped = false;
  private mountTimeMs: number;
  private firstInteractionMs = 0;
  private frictionEventsCount = 0;
  private pointerType: 'mouse' | 'touch' | 'pen' | 'unknown' = 'unknown';

  // Animation & Fluid Physics
  private wavePhase = 0;
  private waveAmplitude = 0;
  private animFrameId: number | null = null;

  constructor(container: HTMLElement, options: CylinderOptions) {
    this.container = container;
    this.options = {
      liquidColor: '#3B82F6',
      unitLabel: 'mL',
      snapTolerance: 0.02,
      ...options,
    };
    this.targetRatio = this.options.targetRatio;
    this.snapTolerance = this.options.snapTolerance;
    this.mountTimeMs = performance.now();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'graduated-cylinder-canvas';
    this.canvas.style.touchAction = 'none'; // Prevent browser gestures
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';

    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('2D Canvas context unsupported');
    this.ctx = context;

    this.container.appendChild(this.canvas);
    this.initEventListeners();
    this.handleResize();
    this.startRenderLoop();
  }

  private handleResize = (): void => {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(rect.width * dpr, 300 * dpr);
    this.canvas.height = Math.max(rect.height * dpr, 480 * dpr);
    this.ctx.scale(dpr, dpr);
    this.render();
  };

  private initEventListeners(): void {
    window.addEventListener('resize', this.handleResize);

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    this.isDragging = true;
    this.pointerType = (e.pointerType as any) || 'unknown';

    if (this.firstInteractionMs === 0) {
      this.firstInteractionMs = performance.now() - this.mountTimeMs;
    }

    this.updateRatioFromPointer(e.clientY);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    this.updateRatioFromPointer(e.clientY);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    this.isDragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // safe ignore if pointer already released
    }

    // Final evaluate snap on release
    this.evaluateSnap(true);
    this.notifyUpdate();
  };

  private updateRatioFromPointer(clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const metrics = this.getCylinderMetrics(rect.width, rect.height);

    // Invert coordinate: Cylinder bottom is 0%, cylinder top is 100%
    const relativeY = clientY - rect.top;
    const fillPixels = metrics.cylBottom - relativeY;
    let rawRatio = fillPixels / metrics.cylHeight;

    // Clamp between 0.0 and 1.05 (allow slight overflow indication)
    rawRatio = Math.max(0, Math.min(1.0, rawRatio));

    // Dynamic wave perturbation when actively pouring/dragging
    this.waveAmplitude = 3.5;

    this.currentRatio = rawRatio;
    this.evaluateSnap(false);
    this.notifyUpdate();
  }

  /**
   * Applies the ±2% Snap Tolerance.
   * If raw ratio is within ±0.02 of target ratio (or major ticks), snaps precisely to it!
   */
  private evaluateSnap(isRelease: boolean): void {
    const delta = Math.abs(this.currentRatio - this.targetRatio);

    if (delta <= this.snapTolerance) {
      if (!this.isSnapped) {
        this.frictionEventsCount++;
      }
      this.currentRatio = this.targetRatio;
      this.isSnapped = true;
    } else {
      // Check intermediate major fraction ticks (0.25, 0.5, 0.75, 1.0)
      const majorFractions = [0.25, 0.5, 0.75, 1.0];
      let snappedToMajor = false;

      for (const tick of majorFractions) {
        if (Math.abs(this.currentRatio - tick) <= this.snapTolerance) {
          this.currentRatio = tick;
          this.isSnapped = true;
          snappedToMajor = true;
          break;
        }
      }

      if (!snappedToMajor) {
        this.isSnapped = false;
      }
    }
  }

  private notifyUpdate(): void {
    if (this.options.onUpdate) {
      this.options.onUpdate(this.getState());
    }
  }

  public getState(): CylinderState {
    const latencyMs = performance.now() - this.mountTimeMs;
    const currentVolumeMl = Math.round(this.currentRatio * this.options.maxCapacityMl);
    const isCorrect = Math.abs(this.currentRatio - this.targetRatio) < 0.001;

    return {
      currentRatio: Number(this.currentRatio.toFixed(4)),
      currentVolumeMl,
      isSnapped: this.isSnapped,
      snappedRatio: this.isSnapped ? this.currentRatio : undefined,
      isCorrect,
      firstInteractionMs: Number(this.firstInteractionMs.toFixed(1)),
      latencyMs: Number(latencyMs.toFixed(1)),
      frictionEventsCount: this.frictionEventsCount,
      pointerType: this.pointerType,
    };
  }

  public reset(): void {
    this.currentRatio = 0;
    this.isSnapped = false;
    this.render();
    this.notifyUpdate();
  }

  private getCylinderMetrics(width: number, height: number) {
    const cylWidth = Math.min(width * 0.42, 140);
    const cylHeight = height * 0.72;
    const cylLeft = (width - cylWidth) / 2;
    const cylTop = height * 0.12;
    const cylBottom = cylTop + cylHeight;

    return { cylLeft, cylTop, cylWidth, cylHeight, cylBottom };
  }

  private startRenderLoop(): void {
    const loop = () => {
      this.wavePhase += 0.08;
      if (!this.isDragging && this.waveAmplitude > 0) {
        this.waveAmplitude *= 0.94; // Gentle damping
        if (this.waveAmplitude < 0.05) this.waveAmplitude = 0;
      }
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private render(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    this.ctx.clearRect(0, 0, w, h);

    const metrics = this.getCylinderMetrics(w, h);
    const { cylLeft, cylTop, cylWidth, cylHeight, cylBottom } = metrics;
    const liquidTop = cylBottom - (this.currentRatio * cylHeight);

    // 1. Draw Cylinder Background & Shadow
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(241, 245, 249, 0.45)';
    this.ctx.strokeStyle = '#94A3B8';
    this.ctx.lineWidth = 3;

    // Curved bottom
    this.ctx.beginPath();
    this.ctx.moveTo(cylLeft, cylTop);
    this.ctx.lineTo(cylLeft, cylBottom - 10);
    this.ctx.quadraticCurveTo(cylLeft, cylBottom, cylLeft + 15, cylBottom);
    this.ctx.lineTo(cylLeft + cylWidth - 15, cylBottom);
    this.ctx.quadraticCurveTo(cylLeft + cylWidth, cylBottom, cylLeft + cylWidth, cylBottom - 10);
    this.ctx.lineTo(cylLeft + cylWidth, cylTop);
    this.ctx.stroke();
    this.ctx.fill();

    // 2. Draw Liquid Fluid
    if (this.currentRatio > 0.005) {
      this.ctx.save();
      // Clip to cylinder interior
      this.ctx.beginPath();
      this.ctx.moveTo(cylLeft + 2, cylTop);
      this.ctx.lineTo(cylLeft + 2, cylBottom - 10);
      this.ctx.quadraticCurveTo(cylLeft + 2, cylBottom - 2, cylLeft + 15, cylBottom - 2);
      this.ctx.lineTo(cylLeft + cylWidth - 15, cylBottom - 2);
      this.ctx.quadraticCurveTo(cylLeft + cylWidth - 2, cylBottom - 2, cylLeft + cylWidth - 2, cylBottom - 10);
      this.ctx.lineTo(cylLeft + cylWidth - 2, cylTop);
      this.ctx.closePath();
      this.ctx.clip();

      // Fluid Gradient
      const fluidGrad = this.ctx.createLinearGradient(cylLeft, 0, cylLeft + cylWidth, 0);
      fluidGrad.addColorStop(0, '#2563EB');
      fluidGrad.addColorStop(0.5, '#3B82F6');
      fluidGrad.addColorStop(1, '#1D4ED8');

      this.ctx.fillStyle = fluidGrad;
      this.ctx.beginPath();
      this.ctx.moveTo(cylLeft, cylBottom);
      this.ctx.lineTo(cylLeft, liquidTop);

      // Procedural surface meniscus wave
      const points = 20;
      for (let i = 0; i <= points; i++) {
        const px = cylLeft + (i / points) * cylWidth;
        const py = liquidTop + Math.sin(this.wavePhase + (i * 0.5)) * this.waveAmplitude;
        this.ctx.lineTo(px, py);
      }

      this.ctx.lineTo(cylLeft + cylWidth, cylBottom);
      this.ctx.closePath();
      this.ctx.fill();

      // Meniscus highlight line
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.ellipse(
        cylLeft + cylWidth / 2,
        liquidTop,
        cylWidth / 2 - 3,
        4 + this.waveAmplitude * 0.4,
        0,
        0,
        Math.PI * 2
      );
      this.ctx.stroke();

      this.ctx.restore();
    }

    // 3. Draw Graduation Tick Marks & Fraction Labels
    this.renderTicks(metrics);

    // 4. Draw Snap Tolerance Aura Indicator
    if (this.isSnapped) {
      this.renderSnapGlow(metrics, liquidTop);
    }

    // 5. Draw Interactive Drag Handle (Tablet-Friendly Touch Target)
    this.renderDragHandle(metrics, liquidTop);

    this.ctx.restore();
  }

  private renderTicks(m: any): void {
    const { cylLeft, cylTop, cylWidth, cylHeight, cylBottom } = m;
    const ticksCount = 10;

    this.ctx.font = '600 12px Inter, system-ui, sans-serif';
    this.ctx.fillStyle = '#475569';
    this.ctx.strokeStyle = '#64748B';

    for (let i = 0; i <= ticksCount; i++) {
      const ratio = i / ticksCount;
      const y = cylBottom - (ratio * cylHeight);
      const isMajor = i % 2 === 0;
      const isTarget = Math.abs(ratio - this.targetRatio) < 0.01;
      const tickLen = isMajor ? 18 : 10;

      this.ctx.lineWidth = isTarget ? 3 : isMajor ? 2 : 1;
      this.ctx.strokeStyle = isTarget ? '#2563EB' : isMajor ? '#334155' : '#94A3B8';

      // Left tick
      this.ctx.beginPath();
      this.ctx.moveTo(cylLeft, y);
      this.ctx.lineTo(cylLeft + tickLen, y);
      this.ctx.stroke();

      // Right tick
      this.ctx.beginPath();
      this.ctx.moveTo(cylLeft + cylWidth, y);
      this.ctx.lineTo(cylLeft + cylWidth - tickLen, y);
      this.ctx.stroke();

      // Labels on major ticks
      if (isMajor) {
        const mlValue = Math.round(ratio * this.options.maxCapacityMl);
        this.ctx.fillText(`${mlValue}mL`, cylLeft + cylWidth + 12, y + 4);

        // Fraction label on target
        if (isTarget) {
          this.ctx.fillStyle = '#2563EB';
          this.ctx.font = 'bold 13px Inter, sans-serif';
          this.ctx.fillText(`★ ${this.options.targetFraction.numerator}/${this.options.targetFraction.denominator}`, cylLeft - 52, y + 4);
          this.ctx.font = '600 12px Inter, sans-serif';
          this.ctx.fillStyle = '#475569';
        }
      }
    }
  }

  private renderSnapGlow(m: any, liquidTop: number): void {
    const { cylLeft, cylWidth } = m;
    this.ctx.save();
    this.ctx.strokeStyle = '#10B981'; // Vibrant emerald green for successful magnetic snap
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
    this.ctx.shadowBlur = 12;

    this.ctx.beginPath();
    this.ctx.moveTo(cylLeft - 6, liquidTop);
    this.ctx.lineTo(cylLeft + cylWidth + 6, liquidTop);
    this.ctx.stroke();

    // Snap badge
    this.ctx.fillStyle = '#10B981';
    this.ctx.font = 'bold 12px Inter, sans-serif';
    this.ctx.fillText('SNAP (±2%)', cylLeft + cylWidth + 8, liquidTop - 12);
    this.ctx.restore();
  }

  private renderDragHandle(m: any, liquidTop: number): void {
    const { cylLeft, cylWidth } = m;
    const handleX = cylLeft + cylWidth + 20;
    const handleY = liquidTop;
    const handleRadius = 22; // Tablet deployment: minimum 44px touch target diameter

    this.ctx.save();
    // Touch circle
    this.ctx.beginPath();
    this.ctx.arc(handleX, handleY, handleRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = this.isDragging ? '#1D4ED8' : '#2563EB';
    this.ctx.shadowColor = 'rgba(37, 99, 235, 0.35)';
    this.ctx.shadowBlur = 10;
    this.ctx.fill();

    this.ctx.strokeStyle = '#FFFFFF';
    this.ctx.lineWidth = 2.5;
    this.ctx.stroke();

    // Arrows icon inside handle
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.beginPath();
    // Up arrow
    this.ctx.moveTo(handleX, handleY - 9);
    this.ctx.lineTo(handleX - 5, handleY - 3);
    this.ctx.lineTo(handleX + 5, handleY - 3);
    this.ctx.closePath();
    this.ctx.fill();
    // Down arrow
    this.ctx.beginPath();
    this.ctx.moveTo(handleX, handleY + 9);
    this.ctx.lineTo(handleX - 5, handleY + 3);
    this.ctx.lineTo(handleX + 5, handleY + 3);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  public destroy(): void {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}
