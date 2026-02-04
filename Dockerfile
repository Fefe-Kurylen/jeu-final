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

# Expose port
EXPOSE 3000

# Create startup script that ensures DB is ready
RUN echo '#!/bin/bash\necho "Pushing database schema..."\nnpx prisma db push --accept-data-loss --skip-generate\necho "Starting server..."\nnode src/server.js' > /app/start.sh && chmod +x /app/start.sh

# Start command
CMD ["/bin/bash", "/app/start.sh"]
