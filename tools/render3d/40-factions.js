// ============================================================================
// 40-factions.js — styles architecturaux : matériaux et formes propres à chaque civilisation.
// style(faction) renvoie des matériaux prêts et des constructeurs de toit / porte / colonne qui
// appliquent la grammaire de la faction (tuiles romaines, chaume gaulois, marbre grec, grès et
// terrasses égyptiens, feutre hun, enduit et dômes du sultanat).
// ============================================================================
(function () {
  const T = window.THREE;
  const { material, solid, shade } = window.TEX;
  const P = window.P3;

  const PALETTES = {
    ROME:   { id: 'ROME',   wall: '#e2cfa4', wallKind: 'stone',     roof: '#d4532c', roofKind: 'tiles',  accent: '#b22a22', trim: '#80552e', cloth: '#b22a22', ground: 'grass' },
    GAUL:   { id: 'GAUL',   wall: '#c0a470', wallKind: 'planks',    roof: '#c2a24e', roofKind: 'thatch', accent: '#2f7a3a', trim: '#5e4024', cloth: '#2f7a3a', ground: 'grass' },
    GREEK:  { id: 'GREEK',  wall: '#f2eadb', wallKind: 'marble',    roof: '#4a7fb8', roofKind: 'slate',  accent: '#2d5c9c', trim: '#948468', cloth: '#2d5c9c', ground: 'grass' },
    EGYPT:  { id: 'EGYPT',  wall: '#ecd69c', wallKind: 'sandstone', roof: '#d9ad2e', roofKind: 'flat',   accent: '#d9ad2e', trim: '#8e6b36', cloth: '#2f9e98', ground: 'sand' },
    HUN:    { id: 'HUN',    wall: '#ae8f6e', wallKind: 'hide',      roof: '#8e3c26', roofKind: 'hide',   accent: '#b8341c', trim: '#56351f', cloth: '#b8341c', ground: 'dirt' },
    SULTAN: { id: 'SULTAN', wall: '#f0e0ba', wallKind: 'plaster',   roof: '#259a86', roofKind: 'dome',   accent: '#d9ad2e', trim: '#80603c', cloth: '#259a86', ground: 'sand' }
  };

  function style(faction) {
    const p = PALETTES[faction] || PALETTES.ROME;
    const f = p.id;
    const S = {
      id: f, p,
      wall: material(p.wallKind, p.wall),
      wallDark: material(p.wallKind, shade(p.wall, -14)),
      wallLight: material(p.wallKind, shade(p.wall, 8)),
      stone: material('stone', '#b8b0a0'),
      roofMat: material(p.roofKind === 'flat' ? 'sandstone' : p.roofKind === 'dome' ? 'plaster' : p.roofKind, p.roofKind === 'flat' ? shade(p.wall, -10) : p.roofKind === 'dome' ? shade(p.wall, 6) : p.roof),
      domeMat: material(f === 'SULTAN' ? 'mosaic' : 'metal', p.roof, { rough: 0.6 }),
      trim: material('planks', p.trim),
      wood: material('planks', '#8a6230'),
      cloth: material('cloth', p.cloth),
      accent: material('cloth', p.accent),
      gold: material('gold', '#e8c547', { rough: 0.35, metal: 0.45 }),
      column: material(f === 'GREEK' ? 'marble' : f === 'EGYPT' ? 'sandstone' : f === 'GAUL' || f === 'HUN' ? 'planks' : 'stone', f === 'GREEK' ? '#faf6ec' : f === 'EGYPT' ? '#f0dcaa' : f === 'GAUL' || f === 'HUN' ? '#9a7340' : '#efe6d0'),
      snow: material('snow', '#f4f8fc')
    };
    // Toit « principal » selon la faction, sur une boîte (ix0, iy0, w, d) dont le haut est à z
    S.roof = (g, ix0, iy0, w, d, h, z, opts = {}) => {
      const grp = new T.Group();
      if (f === 'EGYPT') { P.flatRoof(grp, ix0, iy0, w, d, S.roofMat, z, { parapet: true, merlons: true, parapetMat: S.wallDark }); frieze(grp, ix0, iy0, w, d, z, S.gold); }
      else if (f === 'SULTAN') { P.flatRoof(grp, ix0, iy0, w, d, S.roofMat, z, { parapet: true, parapetMat: S.wall }); const r = Math.min(w, d) * (opts.domeR ?? 0.36); P.dome(grp, ix0 + w / 2, iy0 + d / 2, r, S.domeMat, z + 0.06, true); finial(grp, ix0 + w / 2, iy0 + d / 2, z + 0.06 + r * 1.9, 'crescent', S); }
      else if (f === 'GREEK') { P.gable(grp, ix0, iy0, w, d, h * 0.7, S.roofMat, z, 0.22, 0.1, S.wallLight); pedimentDeco(grp, ix0, iy0, w, d, z, S); }
      else if (f === 'GAUL') { P.gable(grp, ix0, iy0, w, d, h * 1.35, S.roofMat, z, 0.3, 0.12, S.trim); crossBeams(grp, ix0, iy0, w, d, h * 1.35, z, S); }
      else if (f === 'HUN') { P.pyramid(grp, ix0 - 0.15, iy0 - 0.15, w + 0.3, d + 0.3, h * 1.1, material('hide', shade(p.roof, 4)), z); finial(grp, ix0 + w / 2, iy0 + d / 2, z + h * 1.1, 'tail', S); }
      else { P.gable(grp, ix0, iy0, w, d, h, S.roofMat, z, 0.2, 0.1, S.wallDark); }
      if (opts.snow && f !== 'EGYPT' && f !== 'SULTAN') snowCap(grp, ix0, iy0, w, d, h, z, f);
      g.add(grp); return grp;
    };
    // Toit en pavillon / pyramide
    S.hip = (g, ix0, iy0, w, d, h, z, opts = {}) => {
      const grp = new T.Group();
      if (f === 'EGYPT') { P.flatRoof(grp, ix0, iy0, w, d, S.roofMat, z, { parapet: true, merlons: true, parapetMat: S.wallDark }); frieze(grp, ix0, iy0, w, d, z, S.gold); }
      else if (f === 'SULTAN') { P.flatRoof(grp, ix0, iy0, w, d, S.roofMat, z, { parapet: true, parapetMat: S.wall }); const r = Math.min(w, d) * 0.42; P.dome(grp, ix0 + w / 2, iy0 + d / 2, r, S.domeMat, z + 0.06, true); finial(grp, ix0 + w / 2, iy0 + d / 2, z + 0.06 + r * 1.9, 'crescent', S); }
      else if (f === 'HUN') { P.cone(grp, ix0 + w / 2, iy0 + d / 2, Math.max(w, d) * 0.74, h, material('hide', shade(p.roof, 4)), z, 20); finial(grp, ix0 + w / 2, iy0 + d / 2, z + h, 'tail', S); }
      else if (f === 'GAUL') { P.hip(grp, ix0, iy0, w, d, h * 1.3, S.roofMat, z, 0.28); }
      else { P.hip(grp, ix0, iy0, w, d, h * (f === 'GREEK' ? 0.75 : 1), S.roofMat, z, 0.2); if (f !== 'GREEK') finial(grp, ix0 + w / 2, iy0 + d / 2, z + h, 'ball', S); }
      if (opts.snow && f !== 'EGYPT' && f !== 'SULTAN') snowCap(grp, ix0, iy0, w, d, h, z, f);
      g.add(grp); return grp;
    };
    // Toit conique (silo, tour) : chaume, feutre, dôme, ou tuiles
    S.cone = (g, cx, cy, r, h, z, opts = {}) => {
      const grp = new T.Group();
      if (f === 'EGYPT') P.dome(grp, cx, cy, r * 0.95, S.wallDark, z);
      else if (f === 'SULTAN') { P.dome(grp, cx, cy, r, S.domeMat, z, true); finial(grp, cx, cy, z + r * 1.9, 'crescent', S); }
      else if (f === 'GAUL') { P.cone(grp, cx, cy, r * 1.15, h * 1.35, S.roofMat, z, 20); }
      else if (f === 'HUN') { P.cone(grp, cx, cy, r * 1.1, h, material('hide', shade(p.roof, 4)), z, 20); finial(grp, cx, cy, z + h, 'tail', S); }
      else { P.cone(grp, cx, cy, r * 1.1, h * 1.1, S.roofMat, z, 24); finial(grp, cx, cy, z + h * 1.1, 'ball', S); }
      if (opts.snow && f !== 'EGYPT' && f !== 'SULTAN') { const sc = new T.Mesh(new T.ConeGeometry(r * 1.1 * 0.95, h * 0.5, 20), S.snow); sc.position.set(cx, z + h * 1.1 - h * 0.25 + 0.03, cy); P.setShadow(sc); grp.add(sc); }
      g.add(grp); return grp;
    };
    S.door = (g, cx, y, w, h, z0 = 0, opts = {}) => P.door(g, cx, y, w, h, null, z0, Object.assign({ arch: f !== 'EGYPT' && f !== 'GAUL' && f !== 'HUN', frame: f === 'EGYPT' ? S.gold : f === 'GREEK' ? S.column : S.trim, leaf: solid(f === 'GAUL' || f === 'HUN' ? '#3a2a1a' : '#2a1a0c') }, opts));
    S.win = (g, cx, y, w, h, z0, opts = {}) => P.windowBox(g, cx, y, f === 'EGYPT' ? w * 0.5 : w, h, z0, Object.assign({ arch: f === 'SULTAN' || f === 'ROME', frame: f === 'GREEK' ? S.column : S.trim }, opts));
    S.columns = (g, ix0, iy0, w, h, n, z0 = 0, opts = {}) => { const grp = new T.Group(); for (let i = 0; i < n; i++) { const x = n > 1 ? ix0 + w * i / (n - 1) : ix0; P.column(grp, x, iy0, h, S.column, z0, { r: opts.r ?? (f === 'GAUL' || f === 'HUN' ? 0.07 : 0.1), fluted: f === 'GREEK', capMat: f === 'EGYPT' ? S.gold : S.column, lotus: f === 'EGYPT', lotusMat: material('flat', '#2f9e98') }); } if (f === 'SULTAN') { for (let i = 0; i + 1 < n; i++) { const x0 = ix0 + w * i / (n - 1), x1 = ix0 + w * (i + 1) / (n - 1); const a = new T.Mesh(new T.TorusGeometry((x1 - x0) / 2, 0.05, 8, 16, Math.PI), S.wall); a.position.set((x0 + x1) / 2, z0 + h - 0.05, iy0); grp.add(P.setShadow(a)); } } g.add(grp); return grp; };
    S.flag = (g, cx, cy, z0, h = 0.9, extra = {}) => P.flag(g, cx, cy, z0, h, S.cloth, Object.assign({ vexillum: f === 'ROME', horsetail: f === 'HUN', w: f === 'EGYPT' ? 0.26 : 0.5, h: f === 'EGYPT' ? 0.6 : 0.3 }, extra));
    S.tree = (g, cx, cy, s = 1, i = 0, biome = 'forest') => { if (biome === 'desert') return i % 3 === 2 ? P.cactus(g, cx, cy, s * 0.8) : P.palm(g, cx, cy, s * 0.9); if (biome === 'snow') return P.pine(g, cx, cy, s, '#2f6a3a', true); if (f === 'EGYPT' || f === 'SULTAN') return P.palm(g, cx, cy, s * 0.9); if (f === 'GREEK') return i % 2 ? cypress(g, cx, cy, s) : P.oak(g, cx, cy, s * 0.9, '#7f9c62'); if (f === 'ROME') return i % 3 === 2 ? cypress(g, cx, cy, s) : P.oak(g, cx, cy, s * 0.9); if (f === 'HUN') return i % 2 ? P.pine(g, cx, cy, s * 0.9, '#5a8a34') : P.oak(g, cx, cy, s * 0.8, '#6a9a3c'); return P.pine(g, cx, cy, s); };
    // Ornements de parcelle (coins avant)
    S.flourish = (g, key) => {
      const NO = new Set(['WALL', 'EGYPTIAN_IRRIGATION', 'RALLY_POINT', 'HIDEOUT', 'MARKET', 'GREEK_TEMPLE']);
      if (NO.has(key)) return;
      const L = [-0.82, 0.55], B = [0.5, 0.82];
      if (f === 'ROME') { P.amphora(g, L[0], L[1], 0, 0.22); P.bush(g, B[0], B[1], 0.8); }
      else if (f === 'GAUL') { P.stakes(g, L[0] - 0.1, L[1], 3, 0.8); P.barrel(g, B[0], B[1], 0.26); }
      else if (f === 'GREEK') { P.amphora(g, L[0], L[1], 0, 0.22); P.amphora(g, L[0] + 0.2, L[1] + 0.12, 0, 0.17); P.bush(g, B[0], B[1], 0.7, '#7f9c62'); }
      else if (f === 'EGYPT') { P.obelisk(g, B[0] + 0.15, B[1], 0, 0.9); P.amphora(g, L[0], L[1], 0, 0.2); }
      else if (f === 'HUN') { P.spear(g, L[0], L[1], 0, 0.9, 0.2); P.spear(g, L[0] + 0.12, L[1] + 0.05, 0, 0.85, -0.15); P.campfire(g, B[0], B[1]); }
      else if (f === 'SULTAN') { P.lantern(g, B[0] + 0.15, B[1], 0, 0.6); P.amphora(g, L[0], L[1], 0, 0.2); }
    };
    return S;
  }

  // ---- détails ----
  function frieze(g, ix0, iy0, w, d, z, mat) { const t = 0.06; P.box(g, ix0 - 0.09, iy0 + d + 0.03, w + 0.18, t, 0.1, mat, z - 0.3); P.box(g, ix0 + w + 0.03, iy0 - 0.09, t, d + 0.18, 0.1, mat, z - 0.3); }
  function pedimentDeco(g, ix0, iy0, w, d, z, S) { const bar = new T.Mesh(new T.BoxGeometry(w + 0.46, 0.08, 0.05), S.wallLight); bar.position.set(ix0 + w / 2, z - 0.04, iy0 + d + 0.22); g.add(P.setShadow(bar)); for (let i = 0; i < 5; i++) { const dent = new T.Mesh(new T.BoxGeometry(0.06, 0.06, 0.04), S.wallLight); dent.position.set(ix0 + w * (i + 0.5) / 5, z - 0.11, iy0 + d + 0.22); g.add(dent); } }
  function crossBeams(g, ix0, iy0, w, d, h, z, S) { for (const x of [ix0 - 0.3, ix0 + w + 0.3]) { for (const s of [-1, 1]) { const b = new T.Mesh(new T.BoxGeometry(0.04, 0.5, 0.04), S.trim); b.position.set(x, z + h + 0.08, iy0 + d / 2 + s * 0.08); b.rotation.x = s * 0.5; g.add(P.setShadow(b)); } } }
  function snowCap(g, ix0, iy0, w, d, h, z, f) {
    const sn = material('snow', '#f4f8fc');
    if (f === 'HUN') { const c = new T.Mesh(new T.ConeGeometry(Math.max(w, d) * 0.74 * 0.96, h * 0.45, 20), sn); c.position.set(ix0 + w / 2, z + h - h * 0.22 + 0.02, iy0 + d / 2); g.add(P.setShadow(c)); return; }
    const o = f === 'GAUL' ? 0.3 : 0.2;
    const hh = h * (f === 'GREEK' ? 0.7 : f === 'GAUL' ? 1.35 : 1);
    const geo = new T.BufferGeometry();
    const x0 = ix0 - o, x1 = ix0 + w + o, y0 = iy0 - o, y1 = iy0 + d + o, cy = iy0 + d / 2, lift = 0.05;
    const v = [x0, lift * 2, y1 * 0.5 + cy * 0.5, x1, lift * 2, y1 * 0.5 + cy * 0.5, x1, hh + lift, cy, x0, hh + lift, cy, x1, lift * 2, y0 * 0.5 + cy * 0.5, x0, lift * 2, y0 * 0.5 + cy * 0.5];
    const idx = [0, 1, 2, 0, 2, 3, 3, 2, 4, 3, 4, 5];
    geo.setAttribute('position', new T.Float32BufferAttribute(v, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new T.Mesh(geo, sn); m.position.y = z; g.add(P.setShadow(m));
  }
  function finial(g, cx, cy, z, kind, S) {
    if (kind === 'crescent') { const t = new T.Mesh(new T.TorusGeometry(0.12, 0.03, 8, 20, Math.PI * 1.5), S.gold); t.position.set(cx, z + 0.2, cy); t.rotation.z = Math.PI * 0.75; g.add(t); const p = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.2, 6), S.gold); p.position.set(cx, z + 0.1, cy); g.add(p); }
    else if (kind === 'tail') { const p = new T.Mesh(new T.CylinderGeometry(0.015, 0.02, 0.35, 6), solid('#6a4a2a')); p.position.set(cx, z + 0.17, cy); g.add(p); const t = new T.Mesh(new T.ConeGeometry(0.06, 0.3, 8), solid('#2a1a0a')); t.position.set(cx + 0.05, z + 0.2, cy); t.rotation.z = -0.5; g.add(t); }
    else { const b = new T.Mesh(new T.SphereGeometry(0.06, 10, 8), S.gold); b.position.set(cx, z + 0.05, cy); g.add(b); }
  }
  function cypress(g, cx, cy, s = 1) { const m = new T.Mesh(new T.ConeGeometry(0.16 * s, 1.3 * s, 10), material('leaves', '#2f6a2a')); m.position.set(cx, 0.65 * s, cy); return P.add(g, P.setShadow(m)); }

  window.FAC = { PALETTES, style, cypress, finial };
})();
