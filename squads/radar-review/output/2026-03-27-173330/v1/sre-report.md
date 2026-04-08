## 🛡️ Relatório SRE — Radar de Ofertas

### Resumo Executivo
O sistema já possui boas bases de confiabilidade para operação contínua: lock global, fila de reprocessamento, ACK gate e encerramento graceful. Os maiores riscos atuais estão em concorrência de lock não-atômica, falta de healthcheck operacional direto do worker de envio e ausência de política de retry com circuit breaker para integrações externas. A curto prazo, é possível elevar bastante a resiliência sem reescrever arquitetura.

### Achados

#### 🔴 Críticos
1. Lock global com condição de corrida potencial na aquisição.
Problema: `acquireGlobalLock` faz read + write sem primitiva atômica do SO, permitindo janela de corrida se duas instâncias iniciarem quase simultaneamente.
Impacto: disparos duplicados e estado inconsistente.
Solução sugerida: usar criação atômica de lock (`open` com `wx`/`O_EXCL`) e owner token único por execução.

#### 🟠 Altos
1. Ausência de health endpoint do processo de disparo.
Problema: status é persistido em JSON, mas não há endpoint de health/liveness do worker.
Impacto: detecção tardia de falha em produção e dificuldade de automação de restart.
Solução sugerida: expor health mínimo (estado WhatsApp, lock, fila, último ACK) em endpoint local ou heartbeat dedicado.

2. Retry sem circuit breaker para integrações externas.
Problema: envio e sincronização de preço tentam recuperação local, porém não há breaker global para degradação de APIs/HTML do Mercado Livre.
Impacto: ciclos com latência alta e possíveis cascatas de timeout.
Solução sugerida: breaker por integração com janela de erro e fallback explícito por tempo.

#### 🟡 Médios
1. Observabilidade parcialmente estruturada.
Problema: há logs úteis, mas sem correlação fixa por ciclo (`runId`) em todos os eventos.
Impacto: investigação pós-incidente mais lenta.
Solução sugerida: incluir `runId`, `offerKey`, `messageId` e `attempt` em todos os logs críticos.

2. Gestão de stale lock fixa em 2h pode atrasar recuperação.
Problema: TTL padrão pode ser longo em alguns cenários de falha curta.
Impacto: janela de indisponibilidade até expiração ou intervenção manual.
Solução sugerida: ajustar TTL operacional por ambiente e alertar lock ativo acima do esperado.

#### 🟢 Melhorias (sem urgência)
1. Métricas operacionais derivadas no dashboard.
Oportunidade: exibir taxa de sucesso por ciclo, tempo médio até ACK e taxa de reprocessamento.
Benefício: tuning de confiabilidade orientado por dados.
Como implementar: agregar em `data/disparos-log.json` e expor via endpoint já existente.

2. Auto-heal de filas órfãs.
Oportunidade: rotina de saneamento para fila de reprocessamento travada.
Benefício: menor intervenção manual.
Como implementar: job de reconciliação no startup do scheduler.

### Top 3 Ações Imediatas
1. Tornar aquisição do lock global atômica para eliminar corrida de dupla execução.
2. Criar healthcheck operacional do worker com status de lock, fila e ACK.
3. Adicionar circuit breaker para chamadas externas (Mercado Livre e mídia).