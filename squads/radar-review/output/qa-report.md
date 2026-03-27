# 🧪 Relatório de QA — Radar de Ofertas
**Agente:** Analista de QA  
**Data:** 2025-07-25  
**Arquivos analisados:** `disparo-completo.js`, `src/processador-ofertas.js`, `src/global-lock.test.js`, `package.json`

---

## Resumo Executivo

A cobertura de testes está **quase zerada** — existe apenas um arquivo de testes para `global-lock.js` (5 testes), enquanto toda a lógica de negócio core (filtragem, deduplicação, formatação, ACK gate) não tem nenhum teste. Além disso, foram encontrados dois bugs silenciosos de relevância média: uma colisão de hash quando `product_id` é `undefined`, e o anti-spam tornando-se ineficaz sem aviso quando o arquivo de histórico está corrompido. Um terceiro bug potencial envolve env vars malformados silenciosamente virar `NaN`.

---

## Achados

### 🟠 Altos

**1. Cobertura de testes insuficiente — lógica core sem testes**
- **Situação atual:**
  - ✅ `src/global-lock.test.js` — 5 testes, bem estruturados
  - ❌ Zero testes para `formatarMensagem()`, `gerarHashOferta()`, `ofertaTemImagem()`, `normalizarTexto()`, `filtrarOfertasNaoEnviadas()`, `carregarHistoricoDisparos()`, `aguardarAckMensagem()`
- **Impacto:** Qualquer refatoração nestas funções pode introduzir regressão sem ser detectada. A função de deduplicação (`filtrarOfertasNaoEnviadas`) é crítica — um bug aqui causa spam para o canal.
- **Função de risco mais alto sem teste:** `filtrarOfertasNaoEnviadas` — falha silenciosa (bug 3 abaixo).
- **Sugestão:** Iniciar com testes unitários para `normalizarTexto`, `gerarHashOferta`, `ofertaTemImagem`, `filtrarOfertasNaoEnviadas`.

**2. `gerarHashOferta` com `product_id` falsy causa colisão de hash**
- **Arquivo:** `src/processador-ofertas.js` (linha ~68)
- **Código:**
  ```javascript
  function gerarHashOferta(oferta) {
    const str = `${oferta.marketplace}-${oferta.product_id}-${Math.floor(oferta.price)}`;
    return crypto.createHash('md5').update(str).digest('hex');
  }
  ```
- **Problema:** Se `product_id` for `undefined`, `null`, `0` ou string vazia, o hash gerado é determinístico a partir de `"Shopee-undefined-0"`. Qualquer outra oferta Shopee com preço entre R$ 0 e R$ 0,99 e sem product_id produziria o mesmo hash — sendo erroneamente marcada como duplicata e descartada.
- **Caso real:** API Shopee retorna produto sem `itemId` (erro de campo opcional) → todos esses produtos se tornam "vistos" após o primeiro.
- **Solução:**
  ```javascript
  function gerarHashOferta(oferta) {
    const marketplace = oferta.marketplace || 'unknown';
    const productId = oferta.product_id;
    const price = oferta.price;
    
    // Não gerar hash se dados essenciais estão ausentes
    if (!productId || price == null) return null;
    
    const str = `${marketplace}-${productId}-${Math.floor(price)}`;
    return crypto.createHash('md5').update(str).digest('hex');
  }
  ```

**3. `carregarHistoricoDisparos()` com falha silenciosa — anti-spam se torna ineficaz**
- **Arquivo:** `disparo-completo.js` (função `carregarHistoricoDisparos`)
- **Problema:**
  ```javascript
  } catch (err) {
    console.error('[LOG_READ_ERR]', err.message);
    return { seenLinks: new Set(), seenProdutos: new Set() };
  }
  ```
  Se o arquivo `disparos-log.json` estiver corrompido (disco cheio, escrita parcial, edição manual errada), a função retorna Sets vazios **sem abortar o disparo**. O programa continua e envia todas as ofertas como se nenhuma tivesse sido enviada antes.
- **Impacto:** Spam no canal com todas as ofertas reenviadas após qualquer corrupção de log.
- **Solução:** Ao detectar falha na leitura do histórico, abortar o ciclo de disparo:
  ```javascript
  } catch (err) {
    console.error('[LOG_READ_ERR] CRÍTICO: histórico corrompido, abortando ciclo', err.message);
    throw new Error(`Histórico de disparos ilegível: ${err.message}`);
  }
  ```
  Ou ao menos registrar no status do WhatsApp para alertar o operador.

---

### 🟡 Médios

**4. Variáveis numéricas de env sem validação — `NaN` silencioso**
- **Arquivo:** `disparo-completo.js` (linhas ~25-29)
- **Código:**
  ```javascript
  const INTERVALO_MS = Number(process.env.INTERVALO_MS || 300000);
  const OFFER_LIMIT = Number(process.env.OFFER_LIMIT || 0);
  const MAX_REPROCESS_POR_OFERTA = Number(process.env.MAX_REPROCESS_POR_OFERTA || 1);
  ```
- **Problema:** Se a variável de ambiente existe mas tem valor inválido (ex: `INTERVALO_MS=5min`), o `|| 300000` não dispara (string `"5min"` é truthy), e `Number("5min")` = `NaN`. Resultado: `setTimeout(enviarProxima, NaN)` — que executa **imediatamente** (NaN vira 0), fazendo o sistema disparar todas as ofertas sem intervalo.
- **Impacto:** Configuração errada no `.env` pode causar spam em burst.
- **Solução:**
  ```javascript
  function parseEnvInt(val, defaultVal) {
    const n = Number(val);
    return (Number.isFinite(n) && n > 0) ? n : defaultVal;
  }
  const INTERVALO_MS = parseEnvInt(process.env.INTERVALO_MS, 300000);
  ```

**5. `filtrarOfertasNaoEnviadas` descarta ofertas sem link silenciosamente**
- **Arquivo:** `disparo-completo.js`
- **Código:**
  ```javascript
  const ofertaLink = normalizarTexto(oferta?.link);
  if (ofertaLink && seenLinks.has(ofertaLink)) return false;
  ```
- **Problema:** A lógica de anti-repetição pula a verificação por link se `ofertaLink` é vazio, mas não sinaliza que a oferta está sem link. Uma oferta com `link = ''` passa pelo filtro como "nova" e será enviada no WhatsApp com link vazio, gerando uma mensagem inútil.
- **Solução:** Logar um aviso para ofertas sem link antes de incluí-las:
  ```javascript
  if (!ofertaLink) {
    console.warn(`[ANTISPAM_WARN] Oferta sem link: "${oferta?.product_name}"`);
  }
  ```

---

### 🟢 Melhorias

**6. Testes para `global-lock.js` estão bem escritos — estender o padrão**
- O arquivo `src/global-lock.test.js` é um ótimo exemplo de estrutura: usa `node:test` nativo, caminhos temporários aleatórios, cleanup via `releaseGlobalLock`. Ao criar novos testes, seguir exatamente este padrão.

**7. `src/ofertas-curadas.js` não tem validação de schema**
- Os produtos curados têm campos variados (alguns têm `imageUrl`, outros `image_url`). Se um produto curado for adicionado manualmente sem `price`, `Math.floor(undefined)` = `NaN` em `gerarHashOferta`. Considerar adicionar validação de schema mínima ao carregar os curados.

---

## Mapa de Cobertura Atual

| Módulo | Testado? | Risco |
|---|---|---|
| `global-lock.js` | ✅ 5 testes | Baixo |
| `formatarMensagem()` | ❌ | Médio |
| `gerarHashOferta()` | ❌ | **Alto** |
| `ofertaTemImagem()` | ❌ | Médio |
| `normalizarTexto()` | ❌ | Baixo |
| `filtrarOfertasNaoEnviadas()` | ❌ | **Alto** |
| `carregarHistoricoDisparos()` | ❌ | **Alto** |
| `aguardarAckMensagem()` | ❌ | Médio |
| `shopee-api-real.js` | ❌ | Médio |

---

## Top 3 Ações Imediatas

| Prioridade | Ação | Esforço |
|---|---|---|
| 1 | Adicionar testes unitários para `gerarHashOferta` (incluindo `product_id` undefined) | ~1h |
| 2 | Validar env vars numéricas com `parseEnvInt()` — evita NaN silencioso | ~15 min |
| 3 | Adicionar testes para `filtrarOfertasNaoEnviadas` com histórico corrompido e link vazio | ~1h |
