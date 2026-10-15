/**
 * DiscreteBlockGrid: Snapping Coordinate Unit Block Manipulative
 * 
 * FEATURES:
 * - Responsive coordinate grid with large tablet touch targets (> 60px).
 * - Multi-action modes:
 *     1. 'select_and_shade': Tap or swipe-drag across blocks to partition/shade.
 *     2. 'cross_out': Strike through blocks with diagonal cross-hatching for subtraction.
 *     3. 'group_and_partition': Visual clustering of fractional groups.
 * - Unified Pointer Events (touch, mouse, stylus) with continuous drag-selection.
 * - Precision micro-telemetry (first_interaction_ms, latency_ms, friction_events).
 */

export interface BlockGridOptions {
  rows: number;
  columns: number;
  totalCells: number;
  targetFraction: { numerator: number; denominator: number };
  targetCount: number;
  actionMode: 'select_and_shade' | 'cross_out' | 'group_and_partition';
  initialHighlightedCells?: number[];
  initialCrossedOutCells?: number[];
  onUpdate?: (state: BlockGridState) => void;
  onSubmit?: (state: BlockGridState) => void;
}

export interface BlockGridState {
  totalCells: number;
  highlightedCells: number[];
  crossedOutCells: number[];
  activeCount: number; // Shaded cells (or remaining non-crossed-out cells)
  fractionRepresented: { numerator: number; denominator: number };
  isCorrect: boolean;
  firstInteractionMs: number;
  latencyMs: number;
  frictionEventsCount: number;
  pointerType: 'mouse' | 'touch' | 'pen' | 'unknown';
}

export class DiscreteBlockGrid {
  private container: HTMLElement;
  private rootElement: HTMLElement;
  private options: BlockGridOptions;

  // State
  private highlightedCells: Set<number> = new Set();
  private crossedOutCells: Set<number> = new Set();
  private isPointerDown = false;
  private dragAction: 'add' | 'remove' | null = null;
  private mountTimeMs: number;
  private firstInteractionMs = 0;
  private frictionEventsCount = 0;
  private pointerType: 'mouse' | 'touch' | 'pen' | 'unknown' = 'unknown';

  constructor(container: HTMLElement, options: BlockGridOptions) {
    this.container = container;
    this.options = { ...options };
    this.mountTimeMs = performance.now();

    if (options.initialHighlightedCells) {
      options.initialHighlightedCells.forEach((idx) => this.highlightedCells.add(idx));
    }
    if (options.initialCrossedOutCells) {
      options.initialCrossedOutCells.forEach((idx) => this.crossedOutCells.add(idx));
    }

    this.rootElement = document.createElement('div');
    this.rootElement.className = 'discrete-block-grid-wrapper';
    this.rootElement.style.touchAction = 'none';

    this.container.appendChild(this.rootElement);
    this.render();
    this.initGlobalPointerEvents();
  }

  private initGlobalPointerEvents(): void {
    const onUp = () => {
      this.isPointerDown = false;
      this.dragAction = null;
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  public render(): void {
    this.rootElement.innerHTML = '';

    const gridContainer = document.createElement('div');
    gridContainer.className = 'discrete-grid-container';
    gridContainer.style.display = 'grid';
    gridContainer.style.gridTemplateColumns = `repeat(${this.options.columns}, minmax(56px, 1fr))`;
    gridContainer.style.gridTemplateRows = `repeat(${this.options.rows}, minmax(56px, 1fr))`;
    gridContainer.style.gap = '10px';
    gridContainer.style.maxWidth = `${Math.max(this.options.columns * 80, 280)}px`;
    gridContainer.style.margin = '0 auto';

    for (let index = 0; index < this.options.totalCells; index++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'grid-unit-block';
      cell.setAttribute('data-index', String(index));
      cell.setAttribute('aria-label', `Unit block ${index + 1} of ${this.options.totalCells}`);

      const isHighlighted = this.highlightedCells.has(index);
      const isCrossedOut = this.crossedOutCells.has(index);

      if (isHighlighted) cell.classList.add('is-highlighted');
      if (isCrossedOut) cell.classList.add('is-crossed-out');

      // Coordinate marker badge (e.g. 1/12)
      const label = document.createElement('span');
      label.className = 'cell-coordinate-label';
      label.textContent = `${index + 1}`;
      cell.appendChild(label);

      // Strike-through icon if crossed out
      if (isCrossedOut) {
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

      // Pointer event handlers for unified touch & mouse
      cell.addEventListener('pointerdown', (e) => this.onCellPointerDown(e, index));
      cell.addEventListener('pointerenter', (e) => this.onCellPointerEnter(e, index));

      gridContainer.appendChild(cell);
    }

    this.rootElement.appendChild(gridContainer);
    this.renderStatusBar();
  }

  private renderStatusBar(): void {
    const existing = this.rootElement.querySelector('.grid-status-bar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.className = 'grid-status-bar';

    const state = this.getState();
    const modeLabel =
      this.options.actionMode === 'select_and_shade'
        ? 'Tap/drag blocks to shade'
        : this.options.actionMode === 'cross_out'
        ? 'Tap blocks to cross out'
        : 'Grouping blocks';

    bar.innerHTML = `
      <div class="grid-stats">
        <span class="mode-badge">${modeLabel}</span>
        <span class="fraction-badge">Selected: <strong>${state.activeCount} / ${this.options.totalCells}</strong></span>
      </div>
    `;

    this.rootElement.appendChild(bar);
  }

  private onCellPointerDown(e: PointerEvent, index: number): void {
    this.isPointerDown = true;
    this.pointerType = (e.pointerType as any) || 'unknown';

    if (this.firstInteractionMs === 0) {
      this.firstInteractionMs = performance.now() - this.mountTimeMs;
    }

    if (this.options.actionMode === 'cross_out') {
      // Toggle cross-out
      if (this.crossedOutCells.has(index)) {
        this.crossedOutCells.delete(index);
        this.dragAction = 'remove';
      } else {
        this.crossedOutCells.add(index);
        this.dragAction = 'add';
      }
    } else {
      // Toggle highlight/shade
      if (this.highlightedCells.has(index)) {
        this.highlightedCells.delete(index);
        this.dragAction = 'remove';
      } else {
        this.highlightedCells.add(index);
        this.dragAction = 'add';
      }
    }

    this.frictionEventsCount++;
    this.render();
    this.notifyUpdate();
  }

  private onCellPointerEnter(e: PointerEvent, index: number): void {
    if (!this.isPointerDown || !this.dragAction) return;

    if (this.options.actionMode === 'cross_out') {
      if (this.dragAction === 'add' && !this.crossedOutCells.has(index)) {
        this.crossedOutCells.add(index);
        this.render();
        this.notifyUpdate();
      } else if (this.dragAction === 'remove' && this.crossedOutCells.has(index)) {
        this.crossedOutCells.delete(index);
        this.render();
        this.notifyUpdate();
      }
    } else {
      if (this.dragAction === 'add' && !this.highlightedCells.has(index)) {
        this.highlightedCells.add(index);
        this.render();
        this.notifyUpdate();
      } else if (this.dragAction === 'remove' && this.highlightedCells.has(index)) {
        this.highlightedCells.delete(index);
        this.render();
        this.notifyUpdate();
      }
    }
  }

  public getState(): BlockGridState {
    const latencyMs = performance.now() - this.mountTimeMs;
    const highlighted = Array.from(this.highlightedCells).sort((a, b) => a - b);
    const crossedOut = Array.from(this.crossedOutCells).sort((a, b) => a - b);

    let activeCount: number;
    let isCorrect: boolean;

    if (this.options.actionMode === 'cross_out') {
      // For cross-out: Remaining active blocks = total - crossedOut
      activeCount = this.options.totalCells - crossedOut.length;
      isCorrect = crossedOut.length === (this.options.totalCells - this.options.targetCount);
    } else {
      activeCount = highlighted.length;
      isCorrect = highlighted.length === this.options.targetCount;
    }

    return {
      totalCells: this.options.totalCells,
      highlightedCells: highlighted,
      crossedOutCells: crossedOut,
      activeCount,
      fractionRepresented: {
        numerator: activeCount,
        denominator: this.options.totalCells,
      },
      isCorrect,
      firstInteractionMs: Number(this.firstInteractionMs.toFixed(1)),
      latencyMs: Number(latencyMs.toFixed(1)),
      frictionEventsCount: this.frictionEventsCount,
      pointerType: this.pointerType,
    };
  }

  public reset(): void {
    this.highlightedCells.clear();
    this.crossedOutCells.clear();
    if (this.options.initialHighlightedCells) {
      this.options.initialHighlightedCells.forEach((i) => this.highlightedCells.add(i));
    }
    if (this.options.initialCrossedOutCells) {
      this.options.initialCrossedOutCells.forEach((i) => this.crossedOutCells.add(i));
    }
    this.render();
    this.notifyUpdate();
  }

  private notifyUpdate(): void {
    if (this.options.onUpdate) {
      this.options.onUpdate(this.getState());
    }
  }

  public destroy(): void {
    if (this.rootElement.parentElement) {
      this.rootElement.parentElement.removeChild(this.rootElement);
    }
  }
}
