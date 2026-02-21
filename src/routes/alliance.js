const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const alliances = await prisma.alliance.findMany({ include: { members: { include: { player: { select: { id: true, name: true, faction: true, population: true } } } } }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(alliances);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/create', auth, async (req, res) => {
  try {
    const { name, tag, description } = req.body;
    if (!name || !tag) return res.status(400).json({ error: 'Nom et tag requis' });
    if (tag.length < 2 || tag.length > 5) return res.status(400).json({ error: 'Tag entre 2 et 5 caracteres' });
    const existing = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (existing) return res.status(400).json({ error: 'Vous etes deja dans une alliance' });
    const alliance = await prisma.alliance.create({ data: { name, tag: tag.toUpperCase(), description, leaderId: req.user.playerId } });
    await prisma.allianceMember.create({ data: { allianceId: alliance.id, playerId: req.user.playerId, role: 'LEADER' } });
    res.json({ message: 'Alliance creee', alliance });
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Nom ou tag deja pris' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/join', auth, async (req, res) => {
  try {
    const alliance = await prisma.alliance.findUnique({ where: { id: req.params.id } });
    if (!alliance) return res.status(404).json({ error: 'Alliance non trouvee' });
    const existing = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (existing) return res.status(400).json({ error: 'Vous etes deja dans une alliance' });
    await prisma.allianceMember.create({ data: { allianceId: alliance.id, playerId: req.user.playerId, role: 'MEMBER' } });
    res.json({ message: 'Alliance rejoint' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/leave', auth, async (req, res) => {
  try {
    const member = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId }, include: { alliance: true } });
    if (!member) return res.status(400).json({ error: 'Vous n\'etes pas dans une alliance' });
    if (member.role === 'LEADER') {
      const otherMembers = await prisma.allianceMember.count({ where: { allianceId: member.allianceId, NOT: { playerId: req.user.playerId } } });
      if (otherMembers > 0) return res.status(400).json({ error: 'Transferez le leadership avant de partir' });
      await prisma.allianceMember.delete({ where: { id: member.id } });
      await prisma.allianceDiplomacy.deleteMany({ where: { OR: [{ allianceId: member.allianceId }, { targetAllianceId: member.allianceId }] } });
      await prisma.alliance.delete({ where: { id: member.allianceId } });
      return res.json({ message: 'Alliance dissoute' });
    }
    await prisma.allianceMember.delete({ where: { id: member.id } });
    res.json({ message: 'Alliance quittee' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/promote/:playerId', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (!myMember || myMember.role !== 'LEADER') return res.status(403).json({ error: 'Leader requis' });
    const target = await prisma.allianceMember.findUnique({ where: { playerId: req.params.playerId } });
    if (!target || target.allianceId !== myMember.allianceId) return res.status(404).json({ error: 'Membre non trouve' });
    const newRole = target.role === 'MEMBER' ? 'OFFICER' : target.role;
    await prisma.allianceMember.update({ where: { id: target.id }, data: { role: newRole } });
    res.json({ message: 'Membre promu' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/kick/:playerId', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (!myMember || !['LEADER', 'OFFICER'].includes(myMember.role)) return res.status(403).json({ error: 'Officier requis' });
    const target = await prisma.allianceMember.findUnique({ where: { playerId: req.params.playerId } });
    if (!target || target.allianceId !== myMember.allianceId) return res.status(404).json({ error: 'Membre non trouve' });
    if (target.role === 'LEADER') return res.status(403).json({ error: 'Impossible de kick le leader' });
    await prisma.allianceMember.delete({ where: { id: target.id } });
    res.json({ message: 'Membre exclus' });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
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
      const currentAllies = await prisma.allianceDiplomacy.count({ where: { allianceId: myMember.allianceId, status: 'ALLY' } });
      if (currentAllies >= 3) return res.status(400).json({ error: 'Maximum 3 alliances alliées' });
    }
    await prisma.allianceDiplomacy.upsert({
      where: { allianceId_targetAllianceId: { allianceId: myMember.allianceId, targetAllianceId: req.params.targetAllianceId } },
      update: { status, changedAt: new Date() },
      create: { allianceId: myMember.allianceId, targetAllianceId: req.params.targetAllianceId, status }
    });
    res.json({ message: `Statut diplomatique changé en ${status}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Diplomacy between players (mounted at /api/alliance AND /api/diplomacy)
router.get('/player/:targetPlayerId', auth, async (req, res) => {
  try {
    const targetPlayerId = req.params.targetPlayerId;
    if (targetPlayerId === req.user.playerId) return res.json({ status: 'SELF', canTransport: true, canAttack: false });
    const [myMember, targetMember] = await Promise.all([
      prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } }),
      prisma.allianceMember.findUnique({ where: { playerId: targetPlayerId } })
    ]);
    if (myMember && targetMember && myMember.allianceId === targetMember.allianceId) return res.json({ status: 'SAME_ALLIANCE', canTransport: true, canAttack: false });
    if (!myMember || !targetMember) return res.json({ status: 'NEUTRAL', canTransport: true, canAttack: true });
    const diplomacy = await prisma.allianceDiplomacy.findFirst({ where: { OR: [{ allianceId: myMember.allianceId, targetAllianceId: targetMember.allianceId }, { allianceId: targetMember.allianceId, targetAllianceId: myMember.allianceId }] } });
    if (!diplomacy) return res.json({ status: 'NEUTRAL', canTransport: true, canAttack: true });
    return res.json({ status: diplomacy.status, canTransport: diplomacy.status !== 'ENEMY', canAttack: diplomacy.status !== 'ALLY' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/diplomacy/player/:targetPlayerId', auth, async (req, res) => {
  try {
    const targetPlayerId = req.params.targetPlayerId;
    if (targetPlayerId === req.user.playerId) return res.json({ status: 'SELF', canTransport: true, canAttack: false });
    const [myMember, targetMember] = await Promise.all([
      prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } }),
      prisma.allianceMember.findUnique({ where: { playerId: targetPlayerId } })
    ]);
    if (myMember && targetMember && myMember.allianceId === targetMember.allianceId) return res.json({ status: 'SAME_ALLIANCE', canTransport: true, canAttack: false });
    if (!myMember || !targetMember) return res.json({ status: 'NEUTRAL', canTransport: true, canAttack: true });
    const diplomacy = await prisma.allianceDiplomacy.findFirst({ where: { OR: [{ allianceId: myMember.allianceId, targetAllianceId: targetMember.allianceId }, { allianceId: targetMember.allianceId, targetAllianceId: myMember.allianceId }] } });
    if (!diplomacy) return res.json({ status: 'NEUTRAL', canTransport: true, canAttack: true });
    return res.json({ status: diplomacy.status, canTransport: diplomacy.status !== 'ENEMY', canAttack: diplomacy.status !== 'ALLY' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
