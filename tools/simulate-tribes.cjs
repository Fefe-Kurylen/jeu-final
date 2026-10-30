#!/usr/bin/env node
// Camps barbares (tribus des points de ressource) : ce qu'il faut pour les battre et ce que cela rapporte, avec les données
// et le moteur de combat du jeu. Pour chaque niveau (1 à 3, points d'or ×1,4) : effectif et puissance moyens, armée de base
// nécessaire, pertes (unités, valeur en ressources, blessés récupérables), butin immédiat et stock du point, XP du héros,
// réapparition. Combat comme armyService.resolveTribeCombat : chaque défenseur à son palier, camp d'or à +40 % (config.map.camps
// .goldDefenseBonusPct, décision du 30 octobre 2026) ; armée sans bonus de civilisation ni héros.
// `node tools/simulate-tribes.cjs [--loss=0.3] [--samples=200]`
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'simulation-only-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://simulation:simulation@localhost:5432/simulation';
const path = require('path');
const R = path.join(__dirname, '..');
const config = require(R + '/src/config');
const { unitsData } = require(R + '/src/config/gamedata');
const { generateTribeDefenders, campDifficultyAt, campUnits, campBonusPct } = require(R + '/src/utils/tribeDefenders');
const { resolveCombat } = require(R + '/src/services/combatService');
const { calculateArmyPower, getArmyCarryCapacity } = require(R + '/src/utils/calculations');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.+)$/); return m ? [m[1], Number(m[2])] : [a, true]; }));
const SAMPLES = args.samples || 200;
const n = v => Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' ');
const sumCost = c => ['wood', 'stone', 'iron', 'food'].reduce((s, r) => s + (c?.[r] || 0), 0);
// réapparition comme src/game/seed.js : 30 + 30 × niveau min (or : 60 + 60 × niveau)
const AMOUNT = config.map.resourceNode.baseAmountByLevel, GOLD_AMOUNT = config.map.goldNode.lootByLevel, RESPAWN = (level, gold) => (gold ? 60 + level * 60 : 30 + level * 30);
const MAXF = config.map.resourceNode.maxFactor, REGEN_H = config.map.resourceNode.regenHours;
// Armée type : infanterie, archers et cavalerie de base romains à parts égales
const base = ['INFANTRY', 'ARCHER', 'CAVALRY'].map(c => unitsData.find(u => u.faction === 'ROME' && u.class === c && u.tier === 'base'));
const army = (total) => base.map(u => ({ unitKey: u.key, tier: 'base', count: Math.round(total / 3) }));
const unitCost = base.reduce((s, u) => s + sumCost(u.recruitCost), 0) / 3;
const unitPower = calculateArmyPower(army(3), unitsData) / 3;
const unitCarry = getArmyCarryCapacity(army(3), unitsData) / 3;
const woundedRate = (tent) => Math.min(config.wounded.maxRate, config.wounded.baseRate + tent * config.wounded.bonusPerHealingLevel);
const lossMult = args.loss || config.combat.tribeLossMultiplier || config.combat.winnerLossMultiplier;

console.log(`Unité de base type : ${n(unitCost)} ressources, puissance ${unitPower.toFixed(0)}, transport ${unitCarry}. Pertes du vainqueur contre un camp = ${lossMult} × (puissance tribu / puissance armée) (pillage de ville : ${config.combat.winnerLossMultiplier}) ; perdant ${Math.round(config.combat.loserLossRate * 100)} %. Camp d'or : +${campBonusPct('GOLD')} % au combat comme à l'affichage. Une part des pertes revient blessée (Tente de soins : 30 % + 3 %/niv., Grèce, Médecine).`);
console.log(`\nniveau | soldats | puissance | armée de base pour gagner (×1,2) | camps battus par cette armée | pertes moyennes (unités / ressources) | blessés tente 1 / 10 | butin immédiat | stock max du point (régén./h) | remboursement des pertes en tenant le point | XP héros | réapparition   (moyennes sur ${SAMPLES} camps tirés)`);
for (const gold of [false, true]) for (const level of [1, 2, 3]) {
  const tribes = Array.from({ length: SAMPLES }, () => generateTribeDefenders(level, gold, 1));
  const soldiers = tribes.reduce((s, t) => s + Object.values(t.units).reduce((a, b) => a + b, 0), 0) / SAMPLES;
  const power = tribes.reduce((s, t) => s + t.power, 0) / SAMPLES;
  const needed = Math.ceil(power * 1.2 / unitPower);
  // chaque camp tiré contre la même armée : pertes moyennes (le perdant perd loserLossRate) et part des camps battus
  let lossRate = 0, wins = 0;
  for (const t of tribes) {
    const r = resolveCombat(army(needed), campUnits(t.units), 0, null, null, { defenseBonusPct: campBonusPct(gold ? 'GOLD' : null), winnerLossMultiplier: lossMult });
    lossRate += r.attackerLossRate / SAMPLES; if (r.attackerWon) wins++;
  }
  const lost = needed * lossRate;
  const kills = soldiers * config.combat.loserLossRate;
  const amount = (gold ? GOLD_AMOUNT : AMOUNT)[level];
  const loot = Math.min(amount, (needed - lost) * unitCarry);
  const maxStock = gold ? amount : amount * MAXF, perHour = gold ? amount / config.map.goldNode.intervalHours : amount * MAXF / REGEN_H;
  const payback = gold ? '—' : `${(Math.max(0, lost * unitCost - loot) / perHour).toFixed(1)} h`;
  console.log(`${gold ? 'or ' : ''}${level}`.padStart(6) + ` | ${n(soldiers)} | ${n(power)} | ${n(needed)} unités (${n(needed * unitCost)} res.) | ${Math.round(wins / SAMPLES * 100)} % | ${n(lost)} / ${n(lost * unitCost)} | ${n(lost * (1 - woundedRate(1)))} / ${n(lost * (1 - woundedRate(10)))} morts | ${n(loot)} ${gold ? 'or' : 'res.'} | ${n(maxStock)} (${n(perHour)}/h) | ${payback} | ${n(kills * config.combat.heroXpPerTribeKill)} | ${RESPAWN(level, gold)} min`);
}
// Difficulté selon la position : bords (où les joueurs apparaissent) → centre (fin de partie), ± variation entre camps
console.log('\n=== Difficulté par position (config.map.camps) : soldats d\'un camp de niveau 1 et 3 ===');
for (const [label, x] of [['bord de carte', config.map.maxCoord], ['à mi-chemin', Math.round(config.map.maxCoord / 2)], ['centre', 0]]) {
  const d = campDifficultyAt(x, 0);
  // soldats et armée de base pour gagner (puissance moyenne × 1,2), comme le tableau plus haut
  const camp = (level) => { let soldiers = 0, power = 0; for (let i = 0; i < SAMPLES; i++) { const t = generateTribeDefenders(level, false, 1, null, d); soldiers += Object.values(t.units).reduce((a, b) => a + b, 0); power += t.power; } return { soldiers: soldiers / SAMPLES, needed: Math.ceil(power / SAMPLES * 1.2 / unitPower) }; };
  const c1 = camp(1), c3 = camp(3);
  console.log(`${label.padEnd(14)} difficulté ×${d.toFixed(2)} : niveau 1 ≈ ${n(c1.soldiers)} soldats (${n(c1.needed)} unités de base pour gagner), niveau 3 ≈ ${n(c3.soldiers)} soldats (${n(c3.needed)} unités) ; ± ${config.map.camps.variationPct} % d'un camp à l'autre`);
}
console.log('\nLecture : les pertes ne dépendent pas de la taille de l\'armée (≈ ' + lossMult + ' × puissance de la tribu / puissance d\'une unité), donc le coût d\'un camp est fixe ; le butin immédiat est borné par le transport des survivants, le reste du point se récolte à ' + (config.tick.harvestPerTick * 60000 / config.tick.intervalMs) + ' par minute en restant sur place (le point se régénère en ' + REGEN_H + ' h, ' + config.map.goldNode.intervalHours + ' h pour l\'or).');
