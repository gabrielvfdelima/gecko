# A Filosofia Gecko: Ultra-Velocidade e Peso Ultra-Leve

## 1. Manifesto

O **Gecko** nasceu de uma recusa explícita ao inchaço (*software bloat*) que domina as ferramentas de edição e anotações modernas. No cenário atual, editores baseados em Electron chegam a exigir centenas de megabytes de instalador, ocupam mais de 400 MB de memória RAM logo na inicialização e impõem latências perceptíveis em ações simples como abrir arquivos ou navegar no teclado.

O Gecko segue a direção oposta:

> **O Gecko deve ser tão leve quanto um binário utilitário de terminal, e tão responsivo quanto uma máquina de escrever mecânica.**

Cada decisão técnica no Gecko é avaliada sob duas métricas fundamentais:
1. **Tempo de Resposta (Latência)**: Toda ação do usuário deve ocorrer no menor intervalo perceptível (idealmente `< 8ms`, dentro do orçamento de 1 frame de 120Hz).
2. **Consumo de Recursos**: O binário final, a memória em repouso e o uso de CPU devem ser mantidos no limite mínimo viável da engenharia de computadores.

---

## 2. Os Cinco Pilares de Engenharia

```
┌────────────────────────────────────────────────────────┐
│                    FILOSOFIA GECKO                     │
├───────────────┬────────────────────────┬───────────────┤
│  Wails v2     │  CodeMirror 6 Modular  │  Vanilla TS   │
│  Go Nativo    │  Markdown como Fonte   │  Zero V-DOM   │
│  (~9.7 MB)    │  Única da Verdade      │  (Direto DOM) │
├───────────────┴────────────────────────┴───────────────┤
│  I/O Não-Bloqueante (< 0.2ms por pasta)                │
│  Zero Dependências Supérfluas                          │
└────────────────────────────────────────────────────────┘
```

### 1. Wails v2 + Go vs. Electron
- Em vez de empacotar um navegador Chromium inteiro de 120 MB dentro do instalador, o Gecko utiliza o **Wails v2**, que aproveita a Webview nativa da plataforma (WebKitGTK no Linux, WebView2 no Windows).
- O backend compilado em Go gera um executável nativo único de **apenas ~9.7 MB**, contendo todos os assets e fontes embutidos via `go:embed`.
- A inicialização a frio (*cold boot*) ocorre em **menos de 150ms**, pronta para digitar.

### 2. CodeMirror 6 Modular: Markdown como Fonte Única da Verdade
- Não utilizamos editores WYSIWYG baseados em abstrações pesadas de DOM mutável (ContentEditable arbitrário ou abstrações do tipo Draft.js/ProseMirror com dezenas de nós virtuais).
- O documento no Gecko é um **buffer contínuo de texto bruto em Markdown**.
- A visualização **Live Preview Híbrida** aplica decorações pontuais (`Decoration.replace` e `Decoration.mark`) via CodeMirror 6 apenas nas linhas sem cursor.
- Quando o cursor entra em uma linha, ela se revela imediatamente como texto Markdown puro, garantindo **zero perda de formatação**, **zero conversão opaca de HTML** e **confiabilidade absoluta de salvamento**.

### 3. Frontend Cirúrgico em Vanilla TypeScript (Sem Virtual DOM)
- O frontend não utiliza frameworks pesados como React, Angular ou Vue.
- Sem overhead de reconciliação de Virtual DOM, ciclo de vida de componentes com hooks complexos ou garbage collection excessivo.
- Componentes e modais integrados operam por criação direta e reutilização de elementos DOM estáticos, garantindo que o navegador não gaste ciclos de CPU gerenciando árvores virtuais.

### 4. I/O Reativo com Custo Quase Zero
- **Listagem de Pastas Rápida**: Listagens de diretório via Go utilizam `os.ReadDir` de forma **não-recursiva** e sob demanda, consumindo **`< 0.2ms`** por consulta. Nunca leia árvores recursivas de disco de uma só vez.
- **Watcher Eficiente**: O monitoramento de disco (`fsnotify`) roda em goroutine isolada com debounce de 200ms, protegendo o editor contra eventos concorrentes de salvamento e evitando alto uso de CPU.
- **Zero Polling**: Nunca crie loops de verificação temporizada (`setInterval` para ler arquivos ou checar status). Todas as atualizações são disparadas por eventos reais.

### 5. Ergonomia de Alta Densidade e 1 Toque
- Modais e fluxos são projetados para máxima velocidade de teclado:
  - Salvar um novo arquivo: `Ctrl+S` -> digite o nome -> `Enter` (1 único toque salva no workspace ativo).
  - Trocar de pasta: digite no filtro rápido e navegue com `↑`/`↓`.
  - Zero dependência de caixas de diálogo nativas do sistema operacional, que são lentas para abrir e desconectadas do teclado.

---

## 3. Metas Numéricas de Desempenho

| Indicador | Meta do Gecko | Justificativa |
|---|---|---|
| **Tamanho do Executável** | `< 12 MB` | Deve caber em qualquer pendrive e ser baixado em menos de 2 segundos. |
| **Tempo de Cold Boot** | `< 200 ms` | O editor deve abrir quase instantaneamente ao ser chamado. |
| **Uso de Memória RAM (Ocioso)** | `< 60 MB` | Não deve disputar recursos com compiladores, navegadores ou IDEs do usuário. |
| **Latência de Teclado (Input Lag)** | `< 8 ms` | Digitação com sensação imediata de feedback tátil. |
| **Transição de Live Preview** | `0 ms` (1 frame) | A revelação de Markdown ao mover a linha não pode ter animação lenta. |
| **Pulos de Layout (Layout Shift)** | `0 px` | O cursor e o texto ao redor jamais devem pular de posição ao alternar widgets. |

---

## 4. Diretrizes para Agentes de IA e Desenvolvedores

Ao implementar novas funcionalidades, corrigir bugs ou propor melhorias no Gecko:

1. **Nunca adicione dependências npm sem autorização expressa**: Sempre avalie se a funcionalidade pode ser implementada com a API padrão do TypeScript/DOM ou extensões nativas do CodeMirror 6.
2. **Nunca adicione pacotes Go externos sem justificativa de performance**: Prefira a biblioteca padrão de Go (`os`, `path/filepath`, `strings`, `sync`, `time`).
3. **Evite bloqueios no Event Loop**: Toda operação de arquivo ou rede deve ocorrer no lado do Go via bindings Wails assíncronos (`async/await`), mantendo a thread de renderização a 60/120fps.
4. **Métricas de Altura Precisa em Widgets**: Ao criar widgets visuais que substituem texto (como tabelas ou divisores), configure `get estimatedHeight()` com a altura real exata do elemento para que o CodeMirror mantenha o scroll impecável.
5. **Preserve a simplicidade**: O melhor código é aquele que cumpre o objetivo com o menor número de linhas, menos alocações de memória e zero complexidade desnecessária.
