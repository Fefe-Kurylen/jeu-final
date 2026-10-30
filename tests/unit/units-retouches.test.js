require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { unitsData } = require('../../src/config/gamedata');
const { resolveCombatDetailed } = require('../../src/services/combatService');
const config = require('../../src/config');

// Retouches des fiches (décisions D11 et D12 du 30 octobre 2026, docs/RAPPORT-UNITES.md « Retouches appliquées »)
const GDD = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, '../../wetransfer_content/GDD_MASTER/tables/units_full_with_stars.json'), 'utf8')).units.map(u => [u.key, u.real_stats]));
const STRONG = ['SUL_ARC_DESERT', 'EGY_ARC_NIL', 'HUN_ARC_NOMADE', 'EGY_INF_NIL', 'GRE_INF_HOPLITE', 'EGY_ARC_DESERT', 'SUL_ARC_TIREUR',
  'GAU_INF_CHAMPION', 'EGY_INF_TEMPLE', 'GRE_INF_SPARTIATE', 'ROM_INF_LEGIONNAIRE', 'HUN_CAV_PILLARD'];
const WEAK = ['GAU_ARC_CHASSEUR', 'EGY_INF_ESCLAVE', 'SUL_INF_DESERT', 'GRE_ARC_PAYSAN', 'GAU_INF_TRIARII', 'HUN_INF_VETERAN', 'HUN_ARC_ELITE', 'SUL_CAV_BEDOUIN'];
const U = (k) => unitsData.find(u => u.key === k);
const TIERS = ['base', 'intermediate', 'elite'];
// Recommandation 5 (décision du 30 octobre 2026, rapport économie, entretien 5 / 9 / 13) : endurance ajoutée par-dessus D12
// pour qu'un intermédiaire vaille au moins sa base par céréale
const UPKEEP_RETOUCH = { ROM_CAV_EQUITES: 5, GAU_INF_TRIARII: 5, GAU_CAV_GAULOIS: 5, EGY_ARC_DESERT: 5, EGY_CAV_PHARAON: 5, HUN_ARC_CAMP: 7, SUL_ARC_TIREUR: 10, HUN_CAV_INTER: 18 };
const d12 = (u, s) => u.stats[s] - (s === 'endurance' ? UPKEEP_RETOUCH[u.key] || 0 : 0);   // la fiche D12, sans la recommandation 5

test('D12 : seules les 20 fiches listées changent, de 3 à 10 % par stat et dans le bon sens ; vitesse et transport du GDD (hors recommandation 5)', () => {
  for (const u of unitsData) {
    const g = GDD[u.key];
    assert.ok(g, u.key);
    for (const s of ['speed', 'transport']) assert.equal(u.stats[s], g[s], `${u.key} ${s}`);
    const sign = STRONG.includes(u.key) ? -1 : WEAK.includes(u.key) ? 1 : 0;
    let changed = 0;
    for (const s of ['attack', 'defense', 'endurance']) {
      if (!sign) { assert.equal(d12(u, s), g[s], `${u.key} ${s} : fiche non listée`); continue; }
      const r = (d12(u, s) - g[s]) / g[s] * sign;
      if (r === 0) continue;
      changed++;
      assert.ok(r >= 0.03 - 1e-9 && r <= 0.10 + 1e-9, `${u.key} ${s} : ${(r * sign * 100).toFixed(1)} %`);
    }
    if (sign) assert.ok(changed >= 1, `${u.key} retouchée`);
  }
});

test('D12 : les fiches gardent leur caractère (textes des descriptions)', () => {
  const inf = unitsData.filter(u => u.class === 'INFANTRY');
  // « l'infanterie la plus offensive du jeu »
  assert.ok(inf.every(u => u.key === 'GAU_INF_CHAMPION' || u.stats.attack < U('GAU_INF_CHAMPION').stats.attack));
  // « d'une endurance hors du commun »
  assert.ok(inf.every(u => u.key === 'GRE_INF_SPARTIATE' || u.stats.endurance < U('GRE_INF_SPARTIATE').stats.endurance));
  // la meilleure défense de l'infanterie d'élite
  assert.ok(inf.filter(u => u.tier === 'elite').every(u => u.key === 'ROM_INF_LEGIONNAIRE' || u.stats.defense < U('ROM_INF_LEGIONNAIRE').stats.defense));
  // « une attaque à distance dévastatrice »
  assert.ok(unitsData.filter(u => u.class === 'ARCHER').every(u => u.key === 'HUN_ARC_ELITE' || u.stats.attack < U('HUN_ARC_ELITE').stats.attack));
  // « équilibré en attaque et en défense »
  assert.equal(U('EGY_INF_NIL').stats.attack, U('EGY_INF_NIL').stats.defense);
});

test('D11 : la cavalerie est présentée par sa vitesse, jamais comme pillarde ou porteuse', () => {
  const cav = unitsData.filter(u => u.class === 'CAVALRY');
  assert.equal(cav.length, 18);
  for (const u of cav) assert.doesNotMatch(u.description, /pill|butin|transport|porte|capacité/i, u.key);
  for (const u of cav.filter(c => c.tier === 'base')) assert.match(u.description, /rapide/i, u.key);
});

// Indice d'une unité : armée de cette seule unité contre l'armée de référence de son palier (ses 18 unités à parts égales),
// à prix égal, moyenne des deux rôles ; la cavalerie est rapportée aux cavaliers du palier (elle paie sa vitesse)
const price = (u) => Object.values(u.recruitCost).reduce((a, b) => a + b, 0);
const BUDGET = 240000;
const geo = (a) => Math.exp(a.reduce((s, x) => s + Math.log(x), 0) / a.length);
function exchange(A, B) {
  const lost = (fin) => fin.reduce((s, x) => s + x.killed * price(U(x.key)), 0) + 1;
  const r1 = resolveCombatDetailed(A, B, 0, 'A', 'B'), r2 = resolveCombatDetailed(B, A, 0, 'B', 'A');
  return Math.sqrt(lost(r1.defenderFinalUnits) / lost(r1.attackerFinalUnits) * lost(r2.attackerFinalUnits) / lost(r2.defenderFinalUnits));
}
const mono = (u) => [{ unitKey: u.key, tier: u.tier, count: Math.max(1, Math.round(BUDGET / price(u))) }];

// (les fiches renforcées ensuite par la recommandation 5 en sortent : elles visent la valeur par céréale, test suivant)
test('D12 : chaque fiche retouchée vaut 0,80 à 1,25 de l\'indice de son palier (cavalerie entre cavaliers)', () => {
  for (const t of TIERS) {
    const pool = unitsData.filter(u => u.tier === t && u.class !== 'SIEGE');
    const ref = pool.map(u => ({ unitKey: u.key, tier: t, count: Math.max(1, Math.round(BUDGET / pool.length / price(u))) }));
    const x = Object.fromEntries(pool.map(u => [u.key, exchange(mono(u), ref)]));
    const g = geo(pool.filter(u => u.class === 'CAVALRY').map(u => x[u.key]));
    for (const k of [...STRONG, ...WEAK].filter(k => U(k).tier === t && !UPKEEP_RETOUCH[k])) {
      const idx = U(k).class === 'CAVALRY' ? x[k] / g : x[k];
      assert.ok(idx >= 0.8 && idx <= 1.25, `${k} : ${idx.toFixed(2)}`);
    }
  }
});

test('recommandation 5 : chaque intermédiaire retouché vaut au moins l\'unité de base de sa ligne, à nourriture égale', () => {
  const upkeep = (u) => config.army.upkeepPerTier[u.tier];
  const fed = (u) => [{ unitKey: u.key, tier: u.tier, count: Math.round(9600 / upkeep(u)) }];
  const lost = (fin) => fin.reduce((t, x) => t + x.killed * upkeep(U(x.key)), 0) + 1;
  for (const k of Object.keys(UPKEEP_RETOUCH)) {
    const i = U(k), b = unitsData.find(u => u.faction === i.faction && u.class === i.class && u.tier === 'base');
    assert.equal(i.tier, 'intermediate', k);
    const r1 = resolveCombatDetailed(fed(i), fed(b), 0, 'A', 'B'), r2 = resolveCombatDetailed(fed(b), fed(i), 0, 'B', 'A');
    const x = Math.sqrt(lost(r1.defenderFinalUnits) / lost(r1.attackerFinalUnits) * lost(r2.attackerFinalUnits) / lost(r2.defenderFinalUnits));
    assert.ok(x >= 1, `${k} contre ${b.key} : ${x.toFixed(3)}`);
  }
});

test('D12 : le triangle tient à chaque palier (36 paires de factions par lien, armées d\'une seule classe)', () => {
  const pick = (f, c, t) => unitsData.find(u => u.faction === f && u.class === c && u.tier === t);
  const F = [...new Set(unitsData.map(u => u.faction))];
  for (const t of TIERS) for (const [P, Q] of [['INFANTRY', 'CAVALRY'], ['CAVALRY', 'ARCHER'], ['ARCHER', 'INFANTRY']]) {
    let won = 0;
    for (const fa of F) for (const fb of F) if (exchange(mono(pick(fa, P, t)), mono(pick(fb, Q, t))) > 1) won++;
    assert.ok(won / (F.length * F.length) >= 0.9, `${t} ${P} > ${Q} : ${won} sur ${F.length * F.length}`);
  }
});
