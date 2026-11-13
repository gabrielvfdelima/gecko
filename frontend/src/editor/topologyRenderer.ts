/**
 * Zero-dependency SVG Topology & Diagram Renderer for Gecko.
 * Renders Unicode/ASCII architecture topologies, box diagrams, and a clean subset of
 * Mermaid diagrams (flowchart/graph, sequenceDiagram, pie) into industrial themed SVGs.
 */

export type DiagramKind =
  | 'ascii-topology'
  | 'mermaid-flow'
  | 'mermaid-seq'
  | 'mermaid-pie'
  | 'ascii-chart';

export interface DiagramDetection {
  kind: DiagramKind;
  label: string;
}

export interface RenderedDiagram {
  kind: DiagramKind;
  label: string;
  svg: SVGSVGElement;
  width: number;
  height: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let nextMarkerUid = 1;

export const MAX_DIAGRAM_CHARS = 40_000;
export const MAX_DIAGRAM_LINES = 400;

const EXPLICIT_ASCII_LANGS = new Set([
  'topology',
  'diagram',
  'ascii',
  'asciiart',
  'ascii-art',
  'architecture',
  'arch',
  'tree',
  'flow',
  'box',
  'erd',
  'network',
]);

const PLAIN_LANGS = new Set(['', 'text', 'txt', 'plaintext', 'plain', 'md', 'markdown']);

const UNICODE_BOX_OR_ARROW_RE =
  /[┌┐└┘├┤┬┴┼│─═║╔╗╚╝╠╣╦╩╬╭╮╰╯┏┓┗┛┣┫┳┻╋┃━▼▲►◄▶◀▾▴▸◂]/g;

const ASCII_BAR_CHART_RE = /[█▓▒░■▪▬]{3,}/g;

const BOX_CELL_H = 22;
const BOX_PAD_X = 20;
const BOX_PAD_Y = 16;

let cachedMonoCharWidth: number | null = null;

function getMonoCharWidth(): number {
  if (cachedMonoCharWidth !== null) {
    return cachedMonoCharWidth;
  }
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const rootStyle = getComputedStyle(document.documentElement);
      const fontFamily =
        rootStyle.getPropertyValue('--font-mono').trim() ||
        "'JetBrains Mono', 'Fira Code', monospace";
      ctx.font = `13px ${fontFamily}`;
      const sample = 'MMMMMMMMMM0000000000';
      const w = ctx.measureText(sample).width / sample.length;
      if (w > 4 && w < 20) {
        cachedMonoCharWidth = w;
        return w;
      }
    }
  } catch {
    // Fallback below
  }
  cachedMonoCharWidth = 7.8;
  return cachedMonoCharWidth;
}

function createSvgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
  }
  return el;
}

/**
 * Detects whether a fenced code block represents a topology, diagram, or chart
 * suitable for live SVG preview.
 */
export function detectDiagramBlock(langRaw: string, body: string): DiagramDetection | null {
  if (!body || body.length > MAX_DIAGRAM_CHARS) return null;
  const trimmed = body.trim();
  if (!trimmed) return null;

  const lines = trimmed.split(/\r?\n/);
  if (lines.length > MAX_DIAGRAM_LINES) return null;

  const lang = langRaw.trim().toLowerCase();

  if (lang === 'mermaid') {
    const firstDirective = getMermaidDirective(lines);
    if (!firstDirective) return null;
    if (/^(?:flowchart|graph)\b/i.test(firstDirective)) {
      return { kind: 'mermaid-flow', label: 'Fluxograma' };
    }
    if (/^sequenceDiagram\b/i.test(firstDirective)) {
      return { kind: 'mermaid-seq', label: 'Sequência' };
    }
    if (/^pie\b/i.test(firstDirective)) {
      return { kind: 'mermaid-pie', label: 'Gráfico' };
    }
    return null;
  }

  if (EXPLICIT_ASCII_LANGS.has(lang)) {
    return { kind: 'ascii-topology', label: 'Topologia' };
  }

  if (!PLAIN_LANGS.has(lang)) {
    return null;
  }

  // Heuristic detection for untagged / text fenced blocks
  const unicodeMatches = trimmed.match(UNICODE_BOX_OR_ARROW_RE);
  if (unicodeMatches && unicodeMatches.length >= 2) {
    return { kind: 'ascii-topology', label: 'Topologia' };
  }

  const barMatches = trimmed.match(ASCII_BAR_CHART_RE);
  if (barMatches && barMatches.length >= 2) {
    return { kind: 'ascii-chart', label: 'Gráfico' };
  }

  // Classic ASCII diagram detection: +---+ boxes or [Node] connected by | / v / -->
  const hasAsciiBoxTop = /\+[-=]{2,}\+/.test(trimmed);
  const hasVerticalPipe = /^\s*\|/m.test(trimmed) || /\|\s*$/m.test(trimmed);
  if (hasAsciiBoxTop && hasVerticalPipe) {
    return { kind: 'ascii-topology', label: 'Diagrama' };
  }

  const nodeBoxMatches = trimmed.match(/\[[^\[\]\n]{2,60}\]/g);
  const hasAsciiArrow =
    /(?:^|\s)(?:\||v|V|\^)(?:\s|$)/m.test(trimmed) ||
    /[-=]{2,}>|<[-=]{2,}/.test(trimmed);
  if (nodeBoxMatches && nodeBoxMatches.length >= 2 && hasAsciiArrow) {
    return { kind: 'ascii-topology', label: 'Topologia' };
  }

  return null;
}

function getMermaidDirective(lines: string[]): string | null {
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('%%')) continue;
    return line;
  }
  return null;
}

// ============================================================================
// 1. ASCII / UNICODE TOPOLOGY & BOX-DRAWING RENDERER
// ============================================================================

interface SegmentMask {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
  doubleH?: boolean;
  doubleV?: boolean;
  heavy?: boolean;
  rounded?: boolean;
}

type ArrowDir = 'N' | 'S' | 'E' | 'W';

interface NodeBoxSpan {
  row: number;
  colStart: number; // inclusive '['
  colEnd: number; // inclusive ']'
  label: string;
}

const UNICODE_SEGMENTS: Record<string, SegmentMask> = {
  '─': { n: false, s: false, e: true, w: true },
  '━': { n: false, s: false, e: true, w: true, heavy: true },
  '┄': { n: false, s: false, e: true, w: true },
  '┅': { n: false, s: false, e: true, w: true, heavy: true },
  '┈': { n: false, s: false, e: true, w: true },
  '┉': { n: false, s: false, e: true, w: true, heavy: true },
  '═': { n: false, s: false, e: true, w: true, doubleH: true },
  '│': { n: true, s: true, e: false, w: false },
  '┃': { n: true, s: true, e: false, w: false, heavy: true },
  '┆': { n: true, s: true, e: false, w: false },
  '┇': { n: true, s: true, e: false, w: false, heavy: true },
  '┊': { n: true, s: true, e: false, w: false },
  '┋': { n: true, s: true, e: false, w: false, heavy: true },
  '║': { n: true, s: true, e: false, w: false, doubleV: true },
  '┌': { n: false, s: true, e: true, w: false },
  '┍': { n: false, s: true, e: true, w: false },
  '┎': { n: false, s: true, e: true, w: false },
  '┏': { n: false, s: true, e: true, w: false, heavy: true },
  '╔': { n: false, s: true, e: true, w: false, doubleH: true, doubleV: true },
  '╭': { n: false, s: true, e: true, w: false, rounded: true },
  '┐': { n: false, s: true, e: false, w: true },
  '┑': { n: false, s: true, e: false, w: true },
  '┒': { n: false, s: true, e: false, w: true },
  '┓': { n: false, s: true, e: false, w: true, heavy: true },
  '╗': { n: false, s: true, e: false, w: true, doubleH: true, doubleV: true },
  '╮': { n: false, s: true, e: false, w: true, rounded: true },
  '└': { n: true, s: false, e: true, w: false },
  '┕': { n: true, s: false, e: true, w: false },
  '┖': { n: true, s: false, e: true, w: false },
  '┗': { n: true, s: false, e: true, w: false, heavy: true },
  '╚': { n: true, s: false, e: true, w: false, doubleH: true, doubleV: true },
  '╰': { n: true, s: false, e: true, w: false, rounded: true },
  '┘': { n: true, s: false, e: false, w: true },
  '┙': { n: true, s: false, e: false, w: true },
  '┚': { n: true, s: false, e: false, w: true },
  '┛': { n: true, s: false, e: false, w: true, heavy: true },
  '╝': { n: true, s: false, e: false, w: true, doubleH: true, doubleV: true },
  '╯': { n: true, s: false, e: false, w: true, rounded: true },
  '├': { n: true, s: true, e: true, w: false },
  '┝': { n: true, s: true, e: true, w: false },
  '┞': { n: true, s: true, e: true, w: false },
  '┟': { n: true, s: true, e: true, w: false },
  '┠': { n: true, s: true, e: true, w: false },
  '┡': { n: true, s: true, e: true, w: false },
  '┢': { n: true, s: true, e: true, w: false },
  '┣': { n: true, s: true, e: true, w: false, heavy: true },
  '╠': { n: true, s: true, e: true, w: false, doubleH: true, doubleV: true },
  '╞': { n: true, s: true, e: true, w: false },
  '╟': { n: true, s: true, e: true, w: false },
  '┤': { n: true, s: true, e: false, w: true },
  '┥': { n: true, s: true, e: false, w: true },
  '┦': { n: true, s: true, e: false, w: true },
  '┧': { n: true, s: true, e: false, w: true },
  '┨': { n: true, s: true, e: false, w: true },
  '┩': { n: true, s: true, e: false, w: true },
  '┪': { n: true, s: true, e: false, w: true },
  '┫': { n: true, s: true, e: false, w: true, heavy: true },
  '╣': { n: true, s: true, e: false, w: true, doubleH: true, doubleV: true },
  '╡': { n: true, s: true, e: false, w: true },
  '╢': { n: true, s: true, e: false, w: true },
  '┬': { n: false, s: true, e: true, w: true },
  '┭': { n: false, s: true, e: true, w: true },
  '┮': { n: false, s: true, e: true, w: true },
  '┯': { n: false, s: true, e: true, w: true },
  '┰': { n: false, s: true, e: true, w: true },
  '┱': { n: false, s: true, e: true, w: true },
  '┲': { n: false, s: true, e: true, w: true },
  '┳': { n: false, s: true, e: true, w: true, heavy: true },
  '╦': { n: false, s: true, e: true, w: true, doubleH: true, doubleV: true },
  '╤': { n: false, s: true, e: true, w: true },
  '╥': { n: false, s: true, e: true, w: true },
  '┴': { n: true, s: false, e: true, w: true },
  '┵': { n: true, s: false, e: true, w: true },
  '┶': { n: true, s: false, e: true, w: true },
  '┷': { n: true, s: false, e: true, w: true },
  '┸': { n: true, s: false, e: true, w: true },
  '┹': { n: true, s: false, e: true, w: true },
  '┺': { n: true, s: false, e: true, w: true },
  '┻': { n: true, s: false, e: true, w: true, heavy: true },
  '╩': { n: true, s: false, e: true, w: true, doubleH: true, doubleV: true },
  '╧': { n: true, s: false, e: true, w: true },
  '╨': { n: true, s: false, e: true, w: true },
  '┼': { n: true, s: true, e: true, w: true },
  '┽': { n: true, s: true, e: true, w: true },
  '┾': { n: true, s: true, e: true, w: true },
  '┿': { n: true, s: true, e: true, w: true },
  '╀': { n: true, s: true, e: true, w: true },
  '╁': { n: true, s: true, e: true, w: true },
  '╂': { n: true, s: true, e: true, w: true },
  '╃': { n: true, s: true, e: true, w: true },
  '╄': { n: true, s: true, e: true, w: true },
  '╅': { n: true, s: true, e: true, w: true },
  '╆': { n: true, s: true, e: true, w: true },
  '╇': { n: true, s: true, e: true, w: true },
  '╈': { n: true, s: true, e: true, w: true },
  '╉': { n: true, s: true, e: true, w: true },
  '╊': { n: true, s: true, e: true, w: true },
  '╋': { n: true, s: true, e: true, w: true, heavy: true },
  '╬': { n: true, s: true, e: true, w: true, doubleH: true, doubleV: true },
  '╪': { n: true, s: true, e: true, w: true },
  '╫': { n: true, s: true, e: true, w: true },
  '╵': { n: true, s: false, e: false, w: false },
  '╷': { n: false, s: true, e: false, w: false },
  '╴': { n: false, s: false, e: false, w: true },
  '╶': { n: false, s: false, e: true, w: false },
};

const UNICODE_ARROWS: Record<string, ArrowDir> = {
  '▼': 'S',
  '▾': 'S',
  '▲': 'N',
  '▴': 'N',
  '►': 'E',
  '▶': 'E',
  '▸': 'E',
  '◄': 'W',
  '◀': 'W',
  '◂': 'W',
};

function normalizeDiagramLines(rawText: string): string[] {
  const rawLines = rawText.replace(/\t/g, '  ').split(/\r?\n/);

  let start = 0;
  while (start < rawLines.length && rawLines[start].trim() === '') start++;
  let end = rawLines.length - 1;
  while (end >= start && rawLines[end].trim() === '') end--;

  if (start > end) return [''];
  const sliced = rawLines.slice(start, end + 1).map((l) => l.replace(/\s+$/, ''));

  // Detect uniform double-spacing (common when pasting from browsers/chats)
  let nonEmptyCount = 0;
  let hasAdjacentNonEmpty = false;
  for (let i = 0; i < sliced.length; i++) {
    if (sliced[i].trim() !== '') {
      nonEmptyCount++;
      if (i > 0 && sliced[i - 1].trim() !== '') {
        hasAdjacentNonEmpty = true;
      }
    }
  }

  if (!hasAdjacentNonEmpty && nonEmptyCount >= 3) {
    const collapsed: string[] = [];
    let i = 0;
    while (i < sliced.length) {
      collapsed.push(sliced[i]);
      if (sliced[i].trim() !== '' && i + 1 < sliced.length && sliced[i + 1].trim() === '') {
        i += 2;
      } else {
        i += 1;
      }
    }
    return collapsed;
  }

  return sliced;
}

function detectAsciiLinesAndArrows(
  grid: string[][],
  nodeMask: boolean[][]
): {
  segments: (SegmentMask | null)[][];
  arrows: (ArrowDir | null)[][];
} {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const segments: (SegmentMask | null)[][] = Array.from({ length: rows }, () =>
    Array<SegmentMask | null>(cols).fill(null)
  );
  const arrows: (ArrowDir | null)[][] = Array.from({ length: rows }, () =>
    Array<ArrowDir | null>(cols).fill(null)
  );

  const charAt = (r: number, c: number): string => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return ' ';
    if (nodeMask[r][c]) return ' ';
    return grid[r][c];
  };

  // First pass: register explicit Unicode box-drawing and arrow glyphs
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (nodeMask[r][c]) continue;
      const ch = grid[r][c];
      if (ch in UNICODE_SEGMENTS) {
        segments[r][c] = { ...UNICODE_SEGMENTS[ch] };
      } else if (ch in UNICODE_ARROWS) {
        arrows[r][c] = UNICODE_ARROWS[ch];
      }
    }
  }

  const isHorizSeed = (ch: string) => ch === '-' || ch === '=' || (ch in UNICODE_SEGMENTS && (UNICODE_SEGMENTS[ch].e || UNICODE_SEGMENTS[ch].w));
  const isVertSeed = (ch: string) => ch === '|' || (ch in UNICODE_SEGMENTS && (UNICODE_SEGMENTS[ch].n || UNICODE_SEGMENTS[ch].s));

  // Second pass: contextual pure-ASCII connectors (+, -, =, |, >, <, v, ^)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (nodeMask[r][c] || segments[r][c] || arrows[r][c]) continue;
      const ch = grid[r][c];
      const left = charAt(r, c - 1);
      const right = charAt(r, c + 1);
      const up = charAt(r - 1, c);
      const down = charAt(r + 1, c);

      if (ch === '+') {
        const e = isHorizSeed(right) || right === '>';
        const w = isHorizSeed(left) || left === '<';
        const n = isVertSeed(up) || up === '^';
        const s = isVertSeed(down) || down === 'v' || down === 'V';
        if ((e || w) || (n || s)) {
          segments[r][c] = { n, s, e, w };
        }
      } else if (ch === '|') {
        const hasVertNeighbor =
          isVertSeed(up) ||
          isVertSeed(down) ||
          up === '+' ||
          down === '+' ||
          up === '^' ||
          down === 'v' ||
          down === 'V' ||
          (r > 0 && nodeMask[r - 1][c]) ||
          (r + 1 < rows && nodeMask[r + 1][c]);
        if (hasVertNeighbor && left === ' ' && right === ' ') {
          segments[r][c] = { n: true, s: true, e: false, w: false };
        } else if (hasVertNeighbor && (left === '-' || right === '-' || left === '+' || right === '+')) {
          segments[r][c] = { n: true, s: true, e: false, w: false };
        }
      } else if (ch === '-' || ch === '=') {
        // Check if part of a horizontal connector run touching +, |, >, <, or >= 3 chars without word chars
        let l = c;
        while (l > 0 && charAt(r, l - 1) === ch) l--;
        let rEnd = c;
        while (rEnd + 1 < cols && charAt(r, rEnd + 1) === ch) rEnd++;
        const runLen = rEnd - l + 1;
        const leftBound = charAt(r, l - 1);
        const rightBound = charAt(r, rEnd + 1);
        const touchesJunction =
          leftBound === '+' ||
          rightBound === '+' ||
          leftBound === '|' ||
          rightBound === '|' ||
          leftBound in UNICODE_SEGMENTS ||
          rightBound in UNICODE_SEGMENTS ||
          (runLen >= 2 && (rightBound === '>' || leftBound === '<'));
        const isPureBorderBar =
          runLen >= 4 &&
          (leftBound === ' ' || leftBound === '|') &&
          (rightBound === ' ' || rightBound === '|');
        if (touchesJunction || isPureBorderBar) {
          segments[r][c] = {
            n: false,
            s: false,
            e: true,
            w: true,
            doubleH: ch === '=',
          };
        }
      } else if ((ch === 'v' || ch === 'V') && left === ' ' && right === ' ' && (isVertSeed(up) || up === '+' || (segments[r - 1]?.[c]?.s))) {
        arrows[r][c] = 'S';
      } else if (ch === '^' && left === ' ' && right === ' ' && (isVertSeed(down) || down === '+' || (segments[r + 1]?.[c]?.n))) {
        arrows[r][c] = 'N';
      }
    }
  }

  // Third pass: only convert '>' / '<' into arrows if directly attached to a classified horizontal connector
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (nodeMask[r][c] || segments[r][c] || arrows[r][c]) continue;
      const ch = grid[r][c];
      if (ch === '>' && c > 0 && segments[r][c - 1]?.e) {
        arrows[r][c] = 'E';
      } else if (ch === '<' && c + 1 < cols && segments[r][c + 1]?.w) {
        arrows[r][c] = 'W';
      }
    }
  }

  return { segments, arrows };
}

interface TextRun {
  row: number;
  colStart: number;
  colEnd: number;
  text: string;
  centeredInCell?: { leftCol: number; rightCol: number };
}

export function renderAsciiTopologySvg(rawText: string): {
  svg: SVGSVGElement;
  width: number;
  height: number;
} {
  const lines = normalizeDiagramLines(rawText);
  const charW = getMonoCharWidth();
  const cellW = Math.max(8.4, Math.ceil((charW + 0.5) * 10) / 10);
  const cellH = BOX_CELL_H;

  const rowChars: string[][] = lines.map((line) => Array.from(line));
  const maxCols = Math.max(1, ...rowChars.map((r) => r.length));
  const rows = rowChars.length;

  const grid: string[][] = rowChars.map((chars) => {
    const padded = chars.slice();
    while (padded.length < maxCols) padded.push(' ');
    return padded;
  });

  // 1. Detect [ Node Box ] tokens on each row
  const nodeBoxes: NodeBoxSpan[] = [];
  const nodeMask: boolean[][] = Array.from({ length: rows }, () =>
    Array<boolean>(maxCols).fill(false)
  );

  for (let r = 0; r < rows; r++) {
    const rowStr = grid[r].join('');
    const re = /\[([^\[\]\n]{2,84})\]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(rowStr)) !== null) {
      const colStart = match.index;
      const fullLen = match[0].length;
      const colEnd = colStart + fullLen - 1;
      const inner = match[1].trim();
      // Ignore task checkboxes like [x] or markdown link syntax [label](url)
      if (!inner || inner.length <= 1) continue;
      if (rowStr[colEnd + 1] === '(') continue;

      nodeBoxes.push({
        row: r,
        colStart,
        colEnd,
        label: inner,
      });
      for (let c = colStart; c <= colEnd; c++) {
        nodeMask[r][c] = true;
      }
    }
  }

  // 2. Classify box-drawing segments and arrowheads
  const { segments, arrows } = detectAsciiLinesAndArrows(grid, nodeMask);

  // 3. Detect enclosed multi-line outer rectangles (like ┌───┐ ... └───┘) for subtle surface panels
  const frameRects: Array<{ r1: number; c1: number; r2: number; c2: number }> = [];
  for (let r1 = 0; r1 < rows; r1++) {
    for (let c1 = 0; c1 < maxCols; c1++) {
      const tl = segments[r1][c1];
      if (!tl || tl.n || tl.w || !tl.e || !tl.s) continue;
      // Find matching top-right corner
      let c2 = c1 + 1;
      while (c2 < maxCols) {
        const s = segments[r1][c2];
        if (!s || !s.w) {
          c2 = -1;
          break;
        }
        if (!s.e && s.s && !s.n) break;
        c2++;
      }
      if (c2 < 0 || c2 >= maxCols) continue;
      // Find matching bottom-left corner
      let r2 = r1 + 1;
      while (r2 < rows) {
        const s = segments[r2][c1];
        if (!s || !s.n) {
          r2 = -1;
          break;
        }
        if (!s.s && s.e && !s.w) break;
        r2++;
      }
      if (r2 < 0 || r2 >= rows) continue;
      const br = segments[r2][c2];
      if (br && br.n && br.w && !br.s && !br.e) {
        frameRects.push({ r1, c1, r2, c2 });
      }
    }
  }

  // 4. Extract contiguous text runs outside nodeBoxes and connectors
  const textRuns: TextRun[] = [];
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < maxCols) {
      if (
        nodeMask[r][c] ||
        segments[r][c] ||
        arrows[r][c] ||
        grid[r][c] === ' '
      ) {
        c++;
        continue;
      }

      const start = c;
      let text = '';
      let lastNonSpaceCol = c;
      while (c < maxCols) {
        if (nodeMask[r][c] || segments[r][c] || arrows[r][c]) break;
        const ch = grid[r][c];
        if (ch === ' ') {
          // Break run on 2+ consecutive spaces
          if (c + 1 >= maxCols || grid[r][c + 1] === ' ' || nodeMask[r][c + 1] || segments[r][c + 1] || arrows[r][c + 1]) {
            break;
          }
        } else {
          lastNonSpaceCol = c;
        }
        text += ch;
        c++;
      }

      const trimmedRun = text.trimEnd();
      if (trimmedRun.length > 0) {
        // Check if bounded on both sides by vertical bars and roughly centered
        let leftBorder = start - 1;
        while (leftBorder >= 0 && grid[r][leftBorder] === ' ') leftBorder--;
        let rightBorder = lastNonSpaceCol + 1;
        while (rightBorder < maxCols && grid[r][rightBorder] === ' ') rightBorder++;

        let centeredInCell: { leftCol: number; rightCol: number } | undefined;
        if (
          leftBorder >= 0 &&
          rightBorder < maxCols &&
          segments[r][leftBorder]?.n &&
          segments[r][leftBorder]?.s &&
          segments[r][rightBorder]?.n &&
          segments[r][rightBorder]?.s
        ) {
          const leftGap = start - leftBorder - 1;
          const rightGap = rightBorder - lastNonSpaceCol - 1;
          if (leftGap >= 2 && rightGap >= 2 && Math.abs(leftGap - rightGap) <= 2) {
            centeredInCell = { leftCol: leftBorder, rightCol: rightBorder };
          }
        }

        textRuns.push({
          row: r,
          colStart: start,
          colEnd: lastNonSpaceCol,
          text: trimmedRun,
          centeredInCell,
        });
      }
    }
  }

  const width = Math.ceil(maxCols * cellW + BOX_PAD_X * 2);
  const height = Math.ceil(rows * cellH + BOX_PAD_Y * 2);

  const svg = createSvgEl('svg', {
    class: 'gecko-diagram-svg',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'Diagrama de topologia',
  });

  // Layer 0: Enclosed multi-line outer frames background
  const frameLayer = createSvgEl('g', { class: 'gecko-topo-frames' });
  for (const fr of frameRects) {
    const x = BOX_PAD_X + fr.c1 * cellW + cellW / 2;
    const y = BOX_PAD_Y + fr.r1 * cellH + cellH / 2;
    const w = (fr.c2 - fr.c1) * cellW;
    const h = (fr.r2 - fr.r1) * cellH;
    frameLayer.appendChild(
      createSvgEl('rect', {
        x,
        y,
        width: w,
        height: h,
        fill: 'var(--bg-editor)',
        rx: 0,
      })
    );
  }
  svg.appendChild(frameLayer);

  // Layer 1: Connector lines (SVG paths)
  const lineLayer = createSvgEl('g', { class: 'gecko-topo-lines' });
  const pathParts: string[] = [];
  const doublePathParts: string[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < maxCols; c++) {
      const seg = segments[r][c];
      if (!seg) continue;

      const x0 = BOX_PAD_X + c * cellW;
      const x1 = x0 + cellW;
      const cx = x0 + cellW / 2;

      const y0 = BOX_PAD_Y + r * cellH;
      const y1 = y0 + cellH;
      const cy = y0 + cellH / 2;

      // Bridge 2px vertical gap into adjacent [ Node Box ]
      const topExtend = r > 0 && nodeMask[r - 1][c] ? 2 : 0;
      const botExtend = r + 1 < rows && nodeMask[r + 1][c] ? 2 : 0;

      const target = seg.doubleH || seg.doubleV ? doublePathParts : pathParts;

      if (seg.rounded && ((seg.s && seg.e) || (seg.s && seg.w) || (seg.n && seg.e) || (seg.n && seg.w))) {
        const sx = seg.e ? x1 : x0;
        const sy = seg.s ? y1 : y0;
        target.push(`M${sx},${cy} Q${cx},${cy} ${cx},${sy}`);
        continue;
      }

      if (seg.n && seg.s) {
        target.push(`M${cx},${y0 - topExtend} L${cx},${y1 + botExtend}`);
      } else {
        if (seg.n) target.push(`M${cx},${cy} L${cx},${y0 - topExtend}`);
        if (seg.s) target.push(`M${cx},${cy} L${cx},${y1 + botExtend}`);
      }

      if (seg.w && seg.e) {
        target.push(`M${x0},${cy} L${x1},${cy}`);
      } else {
        if (seg.w) target.push(`M${cx},${cy} L${x0},${cy}`);
        if (seg.e) target.push(`M${cx},${cy} L${x1},${cy}`);
      }
    }
  }

  if (pathParts.length > 0) {
    lineLayer.appendChild(
      createSvgEl('path', {
        d: pathParts.join(' '),
        fill: 'none',
        stroke: 'var(--text-secondary)',
        'stroke-opacity': '0.75',
        'stroke-width': '1.5',
        'stroke-linecap': 'square',
        'stroke-linejoin': 'miter',
      })
    );
  }
  if (doublePathParts.length > 0) {
    lineLayer.appendChild(
      createSvgEl('path', {
        d: doublePathParts.join(' '),
        fill: 'none',
        stroke: 'var(--md-marker)',
        'stroke-width': '2',
        'stroke-linecap': 'square',
      })
    );
  }
  svg.appendChild(lineLayer);

  // Layer 2: Arrowheads (▼ ▲ ► ◄) with seamless stems
  const arrowLayer = createSvgEl('g', { class: 'gecko-topo-arrows' });
  const stemParts: string[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < maxCols; c++) {
      const dir = arrows[r][c];
      if (!dir) continue;

      const x0 = BOX_PAD_X + c * cellW;
      const x1 = x0 + cellW;
      const cx = x0 + cellW / 2;

      const y0 = BOX_PAD_Y + r * cellH;
      const y1 = y0 + cellH;
      const cy = y0 + cellH / 2;

      const upSeg = r > 0 ? segments[r - 1][c] : null;
      const downSeg = r + 1 < rows ? segments[r + 1][c] : null;
      const leftSeg = c > 0 ? segments[r][c - 1] : null;
      const rightSeg = c + 1 < maxCols ? segments[r][c + 1] : null;

      if (dir === 'S') {
        if (upSeg?.s) {
          stemParts.push(`M${cx},${y0} L${cx},${cy - 2}`);
        }
        const tipY = r + 1 < rows && nodeMask[r + 1][c] ? y1 + 1 : cy + 5;
        const baseY = tipY - 8;
        arrowLayer.appendChild(
          createSvgEl('polygon', {
            points: `${cx - 4.5},${baseY} ${cx + 4.5},${baseY} ${cx},${tipY}`,
            fill: 'var(--accent-primary)',
          })
        );
      } else if (dir === 'N') {
        if (downSeg?.n) {
          stemParts.push(`M${cx},${cy + 2} L${cx},${y1}`);
        }
        const tipY = r > 0 && nodeMask[r - 1][c] ? y0 - 1 : cy - 5;
        const baseY = tipY + 8;
        arrowLayer.appendChild(
          createSvgEl('polygon', {
            points: `${cx - 4.5},${baseY} ${cx + 4.5},${baseY} ${cx},${tipY}`,
            fill: 'var(--accent-primary)',
          })
        );
      } else if (dir === 'E') {
        if (leftSeg?.e) {
          stemParts.push(`M${x0},${cy} L${cx - 2},${cy}`);
        }
        const tipX = cx + 4.5;
        const baseX = tipX - 8;
        arrowLayer.appendChild(
          createSvgEl('polygon', {
            points: `${baseX},${cy - 4.5} ${baseX},${cy + 4.5} ${tipX},${cy}`,
            fill: 'var(--accent-primary)',
          })
        );
      } else if (dir === 'W') {
        if (rightSeg?.w) {
          stemParts.push(`M${cx + 2},${cy} L${x1},${cy}`);
        }
        const tipX = cx - 4.5;
        const baseX = tipX + 8;
        arrowLayer.appendChild(
          createSvgEl('polygon', {
            points: `${baseX},${cy - 4.5} ${baseX},${cy + 4.5} ${tipX},${cy}`,
            fill: 'var(--accent-primary)',
          })
        );
      }
    }
  }

  if (stemParts.length > 0) {
    lineLayer.appendChild(
      createSvgEl('path', {
        d: stemParts.join(' '),
        fill: 'none',
        stroke: 'var(--text-secondary)',
        'stroke-opacity': '0.75',
        'stroke-width': '1.5',
      })
    );
  }
  svg.appendChild(arrowLayer);

  // Layer 3: [ Node Boxes ]
  const nodeLayer = createSvgEl('g', { class: 'gecko-topo-nodes' });
  for (const box of nodeBoxes) {
    const x = BOX_PAD_X + box.colStart * cellW - 2;
    const y = BOX_PAD_Y + box.row * cellH + 1.5;
    const w = (box.colEnd - box.colStart + 1) * cellW + 4;
    const h = cellH - 3;

    // Industrial container box (0px border-radius, crisp 1px border + 2.5px left accent bar)
    nodeLayer.appendChild(
      createSvgEl('rect', {
        x,
        y,
        width: w,
        height: h,
        rx: 0,
        fill: 'var(--bg-elevated)',
        stroke: 'var(--accent-alpha-45)',
        'stroke-width': '1',
      })
    );
    nodeLayer.appendChild(
      createSvgEl('rect', {
        x,
        y,
        width: 2.5,
        height: h,
        fill: 'var(--accent-primary)',
      })
    );

    const textEl = createSvgEl('text', {
      x: x + w / 2,
      y: y + h / 2 + 4.2,
      'text-anchor': 'middle',
      'font-family': 'var(--font-mono)',
      'font-size': '12px',
      'font-weight': '600',
      fill: 'var(--text-primary)',
    });

    const colonIdx = box.label.indexOf(':');
    if (colonIdx > 0 && colonIdx < box.label.length - 1 && !box.label.includes('://')) {
      const prefix = box.label.slice(0, colonIdx + 1);
      const rest = box.label.slice(colonIdx + 1);
      const tspanPrefix = createSvgEl('tspan', { fill: 'var(--md-heading)' });
      tspanPrefix.textContent = prefix;
      const tspanRest = createSvgEl('tspan', { fill: 'var(--text-primary)' });
      tspanRest.textContent = rest;
      textEl.appendChild(tspanPrefix);
      textEl.appendChild(tspanRest);
    } else {
      textEl.textContent = box.label;
    }

    nodeLayer.appendChild(textEl);
  }
  svg.appendChild(nodeLayer);

  // Layer 4: Descriptive Text Runs
  const textLayer = createSvgEl('g', { class: 'gecko-topo-labels' });
  for (const run of textRuns) {
    const displayStr = run.text.replace(/\s->\s/g, ' → ');
    const y = BOX_PAD_Y + run.row * cellH + cellH * 0.67;

    let x: number;
    let anchor = 'start';
    if (run.centeredInCell) {
      x = BOX_PAD_X + ((run.centeredInCell.leftCol + run.centeredInCell.rightCol + 1) / 2) * cellW;
      anchor = 'middle';
    } else {
      x = BOX_PAD_X + run.colStart * cellW;
    }

    let fill = 'var(--text-primary)';
    let fontWeight = '400';

    if (run.centeredInCell && run.row <= 2 && /^[A-Z0-9\s\-_.:]+$/.test(displayStr)) {
      fill = 'var(--md-heading)';
      fontWeight = '600';
    } else if (/^\([^)]+\)$/.test(displayStr)) {
      fill = 'var(--text-secondary)';
    } else if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(displayStr)) {
      fill = 'var(--md-heading)';
    }

    const textEl = createSvgEl('text', {
      x,
      y,
      'text-anchor': anchor,
      'font-family': 'var(--font-mono)',
      'font-size': '12.5px',
      'font-weight': fontWeight,
      fill,
    });

    const keyValMatch = displayStr.match(/^([A-Za-zÀ-ÿ0-9_\s]{2,24}:)(\s+.+)$/);
    if (keyValMatch && !displayStr.includes('://')) {
      const kSpan = createSvgEl('tspan', { fill: 'var(--text-secondary)' });
      kSpan.textContent = keyValMatch[1];
      const vSpan = createSvgEl('tspan', { fill: 'var(--text-primary)' });
      vSpan.textContent = keyValMatch[2];
      textEl.appendChild(kSpan);
      textEl.appendChild(vSpan);
    } else {
      textEl.textContent = displayStr;
    }

    textLayer.appendChild(textEl);
  }
  svg.appendChild(textLayer);

  return { svg, width, height };
}

// ============================================================================
// 2. ASCII HORIZONTAL BAR CHART RENDERER
// ============================================================================

function renderAsciiBarChartSvg(rawText: string): {
  svg: SVGSVGElement;
  width: number;
  height: number;
} {
  const lines = normalizeDiagramLines(rawText);
  const rows: Array<{ label: string; ratio: number; valueText: string; isRaw: boolean; raw: string }> = [];

  for (const line of lines) {
    const barMatch = line.match(/^(.*?)\s*([█▓▒░■▪▬]+)\s*(.*)$/);
    if (barMatch) {
      const label = barMatch[1].replace(/[|:]+$/, '').trim();
      const blocks = barMatch[2];
      const suffix = barMatch[3].trim();
      const filled = (blocks.match(/[█▓■▪▬]/g) || []).length;
      const total = Math.max(1, blocks.length);
      const pctMatch = suffix.match(/(\d+(?:[.,]\d+)?)\s*%/);
      const ratio = pctMatch
        ? Math.min(1, Math.max(0, parseFloat(pctMatch[1].replace(',', '.')) / 100))
        : filled / total;
      rows.push({ label, ratio, valueText: suffix, isRaw: false, raw: line });
    } else if (line.trim() !== '') {
      rows.push({ label: line.trim(), ratio: 0, valueText: '', isRaw: true, raw: line });
    }
  }

  const labelW = Math.min(220, Math.max(90, ...rows.map((r) => (r.isRaw ? 0 : r.label.length * 8 + 12))));
  const barW = 280;
  const valW = 100;
  const width = BOX_PAD_X * 2 + labelW + barW + valW + 24;
  const rowH = 26;
  const height = BOX_PAD_Y * 2 + Math.max(1, rows.length) * rowH;

  const svg = createSvgEl('svg', {
    class: 'gecko-diagram-svg',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'Gráfico de barras',
  });

  rows.forEach((row, idx) => {
    const y = BOX_PAD_Y + idx * rowH;
    if (row.isRaw) {
      const t = createSvgEl('text', {
        x: BOX_PAD_X,
        y: y + 17,
        'font-family': 'var(--font-mono)',
        'font-size': '12.5px',
        'font-weight': '600',
        fill: 'var(--md-heading)',
      });
      t.textContent = row.raw;
      svg.appendChild(t);
      return;
    }

    const lbl = createSvgEl('text', {
      x: BOX_PAD_X + labelW - 10,
      y: y + 17,
      'text-anchor': 'end',
      'font-family': 'var(--font-mono)',
      'font-size': '12.5px',
      fill: 'var(--text-primary)',
    });
    lbl.textContent = row.label;
    svg.appendChild(lbl);

    const trackX = BOX_PAD_X + labelW;
    svg.appendChild(
      createSvgEl('rect', {
        x: trackX,
        y: y + 5,
        width: barW,
        height: 15,
        fill: 'var(--bg-elevated)',
        stroke: 'var(--border-subtle)',
        'stroke-width': '1',
      })
    );

    if (row.ratio > 0) {
      svg.appendChild(
        createSvgEl('rect', {
          x: trackX + 1,
          y: y + 6,
          width: Math.max(2, (barW - 2) * row.ratio),
          height: 13,
          fill: 'var(--accent-primary)',
        })
      );
    }

    if (row.valueText) {
      const val = createSvgEl('text', {
        x: trackX + barW + 10,
        y: y + 17,
        'font-family': 'var(--font-mono)',
        'font-size': '12px',
        fill: 'var(--text-secondary)',
      });
      val.textContent = row.valueText;
      svg.appendChild(val);
    }
  });

  return { svg, width, height };
}

// ============================================================================
// 3. ZERO-DEPENDENCY MERMAID SUBSET RENDERER (Flowchart, Sequence, Pie)
// ============================================================================

type NodeShape = 'rect' | 'round' | 'stadium' | 'cylinder' | 'diamond' | 'circle';

interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
  subgraph?: string;
  layer: number;
  order: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  dashed: boolean;
  thick: boolean;
  noArrow: boolean;
}

function parseNodeToken(tokenRaw: string): { id: string; label: string; shape: NodeShape } {
  const token = tokenRaw.trim();
  const patterns: Array<{ re: RegExp; shape: NodeShape }> = [
    { re: /^([A-Za-z0-9_.-]+)\(\[(.+)\]\)$/, shape: 'stadium' },
    { re: /^([A-Za-z0-9_.-]+)\[\((.+)\)\]$/, shape: 'cylinder' },
    { re: /^([A-Za-z0-9_.-]+)\(\((.+)\)\)$/, shape: 'circle' },
    { re: /^([A-Za-z0-9_.-]+)\{(.+)\}$/, shape: 'diamond' },
    { re: /^([A-Za-z0-9_.-]+)\((.+)\)$/, shape: 'round' },
    { re: /^([A-Za-z0-9_.-]+)\[(.+)\]$/, shape: 'rect' },
  ];

  for (const { re, shape } of patterns) {
    const m = token.match(re);
    if (m) {
      const rawLabel = m[2].trim().replace(/^["']|["']$/g, '');
      return { id: m[1], label: rawLabel.replace(/<br\s*\/?>/gi, ' '), shape };
    }
  }

  const cleanId = token.replace(/[^A-Za-z0-9_.-]/g, '') || token;
  return { id: cleanId, label: token, shape: 'rect' };
}

function splitMermaidStatements(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const stripped = raw.replace(/%%.*$/, '').trim();
    if (!stripped) continue;
    for (const part of stripped.split(';')) {
      const p = part.trim();
      if (p) out.push(p);
    }
  }
  return out;
}

function renderMermaidFlowchartSvg(rawText: string): {
  svg: SVGSVGElement;
  width: number;
  height: number;
} | null {
  const stmts = splitMermaidStatements(rawText.split(/\r?\n/));
  if (stmts.length === 0) return null;

  const headerMatch = stmts[0].match(/^(?:flowchart|graph)\s*(TD|TB|BT|LR|RL)?/i);
  if (!headerMatch) return null;
  const dir = (headerMatch[1] || 'TD').toUpperCase();
  const isHoriz = dir === 'LR' || dir === 'RL';
  const isReverse = dir === 'BT' || dir === 'RL';

  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const subgraphs: Array<{ id: string; title: string; nodeIds: string[] }> = [];
  const subgraphStack: Array<{ id: string; title: string; nodeIds: string[] }> = [];

  const ensureNode = (rawToken: string): FlowNode => {
    const parsed = parseNodeToken(rawToken);
    const existing = nodes.get(parsed.id);
    if (existing) {
      if (parsed.label !== parsed.id && existing.label === existing.id) {
        existing.label = parsed.label;
        existing.shape = parsed.shape;
      }
      if (!existing.subgraph && subgraphStack.length > 0) {
        const sg = subgraphStack[subgraphStack.length - 1];
        existing.subgraph = sg.id;
        sg.nodeIds.push(existing.id);
      }
      return existing;
    }
    const sg = subgraphStack[subgraphStack.length - 1];
    const node: FlowNode = {
      id: parsed.id,
      label: parsed.label,
      shape: parsed.shape,
      subgraph: sg?.id,
      layer: 0,
      order: 0,
      x: 0,
      y: 0,
      w: 120,
      h: 40,
    };
    nodes.set(parsed.id, node);
    if (sg) sg.nodeIds.push(node.id);
    return node;
  };

  for (let i = 1; i < stmts.length; i++) {
    const line = stmts[i];
    if (/^(?:classDef|class|style|linkStyle|click)\b/i.test(line)) continue;

    const sgMatch = line.match(/^subgraph\s+(.+)$/i);
    if (sgMatch) {
      const title = sgMatch[1].replace(/^[\w-]+\s*\[(.+)\]$/, '$1').replace(/^["']|["']$/g, '').trim();
      const sg = { id: `sg_${subgraphs.length}`, title, nodeIds: [] };
      subgraphs.push(sg);
      subgraphStack.push(sg);
      continue;
    }
    if (/^end$/i.test(line)) {
      subgraphStack.pop();
      continue;
    }

    // Split chained edges: A -->|lbl| B --> C
    const edgeRe = /(-->|==>|-\.->|---|--[^>]+-->|-.->\|[^|]+\||-->\|[^|]+\||==>\|[^|]+\|)/;
    if (edgeRe.test(line)) {
      // Tokenize sequentially
      let rest = line;
      let prevNodes: FlowNode[] | null = null;

      while (rest.length > 0) {
        const opMatch = rest.match(
          /^([\s\S]+?)\s*(-->\|[^|]+\||-\.->\|[^|]+\||==>\|[^|]+\||--\s+[^-]+?\s+-->|-->|-\.->|==>|---|-\.-)\s*([\s\S]+)$/
        );
        if (!opMatch) {
          break;
        }

        const leftPart = opMatch[1].trim();
        const op = opMatch[2].trim();
        const rightRest = opMatch[3].trim();

        const leftNodes = leftPart.split('&').map((t) => ensureNode(t));
        if (!prevNodes) {
          prevNodes = leftNodes;
        }

        // Check if rightRest contains another edge operator
        const nextOpCheck = rightRest.match(
          /^([\s\S]+?)\s*(-->\|[^|]+\||-\.->\|[^|]+\||==>\|[^|]+\||--\s+[^-]+?\s+-->|-->|-\.->|==>|---|-\.-)\s*([\s\S]+)$/
        );
        const rightPart = nextOpCheck ? nextOpCheck[1].trim() : rightRest;
        const rightNodes = rightPart.split('&').map((t) => ensureNode(t));

        let label: string | undefined;
        const pipeLbl = op.match(/\|([^|]+)\|/);
        const inlineLbl = op.match(/^--\s+([^-]+?)\s+-->$/);
        if (pipeLbl) label = pipeLbl[1].trim();
        else if (inlineLbl) label = inlineLbl[1].trim();

        const dashed = op.includes('-.');
        const thick = op.includes('==');
        const noArrow = op === '---' || op === '-.-';

        for (const src of prevNodes) {
          for (const dst of rightNodes) {
            edges.push({ from: src.id, to: dst.id, label, dashed, thick, noArrow });
          }
        }

        if (nextOpCheck) {
          prevNodes = rightNodes;
          rest = `${rightPart} ${nextOpCheck[2]} ${nextOpCheck[3]}`;
        } else {
          break;
        }
      }
      continue;
    }

    // Standalone node declaration
    if (/^[A-Za-z0-9_.-]+(?:\[|\(|\{)/.test(line)) {
      ensureNode(line);
    }
  }

  if (nodes.size === 0) return null;

  // Compute node dimensions from label text
  for (const n of nodes.values()) {
    const textW = n.label.length * 7.8;
    const extraW = n.shape === 'diamond' ? 46 : n.shape === 'circle' ? 32 : 32;
    n.w = Math.max(96, Math.min(280, Math.ceil(textW + extraW)));
    n.h = n.shape === 'diamond' ? 54 : n.shape === 'cylinder' ? 48 : 38;
  }

  // Assign layers via longest-path BFS (cycle-safe)
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const id of nodes.keys()) {
    adj.set(id, []);
    inDeg.set(id, 0);
  }
  for (const e of edges) {
    if (e.from === e.to) continue;
    adj.get(e.from)?.push(e.to);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }

  const visited = new Set<string>();
  const queue: string[] = [];
  for (const [id, deg] of inDeg.entries()) {
    if (deg === 0) queue.push(id);
  }
  if (queue.length === 0) {
    const first = nodes.keys().next().value;
    if (first) queue.push(first);
  }

  const maxLayer = nodes.size;
  while (queue.length > 0) {
    const curId = queue.shift()!;
    if (visited.has(curId)) continue;
    visited.add(curId);
    const cur = nodes.get(curId)!;
    for (const nextId of adj.get(curId) || []) {
      const nxt = nodes.get(nextId)!;
      if (!visited.has(nextId)) {
        nxt.layer = Math.min(maxLayer, Math.max(nxt.layer, cur.layer + 1));
        queue.push(nextId);
      }
    }
  }

  // Group into layers
  const layerBuckets = new Map<number, FlowNode[]>();
  for (const n of nodes.values()) {
    const list = layerBuckets.get(n.layer) || [];
    list.push(n);
    layerBuckets.set(n.layer, list);
  }
  const sortedLayerKeys = Array.from(layerBuckets.keys()).sort((a, b) => a - b);
  if (isReverse) sortedLayerKeys.reverse();

  // Compute coordinates
  const gapMain = isHoriz ? 72 : 54;
  const gapCross = isHoriz ? 28 : 36;

  let maxCrossSpan = 0;
  const layerSizes = sortedLayerKeys.map((k) => {
    const list = layerBuckets.get(k)!;
    const crossSpan = list.reduce(
      (acc, n, i) => acc + (isHoriz ? n.h : n.w) + (i > 0 ? gapCross : 0),
      0
    );
    maxCrossSpan = Math.max(maxCrossSpan, crossSpan);
    const mainSize = Math.max(...list.map((n) => (isHoriz ? n.w : n.h)));
    return { key: k, list, crossSpan, mainSize };
  });

  let cursorMain = BOX_PAD_Y + 12;
  if (isHoriz) cursorMain = BOX_PAD_X + 12;

  for (const layerInfo of layerSizes) {
    let cursorCross =
      (isHoriz ? BOX_PAD_Y : BOX_PAD_X) + 12 + (maxCrossSpan - layerInfo.crossSpan) / 2;

    for (const n of layerInfo.list) {
      if (isHoriz) {
        n.x = cursorMain + (layerInfo.mainSize - n.w) / 2;
        n.y = cursorCross;
        cursorCross += n.h + gapCross;
      } else {
        n.x = cursorCross;
        n.y = cursorMain + (layerInfo.mainSize - n.h) / 2;
        cursorCross += n.w + gapCross;
      }
    }
    cursorMain += layerInfo.mainSize + gapMain;
  }

  const totalW = isHoriz
    ? Math.ceil(cursorMain - gapMain + BOX_PAD_X + 12)
    : Math.ceil(maxCrossSpan + BOX_PAD_X * 2 + 24);
  const totalH = isHoriz
    ? Math.ceil(maxCrossSpan + BOX_PAD_Y * 2 + 24)
    : Math.ceil(cursorMain - gapMain + BOX_PAD_Y + 12);

  const svg = createSvgEl('svg', {
    class: 'gecko-diagram-svg',
    width: totalW,
    height: totalH,
    viewBox: `0 0 ${totalW} ${totalH}`,
    role: 'img',
    'aria-label': 'Fluxograma',
  });

  // Defs for arrowhead marker
  const markerId = `gecko-flow-arrow-${nextMarkerUid++}`;
  const defs = createSvgEl('defs');
  const marker = createSvgEl('marker', {
    id: markerId,
    viewBox: '0 0 10 10',
    refX: '9',
    refY: '5',
    markerWidth: '7',
    markerHeight: '7',
    orient: 'auto-start-reverse',
  });
  marker.appendChild(
    createSvgEl('path', {
      d: 'M 0 1 L 10 5 L 0 9 z',
      fill: 'var(--accent-primary)',
    })
  );
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Subgraphs
  for (const sg of subgraphs) {
    const members = sg.nodeIds.map((id) => nodes.get(id)).filter(Boolean) as FlowNode[];
    if (members.length === 0) continue;
    const minX = Math.min(...members.map((m) => m.x)) - 14;
    const minY = Math.min(...members.map((m) => m.y)) - 26;
    const maxX = Math.max(...members.map((m) => m.x + m.w)) + 14;
    const maxY = Math.max(...members.map((m) => m.y + m.h)) + 14;
    svg.appendChild(
      createSvgEl('rect', {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        fill: 'rgba(255,255,255,0.02)',
        stroke: 'var(--border-subtle)',
        'stroke-dasharray': '4 3',
        'stroke-width': '1',
      })
    );
    const titleEl = createSvgEl('text', {
      x: minX + 8,
      y: minY + 16,
      'font-family': 'var(--font-mono)',
      'font-size': '11px',
      'font-weight': '600',
      fill: 'var(--md-heading)',
    });
    titleEl.textContent = sg.title;
    svg.appendChild(titleEl);
  }

  // Edges
  const edgeLayer = createSvgEl('g', { class: 'gecko-flow-edges' });
  for (const e of edges) {
    const src = nodes.get(e.from);
    const dst = nodes.get(e.to);
    if (!src || !dst) continue;

    let sx: number;
    let sy: number;
    let dx: number;
    let dy: number;

    if (isHoriz) {
      const forward = dst.x >= src.x;
      sx = forward ? src.x + src.w : src.x;
      sy = src.y + src.h / 2;
      dx = forward ? dst.x : dst.x + dst.w;
      dy = dst.y + dst.h / 2;
    } else {
      const forward = dst.y >= src.y;
      sx = src.x + src.w / 2;
      sy = forward ? src.y + src.h : src.y;
      dx = dst.x + dst.w / 2;
      dy = forward ? dst.y : dst.y + dst.h;
    }

    let d: string;
    if (src.id === dst.id) {
      d = `M${src.x + src.w},${src.y + 10} C${src.x + src.w + 36},${src.y - 10} ${src.x + src.w + 36},${src.y + src.h + 10} ${src.x + src.w},${src.y + src.h - 10}`;
    } else if (isHoriz) {
      const mx = (sx + dx) / 2;
      d = `M${sx},${sy} C${mx},${sy} ${mx},${dy} ${dx},${dy}`;
    } else {
      const my = (sy + dy) / 2;
      d = `M${sx},${sy} C${sx},${my} ${dx},${my} ${dx},${dy}`;
    }

    const pathAttrs: Record<string, string | number> = {
      d,
      fill: 'none',
      stroke: e.thick ? 'var(--accent-primary)' : 'var(--text-secondary)',
      'stroke-width': e.thick ? '2' : '1.5',
    };
    if (e.dashed) pathAttrs['stroke-dasharray'] = '5 3';
    if (!e.noArrow) pathAttrs['marker-end'] = `url(#${markerId})`;
    edgeLayer.appendChild(createSvgEl('path', pathAttrs));

    if (e.label) {
      const lx = (sx + dx) / 2;
      const ly = (sy + dy) / 2;
      const lw = e.label.length * 7.2 + 12;
      edgeLayer.appendChild(
        createSvgEl('rect', {
          x: lx - lw / 2,
          y: ly - 10,
          width: lw,
          height: 18,
          fill: 'var(--bg-workbench)',
          stroke: 'var(--border-subtle)',
          'stroke-width': '1',
        })
      );
      const lbl = createSvgEl('text', {
        x: lx,
        y: ly + 3,
        'text-anchor': 'middle',
        'font-family': 'var(--font-mono)',
        'font-size': '11px',
        fill: 'var(--text-secondary)',
      });
      lbl.textContent = e.label;
      edgeLayer.appendChild(lbl);
    }
  }
  svg.appendChild(edgeLayer);

  // Nodes
  const nodeLayer = createSvgEl('g', { class: 'gecko-flow-nodes' });
  for (const n of nodes.values()) {
    const cx = n.x + n.w / 2;
    const cy = n.y + n.h / 2;

    if (n.shape === 'diamond') {
      nodeLayer.appendChild(
        createSvgEl('polygon', {
          points: `${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}`,
          fill: 'var(--bg-elevated)',
          stroke: 'var(--accent-alpha-45)',
          'stroke-width': '1.2',
        })
      );
    } else if (n.shape === 'cylinder') {
      const ry = 6;
      nodeLayer.appendChild(
        createSvgEl('path', {
          d: `M${n.x},${n.y + ry} L${n.x},${n.y + n.h - ry} A${n.w / 2},${ry} 0 0,0 ${n.x + n.w},${n.y + n.h - ry} L${n.x + n.w},${n.y + ry} Z`,
          fill: 'var(--bg-elevated)',
          stroke: 'var(--accent-alpha-45)',
          'stroke-width': '1.2',
        })
      );
      nodeLayer.appendChild(
        createSvgEl('ellipse', {
          cx,
          cy: n.y + ry,
          rx: n.w / 2,
          ry,
          fill: 'var(--bg-selection)',
          stroke: 'var(--accent-primary)',
          'stroke-width': '1.2',
        })
      );
    } else if (n.shape === 'circle') {
      const rad = Math.max(n.w, n.h) / 2;
      nodeLayer.appendChild(
        createSvgEl('circle', {
          cx,
          cy,
          r: rad / 1.4,
          fill: 'var(--bg-elevated)',
          stroke: 'var(--accent-primary)',
          'stroke-width': '1.2',
        })
      );
    } else {
      const rx = n.shape === 'stadium' ? n.h / 2 : n.shape === 'round' ? 4 : 0;
      nodeLayer.appendChild(
        createSvgEl('rect', {
          x: n.x,
          y: n.y,
          width: n.w,
          height: n.h,
          rx,
          fill: 'var(--bg-elevated)',
          stroke: 'var(--accent-alpha-45)',
          'stroke-width': '1',
        })
      );
      if (n.shape === 'rect') {
        nodeLayer.appendChild(
          createSvgEl('rect', {
            x: n.x,
            y: n.y,
            width: 3,
            height: n.h,
            fill: 'var(--accent-primary)',
          })
        );
      }
    }

    const txt = createSvgEl('text', {
      x: cx,
      y: cy + 4,
      'text-anchor': 'middle',
      'font-family': 'var(--font-mono)',
      'font-size': '12px',
      'font-weight': '600',
      fill: 'var(--text-primary)',
    });
    txt.textContent = n.label;
    nodeLayer.appendChild(txt);
  }
  svg.appendChild(nodeLayer);

  return { svg, width: totalW, height: totalH };
}

function renderMermaidSequenceSvg(rawText: string): {
  svg: SVGSVGElement;
  width: number;
  height: number;
} | null {
  const lines = rawText.split(/\r?\n/).map((l) => l.replace(/%%.*$/, '').trim()).filter(Boolean);
  const participants = new Map<string, string>();
  const ensurePart = (id: string, alias?: string) => {
    const clean = id.trim();
    if (!participants.has(clean)) {
      participants.set(clean, (alias || clean).trim());
    } else if (alias) {
      participants.set(clean, alias.trim());
    }
  };

  type SeqEvent =
    | { kind: 'msg'; from: string; to: string; text: string; dashed: boolean }
    | { kind: 'note'; from: string; to: string; text: string };

  const events: SeqEvent[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const pMatch = line.match(/^(?:participant|actor)\s+([^\s]+)(?:\s+as\s+(.+))?$/i);
    if (pMatch) {
      ensurePart(pMatch[1], pMatch[2]);
      continue;
    }

    const msgMatch = line.match(/^([^\s-]+)\s*(-->>|->>|-->|->)\s*([^\s:]+)\s*:\s*(.*)$/);
    if (msgMatch) {
      ensurePart(msgMatch[1]);
      ensurePart(msgMatch[3]);
      events.push({
        kind: 'msg',
        from: msgMatch[1],
        to: msgMatch[3],
        text: msgMatch[4].trim(),
        dashed: msgMatch[2].startsWith('--'),
      });
      continue;
    }

    const noteMatch = line.match(/^Note\s+(?:over|left of|right of)\s+([^:]+)\s*:\s*(.*)$/i);
    if (noteMatch) {
      const targets = noteMatch[1].split(',').map((s) => s.trim());
      targets.forEach((t) => ensurePart(t));
      events.push({
        kind: 'note',
        from: targets[0],
        to: targets[targets.length - 1],
        text: noteMatch[2].trim(),
      });
    }
  }

  const pList = Array.from(participants.entries());
  if (pList.length === 0) return null;

  const colW = 165;
  const boxW = 124;
  const boxH = 34;
  const eventH = 44;
  const topY = BOX_PAD_Y;
  const startEventY = topY + boxH + 28;
  const botY = startEventY + Math.max(1, events.length) * eventH + 16;

  const width = BOX_PAD_X * 2 + pList.length * colW;
  const height = botY + boxH + BOX_PAD_Y;

  const svg = createSvgEl('svg', {
    class: 'gecko-diagram-svg',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'Diagrama de sequência',
  });

  const seqMarkerId = `gecko-seq-arrow-${nextMarkerUid++}`;
  const defs = createSvgEl('defs');
  const marker = createSvgEl('marker', {
    id: seqMarkerId,
    viewBox: '0 0 10 10',
    refX: '9',
    refY: '5',
    markerWidth: '7',
    markerHeight: '7',
    orient: 'auto-start-reverse',
  });
  marker.appendChild(createSvgEl('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: 'var(--accent-primary)' }));
  defs.appendChild(marker);
  svg.appendChild(defs);

  const xById = new Map<string, number>();
  pList.forEach(([id, label], idx) => {
    const cx = BOX_PAD_X + idx * colW + colW / 2;
    xById.set(id, cx);

    // Lifeline
    svg.appendChild(
      createSvgEl('line', {
        x1: cx,
        y1: topY + boxH,
        x2: cx,
        y2: botY,
        stroke: 'var(--border-subtle)',
        'stroke-dasharray': '4 4',
        'stroke-width': '1.2',
      })
    );

    // Top & bottom actor boxes
    for (const y of [topY, botY]) {
      svg.appendChild(
        createSvgEl('rect', {
          x: cx - boxW / 2,
          y,
          width: boxW,
          height: boxH,
          fill: 'var(--bg-elevated)',
          stroke: 'var(--accent-alpha-45)',
          'stroke-width': '1',
        })
      );
      const t = createSvgEl('text', {
        x: cx,
        y: y + boxH / 2 + 4,
        'text-anchor': 'middle',
        'font-family': 'var(--font-mono)',
        'font-size': '12px',
        'font-weight': '600',
        fill: 'var(--text-primary)',
      });
      t.textContent = label;
      svg.appendChild(t);
    }
  });

  events.forEach((ev, idx) => {
    const y = startEventY + idx * eventH;
    const x1 = xById.get(ev.from) ?? BOX_PAD_X;
    const x2 = xById.get(ev.to) ?? BOX_PAD_X;

    if (ev.kind === 'note') {
      const minX = Math.min(x1, x2) - 55;
      const w = Math.max(110, Math.abs(x2 - x1) + 110);
      svg.appendChild(
        createSvgEl('rect', {
          x: minX,
          y: y - 14,
          width: w,
          height: 24,
          fill: 'var(--bg-selection)',
          stroke: 'var(--accent-alpha-30)',
          'stroke-width': '1',
        })
      );
      const nt = createSvgEl('text', {
        x: minX + w / 2,
        y: y + 2,
        'text-anchor': 'middle',
        'font-family': 'var(--font-mono)',
        'font-size': '11.5px',
        fill: 'var(--md-heading)',
      });
      nt.textContent = ev.text;
      svg.appendChild(nt);
      return;
    }

    if (x1 === x2) {
      svg.appendChild(
        createSvgEl('path', {
          d: `M${x1},${y - 6} L${x1 + 36},${y - 6} L${x1 + 36},${y + 10} L${x1},${y + 10}`,
          fill: 'none',
          stroke: 'var(--text-secondary)',
          'stroke-width': '1.5',
          'stroke-dasharray': ev.dashed ? '4 3' : 'none',
          'marker-end': `url(#${seqMarkerId})`,
        })
      );
      const lbl = createSvgEl('text', {
        x: x1 + 42,
        y: y + 4,
        'font-family': 'var(--font-mono)',
        'font-size': '11.5px',
        fill: 'var(--text-primary)',
      });
      lbl.textContent = ev.text;
      svg.appendChild(lbl);
    } else {
      svg.appendChild(
        createSvgEl('line', {
          x1,
          y1: y + 4,
          x2,
          y2: y + 4,
          stroke: 'var(--text-secondary)',
          'stroke-width': '1.5',
          'stroke-dasharray': ev.dashed ? '5 3' : 'none',
          'marker-end': `url(#${seqMarkerId})`,
        })
      );
      const lbl = createSvgEl('text', {
        x: (x1 + x2) / 2,
        y: y - 4,
        'text-anchor': 'middle',
        'font-family': 'var(--font-mono)',
        'font-size': '11.5px',
        fill: 'var(--text-primary)',
      });
      lbl.textContent = ev.text;
      svg.appendChild(lbl);
    }
  });

  return { svg, width, height };
}

function renderMermaidPieSvg(rawText: string): {
  svg: SVGSVGElement;
  width: number;
  height: number;
} | null {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let title = '';
  const items: Array<{ label: string; value: number }> = [];

  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^title\s+/i.test(l)) {
      title = l.replace(/^title\s+/i, '').trim();
      continue;
    }
    const m = l.match(/^"([^"]+)"\s*:\s*(\d+(?:\.\d+)?)$/);
    if (m) {
      items.push({ label: m[1], value: parseFloat(m[2]) });
    }
  }

  const total = items.reduce((s, it) => s + it.value, 0);
  if (items.length === 0 || total <= 0) return null;

  const r = 74;
  const cx = BOX_PAD_X + r + 10;
  const titleOffset = title ? 26 : 0;
  const cy = BOX_PAD_Y + titleOffset + r + 8;
  const legendX = cx + r + 36;
  const width = Math.max(460, legendX + 220);
  const height = Math.max(cy + r + BOX_PAD_Y + 10, BOX_PAD_Y * 2 + titleOffset + items.length * 24 + 16);

  const svg = createSvgEl('svg', {
    class: 'gecko-diagram-svg',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': title || 'Gráfico de proporções',
  });

  if (title) {
    const t = createSvgEl('text', {
      x: BOX_PAD_X,
      y: BOX_PAD_Y + 14,
      'font-family': 'var(--font-mono)',
      'font-size': '13px',
      'font-weight': '600',
      fill: 'var(--md-heading)',
    });
    t.textContent = title;
    svg.appendChild(t);
  }

  const shades = [
    'var(--accent-primary)',
    'var(--md-heading)',
    'var(--accent-hover)',
    'var(--md-marker)',
    '#526158',
    '#3B4640',
  ];

  let angle = -Math.PI / 2;
  items.forEach((item, idx) => {
    const slice = (item.value / total) * Math.PI * 2;
    const endAngle = angle + slice;
    const color = shades[idx % shades.length];

    if (items.length === 1) {
      svg.appendChild(
        createSvgEl('circle', {
          cx,
          cy,
          r,
          fill: color,
          stroke: 'var(--bg-workbench)',
          'stroke-width': '1.5',
        })
      );
    } else {
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArc = slice > Math.PI ? 1 : 0;

      svg.appendChild(
        createSvgEl('path', {
          d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`,
          fill: color,
          stroke: 'var(--bg-workbench)',
          'stroke-width': '1.5',
        })
      );
    }

    const ly = BOX_PAD_Y + titleOffset + 12 + idx * 24;
    svg.appendChild(
      createSvgEl('rect', {
        x: legendX,
        y: ly - 9,
        width: 11,
        height: 11,
        fill: color,
      })
    );
    const pct = ((item.value / total) * 100).toFixed(1);
    const txt = createSvgEl('text', {
      x: legendX + 18,
      y: ly + 1,
      'font-family': 'var(--font-mono)',
      'font-size': '12px',
      fill: 'var(--text-primary)',
    });
    txt.textContent = `${item.label} (${pct}%)`;
    svg.appendChild(txt);

    angle = endAngle;
  });

  // Donut inner cutout for industrial look
  svg.appendChild(
    createSvgEl('circle', {
      cx,
      cy,
      r: r * 0.42,
      fill: 'var(--bg-workbench)',
    })
  );

  return { svg, width, height };
}

// ============================================================================
// 4. PUBLIC ENTRY POINT & BOUNDED CACHE
// ============================================================================

interface CachedDiagramEntry {
  kind: DiagramKind;
  label: string;
  svg: SVGSVGElement;
  width: number;
  height: number;
}

const diagramCache = new Map<string, CachedDiagramEntry | null>();
const MAX_CACHE_ENTRIES = 48;

function cloneSvgWithUniqueMarkers(source: SVGSVGElement): SVGSVGElement {
  const cloned = source.cloneNode(true) as SVGSVGElement;
  const markers = cloned.querySelectorAll('defs marker[id]');
  markers.forEach((marker) => {
    const oldId = marker.getAttribute('id');
    if (!oldId) return;
    const newId = `gecko-m-${nextMarkerUid++}`;
    marker.setAttribute('id', newId);
    const refVal = `url(#${oldId})`;
    const newVal = `url(#${newId})`;
    cloned.querySelectorAll('[marker-end]').forEach((el) => {
      if (el.getAttribute('marker-end') === refVal) {
        el.setAttribute('marker-end', newVal);
      }
    });
  });
  return cloned;
}

function ensureCachedDiagram(langRaw: string, body: string): CachedDiagramEntry | null {
  const detection = detectDiagramBlock(langRaw, body);
  if (!detection) return null;

  const cacheKey = `${detection.kind}\0${body}`;
  if (diagramCache.has(cacheKey)) {
    return diagramCache.get(cacheKey) ?? null;
  }

  let result: { svg: SVGSVGElement; width: number; height: number } | null = null;
  if (detection.kind === 'ascii-topology') {
    result = renderAsciiTopologySvg(body);
  } else if (detection.kind === 'ascii-chart') {
    result = renderAsciiBarChartSvg(body);
  } else if (detection.kind === 'mermaid-flow') {
    result = renderMermaidFlowchartSvg(body);
  } else if (detection.kind === 'mermaid-seq') {
    result = renderMermaidSequenceSvg(body);
  } else if (detection.kind === 'mermaid-pie') {
    result = renderMermaidPieSvg(body);
  }

  if (diagramCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = diagramCache.keys().next().value;
    if (oldestKey !== undefined) diagramCache.delete(oldestKey);
  }

  if (!result) {
    diagramCache.set(cacheKey, null);
    return null;
  }

  const entry: CachedDiagramEntry = {
    kind: detection.kind,
    label: detection.label,
    svg: result.svg,
    width: result.width,
    height: result.height,
  };
  diagramCache.set(cacheKey, entry);
  return entry;
}

export function getDiagramDimensions(
  langRaw: string,
  body: string
): { kind: DiagramKind; label: string; width: number; height: number } | null {
  const entry = ensureCachedDiagram(langRaw, body);
  if (!entry) return null;
  return {
    kind: entry.kind,
    label: entry.label,
    width: entry.width,
    height: entry.height,
  };
}

export function renderDiagram(langRaw: string, body: string): RenderedDiagram | null {
  const entry = ensureCachedDiagram(langRaw, body);
  if (!entry) return null;

  return {
    kind: entry.kind,
    label: entry.label,
    svg: cloneSvgWithUniqueMarkers(entry.svg),
    width: entry.width,
    height: entry.height,
  };
}
