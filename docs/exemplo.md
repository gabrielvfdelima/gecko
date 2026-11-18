# Plataforma Aurora — Especificação Técnica (Exemplo)

Documento de exemplo para demonstração do editor Markdown, renderização de topologias em SVG, tabelas GFM interativas, imagens locais e blocos de assinatura digital (`gov.br`).

```
[ Cliente Web / CLI ]
         │
         ▼
[ API Gateway (REST) ]
         │
    ┌────┴────┐
    ▼         ▼
[ Serviço ] [ Worker ]
[  Core   ] [ Filas  ]
    │         │
    ▼         ▼
[ PostgreSQL ] [ Storage ]
```

## Mapa de Serviços e Limites

| Camada | Componente | Responsabilidade | Cota de Referência |
| :--- | :--- | :--- | :--- |
| **Borda** | **API Gateway** | Roteamento TLS e limite de taxa | • 100 GB transferência/mês<br>• Timeout padrão de 30s |
| **Aplicação** | **Serviço Core** | Regras de negócio e autenticação | • 2 vCPU / 512 MB RAM<br>• Healthcheck HTTP `/healthz` |
| **Assíncrono** | **Worker de Filas** | Processamento em segundo plano | • Até 1.000 tarefas/min<br>• Retentativa exponencial |
| **Dados** | **PostgreSQL + Storage** | Persistência relacional e anexos | • **20 GB** banco principal<br>• Backups diários retidos por 7 dias |

## Revisão e Aprovação

```assinatura
nome: Mariana Costa Silva
cargo: Analista de Documentação Técnica
```

```assinatura
```
