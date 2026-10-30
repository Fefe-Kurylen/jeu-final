// Simulation longue — guerre : la guerre entre les deux grandes alliances rivales (A et B, en guerre déclarée par le
// module d'alliance), et quelques raids de joueurs solitaires. Règles : docs/ETAT-DES-SYSTEMES.md (Espionnage et vision,
// Siège, Bastion d'alliance, Invasions › rassemblement contre un Bastion), src/routes/armies.js, src/routes/spies.js,
// src/services/spyService.js, src/services/bastionService.js, src/services/rallyService.js, src/game/processors/armyProcessor.js.
//
// Rôles (fixés par le nom du joueur) : dans A et B, 7 joueurs sur 10 sont des « guerriers » (Atelier poussé au niveau 5,
// engins de siège, armée « Ost », raids, sièges), les autres des « gardiens » (espion, défense) ; les solitaires sont des
// pillards (Ost, espions, raids de temps en temps) ; C reste en paix mais défend ses alliés de A.
//
// Pendant le tour du joueur (act, 6 appels au plus) : engins à l'Atelier, armée « Ost » (créée sur une place libre de la
// Place de rassemblement que les autres modules n'attendent pas, remplie depuis la garnison ; ses engins rentrent dans la
// garnison entre deux sièges), espions (recrutement à la Tour de guet, missions « Ressources et troupes » ou « Défenses et
// troupes », lecture des rapports), raids sur les villes ennemies quand un rapport d'espion récent montre une défense
// nettement plus faible et un butin qui vaut la marche, rappel des renforts et des gardes devenus inutiles.
//
// Les alertes (comme une notification sur le téléphone, au premier tour de chaque pas, juste après le tick) : une ville
// assiégée de son alliance ou d'une alliance alliée → sortie de la ville ou armée qui brise le siège, si elle arrive avant
// l'assaut et pèse nettement plus que le camp ; un Bastion assiégé → sortie d'une armée de la garnison (mission BREAK) ou
// armée du dehors. Après le tour de tous les joueurs (afterStep) : le « conseil de guerre » de A et de B choisit une ville
// ennemie (les colonies d'abord, mur et garnison faibles, à portée de ses guerriers), la fait espionner, et lance une vague
// de siège quand la bataille simulée avec la formule du jeu (combatService, mur bouclier) est gagnée avec marge sur les
// renseignements des espions (garnison × 1,3) ; les camps de la vague arrivent au même tick et combattent ensemble. Les
// renforts partent vers une ville alliée quand une attaque de siège y marche (avant l'arrivée du camp). Une alliance
// s'en prend aussi, de loin en loin, au Bastion ennemi : rassemblement d'alliance (POST /api/rallies, les membres
// rejoignent) ou siège seul (POST /api/bastion/:id/send ATTACK). Les issues (ville tombée, siège brisé, assaut du Bastion,
// Bastion rasé) sont écrites dans events.jsonl ; un point d'étape chaque semaine.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { unitsData, buildingsData } = require(path.join(ROOT, 'src/config/gamedata'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
let CS = null;
const combat = () => (CS ||= require(path.join(ROOT, 'src/services/combatService')));   // formules pures : estimation d'une bataille
const Stock = require('../stock.cjs');   // stock partagé : engins et bâtiments se paient sur toutes les villes du joueur

const RES = ['wood', 'stone', 'iron', 'food'];
const UNIT = Object.fromEntries(unitsData.map(u => [u.key, u]));
const TIER = config.combat.tierCoefficients;
const MAX_QUEUE = config.build.maxRunning + config.build.maxQueued;
const OST = 'Ost';
const RESERVED_NAMES = new Set(['Convoi', 'Caravane']);
const CALLS = 6;                 // appels par tour de joueur
const STEP_CALLS = 40;           // appels par pas pour les alertes et le conseil (tous joueurs confondus)
const RAID_RANGE = 80;           // un raid ne va pas plus loin (cases)
const SIEGE_HOURS = 4.5;         // une vague arrive avant le tick suivant (pas de 6 h)
const SUPPORT_RANGE = 120;
const WAVE_MAX = 6;              // armées par vague
const SPY_FRESH_H = 30;          // un rapport sert pendant 30 h (raids) ; le conseil veut des défenses de moins de 24 h
const BASTION_GAP = 40;          // pas entre deux opérations contre le Bastion ennemi (10 jours)
let STEP_H = 6;                  // heures par pas (ctx.OPT.stepHours)

// ---------- petites aides ----------
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const lvl = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const queuedLvl = (city, key) => (city?.buildQueue || []).reduce((m, q) => (q.buildingKey === key && (q.targetLevel || 0) > m ? q.targetLevel : m), 0);
const keyOf = (u) => u.unitKey || u.key;
const isSiege = (k) => UNIT[k]?.class === 'SIEGE';
const rows = (units) => (units || []).filter(u => (u.count || 0) > 0 && UNIT[keyOf(u)]).map(u => ({ unitKey: keyOf(u), count: Math.floor(u.count), tier: u.tier || UNIT[keyOf(u)].tier }));
const countIf = (units, f) => rows(units).filter(u => f(u.unitKey)).reduce((t, u) => t + u.count, 0);
const enginesOf = (units) => countIf(units, isSiege);
const soldiersOf = (units) => countIf(units, k => !isSiege(k));
const powerOf = (units) => rows(units).reduce((t, u) => t + ((UNIT[u.unitKey].stats?.attack || 0) + (UNIT[u.unitKey].stats?.defense || 0)) * (TIER[u.tier] || 1) * u.count, 0);
const minSpeed = (units) => Math.min(100, ...rows(units).map(u => UNIT[u.unitKey].stats?.speed || 50));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// durée de marche estimée (s) : la route contourne le relief (× 1,25), sans les bonus de vitesse (prudent)
const travelSec = (units, a, b) => dist(a, b) * 1.25 * 30 * 50 / Math.max(1, minSpeed(units));
const atHomeIn = (a, city) => !!a && !!city && a.status === 'IDLE' && !a.claimedAt && a.x === city.x && a.y === city.y && a.cityId === city.id;
const merge = (...lists) => { const m = {}; for (const l of lists) for (const u of rows(l)) (m[u.unitKey] ||= { unitKey: u.unitKey, tier: u.tier, count: 0 }).count += u.count; return Object.values(m); };
const scale = (units, f) => rows(units).map(u => ({ ...u, count: Math.ceil(u.count * f) })).filter(u => u.count > 0);
const factionUnit = (faction, cls) => unitsData.find(u => u.faction === faction && u.class === cls) || null;
const rallyCapacity = (rp) => Math.max(3, Math.min(15, 3 + Math.floor((Math.max(1, rp) - 1) * 12 / 19)));

// connecté à ce pas : le joueur joue un pas sur deux (bot.turn), comme le harnais
const online = (ctx, b) => !!b.mem?.alwaysOn || (ctx.step + (b.turn || 0)) % 2 === 0;

// rôle du joueur (stable : tiré du nom)
function roleOf(bot) {
  if (bot.group === 'SOLO') return 'raider';
  if (bot.group === 'A' || bot.group === 'B') return hash(`war:${bot.name}`) % 10 < 7 ? 'warrior' : 'guard';
  return 'peace';
}

// ---------- compteurs (persistés dans bot.mem.war.k, sommés au point d'étape) ----------
const REFUSALS = new Map();   // route → refus (depuis le dernier démarrage)
let ERRORS = { n: 0, first: null };
function memOf(bot, v) {
  if (!bot.mem.war || bot.mem.war.w !== v.number) bot.mem.war = { w: v.number, k: (bot.mem.war?.k || {}) };
  const m = bot.mem.war;
  m.k ||= {}; m.raid ||= {}; m.sup ||= {};
  return m;
}
const bump = (m, k, n = 1) => { m.k[k] = (m.k[k] || 0) + n; };
// tous les appels du module passent ici : comptés (appels, réussis, refus par route)
async function call(bot, m, method, p, body) {
  bump(m, 'calls');
  let r;
  try { r = await bot.api(method, p, body); } catch (e) { r = { ok: false, status: 0, data: { error: e.message } }; }
  if (r.ok) bump(m, 'ok');
  else {
    bump(m, 'refused');
    const k = `${method} ${p.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').split('?')[0]} ${r.status} ${String(r.data?.error || '').replace(/\d+/g, 'N').slice(0, 90)}`;
    REFUSALS.set(k, (REFUSALS.get(k) || 0) + 1);
  }
  return r;
}

// ---------- ce que les joueurs voient du monde (lu une fois par pas) ----------
let SNAP = { step: -1, v: null };
async function snapshot(ctx, fresh = false) {
  if (!fresh && SNAP.step === ctx.step && SNAP.v) return SNAP.v;
  const P = ctx.prisma;
  const wc = await P.worldConfig.findUnique({ where: { id: 1 }, select: { number: true, endedAt: true, readyAt: true, createdAt: true } }).catch(() => null);
  const now = ctx.clock.now();
  const v = { number: wc?.number || 1, ended: !wc || !!wc.endedAt, now, day: Math.floor((now - new Date(wc?.readyAt || wc?.createdAt || now).getTime()) / 86400000) };
  if (v.number !== SNAP.v?.number) { INTEL.clear(); BREAKS.clear(); }
  SNAP = { step: ctx.step, v };
  if (v.ended) return v;
  const [members, dip, cities, camps, incoming, bastions] = await Promise.all([
    P.allianceMember.findMany({ select: { playerId: true, allianceId: true, role: true, alliance: { select: { tag: true } } } }),
    P.allianceDiplomacy.findMany({ select: { allianceId: true, targetAllianceId: true, status: true } }),
    // la carte : villes, mur (niveau et fumée des vies perdues), propriétaire et sa civilisation
    P.city.findMany({ select: { id: true, name: true, x: true, y: true, playerId: true, isCapital: true, isSieged: true, isWonder: true, wallStructure: true, wallMaxHp: true, player: { select: { name: true, faction: true, population: true } }, buildings: { where: { key: { in: ['WALL', 'RALLY_POINT', 'WORKSHOP', 'WATCHTOWER'] } }, select: { key: true, level: true } } } }),
    // les camps devant les villes et les Bastions (un siège se voit : fenêtre de siège, soldats et engins)
    P.army.findMany({ where: { status: 'BESIEGING' }, select: { id: true, ownerId: true, targetCityId: true, targetBastionId: true, arrivalAt: true, claimedAt: true, units: { select: { unitKey: true, count: true } } } }),
    // les attaques en marche (vues par l'alliance visée sur la carte)
    P.army.findMany({ where: { status: { in: ['ATTACKING', 'RALLY_MARCH'] }, arrivalAt: { gt: new Date(now) } }, select: { id: true, ownerId: true, status: true, missionType: true, targetCityId: true, targetBastionId: true, arrivalAt: true } }),
    P.bastion.findMany({ select: { id: true, allianceId: true, x: true, y: true, status: true, isSieged: true } })
  ]);
  v.allianceOf = new Map(members.map(x => [x.playerId, x.allianceId]));
  v.tagOf = new Map(members.map(x => [x.allianceId, x.alliance?.tag || '?']));
  const decl = new Map(dip.map(d => [`${d.allianceId}>${d.targetAllianceId}`, d.status]));
  v.allianceRel = (a, b) => {
    if (!a || !b) return 'NEUTRAL';
    if (a === b) return 'SAME';
    const mine = decl.get(`${a}>${b}`) || 'NEUTRAL', theirs = decl.get(`${b}>${a}`) || 'NEUTRAL';
    if (mine === 'ENEMY' || theirs === 'ENEMY') return 'ENEMY';
    return mine === 'ALLY' && theirs === 'ALLY' ? 'ALLY' : 'NEUTRAL';
  };
  // relation entre deux joueurs, comme diplomacyService.getRelation
  v.rel = (p, q) => (p === q ? 'SELF' : v.allianceRel(v.allianceOf.get(p), v.allianceOf.get(q)));
  v.canAttack = (p, q) => p !== q && !['SAME', 'ALLY', 'SELF'].includes(v.rel(p, q));
  v.friend = (p, q) => ['SELF', 'SAME', 'ALLY'].includes(v.rel(p, q));
  v.cities = cities;
  v.cityById = new Map(cities.map(c => [c.id, c]));
  v.citiesOf = new Map();
  for (const c of cities) { if (!v.citiesOf.has(c.playerId)) v.citiesOf.set(c.playerId, []); v.citiesOf.get(c.playerId).push(c); }
  v.camps = camps.filter(c => !c.claimedAt);
  v.incoming = incoming;
  v.bastions = bastions;
  // les armées des joueurs automatiques : chacun connaît les siennes (décisions prises entre deux tours : alertes, conseil)
  const ids = ctx.bots.map(b => b.playerId).filter(Boolean);
  const armies = await P.army.findMany({ where: { ownerId: { in: ids } }, select: { id: true, ownerId: true, cityId: true, name: true, slot: true, x: true, y: true, status: true, isGarrison: true, heroId: true, claimedAt: true, targetCityId: true, targetBastionId: true, missionType: true, arrivalAt: true, rallyId: true, units: { select: { unitKey: true, count: true, tier: true } } } });
  v.armiesOf = new Map();
  for (const a of armies) { if (!v.armiesOf.has(a.ownerId)) v.armiesOf.set(a.ownerId, []); v.armiesOf.get(a.ownerId).push(a); }
  v.botOf = new Map(ctx.bots.map(b => [b.playerId, b]));
  return v;
}
const capitalIn = (v, playerId) => (v.citiesOf.get(playerId) || []).find(c => c.isCapital) || (v.citiesOf.get(playerId) || [])[0] || null;
const wallLevelOf = (c) => lvl(c, 'WALL');
const threatened = (v, cityId) => v.camps.some(a => a.targetCityId === cityId) || v.incoming.some(a => a.targetCityId === cityId);
// l'alliance d'un groupe : celle où sont la plupart de ses joueurs
function groupAlliance(ctx, v, g) {
  const n = new Map();
  for (const b of ctx.byGroup(g)) { const a = b.playerId && v.allianceOf.get(b.playerId); if (a) n.set(a, (n.get(a) || 0) + 1); }
  let best = null;
  for (const [id, k] of n) if (!best || k > best.k) best = { id, k };
  return best?.id || null;
}
const enemiesOf = (v, alId) => new Set([...v.tagOf.keys()].filter(id => v.allianceRel(alId, id) === 'ENEMY'));

// ---------- renseignements (rapports d'espions et de bataille), partagés dans l'alliance ----------
const INTEL = new Map();   // `${camp}:${cityId}` -> { troops, troopsAt, res, resAt, wall, defAt }
const sideOf = (v, playerId) => v.allianceOf.get(playerId) || `p:${playerId}`;
const intelOf = (side, cityId) => INTEL.get(`${side}:${cityId}`) || null;
function intelSet(side, cityId) { const k = `${side}:${cityId}`; if (!INTEL.has(k)) INTEL.set(k, {}); return INTEL.get(k); }
const ageH = (v, t) => (t ? (v.now - t) / 3600000 : Infinity);

// GET /api/reports/spy : les rapports d'espions du joueur, versés dans les renseignements de son camp
async function readSpyReports(bot, ctx, v, m) {
  const r = await call(bot, m, 'GET', '/api/reports/spy');
  if (!r.ok || !Array.isArray(r.data)) return 0;
  const side = sideOf(v, bot.playerId);
  let n = 0, top = m.ra || 0;
  for (const rep of r.data) {
    const t = Date.parse(rep.createdAt);
    if (!(t > (m.ra || 0)) || rep.targetType !== 'CITY' || !rep.targetCityId || rep.playerId !== bot.playerId) continue;
    const e = intelSet(side, rep.targetCityId);
    e.troops = (rep.armies || []).flatMap(a => a.units || []).map(u => ({ unitKey: u.key, count: u.count }));
    e.troopsAt = t;
    if (rep.data?.mission === 'DEFENSES' && rep.data.defenses) {
      const d = rep.data.defenses;
      e.wall = { level: d.wallLevel || 0, hp: d.wallHp || 0, maxHp: d.wallMaxHp || 0, structure: (d.structurePct ?? 100) / 100, defBonus: d.defenseBonusPct || 0 };
      e.defAt = t;
    } else { e.res = rep.resources || {}; e.resAt = t; }
    top = Math.max(top, t); n++;
  }
  m.ra = top;
  if (n) bump(m, 'spyReportsRead', n);
  return n;
}

// ---------- engins de siège à l'Atelier (guerriers) ----------
async function engineTurn(bot, ctx, v, m, B, cap) {
  if (roleOf(bot) !== 'warrior' || B.left <= 1 || v.day < 20) return;
  const ws = lvl(cap, 'WORKSHOP');
  if (ws < config.recruit.siegeWorkshopLevel) return;
  const unit = factionUnit(bot.faction, 'SIEGE');
  if (!unit) return;
  const target = Math.min(30, 4 + 2 * ws);
  const queue = (cap.recruitQueue || []).filter(q => q.buildingKey === 'WORKSHOP');
  const have = bot.armies.reduce((t, a) => t + enginesOf(a.units), 0) + queue.reduce((t, q) => t + (isSiege(q.unitKey) ? q.count : 0), 0);
  if (have >= target || queue.length >= 2) return;
  const fb = Stock.foodBalance(bot);   // l'entretien puise dans tous les greniers du joueur
  if (!fb || !(fb.net > 0)) return;
  const upkeep = config.army.upkeepPerTier?.siege || 15;
  const room = Math.floor((fb.net - Math.max(60, 0.3 * (fb.production || 0))) / upkeep);   // le joueur garde de quoi grandir
  const one = Stock.recruitCost(unit, 1);
  const t = Stock.totals(bot);
  const byRes = Math.min(...RES.map(r => Math.floor(Math.max(0, t[r] - (r === 'food' ? t.maxFoodStorage : t.maxStorage) * 0.25) / Math.max(1, one[r]))));
  const n = Math.min(4, target - have, room, byRes);
  if (!(n >= 1)) { bump(m, room < 1 ? 'engineWaitFood' : 'engineWaitRes'); return; }
  B.left--;
  const r = await call(bot, m, 'POST', `/api/cities/${cap.id}/recruit`, { unitKey: unit.key, count: n });
  if (!r.ok) return;
  Stock.spend(bot, cap, r.data?.cost || Stock.recruitCost(unit, n));
  (cap.recruitQueue ||= []).push({ unitKey: unit.key, count: n, buildingKey: 'WORKSHOP' });
  bump(m, 'engines', n);
}

// ---------- l'armée « Ost » ----------
const garrisonOf = (armies, city) => (armies || []).find(a => a.isGarrison && a.cityId === city?.id) || null;
function militaryNeed(bot, city) {
  const mil = bot.mem.mil;
  if (!mil || !city.isCapital) return 0;
  const own = bot.armies.filter(a => !a.isGarrison && a.cityId === city.id && (mil.own || []).includes(a.id)).length;
  const colonies = bot.cities.filter(c => !c.isCapital && !c.isWonder).length;
  const founding = colonies < config.city.maxSecondaryCities && (!!mil.col || (city.settlers || 0) > 0 || (city.recruitQueue || []).some(q => q.unitKey === 'SETTLER'));
  return Math.max(0, (founding ? 2 : 1) - own);
}
function syncOst(bot, m) {
  let a = m.ost ? bot.armies.find(x => x.id === m.ost) : null;
  if (!a) a = bot.armies.find(x => !x.isGarrison && x.name === OST) || null;
  if (a) m.ost = a.id; else delete m.ost;
  return a;
}
async function ostTurn(bot, ctx, v, m, B, cap) {
  const role = roleOf(bot);
  if ((role !== 'warrior' && role !== 'raider') || B.left <= 1 || !lvl(cap, 'RALLY_POINT')) return;
  let ost = syncOst(bot, m);
  if (!ost) {
    if (cap.isSieged || v.day < 15) return;
    const g = garrisonOf(bot.armies, cap);
    if (soldiersOf(g?.units) < 60) return;
    const max = fx.maxArmies(cap.buildings || []);
    const field = bot.armies.filter(a => !a.isGarrison && a.cityId === cap.id);
    // les autres modules d'abord : armée de campagne (et celle d'une fondation), convoi du Bastion
    const convoy = bot.me?.alliance && !field.some(a => a.name === 'Convoi') ? 1 : 0;
    if (max - field.length - militaryNeed(bot, cap) - convoy <= 0) { bump(m, 'ostNoSlot'); m.noSlot = ctx.step; return; }
    const used = new Set(field.map(a => a.slot));
    let slot = null;
    for (let s = max; s >= 1; s--) if (!used.has(s)) { slot = s; break; }
    if (!slot) return;
    B.left--;
    const r = await call(bot, m, 'POST', '/api/army/create', { cityId: cap.id, slot, name: OST });
    if (!r.ok || !r.data?.army) return;
    m.ost = r.data.army.id;
    ost = { ...r.data.army, units: [] };
    bot.armies.push(ost);
    bump(m, 'ostCreated');
    if (!m.k.ostDay) m.k.ostDay = v.day;
  }
  const city = bot.cities.find(c => c.id === ost.cityId);
  if (!city || !atHomeIn(ost, city)) return;
  const g = garrisonOf(bot.armies, city);
  if (!g) return;
  // entre deux sièges, les engins attendent dans la garnison (le conseil les remet dans l'armée au départ d'une vague)
  for (const e of rows(ost.units).filter(u => isSiege(u.unitKey))) {
    if (B.left <= 1) return;
    B.left--;
    const r = await call(bot, m, 'POST', `/api/army/${ost.id}/set-unit`, { unitKey: e.unitKey, count: 0 });
    if (!r.ok) return;
    const gr = (g.units ||= []).find(u => u.unitKey === e.unitKey);
    if (gr) gr.count += e.count; else g.units.push({ unitKey: e.unitKey, count: e.count, tier: e.tier });
    ost.units = (ost.units || []).filter(u => u.unitKey !== e.unitKey);
    bump(m, 'enginesStored', e.count);
  }
  // des soldats : 60 % de la ville au plus (la garnison garde le reste), 700 au plus
  const gs = soldiersOf(g.units), os = soldiersOf(ost.units);
  const want = Math.min(700, Math.floor(0.6 * (gs + os)));
  if (os >= 0.8 * want || gs < 20) return;
  let missing = want - os;
  const pool = rows(g.units).filter(u => !isSiege(u.unitKey) && u.count >= 5).sort((a, b) => b.count - a.count).slice(0, 2);
  for (const u of pool) {
    if (missing <= 0 || B.left <= 1) break;
    const take = Math.min(missing, Math.floor(u.count * 0.6));
    if (take < 5) continue;
    B.left--;
    const r = await call(bot, m, 'POST', `/api/army/${ost.id}/adjust-unit`, { unitKey: u.unitKey, delta: take });
    if (!r.ok) break;
    const gr = g.units.find(x => x.unitKey === u.unitKey); if (gr) gr.count -= take;
    const row = (ost.units ||= []).find(x => x.unitKey === u.unitKey);
    if (row) row.count += take; else ost.units.push({ unitKey: u.unitKey, count: take, tier: u.tier });
    missing -= take;
    bump(m, 'ostSoldiers', take);
  }
}

// ---------- espions ----------
// villes que le joueur a intérêt à espionner : la cible du conseil de son alliance, puis des cibles de raid proches
function enemyCities(v, bot) {
  return v.cities.filter(c => c.playerId !== bot.playerId && !c.isWonder && (bot.group === 'SOLO' ? v.canAttack(bot.playerId, c.playerId) : v.rel(bot.playerId, c.playerId) === 'ENEMY'));
}
const SPIED = new Map();   // `${camp}:${cityId}` -> pas de la dernière mission envoyée (pas de doublons dans une alliance)
function spyTarget(bot, ctx, v, m, cap) {
  const side = sideOf(v, bot.playerId);
  const recently = (id) => (SPIED.get(`${side}:${id}`) ?? -99) > ctx.step - 6;
  const camp = ['A', 'B'].includes(bot.group) ? ctx.byGroup(bot.group)[0]?.mem?.war?.camp : null;
  if (camp && v.cityById.has(camp.c) && !recently(camp.c) && ageH(v, intelOf(side, camp.c)?.defAt) > 20 && dist(cap, v.cityById.get(camp.c)) < 220) return { cityId: camp.c, mission: 'DEFENSES' };
  const near = enemyCities(v, bot).filter(c => dist(c, cap) <= RAID_RANGE && !recently(c.id) && ageH(v, intelOf(side, c.id)?.resAt) > SPY_FRESH_H)
    .sort((a, b) => dist(a, cap) - dist(b, cap)).slice(0, 4);
  if (near.length) return { cityId: ctx.pick(near).id, mission: 'RESOURCES' };
  if (roleOf(bot) === 'warrior') {
    const far = enemyCities(v, bot).filter(c => !c.isCapital && dist(c, cap) <= 170 && !recently(c.id) && ageH(v, intelOf(side, c.id)?.defAt) > 48).sort((a, b) => dist(a, cap) - dist(b, cap)).slice(0, 3);
    if (far.length) return { cityId: ctx.pick(far).id, mission: 'DEFENSES' };
  }
  return null;
}
async function sendSpy(bot, ctx, v, m, B, cap, target) {
  if (B.left < 2) return false;
  B.left--;
  const s = await call(bot, m, 'GET', '/api/spies');
  if (!s.ok || !s.data) return false;
  m.sp = (s.data.slots || []).filter(x => x.recruited).length;
  if (!(s.data.spies || []).some(x => x.status === 'IDLE')) { bump(m, 'spyBusy'); return false; }
  B.left--;
  const r = await call(bot, m, 'POST', '/api/spies/send', { fromCityId: cap.id, targetCityId: target.cityId, mission: target.mission });
  if (!r.ok) return false;
  SPIED.set(`${sideOf(v, bot.playerId)}:${target.cityId}`, ctx.step);
  m.pend = ctx.step;
  bump(m, target.mission === 'DEFENSES' ? 'spyDefenses' : 'spyResources');
  return true;
}
async function spyTurn(bot, ctx, v, m, B, cap) {
  const role = roleOf(bot);
  if (role === 'peace' || B.left <= 1) return;
  // les rapports d'une mission envoyée à un tour précédent
  if (m.pend && ctx.step > m.pend && B.left > 1) { B.left--; await readSpyReports(bot, ctx, v, m); m.pend = 0; }
  const tower = Math.max(0, ...bot.cities.map(c => lvl(c, 'WATCHTOWER')));
  const lv = config.spies.unlockLevels;
  const want = tower >= lv[1] && role !== 'guard' ? 2 : tower >= lv[0] ? 1 : 0;
  if (m.sp === undefined && want > 0 && B.left > 1) {   // une fois : combien d'espions déjà recrutés
    B.left--;
    const s = await call(bot, m, 'GET', '/api/spies');
    if (s.ok && s.data) m.sp = (s.data.slots || []).filter(x => x.recruited).length;
  }
  if (m.sp !== undefined && m.sp < want && B.left > 1) {
    const slot = m.sp + 1;
    const cost = config.spies.goldCost[slot - 1];
    if ((bot.me?.gold || 0) >= cost + 10) {
      B.left--;
      const r = await call(bot, m, 'POST', '/api/spies/recruit', { slot });
      if (r.ok) { m.sp = slot; if (bot.me) bot.me.gold -= cost; bump(m, 'spiesRecruited'); ctx.event('spy_recruited', { who: bot.name, slot, gold: cost, day: v.day }); }
      else m.sp = undefined;
    }
  }
  if (!m.sp || (m.ns || 0) > ctx.step || B.left < 2 || v.day < 10) return;
  const t = spyTarget(bot, ctx, v, m, cap);
  if (!t) { m.ns = ctx.step + 4; return; }
  await sendSpy(bot, ctx, v, m, B, cap, t);
  m.ns = ctx.step + (role === 'guard' ? 4 : 2);
}

// ---------- raids sur les villes ennemies ----------
function raidEstimate(v, side, att, target) {
  const e = intelOf(side, target.id);
  if (!e || ageH(v, e.troopsAt) > SPY_FRESH_H || ageH(v, e.resAt) > SPY_FRESH_H) return null;
  const defenders = scale(merge(e.troops || []), 1.2);   // la garnison a pu grandir depuis le rapport
  const r = combat().resolveCombat(att, defenders, wallLevelOf(target), null, null, { defenderFaction: target.player?.faction, defenseBonusPct: e.wall?.defBonus || 0 });
  if (!r.attackerWon || r.attackerPower < 1.4 * r.defenderPower) return null;
  const carry = rows(att).reduce((t, u) => t + (UNIT[u.unitKey].stats?.transport || 50) * u.count, 0) * config.combat.raidLootPctOfCarry;
  const pill = RES.reduce((t, k) => t + (e.res?.[k] || 0), 0) * config.hideout.raidStealRate;
  return { loot: Math.min(carry, pill), ratio: r.attackerPower / Math.max(1, r.defenderPower) };
}
async function raidTurn(bot, ctx, v, m, B, cap) {
  const role = roleOf(bot);
  if ((role !== 'warrior' && role !== 'raider') || B.left < 1 || (m.nr || 0) > ctx.step || v.day < 12) return;
  const ost = syncOst(bot, m);
  const city = ost && bot.cities.find(c => c.id === ost.cityId);
  if (!ost || !city || !atHomeIn(ost, city) || city.isSieged || enginesOf(ost.units) > 0 || soldiersOf(ost.units) < 40) return;
  if (bot.cities.some(c => threatened(v, c.id))) { bump(m, 'raidStayHome'); m.nr = ctx.step + 2; return; }
  const keeper = ['A', 'B'].includes(bot.group) ? ctx.byGroup(bot.group).find(b => b.playerId) : null;
  if (keeper?.mem?.war?.muster > ctx.step) { bump(m, 'raidMuster'); return; }   // l'alliance prépare un rassemblement
  const side = sideOf(v, bot.playerId);
  const att = rows(ost.units);
  const inFlight = new Set(bot.armies.filter(a => a.status === 'RAIDING').map(a => a.targetCityId));
  let best = null;
  for (const c of enemyCities(v, bot)) {
    const d = dist(c, city);
    if (d > RAID_RANGE || d < 1 || inFlight.has(c.id) || (m.raid[c.id] ?? -99) > ctx.step - 5) continue;
    const est = raidEstimate(v, side, att, c);
    if (!est || est.loot < 1500) continue;
    const score = est.loot / (d + 10);
    if (!best || score > best.score) best = { c, score, est };
  }
  if (!best) { m.nr = ctx.step + 2; bump(m, 'raidNoTarget'); return; }
  B.left--;
  const r = await call(bot, m, 'POST', `/api/army/${ost.id}/raid`, { targetCityId: best.c.id });
  m.raid[best.c.id] = ctx.step;
  for (const id of Object.keys(m.raid)) if (m.raid[id] < ctx.step - 8) delete m.raid[id];
  if (!r.ok) { m.nr = ctx.step + 2; return; }
  ost.status = 'RAIDING';
  bump(m, 'raids'); bump(m, 'raidLootEst', Math.round(best.est.loot));
  if (bot.group === 'SOLO') bump(m, 'soloRaids');
  m.nr = ctx.step + (role === 'raider' ? 6 : 3);
}

// ---------- rappels : renforts et gardes devenus inutiles ----------
async function recallTurn(bot, ctx, v, m, B) {
  for (const a of bot.armies) {
    if (B.left <= 0) break;
    if (a.isGarrison || a.claimedAt) continue;
    let why = null;
    if (a.status === 'STATIONED' && a.targetCityId && !a.targetBastionId && m.sup[a.id] !== undefined) {
      // renfort posté : il rentre quand la ville n'est plus menacée depuis un jour
      if (ctx.step - m.sup[a.id] >= 4 && !threatened(v, a.targetCityId)) why = 'support';
    } else if (a.id === m.ost && a.status === 'IDLE') {
      // garde devant une ville après un siège brisé : elle rentre quand le danger est passé
      const home = bot.cities.find(c => c.id === a.cityId);
      if (home && (a.x !== home.x || a.y !== home.y)) {
        const guarded = v.cities.find(c => c.x === a.x && c.y === a.y);
        if (!guarded || !threatened(v, guarded.id)) why = 'guard';
      }
    }
    if (!why) continue;
    B.left--;
    const r = await call(bot, m, 'POST', `/api/army/${a.id}/return`);
    if (r.ok) { a.status = 'RETURNING'; delete m.sup[a.id]; bump(m, why === 'support' ? 'supportRecalls' : 'guardRecalls'); }
    else delete m.sup[a.id];
  }
  for (const id of Object.keys(m.sup)) if (!bot.armies.some(a => a.id === id && ['SUPPORTING', 'STATIONED'].includes(a.status))) delete m.sup[id];
}

// ---------- armées disponibles d'un joueur (vues du serveur, pour les décisions entre deux tours) ----------
function readyArmies(v, bot, cityFilter = null) {
  const armies = v.armiesOf.get(bot.playerId) || [];
  const col = bot.mem.mil?.col;
  const out = [];
  for (const a of armies) {
    if (a.isGarrison || a.status !== 'IDLE' || a.claimedAt || RESERVED_NAMES.has(a.name) || (col && (col.a === a.id || col.b === a.id))) continue;
    const city = v.cityById.get(a.cityId);
    if (!city || city.x !== a.x || city.y !== a.y || (cityFilter && !cityFilter(city))) continue;
    if (soldiersOf(a.units) < 20) continue;
    out.push({ army: a, city, ost: a.name === OST || a.id === bot.mem.war?.ost });
  }
  return out.sort((p, q) => (q.ost - p.ost) || (powerOf(q.army.units) - powerOf(p.army.units)));
}
// puissance d'un camp vue de la fenêtre de siège (soldats et engins), estimée prudemment
const campPowerSeen = (camps) => camps.reduce((t, c) => t + soldiersOf(c.units) * 95 + enginesOf(c.units) * 90, 0);

// ---------- alertes : sièges en cours (premier tour de chaque pas, juste après le tick) ----------
const BREAKS = new Map();   // cible -> pas : deux armées au plus par cible et par pas
async function alerts(ctx, v) {
  const budget = { left: 14 };
  // villes assiégées
  const byCity = new Map();
  for (const c of v.camps) if (c.targetCityId && new Date(c.arrivalAt).getTime() > v.now + 60000) { if (!byCity.has(c.targetCityId)) byCity.set(c.targetCityId, []); byCity.get(c.targetCityId).push(c); }
  for (const [cityId, camps] of byCity) {
    const city = v.cityById.get(cityId);
    if (!city || budget.left <= 0) continue;
    const fightAt = Math.min(...camps.map(c => new Date(c.arrivalAt).getTime()));
    let need = campPowerSeen(camps) * 1.3;
    let sent = 0;
    // qui répond : les joueurs connectés à ce pas ; le propriétaire, prévenu sur son téléphone, une fois sur deux sinon
    const ownerAwake = ctx.rand() < 0.5;
    const helpers = ctx.bots.filter(b => b.playerId && (b.playerId === city.playerId || v.friend(b.playerId, city.playerId)) && camps.some(c => v.canAttack(b.playerId, c.ownerId)) && (online(ctx, b) || (b.playerId === city.playerId && ownerAwake)));
    // la ville elle-même d'abord (sortie), puis les plus proches
    const options = [];
    for (const b of helpers) {
      for (const r of readyArmiesAny(v, b)) {
        const sortie = r.city.id === city.id;
        if (!sortie && r.city.isSieged) continue;
        const t = sortie ? 1 : travelSec(r.army.units, r.city, city);
        if (v.now + t * 1000 > fightAt - 120000) continue;
        options.push({ b, r, t, sortie, p: powerOf(r.army.units) });
      }
    }
    options.sort((p, q) => (q.sortie - p.sortie) || (q.p - p.p));
    for (const o of options) {
      if (budget.left <= 0 || sent >= 1 || (BREAKS.get(cityId) || 0) >= 1) break;
      if (o.p < need) continue;   // chaque armée se bat seule contre tout le camp : la première qui pèse assez
      const m = memOf(o.b, v);
      budget.left--;
      const r = await call(o.b, m, 'POST', `/api/army/${o.r.army.id}/break-siege`, { targetCityId: city.id });
      if (!r.ok) continue;
      o.r.army.status = 'ATTACKING';
      sent++; BREAKS.set(cityId, (BREAKS.get(cityId) || 0) + 1);
      bump(m, o.sortie ? 'sorties' : 'breakSieges');
    }
    if (!helpers.length) { const K = stats(ctx); K.breakNobodyOnline = (K.breakNobodyOnline || 0) + 1; }
    if (!sent) for (const b of helpers) { const m = memOf(b, v); bump(m, 'breakTooWeak'); break; }
  }
  // Bastions assiégés : sortie de la garnison, ou armée du dehors
  for (const b of v.bastions.filter(x => ['BUILDING', 'ACTIVE'].includes(x.status))) {
    const camps = v.camps.filter(c => c.targetBastionId === b.id && new Date(c.arrivalAt).getTime() > v.now + 60000);
    if (!camps.length || budget.left <= 0) continue;
    const fightAt = Math.min(...camps.map(c => new Date(c.arrivalAt).getTime()));
    const need = campPowerSeen(camps) * 1.3;
    const members = ctx.bots.filter(x => x.playerId && v.allianceOf.get(x.playerId) === b.allianceId && online(ctx, x));
    const options = [];
    for (const x of members) {
      for (const a of (v.armiesOf.get(x.playerId) || [])) if (a.status === 'STATIONED' && a.targetBastionId === b.id && !a.claimedAt && soldiersOf(a.units) > 0) options.push({ b: x, army: a, sortie: true, p: powerOf(a.units) });
      for (const r of readyArmies(v, x, c => !c.isSieged)) {
        if (v.now + travelSec(r.army.units, r.city, b) * 1000 > fightAt - 120000) continue;
        options.push({ b: x, army: r.army, sortie: false, p: powerOf(r.army.units) });
      }
    }
    options.sort((p, q) => q.p - p.p);
    let sent = 0;
    for (const o of options) {
      if (budget.left <= 0 || sent >= 1 || (BREAKS.get(b.id) || 0) >= 1) break;
      if (o.p < need) { bump(memOf(o.b, v), 'bastionBreakTooWeak'); break; }
      const m = memOf(o.b, v);
      budget.left--;
      const r = await call(o.b, m, 'POST', `/api/bastion/${b.id}/send`, { armyId: o.army.id, mission: 'BREAK' });
      if (!r.ok) continue;
      o.army.status = 'ATTACKING';
      sent++; BREAKS.set(b.id, (BREAKS.get(b.id) || 0) + 1);
      bump(m, o.sortie ? 'bastionSorties' : 'bastionBreaks');
    }
  }
}
// armées qui peuvent sortir, y compris d'une ville assiégée (une sortie contre le camp est permise)
function readyArmiesAny(v, bot) {
  return readyArmies(v, bot);
}

// renforts : une attaque de siège marche sur une ville alliée (avant que le camp ne s'installe)
async function supports(ctx, v) {
  let left = 8;
  const seen = new Set();
  for (const x of v.incoming) {
    if (left <= 0) break;
    if (x.missionType !== 'ATTACK' || !x.targetCityId || seen.has(x.targetCityId)) continue;
    seen.add(x.targetCityId);
    const city = v.cityById.get(x.targetCityId);
    if (!city || city.isSieged) continue;
    const arrival = new Date(x.arrivalAt).getTime();
    const helpers = ctx.bots.filter(b => b.playerId && b.playerId !== city.playerId && online(ctx, b) && ['SAME', 'ALLY'].includes(v.rel(b.playerId, city.playerId)) && v.canAttack(b.playerId, x.ownerId));
    const options = [];
    for (const b of helpers) {
      for (const r of readyArmies(v, b, c => !c.isSieged)) {
        const d = dist(r.city, city);
        if (d > SUPPORT_RANGE || v.now + travelSec(r.army.units, r.city, city) * 1000 > arrival - 120000) continue;
        options.push({ b, r, d });
        break;   // une armée par joueur
      }
    }
    options.sort((p, q) => p.d - q.d);
    let sent = 0;
    for (const o of options.slice(0, 3)) {
      if (left <= 0 || sent >= 2) break;
      const m = memOf(o.b, v);
      left--;
      const r = await call(o.b, m, 'POST', `/api/army/${o.r.army.id}/support`, { targetCityId: city.id });
      if (!r.ok) continue;
      o.r.army.status = 'SUPPORTING';
      m.sup[o.r.army.id] = ctx.step;
      sent++;
      bump(m, 'supports');
    }
  }
}

// ---------- conseil de guerre : sièges des villes ennemies ----------
// bataille simulée avec la formule du jeu (mur bouclier), sur ce que les espions et les rapports ont vu
// Une vague lancée au pas s campe au tick s+1 (le camp commence à l'heure du tick) et combat au tick s+2 (12 h plus tard) ;
// les vies remontent de 1/48 par heure, au tick, avant les combats. `state` : l'état prévu au combat quand une vague de
// l'alliance doit combattre avant celle-ci ({ structure, troops } d'après la bataille simulée de cette vague).
const livesOfCity = (c) => (c.isCapital ? config.combat.fall.assaults.capital : config.combat.fall.assaults.secondary) + (config.combat.fall.extraAssaults[String(c.player?.faction || '').toUpperCase()] || 0);
const REGEN_STEP = (h) => h / config.combat.fall.regenHours;
function simulateSiege(v, target, intel, attackers, attackerFaction, state = null) {
  const wallLevel = intel?.wall?.level ?? wallLevelOf(target);
  const maxHp = intel?.wall?.maxHp || wallLevel * config.combat.wallHpPerLevel;
  const seen = Math.round((target.wallStructure ?? 1) * 10) / 10;   // la fumée sur la carte, par dixièmes
  const structure = state ? Math.min(1, state.structure) : Math.min(1, seen + (seen < 1 ? REGEN_STEP(2 * STEP_H) : 0));
  const defenders = scale(merge(state ? state.troops : (intel?.troops || [])), 1.3);
  const res = combat().resolveCombatDetailed(merge(attackers), defenders, wallLevel, 'a', 'd', null, null, attackerFaction, target.player?.faction || null, intel?.wall?.defBonus || 0, null, wallLevel > 0 ? { hp: maxHp * structure, maxHp } : null);
  // l'état de la ville après cette bataille, si elle est gagnée : une vie de moins, la garnison qui reste
  const n = livesOfCity(target);
  const after = Math.max(0, structure - 1 / n);
  const left = res.defenderFinalUnits.map(u => ({ unitKey: u.key, count: Math.round(u.remaining / 1.3) })).filter(u => u.count > 0);
  return { won: res.attackerWon, wallEnd: res.wallHpEnd, wallStart: res.wallHpStart, rounds: res.rounds.length, structure, after, fall: res.attackerWon && after <= 0.5 / n + 1e-9, left };
}

// un guerrier prêt : armée chez elle dans la capitale (où sont les engins), à portée de la cible
function siegeCandidates(ctx, v, g, target) {
  const out = [];
  for (const b of ctx.byGroup(g)) {
    if (!b.playerId || roleOf(b) !== 'warrior') continue;
    const cap = capitalIn(v, b.playerId);
    if (!cap || cap.isSieged) continue;
    const ready = readyArmies(v, b, c => c.id === cap.id)[0];
    if (!ready) continue;
    const gar = garrisonOf(v.armiesOf.get(b.playerId), cap);
    const eng = rows(gar?.units).filter(u => isSiege(u.unitKey));
    const units = merge(ready.army.units, eng);
    if (enginesOf(units) < 1) continue;
    const t = travelSec(units, cap, target);
    if (t > SIEGE_HOURS * 3600) continue;
    out.push({ b, army: ready.army, cap, eng, units, t });
  }
  return out.sort((p, q) => p.t - q.t);
}

function chooseTarget(ctx, v, g, alId, enemies, wm) {
  const caps = ctx.byGroup(g).filter(b => b.playerId && roleOf(b) === 'warrior').map(b => capitalIn(v, b.playerId)).filter(Boolean);
  if (caps.length < 2) return null;
  const bad = new Set(wm.bad || []);
  let best = null;
  for (const c of v.cities) {
    if (c.isWonder || bad.has(c.id) || !enemies.has(v.allianceOf.get(c.playerId))) continue;
    const near = caps.map(cp => dist(cp, c)).sort((a, b) => a - b);
    if (near.length < 2 || near[1] > 160) continue;   // deux guerriers au moins à portée
    const wallHp = wallLevelOf(c) * config.combat.wallHpPerLevel * (c.wallStructure ?? 1);
    const e = intelOf(alId, c.id);
    const def = e?.troops ? powerOf(e.troops) : 30000;
    const score = (c.isCapital ? 4 : 1) * (wallHp + 3000) * (def + 15000) * (1 + (near[0] + near[1]) / 200);
    if (!best || score < best.score) best = { c, score };
  }
  return best ? best.c : null;
}

async function council(ctx, v, S, g) {
  const alId = groupAlliance(ctx, v, g);
  if (!alId) return;
  const enemies = enemiesOf(v, alId);
  if (!enemies.size) return;
  const keeper = ctx.byGroup(g).find(b => b.playerId);
  if (!keeper) return;
  const wm = memOf(keeper, v);
  let camp = wm.camp;
  const tag = v.tagOf.get(alId);
  if (wm.foe && ctx.step % 4 === 0) wm.foe = Math.round(wm.foe * 0.97);
  if (camp) {
    const c = v.cityById.get(camp.c);
    const over = !c ? 'tombée' : !enemies.has(v.allianceOf.get(c.playerId)) ? 'plus ennemie' : ctx.step - camp.s > 40 ? 'trop longue' : camp.l >= 3 ? 'trop d\'échecs' : camp.idle > 24 ? 'trop forte' : null;
    if (over) {
      ctx.event('campaign_end', { alliance: tag, city: camp.n, why: over, waves: camp.w || 0, wins: camp.wn || 0, losses: camp.l || 0 });
      if (c && over !== 'tombée') { wm.bad = [...(wm.bad || []), camp.c].slice(-5); }
      wm.camp = camp = null;
      wm.nc = ctx.step + 4;
    }
  }
  if (!camp) {
    if ((wm.nc || 0) > ctx.step || v.day < 25) return;
    const c = chooseTarget(ctx, v, g, alId, enemies, wm);
    if (!c) { wm.nc = ctx.step + 8; return; }
    camp = wm.camp = { c: c.id, n: c.name, s: ctx.step, w: 0, wn: 0, l: 0, idle: 0, lw: -99 };
    ctx.event('campaign', { alliance: tag, city: c.name, owner: c.player?.name, capital: c.isCapital, wall: wallLevelOf(c) });
  }
  const target = v.cityById.get(camp.c);
  const intel = intelOf(alId, camp.c);
  // renseignements : défenses de moins de 24 h (rapport d'espion, ou le rapport de la dernière bataille)
  if (!intel || !intel.wall || ageH(v, intel.defAt) > 24 || ageH(v, intel.troopsAt) > 24) {
    if (S.left >= 3 && (camp.sq || -99) < ctx.step - 2) {
      const spies = ctx.byGroup(g).filter(b => b.playerId && b.mem.war?.sp > 0).map(b => ({ b, cap: capitalIn(v, b.playerId) })).filter(x => x.cap && !x.cap.isSieged).sort((p, q) => dist(p.cap, target) - dist(q.cap, target));
      for (const x of spies.slice(0, 2)) {
        const m = memOf(x.b, v);
        const B = { left: 2 };
        S.left -= 2;
        if (await sendSpy(x.b, ctx, v, m, B, x.cap, { cityId: camp.c, mission: 'DEFENSES' })) { camp.sq = ctx.step; camp.sb = x.b.name; break; }
      }
    }
    // le rapport de l'espion envoyé au pas précédent
    if (camp.sb && camp.sq < ctx.step && S.left > 0) {
      const sb = ctx.bots.find(b => b.name === camp.sb);
      if (sb) { S.left--; await readSpyReports(sb, ctx, v, memOf(sb, v)); }
      camp.sb = null;
    }
    camp.idle++;
    return;
  }
  // une vague par pas au plus : les vies remontent (une colonie retrouve une vie en 24 h, une capitale en 12 h), deux
  // victoires doivent se suivre de près (les vagues de deux pas voisins combattent à 6 h d'écart)
  if (ctx.step - (camp.lw ?? -99) < 1) return;
  // Une vague lancée au pas s combat au tick s+2. Une colonie ne tombe que si deux victoires se suivent de près (sa vie
  // perdue remonte en 24 h) : la vague lancée au pas précédent n'a pas encore combattu, la suivante (un tick plus tard)
  // vise l'état prévu après elle (une vie de moins, la garnison qui reste) ; les guerriers de l'alliance restent en ville
  // entre-temps (pas de raid), pour former cette seconde vague.
  const prev = camp.pw && camp.pw.s === ctx.step - 1 ? camp.pw : null;
  if (prev?.fall) return;   // la vague en route doit suffire à faire tomber la ville
  const state = prev ? { structure: Math.min(1, prev.after + REGEN_STEP(STEP_H)), troops: prev.left || [] } : null;
  const cands = siegeCandidates(ctx, v, g, target);
  // une vague doit gagner la bataille simulée et peser plus que la plus forte armée ennemie venue briser nos sièges
  // (apprise des rapports : wm.foe, qui s'oublie lentement)
  const foe = wm.foe || 0;
  const pick = (pool, need) => {
    const ch = []; let p = 0, sm = null;
    for (const c of pool.slice(0, WAVE_MAX)) {
      ch.push(c); p += powerOf(c.units);
      sm = simulateSiege(v, target, intel, ch.flatMap(x => x.units), ch[0].b.faction, state);
      if (sm.won && p >= need) return { ch, sim: sm, power: p };
    }
    return null;
  };
  const kind = prev ? 'followUp' : (target.wallStructure ?? 1) < 0.95 ? 'wounded' : 'main';
  const plan = pick(cands, (kind === 'main' ? 1.1 : 0.9) * foe);
  if (!plan) {
    camp.idle++;
    bump(wm, !cands.length ? 'waveNoArmy' : pick(cands, 0) ? 'waveFearBreak' : prev ? 'followUpTooWeak' : 'waveTooWeak');
    return;
  }
  if (!plan.sim.fall && cands.length > plan.ch.length) wm.muster = Math.max(wm.muster || 0, ctx.step + 2);
  const chosen = plan.ch, sim = plan.sim;
  // partir : les engins de la garnison montent dans l'armée, puis l'attaque (les camps arrivent au même tick)
  let launched = 0, eng = 0, sold = 0;
  for (const c of chosen) {
    if (S.left < 2) break;
    const m = memOf(c.b, v);
    let ok = true;
    for (const e of c.eng) {
      const cur = rows(c.army.units).find(u => u.unitKey === e.unitKey)?.count || 0;
      S.left--;
      const r = await call(c.b, m, 'POST', `/api/army/${c.army.id}/set-unit`, { unitKey: e.unitKey, count: cur + e.count });
      if (!r.ok) { ok = false; break; }
    }
    if (!ok) continue;
    S.left--;
    const r = await call(c.b, m, 'POST', `/api/army/${c.army.id}/attack`, { targetCityId: target.id });
    if (!r.ok) continue;
    c.army.status = 'ATTACKING';
    v.incoming.push({ id: c.army.id, ownerId: c.b.playerId, status: 'ATTACKING', missionType: 'ATTACK', targetCityId: target.id, arrivalAt: r.data?.arrivalAt || new Date(v.now + c.t * 1000) });
    launched++; eng += enginesOf(c.units); sold += soldiersOf(c.units);
    bump(m, 'siegeAttacks');
  }
  if (!launched) { camp.idle++; return; }
  camp.w = (camp.w || 0) + 1; camp.lw = ctx.step; camp.idle = 0;
  camp.pw = { s: ctx.step, after: Math.round(sim.after * 1000) / 1000, fall: sim.fall, left: sim.left.slice(0, 10) };
  if (prev) bump(wm, 'followUpWaves');
  ctx.event('siege_wave', { alliance: tag, city: target.name, owner: target.player?.name, capital: target.isCapital, wave: kind, armies: launched, power: Math.round(plan.power), foe, engines: eng, soldiers: sold, wall: sim.wallStart != null ? Math.round(sim.wallStart) : null, structure: Math.round(sim.structure * 100) / 100, predicted: sim.fall ? 'fall' : sim.won ? 'win' : 'loss' });
}

// ---------- le Bastion ennemi : rassemblement d'alliance ou siège seul, de loin en loin ----------
async function bastionOps(ctx, v, S, g) {
  const alId = groupAlliance(ctx, v, g);
  if (!alId || v.day < 30) return;
  const enemies = enemiesOf(v, alId);
  const eb = v.bastions.find(b => enemies.has(b.allianceId) && ['BUILDING', 'ACTIVE'].includes(b.status) && !b.isSieged);
  const keeper = ctx.byGroup(g).find(b => b.playerId);
  if (!eb || !keeper) return;
  const wm = memOf(keeper, v);
  // rassemblement annoncé : les guerriers gardent leur armée en ville pendant les deux pas qui précèdent (pas de raid)
  if ((wm.bo || 0) - ctx.step <= 2 && (wm.bo || 0) > ctx.step && (wm.bn || 0) % 2 === 0) wm.muster = wm.bo;
  if ((wm.bo || 0) > ctx.step || S.left < 4) return;
  if (v.incoming.some(x => x.targetBastionId === eb.id)) return;
  const tag = v.tagOf.get(alId), etag = v.tagOf.get(eb.allianceId);
  // les armées des membres, chez elles dans la capitale, engins de la garnison compris
  const parts = [];
  for (const b of ctx.byGroup(g)) {
    if (!b.playerId || v.allianceOf.get(b.playerId) !== alId) continue;
    const cap = capitalIn(v, b.playerId);
    if (!cap || cap.isSieged) continue;
    const ready = readyArmies(v, b, c => c.id === cap.id)[0];
    if (!ready) continue;
    const eng = rows(garrisonOf(v.armiesOf.get(b.playerId), cap)?.units).filter(u => isSiege(u.unitKey));
    parts.push({ b, cap, army: ready.army, eng, units: merge(ready.army.units, eng) });
  }
  const withEngines = parts.filter(p => enginesOf(p.units) > 0 && travelSec(p.units, p.cap, eb) < SIEGE_HOURS * 3600).sort((p, q) => dist(p.cap, eb) - dist(q.cap, eb));
  if (!withEngines.length) { wm.bo = ctx.step + 8; return; }
  const loadEngines = async (p, m) => {
    for (const e of p.eng) {
      const cur = rows(p.army.units).find(u => u.unitKey === e.unitKey)?.count || 0;
      S.left--;
      const r = await call(p.b, m, 'POST', `/api/army/${p.army.id}/set-unit`, { unitKey: e.unitKey, count: cur + e.count });
      if (!r.ok) return false;
    }
    return true;
  };
  // la même formule que l'assaut (mur bouclier du Bastion) : ce que la troupe ferait au mur
  const wallMax = config.combat.wallHpPerLevel * config.bastion.wallReferenceLevel * config.bastion.wallMultiplier;
  const estimate = (units, faction) => { const r = combat().resolveCombatDetailed(merge(units), [], config.bastion.wallReferenceLevel, 'a', 'b', null, null, faction, null, config.bastion.bonuses.garrisonDefensePct, null, { hp: wallMax, maxHp: wallMax }); return Math.round(wallMax - r.wallHpEnd); };
  const op = (wm.bn || 0) % 2 === 0 ? 'rally' : 'solo';
  wm.bn = (wm.bn || 0) + 1;
  wm.bo = ctx.step + BASTION_GAP;
  if (op === 'solo') {
    const p = withEngines.sort((a, b) => enginesOf(b.units) - enginesOf(a.units))[0];
    const m = memOf(p.b, v);
    if (!(await loadEngines(p, m))) return;
    S.left--;
    const r = await call(p.b, m, 'POST', `/api/bastion/${eb.id}/send`, { armyId: p.army.id, mission: 'ATTACK' });
    if (!r.ok) return;
    p.army.status = 'ATTACKING';
    bump(m, 'bastionSieges');
    ctx.event('bastion_siege', { alliance: tag, target: etag, by: p.b.name, engines: enginesOf(p.units), soldiers: soldiersOf(p.units), wallDamageEstimate: estimate(p.units, p.b.faction), wallHp: wallMax });
    return;
  }
  // rassemblement : le lanceur (la plus grande Place de rassemblement parmi les plus proches), attente 60 min
  // le lanceur : celui que le plus de membres peuvent rejoindre dans l'heure (puis la plus grande Place de rassemblement)
  const reach = (l) => parts.filter(p => p !== l && v.now + travelSec(rows(p.army.units), p.cap, l.cap) * 1000 < v.now + 50 * 60000).length;
  const leader = withEngines.slice(0, 8).map(l => ({ l, n: reach(l) })).sort((a, b) => (b.n - a.n) || (lvl(b.l.cap, 'RALLY_POINT') - lvl(a.l.cap, 'RALLY_POINT')))[0].l;
  const lm = memOf(leader.b, v);
  if (!(await loadEngines(leader, lm))) return;
  S.left--;
  const r = await call(leader.b, lm, 'POST', '/api/rallies', { armyId: leader.army.id, bastionId: eb.id, waitMinutes: 60 });
  if (!r.ok || !r.data?.rally?.id) return;
  leader.army.status = 'RALLY_WAIT';
  bump(lm, 'ralliesLed');
  const rally = r.data.rally;
  const launchAt = new Date(rally.launchAt).getTime();
  const capacity = rally.capacity || rallyCapacity(lvl(leader.cap, 'RALLY_POINT'));
  let joined = 1;
  const units = [...leader.units];
  for (const p of parts.filter(x => x !== leader).sort((a, b) => dist(a.cap, leader.cap) - dist(b.cap, leader.cap))) {
    if (joined >= capacity || S.left < 2 || joined >= 9) break;
    const late = (u) => v.now + travelSec(u, p.cap, leader.cap) * 1.3 * 1000 > launchAt - 5 * 60000;   // marge : la route contourne parfois bien plus le relief
    let go = merge(p.army.units, p.eng);
    const withEng = p.eng.length && !late(go);
    if (!withEng) { go = rows(p.army.units); if (late(go)) continue; }   // n'arriverait pas à temps
    const m = memOf(p.b, v);
    if (withEng && !(await loadEngines(p, m))) continue;
    S.left--;
    const j = await call(p.b, m, 'POST', `/api/rallies/${rally.id}/join`, { armyId: p.army.id });
    if (!j.ok) continue;
    p.army.status = 'RALLY_JOIN';
    joined++; units.push(...go);
    bump(m, 'ralliesJoined');
  }
  ctx.event('bastion_rally', { alliance: tag, target: etag, leader: leader.b.name, armies: joined, capacity, engines: enginesOf(units), soldiers: soldiersOf(units), wallDamageEstimate: estimate(units, leader.b.faction), wallHp: wallMax });
}

// ---------- issues des combats (rapports de bataille), événements et renseignements ----------
let SCAN_AT = null;
const FALLEN = new Set();
async function bookkeeping(ctx, v) {
  const since = new Date(SCAN_AT ?? v.now - 6 * 3600000);
  SCAN_AT = v.now;
  const reps = await ctx.prisma.battleReport.findMany({ where: { createdAt: { gt: since } }, select: { id: true, playerId: true, attackerId: true, defenderId: true, result: true, winner: true, loot: true, rounds: true, x: true, y: true, createdAt: true, defenderUnits: true, defenderLosses: true } });
  const K = stats(ctx);
  const seen = new Set();
  for (const r of reps) {
    if (r.playerId !== r.attackerId) continue;   // l'exemplaire de l'attaquant
    const type = r.loot?.type || r.rounds?.type || null;
    if (!['ATTACK', 'RAID', 'SIEGE_BREAK', 'BASTION'].includes(type)) continue;
    const dkey = `${type}:${r.x}:${r.y}:${new Date(r.createdAt).getTime()}`;
    const won = r.winner === 'ATTACKER';
    const atkAl = v.allianceOf.get(r.attackerId) || null;
    if (seen.has(dkey)) continue;
    seen.add(dkey);
    K[`${type}_${won ? 'won' : 'lost'}`] = (K[`${type}_${won ? 'won' : 'lost'}`] || 0) + 1;
    const who = v.botOf.get(r.attackerId)?.name || r.loot?.attackerName;
    if (type === 'RAID' && won) K.raidLoot = (K.raidLoot || 0) + RES.reduce((t, k) => t + (Number(r.loot?.[k]) || 0), 0);
    if (type === 'ATTACK') {
      const cityId = r.loot?.cityId;
      // la bataille renseigne aussi : la garnison qui reste, les vies du mur
      if (atkAl && cityId) {
        const e = intelSet(atkAl, cityId);
        const final = r.defenderLosses?.units || [];
        e.troops = final.map(u => ({ unitKey: u.key, count: u.remaining ?? 0 })).filter(u => u.count > 0);
        e.troopsAt = new Date(r.createdAt).getTime();
        const lives = r.loot?.lives;
        if (e.wall && lives && lives.total) { e.wall.structure = lives.after / lives.total; e.defAt = e.troopsAt; }
      }
      for (const g of ['A', 'B']) {
        const keeper = ctx.byGroup(g).find(b => b.playerId);
        const camp = keeper?.mem?.war?.camp;
        if (camp && camp.c === cityId && groupAlliance(ctx, v, g) === atkAl) { if (won) camp.wn = (camp.wn || 0) + 1; else camp.l = (camp.l || 0) + 1; }
      }
      if (r.loot?.lives?.fallen && cityId && !FALLEN.has(cityId)) {
        FALLEN.add(cityId);
        ctx.event('city_fallen', { city: r.loot.cityName, owner: r.loot.defenderName, by: r.loot.attackerName, camps: r.loot.camps || 1, fate: r.loot.lives.fate, lives: r.loot.lives.total, wallBroken: !!r.loot.wallBroken });
        K.cityFallen = (K.cityFallen || 0) + 1;
      }
    }
    if (type === 'SIEGE_BREAK' && won) {
      // le conseil de l'alliance dont le camp a été chassé retient la force de l'armée qui l'a battu
      const campAl = v.allianceOf.get(r.defenderId);
      for (const g of ['A', 'B']) {
        const keeper = ctx.byGroup(g).find(b => b.playerId);
        if (keeper?.mem?.war && campAl && r.rounds?.cityId && groupAlliance(ctx, v, g) === campAl) keeper.mem.war.foe = Math.max(keeper.mem.war.foe || 0, Number(r.loot?.attackerPower) || 0);
      }
    }
    if (type === 'SIEGE_BREAK' && won) ctx.event('siege_broken', { by: who, where: r.loot?.cityName, camp: r.loot?.defenderName, attackerPower: r.loot?.attackerPower, campPower: r.loot?.defenderPower });
    if (type === 'BASTION') {
      ctx.event('bastion_assault', { by: r.loot?.attackerName, bastion: r.loot?.defenderName, won, wallHpStart: r.loot?.wallHpStart, wallHpEnd: r.loot?.wallHpEnd, lives: r.loot?.lives ? `${r.loot.lives.after}/${r.loot.lives.total}` : null });
      if (r.loot?.lives?.fallen) ctx.event('bastion_destroyed', { by: r.loot?.attackerName, bastion: r.loot?.defenderName });
    }
  }
}

// ---------- point d'étape ----------
const stats = (ctx) => (ctx.bots[0].mem.warStats ||= {});   // issues des combats, gardées avec l'état de la simulation
async function summary(ctx, v) {
  const k = {};
  for (const b of ctx.bots) for (const [key, n] of Object.entries(b.mem.war?.k || {})) if (typeof n === 'number' && key !== 'ostDay') k[key] = (k[key] || 0) + n;
  let db = {};
  try {
    const q = (sql) => ctx.prisma.$queryRawUnsafe(sql);
    const one = async (sql) => Number((await q(sql))[0]?.n || 0);
    db = {
      battles: (await q(`SELECT coalesce(loot->>'type', rounds->>'type') AS t, winner, count(*)::int AS n FROM "BattleReport" WHERE "playerId" = "attackerId" AND coalesce(loot->>'type', rounds->>'type') IN ('ATTACK','RAID','SIEGE_BREAK','BASTION') GROUP BY 1, 2 ORDER BY 1, 2`)).map(r => `${r.t}:${r.winner === 'ATTACKER' ? 'W' : 'L'} ${r.n}`).join(', '),
      spies: await one(`SELECT count(*)::int AS n FROM "Spy"`),
      spyReports: await one(`SELECT count(*)::int AS n FROM "SpyReport" WHERE "targetType" = 'CITY'`),
      spyAlerts: await one(`SELECT count(*)::int AS n FROM "SpyReport" WHERE "targetType" = 'SPY_ALERT'`),
      engines: await one(`SELECT coalesce(sum(u.count), 0)::int AS n FROM "ArmyUnit" u WHERE u."unitKey" LIKE '%SIEGE%'`),
      sieged: await one(`SELECT count(*)::int AS n FROM "City" WHERE "isSieged"`),
      supportsStationed: await one(`SELECT count(*)::int AS n FROM "Army" WHERE status = 'STATIONED' AND "targetCityId" IS NOT NULL`),
      rallies: (await q(`SELECT status, count(*)::int AS n FROM "Rally" WHERE "targetBastionId" IS NOT NULL GROUP BY 1`)).map(r => `${r.status} ${r.n}`).join(', '),
      colonies: await one(`SELECT count(*)::int AS n FROM "City" WHERE NOT "isCapital" AND NOT "isWonder"`),
      livesLost: await one(`SELECT count(*)::int AS n FROM "City" WHERE "wallStructure" < 0.999`),
      bastions: (await q(`SELECT b.status, a.tag FROM "Bastion" b JOIN "Alliance" a ON a.id = b."allianceId"`)).map(r => `${r.tag}:${r.status}`).join(' ')
    };
  } catch (e) { db = { error: e.message }; }
  const refusals = [...REFUSALS.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([r, n]) => `${n}× ${r}`);
  ctx.event('war_summary', { step: ctx.step, day: v.day, ...db, counters: { ...k, ...stats(ctx) }, refusals, errors: ERRORS.n, firstError: ERRORS.first });
  ctx.say(`guerre : ${JSON.stringify({ day: v.day, battles: db.battles, calls: k.calls || 0, ok: k.ok || 0, refused: k.refused || 0, raids: k.raids || 0, sieges: k.siegeAttacks || 0, breaks: (k.breakSieges || 0) + (k.sorties || 0), supports: k.supports || 0, spies: db.spies, spyReports: db.spyReports, falls: stats(ctx).cityFallen || 0, engines: db.engines, rallies: db.rallies, errors: ERRORS.n, msPerStep: TIME.steps ? Math.round((TIME.act + TIME.after + TIME.early) / TIME.steps) : 0 })}`);
  TIME.act = TIME.after = TIME.early = 0; TIME.steps = 0;
}

// ---------- début du tour (fichier 07-war-early.cjs, avant l'économie) : engins, et l'Atelier jusqu'au niveau 5 ----------
// (les engins de siège s'y forment ; le plan de l'économie ne le monte qu'à 3 avant le Bâtiment principal 16)
async function early(bot, ctx) {
  if (!bot.me || !bot.capital) return;
  const role = roleOf(bot);
  if (role === 'warrior' || role === 'raider') { try { if (await rallyPoint(bot, ctx)) return; } catch (e) { fail(ctx, `rally point ${bot.name}`, e); } }
  if (role !== 'warrior') return;
  try {
    const v = await snapshot(ctx);
    if (v.ended) return;
    await engineTurn(bot, ctx, v, memOf(bot, v), { left: 2 }, bot.capital);   // les engins avant que l'économie ne dépense tout
  } catch (e) { fail(ctx, `engines ${bot.name}`, e); }
  await workshop(bot, ctx);
}
// la Place de rassemblement d'un niveau quand l'Ost n'a pas de place (niveau 5 : 2 armées, 10 : 3, 15 : 4)
async function rallyPoint(bot, ctx) {
  const m = bot.mem.war;
  const cap = bot.capital;
  if (!m || m.ost || m.noSlot === undefined || ctx.step - m.noSlot > 4) return false;
  const hall = lvl(cap, 'MAIN_HALL');
  const cur = Math.max(lvl(cap, 'RALLY_POINT'), queuedLvl(cap, 'RALLY_POINT'));
  const queue = cap.buildQueue || [];
  if (!cur || cur >= 15 || cur + 1 > hall || queue.length >= MAX_QUEUE || queue.some(q => q.buildingKey === 'RALLY_POINT')) return false;
  const c = Stock.buildCost('RALLY_POINT', cur + 1);
  if (!Stock.canPay(bot, c, { margin: 1.1 })) return false;
  const r = await call(bot, m, 'POST', `/api/cities/${cap.id}/build`, { buildingKey: 'RALLY_POINT' });
  if (!r.ok) return false;
  Stock.spend(bot, cap, r.data?.cost || c);
  queue.push({ buildingKey: 'RALLY_POINT', targetLevel: cur + 1, slot: r.data?.queueItem?.slot ?? null });
  cap.buildQueue = queue;
  bump(m, 'rallyPointLevels');
  return true;
}
async function workshop(bot, ctx) {
  const cap = bot.capital;
  const hall = lvl(cap, 'MAIN_HALL');
  if (hall < 10) return;
  const cur = Math.max(lvl(cap, 'WORKSHOP'), queuedLvl(cap, 'WORKSHOP'));
  const queue = cap.buildQueue || [];
  if (cur >= config.recruit.siegeWorkshopLevel || cur + 1 > hall || queue.length >= MAX_QUEUE || queue.some(q => q.buildingKey === 'WORKSHOP')) return;
  if (cur === 0) {
    // un nouveau bâtiment : ses prérequis et une place libre autour du Bâtiment principal
    const def = buildingsData.find(b => b.key === 'WORKSHOP');
    if (!(def?.prereq || []).every(p => lvl(cap, p.key) >= p.level)) return;
    const used = new Set([...(cap.buildings || []).map(b => b.slot), ...queue.map(q => q.slot)]);
    let free = 0;
    for (let s = 1; s <= config.city.maxSlot; s++) if (!used.has(s)) free++;
    if (!free) return;
  }
  const c = Stock.buildCost('WORKSHOP', cur + 1);
  if (!Stock.canPay(bot, c, { margin: 1.15 })) return;
  let v;
  try { v = await snapshot(ctx); } catch (e) { fail(ctx, 'snapshot', e); return; }
  if (v.ended) return;
  const m = memOf(bot, v);
  const r = await call(bot, m, 'POST', `/api/cities/${cap.id}/build`, { buildingKey: 'WORKSHOP' });
  if (!r.ok) return;
  Stock.spend(bot, cap, r.data?.cost || c);
  queue.push({ buildingKey: 'WORKSHOP', targetLevel: cur + 1, slot: r.data?.queueItem?.slot ?? null });
  cap.buildQueue = queue;
  bump(m, 'workshopLevels');
}

// ---------- module ----------
let EARLY = -1;
const TIME = { act: 0, after: 0, early: 0, steps: 0 };   // temps passé dans le module (ms), appels HTTP compris
function fail(ctx, where, e) {
  ERRORS.n++;
  if (!ERRORS.first) ERRORS.first = `${where}: ${e?.stack?.split('\n').slice(0, 3).join(' | ') || e}`;
  if (ERRORS.n <= 5) ctx.say(`guerre : erreur ${where} : ${e?.message || e}`);
}

module.exports = {
  name: 'war',
  roleOf,
  async early(bot, ctx) { const t0 = performance.now(); try { await early(bot, ctx); } finally { TIME.early += performance.now() - t0; } },
  async act(bot, ctx) { const t0 = performance.now(); try { await act(bot, ctx); } finally { TIME.act += performance.now() - t0; } },
  async afterStep(ctx) { const t0 = performance.now(); TIME.steps++; try { await afterStep(ctx); } finally { TIME.after += performance.now() - t0; } }
};
async function act(bot, ctx) {
  {
    let v;
    try { v = await snapshot(ctx); } catch (e) { fail(ctx, 'snapshot', e); return; }
    if (v.ended) return;
    // premier tour du pas : les alertes de siège de tous les joueurs (notifications reçues juste après le tick)
    if (EARLY !== ctx.step) { EARLY = ctx.step; BREAKS.clear(); try { await alerts(ctx, v); } catch (e) { fail(ctx, 'alerts', e); } }
    if (!bot.me || !bot.cities?.length || !bot.capital || !Array.isArray(bot.armies)) return;
    const m = memOf(bot, v);
    const B = { left: CALLS };
    const cap = bot.capital;
    try {
      await recallTurn(bot, ctx, v, m, B);
      await ostTurn(bot, ctx, v, m, B, cap);
      await spyTurn(bot, ctx, v, m, B, cap);
      await raidTurn(bot, ctx, v, m, B, cap);
    } catch (e) { fail(ctx, `act ${bot.name}`, e); }
  }
}
async function afterStep(ctx) {
  {
    let v;
    try { v = await snapshot(ctx, true); } catch (e) { fail(ctx, 'snapshot', e); return; }
    if (v.ended) return;
    STEP_H = ctx.OPT.stepHours || 6;
    const S = { left: STEP_CALLS };
    // les rapports de bataille du tick d'abord : le conseil décide sur la garnison qui reste et les vies perdues
    try { await bookkeeping(ctx, v); } catch (e) { fail(ctx, 'bookkeeping', e); }
    for (const g of ['A', 'B']) { try { await council(ctx, v, S, g); } catch (e) { fail(ctx, `council ${g}`, e); } }
    for (const g of ['A', 'B']) { try { await bastionOps(ctx, v, S, g); } catch (e) { fail(ctx, `bastion ${g}`, e); } }
    try { await supports(ctx, v); } catch (e) { fail(ctx, 'supports', e); }
    const total = Math.round(ctx.OPT.days * 24 / ctx.OPT.stepHours);
    if (ctx.step % 28 === 0 || ctx.step === total) { try { await summary(ctx, v); } catch (e) { fail(ctx, 'summary', e); } }
  }
}
