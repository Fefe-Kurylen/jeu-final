// Simulation longue — marché : échanges entre joueurs portés par des armées, marchand du serveur, envois à un allié. Règles :
// src/routes/market.js, src/services/marketService.js, config.market.
//
// Décision du 31 octobre 2026 (rapport de vérification) : plus de marchands ni de routes entre ses villes, le stock du
// joueur est commun (dépenses et entretien puisent dans toutes ses villes) ; un échange entre joueurs se livre par armées,
// avec la charge de leurs troupes (civilisation, Marché, Comptoir et Poste du Désert de la capitale, Bastion).
// - L'armée « Caravane » (rôle caravan de ../armies.cjs) se forme au début du tour (08-market-early.cjs) sur un emplacement
//   de la Place de rassemblement que les autres rôles n'attendent pas, remplie des meilleurs porteurs de la garnison.
// - Offre (POST /api/market/offer, armyId = la caravane) : une ressource en trop contre une qui manque, au plus ce que porte
//   la caravane, en regardant le marché (paire déjà proposée par d'autres évitée, ressource demandée préférée), à 1 pour 1,
//   un peu plus quand ses offres ne partent pas (1,25 au plus). L'offre réserve la caravane (statut MARKET) : elle attend en
//   ville avec les marchandises jusqu'à l'échange ; ce n'est pas une armée libre.
// - Accepter (POST /api/market/offer/:id/accept, armyId choisi) : une armée libre de la ville porte la contrepartie, la
//   caravane d'abord, sinon le convoi d'alliance ou l'armée de campagne au repos (un aller-retour) ; jamais d'un ennemi,
//   jamais au point de déborder à l'arrivée ; un membre de son alliance est aidé même à gain nul. GET /api/market/state
//   donne les armées libres de la ville et leur charge. 409 « Offre déjà prise » / « Armée déjà en mission » : normaux.
// - Retirer une offre restée sans preneur (ou devenue absurde) quand l'entrepôt peut reprendre les marchandises (la
//   caravane redevient libre) ; un joueur sur trois la laisse expirer (48 h).
// - Marchand du serveur (taxe 30 % − 1 %/niveau du Marché de la capitale, sans armée) : quand une ressource déborde et
//   qu'une autre manque. Les céréales s'achètent seulement quand le joueur en manque vraiment (tous ses greniers à moins de
//   moitié pleins) : la capitale paie ses troupes d'abord, son grenier est presque toujours bas (simulation sim-d : 2 044
//   achats de céréales alors que les greniers du joueur étaient pleins à 90 %, mangés au tick suivant, 11 % de taxe perdue).
//   Celles de la Ville Merveille s'achètent dans 70-wonder.cjs, juste avant la livraison.
// - Envoi à un allié qui manque (POST /api/trade/send, armée libre), jamais vers ses propres villes. Les livraisons à la
//   Ville Merveille de l'alliance sont dans 70-wonder.cjs.
// Au plus CALLS appels par tour (lectures comprises) ; les conditions sont vérifiées avant chaque appel.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { unitsData } = require(path.join(ROOT, 'src/config/gamedata'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const { p2pTaxPctOf } = require(path.join(ROOT, 'src/services/marketService'));   // la taxe des échanges, formule du serveur
const { getRelation } = require(path.join(ROOT, 'src/services/diplomacyService'));   // lecture seule : la diplomatie que le joueur connaît
const Stock = require('../stock.cjs');
const Armies = require('../armies.cjs');

const M = config.market;
const RES = ['wood', 'stone', 'iron', 'food'];
const UNIT = Object.fromEntries(unitsData.map(u => [u.key, u]));
const CALLS = 6;                 // appels par tour au plus
const STALE_H = 24;              // une offre sans preneur depuis 24 h est retirée (sauf par les joueurs qui la laissent expirer)
const MIN_TRADE = 200;
const PORTER_SHARE = 0.25;       // part de chaque troupe de la garnison que la caravane prend au plus
// armées que le marché n'emprunte jamais : celles d'un autre rôle (armée de guerre, gardes, chasse aux hordes)
const NOT_FOR_TRADE = new Set([Armies.NAMES.ost, Armies.NAMES.guard, Armies.NAMES.wonder, Armies.NAMES.hunt]);

// ---------- petits outils ----------
const lvl = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const capOf = (city, r) => Math.max(1, (r === 'food' ? city.maxFoodStorage : city.maxStorage) || 1);
const ratio = (city, r) => (city[r] || 0) / capOf(city, r);
const round10 = (n) => Math.max(0, Math.floor(n / 10) * 10);
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const isSiege = (k) => UNIT[k]?.class === 'SIEGE';
const soldiers = (a) => (a?.units || []).filter(u => !isSiege(u.unitKey)).reduce((t, u) => t + (u.count || 0), 0);
const carryOfUnit = (k) => UNIT[k]?.stats?.transport || 50;
const garrisonOf = (bot, city) => bot.armies.find(a => a.isGarrison && a.cityId === city.id) || null;

function memOf(bot) {
  const m = (bot.mem.mkt ||= {});
  m.off ||= [];        // offres publiées et suivies : { i: offre, c: ville, s: pas, r: ressource, n: quantité }
  m.nx ||= {};         // prochains pas : p (offre), a (aide), c (caravane), n:{ville} (marchand du serveur)
  m.k ||= {};          // compteurs
  if (!(m.pf >= 1)) m.pf = 1;   // prix demandé (unités données par unité reçue), monte quand personne ne prend
  // marchands et routes d'avant le 31 octobre 2026 : plus suivis
  delete m.short; delete m.car;
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

// ---------- armées du marché ----------
const caravanOf = (bot) => Armies.named(bot, Armies.NAMES.caravan).find(a => a.cityId === bot.capital?.id) || null;
// Les armées libres de la ville et leur charge (GET /api/market/state, une lecture par tour et par ville) :
// { taxPct, armies: [{ id, name, capacity, hero }] }, la plus petite charge d'abord
async function stateOf(S, city) {
  S.st ||= {};
  if (S.st[city.id]) return S.st[city.id];
  if (S.B.left < 2) return null;
  S.B.left--;
  const r = await S.bot.get(`/api/market/state?cityId=${city.id}`);
  if (!r.ok || !Array.isArray(r.data?.armies)) return null;
  S.st[city.id] = { taxPct: r.data.taxPct, armies: r.data.armies };
  return S.st[city.id];
}
// Les armées que le marché peut faire partir pour un aller-retour : la caravane, le convoi d'alliance, l'armée de campagne
// du module militaire (pas celles d'une fondation en cours) ; jamais une armée d'un autre rôle, ni une armée gardée pour la
// Merveille (l'escorte du colon du fondateur, l'armée annoncée pour le prochain rassemblement : 70-wonder.cjs)
const wonder = () => require('./70-wonder.cjs');   // chargé à l'appel (70-wonder.cjs charge ce fichier)
const keptOf = (bot, step) => (bot.mem.wonder ? (id) => wonder().keptForWonder(bot, id, step) : () => false);
function tripArmies(bot, armies, step = bot.ctx?.step) {
  const col = bot.mem.mil?.col;
  const busy = new Set([col?.a, col?.b].filter(Boolean));
  const own = new Set(bot.mem.mil?.own || []);
  const kept = keptOf(bot, step);
  return armies.filter(a => !NOT_FOR_TRADE.has(a.name) && !busy.has(a.id) && (a.name === Armies.NAMES.caravan || a.name === Armies.NAMES.convoy || own.has(a.id)) && !kept(a.id));
}
// l'armée qui porte `amount` pour un aller-retour : la plus petite qui suffit, sans le héros quand c'est possible (comme le
// serveur quand on ne la choisit pas) ; offer : seulement la caravane (une offre la retient jusqu'à 48 h), sauf quand elle
// est l'escorte que le fondateur de la Ville Merveille garde (souvent sa plus petite armée)
function pickArmy(bot, st, amount, { offer = false } = {}) {
  const kept = keptOf(bot);
  const list = offer ? st.armies.filter(a => a.name === Armies.NAMES.caravan && !kept(a.id)) : tripArmies(bot, st.armies);
  const fits = list.filter(a => a.capacity >= amount);
  return fits.find(a => !a.hero) || fits[0] || null;
}
const markUsed = (st, id) => { st.armies = st.armies.filter(a => a.id !== id); };

// ---------- échanges entre joueurs ----------
// ce que vaut une unité de plus d'une ressource pour la ville : beaucoup quand l'entrepôt est vide, presque rien plein
const WORTH_FLOOR = 0.1;
const worth = (city, r) => 1 - Math.min(1, ratio(city, r)) + WORTH_FLOOR;
const PF_MAX = 1.25;                          // au-delà, le marchand du serveur (taxe 30 % − 1 %/niv.) rend autant
// ce qui arrive d'un échange après la taxe de l'armée qui livre (celle de l'autre joueur est inconnue : la sienne, celle du
// Comptoir et de la Chambre au Trésor de sa capitale, en donne l'ordre)
const keepOf = (bot) => 1 - p2pTaxPctOf(bot.capital?.buildings || []) / 100;

// ce que la ville publierait : une ressource en trop contre une qui manque, en tenant compte du marché (une paire déjà
// proposée par d'autres a peu de chances ; une ressource que d'autres demandent trouvera preneur)
// (de la nourriture ne part que si le bilan de tout le joueur est positif : l'entretien puise dans tous ses greniers)
const foodOk = (bot) => (Stock.foodBalance(bot)?.net ?? -1) > 0;
// le joueur manque vraiment de céréales : tous ses greniers réunis (stock commun) sont à moins de moitié pleins
const FOOD_SHORT = 0.5;
function foodShort(bot) {
  const t = Stock.totals(bot);
  return (t.food || 0) / Math.max(1, t.maxFoodStorage || 0) < FOOD_SHORT;
}
function postPlan(S, city, cap, offers) {
  const spareFood = foodOk(S.bot);
  const keep = keepOf(S.bot);
  const others = (offers || []).filter(o => o.sellerId !== S.bot.playerId);
  let best = null;
  for (const ex of RES) {
    const rx = ratio(city, ex);
    if (rx < 0.5 || (ex === 'food' && (!spareFood || rx < 0.65))) continue;
    for (const lack of RES) {
      if (lack === ex || rx - ratio(city, lack) < 0.25) continue;
      const gain = keep * worth(city, lack) - worth(city, ex);   // par unité, au prix de 1 pour 1
      if (gain <= 0.05) continue;
      const rivals = others.filter(o => o.sellResource === ex && o.buyResource === lack).length;
      const demand = others.filter(o => o.buyResource === ex).length;
      const score = gain - 0.12 * rivals + 0.05 * Math.min(3, demand);
      if (!best || score > best.score) best = { ex, lack, score };
    }
  }
  if (!best) return null;
  const { ex, lack } = best;
  // prix : 1 pour 1, plus quand personne n'a pris les dernières offres, jamais au point de perdre au change
  const pf = Math.min(PF_MAX, Math.max(1, S.m.pf), keep * worth(city, lack) / worth(city, ex));
  const spare = (city[ex] || 0) - capOf(city, ex) * 0.35;
  const room = capOf(city, lack) * 0.9 - (city[lack] || 0);
  const buy = round10(Math.min(room / keep, cap / pf, spare / pf, capOf(city, ex) * 0.3 / pf));
  const sell = round10(buy * pf);
  if (buy < MIN_TRADE * 0.75 || sell < MIN_TRADE || sell > cap || sell > (city[ex] || 0) - 50) return null;
  return { sellResource: ex, sellAmount: sell, buyResource: lack, buyAmount: buy };
}

// intérêt d'une offre pour la ville (null : elle ne convient pas). Un membre de son alliance est aidé même à petit gain.
function offerValue(city, o, ally, spareFood, keep) {
  const give = o.buyResource, get = o.sellResource;
  if ((city[give] || 0) - o.buyAmount < capOf(city, give) * 0.2 + 50) return null;  // garder une réserve
  if (give === 'food' && !spareFood) return null;
  if (o.sellAmount / o.buyAmount < 0.75) return null;
  const recv = Math.floor(o.sellAmount * keep);
  if ((city[get] || 0) + recv > capOf(city, get) * 0.97) return null;               // rien ne doit déborder à l'arrivée
  // valeur de ce qu'on reçoit moins valeur de ce qu'on donne (après sa propre taxe), par unité donnée
  const gain = (recv * worth(city, get) - o.buyAmount * worth(city, give)) / o.buyAmount;
  if (gain < (ally && ratio(city, give) >= 0.5 ? -0.05 : 0.05)) return null;
  return gain;
}

async function trade(S) {
  const { bot, ctx, B, m } = S;
  const cap = bot.capital;
  const now = ctx.clock.now();
  if (B.left < 2 || cap.isSieged) return;
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

  // 1. retirer une offre : sans preneur depuis longtemps, ou devenue absurde (la caravane redevient libre)
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
      const car = o.armyId && bot.armies.find(a => a.id === o.armyId);
      if (car) { car.status = 'IDLE'; car.missionType = null; }
    } else bump(m, 'cancelRefused');
    break;   // une à la fois
  }

  // 2. accepter une offre qui convient : une armée libre de la capitale porte la contrepartie (buyAmount)
  const others = offers.filter(o => o.sellerId !== bot.playerId);
  const allianceId = bot.me?.alliance?.allianceId;
  const allies = new Set(allianceId ? ctx.bots.filter(b => b !== bot && b.me?.alliance?.allianceId === allianceId).map(b => b.playerId) : []);
  const st = others.length && B.left > 2 ? await stateOf(S, cap) : null;
  if (st && tripArmies(bot, st.armies).length) {
    const keep = keepOf(bot);
    const cands = [];
    for (const o of others) {
      const v = offerValue(cap, o, allies.has(o.sellerId), foodOk(bot), keep);
      if (v === null) continue;
      cands.push({ o, score: v - (o.city ? dist(o.city, cap) / 2000 : 0) });
    }
    cands.sort((x, y) => y.score - x.score);
    for (const best of cands.slice(0, 4)) {
      if (B.left <= 1) break;
      const army = pickArmy(bot, st, best.o.buyAmount);
      if (!army) { bump(m, 'acceptNoArmy'); continue; }
      if (!(await canTrade(ctx, bot.playerId, best.o.sellerId))) { bump(m, 'acceptEnemySkipped'); continue; }
      B.left--;
      const a = await bot.post(`/api/market/offer/${best.o.id}/accept`, { cityId: cap.id, armyId: army.id });
      if (a.ok) {
        markUsed(st, army.id);
        const mine = bot.armies.find(x => x.id === army.id);
        if (mine) { mine.status = 'TRANSPORTING'; mine.missionType = 'MARKET_DELIVERY'; }
        bump(m, 'accepted'); if (army.name !== Armies.NAMES.caravan) bump(m, 'acceptBorrowedArmy');
        if (allies.has(best.o.sellerId)) bump(m, 'acceptAlly');
        bump(m, 'boughtVolume', best.o.sellAmount); bump(m, `bought_${best.o.sellResource}`);
        bump(m, 'deliveredToSeller', a.data?.toSeller || 0); bump(m, 'receivedFromSeller', a.data?.toBuyer || 0);
        cap[best.o.buyResource] = (cap[best.o.buyResource] || 0) - best.o.buyAmount;
        if ((m.k.accepted || 0) === 1) ctx.event('market_first_trade', { bot: bot.name, give: `${best.o.buyAmount} ${best.o.buyResource}`, get: `${best.o.sellAmount} ${best.o.sellResource}`, seller: best.o.player?.name, ally: allies.has(best.o.sellerId), army: army.name, capacity: army.capacity, toBuyer: a.data?.toBuyer, toSeller: a.data?.toSeller, taxes: [a.data?.sellerTax, a.data?.buyerTax], arrivalAt: a.data?.arrivalAt, returnAt: a.data?.returnAt });
        break;   // un échange par tour
      }
      // offre prise par un autre, armée partie au même instant : normal, on réessaiera
      bump(m, a.status === 409 ? 'acceptRaced' : 'acceptRefused');
      break;
    }
  }

  // 3. publier une offre : la caravane attend en ville avec les marchandises jusqu'à l'échange
  if (B.left <= 1 || mine.length >= M.maxActiveOffers || (m.nx.p || 0) > ctx.step || m.off.length) return;
  const car = caravanOf(bot);
  if (!car || !Armies.atHome(car, cap)) return;
  const st2 = await stateOf(S, cap);
  const free = st2 && pickArmy(bot, st2, MIN_TRADE, { offer: true });
  if (!free) { bump(m, 'offerNoCaravan'); return; }
  const plan = postPlan(S, cap, free.capacity, offers);
  if (!plan) { bump(m, 'nothingToOffer'); return; }
  if (B.left <= 0) return;
  B.left--;
  const p = await bot.post('/api/market/offer', { ...plan, cityId: cap.id, armyId: free.id });
  if (p.ok && p.data?.offer) {
    m.off.push({ i: p.data.offer.id, c: cap.id, s: ctx.step, r: plan.sellResource, n: plan.sellAmount });
    cap[plan.sellResource] -= plan.sellAmount;
    markUsed(st2, free.id);
    car.status = 'MARKET'; car.missionType = 'MARKET_OFFER';
    if (p.data.taxPct !== undefined) m.taxPct = p.data.taxPct;
    bump(m, 'posted'); bump(m, `posted_${plan.sellResource}`);
  } else bump(m, 'postRefused');
}

// ---------- marchand du serveur : une ressource déborde (production perdue), une autre manque ----------
// le joueur préfère un échange entre joueurs ; le marchand du serveur (30 % − 1 %/niveau du Marché de la capitale, sans
// armée, dans n'importe quelle ville) sert quand une offre pour cette ressource n'a pas trouvé preneur ou que la caravane
// est occupée
async function npc(S, markets) {
  const { bot, ctx, B, m } = S;
  const tax = fx.npcMarketTaxPct(lvl(bot.capital, 'MARKET'));
  const car = caravanOf(bot);
  const caravanFree = !!car && Armies.atHome(car, bot.capital);
  for (const city of markets) {
    if (B.left <= 0) break;
    if ((m.nx.n?.[city.id] || 0) > ctx.step) continue;
    const over = RES.filter(r => ratio(city, r) >= 0.97 && (r !== 'food' || foodOk(bot))).sort((a, b) => ratio(city, b) - ratio(city, a))[0];
    if (!over) continue;
    // des céréales seulement quand tout le joueur en manque (le grenier de la capitale est bas à cause de l'entretien)
    const cands = RES.filter(r => r !== over && ratio(city, r) <= 0.6 && ratio(city, over) - ratio(city, r) >= 0.35).sort((a, b) => ratio(city, a) - ratio(city, b));
    const lack = cands.find(r => r !== 'food' || foodShort(bot));
    if (cands[0] === 'food' && lack !== 'food') bump(m, 'npcFoodSkipped');
    if (!lack) continue;
    const waiting = city.isCapital && (m.off.some(t => t.c === city.id) || (caravanFree && !(m.miss > 0) && ratio(city, lack) > 0.15));
    if (waiting) { bump(m, 'npcWaitP2P'); continue; }
    const give = round10(Math.min((city[over] || 0) - 0.75 * capOf(city, over), (0.75 * capOf(city, lack) - (city[lack] || 0)) / (1 - tax / 100), 0.25 * capOf(city, over)));
    if (give < 100) continue;
    (m.nx.n ||= {})[city.id] = ctx.step + 4;
    B.left--;
    const r = await bot.post('/api/market/npc-trade', { cityId: city.id, giveResource: over, receiveResource: lack, giveAmount: give });
    if (r.ok) {
      bump(m, 'npcTrades'); bump(m, 'npcGiven', r.data?.given || give); bump(m, 'npcReceived', r.data?.received || 0); bump(m, `npc_${over}_${lack}`);
      if (lack === 'food') { bump(m, 'npcFoodTrades'); bump(m, 'npcFoodBought', r.data?.received || 0); }
      city[over] -= r.data?.given || give; city[lack] = (city[lack] || 0) + (r.data?.received || 0);
      if ((m.k.npcTrades || 0) === 1) ctx.event('market_npc', { bot: bot.name, give: `${r.data?.given} ${over}`, get: `${r.data?.received} ${lack}`, taxPct: r.data?.taxPct });
    } else bump(m, 'npcRefused');
  }
  if (m.nx.n) for (const id of Object.keys(m.nx.n)) if (!bot.cities.some(c => c.id === id)) delete m.nx.n[id];
}

// ---------- envoi à un allié (POST /api/trade/send, l'écran « Envoyer ») ----------
// un membre de son alliance proche manque de ce que la capitale a en trop : une armée libre le lui porte, puis rentre.
// Jamais vers ses propres villes (stock commun : le serveur le refuse).
async function aid(S) {
  const { bot, ctx, B, m } = S;
  const cap = bot.capital;
  const allianceId = bot.me?.alliance?.allianceId;
  if (!allianceId || B.left < 2 || (m.nx.a || 0) > ctx.step || cap.isSieged) return;
  m.nx.a = ctx.step + 8;   // tous les deux jours au plus
  const spareFood = foodOk(bot);
  const rich = RES.filter(r => ratio(cap, r) >= 0.8 && (r !== 'food' || spareFood));
  if (!rich.length) return;
  let best = null;
  for (const b of ctx.bots) {
    const fc = b.capital;
    if (b === bot || b.me?.alliance?.allianceId !== allianceId || !fc || fc.isSieged || dist(fc, cap) > 100) continue;
    for (const r of rich) {
      const need = ratio(fc, r);
      if (need > 0.35 || ratio(cap, r) - need < 0.45) continue;
      const amount = round10(Math.min((cap[r] || 0) - 0.6 * capOf(cap, r), 0.6 * capOf(fc, r) - (fc[r] || 0)));
      if (amount >= 300 && (!best || need < best.need)) best = { b, r, amount, need };
    }
  }
  if (!best) { bump(m, 'aidNothing'); return; }
  const st = await stateOf(S, cap);
  const army = st && (pickArmy(bot, st, best.amount) || tripArmies(bot, st.armies).sort((a, b) => b.capacity - a.capacity)[0]);
  if (!army || army.capacity < 300 || B.left < 1) { bump(m, 'aidNoArmy'); return; }
  const amount = round10(Math.min(best.amount, army.capacity));
  B.left--;
  const r = await bot.post('/api/trade/send', { fromCityId: cap.id, armyId: army.id, targetX: best.b.capital.x, targetY: best.b.capital.y, resources: { [best.r]: amount } });
  if (r.ok) {
    bump(m, 'aidSent'); bump(m, 'aidVolume', amount);
    cap[best.r] -= amount;
    markUsed(st, army.id);
    const mine = bot.armies.find(x => x.id === army.id);
    if (mine) { mine.status = 'TRANSPORTING'; mine.missionType = 'TRANSPORT'; }
    if ((m.k.aidSent || 0) === 1) ctx.event('market_aid', { from: bot.name, to: best.b.name, resources: { [best.r]: amount }, army: army.name });
  } else bump(m, 'aidRefused');
}

// ---------- contrôles propres au marché (lecture de la base) ----------
async function marketChecks(ctx) {
  const q = (sql, ...a) => ctx.prisma.$queryRawUnsafe(sql, ...a);
  const late = new Date(ctx.clock.now() - 13 * 3600000);
  const out = [];
  const add = async (check, sql, ...a) => { const rows = await q(sql, ...a); if (rows.length) out.push({ check, count: rows.length, sample: JSON.parse(JSON.stringify(rows.slice(0, 5), (k, v) => (typeof v === 'bigint' ? Number(v) : v))) }); };
  await add('marché : offre active expirée depuis longtemps', `SELECT id, "sellerId", "expiresAt" FROM "MarketOffer" WHERE status = 'ACTIVE' AND "expiresAt" < $1`, late);
  // une offre active réserve une armée du vendeur, qui attend en ville (statut MARKET) ; une armée MARKET a son offre active
  await add('marché : offre active sans armée qui attend', `SELECT o.id, o."sellerId", o."armyId", a.status FROM "MarketOffer" o LEFT JOIN "Army" a ON a.id = o."armyId" WHERE o.status = 'ACTIVE' AND (a.id IS NULL OR a.status <> 'MARKET')`);
  await add('marché : armée réservée (MARKET) sans offre active', `SELECT a.id, a."ownerId" FROM "Army" a WHERE a.status = 'MARKET' AND NOT EXISTS (SELECT 1 FROM "MarketOffer" o WHERE o."armyId" = a.id AND o.status = 'ACTIVE')`);
  await add('marché : livraison d\'échange ou envoi jamais arrivé', `SELECT id, "ownerId", "missionType", "arrivalAt" FROM "Army" WHERE status = 'TRANSPORTING' AND "missionType" IN ('MARKET_DELIVERY', 'TRANSPORT') AND "arrivalAt" < $1`, late);
  // stock commun (décision du 31 octobre 2026) : aucun transport vers une de ses propres villes, sauf la Ville Merveille
  await add('marché : transport vers une de ses propres villes', `SELECT a.id, a."ownerId", a."missionType" FROM "Army" a JOIN "City" c ON c.id = a."targetCityId" WHERE a.status = 'TRANSPORTING' AND a."missionType" IN ('MARKET_DELIVERY', 'TRANSPORT') AND c."playerId" = a."ownerId" AND NOT c."isWonder"`);
  await add('marché : plus d\'offres actives que permis', `SELECT "sellerId", count(*)::int AS n FROM "MarketOffer" WHERE status = 'ACTIVE' GROUP BY 1 HAVING count(*) > $1`, M.maxActiveOffers);
  await add('marché : échange conclu sans acheteur', `SELECT id FROM "MarketOffer" WHERE status = 'COMPLETED' AND ("buyerId" IS NULL OR "buyerCityId" IS NULL OR "acceptedAt" IS NULL)`);
  return out;
}

// ---------- début du tour (08-market-early.cjs, avant l'économie) : la caravane ----------
// Formée sur un emplacement de la Place de rassemblement que les autres rôles n'attendent pas (../armies.cjs), remplie des
// meilleurs porteurs de la garnison jusqu'à une charge d'environ 15 % du stockage de la capitale (2 000 à 20 000), avant
// que le module militaire ne prenne la garnison pour son armée de campagne.
const caravanTarget = (cap) => Math.max(2000, Math.min(20000, Math.round(0.15 * (cap.maxStorage || 0))));
async function early(bot, ctx) {
  if (!bot.me || !Array.isArray(bot.cities) || !Array.isArray(bot.armies)) return;
  const cap = bot.capital;
  if (!cap || cap.isSieged || !lvl(cap, 'MARKET') || !lvl(cap, 'RALLY_POINT')) return;
  const m = memOf(bot);
  let car = caravanOf(bot);
  let calls = 3;
  // un rôle d'avant (armée de campagne, gardes, convoi, Ost, garde de la Merveille) attend une place : la caravane au repos
  // se dissout, ses porteurs rentrent dans la garnison (elle se reformera quand une place se libérera)
  if (car && Armies.atHome(car, cap) && Armies.mustYield(bot, 'caravan')) {
    const r = await bot.del(`/api/army/${car.id}/disband`);
    if (r.ok) { bot.armies = bot.armies.filter(a => a.id !== car.id); bump(m, 'caravanYielded'); m.nx.c = ctx.step + 8; }
    return;
  }
  if (!car) {
    if ((m.nx.c || 0) > ctx.step || soldiers(garrisonOf(bot, cap)) < 60) return;
    const slot = Armies.freeSlot(bot, 'caravan');
    if (!slot) { m.nx.c = ctx.step + 8; bump(m, 'caravanNoSlot'); return; }
    calls--;
    const r = await bot.post('/api/army/create', { cityId: cap.id, slot, name: Armies.NAMES.caravan });
    if (!r.ok || !r.data?.army) { bump(m, 'caravanRefused'); m.nx.c = ctx.step + 8; return; }
    car = { ...r.data.army, units: [] };
    bot.armies.push(car);
    bump(m, 'caravans');
  }
  if (!Armies.atHome(car, cap)) return;
  const have = (car.units || []).reduce((t, u) => t + (u.count || 0) * carryOfUnit(u.unitKey), 0);
  let missing = caravanTarget(cap) - have;
  if (missing < 0.2 * caravanTarget(cap)) return;
  const gar = garrisonOf(bot, cap);
  const pool = (gar?.units || []).filter(u => u.count >= 8 && UNIT[u.unitKey] && !isSiege(u.unitKey)).sort((a, b) => carryOfUnit(b.unitKey) - carryOfUnit(a.unitKey) || b.count - a.count);
  for (const u of pool.slice(0, 2)) {
    if (missing <= 0 || calls <= 0) break;
    const take = Math.min(Math.floor(u.count * PORTER_SHARE), Math.ceil(missing / carryOfUnit(u.unitKey)));
    if (take < 2) continue;
    const row = (car.units ||= []).find(x => x.unitKey === u.unitKey);
    const cur = row?.count || 0;
    calls--;
    const r = await bot.post(`/api/army/${car.id}/set-unit`, { unitKey: u.unitKey, count: cur + take });
    if (!r.ok) { bump(m, 'portersRefused'); break; }
    const got = Math.max(0, (r.data?.newCount ?? cur + take) - cur);
    u.count -= got;
    if (row) row.count += got; else car.units.push({ unitKey: u.unitKey, tier: UNIT[u.unitKey].tier, count: got });
    missing -= got * carryOfUnit(u.unitKey);
    bump(m, 'porters', got);
  }
}

module.exports = {
  name: 'market',
  early,
  postPlan, offerValue, pickArmy, tripArmies,   // pour les tests unitaires (tests/unit/sim-bots.test.js)
  async act(bot, ctx) {
    if (!bot.me || !Array.isArray(bot.cities) || !bot.cities.length || !Array.isArray(bot.armies)) return;
    // le Marché de la capitale sert toutes les villes du joueur (la Ville Merveille ne fait que recevoir)
    if (!bot.capital || !lvl(bot.capital, 'MARKET')) return;
    const markets = bot.cities.filter(c => !c.isWonder);
    const m = memOf(bot);
    if (!m.k.marketDay) m.k.marketDay = ctx.clock.day();
    const S = { bot, ctx, m, B: { left: CALLS }, st: null };
    await trade(S);
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
        armiesWaiting: await num(`SELECT count(*)::int AS n FROM "Army" WHERE status = 'MARKET'`),
        armiesDelivering: await num(`SELECT count(*)::int AS n FROM "Army" WHERE status = 'TRANSPORTING' AND "missionType" = 'MARKET_DELIVERY'`),
        armiesSending: await num(`SELECT count(*)::int AS n FROM "Army" WHERE status = 'TRANSPORTING' AND "missionType" = 'TRANSPORT'`),
        caravans: await num(`SELECT count(*)::int AS n FROM "Army" WHERE name = '${Armies.NAMES.caravan}' AND NOT "isGarrison"`),
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
      fill[kind] = f;
    }
    db.fill = fill;
    const days = ctx.bots.map(b => b.mem.mkt?.k?.marketDay).filter(Boolean);
    ctx.event('market_summary', { step: ctx.step, ...db, firstMarketDay: days.length ? Math.min(...days) : null, counters: k });
    const { fill: fl, ...dbShort } = db;
    ctx.say(`marché : remplissage ${JSON.stringify(fl)}`);
    ctx.say(`marché : ${JSON.stringify({ ...dbShort, posted: k.posted || 0, accepted: k.accepted || 0, ally: k.acceptAlly || 0, borrowed: k.acceptBorrowedArmy || 0, sold: k.sold || 0, expired: k.expired || 0, cancelled: (k.cancelStale || 0) + (k.cancelChanged || 0), raced: k.acceptRaced || 0, npc: k.npcTrades || 0, npcFood: k.npcFoodBought || 0, aid: k.aidSent || 0 })}`);
  }
};
