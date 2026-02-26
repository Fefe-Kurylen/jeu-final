// ========== EXPEDITION PROCESSOR ==========

const prisma = require('../../config/database');
const { createExpedition } = require('../../services/expeditionService');

async function processExpeditions(now) {
  const expeditions = await prisma.expedition.findMany({
    where: { status: 'IN_PROGRESS', endsAt: { lte: now } },
    include: { player: { include: { hero: true } } }
  });
  for (const exp of expeditions) {
    const army = await prisma.army.findUnique({ where: { id: exp.armyId }, include: { units: true } });
    const playerPower = army ? army.units.reduce((sum, u) => sum + u.count * 10, 0) : 0;
    const won = playerPower > exp.enemyPower * 0.7;
    let xpGained = 0, lootGained = null;
    if (won) {
      xpGained = Math.floor(exp.enemyPower * 0.25 / 100);
      if (exp.player.hero) {
        const hero = exp.player.hero;
        let remainingXp = hero.xp + xpGained;
        let newLevel = hero.level, newXpToNext = hero.xpToNextLevel, newStatPoints = hero.statPoints;
        while (remainingXp >= newXpToNext) {
          remainingXp -= newXpToNext;
          newLevel++;
          newXpToNext = Math.floor(newXpToNext * 1.5);
          newStatPoints += 4;
        }
        await prisma.hero.update({ where: { id: hero.id }, data: { xp: remainingXp, level: newLevel, xpToNextLevel: newXpToNext, statPoints: newStatPoints } });
      }
      const lootChance = { COMMON: 0.5, RARE: 0.3, EPIC: 0.15, LEGENDARY: 0.05 }[exp.lootTier] || 0.5;
      if (Math.random() < lootChance) {
        lootGained = { gold: Math.floor(50 + Math.random() * 100 * exp.difficulty) };
        await prisma.player.update({ where: { id: exp.playerId }, data: { gold: { increment: lootGained.gold } } });
      }
    }
    await prisma.expedition.update({ where: { id: exp.id }, data: { status: 'COMPLETED', won, xpGained, lootGained } });
    if (army) { await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE' } }); }
    console.log(`[EXPEDITION] ${won ? 'Victoire' : 'Defaite'} +${xpGained}XP`);
  }
}

async function generateNewExpeditions() {
  if (Math.random() < (30 / 3600)) {
    const players = await prisma.player.findMany({ select: { id: true } });
    for (const p of players) {
      const count = await prisma.expedition.count({ where: { playerId: p.id, status: 'AVAILABLE' } });
      if (count < 15) await createExpedition(p.id);
    }
  }
}

module.exports = { processExpeditions, generateNewExpeditions };
