// Simulation longue — marché, début du tour (avant l'économie, 10-economy.cjs, qui remplit la file de construction) :
// un joueur à qui des marchands ont manqué il y a peu (offre, échange ou envoi remis faute de marchands libres) monte le
// Marché de sa capitale d'un niveau, donc d'un marchand (décision du 31 octobre 2026). Même nom que 40-market.cjs : les deux
// fichiers se chargent ensemble (--modules=...,market).
'use strict';
const market = require('./40-market.cjs');

module.exports = {
  name: 'market',
  act: (bot, ctx) => market.early(bot, ctx)
};
