// Cycle du serveur et Merveille (décision du 28 octobre 2026, services/wonderService.js, hallOfFameService.js)
// GET  /api/world/state            calendrier du monde (jour, inscriptions, phases de la Merveille, fin)
// GET  /api/world/hall-of-fame     Panthéon des mondes terminés
// POST /api/world/join { faction } rejoindre le monde en cours (comptes gardés d'un monde précédent)
// GET  /api/wonder                 les Villes Merveille du monde, ses plans
// GET  /api/wonder/:cityId         une Ville Merveille (niveau, stock, prochain niveau)
// POST /api/wonder/:cityId/build   lancer le niveau suivant
const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const WS = require('../services/wonderService');
const HF = require('../services/hallOfFameService');
const { isId } = require('../utils/db');
const { validateFaction } = require('../utils/validation');

const fail = (res, e) => (e.expose ? res.status(e.status).json({ error: e.message }) : sendError(res, e));

router.get('/world/state', async (req, res) => {
  try { res.json(await WS.worldState()); } catch (e) { sendError(res, e); }
});
router.get('/world/hall-of-fame', async (req, res) => {
  try { res.json(await HF.hallOfFame()); } catch (e) { sendError(res, e); }
});
router.post('/world/join', auth, async (req, res) => {
  try {
    const faction = String(req.body?.faction || '').toUpperCase();
    if (!validateFaction(faction)) return res.status(400).json({ error: 'Civilisation invalide' });
    res.json(await HF.joinWorld(req.user.playerId, faction));
  } catch (e) { if (e.message === WS.PREPARING) res.set('Retry-After', '10'); fail(res, e); }   // monde suivant en préparation
});

router.get('/wonder', auth, async (req, res) => {
  try {
    const cities = await prisma.city.findMany({ where: { isWonder: true }, orderBy: [{ wonderLevel: 'desc' }, { name: 'asc' }], include: { player: { select: { id: true, name: true, alliance: { select: { alliance: { select: { id: true, tag: true, name: true } } } } } } } });
    const plans = await prisma.wonderPlan.findMany({ where: { holderId: { not: null } } });
    const holders = new Map((await prisma.player.findMany({ where: { id: { in: plans.map(p => p.holderId) } }, select: { id: true, name: true, alliance: { select: { alliance: { select: { tag: true } } } } } })).map(p => [p.id, p]));
    res.json({
      state: await WS.worldState(),
      wonders: cities.map(c => ({ cityId: c.id, name: c.name, x: c.x, y: c.y, level: c.wonderLevel, building: !!c.wonderBuildEndsAt, owner: { id: c.player.id, name: c.player.name }, alliance: c.player.alliance?.alliance || null })),
      plans: plans.map(p => ({ id: p.id, holder: holders.get(p.holderId)?.name || null, allianceTag: holders.get(p.holderId)?.alliance?.alliance?.tag || null, mine: p.holderId === req.user.playerId }))
    });
  } catch (e) { sendError(res, e); }
});
router.get('/wonder/:cityId', auth, async (req, res) => {
  try {
    if (!isId(req.params.cityId)) return res.status(400).json({ error: 'Ville invalide' });
    const v = await WS.wonderView(req.params.cityId, req.user.playerId);
    if (!v) return res.status(404).json({ error: 'Ville Merveille introuvable' });
    res.json(v);
  } catch (e) { sendError(res, e); }
});
router.post('/wonder/:cityId/build', auth, async (req, res) => {
  try {
    if (!isId(req.params.cityId)) return res.status(400).json({ error: 'Ville invalide' });
    res.json(await WS.startLevel(req.user.playerId, req.params.cityId));
  } catch (e) { fail(res, e); }
});

module.exports = router;
