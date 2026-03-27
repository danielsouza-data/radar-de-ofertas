# 🔒 Guia de Segurança - Radar de Ofertas

## Visão Geral

Este projeto **NÃO expõe credenciais em repositórios públicos** quando seguidas as práticas abaixo.

---

## ✅ Checklist de Segurança

### Git & Repositório

- [x] `.env` está em `.gitignore` (credenciais não são commitadas)
- [x] `.wwebjs_sessions/` está em `.gitignore` (autenticação WhatsApp local)
- [x] `data/` está em `.gitignore` (dados sensíveis de runtime)
- [x] `.env.example` é commitado (template sem valores reais)
- [x] Histórico git não contém credenciais hardcoded

**Verificar regularmente:**
```bash
# Procurar secrets no histórico (lento, último recurso)
git log --all -S "SHOPEE_PARTNER_KEY" --oneline

# Arquivos tracked vs gitignored
git ls-files | grep -E "(env|session|key|secret|token)"
```

---

## 🔐 Credenciais & Variáveis de Ambiente

### Setup Seguro (Primeira Execução)

```bash
# 1. Copiar template
copy .env.example .env

# 2. Editar com valores reais
# Abra .env e preencha apenas valores CONFIDENCIAIS:
#   - SHOPEE_PARTNER_KEY
#   - MERCADO_LIVRE_CLIENT_SECRET
#   - WHATSAPP_CHANNEL_ID
#   - etc

# 3. Verificar .env local NÃO seja commitado
git status  # .env não deve aparecer

# 4. Rodar projeto
npm start
```

### Dados Sensíveis a Proteger

| Arquivo/Var | Sensibilidade | Ação |
|---|---|---|
| `.env` | 🔴 CRÍTICA | Adicionar a `.gitignore` ✓ |
| `.wwebjs_sessions/` | 🔴 CRÍTICA | Adicionar a `.gitignore` ✓ |
| `SHOPEE_PARTNER_KEY` | 🔴 CRÍTICA | Nunca commitar |
| `MERCADO_LIVRE_CLIENT_SECRET` | 🔴 CRÍTICA | Nunca commitar |
| `WHATSAPP_CHANNEL_ID` | 🟠 MÉDIA | Pode expor grupo alvo |
| `data/disparos-log.json` | 🟠 MÉDIA | Contém histórico de envios |

---

## 🌐 Repositório Público: Riscos Mitigados

### Se o repositório for público:

✅ **SEGURO:**
- Código-fonte (lógica não é segredo)
- Estrutura de arquivos
- `.env.example` (template vazio)
- CI/CD configuração genérica
- Screenshots de interface

❌ **INSEGURO (se exposto):**
- Credenciais reais do `.env`
- Sessões autenticadas do WhatsApp
- IDs de grupos/canais ativos
- Histórico de ofertas com dados PII

### Proteção Implementada:

```
📋 .gitignore
├── .env ........................... (credenciais reais)
├── .wwebjs_sessions/ .............. (auth WhatsApp local)
├── data/ .......................... (dados de runtime)
└── logs/ .......................... (histórico de erros)

✓ .env.example ..................... (template apenas)
✓ README.md ........................ (documentação pública)
✓ src/ ............................ (código fonte)
```

---

## 🐳 Docker: Boas Práticas

### Se criar imagem Docker:

```dockerfile
# ❌ NUNCA:
ENV SHOPEE_PARTNER_KEY=abc123...
COPY .env /app/

# ✅ SEMPRE:
# 1. Usar Docker secrets (production)
# 2. Passar via --env-file em runtime
# 3. Usar variáveis vazias na imagem build
```

**Build seguro:**
```bash
# Não incluir .env
docker build --rm -t radar-de-ofertas:latest .

# Rodar com secrets injetados
docker run \
  --env-file .env \
  -p 3000:3000 \
  radar-de-ofertas:latest
```

---

## 🚨 Incidente: Se credencial foi exposta

### Ação imediata:

1. **Revoke** credenciais no painel do serviço:
   - Shopee: https://open.shopee.com/ → Regenerar API key
   - ML: https://developers.mercadolivre.com.br/ → Revocar token
   
2. **Remove** do histórico git:
   ```bash
   # Usar git-filter-branch ou BFG Repo Cleaner
   bfg --delete-files .env
   ```

3. **Update** `.env` local com novos valores

4. **Notifique** mudança via Slack/Email (se no time)

---

## 📊 Auditoria Periódica

**Mensal:**
```bash
# Verificar o que está tracked
git ls-files | wc -l

# Procurar patterns sensíveis
git ls-files | xargs grep -l "SHOPEE\|MERCADO\|callback_url"

# Status de segurança
git status   # .env não deve aparecer
```

**Antes de cada push:**
```bash
# Ver o que vai subir
git diff --cached

# Limpar credenciais acidentadas
git reset .env
git checkout -- .env
```

---

## ✨ Resumo Final

| Aspecto | Status | Ação |
|---|---|---|
| Credenciais em .env | ✅ Protegidas | Mantém em `.gitignore` |
| Repositório público | ✅ Seguro | Sem dados sensíveis expostos |
| Docker images | ⚠️ Cuidado | Não hardcode secrets |
| Auditoria git | ✅ OK | Nenhuma chave exposta |
| Rotação de credentials | 📅 Planejado | Revisar semestral |

**Conclusão:** Você pode manter o repositório público com segurança. 🎯

---

**Última atualização:** 2026-03-27  
**Responsável:** Daniel  
**Status:** ✅ Implementado
