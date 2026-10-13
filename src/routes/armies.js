const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { unitsData, factionsData } = require('../config/gamedata');
const { validateCoordinates, cleanText } = require('../utils/validation');
const { calculateTravelTime, calculateArmyPower, getCityTier, getCityTierName, getMinSiegeEngines, countSiegeEngines, getArmyTravelTime, getArmyCarryCapacity, getFactionBonus } = require('../utils/calculations');
const { resolveTribeCombat } = require('../services/armyService');
const { getRelation } = require('../services/diplomacyService');

const OUTBOUND = ['MOVING', 'ATTACKING', 'RAIDING', 'SPYING', 'TRANSPORTING'];
const SPY_SPEED = 80;

const loadArmy = (id, playerId, include = {}, db = prisma) =>
  db.army.findFirst({ where: { id, ownerId: playerId }, include: { units: true, owner: true, ...include } });

const travelTo = (army, toX, toY) => getArmyTravelTime(army.units, army.x, army.y, toX, toY, army.owner?.faction);
const spyTravelTo = (army, toX, toY) => calculateTravelTime(army.x, army.y, toX, toY, SPY_SPEED, army.owner?.faction, factionsData);
const isHome = (army, city) => !!city && army.x === city.x && army.y === city.y;

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
  return null;
}

async function launchCityMission(army, targetCity, mission) {
  const travelTime = mission === 'SPY' ? spyTravelTo(army, targetCity.x, targetCity.y) : travelTo(army, targetCity.x, targetCity.y);
  const arrivalAt = new Date(Date.now() + travelTime * 1000);
  const status = { ATTACK: 'ATTACKING', RAID: 'RAIDING', SPY: 'SPYING' }[mission];
  await prisma.army.update({ where: { id: army.id }, data: { status, targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, missionType: mission } });
  return { travelTime, arrivalAt };
}

// Moves units between an army standing in its city and that city's garrison
async function transferUnits(tx, army, garrison, unitKey, newCount, currentInArmy, currentInGarrison) {
  const delta = newCount - currentInArmy;
  const tier = unitsData.find(u => u.key === unitKey)?.tier || 'base';
  if (newCount > 0) {
    await tx.armyUnit.upsert({ where: { armyId_unitKey: { armyId: army.id, unitKey } }, update: { count: newCount }, create: { armyId: army.id, unitKey, tier, count: newCount } });
  } else {
    await tx.armyUnit.deleteMany({ where: { armyId: army.id, unitKey } });
  }
  const newGarrisonCount = currentInGarrison - delta;
  if (newGarrisonCount > 0) {
    await tx.armyUnit.upsert({ where: { armyId_unitKey: { armyId: garrison.id, unitKey } }, update: { count: newGarrisonCount }, create: { armyId: garrison.id, unitKey, tier, count: newGarrisonCount } });
  } else {
    await tx.armyUnit.deleteMany({ where: { armyId: garrison.id, unitKey } });
  }
  return delta;
}

async function loadArmyAndGarrison(tx, armyId, playerId) {
  const army = await loadArmy(armyId, playerId, { city: true }, tx);
  if (!army) return { error: 'Armée non trouvée', status: 404 };
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
    if (!cityId || !Number.isInteger(slot) || slot < 1) return res.status(400).json({ error: 'cityId et slot requis' });
    const name = req.body.name === undefined || req.body.name === '' ? `Armée ${slot}` : cleanText(req.body.name, 2, 30);
    if (!name) return res.status(400).json({ error: 'Nom invalide (2-30 caractères)' });
    const city = await prisma.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, include: { buildings: true } });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });
    const rallyLevel = city.buildings.find(b => b.key === 'RALLY_POINT')?.level || 0;
    const maxArmies = rallyLevel >= 10 ? 3 : rallyLevel >= 5 ? 2 : rallyLevel >= 1 ? 1 : 0;
    if (slot > maxArmies) return res.status(400).json({ error: `Slot ${slot} non débloqué. Rally Point Niv.${slot === 1 ? 1 : slot === 2 ? 5 : 10} requis.` });
    const existingArmy = await prisma.army.findFirst({ where: { cityId, slot, isGarrison: false } });
    if (existingArmy) return res.status(400).json({ error: `Slot ${slot} déjà occupé` });
    const army = await prisma.army.create({ data: { ownerId: req.user.playerId, cityId, slot, name, x: city.x, y: city.y, status: 'IDLE', isGarrison: false } });
    res.json({ message: 'Armée créée', army });
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
  } catch (e) { sendError(res, e); }
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
    if (!unitKey || !Number.isInteger(delta) || delta === 0) return res.status(400).json({ error: 'unitKey et delta (entier non nul) requis' });

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadArmyAndGarrison(tx, req.params.id, req.user.playerId);
      if (loaded.error) return loaded;
      const { army, garrison } = loaded;
      if (army.isGarrison) return { error: 'Impossible de modifier la garnison directement', status: 400 };
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
  } catch (e) { sendError(res, e); }
});

// POST /api/army/:id/set-unit (absolute count, clamped to what the garrison can provide)
router.post('/:id/set-unit', auth, async (req, res) => {
  try {
    const { unitKey, count } = req.body;
    if (!unitKey || !Number.isInteger(count) || count < 0) return res.status(400).json({ error: 'unitKey et count (entier positif) requis' });

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadArmyAndGarrison(tx, req.params.id, req.user.playerId);
      if (loaded.error) return loaded;
      const { army, garrison } = loaded;
      if (army.isGarrison) return { error: 'Impossible de modifier la garnison directement', status: 400 };
      const currentInArmy = army.units.find(u => u.unitKey === unitKey)?.count || 0;
      const currentInGarrison = garrison.units.find(u => u.unitKey === unitKey)?.count || 0;
      const newCount = Math.min(count, currentInArmy + currentInGarrison);
      if (newCount === currentInArmy) return { message: 'Aucun changement', newCount };
      const delta = await transferUnits(tx, army, garrison, unitKey, newCount, currentInArmy, currentInGarrison);
      return { message: 'Composition mise à jour', delta, newCount, clamped: newCount !== count };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// DELETE /api/army/:id/disband
router.delete('/:id/disband', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const army = await loadArmy(req.params.id, req.user.playerId, { city: true }, tx);
      if (!army) return { error: 'Armée non trouvée', status: 404 };
      if (army.isGarrison) return { error: 'Impossible de dissoudre la garnison', status: 400 };
      if (army.status !== 'IDLE' || !isHome(army, army.city)) return { error: 'Armée doit être en ville', status: 400 };
      let garrison = await tx.army.findFirst({ where: { cityId: army.cityId, isGarrison: true } });
      if (!garrison) {
        garrison = await tx.army.create({ data: { ownerId: req.user.playerId, cityId: army.cityId, name: 'Garnison', x: army.city.x, y: army.city.y, status: 'IDLE', isGarrison: true } });
      }
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
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armee deja en mouvement' });
    if (army.units.length === 0) return res.status(400).json({ error: army.heroId ? 'Le héros nécessite au moins 1 soldat pour se déplacer' : 'Armee vide' });
    const travelTime = travelTo(army, x, y);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'MOVING', targetX: x, targetY: y, arrivalAt, missionType: 'MOVE' } });
    res.json({ message: 'Armee en mouvement', travelTime, arrivalAt });
  } catch (e) { sendError(res, e); }
});

// POST /api/army/:id/attack | /raid | /spy
function cityMissionRoute(mission, messages) {
  return async (req, res) => {
    try {
      const { targetCityId } = req.body;
      if (!targetCityId) return res.status(400).json({ error: 'Cible requise' });
      const army = await loadArmy(req.params.id, req.user.playerId);
      if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
      if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée déjà en mission' });
      if (army.units.length === 0) return res.status(400).json({ error: army.heroId ? `Le héros nécessite au moins 1 soldat pour ${messages.verb}` : 'Armée vide' });
      const targetCity = await prisma.city.findUnique({ where: { id: targetCityId }, include: { buildings: true } });
      if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
      const err = await checkHostileTarget(army, targetCity, mission);
      if (err) return res.status(400).json({ error: err });
      const { travelTime, arrivalAt } = await launchCityMission(army, targetCity, mission);
      res.json({ message: messages.ok, travelTime, arrivalAt, target: targetCity.name });
    } catch (e) { sendError(res, e); }
  };
}
router.post('/:id/attack', auth, cityMissionRoute('ATTACK', { verb: 'attaquer', ok: 'Attaque lancee' }));
router.post('/:id/raid', auth, cityMissionRoute('RAID', { verb: 'piller', ok: 'Raid lance' }));
router.post('/:id/spy', auth, cityMissionRoute('SPY', { verb: 'espionner', ok: 'Espionnage lancé' }));

// POST /api/army/:id/raid-resource
router.post('/:id/raid-resource', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body;
    if (!resourceNodeId) return res.status(400).json({ error: 'ID de ressource requis' });
    const army = await loadArmy(req.params.id, req.user.playerId, { hero: true, city: true });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée déjà en mission' });
    if (army.units.length === 0) return res.status(400).json({ error: 'Armée vide' });
    const node = await prisma.resourceNode.findUnique({ where: { id: resourceNodeId } });
    if (!node) return res.status(404).json({ error: 'Ressource non trouvée' });
    if (node.lastDefeat) {
      const respawnTime = new Date(node.lastDefeat.getTime() + node.respawnMinutes * 60000);
      if (new Date() < respawnTime && !node.hasDefenders) return res.status(400).json({ error: 'Tribu en respawn - collectez directement' });
    }
    const distance = Math.sqrt(Math.pow(node.x - army.x, 2) + Math.pow(node.y - army.y, 2));
    if (distance <= 1.5) {
      const result = await resolveTribeCombat(army, node, req.user.playerId);
      if (result.success) {
        await prisma.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, targetX: node.x, targetY: node.y, targetResourceId: node.id, missionType: 'HARVEST', harvestStartedAt: new Date(), harvestResourceType: node.resourceType } });
        await prisma.resourceNode.update({ where: { id: node.id }, data: { hasPlayerArmy: true } });
        result.message = 'Tribu vaincue! Récolte démarrée (100/min)';
        result.status = 'HARVESTING';
      }
      return res.json(result);
    }
    const travelTime = travelTo(army, node.x, node.y);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'RAIDING', targetX: node.x, targetY: node.y, targetResourceId: node.id, arrivalAt, missionType: 'RAID_RESOURCE' } });
    res.json({ message: 'Armée en route', travelTime, arrivalAt, target: `${node.resourceType} (${node.x}, ${node.y})` });
  } catch (e) { sendError(res, e); }
});

// POST /api/army/:id/collect-resource
router.post('/:id/collect-resource', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body;
    if (!resourceNodeId) return res.status(400).json({ error: 'ID de ressource requis' });

    const result = await prisma.$transaction(async (tx) => {
      const army = await loadArmy(req.params.id, req.user.playerId, {}, tx);
      if (!army) return { error: 'Armée non trouvée', status: 404 };
      if (army.status !== 'IDLE') return { error: 'Armée déjà en mission', status: 400 };
      if (army.units.length === 0) return { error: 'Armée vide', status: 400 };
      const node = await tx.resourceNode.findUnique({ where: { id: resourceNodeId } });
      if (!node) return { error: 'Ressource non trouvée', status: 404 };
      if (node.hasDefenders && node.defenderPower > 0) return { error: 'Tribu encore présente - attaquez d\'abord!', status: 400 };
      if (node.hasPlayerArmy) return { error: 'Une armée récolte déjà ce point', status: 400 };
      const distance = Math.sqrt(Math.pow(node.x - army.x, 2) + Math.pow(node.y - army.y, 2));
      if (distance > 1.5) {
        const travelTime = travelTo(army, node.x, node.y);
        const arrivalAt = new Date(Date.now() + travelTime * 1000);
        await tx.army.update({ where: { id: army.id }, data: { status: 'MOVING', targetX: node.x, targetY: node.y, targetResourceId: node.id, arrivalAt, missionType: 'MOVE_TO_HARVEST', harvestResourceType: node.resourceType } });
        return { message: 'Armée en route pour collecter', travelTime, arrivalAt };
      }
      const carryCapacity = getArmyCarryCapacity(army.units, unitsData);
      await tx.resourceNode.update({ where: { id: node.id }, data: { hasPlayerArmy: true } });
      await tx.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, targetX: node.x, targetY: node.y, targetResourceId: node.id, missionType: 'HARVEST', harvestStartedAt: new Date(), harvestResourceType: node.resourceType } });
      return { success: true, status: 'HARVESTING', resourceType: node.resourceType, nodeAmount: node.amount, carryCapacity, harvestRate: 100, message: `Récolte démarrée! (100 ${node.resourceType}/min, capacité: ${carryCapacity})` };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// POST /api/army/:id/return — also recalls an army that is still on its way
router.post('/:id/return', auth, async (req, res) => {
  try {
    const army = await loadArmy(req.params.id, req.user.playerId, { city: true });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (!army.city) return res.status(400).json({ error: 'Armee sans ville d\'origine' });
    if (army.status === 'RETURNING') return res.status(400).json({ error: 'Armée déjà sur le chemin du retour' });
    if (army.status === 'EXPEDITION') return res.status(400).json({ error: 'Armée en expédition : impossible de la rappeler' });

    let fromX = army.x, fromY = army.y;
    if (OUTBOUND.includes(army.status) && army.arrivalAt && army.targetX !== null && army.targetY !== null) {
      // Position is only written on arrival: interpolate where the army is on its route right now
      const total = army.status === 'SPYING' ? spyTravelTo(army, army.targetX, army.targetY) : travelTo(army, army.targetX, army.targetY);
      const remaining = Math.max(0, (new Date(army.arrivalAt).getTime() - Date.now()) / 1000);
      const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 1;
      fromX = army.x + (army.targetX - army.x) * progress;
      fromY = army.y + (army.targetY - army.y) * progress;
    } else if (army.status === 'IDLE' && isHome(army, army.city)) {
      return res.json({ message: 'Armee deja a la maison' });
    }

    const travelTime = getArmyTravelTime(army.units, fromX, fromY, army.city.x, army.city.y, army.owner.faction);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: {
      status: 'RETURNING', x: Math.round(fromX), y: Math.round(fromY), targetX: army.city.x, targetY: army.city.y, targetCityId: null,
      arrivalAt, missionType: 'RETURN', targetResourceId: null, harvestStartedAt: null, harvestResourceType: null
    } });
    res.json({ message: 'Retour en cours', travelTime, arrivalAt });
  } catch (e) { sendError(res, e); }
});

// POST /api/army/:id/transport
router.post('/:id/transport', auth, async (req, res) => {
  try {
    const { targetCityId, wood = 0, stone = 0, iron = 0, food = 0 } = req.body;
    if (!targetCityId) return res.status(400).json({ error: 'Ville cible requise' });
    if (![wood, stone, iron, food].every(v => Number.isInteger(v) && v >= 0)) return res.status(400).json({ error: 'Montants invalides' });
    if (wood + stone + iron + food <= 0) return res.status(400).json({ error: 'Entrez des ressources a envoyer' });
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId } });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
    const relation = await getRelation(req.user.playerId, targetCity.playerId);
    if (!relation.canTransport) return res.status(403).json({ error: 'Impossible d\'envoyer des ressources à un ennemi' });

    const result = await prisma.$transaction(async (tx) => {
      const army = await loadArmy(req.params.id, req.user.playerId, { city: true }, tx);
      if (!army) return { error: 'Armée non trouvée', status: 404 };
      if (army.status !== 'IDLE') return { error: 'Armée déjà en mission', status: 400 };
      if (!army.city) return { error: 'Armée sans ville d\'origine', status: 400 };
      if (!isHome(army, army.city)) return { error: 'Armée doit être en ville pour charger des ressources', status: 400 };
      if (army.units.length === 0) return { error: 'Armée vide', status: 400 };
      const transportMultiplier = 1 + (getFactionBonus(army.owner.faction, 'transportCapacity', factionsData) / 100);
      const carryCapacity = Math.floor(getArmyCarryCapacity(army.units, unitsData) * transportMultiplier);
      if (wood + stone + iron + food > carryCapacity) return { error: `Capacité insuffisante (max ${carryCapacity})`, status: 400 };
      const sourceCity = army.city;
      if (sourceCity.wood < wood || sourceCity.stone < stone || sourceCity.iron < iron || sourceCity.food < food) return { error: 'Ressources insuffisantes', status: 400 };
      await tx.city.update({ where: { id: sourceCity.id }, data: { wood: { decrement: wood }, stone: { decrement: stone }, iron: { decrement: iron }, food: { decrement: food } } });
      const travelTime = travelTo(army, targetCity.x, targetCity.y);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      await tx.army.update({ where: { id: army.id }, data: { status: 'TRANSPORTING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, missionType: 'TRANSPORT', carryWood: wood, carryStone: stone, carryIron: iron, carryFood: food } });
      return { message: `Transport lancé vers ${targetCity.name}`, travelTime, arrivalAt, resources: { wood, stone, iron, food } };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// POST /api/armies/send (dispatch endpoint)
router.post('/send', auth, async (req, res) => {
  try {
    const { armyId, targetX, targetY, mission } = req.body;
    if (!armyId) return res.status(400).json({ error: 'Armee requise' });
    const parsedX = parseInt(targetX), parsedY = parseInt(targetY);
    if (!validateCoordinates(parsedX, parsedY)) return res.status(400).json({ error: 'Coordonnées invalides' });
    const army = await loadArmy(armyId, req.user.playerId);
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armee deja en mission' });
    if (!army.units.length) return res.status(400).json({ error: 'Armee vide' });
    if (mission === 'ATTACK' || mission === 'RAID' || mission === 'SPY') {
      const targetCity = await prisma.city.findFirst({ where: { x: parsedX, y: parsedY }, include: { buildings: true } });
      if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });
      const err = await checkHostileTarget(army, targetCity, mission);
      if (err) return res.status(400).json({ error: err });
      const { travelTime, arrivalAt } = await launchCityMission(army, targetCity, mission);
      const label = { ATTACK: 'Attaque lancée', RAID: 'Raid lancé', SPY: 'Espionnage lancé' }[mission];
      return res.json({ message: `${label} vers ${targetCity.name}`, target: targetCity.name, travelTime, arrivalAt });
    }
    const travelTime = travelTo(army, parsedX, parsedY);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'MOVING', targetX: parsedX, targetY: parsedY, arrivalAt, missionType: 'MOVE' } });
    res.json({ message: `Armee en mouvement vers (${parsedX}, ${parsedY})`, travelTime, arrivalAt });
  } catch (e) { sendError(res, e); }
});

// GET /api/army/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true, city: true, hero: true } });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    res.json({ ...army, power: calculateArmyPower(army.units, unitsData) });
  } catch (e) { sendError(res, e); }
});

// GET /api/armies
router.get('/', auth, async (req, res) => {
  try {
    const armies = await prisma.army.findMany({ where: { ownerId: req.user.playerId }, include: { units: true, city: true, hero: true } });
    res.json(armies.map(a => ({ ...a, power: calculateArmyPower(a.units, unitsData) })));
  } catch (e) { sendError(res, e); }
});

module.exports = router;
