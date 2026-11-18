# Changelog

Todas as mudanças notáveis do **Gecko** são documentadas neste arquivo.

## [v1.4.0] - 2026-11-18

### Adicionado
- **Suporte oficial ao macOS (Apple Silicon e Intel):**
  - Configuração nativa de janela no `main.go` (`mac.TitleBarHiddenInset()`, `NSAppearanceNameDarkAqua`, `DisableEscapeExitsFullscreen` e menu nativo com `EditMenu` para `⌘C`/`⌘V`/`⌘X`/`⌘A`/`⌘Z` e `⌘Q`).
  - Leitura nativa de timestamps de criação/modificação de arquivos no macOS (`filetime_darwin.go`).
  - Adaptação da interface para os controles de janela nativos do macOS (espaçamento para os botões no canto superior esquerdo e ocultação dos controles customizados) e formatação automática de atalhos com `⌘`, `⌥` e `⌫`.
  - Job `build-macos` no workflow de release gerando pacote universal (`gecko-macos-universal.dmg` e `gecko-macos-universal.zip`) e tutorial de instalação no [README.md](README.md).
- **Visualização de imagens integrada:**
  - Exibição inline de imagens Markdown e tags `<img>` no editor com modal de inspeção (zoom/pan) e incorporação na exportação para PDF.

## [v1.3.0] - 2026-11-17

### Adicionado
- **Bloco de Assinatura Digital do Revisor (` ```assinatura `):**
  - Nova sintaxe cercada GFM (`assinatura` / `signature`) com campos opcionais `nome:`, `cargo:` e `texto:`.
  - Card de Live Preview no editor exibindo o termo de concordância em itálico, espaço reservado para assinatura eletrônica **gov.br**, linha de assinatura centralizada, nome completo e cargo (com alternância para o Markdown bruto ao entrar no bloco, dar duplo clique ou clicar em **Editar**).
  - Inserção rápida via atalho `Ctrl + Alt + A` ou menu de contexto do editor (**Inserir Bloco de Assinatura...**), com modal leve permitindo preencher Nome, Cargo e Mensagem personalizada (ou confirmar em branco com `Enter`).
  - Exportação PDF com **campos AcroForm (`/FT /Tx`) preenchíveis nativos** quando `nome` e/ou `cargo` são deixados vazios no Markdown (alinhamento centralizado `/Q 1`, fontes `/HelvOb` itálica para nome e `/Helv` regular para cargo, `/NeedAppearances true`, flag de impressão `/F 4` e preservação do bloco inteiro na mesma página).
- **Remover Todos os Workspaces:**
  - Nova ação **Remover Todos os Workspaces** no menu do botão de workspaces da sidebar, no menu de contexto dos cabeçalhos de workspace e na área vazia da árvore de arquivos.
  - Remoção paralela dos watchers no backend Go (`RemoveWorkspaceRoot`), fechamento seguro das abas dos workspaces (preservando arquivos no disco) e verificação de alterações não salvas antes de concluir.

### Corrigido
- Normalização de códigos físicos de tecla (`KeyA..KeyZ`) em `keybindings.ts`, garantindo o funcionamento de atalhos com `Ctrl + Alt` independentemente do layout de teclado.

## [v1.2.0] - 2026-11-13

### Adicionado
- **Visualização nativa de topologias e diagramas:**
  - Renderização SVG pura (zero dependências externas) para topologias ASCII/Unicode (`┌─┐`, `├──`, `▼`, `─►`), gráficos de barras, fluxogramas, diagramas de sequência e gráficos Mermaid (`flowchart`, `sequenceDiagram`, `pie`).
  - Controles inline de zoom (`-`, `%`, `+`, `Ajustar`), arrastar para mover (pan) e botão **Expandir** para inspeção em modal em tela cheia sem editar o texto bruto.
- **Tabelas Markdown (GFM) interativas:**
  - Suporte completo a `<br>` / `<br/>` dentro de células e formatação inline (`**negrito**`, `*itálico*`, `` `código` ``, links).
  - Redimensionamento manual de colunas por arraste nas bordas com persistência por tabela e botão **Colunas** para restaurar larguras automáticas.
  - Visualizador modal ampliado com zoom e ajuste à largura da tela.
- **Exportação de topologias e tabelas para PNG e JPEG:**
  - Botão **Exportar** nos cards inline e nos modais ampliados de diagramas e tabelas.
  - Opções para exportar em **PNG** ou **JPEG**, preservando o **tema atual** ou usando **fundo claro**, respeitando as larguras de colunas redimensionadas.
- **Exportação de documentos Markdown para PDF:**
  - Compilador `%PDF-1.4` nativo em TypeScript sem dependências externas, com camada de texto pesquisável (WinAnsi).
  - Modal de pré-visualização página a página com seleção de tema (**Claro (Papel)** / **Escuro (Gecko)**), tamanho de página (**A4** / **Carta**) e rodapé com numeração opcional.
  - Acesso pelo botão **PDF** na barra superior, atalho `Ctrl + Shift + P`, menu da marca Gecko, menu de contexto da aba/editor e árvore de arquivos.
- **Persistência nativa de binários:**
  - Novos métodos Go/Wails (`PromptSaveExportFile` e `SaveBinaryFile`) com gravação atômica para PDF, PNG e JPEG.

## [v1.1.1] - 2026-11-04

### Corrigido
- Compilação Linux migrada para WebKit2GTK 4.1 (`-tags webkit2_41` e `libwebkit2gtk-4.1-dev` no workflow de release) para compatibilidade com distribuições modernas.
- Adicionadas instruções de instalação por distribuição Linux no `README.md`.

## [v1.1.0] - 2026-11-01

### Adicionado
- Modo Foco / Zen (`F11` / `Alt + Z`) e estatísticas de escrita em tempo real na barra de status.

## [v1.0.1] - 2026-11-01

### Corrigido
- Corrigido estado de hover travado no menu de contexto do logo Gecko.

## [v1.0.0] - 2026-10-31

### Adicionado
- Lançamento inicial do Gecko Text Editor com CodeMirror 6, visualização híbrida de Markdown, workspaces múltiplos, minimapa e sistema modular de atalhos.
