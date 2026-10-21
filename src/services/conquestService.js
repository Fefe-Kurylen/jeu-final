// ========== CHUTE D'UNE VILLE ==========
// Décision d'octobre 2026 : une ville ne change jamais de propriétaire. Chaque assaut gagné (après un siège) ôte une part de
// la « santé de la muraille » (City.wallStructure, 1 = 100 %) et pille une part du stock. À 0 :
//  - une ville secondaire est rasée (le point de ressource redevient libre) ;
//  - une capitale ne peut pas être prise : elle est déplacée au hasard près du bord de la carte, santé remise à 100 %.

const prisma = require('../config/database');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { getFactionBonus, getArmyCarryCapacity, getArmyTravelTime } = require('../utils/calculations');
const { plunderCity, creditCity } = require('../utils/db');
const fx = require('../utils/buildingEffects');
const { findFreeSpawn } = require('../utils/spawn');
const { noteObjectCell, forgetObjectCell, routeLength } = require('../utils/pathfinding');

const F = () => config.combat.fall;
const RES = ['wood', 'stone', 'iron', 'food'];

// Assauts gagnés nécessaires pour faire tomber la ville (capitale 4, secondaire 2, +1 pour l'Égypte)
function assaultsToFall(city, faction) {
  return (city.isCapital ? F().assaults.capital : F().assaults.secondary) + (F().extraAssaults[String(faction || '').toUpperCase()] || 0);
}
const assaultsLeft = (city, faction) => Math.max(0, Math.round((city.wallStructure ?? 1) * assaultsToFall(city, faction)));

// Pillage d'un assaut gagné : pillagePct % du stock au-dessus des grands entrepôts et de la cachette quitte la ville ;
// l'armée en emporte ce qu'elle peut porter (déposé au retour), le reste part en fumée. Dans la transaction de la bataille.
async function pillage(tx, city, army, survivors) {
  const hideout = city.buildings.find(b => b.key === 'HIDEOUT');
  let shelter = (hideout?.level || 0) * config.hideout.protectionPerLevel * (1 + getFactionBonus(city.player.faction, 'hideoutCapacity', factionsData) / 100);
  shelter = Math.min(shelter, config.hideout.maxProtection);
  const protectedStock = fx.protectedStorage(city.buildings);
  const want = {};
  for (const r of RES) want[r] = Math.floor(Math.max(0, (city[r] - (protectedStock[r] || 0)) * (1 - shelter)) * F().pillagePct / 100);
  const taken = await plunderCity(tx, city.id, want);
  const total = RES.reduce((t, r) => t + taken[r], 0);
  const capacity = Math.floor(getArmyCarryCapacity(survivors, unitsData, army.hero) * (1 + getFactionBonus(army.owner.faction, 'transportCapacity', factionsData) / 100));
  const share = total > 0 ? Math.min(1, capacity / total) : 0;
  const carried = Object.fromEntries(RES.map(r => [r, Math.floor(taken[r] * share)]));
  if (RES.some(r => carried[r] > 0)) await tx.army.update({ where: { id: army.id }, data: { carryWood: { increment: carried.wood }, carryStone: { increment: carried.stone }, carryIron: { increment: carried.iron }, carryFood: { increment: carried.food } } });
  return { taken, carried };
}

// Santé de la muraille après un assaut gagné ; renvoie { before, after, fallen }
async function wearWallStructure(tx, city) {
  const n = assaultsToFall(city, city.player.faction);
  const before = city.wallStructure ?? 1;
  // the wall regenerates a little between two assaults: the city falls when less than half an assault is left
  const left = Math.max(0, before - 1 / n);
  const fallen = left <= 0.5 / n;
  const after = fallen ? 0 : left;
  await tx.city.update({ where: { id: city.id }, data: { wallStructure: after } });
  return { before, after, fallen, needed: n };
}

// Les armées hostiles en route vers la ville font demi-tour (même durée que le trajet déjà fait) ; les camps qui l'assiègent
// rentrent par la vraie route, à la vitesse de l'armée. Les convois ne sont pas hostiles : ils sont traités à part.
async function turnBackHostiles(tx, city, exceptArmyId) {
  const { sendArmyHomeTx } = require('./armyService');
  const hostiles = await tx.army.findMany({ where: { targetCityId: city.id, id: { not: exceptArmyId || '' }, NOT: { ownerId: city.playerId }, status: { in: ['ATTACKING', 'RAIDING', 'SPYING', 'BESIEGING'] } }, include: { city: true, units: true, hero: { include: { items: true } }, owner: { include: { technologies: true } } } });
  const now = Date.now();
  for (const a of hostiles) {
    if (a.status === 'BESIEGING') { await sendArmyHomeTx(tx, a); continue; }
    if (!a.city) { await tx.army.update({ where: { id: a.id }, data: { status: 'IDLE', missionType: null, targetCityId: null, targetX: null, targetY: null, arrivalAt: null, claimedAt: null } }); continue; }
    const back = a.departedAt ? Math.max(0, now - new Date(a.departedAt).getTime()) : 0;
    await tx.army.update({ where: { id: a.id }, data: { status: 'RETURNING', missionType: 'RETURN', targetCityId: null, targetX: a.city.x, targetY: a.city.y, departedAt: new Date(now), arrivalAt: new Date(now + Math.max(30000, back)), claimedAt: null } });
  }
  return [...new Set(hostiles.map(a => a.ownerId))];
}

// Ville secondaire rasée : troupes et blessés présents perdus, armées en mission rattachées à la capitale, héros sauvé
async function razeCity(cityId, byArmyId) {
  return prisma.$transaction(async (tx) => {
    // lock order of the market routes: offers first, then the city
    await tx.$queryRaw`SELECT id FROM "MarketOffer" WHERE "cityId" = ${cityId} AND status = 'ACTIVE' ORDER BY id FOR UPDATE`;
    // then every city of the owner, in id order (as the market routes): the falling city, the capital that takes its
    // armies and goods (slots read under the lock army creation takes), and the cities whose queued research is refunded
    // — no City lock is ever awaited while a queue row is held
    const owner = await tx.city.findUnique({ where: { id: cityId }, select: { playerId: true } });
    if (!owner) return null;
    await tx.$queryRaw`SELECT id FROM "City" WHERE "playerId" = ${owner.playerId} ORDER BY id FOR UPDATE`;
    const city = await tx.city.findUnique({ where: { id: cityId }, include: { armies: { include: { units: true } } } });
    if (!city || city.isCapital || city.wallStructure > 0) return null;
    const capital = await tx.city.findFirst({ where: { playerId: city.playerId, isCapital: true } });
    const capitalGarrison = capital ? await tx.army.findFirst({ where: { cityId: capital.id, isGarrison: true } }) : null;
    const usedSlots = new Set(capital ? (await tx.army.findMany({ where: { cityId: capital.id, isGarrison: false }, select: { slot: true } })).map(a => a.slot) : []);
    const heroes = [];
    for (const a of city.armies) {
      const atHome = a.isGarrison || (a.status === 'IDLE' && a.x === city.x && a.y === city.y);
      if (atHome) { if (a.heroId) heroes.push(a.heroId); await tx.army.delete({ where: { id: a.id } }); continue; }
      // away on a mission: it now belongs to the capital, on the lowest free slot there (beyond the Rally Point limit if
      // need be, so that it is never lost); an army on an expedition will come back to the capital
      const data = { cityId: capital?.id || null };
      if (capital) {
        let slot = 1; while (usedSlots.has(slot)) slot++; usedSlots.add(slot);
        data.slot = slot;
        if (a.name === `Armée ${a.slot}`) data.name = `Armée ${slot}`;
        if (a.status === 'EXPEDITION') Object.assign(data, { x: capital.x, y: capital.y });
      }
      if (a.status === 'RETURNING' && capital) {
        const extra = await routeLength(city.x, city.y, capital.x, capital.y).then(len => getArmyTravelTime(a.units, city.x, city.y, capital.x, capital.y, null, null, len)).catch(() => 0);
        Object.assign(data, { targetX: capital.x, targetY: capital.y, arrivalAt: new Date(Math.max(Date.now(), new Date(a.arrivalAt || Date.now()).getTime()) + extra * 1000) });
      }
      await tx.army.update({ where: { id: a.id }, data });
    }
    // the hero of an army destroyed with the city escapes to the capital
    if (heroes.length && capitalGarrison && !capitalGarrison.heroId) await tx.army.update({ where: { id: capitalGarrison.id }, data: { heroId: heroes[0] } });
    const owners = await turnBackHostiles(tx, city, byArmyId);
    // convoys heading to the razed colony (any owner) turn back with their cargo, the time they already walked
    const convoys = await tx.army.findMany({ where: { targetCityId: city.id, status: 'TRANSPORTING', claimedAt: null }, include: { city: true } });
    for (const a of convoys) {
      const t = Date.now(), back = a.departedAt ? Math.max(30000, t - new Date(a.departedAt).getTime()) : 30000;
      if (!a.city) await tx.army.updateMany({ where: { id: a.id, status: 'TRANSPORTING' }, data: { status: 'IDLE', missionType: null, targetCityId: null, targetX: null, targetY: null, arrivalAt: null, claimedAt: null } });
      else await tx.army.updateMany({ where: { id: a.id, status: 'TRANSPORTING' }, data: { status: 'RETURNING', missionType: 'RETURN', targetCityId: null, targetX: a.city.x, targetY: a.city.y, departedAt: new Date(t), arrivalAt: new Date(t + back), claimedAt: null } });
    }
    // research running or queued in the colony is lost with it; the later levels of those technologies queued elsewhere
    // depend on them: they are cancelled and refunded, as the cancel route does
    const T = require('../utils/techEffects');
    await require('../game/processors/researchProcessor').lockResearch(tx, city.playerId);   // after the City locks
    for (const q of await tx.researchQueueItem.findMany({ where: { cityId: city.id } })) {
      const later = await tx.researchQueueItem.findMany({ where: { playerId: city.playerId, techKey: q.techKey, targetLevel: { gt: q.targetLevel }, cityId: { not: city.id } } });
      for (const l of later) {
        const removed = await tx.researchQueueItem.deleteMany({ where: { id: l.id, status: l.status } });
        if (removed.count !== 1) continue;
        const paid = l.cost && typeof l.cost === 'object' ? l.cost : T.researchCost(T.techOf(l.techKey), l.targetLevel);
        await creditCity(tx, l.cityId, T.scaleCost(paid, l.status === 'QUEUED' ? 1 : T.RULES.refundRateStarted));
      }
    }
    // market offers of the city are cancelled; the goods held for them go to the capital
    const offers = await tx.marketOffer.findMany({ where: { cityId: city.id, status: 'ACTIVE' } });
    for (const o of offers) {
      const ok = await tx.marketOffer.updateMany({ where: { id: o.id, status: 'ACTIVE' }, data: { status: 'CANCELLED', cityId: capital?.id || null } });
      if (ok.count === 1 && capital) await creditCity(tx, capital.id, { [o.sellResource]: o.sellAmount });
    }
    // the resource node comes back: no city on it, a tribe will settle again later
    await tx.resourceNode.updateMany({ where: { cityId: city.id }, data: { cityId: null, hasPlayerArmy: false, lastDefeat: new Date(), lastArmyDeparture: new Date() } });
    await tx.city.delete({ where: { id: city.id } });
    // the research that was running in the city is gone with it: the next one in the player's queue starts
    await require('../game/processors/researchProcessor').startNextQueued(tx, city.playerId);
    return { city, owners };
  }, { timeout: 15000 });
}

// Capitale tombée : déplacée sur un emplacement libre près du bord ; ses armées en ville la suivent, celles qui rentrent
// sont redirigées ; santé de la muraille remise à 100 %, siège levé
async function relocateCapital(cityId, byArmyId) {
  const pos = await findFreeSpawn();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "City" WHERE id = ${cityId} FOR UPDATE`;
    const city = await tx.city.findUnique({ where: { id: cityId }, include: { armies: { include: { units: true } } } });
    if (!city || !city.isCapital || city.wallStructure > 0) return null;   // already moved by another executor
    const from = { x: city.x, y: city.y };
    await tx.city.update({ where: { id: city.id }, data: { x: pos.x, y: pos.y, wallStructure: 1, isSieged: false } });
    for (const a of city.armies) {
      if (a.isGarrison || ((a.status === 'IDLE' || a.status === 'EXPEDITION') && a.x === from.x && a.y === from.y)) { await tx.army.update({ where: { id: a.id }, data: { x: pos.x, y: pos.y } }); continue; }
      if (a.status === 'RETURNING') {
        const extra = await routeLength(from.x, from.y, pos.x, pos.y).then(len => getArmyTravelTime(a.units, from.x, from.y, pos.x, pos.y, null, null, len)).catch(() => 0);
        await tx.army.update({ where: { id: a.id }, data: { targetX: pos.x, targetY: pos.y, arrivalAt: new Date(Math.max(Date.now(), new Date(a.arrivalAt || Date.now()).getTime()) + extra * 1000) } });
      }
    }
    // every convoy on its way to the city (its owner's or a friend's) follows it to its new place, and takes the extra way
    const convoys = await tx.army.findMany({ where: { targetCityId: city.id, status: 'TRANSPORTING', claimedAt: null }, include: { units: true } });
    const extraLen = convoys.length ? await routeLength(from.x, from.y, pos.x, pos.y).catch(() => null) : null;
    for (const a of convoys) {
      const extra = getArmyTravelTime(a.units, from.x, from.y, pos.x, pos.y, null, null, extraLen);
      await tx.army.updateMany({ where: { id: a.id, status: 'TRANSPORTING', claimedAt: null }, data: { targetX: pos.x, targetY: pos.y, arrivalAt: new Date(Math.max(Date.now(), new Date(a.arrivalAt || Date.now()).getTime()) + extra * 1000) } });
    }
    const owners = await turnBackHostiles(tx, city, byArmyId);
    return { city, from, to: pos, owners };
  }, { timeout: 15000 });
}

// Après la transaction de l'assaut (ou à la reprise du tick) : fait tomber la ville si sa muraille est à 0 et prévient
// le propriétaire et, quand il est connu, l'attaquant. `by` = { id, ownerId, ownerName } de l'armée de l'assaut.
async function applyFall(cityId, by = null) {
  const { notify } = require('./pushService');
  const city = await prisma.city.findUnique({ where: { id: cityId }, select: { id: true, name: true, playerId: true, isCapital: true, wallStructure: true } });
  if (!city || city.wallStructure > 0) return null;
  const who = by?.ownerName ? ` sous les assauts de ${by.ownerName}` : '';
  if (city.isCapital) {
    const moved = await relocateCapital(city.id, by?.id);
    if (!moved) return null;
    forgetObjectCell(moved.from.x, moved.from.y); noteObjectCell(moved.to.x, moved.to.y, 'CITY');
    notify(city.playerId, 'city_fall', '🏃 Capitale déplacée', `${city.name} est tombée${who} : la cour s'enfuit et rebâtit la capitale en (${moved.to.x}, ${moved.to.y}).`, { tab: 'city', cityId: city.id });
    if (by?.ownerId) notify(by.ownerId, 'city_fall', '🏃 Capitale en fuite', `${city.name} est tombée : sa cour a fui vers un lieu inconnu.`, { tab: 'reports' });
    return { kind: 'RELOCATED', ...moved };
  }
  const razed = await razeCity(city.id, by?.id);
  if (!razed) return null;
  noteObjectCell(razed.city.x, razed.city.y, 'RESOURCE');
  notify(city.playerId, 'city_fall', '🔥 Ville rasée', `${city.name} est tombée${who} et a été rasée.`, { tab: 'reports' });
  if (by?.ownerId) notify(by.ownerId, 'city_fall', '🔥 Ville rasée', `${city.name} est tombée : la ville est rasée.`, { tab: 'reports' });
  try { await require('../game/processors/worldProcessor').updatePlayerPopulation(prisma, city.playerId); } catch (e) { /* recomputed by the tick */ }
  return { kind: 'RAZED', ...razed };
}

module.exports = { assaultsToFall, assaultsLeft, pillage, wearWallStructure, applyFall, razeCity, relocateCapital };
