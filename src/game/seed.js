// ========== RESOURCE NODE SEEDING ==========
const prisma = require('../config/database');
const config = require('../config');
const { generateTribeDefenders, campDifficultyAt } = require('../utils/tribeDefenders');
const { cityGroundOk, CITY_GAP, findFreeSpawn, lockPlacement, gatherArmiesOnBlock } = require('../utils/spawn');
const Terrain = require('../../frontend/js/shared/terrain.js');
const { getBiome } = require('../utils/biome');   // le biome de la carte affichée (terrain partagé avec le client)

// Un point déjà en base se tient sur la terre ferme (ni rivière, ni lac, ni pont, ni gué) et au bord de la terre ferme
// principale, pour qu'une armée puisse l'atteindre (une montagne ou des rochers sous le point restent franchissables) :
// règle des mondes semés avant le 31 octobre 2026, que syncResourceNodesWithTerrain garde
const WET = { water: 1, frozen: 1, oasis: 1, river: 1, bridge: 1, ford: 1 };
function nodeSpotOk(x, y) {
  if (!Terrain.inWorld(x, y) || WET[Terrain.getTerrainType(x, y).feature]) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Terrain.isMainland(x + dx, y + dy)) return true;
  return false;
}

const RES_TYPES = ['WOOD', 'STONE', 'IRON', 'FOOD'];

// Points d'un monde neuf, sans la base (décision du 31 octobre 2026, rapport de vérification) : un point seulement là où une
// ville 2 × 2 tient (cityGroundOk, comme à la fondation), à 3 cases au moins de tout autre point et des villes déjà posées :
// chaque gisement reste fondable, même à côté d'une colonie. Les cases de la carte sont prises dans un ordre tiré au hasard.
// Niveau : plus de niveau 3 dans le cercle du centre. Renvoie [{ x, y, resourceType, level }], les ressources puis l'or.
// cities : [{ x, y }] déjà sur la carte ; random : tirage (Math.random, ou un tirage fixé pour les mesures).
function planResourceNodes({ cities = [], random = Math.random } = {}) {
  const S = config.map.nodeSeeding;
  const size = Terrain.WORLD_SIZE, min = Terrain.MIN_COORD;
  const resTotal = Math.min(S.max, Math.floor(size * size * S.perCell));
  const goldTotal = Math.floor(resTotal * S.goldPct / 100);
  const centerRadius = Math.floor(size / 2) * config.map.centerRadiusPct / 100;   // cercle du centre, le même que les sites libres
  const pickLevel = (x, y) => {
    const r = random();
    if (Math.sqrt(x * x + y * y) < centerRadius) return r < 0.6 ? 3 : r < 0.85 ? 2 : 1;
    return r < 0.55 ? 1 : r < 0.9 ? 2 : 3;
  };
  const taken = new Set(cities.map(c => c.x + ',' + c.y));
  const crowded = (x, y) => {
    for (let dy = 1 - CITY_GAP; dy < CITY_GAP; dy++) for (let dx = 1 - CITY_GAP; dx < CITY_GAP; dx++) if (taken.has((x + dx) + ',' + (y + dy))) return true;
    return false;
  };
  // toutes les cases dans un ordre au hasard (Fisher-Yates)
  const order = new Int32Array(size * size).map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const nodes = [];
  for (let k = 0; k < order.length && nodes.length < resTotal + goldTotal; k++) {
    const x = min + (order[k] % size), y = min + Math.floor(order[k] / size);
    if (crowded(x, y) || !cityGroundOk(x, y)) continue;
    taken.add(x + ',' + y);
    const resourceType = nodes.length < resTotal ? RES_TYPES[Math.floor(random() * RES_TYPES.length)] : 'GOLD';
    nodes.push({ x, y, resourceType, level: pickLevel(x, y) });
  }
  return nodes;
}

async function seedResourceNodes() {
  const BATCH = 500;
  const existingCities = await prisma.city.findMany({ select: { x: true, y: true } });
  const RN = config.map.resourceNode, GN = config.map.goldNode;
  const rows = planResourceNodes({ cities: existingCities }).map(({ x, y, resourceType, level }) => {
    const gold = resourceType === 'GOLD';
    const tribe = generateTribeDefenders(level, gold, 1.0, null, campDifficultyAt(x, y));
    const base = { x, y, resourceType, level, biome: getBiome(x, y), hasDefenders: true, defenderPower: tribe.power, defenderUnits: tribe.units };
    // GDD: gold nodes hold a small stock (10 / 20 / 30 by level) that refills in 12 h; no random spread
    if (gold) { const amount = GN.lootByLevel[level] || GN.lootByLevel[1]; return { ...base, amount, maxAmount: amount, regenRate: Math.max(1, Math.round(amount / GN.intervalHours)), respawnMinutes: 60 + level * 60 }; }
    const amount = Math.floor((RN.baseAmountByLevel[level] || RN.baseAmountByLevel[1]) * (0.8 + Math.random() * 0.4));
    return { ...base, amount, maxAmount: Math.floor(amount * RN.maxFactor), regenRate: Math.max(1, Math.floor(amount * RN.maxFactor / RN.regenHours)), respawnMinutes: 30 + level * 30 };
  });
  for (let i = 0; i < rows.length; i += BATCH) await prisma.resourceNode.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
  console.log(`[SEED] ${rows.length} resource nodes generated (${rows.filter(r => r.resourceType === 'GOLD').length} gold), carte ${Terrain.WORLD_SIZE} × ${Terrain.WORLD_SIZE}`);
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

// version du tirage des points de ressource (notée sur la table) : une version plus haute retire les points au démarrage
const RESEED_VERSION = 3;
module.exports = { planResourceNodes, seedResourceNodes, syncResourceNodesWithTerrain, rescueTrappedCities, RESEED_VERSION };
