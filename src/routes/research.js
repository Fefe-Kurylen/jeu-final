// ========== RESEARCH ROUTES ==========
// Technologies researched at the Academy, Travian-style small bonuses (data/technologies.json, utils/techEffects.js):
// the player's state, starting a level, cancelling an item. Research is per player; it is paid by the city that hosts
// the Academy and runs one at a time (one more may wait in the queue).
const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { lockCity, debitCity, creditCity, isId } = require('../utils/db');
const T = require('../utils/techEffects');
const { processResearch, startNextQueued, lockResearch } = require('../game/processors/researchProcessor');

const queueOf = (db, playerId) => db.researchQueueItem.findMany({ where: { playerId }, orderBy: [{ status: 'desc' }, { startedAt: 'asc' }] });   // RUNNING first
const academyLevelOf = (buildings) => (buildings || []).reduce((m, b) => (b.key === T.RULES.researchBuilding && b.level > m ? b.level : m), 0);

// What each technology would cost next in this city, and why it cannot start (null when it can)
function availability(levels, buildings, queue) {
  return T.TECHS.map(t => {
    const nextLevel = T.nextLevelFor(t, levels, queue);
    const capped = nextLevel > T.maxLevelOf(t);
    return {
      key: t.key, level: levels[t.key] || 0, nextLevel: capped ? null : nextLevel,
      cost: capped ? null : T.researchCost(t, nextLevel), timeSec: capped ? null : T.researchTimeSec(t, nextLevel, buildings),
      blocker: T.researchBlocker(t, levels, buildings, queue)
    };
  });
}

// GET /api/research?cityId=… — levels, queue and, for a city, the availability of every technology
router.get('/', auth, async (req, res) => {
  try {
    // Due items are applied when the player looks, so a finished research never waits for the next tick
    await processResearch(new Date(), { playerId: req.user.playerId });
    const [rows, queue] = await Promise.all([prisma.playerTechnology.findMany({ where: { playerId: req.user.playerId } }), queueOf(prisma, req.user.playerId)]);
    const levels = T.levelsFrom(rows);
    let city = null;
    const cityId = req.query.cityId;
    if (typeof cityId === 'string' && isId(cityId)) {
      const c = await prisma.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, include: { buildings: { select: { key: true, level: true } } } });
      if (c) city = { id: c.id, academyLevel: academyLevelOf(c.buildings), timeReductionPct: T.researchTimeReductionPct(c.buildings), technologies: availability(levels, c.buildings, queue) };
    }
    res.json({ levels, queue, rules: T.RULES, city });
  } catch (e) { sendError(res, e); }
});

// POST /api/research/start { cityId, techKey } — pays the next level and starts it (or queues it behind the running one)
router.post('/start', auth, async (req, res) => {
  try {
    const { cityId, techKey } = req.body || {};
    if (typeof cityId !== 'string' || !isId(cityId) || typeof techKey !== 'string') return res.status(400).json({ error: 'Ville et technologie requises' });
    const tech = T.techOf(techKey);
    if (!tech) return res.status(400).json({ error: 'Technologie inconnue' });
    const result = await prisma.$transaction(async (tx) => {
      await lockCity(tx, cityId);
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, include: { buildings: { select: { key: true, level: true } } } });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      await lockResearch(tx, city.playerId);   // the queue is shared by all the player's cities
      const rows = await tx.playerTechnology.findMany({ where: { playerId: city.playerId } });
      const queue = await tx.researchQueueItem.findMany({ where: { playerId: city.playerId } });
      const blocker = T.researchBlocker(tech, rows, city.buildings, queue);
      if (blocker) return { error: blocker, status: 400 };
      const targetLevel = T.nextLevelFor(tech, rows, queue);
      const cost = T.researchCost(tech, targetLevel);
      if (!(await debitCity(tx, city.id, cost))) {
        return { error: 'Ressources insuffisantes', status: 400, cost, have: { wood: Math.floor(city.wood), stone: Math.floor(city.stone), iron: Math.floor(city.iron), food: Math.floor(city.food) } };
      }
      const durationSec = T.researchTimeSec(tech, targetLevel, city.buildings);
      const now = new Date();
      const running = queue.some(q => q.status === 'RUNNING');
      // Behind the running research: starts when the last item of the queue ends
      const startAt = running ? new Date(Math.max(now.getTime(), ...queue.map(q => new Date(q.endsAt).getTime()))) : now;
      const endsAt = new Date(startAt.getTime() + durationSec * 1000);
      const queueItem = await tx.researchQueueItem.create({ data: { playerId: city.playerId, cityId: city.id, techKey: tech.key, targetLevel, cost, startedAt: startAt, endsAt, status: running ? 'QUEUED' : 'RUNNING' } });
      return { message: running ? 'Recherche ajoutée à la file' : 'Recherche lancée', queueItem, durationSec, cost };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// DELETE /api/research/:itemId — cancel: full refund while queued, half once started (same rule as constructions).
// Later levels of the same technology waiting in the queue depend on it and are cancelled (and refunded) too.
router.delete('/:itemId', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.researchQueueItem.findFirst({ where: { id: req.params.itemId, playerId: req.user.playerId } });
      if (!item) return { error: 'Recherche introuvable (déjà terminée ?)', status: 404 };
      await lockCity(tx, item.cityId);
      await lockResearch(tx, item.playerId);
      const later = await tx.researchQueueItem.findMany({ where: { playerId: item.playerId, techKey: item.techKey, targetLevel: { gt: item.targetLevel } } });
      const refund = { wood: 0, stone: 0, iron: 0, food: 0 };
      let cancelled = 0;
      for (const q of [item, ...later]) {
        const removed = await tx.researchQueueItem.deleteMany({ where: { id: q.id, status: q.status } });
        if (removed.count !== 1) continue;   // finished meanwhile: nothing to refund
        cancelled++;
        const paid = q.cost && typeof q.cost === 'object' ? q.cost : T.researchCost(T.techOf(q.techKey), q.targetLevel);
        const part = T.scaleCost(paid, q.status === 'QUEUED' ? 1 : T.RULES.refundRateStarted);
        for (const k of Object.keys(refund)) refund[k] += part[k] || 0;
      }
      if (!cancelled) return { error: 'Recherche introuvable (déjà terminée ?)', status: 404 };
      await creditCity(tx, item.cityId, refund);
      await startNextQueued(tx, item.playerId, new Date());
      return { message: 'Recherche annulée', cancelled, refund };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

module.exports = router;
