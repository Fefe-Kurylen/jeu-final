// Contrôles et mesures de la simulation longue (tools/sim/sim.cjs), lus directement dans la base de la simulation.
// invariants() : ce qui ne doit jamais arriver (ressources négatives, armées bloquées, sièges sans camp…)
// snapshot()   : l'état de chaque joueur et du monde, chaque semaine (progression, puissance, activité des systèmes)
// Rapport de vérification du 31 octobre 2026 (§ 3) : la puissance se lit au palier de chaque unité, comme le jeu (élites et
// engins à leur vraie valeur, l'outil la sous-estimait d'un facteur 1,44) ; les donjons vivants sont ceux de l'invasion en
// cours. Mesures ajoutées pour juger les décisions du 31 octobre : gisements où une colonie peut encore être fondée,
// colonies par joueur, capitales par côté de la carte, cachettes, garnisons des Bastions, rassemblements (cible et attente),
// Merveille, quêtes, échanges entre joueurs.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { calculateArmyPower } = require(path.join(ROOT, 'src/utils/calculations'));
const { unitsData, buildingsData } = require(path.join(ROOT, 'src/config/gamedata'));
const config = require(path.join(ROOT, 'src/config'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const Terrain = require(path.join(ROOT, 'frontend/js/shared/terrain.js'));
let SPAWN = null;
const spawn = () => (SPAWN ||= require(path.join(ROOT, 'src/utils/spawn')));   // lecture seule : la place d'une ville

// placement (décision du 30 octobre 2026), lu dans les données : bâtiments de la capitale seulement, des colonies seulement
const CAPITAL_ONLY = buildingsData.filter(b => b.effects?.capitalOnly).map(b => b.key);
const COLONY_ONLY = buildingsData.filter(b => b.effects?.notInCapital).map(b => b.key);
// niveau maximum de chaque bâtiment dans la capitale et dans une colonie (Bâtiment principal 20 partout, Mur d'une colonie
// 15 : décisions du 31 octobre 2026), lu dans les données comme le serveur (fx.maxLevelIn)
const MAX_LEVEL = { keys: buildingsData.map(b => b.key), capital: buildingsData.map(b => fx.maxLevelIn(b.key, true)), colony: buildingsData.map(b => fx.maxLevelIn(b.key, false)) };
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
  // config.alliance.maxMembers au plus (100, décision du 31 octobre 2026) ; la taille selon l'Ambassade du chef ne fait que bloquer
  // les entrées : un changement de chef n'exclut personne, l'alliance peut donc la dépasser un temps
  await add('alliance au-delà du nombre de membres permis', `SELECT "allianceId", count(*)::int AS n FROM "AllianceMember" GROUP BY 1 HAVING count(*) > $1`, config.alliance.maxMembers);
  // taille d'un rassemblement fixée à son lancement par la Place de rassemblement du lanceur (5 + niveau)
  await add('rassemblement au-delà de sa taille', `SELECT r.id, r.capacity, count(a.id)::int AS n FROM "Rally" r JOIN "Army" a ON a."rallyId" = r.id AND a.status IN ('RALLY_JOIN','RALLY_WAIT','RALLY_MARCH') GROUP BY r.id, r.capacity HAVING count(a.id) > r.capacity`);
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
  // anneau à la taille de la ville (décision du 31 octobre 2026) : 18 emplacements dans la capitale, 12 dans une colonie ou
  // la Ville Merveille ; le Mur et les champs sont hors de l'anneau
  await add('bâtiment hors de l\'anneau de sa ville', `SELECT x."cityId", x.key, x.slot, c."isCapital" FROM (SELECT "cityId", key, slot FROM "CityBuilding" UNION ALL SELECT "cityId", "buildingKey", slot FROM "BuildQueueItem") x JOIN "City" c ON c.id = x."cityId" WHERE x.slot > CASE WHEN c."isCapital" THEN $1 ELSE $2 END AND x.slot <> $3 AND x.slot < $4`, config.city.ringSlots.capital, config.city.ringSlots.colony, config.city.wallSlot, Math.min(...Object.values(config.city.fieldSlots).flat()));
  await add('bâtiment au-dessus de son niveau maximum (Bâtiment principal 20, Mur d\'une colonie 15)', `SELECT b."cityId", b.key, b.level, c."isCapital" FROM "CityBuilding" b JOIN "City" c ON c.id = b."cityId" JOIN unnest($1::text[], $2::int[], $3::int[]) AS m(key, cap, col) ON m.key = b.key WHERE b.level > CASE WHEN c."isCapital" THEN m.cap ELSE m.col END`, MAX_LEVEL.keys, MAX_LEVEL.capital, MAX_LEVEL.colony);
  // pas de garnison propre dans les colonies (§ 1 bis) : une colonie fondée n'en reçoit pas
  await add('garnison dans une colonie', `SELECT a.id, a."cityId" FROM "Army" a JOIN "City" c ON c.id = a."cityId" WHERE a."isGarrison" AND NOT c."isCapital"`);
  await add('bâtiment au-dessus du Bâtiment principal', `SELECT b."cityId", b.key, b.level, m.level AS hall FROM "CityBuilding" b JOIN "CityBuilding" m ON m."cityId" = b."cityId" AND m.key = 'MAIN_HALL' WHERE b.key <> 'MAIN_HALL' AND b.level > m.level`);
  // garnison d'un Bastion (décision du 31 octobre 2026) : maxGarrisonArmies au plus, celles en route et la sortie comprises
  await add('garnison de Bastion au-delà du plafond', `SELECT "targetBastionId" AS b, count(*)::int AS n FROM "Army" WHERE "targetBastionId" IS NOT NULL AND (status = 'STATIONED' OR (status IN ('SUPPORTING', 'ATTACKING') AND "missionType" IN ('BASTION_GARRISON', 'BASTION_SORTIE'))) GROUP BY 1 HAVING count(*) > $1`, config.bastion.maxGarrisonArmies);
  await add('espion bloqué', `SELECT id, status, "arrivalAt", "returnAt" FROM "Spy" WHERE status <> 'IDLE' AND COALESCE("returnAt", "arrivalAt") < $1`, late).catch(() => {});
  return out.map(o => ({ ...o, sample: JSON.parse(JSON.stringify(o.sample, (k, v) => (typeof v === 'bigint' ? Number(v) : v))) }));
}

async function snapshot(prisma, clock, bots) {
  const since = new Date(clock.now() - 7 * 86400000);
  const q = (sql, ...a) => prisma.$queryRawUnsafe(sql, ...a);
  const players = await prisma.player.findMany({ select: { id: true, name: true, faction: true, population: true, gold: true, alliancePoints: true, alliance: { select: { allianceId: true } }, hero: { select: { level: true, diedAt: true } } } });
  const cities = await prisma.city.findMany({ select: { id: true, playerId: true, isCapital: true, isWonder: true, wonderLevel: true, wood: true, stone: true, iron: true, food: true, buildings: { select: { key: true, level: true } } } });
  // le palier de chaque ligne compte dans la puissance (calculateArmyPower : élites et engins à leur vraie valeur)
  const armies = await prisma.army.findMany({ select: { ownerId: true, status: true, units: { select: { unitKey: true, count: true, tier: true } } } });
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
    quests: await count(`SELECT count(*)::int AS n FROM "QuestClaim" WHERE "claimedAt" >= $1`, since).catch(() => 0),
    tradeVolume: await count(`SELECT coalesce(sum("sellAmount" + "buyAmount"), 0)::int AS n FROM "MarketOffer" WHERE "acceptedAt" >= $1`, since),
    expeditions: await count(`SELECT count(*)::int AS n FROM "Expedition" WHERE status = 'COMPLETED' AND "createdAt" >= $1`, since).catch(() => 0)
  };
  const world = {
    cities: cities.length, colonies: cities.filter(c => !c.isCapital).length,
    wonder: Math.max(0, ...cities.filter(c => c.isWonder).map(c => c.wonderLevel)),
    bastions: await q(`SELECT status, count(*)::int AS n FROM "Bastion" GROUP BY 1`),
    invasions: await count(`SELECT count(*)::int AS n FROM "Invasion"`),
    hordesDestroyed: await count(`SELECT count(*)::int AS n FROM "Horde" WHERE "destroyedAt" IS NOT NULL`),
    // seulement les donjons de l'invasion en cours (les lignes des invasions finies ne sont jamais marquées détruites)
    hordesAlive: await count(`SELECT count(*)::int AS n FROM "Horde" h JOIN "Invasion" i ON i.id = h."invasionId" WHERE i."endedAt" IS NULL AND h."destroyedAt" IS NULL`),
    hordesDestroyedByLevel: await q(`SELECT level, count(*)::int AS n FROM "Horde" WHERE "destroyedAt" IS NOT NULL GROUP BY 1 ORDER BY 1`),
    worldNumber: Number((await q(`SELECT number FROM "WorldConfig" WHERE id = 1`))[0]?.number || 1),
    ended: !!(await q(`SELECT "endedAt" FROM "WorldConfig" WHERE id = 1`))[0]?.endedAt,
    alliances: await count(`SELECT count(*)::int AS n FROM "Alliance"`),
    medals: await count(`SELECT count(*)::int AS n FROM "Medal"`).catch(() => 0)
  };
  return { players: per, factions, week, world, map: await mapView(prisma, cities, players), endgame: await endgameView(prisma), totals: await totalsView(prisma, cities) };
}

// ---------- la carte : place pour les colonies, colonies par joueur, capitales par côté ----------
// Un gisement où une colonie peut encore être fondée : bois, pierre, fer ou céréales, libre, une ville 2 × 2 y tient (terre
// ferme principale, ni relief, ni eau), ni ville, ni Bastion, ni fondation à moins de 3 cases, aucun autre point sur ses
// 4 cases (les règles de la fondation, spawn.footprintFree, lues en mémoire pour toute la carte d'un coup).
const COLONY_TYPES = Object.keys(fx.NODE_RESOURCE).filter(t => t !== 'GOLD');
async function foundableNodes(prisma) {
  const [nodes, cities, bastions, founding] = await Promise.all([
    prisma.resourceNode.findMany({ select: { id: true, x: true, y: true, resourceType: true, level: true, cityId: true } }),
    prisma.city.findMany({ select: { x: true, y: true } }),
    prisma.bastion.findMany({ where: { status: { not: 'DESTROYED' } }, select: { x: true, y: true } }),
    prisma.army.findMany({ where: { status: 'FOUNDING' }, select: { targetX: true, targetY: true, targetResourceId: true } })
  ]);
  const key = (x, y) => `${x},${y}`;
  const nodeAt = new Map(nodes.map(n => [key(n.x, n.y), n.id]));
  const blocks = new Map();
  for (const b of [...cities, ...bastions]) blocks.set(key(b.x, b.y), null);
  for (const f of founding) if (f.targetX !== null && f.targetY !== null) blocks.set(key(f.targetX, f.targetY), f.targetResourceId);
  const gap = spawn().CITY_GAP - 1;
  const blocked = (n) => {
    for (let dx = -gap; dx <= gap; dx++) for (let dy = -gap; dy <= gap; dy++) {
      const k = key(n.x + dx, n.y + dy);
      if (blocks.has(k) && blocks.get(k) !== n.id) return true;
    }
    return false;
  };
  const out = { total: 0, byLevel: {}, free: 0 };
  for (const n of nodes) {
    if (!COLONY_TYPES.includes(n.resourceType) || n.cityId) continue;
    out.free++;
    if (!spawn().cityGroundOk(n.x, n.y) || blocked(n)) continue;
    if (Terrain.cityCells(n.x, n.y).some(([cx, cy]) => { const id = nodeAt.get(key(cx, cy)); return id && id !== n.id; })) continue;
    out.total++;
    out.byLevel[n.level] = (out.byLevel[n.level] || 0) + 1;
  }
  return out;
}
async function mapView(prisma, cities, players) {
  const colonies = {};
  for (const p of players) { const n = cities.filter(c => c.playerId === p.id && !c.isCapital && !c.isWonder).length; colonies[n] = (colonies[n] || 0) + 1; }
  const sides = {};
  for (const c of cities.filter(x => x.isCapital)) { const s = spawn().sideAt(c.x, c.y); sides[s] = (sides[s] || 0) + 1; }
  const sites = await prisma.$queryRawUnsafe(`SELECT rn.level, count(*)::int AS n FROM "ResourceNode" rn JOIN "City" c ON c.id = rn."cityId" WHERE NOT c."isCapital" AND NOT c."isWonder" GROUP BY 1 ORDER BY 1`);
  return { size: config.map.worldSize, foundable: await foundableNodes(prisma), coloniesPerPlayer: colonies, capitalsBySide: sides, colonySiteLevels: Object.fromEntries(sites.map(r => [r.level, r.n])) };
}

// ---------- fin de partie : Bastions et leur garnison, rassemblements, Merveille ----------
async function endgameView(prisma) {
  const q = (sql, ...a) => prisma.$queryRawUnsafe(sql, ...a);
  const garrison = await q(`SELECT a.tag, b.status, b.structure, (SELECT count(*)::int FROM "Army" x WHERE x."targetBastionId" = b.id AND (x.status = 'STATIONED' OR (x.status IN ('SUPPORTING', 'ATTACKING') AND x."missionType" IN ('BASTION_GARRISON', 'BASTION_SORTIE')))) AS garrison FROM "Bastion" b JOIN "Alliance" a ON a.id = b."allianceId"`);
  const rallies = await q(`SELECT coalesce("targetKind", CASE WHEN "targetBastionId" IS NOT NULL THEN 'BASTION' ELSE 'HORDE' END) AS kind, "waitMinutes" AS wait, status, count(*)::int AS n FROM "Rally" GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`);
  const wonders = await q(`SELECT c.name, c."wonderLevel" AS level, a.tag FROM "City" c LEFT JOIN "AllianceMember" m ON m."playerId" = c."playerId" LEFT JOIN "Alliance" a ON a.id = m."allianceId" WHERE c."isWonder"`);
  const plans = await q(`SELECT a.tag, count(*)::int AS n FROM "WonderPlan" p LEFT JOIN "AllianceMember" m ON m."playerId" = p."holderId" LEFT JOIN "Alliance" a ON a.id = m."allianceId" WHERE p."holderId" IS NOT NULL GROUP BY 1`);
  const sites = await q(`SELECT "resourceType" AS kind, count(*)::int AS n, count(*) FILTER (WHERE "hasDefenders")::int AS guarded FROM "ResourceNode" WHERE "resourceType" IN ('WONDER', 'PLAN') GROUP BY 1`);
  return { bastions: garrison.map(g => ({ tag: g.tag, status: g.status, lives: Math.round((g.structure ?? 1) * config.bastion.assaults), garrison: g.garrison })), rallies, wonders, plans, sites };
}

// ---------- cumuls : échanges entre joueurs, quêtes, cachettes ----------
async function totalsView(prisma, cities) {
  const one = async (sql) => Number((await prisma.$queryRawUnsafe(sql))[0]?.n || 0);
  const hideout = { capital: {}, colony: {} };
  for (const c of cities.filter(x => !x.isWonder)) {
    const l = c.buildings.find(b => b.key === 'HIDEOUT')?.level || 0;
    const band = l >= 15 ? '15+' : l >= 10 ? '10-14' : l >= 5 ? '5-9' : l >= 1 ? '1-4' : '0';
    const h = hideout[c.isCapital ? 'capital' : 'colony'];
    h[band] = (h[band] || 0) + 1;
  }
  return {
    trades: await one(`SELECT count(*)::int AS n FROM "MarketOffer" WHERE status = 'COMPLETED'`),
    tradeVolume: await one(`SELECT coalesce(sum("sellAmount" + "buyAmount"), 0)::bigint AS n FROM "MarketOffer" WHERE status = 'COMPLETED'`),
    offersExpired: await one(`SELECT count(*)::int AS n FROM "MarketOffer" WHERE status = 'EXPIRED'`),
    quests: await one(`SELECT count(*)::int AS n FROM "QuestClaim"`),
    hideout
  };
}

module.exports = { invariants, snapshot, MOVING };
