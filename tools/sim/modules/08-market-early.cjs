// Simulation longue — marché, début du tour (avant l'économie, 10-economy.cjs, et avant le module militaire qui prend la
// garnison pour son armée de campagne) : la « Caravane », l'armée qui porte les échanges entre joueurs (décision du
// 31 octobre 2026 : plus de marchands, les échanges et les envois partent avec des armées), se forme sur un emplacement libre
// de la Place de rassemblement et prend des porteurs dans la garnison. Même nom que 40-market.cjs : les deux fichiers se
// chargent ensemble (--modules=...,market).
'use strict';
const market = require('./40-market.cjs');

module.exports = {
  name: 'market',
  act: (bot, ctx) => market.early(bot, ctx)
};
