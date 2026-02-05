const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ========== WORLD CONFIGURATION (from archives) ==========
const WIDTH = 374;
const HEIGHT = 374;
const MIN_X = -Math.floor(WIDTH / 2);  // -187
const MAX_X = MIN_X + WIDTH - 1;        // +186
const MIN_Y = -Math.floor(HEIGHT / 2);
const MAX_Y = MIN_Y + HEIGHT - 1;

// Resource counts
const RES_TOTAL = 30000;   // 30,000 resource nodes
const GOLD_TOTAL = 4000;   // 4,000 gold nodes
const BATCH = 1000;

// ========== UTILITY FUNCTIONS ==========
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function inBounds(x, y) {
  return x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y;
}

// ========== BIOME SYSTEM (3 parts like a pie/camembert) ==========
// Using angle from center to determine biome
function getBiome(x, y) {
  const angle = Math.atan2(y, x); // -PI to PI
  const normalized = (angle + Math.PI) / (2 * Math.PI); // 0 to 1

  if (normalized < 0.33) return 'forest';
  if (normalized < 0.66) return 'desert';
  return 'snow';
}

// ========== LEVEL DISTRIBUTION ==========
// Center = more level 3, Outer = more level 1
function pickLevelWithCenterBias(x, y) {
  const d = Math.sqrt(dist2(x, y, 0, 0));
  const centerR = Math.min(WIDTH, HEIGHT) * 0.18;
  const inCenter = d <= centerR;

  const r = Math.random();
  if (inCenter) {
    // Near center: mostly level 3
    if (r < 0.20) return 2;
    if (r < 0.70) return 3;
    return 1;
  } else {
    // Outer: mostly level 1
    if (r < 0.55) return 1;
    if (r < 0.90) return 2;
    return 3;
  }
}

// ========== RESOURCE TYPE ==========
function resourceKindWeighted() {
  const r = Math.random();
  if (r < 0.25) return 'WOOD';
  if (r < 0.50) return 'STONE';
  if (r < 0.75) return 'IRON';
  return 'FOOD';
}

// ========== FACTIONS & UNIT KEYS ==========
const FACTIONS = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];

const FACTION_UNITS = {
  ROME: {
    infantry: { base: 'ROM_INF_MILICIEN', intermediate: 'ROM_INF_TRIARII', elite: 'ROM_INF_LEGIONNAIRE' },
    archer: { base: 'ROM_ARC_MILICIEN', intermediate: 'ROM_ARC_VETERAN', elite: 'ROM_ARC_ELITE' },
    cavalry: { base: 'ROM_CAV_AUXILIAIRE', intermediate: 'ROM_CAV_EQUITES', elite: 'ROM_CAV_LOURDE' }
  },
  GAUL: {
    infantry: { base: 'GAU_INF_GUERRIER', intermediate: 'GAU_INF_TRIARII', elite: 'GAU_INF_CHAMPION' },
    archer: { base: 'GAU_ARC_CHASSEUR', intermediate: 'GAU_ARC_GAULOIS', elite: 'GAU_ARC_NOBLE' },
    cavalry: { base: 'GAU_CAV_CHASSEUR', intermediate: 'GAU_CAV_GAULOIS', elite: 'GAU_CAV_NOBLE' }
  },
  GREEK: {
    infantry: { base: 'GRE_INF_JEUNE', intermediate: 'GRE_INF_HOPLITE', elite: 'GRE_INF_SPARTIATE' },
    archer: { base: 'GRE_ARC_PAYSAN', intermediate: 'GRE_ARC_TOXOTE', elite: 'GRE_ARC_ELITE' },
    cavalry: { base: 'GRE_CAV_ECLAIREUR', intermediate: 'GRE_CAV_GREC', elite: 'GRE_CAV_ELITE' }
  },
  EGYPT: {
    infantry: { base: 'EGY_INF_ESCLAVE', intermediate: 'EGY_INF_NIL', elite: 'EGY_INF_TEMPLE' },
    archer: { base: 'EGY_ARC_NIL', intermediate: 'EGY_ARC_DESERT', elite: 'EGY_ARC_PHARAON' },
    cavalry: { base: 'EGY_CAV_DESERT', intermediate: 'EGY_CAV_PHARAON', elite: 'EGY_CAV_CHAR_LOURD' }
  },
  HUN: {
    infantry: { base: 'HUN_INF_NOMADE', intermediate: 'HUN_INF_GARDE', elite: 'HUN_INF_VETERAN' },
    archer: { base: 'HUN_ARC_NOMADE', intermediate: 'HUN_ARC_CAMP', elite: 'HUN_ARC_ELITE' },
    cavalry: { base: 'HUN_CAV_PILLARD', intermediate: 'HUN_CAV_INTER', elite: 'HUN_CAV_ELITE' }
  },
  SULTAN: {
    infantry: { base: 'SUL_INF_DESERT', intermediate: 'SUL_INF_CROISSANT', elite: 'SUL_INF_PALAIS' },
    archer: { base: 'SUL_ARC_DESERT', intermediate: 'SUL_ARC_TIREUR', elite: 'SUL_ARC_PERSE' },
    cavalry: { base: 'SUL_CAV_BEDOUIN', intermediate: 'SUL_CAV_DESERT', elite: 'SUL_CAV_MAMELOUK' }
  }
};

// ========== TRIBE DEFENDERS ==========
// Level 1: 100 soldats de base uniquement (infanterie, archer, cavalerie)
// Level 2: 600 soldats base + intermédiaire
// Level 3: 1500 soldats base + intermédiaire + élite
// Faction choisie aléatoirement
function generateTribeDefenders(level, isGold = false) {
  // Choisir une faction aléatoire
  const faction = FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
  const factionUnits = FACTION_UNITS[faction];

  const units = {};
  let totalSoldiers;

  if (level === 1) {
    // 100 soldats de base uniquement
    totalSoldiers = 100;
    // Répartition aléatoire entre les 3 classes (environ 33% chacune avec variance)
    const infRatio = 0.25 + Math.random() * 0.2;  // 25-45%
    const arcRatio = 0.25 + Math.random() * 0.2;  // 25-45%
    const cavRatio = 1 - infRatio - arcRatio;     // Le reste

    units[factionUnits.infantry.base] = Math.floor(totalSoldiers * infRatio);
    units[factionUnits.archer.base] = Math.floor(totalSoldiers * arcRatio);
    units[factionUnits.cavalry.base] = Math.floor(totalSoldiers * cavRatio);

  } else if (level === 2) {
    // 600 soldats base + intermédiaire
    totalSoldiers = 600;
    // 60% base, 40% intermédiaire
    const baseCount = Math.floor(totalSoldiers * 0.6);  // 360
    const interCount = totalSoldiers - baseCount;        // 240

    // Répartition aléatoire entre les 3 classes
    const infRatio = 0.25 + Math.random() * 0.2;
    const arcRatio = 0.25 + Math.random() * 0.2;
    const cavRatio = 1 - infRatio - arcRatio;

    // Base
    units[factionUnits.infantry.base] = Math.floor(baseCount * infRatio);
    units[factionUnits.archer.base] = Math.floor(baseCount * arcRatio);
    units[factionUnits.cavalry.base] = Math.floor(baseCount * cavRatio);
    // Intermédiaire
    units[factionUnits.infantry.intermediate] = Math.floor(interCount * infRatio);
    units[factionUnits.archer.intermediate] = Math.floor(interCount * arcRatio);
    units[factionUnits.cavalry.intermediate] = Math.floor(interCount * cavRatio);

  } else {
    // Level 3: 1500 soldats base + intermédiaire + élite
    totalSoldiers = 1500;
    // 40% base, 35% intermédiaire, 25% élite
    const baseCount = Math.floor(totalSoldiers * 0.4);   // 600
    const interCount = Math.floor(totalSoldiers * 0.35); // 525
    const eliteCount = totalSoldiers - baseCount - interCount; // 375

    // Répartition aléatoire entre les 3 classes
    const infRatio = 0.25 + Math.random() * 0.2;
    const arcRatio = 0.25 + Math.random() * 0.2;
    const cavRatio = 1 - infRatio - arcRatio;

    // Base
    units[factionUnits.infantry.base] = Math.floor(baseCount * infRatio);
    units[factionUnits.archer.base] = Math.floor(baseCount * arcRatio);
    units[factionUnits.cavalry.base] = Math.floor(baseCount * cavRatio);
    // Intermédiaire
    units[factionUnits.infantry.intermediate] = Math.floor(interCount * infRatio);
    units[factionUnits.archer.intermediate] = Math.floor(interCount * arcRatio);
    units[factionUnits.cavalry.intermediate] = Math.floor(interCount * cavRatio);
    // Élite
    units[factionUnits.infantry.elite] = Math.floor(eliteCount * infRatio);
    units[factionUnits.archer.elite] = Math.floor(eliteCount * arcRatio);
    units[factionUnits.cavalry.elite] = Math.floor(eliteCount * cavRatio);
  }

  // Calculer la puissance basée sur le nombre total de soldats
  const basePower = isGold ? 140 : 100;
  const power = basePower * level * (totalSoldiers / 100);

  return { power, units, faction };
}

// ========== RESOURCE AMOUNT BY LEVEL ==========
function getResourceAmount(level, resourceType) {
  const baseAmounts = {
    WOOD: [1500, 3500, 6000],
    STONE: [1200, 3000, 5500],
    IRON: [1000, 2500, 5000],
    FOOD: [2000, 4000, 7000],
    GOLD: [500, 1500, 3000]
  };

  const amounts = baseAmounts[resourceType] || [1000, 2500, 5000];
  const base = amounts[level - 1];
  const variance = 0.8 + Math.random() * 0.4; // ±20%

  return Math.floor(base * variance);
}

// ========== MAIN SEED FUNCTION ==========
async function main() {
  console.log('🌍 Seeding world resources...');
  console.log(`   Map size: ${WIDTH}x${HEIGHT} (${WIDTH * HEIGHT} tiles)`);
  console.log(`   Resources: ${RES_TOTAL} standard + ${GOLD_TOTAL} gold = ${RES_TOTAL + GOLD_TOTAL} total`);

  // Check existing
  const existingCount = await prisma.resourceNode.count();
  if (existingCount > 0) {
    console.log(`   ⚠️  Found ${existingCount} existing resources. Deleting...`);
    await prisma.resourceNode.deleteMany();
  }

  const used = new Set();
  const data = [];

  // Generate standard resources (30,000)
  console.log('   Generating standard resources...');
  let attempts = 0;
  while (data.length < RES_TOTAL && attempts < RES_TOTAL * 3) {
    attempts++;
    const x = randInt(MIN_X, MAX_X);
    const y = randInt(MIN_Y, MAX_Y);
    const key = `${x},${y}`;

    if (used.has(key)) continue;
    used.add(key);

    const resourceType = resourceKindWeighted();
    const level = pickLevelWithCenterBias(x, y);
    const biome = getBiome(x, y);
    const amount = getResourceAmount(level, resourceType);
    const tribe = generateTribeDefenders(level, false);

    data.push({
      x, y,
      resourceType,
      level,
      biome,
      amount,
      maxAmount: Math.floor(amount * 1.5),
      regenRate: Math.floor(amount / 100),
      hasDefenders: true,
      defenderPower: tribe.power,
      defenderUnits: tribe.units,
      respawnMinutes: 30 + level * 30 // 60, 90, 120 minutes
    });

    if (data.length % 5000 === 0) {
      console.log(`   ... ${data.length}/${RES_TOTAL} standard resources`);
    }
  }

  // Generate gold resources (4,000)
  console.log('   Generating gold resources...');
  let goldCount = 0;
  attempts = 0;
  while (goldCount < GOLD_TOTAL && attempts < GOLD_TOTAL * 3) {
    attempts++;
    const x = randInt(MIN_X, MAX_X);
    const y = randInt(MIN_Y, MAX_Y);
    const key = `${x},${y}`;

    if (used.has(key)) continue;
    used.add(key);

    const level = pickLevelWithCenterBias(x, y);
    const biome = getBiome(x, y);
    const amount = getResourceAmount(level, 'GOLD');
    const tribe = generateTribeDefenders(level, true);

    data.push({
      x, y,
      resourceType: 'GOLD',
      level,
      biome,
      amount,
      maxAmount: Math.floor(amount * 1.5),
      regenRate: Math.floor(amount / 200), // Gold regenerates slower
      hasDefenders: true,
      defenderPower: tribe.power,
      defenderUnits: tribe.units,
      respawnMinutes: 60 + level * 60 // 120, 180, 240 minutes (stronger respawn)
    });

    goldCount++;
    if (goldCount % 1000 === 0) {
      console.log(`   ... ${goldCount}/${GOLD_TOTAL} gold resources`);
    }
  }

  // Insert in batches
  console.log(`   Inserting ${data.length} resources in batches of ${BATCH}...`);
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH);
    await prisma.resourceNode.createMany({ data: batch });
    console.log(`   ... inserted ${Math.min(i + BATCH, data.length)}/${data.length}`);
  }

  // Summary
  const summary = await prisma.resourceNode.groupBy({
    by: ['resourceType', 'level'],
    _count: { resourceType: true }
  });

  console.log('\n✅ Seed complete!');
  console.log('\n📊 Distribution:');

  const byType = {};
  summary.forEach(s => {
    if (!byType[s.resourceType]) byType[s.resourceType] = { 1: 0, 2: 0, 3: 0, total: 0 };
    byType[s.resourceType][s.level] = s._count.resourceType;
    byType[s.resourceType].total += s._count.resourceType;
  });

  console.log('Type      | Lvl 1  | Lvl 2  | Lvl 3  | Total');
  console.log('----------|--------|--------|--------|-------');
  Object.entries(byType).forEach(([type, counts]) => {
    console.log(`${type.padEnd(9)} | ${String(counts[1]).padEnd(6)} | ${String(counts[2]).padEnd(6)} | ${String(counts[3]).padEnd(6)} | ${counts.total}`);
  });
}

main()
  .catch(e => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
