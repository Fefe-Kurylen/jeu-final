const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { unitsData } = require('../config/gamedata');
const { factionsData } = require('../config/gamedata');
const { validateCoordinates } = require('../utils/validation');
const { calculateTravelTime, calculateArmyPower, getCityTier, getCityTierName, getMinSiegeEngines, countSiegeEngines, getArmyMinSpeed, getArmyCarryCapacity, getFactionBonus } = require('../utils/calculations');
const { resolveTribeCombat, collectResourceLoot } = require('../services/armyService');

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

// POST /api/army/:id/adjust-unit (delta-based, used by frontend)
router.post('/:id/adjust-unit', auth, async (req, res) => {
  try {
    const { unitKey, delta } = req.body;
    if (!unitKey || delta === undefined || delta === 0) return res.status(400).json({ error: 'unitKey et delta requis' });
    if (!Number.isInteger(delta)) return res.status(400).json({ error: 'Delta doit être un entier' });

    const result = await prisma.$transaction(async (tx) => {
      const army = await tx.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
      if (!army) return { error: 'Armee non trouvee', status: 404 };
      if (army.status !== 'IDLE') return { error: 'Armee doit etre en ville', status: 400 };
      const garrison = await tx.army.findFirst({ where: { cityId: army.cityId, isGarrison: true }, include: { units: true } });
      const currentInArmy = army.units.find(u => u.unitKey === unitKey)?.count || 0;
      const currentInGarrison = garrison?.units?.find(u => u.unitKey === unitKey)?.count || 0;
      const newCount = Math.max(0, currentInArmy + delta);
      if (delta > 0 && delta > currentInGarrison) return { error: 'Pas assez d\'unites en garnison', status: 400 };
      if (delta < 0 && Math.abs(delta) > currentInArmy) return { error: 'Pas assez d\'unites dans l\'armee', status: 400 };
      const unitInfo = unitsData.find(u => u.key === unitKey);
      const tier = unitInfo?.tier || 'base';
      if (newCount > 0) {
        await tx.armyUnit.upsert({ where: { armyId_unitKey: { armyId: army.id, unitKey } }, update: { count: newCount }, create: { armyId: army.id, unitKey, tier, count: newCount } });
      } else {
        await tx.armyUnit.deleteMany({ where: { armyId: army.id, unitKey } });
      }
      if (garrison) {
        const newGarrisonCount = currentInGarrison - delta;
        if (newGarrisonCount > 0) {
          await tx.armyUnit.upsert({ where: { armyId_unitKey: { armyId: garrison.id, unitKey } }, update: { count: newGarrisonCount }, create: { armyId: garrison.id, unitKey, tier, count: newGarrisonCount } });
        } else {
          await tx.armyUnit.deleteMany({ where: { armyId: garrison.id, unitKey } });
        }
      }
      return { message: 'Composition mise a jour', newCount };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/army/:id/set-unit
router.post('/:id/set-unit', auth, async (req, res) => {
  try {
    const { unitKey, count } = req.body;
    if (!unitKey || count === undefined) return res.status(400).json({ error: 'unitKey et count requis' });
    if (!Number.isInteger(count) || count < 0) return res.status(400).json({ error: 'count doit être un entier positif' });

    const result = await prisma.$transaction(async (tx) => {
      const army = await tx.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
      if (!army) return { error: 'Armée non trouvée', status: 404 };
      if (army.status !== 'IDLE') return { error: 'Armée doit être en ville', status: 400 };
      const garrison = await tx.army.findFirst({ where: { cityId: army.cityId, isGarrison: true }, include: { units: true } });
      const currentInArmy = army.units.find(u => u.unitKey === unitKey)?.count || 0;
      const currentInGarrison = garrison?.units?.find(u => u.unitKey === unitKey)?.count || 0;
      const totalAvailable = currentInArmy + currentInGarrison;
      const newCount = Math.max(0, Math.min(count, totalAvailable));
      const delta = newCount - currentInArmy;
      if (delta === 0) return { message: 'Aucun changement' };
      const unitInfo = unitsData.find(u => u.key === unitKey);
      const tier = unitInfo?.tier || 'base';
      if (newCount > 0) {
        await tx.armyUnit.upsert({ where: { armyId_unitKey: { armyId: army.id, unitKey } }, update: { count: newCount }, create: { armyId: army.id, unitKey, tier, count: newCount } });
      } else {
        await tx.armyUnit.deleteMany({ where: { armyId: army.id, unitKey } });
      }
      if (garrison) {
        const newGarrisonCount = currentInGarrison - delta;
        if (newGarrisonCount > 0) {
          await tx.armyUnit.upsert({ where: { armyId_unitKey: { armyId: garrison.id, unitKey } }, update: { count: newGarrisonCount }, create: { armyId: garrison.id, unitKey, tier, count: newGarrisonCount } });
        } else {
          await tx.armyUnit.deleteMany({ where: { armyId: garrison.id, unitKey } });
        }
      }
      return { message: 'Composition mise à jour', delta, newCount };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/army/:id/disband
router.delete('/:id/disband', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const army = await tx.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
      if (!army) return { error: 'Armée non trouvée', status: 404 };
      if (army.status !== 'IDLE') return { error: 'Armée doit être en ville', status: 400 };
      if (army.isGarrison) return { error: 'Impossible de dissoudre la garnison', status: 400 };
      let garrison = await tx.army.findFirst({ where: { cityId: army.cityId, isGarrison: true }, include: { units: true } });
      if (!garrison) {
        const city = await tx.city.findUnique({ where: { id: army.cityId } });
        if (!city) return { error: 'Ville non trouvée', status: 404 };
        garrison = await tx.army.create({ data: { ownerId: req.user.playerId, cityId: army.cityId, name: 'Garnison', x: city.x, y: city.y, status: 'IDLE', isGarrison: true } });
        garrison.units = [];
      }
      for (const unit of army.units) {
        const garrisonUnit = garrison.units?.find(u => u.unitKey === unit.unitKey);
        if (garrisonUnit) { await tx.armyUnit.update({ where: { id: garrisonUnit.id }, data: { count: garrisonUnit.count + unit.count } }); }
        else { await tx.armyUnit.create({ data: { armyId: garrison.id, unitKey: unit.unitKey, tier: unit.tier, count: unit.count } }); }
      }
      await tx.armyUnit.deleteMany({ where: { armyId: army.id } });
      await tx.army.delete({ where: { id: army.id } });
      return { message: 'Armée dissoute' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
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
      const result = await resolveTribeCombat(army, node, req.user.playerId);
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

    const result = await prisma.$transaction(async (tx) => {
      const army = await tx.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true } });
      if (!army) return { error: 'Armée non trouvée', status: 404 };
      if (army.status !== 'IDLE') return { error: 'Armée déjà en mission', status: 400 };
      const node = await tx.resourceNode.findUnique({ where: { id: resourceNodeId } });
      if (!node) return { error: 'Ressource non trouvée', status: 404 };
      if (node.hasDefenders && node.defenderPower > 0) return { error: 'Tribu encore présente - attaquez d\'abord!', status: 400 };
      if (node.hasPlayerArmy) return { error: 'Une armée récolte déjà ce point', status: 400 };
      const distance = Math.sqrt(Math.pow(node.x - army.x, 2) + Math.pow(node.y - army.y, 2));
      if (distance > 1.5) {
        const minSpeed = getArmyMinSpeed(army.units, unitsData);
        const travelTime = calculateTravelTime(army.x, army.y, node.x, node.y, minSpeed);
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
    const { targetCityId, wood = 0, stone = 0, iron = 0, food = 0 } = req.body;
    if (!targetCityId) return res.status(400).json({ error: 'Ville cible requise' });
    if (wood < 0 || stone < 0 || iron < 0 || food < 0) return res.status(400).json({ error: 'Montants invalides' });
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId }, include: { player: true } });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
    // Check diplomacy before transaction
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

    const result = await prisma.$transaction(async (tx) => {
      const army = await tx.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true, city: true } });
      if (!army) return { error: 'Armée non trouvée', status: 404 };
      if (army.status !== 'IDLE') return { error: 'Armée déjà en mission', status: 400 };
      if (!army.city) return { error: 'Armée sans ville d\'origine', status: 400 };
      const player = await tx.player.findUnique({ where: { id: req.user.playerId } });
      const transportBonus = getFactionBonus(player?.faction, 'transportCapacity', factionsData);
      const transportMultiplier = 1 + (transportBonus / 100);
      const baseCarryCapacity = army.units.reduce((sum, u) => { const unitDef = unitsData.find(ud => ud.key === u.unitKey); return sum + (unitDef?.stats?.transport || 50) * u.count; }, 0);
      const carryCapacity = Math.floor(baseCarryCapacity * transportMultiplier);
      const totalToSend = wood + stone + iron + food;
      if (totalToSend > carryCapacity) return { error: `Capacité insuffisante (max ${carryCapacity})`, status: 400 };
      const sourceCity = army.city;
      if (sourceCity.wood < wood || sourceCity.stone < stone || sourceCity.iron < iron || sourceCity.food < food) return { error: 'Ressources insuffisantes', status: 400 };
      await tx.city.update({ where: { id: sourceCity.id }, data: { wood: sourceCity.wood - wood, stone: sourceCity.stone - stone, iron: sourceCity.iron - iron, food: sourceCity.food - food } });
      const minSpeed = getArmyMinSpeed(army.units, unitsData);
      const travelTime = calculateTravelTime(army.x, army.y, targetCity.x, targetCity.y, minSpeed);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      await tx.army.update({ where: { id: army.id }, data: { status: 'TRANSPORTING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, missionType: 'TRANSPORT', carryWood: wood, carryStone: stone, carryIron: iron, carryFood: food } });
      return { message: `Transport lancé vers ${targetCity.name}`, travelTime, arrivalAt, resources: { wood, stone, iron, food } };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/armies/send (dispatch endpoint)
router.post('/send', auth, async (req, res) => {
  try {
    const { armyId, targetX, targetY, mission } = req.body;
    if (!armyId) return res.status(400).json({ error: 'Armee requise' });
    if (targetX === undefined || targetY === undefined) return res.status(400).json({ error: 'Destination requise' });
    const parsedX = parseInt(targetX), parsedY = parseInt(targetY);
    if (!validateCoordinates(parsedX, parsedY)) return res.status(400).json({ error: 'Coordonnées invalides' });
    const army = await prisma.army.findFirst({ where: { id: armyId, ownerId: req.user.playerId }, include: { units: true } });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armee deja en mission' });
    if (!army.units.length) return res.status(400).json({ error: 'Armee vide' });
    const targetCity = await prisma.city.findFirst({ where: { x: parsedX, y: parsedY } });
    const minSpeed = getArmyMinSpeed(army.units, unitsData);
    const travelTime = calculateTravelTime(army.x, army.y, parsedX, parsedY, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    if (mission === 'ATTACK' || mission === 'RAID') {
      if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });
      if (targetCity.playerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas attaquer vos propres villes' });
      const missionType = mission; const status = mission === 'ATTACK' ? 'ATTACKING' : 'RAIDING';
      await prisma.army.update({ where: { id: army.id }, data: { status, targetX: parsedX, targetY: parsedY, targetCityId: targetCity.id, arrivalAt, missionType } });
      res.json({ message: `${mission} lance vers ${targetCity.name}`, target: targetCity.name });
    } else if (mission === 'SPY') {
      if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });
      await prisma.army.update({ where: { id: army.id }, data: { status: 'SPYING', targetX: parsedX, targetY: parsedY, targetCityId: targetCity.id, arrivalAt, missionType: 'SPY' } });
      res.json({ message: `Espionnage lance vers ${targetCity.name}`, target: targetCity.name });
    } else {
      await prisma.army.update({ where: { id: army.id }, data: { status: 'MOVING', targetX: parsedX, targetY: parsedY, arrivalAt, missionType: 'MOVE' } });
      res.json({ message: `Armee en mouvement vers (${parsedX}, ${parsedY})` });
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

module.exports = router;
