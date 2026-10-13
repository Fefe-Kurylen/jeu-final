const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { validateAllianceTag, cleanText } = require('../utils/validation');
const { getRelation } = require('../services/diplomacyService');

const memberInclude = { members: { include: { player: { select: { id: true, name: true, faction: true, population: true } } } } };

router.get('/', auth, async (req, res) => {
  try {
    const alliances = await prisma.alliance.findMany({ include: memberInclude, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(alliances);
  } catch (e) { sendError(res, e); }
});

// GET /api/alliance/mine — the caller's alliance with members, whatever the size of the alliance list
router.get('/mine', auth, async (req, res) => {
  try {
    const member = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId }, include: { alliance: { include: memberInclude } } });
    res.json(member ? { role: member.role, alliance: member.alliance } : null);
  } catch (e) { sendError(res, e); }
});

router.post('/create', auth, async (req, res) => {
  try {
    let { tag } = req.body;
    const name = cleanText(req.body.name, 3, 30);
    if (!name) return res.status(400).json({ error: 'Nom invalide (3-30 caractères)' });
    if (!validateAllianceTag(tag)) return res.status(400).json({ error: 'Tag invalide (2-5 caractères alphanumériques)' });
    const description = req.body.description ? (cleanText(String(req.body.description).substring(0, 400), 0, 200) || '') : '';
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
      if (existing) return { error: 'Vous etes deja dans une alliance', status: 400 };
      const alliance = await tx.alliance.create({ data: { name, tag: tag.toUpperCase(), description, leaderId: req.user.playerId } });
      await tx.allianceMember.create({ data: { allianceId: alliance.id, playerId: req.user.playerId, role: 'LEADER' } });
      await tx.allianceInvite.deleteMany({ where: { playerId: req.user.playerId } });
      return { message: 'Alliance creee', alliance };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Nom ou tag deja pris' });
    sendError(res, e);
  }
});

// Invitations: joining requires one, otherwise anyone could join a target's alliance to become immune
router.post('/invite', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (!myMember || !['LEADER', 'OFFICER'].includes(myMember.role)) return res.status(403).json({ error: 'Officier requis' });
    const playerName = typeof req.body.playerName === 'string' ? req.body.playerName.trim() : '';
    const target = playerName ? await prisma.player.findUnique({ where: { name: playerName }, include: { alliance: true } }) : null;
    if (!target) return res.status(404).json({ error: 'Joueur introuvable' });
    if (target.alliance) return res.status(400).json({ error: 'Ce joueur est déjà dans une alliance' });
    await prisma.allianceInvite.upsert({
      where: { allianceId_playerId: { allianceId: myMember.allianceId, playerId: target.id } },
      update: {}, create: { allianceId: myMember.allianceId, playerId: target.id }
    });
    res.json({ message: `Invitation envoyée à ${target.name}` });
  } catch (e) { sendError(res, e); }
});

router.get('/invites', auth, async (req, res) => {
  try {
    const invites = await prisma.allianceInvite.findMany({ where: { playerId: req.user.playerId }, include: { alliance: { select: { id: true, name: true, tag: true } } }, orderBy: { createdAt: 'desc' } });
    res.json(invites);
  } catch (e) { sendError(res, e); }
});

router.post('/invites/:id/decline', auth, async (req, res) => {
  try {
    await prisma.allianceInvite.deleteMany({ where: { id: req.params.id, playerId: req.user.playerId } });
    res.json({ message: 'Invitation refusée' });
  } catch (e) { sendError(res, e); }
});

router.post('/:id/join', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const alliance = await tx.alliance.findUnique({ where: { id: req.params.id } });
      if (!alliance) return { error: 'Alliance non trouvee', status: 404 };
      const existing = await tx.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
      if (existing) return { error: 'Vous etes deja dans une alliance', status: 400 };
      const invite = await tx.allianceInvite.findUnique({ where: { allianceId_playerId: { allianceId: alliance.id, playerId: req.user.playerId } } });
      if (!invite) return { error: 'Cette alliance recrute sur invitation', status: 403 };
      await tx.allianceMember.create({ data: { allianceId: alliance.id, playerId: req.user.playerId, role: 'MEMBER' } });
      await tx.allianceInvite.deleteMany({ where: { playerId: req.user.playerId } });
      return { message: 'Alliance rejointe' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

router.post('/leave', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.allianceMember.findUnique({ where: { playerId: req.user.playerId }, include: { alliance: true } });
      if (!member) return { error: 'Vous n\'etes pas dans une alliance', status: 400 };
      if (member.role === 'LEADER') {
        const otherMembers = await tx.allianceMember.count({ where: { allianceId: member.allianceId, NOT: { playerId: req.user.playerId } } });
        if (otherMembers > 0) return { error: 'Transferez le leadership avant de partir', status: 400 };
        await tx.allianceDiplomacy.deleteMany({ where: { OR: [{ allianceId: member.allianceId }, { targetAllianceId: member.allianceId }] } });
        await tx.allianceMember.delete({ where: { id: member.id } });
        await tx.alliance.delete({ where: { id: member.allianceId } });
        return { message: 'Alliance dissoute' };
      }
      await tx.allianceMember.delete({ where: { id: member.id } });
      return { message: 'Alliance quittee' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

router.post('/promote/:playerId', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (!myMember || myMember.role !== 'LEADER') return res.status(403).json({ error: 'Leader requis' });
    const target = await prisma.allianceMember.findUnique({ where: { playerId: req.params.playerId } });
    if (!target || target.allianceId !== myMember.allianceId) return res.status(404).json({ error: 'Membre non trouve' });
    if (target.role === 'OFFICER') {
      // Promoting an officer hands over leadership; the old leader steps down to officer
      await prisma.$transaction([
        prisma.allianceMember.update({ where: { id: target.id }, data: { role: 'LEADER' } }),
        prisma.allianceMember.update({ where: { id: myMember.id }, data: { role: 'OFFICER' } }),
        prisma.alliance.update({ where: { id: myMember.allianceId }, data: { leaderId: target.playerId } })
      ]);
      return res.json({ message: 'Leadership transféré', role: 'LEADER' });
    }
    if (target.role !== 'MEMBER') return res.status(400).json({ error: 'Ce membre ne peut pas être promu' });
    await prisma.allianceMember.update({ where: { id: target.id }, data: { role: 'OFFICER' } });
    res.json({ message: 'Membre promu', role: 'OFFICER' });
  } catch (e) { sendError(res, e); }
});

router.post('/kick/:playerId', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (!myMember || !['LEADER', 'OFFICER'].includes(myMember.role)) return res.status(403).json({ error: 'Officier requis' });
    const target = await prisma.allianceMember.findUnique({ where: { playerId: req.params.playerId } });
    if (!target || target.allianceId !== myMember.allianceId) return res.status(404).json({ error: 'Membre non trouve' });
    if (target.role === 'LEADER') return res.status(403).json({ error: 'Impossible de kick le leader' });
    if (myMember.role === 'OFFICER' && target.role === 'OFFICER') return res.status(403).json({ error: 'Un officier ne peut pas exclure un autre officier' });
    await prisma.allianceMember.delete({ where: { id: target.id } });
    res.json({ message: 'Membre exclus' });
  } catch (e) { sendError(res, e); }
});

// Diplomacy
router.get('/diplomacy', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId }, include: { alliance: { include: { diplomacy: true, targetOf: true } } } });
    if (!myMember) return res.json({ diplomacy: [] });
    const allDiplomacy = [
      ...myMember.alliance.diplomacy.map(d => ({ allianceId: d.targetAllianceId, status: d.status, direction: 'from' })),
      ...myMember.alliance.targetOf.map(d => ({ allianceId: d.allianceId, status: d.status, direction: 'to' }))
    ];
    res.json({ diplomacy: allDiplomacy, myAllianceId: myMember.allianceId });
  } catch (e) { sendError(res, e); }
});

router.post('/diplomacy/:targetAllianceId', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ALLY', 'NEUTRAL', 'ENEMY'].includes(status)) return res.status(400).json({ error: 'Statut invalide (ALLY, NEUTRAL, ENEMY)' });
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (!myMember || !['LEADER', 'OFFICER'].includes(myMember.role)) return res.status(403).json({ error: 'Leader ou Officier requis' });
    const targetAlliance = await prisma.alliance.findUnique({ where: { id: req.params.targetAllianceId } });
    if (!targetAlliance) return res.status(404).json({ error: 'Alliance cible non trouvée' });
    if (targetAlliance.id === myMember.allianceId) return res.status(400).json({ error: 'Impossible de modifier la diplomatie avec vous-même' });
    if (status === 'ALLY') {
      const currentAllies = await prisma.allianceDiplomacy.count({ where: { allianceId: myMember.allianceId, status: 'ALLY', NOT: { targetAllianceId: targetAlliance.id } } });
      if (currentAllies >= 3) return res.status(400).json({ error: 'Maximum 3 alliances alliées' });
    }
    await prisma.allianceDiplomacy.upsert({
      where: { allianceId_targetAllianceId: { allianceId: myMember.allianceId, targetAllianceId: req.params.targetAllianceId } },
      update: { status, changedAt: new Date() },
      create: { allianceId: myMember.allianceId, targetAllianceId: req.params.targetAllianceId, status }
    });
    res.json({ message: `Statut diplomatique changé en ${status}` });
  } catch (e) { sendError(res, e); }
});

// Diplomacy between players (mounted at /api/alliance AND /api/diplomacy)
router.get('/player/:targetPlayerId', auth, async (req, res) => {
  try {
    res.json(await getRelation(req.user.playerId, req.params.targetPlayerId));
  } catch (e) { sendError(res, e); }
});

module.exports = router;
