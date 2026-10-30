// Héros (décision du 27 octobre 2026) : 0,1 % par point plafonné à 5 %, équipement plafonné à part, talents, chute
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const HE = require('../../src/utils/heroEffects');
const HS = require('../../src/services/heroService');
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('caractéristiques : +0,1 % par point, plafond +5 % atteint à 50 points', () => {
  assert.ok(near(HE.statPct({ attack: 5, atkPoints: 5 }, 'attack'), 0.01));
  assert.ok(near(HE.statPct({ attack: 5, atkPoints: 45 }, 'attack'), 0.05));
  assert.ok(near(HE.statPct({ attack: 5, atkPoints: 200 }, 'attack'), 0.05));
});

test('équipement : +0,5 % par point d\'objet, plafonné à +5 % à part', () => {
  const sword = { slot: 'weapon', stats: { attack: 4 } };
  assert.ok(near(HE.statPct({ attack: 0, items: [sword] }, 'attack'), 0.02));
  assert.ok(near(HE.statPct({ attack: 0, items: [sword, { slot: 'amulet', stats: { attack: 30 } }] }, 'attack'), 0.05));
  assert.ok(near(HE.statPct({ attack: 0, items: [{ slot: 'inventory', stats: { attack: 4 } }] }, 'attack'), 0), 'un objet au sac ne compte pas');
  assert.ok(near(HE.statPct({ attack: 5, atkPoints: 45, items: [sword] }, 'attack'), 0.07), 'les deux plafonds s\'ajoutent');
});

test('talents : effets par rang, au-delà des plafonds ; Grand intendant donne transport et vitesse', () => {
  const hero = { level: 30, attack: 5, atkPoints: 45, talents: { c_assault: 5, c_warlord: 1, i_grand_steward: 1 } };
  assert.ok(near(HE.statPct(hero, 'attack'), 0.05 + 0.10));
  assert.equal(HE.talent(hero, 'carryPct'), 5);
  assert.equal(HE.talent(hero, 'speedPct'), 3);
  assert.equal(HE.talent({ talents: { c_assault: 99 } }, 'attackPct'), 5, 'un rang au-delà du maximum ne compte pas');
  assert.equal(HE.talent(null, 'attackPct'), 0);
});

test('points de talent : 1 par niveau gagné, paliers de branche, maximum de rang', () => {
  assert.equal(HE.talentPoints({ level: 1 }), 0);
  assert.equal(HE.talentPoints({ level: 30 }), 29);
  assert.match(HE.canLearn({ level: 1 }, 'c_assault'), /point/);
  assert.equal(HE.canLearn({ level: 2 }, 'c_assault'), null);
  assert.match(HE.canLearn({ level: 10, talents: { c_assault: 4 } }, 'c_siege'), /5 points/);
  assert.equal(HE.canLearn({ level: 10, talents: { c_assault: 5 } }, 'c_siege'), null);
  assert.match(HE.canLearn({ level: 10, talents: { c_assault: 5 } }, 'c_assault'), /maximum/);
  assert.match(HE.canLearn({ level: 10, talents: { g_bulwark: 5 } }, 'c_siege'), /5 points/, 'les points d\'une autre branche ne débloquent rien');
  assert.match(HE.canLearn({ level: 2 }, 'nope'), /inconnu/);
  // 15 points par branche : une branche pleine et presque une deuxième au niveau 30
  for (const b of HE.catalog.branches) assert.equal(b.talents.reduce((t, x) => t + x.maxRank, 0), 15);
});

test('résurrection : 24 h, −2 % par niveau du Domus, −10 % par rang d\'Endurance ; prix selon le niveau', () => {
  assert.equal(HS.reviveSeconds({}, 0), 24 * 3600);
  assert.equal(HS.reviveSeconds({}, 10), Math.round(24 * 3600 * 0.8));
  assert.equal(HS.reviveSeconds({ talents: { g_endurance: 3 } }, 20), Math.round(24 * 3600 * 0.6 * 0.7));
  assert.deepEqual(HS.reviveCost({ level: 10 }), { wood: 2500, stone: 2500, iron: 2500, food: 1500 });
});

test('chute : le héros d\'une armée anéantie tombe, celui d\'une armée qui garde des soldats non', async () => {
  const left = { wiped: 0, alive: 3 };
  const writes = [];
  const tx = {
    armyUnit: { aggregate: async ({ where }) => ({ _sum: { count: left[where.armyId] } }) },
    hero: { findUnique: async ({ where }) => ({ id: where.id, name: 'H' + where.id, playerId: 'p', diedAt: null }), update: async (q) => writes.push(['hero', q.where.id, q.data]) },
    army: { updateMany: async (q) => { writes.push(['army', q.where.id, q.data]); return { count: q.where.heroId === held[q.where.id] ? 1 : 0 }; } }
  };
  const held = { wiped: 'h1', alive: 'h2' };   // le héros que chaque armée mène encore au moment de la chute
  const armies = HS.fought([
    { id: 'wiped', heroId: 'h1', units: [{ count: 10 }] },
    { id: 'alive', heroId: 'h2', units: [{ count: 10 }] },
    { id: 'empty', heroId: 'h3', units: [] }   // un héros seul dans une garnison vide ne combat pas
  ]);
  assert.deepEqual(armies.map(a => a.id), ['wiped', 'alive']);
  const fallen = await HS.fallIfWiped(tx, armies);
  assert.deepEqual(fallen.map(f => f.heroId), ['h1']);
  assert.ok(writes.some(([k, id, d]) => k === 'army' && id === 'wiped' && d.heroId === null));
  assert.ok(writes.some(([k, id, d]) => k === 'hero' && id === 'h1' && d.diedAt instanceof Date));
});

test('chute : un héros qui a déjà quitté l\'armée anéantie (lecture faite avant le combat) ne tombe pas', async () => {
  const writes = [];
  const tx = {
    armyUnit: { aggregate: async () => ({ _sum: { count: 0 } }) },
    hero: { findUnique: async ({ where }) => ({ id: where.id, name: 'H', playerId: 'p', diedAt: null }), update: async (q) => writes.push(['hero', q.where.id, q.data]) },
    army: { updateMany: async () => ({ count: 0 }) }   // l'armée ne le mène plus : rien n'est détaché
  };
  const fallen = await HS.fallIfWiped(tx, [{ id: 'g', heroId: 'h1', units: [{ count: 5 }] }]);
  assert.deepEqual(fallen, []);
  assert.equal(writes.length, 0, 'le héros n\'est pas marqué tombé');
});

test('défense : seul le héros d\'une armée qui a des soldats commande, jamais un héros tombé', () => {
  const h1 = { id: 'h1' }, h2 = { id: 'h2' }, dead = { id: 'h3', diedAt: new Date() };
  assert.equal(HS.leadingHero([{ hero: h1, units: [] }, { hero: null, units: [{ count: 50 }] }]), null, 'un héros seul dans une armée vide ne combat pas');
  assert.equal(HS.leadingHero([{ hero: h1, units: [{ count: 0 }] }, { hero: h2, units: [{ count: 3 }] }]), h2);
  assert.equal(HS.leadingHero([{ hero: dead, units: [{ count: 9 }] }]), null);
  assert.equal(HS.leadingHero([{ hero: h1, units: [{ count: 1 }] }]), h1);
  assert.equal(HS.leadingHero(null), null);
});

test('logistique (GDD) : réduit l\'entretien de l\'armée du héros, plus le transport', () => {
  const hero = { logistics: 5, logPoints: 45, items: [], talents: {} };
  assert.equal(HE.statPct(hero, 'logistics'), 0.05);   // 50 points × 0,1 % : le plafond de 5 %
  assert.equal(HE.talent(hero, 'upkeepPct'), 0);
});

// ---- XP (décision du 30 octobre 2026) : 100 XP pour le niveau 2, puis × 1,25 par niveau ----
const XP = require('../../src/services/heroXpService');
const config = require('../../src/config');
test('XP : 100 pour le niveau 2, puis × 1,25 par niveau (arrondi par défaut)', () => {
  assert.equal(config.hero.xpFirstLevel, 100);
  assert.equal(config.hero.xpLevelFactor, 1.25);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(XP.xpToNextAt), [100, 125, 156, 195, 243, 303]);
  assert.equal(XP.xpToNextAt(30), 63783);
  // la migration 0029 recalcule les héros existants avec la même chaîne
  const sql = require('fs').readFileSync(require('path').join(__dirname, '../../prisma/migrations/0029_age_rallies_indexes/migration.sql'), 'utf8');
  assert.match(sql, /SELECT 1, 100\s+UNION ALL\s+SELECT level \+ 1, FLOOR\(need \* 1\.25\)::int FROM chain WHERE level < 30/);
  assert.equal(config.combat.heroMaxLevel, 30);
});

test('XP : montée de plusieurs niveaux d\'un coup, seuil × 1,25 à chaque niveau, XP gardée', async () => {
  let row = { id: 'h1', playerId: 'p1', name: 'H', level: 1, xp: 90, xpToNextLevel: 100, statPoints: 0, diedAt: null, talents: {} };
  const tx = { hero: { findUnique: async () => ({ ...row }), update: async ({ data }) => { row = { ...row, ...data }; return row; } } };
  const prisma = require('../../src/config/database');
  const saved = prisma.notification;
  prisma.notification = { create: async () => ({ id: 'n' }) };   // avis de montée de niveau : aucune écriture réelle
  try {
    const r = await XP.awardHeroXp('h1', 200, tx);   // 290 XP : niveau 2 (−100), niveau 3 (−125), reste 65
    assert.deepEqual(r, { level: 3, leveledUp: true });
    assert.deepEqual([row.level, row.xp, row.xpToNextLevel, row.statPoints], [3, 65, 156, 8]);
    // un héros recalculé par la migration dont l'XP dépasse déjà le nouveau seuil monte au prochain gain
    row = { ...row, level: 5, xp: 400, xpToNextLevel: XP.xpToNextAt(5) };
    await XP.awardHeroXp('h1', 1, tx);
    assert.deepEqual([row.level, row.xp, row.xpToNextLevel], [6, 401 - 243, 303]);
  } finally { prisma.notification = saved; }
});
