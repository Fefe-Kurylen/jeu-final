const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const config = require('../config');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { catalog, syncPlayer } = require('../services/purchaseService');
const { entitlementsOf } = require('../services/entitlementService');

// GET /api/purchases/catalog — produits proposés (les prix réels viennent des stores)
router.get('/catalog', (req, res) => res.json({ products: catalog(), serverVerification: !!config.purchases.revenuecatSecret }));

// GET /api/purchases/me — avantages actuels du joueur
router.get('/me', auth, async (req, res) => {
  try {
    const player = await prisma.player.findUnique({ where: { id: req.user.playerId }, select: { premiumUntil: true, cosmetics: true } });
    const purchases = await prisma.purchase.findMany({ where: { playerId: req.user.playerId }, orderBy: { purchasedAt: 'desc' }, select: { productId: true, status: true, purchasedAt: true, expiresAt: true, store: true } });
    res.json({ ...entitlementsOf(player), purchases });
  } catch (e) { sendError(res, e); }
});

// POST /api/purchases/sync — après un achat ou « Restaurer les achats » : le serveur interroge RevenueCat
router.post('/sync', auth, rateLimit(30, 'purchases'), async (req, res) => {
  try {
    const result = await syncPlayer(req.user.playerId);
    if (!result) return res.status(503).json({ error: 'Vérification des achats indisponible (serveur non configuré)' });
    const player = await prisma.player.findUnique({ where: { id: req.user.playerId }, select: { premiumUntil: true, cosmetics: true } });
    res.json({ ...entitlementsOf(player), synced: result.purchases });
  } catch (e) { sendError(res, e); }
});

// POST /api/purchases/webhook — renouvellements, remboursements, expirations (RevenueCat → serveur)
router.post('/webhook', async (req, res) => {
  try {
    const expected = config.purchases.webhookAuth;
    if (!expected || req.headers.authorization !== expected) return res.status(401).json({ error: 'Unauthorized' });
    const appUserId = req.body?.event?.app_user_id;
    if (typeof appUserId === 'string' && appUserId.length <= 64) {
      const exists = await prisma.player.findUnique({ where: { id: appUserId }, select: { id: true } });
      if (exists) await syncPlayer(appUserId);
    }
    res.json({ ok: true });
  } catch (e) { sendError(res, e); }
});

module.exports = router;
