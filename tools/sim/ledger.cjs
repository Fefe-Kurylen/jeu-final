// Simulation longue — relevé de l'or des joueurs (rapport de vérification du 31 octobre 2026 : l'or des expéditions, celui
// des élites, le trésor des invasions sont à juger). Chaque jour, lu dans la base :
// - l'or des expéditions (Expedition.lootGained.gold : seule une expédition menée par le héros en rapporte, décision du
//   31 octobre 2026) ; le jeu efface les expéditions finies après quelques jours, d'où le relevé de chaque jour ;
// - le trésor des donjons d'invasion détruits (l'or du niveau, partagé selon les dégâts).
// La Chambre au Trésor est mesurée à chaque tick (measureTreasury, appelé par sim.cjs autour de l'étape « gold » du tick) :
// l'or des joueurs avant et après l'étape. L'estimation d'avant (l'or par jour du niveau lu ce jour-là) comptait le nouveau
// niveau pour toute la journée d'une amélioration, alors que le jeu paie l'or avant les constructions du tick : « Autres
// sources » devenait négatif (−5 091 au jour 182, analyse de la simulation du 1er novembre 2026).
// L'or dépensé vient des compteurs des joueurs automatiques : élites, soins à l'or, espions, talents. Le reste de la
// variation de l'or des joueurs : les autres sources (défi de la semaine, remboursements…).
// Analyse de la simulation du 2 novembre 2026 (rapport : « reçu par les joueurs » était le trésor de la formule) :
// - le trésor d'un donjon détruit se lit aussi tel que le serveur l'a versé : la part de chaque joueur selon ses dégâts,
//   arrondie à l'or près (hordeService.destroyHorde, lignes HordeDamage ; les joueurs supprimés n'ont rien) ;
// - les étapes « armies » et « rallies » du tick sont mesurées comme l'étape « gold » : l'or qu'elles versent est le trésor
//   des donjons et l'or que les armées rapportent chez elles (camps d'or, récoltes) ; ce dernier se lit en retirant le
//   trésor versé.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const config = require(path.join(ROOT, 'src/config'));

const DAY = 86400000;
const T = config.invasion.treasure;
const treasureGold = (level) => Math.round(T.gold * Math.pow(T.goldFactor, level - 1));
// étapes du tick mesurées (or des joueurs avant et après) -> case du relevé
const MEASURED = { gold: 'treasury', armies: 'tickArmies', rallies: 'tickRallies' };

// credited : le trésor versé ; creditedFrom : jour où sa mesure a commencé (null : depuis le début ; un relevé d'avant
// cette mesure la commence en cours de partie)
const empty = () => ({ lastAt: null, gold0: null, goldNow: 0, treasury: 0, tickArmies: 0, tickRallies: 0, measuredFrom: null, expeditions: { gold: 0, done: 0, withGold: 0 }, invasion: { gold: 0, credited: 0, creditedFrom: null, destroyed: {} }, seenExp: {} });
// un relevé écrit avant ces mesures : elles commencent maintenant (le rapport dit depuis quand)
function upgrade(L, now) {
  if (L.tickArmies === undefined) { L.tickArmies = 0; L.tickRallies = 0; L.measuredFrom = now; }
  if (L.invasion.credited === undefined) { L.invasion.credited = 0; L.invasion.creditedFrom = now; }
  return L;
}

// l'or de ces joueurs, tous ensemble
async function goldOf(prisma, ids) {
  const r = await prisma.player.aggregate({ where: { id: { in: ids } }, _sum: { gold: true } });
  return Number(r._sum.gold) || 0;
}
// une étape du tick (run, nommée `step`, voir MEASURED) : ce qu'elle verse aux joueurs va à sa case du relevé (l'étape
// « gold » : la Chambre au Trésor). Rien d'autre ne change l'or pendant qu'elle tourne (les joueurs automatiques attendent
// la fin du tick). Une lecture qui échoue n'empêche jamais l'étape du jeu de tourner : ce tick n'est simplement pas compté.
async function measureStep(prisma, L, step, ids, run) {
  const key = MEASURED[step];
  if (!key) return run();
  upgrade(L, Date.now());   // horloge simulée dans sim.cjs
  const before = await goldOf(prisma, ids).catch(() => null);
  const out = await run();
  const after = before === null ? null : await goldOf(prisma, ids).catch(() => null);
  if (after !== null) L[key] = (L[key] || 0) + after - before;
  return out;
}
const measureTreasury = (prisma, L, ids, run) => measureStep(prisma, L, 'gold', ids, run);

// le trésor versé pour ces donjons détruits : la part de chaque joueur encore là, selon ses dégâts, arrondie à l'or près
// (comme hordeService.destroyHorde)
async function treasureCredited(prisma, hordes) {
  if (!hordes.length) return 0;
  const rows = await prisma.$queryRawUnsafe(`SELECT d."hordeId" AS h, d.points, sum(d.points) OVER (PARTITION BY d."hordeId") AS total FROM "HordeDamage" d JOIN "Player" p ON p.id = d."playerId" WHERE d.points > 0 AND d."hordeId" = ANY($1::text[])`, hordes.map(h => h.id));
  const levelOf = new Map(hordes.map(h => [h.id, h.level]));
  return rows.reduce((t, r) => t + Math.floor(treasureGold(levelOf.get(r.h)) * Number(r.points) / (Number(r.total) || 1)), 0);
}

async function daily(prisma, clock, L, bots) {
  const now = clock.now();
  upgrade(L, now);
  const ids = bots.map(b => b.playerId).filter(Boolean);
  L.goldNow = await goldOf(prisma, ids);
  if (L.gold0 === null) L.gold0 = L.goldNow;
  // expéditions finies (gagnées ou perdues), une seule fois chacune
  const exps = await prisma.expedition.findMany({ where: { status: 'COMPLETED', endsAt: { gt: new Date(now - 3 * DAY), lte: new Date(now) } }, select: { id: true, lootGained: true, endsAt: true } });
  for (const e of exps) {
    if (L.seenExp[e.id]) continue;
    L.seenExp[e.id] = new Date(e.endsAt).getTime();
    const gold = Number(e.lootGained?.gold) || 0;
    L.expeditions.done++;
    if (gold > 0) { L.expeditions.withGold++; L.expeditions.gold += gold; }
  }
  for (const [id, t] of Object.entries(L.seenExp)) if (t < now - 4 * DAY) delete L.seenExp[id];
  // donjons détruits depuis le dernier relevé : leur trésor d'or
  const since = new Date(L.lastAt ?? now - DAY);
  const hordes = await prisma.horde.findMany({ where: { destroyedAt: { gt: since, lte: new Date(now) } }, select: { id: true, level: true } });
  for (const h of hordes) { L.invasion.gold += treasureGold(h.level); L.invasion.destroyed[`L${h.level}`] = (L.invasion.destroyed[`L${h.level}`] || 0) + 1; }
  L.invasion.credited += await treasureCredited(prisma, hordes).catch(() => 0);
  L.lastAt = now;
}

// Le relevé à une date : sources, dépenses (compteurs des joueurs automatiques) et le reste. Sources :
// - invasion : le trésor versé (mesuré) ; invasionFormula : le trésor de la formule du niveau, avant partage ;
// - carried : l'or rapporté par les armées (camps d'or, récoltes) = l'or versé pendant les étapes « armies » et « rallies »
//   du tick moins le trésor versé ; null si ces étapes ne sont pas mesurées depuis le début (relevé plus ancien) ;
// - other : la variation de l'or moins tout ce qui est compté (défi de la semaine, remboursements, retours hors du tick…).
function view(L, bots) {
  const sum = (f) => bots.reduce((t, b) => t + (Number(f(b)) || 0), 0);
  const spent = {
    elite: sum(b => b.mem?.mil?.k?.eliteGold),
    instantHeal: sum(b => b.mem?.mil?.k?.healGold),
    spies: sum(b => b.mem?.war?.k?.spyGold),
    talents: sum(b => b.mem?.hero?.k?.resetGold)
  };
  const spentTotal = Object.values(spent).reduce((t, v) => t + v, 0);
  const credited = L.invasion.credited === undefined || L.invasion.creditedFrom ? null : L.invasion.credited;
  const stepsGold = L.tickArmies === undefined || L.measuredFrom ? null : (L.tickArmies || 0) + (L.tickRallies || 0);
  const income = { treasury: L.treasury, expeditions: L.expeditions.gold, invasion: credited ?? L.invasion.gold };
  if (stepsGold !== null && credited !== null) income.carried = stepsGold - credited;
  const known = Object.values(income).reduce((t, v) => t + v, 0);
  return {
    goldNow: L.goldNow, gold0: L.gold0,
    income: { ...income, other: Math.round((L.goldNow - (L.gold0 || 0)) + spentTotal - known) },
    invasionFormula: L.invasion.gold, invasionCredited: L.invasion.credited ?? null, invasionCreditedFrom: L.invasion.creditedFrom ?? null, measuredFrom: L.measuredFrom ?? null,
    spent, expeditions: { done: L.expeditions.done, withGold: L.expeditions.withGold }, invasionDestroyed: L.invasion.destroyed
  };
}

module.exports = { MEASURED, empty, daily, view, measureStep, measureTreasury, treasureGold, treasureCredited };
