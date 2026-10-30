// ========== ATOMIC DB HELPERS ==========
// Prisma interactive transactions run at READ COMMITTED without row locks, so every
// "read then write an absolute value" sequence loses updates under concurrency.
// Rules used across the server:
//  - lock the City / Army / MarketOffer row (FOR UPDATE) before reading it in a transaction
//  - spend with a conditional UPDATE (WHERE stock >= cost) and credit with LEAST(stock + x, cap)
//  - change a status only from its expected previous value (updateMany + count check)

const RESOURCES = ['wood', 'stone', 'iron', 'food'];

async function lockCity(tx, cityId) {
  await tx.$queryRaw`SELECT id FROM "City" WHERE id = ${cityId} FOR UPDATE`;
}

async function lockArmy(tx, armyId) {
  await tx.$queryRaw`SELECT id FROM "Army" WHERE id = ${armyId} FOR UPDATE`;
}

async function lockOffer(tx, offerId) {
  await tx.$queryRaw`SELECT id FROM "MarketOffer" WHERE id = ${offerId} FOR UPDATE`;
}

const amount = (obj, key) => Math.max(0, Math.floor(Number(obj?.[key]) || 0));

// Returns false (and changes nothing) when the city cannot afford the cost
async function debitCity(tx, cityId, cost) {
  const w = amount(cost, 'wood'), s = amount(cost, 'stone'), i = amount(cost, 'iron'), f = amount(cost, 'food');
  const n = await tx.$executeRaw`
    UPDATE "City" SET wood = wood - ${w}, stone = stone - ${s}, iron = iron - ${i}, food = food - ${f}
    WHERE id = ${cityId} AND wood >= ${w} AND stone >= ${s} AND iron >= ${i} AND food >= ${f}`;
  return n === 1;
}

// Credits are capped by the warehouse / silo capacity
async function creditCity(tx, cityId, gain) {
  const w = amount(gain, 'wood'), s = amount(gain, 'stone'), i = amount(gain, 'iron'), f = amount(gain, 'food');
  if (w + s + i + f === 0) return;
  await tx.$executeRaw`
    UPDATE "City" SET
      wood  = LEAST(wood  + ${w}, "maxStorage"),
      stone = LEAST(stone + ${s}, "maxStorage"),
      iron  = LEAST(iron  + ${i}, "maxStorage"),
      food  = LEAST(food  + ${f}, "maxFoodStorage")
    WHERE id = ${cityId}`;
}

// Takes up to `want` of each resource, never below zero; returns what was actually taken
async function plunderCity(tx, cityId, want) {
  const w = amount(want, 'wood'), s = amount(want, 'stone'), i = amount(want, 'iron'), f = amount(want, 'food');
  const rows = await tx.$queryRaw`
    WITH old AS (SELECT id, wood, stone, iron, food FROM "City" WHERE id = ${cityId} FOR UPDATE)
    UPDATE "City" c SET
      wood  = c.wood  - LEAST(old.wood,  ${w}),
      stone = c.stone - LEAST(old.stone, ${s}),
      iron  = c.iron  - LEAST(old.iron,  ${i}),
      food  = c.food  - LEAST(old.food,  ${f})
    FROM old WHERE c.id = old.id
    RETURNING LEAST(old.wood, ${w}) AS wood, LEAST(old.stone, ${s}) AS stone, LEAST(old.iron, ${i}) AS iron, LEAST(old.food, ${f}) AS food`;
  const taken = rows[0] || {};
  return { wood: Math.floor(Number(taken.wood) || 0), stone: Math.floor(Number(taken.stone) || 0), iron: Math.floor(Number(taken.iron) || 0), food: Math.floor(Number(taken.food) || 0) };
}

// A resource node hosts harvesting armies: the flag is taken conditionally on a free node; a node already held is open to
// the holder's own armies and to those of its alliance (claimant = { playerId, allianceId }), never to anyone else
async function claimNode(tx, nodeId, claimant = null) {
  const r = await tx.resourceNode.updateMany({ where: { id: nodeId, hasPlayerArmy: false, hasDefenders: false, cityId: null }, data: { hasPlayerArmy: true } });
  if (r.count === 1) return true;
  if (!claimant || !claimant.playerId) return false;
  const node = await tx.resourceNode.findUnique({ where: { id: nodeId }, select: { hasDefenders: true, hasPlayerArmy: true, cityId: true } });
  if (!node || node.cityId || node.hasDefenders || !node.hasPlayerArmy) return false;
  const holders = await tx.army.findMany({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: nodeId }, select: { ownerId: true, status: true, owner: { select: { alliance: { select: { allianceId: true } } } } } });
  if (!holders.length || holders.some(h => h.status === 'FOUNDING')) return false;
  return holders.every(h => h.ownerId === claimant.playerId || (claimant.allianceId && h.owner?.alliance?.allianceId === claimant.allianceId));
}

// Takes up to `want` units from a node, never below zero; returns what was actually taken
// (RETURNING voit la ligne après l'UPDATE : la prise se calcule sur le stock d'avant, lu par le CTE, comme plunderCity)
async function takeFromNode(tx, nodeId, want) {
  const w = Math.max(0, Math.floor(Number(want) || 0));
  if (w === 0) return 0;
  const rows = await tx.$queryRaw`
    WITH old AS (SELECT id, amount FROM "ResourceNode" WHERE id = ${nodeId} FOR UPDATE)
    UPDATE "ResourceNode" n SET amount = n.amount - LEAST(old.amount, ${w})
    FROM old WHERE n.id = old.id AND old.amount > 0
    RETURNING LEAST(old.amount, ${w}) AS taken`;
  return rows.length ? Math.floor(Number(rows[0].taken) || 0) : 0;
}

// Status transition guarded by the expected current status; false when another request won the race
async function transition(tx, model, id, fromStatus, data) {
  const res = await tx[model].updateMany({ where: { id, status: fromStatus }, data });
  return res.count === 1;
}

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;

module.exports = { RESOURCES, lockCity, lockArmy, lockOffer, debitCity, creditCity, plunderCity, claimNode, takeFromNode, transition, isId };
