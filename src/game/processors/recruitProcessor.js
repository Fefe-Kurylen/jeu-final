// ========== RECRUIT QUEUE PROCESSOR ==========

const prisma = require('../../config/database');
const { unitsData } = require('../../config/gamedata');

async function processRecruits(now) {
  const recruits = await prisma.recruitQueueItem.findMany({
    where: { status: 'RUNNING', endsAt: { lte: now } },
    include: { city: true }
  });
  for (const r of recruits) {
    try {
      await prisma.$transaction(async (tx) => {
        let garrison = await tx.army.findFirst({ where: { cityId: r.cityId, isGarrison: true } });
        if (!garrison) {
          garrison = await tx.army.create({ data: { ownerId: r.city.playerId, cityId: r.cityId, name: 'Garnison', x: r.city.x, y: r.city.y, status: 'IDLE', isGarrison: true } });
        }
        const tier = unitsData.find(u => u.key === r.unitKey)?.tier || 'base';
        // Increment in SQL so several batches finishing in the same tick all add up
        await tx.armyUnit.upsert({
          where: { armyId_unitKey: { armyId: garrison.id, unitKey: r.unitKey } },
          update: { count: { increment: r.count } },
          create: { armyId: garrison.id, unitKey: r.unitKey, tier, count: r.count }
        });
        await tx.recruitQueueItem.delete({ where: { id: r.id } });
      });
      console.log(`[RECRUIT] ${r.count}x ${r.unitKey}`);
    } catch (e) {
      console.error(`[RECRUIT ERROR] ${r.id}:`, e.message);
    }
  }
}

module.exports = { processRecruits };
