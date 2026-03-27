# 🛡️ Relatório SRE — Radar de Ofertas
**Agente:** Engenheiro de Confiabilidade  
**Data:** 2025-07-25  
**Arquivo principal analisado:** `disparo-completo.js` (~620 linhas), `src/global-lock.js`, `src/processador-ofertas.js`, `bin/dashboard-server.js`

---

## Resumo Executivo

O sistema apresenta uma base sólida de confiabilidade: o global lock tem lógica de stale detection com verificação de PID vivo, o graceful shutdown está implementado para SIGINT/SIGTERM, e o healthcheck existe. O ponto crítico é que **todo o estado de execução é volátil** — uma falha no meio de um ciclo de disparo perde a fila de reprocessamento inteiramente. O segundo risco relevante é que erros transitórios dentro do loop de polling de ACK são engolidos silenciosamente.

---

## Achados

### 🟠 Altos

**1. Fila de reprocessamento em memória — zero resiliência a crashes**
- **Arquivo:** `disparo-completo.js`
- **Problema:** `filaReprocessamento` é um array em memória. Se o processo morrer durante o reprocessamento (queda de luz, kill -9, OOM), todas as ofertas na fila são perdidas sem rastro.
- **Impacto:** Oferta falhou, foi agendada para reprocessamento, processo morreu → oferta nunca foi enviada, nunca ficou no log de falhas como falha final. Invisibilidade total.
- **Solução sugerida:**
```javascript
// Persistir a fila em disco após cada modificação
const FILA_REPROCESS_FILE = path.join(__dirname, 'data', 'fila-reprocessamento.json');

function salvarFilaReprocessamento() {
  try {
    fs.writeFileSync(FILA_REPROCESS_FILE, JSON.stringify(filaReprocessamento, null, 2));
  } catch (e) {
    console.error('[FILA_SAVE_ERR]', e.message);
  }
}

function carregarFilaReprocessamento() {
  try {
    if (!fs.existsSync(FILA_REPROCESS_FILE)) return [];
    const conteudo = fs.readFileSync(FILA_REPROCESS_FILE, 'utf8');
    return JSON.parse(conteudo) || [];
  } catch { return []; }
}
// Na inicialização: filaReprocessamento = carregarFilaReprocessamento();
// Após cada push/splice: salvarFilaReprocessamento();
```

**2. `aguardarAckMensagem` engole erros do bloco polling sem logar**
- **Arquivo:** `disparo-completo.js`
- **Problema:**
```javascript
} catch (err) {
  // ignora erro transitório e continua aguardando
}
```
- **Impacto:** Se `client.getMessageById()` lançar um erro permanente (sessão desconectada, ID inválido), o loop continua por 45 segundos inteiros e retorna `ack=0`, que provoca uma exception "ACK não confirmado" — mas sem rastro do erro original. Diagnóstico impossível.
- **Solução sugerida:**
```javascript
} catch (err) {
  if (!lastPollError || lastPollError !== err.message) {
    console.warn(`[ACK_POLL_WARN] Erro transitório no poll de ACK: ${err.message}`);
    lastPollError = err.message;
  }
}
```

---

### 🟡 Médios

**3. ACK timeout hardcoded (45s) — deveria ser configurável via env**
- **Arquivo:** `disparo-completo.js`
- **Problema:** `aguardarAckMensagem(sent?.id?._serialized, 45000)` — valor fixo no código.
- **Impacto:** Em redes lentas ou picos de carga do WhatsApp, 45s pode ser insuficiente.
- **Solução sugerida:**
```javascript
const ACK_TIMEOUT_MS = Number(process.env.ACK_TIMEOUT_MS || 45000);
const ack = await aguardarAckMensagem(sent?.id?._serialized, ACK_TIMEOUT_MS);
```

**4. Sem circuit breaker para falhas consecutivas de API externa**
- **Arquivo:** `src/processador-ofertas.js`
- **Problema:** Se a API da Shopee retornar erro consecutivamente, o sistema silenciosamente faz fallback para `ofertas-curadas.js` sem alertar o operador.
- **Impacto:** Ofertas dinâmicas podem parar de funcionar por dias sem que ninguém perceba.
- **Solução sugerida:** Registrar fallback no `whatsapp-status.json`:
```javascript
atualizarStatusWhatsapp('api_fallback', { 
  detail: 'Shopee API falhou, usando dados curados',
  api: 'shopee',
  timestamp: Date.now()
});
```

**5. Variável `index` e `ofertas` como globais — sem proteção contra reentrada em `client.on('ready')`**
- **Arquivo:** `disparo-completo.js`
- **Problema:** Se `client.on('ready')` for disparado duas vezes (reconexão automática), `enviarProxima()` seria chamada novamente com `index=0` e `ofertas` repopuladas.
- **Impacto:** Disparos duplicados para o canal.
- **Solução sugerida:**
```javascript
let cicloIniciado = false;
client.on('ready', async () => {
  if (cicloIniciado) {
    console.warn('[WARN] Client "ready" disparado novamente — ignorando reentrada');
    return;
  }
  cicloIniciado = true;
  // ...resto do código
});
```

---

### 🟢 Melhorias (sem urgência)

**6. Log de disparos limitado a 100 entradas** — cobre apenas ~20-33 dias com o cadência atual.  
**Solução:** `if (log.disparos.length > 500) log.disparos = log.disparos.slice(-500);`

**7. Métricas de ACK agregadas ausentes** — sem visibilidade de % de ack=1 vs ack=2 vs ack=-1 ao longo do tempo.  
**Oportunidade:** Adicionar `ackStats` ao endpoint `/api/healthcheck`.

---

### ✅ Pontos Positivos

- Global lock com verificação de PID vivo (`process.kill(pid, 0)`) — excelente design
- SIGINT/SIGTERM handlers liberam lock e destroem client gracefully
- `LOCK_STALE_MS` configurável via env var
- `/api/healthcheck` detecta sessão stale, estado crítico e falhas recentes por hora
- `WHATSAPP_STATUS_FILE` atualizado em todas as transições de estado

---

## Top 3 Ações Imediatas

| Prioridade | Ação | Esforço estimado |
|---|---|---|
| 1 | Persistir `filaReprocessamento` em disco | ~30 min |
| 2 | Logar erros do poll de ACK (não engolit silenciosamente) | ~5 min |
| 3 | Flag `cicloIniciado` em `client.on('ready')` para prevenir reentrada | ~10 min |
