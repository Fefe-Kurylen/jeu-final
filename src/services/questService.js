// ============================================================
// Quêtes façon Travian (décision du 26 octobre 2026), catalogue data/quests.json
// - Tutoriel : une étape à la fois, dans l'ordre ; passable.
// - Tâches de progression : par familles et paliers (un palier visible à la fois, le suivant après la récompense).
// - Quêtes du jour (4 tirées chaque jour + un bonus quand toutes sont prises) et de la semaine (3 + bonus) : un petit
//   plus pour les joueurs actifs, compté en heures de production pour rester à l'échelle de chacun.
// - Succès permanents par paliers.
// Récompenses : ressources seules, livrées dans la ville choisie si l'entrepôt a la place.
// L'avancement se lit dans l'état du jeu (bâtiments, population…), les rapports de bataille, et des compteurs
// d'actions (QuestCounter) que le jeu incrémente : constructions, recrutements, recherches, expéditions, récoltes,
// convois, aides d'alliance. Jour et semaine à l'heure de Paris.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../config/database');
const config = require('../config');
const { buildingsData } = require('../config/gamedata');
const { getProductionAtLevel } = require('../utils/calculations');
const { lockCity } = require('../utils/db');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/quests.json'), 'utf-8'));
const RES = ['wood', 'stone', 'iron', 'food'];
const RES_NAMES = { wood: 'bois', stone: 'pierre', iron: 'fer', food: 'nourriture' };
const FIELD_PROD = { LUMBER: 'wood', QUARRY: 'stone', IRON_MINE: 'iron', FARM: 'food' };
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });
const buildingName = (key) => buildingsData.find(b => b.key === key)?.name || key;

// ---- temps : jour et semaine à l'heure de Paris ----
const TZ = 'Europe/Paris';
function parisParts(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(date).map(x => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) };
}
const pad = (n) => String(n).padStart(2, '0');
function dayKey(date = new Date()) { const p = parisParts(date); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
// décalage de Paris sur UTC à cet instant (minutes)
function parisOffsetMin(date = new Date()) {
  const asParis = new Date(date.toLocaleString('en-US', { timeZone: TZ }));
  const asUtc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((asParis - asUtc) / 60000);
}
// début du jour de Paris (instant UTC)
function dayStart(date = new Date()) { const p = parisParts(date); return new Date(Date.UTC(p.y, p.m - 1, p.d) - parisOffsetMin(date) * 60000); }
// lundi de la semaine en cours (clé "AAAA-MM-JJ") et ses jours jusqu'à aujourd'hui
function weekInfo(date = new Date()) {
  const p = parisParts(date);
  const start = new Date(dayStart(date).getTime() - p.wd * 86400000);
  const days = [];
  for (let i = 0; i <= p.wd; i++) days.push(dayKey(new Date(start.getTime() + i * 86400000 + 12 * 3600000)));
  return { key: days[0], days, start };
}

// ---- compteurs d'actions ----
async function bump(playerId, key, n = 1, db = prisma) {
  const v = Math.floor(Number(n) || 0);
  if (!playerId || v <= 0) return;
  const day = dayKey();
  await db.$executeRaw`
    INSERT INTO "QuestCounter" ("id", "playerId", "period", "key", "value")
    VALUES (${crypto.randomUUID()}, ${playerId}, ${day}, ${key}, ${v}), (${crypto.randomUUID()}, ${playerId}, 'ALL', ${key}, ${v})
    ON CONFLICT ("playerId", "period", "key") DO UPDATE SET "value" = "QuestCounter"."value" + EXCLUDED."value"`;
}
// Variante non bloquante pour la logique de jeu
function bumpLater(playerId, key, n = 1) { bump(playerId, key, n).catch(e => console.warn('[QUÊTES] compteur :', e.message)); }

// Garde 14 jours de compteurs journaliers (assez pour la semaine en cours)
async function purgeOld() {
  const before = dayKey(new Date(Date.now() - 14 * 86400000));
  return (await prisma.$executeRaw`DELETE FROM "QuestCounter" WHERE "period" <> 'ALL' AND "period" < ${before}`);
}

// ---- récompenses ----
const round10 = (v) => Math.max(0, Math.round(v / 10) * 10);
const scaled = (prod, hours, min) => Object.fromEntries(RES.map(r => [r, round10(Math.max(min, (prod[r] || 0) * hours))]));
function buildCost(key, level) {
  const def = buildingsData.find(b => b.key === key);
  const base = def?.costL1 || { wood: 100, stone: 100, iron: 80, food: 50 };
  const mult = Math.pow(config.build.costMultiplierBase, Math.max(0, level - 1));
  return Object.fromEntries(RES.map(r => [r, Math.floor((base[r] || 0) * mult)]));
}
function taskReward(t, level) {
  if (t.rewardFactor) {
    const c = buildCost(t.goal.building, level);
    return Object.fromEntries(RES.map(r => [r, round10(Math.max(50, c[r] * t.rewardFactor))]));
  }
  return Object.fromEntries(RES.map(r => [r, round10(level * (t.rewardPerLevel || 1))]));
}

// Production horaire de base de toutes les villes du joueur (champs + 5 par ressource et par ville)
function productionOf(cities) {
  const prod = { wood: 0, stone: 0, iron: 0, food: 0 };
  for (const c of cities) {
    for (const r of RES) prod[r] += 5;
    for (const b of c.buildings) { const r = FIELD_PROD[b.key]; if (r && b.level > 0) prod[r] += getProductionAtLevel(b.key, b.level, buildingsData); }
  }
  return prod;
}

// Tirage du jour / de la semaine : toujours le même pour un joueur et une période
function pickFor(pool, n, seed) {
  const scored = pool.map(q => ({ q, h: crypto.createHash('sha1').update(`${seed}:${q.key}`).digest().readUInt32BE(0) }));
  return scored.sort((a, b) => a.h - b.h).slice(0, n).map(x => x.q);
}

// ---- état du joueur ----
async function loadState(playerId) {
  const now = new Date(), today = dayKey(now), week = weekInfo(now), ds = dayStart(now);
  const [player, cities, counters, claims, techs, nonGarrison, reports] = await Promise.all([
    prisma.player.findUnique({ where: { id: playerId }, select: { id: true, population: true, tutorialDone: true, alliance: { select: { allianceId: true } }, hero: { select: { level: true } }, stats: true } }),
    prisma.city.findMany({ where: { playerId }, select: { id: true, name: true, isCapital: true, buildings: { select: { key: true, level: true, slot: true } } } }),
    prisma.questCounter.findMany({ where: { playerId, period: { in: ['ALL', ...week.days] } }, select: { period: true, key: true, value: true } }),
    prisma.questClaim.findMany({ where: { playerId, period: { in: ['', today, week.key] } }, select: { questKey: true, period: true } }),
    prisma.playerTechnology.aggregate({ where: { playerId }, _sum: { level: true } }),
    prisma.army.findFirst({ where: { ownerId: playerId, isGarrison: false, units: { some: { count: { gt: 0 } } } }, select: { id: true } }),
    // victoires des 7 derniers jours (jour, semaine) et victoires sur les tribus (tutoriel), rapports gardés 30 jours
    prisma.$queryRaw`SELECT "createdAt" >= ${ds} AS today, "createdAt" >= ${week.start} AS week, (loot->>'type') = 'TRIBE' AS tribe FROM "BattleReport" WHERE "playerId" = ${playerId} AND result = 'WIN' AND "createdAt" >= ${new Date(Math.min(week.start.getTime(), Date.now() - 30 * 86400000))}`
  ]);
  if (!player) throw httpError(404, 'Joueur introuvable');
  const cnt = (period, key) => counters.filter(c => c.key === key && (period === 'WEEK' ? week.days.includes(c.period) : c.period === period)).reduce((t, c) => t + c.value, 0);
  const wins = {
    TODAY_WIN: reports.filter(r => r.today).length, TODAY_TRIBE: reports.filter(r => r.today && r.tribe).length,
    WEEK_WIN: reports.filter(r => r.week).length, WEEK_TRIBE: reports.filter(r => r.week && r.tribe).length,
    EVER_TRIBE: reports.filter(r => r.tribe).length
  };
  const claimed = new Set(claims.map(c => `${c.questKey}|${c.period}`));
  const capital = cities.find(c => c.isCapital) || cities[0] || { buildings: [] };
  return { player, cities, capital, cnt, wins, claimed, techLevels: techs._sum.level || 0, hasArmy: !!nonGarrison, today, week, prod: productionOf(cities) };
}

const levelOf = (city, key) => (city.buildings || []).filter(b => b.key === key).reduce((m, b) => Math.max(m, b.level), 0);

// Avancement { progress, target } d'un objectif d'étape ou de tâche (au palier `level`)
function goalProgress(goal, st, level) {
  const cap = st.capital;
  switch (goal.type) {
    case 'field': {
      const lvl = level ?? goal.level;
      const fields = cap.buildings.filter(b => b.key === goal.building);
      const slots = (config.city.fieldSlots[goal.building] || []).length || fields.length || 1;
      const need = goal.all ? slots : (goal.count || 1);
      return { progress: Math.min(need, fields.filter(b => b.level >= lvl).length), target: need };
    }
    case 'anyField': {
      const best = cap.buildings.filter(b => FIELD_PROD[b.key]).reduce((m, b) => Math.max(m, b.level), 0);
      return { progress: Math.min(goal.level, best), target: goal.level };
    }
    case 'building': { const lvl = level ?? goal.level; return { progress: Math.min(lvl, levelOf(cap, goal.building)), target: lvl }; }
    case 'counterTotal': { const v = level ?? goal.value; return { progress: Math.min(v, st.cnt('ALL', goal.counter)), target: v }; }
    case 'army': return { progress: st.hasArmy ? 1 : 0, target: 1 };
    case 'reportWin': return { progress: Math.min(goal.value, st.wins.EVER_TRIBE), target: goal.value };
    case 'population': return { progress: Math.min(level, st.player.population || 0), target: level };
    case 'techLevels': return { progress: Math.min(level, st.techLevels), target: level };
    case 'heroLevel': return { progress: Math.min(level, st.player.hero?.level || 1), target: level };
    case 'cities': return { progress: Math.min(level, st.cities.length), target: level };
    case 'alliance': return { progress: st.player.alliance ? 1 : 0, target: 1 };
    default: return { progress: 0, target: 1 };
  }
}

const needsMet = (q, st) => {
  if (!q.needs) return true;
  if (q.needs === 'alliance') return !!st.player.alliance;
  if (q.needs === 'barracks') return levelOf(st.capital, 'BARRACKS') > 0;
  if (q.needs === 'army') return levelOf(st.capital, 'RALLY_POINT') > 0;
  if (q.needs === 'academy') return levelOf(st.capital, 'ACADEMY') > 0;
  if (q.needs === 'market') return st.cities.some(c => levelOf(c, 'MARKET') > 0);
  return true;
};
function periodicProgress(q, st, scope) {
  if (q.reports) return Math.min(q.value, st.wins[`${scope}_${q.reports === 'TRIBE' ? 'TRIBE' : 'WIN'}`]);
  return Math.min(q.value, st.cnt(scope === 'TODAY' ? st.today : 'WEEK', q.counter));
}

// ---- vue complète des quêtes d'un joueur ----
async function questsFor(playerId) {
  const st = await loadState(playerId);
  const isClaimed = (key, period = '') => st.claimed.has(`${key}|${period}`);
  const entry = (o) => ({ ...o, done: o.progress >= o.target, claimable: o.progress >= o.target && !o.claimed });

  // tutoriel : l'étape courante = la première non récompensée
  const steps = catalog.tutorial.map((s, i) => ({ s, i, claimed: isClaimed(s.key) }));
  const current = steps.find(x => !x.claimed);
  const tutorialFinished = st.player.tutorialDone || !current;
  const tutorial = {
    finished: tutorialFinished, skipped: st.player.tutorialDone && !!current, total: steps.length, done: steps.filter(x => x.claimed).length,
    current: tutorialFinished || !current ? null : entry({ key: current.s.key, kind: 'tutorial', index: current.i + 1, title: current.s.title, text: current.s.text, go: current.s.go, reward: current.s.reward, ...goalProgress(current.s.goal, st), claimed: false })
  };

  // tâches : le premier palier non récompensé de chaque famille
  const tasks = [];
  for (const t of catalog.tasks) {
    const level = t.levels.find(l => !isClaimed(`${t.key}:${l}`));
    if (level === undefined) continue;
    const step = t.levels.indexOf(level);
    tasks.push(entry({ key: `${t.key}:${level}`, kind: 'task', family: t.key, title: t.title, text: t.text.replace('{level}', level), step: step + 1, steps: t.levels.length, go: t.go, reward: taskReward(t, level), ...goalProgress(t.goal, st, level), claimed: false }));
  }
  // à prendre d'abord, puis dans l'ordre du catalogue (la progression logique : champs, bâtiment principal, entrepôt…)
  tasks.sort((a, b) => (b.claimable - a.claimable));

  const periodic = (def, scope, periodKey) => {
    const pool = def.pool.filter(q => needsMet(q, st));
    const picks = pickFor(pool, def.pick, `${playerId}:${periodKey}`);
    const list = picks.map(q => entry({ key: q.key, kind: scope === 'TODAY' ? 'daily' : 'weekly', title: q.title, text: q.text.replace('{value}', q.value.toLocaleString('fr-FR')), progress: periodicProgress(q, st, scope), target: q.value, reward: scaled(st.prod, def.hours, def.min), claimed: isClaimed(q.key, periodKey) }));
    const bonusKey = scope === 'TODAY' ? 'd_bonus' : 'w_bonus';
    const bonus = entry({ key: bonusKey, kind: scope === 'TODAY' ? 'daily' : 'weekly', bonus: true, title: scope === 'TODAY' ? 'Journée accomplie' : 'Semaine accomplie', text: `Prendre toutes les récompenses ${scope === 'TODAY' ? 'du jour' : 'de la semaine'}`, progress: list.filter(q => q.claimed).length, target: list.length || 1, reward: scaled(st.prod, def.bonus.hours, def.bonus.min), claimed: isClaimed(bonusKey, periodKey) });
    return { period: periodKey, quests: list, bonus };
  };
  const daily = periodic(catalog.daily, 'TODAY', st.today);
  const weekly = periodic(catalog.weekly, 'WEEK', st.week.key);
  const nextDay = new Date(dayStart().getTime() + 86400000 + 3600000);   // marge pour le changement d'heure
  daily.resetsAt = dayStart(nextDay);
  weekly.resetsAt = new Date(st.week.start.getTime() + 7 * 86400000);

  // succès : le premier palier non récompensé
  const A = catalog.achievements;
  const achievements = [];
  for (const a of A.list) {
    const tier = a.levels.findIndex(l => !isClaimed(`${a.key}:${l}`));
    if (tier < 0) continue;
    const level = a.levels[tier];
    const value = a.stat ? (st.player.stats?.[a.stat] || 0) : st.cnt('ALL', a.counter);
    achievements.push(entry({ key: `${a.key}:${level}`, kind: 'achievement', title: a.title, text: a.text.replace('{level}', level.toLocaleString('fr-FR')), step: tier + 1, steps: a.levels.length, progress: Math.min(level, value), target: level, reward: scaled(st.prod, A.hours[Math.min(tier, A.hours.length - 1)], A.min * (tier + 1)), claimed: false }));
  }

  const all = [tutorial.current, ...tasks, ...daily.quests, daily.bonus, ...weekly.quests, weekly.bonus, ...achievements].filter(Boolean);
  return { tutorial, tasks, daily, weekly, achievements, claimable: all.filter(q => q.claimable).length, production: st.prod };
}

// Nombre de récompenses à prendre (pastille du bouton Quêtes), gardé 30 s par processus : /api/player/me le demande
// à chaque rafraîchissement du jeu
const countCache = new Map();
async function claimableCount(playerId) {
  const hit = countCache.get(playerId);
  if (hit && Date.now() - hit.at < 30000) return hit.n;
  const n = (await questsFor(playerId)).claimable;
  countCache.set(playerId, { n, at: Date.now() });
  if (countCache.size > 20000) countCache.clear();
  return n;
}
const forgetCount = (playerId) => countCache.delete(playerId);

// ---- prendre une récompense ----
async function claim(playerId, questKey, cityId) {
  const view = await questsFor(playerId);
  const all = [view.tutorial.current, ...view.tasks, ...view.daily.quests, view.daily.bonus, ...view.weekly.quests, view.weekly.bonus, ...view.achievements].filter(Boolean);
  const q = all.find(x => x.key === questKey);
  if (!q) throw httpError(404, 'Quête introuvable ou déjà récompensée');
  if (!q.done) throw httpError(400, 'Objectif pas encore atteint');
  if (q.claimed) throw httpError(400, 'Récompense déjà prise');
  const period = q.kind === 'daily' ? view.daily.period : q.kind === 'weekly' ? view.weekly.period : '';
  return prisma.$transaction(async (tx) => {
    const city = await tx.city.findFirst({ where: { id: cityId || undefined, playerId }, orderBy: { isCapital: 'desc' }, select: { id: true, name: true } });
    if (!city) throw httpError(400, 'Choisissez une de vos villes');
    await lockCity(tx, city.id);
    const c = await tx.city.findUnique({ where: { id: city.id }, select: { wood: true, stone: true, iron: true, food: true, maxStorage: true, maxFoodStorage: true } });
    const full = RES.filter(r => (q.reward[r] || 0) > 0 && c[r] + q.reward[r] > (r === 'food' ? c.maxFoodStorage : c.maxStorage));
    if (full.length) throw httpError(400, `Pas assez de place dans ${city.name} pour : ${full.map(r => RES_NAMES[r]).join(', ')}. Dépensez d'abord, agrandissez l'entrepôt ou le grenier, ou choisissez une autre ville.`);
    const created = await tx.questClaim.createMany({ data: [{ playerId, questKey, period }], skipDuplicates: true });
    if (created.count !== 1) throw httpError(409, 'Récompense déjà prise');
    await tx.city.update({ where: { id: city.id }, data: Object.fromEntries(RES.filter(r => q.reward[r] > 0).map(r => [r, { increment: q.reward[r] }])) });
    if (q.kind === 'tutorial' && catalog.tutorial[catalog.tutorial.length - 1].key === questKey) await tx.player.update({ where: { id: playerId }, data: { tutorialDone: true } });
    forgetCount(playerId);
    return { message: `${q.title} : ${RES.filter(r => q.reward[r] > 0).map(r => `${q.reward[r].toLocaleString('fr-FR')} ${RES_NAMES[r]}`).join(', ')} livrés à ${city.name}`, reward: q.reward, cityId: city.id };
  });
}

async function skipTutorial(playerId) {
  await prisma.player.update({ where: { id: playerId }, data: { tutorialDone: true } });
  forgetCount(playerId);
  return { message: 'Tutoriel passé : les tâches, quêtes du jour et succès restent dans le panneau Quêtes' };
}

module.exports = { catalog, dayKey, dayStart, weekInfo, bump, bumpLater, purgeOld, questsFor, claimableCount, claim, skipTutorial, pickFor, taskReward, scaled, buildCost, productionOf, httpError };
