# Ajuste forçado para garantir build limpo no workflow (2026)

# Dockerfile otimizado para Radar de Ofertas (2026)
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine
WORKDIR /app

LABEL maintainer="comercial.danielsantos@gmail.com"
LABEL description="Radar de Ofertas - Multi-marketplace enxuto"
LABEL version="2.0"

# Copiar dependências e app
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY .env.example ./
COPY public/ ./public/
COPY src/ ./src/
COPY ml-cookies.json ./
COPY ml-access-token.json ./
COPY ml-linkbuilder.js ./

# Criar diretórios persistentes
RUN mkdir -p /app/data /app/logs && chmod -R 755 /app

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-deprecation"

# Volumes para persistência
VOLUME ["/app/data", "/app/logs"]

# Comando padrão: executar pipeline principal
CMD ["node", "src/processador-ofertas.js"]
