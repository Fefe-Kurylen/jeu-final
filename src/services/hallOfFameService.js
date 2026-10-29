// ============================================================
// Fin d'un monde et monde suivant (décision du 28 octobre 2026)
// - Une Merveille atteint le niveau 100 : le monde est fini (WorldConfig.endedAt). Panthéon : l'alliance victorieuse et
//   le top 10 en population, attaque, défense et des alliances, gardés d'un monde à l'autre (HallOfFame). Titres sur les
//   comptes. Le monde fini se lit encore mais ne se joue plus (middleware worldOpen) jusqu'au nouveau monde.
// - Nouveau monde (tools/nouveau-monde.cjs, par l'équipe) : on garde le compte, le joueur (pseudo, or, abonnement Plus,
//   achats et cosmétiques), ses médailles, ses titres et le Panthéon ; tout le jeu repart à zéro (villes, armées, héros,
//   alliances…) sur une nouvelle carte. Chaque joueur rejoint le nouveau monde en choisissant sa civilisation.
// ============================================================
const prisma = require('../config/database');
const { notify } = require('./pushService');

const TITLE = {
  WONDER: (w, r) => r === 1 ? `Bâtisseur de la Merveille (monde ${w})` : null,
  POPULATION: (w, r) => `${r === 1 ? 'Premier' : `${r}e`} en population (monde ${w})`,
  ATTACK: (w, r) => `${r === 1 ? 'Premier' : `${r}e`} attaquant (monde ${w})`,
  DEFENSE: (w, r) => `${r === 1 ? 'Premier' : `${r}e`} défenseur (monde ${w})`
};

async function topPlayers(sql) {
  return prisma.$queryRawUnsafe(`SELECT p.id, p.name, p."accountId", ${sql}::int AS value FROM "Player" p LEFT JOIN "PlayerStats" s ON s."playerId" = p.id WHERE ${sql} > 0 ORDER BY ${sql} DESC, p.name LIMIT 10`);
}
async function addTitle(accountId, title) {
  if (!accountId || !title) return;
  const acc = await prisma.account.findUnique({ where: { id: accountId }, select: { titles: true } });
  const titles = Array.isArray(acc?.titles) ? acc.titles : [];
  if (!titles.includes(title)) await prisma.account.update({ where: { id: accountId }, data: { titles: [...titles, title] } });
}

// city : la Ville Merveille victorieuse ; null quand l'équipe termine le monde (écran d'administration) : la Merveille la
// plus haute l'emporte s'il y en a une, sinon le monde finit sans vainqueur
async function endWorld(city, now = new Date(), { byStaff = false } = {}) {
  if (!city && byStaff) city = await prisma.city.findFirst({ where: { isWonder: true, wonderLevel: { gte: 1 } }, orderBy: [{ wonderLevel: 'desc' }, { createdAt: 'asc' }], include: { player: { include: { alliance: { include: { alliance: true } } } } } });
  const allianceName = !city ? 'Aucun vainqueur' : city.player?.alliance?.alliance ? `[${city.player.alliance.alliance.tag}] ${city.player.alliance.alliance.name}` : city.player?.name || 'Inconnu';
  const ok = await prisma.worldConfig.updateMany({ where: { id: 1, endedAt: null }, data: { endedAt: now, winnerAllianceId: city?.player?.alliance?.allianceId || null, winnerName: city ? `${allianceName} — ${city.name}` : 'Aucun vainqueur (monde terminé par l\'équipe)' } });
  if (!ok.count) return null;
  require('./wonderService').forgetEnded();
  const world = (await prisma.worldConfig.findUnique({ where: { id: 1 } })).number;
  const rows = city ? [{ world, endedAt: now, category: 'WONDER', rank: 1, name: allianceName, accountId: null, value: city.wonderLevel }] : [];
  const members = !city ? [] : city.player?.alliance?.allianceId ? await prisma.allianceMember.findMany({ where: { allianceId: city.player.alliance.allianceId }, include: { player: { select: { accountId: true } } } }) : [{ player: { accountId: city.player?.accountId } }];
  for (const m of members) await addTitle(m.player?.accountId, TITLE.WONDER(world, 1));
  for (const [cat, sql] of [['POPULATION', 'p.population'], ['ATTACK', 'COALESCE(s."attackPoints", 0)'], ['DEFENSE', 'COALESCE(s."defensePoints", 0)']]) {
    (await topPlayers(sql)).forEach((r, i) => rows.push({ world, endedAt: now, category: cat, rank: i + 1, name: r.name, accountId: r.accountId, value: r.value }));
  }
  const alliances = await prisma.$queryRawUnsafe(`SELECT a.tag, a.name, SUM(p.population)::int AS value FROM "Alliance" a JOIN "AllianceMember" m ON m."allianceId" = a.id JOIN "Player" p ON p.id = m."playerId" GROUP BY a.id, a.tag, a.name ORDER BY value DESC LIMIT 10`);
  alliances.forEach((a, i) => rows.push({ world, endedAt: now, category: 'ALLIANCE', rank: i + 1, name: `[${a.tag}] ${a.name}`, accountId: null, value: a.value }));
  if (rows.length) await prisma.hallOfFame.createMany({ data: rows });
  for (const r of rows) if (r.accountId && TITLE[r.category] && r.rank <= 3) await addTitle(r.accountId, TITLE[r.category](world, r.rank));
  await prisma.$executeRaw`INSERT INTO "Notification" ("id", "playerId", "kind", "title", "body", "link") SELECT gen_random_uuid(), p.id, 'world', ${'🏆 Le monde est terminé'}, ${city && !byStaff ? `La Merveille de ${city.name} atteint le niveau 100 : ${allianceName} remporte le monde ${world}. Le Panthéon garde le classement final ; un nouveau monde ouvre bientôt.` : `L'équipe du jeu a terminé le monde ${world}${city ? ` : ${allianceName} l'emporte avec la Merveille de ${city.name} (niveau ${city.wonderLevel})` : ''}. Le Panthéon garde le classement final ; un nouveau monde ouvre bientôt.`}, ${JSON.stringify({ to: 'ranking', tab: 'ranking' })}::jsonb FROM "Player" p`;
  console.log(`[MONDE] monde ${world} terminé : ${allianceName}`);
  return { world, winner: allianceName };
}

// Panthéon : les mondes terminés, leur classement final
async function hallOfFame() {
  const rows = await prisma.hallOfFame.findMany({ orderBy: [{ world: 'desc' }, { category: 'asc' }, { rank: 'asc' }], take: 1000 });
  const worlds = new Map();
  for (const r of rows) {
    if (!worlds.has(r.world)) worlds.set(r.world, { world: r.world, endedAt: r.endedAt, categories: {} });
    (worlds.get(r.world).categories[r.category] ||= []).push({ rank: r.rank, name: r.name, value: r.value });
  }
  return [...worlds.values()];
}

// Nouveau monde : tout le jeu repart à zéro, comptes, joueurs (pseudo, or, Plus, achats, cosmétiques), médailles, titres
// et Panthéon gardés. La carte est tirée à nouveau au prochain démarrage (WorldConfig recréée, numéro + 1).
const GAME_TABLES = ['ArmyUnit', 'Army', 'WoundedUnit', 'BuildQueueItem', 'RecruitQueueItem', 'ResearchQueueItem', 'CityBuilding', 'MarketOffer', 'TradeConvoy', 'TradeRoute', 'Spy', 'SpyReport', 'BattleReport', 'Expedition', 'HeroItem', 'Hero', 'City', 'ResourceNode', 'Bastion', 'AllianceHelp', 'AllianceHelpRequest', 'AllianceAllyRequest', 'AllianceDiplomacy', 'AllianceInvite', 'AllianceMember', 'Alliance', 'PlayerTechnology', 'PlayerStats', 'PlayerWeekStats', 'QuestCounter', 'QuestClaim', 'WonderPlan', 'Notification', 'RankingWeek', 'HordeDamage', 'Horde', 'Invasion'];
async function newWorld({ force = false } = {}) {
  const old = await prisma.worldConfig.findUnique({ where: { id: 1 } });
  if (old && !old.endedAt && !force) throw new Error('Le monde en cours n\'est pas terminé (option --force pour le remettre à zéro quand même)');
  const last = await prisma.hallOfFame.aggregate({ _max: { world: true } });
  const number = (last._max.world || 0) + 1;   // numéro que prendra le monde suivant (src/game/world.js)
  const existing = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`)).map(r => r.table_name);
  const tables = GAME_TABLES.filter(t => existing.includes(t));
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t}"`).join(', ')} CASCADE`);
    await tx.player.updateMany({ data: { population: 0, alliancePoints: 0, tutorialDone: false } });
    await tx.$executeRawUnsafe(`DELETE FROM "ChatMessage" WHERE channel LIKE 'alliance:%'`).catch(() => {});
    // la carte du monde suivant est tirée au prochain démarrage (src/game/world.js), numérotée d'après le Panthéon
    await tx.worldConfig.deleteMany({});
  }, { timeout: 120000 });
  return { number, tables: tables.length };
}

// Monde suivant demandé depuis l'écran d'administration (WorldConfig.resetRequestedAt) : le worker de tick le prépare
// entre deux ticks, sans redémarrer le serveur : remise à zéro, nouvelle carte, points de ressource, ouverture. Les autres
// processus relisent la graine (src/server.js). Les joueurs le rejoignent en choisissant leur civilisation.
async function prepareNextWorld() {
  const row = await prisma.worldConfig.findUnique({ where: { id: 1 }, select: { resetRequestedAt: true, resetRequestedBy: true } });
  if (row && !row.resetRequestedAt) return null;
  // plus de ligne WorldConfig en cours de partie : une préparation interrompue après la remise à zéro, on la termine
  if (!row && (await prisma.city.count()) > 0) return null;
  const started = Date.now();
  const { number, tables } = row ? await newWorld({ force: true }) : { number: ((await prisma.hallOfFame.aggregate({ _max: { world: true } }))._max.world || 0) + 1, tables: 0 };   // l'écran a déjà vérifié (monde fini, ou confirmation tapée)
  const world = require('../game/world');
  const seed = require('../game/seed');
  await world.loadWorldSeed({ setup: true });
  await seed.seedResourceNodes();
  await prisma.$executeRawUnsafe(`COMMENT ON TABLE "ResourceNode" IS '${seed.RESEED_VERSION}'`);
  await world.openWorld({ setup: true });
  require('./wonderService').forgetEnded();
  await prisma.$executeRaw`INSERT INTO "Notification" ("id", "playerId", "kind", "title", "body", "link") SELECT gen_random_uuid(), p.id, 'world', ${`🌍 Le monde ${number} est ouvert`}, ${'Une nouvelle carte vous attend : choisissez votre civilisation pour recevoir votre capitale. Vos achats, cosmétiques, médailles et titres vous suivent.'}, ${JSON.stringify({ to: 'city' })}::jsonb FROM "Player" p`;
  await require('./adminService').writeLog(prisma, { accountId: null, name: row?.resetRequestedBy || 'système' }, 'WORLD_OPENED', null, { number, tables, seconds: Math.round((Date.now() - started) / 1000) });
  console.log(`[MONDE] monde ${number} ouvert (${tables} tables remises à zéro, ${Math.round((Date.now() - started) / 1000)} s)`);
  return { number };
}

// Rejoindre le monde en cours (après un nouveau monde) : le joueur choisit sa civilisation, reçoit sa capitale
async function joinWorld(playerId, faction) {
  const { lockPlacement } = require('../utils/spawn');
  const blocked = await require('./wonderService').registrationBlocked();
  if (blocked) throw Object.assign(new Error(blocked), { status: 403, expose: true });
  return prisma.$transaction(async (tx) => {
    await lockPlacement(tx);
    const player = await tx.player.findUnique({ where: { id: playerId } });
    if (!player) throw Object.assign(new Error('Joueur introuvable'), { status: 404, expose: true });
    if (await tx.city.count({ where: { playerId } })) throw Object.assign(new Error('Vous êtes déjà dans ce monde'), { status: 400, expose: true });
    await tx.player.update({ where: { id: playerId }, data: { faction } });
    const city = await require('./startService').createStart(tx, { playerId, name: player.name });
    return { message: `Bienvenue dans ce nouveau monde : ${city.name} vous attend en (${city.x}, ${city.y})`, cityId: city.id };
  }, { timeout: 20000 });
}

module.exports = { endWorld, hallOfFame, newWorld, prepareNextWorld, joinWorld, GAME_TABLES, TITLE };
