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
  assert.match(out, /Bastion \(1\.8 × mur 20\) \| 36\s000 \|/);   // mur bouclier : 1,8 fois un mur 20, 36 000 PV (décision du 2 novembre 2026 (deuxième simulation de 200 jours), G2 ; 3 fois avant)
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
// (1er novembre 2026, simulation de 200 jours), avec les nombres qui les jugent ; rien de manquant (undefined, NaN).
// Un jeu de mesures et d'événements écrit dans un dossier temporaire ; `tweak` change l'état, les relevés ou les événements.
function writeReport(tweak = (x) => x) {
  const fs = require('fs');
  const os = require('os');
  const report = require('../../tools/sim/report.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-report-'));
  const startMs = Date.parse('2027-01-04T08:00:00Z');
  const day = (d) => new Date(startMs + d * 86400000).toISOString();
  const lines = (list) => list.map(x => JSON.stringify(x)).join('\n') + '\n';
  const snap = (d) => ({
    at: day(d), day: d, step: d * 4, players: [{ name: 'A', faction: 'ROME', group: 'A', alliance: 'al1', population: 100, cities: 3, hall: 10, tech: 5, power: 1000, hero: 3, units: 1100, soldiers: 1000 }, { name: 'B', faction: 'GAUL', group: 'A', alliance: 'al1', population: 90, cities: 3, hall: 10, tech: 5, power: 900, hero: 3, units: 1100, soldiers: 1000 }], factions: { ROME: { n: 1, population: 100, power: 1000, cities: 3, hall: 10, tech: 5, levels: 50 } },
    week: { battles: [], trades: 2, rallies: [], bastionBreaks: [{ at: day(d), tag: 'LUP', by: 'A, B, C', camp: 'X, Y', ap: 900, dp: 600, won: true, players: 3, armies: 4 }] },
    world: { cities: 5, colonies: 3, wonderCities: 1, wonder: 12, bastions: [{ status: 'ACTIVE', n: 2 }], invasions: 1, hordesDestroyed: 1, hordesAlive: 0, bossFloor: 3, hordesBossByLevel: [{ level: 1, n: 2 }, { level: 4, n: 1 }], hordesDestroyedByLevel: [{ level: 1, n: 1 }], medals: 0 },
    map: { size: 420, foundable: { total: 6000, byLevel: { 1: 3000 } }, coloniesPerPlayer: { 2: 1 }, capitalsBySide: { N: 1 }, colonySiteLevels: { 2: 2 }, unguarded: { n: 0, of: 2, list: [] }, colonyArmies: { attached: 12, manned: 11, colonies: 2, players: 1, capitalArmies: 4, capitals: 1 }, colonyGuards: { n: 12, median: 229, target: 525, ratio: 0.44, under30: 3, under50: 6, empty: 1, share: 0.15 } },
    endgame: { bastions: [{ tag: 'LUP', status: 'ACTIVE', lives: 7, garrison: 9, soldiers: 4000, lastWonAt: day(d), pausedUntil: day(d + 1) }], rallies: [{ kind: 'BASTION', wait: 180, status: 'DONE', n: 3 }], wonders: [{ name: 'Merveille de A', tag: 'AQL', level: 12 }], plans: [{ tag: 'AQL', n: 1 }], sites: [{ kind: 'PLAN', n: 12, guarded: 12 }], alliances: [{ id: 'al1', tag: 'AQL' }] },
    totals: { quests: 10, hideout: { capital: { '15+': 1 } }, trainers: { GREAT_BARRACKS: { built: 2, of: 2, avg: 15, at20: 1 }, GREAT_STABLE: { built: 1, of: 2, avg: 8, at20: 0 } }, unitsByTier: { base: 600, intermediate: 300, elite: 100 } },
    ledger: { income: { treasury: 10, expeditions: 5, invasion: 196, carried: 30, other: 0 }, invasionFormula: 200, invasionCredited: 196, invasionCreditedFrom: null, measuredFrom: null, spent: { elite: 4, instantHeal: 1, spies: 0, talents: 0 }, goldNow: 210, expeditions: { done: 4, withGold: 2 }, invasionDestroyed: { L1: 1 } }
  });
  const ev = (d, kind, data) => ({ at: day(d), day: d, kind, ...data });
  // dans l'ordre des heures, comme le journal de sim.cjs (une heure qui recule : une reprise rejouée)
  const events = [
    ev(1, 'registered', { bot: 'A', group: 'A', asked: 'N', side: 'N' }),
    ev(50, 'bastion_rally', { alliance: 'AQL', leader: 'A', armies: 2, readyMembers: 2, engines: 700, soldiers: 500, wait: 180, chain: 1, gapH: 6.5, wallDamageEstimate: 60000, wallHp: 60000 }),
    ev(50, 'bastion_assault', { by: 'A, B', bastion: 'Bastion [LUP]', won: true, armies: 2, lives: '8/10', garrisonAfter: 9 }),
    ev(50, 'bastion_chain', { alliance: 'AQL', bastion: 'Bastion [LUP]', lives: '8/10', mode: 'vie' }),
    ev(51, 'bastion_assault', { by: 'A, B', bastion: 'Bastion [LUP]', won: true, armies: 2, lives: '7/10', garrisonAfter: 8 }),
    ev(52, 'bastion_break_sent', { bastion: 'LUP', mode: 'break', camps: 3, campPower: 600, group: 4, armies: 4, sorties: 1, sortie: false, power: 900, spreadS: 3, waitS: 420, missed: 0 }),
    ev(53, 'bastion_chain_end', { alliance: 'AQL', why: 'pause passée', mode: 'vie', rallies: 3, wins: 2, losses: 0, lowestLives: 7 }),
    ev(60, 'horde_destroyed', { level: 1, floor: 3, armies: 2 }),
    ev(61, 'wonder_site_beaten', { alliance: 'AQL', armies: 11 }),
    ev(61, 'wonder_found_sent', { bot: 'A', reserved: true, freedBy: 'AQL', hoursAfterBattle: 0.5 }),
    ev(62, 'wonder_city_founded', { alliance: 'AQL', owner: 'A', x: 4, y: 5, freedBy: 'AQL', sameAlliance: true }),
    ev(62, 'wonder_level', { alliance: 'AQL', level: 10 }),
    { ...ev(62, 'wonder_wave', { city: 'Merveille de A', level: 10, held: true, wallBroken: false, defenders: 500 }), at: day(62.2) },
    { ...ev(62, 'wonder_wave', { city: 'Merveille de A', level: 9, held: false, wallBroken: true, defenders: 200 }), at: day(62.7) },
    ev(63, 'market_summary', { fill: { cap: { food: 10, wood: 50 }, col: { food: 90, wood: 80 } }, counters: { accepted: 5, posted: 9, boughtVolume: 5000, paidVolume: 4800, loadFromOthers: 3000, receivedFromSeller: 3500, deliveredToSeller: 3400 } }),
    ev(63, 'wonder_summary', { wonders: [{ alliance: 'AQL', level: 12, stock: 1000 }], alliances: {}, world: { wavesHeld: 3 }, counters: { deliveries: 20, delivered: 200000, delivered_food: 50000, deliveredFromOthers: 120000, deliveredFoodFromOthers: 45000, foundWaitReserve: 2 } }),
    ev(63, 'military_summary', { counters: { guardsAttached: 12, guardDetached: 3, guardDetachNoSlot: 1, guardDisbandedEmpty: 2 } }),
    ev(63, 'war_summary', { counters: { bastionBreak_won: 1, bastionBreakGroup_won: 1, breakSyncWaitS: 420, chainRestart: 0 } }),
    ev(63, 'invasion_summary', { world: { floorsL1: 3, destroyedL1: 1, treasureGold: 200 }, bots: { launched: 4 } })
  ];
  const state = { startMs, opt: { stepHours: 6 }, bots: [{ name: 'A', mem: { mkt: { taxPct: 12 }, al: { supplied: 9000, suppliedFromOthers: 6000, garrisons: 2, garrisonSoldiers: 3000 } } }], calls: { total: 1, byRoute: {}, fails: [], refusals: {} }, errors: [] };
  const data = tweak({ state, metrics: [snap(7), snap(63)], events, day, ev }) || { state, metrics: [snap(7), snap(63)], events };
  const files = { state: path.join(dir, 'state.json'), metrics: path.join(dir, 'metrics.jsonl'), events: path.join(dir, 'events.jsonl'), report: path.join(dir, 'RAPPORT.md') };
  fs.writeFileSync(files.state, JSON.stringify(data.state));
  fs.writeFileSync(files.metrics, lines(data.metrics));
  fs.writeFileSync(files.events, lines(data.events));
  try {
    report.write(files, null);
    return fs.readFileSync(files.report, 'utf8');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('sim report: one section per decision D1-D19 and E1-E6, with the numbers that judge E1-E6', () => {
  const out = writeReport();
  for (let i = 1; i <= 19; i++) assert.match(out, new RegExp(`^### D${i}\\. `, 'm'), `section D${i}`);
  for (let i = 1; i <= 6; i++) assert.match(out, new RegExp(`^### E${i}\\. `, 'm'), `section E${i}`);
  assert.doesNotMatch(out, /undefined|NaN|\[object Object\]/);
  assert.match(out, /marché 3\s000 ; Merveille 120\s000 \(dont céréales 45\s000\) ; ravitaillement du Bastion 6\s000 sur 9\s000/);   // E1
  assert.match(out, /12 armées rattachées à une colonie \(11 avec des soldats\)/);   // E2
  assert.match(out, /pause passée 1/);   // E3
  assert.match(out, /\| Bastion \[LUP\] \| 2 \| 2 \| 0 \| 7 \| 7 \|/);   // assauts, gagnés, vies revenues, vies les plus basses, vies à la fin
  assert.match(out, /à plusieurs armées 2, camp brisé 2/);   // E4 : un combat de groupe dans chacun des deux relevés
  assert.match(out, /armées d'un rassemblement qui bat le chef \(médiane, une par joueur\) : niveau 1 2/);   // E5
  assert.match(out, /dont 1 pendant la réservation de leur alliance/);   // E6
  assert.match(out, /AQL jour 62, site qu'elle a libéré/);
  assert.match(out, /4\s800 payées/);
});

// Analyse de la simulation du 2 novembre 2026 : deux lignes mal nommées (D8 : la taxe de la dernière offre de chaque vendeur
// donnée pour la taxe des échanges ; D17 : la formule donnée pour l'or reçu), colonies comptées avec les Villes Merveille, et
// les nombres des questions ouvertes (Bastion rapporté à l'alliance, vagues, plans, chefs par niveau 1 à 5, or par source,
// gardes des colonies)
test('sim report: D8 and D17 say what they measure, and the open questions get their numbers', () => {
  const out = writeReport();
  assert.doesNotMatch(out, /undefined|NaN|\[object Object\]/);
  // D8 : 1 − 3 500 / 5 000 côté acheteurs, 1 − 3 400 / 4 800 côté vendeurs ; sans compteur de publication, la taxe de la
  // dernière offre de chaque vendeur, dite comme telle
  assert.match(out, /Taxe prise sur les échanges conclus, pondérée par les volumes : 30,0 % côté acheteurs \(reçu 3\s500 sur 5\s000 vendus\), 29,2 % côté vendeurs/);
  assert.match(out, /Taxe de la dernière offre publiée par chaque vendeur \(pas celle des échanges conclus\) : médiane 12 %/);
  assert.doesNotMatch(out, /Taxe vue par les vendeurs à la publication/);
  // D17 : la formule à part de l'or versé
  assert.match(out, /Trésor des donjons détruits \(formule du niveau, avant partage\) : 200 or ; 196 or versé aux joueurs \(parts selon les dégâts, arrondies à l'or près, 98 % de la formule\)/);
  assert.doesNotMatch(out, /reçu par les joueurs/);
  // D4 : or par source, camps d'or compris
  assert.match(out, /\| Trésor des donjons \| Camps d'or et récoltes \| Autres sources \|/);
  assert.match(out, /trésor des donjons versé 196 \([^)]*\), camps d'or et récoltes 30/);
  // D1, E2, D18 : 2 colonies sans la Ville Merveille ; taille des gardes
  assert.match(out, /colonies debout : 2 \(gisements : niveau 2 2\) ; Villes Merveille : 1/);
  assert.match(out, /dans 2 colonies sur 2 \(sans les Villes Merveille\)/);
  assert.match(out, /soldats d'une garde \(médiane\) 229 pour une part visée de 525 \(15 % des soldats du joueur, médiane\) ; garde \/ part visée \(médiane\) 44 % ; 3 sous 30 % de leur part, 6 sous 50 %, 1 vides/);
  assert.match(out, /gardes vides dissoutes sur place 2/);
  // D9 : un rassemblement de 2 armées pour 2 membres, 500 soldats sur 2 000
  assert.match(out, /\| AQL \| 2 \| 1 \| 2 \| 2 \| 100 % \| 500 \| 25 % \| 2 \| 2 \|/);
  // D11 : vagues tenues et perdues, défenseurs postés sur les soldats de l'alliance, plans
  assert.match(out, /Vagues d'Immortels : 2, tenues 1, perdues 1 \(niveaux perdus 1, un par vague perdue\) ; défenseurs postés \(médiane\) 500, part des soldats de l'alliance \(médiane\) 25 %/);
  assert.match(out, /\| AQL \| 2 \| 1 \| 1 \| 500 \| 25 % \| 10 \| 62 \|/);
  assert.match(out, /Plans : pris 0 \(détenus à la fin : AQL 1 ; sur la carte : 12\)/);
  // D10 : le premier jour de chaque palier, une fois
  assert.match(out, /Premier jour de chaque palier : AQL 10 \(j62\)/);
  // E5 : les chefs des niveaux 1 à 5, même sans combat
  for (const l of [1, 2, 3, 4, 5]) assert.match(out, new RegExp(`^\\| ${l} \\| \\d+ \\| \\d+ \\| \\d+ \\| \\d+ \\| [^|]+ \\| \\d+ \\|$`, 'm'), `chefs du niveau ${l}`);
  assert.match(out, /^\| 4 \| 1 \| 0 \| 0 \| 0 \| — \| 0 \|$/m);
});

// Décisions du 2 novembre 2026 (deuxième simulation de 200 jours) : une section G2 à G12 avec les nombres qui la jugent
// (mur du Bastion et sa réparation, combats au moteur, butin des raids, vagues à 24 h, plans, donjons, échanges, défenseurs
// contre la réserve, camps d'or, trésor sans place)
test('sim report: one section per decision G2-G12, with the numbers that judge them', () => {
  const out = writeReport((x) => {
    const { ev, day } = x;
    const h = (d, hours) => new Date(Date.parse(day(d)) + hours * 3600000).toISOString();
    x.events.push(
      // G2 : un assaut repoussé laisse le mur à 15 000 PV (plein 12 h plus tard) ; le suivant, 6 h après, le trouve réparé à
      // moitié (25 500) et le fait tomber
      { ...ev(70, 'bastion_assault', { bastionId: 'eb', bastion: 'Bastion [LUP]', by: 'A, B', won: false, armies: 13, attackers: 40000, attackerLossRate: 1, wallHpStart: 36000, wallHpEnd: 15000, wallMaxHp: 36000, wallFullAt: h(70, 12), wallDamage: 21000, lives: '10/10', chain: 0, chainMode: null, assaultAt: h(70, 0) }), at: h(70, 0) },
      { ...ev(70, 'bastion_chain', { alliance: 'AQL', bastion: 'Bastion [LUP]', lives: '10/10', mode: 'mur', wallHp: 15000, wallMaxHp: 36000 }), at: h(70, 0) },
      { ...ev(70, 'bastion_rally', { alliance: 'AQL', leader: 'A', armies: 12, readyMembers: 12, engines: 700, soldiers: 30000, wait: 30, chain: 1, mode: 'mur', gapH: 6, wallDamageEstimate: 30000, wallHp: 36000, wallNow: 25500 }), at: h(70, 2) },
      { ...ev(70, 'bastion_assault', { bastionId: 'eb', bastion: 'Bastion [LUP]', by: 'A, B', won: true, armies: 12, attackers: 30000, attackerLossRate: 0.4, wallHpStart: 25500, wallHpEnd: 0, wallMaxHp: 36000, wallFullAt: h(70, 18), wallDamage: 25500, lives: '9/10', chain: 1, chainMode: 'mur', assaultAt: h(70, 6) }), at: h(70, 6) },
      { ...ev(70, 'bastion_chain_end', { alliance: 'AQL', why: 'assauts repoussés', mode: 'mur', rallies: 1, wins: 1, losses: 1, lowestLives: 9, lowestWall: 0 }), at: h(70, 7) },
      // G6 : deux vagues à 24 h d'écart sur la même Ville Merveille
      { ...ev(71, 'wonder_wave', { cityId: 'w1', city: 'Merveille de A', alliance: 'AQL', level: 12, held: true, defenders: 600, posted: 5000, wave: 4000, ratio: 1.25, postedShare: 0.3, waveAt: h(71, 0) }), at: h(71, 0) },
      { ...ev(72, 'wonder_wave', { cityId: 'w1', city: 'Merveille de A', alliance: 'AQL', level: 13, held: true, defenders: 600, posted: 5000, wave: 4200, ratio: 1.19, postedShare: 0.3, waveAt: h(72, 0) }), at: h(72, 0) },
      // G7 : deux rassemblements de plan, un repoussé, un plan pris
      ev(73, 'wonder_rally', { alliance: 'AQL', target: 'PLAN', leader: 'A', armies: 14, power: 8000000, immortals: 5750000 }),
      ev(73, 'wonder_rally_repelled', { alliance: 'AQL', target: 'PLAN', margin: 1.1 }),
      ev(74, 'wonder_rally', { alliance: 'AQL', target: 'PLAN', leader: 'A', armies: 16, power: 9200000, immortals: 5750000 }),
      ev(74, 'wonder_plan_taken', { alliance: 'AQL', armies: 16 })
    );
    const last = x.metrics[x.metrics.length - 1];
    last.week.combat = [{ t: 'RAID', won: true, n: 10, al: 0.1, dl: 0.3, rounds: 2 }, { t: 'RAID', won: false, n: 2, al: 0.3, dl: 0.12, rounds: 2 }, { t: 'TRIBE', won: true, n: 40, al: 0.05, dl: 1, rounds: 4 }];
    last.week.goldCamps = [{ result: 'WIN', n: 12 }, { result: 'LOSE', n: 2 }];
    last.defense = { capital: { n: 38, defended: 30, reserve: 20000, defending: 40000, medianDefending: 900 }, colony: { n: 76, defended: 70, reserve: 0, defending: 15000, medianDefending: 200 }, defenseArmies: 30, defenseSoldiers: 9000, reserveShare: 0.2 };
    last.ledger.treasure = { shares: 10, given: 80000, lost: 20000, lostShares: 4, overflowAp: 20, overflowShares: 4, capped: 1, unconverted: 500, shareAp: 300, from: null };
    last.endgame.bastions[0] = { ...last.endgame.bastions[0], wallHp: 20000, wallMaxHp: 36000, wallFullAt: h(63, 5) };
    const mil = x.events.find(e => e.kind === 'military_summary');
    mil.counters = { ...mil.counters, guardSwaps: 5, guardSwapSoldiers: 300, guardTopUps: 6, guardSwapRefused: 1, guardSwapGaveUp: 0, guardCourierDisbanded: 5, defenseCreated: 30, defenseFills: 40, defenseSoldiers: 9000, defenseNoSlot: 2, defenseWaitSoldiers: 1, goldCampRaids: 12, goldCampExpected: 600, goldCampGold: 500 };
    const war = x.events.find(e => e.kind === 'war_summary');
    war.counters = { ...war.counters, raidsWonCounted: 10, raidLoot: 50000, raidCarry: 60000, raidCarryCapped: 7, raidStockCapped: 3, raidStockBefore: 400000, raidSheltered: 120000, raids: 12, raidLootEst: 55000, RAID_won: 10, RAID_lost: 2, raidNoDefender: 6, chainWornWall: 2 };
    x.state.calls.byRoute['POST /api/army/:id/exchange'] = { 200: 5, 400: 1 };
    x.state.calls.refusals['POST /api/army/:id/exchange -> 400 Les deux armées doivent se trouver au même endroit'] = 1;
    return x;
  });
  for (let i = 2; i <= 12; i++) assert.match(out, new RegExp(`^### G${i}\\. `, 'm'), `section G${i}`);
  assert.doesNotMatch(out, /undefined|NaN|\[object Object\]/);
  // G2 : mur avant et après chaque assaut, réparation lue d'un assaut au suivant, chaînes d'usure, murs à la fin
  assert.match(out, /Assauts : 4 \(gagnés 3\) ; mur plein au début 1 \(gagnés 0, 0 %\), mur usé au début 1 \(gagnés 1, 100 %\)\. Mur au plus : 36\s000 PV\./);
  assert.match(out, /Réparation : 1 assauts suivis d'un autre sur le même Bastion ; 1 tombés avant la fin de la réparation du précédent \(écart médian 6,0 h, mur trouvé \(médiane\) 25\s500 PV\) ; écart entre le mur trouvé et la réparation en ligne droite \(médiane des écarts absolus\) 0 PV\./);
  assert.match(out, /Chaînes d'assauts : 2 commencées \(vie 1, mur 1 ; /);
  assert.match(out, /2 finies \(pause passée 1, assauts repoussés 1\) ; rassemblements contre un mur usé 2, dont chaînes d'usure 1 ; mur le plus bas d'une chaîne \(médiane\) 0 PV/);
  assert.match(out, /Murs à la fin : LUP ACTIVE 20\s000 \/ 36\s000 PV, plein le 2027-03-08 /);
  assert.match(out, /^\| 70 \| Bastion \[LUP\] \| 12 \| oui \| 6,0 \| 15\s000 \| 25\s500 \| 25\s500 \| 0 \| 9\/10 \|$/m);
  // G3 : combats par type au moteur de bataille
  assert.match(out, /^\| RAID \| gagné \| 10 \| 10 % \| 30 % \| 2,0 \|$/m);
  assert.match(out, /^\| TRIBE \| gagné \| 40 \| 5 % \| 100 % \| 4,0 \|$/m);
  // G4 : butin contre charge des survivants et stock des villes
  assert.match(out, /Raids gagnés lus : 10 ; butin 50\s000 \(par raid, moyenne 5\s000\) ; charge des survivants \(sans bonus de transport\) 60\s000, butin \/ charge 83 %/);
  assert.match(out, /la charge 7 raids, la ville \(moitié de ce qui dépasse la cachette\) 3 raids\. Stock des villes pillées avant le raid 400\s000, butin \/ stock 13 %, à l'abri dans la cachette 30 %/);
  // G5 : pertes d'un assaut repoussé
  assert.match(out, /Assauts repoussés : 1, part des assaillants tombés \(médiane\) 100 %, soldats engagés \(médiane\) 40\s000 ; assauts gagnés : 3, pertes \(médiane\) 40 %/);
  // G6 : écart entre deux vagues
  assert.match(out, /Vagues : 4, tenues 3, perdues 1\./);
  assert.match(out, /^\| AQL \| 2 \| 2 \| 0 \| 24,0 \| 1,00 \| 30 % \| 1,25 \|$/m);
  // G7 : plans tentés et pris
  assert.match(out, /Plans tentés \(rassemblements\) : 2 \(AQL 2\), repoussés 1, pris 1 : 50 % des rassemblements ; puissance du rassemblement \/ Immortels \(médiane\) 1,60, armées \(médiane\) 16\. Sites : rassemblements 0, libérés 1\./);
  // G8 : chefs par niveau, joueurs d'un rassemblement
  assert.match(out, /^\| 1 \| 1 \| 1 \| 0 \| 2 \| — \|$/m);
  // G9 : échanges vers les gardes des colonies
  assert.match(out, /Gardes des colonies regarnies par échange : 5 échanges, 300 soldats donnés \(demandés 6, refusés 1, abandonnés après trois refus 0\) ; armées vidées par l'échange puis dissoutes à la capitale 5\./);
  assert.match(out, /Appels POST \/api\/army\/:id\/exchange : 6, refus du serveur 1\. Relèves d'avant \(nouvelle garde, l'ancienne rentre\) : 0 ; renvois à la capitale 3, sans place 1\./);
  // G10 : défenseurs contre la réserve, armées « Défense »
  assert.match(out, /capitales défendues par une armée 30 sur 38, colonies 70 sur 76 ; soldats qui défendent \(capitales\) 40\s000, en réserve 20\s000 ; part des soldats d'un joueur en réserve \(médiane\) 20 % ; armées « Défense » 30 \(9\s000 soldats\)/);
  assert.match(out, /Raids qui n'ont trouvé aucune armée dans la ville : 6 gagnés, 0 perdus/);
  assert.match(out, /Armées « Défense » \(joueurs automatiques\) : 30 formées, 40 fois regarnies \(9\s000 soldats pris dans la réserve\), 2 fois sans place à la capitale, 1 fois sans soldats/);
  // G11 : camps d'or, or par joueur et par jour
  assert.match(out, /Attaques de camps d'or \(rapports de bataille\) : 14 \(gagnées 12, perdues 2\) ; envois des joueurs automatiques 12, or vu dans le camp au départ 600, or vu rapporté 500/);
  assert.match(out, /Or rapporté par les armées \(mesuré aux étapes du tick\) : 30, soit 0,48 or par joueur et par jour ; toutes sources : 3,8 or par joueur et par jour/);
  // G12 : parts du trésor, points d'alliance pour ce qui n'a pas tenu
  assert.match(out, /Parts du trésor : 10 \(points d'alliance de la part : 300\) ; ressources données 80\s000, sans place dans aucune ville 20\s000 \(25 %, 4 parts\)/);
  assert.match(out, /Points d'alliance donnés pour ce qui n'a pas tenu : 20 \(4 parts ; plafonnés à 2 fois ceux de la part 1 fois\) ; ressources vraiment perdues \(moins de 1\s000, ou au-delà du plafond\) 500 \(1 % du trésor\)/);
  // sans relevé ni événement d'après le 2 novembre 2026 : les sections disent ce qui manque, sans valeur absente
  const old = writeReport();
  assert.match(old, /Aucun combat relevé \(relevés d'avant le 2 novembre 2026\)/);
  assert.match(old, /Pas de relevé des défenseurs \(relevés d'avant le 2 novembre 2026\)/);
  assert.match(old, /Aucune part du trésor lue/);
  assert.doesNotMatch(old, /undefined|NaN|\[object Object\]/);
});

// G2 : le mur qu'un assaut trouve, prévu depuis le précédent (ses PV laissés, réparés en ligne droite jusqu'au plein)
test('sim report: the wall the next assault finds follows the straight-line repair of the previous one (G2)', () => {
  const { repairedWall } = require('../../tools/sim/report.cjs');
  const prev = { assaultAt: '2027-03-01T00:00:00Z', wallHpEnd: 15000, wallMaxHp: 36000, wallFullAt: '2027-03-01T12:00:00Z' };
  assert.equal(repairedWall(prev, { assaultAt: '2027-03-01T06:00:00Z' }), 25500);
  assert.equal(repairedWall(prev, { assaultAt: '2027-03-01T13:00:00Z' }), 36000, 'plein après 12 h');
  assert.equal(repairedWall({ ...prev, wallFullAt: null }, { assaultAt: '2027-03-01T06:00:00Z' }), 36000, 'sans heure de fin : plein');
  assert.equal(repairedWall({ assaultAt: '2027-03-01T00:00:00Z' }, { assaultAt: '2027-03-01T06:00:00Z' }), null, 'rapport d\'avant le 2 novembre 2026 : pas de mur');
});

// G12 : la part d'un joueur dans le trésor d'un donjon, lue dans le texte même que le serveur lui écrit (hordeService)
test('sim ledger: a treasure share is read from the notification the server writes (G12)', () => {
  const Ledger = require('../../tools/sim/ledger.cjs');
  const H = require('../../src/services/hordeService');
  const head = (n) => `Le donjon de niveau 3 en (10, 12) est tombé. Votre part du trésor (25 % des dégâts) : 120 or, 30 points d'alliance et ${n.toLocaleString('fr-FR')} de chaque ressource, rangées dans votre capitale puis dans vos autres villes`;
  const lost = { wood: 5000, stone: 5000, iron: 4999, food: 0 };
  assert.deepEqual(Ledger.parseTreasureNote(`${head(12500)}${H.treasureLostNote(lost, 14)}.`), { ap: 30, gain: 12500, lost: 14999, overflowAp: 14, capped: false });
  assert.deepEqual(Ledger.parseTreasureNote(`${head(12500)}${H.treasureLostNote(lost, 10)}.`), { ap: 30, gain: 12500, lost: 14999, overflowAp: 10, capped: true });
  assert.deepEqual(Ledger.parseTreasureNote(`${head(800)}${H.treasureLostNote({ wood: 400 }, 0)}.`), { ap: 30, gain: 800, lost: 400, overflowAp: 0, capped: false });
  assert.deepEqual(Ledger.parseTreasureNote(`${head(800)}.`), { ap: 30, gain: 800, lost: 0, overflowAp: 0, capped: false }, 'tout a tenu');
  assert.equal(Ledger.parseTreasureNote('Votre héros trouve un objet.'), null);
});

test('sim report: publication tax from the bot counters when they exist', () => {
  const out = writeReport((x) => { x.events.find(e => e.kind === 'market_summary').counters = { ...x.events.find(e => e.kind === 'market_summary').counters, taxSum: 105, taxN: 10, tax_5: 5, tax_16: 5 }; return x; });
  assert.match(out, /Taxe à la publication des offres : moyenne 10,5 % sur 10 offres \(de 5 à 16 % ; offres par taxe : 5 % 5, 16 % 5\)/);
  assert.doesNotMatch(out, /Taxe de la dernière offre publiée/);
});

// Reprise sur une base en avance (sim-e, jour 156 : la partie reprise relit les rapports déjà lus, l'heure des événements
// recule) : chaque assaut, vague et Ville Merveille ne compte qu'une fois ; le bandeau de mise à jour de Prisma n'est pas une
// erreur du serveur
test('sim report: events re-read after a resume count once, and the Prisma banner is not a server error', () => {
  const out = writeReport((x) => {
    const at = (iso, kind, data) => ({ at: iso, day: 63, kind, ...data });
    const assault = { by: 'A, B', bastion: 'Bastion [LUP]', won: false, armies: 2, lives: '7/10', garrisonAfter: 9, defenders: 8118 };
    const wave = { city: 'Merveille de A', held: false, wallBroken: true, defenders: 1131 };
    x.events.push(
      at('2027-03-08T08:05:24.000Z', 'bastion_assault', assault),
      at('2027-03-08T08:05:30.000Z', 'wonder_wave', { ...wave, level: 20 }),
      // la reprise repart de 24 h plus tôt et relit
      at('2027-03-07T14:04:47.000Z', 'bastion_assault', assault),
      at('2027-03-07T14:04:50.000Z', 'wonder_city_founded', { alliance: 'AQL', owner: 'A', x: 4, y: 5, freedBy: null, sameAlliance: null }),
      at('2027-03-07T14:04:50.000Z', 'wonder_wave', { ...wave, level: 21 }),
      at('2027-03-08T08:08:09.000Z', 'bastion_assault', assault),   // la 1re lecture après avoir rattrapé l'heure relit encore
      at('2027-03-08T09:00:00.000Z', 'bastion_rally', { alliance: 'AQL', leader: 'A', armies: 2, soldiers: 500, wait: 180 })
    );
    x.state.errors = [{ key: '┌──┐ │ Update available N.N.N -> N.N.N-rc.N │', count: 1, first: '2027-03-07T08:11:24.000Z', sample: '┌──┐\n│ Update available 5.22.0 -> 8.0.0-rc.29 │\n└──┘' }];
    return x;
  });
  assert.doesNotMatch(out, /undefined|NaN|\[object Object\]/);
  assert.match(out, /Reprises : l'heure des événements recule 1 fois \(reprise d'un état plus ancien que la base : des heures rejouées\) ; 4 événements relus écartés des comptes/);
  assert.match(out, /Assauts livrés : 3, gagnés 2/);
  assert.match(out, /Villes Merveille fondées : 1 \(/);
  assert.match(out, /Vagues d'Immortels : 3, tenues 1, perdues 2/);
  assert.match(out, /erreurs écrites par le serveur : \*\*0\*\*/);
  assert.doesNotMatch(out, /Update available/);
  // le bandeau seul n'est pas une erreur ; une vraie erreur écrite avec lui reste comptée
  const { isNoise } = require('../../tools/sim/report.cjs');
  const banner = '┌──────────┐\n│  Update available 5.22.0 -> 8.0.0-rc.29  │\n│  Run the following to update  │\n└──────────┘';
  assert.equal(isNoise(banner), true);
  assert.equal(isNoise(`${banner}\nError: P3009 migrate found failed migrations`), false);
  assert.equal(isNoise('[TICK] gold error: boom'), false);
  // dans le rapport, le texte entier décide : une vraie erreur écrite après le bandeau (sa clé : les deux premières lignes du
  // bandeau) reste comptée
  const withError = writeReport((x) => {
    x.state.errors = [{ key: '┌──┐ │ Update available N.N.N -> N.N.N-rc.N │', count: 1, first: '2027-03-07T08:11:24.000Z', sample: `${banner}\nError: P3009 migrate found failed migrations` }];
    return x;
  });
  assert.match(withError, /erreurs écrites par le serveur : \*\*1\*\*/);
});

// Depuis le 2 novembre 2026, l'heure ne recule plus à la reprise (horloge recalée) ; les événements écrits après la dernière
// sauvegarde (linesAfterSave de l'événement « resume ») que la partie reprise écrit une 2e fois pendant le pas qui suit ne
// comptent qu'une fois ; un événement nouveau, ou écrit plus tard, compte
test('sim report: events written again after a resume count once, the clock never going back', () => {
  const { dropReplays } = require('../../tools/sim/report.cjs');
  const e = (at, kind, data = {}) => ({ at, day: 156, kind, ...data });
  const lostWave = { city: 'Merveille de A', held: false, defenders: 1131 };
  const list = [
    e('2027-06-10T08:00:30.000Z', 'violation', { check: 'x', count: 1 }),   // avant la dernière sauvegarde
    e('2027-06-10T08:05:00.000Z', 'wonder_wave', lostWave),                 // après elle : perdus pour la mémoire des joueurs
    e('2027-06-10T08:05:10.000Z', 'violation', { check: 'x', count: 1 }),
    e('2027-06-10T08:05:31.000Z', 'resume', { savedStep: 628, step: 628, resynced: true, gapH: 0.1, linesAfterSave: 2 }),
    e('2027-06-10T14:04:00.000Z', 'wonder_wave', { ...lostWave, level: 20 }),   // écrite une 2e fois (le niveau relu change)
    e('2027-06-10T14:04:01.000Z', 'violation', { check: 'x', count: 1 }),        // une seule perdue : celle-ci est écartée
    e('2027-06-10T14:04:02.000Z', 'violation', { check: 'x', count: 1 }),        // la suivante compte
    e('2027-06-10T14:05:00.000Z', 'wonder_wave', { ...lostWave, defenders: 900 }),
    e('2027-06-10T20:10:00.000Z', 'wonder_wave', lostWave)                       // après le pas qui suit la reprise : compte
  ];
  const r = dropReplays(list, 6 * 3600000);
  assert.equal(r.jumps, 0);
  assert.equal(r.dropped, 2);
  assert.deepEqual(r.events.map(x => x.at.slice(11, 19)), ['08:00:30', '08:05:00', '08:05:10', '08:05:31', '14:04:02', '14:05:00', '20:10:00']);
});

// Le niveau d'une vague : levelBefore ; sinon, avant le 2 novembre 2026, le niveau lu après la vague (+1 si perdue), et
// depuis, le niveau frappé (événement avec la puissance de la vague) tel quel
test('sim report: wave level bands read the level hit, old and new events alike', () => {
  const out = writeReport((x) => {
    x.events = x.events.filter(ev => ev.kind !== 'wonder_wave');
    x.events.push({ ...x.ev(62, 'wonder_wave', { city: 'Merveille de A', alliance: 'AQL', level: 19, held: false, defenders: 300, posted: 1000, wave: 4000, ratio: 0.25 }), at: x.day(62.8) });
    x.events.push({ ...x.ev(63, 'wonder_wave', { city: 'Merveille de A', level: 19, held: false, defenders: 300 }), at: x.day(63.1) });
    return x;
  });
  // la nouvelle : niveau 19 frappé (10-19) ; l'ancienne : niveau 19 lu après une vague perdue, frappée au niveau 20 (20-29)
  assert.match(out, /^\| 10-19 \| 1 \| 0 \| 1 \|/m);
  assert.match(out, /^\| 20-29 \| 1 \| 0 \| 1 \|/m);
});

// Reprise après un arrêt brutal (sim-e, jour 156 : état du pas 624 à 08:11, base au pas 628 à 08:05:30 le lendemain) :
// horloge, pas et dernier tick recalés sur la base, rien de rejoué ; un tick d'une heure déjà joué ne l'est pas deux fois
test('sim resume: a database ahead of the saved state is re-synced, never replayed', async () => {
  const Resume = require('../../tools/sim/resume.cjs');
  const startMs = Date.parse('2027-01-04T08:00:00Z'), stepMs = 6 * 3600000;
  const to = (step) => startMs + step * stepMs;
  const saved = { step: 624, simNow: Date.parse('2027-06-09T08:11:24Z') };
  assert.equal(to(624), Date.parse('2027-06-09T08:00:00Z'));
  // la base : dernier rapport de la partie tuée, 10/06 à 08:05:30 (une table absente est sautée)
  const rows = { BattleReport: '2027-06-10T08:05:30Z', Rally: '2027-06-09T20:05:31Z', City: '2027-05-05T20:00:00Z' };
  const prisma = { $queryRawUnsafe: async (sql) => { const t = sql.match(/FROM "(\w+)"/)[1]; if (t === 'SpyReport') throw new Error('relation absente'); return [{ t: rows[t] ? new Date(rows[t]) : null }]; } };
  const dbAt = await Resume.dbClock(prisma);
  assert.equal(new Date(dbAt).toISOString(), '2027-06-10T08:05:30.000Z');
  const plan = Resume.resync(saved, dbAt, { startMs, stepMs, subTicks: 6 });
  assert.equal(plan.ahead, true);
  assert.equal(plan.step, 628);   // les pas 625 à 628 ne sont pas rejoués
  assert.equal(plan.tickedTo, to(628));   // le tick de la fin du pas 628 a joué ; le suivant compte depuis lui
  assert.equal(new Date(plan.simNow).toISOString(), '2027-06-10T08:05:31.000Z');
  assert.equal(Math.round(plan.gapMs / 60000), Math.round((Date.parse('2027-06-10T08:05:30Z') - saved.simNow) / 60000));
  assert.match(Resume.describe(plan, saved), /la base a 23,9 h d'avance sur l'état enregistré \(pas 624\) ; horloge, pas \(628\) et dernier tick recalés sur la base, rien n'est rejoué/);
  // un tick d'une heure du pas suivant a joué (une arrivée à 10 h 00) : le pas 629 reprend après lui
  const sub = Resume.resync(saved, to(628) + 2 * 3600000 + 3000, { startMs, stepMs, subTicks: 6 });
  assert.equal(sub.step, 628);
  assert.equal(sub.tickedTo, to(628) + 2 * 3600000);
  // état enregistré après chaque tick : la base n'est pas en avance, rien ne change (dernier tick de l'état gardé)
  const fresh = { step: 628, simNow: to(628) + 400000, tickedTo: to(628) };
  assert.deepEqual(Resume.resync(fresh, to(628) + 330000, { startMs, stepMs, subTicks: 6 }), { ahead: false, gapMs: 0, step: 628, simNow: fresh.simNow, tickedTo: to(628) });
  // un état plus ancien sans tickedTo : le tick de la fin de son pas ; une base vide : rien à recaler
  assert.equal(Resume.resync({ step: 10, simNow: to(10) + 1000 }, null, { startMs, stepMs }).tickedTo, to(10));
});

// La boucle de sim.cjs, réduite à ce qui compte pour une reprise : le pas commencé, les ticks du pas (Resume.playTicks, le
// vrai code), les tours des joueurs, l'état enregistré (avant et après chaque tick, après chaque pas). Un processus tué à
// n'importe quel moment : la partie reprise depuis l'état enregistré ne rejoue aucun tick, et les heures de tous les ticks
// joués couvrent toute la partie, moins au plus celles du tick coupé.
async function simLoop({ disk, steps, dues, killAt }) {
  const Resume = require('../../tools/sim/resume.cjs');
  const H = 3600000, stepMs = 6 * H;
  const RUN = { step: disk.step, ticked: disk.ticked };
  let now = disk.simNow;
  const played = [];
  let cut = null;
  const kill = (where, hours = 0) => { if (killAt === where) { cut = { where, hours }; throw new Error('tué'); } };
  const save = () => { disk.step = RUN.step; disk.ticked = RUN.ticked; disk.simNow = now; disk.saves = (disk.saves || 0) + 1; };
  try {
    let step = RUN.step;
    while (step < steps) {
      step++; RUN.step = step;
      kill(`start ${step}`);
      const from = (step - 1) * stepMs, to = step * stepMs;
      await Resume.playTicks({
        from, to, fine: true, subTicks: 6, run: RUN, stopped: () => false, save,
        setClock: (ms) => { now = Math.max(now, ms); },
        nextDue: async (after, until) => { const d = dues.filter(t => t > after && t <= until); return d.length ? Math.min(...d) : null; },
        tick: async (hours) => { kill(`tick ${now / H}`, hours); played.push({ at: now, hours }); return 1; },
        afterSubTick: async () => { now += 60000; kill(`subtick ${step}`); }
      });
      now += 5 * 60000;   // les tours des joueurs : quelques minutes de l'horloge
      kill(`turns ${step}`);
      save();
    }
  } catch (e) { if (e.message !== 'tué') throw e; }
  return { played, cut };
}

test('sim resume: a kill at any point of a step loses at most that step and never replays a tick', async () => {
  const steps = 4;
  const H = 3600000;
  const dues = [7.5 * H, 10 * H, 20.2 * H];   // échéances : ticks d'une heure à 8 h et 10 h (pas 2), 21 h (pas 4)
  const whole = await simLoop({ disk: { step: 0, ticked: 0, simNow: 0 }, steps, dues });
  assert.deepEqual(whole.played.map(t => t.at / H), [6, 8, 10, 12, 18, 21, 24]);
  assert.equal(whole.played.reduce((t, x) => t + x.hours, 0), steps * 6);
  const kills = ['start 2', 'tick 8', 'subtick 2', 'tick 10', 'tick 12', 'turns 2', 'tick 21', 'turns 4'];
  for (const killAt of kills) {
    const disk = { step: 0, ticked: 0, simNow: 0 };
    const first = await simLoop({ disk, steps, dues, killAt });
    assert.ok(first.cut, `${killAt} : arrêt joué`);
    const second = await simLoop({ disk, steps, dues });   // reprise depuis l'état enregistré
    const all = [...first.played, ...second.played];
    const ats = all.map(t => t.at);
    assert.equal(new Set(ats).size, ats.length, `${killAt} : un tick rejoué (${ats.map(a => a / H)})`);
    if (killAt.startsWith('tick ')) assert.ok(!ats.includes(Number(killAt.slice(5)) * H), `${killAt} : le tick coupé est rejoué`);
    // les heures jouées couvrent la partie, moins celles du tick coupé et, s'il était dans le dernier pas, la fin de ce pas
    // (le pas commencé ne reprend pas) : au plus un pas perdu, aucune heure comptée deux fois
    const left = steps * 6 - disk.ticked / H;
    assert.equal(all.reduce((t, x) => t + x.hours, 0) + first.cut.hours + left, steps * 6, `${killAt} : heures`);
    assert.ok(first.cut.hours + left <= 6, `${killAt} : au plus un pas`);
    assert.equal(disk.step, steps, `${killAt} : la partie va au dernier pas`);
  }
});

test('sim resume: the journal gives its lines and the time of its last event', () => {
  const fs = require('fs');
  const os = require('os');
  const Resume = require('../../tools/sim/resume.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-journal-'));
  try {
    const f = path.join(dir, 'events.jsonl');
    assert.deepEqual(Resume.journal(f), { lines: 0, lastAt: null });   // pas encore de journal
    fs.writeFileSync(f, '{"at":"2027-06-10T08:00:00.000Z","kind":"a"}\n{"at":"2027-06-10T08:05:30.000Z","kind":"b"}\n');
    assert.deepEqual(Resume.journal(f), { lines: 2, lastAt: Date.parse('2027-06-10T08:05:30.000Z') });
    fs.appendFileSync(f, '{"at":"2027-06-10T08:0');   // dernière ligne coupée par l'arrêt : pas d'heure
    assert.deepEqual(Resume.journal(f), { lines: 2, lastAt: null });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sim resume: module read cursors survive a save and a reload (nothing re-read, nothing skipped)', () => {
  const Resume = require('../../tools/sim/resume.cjs');
  const H = 3600000, t0 = Date.parse('2027-06-09T08:00:00Z');
  const store = {};
  const a = Resume.cursor(store, 'wonder.waves', t0, 6 * H);
  assert.equal(a.since.getTime(), t0 - 6 * H);   // première lecture : un pas en arrière
  assert.equal(a.until.getTime(), t0);
  const b = Resume.cursor(store, 'wonder.waves', t0 + 6 * H, 6 * H);
  assert.equal(b.since.getTime(), t0);   // la suite exacte de la lecture d'avant
  // l'état enregistré puis relu (arrêt, reprise) : la lecture suivante repart d'où elle s'était arrêtée
  const reloaded = JSON.parse(JSON.stringify(store));
  const c = Resume.cursor(reloaded, 'wonder.waves', t0 + 9 * H, 6 * H);
  assert.equal(c.since.getTime(), t0 + 6 * H);
  assert.equal(c.until.getTime(), t0 + 9 * H);
});

// Relevé de l'or (tools/sim/ledger.cjs) : le trésor versé (parts selon les dégâts, arrondies à l'or près) à part de la
// formule ; l'or des étapes « armies » et « rallies » du tick moins le trésor versé : l'or rapporté par les armées
test('sim ledger: treasure paid apart from the formula, gold carried home measured at the tick', async () => {
  const ledger = require('../../tools/sim/ledger.cjs');
  const L = ledger.empty();
  let gold = 1000;
  const prisma = {
    player: { aggregate: async () => ({ _sum: { gold } }) },
    $queryRawUnsafe: async () => [{ h: 'h1', points: 2, total: 3 }, { h: 'h1', points: 1, total: 3 }]   // 2/3 et 1/3 des dégâts
  };
  await ledger.measureStep(prisma, L, 'armies', ['p1'], async () => { gold += 166 + 40; });   // trésor 166 + 40 rapportés d'un camp
  await ledger.measureStep(prisma, L, 'builds', ['p1'], async () => { gold += 999; });         // étape non mesurée
  assert.equal(L.tickArmies, 206);
  const paid = await ledger.treasureCredited(prisma, [{ id: 'h1', level: 1 }]);
  assert.equal(paid, Math.floor(ledger.treasureGold(1) * 2 / 3) + Math.floor(ledger.treasureGold(1) / 3));
  L.invasion.gold = ledger.treasureGold(1); L.invasion.credited = paid;
  const v = ledger.view(L, []);
  assert.equal(v.income.invasion, paid);
  assert.equal(v.invasionFormula, ledger.treasureGold(1));
  assert.equal(v.income.carried, 206 - paid);
  // un relevé d'avant ces mesures : elles commencent en cours de partie, le rapport ne les prend pas pour un total
  const old = { lastAt: null, gold0: 0, goldNow: 0, treasury: 0, expeditions: { gold: 0, done: 0, withGold: 0 }, invasion: { gold: 400, destroyed: {} }, seenExp: {} };
  await ledger.measureStep(prisma, old, 'rallies', ['p1'], async () => { gold += 10; });
  const ov = ledger.view(old, []);
  assert.equal(ov.income.invasion, 400);
  assert.equal(ov.income.carried, undefined);
  assert.ok(ov.measuredFrom && ov.invasionCreditedFrom);
});
