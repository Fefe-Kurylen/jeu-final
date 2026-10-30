// Simulation longue — marché : échanges entre joueurs livrés par armées de transport (offres, acceptations, annulations),
// routes commerciales automatiques entre ses villes, marchand du serveur (PNJ) quand un entrepôt déborde, envoi de
// ressources à un allié. Règles : src/routes/market.js, src/services/marketService.js, config.market,
// docs/ETAT-DES-SYSTEMES.md « Marché et commerce ».
//
// Chaque joueur qui a un Marché forme une « Caravane » (une armée de la Place de rassemblement, sur un emplacement que
// les armées de campagne ne prennent pas, remplie de porteurs de la garnison). Avec elle :
//  - il publie une offre de la ressource dont il a trop contre celle qui lui manque (la caravane attend en ville) ;
//  - il accepte l'offre d'un autre quand elle lui convient (pas d'ennemi, prix correct, de la place à l'arrivée) ;
//    sans caravane libre, une armée de campagne au repos en ville porte la contrepartie (aller-retour court) ;
//  - il annule une offre restée sans preneur (ou devenue absurde) ; un joueur sur trois la laisse expirer (48 h).
// Avec des colonies : route capitale → colonie (bois, pierre, fer) et colonie → capitale (tout), mises en pause ou
// reprises selon les stocks des deux villes. Le marchand PNJ (taxe 30 % − 1 %/niveau) sert quand une ressource déborde
// et qu'une autre manque. Rarement, un joueur riche envoie des ressources à l'allié le plus petit (/api/trade/send).
// Au plus CALLS appels par tour (lectures comprises) ; les conditions sont vérifiées avant chaque appel.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { unitsData, factionsData, buildingsData } = require(path.join(ROOT, 'src/config/gamedata'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const { getFactionBonus } = require(path.join(ROOT, 'src/utils/calculations'));
const { getRelation } = require(path.join(ROOT, 'src/services/diplomacyService'));   // lecture seule : la diplomatie que le joueur connaît

const M = config.market;
const RES = ['wood', 'stone', 'iron', 'food'];
const OTHER = ['wood', 'stone', 'iron'];
const UNIT = Object.fromEntries(unitsData.map(u => [u.key, u]));
const CARAVAN = 'Caravane';
const CALLS = 6;                 // appels par tour au plus
const STALE_H = 24;              // une offre sans preneur depuis 24 h est retirée (sauf par les joueurs qui la laissent expirer)
const MIN_TRADE = 200;
const MAX_QUEUE = config.build.maxRunning + config.build.maxQueued;
const buildCost = (key, level) => { const b = buildingsData.find(x => x.key === key)?.costL1 || { wood: 100, stone: 100, iron: 80, food: 50 }; const k = Math.pow(config.build.costMultiplierBase, level - 1); return Object.fromEntries(RES.map(r => [r, Math.floor((b[r] || 0) * k)])); };

// ---------- petits outils ----------
const lvl = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const capOf = (city, r) => Math.max(1, (r === 'food' ? city.maxFoodStorage : city.maxStorage) || 1);
const ratio = (city, r) => (city[r] || 0) / capOf(city, r);
const avgRatio = (city, rs) => rs.reduce((t, r) => t + ratio(city, r), 0) / rs.length;
const home = (a, city) => !!a && !!city && a.x === city.x && a.y === city.y;
const unitsOf = (a) => (a?.units || []).reduce((t, u) => t + (u.count || 0), 0);
const carryOf = (key) => UNIT[key]?.stats?.carry || UNIT[key]?.stats?.transport || 50;
const round10 = (n) => Math.max(0, Math.floor(n / 10) * 10);
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mult = (city, faction) => (1 + getFactionBonus(faction, 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(city.buildings || []) / 100);
// capacité vue par le joueur (le Bastion d'alliance et le héros ne font que l'augmenter : on reste en dessous)
const capacity = (army, city, faction) => Math.floor((army.units || []).reduce((t, u) => t + (u.count || 0) * carryOf(u.unitKey), 0) * mult(city, faction) * 0.98);
const target = (city) => Math.max(500, Math.min(10000, Math.round(0.2 * (city.maxStorage || 0))));   // capacité visée de la caravane

function memOf(bot) {
  const m = (bot.mem.mkt ||= {});
  m.car ||= {};        // ville -> armée « Caravane »
  m.off ||= [];        // offres publiées et suivies : { i: offre, c: ville, s: pas }
  m.nx ||= {};         // prochains pas : m (marché), r (routes), a (aide), t (taxe), n:{ville} (PNJ)
  m.k ||= {};          // compteurs
  if (!(m.pf >= 1)) m.pf = 1;   // prix demandé (unités données par unité reçue), monte quand personne ne prend
  return m;
}
const bump = (m, k, n = 1) => { m.k[k] = (m.k[k] || 0) + n; };
// une offre restée sans preneur : on attend un peu plus avant la suivante (1, 2, 4… jours, 4 au plus)
function miss(S) { const m = S.m; m.miss = Math.min(4, (m.miss || 0) + 1); m.nx.p = S.ctx.step + Math.min(16, 2 * Math.pow(2, m.miss - 1)); }

// ---------- relations (diplomatie connue du joueur), gardées le temps d'un pas ----------
const REL = { step: -1, map: new Map() };
async function canTrade(ctx, me, other) {
  if (REL.step !== ctx.step) { REL.step = ctx.step; REL.map.clear(); }
  const key = `${me}|${other}`;
  if (!REL.map.has(key)) {
    let ok = false;
    try { ok = !!(await getRelation(me, other, ctx.prisma)).canTransport; } catch (e) { ok = false; }
    REL.map.set(key, ok);
  }
  return REL.map.get(key);
}

// ---------- caravanes ----------
function caravanOf(S, city) {
  const { bot, m } = S;
  let a = bot.armies.find(x => x.id === m.car[city.id] && !x.isGarrison);
  if (!a) {
    a = bot.armies.find(x => !x.isGarrison && x.cityId === city.id && x.name === CARAVAN) || null;
    if (a) m.car[city.id] = a.id; else delete m.car[city.id];
  }
  return a || null;
}
const garrisonOf = (bot, city) => bot.armies.find(a => a.isGarrison && a.cityId === city.id) || null;
const fieldArmies = (bot, city) => bot.armies.filter(a => !a.isGarrison && a.cityId === city.id);

// le module militaire (30-military.cjs) a besoin de ses armées : une de campagne, deux pendant la fondation d'une colonie
function militaryNeed(bot, city) {
  const mil = bot.mem.mil;
  if (!mil) return 0;
  const own = fieldArmies(bot, city).filter(a => (mil.own || []).includes(a.id)).length;
  const colonies = bot.cities.filter(c => !c.isCapital && !c.isWonder).length;
  const founding = city.isCapital && colonies < config.city.maxSecondaryCities &&
    (!!mil.col || (city.settlers || 0) > 0 || (city.recruitQueue || []).some(q => q.unitKey === 'SETTLER'));
  return Math.max(0, (founding ? 2 : 1) - own);
}
const freeSlots = (bot, city) => fx.maxArmies(city.buildings || []) - fieldArmies(bot, city).length;
function freeSlotNumber(bot, city) {
  const max = fx.maxArmies(city.buildings || []);
  const used = new Set(fieldArmies(bot, city).map(a => a.slot));
  for (let s = max; s >= 1; s--) if (!used.has(s)) return s;   // le plus haut : les premiers restent aux armées de campagne
  return null;
}

// porteurs de la garnison : les meilleurs porteurs d'abord, 30 % de chaque troupe au plus
async function fillCaravan(S, city, army) {
  const { bot, B, m } = S;
  const gar = garrisonOf(bot, city);
  if (!gar) return;
  const k = mult(city, S.faction) * 0.98;
  let missing = target(city) - capacity(army, city, S.faction);
  const pool = (gar.units || []).filter(u => u.count >= 4 && UNIT[u.unitKey] && UNIT[u.unitKey].class !== 'SIEGE')
    .sort((a, b) => carryOf(b.unitKey) - carryOf(a.unitKey) || b.count - a.count);
  for (const u of pool.slice(0, 2)) {
    if (missing <= 0 || B.left <= 1) break;
    const take = Math.min(Math.floor(u.count * 0.3), Math.ceil(missing / (carryOf(u.unitKey) * k)));
    if (take < 2) continue;
    const row = (army.units ||= []).find(x => x.unitKey === u.unitKey);
    const cur = row?.count || 0;
    B.left--;
    const r = await bot.post(`/api/army/${army.id}/set-unit`, { unitKey: u.unitKey, count: cur + take });
    if (!r.ok) { bump(m, 'fillRefused'); break; }
    const got = Math.max(0, (r.data?.newCount ?? cur + take) - cur);
    u.count -= got;
    if (row) row.count += got; else army.units.push({ unitKey: u.unitKey, tier: UNIT[u.unitKey].tier, count: got });
    missing -= got * carryOf(u.unitKey) * k;
    bump(m, 'porters', got);
  }
}

async function caravans(S, markets) {
  const { bot, ctx, B, m } = S;
  for (const city of markets) {
    if (B.left <= 2 || city.isSieged || !lvl(city, 'RALLY_POINT')) continue;
    let army = caravanOf(S, city);
    const need = militaryNeed(bot, city);
    if (army) {
      // la fondation d'une colonie a besoin de l'emplacement : la caravane rend ses porteurs à la garnison
      if (S.release.has(city.id)) {
        if (army.status === 'IDLE' && home(army, city)) {
          B.left--;
          const r = await bot.del(`/api/army/${army.id}/disband`);
          if (r.ok) { bot.armies = bot.armies.filter(x => x.id !== army.id); delete m.car[city.id]; bump(m, 'caravansReleased'); }
          else bump(m, 'disbandRefused');
        }   // réservée par une offre : trade() retire l'offre d'abord
        continue;
      }
      if (army.status === 'IDLE' && home(army, city) && capacity(army, city, S.faction) < 0.6 * target(city)) await fillCaravan(S, city, army);
      continue;
    }
    // pas de caravane : un emplacement libre que les armées de campagne n'attendent pas, et des soldats en garnison
    if (freeSlots(bot, city) - need <= 0) continue;
    const gar = (garrisonOf(bot, city)?.units || []).filter(u => UNIT[u.unitKey] && UNIT[u.unitKey].class !== 'SIEGE').reduce((t, u) => t + u.count, 0);
    if (gar < 20) continue;
    const slot = freeSlotNumber(bot, city);
    if (!slot) continue;
    B.left--;
    const r = await bot.post('/api/army/create', { cityId: city.id, slot, name: CARAVAN });
    if (!r.ok || !r.data?.army) { bump(m, 'createRefused'); continue; }
    army = { ...r.data.army, units: [] };
    bot.armies.push(army);
    m.car[city.id] = army.id;
    bump(m, 'caravansCreated');
    if (!m.k.firstCaravanDay) { m.k.firstCaravanDay = ctx.clock.day(); }
    await fillCaravan(S, city, army);
  }
}

// ---------- échanges entre joueurs ----------
// ce que la ville publierait : la ressource la plus pleine contre la plus vide
function postPlan(S, city, cap) {
  const rs = RES.map(r => ({ r, x: ratio(city, r) }));
  const foodOk = (city.foodBalance?.net ?? -1) > 0;
  const ex = rs.filter(o => o.x >= 0.5 && (o.r !== 'food' || (foodOk && o.x >= 0.65))).sort((a, b) => b.x - a.x)[0];
  if (!ex) return null;
  const lack = rs.filter(o => o.r !== ex.r).sort((a, b) => a.x - b.x)[0];
  if (!lack || ex.x - lack.x < 0.3) return null;
  const pf = Math.min(1.5, Math.max(1, S.m.pf));
  const spare = (city[ex.r] || 0) - capOf(city, ex.r) * 0.35;
  const room = capOf(city, lack.r) * 0.9 - (city[lack.r] || 0);
  const buy = round10(Math.min(room, cap / pf, spare / pf, capOf(city, ex.r) * 0.3 / pf));
  const sell = round10(buy * pf);
  if (buy < MIN_TRADE * 0.75 || sell < MIN_TRADE || sell > cap || sell > (city[ex.r] || 0) - 50) return null;
  return { sellResource: ex.r, sellAmount: sell, buyResource: lack.r, buyAmount: buy };
}

// intérêt d'une offre pour la ville (null : elle ne convient pas)
function offerValue(city, o) {
  const give = o.buyResource, get = o.sellResource;
  const rGive = ratio(city, give), rGet = ratio(city, get);
  if (rGive - rGet < 0.15) return null;                                             // on ne manque pas plus de ce qu'on reçoit
  if ((city[give] || 0) - o.buyAmount < capOf(city, give) * 0.2 + 50) return null;  // garder une réserve
  if (give === 'food' && !((city.foodBalance?.net ?? -1) > 0)) return null;
  const recv = Math.floor(o.sellAmount * (1 - M.p2pTaxPctBase / 100));
  if ((city[get] || 0) + recv > capOf(city, get) * 0.97) return null;               // rien ne doit déborder à l'arrivée
  const price = o.sellAmount / o.buyAmount;
  if (price < 0.75) return null;
  return (rGive - rGet) * Math.min(1.4, price);
}

// une armée en ville qui peut porter `amount` : la caravane d'abord, sinon une armée de campagne au repos (aller-retour)
function carrierFor(S, city, amount) {
  const { bot } = S;
  const car = caravanOf(S, city);
  const mil = bot.mem.mil;
  const reserved = new Set([mil?.col?.a, mil?.col?.b].filter(Boolean));
  const list = [];
  if (car && car.status === 'IDLE' && home(car, city) && unitsOf(car) > 0 && !S.release.has(city.id)) list.push({ a: car, own: 1 });
  if (!mil?.col) for (const a of fieldArmies(bot, city)) if (a !== car && a.status === 'IDLE' && home(a, city) && unitsOf(a) > 0 && !reserved.has(a.id)) list.push({ a, own: 0 });
  return list.map(x => ({ ...x, cap: capacity(x.a, city, S.faction) })).filter(x => x.cap >= amount).sort((x, y) => y.own - x.own || x.cap - y.cap)[0] || null;
}

async function trade(S, markets) {
  const { bot, ctx, B, m } = S;
  const now = ctx.clock.now();
  const hasCaravan = markets.some(c => caravanOf(S, c));
  const borrow = markets.some(c => fieldArmies(bot, c).some(a => a.status === 'IDLE' && home(a, c) && unitsOf(a) > 0));
  if (!hasCaravan && !m.off.length && !(borrow && (m.nx.m || 0) <= ctx.step)) return;
  if (B.left < 2) return;
  B.left--;
  const r = await bot.get('/api/market');
  if (!r.ok || !Array.isArray(r.data)) return;
  m.nx.m = ctx.step + (hasCaravan ? 0 : 4);   // sans caravane, on regarde le marché une fois par jour
  bump(m, 'looks');
  const offers = r.data.filter(o => o.status === 'ACTIVE' && (!o.expiresAt || Date.parse(o.expiresAt) > now + 3600000));
  const mine = r.data.filter(o => o.sellerId === bot.playerId);

  // offres suivies disparues : prises ou expirées (l'historique des échanges le dit)
  const gone = m.off.filter(t => !mine.some(o => o.id === t.i));
  if (gone.length && B.left > 2) {
    B.left--;
    const h = await bot.get('/api/reports/trade');
    if (h.ok && Array.isArray(h.data)) {
      m.off = m.off.filter(t => mine.some(o => o.id === t.i));
      for (const t of gone) {
        const done = h.data.find(x => x.id === t.i && x.status === 'COMPLETED');
        if (done) { bump(m, 'sold'); bump(m, 'soldVolume', done.sellAmount); m.pf = Math.max(1, m.pf - 0.05); m.miss = 0; }
        else { bump(m, 'expired'); m.pf = Math.min(1.5, m.pf + 0.1); miss(S); }
      }
    }
  }
  // les offres d'avant une reprise : suivies aussi
  for (const o of mine) if (!m.off.some(t => t.i === o.id) && m.off.length < 6) m.off.push({ i: o.id, c: o.cityId, s: ctx.step });

  // 1. retirer une offre : sans preneur depuis longtemps, devenue absurde, ou l'emplacement de la caravane est demandé
  const patient = hash(bot.name) % 3 === 0;   // ce joueur-là laisse ses offres expirer
  for (const o of mine) {
    if (B.left <= 1) break;
    const city = bot.cities.find(c => c.id === o.cityId);
    const age = (now - Date.parse(o.createdAt)) / 3600000;
    const absurd = city && (ratio(city, o.sellResource) < 0.2 || ratio(city, o.buyResource) > 0.8);
    const release = S.release.has(o.cityId);
    if (!release && !absurd && (patient || age < STALE_H)) continue;
    B.left--;
    const d = await bot.del(`/api/market/offer/${o.id}`);
    if (d.ok) {
      bump(m, release ? 'cancelRelease' : absurd ? 'cancelChanged' : 'cancelStale');
      if (!release && !absurd) { m.pf = Math.min(1.5, m.pf + 0.1); miss(S); }
      m.off = m.off.filter(t => t.i !== o.id);
      if (city) city[o.sellResource] = (city[o.sellResource] || 0) + o.sellAmount;
      const car = caravanOf(S, city || { id: o.cityId });
      if (car && car.status === 'MARKET') car.status = 'IDLE';
    } else bump(m, 'cancelRefused');
    break;   // une à la fois
  }

  // 2. accepter une offre qui convient
  const others = offers.filter(o => o.sellerId !== bot.playerId);
  let accepted = false;
  if (others.length && B.left > 1) {
    let best = null;
    for (const city of markets) {
      if (city.isSieged) continue;
      for (const o of others) {
        const v = offerValue(city, o);
        if (v === null) continue;
        const score = v - (o.city ? dist(o.city, city) / 2000 : 0);
        if (!best || score > best.score) best = { o, city, score };
      }
    }
    if (best) {
      const carrier = carrierFor(S, best.city, best.o.buyAmount);
      if (!carrier) bump(m, 'acceptNoCarrier');
      else if (!(await canTrade(ctx, bot.playerId, best.o.sellerId))) bump(m, 'acceptEnemySkipped');
      else {
        B.left--;
        const a = await bot.post(`/api/market/offer/${best.o.id}/accept`, { cityId: best.city.id, armyId: carrier.a.id });
        if (a.ok) {
          accepted = true;
          bump(m, 'accepted'); bump(m, carrier.own ? 'acceptByCaravan' : 'acceptByFieldArmy');
          bump(m, 'boughtVolume', best.o.sellAmount);
          best.city[best.o.buyResource] = (best.city[best.o.buyResource] || 0) - best.o.buyAmount;
          carrier.a.status = 'TRANSPORTING';
          if ((m.k.accepted || 0) === 1) ctx.event('market_first_trade', { bot: bot.name, give: `${best.o.buyAmount} ${best.o.buyResource}`, get: `${best.o.sellAmount} ${best.o.sellResource}`, seller: best.o.player?.name, toBuyer: a.data?.toBuyer, toSeller: a.data?.toSeller, taxes: [a.data?.sellerTax, a.data?.buyerTax] });
        } else bump(m, 'acceptRefused');
      }
    }
  }

  // 3. publier une offre avec la caravane libre
  if (B.left <= 1 || mine.length >= M.maxActiveOffers || (m.nx.p || 0) > ctx.step) return;
  for (const city of markets) {
    if (B.left <= 1) break;
    if (city.isSieged || m.off.some(t => t.c === city.id) || S.release.has(city.id)) continue;
    const car = caravanOf(S, city);
    if (!car || car.status !== 'IDLE' || !home(car, city) || unitsOf(car) === 0) continue;
    const plan = postPlan(S, city, capacity(car, city, S.faction));
    if (!plan) { bump(m, 'nothingToOffer'); continue; }
    // la taxe de la ville, comme l'écran du marché la montre en remplissant l'offre (de temps en temps)
    if ((m.nx.t || 0) <= ctx.step && B.left > 2) {
      B.left--;
      const t = await bot.get(`/api/market/tax?cityId=${city.id}`);
      if (t.ok) { m.taxPct = t.data?.taxPct; bump(m, 'taxChecks'); }
      m.nx.t = ctx.step + 40;
    }
    B.left--;
    const p = await bot.post('/api/market/offer', { ...plan, cityId: city.id, armyId: car.id });
    if (p.ok && p.data?.offer) {
      m.off.push({ i: p.data.offer.id, c: city.id, s: ctx.step });
      city[plan.sellResource] -= plan.sellAmount;
      car.status = 'MARKET';
      bump(m, 'posted'); bump(m, `posted_${plan.sellResource}`);
    } else bump(m, 'postRefused');
    if (accepted) break;
  }
}

// ---------- routes commerciales entre ses villes ----------
async function routes(S) {
  const { bot, ctx, B, m } = S;
  const cap = bot.capital;
  const colonies = bot.cities.filter(c => !c.isCapital && !c.isWonder);
  if (!cap || !colonies.length || B.left < 2 || (m.nx.r || 0) > ctx.step) return;
  m.nx.r = ctx.step + 4;   // tous les deux jours (un tour sur deux)
  B.left--;
  const r = await bot.get('/api/market/routes');
  if (!r.ok || !Array.isArray(r.data?.routes)) return;
  bump(m, 'routeLooks');
  bump(m, 'convoysSeen', (r.data.convoys || []).length);
  const list = r.data.routes;
  const mineIds = new Set(bot.cities.map(c => c.id));
  // une route dont une ville n'est plus à nous (chute, Merveille…) : supprimée
  const dead = list.find(x => !mineIds.has(x.fromCityId) || !mineIds.has(x.toCityId));
  if (dead && B.left > 1) {
    B.left--;
    const d = await bot.del(`/api/market/routes/${dead.id}`);
    if (d.ok) bump(m, 'routesDeleted'); else bump(m, 'routeDeleteRefused');
    return;
  }
  // ce que chaque route devrait faire maintenant
  const wants = [];
  for (const col of colonies) {
    const down = { from: cap, to: col, res: OTHER };
    const up = { from: col, to: cap, res: RES };
    const fc = avgRatio(cap, OTHER), tc = avgRatio(col, OTHER);
    // capitale → colonie : la jeune colonie manque, la capitale a de quoi
    down.on = fc >= 0.45 && tc <= 0.55 && fc - tc >= 0.15;
    down.keep = fc >= 0.35 && tc <= 0.75;
    // colonie → capitale : la colonie (production +20 %) déborde
    const fu = avgRatio(col, RES), tu = avgRatio(cap, RES);
    up.on = lvl(col, 'MARKET') >= 1 && fu >= 0.6 && tu <= fu - 0.2;
    up.keep = fu >= 0.45 && tu <= 0.85;
    wants.push(down, up);
  }
  for (const w of wants) {
    if (B.left <= 0) break;
    const route = list.find(x => x.fromCityId === w.from.id && x.toCityId === w.to.id);
    if (!route) {
      if (!w.on || lvl(w.from, 'MARKET') < 1 || list.length >= M.routes.maxPerPlayer || w.from.isSieged || w.to.isSieged) continue;
      B.left--;
      const c = await bot.post('/api/market/routes', { fromCityId: w.from.id, toCityId: w.to.id, ...Object.fromEntries(RES.map(x => [x, w.res.includes(x)])) });
      if (c.ok) {
        bump(m, 'routesCreated'); list.push(c.data.route);
        if ((m.k.routesCreated || 0) === 1) ctx.event('trade_route', { bot: bot.name, from: w.from.name, to: w.to.name, res: w.res.join('+') });
      } else bump(m, 'routeCreateRefused');
      break;   // une création par tour
    }
    const should = route.active ? (w.on || w.keep) : w.on;
    if (should === route.active) { if (route.active) bump(m, 'routeActiveTurns'); continue; }
    B.left--;
    const t = await bot.post(`/api/market/routes/${route.id}/toggle`);
    if (t.ok) { route.active = !!t.data?.active; bump(m, route.active ? 'routesResumed' : 'routesPaused'); }
    else bump(m, 'routeToggleRefused');
  }
}

// ---------- marchand du serveur (PNJ) : une ressource déborde (production perdue), une autre manque ----------
// le joueur préfère un échange entre joueurs (taxe 10 %) ; le marchand (30 % − 1 %/niveau du Marché) sert quand une
// offre pour cette ressource n'a pas trouvé preneur, ou qu'il n'a pas de caravane pour en publier une
async function npc(S, markets) {
  const { bot, ctx, B, m } = S;
  for (const city of markets) {
    if (B.left <= 0) break;
    if ((m.nx.n?.[city.id] || 0) > ctx.step) continue;
    const foodOk = (city.foodBalance?.net ?? -1) > 0;
    // l'entrepôt est plein : ce qui est produit en plus est perdu, autant le changer contre ce qui a de la place
    const over = RES.filter(r => ratio(city, r) >= 0.97 && (r !== 'food' || foodOk)).sort((a, b) => ratio(city, b) - ratio(city, a))[0];
    if (!over) continue;
    const lack = RES.filter(r => r !== over && ratio(city, r) <= 0.6 && ratio(city, over) - ratio(city, r) >= 0.35).sort((a, b) => ratio(city, a) - ratio(city, b))[0];
    if (!lack) continue;
    const waiting = m.off.some(t => t.c === city.id) || (caravanOf(S, city) && !(m.miss > 0) && ratio(city, lack) > 0.15);
    if (waiting) { bump(m, 'npcWaitP2P'); continue; }
    const tax = fx.npcMarketTaxPct(lvl(city, 'MARKET'));
    const give = round10(Math.min((city[over] || 0) - 0.75 * capOf(city, over), (0.75 * capOf(city, lack) - (city[lack] || 0)) / (1 - tax / 100), 0.25 * capOf(city, over)));
    if (give < 100) continue;
    (m.nx.n ||= {})[city.id] = ctx.step + 4;
    B.left--;
    const r = await bot.post('/api/market/npc-trade', { cityId: city.id, giveResource: over, receiveResource: lack, giveAmount: give });
    if (r.ok) {
      bump(m, 'npcTrades'); bump(m, 'npcGiven', r.data?.given || give); bump(m, 'npcReceived', r.data?.received || 0); bump(m, `npc_${over}_${lack}`);
      city[over] -= r.data?.given || give; city[lack] = (city[lack] || 0) + (r.data?.received || 0);
      if ((m.k.npcTrades || 0) === 1) ctx.event('market_npc', { bot: bot.name, give: `${r.data?.given} ${over}`, get: `${r.data?.received} ${lack}`, taxPct: r.data?.taxPct });
    } else bump(m, 'npcRefused');
  }
  // une seule entrée par ville encore à nous
  if (m.nx.n) for (const id of Object.keys(m.nx.n)) if (!bot.cities.some(c => c.id === id)) delete m.nx.n[id];
}

// ---------- envoi de ressources à un allié (POST /api/trade/send, l'écran « Envoyer ») ----------
// un allié a dit ce qui lui manque (messagerie d'alliance) : on envoie ce qu'on a en trop et qu'il n'a pas
async function aid(S) {
  const { bot, ctx, B, m } = S;
  const cap = bot.capital;
  const allianceId = bot.me?.alliance?.allianceId;
  if (!cap || !allianceId || B.left < 1 || (m.nx.a || 0) > ctx.step || cap.isSieged || !lvl(cap, 'MARKET')) return;
  m.nx.a = ctx.step + 8;   // tous les deux jours au plus
  const rich = RES.filter(r => ratio(cap, r) >= 0.85 && (r !== 'food' || (cap.foodBalance?.net ?? -1) > 0));
  if (!rich.length) return;
  // le serveur prend la première armée libre en ville : la charge doit tenir dans la plus petite
  const ready = fieldArmies(bot, cap).filter(a => a.status === 'IDLE' && home(a, cap) && unitsOf(a) > 0);
  if (!ready.length || bot.mem.mil?.col) return;
  const carry = Math.min(...ready.map(a => capacity(a, cap, S.faction)));
  let best = null;
  for (const b of ctx.bots) {
    const fc = b.capital;
    if (b === bot || b.me?.alliance?.allianceId !== allianceId || !fc || fc.isSieged || dist(fc, cap) > 80) continue;
    for (const r of rich) {
      const need = ratio(fc, r);
      if (need > 0.4) continue;
      const amount = round10(Math.min(carry, (cap[r] || 0) - 0.6 * capOf(cap, r), 0.6 * capOf(fc, r) - (fc[r] || 0)));
      if (amount >= 300 && (!best || need < best.need)) best = { b, r, amount, need };
    }
  }
  if (!best) return;
  B.left--;
  const r = await bot.post('/api/trade/send', { fromCityId: cap.id, targetX: best.b.capital.x, targetY: best.b.capital.y, resources: { [best.r]: best.amount } });
  if (r.ok) {
    bump(m, 'aidSent'); bump(m, 'aidVolume', best.amount); cap[best.r] -= best.amount;
    for (const a of ready) a.status = 'TRANSPORTING';   // l'une d'elles est partie : on ne la reprend pas ce tour-ci
    if ((m.k.aidSent || 0) === 1) ctx.event('market_aid', { from: bot.name, to: best.b.name, res: best.r, amount: best.amount });
  } else bump(m, 'aidRefused');
}

// ---------- contrôles propres au marché (lecture de la base) ----------
async function marketChecks(ctx) {
  const q = (sql, ...a) => ctx.prisma.$queryRawUnsafe(sql, ...a);
  const late = new Date(ctx.clock.now() - 13 * 3600000);
  const out = [];
  const add = async (check, sql, ...a) => { const rows = await q(sql, ...a); if (rows.length) out.push({ check, count: rows.length, sample: JSON.parse(JSON.stringify(rows.slice(0, 5), (k, v) => (typeof v === 'bigint' ? Number(v) : v))) }); };
  await add('marché : offre active expirée depuis longtemps', `SELECT id, "sellerId", "expiresAt" FROM "MarketOffer" WHERE status = 'ACTIVE' AND "expiresAt" < $1`, late);
  await add('marché : offre active sans son armée réservée', `SELECT o.id, o."armyId", a.status FROM "MarketOffer" o LEFT JOIN "Army" a ON a.id = o."armyId" WHERE o.status = 'ACTIVE' AND (a.id IS NULL OR a.status <> 'MARKET')`);
  await add('marché : armée réservée sans offre active', `SELECT a.id, a.name, a."ownerId" FROM "Army" a WHERE a.status = 'MARKET' AND NOT EXISTS (SELECT 1 FROM "MarketOffer" o WHERE o."armyId" = a.id AND o.status = 'ACTIVE')`);
  await add('marché : armée réservée hors de sa ville', `SELECT a.id, a.x, a.y, c.x AS cx, c.y AS cy FROM "Army" a JOIN "City" c ON c.id = a."cityId" WHERE a.status = 'MARKET' AND (a.x <> c.x OR a.y <> c.y)`);
  await add('marché : plus d\'offres actives que permis', `SELECT "sellerId", count(*)::int AS n FROM "MarketOffer" WHERE status = 'ACTIVE' GROUP BY 1 HAVING count(*) > $1`, M.maxActiveOffers);
  await add('marché : convoi de route jamais livré', `SELECT id, "fromCityId", "toCityId", "arrivalAt" FROM "TradeConvoy" WHERE "arrivalAt" < $1`, late);
  await add('marché : route active jamais partie', `SELECT id, "nextSendAt" FROM "TradeRoute" WHERE active AND "nextSendAt" < $1`, late);
  await add('marché : échange conclu sans acheteur', `SELECT id FROM "MarketOffer" WHERE status = 'COMPLETED' AND ("buyerId" IS NULL OR "buyerCityId" IS NULL OR "acceptedAt" IS NULL)`);
  await add('marché : armée de livraison qui rentre encore chargée', `SELECT id, status, "carryWood", "carryStone", "carryIron", "carryFood" FROM "Army" WHERE "missionType" = 'MARKET_DELIVERY' AND status = 'RETURNING' AND ("carryWood" + "carryStone" + "carryIron" + "carryFood") > 0`).catch(() => {});
  return out;
}

// début du tour (08-market-early.cjs, avant l'économie) : la Place de rassemblement monte quand toutes ses places sont
// prises par les armées de campagne et qu'il n'y a pas de caravane
async function early(bot, ctx) {
  if (!bot.me || !Array.isArray(bot.cities) || !Array.isArray(bot.armies)) return;
  const cap = bot.capital;
  if (!cap || cap.isSieged || !lvl(cap, 'MARKET') || lvl(cap, 'MAIN_HALL') < 10) return;
  const m = memOf(bot);
  const S = { bot, ctx, m };
  if (caravanOf(S, cap) || freeSlots(bot, cap) - militaryNeed(bot, cap) > 0) return;
  const rp = lvl(cap, 'RALLY_POINT');
  const queue = cap.buildQueue || [];
  if (rp >= 15 || rp + 1 > lvl(cap, 'MAIN_HALL') || queue.length >= MAX_QUEUE || queue.some(q => q.buildingKey === 'RALLY_POINT')) return;
  const cost = buildCost('RALLY_POINT', rp + 1);
  if (!RES.every(r => (cap[r] || 0) >= cost[r] * 1.5)) return;
  const r = await bot.post(`/api/cities/${cap.id}/build`, { buildingKey: 'RALLY_POINT' });
  if (r.ok) {
    RES.forEach(k => { cap[k] -= r.data?.cost?.[k] || 0; });
    queue.push({ buildingKey: 'RALLY_POINT', targetLevel: rp + 1, slot: r.data?.queueItem?.slot ?? null });
    cap.buildQueue = queue;
    bump(m, 'rallyLevels');
  } else bump(m, 'rallyRefused');
}

module.exports = {
  name: 'market',
  early,
  async act(bot, ctx) {
    if (!bot.me || !Array.isArray(bot.cities) || !bot.cities.length || !Array.isArray(bot.armies)) return;
    const m = memOf(bot);
    // les armées disparues (monde neuf, ville perdue) ne sont plus suivies
    for (const [cid, aid] of Object.entries(m.car)) if (!bot.cities.some(c => c.id === cid) || !bot.armies.some(a => a.id === aid)) delete m.car[cid];
    const markets = bot.cities.filter(c => !c.isWonder && lvl(c, 'MARKET') >= 1);
    if (!markets.length) return;
    if (!m.k.marketDay) m.k.marketDay = ctx.clock.day();
    const S = { bot, ctx, m, B: { left: CALLS }, faction: bot.me.faction || bot.faction, release: new Set() };
    // la fondation d'une colonie a besoin de l'emplacement de la caravane : elle sera dissoute (son offre retirée d'abord)
    for (const c of markets) { const car = caravanOf(S, c); if (car && militaryNeed(bot, c) > 0 && freeSlots(bot, c) <= 0) S.release.add(c.id); }
    await trade(S, markets);
    await caravans(S, markets);
    await routes(S);
    await npc(S, markets);
    await aid(S);
  },
  async afterStep(ctx) {
    const total = Math.round(ctx.OPT.days * 24 / ctx.OPT.stepHours);
    // contrôles une fois par jour
    if (ctx.step % Math.max(1, Math.round(24 / ctx.OPT.stepHours)) === 0) {
      try { for (const v of await marketChecks(ctx)) ctx.event('violation', v); } catch (e) { console.error('[SIM] contrôles du marché :', e); }
    }
    if (ctx.step % 28 !== 0 && ctx.step !== total) return;
    const k = {};
    for (const b of ctx.bots) for (const [key, v] of Object.entries(b.mem.mkt?.k || {})) if (!/Day$/.test(key)) k[key] = (k[key] || 0) + v;
    let db = {};
    try {
      const q = (sql) => ctx.prisma.$queryRawUnsafe(sql);
      const num = async (sql) => Number((await q(sql))[0]?.n || 0);
      db = {
        offers: (await q(`SELECT status, count(*)::int AS n FROM "MarketOffer" GROUP BY 1 ORDER BY 1`)).map(r => `${r.status} ${r.n}`).join(', '),
        sellers: await num(`SELECT count(DISTINCT "sellerId")::int AS n FROM "MarketOffer" WHERE status = 'COMPLETED'`),
        buyers: await num(`SELECT count(DISTINCT "buyerId")::int AS n FROM "MarketOffer" WHERE status = 'COMPLETED'`),
        tradedVolume: await num(`SELECT coalesce(sum("sellAmount" + "buyAmount"), 0)::int AS n FROM "MarketOffer" WHERE status = 'COMPLETED'`),
        reservedArmies: await num(`SELECT count(*)::int AS n FROM "Army" WHERE status = 'MARKET'`),
        deliveries: await num(`SELECT count(*)::int AS n FROM "Army" WHERE "missionType" = 'MARKET_DELIVERY' AND status = 'TRANSPORTING'`),
        caravans: await num(`SELECT count(*)::int AS n FROM "Army" WHERE name = '${CARAVAN}' AND NOT "isGarrison"`),
        routes: (await q(`SELECT active, count(*)::int AS n FROM "TradeRoute" GROUP BY 1`)).map(r => `${r.active ? 'actives' : 'en pause'} ${r.n}`).join(', '),
        convoys: await num(`SELECT count(*)::int AS n FROM "TradeConvoy"`),
        markets: await num(`SELECT count(DISTINCT "cityId")::int AS n FROM "CityBuilding" WHERE key = 'MARKET' AND level >= 1`)
      };
    } catch (e) { db = { error: e.message }; }
    const days = ctx.bots.map(b => b.mem.mkt?.k?.firstCaravanDay).filter(Boolean);
    ctx.event('market_summary', { step: ctx.step, ...db, firstCaravanDay: days.length ? Math.min(...days) : null, counters: k });
    ctx.say(`marché : ${JSON.stringify({ ...db, posted: k.posted || 0, accepted: k.accepted || 0, sold: k.sold || 0, expired: k.expired || 0, cancelled: (k.cancelStale || 0) + (k.cancelChanged || 0) + (k.cancelRelease || 0), npc: k.npcTrades || 0, routes: k.routesCreated || 0, aid: k.aidSent || 0 })}`);
  }
};
