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
// variation de l'or des joueurs : les autres sources (camps d'or, défi de la semaine, remboursements…).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const config = require(path.join(ROOT, 'src/config'));

const DAY = 86400000;
const T = config.invasion.treasure;
const treasureGold = (level) => Math.round(T.gold * Math.pow(T.goldFactor, level - 1));

const empty = () => ({ lastAt: null, gold0: null, goldNow: 0, treasury: 0, expeditions: { gold: 0, done: 0, withGold: 0 }, invasion: { gold: 0, destroyed: {} }, seenExp: {} });

// l'or de ces joueurs, tous ensemble
async function goldOf(prisma, ids) {
  const r = await prisma.player.aggregate({ where: { id: { in: ids } }, _sum: { gold: true } });
  return Number(r._sum.gold) || 0;
}
// l'étape « gold » du tick (run) : ce qu'elle verse aux joueurs va à la Chambre au Trésor du relevé. Rien d'autre ne change
// l'or pendant qu'elle tourne (les joueurs automatiques attendent la fin du tick). Une lecture qui échoue n'empêche jamais
// l'étape du jeu de tourner : ce tick n'est simplement pas compté.
async function measureTreasury(prisma, L, ids, run) {
  const before = await goldOf(prisma, ids).catch(() => null);
  const out = await run();
  const after = before === null ? null : await goldOf(prisma, ids).catch(() => null);
  if (after !== null) L.treasury += after - before;
  return out;
}

async function daily(prisma, clock, L, bots) {
  const now = clock.now();
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
  const hordes = await prisma.horde.findMany({ where: { destroyedAt: { gt: since, lte: new Date(now) } }, select: { level: true } });
  for (const h of hordes) { L.invasion.gold += treasureGold(h.level); L.invasion.destroyed[`L${h.level}`] = (L.invasion.destroyed[`L${h.level}`] || 0) + 1; }
  L.lastAt = now;
}

// le relevé à une date : sources, dépenses (compteurs des joueurs automatiques) et le reste
function view(L, bots) {
  const sum = (f) => bots.reduce((t, b) => t + (Number(f(b)) || 0), 0);
  const spent = {
    elite: sum(b => b.mem?.mil?.k?.eliteGold),
    instantHeal: sum(b => b.mem?.mil?.k?.healGold),
    spies: sum(b => b.mem?.war?.k?.spyGold),
    talents: sum(b => b.mem?.hero?.k?.resetGold)
  };
  const spentTotal = Object.values(spent).reduce((t, v) => t + v, 0);
  const income = { treasury: L.treasury, expeditions: L.expeditions.gold, invasion: L.invasion.gold };
  const known = Object.values(income).reduce((t, v) => t + v, 0);
  return { goldNow: L.goldNow, gold0: L.gold0, income: { ...income, other: Math.round((L.goldNow - (L.gold0 || 0)) + spentTotal - known) }, spent, expeditions: { done: L.expeditions.done, withGold: L.expeditions.withGold }, invasionDestroyed: L.invasion.destroyed };
}

module.exports = { empty, daily, view, measureTreasury, treasureGold };
