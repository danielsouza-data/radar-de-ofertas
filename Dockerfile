# Build stage - preparar dependências
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar apenas package.json primeiro para melhor cache
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && \
    npm cache clean --force

# Runtime stage - imagem final
FROM node:20-alpine

WORKDIR /app

# Metadados
LABEL maintainer="comercial.danielsantos@gmail.com"
LABEL description="Radar de Ofertas - Agregador inteligente de ofertas com WhatsApp"
LABEL version="1.0"

# Copiar node_modules do builder
COPY --from=builder /app/node_modules ./node_modules

# Copiar aplicação
COPY src/ ./src/
COPY bin/ ./bin/
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY package*.json ./
COPY .env.example .env.example

# Copiar dados iniciais (se existirem)
COPY data/ ./data/ || true
COPY public/ ./public/ || true

# Criar diretório de logs e dados
RUN mkdir -p /app/data /app/logs && \
    chmod -R 755 /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/healthcheck', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Expor porta do dashboard
EXPOSE 3000

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-deprecation"
ENV PORT=3000

# Volume para dados persistentes
VOLUME ["/app/data", "/app/logs"]

# Comando padrão: iniciar dashboard
CMD ["node", "bin/dashboard-server.js"]

# Alternativas de comando (descomentar conforme necessário):
# CMD ["node", "disparo-completo.js"]
# CMD ["node", "agendador-envios.js"]
