// Simulation longue — économie : constructions (plan par étapes), champs, stockage, recherche à l'Académie.
// Chaque joueur suit le même plan avec un peu de hasard ; il construit la première étape qu'il peut payer.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { buildingsData } = require(path.join(ROOT, 'src/config/gamedata'));
const T = require(path.join(ROOT, 'src/utils/techEffects'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));

const FIELDS = config.city.fieldSlots;   // { LUMBER: [101..], QUARRY: [...], IRON_MINE: [...], FARM: [...] }
const MAX_QUEUE = config.build.maxRunning + config.build.maxQueued;
const def = (k) => buildingsData.find(b => b.key === k);
const cost = (k, lvl) => { const base = def(k)?.costL1 || { wood: 100, stone: 100, iron: 80, food: 50 }; const m = Math.pow(config.build.costMultiplierBase, lvl - 1); return { wood: Math.floor(base.wood * m), stone: Math.floor(base.stone * m), iron: Math.floor(base.iron * m), food: Math.floor(base.food * m) }; };
const RES = ['wood', 'stone', 'iron', 'food'];
const FACTION_BUILDING = { ROME: 'ROMAN_THERMAE', GAUL: 'GALLIC_BREWERY', GREEK: 'GREEK_TEMPLE', EGYPT: 'EGYPTIAN_IRRIGATION', HUN: 'HUN_WAR_TENT', SULTAN: 'SULTAN_DESERT_OUTPOST' };

// plan : [clé, niveau visé] ; FIELDS = tous les champs à ce niveau ; dans l'ordre, par étapes
function planFor(faction, capital) {
  const P = [
    ['FIELDS', 2], ['MAIN_HALL', 3], ['WAREHOUSE', 2], ['SILO', 2], ['RALLY_POINT', 1], ['FIELDS', 3], ['BARRACKS', 3], ['ACADEMY', 1], ['HERO_MANSION', 1],
    ['MAIN_HALL', 5], ['FIELDS', 5], ['WAREHOUSE', 5], ['SILO', 5], ['HIDEOUT', 3], ['WALL', 3], ['EMBASSY', 3], ['WATCHTOWER', 5], ['HEALING_TENT', 3], ['ACADEMY', 5], ['FORGE', 3],
    ['MARKET', 3], ['MAIN_HALL', 8], ['FIELDS', 7], ['STABLE', 3], ['WAREHOUSE', 8], ['SILO', 8], ['BARRACKS', 7], ['RALLY_POINT', 5], ['RESIDENCE', 5], ['ACADEMY', 10],
    ['MAIN_HALL', 10], ['FIELDS', 10], ['WORKSHOP', 3], ['WALL', 8], ['TREASURE_CHAMBER', 5], ['MILL', 5], ['SAWMILL', 3], ['STONEMASON', 3], ['FOUNDRY', 3], ['WAREHOUSE', 12], ['SILO', 12],
    [FACTION_BUILDING[faction], 5], ['MAIN_HALL', 13], ['FIELDS', 12], ['BARRACKS', 12], ['STABLE', 10], ['MOAT', 5], ['MARKET', 10], ['HERO_MANSION', 10], ['RALLY_POINT', 10], ['EMBASSY', 10],
    ['BAKERY', 5], ['MAIN_HALL', 16], ['FIELDS', 15], ['GREAT_WAREHOUSE', 5], ['GREAT_SILO', 5], ['WAREHOUSE', 16], ['SILO', 16], ['ACADEMY', 15], ['FORGE', 12], ['WORKSHOP', 10], ['WALL', 14],
    ['TRADE_OFFICE', 5], [FACTION_BUILDING[faction], 12], ['MAIN_HALL', 20], ['FIELDS', 18], ['BARRACKS', 20], ['STABLE', 16], ['RALLY_POINT', 20], ['WAREHOUSE', 20], ['SILO', 20], ['ACADEMY', 20],
    ['GREAT_BARRACKS', 5], ['GREAT_STABLE', 5], ['WALL', 20], ['MOAT', 15], ['FIELDS', 20], ['MAIN_HALL', 25], ['TREASURE_CHAMBER', 15], [FACTION_BUILDING[faction], 20], ['MAIN_HALL', 30]
  ];
  // 19 emplacements autour du Bâtiment principal : chaque ville choisit ses bâtiments (la capitale garde le militaire,
  // une colonie l'économie et les grandes casernes) ; réservés à la capitale / interdits dans la capitale (données)
  const skip = capital ? CAPITAL_SKIP : COLONY_SKIP;
  return P.filter(([k]) => k === 'FIELDS' || k === 'MAIN_HALL' || (!skip.has(k) && (capital ? !fx.notInCapital(k) : !fx.capitalOnly(k))))
    .map(([k, l]) => [k, !capital && k === 'MAIN_HALL' ? Math.min(l, config.city.secondaryMainHallMaxLevel || 20) : l]);
}
const CAPITAL_SKIP = new Set(['SAWMILL', 'STONEMASON', 'FOUNDRY', 'BAKERY', 'GREAT_WAREHOUSE', 'GREAT_SILO', 'TRADE_OFFICE', 'MOAT']);
const COLONY_SKIP = new Set(['GREAT_WAREHOUSE', 'GREAT_SILO']);
const freeRingSlots = (city) => { const used = new Set([...(city.buildings || []).map(b => b.slot), ...(city.buildQueue || []).map(q => q.slot)]); let n = 0; for (let s = 1; s <= config.city.maxSlot; s++) if (!used.has(s)) n++; return n; };

const levelOf = (city, key, slot = null) => { const q = (city.buildQueue || []).filter(x => x.buildingKey === key && (slot === null || x.slot === slot)); const b = (city.buildings || []).filter(x => x.key === key && (slot === null || x.slot === slot)); const top = Math.max(0, ...b.map(x => x.level)); return Math.max(top, ...q.map(x => x.targetLevel)); };
const prereqOk = (city, key, capital) => (def(key)?.prereq || []).every(p => Math.max(levelOf(city, p.key), capital && p.key !== 'MAIN_HALL' ? levelOf(capital, p.key) : 0) >= p.level);
const affordable = (city, c, margin = 1) => RES.every(r => (city[r] || 0) >= (c[r] || 0) * margin);

// le prochain chantier du plan que la ville peut lancer
function nextBuild(bot, city) {
  const capital = bot.capital;
  // le serveur compare au Bâtiment principal déjà bâti (pas à celui de la file)
  const hall = Math.max(1, ...(city.buildings || []).filter(b => b.key === 'MAIN_HALL').map(b => b.level));
  const plan = planFor(bot.faction, city.isCapital);
  const storageNeed = (c) => RES.some(r => (c[r] || 0) > (r === 'food' ? city.maxFoodStorage : city.maxStorage) * 0.95);
  let blockedByStorage = null;
  for (const [key, target] of plan) {
    if (!key) continue;
    if (key === 'FIELDS') {
      // le champ le plus bas : la nourriture d'abord si le bilan est négatif
      const food = city.foodBalance?.net ?? city.foodBalance?.balance ?? 1;
      const order = food < 0 ? ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE'] : ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'];
      let best = null;
      for (const k of order) for (const slot of FIELDS[k]) { const l = levelOf(city, k, slot); if (l < target && l + 1 <= hall && (!best || l < best.l)) best = { k, slot, l }; }
      if (!best) continue;
      const c = cost(best.k, best.l + 1);
      if (storageNeed(c)) { blockedByStorage ||= c; continue; }
      if (affordable(city, c)) return { buildingKey: best.k, slot: best.slot };
      continue;
    }
    if (!def(key) || (def(key).faction && def(key).faction !== bot.faction)) continue;
    const l = levelOf(city, key);
    if (l >= target || l >= (def(key).maxLevel || 20)) continue;
    if (key !== 'MAIN_HALL' && l + 1 > hall) continue;
    if (l === 0 && (!freeRingSlots(city) || !prereqOk(city, key, city.isCapital ? null : capital))) continue;
    const c = cost(key, l + 1);
    if (storageNeed(c)) { blockedByStorage ||= c; continue; }
    if (affordable(city, c)) return { buildingKey: key };
  }
  // un chantier attend un stockage plus grand : entrepôt ou grenier
  if (blockedByStorage) {
    const k = (blockedByStorage.food || 0) > city.maxFoodStorage * 0.95 ? 'SILO' : 'WAREHOUSE';
    const l = levelOf(city, k);
    if (l < 20 && l + 1 <= hall && affordable(city, cost(k, l + 1))) return { buildingKey: k };
    if (levelOf(city, 'MAIN_HALL') < (city.isCapital ? 30 : 20) && affordable(city, cost('MAIN_HALL', levelOf(city, 'MAIN_HALL') + 1))) return { buildingKey: 'MAIN_HALL' };
  }
  return null;
}

async function research(bot, ctx) {
  const city = bot.capital;
  if (!city || !levelOf(city, 'ACADEMY')) return;
  if ((bot.mem.researchCheck || 0) > ctx.step) return;
  const r = await bot.get(`/api/research?cityId=${city.id}`);
  if (!r.ok) return;
  if ((r.data.queue || []).length >= (T.RULES.maxQueue || 2)) { bot.mem.researchCheck = ctx.step + 2; return; }
  const techs = (r.data.city?.technologies || []).filter(t => !t.blocker && t.nextLevel).map(t => ({ ...t, branch: T.techOf(t.key)?.branch }));
  if (!techs.length) { bot.mem.researchCheck = ctx.step + 6; return; }
  // l'économie d'abord, puis le militaire ; la moins avancée
  const pref = (t) => (t.branch === 'ECONOMY' ? 0 : t.branch === 'MILITARY' ? 1 : 2) * 100 + (t.level || 0);
  techs.sort((a, b) => pref(a) - pref(b));
  for (const t of techs.slice(0, 3)) {
    if (t.cost && !affordable(city, t.cost, 1.3)) continue;   // garder de quoi construire
    const s = await bot.post('/api/research/start', { cityId: city.id, techKey: t.key });
    if (s.ok) { RES.forEach(k => { city[k] -= s.data.cost?.[k] || 0; }); return; }
  }
}

module.exports = {
  name: 'economy',
  async act(bot, ctx) {
    for (const city of bot.cities) {
      let free = MAX_QUEUE - (city.buildQueue || []).length;
      let tries = 0;
      while (free > 0 && tries < 4) {
        tries++;
        const b = nextBuild(bot, city);
        if (!b) break;
        const r = await bot.post(`/api/cities/${city.id}/build`, b);
        if (!r.ok) break;
        free--;
        RES.forEach(k => { city[k] -= r.data.cost?.[k] || 0; });
        (city.buildQueue ||= []).push({ buildingKey: b.buildingKey, slot: r.data.queueItem?.slot ?? b.slot ?? null, targetLevel: r.data.queueItem?.targetLevel || 1 });
      }
    }
    await research(bot, ctx);
  }
};
