param(
  [string]$ProjectRoot = ".",
  [int]$TargetHour = 17,
  [string]$ReportStartIso = "",
  [string]$EmailTo = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location $ProjectRoot

$envFile = Join-Path $ProjectRoot '.env'

function Set-EnvValueInFile {
  param(
    [string]$FilePath,
    [string]$Key,
    [string]$Value
  )

  if (-not (Test-Path $FilePath)) {
    return
  }

  $lines = Get-Content $FilePath
  $updated = $false

  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^$([regex]::Escape($Key))=") {
      $lines[$i] = "$Key=$Value"
      $updated = $true
      break
    }
  }

  if (-not $updated) {
    $lines += "$Key=$Value"
  }

  Set-Content -Path $FilePath -Value $lines
}

function Switch-ToTestChannel {
  param([string]$FilePath)

  if (-not (Test-Path $FilePath)) {
    Write-Output '[AUTO-17H] Aviso: .env nao encontrado para retorno ao grupo de testes.'
    return
  }

  $envMap = @{}
  Get-Content $FilePath | ForEach-Object {
    if ($_ -match '^(?<key>[A-Z0-9_]+)=(?<value>.*)$') {
      $envMap[$matches.key] = $matches.value
    }
  }

  $testChannelName = $envMap['WHATSAPP_TEST_CHANNEL_NAME']
  $testChannelId = $envMap['WHATSAPP_TEST_CHANNEL_ID']

  if ([string]::IsNullOrWhiteSpace($testChannelName) -or [string]::IsNullOrWhiteSpace($testChannelId)) {
    Write-Output '[AUTO-17H] Aviso: variaveis WHATSAPP_TEST_CHANNEL_NAME/ID nao configuradas; grupo de testes nao foi restaurado.'
    return
  }

  Set-EnvValueInFile -FilePath $FilePath -Key 'WHATSAPP_CHANNEL_NAME' -Value $testChannelName
  Set-EnvValueInFile -FilePath $FilePath -Key 'WHATSAPP_CHANNEL_ID' -Value $testChannelId
  Write-Output "[AUTO-17H] Ambiente reposicionado para o grupo de testes: $testChannelName"
}

if ([string]::IsNullOrWhiteSpace($ReportStartIso)) {
  $ReportStartIso = (Get-Date).ToString('o')
}

$agora = Get-Date
$fim = Get-Date -Hour $TargetHour -Minute 0 -Second 0
if ($agora -ge $fim) {
  $fim = $agora
}

Write-Output "[AUTO-17H] Monitor iniciado em $($agora.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Output "[AUTO-17H] Acao programada para $($fim.ToString('yyyy-MM-dd HH:mm:ss'))"

while ((Get-Date) -lt $fim) {
  Start-Sleep -Seconds 10
}

Write-Output "[AUTO-17H] 17:00 atingido. Enviando mensagem de encerramento no grupo..."

& .\node-portable\node.exe .\scripts\enviar-mensagem-encerramento.js
$msgExitCode = $LASTEXITCODE
if ($msgExitCode -eq 0) {
  Write-Output "[AUTO-17H] Mensagem de encerramento enviada com sucesso."
}
else {
  Write-Output "[AUTO-17H] Aviso: mensagem de encerramento nao foi enviada (exit=$msgExitCode)."
}

Write-Output "[AUTO-17H] Encerrando processos de loop/disparo..."

Switch-ToTestChannel -FilePath $envFile

$targets = Get-CimInstance Win32_Process |
  Where-Object {
    ($_.Name -match 'powershell.exe|pwsh.exe|node.exe') -and (
      ($_.CommandLine -like '*LOOP-5M-12H*') -or
      ($_.CommandLine -like '*agendador-envios.js*') -or
      ($_.CommandLine -like '*disparo-completo.js*') -or
      ($_.CommandLine -like '*check-ml-pool-alert.js*')
    )
  }

foreach ($p in $targets) {
  if ($p.ProcessId -ne $PID) {
    try {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
      Write-Output "[AUTO-17H] Processo encerrado: PID=$($p.ProcessId) Nome=$($p.Name)"
    }
    catch {
      Write-Output "[AUTO-17H] Falha ao encerrar PID=$($p.ProcessId): $($_.Exception.Message)"
    }
  }
}

Write-Output "[AUTO-17H] Gerando relatorio final e enviando por e-mail..."

$env:NODE_OPTIONS = '--no-deprecation'
if (-not [string]::IsNullOrWhiteSpace($EmailTo)) {
  $env:REPORT_EMAIL_TO = $EmailTo
}

& .\node-portable\node.exe .\scripts\generate-final-report.js --since $ReportStartIso --email $EmailTo
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
  Write-Output "[AUTO-17H] Relatorio final concluido com sucesso."
}
else {
  Write-Output "[AUTO-17H] Relatorio final retornou erro (exit=$exitCode)."
}
