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
// Au plus 7 appels par joueur et par tour pour ce module ; les conditions sont vérifiées avant d'appeler.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { unitsData } = require(path.join(ROOT, 'src/config/gamedata'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));

const I = config.invasion;
const TIER = config.combat.tierCoefficients;
const UNIT = Object.fromEntries(unitsData.map(u => [u.key, u]));
const NAME = 'Chasse aux hordes';
const MAX_CALLS = 7;
const KEEP = 0.2;            // part des soldats laissée à la garnison
const SLACK = 1.25;          // route réelle (contournements) face à la ligne droite
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

// ---------- état (mem : identifiants et compteurs) ----------
function memOf(bot) {
  const m = (bot.mem.inv ||= {});
  m.k ||= {};
  m.p ||= [];          // rassemblements lancés, en attente d'issue
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

// ---------- ce que voit le joueur, lu une fois par pas ----------
let S = { step: -1 };
async function stepState(ctx, force = false) {
  if (S.step === ctx.step && !force) return S;
  const keep = S.step === ctx.step ? S.launched : [];
  const inv = await ctx.prisma.invasion.findFirst({ where: { endedAt: null } });
  S = { step: ctx.step, inv, nodes: new Map(), leaderCity: new Map(), launched: keep };
  if (inv) {
    // la carte : chaque donjon, son étage et la barre de vie de la garnison en cours
    const hordes = await ctx.prisma.horde.findMany({ where: { invasionId: inv.id, destroyedAt: null }, select: { nodeId: true, x: true, y: true, level: true, floor: true, floors: true } });
    const nodes = await ctx.prisma.resourceNode.findMany({ where: { id: { in: hordes.map(h => h.nodeId) } }, select: { id: true, defenderPower: true } });
    const pw = new Map(nodes.map(n => [n.id, n.defenderPower || 0]));
    for (const h of hordes) if (pw.has(h.nodeId)) S.nodes.set(h.nodeId, { nodeId: h.nodeId, x: h.x, y: h.y, level: h.level, floor: h.floor, full: h.floors?.[h.floor - 1]?.power || 0, rest: (h.floors || []).slice(h.floor).reduce((t, f) => t + (f.power || 0), 0), power: pw.get(h.nodeId) });
  }
  return S;
}
// la ville du lanceur (le point de rassemblement que montre la carte)
async function leaderCity(ctx, rallyId) {
  if (S.leaderCity.has(rallyId)) return S.leaderCity.get(rallyId);
  const r = await ctx.prisma.rally.findUnique({ where: { id: rallyId }, select: { cityId: true } });
  const c = r ? await ctx.prisma.city.findUnique({ where: { id: r.cityId }, select: { id: true, x: true, y: true } }) : null;
  S.leaderCity.set(rallyId, c);
  return c;
}
// le tick qui suit l'instant t (les combats et les départs se jouent aux ticks)
const stepMs = (ctx) => ctx.OPT.stepHours * 3600000;
const tickAfter = (ctx, t) => ctx.OPT.start + Math.ceil((t - ctx.OPT.start) / stepMs(ctx)) * stepMs(ctx);
const nextTick = (ctx) => ctx.OPT.start + (ctx.step + 1) * stepMs(ctx);
const actsNow = (ctx, b) => (ctx.step + b.turn) % 2 === 0 || !!b.mem.alwaysOn;

// ---------- armées ----------
function freeSlot(bot, city) {
  const max = fx.maxArmies(city.buildings || []);
  const used = new Set(bot.armies.filter(a => !a.isGarrison && a.cityId === city.id).map(a => a.slot));
  for (let s = max; s >= 1; s--) if (!used.has(s)) return s;
  return null;
}
// ce que la garnison peut donner à l'armée : les deux troupes les plus nombreuses, la ville garde 20 % des soldats
function takeRows(bot, army, city) {
  const g = garrisonOf(bot, city.id);
  const gRows = fighters(g?.units);
  const have = countOf(army?.units);
  let want = Math.floor((countOf(g?.units) + have) * (1 - KEEP)) - have;
  if (want < 10) return [];
  const out = [];
  for (const u of gRows.sort((a, b) => b.count - a.count).slice(0, 2)) {
    const take = Math.min(Math.floor(u.count * (1 - KEEP)), want);
    if (take < 5) continue;
    out.push({ unitKey: u.unitKey, tier: u.tier || UNIT[u.unitKey].tier, count: take });
    want -= take;
  }
  return out;
}
function option(bot, army, city, create) {
  const rows = takeRows(bot, army, city);
  const units = [...fighters(army?.units), ...rows];
  return { army, city, create, rows, pot: powerOf(units), spt: secPerTile(units) };
}
// les armées que le joueur peut mener ou envoyer maintenant (estimate : sans rien changer à sa mémoire)
function usableArmies(bot, m, estimate = false) {
  const cityOf = (id) => bot.cities.find(c => c.id === id) || null;
  const own = m.a ? bot.armies.find(a => a.id === m.a) : null;
  if (m.a && !own && !estimate) delete m.a;
  if (own) {
    const c = cityOf(own.cityId);
    return c && !c.isSieged && atHome(own, c) ? [option(bot, own, c, false)].filter(o => o.pot > 0) : [];
  }
  const cap = bot.capital;
  if (!cap || cap.isSieged) return [];
  const mil = bot.mem.mil || {};
  const milOwn = new Set(mil.own || []);
  // un emplacement libre que l'armée de campagne du module militaire ne réclame pas (une seconde armée pour une fondation
  // ou une grosse garnison) : l'armée de chasse s'y forme
  if (lvl(cap, 'RALLY_POINT') && freeSlot(bot, cap) && countOf(garrisonOf(bot, cap.id)?.units) >= 40) {
    const field = bot.armies.filter(a => !a.isGarrison && a.cityId === cap.id);
    const free = fx.maxArmies(cap.buildings || []) - field.length;
    const milHere = field.filter(a => milOwn.has(a.id)).length;
    const founding = !!mil.col || (cap.settlers || 0) > 0 || (cap.recruitQueue || []).some(q => q.unitKey === 'SETTLER') || lvl(cap, 'RESIDENCE') >= 9;
    const milWant = bot.mem.mil ? (founding || countOf(garrisonOf(bot, cap.id)?.units) >= 300 ? 2 : 1) : 0;
    if (free - Math.max(0, milWant - milHere) >= 1) return [option(bot, null, cap, true)];
  }
  // pas d'emplacement libre : une armée de campagne au repos ; pendant une fondation, ni l'armée qui frappe le camp ni
  // celle du colon, et la capitale garde une armée au repos pour l'escorte (comme le module militaire)
  const reserved = new Set([mil.col?.a, mil.col?.b].filter(Boolean));
  const keepHome = !!mil.col && (mil.col.ph === 'approach' || mil.col.ph === 'ready');
  const idleInCapital = bot.armies.filter(a => milOwn.has(a.id) && !reserved.has(a.id) && a.cityId === cap.id && atHome(a, cap)).length;
  const out = [];
  for (const a of bot.armies) {
    if (a.isGarrison || reserved.has(a.id) || !(milOwn.has(a.id) || a.name === 'Convoi')) continue;
    const c = cityOf(a.cityId);
    if (!c || c.isSieged || !atHome(a, c) || !lvl(c, 'RALLY_POINT')) continue;
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
  const slot = freeSlot(bot, o.city);
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

// ---------- les membres qui se connectent après lui dans ce pas, assez près pour arriver avant le départ ----------
// (ceux qui ne jouent pas ce pas-ci répondent parfois à la notification du rassemblement : comptés moins)
const NOTIF_ODDS = 0.6;
function expectedJoiners(bot, ctx, city, allianceId) {
  const idx = ctx.bots.indexOf(bot);
  const out = [];
  for (let i = 0; i < ctx.bots.length; i++) {
    const b = ctx.bots[i];
    if (b === bot || b.me?.alliance?.allianceId !== allianceId || !Array.isArray(b.armies)) continue;
    const later = actsNow(ctx, b);
    if (later && i < idx) continue;   // il a déjà joué ce pas-ci
    let best = 0;
    for (const o of usableArmies(b, b.mem.inv || {}, true)) {
      const secs = dist(o.city, city) * o.spt * SLACK + 60;
      if (secs < 3600 - 600 && o.pot > best) best = o.pot;   // ils se connectent quelques minutes plus tard
    }
    if (best > 0) out.push({ pot: best * (later ? 1 : NOTIF_ODDS), secs: dist(b.capital || city, city) * 37.5 * SLACK });
  }
  return out.sort((a, b) => b.pot - a.pot);
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
      const away = bot.armies.filter(a => (mil.own || []).includes(a.id) && !reserved.has(a.id) && a.status === 'HARVESTING' && countOf(a.units) >= 20).sort((x, y) => powerOf(y.units) - powerOf(x.units))[0];
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
  for (const [id, until] of Object.entries(m.far || {})) if (until <= ctx.step) delete m.far[id];

  // 1. rejoindre : le rassemblement à qui il manque le plus de puissance, que l'armée atteint avant le départ
  let best = null;
  for (const r of rallies) {
    if (r.status !== 'GATHERING' || r.joined || r.mine || (r.armies || []).length >= r.maxArmies) continue;
    const node = st.nodes.get(r.targetNodeId);
    if (!node) continue;
    const lc = await leaderCity(ctx, r.id);
    if (!lc || (m.far?.[lc.id] || 0) > ctx.step) continue;
    const need = node.power * g.margin;
    if (r.power >= need * 2.5) continue;   // assez fort sans lui : il garde son armée pour un autre donjon
    const left = (ms(r.launchAt) - now) / 1000;
    for (const o of usable) {
      const secs = dist(o.city, lc) * o.spt * SLACK + 60;
      if (secs > left - 30) continue;
      const score = Math.min(need - r.power, o.pot) * 2 - secs;
      if (!best || score > best.score) best = { r, o, lc, score };
    }
  }
  if (best) {
    const army = await ensureArmy(bot, B, m, best.o);
    if (!army) return;
    if (best.o.rows.length) await fill(bot, B, m, best.o);
    if (B.left() < 1 || !countOf(army.units)) return;
    const j = await B.call('POST', `/api/rallies/${best.r.id}/join`, { armyId: army.id });
    if (j.ok) {
      army.status = 'RALLY_JOIN';
      bump(m, 'joined'); if (best.o.borrow) bump(m, 'borrowed');
    } else {
      bump(m, 'joinRefused');
      if (/temps/.test(String(j.data?.error || ''))) { (m.far ||= {})[best.lc.id] = ctx.step + 28; const keys = Object.keys(m.far); if (keys.length > 8) delete m.far[keys[0]]; }
    }
    return;
  }

  // 2. lancer : le donjon que l'alliance peut battre (le plus haut niveau, le plus avancé, le plus proche)
  const endsAt = ms(st.inv.endsAt);
  const o = usable.find(x => x.city.isCapital) || usable[0];
  const rp = lvl(bot.capital, 'RALLY_POINT');   // celle de la capitale vaut pour toutes les villes (capitale seulement)
  if (!rp || B.left() < 3) return;
  // taille d'un rassemblement (décision du 31 octobre 2026) : la Place de rassemblement de la capitale du lanceur
  const capacity = fx.rallyMaxArmies(rp);
  const joiners = expectedJoiners(bot, ctx, o.city, allianceId).slice(0, capacity - 1);
  const joinPot = joiners.reduce((t, x) => t + x.pot, 0) * 0.6;   // certains rejoindront un autre rassemblement
  const nt = nextTick(ctx);
  const plan = (n, need) => {
    const march = dist(o.city, n) * o.spt * SLACK * 1000;
    const solo = o.pot >= need && tickAfter(ctx, now + 120000 + march) < endsAt;
    const group = o.pot + joinPot >= need && tickAfter(ctx, nt + march) < endsAt;   // au pire, départ au prochain tick
    return { solo, group, march };
  };
  let target = null;
  for (const n of st.nodes.values()) {
    if (targeted.has(n.nodeId) || !(n.power > 0)) continue;
    const p = plan(n, n.power * g.margin);
    if (!p.solo && !p.group) continue;
    // le trésor au plus près : ce qu'il reste à abattre (étage en cours et suivants), un donjon presque fini d'abord, le
    // plus haut niveau que l'alliance peut battre (objet plus probable au dernier coup)
    const score = treasureOf(n.level).res * 1000 / Math.max(1, n.power + n.rest) * (n.floor === 3 ? 1.3 : 1) * (1 + 0.2 * (n.level - 1)) - p.march / 600000;
    if (!target || score > target.score) target = { n, score };
  }
  if (!target) { bump(m, 'noTarget'); return; }
  // ce que voit le joueur avant de lancer : l'invasion en cours, puis le panneau du donjon
  const inv = await B.call('GET', '/api/invasion');
  if (!inv.ok || !inv.data?.active || !(inv.data.invasion?.hordes || []).some(h => h.nodeId === target.n.nodeId)) return;
  const v = await B.call('GET', `/api/invasion/horde/${target.n.nodeId}`);
  if (!v.ok || v.data?.destroyed) return;
  const left = (v.data.floors || []).find(f => f.current)?.left ?? target.n.power;
  const need = Math.max(1, left) * g.margin;
  const p = plan(target.n, need);
  if (!p.solo && !p.group) { bump(m, 'noTarget'); return; }
  const army = await ensureArmy(bot, B, m, o);
  if (!army) return;
  if (o.rows.length) await fill(bot, B, m, o);
  if (B.left() < 1 || !countOf(army.units)) return;
  const power = powerOf(army.units);
  // assez fort seul : il part seul s'il n'attend personne, sinon une fois sur quatre (l'alliance se rassemble d'habitude)
  const solo = power >= need && p.solo && (joinPot < need * 0.25 || ctx.rand() < 0.25);
  if (!solo && power + joinPot < need) { bump(m, 'tooWeak'); return; }
  const close = joiners.length > 0 && joiners.every(x => x.secs < 1200);
  const wait = solo ? 5 : (close && ctx.rand() < 0.2 ? 30 : 60);
  const r = await B.call('POST', '/api/rallies', { armyId: army.id, nodeId: target.n.nodeId, waitMinutes: wait });
  if (!r.ok || !r.data?.rally) { bump(m, 'launchRefused'); return; }
  army.status = 'RALLY_WAIT';
  const id = r.data.rally.id;
  m.p.push(id); if (m.p.length > 8) m.p.shift();
  (m.f ||= {})[id] = target.n.floor;   // l'étage visé (un autre rassemblement peut l'abattre avant)
  bump(m, 'launched'); bump(m, `launchedL${target.n.level}`); if (o.borrow) bump(m, 'borrowed');
  S.launched.push({ leader: bot.name, alliance: allianceId, id, nodeId: target.n.nodeId, need, march: p.march, solo, capacity: r.data.maxArmies || capacity, launchAt: ms(r.data.rally.launchAt) });
  if (solo && B.left() > 0) {
    // assez fort seul : il part sans attendre
    const l = await B.call('POST', `/api/rallies/${id}/launch`);
    if (l.ok) { bump(m, 'launchedSolo'); S.launched[S.launched.length - 1].done = true; }
  }
}

// ---------- notification « Rassemblement d'alliance » : des membres qui ne jouent pas ce pas-ci y répondent ----------
async function responders(ctx) {
  if (S.step !== ctx.step || !S.inv) return;
  const now = ctx.clock.now();
  for (const L of S.launched) {
    if (L.done || L.launchAt - now < 10 * 60000) continue;
    const lc = await leaderCity(ctx, L.id);
    if (!lc) continue;
    const cands = [];
    for (const b of ctx.bots) {
      if (b.name === L.leader || actsNow(ctx, b) || b.me?.alliance?.allianceId !== L.alliance || !Array.isArray(b.armies) || b.mem.inv?.rs === ctx.step) continue;
      let best = 0;
      for (const o of usableArmies(b, b.mem.inv || {}, true)) if (dist(o.city, lc) * o.spt * SLACK + 60 < (L.launchAt - now) / 1000 - 120 && o.pot > best) best = o.pot;
      if (best > 0) cands.push({ b, pot: best });
    }
    for (const { b } of cands.sort((x, y) => y.pot - x.pot).slice(0, Math.max(0, L.capacity - 1))) {
      if (ctx.rand() >= NOTIF_ODDS) continue;   // n'a pas vu la notification à temps
      const m = memOf(b);
      m.rs = ctx.step;
      const B = budget(b, m, 6);
      const ar = await B.call('GET', '/api/army');
      if (!ar.ok || !Array.isArray(ar.data)) continue;
      b.armies = ar.data;
      const usable = usableArmies(b, m);
      if (!usable.length) continue;
      const lr = await B.call('GET', `/api/rallies?nodeId=${L.nodeId}`);
      const r = (lr.data?.rallies || []).find(x => x.id === L.id);
      if (!r || r.status !== 'GATHERING' || r.joined || (r.armies || []).length >= r.maxArmies || r.power >= L.need * 2.5) continue;
      const left = (ms(r.launchAt) - ctx.clock.now()) / 1000;
      const o = usable.filter(x => dist(x.city, lc) * x.spt * SLACK + 60 <= left - 30).sort((x, y) => y.pot - x.pot)[0];
      if (!o) continue;
      const army = await ensureArmy(b, B, m, o);
      if (!army) continue;
      if (o.rows.length) await fill(b, B, m, o);
      if (B.left() < 1 || !countOf(army.units)) continue;
      const j = await B.call('POST', `/api/rallies/${L.id}/join`, { armyId: army.id });
      if (j.ok) { army.status = 'RALLY_JOIN'; bump(m, 'joined'); bump(m, 'joinedFromNotification'); if (o.borrow) bump(m, 'borrowed'); }
      else { bump(m, 'joinRefused'); if (/temps/.test(String(j.data?.error || ''))) (m.far ||= {})[lc.id] = ctx.step + 28; }
    }
  }
}

// ---------- fin du pas : départ anticipé, départ au tick ou annulation ----------
async function settleLaunched(ctx) {
  if (S.step !== ctx.step) return;
  const g = stats(ctx);
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
    if (!rally || rally.status !== 'GATHERING') continue;
    let armies = rally.armies || [];
    const arrivedOf = (list) => list.filter(a => a.status === 'RALLY_WAIT' || (a.status === 'RALLY_JOIN' && ms(a.arrivalAt) <= ctx.clock.now()));
    let arrived = arrivedOf(armies).reduce((t, a) => t + (a.power || 0), 0);
    let total = armies.reduce((t, a) => t + (a.power || 0), 0);
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
      if (l.ok) { bump(m, 'launchedEarly'); if (armies.length > arrivedOf(armies).length) bump(m, 'leftBehind', armies.length - arrivedOf(armies).length); }
    } else if (total >= L.need && tickAfter(ctx, nextTick(ctx) + L.march) < endsAt) {
      bump(m, 'departAtTick');   // les retardataires sont nécessaires : départ au prochain tick
    } else {
      const c = await B.call('POST', `/api/rallies/${L.id}/cancel`);
      if (c.ok) { bump(m, 'cancelled'); m.p = m.p.filter(x => x !== L.id); if (m.f) delete m.f[L.id]; gbump(ctx, 'cancelledWeak'); }
    }
    void now; void g;
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
  for (const [id, b] of owners) if (!seen.has(id)) { b.mem.inv.p = b.mem.inv.p.filter(x => x !== id); if (b.mem.inv.f) delete b.mem.inv.f[id]; }
  for (const r of rows) {
    const b = owners.get(r.id);
    const m = memOf(b);
    const planned = m.f?.[r.id];
    const drop = () => { m.p = m.p.filter(x => x !== r.id); if (m.f) delete m.f[r.id]; };
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
    if (!res.won) {
      gbump(ctx, 'repelled');
      // l'étage visé : la puissance demandée monte ; l'étage suivant (un autre rassemblement a abattu le visé juste avant) : non
      if (planned === undefined || planned === res.floor) g.margin = Math.min(2, Math.round((g.margin + 0.05) * 100) / 100);
      else gbump(ctx, 'repelledNextFloor');
      ctx.event('rally_repelled', { ...base, margin: g.margin });
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
  if (!st.inv) { await release(bot, m); return; }
  await participate(bot, ctx, st);
}

function summary(ctx, final = false) {
  const g = stats(ctx);
  const k = {};
  for (const b of ctx.bots) for (const [key, v] of Object.entries(b.mem.inv?.k || {})) k[key] = (k[key] || 0) + v;
  const refusals = ctx.bots.map(b => b.mem.inv?.lastRefusal).filter(Boolean).slice(0, 4);
  ctx.event('invasion_summary', { step: ctx.step, final, margin: g.margin, world: g.k, bots: k, lastRefusals: refusals, errors: g.errors || 0, lastError: g.lastError || null });
  ctx.say(`invasion : ${JSON.stringify({ invasions: (g.k.invasionsWeekend || 0) + (g.k.invasionsManual || 0), launched: k.launched || 0, joined: k.joined || 0, early: (k.launchedEarly || 0) + (k.launchedSolo || 0), cancelled: k.cancelled || 0, floors: g.k.floorsCleared || 0, destroyed: g.k.destroyed || 0, repelled: g.k.repelled || 0, calls: k.calls || 0, refused: k.refused || 0, errors: g.errors || 0 })}`);
}

module.exports = {
  name: 'invasion',
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
