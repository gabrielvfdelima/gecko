import { parser as baseMarkdownParser, GFM } from '@lezer/markdown';
import { SyntaxNode } from '@lezer/common';
import { detectDiagramBlock, renderDiagram } from '../editor/topologyRenderer';
import { getTableWidthKey, ParsedMarkdownTable, parseMarkdownTable } from '../editor/tableViewer';
import { ActiveLayer, pushLayer } from '../keyboard';
import {
  drawCanvasTableSection,
  drawWrappedLines,
  FontStyleSpec,
  layoutCanvasTable,
  parseInlineMarkdownRuns,
  WrappedLine,
  wrapInlineRuns,
} from './canvasTable';
import {
  canvasToBase64,
  exportBase64Binary,
  ExportPalette,
  ExportThemeMode,
  getExportHost,
  rasterizeSvgToCanvas,
  resolveExportPalette,
  sanitizeFileStem,
  uint8ArrayToBase64,
} from './exportUtils';

export type PdfPageFormat = 'a4' | 'letter';

export interface PdfExportOptions {
  markdown: string;
  fileName: string;
  theme?: ExportThemeMode;
  pageFormat?: PdfPageFormat;
  includeFooter?: boolean;
}

interface PdfPageSpec {
  widthPt: number;
  heightPt: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
}

interface TextAnnot {
  x: number;
  yFromTop: number;
  fontSize: number;
  width: number;
  text: string;
}

interface RenderedPdfPage {
  canvas: HTMLCanvasElement;
  widthPt: number;
  heightPt: number;
  annotations: TextAnnot[];
}

type DocBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: PdfListItem[] }
  | { type: 'blockquote'; text: string }
  | { type: 'hr' }
  | { type: 'code'; lang: string; lines: string[] }
  | { type: 'diagram'; lang: string; body: string; label: string }
  | { type: 'table'; parsed: ParsedMarkdownTable; widthKey: string };

interface PdfListItem {
  depth: number;
  marker: string;
  checked: boolean | null;
  text: string;
}

const gfmParser = baseMarkdownParser.configure(GFM);

const PAGE_SPECS: Record<PdfPageFormat, PdfPageSpec> = {
  a4: {
    widthPt: 595.28,
    heightPt: 841.89,
    marginX: 42,
    marginTop: 44,
    marginBottom: 46,
  },
  letter: {
    widthPt: 612,
    heightPt: 792,
    marginX: 44,
    marginTop: 44,
    marginBottom: 46,
  },
};

const PDF_RENDER_SCALE = 2.15;

let activePdfOverlay: HTMLElement | null = null;
let activePdfLayer: ActiveLayer | null = null;

function collectListItems(
  listNode: SyntaxNode,
  source: string,
  depth: number,
  out: PdfListItem[]
): void {
  const isOrdered = listNode.name === 'OrderedList';
  let orderCounter = 1;

  let child = listNode.firstChild;
  while (child) {
    if (child.name === 'ListItem') {
      const taskNode = child.getChild('Task');
      let checked: boolean | null = null;
      let markerText = isOrdered ? `${orderCounter}.` : depth % 2 === 0 ? '•' : '◦';
      if (isOrdered) orderCounter++;

      const textParts: string[] = [];
      let itemChild = child.firstChild;
      while (itemChild) {
        if (itemChild.name === 'ListMark') {
          const markStr = source.slice(itemChild.from, itemChild.to).trim();
          const ordMatch = markStr.match(/^(\d+)[.)]$/);
          if (isOrdered && ordMatch) {
            markerText = `${ordMatch[1]}.`;
            orderCounter = Number(ordMatch[1]) + 1;
          }
        } else if (itemChild.name === 'Task') {
          const tMarker = itemChild.getChild('TaskMarker');
          if (tMarker) {
            const rawM = source.slice(tMarker.from, tMarker.to);
            checked = /\[x\]/i.test(rawM);
            textParts.push(source.slice(tMarker.to, itemChild.to).trim());
          } else {
            textParts.push(source.slice(itemChild.from, itemChild.to).trim());
          }
        } else if (itemChild.name === 'Paragraph') {
          let pText = source.slice(itemChild.from, itemChild.to).trim();
          const taskPrefix = pText.match(/^\[([ xX])\]\s*(.*)$/s);
          if (taskPrefix && !taskNode) {
            checked = taskPrefix[1].toLowerCase() === 'x';
            pText = taskPrefix[2];
          }
          if (pText) textParts.push(pText);
        } else if (itemChild.name === 'BulletList' || itemChild.name === 'OrderedList') {
          if (textParts.length > 0) {
            out.push({
              depth,
              marker: checked !== null ? '' : markerText,
              checked,
              text: textParts.join(' '),
            });
            textParts.length = 0;
          }
          collectListItems(itemChild, source, depth + 1, out);
        }
        itemChild = itemChild.nextSibling;
      }

      if (textParts.length > 0 || checked !== null) {
        out.push({
          depth,
          marker: checked !== null ? '' : markerText,
          checked,
          text: textParts.join(' ').replace(/\n+/g, ' '),
        });
      }
    }
    child = child.nextSibling;
  }
}

function extractFencedCode(node: SyntaxNode, source: string): { lang: string; body: string } {
  const infoNode = node.getChild('CodeInfo');
  const lang = infoNode ? source.slice(infoNode.from, infoNode.to).trim() : '';
  const marks = node.getChildren('CodeMark');
  const raw = source.slice(node.from, node.to);
  const lines = raw.split('\n');

  if (lines.length <= 1) {
    return { lang, body: '' };
  }
  const hasClosing = marks.length >= 2 && lines.length >= 2;
  const innerLines = hasClosing ? lines.slice(1, lines.length - 1) : lines.slice(1);
  return { lang, body: innerLines.join('\n') };
}

export function parseMarkdownBlocksForPdf(markdownText: string): DocBlock[] {
  const source = markdownText.replace(/\r\n/g, '\n');
  const tree = gfmParser.parse(source);
  const blocks: DocBlock[] = [];

  let node = tree.topNode.firstChild;
  while (node) {
    const slice = source.slice(node.from, node.to);
    switch (node.name) {
      case 'ATXHeading1':
      case 'ATXHeading2':
      case 'ATXHeading3':
      case 'ATXHeading4':
      case 'ATXHeading5':
      case 'ATXHeading6': {
        const level = Number(node.name.slice(-1)) || 1;
        const text = slice
          .replace(/^#{1,6}\s*/, '')
          .replace(/\s+#+\s*$/, '')
          .trim();
        if (text) blocks.push({ type: 'heading', level, text });
        break;
      }
      case 'SetextHeading1':
      case 'SetextHeading2': {
        const level = node.name.endsWith('1') ? 1 : 2;
        const lines = slice.split('\n');
        const text = lines.slice(0, -1).join(' ').trim();
        if (text) blocks.push({ type: 'heading', level, text });
        break;
      }
      case 'HorizontalRule': {
        blocks.push({ type: 'hr' });
        break;
      }
      case 'FencedCode': {
        const { lang, body } = extractFencedCode(node, source);
        const det = detectDiagramBlock(lang, body);
        if (det) {
          blocks.push({ type: 'diagram', lang, body, label: det.label });
        } else {
          blocks.push({ type: 'code', lang, lines: body.split('\n') });
        }
        break;
      }
      case 'CodeBlock': {
        const lines = slice.split('\n').map((l) => l.replace(/^(?: {4}|\t)/, ''));
        blocks.push({ type: 'code', lang: '', lines });
        break;
      }
      case 'Blockquote': {
        const cleaned = slice
          .split('\n')
          .map((l) => l.replace(/^\s*>\s?/, ''))
          .join('\n')
          .trim();
        if (cleaned) blocks.push({ type: 'blockquote', text: cleaned });
        break;
      }
      case 'BulletList':
      case 'OrderedList': {
        const items: PdfListItem[] = [];
        collectListItems(node, source, 0, items);
        if (items.length > 0) blocks.push({ type: 'list', items });
        break;
      }
      case 'Table': {
        const lines = slice.split('\n');
        let lastTableIdx = lines.length - 1;
        while (lastTableIdx > 1 && !lines[lastTableIdx].includes('|')) {
          lastTableIdx--;
        }
        const tableRaw = lines.slice(0, lastTableIdx + 1).join('\n');
        const parsed = parseMarkdownTable(tableRaw);
        if (parsed) {
          blocks.push({ type: 'table', parsed, widthKey: getTableWidthKey(parsed) });
          const trailing = lines.slice(lastTableIdx + 1).join('\n').trim();
          if (trailing) {
            blocks.push({ type: 'paragraph', text: trailing });
          }
        } else if (slice.trim()) {
          blocks.push({ type: 'paragraph', text: slice.trim() });
        }
        break;
      }
      case 'Paragraph': {
        const text = slice.trim().replace(/\n+/g, ' ');
        if (text) blocks.push({ type: 'paragraph', text });
        break;
      }
      default: {
        const fallback = slice.trim();
        if (fallback) blocks.push({ type: 'paragraph', text: fallback });
        break;
      }
    }
    node = node.nextSibling;
  }

  return blocks;
}

function wrapMonospaceLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  maxWidth: number,
  font: string
): string[] {
  ctx.font = font;
  const out: string[] = [];
  for (const rawLine of lines) {
    if (!rawLine) {
      out.push('');
      continue;
    }
    if (ctx.measureText(rawLine).width <= maxWidth) {
      out.push(rawLine);
      continue;
    }
    let cur = '';
    for (const ch of rawLine) {
      if (ctx.measureText(cur + ch).width > maxWidth && cur.length > 0) {
        out.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

export async function renderMarkdownToPdfPages(
  markdownText: string,
  fileName: string,
  options: {
    theme: ExportThemeMode;
    pageFormat: PdfPageFormat;
    includeFooter: boolean;
  }
): Promise<RenderedPdfPage[]> {
  const palette = resolveExportPalette(options.theme);
  const spec = PAGE_SPECS[options.pageFormat];
  const contentW = spec.widthPt - spec.marginX * 2;
  const maxBodyY = spec.heightPt - spec.marginBottom - (options.includeFooter ? 14 : 0);

  const blocks = parseMarkdownBlocksForPdf(markdownText);

  // Pre-rasterize SVG diagrams at high DPI using target PDF palette
  const diagramBitmaps = new Map<number, { canvas: HTMLCanvasElement; width: number; height: number }>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== 'diagram') continue;
    const rendered = renderDiagram(b.lang, b.body);
    if (!rendered) continue;
    try {
      const diagCanvas = await rasterizeSvgToCanvas(
        rendered.svg,
        rendered.width,
        rendered.height,
        palette,
        PDF_RENDER_SCALE
      );
      diagramBitmaps.set(i, {
        canvas: diagCanvas,
        width: rendered.width,
        height: rendered.height,
      });
    } catch {
      // Fallback to monospace block if rasterization fails
    }
  }

  const pages: Array<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    annotations: TextAnnot[];
  }> = [];

  let curPageIdx = -1;
  let cursorY = spec.marginTop;

  const startNewPage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(spec.widthPt * PDF_RENDER_SCALE);
    canvas.height = Math.round(spec.heightPt * PDF_RENDER_SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexto 2D indisponível ao gerar páginas PDF');
    }
    ctx.scale(PDF_RENDER_SCALE, PDF_RENDER_SCALE);
    ctx.fillStyle = palette.bgPage;
    ctx.fillRect(0, 0, spec.widthPt, spec.heightPt);

    pages.push({ canvas, ctx, annotations: [] });
    curPageIdx = pages.length - 1;
    cursorY = spec.marginTop;
  };

  startNewPage();

  const curCtx = () => pages[curPageIdx].ctx;
  const curAnnots = () => pages[curPageIdx].annotations;

  const mapWrappedAnnotations = (wrapped: WrappedLine[], x: number, topY: number, lineH: number, fontSize: number) => {
    const target = curAnnots();
    const baselineOffset = lineH * 0.72;
    for (let i = 0; i < wrapped.length; i++) {
      const txt = wrapped[i].segments.map((s) => s.text).join('').trim();
      if (!txt) continue;
      target.push({
        x,
        yFromTop: topY + i * lineH + baselineOffset,
        fontSize,
        width: Math.max(4, wrapped[i].width),
        text: txt,
      });
    }
  };

  const ensureHeightOrBreak = (neededPt: number) => {
    if (cursorY > spec.marginTop + 2 && cursorY + neededPt > maxBodyY) {
      startNewPage();
    }
  };

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx];

    if (block.type === 'heading') {
      const sizes = [19, 14.5, 12.2, 10.8, 10, 9.5];
      const fSize = sizes[Math.min(5, Math.max(0, block.level - 1))];
      const lHeight = Math.round(fSize * 1.32);
      const topGap = cursorY > spec.marginTop + 2 ? (block.level <= 2 ? 14 : 10) : 0;
      const hSpec: FontStyleSpec = {
        size: fSize,
        lineHeight: lHeight,
        sansFamily: palette.fontSans,
        monoFamily: palette.fontMono,
        defaultBold: true,
        defaultColor: block.level <= 2 ? palette.mdHeading : palette.textPrimary,
      };
      const wrapped = wrapInlineRuns(curCtx(), parseInlineMarkdownRuns(block.text), contentW, hSpec);
      const ruleSpace = block.level <= 2 ? 6 : 0;
      const totalH = wrapped.length * lHeight + ruleSpace;

      ensureHeightOrBreak(topGap + totalH + 26); // keep heading paired with following content
      if (cursorY > spec.marginTop + 2) {
        cursorY += topGap;
      }

      drawWrappedLines(curCtx(), wrapped, spec.marginX, cursorY, contentW, 'left', hSpec, palette);
      mapWrappedAnnotations(wrapped, spec.marginX, cursorY, lHeight, fSize);
      cursorY += wrapped.length * lHeight;

      if (block.level <= 2) {
        cursorY += 3;
        curCtx().fillStyle = block.level === 1 ? palette.accentPrimary : palette.borderSubtle;
        curCtx().fillRect(spec.marginX, cursorY, contentW, block.level === 1 ? 1.5 : 0.75);
        cursorY += 5;
      }
      cursorY += 6;
      continue;
    }

    if (block.type === 'hr') {
      ensureHeightOrBreak(16);
      cursorY += 6;
      curCtx().fillStyle = palette.borderSubtle;
      curCtx().fillRect(spec.marginX, cursorY, contentW, 1);
      cursorY += 10;
      continue;
    }

    if (block.type === 'paragraph') {
      const pSpec: FontStyleSpec = {
        size: 10,
        lineHeight: 15,
        sansFamily: palette.fontSans,
        monoFamily: palette.fontMono,
        defaultColor: palette.textPrimary,
      };
      const wrapped = wrapInlineRuns(curCtx(), parseInlineMarkdownRuns(block.text), contentW, pSpec);
      for (const line of wrapped) {
        ensureHeightOrBreak(pSpec.lineHeight);
        drawWrappedLines(curCtx(), [line], spec.marginX, cursorY, contentW, 'left', pSpec, palette);
        mapWrappedAnnotations([line], spec.marginX, cursorY, pSpec.lineHeight, pSpec.size);
        cursorY += pSpec.lineHeight;
      }
      cursorY += 7;
      continue;
    }

    if (block.type === 'blockquote') {
      const qSpec: FontStyleSpec = {
        size: 9.8,
        lineHeight: 14.5,
        sansFamily: palette.fontSans,
        monoFamily: palette.fontMono,
        defaultColor: palette.textSecondary,
      };
      const padX = 12;
      const wrapped = wrapInlineRuns(
        curCtx(),
        parseInlineMarkdownRuns(block.text.replace(/\n+/g, ' ')),
        contentW - padX * 2,
        qSpec
      );

      let lineIdx = 0;
      while (lineIdx < wrapped.length) {
        const availLines = Math.max(1, Math.floor((maxBodyY - cursorY - 8) / qSpec.lineHeight));
        if (availLines < 1 || cursorY + qSpec.lineHeight + 8 > maxBodyY) {
          startNewPage();
          continue;
        }
        const chunk = wrapped.slice(lineIdx, lineIdx + availLines);
        const boxH = chunk.length * qSpec.lineHeight + 8;

        curCtx().fillStyle = palette.bgElevated;
        curCtx().fillRect(spec.marginX, cursorY, contentW, boxH);
        curCtx().fillStyle = palette.accentPrimary;
        curCtx().fillRect(spec.marginX, cursorY, 2.5, boxH);

        drawWrappedLines(
          curCtx(),
          chunk,
          spec.marginX + padX,
          cursorY + 4,
          contentW - padX * 2,
          'left',
          qSpec,
          palette
        );
        mapWrappedAnnotations(chunk, spec.marginX + padX, cursorY + 4, qSpec.lineHeight, qSpec.size);
        cursorY += boxH;
        lineIdx += chunk.length;
        if (lineIdx < wrapped.length) {
          startNewPage();
        }
      }
      cursorY += 8;
      continue;
    }

    if (block.type === 'list') {
      const lSpec: FontStyleSpec = {
        size: 9.8,
        lineHeight: 14.6,
        sansFamily: palette.fontSans,
        monoFamily: palette.fontMono,
        defaultColor: palette.textPrimary,
      };
      for (const item of block.items) {
        const indent = Math.min(4, item.depth) * 15;
        const bulletColW = 14;
        const itemX = spec.marginX + indent;
        const textX = itemX + bulletColW;
        const textMaxW = Math.max(100, contentW - indent - bulletColW);
        const wrapped = wrapInlineRuns(curCtx(), parseInlineMarkdownRuns(item.text), textMaxW, lSpec);

        ensureHeightOrBreak(lSpec.lineHeight);
        // Draw bullet/number/task checkbox on first line
        if (item.checked !== null) {
          const boxY = cursorY + 3.5;
          curCtx().strokeStyle = item.checked ? palette.accentPrimary : palette.textSecondary;
          curCtx().lineWidth = 1;
          curCtx().strokeRect(itemX + 1, boxY, 8.5, 8.5);
          if (item.checked) {
            curCtx().fillStyle = palette.accentPrimary;
            curCtx().fillRect(itemX + 1, boxY, 8.5, 8.5);
            curCtx().strokeStyle = palette.bgPage;
            curCtx().lineWidth = 1.4;
            curCtx().beginPath();
            curCtx().moveTo(itemX + 2.8, boxY + 4.4);
            curCtx().lineTo(itemX + 4.6, boxY + 6.5);
            curCtx().lineTo(itemX + 7.8, boxY + 2.5);
            curCtx().stroke();
          }
        } else if (item.marker) {
          curCtx().font = `600 ${lSpec.size}px ${palette.fontSans}`;
          curCtx().fillStyle = palette.accentPrimary;
          curCtx().textBaseline = 'alphabetic';
          curCtx().fillText(item.marker, itemX, cursorY + lSpec.lineHeight * 0.72);
        }

        for (let i = 0; i < wrapped.length; i++) {
          if (i > 0) ensureHeightOrBreak(lSpec.lineHeight);
          drawWrappedLines(curCtx(), [wrapped[i]], textX, cursorY, textMaxW, 'left', lSpec, palette);
          mapWrappedAnnotations([wrapped[i]], textX, cursorY, lSpec.lineHeight, lSpec.size);
          cursorY += lSpec.lineHeight;
        }
        cursorY += 2.5;
      }
      cursorY += 5;
      continue;
    }

    if (block.type === 'diagram') {
      const bmp = diagramBitmaps.get(bIdx);
      if (bmp) {
        const headerH = 18;
        const pad = 10;
        const maxDiagW = contentW - pad * 2;
        const maxDiagH = spec.heightPt - spec.marginTop - spec.marginBottom - 56;
        const basePtW = bmp.width * 0.75;
        const basePtH = bmp.height * 0.75;
        const scaleFit = Math.min(1, maxDiagW / basePtW, maxDiagH / basePtH);
        const drawW = Math.round(basePtW * scaleFit);
        const drawH = Math.round(basePtH * scaleFit);
        const cardH = headerH + drawH + pad * 2;

        ensureHeightOrBreak(cardH);

        // Card container matching Gecko industrial card
        curCtx().fillStyle = palette.bgElevated;
        curCtx().fillRect(spec.marginX, cursorY, contentW, headerH);
        curCtx().fillStyle = palette.bgSurface;
        curCtx().fillRect(spec.marginX, cursorY + headerH, contentW, cardH - headerH);

        curCtx().strokeStyle = palette.borderSubtle;
        curCtx().lineWidth = 0.8;
        curCtx().strokeRect(spec.marginX + 0.4, cursorY + 0.4, contentW - 0.8, cardH - 0.8);
        curCtx().fillStyle = palette.borderSubtle;
        curCtx().fillRect(spec.marginX, cursorY + headerH, contentW, 0.8);

        // Accent left bar
        curCtx().fillStyle = palette.accentPrimary;
        curCtx().fillRect(spec.marginX, cursorY, 2.2, cardH);

        // Badge label
        curCtx().font = `600 7.5px ${palette.fontMono}`;
        curCtx().fillStyle = palette.textSecondary;
        curCtx().textBaseline = 'middle';
        curCtx().fillText(block.label.toUpperCase(), spec.marginX + 8, cursorY + headerH / 2);

        const imgX = spec.marginX + Math.round((contentW - drawW) / 2);
        const imgY = cursorY + headerH + pad;
        curCtx().drawImage(bmp.canvas, imgX, imgY, drawW, drawH);

        cursorY += cardH + 10;
        continue;
      }
      // Fall through to code rendering if diagram bitmap unavailable
    }

    if (block.type === 'code' || block.type === 'diagram') {
      const codeLinesSource = block.type === 'diagram' ? block.body.split('\n') : block.lines;
      const codeFontSize = 8.6;
      const codeLineH = 12.6;
      const codeFont = `${codeFontSize}px ${palette.fontMono}`;
      const padX = 10;
      const padY = 8;
      const wrappedCode = wrapMonospaceLines(curCtx(), codeLinesSource, contentW - padX * 2, codeFont);

      let lineIdx = 0;
      while (lineIdx < wrappedCode.length) {
        const showLangHeader = lineIdx === 0 && block.lang ? 16 : 0;
        const availH = maxBodyY - cursorY - padY * 2 - showLangHeader;
        if (availH < codeLineH) {
          startNewPage();
          continue;
        }
        const fitCount = Math.max(1, Math.floor(availH / codeLineH));
        const chunk = wrappedCode.slice(lineIdx, lineIdx + fitCount);
        const boxH = showLangHeader + chunk.length * codeLineH + padY * 2;

        curCtx().fillStyle = palette.bgElevated;
        curCtx().fillRect(spec.marginX, cursorY, contentW, boxH);
        curCtx().strokeStyle = palette.borderSubtle;
        curCtx().lineWidth = 0.8;
        curCtx().strokeRect(spec.marginX + 0.4, cursorY + 0.4, contentW - 0.8, boxH - 0.8);
        curCtx().fillStyle = palette.accentPrimary;
        curCtx().fillRect(spec.marginX, cursorY, 2, boxH);

        let textTop = cursorY + padY;
        if (showLangHeader > 0) {
          curCtx().font = `600 7.5px ${palette.fontMono}`;
          curCtx().fillStyle = palette.textSecondary;
          curCtx().textBaseline = 'top';
          curCtx().fillText(block.lang.toUpperCase(), spec.marginX + padX, cursorY + 4);
          textTop += showLangHeader - 4;
        }

        curCtx().font = codeFont;
        curCtx().fillStyle = palette.textPrimary;
        curCtx().textBaseline = 'alphabetic';
        for (let i = 0; i < chunk.length; i++) {
          const baseY = textTop + i * codeLineH + codeLineH * 0.74;
          curCtx().fillText(chunk[i], spec.marginX + padX, baseY);
          if (chunk[i].trim()) {
            curAnnots().push({
              x: spec.marginX + padX,
              yFromTop: baseY,
              fontSize: codeFontSize,
              width: curCtx().measureText(chunk[i]).width,
              text: chunk[i],
            });
          }
        }

        cursorY += boxH;
        lineIdx += chunk.length;
        if (lineIdx < wrappedCode.length) {
          startNewPage();
        }
      }
      cursorY += 8;
      continue;
    }

    if (block.type === 'table') {
      const tableLayout = layoutCanvasTable(
        curCtx(),
        block.parsed,
        block.widthKey,
        {
          maxTotalWidth: contentW,
          constrainToMaxWidth: true,
          preferSavedWidths: true,
          fontSize: 8.8,
          lineHeight: 12.6,
          cellPadX: 6.5,
          cellPadY: 5,
        },
        palette
      );

      let rowStart = 0;
      const totalRows = block.parsed.rows.length;

      if (totalRows === 0) {
        ensureHeightOrBreak(tableLayout.headerHeight);
        const h = drawCanvasTableSection(
          curCtx(),
          tableLayout,
          spec.marginX,
          cursorY,
          0,
          0,
          palette,
          true
        );
        cursorY += h + 10;
        continue;
      }

      while (rowStart < totalRows) {
        const minFirstRowH = tableLayout.headerHeight + tableLayout.rowHeights[rowStart];
        if (cursorY > spec.marginTop + 2 && cursorY + minFirstRowH > maxBodyY) {
          startNewPage();
        }

        let accH = tableLayout.headerHeight;
        let rowEnd = rowStart;
        while (rowEnd < totalRows) {
          const nextRowH = tableLayout.rowHeights[rowEnd];
          if (rowEnd > rowStart && cursorY + accH + nextRowH > maxBodyY) {
            break;
          }
          accH += nextRowH;
          rowEnd++;
        }

        const rawAnnots: Array<{ x: number; y: number; fontSize: number; width: number; text: string }> = [];
        const drawnH = drawCanvasTableSection(
          curCtx(),
          tableLayout,
          spec.marginX,
          cursorY,
          rowStart,
          rowEnd,
          palette,
          true,
          rawAnnots
        );
        for (const a of rawAnnots) {
          curAnnots().push({
            x: a.x,
            yFromTop: a.y,
            fontSize: a.fontSize,
            width: a.width,
            text: a.text,
          });
        }

        cursorY += drawnH;
        rowStart = rowEnd;
        if (rowStart < totalRows) {
          startNewPage();
        }
      }
      cursorY += 10;
    }
  }

  // Draw optional page footer with total page count
  const totalPages = pages.length;
  if (options.includeFooter) {
    const cleanTitle = fileName.replace(/\.(md|markdown)$/i, '') || 'Documento Markdown';
    for (let i = 0; i < totalPages; i++) {
      const ctx = pages[i].ctx;
      const ruleY = spec.heightPt - 30;
      ctx.fillStyle = palette.borderSubtle;
      ctx.fillRect(spec.marginX, ruleY, contentW, 0.6);

      ctx.font = `8px ${palette.fontMono}`;
      ctx.fillStyle = palette.textMuted;
      ctx.textBaseline = 'top';
      ctx.fillText(cleanTitle, spec.marginX, ruleY + 6);

      const pageLabel = `Página ${i + 1} de ${totalPages}`;
      const labelW = ctx.measureText(pageLabel).width;
      ctx.fillText(pageLabel, spec.widthPt - spec.marginX - labelW, ruleY + 6);
    }
  }

  return pages.map((p) => ({
    canvas: p.canvas,
    widthPt: spec.widthPt,
    heightPt: spec.heightPt,
    annotations: p.annotations,
  }));
}

function unicodeToWinAnsiBytes(text: string): number[] {
  const normalized = text
    .replace(/→|➜|➔|►/g, '->')
    .replace(/←/g, '<-')
    .replace(/⇒/g, '=>')
    .replace(/─|━/g, '-')
    .replace(/│|┃/g, '|')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≈/g, '~');

  const win1252Extras: Record<number, number> = {
    0x20ac: 0x80, // €
    0x201a: 0x82, // ‚
    0x0192: 0x83, // ƒ
    0x201e: 0x84, // „
    0x2026: 0x85, // …
    0x2020: 0x86, // †
    0x2021: 0x87, // ‡
    0x02c6: 0x88, // ˆ
    0x2030: 0x89, // ‰
    0x0160: 0x8a, // Š
    0x2039: 0x8b, // ‹
    0x0152: 0x8c, // Œ
    0x017d: 0x8e, // Ž
    0x2018: 0x91, // ‘
    0x2019: 0x92, // ’
    0x201c: 0x93, // “
    0x201d: 0x94, // ”
    0x2022: 0x95, // •
    0x2013: 0x96, // –
    0x2014: 0x97, // —
    0x02dc: 0x98, // ˜
    0x2122: 0x99, // ™
    0x0161: 0x9a, // š
    0x203a: 0x9b, // ›
    0x0153: 0x9c, // œ
    0x017e: 0x9e, // ž
    0x0178: 0x9f, // Ÿ
  };

  const out: number[] = [];
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 0x20;
    let byte = 0x3f; // '?'
    if (code >= 0x20 && code <= 0x7e) {
      byte = code;
    } else if (code >= 0xa0 && code <= 0xff) {
      byte = code;
    } else if (code in win1252Extras) {
      byte = win1252Extras[code];
    } else if (code === 0x09 || code === 0x0a || code === 0x0d) {
      byte = 0x20;
    }

    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      // Escape '(', ')', '\' for PDF string literal
      out.push(0x5c, byte);
    } else {
      out.push(byte);
    }
  }
  return out;
}

function buildTextOverlayStream(page: RenderedPdfPage): Uint8Array {
  const chunks: number[] = [];
  const pushAscii = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      chunks.push(s.charCodeAt(i) & 0xff);
    }
  };

  pushAscii(`q ${page.widthPt.toFixed(2)} 0 0 ${page.heightPt.toFixed(2)} 0 0 cm /Im1 Do Q\n`);

  if (page.annotations.length > 0) {
    pushAscii('BT\n3 Tr\n');
    for (const a of page.annotations) {
      const pdfY = Math.max(4, page.heightPt - a.yFromTop);
      const estHelveticaW = Math.max(4, a.text.length * a.fontSize * 0.52);
      const tz = Math.min(180, Math.max(45, (a.width / estHelveticaW) * 100));
      pushAscii(
        `/F1 ${a.fontSize.toFixed(1)} Tf ${tz.toFixed(1)} Tz 1 0 0 1 ${a.x.toFixed(2)} ${pdfY.toFixed(2)} Tm (`
      );
      const strBytes = unicodeToWinAnsiBytes(a.text);
      for (const b of strBytes) chunks.push(b);
      pushAscii(') Tj\n');
    }
    pushAscii('ET\n');
  }

  return new Uint8Array(chunks);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function compilePdfBinary(pages: RenderedPdfPage[]): Uint8Array {
  // Object numbering:
  // 1: Catalog
  // 2: Pages
  // 3: Shared Helvetica WinAnsi Font
  // Per page i (0..N-1):
  //   pageObjId    = 4 + i * 3
  //   imageObjId   = 5 + i * 3
  //   contentObjId = 6 + i * 3
  const encoder = new TextEncoder();
  const segments: Uint8Array[] = [];
  const offsets: number[] = [0]; // 1-based object offsets; entry 0 unused
  let byteCursor = 0;

  const pushBytes = (bytes: Uint8Array) => {
    segments.push(bytes);
    byteCursor += bytes.length;
  };
  const pushStr = (str: string) => pushBytes(encoder.encode(str));

  const beginObj = (id: number) => {
    offsets[id] = byteCursor;
    pushStr(`${id} 0 obj\n`);
  };
  const endObj = () => {
    pushStr('\nendobj\n');
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  beginObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  const pageKidsRefs = pages.map((_, idx) => `${4 + idx * 3} 0 R`).join(' ');
  beginObj(2);
  pushStr(`<< /Type /Pages /Kids [${pageKidsRefs}] /Count ${pages.length} >>`);
  endObj();

  beginObj(3);
  pushStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  endObj();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageObjId = 4 + i * 3;
    const imgObjId = 5 + i * 3;
    const contentObjId = 6 + i * 3;

    const jpegBytes = base64ToUint8Array(canvasToBase64(page.canvas, 'jpeg'));
    const streamBytes = buildTextOverlayStream(page);

    beginObj(pageObjId);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.widthPt.toFixed(2)} ${page.heightPt.toFixed(2)}] ` +
        `/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${imgObjId} 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>`
    );
    endObj();

    beginObj(imgObjId);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${page.canvas.width} /Height ${page.canvas.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
    );
    pushBytes(jpegBytes);
    pushStr('\nendstream');
    endObj();

    beginObj(contentObjId);
    pushStr(`<< /Length ${streamBytes.length} >>\nstream\n`);
    pushBytes(streamBytes);
    pushStr('\nendstream');
    endObj();
  }

  const totalObjects = 4 + pages.length * 3;
  const xrefStart = byteCursor;
  pushStr(`xref\n0 ${totalObjects}\n`);
  pushStr('0000000000 65535 f \n');
  for (let id = 1; id < totalObjects; id++) {
    const offStr = String(offsets[id] ?? 0).padStart(10, '0');
    pushStr(`${offStr} 00000 n \n`);
  }

  pushStr(`trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const merged = new Uint8Array(byteCursor);
  let pos = 0;
  for (const seg of segments) {
    merged.set(seg, pos);
    pos += seg.length;
  }
  return merged;
}

export function openPdfExportModal(opts: PdfExportOptions): void {
  if (activePdfOverlay) {
    activePdfOverlay.remove();
    activePdfOverlay = null;
  }
  if (activePdfLayer) {
    activePdfLayer.close({ restoreFocus: false });
    activePdfLayer = null;
  }

  let currentTheme: ExportThemeMode = opts.theme ?? 'light';
  let currentFormat: PdfPageFormat = opts.pageFormat ?? 'a4';
  let currentFooter = opts.includeFooter ?? true;
  let renderedPages: RenderedPdfPage[] = [];
  let renderSeq = 0;

  const overlay = document.createElement('div');
  overlay.className = 'gecko-diagram-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Exportar Documento para PDF');

  const box = document.createElement('div');
  box.className = 'gecko-diagram-modal-box gecko-pdf-modal-box';
  box.tabIndex = -1;

  // Header
  const header = document.createElement('div');
  header.className = 'gecko-diagram-modal-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'gecko-diagram-modal-title-group';
  titleGroup.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 1.5h6.5L13 5v9.5H3V1.5z"/><polyline points="9.5 1.5 9.5 5 13 5"/></svg>`;

  const titleSpan = document.createElement('span');
  titleSpan.className = 'gecko-diagram-modal-title';
  titleSpan.textContent = 'Exportar PDF';

  const metaSpan = document.createElement('span');
  metaSpan.className = 'gecko-diagram-modal-hint';
  metaSpan.textContent = 'Renderizando páginas...';

  titleGroup.append(titleSpan, metaSpan);

  const controls = document.createElement('div');
  controls.className = 'gecko-diagram-modal-controls gecko-pdf-controls';

  const makeOptBtn = (label: string, title: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cm-md-diagram-btn';
    b.textContent = label;
    b.title = title;
    return b;
  };

  const lightBtn = makeOptBtn('Claro (Papel)', 'Tema claro para leitura e impressão');
  const darkBtn = makeOptBtn('Escuro (Gecko)', 'Usar cores atuais do editor Gecko');

  const sep1 = document.createElement('span');
  sep1.className = 'gecko-pdf-ctrl-sep';

  const a4Btn = makeOptBtn('A4', 'Formato A4 (210 × 297 mm)');
  const letterBtn = makeOptBtn('Carta', 'Formato Carta / US Letter');

  const sep2 = document.createElement('span');
  sep2.className = 'gecko-pdf-ctrl-sep';

  const footerBtn = makeOptBtn('Numeração', 'Exibir título e número da página no rodapé');

  const sep3 = document.createElement('span');
  sep3.className = 'gecko-pdf-ctrl-sep';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'action-btn primary gecko-pdf-save-btn';
  saveBtn.textContent = 'Salvar PDF...';

  const closeBtn = makeOptBtn('', 'Fechar (Esc)');
  closeBtn.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/></svg>';

  controls.append(lightBtn, darkBtn, sep1, a4Btn, letterBtn, sep2, footerBtn, sep3, saveBtn, closeBtn);
  header.append(titleGroup, controls);

  const viewport = document.createElement('div');
  viewport.className = 'gecko-diagram-modal-viewport gecko-pdf-preview-viewport';

  const syncControlStates = () => {
    lightBtn.classList.toggle('is-active', currentTheme === 'light');
    darkBtn.classList.toggle('is-active', currentTheme === 'dark');
    a4Btn.classList.toggle('is-active', currentFormat === 'a4');
    letterBtn.classList.toggle('is-active', currentFormat === 'letter');
    footerBtn.classList.toggle('is-active', currentFooter);
  };

  const refreshPreview = async () => {
    const seq = ++renderSeq;
    syncControlStates();
    saveBtn.disabled = true;
    metaSpan.textContent = `${opts.fileName} · gerando pré-visualização...`;

    try {
      const pages = await renderMarkdownToPdfPages(opts.markdown, opts.fileName, {
        theme: currentTheme,
        pageFormat: currentFormat,
        includeFooter: currentFooter,
      });
      if (seq !== renderSeq || !viewport.isConnected) return;

      renderedPages = pages;
      viewport.innerHTML = '';

      pages.forEach((p, idx) => {
        const sheet = document.createElement('div');
        sheet.className = 'gecko-pdf-sheet';

        const displayCanvas = p.canvas;
        displayCanvas.className = 'gecko-pdf-sheet-canvas';
        sheet.appendChild(displayCanvas);

        const caption = document.createElement('div');
        caption.className = 'gecko-pdf-sheet-caption';
        caption.textContent = `Página ${idx + 1} / ${pages.length}`;
        sheet.appendChild(caption);

        viewport.appendChild(sheet);
      });

      const fmtLabel = currentFormat === 'a4' ? 'A4' : 'Carta';
      const themeLabel = currentTheme === 'light' ? 'Claro' : 'Escuro';
      metaSpan.textContent = `${opts.fileName} · ${pages.length} ${pages.length === 1 ? 'página' : 'páginas'} · ${fmtLabel} · ${themeLabel}`;
      saveBtn.disabled = false;
    } catch (err) {
      if (seq !== renderSeq) return;
      metaSpan.textContent = `Erro ao gerar PDF: ${String(err)}`;
    }
  };

  const close = (restoreFocus = true) => {
    if (activePdfOverlay === overlay) {
      overlay.remove();
      activePdfOverlay = null;
    }
    const layer = activePdfLayer;
    activePdfLayer = null;
    layer?.close({ restoreFocus });
  };

  lightBtn.addEventListener('click', () => {
    currentTheme = 'light';
    void refreshPreview();
  });
  darkBtn.addEventListener('click', () => {
    currentTheme = 'dark';
    void refreshPreview();
  });
  a4Btn.addEventListener('click', () => {
    currentFormat = 'a4';
    void refreshPreview();
  });
  letterBtn.addEventListener('click', () => {
    currentFormat = 'letter';
    void refreshPreview();
  });
  footerBtn.addEventListener('click', () => {
    currentFooter = !currentFooter;
    void refreshPreview();
  });

  saveBtn.addEventListener('click', async () => {
    if (renderedPages.length === 0) return;
    saveBtn.disabled = true;
    const prevText = saveBtn.textContent;
    saveBtn.textContent = 'Exportando...';
    try {
      const pdfBytes = compilePdfBinary(renderedPages);
      const base64 = uint8ArrayToBase64(pdfBytes);
      const stem = sanitizeFileStem(opts.fileName, 'documento');
      const res = await exportBase64Binary(stem, 'pdf', base64);
      if (res.saved) {
        getExportHost().notifyStatus(`PDF exportado: ${res.path ?? `${stem}.pdf`}`);
        close(true);
        return;
      }
    } catch (err) {
      getExportHost().notifyStatus(`Falha ao exportar PDF: ${String(err)}`);
    } finally {
      if (saveBtn.isConnected) {
        saveBtn.disabled = false;
        saveBtn.textContent = prevText;
      }
    }
  });

  closeBtn.addEventListener('click', () => close(true));
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close(true);
  });

  box.append(header, viewport);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  activePdfOverlay = overlay;

  void refreshPreview();

  activePdfLayer = pushLayer({
    id: 'pdf-exporter',
    element: box,
    kind: 'modal',
    initialFocus: saveBtn,
    onEscape: () => {
      close(true);
      return true;
    },
    onKeyDown: (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        viewport.scrollTop += 64;
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        viewport.scrollTop -= 64;
        return true;
      }
      if (e.key === 'PageDown') {
        e.preventDefault();
        viewport.scrollTop += Math.max(240, viewport.clientHeight - 80);
        return true;
      }
      if (e.key === 'PageUp') {
        e.preventDefault();
        viewport.scrollTop -= Math.max(240, viewport.clientHeight - 80);
        return true;
      }
      return false;
    },
  });
}
