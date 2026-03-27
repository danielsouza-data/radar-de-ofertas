param(
  [string]$Username = "danielsouzadata",
  [string]$Token = "",
  [string]$DockerConfigPath = "$env:USERPROFILE\.docker"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Output "[DOCKER-CONFIG] Configurando credenciais Docker localmente..."
Write-Output "[DOCKER-CONFIG] Caminho: $DockerConfigPath"

if ([string]::IsNullOrWhiteSpace($Token)) {
  $Token = $env:DOCKER_PAT
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "Informe o token via -Token ou pela variavel de ambiente DOCKER_PAT."
}

# Criar diretório .docker se não existir
if (-not (Test-Path $DockerConfigPath)) {
  New-Item -ItemType Directory -Path $DockerConfigPath -Force | Out-Null
  Write-Output "[DOCKER-CONFIG] Diretorio criado: $DockerConfigPath"
}

# Codificar credencial em base64 (formato Docker)
$credentials = "$($Username):$($Token)"
$credentialsB64 = [Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes($credentials))

# Certificar que a chave será removida da memória após uso
$Token = $null

# Montar estrutura do config.json
$dockerConfig = @{
  auths = @{
    "https://index.docker.io/v1/" = @{
      auth = $credentialsB64
    }
  }
  credsStore = if ([System.Environment]::OSVersion.Platform -eq "Win32NT") { "wincred" } else { "pass" }
} | ConvertTo-Json -Depth 10

$configFile = Join-Path $DockerConfigPath "config.json"

# Salvar arquivo com permissões restritas
Write-Output "[DOCKER-CONFIG] Salvando em: $configFile"
$dockerConfig | Out-File -FilePath $configFile -Encoding UTF8 -Force

# No Windows, restringir permissões
if ([System.Environment]::OSVersion.Platform -eq "Win32NT") {
  try {
    $acl = Get-Acl $configFile
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $env:USERNAME,
      "FullControl",
      "Allow"
    )
    $acl.SetAccessRule($rule)
    Set-Acl -Path $configFile -AclObject $acl
    Write-Output "[DOCKER-CONFIG] Permissoes restritas ao usuario atual."
  }
  catch {
    Write-Output "[DOCKER-CONFIG] Aviso: nao foi possivel restringir permissoes ($($_.Exception.Message))"
  }
}

Write-Output "[DOCKER-CONFIG] Credenciais Docker pre-configuradas com sucesso!"
Write-Output "[DOCKER-CONFIG] Quando Docker CLI ou Desktop for instalado, as credenciais estarao prontas."
Write-Output ""
Write-Output "[DOCKER-CONFIG] Para usar agora:"
Write-Output "  docker pull seu-repo/sua-imagem"
Write-Output "  docker push seu-repo/sua-imagem"
Write-Output ""
Write-Output "[DOCKER-CONFIG] Arquivo de config: $configFile"

$credentialsB64 = $null
