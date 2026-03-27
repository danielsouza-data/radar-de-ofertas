Node.js portatil esta no diretorio `node-portable/`.

Uso recomendado no PowerShell:

```powershell
cd "C:\Users\daniel.s.santos\Documents\Agents\Radar de Ofertas"
$env:PATH = "$PWD\node-portable;$env:PATH"
node -v
npm.cmd -v
```

Observacao importante:
- no PowerShell, `npm` pode falhar por causa da execution policy do `npm.ps1`
- quando isso acontecer, use `npm.cmd`

Exemplos:

```powershell
npm.cmd install
npm.cmd run dashboard
```

Para executar os scripts principais, `node` direto continua sendo a opcao mais simples:

```powershell
node autenticar-sessao.js
node bin/dashboard-server.js
node disparo-completo.js
```
