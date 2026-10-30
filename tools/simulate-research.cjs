#!/usr/bin/env node
// La recherche est-elle en adéquation avec les constructions ? Deux vérifications avec les données du jeu :
//  1. niveau par niveau : coût et temps d'un niveau de technologie contre ceux du niveau d'Académie qui le débloque ;
//  2. une partie simulée aux règles du serveur : un joueur part de rien, paie ses champs, son Bâtiment principal, ses
//     entrepôts et son Académie (deux files, stocks plafonnés, rien au-dessus du Bâtiment principal), monte l'Académie dès
//     qu'il le peut et recherche en parallèle avec une seule file — quand les technologies suivent-elles l'Académie,
//     quelle part de son revenu la recherche consomme-t-elle ?
//   node tools/simulate-research.cjs                      # données actuelles
//   node tools/simulate-research.cjs --costGrowth=1.45 --timeGrowth=1.5 --maxLevel=10 --effectScale=2   # comparaison
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'simulation-only-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://simulation:simulation@localhost:5432/simulation';
const path = require('path');
const R = path.join(__dirname, '..');
const config = require(R + '/src/config');
const { buildingsData } = require(R + '/src/config/gamedata');
const T = require(R + '/src/utils/techEffects');
const { getProductionAtLevel, cityStorageCaps, buildCostFor, buildSecondsFor } = require(R + '/src/utils/calculations');
const fx = require(R + '/src/utils/buildingEffects');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.+)$/); return m ? [m[1], Number(m[2])] : [a, true]; }));
const RULES = { ...T.RULES, ...(args.costGrowth ? { costGrowth: args.costGrowth } : {}), ...(args.timeGrowth ? { timeGrowth: args.timeGrowth } : {}) };
const MAXL = (t) => args.maxLevel || T.maxLevelOf(t);
const sum = c => ['wood', 'stone', 'iron', 'food'].reduce((s, r) => s + (c[r] || 0), 0);
const hm = s => (s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} j`);
const n = v => Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' ');

const academy = buildingsData.find(b => b.key === 'ACADEMY');
// coût et temps d'un niveau de bâtiment : ceux du serveur (champs ×1,45 et ×1,30, Bâtiment principal ×1,30 de temps)
const bCost = (b, L) => sum(buildCostFor(b, L));
const bTime = (b, L, mainHall) => Math.floor(buildSecondsFor(b, L) * (1 - fx.buildTimeReductionPct([{ key: 'MAIN_HALL', level: mainHall }]) / 100));
const rCost = (t, L) => Math.floor(sum(t.costL1) * Math.pow(RULES.costGrowth, L - 1));
const rTime = (t, L, academyLevel) => Math.max(1, Math.floor(Math.floor((t.timeL1Sec || 600) * Math.pow(RULES.timeGrowth, L - 1)) * (1 - Math.min(RULES.timeReductionMaxPct, academyLevel) / 100)));

console.log(`Courbes : constructions coût ×${config.build.costMultiplierBase} (champs ×${config.build.fieldCostMultiplier}) et temps ×${config.build.timeMultiplierBase} (champs et Bâtiment principal ×${config.build.slowTimeMultiplier}) par niveau ; recherche coût ×${RULES.costGrowth} et temps ×${RULES.timeGrowth} par niveau, ${MAXL(T.TECHS[0])} niveaux.`);
console.log('\n=== 1. Niveau par niveau : un niveau de technologie contre le niveau d\'Académie qui le débloque (réductions du même niveau) ===');
const first = T.techOf('AGRONOMY'), second = T.techOf('ENGINEERING');
console.log('niv. | Académie coût / temps | ' + first.name + ' coût / temps (ratio) | ' + second.name + ' coût / temps (ratio)');
for (const L of [1, 2, 3, 5, 8, 10, 12, 15, 18, 20]) {
  if (L > MAXL(first)) break;
  const ac = bCost(academy, L), at = bTime(academy, L, L);
  const line = [first, second].map(t => { const c = rCost(t, L), tm = rTime(t, L, L); return `${n(c)} / ${hm(tm)} (×${(c / ac).toFixed(2)} / ×${(tm / at).toFixed(2)})`; });
  console.log(`${String(L).padStart(4)} | ${n(ac)} / ${hm(at)} | ${line.join(' | ')}`);
}
const totalAcademy = Array.from({ length: 20 }, (_, i) => bCost(academy, i + 1)).reduce((a, b) => a + b, 0);
const totalAcademyTime = Array.from({ length: 20 }, (_, i) => bTime(academy, i + 1, i + 1)).reduce((a, b) => a + b, 0);
const totalResearch = T.TECHS.reduce((s, t) => s + Array.from({ length: MAXL(t) }, (_, i) => rCost(t, i + 1)).reduce((a, b) => a + b, 0), 0);
const totalResearchTime = T.TECHS.reduce((s, t) => s + Array.from({ length: MAXL(t) }, (_, i) => rTime(t, i + 1, Math.min(20, i + 1))).reduce((a, b) => a + b, 0), 0);
console.log(`Académie 1 → 20 : ${n(totalAcademy)} ressources, ${hm(totalAcademyTime)} de chantier. Les ${T.TECHS.length} technologies au maximum : ${n(totalResearch)} ressources (×${(totalResearch / totalAcademy).toFixed(1)}), ${hm(totalResearchTime)} de recherche en une seule file.`);

// Toute la ville (bâtiments d'une civilisation + 18 champs, niveaux 1 à 20, deux files de construction) contre toute la recherche
const FIELD_KEYS = ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'];
const cityBuildings = buildingsData.filter(b => !FIELD_KEYS.includes(b.key) && (!b.faction || b.faction === 'ROME'));
const total20 = (b) => Array.from({ length: Math.min(20, b.maxLevel || 20) }, (_, i) => bCost(b, i + 1)).reduce((a, c) => a + c, 0);
const time20 = (b) => Array.from({ length: Math.min(20, b.maxLevel || 20) }, (_, i) => bTime(b, i + 1, i + 1)).reduce((a, c) => a + c, 0);
const fieldSlots = Object.entries(config.city.fieldSlots);
const cityCost = cityBuildings.reduce((s, b) => s + total20(b), 0) + fieldSlots.reduce((s, [k, v]) => s + v.length * total20(buildingsData.find(b => b.key === k)), 0);
const cityTime = (cityBuildings.reduce((s, b) => s + time20(b), 0) + fieldSlots.reduce((s, [k, v]) => s + v.length * time20(buildingsData.find(b => b.key === k)), 0)) / config.build.maxRunning;
console.log(`Ville entière (${cityBuildings.length} bâtiments et ${fieldSlots.reduce((s, [, v]) => s + v.length, 0)} champs au niveau 20) : ${n(cityCost)} ressources, ${hm(cityTime)} de chantier avec ${config.build.maxRunning} files. La recherche complète en représente ${(totalResearch / cityCost * 100).toFixed(0)} % des ressources et ${(totalResearchTime / cityTime * 100).toFixed(0)} % du temps.`);

console.log('\n=== 2. Partie simulée : champs, Bâtiment principal, entrepôts et Académie payés, stocks plafonnés, deux files de construction, une de recherche ===');
// Règles du serveur (routes/cities.js, resourceProcessor.js) : départ à 500 de chaque, Bâtiment principal 1, aucun champ ; rien
// au-dessus du Bâtiment principal (Académie : Bât. principal 3) ; coût et temps de calculations.buildCostFor / buildSecondsFor (− Ingénierie) ;
// production de base 5/5/5/10 + champs (+ Agronomie) ; stocks plafonnés par l'Entrepôt et le Silo (1 000 au moins) ; temps réduits
// par le Bâtiment principal et l'Académie (buildingEffects). Stratégie : un entrepôt quand un coût visé ou un stock touche le
// plafond, l'Académie dès qu'elle est permise et payable, sinon le moins cher entre le Bâtiment principal (jusqu'à 20) et le champ
// le plus bas ; une recherche est lancée si elle laisse la moitié du prochain niveau d'Académie. Ni armée ni autre bâtiment.
const RES = T.RESOURCES;
const FIELD_RES = { LUMBER: 'wood', QUARRY: 'stone', IRON_MINE: 'iron', FARM: 'food' };
const BASE_PROD = { wood: 5, stone: 5, iron: 5, food: 10 };
const STORE_OF = { wood: 'WAREHOUSE', stone: 'WAREHOUSE', iron: 'WAREHOUSE', food: 'SILO' };
const defOf = k => buildingsData.find(b => b.key === k);
const effectScale = args.effectScale || 1;
const levels = Object.fromEntries(T.TECHS.map(t => [t.key, 0]));
const techPct = eff => T.techPct(levels, eff) * effectScale;
const city = { MAIN_HALL: 1, ACADEMY: 0, WAREHOUSE: 0, SILO: 0 };
const fields = Object.entries(config.city.fieldSlots).flatMap(([k, v]) => v.map(() => ({ key: k, level: 0 })));
const stock = { wood: 500, stone: 500, iron: 500, food: 500 };
// stockage comme le serveur (calculations.cityStorageCaps : dépôts et silos additionnés, 1 000 au moins)
const capOf = r => cityStorageCaps([{ key: 'WAREHOUSE', level: city.WAREHOUSE }, { key: 'SILO', level: city.SILO }], buildingsData)[r === 'food' ? 'maxFoodStorage' : 'maxStorage'];
const prod = {};
const refreshProd = () => { for (const r of RES) prod[r] = (BASE_PROD[r] + fields.reduce((s, f) => s + (FIELD_RES[f.key] === r ? getProductionAtLevel(f.key, f.level, buildingsData) : 0), 0)) * (1 + techPct('productionBonusPct') / 100); };
refreshProd();
const buildCostOf = (k, L) => T.scaleCost(buildCostFor(defOf(k), L), Math.max(0, 1 - techPct('buildCostReductionPct') / 100));
const researchCostOf = (t, L) => Object.fromEntries(RES.map(r => [r, Math.floor((t.costL1[r] || 0) * Math.pow(RULES.costGrowth, L - 1))]));
const buildSec = (k, L) => Math.max(1, Math.floor(buildSecondsFor(defOf(k), L) * (1 - fx.buildTimeReductionPct([{ key: 'MAIN_HALL', level: city.MAIN_HALL }, { key: 'ACADEMY', level: city.ACADEMY }]) / 100)));
const canPay = (c, keep = null) => RES.every(r => stock[r] - c[r] >= (keep ? keep[r] * 0.5 : 0));
const running = [];   // chantiers en cours : { key, field, level, endsAt (minutes), cost }
const busy = (key, field = null) => running.some(q => q.key === key && q.field === field);
const startable = (t) => levels[t.key] < MAXL(t) && levels[t.key] + 1 <= city.ACADEMY && (t.prereq || []).every(p => levels[p.key] >= p.level);
const maxed = () => T.TECHS.every(t => levels[t.key] >= MAXL(t));
const minField = () => Math.min(...fields.map(f => f.level));
const nextAcademy = () => (city.ACADEMY < 20 && !busy('ACADEMY') && (city.ACADEMY === 0 ? city.MAIN_HALL >= 3 : city.ACADEMY + 1 <= city.MAIN_HALL) ? { key: 'ACADEMY', field: null, level: city.ACADEMY + 1 } : null);
function buildChoices() {
  const out = [], ac = nextAcademy();
  const grow = [];
  if (city.MAIN_HALL < 20 && !busy('MAIN_HALL')) grow.push({ key: 'MAIN_HALL', field: null, level: city.MAIN_HALL + 1 });
  const f = fields.filter(x => x.level < Math.min(20, city.MAIN_HALL) && !busy(x.key, x)).sort((a, b) => a.level - b.level)[0];
  if (f) grow.push({ key: f.key, field: f, level: f.level + 1 });
  for (const g of grow) g.cost = buildCostOf(g.key, g.level);
  grow.sort((a, b) => sum(a.cost) - sum(b.cost));
  if (ac) ac.cost = buildCostOf('ACADEMY', ac.level);
  // entrepôt ou silo quand un coût visé dépasse 90 % du plafond, ou qu'un stock est plein à 95 %
  const tech = T.TECHS.filter(startable).sort((a, b) => levels[a.key] - levels[b.key])[0];
  const wanted = [ac?.cost, ...grow.map(g => g.cost), tech ? researchCostOf(tech, levels[tech.key] + 1) : null].filter(Boolean);
  for (const store of ['SILO', 'WAREHOUSE']) {
    const rs = RES.filter(r => STORE_OF[r] === store);
    const need = rs.some(r => stock[r] >= 0.95 * capOf(r) || wanted.some(c => c[r] > 0.9 * capOf(r)));
    if (need && city[store] < Math.min(20, city.MAIN_HALL) && !busy(store)) out.push({ key: store, field: null, level: city[store] + 1, cost: buildCostOf(store, city[store] + 1) });
  }
  return [...out, ...(ac ? [ac] : []), ...grow];
}
const MIN_PER_DAY = 1440;
let minute = 0, spentBuild = 0, spentAcademy = 0, spentResearch = 0, research = null;
let allMaxedAt = null, academy20At = null, mainHall20At = null, fields20At = null;
const reached = [];   // par niveau d'Académie : minute, Bâtiment principal, champs, niveaux de technologie, dépenses
while (minute < MIN_PER_DAY * 400 && !(city.ACADEMY >= 20 && maxed())) {
  for (const r of RES) stock[r] = Math.max(stock[r], Math.min(capOf(r), stock[r] + prod[r] / 60));
  for (const q of running.filter(x => x.endsAt <= minute)) {
    running.splice(running.indexOf(q), 1);
    if (q.field) { q.field.level = q.level; refreshProd(); if (fields20At === null && minField() >= 20) fields20At = minute; } else city[q.key] = q.level;
    if (q.key === 'MAIN_HALL' && q.level === 20) mainHall20At = minute;
    if (q.key === 'ACADEMY') { reached.push({ level: q.level, minute, mainHall: city.MAIN_HALL, fieldMin: minField(), fieldAvg: fields.reduce((s, f) => s + f.level, 0) / fields.length, tech: { ...levels }, spentBuild, spentAcademy, spentResearch }); if (q.level === 20) academy20At = minute; }
  }
  if (research && research.endsAt <= minute) { levels[research.key] = research.level; research = null; refreshProd(); if (maxed() && allMaxedAt === null) allMaxedAt = minute; }
  while (running.length < config.build.maxRunning) {
    const c = buildChoices().find(x => canPay(x.cost));
    if (!c) break;
    for (const r of RES) stock[r] -= c.cost[r];
    spentBuild += sum(c.cost); if (c.key === 'ACADEMY') spentAcademy += sum(c.cost);
    running.push({ ...c, endsAt: minute + buildSec(c.key, c.level) / 60 });
  }
  if (!research) {
    // la technologie la moins avancée qui peut démarrer, si elle laisse la moitié du prochain niveau d'Académie
    const ac = nextAcademy(), keep = ac ? buildCostOf('ACADEMY', ac.level) : null;
    for (const t of T.TECHS.filter(startable).sort((a, b) => levels[a.key] - levels[b.key])) {
      const c = researchCostOf(t, levels[t.key] + 1);
      if (canPay(c, keep)) { for (const r of RES) stock[r] -= c[r]; spentResearch += sum(c); research = { key: t.key, level: levels[t.key] + 1, endsAt: minute + rTime(t, levels[t.key] + 1, city.ACADEMY) / 60 }; break; }
    }
  }
  minute++;
}
const day = m => (m === null ? '—' : (m / MIN_PER_DAY).toFixed(1));
console.log('Académie | jour | Bât. principal | champs (min / moy.) | technologies (min / moy. / max) | constructions (dont Académie) | recherche | part recherche');
for (const r of reached) {
  const vals = Object.values(r.tech); const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if ([2, 3, 5, 8, 10, 12, 15, 18, 20].includes(r.level)) console.log(`${String(r.level).padStart(8)} | ${day(r.minute).padStart(5)} | ${String(r.mainHall).padStart(14)} | ${r.fieldMin} / ${r.fieldAvg.toFixed(1)} | ${Math.min(...vals)} / ${avg.toFixed(1)} / ${Math.max(...vals)} | ${n(r.spentBuild)} (${n(r.spentAcademy)}) | ${n(r.spentResearch)} | ${(r.spentResearch / Math.max(1, r.spentBuild + r.spentResearch) * 100).toFixed(0)} %`);
}
console.log(`Bâtiment principal 20 au jour ${day(mainHall20At)}, tous les champs au niveau 20 au jour ${day(fields20At)}, Académie 20 au jour ${day(academy20At)} ; toutes les technologies au maximum au jour ${allMaxedAt === null ? '— (pas dans les 400 jours)' : day(allMaxedAt)} ; dépenses totales : constructions ${n(spentBuild)} (dont Académie ${n(spentAcademy)}), recherche ${n(spentResearch)} (${(spentResearch / Math.max(1, spentBuild + spentResearch) * 100).toFixed(0)} % du total).`);
const bonusAt = (key, eff) => (levels[key] * (T.techOf(key).effects[eff] || 0) * effectScale).toFixed(2);
console.log(`Bonus en fin de simulation : production +${bonusAt('AGRONOMY', 'productionBonusPct')} %, attaque +${bonusAt('TACTICS', 'attackBonusPct')} %, défense +${bonusAt('DISCIPLINE', 'defenseBonusPct')} %, vitesse +${bonusAt('CARTOGRAPHY', 'armySpeedBonusPct')} %.`);
