/**
 * SIMULATION 48H - MonJeu Alpha
 * Version JavaScript pure
 */

// Configuration
const TICK_INTERVAL_SEC = 30;
const TICK_HOURS = TICK_INTERVAL_SEC / 3600;
const TICKS_PER_HOUR = 3600 / TICK_INTERVAL_SEC;
const SIMULATION_HOURS = 48;
const TOTAL_TICKS = SIMULATION_HOURS * TICKS_PER_HOUR;

// Production curves (per hour)
const PROD_L1 = 20;
const PROD_L20 = 1200;

// Upkeep per hour
const UPKEEP = { base: 5, intermediate: 10, elite: 15, siege: 15 };

// Recruit times (seconds)
const RECRUIT_TIME = { base: 60, intermediate: 120, elite: 180, siege: 600 };

// Unit costs
const UNIT_COSTS = {
  base: { wood: 39, stone: 26, iron: 65, food: 26 },
  intermediate: { wood: 92, stone: 61, iron: 153, food: 61 },
  elite: { wood: 182, stone: 122, iron: 304, food: 122 },
  siege: { wood: 200, stone: 300, iron: 100, food: 50 },
};

// Helpers
function lerpExp(a, b, t) {
  if (a <= 0 || b <= 0) return a + (b - a) * t;
  return a * Math.pow(b / a, t);
}

function getProdAtLevel(level) {
  const t = (level - 1) / 19;
  return Math.round(lerpExp(PROD_L1, PROD_L20, t));
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toString();
}

// City state
const city = {
  resources: { wood: 800, stone: 800, iron: 800, food: 800 },
  maxStorage: 160000,
  buildings: [
    { key: 'MAIN_HALL', level: 1, prod: null },
    { key: 'FARM', level: 3, prod: 'food' },         // Start higher for food balance
    { key: 'FARM_2', level: 2, prod: 'food' },       // Second farm
    { key: 'LUMBER', level: 2, prod: 'wood' },
    { key: 'QUARRY', level: 2, prod: 'stone' },
    { key: 'IRON_MINE', level: 2, prod: 'iron' },
    { key: 'BARRACKS', level: 1, prod: null },
    { key: 'WAREHOUSE', level: 1, prod: null },
  ],
  army: { base: 10, intermediate: 0, elite: 0, siege: 0 },  // Smaller starting army
  buildQueue: [],
  recruitQueue: [],
};

// Stats
const stats = {
  woodProduced: 0,
  stoneProduced: 0,
  ironProduced: 0,
  foodProduced: 0,
  foodConsumed: 0,
  unitsRecruited: { base: 0, intermediate: 0, elite: 0, siege: 0 },
  buildingsCompleted: 0,
  peakArmy: 10,
  foodShortages: 0,
};

let currentTick = 0;

function getBuilding(key) {
  return city.buildings.find(b => b.key === key);
}

function getTotalArmy() {
  return city.army.base + city.army.intermediate + city.army.elite + city.army.siege;
}

function getUpkeepPerHour() {
  return city.army.base * UPKEEP.base +
         city.army.intermediate * UPKEEP.intermediate +
         city.army.elite * UPKEEP.elite +
         city.army.siege * UPKEEP.siege;
}

function getProdPerHour(type) {
  let total = 0;
  for (const b of city.buildings) {
    if (b.prod === type) total += getProdAtLevel(b.level);
  }
  return total;
}

function tickProduction() {
  const types = ['wood', 'stone', 'iron', 'food'];
  for (const type of types) {
    const gain = getProdPerHour(type) * TICK_HOURS;
    const before = city.resources[type];
    city.resources[type] = Math.min(before + gain, city.maxStorage);
    const actual = city.resources[type] - before;
    stats[type + 'Produced'] += actual;
  }
}

function tickUpkeep() {
  const cost = getUpkeepPerHour() * TICK_HOURS;
  city.resources.food -= cost;
  stats.foodConsumed += cost;
  if (city.resources.food < 0) {
    stats.foodShortages++;
    city.resources.food = 0;
  }
}

function tickConstruction() {
  const now = currentTick * TICK_INTERVAL_SEC;
  const finished = city.buildQueue.filter(q => q.endsAt <= now);
  for (const item of finished) {
    const building = getBuilding(item.building);
    if (building) {
      building.level = item.targetLevel;
      stats.buildingsCompleted++;
    }
  }
  city.buildQueue = city.buildQueue.filter(q => q.endsAt > now);
}

function tickRecruitment() {
  const now = currentTick * TICK_INTERVAL_SEC;
  const finished = city.recruitQueue.filter(q => q.endsAt <= now);
  for (const item of finished) {
    city.army[item.tier] += item.count;
    stats.unitsRecruited[item.tier] += item.count;
  }
  city.recruitQueue = city.recruitQueue.filter(q => q.endsAt > now);
  
  const total = getTotalArmy();
  if (total > stats.peakArmy) stats.peakArmy = total;
}

function aiDecisions() {
  const now = currentTick * TICK_INTERVAL_SEC;
  const r = city.resources;
  const mainHall = getBuilding('MAIN_HALL');
  
  // Build production buildings
  if (city.buildQueue.length < 2) {
    const priorities = ['FARM', 'IRON_MINE', 'LUMBER', 'QUARRY', 'MAIN_HALL', 'BARRACKS'];
    for (const key of priorities) {
      const building = getBuilding(key);
      if (!building) continue;
      if (building.level >= mainHall.level && key !== 'MAIN_HALL') continue;
      if (city.buildQueue.some(q => q.building === key)) continue;
      
      const cost = building.level * 150;
      if (r.wood >= cost && r.stone >= cost && r.iron >= cost && r.food >= cost) {
        const duration = Math.pow(building.level, 1.5) * 60;
        city.buildQueue.push({
          building: key,
          targetLevel: building.level + 1,
          endsAt: now + duration,
        });
        r.wood -= cost;
        r.stone -= cost;
        r.iron -= cost;
        r.food -= cost;
        break;
      }
    }
  }
  
  // Recruit based on food surplus
  if (city.recruitQueue.length < 3) {
    const foodProd = getProdPerHour('food');
    const upkeep = getUpkeepPerHour();
    const surplus = foodProd - upkeep;
    
    if (surplus > 100 && r.food > 2000) {
      const barracks = getBuilding('BARRACKS');
      let tier = 'base';
      let count = 5;
      
      if (barracks.level >= 10) { tier = 'intermediate'; count = 3; }
      if (barracks.level >= 15) { tier = 'elite'; count = 2; }
      
      const costs = UNIT_COSTS[tier];
      const total = {
        wood: costs.wood * count,
        stone: costs.stone * count,
        iron: costs.iron * count,
        food: costs.food * count,
      };
      
      if (r.wood >= total.wood && r.stone >= total.stone && 
          r.iron >= total.iron && r.food >= total.food) {
        const duration = RECRUIT_TIME[tier] * count;
        city.recruitQueue.push({ tier, count, endsAt: now + duration });
        r.wood -= total.wood;
        r.stone -= total.stone;
        r.iron -= total.iron;
        r.food -= total.food;
      }
    }
  }
}

function tick() {
  tickProduction();
  tickUpkeep();
  tickConstruction();
  tickRecruitment();
  aiDecisions();
  currentTick++;
}

function logState(label) {
  const r = city.resources;
  const a = city.army;
  
  console.log(`\n═══════════ ${label} ═══════════`);
  console.log(`Ressources:`);
  console.log(`  Bois:    ${formatNum(r.wood).padStart(8)} (${formatNum(getProdPerHour('wood'))}/h)`);
  console.log(`  Pierre:  ${formatNum(r.stone).padStart(8)} (${formatNum(getProdPerHour('stone'))}/h)`);
  console.log(`  Fer:     ${formatNum(r.iron).padStart(8)} (${formatNum(getProdPerHour('iron'))}/h)`);
  console.log(`  Nourrit: ${formatNum(r.food).padStart(8)} (${formatNum(getProdPerHour('food'))}/h)`);
  
  console.log(`Armée (${getTotalArmy()} total, upkeep: ${formatNum(getUpkeepPerHour())}/h):`);
  console.log(`  BASE: ${a.base}, INTER: ${a.intermediate}, ELITE: ${a.elite}, SIEGE: ${a.siege}`);
  
  console.log(`Bâtiments:`);
  for (const b of city.buildings) {
    const prod = b.prod ? ` → ${formatNum(getProdAtLevel(b.level))}/h` : '';
    console.log(`  ${b.key.padEnd(12)} Lv.${b.level}${prod}`);
  }
}

function logStats() {
  console.log(`\n═══════════ STATISTIQUES FINALES ═══════════`);
  console.log(`Production totale:`);
  console.log(`  Bois:    ${formatNum(stats.woodProduced)}`);
  console.log(`  Pierre:  ${formatNum(stats.stoneProduced)}`);
  console.log(`  Fer:     ${formatNum(stats.ironProduced)}`);
  console.log(`  Nourrit: ${formatNum(stats.foodProduced)}`);
  console.log(`Nourriture consommée: ${formatNum(stats.foodConsumed)}`);
  console.log(`Balance: ${formatNum(stats.foodProduced - stats.foodConsumed)}`);
  console.log(`Pénuries: ${stats.foodShortages}`);
  console.log(`Bâtiments complétés: ${stats.buildingsCompleted}`);
  console.log(`Unités recrutées: BASE=${stats.unitsRecruited.base}, INTER=${stats.unitsRecruited.intermediate}, ELITE=${stats.unitsRecruited.elite}`);
  console.log(`Pic armée: ${stats.peakArmy}`);
}

// Run simulation
console.log('══════════════════════════════════════════════════════════════════');
console.log('            SIMULATION 48H - MonJeu Alpha v0.1.6');
console.log('══════════════════════════════════════════════════════════════════');
console.log(`Configuration: ${TICK_INTERVAL_SEC}s ticks, ${TOTAL_TICKS} total ticks`);

const startTime = Date.now();

logState('ÉTAT INITIAL');

const checkpoints = [1, 6, 12, 24, 48];
let nextCP = 0;

for (let i = 0; i < TOTAL_TICKS; i++) {
  tick();
  const hour = (currentTick * TICK_INTERVAL_SEC) / 3600;
  if (nextCP < checkpoints.length && hour >= checkpoints[nextCP]) {
    logState(`HEURE ${checkpoints[nextCP]}`);
    nextCP++;
  }
}

const elapsed = Date.now() - startTime;

logStats();

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`Simulation terminée en ${elapsed}ms`);
console.log(`Performance: ${Math.round(TOTAL_TICKS / (elapsed / 1000))} ticks/seconde`);
console.log('══════════════════════════════════════════════════════════════════');
