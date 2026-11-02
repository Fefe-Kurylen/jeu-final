require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Client après la deuxième simulation de 200 jours (décisions du 2 novembre 2026) : onglet Armée › Échanger (G9), seules
// les armées défendent une ville et la réserve est dite partout (G10), raid qui emporte toute la charge (G4), vagues
// d'Immortels toutes les 24 h (G6), mur du Bastion dans les rapports (G2). Le code du navigateur tourne dans un contexte vm,
// avec un faux DOM réduit.
let acorn = null;
try { acorn = require('acorn'); } catch (e) { /* acorn vient avec eslint (dépendance de dev) */ }
const skip = acorn ? false : 'acorn absent';
const config = require('../../src/config');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'js');
const src = (f) => fs.readFileSync(path.join(FRONT, f), 'utf8');
const rawUnits = require('../../data/units.json');
const UNITS = Array.isArray(rawUnits) ? rawUnits : rawUnits.units;
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
const plain = (v) => JSON.parse(JSON.stringify(v));   // valeurs nées dans le contexte vm, comparées ici

// faux document : éléments par id, insertBefore les enregistre, l'écran d'échange se reconnaît à son contenu
function fakeDocument() {
  const els = new Map();
  const doc = {
    els,
    add(id) { const e = { id, innerHTML: '', style: {}, classList: { contains: () => false, add() {}, remove() {}, toggle() {} }, parentNode: { insertBefore: (n) => els.set(n.id, n) } }; els.set(id, e); return e; },
    getElementById: (id) => els.get(id) || null,
    createElement: () => ({ innerHTML: '', style: {} }),
    querySelector: (sel) => (sel.includes('.army-exchange') && (els.get('armies-management')?.innerHTML || '').includes('class="army-exchange"') ? {} : null)
  };
  return doc;
}

const INF = 'ROM_INF_MILICIEN', CAV = 'ROM_CAV_AUXILIAIRE';
const ROMA = { id: 'cap', name: 'Roma', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 10 }] };
const OSTIA = { id: 'col', name: 'Ostia', isCapital: false, isWonder: false, x: 20, y: 20, buildings: [] };
const unitsOf = (list) => list.map(([unitKey, count]) => ({ unitKey, count }));
function playerArmies() {
  return [
    { id: 'g', name: 'Garnison', cityId: 'cap', isGarrison: true, status: 'IDLE', x: 0, y: 0, slot: 0, units: unitsOf([[INF, 50]]) },
    { id: 'a1', name: 'Légion', cityId: 'cap', status: 'IDLE', x: 20, y: 20, slot: 1, power: 0, units: unitsOf([[INF, 100], [CAV, 10]]) },
    { id: 'a2', name: 'Garde', cityId: 'col', status: 'IDLE', x: 20, y: 20, slot: 1, power: 0, units: unitsOf([[INF, 20]]), attachedColony: { id: 'col', name: 'Ostia', isWonder: false } },
    { id: 'a3', name: 'Cohorte', cityId: 'cap', status: 'IDLE', x: 0, y: 0, slot: 2, power: 0, heroId: 'h1', units: unitsOf([[INF, 30]]) },
    { id: 'a4', name: 'Seule', cityId: 'cap', status: 'IDLE', x: 5, y: 5, slot: 3, power: 0, units: unitsOf([[INF, 3]]) },
    { id: 'a5', name: 'En marche', cityId: 'cap', status: 'MOVING', x: 20, y: 20, slot: 4, power: 0, units: unitsOf([[INF, 7]]) },
    { id: 'a6', name: 'Réservée', cityId: 'cap', status: 'MARKET', x: 0, y: 0, slot: 5, power: 0, units: unitsOf([[INF, 4]]) },
    { id: 'a7', name: 'Au combat', cityId: 'cap', status: 'IDLE', x: 20, y: 20, slot: 6, power: 0, claimedAt: '2026-11-02T10:00:00Z', units: unitsOf([[INF, 5]]) },
    { id: 'b1', name: 'Rempart', cityId: 'cap', status: 'STATIONED', targetBastionId: 'bx', x: 40, y: 40, slot: 7, power: 0, units: unitsOf([[INF, 60]]) },
    { id: 'b2', name: 'Bouclier', cityId: 'col', status: 'STATIONED', targetBastionId: 'bx', x: 40, y: 40, slot: 2, power: 0, units: unitsOf([[CAV, 15]]) }
  ];
}
const ARMY_UI = ['ARMY_SLOTS', 'maxArmiesAtRallyLevel', 'rallyPointLevel', 'getMaxArmies', 'COLONY_ARMY_RULE', 'armyColonyOf', 'colonyToAttach', 'armiesToAttachIn', 'colonyGuestsHtml',
  'RESERVE_NOTICE', 'reserveNoticeText', 'armySoldiers', 'cityDefenceOf', 'cityDefenceHtml', 'attackDefenceNote', 'reserveAttackWarning', 'renderArmies', 'renderArmyCardNew', 'unitPower', 'calculateArmyPower',
  'renderCompositionUnitRow', 'getGarrisonUnits', 'RAID_RULES', 'raidRuleText', 'showArmyMissionModal',
  'armyExchange', 'exchangePlaceKey', 'exchangePartners', 'exchangeHomeOf', 'isArmyHome', 'exchangePlaceLabel', 'exchangePlaces', 'exchangeRows', 'exchangeKeep', 'exchangePreview',
  'renderArmyExchange', 'openArmyExchange', 'pickExchangePlace', 'pickExchangeArmy', 'setExchangeLeft', 'shiftExchange', 'resetArmyExchange', 'submitArmyExchange'];
function armyContext(extra = {}) {
  const toasts = [];
  const document = fakeDocument();
  const ctx = {
    console, document, window: { buildingsData: [] }, unitsData: UNITS, API: '', token: 't', toasts,
    player: { id: 'p1', faction: 'ROME', hero: { id: 'h1', name: 'Marcus', cityId: 'cap' } }, cities: [ROMA, OSTIA], armies: playerArmies(), currentCity: ROMA,
    resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), formatNum: n => String(Math.floor(n)), heroPortraitHtml: () => '', unitIconHtml: () => '', sheetKey: k => k, infoBtnHtml: () => '',
    forgeNoteHtml: () => '', effectBuildings: (city) => city?.buildings || [], TIER_COLORS: {}, SHEET_RULES: { tierCoeff: {} }, siegeTimeLeft: () => '', serverNow: () => Date.now(),
    showToast: (message, type) => toasts.push({ message, type }), closeModal() {}, showTab() {}, showArmyTab: () => ctx.renderArmyExchange(),
    loadArmies: async () => {}, ...extra
  };
  vm.createContext(ctx);
  run(ctx, 'app/07-army.js', ARMY_UI);
  return ctx;
}
const state = (ctx) => vm.runInContext('armyExchange', ctx);

// ---- G9 : échanger des soldats entre deux armées au même endroit ----
test('G9 : les endroits où échanger, deux armées à l\'arrêt au même endroit ou en garnison dans le même Bastion ; ni la réserve, ni le marché, ni un combat', { skip }, () => {
  const ctx = armyContext();
  const places = ctx.exchangePlaces();
  assert.deepEqual(plain(places.map(p => [p.key, p.label, p.armies.map(a => a.id)])), [['20:20', 'Ostia', ['a1', 'a2']], ['B:bx', 'Garnison du Bastion (40, 40)', ['b1', 'b2']]]);
  // à Roma : la Cohorte est seule (la réserve, l'armée du marché et celle prise dans un combat ne comptent pas)
  assert.equal(ctx.exchangePartners(ctx.armies.find(a => a.id === 'a3')).length, 0);
  assert.deepEqual(plain(ctx.exchangePartners(ctx.armies.find(a => a.id === 'a1')).map(a => a.id)), ['a2']);
  for (const id of ['g', 'a5', 'a6', 'a7']) assert.equal(ctx.exchangePlaceKey(ctx.armies.find(a => a.id === id)), null, id);
});

test('G9 : la requête dans les deux sens, comme POST /api/army/:id/exchange { toArmyId, units, back }', { skip }, () => {
  const ctx = armyContext();
  const [a1, a2, a3] = ['a1', 'a2', 'a3'].map(id => ctx.armies.find(a => a.id === id));
  // la Légion garde 60 fantassins sur 120 : 40 passent à la Garde
  let p = ctx.exchangePreview(a1, a2, { [INF]: 60 });
  assert.deepEqual(plain(p.request), { toArmyId: 'a2', units: [{ unitKey: INF, count: 40 }], back: [] });
  assert.equal(p.refusal, null);
  // dans les deux sens à la fois : 10 cavaliers vers la Garde, ses 20 fantassins vers la Légion
  p = ctx.exchangePreview(a1, a2, { [INF]: 120, [CAV]: 0 });
  assert.deepEqual(plain(p.request), { toArmyId: 'a2', units: [{ unitKey: CAV, count: 10 }], back: [{ unitKey: INF, count: 20 }] });
  assert.equal(p.gave, 10);
  assert.equal(p.took, 20);
  assert.deepEqual(plain(p.notes), [], 'la Garde garde ses 10 cavaliers');
  // la garde rattachée vidée chez elle y reste (on peut l'y dissoudre)
  p = ctx.exchangePreview(a1, a2, { [INF]: 120 });
  assert.equal(p.refusal, null);
  assert.deepEqual(plain(p.notes), ['Garde n\'aura plus de soldats : elle reste à Ostia, où vous pourrez la dissoudre.']);
  // la Légion vidée loin de chez elle rentre aussitôt ; avec le héros, refus
  p = ctx.exchangePreview(a1, a2, { [INF]: 0, [CAV]: 0 });
  assert.deepEqual(plain(p.notes), ['Légion n\'aura plus de soldats : elle rentrera aussitôt à Roma.']);
  a1.heroId = 'h1';
  assert.equal(ctx.exchangePreview(a1, a2, { [INF]: 0, [CAV]: 0 }).refusal, 'Le héros reste avec son armée : laissez au moins un soldat à Légion pour qu\'elle puisse rentrer');
  // refus clairs : rien ne bouge, pas au même endroit, la réserve
  assert.equal(ctx.exchangePreview(a1, a2, {}).refusal, 'Choisissez au moins un soldat à échanger');
  assert.match(ctx.exchangePreview(a1, a3, { [INF]: 0 }).refusal, /même endroit/);
  assert.match(ctx.exchangePreview(ctx.armies.find(a => a.id === 'g'), a3, { [INF]: 0 }).refusal, /réserve ne sont pas une armée/);
  // une garnison de Bastion vidée libère sa place
  const [b1, b2] = ['b1', 'b2'].map(id => ctx.armies.find(a => a.id === id));
  assert.deepEqual(plain(ctx.exchangePreview(b1, b2, { [CAV]: 15 }).notes), ['Bouclier n\'aura plus de soldats : elle rentrera aussitôt à Ostia et libérera sa place au Bastion.']);
});

test('G9 : l\'écran Échanger (flèches, saisie, envoi, réponse du serveur) et ses entrées (actions de l\'armée, armées posées dans la colonie)', { skip }, async () => {
  const calls = [];
  let reply = { ok: true, body: { message: 'Échange fait : 5 soldats de Légion vers Garde.' } };
  const ctx = armyContext({ fetch: async (url, opts) => { calls.push({ url, opts }); return { ok: reply.ok, json: async () => reply.body }; } });
  const box = ctx.document.add('armies-management');
  ctx.openArmyExchange('a1', 'a2');
  assert.match(box.innerHTML, /Ostia · 2 armées/);
  assert.match(box.innerHTML, /<option value="a1" selected>Légion \(110 soldats\)/);
  assert.match(box.innerHTML, /<option value="a2" selected>Garde \(20 soldats\)/);
  assert.match(box.innerHTML, new RegExp(`shiftExchange\\('${INF}', 1\\)`));
  assert.match(box.innerHTML, new RegExp(`shiftExchange\\('${CAV}', -10\\)`), '« tout à gauche » pour les 10 cavaliers');
  assert.match(box.innerHTML, /Aucun soldat ne change d'armée/);
  assert.match(box.innerHTML, /onclick="submitArmyExchange\(\)" disabled/);
  ctx.shiftExchange(INF, 5);
  assert.equal(state(ctx).left[INF], 95);
  assert.match(box.innerHTML, /Passent : 5 soldats de Légion vers Garde\./);
  assert.doesNotMatch(box.innerHTML, /onclick="submitArmyExchange\(\)" disabled/);
  ctx.setExchangeLeft(CAV, '12');   // plus que le total : borné à 10, rien ne bouge
  assert.match(box.innerHTML, /Passent : 5 soldats de Légion vers Garde\.<\/p>/);
  await ctx.submitArmyExchange();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/army/a1/exchange');
  assert.equal(calls[0].opts.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { toArmyId: 'a2', units: [{ unitKey: INF, count: 5 }], back: [] });
  assert.deepEqual(ctx.toasts.at(-1), { message: 'Échange fait : 5 soldats de Légion vers Garde.', type: 'success' });
  assert.deepEqual(plain(state(ctx).left), {});
  // refus du serveur : son message, tel quel
  reply = { ok: false, body: { error: 'Les effectifs ont changé, réessayez' } };
  ctx.shiftExchange(INF, -20);   // les 20 de la Garde passent à gauche
  await ctx.submitArmyExchange();
  assert.deepEqual(JSON.parse(calls[1].opts.body), { toArmyId: 'a2', units: [], back: [{ unitKey: INF, count: 20 }] });
  assert.deepEqual(ctx.toasts.at(-1), { message: 'Les effectifs ont changé, réessayez', type: 'error' });
  // le héros dans la Légion : la vider ici est refusé avant tout envoi
  ctx.armies.find(a => a.id === 'a1').heroId = 'h1';
  ctx.shiftExchange(INF, 200);
  ctx.shiftExchange(CAV, 200);
  assert.match(box.innerHTML, /Le héros reste avec son armée/);
  await ctx.submitArmyExchange();
  assert.equal(calls.length, 2, 'aucune requête pour un échange refusé');
  // aucun endroit à deux armées : l'écran dit comment faire
  ctx.armies = playerArmies().filter(a => !['a2', 'b2'].includes(a.id));
  ctx.renderArmyExchange();
  assert.match(box.innerHTML, /Aucun endroit où deux de vos armées se tiennent ensemble/);
  // la colonie : l'armée de la capitale posée là peut donner ses soldats à la garde, sans place d'armée
  ctx.armies = playerArmies();
  const guests = ctx.colonyGuestsHtml(OSTIA, 0);
  assert.match(guests, /openArmyExchange\('a1', 'a2'\)/);
  assert.match(guests, /Échanger avec Garde/);
  assert.match(vm.runInContext('COLONY_ARMY_RULE', ctx), /Échanger/);
});

test('G9 : bouton « Échanger » dans la barre de l\'onglet Armée, branché sur l\'écran', { skip }, () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'index.html'), 'utf8');
  assert.match(html, /<button class="toolbar-btn" onclick="showArmyTab\('exchange'\)">[^<]*<img[^>]*> Échanger<\/button>/);
  assert.match(src('app/11-market.js'), /case 'exchange':[^\n]*\n\s*renderArmyExchange\(\);/);
  assert.match(src('app/07-army.js'), /onclick="openArmyExchange\('\$\{armyId\}'\)"/, 'action « Échanger » de l\'armée');
});

// ---- G10 : seules les armées défendent ----
test('G10 : onglet Armée, la réserve « ne défend pas », la défense de la ville ne compte que ses armées', { skip }, () => {
  const ctx = armyContext();
  ctx.document.add('armies-management');
  ctx.renderArmies();
  const header = ctx.document.getElementById('garrison-summary').innerHTML, body = ctx.document.getElementById('armies-management').innerHTML;
  assert.match(header, /50 en réserve \(ne défend pas\)/);
  // à Roma : la Cohorte seule (ni la réserve, ni l'armée réservée au marché)
  assert.match(header, /Seules les armées défendent la ville : <strong>1 armée · 30 soldats<\/strong> ici, plus les renforts alliés postés\./);
  assert.match(header, /Vos 50 soldats en réserve ne défendent pas : mettez-les dans une armée\./);
  assert.match(body, /Réserve \(ne défend pas\)/);
  assert.match(body, /Vos 50 soldats en réserve ne défendent pas/);
  assert.doesNotMatch(body + header, /garnison/i);
  assert.doesNotMatch(body, /Joindre à la garnison/);
  // sans armée dans la ville : le dire
  assert.match(ctx.cityDefenceHtml({ id: 'x', x: 9, y: 9 }), /warning-text">\[defense\] Seules les armées défendent la ville : <strong>aucune armée<\/strong>/);
  // la composition : « Réserve : »
  assert.match(ctx.renderCompositionUnitRow('a3', { unitKey: INF, unit: UNITS.find(u => u.key === INF), garrison: 50, inArmy: 30, total: 80 }), /Réserve :<\/span>/);
});

test('G10 : alerte d\'attaque, ce qui défendra et la réserve qui ne défendra pas ; une seule fois par attaque', { skip }, () => {
  const ctx = armyContext();
  run(ctx, 'app/01-core.js', ['warnedAttacks', 'warnReserveOnAttacks']);
  assert.equal(ctx.attackDefenceNote('cap'), 'Défendront : 1 armée (30 soldats) et les renforts alliés postés. Vos 50 soldats en réserve ne défendent pas : mettez-les dans une armée.');
  // à Ostia : la Légion, la Garde et l'armée au combat (à l'arrêt) ; pas l'armée en marche
  assert.equal(ctx.attackDefenceNote('col'), 'Défendront : 3 armées (135 soldats) et les renforts alliés postés.');
  const attack = { id: 'x1', type: 'ATTACK', targetCityId: 'cap', targetCity: 'Roma', arrivalAt: '2026-11-02T12:00:00Z' };
  assert.match(ctx.reserveAttackWarning(attack), /^Attaque contre Roma : Défendront : 1 armée/);
  assert.equal(ctx.reserveAttackWarning({ ...attack, targetCityId: 'col' }), '', 'pas de réserve à Ostia : pas d\'avertissement');
  ctx.warnReserveOnAttacks([attack, { ...attack, id: 'x2', targetCityId: 'col' }]);
  ctx.warnReserveOnAttacks([attack]);
  assert.equal(ctx.toasts.length, 1);
  assert.equal(ctx.toasts[0].type, 'warning');
  assert.match(ctx.toasts[0].message, /Vos 50 soldats en réserve ne défendent pas/);
  // armées pas encore chargées : rien n'est noté, l'alerte viendra au passage suivant
  ctx.armies = [];
  ctx.warnReserveOnAttacks([{ ...attack, id: 'x3' }]);
  ctx.armies = playerArmies();
  ctx.warnReserveOnAttacks([{ ...attack, id: 'x3' }]);
  assert.equal(ctx.toasts.length, 2);
});

test('G10 : « Mes villes » compte les armées qui défendent, la réserve à part', { skip }, () => {
  const ctx = { console, cities: [ROMA, OSTIA], currentCity: ROMA, armies: playerArmies(), incomingAttacks: [], RES_KEYS: ['wood', 'stone', 'iron', 'food'], getCityProduction: () => ({ wood: 0, stone: 0, iron: 0, food: 0 }),
    resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), formatNum: n => String(Math.floor(n)), formatDuration: () => '1h', formatTime: () => 'bientôt', siteBadgeHtml: () => '', protectionHtml: () => '' };
  vm.createContext(ctx);
  run(ctx, 'app/06c-colonies.js', ['lastEndOf', 'countdownHtml', 'stockBarHtml', 'myCityRowHtml']);
  const row = (city) => ctx.myCityRowHtml({ ...city, buildQueue: [], recruitQueue: [], maxStorage: 1000, maxFoodStorage: 1000 }, Date.parse('2026-11-02T10:00:00Z'));
  const capital = row(ROMA);
  assert.match(capital, /1 armée · 30 soldats/);
  assert.match(capital, /50 en réserve, ne défend pas/);
  assert.match(row(OSTIA), /3 armées · 135 soldats · <span title="Garde, Bouclier">2 rattachées<\/span>/);
  // attaquée sans armée : le dire
  ctx.armies = playerArmies().filter(a => a.isGarrison);
  ctx.incomingAttacks = [{ targetCityId: 'cap', type: 'ATTACK', arrivalAt: '2026-11-02T11:00:00Z' }];
  assert.match(row(ROMA), /Aucune armée pour la défendre<\/span> · <span class="mv-warn"[^>]*>50 en réserve, ne défend pas/);
});

// ---- G4 : un raid emporte toute la charge des survivants ----
test('G4 : règles du raid reprises du serveur, textes du raid (onglet Armée, carte, fiche d\'unité)', { skip }, () => {
  const ctx = armyContext();
  const R = vm.runInContext('RAID_RULES', ctx);
  assert.equal(R.lootPctOfCarry, Math.round(config.combat.raidLootPctOfCarry * 100));
  assert.equal(R.stopLossPct, Math.round(config.combat.loserLossRate * 100));
  assert.equal(R.stealPctOutsideHideout, Math.round(config.hideout.raidStealRate * 100));
  assert.equal(R.cooldownHours, config.combat.raidCooldownHours);
  const text = ctx.raidRuleText();
  assert.match(text, /il emporte jusqu'à tout ce que ses soldats survivants peuvent porter/);
  assert.match(text, /le combat s'arrête dès qu'un camp a perdu 30 % de ses soldats/);
  assert.match(text, /sa réserve ne combat pas/);
  ctx.document.add('modal-body');
  ctx.document.add('modal');
  ctx.showArmyMissionModal('a3', 'RAID');
  assert.ok(ctx.document.getElementById('modal-body').innerHTML.includes(text));
  // plus aucun « petit butin » ni « une part de ce que vos soldats portent » dans le client
  for (const f of ['app/07-army.js', 'map.js', 'app/10b-sheets.js']) assert.doesNotMatch(src(f), /petit butin|une part de ce que vos soldats/, f);
  assert.match(src('map.js'), /raidRuleText\(\)/);
});

// ---- G6 : vagues d'Immortels toutes les 24 h ----
test('G6 : la fiche de la Merveille et le site disent les vagues toutes les 24 h', { skip }, async () => {
  let modal = '';
  const wonder = { cityId: 'w1', name: 'Alexandrie', level: 3, maxLevel: 100, owner: { name: 'Moi' }, alliance: null, mine: true, stock: {}, next: null, hasPlan: false, nextWaveAt: '2026-11-03T10:00:00Z' };
  const ctx = { console, BASTION_RES: [['wood', 'bois']], resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), chatSafeId: s => String(s), formatNum: n => String(n), formatDuration: () => '1h', formatTime: () => 'bientôt',
    fetchJson: async () => wonder, openSheetModal: (t, html) => { modal = html; }, showToast() {} };
  vm.createContext(ctx);
  run(ctx, 'app/09i-world.js', ['IMMORTAL_WAVE_HOURS', 'openWonderPanel']);
  assert.equal(vm.runInContext('IMMORTAL_WAVE_HOURS', ctx), config.world.immortalWaveHours);
  await ctx.openWonderPanel('w1');
  assert.match(modal, /Les Immortels attaquent la Merveille toutes les 24 h\. Prochaine vague : <span class="qd-timer" data-ends-at="2026-11-03T10:00:00Z">/);
  assert.match(modal, /Seules les armées postées dans la ville la défendent/);
  wonder.waveHours = 30;   // le serveur fait foi quand il la donne
  await ctx.openWonderPanel('w1');
  assert.match(modal, /toutes les 30 h/);
  Object.assign(wonder, { level: 0, nextWaveAt: null, waveHours: undefined });
  await ctx.openWonderPanel('w1');
  assert.match(modal, /Dès le niveau 1, les Immortels attaqueront la Merveille toutes les 24 h/);
  assert.doesNotMatch(src('app/09i-world.js'), /toutes les 12 h/);
});

// ---- G2 : le rapport d'un assaut de Bastion dit le mur et sa réparation ----
test('G2 : rapport d\'assaut de Bastion, PV du mur sur 36 000, brèche, de nouveau plein 12 h après', { skip }, () => {
  const ctx = { console, player: { id: 'p1' }, resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), formatNum: n => String(n), unitIconHtml: () => '', sheetKey: k => k, getUnitName: k => k };
  vm.createContext(ctx);
  run(ctx, 'app/09-social.js', ['renderBattleReportCard']);
  const wallMax = config.combat.wallHpPerLevel * config.bastion.wallReferenceLevel * config.bastion.wallMultiplier;
  const report = (loot) => ctx.renderBattleReportCard({ id: 'r1', attackerId: 'p1', result: 'WIN', createdAt: '2026-11-02T10:00:00Z', attackerUnits: [], defenderUnits: [], attackerLosses: {}, defenderLosses: {}, loot }, 0, { shared: true });
  const fullAt = '2026-11-02T22:00:00.000Z';
  const broken = report({ type: 'BASTION', wallHpStart: wallMax, wallHpEnd: 0, wallMaxHp: wallMax, wallFullAt: fullAt, lives: { before: 10, after: 9, total: 10 } });
  assert.match(broken, new RegExp(`Mur ${wallMax} → 0 / ${wallMax} PV \\(brèche\\) · de nouveau plein le [^<]* s'il n'est plus touché`));
  const held = report({ type: 'BASTION', wallHpStart: 18000, wallHpEnd: 9000, wallMaxHp: wallMax, wallFullAt: fullAt });
  assert.match(held, new RegExp(`Mur 18000 → 9000 / ${wallMax} PV \\(a tenu\\)`));
  // siège de ville : inchangé
  assert.match(report({ wallHpStart: 5000, wallHpEnd: 5000, wallMaxHp: 5000, wallBroken: false }), /Mur 5000 → 5000 PV \(a tenu\)<\/span>/);
});
