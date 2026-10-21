#!/usr/bin/env node
// La recherche est-elle en adéquation avec les constructions ? Deux vérifications avec les données du jeu :
//  1. niveau par niveau : coût et temps d'un niveau de technologie contre ceux du niveau d'Académie qui le débloque ;
//  2. une partie simulée : un joueur qui développe sa ville uniformément (champs et Bâtiment principal au niveau de
//     l'Académie), monte l'Académie dès qu'il le peut et recherche en parallèle avec une seule file — quand les
//     technologies suivent-elles l'Académie, quelle part de son revenu la recherche consomme-t-elle ?
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
const { getProductionAtLevel } = require(R + '/src/utils/calculations');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.+)$/); return m ? [m[1], Number(m[2])] : [a, true]; }));
const RULES = { ...T.RULES, ...(args.costGrowth ? { costGrowth: args.costGrowth } : {}), ...(args.timeGrowth ? { timeGrowth: args.timeGrowth } : {}) };
const MAXL = (t) => args.maxLevel || T.maxLevelOf(t);
const sum = c => ['wood', 'stone', 'iron', 'food'].reduce((s, r) => s + (c[r] || 0), 0);
const hm = s => (s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} j`);
const n = v => Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' ');

const academy = buildingsData.find(b => b.key === 'ACADEMY');
const bCost = (b, L) => Math.floor(sum(b.costL1) * Math.pow(config.build.costMultiplierBase, L - 1));
const bTime = (b, L, mainHall) => Math.floor((b.timeL1Sec || 60) * Math.pow(config.build.timeMultiplierBase, L - 1) * (1 - Math.min(60, 2.5 * mainHall) / 100));
const rCost = (t, L) => Math.floor(sum(t.costL1) * Math.pow(RULES.costGrowth, L - 1));
const rTime = (t, L, academyLevel) => Math.max(1, Math.floor(Math.floor((t.timeL1Sec || 600) * Math.pow(RULES.timeGrowth, L - 1)) * (1 - Math.min(RULES.timeReductionMaxPct, academyLevel) / 100)));

console.log(`Courbes : constructions coût ×${config.build.costMultiplierBase} et temps ×${config.build.timeMultiplierBase} par niveau ; recherche coût ×${RULES.costGrowth} et temps ×${RULES.timeGrowth} par niveau, ${MAXL(T.TECHS[0])} niveaux.`);
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

console.log('\n=== 2. Partie simulée : Académie montée dès que possible, une recherche à la fois, champs au niveau de l\'Académie ===');
const FIELDS = Object.entries(config.city.fieldSlots).map(([k, v]) => [k, v.length]);
const incomePerHour = (L) => 25 + FIELDS.reduce((s, [k, cnt]) => s + cnt * getProductionAtLevel(k, Math.max(1, Math.min(20, L)), buildingsData), 0);
const effectScale = args.effectScale || 1;
let hour = 0, res = 0, academyLevel = 1, build = null, research = null, spentBuild = 0, spentResearch = 0;
const levels = Object.fromEntries(T.TECHS.map(t => [t.key, 0]));
const reached = [];   // par niveau d'Académie : heure, niveaux de technologie, dépenses
const startable = (t) => levels[t.key] < MAXL(t) && levels[t.key] + 1 <= academyLevel && (t.prereq || []).every(p => levels[p.key] >= p.level);
const maxed = () => T.TECHS.every(t => levels[t.key] >= MAXL(t));
let allMaxedAt = null, academy20At = null;
while (hour < 24 * 400 && !(academyLevel >= 20 && maxed())) {
  res += incomePerHour(academyLevel);
  if (build && hour >= build.endsAt) { academyLevel = build.level; build = null; reached.push({ level: academyLevel, hour, tech: { ...levels }, spentBuild, spentResearch }); if (academyLevel === 20) academy20At = hour; }
  if (research && hour >= research.endsAt) { levels[research.key] = research.level; research = null; if (maxed() && allMaxedAt === null) allMaxedAt = hour; }
  if (!build && academyLevel < 20) {
    const c = bCost(academy, academyLevel + 1);
    if (res >= c) { res -= c; spentBuild += c; build = { level: academyLevel + 1, endsAt: hour + bTime(academy, academyLevel + 1, academyLevel) / 3600 }; }
  }
  if (!research) {
    // la technologie la moins avancée qui peut démarrer, si elle est payable sans priver le chantier suivant
    const nextBuild = academyLevel < 20 && !build ? bCost(academy, academyLevel + 1) : 0;
    const cands = T.TECHS.filter(startable).sort((a, b) => levels[a.key] - levels[b.key]);
    for (const t of cands) { const c = rCost(t, levels[t.key] + 1); if (res - c >= nextBuild * 0.5) { res -= c; spentResearch += c; research = { key: t.key, level: levels[t.key] + 1, endsAt: hour + rTime(t, levels[t.key] + 1, academyLevel) / 3600 }; break; } }
  }
  hour++;
}
console.log('Académie | jour | technologies (min / moy. / max) | ressources chantier Académie | ressources recherche | part recherche');
for (const r of reached) {
  const vals = Object.values(r.tech); const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if ([2, 3, 5, 8, 10, 12, 15, 18, 20].includes(r.level)) console.log(`${String(r.level).padStart(8)} | ${(r.hour / 24).toFixed(1).padStart(5)} | ${Math.min(...vals)} / ${avg.toFixed(1)} / ${Math.max(...vals)} | ${n(r.spentBuild)} | ${n(r.spentResearch)} | ${(r.spentResearch / Math.max(1, r.spentBuild + r.spentResearch) * 100).toFixed(0)} %`);
}
console.log(`Académie 20 atteinte au jour ${academy20At === null ? '—' : (academy20At / 24).toFixed(1)} ; toutes les technologies au maximum au jour ${allMaxedAt === null ? '— (pas dans les 400 jours)' : (allMaxedAt / 24).toFixed(1)} ; dépenses totales : chantier ${n(spentBuild)}, recherche ${n(spentResearch)} (${(spentResearch / (spentBuild + spentResearch) * 100).toFixed(0)} % du total).`);
const bonusAt = (key, eff) => (levels[key] * (T.techOf(key).effects[eff] || 0) * effectScale).toFixed(2);
console.log(`Bonus en fin de simulation : production +${bonusAt('AGRONOMY', 'productionBonusPct')} %, attaque +${bonusAt('TACTICS', 'attackBonusPct')} %, défense +${bonusAt('DISCIPLINE', 'defenseBonusPct')} %, vitesse +${bonusAt('CARTOGRAPHY', 'armySpeedBonusPct')} %.`);
