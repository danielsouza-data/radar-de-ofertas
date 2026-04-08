## 🔐 Relatório de Segurança — Radar de Ofertas

### Resumo Executivo
A base de segurança está acima do mínimo para um bot solo-operado: `.env` e sessão WhatsApp estão no `.gitignore`, e há mascaramento de segredos no console. Os principais pontos de risco estão na proteção operacional da sessão autenticada, na sanitização de conteúdo externo antes do envio e na falta de rotina formal de auditoria de dependências em pipeline.

### Achados

#### 🔴 Críticos (exploráveis, corrija agora)
1. Sessão autenticada do WhatsApp sem hardening de permissões em runtime.
Trecho: uso de `LocalAuth` em `.wwebjs_sessions/producao` sem validação de ACL/permissão no boot.
Risco real: cópia da pasta de sessão equivale a sequestro de sessão do bot.
Correção: validar permissões no startup, restringir acesso ao usuário do processo e, idealmente, mover sessão para diretório protegido fora do workspace.

#### 🟠 Altos (corrija na próxima sprint)
1. Dados externos entram no texto da mensagem sem sanitização explícita.
Trecho: `formatarMensagem` usa `product_name`, `marketplace` e `link` vindos de fontes externas.
Risco real: injeção de texto malicioso/social engineering no conteúdo enviado.
Correção: normalizar caracteres de controle, limitar tamanho, remover quebras inesperadas e validar URL permitida.

2. Logs de depuração da API Shopee expõem metadados sensíveis.
Trecho: `shopee-api-real.js` imprime App ID, timestamp e prefixo da assinatura.
Risco real: facilita enumeração e fingerprint do cliente em logs compartilhados.
Correção: remover logs de autenticação em produção e manter apenas eventos agregados.

3. Ausência de esteira automatizada de auditoria de dependências.
Trecho: não há script/CI explícito para `npm audit` e atualização de CVEs.
Risco real: vulnerabilidades conhecidas podem permanecer sem detecção contínua.
Correção: incluir auditoria em rotina semanal + gate mínimo no CI.

#### 🟡 Médios (endurecimento)
1. Mascaramento de logs depende da lista de variáveis conhecidas.
Risco: novos segredos fora da lista podem vazar.
Ação: aplicar política de allowlist de campos logáveis e redaction por padrão.

2. Falta de política de retenção/minimização para logs operacionais.
Risco: retenção indevida de metadata operacional ao longo do tempo.
Ação: definir TTL de arquivos e rotação periódica.

#### 🟢 Boas práticas adicionais
1. Assinatura e verificação de integridade para artefatos de automação.
Benefício: reduz risco de tampering local.
Como implementar: hash baseline para scripts críticos e alerta em divergência.

2. Checklist pré-run de segurança.
Benefício: evita execução com env inseguro.
Como implementar: script de preflight validando `.env`, permissões e lock.

### Checklist de Conformidade
- [x] .env no .gitignore
- [~] Credenciais sem hard-code (ok no core; revisar logs de debug)
- [~] PII mascarado nos logs (parcial, precisa política padrão)
- [~] Sessão WhatsApp protegida (ignorando no git, mas sem hardening de ACL)
- [ ] Dependências sem CVE crítico (sem auditoria automatizada evidenciada)
- [x] Processo sem privilégios de root (contexto Windows user-level)