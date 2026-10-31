// ============================================================
// Défi d'alliance de la semaine (GDD « Compétitions alliances », décision du 29 octobre 2026)
// - Chaque semaine (lundi 0 h → lundi 0 h, heure de Paris, comme les classements), un thème tiré au sort parmi ce que le
//   jeu compte déjà : points d'attaque, points de défense, pillage, progression de population, aides données aux
//   membres, dégâts infligés aux donjons d'invasion. Jamais deux semaines de suite le même thème.
// - Classement des alliances en direct (membres actuels), sur le total des membres ÷ max(membres, 20) depuis le 31 octobre
//   2026 (rapport de vérification : la plus grosse alliance ne gagne plus à coup sûr ; config.alliance.challengeMinMembers).
//   À la clôture de la semaine, les 3 premières gagnent des points d'alliance pour chacun de leurs membres (750 / 500 / 250
//   depuis le 30 octobre 2026) et une médaille d'alliance.
// - Seuls les membres arrivés avant le vendredi 0 h de la semaine (heure de Paris, config.alliance.challengeJoinDeadline)
//   comptent dans le score et touchent la récompense : une recrue de fin de semaine n'apporte ni ne prend rien.
// - Entraide et Chasseurs de hordes se lisent dans les compteurs journaliers (QuestCounter, jours de Paris de la
//   semaine) : une aide ou des dégâts comptent la semaine où ils ont lieu, même si la demande d'aide est purgée ensuite.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { weekInfo, dayStart } = require('./questService');
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
const REWARD_POINTS = config.alliance.challengeRewardPoints;

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
// limite d'arrivée dans l'alliance pour compter dans le défi : le vendredi 0 h de la semaine, heure de Paris
function joinDeadline(week) {
  const { day, hour } = config.alliance.challengeJoinDeadline;   // 1 = lundi … 5 = vendredi
  return new Date(dayStart(new Date(`${shiftKey(week, day - 1)}T12:00:00Z`)).getTime() + (hour || 0) * 3600000);
}

// Ce que compte un thème : la somme `sum` sur les lignes `from` (jointes aux membres m), filtrées par `where` avec `args`
function themeSource(theme, week) {
  const field = { ATTACK: 'attackPoints', DEFENSE: 'defensePoints', LOOT: 'loot' }[theme];
  if (field) return { sum: `w."${field}"`, from: '"PlayerWeekStats" w JOIN "AllianceMember" m ON m."playerId" = w."playerId"', where: 'w.week = $1', args: [week] };
  if (theme === 'CLIMB') return { sum: 'GREATEST(0, p.population - w."popStart")', from: '"PlayerWeekStats" w JOIN "Player" p ON p.id = w."playerId" JOIN "AllianceMember" m ON m."playerId" = w."playerId"', where: 'w.week = $1', args: [week] };
  if (COUNTER[theme]) return { sum: 'c."value"', from: '"QuestCounter" c JOIN "AllianceMember" m ON m."playerId" = c."playerId"', where: 'c."key" = $1 AND c."period" IN ($2, $3, $4, $5, $6, $7, $8)', args: [COUNTER[theme], ...daysOf(week)] };
  return null;
}

// classement des alliances pour un thème et une semaine : [{ allianceId, tag, name, total, members, value }] ; membres
// actuels arrivés avant la limite de la semaine (joinDeadline). Score `value` (décision du 31 octobre 2026, rapport de
// vérification) : total des membres ÷ max(membres comptés, config.alliance.challengeMinMembers), à 0,1 près
async function scores(week, theme = themeFor(week), limit = 10) {
  const src = themeSource(theme, week);
  if (!src) return [];
  const deadline = `$${src.args.length + 1}`;
  const minMembers = Number(config.alliance.challengeMinMembers);
  return prisma.$queryRawUnsafe(`SELECT a.id AS "allianceId", a.tag, a.name, SUM(${src.sum})::int AS total, mc.members, ROUND(SUM(${src.sum})::numeric / GREATEST(mc.members, ${minMembers}), 1)::float AS value FROM ${src.from} JOIN "Alliance" a ON a.id = m."allianceId" JOIN (SELECT "allianceId", COUNT(*)::int AS members FROM "AllianceMember" WHERE "joinedAt" < ${deadline} GROUP BY "allianceId") mc ON mc."allianceId" = a.id WHERE ${src.where} AND m."joinedAt" < ${deadline} GROUP BY a.id, mc.members HAVING SUM(${src.sum}) > 0 ORDER BY value DESC, total DESC, a.tag LIMIT ${Number(limit)}`, ...src.args, joinDeadline(week));
}

// la semaine en cours, pour un joueur : thème, classement, place de son alliance
async function current(playerId, now = new Date()) {
  const week = weekInfo(now);
  const theme = themeFor(week.key);
  const rows = await scores(week.key, theme, 200);
  const member = playerId ? await prisma.allianceMember.findUnique({ where: { playerId } }) : null;
  const mineIdx = member ? rows.findIndex(r => r.allianceId === member.allianceId) : -1;
  const joinBy = joinDeadline(week.key);
  return {
    week: week.key, endsAt: boundsOf(week.key).end, theme, ...THEMES[theme], rewards: REWARD_POINTS, joinDeadline: joinBy, minMembers: config.alliance.challengeMinMembers,
    rows: rows.slice(0, 10).map((r, i) => ({ rank: i + 1, ...r, mine: r.allianceId === member?.allianceId })),
    // eligible : arrivé avant la limite, il compte et sera récompensé
    me: member ? { inAlliance: true, rank: mineIdx >= 0 ? mineIdx + 1 : null, value: mineIdx >= 0 ? rows[mineIdx].value : 0, eligible: new Date(member.joinedAt) < joinBy } : { inAlliance: false }
  };
}

// clôture (appelée à la clôture de la semaine des classements) : points d'alliance et médailles des 3 premières ; seuls
// les membres arrivés avant la limite de la semaine sont payés
async function close(week) {
  const theme = themeFor(week);
  const top = await scores(week, theme, 3);
  const deadline = joinDeadline(week);
  for (const [i, r] of top.entries()) {
    const pts = REWARD_POINTS[i];
    const members = await prisma.allianceMember.findMany({ where: { allianceId: r.allianceId, joinedAt: { lt: deadline } }, select: { playerId: true } });
    await prisma.$transaction([
      prisma.player.updateMany({ where: { id: { in: members.map(m => m.playerId) } }, data: { alliancePoints: { increment: pts } } }),
      prisma.medal.create({ data: { allianceId: r.allianceId, week, category: `CHALLENGE_${theme}`, rank: i + 1, value: Math.round(r.value), name: `[${r.tag}]` } })
    ]);
    for (const m of members) notify(m.playerId, 'ranking', '🏆 Défi d\'alliance', `Défi « ${THEMES[theme].label} » : votre alliance termine ${i + 1}${i === 0 ? 're' : 'e'} (${r.value.toLocaleString('fr-FR')} ${THEMES[theme].unit} par membre). +${pts} points d'alliance pour chaque membre et une médaille.`, { to: 'alliance', sub: 'overview' });
  }
  return { theme, winners: top.length };
}

module.exports = { THEMES, ORDER, REWARD_POINTS, COUNTER, themeFor, boundsOf, joinDeadline, daysOf, scores, current, close };
