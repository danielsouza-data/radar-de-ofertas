# Como configurar GitHub Actions para Build e Push automático

## 1. Configurar Secrets no repositório GitHub

No seu repositório GitHub, vá para: **Settings → Secrets and variables → Actions**

Adicione dois secrets:

### `DOCKER_USERNAME`
```
danielsouzadata
```

### `DOCKER_PASSWORD`
```
seu_token_docker_hub
```

## 2. Como funciona

O workflow `.github/workflows/docker-build-push.yml` rodará automaticamente quando:

- ✅ Você fizer **push para** `main`, `master` ou `develop`
- ✅ Você criar uma **tag** (ex: `v1.0`, `v1.0.1`)
- ✅ Você disparar manualmente via **Actions → Run workflow**

## 3. Tags geradas automaticamente

Dependendo do seu push:

| Situação | Tags geradas |
|----------|--------------|
| Push para `main` | `latest`, `main`, `sha-xxxxx` |
| Push para `develop` | `develop`, `sha-xxxxx` |
| Tag `v1.0` | `v1.0`, `1.0`, `1`, `sha-xxxxx` |
| Manual (input) | `{seu-input}` |

## 4. Exemplo de uso

```bash
# Clonar seu repositório
git clone https://github.com/seu-usuario/radar-de-ofertas.git
cd radar-de-ofertas

# Fazer alterações
echo "changes" >> README.md

# Commit e push
git add .
git commit -m "Atualizações"
git push origin main

# ✨ GitHub Actions fará build e push automaticamente! ✨
```

## 5. Monitorar status

1. Vá para seu repositório no GitHub
2. Clique em **Actions**
3. Você verá o workflow rodando
4. Após conclusão, verifique: https://hub.docker.com/r/danielsouzadata/radar-de-ofertas

## 6. Criar release com tag

Para disparar automático por tag:

```bash
# Criar uma tag
git tag -a v1.0 -m "Release versão 1.0"

# Push da tag
git push origin v1.0

# ✨ GitHub Actions criará imagem com tags: v1.0, 1.0, 1, latest ✨
```

## 7. Disparar manualmente (sem push)

No repositório GitHub:
1. **Actions** → **Build e Push Docker Image**
2. Clique em **Run workflow**
3. Opcionalmente especifique uma tag customizada

## 📋 Checklist

- [ ] Repositório criado no GitHub (https://github.com/seu-usuario/radar-de-ofertas)
- [ ] Arquivo `.github/workflows/docker-build-push.yml` commitado
- [ ] Secret `DOCKER_USERNAME` adicionado ao repositório
- [ ] Secret `DOCKER_PASSWORD` adicionado ao repositório
- [ ] Push feito para `main` ou tag criada
- [ ] Verificar https://hub.docker.com/r/danielsouzadata/radar-de-ofertas

## Troubleshooting

### "Build failed"
Verifique o log do workflow no GitHub Actions (Actions tab)

### "Authentication failed"
Confira se os secrets estão corretos em: Settings → Secrets and variables → Actions

### "Image não aparece no Docker Hub"
Espere um minuto após o workflow completar (cache do Docker Hub)

## Referências

- GitHub Actions: https://docs.github.com/en/actions
- Docker Build Push Action: https://github.com/docker/build-push-action
- Docker Hub: https://hub.docker.com/r/danielsouzadata/radar-de-ofertas
