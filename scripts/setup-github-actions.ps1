#!/usr/bin/env pwsh
param(
  [string]$GitHubUsername = "seu-usuario",
  [string]$RepositoryName = "radar-de-ofertas",
  [switch]$CloneAndSetup = $false,
  [switch]$PushChanges = $false
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Output "========================================="
Write-Output "  📦 SETUP - GitHub Actions Docker Build"
Write-Output "========================================="
Write-Output ""

# Verificar Git
Write-Output "[GIT] Verificando git..."
try {
  $gitVersion = & git --version
  Write-Output "✅ Git disponível: $gitVersion"
}
catch {
  Write-Output "❌ Git não encontrado. Instale: https://git-scm.com/"
  exit 1
}

# Clonar repositório (se solicitado)
if ($CloneAndSetup) {
  $RepoUrl = "https://github.com/$GitHubUsername/$RepositoryName.git"
  $RepoDir = Join-Path ([System.IO.Path]::GetTempPath()) $RepositoryName
  
  Write-Output ""
  Write-Output "[SETUP] Clonando repositório..."
  Write-Output "  URL: $RepoUrl"
  Write-Output "  Local: $RepoDir"
  
  if (Test-Path $RepoDir) {
    Write-Output "  ⚠️  Diretório já existe, pulando clone..."
  }
  else {
    & git clone $RepoUrl $RepoDir
    Write-Output "✅ Repositório clonado"
  }
}
else {
  $RepoDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  Write-Output "[SETUP] Usando diretório local: $RepoDir"
}

# Verificar GitHub Actions workflow
Write-Output ""
Write-Output "[SETUP] Verificando arquivos de workflow..."

$workflowFile = Join-Path $RepoDir ".github\workflows\docker-build-push.yml"
if (Test-Path $workflowFile) {
  Write-Output "✅ Workflow encontrado: $workflowFile"
}
else {
  Write-Output "⚠️  Workflow não encontrado em: $workflowFile"
}

# Instruções de setup
Write-Output ""
Write-Output "========================================="
Write-Output "  ⚙️  PRÓXIMAS ETAPAS"
Write-Output "========================================="
Write-Output ""
Write-Output "1️⃣  Configure os Secrets no GitHub:"
Write-Output "   URL: https://github.com/$GitHubUsername/$RepositoryName/settings/secrets/actions"
Write-Output ""
Write-Output "   Adicione dois secrets:"
Write-Output "   - DOCKER_USERNAME = danielsouzadata"
Write-Output "   - DOCKER_PASSWORD = seu_token_docker_hub"
Write-Output ""
Write-Output "2️⃣  Faça push dos arquivos:"
Write-Output ""

if ($PushChanges -or (Read-Host "Deseja fazer push agora? (s/n)") -eq "s") {
  Push-Location $RepoDir -StackName MainStack
  
  Write-Output "[GIT] Adicionando arquivos..."
  & git add .
  
  Write-Output "[GIT] Commitando..."
  $message = "ci: Adicionar GitHub Actions build Docker"
  & git commit -m $message
  
  Write-Output "[GIT] Push..."
  & git push
  
  Pop-Location -StackName MainStack
  
  Write-Output "✅ Push concluído!"
  Write-Output ""
  Write-Output "📌 Monitore o build em:"
  Write-Output "   https://github.com/$GitHubUsername/$RepositoryName/actions"
}
else {
  Write-Output "  cd '$RepoDir'"
  Write-Output "  git add ."
  Write-Output "  git commit -m 'ci: Adicionar GitHub Actions build Docker'"
  Write-Output "  git push"
}

Write-Output ""
Write-Output "3️⃣  Verifique a imagem Docker:"
Write-Output "   https://hub.docker.com/r/danielsouzadata/radar-de-ofertas"
Write-Output ""
Write-Output "========================================="
Write-Output "✅ Setup concluído!"
Write-Output "========================================="
