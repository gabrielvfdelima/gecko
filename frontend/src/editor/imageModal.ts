import { ActiveLayer, pushLayer } from '../keyboard';
import { SetClipboardText } from '../../wailsjs/go/main/App';

export interface ImageViewerModalOptions {
  resolvedSrc: string;
  rawSrc: string;
  rawMarkdown: string;
  alt: string;
  title?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  onEdit?: () => void;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 0.15;

let activeOverlay: HTMLElement | null = null;
let activeLayer: ActiveLayer | null = null;

async function copyImageSourceText(text: string): Promise<boolean> {
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

export function getActiveImageViewerOverlay(): HTMLElement | null {
  return activeOverlay;
}

export function closeImageViewerModal(restoreFocus = true): void {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  const layer = activeLayer;
  activeLayer = null;
  layer?.close({ restoreFocus });
}

export function openImageViewerModal(opts: ImageViewerModalOptions): void {
  if (!opts.resolvedSrc.trim()) return;

  closeImageViewerModal(false);

  const label = opts.alt.trim() || opts.title?.trim() || extractDisplayFileName(opts.rawSrc);

  const overlay = document.createElement('div');
  overlay.className = 'gecko-diagram-modal-overlay gecko-image-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `Visualização de imagem: ${label}`);

  const box = document.createElement('div');
  box.className = 'gecko-diagram-modal-box';
  box.tabIndex = -1;

  // Header
  const header = document.createElement('div');
  header.className = 'gecko-diagram-modal-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'gecko-diagram-modal-title-group';
  titleGroup.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11"/><circle cx="5.5" cy="6" r="1.1"/><path d="M2.5 11.5l3-3 2.5 2.5 2-2 3.5 3.5"/></svg>';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'gecko-diagram-modal-title';
  titleSpan.textContent = label;
  titleSpan.title = opts.rawSrc;
  titleGroup.appendChild(titleSpan);

  const dimsBadge = document.createElement('span');
  dimsBadge.className = 'gecko-diagram-modal-hint';
  titleGroup.appendChild(dimsBadge);

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
  const copyBtn = makeBtn(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9"/><path d="M11 5V2H2v9h3"/></svg><span>Copiar</span>',
    'Copiar sintaxe Markdown da imagem',
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

  controls.append(zoomOutBtn, zoomReadoutBtn, zoomInBtn, fitBtn, copyBtn);
  if (opts.onEdit) controls.appendChild(editBtn);
  controls.appendChild(closeBtn);
  header.append(titleGroup, controls);

  // Viewport
  const viewport = document.createElement('div');
  viewport.className = 'gecko-diagram-modal-viewport';

  const stage = document.createElement('div');
  stage.className = 'gecko-diagram-modal-stage gecko-image-modal-stage';

  const imgEl = document.createElement('img');
  imgEl.className = 'gecko-image-modal-img';
  imgEl.src = opts.resolvedSrc;
  imgEl.alt = opts.alt || label;
  imgEl.draggable = false;
  stage.appendChild(imgEl);
  viewport.appendChild(stage);

  box.append(header, viewport);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  let baseWidth = opts.naturalWidth && opts.naturalWidth > 0 ? opts.naturalWidth : 0;
  let baseHeight = opts.naturalHeight && opts.naturalHeight > 0 ? opts.naturalHeight : 0;
  let currentZoom = 1;
  let hasFailed = false;

  const updateMetaText = () => {
    if (baseWidth > 0 && baseHeight > 0) {
      dimsBadge.textContent = `${baseWidth} × ${baseHeight} px · Arraste para mover · Roda para zoom · Esc fecha`;
    } else {
      dimsBadge.textContent = 'Arraste para mover · Roda do mouse para zoom · Esc fecha';
    }
  };
  updateMetaText();

  const applyZoom = (nextZoom: number) => {
    if (hasFailed) return;
    currentZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(nextZoom * 100) / 100));
    zoomReadoutBtn.textContent = `${Math.round(currentZoom * 100)}%`;

    if (baseWidth > 0 && baseHeight > 0) {
      imgEl.style.width = `${Math.max(1, Math.round(baseWidth * currentZoom))}px`;
      imgEl.style.height = `${Math.max(1, Math.round(baseHeight * currentZoom))}px`;
    } else {
      imgEl.style.width = '';
      imgEl.style.height = '';
      imgEl.style.transform = `scale(${currentZoom})`;
    }
  };

  const fitToViewport = () => {
    if (hasFailed) return;
    const w = baseWidth || imgEl.naturalWidth || imgEl.clientWidth;
    const h = baseHeight || imgEl.naturalHeight || imgEl.clientHeight;
    if (!w || !h) {
      applyZoom(1);
      return;
    }
    const availW = Math.max(180, viewport.clientWidth - 48);
    const availH = Math.max(180, viewport.clientHeight - 48);
    const scaleW = availW / w;
    const scaleH = availH / h;
    const fitScale = Math.min(2.0, Math.max(MIN_ZOOM, Math.min(scaleW, scaleH)));
    applyZoom(fitScale);
  };

  const syncNaturalDims = () => {
    if (imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
      baseWidth = imgEl.naturalWidth;
      baseHeight = imgEl.naturalHeight;
    } else if (baseWidth === 0 && imgEl.clientWidth > 0 && imgEl.clientHeight > 0) {
      baseWidth = imgEl.clientWidth;
      baseHeight = imgEl.clientHeight;
    }
    updateMetaText();
    if (baseWidth > 0 && baseHeight > 0) {
      if (baseWidth > viewport.clientWidth - 48 || baseHeight > viewport.clientHeight - 48) {
        fitToViewport();
      } else {
        applyZoom(1);
      }
    }
  };

  imgEl.addEventListener('load', syncNaturalDims);
  imgEl.addEventListener('error', () => {
    hasFailed = true;
    stage.innerHTML = '';
    const errBox = document.createElement('div');
    errBox.className = 'cm-md-image-error gecko-image-modal-error';
    const titleEl = document.createElement('div');
    titleEl.className = 'cm-md-image-error-title';
    titleEl.textContent = 'Não foi possível carregar a imagem';
    const pathEl = document.createElement('code');
    pathEl.className = 'cm-md-image-error-path';
    pathEl.textContent = opts.rawSrc;
    errBox.append(titleEl, pathEl);
    stage.appendChild(errBox);
  });

  // Drag-to-pan
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
    if (e.button !== 0 || hasFailed) return;
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
    closeImageViewerModal(restoreFocus);
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

  copyBtn.addEventListener('click', async () => {
    const ok = await copyImageSourceText(opts.rawMarkdown);
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

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        syncNaturalDims();
      } else if (baseWidth > 0 && baseHeight > 0) {
        syncNaturalDims();
      }
    });
  }

  activeLayer = pushLayer({
    id: 'image-viewer',
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

function extractDisplayFileName(rawSrc: string): string {
  const clean = rawSrc.split('?')[0].split('#')[0].trim();
  const slashIdx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  const base = slashIdx >= 0 ? clean.slice(slashIdx + 1) : clean;
  return base || 'Imagem';
}
