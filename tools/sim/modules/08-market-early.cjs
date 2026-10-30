// Simulation longue — marché, début du tour (avant l'économie, 10-economy.cjs, qui remplit la file de construction) :
// un joueur qui a un Marché mais dont toutes les places de la Place de rassemblement sont prises par ses armées de
// campagne la monte d'un niveau, jusqu'à l'emplacement suivant (niveau 10 : 3 armées, 15 : 4), pour y former sa
// caravane. Même nom que 40-market.cjs : les deux fichiers se chargent ensemble (--modules=...,market).
'use strict';
const market = require('./40-market.cjs');

module.exports = {
  name: 'market',
  act: (bot, ctx) => market.early(bot, ctx)
};
