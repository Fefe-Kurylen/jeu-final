// ========== IMPERIUM ANTIQUITAS - API SERVER (Mobile Backend) ==========
// Pure API server - no static file serving (frontend is embedded in native apps)

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cluster = require('cluster');
const os = require('os');
const { execSync } = require('child_process');
require('dotenv').config();

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
  cluster.on('exit', (worker, code) => {
    const wasTick = worker.id === tickWorkerId;
    console.error(`[CLUSTER] Worker ${worker.process.pid} mort (code ${code}), redemarrage${wasTick ? ' (worker de tick)' : ''}...`);
    fork(wasTick, true);
  });
  return; // le primaire ne sert pas de HTTP
}
const IS_TICK_WORKER = nWorkers <= 1 || process.env.IS_TICK_WORKER === 'true';
const SKIP_DB_SETUP = nWorkers > 1 && process.env.SKIP_DB_SETUP === 'true';

const config = require('./config');
const prisma = require('./config/database');
const { buildingsData, unitsData } = require('./config/gamedata');
const cacheControl = require('./middleware/cache');
const rateLimit = require('./middleware/rateLimit');
const { startGameLoop, releaseTickLease } = require('./game/tick');
const { seedResourceNodes } = require('./game/seed');

const app = express();
const PORT = config.port;
let dbReady = false;

// Trust proxy (Render, Railway, etc.)
app.set('trust proxy', 1);

// ========== CORS - Accept all origins (mobile apps use capacitor://, ionic://) ==========
app.use(cors({
  origin: true,
  credentials: true,
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
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(dbReady ? 200 : 503).json({ status: dbReady ? 'ok' : 'starting', db: 'ok', uptime: process.uptime() });
  } catch (e) {
    res.status(503).json({ status: 'degraded', db: 'down', uptime: process.uptime() });
  }
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
app.use('/api/analytics', require('./routes/analytics'));

// Pages publiques exigées par les stores (politique de confidentialité, assistance)
const PUBLIC_DIR = path.join(__dirname, 'public');
app.get('/privacy', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'privacy.html')));
app.get('/support', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'support.html')));

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
  await prisma.$executeRaw`
    UPDATE "ResourceNode" SET "regenRate" = GREATEST(1, CASE WHEN "resourceType" = 'GOLD' THEN "maxAmount" / 24 ELSE "maxAmount" / 4 END)
    WHERE "regenRate" <> GREATEST(1, CASE WHEN "resourceType" = 'GOLD' THEN "maxAmount" / 24 ELSE "maxAmount" / 4 END)`;
  // Wall HP follows the wall level
  await prisma.$executeRaw`
    UPDATE "City" c SET "wallMaxHp" = m.max, "wallHp" = LEAST(c."wallHp", m.max)
    FROM (SELECT c2.id, ${config.combat.wallHpPerLevel} * GREATEST(1, COALESCE(w.level, 1)) AS max
          FROM "City" c2 LEFT JOIN "CityBuilding" w ON w."cityId" = c2.id AND w.key = 'WALL') m
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

      // Sync schema (désactivable via AUTO_DB_PUSH=false — recommandé en prod stable,
      // utiliser des migrations Prisma versionnées à la place)
      if (process.env.AUTO_DB_PUSH !== 'false' && !SKIP_DB_SETUP) {
        console.log('Synchronisation du schema...');
        try {
          execSync('npx prisma db push --skip-generate', { stdio: 'inherit', env: { ...process.env }, timeout: 120000 });
          console.log('Schema synchronise!');
        } catch (dbPushError) {
          // Serving requests on a schema that differs from the client only produces Prisma errors
          console.error('Erreur sync schema:', dbPushError.message);
          if (config.isProduction) process.exit(1);
        }
      }

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
        }
      } catch (seedErr) {
        if (!seedErr._skip) console.warn('Erreur seed:', seedErr.message);
      }

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

// Graceful shutdown: release the tick lease so the next instance can start ticking immediately
async function shutdown(signal) {
  console.log(`${signal} recu, arret...`);
  try { if (IS_TICK_WORKER) await releaseTickLease(); } catch (e) { /* lease expires on its own */ }
  try { await prisma.$disconnect(); } catch (e) { /* already closed */ }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer().catch(e => { console.error('Erreur au demarrage:', e); process.exit(1); });
