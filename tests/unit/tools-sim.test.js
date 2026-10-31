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
