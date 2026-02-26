// ========== RESOURCE PRODUCTION & UPKEEP ==========

const prisma = require('../../config/database');
const config = require('../../config');
const { unitsData, buildingsData } = require('../../config/gamedata');
const { getProductionAtLevel } = require('../../utils/calculations');

async function processResourceProduction(TICK_HOURS) {
  const cities = await prisma.city.findMany({ where: { isSieged: false }, include: { buildings: true } });
  const cityUpdates = cities.map(city => {
    let wood = 5, stone = 5, iron = 5, food = 10;
    for (const b of city.buildings) {
      if (b.key === 'LUMBER') wood += getProductionAtLevel('LUMBER', b.level, buildingsData);
      else if (b.key === 'QUARRY') stone += getProductionAtLevel('QUARRY', b.level, buildingsData);
      else if (b.key === 'IRON_MINE') iron += getProductionAtLevel('IRON_MINE', b.level, buildingsData);
      else if (b.key === 'FARM') food += getProductionAtLevel('FARM', b.level, buildingsData);
    }
    return prisma.city.update({
      where: { id: city.id },
      data: {
        wood: Math.min(city.wood + wood * TICK_HOURS, city.maxStorage),
        stone: Math.min(city.stone + stone * TICK_HOURS, city.maxStorage),
        iron: Math.min(city.iron + iron * TICK_HOURS, city.maxStorage),
        food: Math.min(city.food + food * TICK_HOURS, city.maxFoodStorage)
      }
    });
  });
  await Promise.all(cityUpdates);
}

async function processUpkeep(TICK_HOURS) {
  const allArmies = await prisma.army.findMany({ where: { cityId: { not: null } }, include: { units: true } });
  const armiesByCity = {};
  for (const army of allArmies) {
    if (!army.cityId) continue;
    if (!armiesByCity[army.cityId]) armiesByCity[army.cityId] = [];
    armiesByCity[army.cityId].push(army);
  }
  for (const [cityId, cityArmies] of Object.entries(armiesByCity)) {
    let totalFoodConsumption = 0;
    for (const army of cityArmies) {
      for (const unit of army.units) {
        const unitDef = unitsData.find(u => u.key === unit.unitKey);
        const upkeep = config.army.upkeepPerTier[unitDef?.tier] || config.army.upkeepPerTier.base;
        totalFoodConsumption += unit.count * upkeep;
      }
    }
    const consumption = totalFoodConsumption * TICK_HOURS;
    if (consumption > 0) {
      const city = await prisma.city.findUnique({ where: { id: cityId } });
      if (city) {
        const newFood = Math.max(0, city.food - consumption);
        await prisma.city.update({ where: { id: cityId }, data: { food: newFood } });
        if (newFood <= 0) {
          for (const army of cityArmies) {
            for (const unit of army.units) {
              const losses = Math.ceil(unit.count * config.army.starvationLossRate);
              if (losses > 0) {
                const remaining = Math.max(0, unit.count - losses);
                if (remaining > 0) { await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: remaining } }); }
                else { await prisma.armyUnit.delete({ where: { id: unit.id } }); }
                console.log(`[STARVATION] ${losses}x ${unit.unitKey} morts de faim!`);
              }
            }
          }
        }
      }
    }
  }
}

async function processResourceRegen(now, TICK_HOURS) {
  const regenCutoff = new Date(now.getTime() - config.tick.regenDelayMinutes * 60000);
  const regenResult = await prisma.$executeRaw`
    UPDATE "ResourceNode" SET amount = LEAST(amount + FLOOR("regenRate" / 2.0 * ${TICK_HOURS}), "maxAmount")
    WHERE amount < "maxAmount" AND "hasPlayerArmy" = false
      AND ("lastArmyDeparture" IS NULL OR "lastArmyDeparture" <= ${regenCutoff})
  `;
  if (regenResult > 0) console.log(`[REGEN] ${regenResult} resource nodes regenerated`);
}

module.exports = { processResourceProduction, processUpkeep, processResourceRegen };
