import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create world state
  await prisma.worldState.upsert({
    where: { id: 'world' },
    update: {},
    create: {
      id: 'world',
      minX: -100,
      maxX: 100,
      minY: -100,
      maxY: 100,
      maxPlayers: 1000,
      joinDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  // Generate world tiles (simplified - just key areas)
  console.log('  Creating world tiles...');
  const terrainTypes = ['PLAIN', 'FOREST', 'HILL', 'ROCKY', 'DESERT', 'SNOW'];
  
  for (let x = -100; x <= 100; x += 10) {
    for (let y = -100; y <= 100; y += 10) {
      const terrain = terrainTypes[Math.floor(Math.random() * terrainTypes.length)] as any;
      const passable = terrain !== 'MOUNTAIN' && terrain !== 'LAKE';
      
      await prisma.worldTile.upsert({
        where: { x_y: { x, y } },
        update: {},
        create: { x, y, terrain, passable },
      });
    }
  }

  // Create resource nodes
  console.log('  Creating resource nodes...');
  const resourceTypes = ['wood', 'stone', 'iron', 'food', 'gold'];
  const levels = [1, 2, 3];
  
  for (let i = 0; i < 50; i++) {
    const x = Math.floor(Math.random() * 200) - 100;
    const y = Math.floor(Math.random() * 200) - 100;
    const kind = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
    const level = levels[Math.floor(Math.random() * levels.length)];
    const baseTribePower = level * 100;

    try {
      await prisma.resourceNode.create({
        data: {
          x,
          y,
          kind,
          level,
          filledPct: 1.0,
          baseTribePower,
          tribePower: baseTribePower,
        },
      });
    } catch {
      // Ignore duplicate coordinates
    }
  }

  console.log('✅ Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
