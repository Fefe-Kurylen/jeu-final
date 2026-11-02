// Simulation longue — les armées de campagne d'un joueur et les emplacements de la Place de rassemblement.
// Chaque module nomme ses armées ; la Place de la capitale donne autant d'emplacements à chaque ville (fx.maxArmies), et
// une armée postée ailleurs (garnison du Bastion, renfort de la Ville Merveille) garde l'emplacement de sa ville. La garde
// d'une colonie s'y rattache une fois arrivée (décision du 1er novembre 2026, E2 : POST /api/army/:id/attach-colony) : elle
// passe sur un emplacement de la colonie (sa ville devient la colonie) et rend celui de la capitale ; fieldArmies(bot, cap)
// ne la compte plus. Les emplacements de la capitale se partagent par ordre de priorité : une armée d'un rôle ne se forme
// que s'il reste une place une fois servis les rôles d'avant qui manquent encore.
//   field  : armée de campagne du module militaire (récolte, tribus, expéditions du héros ; une seconde pendant une fondation,
//            ou sur une place qu'aucun autre rôle n'attend ; hors fondation, cette seconde armée rend sa place dès qu'un autre
//            rôle attend : waitingRoles, 30-military.cjs tidy)
//   guard  : garde de chaque colonie (décision du 31 octobre 2026, rapport de vérification : une armée postée dans chaque
//            colonie, les colonies n'ont pas de garnison) ; formée dans la capitale, elle n'y garde sa place que le temps
//            d'aller se rattacher à sa colonie ; une garde trop faible est relevée par une nouvelle, formée de même (la
//            relève attendue compte comme une garde qui manque : simulation sim-e, gardes jamais regarnies)
//   convoy : convoi du Bastion, puis sa garnison (20-alliance.cjs)
//   ost    : armée des guerriers et des pillards (50-war.cjs)
//   wonder : garde de la Ville Merveille de l'alliance (70-wonder.cjs)
//   caravan: armée du marché (40-market.cjs : offres, échanges, envois)
//   hunt   : armée de chasse des invasions, le week-end (60-invasion.cjs)
// Une armée réservée par une offre du marché (statut MARKET) n'est pas libre : elle attend en ville avec les marchandises.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));

const NAMES = { ost: 'Ost', convoy: 'Convoi', caravan: 'Caravane', guard: 'Garde', hunt: 'Chasse aux hordes', wonder: 'Garde de la Merveille' };
const ORDER = ['field', 'guard', 'convoy', 'ost', 'wonder', 'caravan', 'hunt'];

const lvl = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const colonies = (bot) => (bot.cities || []).filter(c => !c.isCapital && !c.isWonder);
const fieldArmies = (bot, city) => (bot.armies || []).filter(a => !a.isGarrison && a.cityId === city.id);
const named = (bot, name) => (bot.armies || []).filter(a => !a.isGarrison && a.name === name);
// armée chez elle, au repos (ni en mission, ni réservée par une offre du marché)
const atHome = (a, city) => !!a && !!city && !a.isGarrison && a.status === 'IDLE' && !a.claimedAt && a.x === city.x && a.y === city.y && a.cityId === city.id;

// une colonie se prépare : une colonie reste à fonder et un site est choisi, un colon attend ou se forme dans la capitale
// (le colon de la Ville Merveille, formé quand toutes les colonies sont fondées, n'en est pas une). La même règle pour
// l'armée de campagne voulue (militaryNeed) et pour celle que le module militaire forme ou rend (30-military.cjs).
function founding(bot, city = bot.capital) {
  const mil = bot.mem?.mil;
  if (!city?.isCapital || colonies(bot).length >= config.city.maxSecondaryCities) return false;
  return !!mil?.col || (city.settlers || 0) > 0 || (city.recruitQueue || []).some(q => q.unitKey === 'SETTLER');
}
// armées de campagne voulues par le module militaire : une, deux pendant une fondation (colon prêt ou en formation)
function militaryNeed(bot, city) {
  const mil = bot.mem?.mil;
  if (!mil || !city?.isCapital) return 0;
  const own = fieldArmies(bot, city).filter(a => (mil.own || []).includes(a.id)).length;
  return Math.max(0, (founding(bot, city) ? 2 : 1) - own);
}
// colonies sans garde (l'armée qui y est postée, suivie dans bot.mem.mil.guard)
function guardsMissing(bot) {
  const g = bot.mem?.mil?.guard || {};
  return colonies(bot).filter(c => !(bot.armies || []).some(a => a.id === g[c.id])).length;
}
// relèves attendues : colonies dont la garde est trop faible (bot.mem.mil.gr, 30-military.cjs) et dont la relève n'est pas
// encore formée (bot.mem.mil.rel). Simulation sim-e : une garde affaiblie attendait une place libre à la capitale pour
// rentrer se regarnir (8 061 refus), sans que personne ne la lui rende
function reliefsMissing(bot) {
  const mil = bot.mem?.mil;
  if (!mil?.gr) return 0;
  const has = (id) => !!id && (bot.armies || []).some(a => a.id === id);
  return colonies(bot).filter(c => mil.gr[c.id] !== undefined && has(mil.guard?.[c.id]) && !has(mil.rel?.[c.id])).length;
}
// armées rattachées aux colonies du joueur (E2 : leur ville est la colonie), hors garnison
const attachedArmies = (bot) => { const ids = new Set(colonies(bot).map(c => c.id)); return (bot.armies || []).filter(a => !a.isGarrison && ids.has(a.cityId)); };

// armées encore à former pour chaque rôle (dans la capitale)
function missing(bot, role) {
  const cap = bot.capital;
  if (!cap) return 0;
  const war = bot.mem?.war;
  switch (role) {
    case 'field': return militaryNeed(bot, cap);
    case 'guard': return bot.mem?.mil ? guardsMissing(bot) + reliefsMissing(bot) : 0;
    case 'convoy': return bot.mem?.al?.wantConvoy && !named(bot, NAMES.convoy).length ? 1 : 0;
    case 'ost': return war?.wantOst && !named(bot, NAMES.ost).length ? 1 : 0;
    case 'wonder': return bot.mem?.won?.wantGuard && !named(bot, NAMES.wonder).length ? 1 : 0;
    case 'caravan': return lvl(cap, 'MARKET') >= 1 && !named(bot, NAMES.caravan).length ? 1 : 0;
    default: return 0;
  }
}

// armées que les rôles d'avant `role` attendent encore
const ahead = (bot, role) => ORDER.slice(0, Math.max(0, ORDER.indexOf(role))).reduce((t, r) => t + missing(bot, r), 0);

// places libres de la capitale (emplacements de la Place de rassemblement sans armée)
const freePlaces = (bot) => (bot.capital ? fx.maxArmies(bot.capital.buildings || []) - fieldArmies(bot, bot.capital).length : 0);
// une armée de ce rôle rend sa place : un rôle d'avant attend une armée et il ne reste aucune place libre (la caravane se
// dissout quand l'Ost ou la garde de la Merveille n'a pas de place ; ses soldats rentrent dans la garnison)
function mustYield(bot, role) {
  if (!bot.capital) return false;
  return ahead(bot, role) > Math.max(0, freePlaces(bot));
}
// armées que les autres rôles attendent encore (gardes des colonies, convoi, Ost, garde de la Merveille, caravane ; la chasse
// du week-end ne prend qu'une place restée libre) : une seconde armée de campagne, hors fondation, leur rend sa place
const othersWaiting = () => ORDER.filter(r => r !== 'field' && r !== 'hunt');
const waitingRoles = (bot) => othersWaiting().reduce((t, r) => t + missing(bot, r), 0);

// un emplacement libre de la capitale pour une armée de ce rôle (le plus haut : les premiers vont à l'armée de campagne),
// ou null quand les rôles d'avant en ont encore besoin
function freeSlot(bot, role, city = bot.capital) {
  if (!city || !lvl(bot.capital, 'RALLY_POINT')) return null;
  const max = fx.maxArmies(bot.capital.buildings || []);
  const used = fieldArmies(bot, city);
  const wait = city.isCapital ? ahead(bot, role) : 0;
  if (max - used.length - wait <= 0) return null;
  const taken = new Set(used.map(a => a.slot));
  for (let s = max; s >= 1; s--) if (!taken.has(s)) return s;
  return null;
}

module.exports = { NAMES, ORDER, atHome, founding, militaryNeed, guardsMissing, reliefsMissing, attachedArmies, missing, freeSlot, mustYield, freePlaces, waitingRoles, named, fieldArmies, colonies };
