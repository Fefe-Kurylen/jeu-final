require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // the processor module loads Prisma, never queried here
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const { resolveCombatDetailed } = require('../../src/services/combatService');
const { campEnd, wallHpNow } = require('../../src/game/processors/siegeProcessor');
const { unitsData } = require('../../src/config/gamedata');

const unit = (faction, cls, tier) => unitsData.find(u => u.faction === faction && u.class === cls && u.tier === tier);
const g = (u, n) => ({ unitKey: u.key, tier: u.tier, count: n });
const inf = unit('ROME', 'INFANTRY', 'intermediate'), eng = unit('ROME', 'SIEGE', 'siege');
const def = [g(unit('GAUL', 'INFANTRY', 'intermediate'), 600), g(unit('GAUL', 'ARCHER', 'intermediate'), 300)];
const wall = (level, share = 1) => ({ hp: level * config.combat.wallHpPerLevel * share, maxHp: level * config.combat.wallHpPerLevel });
const fight = (atk, level, share = 1, defenders = def) => resolveCombatDetailed(atk, defenders, level, 0, 'A', 'D', null, null, 'ROME', 'GAUL', 0, null, wall(level, share));
const breachRound = (r) => r.rounds.findIndex(x => x.wallHp === 0) + 1;

test('the camp lasts one hour before the battle', () => {
  const start = new Date('2026-10-25T12:00:00Z');
  assert.equal(campEnd(start) - start, config.combat.siege.campMinutes * 60000);
  assert.equal(config.combat.siege.campMinutes, 60);
});

test('behind a standing wall the defenders take nothing and the city holds', () => {
  const r = fight([g(inf, 1000), g(eng, 1)], 20);
  assert.equal(breachRound(r), 0);
  assert.equal(r.defenderTotalKilled, 0);
  assert.equal(r.attackerWon, false);
  assert.ok(r.wallHpEnd > 0);
});

test('only siege engines damage the wall (GDD onlySiegeEnginesDamageWall)', () => {
  const few = breachRound(fight([g(inf, 1000), g(eng, 1)], 10));
  const many = breachRound(fight([g(inf, 1000), g(eng, 100)], 10));
  assert.ok(many > 0 && (few === 0 || many < few), `${few} -> ${many}`);
  assert.equal(config.combat.siege.wallShield.soldierMult, 0);
  const soldiers = fight([g(inf, 5000)], 10);
  assert.equal(soldiers.rounds.reduce((t, r) => t + r.wallDamage, 0), 0);
  assert.equal(soldiers.wallHpEnd, soldiers.wallHpStart);
  assert.equal(soldiers.attackerWon, false);
});

test('a wall that lost lives has lost the same share of its hit points and falls sooner', () => {
  const full = breachRound(fight([g(inf, 1000), g(eng, 100)], 20, 1));
  const half = breachRound(fight([g(inf, 1000), g(eng, 100)], 20, 0.5));
  assert.ok(half > 0 && (full === 0 || half < full), `${full} -> ${half}`);
  assert.equal(wallHpNow({ buildings: [{ key: 'WALL', level: 20 }], wallMaxHp: 20000, wallStructure: 0.75 }), 15000);
  assert.equal(wallHpNow({ buildings: [], wallMaxHp: 20000, wallStructure: 1 }), 0);   // no Wall building: no shield
});

test('an empty city still has to be breached; a strong army takes it', () => {
  const blocked = fight([g(inf, 50), g(eng, 1)], 20, 1, []);
  assert.equal(blocked.attackerWon, false);
  const strong = fight([g(inf, 3000), g(eng, 200)], 20);
  assert.equal(strong.attackerWon, true);
  assert.equal(strong.wallHpEnd, 0);
});

test('a breach gives roundsAfterBreach more rounds: the attacker wins only if he really beats the defenders', () => {
  const extra = config.combat.siege.roundsAfterBreach;
  assert.equal(extra, 5);
  // 135 catapultes contre un mur 20 gaulois : 135 × 12,15 / 1,2 PV par round, le mur tombe au 15e round
  const weak = fight([g(inf, 2000), g(eng, 135)], 20);
  assert.equal(breachRound(weak), config.combat.maxRounds);
  assert.equal(weak.rounds.length, config.combat.maxRounds + extra);
  assert.equal(weak.attackerWon, false);
  assert.ok(weak.defenderLossRate < 1);
  const strong = fight([g(inf, 3000), g(eng, 135)], 20);
  assert.equal(breachRound(strong), config.combat.maxRounds);
  assert.ok(strong.rounds.length > config.combat.maxRounds);
  assert.equal(strong.attackerWon, true);
  assert.ok(strong.defenderLossRate > 0.9, `${strong.defenderLossRate}`);
  // sans la règle, la même brèche du dernier round donnait la victoire, garnison presque intacte
  const keep = config.combat.siege.roundsAfterBreach;
  config.combat.siege.roundsAfterBreach = 0;
  try {
    const old = fight([g(inf, 3000), g(eng, 135)], 20);
    assert.equal(old.rounds.length, config.combat.maxRounds);
    assert.ok(old.defenderLossRate < 0.5);
  } finally { config.combat.siege.roundsAfterBreach = keep; }
  // un mur tombé tôt ne rallonge pas le combat au-delà des 15 rounds
  const early = fight([g(inf, 3000), g(eng, 400)], 20);
  assert.ok(breachRound(early) > 0 && breachRound(early) + extra <= config.combat.maxRounds);
  assert.ok(early.rounds.length <= config.combat.maxRounds);
});

test('Sultan siege engines strike the wall 25 % harder (siegeEngineAttack); a Gallic wall takes 1/1.2 of the blows', () => {
  const sulEng = unit('SULTAN', 'SIEGE', 'siege'), egyEng = unit('EGYPT', 'SIEGE', 'siege');
  assert.equal(sulEng.stats.attack, egyEng.stats.attack);
  const firstHit = (engine, defFaction) => resolveCombatDetailed([g(engine, 20)], def, 20, 0, 'A', 'D', null, null, null, defFaction, 0, null, wall(20)).rounds[0].wallDamage;
  const plain = firstHit(egyEng, 'GREEK');
  assert.ok(plain > 0);
  assert.ok(Math.abs(firstHit(sulEng, 'GREEK') / plain - 1.25) < 0.01);
  assert.ok(Math.abs(plain / firstHit(egyEng, 'GAUL') - 1.2) < 0.01);
});
