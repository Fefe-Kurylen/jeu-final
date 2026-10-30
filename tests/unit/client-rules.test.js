require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Règles reprises par le client (frontend/js/app) : stockage des dépôts et silos (Grand dépôt et Grand silo = 3 fois un
// dépôt ou un silo), vitesse de marche (Irrigation, technologies, Bastion), rassemblement contre un site ou un plan de
// Merveille, Ville Merveille hors quota de colonies. Le code du navigateur tourne dans un contexte vm.
let acorn = null;
try { acorn = require('acorn'); } catch (e) { /* acorn vient avec eslint (dépendance de dev) */ }
const skip = acorn ? false : 'acorn absent';

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'js', 'app');
const src = (f) => fs.readFileSync(path.join(FRONT, f), 'utf8');
const buildingsData = require('../../data/buildings.json');
const BUILDINGS = Array.isArray(buildingsData) ? buildingsData : buildingsData.buildings;

// les déclarations de premier niveau d'un fichier qui portent ces noms
function pick(code, names) {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
  const found = new Map();
  for (const node of ast.body) {
    const name = node.type === 'FunctionDeclaration' ? node.id.name : node.type === 'VariableDeclaration' ? node.declarations[0].id.name : null;
    if (names.includes(name)) found.set(name, code.slice(node.start, node.end));
  }
  assert.deepEqual([...found.keys()].sort(), [...names].sort());
  return [...found.values()].join('\n');
}
const flush = () => new Promise(r => setImmediate(r));

function makeContext(extra = {}) {
  const ctx = {
    console, window: { buildingsData: BUILDINGS }, buildingsData: BUILDINGS,
    resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), chatSafeId: s => String(s), formatNum: n => String(n), formatTime: () => '',
    factionBonusPct: (f, type, fallback = 0) => fallback, player: { faction: 'EGYPT' }, currentCity: null, cities: [], armies: [],
    ...extra
  };
  vm.createContext(ctx);
  return ctx;
}

test('stockage : dépôt, silo, Grand dépôt et Grand silo comme le serveur (3 fois un dépôt ou un silo de même niveau)', { skip }, () => {
  const { getStorageAtLevel: serverStorage } = require('../../src/utils/calculations');
  const ctx = makeContext();
  vm.runInContext(pick(src('01-core.js'), ['STORAGE_PREFIX', 'getStorageAtLevel']), ctx);
  for (const key of ['WAREHOUSE', 'SILO', 'GREAT_WAREHOUSE', 'GREAT_SILO']) {
    for (let L = 1; L <= 20; L++) assert.equal(ctx.getStorageAtLevel(L, key), serverStorage(key, L, BUILDINGS), `${key} niveau ${L}`);
  }
  assert.equal(ctx.getStorageAtLevel(20, 'GREAT_WAREHOUSE'), 480000);
  assert.equal(ctx.getStorageAtLevel(20, 'GREAT_SILO'), 3 * ctx.getStorageAtLevel(20, 'SILO'));
  assert.equal(ctx.getStorageAtLevel(0, 'WAREHOUSE'), 1000);   // sans dépôt : la réserve de base
  assert.equal(ctx.getStorageAtLevel(0, 'GREAT_WAREHOUSE'), 0);
  assert.equal(ctx.getStorageAtLevel(7), ctx.getStorageAtLevel(7, 'WAREHOUSE'));   // appel d'avant : le dépôt
});

test('effets affichés : Grand dépôt et Grand silo stockent, la cachette seule protège, mur et bâtiments de faction', { skip }, () => {
  const ctx = makeContext({ getProductionAtLevel: () => 0 });
  vm.runInContext(pick(src('01-core.js'), ['STORAGE_PREFIX', 'getStorageAtLevel']), ctx);
  vm.runInContext(pick(src('04-buildings-render.js'), ['getBuildingEffect']), ctx);
  assert.match(ctx.getBuildingEffect('GREAT_WAREHOUSE', 20), /Capacité: \+480000/);
  assert.match(ctx.getBuildingEffect('GREAT_SILO', 20), /Capacité: \+480000/);
  for (const k of ['GREAT_WAREHOUSE', 'GREAT_SILO']) assert.doesNotMatch(ctx.getBuildingEffect(k, 10), /abri|piller/);
  assert.match(ctx.getBuildingEffect('HIDEOUT', 10), /abri des pillages: 10%/);
  assert.doesNotMatch(ctx.getBuildingEffect('WALL', 10), /réparation/);
  assert.match(ctx.getBuildingEffect('EGYPTIAN_IRRIGATION', 20), /marche des armées: \+10%/);
  assert.match(ctx.getBuildingEffect('SULTAN_DESERT_OUTPOST', 20), /transport: \+20%/);
  // Gaule : +15 % de cachette, 20 % au plus
  ctx.player = { faction: 'GAUL' };
  ctx.factionBonusPct = (f, type) => (f === 'GAUL' && type === 'hideoutCapacity' ? 15 : 0);
  assert.match(ctx.getBuildingEffect('HIDEOUT', 10), /11\.5%/);
  assert.match(ctx.getBuildingEffect('HIDEOUT', 20), /: 20%/);
});

test('marche : Irrigation (0,5 %/niveau), technologies et Bastion, comme calculateTravelTime du serveur', { skip }, () => {
  const { calculateTravelTime } = require('../../src/utils/calculations');
  const { factionsData } = require('../../src/config/gamedata');
  const ctx = makeContext({ techPctClient: (e) => (e === 'armySpeedBonusPct' ? 4 : 0), bastionState: null });
  vm.runInContext(pick(src('01-core.js'), ['irrigationSpeedPct', 'armySpeedExtraPct']), ctx);
  vm.runInContext(pick(src('10b-sheets.js'), ['SHEET_RULES', 'armyTilesPerHour']), ctx);
  const egypt = { buildings: [{ key: 'EGYPTIAN_IRRIGATION', level: 20 }, { key: 'MAIN_HALL', level: 20 }] };
  assert.equal(ctx.irrigationSpeedPct(egypt), 10);
  assert.equal(ctx.irrigationSpeedPct({ buildings: [] }), 0);
  assert.equal(ctx.irrigationSpeedPct({ buildings: [{ key: 'EGYPTIAN_IRRIGATION', level: 6 }, { key: 'EGYPTIAN_IRRIGATION', level: 4 }] }), 3);   // le plus haut niveau, comme le serveur
  assert.equal(ctx.armySpeedExtraPct(egypt), 14);   // 4 % de recherches + 10 % d'Irrigation
  ctx.bastionState = { bastion: { status: 'ACTIVE' }, rules: { bonuses: { armySpeedPct: 5 } } };
  assert.equal(ctx.armySpeedExtraPct(egypt), 19);
  // même vitesse que le serveur sur 1 000 cases (Huns : +20 % de civilisation)
  ctx.factionBonusPct = (f, type, fallback) => (type === 'armySpeed' ? fallback : 0);
  for (const [speed, faction] of [[50, 'EGYPT'], [80, 'HUN'], [35, 'ROME']]) {
    const { tilesPerHour, extra } = ctx.armyTilesPerHour(speed, faction, egypt);
    const seconds = calculateTravelTime(0, 0, 0, 0, speed, faction, factionsData, 1000, extra);
    assert.ok(Math.abs(tilesPerHour - 1000 * 3600 / seconds) / tilesPerHour < 0.001, `${faction} ${speed}`);
  }
  assert.equal(ctx.armyTilesPerHour(50, null, null).tilesPerHour, 120);   // sans bonus : 2,4 × vitesse
});

test('rassemblement : site et plan de Merveille (lancement par nodeId, libellés de la liste)', { skip }, async () => {
  const posted = [];
  const ctx = makeContext({
    allianceRequestNoReload: async (url, method, body) => { posted.push({ url, method, body }); return true; },
    document: { getElementById: (id) => ({ 'rally-army': { value: 'a1' }, 'rally-wait': { value: '10' } }[id] || null), querySelector: () => null },
    closeModal() {}, loadArmies() {}, openSheetModal: (title, html) => { ctx.lastModal = html; }
  });
  vm.runInContext(pick(src('09l-rally.js'), ['RALLY_TARGETS', 'rallyKind', 'rallyWhat', 'ralliesHtml', 'rallyArmies', 'armyOptionLabel', 'RALLY_WAITS', 'openRallyLaunch', 'confirmRallyLaunch', 'refreshRallyViews']), ctx);
  await ctx.confirmRallyLaunch('node-w', 'WONDER');
  await ctx.confirmRallyLaunch('bast-1', 'BASTION');
  assert.deepEqual(JSON.parse(JSON.stringify(posted.map(p => p.body))), [{ armyId: 'a1', waitMinutes: 10, nodeId: 'node-w' }, { armyId: 'a1', waitMinutes: 10, bastionId: 'bast-1' }]);
  const base = { id: 'r1', status: 'MARCHING', leader: 'Ana', mine: false, x: 3, y: 4, launchAt: null, arrivalAt: null, capacity: 5, power: 10, armies: [{ owner: 'Ana', units: 3, status: 'RALLY_MARCH' }] };
  const wonder = ctx.ralliesHtml([{ ...base, kind: 'WONDER' }]);
  assert.match(wonder, /site de Merveille \(3, 4\)/);
  assert.match(wonder, /arrivée au site de Merveille/);
  assert.match(wonder, /en marche vers le site de Merveille/);
  assert.match(ctx.ralliesHtml([{ ...base, kind: 'PLAN' }]), /plan de construction \(3, 4\)/);
  assert.match(ctx.ralliesHtml([{ ...base, kind: 'PLAN', guardPower: 4200 }]), /plan de construction \(3, 4\) · Immortels 4200/);
  assert.match(ctx.ralliesHtml([{ ...base, kind: 'BASTION', bastionTag: 'TAG' }]), /Bastion \[TAG\]/);
  assert.match(ctx.ralliesHtml([{ ...base, level: 3 }]), /donjon niv\. 3/);   // ancien format, sans kind
  // la fenêtre de lancement d'un site de Merveille envoie le kind WONDER
  ctx.armies = [{ id: 'a1', name: 'Armée', status: 'IDLE', cityId: 'c1', x: 0, y: 0, units: [{ count: 5 }] }];
  ctx.cities = [{ id: 'c1', name: 'Memphis', x: 0, y: 0 }];
  ctx.openRallyLaunch('node-w', 3, 4, null, 'WONDER');
  assert.match(ctx.lastModal, /Site de Merveille en \(3, 4\), gardé par les Immortels/);
  assert.match(ctx.lastModal, /confirmRallyLaunch\('node-w', 'WONDER'\)/);
  ctx.openRallyLaunch('node-p', 3, 4, null, 'PLAN');
  assert.match(ctx.lastModal, /le plan revient à votre capitale/);
});

test('panneau d\'un site ou d\'un plan gardé : bouton « Rassemblement » pour un joueur en alliance', { skip }, async () => {
  const content = { innerHTML: '', querySelector: () => null };
  const calls = [];
  const ctx = makeContext({
    openRallyLaunch() {}, rallyArmies: () => [{ id: 'a1' }], fillNodeRallies: (box, id) => calls.push(id),
    raidResource() {}, foundCityAt() {}, closeMapPanel() {}
  });
  vm.runInContext(pick(src('09i-world.js'), ['renderWonderNodePanel']), ctx);
  const site = { id: 'n1', resourceType: 'WONDER', x: 1, y: 2, hasDefenders: true, defenderPower: 5000 };
  ctx.player = { allianceId: 'al1' };
  ctx.renderWonderNodePanel(site, content);
  assert.match(content.innerHTML, /openRallyLaunch\('n1', 1, 2, null, 'WONDER'\)/);
  assert.deepEqual(calls, ['n1']);
  ctx.renderWonderNodePanel({ ...site, id: 'n2', resourceType: 'PLAN' }, content);
  assert.match(content.innerHTML, /openRallyLaunch\('n2', 1, 2, null, 'PLAN'\)/);
  ctx.renderWonderNodePanel({ ...site, hasDefenders: false }, content);   // Immortels vaincus : rien à rassembler
  assert.doesNotMatch(content.innerHTML, /openRallyLaunch/);
  ctx.player = { allianceId: null };
  ctx.renderWonderNodePanel(site, content);   // sans alliance : l'attaque seule
  assert.doesNotMatch(content.innerHTML, /openRallyLaunch/);
  assert.match(content.innerHTML, /Attaquer les Immortels/);
  await flush();
});

test('colons : la Ville Merveille n\'est pas une colonie, un colon de plus pour elle', { skip }, () => {
  const ctx = makeContext({ settlerPortrait: () => '', settlerIcon: () => '', formatNum: n => String(n) });
  vm.runInContext(pick(src('06c-colonies.js'), ['COLONY_RULES', 'residenceEffects', 'settlerSlotsFor', 'secondaryCities', 'settlersTravelling', 'colonyTabHtml']), ctx);
  const capital = { id: 'c0', isCapital: true, settlers: 0, recruitQueue: [] };
  ctx.cities = [capital, { id: 'c1', isCapital: false, name: 'A' }, { id: 'w', isCapital: false, isWonder: true, name: 'Merveille' }];
  ctx.currentCity = capital;
  assert.deepEqual(vm.runInContext('secondaryCities().map(c => c.id)', ctx).join(), 'c1');   // const : hors des propriétés du contexte
  // Résidence 10 : 1 place, prise par la colonie fondée ; la Merveille existe déjà → plus de colon
  assert.match(ctx.colonyTabHtml(10), /disabled/);
  // pas encore de Ville Merveille : un colon de plus pour elle
  ctx.cities = [capital, { id: 'c1', isCapital: false, name: 'A' }];
  const html = ctx.colonyTabHtml(10);
  assert.doesNotMatch(html, /disabled/);
  assert.match(html, /pour la Ville Merveille/);
  // un colon déjà en route : rien de plus
  ctx.armies = [{ settlers: 1 }];
  assert.match(ctx.colonyTabHtml(10), /disabled/);
});
