// Simulation longue — Merveille, début du tour (avant les invasions, 29-invasion-early.cjs, et avant le module militaire,
// 30-military.cjs, qui envoie ses armées au repos en mission) : le fondateur de l'alliance envoie son colon et l'escorte
// gardée à la maison sur le site que l'alliance vient de libérer (simulation sim-d : site libéré 9 fois avant la fondation,
// l'escorte toujours partie) ; une fois la Ville Merveille fondée, chaque membre poste d'abord sa part de la défense contre
// les vagues d'Immortels (simulation sim-e : la garnison seule, ce qui restait après le départ des armées de campagne, ne
// donnait que 1 à 2 % des soldats de l'alliance). Même nom que 70-wonder.cjs : les deux fichiers se chargent ensemble
// (--modules=...,wonder).
'use strict';
const wonder = require('./70-wonder.cjs');

module.exports = {
  name: 'wonder',
  act: (bot, ctx) => wonder.early(bot, ctx)
};
