const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// World configuration (same as server.js)
const BASE_WORLD_SIZE = 374;

// Resource distribution (per 10,000 tiles)
// ~140,000 tiles initial = ~700 resource nodes base
const RESOURCES_PER_10K_TILES = 50;

// Resource type distribution
const RESOURCE_TYPES = [
  { type: 'WOOD', weight: 25 },   // 25%
  { type: 'STONE', weight: 20 },  // 20%
  { type: 'IRON', weight: 20 },   // 20%
  { type: 'FOOD', weight: 25 },   // 25%
  { type: 'GOLD', weight: 10 }    // 10% (rare)
];

// Calculate total weight for random selection
const totalWeight = RESOURCE_TYPES.reduce((sum, r) => sum + r.weight, 0);

function getRandomResourceType() {
  let rand = Math.random() * totalWeight;
  for (const res of RESOURCE_TYPES) {
    rand -= res.weight;
    if (rand <= 0) return res.type;
  }
  return 'WOOD';
}

// Get biome based on position (same logic as frontend)
function getBiome(x, y, worldCenter) {
  const dx = x - worldCenter;
  const dy = y - worldCenter;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const forestRadius = worldCenter * 0.32;
  const desertRadius = worldCenter * 0.56;

  if (dist < forestRadius) return 'forest';
  if (dist < desertRadius) return 'desert';
  return 'snow';
}

// Resource amounts vary by biome tier
function getResourceAmount(biome, resourceType) {
  const baseAmount = {
    WOOD: 3000,
    STONE: 2500,
    IRON: 2000,
    FOOD: 3500,
    GOLD: 1000
  }[resourceType] || 2000;

  // Tier multipliers: Forest=1x, Desert=1.5x, Snow=2x (rarer but richer)
  const tierMult = biome === 'forest' ? 1 : biome === 'desert' ? 1.5 : 2;

  // Random variance ±30%
  const variance = 0.7 + Math.random() * 0.6;

  return Math.floor(baseAmount * tierMult * variance);
}

async function main() {
  console.log('🌍 Seeding resource nodes...');

  // Get current player count to determine world size
  const playerCount = await prisma.player.count();
  const expansion = Math.min(playerCount, 5000) * 10;
  const worldSize = BASE_WORLD_SIZE + Math.floor(Math.sqrt(expansion * 100));
  const worldCenter = Math.floor(worldSize / 2);

  console.log(`   World size: ${worldSize}x${worldSize} (${worldSize * worldSize} tiles)`);
  console.log(`   Players: ${playerCount}`);

  // Calculate target resource count
  const totalTiles = worldSize * worldSize;
  const targetResources = Math.floor(totalTiles / 10000 * RESOURCES_PER_10K_TILES);

  // Count existing resources
  const existingCount = await prisma.resourceNode.count();
  const toCreate = Math.max(0, targetResources - existingCount);

  console.log(`   Target resources: ${targetResources}`);
  console.log(`   Existing: ${existingCount}`);
  console.log(`   To create: ${toCreate}`);

  if (toCreate <= 0) {
    console.log('✅ Sufficient resources already exist!');
    return;
  }

  // Generate new resource nodes
  let created = 0;
  let attempts = 0;
  const maxAttempts = toCreate * 10;

  while (created < toCreate && attempts < maxAttempts) {
    attempts++;

    // Random position within world bounds (with margin)
    const margin = 5;
    const x = margin + Math.floor(Math.random() * (worldSize - margin * 2));
    const y = margin + Math.floor(Math.random() * (worldSize - margin * 2));

    const biome = getBiome(x, y, worldCenter);
    const resourceType = getRandomResourceType();
    const amount = getResourceAmount(biome, resourceType);
    const maxAmount = Math.floor(amount * 1.5);

    try {
      await prisma.resourceNode.create({
        data: {
          x,
          y,
          resourceType,
          amount,
          maxAmount,
          regenRate: Math.floor(maxAmount / 100) // 1% per tick
        }
      });
      created++;

      if (created % 100 === 0) {
        console.log(`   Created ${created}/${toCreate} resources...`);
      }
    } catch (e) {
      // Position already taken, try another
    }
  }

  console.log(`✅ Created ${created} resource nodes!`);

  // Summary by type
  const summary = await prisma.resourceNode.groupBy({
    by: ['resourceType'],
    _count: { resourceType: true }
  });
  console.log('   Distribution:');
  summary.forEach(s => {
    console.log(`     ${s.resourceType}: ${s._count.resourceType}`);
  });
}

main()
  .catch(e => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
