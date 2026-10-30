// Aide d'alliance et boutique d'alliance (décision du 26 octobre 2026), montées sur /api/alliance avant le reste des
// routes d'alliance : /api/alliance/help…, /api/alliance/shop…
const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const auth = require('../middleware/auth');
const config = require('../config');
const fx = require('../utils/buildingEffects');
const helpService = require('../services/allianceHelpService');
const shop = require('../services/allianceShopService');
const prisma = require('../config/database');
const { isId } = require('../utils/db');

const fail = (res, e) => (e.expose ? res.status(e.status).json({ error: e.message }) : sendError(res, e));

// GET /api/alliance/help — demandes ouvertes de l'alliance, ce que le joueur peut faire accélérer, ses points
router.get('/help', auth, async (req, res) => {
  try {
    const me = req.user.playerId;
    const member = await prisma.allianceMember.findUnique({ where: { playerId: me }, select: { allianceId: true } });
    if (!member) return res.json({ inAlliance: false, requests: [], targets: [] });
    const [requests, targets, embassy, player, today] = await Promise.all([
      helpService.openRequests(member.allianceId, me),
      helpService.helpableTargets(me),
      helpService.embassyLevelOf(me),
      prisma.player.findUnique({ where: { id: me }, select: { alliancePoints: true } }),
      helpService.pointsToday(prisma, me)
    ]);
    const mineRows = targets.length ? await prisma.allianceHelpRequest.findMany({ where: { playerId: me, allianceId: member.allianceId, targetId: { in: targets.map(t => t.targetId) } }, select: { kind: true, targetId: true, helps: true, maxHelps: true, closedAt: true, createdAt: true }, orderBy: { createdAt: 'asc' } }) : [];
    // la dernière demande qui compte encore pour la cible, même règle que requestHelp (les soins se redemandent après 6 h)
    const asked = new Map(mineRows.filter(r => helpService.stillAsked(r)).map(r => [`${r.kind}:${r.targetId}`, r]));
    res.json({
      inAlliance: true, requests,
      targets: targets.map(t => { const a = asked.get(`${t.kind}:${t.targetId}`); return { ...t, asked: !!a, helps: a?.helps || 0, maxHelps: a?.maxHelps ?? null }; }),
      maxHelps: fx.allianceHelpMax(embassy), embassyLevel: embassy,
      reductionPct: fx.allianceHelpReductionPct(), minSeconds: config.alliance.helpMinSeconds,
      alliancePoints: player?.alliancePoints || 0, pointsToday: today, pointsCap: config.alliance.helpPointsDailyCap, pointsPerHelp: config.alliance.helpPoints
    });
  } catch (e) { fail(res, e); }
});

// POST /api/alliance/help/request { kind?, targetId? } — demande de l'aide sur une cible, ou sur tout ce qui est en cours
router.post('/help/request', auth, async (req, res) => {
  try {
    const { kind, targetId } = req.body || {};
    if (kind && !isId(targetId)) return res.status(400).json({ error: 'Cible invalide' });
    const r = await helpService.requestHelp(req.user.playerId, kind ? { kind, targetId } : {});
    res.json({ ...r, message: r.created ? `Aide demandée (${r.created} demande${r.created > 1 ? 's' : ''}, ${r.maxHelps} aides au plus chacune)` : 'Aide déjà demandée pour tout ce qui est en cours' });
  } catch (e) { fail(res, e); }
});

const helpSummary = (r) => r.helped ? `${r.helped} aide${r.helped > 1 ? 's' : ''} donnée${r.helped > 1 ? 's' : ''}${r.points ? ` : +${r.points} points d'alliance` : r.pointsCapReached ? ' (plafond de points du jour atteint)' : ''}` : 'Personne à aider pour l\'instant';

// POST /api/alliance/help/all — « Tout aider »
router.post('/help/all', auth, async (req, res) => {
  try {
    const r = await helpService.help(req.user.playerId);
    res.json({ ...r, message: helpSummary(r) });
  } catch (e) { fail(res, e); }
});

// POST /api/alliance/help/:id — aide une demande
router.post('/help/:id', auth, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Demande invalide' });
    const r = await helpService.help(req.user.playerId, req.params.id);
    res.json({ ...r, message: helpSummary(r) });
  } catch (e) { fail(res, e); }
});

// GET /api/alliance/shop — catalogue, points, cosmétiques possédés et choisis
router.get('/shop', auth, async (req, res) => {
  try { res.json(await shop.shopFor(req.user.playerId)); } catch (e) { fail(res, e); }
});

// POST /api/alliance/shop/buy { key, cityId? }
router.post('/shop/buy', auth, async (req, res) => {
  try {
    const { key, cityId } = req.body || {};
    if (typeof key !== 'string' || key.length > 60) return res.status(400).json({ error: 'Article invalide' });
    if (cityId !== undefined && cityId !== null && !isId(cityId)) return res.status(400).json({ error: 'Ville invalide' });
    res.json(await shop.buy(req.user.playerId, key, { cityId }));
  } catch (e) { fail(res, e); }
});

// POST /api/alliance/shop/equip { slot: nameplate | banner, key | null }
router.post('/shop/equip', auth, async (req, res) => {
  try {
    const { slot, key } = req.body || {};
    if (key !== null && key !== undefined && (typeof key !== 'string' || key.length > 60)) return res.status(400).json({ error: 'Article invalide' });
    res.json(await shop.equip(req.user.playerId, slot, key ?? null));
  } catch (e) { fail(res, e); }
});

module.exports = router;
