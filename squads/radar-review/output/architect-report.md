# 🏗️ Relatório de Arquitetura — Radar de Ofertas
**Agente:** Arquiteto de Software  
**Data:** 2025-07-25  
**Arquivo principal analisado:** `disparo-completo.js` (~620 linhas), `src/processador-ofertas.js`, estrutura completa do workspace

---

## Resumo Executivo

O sistema funciona, mas `disparo-completo.js` é um **monólito de 620 linhas com pelo menos 6 responsabilidades distintas** — violação clara do Single Responsibility Principle. Todo o estado do ciclo de execução vive em variáveis globais no escopo do módulo, tornando o código difícil de testar, depurar e evoluir. A estrutura atual não é um obstáculo imediato para produção, mas **qualquer nova funcionalidade** (múltiplos canais, segmentação, rastreamento de cliques) vai amplificar os problemas existentes. O refactoring ideal é incremental — não reescrever, mas extrair responsabilidades em módulos.

---

## Mapa de Responsabilidades Atual em `disparo-completo.js`

| Responsabilidade | Funções principais |
|---|---|
| 💬 Formatação de mensagem | `formatarMensagem()` |
| 🖼️ Carregamento de mídia | `carregarImagemMedia()` |
| 📤 Envio com retry | `enviarComRecuperacao()`, `aguardarAckMensagem()` |
| 📊 Logging de resultados | `registrarDisparo()`, `registrarFalhaDisparo()` |
| 🔁 Filtro anti-spam | `filtrarOfertasNaoEnviadas()`, `carregarHistoricoDisparos()`, `getOfertaKey()` |
| 🎬 Orquestração do ciclo | `enviarProxima()` + estado global |
| ⚙️ Setup do cliente WhatsApp | `new Client(...)` + todos os event handlers |
| 🔒 Gestão de lifecycle | lock acquire/release, SIGINT/SIGTERM, `liberarLock()` |

---

## Achados

### 🟠 Altos

**1. Monólito de 620 linhas — 8 responsabilidades em um arquivo**
- **Problema:** `disparo-completo.js` mistura infraestrutura (WhatsApp client setup), lógica de negócio (formatação, filtro), persistência (logging) e orquestração (ciclo de envio) em um único arquivo.
- **Impacto:**
  - Impossível testar formatação de mensagem sem subir o WhatsApp client
  - Uma mudança no log de disparos pode quebrar o anti-spam (mesma função usa o mesmo arquivo)
  - Dificuldade de reuso: para adicionar um segundo canal, seria necessário duplicar grande parte do arquivo
- **Solução (incremental — sem reescrever):**

  **Fase 1 — Extrair módulos folha (sem dependências internas):**
  ```
  src/
    message-formatter.js    ← formatarMensagem()
    anti-spam.js            ← filtrarOfertasNaoEnviadas(), carregarHistoricoDisparos(), normalizarTexto()
    disparo-logger.js       ← registrarDisparo(), registrarFalhaDisparo()
  ```

  **Fase 2 — Extrair módulos com dependências:**
  ```
  src/
    whatsapp-sender.js      ← enviarComRecuperacao(), aguardarAckMensagem(), carregarImagemMedia()
    whatsapp-client.js      ← new Client(...) + event handlers
  ```

  **Fase 3 — Orquestrador fino:**
  ```
  disparo-completo.js     ← somente enviarProxima() + estado de ciclo (~100 linhas)
  ```

**2. Estado global mutável para controle de ciclo**
- **Problema:** Variáveis como `ofertas`, `index`, `enviadas`, `puladasSemImagem`, `lockAcquired`, `filaReprocessamento`, `tentativasPorOferta`, `cicloReprocessamento` são declaradas no escopo do módulo.
- **Impacto:**
  - Impossível criar dois ciclos de disparo independentes no mesmo processo
  - Testes de integração precisariam resetar estado global manualmente
  - Reentrada acidental em `client.on('ready')` manipula o mesmo estado
- **Solução:** Encapsular em um objeto de estado explícito:
  ```javascript
  function criarEstadoCiclo() {
    return {
      ofertas: [],
      index: 0,
      enviadas: 0,
      puladasSemImagem: 0,
      filaReprocessamento: [],
      tentativasPorOferta: new Map(),
      cicloReprocessamento: 0
    };
  }
  let estadoCiclo = criarEstadoCiclo();
  ```
  Isso não é um grande refactoring — é substituir 7 `let` separados por um objeto, mas abre caminho para isolar o estado em testes.

---

### 🟡 Médios

**3. `processador-ofertas.js` tem acoplamento rígido às implementações de API**
- **Problema:** O módulo importa diretamente `./shopee-api-real.js` e `./ofertas-curadas.js`. Para testar `processador-ofertas.js` em isolamento, é necessário que o arquivo `shopee-api-real.js` exista com credenciais válidas.
- **Solução:** Injeção de dependência simples via parâmetros de função:
  ```javascript
  // Em vez de:
  const ShopeeAffiliateAPI = require('./shopee-api-real.js');
  
  // processador-ofertas.js exporta:
  async function executar(options = {}) {
    const { shopeeApi = new ShopeeAffiliateAPI(), curadas = OFERTAS_CURADAS } = options;
    // ...usar shopeeApi e curadas
  }
  
  // Em testes:
  const resultado = await executar({ shopeeApi: mockShopeeApi, curadas: [] });
  ```

**4. Acumulação de log por leitura + escrita sincrôna em `registrarDisparo()`**
- **Problema:**
  ```javascript
  function registrarDisparo(oferta, ...) {
    let log = { disparos: [] };
    if (fs.existsSync(LOG_DISPAROS)) {
      const conteudo = fs.readFileSync(LOG_DISPAROS, 'utf8'); // síncrono
      log = JSON.parse(conteudo);
    }
    log.disparos.push({...});
    fs.writeFileSync(LOG_DISPAROS, ...); // síncrono
  }
  ```
  O mesmo padrão existe em `registrarFalhaDisparo()`, `atualizarStatusWhatsapp()` e `carregarHistoricoDisparos()`. São 4 arquivos distintos com leituras/escritas síncronas e sem cache. A cada disparo (~5 min), há múltiplas chamadas `readFileSync` e `writeFileSync` desnecessariamente.
- **Solução de curto prazo:** Adicionar um módulo simples de cache em memória para os logs, com flush periódico:
  ```javascript
  // src/disparo-logger.js
  let cache = null;
  function getLog() {
    if (!cache) cache = lerLogDoDisco();
    return cache;
  }
  function salvarLog() {
    if (cache) fs.writeFileSync(LOG_DISPAROS, JSON.stringify(cache, null, 2));
  }
  ```

**5. Ausência de separação entre configuração e código**
- **Problema:** Valores como `LOCK_STALE_MS`, `MAX_REPROCESS_POR_OFERTA`, `INTERVALO_MS`, `OFFER_LIMIT`, `ACK_TIMEOUT_MS` (hardcoded) estão espalhados em múltiplos pontos no arquivo, misturados com lógica.
- **Solução:** Centralizar todos os parâmetros de configuração em `src/config/env.js` (já existe a pasta):
  ```javascript
  // src/config/env.js
  module.exports = {
    CHANNEL_ID: process.env.WHATSAPP_CHANNEL_ID,
    INTERVALO_MS: parseEnvInt('INTERVALO_MS', 300000),
    OFFER_LIMIT: parseEnvInt('OFFER_LIMIT', 0),
    MAX_REPROCESS: parseEnvInt('MAX_REPROCESS_POR_OFERTA', 1),
    ACK_TIMEOUT_MS: parseEnvInt('ACK_TIMEOUT_MS', 45000),
    LOCK_STALE_MS: parseEnvInt('SEND_LOCK_STALE_MS', DEFAULT_STALE_MS),
  };
  ```
  Isso resolve o bug de NaN da QA e centraliza config ao mesmo tempo.

---

### 🟢 Melhorias

**6. `bin/` e `src/` com limites nebulosos**
- `bin/dashboard-server.js` e `bin/dashboard-only.js` ficam em `bin/`, enquanto `src/` tem os módulos de negócio. A separação é razoável, mas `disparo-completo.js` e `autenticar-sessao.js` ficam na raiz em vez de em `bin/`.
- **Oportunidade:** Mover arquivos de entrada para `bin/`: `bin/disparo.js`, `bin/autenticar.js`. Manteria a raiz limpa e a estrutura mais profissional.

**7. `scripts/` está vazio**
- O diretório `scripts/` existe mas está vazio. Os scripts de automação (`.bat`, `.sh`) ficam na raiz. Consolidar em `scripts/` melhoraria a organização.

---

## Mapa de Dependências Atual

```
disparo-completo.js
├── whatsapp-web.js (externo)
├── src/processador-ofertas.js
│   ├── src/shopee-api-real.js
│   └── src/ofertas-curadas.js
├── src/global-lock.js
└── src/log-mask.js

bin/dashboard-server.js (processo separado)
└── data/*.json (arquivos compartilhados com disparo-completo.js)
```

**Problema:** `bin/dashboard-server.js` e `disparo-completo.js` compartilham estado via arquivos em `data/`, o que é uma integração adequada para o porte atual, mas fragil — se os schemas desses JSONs mudarem, o dashboard pode quebrar silenciosamente.

---

## Top 3 Ações de Arquitetura

| Prioridade | Ação | Esforço | Ganho |
|---|---|---|---|
| 1 | Extrair `src/message-formatter.js` + `src/anti-spam.js` + `src/disparo-logger.js` de `disparo-completo.js` | ~2h | Testabilidade, SRP |
| 2 | Centralizar config em `src/config/env.js` com `parseEnvInt` | ~30 min | Elimina bug NaN, remove magic numbers |
| 3 | Encapsular estado de ciclo em objeto `estadoCiclo` ao invés de 7 globais separados | ~30 min | Testabilidade, segurança vs reentrada |
