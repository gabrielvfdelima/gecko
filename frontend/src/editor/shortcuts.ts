import { EditorSelection, EditorState, StateCommand } from '@codemirror/state';
import { KeyBinding } from '@codemirror/view';
import {
  moveLineDown,
  moveLineUp,
} from '@codemirror/commands';
import { selectNextOccurrence } from '@codemirror/search';
import { pastePlainTextCommand } from './clipboardMarkdown';

/**
 * Toggles symmetrical inline Markdown markers (e.g., **, *, `, ~~) across all active cursors/selections.
 */
function toggleInlineMarker(marker: string): StateCommand {
  const len = marker.length;

  return ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
      const selectedText = state.sliceDoc(range.from, range.to);

      // 1. Check if selection itself includes the surrounding markers
      if (
        selectedText.length >= len * 2 &&
        selectedText.startsWith(marker) &&
        selectedText.endsWith(marker)
      ) {
        // Avoid treating "**bold**" as single "*" italic if marker is "*"
        if (
          marker !== '*' ||
          !selectedText.startsWith('**') ||
          selectedText.startsWith('***')
        ) {
          const inner = selectedText.slice(len, selectedText.length - len);
          return {
            changes: { from: range.from, to: range.to, insert: inner },
            range: EditorSelection.range(range.from, range.from + inner.length),
          };
        }
      }

      // 2. Check if text immediately outside the selection has the markers
      const before = state.sliceDoc(Math.max(0, range.from - len), range.from);
      const after = state.sliceDoc(
        range.to,
        Math.min(state.doc.length, range.to + len)
      );

      let isSurrounded = before === marker && after === marker;
      if (isSurrounded && marker === '*') {
        const before2 = state.sliceDoc(Math.max(0, range.from - 2), range.from);
        const after2 = state.sliceDoc(
          range.to,
          Math.min(state.doc.length, range.to + 2)
        );
        const before3 = state.sliceDoc(Math.max(0, range.from - 3), range.from);
        const after3 = state.sliceDoc(
          range.to,
          Math.min(state.doc.length, range.to + 3)
        );
        if (
          before2 === '**' &&
          after2 === '**' &&
          !(before3 === '***' && after3 === '***')
        ) {
          isSurrounded = false;
        }
      }

      if (isSurrounded) {
        return {
          changes: [
            { from: range.from - len, to: range.from, insert: '' },
            { from: range.to, to: range.to + len, insert: '' },
          ],
          range: EditorSelection.range(range.from - len, range.to - len),
        };
      }

      // 3. Otherwise apply the marker around the selection (or insert empty pair)
      const insertText = `${marker}${selectedText}${marker}`;
      if (range.empty) {
        return {
          changes: { from: range.from, to: range.to, insert: insertText },
          range: EditorSelection.cursor(range.from + len),
        };
      }

      return {
        changes: { from: range.from, to: range.to, insert: insertText },
        range: EditorSelection.range(range.from + len, range.to + len),
      };
    });

    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

/**
 * Toggles asymmetrical inline markers (e.g., <u>...</u>) across all active cursors/selections.
 */
function toggleAsymmetricMarker(openMarker: string, closeMarker: string): StateCommand {
  const openLen = openMarker.length;
  const closeLen = closeMarker.length;

  return ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
      const selectedText = state.sliceDoc(range.from, range.to);

      // 1. Check if selection itself includes the surrounding markers
      if (
        selectedText.length >= openLen + closeLen &&
        selectedText.startsWith(openMarker) &&
        selectedText.endsWith(closeMarker)
      ) {
        const inner = selectedText.slice(openLen, selectedText.length - closeLen);
        return {
          changes: { from: range.from, to: range.to, insert: inner },
          range: EditorSelection.range(range.from, range.from + inner.length),
        };
      }

      // 2. Check if text immediately outside the selection has the markers
      const before = state.sliceDoc(Math.max(0, range.from - openLen), range.from);
      const after = state.sliceDoc(
        range.to,
        Math.min(state.doc.length, range.to + closeLen)
      );

      if (before === openMarker && after === closeMarker) {
        return {
          changes: [
            { from: range.from - openLen, to: range.from, insert: '' },
            { from: range.to, to: range.to + closeLen, insert: '' },
          ],
          range: EditorSelection.range(range.from - openLen, range.to - openLen),
        };
      }

      // 3. Otherwise apply the marker around the selection (or insert empty pair)
      const insertText = `${openMarker}${selectedText}${closeMarker}`;
      if (range.empty) {
        return {
          changes: { from: range.from, to: range.to, insert: insertText },
          range: EditorSelection.cursor(range.from + openLen),
        };
      }

      return {
        changes: { from: range.from, to: range.to, insert: insertText },
        range: EditorSelection.range(range.from + openLen, range.to + openLen),
      };
    });

    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

/**
 * Transforms selection into a Markdown link [texto](https://) and selects the URL placeholder.
 */
const toggleMarkdownLink: StateCommand = ({ state, dispatch }) => {
  const defaultUrl = 'https://';
  const markdownLinkRegex = /^\[([^\]]*)\]\(([^)]*)\)$/;

  const changes = state.changeByRange((range) => {
    const selectedText = state.sliceDoc(range.from, range.to);
    const match = selectedText.match(markdownLinkRegex);

    if (match) {
      const linkText = match[1];
      return {
        changes: { from: range.from, to: range.to, insert: linkText },
        range: EditorSelection.range(range.from, range.from + linkText.length),
      };
    }

    const replacement = `[${selectedText}](${defaultUrl})`;
    const urlStart = range.from + 1 + selectedText.length + 2;
    const urlEnd = urlStart + defaultUrl.length;

    return {
      changes: { from: range.from, to: range.to, insert: replacement },
      range: EditorSelection.range(urlStart, urlEnd),
    };
  });

  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

/**
 * Toggles Markdown headings (# , ## , ### ) on the active line(s) across all selections.
 */
function toggleHeading(level: 1 | 2 | 3): StateCommand {
  const targetPrefix = '#'.repeat(level) + ' ';
  const headingPrefixRegex = /^#{1,6}\s+/;

  return ({ state, dispatch }) => {
    const processedLines = new Set<number>();

    const changes = state.changeByRange((range) => {
      const startLine = state.doc.lineAt(range.from);
      const endLine = state.doc.lineAt(range.to);

      const lineChanges: { from: number; to: number; insert: string }[] = [];
      let deltaFrom = 0;
      let deltaTo = 0;

      for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo++) {
        if (processedLines.has(lineNo)) {
          continue;
        }
        processedLines.add(lineNo);

        const line = state.doc.line(lineNo);
        const lineText = line.text;
        const existingMatch = lineText.match(headingPrefixRegex);

        let replacement = targetPrefix;
        let removeLen = 0;

        if (existingMatch) {
          removeLen = existingMatch[0].length;
          if (existingMatch[0] === targetPrefix) {
            // Toggle off if same heading level
            replacement = '';
          }
        }

        const diff = replacement.length - removeLen;
        lineChanges.push({
          from: line.from,
          to: line.from + removeLen,
          insert: replacement,
        });

        if (lineNo === startLine.number) {
          const offsetInLine = range.from - line.from;
          if (offsetInLine >= removeLen) {
            deltaFrom += diff;
          } else {
            deltaFrom += Math.max(-offsetInLine, replacement.length - offsetInLine);
          }
        }
        deltaTo += diff;
      }

      const newFrom = Math.max(startLine.from, range.from + deltaFrom);
      const newTo = Math.max(newFrom, range.to + deltaTo);

      return {
        changes: lineChanges,
        range: EditorSelection.range(newFrom, newTo),
      };
    });

    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

const LIST_LINE_REGEX = /^\s*(?:[-*+]|\d+\.)\s/;
const URL_PLACEHOLDER = 'https://';

/**
 * If the main selection is exactly the `https://` placeholder of a freshly created link
 * `[texto](https://)`, fills it with the link text (Ctrl+K then Tab) and moves the cursor after `)`.
 */
function completeLinkPlaceholder(state: EditorState): { from: number; to: number; insert: string; cursor: number } | null {
  const main = state.selection.main;
  if (state.selection.ranges.length !== 1) return null;
  if (state.sliceDoc(main.from, main.to) !== URL_PLACEHOLDER) return null;
  if (state.sliceDoc(main.from - 2, main.from) !== '](') return null;
  if (state.sliceDoc(main.to, main.to + 1) !== ')') return null;

  const line = state.doc.lineAt(main.from);
  const before = line.text.slice(0, main.from - 2 - line.from);
  const open = before.lastIndexOf('[');
  if (open < 0) return null;
  const linkText = before.slice(open + 1).trim();
  if (!linkText || /[\[\]]/.test(linkText)) return null;

  const insert = /^https?:\/\//i.test(linkText) ? linkText : URL_PLACEHOLDER + linkText;
  return { from: main.from, to: main.to, insert, cursor: main.from + insert.length + 1 };
}

/**
 * Indents/outdents all lines touched by the selection by `delta` levels of 2 spaces.
 */
function shiftLines(state: EditorState, dispatch: (tr: any) => void, outdent: boolean, onlyLists: boolean): boolean {
  const lineNumbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const a = state.doc.lineAt(range.from).number;
    const b = state.doc.lineAt(range.to).number;
    for (let n = a; n <= b; n++) lineNumbers.add(n);
  }

  const changes: { from: number; to: number; insert: string }[] = [];
  for (const n of lineNumbers) {
    const line = state.doc.line(n);
    if (onlyLists && !LIST_LINE_REGEX.test(line.text)) continue;
    if (outdent) {
      const m = line.text.match(/^( {1,2}|\t)/);
      if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: '' });
    } else {
      changes.push({ from: line.from, to: line.from, insert: '  ' });
    }
  }

  if (changes.length === 0) return true;
  const changeSet = state.changes(changes);
  dispatch(
    state.update({
      changes: changeSet,
      selection: state.selection.map(changeSet, 1),
      scrollIntoView: true,
      userEvent: outdent ? 'delete.dedent' : 'input.indent',
    })
  );
  return true;
}

/**
 * Handles Tab inside the editor so focus never leaves the editor:
 * - Ctrl+K placeholder `https://` -> fills it with the link text
 * - Multi-line selection or Markdown list line -> indents line(s)
 * - Single-line cursor/selection -> inserts 2 spaces at cursor
 */
export const handleEditorTab: StateCommand = ({ state, dispatch }) => {
  const link = completeLinkPlaceholder(state);
  if (link) {
    dispatch(
      state.update({
        changes: { from: link.from, to: link.to, insert: link.insert },
        selection: EditorSelection.cursor(link.cursor),
        scrollIntoView: true,
        userEvent: 'input',
      })
    );
    return true;
  }

  const isMultiLineOrList = state.selection.ranges.some((range) => {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    if (startLine.number !== endLine.number) {
      return true;
    }
    return LIST_LINE_REGEX.test(startLine.text);
  });

  if (isMultiLineOrList) {
    return shiftLines(state, dispatch, false, false);
  }

  const changes = state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: '  ' },
    range: EditorSelection.cursor(range.from + 2),
  }));
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

/**
 * Handles Shift+Tab inside the editor (also outdents list items) so focus never escapes.
 */
export const handleEditorShiftTab: StateCommand = ({ state, dispatch }) => {
  return shiftLines(state, dispatch, true, false);
};

type BlockKind = 'bullet' | 'numbered' | 'task' | 'quote';

const ANY_BLOCK_PREFIX = /^(\s*)(?:[-*+]\s\[[ xX]\]\s|[-*+]\s|\d+\.\s|>\s?)/;

function blockKindOf(text: string): BlockKind | null {
  if (/^\s*[-*+]\s\[[ xX]\]\s/.test(text)) return 'task';
  if (/^\s*[-*+]\s/.test(text)) return 'bullet';
  if (/^\s*\d+\.\s/.test(text)) return 'numbered';
  if (/^\s*>\s?/.test(text)) return 'quote';
  return null;
}

/**
 * Transforms every selected non-empty line into the given block kind (or removes it if all already have it).
 */
function toggleBlock(kind: BlockKind): StateCommand {
  return ({ state, dispatch }) => {
    const lines: number[] = [];
    const seen = new Set<number>();
    for (const range of state.selection.ranges) {
      const a = state.doc.lineAt(range.from).number;
      let b = state.doc.lineAt(range.to).number;
      if (b > a && !range.empty && range.to === state.doc.line(b).from) b--;
      for (let n = a; n <= b; n++) {
        if (!seen.has(n)) {
          seen.add(n);
          lines.push(n);
        }
      }
    }

    const targets = lines.filter((n) => state.doc.line(n).text.trim().length > 0 || lines.length === 1);
    if (targets.length === 0) return true;

    const allHave = targets.every((n) => blockKindOf(state.doc.line(n).text) === kind);
    const changes: { from: number; to: number; insert: string }[] = [];
    let counter = 1;

    for (const n of targets) {
      const line = state.doc.line(n);
      const m = line.text.match(ANY_BLOCK_PREFIX);
      const indent = m ? m[1] : (line.text.match(/^\s*/) as RegExpMatchArray)[0];
      const prefixLen = m ? m[0].length : indent.length;

      let marker = '';
      if (!allHave) {
        if (kind === 'bullet') marker = '- ';
        else if (kind === 'numbered') marker = `${counter++}. `;
        else if (kind === 'task') marker = '- [ ] ';
        else marker = '> ';
      }
      changes.push({ from: line.from, to: line.from + prefixLen, insert: indent + marker });
    }

    const changeSet = state.changes(changes);
    dispatch(
      state.update({
        changes: changeSet,
        selection: state.selection.map(changeSet, 1),
        scrollIntoView: true,
        userEvent: 'input',
      })
    );
    return true;
  };
}

export const toggleBulletListCommand = toggleBlock('bullet');
export const toggleNumberedListCommand = toggleBlock('numbered');
export const toggleTaskListCommand = toggleBlock('task');
export const toggleBlockquoteCommand = toggleBlock('quote');

/**
 * Handles Enter on a Markdown blockquote line (`> ...`):
 * - If the line is an empty quote (`> `), removes the quote prefix on the current line.
 * - If the cursor is at the end of a non-empty quote line (`> texto`), inserts a clean newline
 *   without auto-prepending `> `, so the user is not trapped inside the quote forever.
 */
export const handleBlockquoteEnter: StateCommand = ({ state, dispatch }) => {
  const { main } = state.selection;
  if (!main.empty || state.selection.ranges.length > 1) {
    return false;
  }

  const line = state.doc.lineAt(main.head);
  const emptyQuoteMatch = line.text.match(/^\s*>+\s*$/);
  if (emptyQuoteMatch) {
    dispatch(
      state.update(
        {
          changes: { from: line.from, to: line.to, insert: '' },
          selection: EditorSelection.cursor(line.from),
        },
        { scrollIntoView: true, userEvent: 'input' }
      )
    );
    return true;
  }

  const quoteMatch = line.text.match(/^\s*>+\s+/);
  if (quoteMatch && main.head === line.to) {
    dispatch(
      state.update(
        {
          changes: { from: main.head, to: main.head, insert: '\n' },
          selection: EditorSelection.cursor(main.head + 1),
        },
        { scrollIntoView: true, userEvent: 'input' }
      )
    );
    return true;
  }

  return false;
};

export const toggleBoldCommand = toggleInlineMarker('**');
export const toggleItalicCommand = toggleInlineMarker('*');
export const toggleUnderlineCommand = toggleAsymmetricMarker('<u>', '</u>');
export const toggleInlineCodeCommand = toggleInlineMarker('`');
export const toggleStrikethroughCommand = toggleInlineMarker('~~');
export const toggleLinkCommand = toggleMarkdownLink;
export const toggleH1Command = toggleHeading(1);
export const toggleH2Command = toggleHeading(2);
export const toggleH3Command = toggleHeading(3);

export const geckoShortcutsKeymap: readonly KeyBinding[] = [
  { key: 'Mod-n', run: toggleBoldCommand, preventDefault: true },
  { key: 'Mod-b', run: toggleBoldCommand, preventDefault: true },
  { key: 'Mod-i', run: toggleItalicCommand, preventDefault: true },
  { key: 'Mod-u', run: toggleUnderlineCommand, preventDefault: true },
  { key: 'Mod-e', run: toggleInlineCodeCommand, preventDefault: true },
  { key: 'Alt-Shift-d', run: toggleStrikethroughCommand, preventDefault: true },
  { key: 'Mod-k', run: toggleLinkCommand, preventDefault: true },
  { key: 'Mod-Alt-1', run: toggleH1Command, preventDefault: true },
  { key: 'Alt-1', run: toggleH1Command, preventDefault: true },
  { key: 'Mod-Alt-2', run: toggleH2Command, preventDefault: true },
  { key: 'Alt-2', run: toggleH2Command, preventDefault: true },
  { key: 'Mod-Alt-3', run: toggleH3Command, preventDefault: true },
  { key: 'Alt-3', run: toggleH3Command, preventDefault: true },
  { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
  { key: 'Mod-Shift-v', run: pastePlainTextCommand, preventDefault: true },
  { key: 'Mod-Shift-V', run: pastePlainTextCommand, preventDefault: true },
  { key: 'Mod--', run: toggleBulletListCommand, preventDefault: true },
  { key: 'Mod-.', run: toggleNumberedListCommand, preventDefault: true },
  { key: 'Mod-Shift-7', run: toggleNumberedListCommand, preventDefault: true },
  { key: 'Mod-;', run: toggleTaskListCommand, preventDefault: true },
  { key: 'Mod-Shift-9', run: toggleTaskListCommand, preventDefault: true },
  { key: 'Mod-Shift-.', run: toggleBlockquoteCommand, preventDefault: true },
  { key: 'Alt-ArrowUp', run: moveLineUp, preventDefault: true },
  { key: 'Alt-ArrowDown', run: moveLineDown, preventDefault: true },
  { key: 'Enter', run: handleBlockquoteEnter },
  { key: 'Tab', run: handleEditorTab, shift: handleEditorShiftTab, preventDefault: true },
];
