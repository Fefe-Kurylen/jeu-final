/**
 * SIMULATION 48H - MonJeu Alpha v0.1.6
 * Version améliorée avec équilibrage GDD
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION GDD
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  TICK_SEC: 30,
  SIM_HOURS: 48,
  
  // Production curves (L1 → L20)
  PROD_L1: 20,
  PROD_L20: 1200,
  
  // Upkeep per hour
  UPKEEP: { base: 5, intermediate: 10, elite: 15, siege: 15 },
  
  // Recruit time (seconds per unit)
  RECRUIT_TIME: { base: 60, intermediate: 120, elite: 180, siege: 600 },
  
  // Combat ratio (INTER needed to kill 1 ELITE)
  COMBAT_RATIO: 1.8,
  
  // Construction time scaling
  BUILD_TIME_L1: 150,   // 2.5 min
  BUILD_TIME_L20: 86400, // 24h
};

const TICK_HOURS = CONFIG.TICK_SEC / 3600;
const TICKS_PER_HOUR = 3600 / CONFIG.TICK_SEC;
const TOTAL_TICKS = CONFIG.SIM_HOURS * TICKS_PER_HOUR;

// ═══════════════════════════════════════════════════════════════════════════
// GAME DATA
// ═══════════════════════════════════════════════════════════════════════════

const UNIT_COSTS = {
  base:         { wood: 30, stone: 20, iron: 50, food: 20 },
  intermediate: { wood: 54, stone: 36, iron: 90, food: 36 },
  elite:        { wood: 96, stone: 64, iron: 160, food: 64 },
  siege:        { wood: 200, stone: 300, iron: 100, food: 50 },
};

const COST_MULTIPLIERS = { base: 1.3, intermediate: 1.7, elite: 1.9, siege: 1.0 };

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function lerpExp(a, b, t) {
  if (a <= 0 || b <= 0) return a + (b - a) * t;
  return a * Math.pow(b / a, Math.max(0, Math.min(1, t)));
}

function getProdAtLevel(level) {
  const t = (level - 1) / 19;
  return Math.round(lerpExp(CONFIG.PROD_L1, CONFIG.PROD_L20, t));
}

function getBuildTimeAtLevel(level) {
  const t = (level - 1) / 19;
  return Math.round(lerpExp(CONFIG.BUILD_TIME_L1, CONFIG.BUILD_TIME_L20, t));
}

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n).toString();
}

function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

const city = {
  name: 'Roma Prima',
  res: { wood: 1000, stone: 1000, iron: 1000, food: 1500 },
  maxRes: 160000,
  buildings: [
    { key: 'MAIN_HALL', level: 1, prod: null },
    { key: 'FARM_1', level: 3, prod: 'food' },
    { key: 'FARM_2', level: 2, prod: 'food' },
    { key: 'LUMBER_1', level: 2, prod: 'wood' },
    { key: 'QUARRY_1', level: 2, prod: 'stone' },
    { key: 'IRON_MINE_1', level: 2, prod: 'iron' },
    { key: 'BARRACKS', level: 1, prod: null },
    { key: 'WAREHOUSE', level: 1, prod: null },
    { key: 'SILO', level: 1, prod: null },
    { key: 'HEALING_TENT', level: 1, prod: null },
  ],
  army: { base: 10, intermediate: 0, elite: 0, siege: 0 },
  buildQueue: [],
  recruitQueue: [],
  wounded: { base: 0, intermediate: 0, elite: 0 },
};

const stats = {
  produced: { wood: 0, stone: 0, iron: 0, food: 0 },
  consumed: { wood: 0, stone: 0, iron: 0, food: 0 },
  recruited: { base: 0, intermediate: 0, elite: 0, siege: 0 },
  buildingsUp: 0,
  peakArmy: 10,
  shortages: 0,
  healed: 0,
  battles: 0,
};

let tick = 0;

// ═══════════════════════════════════════════════════════════════════════════
// GAME FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getBuilding(key) { return city.buildings.find(b => b.key === key); }

function armySize() {
  const a = city.army;
  return a.base + a.intermediate + a.elite + a.siege;
}

function upkeepPerHour() {
  const a = city.army;
  const U = CONFIG.UPKEEP;
  return a.base * U.base + a.intermediate * U.intermediate + 
         a.elite * U.elite + a.siege * U.siege;
}

function prodPerHour(type) {
  let total = 0;
  for (const b of city.buildings) {
    if (b.prod === type) total += getProdAtLevel(b.level);
  }
  return total;
}

function foodBalance() {
  return prodPerHour('food') - upkeepPerHour();
}

// ═══════════════════════════════════════════════════════════════════════════
// TICK FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function tickProduction() {
  for (const type of ['wood', 'stone', 'iron', 'food']) {
    const gain = prodPerHour(type) * TICK_HOURS;
    const before = city.res[type];
    city.res[type] = Math.min(before + gain, city.maxRes);
    stats.produced[type] += city.res[type] - before;
  }
}

function tickUpkeep() {
  const cost = upkeepPerHour() * TICK_HOURS;
  city.res.food -= cost;
  stats.consumed.food += cost;
  if (city.res.food < 0) {
    stats.shortages++;
    city.res.food = 0;
  }
}

function tickConstruction() {
  const now = tick * CONFIG.TICK_SEC;
  
  // Complete finished
  for (const q of city.buildQueue.filter(x => x.endsAt <= now)) {
    const b = getBuilding(q.key);
    if (b) { b.level = q.targetLevel; stats.buildingsUp++; }
  }
  city.buildQueue = city.buildQueue.filter(x => x.endsAt > now);
}

function tickRecruitment() {
  const now = tick * CONFIG.TICK_SEC;
  
  for (const q of city.recruitQueue.filter(x => x.endsAt <= now)) {
    city.army[q.tier] += q.count;
    stats.recruited[q.tier] += q.count;
  }
  city.recruitQueue = city.recruitQueue.filter(x => x.endsAt > now);
  
  const total = armySize();
  if (total > stats.peakArmy) stats.peakArmy = total;
}

function tickHealing() {
  const tent = getBuilding('HEALING_TENT');
  if (!tent) return;
  
  const healRate = 3 * tent.level;
  let remaining = healRate * TICK_HOURS;
  
  for (const tier of ['base', 'intermediate', 'elite']) {
    if (remaining <= 0) break;
    const heal = Math.min(city.wounded[tier], remaining);
    city.wounded[tier] -= heal;
    city.army[tier] += heal;
    stats.healed += heal;
    remaining -= heal;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI DECISIONS
// ═══════════════════════════════════════════════════════════════════════════

function aiConstruction() {
  if (city.buildQueue.length >= 2) return;
  
  const now = tick * CONFIG.TICK_SEC;
  const r = city.res;
  const mainLevel = getBuilding('MAIN_HALL')?.level || 1;
  
  // Priority: FARM if food deficit, then production, then main hall
  const foodBal = foodBalance();
  
  const priorities = foodBal < 20 
    ? ['FARM_1', 'FARM_2', 'LUMBER_1', 'QUARRY_1', 'IRON_MINE_1', 'MAIN_HALL']
    : ['IRON_MINE_1', 'LUMBER_1', 'QUARRY_1', 'FARM_1', 'MAIN_HALL', 'BARRACKS'];
  
  for (const key of priorities) {
    const b = getBuilding(key);
    if (!b) continue;
    if (b.level >= mainLevel && !key.includes('MAIN')) continue;
    if (city.buildQueue.some(x => x.key === key)) continue;
    
    // Cost calculation (level² scaling)
    const costBase = 100 * Math.pow(b.level, 1.5);
    const cost = { wood: costBase, stone: costBase, iron: costBase * 0.5, food: costBase * 0.3 };
    
    if (r.wood >= cost.wood && r.stone >= cost.stone && 
        r.iron >= cost.iron && r.food >= cost.food) {
      
      const duration = getBuildTimeAtLevel(b.level + 1);
      
      city.buildQueue.push({
        key,
        targetLevel: b.level + 1,
        endsAt: now + duration,
      });
      
      r.wood -= cost.wood;
      r.stone -= cost.stone;
      r.iron -= cost.iron;
      r.food -= cost.food;
      
      stats.consumed.wood += cost.wood;
      stats.consumed.stone += cost.stone;
      stats.consumed.iron += cost.iron;
      stats.consumed.food += cost.food;
      
      break;
    }
  }
}

function aiRecruitment() {
  if (city.recruitQueue.length >= 3) return;
  
  const now = tick * CONFIG.TICK_SEC;
  const r = city.res;
  const foodBal = foodBalance();
  
  // Only recruit if positive food balance and enough reserves
  if (foodBal < 10 || r.food < 500) return;
  
  // Decide tier based on barracks level
  const barracksLevel = getBuilding('BARRACKS')?.level || 1;
  let tier = 'base';
  let count = 5;
  
  if (barracksLevel >= 10 && r.iron > 2000) { tier = 'intermediate'; count = 3; }
  if (barracksLevel >= 15 && r.iron > 5000) { tier = 'elite'; count = 2; }
  
  // Check affordability
  const baseCost = UNIT_COSTS[tier];
  const mult = COST_MULTIPLIERS[tier];
  const cost = {
    wood: Math.ceil(baseCost.wood * mult * count),
    stone: Math.ceil(baseCost.stone * mult * count),
    iron: Math.ceil(baseCost.iron * mult * count),
    food: Math.ceil(baseCost.food * mult * count),
  };
  
  if (r.wood >= cost.wood && r.stone >= cost.stone && 
      r.iron >= cost.iron && r.food >= cost.food) {
    
    const unitTime = CONFIG.RECRUIT_TIME[tier];
    const duration = unitTime * count;
    
    city.recruitQueue.push({ tier, count, endsAt: now + duration });
    
    r.wood -= cost.wood;
    r.stone -= cost.stone;
    r.iron -= cost.iron;
    r.food -= cost.food;
    
    stats.consumed.wood += cost.wood;
    stats.consumed.stone += cost.stone;
    stats.consumed.iron += cost.iron;
    stats.consumed.food += cost.food;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION
// ═══════════════════════════════════════════════════════════════════════════

function runTick() {
  tickProduction();
  tickUpkeep();
  tickConstruction();
  tickRecruitment();
  tickHealing();
  aiConstruction();
  aiRecruitment();
  tick++;
}

function printState(label) {
  const r = city.res;
  const a = city.army;
  
  console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║  ${label.padEnd(60)}║`);
  console.log(`╠═══════════════════════════════════════════════════════════════╣`);
  
  console.log(`║  RESSOURCES                                                   ║`);
  console.log(`║    Bois:    ${fmt(r.wood).padStart(8)}  (${fmt(prodPerHour('wood')).padStart(6)}/h)                        ║`);
  console.log(`║    Pierre:  ${fmt(r.stone).padStart(8)}  (${fmt(prodPerHour('stone')).padStart(6)}/h)                        ║`);
  console.log(`║    Fer:     ${fmt(r.iron).padStart(8)}  (${fmt(prodPerHour('iron')).padStart(6)}/h)                        ║`);
  console.log(`║    Nourrit: ${fmt(r.food).padStart(8)}  (${fmt(prodPerHour('food')).padStart(6)}/h) Balance: ${foodBalance() >= 0 ? '+' : ''}${fmt(foodBalance())}/h   ║`);
  
  console.log(`║                                                               ║`);
  console.log(`║  ARMÉE (${armySize()} unités)                                           ║`);
  console.log(`║    BASE: ${a.base.toString().padStart(4)}  INTER: ${a.intermediate.toString().padStart(4)}  ELITE: ${a.elite.toString().padStart(4)}  SIEGE: ${a.siege.toString().padStart(4)}   ║`);
  console.log(`║    Upkeep: ${fmt(upkeepPerHour()).padStart(6)}/h                                       ║`);
  
  console.log(`║                                                               ║`);
  console.log(`║  BÂTIMENTS                                                    ║`);
  for (const b of city.buildings.slice(0, 6)) {
    const prod = b.prod ? ` → ${fmt(getProdAtLevel(b.level)).padStart(5)}/h` : '          ';
    console.log(`║    ${b.key.padEnd(12)} Lv.${b.level.toString().padStart(2)}${prod}                         ║`);
  }
  
  if (city.buildQueue.length > 0) {
    console.log(`║                                                               ║`);
    console.log(`║  EN CONSTRUCTION: ${city.buildQueue.length}                                            ║`);
    for (const q of city.buildQueue) {
      const remaining = Math.max(0, q.endsAt - tick * CONFIG.TICK_SEC);
      console.log(`║    ${q.key.padEnd(12)} → Lv.${q.targetLevel} (${fmtTime(remaining).padStart(6)})                   ║`);
    }
  }
  
  if (city.recruitQueue.length > 0) {
    console.log(`║                                                               ║`);
    console.log(`║  RECRUTEMENT: ${city.recruitQueue.length}                                              ║`);
    for (const q of city.recruitQueue) {
      const remaining = Math.max(0, q.endsAt - tick * CONFIG.TICK_SEC);
      console.log(`║    ${q.count}x ${q.tier.padEnd(12)} (${fmtTime(remaining).padStart(6)})                        ║`);
    }
  }
  
  console.log(`╚═══════════════════════════════════════════════════════════════╝`);
}

function printStats() {
  const p = stats.produced;
  const c = stats.consumed;
  
  console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║  STATISTIQUES FINALES - 48H                                   ║`);
  console.log(`╠═══════════════════════════════════════════════════════════════╣`);
  
  console.log(`║  PRODUCTION TOTALE                                            ║`);
  console.log(`║    Bois:    ${fmt(p.wood).padStart(10)}                                     ║`);
  console.log(`║    Pierre:  ${fmt(p.stone).padStart(10)}                                     ║`);
  console.log(`║    Fer:     ${fmt(p.iron).padStart(10)}                                     ║`);
  console.log(`║    Nourrit: ${fmt(p.food).padStart(10)}                                     ║`);
  
  console.log(`║                                                               ║`);
  console.log(`║  CONSOMMATION TOTALE                                          ║`);
  console.log(`║    Bois:    ${fmt(c.wood).padStart(10)}  (construction + recrutement)       ║`);
  console.log(`║    Pierre:  ${fmt(c.stone).padStart(10)}                                     ║`);
  console.log(`║    Fer:     ${fmt(c.iron).padStart(10)}                                     ║`);
  console.log(`║    Nourrit: ${fmt(c.food).padStart(10)}  (upkeep + construction)            ║`);
  
  console.log(`║                                                               ║`);
  console.log(`║  RÉSUMÉ                                                       ║`);
  console.log(`║    Bâtiments complétés: ${stats.buildingsUp.toString().padStart(4)}                                 ║`);
  console.log(`║    Unités recrutées:    ${(stats.recruited.base + stats.recruited.intermediate + stats.recruited.elite).toString().padStart(4)}                                 ║`);
  console.log(`║      - Base:         ${stats.recruited.base.toString().padStart(4)}                                    ║`);
  console.log(`║      - Intermédiaire:${stats.recruited.intermediate.toString().padStart(4)}                                    ║`);
  console.log(`║      - Elite:        ${stats.recruited.elite.toString().padStart(4)}                                    ║`);
  console.log(`║    Pic d'armée:         ${stats.peakArmy.toString().padStart(4)}                                 ║`);
  console.log(`║    Pénuries nourriture: ${stats.shortages.toString().padStart(4)}                                 ║`);
  console.log(`║    Unités soignées:     ${stats.healed.toString().padStart(4)}                                 ║`);
  
  console.log(`╚═══════════════════════════════════════════════════════════════╝`);
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
console.log(`║           SIMULATION 48H - MonJeu Alpha v0.1.6               ║`);
console.log(`║           Tick: ${CONFIG.TICK_SEC}s | Total: ${TOTAL_TICKS} ticks                    ║`);
console.log(`╚═══════════════════════════════════════════════════════════════╝`);

const startTime = Date.now();

printState('ÉTAT INITIAL (T=0)');

const checkpoints = [1, 6, 12, 24, 48];
let cpIdx = 0;

for (let i = 0; i < TOTAL_TICKS; i++) {
  runTick();
  const hour = (tick * CONFIG.TICK_SEC) / 3600;
  if (cpIdx < checkpoints.length && hour >= checkpoints[cpIdx]) {
    printState(`HEURE ${checkpoints[cpIdx]}`);
    cpIdx++;
  }
}

const elapsed = Date.now() - startTime;

printStats();

console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
console.log(`║  PERFORMANCE                                                  ║`);
console.log(`║    Temps réel: ${elapsed}ms                                          ║`);
console.log(`║    Ticks/sec:  ${Math.round(TOTAL_TICKS / (elapsed / 1000))}                                        ║`);
console.log(`║    Ratio:      ${(CONFIG.SIM_HOURS * 3600 / (elapsed / 1000)).toFixed(0)}x temps réel                           ║`);
console.log(`╚═══════════════════════════════════════════════════════════════╝`);
