## 🔐 Relatório de Segurança — Radar de Ofertas

### Resumo Executivo
O sistema apresenta uma boa fundação de segurança no controle de repositório, com um `.gitignore` maduro que previne o vazamento de credenciais e de sessões autenticadas do WhatsApp (`.wwebjs_cache/`, `qr-code.txt`, `.env`). No entanto, a sanitização de PII nos logs e o uso de dependências subjacentes exigem atenção para garantir que dados de ofertas e assinantes não sejam expostos indevidamente em caso de comprometimento da máquina host.

### Achados

#### 🔴 Críticos (exploráveis, corrija agora)
1. **Falta de Sandbox no Playwright** → Se o scraping consumir um site de afiliado ou payload comprometido do Mercado Livre, a execução headless rodará com os privilégios do usuário atual do Node.js. → Iniciar o browser context com permissões reduzidas e desabilidade execução remota não intencional via Playwright.

#### 🟠 Altos (corrija na próxima sprint)
1. **Mascaramento parcial de PII nos Logs** → Verifiquei a presença de scripts de log (`log-mask.js`), porém é fundamental assegurar que números de telefone capturados no webhook/broadcast e CPFs de contatos não sejam guardados em texto pleno em `logs/*.log` ou no output do PM2. → Integrar o PII mask regex em todo evento logger central, usando RegExp robustas para ocultar dados de telefone (ex: `+55 11 9***-****`).
2. **Atualização de Segurança nas Dependências** → O `package.json` visível na raiz traz o playwright mas não consolida as dependências principais de produção do projeto (que parecem dispersas ou unidas a outras estruturas). É urgente unificar as dependências em um manifesto estrito e ativitar o `npm audit` no CI/CD para previnir CVEs de pacotes acessórios como manipulação YAML e scraping web.

#### 🟡 Médios (endurecimento)
1. **Proteção da sessão ativa do WhatsApp** → O diretório de cache (`.wwebjs_cache/`) atua como um cookie autenticado com validade estendida. Qualquer pessoa que extrair essa pasta conseguirá invadir a conta do bot do WhatsApp Web. → Recomenda-se rodar o bot no Windows/Linux sob um usuário próprio sem privilégios globais e cujo acesso à root directory seja restrito via File System Permissions (chmod 700).

#### 🟢 Boas práticas adicionais
1. **Variaveis de ambiente pré-verificadas** → Fazer parsing rigoroso das credenciais via Joi ou Zod logo no bootstrap. Se uma `API_KEY` for vazia ou suspeita, travar a execução do bot antes mesmo da inicialização do scraper, para bloquear falhas lógicas e de acesso indevido.

### Checklist de Conformidade
- [x] .env no .gitignore
- [x] Sessão WhatsApp protegida no controle de código
- [ ] Credenciais sem hard-code (necessita dupla verificação nos scrapers `.js`)
- [ ] PII mascarado em rotinas de log do core
- [ ] Processo sem privilégios excessivos do host OS
