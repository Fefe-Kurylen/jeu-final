const express = require('express');
const { isPremium } = require('../services/entitlementService');
const router = express.Router();
const { admitWaiting } = require('../services/woundedService');
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { unitsData, buildingsData, factionsData } = require('../config/gamedata');
const { getCityTier, getCityTierName, getFactionBonus, mainHallLevelOf } = require('../utils/calculations');
const { lockCity, debitCity, creditCity } = require('../utils/db');
const fx = require('../utils/buildingEffects');
const T = require('../utils/techEffects');   // technologies (Ingénierie, Entraînement)
const { processBuilds } = require('../game/processors/buildProcessor');
const { processRecruits } = require('../game/processors/recruitProcessor');

// Queue items that are due are applied when the player looks at their cities, so a level never shows
// "finished" on the client while the server still waits for the next tick (both processors are idempotent)
async function settleDueQueues(playerId) {
  const now = new Date();
  const [builds, recruits] = await Promise.all([
    prisma.buildQueueItem.count({ where: { status: 'RUNNING', endsAt: { lte: now }, city: { playerId } } }),
    prisma.recruitQueueItem.count({ where: { status: 'RUNNING', endsAt: { lte: now }, city: { playerId } } })
  ]);
  if (builds > 0) await processBuilds(now, { playerId }).catch(e => console.error('[SETTLE builds]', e.message));
  if (recruits > 0) await processRecruits(now, { playerId }).catch(e => console.error('[SETTLE recruits]', e.message));
}

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
  // Level 2 of a building whose level 1 is still in the queue goes to the same slot (never a second copy)
  const queued = city.buildQueue.find(q => q.buildingKey === buildingKey);
  if (queued) return queued.slot;
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

// Cost of a recruit batch (per-class base × tier × count, GDD formulas.json)
function recruitCost(unit, count) {
  const classCosts = config.recruit.baseCosts[unit.class] || config.recruit.baseCosts.INFANTRY;
  const tierCostMult = config.recruit.tierCostMultipliers[unit.tier] || 1.0;
  return {
    wood: Math.ceil(classCosts.wood * tierCostMult * count),
    stone: Math.ceil(classCosts.stone * tierCostMult * count),
    iron: Math.ceil(classCosts.iron * tierCostMult * count),
    food: Math.ceil(classCosts.food * tierCostMult * count)
  };
}
const scaleCost = (cost, rate) => Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.floor(v * rate)]));

// Starts queued items while running slots are free (same rule as the tick): the duration fixed at enqueue time is kept
async function promoteQueued(tx, cityId, now) {
  const running = await tx.buildQueueItem.count({ where: { cityId, status: 'RUNNING' } });
  const free = config.build.maxRunning - running;
  if (free <= 0) return;
  const next = await tx.buildQueueItem.findMany({ where: { cityId, status: 'QUEUED' }, orderBy: { startedAt: 'asc' }, take: free });
  for (const item of next) {
    const durationMs = Math.max(1000, new Date(item.endsAt).getTime() - new Date(item.startedAt).getTime());
    await tx.buildQueueItem.update({ where: { id: item.id }, data: { status: 'RUNNING', startedAt: now, endsAt: new Date(now.getTime() + durationMs) } });
  }
}

// GET /api/cities
router.get('/', auth, async (req, res) => {
  try {
    await settleDueQueues(req.user.playerId);
    const cities = await prisma.city.findMany({
      where: { playerId: req.user.playerId },
      include: { buildings: true, buildQueue: { orderBy: { startedAt: 'asc' } }, recruitQueue: { orderBy: { startedAt: 'asc' } }, armies: { include: { units: true } } }
    });
    const citiesWithTier = cities.map(city => {
      const wallLevel = city.buildings.find(b => b.key === 'WALL')?.level || 0;
      const mainHallLevel = mainHallLevelOf(city.buildings);
      const cityTier = getCityTier(mainHallLevel);
      return { ...city, wallLevel, mainHallLevel, cityTier, cityTierName: getCityTierName(cityTier) };
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
      if (fx.capitalOnly(buildingKey) && !city.isCapital) return { error: 'Bâtiment réservé à la capitale', status: 400 };
      if (fx.notInCapital(buildingKey) && city.isCapital) return { error: 'Bâtiment réservé aux villes secondaires', status: 400 };

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
      // A secondary city's Main Hall stops at 20 (the capital alone reaches 30): every other building follows through the cap below
      if (buildingKey === 'MAIN_HALL' && !city.isCapital && targetLevel > config.city.secondaryMainHallMaxLevel) return { error: `Le Bâtiment principal d'une ville secondaire ne dépasse pas le niveau ${config.city.secondaryMainHallMaxLevel}`, status: 400 };

      if (targetLevel === 1) {
        // In a secondary city, a prerequisite on a capital-only building (Barracks 20 for the Great Barracks…) is met by the capital
        const capital = city.isCapital ? null : await tx.city.findFirst({ where: { playerId: city.playerId, isCapital: true }, include: { buildings: true } });
        const levelFor = (p) => Math.max(maxBuildingLevel(city.buildings, p.key), capital && fx.capitalOnly(p.key) ? maxBuildingLevel(capital.buildings, p.key) : 0);
        const missing = (buildingDef.prereq || []).filter(p => levelFor(p) < p.level);
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

      // Ingénierie (technologie) : −1 % du coût de construction par niveau
      const techLevels = T.levelsFrom(await tx.playerTechnology.findMany({ where: { playerId: city.playerId } }));
      const cost = scaleCost(buildCost(buildingDef, targetLevel), T.techReductionMult(techLevels, 'buildCostReductionPct'));
      if (!(await debitCity(tx, city.id, cost))) {
        return { error: 'Ressources insuffisantes', status: 400, cost, have: { wood: Math.floor(city.wood), stone: Math.floor(city.stone), iron: Math.floor(city.iron), food: Math.floor(city.food) } };
      }

      const baseTime = buildingDef.timeL1Sec || 60;
      let durationSec = Math.floor(baseTime * Math.pow(config.build.timeMultiplierBase, targetLevel - 1));
      const buildTimeBonus = getFactionBonus(city.player.faction, 'buildTimeReduction', factionsData);
      if (buildTimeBonus > 0) durationSec = Math.floor(durationSec * (1 - buildTimeBonus / 100));
      // Main Hall, Academy, Residence: construction time reduction (data: buildTimeReductionPctPerLevel)
      durationSec = Math.floor(durationSec * (1 - fx.buildTimeReductionPct(city.buildings) / 100));
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

      const recruitBuildingKey = RECRUIT_BUILDING[unit.class] || 'BARRACKS';
      if (city.recruitQueue.filter(q => q.buildingKey === recruitBuildingKey).length >= config.recruit.maxBatchesPerBuilding) return { error: `File de recrutement pleine (max ${config.recruit.maxBatchesPerBuilding} lots)`, status: 400 };

      // Per-class base costs with tier multiplier (GDD formulas.json)
      const cost = recruitCost(unit, count);
      if (!(await debitCity(tx, city.id, cost))) return { error: 'Ressources insuffisantes', status: 400, cost };

      // Per-class base time with tier multiplier (GDD unit_training_times.json), reduced by the training buildings
      const classBaseTime = config.recruit.baseTimeSec[unit.class] || 360;
      const tierTimeMult = config.recruit.tierTimeMultipliers[unit.tier] || 1.0;
      // Entraînement (technologie) : −1 % de temps de recrutement par niveau, après les bâtiments
      const techLevels = T.levelsFrom(await tx.playerTechnology.findMany({ where: { playerId: city.playerId } }));
      const timePerUnit = Math.max(1, Math.round(classBaseTime * tierTimeMult * (1 - fx.trainTimeReductionPct(city.buildings, unit.class) / 100) * T.techReductionMult(techLevels, 'trainTimeReductionPct')));
      const totalTime = timePerUnit * count;
      // Batches in the same building train one after another, not in parallel
      const buildingKey = recruitBuildingKey;
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

// POST /api/city/:id/settlers — train a settler at the Residence of the capital (GDD: 1 at L10, 2 at L15, 3 at L20,
// each settler founds one secondary city). Counted against the slots: existing secondary cities, settlers waiting,
// settlers travelling with armies and settlers in training.
router.post('/:id/settlers', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockCity(tx, req.params.id);
      const city = await tx.city.findFirst({ where: { id: req.params.id, playerId: req.user.playerId }, include: { buildings: true, recruitQueue: true } });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      if (!city.isCapital) return { error: 'Les colons se forment à la Résidence de la capitale', status: 400 };
      const residence = city.buildings.find(b => b.key === 'RESIDENCE');
      if (!residence) return { error: 'Résidence requise', status: 400 };
      const slots = Math.min(config.city.maxSecondaryCities, fx.settlerSlots(residence.level));
      if (slots <= 0) return { error: 'Résidence niveau 10 requise pour former un colon', status: 400 };
      const colonies = await tx.city.count({ where: { playerId: city.playerId, isCapital: false } });
      const travelling = await tx.army.aggregate({ where: { ownerId: city.playerId }, _sum: { settlers: true } });
      const training = city.recruitQueue.filter(q => q.unitKey === 'SETTLER').reduce((s, q) => s + q.count, 0);
      const used = colonies + city.settlers + (travelling._sum.settlers || 0) + training;
      if (used >= slots) {
        const next = slots >= 3 ? null : slots === 2 ? 20 : 15;
        return { error: next ? `Tous vos colons sont engagés (${slots}) : Résidence niveau ${next} pour le suivant` : `Limite atteinte : ${slots} villes secondaires au plus`, status: 400 };
      }
      const cost = fx.settlerCost();
      if (!(await debitCity(tx, city.id, cost))) return { error: 'Ressources insuffisantes', status: 400, cost };
      const lastEnd = city.recruitQueue.filter(q => q.buildingKey === 'RESIDENCE').reduce((m, q) => Math.max(m, new Date(q.endsAt).getTime()), 0);
      const startAt = new Date(Math.max(Date.now(), lastEnd));
      const durationSec = fx.settlerTrainTimeSec();
      const queueItem = await tx.recruitQueueItem.create({ data: { cityId: city.id, unitKey: 'SETTLER', count: 1, buildingKey: 'RESIDENCE', startedAt: startAt, endsAt: new Date(startAt.getTime() + durationSec * 1000), status: 'RUNNING' } });
      return { message: 'Formation d\'un colon lancée', queueItem, durationSec, cost, slots, used: used + 1 };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// DELETE /api/city/:id/build/:itemId — cancel a construction: full refund while queued, half once started.
// Later levels of the same building in the queue depend on it and are cancelled (and refunded) too.
router.delete('/:id/build/:itemId', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: req.params.id, playerId: req.user.playerId }, select: { id: true } });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      await lockCity(tx, city.id);
      const queue = await tx.buildQueueItem.findMany({ where: { cityId: city.id } });
      const item = queue.find(q => q.id === req.params.itemId);
      if (!item) return { error: 'Construction introuvable (déjà terminée ?)', status: 404 };
      const def = buildingsData.find(b => b.key === item.buildingKey);
      // Refund what was paid: the construction cost net of the Engineering research
      const techMult = T.techReductionMult(await tx.playerTechnology.findMany({ where: { playerId: req.user.playerId } }), 'buildCostReductionPct');
      const toCancel = queue.filter(q => q.buildingKey === item.buildingKey && q.slot === item.slot && q.targetLevel >= item.targetLevel);
      const refund = { wood: 0, stone: 0, iron: 0, food: 0 };
      for (const q of toCancel) {
        const removed = await tx.buildQueueItem.deleteMany({ where: { id: q.id, status: q.status } });
        if (removed.count !== 1) continue;   // finished meanwhile: nothing to refund
        const part = scaleCost(def ? scaleCost(buildCost(def, q.targetLevel), techMult) : { wood: 0, stone: 0, iron: 0, food: 0 }, q.status === 'QUEUED' ? 1 : 0.5);
        for (const k of Object.keys(refund)) refund[k] += part[k];
      }
      await creditCity(tx, city.id, refund);
      await promoteQueued(tx, city.id, new Date());
      return { message: 'Construction annulée', cancelled: toCancel.length, refund };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// DELETE /api/city/:id/recruit/:itemId — cancel a recruit batch: half of its cost comes back, the batches
// scheduled after it in the same building start earlier
router.delete('/:id/recruit/:itemId', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: req.params.id, playerId: req.user.playerId }, select: { id: true } });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      await lockCity(tx, city.id);
      const item = await tx.recruitQueueItem.findFirst({ where: { id: req.params.itemId, cityId: city.id } });
      if (!item) return { error: 'Recrutement introuvable (déjà terminé ?)', status: 404 };
      const removed = await tx.recruitQueueItem.deleteMany({ where: { id: item.id, status: 'RUNNING' } });
      if (removed.count !== 1) return { error: 'Recrutement déjà terminé', status: 409 };
      const unit = unitsData.find(u => u.key === item.unitKey);
      const refund = unit ? scaleCost(recruitCost(unit, item.count), 0.5) : { wood: 0, stone: 0, iron: 0, food: 0 };
      await creditCity(tx, city.id, refund);
      const durationMs = new Date(item.endsAt).getTime() - new Date(item.startedAt).getTime();
      const later = await tx.recruitQueueItem.findMany({ where: { cityId: city.id, buildingKey: item.buildingKey, startedAt: { gte: item.startedAt } } });
      for (const q of later) {
        const start = Math.max(Date.now(), new Date(q.startedAt).getTime() - durationMs);
        await tx.recruitQueueItem.update({ where: { id: q.id }, data: { startedAt: new Date(start), endsAt: new Date(new Date(q.endsAt).getTime() - durationMs) } });
      }
      return { message: 'Recrutement annulé', refund };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
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
        timeToHeal: w.count > 0 ? Math.max(0, new Date(w.healsAt).getTime() - Date.now()) : null
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
      if (!wounded || wounded.count <= 0) return { error: wounded ? 'Ces blessés attendent un lit : seuls les blessés au lit se soignent' : 'Pas de blessés de ce type', status: wounded ? 400 : 404 };

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
      // Seuls les blessés au lit sont soignés ; la file d'attente prend les lits libérés
      if (wounded.waiting > 0) await tx.woundedUnit.update({ where: { id: wounded.id }, data: { count: 0 } });
      else await tx.woundedUnit.delete({ where: { id: wounded.id } });
      await admitWaiting(tx, city.id);
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
      select: { id: true, name: true, x: true, y: true, buildings: { where: { key: 'WATCHTOWER' }, select: { level: true } } }
    });
    const cityIds = playerCities.map(c => c.id);

    const incomingArmies = await prisma.army.findMany({
      where: { targetCityId: { in: cityIds }, status: { in: ['ATTACKING', 'RAIDING'] }, arrivalAt: { gt: new Date() } },
      select: { id: true, status: true, arrivalAt: true, targetCityId: true, missionType: true, owner: { select: { name: true } }, units: { select: { count: true } } },
      orderBy: { arrivalAt: 'asc' }
    });

    const attacks = incomingArmies.map(a => {
      const targetCity = playerCities.find(c => c.id === a.targetCityId);
      const watchtower = targetCity?.buildings?.[0]?.level || 0;
      return {
        id: a.id, type: a.missionType || a.status, arrivalAt: a.arrivalAt, targetCity: targetCity?.name || 'Ville', targetCityId: a.targetCityId,
        attacker: watchtower >= fx.watchtowerShowsAttackerAt() ? a.owner?.name : null,
        units: watchtower >= fx.watchtowerShowsDetailsAt() ? a.units.reduce((s, u) => s + u.count, 0) : null
      };
    });
    res.json(attacks);
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;
