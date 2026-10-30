// ============================================================
// Défi d'alliance de la semaine (GDD « Compétitions alliances », décision du 29 octobre 2026)
// - Chaque semaine (lundi 0 h → lundi 0 h, heure de Paris, comme les classements), un thème tiré au sort parmi ce que le
//   jeu compte déjà : points d'attaque, points de défense, pillage, progression de population, aides données aux
//   membres, dégâts infligés aux donjons d'invasion. Jamais deux semaines de suite le même thème.
// - Classement des alliances en direct (membres actuels). À la clôture de la semaine, les 3 premières gagnent des
//   points d'alliance pour chacun de leurs membres (300 / 200 / 100) et une médaille d'alliance.
// - Entraide et Chasseurs de hordes se lisent dans les compteurs journaliers (QuestCounter, jours de Paris de la
//   semaine) : une aide ou des dégâts comptent la semaine où ils ont lieu, même si la demande d'aide est purgée ensuite.
// ============================================================
const prisma = require('../config/database');
const { weekInfo } = require('./questService');
const { notify } = require('./pushService');

const THEMES = {
  ATTACK: { label: 'Assaut', what: 'points d\'attaque gagnés par les membres', unit: 'pts' },
  DEFENSE: { label: 'Rempart', what: 'points de défense gagnés par les membres', unit: 'pts' },
  LOOT: { label: 'Butin', what: 'ressources pillées par les membres', unit: 'ress.' },
  CLIMB: { label: 'Bâtisseurs', what: 'population gagnée par les membres', unit: 'hab.' },
  HELP: { label: 'Entraide', what: 'aides données entre membres', unit: 'aides' },
  DUNGEON: { label: 'Chasseurs de hordes', what: 'dégâts infligés aux donjons barbares', unit: 'pts' }
};
const ORDER = Object.keys(THEMES);
const REWARD_POINTS = [300, 200, 100];

const hashOf = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// clé de jour décalée de n jours (calendrier de Paris : les clés sont des dates)
const shiftKey = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const prevKey = (key) => shiftKey(key, -7);
// les 7 jours (lundi → dimanche) d'une semaine : clés des compteurs journaliers
const daysOf = (week) => Array.from({ length: 7 }, (_, i) => shiftKey(week, i));
// compteur journalier lu par les thèmes qui ne sont pas dans les classements de la semaine
const COUNTER = { HELP: 'help_given', DUNGEON: 'horde_points' };
// thème de la semaine : tiré de la date du lundi, jamais celui de la semaine d'avant
function themeFor(week) {
  const pick = (k) => ORDER[hashOf(k) % ORDER.length];
  let t = pick(week);
  if (t === pick(prevKey(week))) t = ORDER[(ORDER.indexOf(t) + 1) % ORDER.length];
  return t;
}
// bornes d'une semaine (Paris) à partir de sa clé : jusqu'au lundi 0 h suivant (167 ou 169 h aux changements d'heure)
function boundsOf(week) {
  const startOf = (k) => weekInfo(new Date(`${k}T12:00:00Z`)).start;
  return { start: startOf(week), end: startOf(shiftKey(week, 7)) };
}

// classement des alliances pour un thème et une semaine : [{ allianceId, tag, name, value }]
async function scores(week, theme = themeFor(week), limit = 10) {
  const q = (sql, ...a) => prisma.$queryRawUnsafe(sql, ...a);
  const field = { ATTACK: 'attackPoints', DEFENSE: 'defensePoints', LOOT: 'loot' }[theme];
  let rows;
  if (field) rows = await q(`SELECT a.id AS "allianceId", a.tag, a.name, SUM(w."${field}")::int AS value FROM "PlayerWeekStats" w JOIN "AllianceMember" m ON m."playerId" = w."playerId" JOIN "Alliance" a ON a.id = m."allianceId" WHERE w.week = $1 GROUP BY a.id HAVING SUM(w."${field}") > 0 ORDER BY value DESC, a.tag LIMIT ${Number(limit)}`, week);
  else if (theme === 'CLIMB') rows = await q(`SELECT a.id AS "allianceId", a.tag, a.name, SUM(GREATEST(0, p.population - w."popStart"))::int AS value FROM "PlayerWeekStats" w JOIN "Player" p ON p.id = w."playerId" JOIN "AllianceMember" m ON m."playerId" = w."playerId" JOIN "Alliance" a ON a.id = m."allianceId" WHERE w.week = $1 GROUP BY a.id HAVING SUM(GREATEST(0, p.population - w."popStart")) > 0 ORDER BY value DESC, a.tag LIMIT ${Number(limit)}`, week);
  else if (COUNTER[theme]) rows = await q(`SELECT a.id AS "allianceId", a.tag, a.name, SUM(c."value")::int AS value FROM "QuestCounter" c JOIN "AllianceMember" m ON m."playerId" = c."playerId" JOIN "Alliance" a ON a.id = m."allianceId" WHERE c."key" = $1 AND c."period" IN ($2, $3, $4, $5, $6, $7, $8) GROUP BY a.id HAVING SUM(c."value") > 0 ORDER BY value DESC, a.tag LIMIT ${Number(limit)}`, COUNTER[theme], ...daysOf(week));
  else rows = [];
  return rows;
}

// la semaine en cours, pour un joueur : thème, classement, place de son alliance
async function current(playerId, now = new Date()) {
  const week = weekInfo(now);
  const theme = themeFor(week.key);
  const rows = await scores(week.key, theme, 200);
  const member = playerId ? await prisma.allianceMember.findUnique({ where: { playerId } }) : null;
  const mineIdx = member ? rows.findIndex(r => r.allianceId === member.allianceId) : -1;
  return {
    week: week.key, endsAt: boundsOf(week.key).end, theme, ...THEMES[theme], rewards: REWARD_POINTS,
    rows: rows.slice(0, 10).map((r, i) => ({ rank: i + 1, ...r, mine: r.allianceId === member?.allianceId })),
    me: member ? { inAlliance: true, rank: mineIdx >= 0 ? mineIdx + 1 : null, value: mineIdx >= 0 ? rows[mineIdx].value : 0 } : { inAlliance: false }
  };
}

// clôture (appelée à la clôture de la semaine des classements) : points d'alliance et médailles des 3 premières
async function close(week) {
  const theme = themeFor(week);
  const top = await scores(week, theme, 3);
  for (const [i, r] of top.entries()) {
    const pts = REWARD_POINTS[i];
    const members = await prisma.allianceMember.findMany({ where: { allianceId: r.allianceId }, select: { playerId: true } });
    await prisma.$transaction([
      prisma.player.updateMany({ where: { id: { in: members.map(m => m.playerId) } }, data: { alliancePoints: { increment: pts } } }),
      prisma.medal.create({ data: { allianceId: r.allianceId, week, category: `CHALLENGE_${theme}`, rank: i + 1, value: r.value, name: `[${r.tag}]` } })
    ]);
    for (const m of members) notify(m.playerId, 'ranking', '🏆 Défi d\'alliance', `Défi « ${THEMES[theme].label} » : votre alliance termine ${i + 1}${i === 0 ? 're' : 'e'} (${r.value.toLocaleString('fr-FR')} ${THEMES[theme].unit}). +${pts} points d'alliance pour chaque membre et une médaille.`, { to: 'alliance', sub: 'overview' });
  }
  return { theme, winners: top.length };
}

module.exports = { THEMES, ORDER, REWARD_POINTS, COUNTER, themeFor, boundsOf, daysOf, scores, current, close };
