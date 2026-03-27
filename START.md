# RADAR DE OFERTAS - INICIO RAPIDO

## 1. Fluxo mais simples

No Windows, voce pode usar diretamente:

```bat
operacao-completa.bat
```

Esse launcher:

- sobe o dashboard em janela separada
- abre o dashboard no navegador automaticamente
- verifica se a sessao WhatsApp existe
- pergunta se voce quer autenticar, testar, iniciar agendamento, fazer disparo pontual ou rodar diagnostico
- pede confirmacao antes do disparo em producao
- registra a execucao em `data/launcher.log`

## 2. Fluxo manual

Se preferir executar tudo manualmente:

## 2.1 Preparar terminal

```powershell
cd "C:\Users\daniel.s.santos\Documents\Agents\Radar de Ofertas"
$env:PATH = "$PWD\node-portable;$env:PATH"
```

## 2.2 Autenticar WhatsApp

```powershell
node autenticar-sessao.js
```

O que esperar:

- abre o Chrome para login
- gera QR Code no terminal se necessario
- salva a sessao em `.wwebjs_sessions/producao/`

## 2.3 Subir dashboard

```powershell
node bin/dashboard-server.js
```

Acesso:

- `http://localhost:3000/`
- `http://localhost:3000/dashboard.html`

## 2.4 Rodar disparo oficial

Modo agendado (recomendado para rotina):

```powershell
node agendador-envios.js
```

Regra do agendamento:

- a cada 5 minutos
- todos os dias
- das 09:00 ate 22:00 (America/Sao_Paulo)

Producao:

```powershell
node disparo-completo.js
```

Teste com 1 oferta:

```powershell
$env:OFFER_LIMIT = '1'
node disparo-completo.js
```

## 2.5 Validar no dashboard

Verifique:

- status do WhatsApp no topo
- novo item no historico de disparos
- endpoint `http://localhost:3000/api/whatsapp-status`

## Observacoes

- o fluxo oficial usa `disparo-completo.js`
- para rotina diaria, use `agendador-envios.js`
- o dashboard le `data/disparos-log.json`
- o status do WhatsApp e publicado em `data/whatsapp-status.json`
