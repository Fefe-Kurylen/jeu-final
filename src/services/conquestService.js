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
const { findFreeSpawn, lockPlacement, gatherArmiesOnBlock } = require('../utils/spawn');
const { noteObjectCell, noteCityCells, forgetCityCells, routeLength } = require('../utils/pathfinding');

const F = () => config.combat.fall;
const RES = ['wood', 'stone', 'iron', 'food'];

// Assauts gagnés nécessaires pour faire tomber la ville (capitale 4, secondaire 2, +1 pour l'Égypte)
function assaultsToFall(city, faction) {
  return (city.isCapital ? F().assaults.capital : F().assaults.secondary) + (F().extraAssaults[String(faction || '').toUpperCase()] || 0);
}
const assaultsLeft = (city, faction) => Math.max(0, Math.round((city.wallStructure ?? 1) * assaultsToFall(city, faction)));   // vies restantes

// Pillage d'un combat gagné (décision du 25 octobre 2026) : pillagePct % du stock hors cachette (seule la cachette protège,
// décision du 30 octobre 2026), dans la limite de ce que les armées portent ; ce qu'elles ne portent pas reste à la ville.
// Plusieurs camps alliés se partagent le butin selon leur capacité. `survivors` : Map armyId -> unités restantes. Dans la
// transaction.
async function pillage(tx, city, armies, survivors) {
  const hideout = city.buildings.find(b => b.key === 'HIDEOUT');
  let shelter = (hideout?.level || 0) * config.hideout.protectionPerLevel * (1 + getFactionBonus(city.player.faction, 'hideoutCapacity', factionsData) / 100);
  shelter = Math.min(shelter, config.hideout.maxProtection);
  const want = {};
  for (const r of RES) want[r] = Math.floor(Math.max(0, city[r] * (1 - shelter)) * F().pillagePct / 100);
  const BS = require('./bastionService');
  const allianceOf = new Map((await tx.allianceMember.findMany({ where: { playerId: { in: armies.map(a => a.ownerId) } }, select: { playerId: true, allianceId: true } })).map(m => [m.playerId, m.allianceId]));
  const caps = armies.map(a => ({ a, cap: Math.max(0, Math.floor(getArmyCarryCapacity(survivors.get(a.id) || [], unitsData, a.hero) * (1 + getFactionBonus(a.owner?.faction, 'transportCapacity', factionsData) / 100) * BS.carryMultSync(allianceOf.get(a.ownerId)) * (1 + require('../utils/heroEffects').talent(a.hero, 'lootPct') / 100))) }));   // + Bastion d'alliance, talent Pillard
  const capacity = caps.reduce((t, c) => t + c.cap, 0);
  const wanted = RES.reduce((t, r) => t + want[r], 0);
  const share = wanted > 0 ? Math.min(1, capacity / wanted) : 0;
  const taken = await plunderCity(tx, city.id, Object.fromEntries(RES.map(r => [r, Math.floor(want[r] * share)])));
  const carried = new Map();
  for (const { a, cap } of caps) {
    const part = capacity > 0 ? cap / capacity : 0;
    const load = Object.fromEntries(RES.map(r => [r, Math.floor(taken[r] * part)]));
    carried.set(a.id, load);
    if (RES.some(r => load[r] > 0)) await tx.army.update({ where: { id: a.id }, data: { carryWood: { increment: load.wood }, carryStone: { increment: load.stone }, carryIron: { increment: load.iron }, carryFood: { increment: load.food } } });
  }
  return { taken, carried };
}

// Une vie perdue après un combat gagné par l'attaquant, avec la même part des PV du mur ; renvoie { before, after, fallen }
async function wearWallStructure(tx, city) {
  const n = assaultsToFall(city, city.player.faction);
  const before = city.wallStructure ?? 1;
  // lives come back little by little: the city falls when less than half a life is left after the loss
  const left = Math.max(0, before - 1 / n);
  const fallen = left <= 0.5 / n;
  const after = fallen ? 0 : left;
  await tx.city.update({ where: { id: city.id }, data: { wallStructure: after, wallHp: Math.max(0, (city.wallMaxHp || 0) * after) } });
  return { before, after, fallen, needed: n };
}

// Les armées hostiles en route vers la ville font demi-tour (même durée que le trajet déjà fait) ; les camps qui l'assiègent
// rentrent par la vraie route, à la vitesse de l'armée. Les renforts alliés en route font demi-tour, ceux qui étaient
// stationnés dans la ville rentrent aussi. Les convois ne sont pas hostiles : ils sont traités à part.
async function turnBackHostiles(tx, city, except) {
  const exceptIds = (Array.isArray(except) ? except : [except]).filter(Boolean);
  const { sendArmyHomeTx } = require('./armyService');
  const hostiles = await tx.army.findMany({ where: { targetCityId: city.id, id: { notIn: exceptIds }, NOT: { ownerId: city.playerId }, status: { in: ['ATTACKING', 'RAIDING', 'SPYING', 'BESIEGING', 'SUPPORTING', 'STATIONED'] } }, include: { city: true, units: true, hero: { include: { items: true } }, owner: { include: { technologies: true } } } });
  const now = Date.now();
  for (const a of hostiles) {
    if (a.status === 'BESIEGING' || a.status === 'STATIONED') { await sendArmyHomeTx(tx, a); continue; }
    if (!a.city) { await tx.army.update({ where: { id: a.id }, data: { status: 'IDLE', missionType: null, targetCityId: null, targetX: null, targetY: null, arrivalAt: null, claimedAt: null } }); continue; }
    const back = a.departedAt ? Math.max(0, now - new Date(a.departedAt).getTime()) : 0;
    await tx.army.update({ where: { id: a.id }, data: { status: 'RETURNING', missionType: 'RETURN', targetCityId: null, targetX: a.city.x, targetY: a.city.y, departedAt: new Date(now), arrivalAt: new Date(now + Math.max(30000, back)), claimedAt: null } });
  }
  return [...new Set(hostiles.map(a => a.ownerId))];
}

// Ville secondaire rasée : troupes et blessés présents perdus, armées en mission rattachées à la capitale, héros enfui
// vers la capitale
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
    const usedSlots = new Set(capital ? (await tx.army.findMany({ where: { cityId: capital.id, isGarrison: false }, select: { slot: true } })).map(a => a.slot) : []);
    const heroes = [];
    const ownerFaction = (await tx.player.findUnique({ where: { id: city.playerId }, select: { faction: true } }))?.faction || null;
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
        const extra = await routeLength(city.x, city.y, capital.x, capital.y, ownerFaction).then(len => getArmyTravelTime(a.units, city.x, city.y, capital.x, capital.y, ownerFaction, null, len)).catch(() => 0);
        Object.assign(data, { targetX: capital.x, targetY: capital.y, arrivalAt: new Date(Math.max(Date.now(), new Date(a.arrivalAt || Date.now()).getTime()) + extra * 1000) });
      }
      await tx.army.update({ where: { id: a.id }, data });
    }
    // le héros s'enfuit vers la capitale : celui d'une armée détruite avec la ville, celui qui y attendait sans armée, et
    // celui d'une armée en mission désormais rattachée à la capitale ; jamais un Hero.cityId vers une ville supprimée
    await tx.hero.updateMany({ where: { playerId: city.playerId, OR: [{ cityId: city.id }, { id: { in: heroes } }] }, data: { cityId: capital?.id ?? null } });
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
    await require('./marketService').cancelOffersOfCity(tx, city.id, capital?.id || null);   // armées réservées libérées
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
  return prisma.$transaction(async (tx) => {
    await lockPlacement(tx);   // first, before any row lock: the new place is chosen and taken under it
    await tx.$executeRaw`SELECT id FROM "City" WHERE id = ${cityId} FOR UPDATE`;
    const city = await tx.city.findUnique({ where: { id: cityId }, include: { armies: { include: { units: true } } } });
    if (!city || !city.isCapital || city.wallStructure > 0) return null;   // already moved by another executor
    const pos = await findFreeSpawn({ db: tx });
    const from = { x: city.x, y: city.y };
    await tx.city.update({ where: { id: city.id }, data: { x: pos.x, y: pos.y, wallStructure: 1, wallHp: city.wallMaxHp || 0, isSieged: false } });
    await gatherArmiesOnBlock(tx, pos.x, pos.y);
    // every army of the capital, wherever it is and whatever it does, is brought back at once to the new place; its
    // mission is cancelled and what it carries goes into the city (décision du 25 octobre 2026). An arrival being
    // resolved right now (claimed) finishes first and then walks to the new place.
    const { depositCarryTx } = require('./armyService');
    await require('./marketService').cancelOffersOfCity(tx, city.id, city.id);   // offres annulées, marchandises rendues
    const campsLeft = new Set(), bastionCampsLeft = new Set();
    for (const a of city.armies) {
      if (a.claimedAt) {
        if (a.status === 'RETURNING') await tx.army.update({ where: { id: a.id }, data: { targetX: pos.x, targetY: pos.y } });
        continue;
      }
      if ((a.status === 'HARVESTING' || a.status === 'FOUNDING') && a.targetResourceId) {
        const others = await tx.army.count({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: a.targetResourceId, id: { not: a.id } } });
        if (others === 0) await tx.resourceNode.updateMany({ where: { id: a.targetResourceId }, data: { hasPlayerArmy: false, lastArmyDeparture: new Date() } });
      }
      if (a.status === 'EXPEDITION') await tx.expedition.updateMany({ where: { armyId: a.id, status: 'IN_PROGRESS' }, data: { status: 'EXPIRED' } });
      if (a.status === 'BESIEGING' && a.targetCityId) campsLeft.add(a.targetCityId);
      if (a.status === 'BESIEGING' && a.targetBastionId) bastionCampsLeft.add(a.targetBastionId);   // camp devant un Bastion
      if (!a.isGarrison) await depositCarryTx(tx, a.id, city.id);
      // mission annulée : plus de cible ni de rassemblement (un ancien rallyId fausserait le héros d'un assaut de Bastion)
      await tx.army.update({ where: { id: a.id }, data: { status: 'IDLE', x: pos.x, y: pos.y, targetX: null, targetY: null, targetCityId: null, targetBastionId: null, rallyId: null, arrivalAt: null, departedAt: null, claimedAt: null, missionType: null, targetResourceId: null, harvestResourceType: null } });
    }
    const { refreshSiegeFlag } = require('../game/processors/siegeProcessor');
    for (const id of campsLeft) await refreshSiegeFlag(tx, id);
    const { refreshSieged } = require('./bastionService');
    for (const id of bastionCampsLeft) await refreshSieged(tx, id);   // le Bastion n'est plus assiégé s'il n'y reste aucun camp
    // every convoy on its way to the city (its owner's or a friend's) follows it to its new place, and takes the extra way
    const convoys = await tx.army.findMany({ where: { targetCityId: city.id, status: 'TRANSPORTING', claimedAt: null }, include: { units: true, owner: { select: { faction: true } } } });
    const lenByFaction = new Map();   // the extra way, per civilisation (forests do not slow the Gauls)
    for (const a of convoys) {
      const faction = a.owner?.faction || null;
      if (!lenByFaction.has(faction)) lenByFaction.set(faction, await routeLength(from.x, from.y, pos.x, pos.y, faction).catch(() => null));
      const extra = getArmyTravelTime(a.units, from.x, from.y, pos.x, pos.y, faction, null, lenByFaction.get(faction));
      await tx.army.updateMany({ where: { id: a.id, status: 'TRANSPORTING', claimedAt: null }, data: { targetX: pos.x, targetY: pos.y, arrivalAt: new Date(Math.max(Date.now(), new Date(a.arrivalAt || Date.now()).getTime()) + extra * 1000) } });
    }
    const owners = await turnBackHostiles(tx, city, byArmyId);
    return { city, from, to: pos, owners };
  }, { timeout: 15000 });
}

// The other players whose armies were heading to the fallen city (or camping before it) learn why they turn back; the
// new place of a capital is not revealed
function tellTurnedBack(notify, owners, by, city, at) {
  for (const id of owners || []) {
    if (id === city.playerId || id === by?.ownerId) continue;
    notify(id, 'battle', '↩️ Cible tombée', `${city.name} est tombée : votre armée en route ou devant la ville rentre.`, { to: 'map', x: at.x, y: at.y });
  }
}

// Après la transaction de l'assaut (ou à la reprise du tick) : fait tomber la ville si sa muraille est à 0 et prévient
// le propriétaire et, quand il est connu, l'attaquant. `by` = { id, ownerId, ownerName } de l'armée de l'assaut.
async function applyFall(cityId, by = null) {
  const { notify } = require('./pushService');
  const city = await prisma.city.findUnique({ where: { id: cityId }, select: { id: true, name: true, playerId: true, isCapital: true, wallStructure: true } });
  if (!city || city.wallStructure > 0) return null;
  const who = by?.ownerName ? ` sous les assauts de ${by.ownerName}` : '';
  if (city.isCapital) {
    const moved = await relocateCapital(city.id, by?.ids || by?.id);
    if (!moved) return null;
    forgetCityCells(moved.from.x, moved.from.y); noteCityCells(moved.to.x, moved.to.y);
    notify(city.playerId, 'city_fall', '🏃 Capitale déplacée', `${city.name} est tombée${who} : la cour s'enfuit et rebâtit la capitale en (${moved.to.x}, ${moved.to.y}). Toutes vos armées l'y ont rejointe.`, { to: 'map', x: moved.to.x, y: moved.to.y, cityId: city.id });
    // the owner's alliance is told where its member's capital went (décision du 25 octobre 2026)
    const member = await prisma.allianceMember.findFirst({ where: { playerId: city.playerId }, select: { allianceId: true, player: { select: { name: true } } } });
    if (member) {
      const mates = await prisma.allianceMember.findMany({ where: { allianceId: member.allianceId, playerId: { not: city.playerId } }, select: { playerId: true } });
      for (const m of mates) notify(m.playerId, 'city_fall', '🏃 Capitale alliée déplacée', `La capitale de ${member.player?.name || 'votre allié'} est tombée et s'est rebâtie en (${moved.to.x}, ${moved.to.y}).`, { to: 'map', x: moved.to.x, y: moved.to.y });
    }
    tellTurnedBack(notify, moved.owners, by, city, moved.from);
    if (by?.ownerId) notify(by.ownerId, 'city_fall', '🏃 Capitale en fuite', `${city.name} est tombée : sa cour a fui vers un lieu inconnu.`, by.reportIds?.[by.ownerId] ? { to: 'report', reportId: by.reportIds[by.ownerId] } : { to: 'map', x: moved.from.x, y: moved.from.y });
    return { kind: 'RELOCATED', ...moved };
  }
  const razed = await razeCity(city.id, by?.ids || by?.id);
  if (!razed) return null;
  forgetCityCells(razed.city.x, razed.city.y); noteObjectCell(razed.city.x, razed.city.y, 'RESOURCE');
  tellTurnedBack(notify, razed.owners, by, city, razed.city);
  notify(city.playerId, 'city_fall', '🔥 Ville détruite', `${city.name} est tombée${who} et a été détruite.`, { to: 'map', x: razed.city.x, y: razed.city.y });
  if (by?.ownerId) notify(by.ownerId, 'city_fall', '🔥 Ville détruite', `${city.name} est tombée : la ville est détruite.`, by.reportIds?.[by.ownerId] ? { to: 'report', reportId: by.reportIds[by.ownerId], x: razed.city.x, y: razed.city.y } : { to: 'map', x: razed.city.x, y: razed.city.y });
  try { await require('../game/processors/worldProcessor').updatePlayerPopulation(prisma, city.playerId); } catch (e) { /* recomputed by the tick */ }
  return { kind: 'RAZED', ...razed };
}

module.exports = { assaultsToFall, assaultsLeft, pillage, wearWallStructure, applyFall };
