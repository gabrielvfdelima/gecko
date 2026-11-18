import {
  EditorSelection,
  EditorState,
  Facet,
  Range,
  StateField,
} from '@codemirror/state';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { SetClipboardText } from '../../wailsjs/go/main/App';
import { openImageViewerModal } from './imageModal';

const MAX_HYBRID_DOC_LENGTH = 1048576; // 1 MB safeguard
const MAX_DIMENSION_CACHE = 128;

export interface ParsedImageRef {
  kind: 'markdown' | 'html';
  alt: string;
  src: string;
  title?: string;
  widthHint?: number;
  heightHint?: number;
  rawText: string;
}

const naturalDimensionCache = new Map<string, { width: number; height: number }>();

function cacheNaturalDimensions(key: string, width: number, height: number): void {
  if (!key || width <= 0 || height <= 0) return;
  if (naturalDimensionCache.size >= MAX_DIMENSION_CACHE && !naturalDimensionCache.has(key)) {
    const oldest = naturalDimensionCache.keys().next().value;
    if (oldest !== undefined) naturalDimensionCache.delete(oldest);
  }
  naturalDimensionCache.set(key, { width, height });
}

export const documentDirFacet = Facet.define<() => string, () => string>({
  combine: (values) => values[values.length - 1] ?? (() => ''),
});

async function copyImageSnippet(text: string): Promise<boolean> {
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

export function isUnsafeImageUrl(rawSrc: string): boolean {
  const lower = rawSrc.trim().toLowerCase();
  if (!lower) return true;
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) {
    return true;
  }
  if (lower.startsWith('data:') && !lower.startsWith('data:image/')) {
    return true;
  }
  return false;
}

export function normalizeMarkdownImageUrlToken(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isWailsDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    go?: { main?: { App?: unknown } };
    location?: { protocol?: string; hostname?: string };
  };
  return Boolean(
    win.go?.main?.App ||
      win.location?.protocol === 'wails:' ||
      win.location?.hostname === 'wails.localhost'
  );
}

function resolveRelativePathFallback(src: string, baseDir: string): string {
  if (!baseDir.trim()) return src;
  if (/^(\/|[a-zA-Z]:[\\/]|file:\/\/)/i.test(src)) return src;
  const sep = baseDir.includes('\\') && !baseDir.includes('/') ? '\\' : '/';
  const baseParts = baseDir.replace(/[\\/]+$/, '').split(/[\\/]+/);
  const relParts = src.replace(/\\/g, '/').split('/');
  for (const part of relParts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (baseParts.length > 1) baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  return baseParts.join(sep);
}

export function resolveImageSourceUrl(rawSrc: string, docDir: string): string {
  const cleanSrc = normalizeMarkdownImageUrlToken(rawSrc);
  if (!cleanSrc || isUnsafeImageUrl(cleanSrc)) return '';

  const lower = cleanSrc.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:image/') ||
    lower.startsWith('blob:') ||
    cleanSrc.startsWith('/__gecko_local_image?')
  ) {
    return cleanSrc;
  }

  if (isWailsDesktopRuntime()) {
    const params = new URLSearchParams();
    params.set('path', cleanSrc);
    if (docDir.trim()) {
      params.set('baseDir', docDir.trim());
    }
    return `/__gecko_local_image?${params.toString()}`;
  }

  return resolveRelativePathFallback(cleanSrc, docDir);
}

function parsePositiveDimensionAttr(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(?:px)?$/i);
  if (!match) return undefined;
  const val = Math.round(Number(match[1]));
  return Number.isFinite(val) && val > 0 ? val : undefined;
}

export function parseHtmlImgTag(rawHtml: string): ParsedImageRef | null {
  let trimmed = rawHtml.trim();
  if (!trimmed) return null;

  // Allow common README centering wrapper <p ...><img ... /></p> or <div ...><img ... /></div>
  const wrapperMatch = trimmed.match(/^<(p|div)\b[^>]*>([\s\S]*?)<\/\1>$/i);
  if (wrapperMatch) {
    trimmed = wrapperMatch[2].trim();
  }

  const tagMatch = trimmed.match(/^<img\b([^>]*?)\/?\s*>$/i);
  if (!tagMatch) return null;

  const attrSource = tagMatch[1];
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(attrSource)) !== null) {
    const name = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = val;
  }

  const src = normalizeMarkdownImageUrlToken(attrs.src ?? '');
  if (!src || isUnsafeImageUrl(src)) return null;

  return {
    kind: 'html',
    alt: (attrs.alt ?? '').trim(),
    src,
    title: attrs.title?.trim() || undefined,
    widthHint: parsePositiveDimensionAttr(attrs.width),
    heightHint: parsePositiveDimensionAttr(attrs.height),
    rawText: rawHtml.trim(),
  };
}

export function parseMarkdownImageSyntax(rawMarkdown: string): ParsedImageRef | null {
  const trimmed = rawMarkdown.trim();
  if (!trimmed.startsWith('![')) return null;

  // Match ![alt](dest) allowing balanced brackets in alt and optional "title" / 'title'
  let i = 2;
  let depth = 0;
  let altEnd = -1;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === '\\' && i + 1 < trimmed.length) {
      i += 2;
      continue;
    }
    if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      if (depth === 0) {
        altEnd = i;
        break;
      }
      depth--;
    }
    i++;
  }

  if (altEnd < 0 || trimmed[altEnd + 1] !== '(' || !trimmed.endsWith(')')) {
    return null;
  }

  const alt = trimmed.slice(2, altEnd).trim();
  const insideParens = trimmed.slice(altEnd + 2, -1).trim();
  if (!insideParens) return null;

  let src = '';
  let title: string | undefined;

  if (insideParens.startsWith('<')) {
    const closeAngle = insideParens.indexOf('>');
    if (closeAngle < 0) return null;
    src = insideParens.slice(1, closeAngle).trim();
    const rest = insideParens.slice(closeAngle + 1).trim();
    if (rest) {
      const titleMatch = rest.match(/^(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))$/);
      if (!titleMatch) return null;
      title = (titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? '').trim() || undefined;
    }
  } else {
    const partsMatch = insideParens.match(
      /^(\S+?)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?$/
    );
    if (!partsMatch) return null;
    src = partsMatch[1].trim();
    const rawTitle = partsMatch[2] ?? partsMatch[3] ?? partsMatch[4];
    title = rawTitle !== undefined ? rawTitle.trim() || undefined : undefined;
  }

  if (!src || isUnsafeImageUrl(src)) return null;

  return {
    kind: 'markdown',
    alt,
    src,
    title,
    rawText: trimmed,
  };
}

export function parseStandaloneImageRef(rawBlockText: string): ParsedImageRef | null {
  const trimmed = rawBlockText.trim();
  if (!trimmed) return null;
  return parseMarkdownImageSyntax(trimmed) ?? parseHtmlImgTag(trimmed);
}

export function extractMarkdownImageFromNode(
  state: EditorState,
  node: SyntaxNode
): ParsedImageRef | null {
  const urlNode = node.getChild('URL');
  const rawUrl = urlNode
    ? normalizeMarkdownImageUrlToken(state.sliceDoc(urlNode.from, urlNode.to))
    : '';

  if (!rawUrl || isUnsafeImageUrl(rawUrl)) {
    return parseMarkdownImageSyntax(state.sliceDoc(node.from, node.to));
  }

  const marks = node.getChildren('LinkMark');
  const altStart = marks.length > 0 ? marks[0].to : node.from + 2;
  let altEnd = node.to;
  for (let i = 1; i < marks.length; i++) {
    const m = marks[i];
    if (m.to <= urlNode!.from && state.sliceDoc(m.from, m.to).startsWith(']')) {
      altEnd = m.from;
      break;
    }
  }

  const alt =
    altEnd >= altStart && altEnd < node.to
      ? state.sliceDoc(altStart, altEnd).trim()
      : '';

  const titleNode = node.getChild('LinkTitle');
  let title: string | undefined;
  if (titleNode) {
    const rawTitle = state.sliceDoc(titleNode.from, titleNode.to).trim();
    if (rawTitle.length >= 2) {
      title = rawTitle.slice(1, -1).trim() || undefined;
    }
  }

  return {
    kind: 'markdown',
    alt,
    src: rawUrl,
    title,
    rawText: state.sliceDoc(node.from, node.to),
  };
}

function getFileDisplayName(src: string): string {
  const withoutQuery = src.split('?')[0].split('#')[0].trim();
  const slashIdx = Math.max(withoutQuery.lastIndexOf('/'), withoutQuery.lastIndexOf('\\'));
  return (slashIdx >= 0 ? withoutQuery.slice(slashIdx + 1) : withoutQuery) || src;
}

export class ImageCardWidget extends WidgetType {
  constructor(
    readonly info: ParsedImageRef,
    readonly resolvedUrl: string
  ) {
    super();
  }

  eq(other: ImageCardWidget): boolean {
    return (
      this.info.rawText === other.info.rawText &&
      this.resolvedUrl === other.resolvedUrl
    );
  }

  get estimatedHeight(): number {
    const cached = naturalDimensionCache.get(this.resolvedUrl);
    if (cached && cached.width > 0 && cached.height > 0) {
      const targetWidth = this.info.widthHint
        ? Math.min(this.info.widthHint, 680)
        : Math.min(cached.width, 680);
      const scaledHeight = Math.round((cached.height / cached.width) * targetWidth);
      const boundedHeight = Math.min(460, Math.max(64, scaledHeight));
      return 29 + boundedHeight + 24;
    }
    if (this.info.heightHint && this.info.heightHint > 0) {
      return 29 + Math.min(460, Math.max(48, this.info.heightHint)) + 24;
    }
    return 240;
  }

  ignoreEvent(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const card = document.createElement('div');
    card.className = 'cm-md-diagram-card cm-md-image-card';
    card.setAttribute('role', 'region');
    card.setAttribute(
      'aria-label',
      `Imagem: ${this.info.alt || this.info.title || getFileDisplayName(this.info.src)}`
    );

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

    const header = document.createElement('div');
    header.className = 'cm-md-diagram-header cm-md-image-header';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'cm-md-diagram-title-group';
    leftGroup.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11"/><circle cx="5.5" cy="6" r="1.1"/><path d="M2.5 11.5l3-3 2.5 2.5 2-2 3.5 3.5"/></svg>';

    const badge = document.createElement('span');
    badge.className = 'cm-md-diagram-badge';
    badge.textContent = 'IMAGEM';

    const captionSpan = document.createElement('span');
    captionSpan.className = 'cm-md-image-caption';
    captionSpan.textContent =
      this.info.alt || this.info.title || getFileDisplayName(this.info.src);
    captionSpan.title = this.info.src;

    leftGroup.append(badge, captionSpan);

    const actions = document.createElement('div');
    actions.className = 'cm-md-diagram-actions';

    const dimsEl = document.createElement('span');
    dimsEl.className = 'cm-md-image-dims';
    const cachedDims = naturalDimensionCache.get(this.resolvedUrl);
    if (cachedDims) {
      dimsEl.textContent = `${cachedDims.width} × ${cachedDims.height}`;
    } else {
      dimsEl.hidden = true;
    }

    const makeBtn = (html: string, title: string): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cm-md-diagram-btn';
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.innerHTML = html;
      return btn;
    };

    const expandBtn = makeBtn(
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 2h4v4M14 2l-5 5M6 14H2v-4M2 14l5-5"/></svg><span>Expandir</span>',
      'Abrir imagem em tela cheia'
    );
    const copyBtn = makeBtn(
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9"/><path d="M11 5V2H2v9h3"/></svg><span>Copiar</span>',
      'Copiar sintaxe Markdown da imagem'
    );
    const editBtn = makeBtn(
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg><span>Editar</span>',
      'Editar código Markdown da imagem'
    );

    actions.append(dimsEl, expandBtn, copyBtn, editBtn);
    header.append(leftGroup, actions);

    const viewport = document.createElement('div');
    viewport.className = 'cm-md-image-viewport';

    const imgEl = document.createElement('img');
    imgEl.className = 'cm-md-image-preview';
    imgEl.src = this.resolvedUrl;
    imgEl.alt = this.info.alt || this.info.title || getFileDisplayName(this.info.src);
    if (this.info.title) {
      imgEl.title = this.info.title;
    }
    if (this.info.widthHint && this.info.widthHint > 0) {
      imgEl.style.maxWidth = `min(100%, ${this.info.widthHint}px)`;
    }
    if (this.info.heightHint && this.info.heightHint > 0) {
      imgEl.style.maxHeight = `min(460px, ${this.info.heightHint}px)`;
    }
    imgEl.loading = 'lazy';
    imgEl.decoding = 'async';
    imgEl.draggable = false;

    const openModal = () => {
      openImageViewerModal({
        resolvedSrc: this.resolvedUrl,
        rawSrc: this.info.src,
        rawMarkdown: this.info.rawText,
        alt: this.info.alt,
        title: this.info.title,
        naturalWidth: imgEl.naturalWidth || cachedDims?.width,
        naturalHeight: imgEl.naturalHeight || cachedDims?.height,
        onEdit: jumpToEdit,
      });
    };

    imgEl.addEventListener('load', () => {
      if (imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
        cacheNaturalDimensions(this.resolvedUrl, imgEl.naturalWidth, imgEl.naturalHeight);
        dimsEl.textContent = `${imgEl.naturalWidth} × ${imgEl.naturalHeight}`;
        dimsEl.hidden = false;
      }
    });

    imgEl.addEventListener('error', () => {
      dimsEl.hidden = true;
      viewport.innerHTML = '';
      const errBox = document.createElement('div');
      errBox.className = 'cm-md-image-error';

      const errTitle = document.createElement('div');
      errTitle.className = 'cm-md-image-error-title';
      errTitle.textContent = 'Não foi possível carregar a imagem';

      const errPath = document.createElement('code');
      errPath.className = 'cm-md-image-error-path';
      errPath.textContent = this.info.src;

      const fixBtn = document.createElement('button');
      fixBtn.type = 'button';
      fixBtn.className = 'cm-md-diagram-btn';
      fixBtn.textContent = 'Editar caminho';
      fixBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        jumpToEdit();
      });

      errBox.append(errTitle, errPath, fixBtn);
      viewport.appendChild(errBox);
    });

    imgEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal();
    });

    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal();
    });

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await copyImageSnippet(this.info.rawText);
      const span = copyBtn.querySelector('span');
      if (ok && span) {
        span.textContent = 'Copiado';
        setTimeout(() => {
          if (span.isConnected) span.textContent = 'Copiar';
        }, 1400);
      }
    });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      jumpToEdit();
    });

    header.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      jumpToEdit();
    });

    viewport.appendChild(imgEl);
    card.append(header, viewport);
    return card;
  }
}

export class InlineImageWidget extends WidgetType {
  constructor(
    readonly info: ParsedImageRef,
    readonly resolvedUrl: string
  ) {
    super();
  }

  eq(other: InlineImageWidget): boolean {
    return (
      this.info.rawText === other.info.rawText &&
      this.resolvedUrl === other.resolvedUrl
    );
  }

  ignoreEvent(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-md-inline-image-wrap';
    wrap.title = `${this.info.alt || getFileDisplayName(this.info.src)} — Clique para ampliar`;

    const imgEl = document.createElement('img');
    imgEl.className = 'cm-md-inline-image';
    imgEl.src = this.resolvedUrl;
    imgEl.alt = this.info.alt || getFileDisplayName(this.info.src);
    if (this.info.widthHint && this.info.widthHint > 0 && this.info.widthHint <= 220) {
      imgEl.style.width = `${this.info.widthHint}px`;
    }
    if (this.info.heightHint && this.info.heightHint > 0 && this.info.heightHint <= 48) {
      imgEl.style.height = `${this.info.heightHint}px`;
    }
    imgEl.loading = 'lazy';
    imgEl.decoding = 'async';
    imgEl.draggable = false;

    const jumpToEdit = () => {
      try {
        const pos = view.posAtDOM(wrap);
        view.dispatch({
          selection: EditorSelection.cursor(pos),
          scrollIntoView: true,
        });
        view.focus();
      } catch {
        view.focus();
      }
    };

    imgEl.addEventListener('error', () => {
      wrap.classList.add('is-broken');
      imgEl.remove();
      const label = document.createElement('span');
      label.className = 'cm-md-inline-image-fallback';
      label.textContent = `[img: ${this.info.alt || getFileDisplayName(this.info.src)}]`;
      wrap.appendChild(label);
    });

    wrap.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openImageViewerModal({
        resolvedSrc: this.resolvedUrl,
        rawSrc: this.info.src,
        rawMarkdown: this.info.rawText,
        alt: this.info.alt,
        title: this.info.title,
        naturalWidth: imgEl.naturalWidth || undefined,
        naturalHeight: imgEl.naturalHeight || undefined,
        onEdit: jumpToEdit,
      });
    });

    wrap.appendChild(imgEl);
    return wrap;
  }
}

function getActiveLines(state: EditorState): Set<number> {
  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let l = startLine; l <= endLine; l++) {
      activeLines.add(l);
    }
  }
  return activeLines;
}

function rangeHasActiveLine(
  state: EditorState,
  activeLines: Set<number>,
  from: number,
  to: number
): boolean {
  const startLine = state.doc.lineAt(from).number;
  const endLine = state.doc.lineAt(Math.max(from, to)).number;
  for (let l = startLine; l <= endLine; l++) {
    if (activeLines.has(l)) return true;
  }
  return false;
}

export function buildImageDecorations(state: EditorState): DecorationSet {
  if (state.doc.length > MAX_HYBRID_DOC_LENGTH) {
    return Decoration.none;
  }

  const activeLines = getActiveLines(state);
  const getDocDir = state.facet(documentDirFacet);
  const docDir = typeof getDocDir === 'function' ? getDocDir() : '';

  const decorations: Range<Decoration>[] = [];
  const handledBlockRanges: Array<{ from: number; to: number }> = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 40) ?? syntaxTree(state);

  const isInsideHandledBlock = (pos: number): boolean =>
    handledBlockRanges.some((r) => pos >= r.from && pos <= r.to);

  // Pass 1: Standalone block images (Paragraph containing only ![alt](src), or HTMLBlock / Paragraph containing only <img>)
  tree.iterate({
    enter: (node) => {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        return false;
      }

      if (node.name === 'Paragraph' || node.name === 'HTMLBlock') {
        const rawBlock = state.sliceDoc(node.from, node.to);
        const startLineObj = state.doc.lineAt(node.from);
        const endLineObj = state.doc.lineAt(Math.max(node.from, node.to));

        // Only replace full lines as a block card when nothing (e.g. '>' or '-') precedes on the first line
        if (state.sliceDoc(startLineObj.from, node.from).trim() !== '') {
          return true;
        }

        let standaloneInfo: ParsedImageRef | null = null;
        if (node.name === 'Paragraph') {
          const directImages = node.node.getChildren('Image');
          if (directImages.length === 1) {
            const imgNode = directImages[0];
            const leading = state.sliceDoc(node.from, imgNode.from).trim();
            const trailing = state.sliceDoc(imgNode.to, node.to).trim();
            if (!leading && !trailing) {
              standaloneInfo = extractMarkdownImageFromNode(state, imgNode);
            }
          }
          if (!standaloneInfo) {
            standaloneInfo = parseHtmlImgTag(rawBlock);
          }
        } else {
          standaloneInfo = parseHtmlImgTag(rawBlock);
        }

        if (standaloneInfo) {
          handledBlockRanges.push({ from: startLineObj.from, to: endLineObj.to });
          if (!rangeHasActiveLine(state, activeLines, startLineObj.from, endLineObj.to)) {
            const resolvedUrl = resolveImageSourceUrl(standaloneInfo.src, docDir);
            if (resolvedUrl) {
              decorations.push(
                Decoration.replace({
                  widget: new ImageCardWidget(standaloneInfo, resolvedUrl),
                  block: true,
                  inclusive: false,
                  inclusiveStart: false,
                  inclusiveEnd: false,
                }).range(startLineObj.from, endLineObj.to)
              );
            }
          }
          return false;
        }
      }
      return true;
    },
  });

  // Pass 2: Inline images inside prose lines / mixed paragraphs
  tree.iterate({
    enter: (node) => {
      if (
        node.name === 'FencedCode' ||
        node.name === 'CodeBlock' ||
        node.name === 'InlineCode'
      ) {
        return false;
      }

      if (isInsideHandledBlock(node.from)) {
        return false;
      }

      if (node.name === 'Image') {
        if (!rangeHasActiveLine(state, activeLines, node.from, node.to)) {
          const info = extractMarkdownImageFromNode(state, node.node);
          if (info) {
            const resolvedUrl = resolveImageSourceUrl(info.src, docDir);
            if (resolvedUrl) {
              decorations.push(
                Decoration.replace({
                  widget: new InlineImageWidget(info, resolvedUrl),
                }).range(node.from, node.to)
              );
            }
          }
        }
        return false;
      }

      if (node.name === 'HTMLTag') {
        if (!rangeHasActiveLine(state, activeLines, node.from, node.to)) {
          const rawTag = state.sliceDoc(node.from, node.to);
          const info = parseHtmlImgTag(rawTag);
          if (info) {
            const resolvedUrl = resolveImageSourceUrl(info.src, docDir);
            if (resolvedUrl) {
              decorations.push(
                Decoration.replace({
                  widget: new InlineImageWidget(info, resolvedUrl),
                }).range(node.from, node.to)
              );
            }
          }
        }
        return false;
      }

      return true;
    },
  });

  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(decorations, true);
}

export const markdownImageField = StateField.define<DecorationSet>({
  create(state) {
    return buildImageDecorations(state);
  },
  update(decorations, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState)
    ) {
      return buildImageDecorations(tr.state);
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});
