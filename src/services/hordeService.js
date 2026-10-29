// ============================================================
// Invasions barbares (décision du 29 octobre 2026) — contenu « donjon d'alliance », aucune attaque contre les joueurs
// - Chaque week-end, du vendredi 18 h au dimanche 23 h (heure de Paris), des donjons de hordes apparaissent sur la carte
//   (config.invasion.counts) : niveau 1 près des bords, niveau 5 au centre. L'équipe peut aussi lancer ou terminer une
//   invasion (écran d'administration). Au terme, les donjons restants repartent.
// - Un donjon a 3 étages (avant-poste, remparts, chef de la horde) à vaincre dans l'ordre. La garnison de l'étage en cours
//   ne se reconstitue pas : chaque attaque lui retire des soldats, même repoussée. Étage vaincu : le suivant ; le dernier
//   vaincu : le donjon est détruit.
// - Seuls les joueurs en alliance attaquent un donjon. Chaque attaque compte les dégâts du joueur (points de combat :
//   entretien des barbares tués). À la destruction, le trésor (ressources dans la capitale, or, points d'alliance) est
//   partagé selon les dégâts ; le dernier coup a une chance d'objet rare pour le héros.
// - Le donjon est un point spécial de la carte (ResourceNode « HORDE ») : il se voit, s'espionne et s'attaque comme un
//   camp ; rien à récolter, pas de ville à y fonder.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { unitsData, itemsData } = require('../config/gamedata');
const { calculateArmyPower } = require('../utils/calculations');
const { resolveCombat, heroCombatStats } = require('./combatService');
const { calculateWoundedUnits, carryWounded } = require('./woundedService');
const { awardHeroXp } = require('./heroXpService');
const { techPct } = require('../utils/techEffects');
const { creditCity } = require('../utils/db');
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
const floorPower = (level, floor) => Math.round(I.basePower * Math.pow(I.levelFactor, level - 1) * I.floorPowerMult[floor - 1]);
function floorsFor(level) {
  return I.floors.map((name, i) => { const units = garrison(floorPower(level, i + 1), I.floorTier[i]); return { name, units, power: powerOf(units) }; });
}
function treasureFor(level) {
  const T = I.treasure;
  const res = Math.round(T.resources * Math.pow(T.resourceFactor, level - 1));
  return { wood: res, stone: res, iron: res, food: res, gold: Math.round(T.gold * Math.pow(T.goldFactor, level - 1)), alliancePoints: Math.round(T.alliancePoints * Math.pow(T.goldFactor, level - 1)), itemChance: I.itemChance[level - 1], itemTier: I.itemTier[level - 1] };
}

// ---- début et fin d'une invasion ----
async function placeLevel(invasionId, level, count) {
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
      const floors = floorsFor(level);
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
  let inv;
  try { inv = await prisma.invasion.create({ data: { key, startedAt: now, endsAt, manual } }); } catch (e) { return null; }   // déjà lancée (autre processus)
  let total = 0;
  for (const [level, count] of Object.entries(I.counts)) total += await placeLevel(inv.id, Number(level), count);
  await prisma.invasion.update({ where: { id: inv.id }, data: { hordes: total } });
  const until = endsAt.toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ });
  await prisma.$executeRaw`INSERT INTO "Notification" ("id", "playerId", "kind", "title", "body", "link") SELECT gen_random_uuid(), p.id, 'invasion', ${'⚔️ Invasion barbare'}, ${`${total} donjons de hordes sont apparus sur la carte, jusqu'à ${until}. Avec votre alliance, abattez leurs trois étages : le trésor est partagé selon les dégâts. Les hordes n'attaquent pas les villes.`}, ${JSON.stringify({ to: 'world', tab: 'ranking' })}::jsonb FROM "Player" p`;
  console.log(`[INVASION] ${key} : ${total} donjons jusqu'au ${endsAt.toISOString()}`);
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
async function attackHorde(army, nodeId) {
  const out = await prisma.$transaction(async (tx) => {
    const node = await tx.$queryRaw`SELECT * FROM "ResourceNode" WHERE id = ${nodeId} FOR UPDATE`.then(r => r[0]);
    const horde = node ? await tx.horde.findUnique({ where: { nodeId } }) : null;
    if (!node || !horde || horde.destroyedAt) return { gone: true };
    const member = await tx.allianceMember.findUnique({ where: { playerId: army.ownerId } });
    if (!member) return { noAlliance: true, x: node.x, y: node.y };
    const fresh = await tx.army.findUnique({ where: { id: army.id }, include: { units: true, hero: { include: { items: true } }, owner: true } });
    if (!fresh || !fresh.units.length) return { gone: true };
    const defenders = Object.entries(node.defenderUnits || {}).filter(([, n]) => n > 0).map(([unitKey, count]) => ({ unitKey, count, tier: tierOf(unitKey) }));
    const techRows = await tx.playerTechnology.findMany({ where: { playerId: army.ownerId } });
    const combat = resolveCombat(fresh.units.map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })), defenders, 0, heroCombatStats(fresh.hero), null, { attackerBonusPct: techPct(techRows, 'attackBonusPct'), winnerLossMultiplier: config.combat.tribeLossMultiplier });
    // pertes de l'armée, blessés rapportés comme après un camp
    let lost = 0; const killedOwn = [];
    for (const u of fresh.units) {
      const l = Math.floor(u.count * combat.attackerLossRate);
      if (l <= 0) continue;
      lost += l; killedOwn.push({ key: u.unitKey, killed: l });
      if (l >= u.count) await tx.armyUnit.delete({ where: { id: u.id } }); else await tx.armyUnit.update({ where: { id: u.id }, data: { count: { decrement: l } } });
    }
    if (lost > 0 && fresh.cityId) {
      try {
        const wounded = await calculateWoundedUnits(fresh.cityId, killedOwn, fresh.owner?.faction, techPct(techRows, 'woundedBonusPct') + require('../utils/heroEffects').talent(fresh.hero, 'woundedPct'));
        if (wounded.length) await carryWounded(tx, fresh.id, wounded);
      } catch (e) { console.error('[WOUNDED]', e.message); }
    }
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
    await RK.recordCombat(tx, { attackers: [{ playerId: army.ownerId, units: fresh.units.reduce((t, u) => t + u.count, 0) }], defenders: [], attackerLosses: killedOwn, defenderLosses: killedHorde });
    await tx.hordeDamage.upsert({ where: { hordeId_playerId: { hordeId: horde.id, playerId: army.ownerId } }, update: { points: { increment: points }, attacks: { increment: 1 }, allianceId: member.allianceId }, create: { hordeId: horde.id, playerId: army.ownerId, allianceId: member.allianceId, points, attacks: 1 } });
    if (fresh.heroId && killedHorde.length) await awardHeroXp(fresh.heroId, Math.floor(killedHorde.reduce((t, k) => t + k.killed, 0) * config.combat.heroXpPerTribeKill), tx);
    const floorName = I.floors[horde.floor - 1];
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
    const report = await tx.battleReport.create({ data: {
      playerId: army.ownerId, attackerId: army.ownerId, x: node.x, y: node.y, result: combat.attackerWon ? 'WIN' : 'LOSE', winner: combat.attackerWon ? 'ATTACKER' : 'DEFENDER',
      attackerUnits: fresh.units.map(u => ({ key: u.unitKey, count: u.count })), defenderUnits: defenders,
      attackerLosses: { totalAttackerLosses: lost, totalKilled: lost, rate: combat.attackerLossRate }, defenderLosses: { totalDefenderLosses: killedHorde.reduce((t, k) => t + k.killed, 0), totalKilled: killedHorde.reduce((t, k) => t + k.killed, 0), rate: combat.attackerWon ? 1 : combat.defenderLossRate },
      loot: { attackerName: fresh.owner?.name, defenderName: `Horde barbare · ${floorName}`, cityName: `Donjon barbare niv. ${horde.level} (${node.x}, ${node.y})`, type: 'HORDE', points },
      rounds: { type: 'HORDE', level: horde.level, floor: horde.floor, floorName } } });
    let treasure = null;
    if (destroyed) treasure = await destroyHorde(tx, horde, node, army.ownerId, fresh.heroId);
    return { won: combat.attackerWon, lost, points, floor: horde.floor, floorName, nextFloor, destroyed, treasure, level: horde.level, x: node.x, y: node.y, reportId: report.id, allianceId: member.allianceId };
  }, TX);
  return out;
}

// Donjon détruit : trésor partagé selon les dégâts, objet rare au dernier coup, points d'alliance ; le point disparaît
async function destroyHorde(tx, horde, node, lastHitterId, lastHeroId) {
  await tx.horde.update({ where: { id: horde.id }, data: { destroyedAt: new Date(), floor: I.floors.length } });
  await tx.resourceNode.delete({ where: { id: node.id } });
  await tx.invasion.update({ where: { id: horde.invasionId }, data: { destroyed: { increment: 1 } } });
  const T = treasureFor(horde.level);
  const rows = await tx.hordeDamage.findMany({ where: { hordeId: horde.id, points: { gt: 0 } } });
  const total = rows.reduce((t, r) => t + r.points, 0) || 1;
  const shares = [];
  for (const r of rows) {
    const share = r.points / total;
    const gain = { wood: Math.floor(T.wood * share), stone: Math.floor(T.stone * share), iron: Math.floor(T.iron * share), food: Math.floor(T.food * share) };
    const capital = await tx.city.findFirst({ where: { playerId: r.playerId, isCapital: true }, select: { id: true } });
    if (capital) await creditCity(tx, capital.id, gain);
    const gold = Math.floor(T.gold * share), ap = Math.floor(T.alliancePoints * share);
    await tx.player.update({ where: { id: r.playerId }, data: { gold: { increment: gold }, alliancePoints: { increment: ap } } });
    shares.push({ playerId: r.playerId, share, gain, gold, alliancePoints: ap });
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
    for (const s of r.treasure.shares) {
      const pct = Math.round(s.share * 100);
      notify(s.playerId, 'invasion', '🏆 Donjon barbare détruit', `Le donjon de niveau ${r.level} en (${r.x}, ${r.y}) est tombé. Votre part du trésor (${pct} % des dégâts) : ${s.gain.wood.toLocaleString('fr-FR')} de chaque ressource dans votre capitale (dans la limite des entrepôts), ${s.gold} or, ${s.alliancePoints} points d'alliance.${s.playerId === r.treasure.lastHitterId && r.treasure.item ? ` Dernier coup : votre héros trouve « ${r.treasure.item.name} ».` : ''}`, { to: 'map', x: r.x, y: r.y });
    }
    return;
  }
  notify(army.ownerId, 'battle', r.won ? `⚔️ ${r.floorName} vaincu` : '⚔️ Donjon : attaque repoussée', r.won ? `${army.name} a vaincu l'étage « ${r.floorName} » du donjon (${r.x}, ${r.y}) : place à l'étage suivant.` : `${army.name} a été repoussée par l'étage « ${r.floorName} » (${r.lost} pertes) mais la garnison s'use : ${r.points} points de dégâts pour vous.`, { to: 'report', reportId: r.reportId, x: r.x, y: r.y });
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
  out.invasion = { id: last.id, startedAt: last.startedAt, endsAt: last.endsAt, endedAt: last.endedAt, manual: last.manual, total: last.hordes, destroyed: last.destroyed,
    byLevel: [1, 2, 3, 4, 5].map(l => ({ level: l, left: hordes.filter(h => h.level === l && !h.destroyedAt).length, total: hordes.filter(h => h.level === l).length })),
    hordes: inv ? hordes.filter(h => !h.destroyedAt).map(h => ({ nodeId: h.nodeId, x: h.x, y: h.y, level: h.level, floor: h.floor })) : [],
    alliances: alliances.map(a => ({ ...a, mine: a.id === member?.allianceId })), myPoints: mine[0]?.points || 0, inAlliance: !!member };
  return out;
}
async function hordeView(nodeId, playerId) {
  const horde = await prisma.horde.findUnique({ where: { nodeId: String(nodeId) }, include: { damage: { orderBy: { points: 'desc' } } } });
  if (!horde) return null;
  const [node, inv, member] = await Promise.all([prisma.resourceNode.findUnique({ where: { id: horde.nodeId } }), prisma.invasion.findUnique({ where: { id: horde.invasionId } }), playerId ? prisma.allianceMember.findUnique({ where: { playerId } }) : null]);
  const ids = horde.damage.map(d => d.playerId);
  const players = await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, alliance: { select: { alliance: { select: { tag: true } } } } } });
  const byId = new Map(players.map(p => [p.id, p]));
  const total = horde.damage.reduce((t, d) => t + d.points, 0);
  const T = treasureFor(horde.level);
  return {
    nodeId: horde.nodeId, x: horde.x, y: horde.y, level: horde.level, floor: horde.floor, destroyed: !!horde.destroyedAt, endsAt: inv?.endsAt,
    floors: horde.floors.map((f, i) => ({ name: f.name, power: f.power, done: i + 1 < horde.floor || !!horde.destroyedAt, current: i + 1 === horde.floor && !horde.destroyedAt, left: i + 1 === horde.floor ? (node?.defenderPower ?? 0) : i + 1 < horde.floor ? 0 : f.power })),
    garrison: node?.defenderUnits || {}, treasure: { wood: T.wood, gold: T.gold, alliancePoints: T.alliancePoints, itemChance: T.itemChance },
    contributors: horde.damage.slice(0, 10).map(d => ({ name: byId.get(d.playerId)?.name || '?', tag: byId.get(d.playerId)?.alliance?.alliance?.tag || null, points: d.points, attacks: d.attacks, share: total ? d.points / total : 0, me: d.playerId === playerId })),
    myAlliancePoints: member ? horde.damage.filter(d => d.allianceId === member.allianceId).reduce((t, d) => t + d.points, 0) : 0,
    totalPoints: total, inAlliance: !!member
  };
}

module.exports = { weekendWindow, nextWindowStart, parisParts, parisToUtc, floorsFor, floorPower, treasureFor, garrison, powerOf, startInvasion, endInvasion, processInvasions, attackHorde, announceOutcome, activeInvasion, invasionState, hordeView };
