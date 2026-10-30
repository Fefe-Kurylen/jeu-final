// Invasions barbares (décision du 29 octobre 2026, services/hordeService.js)
// GET  /api/invasion                 invasion en cours (ou la dernière), donjons restants par niveau, alliances, mes dégâts
// GET  /api/invasion/horde/:nodeId   un donjon : étages, garnison, trésor, contributeurs
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const H = require('../services/hordeService');
const { sendError } = require('../utils/httpError');

router.get('/invasion', auth, async (req, res) => {
  try { res.json(await H.invasionState(req.user.playerId)); } catch (e) { sendError(res, e); }
});
router.get('/invasion/horde/:nodeId', auth, async (req, res) => {
  try {
    const v = await H.hordeView(req.params.nodeId, req.user.playerId);
    if (!v) return res.status(404).json({ error: 'Donjon introuvable (détruit ou reparti)' });
    res.json(v);
  } catch (e) { sendError(res, e); }
});

module.exports = router;
