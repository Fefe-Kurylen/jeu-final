// ========== RECRUIT QUEUE PROCESSOR ==========

const prisma = require('../../config/database');
const { unitsData } = require('../../config/gamedata');

async function processRecruits(now) {
  const recruits = await prisma.recruitQueueItem.findMany({
    where: { status: 'RUNNING', endsAt: { lte: now } },
    include: { city: { include: { armies: { include: { units: true } } } } }
  });
  for (const r of recruits) {
    const garrison = r.city.armies.find(a => a.isGarrison);
    if (garrison) {
      const unit = unitsData.find(u => u.key === r.unitKey);
      const existing = garrison.units.find(u => u.unitKey === r.unitKey);
      if (existing) { await prisma.armyUnit.update({ where: { id: existing.id }, data: { count: existing.count + r.count } }); }
      else { await prisma.armyUnit.create({ data: { armyId: garrison.id, unitKey: r.unitKey, tier: unit?.tier || 'base', count: r.count } }); }
    }
    await prisma.recruitQueueItem.delete({ where: { id: r.id } });
    console.log(`[RECRUIT] ${r.count}x ${r.unitKey}`);
  }
}

module.exports = { processRecruits };
