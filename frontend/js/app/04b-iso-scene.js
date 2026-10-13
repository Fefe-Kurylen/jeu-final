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
  return view === 'fields' ? { hw: R_FIELD + 0.55, top: (R_FIELD + 0.5) * 0.5 + 0.8, bottom: (R_FIELD + 0.5) * 0.5 + 0.3 } : { hw: R_WALL + 0.35, top: R_WALL * 0.5 + 0.95, bottom: R_WALL * 0.5 + 0.35 };
}
function isoLayout(view) {
  const ext = isoSceneExtent(view);
  const padX = cityViewW < 500 ? 10 : 40, padY = cityViewW < 500 ? 16 : 40;
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
    // size : le sprite (1,7 × size) remplit la cellule (largeur W) sans déborder sur ses voisines
    citySlots.push({ slot: s, gx, gy, x: p.x, y: p.y, size: W * 0.6, hw: W * 0.47, hh: W * 0.235, fixed: s === 0, fixedKey: s === 0 ? 'MAIN_HALL' : undefined, ring: s === 0 ? 'center' : s <= 8 ? 'inner' : 'outer' });
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
    citySlots.push({ slot: s, gx, gy, x: p.x, y: p.y, size: W * 0.64, hw: W * 0.47, hh: W * 0.235, isField: true, fieldType: ISO_FIELD_TYPE(s), ring: 3 });
  }
}

// ---------- Primitives canvas (style peint : dégradés + trait brun) ----------
const ISO_LINE = 'rgba(58,36,20,0.75)';
function isoShade(hex, pct) { return shadeColor(hex, pct); }
function isoDiamondPath(ctx, x, y, hw, hh) {
  ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x, y + hh); ctx.closePath();
}
// Boîte iso : centre au sol (x, y), demi-largeur hw (px), profondeur en cellules dx/dy, hauteur h px
function isoBox(ctx, x, y, wx, wy, h, color) {
  // wx, wy : demi-étendue le long des axes iso (px écran le long de +gx et +gy)
  const ax = { x: wx, y: wx / 2 }, ay = { x: -wy, y: wy / 2 };
  const A = { x: x - ax.x - ay.x, y: y - ax.y - ay.y }, B = { x: x + ax.x - ay.x, y: y + ax.y - ay.y }, C = { x: x + ax.x + ay.x, y: y + ax.y + ay.y }, D = { x: x - ax.x + ay.x, y: y - ax.y + ay.y };
  const up = (p) => ({ x: p.x, y: p.y - h });
  const [A2, B2, C2, D2] = [A, B, C, D].map(up);
  // face gauche (D-C), face droite (C-B), dessus
  let g = ctx.createLinearGradient(0, C2.y, 0, C.y); g.addColorStop(0, isoShade(color, 10)); g.addColorStop(1, isoShade(color, -14));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(D.x, D.y); ctx.lineTo(C.x, C.y); ctx.lineTo(C2.x, C2.y); ctx.lineTo(D2.x, D2.y); ctx.closePath(); ctx.fill();
  g = ctx.createLinearGradient(0, C2.y, 0, C.y); g.addColorStop(0, isoShade(color, -16)); g.addColorStop(1, isoShade(color, -34));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B2.x, B2.y); ctx.lineTo(C2.x, C2.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = isoShade(color, 26); ctx.beginPath(); ctx.moveTo(A2.x, A2.y); ctx.lineTo(B2.x, B2.y); ctx.lineTo(C2.x, C2.y); ctx.lineTo(D2.x, D2.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ISO_LINE; ctx.lineWidth = 1; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(D.x, D.y); ctx.lineTo(C.x, C.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B2.x, B2.y); ctx.lineTo(A2.x, A2.y); ctx.lineTo(D2.x, D2.y); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(C2.x, C2.y); ctx.lineTo(D2.x, D2.y); ctx.moveTo(C2.x, C2.y); ctx.lineTo(B2.x, B2.y); ctx.stroke();
}
// Tour ronde : base (x, y), rayon r px, hauteur h px, toit conique
function isoTower(ctx, x, y, r, h, wall, roof) {
  const ry = r / 2;
  let g = ctx.createLinearGradient(x - r, 0, x + r, 0); g.addColorStop(0, isoShade(wall, 14)); g.addColorStop(0.55, wall); g.addColorStop(1, isoShade(wall, -30));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - r, y - h); ctx.lineTo(x - r, y); ctx.ellipse(x, y, r, ry, 0, Math.PI, 0, true); ctx.lineTo(x + r, y - h); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ISO_LINE; ctx.lineWidth = 1; ctx.stroke();
  // créneaux
  ctx.fillStyle = isoShade(wall, -8); ctx.beginPath(); ctx.ellipse(x, y - h, r, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // toit
  g = ctx.createLinearGradient(x - r, 0, x + r, 0); g.addColorStop(0, isoShade(roof, 14)); g.addColorStop(1, isoShade(roof, -26));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - r * 1.15, y - h); ctx.lineTo(x, y - h - r * 1.6); ctx.lineTo(x + r * 1.15, y - h); ctx.ellipse(x, y - h, r * 1.15, ry * 1.15, 0, 0, Math.PI, false); ctx.closePath(); ctx.fill(); ctx.stroke();
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

// Tronçon de courtine entre deux points au sol (a → b) : face visible + chemin de ronde + créneaux.
// Les tronçons voisins se raccordent sans trait de jonction (seules les arêtes haute et basse sont tracées).
function isoCurtain(ctx, a, b, thick, h, wall, crenels = true) {
  // direction le long du mur et épaisseur perpendiculaire (vers l'extérieur, en bas-écran)
  const n = { x: 0, y: thick };
  const A = a, B = b, C = { x: b.x + n.x, y: b.y + n.y }, D = { x: a.x + n.x, y: a.y + n.y };
  const up = (p) => ({ x: p.x, y: p.y - h });
  const [A2, B2, C2, D2] = [A, B, C, D].map(up);
  const lit = (b.x - a.x) * (b.y - a.y) < 0;   // mur orienté comme la face gauche (éclairée)
  let g = ctx.createLinearGradient(0, C2.y, 0, C.y); g.addColorStop(0, isoShade(wall, lit ? 8 : -14)); g.addColorStop(1, isoShade(wall, lit ? -16 : -34));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(D.x, D.y); ctx.lineTo(C.x, C.y); ctx.lineTo(C2.x, C2.y); ctx.lineTo(D2.x, D2.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ISO_LINE; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(D.x, D.y); ctx.lineTo(C.x, C.y); ctx.moveTo(D2.x, D2.y); ctx.lineTo(C2.x, C2.y); ctx.stroke();
  // joints de pierre
  ctx.strokeStyle = 'rgba(58,36,20,0.18)';
  const rows = Math.max(2, Math.round(h / (thick * 1.3)));
  for (let i = 1; i < rows; i++) { const t = i / rows; ctx.beginPath(); ctx.moveTo(D2.x, D2.y + (D.y - D2.y) * t); ctx.lineTo(C2.x, C2.y + (C.y - C2.y) * t); ctx.stroke(); }
  // chemin de ronde
  ctx.fillStyle = isoShade(wall, 24); ctx.beginPath(); ctx.moveTo(A2.x, A2.y); ctx.lineTo(B2.x, B2.y); ctx.lineTo(C2.x, C2.y); ctx.lineTo(D2.x, D2.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ISO_LINE; ctx.beginPath(); ctx.moveTo(A2.x, A2.y); ctx.lineTo(B2.x, B2.y); ctx.stroke();
  if (crenels) {
    const len = Math.hypot(B2.x - A2.x, B2.y - A2.y), count = Math.max(3, Math.floor(len / (thick * 2.2)));
    const ch = thick * 0.9;
    for (let i = 0; i < count; i++) {
      if (i % 2) continue;
      const t0 = i / count, t1 = (i + 0.85) / count;
      const p0 = { x: A2.x + (B2.x - A2.x) * t0, y: A2.y + (B2.y - A2.y) * t0 }, p1 = { x: A2.x + (B2.x - A2.x) * t1, y: A2.y + (B2.y - A2.y) * t1 };
      ctx.fillStyle = isoShade(wall, lit ? 2 : -18);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p1.x + n.x, p1.y + n.y); ctx.lineTo(p0.x + n.x, p0.y + n.y); ctx.lineTo(p0.x + n.x, p0.y + n.y - ch); ctx.lineTo(p1.x + n.x, p1.y + n.y - ch); ctx.lineTo(p1.x, p1.y - ch); ctx.lineTo(p0.x, p0.y - ch); ctx.closePath(); ctx.fill();
      ctx.fillStyle = isoShade(wall, 20); ctx.beginPath(); ctx.moveTo(p0.x, p0.y - ch); ctx.lineTo(p1.x, p1.y - ch); ctx.lineTo(p1.x + n.x, p1.y + n.y - ch); ctx.lineTo(p0.x + n.x, p0.y + n.y - ch); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ISO_LINE; ctx.lineWidth = 0.8; ctx.stroke();
    }
  }
}
// Murs (si le Mur est construit) : enceinte sur le bord du plateau, découpée en tronçons d'une cellule
// triés en profondeur avec le reste de la scène (hautes courtines à l'arrière, murets devant), tours d'angle
function isoWallItems(ctx, cx, cy, W, wallLevel, night, lowAll = false) {
  const theme = getCultureTheme();
  const wall = night ? isoShade(theme.stone, -42) : theme.stone, roof = night ? isoShade(theme.roof, -42) : theme.roof;
  const hHigh = W * (0.2 + Math.min(wallLevel, 20) * 0.011), hLow = hHigh * 0.42, thick = W * 0.09;
  const R = R_WALL, N = 6, step = 2 * R / N;
  const items = [];
  const edge = (from, to, high) => {
    for (let k = 0; k < N; k++) {
      const t0 = k / N, t1 = (k + 1) / N;
      const g0 = [from[0] + (to[0] - from[0]) * t0, from[1] + (to[1] - from[1]) * t0], g1 = [from[0] + (to[0] - from[0]) * t1, from[1] + (to[1] - from[1]) * t1];
      const a = isoPos(g0[0], g0[1], W, cx, cy), b = isoPos(g1[0], g1[1], W, cx, cy);
      const mid = [(g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2];
      items.push({ depth: mid[0] + mid[1], y: (a.y + b.y) / 2, draw: () => isoCurtain(ctx, a, b, thick, high && !lowAll ? hHigh : hLow, wall, high && !lowAll) });
    }
  };
  edge([-R, R], [-R, -R], true);     // arrière gauche
  edge([-R, -R], [R, -R], true);     // arrière droit
  edge([R, -R], [R, R], false);      // avant droit
  edge([R, R], [-R, R], false);      // avant gauche
  for (const [gx, gy, scale] of [[-R, -R, 1.45], [-R, R, 1.45], [R, -R, 1.45], [R, R, 1.15]]) {
    const p = isoPos(gx, gy, W, cx, cy);
    items.push({ depth: gx + gy + 0.01, y: p.y + thick, draw: () => isoTower(ctx, p.x, p.y + thick, W * (scale > 1.2 ? 0.2 : 0.18), hHigh * (lowAll ? 0.8 : scale), wall, roof) });
  }
  void step;
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

// Parcelle vide : losange en pointillé + « + »
function drawIsoEmptyCell(ctx, s, hovered, night, label = '+') {
  ctx.fillStyle = night ? 'rgba(20,16,10,0.45)' : 'rgba(80,60,36,0.28)';
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
  for (const l of lit) {
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    g.addColorStop(0, `rgba(255,170,60,${l.a})`); g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function cityWallLevel() { return (currentCity?.buildings || []).find(b => b.key === 'WALL')?.level || 0; }

// ---------- Rendu ----------
function renderCityView() {
  setupCityGestures();
  clampCam('city');
  calculateCitySlots();
  const ctx = cityCtx, night = isNightMode(), biome = cityBiome();
  const { W, cx, cy } = isoLayout('city');
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
  const lit = [];
  isoOverlayQueue = [];
  for (const s of citySlots) {
    const building = getBuildingAtSlot(s.slot);
    const hovered = cityHoveredSlot === s.slot;
    const key = s.fixed ? s.fixedKey : building?.key;
    const level = building?.level || (s.fixed ? 1 : 0);
    const isBuilding = currentCity?.buildQueue?.some(q => q.slot === s.slot && q.status === 'RUNNING');
    items.push({ depth: s.gx + s.gy, y: s.y, draw: () => {
      if (!key) { drawIsoEmptyCell(ctx, s, hovered, night); return; }
      if (hovered) drawIsoHoverCell(ctx, s);
      draw25DBuilding(s.x, s.y, s.size, key, level, hovered, isBuilding);
    } });
    if (key && night) lit.push({ x: s.x, y: s.y - W * 0.22, r: W * 0.55, a: 0.32 });
  }
  // cellule libre : un arbre d'agrément
  const spare = isoPos(ISO_CITY_SPARE[0], ISO_CITY_SPARE[1], W, cx, cy);
  items.push({ depth: ISO_CITY_SPARE[0] + ISO_CITY_SPARE[1], y: spare.y, draw: () => drawProp(ctx, biomeScene(biome).props.trees[1], spare.x, spare.y + W * 0.1, W * 0.8, spriteVariant(false)) });
  items.sort((a, b) => a.depth - b.depth || a.y - b.y);
  for (const it of items) it.draw();
  if (night) drawIsoNight(ctx, lit);
  const overlay = isoOverlayQueue; isoOverlayQueue = null;
  for (const fn of overlay) fn();
}

function renderFieldsView() {
  if (!cityCanvas || !cityCtx) return;
  setupCityGestures();
  clampCam('fields');
  calculateFieldSlots();
  const ctx = cityCtx, night = isNightMode(), biome = cityBiome();
  const { W, cx, cy } = isoLayout('fields');
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
      if (sprite) drawSprite(ctx, sprite, p.x, p.y, w, spriteVariant(centerHovered));
      else draw25DBuilding(p.x, p.y, w * 0.59, key, building?.level || 1, centerHovered, false);
    } });
    if (night) lit.push({ x: p.x, y: p.y - W * 0.2, r: W * 0.45, a: 0.26 });
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
  if (night) drawIsoNight(ctx, lit);
  const overlay = isoOverlayQueue; isoOverlayQueue = null;
  for (const fn of overlay) fn();
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
const cityGesture = { ready: false, pointers: new Map(), panning: false, startDist: 0, startZoom: 1, last: null, moved: 0, tapAt: 0, swallowClickUntil: 0, lastPointerType: 'mouse' };
// Le click synthétisé après un tap (ou après un déplacement) ne doit pas rouvrir / rouvrir ailleurs
function isoIgnoreClick() { return cityGesture.panning || Date.now() - cityGesture.tapAt < 600; }
function setupCityGestures() {
  if (cityGesture.ready || !cityCanvas) return;
  cityGesture.ready = true;
  cityCanvas.style.touchAction = 'none';
  const view = () => currentCityView === 'fields' ? 'fields' : 'city';
  const pos = (e) => { const r = cityCanvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cityViewW / r.width), y: (e.clientY - r.top) * (cityViewH / r.height) }; };
  const zoomAt = (factor, px, py) => {
    const before = isoLayout(view());
    const z = Math.max(ISO_ZOOM_MIN, Math.min(ISO_ZOOM_MAX, cityCam.zoom * factor));
    if (z === cityCam.zoom) return;
    const ratio = z / cityCam.zoom;
    cityCam.zoom = z;
    // garde le point sous le doigt immobile
    cityCam.x = px - cityViewW / 2 - (px - before.cx) * ratio;
    cityCam.y = (py - (py - (before.cy)) * ratio) - cityViewH / 2 - (isoSceneExtent(view()).top - isoSceneExtent(view()).bottom) * isoLayout(view()).W / 2;
    clampCam(view());
    renderCityCanvas();
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
    if (cityGesture.pointers.size === 2) {
      const [a, b] = [...cityGesture.pointers.values()];
      cityGesture.startDist = Math.hypot(a.x - b.x, a.y - b.y); cityGesture.startZoom = cityCam.zoom;
    }
    cityGesture.last = pos(e);
    try { cityCanvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  cityCanvas.addEventListener('pointermove', (e) => {
    if (!cityGesture.pointers.has(e.pointerId)) return;
    const p = pos(e);
    const prev = cityGesture.pointers.get(e.pointerId);
    cityGesture.pointers.set(e.pointerId, p);
    if (cityGesture.pointers.size === 2) {
      const [a, b] = [...cityGesture.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (cityGesture.startDist > 0) { const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const target = cityGesture.startZoom * d / cityGesture.startDist; zoomAt(target / cityCam.zoom, mid.x, mid.y); }
      cityGesture.panning = true; cityHoveredSlot = null;
      return;
    }
    const dx = p.x - prev.x, dy = p.y - prev.y;
    cityGesture.moved += Math.abs(dx) + Math.abs(dy);
    if (cityGesture.moved > 8) {
      cityGesture.panning = true; cityHoveredSlot = null; hideCityTooltip();
      cityCam.x += dx; cityCam.y += dy; clampCam(view());
      cityCanvas.style.cursor = 'grabbing';
      renderCityCanvas();
    }
  });
  const end = (e) => {
    const wasSingle = cityGesture.pointers.size === 1;
    cityGesture.pointers.delete(e.pointerId);
    if (cityGesture.pointers.size === 0) {
      if (cityGesture.panning) {
        // un déplacement ne doit pas déclencher le clic synthétisé qui suit
        setTimeout(() => { cityGesture.panning = false; cityCanvas.style.cursor = 'grab'; }, 80);
      } else if (wasSingle && e.pointerType === 'touch' && e.type === 'pointerup') {
        // tap tactile : sélection + action immédiates (le click synthétisé est ignoré via tapAt)
        const p = pos(e);
        cityHoveredSlot = isoHitSlot(p.x, p.y);
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
