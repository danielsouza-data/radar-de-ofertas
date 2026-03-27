#!/usr/bin/env pwsh
param(
  [string]$Tag = "latest",
  [string]$Registry = "danielsouzadata",
  [string]$Repository = "radar-de-ofertas",
  [switch]$Push = $false,
  [switch]$NoBuildCache = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ImageName = "$Registry/$Repository"
$FullTag = "$ImageName`:$Tag"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Output "========================================"
Write-Output "  🐳 DOCKER BUILD & PUSH"
Write-Output "========================================"
Write-Output "Projeto: $ProjectRoot"
Write-Output "Imagem: $FullTag"
Write-Output ""

# Verificar se docker está disponível
try {
  $dockerVersion = & docker --version
  Write-Output "✅ Docker encontrado: $dockerVersion"
}
catch {
  Write-Output "❌ Docker não está disponível. Instale via Scoop: scoop install docker"
  exit 1
}

# Verificar se está autenticado
Write-Output ""
Write-Output "[BUILD] Verificando autenticação Docker..."
try {
  & docker version | Out-Null
  Write-Output "✅ Autenticação Docker OK"
}
catch {
  Write-Output "⚠️  Possível problema de autenticação. Tente: docker login -u $Registry"
  exit 1
}

# Build da imagem
Write-Output ""
Write-Output "[BUILD] Iniciando build da imagem Docker..."
$buildCmd = @("docker", "build", "-t", $FullTag, "-f", (Join-Path $ProjectRoot "Dockerfile"))
if ($NoBuildCache) {
  $buildCmd += "--no-cache"
}
$buildCmd += $ProjectRoot

Write-Output "  Comando: $($buildCmd -join ' ')"
Write-Output ""

& $buildCmd[0] $buildCmd[1..($buildCmd.Length-1)]

if ($LASTEXITCODE -ne 0) {
  Write-Output "❌ Build falhou com código $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Output ""
Write-Output "✅ Build concluído com sucesso!"
Write-Output "   Imagem: $FullTag"

# Listar imagem criada
Write-Output ""
& docker images | Where-Object { $_ -like "*$Repository*" } | Write-Output

# Push (opcional)
if ($Push) {
  Write-Output ""
  Write-Output "[PUSH] Enviando imagem para Docker Hub..."
  Write-Output "  Registry: $Registry"
  Write-Output "  Repository: $Repository"
  Write-Output "  Tag: $Tag"
  Write-Output ""

  & docker push $FullTag

  if ($LASTEXITCODE -ne 0) {
    Write-Output "❌ Push falhou com código $LASTEXITCODE"
    exit $LASTEXITCODE
  }

  Write-Output ""
  Write-Output "✅ Push concluído com sucesso!"
  Write-Output "   Docker Hub: https://hub.docker.com/r/$ImageName"
}
else {
  Write-Output ""
  Write-Output "[INFO] Para fazer push da imagem, execute:"
  Write-Output "  .\scripts\build-docker-image.ps1 -Tag $Tag -Push"
  Write-Output "  ou manualmente:"
  Write-Output "  docker push $FullTag"
}

Write-Output ""
Write-Output "========================================"
Write-Output "  Próximos passos:"
Write-Output "========================================"
Write-Output "1. Executar localmente:"
Write-Output "   docker run -p 3000:3000 $FullTag"
Write-Output ""
Write-Output "2. Ou com volumes:"
Write-Output "   docker run -p 3000:3000 -v %CD%\data:/app/data $FullTag"
Write-Output ""
Write-Output "3. Fazer push (se não foi feito):"
Write-Output "   docker push $FullTag"
Write-Output ""
