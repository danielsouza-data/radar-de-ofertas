# Radar de Ofertas

Projeto de captura e disparo de ofertas via WhatsApp com dashboard operacional local.

## Fluxo atual

- Autenticacao da sessao WhatsApp: `autenticar-sessao.js`
- Disparo oficial pontual: `disparo-completo.js`
- Agendador oficial: `agendador-envios.js`
- Dashboard local: `bin/dashboard-server.js`
- Pipeline de ofertas: `src/processador-ofertas.js`

## Execucao recomendada no Windows

Entre na pasta do projeto e ative o Node portatil:

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

Iniciar modo agendado (5 em 5 min, de 09h ate 22h):

```powershell
node agendador-envios.js
```

Teste controlado com 1 oferta:

```powershell
$env:OFFER_LIMIT = '1'
node disparo-completo.js
```

## Arquivos principais

- `disparo-completo.js`: fluxo oficial de envio
- `agendador-envios.js`: agenda disparos automaticos de 5 em 5 minutos na janela 09h-22h
- `autenticar-sessao.js`: cria ou renova a sessao do WhatsApp
- `bin/dashboard-server.js`: servidor local do dashboard
- `public/dashboard.html`: painel principal
- `public/apis.html`: visualizador dos endpoints
- `data/disparos-log.json`: historico de disparos
- `data/whatsapp-status.json`: estado atual da conexao do WhatsApp

## Regras operacionais

- Usar sempre `disparo-completo.js` como fluxo oficial
- Para rotina diaria, manter `agendador-envios.js` em execucao
- Janela de envios automaticos: 09:00 ate 22:00, todos os dias
- Disparo pontual deve ser feito manualmente quando solicitado
- Ofertas sem imagem sao puladas automaticamente
- O dashboard le os logs locais e o status do WhatsApp
- A sessao autenticada fica salva em `.wwebjs_sessions/producao/`

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
