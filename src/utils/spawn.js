// Emplacements libres près du bord de la carte : départ des nouveaux joueurs, capitale déplacée après sa chute.
// Une ville occupe 2 × 2 cases (décision du 25 octobre 2026) : ses quatre cases doivent être libres (ni ville, ni point
// de ressource, ni montagne, ni rochers, ni eau, ni pont, ni gué), sur la terre ferme principale (pas dans une poche
// fermée), et une case reste libre entre deux villes.
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
  const node = await db.resourceNode.findFirst({ where: { OR: cells.map(([cx, cy]) => ({ x: cx, y: cy })), ...(ignoreNodeId ? { NOT: { id: ignoreNodeId } } : {}) }, select: { id: true } });
  return !node;
}

async function findFreeSpawn() {
  let pos = randomEdgePosition();
  for (let i = 0; i < 200; i++) {
    if (await footprintFree(pos.x, pos.y)) return pos;
    pos = randomEdgePosition();
  }
  return pos;
}

// The city whose 2 × 2 block covers the cell (x, y), if any
const cityAtCellWhere = (x, y) => ({ x: { gte: x - 1, lte: x }, y: { gte: y - 1, lte: y } });

module.exports = { randomEdgePosition, findFreeSpawn, footprintFree, cityAtCellWhere };
