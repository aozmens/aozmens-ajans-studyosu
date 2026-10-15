# Ajans Stüdyosu: tek kapsayıcı (API + derlenmiş arayüz). Veriler /data diskinde kalır.
FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY agents ./agents
COPY assets ./assets
COPY --from=web /app/web/dist ./web/dist
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server/index.js"]
