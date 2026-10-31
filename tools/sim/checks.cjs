// Contrôles et mesures de la simulation longue (tools/sim/sim.cjs), lus directement dans la base de la simulation.
// invariants() : ce qui ne doit jamais arriver (ressources négatives, armées bloquées, sièges sans camp…)
// snapshot()   : l'état de chaque joueur et du monde, chaque semaine (progression, puissance, activité des systèmes)
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { calculateArmyPower } = require(path.join(ROOT, 'src/utils/calculations'));
const { unitsData, buildingsData } = require(path.join(ROOT, 'src/config/gamedata'));
const config = require(path.join(ROOT, 'src/config'));

// placement (décision du 30 octobre 2026), lu dans les données : bâtiments de la capitale seulement, des colonies seulement
const CAPITAL_ONLY = buildingsData.filter(b => b.effects?.capitalOnly).map(b => b.key);
const COLONY_ONLY = buildingsData.filter(b => b.effects?.notInCapital).map(b => b.key);
const MOVING = ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING', 'SUPPORTING', 'RALLY_JOIN', 'RALLY_MARCH', 'BESIEGING'];

async function invariants(prisma, clock) {
  const late = new Date(clock.now() - 13 * 3600000);   // deux pas de 6 h et un peu : une arrivée aurait dû être jouée
  const q = (sql, ...a) => prisma.$queryRawUnsafe(sql, ...a);
  const out = [];
  const add = async (check, sql, ...a) => {
    const rows = await q(sql, ...a);
    if (rows.length) out.push({ check, count: rows.length, sample: rows.slice(0, 5) });
  };
  await add('ressources négatives', `SELECT id, name, wood, stone, iron, food FROM "City" WHERE wood < -0.5 OR stone < -0.5 OR iron < -0.5 OR food < -0.5`);
  await add('ressources au-dessus du stockage', `SELECT id, name, wood, stone, iron, food, "maxStorage", "maxFoodStorage" FROM "City" WHERE NOT "isWonder" AND (wood > "maxStorage" * 1.02 + 1 OR stone > "maxStorage" * 1.02 + 1 OR iron > "maxStorage" * 1.02 + 1 OR food > "maxFoodStorage" * 1.02 + 1)`);
  await add('armée en marche bloquée (arrivée passée non jouée)', `SELECT id, name, status, "missionType", "arrivalAt", "claimedAt" FROM "Army" WHERE status = ANY($1) AND "arrivalAt" < $2`, MOVING, late);
  await add('armée en marche sans heure d\'arrivée', `SELECT id, name, status, "missionType" FROM "Army" WHERE status = ANY($1) AND "arrivalAt" IS NULL`, MOVING.filter(s => s !== 'BESIEGING'));
  await add('arrivée réservée jamais terminée', `SELECT id, name, status, "missionType", "claimedAt" FROM "Army" WHERE "claimedAt" IS NOT NULL AND "claimedAt" < $1`, late);
  await add('effectif négatif', `SELECT "armyId", "unitKey", count FROM "ArmyUnit" WHERE count < 0`);
  await add('héros dans deux armées', `SELECT "heroId", count(*)::int AS n FROM "Army" WHERE "heroId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1`);
  await add('rassemblement qui ne part pas', `SELECT id, status, "launchAt" FROM "Rally" WHERE status = 'GATHERING' AND "launchAt" < $1`, late);
  await add('rassemblement qui n\'arrive pas', `SELECT id, status, "arrivalAt" FROM "Rally" WHERE status = 'MARCHING' AND "arrivalAt" < $1`, late);
  await add('armée de rassemblement orpheline', `SELECT a.id, a.status FROM "Army" a LEFT JOIN "Rally" r ON r.id = a."rallyId" WHERE a.status IN ('RALLY_JOIN','RALLY_WAIT','RALLY_MARCH') AND (r.id IS NULL OR r.status NOT IN ('GATHERING','MARCHING'))`);
  await add('ville assiégée sans camp', `SELECT c.id, c.name FROM "City" c WHERE c."isSieged" AND NOT EXISTS (SELECT 1 FROM "Army" a WHERE a.status = 'BESIEGING' AND a."targetCityId" = c.id)`);
  await add('Bastion assiégé sans camp', `SELECT b.id FROM "Bastion" b WHERE b."isSieged" AND NOT EXISTS (SELECT 1 FROM "Army" a WHERE a.status = 'BESIEGING' AND a."targetBastionId" = b.id)`);
  await add('camp devant une cible qui n\'est pas marquée assiégée', `SELECT a.id, a."targetCityId", a."targetBastionId" FROM "Army" a LEFT JOIN "City" c ON c.id = a."targetCityId" LEFT JOIN "Bastion" b ON b.id = a."targetBastionId" WHERE a.status = 'BESIEGING' AND a."claimedAt" IS NULL AND ((c.id IS NOT NULL AND NOT c."isSieged") OR (b.id IS NOT NULL AND NOT b."isSieged"))`);
  await add('garnison d\'un Bastion disparu ou rasé', `SELECT a.id FROM "Army" a LEFT JOIN "Bastion" b ON b.id = a."targetBastionId" WHERE a.status = 'STATIONED' AND a."targetBastionId" IS NOT NULL AND (b.id IS NULL OR b.status = 'DESTROYED')`);
  await add('alliance au-delà du nombre de membres permis', `SELECT "allianceId", count(*)::int AS n FROM "AllianceMember" GROUP BY 1 HAVING count(*) > $1`, config.alliance.maxMembers);   // 60 (décision du 30 octobre 2026)
  await add('or ou points d\'alliance négatifs', `SELECT id, name, gold, "alliancePoints" FROM "Player" WHERE gold < 0 OR "alliancePoints" < 0`);
  await add('armée d\'une ville qui n\'est pas à son propriétaire', `SELECT a.id, a.name, a.status FROM "Army" a JOIN "City" c ON c.id = a."cityId" WHERE a."ownerId" <> c."playerId"`);
  await add('plusieurs capitales', `SELECT "playerId", count(*)::int AS n FROM "City" WHERE "isCapital" GROUP BY 1 HAVING count(*) > 1`);
  await add('joueur avec des villes mais sans capitale', `SELECT "playerId" FROM "City" GROUP BY 1 HAVING bool_or("isCapital") = false`);
  await add('file de construction en retard', `SELECT id, "cityId", "buildingKey", "endsAt" FROM "BuildQueueItem" WHERE "endsAt" < $1`, late);
  await add('recrutement en retard', `SELECT id, "cityId", "endsAt" FROM "RecruitQueueItem" WHERE "endsAt" < $1`, late).catch(() => {});
  await add('recherche en retard', `SELECT id, "playerId", "endsAt" FROM "ResearchQueueItem" WHERE "endsAt" < $1`, late);
  await add('bâtiment mal placé (capitale / colonie) ou disparu des données', `SELECT b."cityId", b.key, c."isCapital" FROM "CityBuilding" b JOIN "City" c ON c.id = b."cityId" WHERE (c."isCapital" AND b.key = ANY($1)) OR (NOT c."isCapital" AND b.key = ANY($2)) OR NOT (b.key = ANY($3))`, COLONY_ONLY, CAPITAL_ONLY, buildingsData.map(b => b.key));
  // Mur sur l'enceinte (décision du 30 octobre 2026) : toujours à sa place fixe, qu'aucun autre bâtiment ne prend
  await add('Mur hors de l\'enceinte, ou autre bâtiment sur la place du Mur', `SELECT "cityId", key, slot FROM "CityBuilding" WHERE (key = 'WALL') <> (slot = $1) UNION ALL SELECT "cityId", "buildingKey", slot FROM "BuildQueueItem" WHERE ("buildingKey" = 'WALL') <> (slot = $1)`, config.city.wallSlot);
  // pas de garnison propre dans les colonies (§ 1 bis) : une colonie fondée n'en reçoit pas
  await add('garnison dans une colonie', `SELECT a.id, a."cityId" FROM "Army" a JOIN "City" c ON c.id = a."cityId" WHERE a."isGarrison" AND NOT c."isCapital"`);
  await add('bâtiment au-dessus du Bâtiment principal', `SELECT b."cityId", b.key, b.level, m.level AS hall FROM "CityBuilding" b JOIN "CityBuilding" m ON m."cityId" = b."cityId" AND m.key = 'MAIN_HALL' WHERE b.key <> 'MAIN_HALL' AND b.level > m.level`);
  await add('espion bloqué', `SELECT id, status, "arrivalAt", "returnAt" FROM "Spy" WHERE status <> 'IDLE' AND COALESCE("returnAt", "arrivalAt") < $1`, late).catch(() => {});
  return out.map(o => ({ ...o, sample: JSON.parse(JSON.stringify(o.sample, (k, v) => (typeof v === 'bigint' ? Number(v) : v))) }));
}

async function snapshot(prisma, clock, bots) {
  const since = new Date(clock.now() - 7 * 86400000);
  const q = (sql, ...a) => prisma.$queryRawUnsafe(sql, ...a);
  const players = await prisma.player.findMany({ select: { id: true, name: true, faction: true, population: true, gold: true, alliancePoints: true, alliance: { select: { allianceId: true } }, hero: { select: { level: true, diedAt: true } } } });
  const cities = await prisma.city.findMany({ select: { id: true, playerId: true, isCapital: true, isWonder: true, wonderLevel: true, wood: true, stone: true, iron: true, food: true, buildings: { select: { key: true, level: true } } } });
  const armies = await prisma.army.findMany({ select: { ownerId: true, status: true, units: { select: { unitKey: true, count: true } } } });
  const techs = await q(`SELECT "playerId", sum(level)::int AS lv FROM "PlayerTechnology" GROUP BY 1`);
  const techBy = new Map(techs.map(t => [t.playerId, t.lv]));
  const groupOf = new Map(bots.map(b => [b.playerId, b.group]));
  const per = players.map(p => {
    const cs = cities.filter(c => c.playerId === p.id);
    const as = armies.filter(a => a.ownerId === p.id);
    const units = as.flatMap(a => a.units);
    const hall = Math.max(0, ...cs.flatMap(c => c.buildings.filter(b => b.key === 'MAIN_HALL').map(b => b.level)));
    const fields = cs.flatMap(c => c.buildings.filter(b => ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE'].includes(b.key)).map(b => b.level));
    return {
      id: p.id, name: p.name, faction: p.faction, group: groupOf.get(p.id) || null, alliance: p.alliance?.allianceId || null,
      population: p.population, cities: cs.length, hall, levels: cs.reduce((t, c) => t + c.buildings.reduce((u, b) => u + b.level, 0), 0),
      fieldsAvg: fields.length ? Math.round(fields.reduce((t, x) => t + x, 0) / fields.length * 10) / 10 : 0,
      tech: techBy.get(p.id) || 0, units: units.reduce((t, u) => t + u.count, 0), power: Math.round(calculateArmyPower(units, unitsData)),
      stock: Math.round(cs.reduce((t, c) => t + c.wood + c.stone + c.iron + c.food, 0)), gold: p.gold, ap: p.alliancePoints,
      hero: p.hero ? (p.hero.diedAt ? -p.hero.level : p.hero.level) : 0
    };
  });
  const factions = {};
  for (const f of [...new Set(per.map(p => p.faction))]) {
    const ps = per.filter(p => p.faction === f);
    const avg = (k) => Math.round(ps.reduce((t, p) => t + p[k], 0) / ps.length);
    factions[f] = { n: ps.length, population: avg('population'), power: avg('power'), cities: Math.round(ps.reduce((t, p) => t + p.cities, 0) / ps.length * 10) / 10, hall: avg('hall'), tech: avg('tech'), levels: avg('levels') };
  }
  const count = async (sql, ...a) => Number((await q(sql, ...a))[0]?.n || 0);
  const week = {
    battles: await q(`SELECT coalesce(loot->>'type', rounds->>'type', 'AUTRE') AS t, count(*)::int AS n FROM "BattleReport" WHERE "createdAt" >= $1 AND "playerId" = "attackerId" GROUP BY 1`, since),
    trades: await count(`SELECT count(*)::int AS n FROM "MarketOffer" WHERE "acceptedAt" >= $1`, since),
    rallies: await q(`SELECT status, count(*)::int AS n FROM "Rally" WHERE "createdAt" >= $1 GROUP BY 1`, since),
    spyReports: await count(`SELECT count(*)::int AS n FROM "SpyReport" WHERE "createdAt" >= $1`, since).catch(() => 0),
    chat: await count(`SELECT count(*)::int AS n FROM "ChatMessage" WHERE "createdAt" >= $1`, since).catch(() => 0),
    helps: await count(`SELECT count(*)::int AS n FROM "AllianceHelp" WHERE "createdAt" >= $1`, since).catch(() => 0),
    quests: await count(`SELECT count(*)::int AS n FROM "QuestClaim" WHERE "createdAt" >= $1`, since).catch(() => 0),
    expeditions: await count(`SELECT count(*)::int AS n FROM "Expedition" WHERE status = 'COMPLETED' AND "createdAt" >= $1`, since).catch(() => 0)
  };
  const world = {
    cities: cities.length, colonies: cities.filter(c => !c.isCapital).length,
    wonder: Math.max(0, ...cities.filter(c => c.isWonder).map(c => c.wonderLevel)),
    bastions: await q(`SELECT status, count(*)::int AS n FROM "Bastion" GROUP BY 1`),
    invasions: await count(`SELECT count(*)::int AS n FROM "Invasion"`),
    hordesDestroyed: await count(`SELECT count(*)::int AS n FROM "Horde" WHERE "destroyedAt" IS NOT NULL`),
    hordesAlive: await count(`SELECT count(*)::int AS n FROM "Horde" WHERE "destroyedAt" IS NULL`),
    worldNumber: Number((await q(`SELECT number FROM "WorldConfig" WHERE id = 1`))[0]?.number || 1),
    ended: !!(await q(`SELECT "endedAt" FROM "WorldConfig" WHERE id = 1`))[0]?.endedAt,
    alliances: await count(`SELECT count(*)::int AS n FROM "Alliance"`),
    medals: await count(`SELECT count(*)::int AS n FROM "Medal"`).catch(() => 0)
  };
  return { players: per, factions, week, world };
}

module.exports = { invariants, snapshot, MOVING };
