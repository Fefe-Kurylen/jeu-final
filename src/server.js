// ========== IMPERIUM ANTIQUITAS - SERVER ==========
// Modular architecture - each concern in its own file

const express = require('express');
const cors = require('cors');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

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

// ========== CORS - Strict in production ==========
const corsOptions = {
  origin: config.isProduction
    ? (process.env.CORS_ORIGIN || true)
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// ========== HEALTH CHECK (Render) ==========
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ========== GLOBAL RATE LIMIT ==========
app.use('/api/', rateLimit(config.rateLimit.maxApi, 'api'));

// ========== STATIC FILES ==========
app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));
app.use('/img', express.static(path.join(__dirname, '../frontend/img')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
app.use('/portal', express.static(path.join(__dirname, '../portal')));

// ========== STATIC DATA (cached) ==========
app.get('/api/buildings', cacheControl(3600), (req, res) => res.json(buildingsData));
app.get('/api/data/units', cacheControl(3600), (req, res) => res.json(unitsData));
app.get('/api/units', cacheControl(3600), (req, res) => res.json(unitsData));

// ========== ROUTES ==========
app.use('/api/auth', require('./routes/auth'));
app.use('/api/player', require('./routes/player'));
app.use('/api/city', require('./routes/cities'));
app.use('/api/cities', require('./routes/cities'));
app.use('/api/army', require('./routes/armies'));
app.use('/api/armies', require('./routes/armies'));
app.use('/api/hero', require('./routes/hero'));
app.use('/api/alliances', require('./routes/alliance'));
app.use('/api/alliance', require('./routes/alliance'));
app.use('/api', require('./routes/map'));
app.use('/api/market', require('./routes/market'));
app.use('/api', require('./routes/market'));  // for /api/trade/send
app.use('/api/reports', require('./routes/reports'));
app.use('/api/ranking', require('./routes/ranking'));
app.use('/api/expeditions', require('./routes/expeditions'));
app.use('/api/expedition', require('./routes/expeditions'));
app.use('/api/diplomacy', require('./routes/alliance'));

// Incoming attacks
app.get('/api/incoming-attacks', require('./middleware/auth'), async (req, res) => {
  try {
    const playerCities = await prisma.city.findMany({
      where: { playerId: req.user.playerId },
      select: { id: true, name: true, x: true, y: true }
    });
    const cityIds = playerCities.map(c => c.id);
    const incomingArmies = await prisma.army.findMany({
      where: { targetCityId: { in: cityIds }, status: { in: ['ATTACKING', 'RAIDING'] }, arrivalAt: { gt: new Date() } },
      select: { id: true, status: true, arrivalAt: true, targetCityId: true, missionType: true },
      orderBy: { arrivalAt: 'asc' }
    });
    const attacks = incomingArmies.map(a => {
      const targetCity = playerCities.find(c => c.id === a.targetCityId);
      return { id: a.id, type: a.missionType || a.status, arrivalAt: a.arrivalAt, targetCity: targetCity?.name || 'Ville', targetCityId: a.targetCityId };
    });
    res.json(attacks);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== CATCH-ALL: Serve frontend ==========
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ========== STARTUP ==========
async function startServer() {
  console.log('');
  console.log('Demarrage Imperium Antiquitas...');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'Configuree' : 'Manquante'}`);
  console.log('');

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur HTTP demarre sur le port ${PORT}`);
  });

  const MAX_RETRIES = 10;
  const RETRY_DELAY = 2000;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      console.log(`Tentative de connexion DB ${i + 1}/${MAX_RETRIES}...`);
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      console.log('Connexion a la base de donnees reussie!');

      // Sync schema (safe in dev, careful in prod)
      console.log('Synchronisation du schema...');
      try {
        execSync('npx prisma db push --skip-generate', { stdio: 'inherit', env: { ...process.env } });
        console.log('Schema synchronise!');
      } catch (dbPushError) {
        console.error('Erreur sync schema:', dbPushError.message);
      }

      // Fix old unique constraint
      try {
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "CityBuilding_cityId_key_key"`);
      } catch (idxErr) { /* already gone */ }

      // Auto-seed resource nodes
      try {
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
        console.warn('Erreur seed:', seedErr.message);
      }

      // Start game loop
      startGameLoop();

      console.log('');
      console.log('==========================================');
      console.log(`   Imperium Antiquitas - ONLINE`);
      console.log(`   URL: http://0.0.0.0:${PORT}`);
      console.log(`   DB:  Connectee`);
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
