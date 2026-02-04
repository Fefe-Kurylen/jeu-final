const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn']
});

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'monjeu-secret-change-this';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Warn if using default JWT secret in production
if (IS_PRODUCTION && JWT_SECRET === 'monjeu-secret-change-this') {
  console.error('⚠️  WARNING: Using default JWT secret in production! Set JWT_SECRET environment variable.');
}

// Trust proxy pour Railway
app.set('trust proxy', 1);

// CORS - configuration sécurisée
const corsOptions = {
  origin: IS_PRODUCTION
    ? (process.env.CORS_ORIGIN || true) // En prod, utiliser CORS_ORIGIN ou accepter tout si non défini
    : true, // En dev, accepter tout
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '1mb' }));

// ========== RATE LIMITING (simple in-memory) ==========
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_AUTH = 10; // 10 tentatives de login par minute
const RATE_LIMIT_MAX_API = 100; // 100 requêtes API par minute

const rateLimit = (maxRequests, keyPrefix = 'api') => (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();

  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW;
  }

  record.count++;
  rateLimitMap.set(key, record);

  // Cleanup old entries periodically
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }

  if (record.count > maxRequests) {
    return res.status(429).json({ error: 'Trop de requêtes, réessayez plus tard' });
  }

  next();
};

// ========== INPUT VALIDATION HELPERS ==========
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
};

const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6 && password.length <= 100;
};

const validateName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const nameRegex = /^[a-zA-Z0-9_-]+$/;
  return nameRegex.test(name) && name.length >= 3 && name.length <= 20;
};

const validateFaction = (faction) => {
  const validFactions = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
  return validFactions.includes(faction?.toUpperCase());
};

const validateCoordinates = (x, y) => {
  return Number.isInteger(x) && Number.isInteger(y) &&
         x >= 0 && x <= 500 && y >= 0 && y <= 500;
};

// ========== CACHE HEADERS MIDDLEWARE ==========
// Cache pour fichiers statiques
app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: IS_PRODUCTION ? '1d' : 0, // 1 jour en prod
  etag: true,
  lastModified: true
}));

// Portal static files (login, register, dashboard, premium)
app.use('/portal', express.static(path.join(__dirname, '../portal'), {
  maxAge: IS_PRODUCTION ? '1d' : 0,
  etag: true,
  lastModified: true
}));

// Game wrapper static files
app.use('/game', express.static(path.join(__dirname, '../game'), {
  maxAge: IS_PRODUCTION ? '1d' : 0,
  etag: true,
  lastModified: true
}));

// Headers de cache pour les réponses API
const cacheControl = (duration) => (req, res, next) => {
  if (IS_PRODUCTION && duration > 0) {
    res.set('Cache-Control', `public, max-age=${duration}`);
  } else {
    res.set('Cache-Control', 'no-store');
  }
  next();
};

// Compression middleware simple (gzip)
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    // Ajouter des headers utiles
    res.set('X-Response-Time', `${Date.now() - req.startTime || 0}ms`);
    return originalJson(data);
  };
  req.startTime = Date.now();
  next();
});

// Load game data
let unitsData = [];
let buildingsData = [];
try {
  unitsData = JSON.parse(fs.readFileSync('data/units.json', 'utf-8')).units || [];
  buildingsData = JSON.parse(fs.readFileSync('data/buildings.json', 'utf-8')).buildings || [];
} catch (e) {
  console.warn('Could not load game data:', e.message);
}

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Health check pour Render/Railway
app.get('/health', (req, res) => res.json({ status: 'ok', version: '0.6.0' }));
app.get('/api/health', async (req, res) => {
  try {
    // Vérifie la connexion à la DB
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: 'ok', 
      version: '0.6.0', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (e) {
    res.status(500).json({ 
      status: 'error', 
      version: '0.6.0',
      database: 'disconnected',
      error: e.message
    });
  }
});

// Data endpoints - avec cache HTTP (données statiques)
app.get('/api/data/units', cacheControl(300), (req, res) => res.json(unitsData));
app.get('/api/units', cacheControl(300), (req, res) => res.json(unitsData));
app.get('/api/buildings', cacheControl(300), (req, res) => res.json(buildingsData));
app.get('/api/data/units/:faction', cacheControl(300), (req, res) => {
  res.json(unitsData.filter(u => u.faction === req.params.faction.toUpperCase()));
});
app.get('/api/data/buildings', cacheControl(300), (req, res) => res.json(buildingsData));

// ========== AUTH ==========

app.post('/api/auth/register', rateLimit(RATE_LIMIT_MAX_AUTH, 'auth'), async (req, res) => {
  try {
    const { email, password, name, faction } = req.body;

    // Validation des entrées
    if (!email || !password || !name || !faction) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Mot de passe: 6-100 caractères requis' });
    }

    if (!validateName(name)) {
      return res.status(400).json({ error: 'Pseudo: 3-20 caractères alphanumériques' });
    }

    if (!validateFaction(faction)) {
      return res.status(400).json({ error: 'Faction invalide' });
    }

    const exists = await prisma.account.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) return res.status(400).json({ error: 'Email deja utilise' });

    const nameExists = await prisma.player.findUnique({ where: { name } });
    if (nameExists) return res.status(400).json({ error: 'Pseudo deja pris' });

    const hash = await bcrypt.hash(password, 10);
    const account = await prisma.account.create({ data: { email, passwordHash: hash } });

    const player = await prisma.player.create({
      data: { accountId: account.id, name, faction: faction.toUpperCase(), gold: 0 }
    });

    await prisma.playerStats.create({ data: { playerId: player.id } });

    // Find free position
    let x = 250, y = 250;
    for (let i = 0; i < 100; i++) {
      const posExists = await prisma.city.findUnique({ where: { x_y: { x, y } } });
      if (!posExists) break;
      x = 200 + Math.floor(Math.random() * 100);
      y = 200 + Math.floor(Math.random() * 100);
    }

    // Create capital (NO starter buildings!)
    const city = await prisma.city.create({
      data: { playerId: player.id, name: `Capitale de ${name}`, x, y, isCapital: true }
    });

    // Create hero
    const hero = await prisma.hero.create({
      data: { playerId: player.id, name: `Heros de ${name}`, statPoints: 5 }
    });

    // Create garrison army
    await prisma.army.create({
      data: { ownerId: player.id, cityId: city.id, heroId: hero.id, name: 'Garnison', x, y, status: 'IDLE', isGarrison: true }
    });

    // Create 3 starter expeditions
    for (let i = 0; i < 3; i++) {
      await createExpedition(player.id);
    }

    const token = jwt.sign({ id: account.id, playerId: player.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, player: { id: player.id, name, faction } });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: IS_PRODUCTION ? 'Erreur serveur' : e.message });
  }
});

app.post('/api/auth/login', rateLimit(RATE_LIMIT_MAX_AUTH, 'auth'), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const account = await prisma.account.findUnique({
      where: { email: email.toLowerCase() },
      include: { player: true }
    });
    if (!account || !account.player) return res.status(401).json({ error: 'Identifiants invalides' });

    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Identifiants invalides' });

    const token = jwt.sign({ id: account.id, playerId: account.player.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, player: { id: account.player.id, name: account.player.name, faction: account.player.faction } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== PLAYER ==========

app.get('/api/player/me', auth, async (req, res) => {
  const player = await prisma.player.findUnique({
    where: { id: req.user.playerId },
    include: { 
      cities: { include: { buildings: true, buildQueue: true, recruitQueue: true, armies: { include: { units: true } } } }, 
      hero: { include: { items: true } }, 
      stats: true, 
      alliance: { include: { alliance: { include: { members: { include: { player: { select: { id: true, name: true, faction: true, population: true } } } } } } } },
      expeditions: { where: { status: { in: ['AVAILABLE', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'desc' } }
    }
  });
  res.json(player);
});

// ========== CITIES ==========

app.get('/api/cities', auth, async (req, res) => {
  const cities = await prisma.city.findMany({
    where: { ownerId: req.user.playerId },
    include: { buildings: true, buildQueue: { orderBy: { slot: 'asc' } }, recruitQueue: { orderBy: { startedAt: 'asc' } }, armies: { include: { units: true } } }
  });
  res.json(cities);
});

app.post('/api/city/:id/build', auth, async (req, res) => {
  try {
    const { buildingKey, slot } = req.body;
    const city = await prisma.city.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { buildings: true, buildQueue: true }
    });
    if (!city) return res.status(404).json({ error: 'Ville non trouvee' });

    // Configuration: 2 constructions simultanées + 2 en attente = 4 max
    const MAX_RUNNING = 2;
    const MAX_QUEUED = 2;
    const MAX_TOTAL = MAX_RUNNING + MAX_QUEUED;
    
    const runningCount = city.buildQueue.filter(b => b.status === 'RUNNING').length;
    const queuedCount = city.buildQueue.filter(b => b.status === 'QUEUED').length;
    const totalCount = city.buildQueue.length;
    
    if (totalCount >= MAX_TOTAL) {
      return res.status(400).json({ error: `File de construction pleine (max ${MAX_TOTAL}: ${MAX_RUNNING} en cours + ${MAX_QUEUED} en attente)` });
    }

    const existing = city.buildings.find(b => b.key === buildingKey);
    const inQueue = city.buildQueue.filter(b => b.buildingKey === buildingKey).length;
    const targetLevel = (existing?.level || 0) + inQueue + 1;

    // Get building def
    const buildingDef = buildingsData.find(b => b.key === buildingKey);
    const maxLevel = buildingDef?.maxLevel || 20;
    if (targetLevel > maxLevel) return res.status(400).json({ error: `Niveau max atteint (${maxLevel})` });

    // Calculate cost
    const baseCost = buildingDef?.costL1 || { wood: 100, stone: 100, iron: 80, food: 50 };
    const mult = Math.pow(1.5, targetLevel - 1);
    const cost = {
      wood: Math.floor(baseCost.wood * mult),
      stone: Math.floor(baseCost.stone * mult),
      iron: Math.floor(baseCost.iron * mult),
      food: Math.floor(baseCost.food * mult)
    };

    if (city.wood < cost.wood || city.stone < cost.stone || city.iron < cost.iron || city.food < cost.food) {
      return res.status(400).json({ error: 'Ressources insuffisantes', cost, have: { wood: Math.floor(city.wood), stone: Math.floor(city.stone), iron: Math.floor(city.iron), food: Math.floor(city.food) } });
    }

    await prisma.city.update({
      where: { id: city.id },
      data: { wood: city.wood - cost.wood, stone: city.stone - cost.stone, iron: city.iron - cost.iron, food: city.food - cost.food }
    });

    // Calculate duration
    const baseTime = buildingDef?.timeL1Sec || 60;
    const durationSec = Math.floor(baseTime * Math.pow(1.8, targetLevel - 1));
    
    const now = new Date();
    let startAt = now;
    let status = 'RUNNING';
    
    // Determine status: RUNNING if less than 2 running, otherwise QUEUED
    if (runningCount >= MAX_RUNNING) {
      // Must be queued - find when it can start
      const allRunning = city.buildQueue.filter(b => b.status === 'RUNNING');
      const earliestEnd = allRunning.sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt))[0];
      
      // Check if there are queued items already
      const allQueued = city.buildQueue.filter(b => b.status === 'QUEUED');
      if (allQueued.length > 0) {
        // Queue after last queued item
        const lastQueued = allQueued.sort((a, b) => new Date(b.endsAt) - new Date(a.endsAt))[0];
        startAt = new Date(lastQueued.endsAt);
      } else {
        // Queue after earliest running
        startAt = new Date(earliestEnd.endsAt);
      }
      status = 'QUEUED';
    }
    
    const endsAt = new Date(startAt.getTime() + durationSec * 1000);

    const queueItem = await prisma.buildQueueItem.create({
      data: { 
        cityId: city.id, 
        buildingKey, 
        targetLevel, 
        slot: slot || (totalCount + 1), 
        startedAt: startAt, 
        endsAt, 
        status 
      }
    });

    res.json({ 
      message: status === 'RUNNING' ? 'Construction lancee' : 'Construction ajoutee a la file', 
      queueItem, 
      durationSec, 
      cost,
      queueStatus: {
        running: runningCount + (status === 'RUNNING' ? 1 : 0),
        queued: queuedCount + (status === 'QUEUED' ? 1 : 0),
        maxRunning: MAX_RUNNING,
        maxQueued: MAX_QUEUED
      }
    });
  } catch (e) {
    console.error('Build error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ========== RECRUIT ==========

app.post('/api/city/:id/recruit', auth, async (req, res) => {
  try {
    const { unitKey, count } = req.body;
    if (!count || count < 1) return res.status(400).json({ error: 'Nombre invalide' });
    
    const city = await prisma.city.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { recruitQueue: true, buildings: true }
    });
    if (!city) return res.status(404).json({ error: 'Ville non trouvee' });

    const unit = unitsData.find(u => u.key === unitKey);
    if (!unit) return res.status(400).json({ error: 'Unite inconnue' });

    // Check building requirements based on unit class and tier
    const barracks = city.buildings.find(b => b.key === 'BARRACKS');
    const stable = city.buildings.find(b => b.key === 'STABLE');
    const workshop = city.buildings.find(b => b.key === 'WORKSHOP');

    // Infantry & Archers need Barracks
    if (unit.class === 'INFANTRY' || unit.class === 'ARCHER') {
      if (!barracks) return res.status(400).json({ error: 'Caserne requise pour recruter de l\'infanterie/archers' });
      if (unit.tier === 'intermediate' && barracks.level < 5) return res.status(400).json({ error: 'Caserne niveau 5 requise pour unites intermediaires' });
      if (unit.tier === 'elite' && barracks.level < 10) return res.status(400).json({ error: 'Caserne niveau 10 requise pour unites elite' });
    }

    // Cavalry needs Stable
    if (unit.class === 'CAVALRY') {
      if (!stable) return res.status(400).json({ error: 'Ecurie requise pour recruter de la cavalerie' });
      if (unit.tier === 'intermediate' && stable.level < 5) return res.status(400).json({ error: 'Ecurie niveau 5 requise pour cavalerie intermediaire' });
      if (unit.tier === 'elite' && stable.level < 10) return res.status(400).json({ error: 'Ecurie niveau 10 requise pour cavalerie elite' });
    }

    // Siege needs Workshop
    if (unit.class === 'SIEGE') {
      if (!workshop) return res.status(400).json({ error: 'Atelier requis pour recruter des machines de siege' });
      if (workshop.level < 5) return res.status(400).json({ error: 'Atelier niveau 5 requis pour machines de siege' });
    }

    const tierMult = unit.tier === 'base' ? 1.3 : unit.tier === 'intermediate' ? 1.7 : 1.9;
    const cost = { 
      wood: Math.ceil(50 * tierMult * count), 
      stone: Math.ceil(30 * tierMult * count), 
      iron: Math.ceil(60 * tierMult * count), 
      food: Math.ceil(30 * tierMult * count) 
    };

    if (city.wood < cost.wood || city.stone < cost.stone || city.iron < cost.iron || city.food < cost.food) {
      return res.status(400).json({ error: 'Ressources insuffisantes', cost });
    }

    await prisma.city.update({
      where: { id: city.id },
      data: { wood: city.wood - cost.wood, stone: city.stone - cost.stone, iron: city.iron - cost.iron, food: city.food - cost.food }
    });

    let baseTime = unit.tier === 'base' ? 60 : unit.tier === 'intermediate' ? 120 : 180;
    if (unit.class === 'CAVALRY') baseTime = baseTime * 1.25;
    const totalTime = baseTime * count;
    const now = new Date();
    const endsAt = new Date(now.getTime() + totalTime * 1000);

    const queueItem = await prisma.recruitQueueItem.create({
      data: { cityId: city.id, unitKey, count, buildingKey: 'BARRACKS', startedAt: now, endsAt, status: 'RUNNING' }
    });

    res.json({ message: 'Recrutement lance', queueItem, durationSec: totalTime, cost });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== HERO ==========

app.get('/api/hero', auth, async (req, res) => {
  const hero = await prisma.hero.findUnique({
    where: { ownerId: req.user.playerId },
    include: { items: true, army: true }
  });
  res.json(hero);
});

app.post('/api/hero/assign-points', auth, async (req, res) => {
  try {
    const { atk, def, spd, log } = req.body;
    const hero = await prisma.hero.findUnique({ where: { ownerId: req.user.playerId } });
    if (!hero) return res.status(404).json({ error: 'Heros non trouve' });

    const total = (atk || 0) + (def || 0) + (spd || 0) + (log || 0);
    if (total > hero.statPoints) return res.status(400).json({ error: 'Pas assez de points' });

    await prisma.hero.update({
      where: { id: hero.id },
      data: {
        atkPoints: hero.atkPoints + (atk || 0),
        defPoints: hero.defPoints + (def || 0),
        spdPoints: hero.spdPoints + (spd || 0),
        logPoints: hero.logPoints + (log || 0),
        statPoints: hero.statPoints - total
      }
    });

    res.json({ message: 'Points assignes' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== ARMY MOVEMENT & COMBAT ==========

// Calculate travel time based on distance and army speed
function calculateTravelTime(fromX, fromY, toX, toY, armySpeed = 50) {
  const distance = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  // Base: 1 tile per 30 seconds at speed 50
  const timePerTile = 30 * (50 / armySpeed);
  return Math.ceil(distance * timePerTile);
}

// Calculate army power
function calculateArmyPower(units) {
  const TIER_MULT = { base: 1.0, intermediate: 1.1, elite: 1.21, siege: 0.75 };
  return units.reduce((total, u) => {
    const unit = unitsData.find(x => x.key === u.unitKey);
    if (!unit) return total;
    const mult = TIER_MULT[u.tier] || 1.0;
    const power = (unit.stats.attack + unit.stats.defense) * mult * u.count;
    return total + power;
  }, 0);
}

// Resolve combat between attacker and defender
function resolveCombat(attackerUnits, defenderUnits, defenderWallLevel = 0) {
  const attackerPower = calculateArmyPower(attackerUnits);
  // Defender gets wall bonus: +3% per wall level
  const wallBonus = 1 + (defenderWallLevel * 0.03);
  const defenderPower = calculateArmyPower(defenderUnits) * wallBonus;
  
  const attackerWon = attackerPower > defenderPower;
  const ratio = attackerWon ? defenderPower / attackerPower : attackerPower / defenderPower;
  
  // Calculate losses (winner loses ratio*30%, loser loses 70-100%)
  const winnerLossRate = ratio * 0.3;
  const loserLossRate = 0.7 + Math.random() * 0.3;
  
  return {
    attackerWon,
    attackerLossRate: attackerWon ? winnerLossRate : loserLossRate,
    defenderLossRate: attackerWon ? loserLossRate : winnerLossRate,
    attackerPower,
    defenderPower
  };
}

// Detailed combat with rounds for replay
function resolveCombatDetailed(attackerUnits, defenderUnits, wallLevel = 0, moatLevel = 0, attackerName, defenderName) {
  // TIER coefficients (ratio 1.8)
  const TIER_COEFF = { base: 1.0, intermediate: 1.10, elite: 1.21, siege: 0.75 };
  
  // Clone units for simulation
  const attackers = attackerUnits.map(u => {
    const def = unitsData.find(x => x.key === u.unitKey);
    return {
      key: u.unitKey,
      initial: u.count,
      count: u.count,
      tier: u.tier || def?.tier || 'base',
      attack: (def?.stats?.attack || 30) * TIER_COEFF[u.tier || def?.tier || 'base'],
      defense: (def?.stats?.defense || 30) * TIER_COEFF[u.tier || def?.tier || 'base'],
      hp: def?.stats?.endurance || 50,
      name: def?.name || u.unitKey
    };
  });
  
  const defenders = defenderUnits.map(u => {
    const def = unitsData.find(x => x.key === u.unitKey);
    return {
      key: u.unitKey,
      initial: u.count,
      count: u.count,
      tier: u.tier || def?.tier || 'base',
      attack: (def?.stats?.attack || 30) * TIER_COEFF[u.tier || def?.tier || 'base'],
      defense: (def?.stats?.defense || 30) * TIER_COEFF[u.tier || def?.tier || 'base'],
      hp: def?.stats?.endurance || 50,
      name: def?.name || u.unitKey
    };
  });
  
  // Wall and moat bonuses
  const wallBonus = 1 + (wallLevel * 0.03);
  const moatBonus = 1 + (moatLevel * 0.02);
  const defenseMultiplier = wallBonus * moatBonus;
  
  // Record initial state
  const attackerInitialUnits = attackers.map(u => ({ key: u.key, name: u.name, count: u.initial, tier: u.tier }));
  const defenderInitialUnits = defenders.map(u => ({ key: u.key, name: u.name, count: u.initial, tier: u.tier }));
  
  const rounds = [];
  const MAX_ROUNDS = 10;
  
  // Simulate combat rounds
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // Check if combat is over
    const attackerTotal = attackers.reduce((sum, u) => sum + u.count, 0);
    const defenderTotal = defenders.reduce((sum, u) => sum + u.count, 0);
    
    if (attackerTotal <= 0 || defenderTotal <= 0) break;
    
    // Calculate round damage
    const attackerDamage = attackers.reduce((sum, u) => sum + u.count * u.attack, 0);
    const defenderDamage = defenders.reduce((sum, u) => sum + u.count * u.attack * defenseMultiplier, 0);
    
    // Apply damage to defenders (distributed by HP)
    let damageToDefenders = attackerDamage;
    const defenderKills = [];
    for (const unit of defenders) {
      if (unit.count <= 0) continue;
      const unitTotalHp = unit.count * unit.hp * defenseMultiplier;
      const damageToUnit = Math.min(damageToDefenders * (unitTotalHp / defenders.reduce((s, u) => s + u.count * u.hp * defenseMultiplier, 1)), unitTotalHp);
      const killed = Math.floor(damageToUnit / (unit.hp * defenseMultiplier));
      const actualKilled = Math.min(killed, unit.count);
      unit.count -= actualKilled;
      if (actualKilled > 0) {
        defenderKills.push({ key: unit.key, name: unit.name, killed: actualKilled });
      }
    }
    
    // Apply damage to attackers
    let damageToAttackers = defenderDamage;
    const attackerKills = [];
    for (const unit of attackers) {
      if (unit.count <= 0) continue;
      const unitTotalHp = unit.count * unit.hp;
      const damageToUnit = Math.min(damageToAttackers * (unitTotalHp / attackers.reduce((s, u) => s + u.count * u.hp, 1)), unitTotalHp);
      const killed = Math.floor(damageToUnit / unit.hp);
      const actualKilled = Math.min(killed, unit.count);
      unit.count -= actualKilled;
      if (actualKilled > 0) {
        attackerKills.push({ key: unit.key, name: unit.name, killed: actualKilled });
      }
    }
    
    // Record round
    rounds.push({
      round,
      attackerDamage: Math.floor(attackerDamage),
      defenderDamage: Math.floor(defenderDamage),
      attackerKills,
      defenderKills,
      attackerRemaining: attackers.reduce((sum, u) => sum + u.count, 0),
      defenderRemaining: defenders.reduce((sum, u) => sum + u.count, 0)
    });
    
    // Check if combat should end
    if (attackers.every(u => u.count <= 0) || defenders.every(u => u.count <= 0)) break;
  }
  
  // Calculate final state
  const attackerFinalUnits = attackers.map(u => ({ 
    key: u.key, 
    name: u.name,
    initial: u.initial, 
    remaining: Math.max(0, u.count),
    killed: u.initial - Math.max(0, u.count)
  }));
  
  const defenderFinalUnits = defenders.map(u => ({ 
    key: u.key,
    name: u.name,
    initial: u.initial, 
    remaining: Math.max(0, u.count),
    killed: u.initial - Math.max(0, u.count)
  }));
  
  const attackerTotalRemaining = attackers.reduce((sum, u) => sum + Math.max(0, u.count), 0);
  const defenderTotalRemaining = defenders.reduce((sum, u) => sum + Math.max(0, u.count), 0);
  const attackerTotalInitial = attackers.reduce((sum, u) => sum + u.initial, 0);
  const defenderTotalInitial = defenders.reduce((sum, u) => sum + u.initial, 0);
  
  const attackerTotalKilled = attackerTotalInitial - attackerTotalRemaining;
  const defenderTotalKilled = defenderTotalInitial - defenderTotalRemaining;
  
  const attackerWon = attackerTotalRemaining > defenderTotalRemaining;
  
  return {
    attackerWon,
    attackerLossRate: attackerTotalInitial > 0 ? attackerTotalKilled / attackerTotalInitial : 0,
    defenderLossRate: defenderTotalInitial > 0 ? defenderTotalKilled / defenderTotalInitial : 0,
    attackerTotalKilled,
    defenderTotalKilled,
    attackerInitialUnits,
    defenderInitialUnits,
    attackerFinalUnits,
    defenderFinalUnits,
    rounds,
    wallBonus,
    moatBonus
  };
}

// ========== ARMY MANAGEMENT ENDPOINTS ==========

// Create a new army
app.post('/api/army/create', auth, async (req, res) => {
  try {
    const { cityId, slot, name } = req.body;
    if (!cityId || !slot) return res.status(400).json({ error: 'cityId et slot requis' });
    
    const city = await prisma.city.findFirst({
      where: { id: cityId, ownerId: req.user.playerId },
      include: { buildings: true }
    });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });
    
    // Check Rally Point level for max armies
    const rallyPoint = city.buildings.find(b => b.key === 'RALLY_POINT');
    const rallyLevel = rallyPoint?.level || 0;
    let maxArmies = 0;
    if (rallyLevel >= 10) maxArmies = 3;
    else if (rallyLevel >= 5) maxArmies = 2;
    else if (rallyLevel >= 1) maxArmies = 1;
    
    if (slot > maxArmies) {
      return res.status(400).json({ error: `Slot ${slot} non débloqué. Rally Point Niv.${slot === 2 ? 5 : 10} requis.` });
    }
    
    // Check if slot already taken
    const existingArmy = await prisma.army.findFirst({
      where: { cityId, slot, isGarrison: false }
    });
    if (existingArmy) {
      return res.status(400).json({ error: `Slot ${slot} déjà occupé` });
    }
    
    // Create the army
    const army = await prisma.army.create({
      data: {
        ownerId: req.user.playerId,
        cityId,
        slot,
        name: name || `Armée ${slot}`,
        x: city.x,
        y: city.y,
        status: 'IDLE',
        isGarrison: false
      }
    });
    
    res.json({ message: 'Armée créée', army });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rename army
app.patch('/api/army/:id/rename', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId }
    });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    
    await prisma.army.update({
      where: { id: army.id },
      data: { name }
    });
    
    res.json({ message: 'Armée renommée' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Assign hero to army
app.post('/api/army/:id/assign-hero', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId }
    });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée doit être en ville' });
    
    const hero = await prisma.hero.findFirst({
      where: { ownerId: req.user.playerId }
    });
    if (!hero) return res.status(404).json({ error: 'Héros non trouvé' });
    
    // Check if hero already assigned elsewhere
    const armyWithHero = await prisma.army.findFirst({
      where: { heroId: hero.id, NOT: { id: army.id } }
    });
    if (armyWithHero) {
      return res.status(400).json({ error: 'Héros déjà assigné à une autre armée' });
    }
    
    await prisma.army.update({
      where: { id: army.id },
      data: { heroId: hero.id }
    });
    
    res.json({ message: 'Héros assigné' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unassign hero from army
app.post('/api/army/:id/unassign-hero', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId }
    });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée doit être en ville' });
    
    await prisma.army.update({
      where: { id: army.id },
      data: { heroId: null }
    });
    
    res.json({ message: 'Héros retiré' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Set unit count in army (for composition)
app.post('/api/army/:id/set-unit', auth, async (req, res) => {
  try {
    const { unitKey, count } = req.body;
    if (!unitKey || count === undefined) return res.status(400).json({ error: 'unitKey et count requis' });
    
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { units: true }
    });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée doit être en ville' });
    
    // Get garrison army
    const garrison = await prisma.army.findFirst({
      where: { cityId: army.cityId, isGarrison: true },
      include: { units: true }
    });
    
    // Current counts
    const currentInArmy = army.units.find(u => u.unitKey === unitKey)?.count || 0;
    const currentInGarrison = garrison?.units?.find(u => u.unitKey === unitKey)?.count || 0;
    const totalAvailable = currentInArmy + currentInGarrison;
    
    // Validate
    const newCount = Math.max(0, Math.min(count, totalAvailable));
    const delta = newCount - currentInArmy;
    
    if (delta === 0) {
      return res.json({ message: 'Aucun changement' });
    }
    
    // Get unit info
    const unitInfo = unitsData.find(u => u.key === unitKey);
    const tier = unitInfo?.tier || 'base';
    
    // Update army
    if (newCount > 0) {
      await prisma.armyUnit.upsert({
        where: { armyId_unitKey: { armyId: army.id, unitKey } },
        update: { count: newCount },
        create: { armyId: army.id, unitKey, tier, count: newCount }
      });
    } else {
      await prisma.armyUnit.deleteMany({
        where: { armyId: army.id, unitKey }
      });
    }
    
    // Update garrison (opposite delta)
    if (garrison) {
      const newGarrisonCount = currentInGarrison - delta;
      if (newGarrisonCount > 0) {
        await prisma.armyUnit.upsert({
          where: { armyId_unitKey: { armyId: garrison.id, unitKey } },
          update: { count: newGarrisonCount },
          create: { armyId: garrison.id, unitKey, tier, count: newGarrisonCount }
        });
      } else {
        await prisma.armyUnit.deleteMany({
          where: { armyId: garrison.id, unitKey }
        });
      }
    }
    
    res.json({ message: 'Composition mise à jour', delta, newCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Disband army (units go back to garrison)
app.delete('/api/army/:id/disband', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { units: true }
    });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée doit être en ville' });
    if (army.isGarrison) return res.status(400).json({ error: 'Impossible de dissoudre la garnison' });
    
    // Get or create garrison
    let garrison = await prisma.army.findFirst({
      where: { cityId: army.cityId, isGarrison: true },
      include: { units: true }
    });
    
    if (!garrison) {
      const city = await prisma.city.findUnique({ where: { id: army.cityId } });
      garrison = await prisma.army.create({
        data: {
          ownerId: req.user.playerId,
          cityId: army.cityId,
          name: 'Garnison',
          x: city.x,
          y: city.y,
          status: 'IDLE',
          isGarrison: true
        },
        include: { units: true }
      });
    }
    
    // Transfer units to garrison
    for (const unit of army.units) {
      const garrisonUnit = garrison.units?.find(u => u.unitKey === unit.unitKey);
      if (garrisonUnit) {
        await prisma.armyUnit.update({
          where: { id: garrisonUnit.id },
          data: { count: garrisonUnit.count + unit.count }
        });
      } else {
        await prisma.armyUnit.create({
          data: {
            armyId: garrison.id,
            unitKey: unit.unitKey,
            tier: unit.tier,
            count: unit.count
          }
        });
      }
    }
    
    // Delete army units then army
    await prisma.armyUnit.deleteMany({ where: { armyId: army.id } });
    await prisma.army.delete({ where: { id: army.id } });
    
    res.json({ message: 'Armée dissoute' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Move army to destination
app.post('/api/army/:id/move', auth, async (req, res) => {
  try {
    const { x, y } = req.body;
    if (x === undefined || y === undefined) return res.status(400).json({ error: 'Destination requise' });

    // Validate coordinates
    if (!validateCoordinates(parseInt(x), parseInt(y))) {
      return res.status(400).json({ error: 'Coordonnées invalides (0-500)' });
    }
    
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { units: true }
    });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armee deja en mouvement' });
    if (army.units.length === 0) return res.status(400).json({ error: 'Armee vide' });
    
    // Calculate slowest unit speed
    let minSpeed = 100;
    for (const u of army.units) {
      const unit = unitsData.find(x => x.key === u.unitKey);
      if (unit && unit.stats.speed < minSpeed) minSpeed = unit.stats.speed;
    }
    
    const travelTime = calculateTravelTime(army.x, army.y, x, y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    
    await prisma.army.update({
      where: { id: army.id },
      data: { 
        status: 'MOVING',
        targetX: x,
        targetY: y,
        arrivalAt,
        missionType: 'MOVE'
      }
    });
    
    res.json({ message: 'Armee en mouvement', travelTime, arrivalAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Attack a city
app.post('/api/army/:id/attack', auth, async (req, res) => {
  try {
    const { targetCityId } = req.body;
    if (!targetCityId) return res.status(400).json({ error: 'Cible requise' });
    
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { units: true }
    });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armee deja en mission' });
    if (army.units.length === 0) return res.status(400).json({ error: 'Armee vide' });
    
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId } });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvee' });
    if (targetCity.playerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas attaquer vos propres villes' });
    
    // Calculate travel time
    let minSpeed = 100;
    for (const u of army.units) {
      const unit = unitsData.find(x => x.key === u.unitKey);
      if (unit && unit.stats.speed < minSpeed) minSpeed = unit.stats.speed;
    }
    
    const travelTime = calculateTravelTime(army.x, army.y, targetCity.x, targetCity.y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    
    await prisma.army.update({
      where: { id: army.id },
      data: {
        status: 'ATTACKING',
        targetX: targetCity.x,
        targetY: targetCity.y,
        targetCityId: targetCity.id,
        arrivalAt,
        missionType: 'ATTACK'
      }
    });
    
    res.json({ message: 'Attaque lancee', travelTime, arrivalAt, target: targetCity.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Raid a city (steal resources)
app.post('/api/army/:id/raid', auth, async (req, res) => {
  try {
    const { targetCityId } = req.body;
    if (!targetCityId) return res.status(400).json({ error: 'Cible requise' });
    
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { units: true }
    });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armee deja en mission' });
    if (army.units.length === 0) return res.status(400).json({ error: 'Armee vide' });
    
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId } });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvee' });
    if (targetCity.playerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas piller vos propres villes' });
    
    let minSpeed = 100;
    for (const u of army.units) {
      const unit = unitsData.find(x => x.key === u.unitKey);
      if (unit && unit.stats.speed < minSpeed) minSpeed = unit.stats.speed;
    }
    
    const travelTime = calculateTravelTime(army.x, army.y, targetCity.x, targetCity.y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    
    await prisma.army.update({
      where: { id: army.id },
      data: {
        status: 'RAIDING',
        targetX: targetCity.x,
        targetY: targetCity.y,
        targetCityId: targetCity.id,
        arrivalAt,
        missionType: 'RAID'
      }
    });
    
    res.json({ message: 'Raid lance', travelTime, arrivalAt, target: targetCity.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Return army to home city
app.post('/api/army/:id/return', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { units: true, city: true }
    });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    if (!army.city) return res.status(400).json({ error: 'Armee sans ville d\'origine' });
    
    if (army.x === army.city.x && army.y === army.city.y) {
      return res.json({ message: 'Armee deja a la maison' });
    }
    
    let minSpeed = 100;
    for (const u of army.units) {
      const unit = unitsData.find(x => x.key === u.unitKey);
      if (unit && unit.stats.speed < minSpeed) minSpeed = unit.stats.speed;
    }
    
    const travelTime = calculateTravelTime(army.x, army.y, army.city.x, army.city.y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    
    await prisma.army.update({
      where: { id: army.id },
      data: {
        status: 'RETURNING',
        targetX: army.city.x,
        targetY: army.city.y,
        arrivalAt,
        missionType: 'RETURN'
      }
    });
    
    res.json({ message: 'Retour en cours', travelTime, arrivalAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get army details
app.get('/api/army/:id', auth, async (req, res) => {
  const army = await prisma.army.findFirst({
    where: { id: req.params.id, ownerId: req.user.playerId },
    include: { units: true, city: true, hero: true }
  });
  if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
  
  // Add power calculation
  const power = calculateArmyPower(army.units);
  res.json({ ...army, power });
});

// List all armies
app.get('/api/armies', auth, async (req, res) => {
  const armies = await prisma.army.findMany({
    where: { ownerId: req.user.playerId },
    include: { units: true, city: true, hero: true }
  });
  
  const armiesWithPower = armies.map(a => ({
    ...a,
    power: calculateArmyPower(a.units)
  }));
  
  res.json(armiesWithPower);
});

// ========== EXPEDITIONS ==========

async function createExpedition(playerId) {
  const difficulty = Math.floor(Math.random() * 4) + 1;
  const enemyPower = difficulty * 500 + Math.floor(Math.random() * 500);
  const duration = 1800 + difficulty * 600;
  const lootTiers = ['COMMON', 'COMMON', 'RARE', 'EPIC'];
  const lootTier = lootTiers[difficulty - 1];
  
  return prisma.expedition.create({
    data: {
      playerId,
      difficulty,
      enemyPower,
      duration,
      lootTier,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000)
    }
  });
}

app.get('/api/expeditions', auth, async (req, res) => {
  const expeditions = await prisma.expedition.findMany({
    where: { ownerId: req.user.playerId, status: { in: ['AVAILABLE', 'IN_PROGRESS'] } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(expeditions);
});

app.post('/api/expedition/:id/start', auth, async (req, res) => {
  try {
    const expedition = await prisma.expedition.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId, status: 'AVAILABLE' }
    });
    if (!expedition) return res.status(404).json({ error: 'Expedition non trouvee' });

    const army = await prisma.army.findFirst({
      where: { ownerId: req.user.playerId, status: 'IDLE' },
      include: { units: true }
    });
    if (!army || army.units.length === 0) return res.status(400).json({ error: 'Armee requise avec des unites' });

    const now = new Date();
    const endsAt = new Date(now.getTime() + expedition.duration * 1000);

    await prisma.expedition.update({
      where: { id: expedition.id },
      data: { status: 'IN_PROGRESS', startedAt: now, endsAt, armyId: army.id }
    });

    await prisma.army.update({
      where: { id: army.id },
      data: { status: 'EXPEDITION' }
    });

    res.json({ message: 'Expedition lancee', endsAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== ALLIANCE ==========

app.get('/api/alliances', auth, async (req, res) => {
  const alliances = await prisma.alliance.findMany({
    include: { members: { include: { player: { select: { id: true, name: true, faction: true, population: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  res.json(alliances);
});

app.post('/api/alliance/create', auth, async (req, res) => {
  try {
    const { name, tag, description } = req.body;
    if (!name || !tag) return res.status(400).json({ error: 'Nom et tag requis' });
    if (tag.length < 2 || tag.length > 5) return res.status(400).json({ error: 'Tag entre 2 et 5 caracteres' });

    const existing = await prisma.allianceMember.findUnique({ where: { ownerId: req.user.playerId } });
    if (existing) return res.status(400).json({ error: 'Vous etes deja dans une alliance' });

    const alliance = await prisma.alliance.create({
      data: { name, tag: tag.toUpperCase(), description, leaderId: req.user.playerId }
    });

    await prisma.allianceMember.create({
      data: { allianceId: alliance.id, ownerId: req.user.playerId, role: 'LEADER' }
    });

    res.json({ message: 'Alliance creee', alliance });
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Nom ou tag deja pris' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alliance/:id/join', auth, async (req, res) => {
  try {
    const alliance = await prisma.alliance.findUnique({ where: { id: req.params.id } });
    if (!alliance) return res.status(404).json({ error: 'Alliance non trouvee' });

    const existing = await prisma.allianceMember.findUnique({ where: { ownerId: req.user.playerId } });
    if (existing) return res.status(400).json({ error: 'Vous etes deja dans une alliance' });

    await prisma.allianceMember.create({
      data: { allianceId: alliance.id, ownerId: req.user.playerId, role: 'MEMBER' }
    });

    res.json({ message: 'Alliance rejoint' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alliance/leave', auth, async (req, res) => {
  try {
    const member = await prisma.allianceMember.findUnique({ 
      where: { ownerId: req.user.playerId },
      include: { alliance: true }
    });
    if (!member) return res.status(400).json({ error: 'Vous n\'etes pas dans une alliance' });

    if (member.role === 'LEADER') {
      const otherMembers = await prisma.allianceMember.count({ where: { allianceId: member.allianceId, NOT: { ownerId: req.user.playerId } } });
      if (otherMembers > 0) return res.status(400).json({ error: 'Transferez le leadership avant de partir' });
      await prisma.alliance.delete({ where: { id: member.allianceId } });
    }

    await prisma.allianceMember.delete({ where: { id: member.id } });
    res.json({ message: 'Alliance quittee' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alliance/promote/:playerId', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { ownerId: req.user.playerId } });
    if (!myMember || myMember.role !== 'LEADER') return res.status(403).json({ error: 'Leader requis' });

    const target = await prisma.allianceMember.findUnique({ where: { playerId: req.params.playerId } });
    if (!target || target.allianceId !== myMember.allianceId) return res.status(404).json({ error: 'Membre non trouve' });

    const newRole = target.role === 'MEMBER' ? 'OFFICER' : target.role;
    await prisma.allianceMember.update({ where: { id: target.id }, data: { role: newRole } });

    res.json({ message: 'Membre promu' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alliance/kick/:playerId', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { ownerId: req.user.playerId } });
    if (!myMember || !['LEADER', 'OFFICER'].includes(myMember.role)) return res.status(403).json({ error: 'Officier requis' });

    const target = await prisma.allianceMember.findUnique({ where: { playerId: req.params.playerId } });
    if (!target || target.allianceId !== myMember.allianceId) return res.status(404).json({ error: 'Membre non trouve' });
    if (target.role === 'LEADER') return res.status(403).json({ error: 'Impossible de kick le leader' });

    await prisma.allianceMember.delete({ where: { id: target.id } });
    res.json({ message: 'Membre exclus' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== DIPLOMACY ==========

// Get diplomacy status with another alliance
app.get('/api/alliance/diplomacy', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ 
      where: { ownerId: req.user.playerId },
      include: { alliance: { include: { diplomacy: true, diplomacyTo: true } } }
    });
    
    if (!myMember) return res.json({ diplomacy: [] });
    
    // Combine both directions
    const allDiplomacy = [
      ...myMember.alliance.diplomacy.map(d => ({ 
        allianceId: d.targetAllianceId, 
        status: d.status,
        direction: 'from'
      })),
      ...myMember.alliance.diplomacyTo.map(d => ({ 
        allianceId: d.allianceId, 
        status: d.status,
        direction: 'to'
      }))
    ];
    
    res.json({ diplomacy: allDiplomacy, myAllianceId: myMember.allianceId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Set diplomacy status (ALLY, NEUTRAL, ENEMY)
app.post('/api/alliance/diplomacy/:targetAllianceId', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ALLY', 'NEUTRAL', 'ENEMY'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide (ALLY, NEUTRAL, ENEMY)' });
    }
    
    const myMember = await prisma.allianceMember.findUnique({ where: { ownerId: req.user.playerId } });
    if (!myMember || !['LEADER', 'OFFICER'].includes(myMember.role)) {
      return res.status(403).json({ error: 'Leader ou Officier requis' });
    }
    
    const targetAlliance = await prisma.alliance.findUnique({ where: { id: req.params.targetAllianceId } });
    if (!targetAlliance) return res.status(404).json({ error: 'Alliance cible non trouvée' });
    if (targetAlliance.id === myMember.allianceId) return res.status(400).json({ error: 'Impossible de modifier la diplomatie avec vous-même' });
    
    // Check max 3 allies
    if (status === 'ALLY') {
      const currentAllies = await prisma.allianceDiplomacy.count({
        where: { allianceId: myMember.allianceId, status: 'ALLY' }
      });
      if (currentAllies >= 3) {
        return res.status(400).json({ error: 'Maximum 3 alliances alliées' });
      }
    }
    
    // Upsert diplomacy
    await prisma.allianceDiplomacy.upsert({
      where: {
        allianceId_targetAllianceId: {
          allianceId: myMember.allianceId,
          targetAllianceId: req.params.targetAllianceId
        }
      },
      update: { status, changedAt: new Date() },
      create: {
        allianceId: myMember.allianceId,
        targetAllianceId: req.params.targetAllianceId,
        status
      }
    });
    
    res.json({ message: `Statut diplomatique changé en ${status}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get diplomatic status between current player and a target player
app.get('/api/diplomacy/player/:targetPlayerId', auth, async (req, res) => {
  try {
    const targetPlayerId = req.params.targetPlayerId;
    
    // Same player
    if (targetPlayerId === req.user.playerId) {
      return res.json({ status: 'SELF', canTransport: true, canAttack: false });
    }
    
    // Get both players' alliance info
    const [myMember, targetMember] = await Promise.all([
      prisma.allianceMember.findUnique({ where: { ownerId: req.user.playerId } }),
      prisma.allianceMember.findUnique({ where: { playerId: targetPlayerId } })
    ]);
    
    // Same alliance
    if (myMember && targetMember && myMember.allianceId === targetMember.allianceId) {
      return res.json({ status: 'SAME_ALLIANCE', canTransport: true, canAttack: false });
    }
    
    // No alliances involved
    if (!myMember || !targetMember) {
      return res.json({ status: 'NEUTRAL', canTransport: true, canAttack: true });
    }
    
    // Check diplomacy between alliances
    const diplomacy = await prisma.allianceDiplomacy.findFirst({
      where: {
        OR: [
          { allianceId: myMember.allianceId, targetAllianceId: targetMember.allianceId },
          { allianceId: targetMember.allianceId, targetAllianceId: myMember.allianceId }
        ]
      }
    });
    
    if (!diplomacy) {
      return res.json({ status: 'NEUTRAL', canTransport: true, canAttack: true });
    }
    
    const canTransport = diplomacy.status === 'ALLY' || diplomacy.status === 'NEUTRAL';
    const canAttack = diplomacy.status === 'ENEMY' || diplomacy.status === 'NEUTRAL';
    
    return res.json({ status: diplomacy.status, canTransport, canAttack });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== MAP ==========

app.get('/api/map/viewport', auth, async (req, res) => {
  const x = parseInt(req.query.x) || 250;
  const y = parseInt(req.query.y) || 250;
  const r = parseInt(req.query.radius) || 10;

  const cities = await prisma.city.findMany({
    where: { x: { gte: x - r, lte: x + r }, y: { gte: y - r, lte: y + r } },
    select: { id: true, name: true, x: true, y: true, player: { select: { id: true, name: true, faction: true, alliance: { select: { alliance: { select: { tag: true } } } } } } }
  });

  const nodes = await prisma.resourceNode.findMany({
    where: { x: { gte: x - r, lte: x + r }, y: { gte: y - r, lte: y + r } }
  });

  res.json({ cities, resourceNodes: nodes, center: { x, y }, radius: r });
});

// ========== RANKING ==========

app.get('/api/ranking/players', async (req, res) => {
  const players = await prisma.player.findMany({
    orderBy: { population: 'desc' },
    take: 50,
    select: { id: true, name: true, faction: true, population: true, alliance: { select: { alliance: { select: { tag: true } } } } }
  });
  res.json(players);
});

app.get('/api/ranking/alliances', async (req, res) => {
  const alliances = await prisma.alliance.findMany({
    include: { members: { include: { player: { select: { population: true } } } } }
  });
  const ranked = alliances.map(a => ({
    id: a.id,
    name: a.name,
    tag: a.tag,
    members: a.members.length,
    population: a.members.reduce((sum, m) => sum + m.player.population, 0)
  })).sort((a, b) => b.population - a.population);
  res.json(ranked);
});

// ========== BATTLE REPORTS ==========
app.get('/api/reports/battles', auth, async (req, res) => {
  try {
    const reports = await prisma.battleReport.findMany({
      where: { ownerId: req.user.playerId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== ESPIONNAGE ==========
app.post('/api/army/:id/spy', auth, async (req, res) => {
  try {
    const { targetCityId } = req.body;
    if (!targetCityId) return res.status(400).json({ error: 'Cible requise' });
    
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { units: true }
    });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée déjà en mission' });
    
    const targetCity = await prisma.city.findUnique({
      where: { id: targetCityId },
      include: { player: true }
    });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
    if (targetCity.playerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas espionner vos propres villes' });
    
    // Calculate travel time (spies are fast)
    const travelTime = calculateTravelTime(army.x, army.y, targetCity.x, targetCity.y, 80);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    
    await prisma.army.update({
      where: { id: army.id },
      data: {
        status: 'SPYING',
        targetX: targetCity.x,
        targetY: targetCity.y,
        targetCityId: targetCity.id,
        arrivalAt,
        missionType: 'SPY'
      }
    });
    
    res.json({ message: 'Espionnage lancé', travelTime, arrivalAt, target: targetCity.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get spy reports
app.get('/api/reports/spy', auth, async (req, res) => {
  try {
    const reports = await prisma.spyReport.findMany({
      where: { ownerId: req.user.playerId },
      orderBy: { createdAt: 'desc' },
      take: 30
    });
    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== ENVOYER RESSOURCES (transport) ==========
app.post('/api/army/:id/transport', auth, async (req, res) => {
  try {
    const { targetCityId, wood, stone, iron, food } = req.body;
    if (!targetCityId) return res.status(400).json({ error: 'Ville cible requise' });
    
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { units: true, city: true }
    });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée déjà en mission' });
    if (!army.city) return res.status(400).json({ error: 'Armée sans ville d\'origine' });
    
    const targetCity = await prisma.city.findUnique({
      where: { id: targetCityId },
      include: { player: true }
    });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
    
    // ===== CHECK DIPLOMATIC STATUS =====
    // Can only transport to: own cities, same alliance, ALLY status, or NEUTRAL status
    const targetPlayerId = targetCity.playerId;
    
    if (targetPlayerId !== req.user.playerId) {
      // Not own city - check diplomacy
      const [myMember, targetMember] = await Promise.all([
        prisma.allianceMember.findUnique({ where: { ownerId: req.user.playerId } }),
        prisma.allianceMember.findUnique({ where: { playerId: targetPlayerId } })
      ]);
      
      // Same alliance is OK
      if (myMember && targetMember && myMember.allianceId === targetMember.allianceId) {
        // OK - same alliance
      }
      // Both have alliances - check diplomacy
      else if (myMember && targetMember) {
        const diplomacy = await prisma.allianceDiplomacy.findFirst({
          where: {
            OR: [
              { allianceId: myMember.allianceId, targetAllianceId: targetMember.allianceId },
              { allianceId: targetMember.allianceId, targetAllianceId: myMember.allianceId }
            ]
          }
        });
        
        if (diplomacy && diplomacy.status === 'ENEMY') {
          return res.status(403).json({ error: 'Impossible d\'envoyer des ressources à un ennemi' });
        }
        // ALLY or NEUTRAL or no diplomacy = OK
      }
      // One or both not in alliance - default NEUTRAL = OK
    }
    
    // Calculate carry capacity
    const carryCapacity = army.units.reduce((sum, u) => {
      const unitDef = unitsData.find(ud => ud.key === u.unitKey);
      return sum + (unitDef?.stats?.transport || 50) * u.count;
    }, 0);
    
    const totalToSend = (wood || 0) + (stone || 0) + (iron || 0) + (food || 0);
    if (totalToSend > carryCapacity) {
      return res.status(400).json({ error: `Capacité insuffisante (max ${carryCapacity})`, carryCapacity });
    }
    
    // Check resources
    const sourceCity = army.city;
    if (sourceCity.wood < wood || sourceCity.stone < stone || sourceCity.iron < iron || sourceCity.food < food) {
      return res.status(400).json({ error: 'Ressources insuffisantes' });
    }
    
    // Deduct resources
    await prisma.city.update({
      where: { id: sourceCity.id },
      data: {
        wood: sourceCity.wood - (wood || 0),
        stone: sourceCity.stone - (stone || 0),
        iron: sourceCity.iron - (iron || 0),
        food: sourceCity.food - (food || 0)
      }
    });
    
    // Calculate travel time
    let minSpeed = 100;
    for (const u of army.units) {
      const unit = unitsData.find(x => x.key === u.unitKey);
      if (unit && unit.stats.speed < minSpeed) minSpeed = unit.stats.speed;
    }
    const travelTime = calculateTravelTime(army.x, army.y, targetCity.x, targetCity.y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    
    // Update army with cargo
    await prisma.army.update({
      where: { id: army.id },
      data: {
        status: 'TRANSPORTING',
        targetX: targetCity.x,
        targetY: targetCity.y,
        targetCityId: targetCity.id,
        arrivalAt,
        missionType: 'TRANSPORT',
        carryWood: wood || 0,
        carryStone: stone || 0,
        carryIron: iron || 0,
        carryFood: food || 0
      }
    });
    
    res.json({ 
      message: `Transport lancé vers ${targetCity.name}`, 
      travelTime, 
      arrivalAt,
      resources: { wood: wood || 0, stone: stone || 0, iron: iron || 0, food: food || 0 }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== MARCHÉ ==========
// Get market offers
app.get('/api/market', auth, async (req, res) => {
  try {
    const offers = await prisma.marketOffer.findMany({
      where: { status: 'ACTIVE' },
      include: { seller: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(offers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create market offer
app.post('/api/market/offer', auth, async (req, res) => {
  try {
    const { sellResource, sellAmount, buyResource, buyAmount, cityId } = req.body;
    
    if (!sellResource || !sellAmount || !buyResource || !buyAmount) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }
    
    const city = await prisma.city.findFirst({
      where: { id: cityId, ownerId: req.user.playerId }
    });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });
    
    // Check if player has the resources
    if (city[sellResource] < sellAmount) {
      return res.status(400).json({ error: `Ressources insuffisantes (${sellResource}: ${Math.floor(city[sellResource])})` });
    }
    
    // Deduct resources
    await prisma.city.update({
      where: { id: city.id },
      data: { [sellResource]: city[sellResource] - sellAmount }
    });
    
    // Create offer
    const offer = await prisma.marketOffer.create({
      data: {
        sellerId: req.user.playerId,
        cityId: city.id,
        sellResource,
        sellAmount,
        buyResource,
        buyAmount,
        status: 'ACTIVE'
      }
    });
    
    res.json({ message: 'Offre créée', offer });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Accept market offer
app.post('/api/market/offer/:id/accept', auth, async (req, res) => {
  try {
    const { cityId } = req.body;
    
    const offer = await prisma.marketOffer.findUnique({
      where: { id: req.params.id },
      include: { seller: true, city: true }
    });
    if (!offer) return res.status(404).json({ error: 'Offre non trouvée' });
    if (offer.status !== 'ACTIVE') return res.status(400).json({ error: 'Offre inactive' });
    if (offer.sellerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas accepter votre propre offre' });
    
    const buyerCity = await prisma.city.findFirst({
      where: { id: cityId, ownerId: req.user.playerId }
    });
    if (!buyerCity) return res.status(404).json({ error: 'Ville acheteur non trouvée' });
    
    // Check buyer has resources
    if (buyerCity[offer.buyResource] < offer.buyAmount) {
      return res.status(400).json({ error: `Ressources insuffisantes (${offer.buyResource})` });
    }
    
    // Execute trade
    // Buyer pays
    await prisma.city.update({
      where: { id: buyerCity.id },
      data: { 
        [offer.buyResource]: buyerCity[offer.buyResource] - offer.buyAmount,
        [offer.sellResource]: Math.min(buyerCity[offer.sellResource] + offer.sellAmount, buyerCity.maxStorage)
      }
    });
    
    // Seller receives
    const sellerCity = await prisma.city.findUnique({ where: { id: offer.cityId } });
    if (sellerCity) {
      await prisma.city.update({
        where: { id: sellerCity.id },
        data: { 
          [offer.buyResource]: Math.min(sellerCity[offer.buyResource] + offer.buyAmount, sellerCity.maxStorage)
        }
      });
    }
    
    // Mark offer as completed
    await prisma.marketOffer.update({
      where: { id: offer.id },
      data: { status: 'COMPLETED', buyerId: req.user.playerId }
    });
    
    res.json({ message: 'Échange effectué!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cancel market offer
app.delete('/api/market/offer/:id', auth, async (req, res) => {
  try {
    const offer = await prisma.marketOffer.findUnique({ where: { id: req.params.id } });
    if (!offer) return res.status(404).json({ error: 'Offre non trouvée' });
    if (offer.sellerId !== req.user.playerId) return res.status(403).json({ error: 'Non autorisé' });
    if (offer.status !== 'ACTIVE') return res.status(400).json({ error: 'Offre inactive' });
    
    // Return resources
    const city = await prisma.city.findUnique({ where: { id: offer.cityId } });
    if (city) {
      await prisma.city.update({
        where: { id: city.id },
        data: { [offer.sellResource]: city[offer.sellResource] + offer.sellAmount }
      });
    }
    
    await prisma.marketOffer.update({
      where: { id: offer.id },
      data: { status: 'CANCELLED' }
    });
    
    res.json({ message: 'Offre annulée' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== PLAYER PROFILE ==========
app.get('/api/player/:id', auth, async (req, res) => {
  try {
    const targetPlayer = await prisma.player.findUnique({
      where: { id: req.params.id },
      include: {
        cities: { select: { id: true, name: true, x: true, y: true, isCapital: true } },
        stats: true,
        alliance: { include: { alliance: { select: { name: true, tag: true } } } },
        hero: { select: { name: true, level: true } }
      }
    });
    
    if (!targetPlayer) return res.status(404).json({ error: 'Joueur non trouvé' });
    
    // Public info only
    res.json({
      id: targetPlayer.id,
      name: targetPlayer.name,
      faction: targetPlayer.faction,
      population: targetPlayer.population,
      citiesCount: targetPlayer.cities.length,
      cities: targetPlayer.cities,
      alliance: targetPlayer.alliance?.alliance ? {
        name: targetPlayer.alliance.alliance.name,
        tag: targetPlayer.alliance.alliance.tag,
        role: targetPlayer.alliance.role
      } : null,
      hero: targetPlayer.hero ? { name: targetPlayer.hero.name, level: targetPlayer.hero.level } : null,
      stats: targetPlayer.stats ? {
        attacksWon: targetPlayer.stats.attacksWon,
        defensesWon: targetPlayer.stats.defensesWon
      } : null,
      createdAt: targetPlayer.createdAt
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== TICK PROCESSOR ==========

setInterval(async () => {
  const now = new Date();
  const TICK_HOURS = 30 / 3600;
  
  try {
    // Production - Optimized with batch updates
    const cities = await prisma.city.findMany({ where: { isSieged: false }, include: { buildings: true } });

    // Prepare all updates
    const cityUpdates = cities.map(city => {
      let wood = 5, stone = 5, iron = 5, food = 10; // Base production
      for (const b of city.buildings) {
        if (b.key === 'LUMBER') wood += b.level * 30;
        else if (b.key === 'QUARRY') stone += b.level * 30;
        else if (b.key === 'IRON_MINE') iron += b.level * 30;
        else if (b.key === 'FARM') food += b.level * 40;
      }

      return prisma.city.update({
        where: { id: city.id },
        data: {
          wood: Math.min(city.wood + wood * TICK_HOURS, city.maxStorage),
          stone: Math.min(city.stone + stone * TICK_HOURS, city.maxStorage),
          iron: Math.min(city.iron + iron * TICK_HOURS, city.maxStorage),
          food: Math.min(city.food + food * TICK_HOURS, city.maxFoodStorage)
        }
      });
    });

    // Execute all updates in parallel (batch)
    await Promise.all(cityUpdates);

    // ========== UPKEEP: Consommation de céréales par les troupes ==========
    const allArmies = await prisma.army.findMany({
      include: { units: true, city: true }
    });
    
    for (const army of allArmies) {
      if (!army.cityId) continue; // Armée en mouvement, pas d'upkeep
      
      let foodConsumption = 0;
      for (const unit of army.units) {
        const unitDef = unitsData.find(u => u.key === unit.unitKey);
        // Upkeep par tier: base=5, inter=10, elite=15, siege=20
        const upkeep = unitDef?.tier === 'base' ? 5 : 
                       unitDef?.tier === 'intermediate' ? 10 : 
                       unitDef?.tier === 'elite' ? 15 : 20;
        foodConsumption += unit.count * upkeep;
      }
      
      // Consommation par tick (30 secondes = 1/120 d'heure)
      const consumption = foodConsumption * TICK_HOURS;
      
      if (consumption > 0 && army.city) {
        const city = await prisma.city.findUnique({ where: { id: army.cityId } });
        if (city) {
          const newFood = Math.max(0, city.food - consumption);
          await prisma.city.update({
            where: { id: city.id },
            data: { food: newFood }
          });

          // Si plus de nourriture, les troupes meurent de faim (10% par tick sans food)
          if (newFood <= 0) {
            for (const unit of army.units) {
              const losses = Math.ceil(unit.count * 0.1);
              if (losses > 0) {
                const remaining = Math.max(0, unit.count - losses);
                if (remaining > 0) {
                  await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: remaining } });
                } else {
                  await prisma.armyUnit.delete({ where: { id: unit.id } });
                }
                console.log(`[STARVATION] ${losses}x ${unit.unitKey} morts de faim!`);
              }
            }
          }
        }
      }
    }

    // Construction done
    const builds = await prisma.buildQueueItem.findMany({
      where: { status: 'RUNNING', endsAt: { lte: now } },
      include: { city: { include: { buildings: true, buildQueue: true } } }
    });
    
    // Group builds by city to handle multiple completions
    const buildsByCityId = {};
    for (const b of builds) {
      if (!buildsByCityId[b.cityId]) buildsByCityId[b.cityId] = [];
      buildsByCityId[b.cityId].push(b);
    }
    
    for (const cityId of Object.keys(buildsByCityId)) {
      const cityBuilds = buildsByCityId[cityId];
      
      for (const b of cityBuilds) {
        const existing = b.city.buildings.find(x => x.key === b.buildingKey);
        if (existing) {
          await prisma.cityBuilding.update({ where: { id: existing.id }, data: { level: b.targetLevel } });
        } else {
          const slot = b.slot || (b.city.buildings.length + 1);
          await prisma.cityBuilding.create({
            data: { cityId: b.cityId, key: b.buildingKey, slot, level: b.targetLevel }
          });
        }
        await prisma.buildQueueItem.delete({ where: { id: b.id } });
        console.log(`[BUILD] ${b.buildingKey} niveau ${b.targetLevel}`);
      }
      
      // Count how many RUNNING slots are now free
      const remainingRunning = await prisma.buildQueueItem.count({
        where: { cityId, status: 'RUNNING' }
      });
      const MAX_RUNNING = 2;
      const slotsToStart = MAX_RUNNING - remainingRunning;
      
      if (slotsToStart > 0) {
        // Start next queued items (up to slotsToStart)
        const nextQueued = await prisma.buildQueueItem.findMany({
          where: { cityId, status: 'QUEUED' },
          orderBy: { slot: 'asc' },
          take: slotsToStart
        });
        
        for (const next of nextQueued) {
          const buildingDef = buildingsData.find(bd => bd.key === next.buildingKey);
          const baseTime = buildingDef?.timeL1Sec || 60;
          const durationSec = Math.floor(baseTime * Math.pow(1.8, next.targetLevel - 1));
          const endsAt = new Date(now.getTime() + durationSec * 1000);
          await prisma.buildQueueItem.update({
            where: { id: next.id },
            data: { status: 'RUNNING', startedAt: now, endsAt }
          });
          console.log(`[BUILD] Demarrage ${next.buildingKey} niveau ${next.targetLevel}`);
        }
      }
    }

    // Recruitment done
    const recruits = await prisma.recruitQueueItem.findMany({
      where: { status: 'RUNNING', endsAt: { lte: now } },
      include: { city: { include: { armies: { include: { units: true } } } } }
    });
    for (const r of recruits) {
      const garrison = r.city.armies.find(a => a.cityId === r.cityId);
      if (garrison) {
        const unit = unitsData.find(u => u.key === r.unitKey);
        const existing = garrison.units.find(u => u.unitKey === r.unitKey);
        if (existing) {
          await prisma.armyUnit.update({ where: { id: existing.id }, data: { count: existing.count + r.count } });
        } else {
          await prisma.armyUnit.create({ data: { armyId: garrison.id, unitKey: r.unitKey, tier: unit?.tier || 'base', count: r.count } });
        }
      }
      await prisma.recruitQueueItem.delete({ where: { id: r.id } });
      console.log(`[RECRUIT] ${r.count}x ${r.unitKey}`);
    }

    // Expeditions done
    const expeditions = await prisma.expedition.findMany({
      where: { status: 'IN_PROGRESS', endsAt: { lte: now } },
      include: { player: { include: { hero: true } } }
    });
    for (const exp of expeditions) {
      const army = await prisma.army.findUnique({ where: { id: exp.armyId }, include: { units: true } });
      const playerPower = army ? army.units.reduce((sum, u) => sum + u.count * 10, 0) : 0;
      const won = playerPower > exp.enemyPower * 0.7;
      
      let xpGained = 0;
      let lootGained = null;
      
      if (won) {
        xpGained = Math.floor(exp.enemyPower * 0.25 / 100);
        if (exp.player.hero) {
          const hero = exp.player.hero;
          const newXp = hero.xp + xpGained;
          let newLevel = hero.level;
          let newXpToNext = hero.xpToNextLevel;
          let newStatPoints = hero.statPoints;
          
          if (newXp >= hero.xpToNextLevel) {
            newLevel++;
            newXpToNext = Math.floor(hero.xpToNextLevel * 1.5);
            newStatPoints += 4;
          }
          
          await prisma.hero.update({
            where: { id: hero.id },
            data: { xp: newXp % hero.xpToNextLevel, level: newLevel, xpToNextLevel: newXpToNext, statPoints: newStatPoints }
          });
        }
        
        // Generate loot
        const lootChance = { COMMON: 0.5, RARE: 0.3, EPIC: 0.15, LEGENDARY: 0.05 }[exp.lootTier] || 0.5;
        if (Math.random() < lootChance) {
          lootGained = { gold: Math.floor(50 + Math.random() * 100 * exp.difficulty) };
          await prisma.player.update({
            where: { id: exp.playerId },
            data: { gold: { increment: lootGained.gold } }
          });
        }
      }
      
      await prisma.expedition.update({
        where: { id: exp.id },
        data: { status: 'COMPLETED', won, xpGained, lootGained }
      });
      
      if (army) {
        await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE' } });
      }
      
      console.log(`[EXPEDITION] ${won ? 'Victoire' : 'Defaite'} +${xpGained}XP`);
    }

    // Generate new expeditions (1 per hour per player)
    if (Math.random() < (30 / 3600)) {
      const players = await prisma.player.findMany({ select: { id: true } });
      for (const p of players) {
        const count = await prisma.expedition.count({ where: { playerId: p.id, status: 'AVAILABLE' } });
        if (count < 15) {
          await createExpedition(p.id);
        }
      }
    }

    // ========== ARMY MOVEMENT & COMBAT RESOLUTION ==========
    const movingArmies = await prisma.army.findMany({
      where: {
        status: { in: ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING'] },
        arrivalAt: { lte: now }
      },
      include: { units: true, owner: true, city: true }
    });

    for (const army of movingArmies) {
      try {
        // Move army to destination
        await prisma.army.update({
          where: { id: army.id },
          data: { x: army.targetX, y: army.targetY }
        });

        // Handle different mission types
        if (army.missionType === 'MOVE' || army.status === 'MOVING') {
          // Simple move - just update position and set IDLE
          await prisma.army.update({
            where: { id: army.id },
            data: { status: 'IDLE', targetX: null, targetY: null, arrivalAt: null, missionType: null }
          });
          console.log(`[MOVE] ${army.name} arrived at (${army.targetX}, ${army.targetY})`);
        }

        else if (army.missionType === 'RETURN' || army.status === 'RETURNING') {
          // Return home - unload carried resources
          if (army.cityId) {
            const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
            if (homeCity) {
              await prisma.city.update({
                where: { id: homeCity.id },
                data: {
                  wood: Math.min(homeCity.wood + army.carryWood, homeCity.maxStorage),
                  stone: Math.min(homeCity.stone + army.carryStone, homeCity.maxStorage),
                  iron: Math.min(homeCity.iron + army.carryIron, homeCity.maxStorage),
                  food: Math.min(homeCity.food + army.carryFood, homeCity.maxFoodStorage)
                }
              });
            }
          }
          await prisma.army.update({
            where: { id: army.id },
            data: { 
              status: 'IDLE', 
              targetX: null, targetY: null, arrivalAt: null, missionType: null,
              carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0
            }
          });
          console.log(`[RETURN] ${army.name} returned home with loot`);
        }

        else if (army.missionType === 'ATTACK' || army.status === 'ATTACKING') {
          // Find target city
          const targetCity = await prisma.city.findUnique({
            where: { id: army.targetCityId },
            include: { armies: { include: { units: true } }, buildings: true, player: true }
          });

          if (targetCity) {
            // Get defender units (all armies in the city)
            const defenderUnits = targetCity.armies.flatMap(a => a.units);
            const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
            const moatLevel = targetCity.buildings.find(b => b.key === 'MOAT')?.level || 0;

            // Resolve combat with detailed rounds
            const result = resolveCombatDetailed(army.units, defenderUnits, wallLevel, moatLevel, army.player.name, targetCity.player.name);
            
            // Apply losses to attacker
            for (const unit of army.units) {
              const unitResult = result.attackerFinalUnits.find(u => u.key === unit.unitKey);
              const newCount = unitResult ? unitResult.remaining : 0;
              if (newCount <= 0) {
                await prisma.armyUnit.delete({ where: { id: unit.id } });
              } else {
                await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
              }
            }

            // Apply losses to defenders
            for (const defArmy of targetCity.armies) {
              for (const unit of defArmy.units) {
                const unitResult = result.defenderFinalUnits.find(u => u.key === unit.unitKey);
                const newCount = unitResult ? unitResult.remaining : 0;
                if (newCount <= 0) {
                  await prisma.armyUnit.delete({ where: { id: unit.id } });
                } else {
                  await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
                }
              }
            }

            // Damage wall
            if (result.attackerWon) {
              const wallDamage = Math.floor(targetCity.wallMaxHp * 0.1 * (1 + result.rounds.length * 0.05));
              await prisma.city.update({
                where: { id: targetCity.id },
                data: { wallHp: Math.max(0, targetCity.wallHp - wallDamage) }
              });
            }

            // Create detailed battle report
            await prisma.battleReport.create({
              data: {
                playerId: army.playerId,
                x: targetCity.x,
                y: targetCity.y,
                attackerUnits: result.attackerInitialUnits,
                defenderUnits: result.defenderInitialUnits,
                attackerLosses: { 
                  rate: result.attackerLossRate,
                  units: result.attackerFinalUnits,
                  totalKilled: result.attackerTotalKilled
                },
                defenderLosses: { 
                  rate: result.defenderLossRate,
                  units: result.defenderFinalUnits,
                  totalKilled: result.defenderTotalKilled
                },
                winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER',
                loot: {
                  rounds: result.rounds,
                  wallDamage: result.attackerWon ? Math.floor(targetCity.wallMaxHp * 0.1) : 0,
                  attackerName: army.player.name,
                  defenderName: targetCity.player.name,
                  cityName: targetCity.name,
                  duration: result.rounds.length
                }
              }
            });

            // Also create report for defender
            await prisma.battleReport.create({
              data: {
                playerId: targetCity.playerId,
                x: targetCity.x,
                y: targetCity.y,
                attackerUnits: result.attackerInitialUnits,
                defenderUnits: result.defenderInitialUnits,
                attackerLosses: { 
                  rate: result.attackerLossRate,
                  units: result.attackerFinalUnits,
                  totalKilled: result.attackerTotalKilled
                },
                defenderLosses: { 
                  rate: result.defenderLossRate,
                  units: result.defenderFinalUnits,
                  totalKilled: result.defenderTotalKilled
                },
                winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER',
                loot: {
                  rounds: result.rounds,
                  wallDamage: result.attackerWon ? Math.floor(targetCity.wallMaxHp * 0.1) : 0,
                  attackerName: army.player.name,
                  defenderName: targetCity.player.name,
                  cityName: targetCity.name,
                  duration: result.rounds.length
                }
              }
            });

            // Update stats
            if (result.attackerWon) {
              await prisma.playerStats.update({
                where: { playerId: army.playerId },
                data: { attacksWon: { increment: 1 }, unitsKilled: { increment: result.defenderTotalKilled } }
              });
            } else {
              await prisma.playerStats.update({
                where: { playerId: targetCity.playerId },
                data: { defensesWon: { increment: 1 }, unitsKilled: { increment: result.attackerTotalKilled } }
              });
            }

            console.log(`[ATTACK] ${army.player.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Attacker won' : 'Defender won'} (${result.rounds.length} rounds)`);
          }

          // Army returns home after attack
          if (army.cityId) {
            const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
            if (homeCity) {
              const travelTime = calculateTravelTime(army.targetX, army.targetY, homeCity.x, homeCity.y, 50);
              await prisma.army.update({
                where: { id: army.id },
                data: {
                  status: 'RETURNING',
                  targetX: homeCity.x,
                  targetY: homeCity.y,
                  targetCityId: null,
                  missionType: 'RETURN',
                  arrivalAt: new Date(Date.now() + travelTime * 1000)
                }
              });
            }
          } else {
            await prisma.army.update({
              where: { id: army.id },
              data: { status: 'IDLE', targetX: null, targetY: null, arrivalAt: null, missionType: null }
            });
          }
        }

        else if (army.missionType === 'RAID' || army.status === 'RAIDING') {
          // Find target city
          const targetCity = await prisma.city.findUnique({
            where: { id: army.targetCityId },
            include: { armies: { include: { units: true } }, buildings: true, player: true }
          });

          if (targetCity) {
            const defenderUnits = targetCity.armies.flatMap(a => a.units);
            const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;

            // Resolve combat (lighter for raids)
            const result = resolveCombat(army.units, defenderUnits, wallLevel);
            
            // Apply lighter losses for raid
            for (const unit of army.units) {
              const newCount = Math.floor(unit.count * (1 - result.attackerLossRate * 0.5));
              if (newCount <= 0) {
                await prisma.armyUnit.delete({ where: { id: unit.id } });
              } else {
                await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
              }
            }

            // Calculate carry capacity and steal resources if won
            let carryWood = 0, carryStone = 0, carryIron = 0, carryFood = 0;
            
            if (result.attackerWon) {
              // Calculate total carry capacity
              let totalCarry = 0;
              for (const unit of army.units) {
                const unitDef = unitsData.find(u => u.key === unit.unitKey);
                if (unitDef) {
                  totalCarry += (unitDef.stats.transport || 50) * unit.count;
                }
              }

              // Steal up to 50% of resources or carry capacity
              const stealRate = 0.5;
              const availableWood = Math.min(targetCity.wood * stealRate, totalCarry * 0.25);
              const availableStone = Math.min(targetCity.stone * stealRate, totalCarry * 0.25);
              const availableIron = Math.min(targetCity.iron * stealRate, totalCarry * 0.25);
              const availableFood = Math.min(targetCity.food * stealRate, totalCarry * 0.25);

              carryWood = Math.floor(availableWood);
              carryStone = Math.floor(availableStone);
              carryIron = Math.floor(availableIron);
              carryFood = Math.floor(availableFood);

              // Remove resources from target city
              await prisma.city.update({
                where: { id: targetCity.id },
                data: {
                  wood: targetCity.wood - carryWood,
                  stone: targetCity.stone - carryStone,
                  iron: targetCity.iron - carryIron,
                  food: targetCity.food - carryFood
                }
              });

              console.log(`[RAID] ${army.player.name} raided ${targetCity.player.name}: ${carryWood}W ${carryStone}S ${carryIron}I ${carryFood}F`);
            }

            // Create battle report
            await prisma.battleReport.create({
              data: {
                playerId: army.playerId,
                x: targetCity.x,
                y: targetCity.y,
                attackerUnits: army.units.map(u => ({ key: u.unitKey, count: u.count })),
                defenderUnits: defenderUnits.map(u => ({ key: u.unitKey, count: u.count })),
                attackerLosses: { rate: result.attackerLossRate },
                defenderLosses: { rate: result.defenderLossRate },
                winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER',
                loot: result.attackerWon ? { wood: carryWood, stone: carryStone, iron: carryIron, food: carryFood } : null
              }
            });

            // Army returns with loot
            if (army.cityId) {
              const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
              if (homeCity) {
                const travelTime = calculateTravelTime(army.targetX, army.targetY, homeCity.x, homeCity.y, 50);
                await prisma.army.update({
                  where: { id: army.id },
                  data: {
                    status: 'RETURNING',
                    targetX: homeCity.x,
                    targetY: homeCity.y,
                    targetCityId: null,
                    missionType: 'RETURN',
                    arrivalAt: new Date(Date.now() + travelTime * 1000),
                    carryWood, carryStone, carryIron, carryFood
                  }
                });
              }
            }
          }
        }
        
        // ========== ESPIONNAGE ==========
        else if (army.missionType === 'SPY' || army.status === 'SPYING') {
          const targetCity = await prisma.city.findUnique({
            where: { id: army.targetCityId },
            include: { armies: { include: { units: true } }, buildings: true, player: true }
          });

          if (targetCity) {
            // Spy success chance based on army size (more scouts = better)
            const spyPower = army.units.reduce((sum, u) => sum + u.count, 0);
            const defenderPower = targetCity.armies.flatMap(a => a.units).reduce((sum, u) => sum + u.count, 0);
            const successChance = Math.min(0.9, 0.5 + (spyPower / Math.max(1, defenderPower)) * 0.3);
            const success = Math.random() < successChance;

            if (success) {
              // Create spy report
              await prisma.spyReport.create({
                data: {
                  playerId: army.playerId,
                  targetPlayerId: targetCity.playerId,
                  targetCityId: targetCity.id,
                  x: targetCity.x,
                  y: targetCity.y,
                  cityName: targetCity.name,
                  buildings: targetCity.buildings.map(b => ({ key: b.key, level: b.level })),
                  armies: targetCity.armies.map(a => ({
                    name: a.name,
                    units: a.units.map(u => ({ key: u.unitKey, count: u.count }))
                  })),
                  resources: {
                    wood: Math.floor(targetCity.wood),
                    stone: Math.floor(targetCity.stone),
                    iron: Math.floor(targetCity.iron),
                    food: Math.floor(targetCity.food)
                  },
                  success: true
                }
              });
              console.log(`[SPY] ${army.player.name} successfully spied on ${targetCity.player.name}`);
            } else {
              // Failed - create empty report
              await prisma.spyReport.create({
                data: {
                  playerId: army.playerId,
                  targetPlayerId: targetCity.playerId,
                  targetCityId: targetCity.id,
                  x: targetCity.x,
                  y: targetCity.y,
                  cityName: targetCity.name,
                  buildings: [],
                  armies: [],
                  resources: {},
                  success: false
                }
              });
              console.log(`[SPY] ${army.player.name} failed to spy on ${targetCity.player.name}`);
            }
          }

          // Army returns home
          if (army.cityId) {
            const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
            if (homeCity) {
              const travelTime = calculateTravelTime(army.targetX, army.targetY, homeCity.x, homeCity.y, 80);
              await prisma.army.update({
                where: { id: army.id },
                data: {
                  status: 'RETURNING',
                  targetX: homeCity.x,
                  targetY: homeCity.y,
                  targetCityId: null,
                  missionType: 'RETURN',
                  arrivalAt: new Date(Date.now() + travelTime * 1000)
                }
              });
            }
          }
        }
        
        // ========== TRANSPORT ==========
        else if (army.missionType === 'TRANSPORT' || army.status === 'TRANSPORTING') {
          const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId } });

          if (targetCity) {
            // Deliver resources
            await prisma.city.update({
              where: { id: targetCity.id },
              data: {
                wood: Math.min(targetCity.wood + army.carryWood, targetCity.maxStorage),
                stone: Math.min(targetCity.stone + army.carryStone, targetCity.maxStorage),
                iron: Math.min(targetCity.iron + army.carryIron, targetCity.maxStorage),
                food: Math.min(targetCity.food + army.carryFood, targetCity.maxFoodStorage)
              }
            });
            
            console.log(`[TRANSPORT] ${army.player.name} delivered ${army.carryWood}W ${army.carryStone}S ${army.carryIron}I ${army.carryFood}F to ${targetCity.name}`);
          }

          // Army returns home (empty)
          if (army.cityId) {
            const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
            if (homeCity) {
              const travelTime = calculateTravelTime(army.targetX, army.targetY, homeCity.x, homeCity.y, 50);
              await prisma.army.update({
                where: { id: army.id },
                data: {
                  status: 'RETURNING',
                  targetX: homeCity.x,
                  targetY: homeCity.y,
                  targetCityId: null,
                  missionType: 'RETURN',
                  arrivalAt: new Date(Date.now() + travelTime * 1000),
                  carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0
                }
              });
            }
          }
        }
      } catch (armyError) {
        console.error(`[ARMY ERROR] ${army.id}:`, armyError.message);
      }
    }

    // Update population
    const players = await prisma.player.findMany({ include: { cities: { include: { buildings: true } } } });
    for (const p of players) {
      let pop = 0;
      for (const c of p.cities) {
        for (const b of c.buildings) pop += b.level * 5;
      }
      await prisma.player.update({ where: { id: p.id }, data: { population: pop } });
    }
  } catch (e) {
    console.error('Tick error:', e);
  }
}, 30000);

// Route par défaut
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Fonction de démarrage avec retry pour la DB
async function startServer() {
  console.log('');
  console.log('🚀 Démarrage MonJeu v0.6...');
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Configurée' : '❌ Manquante'}`);
  console.log('');
  
  // Test de connexion à la base de données avec retry
  const MAX_RETRIES = 10;
  const RETRY_DELAY = 2000;
  let connected = false;
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      console.log(`⏳ Tentative de connexion DB ${i + 1}/${MAX_RETRIES}...`);
      await prisma.$connect();
      
      // Test simple pour vérifier que la DB répond
      await prisma.$queryRaw`SELECT 1`;
      
      console.log('✅ Connexion à la base de données réussie!');
      connected = true;

      // Exécuter prisma db push pour s'assurer que les tables existent
      console.log('📦 Synchronisation du schéma de base de données...');
      try {
        execSync('npx prisma db push --accept-data-loss --skip-generate', {
          stdio: 'inherit',
          env: { ...process.env }
        });
        console.log('✅ Schéma de base de données synchronisé!');
      } catch (dbPushError) {
        console.error('⚠️ Erreur lors de la synchronisation du schéma:', dbPushError.message);
      }

      break;
    } catch (e) {
      console.log(`   Erreur: ${e.message.substring(0, 100)}`);
      if (i === MAX_RETRIES - 1) {
        console.error('');
        console.error('❌ Impossible de se connecter à la base de données après', MAX_RETRIES, 'tentatives');
        console.error('   Vérifiez DATABASE_URL dans les variables d\'environnement');
        console.error('');
        // On ne quitte pas, on laisse Railway décider
      } else {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    }
  }
  
  // Démarrer le serveur même si pas de DB (pour le health check)
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('==========================================');
    console.log(`   MonJeu v0.6 - ONLINE`);
    console.log(`   URL: http://0.0.0.0:${PORT}`);
    console.log(`   DB:  ${connected ? '✅ Connectée' : '❌ Non connectée'}`);
    console.log('==========================================');
    console.log('');
  });
  
  return server;
}

// Gestion propre de l'arrêt
process.on('SIGTERM', async () => {
  console.log('SIGTERM reçu, arrêt gracieux...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT reçu, arrêt gracieux...');
  await prisma.$disconnect();
  process.exit(0);
});

// Démarrer le serveur
startServer().catch(e => {
  console.error('Erreur au démarrage:', e);
  process.exit(1);
});
