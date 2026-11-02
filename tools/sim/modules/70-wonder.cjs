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
//   les défenseurs postés pèsent moins que la vague voulue (plus bas : sim-e), les membres envoient une « Garde de la
//   Merveille » (rôle wonder de ../armies.cjs ; sans place, une armée de campagne ou l'Ost d'un guerrier) remplie depuis leur
//   garnison : en renfort (POST /api/army/:id/support), ou déplacée (POST /api/army/:id/move) par le propriétaire, dont
//   c'est la ville.
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
// Simulation de 200 jours relue (sim-e) :
// - Défense : les gardes ne pesaient que 1 à 2 % de l'alliance, 298 vagues sur 312 perdues, 92 % des livraisons dans des
//   niveaux détruits puis rebâtis. Chaque membre poste maintenant sa part de la défense voulue (la vague du niveau au-dessus
//   de ce qui est bâti, formule du serveur wonderService.wavePower, avec une marge apprise des vagues tenues ou perdues,
//   + 15 % répartis entre les membres), au début de son tour (28-wonder-early.cjs, avant que le module militaire ne fasse
//   partir ses armées) : la garde se remplit dans la garnison, et dans les armées de campagne au repos vidées dans la
//   garnison quand elle ne suffit pas ; une garde déjà postée ne se regarnit pas à distance, une armée de campagne au repos
//   (ou l'Ost) part la renforcer et rentre quand on n'a plus besoin d'elle : la garde, remplie dans la garnison, la relève.
//   Une garde usée rentre se regarnir quand la garnison peut lui rendre toute sa part. Seules comptent les armées postées et
//   celles qui arrivent avant la prochaine vague. Une garde rentrée vide, ou dont la défense n'a plus besoin, est dissoute
//   (elle gardait une place de la capitale). Le propriétaire ne lance un niveau que si la défense tient la vague de ce niveau.
// - Rassemblements contre les Immortels : ils n'emportaient que 54 à 74 % des armées des capitales. Toutes les armées de
//   campagne des membres restent à la maison jusqu'au rassemblement annoncé (et les livraisons partent seulement avec la
//   caravane ou le convoi) ; la plus forte de chaque membre qui récolte ou attaque un camp est rappelée la veille ; un site
//   ou un plan déjà usé passe avant un neuf, et l'annonce continue contre lui (la première pause après trois conseils
//   faibles est sautée).
// - E6 sous concurrence : la troisième alliance (groupe C, trop petite pour battre les Immortels) forme aussi un colon et
//   guette les sites libérés par les autres ; elle attend la fin de leur réservation de 6 h pour y envoyer son colon.
// Au plus 8 appels par joueur et par tour (14 pour un tour de défense), 400 par pas pour le conseil de chaque alliance.
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
const GROUPS = ['A', 'B'];       // les alliances assez grandes pour la fin de partie (15 à 20 membres) : rassemblements
// les alliances qui jouent la Merveille : les deux grandes, et la petite (C) qui guette les sites libérés par les autres
const END_GROUPS = ['A', 'B', 'C'];
const CALLS = 8;
const DEFENSE_CALLS = 14;        // un tour de défense : former la garde, vider des armées dans la garnison, la remplir, l'envoyer
const COUNCIL_CALLS = 400;       // par alliance (fondre les armées d'un membre et le remplir : une quinzaine d'appels)
const WAITS = config.rally.waitMinutes;
const MAX_WAIT_S = Math.max(...WAITS) * 60;
const ATTRITION = 0.6;           // un rassemblement qui pèse 60 % des Immortels part les user (ils gardent leurs pertes)
const RALLY_SHARE = 0.9;         // part de chaque troupe de la garnison qu'un membre met dans l'armée du rassemblement
const KEEP_STOCK = 0.3;          // part du stockage de toutes les villes (stock commun) gardée pour bâtir quand on livre la Merveille
const COVER_LEVELS = 3;          // livraisons : ce qui manque au chantier pour ses 3 prochains niveaux part d'abord
const STOCK_LEVELS = 10;         // puis ce qui manque pour 10 niveaux ; au-delà, la ressource ne part plus
// défense face à une vague (simulation sim-e : avec le mur 15 et la Forge 20, le vrai moteur tient une vague avec 0,77 à
// 0,89 fois sa puissance ; l'ancienne marge de 1,25 en demandait 1,4 à 1,7 fois le nécessaire) : marge de départ 1, apprise
// ensuite (−0,01 par vague tenue, +0,05 par vague perdue alors que la défense voulue était là)
const DEFENSE_MARGIN = 1;
const MARGIN_MIN = 0.85, MARGIN_MAX = 1.5;
const SHARE_SLACK = 1.15;        // chaque membre poste sa part de la défense voulue, + 15 % (certains ne joueront pas à temps)
const GARRISON_KEEP = 0.1;       // la garnison de la capitale garde 10 % de chaque troupe quand une garde s'y remplit
const NOTIF_ODDS = (wait) => (wait >= 120 ? 0.8 : 0.6);   // un membre qui ne joue pas ce pas-ci voit la notification à temps
// trois conseils de suite sans rassemblement possible (personne à la maison, ou trop faible) : les membres ne gardent plus
// leur armée la plus forte pendant 3 jours (récoltes, livraisons), le conseil essaie encore avec ceux qui sont là
const WEAK_PAUSE = 3;
const QUIET_STEPS = 12;
// armées d'un autre rôle, jamais prises pour un rassemblement ni pour escorter le colon
const ESCORT_NEVER = new Set([Armies.NAMES.guard, Armies.NAMES.wonder, Armies.NAMES.convoy]);
const RALLY_NEVER = new Set([Armies.NAMES.guard, Armies.NAMES.wonder, Armies.NAMES.caravan, Armies.NAMES.convoy]);
// armées jamais vidées ni envoyées pour défendre la Ville Merveille : celles d'un autre rôle (l'Ost part seulement en dernier
// recours, tel quel : ses engins attendent dans la garnison entre deux sièges)
const DEFEND_NEVER = new Set([...RALLY_NEVER, Armies.NAMES.hunt, Armies.NAMES.ost]);

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
// un rassemblement de l'alliance est annoncé : le joueur garde ses armées de campagne à la maison jusqu'à ce pas
const rallyAnnounced = (bot, step) => Number.isFinite(step) && Object.values(bot?.mem?.wonder?.keep || {}).some(until => until > step);
// une armée que les autres modules ne font pas partir : l'escorte gardée, ou celle annoncée pour le rassemblement
function keptForWonder(bot, armyId, step = bot?.ctx?.step) {
  const w = bot?.mem?.wonder;
  if (!w || !armyId) return false;
  if (w.holdEscort === true && heldEscort(bot)?.id === armyId) return true;
  return Number.isFinite(step) && (w.keep?.[armyId] || 0) > step;
}

// ---------- défenseurs d'une Ville Merveille, comme l'alliance les voit ----------
// La prochaine vague frappe 12 h après la dernière (la première, 12 h après le niveau 1). Comptent : les armées postées (renfort
// allié STATIONED, armée du propriétaire au repos dans la ville) et celles en route qui arrivent avant la vague (simulation
// sim-e : les gardes encore en marche comptaient déjà). { nextWaveAt, armies, posted, coming, power, byOwner, list }
function defense(c, armies, now) {
  const nextWaveAt = c.lastImmortalWave ? ms(c.lastImmortalWave) + W.immortalWaveHours * 3600000 : now + W.immortalWaveHours * 3600000;
  const D = { nextWaveAt, armies: 0, posted: 0, coming: 0, power: 0, byOwner: new Map(), list: [] };
  const own = (a) => a.ownerId === c.playerId;
  for (const a of armies) {
    const there = a.status === 'STATIONED' ? a.targetCityId === c.id : own(a) && a.status === 'IDLE' && a.x === c.x && a.y === c.y;
    const toward = !there && (a.status === 'SUPPORTING' ? a.targetCityId === c.id : own(a) && a.status === 'MOVING' && a.targetX === c.x && a.targetY === c.y);
    if (!there && !toward) continue;
    const power = powerOf(a.units);
    const inTime = there || ms(a.arrivalAt) <= nextWaveAt;
    D.list.push({ id: a.id, ownerId: a.ownerId, status: a.status, power, there, inTime });
    if (inTime) addDefender(D, a.ownerId, power, there);
  }
  return D;
}
function addDefender(D, ownerId, power, there = false) {
  D.armies++;
  D.power += power;
  if (there) D.posted += power; else D.coming += power;
  D.byOwner.set(ownerId, (D.byOwner.get(ownerId) || 0) + power);
}
const noDefense = (now) => ({ nextWaveAt: now + W.immortalWaveHours * 3600000, armies: 0, posted: 0, coming: 0, power: 0, byOwner: new Map(), list: [] });

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
      P.city.findMany({ where: { isWonder: true }, select: { id: true, name: true, x: true, y: true, playerId: true, wonderLevel: true, wonderBuildEndsAt: true, lastImmortalWave: true, wonderWood: true, wonderStone: true, wonderIron: true, wonderFood: true } }),
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
    // défenseurs de chaque Ville Merveille, comme le combat d'une vague (defense) : les armées de son propriétaire au repos
    // dans la ville et les renforts alliés postés ; celles en route ne comptent que si elles arrivent avant la vague
    s.defense = new Map();
    if (wonders.length) {
      const guards = await P.army.findMany({ where: { isGarrison: false, OR: wonders.flatMap(c => [
        { ownerId: c.playerId, x: c.x, y: c.y, status: 'IDLE', cityId: { not: c.id } },
        { ownerId: c.playerId, targetX: c.x, targetY: c.y, status: 'MOVING' },
        { targetCityId: c.id, status: { in: ['STATIONED', 'SUPPORTING'] } }
      ]) }, select: { id: true, ownerId: true, x: true, y: true, targetX: true, targetY: true, targetCityId: true, status: true, arrivalAt: true, units: { select: { unitKey: true, count: true, tier: true } } } });
      for (const c of wonders) s.defense.set(c.id, defense(c, guards, now));
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
// des Immortels déjà usés par un rassemblement (ils gardent leurs pertes) : moins de 80 % de leur force de départ
const fullPower = (n) => (n.resourceType === 'PLAN' ? W.immortalPlanPower : W.immortalSitePower);
const worn = (n) => !!n && n.defenderPower > 0 && n.defenderPower < 0.8 * fullPower(n);
// l'alliance peut y fonder à l'heure `at` : pas de réservation, la sienne, ou une réservation finie
const mayFound = (n, allianceId, at) => !n.reservedFor || n.reservedFor === allianceId || at >= n.reservedUntil;
// la défense voulue contre une Merveille de ce niveau : la vague du niveau d'après (formule du serveur), avec la marge apprise
const waveNeed = (level, margin = DEFENSE_MARGIN) => WS.wavePower(Math.max(1, level + 1)) * margin;
// la défense que les membres tiennent prête : la vague du niveau au-dessus de ce qui est bâti, au-dessus du chantier en cours
// s'il y en a un (le niveau suivant part alors sans attendre ; buildTurn ne lance un niveau que si la défense tient sa vague)
const defenseNeed = (wc, margin = DEFENSE_MARGIN) => waveNeed((wc.wonderLevel || 0) + (wc.wonderBuildEndsAt ? 1 : 0), margin);
const marginOf = (as) => (Number.isFinite(as?.dm) ? as.dm : DEFENSE_MARGIN);

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
  // margin : puissance demandée face aux Immortels d'un site ou d'un plan ; dm : marge de la défense face aux vagues
  if (!keeper.mem.wonA || keeper.mem.wonA.w !== s.number) keeper.mem.wonA = { w: s.number, margin: 1.1, dm: DEFENSE_MARGIN, rallies: {}, k: {} };
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
// La petite alliance (C) ne libère pas de site elle-même : son fondateur ne garde l'escorte que lorsqu'un site libéré par une
// autre alliance attend la fin de sa réservation (la carte le montre 6 h à l'avance)
function escortWanted(s, founder, wc) {
  if (wc || !s.sitesOpen || !founder?.capital || !((founder.capital.settlers || 0) > 0)) return false;
  if (founder.group && !GROUPS.includes(founder.group)) return freedSites(s).length > 0;
  return (s.sites || []).some(n => !n.cityId);
}

// ---------- tour du propriétaire : le niveau suivant ----------
// Seulement quand la défense (postée, ou en route et là avant la vague) tient la vague du nouveau niveau : une vague perdue
// ôte un niveau et le chantier en cours (simulation sim-e : 92 % des livraisons perdues ainsi). Le niveau 1 part sans
// attendre (la première vague frappe 12 h après lui, les gardes ont le temps d'arriver).
async function buildTurn(bot, ctx, B, m, wc, margin = DEFENSE_MARGIN, D = SNAP.defense?.get(wc.id)) {
  if (B.left < 2 || wc.wonderBuildEndsAt || wc.playerId !== bot.playerId) return;
  const next = WS.levelCost(wc.wonderLevel + 1);
  if (RES.some(r => (wc[STOCK[r]] || 0) < next[r])) { bump(m.k, 'buildWaitStock'); return; }
  if (wc.wonderLevel >= 1 && (D?.power || 0) < waveNeed(wc.wonderLevel, margin)) { bump(m.k, 'buildWaitDefense'); return; }
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
  // l'escorte du colon ni les armées annoncées pour le prochain rassemblement ; tant qu'un rassemblement est annoncé, seulement
  // la caravane ou le convoi (simulation sim-e : les armées de campagne livraient pendant que le conseil attendait ses armées)
  let trip = market.tripArmies(bot, st.data.armies, ctx.step);
  if (rallyAnnounced(bot, ctx.step)) {
    const porters = trip.filter(a => a.name === Armies.NAMES.caravan || a.name === Armies.NAMES.convoy);
    if (porters.length < trip.length) bump(m.k, 'deliverKeptForRally');
    trip = porters;
  }
  const army = trip.sort((a, b) => b.capacity - a.capacity)[0];
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
const unitPower = (u) => powerOf([{ unitKey: u.unitKey, tier: u.tier, count: 1 }]);
const byRowPower = (p, q) => q.count * unitPower(q) - p.count * unitPower(p);
const garrisonOf = (bot, cap) => (bot.armies || []).find(a => a.isGarrison && a.cityId === cap.id) || null;
// ce que la garnison peut donner (la capitale garde 10 % de chaque troupe)
const givable = (g) => fighters(g?.units).reduce((t, u) => t + Math.floor(u.count * (1 - GARRISON_KEEP)) * unitPower(u), 0);
// les armées de campagne au repos dans la capitale que la défense peut prendre : jamais une armée d'un autre rôle, celles
// d'une fondation en cours, ni l'escorte gardée ; celles annoncées pour un rassemblement en dernier (la Merveille passe
// avant : une vague perdue ôte un niveau et le chantier en cours)
function spareArmies(bot, cap, used = new Set()) {
  const col = bot.mem?.mil?.col;
  const founding = new Set([col?.a, col?.b].filter(Boolean));
  const held = heldEscort(bot);
  const own = new Set(bot.mem?.mil?.own || []);
  return (bot.armies || []).filter(a => !used.has(a.id) && own.has(a.id) && Armies.atHome(a, cap) && !DEFEND_NEVER.has(a.name) && !founding.has(a.id) && a.id !== held?.id && soldiers(a.units) > 0)
    .sort((p, q) => (keptForWonder(bot, p.id) - keptForWonder(bot, q.id)) || (powerOf(q.units) - powerOf(p.units)));
}
// des armées de campagne au repos rendent des soldats à la garnison (set-unit, comme le client) jusqu'à ce qu'elle puisse
// donner `missing` à la garde : les lignes les plus puissantes d'abord, juste ce qu'il faut
async function emptyInto(bot, B, m, cap, garrison, missing, used) {
  let have = givable(garrison);
  for (const a of spareArmies(bot, cap, used)) {
    for (const u of fighters(a.units).sort(byRowPower)) {
      if (have >= missing || B.left <= 3) return;
      const per = unitPower(u) * (1 - GARRISON_KEEP);
      const k = Math.min(u.count, Math.ceil((missing - have) / per));
      B.left--;
      const r = await bot.post(`/api/army/${a.id}/set-unit`, { unitKey: u.unitKey, count: u.count - k });
      if (!r.ok) break;
      const moved = Math.max(0, u.count - (r.data?.newCount ?? u.count - k));
      u.count -= moved;
      const row = (garrison.units ||= []).find(x => x.unitKey === u.unitKey);
      if (row) row.count += moved; else garrison.units.push({ unitKey: u.unitKey, tier: u.tier || UNIT[u.unitKey].tier, count: moved });
      have += moved * per;
      bump(m.k, 'guardFromField', moved);
    }
  }
}
// garnison -> armée (set-unit) jusqu'à `missing` de puissance : les lignes les plus puissantes d'abord, chacune pour ce qui
// manque encore (avant : 60 % des 3 troupes les plus nombreuses, quel que soit le besoin)
async function fillFrom(bot, B, m, army, garrison, missing) {
  let added = 0;
  for (const u of fighters(garrison?.units).sort(byRowPower)) {
    if (added >= missing || B.left <= 1) break;
    const per = unitPower(u);
    const take = Math.min(Math.floor(u.count * (1 - GARRISON_KEEP)), Math.ceil((missing - added) / per));
    if (take < 5) continue;
    const cur = (army.units || []).find(x => x.unitKey === u.unitKey)?.count || 0;
    B.left--;
    const r = await bot.post(`/api/army/${army.id}/set-unit`, { unitKey: u.unitKey, count: cur + take });
    if (!r.ok) break;
    const got = Math.max(0, (r.data?.newCount ?? cur + take) - cur);
    u.count -= got;
    const row = (army.units ||= []).find(x => x.unitKey === u.unitKey);
    if (row) row.count += got; else army.units.push({ unitKey: u.unitKey, tier: u.tier || UNIT[u.unitKey].tier, count: got });
    added += got * per;
    bump(m.k, 'guardSoldiers', got);
  }
  return added;
}
// l'armée se remplit jusqu'à `want` de puissance (la garnison ; pour la garde, aussi les armées de campagne vidées dans la
// garnison quand elle ne suffit pas), puis part : déplacée dans sa propre Ville Merveille, en renfort dans celle d'un autre
// membre. Renvoie la puissance envoyée (0 : elle n'est pas partie)
// (`empty` : vider aussi les armées de campagne au repos ; pas pour relever un renfort, qui est lui-même une armée de campagne)
async function postArmy(bot, ctx, B, m, wc, D, army, want, { guard = false, empty = guard, used = new Set() } = {}) {
  const garrison = garrisonOf(bot, bot.capital);
  const missing = want - powerOf(army.units);
  if (missing > 0 && garrison) {
    if (empty && givable(garrison) < missing) await emptyInto(bot, B, m, bot.capital, garrison, missing, used);
    if (B.left > 1) await fillFrom(bot, B, m, army, garrison, missing);
  }
  if (soldiers(army.units) < 20 || B.left <= 0) return 0;
  B.left--;
  const own = wc.playerId === bot.playerId;
  const r = own
    ? await bot.post(`/api/army/${army.id}/move`, { x: wc.x, y: wc.y })
    : await bot.post(`/api/army/${army.id}/support`, { targetCityId: wc.id });
  if (!r.ok) { bump(m.k, 'guardSendRefused'); return 0; }
  army.status = own ? 'MOVING' : 'SUPPORTING';
  const power = powerOf(army.units);
  // en route : elle compte pour la prochaine vague si elle arrive avant (sinon pour les suivantes)
  const inTime = !r.data?.arrivalAt || ms(r.data.arrivalAt) <= D.nextWaveAt;
  D.list.push({ id: army.id, ownerId: bot.playerId, status: army.status, power, there: false, inTime });
  if (inTime) addDefender(D, bot.playerId, power); else bump(m.k, 'guardLate');
  bump(m.k, guard ? 'guardsSent' : 'defendersSent');
  return power;
}
async function disbandGuard(bot, B, m, g, key) {
  if (B.left <= 0) return false;
  B.left--;
  const r = await bot.del(`/api/army/${g.id}/disband`);
  if (!r.ok) { bump(m.k, 'guardDisbandRefused'); return false; }
  bot.armies = bot.armies.filter(a => a.id !== g.id);
  if (m.guard === g.id) delete m.guard;
  bump(m.k, key);
  return true;
}
// les renforts de la garde (armée de campagne, Ost) rentrent quand la défense tient sans eux et que le membre a posté sa
// part sans eux ; une garde usée (moins d'un cinquième de sa part) rentre aussi quand on peut s'en passer, ou quand la
// garnison peut la regarnir de toute sa part (`refill` : ce que la garnison peut donner ; sans armée de campagne à la maison,
// une garde usée restait postée jusqu'à être anéantie) : à la maison, elle se regarnit ou se dissout. Renvoie la garde, aussi
// celle qui rentre (pas d'autre garde formée pendant qu'elle marche : la seconde restait ensuite pour toujours à la maison,
// sur une place de la capitale)
async function recallSpare(bot, B, m, D, need, share, g, refill = 0) {
  const cap = bot.capital;
  const at = new Map(D.list.map(x => [x.id, x]));
  const counted = (x) => (x?.inTime ? x.power : 0);
  const recall = async (a, key) => {
    if (B.left <= 0) return false;
    B.left--;
    const r = await bot.post(`/api/army/${a.id}/return`);
    if (!r.ok) { bump(m.k, 'defenderReturnRefused'); return false; }
    const x = at.get(a.id);
    a.status = 'RETURNING';
    if (counted(x)) {
      D.power -= x.power; D.armies--;
      if (x.there) D.posted -= x.power; else D.coming -= x.power;
      D.byOwner.set(bot.playerId, (D.byOwner.get(bot.playerId) || 0) - x.power);
      x.inTime = false;
    }
    bump(m.k, key);
    return true;
  };
  for (const id of Object.keys(m.ex || {})) {
    const a = bot.armies.find(x => x.id === id);
    if (!a || Armies.atHome(a, cap)) { delete m.ex[id]; continue; }
    const x = at.get(id);
    if (!x) continue;   // pas (ou plus) à la Ville Merveille : sur le retour
    const mine = D.byOwner.get(bot.playerId) || 0;
    if (D.power - counted(x) >= need * 1.05 && mine - counted(x) >= share && await recall(a, 'defenderRecalled')) delete m.ex[id];
  }
  const x = g && at.get(g.id);
  if (x?.there && x.power < 0.2 * share) {
    const mine = D.byOwner.get(bot.playerId) || 0;
    if (D.power - x.power >= need || mine - x.power >= share || refill >= share) await recall(g, 'guardRecalledWorn');
  }
  return g;
}
// Tour de défense d'un membre (au début de son tour, avant que les autres modules ne fassent partir ses armées) : sa part de
// la défense voulue (defenseNeed, + 15 %, répartie entre les membres qui ont une capitale), moins ce qu'il a déjà posté ou en
// route à temps. La garde d'abord (à la maison, ou formée sur une place libre) ; puis, si la garde est déjà postée, sans
// place ou trop pauvre, une armée de campagne au repos (la plus petite qui suffit), puis l'Ost.
// Relève : quand un renfort de ce membre tient sa part sans garde postée, la garde (formée sur une place libre, que la
// caravane lui rend) se remplit de sa part dans la garnison et part ; le renfort rentre ensuite (recallSpare). Avant, la garde
// rentrée était dissoute puisque le renfort couvrait la part, et le renfort, qui attendait la garde pour rentrer, restait à
// la Ville Merveille jusqu'à être anéanti (l'armée de campagne du membre ne récoltait plus).
async function defendTurn(bot, ctx, B, m, s, wc, as) {
  const cap = bot.capital;
  m.dt = ctx.step;
  s.defense ||= new Map();
  if (!s.defense.has(wc.id)) s.defense.set(wc.id, noDefense(s.now));
  const D = s.defense.get(wc.id);
  const need = defenseNeed(wc, marginOf(as));
  const allianceId = s.allianceOf.get(bot.playerId);
  const members = Math.max(1, ctx.bots.filter(b => b.playerId && b.capital && s.allianceOf.get(b.playerId) === allianceId).length);
  const share = need * SHARE_SLACK / members;
  const mine = () => D.byOwner.get(bot.playerId) || 0;
  const short = () => D.power < need && mine() < share;
  const garrison = garrisonOf(bot, cap);
  let g = guardOf(bot, m);
  // un renfort de ce membre posté (ou là avant la vague) alors que sa garde n'est pas postée : à relever si la garnison
  // peut donner au moins la moitié de sa part
  const exPosted = () => Object.keys(m.ex || {}).some(id => D.list.some(x => x.id === id && x.inTime));
  const relieving = () => !short() && (!g || Armies.atHome(g, cap)) && exPosted() && givable(garrison) >= 0.5 * share;
  // l'emplacement de la garde passe avant la caravane et la chasse (../armies.cjs), seulement quand ce membre doit poster
  m.wantGuard = short() || relieving();
  // garde rentrée (vidée par une vague, ou rappelée) dont la défense n'a pas besoin : dissoute, ses soldats rentrent dans la
  // garnison et sa place de la capitale se libère (simulation sim-e : 8 gardes vides gardaient une place pour toujours)
  if (g && g.name === Armies.NAMES.wonder && Armies.atHome(g, cap) && !short() && !relieving() && await disbandGuard(bot, B, m, g, soldiers(g.units) ? 'guardDisbanded' : 'guardDisbandedEmpty')) g = null;
  // une autre garde de la Merveille à la maison (d'une version d'avant, ou d'une reprise) : dissoute, une seule est suivie
  for (const x of Armies.named(bot, Armies.NAMES.wonder)) if (x !== g && Armies.atHome(x, cap)) await disbandGuard(bot, B, m, x, 'guardDisbandedExtra');
  g = await recallSpare(bot, B, m, D, need, share, g, givable(garrison));
  const relief = relieving();
  if ((!short() && !relief) || B.left < 2 || cap.isSieged) { m.wantGuard = short() || relief; return; }
  bump(m.k, relief ? 'guardReliefWanted' : 'defenseShort');
  // sa part ; davantage (jusqu'au double) quand l'alliance manquerait encore de défense après elle ; pour une relève, toute
  // sa part dans la garde seule
  let want = relief ? share : share - mine();
  if (!relief && D.power + want < need) want = Math.max(want, Math.min(need - D.power, 2 * share - mine()));
  const used = new Set();
  // rien à lui donner (garnison et armées de campagne au repos vides) : pas de garde formée pour être dissoute aussitôt
  const avail = soldiers(garrisonOf(bot, cap)?.units) + spareArmies(bot, cap).reduce((t, a) => t + soldiers(a.units), 0);
  if (!g && avail < 20) bump(m.k, 'guardNothingToGive');
  else if (!g) {
    const slot = Armies.freeSlot(bot, 'wonder');
    if (!slot) bump(m.k, 'guardNoSlot');
    else if (B.left >= 3) {
      B.left--;
      const r = await bot.post('/api/army/create', { cityId: cap.id, slot, name: Armies.NAMES.wonder });
      if (!r.ok || !r.data?.army) bump(m.k, 'guardRefused');
      else {
        g = { ...r.data.army, units: [] };
        bot.armies.push(g);
        m.guard = g.id;
        bump(m.k, 'guardsCreated');
      }
    }
  }
  if (g && Armies.atHome(g, cap)) {
    used.add(g.id);
    const sent = await postArmy(bot, ctx, B, m, wc, D, g, want, { guard: true, empty: !relief, used });
    if (sent) { want -= sent; if (relief) bump(m.k, 'guardRelief'); }
    else if (g.name === Armies.NAMES.wonder && soldiers(g.units) === 0 && await disbandGuard(bot, B, m, g, 'guardDisbandedEmpty')) g = null;   // rien à lui donner
  }
  // ce qui manque encore : une armée de campagne au repos (la plus petite qui suffit, sinon la plus forte), puis l'Ost ; pas
  // pour une relève (le renfort tient déjà la part)
  while (!relief && want > 0.1 * share && B.left >= 2) {
    const spare = spareArmies(bot, cap, used);
    const free = spare.filter(a => !keptForWonder(bot, a.id));
    const pool = free.length ? free : spare;
    const ost = Armies.named(bot, Armies.NAMES.ost).find(a => !used.has(a.id) && Armies.atHome(a, cap) && soldiers(a.units) >= 20) || null;
    const a = pool.filter(x => powerOf(x.units) >= want).sort((p, q) => powerOf(p.units) - powerOf(q.units))[0] || pool[0] || ost;
    if (!a) { bump(m.k, 'defenseNoArmy'); break; }
    used.add(a.id);
    const sent = await postArmy(bot, ctx, B, m, wc, D, a, want, { used });
    if (!sent) break;
    want -= sent;
    (m.ex ||= {})[a.id] = ctx.step;   // renfort de la garde : il rentrera quand on n'aura plus besoin de lui
    if (a.name === Armies.NAMES.ost) bump(m.k, 'ostToWonder');
  }
  // une place pour la garde seulement s'il reste de quoi la remplir
  m.wantGuard = (short() || relieving()) && avail >= 20;
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
  // les armées qui défendent la Ville Merveille (renforts de la garde) n'en sont pas : elles y restent
  const defending = new Set(Object.keys(b.mem?.won?.ex || {}));
  const eligible = mine.filter(a => !a.isGarrison && a.cityId === cap.id && !RALLY_NEVER.has(a.name) && !founding.has(a.id) && a.id !== held?.id && !defending.has(a.id) && a.status !== 'STATIONED' && a.status !== 'SUPPORTING');
  const home = eligible.filter(a => Armies.atHome(a, cap)).sort((p, q) => powerOf(q.units) - powerOf(p.units));
  const full = powerOf(eligible.flatMap(a => fighters(a.units))) + powerOf(shareOf(fighters(garrison?.units)));
  // son armée de campagne la plus forte partie récolter ou attaquer un camp : rappelée la veille du rassemblement (council)
  const own = new Set(b.mem?.mil?.own || []);
  const away = eligible.filter(a => own.has(a.id) && (a.status === 'HARVESTING' || a.status === 'RAIDING') && soldiers(a.units) >= 20).sort((p, q) => powerOf(q.units) - powerOf(p.units))[0] || null;
  const ready = home[0];
  if (!ready) return { full, away };
  const others = home.slice(1);
  const pool = mergeRows([garrison?.units, ...others.map(a => a.units)]);
  const extra = shareOf(pool);
  const pot = powerOf(ready.units) + powerOf(extra);
  // une armée vide sans renfort possible : le serveur la refuserait (« Armée vide »)
  return pot > 0 ? { full, away, part: { b, cap, army: ready, others, garrison, pool, pot, units: [...fighters(ready.units), ...extra] } } : { full, away };
}
async function membersOf(ctx, allianceId, s) {
  const bots = ctx.bots.filter(b => b.playerId && s.allianceOf.get(b.playerId) === allianceId && b.capital);
  const ids = bots.map(b => b.playerId);
  const [armies, caps] = await Promise.all([
    ctx.prisma.army.findMany({ where: { ownerId: { in: ids } }, select: { id: true, ownerId: true, cityId: true, name: true, x: true, y: true, status: true, isGarrison: true, claimedAt: true, units: { select: { unitKey: true, count: true, tier: true } } } }),
    ctx.prisma.city.findMany({ where: { playerId: { in: ids }, isCapital: true }, select: { id: true, playerId: true, x: true, y: true, isSieged: true, buildings: { where: { key: 'RALLY_POINT' }, select: { key: true, level: true } } } })
  ]);
  const parts = [], away = [];
  let potential = 0;
  for (const b of bots) {
    const cap = caps.find(c => c.playerId === b.playerId);
    if (!cap || cap.isSieged) continue;
    const r = memberPart(b, cap, armies.filter(a => a.ownerId === b.playerId));
    potential += r.full;
    if (r.part) parts.push(r.part);
    if (r.away) away.push({ b, army: r.away });
  }
  return { parts, potential, away };
}
// la veille du rassemblement : chaque membre rappelle son armée de campagne la plus forte qui récolte ou attaque un camp
// (comme 60-invasion.cjs pour les donjons) ; un membre qui ne joue pas ce pas-ci le fait s'il voit l'annonce à temps
async function recallAway(ctx, as, away, S) {
  for (const { b, army } of away) {
    if (S.left < 2) break;
    if (!online(ctx, b) && ctx.rand() >= NOTIF_ODDS(120)) { bump(as.k, 'rallyRecallMissed'); continue; }
    S.left--;
    const r = await b.post(`/api/army/${army.id}/return`);
    if (!r.ok) { bump(as.k, 'rallyRecallRefused'); continue; }
    const mine = (b.armies || []).find(a => a.id === army.id);
    if (mine) mine.status = 'RETURNING';
    bump(as.k, 'rallyRecalls');
  }
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
// un conseil sans rassemblement possible ; au troisième de suite, l'annonce s'arrête un moment (as.wp : pauses contre des
// Immortels déjà usés depuis le dernier rassemblement lancé ; l'annonce ne saute que la première, sinon toutes les armées de
// campagne de l'alliance resteraient à la maison tant que le rassemblement échoue)
function weak(ctx, as, node = null) {
  as.nx = ctx.step + 4;
  as.weak = (as.weak || 0) + 1;
  if (as.weak >= WEAK_PAUSE) { as.weak = 0; as.quiet = ctx.step + QUIET_STEPS; bump(as.k, 'announcePaused'); if (worn(node)) as.wp = (as.wp || 0) + 1; }
}
async function launchRally(ctx, s, as, g, allianceId, node, S, parts) {
  const kind = node.resourceType;
  if (!parts.length) { weak(ctx, as, node); bump(as.k, `${kind}NobodyHome`); return; }
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
  if (expected < ATTRITION * need) { weak(ctx, as, node); bump(as.k, `${kind}TooWeak`); return; }
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
  as.weak = 0; as.wp = 0;
  bump(as.k, `${kind}Rallies`); bump(as.k, `wait${wait}`); if (wear) bump(as.k, `${kind}RalliesToWear`);
  ctx.event('wonder_rally', { alliance: s.tagOf.get(allianceId), target: kind, x: node.x, y: node.y, leader: leader.b.name, wait, armies: joined, capacity: max, power: Math.round(power), immortals: node.defenderPower, wear });
}
// le prochain rassemblement est annoncé : toutes les armées de campagne de chaque membre restent à la maison jusque-là, pour
// que le rassemblement les fonde en une (simulation sim-e : seule la plus forte restait, les rassemblements n'emportaient que
// 54 à 74 % des armées des capitales) ; bot.mem.mil.idle pour le module militaire, bot.mem.wonder.keep pour le marché, les
// livraisons (la caravane ou le convoi seulement), le héros et la guerre ; les donjons du week-end les prennent quand même
// (60-invasion.cjs), la défense de la Ville Merveille aussi, en dernier (defendTurn)
function announce(ctx, s, allianceId, until, as) {
  let n = 0;
  for (const b of ctx.bots) {
    if (!b.playerId || s.allianceOf.get(b.playerId) !== allianceId || !b.capital || !Array.isArray(b.armies)) continue;
    const own = new Set(b.mem?.mil?.own || []);
    const col = b.mem?.mil?.col;
    const founding = new Set([col?.a, col?.b].filter(Boolean));
    const defending = new Set(Object.keys(b.mem?.won?.ex || {}));
    const field = b.armies.filter(x => !x.isGarrison && own.has(x.id) && !founding.has(x.id) && !defending.has(x.id) && x.cityId === b.capital.id);
    if (!field.length) continue;
    wonderMem(b).keep = Object.fromEntries(field.map(a => [a.id, until]));
    if (b.mem.mil) { b.mem.mil.idle ||= {}; for (const a of field) if ((b.mem.mil.idle[a.id] || 0) < until) b.mem.mil.idle[a.id] = until; }
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
  // la cible : un site ou un plan déjà usé d'abord (les Immortels gardent leurs pertes : simulation sim-e, le plan usé n'était
  // jamais repris), puis le plus proche des capitales des membres
  const nearest = (nodes) => nodes.filter(n => n.hasDefenders && n.defenderPower > 0 && !n.cityId && !s.rallies.some(r => r.targetNodeId === n.id))
    .sort((a, b) => (worn(b) - worn(a)) || (ourCaps.reduce((t, c) => t + dist(a, c), 0) - ourCaps.reduce((t, c) => t + dist(b, c), 0)))[0] || null;
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
    // la petite alliance (C) ne mène pas de rassemblement contre les Immortels (trop faible) : elle guette les sites libérés
    // par les autres et attend la fin de leur réservation (E6)
    if (!GROUPS.includes(g)) return;
    if (mineActive('WONDER')) return;   // un rassemblement déjà en route vers un site : on attend
    if ((founder.capital?.settlers || 0) > 0) target = nearest(s.sites);
    else bump(as.k, 'waitSettler');
  }
  if (!target && GROUPS.includes(g) && s.plansOpen && !s.planAlliances.has(allianceId) && !mineActive('PLAN') && !mineActive('WONDER')) target = nearest(s.plans);
  if (target) {
    const { parts, potential, away } = await membersOf(ctx, allianceId, s);
    if ((as.nx || 0) <= ctx.step && S.left >= 10) await launchRally(ctx, s, as, g, allianceId, target, S, parts);
    // le prochain rassemblement est annoncé quand l'alliance peut le tenter (ses armées, même dehors, pèsent assez) : chaque
    // membre garde ses armées de campagne à la maison jusque-là ; pas pendant la pause qui suit trois conseils sans
    // rassemblement possible (weak), sauf la première contre des Immortels déjà usés : l'alliance revient finir le travail
    const ready = potential >= ATTRITION * target.defenderPower * as.margin;
    if (ready && ((as.quiet || 0) <= ctx.step || (worn(target) && (as.wp || 0) < 2))) {
      announce(ctx, s, allianceId, Math.max(as.nx || 0, ctx.step + 1) + 1, as);
      // la veille du rassemblement : les armées qui récoltent ou attaquent un camp rentrent
      if ((as.nx || 0) - ctx.step === 1) await recallAway(ctx, as, away, S);
    }
  }
  if (!wc) return;
  // fin de niveau ou défense arrivée : le propriétaire, prévenu, lance le niveau suivant (toujours s'il joue ce pas-ci, sinon
  // une fois sur deux à peu près)
  const owner = ctx.bots.find(b => b.playerId === wc.playerId);
  if (owner && !wc.wonderBuildEndsAt && (online(ctx, owner) || ctx.rand() < 0.6)) await buildTurn(owner, ctx, { left: 2 }, memOf(owner, s), wc, marginOf(as));
}

// ---------- suivi : villes fondées, niveaux, vagues, point d'étape ----------
// Ce qui a déjà été vu (Ville Merveille -> niveau) est gardé avec l'état de la simulation (premier joueur : mem.wonSeen), et
// les rapports des vagues se lisent dans la fenêtre du curseur de la boucle (ctx.cursor, ../resume.cjs), bornée à l'heure
// du pas : une reprise ne recompte ni les Villes Merveille fondées ni les vagues (simulation sim-e : après la reprise du jour
// 156, 4 Villes Merveille comptées et des vagues relues ; ces deux mémoires n'étaient pas enregistrées)
function seenOf(ctx, s, K) {
  const b = ctx.bots[0];
  if (!b.mem.wonSeen || b.mem.wonSeen.w !== s.number) {
    // état d'une version d'avant (sans cette mémoire) qui a déjà compté ces villes : elles sont vues, sans nouvel événement
    const known = !b.mem.wonSeen && (K.citiesFounded || 0) >= (s.wonders || []).length;
    b.mem.wonSeen = { w: s.number, levels: known ? Object.fromEntries((s.wonders || []).map(c => [c.id, c.wonderLevel])) : {} };
  }
  return b.mem.wonSeen;
}
let WAVES_AT = null;   // sans curseur de la boucle (tests unitaires) : l'heure de la dernière lecture
function wavesWindow(ctx, s) {
  if (typeof ctx.cursor === 'function') return ctx.cursor('wonderWaves', s.now);
  const since = new Date(WAVES_AT ?? s.now - 6 * 3600000);
  WAVES_AT = Math.max(s.now, WAVES_AT ?? 0);
  return { since, until: new Date(WAVES_AT) };
}
async function track(ctx, s) {
  const K = (ctx.bots[0].mem.wonS ||= {});
  const SEEN = seenOf(ctx, s, K);
  for (const c of s.wonders || []) {
    const before = SEEN.levels[c.id];
    if (before === undefined) {
      // la réservation du site (E6) : l'alliance qui l'a libéré, et quand la fondation a été lancée après la bataille
      const site = (s.sites || []).find(n => n.cityId === c.id || (n.x === c.x && n.y === c.y));
      const rv = site ? RESV.get(site.id) : null;
      const al = s.allianceOf.get(c.playerId);
      ctx.event('wonder_city_founded', { alliance: s.tagOf.get(al), owner: ctx.bots.find(b => b.playerId === c.playerId)?.name || null, x: c.x, y: c.y, worldDay: s.day, freedBy: rv ? (s.tagOf.get(rv.by) || null) : null, sameAlliance: rv ? rv.by === al : null });
      bump(K, 'citiesFounded');
      if (rv) bump(K, rv.by === al ? 'citiesOnOwnSite' : 'citiesOnOtherSite');
    } else if (c.wonderLevel > before) { for (let l = before + 1; l <= c.wonderLevel; l++) if (l % 10 === 0 || l <= 3) ctx.event('wonder_level', { alliance: s.tagOf.get(s.allianceOf.get(c.playerId)), level: l, worldDay: s.day }); bump(K, 'levelsBuilt', c.wonderLevel - before); }
    SEEN.levels[c.id] = c.wonderLevel;
  }
  // les vagues d'Immortels du pas (rapports de bataille « IMMORTALS ») : tenues ou perdues, par niveau ; la marge de défense
  // de l'alliance s'ajuste (−0,01 par vague tenue ; +0,05 par vague perdue alors que la défense voulue était postée) ;
  // l'événement donne la puissance postée face à celle de la vague et la part des soldats de l'alliance qui était postée
  const { since, until } = wavesWindow(ctx, s);
  const reps = await ctx.prisma.battleReport.findMany({ where: { createdAt: { gt: since, lte: until }, defenderId: { not: null } }, select: { id: true, winner: true, loot: true, defenderUnits: true, playerId: true, defenderId: true } });
  const troops = new Map();   // alliance -> soldiers de tous ses membres (lus une fois par pas)
  for (const r of reps) {
    if (r.loot?.type !== 'IMMORTALS' || r.playerId !== r.defenderId) continue;
    const held = r.winner === 'DEFENDER';
    bump(K, held ? 'wavesHeld' : 'wavesLost');
    if (!held) bump(K, 'levelsLost');   // une vague perdue ôte un niveau (compté vague par vague, pas en net sur le pas)
    const c = (s.wonders || []).find(x => x.id === r.loot?.cityId);
    // le niveau frappé : celui d'après la vague, plus celui qu'elle a ôté
    const level = c ? c.wonderLevel + (held ? 0 : 1) : null;
    if (level) bump(K, `${held ? 'held' : 'lost'}L${Math.floor(level / 10) * 10}`);
    const defenders = (r.defenderUnits || []).reduce((t, u) => t + (u.count || 0), 0);
    const posted = powerOf((r.defenderUnits || []).map(u => ({ unitKey: u.key, tier: u.tier, count: u.count })));
    const wave = level ? WS.wavePower(level) : 0;
    const al = c ? s.allianceOf.get(c.playerId) : null;
    const as = al ? stateOfAlliance(ctx, s, al) : null;
    if (as && wave) {
      const dm = marginOf(as);
      if (held) as.dm = Math.max(MARGIN_MIN, Math.round((dm - 0.01) * 100) / 100);
      else if (posted >= 0.9 * dm * wave) as.dm = Math.min(MARGIN_MAX, Math.round((dm + 0.05) * 100) / 100);
    }
    if (al && !troops.has(al)) troops.set(al, await allianceSoldiers(ctx, s, al).catch(() => 0));
    const all = al ? troops.get(al) : 0;
    ctx.event('wonder_wave', { reportId: r.id, levelBefore: r.loot?.wonderLevel ?? null, city: r.loot?.cityName, alliance: al ? s.tagOf.get(al) : null, level, held, wallBroken: !!r.loot?.wallBroken, defenders, posted: Math.round(posted), wave: Math.round(wave), ratio: wave ? Math.round(posted / wave * 100) / 100 : null, allianceSoldiers: all || null, postedShare: all ? Math.round(defenders / all * 1000) / 1000 : null, margin: as ? marginOf(as) : null });
  }
}
// l'état d'alliance (keeper du groupe) d'une alliance de la fin de partie
function stateOfAlliance(ctx, s, allianceId) {
  for (const g of END_GROUPS) if (groupAlliance(ctx, s, g) === allianceId) return allianceState(ctx, g, s);
  return null;
}
// soldats (sans les engins) de tous les membres d'une alliance, garnisons comprises
async function allianceSoldiers(ctx, s, allianceId) {
  const ids = [...s.allianceOf].filter(([, a]) => a === allianceId).map(([p]) => p);
  if (!ids.length) return 0;
  const rows = await ctx.prisma.armyUnit.groupBy({ by: ['unitKey'], where: { count: { gt: 0 }, army: { ownerId: { in: ids } } }, _sum: { count: true } });
  return rows.filter(x => UNIT[x.unitKey] && !isSiege(x.unitKey)).reduce((t, x) => t + (x._sum.count || 0), 0);
}
async function summary(ctx, s) {
  const k = {};
  for (const b of ctx.bots) for (const [key, v] of Object.entries(b.mem.won?.k || {})) k[key] = (k[key] || 0) + v;
  const alliances = {};
  for (const g of END_GROUPS) { const as = ctx.byGroup(g).find(b => b.playerId)?.mem?.wonA; if (as) alliances[g] = { margin: as.margin, defenseMargin: marginOf(as), founder: ctx.bots.find(b => b.playerId === as.founder)?.name || null, ...as.k }; }
  const defenders = (D) => (D ? { armies: D.armies, posted: Math.round(D.posted), coming: Math.round(D.coming), power: Math.round(D.power) } : null);
  const wonders = (s.wonders || []).map(c => ({ alliance: s.tagOf?.get(s.allianceOf.get(c.playerId)) || null, level: c.wonderLevel, stock: RES.reduce((t, r) => t + Math.floor(c[STOCK[r]] || 0), 0), defenders: defenders(s.defense?.get(c.id)), need: Math.round(defenseNeed(c, marginOf(stateOfAlliance(ctx, s, s.allianceOf.get(c.playerId))))) }));
  const sites = { total: (s.sites || []).length, guarded: (s.sites || []).filter(n => n.hasDefenders).length, built: (s.sites || []).filter(n => n.cityId).length };
  const plans = { left: (s.plans || []).length, held: s.planAlliances ? [...s.planAlliances].map(a => s.tagOf.get(a)) : [] };
  ctx.event('wonder_summary', { step: ctx.step, worldDay: s.day, sites, plans, wonders, alliances, world: ctx.bots[0].mem.wonS || {}, counters: k });
  ctx.say(`merveille : ${JSON.stringify({ day: s.day, sites, plans, wonders: wonders.map(w => `${w.alliance}:${w.level}`), delivered: k.delivered || 0, waves: ctx.bots[0].mem.wonS || {} })}`);
}

// début du tour (28-wonder-early.cjs, avant le module militaire qui envoie ses armées au repos en mission) : la défense de
// la Ville Merveille d'abord (la garde se remplit avant que les armées de campagne ne partent) ; sans Ville Merveille, le
// fondateur fonde sur le site libéré, avec l'escorte gardée à la maison
async function early(bot, ctx) {
  if (!bot.me || !bot.capital || !Array.isArray(bot.armies) || !END_GROUPS.includes(bot.group)) return;
  const s = await snapshot(ctx);
  if (s.ended || !s.sitesOpen) { dropEscort(bot); return; }
  const m = memOf(bot, s);
  const allianceId = bot.me.alliance?.allianceId;
  if (!allianceId || !s.allianceOf) { dropEscort(bot); return; }
  const as = allianceState(ctx, bot.group, s);
  const wc = wonderOf(s, allianceId);
  if (wc) {
    dropEscort(bot);
    if (wc.wonderLevel >= 1 || wc.wonderBuildEndsAt) await defendTurn(bot, ctx, { left: DEFENSE_CALLS }, m, s, wc, as);
    return;
  }
  if (!as || founderOf(ctx, s, bot.group, as, allianceId) !== bot) { dropEscort(bot); return; }
  wonderMem(bot).holdEscort = escortWanted(s, bot, null);
  if (await foundTurn(bot, ctx, { left: 1 }, m, s)) bump(m.k, 'foundEarly');
}

module.exports = {
  name: 'wonder',
  early,
  heldEscort, keptForWonder,   // pour les autres modules : les armées gardées pour la Merveille
  deliveryLoad, foodPurchase, wonderLack, memberPart, waveNeed, defenseNeed, founderOf, escortWanted, freeSite, mayFound, foundTurn, deliverTurn, defendTurn, buildTurn, defense, announce, worn, track,   // pour les tests unitaires (tests/unit/sim-bots.test.js)
  async act(bot, ctx) {
    if (!bot.me || !bot.capital || !Array.isArray(bot.armies) || !END_GROUPS.includes(bot.group)) return;
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
    // la défense se joue au début du tour (early) ; ici seulement si ce tour-là n'a pas eu lieu
    if ((wc.wonderLevel >= 1 || wc.wonderBuildEndsAt) && m.dt !== ctx.step) await defendTurn(bot, ctx, { left: DEFENSE_CALLS }, m, s, wc, as);
    if (wc.playerId === bot.playerId) await buildTurn(bot, ctx, B, m, wc, marginOf(as));
    await deliverTurn(bot, ctx, B, m, wc);
  },
  async afterStep(ctx) {
    let s;
    try { s = await snapshot(ctx); } catch (e) { console.error('[SIM] merveille :', e); return; }
    if (s.ended || !s.sitesOpen) return;
    for (const g of END_GROUPS) { try { await council(ctx, s, g); } catch (e) { console.error(`[SIM] merveille, conseil ${g} :`, e); } }
    try { await track(ctx, s); } catch (e) { console.error('[SIM] merveille, suivi :', e); }
    const total = Math.round(ctx.OPT.days * 24 / ctx.OPT.stepHours);
    if (ctx.step % 28 === 0 || ctx.step === total) { try { await summary(ctx, s); } catch (e) { console.error('[SIM] merveille, point :', e); } }
  }
};
