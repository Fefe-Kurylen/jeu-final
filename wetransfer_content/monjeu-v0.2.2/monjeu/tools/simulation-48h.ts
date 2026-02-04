/**
 * SIMULATION 48H - MonJeu Alpha
 * 
 * Simule 48 heures de jeu pour tester:
 * - Production de ressources
 * - Consommation nourriture (upkeep)
 * - Construction
 * - Recrutement
 * - Économie globale
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const TICK_INTERVAL_SEC = 30;
const TICK_HOURS = TICK_INTERVAL_SEC / 3600;
const TICKS_PER_HOUR = 3600 / TICK_INTERVAL_SEC; // 120 ticks/h
const SIMULATION_HOURS = 48;
const TOTAL_TICKS = SIMULATION_HOURS * TICKS_PER_HOUR; // 5760 ticks

// Resource production per hour by building level (from GDD)
const PRODUCTION_CURVES = {
  L1: 20,
  L5: 100,
  L10: 350,
  L15: 800,
  L20: 1200,
};

// Upkeep per hour by tier
const UPKEEP_RATES = {
  base: 5,
  intermediate: 10,
  elite: 15,
  siege: 15,
};

// Recruitment times (seconds per unit)
const RECRUIT_TIMES = {
  base: 60,
  intermediate: 120,
  elite: 180,
  siege: 600,
};

// Unit costs (base, multiplied by tier)
const UNIT_COSTS = {
  base: { wood: 30, stone: 20, iron: 50, food: 20, mult: 1.3 },
  intermediate: { wood: 54, stone: 36, iron: 90, food: 36, mult: 1.7 },
  elite: { wood: 96, stone: 64, iron: 160, food: 64, mult: 1.9 },
  siege: { wood: 200, stone: 300, iron: 100, food: 50, mult: 1.0 },
};

// ============================================================================
// HELPERS
// ============================================================================

function lerpExp(a: number, b: number, t: number): number {
  if (a <= 0 || b <= 0) return a + (b - a) * t;
  return a * Math.pow(b / a, t);
}

function getProdAtLevel(level: number, maxLevel: number = 20): number {
  const t = (level - 1) / (maxLevel - 1);
  return Math.round(lerpExp(PRODUCTION_CURVES.L1, PRODUCTION_CURVES.L20, t));
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return Math.round(n).toString();
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// ============================================================================
// CITY STATE
// ============================================================================

interface Building {
  key: string;
  level: number;
  prodType?: 'wood' | 'stone' | 'iron' | 'food';
}

interface Army {
  base: number;
  intermediate: number;
  elite: number;
  siege: number;
}

interface City {
  name: string;
  resources: {
    wood: number;
    stone: number;
    iron: number;
    food: number;
  };
  maxStorage: number;
  maxFoodStorage: number;
  buildings: Building[];
  army: Army;
  buildQueue: Array<{ building: string; targetLevel: number; endsAt: number }>;
  recruitQueue: Array<{ tier: keyof Army; count: number; endsAt: number }>;
}

// ============================================================================
// SIMULATION
// ============================================================================

class GameSimulator {
  private city: City;
  private currentTick: number = 0;
  private stats = {
    totalWoodProduced: 0,
    totalStoneProduced: 0,
    totalIronProduced: 0,
    totalFoodProduced: 0,
    totalFoodConsumed: 0,
    unitsRecruited: { base: 0, intermediate: 0, elite: 0, siege: 0 },
    buildingsCompleted: 0,
    peakArmy: 0,
    foodShortages: 0,
  };

  constructor() {
    // Initialize city with starter setup
    this.city = {
      name: 'Roma Prima',
      resources: {
        wood: 5000,
        stone: 5000,
        iron: 5000,
        food: 5000,
      },
      maxStorage: 160000,
      maxFoodStorage: 160000,
      buildings: [
        { key: 'MAIN_HALL', level: 1 },
        { key: 'FARM', level: 1, prodType: 'food' },
        { key: 'LUMBER', level: 1, prodType: 'wood' },
        { key: 'QUARRY', level: 1, prodType: 'stone' },
        { key: 'IRON_MINE', level: 1, prodType: 'iron' },
        { key: 'BARRACKS', level: 1 },
        { key: 'WAREHOUSE', level: 1 },
        { key: 'SILO', level: 1 },
      ],
      army: {
        base: 20,
        intermediate: 0,
        elite: 0,
        siege: 0,
      },
      buildQueue: [],
      recruitQueue: [],
    };
  }

  private getBuilding(key: string): Building | undefined {
    return this.city.buildings.find(b => b.key === key);
  }

  private getTotalArmySize(): number {
    const a = this.city.army;
    return a.base + a.intermediate + a.elite + a.siege;
  }

  private getHourlyUpkeep(): number {
    const a = this.city.army;
    return (
      a.base * UPKEEP_RATES.base +
      a.intermediate * UPKEEP_RATES.intermediate +
      a.elite * UPKEEP_RATES.elite +
      a.siege * UPKEEP_RATES.siege
    );
  }

  private getHourlyProduction(type: 'wood' | 'stone' | 'iron' | 'food'): number {
    let total = 0;
    for (const b of this.city.buildings) {
      if (b.prodType === type) {
        total += getProdAtLevel(b.level);
      }
    }
    return total;
  }

  // Production tick
  private tickProduction() {
    const types: Array<'wood' | 'stone' | 'iron' | 'food'> = ['wood', 'stone', 'iron', 'food'];
    
    for (const type of types) {
      const prodPerHour = this.getHourlyProduction(type);
      const gain = prodPerHour * TICK_HOURS;
      const maxCap = type === 'food' ? this.city.maxFoodStorage : this.city.maxStorage;
      
      const before = this.city.resources[type];
      this.city.resources[type] = Math.min(before + gain, maxCap);
      
      const actualGain = this.city.resources[type] - before;
      if (type === 'wood') this.stats.totalWoodProduced += actualGain;
      else if (type === 'stone') this.stats.totalStoneProduced += actualGain;
      else if (type === 'iron') this.stats.totalIronProduced += actualGain;
      else if (type === 'food') this.stats.totalFoodProduced += actualGain;
    }
  }

  // Upkeep tick
  private tickUpkeep() {
    const upkeepPerHour = this.getHourlyUpkeep();
    const cost = upkeepPerHour * TICK_HOURS;
    
    this.city.resources.food -= cost;
    this.stats.totalFoodConsumed += cost;
    
    if (this.city.resources.food < 0) {
      this.stats.foodShortages++;
      this.city.resources.food = 0;
    }
  }

  // Construction tick
  private tickConstruction() {
    const currentTimeSec = this.currentTick * TICK_INTERVAL_SEC;
    
    // Complete finished buildings
    const finished = this.city.buildQueue.filter(q => q.endsAt <= currentTimeSec);
    for (const item of finished) {
      const building = this.getBuilding(item.building);
      if (building) {
        building.level = item.targetLevel;
        this.stats.buildingsCompleted++;
      }
    }
    this.city.buildQueue = this.city.buildQueue.filter(q => q.endsAt > currentTimeSec);
  }

  // Recruitment tick
  private tickRecruitment() {
    const currentTimeSec = this.currentTick * TICK_INTERVAL_SEC;
    
    const finished = this.city.recruitQueue.filter(q => q.endsAt <= currentTimeSec);
    for (const item of finished) {
      this.city.army[item.tier] += item.count;
      this.stats.unitsRecruited[item.tier] += item.count;
    }
    this.city.recruitQueue = this.city.recruitQueue.filter(q => q.endsAt > currentTimeSec);
    
    // Track peak army
    const total = this.getTotalArmySize();
    if (total > this.stats.peakArmy) {
      this.stats.peakArmy = total;
    }
  }

  // AI: decide what to build/recruit
  private aiDecisions() {
    const currentTimeSec = this.currentTick * TICK_INTERVAL_SEC;
    const r = this.city.resources;
    
    // Build priority: FARM > IRON_MINE > LUMBER > QUARRY > MAIN_HALL
    if (this.city.buildQueue.length < 2) {
      const mainHall = this.getBuilding('MAIN_HALL')!;
      const priorities = [
        { key: 'FARM', minLevel: mainHall.level },
        { key: 'IRON_MINE', minLevel: mainHall.level },
        { key: 'LUMBER', minLevel: mainHall.level },
        { key: 'QUARRY', minLevel: mainHall.level },
        { key: 'MAIN_HALL', minLevel: 30 },
        { key: 'BARRACKS', minLevel: mainHall.level },
      ];
      
      for (const p of priorities) {
        const building = this.getBuilding(p.key);
        if (!building) continue;
        if (building.level >= p.minLevel) continue;
        if (building.level >= mainHall.level && p.key !== 'MAIN_HALL') continue;
        
        // Check if already in queue
        if (this.city.buildQueue.some(q => q.building === p.key)) continue;
        
        // Simple cost check (level * 100 for each resource)
        const cost = building.level * 100;
        if (r.wood >= cost && r.stone >= cost && r.iron >= cost && r.food >= cost) {
          const duration = building.level * 60; // 1 min per level (simplified)
          this.city.buildQueue.push({
            building: p.key,
            targetLevel: building.level + 1,
            endsAt: currentTimeSec + duration,
          });
          r.wood -= cost;
          r.stone -= cost;
          r.iron -= cost;
          r.food -= cost;
          break;
        }
      }
    }
    
    // Recruit priority: maintain army based on food production
    if (this.city.recruitQueue.length < 3) {
      const foodProd = this.getHourlyProduction('food');
      const currentUpkeep = this.getHourlyUpkeep();
      const surplus = foodProd - currentUpkeep;
      
      // Only recruit if we have food surplus
      if (surplus > 50 && r.food > 1000) {
        // Decide what to recruit
        let tier: keyof Army = 'base';
        let count = 5;
        
        const barracks = this.getBuilding('BARRACKS');
        if (barracks && barracks.level >= 10) {
          tier = 'intermediate';
          count = 3;
        }
        if (barracks && barracks.level >= 15) {
          tier = 'elite';
          count = 2;
        }
        
        const costs = UNIT_COSTS[tier];
        const totalCost = {
          wood: costs.wood * costs.mult * count,
          stone: costs.stone * costs.mult * count,
          iron: costs.iron * costs.mult * count,
          food: costs.food * costs.mult * count,
        };
        
        if (r.wood >= totalCost.wood && r.stone >= totalCost.stone && 
            r.iron >= totalCost.iron && r.food >= totalCost.food) {
          const duration = RECRUIT_TIMES[tier] * count;
          this.city.recruitQueue.push({
            tier,
            count,
            endsAt: currentTimeSec + duration,
          });
          r.wood -= totalCost.wood;
          r.stone -= totalCost.stone;
          r.iron -= totalCost.iron;
          r.food -= totalCost.food;
        }
      }
    }
  }

  // Run single tick
  private tick() {
    this.tickProduction();
    this.tickUpkeep();
    this.tickConstruction();
    this.tickRecruitment();
    this.aiDecisions();
    this.currentTick++;
  }

  // Run full simulation
  run() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('           SIMULATION 48H - MonJeu Alpha v0.1.6');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Configuration:`);
    console.log(`  - Tick interval: ${TICK_INTERVAL_SEC}s`);
    console.log(`  - Ticks per hour: ${TICKS_PER_HOUR}`);
    console.log(`  - Total ticks: ${TOTAL_TICKS}`);
    console.log(`  - Simulation duration: ${SIMULATION_HOURS}h`);
    console.log('');
    
    const startTime = Date.now();
    
    // Log initial state
    console.log('ÉTAT INITIAL:');
    this.logState();
    
    // Run simulation with checkpoints
    const checkpoints = [1, 6, 12, 24, 48];
    let nextCheckpoint = 0;
    
    for (let i = 0; i < TOTAL_TICKS; i++) {
      this.tick();
      
      const currentHour = (this.currentTick * TICK_INTERVAL_SEC) / 3600;
      if (nextCheckpoint < checkpoints.length && currentHour >= checkpoints[nextCheckpoint]) {
        console.log(`\n══════════ CHECKPOINT: ${checkpoints[nextCheckpoint]}H ══════════`);
        this.logState();
        nextCheckpoint++;
      }
    }
    
    const elapsed = Date.now() - startTime;
    
    // Final report
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    RAPPORT FINAL - 48H');
    console.log('═══════════════════════════════════════════════════════════════');
    this.logState();
    this.logStats();
    
    console.log('\n───────────────────────────────────────────────────────────────');
    console.log(`Simulation completed in ${elapsed}ms`);
    console.log(`Performance: ${(TOTAL_TICKS / (elapsed / 1000)).toFixed(0)} ticks/second`);
    console.log('═══════════════════════════════════════════════════════════════');
    
    return {
      city: this.city,
      stats: this.stats,
      elapsed,
    };
  }

  private logState() {
    const r = this.city.resources;
    const a = this.city.army;
    
    console.log(`\n  Ressources:`);
    console.log(`    Bois:    ${formatNumber(r.wood).padStart(8)} (${formatNumber(this.getHourlyProduction('wood'))}/h)`);
    console.log(`    Pierre:  ${formatNumber(r.stone).padStart(8)} (${formatNumber(this.getHourlyProduction('stone'))}/h)`);
    console.log(`    Fer:     ${formatNumber(r.iron).padStart(8)} (${formatNumber(this.getHourlyProduction('iron'))}/h)`);
    console.log(`    Nourrit: ${formatNumber(r.food).padStart(8)} (${formatNumber(this.getHourlyProduction('food'))}/h)`);
    
    console.log(`\n  Armée (${this.getTotalArmySize()} total):`);
    console.log(`    BASE:         ${a.base}`);
    console.log(`    INTERMEDIATE: ${a.intermediate}`);
    console.log(`    ELITE:        ${a.elite}`);
    console.log(`    SIEGE:        ${a.siege}`);
    console.log(`    Upkeep:       ${formatNumber(this.getHourlyUpkeep())} food/h`);
    
    console.log(`\n  Bâtiments:`);
    for (const b of this.city.buildings) {
      const prod = b.prodType ? ` (${formatNumber(getProdAtLevel(b.level))}/h)` : '';
      console.log(`    ${b.key.padEnd(12)} Lv.${b.level}${prod}`);
    }
    
    console.log(`\n  Files d'attente:`);
    console.log(`    Construction: ${this.city.buildQueue.length} en cours`);
    console.log(`    Recrutement:  ${this.city.recruitQueue.length} en cours`);
  }

  private logStats() {
    const s = this.stats;
    
    console.log(`\n  STATISTIQUES CUMULÉES:`);
    console.log(`    Production totale:`);
    console.log(`      Bois:    ${formatNumber(s.totalWoodProduced)}`);
    console.log(`      Pierre:  ${formatNumber(s.totalStoneProduced)}`);
    console.log(`      Fer:     ${formatNumber(s.totalIronProduced)}`);
    console.log(`      Nourrit: ${formatNumber(s.totalFoodProduced)}`);
    console.log(`    Nourriture consommée: ${formatNumber(s.totalFoodConsumed)}`);
    console.log(`    Balance nourriture:   ${formatNumber(s.totalFoodProduced - s.totalFoodConsumed)}`);
    console.log(`    Pénuries nourriture:  ${s.foodShortages}`);
    console.log(`    Bâtiments complétés:  ${s.buildingsCompleted}`);
    console.log(`    Unités recrutées:`);
    console.log(`      BASE:         ${s.unitsRecruited.base}`);
    console.log(`      INTERMEDIATE: ${s.unitsRecruited.intermediate}`);
    console.log(`      ELITE:        ${s.unitsRecruited.elite}`);
    console.log(`      SIEGE:        ${s.unitsRecruited.siege}`);
    console.log(`    Pic d'armée:          ${s.peakArmy}`);
  }
}

// ============================================================================
// RUN SIMULATION
// ============================================================================

const sim = new GameSimulator();
sim.run();
