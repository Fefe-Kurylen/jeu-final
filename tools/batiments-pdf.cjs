// Récapitulatif PDF des bâtiments du jeu avec leurs attributs (docs/BATIMENTS.pdf)
// Usage : NODE_PATH=<dossier de playwright> node tools/batiments-pdf.cjs [--png=<aperçu.png>], variables du serveur
// chargées (src/config) comme pour les autres outils.
// Les formules sont celles du serveur (utils/calculations.js buildCostFor / buildSecondsFor, utils/buildingEffects.js) et
// du client (getBuildingEffect).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const buildings = JSON.parse(fs.readFileSync(path.join(root, 'data/buildings.json'), 'utf8')).buildings;
const config = require(path.join(root, 'src/config'));
const { buildCostFor, buildSecondsFor, getStorageAtLevel, getFactionBonus } = require(path.join(root, 'src/utils/calculations'));
const { factionsData } = require(path.join(root, 'src/config/gamedata'));
const fx = require(path.join(root, 'src/utils/buildingEffects'));
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [a, true]; }));

const FN = { ROME: 'Rome', GAUL: 'Gaule', GREEK: 'Grèce', EGYPT: 'Égypte', HUN: 'Huns', SULTAN: 'Sultanat' };
const CAT = { BASE: 'Infrastructure', INTERMEDIATE: 'Militaire', ADVANCED: 'Avancé', FACTION: 'Faction' };
const ORDER = ['MAIN_HALL', 'FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'WAREHOUSE', 'SILO', 'RALLY_POINT', 'BARRACKS', 'STABLE', 'WORKSHOP', 'ACADEMY', 'FORGE', 'HIDEOUT', 'HEALING_TENT', 'MARKET', 'WALL', 'MILL', 'BAKERY', 'SAWMILL', 'STONEMASON', 'FOUNDRY', 'GREAT_SILO', 'GREAT_WAREHOUSE', 'GREAT_BARRACKS', 'GREAT_STABLE', 'EMBASSY', 'TREASURE_CHAMBER', 'HERO_MANSION', 'WATCHTOWER', 'RESIDENCE', 'TRADE_OFFICE'];
const def = (k) => buildings.find(b => b.key === k);
const name = (k) => def(k)?.name || k;

const fmt = (n) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.floor(n));
const dur = (s) => { if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); if (h < 24) return `${h}h ${m}m`; return `${Math.floor(h / 24)}j ${h % 24}h`; };
const cost = (d, L) => { const c = buildCostFor(d, L); return [c.wood, c.stone, c.iron, c.food].map(fmt).join(' · '); };
const time = (d, L) => dur(buildSecondsFor(d, L));
const pct = (v) => (Math.round(v * 100) / 100).toString().replace('.', ',');
const storage = (key, L) => getStorageAtLevel(key, L, buildings);
const lerpExp = (a, b, t) => a * Math.pow(b / a, t);
function production(k, L) {
  const fx = def(k).effects, p = { FARM: 'foodProd', LUMBER: 'woodProd', QUARRY: 'stoneProd', IRON_MINE: 'ironProd' }[k];
  const L1 = fx[p + 'L1'] || 10, L10 = fx[p + 'L10'], L20 = fx[p + 'L20'] || 4500;
  if (L <= 1) return L1; if (L >= 20) return L20;
  if (L10) return L <= 10 ? Math.round(lerpExp(L1, L10, (L - 1) / 9)) : Math.round(lerpExp(L10, L20, (L - 10) / 10));
  return Math.round(lerpExp(L1, L20, (L - 1) / 19));
}
// palier des unités qu'ouvre un bâtiment de formation à ce niveau (unlockIntermediateTier / unlockEliteTier des données)
const tierOf = (k, L) => (L >= def(k).effects.unlockEliteTier ? 'élite' : L >= def(k).effects.unlockIntermediateTier ? 'intermédiaires' : 'unités de base');
// effets lus avec les fonctions du serveur (utils/buildingEffects.js) pour un bâtiment seul à ce niveau
const at = (k, L) => [{ key: k, level: L }];
const eff = (k, name) => def(k).effects[name];
const L1Of = (k) => Object.entries(def(k).effects).find(([n]) => /ProdBonusPctL1$/.test(n))[1];
const EFFECT = {
  MAIN_HALL: (L) => `Construction −${pct(fx.buildTimeReductionPct(at('MAIN_HALL', L)))} % · plafonne les autres bâtiments au niv. ${L}`,
  FARM: (L) => `+${fmt(production('FARM', L))} céréales/h`, LUMBER: (L) => `+${fmt(production('LUMBER', L))} bois/h`,
  QUARRY: (L) => `+${fmt(production('QUARRY', L))} pierre/h`, IRON_MINE: (L) => `+${fmt(production('IRON_MINE', L))} fer/h`,
  WAREHOUSE: (L) => `Capacité ${fmt(storage('WAREHOUSE', L))} (bois, pierre, fer)`, SILO: (L) => `Capacité ${fmt(storage('SILO', L))} céréales`,
  RALLY_POINT: (L) => `${fx.maxArmies(at('RALLY_POINT', L))} armée(s) en campagne · rassemblement d'alliance de ${fx.rallyMaxArmies(L)} armées au plus`,
  BARRACKS: (L) => `Entraînement −${pct(L * eff('BARRACKS', 'trainTimeReductionPctPerLevel'))} % · ${tierOf('BARRACKS', L)}`,
  STABLE: (L) => `Entraînement −${pct(L * eff('STABLE', 'trainTimeReductionPctPerLevel'))} % · ${tierOf('STABLE', L)}`,
  WORKSHOP: (L) => `Entraînement −${L * 4} %${L >= 5 ? ' · engins de siège' : ' · (engins dès le niv. 5)'}`,
  ACADEMY: (L) => `Construction −${L} % (plafond commun 60 %)`,
  FORGE: (L) => `Attaque et défense de toutes vos troupes +${pct(fx.forgeAttackPct(at('FORGE', L)))} %, dans tous les combats`,
  HIDEOUT: (L) => `${fmt(fx.hideoutAmount(at('HIDEOUT', L), null))} de chaque ressource à l'abri des pillages (Gaule × ${pct(1 + getFactionBonus('GAUL', 'hideoutCapacity', factionsData) / 100)})`,
  HEALING_TENT: (L) => `${Math.min(70, 30 + L * 3)} % des pertes récupérées en blessés`,
  MARKET: (L) => `${fx.merchantCount(at('MARKET', L))} marchand(s) · taxe du marchand du serveur ${fx.npcMarketTaxPct(L)} % · armées de transport +${L * eff('MARKET', 'playerTransportBonusPctPerLevel')} %`,
  WALL: (L) => `Défense +${L} % · ${fmt(L * config.combat.wallHpPerLevel)} PV de mur · réparation +${L} % · sur l'enceinte · colonie : niveau ${fx.maxLevelIn('WALL', false)} au plus`,
  MILL: (L) => `Céréales +${pct(L * L1Of('MILL'))} %`, BAKERY: (L) => `Céréales +${pct(L * L1Of('BAKERY'))} %`, SAWMILL: (L) => `Bois +${pct(L * L1Of('SAWMILL'))} %`, STONEMASON: (L) => `Pierre +${pct(L * L1Of('STONEMASON'))} %`, FOUNDRY: (L) => `Fer +${pct(L * L1Of('FOUNDRY'))} %`,
  GREAT_SILO: (L) => `Capacité +${fmt(storage('GREAT_SILO', L))} céréales (3 fois un silo)`, GREAT_WAREHOUSE: (L) => `Capacité +${fmt(storage('GREAT_WAREHOUSE', L))} (bois, pierre, fer ; 3 fois un dépôt)`,
  GREAT_BARRACKS: (L) => `Recrute infanterie et archers dans une colonie (les recrues rejoignent la capitale) · entraînement −${Math.min(60, L * 4)} % · ${tierOf('GREAT_BARRACKS', L)} · capitale −${pct(fx.capitalTrainBoostPct([{ buildings: at('GREAT_BARRACKS', L) }], 'INFANTRY'))} %`,
  GREAT_STABLE: (L) => `Recrute la cavalerie dans une colonie (les recrues rejoignent la capitale) · entraînement −${Math.min(60, L * 4)} % · ${tierOf('GREAT_STABLE', L)} · capitale −${pct(fx.capitalTrainBoostPct([{ buildings: at('GREAT_STABLE', L) }], 'CAVALRY'))} %`,
  EMBASSY: (L) => `${L >= fx.allianceCreateLevel() ? 'Rejoindre et fonder une alliance' : L >= fx.allianceJoinLevel() ? `Rejoindre une alliance (fonder au niv. ${fx.allianceCreateLevel()})` : `Alliance : rejoindre au niv. ${fx.allianceJoinLevel()}, fonder au niv. ${fx.allianceCreateLevel()}`} · chef : ${fx.allianceMaxMembers(L)} membres au plus`,
  TREASURE_CHAMBER: (L) => `${fx.goldPerDayAtLevel(L)} or par jour · l'or ne se pille jamais`,
  HERO_MANSION: () => 'Accès au héros depuis la ville',
  WATCHTOWER: (L) => `${L >= 10 ? '2 espions' : L >= 5 ? '1 espion' : 'Espion au niv. 5'} · alerte des attaques sur toutes les villes${L >= 15 ? ' avec attaquant et effectifs' : L >= 10 ? ' avec attaquant' : ''} · voit les armées à ${fx.visionRadius(L)} cases de chaque ville`,
  RESIDENCE: (L) => `Construction −${pct(L * 0.25)} % · colonie : gisement +${def('RESIDENCE').effects.colonyNodeBonusPctPerNodeLevel} % par niveau sur sa ressource, ${String(def('RESIDENCE').effects.colonyOtherResourcesPct || 0).replace('-', '−')} % sur les autres`,
  TRADE_OFFICE: (L) => `Taxe des échanges −${pct(L * eff('TRADE_OFFICE', 'p2pTaxReductionPctPerLevel'))} point${L > 1 ? 's' : ''} · charge des marchands et des armées de transport +${pct(fx.merchantCapacityBonusPct(at('TRADE_OFFICE', L)))} %`,
  ROMAN_THERMAE: (L) => `Soins −${pct(L * 1.5)} % de temps · blessés +${pct(L * 0.5)} %`,
  GALLIC_BREWERY: (L) => `Défense de toutes les villes +${L} %`,
  GREEK_TEMPLE: (L) => `Blessés au lieu de morts +${pct(L * 0.5)} %`,
  EGYPTIAN_IRRIGATION: (L) => `Production de toutes les villes +${L} % · marche +${pct(L * 0.5)} %`,
  HUN_WAR_TENT: (L) => `Entretien −${pct(L * 0.5)} % · blessés +${pct(L * 0.5)} %`,
  SULTAN_DESERT_OUTPOST: (L) => `Entretien −${pct(fx.upkeepReductionPct(at('SULTAN_DESERT_OUTPOST', L)))} % · charge des marchands, transports et récoltes +${pct(fx.merchantCapacityBonusPct(at('SULTAN_DESERT_OUTPOST', L)))} %`
};
// Placement (décision du 30 octobre 2026) : capitale seulement (bonus pour toutes les villes), colonies seulement, partout
const WHERE = (d) => (d.effects?.capitalOnly ? 'Capitale<div class="k">bonus pour toutes les villes</div>' : d.effects?.notInCapital ? 'Colonies' : 'Partout');
const prereq = (d) => (d.prereq || []).length ? d.prereq.map(p => `${name(p.key)} ${p.level}`).join(', ') : '—';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const row = (d, extra = '') => {
  const max = d.maxLevel || 20, mid = Math.min(10, max);
  return `<tr>${extra}<td class="n">${esc(d.name)}<div class="k">${d.key}</div></td><td>${CAT[d.category] || d.category}</td><td>${WHERE(d)}</td><td class="c">${max}</td><td>${esc(prereq(d))}</td><td class="c">${cost(d, 1)}</td><td class="c">${time(d, 1)}</td><td class="c">${cost(d, max)}</td><td class="c">${time(d, max)}</td><td>${esc(EFFECT[d.key](1))}</td><td>${esc(EFFECT[d.key](mid))}</td><td>${esc(EFFECT[d.key](max))}</td></tr>`;
};
const head = (first) => `<thead><tr>${first}<th>Bâtiment</th><th>Catégorie</th><th>Où</th><th>Niv. max</th><th>Prérequis</th><th>Coût niv. 1<br><span class="k">bois · pierre · fer · céréales</span></th><th>Temps niv. 1</th><th>Coût niv. max</th><th>Temps niv. max</th><th>Effet niv. 1</th><th>Effet niv. 10</th><th>Effet niv. max</th></tr></thead>`;
const common = ORDER.map(def);
const B = config.build, fr = (x) => String(x).replace('.', ',');
const special = buildings.filter(b => b.faction);
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bâtiments d'Imperium Antiquitas</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  body { font-family: 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif; font-size: 8pt; color: #2a1e0e; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 4px; color: #5a3a10; } h2 { font-size: 11pt; margin: 14px 0 4px; color: #5a3a10; }
  p { margin: 3px 0; line-height: 1.35; }
  table { border-collapse: collapse; width: 100%; page-break-inside: auto; } tr { page-break-inside: avoid; }
  thead { display: table-header-group; } th { background: #4a3a22; color: #f3e2b0; text-align: left; padding: 4px 5px; font-size: 7.5pt; vertical-align: bottom; }
  td { border-bottom: 1px solid #d8c9a3; padding: 3px 5px; vertical-align: top; line-height: 1.25; }
  tr:nth-child(even) td { background: #f7efdc; } td.c { white-space: nowrap; } td.n { font-weight: bold; white-space: nowrap; }
  .k { font-weight: normal; font-size: 6.5pt; color: #7a6648; } th .k { color: #d9c69a; } .box { background: #f7efdc; border: 1px solid #c9b78a; padding: 6px 8px; margin: 6px 0 10px; }
</style></head><body>
<h1>Imperium Antiquitas — les bâtiments et leurs attributs</h1>
<div class="box"><p><b>Toutes les civilisations ont le même nombre de bâtiments : ${common.length + 1}</b> — les ${common.length} bâtiments communs ci-dessous, plus <b>un seul bâtiment spécial</b> par civilisation (tableau 2). Seul le bâtiment spécial change d'une civilisation à l'autre. Les Grecs construisent ${getFactionBonus('GREEK', 'buildTimeReduction', factionsData)} % plus vite ; les autres bonus de civilisation passent par les unités et le bâtiment spécial.</p>
<p>Coût d'un niveau = coût niv. 1 × ${fr(B.costMultiplierBase)} par niveau (champs × ${fr(B.fieldCostMultiplier)}) ; temps = temps niv. 1 × ${fr(B.timeMultiplierBase)} par niveau (champs et Bâtiment principal × ${fr(B.slowTimeMultiplier)}), avant les réductions du Bâtiment principal (2,5 %/niv.), de l'Académie (1 %/niv.) et de la Résidence (0,25 %/niv.), plafonnées à 60 %. Un bâtiment ne dépasse jamais le niveau du Bâtiment principal (qui monte à ${fx.maxLevelIn('MAIN_HALL', true)}, dans la capitale comme dans les colonies). Le Mur d'une colonie s'arrête au niveau ${fx.maxLevelIn('WALL', false)}. Emplacements autour du Bâtiment principal : ${config.city.ringSlots.capital} dans la capitale, ${config.city.ringSlots.colony} dans une colonie ; le Mur est sur l'enceinte et les champs autour. Chaque niveau construit rapporte 5 points de population.</p></div>
<h2>1. Les ${common.length} bâtiments communs à toutes les civilisations</h2>
<table>${head('')}<tbody>${common.map(d => row(d)).join('')}</tbody></table>
<h2>2. Le bâtiment spécial de chaque civilisation (un par civilisation, catégorie Faction)</h2>
<table>${head('<th>Civilisation</th>')}<tbody>${special.map(d => row(d, `<td class="n">${FN[d.faction] || d.faction}</td>`)).join('')}</tbody></table>
<p class="k" style="margin-top:8px">Généré par tools/batiments-pdf.cjs à partir de data/buildings.json — ${new Date().toLocaleDateString('fr-FR')}.</p>
</body></html>`;

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const out = path.join(root, 'docs/BATIMENTS.pdf');
  await page.pdf({ path: out, format: 'A4', landscape: true, printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
  if (args.png) { await page.setViewportSize({ width: 1400, height: 900 }); await page.screenshot({ path: args.png, fullPage: true }); }
  await browser.close();
  console.log(`${out} : ${common.length} bâtiments communs + ${special.length} spéciaux`);
})().catch(e => { console.error(e); process.exit(1); });
