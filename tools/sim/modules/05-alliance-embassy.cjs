// Simulation longue — alliance, avant l'économie : le joueur qui attend de fonder ou de rejoindre son alliance lance
// d'abord le niveau suivant de son Ambassade (le module d'économie, qui passe ensuite, remplit la file de construction à
// chaque connexion). Même nom que le module d'alliance (20-alliance.cjs) : les deux fichiers vont ensemble.
'use strict';
const alliance = require('./20-alliance.cjs');

module.exports = {
  name: 'alliance',
  act: (bot, ctx) => alliance.embassyFirst(bot, ctx)
};
