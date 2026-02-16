const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
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

// Trust proxy pour Render
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

// ========== FACTION UNITS FOR RESOURCE POINT DEFENDERS ==========
const FACTIONS_LIST = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];

const FACTION_UNITS = {
  ROME: {
    infantry: { base: 'ROM_INF_MILICIEN', intermediate: 'ROM_INF_TRIARII', elite: 'ROM_INF_LEGIONNAIRE' },
    archer: { base: 'ROM_ARC_MILICIEN', intermediate: 'ROM_ARC_VETERAN', elite: 'ROM_ARC_ELITE' },
    cavalry: { base: 'ROM_CAV_AUXILIAIRE', intermediate: 'ROM_CAV_EQUITES', elite: 'ROM_CAV_LOURDE' }
  },
  GAUL: {
    infantry: { base: 'GAU_INF_GUERRIER', intermediate: 'GAU_INF_TRIARII', elite: 'GAU_INF_CHAMPION' },
    archer: { base: 'GAU_ARC_CHASSEUR', intermediate: 'GAU_ARC_GAULOIS', elite: 'GAU_ARC_NOBLE' },
    cavalry: { base: 'GAU_CAV_CHASSEUR', intermediate: 'GAU_CAV_GAULOIS', elite: 'GAU_CAV_NOBLE' }
  },
  GREEK: {
    infantry: { base: 'GRE_INF_JEUNE', intermediate: 'GRE_INF_HOPLITE', elite: 'GRE_INF_SPARTIATE' },
    archer: { base: 'GRE_ARC_PAYSAN', intermediate: 'GRE_ARC_TOXOTE', elite: 'GRE_ARC_ELITE' },
    cavalry: { base: 'GRE_CAV_ECLAIREUR', intermediate: 'GRE_CAV_GREC', elite: 'GRE_CAV_ELITE' }
  },
  EGYPT: {
    infantry: { base: 'EGY_INF_ESCLAVE', intermediate: 'EGY_INF_NIL', elite: 'EGY_INF_TEMPLE' },
    archer: { base: 'EGY_ARC_NIL', intermediate: 'EGY_ARC_DESERT', elite: 'EGY_ARC_PHARAON' },
    cavalry: { base: 'EGY_CAV_DESERT', intermediate: 'EGY_CAV_PHARAON', elite: 'EGY_CAV_CHAR_LOURD' }
  },
  HUN: {
    infantry: { base: 'HUN_INF_NOMADE', intermediate: 'HUN_INF_GARDE', elite: 'HUN_INF_VETERAN' },
    archer: { base: 'HUN_ARC_NOMADE', intermediate: 'HUN_ARC_CAMP', elite: 'HUN_ARC_ELITE' },
    cavalry: { base: 'HUN_CAV_PILLARD', intermediate: 'HUN_CAV_INTER', elite: 'HUN_CAV_ELITE' }
  },
  SULTAN: {
    infantry: { base: 'SUL_INF_DESERT', intermediate: 'SUL_INF_CROISSANT', elite: 'SUL_INF_PALAIS' },
    archer: { base: 'SUL_ARC_DESERT', intermediate: 'SUL_ARC_TIREUR', elite: 'SUL_ARC_PERSE' },
    cavalry: { base: 'SUL_CAV_BEDOUIN', intermediate: 'SUL_CAV_DESERT', elite: 'SUL_CAV_MAMELOUK' }
  }
};

// Generate tribe defenders for resource points
// Level 1: 100 soldats de base (INF/ARC/CAV)
// Level 2: 600 soldats base + intermédiaire
// Level 3: 1500 soldats base + intermédiaire + élite
function generateTribeDefenders(level, isGold = false, resourcePercent = 1.0) {
  // Choisir une faction aléatoire
  const faction = FACTIONS_LIST[Math.floor(Math.random() * FACTIONS_LIST.length)];
  const factionUnits = FACTION_UNITS[faction];

  const units = {};
  let totalSoldiers;

  // Déterminer le nombre total de soldats selon le niveau
  if (level === 1) {
    totalSoldiers = Math.max(10, Math.floor(100 * resourcePercent));
  } else if (level === 2) {
    totalSoldiers = Math.max(60, Math.floor(600 * resourcePercent));
  } else {
    totalSoldiers = Math.max(150, Math.floor(1500 * resourcePercent));
  }

  // Répartition aléatoire entre les 3 classes
  const infRatio = 0.25 + Math.random() * 0.2;  // 25-45%
  const arcRatio = 0.25 + Math.random() * 0.2;  // 25-45%
  const cavRatio = 1 - infRatio - arcRatio;     // Le reste

  if (level === 1) {
    // Seulement base
    units[factionUnits.infantry.base] = Math.floor(totalSoldiers * infRatio);
    units[factionUnits.archer.base] = Math.floor(totalSoldiers * arcRatio);
    units[factionUnits.cavalry.base] = Math.floor(totalSoldiers * cavRatio);

  } else if (level === 2) {
    // 60% base, 40% intermédiaire
    const baseCount = Math.floor(totalSoldiers * 0.6);
    const interCount = totalSoldiers - baseCount;

    units[factionUnits.infantry.base] = Math.floor(baseCount * infRatio);
    units[factionUnits.archer.base] = Math.floor(baseCount * arcRatio);
    units[factionUnits.cavalry.base] = Math.floor(baseCount * cavRatio);
    units[factionUnits.infantry.intermediate] = Math.floor(interCount * infRatio);
    units[factionUnits.archer.intermediate] = Math.floor(interCount * arcRatio);
    units[factionUnits.cavalry.intermediate] = Math.floor(interCount * cavRatio);

  } else {
    // 40% base, 35% intermédiaire, 25% élite
    const baseCount = Math.floor(totalSoldiers * 0.4);
    const interCount = Math.floor(totalSoldiers * 0.35);
    const eliteCount = totalSoldiers - baseCount - interCount;

    units[factionUnits.infantry.base] = Math.floor(baseCount * infRatio);
    units[factionUnits.archer.base] = Math.floor(baseCount * arcRatio);
    units[factionUnits.cavalry.base] = Math.floor(baseCount * cavRatio);
    units[factionUnits.infantry.intermediate] = Math.floor(interCount * infRatio);
    units[factionUnits.archer.intermediate] = Math.floor(interCount * arcRatio);
    units[factionUnits.cavalry.intermediate] = Math.floor(interCount * cavRatio);
    units[factionUnits.infantry.elite] = Math.floor(eliteCount * infRatio);
    units[factionUnits.archer.elite] = Math.floor(eliteCount * arcRatio);
    units[factionUnits.cavalry.elite] = Math.floor(eliteCount * cavRatio);
  }

  // Calculer la puissance
  const basePower = isGold ? 140 : 100;
  const power = basePower * level * (totalSoldiers / 100);

  return { power, units, faction };
}

const validateCoordinates = (x, y) => {
  return Number.isInteger(x) && Number.isInteger(y) &&
         x >= -500 && x <= 500 && y >= -500 && y <= 500;
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
let factionsData = {};
try {
  unitsData = JSON.parse(fs.readFileSync('data/units.json', 'utf-8')).units || [];
  buildingsData = JSON.parse(fs.readFileSync('data/buildings.json', 'utf-8')).buildings || [];
  factionsData = JSON.parse(fs.readFileSync('data/factions.json', 'utf-8')).factions || {};
} catch (e) {
  console.warn('Could not load game data:', e.message);
}

// ========== PRODUCTION INTERPOLATION (matching frontend formula) ==========
function lerpExp(a, b, t) {
  if (a <= 0 || b <= 0) return a + (b - a) * t;
  return a * Math.pow(b / a, Math.max(0, Math.min(1, t)));
}

function getProductionAtLevel(buildingKey, level) {
  const def = buildingsData.find(b => b.key === buildingKey);
  if (!def || !def.effects) return level * 30;

  const prodKeys = {
    'FARM': 'foodProd',
    'LUMBER': 'woodProd',
    'QUARRY': 'stoneProd',
    'IRON_MINE': 'ironProd'
  };
  const prodKey = prodKeys[buildingKey];
  if (!prodKey) return 0;

  const L1 = def.effects[prodKey + 'L1'] || 10;
  const L10 = def.effects[prodKey + 'L10'];
  const L20 = def.effects[prodKey + 'L20'] || 4500;

  if (level <= 0) return 0;
  if (level <= 1) return L1;
  if (level >= 20) return L20;

  if (L10) {
    if (level <= 10) {
      const t = (level - 1) / 9;
      return Math.round(lerpExp(L1, L10, t));
    } else {
      const t = (level - 10) / 10;
      return Math.round(lerpExp(L10, L20, t));
    }
  } else {
    const t = (level - 1) / 19;
    return Math.round(lerpExp(L1, L20, t));
  }
}

// ========== FACTION BONUS HELPERS ==========
function getFactionBonus(faction, bonusType) {
  const factionData = factionsData[faction];
  if (!factionData || !factionData.bonuses) return 0;
  const bonus = factionData.bonuses.find(b => b.type === bonusType);
  return bonus ? bonus.value : 0;
}

// ========== WOUNDED UNIT SYSTEM ==========
// Calculate how many units become wounded instead of dead
// Base rate: 30% of dead units become wounded (if defender has Healing Tent)
// Greek bonus: +10% wounded conversion
async function calculateWoundedUnits(cityId, killedUnits, faction) {
  // Check if city has HEALING_TENT
  const healingTent = await prisma.cityBuilding.findFirst({
    where: { cityId, key: 'HEALING_TENT' }
  });

  if (!healingTent) return []; // No healing tent = no wounded, all dead

  // Base wounded rate: 30% + 3% per healing tent level
  let woundedRate = 0.30 + (healingTent.level * 0.03);

  // Greek faction bonus: +10% wounded conversion
  const greekBonus = getFactionBonus(faction, 'woundedConversion');
  woundedRate += greekBonus / 100;

  // Cap at 70%
  woundedRate = Math.min(0.70, woundedRate);

  const woundedUnits = [];
  for (const unit of killedUnits) {
    if (unit.killed > 0) {
      const wounded = Math.floor(unit.killed * woundedRate);
      if (wounded > 0) {
        woundedUnits.push({
          unitKey: unit.key,
          count: wounded
        });
      }
    }
  }

  return woundedUnits;
}

// Add wounded units to city's healing queue
async function addWoundedUnits(cityId, woundedUnits) {
  if (!woundedUnits || woundedUnits.length === 0) return;

  // Get healing tent level for heal time calculation
  const healingTent = await prisma.cityBuilding.findFirst({
    where: { cityId, key: 'HEALING_TENT' }
  });

  const healingLevel = healingTent?.level || 1;
  // Base heal time: 30 minutes, reduced by 5% per level
  const baseHealTimeMinutes = 30 * Math.pow(0.95, healingLevel - 1);

  for (const unit of woundedUnits) {
    const healsAt = new Date(Date.now() + baseHealTimeMinutes * 60 * 1000);

    // Upsert wounded units (add to existing or create new)
    const existing = await prisma.woundedUnit.findUnique({
      where: { cityId_unitKey: { cityId, unitKey: unit.unitKey } }
    });

    if (existing) {
      await prisma.woundedUnit.update({
        where: { id: existing.id },
        data: {
          count: existing.count + unit.count,
          healsAt: new Date(Math.max(existing.healsAt.getTime(), healsAt.getTime()))
        }
      });
    } else {
      await prisma.woundedUnit.create({
        data: {
          cityId,
          unitKey: unit.unitKey,
          count: unit.count,
          healsAt
        }
      });
    }
  }
}

// Process healed units (called in game tick)
async function processHealedUnits() {
  const now = new Date();

  // Find all wounded units that are ready to heal
  const healedUnits = await prisma.woundedUnit.findMany({
    where: { healsAt: { lte: now } }
  });

  for (const wounded of healedUnits) {
    // Find garrison army in city
    const garrison = await prisma.army.findFirst({
      where: { cityId: wounded.cityId, isGarrison: true },
      include: { units: true }
    });

    if (garrison) {
      // Add healed units back to garrison
      const existingUnit = garrison.units.find(u => u.unitKey === wounded.unitKey);

      if (existingUnit) {
        await prisma.armyUnit.update({
          where: { id: existingUnit.id },
          data: { count: existingUnit.count + wounded.count }
        });
      } else {
        const unitDef = unitsData.find(u => u.key === wounded.unitKey);
        await prisma.armyUnit.create({
          data: {
            armyId: garrison.id,
            unitKey: wounded.unitKey,
            tier: unitDef?.tier || 'base',
            count: wounded.count
          }
        });
      }

      console.log(`[HEAL] ${wounded.count} ${wounded.unitKey} healed in city ${wounded.cityId}`);
    }

    // Remove wounded entry
    await prisma.woundedUnit.delete({ where: { id: wounded.id } });
  }

  return healedUnits.length;
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

// Health check pour Render
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
    const account = await prisma.account.create({ data: { email: email.toLowerCase(), passwordHash: hash } });

    const player = await prisma.player.create({
      data: { accountId: account.id, name, faction: faction.toUpperCase(), gold: 0 }
    });

    await prisma.playerStats.create({ data: { playerId: player.id } });

    // Find free position on map EDGES (players spawn on borders, not center)
    // Map: -187 to +186 (374x374), center is 0,0
    // Spawn zones: within 100 tiles from edges (any side: N, S, E, W)
    const MIN_COORD = -187;
    const MAX_COORD = 186;
    const SPAWN_DELTA = 100; // Players spawn within 100 tiles from map edge

    function getRandomEdgePosition() {
      const side = Math.floor(Math.random() * 4); // 0=North, 1=East, 2=South, 3=West
      let x, y;

      switch(side) {
        case 0: // North edge (top, high Y)
          x = MIN_COORD + Math.floor(Math.random() * (MAX_COORD - MIN_COORD + 1));
          y = MAX_COORD - Math.floor(Math.random() * SPAWN_DELTA);
          break;
        case 1: // East edge (right, high X)
          x = MAX_COORD - Math.floor(Math.random() * SPAWN_DELTA);
          y = MIN_COORD + Math.floor(Math.random() * (MAX_COORD - MIN_COORD + 1));
          break;
        case 2: // South edge (bottom, low Y)
          x = MIN_COORD + Math.floor(Math.random() * (MAX_COORD - MIN_COORD + 1));
          y = MIN_COORD + Math.floor(Math.random() * SPAWN_DELTA);
          break;
        case 3: // West edge (left, low X)
          x = MIN_COORD + Math.floor(Math.random() * SPAWN_DELTA);
          y = MIN_COORD + Math.floor(Math.random() * (MAX_COORD - MIN_COORD + 1));
          break;
      }
      return { x, y };
    }

    let { x, y } = getRandomEdgePosition();
    for (let i = 0; i < 100; i++) {
      const posExists = await prisma.city.findUnique({ where: { x_y: { x, y } } });
      if (!posExists) break;
      ({ x, y } = getRandomEdgePosition());
    }

    // Create capital (NO starter buildings - player builds everything)
    const city = await prisma.city.create({
      data: {
        playerId: player.id,
        name: `Capitale de ${name}`,
        x, y,
        isCapital: true,
        wood: 500, stone: 500, iron: 500, food: 500
      }
    });

    // Create hero
    const hero = await prisma.hero.create({
      data: { playerId: player.id, name: `Heros de ${name}`, statPoints: 5 }
    });

    // Create empty garrison army (no starter units - player recruits everything)
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
    where: { playerId: req.user.playerId },
    include: { buildings: true, buildQueue: { orderBy: { slot: 'asc' } }, recruitQueue: { orderBy: { startedAt: 'asc' } }, armies: { include: { units: true } } }
  });
  // Add city tier information to each city
  const citiesWithTier = cities.map(city => {
    const wallLevel = city.buildings.find(b => b.key === 'WALL')?.level || 0;
    const cityTier = getCityTier(wallLevel);
    return {
      ...city,
      wallLevel,
      cityTier,
      cityTierName: getCityTierName(cityTier)
    };
  });
  res.json(citiesWithTier);
});

// ========== INCOMING ATTACKS ENDPOINT ==========
app.get('/api/incoming-attacks', auth, async (req, res) => {
  try {
    // Find all player's cities
    const playerCities = await prisma.city.findMany({
      where: { playerId: req.user.playerId },
      select: { id: true, name: true, x: true, y: true }
    });
    const cityIds = playerCities.map(c => c.id);

    // Find armies targeting our cities that are ATTACKING or RAIDING
    const incomingArmies = await prisma.army.findMany({
      where: {
        targetCityId: { in: cityIds },
        status: { in: ['ATTACKING', 'RAIDING'] },
        arrivalAt: { gt: new Date() }
      },
      select: {
        id: true,
        status: true,
        arrivalAt: true,
        targetCityId: true,
        missionType: true
      },
      orderBy: { arrivalAt: 'asc' }
    });

    // Map target city names
    const attacks = incomingArmies.map(a => {
      const targetCity = playerCities.find(c => c.id === a.targetCityId);
      return {
        id: a.id,
        type: a.missionType || a.status,
        arrivalAt: a.arrivalAt,
        targetCity: targetCity?.name || 'Ville',
        targetCityId: a.targetCityId
      };
    });

    res.json(attacks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== WOUNDED UNITS ENDPOINTS ==========
app.get('/api/city/:id/wounded', auth, async (req, res) => {
  try {
    const city = await prisma.city.findFirst({
      where: { id: req.params.id, playerId: req.user.playerId }
    });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });

    const wounded = await prisma.woundedUnit.findMany({
      where: { cityId: city.id }
    });

    // Add unit details
    const woundedWithDetails = wounded.map(w => {
      const unitDef = unitsData.find(u => u.key === w.unitKey);
      return {
        ...w,
        unitName: unitDef?.name || w.unitKey,
        faction: unitDef?.faction,
        class: unitDef?.class,
        tier: unitDef?.tier,
        timeToHeal: Math.max(0, new Date(w.healsAt).getTime() - Date.now())
      };
    });

    res.json(woundedWithDetails);
  } catch (e) {
    console.error('Error fetching wounded:', e);
    res.status(500).json({ error: e.message });
  }
});

// Instant heal wounded units (costs gold)
app.post('/api/city/:id/wounded/heal', auth, async (req, res) => {
  try {
    const { unitKey } = req.body;

    const city = await prisma.city.findFirst({
      where: { id: req.params.id, playerId: req.user.playerId }
    });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });

    const player = await prisma.player.findUnique({ where: { id: req.user.playerId } });

    const wounded = await prisma.woundedUnit.findFirst({
      where: { cityId: city.id, unitKey }
    });
    if (!wounded) return res.status(404).json({ error: 'Pas de blessés de ce type' });

    // Gold cost: 1 gold per wounded unit
    const goldCost = wounded.count;
    if (player.gold < goldCost) {
      return res.status(400).json({ error: `Pas assez d'or (${goldCost} requis)` });
    }

    // Deduct gold
    await prisma.player.update({
      where: { id: player.id },
      data: { gold: player.gold - goldCost }
    });

    // Find garrison and add healed units
    const garrison = await prisma.army.findFirst({
      where: { cityId: city.id, isGarrison: true },
      include: { units: true }
    });

    if (garrison) {
      const existingUnit = garrison.units.find(u => u.unitKey === unitKey);
      if (existingUnit) {
        await prisma.armyUnit.update({
          where: { id: existingUnit.id },
          data: { count: existingUnit.count + wounded.count }
        });
      } else {
        const unitDef = unitsData.find(u => u.key === unitKey);
        await prisma.armyUnit.create({
          data: {
            armyId: garrison.id,
            unitKey,
            tier: unitDef?.tier || 'base',
            count: wounded.count
          }
        });
      }
    }

    // Remove wounded entry
    await prisma.woundedUnit.delete({ where: { id: wounded.id } });

    res.json({ success: true, healed: wounded.count, goldSpent: goldCost });
  } catch (e) {
    console.error('Error healing wounded:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/city/:id/build', auth, async (req, res) => {
  try {
    const { buildingKey, slot } = req.body;
    const city = await prisma.city.findFirst({
      where: { id: req.params.id, playerId: req.user.playerId },
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

    // Find existing building - use slot for field buildings (multiple of same type)
    const isFieldBuilding = ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'].includes(buildingKey);
    const existing = isFieldBuilding && slot
      ? city.buildings.find(b => b.key === buildingKey && b.slot === slot)
      : city.buildings.find(b => b.key === buildingKey);
    const inQueue = isFieldBuilding && slot
      ? city.buildQueue.filter(b => b.buildingKey === buildingKey && b.slot === slot).length
      : city.buildQueue.filter(b => b.buildingKey === buildingKey).length;
    const targetLevel = (existing?.level || 0) + inQueue + 1;

    // Get building def
    const buildingDef = buildingsData.find(b => b.key === buildingKey);
    const maxLevel = buildingDef?.maxLevel || 20;
    if (targetLevel > maxLevel) return res.status(400).json({ error: `Niveau max atteint (${maxLevel})` });

    // MAIN_HALL is unique per city (1 only, at slot 0)
    if (buildingKey === 'MAIN_HALL' && existing && !slot) {
      // MAIN_HALL already exists - only allow upgrade, not duplicate
    }

    // Other buildings cannot exceed the current MAIN_HALL level
    if (buildingKey !== 'MAIN_HALL') {
      const mainHall = city.buildings.find(b => b.key === 'MAIN_HALL');
      const mainHallLevel = mainHall?.level || 1;
      if (targetLevel > mainHallLevel) {
        return res.status(400).json({ error: `Le niveau du bâtiment ne peut pas dépasser celui du Bâtiment principal (Niv.${mainHallLevel})` });
      }
    }

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
    let durationSec = Math.floor(baseTime * Math.pow(1.8, targetLevel - 1));

    // Greek faction bonus: -10% build time
    const player = await prisma.player.findUnique({ where: { id: req.user.playerId } });
    const buildTimeBonus = getFactionBonus(player?.faction, 'buildTimeReduction');
    if (buildTimeBonus > 0) {
      durationSec = Math.floor(durationSec * (1 - buildTimeBonus / 100));
    }
    
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

    // Determine the correct slot for the queue item
    let buildSlot = slot;
    if (!buildSlot && existing) {
      // Use existing building's slot for upgrades
      buildSlot = existing.slot;
    }
    if (!buildSlot) {
      // New building - find next available slot
      const usedSlots = new Set(city.buildings.map(b => b.slot));
      const queuedSlots = city.buildQueue.map(q => q.slot);
      queuedSlots.forEach(s => usedSlots.add(s));
      buildSlot = 1;
      while (usedSlots.has(buildSlot)) buildSlot++;
    }

    const queueItem = await prisma.buildQueueItem.create({
      data: {
        cityId: city.id,
        buildingKey,
        targetLevel,
        slot: buildSlot,
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
      where: { id: req.params.id, playerId: req.user.playerId },
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
    where: { playerId: req.user.playerId },
    include: { items: true, army: true }
  });
  res.json(hero);
});

app.post('/api/hero/assign-points', auth, async (req, res) => {
  try {
    const { atk, def, spd, log } = req.body;
    const hero = await prisma.hero.findUnique({ where: { playerId: req.user.playerId } });
    if (!hero) return res.status(404).json({ error: 'Heros non trouve' });

    // Validate non-negative integers to prevent exploit
    const vals = [atk, def, spd, log];
    if (vals.some(v => v !== undefined && v !== null && (typeof v !== 'number' || v < 0 || !Number.isInteger(v)))) {
      return res.status(400).json({ error: 'Valeurs invalides' });
    }
    const total = (atk || 0) + (def || 0) + (spd || 0) + (log || 0);
    if (total <= 0 || total > hero.statPoints) return res.status(400).json({ error: 'Pas assez de points' });

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
function calculateTravelTime(fromX, fromY, toX, toY, armySpeed = 50, faction = null) {
  const distance = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  // Base: 1 tile per 30 seconds at speed 50
  let timePerTile = 30 * (50 / armySpeed);

  // Hun faction bonus: +15% army speed (= -15% travel time)
  if (faction) {
    const speedBonus = getFactionBonus(faction, 'armySpeed');
    if (speedBonus > 0) {
      timePerTile = timePerTile / (1 + speedBonus / 100);
    }
  }

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

// Calculate city tier based on wall level
// Village (tier 1): wall 1-9, Ville (tier 2): wall 10-14, Ville Fortifiée (tier 3): wall 15+
function getCityTier(wallLevel) {
  if (wallLevel >= 15) return 3; // Ville Fortifiée
  if (wallLevel >= 10) return 2; // Ville
  return 1; // Village
}

// Get city tier name for display
function getCityTierName(tier) {
  switch (tier) {
    case 3: return 'Ville Fortifiée';
    case 2: return 'Ville';
    default: return 'Village';
  }
}

// Get minimum siege engines required to attack a city based on tier
function getMinSiegeEngines(cityTier) {
  switch (cityTier) {
    case 3: return 20; // Ville Fortifiée
    case 2: return 10; // Ville
    default: return 1; // Village
  }
}

// Count siege engines in an army
function countSiegeEngines(armyUnits) {
  let count = 0;
  for (const unit of armyUnits) {
    const unitDef = unitsData.find(u => u.key === unit.unitKey);
    if (unitDef && unitDef.class === 'SIEGE') {
      count += unit.count;
    }
  }
  return count;
}

// Resolve combat between attacker and defender
// Hero bonus: +1% attack/defense per hero point
function resolveCombat(attackerUnits, defenderUnits, defenderWallLevel = 0, attackerHero = null, defenderHero = null) {
  // Calculate hero bonuses
  const attackerHeroBonus = attackerHero ? 1 + ((attackerHero.attack || 0) + (attackerHero.defense || 0)) * 0.01 : 1;
  const defenderHeroBonus = defenderHero ? 1 + ((defenderHero.attack || 0) + (defenderHero.defense || 0)) * 0.01 : 1;

  const attackerPower = calculateArmyPower(attackerUnits) * attackerHeroBonus;
  // Defender gets wall bonus: +3% per wall level
  const wallBonus = 1 + (defenderWallLevel * 0.03);
  const defenderPower = calculateArmyPower(defenderUnits) * wallBonus * defenderHeroBonus;

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
// attackerHero/defenderHero: { attack, defense, speed } or null
function resolveCombatDetailed(attackerUnits, defenderUnits, wallLevel = 0, moatLevel = 0, attackerName, defenderName, attackerHero = null, defenderHero = null) {
  // TIER coefficients (ratio 1.8)
  const TIER_COEFF = { base: 1.0, intermediate: 1.10, elite: 1.21, siege: 0.75 };

  // Hero bonus: +1% attack/defense per hero point
  const attackerHeroAttackBonus = attackerHero ? 1 + (attackerHero.attack || 0) * 0.01 : 1;
  const attackerHeroDefenseBonus = attackerHero ? 1 + (attackerHero.defense || 0) * 0.01 : 1;
  const defenderHeroAttackBonus = defenderHero ? 1 + (defenderHero.attack || 0) * 0.01 : 1;
  const defenderHeroDefenseBonus = defenderHero ? 1 + (defenderHero.defense || 0) * 0.01 : 1;

  // Clone units for simulation
  const attackers = attackerUnits.map(u => {
    const def = unitsData.find(x => x.key === u.unitKey);
    return {
      key: u.unitKey,
      initial: u.count,
      count: u.count,
      tier: u.tier || def?.tier || 'base',
      attack: (def?.stats?.attack || 30) * TIER_COEFF[u.tier || def?.tier || 'base'] * attackerHeroAttackBonus,
      defense: (def?.stats?.defense || 30) * TIER_COEFF[u.tier || def?.tier || 'base'] * attackerHeroDefenseBonus,
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
      attack: (def?.stats?.attack || 30) * TIER_COEFF[u.tier || def?.tier || 'base'] * defenderHeroAttackBonus,
      defense: (def?.stats?.defense || 30) * TIER_COEFF[u.tier || def?.tier || 'base'] * defenderHeroDefenseBonus,
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
      where: { id: cityId, playerId: req.user.playerId },
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
      where: { playerId: req.user.playerId }
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
    // Hero requires minimum 1 soldier to move
    if (army.units.length === 0) {
      return res.status(400).json({ error: army.heroId ? 'Le héros nécessite au moins 1 soldat pour se déplacer' : 'Armee vide' });
    }

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
    // Hero requires minimum 1 soldier to attack
    if (army.units.length === 0) {
      return res.status(400).json({ error: army.heroId ? 'Le héros nécessite au moins 1 soldat pour attaquer' : 'Armee vide' });
    }

    const targetCity = await prisma.city.findUnique({
      where: { id: targetCityId },
      include: { buildings: true }
    });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvee' });
    if (targetCity.playerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas attaquer vos propres villes' });

    // Check siege engine requirements based on city tier
    const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
    const cityTier = getCityTier(wallLevel);
    const minSiegeRequired = getMinSiegeEngines(cityTier);
    const siegeCount = countSiegeEngines(army.units);

    if (siegeCount < minSiegeRequired) {
      const tierName = getCityTierName(cityTier);
      return res.status(400).json({
        error: `Pour assiéger une ${tierName}, il faut minimum ${minSiegeRequired} engin(s) de siège. Vous en avez ${siegeCount}.`
      });
    }

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
    // Hero requires minimum 1 soldier to raid
    if (army.units.length === 0) {
      return res.status(400).json({ error: army.heroId ? 'Le héros nécessite au moins 1 soldat pour piller' : 'Armee vide' });
    }

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

// ========== RESOURCE NODE RAID (TRIBE COMBAT) ==========
// Raid a resource node defended by local tribe
app.post('/api/army/:id/raid-resource', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body;
    if (!resourceNodeId) return res.status(400).json({ error: 'ID de ressource requis' });

    // Get army with units
    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { units: true, hero: true, city: true }
    });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée déjà en mission' });
    if (army.units.length === 0) {
      return res.status(400).json({ error: 'Armée vide - impossible d\'attaquer' });
    }

    // Get resource node
    const node = await prisma.resourceNode.findUnique({ where: { id: resourceNodeId } });
    if (!node) return res.status(404).json({ error: 'Ressource non trouvée' });

    // Check if tribe is respawning
    if (node.lastDefeat) {
      const respawnTime = new Date(node.lastDefeat.getTime() + node.respawnMinutes * 60000);
      if (new Date() < respawnTime && !node.hasDefenders) {
        return res.status(400).json({ error: 'Tribu en respawn - collectez directement' });
      }
    }

    // Calculate travel time
    let minSpeed = 100;
    for (const u of army.units) {
      const unit = unitsData.find(x => x.key === u.unitKey);
      if (unit && unit.stats.speed < minSpeed) minSpeed = unit.stats.speed;
    }

    const distance = Math.sqrt(Math.pow(node.x - army.x, 2) + Math.pow(node.y - army.y, 2));

    // If army is close enough (same tile or adjacent), resolve combat immediately
    if (distance <= 1.5) {
      // IMMEDIATE COMBAT
      const result = await resolveTribteCombat(army, node, req.user.playerId);

      // Si victoire, mettre l'armée en mode HARVESTING
      if (result.success) {
        await prisma.army.update({
          where: { id: army.id },
          data: {
            status: 'HARVESTING',
            x: node.x,
            y: node.y,
            targetX: node.x,
            targetY: node.y,
            targetResourceId: node.id,
            missionType: 'HARVEST',
            harvestStartedAt: new Date(),
            harvestResourceType: node.resourceType
          }
        });
        result.message = 'Tribu vaincue! Récolte démarrée (100/min)';
        result.status = 'HARVESTING';
      }

      return res.json(result);
    }

    // Otherwise, send army to the node
    const travelTime = calculateTravelTime(army.x, army.y, node.x, node.y, minSpeed);
    const arrivalAt = new Date(Date.now() + travelTime * 1000);

    await prisma.army.update({
      where: { id: army.id },
      data: {
        status: 'RAIDING',
        targetX: node.x,
        targetY: node.y,
        targetResourceId: node.id,
        arrivalAt,
        missionType: 'RAID_RESOURCE'
      }
    });

    res.json({ message: 'Armée en route', travelTime, arrivalAt, target: `${node.resourceType} (${node.x}, ${node.y})` });
  } catch (e) {
    console.error('Raid resource error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Helper function to resolve combat against tribe
async function resolveTribteCombat(army, node, playerId) {
  // Convert defender units to array format for combat
  // Les unités sont maintenant stockées avec les vraies clés de faction (ex: ROM_INF_MILICIEN)
  const defenderUnits = [];
  if (node.defenderUnits && node.hasDefenders) {
    // Legacy mapping pour compatibilité avec anciennes données
    const legacyMapping = {
      warrior: 'GRE_INF_HOPLITE',
      archer: 'GRE_ARC_TOXOTE',
      cavalry: 'GRE_CAV_GREC',
      elite: 'GRE_INF_SPARTIATE'
    };

    for (const [unitKey, count] of Object.entries(node.defenderUnits)) {
      if (count > 0) {
        // Vérifier si c'est une clé legacy ou une vraie clé de faction
        const isLegacyKey = ['warrior', 'archer', 'cavalry', 'elite'].includes(unitKey);
        defenderUnits.push({
          unitKey: isLegacyKey ? legacyMapping[unitKey] : unitKey,
          count: count
        });
      }
    }
  }

  // If no defenders, auto-win - start harvesting instead of instant collect
  if (defenderUnits.length === 0 || !node.hasDefenders) {
    return {
      success: true,
      combatResult: { winner: 'attacker', attackerLosses: 0, defenderLosses: 0 },
      loot: null, // Pas de butin instantané - l'armée va récolter progressivement
      message: 'Tribu absente - démarrage de la récolte'
    };
  }

  // Get attacker hero stats if present
  const attackerHero = army.hero ? {
    attack: army.hero.attack || 0,
    defense: army.hero.defense || 0
  } : null;

  // Resolve combat
  const combat = resolveCombat(
    army.units.map(u => ({ unitKey: u.unitKey, count: u.count })),
    defenderUnits,
    0, // No wall bonus for tribes
    attackerHero,
    null // Tribes have no hero
  );

  const attackerWon = combat.attackerWon;

  // Apply losses to attacker army
  let totalAttackerLosses = 0;
  for (const unit of army.units) {
    const losses = Math.floor(unit.count * combat.attackerLossRate);
    totalAttackerLosses += losses;
    const newCount = unit.count - losses;

    if (newCount <= 0) {
      await prisma.armyUnit.delete({ where: { id: unit.id } });
    } else {
      await prisma.armyUnit.update({
        where: { id: unit.id },
        data: { count: newCount }
      });
    }
  }

  // Calculate defender losses
  let totalDefenderLosses = 0;
  const newDefenderUnits = {};
  for (const [unitType, count] of Object.entries(node.defenderUnits)) {
    const losses = Math.floor(count * combat.defenderLossRate);
    totalDefenderLosses += losses;
    newDefenderUnits[unitType] = Math.max(0, count - losses);
  }

  // Check if all defenders are dead
  const defendersRemaining = Object.values(newDefenderUnits).reduce((sum, c) => sum + c, 0);

  if (attackerWon) {
    // Tribe defeated - pas de collecte instantanée, l'armée va récolter progressivement
    await prisma.resourceNode.update({
      where: { id: node.id },
      data: {
        hasDefenders: false,
        defenderUnits: newDefenderUnits,
        defenderPower: 0,
        lastDefeat: new Date()
      }
    });

    // Give XP to hero if present
    if (army.heroId) {
      const xpGain = Math.floor(node.defenderPower * 0.5);
      await prisma.hero.update({
        where: { id: army.heroId },
        data: { xp: { increment: xpGain } }
      });
    }
  } else {
    // Attacker lost - update tribe with remaining defenders
    await prisma.resourceNode.update({
      where: { id: node.id },
      data: {
        defenderUnits: newDefenderUnits,
        defenderPower: Math.floor(node.defenderPower * (1 - combat.defenderLossRate))
      }
    });
  }

  // Create combat report (use BattleReport model)
  await prisma.battleReport.create({
    data: {
      playerId: playerId,
      attackerId: playerId,
      x: node.x,
      y: node.y,
      result: attackerWon ? 'WIN' : 'LOSE',
      winner: attackerWon ? 'ATTACKER' : 'DEFENDER',
      attackerLosses: { totalAttackerLosses },
      defenderLosses: { totalDefenderLosses },
      loot: {},
      rounds: { type: 'TRIBE_RAID', resourceType: node.resourceType }
    }
  });

  return {
    success: attackerWon,
    combatResult: {
      winner: attackerWon ? 'attacker' : 'defender',
      attackerLosses: totalAttackerLosses,
      defenderLosses: totalDefenderLosses,
      attackerPower: combat.attackerPower,
      defenderPower: combat.defenderPower
    },
    loot: null, // Pas de butin instantané - l'armée récoltera progressivement
    message: attackerWon ? 'Tribu vaincue! Démarrage de la récolte.' : 'Votre armée a été repoussée'
  };
}

// Helper function to collect loot from resource node
async function collectResourceLoot(army, node, playerId) {
  // Calculate carry capacity
  let carryCapacity = 0;
  const armyWithUnits = await prisma.army.findUnique({
    where: { id: army.id },
    include: { units: true }
  });

  for (const unit of armyWithUnits.units) {
    const unitData = unitsData.find(u => u.key === unit.unitKey);
    const carryPerUnit = unitData?.stats?.carry || 50;
    carryCapacity += unit.count * carryPerUnit;
  }

  // Calculate loot (max carry capacity or remaining resources)
  const lootAmount = Math.min(carryCapacity, node.amount);

  if (lootAmount <= 0) return {};

  // Reduce node resources
  await prisma.resourceNode.update({
    where: { id: node.id },
    data: { amount: { decrement: lootAmount } }
  });

  // Add resources to player's home city
  const city = await prisma.city.findFirst({
    where: { playerId: playerId, isCapital: true }
  });

  if (city) {
    const resourceField = node.resourceType.toLowerCase();
    await prisma.city.update({
      where: { id: city.id },
      data: { [resourceField]: { increment: lootAmount } }
    });
  }

  return { [node.resourceType]: lootAmount };
}

// Collect resources from a node (no defenders)
app.post('/api/army/:id/collect-resource', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body;
    if (!resourceNodeId) return res.status(400).json({ error: 'ID de ressource requis' });

    const army = await prisma.army.findFirst({
      where: { id: req.params.id, ownerId: req.user.playerId },
      include: { units: true }
    });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    if (army.status !== 'IDLE') return res.status(400).json({ error: 'Armée déjà en mission' });

    const node = await prisma.resourceNode.findUnique({ where: { id: resourceNodeId } });
    if (!node) return res.status(404).json({ error: 'Ressource non trouvée' });

    // Check if there are still defenders
    if (node.hasDefenders && node.defenderPower > 0) {
      return res.status(400).json({ error: 'Tribu encore présente - attaquez d\'abord!' });
    }

    // Calculate distance
    const distance = Math.sqrt(Math.pow(node.x - army.x, 2) + Math.pow(node.y - army.y, 2));

    if (distance > 1.5) {
      // Send army to resource node, will start harvesting on arrival
      let minSpeed = 100;
      for (const u of army.units) {
        const unit = unitsData.find(x => x.key === u.unitKey);
        if (unit && unit.stats.speed < minSpeed) minSpeed = unit.stats.speed;
      }

      const travelTime = calculateTravelTime(army.x, army.y, node.x, node.y, minSpeed);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);

      await prisma.army.update({
        where: { id: army.id },
        data: {
          status: 'MOVING',
          targetX: node.x,
          targetY: node.y,
          targetResourceId: node.id,
          arrivalAt,
          missionType: 'MOVE_TO_HARVEST',
          harvestResourceType: node.resourceType
        }
      });

      return res.json({ message: 'Armée en route pour collecter', travelTime, arrivalAt });
    }

    // L'armée est sur place - démarrer la récolte progressive
    // Calculer la capacité de transport
    let carryCapacity = 0;
    for (const unit of army.units) {
      const unitData = unitsData.find(u => u.key === unit.unitKey);
      const carryPerUnit = unitData?.stats?.carry || 50;
      carryCapacity += unit.count * carryPerUnit;
    }

    await prisma.army.update({
      where: { id: army.id },
      data: {
        status: 'HARVESTING',
        x: node.x,
        y: node.y,
        targetX: node.x,
        targetY: node.y,
        targetResourceId: node.id,
        missionType: 'HARVEST',
        harvestStartedAt: new Date(),
        harvestResourceType: node.resourceType
      }
    });

    res.json({
      success: true,
      status: 'HARVESTING',
      resourceType: node.resourceType,
      nodeAmount: node.amount,
      carryCapacity,
      harvestRate: 100, // 100 par minute
      message: `Récolte démarrée! (100 ${node.resourceType}/min, capacité: ${carryCapacity})`
    });
  } catch (e) {
    console.error('Collect resource error:', e);
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
        missionType: 'RETURN',
        targetResourceId: null,
        harvestStartedAt: null,
        harvestResourceType: null
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
    where: { playerId: req.user.playerId, status: { in: ['AVAILABLE', 'IN_PROGRESS'] } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(expeditions);
});

app.post('/api/expedition/:id/start', auth, async (req, res) => {
  try {
    const expedition = await prisma.expedition.findFirst({
      where: { id: req.params.id, playerId: req.user.playerId, status: 'AVAILABLE' }
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

    const existing = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (existing) return res.status(400).json({ error: 'Vous etes deja dans une alliance' });

    const alliance = await prisma.alliance.create({
      data: { name, tag: tag.toUpperCase(), description, leaderId: req.user.playerId }
    });

    await prisma.allianceMember.create({
      data: { allianceId: alliance.id, playerId: req.user.playerId, role: 'LEADER' }
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

    const existing = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
    if (existing) return res.status(400).json({ error: 'Vous etes deja dans une alliance' });

    await prisma.allianceMember.create({
      data: { allianceId: alliance.id, playerId: req.user.playerId, role: 'MEMBER' }
    });

    res.json({ message: 'Alliance rejoint' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alliance/leave', auth, async (req, res) => {
  try {
    const member = await prisma.allianceMember.findUnique({ 
      where: { playerId: req.user.playerId },
      include: { alliance: true }
    });
    if (!member) return res.status(400).json({ error: 'Vous n\'etes pas dans une alliance' });

    if (member.role === 'LEADER') {
      const otherMembers = await prisma.allianceMember.count({ where: { allianceId: member.allianceId, NOT: { playerId: req.user.playerId } } });
      if (otherMembers > 0) return res.status(400).json({ error: 'Transferez le leadership avant de partir' });
      // Delete member first, then diplomacy, then alliance (FK order)
      await prisma.allianceMember.delete({ where: { id: member.id } });
      await prisma.allianceDiplomacy.deleteMany({ where: { OR: [{ allianceId: member.allianceId }, { targetAllianceId: member.allianceId }] } });
      await prisma.alliance.delete({ where: { id: member.allianceId } });
      return res.json({ message: 'Alliance dissoute' });
    }

    await prisma.allianceMember.delete({ where: { id: member.id } });
    res.json({ message: 'Alliance quittee' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alliance/promote/:playerId', auth, async (req, res) => {
  try {
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
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
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
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
      where: { playerId: req.user.playerId },
      include: { alliance: { include: { diplomacy: true, targetOf: true } } }
    });

    if (!myMember) return res.json({ diplomacy: [] });

    // Combine both directions
    const allDiplomacy = [
      ...myMember.alliance.diplomacy.map(d => ({
        allianceId: d.targetAllianceId,
        status: d.status,
        direction: 'from'
      })),
      ...myMember.alliance.targetOf.map(d => ({
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
    
    const myMember = await prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } });
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
      prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } }),
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

// World size constants (matching frontend)
const BASE_WORLD_SIZE = 374;
const EXPANSION_PER_PLAYER = 10;
const MAX_PLAYERS = 5000;

// Calculate current world size based on player count
async function getWorldSize() {
  const playerCount = await prisma.player.count();
  const expansion = Math.min(playerCount, MAX_PLAYERS) * EXPANSION_PER_PLAYER;
  const worldSize = BASE_WORLD_SIZE + Math.floor(Math.sqrt(expansion * 100));
  return { worldSize, playerCount, center: Math.floor(worldSize / 2) };
}

// Get world info (size, player count, etc.)
app.get('/api/world/info', async (req, res) => {
  try {
    const { worldSize, playerCount, center } = await getWorldSize();
    const resourceCount = await prisma.resourceNode.count();
    res.json({
      worldSize,
      playerCount,
      maxPlayers: MAX_PLAYERS,
      center,
      totalTiles: worldSize * worldSize,
      resourceNodes: resourceCount
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/map/viewport', auth, async (req, res) => {
  const { center } = await getWorldSize();
  const x = parseInt(req.query.x) || center;
  const y = parseInt(req.query.y) || center;
  const r = parseInt(req.query.radius) || 10;

  const cities = await prisma.city.findMany({
    where: { x: { gte: x - r, lte: x + r }, y: { gte: y - r, lte: y + r } },
    select: {
      id: true, name: true, x: true, y: true, isCapital: true, playerId: true,
      buildings: { where: { key: 'WALL' }, select: { level: true } },
      player: { select: { id: true, name: true, faction: true, population: true, alliance: { select: { alliance: { select: { id: true, tag: true } } } } } }
    }
  });

  // Add city tier information
  const citiesWithTier = cities.map(city => {
    const wallLevel = city.buildings[0]?.level || 0;
    const cityTier = getCityTier(wallLevel);
    const allianceInfo = city.player?.alliance?.alliance;
    return {
      id: city.id,
      name: city.name,
      x: city.x,
      y: city.y,
      isCapital: city.isCapital,
      playerId: city.playerId,
      player: {
        id: city.player?.id,
        name: city.player?.name,
        faction: city.player?.faction,
        population: city.player?.population || 0,
        allianceId: allianceInfo?.id || null,
        allianceTag: allianceInfo?.tag || null
      },
      wallLevel,
      cityTier,
      cityTierName: getCityTierName(cityTier)
    };
  });

  const nodes = await prisma.resourceNode.findMany({
    where: { x: { gte: x - r, lte: x + r }, y: { gte: y - r, lte: y + r } }
  });

  res.json({ cities: citiesWithTier, resourceNodes: nodes, center: { x, y }, radius: r });
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
      where: { playerId: req.user.playerId },
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
      where: { playerId: req.user.playerId },
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
        prisma.allianceMember.findUnique({ where: { playerId: req.user.playerId } }),
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
    // Get player faction for transport bonus
    const player = await prisma.player.findUnique({ where: { id: req.user.playerId } });
    const transportBonus = getFactionBonus(player?.faction, 'transportCapacity');
    const transportMultiplier = 1 + (transportBonus / 100); // Egypt: +10%

    const baseCarryCapacity = army.units.reduce((sum, u) => {
      const unitDef = unitsData.find(ud => ud.key === u.unitKey);
      return sum + (unitDef?.stats?.transport || 50) * u.count;
    }, 0);
    const carryCapacity = Math.floor(baseCarryCapacity * transportMultiplier);
    
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
      include: { player: { select: { id: true, name: true } } },
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
    
    const validResources = ['wood', 'stone', 'iron', 'food'];
    if (!sellResource || !sellAmount || !buyResource || !buyAmount) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }
    if (!validResources.includes(sellResource) || !validResources.includes(buyResource)) {
      return res.status(400).json({ error: 'Ressource invalide' });
    }
    if (!Number.isInteger(sellAmount) || sellAmount < 1 || !Number.isInteger(buyAmount) || buyAmount < 1) {
      return res.status(400).json({ error: 'Montants invalides' });
    }
    
    const city = await prisma.city.findFirst({
      where: { id: cityId, playerId: req.user.playerId }
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
      include: { player: true }
    });
    if (!offer) return res.status(404).json({ error: 'Offre non trouvée' });
    if (offer.status !== 'ACTIVE') return res.status(400).json({ error: 'Offre inactive' });
    if (offer.sellerId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas accepter votre propre offre' });
    
    const buyerCity = await prisma.city.findFirst({
      where: { id: cityId, playerId: req.user.playerId }
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
        [offer.sellResource]: Math.min(buyerCity[offer.sellResource] + offer.sellAmount, offer.sellResource === 'food' ? buyerCity.maxFoodStorage : buyerCity.maxStorage)
      }
    });

    // Seller receives
    const sellerCity = await prisma.city.findUnique({ where: { id: offer.cityId } });
    if (sellerCity) {
      await prisma.city.update({
        where: { id: sellerCity.id },
        data: {
          [offer.buyResource]: Math.min(sellerCity[offer.buyResource] + offer.buyAmount, offer.buyResource === 'food' ? sellerCity.maxFoodStorage : sellerCity.maxStorage)
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

// ========== NPC TRADE (Resource Exchange) ==========
app.post('/api/market/npc-trade', auth, async (req, res) => {
  try {
    const { cityId, giveResource, receiveResource, giveAmount } = req.body;

    const validResources = ['wood', 'stone', 'iron', 'food'];
    if (!validResources.includes(giveResource) || !validResources.includes(receiveResource)) {
      return res.status(400).json({ error: 'Ressource invalide' });
    }
    if (giveResource === receiveResource) {
      return res.status(400).json({ error: 'Choisissez des ressources differentes' });
    }
    if (!giveAmount || giveAmount < 3) {
      return res.status(400).json({ error: 'Minimum 3 ressources' });
    }

    const city = await prisma.city.findFirst({
      where: { id: cityId, playerId: req.user.playerId }
    });
    if (!city) return res.status(404).json({ error: 'Ville non trouvee' });

    // Check player has enough resources
    if (city[giveResource] < giveAmount) {
      return res.status(400).json({ error: `Pas assez de ${giveResource}` });
    }

    // Check market building
    const market = await prisma.cityBuilding.findFirst({
      where: { cityId: city.id, key: 'MARKET' }
    });
    if (!market || market.level < 1) {
      return res.status(400).json({ error: 'Construisez un marche (niveau 1 minimum)' });
    }

    // NPC rate: 3:2 (give 3, receive 2)
    const receiveAmount = Math.floor(giveAmount * 2 / 3);
    if (receiveAmount <= 0) {
      return res.status(400).json({ error: 'Quantite trop faible' });
    }

    // Check storage limit
    const maxStorage = receiveResource === 'food' ? city.maxFoodStorage : city.maxStorage;
    const currentReceived = city[receiveResource];
    const actualReceived = Math.min(receiveAmount, maxStorage - currentReceived);

    if (actualReceived <= 0) {
      return res.status(400).json({ error: 'Stockage plein pour cette ressource' });
    }

    // Execute trade
    await prisma.city.update({
      where: { id: city.id },
      data: {
        [giveResource]: city[giveResource] - giveAmount,
        [receiveResource]: currentReceived + actualReceived
      }
    });

    res.json({ given: giveAmount, received: actualReceived, giveResource, receiveResource });
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
    // ========== HEAL WOUNDED UNITS ==========
    const healedCount = await processHealedUnits();
    if (healedCount > 0) {
      console.log(`[TICK] ${healedCount} wounded unit groups healed`);
    }

    // Production - Optimized with batch updates
    const cities = await prisma.city.findMany({ where: { isSieged: false }, include: { buildings: true } });

    // Prepare all updates (using exponential interpolation matching frontend)
    const cityUpdates = cities.map(city => {
      let wood = 5, stone = 5, iron = 5, food = 10; // Base production
      for (const b of city.buildings) {
        if (b.key === 'LUMBER') wood += getProductionAtLevel('LUMBER', b.level);
        else if (b.key === 'QUARRY') stone += getProductionAtLevel('QUARRY', b.level);
        else if (b.key === 'IRON_MINE') iron += getProductionAtLevel('IRON_MINE', b.level);
        else if (b.key === 'FARM') food += getProductionAtLevel('FARM', b.level);
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
        // Upkeep par tier: base=2.5, inter=5, elite=7.5, siege=30
        const upkeep = unitDef?.tier === 'base' ? 2.5 :
                       unitDef?.tier === 'intermediate' ? 5 :
                       unitDef?.tier === 'elite' ? 7.5 : 30;
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
        try {
          // Reload fresh buildings from DB (not snapshot) to handle multiple completions
          const freshBuildings = await prisma.cityBuilding.findMany({ where: { cityId: b.cityId } });

          // For field buildings (multiple of same type), find by key AND slot
          const isFieldBuilding = ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'].includes(b.buildingKey);
          const existing = isFieldBuilding
            ? freshBuildings.find(x => x.key === b.buildingKey && x.slot === b.slot)
            : freshBuildings.find(x => x.key === b.buildingKey);
          if (existing) {
            await prisma.cityBuilding.update({ where: { id: existing.id }, data: { level: b.targetLevel } });
          } else {
            // Find next available slot for this city
            const usedSlots = new Set(freshBuildings.map(x => x.slot));
            let newSlot = b.slot || 1;
            while (usedSlots.has(newSlot)) newSlot++;

            await prisma.cityBuilding.create({
              data: { cityId: b.cityId, key: b.buildingKey, slot: newSlot, level: b.targetLevel }
            });
          }
          await prisma.buildQueueItem.delete({ where: { id: b.id } });
          console.log(`[BUILD] ${b.buildingKey} niveau ${b.targetLevel} terminé`);
        } catch (buildErr) {
          console.error(`[BUILD ERROR] ${b.buildingKey}:`, buildErr.message);
          // Delete the stuck queue item to prevent infinite retry
          try { await prisma.buildQueueItem.delete({ where: { id: b.id } }); } catch (e) {}
        }
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
      const garrison = r.city.armies.find(a => a.isGarrison);
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
        status: { in: ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING', 'COLLECTING'] },
        arrivalAt: { lte: now }
      },
      include: { units: true, owner: true, city: true, hero: true }
    });

    for (const army of movingArmies) {
      try {
        // Move army to destination
        await prisma.army.update({
          where: { id: army.id },
          data: { x: army.targetX, y: army.targetY }
        });

        // Handle different mission types
        if (army.missionType === 'MOVE_TO_HARVEST') {
          // Arrived at resource node - start harvesting
          await prisma.army.update({
            where: { id: army.id },
            data: {
              status: 'HARVESTING',
              missionType: 'COLLECT_RESOURCE',
              harvestStartedAt: new Date(),
              harvestResourceType: army.mission || null
            }
          });
          if (army.targetResourceId) {
            await prisma.resourceNode.update({
              where: { id: army.targetResourceId },
              data: { hasPlayerArmy: true }
            }).catch(() => {});
          }
        } else if (army.missionType === 'RAID_RESOURCE') {
          // Arrived at resource node for raid
          const node = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
          if (node) {
            const result = await resolveTribteCombat(army, node, army.ownerId);
            if (result.success) {
              const lootResult = await collectResourceLoot(army, node, army.ownerId);
              await prisma.army.update({
                where: { id: army.id },
                data: { status: 'RETURNING', missionType: 'RETURNING', targetX: army.x, targetY: army.y, arrivalAt: new Date(Date.now() + 60000) }
              });
            } else {
              await prisma.army.update({
                where: { id: army.id },
                data: { status: 'RETURNING', missionType: 'RETURNING', arrivalAt: new Date(Date.now() + 60000) }
              });
            }
          } else {
            await prisma.army.update({
              where: { id: army.id },
              data: { status: 'IDLE', missionType: null, mission: null, targetX: null, targetY: null, targetResourceId: null, arrivalAt: null }
            });
          }
        } else if (army.missionType === 'MOVE' || army.status === 'MOVING') {
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
            include: { armies: { include: { units: true, hero: true } }, buildings: true, player: true }
          });

          if (targetCity) {
            // Get defender units (all armies in the city)
            const defenderUnits = targetCity.armies.flatMap(a => a.units);
            const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
            const moatLevel = targetCity.buildings.find(b => b.key === 'MOAT')?.level || 0;

            // Get hero data for attacker and defender (garrison hero)
            const attackerHero = army.hero;
            const garrisonArmy = targetCity.armies.find(a => a.isGarrison);
            const defenderHero = garrisonArmy?.hero;

            // Resolve combat with detailed rounds (with hero bonuses)
            const result = resolveCombatDetailed(army.units, defenderUnits, wallLevel, moatLevel, army.owner.name, targetCity.player.name, attackerHero, defenderHero);
            
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

            // === WOUNDED SYSTEM ===
            // Defender's killed units may become wounded (if they have Healing Tent)
            const defenderWounded = await calculateWoundedUnits(
              targetCity.id,
              result.defenderFinalUnits,
              targetCity.player.faction
            );
            if (defenderWounded.length > 0) {
              await addWoundedUnits(targetCity.id, defenderWounded);
              console.log(`[WOUNDED] ${defenderWounded.reduce((s,u) => s + u.count, 0)} defender units wounded in ${targetCity.name}`);
            }

            // Attacker's wounded units go to their home city (if they have one)
            if (army.cityId) {
              const attackerWounded = await calculateWoundedUnits(
                army.cityId,
                result.attackerFinalUnits,
                army.owner.faction
              );
              if (attackerWounded.length > 0) {
                await addWoundedUnits(army.cityId, attackerWounded);
                console.log(`[WOUNDED] ${attackerWounded.reduce((s,u) => s + u.count, 0)} attacker units wounded, sent to home city`);
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
                playerId: army.ownerId,
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
                  attackerName: army.owner.name,
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
                  attackerName: army.owner.name,
                  defenderName: targetCity.player.name,
                  cityName: targetCity.name,
                  duration: result.rounds.length
                }
              }
            });

            // Update stats
            if (result.attackerWon) {
              await prisma.playerStats.update({
                where: { playerId: army.ownerId },
                data: { attacksWon: { increment: 1 }, unitsKilled: { increment: result.defenderTotalKilled } }
              });
            } else {
              await prisma.playerStats.update({
                where: { playerId: targetCity.playerId },
                data: { defensesWon: { increment: 1 }, unitsKilled: { increment: result.attackerTotalKilled } }
              });
            }

            console.log(`[ATTACK] ${army.owner.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Attacker won' : 'Defender won'} (${result.rounds.length} rounds)`);
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
            include: { armies: { include: { units: true, hero: true } }, buildings: true, player: true }
          });

          if (targetCity) {
            const defenderUnits = targetCity.armies.flatMap(a => a.units);
            const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;

            // Get hero data for attacker and defender (garrison hero)
            const attackerHero = army.hero;
            const garrisonArmy = targetCity.armies.find(a => a.isGarrison);
            const defenderHero = garrisonArmy?.hero;

            // Resolve combat (lighter for raids, with hero bonuses)
            const result = resolveCombat(army.units, defenderUnits, wallLevel, attackerHero, defenderHero);
            
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

              // ========== HIDEOUT SYSTEM ==========
              // Hideout protects resources from being stolen
              const hideout = targetCity.buildings.find(b => b.key === 'HIDEOUT');
              const hideoutLevel = hideout?.level || 0;
              // Base protection: 5% per hideout level (max 20 levels = 100%)
              let hideoutProtection = hideoutLevel * 0.05;
              // Gaul faction bonus: +10% hideout capacity
              const gaulBonus = getFactionBonus(targetCity.player.faction, 'hideoutCapacity');
              hideoutProtection *= (1 + gaulBonus / 100);
              hideoutProtection = Math.min(hideoutProtection, 1.0); // Cap at 100%

              // Calculate stealable resources (after hideout protection)
              const stealableWood = Math.max(0, targetCity.wood * (1 - hideoutProtection));
              const stealableStone = Math.max(0, targetCity.stone * (1 - hideoutProtection));
              const stealableIron = Math.max(0, targetCity.iron * (1 - hideoutProtection));
              const stealableFood = Math.max(0, targetCity.food * (1 - hideoutProtection));

              // Steal up to 50% of stealable resources or carry capacity
              const stealRate = 0.5;
              const availableWood = Math.min(stealableWood * stealRate, totalCarry * 0.25);
              const availableStone = Math.min(stealableStone * stealRate, totalCarry * 0.25);
              const availableIron = Math.min(stealableIron * stealRate, totalCarry * 0.25);
              const availableFood = Math.min(stealableFood * stealRate, totalCarry * 0.25);

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

              console.log(`[RAID] ${army.owner.name} raided ${targetCity.player.name}: ${carryWood}W ${carryStone}S ${carryIron}I ${carryFood}F (hideout protected ${Math.floor(hideoutProtection*100)}%)`);
            }

            // Create battle report
            await prisma.battleReport.create({
              data: {
                playerId: army.ownerId,
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
                  playerId: army.ownerId,
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
              console.log(`[SPY] ${army.owner.name} successfully spied on ${targetCity.player.name}`);
            } else {
              // Failed - create empty report
              await prisma.spyReport.create({
                data: {
                  playerId: army.ownerId,
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
              console.log(`[SPY] ${army.owner.name} failed to spy on ${targetCity.player.name}`);
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
            
            console.log(`[TRANSPORT] ${army.owner.name} delivered ${army.carryWood}W ${army.carryStone}S ${army.carryIron}I ${army.carryFood}F to ${targetCity.name}`);
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

        // ========== COLLECT RESOURCE (LEGACY - redirect to HARVEST) ==========
        else if (army.missionType === 'COLLECT_RESOURCE') {
          const node = await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } });

          if (node && !node.hasDefenders) {
            // Démarrer la récolte progressive au lieu de collecter instantanément
            await prisma.army.update({
              where: { id: army.id },
              data: {
                status: 'HARVESTING',
                x: node.x,
                y: node.y,
                missionType: 'HARVEST',
                harvestStartedAt: new Date(),
                harvestResourceType: node.resourceType,
                arrivalAt: null
              }
            });
            // Marquer qu'une armée est présente sur le point
            await prisma.resourceNode.update({
              where: { id: node.id },
              data: { hasPlayerArmy: true }
            });
            console.log(`[HARVEST] ${army.name} started harvesting ${node.resourceType} at (${node.x}, ${node.y})`);
          } else {
            // Tribe respawned or node not found, go back idle
            await prisma.army.update({
              where: { id: army.id },
              data: { status: 'IDLE', targetX: null, targetY: null, arrivalAt: null, missionType: null, targetResourceId: null }
            });
          }
        }
      } catch (armyError) {
        console.error(`[ARMY ERROR] ${army.id}:`, armyError.message);
      }
    }

    // ========== HARVESTING SYSTEM (Récolte progressive) ==========
    // Traiter les armées qui récoltent actuellement - 50 ressources par tick (100/min)
    const harvestingArmies = await prisma.army.findMany({
      where: { status: 'HARVESTING', missionType: 'HARVEST' },
      include: { units: true, city: true }
    });

    for (const army of harvestingArmies) {
      try {
        if (!army.targetResourceId) continue;

        const node = await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } });
        if (!node) {
          // Node disparue, arrêter la récolte
          await prisma.army.update({
            where: { id: army.id },
            data: {
              status: 'IDLE',
              missionType: null,
              targetResourceId: null,
              harvestStartedAt: null,
              harvestResourceType: null
            }
          });
          continue;
        }

        // Vérifier si la tribu a respawn pendant la récolte
        if (node.hasDefenders && node.defenderPower > 0) {
          console.log(`[HARVEST] ${army.name} interrupted - tribe respawned at (${node.x}, ${node.y})`);
          // Marquer le départ de l'armée du point
          await prisma.resourceNode.update({
            where: { id: node.id },
            data: { hasPlayerArmy: false, lastArmyDeparture: new Date() }
          });
          // Tribu respawnée - retourner à la maison avec ce qu'on a récolté
          if (army.cityId && army.city) {
            const travelTime = calculateTravelTime(node.x, node.y, army.city.x, army.city.y, 50);
            await prisma.army.update({
              where: { id: army.id },
              data: {
                status: 'RETURNING',
                targetX: army.city.x,
                targetY: army.city.y,
                missionType: 'RETURN',
                arrivalAt: new Date(Date.now() + travelTime * 1000),
                harvestStartedAt: null,
                harvestResourceType: null
              }
            });
          } else {
            await prisma.army.update({
              where: { id: army.id },
              data: { status: 'IDLE', missionType: null, harvestStartedAt: null, harvestResourceType: null }
            });
          }
          continue;
        }

        // Calculer la capacité de transport totale
        let carryCapacity = 0;
        for (const unit of army.units) {
          const unitData = unitsData.find(u => u.key === unit.unitKey);
          const carryPerUnit = unitData?.stats?.carry || 50;
          carryCapacity += unit.count * carryPerUnit;
        }

        // Calculer ce que l'armée porte déjà
        const currentCarry = army.carryWood + army.carryStone + army.carryIron + army.carryFood;
        const remainingCapacity = carryCapacity - currentCarry;

        // Récolte par tick: 50 ressources (100/minute avec tick de 30s)
        const harvestPerTick = 50;
        const toHarvest = Math.min(harvestPerTick, remainingCapacity, node.amount);

        if (toHarvest <= 0 || node.amount <= 0 || remainingCapacity <= 0) {
          // Capacité pleine ou node vide - retourner à la maison
          console.log(`[HARVEST] ${army.name} finished harvesting at (${node.x}, ${node.y}) - capacity: ${currentCarry}/${carryCapacity}, node: ${node.amount}`);

          // Marquer le départ de l'armée du point
          await prisma.resourceNode.update({
            where: { id: node.id },
            data: { hasPlayerArmy: false, lastArmyDeparture: new Date() }
          });

          if (army.cityId && army.city) {
            const travelTime = calculateTravelTime(node.x, node.y, army.city.x, army.city.y, 50);
            await prisma.army.update({
              where: { id: army.id },
              data: {
                status: 'RETURNING',
                targetX: army.city.x,
                targetY: army.city.y,
                missionType: 'RETURN',
                arrivalAt: new Date(Date.now() + travelTime * 1000),
                targetResourceId: null,
                harvestStartedAt: null,
                harvestResourceType: null
              }
            });
          } else {
            await prisma.army.update({
              where: { id: army.id },
              data: { status: 'IDLE', missionType: null, harvestStartedAt: null, harvestResourceType: null }
            });
          }
          continue;
        }

        // Récolter les ressources
        const resourceType = node.resourceType.toLowerCase();
        const carryField = `carry${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}`;

        // Mettre à jour le node (diminuer les ressources)
        await prisma.resourceNode.update({
          where: { id: node.id },
          data: { amount: { decrement: toHarvest } }
        });

        // Mettre à jour l'armée (augmenter le carry)
        const updateData = {};
        if (resourceType === 'wood') updateData.carryWood = army.carryWood + toHarvest;
        else if (resourceType === 'stone') updateData.carryStone = army.carryStone + toHarvest;
        else if (resourceType === 'iron') updateData.carryIron = army.carryIron + toHarvest;
        else if (resourceType === 'food') updateData.carryFood = army.carryFood + toHarvest;

        await prisma.army.update({
          where: { id: army.id },
          data: updateData
        });

        console.log(`[HARVEST] ${army.name} harvested ${toHarvest} ${node.resourceType} at (${node.x}, ${node.y}) - total: ${currentCarry + toHarvest}/${carryCapacity}`);
      } catch (harvestError) {
        console.error(`[HARVEST ERROR] ${army.id}:`, harvestError.message);
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

    // ========== TRIBE RESPAWN SYSTEM ==========
    // Règles:
    // - Regen des ressources commence 5 min après départ de l'armée
    // - Respawn de la tribu 5 min après le début de la regen (donc 10 min après départ)
    // - Puissance de la tribu proportionnelle au % de ressources
    const TRIBE_RESPAWN_DELAY_MINUTES = 10; // 5 min délai regen + 5 min après début regen

    const defeatedNodes = await prisma.resourceNode.findMany({
      where: {
        hasDefenders: false,
        lastDefeat: { not: null }
      }
    });

    for (const node of defeatedNodes) {
      // Skip si une armée est encore présente
      if (node.hasPlayerArmy) {
        continue;
      }

      // Calculer le temps de respawn basé sur lastArmyDeparture (10 min après départ)
      // Si pas de lastArmyDeparture, utiliser lastDefeat + respawnMinutes (ancien système)
      let respawnTime;
      if (node.lastArmyDeparture) {
        respawnTime = new Date(new Date(node.lastArmyDeparture).getTime() + TRIBE_RESPAWN_DELAY_MINUTES * 60000);
      } else {
        respawnTime = new Date(node.lastDefeat.getTime() + node.respawnMinutes * 60000);
      }

      if (now >= respawnTime) {
        // Calculer le % de ressources dans le node
        const resourcePercent = node.maxAmount > 0 ? node.amount / node.maxAmount : 0;

        // Regenerate tribe defenders based on level using faction units
        const level = node.level || 1;
        const isGold = node.resourceType === 'GOLD';

        // Générer les défenseurs avec la nouvelle fonction (faction aléatoire)
        const tribe = generateTribeDefenders(level, isGold, resourcePercent);

        await prisma.resourceNode.update({
          where: { id: node.id },
          data: {
            hasDefenders: true,
            defenderPower: tribe.power,
            defenderUnits: tribe.units,
            lastDefeat: null,
            lastArmyDeparture: null
          }
        });

        const totalUnits = Object.values(tribe.units).reduce((sum, c) => sum + c, 0);
        console.log(`[TRIBE RESPAWN] Tribe (${tribe.faction}) respawned at (${node.x}, ${node.y}) - Level ${level}, ${totalUnits} soldiers, Power ${Math.floor(tribe.power)} (${Math.floor(resourcePercent * 100)}% resources)`);
      }
    }

    // ========== RESOURCE NODE REGENERATION ==========
    // Regenerate resources in nodes
    // Règles:
    // - Pas de regen si une armée joueur est présente (hasPlayerArmy = true)
    // - Regen commence 5 min après le départ de l'armée
    // - Temps de regen doublé (regenRate / 2)
    const REGEN_DELAY_MINUTES = 5;
    const nodesToRegen = await prisma.$queryRaw`
      SELECT * FROM "ResourceNode" WHERE amount < "maxAmount"
    `;

    // Batch update for regeneration
    const regenUpdates = [];
    for (const node of nodesToRegen) {
      // Skip si une armée est présente
      if (node.hasPlayerArmy) {
        continue;
      }

      // Skip si moins de 5 minutes depuis le départ de l'armée
      if (node.lastArmyDeparture) {
        const timeSinceDeparture = (now.getTime() - new Date(node.lastArmyDeparture).getTime()) / 60000;
        if (timeSinceDeparture < REGEN_DELAY_MINUTES) {
          continue;
        }
      }

      if (node.amount < node.maxAmount) {
        // Temps de regen doublé = regenRate divisé par 2
        const effectiveRegenRate = node.regenRate / 2;
        const regenAmount = Math.min(effectiveRegenRate * TICK_HOURS, node.maxAmount - node.amount);
        if (regenAmount > 0) {
          regenUpdates.push(
            prisma.resourceNode.update({
              where: { id: node.id },
              data: { amount: { increment: Math.floor(regenAmount) } }
            })
          );
        }
      }
    }

    if (regenUpdates.length > 0) {
      await Promise.all(regenUpdates);
    }
  } catch (e) {
    console.error('Tick error:', e);
  }
}, 30000);

// Route par défaut
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ========== AUTO-SEED RESOURCE NODES ==========
async function seedResourceNodes() {
  const FACTIONS = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
  const FACTION_UNITS = {
    ROME: { base: ['ROM_INF_MILICIEN', 'ROM_ARC_MILICIEN', 'ROM_CAV_AUXILIAIRE'], inter: ['ROM_INF_TRIARII', 'ROM_ARC_VETERAN'] },
    GAUL: { base: ['GAU_INF_GUERRIER', 'GAU_ARC_CHASSEUR', 'GAU_CAV_CHASSEUR'], inter: ['GAU_INF_TRIARII', 'GAU_ARC_GAULOIS'] },
    GREEK: { base: ['GRE_INF_JEUNE', 'GRE_ARC_PAYSAN', 'GRE_CAV_ECLAIREUR'], inter: ['GRE_INF_HOPLITE', 'GRE_ARC_TOXOTE'] },
    EGYPT: { base: ['EGY_INF_ESCLAVE', 'EGY_ARC_NIL', 'EGY_CAV_DESERT'], inter: ['EGY_INF_NIL', 'EGY_ARC_DESERT'] },
    HUN: { base: ['HUN_INF_NOMADE', 'HUN_ARC_NOMADE', 'HUN_CAV_PILLARD'], inter: ['HUN_INF_GARDE', 'HUN_ARC_CAMP'] },
    SULTAN: { base: ['SUL_INF_DESERT', 'SUL_ARC_DESERT', 'SUL_CAV_BEDOUIN'], inter: ['SUL_INF_CROISSANT', 'SUL_ARC_TIREUR'] }
  };

  // Always use BASE_WORLD_SIZE for resource distribution (matching frontend 374x374)
  const worldSize = BASE_WORLD_SIZE;
  const half = Math.floor(worldSize / 2);
  const RES_TOTAL = Math.min(30000, Math.floor(worldSize * worldSize * 0.2));
  const GOLD_TOTAL = Math.floor(RES_TOTAL * 0.13);
  const BATCH = 1000;

  const used = new Set();
  // Mark existing city positions
  const existingCities = await prisma.city.findMany({ select: { x: true, y: true } });
  existingCities.forEach(c => used.add(`${c.x},${c.y}`));

  const data = [];
  const resTypes = ['WOOD', 'STONE', 'IRON', 'FOOD'];
  const biomes = (x, y) => {
    const angle = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI);
    return angle < 0.33 ? 'forest' : angle < 0.66 ? 'desert' : 'snow';
  };

  const pickLevel = (x, y) => {
    const d = Math.sqrt(x * x + y * y);
    const r = Math.random();
    if (d < half * 0.35) return r < 0.6 ? 3 : r < 0.85 ? 2 : 1;
    return r < 0.55 ? 1 : r < 0.9 ? 2 : 3;
  };

  const genDefenders = (level) => {
    const faction = FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
    const fu = FACTION_UNITS[faction];
    const units = {};
    const counts = level === 1 ? 100 : level === 2 ? 600 : 1500;
    fu.base.forEach(u => { units[u] = Math.floor(counts * (level === 1 ? 0.33 : 0.2) * (0.8 + Math.random() * 0.4)); });
    if (level >= 2) fu.inter.forEach(u => { units[u] = Math.floor(counts * 0.15 * (0.8 + Math.random() * 0.4)); });
    return { power: 100 * level * (counts / 100), units };
  };

  // Standard resources
  let attempts = 0;
  while (data.length < RES_TOTAL && attempts < RES_TOTAL * 3) {
    attempts++;
    const x = Math.floor(Math.random() * worldSize) - half;
    const y = Math.floor(Math.random() * worldSize) - half;
    const key = `${x},${y}`;
    if (used.has(key)) continue;
    used.add(key);

    const level = pickLevel(x, y);
    const type = resTypes[Math.floor(Math.random() * 4)];
    const baseAmt = [1500, 3500, 6000][level - 1];
    const amount = Math.floor(baseAmt * (0.8 + Math.random() * 0.4));
    const tribe = genDefenders(level);

    data.push({
      x, y, resourceType: type, level, biome: biomes(x, y),
      amount, maxAmount: Math.floor(amount * 1.5), regenRate: Math.floor(amount / 100),
      hasDefenders: true, defenderPower: tribe.power, defenderUnits: tribe.units,
      respawnMinutes: 30 + level * 30
    });
  }

  // Gold resources
  let goldCount = 0;
  attempts = 0;
  while (goldCount < GOLD_TOTAL && attempts < GOLD_TOTAL * 3) {
    attempts++;
    const x = Math.floor(Math.random() * worldSize) - half;
    const y = Math.floor(Math.random() * worldSize) - half;
    const key = `${x},${y}`;
    if (used.has(key)) continue;
    used.add(key);

    const level = pickLevel(x, y);
    const amount = Math.floor([500, 1500, 3000][level - 1] * (0.8 + Math.random() * 0.4));
    const tribe = genDefenders(level);

    data.push({
      x, y, resourceType: 'GOLD', level, biome: biomes(x, y),
      amount, maxAmount: Math.floor(amount * 1.5), regenRate: Math.floor(amount / 200),
      hasDefenders: true, defenderPower: tribe.power, defenderUnits: tribe.units,
      respawnMinutes: 60 + level * 60
    });
    goldCount++;
  }

  // Insert in batches
  for (let i = 0; i < data.length; i += BATCH) {
    await prisma.resourceNode.createMany({ data: data.slice(i, i + BATCH), skipDuplicates: true });
  }
  console.log(`✅ ${data.length} points de ressource générés (dont ${goldCount} or)`);
}

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

      // Fix: drop old unique constraint if it still exists (allow multiple field buildings)
      try {
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "CityBuilding_cityId_key_key"`);
        console.log('✅ Index unique CityBuilding supprimé (champs multiples autorisés)');
      } catch (idxErr) {
        // Index already gone, no problem
      }

      // Auto-seed resource nodes if none exist or FORCE_RESEED
      try {
        const nodeCount = await prisma.resourceNode.count();
        const RESEED_VERSION = 2; // Increment to force reseed
        const forceReseed = process.env.FORCE_RESEED === 'true' || nodeCount === 0;
        // Check if we need to reseed based on version
        const lastSeedVersion = await prisma.$queryRawUnsafe(
          `SELECT obj_description('public."ResourceNode"'::regclass) as ver`
        ).then(r => parseInt(r?.[0]?.ver) || 0).catch(() => 0);
        const needsReseed = forceReseed || lastSeedVersion < RESEED_VERSION;
        if (needsReseed) {
          if (nodeCount > 0) {
            console.log(`🗑️ Suppression de ${nodeCount} anciens nœuds de ressource (v${lastSeedVersion} → v${RESEED_VERSION})...`);
            await prisma.resourceNode.deleteMany({});
          }
          console.log('🌱 Génération des points de ressource v' + RESEED_VERSION + '...');
          await seedResourceNodes();
          // Store seed version as table comment
          await prisma.$executeRawUnsafe(
            `COMMENT ON TABLE "ResourceNode" IS '${RESEED_VERSION}'`
          );
          console.log(`✅ Version de seed stockée: v${RESEED_VERSION}`);
        } else {
          console.log(`🌍 ${nodeCount} points de ressource existants (v${lastSeedVersion})`);
        }
      } catch (seedErr) {
        console.warn('⚠️ Erreur seed:', seedErr.message);
      }

      break;
    } catch (e) {
      console.log(`   Erreur: ${e.message.substring(0, 100)}`);
      if (i === MAX_RETRIES - 1) {
        console.error('');
        console.error('❌ Impossible de se connecter à la base de données après', MAX_RETRIES, 'tentatives');
        console.error('   Vérifiez DATABASE_URL dans les variables d\'environnement');
        console.error('');
        // On ne quitte pas, on laisse Render décider
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
