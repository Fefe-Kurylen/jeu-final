require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // marketService crée le client Prisma, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

// Les outils de simulation (docs/EQUILIBRAGE.md § 6) tournent avec la config et le moteur actuels : pas de clé disparue
// (undefined, NaN) dans ce qu'ils impriment
const ROOT = path.join(__dirname, '..', '..');
function run(tool, ...args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', tool), ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${tool} : ${r.stderr}`);
  assert.doesNotMatch(r.stdout, /undefined|NaN/, `${tool} imprime une valeur manquante`);
  return r.stdout;
}

test('simulate-colonies: one engine for every tier, wall breach and Bastion figures', () => {
  const out = run('simulate-colonies.cjs');
  assert.match(out, /\| Ville Fortifiée \| niveau 20\+ \| [^|]+\| [^|]+\| 1 \|/);
  assert.match(out, /\| niveau 20 \| 20\s000 \| [^|]+\| 110 \/ 165 \/ 330 \|/);   // séparateur des milliers : espace fine
  assert.match(out, /Bastion \(3 × mur 20\) \| 60\s000 \|/);   // mur bouclier : 3 fois un mur 20 (décision du 31 octobre 2026)
  assert.match(out, /3\s000 soldats \+ 150 engins \| brèche round \d+, l'attaquant gagne/);
  // rôle des colonies (décisions des 30 et 31 octobre 2026) : spécialité du gisement lue dans les données, Mur sur l'enceinte,
  // anneau à la taille des bâtiments possibles (capitale 18, colonie 12), plafonds Bâtiment principal 20 et Mur de colonie 15
  const fx = require('../../src/utils/buildingEffects');
  const config = require('../../src/config');
  const signed = (v) => (v < 0 ? `−${-v}` : `\\+${v}`);
  for (const L of [1, 2, 3]) assert.match(out, new RegExp(`\\| niveau ${L} \\| ${signed(fx.colonyNodeBonusPct(L))} % / ${signed(fx.colonyOtherResourcesPct())} % \\|( [\\d\\s]+\\|){4} [\\d\\s]+ / [\\d\\s]+ \\|`));
  const RS = config.city.ringSlots;
  assert.match(out, new RegExp(`Capitale : ${RS.capital} bâtiments possibles dans ses ${RS.capital} emplacements \\(0 libre\\) ; colonie : ${RS.colony} dans ses ${RS.colony} emplacements \\(0 libre\\)`));
  assert.match(out, /Bâtiment principal 20 dans une colonie comme dans la capitale \(20\) ; .* Mur 15 dans une colonie \(20 dans la capitale\)/);
  assert.match(out, /Place du marché et Comptoir de commerce : dans la capitale seulement/);
  assert.doesNotMatch(out, /meilleur Comptoir/);
  // plus de marchands (décision du 31 octobre 2026) : taxe des échanges de base, puis avec le Comptoir 20 et la Chambre au
  // Trésor 20, lue par la fonction du serveur
  const { p2pTaxPctOf } = require('../../src/services/marketService');
  assert.match(out, new RegExp(`\\(${p2pTaxPctOf([])} % de base, ${p2pTaxPctOf([{ key: 'TRADE_OFFICE', level: 20 }, { key: 'TREASURE_CHAMBER', level: 20 }])} % avec le Comptoir 20 et la Chambre au Trésor 20\\)`));
  assert.match(out, /\(30 % de base, 5 % avec le Comptoir 20 et la Chambre au Trésor 20\)/);
  assert.doesNotMatch(out, /marchands? par niveau|charge d'un marchand|charge des marchands/);
});

test('simulate-factions: city attacks use the wall shield and the engines of each civilisation', () => {
  const out = run('simulate-factions.cjs', '5');
  assert.match(out, /Mur 10 en bouclier \(10000 PV, 12500 pour l'Égypte\)/);
  assert.match(out, /SULTAN attaque : ATT .* r4/);
  assert.match(out, /Sultanat : dégâts d'un engin au mur ×1\.25 : 15\.19 PV par round/);
  // cachette : part du stockage de la ville par niveau (décision du 31 octobre 2026, rapport de vérification), bonus de la
  // Gaule en multiplicateur (36 % au niveau 20)
  const fx = require('../../src/utils/buildingEffects');
  assert.match(out, new RegExp(`Gaule +: cachette L5/L10/L15/L20 : ${[5, 10, 15, 20].map(l => fx.hideoutPct(l, 'GAUL')).join('/')} % du stockage`));
  assert.match(out, /Gaule +: cachette L5\/L10\/L15\/L20 : 9\/18\/27\/36 % du stockage/);
});

test('simulate-tribes: gold camps fight with their +40 %', () => {
  const out = run('simulate-tribes.cjs', '--samples=30');
  assert.match(out, /Camp d'or : \+40 % au combat/);
  assert.match(out, /^ {2}or 3 \|/m);
});

test('simulate-research: the simulated game reaches Academy 20 and maxes every technology', () => {
  const out = run('simulate-research.cjs');
  assert.match(out, /Académie 20 au jour \d+\.\d ; toutes les technologies au maximum au jour \d+\.\d/);
});

// Rapport de la simulation longue (tools/sim/report.cjs) : une section par décision, D1 à D19 (31 octobre 2026) et E1 à E6
// (1er novembre 2026, simulation de 200 jours), avec les nombres qui les jugent ; rien de manquant (undefined, NaN)
test('sim report: one section per decision D1-D19 and E1-E6, with the numbers that judge E1-E6', () => {
  const fs = require('fs');
  const os = require('os');
  const report = require('../../tools/sim/report.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-report-'));
  const startMs = Date.parse('2027-01-04T08:00:00Z');
  const day = (d) => new Date(startMs + d * 86400000).toISOString();
  const lines = (list) => list.map(x => JSON.stringify(x)).join('\n') + '\n';
  const snap = (d) => ({
    at: day(d), day: d, step: d * 4, players: [{ name: 'A', faction: 'ROME', group: 'A', alliance: 'al1', population: 100, cities: 3, hall: 10, tech: 5, power: 1000, hero: 3 }], factions: { ROME: { n: 1, population: 100, power: 1000, cities: 3, hall: 10, tech: 5, levels: 50 } },
    week: { battles: [], trades: 2, rallies: [], bastionBreaks: [{ at: day(d), tag: 'LUP', by: 'A, B, C', camp: 'X, Y', ap: 900, dp: 600, won: true, players: 3, armies: 4 }] },
    world: { cities: 3, colonies: 2, wonder: 12, bastions: [{ status: 'ACTIVE', n: 2 }], invasions: 1, hordesDestroyed: 1, hordesAlive: 0, bossFloor: 3, hordesBossByLevel: [{ level: 1, n: 2 }], hordesDestroyedByLevel: [{ level: 1, n: 1 }], medals: 0 },
    map: { size: 420, foundable: { total: 6000, byLevel: { 1: 3000 } }, coloniesPerPlayer: { 2: 1 }, capitalsBySide: { N: 1 }, colonySiteLevels: { 2: 2 }, unguarded: { n: 0, of: 2, list: [] }, colonyArmies: { attached: 12, manned: 11, colonies: 2, players: 1, capitalArmies: 4, capitals: 1 } },
    endgame: { bastions: [{ tag: 'LUP', status: 'ACTIVE', lives: 7, garrison: 9, soldiers: 4000, lastWonAt: day(d), pausedUntil: day(d + 1) }], rallies: [{ kind: 'BASTION', wait: 180, status: 'DONE', n: 3 }], wonders: [{ tag: 'AQL', level: 12 }] },
    totals: { quests: 10, hideout: { capital: { '15+': 1 } }, trainers: { GREAT_BARRACKS: { built: 2, of: 2, avg: 15, at20: 1 }, GREAT_STABLE: { built: 1, of: 2, avg: 8, at20: 0 } }, unitsByTier: { base: 600, intermediate: 300, elite: 100 } },
    ledger: { income: { treasury: 10, expeditions: 5, invasion: 200, other: 0 }, spent: { elite: 4, instantHeal: 1, spies: 0, talents: 0 }, goldNow: 210, expeditions: { done: 4, withGold: 2 }, invasionDestroyed: { L1: 1 } }
  });
  const ev = (d, kind, data) => ({ at: day(d), day: d, kind, ...data });
  const events = [
    ev(1, 'registered', { bot: 'A', group: 'A', asked: 'N', side: 'N' }),
    ev(50, 'bastion_rally', { alliance: 'AQL', armies: 12, engines: 700, wait: 180, chain: 1, gapH: 6.5, wallDamageEstimate: 60000, wallHp: 60000 }),
    ev(50, 'bastion_assault', { by: 'A', bastion: 'Bastion [LUP]', won: true, armies: 12, lives: '8/10', garrisonAfter: 9 }),
    ev(51, 'bastion_assault', { by: 'A', bastion: 'Bastion [LUP]', won: true, armies: 11, lives: '7/10', garrisonAfter: 8 }),
    ev(50, 'bastion_chain', { alliance: 'AQL', bastion: 'Bastion [LUP]', lives: '8/10' }),
    ev(53, 'bastion_chain_end', { alliance: 'AQL', why: 'pause passée', rallies: 3, wins: 2, losses: 0, lowestLives: 7 }),
    ev(52, 'bastion_break_sent', { bastion: 'LUP', mode: 'break', camps: 3, campPower: 600, group: 4, armies: 4, sorties: 1, sortie: false, power: 900, spreadS: 3, waitS: 420, missed: 0 }),
    ev(60, 'horde_destroyed', { level: 1, floor: 3, armies: 2 }),
    ev(61, 'wonder_site_beaten', { alliance: 'AQL', armies: 11 }),
    ev(61, 'wonder_found_sent', { bot: 'A', reserved: true, freedBy: 'AQL', hoursAfterBattle: 0.5 }),
    ev(62, 'wonder_city_founded', { alliance: 'AQL', owner: 'A', freedBy: 'AQL', sameAlliance: true }),
    ev(63, 'market_summary', { fill: { cap: { food: 10, wood: 50 }, col: { food: 90, wood: 80 } }, counters: { accepted: 5, posted: 9, boughtVolume: 5000, paidVolume: 4800, loadFromOthers: 3000, receivedFromSeller: 3500, deliveredToSeller: 3400 } }),
    ev(63, 'wonder_summary', { wonders: [{ alliance: 'AQL', level: 12, stock: 1000 }], alliances: {}, world: { wavesHeld: 3 }, counters: { deliveries: 20, delivered: 200000, delivered_food: 50000, deliveredFromOthers: 120000, deliveredFoodFromOthers: 45000, foundWaitReserve: 2 } }),
    ev(63, 'military_summary', { counters: { guardsAttached: 12, guardDetached: 3, guardDetachNoSlot: 1 } }),
    ev(63, 'war_summary', { counters: { bastionBreak_won: 1, bastionBreakGroup_won: 1, breakSyncWaitS: 420, chainRestart: 0 } }),
    ev(63, 'invasion_summary', { world: { floorsL1: 3, destroyedL1: 1, treasureGold: 200 }, bots: { launched: 4 } })
  ];
  const state = { startMs, opt: { stepHours: 6 }, bots: [{ name: 'A', mem: { mkt: { taxPct: 12 }, al: { supplied: 9000, suppliedFromOthers: 6000, garrisons: 2, garrisonSoldiers: 3000 } } }], calls: { total: 1, byRoute: {}, fails: [], refusals: {} }, errors: [] };
  const files = { state: path.join(dir, 'state.json'), metrics: path.join(dir, 'metrics.jsonl'), events: path.join(dir, 'events.jsonl'), report: path.join(dir, 'RAPPORT.md') };
  fs.writeFileSync(files.state, JSON.stringify(state));
  fs.writeFileSync(files.metrics, lines([snap(7), snap(63)]));
  fs.writeFileSync(files.events, lines(events));
  try {
    report.write(files, null);
    const out = fs.readFileSync(files.report, 'utf8');
    for (let i = 1; i <= 19; i++) assert.match(out, new RegExp(`^### D${i}\\. `, 'm'), `section D${i}`);
    for (let i = 1; i <= 6; i++) assert.match(out, new RegExp(`^### E${i}\\. `, 'm'), `section E${i}`);
    assert.doesNotMatch(out, /undefined|NaN|\[object Object\]/);
    assert.match(out, /marché 3\s000 ; Merveille 120\s000 \(dont céréales 45\s000\) ; ravitaillement du Bastion 6\s000 sur 9\s000/);   // E1
    assert.match(out, /12 armées rattachées à une colonie \(11 avec des soldats\)/);   // E2
    assert.match(out, /pause passée 1/);   // E3
    assert.match(out, /\| Bastion \[LUP\] \| 2 \| 2 \| 0 \| 7 \|/);
    assert.match(out, /à plusieurs armées 2, camp brisé 2/);   // E4 : un combat de groupe dans chacun des deux relevés
    assert.match(out, /armées d'un rassemblement qui bat le chef \(médiane, une par joueur\) : niveau 1 2/);   // E5
    assert.match(out, /dont 1 pendant la réservation de leur alliance/);   // E6
    assert.match(out, /AQL jour 62, site qu'elle a libéré/);
    assert.match(out, /4\s800 payées/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
