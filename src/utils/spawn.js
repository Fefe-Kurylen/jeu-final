// Emplacements libres près du bord de la carte : départ des nouveaux joueurs, capitale déplacée après sa chute
const prisma = require('../config/database');
const config = require('../config');
const { isBlockedTile } = require('./pathfinding');

function randomEdgePosition() {
  const { minCoord: MIN, maxCoord: MAX, spawnEdgeDelta: DELTA } = config.map;
  const along = () => MIN + Math.floor(Math.random() * (MAX - MIN + 1));
  switch (Math.floor(Math.random() * 4)) {
    case 0: return { x: along(), y: MAX - Math.floor(Math.random() * DELTA) };
    case 1: return { x: MAX - Math.floor(Math.random() * DELTA), y: along() };
    case 2: return { x: along(), y: MIN + Math.floor(Math.random() * DELTA) };
    default: return { x: MIN + Math.floor(Math.random() * DELTA), y: along() };
  }
}

// A free tile: no city and no resource node on it
async function findFreeSpawn() {
  let pos = randomEdgePosition();
  for (let i = 0; i < 100; i++) {
    const [city, node] = await Promise.all([
      prisma.city.findUnique({ where: { x_y: pos }, select: { id: true } }),
      prisma.resourceNode.findUnique({ where: { x_y: pos }, select: { id: true } })
    ]);
    if (!city && !node && !(await isBlockedTile(pos.x, pos.y))) return pos;
    pos = randomEdgePosition();
  }
  return pos;
}

module.exports = { randomEdgePosition, findFreeSpawn };
