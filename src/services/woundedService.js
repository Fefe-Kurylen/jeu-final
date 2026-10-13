const prisma = require('../config/database');
const config = require('../config');
const { unitsData } = require('../config/gamedata');
const { getFactionBonus } = require('../utils/calculations');
const { factionsData } = require('../config/gamedata');

async function calculateWoundedUnits(cityId, killedUnits, faction) {
  const healingTent = await prisma.cityBuilding.findFirst({
    where: { cityId, key: 'HEALING_TENT' }
  });
  if (!healingTent) return [];

  let woundedRate = config.wounded.baseRate + (healingTent.level * config.wounded.bonusPerHealingLevel);
  const greekBonus = getFactionBonus(faction, 'woundedConversion', factionsData);
  woundedRate += greekBonus / 100;
  woundedRate = Math.min(config.wounded.maxRate, woundedRate);

  const woundedUnits = [];
  for (const unit of killedUnits) {
    if (unit.killed > 0) {
      const wounded = Math.floor(unit.killed * woundedRate);
      if (wounded > 0) {
        woundedUnits.push({ unitKey: unit.key, count: wounded });
      }
    }
  }
  return woundedUnits;
}

async function addWoundedUnits(cityId, woundedUnits) {
  if (!woundedUnits || woundedUnits.length === 0) return;

  const healingTent = await prisma.cityBuilding.findFirst({
    where: { cityId, key: 'HEALING_TENT' }
  });

  const healingLevel = healingTent?.level || 1;
  const baseHealTimeMinutes = config.wounded.baseHealMinutes * Math.pow(config.wounded.healLevelReduction, healingLevel - 1);

  for (const unit of woundedUnits) {
    const healsAt = new Date(Date.now() + baseHealTimeMinutes * 60 * 1000);
    const existing = await prisma.woundedUnit.findUnique({
      where: { cityId_unitKey: { cityId, unitKey: unit.unitKey } }
    });

    if (existing) {
      await prisma.woundedUnit.update({
        where: { id: existing.id },
        data: {
          count: existing.count + unit.count,
          healsAt: new Date(Math.max(existing.healsAt.getTime(), healsAt.getTime()))
        }
      });
    } else {
      await prisma.woundedUnit.create({
        data: { cityId, unitKey: unit.unitKey, count: unit.count, healsAt }
      });
    }
  }
}

async function processHealedUnits() {
  const now = new Date();
  const healedUnits = await prisma.woundedUnit.findMany({
    where: { healsAt: { lte: now } }
  });

  for (const wounded of healedUnits) {
    const garrison = await prisma.army.findFirst({
      where: { cityId: wounded.cityId, isGarrison: true },
      include: { units: true }
    });

    if (garrison) {
      const existingUnit = garrison.units.find(u => u.unitKey === wounded.unitKey);
      if (existingUnit) {
        await prisma.armyUnit.update({
          where: { id: existingUnit.id },
          data: { count: existingUnit.count + wounded.count }
        });
      } else {
        const unitDef = unitsData.find(u => u.key === wounded.unitKey);
        await prisma.armyUnit.create({
          data: {
            armyId: garrison.id, unitKey: wounded.unitKey,
            tier: unitDef?.tier || 'base', count: wounded.count
          }
        });
      }
      console.log(`[HEAL] ${wounded.count} ${wounded.unitKey} healed in city ${wounded.cityId}`);
    }
    await prisma.woundedUnit.delete({ where: { id: wounded.id } });
  }
  return healedUnits.length;
}

module.exports = { calculateWoundedUnits, addWoundedUnits, processHealedUnits };
