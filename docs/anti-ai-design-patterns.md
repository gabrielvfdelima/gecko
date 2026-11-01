# Anti-AI Design Patterns no Gecko

## 1. Objetivo

Este documento define os padrões visuais, comportamentais, arquiteturais e de experiência que são **estritamente proibidos** durante o desenvolvimento de interfaces e fluxos no Gecko.

O objetivo é impedir que a aplicação adquira a estética e os comportamentos genéricos de "produto gerado por IA", preservando a identidade utilitária, industrial, profissional e ultra-sóbria do Gecko.

> **Princípio Fundamental:** Desenvolver uma ferramenta de produtividade profissional com engenharia refinada, e **nunca** uma vitrine temática ou estereotipada de Inteligência Artificial.

---

## 2. Enum de Padrões Proibidos

```ts
enum AntiAIDesignPatterns {
  // ==========================================
  // IDENTIDADE VISUAL
  // ==========================================

  EXCESSIVE_PURPLE_GRADIENTS,
  EXCESSIVE_PINK_BLUE_GRADIENTS,
  GRADIENT_ON_EVERY_COMPONENT,
  EXCESSIVE_GLOW_EFFECTS,
  NEON_GLOW_BORDERS,
  EXCESSIVE_GLASSMORPHISM,
  GENERIC_NEURAL_NETWORK_ILLUSTRATIONS,
  DIGITAL_BRAIN_ILLUSTRATIONS,
  GENERIC_AI_ROBOT_MASCOTS,
  ABSTRACT_AI_BLOB_BACKGROUND,
  EXCESSIVE_FLOATING_PARTICLES,
  RANDOM_TECHNOLOGICAL_GRIDS,
  EXCESSIVE_ROUNDED_CORNERS,
  EXCESSIVE_PILL_SHAPED_COMPONENTS,
  GENERIC_FUTURISTIC_DARK_THEME,
  UNNECESSARY_ANIMATED_ELEMENTS,

  // ==========================================
  // ÍCONES E ELEMENTOS DECORATIVOS
  // ==========================================

  EXCESSIVE_SPARKLE_ICONS,
  SPARKLE_ICON_ON_EVERY_ACTION,
  GENERIC_MAGIC_WAND_ICONS,
  UNNECESSARY_AI_BADGES,
  POWERED_BY_AI_LABELS_EVERYWHERE,
  DECORATIVE_CIRCUITS,
  DECORATIVE_NEURAL_CONNECTIONS,
  EMOJIS_AS_UI_ICONS,

  // ==========================================
  // LAYOUT E COMPOSIÇÃO
  // ==========================================

  GENERIC_AI_SAAS_LANDING_PAGE,
  CENTERED_HERO_WITH_PROMPT_INPUT,
  OVERSIZED_GENERIC_HEADLINES,
  GENERIC_AI_FEATURE_CARDS,
  EXCESSIVE_FLOATING_CARDS,
  UNNECESSARY_GLASS_PANELS,
  INCONSISTENT_SPACING,
  EXCESSIVE_EMPTY_SPACE,
  GENERIC_DASHBOARD_LAYOUT,

  // ==========================================
  // TIPOGRAFIA E MICROCOPY
  // ==========================================

  GENERIC_AI_MARKETING_COPY,
  UNNECESSARY_EM_DASH_USAGE,
  GENERIC_AI_TAGLINES,
  EXCESSIVE_BOLD_TEXT,
  EXCESSIVE_TEXT_HIERARCHY,
  OVERLY_VERBOSE_INTERFACE_COPY,
  REPETITIVE_ASSISTANT_MESSAGES,
  UNNATURAL_CONVERSATIONAL_LANGUAGE,

  // ==========================================
  // INTERAÇÕES E ANIMAÇÕES
  // ==========================================

  FAKE_TYPING_ANIMATIONS,
  FAKE_THINKING_STATES,
  FAKE_PROGRESS_BARS,
  FAKE_PROCESSING_PERCENTAGES,
  FAKE_TOOL_EXECUTION_LOGS,
  UNNECESSARY_LOADING_ANIMATIONS,
  UNNECESSARY_CHATBOT_INTERACTIONS,
  UNNECESSARY_CONFIRMATION_MESSAGES,
  EXCESSIVE_CONTEXTUAL_SUGGESTIONS,
  AUTOMATIC_UNREQUESTED_AI_ACTIONS,

  // ==========================================
  // FUNCIONALIDADE E EXPERIÊNCIA
  // ==========================================

  AI_AS_DEFAULT_SOLUTION_FOR_EVERYTHING,
  UNNECESSARY_AI_ASSISTANT_BUTTONS,
  UNNECESSARY_PROMPT_INPUTS,
  UNNECESSARY_MODEL_SELECTORS,
  UNNECESSARY_AI_MODE_SELECTORS,
  UNNECESSARY_AI_RECOMMENDATIONS,
  UNREQUESTED_CONTENT_GENERATION,
  HIDDEN_AI_EXECUTION_STATES,
  MISLEADING_CONFIDENCE_INDICATORS,
  MISLEADING_AUTONOMY_INDICATORS,
  UNNECESSARY_AI_NOTIFICATIONS,

  // ==========================================
  // CONSISTÊNCIA E IDENTIDADE
  // ==========================================

  GENERIC_AI_TEMPLATE_APPEARANCE,
  COPYCAT_CHATGPT_INTERFACE,
  COPYCAT_CLAUDE_INTERFACE,
  COPYCAT_GEMINI_INTERFACE,
  INCONSISTENT_COMPONENT_STYLING,
  DECORATIVE_ELEMENTS_WITHOUT_PURPOSE,
  AI_VISUAL_IDENTITY_OVER_PRODUCT_IDENTITY,
  NATIVE_OS_FALLBACK_DIALOGS
}
```

---

## 3. Descrição Detalhada das Categorias

| Categoria | O que evitar | Padrão Adotado no Gecko |
|---|---|---|
| **Identidade Visual** | Gradientes roxos/rosas, reflexos brilhantes, neon, glassmorphism (`backdrop-filter: blur`), ilustrações futuristas abstratas e cantos com raio excessivo (`border-radius > 4px`). | Tons sólidos industriais (Grafite escuro `#181818` / `#1E1E1E`, Verde Gecko `#2EA043` / `#6BC46D`). Geometria estritamente reta (`border-radius: 0px` em painéis, listas e abas; `2px` em botões e inputs). |
| **Ícones e Decoração** | Emojis coloridos como ícones de sistema (`📁`, `✨`, `📋`), estrelas cintilantes, varinhas mágicas e mascotes. | SVGs monocromáticos utilitários de `13x13` ou `14x14`, traço limpo (`stroke-width: 1.4` a `1.8`), herdando `currentColor`. |
| **Layout** | Cards flutuantes com sombras dispersas, landing pages de SaaS, menus com alturas desproporcionais, dropdowns nativos do HTML (`<select>`). | Workbench compacto de 100vw x 100vh, divisão por bordas sólidas de 1px (`#2B2B2B`), modais integrados no padrão Quick Open (`Ctrl+P`). |
| **Tipografia** | Textos prolixos, slogans motivacionais, mensagens que tratam o usuário como criança, excesso de negrito e travessões decorativos sem função. | Microcopy direto, objetivo e profissional (`Salvar`, `Cancelar`, `Substituir`, `Renomear`). Fontes do sistema e `JetBrains Mono` / `Fira Code`. |
| **Interações** | Carregamentos falsos, digitação simulada ("efeito máquina de escrever"), delays artificiais para parecer que a aplicação está "pensando". | Resposta instantânea (0ms de atraso artificial). Se a operação leva menos de 5ms, o resultado é renderizado no mesmo frame. |
| **Funcionalidade** | Botões "Melhorar com IA" em todo lugar, prompts invasivos, popups não solicitados e caixas de diálogo modais duplicadas. | O editor foca na digitação do usuário. Ferramentas auxiliares são discretas, ativadas sob demanda e controladas pelo teclado. |
| **Consistência** | Imitação visual de interfaces famosas de chat e recurso a diálogos lentos do sistema operacional. | Experiência integrada e autocontida sem depender dos diálogos nativos do SO. |

---

## 4. Diretrizes Obrigatórias de Implementação

1. **Geometria Industrial**: Todo painel, modal, aba, popover ou linha de árvore deve ter `border-radius: 0px`. Apenas inputs e botões de ação recebem no máximo `2px` para suavização óptica.
2. **Iconografia SVG Consistente**: Nunca utilizar emojis em substituição a ícones. Use exclusivamente SVGs monocromáticos inline ou padronizados.
3. **Zero Diálogos Nativos do SO**: O Gecko possui seu próprio sistema de navegação e salvamento integrado (`createGeckoDirectoryBrowser`, `openIntegratedSaveFileModal`, `openIntegratedWorkspaceModal`). Nunca invoque seletores nativos lentos do sistema operacional para fluxos de workspace ou arquivo.
4. **Zero Simulação**: Nunca insira animações de progresso simulado, porcentagens inventadas ou timers fictícios. Toda animação deve representar um estado físico real do sistema.
5. **Cores Utilitárias**: Mantenha os tokens de cores sem dispersão. Use `--bg-workbench`, `--bg-editor`, `--border-subtle`, `--text-primary`, `--text-secondary`, `--accent-primary` e `--bg-selection`.
6. **Teclado como Cidadão de Primeira Classe**: Qualquer modal ou lista interativa deve ser 100% navegável por `↑`, `↓`, `Enter`, `Esc`, `Tab` e atalhos globais sem necessidade de toque no mouse.
7. **Sem Efeitos de Blur**: Proibido o uso de `backdrop-filter: blur()`. Modais usam backdrop escurecido semitransparente sólido (`rgba(0, 0, 0, 0.65)`).
8. **0px Layout Jump**: Widgets e elementos híbridos (Live Preview de tabelas, blocos de código e linhas horizontais) devem ter alturas estimadas consistentes com a métrica de linha (`22px` para texto e divisores) para evitar qualquer salto de scroll na tela.

---

## 5. Checklist Obrigatório para Agentes de IA

Antes de marcar qualquer tarefa visual ou de interface como concluída, o agente deve validar:

- [ ] A interface preserva a geometria reta industrial do Gecko (`border-radius: 0px` / `2px`)?
- [ ] Foram evitados gradientes roxos, rosas, efeitos neon ou sombras brilhantes?
- [ ] Foram utilizados SVGs monocromáticos em vez de emojis ou ícones de estrelas/varinhas?
- [ ] O fluxo dispensa totalmente janelas de diálogo nativas do sistema operacional?
- [ ] Não há animações falsas de carregamento ou "pensamento"?
- [ ] Os inputs respondem imediatamente ao teclado com seleção adequada de texto?
- [ ] O contraste atende aos requisitos de acessibilidade sem ruído visual?
- [ ] O microcopy é enxuto, técnico e direto?
