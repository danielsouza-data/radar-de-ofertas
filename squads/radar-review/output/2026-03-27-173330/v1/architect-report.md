## 🏗️ Análise Arquitetural — Radar de Ofertas

### Resumo Executivo
A arquitetura atual é funcional e pragmática para operação solo, com boa evolução recente de portabilidade (`src/config/paths.js`) e separação parcial de responsabilidades. O maior débito arquitetural está no acoplamento entre orquestração de envio e detalhes de integração externa no mesmo processo crítico (`disparo-completo.js` + parser/normalização). A recomendação é refatoração incremental em três fases, sem big-bang.

### Mapa de Dependências Atual
```
agendador-envios.js
  -> src/global-lock.js
  -> src/config/paths.js
  -> dispara disparo-completo.js (child process)

disparo-completo.js
  -> src/processador-ofertas.js
  -> src/global-lock.js
  -> src/log-mask.js
  -> src/config/paths.js
  -> whatsapp-web.js / axios / cheerio

src/processador-ofertas.js
  -> src/ofertas-curadas.js
  -> src/shopee-api-real.js
  -> src/utils-link.js
  -> axios / cheerio / crypto / fs

bin/dashboard-server.js
  -> src/utils-link.js
  -> src/config/paths.js
  -> controla scheduler/lock/fila via arquivos
```

### Violações Arquiteturais Identificadas

| # | Arquivo | Princípio Violado | Impacto | Prioridade |
|---|---------|------------------|---------|-----------|
| 1 | disparo-completo.js | Single Responsibility | Envio, recuperação, anti-repetição, sync de preço e logging no mesmo módulo | Alta |
| 2 | processador-ofertas.js | Separation of Concerns | Busca de APIs, scraping, ranking e curadoria concentrados | Alta |
| 3 | global-lock.js | Robustez de infraestrutura | Estratégia de lock sem aquisição atômica | Alta |
| 4 | bin/dashboard-server.js | Boundary/Control plane | Dashboard mistura observabilidade e ações operacionais críticas | Média |
| 5 | shopee-api-real.js | Camada de integração | Classe API contém bloco de teste executável no mesmo arquivo | Média |

### Arquitetura Proposta
```
[Scheduler Layer]
  agendador-envios
      -> [Application Service] envio-orchestrator

[Application Service]
  envio-orchestrator
      -> offer-selection-service
      -> delivery-service (whatsapp)
      -> retry-policy / ack-policy
      -> persistence-ports (logs, lock, queue)

[Domain Layer]
  ranking
  curadoria
  anti-repeticao
  regras-ml-strict-match

[Infrastructure Layer]
  adapters/shopee
  adapters/mercadolivre-api
  adapters/mercadolivre-scraping
  adapters/whatsapp
  adapters/filesystem

[Observability & Ops]
  dashboard (read model)
  control-actions API separada (com guardrails)
```

### Refatorações Incrementais

#### Fase 1 — Fundação (sem quebrar nada em produção)
1. Extrair interface de lock com implementação atômica (`FileLock.acquire()`), mantendo contrato atual.
2. Introduzir `runContext` único (runId, timestamps, env flags) passado por composição.
3. Isolar políticas de ACK/retry em módulo dedicado.

#### Fase 2 — Separação de Responsabilidades
1. Dividir `processador-ofertas.js` em:
   - `collectors/` (Shopee, ML API, ML scraping)
   - `normalizers/`
   - `ranking/` e `curation/`
2. Extrair `delivery-service` de `disparo-completo.js` (somente envio, media e ACK).
3. Converter regras de anti-repetição em componente puro com testes independentes.

#### Fase 3 — Extensibilidade
1. Definir contrato `MarketplaceAdapter` para incluir novo marketplace sem alterar orquestrador.
2. Adicionar `ChannelAdapter` para futura expansão (ex.: Telegram) sem duplicar domínio.
3. Separar dashboard de leitura da API de ações operacionais (controle).

### Dívida Técnica Catalogada
1. `disparo-completo.js` -> alta concentração de fluxo crítico e lógica de domínio.
Custo de deixar: regressões frequentes em mudanças pequenas.
Custo de corrigir: médio (refatoração por extração gradual).

2. `processador-ofertas.js` -> arquivo muito extenso e multifuncional.
Custo de deixar: onboarding difícil e menor testabilidade.
Custo de corrigir: médio-alto, porém incremental.

3. `global-lock.js` -> sem exclusão atômica de criação.
Custo de deixar: risco intermitente de corrida em produção.
Custo de corrigir: baixo-médio e alto retorno.

4. `bin/dashboard-server.js` -> ações operacionais acopladas à camada de UI/API.
Custo de deixar: superfície de erro operacional maior.
Custo de corrigir: médio (separar control plane).