// Administration (décision du 29 octobre 2026, services/adminService.js) — réservé à l'équipe (Account.role)
// GET  /api/admin/me                         rôle et droits
// GET  /api/admin/overview                   chiffres du tableau de bord
// GET  /api/admin/world                      calendrier, réglages, monde suivant           (administrateur)
// POST /api/admin/world/settings             durée des inscriptions, jours des sites et des plans, inscriptions fermées
// POST /api/admin/world/shift { days }       avancer (+) ou repousser (−) tout le calendrier
// POST /api/admin/world/end { confirm }      terminer le monde (« TERMINER ») : Panthéon, titres
// POST /api/admin/world/next { confirm, force } ouvrir le monde suivant (« NOUVEAU MONDE ») : préparé par le tick
// GET  /api/admin/reports                    signalements du chat en attente                (modérateur)
// POST /api/admin/reports/:id { action, hours, reason }  classer, supprimer le message, couper la messagerie de l'auteur
// GET  /api/admin/players?q=                 recherche (pseudo ; e-mail pour un administrateur)
// GET  /api/admin/players/:id                fiche : sanctions, historique, signalements
// POST /api/admin/players/:id/sanction { kind: MUTE|SUSPEND|BAN, hours, days, reason }
// POST /api/admin/players/:id/lift { kind }  lever une sanction
// POST /api/admin/players/:id/role { role }  équipe : PLAYER, MODERATOR, ADMIN           (administrateur)
// GET  /api/admin/team                       membres de l'équipe
// GET  /api/admin/log?before=&action=        journal de l'équipe
// GET  /api/admin/stats                      statistiques des 30 derniers jours             (administrateur)
// GET  /api/admin/announcements              annonces envoyées                              (administrateur)
// POST /api/admin/announcements { title, body, bannerHours, push }  annonce à tous les joueurs
// POST /api/admin/announcements/:id/end      retirer le bandeau
// GET  /api/announcements                    bandeaux en cours (tous les joueurs)
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const config = require('../config');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const A = require('../services/adminService');
const WS = require('../services/wonderService');
const { sendError } = require('../utils/httpError');

const fail = (res, e) => (e?.status && e.expose ? res.status(e.status).json({ error: e.message }) : sendError(res, e));
const staff = async (req, res, next) => {
  try {
    const me = await A.staffOf(req.user.id);
    if (!me || !A.isStaff(me.role)) return res.status(403).json({ error: 'Réservé à l\'équipe du jeu' });
    req.staff = me;
    next();
  } catch (e) { fail(res, e); }
};
const need = (perm) => (req, res, next) => (A.can(req.staff.role, perm) ? next() : res.status(403).json({ error: perm === 'world' || perm === 'team' || perm === 'ban' ? 'Réservé aux administrateurs' : 'Droit insuffisant' }));
router.use('/admin', rateLimit(120, 'admin'), auth, staff);

const PERM_LIST = Object.keys(A.PERMS);
router.get('/admin/me', (req, res) => res.json({ role: req.staff.role, name: req.staff.name, perms: PERM_LIST.filter(p => A.can(req.staff.role, p)), limits: { ...A.LIMITS, suspendDays: req.staff.role === 'ADMIN' ? A.LIMITS.suspendDays : A.LIMITS.moderatorSuspendDays } }));

router.get('/admin/overview', async (req, res) => {
  try {
    const now = new Date();
    const [reports, players, activeDay, activeWeek, suspended, banned, muted, team] = await Promise.all([
      prisma.chatReport.count({ where: { handledAt: null } }),
      prisma.player.count(),
      prisma.player.count({ where: { lastSeenAt: { gte: new Date(now - 86400000) } } }),
      prisma.player.count({ where: { lastSeenAt: { gte: new Date(now - 7 * 86400000) } } }),
      prisma.account.count({ where: { suspendedUntil: { gt: now }, bannedAt: null } }),
      prisma.account.count({ where: { bannedAt: { not: null } } }),
      prisma.player.count({ where: { chatMutedUntil: { gt: now } } }),
      prisma.account.count({ where: { role: { in: ['MODERATOR', 'ADMIN'] } } })
    ]);
    res.json({ reports, players, activeDay, activeWeek, suspended, banned, muted, team, world: await WS.worldState(now) });
  } catch (e) { fail(res, e); }
});

// ---- monde (administrateur) ----
router.get('/admin/world', need('world'), async (req, res) => {
  try {
    const row = await WS.worldRow();
    const [state, wonders] = await Promise.all([WS.worldState(), prisma.city.count({ where: { isWonder: true } })]);
    const W = config.world;
    res.json({ state, wonders, seed: row?.seed ?? null, resetRequestedAt: row?.resetRequestedAt || null, resetRequestedBy: row?.resetRequestedBy || null,
      settings: { registrationDays: row?.registrationDays ?? null, wonderSitesDay: row?.wonderSitesDay ?? null, wonderPlansDay: row?.wonderPlansDay ?? null, registrationClosed: !!row?.registrationClosed },
      defaults: { registrationDays: W.registrationDays, wonderSitesDay: W.wonderSitesDay, wonderPlansDay: W.wonderPlansDay, maxPlayers: W.maxPlayers } });
  } catch (e) { fail(res, e); }
});
const dayField = (v, label) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!(n >= 1 && n <= 730)) throw A.httpError(400, `${label} : un jour entre 1 et 730`);
  return n;
};
router.post('/admin/world/settings', need('world'), async (req, res) => {
  try {
    const row = await WS.worldRow();
    if (!row) return res.status(409).json({ error: 'Le monde se prépare, réessayez dans un instant' });
    if (row.endedAt) return res.status(400).json({ error: 'Ce monde est terminé' });
    const b = req.body || {};
    const data = {};
    if ('registrationDays' in b) data.registrationDays = dayField(b.registrationDays, 'Inscriptions');
    if ('wonderSitesDay' in b) data.wonderSitesDay = dayField(b.wonderSitesDay, 'Sites de Merveille');
    if ('wonderPlansDay' in b) data.wonderPlansDay = dayField(b.wonderPlansDay, 'Plans de construction');
    if ('registrationClosed' in b) data.registrationClosed = !!b.registrationClosed;
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Rien à changer' });
    const next = WS.settingsOf({ ...row, ...data });
    if (next.wonderPlansDay < next.wonderSitesDay) return res.status(400).json({ error: 'Les plans apparaissent après les sites de Merveille' });
    if (row.sitesSpawnedAt && 'wonderSitesDay' in data) return res.status(400).json({ error: 'Les sites de Merveille sont déjà apparus' });
    if (row.plansSpawnedAt && 'wonderPlansDay' in data) return res.status(400).json({ error: 'Les plans sont déjà apparus' });
    await prisma.$transaction(async (tx) => {
      await tx.worldConfig.update({ where: { id: 1 }, data });
      await A.writeLog(tx, req.staff, 'WORLD_SETTINGS', null, data);
    });
    const st = await WS.worldState();
    const soon = (d) => d <= st.day;
    res.json({ message: `Calendrier mis à jour${(!row.sitesSpawnedAt && soon(next.wonderSitesDay)) || (!row.plansSpawnedAt && soon(next.wonderPlansDay)) ? ' : les Immortels apparaissent au prochain tour de jeu' : ''}`, state: st });
  } catch (e) { fail(res, e); }
});
router.post('/admin/world/shift', need('world'), async (req, res) => {
  try {
    const days = Math.round(Number(req.body?.days));
    if (!days || Math.abs(days) > 60) return res.status(400).json({ error: 'Décalage : de −60 à +60 jours, non nul' });
    const row = await WS.worldRow();
    if (!row?.readyAt) return res.status(409).json({ error: 'Le monde se prépare, réessayez dans un instant' });
    if (row.endedAt) return res.status(400).json({ error: 'Ce monde est terminé' });
    // avancer de N jours = le jour 1 recule de N jours ; le jour du monde ne descend pas sous 1
    const readyAt = new Date(Math.min(Date.now(), new Date(row.readyAt).getTime() - days * 86400000));
    await prisma.$transaction(async (tx) => {
      await tx.worldConfig.update({ where: { id: 1 }, data: { readyAt } });
      await A.writeLog(tx, req.staff, 'WORLD_SHIFT', null, { days, readyAt });
    });
    const st = await WS.worldState();
    res.json({ message: `Le monde est maintenant au jour ${st.day}`, state: st });
  } catch (e) { fail(res, e); }
});
router.post('/admin/world/end', need('world'), async (req, res) => {
  try {
    if (String(req.body?.confirm || '').trim().toUpperCase() !== 'TERMINER') return res.status(400).json({ error: 'Tapez TERMINER pour confirmer' });
    const row = await WS.worldRow();
    if (!row) return res.status(409).json({ error: 'Le monde se prépare, réessayez dans un instant' });
    if (row.endedAt) return res.status(400).json({ error: 'Ce monde est déjà terminé' });
    const r = await require('../services/hallOfFameService').endWorld(null, new Date(), { byStaff: true });
    await A.writeLog(prisma, req.staff, 'WORLD_END', null, r || {});
    res.json({ message: r ? `Monde ${r.world} terminé : ${r.winner}` : 'Ce monde était déjà terminé' });
  } catch (e) { fail(res, e); }
});
router.post('/admin/world/next', need('world'), async (req, res) => {
  try {
    if (String(req.body?.confirm || '').trim().toUpperCase() !== 'NOUVEAU MONDE') return res.status(400).json({ error: 'Tapez NOUVEAU MONDE pour confirmer' });
    const row = await WS.worldRow();
    if (!row) return res.status(409).json({ error: 'Le monde suivant se prépare déjà' });
    if (row.resetRequestedAt) return res.status(400).json({ error: 'Le monde suivant est déjà demandé : il s\'ouvre au prochain tour de jeu' });
    if (!row.endedAt && !req.body?.force) return res.status(400).json({ error: 'Ce monde n\'est pas terminé : terminez-le d\'abord (Panthéon et titres), ou cochez « remettre à zéro sans Panthéon »' });
    await prisma.$transaction(async (tx) => {
      await tx.worldConfig.update({ where: { id: 1 }, data: { resetRequestedAt: new Date(), resetRequestedBy: req.staff.name } });
      await A.writeLog(tx, req.staff, 'WORLD_NEXT', null, { from: row.number, force: !row.endedAt });
    });
    res.json({ message: `Le monde ${row.number + (row.endedAt ? 1 : 0)} se prépare : nouvelle carte et remise à zéro au prochain tour de jeu (moins d'une minute). Les joueurs le rejoignent en choisissant leur civilisation.` });
  } catch (e) { fail(res, e); }
});

// ---- signalements du chat (modérateur) ----
router.get('/admin/reports', need('reports'), async (req, res) => {
  try {
    const rows = await prisma.chatReport.findMany({ where: { handledAt: null }, orderBy: { createdAt: 'asc' }, take: 100, include: { message: { include: { sender: { select: { id: true, name: true, chatMutedUntil: true } } } }, reporter: { select: { id: true, name: true } } } });
    // un message signalé plusieurs fois n'apparaît qu'une fois, avec le nombre de signalements
    const by = new Map();
    for (const r of rows) {
      const k = r.messageId;
      if (!by.has(k)) by.set(k, { id: r.id, createdAt: r.createdAt, reasons: [], reporters: [], count: 0, message: { id: r.message.id, channel: r.message.channel, text: r.message.text, createdAt: r.message.createdAt, sender: r.message.sender } });
      const e = by.get(k); e.count++; if (r.reason) e.reasons.push(r.reason); e.reporters.push(r.reporter?.name);
    }
    res.json({ reports: [...by.values()] });
  } catch (e) { fail(res, e); }
});
router.post('/admin/reports/:id', need('reports'), async (req, res) => {
  try {
    const report = await prisma.chatReport.findUnique({ where: { id: String(req.params.id) }, include: { message: { include: { sender: { select: { id: true, name: true, accountId: true } } } } } });
    if (!report) return res.status(404).json({ error: 'Signalement introuvable' });
    const action = String(req.body?.action || '');
    if (!['dismiss', 'delete', 'mute'].includes(action)) return res.status(400).json({ error: 'Action : dismiss, delete ou mute' });
    const sender = report.message.sender;
    const target = { accountId: sender.accountId, name: sender.name };
    if (action === 'mute') await A.sanction(req.staff, sender.id, { kind: 'MUTE', hours: req.body?.hours || 24, reason: req.body?.reason || `Message signalé : « ${report.message.text.slice(0, 120)} »` });
    if (action === 'delete' || action === 'mute') {
      await prisma.chatMessage.delete({ where: { id: report.messageId } }).catch(() => null);   // ses signalements partent avec lui
      await A.writeLog(prisma, req.staff, 'REPORT_DELETE', target, { text: report.message.text.slice(0, 300), channel: report.message.channel });
      return res.json({ message: action === 'mute' ? 'Message supprimé, messagerie de l\'auteur coupée' : 'Message supprimé' });
    }
    await prisma.$transaction(async (tx) => {
      await tx.chatReport.updateMany({ where: { messageId: report.messageId, handledAt: null }, data: { handledAt: new Date(), action } });
      await A.writeLog(tx, req.staff, 'REPORT_DISMISS', target, { text: report.message.text.slice(0, 300) });
    });
    res.json({ message: 'Signalement classé' });
  } catch (e) { fail(res, e); }
});

// ---- joueurs (modérateur) ----
const playerRow = (p, withEmail, now = new Date()) => ({
  id: p.id, name: p.name, faction: p.faction, population: p.population, createdAt: p.createdAt, lastSeenAt: p.lastSeenAt,
  alliance: p.alliance?.alliance ? { tag: p.alliance.alliance.tag, name: p.alliance.alliance.name } : null,
  role: p.account.role, email: withEmail ? p.account.email : undefined,
  sanctions: {
    mutedUntil: p.chatMutedUntil && new Date(p.chatMutedUntil) > now ? p.chatMutedUntil : null,
    suspendedUntil: p.account.suspendedUntil && new Date(p.account.suspendedUntil) > now ? p.account.suspendedUntil : null, suspendReason: p.account.suspendReason,
    bannedAt: p.account.bannedAt, banReason: p.account.banReason
  }
});
const PLAYER_SELECT = { id: true, name: true, faction: true, population: true, createdAt: true, lastSeenAt: true, chatMutedUntil: true, alliance: { select: { alliance: { select: { tag: true, name: true } } } }, account: { select: { id: true, email: true, role: true, suspendedUntil: true, suspendReason: true, bannedAt: true, banReason: true, createdAt: true } } };
router.get('/admin/players', need('players'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    const filter = String(req.query.filter || '');
    const withEmail = A.can(req.staff.role, 'email');
    const now = new Date();
    const where = {};
    if (q.length >= 2) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, ...(withEmail && q.includes('@') ? [{ account: { email: { contains: q.toLowerCase() } } }] : [])];
    if (filter === 'sanctioned') where.AND = [{ OR: [{ chatMutedUntil: { gt: now } }, { account: { suspendedUntil: { gt: now } } }, { account: { bannedAt: { not: null } } }] }];
    if (!where.OR && !where.AND) return res.json({ players: [] });
    const rows = await prisma.player.findMany({ where, select: PLAYER_SELECT, orderBy: { name: 'asc' }, take: 40 });
    res.json({ players: rows.map(p => playerRow(p, withEmail, now)) });
  } catch (e) { fail(res, e); }
});
router.get('/admin/players/:id', need('players'), async (req, res) => {
  try {
    const p = await prisma.player.findUnique({ where: { id: String(req.params.id) }, select: { ...PLAYER_SELECT, _count: { select: { cities: true } } } });
    if (!p) return res.status(404).json({ error: 'Joueur introuvable' });
    const [history, reported, recent] = await Promise.all([
      prisma.adminLog.findMany({ where: { targetId: p.account.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.chatReport.count({ where: { message: { senderId: p.id } } }),
      prisma.chatMessage.findMany({ where: { senderId: p.id }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, channel: true, text: true, createdAt: true } })
    ]);
    res.json({ player: { ...playerRow(p, A.can(req.staff.role, 'email')), cities: p._count.cities, accountCreatedAt: p.account.createdAt }, history, reported, recentMessages: recent });
  } catch (e) { fail(res, e); }
});
router.post('/admin/players/:id/sanction', async (req, res) => {
  try { res.json(await A.sanction(req.staff, req.params.id, { kind: String(req.body?.kind || '').toUpperCase(), hours: req.body?.hours, days: req.body?.days, reason: req.body?.reason })); }
  catch (e) { fail(res, e); }
});
router.post('/admin/players/:id/lift', async (req, res) => {
  try { res.json(await A.lift(req.staff, req.params.id, String(req.body?.kind || '').toUpperCase())); }
  catch (e) { fail(res, e); }
});
router.post('/admin/players/:id/role', need('team'), async (req, res) => {
  try { res.json(await A.setRole(req.staff, req.params.id, String(req.body?.role || '').toUpperCase())); }
  catch (e) { fail(res, e); }
});

// ---- équipe, journal ----
router.get('/admin/team', async (req, res) => {
  try {
    const rows = await prisma.account.findMany({ where: { role: { in: ['MODERATOR', 'ADMIN'] } }, select: { role: true, player: { select: { id: true, name: true, lastSeenAt: true } } }, orderBy: { createdAt: 'asc' } });
    res.json({ team: rows.filter(r => r.player).map(r => ({ id: r.player.id, name: r.player.name, role: r.role, lastSeenAt: r.player.lastSeenAt })) });
  } catch (e) { fail(res, e); }
});
router.get('/admin/log', need('log'), async (req, res) => {
  try {
    const where = {};
    if (req.query.before) { const d = new Date(String(req.query.before)); if (!isNaN(d)) where.createdAt = { lt: d }; }
    if (req.query.action) where.action = { startsWith: String(req.query.action).toUpperCase().slice(0, 20) };
    const rows = await prisma.adminLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ log: rows });
  } catch (e) { fail(res, e); }
});

// ---- invasion barbare (administrateur) : lancer maintenant pour N heures, ou terminer celle en cours ----
router.post('/admin/invasion/start', need('world'), async (req, res) => {
  try {
    const H = require('../services/hordeService');
    if (await H.activeInvasion()) return res.status(400).json({ error: 'Une invasion est déjà en cours' });
    const hours = Math.round(Number(req.body?.hours) || config.invasion.manualHours);
    if (hours < 1 || hours > 168) return res.status(400).json({ error: 'Durée : 1 à 168 heures' });
    const inv = await H.startInvasion({ key: `manual-${Date.now()}`, endsAt: new Date(Date.now() + hours * 3600000), manual: true });
    if (!inv) return res.status(409).json({ error: 'Invasion impossible à lancer (une autre vient de commencer ?)' });
    await A.writeLog(prisma, req.staff, 'INVASION_START', null, { hours, hordes: inv.hordes });
    res.json({ message: `Invasion lancée : ${inv.hordes} donjons pour ${hours} h`, invasion: inv });
  } catch (e) { fail(res, e); }
});
router.post('/admin/invasion/end', need('world'), async (req, res) => {
  try {
    const H = require('../services/hordeService');
    const inv = await H.activeInvasion();
    if (!inv) return res.status(400).json({ error: 'Aucune invasion en cours' });
    const r = await H.endInvasion(inv);
    await A.writeLog(prisma, req.staff, 'INVASION_END', null, r || {});
    res.json({ message: `Invasion terminée${r ? ` : ${r.left} donjons repartis` : ''}` });
  } catch (e) { fail(res, e); }
});

// ---- statistiques, annonces (administrateur) ----
router.get('/admin/stats', need('stats'), async (req, res) => {
  try { res.json(await require('../services/statsService').stats()); } catch (e) { fail(res, e); }
});
const ANN = () => require('../services/announcementService');
router.get('/admin/announcements', need('announce'), async (req, res) => {
  try { res.json({ announcements: await ANN().recent(), maxBannerHours: ANN().MAX_BANNER_HOURS, pushConfigured: require('../services/pushService').configured() }); } catch (e) { fail(res, e); }
});
router.post('/admin/announcements', need('announce'), async (req, res) => {
  try {
    const a = await ANN().create(req.staff, req.body || {});
    res.json({ message: `Annonce envoyée à ${a.recipients.toLocaleString('fr-FR')} joueurs${a.push ? ' (push en cours)' : ''}`, announcement: a });
  } catch (e) { fail(res, e); }
});
router.post('/admin/announcements/:id/end', need('announce'), async (req, res) => {
  try { res.json(await ANN().endBanner(req.staff, req.params.id)); } catch (e) { fail(res, e); }
});
// bandeaux en cours, pour tous les joueurs connectés
router.get('/announcements', auth, async (req, res) => {
  try { res.json({ announcements: await ANN().active() }); } catch (e) { fail(res, e); }
});

module.exports = router;
