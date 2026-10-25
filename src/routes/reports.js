const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');

router.get('/battles', auth, async (req, res) => {
  try {
    const reports = await prisma.battleReport.findMany({ where: { playerId: req.user.playerId }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(reports);
  } catch (e) { sendError(res, e); }
});

// One report of the player, by id (the link of a notification may point to a report older than the lists)
router.get('/battles/:id', auth, async (req, res) => {
  try {
    const report = await prisma.battleReport.findFirst({ where: { id: String(req.params.id), playerId: req.user.playerId } });
    if (!report) return res.status(404).json({ error: 'Rapport introuvable' });
    res.json(report);
  } catch (e) { sendError(res, e); }
});
router.get('/spy/:id', auth, async (req, res) => {
  try {
    const report = await prisma.spyReport.findFirst({ where: { id: String(req.params.id), playerId: req.user.playerId } });
    if (!report) return res.status(404).json({ error: 'Rapport introuvable' });
    res.json(report);
  } catch (e) { sendError(res, e); }
});

router.get('/spy', auth, async (req, res) => {
  try {
    const reports = await prisma.spyReport.findMany({ where: { playerId: req.user.playerId }, orderBy: { createdAt: 'desc' }, take: 30 });
    res.json(reports);
  } catch (e) { sendError(res, e); }
});

router.get('/trade', auth, async (req, res) => {
  try {
    const trades = await prisma.marketOffer.findMany({
      where: { status: 'COMPLETED', OR: [{ sellerId: req.user.playerId }, { buyerId: req.user.playerId }] },
      orderBy: { createdAt: 'desc' }, take: 30
    });
    res.json(trades);
  } catch (e) { sendError(res, e); }
});

module.exports = router;
