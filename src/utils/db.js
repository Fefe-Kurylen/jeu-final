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

// Credits are capped by the warehouse / silo capacity, and never lower a stock already above it
// (rapport économie, recommandation 1 : une colonie garde ses 3 000 de départ)
async function creditCity(tx, cityId, gain) {
  const w = amount(gain, 'wood'), s = amount(gain, 'stone'), i = amount(gain, 'iron'), f = amount(gain, 'food');
  if (w + s + i + f === 0) return;
  await tx.$executeRaw`
    UPDATE "City" SET
      wood  = GREATEST(wood,  LEAST(wood  + ${w}, "maxStorage")),
      stone = GREATEST(stone, LEAST(stone + ${s}, "maxStorage")),
      iron  = GREATEST(iron,  LEAST(iron  + ${i}, "maxStorage")),
      food  = GREATEST(food,  LEAST(food  + ${f}, "maxFoodStorage"))
    WHERE id = ${cityId}`;
}

// ---- Stock partagé entre les villes d'un joueur (décision du 30 octobre 2026) ----
// Chaque ville garde son stock et son plafond ; constructions, recrutements, recherche, héros, soins et fondation
// puisent d'abord dans la ville de l'action, puis dans les autres villes du joueur (celle qui en a le plus d'abord).
// L'entretien des troupes puise aussi dans tous les greniers (resourceProcessor.processUpkeep, § 1 bis). Le marché, les
// transports, les convois, le pillage et les raids restent propres à chaque ville.

// Verrouille toutes les villes du joueur, toujours dans le même ordre (id), pour éviter les interblocages ;
// renvoie leurs stocks et plafonds
async function lockPlayerCities(tx, playerId) {
  const rows = await tx.$queryRaw`
    SELECT id, wood, stone, iron, food, "maxStorage", "maxFoodStorage", "isCapital"
    FROM "City" WHERE "playerId" = ${playerId} ORDER BY id FOR UPDATE`;
  return rows.map(r => ({ id: r.id, isCapital: !!r.isCapital, wood: Number(r.wood) || 0, stone: Number(r.stone) || 0, iron: Number(r.iron) || 0, food: Number(r.food) || 0, maxStorage: Number(r.maxStorage) || 0, maxFoodStorage: Number(r.maxFoodStorage) || 0 }));
}

// Répartition d'un prix sur les villes (pur, testable) : la ville `cityId` d'abord, puis les autres par stock décroissant.
// Renvoie { ok, missing, tooSmall, takenByCity: { [id]: { wood, stone, iron, food } } } ; `missing` = ce qui manque au
// total, `tooSmall` = les ressources dont le prix dépasse le stockage de toutes les villes réunies (recommandation 14)
function planDebit(cities, cityId, cost) {
  const takenByCity = {}, missing = {};
  for (const r of RESOURCES) {
    let need = amount(cost, r);
    if (!need) continue;
    const order = [...cities].sort((a, b) => (a.id === cityId ? -1 : b.id === cityId ? 1 : (b[r] - a[r]) || (a.id < b.id ? -1 : 1)));
    for (const c of order) {
      if (need <= 0) break;
      const take = Math.min(need, Math.max(0, Math.floor(c[r])));
      if (take <= 0) continue;
      (takenByCity[c.id] ||= { wood: 0, stone: 0, iron: 0, food: 0 })[r] += take;
      need -= take;
    }
    if (need > 0) missing[r] = need;
  }
  const ok = Object.keys(missing).length === 0;
  const capacity = stockTotals(cities);
  const tooSmall = ok ? [] : RESOURCES.filter(r => amount(cost, r) > (r === 'food' ? capacity.maxFoodStorage : capacity.maxStorage));
  return { ok, missing, tooSmall, takenByCity };
}

// Débite un prix sur le stock de toutes les villes du joueur (rien n'est changé si la somme ne suffit pas).
// `cities` : résultat de lockPlayerCities si l'appelant l'a déjà fait (sinon les villes sont verrouillées ici).
async function debitPlayer(tx, playerId, cityId, cost, cities = null) {
  const list = cities || await lockPlayerCities(tx, playerId);
  const plan = planDebit(list, cityId, cost);
  if (!plan.ok) return plan;
  for (const [id, t] of Object.entries(plan.takenByCity)) {
    if (!(await debitCity(tx, id, t))) throw new Error('debitPlayer: stock changé sous verrou');   // ne doit pas arriver
    const c = list.find(x => x.id === id);
    if (c) for (const r of RESOURCES) c[r] -= t[r];
  }
  return plan;
}

// Des quantités en toutes lettres : « 1 200 de bois et 300 de fer » ('' si rien)
const RES_FR = { wood: 'bois', stone: 'pierre', iron: 'fer', food: 'nourriture' };
function resourceList(amounts) {
  const parts = RESOURCES.filter(r => amounts?.[r] > 0).map(r => `${Math.ceil(amounts[r]).toLocaleString('fr-FR')} de ${RES_FR[r]}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : parts.join('');
}
// Message clair quand la somme des villes ne suffit pas
function missingMessage(result) {
  if (result.tooSmall?.length) return `Stockage trop petit (${result.tooSmall.map(r => RES_FR[r]).join(', ')}) : il faut plus de capacité (Dépôt ou Silo, ou Grand dépôt / Grand silo dans une colonie)`;
  const list = resourceList(result.missing);
  return list ? `Ressources insuffisantes : il manque ${list} (toutes vos villes comprises)` : 'Ressources insuffisantes';
}
// Fin du message d'un remboursement (creditPlayer) quand une part n'a tenu dans aucune ville ('' sinon)
function lostNote(lost) {
  const list = resourceList(lost);
  return list ? ` ; plus de place dans vos villes : ${list} perdus` : '';
}

// Répartition d'un gain (pur, testable) : la ville `cityId` jusqu'à son plafond, puis les autres villes du joueur, celle
// qui a le plus de place d'abord. Met à jour les stocks de `cities` ; renvoie { credited: { [id]: gain }, lost }
function planCredit(cities, cityId, gain) {
  const credited = {}, lost = { wood: 0, stone: 0, iron: 0, food: 0 };
  for (const r of RESOURCES) {
    let left = amount(gain, r);
    if (!left) continue;
    const roomOf = (c) => Math.max(0, Math.floor((r === 'food' ? c.maxFoodStorage : c.maxStorage) - c[r]));
    const order = [...cities].sort((a, b) => (a.id === cityId ? -1 : b.id === cityId ? 1 : roomOf(b) - roomOf(a)));
    for (const c of order) {
      if (left <= 0) break;
      const put = Math.min(left, roomOf(c));
      if (put <= 0) continue;
      (credited[c.id] ||= { wood: 0, stone: 0, iron: 0, food: 0 })[r] += put;
      c[r] += put;
      left -= put;
    }
    lost[r] = left;
  }
  return { credited, lost };
}

// Crédite la ville, puis verse le surplus dans les autres villes du joueur selon la place libre (remboursements) ;
// renvoie { credited, lost } (`lost` : ce qui n'a tenu nulle part)
async function creditPlayer(tx, playerId, cityId, gain, cities = null) {
  const plan = planCredit(cities || await lockPlayerCities(tx, playerId), cityId, gain);
  for (const [id, g] of Object.entries(plan.credited)) await creditCity(tx, id, g);
  return plan;
}

// Stock et plafonds réunis de toutes les villes d'un joueur (barre de ressources, boutons du client)
// (chaque stock compté à l'unité près, comme planDebit : le client et le serveur tombent d'accord sur ce qui se paie)
function stockTotals(cities) {
  const t = { wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 0, maxFoodStorage: 0 };
  for (const c of cities || []) for (const k of Object.keys(t)) t[k] += Math.floor(Number(c[k]) || 0);
  return t;
}

// Bâtiments « capitale seulement » (décision du 30 octobre 2026) : les effets d'une ville se calculent avec ses
// bâtiments et ceux de la capitale du joueur réservés à la capitale (fx.withCapital)
async function capitalBuildingsOf(db, playerId) {
  if (!playerId) return [];   // sans joueur, Prisma ignorerait le filtre et rendrait la capitale de n'importe qui
  const capital = await db.city.findFirst({ where: { playerId, isCapital: true }, select: { buildings: { select: { key: true, level: true } } } });
  return capital?.buildings || [];
}
// `city` porte playerId, isCapital et buildings
async function buildingsWithCapital(db, city) {
  if (city.isCapital) return city.buildings || [];
  return require('./buildingEffects').withCapital(city.buildings || [], await capitalBuildingsOf(db, city.playerId));
}

// Toute unité formée ou soignée apparaît dans la capitale (décision du 30 octobre 2026, § 1 bis : pas de garnison propre
// dans les colonies). Garnison de la capitale du joueur, créée au besoin, sous le verrou de la capitale ; sans capitale
// (cas d'erreur), celle de `fallbackCityId`. Renvoie l'id de la garnison, null s'il n'y a aucune ville.
async function capitalGarrisonId(tx, playerId, fallbackCityId = null) {
  const select = { id: true, x: true, y: true };
  const city = await tx.city.findFirst({ where: { playerId, isCapital: true }, select })
    || (fallbackCityId ? await tx.city.findUnique({ where: { id: fallbackCityId }, select }) : null);
  if (!city) return null;
  await lockCity(tx, city.id);
  const garrison = await tx.army.findFirst({ where: { cityId: city.id, isGarrison: true }, select: { id: true } })
    || await tx.army.create({ data: { ownerId: playerId, cityId: city.id, name: 'Garnison', x: city.x, y: city.y, status: 'IDLE', isGarrison: true }, select: { id: true } });
  return garrison.id;
}
// Ajoute `count` unités à une armée (incrément SQL : plusieurs ajouts du même tick s'additionnent)
async function addArmyUnits(tx, armyId, unitKey, count) {
  if (!armyId || !(count > 0)) return;
  const tier = require('../config/gamedata').unitsData.find(u => u.key === unitKey)?.tier || 'base';
  await tx.armyUnit.upsert({
    where: { armyId_unitKey: { armyId, unitKey } },
    update: { count: { increment: count } },
    create: { armyId, unitKey, tier, count }
  });
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

module.exports = { RESOURCES, lockCity, lockArmy, lockOffer, debitCity, creditCity, lockPlayerCities, planDebit, debitPlayer, creditPlayer, planCredit, missingMessage, lostNote, stockTotals, capitalBuildingsOf, buildingsWithCapital, capitalGarrisonId, addArmyUnits, plunderCity, claimNode, takeFromNode, transition, isId };
