require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Client de la revue des bâtiments (décisions du 31 octobre 2026, SPEC-BATIMENTS.md) : scène de la ville à la taille de son
// anneau (capitale 18 parcelles, colonie 12), Mur des colonies au niveau 15, or des unités d'élite, Bâtiment principal 20
// partout, cachette en quantité fixe, marchands du marché, Grandes casernes et Forge. Le code du navigateur tourne dans un
// contexte vm, avec un faux DOM réduit ; les nombres viennent des données et de la configuration, comme sur le serveur.
let acorn = null;
try { acorn = require('acorn'); } catch (e) { /* acorn vient avec eslint (dépendance de dev) */ }
const skip = acorn ? false : 'acorn absent';

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'js', 'app');
const src = (f) => fs.readFileSync(path.join(FRONT, f), 'utf8');
const config = require('../../src/config');
const fx = require('../../src/utils/buildingEffects');
const calc = require('../../src/utils/calculations');
const MS = require('../../src/services/marketService');
const raw = require('../../data/buildings.json');
const BUILDINGS = Array.isArray(raw) ? raw : raw.buildings;
const rawUnits = require('../../data/units.json');
// le catalogue /api/units, avec le prix que le serveur demande (or des unités d'élite compris)
const UNITS = (Array.isArray(rawUnits) ? rawUnits : rawUnits.units).map(calc.withRecruitPrice);

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
const run = (ctx, file, names) => vm.runInContext(pick(src(file), names), ctx);
function makeContext(extra = {}) {
  const ctx = {
    console, window: { buildingsData: BUILDINGS }, buildingsData: BUILDINGS, unitsData: UNITS,
    resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), formatNum: n => String(Math.floor(n)), formatTime: () => 'bientôt', chatSafeId: s => String(s),
    serverNow: () => Date.parse('2026-10-31T12:00:00Z'), techPctClient: () => 0, factionBonusPct: (f, t, fallback = 0) => fallback,
    getBuildingName: k => BUILDINGS.find(b => b.key === k)?.name || k, buildingIconHtml: k => `<${k}>`, infoBtnHtml: () => '', unitIconHtml: () => '', unitFigureHtml: () => '',
    getUnitName: k => k,
    player: { faction: 'ROME', gold: 0, economy: { city: { ringSlots: config.city.ringSlots, wallSlot: config.city.wallSlot }, build: config.build, upkeepPerTier: config.army.upkeepPerTier } },
    currentCity: null, cities: [], armies: [],
    ...extra
  };
  vm.createContext(ctx);
  return ctx;
}
const CORE = ['RES_KEYS', 'RES_NAMES', 'playerStock', 'stockOf', 'canPayCost', 'costShortfall', 'unitUpkeep', 'effectBuildings', 'buildingEffectOf', 'levelIn', 'buildingMaxLevelIn',
  'buildingCapIn', 'hideoutAmountAt', 'forgeBonusPct', 'recruitPrice', 'recruitShortfall', 'recruitCostHtml', 'lerpExp', 'TIER_COLORS'];
const stock = { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6, maxStorage: 2e6, maxFoodStorage: 2e6 };

// ---------- décision 13 : la scène de la ville à la taille de son anneau ----------
function sceneContext() {
  const ctx = makeContext({ cityCanvas: {}, citySlots: [], SPRITE_PLOT_W: 100 / 130 });
  run(ctx, '01-core.js', ['cityViewW']);
  run(ctx, '04b-iso-scene.js', ['ISO_PLANS', 'ISO_FIELD_TYPE', 'ISO_MAIN_HALL_SCALE', 'isoGridCache', 'isoGrid', 'ISO_GATE_SIDE', 'isoGateGrid', 'isoGateFrame', 'cityCam',
    'ISO_ZOOM_MIN', 'isoMinCell', 'ISO_SP', 'ISO_PLOT', 'isoCellW', 'isoSceneExtent', 'isoLayout', 'isoPos', 'isoSlotCell', 'calculateCitySlots', 'cityWallSlot', 'ringSlotCount', 'isoGateCell']);
  return ctx;
}
const ringOf = (ctx) => [...vm.runInContext('citySlots', ctx).filter(s => !s.isField && !s.wall && !s.fixed).map(s => s.slot)];

test('scène : la capitale dessine 18 parcelles, une colonie 12 (config.city.ringSlots), sans parcelle vide en trop', { skip }, () => {
  const ctx = sceneContext();
  assert.deepEqual({ ...config.city.ringSlots }, { capital: 18, colony: 12 });
  ctx.currentCity = { id: 'cap', isCapital: true, buildings: [] };
  ctx.calculateCitySlots();
  assert.deepEqual(ringOf(ctx), Array.from({ length: config.city.ringSlots.capital }, (_, i) => i + 1));
  assert.equal(vm.runInContext('citySlots', ctx).filter(s => s.isField).length, 18);
  assert.equal(vm.runInContext('citySlots', ctx).filter(s => s.fixed).length, 1);   // le Bâtiment principal, au centre
  assert.equal(vm.runInContext('citySlots', ctx).filter(s => s.wall).length, 1);    // le Mur, sur l'enceinte
  // colonie et Ville Merveille : 12 emplacements
  for (const city of [{ id: 'col', isCapital: false, buildings: [] }, { id: 'w', isCapital: false, isWonder: true, buildings: [] }]) {
    ctx.currentCity = city;
    ctx.calculateCitySlots();
    assert.deepEqual(ringOf(ctx), Array.from({ length: config.city.ringSlots.colony }, (_, i) => i + 1));
  }
  assert.equal(ctx.isoSlotCell(13), undefined);   // pas d'emplacement 13 dans une colonie
});

test('scène : enceinte et plaza plus petites dans une colonie ; parcelles dans l\'enceinte, sans chevauchement, hors des avenues', { skip }, () => {
  const ctx = sceneContext();
  const grid = (isCapital) => JSON.parse(JSON.stringify(vm.runInContext(`isoGrid({ isCapital: ${isCapital} })`, ctx)));
  const capital = grid(true), colony = grid(false);
  assert.ok(colony.wall < capital.wall, 'enceinte plus petite');
  assert.ok(colony.plaza < capital.plaza, 'plaza plus petite');
  // le cadrage suit le plus grand plan : les parcelles gardent la même taille et la colonie paraît plus petite
  assert.equal(vm.runInContext('isoSceneExtent().hw', ctx) > capital.wall, true);
  const HALF = vm.runInContext('ISO_PLOT / ISO_SP / 2', ctx);   // demi-côté d'une parcelle, en cellules de grille
  for (const g of [capital, colony]) {
    const plots = Object.entries(g.cells).map(([slot, c]) => ({ c, half: slot === '0' ? HALF * 1.35 : HALF })).concat(Object.values(g.fields).map(c => ({ c, half: HALF })));
    assert.equal(Object.keys(g.fields).length, 18);
    for (const { c, half } of plots) assert.ok(Math.max(Math.abs(c[0]), Math.abs(c[1])) + half < g.wall, `${c} dans l'enceinte`);
    for (let i = 0; i < plots.length; i++) for (let j = i + 1; j < plots.length; j++) {
      const [a, b] = [plots[i], plots[j]];
      assert.ok(Math.max(Math.abs(a.c[0] - b.c[0]), Math.abs(a.c[1] - b.c[1])) >= a.half + b.half, `${a.c} / ${b.c} se chevauchent`);
    }
    // les avenues (axe de la porte, transversale) passent dans les couloirs : aucune parcelle de l'anneau ni champ dessus
    for (const { c, half } of plots.slice(1)) {
      assert.ok(Math.abs(c[1] - g.gatePos) >= half, `${c} sur l'avenue de la porte`);
      assert.ok(Math.abs(c[0] - g.lane) >= half, `${c} sur la transversale`);
    }
    // la porte s'ouvre en face de l'avenue
    assert.ok(Math.abs(g.gatePos - g.lane) < 0.1);
  }
  // la capitale garde son plan (8 + 11 cellules) ; sa 19e cellule, sans emplacement, devient un bosquet
  assert.equal(capital.ring.length, 19);
  assert.deepEqual(capital.spare.at(-1), capital.ring[18]);
  assert.equal(colony.ring.length, config.city.ringSlots.colony);
});

test('scène : un anneau plus grand que la colonie prend le plan suivant ; sans réglage du serveur, le plus grand plan', { skip }, () => {
  const ctx = sceneContext();
  ctx.player.economy.city.ringSlots = { capital: 18, colony: 14 };
  const g = vm.runInContext('isoGrid({ isCapital: false })', ctx);
  assert.equal(Object.keys(g.cells).length, 15);   // le Bâtiment principal et 14 emplacements
  assert.equal(g.wall, vm.runInContext('ISO_PLANS.at(-1).wall', ctx));
  ctx.player.economy.city = {};
  assert.equal(vm.runInContext('ringSlotCount({ isCapital: true })', ctx), 19);
});

// ---------- décisions 1 et 14 : niveaux maximum ----------
function panelContext(extra = {}) {
  const els = { 'build-panel': { style: {}, classList: { add() {} } }, 'build-panel-content': { innerHTML: '' }, 'build-panel-title': { innerHTML: '', textContent: '' } };
  const overlay = { style: {}, classList: { add() {} } };
  const ctx = makeContext({ document: { getElementById: id => els[id] || null, querySelector: s => (s === '.build-panel-overlay' ? overlay : null) }, getBuildingEffect: () => null, ...extra });
  run(ctx, '01-core.js', CORE);
  run(ctx, '04-buildings-render.js', ['getBuildingAtSlot', 'merchantsAt', 'visionRadiusAt', 'allianceMaxMembersAt']);
  run(ctx, '04b-iso-scene.js', ['cityWallSlot']);
  run(ctx, '05-panels.js', ['selectedBuildSlot', 'openBuildPanel', 'getBuildCost', 'getCityBuildTimeReductionPct', 'getBuildTime', 'formatDuration', 'getBuildingBonus',
    'hideoutTabHtml', 'merchantRulesHtml', 'getBuildingSpecialTabs', 'checkBuildingPrerequisites', 'BUILD_MAX_RUNNING', 'buildQueuedMax', 'buildQueueMax', 'isBuildQueueFull', 'getBuildingDescription',
    'getBuildingShortDescription', 'COLONY_TRAINER', 'recruitPlaceCityId', 'trainerLevelIn', 'recruitPlaces', 'selectRecruitPlace', 'recruitPlaceHtml', 'openRecruitmentPanel',
    'openUnitRecruitModal', 'watchRecruitTotal']);
  run(ctx, '06b-research.js', ['fmtTechPct']);
  run(ctx, '07-army.js', ['maxArmiesAtRallyLevel', 'rallyPointLevel', 'rallyMaxArmiesAt']);
  run(ctx, '10b-sheets.js', ['SHEET_RULES', 'SHEET_TIER_NAMES', 'SHEET_CLASS_NAMES', 'sheetBuildings', 'capitalTrainBoost', 'unitTrainTimeInCity']);
  run(ctx, '06c-colonies.js', ['capitalCity', 'byFounding', 'secondaryCities']);
  return { ctx, els };
}

test('niveaux maximum : Bâtiment principal 20 partout, Mur 15 dans une colonie et 20 dans la capitale', { skip }, () => {
  const { ctx, els } = panelContext();
  const capital = { id: 'cap', isCapital: true, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 20 }, { key: 'WALL', slot: config.city.wallSlot, level: 15 }], buildQueue: [], playerStock: stock };
  const colony = { id: 'col', isCapital: false, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 20 }, { key: 'WALL', slot: config.city.wallSlot, level: 15 }], buildQueue: [], playerStock: stock };
  const wonder = { ...colony, id: 'w', isWonder: true };
  ctx.cities = [capital, colony, wonder];
  for (const city of [capital, colony, wonder]) {
    assert.equal(ctx.buildingMaxLevelIn('MAIN_HALL', city), fx.maxLevelIn('MAIN_HALL', city.isCapital));
    assert.equal(ctx.buildingMaxLevelIn('WALL', city), fx.maxLevelIn('WALL', city.isCapital));
  }
  assert.equal(ctx.buildingMaxLevelIn('MAIN_HALL', colony), 20);
  assert.equal(ctx.buildingMaxLevelIn('WALL', colony), 15);
  assert.equal(ctx.buildingMaxLevelIn('WALL', capital), 20);
  assert.equal(ctx.buildingCapIn('BARRACKS', { buildings: [{ key: 'MAIN_HALL', level: 6 }] }), 6);
  // Mur 15 d'une colonie : plus rien à monter ; dans la capitale, le niveau 16 se construit
  ctx.citySlots = [{ slot: 0, fixed: true, fixedKey: 'MAIN_HALL' }, { slot: config.city.wallSlot, wall: true, fixedKey: 'WALL' }];
  ctx.currentCity = colony;
  ctx.openBuildPanel(config.city.wallSlot);
  assert.match(els['build-panel-title'].innerHTML, /Niv\. 15\/15/);
  assert.match(els['build-panel-content'].innerHTML, /Niveau 15 au plus dans une colonie/);
  assert.doesNotMatch(els['build-panel-content'].innerHTML, /upgradeBuilding\('WALL'/);
  ctx.currentCity = capital;
  ctx.openBuildPanel(config.city.wallSlot);
  assert.match(els['build-panel-title'].innerHTML, /Niv\. 15\/20/);
  assert.match(els['build-panel-content'].innerHTML, /upgradeBuilding\('WALL', 20\)/);
  assert.match(els['build-panel-content'].innerHTML, /<span class="level-num">16<\/span>/);
  // Bâtiment principal 20 : le maximum, dans la capitale comme dans la colonie (plus de « ville secondaire »)
  for (const city of [capital, colony]) {
    ctx.currentCity = city;
    ctx.openBuildPanel(0);
    assert.match(els['build-panel-title'].innerHTML, /Niv\. 20\/20/);
    assert.match(els['build-panel-content'].innerHTML, /Niveau maximum atteint/);
    assert.doesNotMatch(els['build-panel-content'].innerHTML, /secondaire/);
  }
});

test('infobulles : Mur 15 d\'une colonie au maximum, champ plafonné par le Bâtiment principal (mêmes règles que les panneaux)', { skip }, () => {
  const ctx = makeContext({ getBuildingEffect: () => null, getProductionAtLevel: () => 0 });
  run(ctx, '01-core.js', CORE);
  run(ctx, '03-fields-render.js', ['getFieldBuildingAtSlot']);
  run(ctx, '04b-iso-scene.js', ['cityWallSlot']);
  run(ctx, '04-buildings-render.js', ['getBuildingAtSlot', 'cityTooltipHtml']);
  const W = config.city.wallSlot;
  ctx.citySlots = [{ slot: 0, fixed: true, fixedKey: 'MAIN_HALL' }, { slot: W, wall: true, fixedKey: 'WALL' }, { slot: 101, isField: true, fieldType: 'LUMBER' }];
  // Mur 15 d'une colonie : le maximum ; le même dans la capitale peut encore monter
  ctx.currentCity = { id: 'col', isCapital: false, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 20 }, { key: 'WALL', slot: W, level: 15 }, { key: 'LUMBER', slot: 101, level: 20 }] };
  assert.match(ctx.cityTooltipHtml(W), /Niveau 15\/15<\/p>[\s\S]*Niveau maximum atteint/);
  assert.match(ctx.cityTooltipHtml(0), /Niveau 20\/20/);
  assert.match(ctx.cityTooltipHtml(101), /Niveau 20\/20[\s\S]*Niveau maximum atteint/);
  ctx.currentCity = { ...ctx.currentCity, id: 'cap', isCapital: true };
  assert.match(ctx.cityTooltipHtml(W), /Niveau 15\/20<\/p>[\s\S]*Cliquez pour améliorer/);
  // champ au niveau du Bâtiment principal : limité par lui, pas au maximum
  ctx.currentCity = { id: 'col', isCapital: false, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 6 }, { key: 'LUMBER', slot: 101, level: 6 }] };
  assert.match(ctx.cityTooltipHtml(101), /Niveau 6\/6[\s\S]*Limité par Bât\. principal \(Niv\.6\)/);
});

test('alliance pleine : le chef n\'est invité à monter son Ambassade que si elle peut encore agrandir l\'alliance', { skip }, () => {
  const ctx = makeContext();
  run(ctx, '01-core.js', CORE);
  run(ctx, '04-buildings-render.js', ['allianceMaxMembersAt']);
  run(ctx, '09-social.js', ['allianceFullHtml']);
  assert.equal(ctx.allianceFullHtml(20, 21), '');
  assert.equal(ctx.allianceFullHtml(5, undefined), '');
  assert.match(ctx.allianceFullHtml(21, fx.allianceMaxMembers(7)), /Alliance complète : le chef peut monter son Ambassade/);
  // au plafond général (Ambassade 20 du chef, config.alliance.maxMembers) : rien à monter
  const cap = fx.allianceMaxMembers(20);
  assert.equal(cap, config.alliance.maxMembers);
  assert.equal(ctx.allianceFullHtml(cap, cap), '<p class="diplo-help">Alliance complète.</p>');
});

test('onglet Bâtiments : Place du marché et Comptoir « capitale seulement » dans une colonie, sans bouton ; Bâtiment principal requis', { skip }, () => {
  const grid = { innerHTML: '' };
  const ctx = makeContext({ document: { getElementById: id => (id === 'buildings-grid' ? grid : null) } });
  run(ctx, '01-core.js', CORE);
  run(ctx, '05-panels.js', ['getBuildCost', 'BUILD_MAX_RUNNING', 'buildQueuedMax', 'buildQueueMax', 'isBuildQueueFull']);
  run(ctx, '06-city-ui.js', ['renderBuildings']);
  const capital = { id: 'cap', isCapital: true, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 8 }, { key: 'MARKET', slot: 1, level: 6 }, { key: 'TRADE_OFFICE', slot: 2, level: 3 }], buildQueue: [], playerStock: stock };
  const colony = { id: 'col', isCapital: false, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 5 }, { key: 'WAREHOUSE', slot: 1, level: 5 }], buildQueue: [], playerStock: stock };
  ctx.cities = [capital, colony];
  const card = (name) => grid.innerHTML.split('<div class="card">').find(c => c.includes(` ${name} `)) || '';
  ctx.currentCity = colony;
  ctx.renderBuildings('all');
  for (const key of ['MARKET', 'TRADE_OFFICE']) {
    const c = card(BUILDINGS.find(b => b.key === key).name);
    assert.match(c, /Capitale seulement : son effet vaut aussi ici/, key);
    assert.doesNotMatch(c, /build\('/, key);
  }
  assert.match(card(BUILDINGS.find(b => b.key === 'MARKET').name), /Niveau actuel: 6</);   // celui de la capitale
  // Dépôt 5 avec un Bâtiment principal 5 : il faut le Bâtiment principal 6 pour le niveau 6
  assert.match(card(BUILDINGS.find(b => b.key === 'WAREHOUSE').name), /Bât\. principal Niv\.6 requis/);
  assert.match(card(BUILDINGS.find(b => b.key === 'GREAT_BARRACKS').name), /build\('GREAT_BARRACKS'\)/);
  ctx.currentCity = capital;
  ctx.renderBuildings('all');
  assert.match(card(BUILDINGS.find(b => b.key === 'MARKET').name), /build\('MARKET'\)/);
  assert.match(card(BUILDINGS.find(b => b.key === 'GREAT_BARRACKS').name), /Colonies seulement/);
});

test('quête « Place du marché » vue d\'une colonie : le guide passe dans la capitale, où elle se bâtit', { skip }, () => {
  const focused = [], fingers = [], selected = [];
  const ctx = makeContext({
    questsData: { tasks: [{ key: 'b_MARKET', go: { building: 'MARKET' } }, { key: 'b_WAREHOUSE', go: { building: 'WAREHOUSE' } }] },
    closeModal() {}, closeBuildPanel() {}, showTab() {}, showToast() {}, setTimeout: (fn) => fn(),
    focusCitySlot: (s) => focused.push(s), pointQuestFinger: (chain) => fingers.push(chain.at(-1)),
    selectCity: (id) => { selected.push(id); ctx.currentCity = ctx.cities.find(c => c.id === id); }
  });
  run(ctx, '04-buildings-render.js', ['getBuildingAtSlot']);
  run(ctx, '04b-iso-scene.js', ['cityWallSlot']);
  run(ctx, '09e-quests.js', ['questByKey', 'questGoTo']);
  const capital = { id: 'cap', isCapital: true, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 5 }] };
  const colony = { id: 'col', isCapital: false, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 5 }] };
  ctx.cities = [capital, colony];
  ctx.citySlots = [{ slot: 0, fixed: true, fixedKey: 'MAIN_HALL' }, { slot: 4 }];
  ctx.currentCity = colony;
  ctx.questGoTo('b_MARKET');
  assert.deepEqual(selected, ['cap']);
  assert.deepEqual(focused, [4]);
  assert.equal(fingers[0], `#build-panel .build-option-card[onclick*="'MARKET'"]`);
  // un bâtiment des colonies aussi : on reste dans la ville affichée
  ctx.currentCity = colony;
  ctx.questGoTo('b_WAREHOUSE');
  assert.deepEqual(selected, ['cap']);
});

// ---------- décision 15 : l'or des unités d'élite ----------
test('élite : de l\'or en plus des ressources, dans le panneau de recrutement, la modale et le refus (« Il faut N or »)', { skip }, () => {
  const modalBody = { innerHTML: '' };
  const { ctx, els } = panelContext({ closeBuildPanel() {}, setTimeout: (fn) => fn() });
  const getById = ctx.document.getElementById;
  ctx.document.getElementById = (id) => (id === 'modal-body' ? modalBody : id === 'modal' ? { style: {} } : getById(id));
  const elite = UNITS.find(u => u.faction === 'ROME' && u.class === 'INFANTRY' && u.tier === 'elite');
  const base = UNITS.find(u => u.faction === 'ROME' && u.class === 'INFANTRY' && u.tier === 'base');
  assert.ok(elite.recruitGold > 0);
  assert.equal(base.recruitGold, 0);
  const capital = { id: 'cap', name: 'Roma', isCapital: true, buildings: [{ key: 'BARRACKS', slot: 4, level: 20 }], recruitQueue: [], playerStock: stock };
  ctx.cities = [capital];
  ctx.currentCity = capital;
  // prix d'un lot : celui du serveur (calculations.recruitCostFor / recruitGoldFor)
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.recruitPrice(elite, 7))), { cost: calc.recruitCostFor(elite, 7), gold: calc.recruitGoldFor(elite, 7) });
  assert.equal(ctx.recruitShortfall(elite, 7), `Il faut ${calc.recruitGoldFor(elite, 7)} or pour recruter ces unités d'élite`);
  assert.equal(ctx.recruitShortfall(base, 7), '');
  ctx.player.gold = calc.recruitGoldFor(elite, 7);
  assert.equal(ctx.recruitShortfall(elite, 7), '');
  assert.match(ctx.recruitCostHtml(elite, 7), new RegExp(`res-available">\\[gold\\] ${calc.recruitGoldFor(elite, 7)}`));
  assert.doesNotMatch(ctx.recruitCostHtml(base), /\[gold\]/);
  ctx.player.gold = 0;
  assert.match(ctx.recruitCostHtml(elite), /res-missing">\[gold\]/);
  // panneau de la Caserne de la capitale (« Lieu de formation ») : l'or par unité d'élite et sur sa carte
  ctx.openRecruitmentPanel('BARRACKS', 20, 4);
  const panel = els['build-panel-content'].innerHTML;
  assert.match(panel, new RegExp(`Unités d'élite : ${elite.recruitGold} or par unité en plus des ressources`));
  assert.match(panel, /title="Or par unité d'élite, en plus des ressources">\[gold\]/);
  // modale : coût par unité et total avec l'or ; bouton désactivé tant que l'or manque
  ctx.openUnitRecruitModal(elite.key, 'BARRACKS', 'cap');
  assert.match(modalBody.innerHTML, /\[gold\]/);
});

// ---------- décision 10 : les Grandes casernes accélèrent la capitale ----------
test('Grandes casernes et écuries : leurs niveaux s\'additionnent pour la formation dans la capitale, affichés dans sa Caserne', { skip }, () => {
  const { ctx, els } = panelContext();
  const capital = { id: 'cap', name: 'Roma', isCapital: true, buildings: [{ key: 'BARRACKS', slot: 4, level: 10 }, { key: 'STABLE', slot: 5, level: 3 }], recruitQueue: [], playerStock: stock };
  const a = { id: 'a', name: 'Ostia', isCapital: false, buildings: [{ key: 'GREAT_BARRACKS', level: 12 }, { key: 'GREAT_STABLE', level: 4 }], recruitQueue: [] };
  const b = { id: 'b', name: 'Capua', isCapital: false, buildings: [{ key: 'GREAT_BARRACKS', level: 8 }], recruitQueue: [] };
  ctx.cities = [capital, a, b];
  ctx.currentCity = capital;
  for (const cls of ['INFANTRY', 'ARCHER', 'CAVALRY', 'SIEGE']) assert.equal(ctx.capitalTrainBoost(cls).pct, fx.capitalTrainBoostPct(ctx.cities, cls), cls);
  assert.equal(ctx.capitalTrainBoost('INFANTRY').levels, 20);
  const legionary = UNITS.find(u => u.faction === 'ROME' && u.class === 'INFANTRY' && u.tier === 'base');
  assert.equal(ctx.unitTrainTimeInCity(legionary, capital).pct, fx.trainTimeReductionPct(capital.buildings, 'INFANTRY', fx.capitalTrainBoostPct(ctx.cities, 'INFANTRY')));
  assert.equal(ctx.unitTrainTimeInCity(legionary, a).boostPct, 0);   // dans une colonie : sa Grande caserne seulement
  ctx.openRecruitmentPanel('BARRACKS', 10, 4);
  assert.match(els['build-panel-content'].innerHTML, /Grande Caserne de vos colonies \(niveaux additionnés : 20\) : −10 % de temps de formation ici/);
  ctx.openRecruitmentPanel('STABLE', 3, 5);
  assert.match(els['build-panel-content'].innerHTML, /Grande Écurie de vos colonies \(niveaux additionnés : 4\) : −2 %/);
});

// ---------- décisions 2, 5, 6, 7, 8, 11 : textes des bâtiments ----------
test('Forge (attaque et défense), cachette (quantité fixe), Place de rassemblement, Tour de guet, Ambassade, Chambre au Trésor', { skip }, () => {
  const { ctx, els } = panelContext();
  const capital = { id: 'cap', name: 'Roma', isCapital: true, wood: 20000, stone: 100, iron: 0, food: 5000, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 20 }, { key: 'FORGE', slot: 3, level: 12 },
    { key: 'HIDEOUT', slot: 6, level: 10 }, { key: 'RALLY_POINT', slot: 7, level: 9 }, { key: 'WATCHTOWER', slot: 8, level: 4 }, { key: 'EMBASSY', slot: 9, level: 7 }], buildQueue: [], playerStock: stock };
  ctx.cities = [capital];
  ctx.currentCity = capital;
  assert.equal(ctx.forgeBonusPct('attack'), fx.forgeAttackPct(capital.buildings));
  assert.equal(ctx.forgeBonusPct('defense'), fx.forgeDefensePct(capital.buildings));
  ctx.citySlots = capital.buildings.map(b => ({ slot: b.slot, fixed: b.slot === 0, fixedKey: b.slot === 0 ? 'MAIN_HALL' : undefined }));
  // cachette : ce qui est à l'abri et ce qui peut être pillé, ressource par ressource
  ctx.openBuildPanel(6);
  const hidden = fx.hideoutAmount(capital.buildings, 'ROME');
  assert.match(els['build-panel-content'].innerHTML, new RegExp(`<strong>${hidden}</strong> de chaque ressource à l'abri`));
  assert.match(els['build-panel-content'].innerHTML, new RegExp(`bois :</span><span>${hidden} à l'abri · ${20000 - hidden} pillables`));
  assert.match(els['build-panel-content'].innerHTML, /pierre :<\/span><span>100 à l'abri · 0 pillable/);
  assert.match(els['build-panel-content'].innerHTML, /L'or ne se pille jamais/);
  // Place de rassemblement : la taille des rassemblements que l'on lance
  ctx.openBuildPanel(7);
  assert.match(els['build-panel-content'].innerHTML, new RegExp(`Rassemblement d'alliance que vous lancez : <strong>${fx.rallyMaxArmies(9)}</strong> armées au plus`));
  // Tour de guet : rayon de vision des armées des autres joueurs, autour de chaque ville
  ctx.openBuildPanel(8);
  assert.match(els['build-panel-content'].innerHTML, new RegExp(`qu'à ${fx.visionRadius(4)} cases de chacune de vos villes`));
  // Ambassade : la taille de l'alliance suit celle du chef
  ctx.openBuildPanel(9);
  assert.match(els['build-panel-content'].innerHTML, /3 membres par niveau/);
});

test('fiches : fonctions des bâtiments revus, coût en or et Forge sur la fiche d\'une unité d\'élite', { skip }, () => {
  let sheet = null;
  const ctx = makeContext({ getProductionAtLevel: () => 0, getStorageAtLevel: () => 0, showTab() {}, openSheetModal: (title, html) => { sheet = html; }, armyTilesPerHour: () => ({ tilesPerHour: 100, civ: 0, extra: 0 }) });
  run(ctx, '01-core.js', CORE);
  run(ctx, '06b-research.js', ['fmtTechPct']);
  run(ctx, '07-army.js', ['maxArmiesAtRallyLevel', 'rallyPointLevel', 'rallyMaxArmiesAt']);
  run(ctx, '04-buildings-render.js', ['merchantsAt', 'visionRadiusAt', 'allianceMaxMembersAt']);
  run(ctx, '05-panels.js', ['COLONY_TRAINER', 'formatDuration']);
  run(ctx, '10b-sheets.js', ['SHEET_RULES', 'SHEET_TIER_NAMES', 'SHEET_CLASS_NAMES', 'SHEET_FACTION_NAMES', 'SHEET_MAP_UNIT', 'sheetKey', 'sheetUnits', 'sheetBuildings', 'sheetUnitGallery', 'sheetCostHtml', 'sheetKv',
    'unitSheetRequirement', 'capitalTrainBoost', 'unitTrainTimeInCity', 'showUnitInfoModal', 'buildingFunctions']);
  ctx.TECH_RESOURCES = ['wood', 'stone', 'iron', 'food'];
  const fxOf = (key) => BUILDINGS.find(b => b.key === key).effects;
  const fns = (key) => JSON.parse(JSON.stringify(ctx.buildingFunctions(key, fxOf(key)))).map(([label]) => label);
  assert.ok(fns('FORGE').some(l => /Attaque et défense de toutes vos troupes, dans tous les combats \(\+0,5 % et \+0,5 % par niveau\)/.test(l)));
  assert.ok(fns('HIDEOUT').some(l => l.includes(`(${fx.hideoutAmount([{ key: 'HIDEOUT', level: 1 }], 'ROME')} au niveau 1, ${fx.hideoutAmount([{ key: 'HIDEOUT', level: 20 }], 'ROME')} au niveau 20)`)));
  assert.ok(fns('MILL').some(l => l === 'Céréales +2,5 % par niveau'));
  assert.ok(fns('WALL').some(l => l === `Niveau ${fxOf('WALL').colonyMaxLevel} au plus dans une colonie`));
  assert.ok(fns('RALLY_POINT').some(l => l.includes(`(${fx.rallyMaxArmies(20)} au niveau 20)`)));
  assert.ok(fns('EMBASSY').some(l => /3 membres par niveau/.test(l)));
  assert.ok(fns('TREASURE_CHAMBER').some(l => /ne peut jamais être pillé/.test(l)));
  assert.ok(fns('TREASURE_CHAMBER').some(l => l === `Or chaque jour (${fx.goldPerDayAtLevel(1)} au niveau 1, ${fx.goldPerDayAtLevel(20)} au niveau 20)`));
  assert.ok(fns('SULTAN_DESERT_OUTPOST').some(l => l === `Charge des marchands, des armées de transport et des récoltes (+${fxOf('SULTAN_DESERT_OUTPOST').armyTransportCapacityBonusPctPerLevel} % par niveau)`));
  assert.ok(fns('MARKET').some(l => /Un marchand par niveau \(20 au niveau 20\)/.test(l)));
  assert.ok(fns('GREAT_BARRACKS').some(l => /Caserne de la capitale \(−0,5 % par niveau ; les niveaux de toutes vos Grandes casernes s'additionnent\)/.test(l)));
  assert.ok(fns('WATCHTOWER').some(l => l.includes(`${fxOf('WATCHTOWER').visionRangeL1} cases plus ${fxOf('WATCHTOWER').visionRangePerLevel} par niveau`)));
  // fiche d'une unité d'élite : l'or en plus des ressources, et la Forge de la capitale
  const capital = { id: 'cap', name: 'Roma', isCapital: true, buildings: [{ key: 'BARRACKS', slot: 4, level: 20 }, { key: 'FORGE', slot: 3, level: 10 }], playerStock: stock };
  ctx.cities = [capital];
  ctx.currentCity = capital;
  const elite = UNITS.find(u => u.faction === 'ROME' && u.class === 'INFANTRY' && u.tier === 'elite');
  ctx.showUnitInfoModal(elite.key);
  assert.match(sheet, new RegExp(`sheet-cost missing">\\[gold\\] ${elite.recruitGold}</span>`));
  assert.match(sheet, /unité d'élite : de l'or en plus des ressources/);
  assert.match(sheet, /Forge de la capitale.*\+5 % d'attaque · \+5 % de défense/);
});

// ---------- décision 3 : les marchands du marché ----------
test('marchands : libres / total, marchands nécessaires et refus comme le serveur, trajet aller et retour', { skip }, () => {
  const els = { 'market-merchants': { innerHTML: '' } };
  const ctx = makeContext({ document: { getElementById: id => els[id] || null }, fetchJson: async () => ({}) });
  run(ctx, '05-panels.js', ['formatDuration']);
  run(ctx, '06b-research.js', ['fmtTechPct']);
  run(ctx, '11b-market-trade.js', ['marketState', 'merchantsFor', 'merchantSeconds', 'noMerchantsText', 'merchantsText', 'renderMerchantsBar', 'merchantNeedHtml', 'deliveryTimesText']);
  const ev = (code) => vm.runInContext(code, ctx);   // les const du fichier ne sont pas des propriétés du contexte
  const capacity = MS.merchantCapacity('ROME', []);
  ev(`marketState = { merchants: { total: 5, free: 2, capacity: ${capacity}, speed: ${MS.merchantSpeed('ROME')} } }`);
  ctx.renderMerchantsBar();
  assert.match(els['market-merchants'].innerHTML, new RegExp(`Marchands : <strong>2 libres / 5</strong> · ${capacity} ressources chacun · vitesse ${MS.merchantSpeed('ROME')}`));
  for (const amount of [1, capacity, capacity + 1, 3 * capacity]) assert.equal(ev(`merchantsFor(${amount}, ${capacity})`), MS.merchantsFor(amount, capacity), `${amount}`);
  // deux marchands libres : 2 × charge passe, une ressource de plus non (même refus que le serveur)
  assert.match(ev(`merchantNeedHtml(${2 * capacity})`), /^2 marchands sur 2 libres/);
  assert.equal(ev(`merchantNeedHtml(${2 * capacity + 1})`), '<span class="missing">Pas assez de marchands libres (2 libres, 3 nécessaires)</span>');
  assert.equal(ev('merchantNeedHtml(0)'), '');
  // trajet : en ligne droite à la vitesse des marchands, comme calculateTravelTime ; le retour dure autant
  ctx.currentCity = { x: 0, y: 0 };
  const seconds = calc.calculateTravelTime(0, 0, 30, 40, MS.merchantSpeed('ROME'));
  assert.equal(ev(`merchantSeconds(currentCity, 30, 40, ${MS.merchantSpeed('ROME')})`), seconds);
  assert.match(ev('merchantNeedHtml(10, { x: 30, y: 40 })'), /aller : au moins .*, retour des marchands : autant/);
  assert.match(ev(`deliveryTimesText({ merchantsUsed: 1, arrivalAt: '2026-10-31T13:00:00Z', returnAt: '2026-10-31T14:00:00Z' })`), /arrivée dans bientôt, marchands de retour dans bientôt/);
  // sans Marché dans la capitale : aucun marchand
  ev('marketState = { merchants: { total: 0, free: 0, capacity: 500, speed: 80 } }');
  ctx.renderMerchantsBar();
  assert.match(els['market-merchants'].innerHTML, /construisez la Place du marché dans la capitale/);
});

test('marché : les offres partent sans armée ; la taxe vient du Comptoir de la capitale (plus de « meilleur Comptoir des colonies »)', { skip }, async () => {
  const posted = [];
  const els = { 'market-offer-help': { innerHTML: '' }, 'market-offer-merchants': { innerHTML: '' }, 'market-sell-amount': { value: '1200' } };
  const ctx = makeContext({
    document: { getElementById: id => els[id] || null }, fetchJson: async () => ({}), closeModal() {}, showToast: (m) => { ctx.toast = m; }, _actionInProgress: false,
    fetch: async (url, opts) => { posted.push({ url, body: JSON.parse(opts.body) }); return { ok: true, json: async () => ({ message: 'Échange conclu', merchantsUsed: 1, arrivalAt: 'x', returnAt: 'y' }) }; },
    API: '', token: 't', loadMarket: async () => {}, loadCities: async () => {}
  });
  run(ctx, '01-core.js', ['buildingEffectOf']);
  run(ctx, '05-panels.js', ['formatDuration']);
  run(ctx, '06b-research.js', ['fmtTechPct']);
  run(ctx, '11b-market-trade.js', ['marketState', 'merchantsFor', 'merchantSeconds', 'noMerchantsText', 'merchantsText', 'merchantNeedHtml', 'deliveryTimesText', 'refreshOfferForm', 'updateOfferMerchants']);
  run(ctx, '11-market.js', ['confirmAcceptOffer']);
  vm.runInContext('marketState = { taxPct: 7.5, basePct: 10, offerHours: 48, merchants: { total: 3, free: 3, capacity: 500, speed: 80 } }', ctx);
  ctx.refreshOfferForm();
  assert.match(els['market-offer-help'].innerHTML, /<strong>7,5 %<\/strong> depuis cette ville \(10 % de base, −1 % par niveau du Comptoir de la capitale/);
  assert.doesNotMatch(els['market-offer-help'].innerHTML, /colonies/);
  assert.match(els['market-offer-merchants'].innerHTML, /^3 marchands sur 3 libres/);
  ctx.currentCity = { id: 'c1' };
  await ctx.confirmAcceptOffer('o1');
  assert.deepEqual({ ...posted[0].body }, { cityId: 'c1' });   // plus d'armée
  assert.match(ctx.toast, /Échange conclu · arrivée dans/);
});
