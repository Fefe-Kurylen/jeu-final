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
const { buildCostFor, buildSecondsFor, getStorageAtLevel } = require(path.join(root, 'src/utils/calculations'));
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
const curve = (l1, l20, L) => L <= 0 ? 0 : L >= 20 ? l20 : Math.round(l1 * Math.pow(l20 / l1, (L - 1) / 19));
const storage = (key, L) => getStorageAtLevel(key, L, buildings);
const lerpExp = (a, b, t) => a * Math.pow(b / a, t);
function production(k, L) {
  const fx = def(k).effects, p = { FARM: 'foodProd', LUMBER: 'woodProd', QUARRY: 'stoneProd', IRON_MINE: 'ironProd' }[k];
  const L1 = fx[p + 'L1'] || 10, L10 = fx[p + 'L10'], L20 = fx[p + 'L20'] || 4500;
  if (L <= 1) return L1; if (L >= 20) return L20;
  if (L10) return L <= 10 ? Math.round(lerpExp(L1, L10, (L - 1) / 9)) : Math.round(lerpExp(L10, L20, (L - 10) / 10));
  return Math.round(lerpExp(L1, L20, (L - 1) / 19));
}
const EFFECT = {
  MAIN_HALL: (L) => `Construction −${pct(Math.min(60, L * 2.5))} %${L * 2.5 > 60 ? ' (plafond atteint)' : ''} · plafonne les autres bâtiments au niv. ${Math.min(20, L)}`,
  FARM: (L) => `+${fmt(production('FARM', L))} céréales/h`, LUMBER: (L) => `+${fmt(production('LUMBER', L))} bois/h`,
  QUARRY: (L) => `+${fmt(production('QUARRY', L))} pierre/h`, IRON_MINE: (L) => `+${fmt(production('IRON_MINE', L))} fer/h`,
  WAREHOUSE: (L) => `Capacité ${fmt(storage('WAREHOUSE', L))} (bois, pierre, fer)`, SILO: (L) => `Capacité ${fmt(storage('SILO', L))} céréales`,
  RALLY_POINT: (L) => `${Math.min(5, 1 + Math.floor(L / 5))} armée(s) en campagne par ville`,
  BARRACKS: (L) => `Entraînement −${pct(L * 0.5)} %${L >= 15 ? ' · élite' : L >= 7 ? ' · intermédiaires' : ' · unités de base'}`,
  STABLE: (L) => `Entraînement −${pct(L * 0.5)} %${L >= 15 ? ' · élite' : L >= 7 ? ' · intermédiaires' : ' · cavalerie de base'}`,
  WORKSHOP: (L) => `Entraînement −${L * 4} %${L >= 5 ? ' · engins de siège' : ' · (engins dès le niv. 5)'}`,
  ACADEMY: (L) => `Construction −${L} % (plafond commun 60 %)`, FORGE: (L) => `Défense de toutes les villes +${pct(L * 0.5)} %`,
  HIDEOUT: (L) => `${Math.min(L, 20)} % des ressources à l'abri des pillages`,
  HEALING_TENT: (L) => `${Math.min(70, 30 + L * 3)} % des pertes récupérées en blessés`,
  MARKET: (L) => `Taxe du marchand ${Math.max(5, 30 - Math.max(0, L - 1))} % · convois +${L * 5} %`,
  WALL: (L) => `Défense +${L} % · ${fmt(L * 1000)} PV de mur · réparation +${L} %`,
  MILL: (L) => `Céréales +${L * 5} %`, BAKERY: (L) => `Céréales +${L * 5} %`, SAWMILL: (L) => `Bois +${L * 5} %`, STONEMASON: (L) => `Pierre +${L * 5} %`, FOUNDRY: (L) => `Fer +${L * 5} %`,
  GREAT_SILO: (L) => `Capacité +${fmt(storage('GREAT_SILO', L))} céréales (3 fois un silo)`, GREAT_WAREHOUSE: (L) => `Capacité +${fmt(storage('GREAT_WAREHOUSE', L))} (bois, pierre, fer ; 3 fois un dépôt)`,
  GREAT_BARRACKS: (L) => `Recrute infanterie et archers dans une colonie (les recrues rejoignent la capitale) · entraînement −${Math.min(60, L * 4)} %`, GREAT_STABLE: (L) => `Recrute la cavalerie dans une colonie (les recrues rejoignent la capitale) · entraînement −${Math.min(60, L * 4)} %`,
  EMBASSY: (L) => L >= 7 ? 'Rejoindre et fonder une alliance' : L >= 5 ? 'Rejoindre une alliance (fonder au niv. 7)' : 'Alliance : rejoindre au niv. 5, fonder au niv. 7',
  TREASURE_CHAMBER: (L) => `${curve(10, 200, L)} or par jour`,
  HERO_MANSION: () => 'Accès au héros depuis la ville',
  WATCHTOWER: (L) => `${L >= 10 ? '2 espions' : L >= 5 ? '1 espion' : 'Espion au niv. 5'} · alerte des attaques sur toutes les villes${L >= 15 ? ' avec attaquant et effectifs' : L >= 10 ? ' avec attaquant' : ''}`,
  RESIDENCE: (L) => `Construction −${pct(L * 0.25)} %`,
  TRADE_OFFICE: (L) => `Convois marchands et transport par armée +${L} % de capacité`,
  ROMAN_THERMAE: (L) => `Soins −${pct(L * 1.5)} % de temps · blessés +${pct(L * 0.5)} %`,
  GALLIC_BREWERY: (L) => `Défense de toutes les villes +${L} %`,
  GREEK_TEMPLE: (L) => `Blessés au lieu de morts +${pct(L * 0.5)} %`,
  EGYPTIAN_IRRIGATION: (L) => `Production de toutes les villes +${L} % · marche +${pct(L * 0.5)} %`,
  HUN_WAR_TENT: (L) => `Entretien −${pct(L * 0.5)} % · blessés +${pct(L * 0.5)} %`,
  SULTAN_DESERT_OUTPOST: (L) => `Entretien −${pct(L * 0.5)} %`
};
const NOT_YET = { SULTAN_DESERT_OUTPOST: 'taxe entre villes à venir' };
// Placement (décision du 30 octobre 2026) : capitale seulement (bonus pour toutes les villes), colonies seulement, partout
const WHERE = (d) => (d.effects?.capitalOnly ? 'Capitale<div class="k">bonus pour toutes les villes</div>' : d.effects?.notInCapital ? 'Colonies' : 'Partout');
const prereq = (d) => (d.prereq || []).length ? d.prereq.map(p => `${name(p.key)} ${p.level}`).join(', ') : '—';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const row = (d, extra = '') => {
  const max = d.maxLevel || 20, mid = Math.min(10, max);
  return `<tr>${extra}<td class="n">${esc(d.name)}<div class="k">${d.key}</div></td><td>${CAT[d.category] || d.category}</td><td>${WHERE(d)}</td><td class="c">${max}</td><td>${esc(prereq(d))}</td><td class="c">${cost(d, 1)}</td><td class="c">${time(d, 1)}</td><td class="c">${cost(d, max)}</td><td class="c">${time(d, max)}</td><td>${esc(EFFECT[d.key](1))}</td><td>${esc(EFFECT[d.key](mid))}</td><td>${esc(EFFECT[d.key](max))}${NOT_YET[d.key] ? `<div class="k">(${NOT_YET[d.key]})</div>` : ''}</td></tr>`;
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
<div class="box"><p><b>Toutes les civilisations ont le même nombre de bâtiments : ${common.length + 1}</b> — les ${common.length} bâtiments communs ci-dessous, plus <b>un seul bâtiment spécial</b> par civilisation (tableau 2). Seul le bâtiment spécial change d'une civilisation à l'autre. Les Grecs construisent 10 % plus vite ; les autres bonus de civilisation passent par les unités et le bâtiment spécial.</p>
<p>Coût d'un niveau = coût niv. 1 × ${fr(B.costMultiplierBase)} par niveau (champs × ${fr(B.fieldCostMultiplier)}) ; temps = temps niv. 1 × ${fr(B.timeMultiplierBase)} par niveau (champs et Bâtiment principal × ${fr(B.slowTimeMultiplier)}), avant les réductions du Bâtiment principal (2,5 %/niv.), de l'Académie (1 %/niv.) et de la Résidence (0,25 %/niv.), plafonnées à 60 %. Un bâtiment ne dépasse jamais le niveau du Bâtiment principal (qui monte à 30). Chaque niveau construit rapporte 5 points de population. « À venir » = effet présent dans les données mais pas encore actif dans le jeu.</p></div>
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
