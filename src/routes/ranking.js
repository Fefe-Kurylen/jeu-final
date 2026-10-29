// Classements (décision du 27 octobre 2026, services/rankingService.js)
// GET /api/ranking/players?sort=population|attack|defense|loot&page=1   (rang du joueur connecté inclus)
// GET /api/ranking/alliances?sort=population|attack|defense
// GET /api/ranking/week?category=ATTACK|DEFENSE|LOOT|CLIMB|ALLIANCE_ATTACK|ALLIANCE_DEFENSE   (semaine en cours)
// GET /api/ranking/medals?playerId=   (médailles d'un joueur, les siennes par défaut)
// Anciens chemins gardés : /attackers et /defenders (points de combat)
const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const RK = require('../services/rankingService');
const { weekInfo } = require('../services/questService');
const { isId } = require('../utils/db');

const PAGE = 50;
const SORTS = {
  population: { sql: 'p.population', label: 'population' },
  attack: { sql: 'COALESCE(s."attackPoints", 0)', label: 'attackPoints' },
  defense: { sql: 'COALESCE(s."defensePoints", 0)', label: 'defensePoints' },
  loot: { sql: 'COALESCE(s.loot, 0)', label: 'loot' }
};
const ALLIANCE_SORTS = { population: 'SUM(p.population)', attack: 'SUM(COALESCE(s."attackPoints", 0))', defense: 'SUM(COALESCE(s."defensePoints", 0))' };

// lignes classées, avec un rang stable (égalité départagée par le nom)
async function playerRows(sortKey, offset, limit) {
  const S = SORTS[sortKey] || SORTS.population;
  return prisma.$queryRawUnsafe(`
    SELECT p.id, p.name, p.faction, p.population, COALESCE(s."attackPoints", 0)::int AS "attackPoints", COALESCE(s."defensePoints", 0)::int AS "defensePoints",
           COALESCE(s.loot, 0)::int AS loot, COALESCE(s."attacksWon", 0)::int AS "attacksWon", COALESCE(s."defensesWon", 0)::int AS "defensesWon", a.tag AS "allianceTag",
           ${S.sql}::int AS value, (ROW_NUMBER() OVER (ORDER BY ${S.sql} DESC, p.name))::int AS rank
    FROM "Player" p LEFT JOIN "PlayerStats" s ON s."playerId" = p.id LEFT JOIN "AllianceMember" m ON m."playerId" = p.id LEFT JOIN "Alliance" a ON a.id = m."allianceId"
    ORDER BY ${S.sql} DESC, p.name OFFSET ${Number(offset)} LIMIT ${Number(limit)}`);
}
async function myPlayerRank(sortKey, playerId) {
  const S = SORTS[sortKey] || SORTS.population;
  const rows = await prisma.$queryRawUnsafe(`
    SELECT rank, value FROM (SELECT p.id, ${S.sql}::int AS value, (ROW_NUMBER() OVER (ORDER BY ${S.sql} DESC, p.name))::int AS rank FROM "Player" p LEFT JOIN "PlayerStats" s ON s."playerId" = p.id) r WHERE r.id = $1`, playerId);
  return rows[0] || null;
}
const shape = (r) => ({ ...r, alliance: r.allianceTag ? { alliance: { tag: r.allianceTag } } : null });

router.get('/players', auth, async (req, res) => {
  try {
    const sort = SORTS[req.query.sort] ? req.query.sort : 'population';
    const page = Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1));
    const [rows, me, total] = await Promise.all([playerRows(sort, (page - 1) * PAGE, PAGE), myPlayerRank(sort, req.user.playerId), prisma.player.count()]);
    res.json({ sort, page, pages: Math.max(1, Math.ceil(total / PAGE)), total, me, rows: rows.map(shape) });
  } catch (e) { sendError(res, e); }
});

router.get('/alliances', auth, async (req, res) => {
  try {
    const sort = ALLIANCE_SORTS[req.query.sort] ? req.query.sort : 'population';
    const expr = ALLIANCE_SORTS[sort];
    const rows = await prisma.$queryRawUnsafe(`
      SELECT a.id, a.name, a.tag, COUNT(m.id)::int AS members, SUM(p.population)::int AS population, SUM(COALESCE(s."attackPoints", 0))::int AS "attackPoints",
             SUM(COALESCE(s."defensePoints", 0))::int AS "defensePoints", ${expr}::int AS value, (ROW_NUMBER() OVER (ORDER BY ${expr} DESC, a.tag))::int AS rank
      FROM "Alliance" a JOIN "AllianceMember" m ON m."allianceId" = a.id JOIN "Player" p ON p.id = m."playerId" LEFT JOIN "PlayerStats" s ON s."playerId" = p.id
      GROUP BY a.id, a.name, a.tag ORDER BY ${expr} DESC, a.tag LIMIT 100`);
    const mine = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId }, select: { allianceId: true } });
    res.json({ sort, rows, me: mine ? rows.find(r => r.id === mine.allianceId) || null : null });
  } catch (e) { sendError(res, e); }
});

// GET /api/ranking/challenge — défi d'alliance de la semaine (thème, classement des alliances, place de la mienne)
router.get('/challenge', auth, async (req, res) => {
  try { res.json(await require('../services/challengeService').current(req.user.playerId)); } catch (e) { sendError(res, e); }
});
router.get('/week', auth, async (req, res) => {
  try {
    const category = String(req.query.category || 'ATTACK').toUpperCase();
    const week = weekInfo();
    let rows;
    if (category === 'ALLIANCE_ATTACK') rows = await RK.allianceWeekTop(week.key, 'attackPoints', 10);
    else if (category === 'ALLIANCE_DEFENSE') rows = await RK.allianceWeekTop(week.key, 'defensePoints', 10);
    else if (['ATTACK', 'DEFENSE', 'LOOT', 'CLIMB'].includes(category)) rows = await RK.weekTop(week.key, category, 10);
    else return res.status(400).json({ error: 'Catégorie inconnue' });
    const mine = await prisma.playerWeekStats.findUnique({ where: { playerId_week: { playerId: req.user.playerId, week: week.key } } });
    const pop = mine ? (await prisma.player.findUnique({ where: { id: req.user.playerId }, select: { population: true } }))?.population || 0 : 0;
    res.json({ week: week.key, endsAt: new Date(week.start.getTime() + 7 * 86400000), category, label: RK.CAT_LABEL[category], rows, me: mine ? { attackPoints: mine.attackPoints, defensePoints: mine.defensePoints, loot: mine.loot, climb: Math.max(0, pop - mine.popStart) } : null });
  } catch (e) { sendError(res, e); }
});

router.get('/medals', auth, async (req, res) => {
  try {
    const playerId = req.query.playerId && isId(String(req.query.playerId)) ? String(req.query.playerId) : req.user.playerId;
    const medals = await prisma.medal.findMany({ where: { playerId }, orderBy: [{ week: 'desc' }, { rank: 'asc' }], take: 200 });
    const m = await prisma.allianceMember.findUnique({ where: { playerId }, select: { allianceId: true } });
    const allianceMedals = m ? await prisma.medal.findMany({ where: { allianceId: m.allianceId }, orderBy: [{ week: 'desc' }, { rank: 'asc' }], take: 100 }) : [];
    res.json({ medals, allianceMedals, labels: RK.CAT_LABEL });
  } catch (e) { sendError(res, e); }
});

// anciens chemins : points de combat
router.get('/attackers', auth, async (req, res) => {
  try { res.json((await playerRows('attack', 0, PAGE)).filter(r => r.value > 0).map(shape)); } catch (e) { sendError(res, e); }
});
router.get('/defenders', auth, async (req, res) => {
  try { res.json((await playerRows('defense', 0, PAGE)).filter(r => r.value > 0).map(shape)); } catch (e) { sendError(res, e); }
});

module.exports = router;
