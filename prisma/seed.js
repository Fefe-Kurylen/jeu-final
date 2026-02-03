const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');
  for (let i = 0; i < 50; i++) {
    const x = 200 + Math.floor(Math.random() * 100);
    const y = 200 + Math.floor(Math.random() * 100);
    try {
      await prisma.resourceNode.create({
        data: { x, y, resourceType: ['WOOD','STONE','IRON','FOOD'][Math.floor(Math.random()*4)], amount: 2000+Math.floor(Math.random()*3000), maxAmount: 5000 }
      });
    } catch (e) {}
  }
  console.log('Done!');
}
main().finally(() => prisma.$disconnect());
