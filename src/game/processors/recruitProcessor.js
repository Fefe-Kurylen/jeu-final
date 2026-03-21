// ========== RECRUIT QUEUE PROCESSOR ==========

const prisma = require('../../config/database');
const { unitsData } = require('../../config/gamedata');

async function processRecruits(now) {
  const recruits = await prisma.recruitQueueItem.findMany({
    where: { status: 'RUNNING', endsAt: { lte: now } },
    include: { city: { include: { armies: { include: { units: true } } } } }
  });
  for (const r of recruits) {
    try {
      let garrison = r.city.armies.find(a => a.isGarrison);

      // Create garrison if missing (prevents silent unit loss)
      if (!garrison) {
        garrison = await prisma.army.create({
          data: { name: 'Garnison', ownerId: r.city.playerId, cityId: r.city.id, isGarrison: true, status: 'IDLE', x: r.city.x, y: r.city.y }
        });
        garrison.units = [];
        console.warn(`[RECRUIT] Created missing garrison for city ${r.city.id}`);
      }

      const unit = unitsData.find(u => u.key === r.unitKey);
      const existing = garrison.units.find(u => u.unitKey === r.unitKey);
      if (existing) {
        await prisma.armyUnit.update({ where: { id: existing.id }, data: { count: existing.count + r.count } });
      } else {
        await prisma.armyUnit.create({ data: { armyId: garrison.id, unitKey: r.unitKey, tier: unit?.tier || 'base', count: r.count } });
      }
      await prisma.recruitQueueItem.delete({ where: { id: r.id } });
      console.log(`[RECRUIT] ${r.count}x ${r.unitKey} in city ${r.city.name || r.city.id}`);
    } catch (e) {
      console.error(`[RECRUIT ERROR] ${r.unitKey}:`, e.message);
    }
  }
}

module.exports = { processRecruits };
