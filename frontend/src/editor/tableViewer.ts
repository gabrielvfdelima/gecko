import { ActiveLayer, pushLayer } from '../keyboard';
import { SetClipboardText } from '../../wailsjs/go/main/App';
import { exportTableImage } from '../export/canvasTable';
import { openImageExportMenu } from '../export/exportUtils';

export interface ParsedMarkdownTable {
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
  rowLineOffsets: number[];
}

export interface InteractiveTableOptions {
  parsed: ParsedMarkdownTable;
  widthKey: string;
  renderCellHtml: (text: string) => string;
  inspectable?: boolean;
  getScale?: () => number;
  onOpenLink?: (href: string) => void;
  onInspect?: () => void;
  onDoubleClickEdit?: () => void;
  onWidthsChange?: (widths: number[] | null) => void;
}

export interface InteractiveTableController {
  table: HTMLTableElement;
  applyScale: () => void;
  syncFromCache: () => void;
  resetWidths: () => void;
  fitColumnsToWidth: (targetTotalWidth: number) => void;
  hasCustomWidths: () => boolean;
}

export interface TableViewerModalOptions {
  rawText: string;
  parsed: ParsedMarkdownTable;
  widthKey: string;
  renderCellHtml: (text: string) => string;
  onOpenLink?: (href: string) => void;
  onEdit?: () => void;
  onWidthsSynced?: () => void;
}

const MIN_COL_WIDTH = 56;
const MAX_COL_WIDTH = 960;
const AUTO_FIT_MIN = 72;
const AUTO_FIT_MAX = 520;
const MAX_CACHED_TABLES = 64;

const MIN_MODAL_ZOOM = 0.7;
const MAX_MODAL_ZOOM = 1.6;
const MODAL_ZOOM_STEP = 0.1;

// Persists resized column widths (at 1x logical px) across raw/preview toggles without mutating Markdown
const tableColWidthsCache = new Map<string, number[]>();

let activeTableOverlay: HTMLElement | null = null;
let activeTableLayer: ActiveLayer | null = null;

export function getTableWidthKey(parsed: ParsedMarkdownTable): string {
  const headerSig = parsed.headers.join('\u0001');
  const firstCell = parsed.rows[0]?.[0] ?? '';
  return `${headerSig}::${parsed.headers.length}::${firstCell.slice(0, 32)}`;
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((col) => col.trim());
}

export function parseMarkdownTable(rawText: string): ParsedMarkdownTable | null {
  const lines = rawText.split('\n');
  if (lines.length < 2) return null;

  const headerLine = lines[0];
  const delimiterLine = lines[1];

  const headers = splitTableRow(headerLine);
  if (headers.length === 0) return null;

  const delimiterCols = splitTableRow(delimiterLine);
  const alignments: ('left' | 'center' | 'right')[] = [];
  for (let i = 0; i < headers.length; i++) {
    const d = delimiterCols[i] || '';
    const hasLeftColon = d.startsWith(':');
    const hasRightColon = d.endsWith(':');
    if (hasLeftColon && hasRightColon) {
      alignments.push('center');
    } else if (hasRightColon) {
      alignments.push('right');
    } else {
      alignments.push('left');
    }
  }

  const rows: string[][] = [];
  const rowLineOffsets: number[] = [0];
  let currentOffset = headerLine.length + 1;
  currentOffset += delimiterLine.length + 1;

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    rowLineOffsets.push(currentOffset);
    currentOffset += line.length + 1;
    if (line.trim().length === 0 || !line.includes('|')) continue;
    const cols = splitTableRow(line);
    while (cols.length < headers.length) {
      cols.push('');
    }
    rows.push(cols.slice(0, headers.length));
  }

  return { headers, alignments, rows, rowLineOffsets };
}

export function getSavedColumnWidths(key: string, colCount: number): number[] | null {
  const cached = tableColWidthsCache.get(key);
  if (!cached || cached.length !== colCount) return null;
  // Refresh LRU order
  tableColWidthsCache.delete(key);
  tableColWidthsCache.set(key, cached);
  return cached.map((w) => clampColWidth(w));
}

function saveColumnWidths(key: string, widths: number[]): void {
  const normalized = widths.map((w) => clampColWidth(w));
  if (tableColWidthsCache.has(key)) {
    tableColWidthsCache.delete(key);
  }
  tableColWidthsCache.set(key, normalized);
  if (tableColWidthsCache.size > MAX_CACHED_TABLES) {
    const oldest = tableColWidthsCache.keys().next().value;
    if (oldest !== undefined) tableColWidthsCache.delete(oldest);
  }
}

function clearSavedColumnWidths(key: string): void {
  tableColWidthsCache.delete(key);
}

function clampColWidth(width: number): number {
  return Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, width)));
}

export async function copyRawTableText(text: string): Promise<boolean> {
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

export function makeTableToolbarButton(
  htmlOrText: string,
  title: string,
  isHtml = false,
  extraClass = ''
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `cm-md-diagram-btn ${extraClass}`.trim();
  btn.title = title;
  btn.setAttribute('aria-label', title);
  if (isHtml) {
    btn.innerHTML = htmlOrText;
  } else {
    btn.textContent = htmlOrText;
  }
  return btn;
}

function measureColumnIdealWidth(
  table: HTMLTableElement,
  th: HTMLTableCellElement,
  cells: HTMLTableCellElement[]
): number {
  let ctx: CanvasRenderingContext2D | null = null;
  let baseFont = '13px sans-serif';
  let boldFont = '600 13px sans-serif';

  try {
    const canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    if (ctx && typeof window.getComputedStyle === 'function') {
      const style = window.getComputedStyle(table);
      const fontFamily = style.fontFamily || 'sans-serif';
      baseFont = `13px ${fontFamily}`;
      boldFont = `600 13px ${fontFamily}`;
    }
  } catch {
    ctx = null;
  }

  const measureTextLine = (text: string, bold: boolean): number => {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    if (ctx) {
      ctx.font = bold ? boldFont : baseFont;
      return ctx.measureText(trimmed).width;
    }
    return trimmed.length * (bold ? 8.4 : 7.8);
  };

  const extractHtmlLines = (el: HTMLElement): string[] => {
    const html = el.innerHTML || el.textContent || '';
    const rawLines = html.split(/<br\s*\/?>/gi);
    const scratch = document.createElement('div');
    return rawLines.map((raw) => {
      scratch.innerHTML = raw;
      return scratch.textContent || '';
    });
  };

  const labelEl = th.querySelector('.cm-md-table-th-content') as HTMLElement | null;
  let maxTextPx = 0;
  for (const line of extractHtmlLines(labelEl ?? th)) {
    maxTextPx = Math.max(maxTextPx, measureTextLine(line, true));
  }

  for (const td of cells) {
    for (const line of extractHtmlLines(td)) {
      maxTextPx = Math.max(maxTextPx, measureTextLine(line, false));
    }
  }

  return Math.round(Math.min(AUTO_FIT_MAX, Math.max(AUTO_FIT_MIN, maxTextPx + 30)));
}

export function createInteractiveTable(opts: InteractiveTableOptions): InteractiveTableController {
  const { parsed, widthKey, renderCellHtml } = opts;
  const colCount = parsed.headers.length;
  const getScale = opts.getScale ?? (() => 1);

  const table = document.createElement('table');
  table.className = opts.inspectable ? 'cm-md-table is-inspectable' : 'cm-md-table';

  const colgroup = document.createElement('colgroup');
  const colElements: HTMLTableColElement[] = [];
  for (let i = 0; i < colCount; i++) {
    const col = document.createElement('col');
    colElements.push(col);
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  const headerCells: HTMLTableCellElement[] = [];
  const columnBodyCells: HTMLTableCellElement[][] = Array.from({ length: colCount }, () => []);

  let currentWidths: number[] | null = getSavedColumnWidths(widthKey, colCount);
  let lastResizeAt = 0;

  const applyWidthsToDom = () => {
    const scale = getScale();
    if (!currentWidths || currentWidths.length !== colCount) {
      table.classList.remove('is-fixed-layout');
      table.style.width = '100%';
      for (const col of colElements) {
        col.style.width = '';
      }
      return;
    }

    table.classList.add('is-fixed-layout');
    let totalScaledWidth = 0;
    for (let i = 0; i < colCount; i++) {
      const scaledPx = Math.max(Math.round(MIN_COL_WIDTH * scale), Math.round(currentWidths[i] * scale));
      colElements[i].style.width = `${scaledPx}px`;
      totalScaledWidth += scaledPx;
    }
    table.style.width = `${totalScaledWidth}px`;
  };

  const captureCurrentMeasuredWidths = (): number[] => {
    const scale = Math.max(0.25, getScale());
    return headerCells.map((th) => {
      const measured = typeof th.getBoundingClientRect === 'function' ? th.getBoundingClientRect().width : 0;
      const fallback = measured > 0 ? measured / scale : 150;
      return clampColWidth(fallback);
    });
  };

  // Header
  const thead = document.createElement('thead');
  const headerTr = document.createElement('tr');

  parsed.headers.forEach((h, colIdx) => {
    const th = document.createElement('th');
    th.style.textAlign = parsed.alignments[colIdx] || 'left';

    const label = document.createElement('div');
    label.className = 'cm-md-table-th-content';
    label.innerHTML = renderCellHtml(h);

    const resizer = document.createElement('div');
    resizer.className = 'cm-md-table-resizer';
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-orientation', 'vertical');
    resizer.setAttribute('aria-label', `Redimensionar coluna ${colIdx + 1}`);
    resizer.title = 'Arraste para redimensionar · Clique duplo para ajustar ao conteúdo';
    resizer.dataset.colIndex = String(colIdx);

    resizer.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    resizer.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!currentWidths) {
        currentWidths = captureCurrentMeasuredWidths();
      }
      currentWidths[colIdx] = measureColumnIdealWidth(table, th, columnBodyCells[colIdx]);
      saveColumnWidths(widthKey, currentWidths);
      applyWidthsToDom();
      lastResizeAt = Date.now();
      opts.onWidthsChange?.([...currentWidths]);
    });

    resizer.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      if (!currentWidths) {
        currentWidths = captureCurrentMeasuredWidths();
        applyWidthsToDom();
      }

      const startX = e.clientX;
      const startWidth = currentWidths[colIdx];
      const scale = Math.max(0.25, getScale());
      const prevBodyCursor = document.body?.style?.cursor ?? '';

      resizer.classList.add('is-resizing');
      th.classList.add('is-resizing');
      if (document.body?.style) {
        document.body.style.cursor = 'col-resize';
      }

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!currentWidths) return;
        const dx = (moveEvent.clientX - startX) / scale;
        currentWidths[colIdx] = clampColWidth(startWidth + dx);
        applyWidthsToDom();
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        resizer.classList.remove('is-resizing');
        th.classList.remove('is-resizing');
        if (document.body?.style) {
          document.body.style.cursor = prevBodyCursor;
        }
        lastResizeAt = Date.now();
        if (currentWidths) {
          saveColumnWidths(widthKey, currentWidths);
          opts.onWidthsChange?.([...currentWidths]);
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    th.append(label, resizer);
    headerCells.push(th);
    headerTr.appendChild(th);
  });

  thead.appendChild(headerTr);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  parsed.rows.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((cell, colIdx) => {
      const td = document.createElement('td');
      td.style.textAlign = parsed.alignments[colIdx] || 'left';
      td.innerHTML = renderCellHtml(cell);
      columnBodyCells[colIdx]?.push(td);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  // Unified click/link/inspect handling
  table.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const anchor = typeof target.closest === 'function' ? target.closest('a') : target.tagName === 'A' ? target : null;
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.getAttribute('href');
      if (href) opts.onOpenLink?.(href);
      return;
    }

    if (
      (typeof target.closest === 'function' && target.closest('.cm-md-table-resizer')) ||
      target.className?.includes?.('cm-md-table-resizer')
    ) {
      return;
    }

    if (Date.now() - lastResizeAt < 200) {
      return;
    }

    const selectedText = typeof window.getSelection === 'function' ? window.getSelection()?.toString() ?? '' : '';
    if (selectedText.length > 0) {
      return;
    }

    if (opts.inspectable && opts.onInspect) {
      e.preventDefault();
      e.stopPropagation();
      opts.onInspect();
    }
  });

  table.addEventListener('dblclick', (e) => {
    if (opts.inspectable) return;
    const target = e.target as HTMLElement | null;
    if (target && typeof target.closest === 'function' && target.closest('.cm-md-table-resizer')) return;
    if (opts.onDoubleClickEdit) {
      e.preventDefault();
      e.stopPropagation();
      opts.onDoubleClickEdit();
    }
  });

  applyWidthsToDom();

  return {
    table,
    applyScale: () => {
      applyWidthsToDom();
    },
    syncFromCache: () => {
      currentWidths = getSavedColumnWidths(widthKey, colCount);
      applyWidthsToDom();
    },
    resetWidths: () => {
      currentWidths = null;
      clearSavedColumnWidths(widthKey);
      applyWidthsToDom();
      opts.onWidthsChange?.(null);
    },
    fitColumnsToWidth: (targetTotalWidth: number) => {
      const avail = Math.max(colCount * MIN_COL_WIDTH, Math.floor(targetTotalWidth));
      const base = currentWidths ?? captureCurrentMeasuredWidths();
      const baseSum = base.reduce((acc, w) => acc + w, 0) || colCount * 150;
      let next = base.map((w) => clampColWidth((w / baseSum) * avail));
      const diff = avail - next.reduce((acc, w) => acc + w, 0);
      if (next.length > 0) {
        next[next.length - 1] = clampColWidth(next[next.length - 1] + diff);
      }
      currentWidths = next;
      saveColumnWidths(widthKey, currentWidths);
      applyWidthsToDom();
      opts.onWidthsChange?.([...currentWidths]);
    },
    hasCustomWidths: () => currentWidths !== null,
  };
}

export function openTableViewerModal(opts: TableViewerModalOptions): void {
  if (activeTableOverlay) {
    activeTableOverlay.remove();
    activeTableOverlay = null;
  }
  if (activeTableLayer) {
    activeTableLayer.close({ restoreFocus: false });
    activeTableLayer = null;
  }

  const rowCount = opts.parsed.rows.length;
  const colCount = opts.parsed.headers.length;
  const label = `Tabela · ${rowCount}×${colCount}`;

  const overlay = document.createElement('div');
  overlay.className = 'gecko-diagram-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `Visualização de ${label}`);

  const box = document.createElement('div');
  box.className = 'gecko-diagram-modal-box';
  box.tabIndex = -1;

  // Header
  const header = document.createElement('div');
  header.className = 'gecko-diagram-modal-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'gecko-diagram-modal-title-group';
  titleGroup.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11"/><line x1="1.5" y1="6.5" x2="14.5" y2="6.5"/><line x1="6.5" y1="2.5" x2="6.5" y2="13.5"/></svg>`;

  const titleSpan = document.createElement('span');
  titleSpan.className = 'gecko-diagram-modal-title';
  titleSpan.textContent = label;
  titleGroup.appendChild(titleSpan);

  const hintSpan = document.createElement('span');
  hintSpan.className = 'gecko-diagram-modal-hint';
  hintSpan.textContent = 'Arraste a borda das colunas para redimensionar · Ctrl+Scroll para zoom · Esc fecha';
  titleGroup.appendChild(hintSpan);

  const controls = document.createElement('div');
  controls.className = 'gecko-diagram-modal-controls';

  const zoomOutBtn = makeTableToolbarButton(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="3" y1="8" x2="13" y2="8"/></svg>',
    'Diminuir zoom (-)',
    true
  );
  const zoomReadoutBtn = makeTableToolbarButton('100%', 'Resetar zoom para 100%', false, 'cm-md-diagram-zoom-readout');
  const zoomInBtn = makeTableToolbarButton(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>',
    'Aumentar zoom (+)',
    true
  );
  const fitBtn = makeTableToolbarButton(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg><span>Ajustar</span>',
    'Ajustar colunas à largura da tela (0)',
    true
  );
  const resetColsBtn = makeTableToolbarButton(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8a5 5 0 1 0 1.4-3.5L3 6"/><polyline points="3 2.5 3 6 6.5 6"/></svg><span>Colunas</span>',
    'Resetar larguras das colunas para automático',
    true
  );
  const exportBtn = makeTableToolbarButton(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 11.5v2h11v-2"/></svg><span>Exportar</span>',
    'Exportar tabela (PNG ou JPEG)',
    true
  );
  const copyBtn = makeTableToolbarButton(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9"/><path d="M11 5V2H2v9h3"/></svg><span>Copiar</span>',
    'Copiar tabela Markdown',
    true
  );
  const editBtn = makeTableToolbarButton(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg><span>Editar</span>',
    'Editar Markdown bruto',
    true
  );
  const closeBtn = makeTableToolbarButton(
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/></svg>',
    'Fechar visualização (Esc)',
    true
  );

  controls.append(zoomOutBtn, zoomReadoutBtn, zoomInBtn, fitBtn, resetColsBtn, exportBtn, copyBtn);
  if (opts.onEdit) controls.appendChild(editBtn);
  controls.appendChild(closeBtn);
  header.append(titleGroup, controls);

  const viewport = document.createElement('div');
  viewport.className = 'gecko-diagram-modal-viewport gecko-table-modal-viewport';

  const stage = document.createElement('div');
  stage.className = 'gecko-table-modal-stage';

  let currentScale = 1;

  const updateResetButtonState = (custom: boolean) => {
    resetColsBtn.classList.toggle('is-active', custom);
  };

  const controller = createInteractiveTable({
    parsed: opts.parsed,
    widthKey: opts.widthKey,
    renderCellHtml: opts.renderCellHtml,
    inspectable: false,
    getScale: () => currentScale,
    onOpenLink: opts.onOpenLink,
    onWidthsChange: (widths) => {
      updateResetButtonState(widths !== null);
      opts.onWidthsSynced?.();
    },
  });

  updateResetButtonState(controller.hasCustomWidths());
  stage.appendChild(controller.table);
  viewport.appendChild(stage);
  box.append(header, viewport);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  activeTableOverlay = overlay;

  const applyScale = (nextScale: number) => {
    currentScale = Math.min(MAX_MODAL_ZOOM, Math.max(MIN_MODAL_ZOOM, Math.round(nextScale * 100) / 100));
    stage.style.setProperty('--table-scale', String(currentScale));
    zoomReadoutBtn.textContent = `${Math.round(currentScale * 100)}%`;
    controller.applyScale();
  };

  const fitColumnsToViewport = () => {
    const availW = Math.max(320, (viewport.clientWidth - 48) / Math.max(0.5, currentScale));
    controller.fitColumnsToWidth(availW);
  };

  const close = (restoreFocus = true) => {
    if (activeTableOverlay === overlay) {
      overlay.remove();
      activeTableOverlay = null;
    }
    const layer = activeTableLayer;
    activeTableLayer = null;
    layer?.close({ restoreFocus });
    opts.onWidthsSynced?.();
  };

  viewport.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? MODAL_ZOOM_STEP : -MODAL_ZOOM_STEP;
      applyScale(currentScale + delta);
    },
    { passive: false }
  );

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close(true);
  });

  zoomOutBtn.addEventListener('click', () => applyScale(currentScale - MODAL_ZOOM_STEP));
  zoomInBtn.addEventListener('click', () => applyScale(currentScale + MODAL_ZOOM_STEP));
  zoomReadoutBtn.addEventListener('click', () => applyScale(1));
  fitBtn.addEventListener('click', fitColumnsToViewport);
  resetColsBtn.addEventListener('click', () => controller.resetWidths());

  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openImageExportMenu(exportBtn, (format, theme) =>
      exportTableImage({
        parsed: opts.parsed,
        widthKey: opts.widthKey,
        format,
        theme,
      })
    );
  });

  copyBtn.addEventListener('click', async () => {
    const ok = await copyRawTableText(opts.rawText);
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

  applyScale(1);

  activeTableLayer = pushLayer({
    id: 'table-viewer',
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
        applyScale(currentScale + MODAL_ZOOM_STEP);
        return true;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        applyScale(currentScale - MODAL_ZOOM_STEP);
        return true;
      }
      if (e.key === '0') {
        e.preventDefault();
        fitColumnsToViewport();
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
