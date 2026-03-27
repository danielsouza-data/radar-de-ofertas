# Docker Build & Push - Radar de Ofertas

Este guia explica como fazer build da imagem Docker e enviar para o repositório `danielsouzadata/radar-de-ofertas`.

## Pré-requisitos

✅ **Já configurado:**
- Docker CLI v29.3.1 instalado via Scoop
- Credenciais Docker pré-configuradas em `~/.docker/config.json`
- Dockerfile otimizado pronto em `/Dockerfile`
- Scripts de build prontos em `/scripts/`

⚠️ **Necessário:**
- Docker Daemon rodando (opções abaixo)

## Opções para rodar Docker Daemon

### Opção 1: Docker Desktop (com privilégios admin)
```powershell
scoop install docker-desktop
```

### Opção 2: Docker via WSL2 (recomendado, sem admin)
```powershell
# Instalar WSL2
wsl --install

# Dentro do WSL2, instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# No Windows PowerShell:
# Apontar Docker CLI para daemon WSL
$env:DOCKER_HOST="npipe:////./pipe/docker_wsl"
```

### Opção 3: Executar Daemon localmente
```powershell
dockerd --storage-driver=windows
```

## Build da Imagem

### Via PowerShell Script (recomendado)

```powershell
# Build sem push
.\scripts\build-docker-image.ps1 -Tag "v1.0"

# Build e push automático
.\scripts\build-docker-image.ps1 -Tag "v1.0" -Push
```

### Via Node.js Script

```powershell
# Build sem push
node .\scripts\build-docker-image.js --tag v1.0

# Build e push automático
node .\scripts\build-docker-image.js --tag v1.0 --push
```

### Via Docker CLI Direto

```powershell
# Build
docker build -t danielsouzadata/radar-de-ofertas:v1.0 .

# Push
docker push danielsouzadata/radar-de-ofertas:v1.0
```

## Executar Imagem Localmente

```powershell
# Comando básico (dashboard na porta 3000)
docker run -p 3000:3000 danielsouzadata/radar-de-ofertas:v1.0

# Com volumes para dados persistentes
docker run -p 3000:3000 -v $PWD\data:/app/data danielsouzadata/radar-de-ofertas:v1.0

# Com variáveis de ambiente
docker run -p 3000:3000 `
  -e SHOPEE_PARTNER_ID=seu-id `
  -e SHOPEE_PARTNER_KEY=sua-chave `
  danielsouzadata/radar-de-ofertas:v1.0
```

## Tags Recomendadas

```
danielsouzadata/radar-de-ofertas:latest      # Versão mais recente
danielsouzadata/radar-de-ofertas:v1.0        # Release versioned
danielsouzadata/radar-de-ofertas:prod        # Production
danielsouzadata/radar-de-ofertas:dev         # Development
```

## Estrutura da Imagem Docker

```
Dockerfile             - Multi-stage otimizado com Node.js Alpine
.dockerignore          - Arquivos excluídos do build
scripts/build-docker-image.ps1    - Script PowerShell de build
scripts/build-docker-image.js     - Script Node.js de build
```

### Otimizações aplicadas:

1. **Multi-stage build:** reduz tamanho final (apenas dependências de produção)
2. **Alpine Linux:** base mínima (~50MB vs 900MB+ de outras imagens)
3. **Cache eficiente:** package.json copiado antes da aplicação
4. **Health check:** endpoint `/api/healthcheck` automaticamente verificado
5. **Volumes:** `/app/data` e `/app/logs` para persistência
6. **Credenciais seguras:** não hardcoded na imagem

## Credenciais Docker

Suas credenciais estão pré-configuradas em:
```
~/.docker/config.json
```

Login automático para: `danielsouzadata`
Repositório: `radar-de-ofertas`

Uma vez com Docker Daemon rodando, o push será totalmente automático.

## Troubleshooting

### "Docker daemon not running"
```powershell
# Opção 1: Inicie WSL2
wsl -e docker run alpine echo "Hello from Docker"

# Opção 2: Inicie daemon manualmente
dockerd
```

### "unauthorized: authentication required"
```powershell
# Reautenticar (credenciais já estão em ~/.docker/config.json)
docker login -u danielsouzadata
```

### "error parsing config file: invalid character"
Já foi corrigido (removemos BOM do config.json).

## Next Steps

1. Configure Docker Daemon (WSL2 recomendado)
2. Execute: `.\scripts\build-docker-image.ps1 -Tag "v1.0" -Push`
3. Verifique em: https://hub.docker.com/r/danielsouzadata/radar-de-ofertas

## Referências

- Docker: https://docs.docker.com/
- WSL2: https://docs.microsoft.com/en-us/windows/wsl/
- Scoop: https://scoop.sh/
