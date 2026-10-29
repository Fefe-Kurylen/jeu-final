// Rassemblements d'alliance contre les donjons d'invasion (décision du 29 octobre 2026, services/rallyService.js)
// GET  /api/rallies?nodeId=          rassemblements de mon alliance en cours (tous, ou ceux d'un donjon)
// POST /api/rallies { armyId, nodeId, waitMinutes }   lancer (attente 5, 10, 30 ou 60 min)
// POST /api/rallies/:id/join { armyId }               envoyer une armée
// POST /api/rallies/:id/leave                         retirer son armée
// POST /api/rallies/:id/cancel                        annuler (le lanceur)
// POST /api/rallies/:id/launch                        partir maintenant (le lanceur)
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const R = require('../services/rallyService');
const { sendError } = require('../utils/httpError');
const fail = (res, e) => (e?.status && e.expose ? res.status(e.status).json({ error: e.message }) : sendError(res, e));

router.get('/rallies', auth, async (req, res) => {
  try { res.json({ ...(await R.listForPlayer(req.user.playerId, req.query.nodeId || null)), waits: R.WAITS }); } catch (e) { fail(res, e); }
});
router.post('/rallies', auth, async (req, res) => {
  try { res.json(await R.launch(req.user.playerId, req.body || {})); } catch (e) { fail(res, e); }
});
router.post('/rallies/:id/join', auth, async (req, res) => {
  try { res.json(await R.join(req.user.playerId, req.params.id, req.body?.armyId)); } catch (e) { fail(res, e); }
});
router.post('/rallies/:id/leave', auth, async (req, res) => {
  try { res.json(await R.leave(req.user.playerId, req.params.id)); } catch (e) { fail(res, e); }
});
router.post('/rallies/:id/cancel', auth, async (req, res) => {
  try { res.json(await R.cancel(req.user.playerId, req.params.id)); } catch (e) { fail(res, e); }
});
router.post('/rallies/:id/launch', auth, async (req, res) => {
  try { res.json(await R.launchNow(req.user.playerId, req.params.id)); } catch (e) { fail(res, e); }
});

module.exports = router;
