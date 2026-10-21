// ========== EXPEDITION PROCESSOR ==========

const prisma = require('../../config/database');
const config = require('../../config');
const { unitsData, itemsData } = require('../../config/gamedata');

// Item found at the end of a won expedition: the loot tier decides the odds and the quality
const DROP_CHANCE = { COMMON: 0.35, RARE: 0.5, EPIC: 0.7, LEGENDARY: 0.9 };
function rollItem(lootTier) {
  if (Math.random() >= (DROP_CHANCE[lootTier] || 0.35)) return null;
  const r = Math.random();
  const wanted = lootTier === 'EPIC' || lootTier === 'LEGENDARY' ? (r < 0.5 ? 'EPIC' : 'RARE') : lootTier === 'RARE' ? (r < 0.7 ? 'RARE' : 'COMMON') : 'COMMON';
  const pool = itemsData.filter(i => i.tier === wanted);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
const { calculateArmyPower } = require('../../utils/calculations');
const { awardHeroXp } = require('../../services/heroXpService');

async function processExpeditions(now) {
  await prisma.expedition.updateMany({ where: { status: 'AVAILABLE', expiresAt: { lte: now } }, data: { status: 'EXPIRED' } });
  const expeditions = await prisma.expedition.findMany({
    where: { status: 'IN_PROGRESS', endsAt: { lte: now } },
    take: 500
  });
  for (const exp of expeditions) {
    try {
      const army = exp.armyId ? await prisma.army.findUnique({ where: { id: exp.armyId }, include: { units: true, hero: { include: { items: true } } } }) : null;
      // Real unit stats decide the outcome (≈ 10 per base unit, 20 per intermediate, 35 per elite), not a flat 10 per head
      const playerPower = army ? calculateArmyPower(army.units, unitsData) / config.expedition.powerDivisor : 0;
      const won = playerPower > exp.enemyPower * 0.7;
      let xpGained = 0, lootGained = null;
      const lossRate = config.expedition.lossPctPerDifficulty * exp.difficulty * (won ? 1 : 2);

      const applied = await prisma.$transaction(async (tx) => {
        let item = null;
        if (won) {
          xpGained = Math.max(5, Math.floor(exp.enemyPower * 0.25));
          const lootChance = { COMMON: 0.5, RARE: 0.3, EPIC: 0.15, LEGENDARY: 0.05 }[exp.lootTier] || 0.5;
          if (Math.random() < lootChance) lootGained = { gold: Math.floor(50 + Math.random() * 100 * exp.difficulty) };
          // Only a hero on the expedition brings an item back
          item = army?.heroId ? rollItem(exp.lootTier) : null;
          if (item) lootGained = { ...(lootGained || {}), item: item.key, itemName: item.name };
        }
        // The expedition is consumed first: a second executor (or a retry) changes nothing
        const claimed = await tx.expedition.updateMany({ where: { id: exp.id, status: 'IN_PROGRESS' }, data: { status: 'COMPLETED', won, xpGained, lootGained } });
        if (claimed.count !== 1) return false;
        if (army) {
          for (const unit of army.units) {
            const lost = Math.floor(unit.count * lossRate);
            if (lost <= 0) continue;
            if (lost >= unit.count) await tx.armyUnit.deleteMany({ where: { id: unit.id } });
            else await tx.armyUnit.update({ where: { id: unit.id }, data: { count: { decrement: lost } } });
          }
          // home besieged: the army comes back as a homecoming and must fight its way through the camp (armies step,
          // same tick); otherwise it is simply back in its city
          const home = army.cityId ? await tx.city.findUnique({ where: { id: army.cityId }, select: { x: true, y: true } }) : null;
          const besieged = home && (await tx.army.count({ where: { status: 'BESIEGING', targetCityId: army.cityId, NOT: { ownerId: army.ownerId } } })) > 0;
          const back = now;   // the tick time: the armies step of this same tick takes the homecoming
          await tx.army.updateMany({ where: { id: army.id, status: 'EXPEDITION' }, data: besieged
            ? { status: 'RETURNING', missionType: 'RETURN', x: home.x, y: home.y, targetX: home.x, targetY: home.y, targetCityId: null, departedAt: back, arrivalAt: back, claimedAt: null }
            : { status: 'IDLE', ...(home ? { x: home.x, y: home.y } : {}) } });
        }
        if (lootGained?.gold) await tx.player.update({ where: { id: exp.playerId }, data: { gold: { increment: lootGained.gold } } });
        if (item && army?.heroId) await tx.heroItem.create({ data: { heroId: army.heroId, itemKey: item.key, slot: 'inventory', stats: item.stats } });
        // Only a hero who went on the expedition gains its experience
        if (won && army?.heroId) await awardHeroXp(army.heroId, xpGained, tx);
        return true;
      }, { timeout: 15000 });
      if (applied) console.log(`[EXPEDITION] ${won ? 'Victoire' : 'Defaite'} +${xpGained}XP`);
    } catch (e) {
      console.error(`[EXPEDITION ERROR] ${exp.id}:`, e.message);
    }
  }
}

// About once per hour, every active player with fewer than 15 open expeditions gets a new one — in a single
// statement. Players not seen for a while get none (the table would otherwise grow for nobody).
async function generateNewExpeditions() {
  if (Math.random() >= (30 / 3600)) return;
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  const activeSince = new Date(Date.now() - config.tick.expeditionsForActiveDays * 86400000);
  await prisma.$executeRaw`
    INSERT INTO "Expedition" (id, "playerId", difficulty, "enemyPower", duration, "lootTier", "expiresAt", status, "createdAt")
    SELECT gen_random_uuid()::text, p.id, d.difficulty,
           d.difficulty * 500 + FLOOR(random() * 500)::int,
           1800 + d.difficulty * 600,
           CASE d.difficulty WHEN 1 THEN 'COMMON' WHEN 2 THEN 'COMMON' WHEN 3 THEN 'RARE' ELSE 'EPIC' END,
           ${expiresAt}, 'AVAILABLE', ${new Date()}
    FROM "Player" p
    CROSS JOIN LATERAL (SELECT (FLOOR(random() * 4) + 1)::int AS difficulty) d
    WHERE p."lastSeenAt" >= ${activeSince}
      AND (SELECT COUNT(*) FROM "Expedition" e WHERE e."playerId" = p.id AND e.status = 'AVAILABLE') < 15
  `;
}

module.exports = { processExpeditions, generateNewExpeditions };
