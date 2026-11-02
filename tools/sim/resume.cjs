// Simulation longue — reprise après un arrêt (analyse de la simulation du 2 novembre 2026, sim-e : le 2e arrêt, au jour 155,
// a tué le processus avant la sauvegarde ; la reprise est repartie d'un état vieux de 4 pas et a rejoué environ 24 h contre
// une base déjà avancée : ticks joués deux fois, rapports relus, villes Merveille et vagues comptées deux fois).
// - sim.cjs enregistre l'état avant et après chaque tick (playTicks : un tick commencé compte pour joué, il n'est jamais
//   rejoué), après chaque pas, et tout de suite à l'arrêt (SIGTERM) : un processus tué ne perd que la fin d'un pas ;
// - à la reprise, la base peut quand même être en avance sur l'état (processus tué entre deux sauvegardes) : dbClock() lit
//   la dernière heure écrite dans la base, resync() recale l'horloge, le pas et le dernier tick sur elle, sans rien rejouer
//   (mieux vaut une heure de production perdue qu'une heure comptée deux fois) ;
// - les modules qui relisent la base depuis leur dernière lecture (rapports de bataille…) gardent leur curseur dans l'état
//   (cursor()) : une reprise ne relit rien et ne saute rien ;
// - journal() : les lignes du journal des événements et l'heure du dernier (l'horloge reprise repart après lui).
'use strict';
const fs = require('fs');

const HOUR = 3600000;
// Tables où le serveur n'écrit createdAt qu'avec l'horloge simulée : par Prisma (sim.cjs remplit createdAt à chaque
// écriture) ou en SQL brut avec l'heure du jeu (expéditions). Pas les notifications : celles envoyées à tous sont écrites
// en SQL brut avec l'heure réelle de la base.
const TABLES = ['BattleReport', 'Rally', 'MarketOffer', 'ChatMessage', 'SpyReport', 'Expedition', 'AllianceHelp', 'City', 'Horde'];

// La dernière heure écrite dans la base (ms), null si rien ; une table absente (base plus ancienne) est sautée
async function dbClock(prisma, tables = TABLES) {
  let at = null;
  for (const t of tables) {
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT max("createdAt") AS t FROM "${t}"`);
      const v = rows?.[0]?.t ? new Date(rows[0].t).getTime() : null;
      if (Number.isFinite(v) && (at === null || v > at)) at = v;
    } catch (e) { /* table absente : on passe */ }
  }
  return at;
}

// Où reprendre. saved : { step, simNow, tickedTo } de l'état (tickedTo : l'heure du dernier tick joué ; un état plus ancien
// ne l'a pas : le tick de la fin de son pas) ; dbAt : la dernière heure écrite dans la base ; grid : { startMs, stepMs,
// subTicks } (un pas qui presse joue des ticks d'une heure sur une grille de subTicks par pas).
// La base en avance : le dernier tick joué est le point de la grille juste avant dbAt (les ticks écrivent à l'heure exacte
// de la grille, les joueurs quelques secondes ou minutes après) ; le pas repris est celui de ce tick ; l'horloge repart
// une seconde après la base (les heures écrites restent dans l'ordre). Rien n'est rejoué.
function resync(saved, dbAt, { startMs, stepMs, subTicks = 1 }) {
  const tickedTo = Number.isFinite(saved.tickedTo) ? saved.tickedTo : startMs + saved.step * stepMs;
  const out = { ahead: false, gapMs: 0, step: saved.step, simNow: saved.simNow, tickedTo };
  if (!Number.isFinite(dbAt) || dbAt <= saved.simNow) return out;
  const n = Math.max(0, Math.floor((dbAt - startMs) / stepMs));   // dernier pas dont le tick de fin est passé
  const end = startMs + n * stepMs;
  const sub = stepMs / Math.max(1, subTicks);
  const at = end + Math.floor((dbAt - end) / sub) * sub;          // un tick d'une heure du pas suivant a pu jouer
  return { ahead: true, gapMs: dbAt - saved.simNow, step: Math.max(saved.step, n), simNow: Math.max(saved.simNow, dbAt + 1000), tickedTo: Math.max(tickedTo, at) };
}

// Phrase du journal pour une reprise recalée
function describe(plan, saved, hours = (ms) => (ms / HOUR).toFixed(1).replace('.', ',')) {
  if (!plan.ahead) return `reprise au pas ${saved.step}`;
  return `reprise : la base a ${hours(plan.gapMs)} h d'avance sur l'état enregistré (pas ${saved.step}) ; horloge, pas (${plan.step}) et dernier tick recalés sur la base, rien n'est rejoué`;
}

// Curseurs de lecture des modules ({ nom: heure en ms }, enregistrés avec l'état) : cursor(store, nom, maintenant, recul)
// renvoie la fenêtre à lire, { since, until } (since exclu, until compris), et avance le curseur à `until`. Sans curseur
// (début de partie, ancien état), la fenêtre remonte de `backMs`.
function cursor(store, name, now, backMs) {
  const since = Number.isFinite(store[name]) ? store[name] : now - backMs;
  store[name] = Math.max(since, now);
  return { since: new Date(since), until: new Date(Math.max(since, now)) };
}

// Les ticks d'un pas, de `from` (le tick précédent) à `to` (sim.cjs, qui donne les crochets). run.ticked : l'heure du dernier
// tick joué ou commencé, gardée dans l'état ; chaque tick compte les heures écoulées depuis lui. Un tick compte pour joué dès
// qu'il commence : run.ticked avance et l'état est enregistré (save) avant lui, puis encore après. Un processus tué au
// milieu d'un tick ne le rejoue donc jamais à la reprise (la production de ses étapes déjà jouées compterait deux fois ; au
// pire, celle des étapes restantes manque). fine (pas qui presse) : un tick à chaque heure de la grille (subTicks ticks par
// pas) où une échéance donnée par nextDue(après, jusqu'à) est passée, puis afterSubTick ; à la reprise, les heures de la
// grille déjà jouées sont sautées. Le tick de `to` termine le pas s'il n'a pas déjà joué ; il joue même après un arrêt
// demandé (stopped) : le pas en cours finit ses ticks. Renvoie { ms, ticks }.
async function playTicks({ from, to, fine, subTicks, run, stopped, nextDue, tick, afterSubTick, save, setClock }) {
  let ms = 0, n = 0;
  const play = async (at) => {
    const hours = (at - run.ticked) / HOUR;
    setClock(at);
    run.ticked = at; n++;
    save();
    ms += (await tick(hours)) || 0;
    save();
  };
  if (fine) {
    const sub = (to - from) / subTicks;
    let k = Math.max(0, Math.floor((run.ticked - from) / sub));   // heures de la grille déjà jouées (reprise)
    while (!stopped()) {
      const due = await nextDue(Math.max(from, run.ticked), to);
      if (due === null) break;
      k = Math.max(k + 1, Math.ceil((due - from) / sub));   // l'heure de la grille où l'échéance est passée
      if (k >= subTicks) break;   // le tick de la fin du pas s'en charge
      await play(from + k * sub);
      await afterSubTick();
    }
  }
  if (run.ticked < to) await play(to);
  else setClock(to);
  return { ms, ticks: n };
}

// Le journal des événements (events.jsonl) : ses lignes (gardées dans l'état : à la reprise, celles écrites après la
// dernière sauvegarde se comptent) et l'heure de la dernière (ms ; null : journal vide, absent, ou dernière ligne coupée).
// Des événements peuvent avoir été écrits après la dernière sauvegarde sans rien laisser dans la base : l'horloge reprise
// repart après le dernier, les heures du journal restent dans l'ordre (une heure qui recule ferait croire au rapport que
// des heures ont été rejouées).
function journal(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return { lines: 0, lastAt: null }; }
  let lines = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  const t = text.trimEnd();
  let lastAt = null;
  try { lastAt = Date.parse(JSON.parse(t.slice(t.lastIndexOf('\n') + 1)).at) || null; } catch (e) { /* ligne coupée : pas d'heure */ }
  return { lines, lastAt };
}

module.exports = { TABLES, dbClock, resync, describe, cursor, playTicks, journal };
