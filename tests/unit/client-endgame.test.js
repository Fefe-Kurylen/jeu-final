require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // wonderService crée le client Prisma, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Fin de partie côté client (décisions du 31 octobre 2026, rapport de vérification) : panneaux du Bastion (garnison de 17
// armées au plus, mur et vies lus dans les règles du serveur, un assaut = un rassemblement ou une armée seule) et fiche de
// la Merveille (l'armée est le vrai moyen de la ravitailler). Le code du navigateur tourne dans un contexte vm.
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
const RULES = { cost: B.cost, buildDays: B.buildDays, cooldownDays: B.cooldownDays, bonuses: B.bonuses, assaults: B.assaults, regenHours: B.regenHours, maxDistance: B.maxDistanceFromMember, wallMultiplier: B.wallMultiplier, wallReferenceLevel: B.wallReferenceLevel, maxGarrisonArmies: B.maxGarrisonArmies };
function makeContext(state, extra = {}) {
  const ctx = {
    console, token: 't', player: { id: 'p1' }, currentCity: null, armies: [], cities: [],
    resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), chatSafeId: s => String(s), formatNum: n => String(n), formatTime: () => '',
    getUnitName: k => k, fetchJson: async () => state, ...extra
  };
  vm.createContext(ctx);
  vm.runInContext(pick(src('09g-bastion.js'), ['bastionState', 'loadBastion', 'BASTION_RES', 'bastionStatusLabel', 'bastionBonusesHtml', 'renderBastionSection', 'garrisonFullText', 'renderBastionMapPanel', 'openBastionSend']), ctx);
  return ctx;
}
const garrisonArmy = (i) => ({ id: `g${i}`, name: `Armée ${i}`, owner: { id: 'p2', name: 'Bo' }, status: 'STATIONED', units: [{ key: 'ROM_INF_MILICIEN', count: 10 }] });
const bastionView = (n) => ({ id: 'b1', status: 'ACTIVE', x: 4, y: 5, lives: 10, assaults: B.assaults, maxGarrisonArmies: B.maxGarrisonArmies, isSieged: false, garrison: Array.from({ length: n }, (_, i) => garrisonArmy(i)), delivered: {}, cost: B.cost });

test('onglet Alliance › Bastion : garnison « n / 17 armées », envoi impossible quand elle est complète', { skip }, async () => {
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
