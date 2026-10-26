// Espions (décision du 26 octobre 2026) : GET /api/spies, POST /api/spies/recruit { slot },
// POST /api/spies/send { fromCityId, targetCityId, mission } | { fromCityId, targetNodeId }, POST /api/spies/:id/recall
const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const auth = require('../middleware/auth');
const spies = require('../services/spyService');
const { isId } = require('../utils/db');

const fail = (res, e) => (e.expose ? res.status(e.status).json({ error: e.message }) : e.code === 'NO_ROUTE' ? res.status(400).json({ error: e.message }) : sendError(res, e));
const optId = (v) => v === undefined || v === null || isId(v);

router.get('/', auth, async (req, res) => {
  try { res.json(await spies.spiesOf(req.user.playerId)); } catch (e) { fail(res, e); }
});
router.post('/recruit', auth, async (req, res) => {
  try { res.json(await spies.recruit(req.user.playerId, Number(req.body?.slot))); } catch (e) { fail(res, e); }
});
router.post('/send', auth, async (req, res) => {
  try {
    const { fromCityId, targetCityId, targetNodeId, mission } = req.body || {};
    if (![fromCityId, targetCityId, targetNodeId].every(optId) || (!targetCityId && !targetNodeId)) return res.status(400).json({ error: 'Cible requise' });
    res.json(await spies.send(req.user.playerId, { fromCityId, targetCityId, targetNodeId, mission }));
  } catch (e) { fail(res, e); }
});
router.post('/:id/recall', auth, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Espion invalide' });
    res.json(await spies.recall(req.user.playerId, req.params.id));
  } catch (e) { fail(res, e); }
});

module.exports = router;
