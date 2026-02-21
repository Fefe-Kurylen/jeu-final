const { PrismaClient } = require('@prisma/client');
const config = require('./index');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('FATAL: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const prisma = new PrismaClient({
  log: config.isProduction ? ['error'] : ['error', 'warn'],
  datasources: {
    db: {
      url: dbUrl + (dbUrl.includes('?') ? '&' : '?') + 'connection_limit=5&pool_timeout=20'
    }
  }
});

module.exports = prisma;
