// ============================================================
// Carte du serveur (décision du 26 octobre 2026) : chaque serveur a sa carte, tirée au hasard à sa création.
// Tout le terrain se déduit d'une graine (frontend/js/shared/terrain.js, setWorldSeed), gardée en base dans WorldConfig
// avec la version du générateur qui l'a tirée, et publiée par GET /api/world/info pour que le client dessine la même carte
// que celle où marchent les armées.
//
// - Un monde déjà peuplé (joueurs, villes ou points de ressource) garde la carte de référence : graine 0.
// - Un serveur neuf prend WORLD_SEED s'il est donné, sinon tire une graine au hasard parmi celles qui donnent une carte
//   jouable (Terrain.worldStatsOk : terre d'un seul tenant, biomes dans leurs proportions, rivières traversables).
// - La graine n'est jamais changée ensuite : elle déplacerait toute la carte sous les villes. Pour une autre carte, on
//   ouvre un nouveau serveur (base vide). Une carte faite par un générateur que ce code ne sait pas refaire arrête le
//   serveur (sinon il « sauverait » les villes en les déplaçant toutes).
// - Le serveur n'ouvre (/api/* hors /api/health) qu'une fois le monde prêt : graine chargée et, sur un monde neuf, points
//   de ressource posés (WorldConfig.readyAt).
// En mode cluster, le worker de tick choisit la graine et prépare le monde ; les workers HTTP attendent, puis la lisent.
// ============================================================
const crypto = require('crypto');
const config = require('../config');
const prisma = require('../config/database');
const Terrain = require('../../frontend/js/shared/terrain.js');

let ready = false;
const MAX_TRIES = 25;   // graines essayées avant de garder la meilleure (en pratique la première convient presque toujours)

// WORLD_SEED : entier de 0 (carte de référence) à Terrain.MAX_SEED ; tout le reste est ignoré
function envSeed() {
  const raw = config.map.worldSeed;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > Terrain.MAX_SEED) { console.warn(`[MONDE] WORLD_SEED=${raw} ignoré (entier de 0 à ${Terrain.MAX_SEED} attendu)`); return null; }
  return n;
}

// Une graine au hasard qui donne une carte jouable
function pickRandomSeed() {
  let best = null;
  for (let i = 0; i < MAX_TRIES; i++) {
    const seed = crypto.randomInt(1, Terrain.MAX_SEED + 1);
    Terrain.setWorldSeed(seed);
    const stats = Terrain.worldStats();
    if (Terrain.worldStatsOk(stats)) return { seed, stats, tries: i + 1 };
    if (!best || stats.mainland > best.stats.mainland) best = { seed, stats, tries: i + 1 };
  }
  console.warn(`[MONDE] aucune des ${MAX_TRIES} graines essayées ne passe le contrôle : la meilleure est gardée`);
  return best;
}

function describe(seed) {
  const st = Terrain.worldStats();   // tout le monde parcouru (0,3 s) : seulement dans le processus qui prépare la base
  const pct = (v) => Math.round(v * 100) + ' %';
  return `graine ${seed}${seed === 0 ? ' (carte de référence)' : ''} : neige ${pct(st.snow)}, désert ${pct(st.desert)}, terre d'un seul tenant ${pct(st.mainland)}, ${st.rivers} rivières, ${st.crossings} passages`;
}

const fatal = (msg) => Object.assign(new Error(msg), { fatal: true });

// Les villes et les points d'un monde peuplé tiennent-ils sur la carte de cette graine ? Sur sa vraie carte, aucune ville
// n'a les pieds dans l'eau ni sur le relief (le démarrage les en sort) et aucun point n'est dans l'eau ; sur une autre
// carte, une bonne part tombe mal. Sert quand un monde peuplé n'a pas (ou plus) de graine en base.
async function fitsSeed(seed) {
  Terrain.setWorldSeed(seed);
  const [cities, nodes] = await Promise.all([prisma.city.findMany({ select: { x: true, y: true } }), prisma.resourceNode.findMany({ select: { x: true, y: true } })]);
  const badCell = (x, y) => { const f = Terrain.getTerrainType(x, y).feature; return !Terrain.inWorld(x, y) || Terrain.BLOCKED[f] || f === 'bridge' || f === 'ford'; };
  const badCities = cities.filter(c => !Terrain.isMainland(c.x, c.y) || Terrain.cityCells(c.x, c.y).some(([x, y]) => badCell(x, y))).length;
  const wetNodes = nodes.filter(n => !Terrain.inWorld(n.x, n.y) || Terrain.WATER[Terrain.getTerrainType(n.x, n.y).feature]).length;
  const ok = badCities <= Math.max(2, cities.length * 0.02) && wetNodes <= Math.max(5, nodes.length * 0.02);
  return { ok, cities: cities.length, badCities, nodes: nodes.length, wetNodes };
}

// La table WorldConfig pas encore créée (le worker de tick applique encore les migrations) : on attend comme pour la ligne
const tableMissing = (e) => e?.code === 'P2021' || /does not exist/i.test(String(e?.message || ''));

// Charge la graine du monde et l'applique au terrain. setup = ce processus prépare la base (processus unique ou worker de
// tick) et peut choisir la graine d'un monde neuf ; sinon il attend que le worker de tick l'ait écrite.
async function loadWorldSeed({ setup = true } = {}) {
  for (let attempt = 0; ; attempt++) {
    let row;
    try { row = await prisma.worldConfig.findUnique({ where: { id: 1 } }); }
    catch (e) { if (setup || !tableMissing(e)) throw e; row = null; }
    if (row) {
      try { Terrain.setWorldSeed(row.seed, row.generator); }
      catch (e) { throw fatal(`[MONDE] ${e.message}. Déployer une version du serveur qui sait dessiner cette carte ; ne pas changer la graine d'un monde ouvert.`); }
      const wanted = envSeed();
      if (wanted !== null && wanted !== row.seed) console.warn(`[MONDE] WORLD_SEED=${wanted} ignoré : ce monde a déjà sa carte (graine ${row.seed}) ; une autre carte demande un nouveau serveur`);
      console.log(setup ? `[MONDE] ${describe(row.seed)}` : `[MONDE] graine ${row.seed}`);
      return row;
    }
    if (!setup) {
      if (attempt >= 600) throw new Error('graine du monde toujours absente après 5 minutes (le worker de tick ne l\'a pas écrite)');
      await new Promise(r => setTimeout(r, 500));
      continue;
    }
    // Pas encore de graine : un monde déjà peuplé garde sa carte, un monde neuf reçoit la sienne
    const [cities, nodes, players] = await Promise.all([prisma.city.count(), prisma.resourceNode.count(), prisma.player.count()]);
    let seed, why, readyAt = null;
    // des joueurs sans ville (comptes gardés pour le monde suivant, décision du 28 octobre 2026) ne fixent pas la carte
    if (cities + nodes > 0) {
      // monde ouvert avant les cartes au hasard (carte de référence), ou dont la graine s'est perdue : on ne la remplace que
      // si ses villes et ses points tiennent sur la carte choisie (WORLD_SEED pour rendre sa graine à un monde, sinon 0),
      // car le démarrage déplacerait sinon toutes les villes « coincées »
      const candidate = envSeed() ?? 0;
      const fit = await fitsSeed(candidate);
      if (!fit.ok) throw fatal(`[MONDE] Ce monde a ${players} joueurs et ${cities} villes mais pas de graine en base, et il ne tient pas sur la carte de la graine ${candidate} (${fit.badCities} villes sur l'eau ou le relief, ${fit.wetNodes} points dans l'eau) : ce n'est pas sa carte. Restaurer la ligne WorldConfig d'une sauvegarde, ou démarrer avec WORLD_SEED=<sa graine> (ligne [MONDE] du journal de son premier démarrage).`);
      seed = candidate; readyAt = new Date();
      why = `monde déjà peuplé (${players} joueurs, ${cities} villes, ${nodes} points), qui tient sur cette carte${candidate === 0 ? ' (carte de référence)' : ' (WORLD_SEED)'}`;
    }
    else if (envSeed() !== null) { seed = envSeed(); why = 'WORLD_SEED'; }
    else { const p = pickRandomSeed(); seed = p.seed; why = `tirée au hasard (${p.tries} essai${p.tries > 1 ? 's' : ''})`; }
    // un autre processus a pu l'écrire entre-temps : la première écrite l'emporte, puis on relit
    // numéro du monde : le suivant du dernier monde terminé (Panthéon), 1 pour le premier
    const inserted = await prisma.$executeRaw`INSERT INTO "WorldConfig" ("id", "seed", "generator", "readyAt", "number") VALUES (1, ${seed}, ${Terrain.generatorFor(seed)}, ${readyAt}, (SELECT COALESCE(MAX("world"), 0) + 1 FROM "HallOfFame")) ON CONFLICT ("id") DO NOTHING`;
    const populated = readyAt !== null;   // monde déjà peuplé : sa graine est notée, ce n'est pas une nouvelle carte
    console.log(!inserted ? '[MONDE] un autre processus a écrit la graine en même temps : la sienne est gardée'
      : populated ? `[MONDE] graine ${seed} notée pour ce monde : ${why}` : `[MONDE] nouvelle carte, graine ${seed} : ${why}`);
  }
}

// Le monde est prêt (points de ressource posés, villes vérifiées) : le serveur ouvre. Le processus qui prépare la base le
// note en base ; les autres attendent cette note (un monde neuf peut prendre quelques secondes à se peupler).
async function openWorld({ setup = true } = {}) {
  if (setup) {
    await prisma.worldConfig.updateMany({ where: { id: 1, readyAt: null }, data: { readyAt: new Date() } });
  } else {
    for (let attempt = 0; ; attempt++) {
      const row = await prisma.worldConfig.findUnique({ where: { id: 1 }, select: { readyAt: true } });
      if (row?.readyAt) break;
      if (attempt >= 600) throw new Error('le monde n\'est toujours pas prêt après 10 minutes (préparation par le worker de tick)');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  ready = true;
}

module.exports = { loadWorldSeed, openWorld, isWorldReady: () => ready };
