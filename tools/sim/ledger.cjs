// Simulation longue — relevé de l'or des joueurs (rapport de vérification du 31 octobre 2026 : l'or des expéditions, celui
// des élites, le trésor des invasions sont à juger). Chaque jour, lu dans la base :
// - l'or des expéditions (Expedition.lootGained.gold : seule une expédition menée par le héros en rapporte, décision du
//   31 octobre 2026) ; le jeu efface les expéditions finies après quelques jours, d'où le relevé de chaque jour ;
// - le trésor des donjons d'invasion détruits (l'or du niveau, partagé selon les dégâts) ;
// - la Chambre au Trésor (l'or par jour de son niveau, dans la capitale de chaque joueur).
// L'or dépensé vient des compteurs des joueurs automatiques : élites, soins à l'or, espions, talents. Le reste de la
// variation de l'or des joueurs : les autres sources (camps d'or, défi de la semaine…).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));

const DAY = 86400000;
const T = config.invasion.treasure;
const treasureGold = (level) => Math.round(T.gold * Math.pow(T.goldFactor, level - 1));

const empty = () => ({ lastAt: null, gold0: null, goldNow: 0, treasury: 0, expeditions: { gold: 0, done: 0, withGold: 0 }, invasion: { gold: 0, destroyed: {} }, seenExp: {} });

async function daily(prisma, clock, L, bots) {
  const now = clock.now();
  const ids = bots.map(b => b.playerId).filter(Boolean);
  const players = await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, gold: true } });
  L.goldNow = players.reduce((t, p) => t + (p.gold || 0), 0);
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
  // Chambre au Trésor de chaque capitale, pour les jours écoulés
  const days = L.lastAt ? (now - L.lastAt) / DAY : 1;
  const chambers = await prisma.cityBuilding.findMany({ where: { key: 'TREASURE_CHAMBER', city: { isCapital: true, playerId: { in: ids } } }, select: { level: true } });
  L.treasury += Math.round(chambers.reduce((t, b) => t + fx.goldPerDayAtLevel(Math.min(20, b.level)), 0) * days);
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

module.exports = { empty, daily, view, treasureGold };
