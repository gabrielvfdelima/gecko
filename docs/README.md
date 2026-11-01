# Gecko: Guia de Desenvolvimento & Padrões do Projeto

Bem-vindo à documentação técnica do **Gecko Text Editor**.

Este diretório foi estruturado para orientar **desenvolvedores e agentes de Inteligência Artificial** que atuam simultaneamente no desenvolvimento do software, assegurando que todas as contribuições sigam a mesma visão técnica, estética e de desempenho.

---

## 📚 Documentos Canônicos

| Documento | Descrição e Finalidade |
|---|---|
| **[Anti-AI Design Patterns](anti-ai-design-patterns.md)** | Regras estritas de design visual, comportamental e de IHC. Define o que é terminantemente proibido para evitar a estética genérica de IA (sem gradientes roxos, sem neon, sem glassmorphism, sem emojis e sem caixas de diálogo nativas do SO). |
| **[A Filosofia Gecko](filosofia-gecko.md)** | Princípios fundamentais de ultra-velocidade e peso ultra-leve. Metas numéricas de desempenho (< 12MB de binário, < 200ms cold boot, < 60MB RAM) e diretrizes para evitar inchaço de dependências. |
| **[Arquitetura e Convenções](arquitetura-e-convencoes.md)** | Mapa detalhado do código backend em Go, extensões modulares do CodeMirror 6, sistema de arquivos em Vanilla TypeScript e tokens CSS. |

---

## 🤖 Guia Rápido de Trabalho para Agentes de IA

Ao receber uma nova tarefa no Gecko, todo agente de IA deve seguir estas três etapas fundamentais:

### 1. Antes de Codificar
- Consulte o **[Anti-AI Design Patterns](anti-ai-design-patterns.md)** se a tarefa envolver qualquer alteração visual ou de interação.
- Verifique se a solução proposta respeita a **[Filosofia Gecko](filosofia-gecko.md)** (não adicione pacotes externos sem necessidade estrita).
- Verifique se a tarefa necessita de alteração no backend em Go ou apenas no frontend TypeScript.

### 2. Durante o Desenvolvimento
- **Frontend**: Mantenha o DOM enxuto em Vanilla TypeScript. No editor, opere através de transações imutáveis do CodeMirror 6 (`view.dispatch`).
- **Backend**: Métodos expostos para o frontend em `app.go` devem ser seguros, atômicos e não-bloqueantes.
- **Estilo**: Utilize sempre as variáveis CSS padronizadas (`var(--bg-editor)`, `var(--accent-primary)`, etc.) e mantenha a geometria industrial (`border-radius: 0px` para caixas/painéis e `2px` para botões/inputs).

### 3. Antes de Finalizar a Tarefa (Checklist de Validação)
Todo agente deve rodar os comandos de verificação e garantir que não haja erros:

```bash
# 1. Compilação TypeScript e empacotamento Vite
npm --prefix frontend run build

# 2. Execução dos testes unitários do Go
go test -v ./...

# 3. Compilação do binário de produção (quando aplicável)
wails build
```

---

## 🦎 Resumo das Invariantes do Gecko

1. **Zero Emojis como Ícones**: Utilize apenas SVGs monocromáticos utilitários de `13x13` ou `14x14` com `stroke-width: 1.4` a `1.8`.
2. **Zero Diálogos Nativos do SO**: Utilize os modais integrados (`openIntegratedSaveFileModal`, `openIntegratedWorkspaceModal`).
3. **Markdown é a Verdade**: O Live Preview Híbrido decora o texto sem alterar a integridade do Markdown bruto subjacente.
4. **Velocidade Extrema**: Se uma ação puder ser concluída com 1 único toque de teclado (`Enter`), esse deve ser o padrão.
