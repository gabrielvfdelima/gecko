# Gecko

> **Editor de texto e Markdown desktop ultrarrápido, leve e nativo.**  
> Desenvolvido em **Go 1.22+ (Wails v2)**, **TypeScript** e **CodeMirror 6**, inspirado na ergonomia do VS Code / Sublime Text, com estética estritamente utilitária em tons de grafite e Verde Gecko.

---

## 🦎 Características Principais

- **Shell Desktop Nativo & Frameless**: Janela sem moldura nativa com barra de título unificada de 36px, controles integrados (minimizar, maximizar/restaurar, fechar), redimensionamento pelas bordas e proteção contra perda de alterações não salvas ao sair (`Alt+F4` ou botão fechar).
- **Motor CodeMirror 6 Modular**: Buffer contínuo mantendo o Markdown bruto como fonte única da verdade, com seleção multi-cursor (`Ctrl + Clique`) visível mesmo na linha ativa e dentro de código inline.
- **Hybrid Markdown Live Preview**: Oculta marcadores de sintaxe (`#`, `**`, `*`, `` ` ``, `~~`, links) e substitui marcadores de lista por bullet `•` nas linhas sem cursor. A sintaxe bruta é revelada instantaneamente na linha onde o cursor estiver posicionado, eliminando saltos de layout.
- **Gerenciamento Avançado de Abas e Arquivos**:
  - **Barra Superior de Abas**: Indicador de alterações não salvas (`•`), reordenação por **arrastar e soltar** (mouse) ou atalho (`Ctrl + Shift + PageUp / PageDown`), renomeação inline (duplo clique no título) e exclusão com confirmação diretamente pela aba.
  - **Sidebar de Pastas**:
    - Seleção única consistente com navegação completa por teclado (`↑`, `↓`, `←`, `→`, `Enter`, `F2` para renomear, `Delete` / `Backspace` para excluir).
    - **Ordenação Flexível**: Por Nome (A–Z), Data de Modificação (`mtime`), Data de Criação (`btime` via syscall `statx`), ou **Ordem Manual** persistida em `~/.config/gecko/settings.json`.
    - **Drag-and-Drop Completo**: Arraste itens para reordenar manualmente dentro da mesma pasta ou solte sobre uma pasta para mover o arquivo/diretório no disco.
    - **Feedback Real de Refresh**: Estado ativo no botão de atualização, contagem de itens com horário na barra de status e confirmação visual de 150ms.
- **Observação em Tempo Real (`fsnotify`)**: Detecção de alterações externas no disco com debounce de 200ms em goroutine, recarregando abas sem alterações e protegendo buffers modificados.
- **Preservação de Formato**: Detecção e preservação automática da quebra de linha original (`LF` ou `CRLF`), com alternador manual na barra de status.
- **Anti-AI Design Patterns**: Geometria reta (`border-radius: 0px` em painéis e abas), paleta sóbria (Grafite `#181818` / `#1E1E1E` e Verde `#2EA043` / `#6BC46D`), zero gradientes, sem glassmorphism e sem atrasos artificiais.

---

## 🛠️ Stack Tecnológica

| Componente | Tecnologia |
|---|---|
| **Backend & Shell Desktop** | Go 1.22+ & [Wails v2](https://wails.io) |
| **Watcher de Arquivos** | `github.com/fsnotify/fsnotify` (com debounce de 200ms) |
| **Metadados de Sistema** | `golang.org/x/sys/unix` (`statx` para `btime` e `mtime`) |
| **Frontend** | Vanilla TypeScript + Vite |
| **Motor de Edição** | CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/lang-markdown`, etc.) |

---

## 📋 Pré-requisitos

Antes de iniciar, certifique-se de ter instalado no sistema:

1. **Go** (versão 1.22 ou superior): [https://go.dev/dl/](https://go.dev/dl/)
2. **Node.js** (versão 18+ recomendada) e **npm**: [https://nodejs.org/](https://nodejs.org/)
3. **Wails CLI v2**:
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```
   *(Certifique-se de que `$HOME/go/bin` esteja no seu `$PATH`)*

4. **Bibliotecas de Sistema (Linux)**:
   - **Fedora / RHEL**:
     ```bash
     sudo dnf install gcc pkg-config gtk3-devel webkit2gtk4.1-devel
     ```
   - **Debian / Ubuntu**:
     ```bash
     sudo apt update && sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
     ```
   - **Arch Linux**:
     ```bash
     sudo pacman -S base-devel pkgconf gtk3 webkit2gtk-4.1
     ```

---

## 📦 Instalação das Dependências

Clone ou acesse a pasta raiz do projeto:

```bash
cd gecko-text
```

1. **Dependências do Go**:
   ```bash
   go mod tidy
   ```

2. **Dependências do Frontend**:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

---

## 🚀 Execução em Desenvolvimento

### Modo Desktop Completo (Wails Dev)
Executa a aplicação com recarregamento a quente (Hot-Reloading) tanto para alterações no Go quanto no frontend TypeScript/CSS:

```bash
wails dev
```

> [!IMPORTANT]
> Não execute `npm run dev` e `wails dev` simultaneamente. O comando `wails dev` já inicia o servidor Vite internamente e conecta os bindings do Go à janela desktop.

---

## 🧪 Testes Automatizados

### Testes Unitários do Backend Go
Valida o comportamento da árvore recursiva, metadados `ModTime`/`BirthTime`, proteção contra movimentação de pasta para dentro de si mesma, persistência atômica de configurações (`~/.config/gecko/settings.json`), extensão automática `.md` e quebras de linha `CRLF` / `LF`:

```bash
go test -v ./...
```

### Validação de Tipos e Build do Frontend
Executa a checagem rigorosa de tipos TypeScript e a compilação via Vite:

```bash
cd frontend
npm run build
cd ..
```

### Auditoria de Estilo (Anti-AI Design Patterns)
Garante que nenhum padrão proibido (gradientes, sombras néon, blur ou cores fora da identidade técnica) esteja no CSS:

```bash
grep -iE "gradient|backdrop-filter|box-shadow|purple|violet|indigo|blue" frontend/src/style.css || echo "✓ Estilos 100% em conformidade com as regras utilitárias."
```

---

## 🏗️ Geração do Build Executável (Produção)

Para gerar o binário nativo final autônomo com toda a interface gráfica embutida e o backend Go integrado em um único arquivo:

### Build de Produção Completo (Recomendado)
```bash
wails build
```

### Build com Binário Reduzido (Strip de Símbolos Go)
Se desejar reduzir o tamanho final do executável removendo símbolos de debug do compilador Go:
```bash
wails build -ldflags "-s -w"
```

> [!WARNING]
> No CLI do Wails, a flag curta `-s` significa *Skip Frontend* (pula a compilação do frontend). Use sempre `wails build` (ou com `-ldflags "-s -w"`) para garantir que o frontend seja compilado e embutido.

### Localização do Executável Gerado
O executável final é gerado em `build/bin/`:
```bash
# Executar a aplicação desktop nativa:
./build/bin/gecko
```

---

## ⌨️ Tabela de Atalhos (Keybindings)

### Atalhos do Editor (CodeMirror 6)
Todos os atalhos abaixo possuem suporte **multi-cursor simultâneo**:

| Atalho | Ação |
|---|---|
| `Ctrl + N` ou `Ctrl + B` | Alternar Negrito (`**texto**`) |
| `Ctrl + I` | Alternar Itálico (`*texto*`) |
| `Ctrl + E` | Alternar Código Inline (`` `texto` ``) |
| `Alt + Shift + D` | Alternar Rasurado (`~~texto~~`) |
| `Ctrl + K` | Transformar seleção em Link Markdown (`[texto](https://)`) |
| `Ctrl + 1` | Alternar cabeçalho de nível 1 (`# `) |
| `Ctrl + 2` | Alternar cabeçalho de nível 2 (`## `) |
| `Ctrl + 3` | Alternar cabeçalho de nível 3 (`### `) |
| `Ctrl + D` | Selecionar a próxima ocorrência da palavra atual |
| `Alt + ↑` / `Alt + ↓` | Mover linha/bloco para cima ou para baixo |
| `Tab` / `Shift + Tab` | Indentar / Recuar indentação (níveis de lista/código) |
| `Ctrl + Clique` | Adicionar múltiplos cursores independentes |

### Atalhos da Sidebar (Quando a Árvore tem Foco)

| Atalho | Ação |
|---|---|
| `F2` | Renomear arquivo ou pasta selecionada |
| `Delete` ou `Backspace` | Excluir arquivo ou pasta selecionada (com confirmação) |
| `↑` / `↓` | Navegar entre itens visíveis da árvore |
| `→` / `←` | Expandir / Recolher pasta selecionada |
| `Enter` | Abrir arquivo e focar o editor (ou alternar pasta) |

### Atalhos Globais do Sistema & Workbench

| Atalho | Ação |
|---|---|
| `Ctrl + S` | Gravar o arquivo ativo no disco via Go |
| `Ctrl + Alt + N` | Criar novo arquivo Markdown `.md` na pasta aberta |
| `Ctrl + P` | Abrir paleta rápida (*Fuzzy Finder*) para buscar e trocar de arquivo |
| `Ctrl + Shift + PageUp` | Mover a aba ativa para a esquerda |
| `Ctrl + Shift + PageDown` | Mover a aba ativa para a direita |
| `Ctrl + \` | Alternar visibilidade da barra lateral de pastas |
| `Esc` | Cancelar arraste ou fechar menus de contexto, modais e busca rápida |

---

## 📁 Estrutura do Projeto

```text
gecko-text/
├── docs/                         # Documentação canônica para agentes de IA e desenvolvedores
│   ├── README.md                 # Hub central e fluxo de validação
│   ├── anti-ai-design-patterns.md# Regras estritas de design anti-AI e enum de proibições
│   ├── filosofia-gecko.md        # Princípios de ultra-velocidade e peso ultra-leve (< 12MB)
│   └── arquitetura-e-convencoes.md# Detalhes de backend Go, CodeMirror 6 e CSS
├── main.go                       # Bootstrap Wails v2 frameless, ícone Linux, embed.FS e ciclo de vida
├── app.go                        # Métodos Go expostos ao frontend (I/O, File Tree, fsnotify, OnBeforeClose)
├── filetime_linux.go             # Leitura de mtime e btime via syscall unix.Statx no Linux
├── filetime_other.go             # Fallback de timestamps para outras plataformas
├── settings.go                   # Persistência atômica em ~/.config/gecko/settings.json
├── app_test.go                   # Testes unitários do backend Go
├── wails.json                    # Configuração de build e lifecycle do Wails
├── go.mod / go.sum               # Módulos Go (Wails v2, fsnotify, x/sys)
├── build/
│   ├── appicon.png               # Ícone 512x512 da janela nativa
│   └── bin/
│       └── gecko                 # Executável nativo final compilado
└── frontend/
    ├── index.html                # Estrutura HTML do Workbench (Sidebar, Barra Unificada, Editor, Statusbar)
    ├── package.json              # Dependências npm (CodeMirror 6, TypeScript, Vite)
    ├── tsconfig.json             # Configuração estrita do TypeScript
    ├── vite.config.ts            # Configuração do Vite para build webview
    ├── dist/                     # Assets compilados embutidos no binário Go
    ├── src/
    │   ├── style.css             # Tokens visuais e regras Anti-AI em Verde Gecko
    │   ├── main.ts               # Estado da UI, abas, ordenação, foco na árvore e bindings Wails
    │   ├── dragReorder.ts        # Utilitário leve de Pointer Events para reordenar abas e árvore
    │   ├── assets/
    │   │   └── gecko-logo.png    # Logo 64x64 otimizado para o cabeçalho da sidebar
    │   └── editor/
    │       ├── setup.ts          # Instanciação do CodeMirror 6, seleção translúcida e listeners
    │       ├── hybridMarkdown.ts # ViewPlugin para Live Preview de Markdown (.md)
    │       └── shortcuts.ts      # Comandos e keymaps multi-cursor
    └── wailsjs/                  # Bindings TypeScript autogerados pelo Wails (não editar manualmente)
```

---

## 🛡️ Licença

Projeto desenvolvido sob licença MIT. Sinta-se livre para customizar e evoluir o Gecko.
