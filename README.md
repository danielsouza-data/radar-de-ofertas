# Commit de teste para validar workflow Docker no GitHub Actions (2026)



# Radar de Ofertas — Estrutura Otimizada (2026)

Este projeto realiza a captura, curadoria e disparo de ofertas multi-marketplace (Mercado Livre, Amazon, Shopee) com integração de sessões, cookies e credenciais persistentes. O sistema foi otimizado para manter apenas o núcleo funcional, histórico, logs, sessões e documentação.

## Como usar

1. **Pré-requisitos:**
  - Node.js instalado (ou use o node portátil se disponível)
  - Preencha o arquivo `.env` com suas credenciais e configurações
  - Certifique-se de que os arquivos `ml-cookies.json` e `ml-access-token.json` estejam presentes para integração Mercado Livre
  - Sessões WhatsApp são mantidas em `.wwebjs_sessions/` e `.wwebjs_cache/`

2. **Execução principal:**
  - O pipeline central está em `src/processador-ofertas.js`
  - Os drivers de marketplaces estão em `src/marketplaces/`
  - Para rodar manualmente:
    ```bash
    node src/processador-ofertas.js
    ```
  - O dashboard local pode ser acessado via arquivos em `public/` (ex: `public/dashboard.html`)

3. **Logs e histórico:**
  - Logs operacionais: `logs/`
  - Histórico de ofertas: `data/`

4. **Restauração de arquivos antigos:**
  - Todos os arquivos e scripts removidos foram movidos para `_backup_cleanup_2026/` no diretório raiz.
  - Caso precise restaurar algum script legado, basta mover o arquivo desejado de `_backup_cleanup_2026/` de volta para o diretório principal.

## Estrutura dos principais diretórios

- `src/` — Lógica principal, drivers de marketplaces, utilitários, serviços
- `data/` — Logs, históricos, arquivos de operação
- `logs/` — Logs operacionais (vazio por padrão)
- `public/` — Interface mínima (dashboard, APIs, monitor)
- `.wwebjs_sessions/` e `.wwebjs_cache/` — Sessões e cache do WhatsApp
- `_opensquad/` — Orquestração e memória Opensquad
- `_backup_cleanup_2026/` — Backup dos arquivos removidos

## Observações importantes

- **Atenção:** Scripts antigos, binários portáveis, dashboards legados e utilitários foram removidos para garantir segurança, performance e manutenção simplificada.
- **Sessões, cookies e credenciais** foram preservados. Não compartilhe esses arquivos publicamente.
- **Para restaurar qualquer funcionalidade antiga**, consulte `_backup_cleanup_2026/`.
- **Documentação detalhada** sobre variáveis de ambiente, integrações e fluxo operacional está disponível nos arquivos `SECURITY.md`, `DOCKER.md`, `PROJECT_PORTABILITY.md` e `START.md`.

---

## Execução manual (avançado)

Se preferir executar manualmente, entre na pasta do projeto e ative o Node portátil:

```powershell
cd "C:\Users\daniel.s.santos\Documents\Agents\Radar de Ofertas"
$env:PATH = "$PWD\node-portable;$env:PATH"
```

## Comandos principais

Autenticar sessao do WhatsApp:

```powershell
node autenticar-sessao.js
```

Subir dashboard:

```powershell
node bin/dashboard-server.js
```

Enviar ofertas em producao:

```powershell
node disparo-completo.js
```

Iniciar modo agendado (5 em 5 min, de 09h ate 17h):

```powershell
node agendador-envios.js
```


> **Nota:** O sistema agora processa sempre todo o lote disponível de ofertas. Para testes controlados, utilize filtros no pipeline de ofertas ou ajuste temporário no código, pois a limitação por OFFER_LIMIT foi removida.

## Arquivos principais

- `disparo-completo.js`: fluxo oficial de envio
- `agendador-envios.js`: agenda disparos automaticos de 5 em 5 minutos na janela 09h-17h
- `autenticar-sessao.js`: cria ou renova a sessao do WhatsApp
- `bin/dashboard-server.js`: servidor local do dashboard
- `public/dashboard.html`: painel principal
- `public/apis.html`: visualizador dos endpoints
- `data/disparos-log.json`: historico de disparos
- `data/whatsapp-status.json`: estado atual da conexao do WhatsApp


## Regras operacionais

- Use sempre `disparo-completo.js` como fluxo oficial para envio de ofertas.
- Para rotina diária, mantenha `agendador-envios.js` em execução.
- Janela de envios automáticos: 09:00 até 17:00, todos os dias.
- Override diário (somente para uma data específica):
  - `SCHEDULE_OVERRIDE_DATE=YYYY-MM-DD`
  - `SCHEDULE_OVERRIDE_START_HOUR=8`
  - `SCHEDULE_OVERRIDE_END_HOUR=17`
  - Exemplo: para aplicar apenas hoje, defina `SCHEDULE_OVERRIDE_DATE` com a data de hoje.
- Disparo pontual deve ser feito manualmente quando solicitado.
- Ofertas sem imagem são puladas automaticamente.
- O dashboard lê os logs locais e o status do WhatsApp.
- Health operacional inclui heartbeat do worker de disparo em `data/disparo-worker-health.json`.
- Control plane operacional roda separado em `bin/control-plane-server.js`.

> **Importante:** Não há mais limitação de "primeiros 6" ou "1/6, 2/6". O sistema envia todas as ofertas disponíveis no lote, sem cortes.
- A sessao autenticada fica salva em `.wwebjs_sessions/producao/`

## Runbook de homologacao e producao

- Homologacao deve usar grupo dedicado de testes, sem reutilizar o canal normal de producao
- Em homologacao, manter `RADAR_TEST_MODE=true` para bloquear envio acidental ao `WHATSAPP_PROD_CHANNEL_ID`
- Essa trava tambem vale para `scripts/enviar-mensagem-encerramento.js`, evitando mensagem final acidental no grupo de producao durante testes
- Ao validar Mercado Livre, manter `MERCADO_LIVRE_LINKBUILDER_REQUIRE_SHORT=true` e `MERCADO_LIVRE_LINKBUILDER_STRICT_MATCH=true`
- Em `STRICT_MATCH=true`, item de Mercado Livre sem mapa exato nao pode usar fallback do pool de `meli.la`
- Para testes focados em ML, pode-se usar temporariamente `RADAR_ONLY_MARKETPLACE=ml`
- Para validar volume ML em homologacao, a curadoria pode ser relaxada temporariamente com `CURADORIA_MIN_SALES=0` e `CURADORIA_MIN_RATING=0`
- Encerrada a homologacao, restaurar `WHATSAPP_CHANNEL_NAME` e `WHATSAPP_CHANNEL_ID` para o grupo normal e reiniciar `agendador-envios.js` e `bin/dashboard-server.js`
- Antes de voltar para producao, encerrar processos/sessoes de teste e limpar `data/disparo-global.lock` se existir
- No encerramento das 17:00, o monitor envia a mensagem final no grupo normal e depois reposiciona o `.env` para o grupo de testes automaticamente
- Lock global agora usa aquisicao atomica para reduzir risco de corrida entre instancias
- Integracoes externas de Shopee/ML e sync de preco agora usam circuit breaker para degradacao graciosa em falhas repetidas

## Control Plane

- Iniciar: `npm run control:plane`
- Health: `GET http://localhost:3001/api/control/health`
- Acoes: `POST http://localhost:3001/api/control/action`
  - `release-lock`, `clear-queue`, `stop-disparo`, `restart-scheduler`, `restart-stack`
- Se `CONTROL_PLANE_TOKEN` estiver definido no `.env`, enviar header `x-control-token`

## Segurança operacional

- Sanitizacao basica dos campos externos (produto/marketplace/link) aplicada antes do envio de mensagem ao WhatsApp
- Auditoria de dependencias: `npm run security:audit`
  - Nivel de corte padrao: `moderate`
  - Para ajustar: `SECURITY_AUDIT_MAX_LEVEL=high npm run security:audit`

## Tracking de cliques (CTR)

- O disparo gera links rastreaveis via rota `GET /r/:token`
- Se `RADAR_PUBLIC_BASE_URL` nao estiver definido, o fallback local e `http://localhost:3000`
- Para medir CTR real em usuarios externos, configure `RADAR_PUBLIC_BASE_URL` com dominio publico
- Endpoints:
  - `GET /api/tracking-stats` resumo de envios rastreados e cliques
  - `GET /r/:token` redirect + registro de clique
- Dashboard exibe:
  - `Cliques Unicos`
  - `CTR Tracking`
  - Top campanhas por categoria/marketplace

## Variaveis novas recomendadas

- `RADAR_PUBLIC_BASE_URL`: base para links rastreaveis (ex.: `https://seu-dominio.com`)
- `SCHEDULER_STATUS_HEARTBEAT_MS`: heartbeat do scheduler (padrao `60000`)
- `WHATSAPP_READY_HEARTBEAT_MS`: heartbeat da sessao WhatsApp pronta (padrao `60000`)
- `WHATSAPP_SESSION_PERMISSIONS_STRICT`: `true` para bloquear startup com ACL/permissao insegura
- `DEBUG_SHOPEE_AUTH`: `true` apenas para diagnostico local
- `MORNING_OPENING_ENABLED`: `true` para enviar mensagem de abertura antes do primeiro envio do dia
- `OFFERS_CTA_EVENT_DATE`: data do CTA em formato `YYYY-MM-DD` (ex.: `2026-04-04`)

## Mensagem de abertura diaria

- Antes do primeiro envio do dia, o disparo envia uma abertura no grupo com bom dia + CTA do evento configurado
- Controle de envio 1x por dia por grupo em: `data/daily-opening-state.json`
- Se precisar desativar temporariamente a abertura: `MORNING_OPENING_ENABLED=false`

## Mercado Livre

- Pool oficial do Link Builder expandida e persistida em `mercadolivre-linkbuilder-links.txt`
- Mapa produto -> shortlink persistido em `mercadolivre-linkbuilder-map.txt`
- Anti-repeticao de ML agora considera link enviado, `source_link/raw_link` e `product_id`, evitando reenvio do mesmo produto com shortlink diferente
- O Link Builder pode recusar algumas URLs; nesses casos, elas devem ser descartadas sem quebrar o pareamento de ordem do lote
- Pre-validacao formal de lote (obrigatoria antes de merge):
  - Comando (dry-run): `node scripts/prevalidate-ml-linkbuilder-batch.js --input data/ml-linkbuilder-input-30f.txt --output data/ml-linkbuilder-output-30f.txt`
  - O script valida contagem (entrada == shortlinks), duplicidade e colisao com pool/mapa ja existentes
  - Artefatos gerados: arquivo de pares e relatorio JSON com status `approved`
  - Merge oficial (somente se aprovado): adicionar `--apply` no mesmo comando
  - Atalho operacional: `validar-ml-lote.bat` (auto dry-run), `validar-ml-lote.bat auto apply` (auto merge) ou `validar-ml-lote.bat 30f` / `validar-ml-lote.bat 30f apply`

## Atualizacoes recentes (Mar/2026)

- Portabilidade de paths centralizada em `src/config/paths.js`
- Dashboard e scripts principais migrados para `PATHS` (sem hardcode de `C:\\Users\\...`)
- Encerramento automatico ajustado para 17:00 com monitor `scripts/encerrar-12h-e-relatorio.ps1`
- Correcao de lock residual: `data/disparo-global.lock` agora e limpo no reinicio operacional
- Balanceamento de marketplaces no envio: alternancia 1x1 entre Shopee e Mercado Livre quando ambos existem no lote
- Anti-repeticao ajustado para nao suprimir em excesso ofertas do Mercado Livre

### Funcoes novas/ajustadas no envio (`disparo-completo.js`)

- `ehMarketplaceMercadoLivre(marketplace)`: identifica variantes de nome do marketplace ML
- `ehMarketplaceShopee(marketplace)`: identifica Shopee de forma padronizada
- `filtrarOfertasNaoEnviadas(...)`: agora preserva elegibilidade de ML e aplica alternancia Shopee -> ML no retorno final

### Resultado esperado em runtime

- Com Shopee + ML disponiveis no ciclo, os envios seguem o loop:
  1. Shopee
  2. Mercado Livre
  3. Shopee
  4. Mercado Livre
- O dashboard continua atualizado por `data/disparos-log.json` e `data/whatsapp-status.json`
