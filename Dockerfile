FROM node:20-slim AS base

# OpenSSL is required by the Prisma engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencies stage ---
FROM base AS deps

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev
RUN npx prisma generate

# --- Production stage ---
FROM base AS production

ENV NODE_ENV=production
COPY --from=deps --chown=node:node /app/node_modules /app/node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma/
COPY --chown=node:node data ./data/
COPY --chown=node:node src ./src/
# Procedural terrain shared with the client (army routes are computed on the same world)
COPY --chown=node:node frontend/js/shared ./frontend/js/shared/

# The API never needs root
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
