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
//   ses villes ont en trop (POST /api/trade/send, aussi vers la sienne : la Ville Merveille reçoit tout, sans plafond ; le
//   chargement se prend dans le stock commun, décision du 1er novembre 2026, E1, plus bas) ; le
//   propriétaire lance chaque niveau dès que le stock du chantier le paie (POST /api/wonder/:cityId/build), aussi à la
//   notification de fin de niveau.
// - Défense : une vague d'Immortels frappe toutes les 12 h (config.world.immortalWaveBase × niveau^immortalWaveExp). Quand
//   les défenseurs postés pèsent moins que la vague suivante (marge 1,25), les membres envoient une « Garde de la Merveille »
//   (rôle wonder de ../armies.cjs ; sans place, l'Ost d'un guerrier) remplie depuis leur garnison : en renfort (POST
//   /api/army/:id/support), ou déplacée (POST /api/army/:id/move) par le propriétaire, dont c'est la ville.
// - Suivi : sites pris, plans, niveaux, livraisons par armée, vagues tenues ou perdues (events.jsonl, point d'étape).
// Simulation après les décisions du 31 octobre 2026 (rapport sim-d, relu) :
// - Livraisons : la ressource qui bloque le niveau suivant part d'abord (ce qui manque au chantier pour ses 3 prochains
//   niveaux), puis ce qui manque pour 10 niveaux ; rien de ce que le chantier a déjà pour 10 niveaux. Les céréales qui
//   manquent s'achètent au marchand du serveur de la capitale (POST /api/market/npc-trade, sa vraie taxe) juste avant de
//   partir : le grenier de la capitale paie ses troupes d'abord, il est presque toujours vide (Merveille bloquée 41 jours
//   au niveau 1 faute de 1 235 céréales, avec 46,8 M de bois, pierre et fer en stock).
// - Escorte du colon : le fondateur garde une armée au repos dans sa capitale pendant la phase des sites (drapeau
//   bot.mem.wonder.holdEscort, lu par 30-military.cjs ; le marché, le héros et les invasions ne la font pas partir non
//   plus). Il fonde dès le début de son tour (28-wonder-early.cjs, avant que le module militaire n'envoie ses armées), et le
//   conseil relit ses armées avant de fonder pour lui quand il ne joue pas ce pas-ci. Il ne mène plus le rassemblement d'un
//   site (son armée serait au combat quand le site se libère). Avant : site libéré 9 fois avant la fondation.
// - Rassemblements : chaque membre y envoie toute son armée de la capitale (ses autres armées au repos s'y fondent, plus
//   90 % de chaque troupe de la garnison) ; le prochain rassemblement est annoncé : l'armée la plus forte de chaque membre
//   reste à la maison (bot.mem.wonder.keep, et bot.mem.mil.idle pour le module militaire), sauf pour les donjons du
//   week-end (60-invasion.cjs) ; après trois conseils de suite sans rassemblement possible, l'annonce s'arrête 3 jours. Un
//   plan se prend aussi avant la Ville Merveille quand le site n'occupe pas l'alliance.
// Décisions du 1er novembre 2026 (simulation de 200 jours) :
// - E1, stock commun : une livraison part de la capitale mais se charge dans toutes les villes du joueur (la capitale
//   d'abord, puis la plus pleine) ; ce qui peut partir se lit sur le stock commun (../stock.cjs pool), céréales des colonies
//   comprises (la Merveille était bloquée au niveau 1 faute de céréales, alors que les colonies en avaient 46,8 M). Les
//   céréales ne s'achètent au marchand du serveur que si toutes les villes réunies en manquent ;
// - pendant qu'un assaut de Bastion ou une chaîne d'assauts se prépare (mem.war.muster du premier membre suivi de l'alliance,
//   50-war.cjs), aucune armée ne part livrer : elle est à la maison pour le rassemblement ;
// - E6, site réservé : un site libéré est réservé config.world.wonderSiteReserveHours (6 h) à l'alliance qui a battu les
//   Immortels (la carte le montre) ; son fondateur y envoie son colon aussitôt ; celui d'une autre alliance attend la fin de
//   la réservation (puis le site est à qui le prend, jusqu'au retour des Immortels, 24 h après la bataille).
// Au plus 8 appels par joueur et par tour, 400 par pas pour le conseil de chaque alliance.
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
const CALLS = 8;
const COUNCIL_CALLS = 400;       // par alliance (fondre les armées d'un membre et le remplir : une quinzaine d'appels)
const WAITS = config.rally.waitMinutes;
const MAX_WAIT_S = Math.max(...WAITS) * 60;
const ATTRITION = 0.6;           // un rassemblement qui pèse 60 % des Immortels part les user (ils gardent leurs pertes)
const RALLY_SHARE = 0.9;         // part de chaque troupe de la garnison qu'un membre met dans l'armée du rassemblement
const KEEP_STOCK = 0.3;          // part du stockage de toutes les villes (stock commun) gardée pour bâtir quand on livre la Merveille
const COVER_LEVELS = 3;          // livraisons : ce qui manque au chantier pour ses 3 prochains niveaux part d'abord
const STOCK_LEVELS = 10;         // puis ce qui manque pour 10 niveaux ; au-delà, la ressource ne part plus
const DEFENSE_MARGIN = 1.25;     // défenseurs voulus face à la vague suivante
const GUARD_SHARE = 0.6;         // part des soldats de la garnison que prend la garde de la Merveille
const NOTIF_ODDS = (wait) => (wait >= 120 ? 0.8 : 0.6);   // un membre qui ne joue pas ce pas-ci voit la notification à temps
// trois conseils de suite sans rassemblement possible (personne à la maison, ou trop faible) : les membres ne gardent plus
// leur armée la plus forte pendant 3 jours (récoltes, livraisons), le conseil essaie encore avec ceux qui sont là
const WEAK_PAUSE = 3;
const QUIET_STEPS = 12;
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
// le joueur joue ce pas-ci : la règle de la boucle (ctx.plays, si la simulation la donne), sinon un pas sur deux
const online = (ctx, b) => (typeof ctx.plays === 'function' ? !!ctx.plays(b) : !!b.mem?.alwaysOn || (ctx.step + (b.turn || 0)) % 2 === 0);
const capOf = (city, r) => Math.max(1, (r === 'food' ? city.maxFoodStorage : city.maxStorage) || 1);
const ms = (d) => (d ? new Date(d).getTime() : 0);
const bump = (k, key, n = 1) => { k[key] = (k[key] || 0) + n; };

// ---------- armées gardées pour la Merveille (lues aussi par 30-military.cjs, 40-market.cjs, 25-hero.cjs, 50-war.cjs ;
// 60-invasion.cjs ne lit que l'escorte) ----------
// bot.mem.wonder : { holdEscort, keep: { armée: pas } }. holdEscort : le fondateur garde une armée au repos dans sa capitale
// pour escorter son colon ; keep : l'armée annoncée pour le prochain rassemblement de l'alliance, jusqu'à ce pas
const wonderMem = (bot) => (bot.mem.wonder ||= {});
// les armées de la capitale qui peuvent escorter le colon : au repos chez elles, avec des soldats, d'aucun rôle réservé ;
// la plus petite d'abord (c'est elle qui part avec le colon)
const escortsOf = (armies, cap) => (armies || []).filter(a => Armies.atHome(a, cap) && soldiers(a.units) > 0 && !ESCORT_NEVER.has(a.name))
  .sort((a, b) => soldiers(a.units) - soldiers(b.units));
function heldEscort(bot, armies = bot?.armies) {
  if (bot?.mem?.wonder?.holdEscort !== true || !bot.capital) return null;
  return escortsOf(armies, bot.capital)[0] || null;
}
// une armée que les autres modules ne font pas partir : l'escorte gardée, ou celle annoncée pour le rassemblement
function keptForWonder(bot, armyId, step = bot?.ctx?.step) {
  const w = bot?.mem?.wonder;
  if (!w || !armyId) return false;
  if (w.holdEscort === true && heldEscort(bot)?.id === armyId) return true;
  return Number.isFinite(step) && (w.keep?.[armyId] || 0) > step;
}

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
    await reservations(P, s);
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
      // les livraisons en route vers chaque chantier (l'alliance voit ses convois) : comptées dans ce qu'il a déjà
      const convoys = await P.army.findMany({ where: { status: 'TRANSPORTING', missionType: 'TRANSPORT', OR: wonders.map(c => ({ targetX: c.x, targetY: c.y })) }, select: { targetX: true, targetY: true, carryWood: true, carryStone: true, carryIron: true, carryFood: true } });
      for (const c of wonders) {
        const mine = convoys.filter(a => a.targetX === c.x && a.targetY === c.y);
        c.inbound = { wood: 0, stone: 0, iron: 0, food: 0 };
        for (const a of mine) { c.inbound.wood += a.carryWood; c.inbound.stone += a.carryStone; c.inbound.iron += a.carryIron; c.inbound.food += a.carryFood; }
      }
    }
  }
  SNAP = s;
  return s;
}
const wonderOf = (s, allianceId) => (s.wonders || []).find(c => s.allianceOf.get(c.playerId) === allianceId) || null;
// Réservation d'un site libéré (décision du 1er novembre 2026, E6), ce que montre la carte : l'alliance qui a battu les
// Immortels et la fin de la réservation (bataille + config.world.wonderSiteReserveHours), lues dans les sites réservés du
// serveur (wonderService.reservedSites, la liste de l'écran « Monde ») ; sans elle, déduites du dernier rassemblement gagné
// contre ce site. Sur chaque site libéré et réservé : n.reservedFor, n.reservedUntil (ms) ; sinon rien.
const RESERVE_MS = (Number(W.wonderSiteReserveHours) || 0) * 3600000;
// Les réservations vues gardent l'alliance qui a libéré chaque site (RESV : site -> { by, at, until }) : le suivi des
// Villes Merveille fondées dit si l'alliance a fondé sur le site qu'elle avait libéré.
const RESV = new Map();
async function reservations(P, s) {
  const freed = (s.sites || []).filter(n => !n.hasDefenders && !n.cityId && n.lastDefeat);
  if (!freed.length) return;
  const won = await P.rally.findMany({ where: { targetKind: 'WONDER', status: 'DONE', targetNodeId: { in: freed.map(n => n.id) }, createdAt: { gte: new Date(s.now - 3 * 86400000) } }, orderBy: { createdAt: 'desc' }, select: { allianceId: true, targetNodeId: true, result: true } }).catch(() => []);
  const shown = typeof WS.reservedSites === 'function' ? await WS.reservedSites(new Date(s.now), P).catch(() => null) : null;
  for (const n of freed) {
    const r = won.find(x => x.targetNodeId === n.id && x.result?.won);
    const rs = shown ? shown.find(x => x.nodeId === n.id) : null;
    const by = rs?.allianceId || r?.allianceId || null;
    if (!by) continue;
    if (!RESV.has(n.id) || RESV.get(n.id).at !== ms(n.lastDefeat)) RESV.set(n.id, { by, at: ms(n.lastDefeat) });
    // la réservation en cours : celle du serveur s'il la donne (finie : plus dans sa liste), sinon la règle
    const until = rs ? ms(rs.until) : shown ? 0 : ms(n.lastDefeat) + RESERVE_MS;
    if (!RESERVE_MS || until <= s.now) continue;
    n.reservedFor = by;
    n.reservedUntil = until;
  }
}
// l'alliance peut y fonder à l'heure `at` : pas de réservation, la sienne, ou une réservation finie
const mayFound = (n, allianceId, at) => !n.reservedFor || n.reservedFor === allianceId || at >= n.reservedUntil;
// la force de la prochaine vague contre une Merveille de ce niveau (elle peut monter d'un niveau d'ici là)
const waveNeed = (level) => WS.wavePower(Math.max(1, level + 1)) * DEFENSE_MARGIN;

// ---------- mémoire : celle du joueur, et celle de l'alliance (gardée par le premier joueur du groupe) ----------
function memOf(bot, s) {
  // monde suivant : tout recommence (et plus d'escorte ni d'armée gardée du monde d'avant)
  if (!bot.mem.won || bot.mem.won.w !== s.number) { bot.mem.won = { w: s.number, k: {} }; bot.mem.wonder = {}; }
  return bot.mem.won;
}
// hors de la phase des sites (ou monde fini) : le joueur ne garde pas d'escorte
const dropEscort = (bot) => { if (bot.mem.wonder) bot.mem.wonder.holdEscort = false; };
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
  // pas encore relu depuis une reprise de la simulation (ses villes arrivent à son tour) : il reste le fondateur, on attend
  // (avant : le premier membre relu le remplaçait, et un second colon était formé)
  if (cur && !cur.me) return null;
  if (cur && cur.capital && (ready(cur) || (cur.capital.settlers || 0) > 0 || (cur.armies || []).some(a => (a.settlers || 0) > 0))) return cur;
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
  ctx.event('wonder_settler', { bot: bot.name, worldDay: SNAP.day });
}
// un site libéré par les Immortels (24 h avant leur retour), sans ville ni fondation, où l'alliance peut fonder maintenant
// (E6 : le sien pendant sa réservation de 6 h, celui d'une autre alliance une fois sa réservation finie) : le plus proche de
// la capitale. Celui de son alliance d'abord.
const freedSites = (s) => (s.sites || []).filter(n => !n.hasDefenders && !n.cityId && !n.hasPlayerArmy && n.lastDefeat && s.now - ms(n.lastDefeat) < 22 * 3600000);
const freeSite = (s, cap, allianceId = null) => freedSites(s).filter(n => mayFound(n, allianceId, s.now))
  .sort((a, b) => ((b.reservedFor === allianceId) - (a.reservedFor === allianceId)) || (dist(a, cap) - dist(b, cap)))[0] || null;
async function foundTurn(bot, ctx, B, m, s) {
  const cap = bot.capital;
  if (B.left <= 0 || cap.isSieged || !((cap.settlers || 0) > 0)) return false;
  const allianceId = bot.me?.alliance?.allianceId || s.allianceOf?.get(bot.playerId) || null;
  const site = freeSite(s, cap, allianceId);
  if (!site) {
    // un site libre, mais réservé à l'alliance qui l'a libéré : le colon attend la fin de la réservation
    if (freedSites(s).some(n => !mayFound(n, allianceId, s.now))) bump(m.k, 'foundWaitReserve');
    return false;
  }
  // le colon part avec les 3 000 de chaque ressource de la fondation (stock de toutes les villes, la capitale d'abord)
  if (!Stock.canPay(bot, config.city.foundationTransport)) { bump(m.k, 'foundWaitRes'); return false; }
  // l'escorte du colon : une armée au repos dans la capitale (la plus petite, celle gardée à la maison), qui rentre après la
  // fondation ; jamais une garde (colonie, Ville Merveille) ni le convoi du Bastion, qui ont leur rôle
  const escort = escortsOf(bot.armies, cap)[0];
  if (!escort) { bump(m.k, 'founderNoEscort'); return false; }
  B.left--;
  const r = await bot.post(`/api/army/${escort.id}/found-city`, { resourceNodeId: site.id });
  if (!r.ok) { bump(m.k, 'foundRefused'); return false; }
  escort.status = 'MOVING'; escort.settlers = 1;
  cap.settlers = Math.max(0, (cap.settlers || 0) - 1);
  Stock.spend(bot, cap, config.city.foundationTransport);
  site.hasPlayerArmy = true;
  wonderMem(bot).holdEscort = false;   // le colon est parti avec son escorte
  bump(m.k, 'foundSent');
  const own = !!site.reservedFor && site.reservedFor === allianceId;
  if (site.reservedFor) bump(m.k, own ? 'foundReserved' : 'foundAfterReserve');
  ctx.event('wonder_found_sent', { bot: bot.name, x: site.x, y: site.y, arrivalAt: r.data?.arrivalAt || null, reserved: own, freedBy: site.reservedFor ? (s.tagOf?.get(site.reservedFor) || null) : null, hoursAfterBattle: site.lastDefeat ? Math.round((s.now - ms(site.lastDefeat)) / 360000) / 10 : null });
  return true;
}

// le fondateur garde son escorte à la maison pendant toute la phase des sites, tant qu'il a son colon et qu'un site reste à
// prendre : le combat qui libère un site se joue au tick, avant son tour, et une armée partie récolter reste dehors deux
// jours (simulation sim-d : site libéré 9 fois avant la fondation, l'escorte toujours partie)
function escortWanted(s, founder, wc) {
  if (wc || !s.sitesOpen || !founder?.capital || !((founder.capital.settlers || 0) > 0)) return false;
  return (s.sites || []).some(n => !n.cityId);
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
// ce qui manque au chantier pour ses `n` prochains niveaux (coûts réunis moins son stock), par ressource
function wonderLack(wc, n) {
  const level = wc?.wonderLevel || 0;
  const need = Object.fromEntries(RES.map(r => [r, 0]));
  for (let l = level + 1; l <= Math.min(W.wonderMaxLevel, level + n); l++) { const c = WS.levelCost(l); for (const r of RES) need[r] += c[r]; }
  // le stock du chantier et les livraisons déjà en route (convois des pas d'avant et de ce pas-ci)
  return Object.fromEntries(RES.map(r => [r, Math.max(0, need[r] - Math.floor(wc?.[STOCK[r]] || 0) - Math.floor(wc?.inbound?.[r] || 0))]));
}
// ce que le joueur peut livrer : le stock commun de ses villes (l'armée part de la capitale et se charge dans toutes, la
// capitale d'abord : décision du 1er novembre 2026, E1) moins ce qu'il garde pour bâtir (30 % du stockage de toutes ses
// villes, 60 % des céréales quand le joueur en manque) ; `bought` (achat fait pour cette livraison) part en entier, hors de
// la réserve
function spareOf(bot, cap, bought = {}) {
  const hungry = (Stock.foodBalance(bot)?.net ?? 1) < 0;
  const all = Stock.pool(bot, cap);
  return Object.fromEntries(RES.map(r => {
    const extra = Math.max(0, Math.floor(bought[r] || 0));
    const before = (all[r] || 0) - extra;
    return [r, Math.min(Math.max(0, Math.floor(all[r] || 0)), Math.max(0, Math.floor(before - capOf(all, r) * (r === 'food' && hungry ? 0.6 : KEEP_STOCK))) + extra)];
  }));
}
// le chargement : d'abord ce qui a été acheté pour cette livraison (`bought` : les céréales qui bloquent, qui partent en
// entier, hors de la réserve de la capitale ; sinon l'entretien du tick suivant les mangerait), puis ce qui manque pour les
// 3 prochains niveaux, la ressource qui bloque en tête (le plus gros manque rapporté à ce que la capitale a en trop : les
// céréales quand le grenier est vide) ; la place restante va à ce qui manque pour 10 niveaux, au prorata ; rien de ce que
// le chantier a déjà pour 10 niveaux
function deliveryLoad(bot, cap, capacity, wc, bought = {}) {
  const spare = spareOf(bot, cap, bought);
  const first = wonderLack(wc, COVER_LEVELS), later = wonderLack(wc, STOCK_LEVELS);
  const load = Object.fromEntries(RES.map(r => [r, 0]));
  let room = Math.max(0, Math.floor(capacity));
  for (const r of RES) {
    const add = Math.min(room, Math.max(0, Math.floor(bought[r] || 0)), spare[r], later[r]);
    load[r] += add; room -= add;
  }
  for (const r of RES.filter(x => first[x] > load[x]).sort((a, b) => first[b] / Math.max(1, spare[b]) - first[a] / Math.max(1, spare[a]))) {
    const add = Math.min(room, first[r] - load[r], spare[r] - load[r]);
    load[r] += add; room -= add;
  }
  // la place restante, au prorata de ce qui manque encore pour 10 niveaux ; la part d'une ressource qui manque va aux autres
  for (let pass = 0; pass < 2 && room > 0; pass++) {
    const left = Object.fromEntries(RES.map(r => [r, Math.max(0, Math.min(later[r], spare[r]) - load[r])]));
    const sum = RES.reduce((t, r) => t + left[r], 0);
    if (sum <= 0) break;
    const share = room;
    for (const r of RES) { const add = Math.min(left[r], room, pass ? left[r] : Math.floor(share * left[r] / sum)); load[r] += add; room -= add; }
  }
  return Object.fromEntries(RES.map(r => [r, Math.max(0, Math.floor(load[r] / 10) * 10)]));
}
// les céréales qui manquent au chantier quand toutes les villes réunies n'en ont pas assez en trop, achetées au marchand du
// serveur juste avant de partir (sa taxe : celle du Marché de la capitale) : on donne une ressource que le joueur a en trop,
// de préférence une que le chantier a déjà, la plus abondante d'abord ; au plus ce que l'armée porte. L'échange se fait dans
// une seule ville (le marchand du serveur ne sert qu'une ville à la fois) : celle qui a le plus de cette ressource et de
// place au grenier (la capitale à égalité) ; la livraison les reprendra dans le stock commun
function foodPurchase(bot, cap, capacity, wc) {
  const lack = wonderLack(wc, COVER_LEVELS);
  const spare = spareOf(bot, cap);
  if (!(lack.food > spare.food)) return null;
  const giveRes = ['wood', 'stone', 'iron'].filter(r => spare[r] >= 500).sort((a, b) => ((lack[a] > 0) - (lack[b] > 0)) || (spare[b] - spare[a]))[0];
  if (!giveRes) return null;
  const room = (c) => Math.max(0, Math.floor(capOf(c, 'food') - (c.food || 0)));
  const where = (bot.cities || []).filter(c => !c.isWonder).map(c => ({ c, n: Math.min(Math.floor(c[giveRes] || 0), room(c)) }))
    .sort((a, b) => (b.n - a.n) || ((b.c.id === cap.id) - (a.c.id === cap.id)))[0]?.c || cap;
  const want = Math.min(lack.food - spare.food, capacity, room(where));
  if (want < 500) return null;
  const tax = fx.npcMarketTaxPct(lvl(cap, 'MARKET'));
  const giveAmount = Math.min(spare[giveRes], Math.floor(where[giveRes] || 0), Math.ceil(want / (1 - tax / 100)));
  if (giveAmount < 500) return null;
  return { cityId: where.id, giveResource: giveRes, receiveResource: 'food', giveAmount };
}
// le pas jusqu'où l'alliance garde ses armées en ville pour un assaut de Bastion (50-war.cjs : mem.war.muster du premier
// membre suivi du groupe)
const musterOf = (ctx, bot) => (typeof ctx.byGroup === 'function' ? ctx.byGroup(bot.group).find(b => b.playerId)?.mem?.war?.muster || 0 : 0);
async function deliverTurn(bot, ctx, B, m, wc) {
  const cap = bot.capital;
  if (B.left < 2 || cap.isSieged || !lvl(cap, 'MARKET')) return;
  if (musterOf(ctx, bot) > ctx.step) { bump(m.k, 'deliverMuster'); return; }   // assaut de Bastion en préparation
  B.left--;
  const st = await bot.get(`/api/market/state?cityId=${cap.id}`);
  if (!st.ok || !Array.isArray(st.data?.armies)) return;
  // la plus grande armée libre que le joueur peut faire partir (caravane, convoi d'alliance, armée de campagne), jamais
  // l'escorte du colon ni l'armée annoncée pour le prochain rassemblement
  const army = market.tripArmies(bot, st.data.armies, ctx.step).sort((a, b) => b.capacity - a.capacity)[0];
  if (!army || army.capacity < 2000) { bump(m.k, 'deliverNoArmy'); return; }
  // les céréales qui bloquent : achetées dans le même tour (l'entretien du tick suivant mangerait un achat fait plus tôt)
  const bought = {};
  const buy = B.left >= 2 ? foodPurchase(bot, cap, army.capacity, wc) : null;
  if (buy) {
    B.left--;
    const r = await bot.post('/api/market/npc-trade', buy);
    if (r.ok) {
      const given = r.data?.given ?? buy.giveAmount, received = r.data?.received ?? 0;
      const at = bot.cities.find(c => c.id === buy.cityId) || cap;
      at[buy.giveResource] = (at[buy.giveResource] || 0) - given;
      at.food = (at.food || 0) + received;
      bought.food = received;
      bump(m.k, 'npcForWonder'); bump(m.k, 'npcForWonderGiven', given); bump(m.k, 'npcForWonderFood', received);
    } else bump(m.k, 'npcForWonderRefused');
  }
  const load = deliveryLoad(bot, cap, army.capacity, wc, bought);
  const total = RES.reduce((t, r) => t + load[r], 0);
  if (total < 1000) { bump(m.k, 'deliverNothing'); return; }
  if (B.left < 1) return;
  B.left--;
  const r = await bot.post('/api/trade/send', { fromCityId: cap.id, armyId: army.id, targetX: wc.x, targetY: wc.y, resources: load });
  if (!r.ok) { bump(m.k, 'deliverRefused'); return; }
  // pris dans le stock commun, la capitale d'abord (le serveur : debitPlayer) ; ce qui vient des autres villes compté à part
  const capFood = Math.min(load.food, Math.max(0, Math.floor(cap.food || 0)));
  bump(m.k, 'deliveredFromOthers', Stock.spend(bot, cap, load));
  if (load.food > capFood) bump(m.k, 'deliveredFoodFromOthers', load.food - capFood);
  // en route : les livreurs suivants du même pas visent ce qui manque encore
  wc.inbound ||= { wood: 0, stone: 0, iron: 0, food: 0 };
  for (const res of RES) wc.inbound[res] += load[res];
  const a = bot.armies.find(x => x.id === army.id);
  if (a) { a.status = 'TRANSPORTING'; a.missionType = 'TRANSPORT'; }
  bump(m.k, 'deliveries'); bump(m.k, 'delivered', total);
  for (const res of RES) if (load[res] > 0) bump(m.k, `delivered_${res}`, load[res]);
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
// les armées des membres vues du serveur (une lecture par conseil). Pour chacun : l'armée qui part (la plus forte au repos
// dans sa capitale), ses autres armées au repos qui s'y fondent (leurs soldats rentrent dans la garnison, l'armée qui part
// les reprend : un rassemblement ne prend qu'une armée par joueur) et 90 % de chaque troupe de la garnison. Jamais une
// garde, la caravane, le convoi, les armées d'une fondation en cours, ni l'escorte du colon que le fondateur garde.
// `full` : la même chose avec toutes ses armées de campagne, même dehors (pour annoncer le prochain rassemblement)
function mergeRows(lists) {
  const by = new Map();
  for (const u of lists.flatMap(l => fighters(l))) {
    const row = by.get(u.unitKey);
    if (row) row.count += u.count; else by.set(u.unitKey, { unitKey: u.unitKey, tier: u.tier || UNIT[u.unitKey].tier, count: u.count });
  }
  return [...by.values()];
}
const shareOf = (rows) => rows.map(u => ({ ...u, count: Math.floor(u.count * RALLY_SHARE) })).filter(u => u.count >= 5);
function memberPart(b, cap, mine) {
  const garrison = mine.find(a => a.isGarrison && a.cityId === cap.id) || null;
  const col = b.mem?.mil?.col;
  const founding = new Set([col?.a, col?.b].filter(Boolean));
  const held = b.mem?.wonder?.holdEscort === true ? escortsOf(mine, cap)[0] : null;
  const eligible = mine.filter(a => !a.isGarrison && a.cityId === cap.id && !RALLY_NEVER.has(a.name) && !founding.has(a.id) && a.id !== held?.id);
  const home = eligible.filter(a => Armies.atHome(a, cap)).sort((p, q) => powerOf(q.units) - powerOf(p.units));
  const full = powerOf(eligible.flatMap(a => fighters(a.units))) + powerOf(shareOf(fighters(garrison?.units)));
  const ready = home[0];
  if (!ready) return { full };
  const others = home.slice(1);
  const pool = mergeRows([garrison?.units, ...others.map(a => a.units)]);
  const extra = shareOf(pool);
  const pot = powerOf(ready.units) + powerOf(extra);
  // une armée vide sans renfort possible : le serveur la refuserait (« Armée vide »)
  return pot > 0 ? { full, part: { b, cap, army: ready, others, garrison, pool, pot, units: [...fighters(ready.units), ...extra] } } : { full };
}
async function membersOf(ctx, allianceId, s) {
  const bots = ctx.bots.filter(b => b.playerId && s.allianceOf.get(b.playerId) === allianceId && b.capital);
  const ids = bots.map(b => b.playerId);
  const [armies, caps] = await Promise.all([
    ctx.prisma.army.findMany({ where: { ownerId: { in: ids } }, select: { id: true, ownerId: true, cityId: true, name: true, x: true, y: true, status: true, isGarrison: true, claimedAt: true, units: { select: { unitKey: true, count: true, tier: true } } } }),
    ctx.prisma.city.findMany({ where: { playerId: { in: ids }, isCapital: true }, select: { id: true, playerId: true, x: true, y: true, isSieged: true, buildings: { where: { key: 'RALLY_POINT' }, select: { key: true, level: true } } } })
  ]);
  const parts = [];
  let potential = 0;
  for (const b of bots) {
    const cap = caps.find(c => c.playerId === b.playerId);
    if (!cap || cap.isSieged) continue;
    const { full, part } = memberPart(b, cap, armies.filter(a => a.ownerId === b.playerId));
    potential += full;
    if (part) parts.push(part);
  }
  return { parts, potential };
}
// avant de partir : les autres armées au repos rendent leurs soldats à la garnison (les engins restent à leur place), puis
// l'armée qui part prend 90 % de chaque troupe de la garnison
async function fillPart(p, S, k) {
  for (const o of p.others || []) {
    for (const u of fighters(o.units)) {
      if (S.left <= 2) return;
      S.left--;
      const r = await p.b.post(`/api/army/${o.id}/set-unit`, { unitKey: u.unitKey, count: 0 });
      if (!r.ok) break;
      bump(k, 'rallyMerged', u.count);
    }
  }
  for (const u of [...(p.pool || [])].sort((a, b) => b.count - a.count)) {
    if (S.left <= 2) break;
    const take = Math.floor(u.count * RALLY_SHARE);
    if (take < 5) continue;
    const cur = (p.army.units || []).find(x => x.unitKey === u.unitKey)?.count || 0;
    S.left--;
    const r = await p.b.post(`/api/army/${p.army.id}/set-unit`, { unitKey: u.unitKey, count: cur + take });
    if (!r.ok) break;
    bump(k, 'rallySoldiersAdded', Math.max(0, (r.data?.newCount ?? cur + take) - cur));
  }
}
// un conseil sans rassemblement possible ; au troisième de suite, l'annonce s'arrête un moment
function weak(ctx, as) {
  as.nx = ctx.step + 4;
  as.weak = (as.weak || 0) + 1;
  if (as.weak >= WEAK_PAUSE) { as.weak = 0; as.quiet = ctx.step + QUIET_STEPS; bump(as.k, 'announcePaused'); }
}
async function launchRally(ctx, s, as, g, allianceId, node, S, parts) {
  const kind = node.resourceType;
  if (!parts.length) { weak(ctx, as); bump(as.k, `${kind}NobodyHome`); return; }
  const toLeader = (p, l) => (p === l ? 0 : travelSec(p.units, p.cap, l.cap) * 1.3 + 300);
  const reach = (l) => parts.filter(p => p !== l && toLeader(p, l) < MAX_WAIT_S).length;
  // le fondateur qui garde son colon ne mène pas le rassemblement d'un site : il le rejoint avec une autre armée que son
  // escorte (membersOf la laisse à la maison)
  const leaders = kind === 'WONDER' ? parts.filter(p => p.b.playerId !== as.founder) : parts;
  const leader = (leaders.length ? leaders : parts).map(l => ({ l, n: reach(l) })).sort((a, b) => (b.n - a.n) || (lvl(b.l.cap, 'RALLY_POINT') - lvl(a.l.cap, 'RALLY_POINT')) || (dist(a.l.cap, node) - dist(b.l.cap, node)))[0].l;
  const capacity = fx.rallyMaxArmies(lvl(leader.cap, 'RALLY_POINT'));
  const joiners = parts.filter(p => p !== leader).map(p => ({ p, t: toLeader(p, leader) })).filter(x => x.t < MAX_WAIT_S)
    .sort((a, b) => b.p.pot - a.p.pot).slice(0, Math.max(0, capacity - 1));
  const needS = Math.max(0, ...joiners.map(x => x.t));
  const wait = WAITS.find(w => w >= 30 && w * 60 >= needS) || WAITS[WAITS.length - 1];
  const expected = leader.pot + joiners.reduce((t, x) => t + x.p.pot * (online(ctx, x.p.b) ? 1 : NOTIF_ODDS(wait)), 0);
  const need = node.defenderPower * as.margin;
  if (expected < ATTRITION * need) { weak(ctx, as); bump(as.k, `${kind}TooWeak`); return; }
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
    if (S.left < 1) break;
    S.left--;
    const j = await p.b.post(`/api/rallies/${rally.id}/join`, { armyId: p.army.id });
    if (!j.ok) { bump(as.k, 'joinRefused'); continue; }
    joined++; power += p.pot;
  }
  as.rallies[rally.id] = { kind, node: node.id, wear, s: ctx.step, armies: joined };
  as.nx = ctx.step + 2;
  as.weak = 0;
  bump(as.k, `${kind}Rallies`); bump(as.k, `wait${wait}`); if (wear) bump(as.k, `${kind}RalliesToWear`);
  ctx.event('wonder_rally', { alliance: s.tagOf.get(allianceId), target: kind, x: node.x, y: node.y, leader: leader.b.name, wait, armies: joined, capacity: max, power: Math.round(power), immortals: node.defenderPower, wear });
}
// le prochain rassemblement est annoncé : l'armée de campagne la plus forte de chaque membre reste à la maison jusque-là
// (bot.mem.mil.idle pour le module militaire, bot.mem.wonder.keep pour le marché, les livraisons, le héros et la guerre ;
// les donjons du week-end la prennent quand même : 60-invasion.cjs)
function announce(ctx, s, allianceId, until, as) {
  let n = 0;
  for (const b of ctx.bots) {
    if (!b.playerId || s.allianceOf.get(b.playerId) !== allianceId || !b.capital || !Array.isArray(b.armies)) continue;
    const own = new Set(b.mem?.mil?.own || []);
    const col = b.mem?.mil?.col;
    const founding = new Set([col?.a, col?.b].filter(Boolean));
    const a = b.armies.filter(x => !x.isGarrison && own.has(x.id) && !founding.has(x.id) && x.cityId === b.capital.id).sort((p, q) => powerOf(q.units) - powerOf(p.units))[0];
    if (!a) continue;
    wonderMem(b).keep = { [a.id]: until };
    if (b.mem.mil) { b.mem.mil.idle ||= {}; if ((b.mem.mil.idle[a.id] || 0) < until) b.mem.mil.idle[a.id] = until; }
    n++;
  }
  if (n) bump(as.k, 'announced');
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
      ctx.event(mine.kind === 'PLAN' ? 'wonder_plan_taken' : 'wonder_site_beaten', { alliance: tag, x: r.targetX, y: r.targetY, armies: r.result.armies, captor: ctx.bots.find(b => b.playerId === r.result.captorId)?.name || null, worldDay: s.day, reserveHours: mine.kind === 'PLAN' ? null : RESERVE_MS / 3600000 });
    } else {
      // une défaite voulue (usure) n'apprend rien : les Immortels gardent leurs pertes
      if (!mine.wear) as.margin = Math.min(2, Math.round((as.margin + 0.05) * 100) / 100);
      bump(as.k, mine.wear ? `${mine.kind}Worn` : `${mine.kind}Repelled`);
      ctx.event('wonder_rally_repelled', { alliance: tag, target: mine.kind, x: r.targetX, y: r.targetY, armies: r.result.armies, wear: mine.wear, margin: as.margin });
    }
  }
}
async function council(ctx, s, g) {
  const allianceId = groupAlliance(ctx, s, g);
  const as = allianceState(ctx, g, s);
  if (!allianceId || !as) return;
  const S = { left: COUNCIL_CALLS };
  await outcomes(ctx, s, as, allianceId);
  const wc = wonderOf(s, allianceId);
  const mineActive = (kind) => s.rallies.some(r => r.allianceId === allianceId && r.targetKind === kind);
  const ourCaps = ctx.bots.filter(b => b.playerId && s.allianceOf.get(b.playerId) === allianceId && b.capital).map(b => b.capital);
  const nearest = (nodes) => nodes.filter(n => n.hasDefenders && n.defenderPower > 0 && !n.cityId && !s.rallies.some(r => r.targetNodeId === n.id))
    .sort((a, b) => ourCaps.reduce((t, c) => t + dist(a, c), 0) - ourCaps.reduce((t, c) => t + dist(b, c), 0))[0] || null;
  // reprise de la simulation : le fondateur n'est pas encore relu (ses villes arrivent à son tour) ; on l'attend plutôt que
  // de viser un plan à la place du site
  if (!wc && s.sitesOpen && ctx.bots.some(b => b.playerId && b.playerId === as.founder && !b.me)) return;
  const founder = !wc && s.sitesOpen ? founderOf(ctx, s, g, as, allianceId) : null;
  // l'escorte du colon : seul le fondateur la garde, pendant la phase des sites (30-military.cjs la laisse à la maison)
  for (const b of ctx.byGroup(g)) if (b.mem) wonderMem(b).holdEscort = !!founder && b === founder && escortWanted(s, founder, wc);
  // la cible du prochain rassemblement : avant la Ville Merveille, un site quand le fondateur a son colon ; sinon un plan
  // (dès le jour config.world.wonderPlansDay, même avant la Ville Merveille ; il en faut un au-delà du niveau
  // planNeededAbove), tant que l'alliance n'en détient aucun
  let target = null;
  if (founder) {
    // site libéré : le fondateur, prévenu, y envoie son colon ; s'il ne joue pas ce pas-ci (une fois sur deux à peu près),
    // il relit d'abord ses villes et ses armées (celles d'il y a 6 h disaient encore « en route » pour une armée rentrée)
    if (freeSite(s, founder.capital, allianceId)) {
      if (!online(ctx, founder) && ctx.rand() < 0.6 && Array.isArray(founder.armies)) {
        if (typeof founder.refresh === 'function') { try { await founder.refresh(['cities', 'armies']); } catch (e) { /* lecture ratée : ses armées d'avant */ } }
        if (founder.capital && await foundTurn(founder, ctx, { left: 1 }, memOf(founder, s), s)) bump(as.k, 'foundByNotification');
      }
      return;
    }
    if (mineActive('WONDER')) return;   // un rassemblement déjà en route vers un site : on attend
    if ((founder.capital?.settlers || 0) > 0) target = nearest(s.sites);
    else bump(as.k, 'waitSettler');
  }
  if (!target && s.plansOpen && !s.planAlliances.has(allianceId) && !mineActive('PLAN') && !mineActive('WONDER')) target = nearest(s.plans);
  if (target) {
    const { parts, potential } = await membersOf(ctx, allianceId, s);
    if ((as.nx || 0) <= ctx.step && S.left >= 10) await launchRally(ctx, s, as, g, allianceId, target, S, parts);
    // le prochain rassemblement est annoncé quand l'alliance peut le tenter (ses armées, même dehors, pèsent assez) : chaque
    // membre garde son armée la plus forte à la maison jusque-là (pas pendant la pause qui suit trois conseils sans
    // rassemblement possible : weak)
    if ((as.quiet || 0) <= ctx.step && potential >= ATTRITION * target.defenderPower * as.margin) announce(ctx, s, allianceId, Math.max(as.nx || 0, ctx.step + 1) + 1, as);
  }
  if (!wc) return;
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
    if (before === undefined) {
      // la réservation du site (E6) : l'alliance qui l'a libéré, et quand la fondation a été lancée après la bataille
      const site = (s.sites || []).find(n => n.cityId === c.id || (n.x === c.x && n.y === c.y));
      const rv = site ? RESV.get(site.id) : null;
      const al = s.allianceOf.get(c.playerId);
      ctx.event('wonder_city_founded', { alliance: s.tagOf.get(al), owner: ctx.bots.find(b => b.playerId === c.playerId)?.name || null, x: c.x, y: c.y, worldDay: s.day, freedBy: rv ? (s.tagOf.get(rv.by) || null) : null, sameAlliance: rv ? rv.by === al : null });
      bump(K, 'citiesFounded');
      if (rv) bump(K, rv.by === al ? 'citiesOnOwnSite' : 'citiesOnOtherSite');
    } else if (c.wonderLevel > before) { for (let l = before + 1; l <= c.wonderLevel; l++) if (l % 10 === 0 || l <= 3) ctx.event('wonder_level', { alliance: s.tagOf.get(s.allianceOf.get(c.playerId)), level: l, worldDay: s.day }); bump(K, 'levelsBuilt', c.wonderLevel - before); }
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
  ctx.event('wonder_summary', { step: ctx.step, worldDay: s.day, sites, plans, wonders, alliances, world: ctx.bots[0].mem.wonS || {}, counters: k });
  ctx.say(`merveille : ${JSON.stringify({ day: s.day, sites, plans, wonders: wonders.map(w => `${w.alliance}:${w.level}`), delivered: k.delivered || 0, waves: ctx.bots[0].mem.wonS || {} })}`);
}

// début du tour (28-wonder-early.cjs, avant le module militaire qui envoie ses armées au repos en mission) : le fondateur
// fonde sur le site que l'alliance vient de libérer, avec l'escorte gardée à la maison
async function early(bot, ctx) {
  if (!bot.me || !bot.capital || !Array.isArray(bot.armies) || !GROUPS.includes(bot.group)) return;
  const s = await snapshot(ctx);
  if (s.ended || !s.sitesOpen) { dropEscort(bot); return; }
  const m = memOf(bot, s);
  const allianceId = bot.me.alliance?.allianceId;
  if (!allianceId || !s.allianceOf || wonderOf(s, allianceId)) { dropEscort(bot); return; }
  const as = allianceState(ctx, bot.group, s);
  if (!as || founderOf(ctx, s, bot.group, as, allianceId) !== bot) { dropEscort(bot); return; }
  wonderMem(bot).holdEscort = escortWanted(s, bot, null);
  if (await foundTurn(bot, ctx, { left: 1 }, m, s)) bump(m.k, 'foundEarly');
}

module.exports = {
  name: 'wonder',
  early,
  heldEscort, keptForWonder,   // pour les autres modules : les armées gardées pour la Merveille
  deliveryLoad, foodPurchase, wonderLack, memberPart, waveNeed, founderOf, escortWanted, freeSite, mayFound, foundTurn, deliverTurn,   // pour les tests unitaires (tests/unit/sim-bots.test.js)
  async act(bot, ctx) {
    if (!bot.me || !bot.capital || !Array.isArray(bot.armies) || !GROUPS.includes(bot.group)) return;
    const s = await snapshot(ctx);
    if (s.ended || !(s.sitesOpen || s.day >= s.sitesDay - 12)) { dropEscort(bot); return; }
    const m = memOf(bot, s);
    const allianceId = bot.me.alliance?.allianceId;
    if (!allianceId || !s.allianceOf) { dropEscort(bot); return; }
    const B = { left: CALLS };
    const as = allianceState(ctx, bot.group, s);
    const wc = wonderOf(s, allianceId);
    if (!wc) {
      m.wantGuard = false;
      // le fondateur : un colon prêt avant les sites, puis la fondation sur le site libéré (son escorte reste à la maison)
      const founder = as ? founderOf(ctx, s, bot.group, as, allianceId) : null;
      wonderMem(bot).holdEscort = founder === bot && escortWanted(s, bot, null);
      if (founder === bot) {
        if (!(await foundTurn(bot, ctx, B, m, s))) await settlerTurn(bot, ctx, B, m);
      }
      return;
    }
    wonderMem(bot).holdEscort = false;
    if (wc.playerId === bot.playerId) await buildTurn(bot, ctx, B, m, wc);
    if (wc.wonderLevel >= 1 || wc.wonderBuildEndsAt) await defendTurn(bot, ctx, B, m, s, wc);
    await deliverTurn(bot, ctx, B, m, wc);
  },
  async afterStep(ctx) {
    let s;
    try { s = await snapshot(ctx); } catch (e) { console.error('[SIM] merveille :', e); return; }
    if (s.ended || !s.sitesOpen) return;
    for (const g of GROUPS) { try { await council(ctx, s, g); } catch (e) { console.error(`[SIM] merveille, conseil ${g} :`, e); } }
    try { await track(ctx, s); } catch (e) { console.error('[SIM] merveille, suivi :', e); }
    const total = Math.round(ctx.OPT.days * 24 / ctx.OPT.stepHours);
    if (ctx.step % 28 === 0 || ctx.step === total) { try { await summary(ctx, s); } catch (e) { console.error('[SIM] merveille, point :', e); } }
  }
};
