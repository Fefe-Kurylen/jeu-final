import { Processor, Process } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { simulateBattle } from '@libs/combat/src/engine';
import { loadUnitsFromJson, loadFactionBonusesFromJson, loadBuildingsFromJson, timeAtLevelSec } from '@libs/game-data/src/loader';
import { prodPerHourAtLevel, getProdType } from '@libs/game-data/src/buildings.loader';

// ============================================================================
// CONFIGURATION & DATA LOADING
// ============================================================================

const DATA_UNITS_PATH = process.env.DATA_UNITS_PATH ?? 'data/units.json';
const DATA_FACTIONS_PATH = process.env.DATA_FACTIONS_PATH ?? 'data/factions.json';
const DATA_BUILDINGS_PATH = process.env.DATA_BUILDINGS_PATH ?? 'data/buildings.json';

const TICK_INTERVAL_SEC = 30;
const TICK_HOURS = TICK_INTERVAL_SEC / 3600;

// Lazy load data once at startup
let RUNTIME_UNITS: any = null;
let RUNTIME_FACTIONS: any = null;
let RUNTIME_BUILDINGS: any = null;

function getUnits() {
  if (!RUNTIME_UNITS) {
    try { RUNTIME_UNITS = loadUnitsFromJson(DATA_UNITS_PATH); }
    catch { RUNTIME_UNITS = {}; }
  }
  return RUNTIME_UNITS;
}

function getFactions() {
  if (!RUNTIME_FACTIONS) {
    try { RUNTIME_FACTIONS = loadFactionBonusesFromJson(DATA_FACTIONS_PATH); }
    catch { RUNTIME_FACTIONS = {}; }
  }
  return RUNTIME_FACTIONS;
}

function getBuildings() {
  if (!RUNTIME_BUILDINGS) {
    try { RUNTIME_BUILDINGS = loadBuildingsFromJson(DATA_BUILDINGS_PATH); }
    catch { RUNTIME_BUILDINGS = {}; }
  }
  return RUNTIME_BUILDINGS;
}

// Unit registry for combat
const registry = {
  getUnit: (key: string) => {
    if (key.startsWith('TRIBE_')) return createTribeUnit(key);
    const units = getUnits();
    const u = units[key];
    if (!u) throw new Error('Unknown unit: ' + key);
    return u;
  }
};

function createTribeUnit(key: string) {
  const parts = key.split('_');
  const lvl = Number((parts[1] ?? 'L1').replace('L', '')) || 1;
  const role = parts[2] ?? 'INF';
  const range = lvl === 1 ? [1, 4] : lvl === 2 ? [2, 6] : [2, 7];
  const avg = (range[0] + range[1]) / 2;
  
  const tier = lvl === 1 ? 'base' : lvl === 2 ? 'intermediate' : 'elite';
  return {
    key,
    tier,
    type: role,
    stats: {
      attack: Math.round((avg + (role === 'ARCH' ? 0.5 : role === 'CAV' ? 0.25 : 0)) / 10 * 125),
      defense: Math.round((avg + (role === 'INF' ? 0.5 : 0)) / 10 * 125),
      endurance: Math.round(avg / 10 * 125),
      speed: Math.max(10, Math.round((avg + (role === 'CAV' ? 1 : role === 'ARCH' ? 0.5 : 0)) / 10 * 100)),
      transport: 0,
    }
  };
}

// ============================================================================
// UPKEEP CONSTANTS (per hour)
// ============================================================================
const UPKEEP_PER_HOUR: Record<string, number> = {
  base: 5,
  intermediate: 10,
  elite: 15,
  siege: 15,
};

// ============================================================================
// RECRUITMENT TIME CONSTANTS (seconds per unit)
// ============================================================================
const RECRUIT_TIME_SEC: Record<string, number> = {
  base: 60,       // 1 min
  intermediate: 120, // 2 min
  elite: 180,     // 3 min
  siege: 600,     // 10 min
};

// ============================================================================
// MAIN TICK PROCESSOR
// ============================================================================

@Processor('game')
export class TickProcessor {
  private readonly logger = new Logger(TickProcessor.name);
  
  constructor(
    private prisma: any, // PrismaService
    @Inject('REDIS') private redis: Redis,
  ) {}

  @Process('tick30s')
  async handleTick() {
    const lockKey = 'lock:tick30s';
    const lockAcquired = await this.redis.set(lockKey, '1', 'PX', 25_000, 'NX');
    if (!lockAcquired) return;

    const startTime = Date.now();
    const now = new Date();

    try {
      // Execute all ticks in optimal order
      await this.cityResourceProductionTick();      // 1. Production first
      await this.upkeepTick();                       // 2. Consume food
      await this.constructionTick(now);              // 3. Finish buildings
      await this.recruitmentTick(now);               // 4. Finish recruitment
      await this.movementTick(now);                  // 5. Army movements & combat
      await this.resourceNodeRegenTick();            // 6. Node regeneration
      await this.siegeTick();                        // 7. Siege damage
      await this.healTick();                         // 8. Heal wounded
      await this.expeditionTick(now);                // 9. Expedition generation & completion
      await this.bastionTick(now);                   // 10. Bastion construction
      await this.tradeRoutesTick(now);               // 11. Auto trade routes

      const elapsed = Date.now() - startTime;
      this.logger.log(`Tick completed in ${elapsed}ms`);
    } catch (error) {
      this.logger.error('Tick failed:', error);
    }
  }

  // ==========================================================================
  // 1. CITY RESOURCE PRODUCTION (OPTIMIZED - Batch updates)
  // ==========================================================================
  private async cityResourceProductionTick() {
    const cities = await this.prisma.city.findMany({
      where: { isSieged: false },
      include: { buildings: true },
    });

    const buildings = getBuildings();
    const updates: Array<{ id: string; data: any }> = [];

    for (const city of cities) {
      let woodProd = 0, stoneProd = 0, ironProd = 0, foodProd = 0;

      for (const building of city.buildings) {
        const def = buildings[building.key];
        if (!def) continue;

        const prodType = getProdType(def);
        if (!prodType) continue;

        const prod = prodPerHourAtLevel(def, building.level) * TICK_HOURS;

        switch (prodType) {
          case 'wood': woodProd += prod; break;
          case 'stone': stoneProd += prod; break;
          case 'iron': ironProd += prod; break;
          case 'food': foodProd += prod; break;
        }
      }

      // Only update if there's production
      if (woodProd > 0 || stoneProd > 0 || ironProd > 0 || foodProd > 0) {
        updates.push({
          id: city.id,
          data: {
            wood: Math.min(city.wood + woodProd, city.maxStorage),
            stone: Math.min(city.stone + stoneProd, city.maxStorage),
            iron: Math.min(city.iron + ironProd, city.maxStorage),
            food: Math.min(city.food + foodProd, city.maxFoodStorage),
          }
        });
      }
    }

    // Batch update using transaction
    if (updates.length > 0) {
      await this.prisma.$transaction(
        updates.map(u => this.prisma.city.update({ where: { id: u.id }, data: u.data }))
      );
    }
  }

  // ==========================================================================
  // 2. FOOD UPKEEP (OPTIMIZED - Single query, batch update)
  // ==========================================================================
  private async upkeepTick() {
    // Get all data in one query
    const armies = await this.prisma.army.findMany({
      include: {
        units: true,
        owner: { include: { hero: true } },
      },
    });

    const cities = await this.prisma.city.findMany({
      select: { id: true, isSieged: true },
    });
    const citySiegeMap = new Map(cities.map(c => [c.id, c.isSieged]));

    // Calculate food consumption per city
    const foodByCity: Record<string, number> = {};

    for (const army of armies) {
      const payCityId = army.originCityId;
      if (!payCityId) continue;

      let mult = 1.0;

      // Siege modifiers
      if (army.status === 'SIEGING') mult *= 1.10;
      const inSiegedCity = citySiegeMap.get(army.cityId ?? '') === true;
      if (inSiegedCity && army.status === 'IN_CITY') mult *= 0.90;

      // Hero logistics bonus (-0.5% per point, max 25%)
      const hero = army.owner?.hero;
      if (hero && army.heroId === hero.id) {
        const logReduction = Math.min(0.25, (hero.logPoints || 0) * 0.005);
        mult *= (1 - logReduction);
      }

      // Calculate hourly upkeep
      let perHour = 0;
      for (const unit of army.units) {
        const rate = UPKEEP_PER_HOUR[unit.tier] || 10;
        perHour += unit.count * rate;
      }

      const cost = perHour * mult * TICK_HOURS;
      foodByCity[payCityId] = (foodByCity[payCityId] || 0) + cost;
    }

    // Batch update cities
    const cityIds = Object.keys(foodByCity);
    if (cityIds.length > 0) {
      await this.prisma.$transaction(
        cityIds.map(cityId =>
          this.prisma.city.update({
            where: { id: cityId },
            data: { food: { decrement: foodByCity[cityId] } },
          })
        )
      );
    }
  }

  // ==========================================================================
  // 3. CONSTRUCTION TICK (OPTIMIZED)
  // ==========================================================================
  private async constructionTick(now: Date) {
    const buildings = getBuildings();

    // 1) Complete finished constructions
    const finished = await this.prisma.buildQueueItem.findMany({
      where: { status: 'RUNNING', endsAt: { lte: now } },
      include: { city: { select: { ownerId: true } } },
    });

    for (const item of finished) {
      const def = buildings[item.buildingKey];
      const category = def?.category ?? 'INTERMEDIATE';
      const prodPerHour = def ? prodPerHourAtLevel(def, item.targetLevel) : 0;

      await this.prisma.$transaction([
        this.prisma.cityBuilding.upsert({
          where: { cityId_key: { cityId: item.cityId, key: item.buildingKey } },
          update: { level: item.targetLevel, category, prodPerHour },
          create: { cityId: item.cityId, key: item.buildingKey, level: item.targetLevel, category, prodPerHour },
        }),
        this.prisma.buildQueueItem.update({
          where: { id: item.id },
          data: { status: 'DONE' },
        }),
      ]);

      // Recalculate population
      if (item.city?.ownerId) {
        await this.recomputePlayerPopulation(item.city.ownerId);
      }
    }

    // 2) Start queued constructions
    const citiesWithQueue = await this.prisma.city.findMany({
      select: { id: true },
      where: {
        buildQueue: {
          some: { status: { in: ['RUNNING', 'QUEUED'] } },
        },
      },
    });

    for (const city of citiesWithQueue) {
      const queue = await this.prisma.buildQueueItem.findMany({
        where: { cityId: city.id, status: { in: ['RUNNING', 'QUEUED'] } },
        orderBy: { startedAt: 'asc' },
      });

      const runningSlots = new Set(
        queue.filter(q => q.status === 'RUNNING').map(q => q.slot)
      );
      const freeSlots = [1, 2].filter(s => !runningSlots.has(s));
      if (freeSlots.length === 0) continue;

      const queued = queue
        .filter(q => q.status === 'QUEUED' && (q.slot === 3 || q.slot === 4))
        .sort((a, b) => a.slot - b.slot);

      for (const freeSlot of freeSlots) {
        const next = queued.shift();
        if (!next) break;

        const def = buildings[next.buildingKey];
        const durationSec = def ? timeAtLevelSec(def, next.targetLevel) : 60;
        const endsAt = new Date(now.getTime() + durationSec * 1000);

        await this.prisma.buildQueueItem.update({
          where: { id: next.id },
          data: { status: 'RUNNING', slot: freeSlot, startedAt: now, endsAt },
        });
      }
    }
  }

  // ==========================================================================
  // 4. RECRUITMENT TICK (NEW - with queue)
  // ==========================================================================
  private async recruitmentTick(now: Date) {
    const units = getUnits();

    // 1) Complete finished recruitments
    const finished = await this.prisma.recruitmentQueueItem.findMany({
      where: { status: 'RUNNING', endsAt: { lte: now } },
    });

    for (const item of finished) {
      // Find garrison army
      const army = await this.prisma.army.findFirst({
        where: { cityId: item.cityId, status: 'IN_CITY' },
      });

      if (army) {
        const unitDef = units[item.unitKey];
        const tier = unitDef?.tier || 'base';

        await this.prisma.armyUnit.upsert({
          where: { armyId_unitKey: { armyId: army.id, unitKey: item.unitKey } },
          update: { count: { increment: item.count } },
          create: { armyId: army.id, unitKey: item.unitKey, tier, count: item.count },
        });
      }

      await this.prisma.recruitmentQueueItem.update({
        where: { id: item.id },
        data: { status: 'DONE' },
      });
    }

    // 2) Start next queued recruitment per building
    const cities = await this.prisma.city.findMany({
      select: { id: true },
      where: {
        recruitQueue: { some: { status: 'QUEUED' } },
      },
    });

    for (const city of cities) {
      // Get running items grouped by building
      const running = await this.prisma.recruitmentQueueItem.findMany({
        where: { cityId: city.id, status: 'RUNNING' },
      });
      const runningBuildings = new Set(running.map(r => r.buildingKey));

      // Get queued items
      const queued = await this.prisma.recruitmentQueueItem.findMany({
        where: { cityId: city.id, status: 'QUEUED' },
        orderBy: { startedAt: 'asc' },
      });

      for (const next of queued) {
        if (runningBuildings.has(next.buildingKey)) continue;

        const unitDef = units[next.unitKey];
        const tier = unitDef?.tier || 'base';
        const unitType = unitDef?.type || 'INF';

        // Calculate training time
        let baseTime = RECRUIT_TIME_SEC[tier] || 60;
        if (unitType === 'CAV') baseTime = Math.ceil(baseTime * 1.25);
        const totalTime = baseTime * next.count;
        const endsAt = new Date(now.getTime() + totalTime * 1000);

        await this.prisma.recruitmentQueueItem.update({
          where: { id: next.id },
          data: { status: 'RUNNING', startedAt: now, endsAt },
        });

        runningBuildings.add(next.buildingKey);
      }
    }
  }

  // ==========================================================================
  // 5. MOVEMENT & COMBAT TICK
  // ==========================================================================
  private async movementTick(now: Date) {
    const arrived = await this.prisma.army.findMany({
      where: { status: 'MOVING', arrivalAt: { lte: now } },
      include: { units: true, owner: { include: { hero: true } } },
    });

    for (const army of arrived) {
      const tx = army.targetX ?? army.x;
      const ty = army.targetY ?? army.y;

      // Check for city at destination
      const city = await this.prisma.city.findFirst({ where: { x: tx, y: ty } });
      
      if (city) {
        await this.handleCityArrival(army, city, now);
        continue;
      }

      // Check for resource node
      const node = await this.prisma.resourceNode.findFirst({ where: { x: tx, y: ty } });
      
      if (node) {
        await this.handleNodeArrival(army, node);
        continue;
      }

      // Empty tile - just return
      await this.prisma.army.update({
        where: { id: army.id },
        data: { status: 'RETURNING', targetX: null, targetY: null, arrivalAt: null },
      });
    }

    // Handle returning armies
    await this.handleReturningArmies();
  }

  private async handleCityArrival(army: any, city: any, now: Date) {
    // SPY action
    if (army.orderType === 'SPY') {
      await this.executeSpyOnCity(army, city);
      return;
    }

    // Own city - enter it
    if (city.ownerId === army.ownerId) {
      await this.prisma.army.update({
        where: { id: army.id },
        data: {
          status: 'IN_CITY',
          cityId: city.id,
          x: city.x,
          y: city.y,
          targetX: null,
          targetY: null,
          arrivalAt: null,
        },
      });
      return;
    }

    // Enemy city - combat!
    const defenders = await this.prisma.army.findMany({
      where: { cityId: city.id, status: 'IN_CITY' },
      include: { units: true, owner: { include: { hero: true } } },
    });

    if (defenders.length > 0) {
      await this.executeBattle(army, defenders[0], city);
    } else {
      // No defenders - start siege
      await this.prisma.$transaction([
        this.prisma.city.update({
          where: { id: city.id },
          data: { isSieged: true, siegeStartedAt: now },
        }),
        this.prisma.army.update({
          where: { id: army.id },
          data: { status: 'SIEGING', x: city.x, y: city.y, targetX: null, targetY: null, arrivalAt: null },
        }),
      ]);
    }
  }

  private async handleNodeArrival(army: any, node: any) {
    if (army.orderType === 'SPY') {
      await this.executeSpyOnNode(army, node);
      return;
    }

    // Battle with tribe and loot
    const loot = await this.resolveNodeBattle(army, node);
    
    await this.prisma.army.update({
      where: { id: army.id },
      data: {
        status: 'RETURNING',
        targetX: null,
        targetY: null,
        arrivalAt: null,
        orderPayload: { ...((army.orderPayload as any) || {}), loot },
      },
    });
  }

  private async handleReturningArmies() {
    const returning = await this.prisma.army.findMany({
      where: { status: 'RETURNING' },
      include: { units: true },
    });

    for (const army of returning) {
      const origin = await this.prisma.city.findUnique({
        where: { id: army.originCityId },
      });
      if (!origin) continue;

      // Deposit loot
      const payload = (army.orderPayload as any) || {};
      if (payload.loot) {
        const l = payload.loot;
        await this.prisma.city.update({
          where: { id: origin.id },
          data: {
            wood: { increment: l.wood || 0 },
            stone: { increment: l.stone || 0 },
            iron: { increment: l.iron || 0 },
            food: { increment: l.food || 0 },
          },
        });
      }

      // Return to city
      await this.prisma.army.update({
        where: { id: army.id },
        data: {
          status: 'IN_CITY',
          cityId: origin.id,
          x: origin.x,
          y: origin.y,
          orderType: null,
          orderPayload: {},
        },
      });
    }
  }

  // ==========================================================================
  // 6. RESOURCE NODE REGENERATION (OPTIMIZED - Batch)
  // ==========================================================================
  private async resourceNodeRegenTick() {
    const nodes = await this.prisma.resourceNode.findMany();
    const regenRate = 1 / (4 * 3600 / TICK_INTERVAL_SEC); // 4h full regen

    const updates = nodes
      .filter(node => node.filledPct < 1)
      .map(node => ({
        id: node.id,
        filledPct: Math.min(1, node.filledPct + regenRate),
        tribePower: Math.round(node.baseTribePower * Math.min(1, node.filledPct + regenRate)),
      }));

    if (updates.length > 0) {
      await this.prisma.$transaction(
        updates.map(u =>
          this.prisma.resourceNode.update({
            where: { id: u.id },
            data: { filledPct: u.filledPct, tribePower: u.tribePower },
          })
        )
      );
    }
  }

  // ==========================================================================
  // 7. SIEGE TICK
  // ==========================================================================
  private async siegeTick() {
    const siegedCities = await this.prisma.city.findMany({
      where: { isSieged: true },
    });

    for (const city of siegedCities) {
      const attackers = await this.prisma.army.findMany({
        where: { x: city.x, y: city.y, status: 'SIEGING' },
        include: { units: true },
      });

      // Count siege stars (catapults/mangonels)
      let stars = 0;
      for (const a of attackers) {
        for (const u of a.units) {
          if (u.unitKey?.includes('CATAPULT') || u.unitKey?.includes('MANGON')) {
            stars += 10;
          }
        }
      }

      if (stars <= 0) continue;

      // 10 stars = 30min to break wall (30s tick = 30/1800 per star)
      const hpLoss = (TICK_INTERVAL_SEC / 1800) * (stars / 10);
      const newHp = Math.max(0, city.wallHp - hpLoss);

      await this.prisma.city.update({
        where: { id: city.id },
        data: {
          wallHp: newHp,
          ...(newHp <= 0 ? { isSieged: false, siegeStartedAt: null } : {}),
        },
      });
    }

    // Wall regeneration for non-sieged cities
    const damagedCities = await this.prisma.city.findMany({
      where: { isSieged: false, wallHp: { lt: 1.0 } },
    });

    const regenPerTick = 1 / (24 * 3600 / TICK_INTERVAL_SEC); // 24h full regen

    if (damagedCities.length > 0) {
      await this.prisma.$transaction(
        damagedCities.map(city =>
          this.prisma.city.update({
            where: { id: city.id },
            data: { wallHp: Math.min(1.0, city.wallHp + regenPerTick) },
          })
        )
      );
    }
  }

  // ==========================================================================
  // 8. HEALING TICK
  // ==========================================================================
  private async healTick() {
    const cities = await this.prisma.city.findMany({
      where: { isSieged: false },
      include: { buildings: true, wounded: true },
    });

    for (const city of cities) {
      const tent = city.buildings.find(b => b.key === 'HEALING_TENT');
      if (!tent || city.wounded.length === 0) continue;

      const healCap = 3 * tent.level;
      let remaining = healCap;

      for (const wounded of city.wounded) {
        if (remaining <= 0) break;

        const heal = Math.min(wounded.count, remaining);
        remaining -= heal;

        // Update wounded count
        const newCount = wounded.count - heal;
        if (newCount <= 0) {
          await this.prisma.woundedUnit.delete({ where: { id: wounded.id } });
        } else {
          await this.prisma.woundedUnit.update({
            where: { id: wounded.id },
            data: { count: newCount },
          });
        }

        // Add healed units to garrison
        const army = await this.prisma.army.findFirst({
          where: { cityId: city.id, status: 'IN_CITY' },
        });

        if (army) {
          await this.prisma.armyUnit.upsert({
            where: { armyId_unitKey: { armyId: army.id, unitKey: wounded.unitKey } },
            update: { count: { increment: heal } },
            create: { armyId: army.id, unitKey: wounded.unitKey, tier: 'base', count: heal },
          });
        }
      }
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private async recomputePlayerPopulation(playerId: string) {
    const cities = await this.prisma.city.findMany({
      where: { ownerId: playerId },
      include: { buildings: true },
    });

    const buildings = getBuildings();
    let pop = 0;

    for (const city of cities) {
      for (const b of city.buildings) {
        const def = buildings[b.key];
        const maxLevel = def?.maxLevel ?? 20;
        const cat = def?.category ?? b.category;
        pop += this.calcBuildingPop(b.level, cat, maxLevel);
      }
    }

    await this.prisma.player.update({
      where: { id: playerId },
      data: { population: pop },
    });
  }

  private calcBuildingPop(level: number, category: string, maxLevel: number): number {
    if (maxLevel !== 20) return 4 * level;
    const t = (level - 1) / 19;
    switch (category) {
      case 'BASE': return Math.round(1 + 2 * t);
      case 'INTERMEDIATE': return Math.round(2 + 3 * t);
      case 'ADVANCED': return Math.round(3 + 4 * t);
      case 'FACTION': return 4 * level;
      default: return Math.round(2 + 3 * t);
    }
  }

  private async executeSpyOnCity(army: any, city: any) {
    const defenders = await this.prisma.army.findMany({
      where: { cityId: city.id, status: 'IN_CITY' },
      include: { units: true },
    });

    const payload = {
      targetType: 'CITY',
      x: city.x,
      y: city.y,
      city: {
        id: city.id,
        ownerId: city.ownerId,
        type: city.type,
        isSieged: city.isSieged,
        wallHpPct: city.wallHp,
        defenders: defenders.map(d => ({
          armyId: d.id,
          units: d.units.map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })),
        })),
      },
    };

    await this.prisma.$transaction([
      this.prisma.spyReport.create({
        data: {
          attackerId: army.ownerId,
          targetType: 'CITY',
          targetX: city.x,
          targetY: city.y,
          payload,
        },
      }),
      this.prisma.army.update({
        where: { id: army.id },
        data: { status: 'RETURNING', targetX: null, targetY: null, arrivalAt: null },
      }),
    ]);
  }

  private async executeSpyOnNode(army: any, node: any) {
    const payload = {
      targetType: 'RESOURCE',
      x: node.x,
      y: node.y,
      node: {
        id: node.id,
        kind: node.kind,
        level: node.level,
        filledPct: node.filledPct,
        tribePower: node.tribePower,
      },
    };

    await this.prisma.$transaction([
      this.prisma.spyReport.create({
        data: {
          attackerId: army.ownerId,
          targetType: 'RESOURCE',
          targetX: node.x,
          targetY: node.y,
          payload,
        },
      }),
      this.prisma.army.update({
        where: { id: army.id },
        data: { status: 'RETURNING', targetX: null, targetY: null, arrivalAt: null },
      }),
    ]);
  }

  private async executeBattle(attacker: any, defender: any, city: any) {
    const factions = getFactions();

    const atkSnap = this.createArmySnapshot(attacker);
    const defSnap = this.createArmySnapshot(defender);

    const ctx = {
      mode: attacker.orderType === 'RAID' ? 'RAID' : 'CITY_ATTACK',
      isSiegeState: city.isSieged,
      defenderInCity: true,
      attackerInCity: false,
      attackerFactionBonus: factions[attacker.owner.faction] || {},
      defenderFactionBonus: factions[defender.owner.faction] || {},
    };

    const result = simulateBattle(registry, atkSnap, defSnap, ctx as any);

    // Apply losses
    await this.applyBattleLosses(result, attacker.id, defender.id, city.id);

    // Create battle report
    await this.prisma.battleReport.create({
      data: {
        type: attacker.orderType === 'RAID' ? 'RAID' : 'CITY_ATTACK',
        winner: result.winner,
        attackerId: attacker.ownerId,
        defenderId: defender.ownerId,
        attackerArmyId: attacker.id,
        defenderArmyId: defender.id,
        rounds: result.rounds,
        payload: result,
        visibleToAttacker: true,
        visibleToDefender: true,
      },
    });

    // Set attacker to returning
    await this.prisma.army.update({
      where: { id: attacker.id },
      data: { status: 'RETURNING', targetX: null, targetY: null, arrivalAt: null },
    });
  }

  private async resolveNodeBattle(army: any, node: any): Promise<{ wood: number; stone: number; iron: number; food: number }> {
    const factions = getFactions();
    const atkSnap = this.createArmySnapshot(army);

    // Create tribe defense
    const lvl = node.level;
    const tier = lvl === 1 ? 'base' : lvl === 2 ? 'intermediate' : 'elite';
    const total = Math.max(10, Math.round(node.tribePower / 10));
    const inf = Math.round(total * 0.5);
    const arch = Math.round(total * 0.3);
    const cav = total - inf - arch;

    const defSnap = {
      armyId: `TRIBE:${node.id}`,
      playerId: 'TRIBE',
      faction: 'ROME',
      hero: null,
      stacks: [
        { unitKey: `TRIBE_L${lvl}_INF`, tier, count: inf },
        { unitKey: `TRIBE_L${lvl}_ARCH`, tier, count: arch },
        { unitKey: `TRIBE_L${lvl}_CAV`, tier, count: cav },
      ],
    };

    const ctx = {
      mode: 'FIELD',
      isSiegeState: false,
      defenderInCity: false,
      attackerInCity: false,
      attackerFactionBonus: factions[army.owner.faction] || {},
      defenderFactionBonus: {},
    };

    const result = simulateBattle(registry, atkSnap, defSnap as any, ctx as any);

    // Apply attacker losses
    for (const [unitKey, killed] of Object.entries(result.attacker.killed)) {
      await this.prisma.armyUnit.updateMany({
        where: { armyId: army.id, unitKey },
        data: { count: { decrement: killed as number } },
      });
    }
    await this.prisma.armyUnit.deleteMany({
      where: { armyId: army.id, count: { lte: 0 } },
    });

    // Update tribe power
    const tribeKilled = Object.values(result.defender.killed).reduce((a, b) => a + (b as number), 0);
    await this.prisma.resourceNode.update({
      where: { id: node.id },
      data: { tribePower: Math.max(0, node.tribePower - tribeKilled * 10) },
    });

    // Calculate loot
    let loot = { wood: 0, stone: 0, iron: 0, food: 0 };

    if (result.winner === 'ATTACKER') {
      const remaining = await this.prisma.armyUnit.findMany({ where: { armyId: army.id } });
      let capacity = 0;
      for (const u of remaining) {
        const def = registry.getUnit(u.unitKey);
        capacity += (def.stats.transport || 0) * u.count;
      }

      const maxPool = node.kind === 'gold' ? [10, 20, 30][lvl - 1] : [2000, 6000, 15000][lvl - 1];
      const available = Math.floor(node.filledPct * maxPool);
      const take = Math.min(available, capacity);

      if (node.kind !== 'gold') {
        (loot as any)[node.kind] = take;
        const newFilled = Math.max(0, node.filledPct - take / maxPool);
        await this.prisma.resourceNode.update({
          where: { id: node.id },
          data: { filledPct: newFilled },
        });
      }
    }

    // Battle report
    await this.prisma.battleReport.create({
      data: {
        type: 'FIELD',
        winner: result.winner,
        attackerId: army.ownerId,
        defenderId: 'TRIBE',
        attackerArmyId: army.id,
        defenderArmyId: `TRIBE:${node.id}`,
        rounds: result.rounds,
        payload: { nodeId: node.id, loot, result },
        visibleToAttacker: true,
        visibleToDefender: false,
      },
    });

    return loot;
  }

  private createArmySnapshot(army: any) {
    return {
      armyId: army.id,
      playerId: army.ownerId,
      faction: army.owner.faction,
      hero: army.heroId && army.owner.hero?.id === army.heroId ? {
        id: army.owner.hero.id,
        level: army.owner.hero.level,
        atkPoints: army.owner.hero.atkPoints,
        defPoints: army.owner.hero.defPoints,
        logPoints: army.owner.hero.logPoints,
        spdPoints: army.owner.hero.spdPoints,
        lossReductionPct: army.owner.hero.lossReductionPct || 0,
      } : null,
      stacks: army.units.map((u: any) => ({
        unitKey: u.unitKey,
        tier: u.tier,
        count: u.count,
      })),
    };
  }

  private async applyBattleLosses(result: any, attackerArmyId: string, defenderArmyId: string, cityId: string) {
    // Attacker losses
    for (const [unitKey, killed] of Object.entries(result.attacker.killed)) {
      await this.prisma.armyUnit.updateMany({
        where: { armyId: attackerArmyId, unitKey },
        data: { count: { decrement: killed as number } },
      });
    }

    // Defender losses
    for (const [unitKey, killed] of Object.entries(result.defender.killed)) {
      await this.prisma.armyUnit.updateMany({
        where: { armyId: defenderArmyId, unitKey },
        data: { count: { decrement: killed as number } },
      });
    }

    // Wounded to city
    for (const [unitKey, wounded] of Object.entries(result.defender.wounded)) {
      if ((wounded as number) > 0) {
        await this.prisma.woundedUnit.upsert({
          where: { cityId_unitKey: { cityId, unitKey } },
          update: { count: { increment: wounded as number } },
          create: { cityId, unitKey, count: wounded as number },
        });
      }
    }

    // Cleanup zero units
    await this.prisma.armyUnit.deleteMany({
      where: {
        armyId: { in: [attackerArmyId, defenderArmyId] },
        count: { lte: 0 },
      },
    });
  }

  // ==========================================================================
  // 9. EXPEDITION TICK (Generation + Completion)
  // ==========================================================================
  private async expeditionTick(now: Date) {
    // A) Generate new expeditions (1 per hour average = ~0.83% per 30s tick)
    const shouldGenerate = Math.random() < 0.0083;
    
    if (shouldGenerate) {
      const players = await this.prisma.player.findMany({
        include: { hero: true },
      });

      for (const player of players) {
        if (!player.hero) continue;

        // Check queue limit
        const queueCount = await this.prisma.expedition.count({
          where: { playerId: player.id, status: 'AVAILABLE' },
        });
        if (queueCount >= 15) continue;

        // Generate expedition
        const difficulties = ['EASY', 'NORMAL', 'HARD', 'NIGHTMARE'];
        const weights = [40, 35, 20, 5];
        const roll = Math.random() * 100;
        let cumulative = 0;
        let difficulty = 'EASY';
        
        for (let i = 0; i < difficulties.length; i++) {
          cumulative += weights[i];
          if (roll < cumulative) {
            difficulty = difficulties[i];
            break;
          }
        }

        const config: Record<string, any> = {
          EASY: { power: [500, 1500], duration: [1800, 3600] },
          NORMAL: { power: [1500, 4000], duration: [3600, 5400] },
          HARD: { power: [4000, 10000], duration: [5400, 7200] },
          NIGHTMARE: { power: [10000, 25000], duration: [7200, 10800] },
        };

        const cfg = config[difficulty];
        const enemyPower = Math.floor(cfg.power[0] + Math.random() * (cfg.power[1] - cfg.power[0]));
        const durationSec = Math.floor(cfg.duration[0] + Math.random() * (cfg.duration[1] - cfg.duration[0]));

        const infantry = 40 + Math.floor(Math.random() * 20);
        const archers = 20 + Math.floor(Math.random() * 20);
        const cavalry = 100 - infantry - archers;

        const lootTiers = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
        const lootWeights = [70, 20, 8, 2];
        const lootRoll = Math.random() * 100;
        let lootCumulative = 0;
        let lootTier = 'COMMON';
        for (let i = 0; i < lootTiers.length; i++) {
          lootCumulative += lootWeights[i];
          if (lootRoll < lootCumulative) {
            lootTier = lootTiers[i];
            break;
          }
        }

        await this.prisma.expedition.create({
          data: {
            playerId: player.id,
            difficulty: difficulty as any,
            enemyPower,
            enemyComp: { infantry, archers, cavalry },
            durationSec,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            lootTier,
            xpReward: Math.floor(enemyPower * 0.25 / 100),
            resourceReward: {
              wood: Math.floor(500 + Math.random() * 2000),
              stone: Math.floor(500 + Math.random() * 2000),
              iron: Math.floor(300 + Math.random() * 1500),
              food: Math.floor(200 + Math.random() * 1000),
            },
          },
        });
      }
    }

    // B) Expire old expeditions
    await this.prisma.expedition.updateMany({
      where: { status: 'AVAILABLE', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });

    // C) Complete finished expedition instances
    const finishedInstances = await this.prisma.expeditionInstance.findMany({
      where: { status: 'TRAVELING', endsAt: { lte: now } },
      include: {
        expedition: true,
      },
    });

    for (const instance of finishedInstances) {
      const army = await this.prisma.army.findUnique({
        where: { id: instance.armyId },
        include: { units: true, owner: { include: { hero: true } } },
      });

      if (!army) continue;

      // Calculate army power
      let armyPower = 0;
      for (const unit of army.units) {
        const tierMult = { base: 1, intermediate: 1.1, elite: 1.21, siege: 0.75 }[unit.tier] || 1;
        armyPower += unit.count * tierMult * 10;
      }

      const won = armyPower > instance.expedition.enemyPower;
      let xpGained = 0;
      let lootGained: any = null;
      const unitsLost: Record<string, number> = {};

      if (won) {
        xpGained = instance.expedition.xpReward;
        
        // Give XP to hero
        if (army.heroId && army.owner.hero) {
          await this.prisma.hero.update({
            where: { id: army.owner.hero.id },
            data: { xp: { increment: xpGained } },
          });
        }

        // Give resources to origin city
        const resources = instance.expedition.resourceReward as any;
        if (resources && army.originCityId) {
          await this.prisma.city.update({
            where: { id: army.originCityId },
            data: {
              wood: { increment: resources.wood || 0 },
              stone: { increment: resources.stone || 0 },
              iron: { increment: resources.iron || 0 },
              food: { increment: resources.food || 0 },
            },
          });
        }

        lootGained = { resources, xp: xpGained };
      } else {
        // Lost - kill some units (30-50%)
        const lossRate = 0.3 + Math.random() * 0.2;
        for (const unit of army.units) {
          const lost = Math.floor(unit.count * lossRate);
          if (lost > 0) {
            unitsLost[unit.unitKey] = lost;
            await this.prisma.armyUnit.update({
              where: { id: unit.id },
              data: { count: { decrement: lost } },
            });
          }
        }
        await this.prisma.armyUnit.deleteMany({
          where: { armyId: army.id, count: { lte: 0 } },
        });
      }

      // Update instance
      await this.prisma.expeditionInstance.update({
        where: { id: instance.id },
        data: { status: 'COMPLETED', won, xpGained, lootGained, unitsLost },
      });

      // Update expedition
      await this.prisma.expedition.update({
        where: { id: instance.expeditionId },
        data: { status: 'COMPLETED' },
      });

      // Return army
      await this.prisma.army.update({
        where: { id: army.id },
        data: { status: 'RETURNING', orderType: null },
      });
    }
  }

  // ==========================================================================
  // 10. BASTION TICK (Construction completion)
  // ==========================================================================
  private async bastionTick(now: Date) {
    // Complete bastions that finished building
    const buildingBastions = await this.prisma.bastion.findMany({
      where: { status: 'BUILDING', completedAt: { lte: now } },
    });

    for (const bastion of buildingBastions) {
      await this.prisma.bastion.update({
        where: { id: bastion.id },
        data: { status: 'ACTIVE' },
      });
      this.logger.log(`Bastion ${bastion.id} completed!`);
    }

    // Clear cooldown on bastions
    const cooldownBastions = await this.prisma.bastion.findMany({
      where: { status: 'COOLDOWN', cooldownEndsAt: { lte: now } },
    });

    for (const bastion of cooldownBastions) {
      await this.prisma.bastion.delete({ where: { id: bastion.id } });
      this.logger.log(`Bastion ${bastion.id} cooldown ended, can rebuild`);
    }
  }

  // ==========================================================================
  // 11. TRADE ROUTES TICK (Auto-transfer between cities)
  // ==========================================================================
  private async tradeRoutesTick(now: Date) {
    // Get active routes
    const routes = await this.prisma.tradeRoute.findMany({
      where: { isActive: true },
    });

    for (const route of routes) {
      // Check if it's time to transfer
      const lastTransfer = route.lastTransferAt || new Date(0);
      const hoursSinceTransfer = (now.getTime() - lastTransfer.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceTransfer < route.intervalHours) continue;

      // Get cities
      const [fromCity, toCity] = await Promise.all([
        this.prisma.city.findUnique({ where: { id: route.fromCityId } }),
        this.prisma.city.findUnique({ where: { id: route.toCityId } }),
      ]);

      if (!fromCity || !toCity) {
        // Deactivate invalid route
        await this.prisma.tradeRoute.update({
          where: { id: route.id },
          data: { isActive: false },
        });
        continue;
      }

      // Calculate transfer amount
      const resourceKey = route.resourceType as 'wood' | 'stone' | 'iron' | 'food';
      const maxStorage = resourceKey === 'food' ? fromCity.maxFoodStorage : fromCity.maxStorage;
      const transferAmount = Math.floor(maxStorage * (route.percentage / 100));
      
      const available = fromCity[resourceKey] as number;
      const actualTransfer = Math.min(transferAmount, available);
      
      if (actualTransfer < 100) continue; // Min 100 to transfer

      // Check destination storage
      const destStorage = resourceKey === 'food' ? toCity.maxFoodStorage : toCity.maxStorage;
      const destCurrent = toCity[resourceKey] as number;
      const canReceive = destStorage - destCurrent;
      const finalTransfer = Math.min(actualTransfer, canReceive);

      if (finalTransfer < 100) continue;

      // Execute transfer
      await this.prisma.$transaction([
        this.prisma.city.update({
          where: { id: fromCity.id },
          data: { [resourceKey]: { decrement: finalTransfer } },
        }),
        this.prisma.city.update({
          where: { id: toCity.id },
          data: { [resourceKey]: { increment: finalTransfer } },
        }),
        this.prisma.tradeRoute.update({
          where: { id: route.id },
          data: { lastTransferAt: now },
        }),
      ]);
    }
  }
}

export default TickProcessor;
