// Simulation longue — stock partagé entre les villes d'un joueur (décision du 30 octobre 2026, § 1 bis) : constructions,
// recrutements, recherche, soins, héros et fondation se paient sur la somme des stocks de ses villes (la ville de
// l'action d'abord, puis la plus pleine par rapport à son Dépôt ou son Silo) ; l'entretien puise dans tous ses greniers.
// Stock commun (décision du 1er novembre 2026, simulation de 200 jours, E1) : ce qu'une armée emporte (offre et échange du
// marché, envoi à un allié, livraison à la Ville Merveille, ravitaillement du Bastion) se prend aussi dans toutes les
// villes, la ville de départ d'abord (utils/db.js debitPlayer) ; une offre rendue revient à sa ville puis aux autres selon
// la place (creditPlayer). L'armée part toujours de la capitale ; les modules lisent ce qui peut partir dans pool().
// Le pillage et les raids restent propres à chaque ville (plus de transport entre ses propres villes).
// Les modules tiennent le compte entre deux lectures de GET /api/cities avec la répartition du serveur (utils/db.js).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { RESOURCES: RES, planDebit, planCredit, stockTotals } = require(path.join(ROOT, 'src/utils/db'));
const { buildCostFor, recruitCostFor } = require(path.join(ROOT, 'src/utils/calculations'));
const { buildingsData } = require(path.join(ROOT, 'src/config/gamedata'));

// prix d'un niveau de bâtiment et d'un lot d'unités : ceux du serveur (sans la réduction de la recherche Ingénierie)
const buildCost = (key, level) => buildCostFor(buildingsData.find(b => b.key === key), level);
const recruitCost = (unit, n) => recruitCostFor(unit, n);

// stock et plafonds de toutes les villes du joueur réunies
const totals = (bot) => stockTotals(bot.cities);
// bilan de nourriture de tout le joueur (GET /api/cities : playerStock.foodBalance) : { production, consumption, net, hoursLeft }
const foodBalance = (bot) => bot.cities?.[0]?.playerStock?.foodBalance || null;

// le joueur peut payer `cost` (× margin) en gardant `reserve`, toutes ses villes comprises
function canPay(bot, cost, { margin = 1, reserve = {} } = {}) {
  const t = totals(bot);
  return RES.every(r => t[r] - (reserve[r] || 0) >= (cost[r] || 0) * margin);
}

// ce qu'un joueur peut avoir en main d'une ressource au début d'un tour : le stockage de toutes ses villes ; pour la
// nourriture, moins l'entretien d'un pas (le tick ajoute la production plafonnée aux greniers, puis retire l'entretien
// du pas entier : avec des pas de 6 h, les greniers ne sont jamais pleins quand le joueur se connecte)
function room(bot, r, stepHours) {
  const t = totals(bot);
  if (r !== 'food') return t.maxStorage;
  return t.maxFoodStorage - (foodBalance(bot)?.consumption || 0) * stepHours;
}
// un prix qui tient dans ce que le joueur peut avoir en main (sinon il faut plus de stockage)
const fits = (bot, cost, stepHours) => RES.every(r => (cost[r] || 0) <= room(bot, r, stepHours));

// le serveur a pris `cost` pour une action dans `city` : on le retire des villes comme lui (utils/db.js planDebit : la ville
// de l'action, puis la plus pleine par rapport à son plafond). Renvoie ce qui a été pris hors de `city` (les autres villes,
// presque toujours les colonies), toutes ressources réunies.
function spend(bot, city, cost) {
  const plan = planDebit(bot.cities, city.id, cost || {});
  let outside = 0;
  for (const [id, taken] of Object.entries(plan.takenByCity)) {
    const c = bot.cities.find(x => x.id === id);
    if (c) for (const r of RES) c[r] -= taken[r];
    if (id !== city.id) outside += RES.reduce((t, r) => t + taken[r], 0);
  }
  return outside;
}
// le serveur a rendu `gain` (offre retirée ou expirée) : la ville `city` jusqu'à son plafond, puis les autres selon la place
// (utils/db.js planCredit) ; renvoie ce qui n'a tenu nulle part, toutes ressources réunies
function credit(bot, city, gain) {
  const { lost } = planCredit(bot.cities, city.id, gain || {});
  return RES.reduce((t, r) => t + (lost[r] || 0), 0);
}
// ce qu'une armée qui part de `city` (la capitale) peut emporter : le stock commun de toutes les villes, vu comme une seule
// ville (stocks et plafonds réunis, comme lockPlayerCities du serveur ; le chantier d'une Ville Merveille n'en fait pas
// partie) ; id, case et bâtiments de la ville de départ
function pool(bot, city = bot.capital) {
  const t = stockTotals(bot.cities);
  return { ...t, id: city?.id, x: city?.x, y: city?.y, isCapital: !!city?.isCapital, buildings: city?.buildings || [] };
}

module.exports = { RES, buildCost, recruitCost, totals, foodBalance, canPay, room, fits, spend, credit, pool };
