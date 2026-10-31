// ============================================================
// Vision (décision du 31 octobre 2026, Tour de guet) : la carte (villes, gisements, camps, terrain, Bastions, Merveilles)
// est visible par tous ; seuls les mouvements d'armées des autres joueurs sont cachés, sauf dans le rayon de vision de la
// Tour de guet de la capitale autour de CHACUNE des villes du joueur (fx.visionRadius : visionRangeL1 +
// visionRangePerLevel × niveau). Ses armées et celles de son alliance se voient partout (routes/map.js). Alertes
// d'attaque et espions : inchangés.
// ============================================================
const fx = require('../utils/buildingEffects');

// Où est une armée à l'instant `now` (ms) : en ligne droite de sa case de départ à sa cible selon l'heure (le chemin réel
// contourne le relief, de peu) ; une armée arrêtée (camp, récolte, fondation) est sur sa case
function armyPositionAt(army, now = Date.now()) {
  if (army.targetX === null || army.targetX === undefined || army.targetY === null || army.targetY === undefined || !army.arrivalAt) return { x: army.x, y: army.y };
  const end = new Date(army.arrivalAt).getTime(), start = army.departedAt ? new Date(army.departedAt).getTime() : end;
  const f = end > start ? Math.max(0, Math.min(1, (now - start) / (end - start))) : (now >= end ? 1 : 0);
  return { x: army.x + (army.targetX - army.x) * f, y: army.y + (army.targetY - army.y) * f };
}

// Ce que voit un joueur : ses villes et le rayon de la Tour de guet de sa capitale { cities: [{ x, y }], radius } ; une requête
async function visionOf(db, playerId) {
  const cities = playerId ? await db.city.findMany({ where: { playerId }, select: { x: true, y: true, isCapital: true, buildings: { where: { key: 'WATCHTOWER' }, select: { key: true, level: true } } } }) : [];
  return { cities: cities.map(c => ({ x: c.x, y: c.y })), radius: fx.visionRadius(fx.levelOf(cities.find(c => c.isCapital)?.buildings, 'WATCHTOWER')) };
}
// Un point de la carte est-il dans la vision du joueur ?
const sees = (vision, point) => vision.cities.some(c => Math.hypot(point.x - c.x, point.y - c.y) <= vision.radius);
// L'armée d'un autre joueur se voit-elle à l'instant `now` ?
const seesArmy = (vision, army, now = Date.now()) => sees(vision, armyPositionAt(army, now));

module.exports = { armyPositionAt, visionOf, sees, seesArmy };
