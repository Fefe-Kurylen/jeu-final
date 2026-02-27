const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { unitsData, buildingsData } = require('../config/gamedata');
const { factionsData } = require('../config/gamedata');
const { getCityTier, getCityTierName, getProductionAtLevel, getFactionBonus } = require('../utils/calculations');

// GET /api/cities
router.get('/', auth, async (req, res) => {
  try {
    const cities = await prisma.city.findMany({
      where: { playerId: req.user.playerId },
      include: { buildings: true, buildQueue: { orderBy: { slot: 'asc' } }, recruitQueue: { orderBy: { startedAt: 'asc' } }, armies: { include: { units: true } } }
    });
    const citiesWithTier = cities.map(city => {
      const wallLevel = city.buildings.find(b => b.key === 'WALL')?.level || 0;
      const cityTier = getCityTier(wallLevel);
      return { ...city, wallLevel, cityTier, cityTierName: getCityTierName(cityTier) };
    });
    res.json(citiesWithTier);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/city/:id/build
router.post('/:id/build', auth, async (req, res) => {
  try {
    const { buildingKey, slot } = req.body;
    if (!buildingKey || typeof buildingKey !== 'string') return res.status(400).json({ error: 'Bâtiment requis' });
    const buildingDef = buildingsData.find(b => b.key === buildingKey);
    if (!buildingDef) return res.status(400).json({ error: 'Bâtiment inconnu' });
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({
        where: { id: req.params.id, playerId: req.user.playerId },
        include: { buildings: true, buildQueue: true }
      });
      if (!city) return { error: 'Ville non trouvee', status: 404 };

      const MAX_RUNNING = config.build.maxRunning;
      const MAX_QUEUED = config.build.maxQueued;
      const MAX_TOTAL = MAX_RUNNING + MAX_QUEUED;

      const runningCount = city.buildQueue.filter(b => b.status === 'RUNNING').length;
      const totalCount = city.buildQueue.length;
      if (totalCount >= MAX_TOTAL) return { error: `File de construction pleine (max ${MAX_TOTAL})`, status: 400 };

      const isFieldBuilding = ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'].includes(buildingKey);
      const existing = isFieldBuilding && slot
        ? city.buildings.find(b => b.key === buildingKey && b.slot === slot)
        : city.buildings.find(b => b.key === buildingKey);
      const inQueue = isFieldBuilding && slot
        ? city.buildQueue.filter(b => b.buildingKey === buildingKey && b.slot === slot).length
        : city.buildQueue.filter(b => b.buildingKey === buildingKey).length;
      const targetLevel = (existing?.level || 0) + inQueue + 1;

      const maxLevel = buildingDef?.maxLevel || 20;
      if (targetLevel > maxLevel) return { error: `Niveau max atteint (${maxLevel})`, status: 400 };

      if (buildingKey !== 'MAIN_HALL') {
        const mainHall = city.buildings.find(b => b.key === 'MAIN_HALL');
        const mainHallLevel = mainHall?.level || 1;
        if (targetLevel > mainHallLevel) {
          return { error: `Le niveau du bâtiment ne peut pas dépasser celui du Bâtiment principal (Niv.${mainHallLevel})`, status: 400 };
        }
      }

      const baseCost = buildingDef?.costL1 || { wood: 100, stone: 100, iron: 80, food: 50 };
      const mult = Math.pow(config.build.costMultiplierBase, targetLevel - 1);
      const cost = {
        wood: Math.floor(baseCost.wood * mult), stone: Math.floor(baseCost.stone * mult),
        iron: Math.floor(baseCost.iron * mult), food: Math.floor(baseCost.food * mult)
      };

      if (city.wood < cost.wood || city.stone < cost.stone || city.iron < cost.iron || city.food < cost.food) {
        return { error: 'Ressources insuffisantes', status: 400, cost, have: { wood: Math.floor(city.wood), stone: Math.floor(city.stone), iron: Math.floor(city.iron), food: Math.floor(city.food) } };
      }

      await tx.city.update({
        where: { id: city.id },
        data: { wood: city.wood - cost.wood, stone: city.stone - cost.stone, iron: city.iron - cost.iron, food: city.food - cost.food }
      });

      const baseTime = buildingDef?.timeL1Sec || 60;
      let durationSec = Math.floor(baseTime * Math.pow(config.build.timeMultiplierBase, targetLevel - 1));

      const player = await tx.player.findUnique({ where: { id: req.user.playerId } });
      const buildTimeBonus = getFactionBonus(player?.faction, 'buildTimeReduction', factionsData);
      if (buildTimeBonus > 0) durationSec = Math.floor(durationSec * (1 - buildTimeBonus / 100));

      const now = new Date();
      let startAt = now;
      let status = 'RUNNING';

      if (runningCount >= MAX_RUNNING) {
        const allRunning = city.buildQueue.filter(b => b.status === 'RUNNING');
        const earliestEnd = allRunning.sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt))[0];
        const allQueued = city.buildQueue.filter(b => b.status === 'QUEUED');
        if (allQueued.length > 0) {
          const lastQueued = allQueued.sort((a, b) => new Date(b.endsAt) - new Date(a.endsAt))[0];
          startAt = new Date(lastQueued.endsAt);
        } else {
          startAt = new Date(earliestEnd.endsAt);
        }
        status = 'QUEUED';
      }

      const endsAt = new Date(startAt.getTime() + durationSec * 1000);

      let buildSlot = slot;
      if (!buildSlot && existing) buildSlot = existing.slot;
      if (!buildSlot) {
        const usedSlots = new Set(city.buildings.map(b => b.slot));
        city.buildQueue.forEach(q => usedSlots.add(q.slot));
        buildSlot = 1;
        while (usedSlots.has(buildSlot)) buildSlot++;
      }

      const queueItem = await tx.buildQueueItem.create({
        data: { cityId: city.id, buildingKey, targetLevel, slot: buildSlot, startedAt: startAt, endsAt, status }
      });

      return { message: status === 'RUNNING' ? 'Construction lancee' : 'Construction ajoutee a la file', queueItem, durationSec, cost };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    console.error('Build error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/city/:id/recruit
router.post('/:id/recruit', auth, async (req, res) => {
  try {
    const { unitKey, count } = req.body;
    if (!count || count < 1 || count > 10000 || !Number.isInteger(count)) return res.status(400).json({ error: 'Nombre invalide (1-10000)' });

    const unit = unitsData.find(u => u.key === unitKey);
    if (!unit) return res.status(400).json({ error: 'Unite inconnue' });

    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({
        where: { id: req.params.id, playerId: req.user.playerId },
        include: { recruitQueue: true, buildings: true }
      });
      if (!city) return { error: 'Ville non trouvee', status: 404 };

      const barracks = city.buildings.find(b => b.key === 'BARRACKS');
      const stable = city.buildings.find(b => b.key === 'STABLE');
      const workshop = city.buildings.find(b => b.key === 'WORKSHOP');
      const greatBarracks = city.buildings.find(b => b.key === 'GREAT_BARRACKS');
      const greatStable = city.buildings.find(b => b.key === 'GREAT_STABLE');

      // Use building data for unlock thresholds (GDD: unlockIntermediateTier=7, unlockEliteTier=15)
      const barracksDef = buildingsData.find(b => b.key === 'BARRACKS');
      const stableDef = buildingsData.find(b => b.key === 'STABLE');
      const workshopDef = buildingsData.find(b => b.key === 'WORKSHOP');
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
        if (workshop.level < 5) return { error: 'Atelier niveau 5 requis', status: 400 };
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

      if (city.wood < cost.wood || city.stone < cost.stone || city.iron < cost.iron || city.food < cost.food) {
        return { error: 'Ressources insuffisantes', status: 400, cost };
      }

      await tx.city.update({
        where: { id: city.id },
        data: { wood: city.wood - cost.wood, stone: city.stone - cost.stone, iron: city.iron - cost.iron, food: city.food - cost.food }
      });

      // Per-class base time with tier multiplier (GDD unit_training_times.json)
      const classBaseTime = config.recruit.baseTimeSec[unit.class] || 360;
      const tierTimeMult = config.recruit.tierTimeMultipliers[unit.tier] || 1.0;
      const timePerUnit = Math.ceil(classBaseTime * tierTimeMult);
      const totalTime = timePerUnit * count;
      const now = new Date();
      const endsAt = new Date(now.getTime() + totalTime * 1000);

      const queueItem = await tx.recruitQueueItem.create({
        data: { cityId: city.id, unitKey, count, buildingKey: 'BARRACKS', startedAt: now, endsAt, status: 'RUNNING' }
      });

      return { message: 'Recrutement lance', queueItem, durationSec: totalTime, cost };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

// POST /api/city/:id/wounded/heal
router.post('/:id/wounded/heal', auth, async (req, res) => {
  try {
    const { unitKey } = req.body;
    if (!unitKey) return res.status(400).json({ error: 'unitKey requis' });

    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: req.params.id, playerId: req.user.playerId } });
      if (!city) return { error: 'Ville non trouvée', status: 404 };

      const player = await tx.player.findUnique({ where: { id: req.user.playerId } });
      const wounded = await tx.woundedUnit.findFirst({ where: { cityId: city.id, unitKey } });
      if (!wounded) return { error: 'Pas de blessés de ce type', status: 404 };

      const goldCost = wounded.count;
      if (player.gold < goldCost) return { error: `Pas assez d'or (${goldCost} requis)`, status: 400 };

      await tx.player.update({ where: { id: player.id }, data: { gold: player.gold - goldCost } });

      const garrison = await tx.army.findFirst({
        where: { cityId: city.id, isGarrison: true }, include: { units: true }
      });
      if (garrison) {
        const existingUnit = garrison.units.find(u => u.unitKey === unitKey);
        if (existingUnit) {
          await tx.armyUnit.update({ where: { id: existingUnit.id }, data: { count: existingUnit.count + wounded.count } });
        } else {
          const unitDef = unitsData.find(u => u.key === unitKey);
          await tx.armyUnit.create({
            data: { armyId: garrison.id, unitKey, tier: unitDef?.tier || 'base', count: wounded.count }
          });
        }
      }
      await tx.woundedUnit.delete({ where: { id: wounded.id } });
      return { success: true, healed: wounded.count, goldSpent: goldCost };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/incoming-attacks
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
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
