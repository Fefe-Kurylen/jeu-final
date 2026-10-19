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

// Tente de soins : lits par niveau (config.wounded.bedsPerLevel) ; les blessés au-delà attendent en file (waiting) et
// prennent les lits libérés. Une ligne sans personne au lit garde une échéance lointaine (NO_HEAL).
const NO_HEAL = new Date('9999-01-01T00:00:00Z');
const bedsFor = (buildings) => (buildings.find(b => b.key === 'HEALING_TENT')?.level || 0) * config.wounded.bedsPerLevel;
function healDelayMs(buildings) {
  const healingLevel = buildings.find(b => b.key === 'HEALING_TENT')?.level || 1;
  return config.wounded.baseHealMinutes * Math.pow(config.wounded.healLevelReduction, healingLevel - 1) * (1 - fx.healTimeReductionPct(buildings) / 100) * 60000;
}

async function addWoundedUnits(cityId, woundedUnits, db = prisma) {
  if (!woundedUnits || woundedUnits.length === 0) return;
  const buildings = await db.cityBuilding.findMany({ where: { cityId }, select: { key: true, level: true } });
  const healsAt = new Date(Date.now() + healDelayMs(buildings));
  const inBeds = (await db.woundedUnit.aggregate({ where: { cityId }, _sum: { count: true } }))._sum.count || 0;
  let free = Math.max(0, bedsFor(buildings) - inBeds);
  for (const unit of woundedUnits) {
    const bed = Math.min(free, unit.count), wait = unit.count - bed;
    free -= bed;
    // A new batch in beds pushes the healing time of the whole group to its own completion
    await db.woundedUnit.upsert({
      where: { cityId_unitKey: { cityId, unitKey: unit.unitKey } },
      update: { count: { increment: bed }, waiting: { increment: wait }, ...(bed > 0 ? { healsAt } : {}) },
      create: { cityId, unitKey: unit.unitKey, count: bed, waiting: wait, healsAt: bed > 0 ? healsAt : NO_HEAL }
    });
  }
}

// Fait entrer la file d'attente dans les lits libres (après une guérison ou un soin à l'or)
async function admitWaiting(db, cityId) {
  const buildings = await db.cityBuilding.findMany({ where: { cityId }, select: { key: true, level: true } });
  const rows = await db.woundedUnit.findMany({ where: { cityId }, orderBy: { id: 'asc' } });
  let free = Math.max(0, bedsFor(buildings) - rows.reduce((s, r) => s + r.count, 0));
  const healsAt = new Date(Date.now() + healDelayMs(buildings));
  for (const r of rows) {
    if (free <= 0) break;
    if (r.waiting <= 0) continue;
    const n = Math.min(free, r.waiting); free -= n;
    await db.woundedUnit.update({ where: { id: r.id }, data: { count: { increment: n }, waiting: { decrement: n }, healsAt } });
  }
  await db.woundedUnit.deleteMany({ where: { cityId, count: 0, waiting: 0 } });
}

// Ville assiégée (GDD : soins et recrutement bloqués pendant un siège ; former une armée reste permis) : l'armée attaquante est arrivée
// sur la ville (siège en cours : statut BESIEGING, ou attaque qui vient d'arriver et s'installe). Tant qu'elle marche
// encore vers la ville, celle-ci peut tout faire (décision d'octobre 2026).
async function besiegedCityIds(db, cityIds) {
  if (!cityIds.length) return new Set();
  const attacks = await db.army.findMany({ where: { targetCityId: { in: cityIds }, OR: [{ status: 'BESIEGING' }, { status: 'ATTACKING', missionType: 'ATTACK', arrivalAt: { lte: new Date() } }] }, select: { targetCityId: true } });
  return new Set(attacks.map(a => a.targetCityId));
}

// Pendant un siège, le compte à rebours des soins est en pause : l'échéance des blessés au lit recule du temps écoulé
// depuis le tick précédent ; à la levée du siège, la guérison repart d'elle-même là où elle s'était arrêtée.
let lastHealTick = 0;
async function pauseBesiegedHealing(now) {
  const dt = lastHealTick ? Math.min(now.getTime() - lastHealTick, 10 * 60000) : 0;
  lastHealTick = now.getTime();
  if (dt <= 0) return;
  const rows = await prisma.woundedUnit.findMany({ where: { count: { gt: 0 } }, select: { cityId: true }, distinct: ['cityId'] });
  const besieged = [...(await besiegedCityIds(prisma, rows.map(r => r.cityId)))];
  if (besieged.length) await prisma.$executeRaw`UPDATE "WoundedUnit" SET "healsAt" = "healsAt" + make_interval(secs => ${dt / 1000}) WHERE "cityId" = ANY(${besieged}) AND count > 0`;
}

async function processHealedUnits() {
  const now = new Date();
  try { await pauseBesiegedHealing(now); } catch (e) { console.error('[WOUNDED] siege pause', e.message); }
  const due = await prisma.woundedUnit.findMany({ where: { healsAt: { lte: now } }, take: 500 });
  if (due.length === 0) return 0;
  const besieged = await besiegedCityIds(prisma, [...new Set(due.map(w => w.cityId))]);
  const healedUnits = due.filter(w => !besieged.has(w.cityId));
  if (healedUnits.length === 0) return 0;

  const cityIds = [...new Set(healedUnits.map(w => w.cityId))];
  const garrisons = await prisma.army.findMany({ where: { cityId: { in: cityIds }, isGarrison: true }, select: { id: true, cityId: true } });
  const garrisonByCity = new Map(garrisons.map(g => [g.cityId, g.id]));

  let healed = 0;
  for (let i = 0; i < healedUnits.length; i += 50) {
    const batch = healedUnits.slice(i, i + 50);
    await prisma.$transaction(async (tx) => {
      for (const wounded of batch) {
        // The row is consumed first (conditional on its healing time): a second executor credits nothing; soldiers still
        // waiting for a bed keep the row
        const taken = wounded.waiting > 0
          ? await tx.woundedUnit.updateMany({ where: { id: wounded.id, healsAt: wounded.healsAt }, data: { count: 0, healsAt: NO_HEAL } })
          : await tx.woundedUnit.deleteMany({ where: { id: wounded.id, healsAt: wounded.healsAt } });
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
  // Beds freed: the waiting list moves in
  for (const cityId of cityIds) { try { await admitWaiting(prisma, cityId); } catch (e) { console.error('[WOUNDED] admit', e.message); } }
  return healed;
}

module.exports = { calculateWoundedUnits, addWoundedUnits, processHealedUnits, carryWounded, depositCarriedWounded, admitWaiting, bedsFor, besiegedCityIds };
