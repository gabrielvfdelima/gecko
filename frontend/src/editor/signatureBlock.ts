import { EditorSelection, EditorState, Range, StateCommand, StateField } from '@codemirror/state';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { ActiveLayer, pushLayer } from '../keyboard';
import { SetClipboardText } from '../../wailsjs/go/main/App';

export const DEFAULT_SIGNATURE_TEXT =
  'O revisor abaixo aprova este documento e atesta concordância com as informações nele apresentadas.';

const SIGNATURE_LANGS = new Set(['assinatura', 'signature', 'assinatura-gov', 'assinatura-digital']);
const MAX_HYBRID_DOC_LENGTH = 1048576; // 1 MB safeguard matching diagramWidget/hybridMarkdown
const MAX_SIGNATURE_BODY_CHARS = 4096;

export interface SignatureBlockData {
  nome: string;
  cargo: string;
  texto: string;
}

export interface FencedSignatureInfo {
  lang: string;
  rawBody: string;
  data: SignatureBlockData;
  startLine: number;
  endLine: number;
  from: number;
  to: number;
}

export function isSignatureBlockLang(langRaw: string): boolean {
  return SIGNATURE_LANGS.has(langRaw.trim().toLowerCase());
}

function stripOuterQuotes(val: string): string {
  const trimmed = val.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseSignatureBlock(rawBody: string): SignatureBlockData {
  let nome = '';
  let cargo = '';
  let texto = '';

  const lines = rawBody.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([a-zA-ZÀ-ÿ_-]+)\s*:\s*(.*)$/);
    if (!match) continue;

    const key = match[1].toLowerCase();
    const val = stripOuterQuotes(match[2]);

    if (key === 'nome' || key === 'name' || key === 'revisor' || key === 'assinante') {
      nome = val;
    } else if (key === 'cargo' || key === 'funcao' || key === 'função' || key === 'role') {
      cargo = val;
    } else if (
      key === 'texto' ||
      key === 'termo' ||
      key === 'text' ||
      key === 'descricao' ||
      key === 'descrição'
    ) {
      texto = val;
    }
  }

  return {
    nome,
    cargo,
    texto: texto || DEFAULT_SIGNATURE_TEXT,
  };
}

export function formatSignatureMarkdownBlock(opts: {
  nome?: string;
  cargo?: string;
  texto?: string;
}): string {
  const cleanLine = (v?: string) => (v ?? '').replace(/[\r\n]+/g, ' ').trim();
  const nome = cleanLine(opts.nome);
  const cargo = cleanLine(opts.cargo);
  const texto = cleanLine(opts.texto);

  const lines = ['```assinatura', `nome: ${nome}`, `cargo: ${cargo}`];
  if (texto && texto !== DEFAULT_SIGNATURE_TEXT) {
    lines.push(`texto: ${texto}`);
  }
  lines.push('```');
  return lines.join('\n');
}

export function extractFencedSignatureInfo(
  state: EditorState,
  node: {
    from: number;
    to: number;
    getChildren: (n: string) => Array<{ from: number; to: number }>;
    getChild: (n: string) => { from: number; to: number } | null;
  }
): FencedSignatureInfo | null {
  if (node.to - node.from > MAX_SIGNATURE_BODY_CHARS + 128) return null;

  const marks = node.getChildren('CodeMark');
  if (marks.length < 2) return null;

  const infoNode = node.getChild('CodeInfo');
  const lang = infoNode ? state.sliceDoc(infoNode.from, infoNode.to).trim() : '';
  if (!isSignatureBlockLang(lang)) return null;

  const startLineObj = state.doc.lineAt(node.from);
  const endLineObj = state.doc.lineAt(node.to);
  const startLine = startLineObj.number;
  const endLine = endLineObj.number;
  if (endLine <= startLine) return null;

  let rawBody = '';
  if (endLine > startLine + 1) {
    const bodyFrom = state.doc.line(startLine + 1).from;
    const bodyTo = state.doc.line(endLine - 1).to;
    if (bodyTo >= bodyFrom) {
      rawBody = state.sliceDoc(bodyFrom, bodyTo);
    }
  }

  return {
    lang,
    rawBody,
    data: parseSignatureBlock(rawBody),
    startLine,
    endLine,
    from: startLineObj.from,
    to: endLineObj.to,
  };
}

async function copySignatureSnippet(text: string): Promise<boolean> {
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

export class SignatureWidget extends WidgetType {
  constructor(
    readonly data: SignatureBlockData,
    readonly rawSource: string,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  eq(other: SignatureWidget): boolean {
    return this.rawSource === other.rawSource && this.from === other.from && this.to === other.to;
  }

  get estimatedHeight(): number {
    return 206;
  }

  ignoreEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null;
    if (target && target.closest('button')) return true;
    return false;
  }

  toDOM(view: EditorView): HTMLElement {
    const card = document.createElement('div');
    card.className = 'cm-md-signature-card';

    const jumpToEdit = () => {
      const targetPos = Math.min(this.from + 1, view.state.doc.length);
      view.dispatch({
        selection: EditorSelection.cursor(targetPos),
        scrollIntoView: true,
      });
      view.focus();
    };

    const header = document.createElement('div');
    header.className = 'cm-md-diagram-header cm-md-signature-header';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'cm-md-diagram-title-group';
    leftGroup.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12.5h12"/><path d="M3.5 9.5c1.2-2.8 2.2-4 3-3.5.7.4-.2 3 .7 3.2.8.2 1.8-2 2.7-1.6.8.3.4 1.6 1.6 1.6h1"/></svg>`;

    const badgeText = document.createElement('span');
    badgeText.className = 'cm-md-diagram-badge';
    const hasEmptyFields = !this.data.nome || !this.data.cargo;
    badgeText.textContent = hasEmptyFields
      ? 'Assinatura Digital · Campos Preenchíveis no PDF'
      : 'Assinatura Digital · Revisor';
    leftGroup.appendChild(badgeText);

    const actions = document.createElement('div');
    actions.className = 'cm-md-diagram-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'cm-md-diagram-btn';
    copyBtn.title = 'Copiar bloco Markdown da assinatura';
    copyBtn.setAttribute('aria-label', 'Copiar bloco Markdown da assinatura');
    copyBtn.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9"/><path d="M11 5V2H2v9h3"/></svg><span>Copiar</span>';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'cm-md-diagram-btn';
    editBtn.title = 'Editar nome, cargo e termo no Markdown (ou clique duplo)';
    editBtn.setAttribute('aria-label', 'Editar assinatura no Markdown');
    editBtn.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg><span>Editar</span>';

    actions.append(copyBtn, editBtn);
    header.append(leftGroup, actions);

    const body = document.createElement('div');
    body.className = 'cm-md-signature-body';
    body.title = 'Clique duplo para editar Nome Completo e Cargo no Markdown';

    const termEl = document.createElement('p');
    termEl.className = 'cm-md-signature-term';
    termEl.textContent = this.data.texto;

    const stampSlot = document.createElement('div');
    stampSlot.className = 'cm-md-signature-stamp-slot';
    stampSlot.textContent = 'Espaço reservado para assinatura eletrônica gov.br';

    const signBlock = document.createElement('div');
    signBlock.className = 'cm-md-signature-sign-area';

    const signRule = document.createElement('div');
    signRule.className = 'cm-md-signature-rule';

    const nameEl = document.createElement('div');
    nameEl.className = this.data.nome
      ? 'cm-md-signature-name'
      : 'cm-md-signature-name is-fillable';
    nameEl.textContent =
      this.data.nome || 'Nome completo do revisor (campo preenchível no PDF)';

    const roleEl = document.createElement('div');
    roleEl.className = this.data.cargo
      ? 'cm-md-signature-role'
      : 'cm-md-signature-role is-fillable';
    roleEl.textContent =
      this.data.cargo || 'Cargo / Função (campo preenchível no PDF)';

    signBlock.append(signRule, nameEl, roleEl);
    body.append(termEl, stampSlot, signBlock);
    card.append(header, body);

    copyBtn.addEventListener('click', async () => {
      const ok = await copySignatureSnippet(this.rawSource);
      const span = copyBtn.querySelector('span');
      if (ok && span) {
        span.textContent = 'Copiado';
        setTimeout(() => {
          if (span.isConnected) span.textContent = 'Copiar';
        }, 1400);
      }
    });

    editBtn.addEventListener('click', jumpToEdit);
    body.addEventListener('dblclick', (e) => {
      e.preventDefault();
      jumpToEdit();
    });

    return card;
  }
}

function buildSignatureDecorations(state: EditorState): DecorationSet {
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
  const tree = ensureSyntaxTree(state, state.doc.length, 40) ?? syntaxTree(state);

  tree.iterate({
    enter: (node) => {
      if (node.name !== 'FencedCode') return;

      const info = extractFencedSignatureInfo(state, node.node);
      if (!info) return;

      for (let l = info.startLine; l <= info.endLine; l++) {
        if (activeLines.has(l)) return;
      }

      const rawSource = state.sliceDoc(info.from, info.to);
      decorations.push(
        Decoration.replace({
          widget: new SignatureWidget(info.data, rawSource, info.from, info.to),
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

export const markdownSignatureField = StateField.define<DecorationSet>({
  create(state) {
    return buildSignatureDecorations(state);
  },
  update(decorations, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState)
    ) {
      return buildSignatureDecorations(tr.state);
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const handleSignatureFenceEnter: StateCommand = ({ state, dispatch }) => {
  const main = state.selection.main;
  if (state.selection.ranges.length !== 1 || !main.empty) return false;

  const line = state.doc.lineAt(main.head);
  if (main.head !== line.to) return false;

  const openMatch = line.text.match(/^(\s*)(`{3,}|~{3,})\s*([a-zA-ZÀ-ÿ_-]+)\s*$/);
  if (!openMatch || !isSignatureBlockLang(openMatch[3])) return false;

  const indent = openMatch[1];
  const fence = openMatch[2];

  const tree =
    ensureSyntaxTree(state, Math.min(state.doc.length, line.to + 4096), 25) ??
    syntaxTree(state);
  let cur: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(line.from, 1);
  while (cur && cur.name !== 'FencedCode') {
    cur = cur.parent;
  }
  if (cur && cur.name === 'FencedCode') {
    if (cur.getChildren('CodeMark').length >= 2) {
      return false;
    }
    let ancestor = cur.parent;
    while (ancestor) {
      if (ancestor.name === 'FencedCode') return false;
      ancestor = ancestor.parent;
    }
  }

  const line1 = `\n${indent}nome: `;
  const line2 = `\n${indent}cargo: `;
  const closeLine = `\n${indent}${fence}`;
  const insert = `${line1}${line2}${closeLine}`;
  const cursorAfterNome = main.head + line1.length;

  dispatch(
    state.update(
      {
        changes: { from: main.head, to: main.head, insert },
        selection: EditorSelection.cursor(cursorAfterNome),
      },
      { scrollIntoView: true, userEvent: 'input' }
    )
  );
  return true;
};

let activeInsertSigOverlay: HTMLElement | null = null;
let activeInsertSigLayer: ActiveLayer | null = null;

export interface InsertSignatureModalOptions {
  initialNome?: string;
  initialCargo?: string;
  initialTexto?: string;
  onInsert: (snippet: string) => void;
  restoreFocusTo?: HTMLElement | null;
}

export function openInsertSignatureModal(opts: InsertSignatureModalOptions): void {
  if (activeInsertSigOverlay) {
    activeInsertSigOverlay.remove();
    activeInsertSigOverlay = null;
  }
  if (activeInsertSigLayer) {
    activeInsertSigLayer.close({ restoreFocus: false });
    activeInsertSigLayer = null;
  }

  const overlay = document.createElement('div');
  overlay.className = 'overlay gecko-signature-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Inserir Bloco de Assinatura Digital');

  const panel = document.createElement('div');
  panel.className = 'modal-panel wide gecko-signature-modal-panel';
  panel.tabIndex = -1;

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Inserir Bloco de Assinatura do Revisor';

  const body = document.createElement('div');
  body.className = 'modal-body';

  const desc = document.createElement('p');
  desc.className = 'gecko-signature-modal-desc';
  desc.textContent =
    'Preencha Nome e Cargo ou deixe em branco (pressione Enter) para gerar campos preenchíveis no PDF exportado. Se desejar, informe também uma mensagem personalizada para substituir o texto padrão de concordância.';

  const makeField = (
    labelText: string,
    placeholder: string,
    value: string,
    multiline = false
  ): HTMLInputElement | HTMLTextAreaElement => {
    const group = document.createElement('div');
    group.className = 'gecko-form-group';
    const label = document.createElement('label');
    label.className = 'gecko-form-label';
    label.textContent = labelText;

    let control: HTMLInputElement | HTMLTextAreaElement;
    if (multiline) {
      const textarea = document.createElement('textarea');
      textarea.rows = 2;
      textarea.className = 'gecko-form-input gecko-signature-textarea';
      control = textarea;
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'gecko-form-input';
      control = input;
    }
    control.placeholder = placeholder;
    control.value = value;
    group.append(label, control);
    body.appendChild(group);
    return control;
  };

  body.appendChild(desc);
  const nomeInput = makeField(
    'Nome completo do revisor (opcional)',
    'Ex.: Mariana Costa Silva — ou vazio para PDF preenchível',
    opts.initialNome ?? ''
  );
  const cargoInput = makeField(
    'Cargo / Função (opcional)',
    'Ex.: Analista de Documentação Técnica — ou vazio para PDF preenchível',
    opts.initialCargo ?? ''
  );
  const textoInput = makeField(
    'Mensagem de concordância (opcional — sobrescreve o padrão)',
    DEFAULT_SIGNATURE_TEXT,
    opts.initialTexto ?? '',
    true
  );

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'action-btn';
  cancelBtn.textContent = 'Cancelar';

  const insertBtn = document.createElement('button');
  insertBtn.type = 'button';
  insertBtn.className = 'action-btn primary';
  insertBtn.textContent = 'Inserir Bloco';

  actions.append(cancelBtn, insertBtn);
  panel.append(title, body, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  activeInsertSigOverlay = overlay;

  const close = (restoreFocus = true) => {
    if (activeInsertSigOverlay === overlay) {
      overlay.remove();
      activeInsertSigOverlay = null;
    }
    const layer = activeInsertSigLayer;
    activeInsertSigLayer = null;
    layer?.close({ restoreFocus });
  };

  const confirmInsert = () => {
    const snippet = formatSignatureMarkdownBlock({
      nome: nomeInput.value,
      cargo: cargoInput.value,
      texto: textoInput.value,
    });
    close(false);
    opts.onInsert(snippet);
  };

  cancelBtn.addEventListener('click', () => close(true));
  insertBtn.addEventListener('click', confirmInsert);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close(true);
  });

  const onInputKeyDown = (evt: Event) => {
    const e = evt as KeyboardEvent;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      confirmInsert();
    }
  };
  nomeInput.addEventListener('keydown', onInputKeyDown);
  cargoInput.addEventListener('keydown', onInputKeyDown);
  textoInput.addEventListener('keydown', onInputKeyDown);

  activeInsertSigLayer = pushLayer({
    id: 'insert-signature',
    element: panel,
    kind: 'modal',
    initialFocus: nomeInput,
    restoreFocusTo: opts.restoreFocusTo ?? undefined,
    onEscape: () => {
      close(true);
      return true;
    },
  });
}
