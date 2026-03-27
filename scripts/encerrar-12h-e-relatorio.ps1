param(
  [string]$ProjectRoot = ".",
  [int]$TargetHour = 12,
  [string]$ReportStartIso = "",
  [string]$EmailTo = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location $ProjectRoot

if ([string]::IsNullOrWhiteSpace($ReportStartIso)) {
  $ReportStartIso = (Get-Date).ToString('o')
}

$agora = Get-Date
$fim = Get-Date -Hour $TargetHour -Minute 0 -Second 0
if ($agora -ge $fim) {
  $fim = $agora
}

Write-Output "[AUTO-12H] Monitor iniciado em $($agora.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Output "[AUTO-12H] Acao programada para $($fim.ToString('yyyy-MM-dd HH:mm:ss'))"

while ((Get-Date) -lt $fim) {
  Start-Sleep -Seconds 10
}

Write-Output "[AUTO-12H] 12:00 atingido. Encerrando processos de loop/disparo..."

$targets = Get-CimInstance Win32_Process |
  Where-Object {
    ($_.Name -match 'powershell.exe|pwsh.exe|node.exe') -and (
      ($_.CommandLine -like '*LOOP-5M-12H*') -or
      ($_.CommandLine -like '*disparo-completo.js*') -or
      ($_.CommandLine -like '*check-ml-pool-alert.js*')
    )
  }

foreach ($p in $targets) {
  if ($p.ProcessId -ne $PID) {
    try {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
      Write-Output "[AUTO-12H] Processo encerrado: PID=$($p.ProcessId) Nome=$($p.Name)"
    }
    catch {
      Write-Output "[AUTO-12H] Falha ao encerrar PID=$($p.ProcessId): $($_.Exception.Message)"
    }
  }
}

Write-Output "[AUTO-12H] Gerando relatorio final e enviando por e-mail..."

$env:NODE_OPTIONS = '--no-deprecation'
if (-not [string]::IsNullOrWhiteSpace($EmailTo)) {
  $env:REPORT_EMAIL_TO = $EmailTo
}

& .\node-portable\node.exe .\scripts\generate-final-report.js --since $ReportStartIso --email $EmailTo
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
  Write-Output "[AUTO-12H] Relatorio final concluido com sucesso."
}
else {
  Write-Output "[AUTO-12H] Relatorio final retornou erro (exit=$exitCode)."
}
