// Bastion d'alliance (décision du 26 octobre 2026) : GET /api/bastion (celui de son alliance), POST /api/bastion/place
// { x, y }, POST /api/bastion/:id/send { armyId, mission: SUPPLY | GARRISON | ATTACK, resources }
const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const auth = require('../middleware/auth');
const bastion = require('../services/bastionService');
const { isId } = require('../utils/db');

const fail = (res, e) => (e.expose ? res.status(e.status).json({ error: e.message }) : e.code === 'NO_ROUTE' ? res.status(400).json({ error: e.message }) : sendError(res, e));

router.get('/', auth, async (req, res) => {
  try { res.json(await bastion.bastionFor(req.user.playerId)); } catch (e) { fail(res, e); }
});
router.post('/place', auth, async (req, res) => {
  try { res.json(await bastion.place(req.user.playerId, req.body?.x, req.body?.y)); } catch (e) { fail(res, e); }
});
router.post('/:id/send', auth, async (req, res) => {
  try {
    const { armyId, mission, resources } = req.body || {};
    if (!isId(req.params.id) || !isId(armyId)) return res.status(400).json({ error: 'Armée et Bastion requis' });
    res.json(await bastion.send(req.user.playerId, req.params.id, { armyId, mission, resources }));
  } catch (e) { fail(res, e); }
});

module.exports = router;
