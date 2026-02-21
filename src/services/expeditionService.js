const prisma = require('../config/database');

async function createExpedition(playerId) {
  const difficulty = Math.floor(Math.random() * 4) + 1;
  const enemyPower = difficulty * 500 + Math.floor(Math.random() * 500);
  const duration = 1800 + difficulty * 600;
  const lootTiers = ['COMMON', 'COMMON', 'RARE', 'EPIC'];
  const lootTier = lootTiers[difficulty - 1];

  return prisma.expedition.create({
    data: {
      playerId, difficulty, enemyPower, duration, lootTier,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000)
    }
  });
}

module.exports = { createExpedition };
