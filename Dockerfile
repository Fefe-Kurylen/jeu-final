FROM node:18-slim

# Install OpenSSL
RUN apt-get update && apt-get install -y openssl libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy rest of the app
COPY . .

# Make start script executable
RUN chmod +x /app/start.sh

# Expose port
EXPOSE 3000

# Start command
CMD ["/bin/bash", "/app/start.sh"]
