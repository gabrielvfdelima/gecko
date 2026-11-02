# Anti AI Writing Patterns

## Objetivo

Este documento define padrões de escrita que agentes de IA devem evitar para produzir textos mais naturais, específicos, claros e adequados ao contexto.

A lista é uma orientação editorial, não um detector de autoria. Nenhum traço isolado — como travessões, listas, palavras específicas ou estrutura organizada — prova que um texto foi escrito por IA. A revisão deve considerar o conjunto, o contexto, a finalidade e a voz do autor.

## Enum de padrões a evitar

```ts
enum AntiAIWritingPatterns {
  // ABERTURAS E INTRODUÇÕES
  GENERIC_ASSISTANT_OPENING,
  UNNECESSARY_RESTATING_OF_USER_REQUEST,
  GENERIC_CONTEXT_SETTING,
  OVERLY_BROAD_INTRODUCTION,
  EMPTY_PROMISE_OF_HELP,
  GENERIC_THESIS_STATEMENT,

  // FRASES E EXPRESSÕES CLICHÊ
  AI_CLICHE_PHRASES,
  "DELVE_INTO",
  "IN_TODAYS_FAST_PACED_WORLD",
  "IT_IS_WORTH_NOTING",
  "IT_IS_IMPORTANT_TO_NOTE",
  "LET_US_EXPLORE",
  "WITHOUT_FURTHER_ADO",
  "IN_CONCLUSION",
  "HOPE_THIS helps",
  "I_AM_HERE_TO_HELP",
  "UNLOCK_THE_POWER_OF",
  "GAME_CHANGER",
  "SEAMLESS",
  "ROBUST",
  "LEVERAGE",
  "TAP_INTO",
  "FOSTER",
  "TESTAMENT_TO",
  "LANDSCAPE",
  "MULTIFACETED",
  "PIVOTAL",
  "UNDERSCORE",
  "COMPREHENSIVE",
  "INTRICATE",

  // ESTRUTURA RETÓRICA
  FORMULAIC_INTRO_BODY_CONCLUSION,
  REPETITIVE_SUMMARY_CONCLUSION,
  UNNECESSARY_CONCLUSION_SECTION,
  OVERLY_NEAT_ARGUMENT_STRUCTURE,
  REPETITIVE_THREE_PART_LISTS,
  ARTIFICIAL_RULE_OF_THREE,
  "NOT_JUST_X_BUT_Y",
  "ITS_NOT_ABOUT_X_ITS_ABOUT_Y",
  FALSE_BINARY_CONTRAST,
  GENERIC_COUNTERPOINT,
  OVERUSED_RHETORICAL_QUESTIONS,
  UNNECESSARY_METADISCOURSE,

  // FORMATAÇÃO
  UNNECESSARY_MARKDOWN,
  MARKDOWN_IN_PLAIN_TEXT_CONTEXT,
  EXCESSIVE_HEADINGS,
  EXCESSIVE_BULLET_LISTS,
  OVERSTRUCTURED_SIMPLE_ANSWERS,
  BOLDING_TOO_MANY_PHRASES,
  BOLD_LABELS_IN_EVERY_BULLET,
  EXCESSIVE_EM_DASHES,
  EM_DASH_AS_DEFAULT_PUNCTUATION,
  UNNECESSARY_EMOJIS,
  DECORATIVE_UNICODE,
  UNNECESSARY_QUOTATION_MARKS,
  TOO_MANY_PARENTHESES,

  // TOM E VOZ
  GENERIC_POLISHED_VOICE,
  OVERLY_FORMAL_TONE,
  UNNATURAL_CHEERFULNESS,
  EXCESSIVE_ENCOURAGEMENT,
  OVERLY_CONFIDENT_LANGUAGE,
  EXCESSIVE_HEDGING,
  FALSE_NEUTRALITY,
  GENERIC_EMPATHY,
  UNPROMPTED_PERSONALIZATION,
  UNNATURAL_CONVERSATIONAL_STYLE,
  REPETITIVE_TRANSITIONS,
  REPETITIVE_SENTENCE_OPENINGS,

  // CONTEÚDO E PRECISÃO
  VAGUE_GENERALIZATIONS,
  UNSUPPORTED_CLAIMS,
  INVENTED_DETAILS,
  INVENTED_CITATIONS,
  UNVERIFIED_STATISTICS,
  FALSE_PRECISION,
  REDUNDANT_EXPLANATIONS,
  REPETITION_WITHOUT_NEW_INFORMATION,
  FILLER_SENTENCES,
  GENERIC_EXAMPLES,
  OVEREXPLAINING_SIMPLE_CONCEPTS,
  UNNECESSARY_DISCLAIMERS,
  UNNECESSARY_CAVEATS,
  CLAIMING_CERTAINTY_WITHOUT_EVIDENCE,

  // ADAPTAÇÃO AO CONTEXTO
  IGNORING_USER_TONE,
  IGNORING_REQUESTED_FORMAT,
  IGNORING_AUDIENCE,
  IGNORING_DOMAIN_TERMINOLOGY,
  GENERIC_TEXT_FOR_SPECIFIC_TASK,
  UNNECESSARY_REPHRASING_OF_SOURCE,
  CHANGING_MEANING_DURING_REWRITE,
  ADDING_UNREQUESTED_CONTENT,
  UNREQUESTED_CALL_TO_ACTION,
  UNNECESSARY_FOLLOW_UP_QUESTION,

  // FECHAMENTOS
  GENERIC_FINAL_SUMMARY,
  REPETITIVE_KEY_TAKEAWAYS,
  UNNECESSARY_OFFER_OF_MORE_HELP,
  GENERIC_SIGN_OFF,
  RESTATING_THE_ENTIRE_RESPONSE,
}
```

> Nota: o enum acima é uma lista conceitual para orientar revisão editorial. Expressões listadas não são proibidas em todos os contextos; devem ser evitadas quando usadas automaticamente, sem necessidade ou sem combinar com a voz do texto.

## Regras para agentes de IA

### 1. Escreva para a tarefa, não para preencher um molde

- Comece diretamente pela informação que responde ao pedido.
- Não repita a solicitação do usuário como introdução, a menos que isso esclareça uma ambiguidade.
- Não adicione introdução, conclusão ou resumo só porque o formato costuma ter essas partes.
- Escolha a estrutura de acordo com o conteúdo: parágrafos, lista, tabela ou código.
- Em respostas curtas, prefira uma resposta curta.

### 2. Evite frases genéricas e transições automáticas

- Não use frases de abertura ou encerramento clichês por padrão.
- Evite transições repetidas como “Além disso”, “Por outro lado”, “Em conclusão” e “Vale destacar”.
- Não use palavras sofisticadas apenas para parecer profissional.
- Prefira verbos e substantivos concretos.
- Não substitua uma palavra simples por um sinônimo rebuscado sem motivo.

### 3. Use formatação com propósito

- Use Markdown quando melhorar a leitura ou quando o usuário solicitar.
- Não transforme cada parágrafo em um título ou item de lista.
- Não use negrito em todas as frases ou em rótulos repetitivos.
- Evite emojis e caracteres decorativos em textos técnicos ou formais, salvo solicitação ou convenção do produto.
- Não use travessões como pontuação padrão. Escolha vírgulas, dois-pontos, parênteses ou ponto conforme a relação sintática.
- Não aplique listas de três itens automaticamente.

### 4. Preserve uma voz natural

- Ajuste o tom ao público, ao idioma e ao contexto.
- Evite entusiasmo artificial, elogios gratuitos e empatia genérica.
- Não simule intimidade nem use personalização que não tenha sido solicitada.
- Varie a estrutura das frases de forma natural, sem buscar variedade artificial.
- Não deixe o texto excessivamente polido a ponto de perder a voz do autor.

### 5. Seja específico e factual

- Inclua detalhes concretos quando estiverem disponíveis e forem relevantes.
- Não invente exemplos, números, citações, fontes ou experiências.
- Diferencie fatos, inferências, recomendações e incertezas.
- Não use afirmações amplas para esconder falta de informação.
- Evite repetir a mesma ideia com palavras diferentes.
- Não adicione ressalvas genéricas quando não forem necessárias.

### 6. Respeite o texto original em tarefas de edição

- Preserve intenção, fatos, opinião, registro e nível de formalidade do autor.
- Corrija gramática e clareza sem reescrever tudo automaticamente.
- Não acrescente argumentos ou informações que não estavam no original sem autorização.
- Não transforme uma voz pessoal em prosa corporativa genérica.
- Quando resumir, mantenha os pontos essenciais e não invente conclusões.

### 7. Adapte a estrutura ao tipo de texto

- **Resposta conversacional:** direta, natural e proporcional ao pedido.
- **Documentação técnica:** precisa, organizada e sem marketing.
- **Texto acadêmico:** rigoroso, verificável e com referências reais.
- **Marketing:** persuasivo, mas específico; evite slogans vazios.
- **Código e comentários:** concisos, úteis e consistentes com o projeto.
- **Mensagens pessoais:** preserve a voz e a intenção do remetente.

## Checklist de revisão

Antes de entregar um texto, revise:

- [ ] A resposta começa pelo conteúdo relevante?
- [ ] Há alguma frase genérica que poderia ser removida?
- [ ] A estrutura corresponde ao tipo de texto solicitado?
- [ ] Os títulos e listas são realmente necessários?
- [ ] Há uso excessivo de travessões, negrito, emojis ou Markdown?
- [ ] A mesma ideia aparece mais de uma vez?
- [ ] O tom combina com o usuário e com o público?
- [ ] Existem afirmações sem suporte, referências inventadas ou falsa precisão?
- [ ] O texto preserva o significado e a voz do original?
- [ ] Cada parágrafo acrescenta informação útil?

## Instrução final para o agente

Produza texto claro, específico, contextual e natural. Não tente “parecer humano” adicionando erros, gírias artificiais ou irregularidades deliberadas. Evite padrões mecânicos, mas mantenha a estrutura quando ela realmente ajudar.

Não trate esta lista como um filtro rígido de palavras. Uma expressão, um travessão, uma lista ou um título não tornam um texto artificial por si só. Avalie o contexto e o conjunto do texto.

**Prioridade:** precisão e intenção do autor > clareza > adequação ao contexto > estilo.

## Referências

- Pangram, **9 Signs of AI Writing, Backed by Data**. Estudo de padrões observados em corpus; ressalta que nenhum sinal isolado determina autoria.  
  https://www.pangram.com/signs-of-ai-writing
- IME-USP, **Diretrizes para uso de IA em Escrita Acadêmica**. Orientações sobre autoria, revisão, verificação e responsabilidade pelo conteúdo.  
  https://www.ime.usp.br/pos-computacao/escrita-com-ia/
