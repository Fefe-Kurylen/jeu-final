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

  // Biomes du GDD (world_config.map.biomes, décision du 25 octobre 2026) : le nord est enneigé, le sud désertique, le reste
  // tempéré ('forest'). Nord et sud se lisent sur l'écran isométrique : le haut de la carte est le côté où x + y est petit.
  // La frontière ondule (bruit) pour un tracé naturel ; environ 20 % de neige, 20 % de désert, 60 % de tempéré.
  const BIOME_EDGE = 138;     // |x + y| au-delà duquel commence la neige (nord) ou le désert (sud)
  const BIOME_WOBBLE = 45;    // amplitude de l'ondulation de la frontière (cases)
  const latitudeAt = (x, y) => x + y + (smoothNoise(x, y, 77777) - 0.5) * 2 * BIOME_WOBBLE + (valueNoise(x, y, 77001, 11) - 0.5) * 24;
  function getBiome(x, y) {
    const latitude = latitudeAt(x, y);
    if (latitude < -BIOME_EDGE) return 'snow';
    if (latitude > BIOME_EDGE) return 'desert';
    return 'forest';
  }

  // Rivières (décision du 25 octobre 2026, carte de référence) : de longues rivières continues qui serpentent sur deux
  // cases de large ; on les traverse aux ponts (vitesse normale) et aux gués (moitié moins vite), placés au hasard le long
  // de chaque rivière. Tracé déterministe, calculé une fois au chargement.
  const RIVER_SOURCES = [
    { sx: -170, sy: -40, dir: 0.05, length: 230 }, { sx: -30, sy: -175, dir: 0.47, length: 220 },
    { sx: 60, sy: -170, dir: 0.62, length: 200 }, { sx: -175, sy: 70, dir: -0.08, length: 210 },
    { sx: 170, sy: -90, dir: 0.92, length: 190 }, { sx: 10, sy: 175, dir: -0.55, length: 170 },
    { sx: 175, sy: 60, dir: 1.08, length: 160 }, { sx: -110, sy: 175, dir: -0.35, length: 150 }
  ];
  const RIVER_HALF_WIDTH = 0.95;      // ~2 cases de large
  const CROSSING_GAP = [12, 40];      // écart aléatoire entre deux passages (cases de rivière)
  const riverTiles = new Map();       // "x,y" -> 'river' | 'bridge' | 'ford'
  const crossingAxis = new Map();     // "x,y" -> 'x' | 'y' : sens du pont ou du gué (de rive à rive)
  const crossings = [];               // { cells, ends } : chaque passage et ses deux cases de rive
  (function traceRivers() {
    for (let r = 0; r < RIVER_SOURCES.length; r++) {
      const src = RIVER_SOURCES[r];
      let rx = src.sx, ry = src.sy, dir = src.dir;
      const pts = [];
      for (let i = 0; i < src.length; i++) {
        pts.push([rx, ry]);
        rx += Math.cos(dir * Math.PI); ry += Math.sin(dir * Math.PI);
        // méandres : la direction dérive lentement, avec une légère attraction vers la direction de départ
        dir += (valueNoise(i, r * 31, 11111 + r, 6) - 0.5) * 0.16 + (src.dir - dir) * 0.02;
        if (rx < MIN_COORD - 2 || rx > MAX_COORD + 2 || ry < MIN_COORD - 2 || ry > MAX_COORD + 2) break;
      }
      for (const [px, py] of pts) {
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
          const tx = Math.round(px) + dx, ty = Math.round(py) + dy;
          if (Math.hypot(tx - px, ty - py) <= RIVER_HALF_WIDTH + 0.3 && !riverTiles.has(tx + ',' + ty)) riverTiles.set(tx + ',' + ty, 'river');
        }
      }
      // passages au hasard le long de la rivière : un pont ou un gué, une rangée de cases d'une rive à l'autre, dans l'axe
      // de la grille le plus en travers du courant (axe x ou y : les images de ponts et de gués suivent la grille)
      let next = CROSSING_GAP[0] + Math.floor(seededRandom(r, 0, 9191) * (CROSSING_GAP[1] - CROSSING_GAP[0]));
      for (let i = next, n = 1; i < pts.length - 2; i += next, n++) {
        const kind = seededRandom(r, n, 8181) < 0.55 ? 'bridge' : 'ford';
        const [px, py] = pts[i], [qx, qy] = pts[i + 1];
        const axis = Math.abs(qx - px) >= Math.abs(qy - py) ? 'y' : 'x';
        const cx = Math.round(px), cy = Math.round(py);
        const at = (t) => (axis === 'y' ? [cx, cy + t] : [cx + t, cy]);
        const wet = (t) => { const [x, y] = at(t); return riverTiles.get(x + ',' + y) === 'river'; };
        next = CROSSING_GAP[0] + Math.floor(seededRandom(r, n, 9191) * (CROSSING_GAP[1] - CROSSING_GAP[0]));
        if (!wet(0)) continue;
        let a = 0, b = 0;
        while (a > -5 && wet(a - 1)) a--;
        while (b < 5 && wet(b + 1)) b++;
        if (a <= -5 || b >= 5) continue;   // pas de rive en vue (confluent) : pas de passage ici
        const cells = [];
        for (let t = a; t <= b; t++) { const [x, y] = at(t); riverTiles.set(x + ',' + y, kind); crossingAxis.set(x + ',' + y, axis); cells.push([x, y]); }
        crossings.push({ cells, ends: [at(a - 1), at(b + 1)] });   // rives vérifiées plus bas (montagnes et lacs pas encore définis)
      }
    }
  })();
  const riverAt = (x, y) => riverTiles.get(x + ',' + y) || null;
  const crossingAxisAt = (x, y) => crossingAxis.get(x + ',' + y) || null;
  function isOnRiver(x, y) { return riverTiles.has(x + ',' + y); }

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

  // Massifs forestiers (carte de référence) : des taches denses de plusieurs cases plutôt que des arbres isolés
  const FOREST_SCALE = 6;
  const forestNoise = (x, y) => valueNoise(x, y, 60606, FOREST_SCALE) * 0.8 + seededRandom(x, y, 60607) * 0.2;

  // Type de terrain d'une case : { biome, feature, isMultiTile }
  //   river / bridge / ford : rivière (infranchissable), pont (vitesse normale), gué (moitié moins vite)
  //   mountain / icemountain : chaînes de montagnes ; boulders : amas de rochers (tempéré) ; tree / snowtree : forêt
  function computeTerrainType(x, y) {
    const biome = getBiome(x, y);
    const noise = seededRandom(x, y);
    const noise2 = seededRandom(x * 2, y * 2, 54321);
    const hills = hillNoise(x, y);
    const river = riverAt(x, y);
    if (river) return { biome, feature: river, isMultiTile: true };
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
    const forest = forestNoise(x, y);
    if (biome === 'forest') {
      if (hills > 0.72 && noise > 0.5) return { biome, feature: 'boulders' };
      if (hills > 0.66 && noise > 0.85) return { biome, feature: 'boulders' };
      if (forest > 0.60) return { biome, feature: 'tree' };
      if (noise < 0.01) return { biome, feature: 'water' };
    } else if (biome === 'desert') {
      if (noise > 0.95) return { biome, feature: 'ruins' };
      if (hills > 0.7 && noise > 0.5) return { biome, feature: 'dunes' };
      if (noise > 0.88 && noise2 > 0.5) return { biome, feature: 'rocks' };
      if (noise > 0.8 && noise2 > 0.6) return { biome, feature: 'dunes' };
      if (noise < 0.03) return { biome, feature: 'oasis' };
    } else if (biome === 'snow') {
      if (hills > 0.72 && noise > 0.5) return { biome, feature: 'icemountain' };
      if (hills > 0.66 && noise > 0.85) return { biome, feature: 'icemountain' };
      if (forest > 0.62) return { biome, feature: 'snowtree' };
      if (noise < 0.02) return { biome, feature: 'frozen' };
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

  // Sol d'une case pour le dessin de la carte (carte de référence) : 'water' | 'ice' | 'sand' | 'earth' | 'drygrass' |
  // 'grass' | 'snow'. L'eau gèle en zone enneigée ; en zone tempérée, berges de sable au bord de l'eau, taches d'herbe sèche
  // (plus nombreuses en approchant du désert) et de terre labourée. Le relief et la forêt sont posés par-dessus.
  const GROUND_LAYERS = ['water', 'ice', 'sand', 'earth', 'drygrass', 'grass', 'snow'];   // de la couche la plus basse à la plus haute
  const WET = { water: 1, frozen: 1, oasis: 1, river: 1, bridge: 1, ford: 1 };
  function computeGround(x, y) {
    const t = getTerrainType(x, y);
    if (WET[t.feature]) return t.biome === 'snow' ? 'ice' : 'water';
    if (t.biome === 'snow') return 'snow';
    if (t.biome === 'desert') return 'sand';
    let shore = false;
    // berges de sable au bord des rivières et des lacs (pas autour des mares d'une case)
    for (let dy = -1; dy <= 1 && !shore; dy++) for (let dx = -1; dx <= 1; dx++) { const n = (dx || dy) && getTerrainType(x + dx, y + dy); if (n && WET[n.feature] && (n.isMultiTile || n.feature !== 'water')) { shore = true; break; } }
    if (shore && seededRandom(x, y, 70707) < 0.8) return 'sand';
    const towardDesert = Math.max(0, Math.min(1, (latitudeAt(x, y) - (BIOME_EDGE - 40)) / 40));   // 0 loin du désert, 1 à sa lisière
    if (valueNoise(x, y, 71717, 9) * 0.85 + seededRandom(x, y, 71718) * 0.15 > 0.7 - towardDesert * 0.45) return 'drygrass';
    if (!t.feature && valueNoise(x, y, 72727, 5) > 0.74) return 'earth';
    return 'grass';
  }
  const groundCache = new Map();
  function groundAt(x, y) {
    const k = x + ',' + y;
    let g = groundCache.get(k);
    if (g) return g;
    g = computeGround(x, y);
    if (groundCache.size > 250000) groundCache.clear();
    groundCache.set(k, g);
    return g;
  }

  // Cases infranchissables par une armée : montagnes et eau (y compris l'oasis d'eau du désert et les lacs gelés).
  // Une case portant une ville ou un point de ressource, ou voisine d'une ville, est toujours franchissable
  // (le relief n'y est pas dessiné non plus).
  const BLOCKED = { mountain: 1, icemountain: 1, boulders: 1, water: 1, frozen: 1, oasis: 1, river: 1 };
  const WATER = { water: 1, frozen: 1, oasis: 1, river: 1 };
  const FOREST = { tree: 1, snowtree: 1 };
  // Coût de marche d'une case (1 = normal) : gué moitié moins vite ; forêt −10 % de vitesse sauf pour les Gaulois (GDD
  // world_config.map.forests). opts.faction : la civilisation de l'armée.
  const FORD_COST = 2, FOREST_COST = 1 / 0.9;
  function moveCost(x, y, objects, opts) {
    if (objects && isObjectCell(objects, x, y)) return 1;
    const f = getTerrainType(x, y).feature;
    if (f === 'ford') return FORD_COST;
    if (FOREST[f] && String(opts?.faction || '').toUpperCase() !== 'GAUL') return FOREST_COST;
    return 1;
  }
  function inWorld(x, y) { return x >= MIN_COORD && x <= MAX_COORD && y >= MIN_COORD && y <= MAX_COORD; }
  // Une ville occupe 2 × 2 cases (décision du 25 octobre 2026) : sa case (x, y) et les cases (x+1, y), (x, y+1), (x+1, y+1),
  // c'est-à-dire le losange de 2 × 2 sous sa case sur l'écran isométrique
  const CITY_FOOTPRINT = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const cityCells = (x, y) => CITY_FOOTPRINT.map(([dx, dy]) => [x + dx, y + dy]);
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

  // Un passage doit déboucher des deux côtés sur une case où l'on marche (pas une montagne, des rochers ou un lac) ; sinon
  // ce n'est plus qu'une rivière
  for (const c of crossings) {
    if (c.ends.every(([x, y]) => inWorld(x, y) && !BLOCKED[computeTerrainType(x, y).feature])) continue;
    for (const [x, y] of c.cells) { riverTiles.set(x + ',' + y, 'river'); crossingAxis.delete(x + ',' + y); }
  }
  cache.clear();

  // Terre ferme principale : la plus grande région d'un seul tenant où l'on peut marcher (calculée une fois, à la première
  // demande). Les petites poches fermées par les montagnes et l'eau n'en font pas partie : pas de ville ni de point de
  // ressource qu'aucune armée ne pourrait atteindre.
  let mainland = null;
  function computeMainland() {
    const N = WORLD_SIZE, label = new Int32Array(N * N).fill(-1), at = (x, y) => (y - MIN_COORD) * N + (x - MIN_COORD);
    const sizes = [];
    for (let y = MIN_COORD; y <= MAX_COORD; y++) for (let x = MIN_COORD; x <= MAX_COORD; x++) {
      if (label[at(x, y)] >= 0 || isBlocked(x, y)) continue;
      const c = sizes.length, stack = [x, y];
      let size = 0;
      label[at(x, y)] = c;
      while (stack.length) {
        const b = stack.pop(), a = stack.pop();
        size++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = a + dx, ny = b + dy;
          if (!inWorld(nx, ny) || label[at(nx, ny)] >= 0 || isBlocked(nx, ny)) continue;
          if (dx && dy && isBlocked(a + dx, b) && isBlocked(a, b + dy)) continue;
          label[at(nx, ny)] = c;
          stack.push(nx, ny);
        }
      }
      sizes.push(size);
    }
    const main = sizes.indexOf(Math.max(...sizes));
    const out = new Uint8Array(N * N);
    for (let i = 0; i < out.length; i++) out[i] = label[i] === main ? 1 : 0;
    return out;
  }
  function isMainland(x, y) {
    if (!inWorld(x, y)) return false;
    if (!mainland) mainland = computeMainland();
    return mainland[(y - MIN_COORD) * WORLD_SIZE + (x - MIN_COORD)] === 1;
  }

  // Chemin le plus rapide (A*, 8 voisins, diagonale = racine de 2, pas de coupe de coin entre deux obstacles), le pas étant
  // pondéré par le coût de marche de la case d'arrivée (gués, forêts). Renvoie { path: [[x, y], ...], length } — length est
  // la longueur « en cases normales », qui fait la durée du trajet — ou null si la destination est inaccessible.
  function findPath(fromX, fromY, toX, toY, objects, maxExpansions = 40000, opts = null) {
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
        const g = cur.g + (dx && dy ? Math.SQRT2 : 1) * moveCost(nx, ny, objects, opts);
        if (g < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, g);
          came.set(nk, { x: cur.x, y: cur.y });
          open.push({ x: nx, y: ny, g, f: g + h(nx, ny) });
        }
      }
    }
    return null;
  }

  return { CITY_FOOTPRINT, cityCells, GROUND_LAYERS, groundAt, valueNoise, WORLD_SIZE, MIN_COORD, MAX_COORD, BIOME_SCALE, seededRandom, smoothNoise, hillNoise, getBiome, isOnRiver, riverAt, crossingAxisAt, isOnLake, isOnMountainRange, computeTerrainType, getTerrainType, BLOCKED, WATER, FOREST, moveCost, FORD_COST, FOREST_COST, inWorld, isBlocked, isMainland, findPath, _cache: cache };
});
