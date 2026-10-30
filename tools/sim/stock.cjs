// Simulation longue — stock partagé entre les villes d'un joueur (décision du 30 octobre 2026, § 1 bis) : constructions,
// recrutements, recherche, soins, héros et fondation se paient sur la somme des stocks de ses villes (la ville de
// l'action d'abord, puis la plus riche) ; l'entretien puise dans tous ses greniers. Marché, transports, convois, pillage
// et raids restent propres à chaque ville : les modules y lisent la ville seule.
// Les modules tiennent le compte entre deux lectures de GET /api/cities avec la répartition du serveur (utils/db.js).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { RESOURCES: RES, planDebit, stockTotals } = require(path.join(ROOT, 'src/utils/db'));
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

// le serveur a pris `cost` pour une action dans `city` : on le retire des villes comme lui
function spend(bot, city, cost) {
  const plan = planDebit(bot.cities, city.id, cost || {});
  for (const [id, taken] of Object.entries(plan.takenByCity)) {
    const c = bot.cities.find(x => x.id === id);
    if (c) for (const r of RES) c[r] -= taken[r];
  }
}

module.exports = { RES, buildCost, recruitCost, totals, foodBalance, canPay, room, fits, spend };
