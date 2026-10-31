// Simulation longue — marché : échanges entre joueurs livrés par les marchands (offres, acceptations, annulations), routes
// commerciales automatiques entre ses villes, marchand du serveur (PNJ) quand un entrepôt déborde, envois de ressources à un
// allié ou à la Ville Merveille de l'alliance. Règles : src/routes/market.js, src/services/marketService.js, config.market,
// docs/ETAT-DES-SYSTEMES.md « Marché et commerce » et « Cycle du serveur et Merveille ».
//
// Revue des bâtiments (décisions du 31 octobre 2026) : la Place du marché n'existe que dans la capitale et sert toutes les
// villes du joueur ; elle donne un marchand par niveau. Toutes les livraisons du marché (offres, échanges, envois, routes)
// partent avec des marchands, occupés à l'aller comme au retour ; un marchand porte une charge selon la civilisation (avec le
// Comptoir et le Poste du Désert de la capitale). Le joueur lit ses marchands une fois par tour (GET /api/market/state, ou
// les routes) et n'envoie jamais plus que ce que ses marchands libres portent ; quand il en a manqué, il monte le Marché
// (début du tour, 08-market-early.cjs). Une ressource vaut pour la ville d'autant plus que son entrepôt est vide
// (1 − remplissage) :
//  - il publie une offre d'une ressource en trop contre une qui manque, en regardant le marché (paire déjà proposée par
//    d'autres évitée, ressource demandée préférée), à 1 pour 1, un peu plus quand ses offres ne partent pas (1,25 au plus :
//    au-delà le marchand du serveur rend autant) ;
//  - il accepte l'offre d'un autre quand il y gagne après la taxe (un membre de son alliance est aidé même à gain nul),
//    jamais d'un ennemi, jamais au point de déborder à l'arrivée ;
//  - il annule une offre restée sans preneur (ou devenue absurde) quand l'entrepôt peut reprendre les marchandises ; un
//    joueur sur trois la laisse expirer (48 h).
// Avec des colonies : route capitale → colonie (bois, pierre, fer) quand la colonie manque, colonie → capitale (tout) quand
// elle se remplit, jamais les deux à la fois ; avec une Ville Merveille, les colonies la remplissent par route. Le marchand
// PNJ (taxe 30 % − 1 %/niveau du Marché de la capitale, sans marchand) sert quand une ressource déborde et qu'une autre
// manque. Tous les deux jours au plus, un joueur riche envoie son surplus à la Ville Merveille de son alliance, sinon à un
// allié qui manque (/api/trade/send).
// Au plus CALLS appels par tour (lectures comprises) ; les conditions sont vérifiées avant chaque appel.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const { merchantsFor } = require(path.join(ROOT, 'src/services/marketService'));
const { getRelation } = require(path.join(ROOT, 'src/services/diplomacyService'));   // lecture seule : la diplomatie que le joueur connaît
// stock partagé (décision du 30 octobre 2026) : les constructions puisent dans toutes les villes, l'entretien dans tous les
// greniers ; le marché, lui, reste propre à chaque ville (offres, marchand, envois et routes lisent la ville seule)
const Stock = require('../stock.cjs');

const M = config.market;
const RES = ['wood', 'stone', 'iron', 'food'];
const OTHER = ['wood', 'stone', 'iron'];
const CALLS = 6;                 // appels par tour au plus
const STALE_H = 24;              // une offre sans preneur depuis 24 h est retirée (sauf par les joueurs qui la laissent expirer)
const MIN_TRADE = 200;
const SHORT_STEPS = 4;           // des marchands ont manqué il y a moins de 4 pas : le Marché monte (début du tour)
const MAX_QUEUE = config.build.maxRunning + config.build.maxQueued;

// ---------- petits outils ----------
const lvl = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const capOf = (city, r) => Math.max(1, (r === 'food' ? city.maxFoodStorage : city.maxStorage) || 1);
const ratio = (city, r) => (city[r] || 0) / capOf(city, r);
const avgRatio = (city, rs) => rs.reduce((t, r) => t + ratio(city, r), 0) / rs.length;
const round10 = (n) => Math.max(0, Math.floor(n / 10) * 10);
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function memOf(bot) {
  const m = (bot.mem.mkt ||= {});
  delete m.car;        // ancienne caravane (avant les marchands) : plus suivie
  m.off ||= [];        // offres publiées et suivies : { i: offre, c: ville, s: pas }
  m.nx ||= {};         // prochains pas : p (offre), r (routes), a (aide), n:{ville} (PNJ)
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

// ---------- marchands ----------
// Les marchands du joueur { total, free, capacity, speed }, lus une fois par tour (GET /api/market/state ; les routes les
// donnent aussi) ; chaque offre, échange ou envoi en retire ceux que le serveur dit avoir pris (merchantsUsed)
async function merchantsOf(S) {
  if (S.mer) return S.mer;
  const cap = S.bot.capital;
  if (!cap || S.B.left < 2) return null;
  S.B.left--;
  const r = await S.bot.get(`/api/market/state?cityId=${cap.id}`);
  if (!r.ok || !r.data?.merchants) return null;
  S.m.taxPct = r.data.taxPct;
  bump(S.m, 'merchantChecks');
  S.mer = { ...r.data.merchants };
  return S.mer;
}
// ce que portent les marchands libres
const freeLoad = (mer) => (mer ? mer.free * mer.capacity : 0);
// les marchands libres portent `amount` ; sinon le joueur s'en souvient (le Marché montera, 08-market-early.cjs)
function canCarry(S, amount) {
  const mer = S.mer;
  if (mer && merchantsFor(amount, mer.capacity) <= mer.free) return true;
  S.m.short = S.ctx.step;
  bump(S.m, 'noMerchants');
  return false;
}
const useMerchants = (S, n) => { if (S.mer) S.mer.free = Math.max(0, S.mer.free - (n || 0)); };

// ---------- échanges entre joueurs ----------
// ce que vaut une unité de plus d'une ressource pour la ville : beaucoup quand l'entrepôt est vide, presque rien plein
const WORTH_FLOOR = 0.1;
const worth = (city, r) => 1 - Math.min(1, ratio(city, r)) + WORTH_FLOOR;
const keepTax = 1 - M.p2pTaxPctBase / 100;   // ce qui arrive avec les marchands (la taxe de la ville qui envoie, 10 % au plus)
const PF_MAX = 1.25;                          // au-delà, le marchand du serveur (taxe 30 % − 1 %/niv.) rend autant

// ce que la ville publierait : une ressource en trop contre une qui manque, en tenant compte du marché (une paire déjà
// proposée par d'autres a peu de chances ; une ressource que d'autres demandent trouvera preneur)
// (de la nourriture ne part que si le bilan de tout le joueur est positif : l'entretien puise dans tous ses greniers)
const foodOk = (bot) => (Stock.foodBalance(bot)?.net ?? -1) > 0;
function postPlan(S, city, cap, offers) {
  const spareFood = foodOk(S.bot);
  const others = (offers || []).filter(o => o.sellerId !== S.bot.playerId);
  let best = null;
  for (const ex of RES) {
    const rx = ratio(city, ex);
    if (rx < 0.5 || (ex === 'food' && (!spareFood || rx < 0.65))) continue;
    for (const lack of RES) {
      if (lack === ex || rx - ratio(city, lack) < 0.25) continue;
      const gain = keepTax * worth(city, lack) - worth(city, ex);   // par unité, au prix de 1 pour 1
      if (gain <= 0.1) continue;
      const rivals = others.filter(o => o.sellResource === ex && o.buyResource === lack).length;
      const demand = others.filter(o => o.buyResource === ex).length;
      const score = gain - 0.12 * rivals + 0.05 * Math.min(3, demand);
      if (!best || score > best.score) best = { ex, lack, score };
    }
  }
  if (!best) return null;
  const { ex, lack } = best;
  // prix : 1 pour 1, plus quand personne n'a pris les dernières offres, jamais au point de perdre au change
  const pf = Math.min(PF_MAX, Math.max(1, S.m.pf), keepTax * worth(city, lack) / worth(city, ex));
  const spare = (city[ex] || 0) - capOf(city, ex) * 0.35;
  const room = capOf(city, lack) * 0.9 - (city[lack] || 0);
  const buy = round10(Math.min(room / keepTax, cap / pf, spare / pf, capOf(city, ex) * 0.3 / pf));
  const sell = round10(buy * pf);
  if (buy < MIN_TRADE * 0.75 || sell < MIN_TRADE || sell > cap || sell > (city[ex] || 0) - 50) return null;
  return { sellResource: ex, sellAmount: sell, buyResource: lack, buyAmount: buy };
}

// intérêt d'une offre pour la ville (null : elle ne convient pas). Un membre de son alliance est aidé même à petit gain.
function offerValue(city, o, ally, spareFood) {
  const give = o.buyResource, get = o.sellResource;
  if ((city[give] || 0) - o.buyAmount < capOf(city, give) * 0.2 + 50) return null;  // garder une réserve
  if (give === 'food' && !spareFood) return null;
  if (o.sellAmount / o.buyAmount < 0.75) return null;
  const recv = Math.floor(o.sellAmount * keepTax);
  if ((city[get] || 0) + recv > capOf(city, get) * 0.97) return null;               // rien ne doit déborder à l'arrivée
  // valeur de ce qu'on reçoit moins valeur de ce qu'on donne, par unité donnée
  const gain = (recv * worth(city, get) - o.buyAmount * worth(city, give)) / o.buyAmount;
  if (gain < (ally && ratio(city, give) >= 0.5 ? -0.05 : 0.08)) return null;
  return gain;
}

async function trade(S, markets) {
  const { bot, ctx, B, m } = S;
  const now = ctx.clock.now();
  if (B.left < 2) return;
  B.left--;
  const r = await bot.get('/api/market');
  if (!r.ok || !Array.isArray(r.data)) return;
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
        else {
          bump(m, 'expired'); m.pf = Math.min(PF_MAX, m.pf + 0.05); miss(S);
          // rendue par le jeu dans un entrepôt déjà plein : le surplus est perdu (creditCity plafonne au stockage)
          const c = bot.cities.find(x => x.id === t.c);
          if (c && t.r && t.n && (c[t.r] || 0) >= capOf(c, t.r) * 0.98) bump(m, 'expiredIntoFullStore');
        }
      }
    }
  }
  // les offres d'avant une reprise : suivies aussi
  for (const o of mine) if (!m.off.some(t => t.i === o.id) && m.off.length < 6) m.off.push({ i: o.id, c: o.cityId, s: ctx.step, r: o.sellResource, n: o.sellAmount });

  // 1. retirer une offre : sans preneur depuis longtemps, ou devenue absurde (ses marchands redeviennent libres)
  const patient = hash(bot.name) % 3 === 0;   // ce joueur-là laisse ses offres expirer
  for (const o of mine) {
    if (B.left <= 1) break;
    const city = bot.cities.find(c => c.id === o.cityId);
    const age = (now - Date.parse(o.createdAt)) / 3600000;
    const absurd = city && (ratio(city, o.sellResource) < 0.2 || ratio(city, o.buyResource) > 0.8);
    if (!absurd && (patient || age < STALE_H)) continue;
    // les marchandises rendues ne tiendraient pas dans l'entrepôt : on attend d'avoir dépensé
    if (city && (city[o.sellResource] || 0) + o.sellAmount > capOf(city, o.sellResource)) { bump(m, 'cancelWaitRoom'); continue; }
    B.left--;
    const d = await bot.del(`/api/market/offer/${o.id}`);
    if (d.ok) {
      bump(m, absurd ? 'cancelChanged' : 'cancelStale');
      if (!absurd) { m.pf = Math.min(PF_MAX, m.pf + 0.05); miss(S); }
      m.off = m.off.filter(t => t.i !== o.id);
      if (city) city[o.sellResource] = (city[o.sellResource] || 0) + o.sellAmount;
      if (S.mer) S.mer.free += d.data?.merchantsFreed ?? o.merchants ?? 0;
    } else bump(m, 'cancelRefused');
    break;   // une à la fois
  }

  // 2. accepter une offre qui convient : les marchands du joueur portent la contrepartie (buyAmount)
  const others = offers.filter(o => o.sellerId !== bot.playerId);
  const allianceId = bot.me?.alliance?.allianceId;
  const allies = new Set(allianceId ? ctx.bots.filter(b => b !== bot && b.me?.alliance?.allianceId === allianceId).map(b => b.playerId) : []);
  let accepted = false;
  if (others.length && B.left > 2 && (await merchantsOf(S))) {
    const cands = [];
    for (const city of markets) {
      if (city.isSieged) continue;
      for (const o of others) {
        if (o.buyAmount > S.mer.total * S.mer.capacity) continue;   // même tous ses marchands ne le porteraient pas
        const v = offerValue(city, o, allies.has(o.sellerId), foodOk(bot));
        if (v === null) continue;
        cands.push({ o, city, score: v - (o.city ? dist(o.city, city) / 2000 : 0) });
      }
    }
    cands.sort((x, y) => y.score - x.score);
    const used = new Set();
    for (const best of cands.slice(0, 4)) {
      if (B.left <= 1 || used.has(best.o.id)) continue;
      if (!canCarry(S, best.o.buyAmount)) continue;
      if (!(await canTrade(ctx, bot.playerId, best.o.sellerId))) { bump(m, 'acceptEnemySkipped'); used.add(best.o.id); continue; }
      B.left--;
      used.add(best.o.id);
      const a = await bot.post(`/api/market/offer/${best.o.id}/accept`, { cityId: best.city.id });
      if (a.ok) {
        accepted = true;
        useMerchants(S, a.data?.merchantsUsed);
        bump(m, 'accepted'); bump(m, 'acceptMerchants', a.data?.merchantsUsed || 0);
        if (allies.has(best.o.sellerId)) bump(m, 'acceptAlly');
        bump(m, 'boughtVolume', best.o.sellAmount); bump(m, `bought_${best.o.sellResource}`);
        best.city[best.o.buyResource] = (best.city[best.o.buyResource] || 0) - best.o.buyAmount;
        if ((m.k.accepted || 0) === 1) ctx.event('market_first_trade', { bot: bot.name, give: `${best.o.buyAmount} ${best.o.buyResource}`, get: `${best.o.sellAmount} ${best.o.sellResource}`, seller: best.o.player?.name, ally: allies.has(best.o.sellerId), toBuyer: a.data?.toBuyer, toSeller: a.data?.toSeller, taxes: [a.data?.sellerTax, a.data?.buyerTax], merchants: a.data?.merchantsUsed, arrivalAt: a.data?.arrivalAt, returnAt: a.data?.returnAt });
        break;   // un échange par tour
      }
      bump(m, 'acceptRefused');
      break;
    }
  }

  // 3. publier une offre : ses marchands attendent en ville avec les marchandises jusqu'à l'échange
  if (B.left <= 1 || mine.length >= M.maxActiveOffers || (m.nx.p || 0) > ctx.step) return;
  for (const city of markets) {
    if (B.left <= 1) break;
    if (city.isSieged || m.off.some(t => t.c === city.id)) continue;
    if (!(await merchantsOf(S))) return;
    const load = freeLoad(S.mer);
    if (load < MIN_TRADE) { canCarry(S, MIN_TRADE); return; }   // tous ses marchands sont en route
    const plan = postPlan(S, city, load, offers);
    if (!plan) { bump(m, 'nothingToOffer'); continue; }
    B.left--;
    const p = await bot.post('/api/market/offer', { ...plan, cityId: city.id });
    if (p.ok && p.data?.offer) {
      m.off.push({ i: p.data.offer.id, c: city.id, s: ctx.step, r: plan.sellResource, n: plan.sellAmount });
      city[plan.sellResource] -= plan.sellAmount;
      useMerchants(S, p.data.merchantsUsed);
      if (p.data.taxPct !== undefined) m.taxPct = p.data.taxPct;
      bump(m, 'posted'); bump(m, `posted_${plan.sellResource}`);
    } else bump(m, 'postRefused');
    if (accepted) break;
  }
}

// ---------- routes commerciales entre ses villes ----------
// Une seule route active par ville de départ et par ressource (la cadence de 1/12 du stockage toutes les 2 h vaut pour la
// ville) : une seule route capitale → colonie à la fois (la colonie qui manque le plus), et d'une colonie soit vers la
// capitale soit vers la Ville Merveille. Les pauses passent avant les reprises et créations, qui ne heurtent jamais une
// route active (vérifié avant l'appel).
const carries = (route, r) => !!route[r];
async function routes(S) {
  const { bot, ctx, B, m } = S;
  const cap = bot.capital;
  const colonies = bot.cities.filter(c => !c.isCapital && !c.isWonder);
  const wonder = bot.cities.find(c => c.isWonder) || null;
  if (!cap || !colonies.length || B.left < 2 || (m.nx.r || 0) > ctx.step) return;
  m.nx.r = ctx.step + (wonder ? 2 : 4);   // une fois par jour (à chaque tour quand une Ville Merveille se remplit)
  B.left--;
  const r = await bot.get('/api/market/routes');
  if (!r.ok || !Array.isArray(r.data?.routes)) return;
  bump(m, 'routeLooks');
  bump(m, 'convoysSeen', (r.data.convoys || []).length);
  if (r.data.merchants) S.mer ||= { ...r.data.merchants };   // les marchands du joueur, pour le reste du tour
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
  const find = (from, to) => list.find(x => x.fromCityId === from.id && x.toCityId === to.id) || null;
  // ce que chaque route devrait faire maintenant
  const wants = [];
  const fc = avgRatio(cap, OTHER), room = Math.min(...RES.map(x => ratio(cap, x)));
  for (const col of colonies) {
    const tc = avgRatio(col, OTHER), fu = avgRatio(col, RES);
    // capitale → colonie : la jeune colonie manque, la capitale a de quoi
    const down = { kind: 'down', from: cap, to: col, res: OTHER, need: tc, on: fc >= 0.45 && tc <= 0.5 && fc - tc >= 0.15, keep: fc >= 0.35 && tc <= 0.75 };
    // colonie → capitale : la colonie se remplit et la capitale a de la place ; ce qui ne tient pas à l'arrivée revient
    // avec les marchands, la route peut donc rester ouverte tant que la colonie n'a pas besoin de son stock
    const up = { kind: 'up', from: col, to: cap, res: RES, on: fu >= 0.6 && room <= 0.8, keep: fu >= 0.4 && room <= 0.92 };
    // Ville Merveille (stock sans plafond, docs « Cycle du serveur et Merveille ») : les colonies y envoient leur production ;
    // une route vide la ville de départ : la capitale garde la sienne (elle envoie son surplus par convoi, voir aid)
    const won = wonder ? { kind: 'wonder', from: col, to: wonder, res: RES, on: fu >= 0.5, keep: fu >= 0.3 } : null;
    for (const w of [won, down, up].filter(Boolean)) {
      w.route = find(w.from, w.to);
      w.should = w.route ? (w.route.active ? (w.on || w.keep) : w.on) : w.on;
      wants.push(w);
    }
    if (won?.should) up.should = false;                                   // la Merveille d'abord
    if (down.should) up.should = false;                                   // jamais dans les deux sens à la fois
  }
  // une seule route capitale → colonie : celle qui roule déjà, sinon la colonie qui manque le plus
  const downs = wants.filter(w => w.kind === 'down' && w.should).sort((x, y) => (y.route?.active ? 1 : 0) - (x.route?.active ? 1 : 0) || x.need - y.need);
  for (const w of downs.slice(1)) w.should = false;
  // 1. les pauses
  for (const w of wants) {
    if (B.left <= 0) return;
    if (!w.route || !w.route.active || w.should) { if (w.route?.active) bump(m, 'routeActiveTurns'); continue; }
    B.left--;
    const t = await bot.post(`/api/market/routes/${w.route.id}/toggle`);
    if (t.ok) { w.route.active = !!t.data?.active; bump(m, 'routesPaused'); } else bump(m, 'routeToggleRefused');
  }
  // 2. reprises et créations (une création par tour)
  for (const w of wants) {
    if (B.left <= 0) return;
    if (!w.should || w.route?.active || w.from.isSieged || w.to.isSieged) continue;
    if (list.some(x => x !== w.route && x.active && x.fromCityId === w.from.id && w.res.some(res => carries(x, res)))) { bump(m, 'routeClashAvoided'); continue; }
    if (w.route) {
      B.left--;
      const t = await bot.post(`/api/market/routes/${w.route.id}/toggle`);
      if (t.ok) { w.route.active = !!t.data?.active; bump(m, 'routesResumed'); } else bump(m, 'routeToggleRefused');
      continue;
    }
    if (lvl(cap, 'MARKET') < 1 || list.length >= M.routes.maxPerPlayer) continue;   // le Marché de la capitale sert toutes les villes
    B.left--;
    const c = await bot.post('/api/market/routes', { fromCityId: w.from.id, toCityId: w.to.id, ...Object.fromEntries(RES.map(x => [x, w.res.includes(x)])) });
    if (c.ok && c.data?.route) {
      bump(m, 'routesCreated'); bump(m, `routes_${w.kind}`); list.push(c.data.route);
      if ((m.k.routesCreated || 0) === 1 || w.kind === 'wonder') ctx.event(w.kind === 'wonder' ? 'wonder_route' : 'trade_route', { bot: bot.name, from: w.from.name, to: w.to.name, res: w.res.join('+') });
    } else bump(m, 'routeCreateRefused');
    break;
  }
}

// ---------- marchand du serveur (PNJ) : une ressource déborde (production perdue), une autre manque ----------
// le joueur préfère un échange entre joueurs (taxe 10 %) ; le marchand (30 % − 1 %/niveau du Marché de la capitale, sans
// marchand, dans n'importe quelle ville) sert quand une offre pour cette ressource n'a pas trouvé preneur, ou que tous ses
// marchands sont en route
async function npc(S, markets) {
  const { bot, ctx, B, m } = S;
  const tax = fx.npcMarketTaxPct(lvl(bot.capital, 'MARKET'));
  for (const city of markets) {
    if (B.left <= 0) break;
    if ((m.nx.n?.[city.id] || 0) > ctx.step) continue;
    // l'entrepôt est plein : ce qui est produit en plus est perdu, autant le changer contre ce qui a de la place
    const over = RES.filter(r => ratio(city, r) >= 0.97 && (r !== 'food' || foodOk(bot))).sort((a, b) => ratio(city, b) - ratio(city, a))[0];
    if (!over) continue;
    const lack = RES.filter(r => r !== over && ratio(city, r) <= 0.6 && ratio(city, over) - ratio(city, r) >= 0.35).sort((a, b) => ratio(city, a) - ratio(city, b))[0];
    if (!lack) continue;
    const waiting = m.off.some(t => t.c === city.id) || (freeLoad(S.mer) >= MIN_TRADE && !(m.miss > 0) && ratio(city, lack) > 0.15);
    if (waiting) { bump(m, 'npcWaitP2P'); continue; }
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

// ---------- envoi de ressources (POST /api/trade/send, l'écran « Envoyer ») ----------
// 1. une Ville Merveille de son alliance se construit avec le stock que lui apportent les membres : on y envoie le surplus
// 2. sinon, un allié a dit ce qui lui manque (messagerie d'alliance) : on envoie ce qu'on a en trop et qu'il n'a pas
const WONDERS = { step: -1, n: 0 };
async function wondersOnMap(ctx) {   // les Villes Merveille sont sur la carte : on regarde s'il y en a (lecture seule)
  if (WONDERS.step !== ctx.step) { WONDERS.step = ctx.step; try { WONDERS.n = await ctx.prisma.city.count({ where: { isWonder: true } }); } catch (e) { WONDERS.n = 0; } }
  return WONDERS.n;
}
async function aid(S) {
  const { bot, ctx, B, m } = S;
  const cap = bot.capital;
  const allianceId = bot.me?.alliance?.allianceId;
  if (!cap || !allianceId || B.left < 1 || (m.nx.a || 0) > ctx.step || cap.isSieged || !lvl(cap, 'MARKET')) return;
  m.nx.a = ctx.step + 8;   // tous les deux jours au plus
  const spareFood = foodOk(bot);
  // ses marchands libres portent l'envoi
  if (!(await merchantsOf(S))) return;
  const carry = freeLoad(S.mer);
  if (carry < 300) { canCarry(S, 300); bump(m, 'aidNoMerchants'); return; }
  let send = null;

  // 1. la Merveille de l'alliance (GET /api/wonder : l'écran « Monde »)
  if (B.left >= 2 && (await wondersOnMap(ctx)) > 0) {
    B.left--;
    const w = await bot.get('/api/wonder');
    const mine = w.ok && Array.isArray(w.data?.wonders) ? w.data.wonders.filter(x => x.alliance?.id === allianceId && x.owner?.id !== bot.playerId) : [];
    const target = mine.sort((x, y) => dist(x, cap) - dist(y, cap))[0];
    if (target) {
      const extra = Object.fromEntries(RES.map(r => [r, ratio(cap, r) >= 0.6 && (r !== 'food' || spareFood) ? Math.max(0, (cap[r] || 0) - 0.5 * capOf(cap, r)) : 0]));
      const total = RES.reduce((t, r) => t + extra[r], 0);
      if (total >= 500) {
        const k = Math.min(1, carry / total);
        const resources = Object.fromEntries(RES.map(r => [r, round10(extra[r] * k)]).filter(([, v]) => v > 0));
        if (Object.values(resources).reduce((t, v) => t + v, 0) >= 300) send = { x: target.x, y: target.y, name: target.name, resources, wonder: true };
      }
    }
  }
  // 2. un allié qui manque de ce qu'on a en trop
  if (!send) {
    const rich = RES.filter(r => ratio(cap, r) >= 0.8 && (r !== 'food' || spareFood));
    let best = null;
    for (const b of ctx.bots) {
      const fc = b.capital;
      if (!rich.length || b === bot || b.me?.alliance?.allianceId !== allianceId || !fc || fc.isSieged || dist(fc, cap) > 100) continue;
      for (const r of rich) {
        const need = ratio(fc, r);
        if (need > 0.35 || ratio(cap, r) - need < 0.45) continue;
        const amount = round10(Math.min(carry, (cap[r] || 0) - 0.6 * capOf(cap, r), 0.6 * capOf(fc, r) - (fc[r] || 0)));
        if (amount >= 300 && (!best || need < best.need)) best = { b, r, amount, need };
      }
    }
    if (best) send = { x: best.b.capital.x, y: best.b.capital.y, name: best.b.name, resources: { [best.r]: best.amount } };
  }
  if (!send || B.left < 1) { bump(m, 'aidNothing'); return; }
  B.left--;
  const r = await bot.post('/api/trade/send', { fromCityId: cap.id, targetX: send.x, targetY: send.y, resources: send.resources });
  if (r.ok) {
    const vol = Object.values(send.resources).reduce((t, v) => t + v, 0);
    bump(m, send.wonder ? 'wonderSent' : 'aidSent'); bump(m, send.wonder ? 'wonderVolume' : 'aidVolume', vol);
    for (const [k, v] of Object.entries(send.resources)) cap[k] -= v;
    useMerchants(S, r.data?.merchantsUsed);
    if ((m.k[send.wonder ? 'wonderSent' : 'aidSent'] || 0) === 1) ctx.event(send.wonder ? 'wonder_supply' : 'market_aid', { from: bot.name, to: send.name, resources: send.resources });
  } else bump(m, 'aidRefused');
}

// ---------- contrôles propres au marché (lecture de la base) ----------
async function marketChecks(ctx) {
  const q = (sql, ...a) => ctx.prisma.$queryRawUnsafe(sql, ...a);
  const late = new Date(ctx.clock.now() - 13 * 3600000);
  const out = [];
  const add = async (check, sql, ...a) => { const rows = await q(sql, ...a); if (rows.length) out.push({ check, count: rows.length, sample: JSON.parse(JSON.stringify(rows.slice(0, 5), (k, v) => (typeof v === 'bigint' ? Number(v) : v))) }); };
  await add('marché : offre active expirée depuis longtemps', `SELECT id, "sellerId", "expiresAt" FROM "MarketOffer" WHERE status = 'ACTIVE' AND "expiresAt" < $1`, late);
  await add('marché : offre active sans marchand', `SELECT id, "sellerId", "sellAmount", merchants FROM "MarketOffer" WHERE status = 'ACTIVE' AND merchants < 1`);
  // marchands occupés (en route, aller ou retour, et ceux qui attendent avec une offre) : jamais plus que le Marché de la capitale
  await add('marché : plus de marchands occupés que le Marché de la capitale n\'en donne', `SELECT busy.pid, busy.n, coalesce(max(mk.level), 0)::int AS market FROM (
      SELECT pid, sum(n)::int AS n FROM (SELECT "playerId" AS pid, merchants AS n FROM "TradeConvoy" UNION ALL SELECT "sellerId", merchants FROM "MarketOffer" WHERE status = 'ACTIVE') x GROUP BY pid
    ) busy LEFT JOIN "City" c ON c."playerId" = busy.pid AND c."isCapital" LEFT JOIN "CityBuilding" mk ON mk."cityId" = c.id AND mk.key = 'MARKET'
    GROUP BY busy.pid, busy.n HAVING busy.n > coalesce(max(mk.level), 0) * $1`, fx.effectOf('MARKET', 'merchantsPerLevel', 1));
  await add('marché : plus d\'offres actives que permis', `SELECT "sellerId", count(*)::int AS n FROM "MarketOffer" WHERE status = 'ACTIVE' GROUP BY 1 HAVING count(*) > $1`, M.maxActiveOffers);
  await add('marché : marchands jamais arrivés', `SELECT id, kind, "fromCityId", "toCityId", "arrivalAt" FROM "TradeConvoy" WHERE "deliveredAt" IS NULL AND "arrivalAt" < $1`, late);
  await add('marché : marchands jamais rentrés', `SELECT id, kind, "playerId", "returnAt" FROM "TradeConvoy" WHERE "returnAt" < $1`, late);
  await add('marché : route active jamais partie', `SELECT id, "nextSendAt" FROM "TradeRoute" WHERE active AND "nextSendAt" < $1`, late);
  await add('marché : échange conclu sans acheteur', `SELECT id FROM "MarketOffer" WHERE status = 'COMPLETED' AND ("buyerId" IS NULL OR "buyerCityId" IS NULL OR "acceptedAt" IS NULL)`);
  return out;
}

// début du tour (08-market-early.cjs, avant l'économie) : le Marché de la capitale monte d'un niveau (un marchand de plus)
// quand des marchands ont manqué il y a peu (offre, échange ou envoi remis faute de marchands libres)
async function early(bot, ctx) {
  if (!bot.me || !Array.isArray(bot.cities)) return;
  const cap = bot.capital;
  const m = memOf(bot);
  if (!cap || cap.isSieged || m.short === undefined || ctx.step - m.short > SHORT_STEPS) return;
  const cur = lvl(cap, 'MARKET');
  const queue = cap.buildQueue || [];
  if (!cur || cur >= fx.maxLevelIn('MARKET', true) || cur + 1 > lvl(cap, 'MAIN_HALL') || queue.length >= MAX_QUEUE || queue.some(q => q.buildingKey === 'MARKET')) return;
  const cost = Stock.buildCost('MARKET', cur + 1);
  if (!Stock.canPay(bot, cost, { margin: 1.5 })) return;
  const r = await bot.post(`/api/cities/${cap.id}/build`, { buildingKey: 'MARKET' });
  if (r.ok) {
    Stock.spend(bot, cap, r.data?.cost || cost);
    queue.push({ buildingKey: 'MARKET', targetLevel: cur + 1, slot: r.data?.queueItem?.slot ?? null });
    cap.buildQueue = queue;
    m.short = undefined;
    bump(m, 'marketLevels');
  } else bump(m, 'marketRefused');
}

module.exports = {
  name: 'market',
  early,
  async act(bot, ctx) {
    if (!bot.me || !Array.isArray(bot.cities) || !bot.cities.length) return;
    // le Marché de la capitale sert toutes les villes du joueur (la Ville Merveille ne fait que recevoir)
    if (!lvl(bot.capital, 'MARKET')) return;
    const markets = bot.cities.filter(c => !c.isWonder);
    const m = memOf(bot);
    if (!m.k.marketDay) m.k.marketDay = ctx.clock.day();
    // S.mer : les marchands du joueur, lus au premier besoin du tour (merchantsOf)
    const S = { bot, ctx, m, B: { left: CALLS }, mer: null };
    await trade(S, markets);
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
        merchantsWaiting: await num(`SELECT coalesce(sum(merchants), 0)::int AS n FROM "MarketOffer" WHERE status = 'ACTIVE'`),
        merchantsOnRoad: (await q(`SELECT kind, count(*)::int AS trips, coalesce(sum(merchants), 0)::int AS n FROM "TradeConvoy" GROUP BY 1 ORDER BY 1`)).map(r => `${r.kind} ${r.n} (${r.trips} trajets)`).join(', '),
        merchantsTotal: await num(`SELECT coalesce(sum(b.level), 0)::int AS n FROM "CityBuilding" b JOIN "City" c ON c.id = b."cityId" WHERE c."isCapital" AND b.key = 'MARKET'`),
        routes: (await q(`SELECT active, count(*)::int AS n FROM "TradeRoute" GROUP BY 1`)).map(r => `${r.active ? 'actives' : 'en pause'} ${r.n}`).join(', '),
        markets: await num(`SELECT count(DISTINCT b."cityId")::int AS n FROM "CityBuilding" b JOIN "City" c ON c.id = b."cityId" WHERE c."isCapital" AND b.key = 'MARKET' AND b.level >= 1`)
      };
    } catch (e) { db = { error: e.message }; }
    // remplissage moyen des entrepôts (capitales, colonies) : ce qui manque à tous ne se trouve pas entre joueurs
    const fill = {};
    for (const kind of ['cap', 'col']) {
      const cs = ctx.bots.flatMap(b => (b.cities || []).filter(c => !c.isWonder && (kind === 'cap' ? c.isCapital : !c.isCapital)));
      if (!cs.length) continue;
      const f = { n: cs.length };
      for (const r of RES) f[r] = Math.round(100 * cs.reduce((t, c) => t + Math.min(1, ratio(c, r)), 0) / cs.length);
      f.lack = RES.map(r => `${r} ${cs.filter(c => RES.every(x => ratio(c, r) <= ratio(c, x))).length}`).join(', ');
      fill[kind] = f;
    }
    db.fill = fill;
    const days = ctx.bots.map(b => b.mem.mkt?.k?.marketDay).filter(Boolean);
    ctx.event('market_summary', { step: ctx.step, ...db, firstMarketDay: days.length ? Math.min(...days) : null, counters: k });
    const { fill: fl, ...dbShort } = db;
    ctx.say(`marché : remplissage ${JSON.stringify(fl)}`);
    ctx.say(`marché : ${JSON.stringify({ ...dbShort, posted: k.posted || 0, accepted: k.accepted || 0, ally: k.acceptAlly || 0, sold: k.sold || 0, expired: k.expired || 0, cancelled: (k.cancelStale || 0) + (k.cancelChanged || 0), noMerchants: k.noMerchants || 0, marketLevels: k.marketLevels || 0, npc: k.npcTrades || 0, routes: k.routesCreated || 0, aid: k.aidSent || 0 })}`);
  }
};
