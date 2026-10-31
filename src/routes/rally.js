// Rassemblements d'alliance contre les donjons d'invasion, les sites et plans de Merveille gardés par les Immortels
// (30 octobre 2026) et les Bastions ennemis (décision du 29 octobre 2026, services/rallyService.js)
// GET  /api/rallies?nodeId=&bastionId=   rassemblements de mon alliance en cours (tous, ou ceux d'une cible) ; kind :
//                                        HORDE, WONDER, PLAN ou BASTION ; maxArmies : armées au plus dans un
//                                        rassemblement que je lance (Place de rassemblement de ma capitale)
// POST /api/rallies { armyId, nodeId | bastionId, waitMinutes }   lancer (attente 5, 10, 30 ou 60 min) ; nodeId : un
//                                        donjon, un site ou un plan de Merveille gardé
// POST /api/rallies/:id/join { armyId }               envoyer une armée
// POST /api/rallies/:id/leave                         retirer son armée
// POST /api/rallies/:id/cancel                        annuler (le lanceur)
// POST /api/rallies/:id/launch                        partir maintenant (le lanceur)
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const R = require('../services/rallyService');
const { sendFail } = require('../utils/httpError');
const prisma = require('../config/database');
const fx = require('../utils/buildingEffects');
const { capitalBuildingsOf } = require('../utils/db');
const fail = (res, e) => sendFail(res, e, { noRoute: true, context: 'rally' });   // pas de chemin vers le lanceur : 400

router.get('/rallies', auth, async (req, res) => {
  try {
    // taille d'un rassemblement (décision du 31 octobre 2026) : le niveau de la Place de rassemblement du lanceur
    const maxArmies = fx.rallyMaxArmies(fx.levelOf(await capitalBuildingsOf(prisma, req.user.playerId), 'RALLY_POINT'));
    res.json({ ...(await R.listForPlayer(req.user.playerId, req.query.nodeId || null, req.query.bastionId || null)), waits: R.WAITS, maxArmies });
  } catch (e) { fail(res, e); }
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
