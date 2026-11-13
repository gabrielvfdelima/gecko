import { ActiveLayer, pushLayer } from '../keyboard';
import { SetClipboardText } from '../../wailsjs/go/main/App';
import { renderDiagram } from './topologyRenderer';
import { exportDiagramImage, openImageExportMenu } from '../export/exportUtils';

export interface DiagramViewerOptions {
  lang: string;
  rawBody: string;
  label: string;
  onEdit?: () => void;
}

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3.5;
const ZOOM_STEP = 0.15;

let activeOverlay: HTMLElement | null = null;
let activeLayer: ActiveLayer | null = null;

async function copyRawDiagramText(text: string): Promise<boolean> {
  try {
    await SetClipboardText(text);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

export function openDiagramViewerModal(opts: DiagramViewerOptions): void {
  const rendered = renderDiagram(opts.lang, opts.rawBody);
  if (!rendered) return;

  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  if (activeLayer) {
    activeLayer.close({ restoreFocus: false });
    activeLayer = null;
  }

  const overlay = document.createElement('div');
  overlay.className = 'gecko-diagram-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `Visualização de ${opts.label}`);

  const box = document.createElement('div');
  box.className = 'gecko-diagram-modal-box';
  box.tabIndex = -1;

  // Header
  const header = document.createElement('div');
  header.className = 'gecko-diagram-modal-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'gecko-diagram-modal-title-group';
  titleGroup.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="1.5" width="5" height="4"/><rect x="9.5" y="1.5" width="5" height="4"/><rect x="5.5" y="10.5" width="5" height="4"/><path d="M4 5.5v2h8v-2M8 7.5v3"/></svg>`;

  const titleSpan = document.createElement('span');
  titleSpan.className = 'gecko-diagram-modal-title';
  titleSpan.textContent = opts.label;
  titleGroup.appendChild(titleSpan);

  const hintSpan = document.createElement('span');
  hintSpan.className = 'gecko-diagram-modal-hint';
  hintSpan.textContent = 'Arraste para mover · Roda do mouse para zoom · Esc fecha';
  titleGroup.appendChild(hintSpan);

  const controls = document.createElement('div');
  controls.className = 'gecko-diagram-modal-controls';

  const makeBtn = (
    textOrSvg: string,
    title: string,
    isHtml = false,
    extraClass = ''
  ): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cm-md-diagram-btn ${extraClass}`.trim();
    btn.title = title;
    btn.setAttribute('aria-label', title);
    if (isHtml) {
      btn.innerHTML = textOrSvg;
    } else {
      btn.textContent = textOrSvg;
    }
    return btn;
  };

  const zoomOutBtn = makeBtn(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="3" y1="8" x2="13" y2="8"/></svg>',
    'Diminuir zoom (-)',
    true
  );
  const zoomReadoutBtn = makeBtn('100%', 'Resetar zoom para 100%', false, 'cm-md-diagram-zoom-readout');
  const zoomInBtn = makeBtn(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>',
    'Aumentar zoom (+)',
    true
  );
  const fitBtn = makeBtn(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg><span>Ajustar</span>',
    'Ajustar à tela (0)',
    true
  );
  const exportBtn = makeBtn(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 11.5v2h11v-2"/></svg><span>Exportar</span>',
    'Exportar topologia (PNG ou JPEG)',
    true
  );
  const copyBtn = makeBtn(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9"/><path d="M11 5V2H2v9h3"/></svg><span>Copiar</span>',
    'Copiar código-fonte do diagrama',
    true
  );
  const editBtn = makeBtn(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg><span>Editar</span>',
    'Editar Markdown bruto',
    true
  );
  const closeBtn = makeBtn(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/></svg>',
    'Fechar visualização (Esc)',
    true
  );

  controls.append(zoomOutBtn, zoomReadoutBtn, zoomInBtn, fitBtn);
  controls.appendChild(exportBtn);
  controls.appendChild(copyBtn);
  if (opts.onEdit) controls.appendChild(editBtn);
  controls.appendChild(closeBtn);

  header.append(titleGroup, controls);

  // Viewport
  const viewport = document.createElement('div');
  viewport.className = 'gecko-diagram-modal-viewport';

  const stage = document.createElement('div');
  stage.className = 'gecko-diagram-modal-stage';
  const svgEl = rendered.svg;
  stage.appendChild(svgEl);
  viewport.appendChild(stage);

  box.append(header, viewport);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  let currentZoom = 1;

  const applyZoom = (nextZoom: number) => {
    currentZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(nextZoom * 100) / 100));
    const targetW = Math.round(rendered.width * currentZoom);
    const targetH = Math.round(rendered.height * currentZoom);
    svgEl.setAttribute('width', String(targetW));
    svgEl.setAttribute('height', String(targetH));
    zoomReadoutBtn.textContent = `${Math.round(currentZoom * 100)}%`;
  };

  const fitToViewport = () => {
    const availW = Math.max(200, viewport.clientWidth - 48);
    const availH = Math.max(200, viewport.clientHeight - 48);
    const scaleW = availW / rendered.width;
    const scaleH = availH / rendered.height;
    const fitScale = Math.min(2.0, Math.max(MIN_ZOOM, Math.min(scaleW, scaleH)));
    applyZoom(fitScale);
  };

  // Drag-to-pan inside modal viewport
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartScrollLeft = 0;
  let panStartScrollTop = 0;

  const onWindowMove = (e: MouseEvent) => {
    if (!isPanning) return;
    viewport.scrollLeft = panStartScrollLeft - (e.clientX - panStartX);
    viewport.scrollTop = panStartScrollTop - (e.clientY - panStartY);
  };

  const stopPanning = () => {
    if (!isPanning) return;
    isPanning = false;
    viewport.classList.remove('is-panning');
    window.removeEventListener('mousemove', onWindowMove);
    window.removeEventListener('mouseup', stopPanning);
  };

  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartScrollLeft = viewport.scrollLeft;
    panStartScrollTop = viewport.scrollTop;
    viewport.classList.add('is-panning');
    window.addEventListener('mousemove', onWindowMove);
    window.addEventListener('mouseup', stopPanning);
    e.preventDefault();
  });

  const close = (restoreFocus = true) => {
    stopPanning();
    if (activeOverlay === overlay) {
      overlay.remove();
      activeOverlay = null;
    }
    const layer = activeLayer;
    activeLayer = null;
    layer?.close({ restoreFocus });
  };

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      applyZoom(currentZoom + delta);
    },
    { passive: false }
  );

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) {
      close(true);
    }
  });

  zoomOutBtn.addEventListener('click', () => applyZoom(currentZoom - ZOOM_STEP));
  zoomInBtn.addEventListener('click', () => applyZoom(currentZoom + ZOOM_STEP));
  zoomReadoutBtn.addEventListener('click', () => applyZoom(1));
  fitBtn.addEventListener('click', fitToViewport);

  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openImageExportMenu(exportBtn, (format, theme) =>
      exportDiagramImage({
        svg: svgEl,
        width: rendered.width,
        height: rendered.height,
        label: rendered.label,
        format,
        theme,
      })
    );
  });

  copyBtn.addEventListener('click', async () => {
    const ok = await copyRawDiagramText(opts.rawBody);
    const labelSpan = copyBtn.querySelector('span');
    if (ok && labelSpan) {
      labelSpan.textContent = 'Copiado';
      setTimeout(() => {
        if (labelSpan.isConnected) labelSpan.textContent = 'Copiar';
      }, 1400);
    }
  });

  editBtn.addEventListener('click', () => {
    close(false);
    opts.onEdit?.();
  });

  closeBtn.addEventListener('click', () => close(true));

  // Fit diagram nicely on initial open if larger than viewport
  requestAnimationFrame(() => {
    if (rendered.width > viewport.clientWidth - 48 || rendered.height > viewport.clientHeight - 48) {
      fitToViewport();
    } else {
      applyZoom(1);
    }
  });

  activeLayer = pushLayer({
    id: 'diagram-viewer',
    element: box,
    kind: 'modal',
    initialFocus: fitBtn,
    onEscape: () => {
      close(true);
      return true;
    },
    onKeyDown: (e) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        applyZoom(currentZoom + ZOOM_STEP);
        return true;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        applyZoom(currentZoom - ZOOM_STEP);
        return true;
      }
      if (e.key === '0') {
        e.preventDefault();
        fitToViewport();
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        viewport.scrollTop -= 48;
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        viewport.scrollTop += 48;
        return true;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        viewport.scrollLeft -= 48;
        return true;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        viewport.scrollLeft += 48;
        return true;
      }
      return false;
    },
  });
}
