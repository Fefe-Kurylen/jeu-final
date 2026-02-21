// ========== RESOURCE NODE SEEDING ==========
const prisma = require('../config/database');
const config = require('../config');
const { generateTribeDefenders, FACTIONS_LIST, FACTION_UNITS } = require('../utils/tribeDefenders');

const BASE_WORLD_SIZE = config.map.baseWorldSize;

async function seedResourceNodes() {
  const worldSize = BASE_WORLD_SIZE;
  const half = Math.floor(worldSize / 2);
  const RES_TOTAL = Math.min(5000, Math.floor(worldSize * worldSize * 0.035));
  const GOLD_TOTAL = Math.floor(RES_TOTAL * 0.13);
  const BATCH = 500;

  const used = new Set();
  const existingCities = await prisma.city.findMany({ select: { x: true, y: true } });
  existingCities.forEach(c => used.add(`${c.x},${c.y}`));

  const resTypes = ['WOOD', 'STONE', 'IRON', 'FOOD'];
  const biomes = (x, y) => {
    const angle = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI);
    return angle < 0.33 ? 'forest' : angle < 0.66 ? 'desert' : 'snow';
  };
  const pickLevel = (x, y) => {
    const d = Math.sqrt(x * x + y * y);
    const r = Math.random();
    if (d < half * 0.35) return r < 0.6 ? 3 : r < 0.85 ? 2 : 1;
    return r < 0.55 ? 1 : r < 0.9 ? 2 : 3;
  };

  let totalInserted = 0, goldCount = 0, batch = [], attempts = 0;

  while (totalInserted + batch.length < RES_TOTAL && attempts < RES_TOTAL * 3) {
    attempts++;
    const x = Math.floor(Math.random() * worldSize) - half;
    const y = Math.floor(Math.random() * worldSize) - half;
    const key = `${x},${y}`;
    if (used.has(key)) continue;
    used.add(key);
    const level = pickLevel(x, y);
    const type = resTypes[Math.floor(Math.random() * 4)];
    const baseAmt = [1500, 3500, 6000][level - 1];
    const amount = Math.floor(baseAmt * (0.8 + Math.random() * 0.4));
    const tribe = generateTribeDefenders(level, false, 1.0);
    batch.push({ x, y, resourceType: type, level, biome: biomes(x, y), amount, maxAmount: Math.floor(amount * 1.5), regenRate: Math.floor(amount / 100), hasDefenders: true, defenderPower: tribe.power, defenderUnits: tribe.units, respawnMinutes: 30 + level * 30 });
    if (batch.length >= BATCH) {
      await prisma.resourceNode.createMany({ data: batch, skipDuplicates: true });
      totalInserted += batch.length;
      batch = [];
    }
  }

  attempts = 0;
  while (goldCount < GOLD_TOTAL && attempts < GOLD_TOTAL * 3) {
    attempts++;
    const x = Math.floor(Math.random() * worldSize) - half;
    const y = Math.floor(Math.random() * worldSize) - half;
    const key = `${x},${y}`;
    if (used.has(key)) continue;
    used.add(key);
    const level = pickLevel(x, y);
    const amount = Math.floor([500, 1500, 3000][level - 1] * (0.8 + Math.random() * 0.4));
    const tribe = generateTribeDefenders(level, true, 1.0);
    batch.push({ x, y, resourceType: 'GOLD', level, biome: biomes(x, y), amount, maxAmount: Math.floor(amount * 1.5), regenRate: Math.floor(amount / 200), hasDefenders: true, defenderPower: tribe.power, defenderUnits: tribe.units, respawnMinutes: 60 + level * 60 });
    goldCount++;
    if (batch.length >= BATCH) {
      await prisma.resourceNode.createMany({ data: batch, skipDuplicates: true });
      totalInserted += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await prisma.resourceNode.createMany({ data: batch, skipDuplicates: true });
    totalInserted += batch.length;
  }

  console.log(`[SEED] ${totalInserted} resource nodes generated (${goldCount} gold)`);
}

module.exports = { seedResourceNodes };
