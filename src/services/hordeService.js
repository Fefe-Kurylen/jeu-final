// ============================================================
// Invasions barbares (décision du 29 octobre 2026) — contenu « donjon d'alliance », aucune attaque contre les joueurs
// - Chaque week-end, du vendredi 18 h au dimanche 23 h (heure de Paris), des donjons de hordes apparaissent sur la carte
//   (config.invasion.counts) : niveau 1 près des bords, niveau 5 au centre. L'équipe peut aussi lancer ou terminer une
//   invasion (écran d'administration). Au terme, les donjons restants repartent.
// - Un donjon a 3 étages (avant-poste, remparts, chef de la horde) à vaincre dans l'ordre. La garnison de l'étage en cours
//   ne se reconstitue pas : chaque attaque lui retire des soldats, même repoussée. Étage vaincu : le suivant ; le dernier
//   vaincu : le donjon est détruit.
// - Seuls les joueurs en alliance attaquent un donjon. Chaque attaque compte les dégâts du joueur (points de combat :
//   entretien des barbares tués). À la destruction, le trésor (ressources, or, points d'alliance) est partagé selon les
//   dégâts ; les ressources vont dans la capitale, puis dans les autres villes du joueur s'il n'y a plus de place
//   (rapport économie, recommandation 2) ; le dernier coup a une chance d'objet rare pour le héros.
// - Le donjon est un point spécial de la carte (ResourceNode « HORDE ») : il se voit, s'espionne et s'attaque comme un
//   camp ; rien à récolter, pas de ville à y fonder.
// - Force des donjons (décision du 30 octobre 2026, rapport économie, recommandation 9) : au lancement, la puissance
//   médiane des joueurs actifs règle l'avant-poste du niveau 1 (config.invasion.powerRef), noté sur l'invasion (basePower).
// - Âge du monde (décision du 30 octobre 2026) : au lancement, mult = min(ageMax, 1 + ageFactorPerWeek × max(0, semaine du
//   monde − ageFromWeek)), noté sur l'invasion ; un donjon de niveau L prend × mult^((L − 1)/4) sur les ressources de son
//   trésor (ni l'or, ni les points d'alliance) et, sans mesure des joueurs, sur la puissance de ses étages. Le niveau 1 ne
//   change pas.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { unitsData, itemsData } = require('../config/gamedata');
const { calculateArmyPower } = require('../utils/calculations');
const { resolveCombat, heroCombatStats } = require('./combatService');
const { calculateWoundedUnits, carryWounded } = require('./woundedService');
const { awardHeroXp } = require('./heroXpService');
const { techPct } = require('../utils/techEffects');
const { lockPlayerCities, creditPlayer, lostNote } = require('../utils/db');
const { notify } = require('./pushService');
const Terrain = require('../../frontend/js/shared/terrain.js');

const I = config.invasion;
const TZ = 'Europe/Paris';
const TX = { timeout: 20000 };

// ---- calendrier (heure de Paris) ----
function parisParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, dow: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday] };
}
// l'instant UTC d'une heure de Paris (jour y-m-d, heure h)
function parisToUtc(y, m, d, h) {
  const guess = new Date(Date.UTC(y, m - 1, d, h));
  const p = parisParts(guess);
  const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return new Date(guess.getTime() - (shown - guess.getTime()));
}
// Le week-end d'invasion qui contient `now`, ou null : { key, start, end }
function weekendWindow(now = new Date()) {
  const p = parisParts(now);
  // jours écoulés depuis le vendredi de cette semaine-là (vendredi 0, samedi 1, dimanche 2)
  const sinceFri = (p.dow - I.startDay + 7) % 7;
  if (sinceFri > 2) return null;
  const fri = new Date(Date.UTC(p.y, p.m - 1, p.d) - sinceFri * 86400000);
  const fy = fri.getUTCFullYear(), fm = fri.getUTCMonth() + 1, fd = fri.getUTCDate();
  const start = parisToUtc(fy, fm, fd, I.startHour);
  const sun = new Date(fri.getTime() + 2 * 86400000);
  const end = parisToUtc(sun.getUTCFullYear(), sun.getUTCMonth() + 1, sun.getUTCDate(), I.endHour);
  if (now < start || now >= end) return null;
  return { key: `${fy}-${String(fm).padStart(2, '0')}-${String(fd).padStart(2, '0')}`, start, end };
}
// prochain début d'invasion (pour l'affichage)
function nextWindowStart(now = new Date()) {
  for (let i = 0; i < 8; i++) {
    const day = new Date(now.getTime() + i * 86400000);
    const p = parisParts(day);
    if (p.dow !== I.startDay) continue;
    const start = parisToUtc(p.y, p.m, p.d, I.startHour);
    if (start > now) return start;
  }
  return null;
}

// ---- garnisons ----
const HORDE_UNITS = {
  base: [['HUN_INF_NOMADE', 0.4], ['HUN_ARC_NOMADE', 0.3], ['HUN_CAV_PILLARD', 0.3]],
  intermediate: [['HUN_INF_GARDE', 0.4], ['HUN_ARC_CAMP', 0.3], ['HUN_CAV_INTER', 0.3]],
  elite: [['HUN_INF_VETERAN', 0.35], ['HUN_ARC_ELITE', 0.25], ['HUN_CAV_ELITE', 0.4]]
};
const tierOf = (key) => unitsData.find(u => u.key === key)?.tier || 'base';
const powerOf = (units) => Math.round(calculateArmyPower(Object.entries(units || {}).filter(([, n]) => n > 0).map(([unitKey, count]) => ({ unitKey, count, tier: tierOf(unitKey) })), unitsData));
function garrison(power, tier) {
  const units = {};
  for (const [key, share] of HORDE_UNITS[tier]) {
    const one = calculateArmyPower([{ unitKey: key, tier, count: 1 }], unitsData) || 1;
    units[key] = Math.max(1, Math.round(power * share / one));
  }
  return units;
}
// ---- âge du monde ----
// multiplicateur d'une invasion lancée le jour `day` du monde (semaine 1 = jours 1 à 7)
function ageMultFor(day) {
  const week = Math.floor((Math.max(1, Number(day) || 1) - 1) / 7) + 1;
  return Math.min(I.ageMax, 1 + I.ageFactorPerWeek * Math.max(0, week - I.ageFromWeek));
}
// part de ce multiplicateur pour un donjon de niveau L : rien au niveau 1, tout au niveau 5
const levelAgeMult = (level, mult = 1) => Math.pow(Math.max(1, Number(mult) || 1), (level - 1) / 4);
async function currentAgeMult(now = new Date()) {
  try { return ageMultFor((await require('./wonderService').worldState(now)).day); } catch (e) { console.error('[INVASION] âge du monde :', e.message); return 1; }
}

// ---- force réglée sur les joueurs ----
const P = I.powerRef;
// Avant-poste du niveau 1 : max(minOutpost, médiane × outpostPctOfMedian %) des puissances mesurées, ou null s'il y a
// moins de minPlayers joueurs (on garde alors la formule de l'âge du monde)
function outpostPower(powers) {
  const s = (powers || []).filter(p => p > 0).sort((a, b) => a - b);
  if (s.length < P.minPlayers) return null;
  const m = s.length >> 1;
  const median = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  return Math.round(Math.max(P.minOutpost, median * P.outpostPctOfMedian / 100));
}
// Avant-poste du niveau 1 d'après les joueurs vus dans les activeDays derniers jours : puissance de toutes leurs unités
// (armées et garnisons), lue en une requête ; null sans assez de joueurs
async function measuredBasePower(now = new Date(), db = prisma) {
  const since = new Date(now.getTime() - P.activeDays * 86400000);
  const rows = await db.$queryRaw`
    SELECT a."ownerId" AS "playerId", au."unitKey", au.tier, SUM(au.count)::int AS count
    FROM "ArmyUnit" au JOIN "Army" a ON a.id = au."armyId" JOIN "Player" p ON p.id = a."ownerId"
    WHERE p."lastSeenAt" >= ${since} AND au.count > 0
    GROUP BY a."ownerId", au."unitKey", au.tier`;
  const units = new Map();
  for (const r of rows) {
    if (!units.has(r.playerId)) units.set(r.playerId, []);
    units.get(r.playerId).push({ unitKey: r.unitKey, tier: r.tier, count: Number(r.count) });
  }
  return outpostPower([...units.values()].map(u => calculateArmyPower(u, unitsData)));
}
// Puissance d'un étage : avant-poste mesuré (basePower de l'invasion) × powerRef.levelFactor par niveau ; sans mesure,
// formule de l'âge du monde (invasion.basePower × invasion.levelFactor par niveau, × mult^((L − 1)/4)) ; étages × 1 / 2 / 4
const floorPower = (level, floor, mult = 1, basePower = null) => Math.round(I.floorPowerMult[floor - 1] * (basePower
  ? basePower * Math.pow(P.levelFactor, level - 1)
  : I.basePower * Math.pow(I.levelFactor, level - 1) * levelAgeMult(level, mult)));
function floorsFor(level, mult = 1, basePower = null) {
  return I.floors.map((name, i) => { const units = garrison(floorPower(level, i + 1, mult, basePower), I.floorTier[i]); return { name, units, power: powerOf(units) }; });
}
// trésor d'un donjon : l'âge du monde (mult de l'invasion) grossit les ressources seulement
function treasureFor(level, mult = 1) {
  const T = I.treasure;
  const res = Math.round(T.resources * Math.pow(T.resourceFactor, level - 1) * levelAgeMult(level, mult));
  return { wood: res, stone: res, iron: res, food: res, gold: Math.round(T.gold * Math.pow(T.goldFactor, level - 1)), alliancePoints: Math.round(T.alliancePoints * Math.pow(T.goldFactor, level - 1)), itemChance: I.itemChance[level - 1], itemTier: I.itemTier[level - 1] };
}

// ---- début et fin d'une invasion ----
async function placeLevel(invasionId, level, count, mult = 1, basePower = null) {
  const [rMin, rMax] = I.rings[level];
  const { footprintFree } = require('../utils/spawn');
  let made = 0;
  for (let k = 0; k < count; k++) {
    const angle0 = (2 * Math.PI * (k + level * 0.37)) / count;
    for (let tries = 0; tries < 120; tries++) {
      const r = rMin + Math.random() * (rMax - rMin);
      const a = angle0 + (Math.random() - 0.5) * (Math.PI / count);
      const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
      if (!Terrain.inWorld(x, y) || !Terrain.isMainland(x, y)) continue;
      if (!(await footprintFree(x, y, {}).catch(() => false))) continue;
      // un donjon reste à 4 cases au moins des villes et des autres donjons (lisible sur la carte)
      if (await prisma.city.findFirst({ where: { x: { gte: x - 4, lte: x + 4 }, y: { gte: y - 4, lte: y + 4 } }, select: { id: true } })) continue;
      if (await prisma.resourceNode.findFirst({ where: { resourceType: { in: ['HORDE', 'WONDER', 'PLAN'] }, x: { gte: x - 4, lte: x + 4 }, y: { gte: y - 4, lte: y + 4 } }, select: { id: true } })) continue;
      const floors = floorsFor(level, mult, basePower);
      try {
        await prisma.$transaction(async (tx) => {
          const node = await tx.resourceNode.create({ data: { x, y, resourceType: 'HORDE', level, amount: 0, maxAmount: 0, regenRate: 0, biome: Terrain.getTerrainType(x, y).biome || 'forest', hasDefenders: true, defenderUnits: floors[0].units, defenderPower: floors[0].power, respawnMinutes: 0 } });
          await tx.horde.create({ data: { invasionId, nodeId: node.id, x, y, level, floors } });
        });
        made++;
        break;
      } catch (e) { /* case prise : on essaie ailleurs */ }
    }
  }
  return made;
}
async function startInvasion({ key, endsAt, manual = false, now = new Date() }) {
  if (await prisma.invasion.findFirst({ where: { endedAt: null } })) return null;
  // fixés une fois pour toute l'invasion : âge du monde (trésor) et force des joueurs (étages)
  const ageMult = await currentAgeMult(now);
  const basePower = await measuredBasePower(now);
  let inv;
  try { inv = await prisma.invasion.create({ data: { key, startedAt: now, endsAt, manual, ageMult, basePower } }); } catch (e) { return null; }   // déjà lancée (autre processus)
  let total = 0;
  for (const [level, count] of Object.entries(I.counts)) total += await placeLevel(inv.id, Number(level), count, ageMult, basePower);
  await prisma.invasion.update({ where: { id: inv.id }, data: { hordes: total } });
  const until = endsAt.toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ });
  await prisma.$executeRaw`INSERT INTO "Notification" ("id", "playerId", "kind", "title", "body", "link") SELECT gen_random_uuid(), p.id, 'invasion', ${'⚔️ Invasion barbare'}, ${`${total} donjons de hordes sont apparus sur la carte, jusqu'à ${until}. Avec votre alliance, abattez leurs trois étages : le trésor est partagé selon les dégâts. Les hordes n'attaquent pas les villes.`}, ${JSON.stringify({ to: 'world', tab: 'ranking' })}::jsonb FROM "Player" p`;
  console.log(`[INVASION] ${key} : ${total} donjons jusqu'au ${endsAt.toISOString()} (âge du monde × ${ageMult.toFixed(2)}, ${basePower ? `avant-poste du niveau 1 à ${basePower} d'après les joueurs` : 'trop peu de joueurs mesurés : formule de l\'âge du monde'})`);
  return { ...inv, hordes: total };
}
async function endInvasion(inv, now = new Date()) {
  const ok = await prisma.invasion.updateMany({ where: { id: inv.id, endedAt: null }, data: { endedAt: now } });
  if (!ok.count) return null;
  const left = await prisma.horde.findMany({ where: { invasionId: inv.id, destroyedAt: null }, select: { nodeId: true } });
  // les donjons restants repartent ; les armées en route vers eux rentrent en arrivant (point disparu)
  await prisma.resourceNode.deleteMany({ where: { id: { in: left.map(h => h.nodeId) }, resourceType: 'HORDE' } });
  console.log(`[INVASION] ${inv.key} terminée : ${left.length} donjons repartis`);
  return { left: left.length };
}
// Tick : ouvre l'invasion du week-end, ferme celle dont le terme est passé
async function processInvasions(now = new Date()) {
  const active = await prisma.invasion.findFirst({ where: { endedAt: null } });
  if (active) { if (now >= active.endsAt) await endInvasion(active, now); return; }
  const w = weekendWindow(now);
  if (!w) return;
  if (await prisma.invasion.findUnique({ where: { key: w.key } })) return;   // déjà jouée (ou terminée plus tôt par l'équipe)
  await startInvasion({ key: w.key, endsAt: w.end, now });
}

// ---- attaque d'un donjon (armée arrivée, armyProcessor : il la renvoie ensuite chez elle) ----
function pickItem(tier) {
  const pool = itemsData.filter(i => i.tier === tier);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
// Un rassemblement d'alliance (rallyService) livre un seul combat : toutes ses armées contre la garnison de l'étage.
// Héros du lanceur en tête (comme le commandant d'un rassemblement de Rise of Kingdoms) ; chaque armée perd la même part
// de ses soldats ; les dégâts reviennent à chacun selon la puissance qu'il a amenée. armyIds[0] = l'armée du lanceur.
async function attackHordeGroup(armyIds, nodeId) {
  const out = await prisma.$transaction(async (tx) => {
    const node = await tx.$queryRaw`SELECT * FROM "ResourceNode" WHERE id = ${nodeId} FOR UPDATE`.then(r => r[0]);
    const horde = node ? await tx.horde.findUnique({ where: { nodeId } }) : null;
    if (!node || !horde || horde.destroyedAt) return { gone: true };
    const armies = (await tx.army.findMany({ where: { id: { in: armyIds } }, include: { units: true, hero: { include: { items: true } }, owner: { include: { alliance: true } } } }))
      .filter(a => a.units.some(u => u.count > 0) && a.owner?.alliance)
      .sort((a, b) => armyIds.indexOf(a.id) - armyIds.indexOf(b.id));
    if (!armies.length) return { gone: true, noArmy: true };
    const lead = armies[0];
    const defenders = Object.entries(node.defenderUnits || {}).filter(([, n]) => n > 0).map(([unitKey, count]) => ({ unitKey, count, tier: tierOf(unitKey) }));
    const leadTech = await tx.playerTechnology.findMany({ where: { playerId: lead.ownerId } });
    const leadBonus = await require('./armyService').combatPct(tx, lead.ownerId, leadTech);   // technologies et Forge du lanceur
    // civilisation de chaque armée sur ses lignes : « +10 % défense » de Rome compté armée par armée
    const allUnits = armies.flatMap(a => a.units.filter(u => u.count > 0).map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count, faction: a.owner?.faction || null })));
    const combat = resolveCombat(allUnits, defenders, 0, heroCombatStats(lead.hero), null, { attackerBonusPct: leadBonus.atk, winnerLossMultiplier: config.combat.tribeLossMultiplier });
    // part de chaque armée : la puissance qu'elle amène
    const powers = armies.map(a => calculateArmyPower(a.units.map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })), unitsData) || 1);
    const totalPower = powers.reduce((t, p) => t + p, 0) || 1;
    // la garnison s'use : étage vaincu si l'attaque l'emporte, sinon ses pertes restent
    const killedHorde = [];
    const remaining = {};
    for (const [key, n] of Object.entries(node.defenderUnits || {})) {
      const l = combat.attackerWon ? n : Math.floor(n * combat.defenderLossRate);
      if (l > 0) killedHorde.push({ key, killed: l });
      remaining[key] = Math.max(0, n - l);
    }
    const RK = require('./rankingService');
    const points = RK.pointsOf(killedHorde);
    const kills = killedHorde.reduce((t, k) => t + k.killed, 0);
    const floorName = I.floors[horde.floor - 1];
    const perArmy = [];
    for (const [i, a] of armies.entries()) {
      const share = powers[i] / totalPower;
      let lost = 0; const killedOwn = [];
      for (const u of a.units) {
        const l = Math.floor(u.count * combat.attackerLossRate);
        if (l <= 0) continue;
        lost += l; killedOwn.push({ key: u.unitKey, killed: l });
        if (l >= u.count) await tx.armyUnit.delete({ where: { id: u.id } }); else await tx.armyUnit.update({ where: { id: u.id }, data: { count: { decrement: l } } });
      }
      const techRows = i === 0 ? leadTech : await tx.playerTechnology.findMany({ where: { playerId: a.ownerId } });
      if (lost > 0 && a.cityId) {
        try {
          const wounded = await calculateWoundedUnits(a.cityId, killedOwn, a.owner?.faction, techPct(techRows, 'woundedBonusPct') + require('../utils/heroEffects').talent(a.hero, 'woundedPct'));
          if (wounded.length) await carryWounded(tx, a.id, wounded);
        } catch (e) { console.error('[WOUNDED]', e.message); }
      }
      const myPoints = Math.round(points * share);
      await RK.recordCombat(tx, { attackers: [{ playerId: a.ownerId, units: a.units.reduce((t, u) => t + u.count, 0) }], defenders: [], attackerLosses: killedOwn, defenderLosses: killedHorde.map(k => ({ key: k.key, killed: Math.round(k.killed * share) })) });
      await tx.hordeDamage.upsert({ where: { hordeId_playerId: { hordeId: horde.id, playerId: a.ownerId } }, update: { points: { increment: myPoints }, attacks: { increment: 1 }, allianceId: a.owner.alliance.allianceId }, create: { hordeId: horde.id, playerId: a.ownerId, allianceId: a.owner.alliance.allianceId, points: myPoints, attacks: 1 } });
      // défi « Chasseurs de hordes » : les dégâts comptent le jour (de Paris) où ils sont infligés
      await require('./questService').bump(a.ownerId, 'horde_points', myPoints, tx);
      if (a.heroId && kills) await awardHeroXp(a.heroId, Math.floor(kills * share * config.combat.heroXpPerTribeKill), tx);
      const report = await tx.battleReport.create({ data: {
        playerId: a.ownerId, attackerId: a.ownerId, x: node.x, y: node.y, result: combat.attackerWon ? 'WIN' : 'LOSE', winner: combat.attackerWon ? 'ATTACKER' : 'DEFENDER',
        attackerUnits: a.units.map(u => ({ key: u.unitKey, count: u.count })), defenderUnits: defenders,
        attackerLosses: { totalAttackerLosses: lost, totalKilled: lost, rate: combat.attackerLossRate }, defenderLosses: { totalDefenderLosses: kills, totalKilled: kills, rate: combat.attackerWon ? 1 : combat.defenderLossRate },
        loot: { attackerName: armies.length > 1 ? `Rassemblement de ${lead.owner?.name} (${armies.length} armées)` : a.owner?.name, defenderName: `Horde barbare · ${floorName}`, cityName: `Donjon barbare niv. ${horde.level} (${node.x}, ${node.y})`, type: 'HORDE', points: myPoints, rallyArmies: armies.length },
        rounds: { type: 'HORDE', level: horde.level, floor: horde.floor, floorName, rally: armies.length > 1 } } });
      perArmy.push({ armyId: a.id, ownerId: a.ownerId, name: a.name, lost, points: myPoints, reportId: report.id });
    }
    let destroyed = false, nextFloor = horde.floor;
    if (combat.attackerWon) {
      if (horde.floor >= I.floors.length) destroyed = true;
      else {
        nextFloor = horde.floor + 1;
        const f = horde.floors[nextFloor - 1];
        await tx.horde.update({ where: { id: horde.id }, data: { floor: nextFloor } });
        await tx.resourceNode.update({ where: { id: node.id }, data: { defenderUnits: f.units, defenderPower: f.power } });
      }
    } else {
      await tx.resourceNode.update({ where: { id: node.id }, data: { defenderUnits: remaining, defenderPower: powerOf(remaining) } });
    }
    let treasure = null;
    if (destroyed) treasure = await destroyHorde(tx, horde, node, lead.ownerId, lead.heroId);   // le dernier coup : le lanceur
    return { won: combat.attackerWon, points, floor: horde.floor, floorName, nextFloor, destroyed, treasure, level: horde.level, x: node.x, y: node.y, armies: perArmy, lost: perArmy.reduce((t, p) => t + p.lost, 0), reportId: perArmy[0]?.reportId };
  }, TX);
  return out;
}
// une armée seule (ancien chemin) : un rassemblement d'une armée
async function attackHorde(army, nodeId) {
  return attackHordeGroup([army.id], nodeId);
}

// Donjon détruit : trésor partagé selon les dégâts, objet rare au dernier coup, points d'alliance ; le point disparaît
async function destroyHorde(tx, horde, node, lastHitterId, lastHeroId) {
  await tx.horde.update({ where: { id: horde.id }, data: { destroyedAt: new Date(), floor: I.floors.length } });
  await tx.resourceNode.delete({ where: { id: node.id } });
  const inv = await tx.invasion.update({ where: { id: horde.invasionId }, data: { destroyed: { increment: 1 } } });
  const T = treasureFor(horde.level, inv?.ageMult);
  // un compte supprimé laisse ses lignes de dégâts : seuls les joueurs encore là se partagent le trésor
  const dealt = await tx.hordeDamage.findMany({ where: { hordeId: horde.id, points: { gt: 0 } } });
  const alive = new Set((await tx.player.findMany({ where: { id: { in: dealt.map(r => r.playerId) } }, select: { id: true } })).map(p => p.id));
  const rows = dealt.filter(r => alive.has(r.playerId));
  const total = rows.reduce((t, r) => t + r.points, 0) || 1;
  const shares = [];
  // joueurs pris dans l'ordre de leur id : les villes de plusieurs joueurs se verrouillent toujours dans le même ordre
  for (const r of [...rows].sort((a, b) => (a.playerId < b.playerId ? -1 : 1))) {
    const share = r.points / total;
    const gain = { wood: Math.floor(T.wood * share), stone: Math.floor(T.stone * share), iron: Math.floor(T.iron * share), food: Math.floor(T.food * share) };
    const gold = Math.floor(T.gold * share), ap = Math.floor(T.alliancePoints * share);
    // villes verrouillées avant la ligne du joueur, comme les dépenses (heroService) : jamais d'interblocage avec elles
    const cities = await lockPlayerCities(tx, r.playerId);
    const paid = await tx.player.updateMany({ where: { id: r.playerId }, data: { gold: { increment: gold }, alliancePoints: { increment: ap } } });
    if (!paid.count) continue;   // supprimé entre-temps : pas de part
    // la capitale d'abord, le surplus dans les autres villes selon leur place ; ce qui ne tient nulle part est perdu
    const { lost } = await creditPlayer(tx, r.playerId, cities.find(c => c.isCapital)?.id, gain, cities);
    shares.push({ playerId: r.playerId, share, gain, lost, gold, alliancePoints: ap });
  }
  // dernier coup : une chance d'objet pour le héros qui l'a porté (ou le héros du joueur)
  let item = null;
  if (Math.random() < T.itemChance) {
    const heroId = lastHeroId || (await tx.hero.findUnique({ where: { playerId: lastHitterId }, select: { id: true } }))?.id;
    const picked = pickItem(T.itemTier);
    if (heroId && picked) { await tx.heroItem.create({ data: { heroId, itemKey: picked.key, slot: 'inventory', stats: picked.stats } }); item = picked; }
  }
  return { shares, item, level: horde.level, x: node.x, y: node.y, lastHitterId };
}

// Prévient les participants après la transaction
function announceOutcome(army, r) {
  if (r.destroyed && r.treasure) {
    for (const sh of r.treasure.shares) {
      const pct = Math.round(sh.share * 100);
      // ressources rangées dans la capitale puis dans les autres villes ; la fin dit ce qui n'a tenu nulle part (lostNote)
      notify(sh.playerId, 'invasion', '🏆 Donjon barbare détruit', `Le donjon de niveau ${r.level} en (${r.x}, ${r.y}) est tombé. Votre part du trésor (${pct} % des dégâts) : ${sh.gold} or, ${sh.alliancePoints} points d'alliance et ${sh.gain.wood.toLocaleString('fr-FR')} de chaque ressource, rangées dans votre capitale puis dans vos autres villes${lostNote(sh.lost)}.${sh.playerId === r.treasure.lastHitterId && r.treasure.item ? ` Dernier coup : votre héros trouve « ${r.treasure.item.name} ».` : ''}`, { to: 'map', x: r.x, y: r.y });
    }
    return;
  }
  for (const p of r.armies || []) {
    notify(p.ownerId, 'battle', r.won ? `⚔️ ${r.floorName} vaincu` : '⚔️ Donjon : rassemblement repoussé', r.won ? `Le rassemblement a vaincu l'étage « ${r.floorName} » du donjon (${r.x}, ${r.y}) : place à l'étage suivant. Vos dégâts : ${p.points} points.` : `Le rassemblement a été repoussé par l'étage « ${r.floorName} » (${p.lost} pertes pour ${p.name}) mais la garnison s'use : ${p.points} points de dégâts pour vous.`, { to: 'report', reportId: p.reportId, x: r.x, y: r.y });
  }
}

// ---- lecture ----
async function activeInvasion() { return prisma.invasion.findFirst({ where: { endedAt: null } }); }
async function invasionState(playerId, now = new Date()) {
  const inv = await activeInvasion();
  const last = inv || await prisma.invasion.findFirst({ orderBy: { startedAt: 'desc' } });
  const member = playerId ? await prisma.allianceMember.findUnique({ where: { playerId } }) : null;
  const out = { active: !!inv, nextStart: inv ? null : nextWindowStart(now), invasion: null };
  if (!last) return out;
  const hordes = await prisma.horde.findMany({ where: { invasionId: last.id }, select: { nodeId: true, x: true, y: true, level: true, floor: true, destroyedAt: true } });
  const alliances = await prisma.$queryRawUnsafe(`SELECT a.id, a.tag, a.name, SUM(d.points)::int AS points, COUNT(DISTINCT d."hordeId")::int AS hordes FROM "HordeDamage" d JOIN "Horde" h ON h.id = d."hordeId" JOIN "Alliance" a ON a.id = d."allianceId" WHERE h."invasionId" = $1 GROUP BY a.id, a.tag, a.name ORDER BY points DESC LIMIT 10`, last.id);
  const mine = playerId ? await prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(d.points), 0)::int AS points FROM "HordeDamage" d JOIN "Horde" h ON h.id = d."hordeId" WHERE h."invasionId" = $1 AND d."playerId" = $2`, last.id, playerId) : [{ points: 0 }];
  out.invasion = { id: last.id, startedAt: last.startedAt, endsAt: last.endsAt, endedAt: last.endedAt, manual: last.manual, total: last.hordes, destroyed: last.destroyed, ageMult: last.ageMult ?? 1, basePower: last.basePower ?? null,
    byLevel: [1, 2, 3, 4, 5].map(l => ({ level: l, left: hordes.filter(h => h.level === l && !h.destroyedAt).length, total: hordes.filter(h => h.level === l).length })),
    hordes: inv ? hordes.filter(h => !h.destroyedAt).map(h => ({ nodeId: h.nodeId, x: h.x, y: h.y, level: h.level, floor: h.floor })) : [],
    alliances: alliances.map(a => ({ ...a, mine: a.id === member?.allianceId })), myPoints: mine[0]?.points || 0, inAlliance: !!member };
  return out;
}
async function hordeView(nodeId, playerId) {
  const horde = await prisma.horde.findUnique({ where: { nodeId: String(nodeId) }, include: { damage: { orderBy: { points: 'desc' } } } });
  if (!horde) return null;
  const [node, inv, member] = await Promise.all([prisma.resourceNode.findUnique({ where: { id: horde.nodeId } }), prisma.invasion.findUnique({ where: { id: horde.invasionId } }), playerId ? prisma.allianceMember.findUnique({ where: { playerId } }) : null]);
  // reparti à la fin de l'invasion (point retiré, jamais détruit) : introuvable, comme pour la carte
  if (!horde.destroyedAt && (!node || inv?.endedAt)) return null;
  const ids = horde.damage.map(d => d.playerId);
  const players = await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, alliance: { select: { alliance: { select: { tag: true } } } } } });
  const byId = new Map(players.map(p => [p.id, p]));
  const total = horde.damage.reduce((t, d) => t + d.points, 0);
  const T = treasureFor(horde.level, inv?.ageMult);
  return {
    nodeId: horde.nodeId, x: horde.x, y: horde.y, level: horde.level, floor: horde.floor, destroyed: !!horde.destroyedAt, endsAt: inv?.endsAt,
    floors: horde.floors.map((f, i) => ({ name: f.name, power: f.power, done: i + 1 < horde.floor || !!horde.destroyedAt, current: i + 1 === horde.floor && !horde.destroyedAt, left: i + 1 === horde.floor ? (node?.defenderPower ?? 0) : i + 1 < horde.floor ? 0 : f.power })),
    garrison: node?.defenderUnits || {}, treasure: { wood: T.wood, gold: T.gold, alliancePoints: T.alliancePoints, itemChance: T.itemChance },
    contributors: horde.damage.slice(0, 10).map(d => ({ name: byId.get(d.playerId)?.name || '?', tag: byId.get(d.playerId)?.alliance?.alliance?.tag || null, points: d.points, attacks: d.attacks, share: total ? d.points / total : 0, me: d.playerId === playerId })),
    myAlliancePoints: member ? horde.damage.filter(d => d.allianceId === member.allianceId).reduce((t, d) => t + d.points, 0) : 0,
    totalPoints: total, inAlliance: !!member
  };
}

module.exports = { attackHordeGroup, destroyHorde, weekendWindow, nextWindowStart, parisParts, parisToUtc, ageMultFor, levelAgeMult, outpostPower, measuredBasePower, floorsFor, floorPower, treasureFor, garrison, powerOf, startInvasion, endInvasion, processInvasions, attackHorde, announceOutcome, activeInvasion, invasionState, hordeView };
