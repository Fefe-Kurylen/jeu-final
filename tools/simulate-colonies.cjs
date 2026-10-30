#!/usr/bin/env node
// Villes secondaires, paliers de ville et murs : que valent les règles actuelles avec les données et le moteur du jeu ?
//  1. paliers de ville (Village / Ville / Ville Fortifiée) fixés par le Bâtiment principal : quand une ville change de
//     palier et ce que coûte le Bâtiment principal pour y arriver (le palier ne fixe plus le minimum d'engins de siège) ;
//  2. percer le mur : seuls les engins l'abîment (décision du 30 octobre 2026) ; engins pour une brèche selon le niveau du
//     mur et le Bastion, puis combats de siège réels (Rome contre une ville gauloise, moteur services/combatService.js) ;
//  3. économie d'une colonie : production d'une ville secondaire (+20 %) contre la capitale à développement égal, prix
//     de la fondation et de la Résidence, amortissement ; bâtiments réservés aux colonies, stock partagé ;
//  4. militaire hors capitale : la Grande caserne demande Caserne 20 dans la capitale ; coût et délai de ce verrou ; les
//     unités formées rejoignent la capitale (décision du 30 octobre 2026).
// Coûts et temps des bâtiments : utils/calculations.js buildCostFor / buildSecondsFor (les mêmes que le serveur).
//   node tools/simulate-colonies.cjs
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'simulation-only-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://simulation:simulation@localhost:5432/simulation';
const path = require('path');
const config = require(path.join(__dirname, '..', 'src', 'config'));
const { buildingsData, unitsData, factionsData } = require(path.join(__dirname, '..', 'src', 'config', 'gamedata'));
const { getProductionAtLevel, getFactionBonus, buildCostFor, buildSecondsFor, recruitCostFor, baseTrainSecondsFor } = require(path.join(__dirname, '..', 'src', 'utils', 'calculations'));
const fx = require(path.join(__dirname, '..', 'src', 'utils', 'buildingEffects'));
const { resolveCombatDetailed } = require(path.join(__dirname, '..', 'src', 'services', 'combatService'));

const def = (k) => buildingsData.find(b => b.key === k);
const costAt = (k, L) => buildCostFor(def(k), L);
const timeAt = (k, L) => buildSecondsFor(def(k), L);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const cumul = (k, from, to) => { const c = { wood: 0, stone: 0, iron: 0, food: 0 }; let t = 0; for (let L = from; L <= to; L++) { const x = costAt(k, L); for (const r in c) c[r] += x[r] || 0; t += timeAt(k, L); } return { cost: c, total: sum(c), timeH: t / 3600 }; };
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const h = (x) => x >= 48 ? `${(x / 24).toFixed(1)} j` : `${x.toFixed(1)} h`;
const row = (cells) => console.log('| ' + cells.join(' | ') + ' |');

console.log('# Villes secondaires, paliers de ville et murs — simulation avec les données du jeu\n');

// ---------- 1. paliers par Bâtiment principal ----------
const MIN_ENGINES = config.combat.siege.minEngines;
console.log('## 1. Paliers de ville fixés par le Bâtiment principal\n');
row(['Palier', 'Bâtiment principal', 'Coût cumulé du Bâtiment principal', 'Temps cumulé brut', 'Engins de siège exigés']);
row(['---', '---', '---', '---', '---']);
for (const t of config.cityTiers) {
  const L = Math.max(1, t.minMainHall);
  const c = cumul('MAIN_HALL', 1, L);
  row([t.name, `niveau ${L}+`, `${fmt(c.total)} (niveaux 1 à ${L})`, h(c.timeH), String(MIN_ENGINES)]);
}
// Ancienne règle (Mur 10 / 15) pour comparaison
const w10 = cumul('WALL', 1, 10), w15 = cumul('WALL', 1, 15), m10 = cumul('MAIN_HALL', 1, 10), m20 = cumul('MAIN_HALL', 1, 20);
console.log(`\nAncienne règle (palier par niveau du Mur) : Ville = Mur 10 (${fmt(w10.total)} ressources, ${h(w10.timeH)}), Ville Fortifiée = Mur 15 (${fmt(w15.total)}, ${h(w15.timeH)}).`);
console.log(`Règle actuelle : Ville = Bâtiment principal 10 (${fmt(m10.total)}, ${h(m10.timeH)}), Ville Fortifiée = Bâtiment principal 20 (${fmt(m20.total)}, ${h(m20.timeH)}).`);
console.log(`Le palier fixe l'aspect de la ville et de son enceinte ; depuis le 25 octobre 2026, il ne fixe plus le minimum d'engins de l'attaquant : ${MIN_ENGINES} engin suffit contre n'importe quelle ville (config.combat.siege.minEngines). Ce qui coûte, c'est de percer le mur (section 2).\n`);

// ---------- 2. percer le mur ----------
// Un engin frappe le mur une fois par round : roundDamageFactor × attaque × coefficient de bataille du palier siège ×
// engineMult ; un soldat × soldierMult (0 : seuls les engins abîment le mur). Mur : wallHpPerLevel PV par niveau.
console.log('## 2. Percer le mur (mur bouclier, seuls les engins l\'abîment)\n');
const siege = unitsData.filter(u => u.class === 'SIEGE');
// Prix et temps de formation d'une unité : ceux du serveur (routes/cities.js, recrutement)
const unitCost = (u) => recruitCostFor(u, 1);
const unitTime = (u) => baseTrainSecondsFor(u);
const W = config.combat.siege.wallShield;
const cata = siege.find(u => u.key === 'ROM_SIEGE_CATAPULTE') || siege[0];
const cataCost = sum(unitCost(cata));
const hit = config.combat.roundDamageFactor * cata.stats.attack * (config.combat.battleTierCoefficients[cata.tier] || 1) * W.engineMult;
const fb = (f, type) => 1 + (getFactionBonus(f, type, factionsData) || 0) / 100;
const need = (hp, rounds, perHit = hit) => Math.ceil(hp / (perHit * rounds));
console.log(`${cata.name} : ${fmt(cataCost)} ressources et ${h(unitTime(cata) / 3600)} de fabrication (Atelier niveau 1, sans réduction) ; elle ôte ${hit.toFixed(2)} PV au mur par round. Un soldat : × ${W.soldierMult}. Un mur tombé laisse au moins ${config.combat.siege.roundsAfterBreach} rounds de combat (${config.combat.maxRounds} rounds sinon).`);
console.log(`Les engins ne sont visés qu'en dernier (après tous les soldats) : les chiffres valent pour une armée qui garde des soldats devant ses engins.\n`);
row(['Mur', 'PV du mur', 'Coût cumulé du Mur', 'Catapultes pour une brèche au round 15 / 10 / 5', 'Coût des catapultes (brèche au round 10)', 'Fabrication (une file)']);
row(['---', '---', '---', '---', '---', '---']);
for (const L of [5, 10, 15, 20]) {
  const hp = L * config.combat.wallHpPerLevel, wc = cumul('WALL', 1, L), n10 = need(hp, 10);
  row([`niveau ${L}`, fmt(hp), fmt(wc.total), `${need(hp, 15)} / ${n10} / ${need(hp, 5)}`, fmt(n10 * cataCost), h(n10 * unitTime(cata) / 3600)]);
}
const B = config.bastion, bastionHp = B.wallMultiplier * B.wallReferenceLevel * config.combat.wallHpPerLevel;
row([`Bastion (${B.wallMultiplier} × mur ${B.wallReferenceLevel})`, fmt(bastionHp), '—', `${need(bastionHp, 15)} / ${need(bastionHp, 10)} / ${need(bastionHp, 5)}`, fmt(need(bastionHp, 10) * cataCost), h(need(bastionHp, 10) * unitTime(cata) / 3600)]);
console.log(`\nCivilisations : un mur égyptien a ${Math.round((fb('EGYPT', 'wallHealth') - 1) * 100)} % de PV en plus (× ${fb('EGYPT', 'wallHealth').toFixed(2)} catapultes) ; un mur gaulois encaisse 1/${fb('GAUL', 'cityDefense').toFixed(2)} des coups (« défense chez soi », × ${fb('GAUL', 'cityDefense').toFixed(2)} catapultes) ; les engins du Sultanat frappent × ${fb('SULTAN', 'siegeEngineAttack').toFixed(2)} (mur 20 en 10 rounds : ${need(20 * config.combat.wallHpPerLevel, 10, hit * fb('SULTAN', 'siegeEngineAttack'))} au lieu de ${need(20 * config.combat.wallHpPerLevel, 10)}), ceux des Huns × ${fb('HUN', 'siegeAttack').toFixed(2)} (attaque en siège).\n`);

// Combats de siège réels : Rome (Triarii et catapultes) contre une ville gauloise (600 Triarii, 300 archers intermédiaires)
const unitKey = (f, c, t) => unitsData.find(u => u.faction === f && u.class === c && u.tier === t).key;
const RINF = unitKey('ROME', 'INFANTRY', 'intermediate'), GINF = unitKey('GAUL', 'INFANTRY', 'intermediate'), GARC = unitKey('GAUL', 'ARCHER', 'intermediate');
const defenders = [{ unitKey: GINF, tier: 'intermediate', count: 600 }, { unitKey: GARC, tier: 'intermediate', count: 300 }];
const siegeFight = (soldiers, engines, wallLevel, lives) => {
  const maxHp = wallLevel * config.combat.wallHpPerLevel * fb('GAUL', 'wallHealth');
  const atk = [{ unitKey: RINF, tier: 'intermediate', count: soldiers }, { unitKey: cata.key, tier: 'siege', count: engines }];
  const r = resolveCombatDetailed(atk, defenders, wallLevel, 'Rome', 'Gaule', null, null, 'ROME', 'GAUL', 0, null, { hp: maxHp * lives, maxHp });
  const breach = r.rounds.findIndex(x => x.wallHp === 0) + 1;
  return `${breach ? `brèche round ${breach}` : 'pas de brèche'}, ${r.attackerWon ? 'l\'attaquant gagne' : 'la ville tient'} (pertes ${Math.round(r.attackerLossRate * 100)} % / ${Math.round(r.defenderLossRate * 100)} %)`;
};
console.log(`Combats de siège (Rome : ${unitsData.find(u => u.key === RINF).name} et ${cata.name}, contre une ville gauloise gardée par 600 × ${unitsData.find(u => u.key === GINF).name} et 300 × ${unitsData.find(u => u.key === GARC).name}, sans héros ni technologie ; pertes de l'attaquant, engins compris / du défenseur) :\n`);
row(['Attaque', 'Mur 10 plein', 'Mur 20 plein', 'Mur 20 à moitié des vies']);
row(['---', '---', '---', '---']);
for (const [s, e] of [[1000, 1], [1000, 20], [1000, 100], [1000, 200], [3000, 50], [3000, 150]]) row([`${fmt(s)} soldats + ${e} engin${e > 1 ? 's' : ''}`, siegeFight(s, e, 10, 1), siegeFight(s, e, 20, 1), siegeFight(s, e, 20, 0.5)]);

// ---------- 3. économie d'une colonie ----------
console.log('\n## 3. Économie d\'une ville secondaire (+20 %)\n');
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
// placement (décision du 30 octobre 2026) : lu dans les données (effects.capitalOnly / effects.notInCapital)
const names = (keep) => buildingsData.filter(b => !b.faction && keep(b.key)).map(b => b.name).join(', ');
console.log(`Bâtiments des colonies seulement : ${names(fx.notInCapital)}. Bâtiments de la capitale seulement (leurs effets valent pour toutes les villes du joueur) : ${names(fx.capitalOnly)}, et le bâtiment de la civilisation.`);
console.log(`Stock : chaque ville garde ce qu'elle produit, avec son propre plafond ; constructions, recrutements, recherche, soins, héros et fondation se paient sur la somme des villes (la ville de l'action d'abord), l'entretien des troupes sur la somme des greniers. Pillage, raids, marché et transports ne touchent que la ville concernée.`);

// ---------- 4. militaire hors capitale ----------
console.log('\n## 4. Recrutement hors capitale\n');
const b20 = cumul('BARRACKS', 1, 20), s20 = cumul('STABLE', 1, 20);
const gb1 = costAt('GREAT_BARRACKS', 1), gs1 = costAt('GREAT_STABLE', 1);
console.log(`Caserne, Écurie et Atelier sont réservés à la capitale (GDD : « hors capitale », Grandes caserne et écurie). La Grande caserne d'une colonie demande Caserne 20 dans la capitale : ${fmt(b20.total)} ressources et ${h(b20.timeH)} de chantier cumulés ; la Grande écurie demande Écurie 20 : ${fmt(s20.total)} et ${h(s20.timeH)}.`);
console.log(`Grande caserne niveau 1 : ${fmt(sum(gb1))} ressources ; Grande écurie niveau 1 : ${fmt(sum(gs1))}. Les engins de siège ne se fabriquent que dans la capitale.`);
console.log(`Toute unité formée rejoint la garnison de la capitale, celles d'une Grande caserne de colonie comprises (le temps de formation reste celui du bâtiment de la colonie) ; une colonie n'est défendue que par les armées qu'on y envoie.`);
console.log(`Lecture : une colonie est d'abord une ville économique (+20 %, Moulin, Scierie, Grand dépôt…) ; ses Grandes caserne et écurie ajoutent une file de formation une fois la capitale au bout de ses casernes, soit après plusieurs semaines ; la capitale reste le cœur militaire (Forge, Atelier, Résidence, Ambassade, Chambre au Trésor, Domus).`);
