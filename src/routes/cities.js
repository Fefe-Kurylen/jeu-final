const express = require('express');
const { isPremium } = require('../services/entitlementService');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { unitsData, buildingsData, factionsData } = require('../config/gamedata');
const { getCityTier, getCityTierName, getFactionBonus } = require('../utils/calculations');
const { lockCity, debitCity } = require('../utils/db');

const FIELD_KEYS = Object.keys(config.city.fieldSlots);
const RECRUIT_BUILDING = { INFANTRY: 'BARRACKS', ARCHER: 'BARRACKS', CAVALRY: 'STABLE', SIEGE: 'WORKSHOP' };

// Highest level among buildings of a key (fields like FARM exist on several slots).
// A city without a Main Hall counts as having it at level 1, as in the level cap rule below.
const maxBuildingLevel = (buildings, key) => buildings.reduce((m, b) => (b.key === key && b.level > m ? b.level : m), key === 'MAIN_HALL' ? 1 : 0);

// Slot a building may occupy: fields live on typed slots (101-118), the Main Hall in the centre (0),
// everything else on a free ring slot (1-19). Returns null when the request is invalid.
function resolveSlot(buildingKey, slot, existing, city) {
  if (existing) return existing.slot;
  if (FIELD_KEYS.includes(buildingKey)) return config.city.fieldSlots[buildingKey].includes(slot) ? slot : null;
  if (buildingKey === 'MAIN_HALL') return 0;
  const used = new Set(city.buildings.map(b => b.slot));
  city.buildQueue.forEach(q => used.add(q.slot));
  if (slot !== null) return slot >= 1 && slot <= config.city.maxSlot && !used.has(slot) ? slot : null;
  for (let s = 1; s <= config.city.maxSlot; s++) if (!used.has(s)) return s;
  return null;
}

function buildCost(buildingDef, targetLevel) {
  const base = buildingDef.costL1 || { wood: 100, stone: 100, iron: 80, food: 50 };
  const mult = Math.pow(config.build.costMultiplierBase, targetLevel - 1);
  return { wood: Math.floor(base.wood * mult), stone: Math.floor(base.stone * mult), iron: Math.floor(base.iron * mult), food: Math.floor(base.food * mult) };
}

// GET /api/cities
router.get('/', auth, async (req, res) => {
  try {
    const cities = await prisma.city.findMany({
      where: { playerId: req.user.playerId },
      include: { buildings: true, buildQueue: { orderBy: { startedAt: 'asc' } }, recruitQueue: { orderBy: { startedAt: 'asc' } }, armies: { include: { units: true } } }
    });
    const citiesWithTier = cities.map(city => {
      const wallLevel = city.buildings.find(b => b.key === 'WALL')?.level || 0;
      const cityTier = getCityTier(wallLevel);
      return { ...city, wallLevel, cityTier, cityTierName: getCityTierName(cityTier) };
    });
    res.json(citiesWithTier);
  } catch (e) {
    sendError(res, e);
  }
});

// POST /api/city/:id/build
router.post('/:id/build', auth, async (req, res) => {
  try {
    const { buildingKey } = req.body;
    const rawSlot = req.body.slot;
    const slot = rawSlot === undefined || rawSlot === null || rawSlot === '' ? null : Number(rawSlot);
    if (!buildingKey || typeof buildingKey !== 'string') return res.status(400).json({ error: 'Bâtiment requis' });
    if (slot !== null && !Number.isInteger(slot)) return res.status(400).json({ error: 'Emplacement invalide' });
    const buildingDef = buildingsData.find(b => b.key === buildingKey);
    if (!buildingDef) return res.status(400).json({ error: 'Bâtiment inconnu' });
    const isField = FIELD_KEYS.includes(buildingKey);
    if (isField && slot === null) return res.status(400).json({ error: 'Emplacement requis pour un champ' });

    const result = await prisma.$transaction(async (tx) => {
      await lockCity(tx, req.params.id);
      const city = await tx.city.findFirst({
        where: { id: req.params.id, playerId: req.user.playerId },
        include: { buildings: true, buildQueue: true, player: true }
      });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      if (buildingDef.faction && buildingDef.faction !== city.player.faction) return { error: 'Bâtiment réservé à une autre faction', status: 400 };

      const MAX_RUNNING = config.build.maxRunning;
      const MAX_TOTAL = MAX_RUNNING + config.build.maxQueued + (isPremium(city.player) ? config.purchases.perks.extraBuildQueue : 0);
      if (city.buildQueue.length >= MAX_TOTAL) return { error: `File de construction pleine (max ${MAX_TOTAL})`, status: 400 };

      const existing = isField
        ? city.buildings.find(b => b.key === buildingKey && b.slot === slot)
        : city.buildings.find(b => b.key === buildingKey);
      const buildSlot = resolveSlot(buildingKey, slot, existing, city);
      if (buildSlot === null) return { error: 'Emplacement invalide ou déjà occupé', status: 400 };

      const inQueue = city.buildQueue.filter(b => b.buildingKey === buildingKey && b.slot === buildSlot).length;
      const targetLevel = (existing?.level || 0) + inQueue + 1;

      const maxLevel = buildingDef.maxLevel || 20;
      if (targetLevel > maxLevel) return { error: `Niveau max atteint (${maxLevel})`, status: 400 };

      if (targetLevel === 1) {
        const missing = (buildingDef.prereq || []).filter(p => maxBuildingLevel(city.buildings, p.key) < p.level);
        if (missing.length) {
          const names = missing.map(p => `${buildingsData.find(b => b.key === p.key)?.name || p.key} niv.${p.level}`);
          return { error: `Prérequis manquants : ${names.join(', ')}`, status: 400 };
        }
      }

      if (buildingKey !== 'MAIN_HALL') {
        const mainHallLevel = maxBuildingLevel(city.buildings, 'MAIN_HALL');
        if (targetLevel > mainHallLevel) {
          return { error: `Le niveau du bâtiment ne peut pas dépasser celui du Bâtiment principal (Niv.${mainHallLevel})`, status: 400 };
        }
      }

      const cost = buildCost(buildingDef, targetLevel);
      if (!(await debitCity(tx, city.id, cost))) {
        return { error: 'Ressources insuffisantes', status: 400, cost, have: { wood: Math.floor(city.wood), stone: Math.floor(city.stone), iron: Math.floor(city.iron), food: Math.floor(city.food) } };
      }

      const baseTime = buildingDef.timeL1Sec || 60;
      let durationSec = Math.floor(baseTime * Math.pow(config.build.timeMultiplierBase, targetLevel - 1));
      const buildTimeBonus = getFactionBonus(city.player.faction, 'buildTimeReduction', factionsData);
      if (buildTimeBonus > 0) durationSec = Math.floor(durationSec * (1 - buildTimeBonus / 100));
      durationSec = Math.max(1, durationSec);

      const now = new Date();
      const running = city.buildQueue.filter(b => b.status === 'RUNNING');
      let startAt = now, status = 'RUNNING';
      if (running.length >= MAX_RUNNING) {
        // Starts when the latest item of the queue ends (queued items run after the running ones)
        const lastEnd = city.buildQueue.reduce((m, b) => Math.max(m, new Date(b.endsAt).getTime()), now.getTime());
        startAt = new Date(lastEnd);
        status = 'QUEUED';
      }
      const endsAt = new Date(startAt.getTime() + durationSec * 1000);

      const queueItem = await tx.buildQueueItem.create({
        data: { cityId: city.id, buildingKey, targetLevel, slot: buildSlot, startedAt: startAt, endsAt, status }
      });

      return { message: status === 'RUNNING' ? 'Construction lancee' : 'Construction ajoutee a la file', queueItem, durationSec, cost };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    console.error('Build error:', e);
    sendError(res, e);
  }
});

// POST /api/city/:id/recruit
router.post('/:id/recruit', auth, async (req, res) => {
  try {
    const { unitKey, count } = req.body;
    if (!Number.isInteger(count) || count < 1 || count > config.limits.maxRecruitCount) return res.status(400).json({ error: `Nombre invalide (1-${config.limits.maxRecruitCount})` });
    if (typeof unitKey !== 'string') return res.status(400).json({ error: 'Unite inconnue' });

    const unit = unitsData.find(u => u.key === unitKey);
    if (!unit) return res.status(400).json({ error: 'Unite inconnue' });

    const result = await prisma.$transaction(async (tx) => {
      await lockCity(tx, req.params.id);
      const city = await tx.city.findFirst({
        where: { id: req.params.id, playerId: req.user.playerId },
        include: { recruitQueue: true, buildings: true, player: true }
      });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      if (unit.faction !== city.player.faction) return { error: 'Unité d\'une autre faction', status: 400 };

      const barracks = city.buildings.find(b => b.key === 'BARRACKS');
      const stable = city.buildings.find(b => b.key === 'STABLE');
      const workshop = city.buildings.find(b => b.key === 'WORKSHOP');
      const greatBarracks = city.buildings.find(b => b.key === 'GREAT_BARRACKS');
      const greatStable = city.buildings.find(b => b.key === 'GREAT_STABLE');

      // Unlock thresholds come from building data (GDD: unlockIntermediateTier=7, unlockEliteTier=15)
      const barracksDef = buildingsData.find(b => b.key === 'BARRACKS');
      const stableDef = buildingsData.find(b => b.key === 'STABLE');
      const unlockInterBarracks = barracksDef?.effects?.unlockIntermediateTier || 7;
      const unlockEliteBarracks = barracksDef?.effects?.unlockEliteTier || 15;
      const unlockInterStable = stableDef?.effects?.unlockIntermediateTier || 7;
      const unlockEliteStable = stableDef?.effects?.unlockEliteTier || 15;

      if (unit.class === 'INFANTRY' || unit.class === 'ARCHER') {
        const recruitBuilding = barracks || greatBarracks;
        if (!recruitBuilding) return { error: 'Caserne requise', status: 400 };
        if (unit.tier === 'intermediate' && recruitBuilding.level < unlockInterBarracks) return { error: `Caserne niveau ${unlockInterBarracks} requise pour unités intermédiaires`, status: 400 };
        if (unit.tier === 'elite' && recruitBuilding.level < unlockEliteBarracks) return { error: `Caserne niveau ${unlockEliteBarracks} requise pour unités élite`, status: 400 };
      }
      if (unit.class === 'CAVALRY') {
        const recruitBuilding = stable || greatStable;
        if (!recruitBuilding) return { error: 'Écurie requise', status: 400 };
        if (unit.tier === 'intermediate' && recruitBuilding.level < unlockInterStable) return { error: `Écurie niveau ${unlockInterStable} requise`, status: 400 };
        if (unit.tier === 'elite' && recruitBuilding.level < unlockEliteStable) return { error: `Écurie niveau ${unlockEliteStable} requise`, status: 400 };
      }
      if (unit.class === 'SIEGE') {
        if (!workshop) return { error: 'Atelier requis', status: 400 };
        if (workshop.level < config.recruit.siegeWorkshopLevel) return { error: `Atelier niveau ${config.recruit.siegeWorkshopLevel} requis`, status: 400 };
      }

      // Per-class base costs with tier multiplier (GDD formulas.json)
      const classCosts = config.recruit.baseCosts[unit.class] || config.recruit.baseCosts.INFANTRY;
      const tierCostMult = config.recruit.tierCostMultipliers[unit.tier] || 1.0;
      const cost = {
        wood: Math.ceil(classCosts.wood * tierCostMult * count),
        stone: Math.ceil(classCosts.stone * tierCostMult * count),
        iron: Math.ceil(classCosts.iron * tierCostMult * count),
        food: Math.ceil(classCosts.food * tierCostMult * count)
      };
      if (!(await debitCity(tx, city.id, cost))) return { error: 'Ressources insuffisantes', status: 400, cost };

      // Per-class base time with tier multiplier (GDD unit_training_times.json)
      const classBaseTime = config.recruit.baseTimeSec[unit.class] || 360;
      const tierTimeMult = config.recruit.tierTimeMultipliers[unit.tier] || 1.0;
      const timePerUnit = Math.round(classBaseTime * tierTimeMult);
      const totalTime = timePerUnit * count;
      // Batches in the same building train one after another, not in parallel
      const buildingKey = RECRUIT_BUILDING[unit.class] || 'BARRACKS';
      const lastEnd = city.recruitQueue.filter(q => q.buildingKey === buildingKey).reduce((m, q) => Math.max(m, new Date(q.endsAt).getTime()), 0);
      const startAt = new Date(Math.max(Date.now(), lastEnd));
      const endsAt = new Date(startAt.getTime() + totalTime * 1000);

      const queueItem = await tx.recruitQueueItem.create({
        data: { cityId: city.id, unitKey, count, buildingKey, startedAt: startAt, endsAt, status: 'RUNNING' }
      });

      return { message: 'Recrutement lance', queueItem, durationSec: totalTime, timePerUnit, cost };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    sendError(res, e);
  }
});

// GET /api/city/:id/wounded
router.get('/:id/wounded', auth, async (req, res) => {
  try {
    const city = await prisma.city.findFirst({ where: { id: req.params.id, playerId: req.user.playerId } });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });

    const wounded = await prisma.woundedUnit.findMany({ where: { cityId: city.id } });
    const woundedWithDetails = wounded.map(w => {
      const unitDef = unitsData.find(u => u.key === w.unitKey);
      return {
        ...w, unitName: unitDef?.name || w.unitKey, faction: unitDef?.faction,
        class: unitDef?.class, tier: unitDef?.tier,
        timeToHeal: Math.max(0, new Date(w.healsAt).getTime() - Date.now())
      };
    });
    res.json(woundedWithDetails);
  } catch (e) {
    sendError(res, e);
  }
});

// POST /api/city/:id/wounded/heal — instant healing for 1 gold per unit
router.post('/:id/wounded/heal', auth, async (req, res) => {
  try {
    const { unitKey } = req.body;
    if (!unitKey || typeof unitKey !== 'string') return res.status(400).json({ error: 'unitKey requis' });

    const result = await prisma.$transaction(async (tx) => {
      await lockCity(tx, req.params.id);
      const city = await tx.city.findFirst({ where: { id: req.params.id, playerId: req.user.playerId } });
      if (!city) return { error: 'Ville non trouvée', status: 404 };

      const wounded = await tx.woundedUnit.findFirst({ where: { cityId: city.id, unitKey } });
      if (!wounded) return { error: 'Pas de blessés de ce type', status: 404 };

      const goldCost = wounded.count;
      const paid = await tx.player.updateMany({ where: { id: req.user.playerId, gold: { gte: goldCost } }, data: { gold: { decrement: goldCost } } });
      if (paid.count !== 1) return { error: `Pas assez d'or (${goldCost} requis)`, status: 400 };

      const garrison = await tx.army.findFirst({ where: { cityId: city.id, isGarrison: true } });
      if (garrison) {
        const unitDef = unitsData.find(u => u.key === unitKey);
        await tx.armyUnit.upsert({
          where: { armyId_unitKey: { armyId: garrison.id, unitKey } },
          update: { count: { increment: wounded.count } },
          create: { armyId: garrison.id, unitKey, tier: unitDef?.tier || 'base', count: wounded.count }
        });
      }
      await tx.woundedUnit.delete({ where: { id: wounded.id } });
      return { success: true, healed: wounded.count, goldSpent: goldCost };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    sendError(res, e);
  }
});

// GET /api/city/incoming-attacks
router.get('/incoming-attacks', auth, async (req, res) => {
  try {
    const playerCities = await prisma.city.findMany({
      where: { playerId: req.user.playerId },
      select: { id: true, name: true, x: true, y: true }
    });
    const cityIds = playerCities.map(c => c.id);

    const incomingArmies = await prisma.army.findMany({
      where: { targetCityId: { in: cityIds }, status: { in: ['ATTACKING', 'RAIDING'] }, arrivalAt: { gt: new Date() } },
      select: { id: true, status: true, arrivalAt: true, targetCityId: true, missionType: true },
      orderBy: { arrivalAt: 'asc' }
    });

    const attacks = incomingArmies.map(a => {
      const targetCity = playerCities.find(c => c.id === a.targetCityId);
      return { id: a.id, type: a.missionType || a.status, arrivalAt: a.arrivalAt, targetCity: targetCity?.name || 'Ville', targetCityId: a.targetCityId };
    });
    res.json(attacks);
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;
