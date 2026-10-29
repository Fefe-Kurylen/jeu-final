// ============================================================
// Effets du héros (décision du 27 octobre 2026)
// - Caractéristiques (attaque, défense, vitesse, logistique) : base + points attribués, +0,1 % par point, plafond +5 %
//   par caractéristique (GDD), soit 50 points pour l'atteindre.
// - Équipement : +0,5 % par point d'objet, plafonné à +5 % à part (GDD « équipement plafonné à 5 % »).
// - Talents (data/hero-talents.json) : effets en points de %, en plus des deux plafonds.
// Fonctions pures : le héros passé est la ligne Hero (avec `items` et `talents` quand ils sont chargés).
// ============================================================
const config = require('../config');
const catalog = require('../../data/hero-talents.json');

const POINTS_FIELD = { attack: 'atkPoints', defense: 'defPoints', speed: 'spdPoints', logistics: 'logPoints' };
// logistique (GDD) : réduit l'entretien en nourriture de l'armée qui porte le héros (décision du 29 octobre 2026)
const TALENT_OF_STAT = { attack: 'attackPct', defense: 'defensePct', speed: 'speedPct', logistics: 'upkeepPct' };
const TALENTS = new Map(catalog.branches.flatMap(b => b.talents.map(t => [t.key, { ...t, branch: b.key }])));

function equipmentPoints(hero, stat) {
  let n = 0;
  for (const item of hero?.items || []) if (item && item.slot !== 'inventory' && item.stats) n += Number(item.stats[stat]) || 0;
  return n;
}
const ranksOf = (hero) => (hero && hero.talents && typeof hero.talents === 'object' && !Array.isArray(hero.talents) ? hero.talents : {});

// Somme d'un effet de talent (en points de %)
function talent(hero, effect) {
  let v = 0;
  for (const [key, rank] of Object.entries(ranksOf(hero))) {
    const t = TALENTS.get(key);
    if (t && t.effects[effect]) v += t.effects[effect] * Math.max(0, Math.min(t.maxRank, Number(rank) || 0));
  }
  return v;
}

// Bonus d'une caractéristique, en fraction (0,05 = +5 %) : points, équipement et talent
function statPct(hero, stat) {
  if (!hero) return 0;
  const C = config.combat;
  const points = (hero[stat] || 0) + (hero[POINTS_FIELD[stat]] || 0);
  const fromPoints = Math.min(C.heroBonusMax, points * C.heroBonusPerPoint);
  const fromItems = Math.min(C.heroEquipmentMax, equipmentPoints(hero, stat) * C.heroEquipmentPerPoint);
  return fromPoints + fromItems + talent(hero, TALENT_OF_STAT[stat]) / 100;
}
const statMult = (hero, stat) => 1 + statPct(hero, stat);

// Points de talent : 1 par niveau gagné
const spentPoints = (hero) => Object.entries(ranksOf(hero)).reduce((t, [k, r]) => t + (TALENTS.has(k) ? Math.max(0, Number(r) || 0) : 0), 0);
const talentPoints = (hero) => Math.max(0, (hero?.level || 1) - 1);
const branchPoints = (ranks, branch) => Object.entries(ranks).reduce((t, [k, r]) => t + (TALENTS.get(k)?.branch === branch ? Number(r) || 0 : 0), 0);

// Un rang de plus dans un talent : null si possible, sinon la raison
function canLearn(hero, key) {
  const t = TALENTS.get(key);
  if (!t) return 'Talent inconnu';
  const ranks = ranksOf(hero);
  if ((ranks[key] || 0) >= t.maxRank) return 'Talent déjà au maximum';
  if (spentPoints(hero) >= talentPoints(hero)) return 'Plus de point de talent : le héros en gagne un par niveau';
  if (branchPoints(ranks, t.branch) < t.requires) return `Il faut ${t.requires} points dans la branche pour ce talent`;
  return null;
}

module.exports = { catalog, TALENTS, statPct, statMult, talent, talentPoints, spentPoints, branchPoints, canLearn, equipmentPoints };
