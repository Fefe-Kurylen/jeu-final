const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { levelsFrom } = require('../utils/techEffects');
const { getRelation } = require('../services/diplomacyService');

// Règles d'économie que le client applique comme le serveur (décision du 30 octobre 2026) : coût et durée d'un niveau
// (utils/calculations.js buildCostFor / buildSecondsFor), entretien par palier, blessés et soins, emplacements de la ville
// (anneau 1-maxSlot, Mur sur l'enceinte : wallSlot) ; lues dans la configuration, jamais recopiées dans le client
const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));
const ECONOMY = {
  build: pick(config.build, ['costMultiplierBase', 'timeMultiplierBase', 'fieldCostMultiplier', 'fieldCostKeys', 'slowTimeMultiplier', 'slowTimeKeys']),
  city: pick(config.city, ['maxSlot', 'wallSlot']),
  upkeepPerTier: config.army.upkeepPerTier,
  wounded: pick(config.wounded, ['baseRate', 'bonusPerHealingLevel', 'maxRate', 'bedsPerLevel', 'healCostPct', 'healTimePctOfTraining', 'healLevelReduction', 'instantHealGoldPerTier', 'woundedPayUpkeep'])
};

// GET /api/player/me
router.get('/me', auth, async (req, res) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.user.playerId },
      // Charge utile réduite (rafraîchie toutes les 15 s sur mobile) : les villes détaillées viennent de /api/cities,
      // les membres d'alliance de /api/alliance/mine
      include: {
        cities: { select: { id: true, name: true, x: true, y: true, isCapital: true } },
        hero: { include: { items: { where: { slot: { not: 'inventory' } } } } },   // objets portés seulement : le sac vient de /api/hero
        stats: true,
        alliance: { select: { allianceId: true, role: true, alliance: { select: { id: true, name: true, tag: true } } } },
        expeditions: { where: { status: { in: ['AVAILABLE', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'desc' } },
        account: { select: { emailVerifiedAt: true, role: true, titles: true } }
      }
    });
    if (!player) return res.status(401).json({ error: 'Compte supprimé ou introuvable' });   // jeton encore valide mais compte effacé
    const { account, ...rest } = player;
    // Researched technology levels { KEY: level }: the client applies the same cost and time formulas as the server
    const techLevels = levelsFrom(await prisma.playerTechnology.findMany({ where: { playerId: player.id } }));
    // demandes d'aide d'alliance que le joueur peut aider (pastille de l'onglet Alliance)
    const questsClaimable = await require('../services/questService').claimableCount(player.id).catch(() => 0);   // pastille du bouton Quêtes
    const allianceHelpPending = rest.alliance ? await require('../services/allianceHelpService').pendingCount(player.id).catch(() => 0) : 0;
    res.json({ ...rest, techLevels, economy: ECONOMY, allianceHelpPending, questsClaimable, emailVerified: !!account?.emailVerifiedAt, emailVerificationRequired: config.email.enforce, role: account?.role || 'PLAYER', titles: Array.isArray(account?.titles) ? account.titles : [] });   // role : écran d'administration (décision du 29 octobre 2026)
  } catch (e) {
    sendError(res, e);
  }
});

// GET /api/player/:id - Public profile
router.get('/:id', auth, async (req, res) => {
  try {
    const targetPlayer = await prisma.player.findUnique({
      where: { id: req.params.id },
      include: {
        cities: { select: { id: true, name: true, x: true, y: true, isCapital: true } },
        stats: true,
        alliance: { include: { alliance: { select: { id: true, name: true, tag: true } } } },
        hero: { select: { name: true, level: true } }
      }
    });
    const medals = targetPlayer ? await prisma.medal.findMany({ where: { playerId: targetPlayer.id }, orderBy: [{ week: 'desc' }, { rank: 'asc' }], take: 50 }) : [];
    if (!targetPlayer) return res.status(404).json({ error: 'Joueur non trouvé' });
    // ce qui lie le joueur à celui qu'il regarde : amitié (demande envoyée, reçue, acceptée) et blocage
    const meId = req.user.playerId;
    const [friendship, block] = targetPlayer.id === meId ? [null, null] : await Promise.all([
      prisma.friendship.findFirst({ where: { OR: [{ requesterId: meId, addresseeId: targetPlayer.id }, { requesterId: targetPlayer.id, addresseeId: meId }] } }),
      prisma.playerBlock.findUnique({ where: { blockerId_blockedId: { blockerId: meId, blockedId: targetPlayer.id } } })
    ]);
    const diplomacy = (await getRelation(meId, targetPlayer.id)).status;   // SELF, SAME_ALLIANCE, ALLY, NEUTRAL, ENEMY
    const relation = { self: targetPlayer.id === meId, diplomacy, blocked: !!block, friend: !friendship ? null : friendship.status === 'ACCEPTED' ? 'friends' : friendship.requesterId === meId ? 'sent' : 'received', requestId: friendship?.status === 'PENDING' ? friendship.id : null };

    res.json({
      id: targetPlayer.id, name: targetPlayer.name, faction: targetPlayer.faction,
      population: targetPlayer.population, citiesCount: targetPlayer.cities.length,
      cities: targetPlayer.cities,
      alliance: targetPlayer.alliance?.alliance ? {
        id: targetPlayer.alliance.alliance.id, name: targetPlayer.alliance.alliance.name, tag: targetPlayer.alliance.alliance.tag, role: targetPlayer.alliance.role
      } : null,
      hero: targetPlayer.hero ? { name: targetPlayer.hero.name, level: targetPlayer.hero.level } : null,
      stats: targetPlayer.stats ? { attacksWon: targetPlayer.stats.attacksWon, defensesWon: targetPlayer.stats.defensesWon, attackPoints: targetPlayer.stats.attackPoints, defensePoints: targetPlayer.stats.defensePoints, loot: targetPlayer.stats.loot } : null,
      medals: medals.map(m => ({ week: m.week, category: m.category, rank: m.rank, value: m.value })),
      createdAt: targetPlayer.createdAt, relation
    });
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;
