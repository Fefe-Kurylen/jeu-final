FROM node:18-slim AS base

# Install OpenSSL (required by Prisma)
RUN apt-get update && apt-get install -y openssl libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencies stage ---
FROM base AS deps

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev
RUN npx prisma generate

# --- Production stage ---
FROM base AS production

COPY --from=deps /app/node_modules /app/node_modules
COPY . .

# Re-generate Prisma client in final image
RUN npx prisma generate

EXPOSE 3000

CMD ["node", "src/server.js"]
