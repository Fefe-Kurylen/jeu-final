// ============================================================================
// map-world.js — carte du monde au style de la carte de référence (docs/CARTE-REFERENCE.md, décisions du 25 octobre 2026)
//  - LE SOL : une texture répétable par type de sol (painted/map/world/ground/<sol>.webp ; en attendant, les textures de
//    sol existantes), projetée en isométrique et ancrée sur le monde, donc sans raccord visible. Les fondus irréguliers
//    entre sols sont découpés ici, sur une grille décalée d'une demi-case : chaque losange de cette grille a pour coins les
//    centres de 4 cases, et chaque sol y occupe la zone proche des coins qui le portent (Terrain.groundAt) ;
//  - LA GRILLE : très légère, toujours visible (on peut la masquer avec la touche G) ;
//  - LES ÉLÉMENTS POSÉS : forêts, rochers, montagnes, ponts, gués, dunes, ruines, palmiers, bateaux et quais
//    (painted/map/world/<…>.webp, cadrés comme les demande tools/repaint/map-world.cjs) ; tant qu'ils ne sont pas livrés,
//    les sprites et dessins d'avant.
// ============================================================================

const MAP_GROUND_LAYERS = Terrain.GROUND_LAYERS;   // de la couche la plus basse à la plus haute
const MAP_GROUND_INDEX = Object.fromEntries(MAP_GROUND_LAYERS.map((g, i) => [g, i]));
const MAP_GROUND_CELLS_PER_TEXTURE = 6;            // une texture peinte couvre 6 × 6 cases
// Repli tant que la texture peinte n'est pas livrée : texture de sol existante (elle couvre 2 cases) et voile de couleur
// quand ce n'est pas la bonne texture, ou simple couleur
const MAP_GROUND_FALLBACK = {
  water: { tex: 'water_lake', color: '#3f78a8' },
  ice: { tex: 'ice', color: '#b4d0de' },
  sand: { tex: 'sand_ripples', color: '#d9bc80', veil: 0.1 },
  earth: { tex: 'soil_tilled', color: '#8a6440', veil: 0.3 },
  drygrass: { tex: 'grass_dry', color: '#c9a54e', veil: 0.55 },
  grass: { tex: 'grass_hills', color: '#6a9a48', veil: 0 },
  snow: { tex: 'tundra', color: '#eef3f7', veil: 0 }
};
const MAP_NIGHT_VEIL = 'rgba(8,14,30,0.55)';
// Variantes de chaque sol (Terrain.groundVariantAt) : couche = type × 4 + variante − 1, les variantes d'un même sol se
// fondent entre elles comme deux sols voisins. Image d'une variante absente : celle de la variante 1 ; sans aucune image
// du sol, un léger voile distingue les variantes en attendant.
const MAP_GROUND_MAXV = 4;
const MAP_GROUND_COMBINED = MAP_GROUND_LAYERS.flatMap(g => Array.from({ length: MAP_GROUND_MAXV }, (_, i) => ({ g, v: i + 1 })));
const MAP_VARIANT_TINT = [null, 'rgba(255,255,255,0.07)', 'rgba(20,30,0,0.08)', 'rgba(255,235,170,0.08)'];
const MAP_ORIGIN0 = { x: 0, y: 0 };
function mapGroundFills(tw, th) { return MAP_GROUND_COMBINED.map(({ g, v }) => mapGroundFill(g, v, tw, th, MAP_ORIGIN0)); }

// ---- textures du sol ----
const _mapGroundPatterns = new Map();   // url@taille -> CanvasPattern
function mapGroundFill(layer, variant, tw, th, origin) {
  const fb = MAP_GROUND_FALLBACK[layer];
  const painted = (n) => typeof paintedSet !== 'undefined' && paintedSet.has(`map/world/ground/${layer}_${n}.webp`);
  const own = painted(variant) ? variant : painted(1) ? 1 : 0;
  let url, cells = 2, veil = 0, tint = null;
  if (own) { url = `assets/images/painted/map/world/ground/${layer}_${own}.webp`; cells = MAP_GROUND_CELLS_PER_TEXTURE; }
  else {
    url = typeof terrainTextureUrl === 'function' ? terrainTextureUrl(fb.tex) : null;
    if (url && !url.includes('/' + fb.tex + '.')) veil = fb.veil || 0;   // texture plus générale : on la teinte
    tint = MAP_VARIANT_TINT[variant - 1] || null;
  }
  const img = url && typeof getSprite === 'function' ? getSprite(url) : null;
  if (!img || typeof DOMMatrix !== 'function') return { style: fb.color, veil: 0, color: fb.color, tint };
  // résolution du motif : environ un pixel d'écran par pixel de texture (paliers pour ne pas tout refaire en zoomant)
  const want = cells * Math.hypot(tw, th) / 2 * canvasScale();
  const size = Math.round(Math.max(32, Math.min(img.naturalWidth || 1024, Math.pow(2, Math.round(Math.log2(Math.max(want, 1)) * 2) / 2))));
  const key = url + '@' + size;
  let pattern = _mapGroundPatterns.get(key);
  if (!pattern) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, size, size);
    pattern = mapCtx.createPattern(c, 'repeat');
    if (!pattern || typeof pattern.setTransform !== 'function') return { style: fb.color, veil: 0, color: fb.color, tint };
    if (_mapGroundPatterns.size > 48) _mapGroundPatterns.clear();
    _mapGroundPatterns.set(key, pattern);
  }
  // projection isométrique : un pixel du motif = cells / size case, l'axe x du motif suit l'axe x du monde
  const k = cells / size;
  try { pattern.setTransform(new DOMMatrix([k * tw / 2, k * th / 2, -k * tw / 2, k * th / 2, origin.x, origin.y])); } catch (e) { return { style: fb.color, veil: 0, color: fb.color, tint }; }
  return { style: pattern, veil, color: fb.color, url, tint };
}

// ---- fondus : forme de chaque sol dans un losange de la grille décalée ----
// Coordonnées locales (p, q) dans [0, 1]² : coin haut = case (vx, vy), droite = (vx+1, vy), bas = (vx+1, vy+1),
// gauche = (vx, vy+1). Le champ de chaque sol (interpolation de ses coins, plus un bruit pris dans les coordonnées du
// monde) est continu d'un losange à l'autre : les bords se raccordent sans couture.
const MAP_BLEND_SOFT = 0.36, MAP_BLEND_HARD = 0.5;   // bord adouci (demi-opaque) puis bord net
const _mapBlendCache = new Map();   // "vx,vy,n" -> [{ layer, soft: [poly…], hard: [poly…] }]
function mapBlendNoise(X, Y) {
  return (Terrain.valueNoise(X, Y, 91919, 0.8) - 0.5) * 0.45 + (Terrain.valueNoise(X, Y, 92929, 0.3) - 0.5) * 0.2;
}
// Région { champ > seuil } découpée en carrés (marching squares) : liste de polygones [p, q, p, q, …] ; les carrés
// entièrement couverts d'une même rangée sont fusionnés
function mapBlendPolys(values, n, t) {
  const out = [];
  const at = (i, j) => values[j * (n + 1) + i];
  for (let j = 0; j < n; j++) {
    let run = -1;
    const flush = (end) => { if (run >= 0) { out.push([run / n, j / n, end / n, j / n, end / n, (j + 1) / n, run / n, (j + 1) / n]); run = -1; } };
    for (let i = 0; i < n; i++) {
      const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const v = pts.map(([a, b]) => at(a, b));
      if (v.every(x => x > t)) { if (run < 0) run = i; continue; }
      flush(i);
      if (v.every(x => x <= t)) continue;
      const poly = [];
      for (let k = 0; k < 4; k++) {
        const a = pts[k], b = pts[(k + 1) % 4], va = v[k], vb = v[(k + 1) % 4];
        if (va > t) poly.push(a[0] / n, a[1] / n);
        if ((va > t) !== (vb > t)) {
          const s = (t - va) / (vb - va);
          poly.push((a[0] + (b[0] - a[0]) * s) / n, (a[1] + (b[1] - a[1]) * s) / n);
        }
      }
      if (poly.length >= 6) out.push(poly);
    }
    flush(n);
  }
  return out;
}
function mapBlendShapes(vx, vy, corners, n) {
  const key = vx + ',' + vy + ',' + n;
  let shapes = _mapBlendCache.get(key);
  if (shapes) return shapes;
  shapes = [];
  const lo = Math.min(...corners);
  const layers = [...new Set(corners)].filter(l => l > lo).sort((a, b) => a - b);
  const noise = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) noise[j * (n + 1) + i] = mapBlendNoise(vx + i / n, vy + j / n);
  for (const L of layers) {
    const [mT, mR, mB, mL] = corners.map(c => (c >= L ? 1 : 0));
    const values = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const p = i / n, q = j / n;
      values[j * (n + 1) + i] = mT * (1 - p) * (1 - q) + mR * p * (1 - q) + mB * p * q + mL * (1 - p) * q + noise[j * (n + 1) + i];
    }
    shapes.push({ layer: L, soft: mapBlendPolys(values, n, MAP_BLEND_SOFT), hard: mapBlendPolys(values, n, MAP_BLEND_HARD) });
  }
  if (_mapBlendCache.size > 80000) _mapBlendCache.clear();
  _mapBlendCache.set(key, shapes);
  return shapes;
}

// Cases visibles : rectangle du monde qui couvre l'écran (avec une marge)
function mapVisibleBounds(screenToWorldF, w, h) {
  const pts = [[0, 0], [w, 0], [0, h], [w, h]].map(([sx, sy]) => screenToWorldF(sx, sy));
  return {
    x0: Math.min(...pts.map(p => p.x)) - 2, x1: Math.max(...pts.map(p => p.x)) + 2,
    y0: Math.min(...pts.map(p => p.y)) - 2, y1: Math.max(...pts.map(p => p.y)) + 2
  };
}

// ---- le sol, par morceaux mis en cache ----
// Le sol ne change pas : il est dessiné par carrés de MAP_CHUNK pixels dans un repère lié au monde (origine = centre de
// la case 0,0), puis recopié à chaque image. Un zoom refait les morceaux une fois le geste terminé ; pendant le geste,
// les morceaux de l'échelle précédente sont étirés.
const MAP_CHUNK = 256;
const _mapChunks = new Map();     // "i,j" -> canvas (ordre d'utilisation : le plus ancien en tête)
const _mapChunkPool = [];
let _mapChunkState = null;        // { key, tw, th, night, sig }
let _mapLastTw = 0, _mapZoomAt = 0, _mapZoomTimer = null;

// Dessine le sol des cases d'un rectangle du repère du monde [X0, X0+size] × [Y0, Y0+size] dans ctx (déjà décalé)
function renderMapGroundRect(ctx, X0, Y0, size, tw, th, night, fills) {
  const toWorld = (X, Y) => ({ x: X / tw + Y / th, y: Y / th - X / tw });
  const pts = [toWorld(X0, Y0), toWorld(X0 + size, Y0), toWorld(X0, Y0 + size), toWorld(X0 + size, Y0 + size)];
  const x0 = Math.floor(Math.min(...pts.map(p => p.x))) - 2, x1 = Math.ceil(Math.max(...pts.map(p => p.x))) + 1;
  const y0 = Math.floor(Math.min(...pts.map(p => p.y))) - 2, y1 = Math.ceil(Math.max(...pts.map(p => p.y))) + 1;
  const W = x1 - x0 + 2;
  const grid = new Uint8Array(W * (y1 - y0 + 2));
  for (let y = y0; y <= y1 + 1; y++) for (let x = x0; x <= x1 + 1; x++) grid[(y - y0) * W + (x - x0)] = MAP_GROUND_INDEX[Terrain.groundAt(x, y)] * MAP_GROUND_MAXV + Terrain.groundVariantAt(x, y) - 1;
  const g = (x, y) => grid[(y - y0) * W + (x - x0)];
  const L = MAP_GROUND_COMBINED.length;
  const base = new Array(L).fill(null), soft = base.slice(), hard = base.slice();
  const path = (arr, i) => arr[i] || (arr[i] = new Path2D());
  const n = tw >= 90 ? 4 : tw >= 44 ? 3 : tw >= 24 ? 2 : 1;   // finesse des fondus selon la taille des cases
  const withSoft = tw >= 30;
  const e = 0.6;   // léger recouvrement des losanges pleins : pas de fil clair entre deux losanges
  const addPolys = (arr, layer, polys, cx, cy) => {
    if (!polys.length) return;
    const p2 = path(arr, layer);
    for (const poly of polys) {
      for (let k = 0; k < poly.length; k += 2) {
        const p = poly[k], q = poly[k + 1];
        const X = cx + (p - q) * tw / 2, Y = cy + (p + q - 1) * th / 2;
        if (k === 0) p2.moveTo(X, Y); else p2.lineTo(X, Y);
      }
      p2.closePath();
    }
  };
  for (let vy = y0; vy <= y1; vy++) for (let vx = x0; vx <= x1; vx++) {
    const cx = (vx - vy) * tw / 2, cy = (vx + vy + 1) * th / 2;   // centre du losange décalé (vx+½, vy+½)
    if (cx < X0 - tw || cx > X0 + size + tw || cy < Y0 - th || cy > Y0 + size + th) continue;
    const c0 = g(vx, vy), c1 = g(vx + 1, vy), c2 = g(vx + 1, vy + 1), c3 = g(vx, vy + 1);
    const lo = Math.min(c0, c1, c2, c3);
    const b = path(base, lo);
    b.moveTo(cx, cy - th / 2 - e); b.lineTo(cx + tw / 2 + e * 2, cy); b.lineTo(cx, cy + th / 2 + e); b.lineTo(cx - tw / 2 - e * 2, cy); b.closePath();
    if (c0 === lo && c1 === lo && c2 === lo && c3 === lo) continue;
    for (const s of mapBlendShapes(vx, vy, [c0, c1, c2, c3], n)) { if (withSoft) addPolys(soft, s.layer, s.soft, cx, cy); addPolys(hard, s.layer, s.hard, cx, cy); }
  }
  const fill = (p2, i, alpha) => {
    if (!p2) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fills[i].style; ctx.fill(p2);
    if (fills[i].veil) { ctx.globalAlpha = alpha * fills[i].veil; ctx.fillStyle = fills[i].color; ctx.fill(p2); }
    if (fills[i].tint) { ctx.globalAlpha = alpha; ctx.fillStyle = fills[i].tint; ctx.fill(p2); }
  };
  for (let i = 0; i < L; i++) fill(base[i], i, 1);
  for (let i = 0; i < L; i++) { fill(soft[i], i, 0.5); fill(hard[i], i, 1); }
  ctx.globalAlpha = 1;
  if (night) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = MAP_NIGHT_VEIL; ctx.fillRect(X0, Y0, size, size); ctx.globalCompositeOperation = 'source-over'; }
}

function mapGroundChunk(i, j, st, fills, scale) {
  const k = i + ',' + j;
  let c = _mapChunks.get(k);
  if (c) { _mapChunks.delete(k); _mapChunks.set(k, c); return c; }   // le plus récemment utilisé en dernier
  c = _mapChunkPool.pop() || document.createElement('canvas');
  const px = Math.round(MAP_CHUNK * scale);
  if (c.width !== px) { c.width = px; c.height = px; }
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.setTransform(px / MAP_CHUNK, 0, 0, px / MAP_CHUNK, -i * MAP_CHUNK * px / MAP_CHUNK, -j * MAP_CHUNK * px / MAP_CHUNK);
  renderMapGroundRect(ctx, i * MAP_CHUNK, j * MAP_CHUNK, MAP_CHUNK, st.tw, st.th, st.night, fills);
  _mapChunks.set(k, c);
  return c;
}

function drawMapGround(worldToScreen, bounds, w, h, tw, th, night) {
  const scale = canvasScale();
  const now = performance.now();
  if (tw !== _mapLastTw) { _mapLastTw = tw; _mapZoomAt = now; }
  const fills0 = mapGroundFills(tw, th);
  const sig = fills0.map(f => (f.url || f.color) + (f.tint ? '+' : '')).join('|');
  const key = [tw, th, scale, night ? 1 : 0, sig].join('|');
  let st = _mapChunkState, s = 1, fills = fills0;
  if (!st || st.key !== key) {
    const zooming = st && now - _mapZoomAt < 250 && st.night === night && st.sig === sig && st.scale === scale;
    if (zooming) {
      s = tw / st.tw;   // étire les morceaux de l'échelle précédente, refait tout à la fin du geste
      fills = mapGroundFills(st.tw, st.th);
      clearTimeout(_mapZoomTimer);
      _mapZoomTimer = setTimeout(() => { if (typeof scheduleMapRender === 'function') scheduleMapRender(); }, 280);
    } else {
      for (const c of _mapChunks.values()) if (_mapChunkPool.length < 64) _mapChunkPool.push(c);
      _mapChunks.clear();
      st = _mapChunkState = { key, tw, th, night, sig, scale };
    }
  }
  const origin = worldToScreen(0, 0);
  const ox = Math.round(origin.x * scale) / scale, oy = Math.round(origin.y * scale) / scale;
  const CS = MAP_CHUNK * s;
  const i0 = Math.floor(-ox / CS), i1 = Math.floor((w - ox) / CS), j0 = Math.floor(-oy / CS), j1 = Math.floor((h - oy) / CS);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = mapGroundChunk(i, j, st, fills, scale);
    mapCtx.drawImage(c, ox + i * CS, oy + j * CS, CS, CS);
  }
  const keep = (i1 - i0 + 1) * (j1 - j0 + 1) + 16;
  while (_mapChunks.size > keep) { const k = _mapChunks.keys().next().value; const c = _mapChunks.get(k); _mapChunks.delete(k); if (_mapChunkPool.length < 64) _mapChunkPool.push(c); }
}

// ---- la grille : bords des cases (les cases sont centrées sur les coordonnées entières) ----
function drawMapGrid(worldToScreen, bounds, night) {
  if (!showMapGrid) return;
  const { x0, x1, y0, y1 } = bounds;
  const p2 = new Path2D();
  for (let x = x0; x <= x1; x++) { const a = worldToScreen(x + 0.5, y0 - 0.5), b = worldToScreen(x + 0.5, y1 + 0.5); p2.moveTo(a.x, a.y); p2.lineTo(b.x, b.y); }
  for (let y = y0; y <= y1; y++) { const a = worldToScreen(x0 - 0.5, y + 0.5), b = worldToScreen(x1 + 0.5, y + 0.5); p2.moveTo(a.x, a.y); p2.lineTo(b.x, b.y); }
  const fade = Math.max(0.35, Math.min(1, mapZoomLevel / 0.6));   // de loin, plus discrète
  mapCtx.strokeStyle = night ? `rgba(220,230,255,${0.07 * fade})` : `rgba(40,32,16,${0.09 * fade})`;
  mapCtx.lineWidth = 0.6;
  mapCtx.stroke(p2);
}

// ---- éléments posés ----
// Cadrage des images de tools/repaint/map-world.cjs : losange d'une case = 50 % de la largeur, centre à 75 % de la hauteur
const WORLD_OBJECT_FOOTPRINT = 0.5, WORLD_OBJECT_CENTER_Y = 0.75;
// Ville sur 2 × 2 cases : losange 2 × 2 = 90 % de la largeur, centre à 68 % de la hauteur
const WORLD_CITY_FOOTPRINT = 0.9, WORLD_CITY_CENTER_Y = 0.68;
// Sprites de la carte d'avant (ressources 1,3 case de large, armées 1,2) → même échelle au nouveau cadrage
const WORLD_SPRITE_SCALE = 1 / (WORLD_OBJECT_FOOTPRINT * 1.3);

function worldArt(p) {
  if (typeof paintedSet === 'undefined' || !paintedSet.has(p) || typeof getSprite !== 'function') return null;
  return getSprite('assets/images/painted/' + p);
}
// Une variante peinte parmi n, choisie au hasard (déterministe) pour la case ; null si aucune n'est livrée
function worldVariant(prefix, n, wx, wy, seed) {
  if (typeof paintedSet === 'undefined') return null;
  const start = Math.floor(Terrain.seededRandom(wx, wy, seed) * n);
  for (let k = 0; k < n; k++) { const p = `${prefix}${((start + k) % n) + 1}.webp`; if (paintedSet.has(p)) return p; }
  return null;
}
function drawWorldObject(img, x, y, tw) {
  const S = tw / WORLD_OBJECT_FOOTPRINT;
  mapCtx.drawImage(img, x - S / 2, y - S * WORLD_OBJECT_CENTER_Y, S, S);
}
function drawWorldCityImage(img, x, y, blockW) {
  const S = blockW / WORLD_CITY_FOOTPRINT;
  mapCtx.drawImage(img, x - S / 2, y - S * WORLD_CITY_CENTER_Y, S, S);
}

const MAP_WET = { water: 1, frozen: 1, oasis: 1, river: 1, bridge: 1, ford: 1 };
const MAP_MOUNTAIN_BIOME = { forest: 'temperate', snow: 'snow', desert: 'desert' };
// Montagnes infranchissables : tempérées, enneigées, mesas du désert
function mapIsMountain(t) { return t.feature === 'mountain' || t.feature === 'icemountain' || t.feature === 'mesa'; }
// Le pont et le gué traversent la rivière de rive à rive selon un axe de la grille (Terrain.crossingAxisAt)
function mapCrossingAlongX(wx, wy) { return Terrain.crossingAxisAt(wx, wy) === 'x'; }

// Image peinte de l'élément posé sur une case (chemin painted/), ou null
function worldFeatureArt(wx, wy, terrain) {
  const f = terrain.feature, biome = terrain.biome;
  if (f === 'tree' || f === 'snowtree') {
    const kind = f === 'tree' ? 'temperate' : 'snow';
    let around = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (getTerrainType(wx + dx, wy + dy).feature === f && !terrainBlockedAt(wx + dx, wy + dy)) around++;
    const dense = worldVariant(`map/world/forest/${kind}_`, 4, wx, wy, 5151), edge = worldVariant(`map/world/forest/${kind}_edge_`, 3, wx, wy, 5152);
    return around >= 3 ? (dense || edge) : (edge || dense);
  }
  if (mapIsMountain(terrain)) {
    const key = MAP_MOUNTAIN_BIOME[biome] || 'temperate';
    const same = (dx, dy) => { if (terrainBlockedAt(wx + dx, wy + dy)) return false; return mapIsMountain(getTerrainType(wx + dx, wy + dy)); };
    const ex = same(1, 0) || same(-1, 0), ey = same(0, 1) || same(0, -1);
    const suffix = ex && ey ? '_xy' : ex ? '_x' : ey ? '_y' : '';
    // plusieurs modèles par forme (3 variantes), choisis au hasard pour la case ; repli sur la montagne isolée
    return worldVariant(`map/world/mountains/${key}${suffix}_`, 3, wx, wy, 5161) || worldVariant(`map/world/mountains/${key}_`, 3, wx, wy, 5161);
  }
  if (f === 'boulders') return worldVariant('map/world/rocks/boulders_', 4, wx, wy, 5153);
  if (f === 'rocks') return worldVariant('map/world/rocks/desert_', 3, wx, wy, 5154);
  if (f === 'dunes') return worldVariant('map/world/desert/dunes_', 3, wx, wy, 5155);
  if (f === 'ruins') return worldVariant('map/world/desert/ruins_', 3, wx, wy, 5156);
  if (f === 'bridge' || f === 'ford') { const p = `map/world/river/${f}_${mapCrossingAlongX(wx, wy) ? 'x' : 'y'}.webp`; return paintedSet.has(p) ? p : null; }
  return null;
}

// Décor sans effet sur le jeu : palmiers au bord des oasis, bateaux et quais sur l'eau (seulement peints, sauf les palmiers)
function drawMapDecor(x, y, tw, th, wx, wy, terrain) {
  const f = terrain.feature;
  if (!f && terrain.biome === 'desert') {
    let oasis = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (getTerrainType(wx + dx, wy + dy).feature === 'oasis') { oasis = true; break; }
    if (!oasis || Terrain.seededRandom(wx, wy, 5157) > 0.6) return;
    const p = worldVariant('map/world/desert/palms_', 3, wx, wy, 5158), img = p && worldArt(p);
    if (img) drawWorldObject(img, x, y, tw);
    else if (!p) { drawPalmTree(x - tw * 0.12, y - th * 0.05, tw * 0.14, th * 0.9); drawPalmTree(x + tw * 0.12, y + th * 0.05, tw * 0.12, th * 0.75); }
    return;
  }
  if ((f === 'water' || f === 'river') && terrain.biome !== 'snow') {
    const r = Terrain.seededRandom(wx, wy, 5159);
    if (r < 0.012) { const p = worldVariant('map/world/water/boat_', 3, wx, wy, 5160), img = p && worldArt(p); if (img) drawWorldObject(img, x, y, tw); return; }
    if (r < 0.04) {
      const landX = !MAP_WET[getTerrainType(wx - 1, wy).feature], landY = !MAP_WET[getTerrainType(wx, wy - 1).feature];
      const p = landX ? 'map/world/water/dock_x.webp' : landY ? 'map/world/water/dock_y.webp' : null;
      const img = p && worldArt(p);
      if (img) drawWorldObject(img, x, y, tw);
    }
  }
}

// Élément posé d'une case (passe des éléments, triée de haut en bas) : image peinte, sinon le rendu d'avant
function drawMapCellFeature(x, y, tw, th, wx, wy) {
  const terrain = getTerrainType(wx, wy);
  const f = terrain.feature;
  if (terrainBlockedAt(wx, wy) && !MAP_WET[f]) return;   // relief effacé sous et autour des villes, sur les points de ressource
  drawMapDecor(x, y, tw, th, wx, wy, terrain);
  if (!f || f === 'water' || f === 'frozen' || f === 'oasis' || f === 'river') return;   // l'eau fait partie du sol
  const p = typeof paintedSet !== 'undefined' ? worldFeatureArt(wx, wy, terrain) : null;
  const img = p && worldArt(p);
  if (img) { drawWorldObject(img, x, y, tw); return; }
  if (p) return;   // image peinte en cours de chargement
  drawLegacyFeature(x, y, tw, th, wx, wy, terrain);
}
