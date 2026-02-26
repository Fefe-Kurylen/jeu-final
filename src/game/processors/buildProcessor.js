// ========== BUILD QUEUE PROCESSOR ==========

const prisma = require('../../config/database');
const config = require('../../config');
const { buildingsData } = require('../../config/gamedata');

async function processBuilds(now) {
  const builds = await prisma.buildQueueItem.findMany({
    where: { status: 'RUNNING', endsAt: { lte: now } },
    include: { city: { include: { buildings: true, buildQueue: true } } }
  });
  const buildsByCityId = {};
  for (const b of builds) {
    if (!buildsByCityId[b.cityId]) buildsByCityId[b.cityId] = [];
    buildsByCityId[b.cityId].push(b);
  }
  for (const cityId of Object.keys(buildsByCityId)) {
    const cityBuilds = buildsByCityId[cityId];
    for (const b of cityBuilds) {
      try {
        const freshBuildings = await prisma.cityBuilding.findMany({ where: { cityId: b.cityId } });
        const isFieldBuilding = ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'].includes(b.buildingKey);
        const existing = isFieldBuilding ? freshBuildings.find(x => x.key === b.buildingKey && x.slot === b.slot) : freshBuildings.find(x => x.key === b.buildingKey);
        if (existing) { await prisma.cityBuilding.update({ where: { id: existing.id }, data: { level: b.targetLevel } }); }
        else {
          const usedSlots = new Set(freshBuildings.map(x => x.slot));
          let newSlot = b.slot || 1;
          while (usedSlots.has(newSlot)) newSlot++;
          await prisma.cityBuilding.create({ data: { cityId: b.cityId, key: b.buildingKey, slot: newSlot, level: b.targetLevel } });
        }
        await prisma.buildQueueItem.delete({ where: { id: b.id } });
        console.log(`[BUILD] ${b.buildingKey} niveau ${b.targetLevel} terminé`);
      } catch (buildErr) {
        console.error(`[BUILD ERROR] ${b.buildingKey}:`, buildErr.message);
        try { await prisma.buildQueueItem.delete({ where: { id: b.id } }); } catch (e) {}
      }
    }
    const remainingRunning = await prisma.buildQueueItem.count({ where: { cityId, status: 'RUNNING' } });
    const slotsToStart = config.build.maxRunning - remainingRunning;
    if (slotsToStart > 0) {
      const nextQueued = await prisma.buildQueueItem.findMany({ where: { cityId, status: 'QUEUED' }, orderBy: { slot: 'asc' }, take: slotsToStart });
      for (const next of nextQueued) {
        const buildingDef = buildingsData.find(bd => bd.key === next.buildingKey);
        const baseTime = buildingDef?.timeL1Sec || 60;
        const durationSec = Math.floor(baseTime * Math.pow(config.build.timeMultiplierBase, next.targetLevel - 1));
        const endsAt = new Date(now.getTime() + durationSec * 1000);
        await prisma.buildQueueItem.update({ where: { id: next.id }, data: { status: 'RUNNING', startedAt: now, endsAt } });
        console.log(`[BUILD] Demarrage ${next.buildingKey} niveau ${next.targetLevel}`);
      }
    }
  }
}

module.exports = { processBuilds };
