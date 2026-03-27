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
