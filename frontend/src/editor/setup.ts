import { EditorState, Extension, Prec } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  Panel,
  rectangularSelection,
  ViewUpdate,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
} from '@codemirror/commands';
import {
  foldGutter,
  foldKeymap,
  foldService,
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import {
  markdown,
  markdownKeymap,
  markdownLanguage,
} from '@codemirror/lang-markdown';
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  highlightSelectionMatches,
  replaceAll,
  replaceNext,
  search,
  searchKeymap,
  SearchQuery,
  selectMatches,
  setSearchQuery,
} from '@codemirror/search';
import { Strikethrough, Table, TaskList } from '@lezer/markdown';
import { tags } from '@lezer/highlight';
import { createSmartPasteExtension } from './clipboardMarkdown';
import { geckoMinimapPlugin } from './minimap';
import {
  autoLinkExtension,
  hybridMarkdownPlugin,
  linkClickHandler,
  markdownTableField,
} from './hybridMarkdown';
import { geckoShortcutsKeymap } from './shortcuts';
import { getFocusable } from '../keyboard';

export interface CursorStatusInfo {
  line: number;
  col: number;
  cursorCount: number;
  selectedChars: number;
}

export interface EditorCallbacks {
  onDocChanged?: (content: string) => void;
  onStatusChanged?: (status: CursorStatusInfo) => void;
  onStatusMessage?: (msg: string) => void;
}

const geckoHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading],
    color: 'var(--md-heading)',
    fontWeight: '600',
  },
  {
    tag: tags.strong,
    fontWeight: '700',
  },
  {
    tag: tags.emphasis,
    fontStyle: 'italic',
  },
  {
    tag: tags.strikethrough,
    color: 'var(--text-secondary)',
    textDecoration: 'line-through',
  },
  {
    tag: [tags.monospace, tags.processingInstruction],
    color: 'var(--md-heading)',
    fontFamily: 'var(--font-mono)',
  },
  {
    tag: [tags.link, tags.url],
    color: 'var(--accent-primary)',
    textDecoration: 'underline',
  },
  {
    tag: [tags.meta, tags.punctuation],
    color: 'var(--md-marker)',
  },
  {
    tag: tags.comment,
    color: 'var(--text-secondary)',
  },
]);

const geckoEditorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      width: '100%',
      backgroundColor: 'var(--bg-editor)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-mono)',
      fontSize: '14px',
      lineHeight: '1.6',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.6',
      overflow: 'auto',
    },
    '.cm-content': {
      padding: '16px 68px 64px 8px',
      caretColor: 'var(--accent-primary)',
      userSelect: 'text',
      WebkitUserSelect: 'text',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent-primary)',
      borderLeftWidth: '2px',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      backgroundColor: 'var(--accent-alpha-45, rgba(46, 160, 67, 0.45)) !important',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--accent-alpha-35, rgba(46, 160, 67, 0.36)) !important',
    },
    '.cm-content ::selection': {
      backgroundColor: 'var(--accent-alpha-45, rgba(46, 160, 67, 0.45)) !important',
      color: '#FFFFFF',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'var(--accent-alpha-18, rgba(46, 160, 67, 0.18))',
      outline: '1px solid var(--accent-hover)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(210, 153, 34, 0.28)',
      outline: '1px solid rgba(210, 153, 34, 0.65)',
      borderRadius: '2px',
    },
    '.cm-searchMatch-selected': {
      backgroundColor: 'var(--accent-search-active-bg, rgba(63, 185, 80, 0.55)) !important',
      outline: '1.5px solid var(--accent-search-active-border, #3FB950) !important',
      color: '#FFFFFF !important',
      borderRadius: '2px',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--bg-active-line-overlay)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-editor)',
      color: 'var(--text-secondary)',
      borderRight: '1px solid var(--border-subtle)',
      userSelect: 'none',
      paddingRight: '4px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--bg-active-line)',
      color: 'var(--text-primary)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 12px 0 16px',
      minWidth: '40px',
    },
    '.cm-panels': {
      backgroundColor: 'var(--bg-elevated)',
      color: 'var(--text-primary)',
      borderTop: '1px solid var(--border-subtle)',
    },
  },
  { dark: true }
);

function createGeckoSearchPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'gecko-search-panel';

  // Row 1: Find
  const findRow = document.createElement('div');
  findRow.className = 'gecko-search-row';

  const inputGroup = document.createElement('div');
  inputGroup.className = 'gecko-search-input-group';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'gecko-search-icon';
  searchIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>`;

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'gecko-search-input';
  searchInput.placeholder = 'Buscar no documento...';
  searchInput.setAttribute('aria-label', 'Buscar no documento');
  searchInput.setAttribute('main-field', 'true');
  searchInput.spellcheck = false;
  searchInput.autocomplete = 'off';

  const togglesGroup = document.createElement('div');
  togglesGroup.className = 'gecko-search-toggles';

  const caseBtn = document.createElement('button');
  caseBtn.type = 'button';
  caseBtn.className = 'gecko-search-toggle-btn';
  caseBtn.textContent = 'Aa';
  caseBtn.title = 'Diferenciar maiúsculas e minúsculas';

  const wordBtn = document.createElement('button');
  wordBtn.type = 'button';
  wordBtn.className = 'gecko-search-toggle-btn';
  wordBtn.textContent = 'ab';
  wordBtn.title = 'Palavra inteira';

  const regexpBtn = document.createElement('button');
  regexpBtn.type = 'button';
  regexpBtn.className = 'gecko-search-toggle-btn';
  regexpBtn.textContent = '.*';
  regexpBtn.title = 'Expressão regular (Regex)';

  togglesGroup.append(caseBtn, wordBtn, regexpBtn);
  inputGroup.append(searchIcon, searchInput, togglesGroup);

  const countBadge = document.createElement('span');
  countBadge.className = 'gecko-search-count';
  countBadge.textContent = '';

  const navGroup = document.createElement('div');
  navGroup.className = 'gecko-search-actions';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'gecko-search-btn icon-btn';
  prevBtn.title = 'Resultado anterior (Shift+Enter)';
  prevBtn.setAttribute('aria-label', 'Resultado anterior');
  prevBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><polyline points="4 10 8 6 12 10"/></svg>`;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'gecko-search-btn icon-btn';
  nextBtn.title = 'Próximo resultado (Enter)';
  nextBtn.setAttribute('aria-label', 'Próximo resultado');
  nextBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><polyline points="4 6 8 10 12 6"/></svg>`;

  const selectAllBtn = document.createElement('button');
  selectAllBtn.type = 'button';
  selectAllBtn.className = 'gecko-search-btn';
  selectAllBtn.textContent = 'Selecionar tudo';
  selectAllBtn.title = 'Selecionar todas as ocorrências';

  const toggleReplaceBtn = document.createElement('button');
  toggleReplaceBtn.type = 'button';
  toggleReplaceBtn.className = 'gecko-search-btn';
  toggleReplaceBtn.textContent = 'Substituir';
  toggleReplaceBtn.title = 'Mostrar/ocultar ferramentas de substituição';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'gecko-search-btn icon-btn close-btn';
  closeBtn.title = 'Fechar busca (Esc)';
  closeBtn.setAttribute('aria-label', 'Fechar busca');
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>`;

  navGroup.append(prevBtn, nextBtn, selectAllBtn, toggleReplaceBtn, closeBtn);
  findRow.append(inputGroup, countBadge, navGroup);

  // Row 2: Replace (collapsible)
  const replaceRow = document.createElement('div');
  replaceRow.className = 'gecko-search-row gecko-replace-row hidden';

  const replaceInputGroup = document.createElement('div');
  replaceInputGroup.className = 'gecko-search-input-group';

  const replaceIcon = document.createElement('span');
  replaceIcon.className = 'gecko-search-icon';
  replaceIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 10h8l-2.5-2.5M13 6H5l2.5 2.5"/></svg>`;

  const replaceInput = document.createElement('input');
  replaceInput.type = 'text';
  replaceInput.className = 'gecko-search-input';
  replaceInput.placeholder = 'Substituir por...';
  replaceInput.setAttribute('aria-label', 'Substituir por');
  replaceInput.spellcheck = false;
  replaceInput.autocomplete = 'off';

  replaceInputGroup.append(replaceIcon, replaceInput);

  const replaceActions = document.createElement('div');
  replaceActions.className = 'gecko-search-actions';

  const replaceOneBtn = document.createElement('button');
  replaceOneBtn.type = 'button';
  replaceOneBtn.className = 'gecko-search-btn';
  replaceOneBtn.textContent = 'Substituir atual';
  replaceOneBtn.title = 'Substituir ocorrência atual (Enter)';

  const replaceAllBtn = document.createElement('button');
  replaceAllBtn.type = 'button';
  replaceAllBtn.className = 'gecko-search-btn';
  replaceAllBtn.textContent = 'Substituir tudo';
  replaceAllBtn.title = 'Substituir todas as ocorrências';

  replaceActions.append(replaceOneBtn, replaceAllBtn);
  replaceRow.append(replaceInputGroup, replaceActions);

  dom.append(findRow, replaceRow);

  let caseSensitive = false;
  let wholeWord = false;
  let regexp = false;

  const syncFromQuery = (q: SearchQuery) => {
    if (document.activeElement !== searchInput && searchInput.value !== q.search) {
      searchInput.value = q.search;
    }
    if (document.activeElement !== replaceInput && replaceInput.value !== q.replace) {
      replaceInput.value = q.replace;
    }
    caseSensitive = q.caseSensitive;
    wholeWord = q.wholeWord;
    regexp = q.regexp;
    caseBtn.classList.toggle('active', caseSensitive);
    wordBtn.classList.toggle('active', wholeWord);
    regexpBtn.classList.toggle('active', regexp);
  };

  const updateMatchCount = () => {
    const q = getSearchQuery(view.state);
    if (!q.search) {
      countBadge.textContent = '';
      countBadge.classList.remove('no-results');
      return;
    }
    if (!q.valid) {
      countBadge.textContent = 'Regex inválida';
      countBadge.classList.add('no-results');
      return;
    }

    const cursor = q.getCursor(view.state.doc);
    const selMain = view.state.selection.main;
    let total = 0;
    let currentIndex = 0;
    const maxCount = 5000;

    let item = cursor.next();
    while (!item.done && total < maxCount) {
      total++;
      const { from, to } = item.value;
      if (currentIndex === 0) {
        if (from === selMain.from && to === selMain.to) {
          currentIndex = total;
        } else if (from >= selMain.from) {
          currentIndex = total;
        }
      }
      item = cursor.next();
    }

    if (total === 0) {
      countBadge.textContent = 'Sem resultados';
      countBadge.classList.add('no-results');
    } else {
      if (currentIndex === 0) {
        currentIndex = 1;
      }
      const totalStr = total >= maxCount ? `${maxCount}+` : String(total);
      countBadge.textContent = `${currentIndex} de ${totalStr}`;
      countBadge.classList.remove('no-results');
    }
  };

  const commitQuery = () => {
    const query = new SearchQuery({
      search: searchInput.value,
      replace: replaceInput.value,
      caseSensitive,
      wholeWord,
      regexp,
    });
    view.dispatch({ effects: setSearchQuery.of(query) });
    updateMatchCount();
  };

  searchInput.addEventListener('input', () => {
    commitQuery();
  });

  replaceInput.addEventListener('input', () => {
    commitQuery();
  });

  caseBtn.addEventListener('click', () => {
    caseSensitive = !caseSensitive;
    caseBtn.classList.toggle('active', caseSensitive);
    commitQuery();
    searchInput.focus();
  });

  wordBtn.addEventListener('click', () => {
    wholeWord = !wholeWord;
    wordBtn.classList.toggle('active', wholeWord);
    commitQuery();
    searchInput.focus();
  });

  regexpBtn.addEventListener('click', () => {
    regexp = !regexp;
    regexpBtn.classList.toggle('active', regexp);
    commitQuery();
    searchInput.focus();
  });

  prevBtn.addEventListener('click', () => {
    findPrevious(view);
    updateMatchCount();
  });

  nextBtn.addEventListener('click', () => {
    findNext(view);
    updateMatchCount();
  });

  selectAllBtn.addEventListener('click', () => {
    selectMatches(view);
  });

  toggleReplaceBtn.addEventListener('click', () => {
    const isHidden = replaceRow.classList.toggle('hidden');
    toggleReplaceBtn.classList.toggle('active', !isHidden);
    if (!isHidden) {
      replaceInput.focus();
    } else {
      searchInput.focus();
    }
  });

  closeBtn.addEventListener('click', () => {
    closeSearchPanel(view);
    view.focus();
  });

  replaceOneBtn.addEventListener('click', () => {
    replaceNext(view);
    updateMatchCount();
  });

  replaceAllBtn.addEventListener('click', () => {
    replaceAll(view);
    updateMatchCount();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        findPrevious(view);
      } else {
        findNext(view);
      }
      updateMatchCount();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchPanel(view);
      view.focus();
    }
  });

  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      replaceNext(view);
      updateMatchCount();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchPanel(view);
      view.focus();
    }
  });

  // Focus trap inside search panel so Tab cycles cleanly through its controls
  dom.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchPanel(view);
      view.focus();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = getFocusable(dom);
      if (focusables.length === 0) return;
      const idx = focusables.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      if (e.shiftKey) {
        const prevIdx = idx <= 0 ? focusables.length - 1 : idx - 1;
        focusables[prevIdx].focus();
      } else {
        const nextIdx = idx === -1 || idx >= focusables.length - 1 ? 0 : idx + 1;
        focusables[nextIdx].focus();
      }
    }
  });

  syncFromQuery(getSearchQuery(view.state));
  updateMatchCount();

  return {
    dom,
    mount() {
      searchInput.focus();
      searchInput.select();
      updateMatchCount();
    },
    update(update: ViewUpdate) {
      const q = getSearchQuery(update.state);
      syncFromQuery(q);
      if (update.docChanged || update.selectionSet || update.transactions.length > 0) {
        updateMatchCount();
      }
    },
  };
}

/**
 * Folds a Markdown heading section (# .. ######) up to the next heading of the same or higher level.
 * Lines inside fenced code blocks are ignored when looking for the section end.
 */
const markdownHeadingFold = foldService.of((state, lineStart, lineEnd) => {
  const line = state.doc.lineAt(lineStart);
  const m = line.text.match(/^(#{1,6})\s+\S/);
  if (!m) return null;
  const level = m[1].length;

  let inFence = false;
  let endPos = -1;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const next = state.doc.line(n);
    if (/^\s*(```|~~~)/.test(next.text)) {
      inFence = !inFence;
    } else if (!inFence) {
      const hm = next.text.match(/^(#{1,6})\s+\S/);
      if (hm && hm[1].length <= level) break;
    }
    if (next.text.trim().length > 0) endPos = next.to;
  }

  return endPos > lineEnd ? { from: lineEnd, to: endPos } : null;
});

export function extractCursorStatus(state: EditorState): CursorStatusInfo {
  const mainRange = state.selection.main;
  const lineObj = state.doc.lineAt(mainRange.head);
  const line = lineObj.number;
  const col = mainRange.head - lineObj.from + 1;
  const cursorCount = state.selection.ranges.length;

  let selectedChars = 0;
  for (const r of state.selection.ranges) {
    if (!r.empty) {
      selectedChars += r.to - r.from;
    }
  }

  return {
    line,
    col,
    cursorCount,
    selectedChars,
  };
}

export function createGeckoEditorState(
  initialDoc: string,
  callbacks: EditorCallbacks = {}
): EditorState {
  const extensions: Extension[] = [
    lineNumbers(),
    foldGutter({ openText: '▾', closedText: '▸' }),
    markdownHeadingFold,
    indentUnit.of('  '),
    highlightActiveLineGutter(),
    history(),
    drawSelection({ cursorBlinkRate: 530 }),
    EditorState.allowMultipleSelections.of(true),
    EditorView.clickAddsSelectionRange.of((e) => e.ctrlKey || e.metaKey),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    search({ createPanel: createGeckoSearchPanel }),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    markdown({
      base: markdownLanguage,
      extensions: [Strikethrough, Table, TaskList],
    }),
    syntaxHighlighting(geckoHighlightStyle),
    hybridMarkdownPlugin,
    markdownTableField,
    linkClickHandler,
    autoLinkExtension,
    createSmartPasteExtension(callbacks.onStatusMessage),
    geckoMinimapPlugin,
    geckoEditorTheme,
    Prec.highest(keymap.of(geckoShortcutsKeymap)),
    keymap.of([
      ...markdownKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...searchKeymap,
    ]),
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged && callbacks.onDocChanged) {
        callbacks.onDocChanged(update.state.doc.toString());
      }
      if (
        (update.selectionSet || update.docChanged) &&
        callbacks.onStatusChanged
      ) {
        callbacks.onStatusChanged(extractCursorStatus(update.state));
      }
    }),
  ];

  return EditorState.create({
    doc: initialDoc,
    extensions,
  });
}

export function createGeckoEditorView(
  parent: HTMLElement,
  initialState: EditorState
): EditorView {
  return new EditorView({
    state: initialState,
    parent,
  });
}
