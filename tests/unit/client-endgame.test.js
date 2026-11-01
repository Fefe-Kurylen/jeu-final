require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // wonderService crée le client Prisma, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Fin de partie côté client (décisions du 31 octobre 2026, rapport de vérification) : panneaux du Bastion (garnison de 10
// armées au plus, mur et vies lus dans les règles du serveur, un assaut = un rassemblement ou une armée seule, siège à
// briser par la garnison, l'alliance et ses alliés) et fiche de la Merveille (l'armée est le vrai moyen de la ravitailler).
// Le code du navigateur tourne dans un contexte vm.
let acorn = null;
try { acorn = require('acorn'); } catch (e) { /* acorn vient avec eslint (dépendance de dev) */ }
const skip = acorn ? false : 'acorn absent';
const config = require('../../src/config');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'js', 'app');
const src = (f) => fs.readFileSync(path.join(FRONT, f), 'utf8');
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
// règles telles que GET /api/bastion les donne (bastionService.bastionFor)
const B = config.bastion;
const RULES = { cost: B.cost, buildDays: B.buildDays, cooldownDays: B.cooldownDays, bonuses: B.bonuses, assaults: B.assaults, regenHours: B.regenHours, regenPauseHours: B.regenPauseHours, maxDistance: B.maxDistanceFromMember, wallMultiplier: B.wallMultiplier, wallReferenceLevel: B.wallReferenceLevel, maxGarrisonArmies: B.maxGarrisonArmies, breakGroupSeconds: B.breakGroupSeconds };
function makeContext(state, extra = {}) {
  const ctx = {
    console, token: 't', player: { id: 'p1' }, currentCity: null, armies: [], cities: [],
    resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), chatSafeId: s => String(s), formatNum: n => String(n), formatTime: () => '',
    getUnitName: k => k, fetchJson: async () => state, ...extra
  };
  vm.createContext(ctx);
  vm.runInContext(pick(src('09g-bastion.js'), ['bastionState', 'loadBastion', 'BASTION_RES', 'bastionStatusLabel', 'bastionBonusesHtml', 'bastionRegenHtml', 'renderBastionSection', 'garrisonFullText', 'renderBastionMapPanel', 'openBastionSend']), ctx);
  return ctx;
}
const garrisonArmy = (i) => ({ id: `g${i}`, name: `Armée ${i}`, owner: { id: 'p2', name: 'Bo' }, status: 'STATIONED', units: [{ key: 'ROM_INF_MILICIEN', count: 10 }] });
const bastionView = (n) => ({ id: 'b1', status: 'ACTIVE', x: 4, y: 5, lives: 10, assaults: B.assaults, maxGarrisonArmies: B.maxGarrisonArmies, isSieged: false, garrison: Array.from({ length: n }, (_, i) => garrisonArmy(i)), delivered: {}, cost: B.cost });

test('onglet Alliance › Bastion : garnison « n / 10 armées », envoi impossible quand elle est complète', { skip }, async () => {
  for (const [n, full] of [[B.maxGarrisonArmies - 1, false], [B.maxGarrisonArmies, true]]) {
    const ctx = makeContext({ inAlliance: true, members: 16, minMembers: 15, rules: RULES, bastion: bastionView(n) });
    const box = { innerHTML: '' };
    await ctx.renderBastionSection(box);
    assert.match(box.innerHTML, new RegExp(`Garnison <small>${n} / ${B.maxGarrisonArmies} armées</small>`));
    assert.equal(/openBastionSend\('b1', 'GARRISON'\)/.test(box.innerHTML), !full);
    assert.equal(box.innerHTML.includes(`Garnison complète : ${B.maxGarrisonArmies} armées au plus, celles en route comprises`), full);
  }
  // les armées comptées par le serveur (garrisonWhere) : en route et en sortie sont dites
  const view = bastionView(2);
  view.garrison[0].status = 'SUPPORTING';
  view.garrison[1].status = 'ATTACKING';
  const ctx = makeContext({ inAlliance: true, members: 16, minMembers: 15, rules: RULES, bastion: view });
  const box = { innerHTML: '' };
  await ctx.renderBastionSection(box);
  assert.match(box.innerHTML, /Armée 0 <small>Bo · en route<\/small>/);
  assert.match(box.innerHTML, /Armée 1 <small>Bo · en sortie<\/small>/);
});

test('carte : un Bastion ennemi montre le mur, les vies et la garnison au plus du serveur ; un assaut = un rassemblement ou une armée', { skip }, async () => {
  const ctx = makeContext({ inAlliance: false, rules: RULES }, { mapRelationOf: () => 'ENEMY', openRallyLaunch() {} });
  const content = { innerHTML: '', querySelector: () => null };
  await ctx.renderBastionMapPanel({ id: 'b1', name: 'Bastion [ENN]', x: 4, y: 5, status: 'ACTIVE', lives: 7, allianceTag: 'ENN', allianceName: 'Ennemis' }, content);
  assert.match(content.innerHTML, new RegExp(`Vies : 7 / ${B.assaults}`));
  assert.match(content.innerHTML, new RegExp(`garnison \\(${B.maxGarrisonArmies} armées au plus\\) derrière un mur ${B.wallMultiplier} fois plus solide qu'un mur ${B.wallReferenceLevel}`));
  assert.match(content.innerHTML, /Un assaut, c'est un rassemblement de votre alliance ou une armée seule/);
  assert.doesNotMatch(content.innerHTML, /10 fois plus solide/);
  // envoi en garnison : la limite est dite
  ctx.armies = [{ id: 'a1', name: 'Cohorte', status: 'IDLE', units: [{ count: 5 }] }];
  let modal = '';
  ctx.openSheetModal = (title, html) => { modal = html; };
  ctx.openBastionSend('b1', 'GARRISON');
  assert.match(modal, new RegExp(`\\+${B.bonuses.garrisonDefensePct} % de défense`));
  assert.match(modal, new RegExp(`La garnison compte ${B.maxGarrisonArmies} armées au plus, celles en route comprises`));
  ctx.openBastionSend('b1', 'ATTACK');
  assert.match(modal, /Elle livre son propre assaut, seule/);
});

test('Bastion assiégé : « Briser le siège » pour l\'alliance (onglet et carte) et pour un allié ; sortie de sa garnison ; armées de la garnison proposées', { skip }, async () => {
  // onglet Alliance › Bastion : bouton, sortie de sa propre armée de garnison, et l'aide dit que le camp d'un rassemblement se brise aussi
  const view = { ...bastionView(2), isSieged: true };
  view.garrison[0].owner = { id: 'p1', name: 'Moi' };
  const ctx = makeContext({ inAlliance: true, members: 16, minMembers: 15, rules: RULES, bastion: view }, { mapRelationOf: () => 'SAME_ALLIANCE' });
  const box = { innerHTML: '' };
  await ctx.renderBastionSection(box);
  assert.match(box.innerHTML, /openBastionSend\('b1', 'BREAK'\)/);
  assert.match(box.innerHTML, /bastionSortie\('b1', 'g0'\)/, 'sortie de sa propre armée de garnison');
  assert.doesNotMatch(box.innerHTML, /bastionSortie\('b1', 'g1'\)/, 'pas celle d\'un autre joueur');
  assert.match(box.innerHTML, /même celui d'un rassemblement/);
  // carte : le bouton pour l'alliance du Bastion comme pour un allié, jamais sans siège
  for (const rel of ['SAME_ALLIANCE', 'ALLY']) {
    const map = makeContext({ inAlliance: true, rules: RULES }, { mapRelationOf: () => rel });
    for (const isSieged of [true, false]) {
      const content = { innerHTML: '', querySelector: () => null };
      await map.renderBastionMapPanel({ id: 'b1', name: 'Bastion [DEF]', x: 4, y: 5, status: 'ACTIVE', lives: 7, isSieged, allianceTag: 'DEF', allianceName: 'Défenseurs' }, content);
      assert.equal(/openBastionSend\('b1', 'BREAK'\)/.test(content.innerHTML), isSieged, `${rel}, assiégé : ${isSieged}`);
    }
  }
  // choix de l'armée : celles de sa garnison dans ce Bastion (sortie) d'abord, puis celles en ville
  ctx.armies = [{ id: 'a1', name: 'Cohorte', status: 'IDLE', units: [{ count: 5 }] }, { id: 'g0', name: 'Garde', status: 'STATIONED', targetBastionId: 'b1', units: [{ count: 5 }] }, { id: 'g9', name: 'Ailleurs', status: 'STATIONED', targetBastionId: 'b2', units: [{ count: 5 }] }];
  let modal = '';
  ctx.openSheetModal = (title, html) => { modal = html; };
  ctx.openBastionSend('b1', 'BREAK');
  assert.deepEqual([...modal.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]), ['g0', 'a1']);
  assert.match(modal, /Garde — garnison du Bastion \(sortie\)/);
});

// ---- décisions du 1er novembre 2026 (simulation de 200 jours) ----
test('E3 : le panneau du Bastion et la carte disent la fin de la pause (24 h sans assaut gagné), puis la prochaine vie', { skip }, async () => {
  const pausedUntil = new Date(Date.now() + 5 * 3600000).toISOString(), next = new Date(Date.now() + 12.2 * 3600000).toISOString();
  // onglet Alliance › Bastion : pendant la pause
  const paused = { ...bastionView(1), lives: 7, regenPausedUntil: pausedUntil, nextLifeAt: next };
  let ctx = makeContext({ inAlliance: true, members: 16, minMembers: 15, rules: RULES, bastion: paused });
  const box = { innerHTML: '' };
  await ctx.renderBastionSection(box);
  assert.match(box.innerHTML, /Vies : <strong>7 \/ 10<\/strong>/);
  assert.match(box.innerHTML, new RegExp(`Aucune vie ne revient pendant encore <span class="qd-timer" data-ends-at="${pausedUntil}">`));
  assert.match(box.innerHTML, new RegExp(`\\(${B.regenPauseHours} h sans assaut gagné\\), puis une toutes les 7,2 h`));
  assert.doesNotMatch(box.innerHTML, /elles remontent en 72 h/);
  // la pause finie : la prochaine vie ; toutes là : la règle
  ctx = makeContext({ inAlliance: true, members: 16, minMembers: 15, rules: RULES, bastion: { ...paused, regenPausedUntil: null } });
  await ctx.renderBastionSection(box);
  assert.match(box.innerHTML, new RegExp(`Prochaine vie dans <span class="qd-timer" data-ends-at="${next}">`));
  ctx = makeContext({ inAlliance: true, members: 16, minMembers: 15, rules: RULES, bastion: { ...paused, lives: 10, regenPausedUntil: null, nextLifeAt: null } });
  await ctx.renderBastionSection(box);
  assert.match(box.innerHTML, new RegExp(`Toutes les vies sont là\\. Un assaut gagné en ôte une, et aucune ne revient avant ${B.regenPauseHours} h sans assaut gagné`));
  // carte : un Bastion ennemi en pause (champs donnés par GET /api/map, bastionService.bastionsIn)
  const map = makeContext({ inAlliance: false, rules: RULES }, { mapRelationOf: () => 'ENEMY', openRallyLaunch() {} });
  const content = { innerHTML: '', querySelector: () => null };
  await map.renderBastionMapPanel({ id: 'b1', name: 'Bastion [ENN]', x: 4, y: 5, status: 'ACTIVE', lives: 3, allianceTag: 'ENN', allianceName: 'Ennemis', regenPausedUntil: pausedUntil, nextLifeAt: next }, content);
  assert.match(content.innerHTML, new RegExp(`Aucune vie ne revient pendant encore <span class="qd-timer" data-ends-at="${pausedUntil}">`));
  assert.match(content.innerHTML, new RegExp(`ses vies ne reviennent qu'après ${B.regenPauseHours} h sans assaut gagné`));
});

test('E4 : briser le siège, l\'aide dit que les armées de la même minute se battent ensemble', { skip }, async () => {
  const ctx = makeContext({ inAlliance: true, rules: RULES });
  await ctx.loadBastion(true);
  ctx.armies = [{ id: 'a1', name: 'Cohorte', status: 'IDLE', units: [{ count: 5 }] }];
  let modal = '';
  ctx.openSheetModal = (title, html) => { modal = html; };
  ctx.openBastionSend('b1', 'BREAK');
  assert.match(modal, new RegExp(`dans la même minute \\(${B.breakGroupSeconds} s après la première\\) se battent ensemble`));
  assert.doesNotMatch(modal, /attaque seule/);
  ctx.openBastionSend('b1', 'SUPPLY');
  assert.match(modal, /dans la ville de l'armée d'abord, puis dans vos autres villes/, 'E1 : le convoi se paie sur toutes ses villes');
  assert.doesNotMatch(modal, /Disponible dans toutes vos villes/, 'sans stock connu, pas de ligne');
  // E1 : ce qui peut partir, le stock de toutes ses villes (playerStock, GET /api/cities)
  ctx.playerStock = () => ({ wood: 12000.6, stone: 300, iron: 0, food: 4500, maxStorage: 90000 });
  ctx.openBastionSend('b1', 'SUPPLY');
  assert.match(modal, /Disponible dans toutes vos villes : .*12000 · .*300 · .*0 · .*4500<\/p>/);
});

test('E6 : un site libéré montre sa réservation ; pour une autre alliance, la fondation attend', { skip }, async () => {
  const until = new Date(Date.now() + 4 * 3600000).toISOString();
  const state = { wonderSites: { reserveHours: config.world.wonderSiteReserveHours, reserved: [{ nodeId: 'n1', x: 3, y: 4, allianceId: 'A1', allianceTag: 'AQL', until }] } };
  const panel = () => {
    const nodes = { '.wonder-reserve': { innerHTML: '' }, '[data-wonder-node="n1"]': {}, '[data-found-wonder]': { disabled: false, title: '' } };
    return { nodes, querySelector: (sel) => nodes[sel] || null };
  };
  for (const [allianceId, mine] of [['A1', true], ['A2', false], [null, false]]) {
    const ctx = makeContext(state, { player: { id: 'p1', allianceId } });
    vm.runInContext(pick(src('09i-world.js'), ['worldStateCache', 'loadWorldState', 'wonderSiteReserve', 'fillWonderSiteReserve']), ctx);
    const content = panel();
    await ctx.fillWonderSiteReserve(content, { id: 'n1', x: 3, y: 4 });
    const html = content.nodes['.wonder-reserve'].innerHTML;
    assert.match(html, new RegExp(`data-ends-at="${until}"`), String(allianceId));
    assert.equal(/Réservé à votre alliance/.test(html), mine);
    assert.equal(/Réservé à l'alliance <strong>\[AQL\]<\/strong>, qui a battu les Immortels/.test(html), !mine);
    assert.equal(content.nodes['[data-found-wonder]'].disabled, !mine, 'bouton de fondation');
  }
  // réservation finie ou site jamais réservé : ouvert à toutes les alliances
  const ctx = makeContext({ wonderSites: { reserveHours: 6, reserved: [] } }, { player: { id: 'p1', allianceId: 'A2' } });
  vm.runInContext(pick(src('09i-world.js'), ['worldStateCache', 'loadWorldState', 'wonderSiteReserve', 'fillWonderSiteReserve']), ctx);
  const content = panel();
  await ctx.fillWonderSiteReserve(content, { id: 'n1', x: 3, y: 4 });
  assert.match(content.nodes['.wonder-reserve'].innerHTML, /Toute alliance peut y fonder sa Ville Merveille \(les 6 premières heures/);
  assert.equal(content.nodes['[data-found-wonder]'].disabled, false);
  assert.equal(ctx.wonderSiteReserve({ wonderSites: { reserved: [{ nodeId: 'n1', until: new Date(Date.now() - 1000).toISOString() }] } }, 'n1'), null, 'six heures passées');
});

test('fiche de la Merveille : l\'armée est le vrai moyen de la ravitailler (armées de transport, sans plafond)', { skip }, async () => {
  const W = require('../../src/services/wonderService');
  let modal = '';
  const view = { cityId: 'c1', name: 'Memphis', level: 3, maxLevel: 100, owner: { name: 'Ana' }, alliance: null, mine: true, stock: { wood: 0, stone: 0, iron: 0, food: 0 }, next: { level: 4, cost: W.levelCost(4), seconds: W.levelSeconds(4), needsPlan: false }, hasPlan: false };
  const ctx = makeContext(view, { openSheetModal: (title, html) => { modal = html; }, formatDuration: () => '1 h', showToast() {} });
  vm.runInContext(pick(src('09i-world.js'), ['openWonderPanel']), ctx);
  await ctx.openWonderPanel('c1');
  assert.match(modal, /L'armée est le vrai moyen de ravitailler la Merveille/);
  assert.match(modal, /armée de transport vers la Ville Merveille \(Marché › Envoyer\)/);
  assert.match(modal, /sans plafond/);
  assert.doesNotMatch(modal, /convois/);
  assert.match(modal, new RegExp(`/ ${W.levelCost(4).wood}`));   // coût du niveau suivant, à moitié prix depuis le 31 octobre 2026
});
