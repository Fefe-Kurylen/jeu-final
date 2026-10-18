const express = require('express');
const { notify } = require('../services/pushService');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { validateCoordinates, cleanText, isAmount } = require('../utils/validation');
const { calculateTravelTime, calculateArmyPower, getCityTier, getCityTierName, getMinSiegeEngines, countSiegeEngines, getArmyTravelTime, getArmyCarryCapacity, getFactionBonus } = require('../utils/calculations');
const T = require('../utils/techEffects');
const speedTechPct = (army) => T.techPct(army?.owner?.technologies, 'armySpeedBonusPct');   // Cartographie
const { resolveTribeCombat, resolveNodeHolderCombat, collectResourceLoot } = require('../services/armyService');
const { getRelation } = require('../services/diplomacyService');
const { lockArmy, lockCity, debitCity, transition, isId, claimNode } = require('../utils/db');
const fx = require('../utils/buildingEffects');
const { routeLength, findRoute, isBlockedTile } = require('../utils/pathfinding');
const { pointAlongPath } = require('../utils/calculations');

const OUTBOUND = ['MOVING', 'ATTACKING', 'RAIDING', 'SPYING', 'TRANSPORTING'];
const SPY_SPEED = 80;

const loadArmy = (id, playerId, include = {}, db = prisma) =>
  db.army.findFirst({ where: { id, ownerId: playerId }, include: { units: true, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } }, hero: { include: { items: true } }, ...include } });

// Travel times follow the route around mountains and water; both throw { code: 'NO_ROUTE' } when there is none
const travelTo = async (army, toX, toY) => getArmyTravelTime(army.units, army.x, army.y, toX, toY, army.owner?.faction, army.hero, await routeLength(army.x, army.y, toX, toY), speedTechPct(army));
const spyTravelTo = async (army, toX, toY) => calculateTravelTime(army.x, army.y, toX, toY, SPY_SPEED, army.owner?.faction, factionsData, await routeLength(army.x, army.y, toX, toY), speedTechPct(army));
const noRoute = (res, e) => (e && e.code === 'NO_ROUTE' ? res.status(400).json({ error: e.message }) : null);
const isHome = (army, city) => !!city && army.x === city.x && army.y === city.y;

// Common checks before a field army leaves: the garrison never leaves the city
function readyToLeave(army, verb) {
  if (!army) return { status: 404, error: 'Armée non trouvée' };
  if (army.isGarrison) return { status: 400, error: 'La garnison ne quitte pas la ville : créez une armée au point de ralliement' };
  if (army.status !== 'IDLE') return { status: 400, error: 'Armée déjà en mission' };
  if (army.units.length === 0) return { status: 400, error: army.heroId ? `Le héros nécessite au moins 1 soldat pour ${verb}` : 'Armée vide' };
  return null;
}

// Returns an error message when `army` may not run `mission` (ATTACK|RAID|SPY) against `targetCity`
async function checkHostileTarget(army, targetCity, mission) {
  if (targetCity.playerId === army.ownerId) return 'Vous ne pouvez pas cibler vos propres villes';
  if (mission !== 'SPY') {
    const relation = await getRelation(army.ownerId, targetCity.playerId);
    if (!relation.canAttack) return relation.status === 'SAME_ALLIANCE' ? 'Impossible d\'attaquer un membre de votre alliance' : 'Impossible d\'attaquer une alliance alliée';
  }
  if (mission === 'ATTACK') {
    const wallLevel = targetCity.buildings?.find(b => b.key === 'WALL')?.level || 0;
    const cityTier = getCityTier(wallLevel);
    const minSiegeRequired = getMinSiegeEngines(cityTier);
    const siegeCount = countSiegeEngines(army.units, unitsData);
    if (siegeCount < minSiegeRequired) return `Pour assiéger une ${getCityTierName(cityTier)}, il faut minimum ${minSiegeRequired} engin(s) de siège. Vous en avez ${siegeCount}.`;
  }
  if (mission === 'RAID') {
    // GDD: one raid per target city per attacker per 24h
    const since = new Date(Date.now() - config.combat.raidCooldownHours * 3600000);
    const recent = await prisma.battleReport.findFirst({ where: { attackerId: army.ownerId, playerId: army.ownerId, defenderId: targetCity.playerId, x: targetCity.x, y: targetCity.y, createdAt: { gt: since }, loot: { path: ['type'], equals: 'RAID' } }, select: { createdAt: true } });
    if (recent) {
      const hoursLeft = Math.ceil((recent.createdAt.getTime() + config.combat.raidCooldownHours * 3600000 - Date.now()) / 3600000);
      return `Cette ville a déjà été pillée récemment : nouveau raid possible dans ${hoursLeft} h`;
    }
    const inFlight = await prisma.army.count({ where: { ownerId: army.ownerId, status: 'RAIDING', missionType: 'RAID', targetCityId: targetCity.id } });
    if (inFlight > 0) return 'Un de vos raids est déjà en route vers cette ville';
  }
  return null;
}

async function launchCityMission(army, targetCity, mission) {
  const travelTime = mission === 'SPY' ? await spyTravelTo(army, targetCity.x, targetCity.y) : await travelTo(army, targetCity.x, targetCity.y);
  const arrivalAt = new Date(Date.now() + travelTime * 1000);
  const status = { ATTACK: 'ATTACKING', RAID: 'RAIDING', SPY: 'SPYING' }[mission];
  const ok = await transition(prisma, 'army', army.id, 'IDLE', { status, targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, departedAt: new Date(), missionType: mission });
  return ok ? { travelTime, arrivalAt } : null;
}

// Moves units between an army standing in its city and that city's garrison. Both rows move by
// increments guarded by their current count, so a batch of recruits or a healed group landing at the
// same moment is never overwritten by a stale absolute value.
async function transferUnits(tx, army, garrison, unitKey, newCount, currentInArmy, currentInGarrison) {
  const delta = newCount - currentInArmy;
  if (delta === 0) return 0;
  const tier = unitsData.find(u => u.key === unitKey)?.tier || 'base';
  const from = delta > 0 ? garrison : army, to = delta > 0 ? army : garrison, n = Math.abs(delta);
  const taken = await tx.armyUnit.updateMany({ where: { armyId: from.id, unitKey, count: { gte: n } }, data: { count: { decrement: n } } });
  if (taken.count !== 1) throw Object.assign(new Error('units changed'), { code: 'UNITS_CHANGED' });
  await tx.armyUnit.upsert({ where: { armyId_unitKey: { armyId: to.id, unitKey } }, update: { count: { increment: n } }, create: { armyId: to.id, unitKey, tier, count: n } });
  await tx.armyUnit.deleteMany({ where: { armyId: { in: [army.id, garrison.id] }, unitKey, count: { lte: 0 } } });
  return delta;
}

// Both rows are locked through the city: every unit transfer of a city is serialized
async function loadArmyAndGarrison(tx, armyId, playerId) {
  const probe = await tx.army.findFirst({ where: { id: armyId, ownerId: playerId }, select: { cityId: true } });
  if (!probe?.cityId) return { error: 'Armée non trouvée', status: 404 };
  await lockCity(tx, probe.cityId);
  const army = await loadArmy(armyId, playerId, { city: true }, tx);
  if (!army) return { error: 'Armée non trouvée', status: 404 };
  if (army.isGarrison) return { error: 'Impossible de modifier la garnison directement', status: 400 };
  if (army.status !== 'IDLE' || !isHome(army, army.city)) return { error: 'Armée doit être en ville', status: 400 };
  const garrison = await tx.army.findFirst({ where: { cityId: army.cityId, isGarrison: true }, include: { units: true } });
  if (!garrison) return { error: 'Garnison introuvable', status: 404 };
  return { army, garrison };
}

// ========== ENDPOINTS ==========

// POST /api/army/create
router.post('/create', auth, async (req, res) => {
  try {
    const { cityId, slot } = req.body;
    if (!isId(cityId) || !Number.isInteger(slot) || slot < 1) return res.status(400).json({ error: 'cityId et slot requis' });
    const name = req.body.name === undefined || req.body.name === '' ? `Armée ${slot}` : cleanText(req.body.name, 2, 30);
    if (!name) return res.status(400).json({ error: 'Nom invalide (2-30 caractères)' });
    const result = await prisma.$transaction(async (tx) => {
      await lockCity(tx, cityId);
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, include: { buildings: true } });
      if (!city) return { error: 'Ville non trouvée', status: 404 };
      const maxArmies = fx.maxArmies(city.buildings);
      if (slot > maxArmies) return { error: `Emplacement ${slot} non débloqué : Place de rassemblement niveau ${fx.rallyLevelForArmies(slot)} requise.`, status: 400 };
      const existingArmy = await tx.army.findFirst({ where: { cityId, slot, isGarrison: false } });
      if (existingArmy) return { error: `Slot ${slot} déjà occupé`, status: 400 };
      const army = await tx.army.create({ data: { ownerId: req.user.playerId, cityId, slot, name, x: city.x, y: city.y, status: 'IDLE', isGarrison: false } });
      return { message: 'Armée créée', army };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// PATCH|POST /api/army/:id/rename
async function renameArmy(req, res) {
  try {
    const name = cleanText(req.body.name, 2, 30);
    if (!name) return res.status(400).json({ error: 'Nom invalide (2-30 caractères)' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId } });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    await prisma.army.update({ where: { id: army.id }, data: { name } });
    res.json({ message: 'Armée renommée', name });
  } catch (e) { sendError(res, e); }
}
router.patch('/:id/rename', auth, renameArmy);
router.post('/:id/rename', auth, renameArmy);

// POST /api/army/:id/assign-hero
router.post('/:id/assign-hero', auth, async (req, res) => {
  try {
    const army = await loadArmy(req.params.id, req.user.playerId, { city: true });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE' || !isHome(army, army.city)) return res.status(400).json({ error: 'Armée doit être en ville' });
    const hero = await prisma.hero.findFirst({ where: { playerId: req.user.playerId } });
    if (!hero) return res.status(404).json({ error: 'Héros non trouvé' });
    const armyWithHero = await prisma.army.findFirst({ where: { heroId: hero.id, NOT: { id: army.id } }, include: { city: true } });
    if (armyWithHero) {
      // The hero can only switch between armies standing in the same city
      if (armyWithHero.status !== 'IDLE' || armyWithHero.cityId !== army.cityId || !isHome(armyWithHero, armyWithHero.city)) {
        return res.status(400).json({ error: 'Héros déjà assigné à une autre armée hors de la ville' });
      }
    }
    await prisma.$transaction([
      ...(armyWithHero ? [prisma.army.update({ where: { id: armyWithHero.id }, data: { heroId: null } })] : []),
      prisma.army.update({ where: { id: army.id }, data: { heroId: hero.id } })
    ]);
    res.json({ message: 'Héros assigné' });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Héros déjà assigné, réessayez' });
    sendError(res, e);
  }
});

// POST /api/army/:id/unassign-hero
router.post('/:id/unassign-hero', auth, async (req, res) => {
  try {
    const army = await loadArmy(req.params.id, req.user.playerId, { city: true });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE' || !isHome(army, army.city)) return res.status(400).json({ error: 'Armée doit être en ville' });
    if (!army.heroId) return res.json({ message: 'Aucun héros assigné' });
    // A hero leaving a field army goes back to the garrison of the same city
    const garrison = army.isGarrison ? null : await prisma.army.findFirst({ where: { cityId: army.cityId, isGarrison: true } });
    await prisma.$transaction([
      prisma.army.update({ where: { id: army.id }, data: { heroId: null } }),
      ...(garrison && !garrison.heroId ? [prisma.army.update({ where: { id: garrison.id }, data: { heroId: army.heroId } })] : [])
    ]);
    res.json({ message: 'Héros retiré' });
  } catch (e) { sendError(res, e); }
});

// POST /api/army/:id/adjust-unit (delta-based, used by frontend)
router.post('/:id/adjust-unit', auth, async (req, res) => {
  try {
    const { unitKey, delta } = req.body;
    if (!isId(unitKey) || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > config.limits.maxAmount) return res.status(400).json({ error: 'unitKey et delta (entier non nul) requis' });

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadArmyAndGarrison(tx, req.params.id, req.user.playerId);
      if (loaded.error) return loaded;
      const { army, garrison } = loaded;
      const currentInArmy = army.units.find(u => u.unitKey === unitKey)?.count || 0;
      const currentInGarrison = garrison.units.find(u => u.unitKey === unitKey)?.count || 0;
      if (delta > 0 && delta > currentInGarrison) return { error: 'Pas assez d\'unites en garnison', status: 400 };
      if (delta < 0 && -delta > currentInArmy) return { error: 'Pas assez d\'unites dans l\'armee', status: 400 };
      const newCount = currentInArmy + delta;
      await transferUnits(tx, army, garrison, unitKey, newCount, currentInArmy, currentInGarrison);
      return { message: 'Composition mise a jour', newCount };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.code === 'UNITS_CHANGED') return res.status(409).json({ error: 'Les effectifs ont changé, réessayez' });
    sendError(res, e);
  }
});

// POST /api/army/:id/set-unit (absolute count, clamped to what the garrison can provide)
router.post('/:id/set-unit', auth, async (req, res) => {
  try {
    const { unitKey, count } = req.body;
    if (!isId(unitKey) || !isAmount(count)) return res.status(400).json({ error: 'unitKey et count (entier positif) requis' });

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadArmyAndGarrison(tx, req.params.id, req.user.playerId);
      if (loaded.error) return loaded;
      const { army, garrison } = loaded;
      const currentInArmy = army.units.find(u => u.unitKey === unitKey)?.count || 0;
      const currentInGarrison = garrison.units.find(u => u.unitKey === unitKey)?.count || 0;
      const newCount = Math.min(count, currentInArmy + currentInGarrison);
      if (newCount === currentInArmy) return { message: 'Aucun changement', newCount };
      const delta = await transferUnits(tx, army, garrison, unitKey, newCount, currentInArmy, currentInGarrison);
      return { message: 'Composition mise à jour', delta, newCount, clamped: newCount !== count };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.code === 'UNITS_CHANGED') return res.status(409).json({ error: 'Les effectifs ont changé, réessayez' });
    sendError(res, e);
  }
});

// DELETE /api/army/:id/disband
router.delete('/:id/disband', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadArmyAndGarrison(tx, req.params.id, req.user.playerId);
      if (loaded.error) return loaded;
      const { army, garrison } = loaded;
      for (const unit of army.units) {
        await tx.armyUnit.upsert({
          where: { armyId_unitKey: { armyId: garrison.id, unitKey: unit.unitKey } },
          update: { count: { increment: unit.count } },
          create: { armyId: garrison.id, unitKey: unit.unitKey, tier: unit.tier, count: unit.count }
        });
      }
      const heroId = army.heroId;
      await tx.armyUnit.deleteMany({ where: { armyId: army.id } });
      await tx.army.delete({ where: { id: army.id } });
      if (heroId && !garrison.heroId) await tx.army.update({ where: { id: garrison.id }, data: { heroId } });
      return { message: 'Armée dissoute' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// POST /api/army/:id/move
router.post('/:id/move', auth, async (req, res) => {
  try {
    const x = parseInt(req.body.x), y = parseInt(req.body.y);
    if (!validateCoordinates(x, y)) return res.status(400).json({ error: 'Coordonnées invalides' });
    const army = await loadArmy(req.params.id, req.user.playerId);
    const err = readyToLeave(army, 'se déplacer');
    if (err) return res.status(err.status).json({ error: err.error });
    const travelTime = await travelTo(army, x, y);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    if (!(await transition(prisma, 'army', army.id, 'IDLE', { status: 'MOVING', targetX: x, targetY: y, arrivalAt, departedAt: new Date(), missionType: 'MOVE' }))) return res.status(409).json({ error: 'Armée déjà en mission' });
    res.json({ message: 'Armee en mouvement', travelTime, arrivalAt });
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// POST /api/army/:id/attack | /raid | /spy
function cityMissionRoute(mission, messages) {
  return async (req, res) => {
    try {
      const { targetCityId } = req.body;
      if (!isId(targetCityId)) return res.status(400).json({ error: 'Cible requise' });
      const army = await loadArmy(req.params.id, req.user.playerId);
      const err = readyToLeave(army, messages.verb);
      if (err) return res.status(err.status).json({ error: err.error });
      const targetCity = await prisma.city.findUnique({ where: { id: targetCityId }, include: { buildings: true } });
      if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
      const refusal = await checkHostileTarget(army, targetCity, mission);
      if (refusal) return res.status(400).json({ error: refusal });
      const launched = await launchCityMission(army, targetCity, mission);
      if (!launched) return res.status(409).json({ error: 'Armée déjà en mission' });
      res.json({ message: messages.ok, ...launched, target: targetCity.name });
    } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
  };
}
router.post('/:id/attack', auth, cityMissionRoute('ATTACK', { verb: 'attaquer', ok: 'Attaque lancee' }));
router.post('/:id/raid', auth, cityMissionRoute('RAID', { verb: 'piller', ok: 'Raid lance' }));
router.post('/:id/spy', auth, cityMissionRoute('SPY', { verb: 'espionner', ok: 'Espionnage lancé' }));

// POST /api/army/:id/raid-resource
router.post('/:id/raid-resource', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body;
    if (!isId(resourceNodeId)) return res.status(400).json({ error: 'ID de ressource requis' });
    const army = await loadArmy(req.params.id, req.user.playerId, { hero: { include: { items: true } }, city: true });
    const err = readyToLeave(army, 'attaquer');
    if (err) return res.status(err.status).json({ error: err.error });
    const node = await prisma.resourceNode.findUnique({ where: { id: resourceNodeId } });
    if (!node) return res.status(404).json({ error: 'Ressource non trouvée' });
    if (node.cityId) return res.status(400).json({ error: 'Une ville occupe ce point' });
    // A raid is a fight: against the tribe, or against the army of another player holding the node (as on a Travian
    // oasis). An undefended, free node is simply collected; an ally's or one's own army is never attacked.
    const holders = node.hasPlayerArmy ? await prisma.army.findMany({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: node.id }, select: { ownerId: true } }) : [];
    const tribePresent = node.hasDefenders && node.defenderPower > 0;
    if (!tribePresent && !holders.length) return res.status(400).json({ error: 'Aucune tribu ni armée adverse sur ce point : lancez une collecte' });
    if (holders.some(h => h.ownerId === req.user.playerId)) return res.status(409).json({ error: 'Votre armée récolte déjà ce point' });
    for (const ownerId of new Set(holders.map(h => h.ownerId))) {
      const relation = await getRelation(req.user.playerId, ownerId);
      if (!relation.canAttack) return res.status(403).json({ error: relation.status === 'SAME_ALLIANCE' ? 'Ce point est tenu par votre alliance : lancez une collecte' : 'Impossible d\'attaquer une armée alliée' });
    }
    const distance = Math.sqrt(Math.pow(node.x - army.x, 2) + Math.pow(node.y - army.y, 2));
    if (distance <= 1.5) {
      // Adjacent: the fight is resolved now, under the army row lock so it cannot be resolved twice
      const result = await prisma.$transaction(async (tx) => {
        await lockArmy(tx, army.id);
        const fresh = await loadArmy(army.id, req.user.playerId, {}, tx);
        if (!fresh || fresh.status !== 'IDLE' || fresh.units.length === 0) return { error: 'Armée déjà en mission', status: 409 };
        const freshNode = await tx.$queryRaw`SELECT * FROM "ResourceNode" WHERE id = ${node.id} FOR UPDATE`.then(r => r[0]);
        if (!freshNode) return { error: 'Ressource non trouvée', status: 404 };
        if (!freshNode.hasDefenders && !freshNode.hasPlayerArmy) return { error: 'Ce point a changé entre-temps, rafraîchissez la carte', status: 409 };
        const r = freshNode.hasDefenders ? await resolveTribeCombat(fresh, freshNode, req.user.playerId, tx) : await resolveNodeHolderCombat(fresh, freshNode, req.user.playerId, tx);
        if (r.success) {
          if (await claimNode(tx, node.id, { playerId: req.user.playerId, allianceId: fresh.owner?.alliance?.allianceId || null })) {
            await tx.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, targetX: node.x, targetY: node.y, targetResourceId: node.id, missionType: 'HARVEST', harvestResourceType: node.resourceType } });
            r.message = 'Tribu vaincue! Récolte démarrée (100/min)';
            r.status = 'HARVESTING';
          } else {
            r.message = 'Tribu vaincue, mais le point est déjà occupé';
          }
        }
        return r;
      }, { timeout: 15000 });
      if (result.error) return res.status(result.status || 400).json(result);
      return res.json(result);
    }
    const travelTime = await travelTo(army, node.x, node.y);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    if (!(await transition(prisma, 'army', army.id, 'IDLE', { status: 'RAIDING', targetX: node.x, targetY: node.y, targetResourceId: node.id, arrivalAt, departedAt: new Date(), missionType: 'RAID_RESOURCE' }))) return res.status(409).json({ error: 'Armée déjà en mission' });
    res.json({ message: 'Armée en route', travelTime, arrivalAt, target: `${node.resourceType} (${node.x}, ${node.y})` });
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// POST /api/army/:id/found-city { resourceNodeId, name? } — send an army with a settler and the foundation resources
// (GDD: 3 000 of each) from the capital to a free resource node; the city rises 24 h after the army arrives.
router.post('/:id/found-city', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body || {};
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 40) : '';
    if (!isId(resourceNodeId)) return res.status(400).json({ error: 'ID de ressource requis' });
    const result = await prisma.$transaction(async (tx) => {
      await lockArmy(tx, req.params.id);
      const army = await loadArmy(req.params.id, req.user.playerId, { hero: { include: { items: true } }, city: true }, tx);
      const err = readyToLeave(army, 'fonder une ville');
      if (err) return { error: err.error, status: err.status };
      if (!army.city || !army.city.isCapital) return { error: 'Seule une armée de la capitale peut fonder une ville', status: 400 };
      if (!isHome(army, army.city)) return { error: 'L\'armée doit être dans la capitale', status: 400 };
      await lockCity(tx, army.city.id);
      const capital = await tx.city.findUnique({ where: { id: army.city.id }, include: { buildings: true } });
      const residence = capital.buildings.find(b => b.key === 'RESIDENCE');
      const slots = Math.min(config.city.maxSecondaryCities, fx.settlerSlots(residence?.level || 0));
      const colonies = await tx.city.count({ where: { playerId: req.user.playerId, isCapital: false } });
      if (colonies >= slots) return { error: slots ? `Limite atteinte : ${slots} ville(s) secondaire(s) avec cette Résidence` : 'Résidence niveau 10 requise', status: 400 };
      if (capital.settlers < 1) return { error: 'Aucun colon disponible : formez-en un à la Résidence', status: 400 };
      const node = await tx.resourceNode.findUnique({ where: { id: resourceNodeId } });
      if (!node) return { error: 'Ressource non trouvée', status: 404 };
      if (node.cityId) return { error: 'Une ville occupe déjà ce point', status: 400 };
      if (node.resourceType === 'GOLD') return { error: 'Impossible de fonder une ville sur un gisement d\'or', status: 400 };
      if (node.hasDefenders && node.defenderPower > 0) return { error: 'Tribu encore présente : chassez-la d\'abord', status: 400 };
      if (node.hasPlayerArmy) return { error: 'Une armée occupe ce point', status: 409 };
      const cost = config.city.foundationTransport;
      if (!(await debitCity(tx, capital.id, cost))) return { error: `Il faut ${cost.wood} de chaque ressource dans la capitale pour fonder une ville`, status: 400, cost };
      await tx.city.update({ where: { id: capital.id }, data: { settlers: { decrement: 1 } } });
      const travelTime = await travelTo(army, node.x, node.y);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      const ok = await transition(tx, 'army', army.id, 'IDLE', {
        status: 'MOVING', missionType: 'FOUND', targetX: node.x, targetY: node.y, targetResourceId: node.id, arrivalAt, departedAt: new Date(), settlers: 1,
        carryWood: { increment: cost.wood }, carryStone: { increment: cost.stone }, carryIron: { increment: cost.iron }, carryFood: { increment: cost.food },
        harvestResourceType: name || null   // the chosen name travels with the army (reused field, freed at arrival)
      });
      if (!ok) throw new Error('army busy');
      return { message: `Colon en route : la ville sera fondée ${Math.round(fx.cityFoundationTimeSec() / 3600)} h après l'arrivée`, travelTime, arrivalAt, foundationTimeSec: fx.cityFoundationTimeSec() };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// POST /api/army/:id/collect-resource
router.post('/:id/collect-resource', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body;
    if (!isId(resourceNodeId)) return res.status(400).json({ error: 'ID de ressource requis' });

    const result = await prisma.$transaction(async (tx) => {
      await lockArmy(tx, req.params.id);
      const army = await loadArmy(req.params.id, req.user.playerId, {}, tx);
      const err = readyToLeave(army, 'collecter');
      if (err) return { error: err.error, status: err.status };
      const node = await tx.resourceNode.findUnique({ where: { id: resourceNodeId } });
      if (!node) return { error: 'Ressource non trouvée', status: 404 };
      if (node.cityId) return { error: 'Une ville occupe ce point', status: 400 };
      if (node.hasDefenders && node.defenderPower > 0) return { error: 'Tribu encore présente - attaquez d\'abord!', status: 400 };
      if (node.hasPlayerArmy) {
        // Shared with one's own or allied armies only
        const holders = await tx.army.findMany({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: node.id }, select: { ownerId: true, status: true, owner: { select: { alliance: { select: { allianceId: true } } } } } });
        if (holders.some(h => h.status === 'FOUNDING')) return { error: 'Une ville est en cours de fondation sur ce point', status: 409 };
        const mine = army.owner?.alliance?.allianceId || null;
        if (holders.length && !holders.every(h => h.ownerId === req.user.playerId || (mine && h.owner?.alliance?.allianceId === mine))) return { error: 'Une armée adverse récolte déjà ce point : attaquez-la', status: 409 };
      }
      const distance = Math.sqrt(Math.pow(node.x - army.x, 2) + Math.pow(node.y - army.y, 2));
      if (distance > 1.5) {
        const travelTime = await travelTo(army, node.x, node.y);
        const arrivalAt = new Date(Date.now() + travelTime * 1000);
        await tx.army.update({ where: { id: army.id }, data: { status: 'MOVING', targetX: node.x, targetY: node.y, targetResourceId: node.id, arrivalAt, departedAt: new Date(), missionType: 'MOVE_TO_HARVEST', harvestResourceType: node.resourceType } });
        return { message: 'Armée en route pour collecter', travelTime, arrivalAt };
      }
      const carryCapacity = getArmyCarryCapacity(army.units, unitsData, army.hero);
      // The node is taken conditionally: free, or already held by one's own or allied armies (shared harvest)
      if (!(await claimNode(tx, node.id, { playerId: req.user.playerId, allianceId: army.owner?.alliance?.allianceId || null }))) return { error: 'Une armée adverse récolte déjà ce point : attaquez-la', status: 409 };
      await tx.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, targetX: node.x, targetY: node.y, targetResourceId: node.id, missionType: 'HARVEST', harvestResourceType: node.resourceType } });
      return { success: true, status: 'HARVESTING', resourceType: node.resourceType, nodeAmount: node.amount, carryCapacity, harvestRate: 100, message: `Récolte démarrée! (100 ${node.resourceType}/min, capacité: ${carryCapacity})` };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// POST /api/army/:id/return — also recalls an army that is still on its way
router.post('/:id/return', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockArmy(tx, req.params.id);
      const army = await loadArmy(req.params.id, req.user.playerId, { city: true }, tx);
      if (!army) return { error: 'Armee non trouvee', status: 404 };
      if (!army.city) return { error: 'Armee sans ville d\'origine', status: 400 };
      if (army.status === 'RETURNING') return { message: 'Armée déjà sur le chemin du retour', arrivalAt: army.arrivalAt };
      if (army.status === 'EXPEDITION') return { error: 'Armée en expédition : impossible de la rappeler', status: 400 };
      if (army.claimedAt) return { error: 'Arrivée en cours de résolution, réessayez dans quelques secondes', status: 409 };

      let fromX = army.x, fromY = army.y;
      if (OUTBOUND.includes(army.status) && army.arrivalAt && army.targetX !== null && army.targetY !== null) {
        // Position is only written on arrival: find where the army is on its route right now
        const total = army.departedAt ? (new Date(army.arrivalAt).getTime() - new Date(army.departedAt).getTime()) / 1000 : 0;
        const remaining = Math.max(0, (new Date(army.arrivalAt).getTime() - Date.now()) / 1000);
        const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 1;
        const route = await findRoute(army.x, army.y, army.targetX, army.targetY);
        const at = route ? pointAlongPath(route.path, progress) : { x: army.x + (army.targetX - army.x) * progress, y: army.y + (army.targetY - army.y) * progress };
        fromX = Math.round(at.x); fromY = Math.round(at.y);
      } else if (army.status === 'IDLE' && isHome(army, army.city)) {
        return { message: 'Armee deja a la maison' };
      }
      if ((army.status === 'HARVESTING' || army.status === 'FOUNDING') && army.targetResourceId) {
        // Shared node: released only when this is the last harvesting army on it (a recalled foundation is abandoned)
        const others = await tx.army.count({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: army.targetResourceId, id: { not: army.id } } });
        if (others === 0) await tx.resourceNode.updateMany({ where: { id: army.targetResourceId }, data: { hasPlayerArmy: false, lastArmyDeparture: new Date() } });
      }

      const travelTime = getArmyTravelTime(army.units, fromX, fromY, army.city.x, army.city.y, army.owner.faction, army.hero, await routeLength(fromX, fromY, army.city.x, army.city.y).catch(() => null), speedTechPct(army));
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      await tx.army.update({ where: { id: army.id }, data: {
        status: 'RETURNING', x: Math.round(fromX), y: Math.round(fromY), targetX: army.city.x, targetY: army.city.y, targetCityId: null,
        arrivalAt, departedAt: new Date(), missionType: 'RETURN', targetResourceId: null, harvestResourceType: null
      } });
      return { message: 'Retour en cours', travelTime, arrivalAt };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// POST /api/army/:id/transport
router.post('/:id/transport', auth, async (req, res) => {
  try {
    const { targetCityId, wood = 0, stone = 0, iron = 0, food = 0 } = req.body;
    if (!isId(targetCityId)) return res.status(400).json({ error: 'Ville cible requise' });
    if (![wood, stone, iron, food].every(isAmount)) return res.status(400).json({ error: 'Montants invalides' });
    if (wood + stone + iron + food <= 0) return res.status(400).json({ error: 'Entrez des ressources a envoyer' });
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId } });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
    const relation = await getRelation(req.user.playerId, targetCity.playerId);
    if (!relation.canTransport) return res.status(403).json({ error: 'Impossible d\'envoyer des ressources à un ennemi' });

    const result = await prisma.$transaction(async (tx) => {
      const probe = await tx.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, select: { cityId: true } });
      if (!probe?.cityId) return { error: 'Armée non trouvée', status: 404 };
      await lockCity(tx, probe.cityId);
      const army = await loadArmy(req.params.id, req.user.playerId, { city: true }, tx);
      const err = readyToLeave(army, 'transporter');
      if (err) return { error: err.error, status: err.status };
      if (!army.city) return { error: 'Armée sans ville d\'origine', status: 400 };
      if (!isHome(army, army.city)) return { error: 'Armée doit être en ville pour charger des ressources', status: 400 };
      if (config.market.requireBuilding && !(await tx.cityBuilding.findFirst({ where: { cityId: army.city.id, key: 'MARKET', level: { gte: 1 } }, select: { id: true } }))) return { error: 'Construisez un Marché (niveau 1 minimum) pour envoyer des ressources', status: 400 };
      const cityBuildings = await tx.cityBuilding.findMany({ where: { cityId: army.city.id }, select: { key: true, level: true } });
      const transportMultiplier = (1 + getFactionBonus(army.owner.faction, 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(cityBuildings) / 100);
      const carryCapacity = Math.floor(getArmyCarryCapacity(army.units, unitsData, army.hero) * transportMultiplier);
      if (wood + stone + iron + food > carryCapacity) return { error: `Capacité insuffisante (max ${carryCapacity})`, status: 400 };
      if (!(await debitCity(tx, army.city.id, { wood, stone, iron, food }))) return { error: 'Ressources insuffisantes', status: 400 };
      const travelTime = await travelTo(army, targetCity.x, targetCity.y);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      if (!(await transition(tx, 'army', army.id, 'IDLE', { status: 'TRANSPORTING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, departedAt: new Date(), missionType: 'TRANSPORT', carryWood: wood, carryStone: stone, carryIron: iron, carryFood: food }))) throw new Error('army busy');
      return { message: `Transport lancé vers ${targetCity.name}`, travelTime, arrivalAt, resources: { wood, stone, iron, food } };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.message === 'army busy') return res.status(409).json({ error: 'Armée déjà en mission' });
    if (noRoute(res, e)) return;
    sendError(res, e);
  }
});

// POST /api/armies/send (dispatch endpoint)
router.post('/send', auth, async (req, res) => {
  try {
    const { armyId, targetX, targetY, mission } = req.body;
    if (!isId(armyId)) return res.status(400).json({ error: 'Armee requise' });
    const parsedX = parseInt(targetX), parsedY = parseInt(targetY);
    if (!validateCoordinates(parsedX, parsedY)) return res.status(400).json({ error: 'Coordonnées invalides' });
    const army = await loadArmy(armyId, req.user.playerId);
    const err = readyToLeave(army, 'partir');
    if (err) return res.status(err.status).json({ error: err.error });
    if (mission === 'ATTACK' || mission === 'RAID' || mission === 'SPY') {
      const targetCity = await prisma.city.findFirst({ where: { x: parsedX, y: parsedY }, include: { buildings: true } });
      if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });
      const refusal = await checkHostileTarget(army, targetCity, mission);
      if (refusal) return res.status(400).json({ error: refusal });
      const launched = await launchCityMission(army, targetCity, mission);
      if (!launched) return res.status(409).json({ error: 'Armée déjà en mission' });
      if (mission !== 'SPY') {
        const minutes = Math.max(1, Math.round(launched.travelTime / 60));
        notify(targetCity.playerId, 'attack_incoming', '⚔️ Attaque en approche', `${army.owner?.name || 'Un joueur'} marche sur ${targetCity.name} (arrivée dans ${minutes} min)`, { tab: 'city', cityId: targetCity.id });
      }
      const label = { ATTACK: 'Attaque lancée', RAID: 'Raid lancé', SPY: 'Espionnage lancé' }[mission];
      return res.json({ message: `${label} vers ${targetCity.name}`, target: targetCity.name, ...launched });
    }
    if (await isBlockedTile(parsedX, parsedY)) return res.status(400).json({ error: 'Une armée ne peut pas se rendre sur une montagne ou dans l\'eau' });
    const travelTime = await travelTo(army, parsedX, parsedY);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    if (!(await transition(prisma, 'army', army.id, 'IDLE', { status: 'MOVING', targetX: parsedX, targetY: parsedY, arrivalAt, departedAt: new Date(), missionType: 'MOVE' }))) return res.status(409).json({ error: 'Armée déjà en mission' });
    res.json({ message: `Armee en mouvement vers (${parsedX}, ${parsedY})`, travelTime, arrivalAt });
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// GET /api/army/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true, city: true, hero: { include: { items: true } } } });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    res.json({ ...army, power: calculateArmyPower(army.units, unitsData) });
  } catch (e) { sendError(res, e); }
});

// GET /api/armies
router.get('/', auth, async (req, res) => {
  try {
    const armies = await prisma.army.findMany({ where: { ownerId: req.user.playerId }, include: { units: true, city: true, hero: { include: { items: true } } } });
    res.json(armies.map(a => ({ ...a, power: calculateArmyPower(a.units, unitsData) })));
  } catch (e) { sendError(res, e); }
});

module.exports = router;
