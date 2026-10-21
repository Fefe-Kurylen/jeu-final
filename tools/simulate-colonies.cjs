#!/usr/bin/env node
// Villes secondaires et paliers de ville : que valent les règles d'octobre 2026 avec les données du jeu ?
//  1. paliers de ville (Village / Ville / Ville Fortifiée) fixés par le Bâtiment principal : quand une ville change de
//     palier, ce que coûte le Bâtiment principal pour y arriver, et ce que coûtent les engins de siège exigés de l'attaquant ;
//  2. économie d'une colonie : production d'une ville secondaire (+20 %) contre la capitale à développement égal, prix
//     de la fondation et de la Résidence, amortissement ;
//  3. militaire hors capitale : la Grande caserne demande Caserne 20 dans la capitale ; coût et délai de ce verrou.
//   node tools/simulate-colonies.cjs
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'simulation-only-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://simulation:simulation@localhost:5432/simulation';
const path = require('path');
const config = require(path.join(__dirname, '..', 'src', 'config'));
const { buildingsData, unitsData } = require(path.join(__dirname, '..', 'src', 'config', 'gamedata'));
const { getProductionAtLevel } = require(path.join(__dirname, '..', 'src', 'utils', 'calculations'));
const fx = require(path.join(__dirname, '..', 'src', 'utils', 'buildingEffects'));

const COST_GROWTH = 1.28, TIME_GROWTH = 1.2;
const def = (k) => buildingsData.find(b => b.key === k);
const costAt = (k, L) => { const c = def(k).costL1; const m = Math.pow(COST_GROWTH, L - 1); return Object.fromEntries(Object.entries(c).map(([r, v]) => [r, Math.round(v * m)])); };
const timeAt = (k, L) => Math.round(def(k).timeL1Sec * Math.pow(TIME_GROWTH, L - 1));
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const cumul = (k, from, to) => { const c = { wood: 0, stone: 0, iron: 0, food: 0 }; let t = 0; for (let L = from; L <= to; L++) { const x = costAt(k, L); for (const r in c) c[r] += x[r] || 0; t += timeAt(k, L); } return { cost: c, total: sum(c), timeH: t / 3600 }; };
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const h = (x) => x >= 48 ? `${(x / 24).toFixed(1)} j` : `${x.toFixed(1)} h`;
const row = (cells) => console.log('| ' + cells.join(' | ') + ' |');

console.log('# Villes secondaires et paliers de ville — simulation avec les données du jeu\n');

// ---------- 1. paliers par Bâtiment principal ----------
console.log('## 1. Paliers de ville fixés par le Bâtiment principal\n');
row(['Palier', 'Bâtiment principal', 'Coût cumulé du Bâtiment principal', 'Temps cumulé brut', 'Engins de siège exigés']);
row(['---', '---', '---', '---', '---']);
for (const t of config.cityTiers) {
  const L = Math.max(1, t.minMainHall);
  const c = cumul('MAIN_HALL', 1, L);
  row([t.name, `niveau ${L}+`, `${fmt(c.total)} (niveaux 1 à ${L})`, h(c.timeH), String(t.minSiege)]);
}
// Ancienne règle (Mur 10 / 15) pour comparaison
const w10 = cumul('WALL', 1, 10), w15 = cumul('WALL', 1, 15), m10 = cumul('MAIN_HALL', 1, 10), m20 = cumul('MAIN_HALL', 1, 20);
console.log(`\nAncienne règle (palier par niveau du Mur) : Ville = Mur 10 (${fmt(w10.total)} ressources, ${h(w10.timeH)}), Ville Fortifiée = Mur 15 (${fmt(w15.total)}, ${h(w15.timeH)}).`);
console.log(`Nouvelle règle : Ville = Bâtiment principal 10 (${fmt(m10.total)}, ${h(m10.timeH)}), Ville Fortifiée = Bâtiment principal 20 (${fmt(m20.total)}, ${h(m20.timeH)}).`);
console.log('Le Bâtiment principal étant de toute façon monté par tout le monde (il plafonne les autres bâtiments), le palier arrive dans le cours normal du développement ; le Mur reste libre et garde sa valeur défensive.\n');

// Engins de siège : coût et temps pour l'attaquant
const siege = unitsData.filter(u => u.class === 'SIEGE');
// Same formula as routes/cities.js (recruitCost): class base cost × tier multiplier; training time from the unit data
const unitCost = (u) => { const base = config.recruit.baseCosts[u.class] || config.recruit.baseCosts.INFANTRY; const m = config.recruit.tierCostMultipliers[u.tier] || 1; return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.ceil(v * m)])); };
const unitTime = (u) => u.recruitTimeSec || u.trainTimeSec || 0;
const cheapest = siege.map(u => ({ u, c: sum(unitCost(u)) })).sort((a, b) => a.c - b.c)[0];
if (cheapest) {
  const u = cheapest.u;
  console.log(`Engins de siège (${u.name || u.key}, le moins cher) : ${fmt(cheapest.c)} ressources et ${h(unitTime(u) / 3600)} chacun (Atelier niveau 1, sans réduction).`);
  row(['Cible', 'Engins exigés', 'Coût des engins', 'Temps de fabrication brut (une file)', 'Rapport engins / Bâtiment principal de la cible']);
  row(['---', '---', '---', '---', '---']);
  for (const t of config.cityTiers) {
    const L = Math.max(1, t.minMainHall);
    const c = cumul('MAIN_HALL', 1, L);
    row([t.name, String(t.minSiege), fmt(cheapest.c * t.minSiege), h(unitTime(u) * t.minSiege / 3600), (cheapest.c * t.minSiege / c.total * 100).toFixed(0) + ' %']);
  }
}

// ---------- 2. économie d'une colonie ----------
console.log('\n## 2. Économie d\'une ville secondaire (+20 %)\n');
const bonus = 1 + fx.secondaryCityBonusPct() / 100;
const cap = config.city.secondaryMainHallMaxLevel;
row(['Champs (4 par ressource)', 'Capitale, par ressource et par heure', 'Colonie (+20 %)', 'Gain de la colonie', 'Coût cumulé des 16 champs']);
row(['---', '---', '---', '---', '---']);
for (const L of [5, 10, 15, 20]) {
  const perRes = 4 * getProductionAtLevel('LUMBER', L, buildingsData) + 5;
  const fields = ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'].reduce((t, k) => t + 4 * cumul(k, 1, L).total, 0);
  row([`niveau ${L}`, fmt(perRes), fmt(perRes * bonus), `+${fmt(perRes * (bonus - 1))}/h`, fmt(fields)]);
}
const found = sum(config.city.foundationTransport);
const res10 = cumul('RESIDENCE', 1, 10), res15 = cumul('RESIDENCE', 1, 15), res20 = cumul('RESIDENCE', 1, 20);
console.log(`\nFondation : ${fmt(found)} ressources transportées ; Résidence 10 : ${fmt(res10.total)} (${h(res10.timeH)}), 15 : ${fmt(res15.total)} (${h(res15.timeH)}), 20 : ${fmt(res20.total)} (${h(res20.timeH)}).`);
const gain10 = 4 * (4 * getProductionAtLevel('LUMBER', 10, buildingsData) + 5) * (bonus - 1);
console.log(`Une colonie aux champs de niveau 10 rend ${fmt(gain10)} ressources de plus par heure que la même ville sans bonus : la fondation (${fmt(found)}) est amortie par le seul bonus en ${h(found / gain10)}, la Résidence 10 en ${h(res10.total / gain10)} ; sans le bonus, une colonie reste une seconde ville complète (ses champs produisent comme ceux de la capitale).`);
console.log(`Plafond : Bâtiment principal ${cap} au plus dans une colonie (30 dans la capitale) ; les autres bâtiments s'arrêtent à 20 de toute façon, le plafond n'enlève donc rien à la production, il réserve à la capitale les niveaux 21-30 du Bâtiment principal (population, réduction de temps déjà plafonnée à 60 % dès 24).`);

// ---------- 3. militaire hors capitale ----------
console.log('\n## 3. Recrutement hors capitale\n');
const b20 = cumul('BARRACKS', 1, 20), s20 = cumul('STABLE', 1, 20);
const gb1 = costAt('GREAT_BARRACKS', 1), gs1 = costAt('GREAT_STABLE', 1);
console.log(`Caserne, Écurie et Atelier sont réservés à la capitale (GDD : « hors capitale », Grandes caserne et écurie). La Grande caserne d'une colonie demande Caserne 20 dans la capitale : ${fmt(b20.total)} ressources et ${h(b20.timeH)} de chantier cumulés ; la Grande écurie demande Écurie 20 : ${fmt(s20.total)} et ${h(s20.timeH)}.`);
console.log(`Grande caserne niveau 1 : ${fmt(sum(gb1))} ressources ; Grande écurie niveau 1 : ${fmt(sum(gs1))}. Les engins de siège ne se fabriquent que dans la capitale.`);
console.log(`Lecture : une colonie est d'abord une ville économique (+20 %) ; elle ne forme des troupes qu'une fois la capitale au bout de ses casernes, soit après plusieurs semaines ; la capitale reste le cœur militaire (Forge, Atelier, Résidence, Ambassade, Chambre au trésor, Domus).`);
