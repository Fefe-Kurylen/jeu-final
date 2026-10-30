// Simulation longue — invasions, début du tour (après le héros, avant le module militaire, 30-military.cjs, qui envoie ses
// armées au repos en récolte) : pendant une invasion barbare, le membre d'alliance rejoint ou lance un rassemblement contre un
// donjon avec son armée libre. Même nom que 60-invasion.cjs : les deux fichiers se chargent ensemble (--modules=...,invasion).
'use strict';
const invasion = require('./60-invasion.cjs');

module.exports = {
  name: 'invasion',
  act: (bot, ctx) => invasion.early(bot, ctx)
};
