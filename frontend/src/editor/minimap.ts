import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/**
 * Ultra-fast, zero-dependency Minimap for CodeMirror 6.
 * Renders a 60px preview of the Markdown document with heading/code highlighting
 * and an interactive draggable viewport slider.
 */
export const geckoMinimapPlugin = ViewPlugin.fromClass(
  class {
    container: HTMLElement;
    canvas: HTMLCanvasElement;
    slider: HTMLElement;
    ctx: CanvasRenderingContext2D | null;
    rafId: number | null = null;

    isDragging = false;
    dragStartY = 0;
    dragStartScrollTop = 0;

    boundScrollHandler: () => void;
    boundPointerMove: (e: PointerEvent) => void;
    boundPointerUp: (e: PointerEvent) => void;
    boundThemeChangeHandler: () => void;

    constructor(readonly view: EditorView) {
      this.container = document.createElement('div');
      this.container.className = 'cm-gecko-minimap';

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'cm-gecko-minimap-canvas';
      this.canvas.width = 60;
      this.ctx = this.canvas.getContext('2d');

      this.slider = document.createElement('div');
      this.slider.className = 'cm-gecko-minimap-slider';

      this.container.appendChild(this.canvas);
      this.container.appendChild(this.slider);

      view.dom.appendChild(this.container);

      // Listeners
      this.boundScrollHandler = () => this.scheduleRender();
      this.view.scrollDOM.addEventListener('scroll', this.boundScrollHandler, { passive: true });

      this.boundThemeChangeHandler = () => this.scheduleRender();
      window.addEventListener('gecko:theme-color-changed', this.boundThemeChangeHandler);

      this.boundPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
      this.boundPointerUp = (e: PointerEvent) => this.handlePointerUp(e);

      this.slider.addEventListener('pointerdown', (e) => this.handleSliderPointerDown(e));
      this.container.addEventListener('pointerdown', (e) => this.handleContainerPointerDown(e));

      this.scheduleRender();
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.geometryChanged ||
        update.heightChanged
      ) {
        this.scheduleRender();
      }
    }

    destroy(): void {
      if (this.rafId != null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.view.scrollDOM.removeEventListener('scroll', this.boundScrollHandler);
      window.removeEventListener('gecko:theme-color-changed', this.boundThemeChangeHandler);
      window.removeEventListener('pointermove', this.boundPointerMove);
      window.removeEventListener('pointerup', this.boundPointerUp);
      this.container.remove();
    }

    scheduleRender(): void {
      if (this.rafId != null) return;
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.render();
      });
    }

    render(): void {
      const H = this.container.clientHeight || this.view.dom.clientHeight || 400;
      if (H <= 0) return;

      if (this.canvas.height !== H) {
        this.canvas.height = H;
      }

      const ctx = this.ctx;
      if (!ctx) return;

      ctx.clearRect(0, 0, 60, H);

      const doc = this.view.state.doc;
      const lineCount = doc.lines;
      if (lineCount === 0) return;

      const scrollDOM = this.view.scrollDOM;
      const scrollHeight = scrollDOM.scrollHeight || 1;
      const clientHeight = scrollDOM.clientHeight || 1;
      const scrollTop = scrollDOM.scrollTop;

      // Vertical line scaling
      const scale = Math.min(2.5, Math.max(0.6, H / lineCount));
      const lh = Math.max(1, scale - 0.4);

      const totalMapHeight = lineCount * scale;
      const maxMapOffset = totalMapHeight - H;
      const mapScrollRatio = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
      const mapOffsetY = maxMapOffset > 0 ? mapScrollRatio * maxMapOffset : 0;

      const headingColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--md-heading')
          .trim() || '#6BC46D';

      // Draw lines on canvas
      for (let i = 1; i <= lineCount; i++) {
        const y = (i - 1) * scale - mapOffsetY;
        if (y < -3 || y > H + 3) continue;

        const line = doc.line(i);
        const text = line.text;
        const trimmed = text.trim();
        if (trimmed.length === 0) continue;

        const indent = text.length - text.trimStart().length;
        const startX = Math.min(24, 4 + indent * 1.5);
        const lineWidth = Math.min(54 - startX, Math.max(3, (trimmed.length / 65) * 50));

        // Heading
        if (trimmed.startsWith('#')) {
          ctx.fillStyle = headingColor;
        } else if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.fillRect(4, y, 52, 1);
          continue;
        } else if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
          ctx.fillStyle = '#58A6FF'; // Blue
        } else if (trimmed.startsWith('>')) {
          ctx.fillStyle = '#D29922'; // Amber
        } else if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
          ctx.fillStyle = 'rgba(230, 237, 243, 0.7)'; // White
        } else {
          ctx.fillStyle = 'rgba(204, 204, 204, 0.28)'; // Muted
        }

        ctx.fillRect(startX, y, lineWidth, lh);
      }

      // Viewport slider position and height
      const sliderTop = (scrollTop / scrollHeight) * H;
      const sliderHeight = Math.max(16, (clientHeight / scrollHeight) * H);

      this.slider.style.top = `${sliderTop}px`;
      this.slider.style.height = `${sliderHeight}px`;
    }

    handleSliderPointerDown(e: PointerEvent): void {
      e.preventDefault();
      e.stopPropagation();
      this.isDragging = true;
      this.dragStartY = e.clientY;
      this.dragStartScrollTop = this.view.scrollDOM.scrollTop;

      window.addEventListener('pointermove', this.boundPointerMove);
      window.addEventListener('pointerup', this.boundPointerUp);
    }

    handleContainerPointerDown(e: PointerEvent): void {
      if (e.target === this.slider) return;
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const H = rect.height || 1;
      const scrollDOM = this.view.scrollDOM;

      const targetScroll = (clickY / H) * scrollDOM.scrollHeight - scrollDOM.clientHeight / 2;
      scrollDOM.scrollTop = Math.max(0, targetScroll);
      this.scheduleRender();
    }

    handlePointerMove(e: PointerEvent): void {
      if (!this.isDragging) return;
      e.preventDefault();

      const H = this.container.clientHeight || 1;
      const deltaY = e.clientY - this.dragStartY;
      const scrollDOM = this.view.scrollDOM;
      const scrollHeight = scrollDOM.scrollHeight;

      const scrollDelta = (deltaY / H) * scrollHeight;
      scrollDOM.scrollTop = this.dragStartScrollTop + scrollDelta;
      this.scheduleRender();
    }

    handlePointerUp(e: PointerEvent): void {
      if (!this.isDragging) return;
      this.isDragging = false;
      window.removeEventListener('pointermove', this.boundPointerMove);
      window.removeEventListener('pointerup', this.boundPointerUp);
    }
  }
);
