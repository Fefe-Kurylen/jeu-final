// Simulation longue — militaire : recrutement (classes et paliers débloqués par Caserne / Écurie / Atelier, entretien
// soutenable), armées de la Place de rassemblement (création, composition, dissolution), soins des blessés, récolte des
// points de ressource et attaque de leurs tribus, colons de la Résidence et fondation de villes secondaires, rappels.
// Pas de combat entre joueurs ici (attaques, sièges, renforts, espions : module de guerre).
// Chaque joueur fait au plus CALLS_PER_TURN appels par tour et vérifie les conditions avant d'appeler (peu de refus).
// Décision du 30 octobre 2026 (§ 1 bis) : recrutement, soins, Résidence et fondation se paient sur le stock de toutes les
// villes (../stock.cjs), l'entretien sur tous les greniers ; toute unité formée ou soignée rejoint la garnison de la capitale.
// Colonies (décisions du 30 octobre 2026) : une colonie recrute avec SA Grande caserne / Grande écurie (palier lu dans leurs
// données, jamais la Caserne de la capitale), les recrues arrivent dans la capitale ; le site d'une colonie se choisit dans
// les « Sites libres » (GET /api/map/free-sites) selon le type et le niveau du gisement, le bonus qui sert le joueur d'abord.
// Revue des bâtiments (décisions du 31 octobre 2026) : une unité d'élite coûte de l'or en plus de ses ressources
// (calculations.recruitGoldFor, payé à la mise en file) ; dès qu'une ville forme l'élite, le joueur garde de l'or pour un lot
// (goldReserve) avant un soin à l'or, un espion ou un changement de talents. Dans la capitale, les Grandes casernes et
// Grandes écuries de toutes ses villes accélèrent la formation (fx.capitalTrainBoostPct).
// Rapport de vérification du 31 octobre 2026 (§ 6.9) : une armée « Garde » est postée dans chaque colonie (une colonie n'a
// pas de garnison : la garde part de la capitale et s'y tient au repos, elle défend la ville) ; le site d'une colonie vaut
// surtout par le niveau de son gisement (bonus de spécialité), la force de la tribu ne compte que rapportée à ce que
// l'armée du joueur bat ; un colon formé quand toutes les colonies sont fondées est gardé pour la Ville Merveille
// (70-wonder.cjs).
// Simulation après ces décisions (rapport sim-d, relu) : hors fondation, une seconde armée de campagne rend sa place quand
// une garde (ou un autre rôle) attend ; la garde d'une colonie rasée sert une autre colonie ou se dissout ; une garde
// affaiblie ne rentre se regarnir qu'après deux semaines et loin d'un combat ; le site d'une colonie vaut davantage par son
// gisement, et l'armée qui libère le site prend d'abord les soldats de la garnison ; le soin à l'or sert aussi les lits
// lancés pendant la visite ; les camps d'or sont attaqués ; le fondateur de la Ville Merveille garde une escorte à la
// maison quand le module de la Merveille le demande (bot.mem.wonder.holdEscort).
// Armées rattachées aux colonies (décision du 1er novembre 2026, simulation de 200 jours, E2) : la garde, arrivée au repos
// dans sa colonie, lui est rattachée (POST /api/army/:id/attach-colony) : elle prend un emplacement de la colonie, libère
// celui de la capitale, défend la colonie comme une garnison et y revient après chaque mission. Trop faible, elle est
// renvoyée à la capitale (POST /api/army/:id/detach-colony, une place libre de la capitale y est prise dès le départ) pour
// se regarnir, puis repart et se rattache. Avant : toutes les armées restaient sur les 5 emplacements de la capitale
// (16 joueurs sur 38 avaient besoin d'une armée de plus que possible).
// Simulation sim-e (200 jours après E1-E8, relue) :
// - une garde vide rattachée se dissout sur place (une armée vide ne quitte pas sa colonie) et une autre se forme ; une garde
//   trop faible n'attend plus une place libre à la capitale pour rentrer (8 061 refus) : une relève part de la capitale, se
//   rattache, puis l'ancienne rentre (la colonie n'est jamais vide) ; la relève attendue passe avant les rôles suivants ;
// - plus de plafond d'armée par niveau de Bâtiment principal (3 640 soldats pour un compte complet, atteint dès le jour 84
//   alors que les céréales en nourrissaient plus du double) : la nourriture décide, avec la même marge ;
// - le besoin d'une ressource se lit sur le stock commun (le butin y va), plus sur la seule capitale dont le grenier est
//   presque vide : un point dont la ressource est déjà à 80 % du stockage ne vaut pas la marche (0 camp d'or attaqué) ;
// - l'issue d'une attaque de tribu se lit sur l'armée (butin, même part perdue dans chaque troupe), plus sur ses seuls
//   soldats : les armées vidées par une fusion de rassemblement comptaient comme des défaites (249 fausses défaites) ;
// - le site d'une colonie peut viser un gisement de niveau 2 ou 3 un peu au-dessus de ce que l'armée bat (elle a plus de
//   temps pour libérer le camp) ; plus de seuil de 12 000 qui faisait viser des camps imbattables ;
// - pendant qu'un assaut de Bastion se prépare (mem.war.muster de l'alliance), les armées de la capitale ne partent plus
//   en mission et celles qui récoltent ou marchent vers un camp rentrent.
// Décisions du 2 novembre 2026 (deuxième simulation de 200 jours) :
// - G10, seules les armées défendent une ville : la réserve (la garnison, soldats formés mais dans aucune armée) ne combat
//   plus. Le quart des soldats que le joueur laissait dans la garnison passe dans une armée « Défense » qui reste au repos
//   dans la capitale (defense() ; ../armies.cjs : rôle defense, que les autres modules ne font jamais partir) ; une colonie
//   est défendue par sa garde rattachée (E2) ;
// - G9, échange de soldats entre deux armées au même endroit (POST /api/army/:id/exchange) : une garde rattachée affaiblie
//   n'est plus remplacée par une nouvelle garde (relève, puis l'ancienne qui rentre) ; une armée de la capitale lui apporte
//   ce qui manque et lui donne tous ses soldats sur place, puis, vidée hors de chez elle, le serveur la pose aussitôt dans la
//   capitale, où elle est dissoute. La garde ne quitte plus sa colonie ; la relève d'avant reste pour un serveur sans
//   échange ;
// - G3, tous les combats au moteur de bataille : contre une tribu, le vaincu peut perdre une troupe entière (rounds
//   complets), ce n'est plus le signe qu'un autre module a pris ses soldats (tribeVerdict).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { unitsData, buildingsData } = require(path.join(ROOT, 'src/config/gamedata'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const { baseTrainSecondsFor, recruitGoldFor } = require(path.join(ROOT, 'src/utils/calculations'));
const Stock = require('../stock.cjs');
const Armies = require('../armies.cjs');   // emplacements de la Place de rassemblement partagés entre les modules
const Terrain = require(path.join(ROOT, 'frontend/js/shared/terrain.js'));   // le terrain que le client dessine (même graine)

const RES = ['wood', 'stone', 'iron', 'food'];
const TIER_MULT = config.combat.tierCoefficients;
const UPKEEP = config.army.upkeepPerTier;
const MAX_QUEUE = config.build.maxRunning + config.build.maxQueued;
const FOUND_COST = config.city.foundationTransport;
const MAX_BATCHES = config.recruit.maxBatchesPerBuilding;
// bâtiment qui forme chaque classe, comme le serveur (routes/cities.js recruitBlocker) : dans la capitale (et ligne de la
// file de recrutement, la même dans une colonie), puis dans une colonie ; pas d'engins hors de la capitale
const RECRUIT_BUILDING = { INFANTRY: 'BARRACKS', ARCHER: 'BARRACKS', CAVALRY: 'STABLE', SIEGE: 'WORKSHOP' };
const COLONY_RECRUIT_BUILDING = { INFANTRY: 'GREAT_BARRACKS', ARCHER: 'GREAT_BARRACKS', CAVALRY: 'GREAT_STABLE' };
const TIER_UNLOCK = { base: 'unlockBaseTier', intermediate: 'unlockIntermediateTier', elite: 'unlockEliteTier' };
const HARVEST_TYPES = ['WOOD', 'STONE', 'IRON', 'FOOD', 'GOLD'];
const RES_OF = fx.NODE_RESOURCE;   // { WOOD: 'wood', … } : la ressource d'un point (et d'un gisement de colonie)
const SCAN_RADIUS = 22;          // points de ressource regardés autour de la ville (la carte du client)
const RAID_RANGE = 20;           // une armée ne part pas plus loin
const FREE_SITES = 40;           // sites libres demandés pour choisir une colonie (les plus proches de la capitale)
// choix du site, en cases de marche : un point de bonus de gisement voulu vaut 1,5 case (niveau 3 contre niveau 1, +20 points :
// 30 cases de plus) ; une tribu coûte 22 cases × (sa force / ce que l'armée bat)³ : presque rien jusqu'à la moitié de ce que
// l'armée bat, 22 cases au plus fort. Simulation du 31 octobre 2026 (rapport sim-d) : avec 0,6 case par point et 15 cases
// pour une tribu (rapport linéaire), 72 colonies sur 77 étaient sur un gisement de niveau 1 ; rejoué sur les mêmes sites,
// ces poids donnent 38 / 30 / 9 colonies de niveau 1 / 2 / 3
const SITE_BONUS = 1.5;
const SITE_TRIBE = 22;
const SITE_TRIBE_EXP = 3;
const CLEAR_STEPS = 12;          // pas (3 jours) avant d'abandonner un site dont la tribu reste trop forte (40 avant : 10 jours)
// un gisement de niveau 2 ou 3 peut être visé jusqu'à 1,5 fois ce que l'armée bat aujourd'hui : elle a alors 7 jours pour
// grandir avant que le site ne soit abandonné (simulation sim-e : 34 secondes colonies sur 38 au niveau 1, comme sim-d, car
// tout site au-dessus de la portée était écarté)
const SITE_UPPER_REACH = 1.5;
const CLEAR_STEPS_UPPER = 28;
const CLEAR_SHARE = 0.75;        // part de la garnison que l'armée qui libère le site emporte (fill)
const GUARD_SHARE = 0.15;        // garde d'une colonie : 15 % des soldats du joueur (40 au moins)
const GUARD_MIN = 40;
// garde rattachée sous la moitié de la part voulue : une relève part de la capitale (simulation sim-e : les raids qui ont
// trouvé 50 à 299 défendeurs ont tous été perdus par la colonie ; une garde à la part voulue, derrière le Mur, tient le plus
// souvent) ; seulement quand la relève emporterait au moins le double, sinon l'échange ne gagnerait rien
const GUARD_RELIEF_SHARE = 0.5;
// avec l'échange (G9) : une garde sous 70 % de sa part reçoit ce qui lui manque, apporté par une armée de la capitale qui lui
// donne ses soldats sur place (au moins 20 soldats et 20 % de la part, sinon le voyage ne vaut pas la place prise à la
// capitale pendant la marche) ; décision du 2 novembre 2026 (deuxième simulation de 200 jours)
const GUARD_TOPUP_SHARE = 0.7;
const GUARD_TOPUP_MIN = 20;
const GUARD_TOPUP_PART = 0.2;
// armée « Défense » de la capitale (G10, décision du 2 novembre 2026 (deuxième simulation de 200 jours)) : 25 % des soldats
// du joueur (40 au moins), la part que la garnison gardait et qui défendait la ville avant ; regarnie dans la réserve quand
// il lui manque au moins 15 % de sa part (10 soldats au moins), pour ne pas user les appels du tour
const DEFENSE_SHARE = 0.25;
const DEFENSE_MIN = 40;
const DEFENSE_TOPUP = 0.15;
const GOLD_VALUE = 50;           // un camp d'or : une pièce vaut 50 ressources (une unité d'élite : 2 or pour environ 100 ressources)
const CALLS_PER_TURN = 8;        // lectures comprises
const ELITE_GOLD_UNITS = 100;    // or gardé pour un lot de 100 unités d'élite (quand une ville forme l'élite)
const HOLD_STEPS = 8;            // une récolte est rappelée après 2 jours (la récolte du jeu ne suit pas le pas de 6 h)
// Taille de l'armée : celle que les céréales nourrissent, comme dans le jeu (seul l'entretien limite une armée). Le joueur
// garde FOOD_KEEP de sa production pour grandir (une colonie perdue ne le met pas en famine) et des greniers à moitié pleins
// d'un tick à l'autre ; l'or et le temps de formation limitent aussi chaque lot. Simulation sim-e : le plafond de 40 + 60
// soldats par niveau de Bâtiment principal (3 640 pour un compte complet) arrêtait tout recrutement dès le jour 84, alors
// que les céréales en nourrissaient environ 8 400 avec cette marge.
const FOOD_KEEP = 0.3;
// besoin d'une ressource : un point dont la ressource remplit déjà NEED_FULL du stockage commun ne vaut pas la marche
const NEED_FULL = 0.8;
const DOCTRINE = {               // part de chaque classe dans l'armée, selon la civilisation
  ROME: { INFANTRY: 0.55, ARCHER: 0.25, CAVALRY: 0.2 }, GREEK: { INFANTRY: 0.5, ARCHER: 0.3, CAVALRY: 0.2 },
  GAUL: { INFANTRY: 0.4, ARCHER: 0.25, CAVALRY: 0.35 }, EGYPT: { INFANTRY: 0.35, ARCHER: 0.4, CAVALRY: 0.25 },
  HUN: { INFANTRY: 0.2, ARCHER: 0.3, CAVALRY: 0.5 }, SULTAN: { INFANTRY: 0.25, ARCHER: 0.3, CAVALRY: 0.45 }
};
const TIERS = ['base', 'intermediate', 'elite'];

const UNIT = Object.fromEntries(unitsData.map(u => [u.key, u]));
const def = (k) => buildingsData.find(b => b.key === k);
const effect = (k, e, d) => def(k)?.effects?.[e] ?? d;
const lvl = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const queuedLvl = (city, key) => (city?.buildQueue || []).filter(q => q.buildingKey === key).reduce((m, q) => Math.max(m, q.targetLevel || 0), 0);
const unitPower = (key) => { const u = UNIT[key]; return u ? ((u.stats?.attack || 0) + (u.stats?.defense || 0)) * (TIER_MULT[u.tier] || 1) : 0; };
const powerOf = (units) => (units || []).reduce((t, u) => t + unitPower(u.unitKey) * u.count, 0);
const countOf = (units) => (units || []).reduce((t, u) => t + (u.count || 0), 0);
const carryOf = (units) => (units || []).reduce((t, u) => t + (UNIT[u.unitKey]?.stats?.transport || 50) * u.count, 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const isHome = (a, city) => !!city && a.x === city.x && a.y === city.y;
const onOwnWonder = (bot, a) => (bot.cities || []).some(c => c.isWonder && c.x === a.x && c.y === a.y);   // posté dans sa Ville Merveille contre les vagues (70-wonder.cjs) : il y reste
const stepHours = (ctx) => Math.max(1, Number(ctx.OPT?.stepHours) || 1);   // l'entretien retiré d'un coup à chaque tick

// ---------- ce que le joueur voit de la carte autour d'une ville (GET /api/map/viewport), gardé quelques pas ----------
const VIEW = new Map();   // cityId -> { step, nodes, cities, bastions }
async function scan(bot, ctx, B, city, maxAge = 3) {
  const v = VIEW.get(city.id);
  if (v && ctx.step - v.step <= maxAge) return v;
  if (B.left <= 0) return v || null;
  B.left--;
  const r = await bot.get(`/api/map/viewport?x=${city.x}&y=${city.y}&radius=${SCAN_RADIUS}`);
  if (!r.ok || !r.data) return v || null;
  const nv = { step: ctx.step, nodes: r.data.resourceNodes || [], cities: r.data.cities || [], bastions: r.data.bastions || [] };
  VIEW.set(city.id, nv);
  return nv;
}
const tribeOn = (n) => !!n.hasDefenders && (n.defenderPower || 0) > 0;
const someoneOn = (n) => !!n.hasPlayerArmy || (n.holders || []).length > 0 || (n.hiddenHolders || 0) > 0;

// ---------- état du joueur (mem : identifiants et compteurs seulement) ----------
function memOf(bot) {
  const m = (bot.mem.mil ||= {});
  m.own ||= [];        // armées de ce module
  m.h ||= {};          // armée -> pas où sa récolte a commencé
  m.m ||= {};          // armée -> mission en cours { n: point, s: pas, u: soldats au départ, t: 'r'|'c', d: jugée }
  m.k ||= {};          // compteurs
  m.ratio ||= 1.6;     // puissance demandée face à une tribu (apprise : monte après une défaite)
  return m;
}
const bump = (m, k, n = 1) => { m.k[k] = (m.k[k] || 0) + n; };
const garrisonOf = (bot, city) => bot.armies.find(a => a.isGarrison && a.cityId === city.id) || null;
const cityOf = (bot, id) => bot.cities.find(c => c.id === id) || null;
// le fondateur de la Ville Merveille garde une escorte à la maison (drapeau du module de la Merveille, 70-wonder.cjs) ; les
// armées qui ne l'escortent jamais (elles ont leur rôle)
const holdsWonderEscort = (bot) => bot.mem?.wonder?.holdEscort === true;
const ESCORT_NEVER = new Set([Armies.NAMES.guard, Armies.NAMES.wonder, Armies.NAMES.convoy, Armies.NAMES.defense]);

// ---------- recrutement ----------
// unités que la ville peut former, comme le serveur : le palier se lit sur le bâtiment de LA ville qui forme (Caserne,
// Écurie ou Atelier de la capitale ; Grande caserne ou Grande écurie d'une colonie), les engins sur l'Atelier
function unlockedUnits(city, faction) {
  const trainer = city.isCapital ? RECRUIT_BUILDING : COLONY_RECRUIT_BUILDING;
  return unitsData.filter(u => {
    const key = u.faction === faction && trainer[u.class];
    if (!key) return false;
    const need = u.class === 'SIEGE' ? config.recruit.siegeWorkshopLevel : effect(key, TIER_UNLOCK[u.tier], 1);
    return lvl(city, key) >= need;
  });
}

// or que le joueur garde pour l'élite (le prix d'un lot de ELITE_GOLD_UNITS unités) quand une de ses villes la forme ; les
// autres modules dépensent l'or au-dessus (soin à l'or, espions, talents du héros)
const goldReserve = (bot) => ((bot.cities || []).some(c => unlockedUnits(c, bot.faction).some(u => u.tier === 'elite')) ? recruitGoldFor({ tier: 'elite' }, ELITE_GOLD_UNITS) : 0);
const spareGold = (bot) => Math.max(0, (bot.me?.gold || 0) - goldReserve(bot));

// soldats de chaque classe : armées du joueur et files de recrutement
function classCounts(bot) {
  const by = { INFANTRY: 0, ARCHER: 0, CAVALRY: 0, SIEGE: 0 };
  for (const a of bot.armies) for (const u of a.units || []) { const c = UNIT[u.unitKey]?.class; if (c) by[c] += u.count; }
  for (const c of bot.cities) for (const q of c.recruitQueue || []) { const k = UNIT[q.unitKey]?.class; if (k) by[k] += q.count; }
  return by;
}

// réserve du joueur pour une fondation (colon prêt ou en formation dans la capitale) : elle se paie sur toutes ses villes
function colonyReserve(bot) {
  const cap = bot.capital;
  const training = (cap?.recruitQueue || []).some(q => q.unitKey === 'SETTLER');
  if (!cap || !(cap.settlers > 0 || training)) return {};
  return Object.fromEntries(RES.map(r => [r, FOUND_COST[r] + 300]));
}

async function recruit(bot, ctx, B, m, city) {
  if (B.left <= 0 || city.isSieged) return;
  // l'entretien puise dans tous les greniers du joueur : c'est son bilan qui compte, pas celui de la ville
  const fb = Stock.foodBalance(bot);
  if (!fb || !(fb.net > 0)) { if (fb && fb.net < 0) bump(m, 'foodStop'); return; }
  const units = unlockedUnits(city, bot.faction);
  if (!units.length) return;
  const counts = classCounts(bot);
  const red = Math.min(50, city.foodBalance?.reductionPct || 0) / 100;   // bâtiments de la capitale et recherche : le même partout
  // l'entretien des lots en file (toutes les villes) n'est pas encore dans le bilan : il compte déjà
  const queuedUpkeep = bot.cities.reduce((t, c) => t + (c.recruitQueue || []).reduce((u, q) => u + (UNIT[q.unitKey] ? q.count * (UPKEEP[UNIT[q.unitKey].tier] || 5) * (1 - red) : 0), 0), 0);
  // garder 30 % de la production pour grandir, et des greniers au moins à moitié pleins d'un tick à l'autre : le tick ajoute
  // la production plafonnée aux greniers puis retire tout l'entretien du pas (avec des pas de 6 h, un entretien de 6 h proche
  // des greniers les vide à chaque tick, même avec un bilan positif)
  const stock = Stock.totals(bot);
  const granary = Math.max(0, 0.5 * stock.maxFoodStorage / stepHours(ctx) - (fb.consumption || 0) - queuedUpkeep);
  const headroom = Math.min(fb.net - queuedUpkeep - Math.max(20, FOOD_KEEP * (fb.production || 0)), granary);
  if (headroom <= 0) { bump(m, 'foodCap'); return; }

  // la classe la plus en retard sur la doctrine (engins à part : quelques-uns pour le module de guerre)
  const doctrine = DOCTRINE[bot.faction] || DOCTRINE.ROME;
  // l'or du joueur paie l'élite : un palier dont il ne peut pas payer 5 unités attend (le palier en dessous passe)
  const gold = bot.me?.gold || 0;
  const payable = (u) => recruitGoldFor(u, 5) <= gold;
  if (units.some(u => !payable(u))) bump(m, 'eliteWaitGold');
  const fighters = units.filter(u => u.class !== 'SIEGE' && payable(u));
  const classes = [...new Set(fighters.map(u => u.class))];
  const sumF = counts.INFANTRY + counts.ARCHER + counts.CAVALRY;
  let unit = null;
  const siege = units.filter(u => u.class === 'SIEGE');
  if (siege.length && counts.SIEGE < Math.min(8, 2 + Math.floor(lvl(city, 'WORKSHOP') / 4)) && ctx.rand() < 0.3) unit = siege[0];
  if (!unit && classes.length) {
    const norm = classes.reduce((t, c) => t + (doctrine[c] || 0.2), 0);
    const cls = classes.sort((a, b) => ((doctrine[b] || 0.2) / norm - counts[b] / Math.max(1, sumF)) - ((doctrine[a] || 0.2) / norm - counts[a] / Math.max(1, sumF)))[0];
    const ofClass = fighters.filter(u => u.class === cls).sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier));
    // le meilleur palier débloqué, parfois un palier en dessous (plus de soldats pour le même prix)
    unit = ofClass.length > 1 && ctx.rand() < 0.25 ? ofClass[1] : ofClass[0];
  }
  if (!unit) return;
  const bKey = RECRUIT_BUILDING[unit.class];
  const queue = (city.recruitQueue || []).filter(q => q.buildingKey === bKey);
  if (queue.length >= Math.min(MAX_BATCHES, 2)) return;   // deux lots d'avance au plus
  // ressources (toutes les villes) : une part de ce qui reste après les constructions (plus quand les dépôts débordent),
  // réserve de fondation à part
  const reserve = colonyReserve(bot);
  const share = (r) => (stock[r] > 0.85 * (r === 'food' ? stock.maxFoodStorage : stock.maxStorage) ? 0.6 : 0.35);
  const one = Stock.recruitCost(unit, 1);
  const byRes = Math.min(...RES.map(r => (one[r] > 0 ? Math.floor(Math.max(0, stock[r] - (reserve[r] || 0)) * share(r) / one[r]) : Infinity)));
  const byFood = Math.floor(headroom / ((UPKEEP[unit.tier] || 5) * (1 - red)));
  const goldPer = recruitGoldFor(unit, 1);
  const byGold = goldPer > 0 ? Math.floor(gold / goldPer) : Infinity;
  // temps : le lot finit dans les 18 h (les lots d'un bâtiment passent l'un après l'autre) ; celui du bâtiment de la ville
  // qui forme (Grande caserne d'une colonie comprise), même si les unités rejoignent la capitale ; dans la capitale, avec
  // les Grandes casernes / Grandes écuries de toutes les villes du joueur (comme routes/cities.js)
  const boost = city.isCapital ? fx.capitalTrainBoostPct(bot.cities, unit.class) : 0;
  const perUnit = Math.max(1, baseTrainSecondsFor(unit) * (1 - fx.trainTimeReductionPct(city.buildings, unit.class, boost) / 100));
  const queueEnd = queue.reduce((t, q) => Math.max(t, new Date(q.endsAt).getTime()), ctx.clock.now());
  const byTime = Math.floor((18 * 3600000 - (queueEnd - ctx.clock.now())) / 1000 / perUnit);
  const n = Math.min(byRes, byFood, byGold, byTime, unit.class === 'SIEGE' ? 2 : 300);
  if (!(n >= (unit.class === 'SIEGE' ? 1 : 5))) { bump(m, n === byFood ? 'foodCap' : 'recruitWait'); return; }
  B.left--;
  const r = await bot.post(`/api/cities/${city.id}/recruit`, { unitKey: unit.key, count: n });
  if (!r.ok) { bump(m, 'recruitRefused'); return; }
  Stock.spend(bot, city, r.data?.cost || Stock.recruitCost(unit, n));
  const paidGold = r.data?.gold ?? recruitGoldFor(unit, n);
  if (bot.me) bot.me.gold = gold - paidGold;
  if (paidGold) bump(m, 'eliteGold', paidGold);
  (city.recruitQueue ||= []).push(r.data?.queueItem || { unitKey: unit.key, count: n, buildingKey: bKey, endsAt: new Date(queueEnd + n * perUnit * 1000).toISOString() });
  bump(m, 'recruited', n); bump(m, 'batches'); bump(m, `t_${unit.tier}`, n); bump(m, `c_${unit.class}`, n);
}

// ---------- blessés : soin payant à la Tente de soins de la capitale (stock de toutes les villes), soin à l'or ----------
// GET /wounded rend les blessés de toutes les villes du joueur (chaque ligne dit sa ville) ; `healable` : ce que les lits
// libres et le stock paient. Les soignés rejoignent la garnison de la capitale.
async function heal(bot, ctx, B, m, cap) {
  if (B.left < 2 || !lvl(cap, 'HEALING_TENT') || cap.isSieged) return;
  const due = m.wc === undefined || ctx.step >= m.wc || m.hurt;
  if (!due) return;
  m.wc = ctx.step + 12; m.hurt = 0;
  B.left--;
  const r = await bot.get(`/api/cities/${cap.id}/wounded`);
  if (!r.ok || !Array.isArray(r.data)) return;
  const inBed = r.data.filter(w => w.count > 0).reduce((t, w) => t + w.count, 0);
  const waiting = r.data.reduce((t, w) => t + (w.waiting || 0), 0);
  if (inBed + waiting > 0) bump(m, 'woundedSeen', inBed + waiting);
  if (waiting > 0) m.wc = ctx.step + 2;   // des lits se libèrent : revenir bientôt
  // 1. lancer le soin de ceux qui attendent, les plus nombreux d'abord, sans toucher la réserve d'une fondation
  const reserve = colonyReserve(bot);
  const beds = r.data.map(w => ({ ...w }));   // les lits après ce tour : ceux lancés à l'instant s'ajoutent à la ligne
  for (const w of beds.filter(x => x.waiting > 0 && x.healable > 0 && x.healCost).sort((a, b) => b.waiting - a.waiting).slice(0, 2)) {
    if (B.left <= 1) break;
    if (!Stock.canPay(bot, w.healCost, { reserve })) { bump(m, 'healWaitRes'); continue; }
    B.left--;
    const h = await bot.post(`/api/cities/${w.cityId}/wounded/start`, { unitKey: w.unitKey, count: w.healable });
    if (!h.ok) { bump(m, 'healStartRefused'); break; }
    Stock.spend(bot, cap, h.data?.cost || w.healCost);   // payé dans la capitale d'abord (la tente y est)
    const started = h.data?.started || w.healable;
    bump(m, 'healStarted', started);
    // le soin à l'or prend toute la ligne au lit (services/woundedService.js healNow) : son prix compte les nouveaux
    w.count = (w.count || 0) + started; w.waiting -= started;
    w.instantGold = w.count * (config.wounded.instantHealGoldPerTier[UNIT[w.unitKey]?.tier] ?? config.wounded.instantHealGoldPerTier.base);
  }
  // 2. soin à l'or des blessés au lit (ceux lancés à l'instant compris : la visite suivante ne vient que dans 12 h à 3 jours,
  // leur soin serait fini), avec l'or au-dessus de la réserve de l'élite ; une ligne trop chère n'empêche pas la suivante.
  // Simulation du 31 octobre 2026 : 0 soin à l'or, les lits lus au début de la visite étaient déjà vides
  let gold = bot.me?.gold || 0;
  const keep = 30 + goldReserve(bot);   // garder un peu d'or, et de quoi payer un lot d'élite
  for (const w of beds.filter(x => x.count >= 1 && x.instantGold > 0).sort((a, b) => b.count - a.count).slice(0, 3)) {
    if (B.left <= 0) break;
    if (gold - keep < w.instantGold) { bump(m, 'healGoldWait'); continue; }
    B.left--;
    const h = await bot.post(`/api/cities/${w.cityId}/wounded/heal`, { unitKey: w.unitKey });
    if (!h.ok) { bump(m, 'healRefused'); continue; }
    gold -= h.data?.goldSpent || w.instantGold;
    if (bot.me) bot.me.gold = gold;
    bump(m, 'healed', h.data?.healed || w.count); bump(m, 'healGold', h.data?.goldSpent || w.instantGold);
  }
}

// ---------- armées de la Place de rassemblement ----------
async function organise(bot, ctx, B, m, city, wantArmies) {
  if (B.left <= 0 || !lvl(city, 'RALLY_POINT')) return;
  const maxArmies = fx.maxArmies(city.buildings);
  const mine = bot.armies.filter(a => m.own.includes(a.id) && a.cityId === city.id);
  const garrison = garrisonOf(bot, city);
  const gCount = countOf((garrison?.units || []).filter(u => UNIT[u.unitKey]?.class !== 'SIEGE'));
  const want = Math.min(maxArmies, wantArmies);
  if (mine.length < want && gCount >= (mine.length ? 15 : 25)) {
    const used = new Set(bot.armies.filter(a => !a.isGarrison && a.cityId === city.id).map(a => a.slot));
    let slot = null;
    for (let s = 1; s <= maxArmies; s++) if (!used.has(s)) { slot = s; break; }
    if (slot) {
      B.left--;
      const r = await bot.post('/api/army/create', { cityId: city.id, slot });
      if (r.ok && r.data?.army) { m.own.push(r.data.army.id); bot.armies.push({ ...r.data.army, units: [], power: 0 }); bump(m, 'armiesCreated'); }
      else bump(m, 'createRefused');
    }
  }
}

// les troupes de la garnison qu'une armée prend (fill) : les trois plus nombreuses, sans les engins
const fillRows = (garrison) => (garrison?.units || []).filter(u => UNIT[u.unitKey] && UNIT[u.unitKey].class !== 'SIEGE' && u.count >= 5).sort((a, b) => b.count - a.count).slice(0, 3);
// garnison -> armée : 70 % de chaque troupe (les engins restent), les trois plus nombreuses
async function fill(bot, ctx, B, m, army, city, share = 0.7) {
  const garrison = garrisonOf(bot, city);
  if (!garrison) return;
  const rows = fillRows(garrison);
  for (const g of rows) {
    if (B.left <= 1) break;
    const take = Math.floor(g.count * share);
    if (take < 5) continue;
    B.left--;
    const row = (army.units ||= []).find(u => u.unitKey === g.unitKey);
    // comme le client : un nombre total (set-unit) pour la troupe principale, un ajout (adjust-unit) pour les autres
    const r = g === rows[0]
      ? await bot.post(`/api/army/${army.id}/set-unit`, { unitKey: g.unitKey, count: (row?.count || 0) + take })
      : await bot.post(`/api/army/${army.id}/adjust-unit`, { unitKey: g.unitKey, delta: take });
    if (!r.ok) { bump(m, 'fillRefused'); break; }
    g.count -= take;
    if (row) row.count += take; else army.units.push({ unitKey: g.unitKey, tier: UNIT[g.unitKey].tier, count: take });
    bump(m, 'moved', take);
  }
}

// ---------- missions sur les points de ressource ----------
// Ce que vaut la ressource d'un point pour le joueur : le butin rentre dans le stock commun de toutes ses villes
// (creditPlayer), c'est son remplissage qui compte, la plus manquante d'abord ; déjà à NEED_FULL du stockage, rien (le
// butin serait perdu). Simulation sim-e : le grenier presque vide de la seule capitale (chaque ville paie d'abord
// l'entretien de ses troupes, presque toutes dans la capitale) envoyait toutes les armées sur les camps de céréales, alors
// que le stock commun était plein à 88 % ; 0 camp d'or attaqué sur 780. L'or vaut toujours (il n'a pas de plafond).
function needWeight(bot, city, type) {
  if (type === 'GOLD') return 1.3;
  const r = RES_OF[type];
  const all = Stock.pool(bot, city);
  const fill = Math.min(1, (all[r] || 0) / Math.max(1, r === 'food' ? all.maxFoodStorage : all.maxStorage));
  return fill >= NEED_FULL ? 0 : 1.6 - fill;
}
function bestTarget(bot, m, army, city, view, exclude) {
  const power = powerOf(army.units);
  const carry = carryOf(army.units);
  const ally = bot.me?.alliance?.allianceId || null;
  let best = null;
  for (const n of view.nodes) {
    if (!HARVEST_TYPES.includes(n.resourceType) || n.cityId || exclude.has(n.id)) continue;
    const d = dist(n, city);
    const gold = n.resourceType === 'GOLD';
    // un point presque vide ne vaut pas la marche ; un camp d'or ne tient que 10 / 20 / 30 or (config.map.goldNode)
    if (d > RAID_RANGE || d < 1 || (n.amount || 0) < (gold ? 10 : 300)) continue;
    const holders = n.holders || [];
    if ((n.hiddenHolders || 0) > 0) continue;   // tenu par un autre joueur : affaire du module de guerre
    let kind;
    if (holders.length) {
      // récolte partagée avec sa propre armée ou celles de son alliance (jamais sur une fondation)
      if (holders.some(h => h.founding || h.playerId === bot.playerId || !ally || h.allianceId !== ally)) continue;
      kind = 'c';
    } else if (tribeOn(n)) { if (power < m.ratio * n.defenderPower) continue; kind = 'r'; }
    else if (!n.hasPlayerArmy) kind = 'c';
    else continue;
    // l'or d'un camp compte au prix de ce qu'il paie (GOLD_VALUE ressources la pièce) : sans cela, 30 or ne valaient rien face
    // à des milliers de ressources et aucun camp d'or n'était attaqué (simulation du 31 octobre 2026)
    const loot = Math.min(carry, n.amount || 0) * (gold ? GOLD_VALUE : 1);
    const w = needWeight(bot, city, n.resourceType);
    if (w <= 0) continue;
    const score = loot * w * (kind === 'r' ? 1 : 1.2) / (d + 6);
    if (!best || score > best.score) best = { node: n, kind, score };
  }
  return best;
}

async function mission(bot, ctx, B, m, army, city, view, exclude) {
  const t = bestTarget(bot, m, army, city, view, exclude);
  if (!t || B.left <= 0) return false;
  B.left--;
  const route = t.kind === 'r' ? 'raid-resource' : 'collect-resource';
  const r = await bot.post(`/api/army/${army.id}/${route}`, { resourceNodeId: t.node.id });
  exclude.add(t.node.id);
  if (!r.ok) { bump(m, t.kind === 'r' ? 'raidRefused' : 'collectRefused'); t.node.hasDefenders = true; return false; }
  bump(m, t.kind === 'r' ? 'raids' : 'collects');
  const gold = t.node.resourceType === 'GOLD';
  // l'or vu dans le camp au départ (l'armée rentre souvent entre deux tours du joueur : l'or rapporté n'est pas toujours vu)
  if (gold) { bump(m, 'goldCampRaids'); bump(m, 'goldCampExpected', Math.min(carryOf(army.units), t.node.amount || 0)); }
  // les troupes au départ (attaque d'une tribu) : review() lit l'issue sur ce qui en reste
  const r0 = t.kind === 'r' ? Object.fromEntries((army.units || []).filter(u => u.count > 0).map(u => [u.unitKey, u.count])) : null;
  m.m[army.id] = { n: t.node.id, s: ctx.step, u: countOf(army.units), t: t.kind, ...(r0 ? { r: r0 } : {}), ...(gold ? { g: 1 } : {}) };
  t.node.hasPlayerArmy = true;
  army.status = r.data?.status || 'MOVING';
  return true;
}

// Issue d'une attaque de tribu, lue sur l'armée comme le joueur la voit : le gagnant récolte (HARVESTING) ou rentre chargé ;
// le perdant rentre sans butin. Moteur de bataille, rounds complets (G3) : les pertes viennent des rounds, type par type, et
// le vaincu peut perdre une troupe entière. Une troupe grossie depuis le départ, une troupe nouvelle, ou toutes vidées : un
// autre module a pris ou ajouté des soldats (fusion avant un rassemblement, 60-invasion.cjs et 70-wonder.cjs) : pas de
// verdict. 'win', 'loss' ou null.
const LOSS_SEEN = 1 - config.combat.loserLossRate / 2;   // moins de 85 % des soldats au retour : une défaite
function tribeVerdict(a, x, city) {
  if (a.status === 'HARVESTING') return 'win';
  const home = a.status === 'IDLE' && isHome(a, city);
  if (a.status !== 'RETURNING' && !home) return null;
  if (!x.r) return null;   // mission d'une version d'avant : on ne sait plus
  const now = Object.fromEntries((a.units || []).filter(u => u.count > 0).map(u => [u.unitKey, u.count]));
  for (const [k, n] of Object.entries(x.r)) if ((now[k] || 0) > n) return null;
  if (Object.keys(now).some(k => !(k in x.r))) return null;
  if (!Object.keys(now).length && countOf(Object.entries(x.r).map(([, count]) => ({ count }))) >= 4) return null;   // vidée : fondue ailleurs
  const left = countOf(a.units) / Math.max(1, x.u);
  if (a.status === 'RETURNING') {
    const load = (a.carryWood || 0) + (a.carryStone || 0) + (a.carryIron || 0) + (a.carryFood || 0) + (a.carryGold || 0);
    if (load > 0) return 'win';
    return left < LOSS_SEEN ? 'loss' : null;   // ni butin ni pertes : pas de combat (une colonie fondée sur le point, un point vidé)
  }
  return left >= LOSS_SEEN ? 'win' : 'loss';   // rentrée : le butin est déjà au stock, la part des soldats perdus décide
}
// issue des attaques de tribus (la puissance demandée s'ajuste) et suivi des récoltes
const MISSION_STATUSES = new Set(['MOVING', 'RAIDING', 'HARVESTING', 'RETURNING', 'IDLE']);
function review(bot, ctx, m) {
  for (const [id, x] of Object.entries(m.m)) {
    const a = bot.armies.find(y => y.id === id);
    if (!a) { delete m.m[id]; continue; }
    // partie ailleurs (rassemblement, renfort, Bastion, expédition) : un autre module l'a prise, pas de verdict
    if (!MISSION_STATUSES.has(a.status)) { delete m.m[id]; continue; }
    const city = cityOf(bot, a.cityId);
    // l'or rapporté d'un camp d'or (compté une fois, sur le chemin du retour : le point vidé, l'armée rentre seule)
    if (x.g === 1 && (a.carryGold || 0) > 0 && a.status === 'RETURNING') { bump(m, 'goldCampGold', a.carryGold); x.g = 2; }
    if (x.t === 'r' && !x.d) {
      const verdict = tribeVerdict(a, x, city);
      if (verdict === 'win') { x.d = 1; bump(m, 'tribeWins'); m.ratio = Math.max(1.1, m.ratio - 0.05); }
      else if (verdict === 'loss') { x.d = 1; bump(m, 'tribeLosses'); m.ratio = Math.min(3.5, m.ratio + 0.3); }
      else if (a.status === 'RETURNING' || a.status === 'IDLE') { x.d = 1; bump(m, 'tribeUnjudged'); }
      if (x.d && countOf(a.units) < x.u) m.hurt = 1;   // des pertes : des blessés rentrent avec elle
    }
    if (a.status === 'IDLE' && isHome(a, city)) delete m.m[id];
  }
  for (const id of Object.keys(m.h)) { const a = bot.armies.find(y => y.id === id); if (!a || a.status !== 'HARVESTING') delete m.h[id]; }
  for (const a of bot.armies) if (m.own.includes(a.id) && a.status === 'HARVESTING' && m.h[a.id] === undefined) m.h[a.id] = ctx.step;
}

// le pas jusqu'où l'alliance garde ses armées en ville pour un assaut de Bastion ou une vague de siège (50-war.cjs :
// mem.war.muster du premier membre suivi de son groupe), comme 25-hero.cjs et 70-wonder.cjs
const musterOf = (bot, ctx) => (typeof ctx.byGroup === 'function' ? ctx.byGroup(bot.group).find(b => b.playerId)?.mem?.war?.muster || 0 : 0);
// rappels : récolte assez longue, armée arrêtée hors de sa ville ; pendant qu'un assaut de Bastion se prépare (muster), les
// armées de la capitale qui récoltent ou marchent vers un camp rentrent (simulation sim-e : la plupart des armées de
// campagne étaient en mission au départ des rassemblements, 8 % de l'armée de l'alliance y allait)
async function recalls(bot, ctx, B, m, muster = false) {
  const col = m.col;
  for (const a of bot.armies) {
    if (B.left <= 3) break;
    if (a.isGarrison || !m.own.includes(a.id)) continue;
    if (col && a.id === col.a && col.ph === 'approach') continue;   // postée à côté du camp de la future colonie
    const city = cityOf(bot, a.cityId);
    if (!city) continue;
    let why = null;
    if (a.status === 'HARVESTING') {
      const load = (a.carryWood || 0) + (a.carryStone || 0) + (a.carryIron || 0) + (a.carryFood || 0) + (a.carryGold || 0);
      if (ctx.step - (m.h[a.id] ?? ctx.step) >= HOLD_STEPS || load >= 0.95 * carryOf(a.units)) why = 'harvest';
      else if (muster && city.isCapital) why = 'muster';
    } else if (a.status === 'IDLE' && !isHome(a, city) && !a.claimedAt && !onOwnWonder(bot, a)) why = 'stray';
    else if (a.status === 'RAIDING' && muster && city.isCapital) why = 'muster';   // en route vers un camp : rappelée en chemin
    if (!why) continue;
    B.left--;
    const r = await bot.post(`/api/army/${a.id}/return`);
    if (r.ok) { a.status = 'RETURNING'; bump(m, { harvest: 'harvestRecalls', stray: 'strayRecalls', muster: 'musterRecalls' }[why]); }
    else bump(m, 'returnRefused');
  }
}

// ---------- Résidence, colons, fondation ----------
function settlerUse(bot, cap) {
  const slots = Math.min(config.city.maxSecondaryCities, fx.settlerSlots(lvl(cap, 'RESIDENCE')));
  const colonies = bot.cities.filter(c => !c.isCapital && !c.isWonder).length;   // comme la route des colons (Ville Merveille à part)
  const travelling = bot.armies.reduce((t, a) => t + (a.settlers || 0), 0);
  const training = (cap.recruitQueue || []).filter(q => q.unitKey === 'SETTLER').reduce((t, q) => t + q.count, 0);
  return { slots, used: colonies + (cap.settlers || 0) + travelling + training, colonies, training };
}

// la Résidence jusqu'au niveau du colon suivant ; avant elle, le stockage qu'il faut pour la payer (et pour les 3 000 de
// chaque ressource d'une fondation), et le Bâtiment principal qui plafonne ce stockage. Le prix se paie sur toutes les
// villes : c'est leur stockage réuni qui compte, moins l'entretien d'un pas pour la nourriture (Stock.room). Avant ce calcul,
// le grenier de la seule capitale moins 6 h d'entretien ne tenait jamais la Résidence 20 : pas de dernière colonie.
async function residence(bot, ctx, B, m, cap) {
  if (B.left <= 0) return;
  if (lvl(cap, 'MAIN_HALL') < 10) return;
  const colonies = bot.cities.filter(c => !c.isCapital && !c.isWonder).length;
  if (colonies >= config.city.maxSecondaryCities) return;
  const target = [10, 15, 20].find(l => fx.settlerSlots(l) > colonies);   // le niveau qui donne le colon suivant
  const cur = Math.max(lvl(cap, 'RESIDENCE'), queuedLvl(cap, 'RESIDENCE'));
  const wantRes = !!target && cur < target && !(cap.buildQueue || []).some(q => q.buildingKey === 'RESIDENCE');
  const pending = (cap.settlers || 0) > 0 || (cap.recruitQueue || []).some(q => q.unitKey === 'SETTLER');
  if (!wantRes && !pending) return;
  const resCost = wantRes ? Stock.buildCost('RESIDENCE', cur + 1) : null;
  const step = stepHours(ctx);
  const foodNeed = Math.max(resCost ? resCost.food : 0, pending ? FOUND_COST.food + 500 : 0);
  const otherNeed = Math.max(resCost ? Math.max(resCost.wood, resCost.stone, resCost.iron) : 0, pending ? FOUND_COST.wood + 500 : 0);
  let key = null;
  if (foodNeed > Stock.room(bot, 'food', step)) key = 'SILO';
  else if (otherNeed > Stock.room(bot, 'wood', step)) key = 'WAREHOUSE';
  else if (wantRes) key = 'RESIDENCE';
  if (!key) return;
  // la ville qui bâtit : la capitale ; un Silo ou un Dépôt déjà au niveau 20 dans la capitale monte dans une colonie
  const levelIn = (c) => Math.max(lvl(c, key), queuedLvl(c, key));
  const city = key === 'RESIDENCE' || levelIn(cap) < 20 ? cap
    : bot.cities.filter(c => !c.isCapital && !c.isWonder && levelIn(c) < Math.min(20, lvl(c, 'MAIN_HALL'))).sort((a, b) => levelIn(a) - levelIn(b))[0];
  if (!city) return;
  const queue = city.buildQueue || [];
  if (queue.length >= MAX_QUEUE) { bump(m, 'residenceQueueFull'); return; }
  if (queue.some(q => q.buildingKey === key)) return;   // déjà en chantier
  const hall = lvl(city, 'MAIN_HALL');
  let next = levelIn(city) + 1;
  if (next > hall) {
    // le bâtiment bute sur le Bâtiment principal de la capitale
    if (!city.isCapital) return;
    key = 'MAIN_HALL'; next = Math.max(hall, queuedLvl(cap, 'MAIN_HALL')) + 1;
    if (next > 30 || queue.some(q => q.buildingKey === 'MAIN_HALL')) return;
  }
  const cost = Stock.buildCost(key, next);
  if (!Stock.fits(bot, cost, step)) return;
  if (!Stock.canPay(bot, cost)) { bump(m, key === 'RESIDENCE' ? 'residenceWaitRes' : 'storageWaitRes'); return; }
  B.left--;
  const r = await bot.post(`/api/cities/${city.id}/build`, { buildingKey: key });
  if (!r.ok) { bump(m, 'residenceRefused'); return; }
  Stock.spend(bot, city, r.data?.cost || cost);
  queue.push({ buildingKey: key, targetLevel: next, slot: r.data?.queueItem?.slot ?? null });
  city.buildQueue = queue;
  bump(m, key === 'RESIDENCE' ? 'residenceLevels' : key === 'MAIN_HALL' ? 'hallForResidence' : 'storageForResidence');
}

async function settlers(bot, ctx, B, m, cap) {
  if (B.left <= 0 || cap.isSieged) return;
  const u = settlerUse(bot, cap);
  if (u.slots <= 0 || u.used >= u.slots || u.training > 0) return;
  B.left--;
  const r = await bot.post(`/api/cities/${cap.id}/settlers`);
  if (!r.ok) { bump(m, 'settlerRefused'); return; }
  (cap.recruitQueue ||= []).push({ unitKey: 'SETTLER', count: 1, buildingKey: 'RESIDENCE' });
  bump(m, 'settlers');
}

// le gisement qui servirait le plus le joueur (poids par type) : les céréales quand ses troupes mangent presque toute sa
// production (bilan de tous ses greniers), sinon la ressource la plus basse de ses villes réunies ; un type qu'il a déjà
// dans une colonie compte moins (des spécialités différentes)
function siteWish(bot) {
  const wish = { WOOD: 1, STONE: 1, IRON: 1, FOOD: 1 };
  const fb = Stock.foodBalance(bot);
  if (fb && fb.production > 0 && fb.net < 0.25 * fb.production) wish.FOOD += 1;
  const t = Stock.totals(bot);
  const low = ['WOOD', 'STONE', 'IRON'].sort((a, b) => t[RES_OF[a]] - t[RES_OF[b]])[0];
  wish[low] += 0.5;
  for (const c of bot.cities) if (wish[c.site?.type]) wish[c.site.type] -= 0.5;
  return wish;
}

// le site de la future colonie parmi les sites libres (GET /api/map/free-sites : place pour la ville, ni ville, ni armée, ni
// colon en route) : assez loin de ses villes, un camp à sa portée, puis le bonus du gisement (bonusPct, calculé par le
// serveur selon le niveau du gisement) pondéré par ce dont le joueur a besoin, contre la marche et la force de la tribu
// rapportée à ce que son armée bat (rapport de vérification du 31 octobre 2026 : 0 colonie de niveau 3 quand la force
// brute de la tribu décidait). `fieldPower` : son armée la plus forte et 75 % de la garnison de la capitale, ce que la
// phase « clear » de colony() met vraiment dans l'armée qui frappe (CLEAR_SHARE). Un gisement de niveau 2 ou 3 peut être
// visé jusqu'à SITE_UPPER_REACH fois cette portée (l'armée grandit de 40 % par semaine en milieu de partie) ; sans armée,
// seuls les sites libres de tribu (simulation sim-e : le seuil de 12 000 faisait viser des camps que l'armée ne battait pas,
// abandonnés 3 jours plus tard)
const siteReach = (s, reach) => (s.level >= 2 ? SITE_UPPER_REACH : 1) * reach;
function pickColonySite(bot, m, cap, sites, fieldPower) {
  const wish = siteWish(bot);
  const reach = fieldPower / m.ratio;   // la tribu la plus forte que l'armée du joueur bat
  let best = null;
  for (const s of sites) {
    if (!wish[s.type] || (m.bad || []).includes(s.id)) continue;
    const d = dist(s, cap);
    if (d < 5 || d > RAID_RANGE) continue;
    if (bot.cities.some(c => dist(c, s) < 6)) continue;
    const rw = siteReach(s, reach);
    if ((s.tribePower || 0) > rw) continue;   // pas un camp hors de portée
    const score = d + (s.tribePower > 0 ? SITE_TRIBE * (s.tribePower / rw) ** SITE_TRIBE_EXP : 0) - s.bonusPct * wish[s.type] * SITE_BONUS;
    if (!best || score < best.score) best = { s, score };
  }
  return best?.s || null;
}

// ---------- gardes des colonies (rapport de vérification du 31 octobre 2026) ----------
// Une colonie n'a pas de garnison : une armée « Garde » se forme dans la capitale (emplacement de la Place de rassemblement,
// juste après l'armée de campagne), prend une part des soldats de la garnison et se déplace dans la colonie, où elle se
// rattache (E2 : elle passe sur un emplacement de la colonie et rend celui de la capitale) et la défend. Une armée rattachée
// ne prend pas de troupes dans la colonie. Simulation sim-e : une garde affaiblie renvoyée se regarnir attendait une place
// libre à la capitale (8 061 refus, dont 2 397 gardes vides qui ne pouvaient pas rentrer) ; désormais :
// - une garde vide se dissout sur place et la colonie en reçoit une nouvelle ;
// - une garde sous GUARD_RELIEF_SHARE de la part voulue est relevée : une nouvelle garde se forme dans la capitale (la relève
//   attendue compte comme une garde qui manque, ../armies.cjs : la caravane ou une seconde armée de campagne lui rend sa
//   place), marche, se rattache, puis l'ancienne rentre à la capitale (la place que la relève vient de rendre l'y attend), où
//   elle se dissout. La colonie n'est jamais vide, et l'échange ne prend une place de la capitale que pendant la marche.
// Échange de soldats (décision du 2 novembre 2026 (deuxième simulation de 200 jours), G9) : une garde sous GUARD_TOPUP_SHARE
// de sa part reçoit ce qui lui manque. La relève ne porte plus qu'eux ; arrivée au repos dans la colonie, elle donne tous ses
// soldats à la garde (POST /api/army/:id/exchange) : vidée hors de chez elle, le serveur la pose aussitôt dans la capitale,
// où elle est dissoute. La garde ne quitte jamais sa colonie et garde son emplacement. Un serveur sans la route de l'échange
// (« Route non trouvee ») ou trois refus de suite : la relève d'avant (rattachement de la relève, l'ancienne garde rentre).
// Une colonie disparue (rasée) : le serveur rattache sa garde à la capitale, où elle rentre ; elle sert une autre colonie
// qui n'en a pas, sinon elle se dissout (ses soldats retournent à la garnison) : elle ne garde plus sa place pour rien.
const isGuard = (a) => !a.isGarrison && a.name === Armies.NAMES.guard;
async function guards(bot, ctx, B, m, cap) {
  m.guard ||= {};
  m.gs ||= {};    // garde -> pas de son dernier départ
  m.gr ||= {};    // colonie -> pas où sa relève a été demandée (garde trop faible)
  m.rel ||= {};   // colonie -> sa relève (armée « Garde » formée dans la capitale, en route)
  delete m.gc; delete m.gh;   // suivi des combats de l'ancienne règle (garde renvoyée se regarnir)
  const cols = Armies.colonies(bot);
  const soldiersAll = bot.armies.reduce((t, a) => t + countOf((a.units || []).filter(u => UNIT[u.unitKey]?.class !== 'SIEGE')), 0);
  const want = Math.max(GUARD_MIN, Math.round(GUARD_SHARE * soldiersAll));
  const alive = (id) => (id ? bot.armies.find(x => x.id === id) || null : null);
  const isCol = (id) => cols.some(c => c.id === id);
  const atCol = (a, col) => a.status === 'IDLE' && !a.claimedAt && a.x === col.x && a.y === col.y;
  for (const [colId, armyId] of Object.entries(m.guard)) {
    if (!alive(armyId)) { delete m.guard[colId]; delete m.gs[armyId]; continue; }
    if (!isCol(colId)) delete m.guard[colId];   // la colonie n'est plus à lui (rasée) : la garde est sans poste
  }
  for (const [colId, armyId] of Object.entries(m.rel)) if (!alive(armyId) || !isCol(colId)) delete m.rel[colId];
  for (const colId of Object.keys(m.rs || {})) if (!m.rel[colId]) delete m.rs[colId];   // ce que portait une relève disparue
  for (const c of cols) {
    // la garde a disparu pendant que sa relève marchait : la relève devient la garde
    if (!alive(m.guard[c.id]) && alive(m.rel[c.id])) { m.guard[c.id] = m.rel[c.id]; delete m.rel[c.id]; }
    if (!alive(m.guard[c.id])) delete m.gr[c.id];
  }
  for (const colId of Object.keys(m.gr)) if (!isCol(colId)) delete m.gr[colId];
  // une garde rattachée à une colonie que la mémoire ne suit pas (reprise de la simulation) : elle garde cette colonie
  for (const a of bot.armies.filter(x => isGuard(x) && isCol(x.cityId))) {
    if (Object.values(m.guard).includes(a.id) || Object.values(m.rel).includes(a.id) || alive(m.guard[a.cityId])) continue;
    m.guard[a.cityId] = a.id; bump(m, 'guardAdopted');
  }

  // dissoudre une garde (ses soldats retournent à la garnison de sa ville ; vide, elle se dissout aussi dans sa colonie)
  const disbandGuard = async (a, why) => {
    if (B.left <= 0) return false;
    B.left--;
    const r = await bot.del(`/api/army/${a.id}/disband`);
    if (!r.ok) { bump(m, 'disbandRefused'); return false; }
    bot.armies = bot.armies.filter(x => x.id !== a.id); delete m.gs[a.id];
    bump(m, why);
    return true;
  };
  // une garde rendue (relevée, ou rattachée à une colonie qui a déjà la sienne) : dissoute sur place si elle est vide, sinon
  // renvoyée à la capitale, où la boucle des gardes sans poste la dissout
  const retire = async (a) => (countOf(a.units) === 0 ? disbandGuard(a, 'guardDisbandedEmpty') : sendGuardHome(bot, B, m, a, cap));
  // des soldats de la garnison jusqu'à `target` (la part voulue ; pour une relève qui échange, ce qui manque à la garde ; les
  // trois troupes les plus nombreuses, la moitié de chacune au plus), puis en route vers la colonie avec `least` soldats au
  // moins ; true si elle est partie
  const sendOut = async (a, col, target = want, least = Math.min(GUARD_MIN, want)) => {
    if (countOf(a.units) < target) {
      const pool = countOf(fillRows(garrisonOf(bot, cap)));
      const share = Math.min(0.5, Math.max(0, (target - countOf(a.units)) / Math.max(1, pool)));
      if (share > 0.02) await fill(bot, ctx, B, m, a, cap, share);
    }
    if (countOf(a.units) < least || B.left <= 0) return false;
    B.left--;
    const r = await bot.post(`/api/army/${a.id}/move`, { x: col.x, y: col.y });
    if (!r.ok) { bump(m, 'guardMoveRefused'); return false; }
    a.status = 'MOVING'; m.gs[a.id] = ctx.step; bump(m, 'guardsPosted');
    return true;
  };
  // une nouvelle armée « Garde » dans la capitale (null sans place ou sans soldats)
  const createGuard = async () => {
    const slot = Armies.freeSlot(bot, 'guard');
    const g = countOf((garrisonOf(bot, cap)?.units || []).filter(u => UNIT[u.unitKey]?.class !== 'SIEGE'));
    if (!slot || g < GUARD_MIN) { bump(m, slot ? 'guardWaitSoldiers' : 'guardNoSlot'); return null; }
    if (B.left <= 0) return null;
    B.left--;
    const r = await bot.post('/api/army/create', { cityId: cap.id, slot, name: Armies.NAMES.guard });
    if (!r.ok || !r.data?.army) { bump(m, 'guardCreateRefused'); return null; }
    const a = { ...r.data.army, units: [] };
    bot.armies.push(a);
    return a;
  };
  // la relève arrivée donne tous ses soldats à la garde (G9). true : fait ; false : refusé (réessayé au tour suivant, la relève
  // d'avant après trois refus) ; null : pas d'échange sur ce serveur (la relève d'avant, désormais)
  const swapInto = async (col, r, a) => {
    const give = (r.units || []).filter(u => u.count > 0 && UNIT[u.unitKey] && UNIT[u.unitKey].class !== 'SIEGE').map(u => ({ unitKey: u.unitKey, count: u.count }));
    if (!give.length) return false;
    B.left--;
    const x = await bot.post(`/api/army/${r.id}/exchange`, { toArmyId: a.id, units: give });
    if (!x.ok) {
      if (x.status === 404 && /route/i.test(String(x.data?.error || ''))) { m.noSwap = 1; bump(m, 'guardSwapMissing'); return null; }
      bump(m, 'guardSwapRefused');
      (m.sf ||= {})[col.id] = (m.sf[col.id] || 0) + 1;
      return false;
    }
    const moved = countOf(give);
    // les troupes des deux armées après l'échange, comme le serveur les rend ; sinon comptées ici
    if (Array.isArray(x.data?.to?.units)) a.units = x.data.to.units;
    else for (const g of give) { const row = (a.units ||= []).find(u => u.unitKey === g.unitKey); if (row) row.count += g.count; else a.units.push({ unitKey: g.unitKey, tier: UNIT[g.unitKey].tier, count: g.count }); }
    r.units = Array.isArray(x.data?.from?.units) ? x.data.from.units : (r.units || []).filter(u => UNIT[u.unitKey]?.class === 'SIEGE');
    // vidée hors de sa ville : posée aussitôt dans la capitale (routes/armies.js, échange)
    if (countOf(r.units) === 0) Object.assign(r, { x: cap.x, y: cap.y, cityId: cap.id, status: 'IDLE' });
    delete m.rel[col.id]; delete m.gr[col.id]; delete m.rs?.[col.id]; delete m.sf?.[col.id];
    bump(m, 'guardSwaps'); bump(m, 'guardSwapSoldiers', moved);
    if (countOf(r.units) === 0 && isHome(r, cap)) await disbandGuard(r, 'guardCourierDisbanded');
    return true;
  };
  // relève d'une garde rattachée trop faible, formée dès qu'une place de la capitale est libre et envoyée. Avec l'échange
  // (G9) : demandée sous GUARD_TOPUP_SHARE de la part quand elle peut apporter ce qui manque (GUARD_TOPUP_MIN et
  // GUARD_TOPUP_PART de la part au moins), elle porte seulement ces soldats et les donne à la garde. Sans échange : demandée
  // sous GUARD_RELIEF_SHARE quand elle emporterait au moins le double (et la part minimale), puis rattachée à l'arrivée à la
  // place de l'ancienne
  const relieve = async (col, a) => {
    let r = alive(m.rel[col.id]);
    const swap = !m.noSwap && (m.sf?.[col.id] || 0) < 3;
    if (!r) {
      const n = countOf(a.units);
      const pool = countOf(fillRows(garrisonOf(bot, cap)));
      const need = swap ? want - n : want;
      const expect = Math.min(need, Math.floor(0.5 * pool));
      const weak = n < (swap ? GUARD_TOPUP_SHARE : GUARD_RELIEF_SHARE) * want;
      const worth = swap ? expect >= Math.max(GUARD_TOPUP_MIN, GUARD_TOPUP_PART * want) : expect >= Math.max(2 * n, GUARD_MIN);
      if (!weak || !worth || fx.maxArmies(cap.buildings || []) < 2) { delete m.gr[col.id]; return; }
      if (m.gr[col.id] === undefined) { m.gr[col.id] = ctx.step; bump(m, 'guardReliefAsked'); }
      r = await createGuard();
      if (!r) return;
      m.rel[col.id] = r.id;
      if (swap) (m.rs ||= {})[col.id] = need; else delete m.rs?.[col.id];
      bump(m, swap ? 'guardTopUps' : 'guardReliefs');
    }
    if (r.status !== 'IDLE' || r.claimedAt || B.left <= 0) return;   // en route
    if (r.x === col.x && r.y === col.y) {
      // arrivée d'une relève qui échange : ses soldats passent à la garde, elle rentre aussitôt et se dissout ; refusé, réessayé
      // au tour suivant ; après trois refus, ou sans échange sur ce serveur, elle se rattache comme une relève d'avant
      if (m.rs?.[col.id] !== undefined) {
        const done = m.noSwap ? null : await swapInto(col, r, a);
        if (done || (done === false && (m.sf?.[col.id] || 0) < 3)) return;
        delete m.rs[col.id];
        bump(m, 'guardSwapGaveUp');
      }
      // sans échange : elle se rattache (la colonie a autant d'emplacements que la capitale) et devient la garde
      B.left--;
      const at = await bot.post(`/api/army/${r.id}/attach-colony`);
      if (!at.ok) { bump(m, 'guardAttachRefused'); return; }
      r.cityId = col.id; if (at.data?.army?.slot) r.slot = at.data.army.slot;
      m.guard[col.id] = r.id; delete m.rel[col.id]; delete m.gr[col.id];
      bump(m, 'guardsAttached'); bump(m, 'guardRelieved');
      await retire(a);
      return;
    }
    if (isHome(r, cap)) {
      // la garnison n'a plus de quoi la remplir : elle rend sa place et ses soldats. Il reste plus d'un appel : fill() n'a pas
      // été coupé faute d'appels (il s'arrête à un), c'est bien la garnison qui manque ; sinon elle se remplit au tour suivant.
      // Avec l'échange, elle ne porte que ce qui manque à la garde (GUARD_TOPUP_MIN au moins pour partir)
      const topUp = swap && m.rs?.[col.id] !== undefined;
      const target = topUp ? Math.max(GUARD_TOPUP_MIN, m.rs[col.id]) : want;
      const least = topUp ? Math.min(GUARD_TOPUP_MIN, target) : Math.min(GUARD_MIN, want);
      if (!(await sendOut(r, col, target, least)) && B.left > 1 && countOf(r.units) < least && (await disbandGuard(r, 'guardReliefDropped'))) { delete m.rel[col.id]; delete m.gr[col.id]; delete m.rs?.[col.id]; }
      return;
    }
    // arrêtée en chemin : elle repart vers la colonie
    B.left--;
    const mv = await bot.post(`/api/army/${r.id}/move`, { x: col.x, y: col.y });
    if (mv.ok) r.status = 'MOVING'; else bump(m, 'guardMoveRefused');
  };

  // gardes sans poste dans la capitale (colonie rasée, ancienne garde relevée, garde que la mémoire a perdue) : une colonie
  // sans garde la reçoit (elle y marchera avec le reste de la boucle), sinon elle rentre puis se dissout
  const posted = new Set([...Object.values(m.guard), ...Object.values(m.rel)]);
  for (const a of bot.armies.filter(x => isGuard(x) && x.cityId === cap.id && !posted.has(x.id))) {
    const bare = cols.find(c => !alive(m.guard[c.id]));
    if (bare) { m.guard[bare.id] = a.id; posted.add(a.id); bump(m, 'guardAdopted'); continue; }
    if (B.left <= 0) break;
    if (a.status === 'IDLE' && isHome(a, cap)) await disbandGuard(a, 'guardDisbanded');
    else if (a.status === 'IDLE' && !a.claimedAt) {
      B.left--;
      const r = await bot.post(`/api/army/${a.id}/return`);
      if (r.ok) { a.status = 'RETURNING'; bump(m, 'guardRecalls'); }
    }
  }
  // une autre garde rattachée à une colonie qui a déjà la sienne (l'ancienne, quand son renvoi a été refusé) : elle rentre
  // quand la capitale a une place libre (sinon elle défend la colonie avec l'autre, sans un refus à chaque tour) ; vide, elle
  // se dissout sur place
  for (const a of bot.armies.filter(x => isGuard(x) && isCol(x.cityId) && !posted.has(x.id))) {
    if (B.left <= 0) break;
    if (countOf(a.units) > 0 && Armies.freePlaces(bot) <= 0) continue;
    if (atCol(a, cols.find(c => c.id === a.cityId))) await retire(a);
  }

  for (const col of cols) {
    if (B.left <= 1 || cap.isSieged) break;
    let a = alive(m.guard[col.id]);
    // garde vide rattachée : dissoute sur place (une armée vide ne quitte pas sa colonie) ; sa relève devient la garde, sinon
    // une nouvelle se forme
    if (a && a.cityId === col.id && atCol(a, col) && countOf(a.units) === 0) {
      if (!(await disbandGuard(a, 'guardDisbandedEmpty'))) continue;
      delete m.guard[col.id]; delete m.gr[col.id];
      a = alive(m.rel[col.id]);
      if (a) { m.guard[col.id] = a.id; delete m.rel[col.id]; }
    }
    if (a && atCol(a, col)) {
      // en poste, pas encore rattachée : elle se rattache à la colonie (E2) et rend sa place à la capitale
      if (a.cityId !== col.id) {
        if (B.left <= 0) break;
        B.left--;
        const r = await bot.post(`/api/army/${a.id}/attach-colony`);
        if (r.ok) { a.cityId = col.id; if (r.data?.army?.slot) a.slot = r.data.army.slot; bump(m, 'guardsAttached'); }
        else bump(m, 'guardAttachRefused');
        continue;
      }
      // rattachée : trop faible, une relève part de la capitale
      await relieve(col, a);
      continue;
    }
    if (a && a.status === 'IDLE' && !a.claimedAt && !isHome(a, cap)) {
      // arrêtée ailleurs (la garde d'une colonie rasée qui reçoit ce poste) : elle y marche si elle a des soldats, sinon elle
      // rentre se regarnir (rattachée à une colonie : renvoyée à la capitale, ou dissoute sur place si elle est vide)
      if (B.left <= 0) break;
      const go = countOf(a.units) >= Math.min(GUARD_MIN, want);
      if (!go && a.cityId !== cap.id) { await retire(a); continue; }
      B.left--;
      const r = go ? await bot.post(`/api/army/${a.id}/move`, { x: col.x, y: col.y }) : await bot.post(`/api/army/${a.id}/return`);
      if (r.ok) { a.status = go ? 'MOVING' : 'RETURNING'; if (go) { m.gs[a.id] = ctx.step; bump(m, 'guardsPosted'); } else bump(m, 'guardRecalls'); }
      else bump(m, 'guardMoveRefused');
      continue;
    }
    if (a && !isHome(a, cap)) continue;   // en route
    if (!a) {
      a = await createGuard();
      if (!a) continue;
      m.guard[col.id] = a.id;
      bump(m, 'guardsCreated');
    }
    if (a.status !== 'IDLE') continue;
    await sendOut(a, col);
  }
}

// « Renvoyer à la capitale » (E2) : une garde rattachée à une colonie rentre à la capitale, qui lui garde dès le départ une
// place libre (refus sans place : elle reste en poste et réessaiera) ; true si elle est partie. Vide, elle ne peut pas
// quitter sa colonie (« Armée vide : dissolvez-la dans la colonie ») : elle y est dissoute
async function sendGuardHome(bot, B, m, a, cap) {
  if (B.left <= 0) return false;
  B.left--;
  const r = await bot.post(`/api/army/${a.id}/detach-colony`);
  if (!r.ok) {
    const err = String(r.data?.error || '');
    if (/vide/i.test(err) && B.left > 0) {
      B.left--;
      const d = await bot.del(`/api/army/${a.id}/disband`);
      if (d.ok) { bot.armies = bot.armies.filter(x => x.id !== a.id); delete m.gs?.[a.id]; bump(m, 'guardDisbandedEmpty'); } else bump(m, 'disbandRefused');
      return false;
    }
    bump(m, /emplacement/i.test(err) ? 'guardDetachNoSlot' : 'guardDetachRefused');
    return false;
  }
  a.cityId = cap.id;
  if (r.data?.army?.slot) a.slot = r.data.army.slot;
  a.status = r.data?.arrivalAt ? 'RETURNING' : 'IDLE';
  bump(m, 'guardDetached');
  return true;
}

// ---------- armée « Défense » de la capitale (décision du 2 novembre 2026 (deuxième simulation de 200 jours), G10) ----------
// Seules les armées défendent une ville : la réserve (la garnison : soldats formés mais dans aucune armée) ne combat plus,
// ni contre une attaque, ni contre un raid, ni contre un siège. Le joueur automatique laissait environ un quart de ses
// soldats dans la garnison, qui défendait la capitale ; cette part va dans une armée « Défense » qui reste au repos chez elle
// (jamais de mission, de rassemblement, de renfort, d'escorte ni d'échange au marché : les autres modules ne la prennent pas)
// et défend la ville. Elle se forme sur une place de la capitale (rôle defense de ../armies.cjs, après l'armée de campagne
// et les gardes des colonies), se remplit dans la réserve jusqu'à DEFENSE_SHARE des soldats du joueur (DEFENSE_MIN au
// moins), et ne se regarnit que s'il lui manque DEFENSE_TOPUP de sa part ; vidée par un combat, elle reste et se regarnit.
// Les colonies sont défendues par leur garde rattachée (E2).
const isDefense = (a) => !a.isGarrison && a.name === Armies.NAMES.defense;
async function defense(bot, ctx, B, m, cap) {
  if (!cap || B.left <= 1 || cap.isSieged || !lvl(cap, 'RALLY_POINT')) return;
  let a = (m.def && bot.armies.find(x => x.id === m.def && isDefense(x))) || bot.armies.find(x => isDefense(x) && x.cityId === cap.id) || null;
  if (a) m.def = a.id; else delete m.def;
  const pool = countOf(fillRows(garrisonOf(bot, cap)));
  if (!a) {
    if (!Armies.missing(bot, 'defense')) return;
    const slot = Armies.freeSlot(bot, 'defense');
    if (!slot) { bump(m, 'defenseNoSlot'); return; }
    if (pool < DEFENSE_MIN) { bump(m, 'defenseWaitSoldiers'); return; }
    B.left--;
    const r = await bot.post('/api/army/create', { cityId: cap.id, slot, name: Armies.NAMES.defense });
    if (!r.ok || !r.data?.army) { bump(m, 'defenseCreateRefused'); return; }
    a = { ...r.data.army, units: [] };
    bot.armies.push(a);
    m.def = a.id;
    bump(m, 'defenseCreated');
  }
  if (!Armies.atHome(a, cap)) return;
  const soldiersAll = bot.armies.reduce((t, x) => t + countOf((x.units || []).filter(u => UNIT[u.unitKey]?.class !== 'SIEGE')), 0);
  const want = Math.max(DEFENSE_MIN, Math.round(DEFENSE_SHARE * soldiersAll));
  const have = countOf((a.units || []).filter(u => UNIT[u.unitKey]?.class !== 'SIEGE'));
  if (want - have < Math.max(10, DEFENSE_TOPUP * want) || pool < 5) return;
  const before = countOf(a.units);
  await fill(bot, ctx, B, m, a, cap, Math.min(0.9, (want - have) / Math.max(1, pool)));
  if (countOf(a.units) > before) { bump(m, 'defenseFills'); bump(m, 'defenseSoldiers', countOf(a.units) - before); }
}

// une case libre à côté du point (pas sur le bloc 2 × 2 de la future ville) : l'armée s'y poste avant de frapper
function besideNode(node, view) {
  const block = new Set(Terrain.cityCells(node.x, node.y).map(([x, y]) => `${x},${y}`));
  const taken = (x, y) => view.nodes.some(n => n.x === x && n.y === y) || view.cities.some(c => x >= c.x && x <= c.x + 1 && y >= c.y && y <= c.y + 1);
  for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1], [2, 0], [0, 2]]) {
    const x = node.x + dx, y = node.y + dy;
    if (Math.hypot(dx, dy) > 1.5 || block.has(`${x},${y}`)) continue;
    try { if (!Terrain.inWorld(x, y) || Terrain.isBlocked(x, y)) continue; } catch (e) { continue; }
    if (!taken(x, y)) return { x, y };
  }
  return null;
}

// fondation d'une ville secondaire sur un point de ressource gardé par une tribu, comme le ferait un joueur :
// 1. l'armée la plus forte se poste à côté du camp ; 2. quand le colon, les 3 000 de chaque ressource et l'escorte sont
// prêts, elle frappe (combat immédiat au contact), libère le point, et la colonne du colon part dans le même tour : elle
// arrive avant le retour de la tribu. Un point déjà libre est fondé directement.
async function colony(bot, ctx, B, m, cap) {
  const u = settlerUse(bot, cap);
  const col = m.col;
  if (!col) {
    // toutes les colonies que la Résidence permet sont fondées (le serveur refuserait la fondation) : un colon formé est
    // celui de la Ville Merveille (70-wonder.cjs)
    if (u.colonies >= u.slots) return;
    if (!((cap.settlers || 0) > 0 || u.training > 0) || B.left <= 1) return;
    B.left--;
    const r = await bot.get(`/api/map/free-sites?limit=${FREE_SITES}`);
    if (!r.ok || !Array.isArray(r.data)) return;
    const field = bot.armies.filter(a => m.own.includes(a.id) && a.cityId === cap.id).reduce((t, a) => Math.max(t, powerOf(a.units)), 0);
    const garrisonPower = powerOf(garrisonOf(bot, cap)?.units);
    const fieldPower = field + CLEAR_SHARE * garrisonPower;
    const site = pickColonySite(bot, m, cap, r.data, fieldPower);
    if (!site) { bump(m, 'noColonySite'); return; }
    // un camp au-dessus de ce que l'armée bat aujourd'hui (gisement de niveau 2 ou 3) : plus de temps pour le libérer
    const upper = site.tribePower > fieldPower / m.ratio;
    if (upper) bump(m, 'colonySiteUpper');
    m.col = { n: site.id, x: site.x, y: site.y, t: site.type, l: site.level, ph: site.tribePower > 0 ? 'clear' : 'ready', s: ctx.step, f: 0, ...(upper ? { w: CLEAR_STEPS_UPPER } : {}) };
    return;
  }
  const armyA = col.a ? bot.armies.find(a => a.id === col.a) : null;
  const drop = (why) => { bump(m, why); (m.bad ||= []).push(col.n); if (m.bad.length > 6) m.bad.shift(); delete m.col; };
  const recallA = async () => {
    if (armyA && armyA.status === 'IDLE' && !isHome(armyA, cap) && B.left > 0) {
      B.left--;
      const r = await bot.post(`/api/army/${armyA.id}/return`);
      if (r.ok) { armyA.status = 'RETURNING'; bump(m, 'approachRecalls'); } else bump(m, 'returnRefused');
    }
    col.ph = 'clear'; delete col.a; col.s = ctx.step;
  };

  if (col.ph === 'going') {
    if (bot.cities.some(c => c.x === col.x && c.y === col.y && !c.isCapital)) {
      const city = bot.cities.find(c => c.x === col.x && c.y === col.y);
      bump(m, 'coloniesFounded'); if (col.l) bump(m, `siteLevel${col.l}`);
      ctx.event('colony_founded', { bot: bot.name, faction: bot.faction, city: city.name, x: col.x, y: col.y, site: city.site || { type: col.t, level: col.l }, colonies: bot.cities.filter(c => !c.isCapital).length });
      delete m.col;
      return;
    }
    const b = bot.armies.find(a => a.id === col.b);
    if (!b || (ctx.step - col.s > 2 && b.status === 'IDLE' && isHome(b, cap)) || ctx.step - col.s > 24) {
      // le point n'était plus libre à l'arrivée (une ville, une fondation ou une tribu à côté) : le colon est revenu
      ctx.event('colony_failed', { bot: bot.name, x: col.x, y: col.y, army: b ? b.status : 'disparue', settlersBack: cap.settlers || 0 });
      drop('foundFailed');
    }
    return;
  }
  if (col.ph === 'approach' && armyA && armyA.status === 'MOVING') { if (ctx.step - col.s > 6) drop('approachStuck'); return; }
  if (B.left <= 1) return;
  const view = await scan(bot, ctx, B, cap, 0);
  if (!view || view.step !== ctx.step) return;   // pas de carte fraîche ce tour-ci
  const node = view.nodes.find(n => n.id === col.n) || null;
  if (!node || node.cityId || (node.hiddenHolders || 0) > 0 || (node.holders || []).some(h => h.playerId !== bot.playerId)) { await recallA(); drop('colonySiteTaken'); return; }
  const colonies = bot.cities.filter(c => !c.isCapital && !c.isWonder).length;
  const settlerReady = (cap.settlers || 0) >= 1 && !cap.isSieged && colonies < u.slots;

  // l'armée qui fonde : une autre que celle qui frappe, dans la capitale, avec des soldats (une escorte suffit)
  const founder = async () => {
    const founders = bot.armies.filter(x => m.own.includes(x.id) && x.cityId === cap.id && x.id !== col.a && x.status === 'IDLE' && isHome(x, cap));
    let b = founders.find(x => countOf(x.units) > 0);
    if (!b && founders.length && B.left > 2) {
      const g = (garrisonOf(bot, cap)?.units || []).filter(x => UNIT[x.unitKey]?.class !== 'SIEGE').sort((p, q) => q.count - p.count)[0];
      if (g && g.count >= 1) {
        B.left--;
        const r = await bot.post(`/api/army/${founders[0].id}/set-unit`, { unitKey: g.unitKey, count: Math.min(20, g.count) });
        if (r.ok) { founders[0].units = [{ unitKey: g.unitKey, count: r.data?.newCount || Math.min(20, g.count) }]; b = founders[0]; bump(m, 'escorts'); }
        else bump(m, 'escortRefused');
      }
    }
    return b || null;
  };
  const found = async (b) => {
    B.left--;
    const f = await bot.post(`/api/army/${b.id}/found-city`, { resourceNodeId: col.n });
    if (!f.ok) { bump(m, 'foundRefused'); col.f = (col.f || 0) + 1; col.ph = tribeOn(node) ? 'clear' : 'ready'; if (col.f >= 3) drop('colonySiteLost'); return; }
    Stock.spend(bot, cap, FOUND_COST);   // les ressources de la fondation : toutes les villes, la capitale d'abord
    cap.settlers = Math.max(0, (cap.settlers || 0) - 1);
    b.status = 'MOVING'; b.settlers = 1;
    col.ph = 'going'; col.b = b.id; col.s = ctx.step;
    bump(m, 'foundSent');
  };

  if (col.ph === 'ready') {
    if (tribeOn(node)) { col.ph = 'clear'; return; }
    if (someoneOn(node)) return;   // une de ses armées récolte encore : elle partira
    if (!settlerReady) return;
    if (!Stock.canPay(bot, FOUND_COST)) { bump(m, 'foundWaitRes'); return; }
    const b = await founder();
    if (!b) { bump(m, 'foundWaitArmy'); return; }
    if (B.left > 0) await found(b);
    return;
  }

  if (col.ph === 'clear') {
    if (!tribeOn(node)) { col.ph = 'ready'; return; }
    const a = bot.armies.filter(x => m.own.includes(x.id) && x.cityId === cap.id && x.status === 'IDLE' && isHome(x, cap) && countOf(x.units) > 0).sort((p, q) => powerOf(q.units) - powerOf(p.units))[0];
    if (!a) return;
    const need = m.ratio * node.defenderPower;
    // le site a été choisi sur l'armée et 75 % de la garnison (pickColonySite) : l'armée qui frappe prend d'abord ces
    // soldats de la garnison (avant ce rattrapage, 21 sites tenus 10 jours puis abandonnés alors que la garnison suffisait)
    if (powerOf(a.units) < need && powerOf(a.units) + CLEAR_SHARE * powerOf(garrisonOf(bot, cap)?.units) >= need && B.left > 2) {
      await fill(bot, ctx, B, m, a, cap, CLEAR_SHARE);
      bump(m, 'clearFilled');
    }
    if (powerOf(a.units) < need) { if (ctx.step - col.s > (col.w || CLEAR_STEPS)) drop('colonySiteTooStrong'); return; }
    const spot = besideNode(node, view);
    if (!spot) { drop('colonySiteNoApproach'); return; }
    B.left--;
    const r = await bot.post(`/api/army/${a.id}/move`, { x: spot.x, y: spot.y });
    if (!r.ok) { bump(m, 'moveRefused'); col.f = (col.f || 0) + 1; if (col.f >= 3) drop('colonySiteLost'); return; }
    a.status = 'MOVING';
    col.a = a.id; col.ph = 'approach'; col.s = ctx.step;
    bump(m, 'approaches');
    return;
  }

  if (col.ph === 'approach') {
    if (!armyA) { col.ph = 'clear'; return; }
    const near = armyA.status === 'IDLE' && Math.hypot(armyA.x - node.x, armyA.y - node.y) <= 1.5;
    if (!near) { col.f = (col.f || 0) + 1; await recallA(); if (col.f >= 3) drop('colonySiteLost'); return; }
    if (tribeOn(node) && powerOf(armyA.units) < m.ratio * node.defenderPower) { await recallA(); return; }   // le camp s'est renforcé
    // posté à côté du camp : il ne frappe que quand tout est prêt pour la fondation
    const wait = (why) => { bump(m, why); return ctx.step - col.s > 16 ? recallA() : null; };
    if (!settlerReady) return wait('approachWaitSettler');
    if (!Stock.canPay(bot, FOUND_COST)) return wait('foundWaitRes');
    const b = await founder();
    if (!b) return wait('foundWaitArmy');
    if (B.left < (tribeOn(node) ? 3 : 1)) return;
    if (tribeOn(node)) {
      B.left--;
      const r = await bot.post(`/api/army/${armyA.id}/raid-resource`, { resourceNodeId: col.n });
      if (!r.ok) { bump(m, 'raidRefused'); col.f = (col.f || 0) + 1; await recallA(); if (col.f >= 3) drop('colonySiteLost'); return; }
      bump(m, 'raids'); bump(m, 'colonyRaids'); if (r.data?.combatResult?.attackerLosses > 0) m.hurt = 1;
      if (r.data?.success) { bump(m, 'tribeWins'); m.ratio = Math.max(1.1, m.ratio - 0.05); }
      else { bump(m, 'tribeLosses'); m.ratio = Math.min(3.5, m.ratio + 0.3); }
      if (r.data?.status !== 'HARVESTING') { col.f = (col.f || 0) + 1; await recallA(); if (col.f >= 3) drop('colonySiteLost'); return; }
      armyA.status = 'HARVESTING';
      // l'armée victorieuse tient le point : elle rentre, le point est libre jusqu'au retour de la tribu
      B.left--;
      const back = await bot.post(`/api/army/${armyA.id}/return`);
      if (!back.ok) { bump(m, 'returnRefused'); return; }
      armyA.status = 'RETURNING'; bump(m, 'holdReleases');
    } else if (someoneOn(node)) return;
    await found(b);
  }
}

const disband = async (bot, B, m, a, why) => {
  B.left--;
  const r = await bot.del(`/api/army/${a.id}/disband`);
  if (r.ok) { m.own = m.own.filter(id => id !== a.id); bot.armies = bot.armies.filter(x => x.id !== a.id); bump(m, 'disbanded'); bump(m, why); delete m.yield; }
  else bump(m, 'disbandRefused');
  return r.ok;
};
// armées de ce module dans leur ville : une armée réduite à presque rien est dissoute (ses soldats retournent à la
// garnison) ; hors fondation, une seconde armée de campagne rend sa place quand un autre rôle attend une armée et qu'il ne
// reste aucune place libre (gardes des colonies d'abord, puis convoi, Ost, garde de la Merveille, caravane : ../armies.cjs).
// Simulation du 31 octobre 2026 : la seconde armée, souvent celle du héros, n'était rendue qu'une fois et à des conditions
// rarement réunies ; 8 colonies sur 76 n'ont jamais eu de garde. Elle rend sa place même avec le héros : le serveur le
// laisse en ville et le module du héros le donne à l'autre armée au tour suivant.
async function tidy(bot, ctx, B, m) {
  const cap = bot.capital;
  for (const a of bot.armies) {
    if (B.left <= 3 || !m.own.includes(a.id) || a.status !== 'IDLE') continue;
    const city = cityOf(bot, a.cityId);
    if (!isHome(a, city) || m.col?.a === a.id || m.col?.b === a.id || a.heroId) continue;
    const n = countOf(a.units);
    const mine = bot.armies.filter(x => m.own.includes(x.id) && x.cityId === a.cityId).length;
    if (n > 0 && n < 5 && mine >= 2) await disband(bot, B, m, a, 'disbandedTiny');
  }
  if (!cap || B.left <= 2 || Armies.founding(bot, cap)) { delete m.yield; return; }
  const mine = bot.armies.filter(x => m.own.includes(x.id) && x.cityId === cap.id && !x.isGarrison);
  const waiting = Armies.waitingRoles(bot);
  if (mine.length < 2 || waiting <= Math.max(0, Armies.freePlaces(bot))) { delete m.yield; return; }
  // une armée au moins reste toujours (escorte d'un colon, récoltes) : sans le héros d'abord, puis la plus faible ; jamais
  // une armée gardée pour un rassemblement (bot.mem.mil.idle des invasions et de la Merveille, bot.mem.wonder.keep)
  const kept = (x) => (m.idle?.[x.id] || 0) > ctx.step || (bot.mem.wonder?.keep?.[x.id] || 0) > ctx.step;
  // le fondateur de la Ville Merveille qui garde une escorte (holdsWonderEscort) ne rend pas la dernière armée au repos dans
  // la capitale qui pourrait la faire (comme 70-wonder.cjs : des soldats, ni garde ni convoi) ; l'autre rentre d'abord
  const escort = (x) => Armies.atHome(x, cap) && countOf((x.units || []).filter(u => UNIT[u.unitKey]?.class !== 'SIEGE')) > 0 && !ESCORT_NEVER.has(x.name);
  const lastEscort = (x) => holdsWonderEscort(bot) && escort(x) && bot.armies.filter(escort).length <= 1;
  const home = mine.filter(x => Armies.atHome(x, cap) && !kept(x) && !lastEscort(x)).sort((p, q) => (!!p.heroId - !!q.heroId) || (powerOf(p.units) - powerOf(q.units)));
  if (home.length) { await disband(bot, B, m, home[0], 'yielded'); return; }
  // aucune n'est en ville : la plus faible qui récolte (ou attend dehors) rentre, elle rendra sa place au tour suivant
  if (m.yield && mine.some(x => x.id === m.yield)) return;
  const away = mine.filter(x => (x.status === 'HARVESTING' || (x.status === 'IDLE' && !x.claimedAt)) && !isHome(x, cap) && !kept(x) && !onOwnWonder(bot, x)).sort((p, q) => powerOf(p.units) - powerOf(q.units))[0];
  if (!away) return;
  B.left--;
  const r = await bot.post(`/api/army/${away.id}/return`);
  if (r.ok) { away.status = 'RETURNING'; m.yield = away.id; bump(m, 'yieldRecalls'); } else bump(m, 'returnRefused');
}

function prepare(bot) {
  if (!bot.cities?.length || !Array.isArray(bot.armies)) return null;
  const m = memOf(bot);
  m.own = m.own.filter(id => bot.armies.some(a => a.id === id));
  return m;
}

module.exports = {
  name: 'military',
  residence, heal, recruit, unlockedUnits, siteWish, pickColonySite, guards, defense, tidy, bestTarget, needWeight, tribeVerdict, review,   // pour les tests unitaires (tests/unit/sim-bots.test.js)
  holdsWonderEscort,   // une escorte gardée pour le colon de la Ville Merveille (module de guerre)
  spareGold,   // or au-dessus de la réserve de l'élite (modules du héros et de la guerre)
  // début du tour, avant l'économie (fichier 09-military-early.cjs) : un joueur qui prépare une colonie envoie son colon et
  // monte sa Résidence avant de dépenser le reste en constructions
  async early(bot, ctx) {
    const m = prepare(bot);
    const cap = bot.capital;
    if (!m || !cap) return;
    const B = { left: 5 };
    review(bot, ctx, m);
    await colony(bot, ctx, B, m, cap);
    await residence(bot, ctx, B, m, cap);
    await settlers(bot, ctx, B, m, cap);
  },
  async act(bot, ctx) {
    const m = prepare(bot);
    if (!m) return;
    const B = { left: CALLS_PER_TURN };
    const cap = bot.capital;
    const muster = musterOf(bot, ctx) > ctx.step;   // l'alliance prépare un assaut de Bastion : les armées de la capitale restent
    review(bot, ctx, m);
    await recalls(bot, ctx, B, m, muster);
    // recrutement : chaque ville qui peut former des troupes (capitale ; colonie avec Grande caserne / écurie)
    for (const city of bot.cities) await recruit(bot, ctx, B, m, city);
    // armées : une armée de campagne, une seconde quand une colonie se prépare (la même règle que ../armies.cjs, et une place
    // gardée pour chaque colonie sans garde) ; ou pour une grosse garnison, seulement sur une place qu'aucun autre rôle
    // n'attend (gardes des colonies, convoi, Ost, garde de la Merveille, caravane : ../armies.cjs)
    for (const city of bot.cities) {
      if (B.left <= 0) break;
      const pending = city.isCapital && Armies.founding(bot, city) && Armies.freePlaces(bot) > Armies.missing(bot, 'guard');
      const spare = city.isCapital && countOf(garrisonOf(bot, city)?.units) >= 300 && !!Armies.freeSlot(bot, 'hunt');
      await organise(bot, ctx, B, m, city, pending || spare ? 2 : 1);
    }
    await tidy(bot, ctx, B, m);
    // une garde dans chaque colonie, puis l'armée « Défense » de la capitale (G10), avant que l'armée de campagne ne prenne
    // les soldats de la garnison
    if (cap) await guards(bot, ctx, B, m, cap);
    if (cap) await defense(bot, ctx, B, m, cap);
    // missions : les armées de ce module qui attendent dans leur ville
    const exclude = new Set();
    const reserved = new Set([m.col?.a, m.col?.b].filter(Boolean));
    // une armée de la capitale reste à la maison pour escorter un colon : pendant la fondation d'une colonie, et pendant que
    // l'alliance libère (ou a libéré) un site de la Merveille dont ce joueur est le fondateur (drapeau posé par 70-wonder.cjs,
    // bot.mem.wonder.holdEscort ; simulation du 31 octobre 2026 : un site libéré 9 fois avant la fondation, l'escorte toujours
    // partie en mission)
    const keepHome = (!!m.col && (m.col.ph === 'approach' || m.col.ph === 'ready')) || holdsWonderEscort(bot);
    for (const a of bot.armies) {
      if (B.left <= 0) break;
      if (!m.own.includes(a.id) || a.status !== 'IDLE' || reserved.has(a.id)) continue;
      const city = cityOf(bot, a.cityId);
      if (!city || !isHome(a, city) || city.isSieged) continue;
      if (muster && city.isCapital) { bump(m, 'missionMuster'); continue; }
      if (keepHome && city.isCapital && bot.armies.filter(x => m.own.includes(x.id) && x.cityId === city.id && x.status === 'IDLE' && isHome(x, city) && !reserved.has(x.id)).length <= 1) { bump(m, 'keptHomeForEscort'); continue; }
      // la garnison garde un quart des soldats, le reste part avec l'armée
      const g = countOf((garrisonOf(bot, city)?.units || []).filter(u => UNIT[u.unitKey]?.class !== 'SIEGE'));
      if (g >= 10 && g > 0.3 * (g + countOf(a.units)) && B.left > 2) await fill(bot, ctx, B, m, a, city, 0.75);
      if (countOf(a.units) < 10 || (m.idle?.[a.id] || 0) > ctx.step) continue;
      const view = await scan(bot, ctx, B, city, 1);
      if (view && !(await mission(bot, ctx, B, m, a, city, view, exclude))) (m.idle ||= {})[a.id] = ctx.step + 4;   // rien à sa portée : on regardera plus tard
    }
    for (const id of Object.keys(m.idle || {})) if (m.idle[id] <= ctx.step || !m.own.includes(id)) delete m.idle[id];
    // soins
    if (cap) await heal(bot, ctx, B, m, cap);
  },
  async afterStep(ctx) {
    const total = Math.round(ctx.OPT.days * 24 / ctx.OPT.stepHours);
    if (ctx.step % 112 !== 0 && ctx.step !== total) return;
    const k = {};
    for (const b of ctx.bots) for (const [key, v] of Object.entries(b.mem.mil?.k || {})) k[key] = (k[key] || 0) + v;
    let db = {};
    try {
      const q = (sql) => ctx.prisma.$queryRawUnsafe(sql);
      db = {
        tribeBattles: (await q(`SELECT result, count(*)::int AS n FROM "BattleReport" WHERE loot->>'type' = 'TRIBE' AND "playerId" = "attackerId" GROUP BY 1`)).map(r => `${r.result} ${r.n}`).join(', '),
        colonies: Number((await q(`SELECT count(*)::int AS n FROM "City" WHERE NOT "isCapital"`))[0]?.n || 0),
        // gisements des colonies (bonus de gisement, décision du 30 octobre 2026) : type et niveau
        colonySites: (await q(`SELECT rn."resourceType" AS t, rn.level AS l, count(*)::int AS n FROM "ResourceNode" rn JOIN "City" c ON c.id = rn."cityId" WHERE NOT c."isCapital" GROUP BY 1, 2 ORDER BY 1, 2`)).map(r => `${r.t}${r.l} ${r.n}`).join(', '),
        units: Number((await q(`SELECT coalesce(sum(count), 0)::int AS n FROM "ArmyUnit"`))[0]?.n || 0),
        fieldArmies: Number((await q(`SELECT count(*)::int AS n FROM "Army" WHERE NOT "isGarrison"`))[0]?.n || 0),
        harvesting: Number((await q(`SELECT count(*)::int AS n FROM "Army" WHERE status = 'HARVESTING'`))[0]?.n || 0),
        wounded: Number((await q(`SELECT coalesce(sum(count + waiting), 0)::int AS n FROM "WoundedUnit"`))[0]?.n || 0),
        // l'entretien puise dans tous les greniers d'un joueur : la famine ne vient que quand leur total est vide
        starving: Number((await q(`SELECT count(*)::int AS n FROM (SELECT "playerId" FROM "City" GROUP BY 1 HAVING sum(food) < 1) s`))[0]?.n || 0)
      };
    } catch (e) { db = { error: e.message }; }
    ctx.event('military_summary', { step: ctx.step, ...db, counters: k });
    ctx.say(`militaire : ${JSON.stringify({ ...db, recruited: k.recruited || 0, raids: k.raids || 0, collects: k.collects || 0, colonies: k.coloniesFounded || 0 })}`);
  }
};
