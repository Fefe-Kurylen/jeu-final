// ========== ARMY SERVICE ==========
// Business logic for army operations, extracted from routes/armies.js
// Fixes circular dependency: tick.js -> routes/armies.js -> tick.js

const prisma = require('../config/database');
const { unitsData, factionsData } = require('../config/gamedata');
const { getArmyCarryCapacity, getFactionBonus, getArmyTravelTime } = require('../utils/calculations');
const { findRoute } = require('../utils/pathfinding');
const fx = require('../utils/buildingEffects');
const { calculateWoundedUnits, carryWounded, addWoundedUnits } = require('./woundedService');
const { resolveCombat, heroCombatStats } = require('./combatService');
const { awardHeroXp } = require('./heroXpService');
const config = require('../config');
const { takeFromNode, creditCity, capitalBuildingsOf } = require('../utils/db');
const { techPct } = require('../utils/techEffects');
const { getRelation } = require('./diplomacyService');
const { campUnits, campPower, campBonusPct } = require('../utils/tribeDefenders');

// Irrigation égyptienne : bâtiment « capitale seulement » (décision du 30 octobre 2026), elle accélère toutes les armées,
// tous les convois et tous les espions du joueur, d'où qu'ils partent (une requête ; `db` = prisma ou la transaction)
const playerMarchPct = async (db, playerId) => (playerId ? fx.marchSpeedBonusPct(await capitalBuildingsOf(db, playerId)) : 0);

// Fight against the tribe guarding a resource node. Runs inside `tx` so that two concurrent
// raids on the same node from the same army cannot both be resolved.
async function resolveTribeCombat(army, node, playerId, tx = prisma) {
  // chaque défenseur porte son palier (tribu, Immortels d'élite), comme dans la puissance affichée sur la carte
  const defenderUnits = node.hasDefenders ? campUnits(node.defenderUnits) : [];

  if (defenderUnits.length === 0 || !node.hasDefenders) {
    return { success: true, combatResult: { winner: 'attacker', attackerLosses: 0, defenderLosses: 0 }, loot: null, message: 'Tribu absente - démarrage de la récolte' };
  }

  // Art de la guerre (technologie) : bonus d'attaque du joueur
  const techRows = await tx.playerTechnology.findMany({ where: { playerId } });
  // A camp is a static target: the winner loses less than in a raid on a city (config.combat.tribeLossMultiplier)
  // camp d'or : +40 % (config.map.camps.goldDefenseBonusPct) comme sa puissance affichée (campPower)
  const combat = resolveCombat(army.units.map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })), defenderUnits, 0, heroCombatStats(army.hero), null, { attackerFaction: army.owner?.faction, attackerBonusPct: techPct(techRows, 'attackBonusPct'), defenseBonusPct: campBonusPct(node.resourceType), winnerLossMultiplier: config.combat.tribeLossMultiplier });

  let totalAttackerLosses = 0;
  const killed = [];
  for (const unit of army.units) {
    const losses = Math.floor(unit.count * combat.attackerLossRate);
    totalAttackerLosses += losses;
    if (losses <= 0) continue;
    killed.push({ key: unit.unitKey, killed: losses });
    if (losses >= unit.count) { await tx.armyUnit.delete({ where: { id: unit.id } }); }
    else { await tx.armyUnit.update({ where: { id: unit.id }, data: { count: { decrement: losses } } }); }
  }

  let totalDefenderLosses = 0;
  const newDefenderUnits = {};
  for (const [unitType, count] of Object.entries(node.defenderUnits)) {
    const losses = Math.floor(count * combat.defenderLossRate);
    totalDefenderLosses += losses;
    newDefenderUnits[unitType] = Math.max(0, count - losses);
  }

  // classements : la tribu tuée donne des points d'attaque (comme les animaux d'une oasis Travian)
  await require('./rankingService').recordCombat(tx, { attackers: [{ playerId, units: army.units.reduce((t, u) => t + u.count, 0) }], defenders: [], attackerLosses: killed, defenderLosses: Object.entries(node.defenderUnits || {}).map(([key, count]) => ({ key, killed: Math.floor(count * combat.defenderLossRate) })) });
  if (combat.attackerWon) {
    await tx.resourceNode.update({ where: { id: node.id }, data: { hasDefenders: false, defenderUnits: newDefenderUnits, defenderPower: 0, lastDefeat: new Date() } });
    if (army.heroId) await awardHeroXp(army.heroId, Math.floor(totalDefenderLosses * config.combat.heroXpPerTribeKill), tx);
  } else {
    // The camp keeps its survivors; its power is the real power of what is left (same scale as the map shows)
    await tx.resourceNode.update({ where: { id: node.id }, data: { defenderUnits: newDefenderUnits, defenderPower: campPower(newDefenderUnits, node.resourceType) } });
  }

  // Wounded, as after a city battle: part of the losses comes back to the home city's Healing Tent (Greek bonus, Medicine)
  let woundedBack = 0;
  if (totalAttackerLosses > 0 && army.cityId) {
    try {
      const wounded = await calculateWoundedUnits(army.cityId, killed, army.owner?.faction, techPct(techRows, 'woundedBonusPct') + require('../utils/heroEffects').talent(army.hero, 'woundedPct'));
      if (wounded.length) woundedBack = await carryWounded(tx, army.id, wounded);   // ils rentrent avec l'armée
    } catch (e) { console.error('[WOUNDED]', e.message); }
  }

  const report = await tx.battleReport.create({
    data: { playerId, attackerId: playerId, x: node.x, y: node.y, result: combat.attackerWon ? 'WIN' : 'LOSE', winner: combat.attackerWon ? 'ATTACKER' : 'DEFENDER', attackerUnits: army.units.map(u => ({ key: u.unitKey, count: u.count })), defenderUnits, attackerLosses: { totalAttackerLosses, totalKilled: totalAttackerLosses, rate: combat.attackerLossRate }, defenderLosses: { totalDefenderLosses, totalKilled: totalDefenderLosses, rate: combat.defenderLossRate }, loot: { attackerName: army.owner?.name, defenderName: 'Tribu locale', cityName: `${node.resourceType} (${node.x}, ${node.y})`, type: 'TRIBE' }, rounds: { type: 'TRIBE_RAID', resourceType: node.resourceType } }
  });
  // Immortels vaincus (site de Merveille, plan) : décision du 28 octobre 2026, services/wonderService.js
  if (combat.attackerWon && require('./wonderService').isSpecial(node)) await require('./wonderService').onImmortalsBeaten(tx, node, playerId);

  return { success: combat.attackerWon, reportId: report.id, combatResult: { winner: combat.attackerWon ? 'attacker' : 'defender', attackerLosses: totalAttackerLosses, woundedBack, defenderLosses: totalDefenderLosses, attackerPower: combat.attackerPower, defenderPower: combat.defenderPower }, loot: null, message: combat.attackerWon ? 'Tribu vaincue! Démarrage de la récolte.' : 'Votre armée a été repoussée' };
}

// Loot after a tribe is beaten: the army loads what it can carry and brings it home (deposited on return,
// never teleported into the city); the node is debited atomically and never goes below zero.
const CARRY_FIELD = { WOOD: 'carryWood', STONE: 'carryStone', IRON: 'carryIron', FOOD: 'carryFood', GOLD: 'carryGold' };
async function collectResourceLoot(army, node, playerId, tx = prisma, reportId = null) {
  const fresh = await tx.army.findUnique({ where: { id: army.id }, include: { units: true, hero: true, owner: true } });
  if (!fresh) return {};
  const carrying = fresh.carryWood + fresh.carryStone + fresh.carryIron + fresh.carryFood + fresh.carryGold;
  // Same transport bonuses as raids and convoys: civilization (Egypt, Sultanate), Market / Trade Office of the home city and
  // Desert Outpost of the capital
  const cityBuildings = fresh.cityId ? await tx.cityBuilding.findMany({ where: { cityId: fresh.cityId }, select: { key: true, level: true } }) : [];
  const buildings = fx.withCapital(cityBuildings, await capitalBuildingsOf(tx, fresh.ownerId));
  const transportMult = (1 + (getFactionBonus(fresh.owner?.faction, 'transportCapacity', factionsData) || 0) / 100) * (1 + fx.transportBonusPct(buildings) / 100) * (await require('./bastionService').carryMult(fresh.ownerId));   // + Bastion d'alliance
  const room = Math.floor(getArmyCarryCapacity(fresh.units, unitsData, fresh.hero) * transportMult * (1 + require('../utils/heroEffects').talent(fresh.hero, 'lootPct') / 100)) - carrying;   // talent Pillard
  const field = CARRY_FIELD[node.resourceType];
  if (!field || room <= 0) return {};
  const taken = await takeFromNode(tx, node.id, room);
  if (taken <= 0) return {};
  await tx.army.update({ where: { id: army.id }, data: { [field]: { increment: taken } } });
  if (reportId) await tx.$executeRaw`UPDATE "BattleReport" SET loot = COALESCE(loot, '{}'::jsonb) || jsonb_build_object('resources', jsonb_build_object(${node.resourceType.toLowerCase()}::text, ${taken}::int)) WHERE id = ${reportId}`;
  return { [node.resourceType]: taken };
}

// Loses `rate` of every unit group of an army (rows deleted at zero); returns what was killed
async function applyLossRate(tx, units, rate) {
  let total = 0; const killed = [];
  for (const u of units) {
    const l = Math.floor(u.count * rate);
    if (l <= 0) continue;
    total += l; killed.push({ key: u.unitKey, killed: l, remaining: Math.max(0, u.count - l) });
    if (l >= u.count) await tx.armyUnit.deleteMany({ where: { id: u.id } }); else await tx.armyUnit.update({ where: { id: u.id }, data: { count: { decrement: l } } });
    u.count -= l;
  }
  return { total, killed };
}

// An army beaten on a node or before a besieged city goes home (idle on the spot when it has no city or no unit left)
async function sendArmyHomeTx(tx, army) {
  const city = army.city || (army.cityId ? await tx.city.findUnique({ where: { id: army.cityId } }) : null);
  const units = (army.units || []).filter(u => u.count > 0);
  const reset = { harvestResourceType: null, targetResourceId: null, targetCityId: null, targetBastionId: null, rallyId: null, claimedAt: null };   // also lifts a siege camp
  if (!city || !units.length) { await tx.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, arrivalAt: null, ...reset } }); return; }
  const route = await findRoute(army.x, army.y, city.x, city.y, army.owner?.faction).catch(() => null);
  const speed = techPct(army.owner?.technologies, 'armySpeedBonusPct') + (await require('./bastionService').speedPct(army.ownerId)) + (await playerMarchPct(tx, army.ownerId));   // + Bastion d'alliance, Irrigation
  const travelTime = getArmyTravelTime(units, army.x, army.y, city.x, city.y, army.owner?.faction, army.hero, route ? route.length : null, speed);
  await tx.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: city.x, targetY: city.y, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), departedAt: new Date(), ...reset } });
}

// Open-field battle between one army and the armies standing on a spot (resource node held, siege camp): resolved
// by power (no wall, no « défense chez soi »), the loser's losses follow the raid rule; wounded on both sides travel
// with their army, hero XP as in a city battle, one report for the attacker and one per defending player.
// Runs inside `tx`. The caller decides what happens to the armies afterwards.
async function fieldBattle(tx, army, holders, playerId, place) {
  const defenderUnits = holders.flatMap(h => h.units.filter(u => u.count > 0).map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })));
  const lead = holders[0];
  const atkTech = await tx.playerTechnology.findMany({ where: { playerId } });
  const combat = resolveCombat(army.units.map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })), defenderUnits, 0, heroCombatStats(army.hero), heroCombatStats(require('./heroService').leadingHero(holders)), {   // un héros sans soldats ne combat pas
    fieldBattle: true, attackerFaction: army.owner?.faction, defenderFaction: lead.owner?.faction, attackerBonusPct: techPct(atkTech, 'attackBonusPct'), defenderBonusPct: techPct(lead.owner?.technologies, 'defenseBonusPct')
  });
  const atkBefore = army.units.map(u => ({ unitKey: u.unitKey, count: u.count }));
  const engaged = require('./heroService').fought([army, ...holders]);   // héros des armées qui combattent avec des soldats
  const RK = require('./rankingService');
  const sides = { attackers: [{ playerId, units: RK.unitCount(army.units) }], defenders: RK.sideOf(holders) };   // avant les pertes
  const atk = await applyLossRate(tx, army.units, combat.attackerLossRate);
  let defTotal = 0; const defKilled = [];
  for (const h of holders) { const r = await applyLossRate(tx, h.units, combat.defenderLossRate); defTotal += r.total; defKilled.push([h, r.killed]); }
  await require('./heroService').fallIfWiped(tx, engaged);   // une armée anéantie perd son héros
  await RK.recordCombat(tx, { ...sides, attackerLosses: atk.killed, defenderLosses: defKilled.flatMap(([, k]) => k) });   // classements

  // Wounded on both sides, hero XP as in a city battle
  try {
    // an attacker fighting at home (the city's riposte) sends its wounded straight to the Healing Tent
    if (atk.total > 0 && army.cityId) { const w = await calculateWoundedUnits(army.cityId, atk.killed, army.owner?.faction, techPct(atkTech, 'woundedBonusPct') + require('../utils/heroEffects').talent(army.hero, 'woundedPct')); if (w.length) await (place.attackerAtHome ? addWoundedUnits(army.cityId, w, tx) : carryWounded(tx, army.id, w)); }
    for (const [h, killed] of defKilled) if (killed.length && h.cityId) { const w = await calculateWoundedUnits(h.cityId, killed, h.owner?.faction, techPct(h.owner?.technologies, 'woundedBonusPct') + require('../utils/heroEffects').talent(h.hero, 'woundedPct')); if (w.length) await carryWounded(tx, h.id, w); }
  } catch (e) { console.error('[WOUNDED]', e.message); }
  if (army.heroId) await awardHeroXp(army.heroId, Math.floor(defTotal * config.combat.heroXpPerKill * (combat.attackerWon ? 1 : 0.3)), tx);
  for (const h of holders) if (h.heroId) await awardHeroXp(h.heroId, Math.floor(atk.total * config.combat.heroXpPerKill * (combat.attackerWon ? 0.3 : 1)), tx);

  // One report for the attacker, one for each holder
  const defenderName = [...new Set(holders.map(h => h.owner?.name).filter(Boolean))].join(', ') || 'Armée adverse';
  // report rows are summed per unit type: one side may be several armies (garrison and armies at home, several camps)
  const perKey = (before, after) => {
    const m = {};
    for (const u of before) (m[u.unitKey] ||= { key: u.unitKey, count: 0, remaining: 0 }).count += u.count;
    for (const u of after) if (m[u.unitKey]) m[u.unitKey].remaining += Math.max(0, u.count);
    return Object.values(m);
  };
  const lossRows = (rows) => rows.filter(e => e.count > e.remaining).map(e => ({ key: e.key, killed: e.count - e.remaining, remaining: e.remaining }));
  const A = perKey(atkBefore, army.units), D = perKey(defenderUnits, holders.flatMap(h => h.units));
  const base = {
    x: place.x, y: place.y, winner: combat.attackerWon ? 'ATTACKER' : 'DEFENDER',
    attackerUnits: A.map(e => ({ key: e.key, count: e.count })),
    defenderUnits: D.map(e => ({ key: e.key, count: e.count })),
    attackerLosses: { totalKilled: atk.total, rate: combat.attackerLossRate, units: lossRows(A) },
    defenderLosses: { totalKilled: defTotal, rate: combat.defenderLossRate, units: lossRows(D) },
    loot: { attackerName: army.owner?.name, defenderName, cityName: place.where, type: place.type, attackerPower: Math.round(combat.attackerPower), defenderPower: Math.round(combat.defenderPower) },
    rounds: place.rounds
  };
  const report = await tx.battleReport.create({ data: { ...base, playerId, attackerId: playerId, defenderId: lead.ownerId, result: combat.attackerWon ? 'WIN' : 'LOSE' } });
  const reportIds = { [playerId]: report.id };   // each player's own copy, for the links of the notifications
  for (const ownerId of new Set(holders.map(h => h.ownerId))) reportIds[ownerId] = (await tx.battleReport.create({ data: { ...base, playerId: ownerId, attackerId: playerId, defenderId: ownerId, result: combat.attackerWon ? 'LOSE' : 'WIN' } })).id;
  await tx.playerStats.upsert({ where: { playerId }, update: { unitsKilled: { increment: defTotal }, unitsLost: { increment: atk.total }, ...(combat.attackerWon ? { attacksWon: { increment: 1 } } : {}) }, create: { playerId, unitsKilled: defTotal, unitsLost: atk.total, attacksWon: combat.attackerWon ? 1 : 0 } });

  return { combat, report, reportIds, defenderName, attackerLosses: atk.total, defenderLosses: defTotal };
}

// Fight against the army (or allied armies) holding a resource node, as on a Travian oasis: an open-field battle resolved
// by power (no wall, no « défense chez soi »), the loser's losses follow the raid rule, the holders go home when beaten and
// the node is released for the attacker. Runs inside `tx`. Returns the same shape as resolveTribeCombat.
async function resolveNodeHolderCombat(army, node, playerId, tx = prisma) {
  const holders = await tx.army.findMany({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: node.id, NOT: { ownerId: playerId } }, include: { units: true, hero: { include: { items: true } }, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } }, city: true } });
  const myAlliance = army.owner?.alliance?.allianceId || null;
  if (!holders.length) return { success: true, free: true, combatResult: null, loot: null, message: 'Point libre' };
  if (holders.every(h => myAlliance && h.owner?.alliance?.allianceId === myAlliance)) return { success: true, shared: true, combatResult: null, loot: null, message: 'Point partagé avec votre alliance' };
  const where = `${node.resourceType} (${node.x}, ${node.y})`;
  // jamais de combat contre une alliance alliée, même devenue alliée pendant la marche : l'armée rentre (blocked),
  // son propriétaire est prévenu par `notices`, envoyées par l'appelant après le commit
  for (const ownerId of new Set(holders.map(h => h.ownerId))) {
    if ((await getRelation(playerId, ownerId, tx)).canAttack) continue;
    const notices = [[playerId, 'battle', '🤝 Point tenu par un allié', `${army.name || 'Votre armée'} rentre : le point ${where} est tenu par une armée alliée.`, { to: 'map', x: node.x, y: node.y }]];
    return { success: false, blocked: true, combatResult: null, loot: null, notices, message: 'Point tenu par une armée alliée' };
  }
  const defenderUnits = holders.flatMap(h => h.units.filter(u => u.count > 0).map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })));
  if (!defenderUnits.length) {
    await tx.resourceNode.updateMany({ where: { id: node.id }, data: { hasPlayerArmy: false } });
    for (const h of holders) await sendArmyHomeTx(tx, h);
    return { success: true, free: true, combatResult: null, loot: null, message: 'Point libre' };
  }
  const { combat, report, reportIds, defenderName, attackerLosses, defenderLosses } = await fieldBattle(tx, army, holders, playerId, { x: node.x, y: node.y, where, type: 'NODE_FIGHT', rounds: { type: 'NODE_FIGHT', resourceType: node.resourceType } });
  if (combat.attackerWon) {
    await tx.resourceNode.updateMany({ where: { id: node.id }, data: { hasPlayerArmy: false, lastArmyDeparture: new Date() } });
    // GDD: settlers are vulnerable — a founding party that is beaten loses its settler
    for (const h of holders) { if (h.status === 'FOUNDING' && (h.settlers || 0) > 0) { await tx.army.update({ where: { id: h.id }, data: { settlers: 0 } }); h.settlers = 0; } await sendArmyHomeTx(tx, h); }
  }
  // sent by the caller once its transaction is committed (no alert for a fight that was rolled back)
  const notices = [...new Set(holders.map(h => h.ownerId))].map(ownerId => combat.attackerWon
    ? [ownerId, 'battle', '⚔️ Armée chassée', `${army.owner?.name || 'Un joueur'} a chassé votre armée du point ${where}. Rapport disponible.`, { to: 'report', reportId: reportIds[ownerId], x: node.x, y: node.y }]
    : [ownerId, 'battle', '🛡️ Point défendu', `Votre armée a repoussé ${army.owner?.name || 'un joueur'} sur le point ${where}. Rapport disponible.`, { to: 'report', reportId: reportIds[ownerId], x: node.x, y: node.y }]);
  return {
    success: combat.attackerWon, reportId: report.id, notices,
    combatResult: { winner: combat.attackerWon ? 'attacker' : 'defender', attackerLosses, defenderLosses, attackerPower: Math.round(combat.attackerPower), defenderPower: Math.round(combat.defenderPower) },
    loot: null, message: combat.attackerWon ? `Armée de ${defenderName} chassée du point` : 'Votre armée a été repoussée'
  };
}

// One raid per target city per attacker per 24 h (GDD): keyed on the city id, so that a relocated capital keeps its
// cooldown; reports written before the id was stored are matched on the coordinates
function raidCooldownWhere(attackerId, targetCity, since) {
  return { attackerId, playerId: attackerId, defenderId: targetCity.playerId, createdAt: { gt: since }, AND: [{ loot: { path: ['type'], equals: 'RAID' } }, { OR: [{ loot: { path: ['cityId'], equals: targetCity.id } }, { x: targetCity.x, y: targetCity.y }] }] };
}

// What an army carries (resources, gold, settlers, wounded) goes into the city, inside the caller's transaction and from
// the carry as it stands under the lock: an army freed in the same transaction can be sent off again at once, so its load
// must already be in the city
async function depositCarryTx(tx, armyId, cityId) {
  const a = await tx.army.findUnique({ where: { id: armyId }, select: { ownerId: true, carryWood: true, carryStone: true, carryIron: true, carryFood: true, carryGold: true, settlers: true, woundedCarry: true } });
  if (!a) return;
  const carried = (Array.isArray(a.woundedCarry) ? a.woundedCarry : []).filter(w => w && w.count > 0);
  if (carried.length) await addWoundedUnits(cityId, carried, tx);
  await creditCity(tx, cityId, { wood: a.carryWood, stone: a.carryStone, iron: a.carryIron, food: a.carryFood });
  if ((a.carryGold || 0) > 0) await tx.player.update({ where: { id: a.ownerId }, data: { gold: { increment: a.carryGold } } });
  if ((a.settlers || 0) > 0) await tx.city.update({ where: { id: cityId }, data: { settlers: { increment: a.settlers } } });
  await tx.army.update({ where: { id: armyId }, data: { carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0, carryGold: 0, settlers: 0, woundedCarry: [] } });
}

module.exports = { raidCooldownWhere, resolveTribeCombat, resolveNodeHolderCombat, collectResourceLoot, sendArmyHomeTx, fieldBattle, depositCarryTx, playerMarchPct };
