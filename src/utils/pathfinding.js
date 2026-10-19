// ========== ARMY PATHS ==========
// Armies walk around mountains and water: the shared procedural terrain (frontend/js/shared/terrain.js,
// the same code the client draws) tells which tiles are blocked; cities and resource nodes are always
// passable, like on the map. The route length (8-neighbour A*) is what the travel time is based on.
const prisma = require('../config/database');
const Terrain = require('../../frontend/js/shared/terrain.js');

// Object cells ("x,y" -> 'CITY' | 'RESOURCE'), refreshed every minute: relief is never drawn on or next to them
let objectCells = new Map();
let objectCellsAt = 0;
async function getObjectCells() {
  if (Date.now() - objectCellsAt < 60000 && objectCells.size) return objectCells;
  const [cities, nodes] = await Promise.all([
    prisma.city.findMany({ select: { x: true, y: true } }),
    prisma.resourceNode.findMany({ select: { x: true, y: true } })
  ]);
  const m = new Map();
  for (const n of nodes) m.set(n.x + ',' + n.y, 'RESOURCE');
  for (const c of cities) m.set(c.x + ',' + c.y, 'CITY');
  objectCells = m;
  objectCellsAt = Date.now();
  return m;
}
function noteObjectCell(x, y, type) { objectCells.set(x + ',' + y, type); }
function forgetObjectCell(x, y) { objectCells.delete(x + ',' + y); }

async function isBlockedTile(x, y) { return Terrain.isBlocked(x, y, await getObjectCells()); }

// Route between two tiles, or null when none exists (water, mountains) — { path, length }
async function findRoute(fromX, fromY, toX, toY) {
  return Terrain.findPath(fromX, fromY, toX, toY, await getObjectCells());
}

// Length of the route used for travel times; throws a client-facing error when the destination is unreachable
async function routeLength(fromX, fromY, toX, toY) {
  const route = await findRoute(fromX, fromY, toX, toY);
  if (!route) {
    const blocked = await isBlockedTile(toX, toY);
    throw Object.assign(new Error(blocked ? 'Une armée ne peut pas se rendre sur une montagne ou dans l\'eau' : 'Aucun chemin terrestre vers cette destination'), { code: 'NO_ROUTE', status: 400 });
  }
  return route.length;
}

module.exports = { getObjectCells, noteObjectCell, forgetObjectCell, isBlockedTile, findRoute, routeLength, Terrain };
