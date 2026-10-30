// ========== HERO XP SERVICE ==========
// Point unique d'attribution d'XP avec montée de niveau.
// Courbe (décision du 30 octobre 2026) : 100 XP pour le niv. 2, puis × 1,25 par niveau (× 1,5 avant), +4 points de stat
// par niveau, niveau max 30 (GDD). Les héros existants ont leur seuil recalculé par la migration 0029.
const prisma = require('../config/database');
const config = require('../config');

// seuil du niveau suivant après `xpToNext` (arrondi par défaut, comme la migration)
const nextThreshold = (xpToNext) => Math.floor(xpToNext * config.hero.xpLevelFactor);
// XP à gagner pour quitter le niveau `level` : chaîne × xpLevelFactor depuis xpFirstLevel
function xpToNextAt(level) {
  let need = config.hero.xpFirstLevel;
  for (let l = 1; l < level; l++) need = nextThreshold(need);
  return need;
}

async function awardHeroXp(heroId, xpGained, tx = prisma) {
  if (!heroId || !xpGained || xpGained <= 0) return null;
  const hero = await tx.hero.findUnique({ where: { id: heroId } });
  if (!hero) return null;
  if (hero.level >= config.combat.heroMaxLevel) return { level: hero.level, leveledUp: false };
  if (hero.diedAt) return { level: hero.level, leveledUp: false };   // un héros tombé ne gagne rien
  xpGained *= 1 + require('../utils/heroEffects').talent(hero, 'heroXpPct') / 100;   // talent Vétéran
  let xp = hero.xp + Math.floor(xpGained);
  let level = hero.level, xpToNext = hero.xpToNextLevel, statPoints = hero.statPoints;
  while (xp >= xpToNext && level < config.combat.heroMaxLevel) {
    xp -= xpToNext;
    level++;
    xpToNext = nextThreshold(xpToNext);
    statPoints += 4;
  }
  if (level >= config.combat.heroMaxLevel) xp = 0;
  await tx.hero.update({ where: { id: heroId }, data: { xp, level, xpToNextLevel: xpToNext, statPoints } });
  if (level > hero.level) {
    console.log(`[HERO] ${hero.name} passe niveau ${level} ! (+${(level - hero.level) * 4} points)`);
    require('./pushService').notify(hero.playerId, 'hero', '⭐ Héros : niveau ' + level, `${hero.name} passe niveau ${level} : +${(level - hero.level) * 4} points de caractéristique et +${level - hero.level} point${level - hero.level > 1 ? 's' : ''} de talent.`, { to: 'hero' });
  }
  return { level, leveledUp: level > hero.level };
}

module.exports = { awardHeroXp, xpToNextAt };
