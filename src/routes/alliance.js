const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { validateAllianceTag, cleanText } = require('../utils/validation');
const { getRelation, relationsOf, allyIdsOf, setRow, MAX_ALLIES } = require('../services/diplomacyService');
const { notify } = require('../services/pushService');
const fx = require('../utils/buildingEffects');

// Highest Embassy level among the player's cities (the Embassy is a capital building)
async function embassyLevelOf(playerId, db = prisma) {
  const rows = await db.cityBuilding.findMany({ where: { key: 'EMBASSY', city: { playerId } }, select: { level: true } });
  return rows.reduce((m, r) => Math.max(m, r.level), 0);
}

// Un joueur n'est plus dans son alliance (départ, exclusion, dissolution) : ses demandes d'aide se ferment, ses renforts
// chez les membres et les alliés rentrent, et ceux des autres qui le protégeaient aussi
async function leftAlliance(playerId, allianceId) {
  try {
    await require('../services/allianceHelpService').closeForPlayer(playerId);
    await require('../services/supportService').recallForPlayer(playerId, allianceId);
  } catch (e) { console.error('[ALLIANCE] départ :', e.message); }
}

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
    // entre membres, chacun voit la dernière connexion des autres (GDD membership.memberListFields), arrondie par le client
    const member = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId }, include: { alliance: { include: { members: { include: { player: { select: { id: true, name: true, faction: true, population: true, lastSeenAt: true } } }, orderBy: { joinedAt: 'asc' } } } } } });
    res.json(member ? { role: member.role, alliance: member.alliance, serverTime: new Date() } : null);
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
      const needed = fx.allianceCreateLevel();
      if ((await embassyLevelOf(req.user.playerId, tx)) < needed) return { error: `Ambassade niveau ${needed} requise pour fonder une alliance`, status: 400 };
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
      const needed = fx.allianceJoinLevel();
      if ((await embassyLevelOf(req.user.playerId, tx)) < needed) return { error: `Ambassade niveau ${needed} requise pour rejoindre une alliance`, status: 400 };
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
        return { message: 'Alliance dissoute', allianceId: member.allianceId };
      }
      await tx.allianceMember.delete({ where: { id: member.id } });
      return { message: 'Alliance quittee', allianceId: member.allianceId };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    await leftAlliance(req.user.playerId, result.allianceId);
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
    await leftAlliance(target.playerId, target.allianceId);
    notify(target.playerId, 'alliance', '🛡️ Alliance', 'Vous avez été exclu de votre alliance.', { to: 'alliance', sub: 'overview' });
    res.json({ message: 'Membre exclu' });
  } catch (e) { sendError(res, e); }
});

// ---- Diplomatie (décision du 26 octobre 2026) : allié sur proposition acceptée, ennemi déclaré seul, 3 alliés au plus ----
const allianceCard = { id: true, tag: true, name: true };
const isManager = (m) => m && ['LEADER', 'OFFICER'].includes(m.role);
// prévient le chef et les officiers d'une alliance (fil de notifications, lien vers la diplomatie)
async function notifyOfficers(allianceId, title, body, db = prisma) {
  const officers = await db.allianceMember.findMany({ where: { allianceId, role: { in: ['LEADER', 'OFFICER'] } }, select: { playerId: true } });
  for (const o of officers) notify(o.playerId, 'alliance', title, body, { to: 'alliance', sub: 'diplomacy' });
}

// GET /api/alliance/diplomacy — statut avec chaque alliance (vu de la sienne), propositions reçues et envoyées
router.get('/diplomacy', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (!myMember) return res.json({ diplomacy: [], incoming: [], outgoing: [] });
    const [rel, incoming, outgoing] = await Promise.all([
      relationsOf(myMember.allianceId),
      prisma.allianceAllyRequest.findMany({ where: { toAllianceId: myMember.allianceId }, include: { from: { select: allianceCard } }, orderBy: { createdAt: 'desc' } }),
      prisma.allianceAllyRequest.findMany({ where: { fromAllianceId: myMember.allianceId }, include: { to: { select: allianceCard } }, orderBy: { createdAt: 'desc' } })
    ]);
    res.json({
      myAllianceId: myMember.allianceId, canManage: isManager(myMember), maxAllies: MAX_ALLIES,
      diplomacy: [...rel].map(([allianceId, e]) => ({ allianceId, status: e.status, declared: e.mine, declaredByThem: e.theirs })),
      incoming: incoming.map(r => ({ id: r.id, alliance: r.from, createdAt: r.createdAt })),
      outgoing: outgoing.map(r => ({ id: r.id, alliance: r.to, createdAt: r.createdAt }))
    });
  } catch (e) { sendError(res, e); }
});

// GET /api/alliance/relations — couleurs de la carte : { myAllianceId, relations: { <allianceId>: 'ALLY' | 'ENEMY' } }
router.get('/relations', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId }, select: { allianceId: true } });
    if (!myMember) return res.json({ myAllianceId: null, relations: {} });
    const rel = await relationsOf(myMember.allianceId);
    res.json({ myAllianceId: myMember.allianceId, relations: Object.fromEntries([...rel].filter(([, e]) => e.status !== 'NEUTRAL').map(([id, e]) => [id, e.status])) });
  } catch (e) { sendError(res, e); }
});

// Accepte une proposition (dans une transaction) : les deux alliances passent alliées si aucune n'a déjà 3 alliés
async function acceptAlly(tx, request) {
  for (const id of [request.fromAllianceId, request.toAllianceId]) {
    const allies = await allyIdsOf(id, tx);
    if (allies.length >= MAX_ALLIES) return { status: 400, error: id === request.toAllianceId ? `Votre alliance a déjà ${MAX_ALLIES} alliés` : `Cette alliance a déjà ${MAX_ALLIES} alliés` };
  }
  await setRow(tx, request.fromAllianceId, request.toAllianceId, 'ALLY');
  await setRow(tx, request.toAllianceId, request.fromAllianceId, 'ALLY');
  await tx.allianceAllyRequest.deleteMany({ where: { OR: [{ fromAllianceId: request.fromAllianceId, toAllianceId: request.toAllianceId }, { fromAllianceId: request.toAllianceId, toAllianceId: request.fromAllianceId }] } });
  return { ok: true };
}

// POST /api/alliance/diplomacy/:targetAllianceId { status: ALLY | NEUTRAL | ENEMY }
// ALLY envoie une proposition (ou accepte celle de l'autre alliance) ; NEUTRAL et ENEMY s'appliquent tout de suite et
// rompent une alliance existante des deux côtés.
router.post('/diplomacy/:targetAllianceId', auth, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['ALLY', 'NEUTRAL', 'ENEMY'].includes(status)) return res.status(400).json({ error: 'Statut invalide (ALLY, NEUTRAL, ENEMY)' });
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId }, include: { alliance: { select: allianceCard } } });
    if (!isManager(myMember)) return res.status(403).json({ error: 'Chef ou officier requis' });
    const target = await prisma.alliance.findUnique({ where: { id: req.params.targetAllianceId }, select: allianceCard });
    if (!target) return res.status(404).json({ error: 'Alliance cible non trouvée' });
    if (target.id === myMember.allianceId) return res.status(400).json({ error: 'Impossible de modifier la diplomatie avec vous-même' });
    const me = myMember.alliance, label = (a) => `[${a.tag}] ${a.name}`;
    const result = await prisma.$transaction(async (tx) => {
      const current = (await relationsOf(me.id, tx)).get(target.id) || { status: 'NEUTRAL', mine: 'NEUTRAL', theirs: 'NEUTRAL' };
      if (status === 'ALLY') {
        if (current.status === 'ALLY') return { status: 400, error: 'Vous êtes déjà alliés' };
        if (current.theirs === 'ENEMY') return { status: 400, error: 'Cette alliance vous a déclaré ennemis : elle doit d\'abord revenir à neutre' };
        const theirRequest = await tx.allianceAllyRequest.findUnique({ where: { fromAllianceId_toAllianceId: { fromAllianceId: target.id, toAllianceId: me.id } } });
        if (theirRequest) {
          const ok = await acceptAlly(tx, theirRequest);
          return ok.error ? ok : { message: `Alliance conclue avec ${label(target)}`, event: 'accepted' };
        }
        if ((await allyIdsOf(me.id, tx)).length >= MAX_ALLIES) return { status: 400, error: `Maximum ${MAX_ALLIES} alliances alliées` };
        if (current.mine === 'ENEMY') await setRow(tx, me.id, target.id, 'NEUTRAL');   // on propose la paix et l'alliance d'un coup
        const created = await tx.allianceAllyRequest.createMany({ data: [{ fromAllianceId: me.id, toAllianceId: target.id }], skipDuplicates: true });
        return { message: created.count ? `Proposition d'alliance envoyée à ${label(target)}` : 'Proposition déjà envoyée, en attente de réponse', event: created.count ? 'proposed' : null };
      }
      // NEUTRAL ou ENEMY : la proposition en cours est retirée, une alliance est rompue des deux côtés
      await tx.allianceAllyRequest.deleteMany({ where: { OR: [{ fromAllianceId: me.id, toAllianceId: target.id }, ...(status === 'ENEMY' ? [{ fromAllianceId: target.id, toAllianceId: me.id }] : [])] } });
      const wasAlly = current.status === 'ALLY';
      await setRow(tx, me.id, target.id, status);
      if (wasAlly) await setRow(tx, target.id, me.id, 'NEUTRAL');
      return { message: status === 'ENEMY' ? `Vous avez déclaré ${label(target)} ennemie` : wasAlly ? `Alliance rompue avec ${label(target)}` : `Relation neutre avec ${label(target)}`, event: status === 'ENEMY' ? 'enemy' : wasAlly ? 'broken' : (current.mine === 'ENEMY' ? 'peace' : null), wasAlly };
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    const text = {
      proposed: `${label(me)} propose une alliance à votre alliance. Acceptez-la ou refusez-la dans la diplomatie.`,
      accepted: `${label(me)} a accepté l'alliance : vos deux alliances sont alliées.`,
      enemy: `${label(me)} a déclaré votre alliance ennemie.${result.wasAlly ? ' Votre alliance avec elle est rompue.' : ''}`,
      broken: `${label(me)} a rompu son alliance avec la vôtre : vous êtes neutres.`,
      peace: `${label(me)} n'est plus en guerre contre votre alliance.`
    }[result.event];
    if (text) {
      notifyOfficers(target.id, '🤝 Diplomatie', text).catch(() => {});
      if (result.event === 'enemy' || result.event === 'broken') require('../services/supportService').recallBetween(me.id, target.id).catch(e => console.error('[SUPPORT]', e.message));
    }
    res.json({ message: result.message, event: result.event });
  } catch (e) { sendError(res, e); }
});

// POST /api/alliance/diplomacy/requests/:id/accept — accepte une proposition reçue
router.post('/diplomacy/requests/:id/accept', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId }, include: { alliance: { select: allianceCard } } });
    if (!isManager(myMember)) return res.status(403).json({ error: 'Chef ou officier requis' });
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.allianceAllyRequest.findUnique({ where: { id: req.params.id }, include: { from: { select: allianceCard } } });
      if (!request || request.toAllianceId !== myMember.allianceId) return { status: 404, error: 'Proposition introuvable' };
      const ok = await acceptAlly(tx, request);
      return ok.error ? ok : { from: request.from };
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    notifyOfficers(result.from.id, '🤝 Diplomatie', `[${myMember.alliance.tag}] ${myMember.alliance.name} a accepté votre proposition : vos deux alliances sont alliées.`).catch(() => {});
    res.json({ message: `Alliance conclue avec [${result.from.tag}] ${result.from.name}` });
  } catch (e) { sendError(res, e); }
});

// DELETE /api/alliance/diplomacy/requests/:id — refuse une proposition reçue ou retire la sienne
router.delete('/diplomacy/requests/:id', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId }, include: { alliance: { select: allianceCard } } });
    if (!isManager(myMember)) return res.status(403).json({ error: 'Chef ou officier requis' });
    const request = await prisma.allianceAllyRequest.findUnique({ where: { id: req.params.id } });
    if (!request || (request.toAllianceId !== myMember.allianceId && request.fromAllianceId !== myMember.allianceId)) return res.status(404).json({ error: 'Proposition introuvable' });
    await prisma.allianceAllyRequest.deleteMany({ where: { id: request.id } });
    const declined = request.toAllianceId === myMember.allianceId;
    if (declined) notifyOfficers(request.fromAllianceId, '🤝 Diplomatie', `[${myMember.alliance.tag}] ${myMember.alliance.name} a refusé votre proposition d'alliance.`).catch(() => {});
    res.json({ message: declined ? 'Proposition refusée' : 'Proposition retirée' });
  } catch (e) { sendError(res, e); }
});

// GET /api/alliance/:id — fiche publique d'une alliance : membres (sans la dernière connexion), alliés et ennemis
// (GDD diplomacy.othersSee : tout le monde voit les statuts)
router.get('/:id', auth, async (req, res) => {
  try {
    const alliance = await prisma.alliance.findUnique({ where: { id: req.params.id }, include: memberInclude });
    if (!alliance) return res.status(404).json({ error: 'Alliance introuvable' });
    const rel = await relationsOf(alliance.id);
    const others = await prisma.alliance.findMany({ where: { id: { in: [...rel.keys()] } }, select: allianceCard });
    const byStatus = (st) => others.filter(o => rel.get(o.id)?.status === st);
    res.json({ ...alliance, allies: byStatus('ALLY'), enemies: byStatus('ENEMY') });
  } catch (e) { sendError(res, e); }
});

// Diplomacy between players (mounted at /api/alliance AND /api/diplomacy)
router.get('/player/:targetPlayerId', auth, async (req, res) => {
  try {
    res.json(await getRelation(req.user.playerId, req.params.targetPlayerId));
  } catch (e) { sendError(res, e); }
});

module.exports = router;
