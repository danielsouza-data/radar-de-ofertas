# Relatório de Diagnóstico e Correção — OAuth/PKCE Mercado Livre

## Diagnóstico

- O script `playwright-ml-auth.js` está lendo o valor de `redirect_uri` do `.env` corretamente, mas o valor atual é `https://www.example.com/auth`, que não corresponde ao redirect_uri cadastrado no app Mercado Livre.
- O erro exibido é `strict_redirect_uri_mismatch`, indicando que o valor enviado na requisição OAuth não bate exatamente com o valor registrado no painel de desenvolvedor do Mercado Livre.
- O fluxo PKCE está sendo executado, mas não chega a gerar o código de autorização devido ao erro de redirect_uri.

## Correção Recomendada

1. **Verifique o valor correto do redirect_uri cadastrado no painel do app Mercado Livre.**
   - O valor deve ser idêntico (inclusive barra final, protocolo, etc) ao que está no `.env`.
   - Exemplo: se o painel mostra `https://webhook.site/xxxxxx`, o `.env` deve conter exatamente esse valor.
2. **Atualize o `.env`**:
   - Altere a linha `ML_REDIRECT_URI=` para o valor correto.
   - Salve o arquivo e reinicie o fluxo Playwright.
3. **Valide o fluxo:**
   - Execute novamente `playwright-ml-auth.js`.
   - O navegador deve redirecionar para o redirect_uri correto e gerar o código de autorização.
   - Siga com o script de troca de token normalmente.

## Recomendações para evitar regressão

- Adicione um teste automatizado que lê o `.env`, executa o fluxo Playwright e valida se o redirect_uri está correto antes de iniciar o login.
- Sempre que alterar o redirect_uri no painel do Mercado Livre, atualize imediatamente o `.env`.
- Mantenha logs de debug explícitos para variáveis críticas (redirect_uri, client_id, code_challenge).

## Status

- [x] Diagnóstico realizado
- [x] Correção instruída
- [ ] Teste automatizado sugerido
- [ ] Fluxo validado após ajuste

---

Se precisar de auxílio para automatizar o teste ou revisar o fluxo após ajuste, acione o agente OAuth/PKCE novamente.