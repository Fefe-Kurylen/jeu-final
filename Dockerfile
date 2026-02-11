FROM node:18-slim

# Install OpenSSL + curl for healthcheck
RUN apt-get update && apt-get install -y openssl libssl3 curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install --production

# Generate Prisma client
RUN npx prisma generate

# Copy rest of the app
COPY . .

# Make start script executable
RUN chmod +x /app/start.sh

# Port configurable via env (Fly.io uses 8080, Render uses 10000, local uses 3000)
EXPOSE ${PORT:-8080}

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start command
CMD ["/bin/bash", "/app/start.sh"]
