// ========== TECHNOLOGIES (data-driven) ==========
// The research tree of data/technologies.json, Travian-style: small per-level bonuses researched at the Academy,
// one research at a time per player, a technology never above the Academy level. Pure helpers shared by the
// routes, the processors, the tick and the tests; the client (frontend/js/app/06b-research.js) mirrors the formulas.
const { technologiesData, buildingsData } = require('../config/gamedata');

const RULES = Object.assign(
  { researchBuilding: 'ACADEMY', techLevelCannotExceedBuildingLevel: true, maxQueue: 2, costGrowth: 1.45, timeGrowth: 1.5, timeReductionMaxPct: 60, refundRateStarted: 0.5 },
  technologiesData.rules || {}
);
const TECHS = technologiesData.technologies || [];
const BRANCHES = technologiesData.branches || [];
const RESOURCES = ['wood', 'stone', 'iron', 'food'];

const techOf = (key) => TECHS.find(t => t.key === key) || null;
const buildingName = (key) => buildingsData.find(b => b.key === key)?.name || key;
const maxLevelOf = (tech) => tech?.maxLevel || 10;

// { TECH_KEY: level } from PlayerTechnology rows; a map is returned as is
function levelsFrom(rows) {
  if (!rows) return {};
  if (!Array.isArray(rows)) return rows;
  const m = {};
  for (const r of rows) if (r && r.techKey) m[r.techKey] = Math.max(m[r.techKey] || 0, Number(r.level) || 0);
  return m;
}

// Σ level × effect over the researched technologies, in percent points (0 when nothing is researched)
function techPct(levels, effectName) {
  const L = levelsFrom(levels);
  let total = 0;
  for (const t of TECHS) {
    const per = t.effects?.[effectName];
    const lvl = Math.min(L[t.key] || 0, maxLevelOf(t));
    if (typeof per === 'number' && lvl > 0) total += lvl * per;
  }
  return total;
}
// Multiplier form: 1 + pct / 100 (bonuses) or 1 − pct / 100 (reductions)
const techBonusMult = (levels, effectName) => 1 + techPct(levels, effectName) / 100;
const techReductionMult = (levels, effectName) => Math.max(0, 1 - techPct(levels, effectName) / 100);

// (techKey, pctPerLevel) pairs for the set-based SQL processors (production, upkeep)
function sqlKeys(effectName) {
  return TECHS.filter(t => typeof t.effects?.[effectName] === 'number').map(t => [t.key, t.effects[effectName]]);
}

// Cost of a research level: L1 × growth^(L−1), floored per resource
function researchCost(tech, targetLevel) {
  const mult = Math.pow(RULES.costGrowth, Math.max(1, targetLevel) - 1);
  const base = tech?.costL1 || {};
  return Object.fromEntries(RESOURCES.map(r => [r, Math.floor((base[r] || 0) * mult)]));
}
const scaleCost = (cost, rate) => Object.fromEntries(RESOURCES.map(r => [r, Math.floor((cost?.[r] || 0) * rate)]));

// Research time reduction of a city: Academy and Greek Temple (data: researchTimeReductionPctPerLevel), capped
function researchTimeReductionPct(buildings) {
  let total = 0;
  for (const b of buildings || []) {
    const per = buildingsData.find(d => d.key === b.key)?.effects?.researchTimeReductionPctPerLevel;
    if (typeof per === 'number') total += (b.level || 0) * per;
  }
  return Math.max(0, Math.min(RULES.timeReductionMaxPct, total));
}
// Research time of a level: L1 × growth^(L−1), reduced by the city's buildings
function researchTimeSec(tech, targetLevel, buildings) {
  const base = Math.floor((tech?.timeL1Sec || 600) * Math.pow(RULES.timeGrowth, Math.max(1, targetLevel) - 1));
  return Math.max(1, Math.floor(base * (1 - researchTimeReductionPct(buildings) / 100)));
}

// Level the next research of this technology would reach, pending items included
function nextLevelFor(tech, levels, queue) {
  const L = levelsFrom(levels);
  const pending = (queue || []).filter(q => q.techKey === tech.key && q.status !== 'COMPLETED').length;
  return (L[tech.key] || 0) + pending + 1;
}

// Why a research cannot start now (null when it can). queue = the player's RUNNING + QUEUED items
function researchBlocker(tech, levels, buildings, queue) {
  if (!tech) return 'Technologie inconnue';
  const L = levelsFrom(levels);
  const academy = (buildings || []).filter(b => b.key === RULES.researchBuilding).reduce((m, b) => (b.level > (m?.level || 0) ? b : m), null);
  if (!academy) return `${buildingName(RULES.researchBuilding)} requise`;
  const pending = (queue || []).filter(q => q.status !== 'COMPLETED');
  if (pending.length >= RULES.maxQueue) return `File de recherche pleine (max ${RULES.maxQueue})`;
  const target = nextLevelFor(tech, L, pending);
  if (target > maxLevelOf(tech)) return `Niveau maximum atteint (${maxLevelOf(tech)})`;
  if (RULES.techLevelCannotExceedBuildingLevel !== false && target > academy.level) return `${buildingName(RULES.researchBuilding)} niveau ${target} requise`;
  for (const p of tech.prereq || []) {
    if ((L[p.key] || 0) < p.level) return `Prérequis : ${techOf(p.key)?.name || p.key} niveau ${p.level}`;
  }
  return null;
}

module.exports = { RULES, TECHS, BRANCHES, RESOURCES, techOf, levelsFrom, techPct, techBonusMult, techReductionMult, sqlKeys, researchCost, scaleCost, researchTimeReductionPct, researchTimeSec, nextLevelFor, researchBlocker, maxLevelOf };
