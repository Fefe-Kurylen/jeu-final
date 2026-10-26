// ============================================================
// Aide d'alliance (décision du 26 octobre 2026, GDD alliance_config.helpSystem, données de l'Ambassade)
// - Un membre demande de l'aide sur une construction, une recherche ou les soins d'une ville en cours.
// - Chaque autre membre peut aider une fois par demande : l'aide retire 1 % du temps restant, 1 minute au moins.
// - Une demande reçoit au plus N aides selon l'Ambassade du demandeur (niv. 1 : 0, niv. 5 : 5, niv. 20 : 20).
// - Celui qui aide gagne des points d'alliance (10 par aide, 300 au plus par 24 h), à dépenser à la boutique d'alliance.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const fx = require('../utils/buildingEffects');
const { buildingsData, technologiesData } = require('../config/gamedata');

const KINDS = ['BUILD', 'RESEARCH', 'HEAL'];
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

async function embassyLevelOf(playerId, db = prisma) {
  const rows = await db.cityBuilding.findMany({ where: { key: 'EMBASSY', city: { playerId } }, select: { level: true } });
  return rows.reduce((m, r) => Math.max(m, r.level), 0);
}
const allianceIdOf = async (playerId, db = prisma) => (await db.allianceMember.findUnique({ where: { playerId }, select: { allianceId: true } }))?.allianceId || null;

// Temps retiré par une aide sur ce qui reste (ms)
function helpAmountMs(remainingMs) {
  return Math.max(config.alliance.helpMinSeconds * 1000, Math.round(remainingMs * fx.allianceHelpReductionPct() / 100));
}

const buildingName = (key) => buildingsData.find(b => b.key === key)?.name || key;
const techName = (key) => (technologiesData.technologies || []).find(t => t.key === key)?.name || key;

// Ce sur quoi le joueur peut demander de l'aide maintenant : constructions et recherches en cours, soins en cours
async function helpableTargets(playerId, db = prisma) {
  const now = new Date();
  const [builds, research, wounded] = await Promise.all([
    db.buildQueueItem.findMany({ where: { status: 'RUNNING', endsAt: { gt: now }, city: { playerId } }, include: { city: { select: { id: true, name: true } } } }),
    db.researchQueueItem.findMany({ where: { playerId, status: 'RUNNING', endsAt: { gt: now } }, include: { city: { select: { id: true, name: true } } } }),
    db.woundedUnit.findMany({ where: { city: { playerId }, count: { gt: 0 }, healsAt: { gt: now } }, include: { city: { select: { id: true, name: true } } } })
  ]);
  const out = [
    ...builds.map(b => ({ kind: 'BUILD', targetId: b.id, cityId: b.cityId, label: `${buildingName(b.buildingKey)} niv. ${b.targetLevel} (${b.city.name})`, endsAt: b.endsAt })),
    ...research.map(r => ({ kind: 'RESEARCH', targetId: r.id, cityId: r.cityId, label: `Recherche : ${techName(r.techKey)} niv. ${r.targetLevel}`, endsAt: r.endsAt }))
  ];
  const heal = new Map();
  for (const w of wounded) {
    const e = heal.get(w.cityId) || { kind: 'HEAL', targetId: w.cityId, cityId: w.cityId, label: `Soins des blessés (${w.city.name})`, endsAt: w.healsAt };
    if (w.healsAt > e.endsAt) e.endsAt = w.healsAt;
    heal.set(w.cityId, e);
  }
  return [...out, ...heal.values()];
}

// Fin actuelle de la cible d'une demande (null si elle est finie, annulée ou n'existe plus)
async function targetEndsAt(db, req) {
  const now = new Date();
  if (req.kind === 'BUILD') {
    const b = await db.buildQueueItem.findUnique({ where: { id: req.targetId }, select: { status: true, endsAt: true } });
    return b && b.status === 'RUNNING' && b.endsAt > now ? b.endsAt : null;
  }
  if (req.kind === 'RESEARCH') {
    const r = await db.researchQueueItem.findUnique({ where: { id: req.targetId }, select: { status: true, endsAt: true } });
    return r && r.status === 'RUNNING' && r.endsAt > now ? r.endsAt : null;
  }
  const w = await db.woundedUnit.findMany({ where: { cityId: req.targetId, count: { gt: 0 }, healsAt: { gt: now } }, select: { healsAt: true } });
  return w.length ? w.reduce((m, r) => (r.healsAt > m ? r.healsAt : m), w[0].healsAt) : null;
}

// Retire `ms` à la cible (jamais avant maintenant). false si la cible n'est plus en cours.
async function shortenTarget(db, req, ms) {
  const now = Date.now();
  if (req.kind === 'BUILD' || req.kind === 'RESEARCH') {
    const model = req.kind === 'BUILD' ? db.buildQueueItem : db.researchQueueItem;
    const row = await model.findUnique({ where: { id: req.targetId }, select: { status: true, endsAt: true } });
    if (!row || row.status !== 'RUNNING' || row.endsAt.getTime() <= now) return false;
    const endsAt = new Date(Math.max(now, row.endsAt.getTime() - ms));
    const done = await model.updateMany({ where: { id: req.targetId, status: 'RUNNING', endsAt: row.endsAt }, data: { endsAt } });
    return done.count === 1;
  }
  const rows = await db.woundedUnit.findMany({ where: { cityId: req.targetId, count: { gt: 0 }, healsAt: { gt: new Date(now) } }, select: { id: true, healsAt: true } });
  if (!rows.length) return false;
  for (const r of rows) await db.woundedUnit.updateMany({ where: { id: r.id, healsAt: r.healsAt }, data: { healsAt: new Date(Math.max(now, r.healsAt.getTime() - ms)) } });
  return true;
}

// Demande de l'aide sur une cible (ou sur tout ce qui est en cours si kind est absent)
async function requestHelp(playerId, { kind, targetId } = {}) {
  const allianceId = await allianceIdOf(playerId);
  if (!allianceId) throw httpError(403, 'Rejoignez une alliance pour demander de l\'aide');
  const maxHelps = fx.allianceHelpMax(await embassyLevelOf(playerId));
  if (maxHelps <= 0) throw httpError(400, 'Améliorez votre Ambassade pour recevoir de l\'aide');
  if (kind && !KINDS.includes(kind)) throw httpError(400, 'Type d\'aide inconnu');
  let targets = await helpableTargets(playerId);
  if (kind) targets = targets.filter(t => t.kind === kind && t.targetId === targetId);
  if (kind && !targets.length) throw httpError(400, 'Rien en cours à faire accélérer ici');
  const existing = await prisma.allianceHelpRequest.findMany({ where: { playerId, targetId: { in: targets.map(t => t.targetId) } }, select: { kind: true, targetId: true, closedAt: true, allianceId: true, createdAt: true } });
  // une seule demande par cible et par alliance : une demande close (plafond atteint) n'est pas renouvelée. Les soins d'une
  // ville n'ont pas d'identifiant propre (la cible est la ville) : une nouvelle demande y est possible 6 h après la précédente.
  const healAgain = Date.now() - config.alliance.healRequestEveryHours * 3600000;
  const asked = new Set(existing.filter(e => e.allianceId === allianceId && (!e.closedAt || e.kind !== 'HEAL' || e.createdAt.getTime() > healAgain)).map(e => `${e.kind}:${e.targetId}`));
  const fresh = targets.filter(t => !asked.has(`${t.kind}:${t.targetId}`));
  if (fresh.length) await prisma.allianceHelpRequest.createMany({ data: fresh.map(t => ({ allianceId, playerId, cityId: t.cityId, kind: t.kind, targetId: t.targetId, label: t.label.slice(0, 120), maxHelps })) });
  return { created: fresh.length, already: targets.length - fresh.length, maxHelps };
}

// Ferme les demandes dont la cible est finie ; renvoie les demandes ouvertes de l'alliance, vues par `viewerId`
async function openRequests(allianceId, viewerId) {
  const rows = await prisma.allianceHelpRequest.findMany({
    where: { allianceId, closedAt: null }, orderBy: { createdAt: 'asc' }, take: 300,
    include: { player: { select: { id: true, name: true } }, given: { where: { helperId: viewerId }, select: { id: true } } }
  });
  const out = [], stale = [];
  for (const r of rows) {
    const endsAt = await targetEndsAt(prisma, r);
    if (!endsAt) { stale.push(r.id); continue; }
    out.push({ id: r.id, kind: r.kind, label: r.label, player: r.player, mine: r.playerId === viewerId, helps: r.helps, maxHelps: r.maxHelps, helped: r.given.length > 0, endsAt, createdAt: r.createdAt });
  }
  if (stale.length) await prisma.allianceHelpRequest.updateMany({ where: { id: { in: stale } }, data: { closedAt: new Date() } });
  return out;
}

// Nombre de demandes que le joueur peut aider (pastille), sans vérifier les cibles (rapide)
async function pendingCount(playerId) {
  const allianceId = await allianceIdOf(playerId);
  if (!allianceId) return 0;
  return prisma.allianceHelpRequest.count({ where: { allianceId, closedAt: null, playerId: { not: playerId }, given: { none: { helperId: playerId } } } });
}

async function pointsToday(db, helperId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  return (await db.allianceHelp.aggregate({ where: { helperId, createdAt: { gt: since } }, _sum: { points: true } }))._sum.points || 0;
}

// Une aide de `helperId` sur la demande `requestId` : { ok, points, savedMs } ou { skip: raison }
async function helpOne(helperId, allianceId, requestId) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AllianceHelpRequest" WHERE id = ${requestId} FOR UPDATE`;
    const req = await tx.allianceHelpRequest.findUnique({ where: { id: requestId } });
    if (!req || req.allianceId !== allianceId) return { skip: 'introuvable' };
    if (req.playerId === helperId) return { skip: 'la vôtre' };
    if (req.closedAt || req.helps >= req.maxHelps) return { skip: 'complète' };
    if (await tx.allianceHelp.findUnique({ where: { requestId_helperId: { requestId, helperId } } })) return { skip: 'déjà aidée' };
    const endsAt = await targetEndsAt(tx, req);
    if (!endsAt) { await tx.allianceHelpRequest.update({ where: { id: req.id }, data: { closedAt: new Date() } }); return { skip: 'terminée' }; }
    const savedMs = Math.min(helpAmountMs(endsAt.getTime() - Date.now()), endsAt.getTime() - Date.now());
    if (!(await shortenTarget(tx, req, savedMs))) return { skip: 'terminée' };
    const points = (await pointsToday(tx, helperId)) + config.alliance.helpPoints <= config.alliance.helpPointsDailyCap ? config.alliance.helpPoints : 0;
    await tx.allianceHelp.create({ data: { requestId, helperId, points } });
    const helps = req.helps + 1;
    await tx.allianceHelpRequest.update({ where: { id: req.id }, data: { helps, ...(helps >= req.maxHelps ? { closedAt: new Date() } : {}) } });
    if (points) await tx.player.update({ where: { id: helperId }, data: { alliancePoints: { increment: points } } });
    return { ok: true, points, savedMs };
  });
}

// Aide une demande, ou toutes celles de l'alliance que le joueur peut aider (requestId absent : « Tout aider »)
async function help(helperId, requestId = null) {
  const allianceId = await allianceIdOf(helperId);
  if (!allianceId) throw httpError(403, 'Vous n\'êtes pas dans une alliance');
  const ids = requestId ? [requestId] : (await prisma.allianceHelpRequest.findMany({
    where: { allianceId, closedAt: null, playerId: { not: helperId }, given: { none: { helperId } } }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 200
  })).map(r => r.id);
  let helped = 0, points = 0, savedMs = 0;
  const skipped = [];
  for (const id of ids) {
    const r = await helpOne(helperId, allianceId, id);
    if (r.ok) { helped++; points += r.points; savedMs += r.savedMs; } else skipped.push(r.skip);
  }
  if (requestId && !helped) throw httpError(409, `Aide impossible : demande ${skipped[0] || 'introuvable'}`);
  const total = (await prisma.player.findUnique({ where: { id: helperId }, select: { alliancePoints: true } }))?.alliancePoints || 0;
  return { helped, points, savedMs, alliancePoints: total, pointsCapReached: (await pointsToday(prisma, helperId)) >= config.alliance.helpPointsDailyCap };
}

// Le joueur quitte son alliance (départ, exclusion, dissolution) : ses demandes ouvertes se ferment
async function closeForPlayer(playerId, db = prisma) {
  await db.allianceHelpRequest.updateMany({ where: { playerId, closedAt: null }, data: { closedAt: new Date() } });
}

async function purgeOld() {
  const before = new Date(Date.now() - config.alliance.helpRequestMaxAgeDays * 86400000);
  return (await prisma.allianceHelpRequest.deleteMany({ where: { createdAt: { lt: before } } })).count;
}

module.exports = { KINDS, helpAmountMs, helpableTargets, requestHelp, openRequests, pendingCount, help, closeForPlayer, purgeOld, embassyLevelOf, pointsToday, httpError };
