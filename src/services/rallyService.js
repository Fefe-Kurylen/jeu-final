// ============================================================
// Rassemblement d'alliance contre un donjon d'invasion (façon Rise of Kingdoms, décision du 29 octobre 2026)
// - Un donjon ne s'attaque qu'en rassemblement. Un membre le lance depuis sa ville avec une de ses armées et choisit
//   l'attente (5, 10, 30 ou 60 min). Les membres de son alliance y envoient une armée (une par joueur), qui marche jusqu'à
//   la ville du lanceur ; elle doit y arriver avant le départ. Taille (décision du 31 octobre 2026) : la Place de
//   rassemblement de la capitale du lanceur en permet 5 + 1 par niveau (25 au niveau 20, fx.rallyMaxArmies), la sienne
//   comprise.
// - À la fin de l'attente (ou plus tôt si le lanceur le décide), les armées arrivées partent ensemble à la vitesse de la
//   plus lente ; celles encore en route rentrent. Au donjon : un seul combat (hordeService.attackHordeGroup), puis chaque
//   armée rentre chez elle. Le lanceur peut annuler tant que le rassemblement n'est pas parti ; un membre peut retirer
//   son armée.
// - Aussi contre un Bastion ennemi (décision du 29 octobre 2026, jamais contre une ville) : il faut au moins un engin de
//   siège dans le groupe au départ, sinon le rassemblement est annulé. Devant le Bastion, tout le groupe campe 1 h comme
//   un siège normal, puis un seul assaut mené par le héros du lanceur (bastionService.handleBastionBattle).
// - Aussi contre les Immortels d'un site ou d'un plan de Merveille gardé (décision du 30 octobre 2026), comme pour un
//   donjon : à l'arrivée, un seul combat de groupe (wonderService.attackImmortalsGroup) mené par le héros de l'armée du
//   lanceur ; la prise suit les règles d'une armée seule et revient au lanceur (le plan est à lui, le site est libre 24 h).
// - Au départ, si la ville du lanceur a disparu ou est assiégée, le rassemblement est annulé et chacun rentre.
// Armées : RALLY_JOIN (en route vers le lanceur), RALLY_WAIT (arrivée, attend), RALLY_MARCH (en route vers la cible).
// ============================================================
const prisma = require('../config/database');
const { unitsData } = require('../config/gamedata');
const { getArmyTravelTime, calculateArmyPower, countSiegeEngines } = require('../utils/calculations');
const config = require('../config');
const { routeLength } = require('../utils/pathfinding');
const { techPct } = require('../utils/techEffects');
const fx = require('../utils/buildingEffects');
const { notify } = require('./pushService');
const { unitCount } = require('./rankingService');

const WAITS = [5, 10, 30, 60];
const TX = { timeout: 20000 };
const { httpError: err } = require('../utils/httpError');
// Armées au plus dans un rassemblement, selon la Place de rassemblement (de la capitale) du lanceur
const capacityFor = (rallyPointLevel) => fx.rallyMaxArmies(rallyPointLevel);
const fullMessage = (capacity) => `Rassemblement complet (${capacity} armées au plus)`;

async function travelSeconds(army, fromX, fromY, toX, toY) {
  const units = army.units.filter(u => u.count > 0);
  const speed = techPct(army.owner?.technologies, 'armySpeedBonusPct') + (await require('./bastionService').speedPct(army.ownerId)) + fx.marchSpeedBonusPct(fx.capitalOf(army.owner));   // + Irrigation de sa capitale
  return getArmyTravelTime(units, fromX, fromY, toX, toY, army.owner?.faction, army.hero, await routeLength(fromX, fromY, toX, toY, army.owner?.faction), speed);
}
const ARMY_INCLUDE = { units: true, hero: { include: { items: true } }, owner: { include: { technologies: true, alliance: true, cities: fx.CAPITAL_BUILDINGS } }, city: true };

// une armée libre, dans sa ville, prête à partir
async function freeArmy(armyId, playerId) {
  const army = await prisma.army.findFirst({ where: { id: String(armyId), ownerId: playerId }, include: ARMY_INCLUDE });
  if (!army) throw err(404, 'Armée non trouvée');
  if (army.isGarrison) throw err(400, 'La garnison ne quitte pas la ville : créez une armée au point de ralliement');
  if (army.status !== 'IDLE') throw err(400, 'Armée déjà en mission');
  if (!unitCount(army.units)) throw err(400, 'Armée vide');
  if (!army.city || army.x !== army.city.x || army.y !== army.city.y) throw err(400, 'L\'armée doit être dans sa ville');
  if (army.city.isSieged) throw err(400, 'Ville assiégée : vos armées ne sortent que pour briser le siège');
  return army;
}

// ---- lancer ----
// la cible : un donjon d'invasion, un site ou un plan de Merveille gardé par les Immortels, ou un Bastion ennemi
const KIND_LABEL = { HORDE: 'le donjon', WONDER: 'le site de Merveille', PLAN: 'le plan de Merveille', BASTION: 'le Bastion' };
// nature de la cible d'un rassemblement (lignes d'avant le 30 octobre 2026 : sans targetKind)
const kindOf = (rally) => rally.targetKind || (rally.targetBastionId ? 'BASTION' : 'HORDE');
// un point de la carte attaquable en rassemblement, ou la raison du refus (404 / 400)
async function nodeTarget(nodeId) {
  const node = nodeId ? await prisma.resourceNode.findUnique({ where: { id: String(nodeId) } }) : null;
  if (node && (node.resourceType === 'WONDER' || node.resourceType === 'PLAN')) {
    if (node.cityId) throw err(400, 'Une Ville Merveille occupe déjà ce site');
    if (!node.hasDefenders || !(node.defenderPower > 0)) throw err(400, node.resourceType === 'PLAN' ? 'Ce plan n\'est plus gardé' : 'Les Immortels de ce site sont déjà vaincus : fondez-y la Ville Merveille avec un colon');
    return { nodeId: node.id, kind: node.resourceType, x: node.x, y: node.y, label: `${KIND_LABEL[node.resourceType]} gardé par les Immortels` };
  }
  const horde = node && node.resourceType === 'HORDE' ? await prisma.horde.findUnique({ where: { nodeId: node.id } }) : null;
  if (!node || node.resourceType !== 'HORDE' || !horde || horde.destroyedAt) throw err(404, 'Cible introuvable : donjon détruit ou reparti, ou point sans Immortels');
  return { nodeId: node.id, kind: 'HORDE', x: node.x, y: node.y, label: `le donjon de niveau ${horde.level}` };
}
async function bastionTarget(allianceId, bastionId) {
  const b = await prisma.bastion.findUnique({ where: { id: String(bastionId) }, include: { alliance: { select: { tag: true } } } });
  if (!b || b.status === 'DESTROYED') throw err(404, 'Bastion introuvable');
  if (!['BUILDING', 'ACTIVE'].includes(b.status)) throw err(400, 'Ce Bastion n\'est encore qu\'un chantier sans murs : rien à assiéger');
  const rel = await require('./bastionService').relationTo(allianceId, b.allianceId);
  if (rel === 'SAME' || rel === 'ALLY') throw err(400, 'Impossible d\'attaquer le Bastion de votre alliance ou d\'une alliance alliée');
  return { bastionId: b.id, kind: 'BASTION', x: b.x, y: b.y, label: `le Bastion [${b.alliance.tag}]`, ownerAllianceId: b.allianceId, tag: b.alliance.tag };
}
const targetLabel = (rally) => KIND_LABEL[kindOf(rally)] || 'la cible';

async function launch(playerId, { armyId, nodeId, bastionId, waitMinutes }) {
  const wait = Number(waitMinutes);
  if (!WAITS.includes(wait)) throw err(400, 'Attente : 5, 10, 30 ou 60 minutes');
  const member = await prisma.allianceMember.findUnique({ where: { playerId } });
  if (!member) throw err(403, 'Seuls les joueurs en alliance peuvent lancer un rassemblement');
  const target = bastionId ? await bastionTarget(member.allianceId, bastionId) : await nodeTarget(nodeId);
  const army = await freeArmy(armyId, playerId);
  // Place de rassemblement de la capitale (bâtiment « capitale seulement ») : elle vaut pour toutes les villes du lanceur
  const capacity = capacityFor(fx.levelOf(fx.capitalOf(army.owner), 'RALLY_POINT'));
  const launchAt = new Date(Date.now() + wait * 60000);
  const rally = await prisma.$transaction(async (tx) => {
    const r = await tx.rally.create({ data: { allianceId: member.allianceId, leaderId: playerId, cityId: army.cityId, targetNodeId: target.nodeId || null, targetBastionId: target.bastionId || null, targetKind: target.kind, targetX: target.x, targetY: target.y, waitMinutes: wait, capacity, launchAt } });
    const ok = await tx.army.updateMany({ where: { id: army.id, status: 'IDLE' }, data: { status: 'RALLY_WAIT', rallyId: r.id, missionType: 'RALLY', targetX: army.city.x, targetY: army.city.y, arrivalAt: null } });
    if (ok.count !== 1) throw err(409, 'Armée déjà en mission');
    return r;
  }, TX);
  // les membres de l'alliance sont prévenus
  const members = await prisma.allianceMember.findMany({ where: { allianceId: member.allianceId, playerId: { not: playerId } }, select: { playerId: true } });
  const leader = army.owner?.name || 'Un membre';
  for (const m of members) notify(m.playerId, 'rally', '⚔️ Rassemblement d\'alliance', `${leader} rassemble l'alliance contre ${target.label} en (${target.x}, ${target.y}) : départ dans ${wait} min depuis sa ville. Envoyez une armée !${target.bastionId ? ' Il faut au moins un engin de siège dans le groupe.' : ''}`, { to: 'alliance', sub: 'rallies' });
  return { message: `Rassemblement lancé : départ dans ${wait} min (${capacity} armées au plus)${target.bastionId ? ' — au moins un engin de siège dans le groupe' : ''}`, rally, maxArmies: capacity };
}

// ---- rejoindre ----
async function join(playerId, rallyId, armyId) {
  const rally = await prisma.rally.findUnique({ where: { id: String(rallyId) } });
  if (!rally || rally.status !== 'GATHERING') throw err(400, 'Ce rassemblement est déjà parti ou annulé');
  const member = await prisma.allianceMember.findUnique({ where: { playerId } });
  if (!member || member.allianceId !== rally.allianceId) throw err(403, 'Ce rassemblement est celui d\'une autre alliance');
  const inRally = await prisma.army.findMany({ where: { rallyId: rally.id, status: { in: ['RALLY_JOIN', 'RALLY_WAIT'] } }, select: { ownerId: true } });
  if (inRally.some(a => a.ownerId === playerId)) throw err(400, 'Vous avez déjà une armée dans ce rassemblement');
  if (inRally.length >= rally.capacity) throw err(400, fullMessage(rally.capacity));
  const army = await freeArmy(armyId, playerId);
  const leaderCity = await prisma.city.findUnique({ where: { id: rally.cityId } });
  if (!leaderCity) throw err(400, 'La ville du lanceur a disparu');
  const seconds = army.cityId === leaderCity.id ? 0 : await travelSeconds(army, army.x, army.y, leaderCity.x, leaderCity.y);
  const arrivalAt = new Date(Date.now() + seconds * 1000);
  if (arrivalAt > rally.launchAt) throw err(400, `Votre armée n'arriverait pas à temps (${Math.ceil(seconds / 60)} min de marche, départ dans ${Math.max(0, Math.ceil((rally.launchAt - Date.now()) / 60000))} min)`);
  const data = seconds === 0
    ? { status: 'RALLY_WAIT', rallyId: rally.id, missionType: 'RALLY', targetX: leaderCity.x, targetY: leaderCity.y, arrivalAt: null }
    : { status: 'RALLY_JOIN', rallyId: rally.id, missionType: 'RALLY', targetX: leaderCity.x, targetY: leaderCity.y, departedAt: new Date(), arrivalAt };
  const ok = await prisma.$transaction(async (tx) => {
    // sous verrou du rassemblement, revérifié : un départ ou une annulation attend la fin de l'envoi (ou l'envoi voit qu'il
    // est parti), et deux envois simultanés du même joueur, ou pour la dernière place, ne passent pas tous les deux
    const [r] = await tx.$queryRaw`SELECT status FROM "Rally" WHERE id = ${rally.id} FOR UPDATE`;
    if (!r || r.status !== 'GATHERING') throw err(400, 'Ce rassemblement est déjà parti ou annulé');
    const inside = await tx.army.findMany({ where: { rallyId: rally.id, status: { in: ['RALLY_JOIN', 'RALLY_WAIT'] } }, select: { ownerId: true } });
    if (inside.some(a => a.ownerId === playerId)) throw err(400, 'Vous avez déjà une armée dans ce rassemblement');
    if (inside.length >= rally.capacity) throw err(400, fullMessage(rally.capacity));
    return tx.army.updateMany({ where: { id: army.id, status: 'IDLE' }, data });
  }, TX);
  if (ok.count !== 1) throw err(409, 'Armée déjà en mission');
  return { message: seconds ? `Armée en route vers le rassemblement (${Math.ceil(seconds / 60)} min)` : 'Armée dans le rassemblement', arrivalAt };
}

// une armée quitte le rassemblement : celle qui attend rentre depuis là où elle attend (la ville du lanceur), celle en
// route fait demi-tour
async function sendBack(army, leaderCity) {
  const { sendArmyHome } = require('../game/processors/armyProcessor');
  if (army.status === 'RALLY_JOIN') {
    const elapsed = Math.max(0, Date.now() - new Date(army.departedAt || Date.now()).getTime());
    const home = army.city || (army.cityId ? await prisma.city.findUnique({ where: { id: army.cityId } }) : null);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', missionType: 'RETURN', rallyId: null, targetX: home?.x ?? army.x, targetY: home?.y ?? army.y, departedAt: new Date(), arrivalAt: new Date(Date.now() + elapsed), claimedAt: null } });
    return;
  }
  if (army.cityId === leaderCity?.id) {   // l'armée du lanceur : déjà chez elle
    await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, rallyId: null, targetX: null, targetY: null, arrivalAt: null, claimedAt: null } });
    return;
  }
  // sa case d'attente (targetX/Y) : la ville du lanceur à son arrivée, même si cette capitale a été déplacée depuis
  const fromX = army.targetX ?? army.x, fromY = army.targetY ?? army.y;
  await prisma.army.update({ where: { id: army.id }, data: { rallyId: null, x: fromX, y: fromY } });
  await sendArmyHome(army, fromX, fromY, { rallyId: null });
}
async function leave(playerId, rallyId) {
  const rally = await prisma.rally.findUnique({ where: { id: String(rallyId) } });
  if (!rally || rally.status !== 'GATHERING') throw err(400, 'Ce rassemblement est déjà parti ou annulé');
  if (rally.leaderId === playerId) throw err(400, 'Le lanceur annule le rassemblement au lieu de le quitter');
  const army = await prisma.army.findFirst({ where: { rallyId: rally.id, ownerId: playerId, status: { in: ['RALLY_JOIN', 'RALLY_WAIT'] } }, include: ARMY_INCLUDE });
  if (!army) throw err(404, 'Vous n\'avez pas d\'armée dans ce rassemblement');
  await sendBack(army, await prisma.city.findUnique({ where: { id: rally.cityId } }));
  return { message: 'Votre armée quitte le rassemblement' };
}
async function cancel(playerId, rallyId, reason = null) {
  const rally = await prisma.rally.findUnique({ where: { id: String(rallyId) } });
  if (!rally || rally.status !== 'GATHERING') throw err(400, 'Ce rassemblement est déjà parti ou annulé');
  if (playerId && rally.leaderId !== playerId) throw err(403, 'Seul le lanceur annule le rassemblement');
  const ok = await prisma.rally.updateMany({ where: { id: rally.id, status: 'GATHERING' }, data: { status: 'CANCELLED', result: { reason: reason || 'annulé par le lanceur' } } });
  if (!ok.count) throw err(409, 'Ce rassemblement vient de partir');
  const leaderCity = await prisma.city.findUnique({ where: { id: rally.cityId } });
  const armies = await prisma.army.findMany({ where: { rallyId: rally.id, status: { in: ['RALLY_JOIN', 'RALLY_WAIT'] } }, include: ARMY_INCLUDE });
  for (const a of armies) {
    await sendBack(a, leaderCity);
    if (a.ownerId !== rally.leaderId) notify(a.ownerId, 'rally', '⚔️ Rassemblement annulé', `Le rassemblement contre ${targetLabel(rally)} (${rally.targetX}, ${rally.targetY}) est annulé${reason ? ` : ${reason}` : ''}. Votre armée rentre.`, { to: 'army', armyId: a.id });
  }
  return { message: 'Rassemblement annulé : les armées rentrent' };
}
async function launchNow(playerId, rallyId) {
  const rally = await prisma.rally.findUnique({ where: { id: String(rallyId) } });
  if (!rally || rally.status !== 'GATHERING') throw err(400, 'Ce rassemblement est déjà parti ou annulé');
  if (rally.leaderId !== playerId) throw err(403, 'Seul le lanceur fait partir le rassemblement');
  const city = await prisma.city.findUnique({ where: { id: rally.cityId }, select: { isSieged: true } });
  if (city?.isSieged) throw err(400, 'Ville assiégée : vos armées ne sortent que pour briser le siège');   // comme au lancement
  const r = await depart(rally, new Date());
  if (!r) {
    const after = await prisma.rally.findUnique({ where: { id: rally.id }, select: { status: true, result: true } });
    if (after?.status === 'CANCELLED') throw err(400, `Rassemblement annulé : ${after.result?.reason || 'aucune armée au départ'}`);
    throw err(409, 'Ce rassemblement vient de partir');
  }
  return { message: `Le rassemblement part : ${r.armies} armée${r.armies > 1 ? 's' : ''}, arrivée dans ${Math.ceil(r.seconds / 60)} min` };
}

// ---- départ : les armées arrivées partent ensemble, à la vitesse de la plus lente ----
async function depart(rally, now = new Date()) {
  let node, bastion = null;
  if (rally.targetBastionId) {
    try { bastion = await bastionTarget(rally.allianceId, rally.targetBastionId); } catch (e) { await cancel(null, rally.id, e.message).catch(() => {}); return null; }
    node = { x: bastion.x, y: bastion.y };
  } else {
    node = rally.targetNodeId ? await prisma.resourceNode.findUnique({ where: { id: rally.targetNodeId } }) : null;
    const gone = !node ? (kindOf(rally) === 'HORDE' ? 'le donjon est tombé ou reparti' : kindOf(rally) === 'PLAN' ? 'le plan a déjà été pris' : 'le site a disparu')
      : kindOf(rally) !== 'HORDE' && (!node.hasDefenders || node.cityId) ? 'les Immortels ont déjà été vaincus' : null;
    if (gone) { await cancel(null, rally.id, gone).catch(() => {}); return null; }
  }
  // la ville du lanceur disparue (compte supprimé, colonie rasée) : annulé, chacun rentre d'où il est ; assiégée : ses
  // armées ne sortent que pour briser le siège (comme au lancement), annulé aussi
  const leaderCity = await prisma.city.findUnique({ where: { id: rally.cityId } });
  if (!leaderCity || leaderCity.isSieged) { await cancel(null, rally.id, leaderCity ? 'la ville du lanceur est assiégée' : 'la ville du lanceur a disparu').catch(() => {}); return null; }
  const claimed = await prisma.rally.updateMany({ where: { id: rally.id, status: 'GATHERING' }, data: { status: 'MARCHING' } });
  if (!claimed.count) return null;
  await settleArrived(now, rally.id);   // arrivées depuis le dernier tick (« Partir maintenant ») : elles partent aussi
  const armies = await prisma.army.findMany({ where: { rallyId: rally.id, status: { in: ['RALLY_JOIN', 'RALLY_WAIT'] } }, include: ARMY_INCLUDE });
  // prêtes : arrivées, avec des soldats, et dans la ville du lanceur (pas restées à l'ancienne place d'une capitale déplacée)
  const ready = armies.filter(a => a.status === 'RALLY_WAIT' && unitCount(a.units) > 0 && a.x === leaderCity.x && a.y === leaderCity.y);
  for (const a of armies.filter(x => !ready.includes(x))) {   // les autres rentrent
    await sendBack(a, leaderCity);
    const why = a.status === 'RALLY_JOIN' ? 'Votre armée n\'était pas arrivée au départ du rassemblement' : unitCount(a.units) ? 'La ville du lanceur a été déplacée loin de votre armée' : 'Votre armée n\'a plus de soldats';
    notify(a.ownerId, 'rally', '⚔️ Rassemblement parti sans vous', `${why} : elle rentre.`, { to: 'army', armyId: a.id });
  }
  const noArmy = () => prisma.rally.update({ where: { id: rally.id }, data: { status: 'CANCELLED', result: { reason: 'aucune armée au départ' } } });
  if (!ready.length) { await noArmy(); return null; }
  const secs = new Map();   // le groupe marche à la vitesse de la plus lente
  for (const a of ready) secs.set(a.id, await travelSeconds(a, leaderCity.x, leaderCity.y, node.x, node.y));
  // sous verrou des armées : ne partent que celles encore là (un rappel ou un retrait pendant le calcul des routes n'est
  // pas écrasé) ; Bastion : pas de siège sans au moins un engin dans le groupe
  const out = await prisma.$transaction(async (tx) => {
    const ids = ready.map(a => a.id).sort();
    await tx.$queryRaw`SELECT id FROM "Army" WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
    const still = new Set((await tx.army.findMany({ where: { id: { in: ids }, rallyId: rally.id, status: 'RALLY_WAIT' }, select: { id: true } })).map(a => a.id));
    const group = ready.filter(a => still.has(a.id));
    if (!group.length || (bastion && group.reduce((t, a) => t + countSiegeEngines(a.units, unitsData), 0) < config.combat.siege.minEngines)) return { group, marched: false };
    const seconds = Math.max(...group.map(a => secs.get(a.id)));
    const arrivalAt = new Date(now.getTime() + seconds * 1000);
    await tx.army.updateMany({ where: { id: { in: group.map(a => a.id) } }, data: { status: 'RALLY_MARCH', x: leaderCity.x, y: leaderCity.y, targetX: node.x, targetY: node.y, targetBastionId: bastion ? bastion.bastionId : null, departedAt: now, arrivalAt } });
    await tx.rally.update({ where: { id: rally.id }, data: { arrivalAt, launchAt: now } });
    return { group, marched: true, seconds };
  }, TX);
  const { group, seconds } = out;
  if (!group.length) { await noArmy(); return null; }
  if (!out.marched) {
    await prisma.rally.update({ where: { id: rally.id }, data: { status: 'CANCELLED', result: { reason: 'aucun engin de siège' } } });
    for (const a of group) {
      await sendBack(a, leaderCity);
      notify(a.ownerId, 'rally', '⚔️ Rassemblement annulé', `Pas d'engin de siège dans le rassemblement contre ${bastion.label} : il est annulé, votre armée rentre.`, { to: 'army', armyId: a.id });
    }
    return null;
  }
  for (const a of group) notify(a.ownerId, 'rally', '⚔️ Le rassemblement part', `${group.length} armée${group.length > 1 ? 's' : ''} en route vers ${bastion ? bastion.label : targetLabel(rally)} (${node.x}, ${node.y}) : arrivée dans ${Math.ceil(seconds / 60)} min.`, { to: 'map', x: node.x, y: node.y });
  if (bastion) {   // l'alliance du Bastion est prévenue, comme pour une armée seule
    const leaderName = group.find(a => a.ownerId === rally.leaderId)?.owner?.name || group[0].owner?.name || 'Une alliance';
    const members = await prisma.allianceMember.findMany({ where: { allianceId: bastion.ownerAllianceId }, select: { playerId: true } });
    for (const mm of members) notify(mm.playerId, 'attack_incoming', '⚔️ Bastion menacé', `Le rassemblement de ${leaderName} (${group.length} armée${group.length > 1 ? 's' : ''}) marche sur le Bastion de l'alliance (arrivée dans ${Math.max(1, Math.ceil(seconds / 60))} min).`, { to: 'map', x: node.x, y: node.y });
  }
  return { armies: group.length, seconds };
}

// ---- arrivée au donjon (ou devant les Immortels) : un seul combat, puis chacun rentre ----
async function fight(rally) {
  const claimed = await prisma.rally.updateMany({ where: { id: rally.id, status: 'MARCHING' }, data: { status: 'DONE' } });
  if (!claimed.count) return null;
  const armies = await prisma.army.findMany({ where: { rallyId: rally.id, status: 'RALLY_MARCH' }, include: ARMY_INCLUDE });
  if (!armies.length) {   // toutes rappelées ou battues en route : ni combat, ni camp, ni alerte au défenseur
    await prisma.rally.update({ where: { id: rally.id }, data: { result: { gone: true, reason: 'aucune armée' } } });
    return { gone: true };
  }
  if (rally.targetBastionId) return campAtBastion(rally, armies);
  const ids = [...armies.filter(a => a.ownerId === rally.leaderId), ...armies.filter(a => a.ownerId !== rally.leaderId)].map(a => a.id);
  if (kindOf(rally) !== 'HORDE') return fightImmortals(rally, armies, ids);
  const H = require('./hordeService');
  let r = { gone: true };
  try { if (ids.length) r = await H.attackHordeGroup(ids, rally.targetNodeId); } catch (e) { console.error('[RALLY] combat :', e.message); }
  const { sendArmyHome } = require('../game/processors/armyProcessor');
  for (const a of armies) {
    await prisma.army.update({ where: { id: a.id }, data: { x: rally.targetX, y: rally.targetY, rallyId: null } });
    await sendArmyHome(a, rally.targetX, rally.targetY, { rallyId: null });
  }
  await prisma.rally.update({ where: { id: rally.id }, data: { result: r.gone ? { gone: true } : { won: r.won, floor: r.floor, destroyed: r.destroyed, points: r.points, armies: ids.length } } });
  if (r.gone) for (const a of armies) notify(a.ownerId, 'rally', '⚔️ Donjon disparu', `Le donjon (${rally.targetX}, ${rally.targetY}) était déjà tombé ou reparti : votre armée rentre.`, { to: 'army', armyId: a.id });
  else H.announceOutcome(null, r);
  return r;
}

// ---- arrivée devant les Immortels d'un site ou d'un plan : un seul combat de groupe, puis chacun rentre ----
async function fightImmortals(rally, armies, ids) {
  const WS = require('./wonderService');
  let r = { gone: true };
  try { r = await WS.attackImmortalsGroup(ids, rally.targetNodeId, rally.leaderId); } catch (e) { console.error('[RALLY] Immortels :', e.message); }
  const { sendArmyHome } = require('../game/processors/armyProcessor');
  for (const a of armies) {
    await prisma.army.update({ where: { id: a.id }, data: { x: rally.targetX, y: rally.targetY, rallyId: null } });
    await sendArmyHome(a, rally.targetX, rally.targetY, { rallyId: null });
  }
  const what = targetLabel(rally);
  await prisma.rally.update({ where: { id: rally.id }, data: { result: r.gone ? { gone: true } : { won: r.won, kind: r.kind, plan: r.plan, captorId: r.captorId, armies: r.armies.length } } });
  if (r.gone) {
    for (const a of armies) notify(a.ownerId, 'rally', '⚔️ Immortels déjà vaincus', `Plus d'Immortels à combattre devant ${what} (${rally.targetX}, ${rally.targetY}) : votre armée rentre.`, { to: 'army', armyId: a.id });
    return r;
  }
  const prize = r.kind === 'PLAN' ? `le plan revient à ${r.captorName || 'son lanceur'}` : 'le site est libre 24 h : fondez-y la Ville Merveille de l\'alliance avec un colon';
  for (const p of r.armies) {
    notify(p.ownerId, 'rally', r.won ? '⚔️ Immortels vaincus' : '⚔️ Rassemblement repoussé', r.won ? `Le rassemblement a battu les Immortels de ${what} (${r.x}, ${r.y}) : ${prize}.` : `Les Immortels de ${what} (${r.x}, ${r.y}) ont repoussé le rassemblement (${p.lost} pertes pour ${p.name}) ; leur garnison reste entamée.`, { to: 'report', reportId: p.reportId, x: r.x, y: r.y });
  }
  return r;
}

// ---- arrivée devant un Bastion : tout le groupe campe 1 h, puis un seul assaut (bastionService.handleBastionBattle) ----
// L'armée du lanceur finit de camper la première (1 ms plus tôt) et entraîne les autres armées du camp de son alliance ;
// c'est toujours le héros de l'armée du lanceur qui mène l'assaut et donne ses bonus (aucun si elle a été rappelée).
async function campAtBastion(rally, armies) {
  const { sendArmyHome } = require('../game/processors/armyProcessor');
  const now = new Date();
  let bastion = null;
  try { bastion = await bastionTarget(rally.allianceId, rally.targetBastionId); } catch (e) { bastion = null; }
  if (!bastion) {
    for (const a of armies) {
      await prisma.army.update({ where: { id: a.id }, data: { x: rally.targetX, y: rally.targetY, rallyId: null, targetBastionId: null } });
      await sendArmyHome(a, rally.targetX, rally.targetY, { rallyId: null, targetBastionId: null });
      notify(a.ownerId, 'rally', '⚔️ Bastion hors d\'atteinte', `Le Bastion (${rally.targetX}, ${rally.targetY}) est tombé, inachevé ou devenu allié : votre armée rentre.`, { to: 'army', armyId: a.id });
    }
    await prisma.rally.update({ where: { id: rally.id }, data: { result: { gone: true } } });
    return { gone: true };
  }
  const end = now.getTime() + config.combat.siege.campMinutes * 60000;
  const ordered = [...armies.filter(a => a.ownerId === rally.leaderId), ...armies.filter(a => a.ownerId !== rally.leaderId)];
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < ordered.length; i++) {
      await tx.army.update({ where: { id: ordered[i].id }, data: { status: 'BESIEGING', missionType: 'BASTION_ATTACK', x: bastion.x, y: bastion.y, targetX: bastion.x, targetY: bastion.y, targetBastionId: bastion.bastionId, departedAt: now, arrivalAt: new Date(end + i), claimedAt: null } });   // rallyId gardé : l'assaut retrouve le lanceur
    }
    if (ordered.length) await tx.bastion.update({ where: { id: bastion.bastionId }, data: { isSieged: true } });
  }, TX);
  await prisma.rally.update({ where: { id: rally.id }, data: { result: { camp: true, armies: ordered.length, bastionId: bastion.bastionId } } });
  const minutes = config.combat.siege.campMinutes;
  for (const a of ordered) notify(a.ownerId, 'battle', '⛺ Camp du rassemblement', `${ordered.length} armée${ordered.length > 1 ? 's' : ''} campe${ordered.length > 1 ? 'nt' : ''} devant ${bastion.label} : assaut dans ${minutes} min.`, { to: 'map', x: bastion.x, y: bastion.y });
  const members = await prisma.allianceMember.findMany({ where: { allianceId: bastion.ownerAllianceId }, select: { playerId: true } });
  for (const mm of members) notify(mm.playerId, 'attack_incoming', '🏰 Bastion assiégé', `Un rassemblement de ${ordered.length} armée${ordered.length > 1 ? 's' : ''} campe devant le Bastion : assaut dans ${minutes} min. Brisez le siège avant.`, { to: 'map', x: bastion.x, y: bastion.y });
  return { camp: true, armies: ordered.length };
}

// ---- tick ----
// armées arrivées chez le lanceur (toutes, ou celles d'un rassemblement) : elles attendent sur sa case, posée dans la
// même écriture (un départ ne voit jamais une armée arrivée encore placée chez elle) ; celles qui attendent déjà ne
// bougent plus
async function settleArrived(now, rallyId = null) {
  const arrived = await prisma.army.findMany({ where: { ...(rallyId ? { rallyId } : {}), status: 'RALLY_JOIN', arrivalAt: { lte: now } }, select: { id: true, targetX: true, targetY: true } });
  for (const a of arrived) {
    await prisma.army.updateMany({ where: { id: a.id, status: 'RALLY_JOIN', arrivalAt: { lte: now } }, data: { status: 'RALLY_WAIT', arrivalAt: null, ...(a.targetX !== null ? { x: a.targetX, y: a.targetY } : {}) } });
  }
}
async function processRallies(now = new Date()) {
  await settleArrived(now);
  for (const r of await prisma.rally.findMany({ where: { status: 'GATHERING', launchAt: { lte: now } } })) {
    try { await depart(r, now); } catch (e) { console.error('[RALLY] départ :', e.message); }
  }
  for (const r of await prisma.rally.findMany({ where: { status: 'MARCHING', arrivalAt: { lte: now } } })) {
    try { await fight(r); } catch (e) { console.error('[RALLY] arrivée :', e.message); }
  }
}

// ---- lecture ----
async function listForPlayer(playerId, nodeId = null, bastionId = null) {
  const member = await prisma.allianceMember.findUnique({ where: { playerId } });
  if (!member) return { rallies: [], inAlliance: false };
  const where = { allianceId: member.allianceId, status: { in: ['GATHERING', 'MARCHING'] }, ...(nodeId ? { targetNodeId: String(nodeId) } : {}), ...(bastionId ? { targetBastionId: String(bastionId) } : {}) };
  const rallies = await prisma.rally.findMany({ where, orderBy: { launchAt: 'asc' } });
  const out = [];
  for (const r of rallies) {
    const armies = await prisma.army.findMany({ where: { rallyId: r.id, status: { in: ['RALLY_JOIN', 'RALLY_WAIT', 'RALLY_MARCH'] } }, include: { units: true, owner: { select: { id: true, name: true } } } });
    const kind = kindOf(r);
    const horde = r.targetNodeId && kind === 'HORDE' ? await prisma.horde.findUnique({ where: { nodeId: r.targetNodeId }, select: { level: true, floor: true } }) : null;
    const guard = r.targetNodeId && kind !== 'HORDE' ? await prisma.resourceNode.findUnique({ where: { id: r.targetNodeId }, select: { defenderPower: true, hasDefenders: true } }) : null;
    const bastion = r.targetBastionId ? await prisma.bastion.findUnique({ where: { id: r.targetBastionId }, select: { alliance: { select: { tag: true } } } }) : null;
    const leader = await prisma.player.findUnique({ where: { id: r.leaderId }, select: { name: true } });
    out.push({
      id: r.id, status: r.status, leader: leader?.name || '?', mine: r.leaderId === playerId, targetNodeId: r.targetNodeId, targetBastionId: r.targetBastionId, kind, bastionTag: bastion?.alliance?.tag || null, x: r.targetX, y: r.targetY,
      level: horde?.level || null, floor: horde?.floor || null, guardPower: guard ? (guard.hasDefenders ? guard.defenderPower : 0) : null,   // WONDER, PLAN : puissance des Immortels
      launchAt: r.launchAt, arrivalAt: r.arrivalAt, maxArmies: r.capacity, waitMinutes: r.waitMinutes,
      joined: armies.some(a => a.ownerId === playerId),
      armies: armies.map(a => ({ id: a.id, owner: a.owner.name, mine: a.ownerId === playerId, status: a.status, arrivalAt: a.arrivalAt, units: unitCount(a.units), power: Math.round(calculateArmyPower(a.units, unitsData)) })),
      power: armies.reduce((t, a) => t + Math.round(calculateArmyPower(a.units, unitsData)), 0)
    });
  }
  return { rallies: out, inAlliance: true };
}

module.exports = { WAITS, KIND_LABEL, kindOf, capacityFor, launch, join, leave, cancel, launchNow, depart, fight, processRallies, listForPlayer };
