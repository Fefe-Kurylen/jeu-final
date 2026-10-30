// ============================================================
// Terrain procédural partagé par le client (carte, scène de la ville) et le serveur (chemins des armées,
// positions de départ). Le même code tourne des deux côtés : toute modification ici change la carte pour
// tout le monde. Chargé comme script global (window.Terrain) et comme module CommonJS (require).
//
// Chaque serveur a sa carte, tirée au hasard à sa création (décision du 26 octobre 2026) : tout le terrain se
// déduit de la graine du monde (setWorldSeed), que le serveur garde en base et publie dans /api/world/info.
// Graine 0 = la carte de référence du 25 octobre 2026, gardée telle quelle pour le serveur déjà ouvert.
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Terrain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Version du terrain : à augmenter à chaque changement de la génération OU des règles de passage et de coût (isBlocked,
  // moveCost, findPath, cases des villes) ; le serveur la publie dans /api/world/info, une version du jeu qui embarque un
  // autre terrain se recharge ou demande sa mise à jour. 2 = carte de référence du 25 octobre 2026 ; 3 = carte tirée de la
  // graine du serveur (la graine 0 redonne exactement la carte 2).
  const TERRAIN_VERSION = 3;
  // Générateur d'une carte : la version du terrain qui l'a tirée, gardée en base avec la graine (WorldConfig.generator).
  // 2 = la carte de référence (graine 0) ; 3 = les cartes tirées au hasard. Une future façon de générer les cartes prendra
  // le numéro 4 sans toucher aux mondes déjà ouverts : chaque monde garde le générateur qui a fait sa carte. C'est aussi la
  // plus ancienne version du terrain qui la dessine à l'identique (un client plus ancien se met à jour).
  const generatorFor = (seed) => (seed ? 3 : 2);
  const canDraw = (seed, generator) => generator === generatorFor(seed);
  const WORLD_SIZE = 374;
  const MIN_COORD = -Math.floor(WORLD_SIZE / 2);          // -187
  const MAX_COORD = MIN_COORD + WORLD_SIZE - 1;           // +186
  const BIOME_SCALE = 36;   // taille caractéristique d'une tache de biome (cases)
  const HILL_SCALE = 7;     // régions de collines où les montagnes se regroupent

  // ---- graine du monde ----
  // WORLD_SEED : entier de 0 à 2 147 483 646 ; NOISE_OFFSET : décalage ajouté à toutes les graines de bruit (0 pour la
  // graine 0, d'où la carte de référence intacte) ; epoch : augmente à chaque changement de graine (les caches du client
  // qui gardent du terrain s'y fient pour se vider).
  let WORLD_SEED = 0, NOISE_OFFSET = 0, epoch = 0;
  const MAX_SEED = 2147483646;
  const normalizeSeed = (seed) => { const n = Math.trunc(Number(seed)); return Number.isFinite(n) ? Math.abs(n) % (MAX_SEED + 1) : 0; };
  // hachage entier (graine -> 32 bits bien mélangés) et générateur pseudo-aléatoire (mulberry32) pour tirer la disposition
  function hash32(n) { let h = (n ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; return (h ^ (h >>> 16)) >>> 0; }
  function mulberry32(a) { return function () { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // Bruit de la carte de référence (graine 0) : sinus, gardé tel quel pour que sa carte ne bouge pas
  function sinRandom(x, y, seed) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
  }
  // Bruit des cartes tirées au hasard : hachage entier, au bit près le même sur tous les moteurs JavaScript (le serveur Node
  // et le téléphone doivent voir exactement la même carte ; Math.sin peut différer d'un moteur à l'autre au dernier bit)
  let WORLD_MIX = 0;
  function intRandom(x, y, seed) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((seed | 0) ^ WORLD_MIX, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // bruit du monde, de 0 à 1 ; avec une graine autre que 0, chaque graine de bruit change selon la graine du monde (les
  // coordonnées non entières, celles du décor dessiné à l'écran, gardent le sinus décalé)
  function seededRandom(x, y, seed = 12345) {
    if (WORLD_SEED !== 0 && Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(seed)) return intRandom(x, y, seed);
    return sinRandom(x, y, seed + NOISE_OFFSET);
  }
  // sin(π d) et cos(π d) par l'arithmétique de base seulement (même résultat partout), pour le tracé des cartes au hasard
  function sinPi(d) {
    let t = d - 2 * Math.floor((d + 1) / 2);   // dans [-1, 1)
    if (t > 0.5) t = 1 - t; else if (t < -0.5) t = -1 - t;
    const z = t * Math.PI, z2 = z * z;
    return z * (1 + z2 * (-1 / 6 + z2 * (1 / 120 + z2 * (-1 / 5040 + z2 * (1 / 362880 + z2 * (-1 / 39916800 + z2 * (1 / 6227020800 + z2 * (-1 / 1307674368000))))))));
  }
  const cosPi = (d) => sinPi(d + 0.5);

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
  // de chaque rivière. Tracé déterministe, recalculé à chaque changement de graine (buildLayout).
  // Disposition de la carte de référence (graine 0) ; les autres graines tirent la leur (randomLayout)
  const LEGACY_RIVERS = [
    { sx: -170, sy: -40, dir: 0.05, length: 230 }, { sx: -30, sy: -175, dir: 0.47, length: 220 },
    { sx: 60, sy: -170, dir: 0.62, length: 200 }, { sx: -175, sy: 70, dir: -0.08, length: 210 },
    { sx: 170, sy: -90, dir: 0.92, length: 190 }, { sx: 10, sy: 175, dir: -0.55, length: 170 },
    { sx: 175, sy: 60, dir: 1.08, length: 160 }, { sx: -110, sy: 175, dir: -0.35, length: 150 }
  ];
  const RIVER_HALF_WIDTH = 0.95;      // ~2 cases de large
  const CROSSING_GAP = [12, 40];      // écart aléatoire entre deux passages (cases de rivière)
  const riverTiles = new Map();       // "x,y" -> 'river' | 'bridge' | 'ford'
  const crossingAxis = new Map();     // "x,y" -> 'x' | 'y' : sens du pont ou du gué (de rive à rive)
  const crossings = [];               // { cells, ends, river } : chaque passage et ses deux cases de rive
  let RIVER_SOURCES = LEGACY_RIVERS, LAKES = null, RANGES = null;   // disposition en cours (setWorldSeed)
  // Le cours de la rivière r depuis sa source (dir en unités de π)
  function riverPath(src, r) {
    let rx = src.sx, ry = src.sy, dir = src.dir;
    const exact = WORLD_SEED !== 0;   // cartes au hasard : trigonométrie identique sur tous les moteurs
    const pts = [];
    for (let i = 0; i < src.length; i++) {
      pts.push([rx, ry]);
      if (exact) { rx += cosPi(dir); ry += sinPi(dir); } else { rx += Math.cos(dir * Math.PI); ry += Math.sin(dir * Math.PI); }
      // méandres : la direction dérive lentement, avec une légère attraction vers la direction de départ
      dir += (valueNoise(i, r * 31, 11111 + r + (src.meander || 0), 6) - 0.5) * 0.16 + (src.dir - dir) * 0.02;   // meander : tirage du méandre (cartes au hasard)
      if (rx < MIN_COORD - 2 || rx > MAX_COORD + 2 || ry < MIN_COORD - 2 || ry > MAX_COORD + 2) break;
    }
    return pts;
  }
  function traceRivers() {
    riverTiles.clear(); crossingAxis.clear(); crossings.length = 0;
    const seeded = WORLD_SEED !== 0;
    for (let r = 0; r < RIVER_SOURCES.length; r++) {
      const src = RIVER_SOURCES[r];
      const pts = riverPath(src, r);
      for (const [px, py] of pts) {
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
          const tx = Math.round(px) + dx, ty = Math.round(py) + dy;
          const d = seeded ? Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py)) : Math.hypot(tx - px, ty - py);
          if (d <= RIVER_HALF_WIDTH + 0.3 && !riverTiles.has(tx + ',' + ty)) riverTiles.set(tx + ',' + ty, 'river');
        }
      }
      // passages au hasard le long de la rivière : un pont ou un gué, une rangée de cases d'une rive à l'autre, dans l'axe
      // de la grille le plus en travers du courant (axe x ou y : les images de ponts et de gués suivent la grille)
      // Sur une carte tirée au hasard, un passage qui tomberait mal (confluent, rive bloquée par le relief ou hors du monde)
      // est cherché un peu plus loin le long de la rivière plutôt qu'abandonné ; la carte de référence garde son tirage.
      const tryCrossing = (i, kind) => {
        const [px, py] = pts[i], [qx, qy] = pts[i + 1];
        const axis = Math.abs(qx - px) >= Math.abs(qy - py) ? 'y' : 'x';
        const cx = Math.round(px), cy = Math.round(py);
        const at = (t) => (axis === 'y' ? [cx, cy + t] : [cx + t, cy]);
        const wet = (t) => { const [x, y] = at(t); return riverTiles.get(x + ',' + y) === 'river'; };
        if (!wet(0)) return false;
        let a = 0, b = 0;
        while (a > -5 && wet(a - 1)) a--;
        while (b < 5 && wet(b + 1)) b++;
        if (a <= -5 || b >= 5) return false;   // pas de rive en vue (confluent) : pas de passage ici
        const ends = [at(a - 1), at(b + 1)];
        if (seeded && !ends.every(([x, y]) => inWorld(x, y) && !BLOCKED[computeTerrainType(x, y).feature])) return false;
        const cells = [];
        for (let t = a; t <= b; t++) { const [x, y] = at(t); riverTiles.set(x + ',' + y, kind); crossingAxis.set(x + ',' + y, axis); cells.push([x, y]); }
        crossings.push({ cells, ends, river: r });   // rives vérifiées ensuite (validateCrossings)
        return true;
      };
      let next = CROSSING_GAP[0] + Math.floor(seededRandom(r, 0, 9191) * (CROSSING_GAP[1] - CROSSING_GAP[0]));
      for (let i = next, n = 1; i < pts.length - 2; i += next, n++) {
        const kind = seededRandom(r, n, 8181) < 0.55 ? 'bridge' : 'ford';
        next = CROSSING_GAP[0] + Math.floor(seededRandom(r, n, 9191) * (CROSSING_GAP[1] - CROSSING_GAP[0]));
        if (tryCrossing(i, kind) || !seeded) continue;
        for (let k = 1; k <= 10 && i + k < pts.length - 2; k++) if (tryCrossing(i + k, kind)) { i += k; break; }
      }
    }
  }
  const riverAt = (x, y) => riverTiles.get(x + ',' + y) || null;
  const crossingAxisAt = (x, y) => crossingAxis.get(x + ',' + y) || null;

  // Lacs (disques irréguliers)
  const LEGACY_LAKES = [
    { cx: -60, cy: -30, radius: 8 }, { cx: 80, cy: -70, radius: 6 }, { cx: -90, cy: 60, radius: 10 },
    { cx: 40, cy: 90, radius: 7 }, { cx: 100, cy: -20, radius: 5 }, { cx: -20, cy: -100, radius: 9 }
  ];
  function isOnLake(x, y) {
    for (const lake of LAKES) {
      const dist = Math.sqrt((x - lake.cx) * (x - lake.cx) + (y - lake.cy) * (y - lake.cy));
      const irregularity = seededRandom(x, y, 22222) * 3;
      if (dist < lake.radius + irregularity - 2) return true;
    }
    return false;
  }

  // Chaînes de montagnes (segments épais)
  const LEGACY_RANGES = [
    { sx: -150, sy: 0, ex: -50, ey: -80, width: 4 }, { sx: 50, sy: -150, ex: 100, ey: -50, width: 3 },
    { sx: -100, sy: 100, ex: 0, ey: 150, width: 5 }, { sx: 80, sy: 50, ex: 150, ey: 100, width: 4 }
  ];
  function isOnMountainRange(x, y) {
    for (const range of RANGES) {
      const dx = range.ex - range.sx, dy = range.ey - range.sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const t = Math.max(0, Math.min(1, ((x - range.sx) * dx + (y - range.sy) * dy) / (len * len)));
      const nearX = range.sx + t * dx, nearY = range.sy + t * dy;
      const dist = Math.sqrt((x - nearX) * (x - nearX) + (y - nearY) * (y - nearY));
      const widthVar = seededRandom(x, y, 33333) * 2;
      if (dist < range.width + widthVar) return true;
    }
    return false;
  }

  // Disposition tirée au hasard d'une graine (toute graine sauf 0) : autant de rivières, de lacs et de chaînes que sur la
  // carte de référence, de tailles comparables, répartis sur tout le monde. Les rivières partent d'un bord vers l'intérieur,
  // lacs et chaînes sont tenus à distance les uns des autres ; les biomes gardent leur place (neige au nord, désert au sud).
  function randomLayout(seed) {
    const rng = mulberry32(hash32(seed));
    const pick = (a, b) => a + rng() * (b - a);
    const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));   // racine exacte partout
    const E = MAX_COORD - 12;   // les sources, juste à l'intérieur du bord
    const rivers = [];
    // cours déjà tracés, rangés par carrés de 4 cases : une case est « près d'une rivière » à 4 cases au plus
    const riverBuckets = new Map();
    const nearRiver = (x, y) => {
      const bx = Math.floor(x / 4), by = Math.floor(y / 4);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const b = riverBuckets.get((bx + dx) + ',' + (by + dy));
        if (b) for (let i = 0; i < b.length; i += 2) if ((b[i] - x) * (b[i] - x) + (b[i + 1] - y) * (b[i + 1] - y) <= 16) return true;
      }
      return false;
    };
    // comme sur la carte de référence : deux sources par bord du monde, dans un ordre tiré au hasard
    const sides = [0, 1, 2, 3, 0, 1, 2, 3];
    for (let i = sides.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [sides[i], sides[j]] = [sides[j], sides[i]]; }
    for (let tries = 0; rivers.length < LEGACY_RIVERS.length && tries < 400; tries++) {
      const side = sides[rivers.length], u = pick(-0.88, 0.88), along = u * E;
      const [sx, sy] = side === 0 ? [-E, along] : side === 1 ? [E, along] : side === 2 ? [along, -E] : [along, E];
      if (rivers.some(o => dist(o.sx, o.sy, sx, sy) < 60)) continue;
      // vers l'intérieur (en unités de π, comme dir : 0 = +x, 1 = −x, 0,5 = +y, −0,5 = −y), penchée vers le centre selon la
      // place de la source le long du bord, à ±0,2 π près
      const inward = side === 0 ? -u * 0.25 : side === 1 ? 1 + u * 0.25 : side === 2 ? 0.5 + u * 0.25 : -0.5 - u * 0.25;
      const cand = { sx: Math.round(sx), sy: Math.round(sy), dir: Math.round((inward + pick(-0.2, 0.2)) * 100) / 100, length: Math.round(pick(150, 230)), meander: 1 + Math.floor(rng() * 997) * 13 };
      // une rivière qui ressort vite du monde ou longe le bord est redessinée
      const pts = riverPath(cand, rivers.length);
      const nearEdge = pts.filter(([x, y]) => Math.min(x - MIN_COORD, MAX_COORD - x, y - MIN_COORD, MAX_COORD - y) < 14).length;
      if (pts.length < 120 || nearEdge > pts.length * 0.2) continue;
      // une rivière peut en rejoindre une autre (un confluent), pas la croiser ni la longer à plusieurs reprises
      let entries = 0, inside = false;
      for (const [x, y] of pts) {
        const near = nearRiver(x, y);
        if (near && !inside) entries++;
        inside = near;
      }
      if (entries > 1) continue;
      rivers.push(cand);
      for (const [x, y] of pts) { const k = Math.floor(x / 4) + ',' + Math.floor(y / 4); let b = riverBuckets.get(k); if (!b) riverBuckets.set(k, b = []); b.push(x, y); }
    }
    const lakes = [];
    for (let tries = 0; lakes.length < LEGACY_LAKES.length && tries < 400; tries++) {
      const cx = Math.round(pick(-135, 135)), cy = Math.round(pick(-135, 135));
      if (lakes.some(o => dist(o.cx, o.cy, cx, cy) < 50)) continue;
      lakes.push({ cx, cy, radius: Math.round(pick(5, 10.99)) });
    }
    // distance entre deux segments (chaînes) : 0 s'ils se croisent, sinon la plus courte des distances bout-segment
    const pointSeg = (px, py, s) => { const dx = s.ex - s.sx, dy = s.ey - s.sy, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((px - s.sx) * dx + (py - s.sy) * dy) / L)) : 0; return dist(px, py, s.sx + t * dx, s.sy + t * dy); };
    const side = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));   // coordonnées entières : exact
    const segDist = (a, b) => (side(a.sx, a.sy, a.ex, a.ey, b.sx, b.sy) * side(a.sx, a.sy, a.ex, a.ey, b.ex, b.ey) < 0 && side(b.sx, b.sy, b.ex, b.ey, a.sx, a.sy) * side(b.sx, b.sy, b.ex, b.ey, a.ex, a.ey) < 0)
      ? 0 : Math.min(pointSeg(a.sx, a.sy, b), pointSeg(a.ex, a.ey, b), pointSeg(b.sx, b.sy, a), pointSeg(b.ex, b.ey, a));
    const ranges = [];
    for (let tries = 0; ranges.length < LEGACY_RANGES.length && tries < 400; tries++) {
      const mx = pick(-120, 120), my = pick(-120, 120), ang = rng(), half = pick(45, 65);   // ang en unités de π
      const clamp = (v) => Math.max(MIN_COORD + 8, Math.min(MAX_COORD - 8, Math.round(v)));
      const cand = { sx: clamp(mx - cosPi(ang) * half), sy: clamp(my - sinPi(ang) * half), ex: clamp(mx + cosPi(ang) * half), ey: clamp(my + sinPi(ang) * half), width: 3 + Math.floor(rng() * 3) };
      // deux chaînes ne se touchent pas : un mur d'un seul tenant ou une vallée en cul-de-sac couperait la carte
      if (ranges.some(o => segDist(cand, o) < cand.width + o.width + 12)) continue;
      ranges.push(cand);
    }
    return { rivers, lakes, ranges };
  }

  // Massifs forestiers (carte de référence) : des taches denses de plusieurs cases plutôt que des arbres isolés
  const FOREST_SCALE = 6;
  const forestNoise = (x, y) => valueNoise(x, y, 60606, FOREST_SCALE) * 0.8 + seededRandom(x, y, 60607) * 0.2;

  // Type de terrain d'une case : { biome, feature, isMultiTile }
  //   river / bridge / ford : rivière (infranchissable), pont (vitesse normale), gué (moitié moins vite)
  //   mountain / icemountain / mesa : chaînes de montagnes (tempéré, neige, désert) ; boulders : amas de rochers (tempéré) ;
  //   rocks : rochers épars du désert (franchissables) ; tree / snowtree : forêt
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
      if (biome === 'desert') return { biome, feature: 'mesa', isMultiTile: true };   // chaîne de mesas : infranchissable (décision du 25 octobre 2026)
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
  // Plusieurs textures par sol (plusieurs prairies, plusieurs neiges…) : la variante change par taches irrégulières de
  // quelques cases, et le jeu fond les variantes entre elles comme deux sols voisins. Rendu seulement, sans effet de jeu.
  const GROUND_VARIANTS = { water: 2, ice: 2, sand: 3, earth: 3, drygrass: 3, grass: 4, snow: 3 };
  const variantCache = new Map();
  function groundVariantAt(x, y) {
    const k = x + ',' + y;
    let v = variantCache.get(k);
    if (v) return v;
    const g = groundAt(x, y), n = GROUND_VARIANTS[g] || 1;
    const wx = x + (valueNoise(x, y, 74001, 5) - 0.5) * 8, wy = y + (valueNoise(x, y, 74002, 5) - 0.5) * 8;   // bords irréguliers
    v = 1 + Math.floor(seededRandom(Math.floor(wx / 7), Math.floor(wy / 7), 74003 + GROUND_LAYERS.indexOf(g)) * n);
    if (variantCache.size > 250000) variantCache.clear();
    variantCache.set(k, v);
    return v;
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

  // Cases infranchissables par une armée : montagnes (mesas du désert comprises), amas de rochers et eau (y compris l'oasis d'eau du désert et les lacs gelés).
  // Une case portant une ville ou un point de ressource, ou voisine d'une ville, est toujours franchissable
  // (le relief n'y est pas dessiné non plus).
  const BLOCKED = { mountain: 1, icemountain: 1, mesa: 1, boulders: 1, water: 1, frozen: 1, oasis: 1, river: 1 };
  const WATER = { water: 1, frozen: 1, oasis: 1, river: 1 };
  const FOREST = { tree: 1, snowtree: 1 };
  // Coût de marche d'une case (1 = normal) : gué moitié moins vite ; forêt −10 % de vitesse sauf pour les Gaulois (GDD
  // world_config.map.forests). opts.faction : la civilisation de l'armée.
  const FORD_COST = 2, FOREST_COST = 1 / 0.9;
  function moveCost(x, y, objects, opts) {
    if (objects && objects.has(x + ',' + y)) return 1;   // la case d'une ville ou d'un point ; sa couronne garde le coût du terrain
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
  // La couronne autour d'une ville reste praticable (on sort toujours de chez soi), sauf au-dessus de l'eau : deux villes
  // face à face ne font pas un pont sur une rivière
  function isBlocked(x, y, objects) {
    if (!inWorld(x, y)) return true;
    const f = getTerrainType(x, y).feature;
    if (objects && objects.has(x + ',' + y)) return false;
    if (isObjectCell(objects, x, y)) return !!WATER[f];
    return !!BLOCKED[f];
  }

  // Un passage doit déboucher des deux côtés sur une case où l'on marche (pas une montagne, des rochers ou un lac) ; sinon
  // ce n'est plus qu'une rivière
  function validateCrossings() {
    for (let i = crossings.length - 1; i >= 0; i--) {
      const c = crossings[i];
      if (c.ends.every(([x, y]) => inWorld(x, y) && !BLOCKED[computeTerrainType(x, y).feature])) continue;
      for (const [x, y] of c.cells) { riverTiles.set(x + ',' + y, 'river'); crossingAxis.delete(x + ',' + y); }
      crossings.splice(i, 1);
    }
  }

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

  // Change de carte : toute la disposition et tous les caches sont refaits pour la graine donnée. Le serveur l'appelle au
  // démarrage avec la graine gardée en base, le client dès qu'il connaît celle du serveur (avant de dessiner la carte).
  // Renvoie true si la carte a changé.
  function setWorldSeed(seed, generator) {
    const s = normalizeSeed(seed);
    // une carte faite par un autre générateur que ceux que ce code sait refaire : refusée (elle ne serait pas la même)
    if (generator !== undefined && generator !== null && !canDraw(s, Number(generator))) throw new Error(`carte de la graine ${s} faite par le générateur ${generator} : ce code ne sait dessiner que le générateur ${generatorFor(s)}`);
    if (s === WORLD_SEED && LAKES) return false;
    WORLD_SEED = s;
    NOISE_OFFSET = s ? 1000 + (hash32(s) % 49000) : 0;
    WORLD_MIX = s ? hash32(s ^ 0x5bd1e995) | 0 : 0;
    const L = s ? randomLayout(s) : { rivers: LEGACY_RIVERS, lakes: LEGACY_LAKES, ranges: LEGACY_RANGES };
    RIVER_SOURCES = L.rivers; LAKES = L.lakes; RANGES = L.ranges;
    cache.clear(); groundCache.clear(); variantCache.clear(); mainland = null;
    traceRivers();
    validateCrossings();
    cache.clear();
    signatureCache = null;
    epoch++;
    return true;
  }

  // Empreinte de la carte (graine, générateur, disposition, chaque case des passages) : le serveur la publie, le client
  // compare la sienne ; deux empreintes différentes = deux cartes différentes (version ou moteur JavaScript différent)
  let signatureCache = null;
  function signature() {
    if (signatureCache) return signatureCache;
    let h = 0x811c9dc5 >>> 0;
    const mix = (v) => { const t = String(v); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } h ^= 0x2c; h = Math.imul(h, 0x01000193) >>> 0; };
    mix(WORLD_SEED); mix(generatorFor(WORLD_SEED));
    for (const r of RIVER_SOURCES) { mix(r.sx); mix(r.sy); mix(r.dir); mix(r.length); mix(r.meander || 0); }
    for (const l of LAKES) { mix(l.cx); mix(l.cy); mix(l.radius); }
    for (const r of RANGES) { mix(r.sx); mix(r.sy); mix(r.ex); mix(r.ey); mix(r.width); }
    mix(riverTiles.size);
    for (const c of crossings) for (const [x, y] of c.cells) { mix(x); mix(y); mix(riverTiles.get(x + ',' + y)); mix(crossingAxis.get(x + ',' + y)); }
    signatureCache = (h >>> 0).toString(16).padStart(8, '0');
    return signatureCache;
  }

  // Chiffres d'une carte (choix d'une graine au démarrage d'un serveur neuf, tests, outils) : part de chaque biome, cases
  // où l'on marche, part de la terre ferme principale, rivières et passages
  function worldStats() {
    const N = WORLD_SIZE;
    let snow = 0, desert = 0, temperate = 0, walkable = 0, main = 0, mainTemperate = 0;
    for (let y = MIN_COORD; y <= MAX_COORD; y++) for (let x = MIN_COORD; x <= MAX_COORD; x++) {
      const t = getTerrainType(x, y);
      if (t.biome === 'snow') snow++; else if (t.biome === 'desert') desert++; else temperate++;
      if (isBlocked(x, y)) continue;
      walkable++;
      if (isMainland(x, y)) { main++; if (t.biome === 'forest') mainTemperate++; }
    }
    const perRiver = RIVER_SOURCES.map((_, r) => crossings.filter(c => c.river === r).length);
    // morceaux de biome détachés (une île de neige au milieu du tempéré…) : la taille du plus grand, hors morceau principal
    const B = new Uint8Array(N * N), lab = new Int32Array(N * N).fill(-1), code = { forest: 0, snow: 1, desert: 2 };
    for (let y = MIN_COORD; y <= MAX_COORD; y++) for (let x = MIN_COORD; x <= MAX_COORD; x++) B[(y - MIN_COORD) * N + (x - MIN_COORD)] = code[getTerrainType(x, y).biome];
    const sizes = [[], [], []];
    for (let i = 0; i < N * N; i++) {
      if (lab[i] >= 0) continue;
      const b = B[i], stack = [i];
      lab[i] = i; let n = 0;
      while (stack.length) {
        const j = stack.pop(); n++;
        const x = j % N, y = (j - x) / N;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const k = ny * N + nx;
          if (lab[k] < 0 && B[k] === b) { lab[k] = i; stack.push(k); }
        }
      }
      sizes[b].push(n);
    }
    const biomeEnclave = Math.max(0, ...sizes.map(a => a.sort((p, q) => q - p).slice(1)).flat());
    return {
      seed: WORLD_SEED, cells: N * N, snow: snow / (N * N), desert: desert / (N * N), temperate: temperate / (N * N),
      walkable: walkable / (N * N), mainland: walkable ? main / walkable : 0, mainlandTemperateCells: mainTemperate,
      rivers: RIVER_SOURCES.length, crossings: crossings.length, bridges: crossings.filter(c => riverTiles.get(c.cells[0][0] + ',' + c.cells[0][1]) === 'bridge').length,
      crossingsPerRiver: perRiver, lakes: LAKES.length, ranges: RANGES.length, biomeEnclave
    };
  }
  // Une carte jouable : presque toute la terre d'un seul tenant, des biomes dans leurs proportions et d'un seul tenant (pas
  // d'île de neige au milieu du tempéré au-delà de quelques cases), chaque rivière traversable
  const BIOME_ENCLAVE_MAX = 150;
  function worldStatsOk(st) {
    return st.mainland >= 0.9 && st.snow >= 0.1 && st.snow <= 0.3 && st.desert >= 0.1 && st.desert <= 0.3 &&
      st.mainlandTemperateCells >= 40000 && st.rivers === LEGACY_RIVERS.length && st.crossingsPerRiver.every(n => n >= 2) &&
      (st.biomeEnclave === undefined || st.biomeEnclave <= BIOME_ENCLAVE_MAX);
  }
  const layout = () => ({ seed: WORLD_SEED, rivers: RIVER_SOURCES.map(r => ({ ...r })), lakes: LAKES.map(l => ({ ...l })), ranges: RANGES.map(r => ({ ...r })) });

  // Chemin le plus rapide (A*, 8 voisins, diagonale = racine de 2, pas de coupe de coin entre deux obstacles), le pas étant
  // pondéré par le coût de marche de la case d'arrivée (gués, forêts). Renvoie { path: [[x, y], ...], length } — length est
  // la longueur « en cases normales », qui fait la durée du trajet — ou null si la destination est inaccessible.
  // maxExpansions par défaut : tout le monde (un trajet d'un bord à l'autre de la carte explore plus de 100 000 cases).
  // Les tableaux de travail sont gardés d'un appel à l'autre (marqués par un numéro d'appel) ; chaque case n'est testée
  // qu'une fois par appel (passage, coût), ce qui ne change rien au chemin trouvé.
  const CELLS = WORLD_SIZE * WORLD_SIZE;
  const POCKET_FLOOD_MAX = 5000;   // cases au plus pour reconnaître une poche fermée autour d'une destination
  let pfStamp = 0, pfSeen = null, pfClosed, pfG, pfCame, pfBlk, pfCost;
  function pfBuffers() {
    if (pfSeen) return;
    pfSeen = new Int32Array(CELLS); pfClosed = new Int32Array(CELLS); pfG = new Float64Array(CELLS); pfCame = new Int32Array(CELLS);
    pfBlk = new Int32Array(CELLS); pfCost = new Float64Array(CELLS);
  }
  function findPath(fromX, fromY, toX, toY, objects, maxExpansions = CELLS, opts = null) {
    if (fromX === toX && fromY === toY) return { path: [[fromX, fromY]], length: 0 };
    if (isBlocked(toX, toY, objects)) return null;
    pfBuffers();
    const stamp = ++pfStamp;   // un numéro par appel : les cases d'un appel précédent ne comptent pas
    if (stamp >= 0x3fffffff) { pfStamp = 0; pfSeen.fill(0); pfClosed.fill(0); pfBlk.fill(0); return findPath(fromX, fromY, toX, toY, objects, maxExpansions, opts); }
    const idx = (x, y) => (y - MIN_COORD) * WORLD_SIZE + (x - MIN_COORD);
    // passage d'une case, testé une fois par appel (pfBlk : stamp*2 = libre, stamp*2+1 = bloquée)
    const blocked = (x, y) => {
      if (!inWorld(x, y)) return true;
      const i = idx(x, y), v = pfBlk[i];
      if (v === stamp * 2) return false;
      if (v === stamp * 2 + 1) return true;
      const b = isBlocked(x, y, objects);
      pfBlk[i] = stamp * 2 + (b ? 1 : 0);
      if (!b) pfCost[i] = moveCost(x, y, objects, opts);
      return b;
    };
    const h = (x, y) => { const dx = Math.abs(x - toX), dy = Math.abs(y - toY); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
    // file ouverte : tas binaire sur f
    const open = [];
    const push = (n) => {
      open.push(n);
      for (let i = open.length - 1; i > 0;) { const p = (i - 1) >> 1; if (open[p].f <= open[i].f) break; const t = open[p]; open[p] = open[i]; open[i] = t; i = p; }
    };
    const pop = () => {
      const top = open[0], last = open.pop();
      if (open.length) {
        open[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < open.length && open[l].f < open[m].f) m = l;
          if (r < open.length && open[r].f < open[m].f) m = r;
          if (m === i) break;
          const t = open[m]; open[m] = open[i]; open[i] = t; i = m;
        }
      }
      return top;
    };
    if (!inWorld(fromX, fromY)) return null;
    // destination dans une poche fermée (hors de la terre ferme principale) : une petite inondation depuis elle, avec les
    // mêmes règles de passage, dit tout de suite si le départ est atteignable (les mouvements sont symétriques) ; sans
    // cela, A* parcourrait toute la terre ferme avant de renoncer. Deux cases de la terre ferme se rejoignent toujours
    // (les villes et les points ne bouchent jamais un passage).
    if (!(isMainland(fromX, fromY) && isMainland(toX, toY))) {
      const seen = new Set([idx(toX, toY)]), stack = [toX, toY];
      let reached = false;
      while (stack.length && !reached && seen.size <= POCKET_FLOOD_MAX) {
        const y = stack.pop(), x = stack.pop();
        for (let dy = -1; dy <= 1 && !reached; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (blocked(nx, ny) || (dx && dy && blocked(x + dx, y) && blocked(x, y + dy))) continue;
          if (nx === fromX && ny === fromY) { reached = true; break; }
          const k = idx(nx, ny);
          if (!seen.has(k)) { seen.add(k); stack.push(nx, ny); }
        }
      }
      if (!reached && !stack.length) return null;   // la poche est fermée et le départ n'y est pas
    }
    push({ x: fromX, y: fromY, g: 0, f: h(fromX, fromY) });
    const start = idx(fromX, fromY);
    pfSeen[start] = stamp; pfG[start] = 0; pfCame[start] = -1;
    let expansions = 0;
    while (open.length) {
      const cur = pop();
      const ci = idx(cur.x, cur.y);
      if (pfClosed[ci] === stamp) continue;
      if (cur.x === toX && cur.y === toY) {
        const path = [];
        for (let k = ci; k >= 0; k = pfCame[k]) path.push([MIN_COORD + (k % WORLD_SIZE), MIN_COORD + Math.floor(k / WORLD_SIZE)]);
        path.reverse();
        return { path, length: cur.g };
      }
      pfClosed[ci] = stamp;
      if (++expansions > maxExpansions) return null;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!inWorld(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (pfClosed[ni] === stamp || blocked(nx, ny)) continue;
        // pas de passage en diagonale entre deux obstacles
        if (dx && dy && blocked(cur.x + dx, cur.y) && blocked(cur.x, cur.y + dy)) continue;
        const g = cur.g + (dx && dy ? Math.SQRT2 : 1) * pfCost[ni];
        if (pfSeen[ni] !== stamp || g < pfG[ni]) {
          pfSeen[ni] = stamp; pfG[ni] = g; pfCame[ni] = ci;
          push({ x: nx, y: ny, g, f: g + h(nx, ny) });
        }
      }
    }
    return null;
  }

  // Longueur de chaque pas d'un chemin [[x, y], …] et longueur totale (à garder avec un chemin qui sert plusieurs fois)
  function pathLengths(path) {
    let total = 0;
    const seg = [];
    for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(d); total += d; }
    return { seg, total };
  }
  // Point d'un chemin à la fraction donnée de sa longueur : là où se trouve une armée en marche, le même calcul au serveur
  // (rencontres) et sur la carte. lengths : pathLengths(path), facultatif (sinon mesuré ici)
  function pointAlongPath(path, fraction, lengths) {
    if (!path || !path.length) return null;
    if (path.length === 1 || fraction <= 0) return { x: path[0][0], y: path[0][1] };
    if (fraction >= 1) { const l = path[path.length - 1]; return { x: l[0], y: l[1] }; }
    const { seg, total } = lengths || pathLengths(path);
    let target = fraction * total;
    for (let i = 1; i < path.length; i++) {
      if (target <= seg[i - 1]) { const t = seg[i - 1] ? target / seg[i - 1] : 0; return { x: path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, y: path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t }; }
      target -= seg[i - 1];
    }
    const l = path[path.length - 1]; return { x: l[0], y: l[1] };
  }

  setWorldSeed(0);   // la carte de référence, tant que la graine du serveur n'est pas connue

  return {
    get worldSeed() { return WORLD_SEED; }, get epoch() { return epoch; }, MAX_SEED, setWorldSeed, worldStats, worldStatsOk, layout,
    get generator() { return generatorFor(WORLD_SEED); }, get minClientVersion() { return generatorFor(WORLD_SEED); },
    get signature() { return signature(); }, generatorFor,
    TERRAIN_VERSION, cityCells, GROUND_LAYERS, groundAt, groundVariantAt, valueNoise, WORLD_SIZE, MIN_COORD, MAX_COORD, seededRandom, getBiome, riverAt, crossingAxisAt, computeTerrainType, getTerrainType, BLOCKED, WATER, FOREST, moveCost, inWorld, isBlocked, isMainland, findPath, pathLengths, pointAlongPath };
});
