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
COPY --from=deps /app/node_modules /app/node_modules
COPY package*.json ./
COPY prisma ./prisma/
COPY data ./data/
COPY src ./src/

EXPOSE 3000

CMD ["node", "src/server.js"]
