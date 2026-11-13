import {
  EditorSelection,
  EditorState,
  Range,
  StateField,
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import { SetClipboardText } from '../../wailsjs/go/main/App';
import { openDiagramViewerModal } from './diagramModal';
import {
  detectDiagramBlock,
  getDiagramDimensions,
  MAX_DIAGRAM_CHARS,
  renderDiagram,
} from './topologyRenderer';
import { exportDiagramImage, openImageExportMenu } from '../export/exportUtils';

const MAX_HYBRID_DOC_LENGTH = 1048576; // 1 MB safeguard
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.15;

interface DiagramZoomState {
  zoom: number;
  fit: boolean;
}

const diagramViewStates = new Map<string, DiagramZoomState>();
const MAX_VIEW_STATES = 64;

function getStateKey(lang: string, rawBody: string): string {
  return `${lang}\0${rawBody}`;
}

function getSavedViewState(lang: string, rawBody: string): DiagramZoomState | undefined {
  return diagramViewStates.get(getStateKey(lang, rawBody));
}

function saveViewState(lang: string, rawBody: string, state: DiagramZoomState): void {
  const key = getStateKey(lang, rawBody);
  if (diagramViewStates.size >= MAX_VIEW_STATES && !diagramViewStates.has(key)) {
    const oldest = diagramViewStates.keys().next().value;
    if (oldest !== undefined) diagramViewStates.delete(oldest);
  }
  diagramViewStates.set(key, state);
}

async function copyText(text: string): Promise<boolean> {
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

export interface FencedDiagramInfo {
  lang: string;
  rawBody: string;
  startLine: number;
  endLine: number;
  from: number;
  to: number;
}

export function extractFencedDiagramInfo(
  state: EditorState,
  node: { from: number; to: number; getChildren: (n: string) => Array<{ from: number; to: number }>; getChild: (n: string) => { from: number; to: number } | null }
): FencedDiagramInfo | null {
  if (node.to - node.from > MAX_DIAGRAM_CHARS + 128) return null;

  const marks = node.getChildren('CodeMark');
  if (marks.length < 2) return null;

  const startLineObj = state.doc.lineAt(node.from);
  const endLineObj = state.doc.lineAt(node.to);
  const startLine = startLineObj.number;
  const endLine = endLineObj.number;

  if (endLine <= startLine + 1) return null;

  const infoNode = node.getChild('CodeInfo');
  const lang = infoNode ? state.sliceDoc(infoNode.from, infoNode.to).trim() : '';

  const bodyFrom = state.doc.line(startLine + 1).from;
  const bodyTo = state.doc.line(endLine - 1).to;
  if (bodyTo < bodyFrom) return null;

  const rawBody = state.sliceDoc(bodyFrom, bodyTo);
  if (!detectDiagramBlock(lang, rawBody)) return null;

  return {
    lang,
    rawBody,
    startLine,
    endLine,
    from: startLineObj.from,
    to: endLineObj.to,
  };
}

export class DiagramWidget extends WidgetType {
  constructor(
    readonly lang: string,
    readonly rawBody: string,
    readonly kind: string,
    readonly label: string
  ) {
    super();
  }

  eq(other: DiagramWidget): boolean {
    return (
      this.rawBody === other.rawBody &&
      this.lang === other.lang &&
      this.kind === other.kind
    );
  }

  get estimatedHeight(): number {
    const dims = getDiagramDimensions(this.lang, this.rawBody);
    if (!dims) return 120;
    const viewportH = Math.min(540, Math.max(88, Math.ceil(dims.height) + 28));
    return 29 + viewportH + 2;
  }

  ignoreEvent(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const card = document.createElement('div');
    card.className = 'cm-md-diagram-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', `${this.label} visualizada`);

    const rendered = renderDiagram(this.lang, this.rawBody);
    if (!rendered) {
      const fallback = document.createElement('pre');
      fallback.className = 'cm-md-diagram-fallback';
      fallback.textContent = this.rawBody;
      card.appendChild(fallback);
      return card;
    }

    const jumpToEdit = () => {
      try {
        const pos = view.posAtDOM(card);
        const line = view.state.doc.lineAt(pos);
        const targetLineNum = Math.min(view.state.doc.lines, line.number + 1);
        const targetLine = view.state.doc.line(targetLineNum);
        view.dispatch({
          selection: EditorSelection.cursor(targetLine.from),
          scrollIntoView: true,
        });
        view.focus();
      } catch {
        view.focus();
      }
    };

    // Header Toolbar
    const header = document.createElement('div');
    header.className = 'cm-md-diagram-header';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'cm-md-diagram-title-group';
    leftGroup.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="1.5" width="5" height="4"/><rect x="9.5" y="1.5" width="5" height="4"/><rect x="5.5" y="10.5" width="5" height="4"/><path d="M4 5.5v2h8v-2M8 7.5v3"/></svg>`;

    const badgeText = document.createElement('span');
    badgeText.className = 'cm-md-diagram-badge';
    badgeText.textContent = rendered.label;
    leftGroup.appendChild(badgeText);

    const actions = document.createElement('div');
    actions.className = 'cm-md-diagram-actions';

    const makeBtn = (
      htmlOrText: string,
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
        btn.innerHTML = htmlOrText;
      } else {
        btn.textContent = htmlOrText;
      }
      return btn;
    };

    const zoomOutBtn = makeBtn(
      '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="3" y1="8" x2="13" y2="8"/></svg>',
      'Diminuir zoom',
      true
    );
    const zoomReadoutBtn = makeBtn('100%', 'Resetar zoom (100%)', false, 'cm-md-diagram-zoom-readout');
    const zoomInBtn = makeBtn(
      '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>',
      'Aumentar zoom',
      true
    );
    const fitBtn = makeBtn(
      '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg><span>Ajustar</span>',
      'Ajustar à largura do editor',
      true
    );
      const expandBtn = makeBtn(
        '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="10 2 14 2 14 6"/><polyline points="6 14 2 14 2 10"/><line x1="14" y1="2" x2="9.5" y2="6.5"/><line x1="2" y1="14" x2="6.5" y2="9.5"/></svg><span>Expandir</span>',
        'Abrir visualização ampliada',
        true
      );
      const exportBtn = makeBtn(
        '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 11.5v2h11v-2"/></svg><span>Exportar</span>',
        'Exportar topologia (PNG ou JPEG)',
        true
      );
      const copyBtn = makeBtn(
        '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9"/><path d="M11 5V2H2v9h3"/></svg><span>Copiar</span>',
        'Copiar fonte do diagrama',
        true
      );
      const editBtn = makeBtn(
        '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg><span>Editar</span>',
        'Editar Markdown (ou clique duplo no diagrama)',
        true
      );

      actions.append(
        zoomOutBtn,
        zoomReadoutBtn,
        zoomInBtn,
        fitBtn,
        expandBtn,
        exportBtn,
        copyBtn,
        editBtn
      );
    header.append(leftGroup, actions);

    // Viewport & Stage
    const viewport = document.createElement('div');
    viewport.className = 'cm-md-diagram-viewport';
    viewport.title = 'Arraste para mover · Ctrl+Scroll para zoom · Clique duplo para editar';

    const stage = document.createElement('div');
    stage.className = 'cm-md-diagram-stage';
    const svgEl = rendered.svg;
    stage.appendChild(svgEl);
    viewport.appendChild(stage);

    card.append(header, viewport);

    const saved = getSavedViewState(this.lang, this.rawBody);
    let currentZoom = saved?.zoom ?? 1;
    let isFit = saved?.fit ?? false;

    const applyZoomState = (zoom: number, fit: boolean, persist = true) => {
      isFit = fit;
      if (fit) {
        const availW = Math.max(180, viewport.clientWidth - 28);
        const fitScale = Math.min(1, availW / rendered.width);
        currentZoom = Math.max(MIN_ZOOM, Math.round(fitScale * 100) / 100);
        fitBtn.classList.add('is-active');
      } else {
        currentZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));
        fitBtn.classList.remove('is-active');
      }

      const targetW = Math.round(rendered.width * currentZoom);
      const targetH = Math.round(rendered.height * currentZoom);
      svgEl.setAttribute('width', String(targetW));
      svgEl.setAttribute('height', String(targetH));
      zoomReadoutBtn.textContent = `${Math.round(currentZoom * 100)}%`;

      if (persist) {
        saveViewState(this.lang, this.rawBody, { zoom: currentZoom, fit: isFit });
      }
    };

    // Smart initial fit if diagram moderately exceeds pane width
    requestAnimationFrame(() => {
      if (!viewport.isConnected) return;
      if (saved) {
        applyZoomState(saved.zoom, saved.fit, false);
        return;
      }
      const availW = Math.max(180, viewport.clientWidth - 28);
      if (rendered.width > availW && rendered.width <= availW * 1.45) {
        applyZoomState(1, true, false);
      } else {
        applyZoomState(1, false, false);
      }
    });

    // Drag-to-pan on viewport when overflowing
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panScrollLeft = 0;
    let panScrollTop = 0;

    const onWindowMove = (e: MouseEvent) => {
      if (!isPanning) return;
      viewport.scrollLeft = panScrollLeft - (e.clientX - panStartX);
      viewport.scrollTop = panScrollTop - (e.clientY - panStartY);
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
      const canScrollX = viewport.scrollWidth > viewport.clientWidth + 2;
      const canScrollY = viewport.scrollHeight > viewport.clientHeight + 2;
      if (!canScrollX && !canScrollY) return;
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panScrollLeft = viewport.scrollLeft;
      panScrollTop = viewport.scrollTop;
      viewport.classList.add('is-panning');
      window.addEventListener('mousemove', onWindowMove);
      window.addEventListener('mouseup', stopPanning);
      e.preventDefault();
    });

    viewport.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToEdit();
    });

    viewport.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        applyZoomState(currentZoom + delta, false);
      },
      { passive: false }
    );

    zoomOutBtn.addEventListener('click', () => applyZoomState(currentZoom - ZOOM_STEP, false));
    zoomInBtn.addEventListener('click', () => applyZoomState(currentZoom + ZOOM_STEP, false));
    zoomReadoutBtn.addEventListener('click', () => applyZoomState(1, false));
    fitBtn.addEventListener('click', () => applyZoomState(1, !isFit));

    expandBtn.addEventListener('click', () => {
      openDiagramViewerModal({
        lang: this.lang,
        rawBody: this.rawBody,
        label: rendered.label,
        onEdit: jumpToEdit,
      });
    });

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
      const ok = await copyText(this.rawBody);
      const labelSpan = copyBtn.querySelector('span');
      if (ok && labelSpan) {
        labelSpan.textContent = 'Copiado';
        setTimeout(() => {
          if (labelSpan.isConnected) labelSpan.textContent = 'Copiar';
        }, 1400);
      }
    });

    editBtn.addEventListener('click', jumpToEdit);

    return card;
  }
}

function buildDiagramDecorations(state: EditorState): DecorationSet {
  if (state.doc.length > MAX_HYBRID_DOC_LENGTH) {
    return Decoration.none;
  }

  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let l = startLine; l <= endLine; l++) {
      activeLines.add(l);
    }
  }

  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    enter: (node) => {
      if (node.name !== 'FencedCode') return;

      const info = extractFencedDiagramInfo(state, node.node);
      if (!info) return;

      let hasActiveLine = false;
      for (let l = info.startLine; l <= info.endLine; l++) {
        if (activeLines.has(l)) {
          hasActiveLine = true;
          break;
        }
      }

      if (hasActiveLine) return;

      const detection = detectDiagramBlock(info.lang, info.rawBody);
      if (!detection) return;

      decorations.push(
        Decoration.replace({
          widget: new DiagramWidget(
            info.lang,
            info.rawBody,
            detection.kind,
            detection.label
          ),
          block: true,
          inclusive: false,
          inclusiveStart: false,
          inclusiveEnd: false,
        }).range(info.from, info.to)
      );
    },
  });

  decorations.sort((a, b) => a.from - b.from);
  return Decoration.set(decorations, true);
}

export const markdownDiagramField = StateField.define<DecorationSet>({
  create(state) {
    return buildDiagramDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return buildDiagramDecorations(tr.state);
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});
