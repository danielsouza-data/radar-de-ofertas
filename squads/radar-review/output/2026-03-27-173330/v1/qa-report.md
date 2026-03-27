## 🧪 Relatório de QA — Radar de Ofertas

### Resumo Executivo
Existe base inicial de testes para componentes importantes (`processador-ofertas` e `global-lock`), mas a cobertura ainda é concentrada em utilitários e regras de normalização. O fluxo crítico de negócio (disparo WhatsApp, scheduler e dashboard operacional) permanece majoritariamente sem testes automatizados. O risco principal é regressão silenciosa em produção.

### Cobertura Atual
- Testes existentes: `src/processador-ofertas.test.js`, `src/global-lock.test.js`
- Cobertura estimada: baixa a moderada no core de seleção/lock; baixa no fluxo fim a fim de envio
- Funções críticas sem teste:
1. `enviarComRecuperacao` e `aguardarAckMensagem` em `disparo-completo.js`
2. `filtrarOfertasNaoEnviadas` com histórico real e janelas
3. `sincronizarPrecoMercadoLivre` (incluindo divergência de product id)
4. Fluxos de `agendador-envios.js` (skip por lock, run-in-progress, restart)
5. Endpoints de ação no dashboard (`restart-stack`, `release-lock`, etc.)

### Bugs Silenciosos Identificados
1. Função/Área: aquisição de lock
Cenário: duas instâncias iniciam quase no mesmo instante.
Evidência: lock via read/write sem exclusão atômica no filesystem.

2. Função/Área: pré-filtro de repetição
Cenário: normalizações diferentes de URL/source podem permitir duplicatas em bordas.
Evidência: chaves compostas variam conforme disponibilidade de campos externos.

3. Função/Área: sincronização de preço ML
Cenário: HTML muda e parser falha silenciosamente retornando preço antigo.
Evidência: warnings sem fallback explícito de qualidade por produto afetado.

### Edge Cases Descobertos
1. API retorna produto sem `image_url` e com preço válido.
2. `ACK_TIMEOUT_MS` expirado com `ack=0`, sem confirmação final.
3. `source_link` com redirect e id divergente do item.
4. `filaReprocessamento` com entradas duplicadas após reinício abrupto.
5. Marketplace único no lote com `RADAR_PRIORITY_MARKETPLACE` ativo.

### Casos de Teste Propostos (Top 5 prioritários)

#### Caso 1: Reenvio recuperável com ACK tardio
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('enviarComRecuperacao confirma envio após retry recuperável', async () => {
  // Given: falha recuperável na 1a tentativa, sucesso na 2a
  // When: função de envio roda com backoff
  // Then: retorna ackFinal >= 1 e tentativas = 2
  assert.ok(true);
});
```

#### Caso 2: Bloqueio de repetição por source_link
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('filtra oferta repetida pelo source_link dentro da janela', () => {
  // Given: histórico com source_link já enviado
  // When: filtrarOfertasNaoEnviadas é executado
  // Then: oferta é removida
  assert.ok(true);
});
```

#### Caso 3: Divergência de product id em sync de preço
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('sincronizarPrecoMercadoLivre não sobrescreve preço com id divergente', async () => {
  // Given: source_link aponta para produto diferente após redirect
  // When: sincronização roda
  // Then: preço original do item é preservado
  assert.ok(true);
});
```

#### Caso 4: Scheduler ignora disparo com lock ativo
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('scheduler registra skip quando lock global está ativo', () => {
  // Given: readLock retorna lock ativo
  // When: executarDisparo é chamado
  // Then: não cria child process e registra lastSkipReason=global_lock_active
  assert.ok(true);
});
```

#### Caso 5: Fluxo dry-run não envia mensagem real
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('RADAR_DRY_RUN evita envio ao WhatsApp e avança fluxo', async () => {
  // Given: RADAR_DRY_RUN=true
  // When: enviarProxima processa item válido
  // Then: contador de enviadas aumenta sem chamar client.sendMessage
  assert.ok(true);
});
```

### Recomendações de Setup
- Framework: `node:test` (já adotado, sem dependência extra)
- Estrutura proposta:
1. `tests/unit/` para utilitários e regras puras
2. `tests/integration/` para disparo/scheduler com mocks
3. `tests/fixtures/` para payloads Shopee/ML e HTMLs reais sanitizados
- Dependências opcionais:
1. `sinon` para spies/stubs
2. `nock` para mock HTTP de APIs externas