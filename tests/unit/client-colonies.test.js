require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Client des colonies (décisions du 30 octobre 2026, SPEC-COLONIES.md) : bonus du gisement (aperçu de production, textes),
// Mur sur l'enceinte (place fixe, plus dans l'anneau), liste de construction d'une colonie repliée, « Lieu de formation »,
// vue « Mes villes » et « Sites libres ». Le code du navigateur tourne dans un contexte vm, avec un faux DOM réduit.
let acorn = null;
try { acorn = require('acorn'); } catch (e) { /* acorn vient avec eslint (dépendance de dev) */ }
const skip = acorn ? false : 'acorn absent';

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'js', 'app');
const src = (f) => fs.readFileSync(path.join(FRONT, f), 'utf8');
const raw = require('../../data/buildings.json');
const BUILDINGS = Array.isArray(raw) ? raw : raw.buildings;
const rawUnits = require('../../data/units.json');
const UNITS = Array.isArray(rawUnits) ? rawUnits : rawUnits.units;
const fx = require('../../src/utils/buildingEffects');
const WALL_SLOT = 20;   // config.city.wallSlot, transmis par /api/player/me (economy.city)

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

function makeContext(extra = {}) {
  const ctx = {
    console, window: { buildingsData: BUILDINGS }, buildingsData: BUILDINGS, unitsData: UNITS,
    resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), formatNum: n => String(Math.floor(n)), formatTime: () => 'bientôt',
    serverNow: () => Date.parse('2026-10-30T12:00:00Z'), techPctClient: () => 0, factionBonusPct: (f, t, fallback = 0) => fallback,
    player: { faction: 'ROME', economy: { city: { maxSlot: 19, wallSlot: WALL_SLOT }, build: require('../../src/config').build } },
    currentCity: null, cities: [], armies: [], incomingAttacks: [],
    ...extra
  };
  vm.createContext(ctx);
  return ctx;
}
const run = (ctx, file, names) => vm.runInContext(pick(src(file), names), ctx);
const CORE = ['RES_KEYS', 'RES_NAMES', 'playerStock', 'stockOf', 'canPayCost', 'costShortfall', 'effectBuildings', 'SITE_RESOURCE', 'getCityProduction', 'cityProductionMultiplier', 'lerpExp', 'getProductionAtLevel', 'TIER_COLORS'];
const SITES = ['residenceEffects', 'SITE_NAMES', 'siteBonusPct', 'siteText', 'siteBadgeHtml', 'capitalCity', 'secondaryCities'];

test('gisement : +15 % par niveau sur sa seule ressource dans l\'aperçu de production, comme le serveur', { skip }, () => {
  const { getProductionAtLevel: serverProd } = require('../../src/utils/calculations');
  const ctx = makeContext();
  run(ctx, '01-core.js', CORE);
  const fields = [1, 2, 3, 4].map(i => ({ key: 'IRON_MINE', slot: 108 + i, level: 10 })).concat([{ key: 'LUMBER', slot: 101, level: 10 }, { key: 'FOUNDRY', slot: 3, level: 5 }]);
  const site = { type: 'IRON', level: 3, bonusPct: fx.colonyNodeBonusPct(3) };
  assert.equal(site.bonusPct, 45);
  const colony = { id: 'c1', isCapital: false, buildings: fields, site };
  const prod = ctx.getCityProduction(colony);
  const ironFields = 4 * serverProd('IRON_MINE', 10, BUILDINGS), woodFields = serverProd('LUMBER', 10, BUILDINGS);
  const colonyMult = 1 + fx.secondaryCityBonusPct() / 100;
  // fer : Fonderie 5 (+25 %) et gisement niveau 3 (+45 %), puis +20 % des colonies ; le bois n'a que le bonus des colonies
  assert.ok(Math.abs(prod.iron - (ironFields * (1 + (25 + 45) / 100) + 5) * colonyMult) < 1e-9);
  assert.ok(Math.abs(prod.wood - (woodFields + 5) * colonyMult) < 1e-9);
  // sans gisement (capitale, Ville Merveille) : pas de bonus
  const plain = ctx.getCityProduction({ ...colony, site: null });
  assert.ok(Math.abs(plain.iron - (ironFields * 1.25 + 5) * colonyMult) < 1e-9);
});

test('gisement : textes de la bulle, de la fondation et de la ville ; bonus lu dans les données', { skip }, () => {
  const ctx = makeContext();
  run(ctx, '01-core.js', ['SITE_RESOURCE']);
  run(ctx, '06c-colonies.js', SITES);
  for (const level of [1, 2, 3]) assert.equal(ctx.siteBonusPct(level), fx.colonyNodeBonusPct(level));
  assert.equal(ctx.siteText('IRON', 3), 'Gisement de fer niveau 3 : +45 % de fer dans une colonie');
  assert.equal(ctx.siteText('FOOD', 1), 'Gisement de céréales niveau 1 : +15 % de céréales dans une colonie');
  assert.equal(ctx.siteText('WOOD', 2, 'dans cette colonie'), 'Gisement de bois niveau 2 : +30 % de bois dans cette colonie');
  for (const type of ['GOLD', 'PLAN', 'WONDER', 'HORDE']) assert.equal(ctx.siteText(type, 3), '');   // on n'y fonde pas de colonie
  assert.match(ctx.siteBadgeHtml({ type: 'STONE', level: 2, bonusPct: 30 }), /\[stone\] pierre niv\. 2 · \+30 %/);
  assert.equal(ctx.siteBadgeHtml(null), '');   // capitale
});

test('fondation : le panneau annonce le bonus du gisement choisi (rien pour un site de Merveille)', { skip }, () => {
  const body = { innerHTML: '' };
  const ctx = makeContext({
    document: { getElementById: (id) => (id === 'modal-body' ? body : { style: {} }) },
    settlerPortrait: () => '', settlerIcon: () => '', showToast() {}
  });
  run(ctx, '01-core.js', CORE);
  run(ctx, '06c-colonies.js', [...SITES, 'COLONY_RULES', 'foundCityAt']);
  ctx.cities = [{ id: 'c0', isCapital: true, x: 0, y: 0, settlers: 1, playerStock: {} }];
  ctx.currentCity = ctx.cities[0];
  ctx.armies = [{ id: 'a1', name: 'Légion', status: 'IDLE', cityId: 'c0', x: 0, y: 0, units: [{ count: 10 }] }];
  ctx.foundCityAt('n1', 5, 6, 'IRON', 3);
  assert.match(body.innerHTML, /Gisement de fer niveau 3 : \+45 % de fer dans une colonie/);
  ctx.foundCityAt('w1', 0, 0);   // site de Merveille (09i-world.js)
  assert.doesNotMatch(body.innerHTML, /Gisement/);
});

test('Mur sur l\'enceinte : place fixe, jamais un emplacement de l\'anneau ; toucher l\'enceinte ouvre le Mur', { skip }, () => {
  const ctx = makeContext({ getBuildingName: k => (k === 'WALL' ? 'Mur' : k), art: p => p, openBuildPanel() {}, showBuildingInfoModal() {} });
  run(ctx, '04-buildings-render.js', ['getBuildingAtSlot']);
  run(ctx, '04b-iso-scene.js', ['ISO_CITY_CELLS', 'R_FIELD', 'ISO_FIELD_CELLS', 'R_WALL', 'ISO_GATE_SIDE', 'ISO_WALL_SEGMENTS', 'ISO_GATE_ALONG', 'ISO_GATE_INDEX', 'ISO_GATE_POS',
    'isoGateGrid', 'isoGateCell', 'ISO_SP', 'isoPos', 'isoSlotCell', 'cityWallSlot', 'cityWallLevel', 'ISO_WALL_HIT', 'isoOnEnclosure', 'isoHitSlot', 'cityActionSpec']);
  // un Mur d'avant la migration resté sur l'emplacement 7 n'occupe plus l'anneau
  ctx.currentCity = { buildings: [{ key: 'MAIN_HALL', slot: 0, level: 5 }, { key: 'WALL', slot: WALL_SLOT, level: 4 }, { key: 'MARKET', slot: 3, level: 1 }] };
  assert.equal(ctx.getBuildingAtSlot(WALL_SLOT).level, 4);
  assert.equal(ctx.getBuildingAtSlot(3).key, 'MARKET');
  ctx.currentCity.buildings.push({ key: 'WALL', slot: 7, level: 2 });
  assert.equal(ctx.getBuildingAtSlot(7), undefined);
  assert.deepEqual([...ctx.isoSlotCell(WALL_SLOT)], [...vm.runInContext('isoGateCell(0)', ctx)]);   // « Voir dans la ville » : la porte
  // toucher l'enceinte (au pied des murs, ou sur le corps d'un mur) : le Mur ; le centre de la ville : rien
  const layout = { W: 100, cx: 400, cy: 300 };
  const wall = { slot: WALL_SLOT, wall: true, fixedKey: 'WALL', layout, hw: 37, hh: 18.5 };
  ctx.citySlots = [wall];
  const at = (gx, gy) => vm.runInContext(`isoPos(${gx}, ${gy}, 100, 400, 300)`, ctx);
  const R = vm.runInContext('R_WALL', ctx);
  for (const [gx, gy] of [[R, 0.5], [-R, 0], [0, -R], [1, R + 0.3]]) { const p = at(gx, gy); assert.equal(ctx.isoHitSlot(p.x, p.y), WALL_SLOT, `${gx},${gy}`); }
  const centre = at(0, 0), behind = at(-R, -R + 2), above = at(-R, 0);
  assert.equal(ctx.isoHitSlot(centre.x, centre.y), null);
  assert.equal(ctx.isoHitSlot(behind.x, behind.y - 400), null);
  assert.equal(ctx.isoHitSlot(above.x, above.y - 30), WALL_SLOT);   // le corps du mur, au-dessus de son pied
  // bulle d'action : Améliorer le Mur bâti, Construire sinon
  assert.deepEqual(ctx.cityActionSpec(wall).buttons.map(b => b.label), ['Améliorer', 'Infos']);
  ctx.currentCity = { buildings: [{ key: 'MAIN_HALL', slot: 0, level: 5 }] };
  const spec = ctx.cityActionSpec(wall);
  assert.equal(spec.title, 'Mur');
  assert.equal(spec.level, 0);
  assert.deepEqual(spec.buttons.map(b => b.label), ['Construire', 'Infos']);
  assert.equal(ctx.isoHitSlot(above.x, above.y - 30), null);   // pas de mur debout : seul son tracé au sol se touche
});

// Panneau de construction : faux DOM du panneau (#build-panel, contenu, titre) et du voile
function panelContext(extra = {}) {
  const els = { 'build-panel': { style: {}, classList: { add() {} } }, 'build-panel-content': { innerHTML: '' }, 'build-panel-title': { innerHTML: '', textContent: '' } };
  const overlay = { style: {}, classList: { add() {} } };
  const ctx = makeContext({
    document: { getElementById: id => els[id] || null, querySelector: s => (s === '.build-panel-overlay' ? overlay : null) },
    getBuildingName: k => BUILDINGS.find(b => b.key === k)?.name || k, buildingIconHtml: k => `<${k}>`, infoBtnHtml: () => '', unitIconHtml: () => '',
    getUnitName: k => k, getBuildingEffect: () => null, ...extra
  });
  run(ctx, '01-core.js', CORE);
  run(ctx, '04-buildings-render.js', ['getBuildingAtSlot']);
  run(ctx, '04b-iso-scene.js', ['cityWallSlot']);
  run(ctx, '05-panels.js', ['selectedBuildSlot', 'openBuildPanel', 'getBuildCost', 'getCityBuildTimeReductionPct', 'getBuildTime', 'formatDuration', 'getBuildingBonus',
    'getBuildingSpecialTabs', 'checkBuildingPrerequisites', 'BUILD_MAX_RUNNING', 'buildQueuedMax', 'buildQueueMax', 'isBuildQueueFull', 'getBuildingDescription', 'getBuildingShortDescription',
    'COLONY_TRAINER', 'recruitPlaceCityId', 'trainerLevelIn', 'recruitPlaces', 'selectRecruitPlace', 'recruitPlaceHtml', 'openRecruitmentPanel']);
  run(ctx, '06c-colonies.js', SITES);
  return { ctx, content: els['build-panel-content'] };
}
const stock = { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6, maxStorage: 2e6, maxFoodStorage: 2e6 };

test('construction : le Mur n\'est plus proposé sur un emplacement ; dans une colonie, les bâtiments de la capitale sur une ligne repliée', { skip }, () => {
  const { ctx, content } = panelContext();
  const capital = { id: 'c0', isCapital: true, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 10 }], buildQueue: [], playerStock: stock };
  const colony = { id: 'c1', isCapital: false, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 10 }], buildQueue: [], playerStock: stock };
  ctx.cities = [capital, colony];
  ctx.citySlots = [{ slot: 0, fixed: true, fixedKey: 'MAIN_HALL' }, { slot: 5 }, { slot: WALL_SLOT, wall: true, fixedKey: 'WALL' }];
  ctx.currentCity = colony;
  ctx.openBuildPanel(5);
  assert.doesNotMatch(content.innerHTML, /buildAtSlot\('WALL'/);
  const capitalOnly = BUILDINGS.filter(b => b.effects?.capitalOnly && (b.category !== 'FACTION' || b.faction === 'ROME'));
  assert.equal(capitalOnly.length, 13);
  assert.match(content.innerHTML, /Bâtiments de la capitale \(13\) : leurs effets valent aussi ici/);
  assert.equal((content.innerHTML.match(/build-option-card/g) || []).length, BUILDINGS.filter(b => !b.effects?.capitalOnly && b.category !== 'FACTION' && !['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'MAIN_HALL', 'WALL'].includes(b.key)).length);
  assert.doesNotMatch(content.innerHTML, /Réservé à la capitale/);
  assert.match(content.innerHTML, /buildAtSlot\('GREAT_BARRACKS', 5\)/);
  // dans la capitale : pas de ligne repliée, les bâtiments de la capitale proposés
  ctx.currentCity = capital;
  ctx.openBuildPanel(5);
  assert.doesNotMatch(content.innerHTML, /build-folded/);
  assert.match(content.innerHTML, /buildAtSlot\('ACADEMY', 5\)/);
  assert.doesNotMatch(content.innerHTML, /buildAtSlot\('WALL'/);
});

test('construction : l\'enceinte ouvre le Mur, à bâtir (prérequis du Bâtiment principal) ou à améliorer', { skip }, () => {
  const { ctx, content } = panelContext();
  const city = { id: 'c0', isCapital: true, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 2 }], buildQueue: [], playerStock: stock };
  ctx.cities = [city];
  ctx.currentCity = city;
  ctx.citySlots = [{ slot: 0, fixed: true, fixedKey: 'MAIN_HALL' }, { slot: WALL_SLOT, wall: true, fixedKey: 'WALL' }];
  ctx.openBuildPanel(WALL_SLOT);
  assert.match(content.innerHTML, /Requis: Bâtiment principal niv\.3/);
  assert.match(content.innerHTML, /upgrade-btn disabled/);
  city.buildings[0].level = 5;
  ctx.openBuildPanel(WALL_SLOT);
  assert.match(content.innerHTML, /Construire/);
  assert.match(content.innerHTML, /upgradeBuilding\('WALL', 20\)/);
  assert.match(content.innerHTML, /Pas encore construit/);
  city.buildings.push({ key: 'WALL', slot: WALL_SLOT, level: 3 });
  city.buildQueue = [{ buildingKey: 'WALL', slot: WALL_SLOT, status: 'RUNNING' }];
  ctx.openBuildPanel(WALL_SLOT);
  assert.match(content.innerHTML, /<span class="level-num">5<\/span>/);   // niveau 3, un en file : le suivant est le 5
  assert.match(content.innerHTML, /Améliorer/);
});

test('lieu de formation : depuis la Caserne de la capitale, palier et file de la colonie choisie, commande à son nom', { skip }, () => {
  const { ctx, content } = panelContext();
  const capital = { id: 'cap', name: 'Roma', isCapital: true, buildings: [{ key: 'BARRACKS', slot: 4, level: 10 }], recruitQueue: [], playerStock: stock };
  const withGb = { id: 'col-a', name: 'Ostia', isCapital: false, buildings: [{ key: 'GREAT_BARRACKS', slot: 2, level: 3 }], recruitQueue: [{ buildingKey: 'BARRACKS', unitKey: 'ROM_INF_MILICIEN', count: 7, status: 'RUNNING', endsAt: '2026-10-30T13:00:00Z' }] };
  const without = { id: 'col-b', name: 'Capua', isCapital: false, buildings: [], recruitQueue: [] };
  ctx.cities = [capital, withGb, without];
  ctx.currentCity = capital;
  assert.deepEqual(ctx.recruitPlaces('BARRACKS').map(p => [p.city.id, p.key, p.level]), [['cap', 'BARRACKS', 10], ['col-a', 'GREAT_BARRACKS', 3], ['col-b', 'GREAT_BARRACKS', 0]]);
  assert.deepEqual(ctx.recruitPlaces('WORKSHOP'), []);
  // la capitale (par défaut) : Caserne 10, intermédiaires
  ctx.openRecruitmentPanel('BARRACKS', 10, 4);
  assert.match(content.innerHTML, /Lieu de formation/);
  assert.match(content.innerHTML, /<option value="col-b" disabled>Capua : pas de Grande Caserne<\/option>/);
  assert.match(content.innerHTML, /openUnitRecruitModal\('ROM_INF_TRIARII', 'BARRACKS', 'cap'\)/);
  // Ostia : sa Grande caserne 3, la base seulement ; sa file ; la commande part sur Ostia
  ctx.selectRecruitPlace('col-a', 'BARRACKS', 10, 4);
  assert.match(content.innerHTML, /<option value="col-a" selected>Ostia : Grande Caserne niv\. 3<\/option>/);
  assert.match(content.innerHTML, /openUnitRecruitModal\('ROM_INF_MILICIEN', 'GREAT_BARRACKS', 'col-a'\)/);
  assert.doesNotMatch(content.innerHTML, /ROM_INF_TRIARII/);
  assert.match(content.innerHTML, /7x ROM_INF_MILICIEN/);
  assert.match(content.innerHTML, /Formation à Ostia : les unités arrivent dans la capitale/);
  // une colonie sans Grande caserne ne peut pas être choisie : retour à la capitale
  ctx.selectRecruitPlace('col-b', 'BARRACKS', 10, 4);
  assert.match(content.innerHTML, /openUnitRecruitModal\('ROM_INF_TRIARII', 'BARRACKS', 'cap'\)/);
  // dans la colonie elle-même (Grande caserne touchée) : pas de sélecteur
  ctx.currentCity = withGb;
  ctx.openRecruitmentPanel('GREAT_BARRACKS', 3, 2);
  assert.doesNotMatch(content.innerHTML, /Lieu de formation/);
  assert.match(content.innerHTML, /openUnitRecruitModal\('ROM_INF_MILICIEN', 'GREAT_BARRACKS', 'col-a'\)/);
});

test('lieu de formation : la commande va à la ville choisie, temps du bâtiment de cette ville', { skip }, async () => {
  const posted = [];
  const ctx = makeContext({
    document: { getElementById: id => (id === 'recruit-count' ? { value: '5' } : null) },
    fetch: async (url, opts) => { posted.push({ url, body: JSON.parse(opts.body) }); return { ok: true, json: async () => ({}) }; },
    API: '', token: 't', closeModal() {}, showToast: (m) => { ctx.toast = m; }, loadCities: async () => {}, renderCity() {}, getUnitName: k => k
  });
  run(ctx, '05-panels.js', ['_actionInProgress', 'recruitFromBuilding']);
  run(ctx, '10b-sheets.js', ['SHEET_RULES', 'sheetBuildings', 'unitTrainTimeInCity']);
  const capital = { id: 'cap', name: 'Roma', isCapital: true, buildings: [{ key: 'BARRACKS', level: 10 }] };
  const colony = { id: 'col-a', name: 'Ostia', isCapital: false, buildings: [{ key: 'GREAT_BARRACKS', level: 10 }] };
  ctx.cities = [capital, colony];
  ctx.currentCity = capital;
  await ctx.recruitFromBuilding('ROM_INF_MILICIEN', 'GREAT_BARRACKS', 'col-a');
  assert.equal(posted[0].url, '/api/city/col-a/recruit');
  assert.deepEqual({ ...posted[0].body }, { unitKey: 'ROM_INF_MILICIEN', count: 5, buildingKey: 'GREAT_BARRACKS' });
  assert.match(ctx.toast, /à Ostia : les unités arriveront dans la capitale/);
  await ctx.recruitFromBuilding('ROM_INF_MILICIEN', 'BARRACKS');
  assert.equal(posted[1].url, '/api/city/cap/recruit');
  // temps : la Grande caserne de la colonie (4 %/niveau), comme fx.trainTimeReductionPct du serveur
  const unit = UNITS.find(u => u.key === 'ROM_INF_MILICIEN');
  assert.equal(ctx.unitTrainTimeInCity(unit, colony).pct, fx.trainTimeReductionPct(colony.buildings, 'INFANTRY'));
  assert.equal(ctx.unitTrainTimeInCity(unit, capital).pct, fx.trainTimeReductionPct(capital.buildings, 'INFANTRY'));
});

test('« Mes villes » : gisement, stocks et « plein dans », file vide en rouge, recrutement, armées, vies, attaque, totaux', { skip }, () => {
  let modal = null;
  const ctx = makeContext({ showModal: (title, html) => { modal = { title, html }; }, showToast() {} });
  run(ctx, '01-core.js', CORE);
  run(ctx, '05-panels.js', ['formatDuration']);
  run(ctx, '06c-colonies.js', [...SITES, 'lastEndOf', 'countdownHtml', 'stockBarHtml', 'myCityRowHtml', 'myCitiesTotalsHtml', 'openVillageList']);
  const playerStock = { ...stock, wood: 5000, foodBalance: { production: 100, consumption: 300, net: -200, hoursLeft: 10 } };
  const capital = { id: 'cap', name: 'Roma', isCapital: true, x: 0, y: 0, wood: 100, stone: 100, iron: 100, food: 400, maxStorage: 1000, maxFoodStorage: 1000, buildings: [],
    buildQueue: [], recruitQueue: [{ count: 12, endsAt: '2026-10-30T14:00:00Z' }], foodBalance: { production: 10, consumption: 210, net: -200 }, lives: { total: 4, left: 4 }, site: null, playerStock };
  const colony = { id: 'col', name: 'Ostia', isCapital: false, x: 10, y: 10, wood: 1000, stone: 500, iron: 0, food: 0, maxStorage: 1000, maxFoodStorage: 1000, buildings: [{ key: 'LUMBER', level: 1 }],
    buildQueue: [{ endsAt: '2026-10-30T13:00:00Z' }, { endsAt: '2026-10-30T15:00:00Z' }], recruitQueue: [], foodBalance: { production: 12, consumption: 0, net: 12 },
    lives: { total: 2, left: 1 }, site: { type: 'IRON', level: 3, bonusPct: 45 }, playerStock };
  ctx.cities = [colony, capital];
  ctx.currentCity = capital;
  ctx.armies = [{ status: 'IDLE', x: 10, y: 10, units: [{ count: 100 }, { count: 20 }] }, { status: 'MOVING', x: 10, y: 10, units: [{ count: 5 }] }, { status: 'IDLE', x: 0, y: 0, units: [] }];
  ctx.incomingAttacks = [{ targetCityId: 'col', type: 'ATTACK', arrivalAt: '2026-10-30T12:30:00Z' }, { targetCityId: 'cap', type: 'ATTACK', arrivalAt: '2026-10-30T11:00:00Z' }];
  ctx.openVillageList();
  assert.equal(modal.title, 'Mes villes');
  const [totals, rest] = modal.html.split('mv-row');
  assert.match(totals, /Toutes vos villes/);
  assert.match(totals, /\[wood\] 5000 \/ 2000000/);
  assert.match(totals, /mv-food mv-warn.*−200\/h · greniers vides dans 10h 0m/);
  const rows = modal.html.split('class="village-list-item mv-row').slice(1);
  assert.equal(rows.length, 2);
  const [capRow, colRow] = rows;   // la capitale en tête
  assert.match(capRow, /Roma/);
  assert.match(capRow, /<span class="mv-idle">\[build\] File vide<\/span>/);
  assert.match(capRow, /12 en formation/);
  assert.match(capRow, /Aucune armée/);
  assert.match(capRow, /Vies 4\/4/);
  assert.doesNotMatch(capRow, /Attaque dans/);   // l'attaque est déjà passée
  assert.match(capRow, /\[food\].*vide dans 2h 0m/);   // 400 de nourriture, −200/h
  assert.match(colRow, /Ostia/);
  assert.match(colRow, /title="Gisement de fer niveau 3 : \+45 % de fer dans cette colonie">\[iron\] fer niv\. 3 · \+45 %/);
  assert.match(colRow, /2 chantiers · file vide dans/);
  assert.doesNotMatch(colRow, /mv-idle/);
  assert.match(colRow, /1 armée · 120 soldats/);
  assert.match(colRow, /mv-lives mv-warn">\[defense\] Vies 1\/2/);
  assert.match(colRow, /mv-attack">\[attack\] Attaque dans/);
  assert.match(colRow, /\[wood\].*<span class="mv-full">plein<\/span>/);
  assert.match(colRow, /\[stone\].*plein dans \d+h \d+m/);
  assert.ok(rest);
});

test('« Sites libres » : filtres par ressource et niveau, bonus, trajet, tribu à chasser, centre disputé', { skip }, () => {
  let modal = null;
  const ctx = makeContext({ showModal: (title, html) => { modal = { title, html }; } });
  run(ctx, '01-core.js', ['SITE_RESOURCE']);
  run(ctx, '05-panels.js', ['formatDuration']);
  run(ctx, '06c-colonies.js', [...SITES, 'FREE_SITES_FETCH', 'freeSites', 'setFreeSitesFilter', 'freeSiteRowHtml', 'renderFreeSites']);
  vm.runInContext(`freeSites.list = ${JSON.stringify([
    { id: 'n1', x: 3, y: 4, type: 'IRON', level: 3, bonusPct: 45, travelSec: 7800, tribePower: 0, central: true },
    { id: 'n2', x: 8, y: 1, type: 'WOOD', level: 1, bonusPct: 15, travelSec: 9000, tribePower: 350, central: false },
    { id: 'n3', x: 9, y: 9, type: 'IRON', level: 2, bonusPct: 30, travelSec: 9600, tribePower: 0, central: false }
  ])}`, ctx);
  ctx.renderFreeSites();
  assert.equal(modal.title, 'Sites libres');
  assert.equal((modal.html.match(/class="fs-row"/g) || []).length, 3);
  assert.match(modal.html, /fer niv\. 3 · \+45 %/);
  assert.match(modal.html, /2h 10m depuis la capitale/);
  assert.match(modal.html, /foundCityAt\('n1', 3, 4, 'IRON', 3\)/);
  assert.doesNotMatch(modal.html, /foundCityAt\('n2'/);   // tribu encore là : la chasser d'abord
  assert.match(modal.html, /tribu : force 350, à chasser avant de fonder/);
  assert.match(modal.html, /Centre de la carte : site disputé/);
  assert.match(modal.html, /setFreeSitesFilter\('minLevel', 2\)">Niveau 2 et plus/);
  assert.match(modal.html, /setFreeSitesFilter\('minLevel', 3\)">Niveau 3</);
  ctx.setFreeSitesFilter('type', 'IRON');
  assert.equal((modal.html.match(/class="fs-row"/g) || []).length, 2);
  ctx.setFreeSitesFilter('minLevel', 3);
  assert.equal((modal.html.match(/class="fs-row"/g) || []).length, 1);
  ctx.setFreeSitesFilter('type', 'FOOD');
  assert.match(modal.html, /Aucun site libre avec ces filtres/);
});
