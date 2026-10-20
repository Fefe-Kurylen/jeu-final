// ========== BUILD QUEUE PROCESSOR ==========

const prisma = require('../../config/database');
const { notify } = require('../../services/pushService');
const buildingName = (key) => buildingsData.find(b => b.key === key)?.name || key;
const config = require('../../config');
const { buildingsData } = require('../../config/gamedata');
const { getStorageAtLevel } = require('../../utils/calculations');
const { lockCity } = require('../../utils/db');
const { updatePlayerPopulation } = require('./worldProcessor');
const { getFactionBonus } = require('../../utils/calculations');
const { factionsData } = require('../../config/gamedata');

const BASE_STORAGE = 1000;

// Recalcule maxStorage / maxFoodStorage d'une ville à partir de ses bâtiments
async function syncCityStorage(cityId, db = prisma) {
  const buildings = await db.cityBuilding.findMany({ where: { cityId, key: { in: ['WAREHOUSE', 'SILO'] } }, select: { key: true, level: true } });
  let storage = 0, foodStorage = 0;
  for (const b of buildings) {
    if (b.key === 'WAREHOUSE') storage += getStorageAtLevel('WAREHOUSE', b.level, buildingsData);
    else foodStorage += getStorageAtLevel('SILO', b.level, buildingsData);
  }
  await db.city.update({
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

// Wall HP scales with the wall level (GDD: HP in % of the level's max); the new level starts intact
async function syncWallHp(cityId, wallLevel, db = prisma) {
  // Bonus de faction « wallHealth » (Égypte +20 %) : points de vie du mur
  const city = await db.city.findUnique({ where: { id: cityId }, select: { player: { select: { faction: true } } } });
  const bonus = 1 + (getFactionBonus(city?.player?.faction, 'wallHealth', factionsData) || 0) / 100;
  const max = Math.round(config.combat.wallHpPerLevel * Math.max(1, wallLevel) * bonus);
  await db.city.update({ where: { id: cityId }, data: { wallMaxHp: max, wallHp: max } });
}

async function processBuilds(now, { playerId = null } = {}) {
  const builds = await prisma.buildQueueItem.findMany({
    where: { status: 'RUNNING', endsAt: { lte: now }, city: { isSieged: false, ...(playerId ? { playerId } : {}) } },   // siège : chantiers en pause
    orderBy: { endsAt: 'asc' },
    take: 500
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
        const owner = await prisma.$transaction(async (tx) => {
          await lockCity(tx, b.cityId);
          // The item may have been consumed by another executor meanwhile
          const taken = await tx.buildQueueItem.deleteMany({ where: { id: b.id, status: 'RUNNING' } });
          if (taken.count !== 1) return null;
          const freshBuildings = await tx.cityBuilding.findMany({ where: { cityId: b.cityId } });
          const isFieldBuilding = ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'].includes(b.buildingKey);
          const existing = isFieldBuilding ? freshBuildings.find(x => x.key === b.buildingKey && x.slot === b.slot) : freshBuildings.find(x => x.key === b.buildingKey);
          if (existing) {
            // A level never goes down because of a stale queue item
            if (existing.level < b.targetLevel) await tx.cityBuilding.update({ where: { id: existing.id }, data: { level: b.targetLevel } });
          } else {
            const usedSlots = new Set(freshBuildings.map(x => x.slot));
            let newSlot = b.slot ?? 1;
            while (usedSlots.has(newSlot)) newSlot++;
            await tx.cityBuilding.create({ data: { cityId: b.cityId, key: b.buildingKey, slot: newSlot, level: b.targetLevel } });
          }
          // Storage follows the warehouse / silo levels, wall HP follows the wall level
          if (b.buildingKey === 'WAREHOUSE' || b.buildingKey === 'SILO') await syncCityStorage(b.cityId, tx);
          if (b.buildingKey === 'WALL') await syncWallHp(b.cityId, b.targetLevel, tx);
          const city = await tx.city.findUnique({ where: { id: b.cityId }, select: { playerId: true, name: true } });
          if (city) await updatePlayerPopulation(tx, city.playerId);
          return city;
        });
        if (!owner) continue;
        notify(owner.playerId, 'build_done', '🏗️ Construction terminée', `${buildingName(b.buildingKey)} niveau ${b.targetLevel} à ${owner.name}`, { tab: 'city', cityId: b.cityId });
        console.log(`[BUILD] ${b.buildingKey} niveau ${b.targetLevel} terminé`);
      } catch (buildErr) {
        // Nothing was written: the item stays RUNNING and is retried at the next tick
        console.error(`[BUILD ERROR] ${b.buildingKey}:`, buildErr.message);
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

module.exports = { processBuilds, syncCityStorage, syncAllCityStorage, syncWallHp };
