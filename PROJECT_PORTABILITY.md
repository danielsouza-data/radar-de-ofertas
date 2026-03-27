# 🚀 Guia de Portabilidade - Migração Entre Máquinas

## Visão Geral

Este projeto foi estruturado para ser **100% portável** entre máquinas diferentes. Não há caminhos absolutos (`C:/Users/...`) hardcoded no código.

---

## ✅ Como Funciona a Portabilidade

### Arquitetura de Paths

Todos os caminhos são definidos em **um único lugar**:

```
src/config/paths.js
    ↓
Usado por todos os scripts (disparo-completo.js, agendador-envios.js, etc)
    ↓
Automaticamente adaptado à máquina
```

### Exemplo de Path Relativo

```javascript
// ❌ ANTES (não portável):
const filePath = 'C:\\Users\\daniel\\Documents\\Radar-de-Ofertas\\data\\disparos-log.json';

// ✅ DEPOIS (portável):
const { PATHS } = require('./src/config/paths');
const filePath = PATHS.DISPAROS_LOG;
// Funciona em: Windows, Mac, Linux, Docker, VPS, qualquer lugar!
```

---

## 📋 Setup em Nova Máquina

### 1. Clone o repositório

```bash
# Em Windows
git clone https://github.com/seu-usuario/radar-de-ofertas.git
cd radar-de-ofertas

# Em macOS/Linux
git clone https://github.com/seu-usuario/radar-de-ofertas.git
cd radar-de-ofertas
```

### 2. Instale dependências

```bash
# Windows (se tiver node global)
npm install

# Ou use o node portável (já incluído)
.\node-portable\node.exe -v
.\node-portable\npm install
```

### 3. Configure credenciais

```bash
# Copiar template
cp .env.example .env

# Editar valores REAIS
nano .env   # macOS/Linux
notepad .env  # Windows
```

### 4. (Opcional) Teste os paths

```bash
# Mostrar configuração de paths para esta máquina
node src/config/paths.js

# Output esperado:
# ========================================
# 📁 CONFIGURAÇÃO DE PATHS
# ========================================
# RAIZ: /caminho/para/radio-de-ofertas
# 
# DIRETÓRIOS:
#    BIN  → /caminho/para/bin
#    SRC  → /caminho/para/src
#    DATA → /caminho/para/data
#    ... (etc)
```

### 5. Inicie os processos

```bash
# Dashboard
node bin/dashboard-server.js

# Agendador (em outro terminal)
node agendador-envios.js

# Monitor até 17:00
powershell scripts/encerrar-12h-e-relatorio.ps1 -TargetHour 17
```

---

## 🌍 Variáveis de Ambiente para Paths Customizados

Se a estrutura padrão não funcionar, use variáveis de ambiente:

```bash
# Use uma raiz diferente
export RADAR_PROJECT_ROOT=/opt/meu-radar

# Ou localize ML pool em outro lugar
export MERCADO_LIVRE_LINKBUILDER_LINKS_FILE=/dados/meli-links.txt

# Depois inicie
node disparo-completo.js
```

---

## 📊 Estrutura de Diretórios (Automática)

O script cria automaticamente todos esses diretórios se não existirem:

```
radar-de-ofertas/                    (ROOT)
├── src/
│   ├── config/
│   │   └── paths.js           ← Configuração de paths
│   ├── historico-ofertas.json
│   └── ...
├── bin/
│   └── dashboard-server.js
├── data/                        ← Criado automaticamente
│   ├── disparos-log.json
│   ├── disparos-falhas.json
│   ├── fila-reprocessamento.json
│   ├── scheduler-status.json
│   ├── whatsapp-status.json
│   ├── disparo-global.lock
│   ├── ml-pool-alert-state.json
│   └── reports/
├── logs/                        ← Criado automaticamente
├── .wwebjs_sessions/            ← Criado automaticamente
├── .wwebjs_cache/               ← Criado automaticamente
└── .env                         ← NÃO versionado (em .gitignore)
```

---

## 🐳 Docker / Container

Para rodar em Docker sem hardcoding paths:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copiar apenas package.json (não cria paths ainda)
COPY package*.json ./

# Instalar
RUN npm ci

# Copiar código (paths criados no runtime)
COPY . .

# Expor porta
EXPOSE 3000

# Iniciar com paths automático
CMD ["node", "bin/dashboard-server.js"]
```

**Build & Run:**
```bash
docker build -t radar-de-ofertas .

# Injete .env via variáveis
docker run \
  --env-file .env.production \
  -e RADAR_PROJECT_ROOT=/app \
  -p 3000:3000 \
  radar-de-ofertas
```

---

## 🔧 Troubleshooting

### Erro: "ENOENT: no such file or directory"

**Causa:** Diretório não foi criado automaticamente  
**Solução:**
```bash
node -e "const { ensureDirectories } = require('./src/config/paths'); ensureDirectories();"
```

### Paths aparecem errados

**Causa:** Variável `RADAR_PROJECT_ROOT` mal configurada  
**Solução:**
```bash
# Verificar
echo $RADAR_PROJECT_ROOT

# Resetar
unset RADAR_PROJECT_ROOT  # Linux/macOS
set RADAR_PROJECT_ROOT=   # Windows PowerShell

# Verificar novamente
node src/config/paths.js
```

### Erro em Windows com "/"

**Causa:** Node `path` cuida disso automaticamente (usa `\` no Windows)  
**Solução:** Não fazer nada — já está funcional!

---

## 🎯 Melhores Práticas

### ✅ FAZER:
```javascript
// 1. Importar paths centralizado
const { PATHS } = require('./src/config/paths');

// 2. Usar paths do objeto
const logFile = PATHS.DISPAROS_LOG;

// 3. Chamar ensureDirectories() na startup
const { ensureDirectories } = require('./src/config/paths');
ensureDirectories();
```

### ❌ EVITAR:
```javascript
// Não fazer isso:
const logFile = '/home/user/projeto/data/disparos-log.json';  // ❌
const logFile = 'C:\\Users\\daniel\\...';  // ❌
const logFile = '../../../data/disparos.json';  // ❌ (frágil)
```

---

## 📱 Exemplo Real: Adicionar Novo Path

Se precisar adicionar um novo arquivo:

**1. Edite `src/config/paths.js`:**
```javascript
// Adicione em DATA_FILES:
MEU_NOVO_ARQUIVO: path.join(DIRS.DATA, 'meu-novo-arquivo.json'),
```

**2. Use em qualquer script:**
```javascript
const { PATHS } = require('./src/config/paths');
const minhaFile = PATHS.MEU_NOVO_ARQUIVO;
fs.writeFileSync(minhaFile, JSON.stringify(dados));
```

**Pronto!** Funciona em Windows, Mac, Linux, Docker, VPS...

---

## 🚀 Resumo

| Aspecto | Antes | Depois |
|--------|-------|--------|
| **Portabilidade** | ❌ Hardcoded | ✅ Automática |
| **Migração** | 🔴 Difícil | 🟢 Plug & Play |
| **Manutenção** | 🔴 Múltiplos lugares | 🟢 Centralizado |
| **Docker** | 🔴 Requer build | 🟢 Genérico |
| **Configuração** | 🔴 Manual | 🟢 Auto |

---

**Última atualização:** 2026-03-27  
**Responsável:** Otimização de Portabilidade  
**Status:** ✅ Implementado e documentado
