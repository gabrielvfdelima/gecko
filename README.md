# Gecko

Editor de texto e Markdown para desktop com foco em velocidade, baixo consumo de recursos e interface utilitária. Construído com Go ([Wails v2](https://wails.io)) e TypeScript ([CodeMirror 6](https://codemirror.net/)).

## Recursos

- **Visualização híbrida:** oculta marcadores de sintaxe Markdown nas linhas inativas e os revela na linha do cursor, sem quebras de layout.
- **Topologias e diagramas nativos:** renderização SVG instantânea para diagramas ASCII/Unicode, fluxogramas, sequências e gráficos (incluindo blocos Mermaid), com zoom, arrastar (pan) e modal ampliado sem editar o texto.
- **Tabelas GFM interativas:** renderização com suporte a `<br>` inline, redimensionamento manual e persistente da largura das colunas e visualizador ampliado em modal.
- **Exportação de documentos e gráficos:** exportação do arquivo Markdown para PDF (`Ctrl + Shift + P` ou botão `PDF` na barra superior) com pré-visualização, formatos A4/Carta, temas claro/escuro e texto pesquisável; exportação direta de topologias e tabelas para PNG e JPEG (tema atual ou fundo claro).
- **Modo Foco / Zen (`F11` ou `Alt + Z`):** oculta barras laterais, abas, minimapa e molduras para escrita sem distrações. Pressione `Escape` para retornar.
- **Estatísticas em tempo real:** contagem de palavras e caracteres (com e sem espaços) do documento ou do texto selecionado na barra de status.
- **Navegação por arquivos:** suporte a múltiplos workspaces, ordenação flexível (nome, data ou ordem manual) e arrastar-e-soltar de arquivos e abas.
- **Sincronização com disco:** observação de alterações externas via `fsnotify` com proteção contra perda de edições.
- **Edição avançada:** suporte a multi-cursor (`Ctrl + Clique`), quebras de linha `LF` e `CRLF`, e minimapa interativo.
- **Personalização sóbria:** seletor de cor de destaque (`Ctrl + ,`) e paleta de alto contraste.
- **Acessibilidade de teclado:** navegação completa por atalhos, com catálogo integrado (`F1`).

## Instalação

### Baixar Binários Pré-compilados (Releases)

Você pode obter os executáveis prontos para uso diretamente na página de [Releases](https://github.com/gabrielvfdelima/gecko/releases).

#### Windows
Baixe o arquivo `gecko-windows-amd64.exe` e execute diretamente.

#### Linux

1. **Dependências em tempo de execução:**
   A maioria dos ambientes desktop padrão (GNOME, etc.) já inclui essas bibliotecas. Em instalações mínimas ou gerenciadores de janelas leves (ex: i3, Sway), instale o GTK 3 e o WebKit2GTK 4.1 de acordo com a sua distribuição:

   - **Debian / Ubuntu / Linux Mint / Pop!_OS:**
     ```bash
     sudo apt update && sudo apt install -y libgtk-3-0 libwebkit2gtk-4.1-0
     ```
   - **Fedora / RHEL / CentOS Stream:**
     ```bash
     sudo dnf install -y gtk3 webkit2gtk4.1
     ```
   - **Arch Linux / Manjaro:**
     ```bash
     sudo pacman -S --needed gtk3 webkit2gtk-4.1
     ```
   - **openSUSE (Tumbleweed / Leap):**
     ```bash
     sudo zypper install -y libgtk-3-0 libwebkit2gtk-4_1-0
     ```

2. **Executar ou Instalar o Binário:**
   ```bash
   # Dê permissão de execução ao binário baixado:
   chmod +x gecko-linux-amd64

   # Para rodar diretamente:
   ./gecko-linux-amd64

   # (Opcional) Instalar globalmente no sistema:
   sudo mv gecko-linux-amd64 /usr/local/bin/gecko
   ```

3. **(Opcional) Criar atalho no lançador de aplicativos (`.desktop`):**
   ```bash
   mkdir -p ~/.local/share/applications
   cat << 'EOF' > ~/.local/share/applications/gecko.desktop
   [Desktop Entry]
   Name=Gecko
   Comment=Editor de texto e Markdown utilitário
   Exec=gecko
   Icon=text-editor
   Terminal=false
   Type=Application
   Categories=Utility;TextEditor;Development;
   EOF
   ```

## Pré-requisitos (Compilação Local)

- Go 1.22 ou superior
- Node.js 18 ou superior e npm
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation):
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```

### Dependências de sistema no Linux (Desenvolvimento)

- **Debian / Ubuntu:**
  ```bash
  sudo apt update && sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
  ```
- **Fedora / RHEL:**
  ```bash
  sudo dnf install gcc pkg-config gtk3-devel webkit2gtk4.1-devel
  ```
- **Arch Linux:**
  ```bash
  sudo pacman -S base-devel pkgconf gtk3 webkit2gtk-4.1
  ```
- **openSUSE:**
  ```bash
  sudo zypper install patterns-devel-base-devel_basis pkg-config gtk3-devel webkit2gtk-4_1-devel
  ```

## Desenvolvimento

Para instalar as dependências do frontend e iniciar a aplicação em modo de desenvolvimento com recarregamento a quente:

```bash
cd frontend && npm install && cd ..

# No Linux (com WebKit2GTK 4.1):
wails dev -tags webkit2_41

# No Windows:
wails dev
```

## Compilação

Para gerar o binário de produção:

```bash
# Compilar para Linux (com WebKit2GTK 4.1):
wails build -tags webkit2_41

# Compilar para Windows:
wails build

# Opcional: remover símbolos de depuração para reduzir o tamanho do executável
wails build -tags webkit2_41 -ldflags "-s -w"
```

O executável é gerado no diretório `build/bin/`.

## Testes

```bash
# Testes do backend Go
go test -v ./...

# Checagem de tipos e build do frontend
npm --prefix frontend run build
```

## Atalhos Principais

Pressione `F1` no aplicativo para visualizar o mapa completo de atalhos. Os comandos mais frequentes incluem:

| Atalho | Ação |
|---|---|
| `Ctrl + S` | Salvar arquivo ativo |
| `Ctrl + Shift + P` | Pré-visualizar e exportar documento para PDF |
| `Ctrl + P` | Busca rápida de arquivos (Quick Open) |
| `F11` ou `Alt + Z` | Alternar Modo Foco / Zen |
| `Ctrl + \` | Alternar visibilidade da barra lateral |
| `Ctrl + Alt + N` | Criar novo arquivo Markdown |
| `Ctrl + ,` | Configurar cor principal |
| `F1` | Exibir catálogo de atalhos |
| `Escape` | Fechar modal, menu ou sair do Modo Zen |

## Licença e Contribuições

Distribuído sob a licença MIT. Contribuições são bem-vindas; a única exigência para a aceitação de alterações é o cumprimento estrito da [Filosofia Gecko](docs/filosofia-gecko.md).
