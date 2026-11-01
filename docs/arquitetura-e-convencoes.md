# Arquitetura e Convenções Técnicas do Gecko

## 1. Visão Geral da Arquitetura

O Gecko é estruturado em duas camadas estritamente desacopladas, comunicando-se por chamadas IPC assíncronas providas pelo **Wails v2**:

```
┌────────────────────────────────────────────────────────┐
│                   GECKO TEXT EDITOR                    │
├──────────────────────────┬─────────────────────────────┤
│   BACKEND (Go 1.22+)     │   FRONTEND (TypeScript)     │
│                          │                             │
│ • main.go: Ciclo de vida │ • main.ts: Abas, modais,    │
│ • app.go: API de I/O     │   árvore de arquivos, IPC   │
│ • settings.go: JSON      │ • editor/setup.ts: CM6      │
│ • fsnotify: Watcher      │ • editor/hybridMarkdown.ts  │
│ • Wails Runtime          │ • editor/shortcuts.ts       │
│                          │ • editor/clipboardMarkdown  │
│                          │ • editor/minimap.ts         │
└─────────────┬────────────┴───────────────┬─────────────┘
              │       IPC Wails (JSON)     │
              └────────────────────────────┘
```

---

## 2. Camada Backend (Go)

### Arquivos Principais
- [`main.go`](file:///home/gabrielveloso/Documents/projetos-pessoais/gecko-text/main.go): Ponto de entrada, configuração da janela Wails frameless (36px titlebar), dimensões iniciais (1200x800) e registro do ciclo de vida da aplicação.
- [`app.go`](file:///home/gabrielveloso/Documents/projetos-pessoais/gecko-text/app.go): Estruturas de dados e métodos exportados para o frontend.
  - `ListSystemDirectory(dirPath string)`: Leitura instantânea e não-recursiva de pastas no disco (< 0.2ms).
  - `CreateDirectoryAtPath(parentDir, folderName string)`: Criação segura de pastas em qualquer caminho.
  - `GetClipboardText()` / `SetClipboardText()`: Acesso nativo ao clipboard do sistema via GTK.
  - `SaveFileContent()` / `ReadFileContent()`: Leitura e escrita atômica com preservação de quebra de linha (LF/CRLF).
  - `GetFileTree()`: Montagem de árvore de arquivos para os workspaces ativos.
- [`settings.go`](file:///home/gabrielveloso/Documents/projetos-pessoais/gecko-text/settings.go): Persistência de preferências do usuário em `~/.config/gecko/settings.json`.
- [`app_test.go`](file:///home/gabrielveloso/Documents/projetos-pessoais/gecko-text/app_test.go): Testes unitários para árvores, configurações, multi-workspace e navegação de diretórios.

### Regras do Backend
1. **Sem Bibliotecas Pesadas**: Utilize a biblioteca padrão do Go sempre que possível.
2. **I/O Não-Bloqueante**: Watchers de sistema de arquivos devem rodar em goroutines separadas com canais e debounce (`time.AfterFunc` ou `select`).
3. **Mantenha os Testes Verdes**: Qualquer novo método exportado para o Wails em `app.go` deve ter teste unitário correspondente em `app_test.go` (`go test -v ./...`).

---

## 3. Camada Frontend (TypeScript + CodeMirror 6)

### Estrutura de Módulos
```
frontend/src/
├── index.html                 # Estrutura do workbench (sidebar, editor, statusbar)
├── main.ts                    # Inicialização, abas, file tree, modais integrados
├── style.css                  # Tokens CSS, layout e temas
├── keyboard/                  # Sistema modular unificado de navegação por teclado
│   ├── index.ts               # API pública (re-exports)
│   ├── focusUtils.ts          # getFocusable (visibilidade real), FocusMemory, isTextInput
│   ├── keybindings.ts         # Parser de atalhos ("Mod-Shift-e", "F6", "Shift-F10")
│   ├── dispatcher.ts          # Listener keydown único (capture) -> camadas -> atalhos globais
│   ├── layers.ts              # Pilha de camadas (modal, quick-open, context-menu) + Tab trap
│   ├── listNavigator.ts       # Controlador genérico de listas (roving / virtual + type-ahead)
│   └── regions.ts             # Regiões persistentes do workbench + ciclo F6 / Shift+F6
├── theme/                     # Motor de cores dinâmico e modal de personalização
│   ├── colorEngine.ts         # Conversão HEX/RGB/HSL/HSV e derivação matemática dos sub-tons
│   └── colorModal.ts          # Modal industrial com roda 2D Canvas, brilho, HEX/RGB e preview
└── editor/
    ├── setup.ts               # Montagem das extensões do CodeMirror 6
    ├── hybridMarkdown.ts      # Live preview híbrido (tabelas, HR, títulos, links)
    ├── shortcuts.ts           # Atalhos de teclado (formatação, blocos, indentação)
    ├── clipboardMarkdown.ts   # Smart paste (HTML -> Markdown puro e plain text)
    └── minimap.ts             # Minimapa canvas ultrarrápido de 60px
```

### Regras do Frontend
1. **Zero Frameworks**: Não instale React, Vue, Svelte ou bibliotecas de componentes. Mantenha o DOM enxuto com TypeScript nativo.
2. **CodeMirror 6 como Buffer da Verdade**:
   - Nunca modifique o texto do editor alterando diretamente o DOM.
   - Utilize sempre `view.dispatch({ changes: ... })` ou transações imutáveis.
   - O Markdown bruto é a fonte canônica. Decorações e widgets nunca alteram o conteúdo do buffer, apenas como ele é desenhado na tela.
3. **Navegação de Modais**:
   - Utilize a fábrica unificada `createGeckoDirectoryBrowser` para modais de arquivos e workspaces.
   - Garanta suporte completo a teclado em todo o ciclo de vida do modal:
     - `↑` e `↓` (além de `PageUp` / `PageDown` e `Home` / `End`): navegam verticalmente entre as linhas com rolagem automática (`scrollIntoView({ block: "nearest" })`), mesmo quando o foco estiver em inputs de nome ou no painel.
     - `Enter`: entra em subpastas no modo computador ou confirma e abre o item selecionado (em inputs de nome, `Enter` executa a ação primária imediatamente; em botões internos do modal, `Enter` aciona o próprio botão).
     - `Backspace`: sobe um nível (`..`) no modo computador quando o filtro de texto estiver vazio ou quando o foco estiver fora de inputs.
     - `Esc`: fecha o modal ou cancela a criação inline de pasta sem fechar o modal.
     - `←` e `→`: alternam instantaneamente entre as abas `[Workspaces]` e `[Computador]` quando o campo de filtro estiver vazio.
4. **Contrato de Navegação por Teclado para Novas Features (`frontend/src/keyboard/`)**:
   - **Proibido adicionar `window.addEventListener("keydown", ...)` avulso**: todo o despacho global passa por `initKeyboardDispatcher()` em `keyboard/dispatcher.ts`.
   - **Novo Modal ou Overlay**: utilize `openModal(...)` ou registre na pilha via `pushLayer({ id, element, kind, initialFocus, onEscape, onKeyDown })`. A camada gerencia automaticamente o *Focus Trap* (`Tab` / `Shift+Tab` filtrando elementos `.hidden` via `getFocusable`), o bloqueio de atalhos globais de fundo e a restauração resiliente de foco via `FocusMemory` (inclusive em modais encadeados).
   - **Nova Lista, Menu ou Barra de Abas**: utilize `createListNavigator({...})` (`mode: "roving"` para itens que recebem foco direto como abas/menus; `mode: "virtual"` quando o foco permanece em um `<input>` ou container como Quick Open, Directory Browser e File Tree).
   - **Novo Atalho Global**: registre em `registerKeybindings([...])` usando a notação `"Mod-Shift-x"`, `"F6"`, etc.
   - **Nova Região Persistente do Workbench**: registre via `registerRegion({ id, order, getRoot, isAvailable, focus })` para integrar automaticamente ao ciclo `F6` / `Shift+F6`.

---

## 4. Camada de Estilo (CSS)

- O arquivo [`frontend/src/style.css`](file:///home/gabrielveloso/Documents/projetos-pessoais/gecko-text/frontend/src/style.css) centraliza toda a aparência do Gecko.
- **Variáveis Principais (Dinâmicas via `theme/colorEngine.ts`)**:
  - `--bg-workbench: #181818`: Fundo do shell, barra de título e sidebar.
  - `--bg-editor: #1E1E1E`: Fundo da área de edição de texto.
  - `--brand-color: #4CF00C`: Cor principal vibrante do logo SVG e do título `"Gecko"`.
  - `--bg-selection: #1F4429`: Fundo de linhas selecionadas (derivado automaticamente de `--brand-color`).
  - `--border-subtle: #2B2B2B`: Linhas divisórias sólidas de 1px.
  - `--accent-primary: #2EA043`: Cor de acento UI para focos, seleções ativas e indicadores (derivada de `--brand-color`).
  - `--accent-hover: #238636`: Estado hover/ativo do acento primário (derivado de `--brand-color`).
  - `--md-heading: #6BC46D`: Tom claro para cabeçalhos e destaques de Markdown (derivado de `--brand-color`).
  - `--md-marker: #85B66E`: Tom marcador para símbolos `#`, `>`, `---`, `*` (derivado de `--brand-color`).
- **Regra de Raios**:
  - `border-radius: 0px` para painéis, caixas, modais, abas e minimapa.
  - `border-radius: 2px` apenas para botões interativos e campos de input.
