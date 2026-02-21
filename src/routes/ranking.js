const express = require('express');
const router = express.Router();
const prisma = require('../config/database');

router.get('/players', async (req, res) => {
  try {
    const players = await prisma.player.findMany({ orderBy: { population: 'desc' }, take: 50, select: { id: true, name: true, faction: true, population: true, alliance: { select: { alliance: { select: { tag: true } } } } } });
    res.json(players);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/alliances', async (req, res) => {
  try {
    const alliances = await prisma.alliance.findMany({ include: { members: { include: { player: { select: { population: true } } } } } });
    const ranked = alliances.map(a => ({ id: a.id, name: a.name, tag: a.tag, members: a.members.length, population: a.members.reduce((sum, m) => sum + m.player.population, 0) })).sort((a, b) => b.population - a.population);
    res.json(ranked);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
