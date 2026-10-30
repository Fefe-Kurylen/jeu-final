// ========== RENCONTRES D'ARMÉES ==========
// Décision du 25 octobre 2026 : deux armées de joueurs **ennemis déclarés** (l'une des deux alliances a déclaré l'autre
// ENEMY) qui se trouvent sur la **même case au même moment** se battent, même en marche, en rase campagne. Le vainqueur
// continue sa route (ou reste où il était) ; le perdant rentre chez lui depuis la case de la rencontre.
//
// - Les positions des armées en marche ne sont écrites qu'à l'arrivée : elles sont calculées le long de leur route à
//   plusieurs instants entre deux ticks, et l'approche la plus serrée entre deux instants est testée, pour ne pas rater
//   deux armées qui se croisent de face.
// - La case d'une ville est laissée aux règles du siège (camp, sortie, retour au bercail, convois) ; seule exception, la
//   garde : une armée qui garde la ville d'un autre joueur combat l'ennemi qui arrive sur la ville. Pareil pour la case
//   d'un Bastion (décision du 29 octobre 2026) : une armée qui garde le Bastion combat l'ennemi qui vient l'assiéger.
// - Deux armées qui viennent de se battre ne se rebattent pas (le perdant quitte la case) : `rematchMinutes`.

const prisma = require('../../config/database');
const config = require('../../config');
const { findRoute } = require('../../utils/pathfinding');
const { pointAlongPath } = require('../../utils/calculations');
const { lockCity } = require('../../utils/db');
const { notify } = require('../../services/pushService');

// les armées d'un rassemblement marchent aussi (vers le lanceur, puis vers la cible) : elles se croisent comme les autres
const MARCHING = ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING', 'SUPPORTING', 'RALLY_JOIN', 'RALLY_MARCH'];
const STANDING = ['BESIEGING', 'HARVESTING', 'FOUNDING', 'IDLE'];   // IDLE: only outside its own city (a guard, a halted army)
const E = () => config.combat.encounters;

const { Terrain } = require('../../utils/pathfinding');
let lastRunAt = 0;
// Routes of marching armies, least recently used evicted first
const routeCache = new Map();
async function routeOf(a, budget) {
  const faction = a.owner?.faction || null;   // the path the army really walks (forests do not slow the Gauls)
  const key = `${Terrain.epoch}|${a.x},${a.y}>${a.targetX},${a.targetY}|${faction || ''}`;   // epoch : la carte en cours (graine du monde)
  if (routeCache.has(key)) { const p = routeCache.get(key); routeCache.delete(key); routeCache.set(key, p); return p; }
  if (budget.left <= 0 || (budget.until && Date.now() > budget.until)) return [[a.x, a.y], [a.targetX, a.targetY]];   // over budget this tick (count or time): the straight line, exact next time
  budget.left--;
  const r = await findRoute(a.x, a.y, a.targetX, a.targetY, faction).catch(() => null);
  const path = r ? r.path : [[a.x, a.y], [a.targetX, a.targetY]];
  routeCache.set(key, path);
  while (routeCache.size > E().routeCacheSize) routeCache.delete(routeCache.keys().next().value);
  return path;
}

const isMarching = (a) => MARCHING.includes(a.status) && a.targetX !== null && a.targetY !== null && !!a.arrivalAt;

// Position of an army at time t (ms), in tiles (not rounded)
async function positionAt(a, t, budget = { left: Infinity }) {
  if (!isMarching(a)) return { x: a.x, y: a.y };
  const end = new Date(a.arrivalAt).getTime(), start = a.departedAt ? new Date(a.departedAt).getTime() : end;
  const progress = end > start ? Math.max(0, Math.min(1, (t - start) / (end - start))) : (t >= end ? 1 : 0);
  if (progress <= 0) return { x: a.x, y: a.y };
  const p = pointAlongPath(await routeOf(a, budget), progress);
  return p || { x: a.x, y: a.y };
}
async function tileAt(a, t) { const p = await positionAt(a, t); return { x: Math.round(p.x), y: Math.round(p.y) }; }

// Closest approach of two points moving in straight lines between two instants (relative motion), squared
function closestApproach2(a0, a1, b0, b1) {
  const rx = a0.x - b0.x, ry = a0.y - b0.y, vx = (a1.x - a0.x) - (b1.x - b0.x), vy = (a1.y - a0.y) - (b1.y - b0.y);
  const vv = vx * vx + vy * vy;
  const s = vv > 0 ? Math.max(0, Math.min(1, -(rx * vx + ry * vy) / vv)) : 0;
  return { d2: (rx + vx * s) ** 2 + (ry + vy * s) ** 2, s };
}

// The pairs of alliances at war (a declaration from either side is enough)
async function warPairs() {
  const rows = await prisma.allianceDiplomacy.findMany({ where: { status: 'ENEMY' }, select: { allianceId: true, targetAllianceId: true } });
  const pairs = new Set();
  for (const r of rows) { pairs.add(`${r.allianceId}|${r.targetAllianceId}`); pairs.add(`${r.targetAllianceId}|${r.allianceId}`); }
  return { pairs, alliances: [...new Set(rows.flatMap(r => [r.allianceId, r.targetAllianceId]))] };
}

// Bounding box of where an army can be during the window (its whole route for a marching army), one tile of margin
const boxOf = (a) => isMarching(a)
  ? { x0: Math.min(a.x, a.targetX) - 1, x1: Math.max(a.x, a.targetX) + 1, y0: Math.min(a.y, a.targetY) - 1, y1: Math.max(a.y, a.targetY) + 1 }
  : { x0: a.x - 1, x1: a.x + 1, y0: a.y - 1, y1: a.y + 1 };
const boxesMeet = (p, q) => p.x0 <= q.x1 && q.x0 <= p.x1 && p.y0 <= q.y1 && q.y0 <= p.y1;

const SELECT = { id: true, name: true, ownerId: true, owner: { select: { faction: true } }, cityId: true, status: true, missionType: true, isGarrison: true, x: true, y: true, targetX: true, targetY: true, targetCityId: true, targetBastionId: true, departedAt: true, arrivalAt: true, claimedAt: true, city: { select: { x: true, y: true } }, units: { select: { count: true } } };
// A candidate: not a garrison, not claimed by an arrival being resolved, with soldiers, and not standing in its own city
const isCandidate = (a) => !a.isGarrison && !a.claimedAt && a.units.some(u => u.count > 0) && (MARCHING.includes(a.status) || STANDING.includes(a.status)) && !(a.status === 'IDLE' && a.city && a.x === a.city.x && a.y === a.city.y);

// City tiles belong to the siege rules; the only fight there is a guard (an army standing before another player's city)
// against an enemy that arrives on the city (attack, raid, spies, move — not a break-siege, which has its own battle)
function allowedOnCity(cityAt, p, q) {
  const guardOf = (g, o) => g.status === 'IDLE' && g.x === cityAt.x && g.y === cityAt.y && g.ownerId !== cityAt.playerId
    && ['ATTACKING', 'RAIDING', 'SPYING', 'MOVING'].includes(o.status) && o.missionType !== 'BREAK_SIEGE'
    && o.targetX === cityAt.x && o.targetY === cityAt.y && o.ownerId !== cityAt.playerId;
  return guardOf(p, q) || guardOf(q, p);
}

// Bastion tiles too: the only fight there is a guard standing before the Bastion against an enemy coming to besiege it
// (une armée seule ou un rassemblement en marche vers ce Bastion)
function allowedOnBastion(b, p, q) {
  const besieger = (o) => ((o.status === 'ATTACKING' && o.missionType === 'BASTION_ATTACK') || (o.status === 'RALLY_MARCH' && o.targetBastionId === b.id))
    && o.targetX === b.x && o.targetY === b.y;
  const guardOf = (g, o) => g.status === 'IDLE' && g.x === b.x && g.y === b.y && besieger(o);
  return guardOf(p, q) || guardOf(q, p);
}

async function processEncounters(now) {
  const nowMs = now.getTime();
  const window = E().lookBackSeconds * 1000;
  const from = Math.max(lastRunAt || nowMs - config.tick.intervalMs, nowMs - window);
  const { pairs, alliances } = await warPairs();
  if (!pairs.size) { lastRunAt = nowMs; return 0; }
  const members = await prisma.allianceMember.findMany({ where: { allianceId: { in: alliances } }, select: { playerId: true, allianceId: true } });
  const allianceOf = new Map(members.map(m => [m.playerId, m.allianceId]));
  const candidates = (await prisma.army.findMany({ where: { ownerId: { in: [...allianceOf.keys()] }, status: { in: [...MARCHING, ...STANDING] }, claimedAt: null, isGarrison: false }, select: SELECT })).filter(isCandidate);
  if (candidates.length < 2) { lastRunAt = nowMs; return 0; }

  // enemy pairs whose areas can overlap during the window: only those get their routes computed
  const box = new Map(candidates.map(a => [a.id, boxOf(a)]));
  const enemyPairs = [];
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const p = candidates[i], q = candidates[j];
    if (p.ownerId === q.ownerId || !pairs.has(`${allianceOf.get(p.ownerId)}|${allianceOf.get(q.ownerId)}`)) continue;
    if (boxesMeet(box.get(p.id), box.get(q.id))) enemyPairs.push([p, q]);
  }
  if (!enemyPairs.length) { lastRunAt = nowMs; return 0; }
  const involved = new Map();
  for (const [p, q] of enemyPairs) { involved.set(p.id, p); involved.set(q.id, q); }

  // positions at the sample instants (an army counts only from its departure on)
  const step = E().sampleSeconds * 1000;
  const instants = [];
  for (let t = from + step; t < nowMs; t += step) instants.push(t);
  instants.push(nowMs);
  const budget = { left: E().maxRoutesPerTick, until: Date.now() + (E().routeTimeBudgetMs || 2000) };
  const pos = new Map();
  for (const a of involved.values()) {
    const list = [];
    for (const t of instants) list.push(await positionAt(a, t, budget));
    pos.set(a.id, list);
  }
  // the cities around the armies involved, each on its 2 × 2 cells
  const xs = [...involved.values()].flatMap(a => [a.x, isMarching(a) ? a.targetX : a.x]), ys = [...involved.values()].flatMap(a => [a.y, isMarching(a) ? a.targetY : a.y]);
  const cities = await prisma.city.findMany({ where: { x: { gte: Math.min(...xs) - 2, lte: Math.max(...xs) + 1 }, y: { gte: Math.min(...ys) - 2, lte: Math.max(...ys) + 1 } }, select: { id: true, x: true, y: true, playerId: true, name: true } });
  const { cityCells } = require('../../utils/pathfinding').Terrain;
  const cityAtTile = new Map();
  for (const c of cities) for (const [cx, cy] of cityCells(c.x, c.y)) cityAtTile.set(`${cx},${cy}`, c);
  // les Bastions aussi (2 × 2 cases) : leur case relève des règles du siège (camp, sortie, briser le siège)
  const bastions = await prisma.bastion.findMany({ where: { status: { not: 'DESTROYED' }, x: { gte: Math.min(...xs) - 2, lte: Math.max(...xs) + 1 }, y: { gte: Math.min(...ys) - 2, lte: Math.max(...ys) + 1 } }, select: { id: true, x: true, y: true } });
  const bastionAtTile = new Map();
  for (const b of bastions) for (const [cx, cy] of cityCells(b.x, b.y)) bastionAtTile.set(`${cx},${cy}`, b);

  // the first instant each enemy pair is on the same tile (or crosses between two instants)
  const R2 = E().meetDistance ** 2;
  const found = [];
  for (const [p, q] of enemyPairs) {
    const pp = pos.get(p.id), qq = pos.get(q.id);
    for (let i = 0; i < instants.length; i++) {
      const sameTile = Math.round(pp[i].x) === Math.round(qq[i].x) && Math.round(pp[i].y) === Math.round(qq[i].y);
      let hit = sameTile ? { x: Math.round(pp[i].x), y: Math.round(pp[i].y), t: instants[i] } : null;
      if (!hit && i > 0) {
        const c = closestApproach2(pp[i - 1], pp[i], qq[i - 1], qq[i]);
        if (c.d2 <= R2) {
          const mx = (pp[i - 1].x + (pp[i].x - pp[i - 1].x) * c.s + qq[i - 1].x + (qq[i].x - qq[i - 1].x) * c.s) / 2;
          const my = (pp[i - 1].y + (pp[i].y - pp[i - 1].y) * c.s + qq[i - 1].y + (qq[i].y - qq[i - 1].y) * c.s) / 2;
          hit = { x: Math.round(mx), y: Math.round(my), t: instants[i - 1] + (instants[i] - instants[i - 1]) * c.s };
        }
      }
      if (!hit) continue;
      const cityAt = cityAtTile.get(`${hit.x},${hit.y}`);
      if (cityAt && !allowedOnCity(cityAt, p, q)) break;   // the siege rules handle the city tile
      const bastionAt = bastionAtTile.get(`${hit.x},${hit.y}`);
      if (bastionAt && !allowedOnBastion(bastionAt, p, q)) break;   // idem pour un Bastion
      found.push({ p, q, ...hit, cityAt: cityAt || null });
      break;
    }
  }
  found.sort((m, n) => m.t - n.t);
  lastRunAt = nowMs;

  let fought = 0;
  const engaged = new Set();
  for (const m of found) {
    if (engaged.has(m.p.id) || engaged.has(m.q.id)) continue;
    // the armies of the same alliance standing on the tile defend it together
    const sideOf = (lead) => [lead, ...candidates.filter(o => o.id !== lead.id && !engaged.has(o.id) && !isMarching(o) && o.x === m.x && o.y === m.y && allianceOf.get(o.ownerId) === allianceOf.get(lead.ownerId))];
    try {
      const r = await resolveMeeting(m, sideOf, now);
      if (r) { fought++; for (const id of r.ids) engaged.add(id); }
    } catch (e) { console.error(`[ENCOUNTER] ${m.p.id} / ${m.q.id}:`, e.message); }
  }
  return fought;
}

const FULL = { units: true, hero: { include: { items: true } }, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } }, city: true };

// One transaction: the cities of camps first, then the armies' rows (FOR UPDATE, in id order), checked again as they
// stand under the lock; the winner goes on untouched, the loser side goes home from the meeting tile.
async function resolveMeeting({ p, q, x, y, cityAt }, sideOf, now) {
  const { fieldBattle, sendArmyHomeTx } = require('../../services/armyService');
  const { getRelation } = require('../../services/diplomacyService');
  const { refreshSiegeFlag } = require('./siegeProcessor');
  // the marching one strikes (both marching: the first found); the standing side defends its spot together
  const [atk0, def0] = isMarching(q) && !isMarching(p) ? [q, p] : [p, q];
  const defSide = isMarching(def0) ? [def0] : sideOf(def0);
  const ids = [atk0.id, ...defSide.map(d => d.id)];
  // two armies that have just fought do not fight again while the loser leaves the tile
  const since = new Date(now.getTime() - E().rematchMinutes * 60000);
  const recent = await prisma.$queryRaw`SELECT 1 FROM "BattleReport" WHERE "createdAt" > ${since} AND loot->>'type' = 'ENCOUNTER' AND rounds->'armyIds' ? ${atk0.id} AND rounds->'armyIds' ?| ${defSide.map(d => d.id)} LIMIT 1`;
  if (recent.length) return null;
  const outcome = await prisma.$transaction(async (tx) => {
    const camps = (await tx.army.findMany({ where: { id: { in: ids }, status: 'BESIEGING' }, select: { targetCityId: true } })).map(v => v.targetCityId).filter(Boolean);
    for (const c of [...new Set(camps)].sort()) await lockCity(tx, c);
    await tx.$queryRaw`SELECT id FROM "Army" WHERE id = ANY(${[...ids].sort()}) ORDER BY id FOR UPDATE`;
    const rows = await tx.army.findMany({ where: { id: { in: ids } }, include: FULL });
    const fresh = (id) => rows.find(r => r.id === id);
    const attacker = fresh(atk0.id);
    // as they stand now: still out in the field, not claimed by an arrival, not moved meanwhile, with soldiers
    const same = (a, b) => a && a.status === b.status && a.x === b.x && a.y === b.y && String(a.arrivalAt) === String(b.arrivalAt) && !a.claimedAt && isCandidate(a);
    if (!same(attacker, atk0)) return null;
    const defenders = defSide.map(d => fresh(d.id)).filter((d, i) => same(d, defSide[i]));
    if (!defenders.length || !defenders.some(d => d.id === def0.id)) return null;
    const rel = await getRelation(attacker.ownerId, def0.ownerId, tx);
    if (rel.declared !== 'ENEMY' && rel.declaredByThem !== 'ENEMY') return null;   // peace made meanwhile
    const allIds = [attacker.id, ...defenders.map(d => d.id)];
    const { combat, reportIds } = await fieldBattle(tx, attacker, defenders, attacker.ownerId, { x, y, where: `Rencontre en (${x}, ${y})`, type: 'ENCOUNTER', rounds: { type: 'ENCOUNTER', armyIds: allIds } });
    const losers = combat.attackerWon ? defenders : [attacker];
    const winners = combat.attackerWon ? [attacker] : defenders;
    for (const loser of losers) {
      // a beaten foundation loses its settler, a beaten harvest frees its node, a beaten camp lifts its siege
      if ((loser.status === 'HARVESTING' || loser.status === 'FOUNDING') && loser.targetResourceId) {
        const others = await tx.army.count({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: loser.targetResourceId, id: { notIn: losers.map(l => l.id) } } });
        if (others === 0) await tx.resourceNode.updateMany({ where: { id: loser.targetResourceId }, data: { hasPlayerArmy: false, lastArmyDeparture: now } });
      }
      const reset = { x, y, targetResourceId: null, ...(loser.status === 'FOUNDING' ? { settlers: 0 } : {}) };
      await tx.army.update({ where: { id: loser.id }, data: reset });
      const units = await tx.armyUnit.findMany({ where: { armyId: loser.id } });
      await sendArmyHomeTx(tx, { ...loser, ...reset, units });
      if (loser.status === 'BESIEGING' && loser.targetCityId) await refreshSiegeFlag(tx, loser.targetCityId);
    }
    return { winners, losers, reportIds, ids: allIds };
  }, { timeout: 15000 });
  if (!outcome) return null;
  const { winners, losers, reportIds } = outcome;
  const where = `en (${x}, ${y})`;
  const name = (list) => [...new Set(list.map(a => a.owner?.name || 'ennemi'))].join(', ');
  for (const ownerId of new Set(winners.map(a => a.ownerId))) notify(ownerId, 'battle', '⚔️ Rencontre gagnée', `${winners.filter(a => a.ownerId === ownerId).map(a => a.name).join(', ')} a croisé l'armée de ${name(losers)} ${where} et l'a repoussée.`, { to: 'report', reportId: reportIds[ownerId], x, y });
  for (const ownerId of new Set(losers.map(a => a.ownerId))) notify(ownerId, 'battle', '⚔️ Rencontre perdue', `${losers.filter(a => a.ownerId === ownerId).map(a => a.name).join(', ')} a croisé l'armée de ${name(winners)} ${where} et a été battue : elle rentre.`, { to: 'report', reportId: reportIds[ownerId], x, y });
  // the guard of a city was beaten: its owner learns it
  if (cityAt && losers.some(l => l.status === 'IDLE') && !losers.some(l => l.ownerId === cityAt.playerId)) notify(cityAt.playerId, 'battle', '🛡️ Garde battue', `L'armée qui gardait ${cityAt.name} a été battue par ${name(winners)}.`, { to: 'map', x, y, cityId: cityAt.id });
  console.log(`[ENCOUNTER] ${name(winners)} bat ${name(losers)} ${where}`);
  return outcome;
}

module.exports = { processEncounters, tileAt, closestApproach2, isCandidate, isMarching, allowedOnCity, allowedOnBastion };
