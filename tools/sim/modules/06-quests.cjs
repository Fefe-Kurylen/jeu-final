// Simulation longue — quêtes (décision du 26 octobre 2026, services/questService.js) : quand la pastille du bouton Quêtes
// montre des récompenses à prendre (GET /api/player/me : questsClaimable), le joueur ouvre le panneau (GET /api/quests) et
// prend les récompenses prêtes (tutoriel, tâches, quêtes du jour et de la semaine, succès) dans la ville qui a la place pour
// toute la récompense, la capitale d'abord ; sans place nulle part, il attend d'avoir dépensé. Avant l'économie (fichier 06) :
// les ressources reçues servent aux chantiers du tour.
// Rapport de vérification du 31 octobre 2026 (§ 6.9) : aucune quête n'était réclamée, le plafond des récompenses
// (80 000 par ressource) n'avait pas été joué.
'use strict';
const RES = ['wood', 'stone', 'iron', 'food'];
const CALLS = 6;

// toutes les quêtes du panneau, celles à prendre d'abord
function claimables(view) {
  const all = [view?.tutorial?.current, ...(view?.tasks || []), ...(view?.daily?.quests || []), view?.daily?.bonus, ...(view?.weekly?.quests || []), view?.weekly?.bonus, ...(view?.achievements || [])].filter(Boolean);
  // le bonus « tout pris » du jour ou de la semaine se prend après les autres
  return all.filter(q => q.claimable).sort((a, b) => (a.bonus ? 1 : 0) - (b.bonus ? 1 : 0));
}
// la ville qui a la place pour toute la récompense (le serveur refuse sinon), la capitale d'abord
function cityFor(bot, reward) {
  const room = (c, r) => ((r === 'food' ? c.maxFoodStorage : c.maxStorage) || 0) - (c[r] || 0);
  const cities = [...(bot.cities || [])].filter(c => !c.isWonder).sort((a, b) => (b.isCapital ? 1 : 0) - (a.isCapital ? 1 : 0));
  return cities.find(c => RES.every(r => !(reward?.[r] > 0) || room(c, r) >= reward[r])) || null;
}

module.exports = {
  name: 'quests',
  claimables, cityFor,   // pour les tests unitaires (tests/unit/sim-bots.test.js)
  async act(bot, ctx) {
    if (!bot.me || !Array.isArray(bot.cities) || !bot.cities.length) return;
    const m = (bot.mem.q ||= {});
    m.k ||= {};
    if (!(bot.me.questsClaimable > 0) || (m.nx || 0) > ctx.step) return;
    let left = CALLS - 1;
    const r = await bot.get('/api/quests');
    if (!r.ok || !r.data) return;
    let waited = false;
    for (const q of claimables(r.data)) {
      if (left <= 0) break;
      const city = cityFor(bot, q.reward);
      if (!city) { waited = true; m.k.waitRoom = (m.k.waitRoom || 0) + 1; continue; }
      left--;
      const c = await bot.post(`/api/quests/${encodeURIComponent(q.key)}/claim`, { cityId: city.id });
      if (!c.ok) { m.k.refused = (m.k.refused || 0) + 1; continue; }
      for (const res of RES) city[res] = (city[res] || 0) + (c.data?.reward?.[res] || 0);
      m.k.claimed = (m.k.claimed || 0) + 1;
      m.k[`claimed_${q.kind}`] = (m.k[`claimed_${q.kind}`] || 0) + 1;
      m.k.volume = (m.k.volume || 0) + RES.reduce((t, x) => t + (c.data?.reward?.[x] || 0), 0);
    }
    // plus rien à prendre, ou pas de place : un coup d'œil plus tard (la pastille dit quand il y a du neuf)
    m.nx = ctx.step + (waited ? 4 : 1);
  },
  async afterStep(ctx) {
    const total = Math.round(ctx.OPT.days * 24 / ctx.OPT.stepHours);
    if (ctx.step % 112 !== 0 && ctx.step !== total) return;
    const k = {};
    for (const b of ctx.bots) for (const [key, v] of Object.entries(b.mem.q?.k || {})) k[key] = (k[key] || 0) + v;
    ctx.event('quest_summary', { step: ctx.step, counters: k });
    ctx.say(`quêtes : ${JSON.stringify(k)}`);
  }
};
