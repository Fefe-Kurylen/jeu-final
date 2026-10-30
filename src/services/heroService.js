// ============================================================
// Héros (décision du 27 octobre 2026) : talents, chute au combat, résurrection au Domus du Héros
// - Talents : 1 point par niveau gagné, trois branches (data/hero-talents.json, utils/heroEffects.js) ; un rang de plus
//   à la fois ; réinitialisation : la première gratuite, ensuite `resetGold` or.
// - Chute : le héros tombe quand l'armée qu'il mène (ou la garnison qu'il commande) perd tous ses soldats dans un
//   combat ; il garde son niveau, ses points, ses talents et ses objets mais n'apporte plus rien.
// - Résurrection : au Domus du Héros de la capitale, 24 h réduites de 2 % par niveau du Domus (et du talent
//   Endurance), payée en ressources selon son niveau ; il revient dans la garnison de la capitale.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const HE = require('../utils/heroEffects');
const { notify } = require('./pushService');
const { debitCity, lockCity } = require('../utils/db');
const { buildingsData } = require('../config/gamedata');

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });
const RES = ['wood', 'stone', 'iron', 'food'];
const DOMUS = buildingsData.find(b => b.key === 'HERO_MANSION')?.effects || {};

const reviveCost = (hero) => Object.fromEntries(RES.map(r => [r, config.hero.reviveCostPerLevel[r] * Math.max(1, hero.level || 1)]));
function reviveSeconds(hero, domusLevel) {
  const base = (DOMUS.heroResurrectionBaseHours || 24) * 3600;
  const domus = 1 - Math.min(0.9, (DOMUS.heroResurrectionReductionPctPerLevel || 2) * domusLevel / 100);
  const talent = 1 - Math.min(0.5, HE.talent(hero, 'reviveTimePct') / 100);
  return Math.round(base * domus * talent);
}
const stateOf = (hero) => (!hero ? null : hero.reviveEndsAt ? 'REVIVING' : hero.diedAt ? 'FALLEN' : 'ALIVE');

// Vue du héros pour le client : talents, points, état
function heroView(hero, domusLevel = 0) {
  if (!hero) return hero;
  const spent = HE.spentPoints(hero), total = HE.talentPoints(hero);
  return {
    ...hero,
    talents: hero.talents || {},
    talentPoints: { total, spent, free: Math.max(0, total - spent) },
    talentResetGold: hero.talentResets > 0 ? HE.catalog.resetGold : 0,
    state: stateOf(hero),
    revive: hero.diedAt ? { cost: reviveCost(hero), seconds: reviveSeconds(hero, domusLevel), domusLevel, endsAt: hero.reviveEndsAt } : null,
    bonuses: Object.fromEntries(['attack', 'defense', 'speed', 'logistics'].map(s => [s, Math.round(HE.statPct(hero, s) * 1000) / 10]))
  };
}

// ---- talents ----
async function learnTalent(playerId, key) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Hero" WHERE "playerId" = ${playerId} FOR UPDATE`;
    const hero = await tx.hero.findUnique({ where: { playerId } });
    if (!hero) throw httpError(404, 'Héros non trouvé');
    const why = HE.canLearn(hero, key);
    if (why) throw httpError(400, why);
    const ranks = { ...(hero.talents || {}) };
    ranks[key] = (ranks[key] || 0) + 1;
    await tx.hero.update({ where: { id: hero.id }, data: { talents: ranks } });
    const t = HE.TALENTS.get(key);
    return { message: `${t.name} : rang ${ranks[key]} / ${t.maxRank}`, talents: ranks };
  });
}
async function resetTalents(playerId) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Hero" WHERE "playerId" = ${playerId} FOR UPDATE`;
    const hero = await tx.hero.findUnique({ where: { playerId } });
    if (!hero) throw httpError(404, 'Héros non trouvé');
    if (!HE.spentPoints(hero)) throw httpError(400, 'Aucun talent à réinitialiser');
    const price = hero.talentResets > 0 ? HE.catalog.resetGold : 0;
    if (price > 0) {
      const paid = await tx.player.updateMany({ where: { id: playerId, gold: { gte: price } }, data: { gold: { decrement: price } } });
      if (paid.count !== 1) throw httpError(400, `Il faut ${price} or pour réinitialiser les talents`);
    }
    await tx.hero.update({ where: { id: hero.id }, data: { talents: {}, talentResets: { increment: 1 } } });
    return { message: price ? `Talents réinitialisés (${price} or)` : 'Talents réinitialisés (gratuit la première fois)', gold: price };
  });
}

// ---- chute ----
// `armies` : les armées qui ont combattu avec des soldats ; celles qui n'en ont plus perdent leur héros
async function fallIfWiped(tx, armies, now = new Date()) {
  const fallen = [];
  for (const a of armies || []) {
    if (!a?.heroId) continue;
    const left = await tx.armyUnit.aggregate({ where: { armyId: a.id, count: { gt: 0 } }, _sum: { count: true } });
    if ((left._sum.count || 0) > 0) continue;
    const hero = await tx.hero.findUnique({ where: { id: a.heroId } });
    if (!hero || hero.diedAt) continue;
    // il ne tombe que s'il mène encore cette armée (pas d'après une lecture faite avant le combat)
    const detached = await tx.army.updateMany({ where: { id: a.id, heroId: hero.id }, data: { heroId: null } });
    if (detached.count !== 1) continue;
    await tx.hero.update({ where: { id: hero.id }, data: { diedAt: now, reviveEndsAt: null } });
    fallen.push({ heroId: hero.id, name: hero.name, playerId: hero.playerId });
  }
  for (const f of fallen) notify(f.playerId, 'hero', '⚰️ Héros tombé', `${f.name} est tombé au combat avec son armée. Ressuscitez-le au Domus du Héros de votre capitale.`, { to: 'hero' });
  return fallen;
}
const unitsOf = (a) => (a?.units || []).reduce((t, u) => t + (u.count || 0), 0);
// les armées qui avaient des soldats au début du combat
const fought = (armies) => (armies || []).filter(a => a && a.heroId && unitsOf(a) > 0);
// le héros qui commande la défense : celui d'une armée qui a des soldats au début du combat (un héros seul dans une
// armée ou une garnison sans soldats ne combat pas), jamais un héros tombé
const leadingHero = (armies) => (armies || []).find(a => a?.hero && !a.hero.diedAt && unitsOf(a) > 0)?.hero || null;

// ---- résurrection ----
async function capitalWithDomus(db, playerId) {
  const capital = await db.city.findFirst({ where: { playerId, isCapital: true }, include: { buildings: { where: { key: 'HERO_MANSION' }, select: { level: true } } } });
  return { capital, domusLevel: capital?.buildings?.[0]?.level || 0 };
}
async function startRevive(playerId) {
  const out = await prisma.$transaction(async (tx) => {
    const { capital, domusLevel } = await capitalWithDomus(tx, playerId);
    if (!capital) throw httpError(400, 'Pas de capitale');
    await lockCity(tx, capital.id);
    await tx.$queryRaw`SELECT id FROM "Hero" WHERE "playerId" = ${playerId} FOR UPDATE`;
    const hero = await tx.hero.findUnique({ where: { playerId } });
    if (!hero) throw httpError(404, 'Héros non trouvé');
    if (!hero.diedAt) throw httpError(400, 'Votre héros est vivant');
    if (hero.reviveEndsAt) throw httpError(400, 'Résurrection déjà en cours');
    if (domusLevel < 1) throw httpError(400, 'Construisez le Domus du Héros dans votre capitale pour le ressusciter');
    const cost = reviveCost(hero);
    if (!(await debitCity(tx, capital.id, cost))) throw httpError(400, `Ressources insuffisantes dans ${capital.name}`);
    const endsAt = new Date(Date.now() + reviveSeconds(hero, domusLevel) * 1000);
    await tx.hero.update({ where: { id: hero.id }, data: { reviveEndsAt: endsAt } });
    return { message: `Résurrection en cours au Domus de ${capital.name}`, endsAt, cost };
  });
  return out;
}
// Tick : résurrections achevées ; le héros revient dans la capitale, joint à aucune armée
async function processRevivals(now = new Date()) {
  const due = await prisma.hero.findMany({ where: { reviveEndsAt: { lte: now } }, take: 200 });
  for (const hero of due) {
    try {
      const back = await prisma.$transaction(async (tx) => {
        const ok = await tx.hero.updateMany({ where: { id: hero.id, reviveEndsAt: { lte: now } }, data: { diedAt: null, reviveEndsAt: null } });
        if (ok.count !== 1) return false;
        const { capital } = await capitalWithDomus(tx, hero.playerId);
        // il revient dans la capitale, joint à aucune armée : le joueur le joint depuis le panneau d'une armée
        if (capital) await tx.hero.update({ where: { id: hero.id }, data: { cityId: capital.id } });
        return capital?.name || true;
      });
      if (back) notify(hero.playerId, 'hero', '✨ Héros ressuscité', `${hero.name} est de retour${typeof back === 'string' ? ` à ${back}` : ''} : joignez-le à une armée (la garnison comprise) depuis le panneau de l'armée pour qu'il combatte.`, { to: 'hero' });
    } catch (e) { console.error('[HERO REVIVE]', e.message); }
  }
  return due.length;
}

module.exports = { heroView, learnTalent, resetTalents, fallIfWiped, fought, leadingHero, startRevive, processRevivals, reviveCost, reviveSeconds, capitalWithDomus, stateOf, httpError };
