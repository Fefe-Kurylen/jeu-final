// ========== BUILD QUEUE PROCESSOR ==========

const prisma = require('../../config/database');
const config = require('../../config');
const { buildingsData } = require('../../config/gamedata');
const { getStorageAtLevel } = require('../../utils/calculations');

const BASE_STORAGE = 1000;

// Recalcule maxStorage / maxFoodStorage d'une ville à partir de ses bâtiments
async function syncCityStorage(cityId) {
  const buildings = await prisma.cityBuilding.findMany({ where: { cityId, key: { in: ['WAREHOUSE', 'SILO'] } }, select: { key: true, level: true } });
  let storage = 0, foodStorage = 0;
  for (const b of buildings) {
    if (b.key === 'WAREHOUSE') storage += getStorageAtLevel('WAREHOUSE', b.level, buildingsData);
    else foodStorage += getStorageAtLevel('SILO', b.level, buildingsData);
  }
  await prisma.city.update({
    where: { id: cityId },
    data: { maxStorage: Math.max(BASE_STORAGE, storage), maxFoodStorage: Math.max(BASE_STORAGE, foodStorage) }
  });
}

// Répare le stockage de TOUTES les villes (appelé une fois au démarrage)
async function syncAllCityStorage() {
  const { Prisma } = require('@prisma/client');
  const rows = [];
  for (const key of ['WAREHOUSE', 'SILO']) {
    for (let lvl = 1; lvl <= 25; lvl++) rows.push(Prisma.sql`(${key}, ${lvl}, ${getStorageAtLevel(key, lvl, buildingsData)})`);
  }
  const table = Prisma.join(rows);
  const updated = await prisma.$executeRaw`
    UPDATE "City" AS c SET
      "maxStorage"     = GREATEST(${BASE_STORAGE}, COALESCE(st.w, 0)),
      "maxFoodStorage" = GREATEST(${BASE_STORAGE}, COALESCE(st.f, 0))
    FROM (
      SELECT cb."cityId",
        SUM(CASE WHEN cb.key = 'WAREHOUSE' THEN t.cap ELSE 0 END) AS w,
        SUM(CASE WHEN cb.key = 'SILO'      THEN t.cap ELSE 0 END) AS f
      FROM "CityBuilding" cb
      JOIN (VALUES ${table}) AS t(key, level, cap) ON t.key = cb.key AND t.level = cb.level
      GROUP BY cb."cityId"
    ) AS st
    WHERE c.id = st."cityId"
      AND (c."maxStorage" <> GREATEST(${BASE_STORAGE}, COALESCE(st.w, 0))
        OR c."maxFoodStorage" <> GREATEST(${BASE_STORAGE}, COALESCE(st.f, 0)))
  `;
  if (updated > 0) console.log(`[STORAGE] ${updated} villes resynchronisées (fix maxStorage)`);
}

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
        // Bug fix : le stockage de la ville doit suivre les niveaux d'Entrepôt/Silo
        if (b.buildingKey === 'WAREHOUSE' || b.buildingKey === 'SILO') await syncCityStorage(b.cityId);
        console.log(`[BUILD] ${b.buildingKey} niveau ${b.targetLevel} terminé`);
      } catch (buildErr) {
        console.error(`[BUILD ERROR] ${b.buildingKey}:`, buildErr.message);
        try { await prisma.buildQueueItem.delete({ where: { id: b.id } }); } catch (e) {}
      }
    }
    const remainingRunning = await prisma.buildQueueItem.count({ where: { cityId, status: 'RUNNING' } });
    const slotsToStart = config.build.maxRunning - remainingRunning;
    if (slotsToStart > 0) {
      const nextQueued = await prisma.buildQueueItem.findMany({ where: { cityId, status: 'QUEUED' }, orderBy: { startedAt: 'asc' }, take: slotsToStart });
      for (const next of nextQueued) {
        // Duration was fixed at enqueue time (faction bonus included): keep it, only shift the start
        const durationMs = Math.max(1000, new Date(next.endsAt).getTime() - new Date(next.startedAt).getTime());
        const endsAt = new Date(now.getTime() + durationMs);
        await prisma.buildQueueItem.update({ where: { id: next.id }, data: { status: 'RUNNING', startedAt: now, endsAt } });
        console.log(`[BUILD] Demarrage ${next.buildingKey} niveau ${next.targetLevel}`);
      }
    }
  }
}

module.exports = { processBuilds, syncCityStorage, syncAllCityStorage };
