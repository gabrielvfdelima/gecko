# Gecko

Editor de texto e Markdown para desktop com foco em velocidade, baixo consumo de recursos e interface utilitária. Construído com Go ([Wails v2](https://wails.io)) e TypeScript ([CodeMirror 6](https://codemirror.net/)).

## Recursos

- **Visualização híbrida:** oculta marcadores de sintaxe Markdown nas linhas inativas e os revela na linha do cursor, sem quebras de layout.
- **Modo Foco / Zen (`F11` ou `Alt + Z`):** oculta barras laterais, abas, minimapa e molduras para escrita sem distrações. Pressione `Escape` para retornar.
- **Estatísticas em tempo real:** contagem de palavras e caracteres (com e sem espaços) do documento ou do texto selecionado na barra de status.
- **Navegação por arquivos:** suporte a múltiplos workspaces, ordenação flexível (nome, data ou ordem manual) e arrastar-e-soltar de arquivos e abas.
- **Sincronização com disco:** observação de alterações externas via `fsnotify` com proteção contra perda de edições.
- **Edição avançada:** suporte a multi-cursor (`Ctrl + Clique`), quebras de linha `LF` e `CRLF`, e minimapa interativo.
- **Personalização sóbria:** seletor de cor de destaque (`Ctrl + ,`) e paleta de alto contraste.
- **Acessibilidade de teclado:** navegação completa por atalhos, com catálogo integrado (`F1`).

## Pré-requisitos

- Go 1.22 ou superior
- Node.js 18 ou superior e npm
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation):
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```

### Dependências de sistema no Linux

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

## Desenvolvimento

Para instalar as dependências do frontend e iniciar a aplicação em modo de desenvolvimento com recarregamento a quente:

```bash
cd frontend && npm install && cd ..
wails dev
```

## Compilação

Para gerar o binário de produção:

```bash
# Compilar para o sistema atual (Linux ou Windows)
wails build

# Opcional: remover símbolos de depuração para reduzir o tamanho do executável
wails build -ldflags "-s -w"
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
| `Ctrl + P` | Busca rápida de arquivos (Quick Open) |
| `F11` ou `Alt + Z` | Alternar Modo Foco / Zen |
| `Ctrl + \` | Alternar visibilidade da barra lateral |
| `Ctrl + Alt + N` | Criar novo arquivo Markdown |
| `Ctrl + ,` | Configurar cor principal |
| `F1` | Exibir catálogo de atalhos |
| `Escape` | Fechar modal, menu ou sair do Modo Zen |

## Licença e Contribuições

Distribuído sob a licença MIT. Contribuições são bem-vindas; a única exigência para a aceitação de alterações é o cumprimento estrito da [Filosofia Gecko](docs/filosofia-gecko.md).
