// ============================================================
// Blessés et Tente de soins (décision du 30 octobre 2026, rapport économie, recommandation 6)
// - Une seule Tente de soins, dans la capitale : les blessés de toutes les villes du joueur y passent (lits et vitesse de
//   la tente de la capitale, Thermes romains de la capitale compris). Chaque blessé reste rattaché à sa ville : guéri, il
//   rejoint la garnison de cette ville.
// - Un blessé arrive en attente (colonne `waiting`) : il n'est pas soigné et mange comme un soldat (config.wounded.woundedPayUpkeep).
// - Le joueur lance le soin : il paie healCostPct (30) % du recrutement de l'unité, sur le stock de toutes ses villes ; les
//   blessés prennent un lit (bedsPerLevel par niveau de tente, pour tout le joueur) et guérissent l'un après l'autre :
//   healTimePctOfTraining (10) % du temps de formation de base par unité × healLevelReduction^(tente − 1), après les soins
//   déjà en cours. Colonne `count` : blessés au lit, guéris à `healsAt`.
// - Soin immédiat des blessés au lit : instantHealGoldPerTier or par unité (1 / 2 / 3 / 3 selon le palier).
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { getFactionBonus, recruitCostFor, baseTrainSecondsFor } = require('../utils/calculations');
const { capitalBuildingsOf, debitPlayer, missingMessage } = require('../utils/db');
const { httpError } = require('../utils/httpError');
const fx = require('../utils/buildingEffects');

const W = config.wounded;
const NO_HEAL = new Date('9999-01-01T00:00:00Z');   // échéance d'une ligne sans personne au lit
const unitOf = (key) => unitsData.find(u => u.key === key);
const tentLevelOf = (buildings) => fx.levelOf(buildings, 'HEALING_TENT');

// ---- formules (pures) ; `buildings` : les bâtiments de la capitale ----
const bedsFor = (buildings) => tentLevelOf(buildings) * W.bedsPerLevel;
const healCostFor = (unit, count) => Object.fromEntries(Object.entries(recruitCostFor(unit, count)).map(([r, v]) => [r, Math.ceil(v * W.healCostPct / 100)]));
function healSecondsPerUnit(unit, buildings) {
  const tent = Math.max(1, tentLevelOf(buildings));
  return baseTrainSecondsFor(unit) * W.healTimePctOfTraining / 100 * Math.pow(W.healLevelReduction, tent - 1) * (1 - fx.healTimeReductionPct(buildings) / 100);
}
const healSecondsFor = (unit, count, buildings) => Math.max(1, Math.ceil(count * healSecondsPerUnit(unit, buildings)));
// Fin d'un soin lancé à `now` : les soins se suivent, il commence quand ceux déjà au lit sont finis (`busyUntil`)
const healEndsAt = (busyUntil, unit, count, buildings, now = Date.now()) => new Date(Math.max(now, busyUntil) + healSecondsFor(unit, count, buildings) * 1000);
const instantHealGold = (unit, count) => count * (W.instantHealGoldPerTier[unit?.tier] ?? W.instantHealGoldPerTier.base);
// Part des pertes qui reviennent blessées : tente de la capitale, civilisation, Médecine, Thermes / Temple / Tente de guerre
function woundedRate(buildings, faction, techBonusPct = 0) {
  const rate = W.baseRate + tentLevelOf(buildings) * W.bonusPerHealingLevel + getFactionBonus(faction, 'woundedConversion', factionsData) / 100
    + (Number(techBonusPct) || 0) / 100 + fx.woundedBonusPct(buildings) / 100;
  return Math.min(W.maxRate, rate);
}

// Bâtiments de la capitale du joueur à qui appartient la ville
async function capitalBuildingsOfCity(db, cityId) {
  const capital = await db.city.findFirst({ where: { isCapital: true, player: { cities: { some: { id: cityId } } } }, select: { buildings: { select: { key: true, level: true } } } });
  return capital?.buildings || [];
}

// Blessés d'un combat (sans Tente de soins dans la capitale : aucun) ; techBonusPct : Médecine du joueur, en points de %
async function calculateWoundedUnits(cityId, killedUnits, faction, techBonusPct = 0) {
  const buildings = await capitalBuildingsOfCity(prisma, cityId);
  if (!tentLevelOf(buildings)) return [];
  const rate = woundedRate(buildings, faction, techBonusPct);
  return (killedUnits || []).map(u => ({ unitKey: u.key, count: Math.floor((u.killed || 0) * rate) })).filter(w => w.count > 0);
}

// Blessés d'une armée hors de sa ville (attaque, tribu, combat sur un point) : ils rentrent avec elle et n'arrivent chez
// les blessés qu'au retour (depositCarriedWounded). Une armée sans survivant ne ramène personne : ses blessés sont perdus.
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

// Nouveaux blessés d'une ville : ils attendent que le joueur lance leur soin
async function addWoundedUnits(cityId, woundedUnits, db = prisma) {
  for (const w of woundedUnits || []) {
    if (!(w.count > 0)) continue;
    await db.woundedUnit.upsert({
      where: { cityId_unitKey: { cityId, unitKey: w.unitKey } },
      update: { waiting: { increment: w.count } },
      create: { cityId, unitKey: w.unitKey, count: 0, waiting: w.count, healsAt: NO_HEAL }
    });
  }
}

// État de la tente du joueur : bâtiments de la capitale, lits, blessés au lit, fin des soins en cours
async function tentState(db, playerId) {
  const buildings = await capitalBuildingsOf(db, playerId);
  const healing = await db.woundedUnit.findMany({ where: { city: { playerId }, count: { gt: 0 } }, select: { count: true, healsAt: true } });
  const beds = bedsFor(buildings), inBeds = healing.reduce((s, w) => s + w.count, 0);
  return { buildings, beds, inBeds, free: Math.max(0, beds - inBeds), busyUntil: Math.max(0, ...healing.map(w => new Date(w.healsAt).getTime())) };
}

// Blessés de toutes les villes du joueur, avec ce que coûte le soin de ceux qui attendent (autant que de lits libres) et
// dans combien de secondes ils seraient guéris (healSeconds : après les soins déjà en cours)
async function woundedView(playerId) {
  const [rows, tent] = await Promise.all([
    prisma.woundedUnit.findMany({ where: { city: { playerId } }, include: { city: { select: { name: true } } }, orderBy: { id: 'asc' } }),
    tentState(prisma, playerId)
  ]);
  const now = Date.now();
  return rows.map(({ city, ...w }) => {
    const unit = unitOf(w.unitKey), n = Math.min(w.waiting, tent.free);
    return {
      ...w, cityName: city?.name, unitName: unit?.name || w.unitKey, faction: unit?.faction, class: unit?.class, tier: unit?.tier,
      timeToHeal: w.count > 0 ? Math.max(0, new Date(w.healsAt).getTime() - now) : null,
      healable: n, healCost: n > 0 ? healCostFor(unit, n) : null,
      healSeconds: n > 0 ? Math.ceil((healEndsAt(tent.busyUntil, unit, n, tent.buildings, now) - now) / 1000) : null,
      instantGold: w.count > 0 ? instantHealGold(unit, w.count) : 0
    };
  });
}

// Lance le soin de `wanted` blessés (tous ceux qui attendent si absent) d'un type dans une ville : paiement sur toutes les
// villes (la capitale d'abord, la tente y est), lits du joueur, fin après les soins en cours. `cities` : lockPlayerCities.
async function startHealing(tx, playerId, cityId, unitKey, wanted, cities) {
  const unit = unitOf(unitKey);
  const row = unit ? await tx.woundedUnit.findFirst({ where: { cityId, unitKey } }) : null;
  if (!row || row.waiting <= 0) throw httpError(404, 'Aucun blessé de ce type n\'attend de soin');
  const tent = await tentState(tx, playerId);
  if (tent.beds <= 0) throw httpError(400, 'Construisez la Tente de soins dans votre capitale pour soigner vos blessés');
  if (tent.free <= 0) throw httpError(400, `Les ${tent.beds} lits de la Tente de soins sont occupés : attendez la fin des soins en cours`);
  const n = Math.min(row.waiting, tent.free, wanted > 0 ? wanted : row.waiting);
  const cost = healCostFor(unit, n);
  const paid = await debitPlayer(tx, playerId, cities.find(c => c.isCapital)?.id || cityId, cost, cities);
  if (!paid.ok) throw httpError(400, missingMessage(paid));
  // les soins se suivent : ces blessés guérissent après ceux déjà au lit (leur ligne comprise)
  const healsAt = healEndsAt(tent.busyUntil, unit, n, tent.buildings);
  await tx.woundedUnit.update({ where: { id: row.id }, data: { count: { increment: n }, waiting: { decrement: n }, healsAt } });
  return { started: n, cost, healsAt };
}

// Guéris : ils rejoignent la garnison de leur ville (chaque ville en a une depuis sa fondation)
async function toGarrison(db, garrisonId, unitKey, count) {
  if (!garrisonId) return;
  await db.armyUnit.upsert({
    where: { armyId_unitKey: { armyId: garrisonId, unitKey } },
    update: { count: { increment: count } },
    create: { armyId: garrisonId, unitKey, tier: unitOf(unitKey)?.tier || 'base', count }
  });
}

// Les blessés au lit d'une ligne quittent la tente : la ligne est prise sous condition (même nombre au lit, même échéance),
// un second exécutant ne compte rien ; elle disparaît s'il n'y a plus personne en attente. Renvoie false si elle a changé.
async function takeBeds(tx, row) {
  const taken = await tx.woundedUnit.updateMany({ where: { id: row.id, count: row.count, healsAt: row.healsAt }, data: { count: 0, healsAt: NO_HEAL } });
  if (taken.count !== 1) return false;
  await tx.woundedUnit.deleteMany({ where: { id: row.id, waiting: 0 } });
  return true;
}

// Soin immédiat, à l'or, des blessés au lit d'un type dans une ville
async function healNow(tx, playerId, cityId, unitKey) {
  const row = await tx.woundedUnit.findFirst({ where: { cityId, unitKey } });
  if (!row) throw httpError(404, 'Pas de blessés de ce type');
  if (row.count <= 0) throw httpError(400, 'Seuls les blessés au lit se soignent à l\'or : lancez d\'abord leur soin');
  const gold = instantHealGold(unitOf(unitKey), row.count);
  const paid = await tx.player.updateMany({ where: { id: playerId, gold: { gte: gold } }, data: { gold: { decrement: gold } } });
  if (paid.count !== 1) throw httpError(400, `Pas assez d'or (${gold} requis)`);
  if (!(await takeBeds(tx, row))) throw httpError(409, 'Ces blessés viennent de guérir');
  await toGarrison(tx, (await tx.army.findFirst({ where: { cityId, isGarrison: true }, select: { id: true } }))?.id, unitKey, row.count);
  return { healed: row.count, goldSpent: gold };
}

// Tick : soins terminés, les guéris rejoignent la garnison de leur ville ; ceux qui attendent encore gardent la ligne
async function processHealedUnits(now = new Date()) {
  const due = await prisma.woundedUnit.findMany({ where: { healsAt: { lte: now }, count: { gt: 0 } }, take: 500 });
  if (!due.length) return 0;
  const garrisons = await prisma.army.findMany({ where: { cityId: { in: [...new Set(due.map(w => w.cityId))] }, isGarrison: true }, select: { id: true, cityId: true } });
  const garrisonOf = new Map(garrisons.map(g => [g.cityId, g.id]));
  let healed = 0;
  for (let i = 0; i < due.length; i += 50) {
    const batch = due.slice(i, i + 50);
    await prisma.$transaction(async (tx) => {
      for (const w of batch) {
        if (!(await takeBeds(tx, w))) continue;
        healed++;
        await toGarrison(tx, garrisonOf.get(w.cityId), w.unitKey, w.count);
      }
    }, { timeout: 15000 });
  }
  return healed;
}

module.exports = {
  calculateWoundedUnits, addWoundedUnits, carryWounded, depositCarriedWounded, processHealedUnits, woundedView, startHealing, healNow,
  bedsFor, healCostFor, healSecondsPerUnit, healSecondsFor, healEndsAt, instantHealGold, woundedRate, NO_HEAL
};
