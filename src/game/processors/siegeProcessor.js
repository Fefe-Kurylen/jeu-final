// ========== SIÈGES ==========
// Décision du 25 octobre 2026 : une attaque qui arrive campe 1 h devant la ville (statut BESIEGING, Army.departedAt =
// arrivée, Army.arrivalAt = heure du combat), puis le combat démarre tout seul (armyProcessor.handleAttack), le mur
// servant de bouclier. Les camps alliés entre eux combattent ensemble, à l'heure du premier arrivé. Pendant l'heure, la
// ville vit normalement ; n'importe quel joueur peut attaquer le camp (mission BREAK_SIEGE).

const prisma = require('../../config/database');
const config = require('../../config');
const { unitsData } = require('../../config/gamedata');

const S = () => config.combat.siege;
const engineCount = (units) => (units || []).reduce((n, u) => n + (unitsData.find(x => x.key === u.unitKey)?.class === 'SIEGE' ? u.count : 0), 0);
const wallLevelOf = (buildings) => (buildings || []).find(b => b.key === 'WALL')?.level || 0;
// Heure du combat d'un camp installé à `startedAt`
const campEnd = (startedAt) => new Date(new Date(startedAt).getTime() + S().campMinutes * 60000);
// PV du mur au début d'un combat : sa part des vies restantes (une vie perdue ôte la même part des PV)
const wallHpNow = (city) => (wallLevelOf(city.buildings) > 0 ? Math.max(0, (city.wallMaxHp || 0) * Math.max(0, Math.min(1, city.wallStructure ?? 1))) : 0);

// La case « ville assiégée » suit les armées qui campent devant elle
async function refreshSiegeFlag(db, cityId) {
  await db.$executeRaw`UPDATE "City" c SET "isSieged" = EXISTS (SELECT 1 FROM "Army" a WHERE a."targetCityId" = c.id AND a.status = 'BESIEGING') WHERE c.id = ${cityId}`;
}
async function syncSiegeFlags() {
  await prisma.$executeRaw`UPDATE "City" c SET "isSieged" = true WHERE c."isSieged" = false AND EXISTS (SELECT 1 FROM "Army" a WHERE a."targetCityId" = c.id AND a.status = 'BESIEGING')`;
  await prisma.$executeRaw`UPDATE "City" c SET "isSieged" = false WHERE c."isSieged" = true AND NOT EXISTS (SELECT 1 FROM "Army" a WHERE a."targetCityId" = c.id AND a.status = 'BESIEGING')`;
}

// À chaque tick : un camp sans engin (perdus contre une armée qui l'a attaqué) ou devenu allié de la ville rentre chez lui
async function processSieges() {
  const camps = await prisma.army.findMany({ where: { status: 'BESIEGING', claimedAt: null }, include: { units: true, owner: { select: { name: true } } } });
  if (camps.length) {
    const { sendArmyHomeTx } = require('../../services/armyService');
    const { getRelation } = require('../../services/diplomacyService');
    const { notify } = require('../../services/pushService');
    const { lockCity } = require('../../utils/db');
    for (const a of camps) {
      try {
        const gone = await prisma.$transaction(async (tx) => {
          if (!a.targetCityId) return null;
          await lockCity(tx, a.targetCityId);
          const fresh = await tx.army.findFirst({ where: { id: a.id, status: 'BESIEGING', claimedAt: null }, include: { units: true, owner: { include: { technologies: true } }, city: true, hero: { include: { items: true } } } });
          const city = await tx.city.findUnique({ where: { id: a.targetCityId }, select: { id: true, name: true, playerId: true, x: true, y: true } });
          if (!fresh || !city) return null;
          const noEngine = engineCount(fresh.units) < S().minEngines;
          const friend = !(await getRelation(fresh.ownerId, city.playerId, tx)).canAttack;
          if (!noEngine && !friend) return null;
          await sendArmyHomeTx(tx, fresh);
          await refreshSiegeFlag(tx, city.id);
          return { city, reason: noEngine ? 'engins' : 'diplomatie' };
        });
        if (gone) {
          const why = gone.reason === 'engins' ? 'n\'a plus d\'engin de siège' : 'ne peut plus attaquer cette ville (alliance)';
          notify(a.ownerId, 'battle', '🏰 Siège abandonné', `${a.name} ${why} : elle quitte ${gone.city.name} et rentre.`, { to: 'army', armyId: a.id });
          notify(gone.city.playerId, 'battle', '🏰 Camp levé', `L'armée de ${a.owner?.name || 'l\'ennemi'} quitte ${gone.city.name}.`, { to: 'map', x: gone.city.x, y: gone.city.y, cityId: gone.city.id });
        }
      } catch (e) { console.error(`[SIEGE] ${a.id}:`, e.message); }
    }
  }
  await syncSiegeFlags();
}

// A city whose last life is gone must fall even if the fall failed right after the battle (error, restart): its lives
// stay at 0 (no regeneration) until the fall is done
async function retryPendingFalls() {
  const pending = await prisma.city.findMany({ where: { wallStructure: { lte: 0 } }, select: { id: true, name: true } });
  if (!pending.length) return;
  const { applyFall } = require('../../services/conquestService');
  for (const c of pending) {
    try { const fall = await applyFall(c.id, null); if (fall) console.log(`[FALL] ${c.name} ${fall.kind} (reprise)`); } catch (e) { console.error(`[FALL] ${c.id}:`, e.message); }
  }
}

module.exports = { retryPendingFalls, processSieges, refreshSiegeFlag, syncSiegeFlags, wallLevelOf, wallHpNow, campEnd, engineCount };
