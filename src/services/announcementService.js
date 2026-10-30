// Annonces de l'équipe à tous les joueurs (décision du 29 octobre 2026, écran d'administration) :
// une notification dans le fil de chaque joueur, un push sur les téléphones si demandé (envoyé en tâche de fond, par
// paquets), un bandeau en haut de l'écran jusqu'à la date choisie (maintenance, événement).
const prisma = require('../config/database');
const { httpError, writeLog } = require('./adminService');

const MAX_BANNER_HOURS = 24 * 30;

async function create(actor, { title, body, bannerHours, push }) {
  const t = String(title || '').trim().replace(/\s+/g, ' ');
  const b = String(body || '').trim().replace(/[ \t]+/g, ' ');
  if (t.length < 3 || t.length > 80) throw httpError(400, 'Titre : 3 à 80 caractères');
  if (b.length < 3 || b.length > 500) throw httpError(400, 'Texte : 3 à 500 caractères');
  const h = Math.round(Number(bannerHours) || 0);
  if (h < 0 || h > MAX_BANNER_HOURS) throw httpError(400, `Bandeau : de 0 (aucun) à ${MAX_BANNER_HOURS} heures`);
  const bannerUntil = h > 0 ? new Date(Date.now() + h * 3600000) : null;
  const a = await prisma.$transaction(async (tx) => {
    const row = await tx.announcement.create({ data: { title: t, body: b, bannerUntil, push: !!push, authorName: actor.name } });
    const recipients = await tx.$executeRaw`INSERT INTO "Notification" ("id", "playerId", "kind", "title", "body", "link") SELECT gen_random_uuid(), p.id, 'announcement', ${`📣 ${t}`}, ${b}, ${JSON.stringify({ to: 'announcement', tab: 'city', id: row.id })}::jsonb FROM "Player" p`;
    await tx.announcement.update({ where: { id: row.id }, data: { recipients } });
    await writeLog(tx, actor, 'ANNOUNCE', null, { title: t, bannerHours: h, push: !!push, recipients });
    return { ...row, recipients };
  });
  if (push) pushAll(t, b).catch(e => console.warn('[ANNONCE] push :', e.message));
  return a;
}

// push à tous les joueurs qui ont un téléphone enregistré, 25 à la fois (sans nouvelle ligne dans le fil : elle y est déjà)
async function pushAll(title, body) {
  const push = require('./pushService');
  if (!push.configured()) return 0;
  const ids = (await prisma.pushToken.findMany({ distinct: ['playerId'], select: { playerId: true } })).map(r => r.playerId);
  for (let i = 0; i < ids.length; i += 25) {
    await Promise.all(ids.slice(i, i + 25).map(id => push.notifyPlayer(id, 'announcement', `📣 ${title}`, body, { to: 'city' }, { feed: false })));
  }
  console.log(`[ANNONCE] push envoyé à ${ids.length} joueurs`);
  return ids.length;
}

// bandeaux en cours (les plus récents d'abord)
const active = (now = new Date()) => prisma.announcement.findMany({ where: { bannerUntil: { gt: now } }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, title: true, body: true, bannerUntil: true, createdAt: true } });
const recent = () => prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
async function endBanner(actor, id) {
  const a = await prisma.announcement.findUnique({ where: { id: String(id) } });
  if (!a) throw httpError(404, 'Annonce introuvable');
  await prisma.$transaction(async (tx) => {
    await tx.announcement.update({ where: { id: a.id }, data: { bannerUntil: new Date() } });
    await writeLog(tx, actor, 'ANNOUNCE_END', null, { title: a.title });
  });
  return { message: 'Bandeau retiré' };
}

module.exports = { create, active, recent, endBanner, pushAll, MAX_BANNER_HOURS };
