<div align="center">
  <h1>Gecko</h1>
  <p>Editor de texto e Markdown para desktop construído com Go (Wails v2) e TypeScript (CodeMirror 6).</p>
  <p>
    <a href="https://github.com/gabrielvfdelima/gecko/releases">Releases</a> ·
    <a href="CHANGELOG.md">Changelog</a> ·
    <a href="docs/README.md">Documentação Técnica</a>
  </p>
</div>

O Gecko trata o arquivo Markdown bruto no disco como fonte única da verdade. A interface renderiza títulos, tabelas, topologias e blocos de assinatura durante a leitura e revela a sintaxe original apenas na linha em edição, mantendo o executável único na faixa de 10 MB no Linux e 12 MB no Windows (e pacote universal no macOS) sem empacotar um navegador Chromium.

## Funcionalidades

### Editor Markdown e Workspaces

- **Live Preview por linha:** oculta marcadores de sintaxe (`#`, `**`, `*`, `` ` ``, citações e links) nas linhas inativas e exibe o Markdown puro assim que o cursor entra na linha.
- **Visualização de imagens integrada:** imagens Markdown (`![alt](caminho)`) e tags HTML (`<img>`) são exibidas diretamente no editor com inspeção em tela cheia (zoom e pan) e incorporadas na exportação em PDF, revelando o código original ao posicionar o cursor na linha.
- **Workspaces múltiplos na sidebar:** abra ou crie pastas de trabalho sem recarregar a janela, ordene por nome, data de modificação, criação ou arraste manualmente. Para limpar a área lateral sem apagar nenhum arquivo do disco, clique com o botão direito ou no menu de pastas e escolha `Remover Todos os Workspaces`.
- **Busca rápida e abas:** navegue entre documentos abertos pela barra de abas, use o Quick Open (`Ctrl + P`) para buscar arquivos nos workspaces ativos e reordene abas por arraste ou teclado.
- **Sincronização com disco:** o watcher baseado em `fsnotify` detecta alterações externas automaticamente e preserva edições não salvas no editor.
- **Ferramentas de escrita:** minimapa lateral em canvas, seleção multi-cursor (`Ctrl + Clique` ou `Ctrl + D`), alternância de quebra de linha (`LF` / `CRLF`), colagem com conversão de HTML para Markdown (`Ctrl + V`) ou texto puro (`Ctrl + Shift + V`), estatísticas em tempo real na barra de status e Modo Foco / Zen (`F11` ou `Alt + Z`).

### Topologias, Diagramas e Tabelas Interativas

- **Renderização nativa de diagramas:** blocos cercados ASCII/Unicode (como topologias com caixas `┌─┐` e setas `▼`/`─►`), gráficos de barras em texto e sintaxe Mermaid (`flowchart`, `sequenceDiagram` e `pie`) são convertidos em SVG diretamente no frontend. É possível aplicar zoom, arrastar, expandir em tela cheia e exportar cada diagrama para **PNG** ou **JPEG** no tema atual ou em fundo claro.
- **Tabelas GFM interativas:** tabelas Markdown aceitam `<br>` e formatação inline nas células, permitem redimensionar colunas arrastando as bordas (com retenção da largura por tabela), ampliação em modal e exportação direta para **PNG** ou **JPEG** respeitando as larguras ajustadas.

### Exportação para PDF e Bloco de Assinatura Digital

- **Exportação direta para PDF (`Ctrl + Shift + P` ou botão `PDF`):** gera arquivos `%PDF-1.4` com modal de pré-visualização, escolha entre tema Claro (papel) ou Escuro (paleta do editor), formato A4 ou Carta, numeração opcional no rodapé e camada de texto selecionável/pesquisável.
- **Tag de assinatura do revisor (` ```assinatura ` ou `Ctrl + Alt + A`):** insere um bloco padronizado contendo o termo de concordância, espaço reservado para assinatura eletrônica do gov.br, linha horizontal, nome completo e cargo. Quando `nome:` ou `cargo:` são deixados em branco no Markdown, o PDF gerado cria automaticamente campos **AcroForm preenchíveis** centralizados para preenchimento posterior em leitores de PDF antes da assinatura digital.

````markdown
```assinatura
nome: Mariana Costa Silva
cargo: Analista de Documentação Técnica
```

```assinatura
```
````

> O exemplo acima usa um bloco ` ````markdown ` para exibir a sintaxe literal no README. Em qualquer documento Markdown fora de blocos de código, digitar ```` ```assinatura ```` e pressionar `Enter` (ou usar `Ctrl + Alt + A`) cria o bloco completo e exibe o card visual ao mover o cursor para fora. Veja um documento completo pronto para teste em [docs/exemplo.md](docs/exemplo.md).


Campos suportados dentro do bloco `assinatura` (todos opcionais): `nome:`, `cargo:` e `texto:` (caso queira sobrescrever a frase padrão de concordância).

### Personalização Visual e Teclado

- **Paleta dinâmica (`Ctrl + ,`):** o seletor de cor calcula automaticamente tons de destaque, seleção, cabeçalhos e marcadores mantendo alto contraste.
- **Navegação integral por teclado:** alterne o foco entre sidebar, abas e editor com `F6` / `Shift + F6` e consulte o catálogo completo de comandos pressionando `F1`.

---

## Como Baixar e Executar

Os executáveis pré-compilados ficam disponíveis na página de [Releases](https://github.com/gabrielvfdelima/gecko/releases).

### macOS

Compatível com **macOS 10.13 ou superior** em processadores **Apple Silicon (M1/M2/M3/M4)** e **Intel** (binário universal). Utiliza o **WebKit (`WKWebView`)** nativo do sistema, sem dependências externas.

1. **Baixar o pacote:**
   Acesse a última versão em [Releases](https://github.com/gabrielvfdelima/gecko/releases) e baixe `gecko-macos-universal.dmg` (recomendado) ou `gecko-macos-universal.zip`.
2. **Instalar em Aplicativos:**
   - **Pelo `.dmg`:** abra o arquivo baixado e arraste `Gecko.app` para a pasta **Aplicativos** (`/Applications`).
   - **Pelo `.zip`:** descompacte o arquivo e mova `Gecko.app` para `/Applications`.
3. **Primeira execução (Gatekeeper):**
   Como o aplicativo ainda não é assinado com certificado Apple Developer, o macOS pode exibir um aviso informando que o desenvolvedor não pôde ser verificado na primeira abertura. Para liberar a execução, use uma das opções abaixo:
   - **Pela interface gráfica:** tente abrir o Gecko uma vez, acesse **Ajustes do Sistema > Privacidade e Segurança**, role até a seção de segurança e clique em **Abrir Mesmo Assim**. (Em versões anteriores do macOS, clique com o botão direito ou `Control + Clique` em `Gecko.app` e selecione **Abrir**.)
   - **Pelo Terminal:** remova o atributo de quarentena após mover o app para `/Applications`:
     ```bash
     xattr -cr /Applications/Gecko.app
     open /Applications/Gecko.app
     ```

### Windows

1. Acesse a última versão em [Releases](https://github.com/gabrielvfdelima/gecko/releases) e baixe o arquivo `gecko-windows-amd64.exe`.
2. Dê um duplo clique para executar. Não há instalador.
   - O aplicativo utiliza o componente **Microsoft Edge WebView2**, já presente por padrão no Windows 10 atualizado e no Windows 11. Em sistemas sem esse runtime, instale o pacote [WebView2 Runtime (Evergreen)](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) da Microsoft.
   - Caso o Windows Defender SmartScreen exiba o aviso de aplicativo desconhecido na primeira execução, clique em **Mais informações** e depois em **Executar assim mesmo**.

### Linux

1. **Dependências em tempo de execução:**
   A maioria dos ambientes desktop (GNOME, KDE, XFCE, etc.) já possui o GTK 3 e o WebKit2GTK 4.1 instalados. Em sistemas enxutos ou gerenciadores de janela leves (i3, Sway), instale os pacotes correspondentes à sua distribuição:

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

2. **Baixar e executar:**
   Baixe `gecko-linux-amd64` (binário direto) ou `gecko-linux-amd64.tar.gz` na página de [Releases](https://github.com/gabrielvfdelima/gecko/releases):

   ```bash
   # Caso tenha baixado o arquivo compactado (.tar.gz):
   tar -xzf gecko-linux-amd64.tar.gz && mv gecko gecko-linux-amd64

   # Dê permissão de execução e inicie:
   chmod +x gecko-linux-amd64
   ./gecko-linux-amd64
   ```

3. **Instalação opcional no sistema e menu de aplicativos:**
   ```bash
   sudo mv gecko-linux-amd64 /usr/local/bin/gecko

   mkdir -p ~/.local/share/applications
   cat << 'EOF' > ~/.local/share/applications/gecko.desktop
   [Desktop Entry]
   Name=Gecko
   Comment=Editor de texto e Markdown
   Exec=gecko
   Icon=text-editor
   Terminal=false
   Type=Application
   Categories=Utility;TextEditor;Development;
   EOF
   ```

---

## Atalhos Principais

Pressione `F1` dentro do aplicativo para abrir o catálogo pesquisável completo. No macOS, substitua `Ctrl` por `⌘` (Command) e `Alt` por `⌥` (Option), exceto em `Ctrl + Tab` para alternar abas.

| Atalho | Ação |
|---|---|
| `Ctrl + S` | Salvar arquivo ativo |
| `Ctrl + Shift + S` | Salvar como |
| `Ctrl + Shift + P` | Pré-visualizar e exportar para PDF |
| `Ctrl + Alt + A` | Inserir bloco de assinatura digital (` ```assinatura `) |
| `Ctrl + P` | Busca rápida de arquivos (Quick Open) |
| `Ctrl + Alt + N` | Novo arquivo Markdown no workspace |
| `Ctrl + T` / `Ctrl + W` | Nova aba / Fechar aba ativa |
| `F11` ou `Alt + Z` | Alternar Modo Foco / Zen |
| `Ctrl + \` | Mostrar ou ocultar a barra lateral |
| `F6` / `Shift + F6` | Alternar foco entre Sidebar, Abas e Editor |
| `Ctrl + ,` | Abrir seletor de cor principal |
| `F1` | Abrir catálogo de atalhos |
| `Escape` | Fechar modal/menu ou sair do Modo Zen |

---

## Compilação a partir do Código-Fonte

### Pré-requisitos

- Go 1.22 ou superior
- Node.js 18 ou superior e `npm`
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation):
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```
- No **macOS**, Xcode Command Line Tools (`xcode-select --install`).
- No **Linux**, pacotes de desenvolvimento GTK 3 e WebKit2GTK 4.1:
  - **Debian / Ubuntu:** `sudo apt update && sudo apt install -y build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev`
  - **Fedora / RHEL:** `sudo dnf install -y gcc pkg-config gtk3-devel webkit2gtk4.1-devel`
  - **Arch Linux:** `sudo pacman -S --needed base-devel pkgconf gtk3 webkit2gtk-4.1`
  - **openSUSE:** `sudo zypper install -y patterns-devel-base-devel_basis pkg-config gtk3-devel webkit2gtk-4_1-devel`

### Desenvolvimento e Build

```bash
cd frontend && npm install && cd ..

# Desenvolvimento com hot reload:
wails dev -tags webkit2_41   # Linux
wails dev                    # Windows e macOS

# Build de produção (gerado em build/bin/):
wails build -tags webkit2_41 -ldflags "-s -w"   # Linux
wails build                                     # Windows
wails build -platform darwin/universal          # macOS (Intel + Apple Silicon)
```

### Testes

```bash
go test -v ./...
npm --prefix frontend run build
```

---

## Documentação Técnica e Licença

Contribuições são bem-vindas e devem respeitar as diretrizes arquiteturais descritas em [docs/README.md](docs/README.md) (desempenho, baixo consumo e ausência de dependências supérfluas). Distribuído sob a licença MIT.
