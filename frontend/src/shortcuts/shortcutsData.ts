/**
 * Catálogo completo de atalhos de teclado do Gecko.
 * Categorizado de acordo com a taxonomia de IHC do software.
 */

export interface ShortcutItem {
    id: string;
    label: string;
    keys: string[];
    description?: string;
}

export interface ShortcutSection {
    id: string;
    title: string;
    shortcuts: ShortcutItem[];
}

export const GECKO_SHORTCUT_SECTIONS: ShortcutSection[] = [
    {
        id: "system",
        title: "Sistema & Interface",
        shortcuts: [
            {
                id: "cycle-region-next",
                label: "Alternar foco entre áreas (Workbench)",
                keys: ["F6", "Shift + F6"],
                description: "Move o foco sequencialmente entre Sidebar, Abas, Editor e Barra de Status",
            },
            {
                id: "help-shortcuts",
                label: "Exibir mapa de atalhos",
                keys: ["F1", "Ctrl + /"],
                description: "Abre o modal com todos os atalhos do Gecko",
            },
            {
                id: "toggle-sidebar",
                label: "Alternar barra lateral",
                keys: ["Ctrl + \\"],
                description: "Oculta ou exibe a barra lateral do explorador",
            },
            {
                id: "theme-colors",
                label: "Configuração de cores do Gecko",
                keys: ["Ctrl + ,"],
                description: "Abre o seletor de matiz e paleta visual",
            },
            {
                id: "zen-mode",
                label: "Modo Foco / Zen",
                keys: ["F11", "Alt + Z"],
                description: "Oculta todas as molduras para foco total na escrita (Escape sai)",
            },
            {
                id: "escape-action",
                label: "Cancelar / Fechar modal ou menu",
                keys: ["Esc"],
                description: "Fecha janelas ativas e retorna o foco ao editor",
            },
        ],
    },
    {
        id: "files",
        title: "Arquivos & Workspace",
        shortcuts: [
            {
                id: "quick-open",
                label: "Buscar arquivo rápido / Focar busca (Quick Open)",
                keys: ["Ctrl + P"],
                description: "Abre o localizador e foca no campo de busca de arquivos do workspace",
            },
            {
                id: "new-untitled-tab",
                label: "Nova aba sem título",
                keys: ["Ctrl + T"],
                description: "Cria um novo documento Markdown em memória",
            },
            {
                id: "new-file-workspace",
                label: "Novo arquivo .md no workspace",
                keys: ["Ctrl + Alt + N"],
                description: "Cria um arquivo físico na pasta selecionada",
            },
            {
                id: "save-active-tab",
                label: "Salvar aba ativa",
                keys: ["Ctrl + S"],
                description: "Persiste o conteúdo atual no disco",
            },
            {
                id: "save-as",
                label: "Salvar como...",
                keys: ["Ctrl + Shift + S"],
                description: "Escolhe pasta de destino e nome do arquivo",
            },
            {
                id: "export-pdf",
                label: "Exportar para PDF...",
                keys: ["Ctrl + Shift + P"],
                description: "Pré-visualiza e exporta o documento atual como PDF",
            },
            {
                id: "close-active-tab",
                label: "Fechar aba ativa",
                keys: ["Ctrl + W"],
                description: "Fecha o documento atual com confirmação se houver dados",
            },
            {
                id: "save-and-close-all",
                label: "Salvar e fechar todas as abas",
                keys: ["Ctrl + Shift + W"],
                description: "Grava todas as pendências e fecha todos os editores",
            },
            {
                id: "rename-entry",
                label: "Renomear arquivo / pasta",
                keys: ["F2"],
                description: "Ativa edição de nome in-place na árvore ou aba",
            },
            {
                id: "delete-entry",
                label: "Excluir arquivo do disco",
                keys: ["Delete"],
                description: "Solicita exclusão permanente do arquivo selecionado",
            },
        ],
    },
    {
        id: "tabs",
        title: "Navegação de Abas",
        shortcuts: [
            {
                id: "focus-tabs",
                label: "Focar na barra de abas",
                keys: ["Ctrl + Shift + A"],
                description: "Transfere o foco diretamente para a lista de abas abertas",
            },
            {
                id: "tab-jump-index",
                label: "Alternar para aba 1 a 9",
                keys: ["Ctrl + 1 ... 8", "Ctrl + 9"],
                description: "Ctrl+1 a 8 pula para a posição exata; Ctrl+9 ativa a última aba",
            },
            {
                id: "tab-next",
                label: "Próxima aba aberta",
                keys: ["Ctrl + Tab", "Ctrl + PgDn"],
                description: "Avança para a próxima guia da lista",
            },
            {
                id: "tab-prev",
                label: "Aba aberta anterior",
                keys: ["Ctrl + Shift + Tab", "Ctrl + PgUp"],
                description: "Retorna para a guia anterior da lista",
            },
            {
                id: "tab-move-left",
                label: "Mover aba ativa para a esquerda",
                keys: ["Ctrl + Shift + PgUp"],
                description: "Reordena a guia atual para a esquerda",
            },
            {
                id: "tab-move-right",
                label: "Mover aba ativa para a direita",
                keys: ["Ctrl + Shift + PgDn"],
                description: "Reordena a guia atual para a direita",
            },
            {
                id: "tab-nav-keys",
                label: "Navegar entre abas (com foco na barra)",
                keys: ["←", "→"],
                description: "Desloca a seleção de aba usando o teclado",
            },
            {
                id: "tab-activate-focused",
                label: "Ativar aba selecionada",
                keys: ["Enter", "Espaço"],
                description: "Abre o editor para a guia focada",
            },
            {
                id: "tab-close-focused",
                label: "Fechar aba selecionada na barra",
                keys: ["Delete"],
                description: "Fecha a guia com foco na barra de abas",
            },
        ],
    },
    {
        id: "sidebar",
        title: "Explorador de Arquivos (Sidebar)",
        shortcuts: [
            {
                id: "focus-sidebar",
                label: "Focar explorador de arquivos (Sidebar)",
                keys: ["Ctrl + Shift + E"],
                description: "Exibe a barra lateral se recolhida e transfere o foco para a árvore de arquivos",
            },
            {
                id: "tree-navigate",
                label: "Navegar linha a linha na árvore",
                keys: ["↑", "↓"],
                description: "Move o cursor do explorador de arquivos",
            },
            {
                id: "tree-jump-pages",
                label: "Pular itens rapidamente",
                keys: ["PgUp", "PgDn"],
                description: "Avança ou recua 8 itens na listagem",
            },
            {
                id: "tree-first-last",
                label: "Ir para o início ou final da árvore",
                keys: ["Home", "End"],
                description: "Salta para a raiz ou último nó visível",
            },
            {
                id: "tree-expand",
                label: "Expandir pasta / Entrar no primeiro filho",
                keys: ["→"],
                description: "Abre diretório fechado ou avança na hierarquia",
            },
            {
                id: "tree-collapse",
                label: "Recolher pasta / Voltar para pasta pai",
                keys: ["←"],
                description: "Fecha diretório aberto ou sobe um nível",
            },
            {
                id: "tree-open-file",
                label: "Abrir arquivo e focar editor",
                keys: ["Enter"],
                description: "Carrega o arquivo e transfere o foco para a digitação",
            },
            {
                id: "tree-preview-file",
                label: "Pré-visualizar mantendo foco na sidebar",
                keys: ["Espaço"],
                description: "Abre o documento mantendo o teclado na árvore",
            },
            {
                id: "tree-typeahead",
                label: "Busca incremental por digitação",
                keys: ["Letras / Números"],
                description: "Digitar pula direto para o arquivo correspondente",
            },
            {
                id: "tree-context-menu",
                label: "Menu de contexto do arquivo",
                keys: ["Shift + F10", "Menu"],
                description: "Abre as ações do item selecionado",
            },
        ],
    },
    {
        id: "editor",
        title: "Edição & Formatação Markdown",
        shortcuts: [
            {
                id: "focus-editor",
                label: "Focar no editor de texto",
                keys: ["Ctrl + Shift + M", "Ctrl + Alt + E"],
                description: "Retorna o cursor de digitação diretamente para o editor de texto",
            },
            {
                id: "fmt-headings",
                label: "Títulos H1, H2 e H3",
                keys: ["Ctrl + Alt + 1", "Ctrl + Alt + 2", "Ctrl + Alt + 3"],
                description: "Alterna prefixo #, ## ou ### na linha atual",
            },
            {
                id: "fmt-bold",
                label: "Negrito",
                keys: ["Ctrl + B", "Ctrl + N"],
                description: "Envolve seleção em **texto**",
            },
            {
                id: "fmt-italic",
                label: "Itálico",
                keys: ["Ctrl + I"],
                description: "Envolve seleção em *texto*",
            },
            {
                id: "fmt-underline",
                label: "Sublinhado",
                keys: ["Ctrl + U"],
                description: "Envolve seleção em <u>texto</u>",
            },
            {
                id: "fmt-inline-code",
                label: "Código inline",
                keys: ["Ctrl + E"],
                description: "Envolve seleção em `código`",
            },
            {
                id: "fmt-strikethrough",
                label: "Tachado",
                keys: ["Alt + Shift + D"],
                description: "Envolve seleção em ~~texto~~",
            },
            {
                id: "fmt-link",
                label: "Inserir / Encapsular link Markdown",
                keys: ["Ctrl + K"],
                description: "Cria estrutura [texto](url)",
            },
            {
                id: "fmt-bullet-list",
                label: "Lista com marcadores",
                keys: ["Ctrl + -"],
                description: "Alterna prefixo - na linha ou seleção",
            },
            {
                id: "fmt-numbered-list",
                label: "Lista numerada",
                keys: ["Ctrl + .", "Ctrl + Shift + 7"],
                description: "Alterna prefixo 1., 2. sequencial",
            },
            {
                id: "fmt-task-list",
                label: "Lista de tarefas (Checklist)",
                keys: ["Ctrl + ;", "Ctrl + Shift + 9"],
                description: "Alterna prefixo - [ ] interativo",
            },
            {
                id: "fmt-blockquote",
                label: "Citação em bloco",
                keys: ["Ctrl + Shift + ."],
                description: "Alterna prefixo > com escape ergonômico no Enter",
            },
            {
                id: "edit-move-line",
                label: "Mover linha / seleção para cima ou baixo",
                keys: ["Alt + ↑", "Alt + ↓"],
                description: "Desloca as linhas selecionadas verticalmente",
            },
            {
                id: "edit-select-occurrence",
                label: "Selecionar próxima ocorrência (Multi-cursor)",
                keys: ["Ctrl + D"],
                description: "Adiciona cursor na próxima palavra idêntica",
            },
            {
                id: "edit-paste-plain",
                label: "Colar como texto puro",
                keys: ["Ctrl + Shift + V"],
                description: "Descarta formatações HTML externas da área de transferência",
            },
            {
                id: "edit-indent",
                label: "Indentar / Desindentar linha ou bloco",
                keys: ["Tab", "Shift + Tab"],
                description: "Ajusta o nível de recuo do texto",
            },
        ],
    },
];
