// ============================================================
// route-worker.js — les longs trajets d'armée sont calculés ici, hors du fil principal : la carte ne se fige pas pendant
// le calcul (un trajet d'un bout à l'autre du monde explore plus de 100 000 cases, une demi-seconde sur un téléphone).
// Même terrain partagé que le jeu et le serveur (shared/terrain.js), à la graine de la carte du serveur.
// Message reçu : { id, seed, from: [x, y], to: [x, y], objects: [["x,y", "CITY" | "RESOURCE"], ...], faction }
// Réponse : { id, path: [[x, y], ...] | null }
// ============================================================
self.importScripts('shared/terrain.js');
self.onmessage = (e) => {
  const { id, seed, from, to, objects, faction } = e.data || {};
  try {
    self.Terrain.setWorldSeed(seed);
    const r = self.Terrain.findPath(from[0], from[1], to[0], to[1], new Map(objects || []), undefined, faction ? { faction } : null);
    self.postMessage({ id, path: r ? r.path : null });
  } catch (err) {
    self.postMessage({ id, path: null, error: String((err && err.message) || err) });
  }
};
