// Départ d'un joueur dans le monde : capitale au bord de la carte, Bâtiment principal, héros, garnison, 3 expéditions.
// Sert à l'inscription et à « Rejoindre le nouveau monde » (décision du 28 octobre 2026). À appeler sous lockPlacement(tx).
// side : côté de la carte choisi ('N', 'E', 'S', 'W' ou 'RANDOM', décision du 31 octobre 2026), les autres s'il est plein.
const { findFreeSpawn, gatherArmiesOnBlock } = require('../utils/spawn');
const { createExpedition } = require('./expeditionService');

async function createStart(tx, { playerId, name, side = 'RANDOM' }) {
  const { x, y } = await findFreeSpawn({ db: tx, side });
  await tx.playerStats.upsert({ where: { playerId }, update: {}, create: { playerId } });
  const city = await tx.city.create({ data: { playerId, name: `Capitale de ${name}`, x, y, isCapital: true, wood: 500, stone: 500, iron: 500, food: 500 } });
  await gatherArmiesOnBlock(tx, x, y);
  await tx.cityBuilding.create({ data: { cityId: city.id, key: 'MAIN_HALL', slot: 0, level: 1 } });
  const hero = await tx.hero.create({ data: { playerId, name: `Heros de ${name}`, statPoints: 5 } });
  await tx.army.create({ data: { ownerId: playerId, cityId: city.id, heroId: hero.id, name: 'Garnison', x, y, status: 'IDLE', isGarrison: true } });
  await tx.hero.update({ where: { id: hero.id }, data: { cityId: city.id } });
  for (let i = 0; i < 3; i++) await createExpedition(playerId, tx);
  return city;
}

module.exports = { createStart };
