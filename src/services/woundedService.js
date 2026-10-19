const prisma = require('../config/database');
const config = require('../config');
const { unitsData } = require('../config/gamedata');
const { getFactionBonus } = require('../utils/calculations');
const { factionsData } = require('../config/gamedata');
const fx = require('../utils/buildingEffects');

// techBonusPct: the player's Medicine research, in percent points
async function calculateWoundedUnits(cityId, killedUnits, faction, techBonusPct = 0) {
  const buildings = await prisma.cityBuilding.findMany({ where: { cityId }, select: { key: true, level: true } });
  const healingTent = buildings.find(b => b.key === 'HEALING_TENT');
  if (!healingTent) return [];

  let woundedRate = config.wounded.baseRate + (healingTent.level * config.wounded.bonusPerHealingLevel);
  const greekBonus = getFactionBonus(faction, 'woundedConversion', factionsData);
  woundedRate += greekBonus / 100;
  woundedRate += (Number(techBonusPct) || 0) / 100;   // Médecine (technologie)
  woundedRate += fx.woundedBonusPct(buildings) / 100;   // Thermes romains, Temple grec, Tente de guerre hun
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

// Blessés d'une armée hors de sa ville (attaque, tribu, combat sur un point) : ils rentrent avec elle et n'entrent à la
// Tente de soins qu'au retour (depositCarriedWounded). Une armée sans survivant ne ramène personne : ses blessés sont perdus.
async function carryWounded(db, armyId, woundedUnits) {
  if (!woundedUnits || !woundedUnits.length) return 0;
  const left = await db.armyUnit.aggregate({ where: { armyId }, _sum: { count: true } });
  if (!(left._sum.count > 0)) return 0;
  const army = await db.army.findUnique({ where: { id: armyId }, select: { woundedCarry: true } });
  const merged = Object.fromEntries((Array.isArray(army?.woundedCarry) ? army.woundedCarry : []).map(w => [w.unitKey, w.count]));
  for (const w of woundedUnits) merged[w.unitKey] = (merged[w.unitKey] || 0) + w.count;
  await db.army.update({ where: { id: armyId }, data: { woundedCarry: Object.entries(merged).map(([unitKey, count]) => ({ unitKey, count })) } });
  return woundedUnits.reduce((s, w) => s + w.count, 0);
}
async function depositCarriedWounded(armyId, cityId) {
  const army = await prisma.army.findUnique({ where: { id: armyId }, select: { woundedCarry: true } });
  const carried = (Array.isArray(army?.woundedCarry) ? army.woundedCarry : []).filter(w => w && w.count > 0);
  if (!carried.length) return 0;
  await prisma.army.update({ where: { id: armyId }, data: { woundedCarry: [] } });
  await addWoundedUnits(cityId, carried);
  return carried.reduce((s, w) => s + w.count, 0);
}

async function addWoundedUnits(cityId, woundedUnits) {
  if (!woundedUnits || woundedUnits.length === 0) return;

  const buildings = await prisma.cityBuilding.findMany({ where: { cityId }, select: { key: true, level: true } });
  const healingTent = buildings.find(b => b.key === 'HEALING_TENT');

  const healingLevel = healingTent?.level || 1;
  const baseHealTimeMinutes = config.wounded.baseHealMinutes * Math.pow(config.wounded.healLevelReduction, healingLevel - 1) * (1 - fx.healTimeReductionPct(buildings) / 100);
  const healsAt = new Date(Date.now() + baseHealTimeMinutes * 60 * 1000);

  for (const unit of woundedUnits) {
    // A new batch pushes the healing time of the whole group to its own completion
    await prisma.woundedUnit.upsert({
      where: { cityId_unitKey: { cityId, unitKey: unit.unitKey } },
      update: { count: { increment: unit.count }, healsAt },
      create: { cityId, unitKey: unit.unitKey, count: unit.count, healsAt }
    });
  }
}

// Healed groups go back to their city's garrison, in one transaction for the whole tick
async function processHealedUnits() {
  const now = new Date();
  const healedUnits = await prisma.woundedUnit.findMany({ where: { healsAt: { lte: now } }, take: 500 });
  if (healedUnits.length === 0) return 0;

  const cityIds = [...new Set(healedUnits.map(w => w.cityId))];
  const garrisons = await prisma.army.findMany({ where: { cityId: { in: cityIds }, isGarrison: true }, select: { id: true, cityId: true } });
  const garrisonByCity = new Map(garrisons.map(g => [g.cityId, g.id]));

  let healed = 0;
  for (let i = 0; i < healedUnits.length; i += 50) {
    const batch = healedUnits.slice(i, i + 50);
    await prisma.$transaction(async (tx) => {
      for (const wounded of batch) {
        // The row is consumed first: a second executor finds nothing to delete and credits nothing
        const taken = await tx.woundedUnit.deleteMany({ where: { id: wounded.id, healsAt: wounded.healsAt } });
        if (taken.count !== 1) continue;
        healed++;
        const garrisonId = garrisonByCity.get(wounded.cityId);
        if (!garrisonId) continue;
        const unitDef = unitsData.find(u => u.key === wounded.unitKey);
        await tx.armyUnit.upsert({
          where: { armyId_unitKey: { armyId: garrisonId, unitKey: wounded.unitKey } },
          update: { count: { increment: wounded.count } },
          create: { armyId: garrisonId, unitKey: wounded.unitKey, tier: unitDef?.tier || 'base', count: wounded.count }
        });
      }
    }, { timeout: 15000 });
  }
  return healed;
}

module.exports = { calculateWoundedUnits, addWoundedUnits, processHealedUnits, carryWounded, depositCarriedWounded };
