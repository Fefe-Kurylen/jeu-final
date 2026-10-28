// ============================================================
// Cycle du serveur et Merveille (décision du 28 octobre 2026, GDD world_config.server ; façon Travian, Natars renommés
// « Immortels »)
// - Calendrier : jour 1 = ouverture du monde (WorldConfig.readyAt). Inscriptions pendant 60 jours, 5 000 joueurs au plus.
// - Jour 120 : 12 sites de Merveille au centre, gardés chacun par une très forte garnison d'Immortels (points de ressource
//   de type WONDER). Une armée qui la bat laisse le site libre 24 h : un joueur d'une alliance y fonde une ville avec ses
//   colons, qui devient sa Ville Merveille (une par joueur, hors du compte des colonies). Sinon les Immortels reviennent.
// - Jour 150 : 13 plans de construction en anneau autour (type PLAN), gardés aussi ; battre la garnison donne le plan au
//   joueur. Au-delà du niveau 50, une alliance ne monte sa Merveille que si l'un de ses membres détient un plan. Un assaut
//   gagné contre la capitale d'un détenteur emporte ses plans.
// - La Merveille monte de 1 à 100 : le propriétaire lance chaque niveau, payé par le stock du chantier (sans plafond),
//   que remplissent les convois des membres vers la Ville Merveille ; coût et durée grimpent à chaque niveau.
// - Les Immortels attaquent chaque Ville Merveille toutes les 12 h (de plus en plus fort) ; un assaut gagné par eux ou
//   par un rival lui ôte des niveaux. La Ville Merveille ne peut pas être rasée.
// - Niveau 100 : le monde est fini (WorldConfig.endedAt), Panthéon et titres (services/hallOfFameService.js).
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { unitsData } = require('../config/gamedata');
const { calculateArmyPower } = require('../utils/calculations');
const { notify } = require('./pushService');
const Terrain = require('../../frontend/js/shared/terrain.js');

const W = config.world;
const DAY = 86400000;
const SPECIAL = ['WONDER', 'PLAN'];
const RES = ['wood', 'stone', 'iron', 'food'];
const STOCK = { wood: 'wonderWood', stone: 'wonderStone', iron: 'wonderIron', food: 'wonderFood' };
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });
const isSpecial = (node) => !!node && SPECIAL.includes(node.resourceType);

// ---- calendrier ----
async function worldRow() { return prisma.worldConfig.findUnique({ where: { id: 1 } }); }
function phaseOf(row, now = new Date(), players = 0) {
  const opened = row?.readyAt ? new Date(row.readyAt) : null;
  const day = opened ? Math.floor((now - opened) / DAY) + 1 : 1;
  const at = (d) => (opened ? new Date(opened.getTime() + (d - 1) * DAY) : null);
  const registrationEndsAt = at(W.registrationDays + 1);
  return {
    world: row?.number || 1, day, openedAt: opened,
    registration: { open: !row?.endedAt && day <= W.registrationDays && players < W.maxPlayers, endsAt: registrationEndsAt, players, maxPlayers: W.maxPlayers },
    wonderSitesAt: at(W.wonderSitesDay), wonderPlansAt: at(W.wonderPlansDay),
    sitesOpen: !!row?.sitesSpawnedAt, plansOpen: !!row?.plansSpawnedAt,
    ended: !!row?.endedAt, endedAt: row?.endedAt || null, winner: row?.winnerName || null
  };
}
async function worldState(now = new Date()) {
  const [row, players] = await Promise.all([worldRow(), prisma.player.count()]);
  return phaseOf(row, now, players);
}
// inscription possible ? null si oui, sinon la raison
async function registrationBlocked() {
  const st = await worldState();
  if (st.ended) return 'Ce monde est terminé : un nouveau monde ouvre bientôt.';
  if (st.day > W.registrationDays) return `Les inscriptions de ce monde sont closes (ouvertes ${W.registrationDays} jours) : rendez-vous au prochain monde.`;
  if (st.registration.players >= W.maxPlayers) return `Ce monde est complet (${W.maxPlayers} joueurs).`;
  return null;
}
let endedCache = { at: 0, ended: false };
async function isEnded() {
  if (Date.now() - endedCache.at < 10000) return endedCache.ended;
  const row = await worldRow().catch(() => null);
  endedCache = { at: Date.now(), ended: !!row?.endedAt };
  return endedCache.ended;
}

// ---- les Immortels ----
const IMMORTAL_MIX = [['SUL_INF_PALAIS', 0.45], ['SUL_ARC_PERSE', 0.3], ['SUL_CAV_MAMELOUK', 0.25]];
function immortalUnits(power) {
  const unitPower = (key) => calculateArmyPower([{ unitKey: key, tier: 'elite', count: 1 }], unitsData) || 1;
  const units = {};
  for (const [key, share] of IMMORTAL_MIX) units[key] = Math.max(1, Math.round(power * share / unitPower(key)));
  return units;
}
const immortalPower = (units) => Math.round(calculateArmyPower(Object.entries(units).map(([unitKey, count]) => ({ unitKey, tier: 'elite', count })), unitsData));

// emplacements libres autour du centre, sur un anneau, pour un point (et pour une ville 2 × 2 sur les sites)
async function ringSpots(count, rMin, rMax, needBlock) {
  const { footprintFree } = require('../utils/spawn');
  const spots = [];
  for (let k = 0; k < count; k++) {
    const angle0 = (2 * Math.PI * k) / count;
    for (let tries = 0; tries < 200; tries++) {
      const r = rMin + ((tries * 7919) % 97) / 97 * (rMax - rMin);
      const a = angle0 + ((tries % 11) - 5) * 0.04;
      const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
      if (spots.some(s => Math.abs(s.x - x) < 4 && Math.abs(s.y - y) < 4)) continue;
      if (!Terrain.inWorld(x, y) || !Terrain.isMainland(x, y)) continue;
      if (needBlock ? !(await footprintFree(x, y, {})) : !(await footprintFree(x, y, {}).catch(() => false))) continue;
      spots.push({ x, y });
      break;
    }
  }
  return spots;
}
async function spawnNodes(kind, count, rMin, rMax, power) {
  const spots = await ringSpots(count, rMin, rMax, kind === 'WONDER');
  let made = 0;
  for (const s of spots) {
    const units = immortalUnits(power);
    try {
      await prisma.resourceNode.create({ data: { x: s.x, y: s.y, resourceType: kind, level: 3, amount: 0, maxAmount: 0, regenRate: 0, biome: Terrain.getTerrainType(s.x, s.y).biome || 'forest', hasDefenders: true, defenderUnits: units, defenderPower: immortalPower(units), respawnMinutes: 24 * 60 } });
      made++;
    } catch (e) { /* case prise entre-temps */ }
  }
  return made;
}
async function announce(title, body, link) {
  // une ligne dans le fil de chaque joueur (une requête)
  await prisma.$executeRaw`INSERT INTO "Notification" ("id", "playerId", "kind", "title", "body", "link") SELECT gen_random_uuid(), p.id, 'world', ${title}, ${body}, ${JSON.stringify(link || { to: 'map', tab: 'map', x: 0, y: 0 })}::jsonb FROM "Player" p`;
}

// Un camp d'Immortels vaincu (depuis resolveTribeCombat) : un plan va au vainqueur, un site attend sa ville 24 h
async function onImmortalsBeaten(tx, node, playerId) {
  if (node.resourceType === 'PLAN') {
    await tx.resourceNode.delete({ where: { id: node.id } });
    const plan = await tx.wonderPlan.create({ data: { holderId: playerId, capturedAt: new Date() } });
    notify(playerId, 'world', '📜 Plan de construction', `Vous avez pris un plan de Merveille aux Immortels en (${node.x}, ${node.y}). Gardé dans votre capitale, il permet à votre alliance de monter sa Merveille au-delà du niveau ${W.planNeededAbove}. Un assaut gagné contre votre capitale l'emporterait.`, { to: 'map', x: node.x, y: node.y });
    return { plan };
  }
  if (node.resourceType === 'WONDER') {
    notify(playerId, 'world', '🏛️ Site de Merveille libéré', `Les Immortels du site (${node.x}, ${node.y}) sont vaincus : 24 h pour y fonder une ville avec un colon (la Ville Merveille de votre alliance), sinon ils reviennent.`, { to: 'map', x: node.x, y: node.y });
  }
  return {};
}
// Les Immortels reviennent sur un site resté vide 24 h (plans : aussitôt réarmés s'ils n'ont pas été pris)
async function respawnImmortals(now) {
  const due = await prisma.resourceNode.findMany({ where: { resourceType: { in: SPECIAL }, hasDefenders: false, cityId: null, hasPlayerArmy: false, lastDefeat: { lte: new Date(now.getTime() - DAY) } } });
  for (const n of due) {
    const units = immortalUnits(n.resourceType === 'PLAN' ? W.immortalPlanPower : W.immortalSitePower);
    await prisma.resourceNode.updateMany({ where: { id: n.id, hasDefenders: false, cityId: null, hasPlayerArmy: false }, data: { hasDefenders: true, defenderUnits: units, defenderPower: immortalPower(units), lastDefeat: null } });
  }
}

// ---- construction ----
const levelCost = (level) => Object.fromEntries(RES.map(r => [r, Math.round(W.wonderCostBase[r] * Math.pow(W.wonderCostFactor, level - 1))]));
const levelSeconds = (level) => Math.round(W.wonderTimeBaseSec * Math.pow(W.wonderTimeFactor, level - 1));
async function allianceHasPlan(db, allianceId) {
  if (!allianceId) return false;
  return (await db.wonderPlan.count({ where: { holderId: { in: (await db.allianceMember.findMany({ where: { allianceId }, select: { playerId: true } })).map(m => m.playerId) } } })) > 0;
}
async function wonderView(cityId, playerId) {
  const city = await prisma.city.findUnique({ where: { id: cityId }, include: { player: { select: { id: true, name: true, alliance: { select: { allianceId: true, alliance: { select: { tag: true, name: true } } } } } } } });
  if (!city || !city.isWonder) return null;
  const next = city.wonderLevel + 1;
  const allianceId = city.player.alliance?.allianceId || null;
  return {
    cityId: city.id, name: city.name, x: city.x, y: city.y, level: city.wonderLevel, maxLevel: W.wonderMaxLevel,
    owner: { id: city.player.id, name: city.player.name }, alliance: city.player.alliance?.alliance || null, mine: city.playerId === playerId,
    stock: Object.fromEntries(RES.map(r => [r, Math.floor(city[STOCK[r]])])),
    next: next <= W.wonderMaxLevel ? { level: next, cost: levelCost(next), seconds: levelSeconds(next), needsPlan: next > W.planNeededAbove } : null,
    hasPlan: await allianceHasPlan(prisma, allianceId), buildEndsAt: city.wonderBuildEndsAt, lastImmortalWave: city.lastImmortalWave,
    nextWaveAt: city.wonderLevel > 0 ? new Date((city.lastImmortalWave ? new Date(city.lastImmortalWave).getTime() : Date.now()) + W.immortalWaveHours * 3600000) : null
  };
}
async function startLevel(playerId, cityId) {
  if (await isEnded()) throw httpError(423, 'Le monde est terminé');
  return prisma.$transaction(async (tx) => {
    await require('../utils/db').lockCity(tx, cityId);
    const city = await tx.city.findUnique({ where: { id: cityId } });
    if (!city || !city.isWonder) throw httpError(404, 'Ville Merveille introuvable');
    if (city.playerId !== playerId) throw httpError(403, 'Seul le propriétaire lance les niveaux de sa Merveille');
    if (city.wonderBuildEndsAt) throw httpError(400, 'Un niveau est déjà en construction');
    const next = city.wonderLevel + 1;
    if (next > W.wonderMaxLevel) throw httpError(400, 'La Merveille est achevée');
    if (next > W.planNeededAbove) {
      const m = await tx.allianceMember.findUnique({ where: { playerId }, select: { allianceId: true } });
      if (!(await allianceHasPlan(tx, m?.allianceId))) throw httpError(400, `Au-delà du niveau ${W.planNeededAbove}, un membre de votre alliance doit détenir un plan de construction`);
    }
    const cost = levelCost(next);
    const lacking = RES.filter(r => city[STOCK[r]] < cost[r]);
    if (lacking.length) throw httpError(400, `Stock du chantier insuffisant (${lacking.map(r => `${r} ${Math.floor(city[STOCK[r]])}/${cost[r]}`).join(', ')}) : les membres envoient leurs convois à la Ville Merveille`);
    const ok = await tx.city.updateMany({ where: { id: cityId, wonderBuildEndsAt: null, ...Object.fromEntries(RES.map(r => [STOCK[r], { gte: cost[r] }])) }, data: { wonderBuildEndsAt: new Date(Date.now() + levelSeconds(next) * 1000), ...Object.fromEntries(RES.map(r => [STOCK[r], { decrement: cost[r] }])) } });
    if (ok.count !== 1) throw httpError(409, 'Le chantier a changé, réessayez');
    return { message: `Niveau ${next} de la Merveille en construction`, level: next, seconds: levelSeconds(next) };
  });
}
// convoi qui arrive dans une Ville Merveille : tout va au stock du chantier, sans plafond
async function depositToWonder(db, cityId, load) {
  await db.city.update({ where: { id: cityId }, data: Object.fromEntries(RES.map(r => [STOCK[r], { increment: Math.max(0, Math.floor(load[r] || 0)) }])) });
}
// un assaut gagné contre une Ville Merveille lui ôte des niveaux (rival ou Immortels) ; le chantier en cours est perdu
async function loseLevels(db, city, n, by) {
  const before = city.wonderLevel;
  const after = Math.max(0, before - n);
  await db.city.update({ where: { id: city.id }, data: { wonderLevel: after, wonderBuildEndsAt: null } });
  notify(city.playerId, 'world', '🏛️ Merveille endommagée', `${by} a battu les défenseurs de ${city.name} : la Merveille perd ${before - after} niveau${before - after > 1 ? 'x' : ''} (${after}/${W.wonderMaxLevel}).`, { to: 'city', cityId: city.id });
  return { before, after };
}
// un assaut gagné contre une capitale : les plans de son propriétaire changent de main
async function stealPlans(db, fromPlayerId, toPlayerId) {
  const r = await db.wonderPlan.updateMany({ where: { holderId: fromPlayerId }, data: { holderId: toPlayerId, capturedAt: new Date() } });
  if (r.count) {
    notify(toPlayerId, 'world', '📜 Plan emporté', `Votre assaut a emporté ${r.count} plan${r.count > 1 ? 's' : ''} de construction de Merveille.`, { to: 'map' });
    notify(fromPlayerId, 'world', '📜 Plan perdu', `L'ennemi a emporté ${r.count} plan${r.count > 1 ? 's' : ''} de construction de Merveille de votre capitale.`, { to: 'map' });
  }
  return r.count;
}

// Vague d'Immortels contre une Ville Merveille : combat contre ses défenseurs, derrière le mur ; perdu = un niveau en moins
async function immortalWave(city, now) {
  const { resolveCombatDetailed } = require('./combatService');
  const power = Math.round(4000 * Math.pow(city.wonderLevel, 1.35));
  const atk = Object.entries(immortalUnits(power)).map(([unitKey, count]) => ({ unitKey, tier: 'elite', count }));
  const outcome = await prisma.$transaction(async (tx) => {
    await require('../utils/db').lockCity(tx, city.id);
    const full = await tx.city.findUnique({ where: { id: city.id }, include: { buildings: true, player: true, armies: { where: { status: { in: ['IDLE', 'STATIONED'] } }, include: { units: true } } } });
    if (!full || !full.isWonder || full.wonderLevel < 1) return null;
    const defenders = full.armies.filter(a => a.x === full.x && a.y === full.y);
    const merged = {};
    for (const a of defenders) for (const u of a.units) if (u.count > 0) (merged[u.unitKey] ||= { unitKey: u.unitKey, tier: u.tier, count: 0 }).count += u.count;
    const wallLevel = full.buildings.find(b => b.key === 'WALL')?.level || 0;
    const result = resolveCombatDetailed(atk, Object.values(merged), wallLevel, 0, 'Immortels', full.player.name, null, null, 'SULTAN', full.player.faction, 0, null, wallLevel > 0 ? { hp: full.wallHp, maxHp: full.wallMaxHp } : null);
    const ratio = (key) => { const r = result.defenderFinalUnits.find(x => x.key === key); return r && r.initial > 0 ? r.remaining / r.initial : 1; };
    for (const a of defenders) for (const u of a.units) {
      const n = Math.round(u.count * ratio(u.unitKey));
      if (n <= 0) await tx.armyUnit.deleteMany({ where: { id: u.id } }); else if (n !== u.count) await tx.armyUnit.update({ where: { id: u.id }, data: { count: n } });
    }
    await tx.city.update({ where: { id: full.id }, data: { lastImmortalWave: now } });
    const report = await tx.battleReport.create({ data: { playerId: full.playerId, defenderId: full.playerId, x: full.x, y: full.y, result: result.attackerWon ? 'LOSE' : 'WIN', winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER', attackerUnits: result.attackerInitialUnits, defenderUnits: result.defenderInitialUnits, attackerLosses: { rate: result.attackerLossRate, units: result.attackerFinalUnits, totalKilled: result.attackerTotalKilled }, defenderLosses: { rate: result.defenderLossRate, units: result.defenderFinalUnits, totalKilled: result.defenderTotalKilled }, loot: { type: 'IMMORTALS', attackerName: 'Immortels', defenderName: full.player.name, cityName: full.name, cityId: full.id, rounds: result.rounds } } });
    let lost = null;
    if (result.attackerWon) lost = await loseLevels(tx, full, 1, 'Une vague d\'Immortels');
    await require('./rankingService').recordCombat(tx, { attackers: [], defenders: [{ playerId: full.playerId, units: 1 }], attackerLosses: result.attackerFinalUnits, defenderLosses: [] });
    return { won: !result.attackerWon, lost, reportId: report.id, playerId: full.playerId, name: full.name };
  }, { timeout: 15000 });
  if (outcome && outcome.won) notify(outcome.playerId, 'world', '🛡️ Immortels repoussés', `Les défenseurs de ${outcome.name} ont repoussé une vague d'Immortels.`, { to: 'report', reportId: outcome.reportId });
  return outcome;
}

// ---- tick ----
async function processWonders(now = new Date()) {
  const row = await worldRow();
  if (!row?.readyAt || row.endedAt) return;
  const st = phaseOf(row, now);
  if (!row.sitesSpawnedAt && st.day >= W.wonderSitesDay) {
    const ok = await prisma.worldConfig.updateMany({ where: { id: 1, sitesSpawnedAt: null }, data: { sitesSpawnedAt: now } });
    if (ok.count) {
      const n = await spawnNodes('WONDER', W.wonderSites, 12, 30, W.immortalSitePower);
      await announce('🏛️ Les sites de Merveille sont apparus', `${n} sites de Merveille sont apparus au centre du monde, gardés par les Immortels. L'alliance qui montera la première sa Merveille au niveau ${W.wonderMaxLevel} gagnera ce monde.`, { to: 'map', tab: 'map', x: 0, y: 0 });
      console.log(`[MONDE] ${n} sites de Merveille posés (jour ${st.day})`);
    }
  }
  if (!row.plansSpawnedAt && st.day >= W.wonderPlansDay) {
    const ok = await prisma.worldConfig.updateMany({ where: { id: 1, plansSpawnedAt: null }, data: { plansSpawnedAt: now } });
    if (ok.count) {
      const n = await spawnNodes('PLAN', W.wonderPlans, 35, 55, W.immortalPlanPower);
      await announce('📜 Les plans de construction sont apparus', `${n} plans de construction sont gardés par les Immortels autour du centre : au-delà du niveau ${W.planNeededAbove}, une alliance ne monte sa Merveille que si l'un de ses membres en détient un.`, { to: 'map', tab: 'map', x: 0, y: 0 });
    }
  }
  if (row.sitesSpawnedAt) await respawnImmortals(now);
  // niveaux achevés
  const done = await prisma.city.findMany({ where: { isWonder: true, wonderBuildEndsAt: { lte: now } }, select: { id: true } });
  for (const c of done) {
    const city = await prisma.$transaction(async (tx) => {
      const fresh = await tx.city.findUnique({ where: { id: c.id }, include: { player: { include: { alliance: { include: { alliance: true } } } } } });
      if (!fresh?.wonderBuildEndsAt || new Date(fresh.wonderBuildEndsAt) > now) return null;
      return tx.city.update({ where: { id: c.id }, data: { wonderLevel: { increment: 1 }, wonderBuildEndsAt: null }, include: { player: { include: { alliance: { include: { alliance: true } } } } } });
    });
    if (!city) continue;
    notify(city.playerId, 'world', '🏛️ Merveille', `La Merveille de ${city.name} atteint le niveau ${city.wonderLevel}.`, { to: 'city', cityId: city.id });
    if (city.wonderLevel >= W.wonderMaxLevel) await require('./hallOfFameService').endWorld(city, now);
  }
  // vagues des Immortels
  const due = await prisma.city.findMany({ where: { isWonder: true, wonderLevel: { gte: 1 }, OR: [{ lastImmortalWave: null }, { lastImmortalWave: { lte: new Date(now.getTime() - W.immortalWaveHours * 3600000) } }] }, select: { id: true, wonderLevel: true, lastImmortalWave: true } });
  for (const c of due) {
    if (!c.lastImmortalWave) { await prisma.city.update({ where: { id: c.id }, data: { lastImmortalWave: now } }); continue; }   // première vague 12 h après le niveau 1
    await immortalWave(c, now).catch(e => console.error('[IMMORTELS]', e.message));
  }
}

module.exports = { SPECIAL, isSpecial, phaseOf, worldState, worldRow, registrationBlocked, isEnded, immortalUnits, immortalPower, spawnNodes, onImmortalsBeaten, levelCost, levelSeconds, allianceHasPlan, wonderView, startLevel, depositToWonder, loseLevels, stealPlans, immortalWave, processWonders, httpError, forgetEnded: () => { endedCache.at = 0; } };
