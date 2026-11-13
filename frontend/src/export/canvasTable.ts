import {
  getSavedColumnWidths,
  ParsedMarkdownTable,
} from '../editor/tableViewer';
import {
  canvasToBase64,
  exportBase64Binary,
  ExportImageFormat,
  ExportPalette,
  ExportSaveResult,
  ExportThemeMode,
  getExportHost,
  resolveExportPalette,
  sanitizeFileStem,
} from './exportUtils';

export type InlineRunKind =
  | 'text'
  | 'bold'
  | 'italic'
  | 'bolditalic'
  | 'strike'
  | 'underline'
  | 'code'
  | 'link';

export interface InlineRun {
  kind: InlineRunKind;
  text: string;
  isBreak?: boolean;
}

export interface FontStyleSpec {
  size: number;
  lineHeight: number;
  sansFamily: string;
  monoFamily: string;
  defaultBold?: boolean;
  defaultColor?: string;
}

export interface WrappedSegment {
  kind: InlineRunKind;
  text: string;
  width: number;
}

export interface WrappedLine {
  width: number;
  segments: WrappedSegment[];
}

export interface CanvasTextAnnotation {
  x: number;
  y: number;
  fontSize: number;
  width: number;
  text: string;
}

export interface TableLayout {
  parsed: ParsedMarkdownTable;
  colWidths: number[];
  headerCells: WrappedLine[][];
  bodyRows: WrappedLine[][][];
  headerHeight: number;
  rowHeights: number[];
  totalWidth: number;
  totalHeight: number;
  fontSize: number;
  lineHeight: number;
  cellPadX: number;
  cellPadY: number;
}

const INLINE_TOKEN_REGEX =
  /(`[^`]+`|<br\s*\/?>|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\n]+\*|~~[^~]+~~|<u>[\s\S]*?<\/u>|\[[^\]]+\]\([^)]+\))/gi;

export function parseInlineMarkdownRuns(input: string): InlineRun[] {
  const runs: InlineRun[] = [];
  if (!input) return runs;

  let lastIndex = 0;
  INLINE_TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_TOKEN_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ kind: 'text', text: input.slice(lastIndex, match.index) });
    }

    const token = match[0];
    if (/^<br\s*\/?>$/i.test(token)) {
      runs.push({ kind: 'text', text: '', isBreak: true });
    } else if (token.startsWith('`') && token.endsWith('`')) {
      runs.push({ kind: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('***') && token.endsWith('***')) {
      runs.push({ kind: 'bolditalic', text: token.slice(3, -3) });
    } else if (token.startsWith('**') && token.endsWith('**')) {
      runs.push({ kind: 'bold', text: token.slice(2, -2) });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      runs.push({ kind: 'italic', text: token.slice(1, -1) });
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      runs.push({ kind: 'strike', text: token.slice(2, -2) });
    } else if (/^<u>/i.test(token) && /<\/u>$/i.test(token)) {
      runs.push({ kind: 'underline', text: token.slice(3, -4) });
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        runs.push({ kind: 'link', text: linkMatch[1] });
      } else {
        runs.push({ kind: 'text', text: token });
      }
    } else {
      runs.push({ kind: 'text', text: token });
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < input.length) {
    runs.push({ kind: 'text', text: input.slice(lastIndex) });
  }

  return runs;
}

function buildFontString(kind: InlineRunKind, spec: FontStyleSpec): string {
  const s = spec.size;
  if (kind === 'code') {
    const codeSize = Math.max(8, Math.round((s * 0.9) * 10) / 10);
    return `${spec.defaultBold ? '600 ' : ''}${codeSize}px ${spec.monoFamily}`;
  }
  const isBold = spec.defaultBold || kind === 'bold' || kind === 'bolditalic';
  const isItalic = kind === 'italic' || kind === 'bolditalic';
  const prefix = `${isItalic ? 'italic ' : ''}${isBold ? '600 ' : ''}`;
  return `${prefix}${s}px ${spec.sansFamily}`;
}

export function measureRunText(
  ctx: CanvasRenderingContext2D,
  text: string,
  kind: InlineRunKind,
  spec: FontStyleSpec
): number {
  if (!text) return 0;
  ctx.font = buildFontString(kind, spec);
  return ctx.measureText(text).width;
}

export function wrapInlineRuns(
  ctx: CanvasRenderingContext2D,
  runs: InlineRun[],
  maxWidth: number,
  spec: FontStyleSpec
): WrappedLine[] {
  const safeMaxW = Math.max(24, maxWidth);
  const lines: WrappedLine[] = [];
  let curSegments: WrappedSegment[] = [];
  let curWidth = 0;

  const commitLine = () => {
    // Trim trailing spaces at line end for clean alignment
    if (curSegments.length > 0) {
      const last = curSegments[curSegments.length - 1];
      if (last.kind !== 'code' && /^\s+$/.test(last.text)) {
        curWidth = Math.max(0, curWidth - last.width);
        curSegments.pop();
      }
    }
    lines.push({ width: curWidth, segments: curSegments });
    curSegments = [];
    curWidth = 0;
  };

  const pushSegment = (kind: InlineRunKind, text: string, width: number) => {
    if (!text) return;
    const prev = curSegments[curSegments.length - 1];
    if (prev && prev.kind === kind) {
      prev.text += text;
      prev.width += width;
    } else {
      curSegments.push({ kind, text, width });
    }
    curWidth += width;
  };

  const pushHardBrokenToken = (kind: InlineRunKind, token: string, extraPad = 0) => {
    let chunk = '';
    for (const ch of token) {
      const candidate = chunk + ch;
      const w = measureRunText(ctx, candidate, kind, spec) + extraPad;
      if (curWidth + w > safeMaxW && (curSegments.length > 0 || chunk.length > 0)) {
        if (chunk.length > 0) {
          pushSegment(kind, chunk, measureRunText(ctx, chunk, kind, spec) + extraPad);
          commitLine();
          chunk = ch;
        } else {
          commitLine();
          chunk = ch;
        }
      } else {
        chunk = candidate;
      }
    }
    if (chunk.length > 0) {
      pushSegment(kind, chunk, measureRunText(ctx, chunk, kind, spec) + extraPad);
    }
  };

  for (const run of runs) {
    if (run.isBreak) {
      commitLine();
      continue;
    }

    const parts = run.text.split('\n');
    parts.forEach((linePart, partIdx) => {
      if (partIdx > 0) {
        commitLine();
      }
      if (!linePart) return;

      if (run.kind === 'code') {
        const codeW = measureRunText(ctx, linePart, 'code', spec) + 8;
        if (curWidth > 0 && curWidth + codeW > safeMaxW) {
          commitLine();
        }
        if (codeW <= safeMaxW) {
          pushSegment('code', linePart, codeW);
        } else {
          pushHardBrokenToken('code', linePart, 8);
        }
        return;
      }

      const tokens = linePart.split(/(\s+)/);
      for (const tok of tokens) {
        if (!tok) continue;
        const isSpace = /^\s+$/.test(tok);
        if (isSpace && curSegments.length === 0) {
          continue;
        }

        const w = measureRunText(ctx, tok, run.kind, spec);
        if (!isSpace && curWidth > 0 && curWidth + w > safeMaxW) {
          commitLine();
        }

        if (!isSpace && w > safeMaxW) {
          pushHardBrokenToken(run.kind, tok, 0);
        } else {
          pushSegment(run.kind, tok, w);
        }
      }
    });
  }

  commitLine();
  return lines.length > 0 ? lines : [{ width: 0, segments: [] }];
}

export function drawWrappedLines(
  ctx: CanvasRenderingContext2D,
  lines: WrappedLine[],
  x: number,
  topY: number,
  boxWidth: number,
  align: 'left' | 'center' | 'right',
  spec: FontStyleSpec,
  palette: ExportPalette,
  annotations?: CanvasTextAnnotation[]
): void {
  ctx.textBaseline = 'alphabetic';
  const baselineOffset = spec.lineHeight * 0.72;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let cursorX = x;
    if (align === 'center') {
      cursorX = x + Math.max(0, (boxWidth - line.width) / 2);
    } else if (align === 'right') {
      cursorX = x + Math.max(0, boxWidth - line.width);
    }

    const baselineY = topY + lineIdx * spec.lineHeight + baselineOffset;
    const lineParts: string[] = [];

    for (const seg of line.segments) {
      ctx.font = buildFontString(seg.kind, spec);

      if (seg.kind === 'code') {
        const badgeH = spec.size * 1.18;
        const badgeY = baselineY - spec.size * 0.94;
        ctx.fillStyle = palette.bgBadge;
        ctx.fillRect(cursorX, badgeY, seg.width, badgeH);
        ctx.fillStyle = palette.mdHeading;
        ctx.fillText(seg.text, cursorX + 4, baselineY);
      } else {
        let color = spec.defaultColor || palette.textPrimary;
        if (seg.kind === 'link') color = palette.accentPrimary;
        ctx.fillStyle = color;
        ctx.fillText(seg.text, cursorX, baselineY);

        if (seg.kind === 'underline' || seg.kind === 'link') {
          ctx.fillRect(cursorX, baselineY + 2, seg.width, 1);
        } else if (seg.kind === 'strike') {
          ctx.fillRect(cursorX, baselineY - spec.size * 0.3, seg.width, 1);
        }
      }

      lineParts.push(seg.text);
      cursorX += seg.width;
    }

    const combinedText = lineParts.join('').trim();
    if (annotations && combinedText.length > 0) {
      let annotX = x;
      if (align === 'center') annotX = x + Math.max(0, (boxWidth - line.width) / 2);
      else if (align === 'right') annotX = x + Math.max(0, boxWidth - line.width);
      annotations.push({
        x: annotX,
        y: baselineY,
        fontSize: spec.size,
        width: Math.max(4, line.width),
        text: combinedText,
      });
    }
  }
}

export interface TableLayoutOptions {
  maxTotalWidth: number;
  constrainToMaxWidth: boolean;
  preferSavedWidths: boolean;
  fontSize?: number;
  lineHeight?: number;
  cellPadX?: number;
  cellPadY?: number;
}

export function layoutCanvasTable(
  ctx: CanvasRenderingContext2D,
  parsed: ParsedMarkdownTable,
  widthKey: string,
  options: TableLayoutOptions,
  palette: ExportPalette
): TableLayout {
  const fontSize = options.fontSize ?? 13;
  const lineHeight = options.lineHeight ?? Math.round(fontSize * 1.48);
  const cellPadX = options.cellPadX ?? 12;
  const cellPadY = options.cellPadY ?? 8;
  const colCount = parsed.headers.length;

  const headerSpec: FontStyleSpec = {
    size: fontSize,
    lineHeight,
    sansFamily: palette.fontSans,
    monoFamily: palette.fontMono,
    defaultBold: true,
    defaultColor: palette.mdHeading,
  };
  const bodySpec: FontStyleSpec = {
    size: fontSize,
    lineHeight,
    sansFamily: palette.fontSans,
    monoFamily: palette.fontMono,
    defaultColor: palette.textPrimary,
  };

  let colWidths: number[] | null = options.preferSavedWidths
    ? getSavedColumnWidths(widthKey, colCount)
    : null;

  if (colWidths && options.constrainToMaxWidth) {
    const sum = colWidths.reduce((a, b) => a + b, 0);
    if (sum > options.maxTotalWidth && sum > 0) {
      const ratio = options.maxTotalWidth / sum;
      colWidths = colWidths.map((w) => Math.max(48, Math.floor(w * ratio)));
      const adj = options.maxTotalWidth - colWidths.reduce((a, b) => a + b, 0);
      if (colWidths.length > 0) {
        colWidths[colWidths.length - 1] = Math.max(48, colWidths[colWidths.length - 1] + adj);
      }
    }
  }

  if (!colWidths) {
    // Measure natural single-line width per column and allocate balanced widths
    const minColW = Math.min(72, Math.floor(options.maxTotalWidth / Math.max(1, colCount)));
    const naturalWidths = new Array<number>(colCount).fill(minColW);

    for (let c = 0; c < colCount; c++) {
      const hRuns = parseInlineMarkdownRuns(parsed.headers[c]);
      const hWidth = hRuns.reduce((sum, r) => sum + measureRunText(ctx, r.text, r.kind, headerSpec), 0);
      naturalWidths[c] = Math.max(naturalWidths[c], Math.min(340, Math.ceil(hWidth + cellPadX * 2 + 8)));

      for (const row of parsed.rows) {
        const cell = row[c] || '';
        const brParts = cell.split(/<br\s*\/?>/gi);
        for (const brLine of brParts) {
          const runs = parseInlineMarkdownRuns(brLine);
          const lineW = runs.reduce((sum, r) => sum + measureRunText(ctx, r.text, r.kind, bodySpec), 0);
          naturalWidths[c] = Math.max(
            naturalWidths[c],
            Math.min(480, Math.ceil(lineW + cellPadX * 2 + 8))
          );
        }
      }
    }

    const natSum = naturalWidths.reduce((a, b) => a + b, 0);
    if (natSum <= options.maxTotalWidth) {
      if (options.constrainToMaxWidth && natSum < options.maxTotalWidth) {
        // Fill printable PDF page width cleanly while preserving relative weights
        const extra = options.maxTotalWidth - natSum;
        colWidths = naturalWidths.map((w, idx) =>
          w + Math.floor((extra * w) / natSum) + (idx === colCount - 1 ? 0 : 0)
        );
        const rem = options.maxTotalWidth - colWidths.reduce((a, b) => a + b, 0);
        if (colWidths.length > 0) colWidths[colWidths.length - 1] += rem;
      } else {
        colWidths = naturalWidths;
      }
    } else {
      const ratio = options.maxTotalWidth / natSum;
      colWidths = naturalWidths.map((w) => Math.max(minColW, Math.floor(w * ratio)));
      const diff = options.maxTotalWidth - colWidths.reduce((a, b) => a + b, 0);
      if (colWidths.length > 0) {
        colWidths[colWidths.length - 1] = Math.max(minColW, colWidths[colWidths.length - 1] + diff);
      }
    }
  }

  const headerCells: WrappedLine[][] = [];
  let maxHeaderLines = 1;
  for (let c = 0; c < colCount; c++) {
    const wrapped = wrapInlineRuns(
      ctx,
      parseInlineMarkdownRuns(parsed.headers[c]),
      colWidths[c] - cellPadX * 2,
      headerSpec
    );
    headerCells.push(wrapped);
    maxHeaderLines = Math.max(maxHeaderLines, wrapped.length);
  }
  const headerHeight = maxHeaderLines * lineHeight + cellPadY * 2;

  const bodyRows: WrappedLine[][][] = [];
  const rowHeights: number[] = [];

  for (const row of parsed.rows) {
    const wrappedRow: WrappedLine[][] = [];
    let maxLines = 1;
    for (let c = 0; c < colCount; c++) {
      const wrapped = wrapInlineRuns(
        ctx,
        parseInlineMarkdownRuns(row[c] || ''),
        colWidths[c] - cellPadX * 2,
        bodySpec
      );
      wrappedRow.push(wrapped);
      maxLines = Math.max(maxLines, wrapped.length);
    }
    bodyRows.push(wrappedRow);
    rowHeights.push(maxLines * lineHeight + cellPadY * 2);
  }

  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const totalHeight = headerHeight + rowHeights.reduce((a, b) => a + b, 0);

  return {
    parsed,
    colWidths,
    headerCells,
    bodyRows,
    headerHeight,
    rowHeights,
    totalWidth,
    totalHeight,
    fontSize,
    lineHeight,
    cellPadX,
    cellPadY,
  };
}

export function drawCanvasTableSection(
  ctx: CanvasRenderingContext2D,
  layout: TableLayout,
  startX: number,
  startY: number,
  rowStart: number,
  rowEnd: number,
  palette: ExportPalette,
  accentStripe = true,
  annotations?: CanvasTextAnnotation[]
): number {
  const { parsed, colWidths, headerCells, bodyRows, headerHeight, rowHeights, totalWidth } = layout;
  const headerSpec: FontStyleSpec = {
    size: layout.fontSize,
    lineHeight: layout.lineHeight,
    sansFamily: palette.fontSans,
    monoFamily: palette.fontMono,
    defaultBold: true,
    defaultColor: palette.mdHeading,
  };
  const bodySpec: FontStyleSpec = {
    size: layout.fontSize,
    lineHeight: layout.lineHeight,
    sansFamily: palette.fontSans,
    monoFamily: palette.fontMono,
    defaultColor: palette.textPrimary,
  };

  let curY = startY;

  // Header Background
  ctx.fillStyle = palette.bgHeader;
  ctx.fillRect(startX, curY, totalWidth, headerHeight);

  let colX = startX;
  for (let c = 0; c < colWidths.length; c++) {
    const colW = colWidths[c];
    drawWrappedLines(
      ctx,
      headerCells[c],
      colX + layout.cellPadX,
      curY + layout.cellPadY,
      colW - layout.cellPadX * 2,
      parsed.alignments[c] || 'left',
      headerSpec,
      palette,
      annotations
    );
    colX += colW;
  }
  curY += headerHeight;

  // Body Rows
  for (let r = rowStart; r < rowEnd; r++) {
    const rowH = rowHeights[r];
    ctx.fillStyle = palette.bgSurface;
    ctx.fillRect(startX, curY, totalWidth, rowH);

    colX = startX;
    for (let c = 0; c < colWidths.length; c++) {
      const colW = colWidths[c];
      drawWrappedLines(
        ctx,
        bodyRows[r][c],
        colX + layout.cellPadX,
        curY + layout.cellPadY,
        colW - layout.cellPadX * 2,
        parsed.alignments[c] || 'left',
        bodySpec,
        palette,
        annotations
      );
      colX += colW;
    }

    // Horizontal row border
    ctx.fillStyle = palette.borderSubtle;
    ctx.fillRect(startX, curY, totalWidth, 1);
    curY += rowH;
  }

  const sectionH = curY - startY;

  // Vertical column borders
  ctx.fillStyle = palette.borderSubtle;
  colX = startX;
  for (let c = 0; c < colWidths.length - 1; c++) {
    colX += colWidths[c];
    ctx.fillRect(colX, startY, 1, sectionH);
  }

  // Outer rectangle border (crisp 1px)
  ctx.strokeStyle = palette.borderSubtle;
  ctx.lineWidth = 1;
  ctx.strokeRect(startX + 0.5, startY + 0.5, totalWidth - 1, sectionH - 1);

  if (accentStripe) {
    ctx.fillStyle = palette.accentPrimary;
    ctx.fillRect(startX, startY, 2.5, sectionH);
  }

  return sectionH;
}

export async function exportTableImage(opts: {
  parsed: ParsedMarkdownTable;
  widthKey: string;
  format: ExportImageFormat;
  theme: ExportThemeMode;
}): Promise<ExportSaveResult> {
  const palette = resolveExportPalette(opts.theme);
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) {
    throw new Error('Contexto 2D indisponível para exportar tabela');
  }

  const layout = layoutCanvasTable(
    measureCtx,
    opts.parsed,
    opts.widthKey,
    {
      maxTotalWidth: 1120,
      constrainToMaxWidth: false,
      preferSavedWidths: true,
      fontSize: 13,
      lineHeight: 20,
      cellPadX: 12,
      cellPadY: 8,
    },
    palette
  );

  const outerPad = 14;
  const scale = 2;
  const logicalW = layout.totalWidth + outerPad * 2;
  const logicalH = layout.totalHeight + outerPad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(logicalW * scale);
  canvas.height = Math.ceil(logicalH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto 2D indisponível para renderização de tabela');
  }

  ctx.scale(scale, scale);
  ctx.fillStyle = palette.bgPage;
  ctx.fillRect(0, 0, logicalW, logicalH);

  drawCanvasTableSection(
    ctx,
    layout,
    outerPad,
    outerPad,
    0,
    opts.parsed.rows.length,
    palette,
    true
  );

  const base64 = canvasToBase64(canvas, opts.format);
  const host = getExportHost();
  const fileStem = sanitizeFileStem(host.getActiveFileStem(), 'documento');
  const firstHeader = sanitizeFileStem(opts.parsed.headers[0] || 'tabela', 'tabela').toLowerCase();
  const suggested = `${fileStem}-tabela-${firstHeader}`;

  const result = await exportBase64Binary(suggested, opts.format, base64);
  if (result.saved) {
    const tag = opts.format === 'jpeg' ? 'JPEG' : 'PNG';
    host.notifyStatus(`Tabela exportada (${tag}): ${result.path ?? suggested}`);
  }
  return result;
}
