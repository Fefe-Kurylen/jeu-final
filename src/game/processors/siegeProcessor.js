// ========== SIÈGES ==========
// Une attaque arrivée ne se règle plus d'un coup : l'armée campe devant la ville (statut BESIEGING), ses engins abattent
// le mur au fil du temps, puis l'assaut est donné (Army.arrivalAt = heure de l'assaut, Army.departedAt = début du siège).
// Pendant le siège, la ville ne produit plus, ne recrute plus, ne soigne plus et ne reçoit ni convoi ni renfort ;
// le défenseur et ses alliés peuvent attaquer l'armée qui assiège pour lever le siège (mission BREAK_SIEGE).

const prisma = require('../../config/database');
const config = require('../../config');
const { unitsData, factionsData } = require('../../config/gamedata');
const { getFactionBonus } = require('../../utils/calculations');
// Durée maximale d'un siège contre une ville de cette civilisation : 3 h, allongée du bonus de PV du mur (Égypte 3 h 45)
const maxSiegeMs = (defenderFaction) => S().maxHours * 3600000 * (1 + (getFactionBonus(defenderFaction, 'wallHealth', factionsData) || 0) / 100);
const { lockCity } = require('../../utils/db');

const S = () => config.combat.siege;
const engineCount = (units) => (units || []).reduce((n, u) => n + (unitsData.find(x => x.key === u.unitKey)?.class === 'SIEGE' ? u.count : 0), 0);

// PV de mur abattus par heure par une armée qui assiège (bonus de faction des engins compris)
function wallDamagePerHour(army) {
  return engineCount(army.units) * S().wallDamagePerEngineHour * (1 + (getFactionBonus(army.owner?.faction, 'siegeEngineAttack', factionsData) || 0) / 100);
}

// PV du mur à abattre : une ville sans Mur n'a rien à percer
const wallLevelOf = (buildings) => (buildings || []).find(b => b.key === 'WALL')?.level || 0;
const wallHpToBreak = (city) => (wallLevelOf(city.buildings) > 0 ? Math.max(0, city.wallHp) : 0);

// Heure de l'assaut, donné tout seul : à la brèche, jamais avant minAssaultMinutes, au plus tard 3 h après le début du siège
// (3 h 45 contre un mur égyptien)
function assaultTime(startedAt, wallHp, ratePerHour, now, defenderFaction = null) {
  const start = new Date(startedAt).getTime();
  const earliest = start + S().minAssaultMinutes * 60000, latest = start + maxSiegeMs(defenderFaction);
  const breach = wallHp <= 0 ? now.getTime() : ratePerHour > 0 ? now.getTime() + (wallHp / ratePerHour) * 3600000 : Infinity;   // no wall left: nothing to wait for
  return new Date(Math.max(earliest, Math.min(latest, breach)));
}
const earliestAssault = (startedAt) => new Date(new Date(startedAt).getTime() + S().minAssaultMinutes * 60000);

// La case « ville assiégée » suit les armées qui campent devant elle
async function refreshSiegeFlag(db, cityId) {
  await db.$executeRaw`UPDATE "City" c SET "isSieged" = EXISTS (SELECT 1 FROM "Army" a WHERE a."targetCityId" = c.id AND a.status = 'BESIEGING') WHERE c.id = ${cityId}`;
}
async function syncSiegeFlags() {
  await prisma.$executeRaw`UPDATE "City" c SET "isSieged" = true WHERE c."isSieged" = false AND EXISTS (SELECT 1 FROM "Army" a WHERE a."targetCityId" = c.id AND a.status = 'BESIEGING')`;
  await prisma.$executeRaw`UPDATE "City" c SET "isSieged" = false WHERE c."isSieged" = true AND NOT EXISTS (SELECT 1 FROM "Army" a WHERE a."targetCityId" = c.id AND a.status = 'BESIEGING')`;
}

// À chaque tick : les engins de toutes les armées qui assiègent une ville abattent son mur pendant le temps écoulé,
// puis l'heure de l'assaut de chacune est recalculée (des engins perdus dans une sortie retardent la brèche).
async function processSieges(now, hours) {
  const besiegers = await prisma.army.findMany({ where: { status: 'BESIEGING', claimedAt: null }, include: { units: true, hero: { include: { items: true } }, owner: { include: { technologies: true } }, city: true } });
  const byCity = new Map();
  for (const a of besiegers) { if (!byCity.has(a.targetCityId)) byCity.set(a.targetCityId, []); byCity.get(a.targetCityId).push(a); }
  for (let [cityId, armies] of byCity) {
    if (!cityId) continue;
    try {
      await prisma.$transaction(async (tx) => {
        await lockCity(tx, cityId);
        const city = await tx.city.findUnique({ where: { id: cityId }, select: { id: true, wallHp: true, player: { select: { faction: true } }, buildings: { where: { key: 'WALL' }, select: { key: true, level: true } } } });
        if (!city) return;   // ville disparue : l'assaut renverra les armées chez elles (cible introuvable)
        // no siege without engines: a camp whose engines were all destroyed goes home
        const { sendArmyHomeTx } = require('../../services/armyService');
        for (const a of armies.filter(x => engineCount(x.units) === 0)) await sendArmyHomeTx(tx, a);
        armies = armies.filter(x => engineCount(x.units) > 0);
        if (!armies.length) { await refreshSiegeFlag(tx, cityId); return; }
        const rate = armies.reduce((t, a) => t + wallDamagePerHour(a), 0);
        // chaque armée ne frappe que depuis son arrivée (une armée arrivée en cours de tick ne compte pas le tick entier)
        const damage = armies.reduce((t, a) => t + wallDamagePerHour(a) * Math.min(hours, Math.max(0, (now - new Date(a.departedAt || now)) / 3600000)), 0);
        const hp = Math.max(0, wallHpToBreak(city) - damage);
        if (wallLevelOf(city.buildings) > 0) await tx.city.update({ where: { id: cityId }, data: { wallHp: hp, isSieged: true } });
        else await tx.city.update({ where: { id: cityId }, data: { isSieged: true } });
        for (const a of armies) {
          if (a.missionType === 'ASSAULT') continue;   // assaut demandé par l'attaquant : son heure est déjà fixée
          await tx.army.updateMany({ where: { id: a.id, status: 'BESIEGING', claimedAt: null, missionType: { not: 'ASSAULT' } }, data: { arrivalAt: assaultTime(a.departedAt || now, hp, rate, now, city.player?.faction) } });
        }
      });
    } catch (e) { console.error(`[SIEGE] ${cityId}:`, e.message); }
  }
  await syncSiegeFlags();
}

module.exports = { processSieges, refreshSiegeFlag, syncSiegeFlags, wallDamagePerHour, wallHpToBreak, wallLevelOf, assaultTime, earliestAssault, engineCount };
