FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund
COPY . .
EXPOSE 4000
USER node
CMD ["node", "server.js"]
