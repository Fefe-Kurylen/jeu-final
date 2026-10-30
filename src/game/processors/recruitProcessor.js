// ========== RECRUIT QUEUE PROCESSOR ==========
// Toute unité formée apparaît dans la garnison de la capitale, troupes de la Grande caserne / Grande écurie d'une colonie
// comprises (décision du 30 octobre 2026, § 1 bis : pas de garnison propre dans les colonies). Le colon reste dans la ville
// qui l'a formé (la capitale, seule à avoir une Résidence qui en forme).

const prisma = require('../../config/database');
const { capitalGarrisonId, addArmyUnits } = require('../../utils/db');

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
        // la capitale d'abord (verrou de ville, puis la ligne de la file, comme l'annulation d'un recrutement)
        const garrisonId = await capitalGarrisonId(tx, r.city.playerId, r.cityId);
        // The item is consumed first (conditional): a second executor credits nothing
        const taken = await tx.recruitQueueItem.deleteMany({ where: { id: r.id, status: 'RUNNING' } });
        if (taken.count !== 1) throw Object.assign(new Error('already processed'), { _skip: true });
        // A settler (Residence) is not a unit: it waits in the city until an army takes it to found a city
        if (r.unitKey === 'SETTLER') {
          await tx.city.update({ where: { id: r.cityId }, data: { settlers: { increment: r.count } } });
          return;
        }
        await addArmyUnits(tx, garrisonId, r.unitKey, r.count);
      }, { timeout: 15000 });
      if (r.unitKey !== 'SETTLER') require('../../services/questService').bumpLater(r.city.playerId, 'units_recruited', r.count);   // quêtes
      console.log(`[RECRUIT] ${r.count}x ${r.unitKey}`);
    } catch (e) {
      if (!e._skip) console.error(`[RECRUIT ERROR] ${r.id}:`, e.message);
    }
  }
}

module.exports = { processRecruits };
