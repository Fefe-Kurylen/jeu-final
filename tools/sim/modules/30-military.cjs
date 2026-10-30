// Simulation longue — militaire : recrutement (classes et paliers débloqués par Caserne / Écurie / Atelier, entretien
// soutenable), armées de la Place de rassemblement (création, composition, dissolution), soins des blessés, récolte des
// points de ressource et attaque de leurs tribus, colons de la Résidence et fondation de villes secondaires, rappels.
// Pas de combat entre joueurs ici (attaques, sièges, renforts, espions : module de guerre).
// Chaque joueur fait au plus CALLS_PER_TURN appels par tour et vérifie les conditions avant d'appeler (peu de refus).
// Décision du 30 octobre 2026 (§ 1 bis) : recrutement, soins, Résidence et fondation se paient sur le stock de toutes les
// villes (../stock.cjs), l'entretien sur tous les greniers ; toute unité formée ou soignée rejoint la garnison de la capitale.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { unitsData, buildingsData } = require(path.join(ROOT, 'src/config/gamedata'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const { baseTrainSecondsFor } = require(path.join(ROOT, 'src/utils/calculations'));
const Stock = require('../stock.cjs');
const Terrain = require(path.join(ROOT, 'frontend/js/shared/terrain.js'));   // le terrain que le client dessine (même graine)

const RES = ['wood', 'stone', 'iron', 'food'];
const TIER_MULT = config.combat.tierCoefficients;
const UPKEEP = config.army.upkeepPerTier;
const MAX_QUEUE = config.build.maxRunning + config.build.maxQueued;
const FOUND_COST = config.city.foundationTransport;
const MAX_BATCHES = config.recruit.maxBatchesPerBuilding;
const RECRUIT_BUILDING = { INFANTRY: 'BARRACKS', ARCHER: 'BARRACKS', CAVALRY: 'STABLE', SIEGE: 'WORKSHOP' };
const HARVEST_TYPES = ['WOOD', 'STONE', 'IRON', 'FOOD', 'GOLD'];
const COLONY_TYPES = ['WOOD', 'STONE', 'IRON', 'FOOD'];
const RES_OF = { WOOD: 'wood', STONE: 'stone', IRON: 'iron', FOOD: 'food' };
const SCAN_RADIUS = 22;          // points de ressource regardés autour de la ville (la carte du client)
const RAID_RANGE = 20;           // une armée ne part pas plus loin
const CALLS_PER_TURN = 8;        // lectures comprises
const HOLD_STEPS = 8;            // une récolte est rappelée après 2 jours (la récolte du jeu ne suit pas le pas de 6 h)
const DOCTRINE = {               // part de chaque classe dans l'armée, selon la civilisation
  ROME: { INFANTRY: 0.55, ARCHER: 0.25, CAVALRY: 0.2 }, GREEK: { INFANTRY: 0.5, ARCHER: 0.3, CAVALRY: 0.2 },
  GAUL: { INFANTRY: 0.4, ARCHER: 0.25, CAVALRY: 0.35 }, EGYPT: { INFANTRY: 0.35, ARCHER: 0.4, CAVALRY: 0.25 },
  HUN: { INFANTRY: 0.2, ARCHER: 0.3, CAVALRY: 0.5 }, SULTAN: { INFANTRY: 0.25, ARCHER: 0.3, CAVALRY: 0.45 }
};
const TIERS = ['base', 'intermediate', 'elite'];

const UNIT = Object.fromEntries(unitsData.map(u => [u.key, u]));
const def = (k) => buildingsData.find(b => b.key === k);
const effect = (k, e, d) => def(k)?.effects?.[e] ?? d;
const UNLOCK = {
  BARRACKS: [effect('BARRACKS', 'unlockIntermediateTier', 7), effect('BARRACKS', 'unlockEliteTier', 15)],
  STABLE: [effect('STABLE', 'unlockIntermediateTier', 7), effect('STABLE', 'unlockEliteTier', 15)]
};
const lvl = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const queuedLvl = (city, key) => (city?.buildQueue || []).filter(q => q.buildingKey === key).reduce((m, q) => Math.max(m, q.targetLevel || 0), 0);
const unitPower = (key) => { const u = UNIT[key]; return u ? ((u.stats?.attack || 0) + (u.stats?.defense || 0)) * (TIER_MULT[u.tier] || 1) : 0; };
const powerOf = (units) => (units || []).reduce((t, u) => t + unitPower(u.unitKey) * u.count, 0);
const countOf = (units) => (units || []).reduce((t, u) => t + (u.count || 0), 0);
const carryOf = (units) => (units || []).reduce((t, u) => t + (UNIT[u.unitKey]?.stats?.transport || 50) * u.count, 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const isHome = (a, city) => !!city && a.x === city.x && a.y === city.y;
const stepHours = (ctx) => Math.max(1, Number(ctx.OPT?.stepHours) || 1);   // l'entretien retiré d'un coup à chaque tick

// ---------- ce que le joueur voit de la carte autour d'une ville (GET /api/map/viewport), gardé quelques pas ----------
const VIEW = new Map();   // cityId -> { step, nodes, cities, bastions }
async function scan(bot, ctx, B, city, maxAge = 3) {
  const v = VIEW.get(city.id);
  if (v && ctx.step - v.step <= maxAge) return v;
  if (B.left <= 0) return v || null;
  B.left--;
  const r = await bot.get(`/api/map/viewport?x=${city.x}&y=${city.y}&radius=${SCAN_RADIUS}`);
  if (!r.ok || !r.data) return v || null;
  const nv = { step: ctx.step, nodes: r.data.resourceNodes || [], cities: r.data.cities || [], bastions: r.data.bastions || [] };
  VIEW.set(city.id, nv);
  return nv;
}
const tribeOn = (n) => !!n.hasDefenders && (n.defenderPower || 0) > 0;
const someoneOn = (n) => !!n.hasPlayerArmy || (n.holders || []).length > 0 || (n.hiddenHolders || 0) > 0;

// une ville couvre 2 × 2 cases : les trois cases voisines du point libres (relief, eau, villes, points, Bastions)
function footprintOk(node, view) {
  try {
    if (!Terrain.isMainland(node.x, node.y)) return false;
    for (const [cx, cy] of Terrain.cityCells(node.x, node.y)) {
      if (!Terrain.inWorld(cx, cy)) return false;
      const f = Terrain.getTerrainType(cx, cy).feature;
      if (Terrain.BLOCKED[f] || f === 'bridge' || f === 'ford') return false;
      if (view.nodes.some(o => o.id !== node.id && o.x === cx && o.y === cy)) return false;
    }
  } catch (e) { return false; }
  if (view.cities.some(c => Math.abs(c.x - node.x) <= 2 && Math.abs(c.y - node.y) <= 2)) return false;
  if (view.bastions.some(b => Math.abs(b.x - node.x) <= 2 && Math.abs(b.y - node.y) <= 2)) return false;
  return true;
}

// ---------- état du joueur (mem : identifiants et compteurs seulement) ----------
function memOf(bot) {
  const m = (bot.mem.mil ||= {});
  m.own ||= [];        // armées de ce module
  m.h ||= {};          // armée -> pas où sa récolte a commencé
  m.m ||= {};          // armée -> mission en cours { n: point, s: pas, u: soldats au départ, t: 'r'|'c', d: jugée }
  m.k ||= {};          // compteurs
  m.ratio ||= 1.6;     // puissance demandée face à une tribu (apprise : monte après une défaite)
  return m;
}
const bump = (m, k, n = 1) => { m.k[k] = (m.k[k] || 0) + n; };
const garrisonOf = (bot, city) => bot.armies.find(a => a.isGarrison && a.cityId === city.id) || null;
const cityOf = (bot, id) => bot.cities.find(c => c.id === id) || null;

// ---------- recrutement ----------
function unlockedUnits(city, faction) {
  const bar = Math.max(lvl(city, 'BARRACKS'), lvl(city, 'GREAT_BARRACKS'));
  const st = Math.max(lvl(city, 'STABLE'), lvl(city, 'GREAT_STABLE'));
  const ws = city.isCapital ? lvl(city, 'WORKSHOP') : 0;
  const tierOk = (tier, level, [inter, elite]) => level >= 1 && (tier === 'base' || (tier === 'intermediate' && level >= inter) || (tier === 'elite' && level >= elite));
  return unitsData.filter(u => u.faction === faction && (
    ((u.class === 'INFANTRY' || u.class === 'ARCHER') && tierOk(u.tier, bar, UNLOCK.BARRACKS)) ||
    (u.class === 'CAVALRY' && tierOk(u.tier, st, UNLOCK.STABLE)) ||
    (u.class === 'SIEGE' && ws >= config.recruit.siegeWorkshopLevel)));
}

// soldats de chaque classe : armées du joueur et files de recrutement
function classCounts(bot) {
  const by = { INFANTRY: 0, ARCHER: 0, CAVALRY: 0, SIEGE: 0 };
  for (const a of bot.armies) for (const u of a.units || []) { const c = UNIT[u.unitKey]?.class; if (c) by[c] += u.count; }
  for (const c of bot.cities) for (const q of c.recruitQueue || []) { const k = UNIT[q.unitKey]?.class; if (k) by[k] += q.count; }
  return by;
}

// réserve du joueur pour une fondation (colon prêt ou en formation dans la capitale) : elle se paie sur toutes ses villes
function colonyReserve(bot) {
  const cap = bot.capital;
  const training = (cap?.recruitQueue || []).some(q => q.unitKey === 'SETTLER');
  if (!cap || !(cap.settlers > 0 || training)) return {};
  return Object.fromEntries(RES.map(r => [r, FOUND_COST[r] + 300]));
}

async function recruit(bot, ctx, B, m, city) {
  if (B.left <= 0 || city.isSieged) return;
  // l'entretien puise dans tous les greniers du joueur : c'est son bilan qui compte, pas celui de la ville
  const fb = Stock.foodBalance(bot);
  if (!fb || !(fb.net > 0)) { if (fb && fb.net < 0) bump(m, 'foodStop'); return; }
  const units = unlockedUnits(city, bot.faction);
  if (!units.length) return;
  const halls = bot.cities.reduce((t, c) => t + lvl(c, 'MAIN_HALL'), 0);
  const counts = classCounts(bot);
  const total = Object.values(counts).reduce((t, x) => t + x, 0);
  if (total >= 40 + 45 * halls) return;   // une armée à la mesure des villes du joueur
  const red = Math.min(50, city.foodBalance?.reductionPct || 0) / 100;   // bâtiments de la capitale et recherche : le même partout
  // l'entretien des lots en file (toutes les villes) n'est pas encore dans le bilan : il compte déjà
  const queuedUpkeep = bot.cities.reduce((t, c) => t + (c.recruitQueue || []).reduce((u, q) => u + (UNIT[q.unitKey] ? q.count * (UPKEEP[UNIT[q.unitKey].tier] || 5) * (1 - red) : 0), 0), 0);
  // garder 30 % de la production pour grandir, et des greniers au moins à moitié pleins d'un tick à l'autre : le tick ajoute
  // la production plafonnée aux greniers puis retire tout l'entretien du pas (avec des pas de 6 h, un entretien de 6 h proche
  // des greniers les vide à chaque tick, même avec un bilan positif)
  const stock = Stock.totals(bot);
  const granary = Math.max(0, 0.5 * stock.maxFoodStorage / stepHours(ctx) - (fb.consumption || 0) - queuedUpkeep);
  const headroom = Math.min(fb.net - queuedUpkeep - Math.max(20, 0.3 * (fb.production || 0)), granary);
  if (headroom <= 0) { bump(m, 'foodCap'); return; }

  // la classe la plus en retard sur la doctrine (engins à part : quelques-uns pour le module de guerre)
  const doctrine = DOCTRINE[bot.faction] || DOCTRINE.ROME;
  const fighters = units.filter(u => u.class !== 'SIEGE');
  const classes = [...new Set(fighters.map(u => u.class))];
  const sumF = counts.INFANTRY + counts.ARCHER + counts.CAVALRY;
  let unit = null;
  const siege = units.filter(u => u.class === 'SIEGE');
  if (siege.length && counts.SIEGE < Math.min(8, 2 + Math.floor(lvl(city, 'WORKSHOP') / 4)) && ctx.rand() < 0.3) unit = siege[0];
  if (!unit && classes.length) {
    const norm = classes.reduce((t, c) => t + (doctrine[c] || 0.2), 0);
    const cls = classes.sort((a, b) => ((doctrine[b] || 0.2) / norm - counts[b] / Math.max(1, sumF)) - ((doctrine[a] || 0.2) / norm - counts[a] / Math.max(1, sumF)))[0];
    const ofClass = fighters.filter(u => u.class === cls).sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier));
    // le meilleur palier débloqué, parfois un palier en dessous (plus de soldats pour le même prix)
    unit = ofClass.length > 1 && ctx.rand() < 0.25 ? ofClass[1] : ofClass[0];
  }
  if (!unit) return;
  const bKey = RECRUIT_BUILDING[unit.class];
  const queue = (city.recruitQueue || []).filter(q => q.buildingKey === bKey);
  if (queue.length >= Math.min(MAX_BATCHES, 2)) return;   // deux lots d'avance au plus
  // ressources (toutes les villes) : une part de ce qui reste après les constructions (plus quand les dépôts débordent),
  // réserve de fondation à part
  const reserve = colonyReserve(bot);
  const share = (r) => (stock[r] > 0.85 * (r === 'food' ? stock.maxFoodStorage : stock.maxStorage) ? 0.6 : 0.35);
  const one = Stock.recruitCost(unit, 1);
  const byRes = Math.min(...RES.map(r => (one[r] > 0 ? Math.floor(Math.max(0, stock[r] - (reserve[r] || 0)) * share(r) / one[r]) : Infinity)));
  const byFood = Math.floor(headroom / ((UPKEEP[unit.tier] || 5) * (1 - red)));
  // temps : le lot finit dans les 18 h (les lots d'un bâtiment passent l'un après l'autre) ; celui du bâtiment de la ville
  // qui forme (Grande caserne d'une colonie comprise), même si les unités rejoignent la capitale
  const perUnit = Math.max(1, baseTrainSecondsFor(unit) * (1 - fx.trainTimeReductionPct(city.buildings, unit.class) / 100));
  const queueEnd = queue.reduce((t, q) => Math.max(t, new Date(q.endsAt).getTime()), ctx.clock.now());
  const byTime = Math.floor((18 * 3600000 - (queueEnd - ctx.clock.now())) / 1000 / perUnit);
  const n = Math.min(byRes, byFood, byTime, unit.class === 'SIEGE' ? 2 : 300, 40 + 45 * halls - total);
  if (!(n >= (unit.class === 'SIEGE' ? 1 : 5))) { bump(m, n === byFood ? 'foodCap' : 'recruitWait'); return; }
  B.left--;
  const r = await bot.post(`/api/cities/${city.id}/recruit`, { unitKey: unit.key, count: n });
  if (!r.ok) { bump(m, 'recruitRefused'); return; }
  Stock.spend(bot, city, r.data?.cost || Stock.recruitCost(unit, n));
  (city.recruitQueue ||= []).push(r.data?.queueItem || { unitKey: unit.key, count: n, buildingKey: bKey, endsAt: new Date(queueEnd + n * perUnit * 1000).toISOString() });
  bump(m, 'recruited', n); bump(m, 'batches'); bump(m, `t_${unit.tier}`, n); bump(m, `c_${unit.class}`, n);
}

// ---------- blessés : soin payant à la Tente de soins de la capitale (stock de toutes les villes), soin à l'or ----------
// GET /wounded rend les blessés de toutes les villes du joueur (chaque ligne dit sa ville) ; `healable` : ce que les lits
// libres et le stock paient. Les soignés rejoignent la garnison de la capitale.
async function heal(bot, ctx, B, m, cap) {
  if (B.left < 2 || !lvl(cap, 'HEALING_TENT') || cap.isSieged) return;
  const due = m.wc === undefined || ctx.step >= m.wc || m.hurt;
  if (!due) return;
  m.wc = ctx.step + 12; m.hurt = 0;
  B.left--;
  const r = await bot.get(`/api/cities/${cap.id}/wounded`);
  if (!r.ok || !Array.isArray(r.data)) return;
  const inBed = r.data.filter(w => w.count > 0).reduce((t, w) => t + w.count, 0);
  const waiting = r.data.reduce((t, w) => t + (w.waiting || 0), 0);
  if (inBed + waiting > 0) bump(m, 'woundedSeen', inBed + waiting);
  if (waiting > 0) m.wc = ctx.step + 2;   // des lits se libèrent : revenir bientôt
  // 1. lancer le soin de ceux qui attendent, les plus nombreux d'abord, sans toucher la réserve d'une fondation
  const reserve = colonyReserve(bot);
  for (const w of r.data.filter(x => x.waiting > 0 && x.healable > 0 && x.healCost).sort((a, b) => b.waiting - a.waiting).slice(0, 2)) {
    if (B.left <= 1) break;
    if (!Stock.canPay(bot, w.healCost, { reserve })) { bump(m, 'healWaitRes'); continue; }
    B.left--;
    const h = await bot.post(`/api/cities/${w.cityId}/wounded/start`, { unitKey: w.unitKey, count: w.healable });
    if (!h.ok) { bump(m, 'healStartRefused'); break; }
    Stock.spend(bot, cap, h.data?.cost || w.healCost);   // payé dans la capitale d'abord (la tente y est)
    bump(m, 'healStarted', h.data?.started || w.healable);
  }
  // 2. soin à l'or des blessés déjà au lit, quand il reste de l'or
  let gold = bot.me?.gold || 0;
  for (const w of r.data.filter(x => x.count >= 1 && x.instantGold > 0).sort((a, b) => b.count - a.count).slice(0, 2)) {
    if (B.left <= 0 || gold - 30 < w.instantGold) break;   // garder un peu d'or
    B.left--;
    const h = await bot.post(`/api/cities/${w.cityId}/wounded/heal`, { unitKey: w.unitKey });
    if (!h.ok) { bump(m, 'healRefused'); break; }
    gold -= h.data?.goldSpent || w.instantGold;
    if (bot.me) bot.me.gold = gold;
    bump(m, 'healed', h.data?.healed || w.count); bump(m, 'healGold', h.data?.goldSpent || w.instantGold);
  }
}

// ---------- armées de la Place de rassemblement ----------
async function organise(bot, ctx, B, m, city, wantArmies) {
  if (B.left <= 0 || !lvl(city, 'RALLY_POINT')) return;
  const maxArmies = fx.maxArmies(city.buildings);
  const mine = bot.armies.filter(a => m.own.includes(a.id) && a.cityId === city.id);
  const garrison = garrisonOf(bot, city);
  const gCount = countOf((garrison?.units || []).filter(u => UNIT[u.unitKey]?.class !== 'SIEGE'));
  const want = Math.min(maxArmies, wantArmies);
  if (mine.length < want && gCount >= (mine.length ? 15 : 25)) {
    const used = new Set(bot.armies.filter(a => !a.isGarrison && a.cityId === city.id).map(a => a.slot));
    let slot = null;
    for (let s = 1; s <= maxArmies; s++) if (!used.has(s)) { slot = s; break; }
    if (slot) {
      B.left--;
      const r = await bot.post('/api/army/create', { cityId: city.id, slot });
      if (r.ok && r.data?.army) { m.own.push(r.data.army.id); bot.armies.push({ ...r.data.army, units: [], power: 0 }); bump(m, 'armiesCreated'); }
      else bump(m, 'createRefused');
    }
  }
}

// garnison -> armée : 70 % de chaque troupe (les engins restent), les trois plus nombreuses
async function fill(bot, ctx, B, m, army, city, share = 0.7) {
  const garrison = garrisonOf(bot, city);
  if (!garrison) return;
  const rows = (garrison.units || []).filter(u => UNIT[u.unitKey] && UNIT[u.unitKey].class !== 'SIEGE' && u.count >= 5).sort((a, b) => b.count - a.count).slice(0, 3);
  for (const g of rows) {
    if (B.left <= 1) break;
    const take = Math.floor(g.count * share);
    if (take < 5) continue;
    B.left--;
    const row = (army.units ||= []).find(u => u.unitKey === g.unitKey);
    // comme le client : un nombre total (set-unit) pour la troupe principale, un ajout (adjust-unit) pour les autres
    const r = g === rows[0]
      ? await bot.post(`/api/army/${army.id}/set-unit`, { unitKey: g.unitKey, count: (row?.count || 0) + take })
      : await bot.post(`/api/army/${army.id}/adjust-unit`, { unitKey: g.unitKey, delta: take });
    if (!r.ok) { bump(m, 'fillRefused'); break; }
    g.count -= take;
    if (row) row.count += take; else army.units.push({ unitKey: g.unitKey, tier: UNIT[g.unitKey].tier, count: take });
    bump(m, 'moved', take);
  }
}

// ---------- missions sur les points de ressource ----------
function needWeight(city, type) {
  if (type === 'GOLD') return 1.3;
  const r = RES_OF[type];
  const cap = r === 'food' ? city.maxFoodStorage : city.maxStorage;
  return 1.6 - Math.min(1, (city[r] || 0) / Math.max(1, cap));   // le plus manquant d'abord
}
function bestTarget(bot, m, army, city, view, exclude) {
  const power = powerOf(army.units);
  const carry = carryOf(army.units);
  const ally = bot.me?.alliance?.allianceId || null;
  let best = null;
  for (const n of view.nodes) {
    if (!HARVEST_TYPES.includes(n.resourceType) || n.cityId || exclude.has(n.id)) continue;
    const d = dist(n, city);
    if (d > RAID_RANGE || d < 1 || (n.amount || 0) < 300) continue;   // un point presque vide ne vaut pas la marche
    const holders = n.holders || [];
    if ((n.hiddenHolders || 0) > 0) continue;   // tenu par un autre joueur : affaire du module de guerre
    let kind;
    if (holders.length) {
      // récolte partagée avec sa propre armée ou celles de son alliance (jamais sur une fondation)
      if (holders.some(h => h.founding || h.playerId === bot.playerId || !ally || h.allianceId !== ally)) continue;
      kind = 'c';
    } else if (tribeOn(n)) { if (power < m.ratio * n.defenderPower) continue; kind = 'r'; }
    else if (!n.hasPlayerArmy) kind = 'c';
    else continue;
    const loot = Math.min(carry, n.amount || 0);
    const score = loot * needWeight(city, n.resourceType) * (kind === 'r' ? 1 : 1.2) / (d + 6);
    if (!best || score > best.score) best = { node: n, kind, score };
  }
  return best;
}

async function mission(bot, ctx, B, m, army, city, view, exclude) {
  const t = bestTarget(bot, m, army, city, view, exclude);
  if (!t || B.left <= 0) return false;
  B.left--;
  const route = t.kind === 'r' ? 'raid-resource' : 'collect-resource';
  const r = await bot.post(`/api/army/${army.id}/${route}`, { resourceNodeId: t.node.id });
  exclude.add(t.node.id);
  if (!r.ok) { bump(m, t.kind === 'r' ? 'raidRefused' : 'collectRefused'); t.node.hasDefenders = true; return false; }
  bump(m, t.kind === 'r' ? 'raids' : 'collects');
  m.m[army.id] = { n: t.node.id, s: ctx.step, u: countOf(army.units), t: t.kind };
  t.node.hasPlayerArmy = true;
  army.status = r.data?.status || 'MOVING';
  return true;
}

// issue des attaques de tribus (la puissance demandée s'ajuste) et suivi des récoltes
function review(bot, ctx, m) {
  for (const [id, x] of Object.entries(m.m)) {
    const a = bot.armies.find(y => y.id === id);
    if (!a) { delete m.m[id]; continue; }
    const city = cityOf(bot, a.cityId);
    if (x.t === 'r' && !x.d) {
      if (a.status === 'HARVESTING') { x.d = 1; bump(m, 'tribeWins'); m.ratio = Math.max(1.1, m.ratio - 0.05); }
      else if (a.status === 'RETURNING' || (a.status === 'IDLE' && isHome(a, city))) {
        x.d = 1;
        if (countOf(a.units) < x.u) m.hurt = 1;   // des pertes : des blessés rentrent avec elle
        if (countOf(a.units) < 0.6 * x.u) { bump(m, 'tribeLosses'); m.ratio = Math.min(3.5, m.ratio + 0.3); }
        else bump(m, 'tribeWins');
      }
    }
    if (a.status === 'IDLE' && isHome(a, city)) delete m.m[id];
  }
  for (const id of Object.keys(m.h)) { const a = bot.armies.find(y => y.id === id); if (!a || a.status !== 'HARVESTING') delete m.h[id]; }
  for (const a of bot.armies) if (m.own.includes(a.id) && a.status === 'HARVESTING' && m.h[a.id] === undefined) m.h[a.id] = ctx.step;
}

// rappels : récolte assez longue, armée arrêtée hors de sa ville
async function recalls(bot, ctx, B, m) {
  const col = m.col;
  for (const a of bot.armies) {
    if (B.left <= 3) break;
    if (a.isGarrison || !m.own.includes(a.id)) continue;
    if (col && a.id === col.a && col.ph === 'approach') continue;   // postée à côté du camp de la future colonie
    const city = cityOf(bot, a.cityId);
    if (!city) continue;
    let why = null;
    if (a.status === 'HARVESTING') {
      const load = (a.carryWood || 0) + (a.carryStone || 0) + (a.carryIron || 0) + (a.carryFood || 0) + (a.carryGold || 0);
      if (ctx.step - (m.h[a.id] ?? ctx.step) >= HOLD_STEPS || load >= 0.95 * carryOf(a.units)) why = 'harvest';
    } else if (a.status === 'IDLE' && !isHome(a, city) && !a.claimedAt) why = 'stray';
    if (!why) continue;
    B.left--;
    const r = await bot.post(`/api/army/${a.id}/return`);
    if (r.ok) { a.status = 'RETURNING'; bump(m, why === 'harvest' ? 'harvestRecalls' : 'strayRecalls'); }
    else bump(m, 'returnRefused');
  }
}

// ---------- Résidence, colons, fondation ----------
function settlerUse(bot, cap) {
  const slots = Math.min(config.city.maxSecondaryCities, fx.settlerSlots(lvl(cap, 'RESIDENCE')));
  const colonies = bot.cities.filter(c => !c.isCapital && !c.isWonder).length;   // comme la route des colons (Ville Merveille à part)
  const travelling = bot.armies.reduce((t, a) => t + (a.settlers || 0), 0);
  const training = (cap.recruitQueue || []).filter(q => q.unitKey === 'SETTLER').reduce((t, q) => t + q.count, 0);
  return { slots, used: colonies + (cap.settlers || 0) + travelling + training, colonies, training };
}

// la Résidence jusqu'au niveau du colon suivant ; avant elle, le stockage qu'il faut pour la payer (et pour les 3 000 de
// chaque ressource d'une fondation), et le Bâtiment principal qui plafonne ce stockage. Le prix se paie sur toutes les
// villes : c'est leur stockage réuni qui compte, moins l'entretien d'un pas pour la nourriture (Stock.room). Avant ce calcul,
// le grenier de la seule capitale moins 6 h d'entretien ne tenait jamais la Résidence 20 : pas de troisième colonie.
async function residence(bot, ctx, B, m, cap) {
  if (B.left <= 0) return;
  if (lvl(cap, 'MAIN_HALL') < 10) return;
  const colonies = bot.cities.filter(c => !c.isCapital && !c.isWonder).length;
  if (colonies >= config.city.maxSecondaryCities) return;
  const target = [10, 15, 20].find(l => fx.settlerSlots(l) > colonies);   // le niveau qui donne le colon suivant
  const cur = Math.max(lvl(cap, 'RESIDENCE'), queuedLvl(cap, 'RESIDENCE'));
  const wantRes = !!target && cur < target && !(cap.buildQueue || []).some(q => q.buildingKey === 'RESIDENCE');
  const pending = (cap.settlers || 0) > 0 || (cap.recruitQueue || []).some(q => q.unitKey === 'SETTLER');
  if (!wantRes && !pending) return;
  const resCost = wantRes ? Stock.buildCost('RESIDENCE', cur + 1) : null;
  const step = stepHours(ctx);
  const foodNeed = Math.max(resCost ? resCost.food : 0, pending ? FOUND_COST.food + 500 : 0);
  const otherNeed = Math.max(resCost ? Math.max(resCost.wood, resCost.stone, resCost.iron) : 0, pending ? FOUND_COST.wood + 500 : 0);
  let key = null;
  if (foodNeed > Stock.room(bot, 'food', step)) key = 'SILO';
  else if (otherNeed > Stock.room(bot, 'wood', step)) key = 'WAREHOUSE';
  else if (wantRes) key = 'RESIDENCE';
  if (!key) return;
  // la ville qui bâtit : la capitale ; un Silo ou un Dépôt déjà au niveau 20 dans la capitale monte dans une colonie
  const levelIn = (c) => Math.max(lvl(c, key), queuedLvl(c, key));
  const city = key === 'RESIDENCE' || levelIn(cap) < 20 ? cap
    : bot.cities.filter(c => !c.isCapital && !c.isWonder && levelIn(c) < Math.min(20, lvl(c, 'MAIN_HALL'))).sort((a, b) => levelIn(a) - levelIn(b))[0];
  if (!city) return;
  const queue = city.buildQueue || [];
  if (queue.length >= MAX_QUEUE) { bump(m, 'residenceQueueFull'); return; }
  if (queue.some(q => q.buildingKey === key)) return;   // déjà en chantier
  const hall = lvl(city, 'MAIN_HALL');
  let next = levelIn(city) + 1;
  if (next > hall) {
    // le bâtiment bute sur le Bâtiment principal de la capitale
    if (!city.isCapital) return;
    key = 'MAIN_HALL'; next = Math.max(hall, queuedLvl(cap, 'MAIN_HALL')) + 1;
    if (next > 30 || queue.some(q => q.buildingKey === 'MAIN_HALL')) return;
  }
  const cost = Stock.buildCost(key, next);
  if (!Stock.fits(bot, cost, step)) return;
  if (!Stock.canPay(bot, cost)) { bump(m, key === 'RESIDENCE' ? 'residenceWaitRes' : 'storageWaitRes'); return; }
  B.left--;
  const r = await bot.post(`/api/cities/${city.id}/build`, { buildingKey: key });
  if (!r.ok) { bump(m, 'residenceRefused'); return; }
  Stock.spend(bot, city, r.data?.cost || cost);
  queue.push({ buildingKey: key, targetLevel: next, slot: r.data?.queueItem?.slot ?? null });
  city.buildQueue = queue;
  bump(m, key === 'RESIDENCE' ? 'residenceLevels' : key === 'MAIN_HALL' ? 'hallForResidence' : 'storageForResidence');
}

async function settlers(bot, ctx, B, m, cap) {
  if (B.left <= 0 || cap.isSieged) return;
  const u = settlerUse(bot, cap);
  if (u.slots <= 0 || u.used >= u.slots || u.training > 0) return;
  B.left--;
  const r = await bot.post(`/api/cities/${cap.id}/settlers`);
  if (!r.ok) { bump(m, 'settlerRefused'); return; }
  (cap.recruitQueue ||= []).push({ unitKey: 'SETTLER', count: 1, buildingKey: 'RESIDENCE' });
  bump(m, 'settlers');
}

// le point de la future colonie : libre de tout joueur, place pour la ville, assez loin des villes, la tribu la plus faible
function pickColonySite(bot, m, cap, view, fieldPower) {
  let best = null;
  for (const n of view.nodes) {
    if (!COLONY_TYPES.includes(n.resourceType) || n.cityId || someoneOn(n) || (m.bad || []).includes(n.id)) continue;
    const d = dist(n, cap);
    if (d < 5 || d > RAID_RANGE) continue;
    if (bot.cities.some(c => dist(c, n) < 6)) continue;
    if (!footprintOk(n, view)) continue;
    const dp = tribeOn(n) ? n.defenderPower : 0;
    if (dp > Math.max(fieldPower / m.ratio, 12000)) continue;   // pas un camp hors de portée
    const score = dp + d * 60;
    if (!best || score < best.score) best = { n, score };
  }
  return best?.n || null;
}

// une case libre à côté du point (pas sur le bloc 2 × 2 de la future ville) : l'armée s'y poste avant de frapper
function besideNode(node, view) {
  const block = new Set(Terrain.cityCells(node.x, node.y).map(([x, y]) => `${x},${y}`));
  const taken = (x, y) => view.nodes.some(n => n.x === x && n.y === y) || view.cities.some(c => x >= c.x && x <= c.x + 1 && y >= c.y && y <= c.y + 1);
  for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1], [2, 0], [0, 2]]) {
    const x = node.x + dx, y = node.y + dy;
    if (Math.hypot(dx, dy) > 1.5 || block.has(`${x},${y}`)) continue;
    try { if (!Terrain.inWorld(x, y) || Terrain.isBlocked(x, y)) continue; } catch (e) { continue; }
    if (!taken(x, y)) return { x, y };
  }
  return null;
}

// fondation d'une ville secondaire sur un point de ressource gardé par une tribu, comme le ferait un joueur :
// 1. l'armée la plus forte se poste à côté du camp ; 2. quand le colon, les 3 000 de chaque ressource et l'escorte sont
// prêts, elle frappe (combat immédiat au contact), libère le point, et la colonne du colon part dans le même tour : elle
// arrive avant le retour de la tribu. Un point déjà libre est fondé directement.
async function colony(bot, ctx, B, m, cap) {
  const u = settlerUse(bot, cap);
  const col = m.col;
  if (!col) {
    if (!((cap.settlers || 0) > 0 || u.training > 0) || B.left <= 1) return;
    const view = await scan(bot, ctx, B, cap, 1);
    if (!view) return;
    const field = bot.armies.filter(a => m.own.includes(a.id) && a.cityId === cap.id).reduce((t, a) => Math.max(t, powerOf(a.units)), 0);
    const garrisonPower = powerOf(garrisonOf(bot, cap)?.units);
    const n = pickColonySite(bot, m, cap, view, field + 0.7 * garrisonPower);
    if (!n) { bump(m, 'noColonySite'); return; }
    m.col = { n: n.id, x: n.x, y: n.y, ph: tribeOn(n) ? 'clear' : 'ready', s: ctx.step, f: 0 };
    return;
  }
  const armyA = col.a ? bot.armies.find(a => a.id === col.a) : null;
  const drop = (why) => { bump(m, why); (m.bad ||= []).push(col.n); if (m.bad.length > 6) m.bad.shift(); delete m.col; };
  const recallA = async () => {
    if (armyA && armyA.status === 'IDLE' && !isHome(armyA, cap) && B.left > 0) {
      B.left--;
      const r = await bot.post(`/api/army/${armyA.id}/return`);
      if (r.ok) { armyA.status = 'RETURNING'; bump(m, 'approachRecalls'); } else bump(m, 'returnRefused');
    }
    col.ph = 'clear'; delete col.a; col.s = ctx.step;
  };

  if (col.ph === 'going') {
    if (bot.cities.some(c => c.x === col.x && c.y === col.y && !c.isCapital)) {
      const city = bot.cities.find(c => c.x === col.x && c.y === col.y);
      bump(m, 'coloniesFounded');
      ctx.event('colony_founded', { bot: bot.name, faction: bot.faction, city: city.name, x: col.x, y: col.y, colonies: bot.cities.filter(c => !c.isCapital).length });
      delete m.col;
      return;
    }
    const b = bot.armies.find(a => a.id === col.b);
    if (!b || (ctx.step - col.s > 2 && b.status === 'IDLE' && isHome(b, cap)) || ctx.step - col.s > 24) {
      // le point n'était plus libre à l'arrivée (une ville, une fondation ou une tribu à côté) : le colon est revenu
      ctx.event('colony_failed', { bot: bot.name, x: col.x, y: col.y, army: b ? b.status : 'disparue', settlersBack: cap.settlers || 0 });
      drop('foundFailed');
    }
    return;
  }
  if (col.ph === 'approach' && armyA && armyA.status === 'MOVING') { if (ctx.step - col.s > 6) drop('approachStuck'); return; }
  if (B.left <= 1) return;
  const view = await scan(bot, ctx, B, cap, 0);
  if (!view || view.step !== ctx.step) return;   // pas de carte fraîche ce tour-ci
  const node = view.nodes.find(n => n.id === col.n) || null;
  if (!node || node.cityId || (node.hiddenHolders || 0) > 0 || (node.holders || []).some(h => h.playerId !== bot.playerId)) { await recallA(); drop('colonySiteTaken'); return; }
  const colonies = bot.cities.filter(c => !c.isCapital && !c.isWonder).length;
  const settlerReady = (cap.settlers || 0) >= 1 && !cap.isSieged && colonies < u.slots;

  // l'armée qui fonde : une autre que celle qui frappe, dans la capitale, avec des soldats (une escorte suffit)
  const founder = async () => {
    const founders = bot.armies.filter(x => m.own.includes(x.id) && x.cityId === cap.id && x.id !== col.a && x.status === 'IDLE' && isHome(x, cap));
    let b = founders.find(x => countOf(x.units) > 0);
    if (!b && founders.length && B.left > 2) {
      const g = (garrisonOf(bot, cap)?.units || []).filter(x => UNIT[x.unitKey]?.class !== 'SIEGE').sort((p, q) => q.count - p.count)[0];
      if (g && g.count >= 1) {
        B.left--;
        const r = await bot.post(`/api/army/${founders[0].id}/set-unit`, { unitKey: g.unitKey, count: Math.min(20, g.count) });
        if (r.ok) { founders[0].units = [{ unitKey: g.unitKey, count: r.data?.newCount || Math.min(20, g.count) }]; b = founders[0]; bump(m, 'escorts'); }
        else bump(m, 'escortRefused');
      }
    }
    return b || null;
  };
  const found = async (b) => {
    B.left--;
    const f = await bot.post(`/api/army/${b.id}/found-city`, { resourceNodeId: col.n });
    if (!f.ok) { bump(m, 'foundRefused'); col.f = (col.f || 0) + 1; col.ph = tribeOn(node) ? 'clear' : 'ready'; if (col.f >= 3) drop('colonySiteLost'); return; }
    Stock.spend(bot, cap, FOUND_COST);   // les ressources de la fondation : toutes les villes, la capitale d'abord
    cap.settlers = Math.max(0, (cap.settlers || 0) - 1);
    b.status = 'MOVING'; b.settlers = 1;
    col.ph = 'going'; col.b = b.id; col.s = ctx.step;
    bump(m, 'foundSent');
  };

  if (col.ph === 'ready') {
    if (tribeOn(node)) { col.ph = 'clear'; return; }
    if (someoneOn(node)) return;   // une de ses armées récolte encore : elle partira
    if (!settlerReady) return;
    if (!Stock.canPay(bot, FOUND_COST)) { bump(m, 'foundWaitRes'); return; }
    const b = await founder();
    if (!b) { bump(m, 'foundWaitArmy'); return; }
    if (B.left > 0) await found(b);
    return;
  }

  if (col.ph === 'clear') {
    if (!tribeOn(node)) { col.ph = 'ready'; return; }
    const a = bot.armies.filter(x => m.own.includes(x.id) && x.cityId === cap.id && x.status === 'IDLE' && isHome(x, cap) && countOf(x.units) > 0).sort((p, q) => powerOf(q.units) - powerOf(p.units))[0];
    if (!a) return;
    if (powerOf(a.units) < m.ratio * node.defenderPower) { if (ctx.step - col.s > 40) drop('colonySiteTooStrong'); return; }
    const spot = besideNode(node, view);
    if (!spot) { drop('colonySiteNoApproach'); return; }
    B.left--;
    const r = await bot.post(`/api/army/${a.id}/move`, { x: spot.x, y: spot.y });
    if (!r.ok) { bump(m, 'moveRefused'); col.f = (col.f || 0) + 1; if (col.f >= 3) drop('colonySiteLost'); return; }
    a.status = 'MOVING';
    col.a = a.id; col.ph = 'approach'; col.s = ctx.step;
    bump(m, 'approaches');
    return;
  }

  if (col.ph === 'approach') {
    if (!armyA) { col.ph = 'clear'; return; }
    const near = armyA.status === 'IDLE' && Math.hypot(armyA.x - node.x, armyA.y - node.y) <= 1.5;
    if (!near) { col.f = (col.f || 0) + 1; await recallA(); if (col.f >= 3) drop('colonySiteLost'); return; }
    if (tribeOn(node) && powerOf(armyA.units) < m.ratio * node.defenderPower) { await recallA(); return; }   // le camp s'est renforcé
    // posté à côté du camp : il ne frappe que quand tout est prêt pour la fondation
    const wait = (why) => { bump(m, why); return ctx.step - col.s > 16 ? recallA() : null; };
    if (!settlerReady) return wait('approachWaitSettler');
    if (!Stock.canPay(bot, FOUND_COST)) return wait('foundWaitRes');
    const b = await founder();
    if (!b) return wait('foundWaitArmy');
    if (B.left < (tribeOn(node) ? 3 : 1)) return;
    if (tribeOn(node)) {
      B.left--;
      const r = await bot.post(`/api/army/${armyA.id}/raid-resource`, { resourceNodeId: col.n });
      if (!r.ok) { bump(m, 'raidRefused'); col.f = (col.f || 0) + 1; await recallA(); if (col.f >= 3) drop('colonySiteLost'); return; }
      bump(m, 'raids'); bump(m, 'colonyRaids'); if (r.data?.combatResult?.attackerLosses > 0) m.hurt = 1;
      if (r.data?.success) { bump(m, 'tribeWins'); m.ratio = Math.max(1.1, m.ratio - 0.05); }
      else { bump(m, 'tribeLosses'); m.ratio = Math.min(3.5, m.ratio + 0.3); }
      if (r.data?.status !== 'HARVESTING') { col.f = (col.f || 0) + 1; await recallA(); if (col.f >= 3) drop('colonySiteLost'); return; }
      armyA.status = 'HARVESTING';
      // l'armée victorieuse tient le point : elle rentre, le point est libre jusqu'au retour de la tribu
      B.left--;
      const back = await bot.post(`/api/army/${armyA.id}/return`);
      if (!back.ok) { bump(m, 'returnRefused'); return; }
      armyA.status = 'RETURNING'; bump(m, 'holdReleases');
    } else if (someoneOn(node)) return;
    await found(b);
  }
}

// armée réduite à presque rien, dans sa ville : dissoute (ses soldats retournent à la garnison)
async function tidy(bot, ctx, B, m) {
  for (const a of bot.armies) {
    if (B.left <= 3 || !m.own.includes(a.id) || a.status !== 'IDLE') continue;
    const city = cityOf(bot, a.cityId);
    if (!isHome(a, city) || m.col?.a === a.id || m.col?.b === a.id) continue;
    const n = countOf(a.units);
    const mine = bot.armies.filter(x => m.own.includes(x.id) && x.cityId === a.cityId).length;
    // trois colonies fondées : l'armée d'escorte n'a plus d'usage, elle rentre dans la garnison (une fois)
    const done = city.isCapital && bot.cities.filter(c => !c.isCapital && !c.isWonder).length >= config.city.maxSecondaryCities && !(m.k.disbanded > 0) && a.id === m.own.filter(id => bot.armies.some(x => x.id === id && x.cityId === a.cityId)).slice(-1)[0];
    if (!done && (n === 0 || n >= 5 || mine < 2)) continue;
    if (mine < 2 || a.heroId) continue;
    B.left--;
    const r = await bot.del(`/api/army/${a.id}/disband`);
    if (r.ok) { m.own = m.own.filter(id => id !== a.id); bot.armies = bot.armies.filter(x => x.id !== a.id); bump(m, 'disbanded'); }
    else bump(m, 'disbandRefused');
  }
}

function prepare(bot) {
  if (!bot.cities?.length || !Array.isArray(bot.armies)) return null;
  const m = memOf(bot);
  m.own = m.own.filter(id => bot.armies.some(a => a.id === id));
  return m;
}

module.exports = {
  name: 'military',
  residence, heal,   // pour les tests unitaires (tests/unit/sim-bots.test.js)
  // début du tour, avant l'économie (fichier 09-military-early.cjs) : un joueur qui prépare une colonie envoie son colon et
  // monte sa Résidence avant de dépenser le reste en constructions
  async early(bot, ctx) {
    const m = prepare(bot);
    const cap = bot.capital;
    if (!m || !cap) return;
    const B = { left: 5 };
    review(bot, ctx, m);
    await colony(bot, ctx, B, m, cap);
    await residence(bot, ctx, B, m, cap);
    await settlers(bot, ctx, B, m, cap);
  },
  async act(bot, ctx) {
    const m = prepare(bot);
    if (!m) return;
    const B = { left: CALLS_PER_TURN };
    const cap = bot.capital;
    review(bot, ctx, m);
    await recalls(bot, ctx, B, m);
    // recrutement : chaque ville qui peut former des troupes (capitale ; colonie avec Grande caserne / écurie)
    for (const city of bot.cities) await recruit(bot, ctx, B, m, city);
    // armées : une armée de campagne, une seconde quand une colonie se prépare (ou une grosse garnison)
    for (const city of bot.cities) {
      if (B.left <= 0) break;
      const coloniesLeft = bot.cities.filter(c => !c.isCapital && !c.isWonder).length < config.city.maxSecondaryCities;
      const pending = city.isCapital && coloniesLeft && ((city.settlers || 0) > 0 || (city.recruitQueue || []).some(q => q.unitKey === 'SETTLER') || lvl(city, 'RESIDENCE') >= 9);
      await organise(bot, ctx, B, m, city, pending || countOf(garrisonOf(bot, city)?.units) >= 300 ? 2 : 1);
    }
    await tidy(bot, ctx, B, m);
    // missions : les armées de ce module qui attendent dans leur ville
    const exclude = new Set();
    const reserved = new Set([m.col?.a, m.col?.b].filter(Boolean));
    const keepHome = !!m.col && (m.col.ph === 'approach' || m.col.ph === 'ready');
    for (const a of bot.armies) {
      if (B.left <= 0) break;
      if (!m.own.includes(a.id) || a.status !== 'IDLE' || reserved.has(a.id)) continue;
      const city = cityOf(bot, a.cityId);
      if (!city || !isHome(a, city) || city.isSieged) continue;
      // pendant une fondation, une armée de la capitale reste à la maison pour escorter le colon
      if (keepHome && city.isCapital && bot.armies.filter(x => m.own.includes(x.id) && x.cityId === city.id && x.status === 'IDLE' && isHome(x, city) && !reserved.has(x.id)).length <= 1) continue;
      // la garnison garde un quart des soldats, le reste part avec l'armée
      const g = countOf((garrisonOf(bot, city)?.units || []).filter(u => UNIT[u.unitKey]?.class !== 'SIEGE'));
      if (g >= 10 && g > 0.3 * (g + countOf(a.units)) && B.left > 2) await fill(bot, ctx, B, m, a, city, 0.75);
      if (countOf(a.units) < 10 || (m.idle?.[a.id] || 0) > ctx.step) continue;
      const view = await scan(bot, ctx, B, city, 1);
      if (view && !(await mission(bot, ctx, B, m, a, city, view, exclude))) (m.idle ||= {})[a.id] = ctx.step + 4;   // rien à sa portée : on regardera plus tard
    }
    for (const id of Object.keys(m.idle || {})) if (m.idle[id] <= ctx.step || !m.own.includes(id)) delete m.idle[id];
    // soins
    if (cap) await heal(bot, ctx, B, m, cap);
  },
  async afterStep(ctx) {
    const total = Math.round(ctx.OPT.days * 24 / ctx.OPT.stepHours);
    if (ctx.step % 112 !== 0 && ctx.step !== total) return;
    const k = {};
    for (const b of ctx.bots) for (const [key, v] of Object.entries(b.mem.mil?.k || {})) k[key] = (k[key] || 0) + v;
    let db = {};
    try {
      const q = (sql) => ctx.prisma.$queryRawUnsafe(sql);
      db = {
        tribeBattles: (await q(`SELECT result, count(*)::int AS n FROM "BattleReport" WHERE loot->>'type' = 'TRIBE' AND "playerId" = "attackerId" GROUP BY 1`)).map(r => `${r.result} ${r.n}`).join(', '),
        colonies: Number((await q(`SELECT count(*)::int AS n FROM "City" WHERE NOT "isCapital"`))[0]?.n || 0),
        units: Number((await q(`SELECT coalesce(sum(count), 0)::int AS n FROM "ArmyUnit"`))[0]?.n || 0),
        fieldArmies: Number((await q(`SELECT count(*)::int AS n FROM "Army" WHERE NOT "isGarrison"`))[0]?.n || 0),
        harvesting: Number((await q(`SELECT count(*)::int AS n FROM "Army" WHERE status = 'HARVESTING'`))[0]?.n || 0),
        wounded: Number((await q(`SELECT coalesce(sum(count + waiting), 0)::int AS n FROM "WoundedUnit"`))[0]?.n || 0),
        // l'entretien puise dans tous les greniers d'un joueur : la famine ne vient que quand leur total est vide
        starving: Number((await q(`SELECT count(*)::int AS n FROM (SELECT "playerId" FROM "City" GROUP BY 1 HAVING sum(food) < 1) s`))[0]?.n || 0)
      };
    } catch (e) { db = { error: e.message }; }
    ctx.event('military_summary', { step: ctx.step, ...db, counters: k });
    ctx.say(`militaire : ${JSON.stringify({ ...db, recruited: k.recruited || 0, raids: k.raids || 0, collects: k.collects || 0, colonies: k.coloniesFounded || 0 })}`);
  }
};
