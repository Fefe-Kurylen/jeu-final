// Emplacements libres près du bord de la carte : départ des nouveaux joueurs, capitale déplacée après sa chute.
// Une ville occupe 2 × 2 cases (décision du 25 octobre 2026) : ses quatre cases doivent être libres (ni ville, ni point
// de ressource, ni montagne, ni rochers, ni eau, ni pont, ni gué), sur la terre ferme principale (pas dans une poche
// fermée), et une case reste libre entre deux villes ; une colonie en fondation réserve déjà son bloc.
const prisma = require('../config/database');
const config = require('../config');
const { Terrain } = require('./pathfinding');
const { NODE_RESOURCE } = require('./buildingEffects');

// Écart entre les coins de deux villes : 2 cases de ville + 1 case libre. Deux coins à moins de 3 cases dans les deux sens
// donnent deux blocs qui se chevauchent ou se touchent.
const CITY_GAP = 3;
const near = (x, y, field = '') => ({ [field + (field ? 'X' : 'x')]: { gte: x - (CITY_GAP - 1), lte: x + (CITY_GAP - 1) }, [field + (field ? 'Y' : 'y')]: { gte: y - (CITY_GAP - 1), lte: y + (CITY_GAP - 1) } });

// Côtés de la carte au choix à l'inscription (décision du 31 octobre 2026, rapport de vérification) : chacun est un quart
// du carré, vu sur l'écran isométrique (le nord en haut, là où x + y est petit : la neige ; le sud en bas : le désert).
// Signe de x et de y dans ce quart.
const SIDES = ['N', 'E', 'S', 'W'];
const QUADRANT = { N: [-1, -1], E: [1, -1], S: [1, 1], W: [-1, 1] };
// Côté de la case (x, y) : le quart où randomEdgePosition la tire (0 compte avec les positifs)
const sideAt = (x, y) => (y < 0 ? (x < 0 ? 'N' : 'E') : (x < 0 ? 'W' : 'S'));
// Refus d'un côté inconnu (inscription, « Rejoindre le nouveau monde »)
const SIDE_ERROR = 'Côté de la carte invalide : Nord, Est, Sud, Ouest ou au hasard';
// 'N' | 'E' | 'S' | 'W' | 'RANDOM' (aussi en minuscules ; vide = au hasard), null si la valeur n'en est pas une
function parseSide(value) {
  if (value === undefined || value === null || value === '') return 'RANDOM';
  const s = String(value).toUpperCase();
  return s === 'RANDOM' || SIDES.includes(s) ? s : null;
}

// Une case de la bande de départ (spawnEdgeDelta cases depuis le bord) dans le quart du côté donné, au hasard sur l'un de
// ses deux bords ; sans côté, un quart au hasard (les 4 bords du monde comme avant). La ville tient avec sa case (x, y)
// et les cases + 1 : jamais sur la dernière ligne ni la dernière colonne.
function randomEdgePosition(side = null, random = Math.random) {
  const { minCoord: MIN, maxCoord: MAX, spawnEdgeDelta: DELTA } = config.map;
  const [sx, sy] = QUADRANT[SIDES.includes(side) ? side : SIDES[Math.floor(random() * SIDES.length)]];
  const along = (sign) => (sign < 0 ? MIN + Math.floor(random() * -MIN) : Math.floor(random() * MAX));
  const depth = (sign) => { const d = Math.floor(random() * DELTA); return sign < 0 ? MIN + d : MAX - 1 - d; };
  return random() < 0.5 ? { x: depth(sx), y: along(sy) } : { x: along(sx), y: depth(sy) };
}

// Le terrain seul laisse-t-il une ville avec sa case (x, y) ? Terre ferme principale (une poche fermée par les montagnes et
// l'eau : aucune armée n'en sortirait), ses 4 cases dans le monde, ni relief, ni eau, ni pont, ni gué.
function cityGroundOk(x, y) {
  if (!Terrain.isMainland(x, y)) return false;
  for (const [cx, cy] of Terrain.cityCells(x, y)) {
    if (!Terrain.inWorld(cx, cy)) return false;
    const f = Terrain.getTerrainType(cx, cy).feature;
    if (Terrain.BLOCKED[f] || f === 'bridge' || f === 'ford') return false;
  }
  return true;
}

// Can a city stand with its corner (x, y)? `ignoreNodeId`: the resource node a colony is founded on (it becomes the city)
async function footprintFree(x, y, { ignoreNodeId = null, ignoreCityId = null, db = prisma } = {}) {
  if (!cityGroundOk(x, y)) return false;
  const cells = Terrain.cityCells(x, y);
  // another city's 2 × 2 block, or the ring of one free cell around it
  const other = await db.city.findFirst({ where: { ...near(x, y), ...(ignoreCityId ? { NOT: { id: ignoreCityId } } : {}) }, select: { id: true } });
  if (other) return false;
  // un Bastion d'alliance occupe aussi un bloc 2 × 2 (décision du 26 octobre 2026)
  const bastion = await db.bastion.findFirst({ where: { ...near(x, y), status: { not: 'DESTROYED' } }, select: { id: true } });
  if (bastion) return false;
  // a colony being founded (24 h) holds its 2 × 2 block as if the city already stood there
  const founding = await db.army.findFirst({ where: { status: 'FOUNDING', ...near(x, y, 'target'), ...(ignoreNodeId ? { NOT: { targetResourceId: ignoreNodeId } } : {}) }, select: { id: true } });
  if (founding) return false;
  const node = await db.resourceNode.findFirst({ where: { OR: cells.map(([cx, cy]) => ({ x: cx, y: cy })), ...(ignoreNodeId ? { NOT: { id: ignoreNodeId } } : {}) }, select: { id: true } });
  return !node;
}

// Un gisement libre où fonder (bois, pierre, fer, céréales) à moins de 3 cases : une capitale posée là empêcherait d'y
// fonder une colonie (sa case libre)
async function nearFoundableNode(x, y, db) {
  return !!(await db.resourceNode.findFirst({ where: { resourceType: { in: Object.keys(NODE_RESOURCE) }, cityId: null, ...near(x, y) }, select: { id: true } }));
}

// Ordre des côtés essayés : le côté choisi, puis ses deux voisins (au hasard), puis le côté opposé ; au hasard : un quart
// tiré à chaque essai
function sideOrder(side, random) {
  if (!SIDES.includes(side)) return [null];
  const i = SIDES.indexOf(side), next = [SIDES[(i + 1) % 4], SIDES[(i + 3) % 4]];
  if (random() < 0.5) next.reverse();
  return [side, ...next, SIDES[(i + 2) % 4]];
}

// Pass `db` = the transaction of the placement, after lockPlacement(tx), so that two placements never pick overlapping blocks.
// Décision du 31 octobre 2026 (rapport de vérification) : une capitale se pose à 3 cases au moins de tout gisement où fonder ;
// sans place ainsi (config.map.spawn.tries essais), la règle d'avant (le gisement seulement hors de ses 4 cases). Côté plein
// (aucune place, même avec la règle d'avant) : les autres côtés.
async function findFreeSpawn({ db = prisma, side = 'RANDOM', random = Math.random } = {}) {
  const { tries } = config.map.spawn;
  for (const s of sideOrder(side, random)) {
    for (const keepNodesFree of [true, false]) {
      for (let i = 0; i < tries; i++) {
        const pos = randomEdgePosition(s, random);
        if (!(await footprintFree(pos.x, pos.y, { db }))) continue;
        if (keepNodesFree && (await nearFoundableNode(pos.x, pos.y, db))) continue;
        return pos;
      }
    }
  }
  throw Object.assign(new Error('Aucun emplacement libre près du bord de la carte'), { status: 503 });
}

// A city just placed at (x, y): the field armies standing on its 3 other cells are now in it, on its anchor cell (an army
// is never left on a non-anchor city cell, where it would be neither home, nor a defender, nor met in the field)
async function gatherArmiesOnBlock(tx, x, y) {
  await tx.army.updateMany({ where: { status: 'IDLE', isGarrison: false, OR: [{ x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }] }, data: { x, y } });
}

// Every transaction that puts a city on the map (sign-up, capital moved, colony completed, city rescued) takes this lock
// first, then checks the place inside the transaction: two of them never pick overlapping 2 × 2 blocks
const PLACEMENT_LOCK = 7340001;
async function lockPlacement(tx) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLACEMENT_LOCK})`; }

// The city whose 2 × 2 block covers the cell (x, y), if any
const cityAtCellWhere = (x, y) => ({ x: { gte: x - 1, lte: x }, y: { gte: y - 1, lte: y } });

module.exports = { CITY_GAP, SIDES, SIDE_ERROR, parseSide, sideAt, randomEdgePosition, cityGroundOk, findFreeSpawn, footprintFree, cityAtCellWhere, lockPlacement, gatherArmiesOnBlock };
