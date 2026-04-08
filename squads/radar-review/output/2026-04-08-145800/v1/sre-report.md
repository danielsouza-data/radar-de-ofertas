## 🛡️ Relatório SRE — Radar de Ofertas

### Resumo Executivo
O sistema apresenta maturidade em controle de concorrência com o `global-lock.js`, mitigando disparo de instâncias paralelas. No entanto, é necessário aprofundar as estratégias de graceful degradation no pipeline principal (`processador-ofertas.js`), garantindo limites mais estritos de memory leak e observabilidade end-to-end nas integrações dos marketplaces.

### Achados

#### 🔴 Críticos
1. **Falta de Validação do Healthcheck em APIs Externas** → Se a API do Shopee ou ML estiver intermitente, os processos de scrapers mascaram o erro ou travam consumindo processo indefinidamente. → Implementar `/health` para monitorar uptime de terceiros ativamente e suspender disparos (Circuit Breaker).
2. **Lock sem Backoff na Liberação** → Se houver "stale_lock_remove_error", o sistema falha instantaneamente na inicialização, gerando downtime do scheduler. → Adicionar loop de retry com jitter/backoff e log de alerta crítico (pager.duty equivalente).

#### 🟠 Altos
1. **Fila de Processamento In-Memory** → Se houver um crash inesperado (ex: OOM Kill do Node.js) durante o parsing de múltiplas ofertas no `processador-ofertas.js`, não há retomada limpa. O estado do histórico é salvo parcialmente. → Mover o tracking parcial de conclusão das tarefas para checkpoints no disco ou banco SQLite antes e depois do `enviarOferta`.
2. **Falta de timeout explícito no Global Lock fallback** → A checagem `isPidAlive(Number(lockData.pid))` funciona para instâncias locais (mesma máquina), mas falha em ambientes conteinerizados ou multi-node. → Migrar a estratégia do lock local (FS) para o uso de locks distribuídos (ex: Redis com TTL dinâmico).

#### 🟡 Médios
1. **Alarme Ativo para ACKs Omitidos** → Não há um monitoramento central focado exclusivamente nos retornos negativos do `whatsapp-web.js`. → Agregar logs de timeout e ACK <= 0, disparando alerta via Telegram/Slack para o operador (Daniel).
2. **Stale MS Defaults Hardcoded** → O valor de 2 horas em `DEFAULT_STALE_MS` é excessivamente longo para processos curtos de scraping, travando a janela de scheduler por muito tempo se uma task morrer de forma zumbi. → Reduzir para um default baseado no p99 do tempo de processamento (~5 min).

#### 🟢 Melhorias (sem urgência)
1. **Padronização dos Logs por Correlação** → A escalabilidade dos logs fica limitada sem um RequestID rastreável por oferta. → Gerar um UUID por batch no scheduler e passar o ID `run_id` para todo o log de contexto.
2. **Métricas Customizadas Prometheus** → Monitoramento ativo em tempo real usando counters (`disparos_sent`, `timeouts_ack`) expostos em porta /metrics. → Expor endpoint HTTP na thread principal para gravação futura no Grafana.

### Top 3 Ações Imediatas
1. Implementar Circuit Breaker na camada do `processador-ofertas.js` evitando travamentos quando APIs (ML/Shopee) estiverem instáveis.
2. Mudar a checagem de lock de `fs` para algo seguro multi-node ou corrigir a dependência crítica de `isPidAlive` que restringe o bot a rodar em single-SO.
3. Adicionar UUID (trace_id) a cada batch injetado no job, passando até o estágio do broker de mensagens.
