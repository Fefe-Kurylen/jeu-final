#!/usr/bin/env node
// Camps barbares (tribus des points de ressource) : ce qu'il faut pour les battre et ce que cela rapporte, avec les données
// et le moteur de combat du jeu. Pour chaque niveau (1 à 3, points d'or ×1,4) : effectif et puissance moyens, armée de base
// nécessaire, pertes (unités, valeur en ressources, blessés récupérables), butin immédiat et stock du point, XP du héros,
// réapparition. `node tools/simulate-tribes.cjs [--loss=0.3] [--samples=200]`
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'simulation-only-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://simulation:simulation@localhost:5432/simulation';
const path = require('path');
const R = path.join(__dirname, '..');
const config = require(R + '/src/config');
const { unitsData } = require(R + '/src/config/gamedata');
const { generateTribeDefenders, campDifficultyAt } = require(R + '/src/utils/tribeDefenders');
const { resolveCombat } = require(R + '/src/services/combatService');
const { calculateArmyPower, getArmyCarryCapacity } = require(R + '/src/utils/calculations');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.+)$/); return m ? [m[1], Number(m[2])] : [a, true]; }));
const SAMPLES = args.samples || 200;
const n = v => Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' ');
const sumCost = c => ['wood', 'stone', 'iron', 'food'].reduce((s, r) => s + (c?.[r] || 0), 0);
const unit = (k) => unitsData.find(u => u.key === k);
const AMOUNT = config.map.resourceNode.baseAmountByLevel, GOLD_AMOUNT = config.map.goldNode.lootByLevel, RESPAWN = { 1: 60, 2: 90, 3: 120 }, GOLD_RESPAWN = { 1: 120, 2: 180, 3: 240 };
const MAXF = config.map.resourceNode.maxFactor, REGEN_H = config.map.resourceNode.regenHours;
// Armée type : infanterie, archers et cavalerie de base romains à parts égales
const base = ['INFANTRY', 'ARCHER', 'CAVALRY'].map(c => unitsData.find(u => u.faction === 'ROME' && u.class === c && u.tier === 'base'));
const army = (total) => base.map(u => ({ unitKey: u.key, tier: 'base', count: Math.round(total / 3) }));
const unitCost = base.reduce((s, u) => s + sumCost(u.recruitCost), 0) / 3;
const unitPower = calculateArmyPower(army(3), unitsData) / 3;
const unitCarry = getArmyCarryCapacity(army(3), unitsData) / 3;
const woundedRate = (tent) => Math.min(config.wounded.maxRate, config.wounded.baseRate + tent * config.wounded.bonusPerHealingLevel);
const lossMult = args.loss || config.combat.tribeLossMultiplier || config.combat.winnerLossMultiplier;

console.log(`Unité de base type : ${n(unitCost)} ressources, puissance ${unitPower.toFixed(0)}, transport ${unitCarry}. Pertes du vainqueur contre un camp = ${lossMult} × (puissance tribu / puissance armée) (pillage de ville : ${config.combat.winnerLossMultiplier}) ; perdant 30 %. Une part des pertes revient blessée (Tente de soins : 30 % + 3 %/niv., Grèce, Médecine).`);
console.log('\nniveau | soldats | puissance | armée de base pour gagner (×1,2) | pertes (unités / ressources) | blessés tente 1 / 10 | butin immédiat | stock max du point (régén./h) | remboursement des pertes en tenant le point | XP héros | réapparition');
for (const gold of [false, true]) for (const level of [1, 2, 3]) {
  let soldiers = 0, power = 0;
  for (let i = 0; i < SAMPLES; i++) { const t = generateTribeDefenders(level, gold, 1); soldiers += Object.values(t.units).reduce((a, b) => a + b, 0); power += t.power; }
  soldiers /= SAMPLES; power /= SAMPLES;
  const needed = Math.ceil(power * 1.2 / unitPower);
  const tribe = generateTribeDefenders(level, gold, 1);
  const r = resolveCombat(army(needed), Object.entries(tribe.units).map(([unitKey, count]) => ({ unitKey, count, tier: unit(unitKey)?.tier || 'base' })), 0, null, null, {});
  const lossRate = lossMult * r.defenderPower / Math.max(1, r.attackerPower);
  const lost = needed * lossRate;
  const kills = soldiers * config.combat.loserLossRate;
  const amount = (gold ? GOLD_AMOUNT : AMOUNT)[level];
  const loot = Math.min(amount, (needed - lost) * unitCarry);
  const maxStock = gold ? amount : amount * MAXF, perHour = gold ? amount / config.map.goldNode.intervalHours : amount * MAXF / REGEN_H;
  const payback = gold ? '—' : `${(Math.max(0, lost * unitCost - loot) / perHour).toFixed(1)} h`;
  console.log(`${gold ? 'or ' : ''}${level}`.padStart(6) + ` | ${n(soldiers)} | ${n(power)} | ${n(needed)} unités (${n(needed * unitCost)} res.) | ${n(lost)} / ${n(lost * unitCost)} | ${n(lost * (1 - woundedRate(1)))} / ${n(lost * (1 - woundedRate(10)))} morts | ${n(loot)} ${gold ? 'or' : 'res.'} | ${n(maxStock)} (${n(perHour)}/h) | ${payback} | ${n(kills * config.combat.heroXpPerTribeKill)} | ${(gold ? GOLD_RESPAWN : RESPAWN)[level]} min`);
}
// Difficulté selon la position : bords (où les joueurs apparaissent) → centre (fin de partie), ± variation entre camps
console.log('\n=== Difficulté par position (config.map.camps) : soldats d\'un camp de niveau 1 et 3 ===');
for (const [label, x] of [['bord de carte', config.map.maxCoord], ['à mi-chemin', Math.round(config.map.maxCoord / 2)], ['centre', 0]]) {
  const d = campDifficultyAt(x, 0);
  const avg = (level) => { let s = 0; for (let i = 0; i < SAMPLES; i++) s += Object.values(generateTribeDefenders(level, false, 1, null, d).units).reduce((a, b) => a + b, 0); return s / SAMPLES; };
  console.log(`${label.padEnd(14)} difficulté ×${d.toFixed(2)} : niveau 1 ≈ ${n(avg(1))} soldats (${n(avg(1) * unitPower * 1.2 / unitPower)} unités de base pour gagner), niveau 3 ≈ ${n(avg(3))} soldats ; ± ${config.map.camps.variationPct} % d'un camp à l'autre`);
}
console.log('\nLecture : les pertes ne dépendent pas de la taille de l\'armée (≈ ' + lossMult + ' × puissance de la tribu / puissance d\'une unité), donc le coût d\'un camp est fixe ; le butin immédiat est borné par le transport des survivants, le reste du point se récolte à 100 par minute en restant sur place (le point se régénère en 4 h, 24 h pour l\'or).');
