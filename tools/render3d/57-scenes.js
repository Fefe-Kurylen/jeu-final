// ============================================================================
// 57-scenes.js — scènes rendues : fond de l'écran de connexion (portrait / paysage), scène du héros,
// en-têtes d'écrans (marché, alliance, classement, inventaire, rapports), fond du champ de bataille
// ============================================================================
(function () {
  const T = window.THREE;
  const P = window.P3;
  const { material, solid } = window.TEX;
  const { style, PALETTES } = window.FAC;
  const SC = {};

  function terrain(g, size, kind = 'grass') {
    const m = new T.Mesh(new T.PlaneGeometry(size, size, 1, 1), material(kind, kind === 'grass' ? '#6aa63c' : kind === 'sand' ? '#dcc38a' : '#eef3f8'));
    const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size * 0.5, uv.getY(i) * size * 0.5); uv.needsUpdate = true;
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; g.add(m); return m;
  }
  function road(g, pts, w = 0.6) { for (let i = 0; i + 1 < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const len = Math.hypot(x1 - x0, y1 - y0); const m = new T.Mesh(new T.PlaneGeometry(len + w * 0.6, w), material('dirt', '#b08a5c')); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(y1 - y0, x1 - x0); m.position.set((x0 + x1) / 2, 0.015, (y0 + y1) / 2); m.receiveShadow = true; g.add(m); } }
  function placeBuilding(g, key, faction, x, y, opts = {}) { const grp = new T.Group(); window.MODELS['building:' + key](grp, faction, opts); grp.position.set(x, 0, y); if (opts.rot) grp.rotation.y = opts.rot; g.add(grp); return grp; }

  // Panorama de connexion : île-diorama, quartiers de toutes les civilisations sur une grille iso, routes, arbres
  const SPOTS = [['ROME', 'MAIN_HALL'], ['GREEK', 'GREEK_TEMPLE'], ['EGYPT', 'TREASURE_CHAMBER'], ['GAUL', 'GALLIC_BREWERY'], ['SULTAN', 'SULTAN_DESERT_OUTPOST'], ['HUN', 'HUN_WAR_TENT'], ['ROME', 'ROMAN_THERMAE'], ['GREEK', 'ACADEMY'], ['EGYPT', 'EGYPTIAN_IRRIGATION'], ['GAUL', 'BARRACKS'], ['SULTAN', 'MARKET'], ['HUN', 'STABLE'], ['ROME', 'WATCHTOWER'], ['GREEK', 'EMBASSY'], ['EGYPT', 'MAIN_HALL']];
  function island(g, half, th) {
    const dirt = P.plot(g, 'dirt', half * 0.985, { th }); dirt.position.y = -0.12;
    const grass = P.plot(g, 'grass', half, { th: 0.12 }); grass.position.y = 0;
    const uv = grass.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5); uv.needsUpdate = true;
  }
  SC.auth = (g, portrait) => {
    const cols = portrait ? [-1, 0, 1] : [-2, -1, 0, 1, 2], rows = portrait ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
    const sp = 2.2;
    island(g, portrait ? 8.5 : 9.5, 0.7);
    // routes le long des deux diagonales de la grille
    for (const c of cols) { const x0 = (c + rows[0] - 0.5) * sp, y0 = (rows[0] - 0.5 - c) * sp, x1 = (c + rows[rows.length - 1] + 0.5) * sp, y1 = (rows[rows.length - 1] + 0.5 - c) * sp; road(g, [[x0 + sp / 2, y0 + sp / 2], [x1 + sp / 2, y1 + sp / 2]], 0.5); }
    for (const r of rows) { const x0 = (cols[0] - 0.5 + r) * sp, y0 = (r - cols[0] + 0.5) * sp, x1 = (cols[cols.length - 1] + 0.5 + r) * sp, y1 = (r - cols[cols.length - 1] - 0.5) * sp; road(g, [[x0 + sp / 2, y0 - sp / 2], [x1 + sp / 2, y1 - sp / 2]], 0.5); }
    let i = 0;
    for (const r of rows) for (const c of cols) {
      const ix = (c + r) * sp, iy = (r - c) * sp;
      const [f, key] = SPOTS[i % SPOTS.length]; i++;
      if (c === 0 && r === 0 && !portrait) { const dirt = new T.Mesh(new T.CircleGeometry(1.1, 32), material('stone', '#b8b0a0')); dirt.rotation.x = -Math.PI / 2; dirt.position.set(ix, 0.012, iy); dirt.receiveShadow = true; g.add(dirt); P.flag(g, ix, iy, 0, 1.6, material('cloth', '#b22a22'), { vexillum: true }); P.torch(g, ix - 0.6, iy + 0.4, 0, 0.6); P.torch(g, ix + 0.6, iy - 0.4, 0, 0.6); continue; }
      const S = style(f); const grp = new T.Group(); P.plot(grp, S.p.ground, 1.0, { th: 0.08 }); grp.position.set(ix, 0, iy); g.add(grp);
      placeBuilding(g, key, f, ix, iy, {});
    }
    // arbres et rochers en bordure d'île
    const half = portrait ? 8.5 : 9.5;
    for (let k = 0; k < (portrait ? 26 : 30); k++) { const a = k / (portrait ? 26 : 30) * Math.PI * 2; const rr = half * 0.86 + (k % 3) * 0.3; const x = Math.cos(a) * rr * (portrait ? 0.78 : 1), y = Math.sin(a) * rr * (portrait ? 1 : 0.8); if (k % 5 === 4) P.rock(g, x, y, 1.0 + (k % 2) * 0.3); else if (k % 2) P.oak(g, x, y, 1.0 + (k % 3) * 0.12); else P.pine(g, x, y, 1.1 + (k % 3) * 0.1); }
    return { extent: 14, outline: false, shadowCatcher: false };
  };
  // Scène du héros : estrade sur dalle, torches, bannières de la faction
  SC.heroStage = (g, f) => { const S = style(f); const slab = new T.Mesh(new T.CylinderGeometry(1.0, 1.1, 0.2, 32), material('stone', '#9a948a')); slab.position.y = -0.1; slab.receiveShadow = true; g.add(slab); P.torch(g, -0.85, 0.3, 0.1, 0.9); P.torch(g, 0.85, 0.3, 0.1, 0.9); S.flag(g, -0.9, -0.6, 0.1, 1.9); S.flag(g, 0.9, -0.6, 0.1, 1.9); const grp = new T.Group(); window.FIG.soldier(grp, f, 'INFANTRY', { s: 1, hero: true }); grp.rotation.y = -0.15; g.add(grp); return { extent: 4, outlinePx: 1.6 }; };
  // En-têtes
  SC.market = (g) => { P.box(g, -1.4, -0.6, 2.0, 0.5, 0.5, material('planks', '#9a7340')); const aw = new T.Mesh(new T.BoxGeometry(2.3, 0.04, 1.2), material('cloth', '#b22a22')); aw.position.set(-0.4, 1.25, -0.3); aw.rotation.x = 0.3; g.add(P.setShadow(aw)); for (const [x, y] of [[-1.5, 0.0], [0.6, 0.0], [-1.5, -0.9], [0.6, -0.9]]) P.cylinder(g, x, y, 0.04, 1.25, material('planks', '#8a6230'), 0, 8); P.crate(g, 1.2, 0.3, 0.4); P.crate(g, 1.5, 0.75, 0.34); P.barrel(g, 0.7, 0.8, 0.42); P.amphora(g, -0.3, 0.55, 0, 0.28); P.amphora(g, -0.6, 0.65, 0, 0.22); P.box(g, -1.3, 0.2, 0.6, 0.35, 0.14, material('wheat', '#d8b840')); for (let i = 0; i < 4; i++) { const c = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.02, 12), material('gold', '#e8c547')); c.position.set(-0.9 + i * 0.12, 0.52 + (i % 2) * 0.02, -0.3); g.add(c); } return { extent: 4 }; };
  SC.alliance = (g) => { P.box(g, -1.6, -0.8, 3.2, 0.5, 1.0, material('stone', '#c9b896')); for (const [x, c] of [[-1.1, '#2d5c9c'], [0, '#b22a22'], [1.1, '#2f7a3a']]) { P.flag(g, x, -0.5, 1.0, 0.7, material('cloth', c)); P.shieldProp(g, x, 0.2, 0, c, 0.4); } P.torch(g, -1.7, 0.4, 0, 0.6); P.torch(g, 1.7, 0.4, 0, 0.6); return { extent: 4, cam: { ty: 0.3 } }; };
  SC.ranking = (g) => { const st = material('stone', '#b8b0a0'); for (const [x, h] of [[-0.9, 0.5], [0, 0.9], [0.9, 0.35]]) P.box(g, x - 0.4, -0.4, 0.8, 0.8, h, st); const cup = new T.Group(); window.MODELS['icon:ranking'](cup); cup.scale.set(0.45, 0.45, 0.45); cup.position.set(0, 0.9, 0); g.add(cup); P.flag(g, -1.5, -0.4, 0, 1.3, material('cloth', '#b22a22')); P.flag(g, 1.5, -0.4, 0, 1.3, material('cloth', '#2d5c9c')); return { extent: 4, cam: { ty: 0.1 } }; };
  SC.inventory = (g) => { P.box(g, -0.7, -0.45, 1.4, 0.9, 0.7, material('planks', '#8a5a30')); const lid = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 1.4, 16, 1, false, 0, Math.PI), material('planks', '#9a6a3a')); lid.rotation.z = Math.PI / 2; lid.rotation.x = -0.9; lid.position.set(0, 0.85, -0.3); g.add(P.setShadow(lid)); P.box(g, -0.72, -0.47, 1.44, 0.94, 0.08, material('gold', '#e8c547'), 0.45); for (let i = 0; i < 6; i++) { const c = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.03, 12), material('gold', '#e8c547')); c.position.set(-0.4 + i * 0.16, 0.72 + (i % 2) * 0.03, 0.05 + (i % 3) * 0.08); g.add(c); } P.amphora(g, 1.1, 0.4, 0, 0.3); P.spear(g, -1.2, 0.3, 0, 1.1, 0.2); P.shieldProp(g, -1.0, 0.6, 0, '#b22a22', 0.5); return { extent: 4 }; };
  SC.reports = (g) => { const parch = material('plaster', '#f0dfb6'); const sc = new T.Mesh(new T.BoxGeometry(1.8, 0.03, 1.2), parch); sc.position.set(0, 0.3, 0); sc.rotation.x = -0.2; g.add(P.setShadow(sc)); for (const z of [-0.65, 0.65]) { const r = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 1.9, 12), material('planks', '#9a6a3a')); r.rotation.z = Math.PI / 2; r.position.set(0, 0.36, z); g.add(P.setShadow(r)); } const quill = new T.Mesh(new T.ConeGeometry(0.05, 0.9, 6), material('flat', '#f6f0e2')); quill.position.set(0.9, 0.65, 0.3); quill.rotation.z = 0.8; g.add(P.setShadow(quill)); const ink = new T.Mesh(new T.CylinderGeometry(0.12, 0.15, 0.2, 12), material('flat', '#2a2a40')); ink.position.set(1.2, 0.1, 0.5); g.add(P.setShadow(ink)); P.torch(g, -1.3, 0.3, 0, 0.6); return { extent: 4, cam: { ty: -0.1 } }; };
  SC.battlefield = (g) => { terrain(g, 30, 'grass'); road(g, [[-9, -1.5], [9, 1.5]], 1.1); for (const [x, y, s, i] of [[-5, 4, 1.2, 0], [-7, -3.5, 1.1, 1], [6, 4.2, 1.0, 1], [8, -3, 1.2, 0], [-2.5, 5.5, 0.9, 0], [3, -5.5, 1.0, 1]]) { if (i) P.oak(g, x, y, s); else P.pine(g, x, y, s); } P.rock(g, 4, 5, 1.0); P.rock(g, -4.5, -5, 0.9); return { extent: 12, outline: false, shadowCatcher: false, cam: { ty: 0 } }; };

  window.MODELS = window.MODELS || {};
  window.MODELS['scene:authP'] = (g) => SC.auth(g, true);
  window.MODELS['scene:authL'] = (g) => SC.auth(g, false);
  for (const f of Object.keys(PALETTES)) window.MODELS['scene:hero:' + f] = (g) => SC.heroStage(g, f);
  for (const k of ['market', 'alliance', 'ranking', 'inventory', 'reports']) window.MODELS['scene:header:' + k] = SC[k];
  window.MODELS['scene:battlefield'] = SC.battlefield;
  window.SCENE_JOBS = () => {
    const jobs = [
      { id: 'scene/auth-portrait', category: 'scenes', out: 'scenes/auth-portrait.webp', frame: 'sceneP', model: 'scene:authP', args: [], quality: 0.86 },
      { id: 'scene/auth-landscape', category: 'scenes', out: 'scenes/auth-landscape.webp', frame: 'sceneL', model: 'scene:authL', args: [], quality: 0.86 },
      { id: 'scene/battlefield', category: 'scenes', out: 'scenes/battlefield.webp', frame: 'battlefield', model: 'scene:battlefield', args: [], quality: 0.86 }
    ];
    for (const f of Object.keys(PALETTES)) jobs.push({ id: `scene/hero-${f}`, category: 'scenes', out: `scenes/hero-${f}.webp`, frame: 'stage', model: 'scene:hero:' + f, args: [] });
    for (const k of ['market', 'alliance', 'ranking', 'inventory', 'reports']) jobs.push({ id: `scene/header-${k}`, category: 'scenes', out: `scenes/header-${k}.webp`, frame: 'header', model: 'scene:header:' + k, args: [] });
    return jobs;
  };
})();
