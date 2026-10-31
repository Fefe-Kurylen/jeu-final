// Simulation longue — héros : fiche (création s'il manque, nom choisi), points de caractéristique, talents (une voie par
// joueur, parfois une réorientation : la première gratuite, la suivante payée en or), équipement (le meilleur objet de
// chaque emplacement, tri du sac), place du héros (il mène l'armée principale de la capitale, rejoint la garnison quand
// la ville est assiégée, quitte une armée réduite à presque rien), expéditions avec l'armée qu'il mène, résurrection au
// Domus quand il est tombé.
// Lectures : bot.me (GET /api/player/me : héros avec ses objets, expéditions ouvertes) et bot.armies (GET /api/army),
// déjà chargés au début du tour ; aucune lecture en plus sauf le panneau du Domus quand le héros est tombé.
// Avec le module militaire (30-military.cjs), l'armée principale est la sienne (bot.mem.mil.own) : ce module passe avant
// lui dans le tour (fichier 25) et lui laisse l'armée la plupart du temps (une expédition tous les 2 jours au plus, plus
// souvent quand le module militaire n'a rien trouvé à faire). Sans lui, ce module forme sa propre armée d'escorte.
// Un autre module qui a besoin du héros où il est (une attaque qui part, une défense) met bot.mem.heroHold = <pas> :
// jusque-là ce module ne le déplace pas et ne l'envoie pas en expédition. Un héros qui mène une armée de campagne en
// état (même choisie par un autre module) y reste.
// Expéditions : le jeu en crée environ une par heure et par joueur actif (une chance de 30/3600 à chaque tick de 30 s,
// src/game/processors/expeditionProcessor.js generateNewExpeditions, sans tenir compte des heures écoulées). La
// simulation joue un seul tick par pas de 6 h : sans rattrapage il en apparaîtrait une par mois. afterStep rejoue donc
// cette étape du tick autant de fois que le vrai serveur l'aurait jouée pendant le pas (SIM_HERO_EXPEDITIONS=0 pour ne
// pas le faire ; rien n'est fait si la fonction du jeu prend un jour les heures écoulées en paramètre).
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { itemsData, unitsData, buildingsData } = require(path.join(ROOT, 'src/config/gamedata'));
const HE = require(path.join(ROOT, 'src/utils/heroEffects'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const Stock = require('../stock.cjs');   // résurrection et Domus : payés sur toutes les villes du joueur, la capitale d'abord
const { spareGold } = require('./30-military.cjs');   // l'or au-dessus de ce que le joueur garde pour l'élite
let nameProblem = () => null;
try { nameProblem = require(path.join(ROOT, 'src/utils/nameFilter')).nameProblem; } catch (e) { /* filtre absent : le serveur jugera */ }

const RES = ['wood', 'stone', 'iron', 'food'];
const CALLS_PER_TURN = 6;
const C = config.combat;
const STAT_CAP = Math.round(C.heroBonusMax / C.heroBonusPerPoint);   // 50 points (base comprise) pour le plafond de +5 %
const FIELD = { attack: 'atkPoints', defense: 'defPoints', speed: 'spdPoints', logistics: 'logPoints' };
const BODY = { attack: 'atk', defense: 'def', speed: 'spd', logistics: 'log' };
const ITEM = new Map(itemsData.map(i => [i.key, i]));
const SLOTS = [...new Set(itemsData.map(i => i.slot))];
const UNIT = Object.fromEntries(unitsData.map(u => [u.key, u]));
const EXP_DIV = config.expedition?.powerDivisor || 7;
const EXP_WIN = 0.7;          // expeditionProcessor : gagnée quand puissance / diviseur > 0,7 × puissance ennemie
const EXP_MARGIN = 1.1;       // une petite marge : le joueur ne part pas à la limite
const EXP_GAP = 8;            // pas entre deux expéditions de l'armée principale (2 jours) quand le militaire s'en sert
const EXP_GAP_IDLE = 2;       // ... quand le module militaire n'avait rien à lui faire faire
const LEAD_MIN = 15;          // soldats pour que le héros prenne la tête d'une armée
const WEAK = 8;               // moins : le héros la quitte
const BAG_KEEP = 6;           // objets gardés dans le sac avant d'en jeter
const SUMMARY_EVERY = 112;    // pas (4 semaines)
const REVIVE_COST = config.hero?.reviveCostPerLevel || { wood: 250, stone: 250, iron: 250, food: 150 };
const DOMUS = buildingsData.find(b => b.key === 'HERO_MANSION');

// voies : caractéristiques dans l'ordre (chacune jusqu'au plafond), poids des objets, talents dans l'ordre
const BUILDS = {
  c: {
    stats: ['attack', 'defense', 'logistics', 'speed'], w: { attack: 3, defense: 1.5, logistics: 1, speed: 1 },
    talents: [['c_assault', 5], ['c_plunder', 3], ['c_siege', 3], ['c_veteran', 3], ['c_warlord', 1], ['g_bulwark', 5], ['g_medic', 3], ['g_endurance', 3], ['g_walls', 3], ['g_last_stand', 1]]
  },
  g: {
    stats: ['defense', 'attack', 'logistics', 'speed'], w: { defense: 3, attack: 1.5, logistics: 1, speed: 1 },
    talents: [['g_bulwark', 5], ['g_medic', 3], ['g_walls', 3], ['g_endurance', 3], ['g_last_stand', 1], ['c_assault', 5], ['c_plunder', 3], ['c_siege', 3], ['c_veteran', 3], ['c_warlord', 1]]
  },
  i: {
    stats: ['logistics', 'speed', 'attack', 'defense'], w: { logistics: 3, speed: 2, attack: 1.2, defense: 1 },
    talents: [['i_quartermaster', 5], ['i_explorer', 3], ['i_pathfinder', 3], ['i_treasure', 3], ['i_grand_steward', 1], ['c_assault', 5], ['c_plunder', 3], ['c_siege', 3], ['c_veteran', 3], ['c_warlord', 1]]
  }
};
const FACTION_BUILD = { ROME: ['c', 'g'], GREEK: ['g', 'c'], GAUL: ['g', 'i'], EGYPT: ['i', 'g'], HUN: ['c', 'i'], SULTAN: ['c', 'i'] };
const HERO_NAMES = {
  ROME: ['Scipio', 'Agricola', 'Germanicus', 'Aetius', 'Corbulo'], GAUL: ['Brennos', 'Catuvolcos', 'Lugotorix', 'Cingetos', 'Segovesos'],
  GREEK: ['Leonidas', 'Brasidas', 'Xenophon', 'Epaminondas', 'Iphicrate'], EGYPT: ['Ramses', 'Thoutmosis', 'Horemheb', 'Kamose', 'Sekenenre'],
  HUN: ['Balamber', 'Rugila', 'Edeko', 'Onegesius', 'Ernak'], SULTAN: ['Shirkuh', 'Qutuz', 'Zengi', 'Alp Arslan', 'Tughril']
};

// ---------- utilitaires ----------
const lvl = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const countOf = (units) => (units || []).reduce((t, u) => t + (u.count || 0), 0);
const isHome = (a, city) => !!city && a.x === city.x && a.y === city.y;
const cityOf = (bot, id) => bot.cities.find(c => c.id === id) || null;
const atHome = (bot, a) => !!a && a.status === 'IDLE' && !a.claimedAt && isHome(a, cityOf(bot, a.cityId));
const garrisonOf = (bot, city) => bot.armies.find(a => a.isGarrison && a.cityId === city.id) || null;
const soldiers = (a) => countOf((a?.units || []).filter(u => UNIT[u.unitKey]?.class !== 'SIEGE'));
const statsOf = (item) => item.stats || ITEM.get(item.itemKey)?.stats || {};
const valueOf = (item, w) => Object.entries(statsOf(item)).reduce((t, [k, v]) => t + (Number(v) || 0) * (w[k] ?? 0.5), 0);
const reviveCost = (hero) => Object.fromEntries(RES.map(r => [r, (REVIVE_COST[r] || 0) * Math.max(1, hero.level || 1)]));
const bump = (m, k, n = 1) => { m.k[k] = (m.k[k] || 0) + n; };
const fail = (m, r, k) => { bump(m, k); if (r && r.status >= 500) bump(m, 'serverErrors'); };
let MIL_ON = null;
const militaryOn = (ctx) => (MIL_ON ??= ctx.OPT.modules ? ctx.OPT.modules.includes('military') : fs.existsSync(path.join(__dirname, '30-military.cjs')));

// état du joueur (mem : identifiants et compteurs seulement)
function memOf(bot, ctx) {
  const m = (bot.mem.hero ||= {});
  m.k ||= {};
  if (!m.b) { const pref = FACTION_BUILD[bot.faction] || ['c', 'g']; m.b = ctx.rand() < 0.7 ? pref[0] : ctx.rand() < 0.6 ? pref[1] : 'i'; }
  if (m.sw === undefined) m.sw = (bot.name.length + (bot.turn || 0)) % 2;   // 1 : retire l'ancien objet avant de mettre le nouveau
  return m;
}

// ---------- fiche : création (si le héros manque), nom ----------
async function identity(bot, ctx, B, m, cap) {
  let hero = bot.me?.hero || null;
  const domus = lvl(cap, 'HERO_MANSION');
  if (!hero) {
    // un héros est créé avec le compte et à l'entrée dans un nouveau monde : ce cas ne devrait pas arriver
    if (!domus || B.left <= 0 || (m.cw || 0) > ctx.step) return null;
    m.cw = ctx.step + 8;
    const name = heroName(bot, ctx);
    B.left--;
    const r = await bot.post('/api/hero/create', { name });
    if (!r.ok) { fail(m, r, 'createRefused'); return null; }
    bump(m, 'created');
    ctx.event('hero_created', { bot: bot.name, name });
    hero = { ...r.data.hero, items: [] };
    if (bot.me) bot.me.hero = hero;
    return hero;
  }
  // une fois le Domus bâti, la plupart des joueurs donnent un nom à leur héros (une fois par monde)
  if (!m.rn && domus >= 1 && B.left > 2) {
    m.rn = 1;
    if (ctx.rand() < 0.6) {
      const name = heroName(bot, ctx);
      if (name && name !== hero.name) {
        B.left--;
        const r = await bot.post('/api/hero/rename', { name });
        if (r.ok) { hero.name = name; bump(m, 'renamed'); } else fail(m, r, 'renameRefused');
      }
    }
  }
  return hero;
}
function heroName(bot, ctx) {
  const list = HERO_NAMES[bot.faction] || HERO_NAMES.ROME;
  for (let i = 0; i < 3; i++) { const n = ctx.pick(list); if (n.length >= 2 && n.length <= 20 && !nameProblem(n)) return n; }
  return null;
}

// ---------- suivi : nouveau monde, niveaux, chute, retour ----------
function track(bot, ctx, m, hero) {
  if (m.hid !== hero.id) {
    if (m.hid) { bump(m, 'newWorldHeroes'); ctx.event('hero_new_world', { bot: bot.name, level: hero.level }); }
    m.hid = hero.id; m.lv = hero.level; delete m.ne; delete m.rn; delete m.rs; delete m.rs2; delete m.a; delete m.fd; delete m.rv; delete m.cw;
  }
  if (hero.level > (m.lv || 1)) {
    bump(m, 'levels', hero.level - (m.lv || 1));
    for (const mark of [5, 10, 15, 20, 25, 30]) if ((m.lv || 1) < mark && hero.level >= mark) ctx.event('hero_level', { bot: bot.name, faction: bot.faction, level: mark, build: m.b, items: (hero.items || []).filter(i => i.slot !== 'inventory').length });
    m.lv = hero.level;
  }
  if (hero.diedAt) {
    const at = Date.parse(hero.diedAt);
    if (m.fd !== at) { m.fd = at; bump(m, 'deaths'); ctx.event('hero_fallen', { bot: bot.name, level: hero.level }); }
  } else if (m.rv) {
    delete m.rv; bump(m, 'revived');
    ctx.event('hero_revived', { bot: bot.name, level: hero.level });
  }
}

// ---------- résurrection au Domus ----------
async function revive(bot, ctx, B, m, hero, cap) {
  if (hero.reviveEndsAt) { m.rv = 1; return; }
  const domus = lvl(cap, 'HERO_MANSION');
  if (!domus) { await buildDomus(bot, ctx, B, m, cap); return; }
  const cost = reviveCost(hero);
  if (!Stock.canPay(bot, cost)) { bump(m, 'reviveWaitRes'); return; }
  if (B.left < 2) return;
  // le panneau du Domus : état, coût et durée
  B.left--;
  const v = await bot.get('/api/hero');
  if (!v.ok || !v.data) { fail(m, v, 'heroReadFailed'); return; }
  if (v.data.state !== 'FALLEN') { if (v.data.state === 'REVIVING') m.rv = 1; return; }
  const c = v.data.revive?.cost || cost;
  if (!Stock.canPay(bot, c)) { bump(m, 'reviveWaitRes'); return; }
  B.left--;
  const r = await bot.post('/api/hero/revive');
  if (!r.ok) { fail(m, r, 'reviveRefused'); return; }
  Stock.spend(bot, cap, c);
  m.rv = 1; bump(m, 'revives');
  ctx.event('hero_revive_started', { bot: bot.name, level: hero.level, hours: Math.round((v.data.revive?.seconds || 0) / 360) / 10, domus });
}
// pas de Domus (le plan de l'économie le bâtit tôt) : le joueur le construit pour ressusciter son héros
async function buildDomus(bot, ctx, B, m, cap) {
  if (B.left <= 0 || !DOMUS) return;
  if ((cap.buildQueue || []).some(q => q.buildingKey === 'HERO_MANSION')) return;
  if ((cap.buildQueue || []).length >= config.build.maxRunning + config.build.maxQueued) return;
  if (!Stock.canPay(bot, DOMUS.costL1)) { bump(m, 'domusWaitRes'); return; }
  B.left--;
  const r = await bot.post(`/api/cities/${cap.id}/build`, { buildingKey: 'HERO_MANSION' });
  if (!r.ok) { fail(m, r, 'domusRefused'); return; }
  Stock.spend(bot, cap, r.data?.cost || DOMUS.costL1);
  (cap.buildQueue ||= []).push({ buildingKey: 'HERO_MANSION', targetLevel: 1 });
  bump(m, 'domusBuilt');
}

// ---------- points de caractéristique : la caractéristique de sa voie jusqu'au plafond, puis la suivante ----------
async function points(bot, ctx, B, m, hero) {
  if (B.left <= 0 || !(hero.statPoints > 0)) return;
  let left = hero.statPoints;
  const body = {};
  for (const s of BUILDS[m.b].stats) {
    const room = Math.max(0, STAT_CAP - (hero[s] || 0) - (hero[FIELD[s]] || 0));
    const n = Math.min(room, left);
    if (n > 0) { body[BODY[s]] = n; left -= n; }
    if (left <= 0) break;
  }
  const total = Object.values(body).reduce((t, v) => t + v, 0);
  if (!total) return;   // tout au plafond : les points restent
  B.left--;
  const r = await bot.post('/api/hero/assign-points', body);
  if (!r.ok) { fail(m, r, 'pointsRefused'); return; }
  for (const [s, f] of Object.entries(FIELD)) hero[f] = (hero[f] || 0) + (body[BODY[s]] || 0);
  hero.statPoints -= total;
  bump(m, 'points', total); bump(m, 'pointCalls');
}

// ---------- talents ----------
function nextTalent(hero, build) {
  for (const [key, rank] of BUILDS[build].talents) if (((hero.talents || {})[key] || 0) < rank && !HE.canLearn(hero, key)) return key;
  for (const key of HE.TALENTS.keys()) if (!HE.canLearn(hero, key)) return key;   // la voie est pleine : n'importe quel talent
  return null;
}
async function talents(bot, ctx, B, m, hero) {
  hero.talents = hero.talents && typeof hero.talents === 'object' ? hero.talents : {};
  // réorientation : l'intendant devient conquérant vers le niveau 12 (gratuit, la première fois) ; un conquérant tombé
  // deux fois passe à la garde (Endurance : résurrection plus courte), au prix de l'or si ce n'est pas la première
  if (B.left > 2 && HE.spentPoints(hero) > 0) {
    let to = null, flag = null;
    if (!m.rs && m.b === 'i' && hero.level >= 12) { to = 'c'; flag = 'rs'; }
    else if (!m.rs2 && m.b === 'c' && (m.k.deaths || 0) >= 2) { to = 'g'; flag = 'rs2'; }
    if (to) {
      const price = (hero.talentResets || 0) > 0 ? HE.catalog.resetGold : 0;
      if (!price || spareGold(bot) >= price + 50) {
        B.left--;
        const r = await bot.post('/api/hero/talents/reset');
        m[flag] = 1;
        if (r.ok) {
          ctx.event('hero_respec', { bot: bot.name, from: m.b, to, level: hero.level, gold: price });
          hero.talents = {}; hero.talentResets = (hero.talentResets || 0) + 1; m.b = to;
          if (price && bot.me) bot.me.gold -= price;
          bump(m, price ? 'resetsPaid' : 'resetsFree');
        } else fail(m, r, 'resetRefused');
      } else bump(m, 'resetWaitGold');
    }
  }
  let learned = 0;
  while (B.left > 2 && learned < 3) {
    const key = nextTalent(hero, m.b);
    if (!key) break;
    B.left--;
    const r = await bot.post('/api/hero/talents/learn', { key });
    if (!r.ok) { fail(m, r, 'talentRefused'); break; }
    hero.talents = r.data?.talents || { ...hero.talents, [key]: (hero.talents[key] || 0) + 1 };
    learned++; bump(m, 'talents');
  }
}

// ---------- équipement : le meilleur objet de chaque emplacement selon sa voie ; le sac trié ----------
async function gear(bot, ctx, B, m, hero) {
  const items = hero.items || [];
  if (!items.length) return;
  const w = BUILDS[m.b].w;
  let changes = 0;
  for (const slot of SLOTS) {
    if (B.left <= 0 || changes >= 2) break;
    const mine = items.filter(i => ITEM.get(i.itemKey)?.slot === slot);
    if (!mine.length) continue;
    const worn = mine.find(i => i.slot === slot) || null;
    const best = mine.slice().sort((a, b) => valueOf(b, w) - valueOf(a, w))[0];
    if (best === worn || (worn && valueOf(best, w) <= valueOf(worn, w))) continue;
    // certains joueurs retirent d'abord l'objet porté (panneau de l'objet), d'autres équipent directement (échange)
    if (worn && m.sw && B.left >= 2) {
      B.left--;
      const u = await bot.post('/api/hero/unequip', { itemId: worn.id });
      if (u.ok) { worn.slot = 'inventory'; bump(m, 'unequips'); } else { fail(m, u, 'unequipRefused'); break; }
    }
    B.left--;
    const r = await bot.post('/api/hero/equip', { itemId: best.id });
    if (!r.ok) { fail(m, r, 'equipRefused'); break; }
    for (const i of items) if (i !== best && i.slot === slot) i.slot = 'inventory';
    best.slot = r.data?.slot || slot;
    changes++; bump(m, 'equips');
    if (r.data?.slot && r.data.slot !== slot) bump(m, 'equipSlotMismatch');
  }
  // sac plein : jeter l'objet le plus faible qui ne vaut pas celui qu'on porte au même emplacement
  const bag = items.filter(i => i.slot === 'inventory');
  if (B.left > 0 && bag.length > BAG_KEEP) {
    const worse = bag.filter(i => { const s = ITEM.get(i.itemKey)?.slot; const worn = items.find(x => x.slot === s); return !s || (worn && valueOf(i, w) <= valueOf(worn, w)); })
      .sort((a, b) => valueOf(a, w) - valueOf(b, w));
    if (worse.length) {
      B.left--;
      const r = await bot.post('/api/hero/drop-item', { itemId: worse[0].id });
      if (r.ok) { items.splice(items.indexOf(worse[0]), 1); bump(m, 'drops'); } else fail(m, r, 'dropRefused');
    }
  }
}

// ---------- l'armée principale de la capitale ----------
function colonyBusy(bot, armyId) {
  const col = bot.mem.mil?.col;
  return !!col && (col.a === armyId || col.b === armyId);
}
function mainArmy(bot, ctx, m, cap, hero) {
  const field = bot.armies.filter(a => !a.isGarrison && a.cityId === cap.id && !colonyBusy(bot, a.id));
  if (militaryOn(ctx)) {
    const own = new Set(bot.mem.mil?.own || []);
    const mine = field.filter(a => own.has(a.id));
    const led = mine.find(a => a.heroId === hero.id);
    if (led && soldiers(led) >= WEAK) return led;
    return mine.sort((a, b) => (b.power || 0) - (a.power || 0))[0] || null;
  }
  return field.find(a => a.id === m.a) || null;
}

// sans module militaire : une armée d'escorte pour le héros, remplie depuis la garnison
async function ownArmy(bot, ctx, B, m, cap) {
  if (militaryOn(ctx) || B.left <= 2) return;
  const g = garrisonOf(bot, cap);
  let a = m.a ? bot.armies.find(x => x.id === m.a) : null;
  if (!a) {
    delete m.a;
    const max = fx.maxArmies(cap.buildings || []);
    if (max <= 0 || soldiers(g) < 30) return;
    const used = new Set(bot.armies.filter(x => !x.isGarrison && x.cityId === cap.id).map(x => x.slot));
    let slot = null;
    for (let s = 1; s <= max; s++) if (!used.has(s)) { slot = s; break; }
    if (!slot) return;
    B.left--;
    const r = await bot.post('/api/army/create', { cityId: cap.id, slot });
    if (!r.ok || !r.data?.army) { fail(m, r, 'armyRefused'); return; }
    m.a = r.data.army.id;
    a = { ...r.data.army, units: [], power: 0 };
    bot.armies.push(a);
    bump(m, 'armiesCreated');
  }
  if (!atHome(bot, a) || soldiers(a) >= 0.6 * (soldiers(a) + soldiers(g))) return;
  const rows = (g?.units || []).filter(u => UNIT[u.unitKey] && UNIT[u.unitKey].class !== 'SIEGE' && u.count >= 5).sort((x, y) => y.count - x.count).slice(0, 2);
  for (const row of rows) {
    if (B.left <= 2) break;
    const take = Math.floor(row.count * 0.6);
    if (take < 5) continue;
    B.left--;
    const r = await bot.post(`/api/army/${a.id}/adjust-unit`, { unitKey: row.unitKey, delta: take });
    if (!r.ok) { fail(m, r, 'fillRefused'); break; }
    row.count -= take;
    const have = (a.units ||= []).find(u => u.unitKey === row.unitKey);
    if (have) have.count += take; else a.units.push({ unitKey: row.unitKey, tier: UNIT[row.unitKey].tier, count: take });
    a.power = (a.power || 0) + take * ((UNIT[row.unitKey].stats?.attack || 0) + (UNIT[row.unitKey].stats?.defense || 0)) * (C.tierCoefficients[UNIT[row.unitKey].tier] || 1);
    bump(m, 'moved', take);
  }
}

// ---------- place du héros ----------
async function place(bot, ctx, B, m, hero, cap) {
  if (B.left <= 0 || (bot.mem.heroHold || 0) > ctx.step) return;
  const holder = bot.armies.find(a => a.heroId === hero.id) || null;
  if (holder && !atHome(bot, holder)) return;   // dehors avec son armée
  const where = holder ? holder.cityId : hero.cityId;
  let target = null, why = null;
  if (where && where !== cap.id) {
    // il attend dans une colonie (sa ville rasée, une armée dissoute) : il en mène la garnison
    const city = cityOf(bot, where);
    const g = city ? garrisonOf(bot, city) : null;
    if (!holder && g && soldiers(g) > 0) { target = g; why = 'colonyGarrison'; }
  } else {
    const g = garrisonOf(bot, cap);
    const main = mainArmy(bot, ctx, m, cap, hero);
    const leadsField = !!holder && !holder.isGarrison;
    // assiégée : il commande la garnison (il reste derrière les murs si l'armée sort contre le camp)
    if (cap.isSieged) { if (g && holder !== g) { target = g; why = 'defend'; } }
    // il mène déjà une armée de campagne en état (la principale, ou celle qu'un autre module lui a confiée) : il y reste
    else if (leadsField && soldiers(holder) >= WEAK) { /* rien */ }
    else if (main && atHome(bot, main) && soldiers(main) >= LEAD_MIN) { if (holder !== main) { target = main; why = 'lead'; } }
    // son armée est réduite à presque rien : la garnison, ou il attend en ville sans combattre
    else if (leadsField) { target = g && soldiers(g) >= WEAK ? g : 'none'; why = 'weak'; }
    else if (!holder && g && soldiers(g) >= WEAK) { target = g; why = 'garrison'; }
  }
  if (!target) return;
  if (target === 'none') {
    B.left--;
    const r = await bot.post(`/api/army/${holder.id}/unassign-hero`);
    if (!r.ok) { fail(m, r, 'unassignRefused'); return; }
    holder.heroId = null; hero.cityId = holder.cityId;
    bump(m, 'unassigns');
    return;
  }
  if (!atHome(bot, target)) return;
  B.left--;
  const r = await bot.post(`/api/army/${target.id}/assign-hero`);
  if (!r.ok) { fail(m, r, 'assignRefused'); return; }
  if (holder) holder.heroId = null;
  target.heroId = hero.id; hero.cityId = target.cityId;
  bump(m, 'assigns'); bump(m, `assign_${why}`);
}

// ---------- expéditions avec l'armée que mène le héros ----------
async function expedition(bot, ctx, B, m, hero, cap) {
  if (B.left <= 0 || ctx.step < (m.ne || 0) || cap.isSieged || (bot.mem.heroHold || 0) > ctx.step) return;
  const army = bot.armies.find(a => a.heroId === hero.id);
  if (!army || army.isGarrison || !atHome(bot, army) || soldiers(army) < 10 || colonyBusy(bot, army.id)) return;
  // une fondation en cours garde une armée de la capitale pour escorter le colon
  const col = bot.mem.mil?.col;
  if (col && (col.ph === 'approach' || col.ph === 'ready')) return;
  const now = ctx.clock.now();
  const open = (bot.me?.expeditions || []).filter(e => e.status === 'AVAILABLE' && Date.parse(e.expiresAt) > now + 300000);
  if (!open.length) { bump(m, 'expNone'); m.ne = ctx.step + 2; return; }
  const power = army.power || 0;
  const winnable = open.filter(e => power / EXP_DIV > EXP_WIN * e.enemyPower * EXP_MARGIN);
  if (!winnable.length) { bump(m, 'expTooStrong'); m.ne = ctx.step + 4; return; }
  const e = winnable.sort((a, b) => b.enemyPower - a.enemyPower)[0];   // la plus forte qu'elle peut gagner : plus d'XP, meilleur butin
  B.left--;
  const r = await bot.post(`/api/expeditions/${e.id}/start`, { armyId: army.id });
  if (!r.ok) { fail(m, r, 'expRefused'); m.ne = ctx.step + 2; return; }
  army.status = 'EXPEDITION';
  e.status = 'IN_PROGRESS';
  bump(m, 'exp'); bump(m, `expD${e.difficulty}`);
  const idleForMil = (bot.mem.mil?.idle?.[army.id] || 0) > ctx.step;
  m.ne = ctx.step + (!militaryOn(ctx) || idleForMil ? EXP_GAP_IDLE : EXP_GAP);
}

// ---------- rattrapage des expéditions créées par le tick (voir l'en-tête) ----------
let EP = null;
async function catchUpExpeditions(ctx) {
  if (process.env.SIM_HERO_EXPEDITIONS === '0') return 0;
  EP ||= require(path.join(ROOT, 'src/game/processors/expeditionProcessor'));
  if (typeof EP.generateNewExpeditions !== 'function' || EP.generateNewExpeditions.length >= 1) return 0;
  const ticks = Math.round((Number(ctx.OPT.stepHours) || 6) / (config.tick.tickHours || 30 / 3600)) - 1;   // le pas en a déjà joué un
  for (let i = 0; i < ticks; i++) await EP.generateNewExpeditions();
  return ticks;
}

// ---------- bilan (lecture seule) ----------
async function summary(ctx) {
  const k = {};
  for (const b of ctx.bots) for (const [key, v] of Object.entries(b.mem.hero?.k || {})) k[key] = (k[key] || 0) + v;
  let db = {};
  try {
    const heroes = await ctx.prisma.hero.findMany({ select: { level: true, diedAt: true, reviveEndsAt: true, statPoints: true, talents: true, talentResets: true, atkPoints: true, defPoints: true, spdPoints: true, logPoints: true, army: { select: { isGarrison: true, status: true } }, items: { select: { slot: true, itemKey: true } } } });
    const q = (sql) => ctx.prisma.$queryRawUnsafe(sql);
    const exps = await q(`SELECT status, won, count(*)::int AS n FROM "Expedition" GROUP BY 1, 2`);
    const items = heroes.flatMap(h => h.items);
    const lv = heroes.map(h => h.level);
    db = {
      heroes: heroes.length, avgLevel: lv.length ? Math.round(lv.reduce((t, x) => t + x, 0) / lv.length * 10) / 10 : 0, maxLevel: Math.max(0, ...lv),
      fallen: heroes.filter(h => h.diedAt && !h.reviveEndsAt).length, reviving: heroes.filter(h => h.reviveEndsAt).length,
      leading: heroes.filter(h => h.army && !h.army.isGarrison).length, inGarrison: heroes.filter(h => h.army?.isGarrison).length, waiting: heroes.filter(h => !h.army && !h.diedAt).length,
      onExpedition: heroes.filter(h => h.army?.status === 'EXPEDITION').length,
      statPointsSpent: heroes.reduce((t, h) => t + h.atkPoints + h.defPoints + h.spdPoints + h.logPoints, 0), statPointsFree: heroes.reduce((t, h) => t + h.statPoints, 0),
      talentRanks: heroes.reduce((t, h) => t + HE.spentPoints(h), 0), talentFree: heroes.reduce((t, h) => t + Math.max(0, HE.talentPoints(h) - HE.spentPoints(h)), 0), resets: heroes.reduce((t, h) => t + h.talentResets, 0),
      items: items.length, worn: items.filter(i => i.slot !== 'inventory').length,
      // le jeu purge les expéditions terminées après 7 jours (config.retentionDays.expeditions) : ce sont les dernières
      expeditions7d: Object.fromEntries(exps.map(e => [`${e.status}${e.status === 'COMPLETED' ? (e.won ? '_won' : '_lost') : ''}`, e.n]))
    };
  } catch (e) { db = { error: e.message }; }
  ctx.event('hero_summary', { step: ctx.step, ...db, counters: k });
  ctx.say(`héros : ${JSON.stringify({ avgLevel: db.avgLevel, maxLevel: db.maxLevel, leading: db.leading, items: db.items, worn: db.worn, talentRanks: db.talentRanks, exp: k.exp || 0, expeditions7d: db.expeditions7d, deaths: k.deaths || 0, revives: k.revives || 0 })}`);
}

module.exports = {
  name: 'hero',
  setup(bot, ctx) { memOf(bot, ctx); },
  async act(bot, ctx) {
    const cap = bot.capital;
    if (!cap || !bot.me || !Array.isArray(bot.armies)) return;
    const m = memOf(bot, ctx);
    const B = { left: CALLS_PER_TURN };
    const hero = await identity(bot, ctx, B, m, cap);
    if (!hero) return;
    hero.items ||= [];
    track(bot, ctx, m, hero);
    if (hero.diedAt) { await revive(bot, ctx, B, m, hero, cap); return; }
    await points(bot, ctx, B, m, hero);
    await talents(bot, ctx, B, m, hero);
    await ownArmy(bot, ctx, B, m, cap);
    await place(bot, ctx, B, m, hero, cap);
    await expedition(bot, ctx, B, m, hero, cap);
    await gear(bot, ctx, B, m, hero);
  },
  async afterStep(ctx) {
    const made = await catchUpExpeditions(ctx);
    if (made && ctx.step === 1) ctx.event('hero_expedition_catchup', { ticksPerStep: made + 1 });
    const total = Math.round(ctx.OPT.days * 24 / ctx.OPT.stepHours);
    if (ctx.step % SUMMARY_EVERY === 0 || ctx.step === total) await summary(ctx);
  }
};
