const express = require('express');
const { isPremium } = require('../services/entitlementService');
const router = express.Router();
const W = require('../services/woundedService');
const { sendError, sendFail } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { unitsData, buildingsData, factionsData } = require('../config/gamedata');
const { getCityTier, getCityTierName, getFactionBonus, mainHallLevelOf, buildCostFor, buildSecondsFor, recruitCostFor, baseTrainSecondsFor } = require('../utils/calculations');
const { lockCity, lockPlayerCities, debitPlayer, creditPlayer, missingMessage, stockTotals, capitalBuildingsOf, isId } = require('../utils/db');
const { getRelation, sameAllianceAs, outsideAlliance, allianceRowsOf } = require('../services/diplomacyService');
const { engineCount } = require('../game/processors/siegeProcessor');
const { assaultsToFall, assaultsLeft } = require('../services/conquestService');
const fx = require('../utils/buildingEffects');
const T = require('../utils/techEffects');   // technologies (Ingénierie, Entraînement)
const { processBuilds, promoteQueued } = require('../game/processors/buildProcessor');
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

// Stock partagé (décision du 30 octobre 2026) : une dépense refusée dit ce qui manque, toutes les villes comprises
const refused = (paid, cost) => ({ error: missingMessage(paid), status: 400, cost, missing: paid.missing });
const scaleCost = (cost, rate) => Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.floor(v * rate)]));

// GET /api/cities
router.get('/', auth, async (req, res) => {
  try {
    await settleDueQueues(req.user.playerId);
    const cities = await prisma.city.findMany({
      where: { playerId: req.user.playerId },
      include: { buildings: true, buildQueue: { orderBy: { startedAt: 'asc' } }, recruitQueue: { orderBy: { startedAt: 'asc' } }, armies: { include: { units: true } } }
    });
    // bilan de nourriture calculé par le serveur (réductions d'entretien, siège), le même que le tick
    const balance = await require('../game/processors/resourceProcessor').foodBalance(cities.map(c => c.id)).catch(() => new Map());
    // stock de toutes les villes réunies : les dépenses y puisent (barre de ressources, boutons et prix du client)
    const playerStock = stockTotals(cities);
    const citiesWithTier = cities.map(city => {
      const wallLevel = city.buildings.find(b => b.key === 'WALL')?.level || 0;
      const mainHallLevel = mainHallLevelOf(city.buildings);
      const cityTier = getCityTier(mainHallLevel);
      return { ...city, wallLevel, mainHallLevel, cityTier, cityTierName: getCityTierName(cityTier), foodBalance: balance.get(city.id) || null, playerStock };
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
      const cities = await lockPlayerCities(tx, req.user.playerId);   // le prix peut venir de toutes les villes
      const city = await tx.city.findFirst({
        where: { id: req.params.id, playerId: req.user.playerId },
        include: { buildings: true, buildQueue: true, player: true }
      });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      // bâtiments « capitale seulement » : prérequis et réduction du temps lus dans la capitale (fx.withCapital)
      const capitalBuildings = city.isCapital ? null : await capitalBuildingsOf(tx, city.playerId);
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
        const levelFor = (p) => Math.max(maxBuildingLevel(city.buildings, p.key), capitalBuildings && fx.capitalOnly(p.key) ? maxBuildingLevel(capitalBuildings, p.key) : 0);
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
      const cost = scaleCost(buildCostFor(buildingDef, targetLevel), T.techReductionMult(techLevels, 'buildCostReductionPct'));
      const paid = await debitPlayer(tx, city.playerId, city.id, cost, cities);
      if (!paid.ok) return refused(paid, cost);

      let durationSec = buildSecondsFor(buildingDef, targetLevel);
      const buildTimeBonus = getFactionBonus(city.player.faction, 'buildTimeReduction', factionsData);
      if (buildTimeBonus > 0) durationSec = Math.floor(durationSec * (1 - buildTimeBonus / 100));
      // Bâtiment principal de la ville, Académie et Résidence de la capitale : réduction du temps (buildTimeReductionPctPerLevel)
      durationSec = Math.floor(durationSec * (1 - fx.buildTimeReductionPct(fx.withCapital(city.buildings, capitalBuildings)) / 100));
      durationSec = Math.max(1, durationSec);

      const now = new Date();
      const running = city.buildQueue.filter(b => b.status === 'RUNNING');
      // un niveau dont le précédent est encore dans la file attend sa fin : jamais deux niveaux d'un bâtiment à la fois
      const sameEnd = city.buildQueue.filter(b => b.buildingKey === buildingKey && b.slot === buildSlot).reduce((m, b) => Math.max(m, new Date(b.endsAt).getTime()), 0);
      let startAt = now, status = 'RUNNING';
      if (running.length >= MAX_RUNNING || sameEnd > 0) {
        // Starts when the latest item of the queue ends (queued items run after the running ones)
        const lastEnd = running.length >= MAX_RUNNING ? city.buildQueue.reduce((m, b) => Math.max(m, new Date(b.endsAt).getTime()), now.getTime()) : Math.max(now.getTime(), sameEnd);
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
    sendError(res, e, 'build');
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
      const cities = await lockPlayerCities(tx, req.user.playerId);   // le prix peut venir de toutes les villes
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
      const cost = recruitCostFor(unit, count);
      const paid = await debitPlayer(tx, city.playerId, city.id, cost, cities);
      if (!paid.ok) return refused(paid, cost);

      // Per-class base time with tier multiplier (GDD unit_training_times.json), reduced by the buildings that train it in
      // this city (Caserne de la capitale, Grande caserne d'une colonie)
      // Entraînement (technologie) : −1 % de temps de recrutement par niveau, après les bâtiments
      const techLevels = T.levelsFrom(await tx.playerTechnology.findMany({ where: { playerId: city.playerId } }));
      const timePerUnit = Math.max(1, Math.round(baseTrainSecondsFor(unit) * (1 - fx.trainTimeReductionPct(city.buildings, unit.class) / 100) * T.techReductionMult(techLevels, 'trainTimeReductionPct')));
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
      const cities = await lockPlayerCities(tx, req.user.playerId);   // le prix peut venir de toutes les villes
      const city = await tx.city.findFirst({ where: { id: req.params.id, playerId: req.user.playerId }, include: { buildings: true, recruitQueue: true } });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      if (!city.isCapital) return { error: 'Les colons se forment à la Résidence de la capitale', status: 400 };
      const residence = city.buildings.find(b => b.key === 'RESIDENCE');
      if (!residence) return { error: 'Résidence requise', status: 400 };
      const slots = Math.min(config.city.maxSecondaryCities, fx.settlerSlots(residence.level));
      if (slots <= 0) return { error: 'Résidence niveau 10 requise pour former un colon', status: 400 };
      // la Ville Merveille est hors quota de colonies (décision du 28 octobre 2026), comme à la fondation
      const colonies = await tx.city.count({ where: { playerId: city.playerId, isCapital: false, isWonder: false } });
      const travelling = await tx.army.aggregate({ where: { ownerId: city.playerId }, _sum: { settlers: true } });
      const training = city.recruitQueue.filter(q => q.unitKey === 'SETTLER').reduce((s, q) => s + q.count, 0);
      const pending = city.settlers + (travelling._sum.settlers || 0) + training;
      const used = colonies + pending;
      // un colon de plus pour la Ville Merveille quand toutes les places sont prises par des colonies fondées (la
      // fondation d'une colonie le refuse alors) et qu'aucun colon n'attend
      const forWonder = used >= slots && colonies >= slots && pending === 0 && !(await tx.city.count({ where: { playerId: city.playerId, isWonder: true } }));
      if (used >= slots && !forWonder) {
        const next = slots >= 3 ? null : slots === 2 ? 20 : 15;
        return { error: next ? `Tous vos colons sont engagés (${slots}) : Résidence niveau ${next} pour le suivant` : `Limite atteinte : ${slots} villes secondaires au plus`, status: 400 };
      }
      const cost = fx.settlerCost();
      const paid = await debitPlayer(tx, city.playerId, city.id, cost, cities);
      if (!paid.ok) return refused(paid, cost);
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
// Le remboursement va à la ville, puis ce qui n'y tient pas aux autres villes du joueur (creditPlayer).
router.delete('/:id/build/:itemId', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const cities = await lockPlayerCities(tx, req.user.playerId);
      const city = cities.find(c => c.id === req.params.id);
      if (!city) return { error: 'Ville non trouvee', status: 404 };
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
        const part = scaleCost(def ? scaleCost(buildCostFor(def, q.targetLevel), techMult) : { wood: 0, stone: 0, iron: 0, food: 0 }, q.status === 'QUEUED' ? 1 : 0.5);
        for (const k of Object.keys(refund)) refund[k] += part[k];
      }
      await creditPlayer(tx, req.user.playerId, city.id, refund, cities);
      await promoteQueued(tx, city.id, new Date());
      return { message: 'Construction annulée', cancelled: toCancel.length, refund };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// DELETE /api/city/:id/recruit/:itemId — cancel a recruit batch (troops or settler): half of its cost comes back (to the
// city, then to the player's other cities, creditPlayer), the batches scheduled after it in the same building start earlier
router.delete('/:id/recruit/:itemId', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const cities = await lockPlayerCities(tx, req.user.playerId);
      const city = cities.find(c => c.id === req.params.id);
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      const item = await tx.recruitQueueItem.findFirst({ where: { id: req.params.itemId, cityId: city.id } });
      if (!item) return { error: 'Recrutement introuvable (déjà terminé ?)', status: 404 };
      const removed = await tx.recruitQueueItem.deleteMany({ where: { id: item.id, status: 'RUNNING' } });
      if (removed.count !== 1) return { error: 'Recrutement déjà terminé', status: 409 };
      const unit = unitsData.find(u => u.key === item.unitKey);
      const paidCost = item.unitKey === 'SETTLER' ? scaleCost(fx.settlerCost(), item.count) : unit ? recruitCostFor(unit, item.count) : { wood: 0, stone: 0, iron: 0, food: 0 };
      const refund = scaleCost(paidCost, 0.5);
      await creditPlayer(tx, req.user.playerId, city.id, refund, cities);
      // the batches after it move up by the time it still occupied (all of it if it had not started, what was left of it
      // if it was training), start and end together: their own length, siege pauses included, is kept
      const nowMs = Date.now();
      // the batch ahead of the cancelled one still trains until its end: the next ones never start before it
      const prevEnd = (await tx.recruitQueueItem.findMany({ where: { cityId: city.id, buildingKey: item.buildingKey, endsAt: { lt: item.endsAt } }, select: { endsAt: true } })).reduce((m, q) => Math.max(m, new Date(q.endsAt).getTime()), 0);
      const floor = Math.max(nowMs, prevEnd);
      const shiftMs = Math.max(0, new Date(item.endsAt).getTime() - Math.max(floor, new Date(item.startedAt).getTime()));
      const later = await tx.recruitQueueItem.findMany({ where: { cityId: city.id, buildingKey: item.buildingKey, startedAt: { gte: item.startedAt } } });
      for (const q of later) {
        // the whole batch moves up by the time freed; its start never goes before now nor before the batch ahead
        const start = new Date(q.startedAt).getTime(), end = new Date(q.endsAt).getTime();
        await tx.recruitQueueItem.update({ where: { id: q.id }, data: { startedAt: new Date(Math.max(floor, start - shiftMs)), endsAt: new Date(Math.max(floor, end - shiftMs)) } });
      }
      return { message: 'Recrutement annulé', refund };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// ---- Blessés (décision du 30 octobre 2026, services/woundedService.js) : une seule Tente de soins, dans la capitale, pour
// les blessés de toutes les villes ; soin payant (stock de toutes les villes), soin immédiat à l'or ----
// GET /api/city/:id/wounded — les blessés de toutes les villes du joueur (chaque ligne dit sa ville)
router.get('/:id/wounded', auth, async (req, res) => {
  try {
    const city = await prisma.city.findFirst({ where: { id: req.params.id, playerId: req.user.playerId }, select: { id: true } });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });
    res.json(await W.woundedView(req.user.playerId));
  } catch (e) {
    sendError(res, e);
  }
});

// POST /api/city/:id/wounded/start { unitKey, count? } — lance le soin des blessés de la ville qui attendent (tous, ou `count`)
router.post('/:id/wounded/start', auth, async (req, res) => {
  try {
    const { unitKey, count } = req.body || {};
    if (!unitKey || typeof unitKey !== 'string') return res.status(400).json({ error: 'unitKey requis' });
    if (count !== undefined && (!Number.isInteger(count) || count < 1)) return res.status(400).json({ error: 'Nombre invalide' });
    const result = await prisma.$transaction(async (tx) => {
      const cities = await lockPlayerCities(tx, req.user.playerId);   // lits et prix comptés pour tout le joueur
      if (!cities.some(c => c.id === req.params.id)) return { error: 'Ville non trouvée', status: 404 };
      return W.startHealing(tx, req.user.playerId, req.params.id, unitKey, count, cities);
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json({ message: `Soin de ${result.started} blessé${result.started > 1 ? 's' : ''} lancé`, ...result });
  } catch (e) {
    sendFail(res, e);
  }
});

// POST /api/city/:id/wounded/heal { unitKey } — soin immédiat des blessés au lit, en or selon le palier de l'unité
router.post('/:id/wounded/heal', auth, async (req, res) => {
  try {
    const { unitKey } = req.body || {};
    if (!unitKey || typeof unitKey !== 'string') return res.status(400).json({ error: 'unitKey requis' });
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: req.params.id, playerId: req.user.playerId }, select: { id: true } });
      if (!city) return { error: 'Ville non trouvée', status: 404 };
      await lockCity(tx, city.id);   // garnison de la ville
      return { success: true, ...(await W.healNow(tx, req.user.playerId, city.id, unitKey)) };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    sendFail(res, e);
  }
});

// GET /api/city/:id/siege — the armies camped before a city (anyone can see a siege: it happens in the open)
router.get('/:id/siege', auth, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Ville invalide' });
    const city = await prisma.city.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, x: true, y: true, playerId: true, isCapital: true, wallHp: true, wallMaxHp: true, wallStructure: true, isSieged: true, player: { select: { faction: true } }, buildings: { where: { key: 'WALL' }, select: { level: true } } } });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });
    const camp = await prisma.army.findMany({ where: { status: 'BESIEGING', targetCityId: city.id }, orderBy: { arrivalAt: 'asc' }, select: { id: true, name: true, ownerId: true, departedAt: true, arrivalAt: true, missionType: true, owner: { select: { name: true, faction: true } }, units: { select: { unitKey: true, count: true } } } });
    // a siege happens in the open; a city that is not besieged shows nothing to other players (no free spying of its wall)
    if (!camp.length && city.playerId !== req.user.playerId) return res.json({ cityId: city.id, cityName: city.name, besieged: false });
    // the same two rules as POST /army/:id/break-siege: any army (a sortie from the walls, an army of another city or
    // another player) attacks the camps the diplomacy lets it attack; the city's own armies coming home from outside
    // must fight every camp outside their alliance (forced fight, any diplomacy)
    const voluntary = new Set(), forced = new Set();
    const campOwners = [...new Set(camp.map(a => a.ownerId))].filter(id => id !== req.user.playerId);
    for (const id of campOwners) if ((await getRelation(req.user.playerId, id)).canAttack) voluntary.add(id);
    // alliances du joueur, de la ville et du camp lues une fois : combat forcé et délai avant la bataille
    // (même règle que campsOutsideAlliance de routes/armies.js : prédicats partagés de diplomacyService)
    const members = await allianceRowsOf([req.user.playerId, city.playerId, ...camp.map(a => a.ownerId)]);
    const sameAlliance = sameAllianceAs(members, req.user.playerId);
    if (city.playerId === req.user.playerId) for (const id of outsideAlliance(members, req.user.playerId, campOwners)) forced.add(id);
    const wallLevel = city.buildings[0]?.level || 0;
    // the time left before the battle is for the players concerned and their alliances only (décision du 25 octobre 2026)
    const isConcerned = (ids) => ids.some(id => id === req.user.playerId || sameAlliance(id));
    const seesDefense = isConcerned([city.playerId]);
    res.json({
      cityId: city.id, cityName: city.name, besieged: camp.length > 0, wallLevel,
      // PV du mur au prochain combat (sa part des vies restantes) ; vies restantes avant la chute
      wallHp: wallLevel > 0 ? Math.round((city.wallMaxHp || 0) * (city.wallStructure ?? 1)) : 0, wallMaxHp: wallLevel > 0 ? city.wallMaxHp : 0,
      wallStructurePct: Math.round((city.wallStructure ?? 1) * 100), livesLeft: assaultsLeft(city, city.player?.faction), livesTotal: assaultsToFall(city, city.player?.faction),
      fate: city.isCapital ? 'RELOCATED' : 'RAZED',
      x: city.x, y: city.y,
      canSortie: voluntary.size > 0, canForce: forced.size > 0, canBreak: voluntary.size > 0 || forced.size > 0,
      besiegers: camp.map(a => {
        const sees = seesDefense || isConcerned([a.ownerId]);
        return {
          id: a.id, name: a.name, owner: a.owner?.name, faction: a.owner?.faction, mine: a.ownerId === req.user.playerId,
          startedAt: a.departedAt, assaultAt: sees ? a.arrivalAt : null,
          soldiers: a.units.reduce((t, u) => t + u.count, 0), engines: engineCount(a.units)
        };
      })
    });
  } catch (e) { sendError(res, e); }
});

// GET /api/city/incoming-attacks
router.get('/incoming-attacks', auth, async (req, res) => {
  try {
    const playerCities = await prisma.city.findMany({
      where: { playerId: req.user.playerId },
      select: { id: true, name: true, x: true, y: true, isCapital: true, buildings: { where: { key: 'WATCHTOWER' }, select: { level: true } } }
    });
    const cityIds = playerCities.map(c => c.id);
    // Tour de guet « capitale seulement » (décision du 30 octobre 2026) : sa tour veille sur toutes les villes du joueur
    const watchtower = playerCities.find(c => c.isCapital)?.buildings?.[0]?.level || 0;

    const incomingArmies = await prisma.army.findMany({
      where: { targetCityId: { in: cityIds }, OR: [{ status: { in: ['ATTACKING', 'RAIDING'] }, missionType: { not: 'BREAK_SIEGE' }, arrivalAt: { gt: new Date() } }, { status: 'BESIEGING' }] },
      select: { id: true, status: true, arrivalAt: true, targetCityId: true, missionType: true, owner: { select: { name: true } }, units: { select: { count: true } } },
      orderBy: { arrivalAt: 'asc' }
    });

    const attacks = incomingArmies.map(a => {
      const targetCity = playerCities.find(c => c.id === a.targetCityId);
      return {
        // a siege is visible from the walls: its leader and its assault time are always known
        id: a.id, type: a.status === 'BESIEGING' ? 'SIEGE' : (a.missionType || a.status), arrivalAt: a.arrivalAt, targetCity: targetCity?.name || 'Ville', targetCityId: a.targetCityId,
        attacker: a.status === 'BESIEGING' || watchtower >= fx.watchtowerShowsAttackerAt() ? a.owner?.name : null,
        units: watchtower >= fx.watchtowerShowsDetailsAt() ? a.units.reduce((s, u) => s + u.count, 0) : null
      };
    });
    res.json(attacks);
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;
