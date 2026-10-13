// ========== IMPERIUM ANTIQUITAS - API SERVER (Mobile Backend) ==========
// Pure API server - no static file serving (frontend is embedded in native apps)

const express = require('express');
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
  for (let i = 0; i < nWorkers; i++) {
    // Seul le worker 1 execute le game loop et le seed (évite les doubles ticks)
    cluster.fork({ ...process.env, IS_TICK_WORKER: i === 0 ? 'true' : 'false', SKIP_DB_SETUP: i === 0 ? 'false' : 'true' });
  }
  cluster.on('exit', (worker, code) => {
    console.error(`[CLUSTER] Worker ${worker.process.pid} mort (code ${code}), redemarrage...`);
    cluster.fork({ ...process.env, IS_TICK_WORKER: 'false', SKIP_DB_SETUP: 'true' });
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
const { startGameLoop } = require('./game/tick');
const { seedResourceNodes } = require('./game/seed');

const app = express();
const PORT = config.port;

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

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

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

// ========== 404 for unknown routes ==========
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvee' });
});

// ========== ERROR HANDLER ==========
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

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
          console.error('Erreur sync schema:', dbPushError.message);
        }
      }

      // Fix old unique constraint
      try {
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "CityBuilding_cityId_key_key"`);
      } catch (idxErr) { /* already gone */ }

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
      } else {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    }
  }

  return server;
}

// Graceful shutdown
process.on('SIGTERM', async () => { console.log('SIGTERM recu, arret...'); await prisma.$disconnect(); process.exit(0); });
process.on('SIGINT', async () => { console.log('SIGINT recu, arret...'); await prisma.$disconnect(); process.exit(0); });

startServer().catch(e => { console.error('Erreur au demarrage:', e); process.exit(1); });
