const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');

router.get('/battles', auth, async (req, res) => {
  try {
    const reports = await prisma.battleReport.findMany({ where: { playerId: req.user.playerId }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(reports);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/spy', auth, async (req, res) => {
  try {
    const reports = await prisma.spyReport.findMany({ where: { playerId: req.user.playerId }, orderBy: { createdAt: 'desc' }, take: 30 });
    res.json(reports);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/trade', auth, async (req, res) => {
  try {
    const trades = await prisma.marketOffer.findMany({
      where: { status: 'COMPLETED', OR: [{ sellerId: req.user.playerId }, { buyerId: req.user.playerId }] },
      orderBy: { createdAt: 'desc' }, take: 30
    });
    res.json(trades);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
