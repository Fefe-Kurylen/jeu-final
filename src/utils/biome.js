// ========== BIOME PARTAGE SERVEUR ==========
// DOIT rester identique à getBiome() de frontend/js/map.js
// Taches de ~36 cases avec biais centre (forêt riche) -> bord (neige rude)
const WORLD_SIZE = 374;
const BIOME_SCALE = 36;

function seededRandom(x, y, seed = 12345) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y, seed) {
  const gx = Math.floor(x / BIOME_SCALE), gy = Math.floor(y / BIOME_SCALE);
  const fx = (x / BIOME_SCALE) - gx, fy = (y / BIOME_SCALE) - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n00 = seededRandom(gx, gy, seed), n10 = seededRandom(gx + 1, gy, seed);
  const n01 = seededRandom(gx, gy + 1, seed), n11 = seededRandom(gx + 1, gy + 1, seed);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

function getBiome(x, y) {
  const distance = Math.sqrt(x * x + y * y);
  const maxDist = WORLD_SIZE / 2 * 1.4;
  const climate = smoothNoise(x, y, 77777) * 0.65 + (distance / maxDist) * 0.55;
  if (climate < 0.50) return 'forest';
  if (climate < 0.80) return 'desert';
  return 'snow';
}

module.exports = { getBiome };
