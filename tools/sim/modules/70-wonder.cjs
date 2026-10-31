// Simulation longue — Merveille (décision du 28 octobre 2026, services/wonderService.js, services/rallyService.js).
// Rapport de vérification du 31 octobre 2026 (§ 6.8 et § 6.9) : la fin de partie n'avait pas été jouée par les joueurs
// automatiques. Les deux grandes alliances (groupes A et B) la jouent ici :
// - Colon : avant le jour des sites (config.world.wonderSitesDay), le « fondateur » de l'alliance (le membre dont la
//   capitale est la plus proche du centre, ses colonies fondées) forme un colon à la Résidence (POST
//   /api/cities/:id/settlers) : celui de la Ville Merveille, hors du compte des colonies.
// - Sites : le conseil de l'alliance (après le tour de tous les joueurs) lance un rassemblement d'alliance contre les
//   Immortels du site le plus proche de ses membres (POST /api/rallies { nodeId }) ; chaque membre y envoie une armée remplie
//   depuis la garnison de sa capitale (POST /api/rallies/:id/join) ; l'attente laisse arriver les membres éloignés (la plus
//   courte des attentes permises, jusqu'à 180 min). Les Immortels gardent leurs pertes : un rassemblement qui pèse 60 % de
//   leur force part aussi les user. Site libéré (24 h) : le fondateur y envoie son colon avec une escorte (POST
//   /api/army/:id/found-city) ; la Ville Merveille est fondée 24 h après l'arrivée.
// - Plans : dès qu'ils apparaissent (config.world.wonderPlansDay), même rassemblement contre le plan le plus proche, tant que
//   l'alliance n'en détient aucun (au-delà du niveau config.world.planNeededAbove, il en faut un) ; le plan va au lanceur.
// - Livraisons : chaque membre, à son tour, envoie une armée de transport de sa capitale vers la Ville Merveille avec ce que
//   sa capitale a en trop (POST /api/trade/send, aussi vers la sienne : la Ville Merveille reçoit tout, sans plafond) ; le
//   propriétaire lance chaque niveau dès que le stock du chantier le paie (POST /api/wonder/:cityId/build), aussi à la
//   notification de fin de niveau.
// - Défense : une vague d'Immortels frappe toutes les 12 h (config.world.immortalWaveBase × niveau^immortalWaveExp). Quand
//   les défenseurs postés pèsent moins que la vague suivante (marge 1,25), les membres envoient une « Garde de la Merveille »
//   (rôle wonder de ../armies.cjs ; sans place, l'Ost d'un guerrier) remplie depuis leur garnison : en renfort (POST
//   /api/army/:id/support), ou déplacée (POST /api/army/:id/move) par le propriétaire, dont c'est la ville.
// - Suivi : sites pris, plans, niveaux, livraisons par armée, vagues tenues ou perdues (events.jsonl, point d'étape).
// Au plus 6 appels par joueur et par tour, 120 par pas pour le conseil.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { unitsData } = require(path.join(ROOT, 'src/config/gamedata'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const WS = require(path.join(ROOT, 'src/services/wonderService'));   // formules pures : coût d'un niveau, force d'une vague
const Stock = require('../stock.cjs');
const Armies = require('../armies.cjs');
const market = require('./40-market.cjs');   // les armées que le joueur fait partir pour un aller-retour

const W = config.world;
const RES = ['wood', 'stone', 'iron', 'food'];
const STOCK = { wood: 'wonderWood', stone: 'wonderStone', iron: 'wonderIron', food: 'wonderFood' };
const UNIT = Object.fromEntries(unitsData.map(u => [u.key, u]));
const TIER = config.combat.tierCoefficients;
const GROUPS = ['A', 'B'];       // les alliances assez grandes pour la fin de partie (15 à 20 membres)
const CALLS = 6;
const COUNCIL_CALLS = 120;
const WAITS = config.rally.waitMinutes;
const MAX_WAIT_S = Math.max(...WAITS) * 60;
const ATTRITION = 0.6;           // un rassemblement qui pèse 60 % des Immortels part les user (ils gardent leurs pertes)
const FILL_SHARE = 0.8;          // part de chaque troupe de la garnison qu'un membre met dans l'armée du rassemblement
const KEEP_STOCK = 0.3;          // part du stockage de la capitale gardée pour bâtir quand on livre la Merveille
const DEFENSE_MARGIN = 1.25;     // défenseurs voulus face à la vague suivante
const GUARD_SHARE = 0.6;         // part des soldats de la garnison que prend la garde de la Merveille
const NOTIF_ODDS = (wait) => (wait >= 120 ? 0.8 : 0.6);   // un membre qui ne joue pas ce pas-ci voit la notification à temps
// armées d'un autre rôle, jamais prises pour un rassemblement ni pour escorter le colon
const ESCORT_NEVER = new Set([Armies.NAMES.guard, Armies.NAMES.wonder, Armies.NAMES.convoy]);
const RALLY_NEVER = new Set([Armies.NAMES.guard, Armies.NAMES.wonder, Armies.NAMES.caravan, Armies.NAMES.convoy]);

// ---------- petites aides ----------
const lvl = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const isSiege = (k) => UNIT[k]?.class === 'SIEGE';
const fighters = (units) => (units || []).filter(u => (u.count || 0) > 0 && UNIT[u.unitKey] && !isSiege(u.unitKey));
const soldiers = (units) => fighters(units).reduce((t, u) => t + u.count, 0);
const powerOf = (units) => fighters(units).reduce((t, u) => t + ((UNIT[u.unitKey].stats?.attack || 0) + (UNIT[u.unitKey].stats?.defense || 0)) * (TIER[u.tier || UNIT[u.unitKey].tier] || 1) * u.count, 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const minSpeed = (units) => Math.min(100, ...fighters(units).map(u => UNIT[u.unitKey].stats?.speed || 50));
// durée de marche estimée (s) : la route contourne le relief (× 1,25), sans les bonus de vitesse (prudent)
const travelSec = (units, a, b) => dist(a, b) * 1.25 * 30 * 50 / Math.max(1, minSpeed(units));
const online = (ctx, b) => !!b.mem?.alwaysOn || (ctx.step + (b.turn || 0)) % 2 === 0;
const capOf = (city, r) => Math.max(1, (r === 'food' ? city.maxFoodStorage : city.maxStorage) || 1);
const ms = (d) => (d ? new Date(d).getTime() : 0);
const bump = (k, key, n = 1) => { k[key] = (k[key] || 0) + n; };

// ---------- ce que les joueurs voient (la carte, l'écran « Monde »), lu une fois par pas ----------
let SNAP = { step: -1 };
async function snapshot(ctx) {
  if (SNAP.step === ctx.step) return SNAP;
  const P = ctx.prisma;
  const wc = await P.worldConfig.findUnique({ where: { id: 1 }, select: { number: true, endedAt: true, readyAt: true, createdAt: true, sitesSpawnedAt: true, plansSpawnedAt: true, wonderSitesDay: true } }).catch(() => null);
  const now = ctx.clock.now();
  const s = { step: ctx.step, number: wc?.number || 1, ended: !wc || !!wc.endedAt, now, day: Math.floor((now - ms(wc?.readyAt || wc?.createdAt || now)) / 86400000) + 1, sitesDay: wc?.wonderSitesDay ?? W.wonderSitesDay, sitesOpen: !!wc?.sitesSpawnedAt, plansOpen: !!wc?.plansSpawnedAt };
  if (!s.ended && (s.sitesOpen || s.day >= s.sitesDay - 12)) {
    const [nodes, wonders, plans, members, rallies] = await Promise.all([
      P.resourceNode.findMany({ where: { resourceType: { in: ['WONDER', 'PLAN'] } }, select: { id: true, x: true, y: true, resourceType: true, hasDefenders: true, defenderPower: true, cityId: true, lastDefeat: true, hasPlayerArmy: true } }),
      P.city.findMany({ where: { isWonder: true }, select: { id: true, name: true, x: true, y: true, playerId: true, wonderLevel: true, wonderBuildEndsAt: true, wonderWood: true, wonderStone: true, wonderIron: true, wonderFood: true } }),
      P.wonderPlan.findMany({ where: { holderId: { not: null } }, select: { holderId: true } }),
      P.allianceMember.findMany({ select: { playerId: true, allianceId: true, alliance: { select: { tag: true } } } }),
      P.rally.findMany({ where: { targetKind: { in: ['WONDER', 'PLAN'] }, status: { in: ['GATHERING', 'MARCHING'] } }, select: { id: true, allianceId: true, targetNodeId: true, targetKind: true } })
    ]);
    s.sites = nodes.filter(n => n.resourceType === 'WONDER');
    s.plans = nodes.filter(n => n.resourceType === 'PLAN');
    s.wonders = wonders;
    s.allianceOf = new Map(members.map(m => [m.playerId, m.allianceId]));
    s.tagOf = new Map(members.map(m => [m.allianceId, m.alliance?.tag || '?']));
    s.planAlliances = new Set(plans.map(p => s.allianceOf.get(p.holderId)).filter(Boolean));
    s.rallies = rallies;
    // défenseurs de chaque Ville Merveille, comme le combat d'une vague : les armées de son propriétaire au repos dans la
    // ville et les renforts alliés postés ; celles en route vers elle comptent déjà
    s.defense = new Map();
    if (wonders.length) {
      const guards = await P.army.findMany({ where: { isGarrison: false, OR: wonders.flatMap(c => [
        { ownerId: c.playerId, x: c.x, y: c.y, status: 'IDLE', cityId: { not: c.id } },
        { ownerId: c.playerId, targetX: c.x, targetY: c.y, status: 'MOVING' },
        { targetCityId: c.id, status: { in: ['STATIONED', 'SUPPORTING'] } }
      ]) }, select: { id: true, ownerId: true, x: true, y: true, targetX: true, targetY: true, targetCityId: true, status: true, units: { select: { unitKey: true, count: true, tier: true } } } });
      for (const c of wonders) {
        const here = guards.filter(a => a.targetCityId === c.id || (a.ownerId === c.playerId && ((a.x === c.x && a.y === c.y && a.status === 'IDLE') || (a.targetX === c.x && a.targetY === c.y && a.status === 'MOVING'))));
        s.defense.set(c.id, { armies: here.length, power: here.reduce((t, a) => t + powerOf(a.units), 0) });
      }
    }
  }
  SNAP = s;
  return s;
}
const wonderOf = (s, allianceId) => (s.wonders || []).find(c => s.allianceOf.get(c.playerId) === allianceId) || null;
// la force de la prochaine vague contre une Merveille de ce niveau (elle peut monter d'un niveau d'ici là)
const waveNeed = (level) => WS.wavePower(Math.max(1, level + 1)) * DEFENSE_MARGIN;

// ---------- mémoire : celle du joueur, et celle de l'alliance (gardée par le premier joueur du groupe) ----------
function memOf(bot, s) {
  if (!bot.mem.won || bot.mem.won.w !== s.number) bot.mem.won = { w: s.number, k: {} };
  return bot.mem.won;
}
function allianceState(ctx, g, s) {
  const keeper = ctx.byGroup(g).find(b => b.playerId);
  if (!keeper) return null;
  if (!keeper.mem.wonA || keeper.mem.wonA.w !== s.number) keeper.mem.wonA = { w: s.number, margin: 1.1, rallies: {}, k: {} };
  return keeper.mem.wonA;
}
// l'alliance d'un groupe : celle où sont la plupart de ses joueurs
function groupAlliance(ctx, s, g) {
  const n = new Map();
  for (const b of ctx.byGroup(g)) { const a = b.playerId && s.allianceOf?.get(b.playerId); if (a) n.set(a, (n.get(a) || 0) + 1); }
  let best = null;
  for (const [id, k] of n) if (!best || k > best.k) best = { id, k };
  return best?.id || null;
}

// le fondateur : le membre dont la capitale est la plus proche du centre, ses colonies fondées (sa Résidence lui donne un
// colon de plus pour la Ville Merveille) ; celui d'avant reste tant qu'il peut
function founderOf(ctx, s, g, as, allianceId) {
  const ready = (b) => b.playerId && s.allianceOf.get(b.playerId) === allianceId && b.capital && lvl(b.capital, 'RESIDENCE') >= 10 &&
    Armies.colonies(b).length >= Math.min(config.city.maxSecondaryCities, fx.settlerSlots(lvl(b.capital, 'RESIDENCE')));
  const cur = ctx.bots.find(b => b.playerId === as.founder);
  if (cur && (ready(cur) || (cur.capital?.settlers || 0) > 0)) return cur;
  const best = ctx.byGroup(g).filter(ready).sort((a, b) => dist(a.capital, { x: 0, y: 0 }) - dist(b.capital, { x: 0, y: 0 }))[0] || null;
  as.founder = best?.playerId || null;
  return best;
}

// ---------- tour du fondateur : le colon, puis la fondation sur le site libéré ----------
async function settlerTurn(bot, ctx, B, m) {
  const cap = bot.capital;
  if (B.left <= 0 || cap.isSieged || (cap.settlers || 0) > 0) return;
  if ((cap.recruitQueue || []).some(q => q.unitKey === 'SETTLER') || bot.armies.some(a => (a.settlers || 0) > 0)) return;
  if (!Stock.canPay(bot, fx.settlerCost())) { bump(m.k, 'settlerWaitRes'); return; }
  B.left--;
  const r = await bot.post(`/api/cities/${cap.id}/settlers`);
  if (!r.ok) { bump(m.k, 'settlerRefused'); return; }
  (cap.recruitQueue ||= []).push({ unitKey: 'SETTLER', count: 1, buildingKey: 'RESIDENCE' });
  bump(m.k, 'settlers');
  ctx.event('wonder_settler', { bot: bot.name, day: SNAP.day });
}
// un site libéré par les Immortels (24 h avant leur retour), sans ville ni fondation : le plus proche de la capitale
const freeSite = (s, cap) => (s.sites || []).filter(n => !n.hasDefenders && !n.cityId && !n.hasPlayerArmy && n.lastDefeat && s.now - ms(n.lastDefeat) < 22 * 3600000)
  .sort((a, b) => dist(a, cap) - dist(b, cap))[0] || null;
async function foundTurn(bot, ctx, B, m, s) {
  const cap = bot.capital;
  if (B.left <= 0 || cap.isSieged || !((cap.settlers || 0) > 0)) return false;
  const site = freeSite(s, cap);
  if (!site) return false;
  // le colon part avec les 3 000 de chaque ressource de la fondation (stock de toutes les villes, la capitale d'abord)
  if (!Stock.canPay(bot, config.city.foundationTransport)) { bump(m.k, 'foundWaitRes'); return false; }
  // l'escorte du colon : une armée au repos dans la capitale (la plus petite), qui rentre après la fondation ; jamais une
  // garde (colonie, Ville Merveille) ni le convoi du Bastion, qui ont leur rôle
  const escort = bot.armies.filter(a => Armies.atHome(a, cap) && soldiers(a.units) > 0 && !ESCORT_NEVER.has(a.name)).sort((a, b) => soldiers(a.units) - soldiers(b.units))[0];
  if (!escort) { bump(m.k, 'founderNoEscort'); return false; }
  B.left--;
  const r = await bot.post(`/api/army/${escort.id}/found-city`, { resourceNodeId: site.id });
  if (!r.ok) { bump(m.k, 'foundRefused'); return false; }
  escort.status = 'MOVING'; escort.settlers = 1;
  cap.settlers = Math.max(0, (cap.settlers || 0) - 1);
  Stock.spend(bot, cap, config.city.foundationTransport);
  site.hasPlayerArmy = true;
  bump(m.k, 'foundSent');
  ctx.event('wonder_found_sent', { bot: bot.name, x: site.x, y: site.y, arrivalAt: r.data?.arrivalAt || null });
  return true;
}

// ---------- tour du propriétaire : le niveau suivant ----------
async function buildTurn(bot, ctx, B, m, wc) {
  if (B.left < 2 || wc.wonderBuildEndsAt || wc.playerId !== bot.playerId) return;
  const next = WS.levelCost(wc.wonderLevel + 1);
  if (RES.some(r => (wc[STOCK[r]] || 0) < next[r])) { bump(m.k, 'buildWaitStock'); return; }
  B.left--;
  const v = await bot.get(`/api/wonder/${wc.id}`);
  if (!v.ok || !v.data?.next || v.data.buildEndsAt) return;
  if (v.data.next.needsPlan && !v.data.hasPlan) { bump(m.k, 'buildWaitPlan'); return; }
  if (RES.some(r => (v.data.stock?.[r] || 0) < (v.data.next.cost?.[r] || 0))) { bump(m.k, 'buildWaitStock'); return; }
  B.left--;
  const r = await bot.post(`/api/wonder/${wc.id}/build`);
  if (!r.ok) { bump(m.k, 'buildRefused'); return; }
  wc.wonderBuildEndsAt = new Date(ctx.clock.now() + (r.data?.seconds || 3600) * 1000);
  for (const res of RES) wc[STOCK[res]] = (wc[STOCK[res]] || 0) - (v.data.next.cost?.[res] || 0);
  bump(m.k, 'levelsStarted');
}

// ---------- livraisons : une armée de transport de la capitale vers la Ville Merveille ----------
// ce que la capitale a en trop (elle garde de quoi bâtir), réparti comme le coût d'un niveau (le bois, la pierre et le fer
// pèsent autant, la nourriture un peu moins)
function deliveryLoad(bot, cap, capacity, level) {
  const cost = WS.levelCost(level + 1);
  const hungry = (Stock.foodBalance(bot)?.net ?? 1) < 0;
  const spare = Object.fromEntries(RES.map(r => [r, Math.max(0, Math.floor((cap[r] || 0) - capOf(cap, r) * (r === 'food' && hungry ? 0.6 : KEEP_STOCK)))]));
  const sum = RES.reduce((t, r) => t + cost[r], 0);
  const load = Object.fromEntries(RES.map(r => [r, Math.min(spare[r], Math.floor(capacity * cost[r] / sum))]));
  // la place laissée par une ressource qui manque va aux autres
  let room = capacity - RES.reduce((t, r) => t + load[r], 0);
  for (const r of RES) { if (room <= 0) break; const add = Math.min(room, spare[r] - load[r]); if (add > 0) { load[r] += add; room -= add; } }
  return Object.fromEntries(RES.map(r => [r, Math.max(0, Math.floor(load[r] / 10) * 10)]));
}
async function deliverTurn(bot, ctx, B, m, wc) {
  const cap = bot.capital;
  if (B.left < 2 || cap.isSieged || !lvl(cap, 'MARKET')) return;
  B.left--;
  const st = await bot.get(`/api/market/state?cityId=${cap.id}`);
  if (!st.ok || !Array.isArray(st.data?.armies)) return;
  // la plus grande armée libre que le joueur peut faire partir (caravane, convoi d'alliance, armée de campagne)
  const army = market.tripArmies(bot, st.data.armies).sort((a, b) => b.capacity - a.capacity)[0];
  if (!army || army.capacity < 2000) { bump(m.k, 'deliverNoArmy'); return; }
  const load = deliveryLoad(bot, cap, army.capacity, wc.wonderLevel);
  const total = RES.reduce((t, r) => t + load[r], 0);
  if (total < 1000) { bump(m.k, 'deliverNothing'); return; }
  B.left--;
  const r = await bot.post('/api/trade/send', { fromCityId: cap.id, armyId: army.id, targetX: wc.x, targetY: wc.y, resources: load });
  if (!r.ok) { bump(m.k, 'deliverRefused'); return; }
  for (const res of RES) cap[res] -= load[res];
  const a = bot.armies.find(x => x.id === army.id);
  if (a) { a.status = 'TRANSPORTING'; a.missionType = 'TRANSPORT'; }
  bump(m.k, 'deliveries'); bump(m.k, 'delivered', total);
  bump(m.k, army.name === Armies.NAMES.caravan ? 'deliveredByCaravan' : army.name === Armies.NAMES.convoy ? 'deliveredByConvoy' : 'deliveredByFieldArmy', total);
  if (wc.playerId === bot.playerId) bump(m.k, 'deliveredOwn', total);
}

// ---------- défense contre les vagues : la garde de la Merveille ----------
function guardOf(bot, m) {
  let g = m.guard ? bot.armies.find(a => a.id === m.guard) : null;
  if (!g) g = Armies.named(bot, Armies.NAMES.wonder)[0] || null;
  if (g) m.guard = g.id; else delete m.guard;
  return g;
}
async function fillFromGarrison(bot, B, army, cap, share, k) {
  const g = bot.armies.find(a => a.isGarrison && a.cityId === cap.id);
  for (const u of fighters(g?.units).sort((a, b) => b.count - a.count).slice(0, 3)) {
    if (B.left <= 1) break;
    const take = Math.floor(u.count * share);
    if (take < 5) continue;
    const cur = (army.units || []).find(x => x.unitKey === u.unitKey)?.count || 0;
    B.left--;
    const r = await bot.post(`/api/army/${army.id}/set-unit`, { unitKey: u.unitKey, count: cur + take });
    if (!r.ok) break;
    const got = Math.max(0, (r.data?.newCount ?? cur + take) - cur);
    u.count -= got;
    const row = (army.units ||= []).find(x => x.unitKey === u.unitKey);
    if (row) row.count += got; else army.units.push({ unitKey: u.unitKey, tier: u.tier || UNIT[u.unitKey].tier, count: got });
    bump(k, 'guardSoldiers', got);
  }
}
async function defendTurn(bot, ctx, B, m, s, wc) {
  const cap = bot.capital;
  const def = s.defense.get(wc.id) || { power: 0 };
  const need = waveNeed(wc.wonderLevel);
  let g = guardOf(bot, m);
  // l'emplacement de la garde passe avant la caravane et la chasse (../armies.cjs), seulement quand la défense manque : sinon
  // la place resterait vide pour une garde jamais formée
  m.wantGuard = def.power < need;
  if (def.power >= need || B.left < 2 || cap.isSieged) return;
  bump(m.k, 'defenseShort');
  if (g && !Armies.atHome(g, cap)) {
    // déjà postée (ou en route) : trop faible face à ce que la garnison pourrait donner, elle rentre se regarnir
    const there = g.status === 'STATIONED' || (g.status === 'IDLE' && g.x === wc.x && g.y === wc.y);
    const garrison = soldiers(bot.armies.find(a => a.isGarrison && a.cityId === cap.id)?.units);
    if (there && garrison > 2 * soldiers(g.units) + 100) {
      B.left--;
      const r = await bot.post(`/api/army/${g.id}/return`);
      if (r.ok) { g.status = 'RETURNING'; bump(m.k, 'guardRefills'); }
    }
    return;
  }
  if (!g) {
    const slot = Armies.freeSlot(bot, 'wonder');
    if (slot) {
      B.left--;
      const r = await bot.post('/api/army/create', { cityId: cap.id, slot, name: Armies.NAMES.wonder });
      if (!r.ok || !r.data?.army) { bump(m.k, 'guardRefused'); return; }
      g = { ...r.data.army, units: [] };
      bot.armies.push(g);
      m.guard = g.id;
      bump(m.k, 'guardsCreated');
    } else {
      // pas de place : l'Ost d'un guerrier au repos (ses engins attendent dans la garnison entre deux sièges)
      g = Armies.named(bot, Armies.NAMES.ost).find(a => Armies.atHome(a, cap)) || null;
      if (!g) { bump(m.k, 'guardNoSlot'); return; }
      bump(m.k, 'ostToWonder');
    }
  }
  if (B.left > 2) await fillFromGarrison(bot, B, g, cap, GUARD_SHARE, m.k);
  if (soldiers(g.units) < 20 || B.left <= 0) return;
  B.left--;
  // sa propre Ville Merveille : l'armée s'y déplace ; celle d'un autre membre : en renfort
  const r = wc.playerId === bot.playerId
    ? await bot.post(`/api/army/${g.id}/move`, { x: wc.x, y: wc.y })
    : await bot.post(`/api/army/${g.id}/support`, { targetCityId: wc.id });
  if (!r.ok) { bump(m.k, 'guardSendRefused'); return; }
  g.status = wc.playerId === bot.playerId ? 'MOVING' : 'SUPPORTING';
  def.power += powerOf(g.units);
  bump(m.k, 'guardsSent');
}

// ---------- conseil de l'alliance (après le tour de tous les joueurs) : rassemblements contre les Immortels ----------
// les armées des membres vues du serveur (une lecture par conseil), la meilleure armée au repos dans la capitale de chacun
async function membersOf(ctx, allianceId, s) {
  const bots = ctx.bots.filter(b => b.playerId && s.allianceOf.get(b.playerId) === allianceId && b.capital);
  const ids = bots.map(b => b.playerId);
  const [armies, caps] = await Promise.all([
    ctx.prisma.army.findMany({ where: { ownerId: { in: ids } }, select: { id: true, ownerId: true, cityId: true, name: true, x: true, y: true, status: true, isGarrison: true, claimedAt: true, units: { select: { unitKey: true, count: true, tier: true } } } }),
    ctx.prisma.city.findMany({ where: { playerId: { in: ids }, isCapital: true }, select: { id: true, playerId: true, x: true, y: true, isSieged: true, buildings: { where: { key: 'RALLY_POINT' }, select: { key: true, level: true } } } })
  ]);
  const out = [];
  for (const b of bots) {
    const cap = caps.find(c => c.playerId === b.playerId);
    if (!cap || cap.isSieged) continue;
    const mine = armies.filter(a => a.ownerId === b.playerId);
    const garrison = mine.find(a => a.isGarrison && a.cityId === cap.id) || null;
    // une armée de campagne au repos chez elle (jamais une garde, la caravane, le convoi, ni les armées d'une fondation en
    // cours : l'une frappe le camp du site, l'autre escorte le colon)
    const col = b.mem?.mil?.col;
    const founding = new Set([col?.a, col?.b].filter(Boolean));
    const ready = mine.filter(a => !a.isGarrison && a.status === 'IDLE' && !a.claimedAt && a.cityId === cap.id && a.x === cap.x && a.y === cap.y && !RALLY_NEVER.has(a.name) && !founding.has(a.id))
      .sort((p, q) => powerOf(q.units) - powerOf(p.units))[0];
    if (!ready) continue;
    // ce que fillPart y ajoutera : les trois troupes les plus nombreuses de la garnison
    const extra = fighters(garrison?.units).sort((p, q) => q.count - p.count).slice(0, 3).map(u => ({ ...u, count: Math.floor(u.count * FILL_SHARE) })).filter(u => u.count >= 5);
    const pot = powerOf(ready.units) + powerOf(extra);
    if (!(pot > 0)) continue;   // une armée vide sans renfort possible : le serveur la refuserait (« Armée vide »)
    out.push({ b, cap, army: ready, garrison, pot, units: [...fighters(ready.units), ...extra] });
  }
  return out;
}
// remplir l'armée depuis la garnison avant de partir (les trois troupes les plus nombreuses)
async function fillPart(p, S, k) {
  for (const u of fighters(p.garrison?.units).sort((a, b) => b.count - a.count).slice(0, 3)) {
    if (S.left <= 2) break;
    const take = Math.floor(u.count * FILL_SHARE);
    if (take < 5) continue;
    const cur = (p.army.units || []).find(x => x.unitKey === u.unitKey)?.count || 0;
    S.left--;
    const r = await p.b.post(`/api/army/${p.army.id}/set-unit`, { unitKey: u.unitKey, count: cur + take });
    if (!r.ok) break;
    bump(k, 'rallySoldiersAdded', Math.max(0, (r.data?.newCount ?? cur + take) - cur));
  }
}
async function launchRally(ctx, s, as, g, allianceId, node, S) {
  const kind = node.resourceType;
  const parts = await membersOf(ctx, allianceId, s);
  if (!parts.length) { as.nx = ctx.step + 4; return; }
  const toLeader = (p, l) => (p === l ? 0 : travelSec(p.units, p.cap, l.cap) * 1.3 + 300);
  const reach = (l) => parts.filter(p => p !== l && toLeader(p, l) < MAX_WAIT_S).length;
  const founder = kind === 'WONDER' ? parts.find(p => p.b.playerId === as.founder) : null;
  const leader = founder || parts.map(l => ({ l, n: reach(l) })).sort((a, b) => (b.n - a.n) || (lvl(b.l.cap, 'RALLY_POINT') - lvl(a.l.cap, 'RALLY_POINT')) || (dist(a.l.cap, node) - dist(b.l.cap, node)))[0].l;
  const capacity = fx.rallyMaxArmies(lvl(leader.cap, 'RALLY_POINT'));
  const joiners = parts.filter(p => p !== leader).map(p => ({ p, t: toLeader(p, leader) })).filter(x => x.t < MAX_WAIT_S)
    .sort((a, b) => b.p.pot - a.p.pot).slice(0, Math.max(0, capacity - 1));
  const needS = Math.max(0, ...joiners.map(x => x.t));
  const wait = WAITS.find(w => w >= 30 && w * 60 >= needS) || WAITS[WAITS.length - 1];
  const expected = leader.pot + joiners.reduce((t, x) => t + x.p.pot * (online(ctx, x.p.b) ? 1 : NOTIF_ODDS(wait)), 0);
  const need = node.defenderPower * as.margin;
  if (expected < ATTRITION * need) { as.nx = ctx.step + 4; bump(as.k, `${kind}TooWeak`); return; }
  const wear = expected < need;
  await fillPart(leader, S, as.k);
  if (S.left < 2) return;
  S.left--;
  const r = await leader.b.post('/api/rallies', { armyId: leader.army.id, nodeId: node.id, waitMinutes: wait });
  if (!r.ok || !r.data?.rally?.id) { bump(as.k, 'rallyRefused'); as.nx = ctx.step + 2; return; }
  const rally = r.data.rally;
  const max = Math.min(capacity, r.data.maxArmies || capacity);
  const launchAt = ms(rally.launchAt);
  let joined = 1, power = leader.pot;
  for (const { p, t } of joiners) {
    if (joined >= max || S.left < 3) break;
    if (!online(ctx, p.b) && ctx.rand() >= NOTIF_ODDS(wait)) { bump(as.k, 'rallyMissed'); continue; }
    if (s.now + t * 1000 > launchAt) continue;   // n'arriverait pas à temps
    await fillPart(p, S, as.k);
    S.left--;
    const j = await p.b.post(`/api/rallies/${rally.id}/join`, { armyId: p.army.id });
    if (!j.ok) { bump(as.k, 'joinRefused'); continue; }
    joined++; power += p.pot;
  }
  as.rallies[rally.id] = { kind, node: node.id, wear, s: ctx.step, armies: joined };
  as.nx = ctx.step + 2;
  bump(as.k, `${kind}Rallies`); bump(as.k, `wait${wait}`); if (wear) bump(as.k, `${kind}RalliesToWear`);
  ctx.event('wonder_rally', { alliance: s.tagOf.get(allianceId), kind, x: node.x, y: node.y, leader: leader.b.name, wait, armies: joined, capacity: max, power: Math.round(power), immortals: node.defenderPower, wear });
}
// issues des rassemblements de l'alliance (lecture de la base : le rapport du rassemblement)
async function outcomes(ctx, s, as, allianceId) {
  const ids = Object.keys(as.rallies);
  if (!ids.length) return;
  const rows = await ctx.prisma.rally.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, result: true, targetX: true, targetY: true } });
  for (const id of ids) {
    const r = rows.find(x => x.id === id), mine = as.rallies[id];
    if (!r || r.status === 'CANCELLED' || (r.status === 'DONE' && r.result?.gone)) { delete as.rallies[id]; continue; }
    if (r.status !== 'DONE' || !r.result) { if (ctx.step - mine.s > 12) delete as.rallies[id]; continue; }
    delete as.rallies[id];
    const tag = s.tagOf.get(allianceId);
    if (r.result.won) {
      as.margin = Math.max(1, Math.round((as.margin - 0.02) * 100) / 100);
      bump(as.k, mine.kind === 'PLAN' ? 'plansTaken' : 'sitesBeaten');
      ctx.event(mine.kind === 'PLAN' ? 'wonder_plan_taken' : 'wonder_site_beaten', { alliance: tag, x: r.targetX, y: r.targetY, armies: r.result.armies, captor: ctx.bots.find(b => b.playerId === r.result.captorId)?.name || null, day: s.day });
    } else {
      // une défaite voulue (usure) n'apprend rien : les Immortels gardent leurs pertes
      if (!mine.wear) as.margin = Math.min(2, Math.round((as.margin + 0.05) * 100) / 100);
      bump(as.k, mine.wear ? `${mine.kind}Worn` : `${mine.kind}Repelled`);
      ctx.event('wonder_rally_repelled', { alliance: tag, kind: mine.kind, x: r.targetX, y: r.targetY, armies: r.result.armies, wear: mine.wear, margin: as.margin });
    }
  }
}
async function council(ctx, s, g, S) {
  const allianceId = groupAlliance(ctx, s, g);
  const as = allianceState(ctx, g, s);
  if (!allianceId || !as) return;
  await outcomes(ctx, s, as, allianceId);
  const wc = wonderOf(s, allianceId);
  const mineActive = (kind) => s.rallies.some(r => r.allianceId === allianceId && r.targetKind === kind);
  const ourCaps = ctx.bots.filter(b => b.playerId && s.allianceOf.get(b.playerId) === allianceId && b.capital).map(b => b.capital);
  const nearest = (nodes) => nodes.filter(n => n.hasDefenders && n.defenderPower > 0 && !n.cityId && !s.rallies.some(r => r.targetNodeId === n.id))
    .sort((a, b) => ourCaps.reduce((t, c) => t + dist(a, c), 0) - ourCaps.reduce((t, c) => t + dist(b, c), 0))[0] || null;
  if (!wc) {
    const founder = founderOf(ctx, s, g, as, allianceId);
    if (!s.sitesOpen || !founder) return;
    // site libéré : le fondateur, prévenu, y envoie son colon (s'il ne joue pas ce pas-ci, une fois sur deux à peu près)
    if (freeSite(s, founder.capital)) {
      if (!online(ctx, founder) && ctx.rand() < 0.6 && Array.isArray(founder.armies)) await foundTurn(founder, ctx, { left: 1 }, memOf(founder, s), s);
      return;
    }
    // une fondation en cours sur un site, ou un rassemblement déjà en route : on attend
    if (mineActive('WONDER') || (as.nx || 0) > ctx.step || S.left < 10) return;
    if (!((founder.capital?.settlers || 0) > 0)) { bump(as.k, 'waitSettler'); return; }
    const site = nearest(s.sites);
    if (site) await launchRally(ctx, s, as, g, allianceId, site, S);
    return;
  }
  // la Ville Merveille de l'alliance : un plan dès qu'ils apparaissent (jour config.world.wonderPlansDay ; au-delà du niveau
  // planNeededAbove, il en faut un), tant que l'alliance n'en détient aucun
  if (s.plansOpen && !s.planAlliances.has(allianceId) && !mineActive('PLAN') && (as.nx || 0) <= ctx.step && S.left >= 10) {
    const plan = nearest(s.plans);
    if (plan) await launchRally(ctx, s, as, g, allianceId, plan, S);
  }
  // fin de niveau : le propriétaire, prévenu, lance le suivant (s'il ne joue pas ce pas-ci, une fois sur deux à peu près)
  const owner = ctx.bots.find(b => b.playerId === wc.playerId);
  if (owner && !online(ctx, owner) && !wc.wonderBuildEndsAt && ctx.rand() < 0.6) await buildTurn(owner, ctx, { left: 2 }, memOf(owner, s), wc);
}

// ---------- suivi : villes fondées, niveaux, vagues, point d'étape ----------
let SEEN = null;   // Ville Merveille -> niveau (événements)
let WAVES_AT = null;
async function track(ctx, s) {
  if (!SEEN || SEEN.w !== s.number) SEEN = { w: s.number, levels: new Map(), plans: 0 };
  const K = (ctx.bots[0].mem.wonS ||= {});
  for (const c of s.wonders || []) {
    const before = SEEN.levels.get(c.id);
    if (before === undefined) { ctx.event('wonder_city_founded', { alliance: s.tagOf.get(s.allianceOf.get(c.playerId)), owner: ctx.bots.find(b => b.playerId === c.playerId)?.name || null, x: c.x, y: c.y, day: s.day }); bump(K, 'citiesFounded'); }
    else if (c.wonderLevel > before) { for (let l = before + 1; l <= c.wonderLevel; l++) if (l % 10 === 0 || l <= 3) ctx.event('wonder_level', { alliance: s.tagOf.get(s.allianceOf.get(c.playerId)), level: l, day: s.day }); bump(K, 'levelsBuilt', c.wonderLevel - before); }
    else if (c.wonderLevel < before) bump(K, 'levelsLost', before - c.wonderLevel);
    SEEN.levels.set(c.id, c.wonderLevel);
  }
  // les vagues d'Immortels du pas (rapports de bataille « IMMORTALS ») : tenues ou perdues
  const since = new Date(WAVES_AT ?? s.now - 6 * 3600000);
  WAVES_AT = s.now;
  const reps = await ctx.prisma.battleReport.findMany({ where: { createdAt: { gt: since }, defenderId: { not: null } }, select: { winner: true, loot: true, defenderUnits: true, playerId: true, defenderId: true } });
  for (const r of reps) {
    if (r.loot?.type !== 'IMMORTALS' || r.playerId !== r.defenderId) continue;
    const held = r.winner === 'DEFENDER';
    bump(K, held ? 'wavesHeld' : 'wavesLost');
    const c = (s.wonders || []).find(x => x.id === r.loot?.cityId);
    ctx.event('wonder_wave', { city: r.loot?.cityName, level: c?.wonderLevel ?? null, held, wallBroken: !!r.loot?.wallBroken, defenders: (r.defenderUnits || []).reduce((t, u) => t + (u.count || 0), 0) });
  }
}
async function summary(ctx, s) {
  const k = {};
  for (const b of ctx.bots) for (const [key, v] of Object.entries(b.mem.won?.k || {})) k[key] = (k[key] || 0) + v;
  const alliances = {};
  for (const g of GROUPS) { const as = ctx.byGroup(g).find(b => b.playerId)?.mem?.wonA; if (as) alliances[g] = { margin: as.margin, founder: ctx.bots.find(b => b.playerId === as.founder)?.name || null, ...as.k }; }
  const wonders = (s.wonders || []).map(c => ({ alliance: s.tagOf?.get(s.allianceOf.get(c.playerId)) || null, level: c.wonderLevel, stock: RES.reduce((t, r) => t + Math.floor(c[STOCK[r]] || 0), 0), defenders: s.defense?.get(c.id) || null }));
  const sites = { total: (s.sites || []).length, guarded: (s.sites || []).filter(n => n.hasDefenders).length, built: (s.sites || []).filter(n => n.cityId).length };
  const plans = { left: (s.plans || []).length, held: s.planAlliances ? [...s.planAlliances].map(a => s.tagOf.get(a)) : [] };
  ctx.event('wonder_summary', { step: ctx.step, day: s.day, sites, plans, wonders, alliances, world: ctx.bots[0].mem.wonS || {}, counters: k });
  ctx.say(`merveille : ${JSON.stringify({ day: s.day, sites, plans, wonders: wonders.map(w => `${w.alliance}:${w.level}`), delivered: k.delivered || 0, waves: ctx.bots[0].mem.wonS || {} })}`);
}

module.exports = {
  name: 'wonder',
  deliveryLoad, waveNeed, founderOf,   // pour les tests unitaires (tests/unit/sim-bots.test.js)
  async act(bot, ctx) {
    if (!bot.me || !bot.capital || !Array.isArray(bot.armies) || !GROUPS.includes(bot.group)) return;
    const s = await snapshot(ctx);
    if (s.ended || !(s.sitesOpen || s.day >= s.sitesDay - 12)) return;
    const allianceId = bot.me.alliance?.allianceId;
    if (!allianceId || !s.allianceOf) return;
    const m = memOf(bot, s);
    const B = { left: CALLS };
    const as = allianceState(ctx, bot.group, s);
    const wc = wonderOf(s, allianceId);
    if (!wc) {
      m.wantGuard = false;
      // le fondateur : un colon prêt avant les sites, puis la fondation sur le site libéré
      if (as && founderOf(ctx, s, bot.group, as, allianceId) === bot) {
        if (!(await foundTurn(bot, ctx, B, m, s))) await settlerTurn(bot, ctx, B, m);
      }
      return;
    }
    if (wc.playerId === bot.playerId) await buildTurn(bot, ctx, B, m, wc);
    if (wc.wonderLevel >= 1 || wc.wonderBuildEndsAt) await defendTurn(bot, ctx, B, m, s, wc);
    await deliverTurn(bot, ctx, B, m, wc);
  },
  async afterStep(ctx) {
    let s;
    try { s = await snapshot(ctx); } catch (e) { console.error('[SIM] merveille :', e); return; }
    if (s.ended || !s.sitesOpen) return;
    const S = { left: COUNCIL_CALLS };
    for (const g of GROUPS) { try { await council(ctx, s, g, S); } catch (e) { console.error(`[SIM] merveille, conseil ${g} :`, e); } }
    try { await track(ctx, s); } catch (e) { console.error('[SIM] merveille, suivi :', e); }
    const total = Math.round(ctx.OPT.days * 24 / ctx.OPT.stepHours);
    if (ctx.step % 28 === 0 || ctx.step === total) { try { await summary(ctx, s); } catch (e) { console.error('[SIM] merveille, point :', e); } }
  }
};
