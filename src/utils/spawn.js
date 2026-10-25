// Emplacements libres près du bord de la carte : départ des nouveaux joueurs, capitale déplacée après sa chute.
// Une ville occupe 2 × 2 cases (décision du 25 octobre 2026) : ses quatre cases doivent être libres (ni ville, ni point
// de ressource, ni montagne, ni rochers, ni eau, ni pont, ni gué), sur la terre ferme principale (pas dans une poche
// fermée), et une case reste libre entre deux villes ; une colonie en fondation réserve déjà son bloc.
const prisma = require('../config/database');
const config = require('../config');
const { Terrain } = require('./pathfinding');

function randomEdgePosition() {
  const { minCoord: MIN, maxCoord: MAX, spawnEdgeDelta: DELTA } = config.map;
  const along = () => MIN + Math.floor(Math.random() * (MAX - MIN));
  switch (Math.floor(Math.random() * 4)) {
    case 0: return { x: along(), y: MAX - 1 - Math.floor(Math.random() * DELTA) };
    case 1: return { x: MAX - 1 - Math.floor(Math.random() * DELTA), y: along() };
    case 2: return { x: along(), y: MIN + Math.floor(Math.random() * DELTA) };
    default: return { x: MIN + Math.floor(Math.random() * DELTA), y: along() };
  }
}

// Can a city stand with its corner (x, y)? `ignoreNodeId`: the resource node a colony is founded on (it becomes the city)
async function footprintFree(x, y, { ignoreNodeId = null, ignoreCityId = null, db = prisma } = {}) {
  const cells = Terrain.cityCells(x, y);
  if (!Terrain.isMainland(x, y)) return false;   // poche fermée par les montagnes et l'eau : aucune armée n'en sortirait
  for (const [cx, cy] of cells) {
    if (!Terrain.inWorld(cx, cy)) return false;
    const f = Terrain.getTerrainType(cx, cy).feature;
    if (Terrain.BLOCKED[f] || f === 'bridge' || f === 'ford') return false;
  }
  // another city's 2 × 2 block, or the ring of one free cell around it
  const near = await db.city.findFirst({ where: { x: { gte: x - 2, lte: x + 2 }, y: { gte: y - 2, lte: y + 2 }, ...(ignoreCityId ? { NOT: { id: ignoreCityId } } : {}) }, select: { id: true } });
  if (near) return false;
  // a colony being founded (24 h) holds its 2 × 2 block as if the city already stood there
  const founding = await db.army.findFirst({ where: { status: 'FOUNDING', targetX: { gte: x - 2, lte: x + 2 }, targetY: { gte: y - 2, lte: y + 2 }, ...(ignoreNodeId ? { NOT: { targetResourceId: ignoreNodeId } } : {}) }, select: { id: true } });
  if (founding) return false;
  const node = await db.resourceNode.findFirst({ where: { OR: cells.map(([cx, cy]) => ({ x: cx, y: cy })), ...(ignoreNodeId ? { NOT: { id: ignoreNodeId } } : {}) }, select: { id: true } });
  return !node;
}

// Pass `db` = the transaction of the placement, after lockPlacement(tx), so that two placements never pick overlapping blocks
async function findFreeSpawn({ db = prisma } = {}) {
  for (let i = 0; i < 300; i++) {
    const pos = randomEdgePosition();
    if (await footprintFree(pos.x, pos.y, { db })) return pos;
  }
  throw Object.assign(new Error('Aucun emplacement libre près du bord de la carte'), { status: 503 });
}

// Every transaction that puts a city on the map (sign-up, capital moved, colony completed, city rescued) takes this lock
// first, then checks the place inside the transaction: two of them never pick overlapping 2 × 2 blocks
const PLACEMENT_LOCK = 7340001;
async function lockPlacement(tx) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLACEMENT_LOCK})`; }

// The city whose 2 × 2 block covers the cell (x, y), if any
const cityAtCellWhere = (x, y) => ({ x: { gte: x - 1, lte: x }, y: { gte: y - 1, lte: y } });

module.exports = { randomEdgePosition, findFreeSpawn, footprintFree, cityAtCellWhere, lockPlacement };
