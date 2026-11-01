import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { ClipboardGetText } from '../../wailsjs/runtime/runtime';
import { GetClipboardText } from '../../wailsjs/go/main/App';

/**
 * HTML to Markdown converter tailored for rich text copied from AI chats (ChatGPT, Claude,
 * Gemini, DeepSeek), docs, and websites.
 * Zero external npm dependencies. Ultra-fast, pure vanilla TS.
 */

function convertTableToMarkdown(tableEl: HTMLElement): string {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const tableData: string[][] = [];
  let headerIndex = -1;

  rows.forEach((tr, idx) => {
    const cells = Array.from(tr.querySelectorAll('th, td'));
    const isHeaderRow = cells.some((c) => c.tagName.toLowerCase() === 'th') || idx === 0;
    if (isHeaderRow && headerIndex === -1) {
      headerIndex = idx;
    }
    const rowData = cells.map((cell) => {
      return convertNodeToMarkdown(cell).replace(/\n+/g, ' ').trim();
    });
    tableData.push(rowData);
  });

  if (tableData.length === 0) return '';

  const maxCols = Math.max(...tableData.map((r) => r.length));
  if (maxCols === 0) return '';

  tableData.forEach((r) => {
    while (r.length < maxCols) r.push('');
  });

  const lines: string[] = [];
  const headerRow = headerIndex >= 0 ? tableData[headerIndex] : tableData[0];
  lines.push(`| ${headerRow.join(' | ')} |`);
  lines.push(`| ${headerRow.map(() => '---').join(' | ')} |`);

  tableData.forEach((r, idx) => {
    if (idx === headerIndex) return;
    lines.push(`| ${r.join(' | ')} |`);
  });

  return '\n\n' + lines.join('\n') + '\n\n';
}

function convertListToMarkdown(listEl: HTMLElement, indent = 0): string {
  const isOrdered = listEl.tagName.toLowerCase() === 'ol';
  let idx = 1;
  let result = '\n';

  for (const child of Array.from(listEl.children)) {
    if (child.tagName.toLowerCase() === 'li') {
      const prefix = isOrdered ? `${idx++}. ` : '- ';
      const indentStr = '  '.repeat(indent);

      let directContent = '';
      let nestedListsContent = '';

      for (const node of Array.from(child.childNodes)) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          (node as HTMLElement).tagName &&
          ['ul', 'ol'].includes((node as HTMLElement).tagName.toLowerCase())
        ) {
          nestedListsContent += convertListToMarkdown(node as HTMLElement, indent + 1);
        } else {
          directContent += convertNodeToMarkdown(node, indent);
        }
      }

      result += `${indentStr}${prefix}${directContent.trim()}${nestedListsContent}\n`;
    }
  }

  return result;
}

function convertNodeToMarkdown(node: Node, indent = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue || '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'h1': return `\n# ${getChildrenMarkdown(el, indent).trim()}\n\n`;
    case 'h2': return `\n## ${getChildrenMarkdown(el, indent).trim()}\n\n`;
    case 'h3': return `\n### ${getChildrenMarkdown(el, indent).trim()}\n\n`;
    case 'h4': return `\n#### ${getChildrenMarkdown(el, indent).trim()}\n\n`;
    case 'h5': return `\n##### ${getChildrenMarkdown(el, indent).trim()}\n\n`;
    case 'h6': return `\n###### ${getChildrenMarkdown(el, indent).trim()}\n\n`;
    case 'strong':
    case 'b': return `**${getChildrenMarkdown(el, indent).trim()}**`;
    case 'em':
    case 'i': return `*${getChildrenMarkdown(el, indent).trim()}*`;
    case 'u': return `<u>${getChildrenMarkdown(el, indent).trim()}</u>`;
    case 's':
    case 'del':
    case 'strike': return `~~${getChildrenMarkdown(el, indent).trim()}~~`;
    case 'code': {
      if (el.parentElement?.tagName.toLowerCase() === 'pre') {
        return el.textContent || '';
      }
      return `\`${el.textContent || ''}\``;
    }
    case 'pre': {
      const codeEl = el.querySelector('code');
      const target = codeEl || el;
      const classAttr = target.getAttribute('class') || '';
      const match = classAttr.match(/(?:language-|lang-)(\w+)/i);
      const lang = match ? match[1] : (target.getAttribute('data-language') || '');
      const codeText = target.textContent || '';
      return `\n\`\`\`${lang}\n${codeText.trimEnd()}\n\`\`\`\n\n`;
    }
    case 'blockquote': {
      const text = getChildrenMarkdown(el, indent).trim();
      const lines = text.split('\n').map((l) => `> ${l}`).join('\n');
      return `\n${lines}\n\n`;
    }
    case 'a': {
      const href = el.getAttribute('href') || '';
      const text = getChildrenMarkdown(el, indent).trim();
      if (!href) return text;
      return `[${text || href}](${href})`;
    }
    case 'ul':
    case 'ol':
      return convertListToMarkdown(el, indent);
    case 'table':
      return convertTableToMarkdown(el);
    case 'p':
      return `\n\n${getChildrenMarkdown(el, indent).trim()}\n\n`;
    case 'div':
      return `\n${getChildrenMarkdown(el, indent).trim()}\n`;
    case 'br':
      return '\n';
    case 'hr':
      return '\n\n---\n\n';
    default:
      return getChildrenMarkdown(el, indent);
  }
}

function getChildrenMarkdown(el: HTMLElement, indent = 0): string {
  let result = '';
  for (const child of Array.from(el.childNodes)) {
    result += convertNodeToMarkdown(child, indent);
  }
  return result;
}

export function htmlToMarkdown(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;
    if (!body) return '';
    let md = convertNodeToMarkdown(body);
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
  } catch {
    return '';
  }
}

export function hasRichHtml(html: string): boolean {
  if (!html) return false;
  return /<(?:b|strong|i|em|u|del|s|h[1-6]|pre|code|table|ul|ol|blockquote|a\s|li)[^>]*>/i.test(html);
}

// Floating Paste Format Pill State
let activePillEl: HTMLElement | null = null;
let pillDismissTimer: any = null;
let currentAutoDismissHandler: ((ev: Event) => void) | null = null;
let globalStatusCallback: ((msg: string) => void) | null = null;

export function dismissPasteFormatPill(): void {
  if (pillDismissTimer) {
    clearTimeout(pillDismissTimer);
    pillDismissTimer = null;
  }
  if (currentAutoDismissHandler) {
    window.removeEventListener('pointerdown', currentAutoDismissHandler, true);
    window.removeEventListener('keydown', currentAutoDismissHandler, true);
    currentAutoDismissHandler = null;
  }
  if (activePillEl) {
    activePillEl.remove();
    activePillEl = null;
  }
}

function showPasteFormatPill(
  view: EditorView,
  pastedFrom: number,
  pastedTo: number,
  plainText: string,
  onStatus?: (msg: string) => void
): void {
  dismissPasteFormatPill();

  const coords = view.coordsAtPos(pastedTo) || view.coordsAtPos(pastedFrom);
  const pill = document.createElement('div');
  pill.className = 'paste-format-pill';

  const iconSpan = document.createElement('span');
  iconSpan.className = 'paste-pill-icon';
  iconSpan.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 1.5h6.5L13 5v9.5H3z"/><path d="M9.5 1.5V5H13"/></svg>';

  const textSpan = document.createElement('span');
  textSpan.className = 'paste-pill-text';
  textSpan.textContent = 'Colado como Markdown';

  const revertBtn = document.createElement('button');
  revertBtn.type = 'button';
  revertBtn.className = 'paste-pill-revert-btn';
  revertBtn.textContent = 'Texto puro (Ctrl+Shift+V)';

  // Prevent outside dismiss or focus loss when clicking revert button
  revertBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  revertBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  revertBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    let textToInsert = plainText;
    if (!textToInsert) {
      textToInsert = await readSystemClipboardText();
    }

    const currentDocLen = view.state.doc.length;
    const safeTo = Math.min(currentDocLen, pastedTo);
    view.dispatch({
      changes: { from: pastedFrom, to: safeTo, insert: textToInsert },
      selection: EditorSelection.cursor(pastedFrom + textToInsert.length),
      scrollIntoView: true,
      userEvent: 'input.paste',
    });
    view.focus();
    dismissPasteFormatPill();
    if (onStatus) onStatus('Texto revertido para texto puro');
  });

  pill.appendChild(iconSpan);
  pill.appendChild(textSpan);
  pill.appendChild(revertBtn);
  document.body.appendChild(pill);
  activePillEl = pill;

  // Position pill near cursor
  const rect = pill.getBoundingClientRect();
  const posX = coords ? Math.min(coords.left, window.innerWidth - rect.width - 16) : 200;
  const posY = coords ? Math.min(coords.bottom + 8, window.innerHeight - rect.height - 16) : 200;
  pill.style.left = `${Math.max(16, posX)}px`;
  pill.style.top = `${Math.max(16, posY)}px`;

  pillDismissTimer = setTimeout(() => {
    dismissPasteFormatPill();
  }, 5000);

  // Auto-dismiss on click outside or typing
  currentAutoDismissHandler = (ev: Event) => {
    if (activePillEl && !activePillEl.contains(ev.target as Node)) {
      dismissPasteFormatPill();
    }
  };
  window.addEventListener('pointerdown', currentAutoDismissHandler, true);
  window.addEventListener('keydown', currentAutoDismissHandler, true);
}

/**
 * Robust cross-platform system clipboard reader.
 * Uses Wails Go GTK clipboard on Linux (bypassing WebKitGTK permissions),
 * falling back to Wails runtime and browser Clipboard API.
 */
export async function readSystemClipboardText(): Promise<string> {
  // 1. Try Go backend direct call (fastest, full OS GTK/Win/Mac access)
  try {
    if (typeof GetClipboardText === 'function') {
      const text = await GetClipboardText();
      if (typeof text === 'string' && text.length > 0) return text;
    }
  } catch {
    // continue
  }

  // 2. Try Wails runtime wrapper
  try {
    if (typeof ClipboardGetText === 'function') {
      const text = await ClipboardGetText();
      if (typeof text === 'string' && text.length > 0) return text;
    }
  } catch {
    // continue
  }

  // 3. Try global window.runtime
  try {
    if (typeof (window as any).runtime?.ClipboardGetText === 'function') {
      const text = await (window as any).runtime.ClipboardGetText();
      if (typeof text === 'string' && text.length > 0) return text;
    }
  } catch {
    // continue
  }

  // 4. Try browser navigator.clipboard.readText
  try {
    if (navigator?.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      if (typeof text === 'string' && text.length > 0) return text;
    }
  } catch {
    // continue
  }

  return '';
}

/**
 * Pastes plain text into an EditorView directly and reliably.
 */
export async function pastePlainTextIntoView(
  view: EditorView,
  onStatus?: (msg: string) => void
): Promise<boolean> {
  const status = onStatus || globalStatusCallback;
  const text = await readSystemClipboardText();
  if (!text) {
    if (status) status('A área de transferência não contém texto.');
    return false;
  }

  view.dispatch(
    view.state.update(view.state.replaceSelection(text), {
      scrollIntoView: true,
      userEvent: 'input.paste',
    })
  );
  view.focus();
  dismissPasteFormatPill();
  if (status) status('Colado como texto puro');
  return true;
}

/**
 * Command to paste plain text from clipboard (Ctrl+Shift+V)
 */
export const pastePlainTextCommand = (
  target: EditorView | { state: EditorState; dispatch: (tr: any) => void }
): boolean => {
  const view = target instanceof EditorView ? target : null;
  void readSystemClipboardText().then((text) => {
    if (!text) {
      if (globalStatusCallback) globalStatusCallback('A área de transferência está vazia.');
      return;
    }
    if (view) {
      view.dispatch(
        view.state.update(view.state.replaceSelection(text), {
          scrollIntoView: true,
          userEvent: 'input.paste',
        })
      );
      view.focus();
    } else {
      const state = (target as any).state;
      const dispatch = (target as any).dispatch;
      if (state && dispatch) {
        dispatch(
          state.update(state.replaceSelection(text), {
            scrollIntoView: true,
            userEvent: 'input.paste',
          })
        );
      }
    }
    dismissPasteFormatPill();
    if (globalStatusCallback) globalStatusCallback('Colado como texto puro');
  });
  return true;
};

let isShiftKeyPressed = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey) isShiftKeyPressed = true;
  }, true);
  window.addEventListener('keyup', (e) => {
    if (!e.shiftKey) isShiftKeyPressed = false;
  }, true);
  window.addEventListener('blur', () => {
    isShiftKeyPressed = false;
  });
}

/**
 * Extension that attaches smart paste listener to EditorView.
 */
export function createSmartPasteExtension(onStatus?: (msg: string) => void) {
  if (onStatus) {
    globalStatusCallback = onStatus;
  }

  return EditorView.domEventHandlers({
    paste(event: ClipboardEvent, view: EditorView) {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return false;

      const plainText = clipboardData.getData('text/plain') || '';

      // If user pressed Shift (Ctrl+Shift+V / Shift+Insert), paste plain text immediately
      if (isShiftKeyPressed || (event as unknown as { shiftKey?: boolean }).shiftKey) {
        event.preventDefault();
        view.dispatch(
          view.state.update(view.state.replaceSelection(plainText), {
            scrollIntoView: true,
            userEvent: 'input.paste',
          })
        );
        dismissPasteFormatPill();
        if (onStatus) onStatus('Colado como texto puro');
        return true;
      }

      // Normal paste (Ctrl+V)
      const htmlText = clipboardData.getData('text/html');
      if (hasRichHtml(htmlText)) {
        const md = htmlToMarkdown(htmlText);
        if (md && md.trim().length > 0) {
          event.preventDefault();
          const sel = view.state.selection.main;
          const from = sel.from;
          const to = from + md.length;

          view.dispatch(
            view.state.update(view.state.replaceSelection(md), {
              scrollIntoView: true,
              userEvent: 'input.paste',
            })
          );

          showPasteFormatPill(view, from, to, plainText, onStatus);
          if (onStatus) {
            onStatus('Colado com formatação Markdown (use Ctrl+Shift+V para texto puro)');
          }
          return true;
        }
      }

      return false;
    },
  });
}
