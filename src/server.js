// ========== IMPERIUM ANTIQUITAS - API SERVER (Mobile Backend) ==========
// Pure API server - no static file serving (frontend is embedded in native apps)

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cluster = require('cluster');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
require('dotenv').config();

const WORLD_FATAL_EXIT = 78;   // code de sortie : carte du monde que cette version ne sait pas dessiner (le primaire n'insiste pas)

// ========== MODE CLUSTER ==========
// CLUSTER_WORKERS=auto -> un worker par CPU ; =N -> N workers ; absent/1 -> mono-processus
const workersEnv = process.env.CLUSTER_WORKERS;
const nWorkers = workersEnv === 'auto' ? os.cpus().length : parseInt(workersEnv, 10) || 1;
if (cluster.isPrimary && nWorkers > 1) {
  console.log(`[CLUSTER] Demarrage de ${nWorkers} workers...`);
  let tickWorkerId = null;
  const fork = (isTick, skipSetup) => {
    const w = cluster.fork({ ...process.env, IS_TICK_WORKER: String(isTick), SKIP_DB_SETUP: String(skipSetup) });
    if (isTick) tickWorkerId = w.id;
    return w;
  };
  // Seul le worker de tick execute le game loop et le seed (évite les doubles ticks)
  for (let i = 0; i < nWorkers; i++) fork(i === 0, i !== 0);
  let stopping = false, fatalStop = false;
  cluster.on('exit', (worker, code) => {
    if (stopping) { if (Object.keys(cluster.workers).length === 0) process.exit(fatalStop ? 1 : 0); return; }
    // carte que ce code ne sait pas dessiner (src/game/world.js) : relancer ne servirait à rien, tout s'arrête en échec
    if (code === WORLD_FATAL_EXIT) {
      console.error('[CLUSTER] Carte du monde illisible par cette version : arrêt de tous les workers');
      stopping = true; fatalStop = true;
      if (Object.keys(cluster.workers).length === 0) process.exit(1);
      for (const w of Object.values(cluster.workers)) w.process.kill('SIGTERM');
      setTimeout(() => process.exit(1), 5000).unref();
      return;
    }
    const wasTick = worker.id === tickWorkerId;
    console.error(`[CLUSTER] Worker ${worker.process.pid} mort (code ${code}), redemarrage${wasTick ? ' (worker de tick)' : ''}...`);
    // le worker de tick reprend la préparation de la base (elle peut être restée à mi-chemin : migrations, graine,
    // points de ressource) ; chaque étape se rejoue sans dommage
    fork(wasTick, !wasTick);
  });
  // Graceful stop: every worker gets the signal, finishes its requests and releases the tick lease
  const stopAll = (signal) => {
    stopping = true;
    for (const w of Object.values(cluster.workers)) w.process.kill(signal);
    setTimeout(() => process.exit(0), 15000).unref();
  };
  process.on('SIGTERM', () => stopAll('SIGTERM'));
  process.on('SIGINT', () => stopAll('SIGINT'));
  return; // le primaire ne sert pas de HTTP
}
const IS_TICK_WORKER = nWorkers <= 1 || process.env.IS_TICK_WORKER === 'true';
const SKIP_DB_SETUP = nWorkers > 1 && process.env.SKIP_DB_SETUP === 'true';

const config = require('./config');
const prisma = require('./config/database');
const { buildingsData, unitsData, factionsData } = require('./config/gamedata');
const { Prisma } = require('@prisma/client');   // Prisma.sql / Prisma.join for the data repair queries
const cacheControl = require('./middleware/cache');
const rateLimit = require('./middleware/rateLimit');
const { startGameLoop, releaseTickLease } = require('./game/tick');
const { seedResourceNodes, syncResourceNodesWithTerrain, rescueTrappedCities } = require('./game/seed');
const { loadWorldSeed, openWorld, isWorldReady } = require('./game/world');

const app = express();
const PORT = config.port;
let dbReady = false;

// Trust proxy (Render, Railway, etc.)
app.set('trust proxy', 1);

// ========== CORS - Accept all origins (mobile apps use capacitor://, ionic://) ==========
app.use(cors({
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(helmet({
  contentSecurityPolicy: false,   // API pure, pas de HTML servi
  crossOriginResourcePolicy: { policy: 'cross-origin' }  // assets consommés par les apps mobiles
}));
app.use(compression());
app.use(express.json({ limit: '200kb' }));  // aucune requête légitime ne dépasse ça

// ========== HEALTH CHECK (503 tant que la base n'est pas prête : le déploiement attend) ==========
let healthCache = { at: 0, dbOk: false };
app.get('/api/health', async (req, res) => {
  if (Date.now() - healthCache.at > 5000) {
    try { await prisma.$queryRaw`SELECT 1`; healthCache = { at: Date.now(), dbOk: true }; }
    catch (e) { healthCache = { at: Date.now(), dbOk: false }; }
  }
  if (!healthCache.dbOk) return res.status(503).json({ status: 'degraded', db: 'down', uptime: process.uptime() });
  res.status(dbReady ? 200 : 503).json({ status: dbReady ? 'ok' : 'starting', db: 'ok', uptime: process.uptime() });
});

// ========== CARTE DU SERVEUR ==========
// Rien ne répond tant que la graine de la carte n'est pas chargée : un client ne doit jamais recevoir une autre carte que
// celle où marchent les armées (src/game/world.js)
app.use('/api/', (req, res, next) => {
  if (isWorldReady()) return next();
  res.set('Retry-After', '2').status(503).json({ error: 'Serveur en démarrage, réessayez dans un instant' });
});

// ========== GLOBAL RATE LIMIT ==========
app.use('/api/', rateLimit(config.rateLimit.maxApi, 'api'));

// ========== STATIC DATA (cached) ==========
app.get('/api/buildings', cacheControl(3600), (req, res) => res.json(buildingsData));
app.get('/api/data/units', cacheControl(3600), (req, res) => res.json(unitsData));
app.get('/api/units', cacheControl(3600), (req, res) => res.json(unitsData));

// ========== ROUTES ==========
const authRoutes = require('./routes/auth');
const playerRoutes = require('./routes/player');
const cityRoutes = require('./routes/cities');
const armyRoutes = require('./routes/armies');
const heroRoutes = require('./routes/hero');
const allianceRoutes = require('./routes/alliance');
const mapRoutes = require('./routes/map');
const marketRoutes = require('./routes/market');
const reportRoutes = require('./routes/reports');
const rankingRoutes = require('./routes/ranking');
const expeditionRoutes = require('./routes/expeditions');

app.use('/api/auth', authRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/city', cityRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/army', armyRoutes);
app.use('/api/armies', armyRoutes);
app.use('/api/hero', heroRoutes);
app.use('/api/quests', require('./routes/quests'));
app.use('/api/spies', require('./routes/spies'));
app.use('/api/bastion', require('./routes/bastion'));
app.use('/api/alliance', require('./routes/allianceHelp'));   // /help…, /shop… (avant /api/alliance/:id)
app.use('/api/alliances', allianceRoutes);
app.use('/api/alliance', allianceRoutes);
app.use('/api/diplomacy', allianceRoutes);
app.use('/api', mapRoutes);
app.use('/api/market', marketRoutes);
app.use('/api', marketRoutes.tradeRouter);
app.use('/api/reports', reportRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/expeditions', expeditionRoutes);
app.use('/api/expedition', expeditionRoutes);
app.use('/api/push', require('./routes/push'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/research', require('./routes/research'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/chat', require('./routes/chat'));                 // messagerie (décision du 26 octobre 2026)
app.use('/api/friends', require('./routes/chat').friends);

// Pages publiques exigées par les stores (politique de confidentialité, assistance)
const PUBLIC_DIR = path.join(__dirname, 'public');
app.get('/privacy', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'privacy.html')));
app.get('/support', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'support.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'reset-password.html')));

// ========== 404 for unknown routes ==========
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvee' });
});

// ========== ERROR HANDLER ==========
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// ========== DATA REPAIRS (idempotent, run by the tick worker at boot) ==========
async function repairData() {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "CityBuilding_cityId_key_key"`);
  // The Main Hall belongs to the centre slot; older cities had it on slot 1 or not at all
  await prisma.$executeRaw`
    UPDATE "CityBuilding" cb SET slot = 0 WHERE key = 'MAIN_HALL' AND slot <> 0
      AND NOT EXISTS (SELECT 1 FROM "CityBuilding" o WHERE o."cityId" = cb."cityId" AND o.slot = 0)`;
  await prisma.$executeRaw`
    INSERT INTO "CityBuilding" (id, "cityId", key, slot, level)
    SELECT gen_random_uuid()::text, c.id, 'MAIN_HALL', 0, 1 FROM "City" c
    WHERE NOT EXISTS (SELECT 1 FROM "CityBuilding" b WHERE b."cityId" = c.id AND b.key = 'MAIN_HALL')
      AND NOT EXISTS (SELECT 1 FROM "CityBuilding" b WHERE b."cityId" = c.id AND b.slot = 0)`;
  // GDD regeneration speed: full refill in 4h (gold: 24h)
  // Resource nodes: a stock never below the floor of their level (config.map.resourceNode), older seeds were smaller at levels 2-3
  const RN = config.map.resourceNode;
  const floorCase = Prisma.sql`CASE ${Prisma.join(Object.entries(RN.baseAmountByLevel).map(([l, v]) => Prisma.sql`WHEN level = ${Number(l)} THEN ${Math.floor(v * 0.8 * RN.maxFactor)}`), ' ')} ELSE 0 END`;
  await prisma.$executeRaw`
    UPDATE "ResourceNode" SET "maxAmount" = ${floorCase}
    WHERE "resourceType" <> 'GOLD' AND "maxAmount" < ${floorCase}`;
  // Gold nodes at the GDD scale (config.map.goldNode): a small stock per level, refilled in 12 h; older seeds held 500-3000 gold
  const goldHours = config.map.goldNode.intervalHours;
  const goldCase = Prisma.sql`CASE ${Prisma.join(Object.entries(config.map.goldNode.lootByLevel).map(([l, v]) => Prisma.sql`WHEN level = ${Number(l)} THEN ${v}`), ' ')} ELSE ${config.map.goldNode.lootByLevel[1]} END`;
  await prisma.$executeRaw`
    UPDATE "ResourceNode" SET "maxAmount" = ${goldCase}, amount = LEAST(amount, ${goldCase})
    WHERE "resourceType" = 'GOLD' AND "maxAmount" <> ${goldCase}`;
  await prisma.$executeRaw`
    UPDATE "ResourceNode" SET "regenRate" = GREATEST(1, CASE WHEN "resourceType" = 'GOLD' THEN ROUND("maxAmount"::float / ${goldHours}) ELSE "maxAmount" / ${RN.regenHours} END)
    WHERE "regenRate" <> GREATEST(1, CASE WHEN "resourceType" = 'GOLD' THEN ROUND("maxAmount"::float / ${goldHours}) ELSE "maxAmount" / ${RN.regenHours} END)`;
  // Tribe power on the same scale as an army's power (older seeds stored 100 × level × soldiers/100).
  // Recomputed from the stored units at every boot: idempotent, and respawned tribes already use this scale.
  {
    const rows = unitsData.map(u => Prisma.sql`(${u.key}, ${((u.stats?.attack || 0) + (u.stats?.defense || 0)) * (config.combat.tierCoefficients[u.tier] || 1)}::float)`);
    await prisma.$executeRaw`
      UPDATE "ResourceNode" n SET "defenderPower" = sub.power
      FROM (
        SELECT n2.id, ROUND(COALESCE(SUM((v.value)::int * p.power), 0) * CASE WHEN n2."resourceType" = 'GOLD' THEN 1.4 ELSE 1 END)::int AS power
        FROM "ResourceNode" n2
        CROSS JOIN LATERAL jsonb_each_text(COALESCE(n2."defenderUnits", '{}'::jsonb)) v
        LEFT JOIN (VALUES ${Prisma.join(rows)}) AS p(key, power) ON p.key = v.key
        WHERE n2."hasDefenders" = true
        GROUP BY n2.id
      ) sub
      WHERE n.id = sub.id AND n."defenderPower" <> sub.power`;
  }
  // Wall HP follows the wall level
  // (bonus de faction « wallHealth » compris : points de vie du mur relevés pour l'Égypte, data/factions.json)
  const wallBonusByFaction = Object.entries(factionsData).map(([f, d]) => [f, 1 + ((d.bonuses || []).find(b => b.type === 'wallHealth')?.value || 0) / 100]).filter(([, k]) => k !== 1);
  const wallCase = wallBonusByFaction.length ? Prisma.sql`CASE ${Prisma.join(wallBonusByFaction.map(([f, k]) => Prisma.sql`WHEN p.faction = ${f} THEN ${k}::float`), ' ')} ELSE 1.0 END` : Prisma.sql`1.0`;
  await prisma.$executeRaw`
    UPDATE "City" c SET "wallMaxHp" = m.max, "wallHp" = LEAST(c."wallHp", m.max)
    FROM (SELECT c2.id, ROUND(${config.combat.wallHpPerLevel} * GREATEST(1, COALESCE(w.level, 1)) * ${wallCase}) AS max
          FROM "City" c2 JOIN "Player" p ON p.id = c2."playerId" LEFT JOIN "CityBuilding" w ON w."cityId" = c2.id AND w.key = 'WALL') m
    WHERE m.id = c.id AND c."wallMaxHp" <> m.max`;
}

// ========== STARTUP ==========
async function startServer() {
  console.log('');
  console.log('Demarrage Imperium Antiquitas API...');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'Configuree' : 'Manquante'}`);
  console.log('');

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`API demarre sur le port ${PORT}`);
  });

  const MAX_RETRIES = 10;
  const RETRY_DELAY = 2000;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      console.log(`Tentative de connexion DB ${i + 1}/${MAX_RETRIES}...`);
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      console.log('Connexion a la base de donnees reussie!');

      // Schema: DB_SYNC=migrate (défaut) applique les migrations versionnées de prisma/migrations ;
      // DB_SYNC=push force "prisma db push" (prototypage) ; DB_SYNC=none ne touche pas à la base
      // (migrations lancées par la plateforme, ex. release_command). Voir docs/DEPLOIEMENT.md.
      if (!SKIP_DB_SETUP) {
        try {
          await syncSchema();
        } catch (schemaError) {
          // Serving requests on a schema that differs from the client only produces Prisma errors
          console.error('Erreur sync schema:', schemaError.message);
          if (config.isProduction) process.exit(1);
        }
      }

      // La carte du serveur, avant tout usage du terrain (réparations, points de ressource, armées) : choisie au premier
      // démarrage par le processus qui prépare la base, lue par les autres. Une carte que ce code ne sait pas refaire
      // arrête le serveur : sans cela, il déplacerait toutes les villes en croyant les sauver.
      try { await loadWorldSeed({ setup: !SKIP_DB_SETUP }); }
      catch (worldErr) { if (worldErr.fatal) { console.error(worldErr.message); process.exit(WORLD_FATAL_EXIT); } throw worldErr; }

      if (!SKIP_DB_SETUP) {
        try { await repairData(); } catch (repairErr) { console.warn('Erreur réparation données:', repairErr.message); }
      }

      // Auto-seed resource nodes (tick worker uniquement)
      try {
        if (SKIP_DB_SETUP) throw Object.assign(new Error('skip'), { _skip: true });
        const nodeCount = await prisma.resourceNode.count();
        const RESEED_VERSION = 3;
        const forceReseed = process.env.FORCE_RESEED === 'true' || nodeCount === 0;
        const lastSeedVersion = await prisma.$queryRawUnsafe(
          `SELECT obj_description('public."ResourceNode"'::regclass) as ver`
        ).then(r => parseInt(r?.[0]?.ver) || 0).catch(() => 0);
        const needsReseed = forceReseed || lastSeedVersion < RESEED_VERSION;
        if (needsReseed) {
          if (nodeCount > 0) {
            console.log(`Suppression de ${nodeCount} anciens noeuds (v${lastSeedVersion} -> v${RESEED_VERSION})...`);
            await prisma.resourceNode.deleteMany({});
          }
          console.log('Generation des points de ressource v' + RESEED_VERSION + '...');
          await seedResourceNodes();
          await prisma.$executeRawUnsafe(`COMMENT ON TABLE "ResourceNode" IS '${RESEED_VERSION}'`);
        } else {
          console.log(`${nodeCount} points de ressource existants (v${lastSeedVersion})`);
          await rescueTrappedCities();
          await syncResourceNodesWithTerrain();
        }
      } catch (seedErr) {
        if (!seedErr._skip) console.warn('Erreur seed:', seedErr.message);
      }

      // Le monde est prêt (points posés, villes vérifiées) : /api/* répond
      await openWorld({ setup: !SKIP_DB_SETUP });
      dbReady = true;

      // Start game loop (un seul worker le fait en mode cluster)
      if (IS_TICK_WORKER) startGameLoop();
      else console.log('[CLUSTER] Worker HTTP (pas de game loop)');

      console.log('');
      console.log('==========================================');
      console.log(`   Imperium Antiquitas API - ONLINE`);
      console.log(`   Port: ${PORT}`);
      console.log(`   DB:   Connectee`);
      console.log(`   Mode: Mobile API uniquement`);
      console.log('==========================================');
      console.log('');
      break;
    } catch (e) {
      console.log(`   Erreur: ${e.message.substring(0, 100)}`);
      if (i === MAX_RETRIES - 1) {
        console.error('Impossible de se connecter a la base de donnees apres', MAX_RETRIES, 'tentatives');
        if (config.isProduction) process.exit(1);
      } else {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    }
  }

  return server;
}

// Graceful shutdown: stop accepting connections, let in-flight requests finish (10 s max), release the
// tick lease so the next instance can start ticking immediately
let httpServer = null;
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} recu, arret...`);
  const closed = new Promise((resolve) => { if (httpServer) httpServer.close(() => resolve()); else resolve(); });
  await Promise.race([closed, new Promise(r => setTimeout(r, 10000))]);
  try { if (IS_TICK_WORKER) await releaseTickLease(); } catch (e) { /* lease expires on its own */ }
  try { await prisma.$disconnect(); } catch (e) { /* already closed */ }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ========== SCHEMA SYNC ==========
const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');
const BASELINE_MIGRATION = '0001_init';
async function tableExists(name) {
  const rows = await prisma.$queryRaw`SELECT to_regclass(${'public."' + name + '"'})::text AS r`;
  return !!rows[0]?.r;
}
async function runPrisma(args) {
  console.log(`> prisma ${args}`);
  const { stdout, stderr } = await execAsync(`npx prisma ${args}`, { env: { ...process.env }, timeout: 180000, maxBuffer: 10 * 1024 * 1024 });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}
async function syncSchema() {
  const mode = process.env.DB_SYNC || (process.env.AUTO_DB_PUSH === 'false' ? 'none' : 'migrate');
  if (mode === 'none') { console.log('Schema: aucune synchronisation (DB_SYNC=none)'); return; }
  if (mode === 'push') { await runPrisma('db push --skip-generate'); console.log('Schema synchronise (db push)'); return; }
  if (!fs.existsSync(MIGRATIONS_DIR)) throw new Error('prisma/migrations absent : impossible d\'appliquer les migrations');
  // A database created by "prisma db push" before migrations existed: mark the baseline as applied once
  if (!(await tableExists('_prisma_migrations')) && (await tableExists('Player'))) {
    console.log(`Base existante sans historique de migrations : baseline ${BASELINE_MIGRATION}`);
    await runPrisma(`migrate resolve --applied ${BASELINE_MIGRATION}`);
  }
  await runPrisma('migrate deploy');
  console.log('Schema a jour (migrations)');
}

startServer().then((server) => { httpServer = server; }).catch(e => { console.error('Erreur au demarrage:', e); process.exit(1); });
