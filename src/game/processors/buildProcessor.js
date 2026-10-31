// ========== BUILD QUEUE PROCESSOR ==========

const prisma = require('../../config/database');
const { notify } = require('../../services/pushService');
const buildingName = (key) => buildingsData.find(b => b.key === key)?.name || key;
const config = require('../../config');
const { buildingsData } = require('../../config/gamedata');
const { getStorageAtLevel, getFactionBonus, cityStorageCaps, ringSlotsOf, STORAGE_KEYS, BASE_STORAGE } = require('../../utils/calculations');
const { lockCity } = require('../../utils/db');
const { updatePlayerPopulation } = require('./worldProcessor');
const { factionsData } = require('../../config/gamedata');

// Recalcule maxStorage / maxFoodStorage d'une ville à partir de ses bâtiments (dépôts, silos, Grand dépôt, Grand silo)
async function syncCityStorage(cityId, db = prisma) {
  const buildings = await db.cityBuilding.findMany({ where: { cityId, key: { in: Object.keys(STORAGE_KEYS) } }, select: { key: true, level: true } });
  await db.city.update({ where: { id: cityId }, data: cityStorageCaps(buildings, buildingsData) });
}

// Répare le stockage de TOUTES les villes (appelé une fois au démarrage) ; une ville sans dépôt ni silo (Grand dépôt retiré
// d'une capitale, décision du 30 octobre 2026) revient à la capacité de base. Un stock au-dessus du plafond est gardé.
async function syncAllCityStorage() {
  const { Prisma } = require('@prisma/client');
  const rows = [];
  for (const [key, kind] of Object.entries(STORAGE_KEYS)) {
    for (let lvl = 1; lvl <= 25; lvl++) rows.push(Prisma.sql`(${key}, ${lvl}, ${getStorageAtLevel(key, lvl, buildingsData)}, ${kind})`);
  }
  const table = Prisma.join(rows);
  const updated = await prisma.$executeRaw`
    UPDATE "City" AS c SET
      "maxStorage"     = GREATEST(${BASE_STORAGE}, COALESCE(st.w, 0)),
      "maxFoodStorage" = GREATEST(${BASE_STORAGE}, COALESCE(st.f, 0))
    FROM (
      SELECT ci.id AS "cityId",
        SUM(CASE WHEN t.kind = 'storage'     THEN t.cap ELSE 0 END) AS w,
        SUM(CASE WHEN t.kind = 'foodStorage' THEN t.cap ELSE 0 END) AS f
      FROM "City" ci
      LEFT JOIN "CityBuilding" cb ON cb."cityId" = ci.id
      LEFT JOIN (VALUES ${table}) AS t(key, level, cap, kind) ON t.key = cb.key AND t.level = cb.level
      GROUP BY ci.id
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

// Emplacement d'un bâtiment qui sort de terre : le Mur a sa place fixe sur l'enceinte (config.city.wallSlot, décision du
// 30 octobre 2026), un champ (101-118) ou le Bâtiment principal (0) celle de son chantier, les autres celle du chantier si
// elle est libre, sinon la première libre de l'anneau de la ville (1 à ringSlotsOf(city), décision du 31 octobre 2026)
function newBuildingSlot(item, buildings, city) {
  if (item.buildingKey === 'WALL') return config.city.wallSlot;
  const ring = ringSlotsOf(city);
  const used = new Set(buildings.map(x => x.slot));
  const wanted = item.slot ?? 1;
  if (!used.has(wanted) && (wanted < 1 || wanted > config.city.wallSlot || wanted <= ring)) return wanted;
  for (let s = 1; s <= ring; s++) if (!used.has(s)) return s;
  return wanted;   // anneau plein (cas d'erreur) : la place du chantier, comme avant
}

// « File de construction vide à [ville] » (décision du 30 octobre 2026, aide au suivi) : quand le dernier chantier d'une
// ville se termine ; au plus une alerte par ville toutes les config.city.idleAlertHours heures (notée sur la ville)
async function idleQueueAlert(city, cityId, now) {
  if (await prisma.buildQueueItem.count({ where: { cityId } })) return;
  const cutoff = new Date(now.getTime() - config.city.idleAlertHours * 3600000);
  const noted = await prisma.city.updateMany({ where: { id: cityId, OR: [{ idleAlertAt: null }, { idleAlertAt: { lt: cutoff } }] }, data: { idleAlertAt: now } });
  if (noted.count !== 1) return;
  notify(city.playerId, 'build_idle', '🏗️ File de construction vide', `File de construction vide à ${city.name} : lancez un nouveau chantier.`, { to: 'city', cityId });
}

// Démarre les constructions en attente tant que des places sont libres (tick, lecture des villes, annulation), avec la
// durée fixée à la mise en file. Un niveau attend que le niveau inférieur du même bâtiment (même emplacement) ait quitté
// la file : deux niveaux d'un bâtiment ne se construisent jamais en même temps. `tx` tient le verrou de la ville.
async function promoteQueued(tx, cityId, now) {
  const queue = await tx.buildQueueItem.findMany({ where: { cityId }, orderBy: { startedAt: 'asc' } });
  let free = config.build.maxRunning - queue.filter(q => q.status === 'RUNNING').length;
  const started = [];
  for (const item of queue) {
    if (free <= 0) break;
    if (item.status !== 'QUEUED') continue;
    if (queue.some(q => q.buildingKey === item.buildingKey && q.slot === item.slot && q.targetLevel < item.targetLevel)) continue;
    const durationMs = Math.max(1000, new Date(item.endsAt).getTime() - new Date(item.startedAt).getTime());
    const ok = await tx.buildQueueItem.updateMany({ where: { id: item.id, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: now, endsAt: new Date(now.getTime() + durationMs) } });
    if (ok.count === 1) { free--; started.push(item); }
  }
  return started;
}

async function processBuilds(now, { playerId = null } = {}) {
  const builds = await prisma.buildQueueItem.findMany({
    where: { status: 'RUNNING', endsAt: { lte: now }, ...(playerId ? { city: { playerId } } : {}) },
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
    let finishedIn = null;   // la ville d'un chantier terminé à ce passage (joueur, nom)
    for (const b of cityBuilds) {
      try {
        const owner = await prisma.$transaction(async (tx) => {
          await lockCity(tx, b.cityId);
          // The item may have been consumed by another executor meanwhile
          const taken = await tx.buildQueueItem.deleteMany({ where: { id: b.id, status: 'RUNNING' } });
          if (taken.count !== 1) return null;
          const freshBuildings = await tx.cityBuilding.findMany({ where: { cityId: b.cityId } });
          const city = await tx.city.findUnique({ where: { id: b.cityId }, select: { playerId: true, name: true, isCapital: true } });
          const isFieldBuilding = ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'].includes(b.buildingKey);
          const existing = isFieldBuilding ? freshBuildings.find(x => x.key === b.buildingKey && x.slot === b.slot) : freshBuildings.find(x => x.key === b.buildingKey);
          if (existing) {
            // A level never goes down because of a stale queue item
            if (existing.level < b.targetLevel) await tx.cityBuilding.update({ where: { id: existing.id }, data: { level: b.targetLevel } });
          } else {
            await tx.cityBuilding.create({ data: { cityId: b.cityId, key: b.buildingKey, slot: newBuildingSlot(b, freshBuildings, city), level: b.targetLevel } });
          }
          // Storage follows the warehouse / silo levels (Great Warehouse and Great Silo too), wall HP follows the wall level
          if (STORAGE_KEYS[b.buildingKey]) await syncCityStorage(b.cityId, tx);
          if (b.buildingKey === 'WALL') await syncWallHp(b.cityId, b.targetLevel, tx);
          if (city) await updatePlayerPopulation(tx, city.playerId);
          return city;
        });
        if (!owner) continue;
        finishedIn = owner;
        require('../../services/questService').bumpLater(owner.playerId, 'build_done', 1);   // quêtes
        notify(owner.playerId, 'build_done', '🏗️ Construction terminée', `${buildingName(b.buildingKey)} niveau ${b.targetLevel} à ${owner.name}`, { to: 'city', cityId: b.cityId });
        console.log(`[BUILD] ${b.buildingKey} niveau ${b.targetLevel} terminé`);
      } catch (buildErr) {
        // Nothing was written: the item stays RUNNING and is retried at the next tick
        console.error(`[BUILD ERROR] ${b.buildingKey}:`, buildErr.message);
      }
    }
    // Démarrage sous le verrou de la ville : le tick et une lecture des villes ne dépassent jamais maxRunning à eux deux
    try {
      const started = await prisma.$transaction(async (tx) => { await lockCity(tx, cityId); return promoteQueued(tx, cityId, now); });
      for (const next of started) console.log(`[BUILD] Demarrage ${next.buildingKey} niveau ${next.targetLevel}`);
    } catch (e) {
      console.error('[BUILD ERROR] promotion:', e.message);   // repris à la prochaine fin ou annulation dans la ville
    }
    if (finishedIn) await idleQueueAlert(finishedIn, cityId, now).catch(e => console.error('[BUILD ERROR] alerte file vide:', e.message));
  }
}

module.exports = { processBuilds, syncAllCityStorage, promoteQueued, newBuildingSlot };
