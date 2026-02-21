const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateTribeDefenders } = require('../src/utils/tribeDefenders');

// ========== WORLD CONFIGURATION ==========
const WIDTH = 374;
const HEIGHT = 374;
const MIN_X = -Math.floor(WIDTH / 2);  // -187
const MAX_X = MIN_X + WIDTH - 1;        // +186
const MIN_Y = -Math.floor(HEIGHT / 2);
const MAX_Y = MIN_Y + HEIGHT - 1;

// Resource counts
const RES_TOTAL = 30000;
const GOLD_TOTAL = 4000;
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

// ========== BIOME SYSTEM ==========
function getBiome(x, y) {
  const angle = Math.atan2(y, x);
  const normalized = (angle + Math.PI) / (2 * Math.PI);
  if (normalized < 0.33) return 'forest';
  if (normalized < 0.66) return 'desert';
  return 'snow';
}

// ========== LEVEL DISTRIBUTION ==========
function pickLevelWithCenterBias(x, y) {
  const d = Math.sqrt(dist2(x, y, 0, 0));
  const centerR = Math.min(WIDTH, HEIGHT) * 0.18;
  const inCenter = d <= centerR;
  const r = Math.random();
  if (inCenter) {
    if (r < 0.20) return 2;
    if (r < 0.70) return 3;
    return 1;
  } else {
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
  const variance = 0.8 + Math.random() * 0.4;
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
