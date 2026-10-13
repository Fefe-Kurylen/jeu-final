const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');

const playerSelect = { id: true, name: true, faction: true, population: true, alliance: { select: { alliance: { select: { tag: true } } } } };

router.get('/players', async (req, res) => {
  try {
    const players = await prisma.player.findMany({ orderBy: { population: 'desc' }, take: 50, select: playerSelect });
    res.json(players);
  } catch (e) { sendError(res, e); }
});

router.get('/alliances', async (req, res) => {
  try {
    const alliances = await prisma.alliance.findMany({ include: { members: { include: { player: { select: { population: true } } } } }, take: 200 });
    const ranked = alliances.map(a => ({ id: a.id, name: a.name, tag: a.tag, members: a.members.length, population: a.members.reduce((sum, m) => sum + m.player.population, 0) })).sort((a, b) => b.population - a.population).slice(0, 50);
    res.json(ranked);
  } catch (e) { sendError(res, e); }
});

// Attack / defense rankings come from PlayerStats (attacksWon / defensesWon)
async function statsRanking(field) {
  const rows = await prisma.playerStats.findMany({ where: { [field]: { gt: 0 } }, orderBy: { [field]: 'desc' }, take: 50, include: { player: { select: playerSelect } } });
  return rows.map(r => ({ ...r.player, attacksWon: r.attacksWon, defensesWon: r.defensesWon, raidsWon: r.raidsWon, unitsKilled: r.unitsKilled, value: r[field] }));
}
router.get('/attackers', async (req, res) => {
  try { res.json(await statsRanking('attacksWon')); } catch (e) { sendError(res, e); }
});
router.get('/defenders', async (req, res) => {
  try { res.json(await statsRanking('defensesWon')); } catch (e) { sendError(res, e); }
});

module.exports = router;
