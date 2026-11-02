// Simulation longue — invasions barbares et rassemblements d'alliance (décision du 29 octobre 2026 ; services/hordeService.js,
// services/rallyService.js). Chaque week-end (vendredi 18 h → dimanche 23 h, heure de Paris), des donjons de hordes à trois
// étages apparaissent ; ils ne s'attaquent qu'en rassemblement d'alliance.
// - Un membre d'alliance dont une armée est libre ouvre le panneau du donjon que son alliance peut battre (puissance de
//   l'étage en cours face à la sienne et à celle des membres qui se connectent après lui, assez près pour arriver avant le
//   départ), puis lance le rassemblement (POST /api/rallies, attente de 60 min ; 5 min et départ immédiat s'il suffit seul).
// - Les membres qui se connectent ensuite y envoient une armée (POST /api/rallies/:id/join) si elle arrive avant le départ,
//   d'abord au rassemblement à qui il manque le plus de puissance.
// - En fin de pas, le lanceur fait partir son rassemblement (/launch) quand les armées arrivées suffisent, le laisse partir au
//   tick si les retardataires sont nécessaires, ou l'annule (/cancel) s'il est trop faible ; de loin en loin, un membre d'un
//   rassemblement bien trop fort retire son armée (/leave).
// - L'armée : « Chasse aux hordes », créée le week-end sur un emplacement libre de la Place de rassemblement et remplie depuis
//   la garnison (la ville garde 20 % de ses soldats), dissoute le lundi ; sans emplacement libre, une armée de campagne du
//   module militaire (ou le convoi d'alliance) au repos en ville est empruntée.
// - Issues suivies (étages vaincus, donjons détruits et trésor partagé, rassemblements repoussés ou annulés), événements
//   invasion_start / invasion_end ; de temps en temps, l'administrateur (bot 0) lance une invasion manuelle en semaine
//   (POST /api/admin/invasion/start) et parfois la termine plus tôt (/api/admin/invasion/end).
// Au plus 30 appels par joueur et par tour pour ce module ; les conditions sont vérifiées avant d'appeler.
//
// Rapport de vérification du 31 octobre 2026 (§ 6.6 et § 6.9 : 0 donjon détruit, les joueurs automatiques n'attaquaient
// qu'avec leurs 2 troupes les plus nombreuses, sans la garnison, et jamais pour user un étage) :
// - l'armée de chasse prend toutes les troupes de la garnison (la ville en garde 10 %) ;
// - usure : un étage garde ses pertes ; quand l'alliance n'a pas de quoi le battre, un rassemblement qui pèse au moins la
//   moitié de l'étage part quand même l'user (sa défaite n'apprend rien à la marge) ;
// - attente du rassemblement : la plus courte des attentes permises (5 à 180 min) qui laisse arriver les membres attendus ;
// - l'armée de chasse est le rôle hunt des emplacements partagés de la Place de rassemblement (../armies.cjs), le dernier.
//
// Simulation après ces décisions (rapport sim-d, relu : 1 419 donjons, aucun détruit, un seul combat contre un chef) :
// - cible : un donjon que l'alliance a commencé passe d'abord (×3), l'étage du chef surtout (×5, ×1,5 pour l'étage 2) ; un
//   donjon neuf seulement quand aucun commencé n'est à sa portée et que l'alliance peut le finir avant la fin de l'invasion ;
//   au plus 2 rassemblements de l'alliance en attente (ensuite on rejoint), un seul par donjon ; pour le chef, une attente de
//   120 min au moins et plus de membres comptés (la notification d'un chef est suivie) ;
// - armée : la plus forte au repos (armée de campagne, convoi, Ost, ou l'armée de chasse), où se fondent les autres armées au
//   repos de la ville (leurs soldats rentrent dans la garnison, set-unit à 0 comme le client), plus 90 % de la garnison ;
//   jamais l'escorte du colon de la Ville Merveille (70-wonder.cjs ; l'armée annoncée pour un rassemblement de la Merveille,
//   elle, part au donjon le week-end) ;
// - marche : la longueur de la route du serveur (le même A* que la carte du client), sinon la ligne droite × 1,5 ; le temps
//   que le serveur donne (refus « n'arriverait pas à temps : N min de marche », arrivée d'un envoi) est retenu pour la paire
//   de villes (avant : ligne droite × 1,25, 123 refus sur 1 212 envois) ;
// - entre deux pas : subTick (appelé par sim.cjs après chaque tick d'une heure d'un pas qui presse) fait partir les
//   rassemblements prêts, relève les issues, et les membres qui jouent ce pas-ci dont une armée vient de rentrer d'un
//   rassemblement de donjon rejoignent ou lancent l'étage suivant sans attendre le pas suivant ; nextDue donne à sim.cjs
//   l'heure du retour de ces armées (un tick d'une heure à ce moment-là).
//
// Simulation de 200 jours relue (sim-e : aucun rassemblement contre un donjon de niveau 4 ou 5 sur 1 075, la décision E5 ne
// pouvait pas être jugée pour eux) :
// - ce que l'alliance peut abattre d'ici la fin (portée d'un donjon neuf) se compte sur tous ses membres : la meilleure armée
//   prête de chacun, ou, si c'est plus, 80 % de son armée de campagne la plus forte (partie récolter, elle rentre pendant le
//   week-end) avec ce que la garnison lui donnera ; avant, seulement les membres qui avaient une armée à la maison et jouaient
//   encore ce pas-ci ; le suivi compte les donjons neufs de niveau 4 ou 5 restés hors de portée (outOfReachL4, outOfReachL5)
//   et la plus grande part de leur force que la portée a atteinte (reachPctMaxL4, reachPctMaxL5) ;
// - l'alliance peut ouvrir un donjon neuf d'un niveau au-dessus du plus haut qu'elle a commencé, même quand un donjon
//   commencé est à sa portée (un seul à la fois par niveau), s'il entre dans cette portée. Le combat d'un rassemblement
//   contre un étage est celui du serveur (combatService.resolveCombat : puissance contre puissance, bonus du lanceur) ; la
//   marge apprise (rassemblements gagnés ou repoussés) en tient compte ;
// - chefs combattus, battus ou repoussés, comptés par niveau (bossBeatenL4, bossRepelledL5…) avec les armées du rassemblement.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { unitsData } = require(path.join(ROOT, 'src/config/gamedata'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const Armies = require('../armies.cjs');
const { heldEscort } = require('./70-wonder.cjs');   // l'escorte que le fondateur de la Ville Merveille garde pour son colon
// l'escorte du colon de la Ville Merveille ne part jamais. L'armée annoncée pour le prochain rassemblement de la Merveille
// (bot.mem.wonder.keep), elle, va aux donjons le week-end : un rassemblement de donjon ne dure que quelques heures, et sans
// elle l'armée la plus forte de chaque membre manquait à tous les donjons de la phase des sites à la fin de la partie,
// quand les armées sont les plus grosses (les chefs des donjons demandent ces armées-là)
const isEscort = (bot, id) => !!id && heldEscort(bot)?.id === id;

const I = config.invasion;
const TIER = config.combat.tierCoefficients;
const UNIT = Object.fromEntries(unitsData.map(u => [u.key, u]));
const NAME = Armies.NAMES.hunt;
const MAX_CALLS = 30;        // fondre les autres armées de la ville et remplir l'armée : une quinzaine d'appels
const KEEP = 0.1;            // part des soldats laissée à la garnison
const ATTRITION = 0.5;       // un rassemblement qui pèse la moitié de l'étage part l'user (les pertes de l'étage restent)
const WAITS = config.rally.waitMinutes;
const MAX_WAIT_S = Math.max(...WAITS) * 60;
const SLACK = 1.5;           // sans la route du serveur : la ligne droite × 1,5 (au-dessus de 90 % des routes entre alliés)
const MAX_GATHERING = 2;     // rassemblements de l'alliance en attente au plus : au-delà, on rejoint
const BOSS_WAIT = 120;       // attente minimale contre le chef (les membres éloignés arrivent)
// armées qui ne se fondent jamais dans celle qui part : celles d'un autre rôle
const MERGE_NEVER = new Set([Armies.NAMES.guard, Armies.NAMES.wonder, Armies.NAMES.caravan, Armies.NAMES.convoy]);
const lvl = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const isSiege = (k) => UNIT[k]?.class === 'SIEGE';
const fighters = (units) => (units || []).filter(u => u.count > 0 && UNIT[u.unitKey] && !isSiege(u.unitKey));
const countOf = (units) => fighters(units).reduce((t, u) => t + u.count, 0);
const unitPow = (k, tier) => { const d = UNIT[k]; return d ? ((d.stats?.attack || 0) + (d.stats?.defense || 0)) * (TIER[tier || d.tier] || 1) : 0; };
const powerOf = (units) => (units || []).reduce((t, u) => t + unitPow(u.unitKey, u.tier) * (u.count || 0), 0);
const secPerTile = (units) => { const sp = fighters(units).map(u => UNIT[u.unitKey].stats?.speed || 50); return 30 * 50 / Math.max(1, Math.min(...(sp.length ? sp : [40]))); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const atHome = (a, city) => !!a && !!city && !a.isGarrison && a.status === 'IDLE' && !a.claimedAt && a.x === city.x && a.y === city.y;
const garrisonOf = (bot, cityId) => bot.armies.find(a => a.isGarrison && a.cityId === cityId) || null;
const ms = (d) => (d ? new Date(d).getTime() : 0);
const treasureOf = (level) => ({ res: Math.round(I.treasure.resources * Math.pow(I.treasure.resourceFactor, level - 1)), gold: Math.round(I.treasure.gold * Math.pow(I.treasure.goldFactor, level - 1)), ap: Math.round(I.treasure.alliancePoints * Math.pow(I.treasure.goldFactor, level - 1)) });
const PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
const parisParts = (t) => { const p = Object.fromEntries(PARIS.formatToParts(new Date(t)).map(x => [x.type, x.value])); return { dow: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday], h: +p.hour }; };
// mêmes unités réunies (garnison et armées qui se fondent)
function poolRows(lists) {
  const by = new Map();
  for (const u of lists.flatMap(l => fighters(l))) {
    const row = by.get(u.unitKey);
    if (row) row.count += u.count; else by.set(u.unitKey, { unitKey: u.unitKey, tier: u.tier || UNIT[u.unitKey].tier, count: u.count });
  }
  return [...by.values()];
}

// ---------- état (mem : identifiants et compteurs) ----------
function memOf(bot) {
  const m = (bot.mem.inv ||= {});
  m.k ||= {};
  m.p ||= [];          // rassemblements lancés, en attente d'issue
  m.ra ||= {};         // armées parties avec un rassemblement de donjon -> pas (leur retour : nextDue, chain)
  delete m.far;        // villes de lanceur évitées 7 jours après un refus (avant le temps de marche du serveur) : plus suivi
  return m;
}
const bump = (m, k, n = 1) => { m.k[k] = (m.k[k] || 0) + n; };
// statistiques du monde : gardées avec l'état de la simulation (premier joueur)
function stats(ctx) {
  const g = (ctx.bots[0].mem.invS ||= {});
  g.margin ||= 1.15;   // puissance demandée face à l'étage (apprise : monte après une défaite)
  g.k ||= {};
  return g;
}
const gbump = (ctx, k, n = 1) => { const g = stats(ctx); g.k[k] = (g.k[k] || 0) + n; };

// appels d'un joueur pour ce module (au plus `max`), comptés
function budget(bot, m, max = MAX_CALLS) {
  let left = max;
  return {
    left: () => left,
    call: async (method, p, body) => {
      if (left <= 0) return { ok: false, status: -1, data: null };
      left--;
      const r = await bot.api(method, p, body);
      bump(m, 'calls');
      if (r.ok) bump(m, 'ok'); else if (r.status >= 400 && r.status < 500) { bump(m, 'refused'); m.lastRefusal = `${method} ${p.replace(/[0-9a-f-]{36}/g, ':id')} ${r.status} ${String(r.data?.error || '').slice(0, 90)}`; } else bump(m, 'failed');
      return r;
    }
  };
}

// ---------- ce que voit le joueur, lu une fois par pas (et après chaque tick d'une heure, subTick) ----------
let S = { step: -1, launched: [] };
// la carte : chaque donjon, son étage et la barre de vie de la garnison en cours ; les donjons que chaque alliance a
// commencés (dégâts au classement du donjon)
async function readWorld(ctx) {
  const inv = await ctx.prisma.invasion.findFirst({ where: { endedAt: null } });
  const out = { inv, nodes: new Map(), started: new Map() };
  if (!inv) return out;
  const hordes = await ctx.prisma.horde.findMany({ where: { invasionId: inv.id, destroyedAt: null }, select: { id: true, nodeId: true, x: true, y: true, level: true, floor: true, floors: true } });
  const nodes = await ctx.prisma.resourceNode.findMany({ where: { id: { in: hordes.map(h => h.nodeId) } }, select: { id: true, defenderPower: true } });
  const pw = new Map(nodes.map(n => [n.id, n.defenderPower || 0]));
  for (const h of hordes) if (pw.has(h.nodeId)) out.nodes.set(h.nodeId, { nodeId: h.nodeId, x: h.x, y: h.y, level: h.level, floor: h.floor, full: h.floors?.[h.floor - 1]?.power || 0, rest: (h.floors || []).slice(h.floor).reduce((t, f) => t + (f.power || 0), 0), power: pw.get(h.nodeId) });
  const nodeOf = new Map(hordes.map(h => [h.id, h.nodeId]));
  const dmg = hordes.length ? await ctx.prisma.hordeDamage.findMany({ where: { hordeId: { in: hordes.map(h => h.id) }, points: { gt: 0 } }, select: { hordeId: true, allianceId: true } }) : [];
  for (const d of dmg) {
    if (!d.allianceId || !nodeOf.has(d.hordeId)) continue;
    if (!out.started.has(d.allianceId)) out.started.set(d.allianceId, new Set());
    out.started.get(d.allianceId).add(nodeOf.get(d.hordeId));
  }
  return out;
}
async function stepState(ctx, force = false) {
  if (S.step === ctx.step && !force) return S;
  // les rassemblements lancés qui attendent encore restent suivis d'un pas à l'autre (lancés entre deux pas : subTick)
  const now = ctx.clock.now();
  const keep = (S.launched || []).filter(L => !L.done && L.launchAt > now - 60000);
  S = { step: ctx.step, ...(await readWorld(ctx)), leaderCity: S.leaderCity instanceof Map ? S.leaderCity : new Map(), launched: keep };
  return S;
}
// la ville du lanceur (le point de rassemblement que montre la carte)
async function leaderCity(ctx, rallyId) {
  if (S.leaderCity.has(rallyId)) return S.leaderCity.get(rallyId);
  const r = await ctx.prisma.rally.findUnique({ where: { id: rallyId }, select: { cityId: true } });
  const c = r ? await ctx.prisma.city.findUnique({ where: { id: r.cityId }, select: { id: true, x: true, y: true } }) : null;
  if (S.leaderCity.size > 500) S.leaderCity.clear();
  S.leaderCity.set(rallyId, c);
  return c;
}
// le tick qui suit l'instant t (les combats et les départs se jouent aux ticks)
const stepMs = (ctx) => ctx.OPT.stepHours * 3600000;
const tickAfter = (ctx, t) => ctx.OPT.start + Math.ceil((t - ctx.OPT.start) / stepMs(ctx)) * stepMs(ctx);
const nextTick = (ctx) => ctx.OPT.start + (ctx.step + 1) * stepMs(ctx);
// le joueur joue ce pas-ci : la règle de la boucle (ctx.plays, si la simulation la donne), sinon un pas sur deux
const actsNow = (ctx, b) => (typeof ctx.plays === 'function' ? !!ctx.plays(b) : (ctx.step + b.turn) % 2 === 0 || !!b.mem.alwaysOn);

// ---------- durée de marche ----------
// longueur de la route entre deux cases (src/utils/pathfinding.js routeLength : le même A* que le serveur et la carte du
// client), gardée par paire de cases ; sans réponse, la ligne droite × 1,5 ; pas de chemin : jamais
const ROUTES = new Map();
let routeLength = null;
async function routeTiles(a, b, faction) {
  const key = `${a.x},${a.y}>${b.x},${b.y}|${faction || ''}`;
  if (ROUTES.has(key)) return ROUTES.get(key);
  let len;
  try {
    routeLength ||= require(path.join(ROOT, 'src/utils/pathfinding')).routeLength;
    len = await routeLength(a.x, a.y, b.x, b.y, faction || null);
  } catch (e) {
    if (e?.code !== 'NO_ROUTE') return dist(a, b) * SLACK;   // lecture ratée : l'estimation, sans la garder
    len = Infinity;
  }
  if (ROUTES.size > 20000) ROUTES.clear();
  ROUTES.set(key, len);
  return len;
}
// le temps que le serveur a donné pour une paire de villes (refus ou envoi), avec la lenteur de l'armée d'alors :
// { secs, spt } ; une autre armée de la même ville marche en proportion de sa lenteur (s par case)
const LEARNED = new Map();
const pairKey = (from, to) => (from?.id && to?.id ? `${from.id}@${from.x},${from.y}>${to.id}@${to.x},${to.y}` : null);   // une capitale tombée change de place
function learn(from, to, spt, secs) {
  const k = pairKey(from, to);
  if (!k || !(secs > 0) || !(spt > 0)) return;
  if (LEARNED.size > 5000) LEARNED.clear();
  LEARNED.set(k, { secs, spt });
}
// durée de marche (s) de l'armée de l'option jusqu'à une ville (sans les bonus de vitesse : prudent ; le temps appris les
// compte)
async function marchSecs(o, to, faction) {
  if (o.city.x === to.x && o.city.y === to.y) return 0;
  const l = LEARNED.get(pairKey(o.city, to));
  if (l) return l.secs * o.spt / l.spt;
  return (await routeTiles(o.city, to, faction)) * o.spt + 60;
}

// ---------- armées ----------
// les autres armées au repos de la ville, qui se fondent dans celle qui part (un rassemblement ne prend qu'une armée par
// joueur) : jamais une armée d'un autre rôle, celles d'une fondation en cours, ni l'escorte du colon de la Ville Merveille
function mergeable(bot, army, city) {
  const col = bot.mem.mil?.col;
  const busy = new Set([col?.a, col?.b].filter(Boolean));
  return bot.armies.filter(a => a.id !== army?.id && !MERGE_NEVER.has(a.name) && !busy.has(a.id) && a.cityId === city.id && atHome(a, city) && countOf(a.units) > 0 && !isEscort(bot, a.id));
}
// ce que la garnison (et les armées qui se fondent) donne à l'armée : toutes ses troupes, la ville garde 10 % des soldats
function takeRows(bot, army, city, merge = []) {
  const g = garrisonOf(bot, city.id);
  const pool = poolRows([g?.units, ...merge.map(a => a.units)]);
  const have = countOf(army?.units);
  let want = Math.floor((countOf(pool) + have) * (1 - KEEP)) - have;
  if (want < 10) return [];
  const out = [];
  for (const u of pool.sort((a, b) => b.count - a.count)) {
    const take = Math.min(Math.floor(u.count * (1 - KEEP)), want);
    if (take < 5) continue;
    out.push({ unitKey: u.unitKey, tier: u.tier || UNIT[u.unitKey].tier, count: take });
    want -= take;
  }
  return out;
}
function option(bot, army, city, create) {
  // le convoi d'alliance part tel quel avec la garnison (les autres armées ne se fondent pas dans une armée d'un autre rôle)
  const merge = army && MERGE_NEVER.has(army.name) ? [] : mergeable(bot, army, city);
  const rows = takeRows(bot, army, city, merge);
  const units = [...fighters(army?.units), ...rows];
  return { army, city, create, merge, rows, pot: powerOf(units), spt: secPerTile(units) };
}
// les armées que le joueur peut mener ou envoyer maintenant (estimate : sans rien changer à sa mémoire)
function usableArmies(bot, m, estimate = false) {
  const cityOf = (id) => bot.cities.find(c => c.id === id) || null;
  const own = m.a ? bot.armies.find(a => a.id === m.a) : null;
  if (m.a && !own && !estimate) delete m.a;
  if (own) {
    const c = cityOf(own.cityId);
    return c && !c.isSieged && atHome(own, c) && !isEscort(bot, own.id) ? [option(bot, own, c, false)].filter(o => o.pot > 0) : [];
  }
  const cap = bot.capital;
  if (!cap || cap.isSieged) return [];
  const mil = bot.mem.mil || {};
  const milOwn = new Set(mil.own || []);
  // un emplacement libre que les autres rôles n'attendent pas (../armies.cjs, la chasse vient en dernier) : l'armée de chasse
  // s'y forme
  if (Armies.freeSlot(bot, 'hunt') && countOf(garrisonOf(bot, cap.id)?.units) >= 40) return [option(bot, null, cap, true)];
  // pas d'emplacement libre : une armée de campagne au repos, le convoi d'alliance ou l'Ost ; pendant une fondation, ni
  // l'armée qui frappe le camp ni celle du colon, et la capitale garde une armée au repos pour l'escorte (comme le module
  // militaire) ; jamais l'escorte du colon de la Ville Merveille
  const reserved = new Set([mil.col?.a, mil.col?.b].filter(Boolean));
  const keepHome = !!mil.col && (mil.col.ph === 'approach' || mil.col.ph === 'ready');
  const idleInCapital = bot.armies.filter(a => milOwn.has(a.id) && !reserved.has(a.id) && a.cityId === cap.id && atHome(a, cap)).length;
  const out = [];
  for (const a of bot.armies) {
    if (a.isGarrison || reserved.has(a.id) || !(milOwn.has(a.id) || a.name === Armies.NAMES.convoy || a.name === Armies.NAMES.ost)) continue;
    const c = cityOf(a.cityId);
    if (!c || c.isSieged || !atHome(a, c) || !lvl(c, 'RALLY_POINT') || isEscort(bot, a.id)) continue;
    if (keepHome && c.id === cap.id && milOwn.has(a.id) && idleInCapital <= 1) continue;
    const o = option(bot, a, c, false);
    o.borrow = true;
    if (o.pot >= 3000) out.push(o);
  }
  return out.sort((x, y) => y.pot - x.pot).slice(0, 2);
}
async function ensureArmy(bot, B, m, o) {
  if (o.army) return o.army;
  if (!o.create || B.left() < 2) return null;
  const slot = Armies.freeSlot(bot, 'hunt');
  if (!slot) return null;
  const r = await B.call('POST', '/api/army/create', { cityId: o.city.id, slot, name: NAME });
  if (!r.ok || !r.data?.army) return null;
  const army = { ...r.data.army, units: [], power: 0 };
  bot.armies.push(army);
  m.a = army.id;
  bump(m, 'created');
  o.army = army;
  return army;
}
// les autres armées au repos rendent leurs soldats à la garnison (set-unit à 0, comme le client ; les engins restent à leur
// place) : l'armée qui part les reprend avec la garnison (fill)
async function mergeHome(bot, B, m, o) {
  const g = garrisonOf(bot, o.city.id);
  if (!g) return;
  for (const a of o.merge || []) {
    if (a.id === o.army?.id) continue;
    for (const u of fighters(a.units)) {
      if (B.left() <= 3) return;
      const r = await B.call('POST', `/api/army/${a.id}/set-unit`, { unitKey: u.unitKey, count: 0 });
      if (!r.ok) break;
      const n = u.count;
      u.count = 0;
      const gr = (g.units ||= []).find(x => x.unitKey === u.unitKey);
      if (gr) gr.count += n; else g.units.push({ unitKey: u.unitKey, tier: u.tier || UNIT[u.unitKey].tier, count: n });
      bump(m, 'merged', n);
    }
  }
}
// garnison -> armée (set-unit, comme le client), en gardant un appel pour la suite
async function fill(bot, B, m, o) {
  const army = o.army;
  const g = garrisonOf(bot, o.city.id);
  for (const row of o.rows) {
    if (B.left() <= 1) break;
    const cur = (army.units || []).find(u => u.unitKey === row.unitKey);
    const r = await B.call('POST', `/api/army/${army.id}/set-unit`, { unitKey: row.unitKey, count: (cur?.count || 0) + row.count });
    if (!r.ok) break;
    const got = Math.max(0, (r.data?.newCount ?? (cur?.count || 0) + row.count) - (cur?.count || 0));
    if (cur) cur.count += got; else (army.units ||= []).push({ unitKey: row.unitKey, tier: row.tier, count: got });
    const gr = (g?.units || []).find(u => u.unitKey === row.unitKey);
    if (gr) gr.count -= got;
    bump(m, 'moved', got);
  }
  o.rows = [];
}
// l'armée prête à partir : créée s'il le faut, les autres armées fondues, remplie depuis la garnison
async function prepare(bot, B, m, o) {
  const army = await ensureArmy(bot, B, m, o);
  if (!army) return null;
  if (o.merge?.length) await mergeHome(bot, B, m, o);
  if (o.rows.length) await fill(bot, B, m, o);
  return countOf(army.units) ? army : null;
}
// un envoi vers le rassemblement : le temps de marche que donne le serveur est retenu (arrivée, ou refus « N min de marche »)
async function joinRally(bot, B, m, o, rallyId, lc, ctx) {
  const j = await B.call('POST', `/api/rallies/${rallyId}/join`, { armyId: o.army.id });
  if (j.ok) {
    o.army.status = 'RALLY_JOIN';
    const secs = (ms(j.data?.arrivalAt) - ctx.clock.now()) / 1000;
    if (secs > 0) learn(o.city, lc, secPerTile(o.army.units), secs);
    m.ra[o.army.id] = ctx.step;
    bump(m, 'joined'); if (o.borrow) bump(m, 'borrowed');
    return true;
  }
  bump(m, 'joinRefused');
  const mins = String(j.data?.error || '').match(/\((\d+) min de marche/);
  if (mins) { learn(o.city, lc, secPerTile(o.army.units), +mins[1] * 60); bump(m, 'joinTooFar'); }
  return false;
}

// ---------- les membres qui se connectent après lui dans ce pas, assez près pour arriver avant le départ ----------
// (ceux qui ne jouent pas ce pas-ci répondent parfois à la notification du rassemblement : comptés moins)
const NOTIF_ODDS = 0.6;
async function expectedJoiners(bot, ctx, city, allianceId) {
  const idx = ctx.bots.indexOf(bot);
  const out = [];
  for (let i = 0; i < ctx.bots.length; i++) {
    const b = ctx.bots[i];
    if (b === bot || b.me?.alliance?.allianceId !== allianceId || !Array.isArray(b.armies)) continue;
    const later = actsNow(ctx, b);
    if (later && i < idx) continue;   // il a déjà joué ce pas-ci
    let best = null;
    for (const o of usableArmies(b, b.mem.inv || {}, true)) {
      const secs = await marchSecs(o, city, b.faction);
      if (secs < MAX_WAIT_S - 600 && (!best || o.pot > best.pot)) best = { pot: o.pot, secs };   // ils se connectent quelques minutes plus tard
    }
    if (best) out.push({ pot: best.pot * (later ? 1 : NOTIF_ODDS), secs: best.secs + 60 });
  }
  return out.sort((a, b) => b.pot - a.pot);
}

// ---------- ce que toute l'alliance amène à un rassemblement ----------
// pour chaque membre : sa meilleure armée prête (usableArmies, sans rien changer à sa mémoire), ou, si c'est plus, 80 % de
// son armée de campagne la plus forte avec ce que la garnison lui donnera (elle rentre pendant le week-end ; invasionTurn la
// rappelle). Avec une place libre, l'armée « prête » est souvent celle à former avec la seule garnison : l'armée de campagne
// partie récolter n'était alors pas comptée
function alliancePot(ctx, allianceId) {
  let sum = 0;
  for (const b of ctx.bots) {
    if (!allianceId || b.me?.alliance?.allianceId !== allianceId || !b.capital || !Array.isArray(b.armies)) continue;
    const ready = Math.max(0, ...usableArmies(b, b.mem.inv || {}, true).map(o => o.pot));
    const own = new Set(b.mem.mil?.own || []);
    const field = Math.max(0, ...b.armies.filter(a => own.has(a.id) && !a.isGarrison).map(a => powerOf(fighters(a.units))));
    const garrison = powerOf(fighters(garrisonOf(b, b.capital.id)?.units)) * (1 - KEEP);
    sum += Math.max(ready, 0.8 * (field + garrison));
  }
  return sum;
}

// ---------- la cible d'un nouveau rassemblement ----------
// joinPot : ce que les membres attendus apportent (certains rejoindront un autre rassemblement : 60 % ; contre un chef, la
// notification est suivie : 80 %). Score : le trésor au plus près (ce qu'il reste à abattre), le plus haut niveau (objet plus
// probable au dernier coup), un donjon commencé par l'alliance ×3, l'étage du chef ×5 (×1,5 pour l'étage 2) ; un étage à user
// compte moitié, sauf celui du chef. Un donjon neuf n'est pris que si aucun donjon commencé n'est à portée et que
// l'alliance peut le finir avant la fin de l'invasion (reachCap : ce qu'elle abat en un rassemblement, fois les
// rassemblements qui restent)
const joinShare = (n) => (n.floor === 3 ? 0.8 : 0.6);
function targetScore(n, p, mine) {
  return treasureOf(n.level).res * 1000 / Math.max(1, n.power + n.rest) * (1 + 0.2 * (n.level - 1)) * (mine ? 3 : 1)
    * (n.floor === 3 ? 5 : n.floor === 2 ? 1.5 : 1) * (p.wear && n.floor < 3 ? 0.5 : 1) - p.march / 600000;
}
// maxStarted : le plus haut niveau des donjons que l'alliance a commencés ; un donjon neuf plus haut reste permis quand un
// donjon commencé est à portée (sinon l'alliance ne quittait jamais les petits niveaux)
function pickTarget(nodes, { started, margin, plan, reachCap, maxStarted = Infinity }) {
  const ok = [];
  for (const n of nodes) {
    if (!(n.power > 0)) continue;
    const p = plan(n, n.power * margin);
    if (p.solo || p.group || p.wear) ok.push({ n, p });
  }
  const startedOk = ok.some(x => started.has(x.n.nodeId));
  let best = null;
  for (const { n, p } of ok) {
    const fresh = n.floor === 1 && !started.has(n.nodeId);
    if (fresh && ((startedOk && n.level <= maxStarted) || (n.power + n.rest) * margin > reachCap)) continue;
    const score = targetScore(n, p, started.has(n.nodeId));
    if (!best || score > best.score) best = { n, p, score };
  }
  return best;
}

// ---------- tour d'un membre pendant une invasion ----------
async function invasionTurn(bot, ctx, m, st, allianceId) {
  const usable = usableArmies(bot, m);
  if (!usable.length) {
    bump(m, 'noArmy');
    const field = bot.armies.filter(a => !a.isGarrison && a.name !== 'Convoi');
    bump(m, !field.length ? 'noArmyNone' : field.some(a => a.status === 'IDLE') ? 'noArmyIdleNotUsable' : 'noArmyAway');
    // l'armée de campagne récolte : il la rappelle pour l'invasion (une fois par invasion)
    if (m.rc !== st.inv.id && !m.a) {
      const mil = bot.mem.mil || {};
      const reserved = new Set([mil.col?.a, mil.col?.b].filter(Boolean));
      const away = bot.armies.filter(a => (mil.own || []).includes(a.id) && !reserved.has(a.id) && a.status === 'HARVESTING' && countOf(a.units) >= 20 && !isEscort(bot, a.id)).sort((x, y) => powerOf(y.units) - powerOf(x.units))[0];
      if (away && !mil.col) {
        m.rc = st.inv.id;
        const r = await budget(bot, m, 1).call('POST', `/api/army/${away.id}/return`);
        if (r.ok) { away.status = 'RETURNING'; bump(m, 'recalled'); }
      }
    }
    return;
  }
  const B = budget(bot, m);
  const g = stats(ctx);
  const list = await B.call('GET', '/api/rallies');
  if (!list.ok) return;
  const rallies = (list.data?.rallies || []).filter(r => r.kind === 'HORDE');
  const targeted = new Set(rallies.filter(r => r.status === 'GATHERING' || r.status === 'MARCHING').map(r => r.targetNodeId));
  const now = ctx.clock.now();

  // 1. rejoindre : le rassemblement à qui il manque le plus de puissance (le chef d'abord), que l'armée atteint avant le départ
  let best = null;
  for (const r of rallies) {
    if (r.status !== 'GATHERING' || r.joined || r.mine || (r.armies || []).length >= r.maxArmies) continue;
    const node = st.nodes.get(r.targetNodeId);
    if (!node) continue;
    const lc = await leaderCity(ctx, r.id);
    if (!lc) continue;
    const need = node.power * g.margin;
    if (r.power >= need * 2.5) continue;   // assez fort sans lui : il garde son armée pour un autre donjon
    const left = (ms(r.launchAt) - now) / 1000;
    for (const o of usable) {
      const secs = await marchSecs(o, lc, bot.faction);
      if (secs > left - 30) continue;
      const score = Math.min(need - r.power, o.pot) * 2 - secs + (node.floor === 3 ? 2e6 : node.floor === 2 ? 5e5 : 0);
      if (!best || score > best.score) best = { r, o, lc, score, node };
    }
  }
  if (best) {
    const army = await prepare(bot, B, m, best.o);
    if (!army || B.left() < 1) return;
    if (await joinRally(bot, B, m, best.o, best.r.id, best.lc, ctx) && best.node.floor === 3) bump(m, 'joinedBoss');
    return;
  }

  // 2. lancer : au plus 2 rassemblements de l'alliance en attente (au-delà, les membres rejoignent), un seul par donjon
  if (rallies.filter(r => r.status === 'GATHERING').length >= MAX_GATHERING) { bump(m, 'onlyJoin'); return; }
  const endsAt = ms(st.inv.endsAt);
  const o = usable.find(x => x.city.isCapital) || usable[0];
  const rp = lvl(bot.capital, 'RALLY_POINT');   // celle de la capitale vaut pour toutes les villes (capitale seulement)
  if (!rp || B.left() < 3) return;
  // taille d'un rassemblement (décision du 31 octobre 2026) : la Place de rassemblement de la capitale du lanceur
  const capacity = fx.rallyMaxArmies(rp);
  const joiners = (await expectedJoiners(bot, ctx, o.city, allianceId)).slice(0, capacity - 1);
  const joinSum = joiners.reduce((t, x) => t + x.pot, 0);
  const nt = nextTick(ctx);
  const plan = (n, need) => {
    const march = dist(o.city, n) * o.spt * SLACK * 1000;
    const joinPot = joinSum * joinShare(n);
    const solo = o.pot >= need && tickAfter(ctx, now + 120000 + march) < endsAt;
    const group = o.pot + joinPot >= need && tickAfter(ctx, nt + march) < endsAt;   // au pire, départ au prochain tick
    // usure : le groupe pèse au moins la moitié de l'étage, l'étage gardera ses pertes
    const wear = !group && o.pot + joinPot >= ATTRITION * need && tickAfter(ctx, nt + march) < endsAt;
    return { solo, group, wear, march, joinPot };
  };
  // ce que l'alliance abat d'ici la fin : 60 % de ce que tous ses membres amènent, un rassemblement tous les deux pas
  const reachCap = Math.max(o.pot + joinSum * 0.6, alliancePot(ctx, allianceId) * 0.6) * Math.max(1, Math.floor((endsAt - nt) / stepMs(ctx) / 2));
  const started = st.started?.get(allianceId) || new Set();
  const maxStarted = Math.max(0, ...[...started].map(id => st.nodes.get(id)?.level || 0));
  // suivi (rapport, E5) : le donjon neuf de niveau 4 ou 5 le moins cher hors de portée de l'alliance d'ici la fin, et la plus
  // grande part de lui que cette portée a atteinte (en %)
  for (const lv of [4, 5]) {
    const cheapest = Math.min(...[...st.nodes.values()].filter(n => n.level === lv && n.floor === 1 && !started.has(n.nodeId)).map(n => (n.power + n.rest) * g.margin));
    if (!Number.isFinite(cheapest) || cheapest <= reachCap) continue;
    bump(m, `outOfReachL${lv}`);
    g.k[`reachPctMaxL${lv}`] = Math.max(g.k[`reachPctMaxL${lv}`] || 0, Math.round(100 * reachCap / cheapest));
  }
  const target = pickTarget([...st.nodes.values()].filter(n => !targeted.has(n.nodeId)), { started, margin: g.margin, plan, reachCap, maxStarted });
  if (!target) { bump(m, 'noTarget'); return; }
  // ce que voit le joueur avant de lancer : l'invasion en cours, puis le panneau du donjon
  const inv = await B.call('GET', '/api/invasion');
  if (!inv.ok || !inv.data?.active || !(inv.data.invasion?.hordes || []).some(h => h.nodeId === target.n.nodeId)) return;
  const v = await B.call('GET', `/api/invasion/horde/${target.n.nodeId}`);
  if (!v.ok || v.data?.destroyed) return;
  const left = (v.data.floors || []).find(f => f.current)?.left ?? target.n.power;
  const need = Math.max(1, left) * g.margin;
  const p = plan(target.n, need);
  if (!p.solo && !p.group && !p.wear) { bump(m, 'noTarget'); return; }
  const army = await prepare(bot, B, m, o);
  if (!army || B.left() < 1) return;
  const power = powerOf(army.units);
  // assez fort seul : il part seul s'il n'attend personne, sinon une fois sur quatre (l'alliance se rassemble d'habitude)
  const solo = power >= need && p.solo && (p.joinPot < need * 0.25 || ctx.rand() < 0.25);
  const wear = !solo && power + p.joinPot < need;
  if (wear && power + p.joinPot < ATTRITION * need) { bump(m, 'tooWeak'); return; }
  // l'attente : la plus courte qui laisse arriver les membres attendus (30 min au moins pour un groupe, 120 contre le chef,
  // 180 au plus)
  const reach = joiners.length ? Math.max(...joiners.map(x => x.secs)) + 600 : 0;
  const floorWait = target.n.floor === 3 ? BOSS_WAIT : 30;
  const wait = solo ? WAITS[0] : (WAITS.find(w => w >= floorWait && w * 60 >= reach) || WAITS[WAITS.length - 1]);
  const r = await B.call('POST', '/api/rallies', { armyId: army.id, nodeId: target.n.nodeId, waitMinutes: wait });
  if (!r.ok || !r.data?.rally) { bump(m, 'launchRefused'); return; }
  army.status = 'RALLY_WAIT';
  m.ra[army.id] = ctx.step;
  const id = r.data.rally.id;
  m.p.push(id); if (m.p.length > 8) m.p.shift();
  (m.f ||= {})[id] = target.n.floor;   // l'étage visé (un autre rassemblement peut l'abattre avant)
  if (wear) (m.w ||= {})[id] = 1;      // rassemblement d'usure : sa défaite n'apprend rien à la marge
  bump(m, 'launched'); bump(m, `launchedL${target.n.level}`); bump(m, `launchedF${target.n.floor}`); bump(m, `wait${wait}`);
  if (started.has(target.n.nodeId)) bump(m, 'launchedStarted');
  if (wear) bump(m, 'launchedToWear'); if (o.borrow) bump(m, 'borrowed');
  S.launched.push({ leader: bot.name, alliance: allianceId, id, nodeId: target.n.nodeId, need, march: p.march, solo, wear, capacity: r.data.maxArmies || capacity, launchAt: ms(r.data.rally.launchAt) });
  if (solo && B.left() > 0) {
    // assez fort seul : il part sans attendre
    const l = await B.call('POST', `/api/rallies/${id}/launch`);
    if (l.ok) { bump(m, 'launchedSolo'); S.launched[S.launched.length - 1].done = true; }
  }
}

// ---------- notification « Rassemblement d'alliance » : des membres qui ne jouent pas ce pas-ci y répondent ----------
async function responders(ctx) {
  if (!S.inv) return;
  const now = ctx.clock.now();
  for (const L of S.launched) {
    if (L.done || L.launchAt - now < 10 * 60000) continue;
    const lc = await leaderCity(ctx, L.id);
    if (!lc) continue;
    const cands = [];
    for (const b of ctx.bots) {
      if (b.name === L.leader || actsNow(ctx, b) || b.me?.alliance?.allianceId !== L.alliance || !Array.isArray(b.armies) || b.mem.inv?.rs === ctx.step) continue;
      let best = 0;
      for (const o of usableArmies(b, b.mem.inv || {}, true)) if (await marchSecs(o, lc, b.faction) < (L.launchAt - now) / 1000 - 120 && o.pot > best) best = o.pot;
      if (best > 0) cands.push({ b, pot: best });
    }
    // contre le chef, la notification est mieux suivie
    const odds = (S.nodes.get(L.nodeId)?.floor === 3) ? 0.8 : NOTIF_ODDS;
    for (const { b } of cands.sort((x, y) => y.pot - x.pot).slice(0, Math.max(0, L.capacity - 1))) {
      if (ctx.rand() >= odds) continue;   // n'a pas vu la notification à temps
      const m = memOf(b);
      m.rs = ctx.step;
      const B = budget(b, m, 20);
      const ar = await B.call('GET', '/api/army');
      if (!ar.ok || !Array.isArray(ar.data)) continue;
      b.armies = ar.data;
      const usable = usableArmies(b, m);
      if (!usable.length) continue;
      const lr = await B.call('GET', `/api/rallies?nodeId=${L.nodeId}`);
      const r = (lr.data?.rallies || []).find(x => x.id === L.id);
      if (!r || r.status !== 'GATHERING' || r.joined || (r.armies || []).length >= r.maxArmies || r.power >= L.need * 2.5) continue;
      const left = (ms(r.launchAt) - ctx.clock.now()) / 1000;
      let o = null;
      for (const x of usable.sort((p, q) => q.pot - p.pot)) if (await marchSecs(x, lc, b.faction) <= left - 30) { o = x; break; }
      if (!o) continue;
      const army = await prepare(b, B, m, o);
      if (!army || B.left() < 1) continue;
      if (await joinRally(b, B, m, o, L.id, lc, ctx)) bump(m, 'joinedFromNotification');
    }
  }
}

// ---------- fin du pas : départ anticipé, départ au tick ou annulation ----------
// earlyOnly (après un tick d'une heure, subTick) : seulement le départ anticipé des rassemblements prêts
async function settleLaunched(ctx, { earlyOnly = false } = {}) {
  const now = ctx.clock.now();
  const endsAt = ms(S.inv?.endsAt);
  for (const L of S.launched) {
    if (L.done) continue;
    const b = ctx.bots.find(x => x.name === L.leader);
    if (!b) continue;
    const m = memOf(b);
    const B = budget(b, m, 3);
    const r = await B.call('GET', `/api/rallies?nodeId=${L.nodeId}`);
    const rally = (r.data?.rallies || []).find(x => x.id === L.id);
    if (!rally || rally.status !== 'GATHERING') { if (r.ok) L.done = true; continue; }
    let armies = rally.armies || [];
    const arrivedOf = (list) => list.filter(a => a.status === 'RALLY_WAIT' || (a.status === 'RALLY_JOIN' && ms(a.arrivalAt) <= ctx.clock.now()));
    let arrived = arrivedOf(armies).reduce((t, a) => t + (a.power || 0), 0);
    let total = armies.reduce((t, a) => t + (a.power || 0), 0);
    if (earlyOnly) {
      // toutes les armées sont là et le groupe suffit : il part tout de suite (l'attente ne servirait à rien)
      if (arrived >= L.need && arrivedOf(armies).length === armies.length) {
        const l = await B.call('POST', `/api/rallies/${L.id}/launch`);
        if (l.ok) { L.done = true; bump(m, 'launchedEarly'); bump(m, 'launchedBetweenSteps'); }
      }
      continue;
    }
    // de loin en loin : un membre d'un rassemblement bien trop fort retire son armée (pour la garder chez lui)
    const extra = armies.filter(a => !a.mine && a.owner !== b.name);
    if (extra.length >= 2 && arrived - (extra[extra.length - 1].power || 0) >= L.need * 2.5 && ctx.rand() < 0.3) {
      const out = extra[extra.length - 1];
      const ob = ctx.bots.find(x => x.name === out.owner);
      if (ob) {
        const om = memOf(ob);
        const lv = await budget(ob, om, 1).call('POST', `/api/rallies/${L.id}/leave`);
        if (lv.ok) { bump(om, 'left'); armies = armies.filter(a => a.id !== out.id); arrived = arrivedOf(armies).reduce((t, a) => t + (a.power || 0), 0); total -= out.power || 0; }
      }
    }
    if (arrived >= L.need) {
      const l = await B.call('POST', `/api/rallies/${L.id}/launch`);
      if (l.ok) { L.done = true; bump(m, 'launchedEarly'); if (armies.length > arrivedOf(armies).length) bump(m, 'leftBehind', armies.length - arrivedOf(armies).length); }
    } else if (total >= L.need && tickAfter(ctx, nextTick(ctx) + L.march) < endsAt) {
      bump(m, 'departAtTick');   // les retardataires sont nécessaires : départ au prochain tick
    } else if (L.wear && total >= ATTRITION * L.need && tickAfter(ctx, nextTick(ctx) + L.march) < endsAt) {
      bump(m, 'departToWear');   // usure : il part user l'étage au prochain tick
    } else {
      const c = await B.call('POST', `/api/rallies/${L.id}/cancel`);
      if (c.ok) { L.done = true; bump(m, 'cancelled'); m.p = m.p.filter(x => x !== L.id); if (m.f) delete m.f[L.id]; gbump(ctx, 'cancelledWeak'); }
    }
    void now;
  }
}

// ---------- issues des rassemblements (lecture de la base : rapports et notifications des joueurs) ----------
const TAGS = new Map();
async function tagOf(ctx, allianceId) {
  if (!allianceId) return null;
  if (!TAGS.has(allianceId)) TAGS.set(allianceId, (await ctx.prisma.alliance.findUnique({ where: { id: allianceId }, select: { tag: true } }).catch(() => null))?.tag || '?');
  return TAGS.get(allianceId);
}
async function trackOutcomes(ctx) {
  const g = stats(ctx);
  const owners = new Map();
  for (const b of ctx.bots) for (const id of b.mem.inv?.p || []) owners.set(id, b);
  if (!owners.size) return;
  const rows = await ctx.prisma.rally.findMany({ where: { id: { in: [...owners.keys()] } }, select: { id: true, status: true, result: true, targetNodeId: true, targetX: true, targetY: true, allianceId: true, createdAt: true } });
  const seen = new Set(rows.map(r => r.id));
  for (const [id, b] of owners) if (!seen.has(id)) { b.mem.inv.p = b.mem.inv.p.filter(x => x !== id); if (b.mem.inv.f) delete b.mem.inv.f[id]; if (b.mem.inv.w) delete b.mem.inv.w[id]; }
  for (const r of rows) {
    const b = owners.get(r.id);
    const m = memOf(b);
    const planned = m.f?.[r.id];
    const wore = !!m.w?.[r.id];
    const drop = () => { m.p = m.p.filter(x => x !== r.id); if (m.f) delete m.f[r.id]; if (m.w) delete m.w[r.id]; };
    if (r.status === 'GATHERING' || r.status === 'MARCHING') { if (ctx.clock.now() - ms(r.createdAt) > 3 * 86400000) drop(); continue; }
    if (r.status === 'CANCELLED') {
      const why = String(r.result?.reason || '?');
      gbump(ctx, /lanceur/.test(why) ? 'cancelledByLeader' : /tomb|reparti/.test(why) ? 'cancelledGone' : /aucune/.test(why) ? 'cancelledEmpty' : 'cancelledOther');
      drop(); continue;
    }
    if (r.status !== 'DONE' || !r.result) continue;
    drop();
    const res = r.result;
    const horde = r.targetNodeId ? await ctx.prisma.horde.findUnique({ where: { nodeId: r.targetNodeId }, select: { id: true, level: true, x: true, y: true } }) : null;
    const tag = await tagOf(ctx, r.allianceId);
    if (res.gone) { gbump(ctx, 'gone'); gbump(ctx, res.reason === 'aucune armée' ? 'goneArmiesLostOnTheWay' : 'goneDungeonLeft'); continue; }
    const base = { tag, leader: b.name, level: horde?.level || null, floor: res.floor, x: r.targetX, y: r.targetY, armies: res.armies, points: res.points };
    // combats contre le chef, aussi par niveau, avec les armées (une par joueur) du rassemblement
    if (res.floor === 3) {
      const key = `${res.won ? 'bossBeaten' : 'bossRepelled'}L${horde?.level || 0}`;
      gbump(ctx, res.won ? 'bossBeaten' : 'bossRepelled');
      gbump(ctx, key);
      gbump(ctx, `${key}Armies`, Array.isArray(res.armies) ? res.armies.length : Number(res.armies) || 0);
    }
    if (!res.won) {
      gbump(ctx, 'repelled');
      // usure voulue : l'étage garde ses pertes, la marge ne change pas ; l'étage visé : la puissance demandée monte ;
      // l'étage suivant (un autre rassemblement a abattu le visé juste avant) : non
      if (wore) { gbump(ctx, 'woreFloor'); gbump(ctx, `woreL${horde?.level || 0}`); }
      else if (planned === undefined || planned === res.floor) g.margin = Math.min(2, Math.round((g.margin + 0.05) * 100) / 100);
      else gbump(ctx, 'repelledNextFloor');
      ctx.event('rally_repelled', { ...base, margin: g.margin, wear: wore });
      continue;
    }
    gbump(ctx, 'floorsCleared'); gbump(ctx, `floorsL${horde?.level || 0}`);
    g.margin = Math.max(1.08, Math.round((g.margin - 0.01) * 100) / 100);
    if (!res.destroyed) { ctx.event('horde_floor_cleared', base); continue; }
    // donjon détruit : le trésor partagé selon les dégâts, l'objet du dernier coup
    gbump(ctx, 'destroyed'); gbump(ctx, `destroyedL${horde?.level || 0}`);
    const T = treasureOf(horde?.level || 1);
    const dmg = horde ? await ctx.prisma.hordeDamage.findMany({ where: { hordeId: horde.id, points: { gt: 0 } }, select: { playerId: true, allianceId: true, points: true } }) : [];
    const totalPts = dmg.reduce((t, d) => t + d.points, 0) || 1;
    const byAlliance = {};
    for (const d of dmg) { const t = (await tagOf(ctx, d.allianceId)) || '-'; byAlliance[t] = Math.round(((byAlliance[t] || 0) + d.points / totalPts) * 100) / 100; }
    const note = await ctx.prisma.notification.findFirst({ where: { kind: 'invasion', AND: [{ body: { contains: `(${r.targetX}, ${r.targetY}) est tombé` } }, { body: { contains: 'Dernier coup' } }] }, select: { body: true } }).catch(() => null);
    const item = note ? (note.body.match(/trouve « (.+?) »/) || [])[1] || 'objet' : null;
    if (item) gbump(ctx, 'items');
    g.k.treasureRes = (g.k.treasureRes || 0) + T.res; g.k.treasureGold = (g.k.treasureGold || 0) + T.gold; g.k.treasureAp = (g.k.treasureAp || 0) + T.ap;
    ctx.event('horde_destroyed', { ...base, contributors: dmg.length, shares: byAlliance, treasure: { eachResource: T.res, gold: T.gold, alliancePoints: T.ap }, item });
  }
}

// ---------- début et fin d'invasion ----------
async function invasionEvents(ctx) {
  const g = stats(ctx);
  const cur = S.inv?.id || null;
  if (g.cur && g.cur !== cur) {
    const inv = await ctx.prisma.invasion.findUnique({ where: { id: g.cur } });
    if (inv) {
      const lv = await ctx.prisma.$queryRawUnsafe(`SELECT level, count(*)::int AS n, count("destroyedAt")::int AS d FROM "Horde" WHERE "invasionId" = $1 GROUP BY 1 ORDER BY 1`, inv.id);
      const al = await ctx.prisma.$queryRawUnsafe(`SELECT a.tag, SUM(d.points)::int AS points, COUNT(DISTINCT d."playerId")::int AS players FROM "HordeDamage" d JOIN "Horde" h ON h.id = d."hordeId" JOIN "Alliance" a ON a.id = d."allianceId" WHERE h."invasionId" = $1 GROUP BY a.tag ORDER BY 2 DESC`, inv.id);
      const rl = await ctx.prisma.$queryRawUnsafe(`SELECT status, count(*)::int AS n FROM "Rally" WHERE "targetNodeId" IN (SELECT "nodeId" FROM "Horde" WHERE "invasionId" = $1) GROUP BY 1`, inv.id);
      ctx.event('invasion_end', { manual: inv.manual, hordes: inv.hordes, destroyed: inv.destroyed, byLevel: lv.map(x => `L${x.level} ${x.d}/${x.n}`).join(' '), alliances: al.map(x => `${x.tag} ${x.points} pts (${x.players} joueurs)`).join(', '), rallies: rl.map(x => `${x.status} ${x.n}`).join(', ') });
      gbump(ctx, 'invasionsEnded');
    }
  }
  if (cur && g.cur !== cur) {
    ctx.event('invasion_start', { manual: S.inv.manual, hordes: S.inv.hordes, endsAt: new Date(S.inv.endsAt).toISOString() });
    gbump(ctx, S.inv.manual ? 'invasionsManual' : 'invasionsWeekend');
  }
  g.cur = cur;
}

// ---------- l'administrateur : invasion manuelle en semaine, de temps en temps ----------
async function adminTurn(bot, ctx, st) {
  const g = stats(ctx);
  const m = memOf(bot);
  const now = ctx.clock.now();
  if (!st.inv) {
    const week = Math.floor(ctx.clock.day() / 7);
    const p = parisParts(now);
    if (week % 6 !== 3 || g.manualWeek === week || (p.dow !== 2 && p.dow !== 3)) return false;
    g.manualWeek = week;
    const B = budget(bot, m, 2);
    const s = await B.call('GET', '/api/invasion');
    if (!s.ok || s.data?.active) return false;
    const hours = ctx.pick([12, 24, 48]);   // les durées que propose l'écran d'administration (2 à 72 h)
    const r = await B.call('POST', '/api/admin/invasion/start', { hours });
    if (!r.ok) return false;
    gbump(ctx, 'manualStarted');
    ctx.event('invasion_manual_start', { by: bot.name, hours, hordes: r.data?.invasion?.hordes ?? null, message: r.data?.message || null });
    return true;
  }
  // une invasion manuelle : terminée plus tôt une fois sur deux, après une dizaine d'heures
  if (st.inv.manual && g.manualDecided !== st.inv.id && now - ms(st.inv.startedAt) >= 10 * 3600000) {
    g.manualDecided = st.inv.id;
    if (ctx.rand() >= 0.5) return false;
    const r = await budget(bot, m, 1).call('POST', '/api/admin/invasion/end');
    if (!r.ok) return false;
    gbump(ctx, 'manualEnded');
    ctx.event('invasion_manual_end', { by: bot.name, after: Math.round((now - ms(st.inv.startedAt)) / 3600000), message: r.data?.message || null });
    return true;
  }
  return false;
}

// ---------- après l'invasion : l'armée de chasse est dissoute, ses soldats rentrent dans la garnison ----------
async function release(bot, m) {
  if (!m.a) return;
  const a = bot.armies.find(x => x.id === m.a);
  if (!a) { delete m.a; return; }
  const city = bot.cities.find(c => c.id === a.cityId);
  if (!atHome(a, city)) return;
  const r = await budget(bot, m, 1).call('DELETE', `/api/army/${a.id}/disband`);
  if (r.ok) { delete m.a; bot.armies = bot.armies.filter(x => x.id !== a.id); bump(m, 'disbanded'); }
}

// Le week-end, le joueur garde son armée de campagne la plus forte à la maison pour les rassemblements : le module militaire
// ne l'envoie plus en mission jusqu'à la fin de l'invasion (son propre délai « rien à portée » : bot.mem.mil.idle) ; ses
// récoltes et ses fondations ne sont pas touchées (ni les armées d'une fondation, ni la dernière armée au repos de la capitale
// pendant qu'un colon s'apprête à partir)
function keepHome(bot, ctx, m, untilStep) {
  const mil = bot.mem.mil;
  if (!mil || !Array.isArray(mil.own) || m.a) return;
  const cap = bot.capital;
  const reserved = new Set([mil.col?.a, mil.col?.b].filter(Boolean));
  if (mil.col && (mil.col.ph === 'approach' || mil.col.ph === 'ready')) return;
  const cur = m.res && mil.own.includes(m.res) && !reserved.has(m.res) ? m.res : null;
  const pick = cur || bot.armies.filter(a => mil.own.includes(a.id) && !reserved.has(a.id) && a.cityId === cap.id && countOf(a.units) >= 20).sort((x, y) => powerOf(y.units) - powerOf(x.units))[0]?.id;
  if (!pick) return;
  mil.idle ||= {};
  if ((mil.idle[pick] || 0) < untilStep) { mil.idle[pick] = untilStep; if (m.res !== pick) bump(m, 'keptHome'); }
  m.res = pick;
}

// rassemblements : en début de tour (29-invasion-early.cjs), avant que le module militaire n'envoie ses armées au repos
// en récolte ; sinon (fichier absent) à la fin du tour
async function participate(bot, ctx, st) {
  const m = memOf(bot);
  if (m.e === ctx.step) return;
  m.e = ctx.step;
  const allianceId = bot.me?.alliance?.allianceId;
  if (!allianceId || !bot.capital || !Array.isArray(bot.armies)) return;
  const now = ctx.clock.now();
  const live = !!st.inv && ms(st.inv.endsAt) > now + 30 * 60000;
  // le week-end (dès le vendredi matin) ou pendant une invasion : il garde son armée de campagne à la maison
  const p = parisParts(now);
  if (live) keepHome(bot, ctx, m, ctx.step + Math.ceil((ms(st.inv.endsAt) - now) / stepMs(ctx)));
  else if (p.dow === I.startDay && p.h >= 6 && p.h < I.startHour) keepHome(bot, ctx, m, ctx.step + 12);
  if (!live) return;   // pas d'invasion, ou elle se termine
  await invasionTurn(bot, ctx, m, st, allianceId);
}
async function turn(bot, ctx) {
  const m = memOf(bot);
  let st = await stepState(ctx);
  if (bot.admin && await adminTurn(bot, ctx, st)) st = await stepState(ctx, true);
  if (!st.inv) { m.ra = {}; await release(bot, m); return; }
  await participate(bot, ctx, st);
}

// ---------- entre deux pas : après chaque tick d'une heure d'un pas qui presse (sim.cjs appelle subTick) ----------
// Les combats et les départs se jouent aux ticks. Le lanceur fait partir un rassemblement dont toutes les armées sont là et
// qui suffit ; les issues sont relevées ; un membre qui joue ce pas-ci et dont une armée vient de rentrer d'un rassemblement
// de donjon enchaîne (il rejoint le rassemblement en cours ou lance l'étage suivant) sans attendre le pas suivant. Seuls ces
// membres relisent leurs armées (GET /api/army) : les autres jouent à leur tour.
const RA_STEPS = 8;   // une armée partie avec un rassemblement n'est plus suivie après deux jours
async function chain(ctx) {
  const now = ctx.clock.now();
  if (!S.inv || ms(S.inv.endsAt) <= now + 30 * 60000) return;
  for (const b of ctx.bots) {
    const allianceId = b.me?.alliance?.allianceId;
    const m = b.mem.inv;
    if (!m?.ra || !allianceId || !b.capital || !Array.isArray(b.armies) || !actsNow(ctx, b)) continue;
    for (const [id, step] of Object.entries(m.ra)) if (ctx.step - step > RA_STEPS) delete m.ra[id];
    // une de ses armées partie avec un rassemblement, encore dehors d'après ce qu'il a vu : elle est peut-être rentrée
    const away = Object.keys(m.ra).filter(id => { const a = b.armies.find(x => x.id === id); return a && !atHome(a, b.cities.find(c => c.id === a.cityId)); });
    if (!away.length) continue;
    const ar = await budget(b, memOf(b), 1).call('GET', '/api/army');
    if (!ar.ok || !Array.isArray(ar.data)) continue;
    b.armies = ar.data;
    const back = away.filter(id => { const a = b.armies.find(x => x.id === id); return !a || atHome(a, b.cities.find(c => c.id === a.cityId)); });
    for (const id of back) delete m.ra[id];
    if (!back.some(id => b.armies.some(a => a.id === id)) || !usableArmies(b, m, true).length) continue;
    bump(m, 'chainTurns');
    await invasionTurn(b, ctx, m, S, allianceId);
  }
}
// l'heure du prochain retour d'une armée partie avec un rassemblement de donjon, avant `to` (crochet nextDue de sim.cjs :
// un tick d'une heure à ce moment-là, puis chain) ; null : rien à attendre, ou pas d'invasion en cours
async function nextDue(ctx, to) {
  if (!S.inv || ms(S.inv.endsAt) <= ctx.clock.now() + 30 * 60000) return null;
  const ids = ctx.bots.flatMap(b => Object.keys(b.mem.inv?.ra || {}));
  if (!ids.length) return null;
  const r = await ctx.prisma.army.aggregate({ where: { id: { in: ids }, status: 'RETURNING', arrivalAt: { lte: new Date(to) } }, _min: { arrivalAt: true } });
  return r._min.arrivalAt ? new Date(r._min.arrivalAt).getTime() : null;
}
async function subTick(ctx) {
  try {
    if (!(S.leaderCity instanceof Map)) await stepState(ctx);
    // l'invasion et les étages ont changé : relus, sans oublier les rassemblements lancés
    Object.assign(S, await readWorld(ctx));
    if (!S.inv) return;
    await settleLaunched(ctx, { earlyOnly: true });
    await trackOutcomes(ctx);
    await chain(ctx);
  } catch (e) { const g = stats(ctx); g.errors = (g.errors || 0) + 1; g.lastError = String(e?.stack || e).slice(0, 400); }
}

function summary(ctx, final = false) {
  const g = stats(ctx);
  const k = {};
  for (const b of ctx.bots) for (const [key, v] of Object.entries(b.mem.inv?.k || {})) k[key] = (k[key] || 0) + v;
  const refusals = ctx.bots.map(b => b.mem.inv?.lastRefusal).filter(Boolean).slice(0, 4);
  ctx.event('invasion_summary', { step: ctx.step, final, margin: g.margin, world: g.k, bots: k, lastRefusals: refusals, errors: g.errors || 0, lastError: g.lastError || null });
  ctx.say(`invasion : ${JSON.stringify({ invasions: (g.k.invasionsWeekend || 0) + (g.k.invasionsManual || 0), launched: k.launched || 0, boss: k.launchedF3 || 0, joined: k.joined || 0, early: (k.launchedEarly || 0) + (k.launchedSolo || 0), cancelled: k.cancelled || 0, floors: g.k.floorsCleared || 0, bossBeaten: g.k.bossBeaten || 0, destroyed: g.k.destroyed || 0, repelled: g.k.repelled || 0, tooFar: k.joinTooFar || 0, calls: k.calls || 0, refused: k.refused || 0, errors: g.errors || 0 })}`);
}

module.exports = {
  name: 'invasion',
  subTick, nextDue,
  pickTarget, targetScore, takeRows, option, mergeable, usableArmies, alliancePot, marchSecs, learn,   // pour les tests unitaires (tests/unit/sim-bots.test.js)
  // début du tour (29-invasion-early.cjs, avant le module militaire) : rejoindre ou lancer un rassemblement
  async early(bot, ctx) {
    try { await participate(bot, ctx, await stepState(ctx)); } catch (e) { const g = stats(ctx); g.errors = (g.errors || 0) + 1; g.lastError = String(e?.stack || e).slice(0, 400); }
  },
  async act(bot, ctx) {
    try { await turn(bot, ctx); } catch (e) { const g = stats(ctx); g.errors = (g.errors || 0) + 1; g.lastError = String(e?.stack || e).slice(0, 400); }
  },
  async afterStep(ctx) {
    try {
      await stepState(ctx);
      await responders(ctx);
      await settleLaunched(ctx);
      await trackOutcomes(ctx);
      await invasionEvents(ctx);
    } catch (e) { const g = stats(ctx); g.errors = (g.errors || 0) + 1; g.lastError = String(e?.stack || e).slice(0, 400); }
    const total = Math.round(ctx.OPT.days * 24 / ctx.OPT.stepHours);
    if (ctx.step % 112 === 0 || ctx.step === total) summary(ctx, ctx.step === total);
  }
};
