// ============================================================
// 04b-iso-scene.js — La ville en vraie 2.5D isométrique, façon Rise of Kingdoms : une seule scène où tout
// tient dans l'enceinte (bâtiments au centre, champs le long des murs), sol clair, plaza pavée et avenues,
// décor dense (bosquets, rangée d'arbres sous les murs, buissons entre les parcelles), murs et tours,
// caméra (déplacement au doigt, zoom pincé, molette, double tap pour recadrer), nuit avec lumières,
// et bulles d'action au toucher d'un bâtiment (Améliorer, Recruter, Infos…).
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
// Champs (slots clients 101-118 = emplacements serveur) : troisième anneau, à l'intérieur de l'enceinte, par type
const R_FIELD = 3;
const ISO_FIELD_CELLS = {
  1: [-1, -R_FIELD], 2: [0, -R_FIELD], 3: [1, -R_FIELD], 4: [2, -R_FIELD],                 // LUMBER : fond droit
  5: [R_FIELD, -2], 6: [R_FIELD, -1], 7: [R_FIELD, 0], 8: [R_FIELD, 1],                    // QUARRY : côté droit
  9: [-R_FIELD, -2], 10: [-R_FIELD, -1], 11: [-R_FIELD, 0], 12: [-R_FIELD, 1],             // IRON_MINE : côté gauche
  13: [R_FIELD, 2], 14: [2, R_FIELD], 15: [1, R_FIELD], 16: [0, R_FIELD], 17: [-1, R_FIELD], 18: [-2, R_FIELD]   // FARM : devant
};
const ISO_FIELD_TYPE = (slot) => slot <= 4 ? 'LUMBER' : slot <= 8 ? 'QUARRY' : slot <= 12 ? 'IRON_MINE' : 'FARM';
// Cellules libres (anneau extérieur et coins du troisième anneau) : bosquets
const ISO_SPARE_CELLS = [[-1, -2], [-2.7, -2.7], [-2, -3], [2.7, -2.7], [2.7, 2.7], [-3, 2], [-2.7, 2.7]];
const R_WALL = 3.85;      // l'enceinte entoure bâtiments et champs
const R_PLAZA = 0.7;      // plaza pavée autour du Bâtiment principal
const ISO_MAIN_HALL_SCALE = 1.35;   // le Bâtiment principal domine la ville
// Enceinte : 8 tronçons par côté ; la porte, sur l'arête sud-est (bord inférieur droit du losange), s'ouvre sur
// l'avenue qui passe entre les rangées 0 et 1 de la grille (à 0,5 cellule de l'axe).
// Toute la géométrie liée à la porte (avenues, route, couloir du décor, buissons, torches) passe par le repère
// « porte » : `along` = position le long de l'arête de la porte, `depth` = profondeur vers cette arête
// (R_WALL sur l'arête). Changer ISO_GATE_SIDE ('SE' ou 'SW') bascule toute la ville d'un côté à l'autre.
const ISO_GATE_SIDE = 'SE';
const ISO_WALL_SEGMENTS = 8;
const ISO_GATE_ALONG = 0.5;
// tronçon ouvert, compté dans le sens croissant de `along` (de -R_WALL à +R_WALL), et position de la porte sur l'arête
const ISO_GATE_INDEX = Math.round((R_WALL + ISO_GATE_ALONG) / (2 * R_WALL) * ISO_WALL_SEGMENTS - 0.5);
const ISO_GATE_POS = -R_WALL + 2 * R_WALL * (ISO_GATE_INDEX + 0.5) / ISO_WALL_SEGMENTS;
const ISO_GATE_SEGMENTS = ISO_WALL_SEGMENTS;   // compatibilité : largeur de l'ouverture = 2R / segments
// Repère « porte » -> grille (gx, gy) : au sud-est la porte est sur l'arête gx = R_WALL, au sud-ouest sur gy = R_WALL
function isoGateGrid(along, depth) { return ISO_GATE_SIDE === 'SE' ? [depth, along] : [along, depth]; }
// Grille (gx, gy) -> repère « porte » { along, depth }
function isoGateFrame(gx, gy) { return ISO_GATE_SIDE === 'SE' ? { along: gy, depth: gx } : { along: gx, depth: gy }; }

// ---------- Caméra ----------
const cityCam = { x: 0, y: 0, zoom: 1, auto: true };   // auto : zoom par défaut recalculé pour que les cellules restent lisibles
const ISO_ZOOM_MIN = 0.45, ISO_ZOOM_MAX = 3.2;
// Largeur de cellule (px logiques) visée par le cadrage par défaut : sur téléphone la ville déborde et se déplace au doigt
function isoMinCell() { return cityViewW < 500 ? 84 : cityViewW < 900 ? 66 : 0; }   // grand écran : la ville entière tient dans la vue
// Espacement de la grille : les cellules sont à 1,3 largeur de cellule les unes des autres (chemins, air entre les
// bâtiments) ; les parcelles font 0,74 largeur de cellule
const ISO_SP = 1.3;
const ISO_PLOT = 0.74;
let isoCellW = 96;          // largeur de cellule (px logiques) au dernier rendu
// Badges de niveau et icônes de production : affichés en zoom rapproché ou sur l'emplacement survolé / sélectionné,
// pour une vue d'ensemble épurée (le niveau est toujours dans la bulle d'action et l'infobulle)
const ISO_BADGE_MIN_W = 96;
function isoShowBadges(hovered) { return !!hovered || isoCellW >= ISO_BADGE_MIN_W; }
// Badge de niveau adapté à la taille des cellules (petit, au coin droit de la parcelle, lisible dès 2× DPR)
function isoBadgeSpec(x, y, hw, hh) { const r = Math.max(6.5, Math.min(10, isoCellW * 0.11)); return { x: x + hw * 0.62, y: y + hh * 0.35, radius: r }; }
let isoOrigin = { x: 0, y: 0 };

function isoSceneExtent(view) {
  // demi-largeur (cellules) et marges verticales (cellules) de la scène à cadrer
  void view;   // une seule scène désormais (la vue « champs » cadre la même ville)
  const tight = cityViewW < 500;
  return { hw: R_WALL + (tight ? 0.12 : 0.35), top: R_WALL * 0.5 + 0.95, bottom: R_WALL * 0.5 + 0.35 };
}
function isoLayout(view) {
  const e0 = isoSceneExtent(view);
  const ext = { hw: e0.hw * ISO_SP, top: e0.top * ISO_SP, bottom: e0.bottom * ISO_SP };
  const padX = cityViewW < 500 ? 4 : 30, padY = cityViewW < 500 ? 12 : 24;
  const fitW = Math.min((cityViewW - padX * 2) / (ext.hw * 2), (cityViewH - padY * 2) / (ext.top + ext.bottom));
  if (cityCam.auto) cityCam.zoom = Math.min(ISO_ZOOM_MAX, Math.max(1, isoMinCell() / fitW));
  const W = Math.max(26, Math.min(190, fitW * cityCam.zoom));
  const cx = cityViewW / 2 + cityCam.x, cy = cityViewH / 2 + cityCam.y + (ext.top - ext.bottom) * W / 2;
  return { W, cx, cy, ext };
}
function isoPos(gx, gy, W, cx, cy) { return { x: cx + (gx - gy) * W * ISO_SP / 2, y: cy + (gx + gy) * W * ISO_SP / 4 }; }
function clampCam(view) {
  const { W, ext } = isoLayout(view);
  const lx = ext.hw * W, ly = (ext.top + ext.bottom) * W / 2;
  cityCam.x = Math.max(-lx, Math.min(lx, cityCam.x));
  cityCam.y = Math.max(-ly, Math.min(ly, cityCam.y));
}
function resetCityCamera() { cityCam.x = 0; cityCam.y = 0; cityCam.zoom = 1; cityCam.auto = true; }
// Recentre la vue sur un emplacement (bâtiment 0-19 ou champ 101-118), zoome si besoin et ouvre sa bulle d'action :
// « Voir dans la ville » des fiches, façon Rise of Kingdoms
function focusCitySlot(slot, zoom = 1.7) {
  if (!cityCanvas) return false;
  const cell = slot >= 100 ? ISO_FIELD_CELLS[slot - 100] : ISO_CITY_CELLS[slot];
  if (!cell) return false;
  cityCam.auto = false;
  cityCam.zoom = Math.max(cityCam.zoom, zoom);
  const { W, ext } = isoLayout('city');
  cityCam.x = -(cell[0] - cell[1]) * W * ISO_SP / 2;
  cityCam.y = -(cell[0] + cell[1]) * W * ISO_SP / 4 - (ext.top - ext.bottom) * W / 2;
  clampCam('city');
  renderCityCanvas();
  cityHoveredSlot = slot;
  showCityActions(slot);
  return true;
}

// ---------- Emplacements (contrat citySlots conservé : slot, x, y, size, fixed, isField, fieldType…) ----------
// Une seule liste : les bâtiments (slots 0-19) et les champs (slots 101-118, numérotation du serveur)
function calculateCitySlots() {
  if (!cityCanvas) return;
  const { W, cx, cy } = isoLayout('city');
  isoCellW = W; isoOrigin = { x: cx, y: cy };
  citySlots = [];
  for (const [slot, [gx, gy]] of Object.entries(ISO_CITY_CELLS)) {
    const p = isoPos(gx, gy, W, cx, cy);
    const s = Number(slot);
    const k = s === 0 ? ISO_MAIN_HALL_SCALE : 1;
    // size : le sprite (1,7 × size = 1,22 W) pose son losange de parcelle (100/130 de sa largeur = 0,94 W) sur la cellule
    citySlots.push({ slot: s, gx, gy, x: p.x, y: p.y, size: W * ISO_PLOT / SPRITE_PLOT_W / 1.7 * k, hw: W * ISO_PLOT / 2 * k, hh: W * ISO_PLOT / 4 * k, fixed: s === 0, fixedKey: s === 0 ? 'MAIN_HALL' : undefined, ring: s === 0 ? 'center' : s <= 8 ? 'inner' : 'outer' });
  }
  for (const [slot, [gx, gy]] of Object.entries(ISO_FIELD_CELLS)) {
    const p = isoPos(gx, gy, W, cx, cy);
    const s = Number(slot);
    citySlots.push({ slot: 100 + s, fieldSlot: s, gx, gy, x: p.x, y: p.y, size: W * ISO_PLOT / SPRITE_PLOT_W / 1.5, hw: W * ISO_PLOT / 2, hh: W * ISO_PLOT / 4, isField: true, fieldType: ISO_FIELD_TYPE(s), ring: 3 });   // sprite 1,5 × size : losange de parcelle = ISO_PLOT × W
  }
}
function calculateFieldSlots() { calculateCitySlots(); }

// ---------- Primitives canvas (style peint : dégradés + trait brun) ----------
const ISO_LINE = 'rgba(58,36,20,0.75)';
function isoShade(hex, pct) { return shadeColor(hex, pct); }
function isoDiamondPath(ctx, x, y, hw, hh) {
  ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x, y + hh); ctx.closePath();
}
function isoShadowEllipse(ctx, x, y, rx, ry, alpha = 0.25) { ctx.fillStyle = `rgba(20,12,4,${alpha})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

// ---------- Scène ----------
function isoSeeded(n) { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); }

// Textures par zone (chaque nom se replie sur une variante plus générale tant que l'image peinte manque, voir 01-core.js) :
// alentours, sol de l'enceinte, plaza (par civilisation), avenues, route extérieure
const ISO_TEXTURES = {
  forest: { outer: 'grass_dry', inner: 'grass_lawn', lane: 'cobble', road: 'road_dirt' },
  desert: { outer: 'sand_rocky', inner: 'sand_ripples', lane: 'cobble', road: 'path_sand' },
  snow: { outer: 'tundra', inner: 'snow_fresh', lane: 'snow_trampled', road: 'snow_trampled' }
};
function isoTextures(biome) {
  const t = ISO_TEXTURES[biome] || ISO_TEXTURES.forest;
  return { ...t, plaza: `plaza_${player?.faction || 'ROME'}` };
}
// Décalques au sol du biome, semés à graine fixe dans l'enceinte (hors parcelles, avenues et plaza) et aux alentours ;
// dessinés seulement quand l'image existe (painted/decals/<nom>.webp)
const ISO_DECALS = {
  forest: ['grass_tuft', 'flowers_red', 'flowers_white', 'clover', 'pebbles', 'leaves', 'moss', 'mushrooms', 'branches', 'puddle'],
  desert: ['pebbles', 'cracks', 'sand_ripple', 'branches', 'hoof_prints'],
  snow: ['snow_drift', 'ice_patch', 'pebbles', 'branches', 'hoof_prints']
};
function drawIsoDecals(ctx, W, cx, cy, biome) {
  const names = ISO_DECALS[biome] || ISO_DECALS.forest;
  if (!names.some(n => paintedSet.has(`decals/${n}.webp`))) return;
  for (let gx = -5; gx <= 5; gx++) for (let gy = -5; gy <= 5; gy++) {
    const seed = (gx + 30) * 71 + (gy + 30) * 17 + 2400;
    if (isoSeeded(seed) > 0.42) continue;
    const px = gx + 0.5 + (isoSeeded(seed + 1) - 0.5) * 0.5, py = gy + 0.5 + (isoSeeded(seed + 2) - 0.5) * 0.5;
    const inside = Math.max(Math.abs(px), Math.abs(py)) < R_WALL - 0.3;
    if (inside) {
      const f = isoGateFrame(px, py);
      if (Math.abs(f.along - ISO_GATE_POS) < 0.25 || Math.abs(f.depth - 0.5) < 0.25) continue;   // avenues
      if (Math.abs(px) + Math.abs(py) < R_PLAZA + 0.5) continue;                           // plaza
      const onPlot = Object.values(ISO_CITY_CELLS).concat(Object.values(ISO_FIELD_CELLS)).some(([cx2, cy2]) => Math.abs(px - cx2) < 0.45 && Math.abs(py - cy2) < 0.45);
      if (onPlot) continue;
    } else if (Math.max(Math.abs(px), Math.abs(py)) > R_WALL + 3.5) continue;
    const name = names[Math.floor(isoSeeded(seed + 3) * names.length)];
    const p = isoPos(px, py, W, cx, cy);
    drawDecal(ctx, name, p.x, p.y, W * (0.35 + isoSeeded(seed + 4) * 0.3), 0.9);
  }
}

// Terrain plein écran : texture du biome + modelé doux + vignette, rendu une fois par taille/biome/nuit puis blitté
let isoTerrainCache = { key: '', canvas: null };
function drawIsoTerrain(ctx, biome, night) {
  const scene = biomeScene(biome);
  const scale = canvasScale();
  const outerTex = isoTextures(biome).outer;
  const textureReady = !!getTerrainPattern(ctx, outerTex);
  const key = `${cityViewW}x${cityViewH}@${biome}@${night}@${scale}@${textureReady}@${paintedSet.size}`;
  if (isoTerrainCache.key !== key) {
    const off = document.createElement('canvas');
    off.width = Math.round(cityViewW * scale); off.height = Math.round(cityViewH * scale);
    const oc = off.getContext('2d');
    oc.setTransform(scale, 0, 0, scale, 0, 0);
    const grad = oc.createLinearGradient(0, 0, 0, cityViewH);
    const ramp = night ? scene.night : scene.day;
    grad.addColorStop(0, ramp[1]); grad.addColorStop(1, ramp[3]);
    oc.beginPath(); oc.rect(0, 0, cityViewW, cityViewH);
    fillTextured(oc, outerTex, grad, night ? 0.86 : 0.42);
    const v = oc.createRadialGradient(cityViewW / 2, cityViewH / 2, Math.min(cityViewW, cityViewH) * 0.35, cityViewW / 2, cityViewH / 2, Math.max(cityViewW, cityViewH) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, night ? 'rgba(0,0,0,0.55)' : 'rgba(30,20,10,0.3)');
    oc.fillStyle = v; oc.fillRect(0, 0, cityViewW, cityViewH);
    isoTerrainCache = { key, canvas: off };
  }
  ctx.drawImage(isoTerrainCache.canvas, 0, 0, cityViewW, cityViewH);
}

// Sol de l'enceinte : le biome en plus clair et plus vif (herbe entretenue, sable ratissé, neige tassée), liseré au pied des murs
function drawIsoGround(ctx, cx, cy, W, biome, night) {
  const hw = R_WALL * W * ISO_SP, hh = hw / 2;
  ctx.save();
  ctx.shadowColor = night ? 'rgba(0,0,0,0.6)' : 'rgba(20,12,4,0.35)'; ctx.shadowBlur = W * 0.4; ctx.shadowOffsetY = W * 0.08;
  // ombre portée du sol de l'enceinte, teintée par le biome (visible seulement par l'ouverture de la porte)
  const groundShadow = { forest: ['#5f8f36', '#1e2a1a'], desert: ['#b39a62', '#2a2418'], snow: ['#c3ccd4', '#262c34'] }[biome] || ['#5f8f36', '#1e2a1a'];
  ctx.fillStyle = night ? groundShadow[1] : groundShadow[0];
  isoDiamondPath(ctx, cx, cy + W * 0.06, hw, hh); ctx.fill();
  ctx.restore();
  isoDiamondPath(ctx, cx, cy, hw, hh);
  fillTextured(ctx, isoTextures(biome).inner, biomeInnerGradient(ctx, cx, cy, hw, biome, night), night ? 0.8 : (hasPaintedTexture(isoTextures(biome).inner) ? 0.18 : 0.3));
  ctx.strokeStyle = night ? 'rgba(20,12,4,0.7)' : 'rgba(90,70,40,0.55)'; ctx.lineWidth = Math.max(1.5, W * 0.035);
  isoDiamondPath(ctx, cx, cy, hw, hh); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,220,0.22)'; ctx.lineWidth = 1;
  isoDiamondPath(ctx, cx, cy, hw - 3, hh - 1.5); ctx.stroke();
}

// Plaza pavée autour du Bâtiment principal
function drawIsoPlaza(ctx, cx, cy, W, night) {
  const hw = R_PLAZA * W * ISO_SP, hh = hw / 2;
  isoDiamondPath(ctx, cx, cy, hw, hh);
  const g = ctx.createRadialGradient(cx, cy - hh * 0.2, W * 0.2, cx, cy, hw);
  g.addColorStop(0, night ? '#4a4034' : '#dccba2'); g.addColorStop(1, night ? '#2e2618' : '#b89c70');
  const plazaTex = isoTextures(cityBiome()).plaza;
  const paved = hasPaintedTexture(plazaTex);
  fillTextured(ctx, plazaTex, g, night ? 0.82 : (paved ? 0.12 : 0.38));
  ctx.strokeStyle = night ? 'rgba(20,12,4,0.8)' : 'rgba(90,60,30,0.6)'; ctx.lineWidth = Math.max(1.5, W * 0.03);
  isoDiamondPath(ctx, cx, cy, hw, hh); ctx.stroke();
  if (!paved) { ctx.strokeStyle = night ? 'rgba(0,0,0,0.18)' : 'rgba(90,60,30,0.16)'; ctx.lineWidth = 1; for (const f of [0.66, 0.33]) { isoDiamondPath(ctx, cx, cy, hw * f, hh * f); ctx.stroke(); } }
  ctx.strokeStyle = 'rgba(255,240,200,0.28)'; ctx.lineWidth = 1;
  isoDiamondPath(ctx, cx, cy, hw - 3, hh - 1.5); ctx.stroke();
}

// Avenues de terre battue : de la porte à la plaza, de la plaza vers le fond, et une transversale ; elles passent
// dans les couloirs laissés entre les parcelles (à 0,5 cellule des deux axes), dans le repère de la porte
function isoAvenueLanes(W, cx, cy) {
  const P = (along, depth) => { const [gx, gy] = isoGateGrid(along, depth); return isoPos(gx, gy, W, cx, cy); };
  return [
    [P(ISO_GATE_POS, R_WALL + 0.12), P(ISO_GATE_POS, R_PLAZA * 0.8)],      // de la porte à la plaza
    [P(ISO_GATE_POS, -R_PLAZA * 0.8), P(ISO_GATE_POS, -R_WALL + 0.62)],    // de la plaza vers le fond
    [P(-R_WALL + 0.62, 0.5), P(R_WALL - 0.62, 0.5)]                        // transversale
  ];
}
function drawIsoAvenues(ctx, cx, cy, W, night) {
  const lanes = isoAvenueLanes(W, cx, cy);
  const trace = () => { ctx.beginPath(); for (const [a, b] of lanes) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } };
  ctx.lineCap = 'round'; ctx.lineWidth = W * 0.3;
  const laneTex = isoTextures(cityBiome()).lane;
  trace(); strokeTextured(ctx, laneTex, night ? '#3a2c1e' : '#c8a878', night ? 0.85 : (hasPaintedTexture(laneTex) ? 0.15 : 0.5));
  ctx.strokeStyle = night ? 'rgba(0,0,0,0.22)' : 'rgba(90,60,30,0.24)'; ctx.lineWidth = W * 0.32; ctx.globalCompositeOperation = 'multiply';
  trace(); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

// Enceinte : sprites rendus en 3D (assets/images/3d/walls/<faction>/<palier>_*.webp) : des tronçons de courtine
// (hauts à l'arrière, murets à l'avant pour laisser voir la ville et les champs), quatre tours d'angle, deux
// tourelles et un vantail à la porte, selon la faction, le palier du Mur (niveaux 1-6, 7-13, 14-20) et le biome
// (neige), triés en profondeur avec le reste de la scène. Tant que les images ne sont pas chargées, rien n'est
// dessiné (le rendu est relancé à leur chargement).
// Drapeaux animés : mât et étoffe rendus en 3D en 8 phases (props/flag_<faction|ally|gold>_<k>.webp), posés sur
// les bâtiments qui en portent (mât en unités iso : ix, iy, iz, hauteur[, étoffe]) et sur l'enceinte au palier 3
const ISO_FLAGS = { MAIN_HALL: [[0, 0, 2.28, 0.8]], BARRACKS: [[-0.95, -0.55, 1.1, 0.7]], GREAT_BARRACKS: [[1.05, -0.75, 1.4, 0.7]], EMBASSY: [[-0.9, -0.6, 2.05, 0.7], [0.9, -0.6, 2.05, 0.7, 'ally']], HERO_MANSION: [[0.75, -0.25, 2.35, 0.6]], HUN_WAR_TENT: [[0, 0, 1.6, 0.5]], RALLY_POINT: [[0, 0, 0.06, 1.4]], SULTAN_DESERT_OUTPOST: [[0.75, -0.55, 2.8, 0.4, 'gold']] };
const WALL_SEG_FLAG_Z = { GAUL: 1.8, HUN: 1.8 }, WALL_TOWER_FLAG_Z = { ROME: 3.21, SULTAN: 3.51, GAUL: 3.31, HUN: 3.31, EGYPT: 2.31, GREEK: 2.81 };
const FLAG_FRAMES = 8, FLAG_POLE_PX = 43 / 96;   // dans le cadre 64×96 du drapeau, le mât d'une unité mesure 43 px
let isoWallFlags = [];
// Ancre écran et hauteur (px) d'un drapeau porté par un sprite de largeur w (cadre 130 px : 1 unité de hauteur = 30,6 px)
// Les sprites de bâtiments ont leur entrée au sud-est : modèles 3D réfléchis par le plan x = z (tools/render3d/50-buildings.js,
// sauf le temple grec, déjà ouvert au sud-est) et images peintes de même orientation. Les accroches ISO_FLAGS,
// ISO_CHIMNEYS et ISO_WATER sont écrites dans le repère des modèles : on échange ix et iy pour les poser sur les sprites.
// Doit rester accordé à window.BUILDINGS_FACE_SE des rendus.
const ISO_BUILDINGS_FACE_SE = true;
function isoBuildingAnchor(ix, iy) { return ISO_BUILDINGS_FACE_SE ? [iy, ix] : [ix, iy]; }
// Le vent souffle vers la gauche de l'écran : les drapeaux et la fumée « cuits » dans les sprites réfléchis penchent à
// gauche, les drapeaux et la fumée animés suivent
const ISO_WIND = ISO_BUILDINGS_FACE_SE ? -1 : 1;
// Surélévation de l'esplanade des bâtiments au palier 3 (tools/render3d/50-buildings.js, sauf NO_KIT)
const ISO_T3_LIFT = 0.08, ISO_NO_KIT = ['WALL', 'MOAT', 'EGYPTIAN_IRRIGATION', 'RALLY_POINT', 'HIDEOUT'];
function isoFlagAt(x, y, w, ix, iy, iz, h, kind) { const p = spritePointToScreen(x, y, w, ix, iy, iz); return { x: p.x, y: p.y, hpx: h * w * (30.6 / 130) / FLAG_POLE_PX, kind, seed: Math.abs(Math.round(x + y)) }; }
function wallSpriteUrl(name, tier) { return art(`walls/${player?.faction || 'ROME'}/${tier}_${name}${cityBiome() === 'snow' ? '_snow' : ''}.webp`); }
function isoWallItems(ctx, cx, cy, W, wallLevel, night, lowAll = false) {
  // Palier visuel de l'enceinte : celui de la ville, donné par le Bâtiment principal (1-9, 10-19, 20+) ; le Mur n'en fixe que l'existence
  const tier = typeof cityTierFromMainHall === 'function' ? cityTierFromMainHall(cityMainHallLevel()) : (wallLevel <= 6 ? 1 : wallLevel <= 13 ? 2 : 3);
  const img = {};
  for (const n of ['seg_x', 'seg_x_low', 'seg_z', 'seg_z_low', 'tower']) img[n] = getSprite(wallSpriteUrl(n, tier));
  if (Object.values(img).some(i => !i)) return [];
  const R = R_WALL, N = ISO_WALL_SEGMENTS, L = 2 * R / N;   // un tronçon couvre L cellules ; le sprite représente une cellule et est mis à l'échelle
  const variant = spriteVariant(false);
  const faction = player?.faction || 'ROME';
  const items = [];
  isoWallFlags = [];
  const edge = (from, to, high, along, gate = false) => {
    const sprite = img[`seg_${along}${high && !lowAll ? '' : '_low'}`];
    const sw = W * ISO_SP * L / SPRITE_PLOT_W * 1.03;
    for (let k = 0; k < N; k++) {
      if (gate && k === ISO_GATE_INDEX) continue;   // l'ouverture de la porte
      const t = (k + 0.5) / N;
      const g = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      const p = isoPos(g[0], g[1], W, cx, cy);
      items.push({ depth: g[0] + g[1], y: p.y, draw: () => drawSprite(ctx, sprite, p.x, p.y, sw, variant) });
      if (tier === 3 && high && !lowAll && k % 2 === 1) isoWallFlags.push(isoFlagAt(p.x, p.y, sw, 0, 0, WALL_SEG_FLAG_Z[faction] || 1.35, 0.6, faction));
    }
  };
  edge([-R, R], [-R, -R], true, 'z');    // arrière gauche (le long de iy)
  edge([-R, -R], [R, -R], true, 'x');    // arrière droit (le long de ix)
  // Faces avant (murets bas) : celle de la porte, parcourue dans le sens croissant de `along` (tronçon ISO_GATE_INDEX
  // ouvert), et l'autre face avant ; tronçons « z » le long de gy, « x » le long de gx
  const gateAxis = ISO_GATE_SIDE === 'SE' ? 'z' : 'x', otherAxis = ISO_GATE_SIDE === 'SE' ? 'x' : 'z';
  edge(isoGateGrid(-R, R), isoGateGrid(R, R), false, gateAxis, true);   // face de la porte (sud-est)
  edge(isoGateGrid(R, -R), isoGateGrid(R, R), false, otherAxis);        // autre face avant (sud-ouest)
  // Porte : deux tourelles de part et d'autre de l'ouverture et un vantail de bois entre elles
  const gw = L;   // largeur de l'ouverture (cellules)
  for (const side of [-1, 1]) {
    const g = isoGateCell(side * (gw / 2 + 0.08));
    const p = isoPos(g[0], g[1], W, cx, cy);
    const tw = W * ISO_SP * 0.78 / SPRITE_PLOT_W * (lowAll ? 0.72 : 0.9);
    items.push({ depth: g[0] + g[1] + 0.02, y: p.y + 1, draw: () => drawSprite(ctx, img.tower, p.x, p.y, tw, variant) });
  }
  const gc = isoGateCell(0), gp = isoPos(gc[0], gc[1], W, cx, cy);
  items.push({ depth: gc[0] + gc[1] + 0.01, y: gp.y, draw: () => drawIsoGateDoor(ctx, gp.x, gp.y, W, gw, lowAll, night) });
  for (const [gx, gy, scale] of [[-R, -R, 1], [-R, R, 1], [R, -R, 1], [R, R, 0.85]]) {
    const p = isoPos(gx, gy, W, cx, cy);
    const tw = W * ISO_SP * 1.12 / SPRITE_PLOT_W * scale * (lowAll ? 0.8 : 1);   // tours d'angle plus imposantes
    items.push({ depth: gx + gy + 0.01, y: p.y, draw: () => drawSprite(ctx, img.tower, p.x, p.y, tw, variant) });
    if (tier === 3 && !lowAll) isoWallFlags.push(isoFlagAt(p.x, p.y, tw, 0, 0, WALL_TOWER_FLAG_Z[faction] || 3.2, 0.6, faction));
  }
  void night;
  return items;
}

// La porte de la ville est sur l'arête sud-est de l'enceinte (bord inférieur droit du losange), dans l'axe de
// l'avenue ; `along` décale le long de cette arête (en cellules, + vers le coin sud)
function isoGateCell(along = 0) { return isoGateGrid(ISO_GATE_POS + along, R_WALL); }
// Vantail de bois cintré, à plat dans le plan de l'arête (côtés verticaux à l'écran)
function drawIsoGateDoor(ctx, x, y, W, gw, low, night) {
  const half = isoPos(...isoGateGrid(gw / 2 * 0.86, R_WALL), W, 0, 0), zero = isoPos(...isoGateGrid(0, R_WALL), W, 0, 0);
  const dx = half.x - zero.x, dy = half.y - zero.y;   // demi-vecteur le long de l'arête (vers le sud)
  const h = W * (low ? 0.62 : 0.8);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + dx, y + dy - h); ctx.lineTo(x - dx, y - dy - h); ctx.closePath();
  const g = ctx.createLinearGradient(x, y - h, x, y);
  g.addColorStop(0, night ? '#2a1c10' : '#6b4a2a'); g.addColorStop(1, night ? '#1a1008' : '#4e351c');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = night ? 'rgba(20,12,4,0.9)' : 'rgba(40,24,10,0.85)'; ctx.lineWidth = Math.max(1, W * 0.025); ctx.stroke();
  // planches et ferrures
  ctx.strokeStyle = night ? 'rgba(0,0,0,0.35)' : 'rgba(30,18,8,0.35)'; ctx.lineWidth = 1;
  for (const f of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(x + dx * f, y + dy * f); ctx.lineTo(x + dx * f, y + dy * f - h); ctx.stroke(); }
  ctx.strokeStyle = night ? '#3a3a3a' : '#8a8a8a'; ctx.lineWidth = Math.max(1, W * 0.03);
  for (const f of [0.28, 0.66]) { ctx.beginPath(); ctx.moveTo(x - dx * 0.9, y - dy * 0.9 - h * f); ctx.lineTo(x + dx * 0.9, y + dy * 0.9 - h * f); ctx.stroke(); }
  // linteau de pierre
  ctx.fillStyle = night ? '#4a4034' : '#cfc2a6';
  ctx.beginPath(); ctx.moveTo(x - dx * 1.05, y - dy * 1.05 - h); ctx.lineTo(x + dx * 1.05, y + dy * 1.05 - h); ctx.lineTo(x + dx * 1.05, y + dy * 1.05 - h - W * 0.07); ctx.lineTo(x - dx * 1.05, y - dy * 1.05 - h - W * 0.07); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Route de terre : elle part de la porte (arête sud-est) et s'éloigne vers le sud-est de l'écran en ondulant
// un peu, comme un chemin de campagne
function isoRoadPoints(cx, cy, W) {
  const gc = isoGateCell(0), gp = isoPos(gc[0], gc[1], W, cx, cy);
  const th = 0;
  // sens de sortie à l'écran : vers la droite pour une porte au sud-est, vers la gauche au sud-ouest
  const side = Math.sign(isoPos(...isoGateGrid(0, 1), 1, 0, 0).x - isoPos(...isoGateGrid(0, 0), 1, 0, 0).x) || 1;
  // direction perpendiculaire à l'arête, vers l'extérieur (sud-est à l'écran = bas droit), plus plongeante que l'axe iso
  const out = { x: 0.62 * side, y: 0.78 };
  const p0 = { x: gp.x, y: gp.y + W * 0.1 };
  const p1 = { x: p0.x + out.x * W * 0.8, y: p0.y + out.y * W * 0.8 };
  const p2 = { x: p0.x + out.x * W * 2.4 - side * W * 0.5, y: p0.y + out.y * W * 2.4 };   // l'ondulation revient vers l'axe de la ville
  const p3 = { x: p0.x + out.x * W * 4.6 + side * W * 0.4, y: Math.max(p0.y + out.y * W * 4.2, cityViewH + W * 0.5) };
  return { gp, th, p0, p1, p2, p3 };
}
function drawIsoRoad(ctx, cx, cy, W, night) {
  const { p0, p1, p2, p3 } = isoRoadPoints(cx, cy, W);
  const trace = () => { ctx.beginPath(); ctx.moveTo(p0.x, p0.y - W * 0.3); ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y); };
  ctx.lineCap = 'round'; ctx.lineWidth = W * 0.36;
  const roadTex = isoTextures(cityBiome()).road;
  trace(); strokeTextured(ctx, roadTex, night ? '#3a2c1e' : '#b89468', night ? 0.85 : (hasPaintedTexture(roadTex) ? 0.2 : 0.5));
  // bords adoucis, ornières
  ctx.strokeStyle = night ? 'rgba(0,0,0,0.25)' : 'rgba(90,60,30,0.28)'; ctx.lineWidth = W * 0.38; ctx.globalCompositeOperation = 'multiply';
  trace(); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = night ? 'rgba(0,0,0,0.22)' : 'rgba(80,55,30,0.22)'; ctx.lineWidth = Math.max(1, W * 0.025);
  ctx.setLineDash([W * 0.35, W * 0.25]);
  for (const off of [-W * 0.08, W * 0.08]) { ctx.beginPath(); ctx.moveTo(p0.x + off, p0.y); ctx.bezierCurveTo(p1.x + off, p1.y, p2.x + off, p2.y, p3.x + off, p3.y); ctx.stroke(); }
  ctx.setLineDash([]);
}
function drawIsoGateRamp() { /* plus de plateau : la porte est de plain-pied */ }

// Décors autour de la scène : la couronne de cellules hors de l'enceinte reflète les cases de la carte autour
// de la ville (chaque groupe de trois cellules de scène = une case de carte). Forêt dense, rochers des massifs,
// dunes, plans d'eau (rivière, lac, oasis, lac gelé) apparaissent du côté où la carte les place ; ailleurs,
// quelques arbres et rochers du biome. Positions stables (graine par cellule).
function isoMapFeatureAt(gx, gy) {
  if (!currentCity || typeof Terrain === 'undefined') return null;
  const dx = Math.sign(gx) * Math.max(1, Math.round(Math.abs(gx) / 3)), dy = Math.sign(gy) * Math.max(1, Math.round(Math.abs(gy) / 3));
  if (!dx && !dy) return null;
  const t = Terrain.getTerrainType(currentCity.x + dx, currentCity.y + dy);
  // une rivière (et ses ponts et gués) est de l'eau dans le paysage de la ville, gelée en zone enneigée
  if (t.feature === 'river' || t.feature === 'bridge' || t.feature === 'ford') return t.biome === 'snow' ? 'frozen' : 'water';
  return t.feature;
}
// Distance (px écran) d'un point à la route de terre : la courbe de Bézier de drawIsoRoad, échantillonnée
function isoRoadSampler(cx, cy, W) {
  const { p0, p1, p2, p3 } = isoRoadPoints(cx, cy, W);
  const s0 = { x: p0.x, y: p0.y - W * 0.3 };
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    pts.push({ x: u * u * u * s0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * s0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y });
  }
  return (x, y) => { let d = Infinity; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1; const k = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2)); d = Math.min(d, Math.hypot(x - a.x - k * vx, y - a.y - k * vy)); } return d; };
}
function isoLandscape(view, W, cx, cy) {
  const props = biomeScene(cityBiome()).props;
  const out = [], water = [];
  const rMin = Math.ceil(R_WALL) + 1, rMax = rMin + 2;
  const roadDist = isoRoadSampler(cx, cy, W);   // rien n'est posé sur la route, même là où elle s'écarte de l'axe de la porte
  for (let gx = -rMax; gx <= rMax; gx++) for (let gy = -rMax; gy <= rMax; gy++) {
    const r = Math.max(Math.abs(gx), Math.abs(gy));
    if (r < rMin || r > rMax) continue;
    // la route sort par la porte vers le sud-est : on laisse ce couloir libre (repère de la porte)
    const f = isoGateFrame(gx, gy);
    if (f.depth > R_WALL && Math.abs(f.along - ISO_GATE_POS) <= 1 && f.depth - f.along > R_WALL) continue;
    const seed = (gx + 50) * 97 + (gy + 50) * 13;
    const roll = isoSeeded(seed);
    const feature = isoMapFeatureAt(gx, gy);
    const jitter = (k) => (isoSeeded(seed + k) - 0.5) * 0.7;
    const p = isoPos(gx + jitter(1), gy + jitter(2), W, cx, cy);
    const dRoad = roadDist(p.x, p.y);
    if (feature === 'water' || feature === 'frozen' || feature === 'oasis') {
      if (dRoad < W * (0.9 + isoSeeded(seed + 5) * 0.5) + W * 0.25) continue;   // un plan d'eau ne recouvre pas la route
      water.push({ x: p.x, y: p.y, rx: W * (0.9 + isoSeeded(seed + 5) * 0.5), ry: W * (0.42 + isoSeeded(seed + 6) * 0.2), kind: feature, depth: gx + gy });
      if (feature === 'oasis' && roll < 0.5) out.push({ x: p.x + W * 0.35, y: p.y - W * 0.05, kind: 'palm', h: W * 0.85, depth: gx + gy + 0.1 });
      continue;
    }
    if (dRoad < W * 0.55) continue;   // ni arbre ni rocher sur la route
    let kind = null, h = 0;
    if (feature === 'mountain' || feature === 'icemountain' || feature === 'mesa' || feature === 'rocks') {
      if (roll > 0.8) continue;
      kind = roll < 0.5 ? props.rock : (props.rock === 'snowrock' ? 'snowrock' : 'rock2');
      h = W * (0.6 + isoSeeded(seed + 4) * 0.5);
    } else if (feature === 'dunes') {
      if (roll > 0.75) continue;
      kind = 'dune'; h = W * (0.5 + isoSeeded(seed + 4) * 0.3);
    } else if (feature === 'tree' || feature === 'snowtree') {
      if (roll > 0.85) continue;
      kind = props.trees[Math.floor(isoSeeded(seed + 3) * props.trees.length)];
      h = W * (0.8 + isoSeeded(seed + 4) * 0.4);
    } else if (feature === 'ruins') {
      if (roll > 0.5) continue;
      kind = roll < 0.25 ? 'stump' : props.rock; h = W * 0.5;
    } else {
      if (roll > 0.5) continue;
      kind = roll < 0.08 ? props.rock : props.trees[Math.floor(isoSeeded(seed + 3) * props.trees.length)];
      h = W * (kind === props.rock ? 0.5 : 0.75 + isoSeeded(seed + 4) * 0.35);
    }
    out.push({ x: p.x, y: p.y, kind, h, depth: gx + gy });
  }
  void view;
  return { props: out, water };
}
function isoSceneProps(view, W, cx, cy) { return isoLandscape(view, W, cx, cy).props; }
// Plans d'eau au sol (avant les objets) : lac, rivière, oasis ou glace selon la carte
function drawIsoScenePonds(ctx, water, W, night) {
  for (const w of water) {
    const ice = w.kind === 'frozen', oasis = w.kind === 'oasis';
    const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.rx);
    if (ice) { g.addColorStop(0, night ? '#5a6a7e' : '#e8f1f8'); g.addColorStop(1, night ? '#3a4656' : '#b8cfe0'); }
    else if (oasis) { g.addColorStop(0, night ? '#1e4a4a' : '#5fc0b8'); g.addColorStop(1, night ? '#12303a' : '#2e8a92'); }
    else { g.addColorStop(0, night ? '#24405a' : '#5e9ec8'); g.addColorStop(1, night ? '#142a40' : '#2f6c9a'); }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = W * 0.15;
    ctx.beginPath(); ctx.ellipse(w.x, w.y, w.rx, w.ry, 0, 0, Math.PI * 2);
    fillTextured(ctx, ice ? 'ice' : oasis ? 'water_shallow' : 'water_lake', g, night ? 0.75 : 0.35);   // texture d'eau peinte quand elle existe, sinon dégradé
    ctx.restore();
    ctx.strokeStyle = ice ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.28)'; ctx.lineWidth = Math.max(1, W * 0.02);
    ctx.beginPath(); ctx.ellipse(w.x, w.y, w.rx * 0.92, w.ry * 0.9, 0, 0, Math.PI * 2); ctx.stroke();
    if (!ice) { ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(w.x - w.rx * 0.2, w.y - w.ry * 0.25, w.rx * 0.35, w.ry * 0.25, 0, 0, Math.PI * 2); ctx.stroke(); }
  }
}

// Décor intérieur, dense comme dans Rise of Kingdoms : bosquets sur les cellules libres, rangée d'arbres et de
// buissons au pied des murs, petits décors dans les interstices entre les parcelles (hors avenues et plaza).
// Positions stables (graine par emplacement), essences du biome.
const ISO_DECOR = {
  forest: { small: ['bush', 'flowers', 'bush', 'rock', 'flowers', 'stump'], tree: ['oak', 'pine', 'oak2', 'pine2'] },
  desert: { small: ['cactus', 'rock', 'bush', 'rock2', 'cactus'], tree: ['palm', 'palm', 'cactus'] },
  snow: { small: ['snowrock', 'stump', 'snowrock'], tree: ['snowpine', 'snowpine', 'pine2'] }
};
function isoInnerDecor(W, cx, cy, biome) {
  const d = ISO_DECOR[biome] || ISO_DECOR.forest;
  const out = [];
  const pick = (arr, seed) => arr[Math.floor(isoSeeded(seed) * arr.length)];
  const push = (gx, gy, kind, h, depthOff = 0) => { const p = isoPos(gx, gy, W, cx, cy); out.push({ x: p.x, y: p.y, kind, h, depth: gx + gy + depthOff }); };
  // 1) bosquets sur les cellules libres
  for (const [gx, gy] of ISO_SPARE_CELLS) {
    const seed = Math.round((gx + 20) * 31 + (gy + 20) * 7);
    push(gx, gy + 0.08, pick(d.tree, seed), W * (0.95 + isoSeeded(seed + 1) * 0.25));
    push(gx - 0.32, gy + 0.22, pick(d.tree, seed + 2), W * 0.7, 0.05);
    push(gx + 0.3, gy + 0.18, pick(d.small, seed + 3), W * 0.34, 0.06);
    push(gx + 0.1, gy - 0.3, pick(d.tree, seed + 4), W * 0.62, -0.1);
  }
  // 2) rangée au pied des murs : arbres derrière (fond), buissons devant (pour ne pas cacher les champs) ; devant
  // la porte, un passage est laissé libre
  const rb = R_WALL - 0.42;
  for (let a = -3.1; a <= 3.1; a += 0.5) {
    const seed = Math.round(a * 10) + 500;
    const j = (k) => (isoSeeded(seed + k) - 0.5) * 0.25;
    push(a + j(1), -rb + j(2), pick(d.tree, seed), W * (0.72 + isoSeeded(seed + 3) * 0.3));
    push(-rb + j(4), a + j(5), pick(d.tree, seed + 6), W * (0.72 + isoSeeded(seed + 7) * 0.3));
    const atGate = Math.abs(a - ISO_GATE_POS) <= 0.85;
    if (!(atGate && ISO_GATE_SIDE === 'SE')) push(rb + j(8), a + j(9), pick(d.small, seed + 10), W * 0.34);    // avant droit (sud-est)
    if (!(atGate && ISO_GATE_SIDE === 'SW')) push(a + j(11), rb + j(12), pick(d.small, seed + 13), W * 0.34);  // avant gauche (sud-ouest)
  }
  // 3) interstices entre parcelles
  for (let gx = -3; gx <= 2; gx++) for (let gy = -3; gy <= 2; gy++) {
    if (gx === 0 || gy === 0) continue;   // couloirs des avenues
    const px = gx + 0.5, py = gy + 0.5;
    if (Math.abs(px) + Math.abs(py) < R_PLAZA + 0.7) continue;
    const seed = (gx + 10) * 53 + (gy + 10) * 11 + 900;
    if (isoSeeded(seed) > 0.5) continue;
    const kind = isoSeeded(seed + 1) < 0.2 ? pick(d.tree, seed + 2) : pick(d.small, seed + 2);
    const tree = d.tree.includes(kind);
    push(px + (isoSeeded(seed + 3) - 0.5) * 0.2, py + (isoSeeded(seed + 4) - 0.5) * 0.2, kind, W * (tree ? 0.5 : 0.3), 0.01);
  }
  return out;
}

// Parcelle au sol (rendu 3D du biome) sous chaque cellule ; la variante dépend de la cellule
function drawIsoPlot(ctx, s) {
  const img = getSprite(plotSpriteUrl((Math.round(s.gx) * 3 + Math.round(s.gy) * 5 + 10) & 1));
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
// Onglet Champs : les parcelles de champ sont soulignées pour se repérer
function drawIsoFieldFocus(ctx, s) {
  ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,215,0,0.55)'; ctx.lineWidth = 1.5;
  isoDiamondPath(ctx, s.x, s.y, s.hw + 1, s.hh + 0.5); ctx.stroke(); ctx.setLineDash([]);
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
function cityMainHallLevel() { return (currentCity?.buildings || []).reduce((m, b) => (b.key === 'MAIN_HALL' && b.level > m ? b.level : m), 1); }

// ---------- Animations légères (12 i/s) : fumée des cheminées, reflets d'eau, oiseaux, torches ----------
// Position (ix, iy, iz) dans le repère du sprite (tools/build-assets.cjs : P()) -> écran, pour un sprite de
// largeur w dont le centre du losange est en (x, y)
function spritePointToScreen(x, y, w, ix, iy, iz) {
  const px = 100 + (ix - iy) * 25, py = 70 + (ix + iy) * 12.5 - iz * 30.6;   // 1 unité = 25 px en x, 12,5 px en profondeur, 30,6 px en hauteur (cadre 130 px)
  return { x: x + ((px - 100) / 130) * w, y: y + ((py - 70) / 130) * w };
}
// Sommets des cheminées des modèles 3D (ix, iy, iz) : la fumée part de là
// (repère des modèles, voir isoBuildingAnchor ; hauteur = haut du chapeau de cheminée, mesurée sur les rendus)
const ISO_CHIMNEYS = { WORKSHOP: [[-0.5, -0.3, 1.81]], FORGE: [[0.2, -0.3, 1.86]], BAKERY: [[0.3, -0.4, 1.81]], FOUNDRY: [[-0.4, -0.4, 2.11], [0.2, -0.4, 1.96]], GALLIC_BREWERY: [[0.2, -0.4, 1.66]] };
const ISO_WATER = { MOAT: [0, 0, 0.02, 0.9], ROMAN_THERMAE: [0, 0.5, 0.035, 0.5], EGYPTIAN_IRRIGATION: [0, 0, 0.03, 0.8] };   // ix, iy, iz, rayon (cellules)
const isoAnim = { smoke: [], birds: null, nextBirds: 0, last: 0, camKey: '' };
function isoAnimate(ctx, built, W, night, flags = []) {
  const now = performance.now() / 1000;
  // drapeaux : 8 phases à 10 i/s, décalées d'un mât à l'autre
  const fv = spriteVariant(false);
  for (const f of flags) {
    const name = `flag_${f.kind}_${(Math.floor(now * 10) + f.seed) % FLAG_FRAMES}`;
    if (ISO_WIND < 0) { ctx.save(); ctx.translate(f.x, 0); ctx.scale(-1, 1); ctx.translate(-f.x, 0); drawProp(ctx, name, f.x, f.y, f.hpx, fv); ctx.restore(); }   // étoffe vers la gauche, mât en place
    else drawProp(ctx, name, f.x, f.y, f.hpx, fv);
  }
  const camKey = `${W}|${cityCam.x}|${cityCam.y}`;
  if (camKey !== isoAnim.camKey) { isoAnim.camKey = camKey; isoAnim.smoke = []; }   // les particules sont en pixels écran
  const dt = Math.min(0.2, now - (isoAnim.last || now)); isoAnim.last = now;
  // fumée
  for (const b of built) {
    if (b.painted) continue;   // une image peinte porte sa propre fumée
    for (const ch of ISO_CHIMNEYS[b.key] || []) {
      const [ax, ay] = isoBuildingAnchor(ch[0], ch[1]);
      const p = spritePointToScreen(b.x, b.y, b.w, ax * (b.ts || 1), ay * (b.ts || 1), ch[2] * (b.ts || 1) + (b.lift || 0));
      if (Math.random() < dt * 2.2 && isoAnim.smoke.length < 160) isoAnim.smoke.push({ x: p.x + (Math.random() - 0.5) * W * 0.03, y: p.y - W * 0.04, r: W * 0.03, a: 0.5, vx: ISO_WIND * W * 0.025, vy: -W * 0.11, life: 0, k: Math.floor(Math.random() * 4) });
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
    const [wx, wy] = isoBuildingAnchor(wt[0], wt[1]);
    const p = spritePointToScreen(b.x, b.y, b.w, wx * (b.ts || 1), wy * (b.ts || 1), wt[2] * (b.ts || 1) + (b.lift || 0));
    const rr = wt[3] * (b.ts || 1) * b.w * 0.27, sw = rr * 2.9, sh = sw * 64 / 96;
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
// Signature de tout ce qui change le fond statique de la ville (bâtiments, files, survol, sélection, caméra, sprites chargés)
let isoStatic = { key: '', canvas: null, overlay: [], built: [], lit: [] };
function isoStaticKey(view, W, cx, cy, night, biome) {
  const b = (currentCity?.buildings || []).map(x => x.key + x.slot + ':' + x.level).join(',');
  const q = (currentCity?.buildQueue || []).map(x => x.slot + x.status).join(',');
  let ready = 0; for (const s of _sprites.values()) if (s.ready) ready++;
  return [view, currentCityView, currentCity?.id, W.toFixed(2), cx.toFixed(1), cy.toFixed(1), cityViewW, cityViewH, night, biome, cityHoveredSlot, citySelectedSlot, b, q, ready, paintedSet.size, canvasScale(), player?.faction].join('|');
}

function renderCityView() {
  if (!cityCanvas || !cityCtx) return;
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
  positionCityActions();
}
function renderFieldsView() { renderCityView(); }

// Fond statique de la ville ; renvoie les éléments à dessiner chaque image (overlay, bâtiments, lumières, drapeaux)
function renderCityStatic(ctx, W, cx, cy, night, biome) {
  ctx.clearRect(0, 0, cityViewW, cityViewH);
  drawIsoTerrain(ctx, biome, night);
  const landscape = isoLandscape('city', W, cx, cy);
  drawIsoScenePonds(ctx, landscape.water, W, night);
  drawIsoRoad(ctx, cx, cy, W, night);
  drawIsoGround(ctx, cx, cy, W, biome, night);
  drawIsoAvenues(ctx, cx, cy, W, night);
  drawIsoPlaza(ctx, cx, cy, W, night);
  drawIsoDecals(ctx, W, cx, cy, biome);
  // Objets triés de l'arrière vers l'avant (profondeur gx+gy, puis y écran) ; l'enceinte est poussée avant
  // les bâtiments pour qu'à profondeur égale elle reste derrière eux
  const items = [];
  for (const p of landscape.props) items.push({ depth: p.depth, y: p.y, draw: () => drawProp(ctx, p.kind, p.x, p.y, p.h, spriteVariant(false)) });
  const wallLevel = cityWallLevel();
  if (wallLevel > 0) items.push(...isoWallItems(ctx, cx, cy, W, wallLevel, night));
  for (const d of isoInnerDecor(W, cx, cy, biome)) items.push({ depth: d.depth, y: d.y, draw: () => drawProp(ctx, d.kind, d.x, d.y, d.h, spriteVariant(false)) });
  const lit = [], built = [];
  const fieldsFocus = currentCityView === 'fields';
  isoOverlayQueue = [];
  for (const s of citySlots) {
    const hovered = cityHoveredSlot === s.slot || citySelectedSlot === s.slot;
    if (s.isField) {
      const building = getFieldBuildingAtSlot(s.slot, s.fieldType);
      const isBuilding = currentCity?.buildQueue?.some(q => q.buildingKey === s.fieldType && q.slot === s.slot && q.status === 'RUNNING');
      items.push({ depth: s.gx + s.gy, y: s.y, draw: () => {
        if (fieldsFocus && !hovered) drawIsoFieldFocus(ctx, s);
        if (hovered) drawIsoHoverCell(ctx, s);
        drawFieldSlot(s, building, hovered, isBuilding);
      } });
      continue;
    }
    const building = getBuildingAtSlot(s.slot);
    const key = s.fixed ? s.fixedKey : building?.key;
    const level = building?.level || (s.fixed ? 1 : 0);
    const isBuilding = currentCity?.buildQueue?.some(q => q.slot === s.slot && q.status === 'RUNNING');
    items.push({ depth: s.gx + s.gy, y: s.y, draw: () => {
      drawIsoPlot(ctx, s);
      if (!key) { drawIsoEmptyCell(ctx, s, hovered, night); return; }
      if (hovered) drawIsoHoverCell(ctx, s);
      draw25DBuilding(s.x, s.y, s.size, key, level, hovered, isBuilding);
    } });
    if (key) built.push({ key, x: s.x, y: s.y, w: s.size * 1.7, ts: buildingTierScale(level), lift: buildingTier(level) === 3 && !ISO_NO_KIT.includes(key) ? ISO_T3_LIFT : 0, painted: String(buildingSpriteUrl(key, level)).includes('/painted/') });
    if (key && night) lit.push({ x: s.x, y: s.y - W * 0.22, r: W * 0.55 * (s.fixed ? 1.3 : 1), a: 0.3, seed: s.slot });
  }
  if (wallLevel > 0 && night) {   // torches de la porte
    for (const side of [-1, 1]) { const g = isoGateCell(side * 0.6); const p = isoPos(g[0], g[1], W, cx, cy); lit.push({ x: p.x, y: p.y - W * 0.45, r: W * 0.42, a: 0.34, seed: 70 + side }); }
  }
  items.sort((a, b) => a.depth - b.depth || a.y - b.y);
  for (const it of items) it.draw();
  const overlay = isoOverlayQueue; isoOverlayQueue = null;
  const flags = wallLevel > 0 ? [...isoWallFlags] : [];
  for (const b of built) for (const f of ISO_FLAGS[b.key] || []) {
    if (b.painted) continue;   // une image peinte porte ses propres bannières
    const [fx0, fy0] = isoBuildingAnchor(f[0], f[1]);
    flags.push(isoFlagAt(b.x, b.y, b.w, fx0 * (b.ts || 1), fy0 * (b.ts || 1), f[2] * (b.ts || 1) + (b.lift || 0), f[3], f[4] || player?.faction || 'ROME'));
  }
  return { overlay, built, lit, flags };
}
function renderFieldsStatic(ctx, W, cx, cy, night, biome) { return renderCityStatic(ctx, W, cx, cy, night, biome); }

// ---------- Bulles d'action (façon Rise of Kingdoms) ----------
// Un toucher sur un bâtiment, un champ ou un emplacement libre affiche son nom, son niveau et des boutons ronds
// (Améliorer / Construire, Recruter, Marché…, Infos) au-dessus de lui ; le bâtiment reste surligné tant que la bulle est ouverte
let citySelectedSlot = null;
const cityActions = { slot: null, buttons: [] };
function cityActionsEl() { return document.getElementById('city-actions'); }
function hideCityActions() {
  const el = cityActionsEl();
  if (el) el.style.display = 'none';
  const wasOpen = cityActions.slot !== null || citySelectedSlot !== null;
  cityActions.slot = null; citySelectedSlot = null; cityActions.buttons = [];
  if (wasOpen && cityCanvas && document.getElementById('tab-city')?.classList.contains('active')) renderCityCanvas();
}
function cityActionSpec(s) {
  const ico = (k) => art(`ui/${k}.webp`);
  const infos = (key) => ({ label: 'Infos', icon: ico('stats'), run: () => showBuildingInfoModal(key) });
  if (s.isField) {
    const b = getFieldBuildingAtSlot(s.slot, s.fieldType), level = b?.level || 0, name = getBuildingName(s.fieldType);
    const main = { label: level > 0 ? 'Améliorer' : 'Construire', icon: ico('build'), primary: true, run: () => openFieldBuildPanel(s.slot) };
    return { title: name, level, buttons: [main, infos(s.fieldType)] };
  }
  const building = getBuildingAtSlot(s.slot);
  const key = s.fixed ? s.fixedKey : building?.key;
  const level = building?.level || (s.fixed ? 1 : 0);
  if (!key) return { title: 'Emplacement libre', level: 0, buttons: [{ label: 'Construire', icon: ico('build'), primary: true, run: () => openBuildPanel(s.slot) }] };
  const buttons = [];
  if (['BARRACKS', 'STABLE', 'WORKSHOP'].includes(key)) buttons.push({ label: 'Recruter', icon: ico('recruit'), primary: true, run: () => openRecruitmentPanel(key, level, s.slot) });
  else buttons.push({ label: 'Améliorer', icon: ico('build'), primary: true, run: () => openBuildPanel(s.slot) });
  const extra = { MARKET: ['Marché', 'market', 'market'], RALLY_POINT: ['Armées', 'army', 'army'], HERO_MANSION: ['Héros', 'hero', 'hero'], EMBASSY: ['Alliance', 'alliance', 'alliance'], WATCHTOWER: ['Rapports', 'reports', 'reports'], TREASURE_CHAMBER: ['Sac', 'inventory', 'inventory'], HEALING_TENT: ['Blessés', 'endurance', null] }[key];
  if (extra) buttons.push({ label: extra[0], icon: ico(extra[1]), run: () => (extra[2] ? showTab(extra[2]) : openBuildPanel(s.slot)) });
  buttons.push(infos(key));
  return { title: getBuildingName(key), level, buttons };
}
function showCityActions(slot) {
  const el = cityActionsEl();
  const s = citySlots.find(x => x.slot === slot);
  if (!el || !s) return;
  if (cityActions.slot === slot && el.style.display !== 'none') { hideCityActions(); return; }   // second toucher : referme
  const spec = cityActionSpec(s);
  cityActions.buttons = spec.buttons;
  el.innerHTML = `<div class="ca-plate"><span class="ca-name">${escapeHtml(spec.title)}</span>${spec.level ? `<span class="ca-level">Niv. ${spec.level}</span>` : ''}</div>
    <div class="ca-buttons">${spec.buttons.map((b, i) => `<button type="button" class="ca-btn${b.primary ? ' primary' : ''}" data-i="${i}"><span class="ca-ico"><img src="${b.icon}" alt=""></span><span>${b.label}</span></button>`).join('')}</div><div class="ca-tip"></div>`;
  el.querySelectorAll('.ca-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); const b = cityActions.buttons[Number(btn.dataset.i)]; hideCityActions(); if (b) b.run(); }));
  el.style.display = 'flex';
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  cityActions.slot = slot; citySelectedSlot = slot;
  hideCityTooltip();
  positionCityActions();
  renderCityCanvas();
}
function positionCityActions() {
  const el = cityActionsEl();
  if (!el || cityActions.slot === null || el.style.display === 'none') return;
  const s = citySlots.find(x => x.slot === cityActions.slot);
  if (!s) { hideCityActions(); return; }
  const lift = s.isField ? s.hw * 0.95 : s.hw * (s.fixed ? 1.45 : 1.25);
  const x = Math.max(90, Math.min(cityViewW - 90, s.x)), y = Math.max(6, s.y - lift);
  el.style.left = `${x}px`; el.style.top = `${y}px`;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && typeof hideCityActions === 'function') hideCityActions(); });

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
    if (foundSlot !== null && foundSlot !== cityActions.slot) showCityTooltip(e.clientX, e.clientY, foundSlot);
    else hideCityTooltip();
  } else if (foundSlot !== null && foundSlot !== cityActions.slot) {
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
  const view = () => 'city';
  const pos = (e) => { const r = cityCanvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cityViewW / r.width), y: (e.clientY - r.top) * (cityViewH / r.height) }; };
  const zoomAt = (factor, px, py, render = true) => {
    const before = isoLayout(view());
    const z = Math.max(ISO_ZOOM_MIN, Math.min(ISO_ZOOM_MAX, cityCam.zoom * factor));
    if (z === cityCam.zoom) return;
    cityCam.zoom = z; cityCam.auto = false;
    if (cityActions.slot !== null) hideCityActions();
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
      if (!cityGesture.panning && cityActions.slot !== null) hideCityActions();
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
        if (cityHoveredSlot === null && Date.now() - cityGesture.tapAt < 350 && Math.hypot(p.x - (cityGesture.lastTap?.x || -999), p.y - (cityGesture.lastTap?.y || -999)) < 40) { hideCityActions(); resetCityCamera(); renderCityCanvas(); cityGesture.tapAt = 0; return; }
        cityGesture.lastTap = p;
        cityGesture.tapAt = Date.now();
        cityGesture.swallowClickUntil = cityGesture.tapAt + 350;
        renderCityCanvas();
        hideCityTooltip();
        if (cityHoveredSlot !== null && typeof haptic === 'function') haptic('light');
        onCityClick({ clientX: e.clientX, clientY: e.clientY });
      }
    }
  };
  cityCanvas.addEventListener('pointerup', end);
  cityCanvas.addEventListener('pointercancel', end);
  cityCanvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y); }, { passive: false });
  cityCanvas.addEventListener('dblclick', () => { hideCityActions(); resetCityCamera(); renderCityCanvas(); });
}
