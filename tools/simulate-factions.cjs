#!/usr/bin/env node
// Simulation d'équilibrage des bonus de civilisation avec le moteur de combat réel (services/combatService.js).
// Compare les bonus actuels (data/factions.json) à ces mêmes bonus relevés de N points :
//   node tools/simulate-factions.cjs [N=5]
// 1. effet isolé (mêmes unités des deux côtés, seule la civilisation change), 2. matrice réelle (unités propres),
// 3. indices de défense et d'attaque de ville, 4. pillage (résolution par puissance), 5. économie et logistique.
// Les données ne sont modifiées qu'en mémoire. Nécessite NODE_ENV=test et un JWT_SECRET (voir src/config).
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'simulation-only-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://simulation:simulation@localhost:5432/simulation';
const path = require('path');
const R = path.join(__dirname, '..');
const config = require(R + '/src/config');
const { unitsData, factionsData } = require(R + '/src/config/gamedata');
const { resolveCombat, resolveCombatDetailed } = require(R + '/src/services/combatService');
const { calculateTravelTime } = require(R + '/src/utils/calculations');
const F = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
const snap = JSON.parse(JSON.stringify(factionsData));
const DELTA = Number(process.argv[2] || 5);
function setDelta(d) { for (const f of F) factionsData[f].bonuses.forEach((b, i) => { b.value = snap[f].bonuses[i].value + d; }); }
const pct = x => (x * 100).toFixed(1).padStart(5) + '%';
function army(f, n, tier = 'base') { return ['INFANTRY', 'ARCHER', 'CAVALRY'].map(c => { const u = unitsData.find(x => x.faction === f && x.class === c && x.tier === tier); return { unitKey: u.key, tier, count: n }; }); }
const WALL = 10;

function fight(aF, dF, aUnits, dUnits) { return resolveCombatDetailed(aUnits, dUnits, WALL, 0, 'A', 'D', null, null, aF, dF, 0); }

console.log(`\n=== 1. Effet isolé des bonus (mêmes unités des deux côtés : base romaine 200/200/200, mur ${WALL}) ===`);
console.log('Défenseur de faction X contre attaquant sans bonus (gagnant, pertes att. / déf.) — actuel → +' + DELTA);
for (const f of F) {
  const out = [];
  for (const d of [0, DELTA]) { setDelta(d); const r = fight(null, f, army('ROME', 200), army('ROME', 200)); out.push(`${r.attackerWon ? 'ATT' : 'DÉF'} ${pct(r.attackerLossRate)}/${pct(r.defenderLossRate)}`); }
  console.log(`  ${f.padEnd(6)} défend : ${out[0]}  →  ${out[1]}`);
}
console.log('Attaquant de faction X contre défenseur sans bonus — actuel → +' + DELTA);
for (const f of F) {
  const out = [];
  for (const d of [0, DELTA]) { setDelta(d); const r = fight(f, null, army('ROME', 200), army('ROME', 200)); out.push(`${r.attackerWon ? 'ATT' : 'DÉF'} ${pct(r.attackerLossRate)}/${pct(r.defenderLossRate)}`); }
  console.log(`  ${f.padEnd(6)} attaque : ${out[0]}  →  ${out[1]}`);
}

console.log(`\n=== 2. Matrice réelle : A attaque la ville de D (unités de base propres, 200 par classe, mur ${WALL}) ===`);
for (const d of [0, DELTA]) {
  setDelta(d);
  console.log(d === 0 ? '--- bonus actuels (gagnant, pertes att./déf.)' : `--- bonus +${DELTA} points`);
  console.log('att\\déf  ' + F.map(x => x.padEnd(19)).join(''));
  for (const a of F) {
    const row = [];
    for (const dd of F) { const r = fight(a, dd, army(a, 200), army(dd, 200)); row.push(`${r.attackerWon ? 'ATT' : 'déf'} ${pct(r.attackerLossRate)}/${pct(r.defenderLossRate)}`.padEnd(19)); }
    console.log(a.padEnd(8) + ' ' + row.join(''));
  }
}
// Bascules de résultat
setDelta(0); const before = {}; for (const a of F) for (const dd of F) before[a + dd] = fight(a, dd, army(a, 200), army(dd, 200)).attackerWon;
setDelta(DELTA); const flips = []; for (const a of F) for (const dd of F) { const w = fight(a, dd, army(a, 200), army(dd, 200)).attackerWon; if (w !== before[a + dd]) flips.push(`${a}→${dd} : ${before[a + dd] ? 'ATT' : 'DÉF'} devient ${w ? 'ATT' : 'DÉF'}`); }
console.log('Bascules de gagnant avec +' + DELTA + ' : ' + (flips.length ? flips.join(' ; ') : 'aucune'));

console.log(`\n=== 3. Indice de défense de ville (score = pertes de l'attaquant / pertes du défenseur, même unités, mur ${WALL}) ===`);
for (const d of [0, DELTA]) {
  setDelta(d); const res = F.map(f => { const r = fight(null, f, army('ROME', 200), army('ROME', 200)); return [f, r.attackerLossRate / Math.max(1e-6, r.defenderLossRate)]; });
  const resA = F.map(f => { const r = fight(f, null, army('ROME', 200), army('ROME', 200)); return [f, r.defenderLossRate / Math.max(1e-6, r.attackerLossRate)]; });
  console.log((d === 0 ? 'actuel ' : `+${DELTA}     `) + ' défense : ' + res.map(([f, v]) => `${f} ${v.toFixed(2)}`).join(' | ') + '\n        attaque : ' + resA.map(([f, v]) => `${f} ${v.toFixed(2)}`).join(' | '));
}

console.log('\n=== 4. Pillage (résolution par puissance) : multiplicateur de défense de ville dû à la faction ===');
for (const d of [0, DELTA]) { setDelta(d); console.log((d === 0 ? 'actuel' : `+${DELTA}    `) + ' : ' + F.map(f => { const r = resolveCombat(army('ROME', 100), army('ROME', 100), 0, null, null, { defenderFaction: f }); return `${f} ×${(r.defenderPower / r.attackerPower).toFixed(3)}`; }).join(' | ')); }

console.log('\n=== 5. Économie et logistique ===');
const gb = (f, t) => { const b = factionsData[f].bonuses.find(x => x.type === t); return b ? b.value : 0; };
for (const d of [0, DELTA]) {
  setDelta(d); const tag = d === 0 ? 'actuel' : `+${DELTA}    `;
  const greek = gb('GREEK', 'buildTimeReduction'); const hours = Array.from({ length: 20 }, (_, i) => 1800 * Math.pow(config.build.timeMultiplierBase, i)).reduce((a, b) => a + b, 0) / 3600;
  const hide = l => Math.min(config.hideout.maxProtection, l * config.hideout.protectionPerLevel * (1 + gb('GAUL', 'hideoutCapacity') / 100));
  const wounded = l => Math.min(config.wounded.maxRate, config.wounded.baseRate + l * config.wounded.bonusPerHealingLevel + gb('GREEK', 'woundedConversion') / 100);
  const t100 = calculateTravelTime(0, 0, 100, 0, 50, 'HUN', factionsData, 100);
  console.log(`${tag} Grèce : temps de construction ×${(1 - greek / 100).toFixed(2)} (bâtiment L1 30 min → 20 niveaux : ${(hours * (1 - greek / 100)).toFixed(0)} h au lieu de ${hours.toFixed(0)}) ; blessés tente L1/L5/L10 : ${pct(wounded(1))}/${pct(wounded(5))}/${pct(wounded(10))} (plafond ${pct(config.wounded.maxRate)})`);
  console.log(`${tag} Gaule : cachette L5/L10/L15/L20 : ${pct(hide(5))}/${pct(hide(10))}/${pct(hide(15))}/${pct(hide(20))} (plafond ${pct(config.hideout.maxProtection)})`);
  console.log(`${tag} Égypte : transport ×${(1 + gb('EGYPT', 'transportCapacity') / 100).toFixed(2)} ; mur ${Math.round(config.combat.wallHpPerLevel * (1 + gb('EGYPT', 'wallHealth') / 100))} PV/niv. (${config.combat.wallHpPerLevel} ailleurs) → ${Math.ceil(config.combat.wallHpPerLevel * (1 + gb('EGYPT', 'wallHealth') / 100) / config.combat.siegeWallDamagePerUnit)} catapultes par niveau au lieu de ${Math.ceil(config.combat.wallHpPerLevel / config.combat.siegeWallDamagePerUnit)}`);
  console.log(`${tag} Huns : 100 cases à vitesse 50 en ${(t100 / 60).toFixed(1)} min (${(100 * 30 / 60).toFixed(1)} min sans bonus) ; attaque en siège ×${(1 + gb('HUN', 'siegeAttack') / 100).toFixed(2)}`);
  console.log(`${tag} Sultanat : dégâts des engins ${Math.round(config.combat.siegeWallDamagePerUnit * (1 + gb('SULTAN', 'siegeEngineAttack') / 100))} PV/engin (${config.combat.siegeWallDamagePerUnit} ailleurs) → ${Math.ceil(config.combat.wallHpPerLevel / (config.combat.siegeWallDamagePerUnit * (1 + gb('SULTAN', 'siegeEngineAttack') / 100)))} engins par niveau de mur ; attaque en défense ×${(1 + gb('SULTAN', 'defendingCityAttack') / 100).toFixed(2)}`);
  console.log(`${tag} Rome : défense ×${(1 + gb('ROME', 'unitDefense') / 100).toFixed(2)} partout ; PV en siège ×${(1 + gb('ROME', 'siegeLossReduction') / 100).toFixed(2)} (des deux côtés)`);
}
setDelta(0);
