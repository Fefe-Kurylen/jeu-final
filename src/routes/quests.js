// Quêtes (décision du 26 octobre 2026) : GET /api/quests, POST /api/quests/:key/claim { cityId }, POST /api/quests/tutorial/skip
const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const auth = require('../middleware/auth');
const quests = require('../services/questService');
const { isId } = require('../utils/db');

const fail = (res, e) => (e.expose ? res.status(e.status).json({ error: e.message }) : sendError(res, e));

router.get('/', auth, async (req, res) => {
  try { res.json(await quests.questsFor(req.user.playerId)); } catch (e) { fail(res, e); }
});

router.post('/tutorial/skip', auth, async (req, res) => {
  try { res.json(await quests.skipTutorial(req.user.playerId)); } catch (e) { fail(res, e); }
});

router.post('/:key/claim', auth, async (req, res) => {
  try {
    const key = String(req.params.key || '');
    if (!/^[\w:]{2,60}$/.test(key)) return res.status(400).json({ error: 'Quête invalide' });
    const { cityId } = req.body || {};
    if (cityId !== undefined && cityId !== null && !isId(cityId)) return res.status(400).json({ error: 'Ville invalide' });
    res.json(await quests.claim(req.user.playerId, key, cityId || null));
  } catch (e) { fail(res, e); }
});

module.exports = router;
