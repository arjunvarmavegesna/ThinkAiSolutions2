# Cloud Run image for the ThinkAiSolutions Express server.
# Monorepo-aware: builds @thinkai/shared (the server's only workspace dep) then the server.
# Cloud Build builds this remotely via `gcloud run deploy --source .` (no local Docker needed).

# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app

# Install workspace deps from manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

# Source needed to build the backend (the client is NOT part of this image).
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
RUN npm run build:shared && npm -w server run build

# ---- runtime stage ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production deps only; the @thinkai/shared workspace stays symlinked to ./shared.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev && npm cache clean --force

# Compiled output.
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist

# Cloud Run injects PORT (default 8080); the server reads it via config.port and binds 0.0.0.0.
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
