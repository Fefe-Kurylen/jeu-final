// Simulation longue — militaire, début du tour (avant l'économie, 10-economy.cjs) : Résidence, colons et fondation des villes
// secondaires. Un joueur qui prépare une colonie envoie son colon dès qu'il se connecte, avant de dépenser son stock en
// constructions (la fondation prend 3 000 de chaque ressource dans la capitale). Même nom que 30-military.cjs : les deux
// parties se chargent ensemble (--modules=...,military) et partagent leur état (bot.mem.mil).
'use strict';
const military = require('./30-military.cjs');

module.exports = {
  name: 'military',
  act: (bot, ctx) => military.early(bot, ctx)
};
