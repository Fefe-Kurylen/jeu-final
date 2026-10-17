// ========== RECRUIT QUEUE PROCESSOR ==========

const prisma = require('../../config/database');
const { unitsData } = require('../../config/gamedata');
const { lockCity } = require('../../utils/db');

async function processRecruits(now, { playerId = null } = {}) {
  const recruits = await prisma.recruitQueueItem.findMany({
    where: { status: 'RUNNING', endsAt: { lte: now }, ...(playerId ? { city: { playerId } } : {}) },
    include: { city: true },
    orderBy: { endsAt: 'asc' },
    take: 500
  });
  for (const r of recruits) {
    try {
      await prisma.$transaction(async (tx) => {
        await lockCity(tx, r.cityId);
        let garrison = await tx.army.findFirst({ where: { cityId: r.cityId, isGarrison: true } });
        if (!garrison) {
          garrison = await tx.army.create({ data: { ownerId: r.city.playerId, cityId: r.cityId, name: 'Garnison', x: r.city.x, y: r.city.y, status: 'IDLE', isGarrison: true } });
        }
        // The item is consumed first (conditional): a second executor credits nothing
        const taken = await tx.recruitQueueItem.deleteMany({ where: { id: r.id, status: 'RUNNING' } });
        if (taken.count !== 1) throw Object.assign(new Error('already processed'), { _skip: true });
        const tier = unitsData.find(u => u.key === r.unitKey)?.tier || 'base';
        // Increment in SQL so several batches finishing in the same tick all add up
        await tx.armyUnit.upsert({
          where: { armyId_unitKey: { armyId: garrison.id, unitKey: r.unitKey } },
          update: { count: { increment: r.count } },
          create: { armyId: garrison.id, unitKey: r.unitKey, tier, count: r.count }
        });
      }, { timeout: 15000 });
      console.log(`[RECRUIT] ${r.count}x ${r.unitKey}`);
    } catch (e) {
      if (!e._skip) console.error(`[RECRUIT ERROR] ${r.id}:`, e.message);
    }
  }
}

module.exports = { processRecruits };
