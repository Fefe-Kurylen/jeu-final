// ========== BIOME PARTAGÉ SERVEUR ==========
// Le biome d'une case vient du terrain partagé avec le client (frontend/js/shared/terrain.js) : une seule formule pour
// la carte affichée, les chemins des armées et les points de ressource (nord enneigé, sud désertique, tempéré ailleurs).
const Terrain = require('../../frontend/js/shared/terrain.js');

const getBiome = (x, y) => Terrain.getBiome(x, y);

module.exports = { getBiome };
