import { Processor, Process } from '@nestjs/bull';
import { PrismaService } from '../common/prisma/prisma.service';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { simulateBattle } from '@libs/combat/src/engine';
import { RUNTIME_UNITS } from '@libs/game-data/src/units';
import { RUNTIME_FACTIONS } from '@libs/game-data/src/factions';
import { loadUnitsFromJson, loadFactionBonusesFromJson, loadBuildingsFromJson, timeAtLevelSec } from '@libs/game-data/src/loader';
import { applyBattleResultToDb } from './battle.apply';


const DATA_UNITS_PATH = process.env.DATA_UNITS_PATH ?? 'data/units.json';
const DATA_FACTIONS_PATH = process.env.DATA_FACTIONS_PATH ?? 'data/factions.json';
const DATA_BUILDINGS_PATH = process.env.DATA_BUILDINGS_PATH ?? 'data/buildings.json';

function safeLoadUnits() {
  try { return loadUnitsFromJson(DATA_UNITS_PATH); } catch { return RUNTIME_UNITS; }
}
function safeLoadFactions() {
  try { return loadFactionBonusesFromJson(DATA_FACTIONS_PATH); } catch { return RUNTIME_FACTIONS; }
}
function safeLoadBuildings(){
  try { return loadBuildingsFromJson(DATA_BUILDINGS_PATH); } catch { return {}; }
}

const RUNTIME_UNITS = safeLoadUnits();
const RUNTIME_FACTIONS = safeLoadFactions();
const RUNTIME_BUILDINGS = safeLoadBuildings();
@Processor('game')
export class TickProcessor {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  @Process('tick30s')
  async handleTick() {
    const lockKey = 'lock:tick30s';
    const ok = await this.redis.set(lockKey, '1', 'PX', 25_000, 'NX');
    if (!ok) return;

    const now = new Date();
    await resourceNodeTick(this.prisma);
    await upkeepTick(this.prisma);
    await constructionTick(this.prisma, now);
    await movementTick(this.prisma, now);
    await siegeTick(this.prisma);
    await healTick(this.prisma);
  }
}

// --- Core formulas (GDD) -------------------------------------------------
// Food upkeep (per hour): base=5, intermediate=10, elite=15, siege=15.
// Tick interval = 30s.
// During siege: attacker upkeep +10% for units in the sieging army.
// During siege: defender upkeep -10% for units in the besieged city (city armies).
// Hero logistics reduces upkeep: -0.5% per logPoint (only when hero is present in the army).


function starsToStat(stars:number, max:number){
  return Math.round((Math.min(10, Math.max(0, stars)) / 10) * max);
}

function tribeUnitDef(key: string) {
  // Keys: TRIBE_L{1|2|3}_{INF|ARCH|CAV}
  const parts = key.split('_');
  const lvl = Number((parts[1] ?? 'L1').replace('L','')) || 1;
  const role = parts[2] ?? 'INF';
  // Star ranges (from GDD):
  // lvl1: 1..4, lvl2: 2..6, lvl3: 2..7
  const range = lvl===1 ? [1,4] : lvl===2 ? [2,6] : [2,7];
  const avg = (range[0]+range[1]) / 2;
  // Give slight flavor by role
  const atkStars = role==='ARCH' ? avg+0.5 : role==='CAV' ? avg+0.25 : avg;
  const defStars = role==='INF' ? avg+0.5 : avg;
  const endStars = avg;
  const spdStars = role==='CAV' ? avg+1 : role==='ARCH' ? avg+0.5 : avg;

  const tier = (lvl===1 ? 'base' : lvl===2 ? 'intermediate' : 'elite') as any;
  return {
    key,
    tier,
    stats: {
      attack: starsToStat(atkStars, 125),
      defense: starsToStat(defStars, 125),
      endurance: starsToStat(endStars, 125),
      speed: Math.max(10, starsToStat(spdStars, 100)),
      transport: 0,
    }
  };
}

const registry = { getUnit: (k: string) => {
  if (k.startsWith('TRIBE_')) return tribeUnitDef(k);
  const u = (RUNTIME_UNITS as any)[k];
  if (!u) throw new Error('Unknown unit '+k);
  return u;
}};

async function resourceNodeTick(prisma: PrismaService) {
  const nodes = await prisma.resourceNode.findMany();
  const regenRate = 1 / (4 * 3600 / 30); // 4h -> ticks 30s
  for (const node of nodes){
    const newPct = Math.min(1, node.filledPct + regenRate);
    await prisma.resourceNode.update({ where:{ id: node.id }, data:{ filledPct:newPct, tribePower: Math.round(node.baseTribePower * newPct) } });
  }
}

// Food upkeep (30s tick)
// - base: base=5/h, intermediate=10/h, elite=15/h, siege=15/h
// - hero logistic: -0.5% upkeep per logPoint (only if hero is present in the army)
// - siege state: attacker SIEGING +10% upkeep, defender city -10% upkeep
async function upkeepTick(prisma: PrismaService) {
  const TICK_HOURS = 30 / 3600;

  const cities = await prisma.city.findMany({ select:{ id:true, isSieged:true } });
  const citySiege = new Map(cities.map(c=>[c.id, c.isSieged]));

  const armies = await prisma.army.findMany({ include:{ units:true, owner:{ include:{ hero:true } } } });

  const foodByCity: Record<string, number> = {};

  for (const a of armies){
    // Travian-like: upkeep is paid by origin city.
    const payCityId = a.originCityId;
    if (!payCityId) continue;

    let mult = 1;
    const siegeState = citySiege.get(a.cityId ?? '') === true;
    if (a.status === 'SIEGING') mult *= 1.10;
    // Defender upkeep reduction during siege for troops inside the sieged city.
    if (siegeState && a.status === 'IN_CITY' && a.cityId) mult *= 0.90;

    // Hero logistic applies only if this army is actually carrying the hero.
    const hero = a.owner.hero && a.heroId && a.owner.hero.id === a.heroId ? a.owner.hero : null;
    const logRed = hero ? Math.min(0.25, hero.logPoints * 0.005) : 0;
    mult *= (1 - logRed);

    let perHour = 0;
    for (const u of a.units){
      if (u.tier === 'base') perHour += u.count * 5;
      else if (u.tier === 'intermediate') perHour += u.count * 10;
      else if (u.tier === 'elite') perHour += u.count * 15;
      else if (u.tier === 'siege') perHour += u.count * 15;
      else perHour += u.count * 10;
    }

    const cost = perHour * mult * TICK_HOURS;
    foodByCity[payCityId] = (foodByCity[payCityId] ?? 0) + cost;
  }

  const cityIds = Object.keys(foodByCity);
  for (const cityId of cityIds){
    await prisma.city.update({ where:{ id: cityId }, data:{ food: { decrement: foodByCity[cityId] } } });
  }
}

function lerp(a:number,b:number,t:number){ return a + (b-a)*t; }
function buildingPop(level:number, category:string, maxLevel:number): number {
  if (maxLevel !== 20) return 4 * level;
  if (category === 'BASE') return Math.round(lerp(1, 3, (level-1)/19));
  if (category === 'INTERMEDIATE') return Math.round(lerp(2, 5, (level-1)/19));
  if (category === 'ADVANCED') return Math.round(lerp(3, 7, (level-1)/19));
  if (category === 'FACTION') return 4 * level;
  return Math.round(lerp(2, 5, (level-1)/19));
}

async function recomputePlayerPopulation(prisma: PrismaService, playerId: string) {
  const cities = await prisma.city.findMany({ where:{ ownerId: playerId }, include:{ buildings:true } });
  let pop = 0;
  for (const c of cities){
    for (const b of c.buildings){
      const def = (RUNTIME_BUILDINGS as any)[b.key];
      const maxLevel = def?.maxLevel ?? 20;
      const cat = def?.category ?? b.category;
      pop += buildingPop(b.level, cat, maxLevel);
    }
  }
  await prisma.player.update({ where:{ id: playerId }, data:{ population: pop }});
}

function heroSnapshot(owner: any, armyHeroId: string | null) {
  const h = owner?.hero;
  if (!h || !armyHeroId || h.id !== armyHeroId) return null;
  return {
    id: h.id,
    level: h.level,
    atkPoints: h.atkPoints,
    defPoints: h.defPoints,
    logPoints: h.logPoints,
    spdPoints: h.spdPoints,
    // extra passive (equip / passives) can be added later
    lossReductionPct: h.lossReductionPct ?? 0,
  };
}

function snapshotFromArmy(army: any) {
  return {
    armyId: army.id,
    playerId: army.ownerId,
    faction: army.owner.faction,
    hero: heroSnapshot(army.owner, army.heroId),
    stacks: army.units.map((u: any) => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })),
  };
}

async function constructionTick(prisma: PrismaService, now: Date) {
  // 1) Finish running constructions
  const done = await prisma.buildQueueItem.findMany({ where:{ status:'RUNNING', endsAt:{ lte: now } } });
  for (const item of done){
    const city = await prisma.city.findUnique({ where:{ id: item.cityId }, select:{ ownerId:true } });
    const def = (RUNTIME_BUILDINGS as any)[item.buildingKey];
    const category = def?.category ?? 'INTERMEDIATE';
    const prodPerHour = def?.prodPerHour ?? 0;
    await prisma.cityBuilding.upsert({
      where:{ cityId_key:{ cityId:item.cityId, key:item.buildingKey } },
      update:{ level: item.targetLevel, category, prodPerHour },
      create:{ cityId:item.cityId, key:item.buildingKey, level:item.targetLevel, category, prodPerHour },
    });
    await prisma.buildQueueItem.update({ where:{ id:item.id }, data:{ status:'DONE' }});

    // Population is an indicator: recompute on every building completion.
    if (city?.ownerId) await recomputePlayerPopulation(prisma, city.ownerId);
  }

  // 2) Start queued items when slots free (slots 1-2 running, 3-4 queued)
  const cities = await prisma.city.findMany({ select:{ id:true } });
  for (const c of cities){
    const q = await prisma.buildQueueItem.findMany({ where:{ cityId:c.id, status:{ in:['RUNNING','QUEUED'] } }, orderBy:{ startedAt:'asc' }});
    const runningSlots = new Set(q.filter(x=>x.status==='RUNNING').map(x=>x.slot));
    const freeSlots = [1,2].filter(s=>!runningSlots.has(s));
    if (freeSlots.length<=0) continue;

    const queued = q.filter(x=>x.status==='QUEUED' && (x.slot===3 || x.slot===4)).sort((a,b)=>a.slot-b.slot);
    for (const free of freeSlots){
      const next = queued.shift();
      if (!next) break;

      const def = (RUNTIME_BUILDINGS as any)[next.buildingKey];
      const durationSec = def ? timeAtLevelSec(def, next.targetLevel) : 60;
      const endsAt = new Date(now.getTime() + durationSec*1000);

      await prisma.buildQueueItem.update({
        where:{ id: next.id },
        data:{ status:'RUNNING', slot: free, startedAt: now, endsAt }
      });
    }
  }
}

async function movementTick(prisma: PrismaService, now: Date) {
  const arrived = await prisma.army.findMany({ where:{ status:'MOVING', arrivalAt:{ lte: now } }, include:{ units:true, owner:{ include:{ hero:true } } }});
  for (const army of arrived){
    const tx = army.targetX ?? army.x;
    const ty = army.targetY ?? army.y;

    const city = await prisma.city.findFirst({ where:{ x:tx, y:ty }});
    if (city){
      // SPY action: generate spy report with full details for the caller.
      if (army.orderType === 'SPY') {
        const payload: any = {
          targetType: 'CITY',
          x: city.x,
          y: city.y,
          city: {
            id: city.id,
            ownerId: city.ownerId,
            type: city.type,
            isSieged: city.isSieged,
            wallHpPct: city.wallHp,
          }
        };

        // Include stationed armies counts (no partial info in spy)
      const defenders = await prisma.army.findMany({ where:{ cityId: city.id, status:'IN_CITY' }, include:{ units:true, owner:{ include:{ hero:true } } } });
        payload.city.defenders = defenders.map(d => ({
          armyId: d.id,
          ownerId: d.ownerId,
          units: d.units.map(u=>({ unitKey:u.unitKey, tier:u.tier, count:u.count }))
        }));

        await prisma.spyReport.create({ data:{ attackerId: army.ownerId, targetType:'CITY', targetX: city.x, targetY: city.y, payload } });
        await prisma.army.update({ where:{ id: army.id }, data:{ status:'RETURNING', targetX:null, targetY:null, arrivalAt:null } });
        continue;
      }

      if (city.ownerId === army.ownerId){
        await prisma.army.update({ where:{ id:army.id }, data:{ status:'IN_CITY', cityId: city.id, x:tx, y:ty, targetX:null, targetY:null, arrivalAt:null }});
        continue;
      }

      const defenders = await prisma.army.findMany({ where:{ cityId: city.id, status:'IN_CITY' }, include:{ units:true, owner:{ include:{ hero:true } } }});
      if (defenders.length>0){
        const def = defenders[0];

        const atkSnap = snapshotFromArmy(army);
        const defSnap = snapshotFromArmy(def);

        const ctx = {
          mode: (army.orderType === 'RAID' ? 'RAID' : 'CITY_ATTACK') as const,
          isSiegeState: city.isSieged,
          defenderInCity: true,
          attackerInCity: false,
          attackerFactionBonus: (RUNTIME_FACTIONS as any)[army.owner.faction],
          defenderFactionBonus: (RUNTIME_FACTIONS as any)[def.owner.faction],
        };

        const result = simulateBattle(registry as any, atkSnap as any, defSnap as any, ctx as any);

        await applyBattleResultToDb(prisma, result as any, {
          type: (army.orderType === 'RAID' ? 'RAID' : 'CITY_ATTACK'),
          defenderCityId: city.id,
          attackerId: army.ownerId,
          defenderId: def.ownerId,
          attackerArmyId: army.id,
          defenderArmyId: def.id,
        });

        continue;
      }

      await prisma.city.update({ where:{ id: city.id }, data:{ isSieged:true, siegeStartedAt: new Date() }});
      await prisma.army.update({ where:{ id: army.id }, data:{ status:'SIEGING', x:tx, y:ty, targetX:null, targetY:null, arrivalAt:null }});
      continue;
    }

    const node = await prisma.resourceNode.findFirst({ where:{ x:tx, y:ty }});
    if (node){
      // SPY action on resource node
      if (army.orderType === 'SPY') {
        const payload: any = {
          targetType: 'RESOURCE',
          x: node.x,
          y: node.y,
          node: {
            id: node.id,
            kind: node.kind,
            level: node.level,
            filledPct: node.filledPct,
            tribePower: node.tribePower,
          }
        };
        await prisma.spyReport.create({ data:{ attackerId: army.ownerId, targetType:'RESOURCE', targetX: node.x, targetY: node.y, payload } });
        await prisma.army.update({ where:{ id: army.id }, data:{ status:'RETURNING', targetX:null, targetY:null, arrivalAt:null } });
        continue;
      }

      // ATTACK/RAID on a resource node = battle vs local tribe, then loot.
      const loot = await resolveResourceNodeAttack(prisma, army.id, node.id);
      await prisma.army.update({ where:{ id: army.id }, data:{ status:'RETURNING', targetX:null, targetY:null, arrivalAt:null, orderPayload: { ...(army.orderPayload as any), loot } } });
      continue;
    }

    await prisma.army.update({ where:{ id: army.id }, data:{ status:'RETURNING', targetX:null, targetY:null, arrivalAt:null }});
  }

  const returning = await prisma.army.findMany({ where:{ status:'RETURNING' }, include:{ units:true } });
  for (const army of returning){
    const origin = await prisma.city.findUnique({ where:{ id: army.originCityId }});
    if (!origin) continue;

    const payload:any = (army.orderPayload as any) ?? {};
    if (payload.loot && typeof payload.loot === 'object') {
      const l = payload.loot;
      await prisma.city.update({
        where:{ id: origin.id },
        data:{
          wood: { increment: l.wood ?? 0 },
          stone:{ increment: l.stone ?? 0 },
          iron: { increment: l.iron ?? 0 },
          food: { increment: l.food ?? 0 },
        }
      });
    }

    await prisma.army.update({ where:{ id: army.id }, data:{ status:'IN_CITY', cityId: origin.id, x: origin.x, y: origin.y, orderType:null, orderPayload:{} }});
  }
}

function hashToRand(seed: string) {
  let h = 2166136261;
  for (let i=0;i<seed.length;i++) h = (h ^ seed.charCodeAt(i)) * 16777619;
  // 0..1
  return (h >>> 0) / 0xffffffff;
}

async function resolveResourceNodeAttack(prisma: PrismaService, armyId: string, nodeId: string) {
  const army = await prisma.army.findUnique({ where:{ id: armyId }, include:{ units:true, owner:{ include:{ hero:true } } } });
  const node = await prisma.resourceNode.findUnique({ where:{ id: nodeId } });
  if (!army || !node) return { wood:0, stone:0, iron:0, food:0 };

  // Build attacker snapshot
  const atkSnap = snapshotFromArmy(army);

  // Build tribe snapshot (random composition, deterministic by node id)
  const lvl = node.level;
  const tier = (lvl===1?'base':lvl===2?'intermediate':'elite') as any;
  const total = Math.max(10, Math.round(node.tribePower / 10));
  const r = hashToRand(node.id);
  const inf = Math.max(1, Math.round(total * (0.5 + (r-0.5)*0.1)));
  const arch = Math.max(1, Math.round(total * 0.3));
  const cav = Math.max(1, total - inf - arch);

  const defSnap = {
    armyId: `TRIBE:${node.id}`,
    playerId: 'TRIBE',
    faction: 'ROME',
    stacks: [
      { unitKey:`TRIBE_L${lvl}_INF`, tier, count: inf },
      { unitKey:`TRIBE_L${lvl}_ARCH`, tier, count: arch },
      { unitKey:`TRIBE_L${lvl}_CAV`, tier, count: cav },
    ]
  };

  const ctx = {
    mode: 'FIELD' as const,
    isSiegeState: false,
    defenderInCity: false,
    attackerInCity: false,
    attackerFactionBonus: (RUNTIME_FACTIONS as any)[army.owner.faction],
    defenderFactionBonus: {},
  };

  const result = simulateBattle(registry as any, atkSnap as any, defSnap as any, ctx as any);

  // Apply attacker losses
  for (const unitKey of Object.keys(result.defender.killed)) {
    await prisma.armyUnit.updateMany({ where:{ armyId, unitKey }, data:{ count:{ decrement: result.defender.killed[unitKey] } } });
  }
  // Cleanup attacker army units with <=0
  await prisma.armyUnit.deleteMany({ where:{ armyId, count:{ lte:0 } } });

  // Tribe losses reduce tribePower proportionally
  const tribeKilled = Object.values(result.attacker.killed).reduce((a,b)=>a+b,0);
  const newTribe = Math.max(0, node.tribePower - tribeKilled*10);

  await prisma.resourceNode.update({ where:{ id: node.id }, data:{ tribePower: newTribe } });

  // Loot only if attacker wins
  let loot = { wood:0, stone:0, iron:0, food:0 };
  if (result.winner === 'ATTACKER') {
    // capacity from remaining units
    const remainingUnits = await prisma.armyUnit.findMany({ where:{ armyId } });
    let capacity = 0;
    for (const u of remainingUnits) {
      const def = (registry as any).getUnit(u.unitKey);
      capacity += (def.stats.transport ?? 0) * u.count;
    }

    // available pool by node level
    const maxPool = node.kind === 'gold'
      ? (node.level===1?10:node.level===2?20:30)
      : (node.level===1?2000:node.level===2?6000:15000);
    const available = Math.floor(node.filledPct * maxPool);
    const take = Math.max(0, Math.min(available, capacity));

    if (node.kind === 'wood') loot.wood = take;
    else if (node.kind === 'stone') loot.stone = take;
    else if (node.kind === 'iron') loot.iron = take;
    else if (node.kind === 'food') loot.food = take;
    // gold is not stored in city resources (rule: no gold pillage) -> ignore

    if (node.kind !== 'gold') {
      const newFilled = Math.max(0, node.filledPct - (take / maxPool));
      await prisma.resourceNode.update({ where:{ id: node.id }, data:{ filledPct: newFilled, lastUpdateAt: new Date() } });
    }
  }

  // Store battle report as FIELD against TRIBE
  await prisma.battleReport.create({
    data:{
      type: 'FIELD',
      winner: result.winner,
      attackerId: army.ownerId,
      defenderId: 'TRIBE',
      attackerArmyId: army.id,
      defenderArmyId: `TRIBE:${node.id}`,
      rounds: result.rounds,
      payload: { nodeId: node.id, x: node.x, y: node.y, kind: node.kind, level: node.level, loot, result },
      visibleToAttacker: true,
      visibleToDefender: false,
    }
  });

  return loot;
}

async function siegeTick(prisma: PrismaService) {
  const sieges = await prisma.city.findMany({ where:{ isSieged:true }});
  for (const city of sieges){
    const attackers = await prisma.army.findMany({ where:{ x:city.x, y:city.y, status:'SIEGING' }, include:{ units:true }});
    let stars=0;
    for (const a of attackers){
      for (const u of a.units){
        if ((u.unitKey||'').includes('CATAPULT') || (u.unitKey||'').includes('MANGON')) stars += 10;
      }
    }
    if (stars<=0) continue;
    const ratio = stars/10;
    const hpLoss = (30/1800) * ratio; // 10★ => 30min
    const newHp = Math.max(0, city.wallHp - hpLoss);
    await prisma.city.update({ where:{ id: city.id }, data:{ wallHp:newHp }});
    if (newHp<=0){
      await prisma.city.update({ where:{ id: city.id }, data:{ isSieged:false, siegeStartedAt:null }});
    }
  }

  const notSieged = await prisma.city.findMany({ where:{ isSieged:false, wallHp:{ lt:1.0 } }});
  const regenPerTick = 1 / (24*3600/30);
  for (const city of notSieged){
    await prisma.city.update({ where:{ id: city.id }, data:{ wallHp: Math.min(1.0, city.wallHp + regenPerTick) }});
  }
}

async function healTick(prisma: PrismaService) {
  const cities = await prisma.city.findMany({ include:{ buildings:true, wounded:true }});
  for (const city of cities){
    if (city.isSieged) continue;
    const tent = city.buildings.find(b=>b.key==='HEALING_TENT');
    if (!tent) continue;

    const cap = 3 * tent.level;
    let remainingCap = cap;

    for (const w of city.wounded){
      if (remainingCap<=0) break;
      const heal = Math.min(w.count, remainingCap);
      remainingCap -= heal;

      await prisma.woundedUnit.update({ where:{ id:w.id }, data:{ count: w.count - heal }});
      if (w.count - heal <= 0) await prisma.woundedUnit.delete({ where:{ id:w.id }});

      const army = await prisma.army.findFirst({ where:{ cityId: city.id, status:'IN_CITY' }});
      if (army){
        await prisma.armyUnit.upsert({
          where:{ armyId_unitKey:{ armyId: army.id, unitKey: w.unitKey } },
          update:{ count:{ increment: heal } },
          create:{ armyId: army.id, unitKey: w.unitKey, tier:'base', count: heal },
        });
      }
    }
  }
}
