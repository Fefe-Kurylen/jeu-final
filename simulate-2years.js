#!/usr/bin/env node
// ============================================================
// SIMULATION 2 ANS - Imperium Antiquitas
// 6 joueurs (1 par faction), 17,520 ticks (1h chaque)
// ============================================================
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://claude:claude@localhost:5432/monjeu';

// --- TIME OVERRIDE ---
let simulatedTime = Date.now();
const _realDateNow = Date.now;
const OrigDate = Date;
global.Date = class extends OrigDate {
  constructor(...a) { if (!a.length) super(simulatedTime); else super(...a); }
  static now() { return simulatedTime; }
};
Object.setPrototypeOf(global.Date, OrigDate);

// --- MODULES ---
const config = require('./src/config');
const prisma = require('./src/config/database');
const { unitsData, buildingsData, factionsData } = require('./src/config/gamedata');

// Override tick config: each tick = 1 hour of game time
config.tick.tickHours = 1.0;
config.tick.harvestPerTick = 6000;

// Suppress all console.log from game processors
const _log = console.log;
const _warn = console.warn;
let suppressLogs = false;
console.log = (...args) => { if (!suppressLogs) _log(...args); };
console.warn = (...args) => { if (!suppressLogs) _warn(...args); };

// --- PROCESSORS ---
const { processHealedUnits } = require('./src/services/woundedService');
const { processResourceProduction, processUpkeep, processResourceRegen } = require('./src/game/processors/resourceProcessor');
const { processBuilds } = require('./src/game/processors/buildProcessor');
const { processRecruits } = require('./src/game/processors/recruitProcessor');
const { processExpeditions, generateNewExpeditions } = require('./src/game/processors/expeditionProcessor');
const { processArmyMovements } = require('./src/game/processors/armyProcessor');
const { processHarvesting, processTribeRespawn } = require('./src/game/processors/harvestProcessor');
const { updatePopulation } = require('./src/game/processors/worldProcessor');

// --- CONSTANTS ---
const FACTIONS = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
const TOTAL_HOURS = 17520;
const NAMES = { ROME:'Marcus Aurelius', GAUL:'Vercingétorix', GREEK:'Leonidas', EGYPT:'Cléopâtre', HUN:'Attila', SULTAN:'Saladin' };

const BUILD_ORDER = [
  // Phase 1: Economy
  {k:'MAIN_HALL',t:3},{k:'FARM',t:3},{k:'LUMBER',t:3},{k:'QUARRY',t:3},{k:'IRON_MINE',t:3},
  {k:'WAREHOUSE',t:3},{k:'SILO',t:3},
  // Phase 2: Military basics
  {k:'MAIN_HALL',t:5},{k:'RALLY_POINT',t:1},{k:'BARRACKS',t:3},{k:'ACADEMY',t:3},
  {k:'WALL',t:3},{k:'HIDEOUT',t:3},{k:'HEALING_TENT',t:3},{k:'EMBASSY',t:5},
  {k:'HERO_MANSION',t:1},{k:'WATCHTOWER',t:3},
  // Phase 3: Economy growth
  {k:'FARM',t:7},{k:'LUMBER',t:7},{k:'QUARRY',t:7},{k:'IRON_MINE',t:7},
  {k:'MAIN_HALL',t:7},{k:'WAREHOUSE',t:7},{k:'SILO',t:7},{k:'BARRACKS',t:5},
  // Phase 4: Mid-game
  {k:'MAIN_HALL',t:10},{k:'FARM',t:10},{k:'LUMBER',t:10},{k:'QUARRY',t:10},{k:'IRON_MINE',t:10},
  {k:'FORGE',t:3},{k:'ACADEMY',t:5},{k:'STABLE',t:3},{k:'BARRACKS',t:10},
  {k:'WALL',t:7},{k:'WAREHOUSE',t:10},{k:'SILO',t:10},{k:'MARKET',t:3},
  {k:'HEALING_TENT',t:7},{k:'TREASURE_CHAMBER',t:3},
  // Phase 5: Advanced
  {k:'MAIN_HALL',t:15},{k:'FARM',t:14},{k:'LUMBER',t:14},{k:'QUARRY',t:14},{k:'IRON_MINE',t:14},
  {k:'MILL',t:5},{k:'SAWMILL',t:5},{k:'STONEMASON',t:5},{k:'FOUNDRY',t:5},
  {k:'ACADEMY',t:10},{k:'FORGE',t:10},{k:'STABLE',t:7},{k:'BARRACKS',t:15},
  {k:'WORKSHOP',t:5},{k:'WALL',t:12},{k:'MOAT',t:5},{k:'WAREHOUSE',t:15},{k:'SILO',t:15},
  {k:'RALLY_POINT',t:5},{k:'RESIDENCE',t:5},{k:'HERO_MANSION',t:10},
  {k:'TREASURE_CHAMBER',t:10},{k:'HEALING_TENT',t:12},
  // Phase 6: Endgame
  {k:'MAIN_HALL',t:20},{k:'FARM',t:18},{k:'LUMBER',t:18},{k:'QUARRY',t:18},{k:'IRON_MINE',t:18},
  {k:'BARRACKS',t:20},{k:'STABLE',t:15},{k:'WALL',t:18},{k:'MOAT',t:10},
  {k:'WAREHOUSE',t:20},{k:'SILO',t:20},{k:'RALLY_POINT',t:10},{k:'RESIDENCE',t:10},
  {k:'TREASURE_CHAMBER',t:15},
];

// --- HELPERS ---
function getBuildCost(key, level) {
  const def = buildingsData.find(b => b.key === key);
  if (!def) return null;
  const base = def.costL1 || {wood:100,stone:100,iron:80,food:50};
  const m = Math.pow(1.28, level - 1);
  return {wood:Math.floor(base.wood*m),stone:Math.floor(base.stone*m),iron:Math.floor(base.iron*m),food:Math.floor(base.food*m)};
}
function getBuildTime(key, level) {
  const def = buildingsData.find(b => b.key === key);
  return Math.floor((def?.timeL1Sec||60) * Math.pow(1.2, level - 1));
}
function canAfford(c, cost) { return c.wood>=cost.wood && c.stone>=cost.stone && c.iron>=cost.iron && c.food>=cost.food; }
function unitFor(faction, tier, cls) { return unitsData.find(u => u.faction===faction && u.tier===tier && u.class===cls); }

// Estimate food production per hour for a city
function estimateFoodProd(buildings) {
  let prod = 10; // base
  const farm = buildings.find(b => b.key === 'FARM');
  if (farm) {
    // approximate: L1=10, L10=350, L20=4500
    const l = farm.level;
    if (l <= 10) prod = 10 * Math.pow(35, (l-1)/9);
    else prod = 350 * Math.pow(4500/350, (l-10)/10);
  }
  return prod;
}
// Estimate current upkeep per hour
function estimateUpkeep(armies) {
  let upkeep = 0;
  for (const a of armies) {
    for (const u of (a.units||[])) {
      const def = unitsData.find(d => d.key === u.unitKey);
      const tier = def?.tier || u.tier || 'base';
      const rate = config.army.upkeepPerTier[tier] || 2.5;
      upkeep += u.count * rate;
    }
  }
  return upkeep;
}

const stats = {};
let battleCount = 0;

// ============================================================
async function simulate() {
  _log('╔══════════════════════════════════════════════════════════╗');
  _log('║     SIMULATION 2 ANS - IMPERIUM ANTIQUITAS              ║');
  _log('║     6 joueurs × 6 factions × 17,520 heures             ║');
  _log('╚══════════════════════════════════════════════════════════╝');
  _log();

  // CLEAN DB
  _log('[SETUP] Nettoyage de la base de données...');
  await prisma.$executeRawUnsafe(`DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public') LOOP EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE'; END LOOP; END $$;`);

  // GENERATE WORLD
  _log('[SETUP] Génération de la carte...');
  const resTypes = ['WOOD','STONE','IRON','FOOD'];
  const biomes = ['forest','desert','snow'];
  const nodes = [];
  for (let x = -187; x <= 186; x += 4) {
    for (let y = -187; y <= 186; y += 4) {
      if (Math.random() < 0.08) {
        const amt = 500 + Math.floor(Math.random()*2000);
        const dist = Math.sqrt(x*x+y*y);
        const hasDef = Math.random() < 0.4;
        nodes.push({
          x, y, resourceType: resTypes[Math.floor(Math.random()*4)],
          level: dist<50?3:dist<100?2:1, amount:amt, maxAmount:amt,
          regenRate: Math.floor(amt*0.1), biome: biomes[Math.floor(Math.random()*3)],
          hasDefenders: hasDef, defenderPower: hasDef?50+Math.floor(Math.random()*200):0,
          defenderUnits: hasDef?{warrior:5+Math.floor(Math.random()*20)}:undefined,
          respawnMinutes: 30
        });
      }
    }
  }
  for (let i = 0; i < nodes.length; i += 500)
    await prisma.resourceNode.createMany({data:nodes.slice(i,i+500)});
  _log(`[SETUP] ${nodes.length} noeuds de ressources`);

  // CREATE PLAYERS
  _log('[SETUP] Création des 6 joueurs...');
  const bcrypt = require('bcryptjs');
  const players = [];
  for (const faction of FACTIONS) {
    const name = NAMES[faction];
    const hash = await bcrypt.hash('sim123', 10);
    const account = await prisma.account.create({data:{email:`${faction.toLowerCase()}@sim.test`,passwordHash:hash}});
    const angle = (FACTIONS.indexOf(faction)/6)*2*Math.PI;
    const r = 60+Math.floor(Math.random()*30);
    const x = Math.round(Math.cos(angle)*r), y = Math.round(Math.sin(angle)*r);
    const player = await prisma.player.create({data:{accountId:account.id,name,faction,gold:100}});
    const city = await prisma.city.create({data:{playerId:player.id,name:`Capitale de ${name}`,x,y,isCapital:true,wood:800,stone:800,iron:800,food:1000,maxStorage:1000,maxFoodStorage:1000}});
    const garrison = await prisma.army.create({data:{ownerId:player.id,playerId:player.id,cityId:city.id,name:'Garnison',x,y,isGarrison:true,status:'IDLE'}});
    const hero = await prisma.hero.create({data:{playerId:player.id,name:`Héros ${name}`,level:1,xp:0,xpToNextLevel:100,statPoints:0,atkPoints:2,defPoints:2,spdPoints:1}});
    for (let i=0;i<3;i++) {
      await prisma.expedition.create({data:{playerId:player.id,ownerId:player.id,difficulty:1+Math.floor(Math.random()*3),enemyPower:50+Math.floor(Math.random()*100),duration:300+Math.floor(Math.random()*600),lootTier:'COMMON',rewards:{xp:20,gold:5},expiresAt:new global.Date(simulatedTime+86400000),status:'AVAILABLE'}});
    }
    players.push({id:player.id,faction,name,cityId:city.id,garrisonId:garrison.id,heroId:hero.id,x,y});
    stats[faction] = {builds:0,recruits:0,attacks:0,expeditions:0};
    _log(`  ✓ ${name} (${faction}) à (${x},${y})`);
  }

  _log();
  _log('═══════════════════════════════════════════════════════════');
  _log('  DÉBUT DE LA SIMULATION - 2 ANS');
  _log('═══════════════════════════════════════════════════════════');
  _log();

  const startTime = _realDateNow();
  let month = 0;
  suppressLogs = true; // Suppress game processor logs

  // ============ MAIN LOOP ============
  for (let hour = 1; hour <= TOTAL_HOURS; hour++) {
    simulatedTime += 3600000; // +1 hour
    const now = new global.Date(simulatedTime);

    // GAME TICK
    try {
      await processHealedUnits();
      await processResourceProduction(1.0);
      await processUpkeep(1.0);
      await processBuilds(now);
      await processRecruits(now);
      await processExpeditions(now);
      await processArmyMovements(now);
      if (hour % 4 === 0) {
        await processHarvesting(now);
        await processTribeRespawn(now);
        await processResourceRegen(now, 4.0);
      }
    } catch (e) {}

    // AI ACTIONS (every 3 hours)
    if (hour % 3 === 0) {
      for (const p of players) {
        try { await aiAction(p, hour, now); } catch(e) {}
      }
    }

    // POPULATION (every day)
    if (hour % 24 === 0) { try { await updatePopulation(); } catch(e) {} }

    // EXPEDITIONS (every 6h)
    if (hour % 6 === 0) { try { await generateNewExpeditions(); } catch(e) {} }

    // MONTHLY LOG
    if (hour % 720 === 0) {
      month++;
      suppressLogs = false;
      const elapsed = ((_realDateNow()-startTime)/1000).toFixed(1);
      const gameDate = new global.Date(simulatedTime);
      const pct = ((hour/TOTAL_HOURS)*100).toFixed(1);
      _log(`[Mois ${String(month).padStart(2,' ')}] ${gameDate.toISOString().slice(0,10)} | ${pct}% | ${elapsed}s réel`);
      if (month % 3 === 0) await printQuarterlyReport(players);
      suppressLogs = true;
    }
  }

  suppressLogs = false;
  const totalElapsed = ((_realDateNow()-startTime)/1000).toFixed(1);
  _log();
  _log('═══════════════════════════════════════════════════════════');
  _log(`  FIN DE LA SIMULATION (${totalElapsed}s réel)`);
  _log('═══════════════════════════════════════════════════════════');
  _log();
  await printFinalReport(players);
  await prisma.$disconnect();
}

// ============ AI ============
async function aiAction(player, hour, now) {
  const city = await prisma.city.findFirst({
    where:{id:player.cityId},
    include:{buildings:true,buildQueue:true,recruitQueue:true,armies:{include:{units:true}}}
  });
  if (!city) return;

  // === BUILD ===
  if (city.buildQueue.length < 2) {
    const levels = {};
    city.buildings.forEach(b => { levels[b.key] = Math.max(levels[b.key]||0, b.level); });
    city.buildQueue.forEach(q => { levels[q.buildingKey] = Math.max(levels[q.buildingKey]||0, q.targetLevel); });
    const mhLevel = levels['MAIN_HALL'] || 0;

    for (const o of BUILD_ORDER) {
      const cur = levels[o.k] || 0;
      if (cur >= o.t) continue;
      const next = cur + 1;
      const def = buildingsData.find(b => b.key === o.k);
      if (!def) continue;
      if (def.faction && def.faction !== player.faction) continue;
      if (o.k !== 'MAIN_HALL' && next > mhLevel) continue;
      let ok = true;
      if (def.prereq) for (const p of def.prereq) { if ((levels[p.key]||0)<p.level) { ok=false; break; } }
      if (!ok) continue;
      const cost = getBuildCost(o.k, next);
      if (!cost || !canAfford(city, cost)) continue;
      const dur = getBuildTime(o.k, next);
      const endsAt = new global.Date(simulatedTime + dur*1000);
      const isField = ['LUMBER','QUARRY','IRON_MINE','FARM'].includes(o.k);
      let slot = isField ? (city.buildings.find(b=>b.key===o.k))?.slot : undefined;
      if (!slot) { const used = new Set([...city.buildings.map(b=>b.slot),...city.buildQueue.map(q=>q.slot)]); slot=1; while(used.has(slot)) slot++; }
      try {
        await prisma.$transaction(async tx => {
          await tx.city.update({where:{id:city.id},data:{wood:city.wood-cost.wood,stone:city.stone-cost.stone,iron:city.iron-cost.iron,food:city.food-cost.food}});
          await tx.buildQueueItem.create({data:{cityId:city.id,buildingKey:o.k,targetLevel:next,slot,startedAt:now,endsAt,status:'RUNNING'}});
        });
        city.wood-=cost.wood; city.stone-=cost.stone; city.iron-=cost.iron; city.food-=cost.food;
        stats[player.faction].builds++;
      } catch(e) {}
      break;
    }
  }

  // === RECRUIT (every 6h) ===
  if (hour % 6 === 0 && city.recruitQueue.length === 0) {
    const barracks = city.buildings.find(b => b.key === 'BARRACKS');
    const stable = city.buildings.find(b => b.key === 'STABLE');
    if (!barracks) return;

    // Check food balance: only recruit if food production > current upkeep + new upkeep
    const foodProd = estimateFoodProd(city.buildings);
    const currentUpkeep = estimateUpkeep(city.armies);
    const foodSurplus = foodProd - currentUpkeep;

    // Don't recruit if food surplus is too low
    if (foodSurplus < 20 && city.food < 500) return;

    let unitKey, tier, count;

    // Choose unit type based on progression and hour
    const useInf = hour % 12 !== 0;  // infantry 2/3 of the time
    const useArch = hour % 12 === 0 && hour % 24 !== 0; // archers 1/6
    const useCav = hour % 24 === 0;  // cavalry 1/6

    if (useInf || !stable) {
      if (barracks.level >= 10) {
        const u = unitFor(player.faction, 'elite', 'INFANTRY');
        if (u) { unitKey=u.key; tier='elite'; count=5+Math.floor(Math.random()*10); }
      } else if (barracks.level >= 5) {
        const u = unitFor(player.faction, 'intermediate', 'INFANTRY');
        if (u) { unitKey=u.key; tier='intermediate'; count=8+Math.floor(Math.random()*12); }
      } else {
        const u = unitFor(player.faction, 'base', 'INFANTRY');
        if (u) { unitKey=u.key; tier='base'; count=10+Math.floor(Math.random()*15); }
      }
    } else if (useArch) {
      const t = barracks.level >= 10 ? 'elite' : barracks.level >= 5 ? 'intermediate' : 'base';
      const u = unitFor(player.faction, t, 'ARCHER');
      if (u) { unitKey=u.key; tier=t; count=5+Math.floor(Math.random()*10); }
    } else if (useCav && stable) {
      const t = stable.level >= 10 ? 'elite' : stable.level >= 5 ? 'intermediate' : 'base';
      const u = unitFor(player.faction, t, 'CAVALRY');
      if (u) { unitKey=u.key; tier=t; count=3+Math.floor(Math.random()*7); }
    }

    if (!unitKey) return;

    // Check upkeep: new units' upkeep shouldn't exceed surplus
    const newUpkeepRate = config.army.upkeepPerTier[tier] || 2.5;
    const newUpkeep = count * newUpkeepRate;
    if (newUpkeep > foodSurplus * 0.8 && city.food < 2000) {
      // Reduce count to what we can sustain
      count = Math.max(1, Math.floor((foodSurplus * 0.5) / newUpkeepRate));
    }
    if (count < 1) return;

    const uDef = unitsData.find(u => u.key === unitKey);
    const classCosts = config.recruit.baseCosts[uDef?.class] || config.recruit.baseCosts.INFANTRY;
    const tierCostMult = config.recruit.tierCostMultipliers[tier] || 1.0;
    const cost = {
      wood: Math.ceil(classCosts.wood * tierCostMult * count),
      stone: Math.ceil(classCosts.stone * tierCostMult * count),
      iron: Math.ceil(classCosts.iron * tierCostMult * count),
      food: Math.ceil(classCosts.food * tierCostMult * count)
    };
    if (!canAfford(city, cost)) return;

    const classBaseTime = config.recruit.baseTimeSec[uDef?.class] || 360;
    const tierTimeMult = config.recruit.tierTimeMultipliers[tier] || 1.0;
    const baseTime = Math.ceil(classBaseTime * tierTimeMult);
    const totalTime = baseTime * count;
    const endsAt = new global.Date(simulatedTime + totalTime*1000);

    try {
      await prisma.$transaction(async tx => {
        await tx.city.update({where:{id:city.id},data:{wood:city.wood-cost.wood,stone:city.stone-cost.stone,iron:city.iron-cost.iron,food:city.food-cost.food}});
        await tx.recruitQueueItem.create({data:{cityId:city.id,unitKey,count,buildingKey:'BARRACKS',startedAt:now,endsAt,status:'RUNNING'}});
      });
      stats[player.faction].recruits += count;
    } catch(e) {}
  }

  // === EXPEDITION (every 8h) ===
  if (hour % 8 === 0) {
    try {
      const garrison = city.armies.find(a => a.isGarrison);
      const total = garrison?.units?.reduce((s,u)=>s+u.count,0)||0;
      if (total >= 10) {
        const exp = await prisma.expedition.findFirst({where:{playerId:player.id,status:'AVAILABLE'}});
        if (exp) {
          await prisma.expedition.update({where:{id:exp.id},data:{status:'IN_PROGRESS',armyId:garrison.id,startedAt:now,endsAt:new global.Date(simulatedTime+(exp.duration||300)*1000)}});
          stats[player.faction].expeditions++;
        }
      }
    } catch(e) {}
  }

  // === ATTACK (every 48h, after month 3) ===
  if (hour > 2160 && hour % 48 === 0) {
    try {
      const garrison = city.armies.find(a=>a.isGarrison);
      const total = garrison?.units?.reduce((s,u)=>s+u.count,0)||0;
      if (total < 50) return;
      const rp = city.buildings.find(b=>b.key==='RALLY_POINT');
      if (!rp) return;
      const active = city.armies.filter(a=>!a.isGarrison && a.status!=='IDLE').length;
      if (active >= 1) return;
      const target = players[Math.floor(Math.random()*players.length)];
      if (target.id === player.id) return;
      const tc = await prisma.city.findFirst({where:{playerId:target.id}});
      if (!tc) return;

      const toSend = [];
      for (const u of (garrison?.units||[])) {
        const send = Math.floor(u.count * 0.4);
        if (send > 0) {
          toSend.push({unitKey:u.unitKey,tier:u.tier,count:send});
          await prisma.armyUnit.update({where:{id:u.id},data:{count:u.count-send}});
        }
      }
      if (toSend.length > 0) {
        const dist = Math.sqrt((tc.x-city.x)**2+(tc.y-city.y)**2);
        const arrivalAt = new global.Date(simulatedTime + Math.ceil(dist*30)*1000);
        await prisma.army.create({data:{
          ownerId:player.id,playerId:player.id,cityId:city.id,
          name:`Attaque sur ${tc.name}`,x:city.x,y:city.y,
          isGarrison:false,status:'ATTACKING',
          missionType:Math.random()<0.5?'ATTACK':'RAID',
          targetX:tc.x,targetY:tc.y,targetCityId:tc.id,arrivalAt,
          units:{create:toSend}
        }});
        stats[player.faction].attacks++;
        battleCount++;
      }
    } catch(e) {}
  }

  // === BONUS RESOURCES (first month) ===
  if (hour % 24 === 0 && hour < 720) {
    try {
      await prisma.city.update({where:{id:city.id},data:{wood:{increment:300},stone:{increment:300},iron:{increment:300},food:{increment:500}}});
    } catch(e) {}
  }
}

// ============ REPORTS ============
async function printQuarterlyReport(players) {
  _log('  ┌────────────────────┬────────┬────────┬────────┬────────┬──────┐');
  _log('  │ Joueur             │  Pop.  │ Armée  │ Bâtim. │ Recrut │  Or  │');
  _log('  ├────────────────────┼────────┼────────┼────────┼────────┼──────┤');
  for (const p of players) {
    const pl = await prisma.player.findUnique({where:{id:p.id}});
    const c = await prisma.city.findFirst({where:{id:p.cityId},include:{armies:{include:{units:true}},buildings:true}});
    const units = c?.armies?.reduce((s,a)=>s+a.units.reduce((su,u)=>su+u.count,0),0)||0;
    const blds = c?.buildings?.length||0;
    _log(`  │ ${p.name.padEnd(18).slice(0,18)} │ ${String(pl?.population||0).padStart(5)}  │ ${String(units).padStart(5)}  │ ${String(blds).padStart(5)}  │ ${String(stats[p.faction].recruits).padStart(5)}  │ ${String(Math.floor(pl?.gold||0)).padStart(4)} │`);
  }
  _log('  └────────────────────┴────────┴────────┴────────┴────────┴──────┘');
  _log();
}

async function printFinalReport(players) {
  _log('╔══════════════════════════════════════════════════════════╗');
  _log('║              RAPPORT FINAL - 2 ANS                      ║');
  _log('╚══════════════════════════════════════════════════════════╝');
  _log();

  for (const p of players) {
    const pl = await prisma.player.findUnique({where:{id:p.id}});
    const c = await prisma.city.findFirst({where:{id:p.cityId},include:{buildings:{orderBy:{level:'desc'}},armies:{include:{units:true}}}});
    const hero = await prisma.hero.findFirst({where:{playerId:p.id}});

    _log(`  ═══ ${p.name} (${p.faction}) ═══`);
    _log(`  Population: ${pl?.population||0} | Or: ${Math.floor(pl?.gold||0)}`);
    _log(`  Héros: Niv.${hero?.level||1} (${hero?.xp||0} XP) ATK:${hero?.attack}+${hero?.atkPoints} DEF:${hero?.defense}+${hero?.defPoints}`);
    _log(`  Ressources: B=${Math.floor(c?.wood||0)} P=${Math.floor(c?.stone||0)} F=${Math.floor(c?.iron||0)} N=${Math.floor(c?.food||0)}`);
    _log(`  Stockage: ${c?.maxStorage||0} / Nourriture: ${c?.maxFoodStorage||0}`);
    _log(`  Bâtiments (${c?.buildings?.length||0}):`);
    for (const b of (c?.buildings||[]).slice(0,20)) {
      const d = buildingsData.find(x=>x.key===b.key);
      _log(`    ${(d?.name||b.key).padEnd(26)} Niv.${b.level}`);
    }
    const gar = c?.armies?.find(a=>a.isGarrison);
    const totalU = gar?.units?.reduce((s,u)=>s+u.count,0)||0;
    _log(`  Garnison: ${totalU} unités`);
    for (const u of (gar?.units||[])) {
      const d = unitsData.find(x=>x.key===u.unitKey);
      _log(`    ${(d?.name||u.unitKey).padEnd(26)} x${u.count}`);
    }
    _log(`  Stats: ${stats[p.faction].builds} constructions, ${stats[p.faction].recruits} recrues, ${stats[p.faction].attacks} attaques, ${stats[p.faction].expeditions} expéditions`);
    _log();
  }

  const all = await prisma.player.findMany({orderBy:{population:'desc'}});
  const battles = await prisma.battleReport.count();
  const exps = await prisma.expedition.count({where:{status:'COMPLETED'}});

  _log('  ═══ STATISTIQUES GLOBALES ═══');
  _log(`  Batailles: ${battles} | Expéditions: ${exps} | Attaques lancées: ${battleCount}`);
  _log();
  _log('  ═══ CLASSEMENT FINAL ═══');
  all.forEach((p,i) => _log(`  ${i+1}. ${p.name.padEnd(20)} Pop: ${String(p.population).padStart(5)}  Or: ${String(Math.floor(p.gold)).padStart(5)}  (${p.faction})`));
  _log();
}

simulate().catch(e => { console.error('FATAL:', e); process.exit(1); });
