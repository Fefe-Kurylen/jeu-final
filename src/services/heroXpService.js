// ========== HERO XP SERVICE ==========
// Point unique d'attribution d'XP avec montée de niveau.
// Courbe : 100 XP pour le niv.2, ×1.5 par niveau, +4 points de stat par niveau, niveau max 30 (GDD).
const prisma = require('../config/database');
const config = require('../config');

async function awardHeroXp(heroId, xpGained, tx = prisma) {
  if (!heroId || !xpGained || xpGained <= 0) return null;
  const hero = await tx.hero.findUnique({ where: { id: heroId } });
  if (!hero) return null;
  if (hero.level >= config.combat.heroMaxLevel) return { level: hero.level, leveledUp: false };
  let xp = hero.xp + Math.floor(xpGained);
  let level = hero.level, xpToNext = hero.xpToNextLevel, statPoints = hero.statPoints;
  while (xp >= xpToNext && level < config.combat.heroMaxLevel) {
    xp -= xpToNext;
    level++;
    xpToNext = Math.floor(xpToNext * 1.5);
    statPoints += 4;
  }
  if (level >= config.combat.heroMaxLevel) xp = 0;
  await tx.hero.update({ where: { id: heroId }, data: { xp, level, xpToNextLevel: xpToNext, statPoints } });
  if (level > hero.level) console.log(`[HERO] ${hero.name} passe niveau ${level} ! (+${(level - hero.level) * 4} points)`);
  return { level, leveledUp: level > hero.level };
}

module.exports = { awardHeroXp };
