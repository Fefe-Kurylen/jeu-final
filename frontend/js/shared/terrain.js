// ============================================================
// Terrain procédural partagé par le client (carte, scène de la ville) et le serveur (chemins des armées,
// positions de départ). Le même code tourne des deux côtés : toute modification ici change la carte pour
// tout le monde. Chargé comme script global (window.Terrain) et comme module CommonJS (require).
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Terrain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const WORLD_SIZE = 374;
  const MIN_COORD = -Math.floor(WORLD_SIZE / 2);          // -187
  const MAX_COORD = MIN_COORD + WORLD_SIZE - 1;           // +186
  const BIOME_SCALE = 36;   // taille caractéristique d'une tache de biome (cases)
  const HILL_SCALE = 7;     // régions de collines où les montagnes se regroupent

  function seededRandom(x, y, seed = 12345) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
  }

  function valueNoise(x, y, seed, scale) {
    const gx = Math.floor(x / scale), gy = Math.floor(y / scale);
    const fx = (x / scale) - gx, fy = (y / scale) - gy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const n00 = seededRandom(gx, gy, seed), n10 = seededRandom(gx + 1, gy, seed);
    const n01 = seededRandom(gx, gy + 1, seed), n11 = seededRandom(gx + 1, gy + 1, seed);
    return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
  }
  const smoothNoise = (x, y, seed) => valueNoise(x, y, seed, BIOME_SCALE);
  const hillNoise = (x, y, seed = 4242) => valueNoise(x, y, seed, HILL_SCALE);

  // Biomes en taches avec biais centre (forêt riche) -> bord (neige rude)
  function getBiome(x, y) {
    const distance = Math.sqrt(x * x + y * y);
    const maxDist = WORLD_SIZE / 2 * 1.4;
    const climate = smoothNoise(x, y, 77777) * 0.65 + (distance / maxDist) * 0.55;
    if (climate < 0.50) return 'forest';
    if (climate < 0.80) return 'desert';
    return 'snow';
  }

  // Rivières sinueuses (sources fixes)
  const RIVERS = [
    { sx: -100, sy: -50, dir: 0.3, length: 30 },
    { sx: 50, sy: -120, dir: -0.2, length: 25 },
    { sx: -80, sy: 80, dir: 0.4, length: 28 },
    { sx: 120, sy: 30, dir: -0.35, length: 22 },
    { sx: -30, sy: 100, dir: 0.25, length: 20 }
  ];
  function isOnRiver(x, y) {
    for (const river of RIVERS) {
      let rx = river.sx, ry = river.sy, dir = river.dir;
      for (let i = 0; i < river.length; i++) {
        if (Math.abs(x - Math.round(rx)) <= 1 && Math.abs(y - Math.round(ry)) <= 1) {
          const dist = Math.sqrt((x - rx) ** 2 + (y - ry) ** 2);
          if (dist < 1.2) return true;
        }
        rx += Math.cos(dir * Math.PI) * 2;
        ry += Math.sin(dir * Math.PI) * 2;
        dir += (seededRandom(Math.floor(rx), Math.floor(ry), 11111) - 0.5) * 0.3;
      }
    }
    return false;
  }

  // Lacs (disques irréguliers)
  const LAKES = [
    { cx: -60, cy: -30, radius: 8 }, { cx: 80, cy: -70, radius: 6 }, { cx: -90, cy: 60, radius: 10 },
    { cx: 40, cy: 90, radius: 7 }, { cx: 100, cy: -20, radius: 5 }, { cx: -20, cy: -100, radius: 9 }
  ];
  function isOnLake(x, y) {
    for (const lake of LAKES) {
      const dist = Math.sqrt((x - lake.cx) ** 2 + (y - lake.cy) ** 2);
      const irregularity = seededRandom(x, y, 22222) * 3;
      if (dist < lake.radius + irregularity - 2) return true;
    }
    return false;
  }

  // Chaînes de montagnes (segments épais)
  const RANGES = [
    { sx: -150, sy: 0, ex: -50, ey: -80, width: 4 }, { sx: 50, sy: -150, ex: 100, ey: -50, width: 3 },
    { sx: -100, sy: 100, ex: 0, ey: 150, width: 5 }, { sx: 80, sy: 50, ex: 150, ey: 100, width: 4 }
  ];
  function isOnMountainRange(x, y) {
    for (const range of RANGES) {
      const dx = range.ex - range.sx, dy = range.ey - range.sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const t = Math.max(0, Math.min(1, ((x - range.sx) * dx + (y - range.sy) * dy) / (len * len)));
      const nearX = range.sx + t * dx, nearY = range.sy + t * dy;
      const dist = Math.sqrt((x - nearX) ** 2 + (y - nearY) ** 2);
      const widthVar = seededRandom(x, y, 33333) * 2;
      if (dist < range.width + widthVar) return true;
    }
    return false;
  }

  // Type de terrain d'une case : { biome, feature, isMultiTile }
  function computeTerrainType(x, y) {
    const biome = getBiome(x, y);
    const noise = seededRandom(x, y);
    const noise2 = seededRandom(x * 2, y * 2, 54321);
    const hills = hillNoise(x, y);
    if ((biome === 'forest' || biome === 'desert') && isOnRiver(x, y)) return { biome, feature: biome === 'desert' ? 'oasis' : 'water', isMultiTile: true };
    if (isOnLake(x, y)) {
      if (biome === 'snow') return { biome, feature: 'frozen', isMultiTile: true };
      if (biome === 'desert') return { biome, feature: 'oasis', isMultiTile: true };
      return { biome, feature: 'water', isMultiTile: true };
    }
    if (isOnMountainRange(x, y)) {
      if (biome === 'snow') return { biome, feature: 'icemountain', isMultiTile: true };
      if (biome === 'desert') return { biome, feature: 'rocks', isMultiTile: true };
      return { biome, feature: 'mountain', isMultiTile: true };
    }
    if (biome === 'forest') {
      if (hills > 0.72 && noise > 0.5) return { biome, feature: 'mountain' };
      if (hills > 0.66 && noise > 0.85) return { biome, feature: 'mountain' };
      if (noise > 0.55 && noise2 > 0.4) return { biome, feature: 'tree' };
      if (noise < 0.02) return { biome, feature: 'water' };
    } else if (biome === 'desert') {
      if (noise > 0.95) return { biome, feature: 'ruins' };
      if (hills > 0.7 && noise > 0.5) return { biome, feature: 'dunes' };
      if (noise > 0.88 && noise2 > 0.5) return { biome, feature: 'rocks' };
      if (noise > 0.8 && noise2 > 0.6) return { biome, feature: 'dunes' };
      if (noise < 0.03) return { biome, feature: 'oasis' };
    } else if (biome === 'snow') {
      if (hills > 0.72 && noise > 0.5) return { biome, feature: 'icemountain' };
      if (hills > 0.66 && noise > 0.85) return { biome, feature: 'icemountain' };
      if (noise > 0.50 && noise2 > 0.35) return { biome, feature: 'snowtree' };
      if (noise < 0.03) return { biome, feature: 'frozen' };
    }
    return { biome, feature: null };
  }

  // Cache : le terrain est déterministe
  const cache = new Map();
  function getTerrainType(x, y) {
    const k = x + ',' + y;
    let t = cache.get(k);
    if (t) return t;
    t = computeTerrainType(x, y);
    if (cache.size > 250000) cache.clear();
    cache.set(k, t);
    return t;
  }

  // Cases infranchissables par une armée : montagnes et eau (y compris l'oasis d'eau du désert et les lacs gelés).
  // Une case portant une ville ou un point de ressource, ou voisine d'une ville, est toujours franchissable
  // (le relief n'y est pas dessiné non plus).
  const BLOCKED = { mountain: 1, icemountain: 1, water: 1, frozen: 1, oasis: 1 };
  const WATER = { water: 1, frozen: 1, oasis: 1 };
  function inWorld(x, y) { return x >= MIN_COORD && x <= MAX_COORD && y >= MIN_COORD && y <= MAX_COORD; }
  // objects: Map "x,y" -> 'CITY' | 'RESOURCE' (facultatif)
  function isObjectCell(objects, x, y) {
    if (!objects) return false;
    if (objects.has(x + ',' + y)) return true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (objects.get((x + dx) + ',' + (y + dy)) === 'CITY') return true;
    return false;
  }
  function isBlocked(x, y, objects) {
    if (!inWorld(x, y)) return true;
    if (isObjectCell(objects, x, y)) return false;
    return !!BLOCKED[getTerrainType(x, y).feature];
  }

  // Chemin le plus court (A*, 8 voisins, diagonale = racine de 2, pas de coupe de coin entre deux obstacles).
  // Renvoie { path: [[x, y], ...], length } ou null si la destination est inaccessible dans la limite d'exploration.
  function findPath(fromX, fromY, toX, toY, objects, maxExpansions = 40000) {
    if (fromX === toX && fromY === toY) return { path: [[fromX, fromY]], length: 0 };
    if (isBlocked(toX, toY, objects)) return null;
    const key = (x, y) => x + ',' + y;
    const h = (x, y) => { const dx = Math.abs(x - toX), dy = Math.abs(y - toY); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
    const open = [{ x: fromX, y: fromY, g: 0, f: h(fromX, fromY) }];
    const gScore = new Map([[key(fromX, fromY), 0]]);
    const came = new Map();
    const closed = new Set();
    let expansions = 0;
    while (open.length) {
      // plus petit f (tas binaire simple)
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      const ck = key(cur.x, cur.y);
      if (closed.has(ck)) continue;
      if (cur.x === toX && cur.y === toY) {
        const path = [[toX, toY]];
        let k = ck;
        while (came.has(k)) { const p = came.get(k); path.push([p.x, p.y]); k = key(p.x, p.y); }
        path.reverse();
        return { path, length: cur.g };
      }
      closed.add(ck);
      if (++expansions > maxExpansions) return null;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cur.x + dx, ny = cur.y + dy, nk = key(nx, ny);
        if (closed.has(nk) || isBlocked(nx, ny, objects)) continue;
        // pas de passage en diagonale entre deux obstacles
        if (dx && dy && isBlocked(cur.x + dx, cur.y, objects) && isBlocked(cur.x, cur.y + dy, objects)) continue;
        const g = cur.g + (dx && dy ? Math.SQRT2 : 1);
        if (g < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, g);
          came.set(nk, { x: cur.x, y: cur.y });
          open.push({ x: nx, y: ny, g, f: g + h(nx, ny) });
        }
      }
    }
    return null;
  }

  return { WORLD_SIZE, MIN_COORD, MAX_COORD, BIOME_SCALE, seededRandom, smoothNoise, hillNoise, getBiome, isOnRiver, isOnLake, isOnMountainRange, computeTerrainType, getTerrainType, BLOCKED, WATER, inWorld, isBlocked, findPath, _cache: cache };
});
