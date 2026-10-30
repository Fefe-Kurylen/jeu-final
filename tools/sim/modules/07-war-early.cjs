// Simulation longue — guerre, début du tour (avant l'économie, 10-economy.cjs, qui remplit la file de construction) : un
// guerrier de A ou de B monte l'Atelier de sa capitale jusqu'au niveau 5, où se forment les engins de siège. Même nom que
// 50-war.cjs : les deux fichiers se chargent ensemble (--modules=...,war).
'use strict';
const war = require('./50-war.cjs');

module.exports = {
  name: 'war',
  act: (bot, ctx) => war.early(bot, ctx)
};
