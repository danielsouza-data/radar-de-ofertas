# 🔐 Relatório de Segurança — Radar de Ofertas
**Agente:** Especialista em Segurança  
**Data:** 2025-07-25  
**Arquivos analisados:** `.gitignore`, `src/processador-ofertas.js`, `src/log-mask.js`, `disparo-completo.js`

---

## Resumo Executivo

O sistema tem uma camada de log masking (`src/log-mask.js`) bem estruturada, mas dois problemas críticos comprometem sua eficácia: **credenciais fora da lista de mascaramento** que aparecem em plaintext nos logs, e **arquivos sensíveis não cobertos pelo `.gitignore`** — incluindo o diretório inteiro de sessão do WhatsApp e o `qr-code.txt`. Um `git push` acidental exporia completamente a sessão autenticada do WhatsApp.

---

## Achados

### 🔴 Críticos

**1. Diretório de sessão WhatsApp NÃO está no `.gitignore`**
- **Arquivo:** `.gitignore`
- **Problema:** O `.gitignore` protege `.wwebjs_auth/`, mas a sessão real é salva em `.wwebjs_sessions/` (configurado em `disparo-completo.js` como `dataPath: '.wwebjs_sessions'`).
  ```
  # .gitignore atual — ERRADO:
  .wwebjs_auth/
  
  # O que deveria estar:
  .wwebjs_sessions/
  ```
- **Impacto:** Se qualquer `git add .` for executado sem perceber, toda a pasta de sessão autenticada do WhatsApp vai para o repositório. Isso exporia o token de sessão, permitindo que qualquer pessoa com acesso ao repo assuma o controle da conta WhatsApp sem reautenticar.
- **Solução:** Substituir `.wwebjs_auth/` por `.wwebjs_sessions/` no `.gitignore`.

**2. `qr-code.txt` não está no `.gitignore`**
- **Arquivo:** `.gitignore` / `qr-code.txt` (existente no workspace)
- **Problema:** O arquivo `qr-code.txt` é gerado durante autenticação e existe no workspace. Não está listado no `.gitignore`.
- **Impacto:** O QR code contém um token de sessão de curta duração, mas se commitado junto com o histórico de autenticações, pode vazar informações sobre a conta.
- **Solução:** Adicionar `qr-code.txt` ao `.gitignore`.

**3. Diretório `data/` não está no `.gitignore`**
- **Arquivo:** `.gitignore`
- **Problema:** `data/` contém `disparos-log.json`, `disparos-falhas.json`, `disparo-global.lock` e potencialmente outros logs de execução com dados sensíveis. Nenhum desses está coberto pelo `.gitignore`.
- **Impacto:** Logs com histórico de ofertas enviadas, timestamps e detalhes de falhas podem ser versionados e expostos.
- **Solução:** Adicionar `data/` ao `.gitignore`.

---

### 🟠 Altos

**4. `ML_CLIENT_ID` e `ML_TOOL_ID` NÃO estão na lista de mascaramento**
- **Arquivo:** `src/processador-ofertas.js` (linhas ~41-44) + `src/log-mask.js`
- **Problema:**
  ```javascript
  // processador-ofertas.js — esses valores SÃO logados:
  console.log(`  ✓ ML Client ID: ${ML_CLIENT_ID}`);   // plaintext, não mascarado
  console.log(`  ✓ ML Tool ID: ${ML_TOOL_ID}`);       // plaintext, não mascarado
  
  // log-mask.js — SENSITIVE_ENV_KEYS não inclui:
  // - MERCADO_LIVRE_CLIENT_ID (o ML_CLIENT_ID)
  // - MERCADO_LIVRE_TOOL_ID   (o ML_TOOL_ID)
  ```
- **Impacto:** Qualquer arquivo de log, terminal compartilhado ou CI/CD log exibirá esses valores em plaintext.
- **Solução:** Adicionar ao `SENSITIVE_ENV_KEYS` em `src/log-mask.js`:
  ```javascript
  const SENSITIVE_ENV_KEYS = [
    'SHOPEE_PARTNER_KEY',
    'SHOPEE_PARTNER_ID',
    'MERCADO_LIVRE_CLIENT_ID',    // ← adicionar
    'MERCADO_LIVRE_TOOL_ID',      // ← adicionar
    'MERCADO_LIVRE_CLIENT_SECRET',
    'MERCADO_LIVRE_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER'
  ];
  ```

**5. Prefixo da Shopee Partner Key vaza apesar do mascaramento**
- **Arquivo:** `src/processador-ofertas.js` (linha ~42) + `src/log-mask.js`
- **Problema:**
  ```javascript
  console.log(`  ✓ Shopee Partner Key: ${SHOPEE_PARTNER_KEY.substring(0, 10)}...`);
  ```
  `patchConsole` mascara ocorrências do valor **completo** da key na string. Mas `.substring(0, 10)` produz os primeiros 10 caracteres — um valor diferente do full key. O mascaramento não encontra match e os 10 caracteres são exibidos em plaintext.
- **Impacto:** Primeiros 10 caracteres da Shopee Partner Key ficam visíveis em logs. Facilita ataques de força bruta ou leakage parcial.
- **Solução:** Remover o log de confirmação de credencial, ou substituir por uma versão sem expor dados:
  ```javascript
  console.log(`  ✓ Shopee Partner Key: ${SHOPEE_PARTNER_KEY ? '[OK]' : '[AUSENTE]'}`);
  ```

---

### 🟡 Médios

**6. Sem sanitização de dados externos antes de enviar via WhatsApp**
- **Arquivo:** `disparo-completo.js` — função `formatarMensagem()`
- **Problema:** Nomes de produtos, preços e descrições vêm da API da Shopee/Mercado Livre e são inseridos diretamente na mensagem sem sanitização.
- **Impacto (baixo contexto atual, médio em expansão):** Se o sistema for expandido para processar produtos de fontes menos confiáveis (web scraping, user-submitted), dados maliciosos poderiam ser formatados e enviados para o canal.
- **Solução:** Adicionar sanitização mínima em `formatarMensagem()`:
  ```javascript
  function sanitizarTexto(texto) {
    if (!texto) return '';
    return String(texto)
      .replace(/[\u0000-\u001F\u007F]/g, '') // remove control chars
      .slice(0, 500); // limite de tamanho
  }
  ```

**7. `patchConsole` não está ativo em `bin/dashboard-server.js`**
- **Arquivo:** `bin/dashboard-server.js`
- **Problema:** `patchConsole()` é chamado em `disparo-completo.js` e `autenticar-sessao.js`, mas não no servidor do dashboard.
- **Impacto:** Se variáveis sensíveis forem logadas no processo do dashboard-server, não serão mascaradas.
- **Solução:** Adicionar no topo de `bin/dashboard-server.js`:
  ```javascript
  const { patchConsole } = require('../src/log-mask');
  patchConsole();
  ```

---

### 🟢 Melhorias

**8. `src/historico-ofertas.json` potencialmente no repo (fora de `src/`)**  
O arquivo `historico-ofertas.json` existe em dois lugares: na raiz e em `src/`. Se contiver dados de produtos com preços e histórico, poderia ser tratado como dado operacional e excluído do git:  
`historico-ofertas.json` → adicionar ao `.gitignore`

---

## `.gitignore` corrigido (diff)

```diff
  node_modules/
  .env
  .env.local
  logs/
- .wwebjs_auth/
+ .wwebjs_sessions/
  session.json
+ qr-code.txt
+ data/
+ historico-ofertas.json
+ src/historico-ofertas.json
  *.log
  .DS_Store
  dist/
  build/
```

---

## Top 3 Ações Imediatas

| Prioridade | Ação | Esforço | Impacto |
|---|---|---|---|
| 1 | Corrigir `.gitignore`: trocar `.wwebjs_auth/` → `.wwebjs_sessions/`, adicionar `qr-code.txt`, `data/` | 2 min | 🔴 Crítico |
| 2 | Adicionar `MERCADO_LIVRE_CLIENT_ID` e `MERCADO_LIVRE_TOOL_ID` ao `SENSITIVE_ENV_KEYS` | 5 min | 🟠 Alto |
| 3 | Remover log do prefixo da Shopee Partner Key (substituir por `[OK]`/`[AUSENTE]`) | 5 min | 🟠 Alto |
