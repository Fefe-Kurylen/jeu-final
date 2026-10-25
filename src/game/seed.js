// ========== RESOURCE NODE SEEDING ==========
const prisma = require('../config/database');
const config = require('../config');
const { generateTribeDefenders, campDifficultyAt } = require('../utils/tribeDefenders');
const Terrain = require('../../frontend/js/shared/terrain.js');

// Un point de ressource se pose sur la terre ferme (ni rivière, ni lac, ni pont, ni gué) et au bord de la terre ferme
// principale, pour qu'une armée puisse l'atteindre (une montagne ou des rochers sous le point restent franchissables)
const WET = { water: 1, frozen: 1, oasis: 1, river: 1, bridge: 1, ford: 1 };
function nodeSpotOk(x, y) {
  if (!Terrain.inWorld(x, y) || WET[Terrain.getTerrainType(x, y).feature]) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Terrain.isMainland(x + dx, y + dy)) return true;
  return false;
}

const BASE_WORLD_SIZE = config.map.baseWorldSize;

async function seedResourceNodes() {
  const worldSize = BASE_WORLD_SIZE;
  const half = Math.floor(worldSize / 2);
  const RES_TOTAL = Math.min(5000, Math.floor(worldSize * worldSize * 0.035));
  const GOLD_TOTAL = Math.floor(RES_TOTAL * 0.13);
  const BATCH = 500;

  const used = new Set();
  const existingCities = await prisma.city.findMany({ select: { x: true, y: true } });
  // a city covers 2 × 2 cells, with a free ring around them
  existingCities.forEach(c => { for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) used.add(`${c.x + dx},${c.y + dy}`); });

  const resTypes = ['WOOD', 'STONE', 'IRON', 'FOOD'];
  // Formule partagée avec le client (frontend/js/map.js) pour une étiquette cohérente avec le terrain affiché
  const { getBiome } = require('../utils/biome');
  const biomes = getBiome;
  const pickLevel = (x, y) => {
    const d = Math.sqrt(x * x + y * y);
    const r = Math.random();
    if (d < half * 0.35) return r < 0.6 ? 3 : r < 0.85 ? 2 : 1;
    return r < 0.55 ? 1 : r < 0.9 ? 2 : 3;
  };

  let totalInserted = 0, goldCount = 0, batch = [], attempts = 0;

  while (totalInserted + batch.length < RES_TOTAL && attempts < RES_TOTAL * 3) {
    attempts++;
    const x = Math.floor(Math.random() * worldSize) - half;
    const y = Math.floor(Math.random() * worldSize) - half;
    const key = `${x},${y}`;
    if (used.has(key) || !nodeSpotOk(x, y)) continue;
    used.add(key);
    const level = pickLevel(x, y);
    const type = resTypes[Math.floor(Math.random() * 4)];
    const RN = config.map.resourceNode;
    const baseAmt = RN.baseAmountByLevel[level] || RN.baseAmountByLevel[1];
    const amount = Math.floor(baseAmt * (0.8 + Math.random() * 0.4));
    const tribe = generateTribeDefenders(level, false, 1.0, null, campDifficultyAt(x, y));
    batch.push({ x, y, resourceType: type, level, biome: biomes(x, y), amount, maxAmount: Math.floor(amount * RN.maxFactor), regenRate: Math.max(1, Math.floor(amount * RN.maxFactor / RN.regenHours)), hasDefenders: true, defenderPower: tribe.power, defenderUnits: tribe.units, respawnMinutes: 30 + level * 30 });
    if (batch.length >= BATCH) {
      await prisma.resourceNode.createMany({ data: batch, skipDuplicates: true });
      totalInserted += batch.length;
      batch = [];
    }
  }

  attempts = 0;
  while (goldCount < GOLD_TOTAL && attempts < GOLD_TOTAL * 3) {
    attempts++;
    const x = Math.floor(Math.random() * worldSize) - half;
    const y = Math.floor(Math.random() * worldSize) - half;
    const key = `${x},${y}`;
    if (used.has(key) || !nodeSpotOk(x, y)) continue;
    used.add(key);
    const level = pickLevel(x, y);
    // GDD: gold nodes hold a small stock (10 / 20 / 30 by level) that refills in 12 h; no random spread
    const amount = config.map.goldNode.lootByLevel[level] || 10;
    const tribe = generateTribeDefenders(level, true, 1.0, null, campDifficultyAt(x, y));
    batch.push({ x, y, resourceType: 'GOLD', level, biome: biomes(x, y), amount, maxAmount: amount, regenRate: Math.max(1, Math.round(amount / config.map.goldNode.intervalHours)), hasDefenders: true, defenderPower: tribe.power, defenderUnits: tribe.units, respawnMinutes: 60 + level * 60 });
    goldCount++;
    if (batch.length >= BATCH) {
      await prisma.resourceNode.createMany({ data: batch, skipDuplicates: true });
      totalInserted += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await prisma.resourceNode.createMany({ data: batch, skipDuplicates: true });
    totalInserted += batch.length;
  }

  console.log(`[SEED] ${totalInserted} resource nodes generated (${goldCount} gold)`);
}

// Au démarrage : les points déjà en base suivent le terrain actuel (carte de référence, 25 octobre 2026). Le biome est
// recalculé ; un point tombé dans l'eau ou dans une poche fermée est déplacé sur la case valable la plus proche, sauf
// s'il porte une ville, une armée, ou qu'une armée est en route vers lui.
async function syncResourceNodesWithTerrain() {
  const nodes = await prisma.resourceNode.findMany({ select: { id: true, x: true, y: true, biome: true, cityId: true, hasPlayerArmy: true } });
  const cities = await prisma.city.findMany({ select: { x: true, y: true } });
  const taken = new Set(nodes.map(n => `${n.x},${n.y}`));
  for (const c of cities) for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) taken.add(`${c.x + dx},${c.y + dy}`);
  const underCity = new Set(cities.flatMap(c => Terrain.cityCells(c.x, c.y).map(([x, y]) => `${x},${y}`)));   // the 2 × 2 blocks
  let moved = 0, rebiomed = 0;
  for (const n of nodes) {
    let { x, y } = n;
    if ((!nodeSpotOk(x, y) || underCity.has(`${x},${y}`)) && !n.cityId && !n.hasPlayerArmy) {   // a free node under a city (placed before the 2 × 2 rule) moves too
      const heading = await prisma.army.count({ where: { targetX: x, targetY: y, status: { not: 'IDLE' } } });
      if (!heading) {
        let spot = null;
        for (let r = 1; r <= 6 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const k = `${x + dx},${y + dy}`;
          if (!taken.has(k) && nodeSpotOk(x + dx, y + dy)) { spot = { x: x + dx, y: y + dy }; break; }
        }
        if (spot) { taken.delete(`${x},${y}`); taken.add(`${spot.x},${spot.y}`); x = spot.x; y = spot.y; moved++; }
      }
    }
    const biome = Terrain.getBiome(x, y);
    if (x !== n.x || y !== n.y || biome !== n.biome) {
      try { await prisma.resourceNode.update({ where: { id: n.id }, data: { x, y, biome } }); if (biome !== n.biome) rebiomed++; } catch (e) { /* case prise entre-temps : au prochain démarrage */ }
    }
  }
  if (moved || rebiomed) console.log(`[SEED] terrain : ${moved} points déplacés hors de l'eau, ${rebiomed} biomes mis à jour`);
}

// Au démarrage : une ville que le terrain actuel rend injouable est déplacée sur un emplacement libre près du bord, avec
// ses armées présentes en ville, et son propriétaire est prévenu : coupée de la terre ferme principale (une chaîne devenue
// infranchissable autour d'elle), une de ses 4 cases dans l'eau (elle ferait un pont sur la rivière), ou son bloc 2 × 2
// qui chevauche une autre ville (villes posées avant le 25 octobre 2026). Une colonie emmène son point de ressource.
// Pas tant qu'une de ses armées est dehors, qu'une armée est en route vers elle ou qu'elle est assiégée.
async function rescueTrappedCities() {
  const { findFreeSpawn, lockPlacement, gatherArmiesOnBlock } = require('../utils/spawn');
  const { invalidateObjectCells } = require('../utils/pathfinding');
  const { notify } = require('../services/pushService');
  // une armée sort-elle de la ville ? même règle que les trajets (cases de la ville libres, couronne libre sauf au-dessus de
  // l'eau, pas de coin coupé entre deux obstacles) jusqu'à une case de la terre ferme principale, à quelques cases au plus
  const reachable = (c) => {
    const objects = new Map(Terrain.cityCells(c.x, c.y).map(([x, y]) => [x + ',' + y, 'CITY']));
    const seen = new Set(objects.keys()), queue = Terrain.cityCells(c.x, c.y);
    while (queue.length) {
      const [x, y] = queue.shift();
      if (!objects.has(x + ',' + y) && Terrain.isMainland(x, y)) return true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if ((!dx && !dy) || seen.has(k) || Math.abs(nx - c.x) > 8 || Math.abs(ny - c.y) > 8) continue;
        if (Terrain.isBlocked(nx, ny, objects)) continue;
        if (dx && dy && Terrain.isBlocked(x + dx, y, objects) && Terrain.isBlocked(x, y + dy, objects)) continue;
        seen.add(k); queue.push([nx, ny]);
      }
    }
    return false;
  };
  const wet = (c) => Terrain.cityCells(c.x, c.y).some(([x, y]) => Terrain.WATER[Terrain.getTerrainType(x, y).feature]);
  const misplaced = (c) => Terrain.cityCells(c.x, c.y).some(([x, y]) => !Terrain.inWorld(x, y) || ['bridge', 'ford'].includes(Terrain.getTerrainType(x, y).feature));
  const cities = await prisma.city.findMany({ select: { id: true, x: true, y: true, name: true, playerId: true, isSieged: true, isCapital: true }, orderBy: { createdAt: 'asc' } });
  const kept = [];   // the oldest of two overlapping cities stays
  const overlaps = (c) => kept.some(o => Math.abs(o.x - c.x) <= 1 && Math.abs(o.y - c.y) <= 1);
  const why = (c) => (!reachable(c) ? 'était coupée du reste du monde par les montagnes et l\'eau' : wet(c) ? 'avait les pieds dans l\'eau' : misplaced(c) ? 'débordait de la carte ou sur un passage de rivière' : overlaps(c) ? 'chevauchait une autre ville' : null);
  let moved = 0;
  for (const c of cities) {
    const reason = why(c);
    if (!reason) { kept.push(c); continue; }
    const busy = c.isSieged || await prisma.army.count({ where: { OR: [{ cityId: c.id, status: { not: 'IDLE' } }, { targetCityId: c.id, status: { not: 'IDLE' } }] } });
    if (busy) { console.warn(`[SEED] ville à déplacer (${reason}), reporté : armées en route ou siège : ${c.name} (${c.x}, ${c.y})`); kept.push(c); continue; }
    const to = await prisma.$transaction(async (tx) => {
      await lockPlacement(tx);
      await tx.$executeRaw`SELECT id FROM "City" WHERE id = ${c.id} FOR UPDATE`;
      const cur = await tx.city.findUnique({ where: { id: c.id }, select: { x: true, y: true } });
      if (!cur || cur.x !== c.x || cur.y !== c.y) return null;
      const pos = await findFreeSpawn({ db: tx });
      await tx.city.update({ where: { id: c.id }, data: { x: pos.x, y: pos.y } });
      // its garrison and the armies standing in it follow it (a guard or a halted army elsewhere stays where it is)
      await tx.army.updateMany({ where: { cityId: c.id, OR: [{ isGarrison: true }, { status: 'IDLE', x: c.x, y: c.y }] }, data: { x: pos.x, y: pos.y } });
      await gatherArmiesOnBlock(tx, pos.x, pos.y);
      if (!c.isCapital) await tx.resourceNode.updateMany({ where: { cityId: c.id }, data: { x: pos.x, y: pos.y, biome: Terrain.getBiome(pos.x, pos.y) } });   // the point under the colony
      return pos;
    }, { timeout: 20000 }).catch(e => { console.warn(`[SEED] déplacement impossible : ${c.name} : ${e.message}`); return null; });
    if (!to) { kept.push(c); continue; }
    kept.push({ ...c, x: to.x, y: to.y });
    moved++;
    console.log(`[SEED] ville déplacée (${reason}) : ${c.name} (${c.x}, ${c.y}) -> (${to.x}, ${to.y})`);
    notify(c.playerId, 'city', '🧭 Ville déplacée', `La carte a changé : ${c.name} ${reason}. Elle a été rebâtie en (${to.x}, ${to.y}) avec ses armées présentes.`, { to: 'map', x: to.x, y: to.y, cityId: c.id });
  }
  // armies standing on one of the 3 other cells of a city (placed before the 2 × 2 rule) stand on its anchor cell
  const gathered = await prisma.$executeRaw`UPDATE "Army" a SET x = c.x, y = c.y FROM "City" c
    WHERE a.status = 'IDLE' AND NOT a."isGarrison" AND a.x BETWEEN c.x AND c.x + 1 AND a.y BETWEEN c.y AND c.y + 1 AND NOT (a.x = c.x AND a.y = c.y)`;
  if (gathered) console.log(`[SEED] ${gathered} armées ramenées sur la case principale de leur ville`);
  if (moved || gathered) invalidateObjectCells();
}

module.exports = { seedResourceNodes, syncResourceNodesWithTerrain, rescueTrappedCities };
