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
// D'où vient le sol d'une variante : l'image peinte de la variante, sinon celle de la variante 1, sinon la texture de sol
// existante (ou une couleur) ; une image peinte qui ne se charge pas est remplacée par le repli
function mapGroundSource(layer, variant) {
  const fb = MAP_GROUND_FALLBACK[layer];
  const paintedUrl = (n) => `assets/images/painted/map/world/ground/${layer}_${n}.webp`;
  const painted = (n) => typeof paintedSet !== 'undefined' && paintedSet.has(`map/world/ground/${layer}_${n}.webp`) && !(typeof spriteFailed === 'function' && spriteFailed(paintedUrl(n)));
  const own = painted(variant) ? variant : painted(1) ? 1 : 0;
  if (own) return { url: paintedUrl(own), cells: MAP_GROUND_CELLS_PER_TEXTURE, veil: 0, tint: null, color: fb.color };
  const url = typeof terrainTextureUrl === 'function' ? terrainTextureUrl(fb.tex) : null;
  return { url, cells: 2, veil: url && !url.includes('/' + fb.tex + '.') ? fb.veil || 0 : 0, tint: MAP_VARIANT_TINT[variant - 1] || null, color: fb.color };
}
// Ce dont dépend le dessin du sol en dehors du zoom (sans fabriquer de motif) : texture prête ou couleur, par variante
function mapGroundSignature() {
  return MAP_GROUND_COMBINED.map(({ g, v }) => { const src = mapGroundSource(g, v); return (src.url && typeof getSprite === 'function' && getSprite(src.url) ? src.url : src.color) + (src.tint ? '+' : ''); }).join('|');
}
const MAP_PATTERN_MAX = 640;   // côté maximal d'un motif (mémoire) ; au-delà, la texture est légèrement agrandie
function mapGroundFill(layer, variant, tw, th, origin) {
  const fb = MAP_GROUND_FALLBACK[layer];
  const { url, cells, veil, tint } = mapGroundSource(layer, variant);
  const img = url && typeof getSprite === 'function' ? getSprite(url) : null;
  if (!img || typeof DOMMatrix !== 'function') return { style: fb.color, veil: 0, color: fb.color, tint };
  // résolution du motif : environ un pixel d'écran par pixel de texture (paliers pour ne pas tout refaire en zoomant)
  const want = cells * Math.hypot(tw, th) / 2 * Math.min(canvasScale(), MAP_CHUNK_MAX_DPR);   // à la résolution des morceaux de sol
  const size = Math.round(Math.max(32, Math.min(img.naturalWidth || 1024, MAP_PATTERN_MAX, Math.pow(2, Math.round(Math.log2(Math.max(want, 1)) * 2) / 2))));
  const key = url + '@' + size;
  let pattern = _mapGroundPatterns.get(key);
  if (pattern) { _mapGroundPatterns.delete(key); _mapGroundPatterns.set(key, pattern); }   // le plus récent en dernier
  if (!pattern) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (!g) { c.width = c.height = 0; return { style: fb.color, veil: 0, color: fb.color, tint }; }   // plus de mémoire de canvas (iOS) : couleur
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, size, size);
    pattern = mapCtx.createPattern(c, 'repeat');
    if (!pattern || typeof pattern.setTransform !== 'function') return { style: fb.color, veil: 0, color: fb.color, tint };
    _mapGroundPatterns.set(key, pattern);
    while (_mapGroundPatterns.size > 32) _mapGroundPatterns.delete(_mapGroundPatterns.keys().next().value);
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
const _mapBlendCache = new Map();   // "vx,vy" -> [{ layer, soft: [poly…], hard: [poly…] }] pour la finesse _mapBlendN
let _mapBlendN = 0;
const MAP_BLEND_CACHE_MAX = 4000;   // les morceaux de sol gardent le dessin : ce cache ne sert qu'aux morceaux redessinés
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
  if (n !== _mapBlendN) { _mapBlendCache.clear(); _mapBlendN = n; }   // autre finesse (zoom) : on repart de zéro
  const key = vx + ',' + vy;
  let shapes = _mapBlendCache.get(key);
  if (shapes) { _mapBlendCache.delete(key); _mapBlendCache.set(key, shapes); return shapes; }   // le plus récent en dernier
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
    shapes.push({ layer: L, soft: mapBlendPolys(values, n, MAP_BLEND_SOFT).map(p => Float32Array.from(p)), hard: mapBlendPolys(values, n, MAP_BLEND_HARD).map(p => Float32Array.from(p)) });
  }
  _mapBlendCache.set(key, shapes);
  if (_mapBlendCache.size > MAP_BLEND_CACHE_MAX) _mapBlendCache.delete(_mapBlendCache.keys().next().value);
  return shapes;
}

// Cases visibles : rectangle du monde qui couvre l'écran (avec une marge)
function mapVisibleBounds(screenToWorldF, w, h) {
  const pts = [[0, 0], [w, 0], [0, h], [w, h]].map(([sx, sy]) => screenToWorldF(sx, sy));
  return {   // marge : les reliefs et les arbres des cases juste sous l'écran dépassent vers le haut
    x0: Math.min(...pts.map(p => p.x)) - 4, x1: Math.max(...pts.map(p => p.x)) + 4,
    y0: Math.min(...pts.map(p => p.y)) - 4, y1: Math.max(...pts.map(p => p.y)) + 4
  };
}

// ---- le sol, par morceaux mis en cache ----
// Le sol ne change pas : il est dessiné par carrés de MAP_CHUNK pixels dans un repère lié au monde (origine = centre de
// la case 0,0), puis recopié à chaque image. Un zoom refait les morceaux une fois le geste terminé ; pendant le geste,
// les morceaux de l'échelle précédente sont étirés.
const MAP_CHUNK = 256;
const MAP_CHUNK_MAX_DPR = 2;      // au-delà (téléphones dpr 3), les morceaux sont agrandis : 2,25 fois moins de mémoire
const MAP_CHUNKS_PER_FRAME = 4;   // morceaux neufs dessinés par image ; les suivants aux images suivantes (pas d'à-coup)
const MAP_POOL_MAX = 6;
const _mapChunks = new Map();     // "i,j" -> canvas (ordre d'utilisation : le plus ancien en tête)
const _mapChunkPool = [];
let _mapChunkState = null;        // { key, tw, th, night, sig, scale, fills }
let _mapLastTw = 0, _mapZoomAt = 0, _mapZoomTimer = null, _mapChunkPending = false;
let _mapChunkFailUntil = 0;       // plus de mémoire de canvas : pas de nouveau morceau avant cette heure (couleurs en attendant)
const mapTabActive = () => !!document.getElementById('tab-map')?.classList.contains('active');

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

// Un canvas libéré : gardé pour resservir (quelques-uns), sinon sa mémoire est rendue tout de suite
function mapDropChunk(c) { if (_mapChunkPool.length < MAP_POOL_MAX) _mapChunkPool.push(c); else { c.width = 0; c.height = 0; } }
// En quittant la carte : toute la mémoire du sol est rendue (elle se redessine au retour)
function releaseMapGround() {
  clearTimeout(_mapZoomTimer); _mapZoomTimer = null;
  for (const c of _mapChunks.values()) { c.width = 0; c.height = 0; }
  for (const c of _mapChunkPool) { c.width = 0; c.height = 0; }
  _mapChunks.clear(); _mapChunkPool.length = 0; _mapChunkState = null;
  _mapBlendCache.clear(); _mapGroundPatterns.clear();
}

function mapRenderChunk(i, j, st) {
  const c = _mapChunkPool.pop() || document.createElement('canvas');
  const px = Math.round(MAP_CHUNK * st.scale);
  if (c.width !== px) { c.width = px; c.height = px; }
  const ctx = c.getContext('2d');
  if (!ctx) { c.width = 0; c.height = 0; _mapChunkFailUntil = performance.now() + 2000; return null; }   // plus de mémoire de canvas (iOS) : couleur de repli, nouvel essai dans 2 s
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.setTransform(px / MAP_CHUNK, 0, 0, px / MAP_CHUNK, -i * px, -j * px);
  if (!st.fills) st.fills = mapGroundFills(st.tw, st.th);
  renderMapGroundRect(ctx, i * MAP_CHUNK, j * MAP_CHUNK, MAP_CHUNK, st.tw, st.th, st.night, st.fills);
  _mapChunks.set(i + ',' + j, c);
  return c;
}

function drawMapGround(worldToScreen, bounds, w, h, tw, th, night) {
  const scale = Math.min(canvasScale(), MAP_CHUNK_MAX_DPR);
  const now = performance.now();
  const failing = now < _mapChunkFailUntil;
  if (tw !== _mapLastTw) { _mapLastTw = tw; _mapZoomAt = now; }
  const sig = mapGroundSignature();
  const key = [tw, th, scale, night ? 1 : 0, sig].join('|');
  let st = _mapChunkState, s = 1, budget = MAP_CHUNKS_PER_FRAME;
  if (!st || st.key !== key) {
    const zooming = st && now - _mapZoomAt < 250 && st.night === night && st.sig === sig && st.scale === scale;
    if (zooming) {
      s = tw / st.tw; budget = 0;   // pendant le geste : les morceaux de l'échelle précédente, étirés ; tout est refait après
      clearTimeout(_mapZoomTimer);
      _mapZoomTimer = setTimeout(() => { _mapZoomTimer = null; if (mapTabActive() && typeof scheduleMapRender === 'function') scheduleMapRender(); }, 280);
    } else {
      for (const c of _mapChunks.values()) mapDropChunk(c);
      _mapChunks.clear();
      st = _mapChunkState = { key, tw, th, night, sig, scale, fills: null };
    }
  }
  const origin = worldToScreen(0, 0);
  const dpr = canvasScale();
  const ox = Math.round(origin.x * dpr) / dpr, oy = Math.round(origin.y * dpr) / dpr;
  const CS = MAP_CHUNK * s;
  const i0 = Math.floor(-ox / CS), i1 = Math.floor((w - ox) / CS), j0 = Math.floor(-oy / CS), j1 = Math.floor((h - oy) / CS);
  // les morceaux du centre de l'écran d'abord ; ceux qui manquent prennent la couleur de leur sol en attendant
  const order = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) order.push([i, j, Math.hypot(ox + (i + 0.5) * CS - w / 2, oy + (j + 0.5) * CS - h / 2)]);
  order.sort((p, q) => p[2] - q[2]);
  let missing = 0;
  for (const [i, j] of order) {
    const k = i + ',' + j;
    let c = _mapChunks.get(k);
    if (c) { _mapChunks.delete(k); _mapChunks.set(k, c); }
    else if (budget > 0 && !failing) { budget--; c = mapRenderChunk(i, j, st); }
    if (c) { mapCtx.drawImage(c, ox + i * CS, oy + j * CS, CS, CS); continue; }
    missing++;
    const X = (i + 0.5) * MAP_CHUNK, Y = (j + 0.5) * MAP_CHUNK;   // centre du morceau, dans le repère du monde à l'échelle st
    const g = Terrain.groundAt(Math.round(X / st.tw + Y / st.th), Math.round(Y / st.th - X / st.tw));
    mapCtx.fillStyle = MAP_GROUND_FALLBACK[g]?.color || '#6a9a48';
    mapCtx.fillRect(ox + i * CS, oy + j * CS, CS + 0.5, CS + 0.5);
    if (st.night) { mapCtx.fillStyle = MAP_NIGHT_VEIL; mapCtx.fillRect(ox + i * CS, oy + j * CS, CS + 0.5, CS + 0.5); }
  }
  // la suite à l'image suivante (ou dans 2 s si la mémoire de canvas manque), seulement si la carte est toujours affichée
  if (missing && s === 1 && !_mapChunkPending) {
    _mapChunkPending = true;
    const again = () => { _mapChunkPending = false; if (mapTabActive() && typeof scheduleMapRender === 'function') scheduleMapRender(); };
    if (now < _mapChunkFailUntil) setTimeout(again, _mapChunkFailUntil - now + 20); else requestAnimationFrame(again);
  }
  const keep = (i1 - i0 + 1) * (j1 - j0 + 1) + 8;
  while (_mapChunks.size > keep) { const k = _mapChunks.keys().next().value; const c = _mapChunks.get(k); _mapChunks.delete(k); mapDropChunk(c); }
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
const WORLD_ARMY_SCALE = 1 / (WORLD_OBJECT_FOOTPRINT * 1.2);   // drawIsoArmy dessine ses sprites à 1,2 case

// Image peinte livrée et chargeable (une image absente ou en erreur ne compte pas : le dessin de repli prend le relais)
function worldHas(p) { return typeof paintedSet !== 'undefined' && paintedSet.has(p) && !(typeof spriteFailed === 'function' && spriteFailed('assets/images/painted/' + p)); }
function worldArt(p) {
  if (!worldHas(p) || typeof getSprite !== 'function') return null;
  return getSprite('assets/images/painted/' + p);
}
// Une variante peinte parmi n, choisie au hasard (déterministe) pour la case ; null si aucune n'est livrée
function worldVariant(prefix, n, wx, wy, seed) {
  if (typeof paintedSet === 'undefined') return null;
  const start = Math.floor(Terrain.seededRandom(wx, wy, seed) * n);
  for (let k = 0; k < n; k++) { const p = `${prefix}${((start + k) % n) + 1}.webp`; if (worldHas(p)) return p; }
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
  if (f === 'bridge' || f === 'ford') { const p = `map/world/river/${f}_${mapCrossingAlongX(wx, wy) ? 'x' : 'y'}.webp`; return worldHas(p) ? p : null; }
  return null;
}

// ---- décor des cases libres, comme sur la carte de référence (rien n'est semé au hasard partout) ----
// Champs de blé autour des villes (2 à 4 cases de leurs murs) et sur la terre labourée, par groupes ; une meule à côté
// d'un champ ; un chemin de terre qui part de la porte (face sud-est) de chaque ville ; buissons et arbres isolés au bord de
// l'eau ; agaves sur l'herbe sèche, la terre et le sable, cactus au désert ; quelques cailloux ; décor givré sous la neige.
let mapCityNear = new Map();   // "x,y" -> distance (en cases, au plus 5) au bloc 2 × 2 de la ville la plus proche
let mapRoadCells = new Set();  // cases traversées par un chemin de terre (sans décor)
let mapRoads = [];             // [[{x, y}, …], …] tracés en coordonnées du monde
let _mapCitySig = '';
function rebuildMapCityRings() {
  const list = [];
  const seen = new Set();
  const add = (c) => { const k = c.x + ',' + c.y; if (!seen.has(k)) { seen.add(k); list.push({ x: c.x, y: c.y }); } };
  for (const o of mapData) if (o.type === 'CITY') add(o);
  for (const c of (typeof cities !== 'undefined' ? cities : [])) add(c);
  const sig = list.map(c => c.x + ',' + c.y).sort().join(';');
  if (sig === _mapCitySig) return;
  _mapCitySig = sig;
  mapCityNear = new Map(); mapRoadCells = new Set(); mapRoads = [];
  for (const c of list) for (let dy = -5; dy <= 6; dy++) for (let dx = -5; dx <= 6; dx++) {
    const d = Math.max(dx < 0 ? -dx : dx > 1 ? dx - 1 : 0, dy < 0 ? -dy : dy > 1 ? dy - 1 : 0);   // 0 sur le bloc, 1 sur la couronne
    const k = (c.x + dx) + ',' + (c.y + dy);
    if (!mapCityNear.has(k) || mapCityNear.get(k) > d) mapCityNear.set(k, d);
  }
  // chemin de terre : il sort par le milieu de la face sud-est (vers +x) et serpente sur quelques cases, jusqu'au premier
  // obstacle (relief, eau, forêt, autre ville)
  for (const c of list) {
    const pts = [], len = 4 + Math.floor(Terrain.seededRandom(c.x, c.y, 6201) * 3), ph = Terrain.seededRandom(c.x, c.y, 6202) * 6.28;
    for (let k = 0; k <= len * 2; k++) {
      const t = k / 2, px = c.x + 1.5 + t, py = c.y + 0.5 + Math.sin(t * 0.9 + ph) * 0.45 * Math.min(1, t / 1.5);
      const cx = Math.round(px), cy = Math.round(py), f = getTerrainType(cx, cy).feature;
      if (t >= 0.6 && (Terrain.BLOCKED[f] || Terrain.FOREST[f] || MAP_WET[f] || (mapObjectCells.has(cx + ',' + cy) && (cx > c.x + 1 || cy > c.y + 1 || cy < c.y)))) break;
      pts.push({ x: px, y: py });
      if (t >= 0.6) mapRoadCells.add(cx + ',' + cy);
    }
    if (pts.length > 2) mapRoads.push(pts);
  }
}
// Chemins de terre, dessinés sur le sol avant les éléments posés
function drawMapRoads(worldToScreen, tw, night) {
  if (!mapRoads.length) return;
  const tex = typeof getTerrainPattern === 'function' ? getTerrainPattern(mapCtx, 'road_dirt') : null;
  mapCtx.save();
  mapCtx.lineCap = 'round'; mapCtx.lineJoin = 'round';
  for (const pts of mapRoads) {
    const sp = pts.map(p => worldToScreen(p.x, p.y));
    const trace = () => { mapCtx.beginPath(); sp.forEach((p, i) => (i ? mapCtx.lineTo(p.x, p.y) : mapCtx.moveTo(p.x, p.y))); };
    trace(); mapCtx.strokeStyle = 'rgba(110,86,50,0.45)'; mapCtx.lineWidth = tw * 0.2; mapCtx.stroke();
    trace(); mapCtx.strokeStyle = tex || '#c9ad78'; mapCtx.lineWidth = tw * 0.14; mapCtx.stroke();
    if (tex) { mapCtx.strokeStyle = 'rgba(214,186,128,0.45)'; mapCtx.stroke(); }
    if (night) { mapCtx.strokeStyle = MAP_NIGHT_VEIL; mapCtx.lineWidth = tw * 0.2; mapCtx.stroke(); }
  }
  mapCtx.restore();
}

const MAP_SHORE = (wx, wy) => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (MAP_WET[getTerrainType(wx + dx, wy + dy).feature]) return true; return false; };
// Le champ de blé d'une case libre (sans relief) : autour des villes et sur la terre labourée, par groupes
function mapWheatAt(wx, wy) {
  const t = getTerrainType(wx, wy);
  if (t.feature || t.biome !== 'forest' || mapRoadCells.has(wx + ',' + wy) || terrainBlockedAt(wx, wy)) return false;
  const g = Terrain.groundAt(wx, wy);
  if (g === 'water' || g === 'ice' || g === 'sand' || MAP_SHORE(wx, wy)) return false;
  const zone = Terrain.valueNoise(wx, wy, 6102, 2.5) > 0.42, r = Terrain.seededRandom(wx, wy, 6103);
  const near = mapCityNear.get(wx + ',' + wy);
  return zone && ((near >= 2 && near <= 4 && r < 0.6) || (g === 'earth' && r < 0.5));
}
// Le décor d'une case libre : { kind, prefix, n } (images map/world/fields|decor/…) ou null
function mapDecorAt(wx, wy, terrain) {
  if (terrain.feature || mapRoadCells.has(wx + ',' + wy)) return null;
  const g = Terrain.groundAt(wx, wy);
  if (g === 'water' || g === 'ice') return null;
  const r = Terrain.seededRandom(wx, wy, 6101);
  if (terrain.biome === 'snow') {
    if (r < 0.04) return { kind: 'snowbush', prefix: 'map/world/decor/snow_bush_', n: 2 };
    if (r > 0.95) return { kind: 'snowstones', prefix: 'map/world/decor/snow_stones_', n: 2 };
    return null;
  }
  if (terrain.biome === 'desert') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (getTerrainType(wx + dx, wy + dy).feature === 'oasis') return null;   // les palmiers de l'oasis
    if (r < 0.05) return { kind: 'cactus', prefix: 'map/world/decor/cactus_', n: 2 };
    if (r > 0.95) return { kind: 'stones', prefix: 'map/world/decor/stones_', n: 3 };
    return null;
  }
  if (mapWheatAt(wx, wy)) return { kind: 'wheat', prefix: 'map/world/fields/wheat_', n: 3 };
  if (MAP_SHORE(wx, wy)) return r < 0.32 ? (r < 0.1 ? { kind: 'tree', prefix: 'map/world/decor/tree_', n: 3 } : { kind: 'bush', prefix: 'map/world/decor/bush_', n: 3 }) : null;
  const r2 = Terrain.seededRandom(wx, wy, 6104);
  if (r2 < 0.16) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (mapWheatAt(wx + dx, wy + dy)) return { kind: 'haystack', prefix: 'map/world/decor/haystack_', n: 2 };
  if ((g === 'drygrass' || g === 'earth') && r < 0.07) return { kind: 'agave', prefix: 'map/world/decor/agave_', n: 3 };
  if (g === 'grass' && r < 0.018) return { kind: 'tree', prefix: 'map/world/decor/tree_', n: 3 };
  if (r > 0.94) return { kind: 'stones', prefix: 'map/world/decor/stones_', n: 3 };
  return null;
}
// Repli dessiné d'un décor, tant que son image n'est pas livrée
function drawLegacyDecor(kind, x, y, tw, th, wx, wy) {
  const j = (s) => Terrain.seededRandom(wx, wy, s) - 0.5;
  if (kind === 'wheat') {
    const k = 0.92;
    mapCtx.beginPath(); mapCtx.moveTo(x, y - th / 2 * k); mapCtx.lineTo(x + tw / 2 * k, y); mapCtx.lineTo(x, y + th / 2 * k); mapCtx.lineTo(x - tw / 2 * k, y); mapCtx.closePath();
    mapCtx.fillStyle = '#d8b04a'; mapCtx.fill();
    mapCtx.strokeStyle = 'rgba(150,108,30,0.55)'; mapCtx.lineWidth = Math.max(0.6, tw * 0.012);
    for (let i = 1; i < 6; i++) { const u = i / 6 - 0.5; mapCtx.beginPath(); mapCtx.moveTo(x - tw / 4 * k + u * tw / 2 * k, y - th / 4 * k - u * th / 2 * k); mapCtx.lineTo(x + tw / 4 * k + u * tw / 2 * k, y + th / 4 * k - u * th / 2 * k); mapCtx.stroke(); }
    return;
  }
  if (kind === 'haystack') {
    const s = tw * 0.12;
    mapCtx.fillStyle = 'rgba(0,0,0,0.18)'; mapCtx.beginPath(); mapCtx.ellipse(x + s * 0.4, y + s * 0.15, s * 1.1, s * 0.45, 0, 0, Math.PI * 2); mapCtx.fill();
    mapCtx.fillStyle = '#d9b354'; mapCtx.beginPath(); mapCtx.ellipse(x, y - s * 0.4, s, s * 0.85, 0, Math.PI, 0); mapCtx.lineTo(x + s, y); mapCtx.lineTo(x - s, y); mapCtx.closePath(); mapCtx.fill();
    return;
  }
  if (kind === 'stones' || kind === 'snowstones') {
    mapCtx.fillStyle = kind === 'snowstones' ? '#c9d2da' : '#9a958a';
    for (let i = 0; i < 3; i++) { mapCtx.beginPath(); mapCtx.ellipse(x + j(6110 + i) * tw * 0.4, y + j(6120 + i) * th * 0.4, tw * 0.035, th * 0.05, 0, 0, Math.PI * 2); mapCtx.fill(); }
    return;
  }
  if (kind === 'agave' || kind === 'cactus') {
    mapCtx.strokeStyle = kind === 'cactus' ? '#4f8a3a' : '#6c9a4a'; mapCtx.lineWidth = Math.max(1, tw * 0.02); mapCtx.lineCap = 'round';
    const bx = x + j(6130) * tw * 0.3, by = y + j(6131) * th * 0.3, hgt = th * 0.45;
    for (let i = -2; i <= 2; i++) { mapCtx.beginPath(); mapCtx.moveTo(bx, by); mapCtx.lineTo(bx + i * tw * 0.025, by - hgt * (1 - Math.abs(i) * 0.18)); mapCtx.stroke(); }
    return;
  }
  if (kind === 'bush' || kind === 'snowbush') {
    mapCtx.fillStyle = kind === 'snowbush' ? '#dfe8ee' : '#4f7f35';
    const bx = x + j(6140) * tw * 0.3, by = y + j(6141) * th * 0.3;
    for (const [ox, oy, rr] of [[-0.05, 0, 0.07], [0.05, -0.01, 0.06], [0, -0.05, 0.065]]) { mapCtx.beginPath(); mapCtx.arc(bx + ox * tw, by + oy * tw, rr * tw, 0, Math.PI * 2); mapCtx.fill(); }
    return;
  }
  if (kind === 'tree') { drawIsoTree(x + j(6150) * tw * 0.2, y - th * 0.15, tw * 0.3, th * 0.75); }
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
  if (terrainBlockedAt(wx, wy) && !MAP_WET[f]) return;   // relief et décor effacés sous et autour des villes, sur les points de ressource
  if (!f) {   // case libre : son décor (champ, meule, cailloux, plantes…), comme sur la carte de référence
    const d = mapDecorAt(wx, wy, terrain);
    if (d) {
      const p = worldVariant(d.prefix, d.n, wx, wy, 6160), img = p && worldArt(p);
      if (img) drawWorldObject(img, x, y, tw);
      else if (!p) drawLegacyDecor(d.kind, x, y, tw, th, wx, wy);
    }
    if (terrain.biome !== 'desert') return;
  }
  drawMapDecor(x, y, tw, th, wx, wy, terrain);
  if (!f || f === 'water' || f === 'frozen' || f === 'oasis' || f === 'river') return;   // l'eau fait partie du sol
  const p = typeof paintedSet !== 'undefined' ? worldFeatureArt(wx, wy, terrain) : null;
  const img = p && worldArt(p);
  if (img) { drawWorldObject(img, x, y, tw); return; }
  if (p) return;   // image peinte en cours de chargement
  drawLegacyFeature(x, y, tw, th, wx, wy, terrain);
}
