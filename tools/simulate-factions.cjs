#!/usr/bin/env node
// Simulation d'équilibrage des bonus de civilisation avec le moteur de combat réel (services/combatService.js).
// Compare les bonus actuels (data/factions.json) à ces mêmes bonus relevés de N points :
//   node tools/simulate-factions.cjs [N=5] [--engines=200] [--wall=10]
// 1. effet isolé (mêmes unités des deux côtés, seule la civilisation change), 2. matrice réelle (unités propres),
// 3. indices de défense et d'attaque de ville, 4. pillage (résolution par puissance), 5. économie et logistique.
// Attaque de ville comme en jeu : le mur sert de bouclier (PV du mur, Égypte comprise), seuls les engins de l'attaquant
// l'abîment (ceux de sa civilisation, avec leur bonus), puis les soldats se battent. Sans héros ni technologie.
// Les données ne sont modifiées qu'en mémoire. Nécessite NODE_ENV=test et un JWT_SECRET (voir src/config).
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'simulation-only-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://simulation:simulation@localhost:5432/simulation';
const path = require('path');
const R = path.join(__dirname, '..');
const config = require(R + '/src/config');
const { unitsData, factionsData } = require(R + '/src/config/gamedata');
const { resolveCombat, resolveCombatDetailed } = require(R + '/src/services/combatService');
const { calculateTravelTime, getFactionBonus, buildSecondsFor } = require(R + '/src/utils/calculations');
const fx = require(R + '/src/utils/buildingEffects');
const F = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
const snap = JSON.parse(JSON.stringify(factionsData));
const argv = process.argv.slice(2);
const opt = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const m = a.match(/^--([^=]+)=(.+)$/); return m ? [m[1], Number(m[2])] : [a.slice(2), true]; }));
const DELTA = Number(argv.find(a => !a.startsWith('--')) || 5);
function setDelta(d) { for (const f of F) factionsData[f].bonuses.forEach((b, i) => { b.value = snap[f].bonuses[i].value + d; }); }
const pct = x => (x * 100).toFixed(1).padStart(5) + '%';
function army(f, n, tier = 'base') { return ['INFANTRY', 'ARCHER', 'CAVALRY'].map(c => { const u = unitsData.find(x => x.faction === f && x.class === c && x.tier === tier); return { unitKey: u.key, tier, count: n }; }); }
const WALL = opt.wall || 10, ENGINES = opt.engines ?? 200;
const engineOf = f => unitsData.find(x => x.faction === f && x.class === 'SIEGE');
const bonusOf = (f, type) => (f ? getFactionBonus(f, type, factionsData) || 0 : 0);
// PV du mur comme buildProcessor.syncWallHp : wallHpPerLevel par niveau, × « santé des murs » (Égypte)
const wallHp = (dF) => Math.round(config.combat.wallHpPerLevel * Math.max(1, WALL) * (1 + bonusOf(dF, 'wallHealth') / 100));

// aF / dF : civilisation de l'attaquant / du défenseur (null = sans bonus) ; l'attaquant amène ENGINES engins de sa
// civilisation (romains sans civilisation), le mur est un bouclier plein
function fight(aF, dF, aUnits, dUnits) {
  const e = engineOf(aF || 'ROME');
  const atk = ENGINES > 0 ? [...aUnits, { unitKey: e.key, tier: e.tier, count: ENGINES }] : aUnits;
  const hp = wallHp(dF);
  return resolveCombatDetailed(atk, dUnits, WALL, 'A', 'D', null, null, aF, dF, 0, null, WALL > 0 ? { hp, maxHp: hp } : null);
}
const breachOf = r => { const i = r.rounds.findIndex(x => x.wallHp === 0); return i < 0 ? 'r—' : `r${i + 1}`; };
const cell = r => `${r.attackerWon ? 'ATT' : 'DÉF'} ${pct(r.attackerLossRate)}/${pct(r.defenderLossRate)} ${breachOf(r)}`;
console.log(`Mur ${WALL} en bouclier (${wallHp(null)} PV, ${wallHp('EGYPT')} pour l'Égypte), ${ENGINES} engins de l'attaquant en plus des soldats ; pertes de l'attaquant engins compris ; rN = round de la brèche (r— : le mur tient).`);

console.log(`\n=== 1. Effet isolé des bonus (mêmes unités des deux côtés : base romaine 200/200/200 + ${ENGINES} engins, mur ${WALL}) ===`);
console.log('Défenseur de faction X contre attaquant sans bonus (gagnant, pertes att. / déf.) — actuel → +' + DELTA);
for (const f of F) {
  const out = [];
  for (const d of [0, DELTA]) { setDelta(d); out.push(cell(fight(null, f, army('ROME', 200), army('ROME', 200)))); }
  console.log(`  ${f.padEnd(6)} défend : ${out[0]}  →  ${out[1]}`);
}
console.log('Attaquant de faction X (avec les engins de sa civilisation) contre défenseur sans bonus — actuel → +' + DELTA);
for (const f of F) {
  const out = [];
  for (const d of [0, DELTA]) { setDelta(d); out.push(cell(fight(f, null, army('ROME', 200), army('ROME', 200)))); }
  console.log(`  ${f.padEnd(6)} attaque : ${out[0]}  →  ${out[1]}`);
}

console.log(`\n=== 2. Matrice réelle : A attaque la ville de D (unités de base propres, 200 par classe + ${ENGINES} engins, mur ${WALL}) ===`);
for (const d of [0, DELTA]) {
  setDelta(d);
  console.log(d === 0 ? '--- bonus actuels (gagnant, pertes att./déf.)' : `--- bonus +${DELTA} points`);
  console.log('att\\déf  ' + F.map(x => x.padEnd(23)).join(''));
  for (const a of F) {
    const row = [];
    for (const dd of F) row.push(cell(fight(a, dd, army(a, 200), army(dd, 200))).padEnd(23));
    console.log(a.padEnd(8) + ' ' + row.join(''));
  }
}
// Bascules de résultat
setDelta(0); const before = {}; for (const a of F) for (const dd of F) before[a + dd] = fight(a, dd, army(a, 200), army(dd, 200)).attackerWon;
setDelta(DELTA); const flips = []; for (const a of F) for (const dd of F) { const w = fight(a, dd, army(a, 200), army(dd, 200)).attackerWon; if (w !== before[a + dd]) flips.push(`${a}→${dd} : ${before[a + dd] ? 'ATT' : 'DÉF'} devient ${w ? 'ATT' : 'DÉF'}`); }
console.log('Bascules de gagnant avec +' + DELTA + ' : ' + (flips.length ? flips.join(' ; ') : 'aucune'));

console.log(`\n=== 3. Indices de ville (défense = pertes de l'attaquant / pertes du défenseur ; attaque = l'inverse ; mêmes unités, mur ${WALL}, ${ENGINES} engins) ===`);
for (const d of [0, DELTA]) {
  setDelta(d); const res = F.map(f => { const r = fight(null, f, army('ROME', 200), army('ROME', 200)); return [f, r.attackerLossRate / Math.max(1e-6, r.defenderLossRate)]; });
  const resA = F.map(f => { const r = fight(f, null, army('ROME', 200), army('ROME', 200)); return [f, r.defenderLossRate / Math.max(1e-6, r.attackerLossRate)]; });
  console.log((d === 0 ? 'actuel ' : `+${DELTA}     `) + ' défense : ' + res.map(([f, v]) => `${f} ${v.toFixed(2)}`).join(' | ') + '\n        attaque : ' + resA.map(([f, v]) => `${f} ${v.toFixed(2)}`).join(' | '));
}

console.log('\n=== 4. Pillage (résolution par puissance) : multiplicateur de défense de ville dû à la faction ===');
for (const d of [0, DELTA]) { setDelta(d); console.log((d === 0 ? 'actuel' : `+${DELTA}    `) + ' : ' + F.map(f => { const r = resolveCombat(army('ROME', 100), army('ROME', 100), 0, null, null, { defenderFaction: f }); return `${f} ×${(r.defenderPower / r.attackerPower).toFixed(3)}`; }).join(' | ')); }

console.log('\n=== 5. Économie et logistique : chaque bonus de chaque civilisation ===');
// un bâtiment ordinaire (pas un champ ni le Bâtiment principal, plus lents) de 30 min au niveau 1 : temps des 20 niveaux
const hours20 = Array.from({ length: 20 }, (_, i) => buildSecondsFor({ key: 'BARRACKS', timeL1Sec: 1800 }, i + 1)).reduce((a, b) => a + b, 0) / 3600;
const t100 = calculateTravelTime(0, 0, 100, 0, 50, null, null, 100);
// Mur bouclier (siège du 25 octobre 2026, seuls les engins l'abîment depuis le 30 octobre 2026) : un engin frappe le mur
// une fois par round, de roundDamageFactor × attaque × coefficient de bataille de son palier × engineMult (× « siegeEngineAttack »
// de sa civilisation, × « siegeAttack » de l'attaquant) ; un mur gaulois encaisse 1/« cityDefense » des coups ; un niveau de
// mur vaut wallHpPerLevel PV
const engineHit = (f, v = 0) => { const u = engineOf(f); return config.combat.roundDamageFactor * u.stats.attack * (config.combat.battleTierCoefficients[u.tier] || 1) * config.combat.siege.wallShield.engineMult * (1 + v / 100); };
const WALL_HP = config.combat.wallHpPerLevel;
const FMT = {
  buildTimeReduction: v => `temps de construction ×${(1 - v / 100).toFixed(2)} (bâtiment L1 30 min → 20 niveaux : ${(hours20 * (1 - v / 100)).toFixed(0)} h au lieu de ${hours20.toFixed(0)})`,
  woundedConversion: v => { const w = l => Math.min(config.wounded.maxRate, config.wounded.baseRate + l * config.wounded.bonusPerHealingLevel + v / 100); return `blessés tente L1/L5/L10 : ${pct(w(1))}/${pct(w(5))}/${pct(w(10))} (plafond ${pct(config.wounded.maxRate)})`; },
  // cachette (décision du 31 octobre 2026) : une quantité fixe de chaque ressource par niveau, × (1 + bonus) pour la Gaule
  hideoutCapacity: (v, f) => { const h = l => fx.hideoutAmount([{ key: 'HIDEOUT', level: l }], f), base = l => fx.hideoutAmount([{ key: 'HIDEOUT', level: l }], null); return `cachette L5/L10/L15/L20 : ${[5, 10, 15, 20].map(h).join('/')} par ressource (${[5, 10, 15, 20].map(base).join('/')} sans bonus, ×${(1 + v / 100).toFixed(2)})`; },
  transportCapacity: v => `transport ×${(1 + v / 100).toFixed(2)} (butin des pillages, envois par armée, convois marchands)`,
  wallHealth: v => { const hp = Math.round(WALL_HP * (1 + v / 100)), hit = engineHit('ROME'); return `mur ${hp} PV/niv. (${WALL_HP} ailleurs) → un niveau tombe en ${Math.ceil(hp / hit)} coups d'engin au lieu de ${Math.ceil(WALL_HP / hit)} (${engineOf('ROME').name} : ${hit.toFixed(2)} PV par round ; un soldat ×${config.combat.siege.wallShield.soldierMult} : seuls les engins abîment le mur)`; },
  armySpeed: v => `100 cases à vitesse 50 en ${(t100 / (1 + v / 100) / 60).toFixed(1)} min (${(t100 / 60).toFixed(1)} min sans bonus)`,
  siegeAttack: (v, f) => `attaque en siège ×${(1 + v / 100).toFixed(2)}, engins compris (${engineHit(f, v).toFixed(2)} PV de mur par round au lieu de ${engineHit(f).toFixed(2)})`,
  siegeEngineAttack: (v, f) => `dégâts d'un engin au mur ×${(1 + v / 100).toFixed(2)} : ${engineHit(f, v).toFixed(2)} PV par round (${engineHit(f).toFixed(2)} sans bonus) → un niveau de mur (${WALL_HP} PV) en ${Math.ceil(WALL_HP / engineHit(f, v))} coups au lieu de ${Math.ceil(WALL_HP / engineHit(f))}`,
  defendingCityAttack: v => `attaque en défendant sa ville ×${(1 + v / 100).toFixed(2)}`,
  unitDefense: v => `défense ×${(1 + v / 100).toFixed(2)} partout`,
  siegeLossReduction: v => `solidité en siège ×${(1 + v / 100).toFixed(2)} (en attaque comme en défense)`,
  cityDefense: v => { const hit = engineHit('ROME'); return `défense chez soi ×${(1 + v / 100).toFixed(2)} ; son mur encaisse 1/${(1 + v / 100).toFixed(2)} des coups (un niveau en ${Math.ceil(WALL_HP * (1 + v / 100) / hit)} coups d'engin au lieu de ${Math.ceil(WALL_HP / hit)})`; }
};
for (const d of [0, DELTA]) {
  setDelta(d); const tag = d === 0 ? 'actuel' : `+${DELTA}    `;
  for (const f of F) console.log(`${tag} ${factionsData[f].name.padEnd(8)} : ` + factionsData[f].bonuses.map(b => (FMT[b.type] ? FMT[b.type](b.value, f) : `${b.type} ${b.value} %`)).join(' ; '));
}
setDelta(0);
