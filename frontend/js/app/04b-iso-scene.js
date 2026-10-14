// ============================================================
// 04b-iso-scene.js — Vue ville et vue champs en vraie 2.5D isométrique.
// Remplace la mise en page circulaire : une grille iso (cellule = losange de largeur W), la ville sur un
// losange 5×5 de cellules (centre = Bâtiment principal, 8 cellules intérieures, 11 extérieures), les
// 18 champs sur une couronne autour. Terrain texturé plein écran, plaza de terre battue, murs et tours,
// caméra (déplacement au doigt, zoom pincé, molette, double tap pour recadrer), nuit avec lumières.
// Chargé après 02/03/04 : redéfinit calculateCitySlots, calculateFieldSlots, renderCityView,
// renderFieldsView et onCityMouseMove (le dessin des sprites reste dans 03/04).
// ============================================================

// ---------- Grille ----------
// Cellules de la ville : slot -> (gx, gy). Ordre : centre, anneau intérieur (8), anneau extérieur (11).
const ISO_CITY_CELLS = {
  0: [0, 0],
  1: [0, -1], 2: [1, -1], 3: [1, 0], 4: [1, 1], 5: [0, 1], 6: [-1, 1], 7: [-1, 0], 8: [-1, -1],
  9: [0, -2], 10: [1, -2], 11: [2, -1], 12: [2, 0], 13: [2, 1], 14: [1, 2], 15: [0, 2], 16: [-1, 2], 17: [-2, 1], 18: [-2, 0], 19: [-2, -1]
};
const ISO_CITY_SPARE = [-1, -2];   // cellule libre de l'anneau extérieur : décor
// Champs (slots clients 1-18 = emplacements serveur 101-118) : couronne à distance R_FIELD du centre, par type
const R_FIELD = 3.4;
const ISO_FIELD_CELLS = {
  1: [-1, -R_FIELD], 2: [0, -R_FIELD], 3: [1, -R_FIELD], 4: [2, -R_FIELD],                 // LUMBER : derrière
  5: [R_FIELD, -2], 6: [R_FIELD, -1], 7: [R_FIELD, 0], 8: [R_FIELD, 1],                    // QUARRY : côté droit
  9: [-R_FIELD, -2], 10: [-R_FIELD, -1], 11: [-R_FIELD, 0], 12: [-R_FIELD, 1],             // IRON_MINE : côté gauche
  13: [R_FIELD, 2], 14: [2, R_FIELD], 15: [1, R_FIELD], 16: [0, R_FIELD], 17: [-1, R_FIELD], 18: [-2, R_FIELD]   // FARM : devant
};
const ISO_FIELD_TYPE = (slot) => slot <= 4 ? 'LUMBER' : slot <= 8 ? 'QUARRY' : slot <= 12 ? 'IRON_MINE' : 'FARM';
const ISO_FIELD_SPARE = [[-R_FIELD, 2], [-2, -R_FIELD], [-R_FIELD, -R_FIELD], [R_FIELD, R_FIELD]];
const R_PLAZA = 2.75, R_WALL = 2.75;   // l'enceinte se dresse sur le bord du plateau

// ---------- Caméra ----------
const cityCam = { x: 0, y: 0, zoom: 1 };
const ISO_ZOOM_MIN = 0.6, ISO_ZOOM_MAX = 2.4;
let isoCellW = 96;          // largeur de cellule (px logiques) au dernier rendu
// Badge de niveau adapté à la taille des cellules (petit, au coin droit de la parcelle, lisible dès 2× DPR)
function isoBadgeSpec(x, y, hw, hh) { const r = Math.max(6.5, Math.min(10, isoCellW * 0.11)); return { x: x + hw * 0.62, y: y + hh * 0.35, radius: r }; }
let isoOrigin = { x: 0, y: 0 };

function isoSceneExtent(view) {
  // demi-largeur (cellules) et marges verticales (cellules) de la scène à cadrer
  // Sur téléphone, le cadrage par défaut colle à l'enceinte (la ville remplit la largeur ; on peut dézoomer)
  const tight = cityViewW < 500;
  return view === 'fields' ? { hw: R_FIELD + (tight ? 0.3 : 0.55), top: (R_FIELD + 0.5) * 0.5 + 0.8, bottom: (R_FIELD + 0.5) * 0.5 + 0.3 } : { hw: R_WALL + (tight ? 0.12 : 0.35), top: R_WALL * 0.5 + 0.95, bottom: R_WALL * 0.5 + 0.35 };
}
function isoLayout(view) {
  const ext = isoSceneExtent(view);
  const padX = cityViewW < 500 ? 4 : 40, padY = cityViewW < 500 ? 16 : 40;
  const fitW = Math.min((cityViewW - padX * 2) / (ext.hw * 2), (cityViewH - padY * 2) / (ext.top + ext.bottom));
  const W = Math.max(26, Math.min(190, fitW * cityCam.zoom));
  const cx = cityViewW / 2 + cityCam.x, cy = cityViewH / 2 + cityCam.y + (ext.top - ext.bottom) * W / 2;
  return { W, cx, cy, ext };
}
function isoPos(gx, gy, W, cx, cy) { return { x: cx + (gx - gy) * W / 2, y: cy + (gx + gy) * W / 4 }; }
function clampCam(view) {
  const { W, ext } = isoLayout(view);
  const lx = ext.hw * W, ly = (ext.top + ext.bottom) * W / 2;
  cityCam.x = Math.max(-lx, Math.min(lx, cityCam.x));
  cityCam.y = Math.max(-ly, Math.min(ly, cityCam.y));
}
function resetCityCamera() { cityCam.x = 0; cityCam.y = 0; cityCam.zoom = 1; }

// ---------- Emplacements (contrat citySlots conservé : slot, x, y, size, fixed, isField, fieldType…) ----------
function calculateCitySlots() {
  if (!cityCanvas) return;
  const { W, cx, cy } = isoLayout('city');
  isoCellW = W; isoOrigin = { x: cx, y: cy };
  citySlots = [];
  for (const [slot, [gx, gy]] of Object.entries(ISO_CITY_CELLS)) {
    const p = isoPos(gx, gy, W, cx, cy);
    const s = Number(slot);
    // size : le sprite (1,7 × size = 1,22 W) pose son losange de parcelle (100/130 de sa largeur = 0,94 W) sur la cellule
    citySlots.push({ slot: s, gx, gy, x: p.x, y: p.y, size: W * 0.72, hw: W * 0.47, hh: W * 0.235, fixed: s === 0, fixedKey: s === 0 ? 'MAIN_HALL' : undefined, ring: s === 0 ? 'center' : s <= 8 ? 'inner' : 'outer' });
  }
}
function calculateFieldSlots() {
  if (!cityCanvas) return;
  const { W, cx, cy } = isoLayout('fields');
  isoCellW = W; isoOrigin = { x: cx, y: cy };
  citySlots = [];
  citySlots.push({ slot: -1, gx: 0, gy: 0, x: cx, y: cy, size: W * 2.5, hw: W * R_PLAZA, hh: W * R_PLAZA / 2, isVillageCenter: true });
  for (const [slot, [gx, gy]] of Object.entries(ISO_FIELD_CELLS)) {
    const p = isoPos(gx, gy, W, cx, cy);
    const s = Number(slot);
    citySlots.push({ slot: s, gx, gy, x: p.x, y: p.y, size: W * 0.815, hw: W * 0.47, hh: W * 0.235, isField: true, fieldType: ISO_FIELD_TYPE(s), ring: 3 });   // sprite 1,5 × size = 1,22 W
  }
}

// ---------- Primitives canvas (style peint : dégradés + trait brun) ----------
const ISO_LINE = 'rgba(58,36,20,0.75)';
function isoShade(hex, pct) { return shadeColor(hex, pct); }
function isoDiamondPath(ctx, x, y, hw, hh) {
  ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x, y + hh); ctx.closePath();
}
function isoShadowEllipse(ctx, x, y, rx, ry, alpha = 0.25) { ctx.fillStyle = `rgba(20,12,4,${alpha})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

// ---------- Scène ----------
function isoSeeded(n) { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); }

// Terrain plein écran : texture du biome + modelé doux + vignette, rendu une fois par taille/biome/nuit puis blitté
let isoTerrainCache = { key: '', canvas: null };
function drawIsoTerrain(ctx, biome, night) {
  const scene = biomeScene(biome);
  const scale = canvasScale();
  const textureReady = !!getTerrainPattern(ctx, scene.texture);
  const key = `${cityViewW}x${cityViewH}@${biome}@${night}@${scale}@${textureReady}`;
  if (isoTerrainCache.key !== key) {
    const off = document.createElement('canvas');
    off.width = Math.round(cityViewW * scale); off.height = Math.round(cityViewH * scale);
    const oc = off.getContext('2d');
    oc.setTransform(scale, 0, 0, scale, 0, 0);
    const grad = oc.createLinearGradient(0, 0, 0, cityViewH);
    const ramp = night ? scene.night : scene.day;
    grad.addColorStop(0, ramp[1]); grad.addColorStop(1, ramp[3]);
    oc.beginPath(); oc.rect(0, 0, cityViewW, cityViewH);
    fillTextured(oc, scene.texture, grad, night ? 0.86 : 0.42);
    const v = oc.createRadialGradient(cityViewW / 2, cityViewH / 2, Math.min(cityViewW, cityViewH) * 0.35, cityViewW / 2, cityViewH / 2, Math.max(cityViewW, cityViewH) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, night ? 'rgba(0,0,0,0.55)' : 'rgba(30,20,10,0.3)');
    oc.fillStyle = v; oc.fillRect(0, 0, cityViewW, cityViewH);
    isoTerrainCache = { key, canvas: off };
  }
  ctx.drawImage(isoTerrainCache.canvas, 0, 0, cityViewW, cityViewH);
}

// Plaza de terre battue sous la ville : plateau en relief (faces avant sombres) avec ombre portée douce
function drawIsoPlaza(ctx, cx, cy, W, night) {
  const hw = R_PLAZA * W, hh = R_PLAZA * W / 2, th = W * 0.14;
  ctx.save();
  ctx.shadowColor = night ? 'rgba(0,0,0,0.7)' : 'rgba(20,12,4,0.45)'; ctx.shadowBlur = W * 0.5; ctx.shadowOffsetY = W * 0.12;
  ctx.fillStyle = night ? '#2a1e14' : '#6a4a2c';
  isoDiamondPath(ctx, cx, cy + th, hw, hh); ctx.fill();
  ctx.restore();
  // faces du plateau
  ctx.fillStyle = night ? '#3a2a1c' : '#8a6238';
  ctx.beginPath(); ctx.moveTo(cx - hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx, cy + hh + th); ctx.lineTo(cx - hw, cy + th); ctx.closePath(); ctx.fill();
  ctx.fillStyle = night ? '#2e2016' : '#6e4c2a';
  ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx + hw, cy + th); ctx.lineTo(cx, cy + hh + th); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ISO_LINE; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - hw, cy); ctx.lineTo(cx - hw, cy + th); ctx.lineTo(cx, cy + hh + th); ctx.lineTo(cx + hw, cy + th); ctx.lineTo(cx + hw, cy); ctx.stroke();
  isoDiamondPath(ctx, cx, cy, hw, hh);
  const g = ctx.createRadialGradient(cx, cy - hh * 0.2, W * 0.5, cx, cy, hw);
  g.addColorStop(0, night ? '#4a3a2a' : '#c9a876'); g.addColorStop(1, night ? '#2e2218' : '#a07a4c');
  fillTextured(ctx, 'dirt', g, night ? 0.82 : 0.45);
  ctx.strokeStyle = night ? 'rgba(20,12,4,0.8)' : 'rgba(90,60,30,0.7)'; ctx.lineWidth = Math.max(1.5, W * 0.03);
  isoDiamondPath(ctx, cx, cy, hw, hh); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,200,0.25)'; ctx.lineWidth = 1;
  isoDiamondPath(ctx, cx, cy, hw - 3, hh - 1.5); ctx.stroke();
}

// Chemins de terre entre la ville et les champs
function drawIsoFieldPaths(ctx, cx, cy, W, night) {
  ctx.lineCap = 'round';
  ctx.lineWidth = W * 0.2;
  ctx.beginPath();
  for (const s of citySlots) {
    if (!s.isField) continue;
    const towards = isoPos(Math.sign(s.gx) * Math.min(Math.abs(s.gx), R_PLAZA - 0.3), Math.sign(s.gy) * Math.min(Math.abs(s.gy), R_PLAZA - 0.3), W, cx, cy);
    ctx.moveTo(s.x, s.y); ctx.lineTo(towards.x, towards.y);
  }
  strokeTextured(ctx, 'dirt', night ? '#3a2c1e' : '#b89468', night ? 0.85 : 0.5);
}

// Enceinte (si le Mur est construit) : sprites rendus en 3D (assets/images/3d/walls/<faction>/<palier>_*.webp) :
// un tronçon de courtine par sixième de côté (hauts à l'arrière, murets à l'avant pour laisser voir la ville)
// et quatre tours d'angle, selon la faction, le palier du Mur (niveaux 1-6, 7-13, 14-20) et le biome (neige),
// triés en profondeur avec le reste de la scène. Tant que les images ne sont pas chargées, rien n'est dessiné
// (le rendu est relancé à leur chargement).
// Drapeaux animés : mât et étoffe rendus en 3D en 8 phases (props/flag_<faction|ally|gold>_<k>.webp), posés sur
// les bâtiments qui en portent (mât en unités iso : ix, iy, iz, hauteur[, étoffe]) et sur l'enceinte au palier 3
const ISO_FLAGS = { MAIN_HALL: [[0, 0, 2.28, 0.8]], BARRACKS: [[-0.95, -0.55, 1.1, 0.7]], GREAT_BARRACKS: [[1.05, -0.75, 1.4, 0.7]], EMBASSY: [[-0.9, -0.6, 2.05, 0.7], [0.9, -0.6, 2.05, 0.7, 'ally']], HERO_MANSION: [[0.75, -0.25, 2.35, 0.6]], HUN_WAR_TENT: [[0, 0, 1.6, 0.5]], RALLY_POINT: [[0, 0, 0.06, 1.4]], SULTAN_DESERT_OUTPOST: [[0.75, -0.55, 2.8, 0.4, 'gold']] };
const WALL_SEG_FLAG_Z = { GAUL: 1.8, HUN: 1.8 }, WALL_TOWER_FLAG_Z = { ROME: 3.21, SULTAN: 3.51, GAUL: 3.31, HUN: 3.31, EGYPT: 2.31, GREEK: 2.81 };
const FLAG_FRAMES = 8, FLAG_POLE_PX = 43 / 96;   // dans le cadre 64×96 du drapeau, le mât d'une unité mesure 43 px
let isoWallFlags = [];
// Ancre écran et hauteur (px) d'un drapeau porté par un sprite de largeur w (cadre 130 px : 1 unité de hauteur = 30,6 px)
function isoFlagAt(x, y, w, ix, iy, iz, h, kind) { const p = spritePointToScreen(x, y, w, ix, iy, iz); return { x: p.x, y: p.y, hpx: h * w * (30.6 / 130) / FLAG_POLE_PX, kind, seed: Math.abs(Math.round(x + y)) }; }
function wallSpriteUrl(name, tier) { return `assets/images/3d/walls/${player?.faction || 'ROME'}/${tier}_${name}${cityBiome() === 'snow' ? '_snow' : ''}.webp`; }
function isoWallItems(ctx, cx, cy, W, wallLevel, night, lowAll = false) {
  const tier = wallLevel <= 6 ? 1 : wallLevel <= 13 ? 2 : 3;
  const img = {};
  for (const n of ['seg_x', 'seg_x_low', 'seg_z', 'seg_z_low', 'tower']) img[n] = getSprite(wallSpriteUrl(n, tier));
  if (Object.values(img).some(i => !i)) return [];
  const R = R_WALL, N = 6, L = 2 * R / N;   // un tronçon couvre L cellules ; le sprite représente une cellule et est mis à l'échelle
  const variant = spriteVariant(false);
  const faction = player?.faction || 'ROME';
  const items = [];
  isoWallFlags = [];
  const edge = (from, to, high, along) => {
    const sprite = img[`seg_${along}${high && !lowAll ? '' : '_low'}`];
    const sw = W * L / SPRITE_PLOT_W * 1.03;
    for (let k = 0; k < N; k++) {
      const t = (k + 0.5) / N;
      const g = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      const p = isoPos(g[0], g[1], W, cx, cy);
      items.push({ depth: g[0] + g[1], y: p.y, draw: () => drawSprite(ctx, sprite, p.x, p.y, sw, variant) });
      if (tier === 3 && high && !lowAll) isoWallFlags.push(isoFlagAt(p.x, p.y, sw, 0, 0, WALL_SEG_FLAG_Z[faction] || 1.35, 0.6, faction));
    }
  };
  edge([-R, R], [-R, -R], true, 'z');    // arrière gauche (le long de iy)
  edge([-R, -R], [R, -R], true, 'x');    // arrière droit (le long de ix)
  edge([R, -R], [R, R], false, 'z');     // avant droit
  edge([R, R], [-R, R], false, 'x');     // avant gauche
  for (const [gx, gy, scale] of [[-R, -R, 1], [-R, R, 1], [R, -R, 1], [R, R, 0.85]]) {
    const p = isoPos(gx, gy, W, cx, cy);
    const tw = W / SPRITE_PLOT_W * scale * (lowAll ? 0.8 : 1);
    items.push({ depth: gx + gy + 0.01, y: p.y, draw: () => drawSprite(ctx, img.tower, p.x, p.y, tw, variant) });
    if (tier === 3 && !lowAll) isoWallFlags.push(isoFlagAt(p.x, p.y, tw, 0, 0, WALL_TOWER_FLAG_Z[faction] || 3.2, 0.6, faction));
  }
  void night;
  return items;
}

// Route de terre qui quitte la ville par le sud (sous la tour avant) et sort de l'écran
function drawIsoRoad(ctx, cx, cy, W, night) {
  const x0 = cx, y0 = cy + R_PLAZA * W / 2 + W * 0.14;
  ctx.lineCap = 'round'; ctx.lineWidth = W * 0.34;
  ctx.beginPath(); ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(x0 + W * 0.2, y0 + W * 1.2, x0 - W * 0.9, cityViewH - W * 0.5, x0 - W * 0.6, cityViewH + W);
  strokeTextured(ctx, 'dirt', night ? '#3a2c1e' : '#b89468', night ? 0.85 : 0.5);
  ctx.strokeStyle = night ? 'rgba(0,0,0,0.25)' : 'rgba(90,60,30,0.28)'; ctx.lineWidth = W * 0.36; ctx.globalCompositeOperation = 'multiply';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + W * 0.2, y0 + W * 1.2, x0 - W * 0.9, cityViewH - W * 0.5, x0 - W * 0.6, cityViewH + W); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

// Décors autour de la scène (arbres, rochers du biome), positions stables
function isoSceneProps(view, W, cx, cy) {
  const props = biomeScene(cityBiome()).props;
  const out = [];
  const rMin = view === 'fields' ? Math.ceil(R_FIELD) + 1 : Math.ceil(R_WALL) + 1, rMax = rMin + 2;
  for (let gx = -rMax; gx <= rMax; gx++) for (let gy = -rMax; gy <= rMax; gy++) {
    const r = Math.max(Math.abs(gx), Math.abs(gy));
    if (r < rMin || r > rMax) continue;
    const seed = (gx + 50) * 97 + (gy + 50) * 13 + (view === 'fields' ? 7 : 0);
    const roll = isoSeeded(seed);
    if (roll > 0.38) continue;
    const p = isoPos(gx + (isoSeeded(seed + 1) - 0.5) * 0.7, gy + (isoSeeded(seed + 2) - 0.5) * 0.7, W, cx, cy);
    const kind = roll < 0.07 ? props.rock : props.trees[Math.floor(isoSeeded(seed + 3) * props.trees.length)];
    out.push({ x: p.x, y: p.y, kind, h: W * (kind === props.rock ? 0.5 : 0.75 + isoSeeded(seed + 4) * 0.35), depth: gx + gy });
  }
  return out;
}

// Parcelle au sol (rendu 3D du biome) sous chaque cellule ; la variante dépend de la cellule
function drawIsoPlot(ctx, s) {
  const img = getSprite(plotSpriteUrl((s.gx * 3 + s.gy * 5 + 10) & 1));
  if (img) drawSprite(ctx, img, s.x, s.y, s.hw * 2 / SPRITE_PLOT_W, spriteVariant(false));
}
// Parcelle vide : losange en pointillé + « + »
function drawIsoEmptyCell(ctx, s, hovered, night, label = '+') {
  ctx.fillStyle = night ? 'rgba(20,16,10,0.35)' : 'rgba(80,60,36,0.14)';
  isoDiamondPath(ctx, s.x, s.y, s.hw, s.hh); ctx.fill();
  ctx.setLineDash([5, 4]); ctx.lineWidth = hovered ? 2.5 : 1.5; ctx.strokeStyle = hovered ? '#ffd700' : 'rgba(255,240,200,0.5)';
  if (hovered) { ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 12; }
  ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
  ctx.fillStyle = hovered ? '#ffd700' : 'rgba(255,240,200,0.7)';
  ctx.font = `bold ${Math.round(s.hw * 0.55)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, s.x, s.y);
}
function drawIsoHoverCell(ctx, s) {
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2.5; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 14;
  isoDiamondPath(ctx, s.x, s.y, s.hw + 2, s.hh + 1); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,215,0,0.12)'; ctx.fill();
}

// Nuit : voile bleu + lueurs chaudes aux bâtiments habités
function drawIsoNight(ctx, lit) {
  ctx.fillStyle = 'rgba(12,16,46,0.42)'; ctx.fillRect(0, 0, cityViewW, cityViewH);
  ctx.globalCompositeOperation = 'lighter';
  try {
    const t = performance.now() / 180;
    for (const l of lit) {
      const a = l.a + (l.seed !== undefined ? Math.sin(t + l.seed) * 0.03 : 0);
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, `rgba(255,170,60,${a})`); g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
    }
  } finally { ctx.globalCompositeOperation = 'source-over'; }
}

function cityWallLevel() { return (currentCity?.buildings || []).find(b => b.key === 'WALL')?.level || 0; }

// ---------- Animations légères (12 i/s) : fumée des cheminées, reflets d'eau, oiseaux, torches ----------
// Position (ix, iy, iz) dans le repère du sprite (tools/build-assets.cjs : P()) -> écran, pour un sprite de
// largeur w dont le centre du losange est en (x, y)
function spritePointToScreen(x, y, w, ix, iy, iz) {
  const px = 100 + (ix - iy) * 25, py = 70 + (ix + iy) * 12.5 - iz * 30.6;   // 1 unité = 25 px en x, 12,5 px en profondeur, 30,6 px en hauteur (cadre 130 px)
  return { x: x + ((px - 100) / 130) * w, y: y + ((py - 70) / 130) * w };
}
// Sommets des cheminées des modèles 3D (ix, iy, iz) : la fumée part de là
const ISO_CHIMNEYS = { WORKSHOP: [[-0.5, -0.3, 1.7]], FORGE: [[0.2, -0.3, 1.7]], BAKERY: [[0.3, -0.4, 1.75]], FOUNDRY: [[-0.4, -0.4, 1.85], [0.2, -0.4, 1.85]], GALLIC_BREWERY: [[0.2, -0.4, 1.7]] };
const ISO_WATER = { MOAT: [0, 0, 0.02, 0.9], ROMAN_THERMAE: [0, 0.5, 0.14, 0.5], EGYPTIAN_IRRIGATION: [0, 0, 0.03, 0.8] };   // ix, iy, iz, rayon (cellules)
const isoAnim = { smoke: [], birds: null, nextBirds: 0, last: 0, camKey: '' };
function isoAnimate(ctx, built, W, night, flags = []) {
  const now = performance.now() / 1000;
  // drapeaux : 8 phases à 10 i/s, décalées d'un mât à l'autre
  const fv = spriteVariant(false);
  for (const f of flags) drawProp(ctx, `flag_${f.kind}_${(Math.floor(now * 10) + f.seed) % FLAG_FRAMES}`, f.x, f.y, f.hpx, fv);
  const camKey = `${W}|${cityCam.x}|${cityCam.y}`;
  if (camKey !== isoAnim.camKey) { isoAnim.camKey = camKey; isoAnim.smoke = []; }   // les particules sont en pixels écran
  const dt = Math.min(0.2, now - (isoAnim.last || now)); isoAnim.last = now;
  // fumée
  for (const b of built) {
    for (const ch of ISO_CHIMNEYS[b.key] || []) {
      const p = spritePointToScreen(b.x, b.y, b.w, ch[0], ch[1], ch[2]);
      if (Math.random() < dt * 2.2 && isoAnim.smoke.length < 160) isoAnim.smoke.push({ x: p.x + (Math.random() - 0.5) * W * 0.03, y: p.y - W * 0.04, r: W * 0.03, a: 0.5, vx: W * 0.025, vy: -W * 0.11, life: 0, k: Math.floor(Math.random() * 4) });
    }
  }
  for (const pf of isoAnim.smoke) { pf.life += dt; pf.x += (pf.vx + Math.sin(pf.life * 3) * W * 0.02) * dt; pf.y += pf.vy * dt; pf.r += W * 0.05 * dt; pf.a -= 0.19 * dt; }
  isoAnim.smoke = isoAnim.smoke.filter(pf => pf.a > 0.02);
  // volutes rendues en 3D (props/puff_<k>.webp), dimensionnées sur le rayon de la particule
  for (const pf of isoAnim.smoke) { const img = getSprite(`assets/images/3d/props/puff_${pf.k}.webp`); if (!img) continue; ctx.globalAlpha = pf.a * (night ? 0.55 : 1); const s = pf.r * 3.2; ctx.drawImage(img, pf.x - s / 2, pf.y - s / 2, s, s); }
  ctx.globalAlpha = 1;
  // ondes d'eau : anneaux rendus en 3D en 4 phases (props/ripple_<k>.webp), trois ondes décalées par plan d'eau
  for (const b of built) {
    const wt = ISO_WATER[b.key];
    if (!wt) continue;
    const p = spritePointToScreen(b.x, b.y, b.w, wt[0], wt[1], wt[2]);
    const rr = wt[3] * b.w * 0.27, sw = rr * 2.9, sh = sw * 64 / 96;
    for (let i = 0; i < 3; i++) {
      const t = (now * 0.45 + i / 3) % 1;
      const img = getSprite(`assets/images/3d/props/ripple_${Math.min(3, Math.floor(t * 4))}.webp`);
      if (!img) continue;
      ctx.globalAlpha = (night ? 0.5 : 0.85) * (1 - t * 0.5);
      ctx.drawImage(img, p.x + Math.cos(i * 2.1) * rr * 0.25 - sw / 2, p.y + Math.sin(i * 2.1) * rr * 0.12 - sh / 2, sw, sh);
    }
    ctx.globalAlpha = 1;
  }
  // vol d'oiseaux toutes les ~25 s
  if (!isoAnim.birds && now > isoAnim.nextBirds) { const fromLeft = Math.random() < 0.5; isoAnim.birds = { x: fromLeft ? -40 : cityViewW + 40, y: cityViewH * (0.12 + Math.random() * 0.25), dir: fromLeft ? 1 : -1, t: 0 }; }
  if (isoAnim.birds) {
    const bd = isoAnim.birds; bd.t += dt; bd.x += bd.dir * dt * Math.max(60, cityViewW * 0.09);
    ctx.strokeStyle = night ? 'rgba(20,24,40,0.6)' : 'rgba(40,30,20,0.6)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) {
      const bx = bd.x - bd.dir * i * 11 + (i % 2) * 3, by = bd.y + Math.abs(i - 2) * 6 + Math.sin(bd.t * 2 + i) * 2, flap = Math.sin(bd.t * 10 + i) * 2.5;
      ctx.beginPath(); ctx.moveTo(bx - 5, by + flap); ctx.quadraticCurveTo(bx, by - 2, bx + 5, by + flap); ctx.stroke();
    }
    if (bd.x < -60 || bd.x > cityViewW + 60) { isoAnim.birds = null; isoAnim.nextBirds = now + 18 + Math.random() * 20; }
  }
}

// ---------- Rendu ----------
// Signature de tout ce qui change le fond statique de la ville (bâtiments, files, survol, caméra, sprites chargés)
let isoStatic = { key: '', canvas: null, overlay: [], built: [], lit: [] };
function isoStaticKey(view, W, cx, cy, night, biome) {
  const b = (currentCity?.buildings || []).map(x => x.key + x.slot + ':' + x.level).join(',');
  const q = (currentCity?.buildQueue || []).map(x => x.slot + x.status).join(',');
  let ready = 0; for (const s of _sprites.values()) if (s.ready) ready++;
  return [view, currentCity?.id, W.toFixed(2), cx.toFixed(1), cy.toFixed(1), cityViewW, cityViewH, night, biome, cityHoveredSlot, b, q, ready, paintedSet.size, canvasScale(), player?.faction].join('|');
}

function renderCityView() {
  setupCityGestures();
  clampCam('city');
  calculateCitySlots();
  const mainCtx = cityCtx, night = isNightMode(), biome = cityBiome();
  const { W, cx, cy } = isoLayout('city');
  const key = isoStaticKey('city', W, cx, cy, night, biome);
  if (isoStatic.key !== key) {
    // Rendu complet dans un canvas hors écran (les fonctions de dessin écrivent dans cityCtx : on le détourne)
    const scale = canvasScale();
    const off = isoStatic.canvas && isoStatic.canvas.width === Math.round(cityViewW * scale) && isoStatic.canvas.height === Math.round(cityViewH * scale) ? isoStatic.canvas : document.createElement('canvas');
    off.width = Math.round(cityViewW * scale); off.height = Math.round(cityViewH * scale);
    const octx = off.getContext('2d');
    octx.setTransform(scale, 0, 0, scale, 0, 0);
    cityCtx = octx;
    let result;
    try { result = renderCityStatic(octx, W, cx, cy, night, biome); } finally { cityCtx = mainCtx; }
    isoStatic = { key, canvas: off, overlay: result.overlay, built: result.built, lit: result.lit, flags: result.flags || [] };
  }
  mainCtx.clearRect(0, 0, cityViewW, cityViewH);
  mainCtx.drawImage(isoStatic.canvas, 0, 0, cityViewW, cityViewH);
  // Couches animées par-dessus : fumée, reflets, oiseaux, lueurs de nuit, puis badges et indicateurs
  isoAnimate(mainCtx, isoStatic.built, W, night, isoStatic.flags);
  if (night) drawIsoNight(mainCtx, isoStatic.lit);
  for (const fn of isoStatic.overlay) fn();
}

// Fond statique de la vue ville ; renvoie les éléments à dessiner chaque image (overlay, bâtiments, lumières)
function renderCityStatic(ctx, W, cx, cy, night, biome) {
  ctx.clearRect(0, 0, cityViewW, cityViewH);
  drawIsoTerrain(ctx, biome, night);
  drawIsoRoad(ctx, cx, cy, W, night);
  // Objets triés de l'arrière vers l'avant (profondeur gx+gy, puis y écran) ; l'enceinte est poussée avant
  // les bâtiments pour qu'à profondeur égale elle reste derrière eux
  const items = [];
  for (const p of isoSceneProps('city', W, cx, cy)) items.push({ depth: p.depth, y: p.y, draw: () => drawProp(ctx, p.kind, p.x, p.y, p.h, spriteVariant(false)) });
  drawIsoPlaza(ctx, cx, cy, W, night);
  const wallLevel = cityWallLevel();
  if (wallLevel > 0) items.push(...isoWallItems(ctx, cx, cy, W, wallLevel, night));
  const lit = [], built = [];
  isoOverlayQueue = [];
  for (const s of citySlots) {
    const building = getBuildingAtSlot(s.slot);
    const hovered = cityHoveredSlot === s.slot;
    const key = s.fixed ? s.fixedKey : building?.key;
    const level = building?.level || (s.fixed ? 1 : 0);
    const isBuilding = currentCity?.buildQueue?.some(q => q.slot === s.slot && q.status === 'RUNNING');
    items.push({ depth: s.gx + s.gy, y: s.y, draw: () => {
      drawIsoPlot(ctx, s);
      if (!key) { drawIsoEmptyCell(ctx, s, hovered, night); return; }
      if (hovered) drawIsoHoverCell(ctx, s);
      draw25DBuilding(s.x, s.y, s.size, key, level, hovered, isBuilding);
    } });
    if (key) built.push({ key, x: s.x, y: s.y, w: s.size * 1.7 });
    if (key && night) lit.push({ x: s.x, y: s.y - W * 0.22, r: W * 0.55, a: 0.3, seed: s.slot });
  }
  // cellule libre : un arbre d'agrément
  const spare = isoPos(ISO_CITY_SPARE[0], ISO_CITY_SPARE[1], W, cx, cy);
  items.push({ depth: ISO_CITY_SPARE[0] + ISO_CITY_SPARE[1], y: spare.y, draw: () => drawProp(ctx, biomeScene(biome).props.trees[1], spare.x, spare.y + W * 0.1, W * 0.8, spriteVariant(false)) });
  items.sort((a, b) => a.depth - b.depth || a.y - b.y);
  for (const it of items) it.draw();
  const overlay = isoOverlayQueue; isoOverlayQueue = null;
  const flags = wallLevel > 0 ? [...isoWallFlags] : [];
  for (const b of built) for (const f of ISO_FLAGS[b.key] || []) flags.push(isoFlagAt(b.x, b.y, b.w, f[0], f[1], f[2], f[3], f[4] || player?.faction || 'ROME'));
  return { overlay, built, lit, flags };
}

function renderFieldsView() {
  if (!cityCanvas || !cityCtx) return;
  setupCityGestures();
  clampCam('fields');
  calculateFieldSlots();
  const mainCtx = cityCtx, night = isNightMode(), biome = cityBiome();
  const { W, cx, cy } = isoLayout('fields');
  const key = isoStaticKey('fields', W, cx, cy, night, biome);
  if (isoStatic.key !== key) {
    const scale = canvasScale();
    const off = isoStatic.canvas && isoStatic.canvas.width === Math.round(cityViewW * scale) && isoStatic.canvas.height === Math.round(cityViewH * scale) ? isoStatic.canvas : document.createElement('canvas');
    off.width = Math.round(cityViewW * scale); off.height = Math.round(cityViewH * scale);
    const octx = off.getContext('2d');
    octx.setTransform(scale, 0, 0, scale, 0, 0);
    cityCtx = octx;
    let result;
    try { result = renderFieldsStatic(octx, W, cx, cy, night, biome); } finally { cityCtx = mainCtx; }
    isoStatic = { key, canvas: off, overlay: result.overlay, built: [], lit: result.lit };
  }
  mainCtx.clearRect(0, 0, cityViewW, cityViewH);
  mainCtx.drawImage(isoStatic.canvas, 0, 0, cityViewW, cityViewH);
  if (night) drawIsoNight(mainCtx, isoStatic.lit);
  for (const fn of isoStatic.overlay) fn();
}

function renderFieldsStatic(ctx, W, cx, cy, night, biome) {
  ctx.clearRect(0, 0, cityViewW, cityViewH);
  drawIsoTerrain(ctx, biome, night);
  drawIsoRoad(ctx, cx, cy, W, night);
  drawIsoFieldPaths(ctx, cx, cy, W, night);
  drawIsoPlaza(ctx, cx, cy, W, night);
  const items = [];
  for (const p of isoSceneProps('fields', W, cx, cy)) items.push({ depth: p.depth, y: p.y, draw: () => drawProp(ctx, p.kind, p.x, p.y, p.h, spriteVariant(false)) });
  const wallLevel = cityWallLevel();
  if (wallLevel > 0) items.push(...isoWallItems(ctx, cx, cy, W, wallLevel, night, true));   // murets bas : les champs restent visibles
  const lit = [];
  const centerHovered = cityHoveredSlot === -1;
  // La ville au centre, en silhouette compacte : les bâtiments de l'anneau intérieur à échelle réduite autour
  // du Bâtiment principal (un clic sur le plateau ouvre la vue ville)
  for (const [slot, [gx, gy]] of Object.entries(ISO_CITY_CELLS)) {
    const s = Number(slot);
    if (s > 8) continue;
    const building = getBuildingAtSlot(s);
    const key = s === 0 ? 'MAIN_HALL' : building?.key;
    if (!key) continue;
    const p = isoPos(gx * 0.9, gy * 0.9, W, cx, cy);
    const w = s === 0 ? W * 1.15 : W * 0.78;
    items.push({ depth: gx + gy, y: p.y, draw: () => {
      const sprite = getSprite(buildingSpriteUrl(key));
      if (sprite) drawSprite(ctx, sprite, p.x, p.y, w, spriteVariant(centerHovered));   // silhouette : pas de repli procédural ni de badge
    } });
    if (night) lit.push({ x: p.x, y: p.y - W * 0.2, r: W * 0.45, a: 0.26, seed: s });
  }
  isoOverlayQueue = [];
  for (const s of citySlots) {
    if (!s.isField) continue;
    const building = getFieldBuildingAtSlot(s.slot, s.fieldType);
    const hovered = cityHoveredSlot === s.slot;
    const isBuilding = currentCity?.buildQueue?.some(q => q.buildingKey === s.fieldType && q.slot === s.slot + 100 && q.status === 'RUNNING');
    items.push({ depth: s.gx + s.gy, y: s.y, draw: () => {
      if (!building) { drawIsoEmptyCell(ctx, s, hovered, night); return; }
      if (hovered) drawIsoHoverCell(ctx, s);
      drawFieldSlot(s, building, hovered, isBuilding);
    } });
  }
  for (const [gx, gy] of ISO_FIELD_SPARE) { const p = isoPos(gx, gy, W, cx, cy); items.push({ depth: gx + gy, y: p.y, draw: () => drawProp(ctx, biomeScene(biome).props.trees[0], p.x, p.y + W * 0.1, W * 0.85, spriteVariant(false)) }); }
  items.sort((a, b) => a.depth - b.depth || a.y - b.y);
  for (const it of items) it.draw();
  if (centerHovered) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2.5; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 14; isoDiamondPath(ctx, cx, cy, R_PLAZA * W, R_PLAZA * W / 2); ctx.stroke(); ctx.shadowBlur = 0; }
  const overlay = isoOverlayQueue; isoOverlayQueue = null;
  return { overlay, lit };
}

// ---------- Détection du survol / clic (cellule au sol ou corps du bâtiment au-dessus) ----------
function isoHitSlot(mx, my) {
  // 1) la parcelle au sol sous le curseur (prévisible, comme Travian) ; 2) sinon le corps d'un bâtiment
  // au-dessus de sa parcelle, de l'avant vers l'arrière
  const ordered = citySlots.filter(s => !s.isVillageCenter).sort((a, b) => (b.gx + b.gy) - (a.gx + a.gy) || b.y - a.y);
  for (const s of ordered) {
    const dx = Math.abs(mx - s.x), dy = my - s.y;
    if (dx / s.hw + Math.abs(dy) / s.hh <= 1) return s.slot;
  }
  for (const s of ordered) {
    const dx = Math.abs(mx - s.x), dy = my - s.y;
    if (dx <= s.hw * 0.6 && dy < 0 && -dy <= s.hw * 1.0) return s.slot;
  }
  const centre = citySlots.find(s => s.isVillageCenter);
  if (centre && Math.abs(mx - centre.x) / centre.hw + Math.abs(my - centre.y) / centre.hh <= 1) return -1;
  return null;
}
function onCityMouseMove(e) {
  if (cityGesture.panning || cityGesture.lastPointerType === 'touch') return;   // au doigt : le tap gère la sélection
  const rect = cityCanvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) * (cityViewW / rect.width);
  const mouseY = (e.clientY - rect.top) * (cityViewH / rect.height);
  const foundSlot = isoHitSlot(mouseX, mouseY);
  if (foundSlot !== cityHoveredSlot) {
    cityHoveredSlot = foundSlot;
    renderCityCanvas();
    cityCanvas.style.cursor = foundSlot !== null ? 'pointer' : 'grab';
    if (foundSlot !== null) showCityTooltip(e.clientX, e.clientY, foundSlot);
    else hideCityTooltip();
  } else if (foundSlot !== null) {
    showCityTooltip(e.clientX, e.clientY, foundSlot);
  }
}

// ---------- Gestes : déplacement, pincement, molette, double tap ----------
const cityGesture = { ready: false, pointers: new Map(), panning: false, startDist: 0, startZoom: 1, last: null, moved: 0, tapAt: 0, swallowClickUntil: 0, lastPointerType: 'mouse', multi: false };
// Le click synthétisé après un tap (ou après un déplacement) ne doit pas rouvrir / rouvrir ailleurs
function isoIgnoreClick() { return cityGesture.panning || Date.now() - cityGesture.tapAt < 600; }
function setupCityGestures() {
  if (cityGesture.ready || !cityCanvas) return;
  cityGesture.ready = true;
  cityCanvas.style.touchAction = 'none';
  const view = () => currentCityView === 'fields' ? 'fields' : 'city';
  const pos = (e) => { const r = cityCanvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cityViewW / r.width), y: (e.clientY - r.top) * (cityViewH / r.height) }; };
  const zoomAt = (factor, px, py, render = true) => {
    const before = isoLayout(view());
    const z = Math.max(ISO_ZOOM_MIN, Math.min(ISO_ZOOM_MAX, cityCam.zoom * factor));
    if (z === cityCam.zoom) return;
    cityCam.zoom = z;
    const ratio = isoLayout(view()).W / before.W;   // W est borné : le zoom peut ne rien changer
    if (ratio === 1) return;
    // garde le point sous le doigt immobile
    cityCam.x = px - cityViewW / 2 - (px - before.cx) * ratio;
    cityCam.y = (py - (py - (before.cy)) * ratio) - cityViewH / 2 - (isoSceneExtent(view()).top - isoSceneExtent(view()).bottom) * isoLayout(view()).W / 2;
    clampCam(view());
    if (render) renderCityCanvas();
  };
  cityCanvas.addEventListener('click', (e) => { if (isoIgnoreClick()) e.stopPropagation(); }, true);
  // Le click synthétisé après un tap est dispatché sur l'élément désormais sous le doigt (souvent le
  // panneau qui vient de s'ouvrir, ou son voile) : on l'avale une seule fois, où qu'il atterrisse
  document.addEventListener('click', (e) => {
    if (cityGesture.swallowClickUntil && Date.now() < cityGesture.swallowClickUntil) { cityGesture.swallowClickUntil = 0; e.stopPropagation(); e.preventDefault(); }
  }, true);
  cityCanvas.addEventListener('pointerdown', (e) => {
    cityGesture.lastPointerType = e.pointerType || 'mouse';
    cityGesture.pointers.set(e.pointerId, pos(e));
    cityGesture.moved = 0;
    cityGesture.swallowClickUntil = 0;   // un nouveau contact désarme l'absorption du click précédent
    if (cityGesture.pointers.size === 2) {
      cityGesture.multi = true;
      const [a, b] = [...cityGesture.pointers.values()];
      cityGesture.startDist = Math.hypot(a.x - b.x, a.y - b.y); cityGesture.startZoom = cityCam.zoom;
    }
    cityGesture.last = pos(e);
    try { cityCanvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  cityCanvas.addEventListener('pointermove', (e) => {
    cityGesture.lastPointerType = e.pointerType || cityGesture.lastPointerType;
    if (!cityGesture.pointers.has(e.pointerId)) return;
    const p = pos(e);
    const prev = cityGesture.pointers.get(e.pointerId);
    cityGesture.pointers.set(e.pointerId, p);
    if (cityGesture.pointers.size === 2) {
      const [a, b] = [...cityGesture.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (cityGesture.startDist > 0) { const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const target = cityGesture.startZoom * d / cityGesture.startDist; zoomAt(target / cityCam.zoom, mid.x, mid.y, false); }
      cityGesture.panning = true; cityHoveredSlot = null;
      return;
    }
    const dx = p.x - prev.x, dy = p.y - prev.y;
    cityGesture.moved += Math.abs(dx) + Math.abs(dy);
    if (cityGesture.moved > 8) {
      cityGesture.panning = true; cityHoveredSlot = null; hideCityTooltip();
      cityCam.x += dx; cityCam.y += dy; clampCam(view());
      cityCanvas.style.cursor = 'grabbing';   // le rendu est fait par la boucle rAF (20 i/s pendant le geste)
    }
  });
  const end = (e) => {
    const wasSingle = cityGesture.pointers.size === 1;
    cityGesture.pointers.delete(e.pointerId);
    if (cityGesture.pointers.size === 0) {
      const wasMulti = cityGesture.multi; cityGesture.multi = false;
      if (cityGesture.panning || wasMulti) {
        // un déplacement ne doit pas déclencher le clic synthétisé qui suit
        setTimeout(() => { cityGesture.panning = false; cityCanvas.style.cursor = 'grab'; }, 80);
      } else if (wasSingle && e.pointerType === 'touch' && e.type === 'pointerup') {
        // tap tactile : sélection + action immédiates (le click synthétisé est ignoré via tapAt)
        const p = pos(e);
        cityHoveredSlot = isoHitSlot(p.x, p.y);
        // double tap sur le terrain : recadrage
        if (cityHoveredSlot === null && Date.now() - cityGesture.tapAt < 350 && Math.hypot(p.x - (cityGesture.lastTap?.x || -999), p.y - (cityGesture.lastTap?.y || -999)) < 40) { resetCityCamera(); renderCityCanvas(); cityGesture.tapAt = 0; return; }
        cityGesture.lastTap = p;
        cityGesture.tapAt = Date.now();
        cityGesture.swallowClickUntil = cityGesture.tapAt + 350;
        renderCityCanvas();
        if (cityHoveredSlot !== null) { hideCityTooltip(); if (typeof haptic === 'function') haptic('light'); onCityClick({ clientX: e.clientX, clientY: e.clientY }); }
      }
    }
  };
  cityCanvas.addEventListener('pointerup', end);
  cityCanvas.addEventListener('pointercancel', end);
  cityCanvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y); }, { passive: false });
  cityCanvas.addEventListener('dblclick', () => { resetCityCamera(); renderCityCanvas(); });
}
