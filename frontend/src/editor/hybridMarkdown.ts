import {
  Annotation,
  EditorSelection,
  EditorState,
  Range,
  StateField,
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { isolateHistory } from '@codemirror/commands';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';

const MAX_HYBRID_DOC_LENGTH = 1048576; // 1 MB safeguard

class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-md-bullet';
    span.textContent = '•';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  eq(): boolean {
    return true;
  }
}

class CodeHeaderWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-md-code-badge';
    span.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="5 4 1 8 5 12"/><polyline points="11 4 15 8 11 12"/></svg><span>${this.lang || 'code'}</span>`;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  eq(other: CodeHeaderWidget): boolean {
    return this.lang === other.lang;
  }
}

class CodeFooterWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-md-code-footer';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  eq(): boolean {
    return true;
  }
}

class HorizontalRuleWidget extends WidgetType {
  constructor(readonly lineFrom: number) {
    super();
  }

  eq(other: HorizontalRuleWidget): boolean {
    return this.lineFrom === other.lineFrom;
  }

  get estimatedHeight(): number {
    return 22;
  }

  ignoreEvent(): boolean {
    return false;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-md-hr-wrap';
    wrap.setAttribute('aria-hidden', 'true');

    const line = document.createElement('span');
    line.className = 'cm-md-hr-line';
    wrap.appendChild(line);

    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({
        selection: EditorSelection.cursor(this.lineFrom),
        scrollIntoView: true,
      });
      view.focus();
    });

    return wrap;
  }
}

const bulletWidget = new BulletWidget();
const codeFooterWidget = new CodeFooterWidget();

const hideDecoration = Decoration.replace({});
const bulletReplaceDecoration = Decoration.replace({ widget: bulletWidget });

const codeLineStartDeco = Decoration.line({
  class: 'cm-md-code-line cm-md-code-start',
});
const codeLineMiddleDeco = Decoration.line({
  class: 'cm-md-code-line',
});
const codeLineEndDeco = Decoration.line({
  class: 'cm-md-code-line cm-md-code-end',
});

const codeTextMark = Decoration.mark({ class: 'cm-md-code-text' });
const codeLangMark = Decoration.mark({ class: 'cm-md-code-lang' });

const h1Mark = Decoration.mark({ class: 'cm-md-h1' });
const h2Mark = Decoration.mark({ class: 'cm-md-h2' });
const h3Mark = Decoration.mark({ class: 'cm-md-h3' });
const h4Mark = Decoration.mark({ class: 'cm-md-h4' });
const h5Mark = Decoration.mark({ class: 'cm-md-h5' });
const h6Mark = Decoration.mark({ class: 'cm-md-h6' });
const boldMark = Decoration.mark({ class: 'cm-md-bold' });
const italicMark = Decoration.mark({ class: 'cm-md-italic' });
const underlineMark = Decoration.mark({ class: 'cm-md-underline' });
const inlineCodeMark = Decoration.mark({ class: 'cm-md-inline-code' });
const strikethroughMark = Decoration.mark({ class: 'cm-md-strikethrough' });
const linkMark = Decoration.mark({ class: 'cm-md-link' });
const quoteLineDeco = Decoration.line({ class: 'cm-md-quote-line' });
const quoteMark = Decoration.mark({ class: 'cm-md-quote' });
const markerColorMark = Decoration.mark({ class: 'cm-md-marker' });
const hrActiveMark = Decoration.mark({ class: 'cm-md-hr-active' });

/**
 * Returns the set of 1-based line numbers that currently contain any cursor or selection range.
 */
function getActiveLineNumbers(view: EditorView): Set<number> {
  const activeLines = new Set<number>();
  const { doc, selection } = view.state;

  for (const range of selection.ranges) {
    const startLine = doc.lineAt(range.from).number;
    const endLine = doc.lineAt(range.to).number;
    for (let l = startLine; l <= endLine; l++) {
      activeLines.add(l);
    }
  }
  return activeLines;
}

function isRangeOnActiveLine(
  view: EditorView,
  activeLines: Set<number>,
  from: number,
  to: number
): boolean {
  const { doc } = view.state;
  const startLine = doc.lineAt(from).number;
  const endLine = doc.lineAt(to).number;
  for (let l = startLine; l <= endLine; l++) {
    if (activeLines.has(l)) {
      return true;
    }
  }
  return false;
}

function buildHybridMarkdownDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  if (state.doc.length > MAX_HYBRID_DOC_LENGTH) {
    return Decoration.none;
  }

  const activeLines = getActiveLineNumbers(view);
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const nodeFrom = node.from;
        const nodeTo = node.to;
        if (nodeFrom >= nodeTo) {
          return;
        }

        const onActiveLine = isRangeOnActiveLine(
          view,
          activeLines,
          nodeFrom,
          nodeTo
        );

        if (node.name === 'Table' && !onActiveLine) {
          return false;
        }

        switch (node.name) {
          case 'ATXHeading1':
          case 'ATXHeading2':
          case 'ATXHeading3':
          case 'ATXHeading4':
          case 'ATXHeading5':
          case 'ATXHeading6': {
            const headingDeco =
              node.name === 'ATXHeading1'
                ? h1Mark
                : node.name === 'ATXHeading2'
                ? h2Mark
                : node.name === 'ATXHeading3'
                ? h3Mark
                : node.name === 'ATXHeading4'
                ? h4Mark
                : node.name === 'ATXHeading5'
                ? h5Mark
                : h6Mark;

            decorations.push(headingDeco.range(nodeFrom, nodeTo));

            const headerMarkNode = node.node.getChild('HeaderMark');
            if (headerMarkNode && headerMarkNode.from === nodeFrom) {
              if (!onActiveLine) {
                let replaceTo = headerMarkNode.to;
                while (
                  replaceTo < nodeTo &&
                  state.sliceDoc(replaceTo, replaceTo + 1) === ' '
                ) {
                  replaceTo += 1;
                }
                if (replaceTo < nodeTo) {
                  decorations.push(hideDecoration.range(nodeFrom, replaceTo));
                }
              } else {
                decorations.push(
                  markerColorMark.range(headerMarkNode.from, headerMarkNode.to)
                );
              }
            }
            break;
          }

          case 'Escape': {
            if (!onActiveLine) {
              decorations.push(hideDecoration.range(nodeFrom, nodeFrom + 1));
            } else {
              decorations.push(markerColorMark.range(nodeFrom, nodeFrom + 1));
            }
            break;
          }

          case 'StrongEmphasis': {
            decorations.push(boldMark.range(nodeFrom, nodeTo));
            const marks = node.node.getChildren('EmphasisMark');
            for (const m of marks) {
              if (m.to > m.from) {
                const markLine = state.doc.lineAt(m.from).number;
                if (!activeLines.has(markLine)) {
                  decorations.push(hideDecoration.range(m.from, m.to));
                }
              }
            }
            break;
          }

          case 'Emphasis': {
            decorations.push(italicMark.range(nodeFrom, nodeTo));
            const marks = node.node.getChildren('EmphasisMark');
            for (const m of marks) {
              if (m.to > m.from) {
                const markLine = state.doc.lineAt(m.from).number;
                if (!activeLines.has(markLine)) {
                  decorations.push(hideDecoration.range(m.from, m.to));
                }
              }
            }
            break;
          }

          case 'InlineCode': {
            decorations.push(inlineCodeMark.range(nodeFrom, nodeTo));
            const marks = node.node.getChildren('CodeMark');
            for (const m of marks) {
              if (m.to > m.from) {
                const markLine = state.doc.lineAt(m.from).number;
                if (!activeLines.has(markLine)) {
                  decorations.push(hideDecoration.range(m.from, m.to));
                }
              }
            }
            break;
          }

          case 'Strikethrough': {
            decorations.push(strikethroughMark.range(nodeFrom, nodeTo));
            const marks = node.node.getChildren('StrikethroughMark');
            for (const m of marks) {
              if (m.to > m.from) {
                const markLine = state.doc.lineAt(m.from).number;
                if (!activeLines.has(markLine)) {
                  decorations.push(hideDecoration.range(m.from, m.to));
                }
              }
            }
            break;
          }

          case 'Link': {
            decorations.push(linkMark.range(nodeFrom, nodeTo));
            const linkMarks = node.node.getChildren('LinkMark');
            if (linkMarks.length >= 2) {
              const openBracket = linkMarks[0];
              const closeBracket = linkMarks[1];
              const hasText = closeBracket.from > openBracket.to;
              if (hasText) {
                const openLine = state.doc.lineAt(openBracket.from).number;
                const closeLine = state.doc.lineAt(closeBracket.from).number;
                if (!activeLines.has(openLine)) {
                  decorations.push(
                    hideDecoration.range(openBracket.from, openBracket.to)
                  );
                }
                if (!activeLines.has(closeLine)) {
                  decorations.push(
                    hideDecoration.range(closeBracket.from, nodeTo)
                  );
                }
              }
            }
            break;
          }

          case 'FencedCode': {
            const startLineNum = state.doc.lineAt(nodeFrom).number;
            const endLineNum = state.doc.lineAt(nodeTo).number;
            const marks = node.node.getChildren('CodeMark');
            const infoNode = node.node.getChild('CodeInfo');
            const lang = infoNode ? state.sliceDoc(infoNode.from, infoNode.to).trim() : '';

            if (endLineNum > startLineNum) {
              const hasClosingMark = marks.length >= 2;
              for (let l = startLineNum; l <= endLineNum; l++) {
                const line = state.doc.line(l);
                if (l === startLineNum) {
                  decorations.push(codeLineStartDeco.range(line.from));
                } else if (l === endLineNum && hasClosingMark) {
                  decorations.push(codeLineEndDeco.range(line.from));
                } else {
                  decorations.push(codeLineMiddleDeco.range(line.from));
                }
              }

              const codeTextNode = node.node.getChild('CodeText');
              if (codeTextNode && codeTextNode.to > codeTextNode.from) {
                decorations.push(codeTextMark.range(codeTextNode.from, codeTextNode.to));
              }

              if (marks.length >= 1) {
                const firstMark = marks[0];
                const firstLine = state.doc.line(startLineNum);
                if (!activeLines.has(startLineNum)) {
                  decorations.push(
                    Decoration.replace({
                      widget: new CodeHeaderWidget(lang),
                    }).range(firstMark.from, firstLine.to)
                  );
                } else {
                  decorations.push(markerColorMark.range(firstMark.from, firstMark.to));
                  if (infoNode && infoNode.to > infoNode.from) {
                    decorations.push(codeLangMark.range(infoNode.from, infoNode.to));
                  }
                }
              }

              if (hasClosingMark) {
                const lastMark = marks[marks.length - 1];
                const lastLine = state.doc.line(endLineNum);
                if (!activeLines.has(endLineNum)) {
                  decorations.push(
                    Decoration.replace({
                      widget: codeFooterWidget,
                    }).range(lastMark.from, lastLine.to)
                  );
                } else {
                  decorations.push(markerColorMark.range(lastMark.from, lastMark.to));
                }
              }
            } else {
              if (marks.length > 0) {
                decorations.push(markerColorMark.range(nodeFrom, nodeTo));
              }
            }
            break;
          }

          case 'CodeBlock': {
            const startLineNum = state.doc.lineAt(nodeFrom).number;
            const endLineNum = state.doc.lineAt(nodeTo).number;
            for (let l = startLineNum; l <= endLineNum; l++) {
              const line = state.doc.line(l);
              decorations.push(codeLineMiddleDeco.range(line.from));
            }
            decorations.push(codeTextMark.range(nodeFrom, nodeTo));
            break;
          }

          case 'ListMark': {
            const markerText = state.sliceDoc(nodeFrom, nodeTo);
            const isBullet =
              markerText === '-' || markerText === '*' || markerText === '+';
            if (isBullet) {
              if (!onActiveLine) {
                decorations.push(
                  bulletReplaceDecoration.range(nodeFrom, nodeTo)
                );
              } else {
                decorations.push(markerColorMark.range(nodeFrom, nodeTo));
              }
            } else {
              decorations.push(markerColorMark.range(nodeFrom, nodeTo));
            }
            break;
          }

          case 'Blockquote': {
            const startLineNum = state.doc.lineAt(nodeFrom).number;
            const endLineNum = state.doc.lineAt(nodeTo).number;
            for (let l = startLineNum; l <= endLineNum; l++) {
              const line = state.doc.line(l);
              const quoteMatch = line.text.match(/^(\s*>+\s?)(.*)$/);
              if (!quoteMatch) {
                continue;
              }
              decorations.push(quoteLineDeco.range(line.from));
              if (line.to > line.from) {
                decorations.push(quoteMark.range(line.from, line.to));
              }
              const prefixLen = quoteMatch[1].length;
              const hasContent = quoteMatch[2].trim().length > 0;
              if (!activeLines.has(l) && hasContent) {
                decorations.push(
                  hideDecoration.range(line.from, line.from + prefixLen)
                );
              } else {
                decorations.push(
                  markerColorMark.range(line.from, line.from + prefixLen)
                );
              }
            }
            break;
          }

          case 'HorizontalRule': {
            const line = state.doc.lineAt(nodeFrom);
            const isPureHrLine = /^\s*[-*_ ]+\s*$/.test(line.text);
            const replaceFrom = isPureHrLine ? line.from : nodeFrom;
            const replaceTo = isPureHrLine ? line.to : nodeTo;

            if (!onActiveLine) {
              if (replaceTo > replaceFrom) {
                decorations.push(
                  Decoration.replace({
                    widget: new HorizontalRuleWidget(line.from),
                    inclusive: false,
                  }).range(replaceFrom, replaceTo)
                );
              }
            } else {
              decorations.push(hrActiveMark.range(nodeFrom, nodeTo));
            }
            break;
          }
        }
      },
    });

    // Live preview for <u>...</u> underline tags within the visible range
    const sliceText = state.sliceDoc(from, to);
    const underlineRegex = /<u>([\s\S]*?)<\/u>/gi;
    let uMatch: RegExpExecArray | null;
    while ((uMatch = underlineRegex.exec(sliceText)) !== null) {
      const matchFrom = from + uMatch.index;
      const matchTo = matchFrom + uMatch[0].length;
      const openFrom = matchFrom;
      const openTo = matchFrom + 3;
      const closeFrom = matchTo - 4;
      const closeTo = matchTo;

      if (closeFrom <= openTo) {
        continue;
      }

      const resolved = tree.resolveInner(openFrom, 1);
      if (
        resolved.name === 'CodeText' ||
        resolved.name === 'InlineCode' ||
        resolved.name === 'CodeBlock' ||
        resolved.name === 'FencedCode'
      ) {
        continue;
      }

      decorations.push(underlineMark.range(openTo, closeFrom));

      const openLine = state.doc.lineAt(openFrom).number;
      const closeLine = state.doc.lineAt(closeFrom).number;

      if (!activeLines.has(openLine)) {
        decorations.push(hideDecoration.range(openFrom, openTo));
      } else {
        decorations.push(markerColorMark.range(openFrom, openTo));
      }

      if (!activeLines.has(closeLine)) {
        decorations.push(hideDecoration.range(closeFrom, closeTo));
      } else {
        decorations.push(markerColorMark.range(closeFrom, closeTo));
      }
    }
  }

  decorations.sort((a, b) => a.from - b.from || (a.value.point ? -1 : 1));
  return Decoration.set(decorations, true);
}

export const hybridMarkdownPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildHybridMarkdownDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildHybridMarkdownDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

interface ParsedMarkdownTable {
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
  rowLineOffsets: number[];
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((col) => col.trim());
}

function renderCellInlineMarkdown(text: string): string {
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  escaped = escaped.replace(/`([^`]+)`/g, '<code class="cm-md-table-code">$1</code>');
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  escaped = escaped.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, '<u>$1</u>');
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="cm-md-table-link">$1</a>');

  return escaped;
}

function parseMarkdownTable(rawText: string): ParsedMarkdownTable | null {
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

class MarkdownTableWidget extends WidgetType {
  constructor(
    readonly rawText: string,
    readonly tableFrom: number,
    readonly tableTo: number
  ) {
    super();
  }

  eq(other: MarkdownTableWidget): boolean {
    return this.rawText === other.rawText && this.tableFrom === other.tableFrom && this.tableTo === other.tableTo;
  }

  get estimatedHeight(): number {
    return 100;
  }

  ignoreEvent(event: Event): boolean {
    return false;
  }

  toDOM(view: EditorView): HTMLElement {
    const parsed = parseMarkdownTable(this.rawText);
    const wrap = document.createElement('div');
    wrap.className = 'cm-md-table-container';

    if (!parsed) {
      wrap.textContent = this.rawText;
      return wrap;
    }

    const table = document.createElement('table');
    table.className = 'cm-md-table';

    // Clicking on table container or border focuses the table in raw mode
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap || e.target === table) {
        e.preventDefault();
        view.dispatch({
          selection: EditorSelection.cursor(this.tableFrom),
          scrollIntoView: true,
        });
        view.focus();
      }
    });

    // Header
    const thead = document.createElement('thead');
    const headerTr = document.createElement('tr');
    headerTr.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({
        selection: EditorSelection.cursor(this.tableFrom),
        scrollIntoView: true,
      });
      view.focus();
    });

    parsed.headers.forEach((h, colIdx) => {
      const th = document.createElement('th');
      th.style.textAlign = parsed.alignments[colIdx] || 'left';
      th.innerHTML = renderCellInlineMarkdown(h);
      headerTr.appendChild(th);
    });
    thead.appendChild(headerTr);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    parsed.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr');
      const rowOffset = parsed.rowLineOffsets[rowIdx + 1] ?? 0;
      tr.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'A') {
          e.preventDefault();
          const href = target.getAttribute('href');
          if (href) openExternalUrl(href);
          return;
        }
        e.preventDefault();
        view.dispatch({
          selection: EditorSelection.cursor(this.tableFrom + rowOffset),
          scrollIntoView: true,
        });
        view.focus();
      });

      row.forEach((cell, colIdx) => {
        const td = document.createElement('td');
        td.style.textAlign = parsed.alignments[colIdx] || 'left';
        td.innerHTML = renderCellInlineMarkdown(cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    return wrap;
  }
}

function buildTableDecorations(state: EditorState): DecorationSet {
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
  const totalDocLines = state.doc.lines;

  tree.iterate({
    enter: (node) => {
      if (node.name === 'Table') {
        const startLineObj = state.doc.lineAt(node.from);
        const endLineObj = state.doc.lineAt(node.to);
        const startLine = startLineObj.number;

        // A valid Markdown table must have at least 2 lines: Header and Delimiter
        if (startLine + 1 > totalDocLines) return;
        const headerText = state.doc.line(startLine).text;
        const delimText = state.doc.line(startLine + 1).text;
        if (!headerText.includes('|') || !delimText.includes('|') || !delimText.includes('-')) {
          return;
        }

        // Determine the actual end line of the table.
        // GFM's table parser is greedy and treats consecutive non-blank lines as table rows even without '|'.
        // We only consider lines that actually contain '|' as belonging to the table.
        let validEndLine = startLine + 1;
        for (let l = startLine + 2; l <= endLineObj.number; l++) {
          const lineText = state.doc.line(l).text.trim();
          if (!lineText.includes('|')) {
            break;
          }
          validEndLine = l;
        }

        // Check if any line of the actual table currently contains the cursor
        let hasActiveLine = false;
        for (let l = startLine; l <= validEndLine; l++) {
          if (activeLines.has(l)) {
            hasActiveLine = true;
            break;
          }
        }

        if (!hasActiveLine) {
          const from = state.doc.line(startLine).from;
          const to = state.doc.line(validEndLine).to;
          const rawText = state.sliceDoc(from, to);
          decorations.push(
            Decoration.replace({
              widget: new MarkdownTableWidget(rawText, from, to),
              block: true,
              inclusive: false,
              inclusiveStart: false,
              inclusiveEnd: false,
            }).range(from, to)
          );
        }
      }
    },
  });

  decorations.sort((a, b) => a.from - b.from);
  return Decoration.set(decorations, true);
}

export const markdownTableField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return buildTableDecorations(tr.state);
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function openExternalUrl(rawUrl: string): void {
  let url = rawUrl.trim();
  if (!url) return;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    url = 'https://' + url;
  }
  try {
    BrowserOpenURL(url);
  } catch {
    window.open(url, '_blank');
  }
}

export function getUrlAtPos(state: EditorState, pos: number): string | null {
  const tree = syntaxTree(state);
  const node = tree.resolveInner(pos, -1);
  let current: typeof node | null = node;
  while (current) {
    if (current.name === 'Link') {
      const urlNode = current.getChild('URL');
      if (urlNode) {
        return state.sliceDoc(urlNode.from, urlNode.to);
      }
      const rawText = state.sliceDoc(current.from, current.to);
      const match = rawText.match(/\]\(([^)\s]+)/);
      if (match) return match[1];
    }
    current = current.parent;
  }

  const line = state.doc.lineAt(pos);
  const offset = pos - line.from;
  const urlRegex = /(?:https?:\/\/|www\.)[^\s<>)"]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|br|org|net|io|dev|edu|gov|app|ai|me|co)(?:\/[^\s<>)"]*)?/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(line.text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset <= end) {
      return match[0];
    }
  }
  return null;
}

export const linkClickHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    if ((event.ctrlKey || event.metaKey || event.altKey) && event.button === 0) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos != null) {
        const url = getUrlAtPos(view.state, pos);
        if (url) {
          event.preventDefault();
          event.stopPropagation();
          openExternalUrl(url);
          return true;
        }
      }
    }
    return false;
  },
});

export const autoLinkAnnotation = Annotation.define<boolean>();
export const dismissedAutoLinks = new Set<number>();

export function removeLinkAtCursor(view: EditorView): boolean {
  const { state } = view;
  const head = state.selection.main.head;
  const tree = syntaxTree(state);
  let current = tree.resolveInner(head, -1);
  while (current && current.name !== 'Link') {
    current = current.parent!;
  }
  if (!current) {
    const line = state.doc.lineAt(head);
    const linePos = head - line.from;
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(line.text)) !== null) {
      const mStart = match.index;
      const mEnd = mStart + match[0].length;
      if (linePos >= mStart && linePos <= mEnd) {
        const text = match[1];
        const from = line.from + mStart;
        const to = line.from + mEnd;
        view.dispatch({
          changes: { from, to, insert: text },
          userEvent: 'input',
        });
        dismissedAutoLinks.add(from);
        return true;
      }
    }
    return false;
  }

  const raw = state.sliceDoc(current.from, current.to);
  const match = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (match) {
    const text = match[1];
    view.dispatch({
      changes: { from: current.from, to: current.to, insert: text },
      userEvent: 'input',
    });
    dismissedAutoLinks.add(current.from);
    return true;
  }
  return false;
}

export const autoLinkExtension = EditorView.updateListener.of((update: ViewUpdate) => {
  if (update.transactions.some((tr) => tr.isUserEvent('undo'))) {
    for (const r of update.state.selection.ranges) {
      dismissedAutoLinks.add(r.head);
    }
    return;
  }

  if (!update.docChanged) return;

  const isTyping = update.transactions.some(
    (tr) => tr.isUserEvent('input.type') || tr.isUserEvent('input')
  );
  if (!isTyping) return;

  if (update.transactions.some((tr) => tr.annotation(autoLinkAnnotation))) {
    return;
  }

  const { state, view } = update;
  const main = state.selection.main;
  if (!main.empty) return;

  const head = main.head;
  const line = state.doc.lineAt(head);
  const textBefore = line.text.slice(0, head - line.from);

  if (!textBefore.endsWith(' ') && !(head === line.from && line.number > 1)) {
    return;
  }

  const trimmedBefore = textBefore.trimEnd();
  const match = trimmedBefore.match(
    /(?:https?:\/\/|www\.)[^\s<>)"]+$|[a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|br|org|net|io|dev|edu|gov|app|ai|me|co)(?:\/[^\s<>)"]*)?$/i
  );
  if (!match) return;

  const word = match[0];
  const wordEnd = line.from + match.index! + word.length;
  const wordStart = line.from + match.index!;

  if (dismissedAutoLinks.has(wordStart)) return;

  if (wordStart > line.from) {
    const prevChar = line.text[wordStart - line.from - 1];
    if (prevChar === '[' || prevChar === '(' || prevChar === '@' || prevChar === '/' || prevChar === '\\') {
      return;
    }
  }

  const tree = syntaxTree(state);
  const node = tree.resolveInner(wordStart, 1);
  let cur: typeof node | null = node;
  while (cur) {
    if (
      cur.name === 'Link' ||
      cur.name === 'InlineCode' ||
      cur.name === 'CodeBlock' ||
      cur.name === 'FencedCode' ||
      cur.name === 'CodeText'
    ) {
      return;
    }
    cur = cur.parent;
  }

  const targetUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(word) ? word : 'https://' + word;

  queueMicrotask(() => {
    if (view.state.doc.sliceString(wordStart, wordEnd) !== word) return;
    if (dismissedAutoLinks.has(wordStart)) return;

    view.dispatch({
      changes: {
        from: wordStart,
        to: wordEnd,
        insert: `[${word}](${targetUrl})`,
      },
      annotations: [
        isolateHistory.of('full'),
        autoLinkAnnotation.of(true),
      ],
    });
  });
});
