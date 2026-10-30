require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Fenêtre de la cible sur la carte (map.js : showMapInfoPanel, openMapPopupAt, positionMapPopup ; 09k-invasion.js) :
// le code du navigateur tourne ici dans un contexte vm, avec un faux DOM réduit au panneau de la carte.
let acorn = null;
try { acorn = require('acorn'); } catch (e) { /* acorn vient avec eslint (dépendance de dev) */ }
const skip = acorn ? false : 'acorn absent';

const FRONT = path.join(__dirname, '..', '..', 'frontend');
const mapSrc = fs.readFileSync(path.join(FRONT, 'js/map.js'), 'utf8');
const invasionSrc = fs.readFileSync(path.join(FRONT, 'js/app/09k-invasion.js'), 'utf8');
const POPUP = ['mapPopupAnchor', 'mapPanelSeq', 'openMapPopupAt', 'setMapPopupExpanded', 'positionMapPopup', 'toggleMapPopupDetails', 'closeMapPanel', 'showMapInfoPanel', 'showMapInfoPanelWithDiplomacy'];

// les déclarations de premier niveau de map.js qui portent ces noms
function pick(src, names) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  const found = new Map();
  for (const node of ast.body) {
    const name = node.type === 'FunctionDeclaration' ? node.id.name : node.type === 'VariableDeclaration' ? node.declarations[0].id.name : null;
    if (names.includes(name)) found.set(name, src.slice(node.start, node.end));
  }
  assert.deepEqual([...found.keys()].sort(), [...names].sort());
  return [...found.values()].join('\n');
}
const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
const flush = () => new Promise(r => setImmediate(r));

function makeContext() {
  const classes = new Set();
  const classList = {
    add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
    toggle: (c, force) => { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; }
  };
  const more = { textContent: 'Détails ▾' };   // bouton statique de index.html, hors du contenu réécrit
  const host = { getBoundingClientRect: () => ({ top: 0, left: 0, width: 800, height: 700 }) };   // #tab-map
  const panel = { style: { display: 'none', setProperty() {} }, classList, offsetParent: host, offsetWidth: 290, offsetHeight: 300, querySelector: s => (s === '.popup-more' ? more : null) };
  const content = { innerHTML: '', scrollTop: 0, parentElement: panel };
  const screen = { x: 400, y: 300 };
  const els = { 'map-info-panel': panel, 'map-panel-content': content };
  const ctx = {
    console, document: { getElementById: id => els[id] || null },
    window: { mapWorldToScreen: () => ({ ...screen }) },
    // la barre de commandes (zoom, accueil, aller à) occupe les 58 premiers pixels de l'onglet, le canvas est dessous
    mapCanvas: { getBoundingClientRect: () => ({ top: 58, left: 0, width: 800, height: 642 }) },
    ISO_TILE_HEIGHT: 32, mapZoomLevel: 1, isMapBlock: () => true, renderMap() {}, mapSelectedTile: null,
    API: '', token: 't', player: { id: 'me' }, armies: [],
    resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), chatJsArg: s => JSON.stringify(s), mapShareButton: () => '',
    chatSafeId: s => String(s), formatNum: n => String(n), formatTime: () => '', unitIconHtml: () => '', getUnitName: k => k
  };
  vm.createContext(ctx);
  vm.runInContext(pick(mapSrc, POPUP), ctx);
  return { ctx, panel, content, more, screen, seq: () => vm.runInContext('mapPanelSeq', ctx) };
}
const enemyCity = { type: 'CITY', id: 'city-b', playerId: 'p2', playerName: 'Bob', name: 'Bravo' };
const diploAnswer = { ok: true, json: async () => ({ status: 'ENEMY', canTransport: false, canAttack: true }) };

test('a late diplomacy answer never fills the popup of another target', { skip }, async () => {
  const { ctx, panel, content } = makeContext();
  const call = deferred();
  ctx.fetch = () => call.p;
  ctx.showMapInfoPanel(5, 5, enemyCity);
  // la fenêtre est tout de suite à la ville touchée, sans les boutons d'une autre cible
  assert.match(content.innerHTML, /Bravo/);
  assert.match(content.innerHTML, /Chargement/);
  assert.doesNotMatch(content.innerHTML, /Attaquer/);
  assert.equal(panel.style.display, 'flex');
  ctx.showMapInfoPanel(6, 6, null);   // le joueur touche une case vide avant la réponse
  call.resolve(diploAnswer);
  await flush();
  assert.match(content.innerHTML, /Terrain vide/);
  assert.doesNotMatch(content.innerHTML, /Bravo/);
});

test('a late diplomacy answer does not reopen a popup closed meanwhile', { skip }, async () => {
  const { ctx, panel } = makeContext();
  const call = deferred();
  ctx.fetch = () => call.p;
  ctx.showMapInfoPanel(5, 5, enemyCity);
  ctx.openMapPopupAt({ x: 5, y: 5, tile: enemyCity });
  ctx.closeMapPanel();
  call.resolve(diploAnswer);
  await flush();
  assert.equal(panel.style.display, 'none');
});

test('the diplomacy answer for the current target fills the popup', { skip }, async () => {
  const { ctx, content } = makeContext();
  const call = deferred();
  ctx.fetch = () => call.p;
  ctx.showMapInfoPanel(5, 5, enemyCity);
  ctx.openMapPopupAt({ x: 5, y: 5, tile: enemyCity });
  call.resolve(diploAnswer);
  await flush();
  assert.match(content.innerHTML, /Bravo/);
  assert.match(content.innerHTML, /Attaquer/);
  assert.doesNotMatch(content.innerHTML, /Chargement/);
});

test('the « Détails » label is reset when a new popup opens or the popup closes', { skip }, () => {
  const { ctx, panel, more } = makeContext();
  panel.style.display = 'flex';
  const picked = { x: 1, y: 1, tile: { drawX: 1, drawY: 1 } };
  ctx.openMapPopupAt(picked);
  ctx.toggleMapPopupDetails();
  assert.ok(panel.classList.contains('expanded'));
  assert.equal(more.textContent, 'Moins ▴');
  ctx.openMapPopupAt(picked);   // autre cible : fenêtre repliée
  assert.ok(!panel.classList.contains('expanded'));
  assert.equal(more.textContent, 'Détails ▾');
  ctx.toggleMapPopupDetails();
  ctx.closeMapPanel();
  assert.ok(!panel.classList.contains('expanded'));
  assert.equal(more.textContent, 'Détails ▾');
  ctx.toggleMapPopupDetails();
  ctx.toggleMapPopupDetails();
  assert.equal(more.textContent, 'Détails ▾');
});

test('the popup never covers the map controls bar above the canvas', { skip }, () => {
  const { ctx, panel, screen } = makeContext();
  panel.style.display = 'flex';
  const picked = { x: 1, y: 1, tile: { drawX: 1, drawY: 1 } };   // un bloc (ville) : la fenêtre se pose 1,6 case plus haut
  // haut de la cible à 348,8 px : au-dessus, la fenêtre de 300 px commencerait à 38,8 px, sur la barre (0-58 px)
  screen.y = 342;
  ctx.openMapPopupAt(picked);
  assert.ok(panel.classList.contains('popup-below'));
  assert.equal(panel.style.top, '392px');
  // assez de place au-dessus du canvas
  screen.y = 500;
  ctx.positionMapPopup();
  assert.ok(!panel.classList.contains('popup-below'));
  assert.equal(panel.style.top, '197px');
  // cible près du haut du canvas : la fenêtre passe dessous, sous la barre
  screen.y = 20;
  ctx.positionMapPopup();
  assert.ok(panel.classList.contains('popup-below'));
  assert.equal(panel.style.top, '103px');
  // fenêtre plus haute que la place sous la barre (écran bas) : elle reste entière dans l'onglet, qui couperait ses boutons
  panel.offsetHeight = 680;
  screen.y = 100;
  ctx.positionMapPopup();
  assert.equal(panel.style.top, '12px');
  // cible passée sous la barre : la fenêtre se cache
  panel.offsetHeight = 300;
  screen.y = -40;
  ctx.positionMapPopup();
  assert.equal(panel.style.visibility, 'hidden');
  screen.y = 300;
  ctx.positionMapPopup();
  assert.equal(panel.style.visibility, '');
});

test('no ≤600px rule pins the popup with an !important left', () => {
  const css = fs.readFileSync(path.join(FRONT, 'css/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let checked = 0;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/(^|[;\s])left\s*:[^;]*!important/.test(m[2])) continue;
    for (const sel of m[1].split(',').filter(s => /\.map-info-panel\b/.test(s))) {
      checked++;
      assert.match(sel, /:not\(\.map-popup\)/, `« ${sel.trim()} » écrase la position calculée de la fenêtre`);
    }
  }
  assert.ok(checked > 0);
});

const hordeAnswer = {
  nodeId: 'h1', level: 2, x: 3, y: 3, endsAt: null, destroyed: false, inAlliance: true, garrison: {}, contributors: [],
  floors: [{ name: 'Avant-poste', power: 100, left: 50, current: true }],
  treasure: { wood: 1, gold: 1, alliancePoints: 1, itemChance: 0.1 }
};
function hordeContext() {
  const c = makeContext();
  vm.runInContext(invasionSrc, c.ctx);
  return c;
}

test('the horde dungeon loading line stays visible in the folded popup', { skip }, () => {
  const { ctx, content } = hordeContext();
  ctx.fetchJson = () => new Promise(() => {});
  ctx.showMapInfoPanel(3, 3, { type: 'RESOURCE', resourceType: 'HORDE', id: 'h1' });
  assert.match(content.innerHTML, /Chargement du donjon/);
  assert.doesNotMatch(content.innerHTML, /diplo-help/);   // replié, .diplo-help est caché (style.css)
});

test('a late horde dungeon answer never fills the popup of another target', { skip }, async () => {
  const { ctx, content } = hordeContext();
  const horde = deferred(), rallies = deferred();
  ctx.fetchJson = () => horde.p;
  ctx.hordeRalliesHtml = () => rallies.p;
  ctx.showMapInfoPanel(3, 3, { type: 'RESOURCE', resourceType: 'HORDE', id: 'h1' });
  horde.resolve(hordeAnswer);
  await flush();
  ctx.showMapInfoPanel(4, 4, null);   // autre cible pendant le chargement des rassemblements
  rallies.resolve('<h4>RALLY</h4>');
  await flush();
  assert.match(content.innerHTML, /Terrain vide/);
  // erreur arrivée après la fermeture : rien n'est écrit non plus
  const gone = deferred();
  ctx.fetchJson = () => gone.p;
  ctx.showMapInfoPanel(3, 3, { type: 'RESOURCE', resourceType: 'HORDE', id: 'h1' });
  ctx.closeMapPanel();
  const before = content.innerHTML;
  gone.reject(new Error('404'));
  await flush();
  assert.equal(content.innerHTML, before);
});

test('the horde dungeon answer for the current target fills the popup', { skip }, async () => {
  const { ctx, content } = hordeContext();
  ctx.fetchJson = async () => hordeAnswer;
  ctx.hordeRalliesHtml = async () => '<h4>RALLY</h4>';
  ctx.showMapInfoPanel(3, 3, { type: 'RESOURCE', resourceType: 'HORDE', id: 'h1' });
  await flush();
  assert.match(content.innerHTML, /Donjon barbare/);
  assert.match(content.innerHTML, /RALLY/);
});
