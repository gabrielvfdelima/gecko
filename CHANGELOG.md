# Changelog

Todas as mudanças notáveis do **Gecko** são documentadas neste arquivo.

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
