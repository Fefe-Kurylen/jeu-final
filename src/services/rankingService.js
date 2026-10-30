// ============================================================
// Classements (décision du 27 octobre 2026, GDD world_config.server.rankings : population, attaque, défense, alliance)
// - Points de combat façon Travian : un ennemi tué vaut son entretien en nourriture (base 5, intermédiaire 10, élite et
//   siège 15, GDD) ; l'attaquant gagne des points d'attaque, le défenseur des points de défense, partagés entre les
//   joueurs d'un même camp selon le nombre de soldats engagés. Pillage : ressources prises aux autres joueurs.
// - Semaine (lundi 0 h, heure de Paris) : top 10 en attaque, défense, pillage et progression de population ; top 3 des
//   alliances en attaque et en défense. Les classés reçoivent une médaille honorifique, gardée sur leur profil.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { unitsData } = require('../config/gamedata');
const { weekInfo } = require('./questService');
const { notify } = require('./pushService');

const UPKEEP = config.army.upkeepPerTier;
const tierOf = (key) => unitsData.find(u => u.key === key)?.tier || 'base';
// valeur des pertes : [{ key|unitKey, killed }] ou [{ key, initial, remaining }]
function pointsOf(losses) {
  let p = 0;
  for (const l of losses || []) {
    const n = l.killed ?? Math.max(0, (l.initial || 0) - (l.remaining || 0));
    if (n > 0) p += n * (UPKEEP[tierOf(l.key || l.unitKey)] || 5);
  }
  return Math.round(p);
}
// part de chaque joueur d'un camp, selon les soldats qu'il engage : [{ playerId, units }]
function shares(side) {
  const by = new Map();
  for (const s of side || []) if (s?.playerId) by.set(s.playerId, (by.get(s.playerId) || 0) + Math.max(0, s.units || 0));
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  if (!total) return [...by.keys()].map(id => [id, 1 / Math.max(1, by.size)]);
  return [...by.entries()].map(([id, n]) => [id, n / total]);
}
const unitCount = (units) => (units || []).reduce((t, u) => t + (u.count || 0), 0);

async function add(tx, playerId, field, value) {
  const v = Math.floor(value);
  if (!playerId || v <= 0) return;
  const week = weekInfo().key;
  await tx.playerStats.upsert({ where: { playerId }, update: { [field]: { increment: v } }, create: { playerId, [field]: v } });
  // la ligne de la semaine naît d'ordinaire au relevé du lundi (snapshotWeek) ; sinon ici, avec la population du moment
  await tx.$executeRawUnsafe(
    `INSERT INTO "PlayerWeekStats" ("id", "playerId", "week", "${field}", "popStart") SELECT gen_random_uuid(), $1, $2, $3, COALESCE((SELECT population FROM "Player" WHERE id = $1), 0)
     ON CONFLICT ("playerId", "week") DO UPDATE SET "${field}" = "PlayerWeekStats"."${field}" + EXCLUDED."${field}"`, playerId, week, v);
}

// Un combat : `attackers` / `defenders` = [{ playerId, units }] (défenseurs vides pour une tribu), pertes de chaque camp
async function recordCombat(tx, { attackers, defenders, attackerLosses, defenderLosses }) {
  const atkPts = pointsOf(defenderLosses), defPts = pointsOf(attackerLosses);
  if (atkPts > 0) for (const [id, share] of shares(attackers)) await add(tx, id, 'attackPoints', atkPts * share);
  if (defPts > 0) for (const [id, share] of shares(defenders)) await add(tx, id, 'defensePoints', defPts * share);
  return { atkPts, defPts };
}
const recordLoot = (tx, playerId, amount) => add(tx, playerId, 'loot', amount);
const sideOf = (armies) => (armies || []).map(a => ({ playerId: a.ownerId, units: unitCount(a.units) }));

// ---- semaine : clôture du lundi, médailles ----
const PLAYER_CATS = { ATTACK: 'attackPoints', DEFENSE: 'defensePoints', LOOT: 'loot' };
const CAT_LABEL = { ATTACK: 'attaquants', DEFENSE: 'défenseurs', LOOT: 'pilleurs', CLIMB: 'progression', ALLIANCE_ATTACK: 'alliances en attaque', ALLIANCE_DEFENSE: 'alliances en défense' };

async function weekTop(week, category, limit = 10) {
  if (category === 'CLIMB') {
    // progression : population actuelle moins celle relevée au début de la semaine (ou à l'arrivée du joueur)
    const rows = await prisma.$queryRawUnsafe(`SELECT w."playerId", p.name, p.faction, (p.population - w."popStart")::int AS value FROM "PlayerWeekStats" w JOIN "Player" p ON p.id = w."playerId" WHERE w.week = $1 AND p.population > w."popStart" ORDER BY value DESC, p.name LIMIT ${Number(limit)}`, week);
    return rows;
  }
  const f = PLAYER_CATS[category];
  if (!f) return [];
  return prisma.$queryRawUnsafe(`SELECT w."playerId", p.name, p.faction, w."${f}"::int AS value FROM "PlayerWeekStats" w JOIN "Player" p ON p.id = w."playerId" WHERE w.week = $1 AND w."${f}" > 0 ORDER BY w."${f}" DESC, p.name LIMIT ${Number(limit)}`, week);
}
async function allianceWeekTop(week, field, limit = 3) {
  return prisma.$queryRawUnsafe(`SELECT a.id AS "allianceId", a.tag, a.name, SUM(w."${field}")::int AS value FROM "PlayerWeekStats" w JOIN "AllianceMember" m ON m."playerId" = w."playerId" JOIN "Alliance" a ON a.id = m."allianceId" WHERE w.week = $1 GROUP BY a.id, a.tag, a.name HAVING SUM(w."${field}") > 0 ORDER BY value DESC, a.tag LIMIT ${Number(limit)}`, week);
}

// La semaine qui vient de finir est close une fois : médailles, prévenus ; les lignes des semaines anciennes sont purgées
async function closeWeek(week) {
  const claimed = await prisma.rankingWeek.createMany({ data: [{ week }], skipDuplicates: true });
  if (!claimed.count) return null;
  const medals = [];
  for (const cat of ['ATTACK', 'DEFENSE', 'LOOT', 'CLIMB']) {
    (await weekTop(week, cat, 10)).forEach((r, i) => medals.push({ playerId: r.playerId, week, category: cat, rank: i + 1, value: r.value, name: r.name }));
  }
  for (const [cat, field] of [['ALLIANCE_ATTACK', 'attackPoints'], ['ALLIANCE_DEFENSE', 'defensePoints']]) {
    (await allianceWeekTop(week, field, 3)).forEach((r, i) => medals.push({ allianceId: r.allianceId, week, category: cat, rank: i + 1, value: r.value, name: `[${r.tag}]` }));
  }
  if (medals.length) await prisma.medal.createMany({ data: medals });
  try { await require('./challengeService').close(week); } catch (e) { console.error('[DÉFI] clôture :', e.message); }   // défi d'alliance de la semaine
  for (const m of medals) {
    if (m.playerId) notify(m.playerId, 'ranking', '🏅 Médaille de la semaine', `${m.rank}${m.rank === 1 ? 'er' : 'e'} des ${CAT_LABEL[m.category]} de la semaine (${m.value.toLocaleString('fr-FR')}).`, { to: 'ranking' });
  }
  const old = new Date(Date.now() - 8 * 7 * 86400000);
  await prisma.playerWeekStats.deleteMany({ where: { week: { lt: old.toISOString().slice(0, 10) } } });
  return medals.length;
}
// Population de départ de la semaine pour tous les joueurs (progression, défi « Bâtisseurs »), qu'ils combattent ou non :
// relevée au premier tick de la semaine, puis pour chaque nouveau joueur dès que sa population est calculée.
// Une ligne déjà là (relevé ou premier combat) garde la sienne.
async function snapshotWeek(now = new Date()) {
  return prisma.$executeRawUnsafe(
    `INSERT INTO "PlayerWeekStats" ("id", "playerId", "week", "popStart") SELECT gen_random_uuid(), p.id, $1, p.population FROM "Player" p
     WHERE p.population > 0 AND NOT EXISTS (SELECT 1 FROM "PlayerWeekStats" w WHERE w."playerId" = p.id AND w.week = $1)
     ON CONFLICT ("playerId", "week") DO NOTHING`, weekInfo(now).key);
}

// Tick : relevé de la semaine en cours ; à partir du lundi, la semaine précédente est close si elle ne l'est pas encore
async function processRankings(now = new Date()) {
  try { await snapshotWeek(now); } catch (e) { console.error('[CLASSEMENTS] relevé de la semaine :', e.message); }
  const current = weekInfo(now).key;
  const previous = weekInfo(new Date(weekInfo(now).start.getTime() - 12 * 3600000)).key;
  if (previous === current) return null;
  if (await prisma.rankingWeek.findUnique({ where: { week: previous } })) return null;
  const seen = await prisma.playerWeekStats.count({ where: { week: previous } });
  if (!seen) {
    const claimed = await prisma.rankingWeek.createMany({ data: [{ week: previous }], skipDuplicates: true });
    if (claimed.count) { try { await require('./challengeService').close(previous); } catch (e) { console.error('[DÉFI] clôture :', e.message); } }   // aides ou donjons sans combat de joueur
    return 0;
  }
  return closeWeek(previous);
}

module.exports = { pointsOf, shares, recordCombat, recordLoot, sideOf, unitCount, weekTop, allianceWeekTop, closeWeek, snapshotWeek, processRankings, CAT_LABEL, PLAYER_CATS, UPKEEP };
