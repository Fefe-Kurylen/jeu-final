// Simulation longue — économie : constructions (plan par étapes), champs, stockage, recherche à l'Académie.
// Chaque joueur suit le même plan avec un peu de hasard ; il construit la première étape qu'il peut payer.
// Stock partagé (décision du 30 octobre 2026) : un chantier se paie sur la somme des villes du joueur (../stock.cjs) ;
// chaque ville garde son propre stockage, il faut donc assez de place dans toutes les villes réunies pour un gros prix.
// Le Mur se bâtit sur l'enceinte, à sa place fixe (config.city.wallSlot), comme le client : il ne prend pas d'emplacement
// de l'anneau. Revue des bâtiments (décisions du 31 octobre 2026) : anneau de 18 emplacements dans la capitale, 12 dans
// une colonie (calculations.ringSlotsOf) ; Bâtiment principal 20 partout ; Mur d'une colonie 15 (fx.maxLevelIn) ; Marché et
// Comptoir de commerce dans la capitale seulement (drapeaux des données).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { buildingsData } = require(path.join(ROOT, 'src/config/gamedata'));
const T = require(path.join(ROOT, 'src/utils/techEffects'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const { ringSlotsOf } = require(path.join(ROOT, 'src/utils/calculations'));
const Stock = require('../stock.cjs');

const FIELDS = config.city.fieldSlots;   // { LUMBER: [101..], QUARRY: [...], IRON_MINE: [...], FARM: [...] }
const MAX_QUEUE = config.build.maxRunning + config.build.maxQueued;
const def = (k) => buildingsData.find(b => b.key === k);
const FACTION_BUILDING = { ROME: 'ROMAN_THERMAE', GAUL: 'GALLIC_BREWERY', GREEK: 'GREEK_TEMPLE', EGYPT: 'EGYPTIAN_IRRIGATION', HUN: 'HUN_WAR_TENT', SULTAN: 'SULTAN_DESERT_OUTPOST' };
// niveau qui ouvre l'élite d'une Grande caserne / Grande écurie (données) : dans une colonie, le palier des recrues vient de
// SON bâtiment, jamais de la Caserne de la capitale (décision du 30 octobre 2026)
const ELITE_TIER = (k) => def(k)?.effects?.unlockEliteTier || 15;
const stepHours = (ctx) => Math.max(1, Number(ctx.OPT?.stepHours) || 1);

// plan : [clé, niveau visé] ; FIELDS = tous les champs à ce niveau ; dans l'ordre, par étapes. Chaque ville en garde ce
// que les données lui permettent (effects.capitalOnly / effects.notInCapital) : la capitale le militaire et les
// bâtiments dont l'effet vaut pour tout le joueur, Marché et Comptoir compris (ses 18 emplacements, le Mur est sur
// l'enceinte), une colonie l'économie, les Grands dépôt et silo et les Grandes caserne et écurie (ses 12 emplacements).
// Tente de soins : 5 pour les Thermes, puis des lits pour les soins payants ; Chambre au Trésor : 5 pour les Grands dépôt
// et silo, puis jusqu'à 20 (l'or paie aussi les unités d'élite) ; Écurie 20 pour la Grande écurie des colonies ; Marché 10
// pour le Comptoir (plus de marchands et une charge plus grande). Un niveau visé au-delà du maximum de la ville (Mur d'une
// colonie) s'arrête à ce maximum.
function planFor(faction, capital) {
  const P = [
    ['FIELDS', 2], ['MAIN_HALL', 3], ['WAREHOUSE', 2], ['SILO', 2], ['RALLY_POINT', 1], ['FIELDS', 3], ['BARRACKS', 3], ['ACADEMY', 1], ['HERO_MANSION', 1],
    ['MAIN_HALL', 5], ['FIELDS', 5], ['WAREHOUSE', 5], ['SILO', 5], ['HIDEOUT', 3], ['WALL', 3], ['EMBASSY', 3], ['WATCHTOWER', 5], ['HEALING_TENT', 5], ['ACADEMY', 5], ['FORGE', 3], ['MILL', 5],
    ['MARKET', 3], ['MAIN_HALL', 8], ['FIELDS', 7], ['STABLE', 3], ['WAREHOUSE', 8], ['SILO', 8], ['BARRACKS', 7], ['RALLY_POINT', 5], ['RESIDENCE', 5], ['ACADEMY', 10],
    ['MAIN_HALL', 10], ['FIELDS', 10], ['WORKSHOP', 3], ['WALL', 8], ['TREASURE_CHAMBER', 5], ['HEALING_TENT', 10], ['SAWMILL', 3], ['STONEMASON', 3], ['FOUNDRY', 3], ['WAREHOUSE', 12], ['SILO', 12],
    [FACTION_BUILDING[faction], 5], ['MAIN_HALL', 13], ['FIELDS', 12], ['BARRACKS', 12], ['STABLE', 10], ['MARKET', 10], ['HERO_MANSION', 10], ['RALLY_POINT', 10], ['EMBASSY', 10], ['GREAT_WAREHOUSE', 5], ['GREAT_SILO', 5],
    ['BAKERY', 5], ['SAWMILL', 5], ['STONEMASON', 5], ['FOUNDRY', 5], ['MAIN_HALL', 16], ['FIELDS', 15], ['WAREHOUSE', 16], ['SILO', 16], ['ACADEMY', 15], ['FORGE', 12], ['WORKSHOP', 10], ['WALL', 14], ['HEALING_TENT', 15],
    ['TRADE_OFFICE', 5], [FACTION_BUILDING[faction], 12], ['MAIN_HALL', 20], ['FIELDS', 18], ['BARRACKS', 20], ['STABLE', 16], ['RALLY_POINT', 20], ['WAREHOUSE', 20], ['SILO', 20], ['ACADEMY', 20], ['GREAT_WAREHOUSE', 12], ['GREAT_SILO', 10],
    ['GREAT_BARRACKS', 5], ['STABLE', 20], ['GREAT_STABLE', 5], ['WALL', 20], ['FIELDS', 20], ['TREASURE_CHAMBER', 15], ['HEALING_TENT', 20], [FACTION_BUILDING[faction], 20], ['GREAT_WAREHOUSE', 20], ['GREAT_SILO', 20],
    ['GREAT_BARRACKS', ELITE_TIER('GREAT_BARRACKS')], ['GREAT_STABLE', ELITE_TIER('GREAT_STABLE')], ['TREASURE_CHAMBER', 20], ['MARKET', 20], ['TRADE_OFFICE', 15]
  ];
  return P.filter(([k]) => k === 'FIELDS' || (capital ? !fx.notInCapital(k) : !fx.capitalOnly(k)))
    .map(([k, l]) => [k, k === 'FIELDS' ? l : Math.min(l, fx.maxLevelIn(k, capital))]);
}
// le Bâtiment principal (emplacement 0), les champs (101-118) et le Mur (enceinte) ne prennent pas d'emplacement de l'anneau
const needsRingSlot = (key) => key !== 'MAIN_HALL' && key !== 'WALL' && !FIELDS[key];
// emplacements libres de l'anneau de la ville : 1 à 18 dans la capitale, 1 à 12 dans une colonie (comme routes/cities.js)
const freeRingSlots = (city) => { const used = new Set([...(city.buildings || []).map(b => b.slot), ...(city.buildQueue || []).map(q => q.slot)]); let n = 0; for (let s = 1; s <= ringSlotsOf(city); s++) if (!used.has(s)) n++; return n; };

const levelOf = (city, key, slot = null) => { const q = (city.buildQueue || []).filter(x => x.buildingKey === key && (slot === null || x.slot === slot)); const b = (city.buildings || []).filter(x => x.key === key && (slot === null || x.slot === slot)); const top = Math.max(0, ...b.map(x => x.level)); return Math.max(top, ...q.map(x => x.targetLevel)); };
const builtLevel = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
// prérequis comme le serveur : bâtiments déjà bâtis ; dans une colonie, un prérequis « capitale seulement » se lit dans la capitale
const prereqOk = (city, key, capital) => (def(key)?.prereq || []).every(p => Math.max(builtLevel(city, p.key), capital && fx.capitalOnly(p.key) ? builtLevel(capital, p.key) : 0) >= p.level);

// stockage quand un prix ne tient pas dans ce que le joueur peut avoir en main : Silo ou Dépôt de la ville, puis dans une
// colonie le Grand silo ou le Grand dépôt, sinon le Bâtiment principal qui plafonne tout le reste
function storageBuild(bot, city, blocked, hall, ctx) {
  const food = (blocked.food || 0) > Stock.room(bot, 'food', stepHours(ctx));
  const keys = food ? ['SILO', 'GREAT_SILO'] : ['WAREHOUSE', 'GREAT_WAREHOUSE'];
  for (const k of keys.filter(x => city.isCapital ? !fx.notInCapital(x) : !fx.capitalOnly(x))) {
    const l = levelOf(city, k);
    if (l >= fx.maxLevelIn(k, city.isCapital) || l + 1 > hall) continue;
    if (l === 0 && (!freeRingSlots(city) || !prereqOk(city, k, city.isCapital ? null : bot.capital))) continue;
    if ((city.buildQueue || []).some(q => q.buildingKey === k)) return null;   // déjà en chantier : on attend
    if (Stock.canPay(bot, Stock.buildCost(k, l + 1))) return { buildingKey: k };
    return null;
  }
  const mh = levelOf(city, 'MAIN_HALL');
  if (mh < fx.maxLevelIn('MAIN_HALL', city.isCapital) && Stock.canPay(bot, Stock.buildCost('MAIN_HALL', mh + 1))) return { buildingKey: 'MAIN_HALL' };
  return null;
}

// le prochain chantier du plan que la ville peut lancer
function nextBuild(bot, city, ctx) {
  const capital = bot.capital;
  // le serveur compare au Bâtiment principal déjà bâti (pas à celui de la file)
  const hall = Math.max(1, builtLevel(city, 'MAIN_HALL'));
  const plan = planFor(bot.faction, city.isCapital);
  const tooBig = (c) => !Stock.fits(bot, c, stepHours(ctx));
  let blockedByStorage = null;
  for (const [key, target] of plan) {
    if (!key) continue;
    if (key === 'FIELDS') {
      // le champ le plus bas : la nourriture d'abord si le bilan du joueur est négatif (l'entretien puise dans tous ses greniers)
      const food = Stock.foodBalance(bot)?.net ?? city.foodBalance?.net ?? 1;
      const order = food < 0 ? ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE'] : ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'];
      let best = null;
      for (const k of order) for (const slot of FIELDS[k]) { const l = levelOf(city, k, slot); if (l < target && l + 1 <= hall && (!best || l < best.l)) best = { k, slot, l }; }
      if (!best) continue;
      const c = Stock.buildCost(best.k, best.l + 1);
      if (tooBig(c)) { blockedByStorage ||= c; continue; }
      if (Stock.canPay(bot, c)) return { buildingKey: best.k, slot: best.slot };
      continue;
    }
    if (!def(key) || (def(key).faction && def(key).faction !== bot.faction)) continue;
    const l = levelOf(city, key);
    if (l >= target || l >= fx.maxLevelIn(key, city.isCapital)) continue;
    if (key !== 'MAIN_HALL' && l + 1 > hall) continue;
    if (l === 0 && ((needsRingSlot(key) && !freeRingSlots(city)) || !prereqOk(city, key, city.isCapital ? null : capital))) continue;
    const c = Stock.buildCost(key, l + 1);
    if (tooBig(c)) { blockedByStorage ||= c; continue; }
    if (Stock.canPay(bot, c)) return key === 'WALL' ? { buildingKey: key, slot: config.city.wallSlot } : { buildingKey: key };
  }
  // un chantier attend un stockage plus grand
  return blockedByStorage ? storageBuild(bot, city, blockedByStorage, hall, ctx) : null;
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
    if (t.cost && !Stock.canPay(bot, t.cost, { margin: 1.3 })) continue;   // garder de quoi construire
    const s = await bot.post('/api/research/start', { cityId: city.id, techKey: t.key });
    if (s.ok) { Stock.spend(bot, city, s.data.cost); return; }
  }
}

module.exports = {
  name: 'economy',
  planFor, nextBuild,   // pour les tests unitaires (tests/unit/sim-bots.test.js)
  async act(bot, ctx) {
    // chaque ville à son tour, un chantier à la fois : la capitale ne vide pas seule le stock commun
    const free = new Map(bot.cities.map(c => [c.id, MAX_QUEUE - (c.buildQueue || []).length]));
    for (let pass = 0; pass < MAX_QUEUE; pass++) {
      let started = false;
      for (const city of bot.cities) {
        if (!(free.get(city.id) > 0)) continue;
        const b = nextBuild(bot, city, ctx);
        const r = b ? await bot.post(`/api/cities/${city.id}/build`, b) : null;
        if (!r?.ok) { free.set(city.id, 0); continue; }
        free.set(city.id, free.get(city.id) - 1);
        started = true;
        Stock.spend(bot, city, r.data.cost);
        (city.buildQueue ||= []).push({ buildingKey: b.buildingKey, slot: r.data.queueItem?.slot ?? b.slot ?? null, targetLevel: r.data.queueItem?.targetLevel || 1 });
      }
      if (!started) break;
    }
    await research(bot, ctx);
  }
};
