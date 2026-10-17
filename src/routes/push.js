const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { configured } = require('../services/pushService');

const PLATFORMS = new Set(['ios', 'android', 'web']);

// POST /api/push/register { token, platform } — jeton d'appareil du joueur connecté
router.post('/register', auth, async (req, res) => {
  try {
    const { token, platform } = req.body || {};
    if (typeof token !== 'string' || token.length < 8 || token.length > 512) return res.status(400).json({ error: 'Jeton invalide' });
    if (!PLATFORMS.has(platform)) return res.status(400).json({ error: 'Plateforme invalide' });
    await prisma.pushToken.upsert({
      where: { token },
      update: { playerId: req.user.playerId, platform, lastSeenAt: new Date() },
      create: { token, platform, playerId: req.user.playerId }
    });
    res.json({ ok: true, delivery: configured() ? 'enabled' : 'server_not_configured' });
  } catch (e) { sendError(res, e); }
});

// DELETE /api/push/register { token } — déconnexion de l'appareil
router.delete('/register', auth, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (typeof token === 'string') await prisma.pushToken.deleteMany({ where: { token, playerId: req.user.playerId } });
    res.json({ ok: true });
  } catch (e) { sendError(res, e); }
});

module.exports = router;
