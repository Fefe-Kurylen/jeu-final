const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { unitsData } = require('../config/gamedata');
const { factionsData } = require('../config/gamedata');
const { validateCoordinates } = require('../utils/validation');
const { calculateTravelTime, calculateArmyPower, getCityTier, getCityTierName, getMinSiegeEngines, countSiegeEngines, getArmyMinSpeed, getArmyCarryCapacity, getFactionBonus } = require('../utils/calculations');
const { resolveCombat } = require('../services/combatService');

// ========== HELPER: Tribe Combat ==========
async function resolveTribteCombat(army, node, playerId) {
  const defenderUnits = [];
  if (node.defenderUnits && node.hasDefenders) {
    const legacyMapping = { warrior: 'GRE_INF_HOPLITE', archer: 'GRE_ARC_TOXOTE', cavalry: 'GRE_CAV_GREC', elite: 'GRE_INF_SPARTIATE' };
    for (const [unitKey, count] of Object.entries(node.defenderUnits)) {
      if (count > 0) {
        const isLegacyKey = ['warrior', 'archer', 'cavalry', 'elite'].includes(unitKey);
        defenderUnits.push({ unitKey: isLegacyKey ? legacyMapping[unitKey] : unitKey, count });
      }
    }
  }

  if (defenderUnits.length === 0 || !node.hasDefenders) {
    return { success: true, combatResult: { winner: 'attacker', attackerLosses: 0, defenderLosses: 0 }, loot: null, message: 'Tribu absente - démarrage de la récolte' };
  }

  const attackerHero = army.hero ? { attack: army.hero.attack || 0, defense: army.hero.defense || 0 } : null;
  const combat = resolveCombat(army.units.map(u => ({ unitKey: u.unitKey, count: u.count })), defenderUnits, 0, attackerHero, null);

  let totalAttackerLosses = 0;
  for (const unit of army.units) {
    const losses = Math.floor(unit.count * combat.attackerLossRate);
    totalAttackerLosses += losses;
    const newCount = unit.count - losses;
    if (newCount <= 0) { await prisma.armyUnit.delete({ where: { id: unit.id } }); }
    else { await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } }); }
  }

  let totalDefenderLosses = 0;
  const newDefenderUnits = {};
  for (const [unitType, count] of Object.entries(node.defenderUnits)) {
    const losses = Math.floor(count * combat.defenderLossRate);
    totalDefenderLosses += losses;
    newDefenderUnits[unitType] = Math.max(0, count - losses);
  }

  if (combat.attackerWon) {
    await prisma.resourceNode.update({ where: { id: node.id }, data: { hasDefenders: false, defenderUnits: newDefenderUnits, defenderPower: 0, lastDefeat: new Date() } });
    if (army.heroId) { await prisma.hero.update({ where: { id: army.heroId }, data: { xp: { increment: Math.floor(node.defenderPower * 0.5) } } }); }
  } else {
    await prisma.resourceNode.update({ where: { id: node.id }, data: { defenderUnits: newDefenderUnits, defenderPower: Math.floor(node.defenderPower * (1 - combat.defenderLossRate)) } });
  }

  await prisma.battleReport.create({
    data: { playerId, attackerId: playerId, x: node.x, y: node.y, result: combat.attackerWon ? 'WIN' : 'LOSE', winner: combat.attackerWon ? 'ATTACKER' : 'DEFENDER', attackerLosses: { totalAttackerLosses }, defenderLosses: { totalDefenderLosses }, loot: {}, rounds: { type: 'TRIBE_RAID', resourceType: node.resourceType } }
  });

  return { success: combat.attackerWon, combatResult: { winner: combat.attackerWon ? 'attacker' : 'defender', attackerLosses: totalAttackerLosses, defenderLosses: totalDefenderLosses, attackerPower: combat.attackerPower, defenderPower: combat.defenderPower }, loot: null, message: combat.attackerWon ? 'Tribu vaincue! Démarrage de la récolte.' : 'Votre armée a été repoussée' };
}

async function collectResourceLoot(army, node, playerId) {
  const armyWithUnits = await prisma.army.findUnique({ where: { id: army.id }, include: { units: true } });
  const carryCapacity = getArmyCarryCapacity(armyWithUnits.units, unitsData);
  const lootAmount = Math.min(carryCapacity, node.amount);
  if (lootAmount <= 0) return {};
  await prisma.resourceNode.update({ where: { id: node.id }, data: { amount: { decrement: lootAmount } } });
  const city = await prisma.city.findFirst({ where: { playerId, isCapital: true } });
  if (city) {
    const resourceField = node.resourceType.toLowerCase();
    await prisma.city.update({ where: { id: city.id }, data: { [resourceField]: { increment: lootAmount } } });
  }
  return { [node.resourceType]: lootAmount };
}

// ========== ENDPOINTS ==========

// POST /api/army/create
router.post('/create', auth, async (req, res) => {
  try {
    const { cityId, slot, name } = req.body;
    if (!cityId || !slot) return res.status(400).json({ error: 'cityId et slot requis' });
    const city = await prisma.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, include: { buildings: true } });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });
    const rallyPoint = city.buildings.find(b => b.key === 'RALLY_POINT');
    const rallyLevel = rallyPoint?.level || 0;
    let maxArmies = 0;
    if (rallyLevel >= 10) maxArmies = 3;
    else if (rallyLevel >= 5) maxArmies = 2;
    else if (rallyLevel >= 1) maxArmies = 1;
    if (slot > maxArmies) return res.status(400).json({ error: `Slot ${slot} non débloqué. Rally Point Niv.${slot === 2 ? 5 : 10} requis.` });
    const existingArmy = await prisma.army.findFirst({ where: { cityId, slot, isGarrison: false } });
    if (existingArmy) return res.status(400).json({ error: `Slot ${slot} déjà occupé` });
    const army = await prisma.army.create({ data: { ownerId: req.user.playerId, cityId, slot, name: name || `Armée ${slot}`, x: city.x, y: city.y, status: 'IDLE', isGarrison: false } });
    res.json({ message: 'Armée créée', army });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/army/:id/rename
router.patch('/:id/rename', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId } });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    await prisma.army.update({ where: { id: army.id }, data: { name } });
    res.json({ message: 'Armée renommée' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/assign-hero
router.post('/:id/assign-hero', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId } });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée doit être en ville' });
    const hero = await prisma.hero.findFirst({ where: { playerId: req.user.playerId } });
    if (!hero) return res.status(404).json({ error: 'Héros non trouvé' });
    const armyWithHero = await prisma.army.findFirst({ where: { heroId: hero.id, NOT: { id: army.id } } });
    if (armyWithHero) return res.status(400).json({ error: 'Héros déjà assigné à une autre armée' });
    await prisma.army.update({ where: { id: army.id }, data: { heroId: hero.id } });
    res.json({ message: 'Héros assigné' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/unassign-hero
router.post('/:id/unassign-hero', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId } });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée doit être en ville' });
    await prisma.army.update({ where: { id: army.id }, data: { heroId: null } });
    res.json({ message: 'Héros retiré' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/set-unit
router.post('/:id/set-unit', auth, async (req, res) => {
  try {
    const { unitKey, count } = req.body;
    if (!unitKey || count === undefined) return res.status(400).json({ error: 'unitKey et count requis' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée doit être en ville' });
    const garrison = await prisma.army.findFirst({ where: { cityId: army.cityId, isGarrison: true }, include: { units: true } });
    const currentInArmy = army.units.find(u => u.unitKey === unitKey)?.count || 0;
    const currentInGarrison = garrison?.units?.find(u => u.unitKey === unitKey)?.count || 0;
    const totalAvailable = currentInArmy + currentInGarrison;
    const newCount = Math.max(0, Math.min(count, totalAvailable));
    const delta = newCount - currentInArmy;
    if (delta === 0) return res.json({ message: 'Aucun changement' });
    const unitInfo = unitsData.find(u => u.key === unitKey);
    const tier = unitInfo?.tier || 'base';
    if (newCount > 0) {
      await prisma.armyUnit.upsert({ where: { armyId_unitKey: { armyId: army.id, unitKey } }, update: { count: newCount }, create: { armyId: army.id, unitKey, tier, count: newCount } });
    } else {
      await prisma.armyUnit.deleteMany({ where: { armyId: army.id, unitKey } });
    }
    if (garrison) {
      const newGarrisonCount = currentInGarrison - delta;
      if (newGarrisonCount > 0) {
        await prisma.armyUnit.upsert({ where: { armyId_unitKey: { armyId: garrison.id, unitKey } }, update: { count: newGarrisonCount }, create: { armyId: garrison.id, unitKey, tier, count: newGarrisonCount } });
      } else {
        await prisma.armyUnit.deleteMany({ where: { armyId: garrison.id, unitKey } });
      }
    }
    res.json({ message: 'Composition mise à jour', delta, newCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/army/:id/disband
router.delete('/:id/disband', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée doit être en ville' });
    if (army.isGarrison) return res.status(400).json({ error: 'Impossible de dissoudre la garnison' });
    let garrison = await prisma.army.findFirst({ where: { cityId: army.cityId, isGarrison: true }, include: { units: true } });
    if (!garrison) {
      const city = await prisma.city.findUnique({ where: { id: army.cityId } });
      garrison = await prisma.army.create({ data: { ownerId: req.user.playerId, cityId: army.cityId, name: 'Garnison', x: city.x, y: city.y, status: 'IDLE', isGarrison: true }, include: { units: true } });
    }
    for (const unit of army.units) {
      const garrisonUnit = garrison.units?.find(u => u.unitKey === unit.unitKey);
      if (garrisonUnit) { await prisma.armyUnit.update({ where: { id: garrisonUnit.id }, data: { count: garrisonUnit.count + unit.count } }); }
      else { await prisma.armyUnit.create({ data: { armyId: garrison.id, unitKey: unit.unitKey, tier: unit.tier, count: unit.count } }); }
    }
    await prisma.armyUnit.deleteMany({ where: { armyId: army.id } });
    await prisma.army.delete({ where: { id: army.id } });
    res.json({ message: 'Armée dissoute' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/move
router.post('/:id/move', auth, async (req, res) => {
  try {
    const { x, y } = req.body;
    if (x === undefined || y === undefined) return res.status(400).json({ error: 'Destination requise' });
    if (!validateCoordinates(parseInt(x), parseInt(y))) return res.status(400).json({ error: 'Coordonnées invalides' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armee deja en mouvement' });
    if (army.units.length === 0) return res.status(400).json({ error: army.heroId ? 'Le héros nécessite au moins 1 soldat pour se déplacer' : 'Armee vide' });
    const minSpeed = getArmyMinSpeed(army.units, unitsData);
    const travelTime = calculateTravelTime(army.x, army.y, x, y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'MOVING', targetX: x, targetY: y, arrivalAt, missionType: 'MOVE' } });
    res.json({ message: 'Armee en mouvement', travelTime, arrivalAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/attack
router.post('/:id/attack', auth, async (req, res) => {
  try {
    const { targetCityId } = req.body;
    if (!targetCityId) return res.status(400).json({ error: 'Cible requise' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armee deja en mission' });
    if (army.units.length === 0) return res.status(400).json({ error: army.heroId ? 'Le héros nécessite au moins 1 soldat pour attaquer' : 'Armee vide' });
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId }, include: { buildings: true } });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvee' });
    if (targetCity.playerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas attaquer vos propres villes' });
    const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
    const cityTier = getCityTier(wallLevel);
    const minSiegeRequired = getMinSiegeEngines(cityTier);
    const siegeCount = countSiegeEngines(army.units, unitsData);
    if (siegeCount < minSiegeRequired) {
      return res.status(400).json({ error: `Pour assiéger une ${getCityTierName(cityTier)}, il faut minimum ${minSiegeRequired} engin(s) de siège. Vous en avez ${siegeCount}.` });
    }
    const minSpeed = getArmyMinSpeed(army.units, unitsData);
    const travelTime = calculateTravelTime(army.x, army.y, targetCity.x, targetCity.y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'ATTACKING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, missionType: 'ATTACK' } });
    res.json({ message: 'Attaque lancee', travelTime, arrivalAt, target: targetCity.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/raid
router.post('/:id/raid', auth, async (req, res) => {
  try {
    const { targetCityId } = req.body;
    if (!targetCityId) return res.status(400).json({ error: 'Cible requise' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armee deja en mission' });
    if (army.units.length === 0) return res.status(400).json({ error: army.heroId ? 'Le héros nécessite au moins 1 soldat pour piller' : 'Armee vide' });
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId } });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvee' });
    if (targetCity.playerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas piller vos propres villes' });
    const minSpeed = getArmyMinSpeed(army.units, unitsData);
    const travelTime = calculateTravelTime(army.x, army.y, targetCity.x, targetCity.y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'RAIDING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, missionType: 'RAID' } });
    res.json({ message: 'Raid lance', travelTime, arrivalAt, target: targetCity.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/raid-resource
router.post('/:id/raid-resource', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body;
    if (!resourceNodeId) return res.status(400).json({ error: 'ID de ressource requis' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true, hero: true, city: true } });
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
      const result = await resolveTribteCombat(army, node, req.user.playerId);
      if (result.success) {
        await prisma.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, targetX: node.x, targetY: node.y, targetResourceId: node.id, missionType: 'HARVEST', harvestStartedAt: new Date(), harvestResourceType: node.resourceType } });
        result.message = 'Tribu vaincue! Récolte démarrée (100/min)';
        result.status = 'HARVESTING';
      }
      return res.json(result);
    }
    const minSpeed = getArmyMinSpeed(army.units, unitsData);
    const travelTime = calculateTravelTime(army.x, army.y, node.x, node.y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'RAIDING', targetX: node.x, targetY: node.y, targetResourceId: node.id, arrivalAt, missionType: 'RAID_RESOURCE' } });
    res.json({ message: 'Armée en route', travelTime, arrivalAt, target: `${node.resourceType} (${node.x}, ${node.y})` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/collect-resource
router.post('/:id/collect-resource', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body;
    if (!resourceNodeId) return res.status(400).json({ error: 'ID de ressource requis' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée déjà en mission' });
    const node = await prisma.resourceNode.findUnique({ where: { id: resourceNodeId } });
    if (!node) return res.status(404).json({ error: 'Ressource non trouvée' });
    if (node.hasDefenders && node.defenderPower > 0) return res.status(400).json({ error: 'Tribu encore présente - attaquez d\'abord!' });
    const distance = Math.sqrt(Math.pow(node.x - army.x, 2) + Math.pow(node.y - army.y, 2));
    if (distance > 1.5) {
      const minSpeed = getArmyMinSpeed(army.units, unitsData);
      const travelTime = calculateTravelTime(army.x, army.y, node.x, node.y, minSpeed);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      await prisma.army.update({ where: { id: army.id }, data: { status: 'MOVING', targetX: node.x, targetY: node.y, targetResourceId: node.id, arrivalAt, missionType: 'MOVE_TO_HARVEST', harvestResourceType: node.resourceType } });
      return res.json({ message: 'Armée en route pour collecter', travelTime, arrivalAt });
    }
    const carryCapacity = getArmyCarryCapacity(army.units, unitsData);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, targetX: node.x, targetY: node.y, targetResourceId: node.id, missionType: 'HARVEST', harvestStartedAt: new Date(), harvestResourceType: node.resourceType } });
    res.json({ success: true, status: 'HARVESTING', resourceType: node.resourceType, nodeAmount: node.amount, carryCapacity, harvestRate: 100, message: `Récolte démarrée! (100 ${node.resourceType}/min, capacité: ${carryCapacity})` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/return
router.post('/:id/return', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true, city: true } });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (!army.city) return res.status(400).json({ error: 'Armee sans ville d\'origine' });
    if (army.x === army.city.x && army.y === army.city.y) return res.json({ message: 'Armee deja a la maison' });
    const minSpeed = getArmyMinSpeed(army.units, unitsData);
    const travelTime = calculateTravelTime(army.x, army.y, army.city.x, army.city.y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: army.city.x, targetY: army.city.y, arrivalAt, missionType: 'RETURN', targetResourceId: null, harvestStartedAt: null, harvestResourceType: null } });
    res.json({ message: 'Retour en cours', travelTime, arrivalAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/spy
router.post('/:id/spy', auth, async (req, res) => {
  try {
    const { targetCityId } = req.body;
    if (!targetCityId) return res.status(400).json({ error: 'Cible requise' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée déjà en mission' });
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId }, include: { player: true } });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
    if (targetCity.playerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas espionner vos propres villes' });
    const travelTime = calculateTravelTime(army.x, army.y, targetCity.x, targetCity.y, 80);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'SPYING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, missionType: 'SPY' } });
    res.json({ message: 'Espionnage lancé', travelTime, arrivalAt, target: targetCity.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/transport
router.post('/:id/transport', auth, async (req, res) => {
  try {
    const { targetCityId, wood, stone, iron, food } = req.body;
    if (!targetCityId) return res.status(400).json({ error: 'Ville cible requise' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true, city: true } });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée déjà en mission' });
    if (!army.city) return res.status(400).json({ error: 'Armée sans ville d\'origine' });
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId }, include: { player: true } });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
    // Check diplomacy
    const targetPlayerId = targetCity.playerId;
    if (targetPlayerId !== req.user.playerId) {
      const [myMember, targetMember] = await Promise.all([
        prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } }),
        prisma.allianceMember.findUnique({ where: { playerId: targetPlayerId } })
      ]);
      if (!(myMember && targetMember && myMember.allianceId === targetMember.allianceId)) {
        if (myMember && targetMember) {
          const diplomacy = await prisma.allianceDiplomacy.findFirst({ where: { OR: [{ allianceId: myMember.allianceId, targetAllianceId: targetMember.allianceId }, { allianceId: targetMember.allianceId, targetAllianceId: myMember.allianceId }] } });
          if (diplomacy && diplomacy.status === 'ENEMY') return res.status(403).json({ error: 'Impossible d\'envoyer des ressources à un ennemi' });
        }
      }
    }
    const player = await prisma.player.findUnique({ where: { id: req.user.playerId } });
    const transportBonus = getFactionBonus(player?.faction, 'transportCapacity', factionsData);
    const transportMultiplier = 1 + (transportBonus / 100);
    const baseCarryCapacity = army.units.reduce((sum, u) => { const unitDef = unitsData.find(ud => ud.key === u.unitKey); return sum + (unitDef?.stats?.transport || 50) * u.count; }, 0);
    const carryCapacity = Math.floor(baseCarryCapacity * transportMultiplier);
    const totalToSend = (wood || 0) + (stone || 0) + (iron || 0) + (food || 0);
    if (totalToSend > carryCapacity) return res.status(400).json({ error: `Capacité insuffisante (max ${carryCapacity})`, carryCapacity });
    const sourceCity = army.city;
    if (sourceCity.wood < wood || sourceCity.stone < stone || sourceCity.iron < iron || sourceCity.food < food) return res.status(400).json({ error: 'Ressources insuffisantes' });
    await prisma.city.update({ where: { id: sourceCity.id }, data: { wood: sourceCity.wood - (wood || 0), stone: sourceCity.stone - (stone || 0), iron: sourceCity.iron - (iron || 0), food: sourceCity.food - (food || 0) } });
    const minSpeed = getArmyMinSpeed(army.units, unitsData);
    const travelTime = calculateTravelTime(army.x, army.y, targetCity.x, targetCity.y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'TRANSPORTING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, missionType: 'TRANSPORT', carryWood: wood || 0, carryStone: stone || 0, carryIron: iron || 0, carryFood: food || 0 } });
    res.json({ message: `Transport lancé vers ${targetCity.name}`, travelTime, arrivalAt, resources: { wood: wood || 0, stone: stone || 0, iron: iron || 0, food: food || 0 } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/armies/send (dispatch endpoint)
router.post('/send', auth, async (req, res) => {
  try {
    const { armyId, targetX, targetY, mission } = req.body;
    if (!armyId) return res.status(400).json({ error: 'Armee requise' });
    if (targetX === undefined || targetY === undefined) return res.status(400).json({ error: 'Destination requise' });
    const army = await prisma.army.findFirst({ where: { id: armyId, ownerId: req.user.playerId }, include: { units: true } });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armee deja en mission' });
    if (!army.units.length) return res.status(400).json({ error: 'Armee vide' });
    const targetCity = await prisma.city.findFirst({ where: { x: parseInt(targetX), y: parseInt(targetY) } });
    const minSpeed = getArmyMinSpeed(army.units, unitsData);
    const travelTime = calculateTravelTime(army.x, army.y, parseInt(targetX), parseInt(targetY), minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    if (mission === 'ATTACK' || mission === 'RAID') {
      if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });
      if (targetCity.playerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas attaquer vos propres villes' });
      const missionType = mission; const status = mission === 'ATTACK' ? 'ATTACKING' : 'RAIDING';
      await prisma.army.update({ where: { id: army.id }, data: { status, targetX: parseInt(targetX), targetY: parseInt(targetY), targetCityId: targetCity.id, arrivalAt, missionType } });
      res.json({ message: `${mission} lance vers ${targetCity.name}`, target: targetCity.name });
    } else if (mission === 'SPY') {
      if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });
      await prisma.army.update({ where: { id: army.id }, data: { status: 'SPYING', targetX: parseInt(targetX), targetY: parseInt(targetY), targetCityId: targetCity.id, arrivalAt, missionType: 'SPY' } });
      res.json({ message: `Espionnage lance vers ${targetCity.name}`, target: targetCity.name });
    } else {
      await prisma.army.update({ where: { id: army.id }, data: { status: 'MOVING', targetX: parseInt(targetX), targetY: parseInt(targetY), arrivalAt, missionType: 'MOVE' } });
      res.json({ message: `Armee en mouvement vers (${targetX}, ${targetY})` });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/army/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true, city: true, hero: true } });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    const power = calculateArmyPower(army.units, unitsData);
    res.json({ ...army, power });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/armies
router.get('/', auth, async (req, res) => {
  try {
    const armies = await prisma.army.findMany({ where: { ownerId: req.user.playerId }, include: { units: true, city: true, hero: true } });
    const armiesWithPower = armies.map(a => ({ ...a, power: calculateArmyPower(a.units, unitsData) }));
    res.json(armiesWithPower);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Export helpers for use in tick processor
router.resolveTribteCombat = resolveTribteCombat;
router.collectResourceLoot = collectResourceLoot;

module.exports = router;
