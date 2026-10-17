// ============================================================================
// 54-figures.js — figurines : soldats (infanterie, archers, cavalerie, siège) aux couleurs et coiffes
// de chaque faction, héros. Utilisées en vue iso (carte, combat), en vue 3/4 (cartes d'unité), en
// buste (jetons) et sur scène (écran du héros).
// ============================================================================
(function () {
  const T = window.THREE;
  const P = window.P3;
  const { material, solid, shade } = window.TEX;
  const { PALETTES } = window.FAC;
  const SKIN = material('flat', '#e8c49c', { rough: 0.7 });
  const METAL = material('metal', '#c8d0dc', { rough: 0.45, metal: 0.5 });
  const GOLD = material('gold', '#e8c547', { rough: 0.35, metal: 0.45 });
  const DARK = solid('#2a1a0a');
  const WOOD = material('bark', '#8a6230');

  // Casque / coiffe par faction, posé sur une tête de rayon r au point (0, hy, 0) du groupe
  function headgear(g, f, r, hy, hero = false) {
    const pal = PALETTES[f] || PALETTES.ROME;
    const crestMat = material('cloth', hero ? '#e8c547' : pal.accent);
    if (f === 'ROME') { const h = new T.Mesh(new T.SphereGeometry(r * 1.08, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hero ? GOLD : METAL); h.position.y = hy; g.add(P.setShadow(h)); const guard = new T.Mesh(new T.BoxGeometry(r * 2.3, r * 0.5, r * 1.6), hero ? GOLD : METAL); guard.position.set(0, hy - r * 0.1, -r * 0.5); g.add(guard); const crest = new T.Mesh(new T.BoxGeometry(r * 0.3, r * 0.9, r * 2.2), crestMat); crest.position.set(0, hy + r * 0.9, -r * 0.2); g.add(P.setShadow(crest)); }
    else if (f === 'GAUL') { const h = new T.Mesh(new T.SphereGeometry(r * 1.06, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), METAL); h.position.y = hy; g.add(P.setShadow(h)); for (const s of [-1, 1]) { const horn = new T.Mesh(new T.ConeGeometry(r * 0.25, r * 1.2, 8), material('flat', '#f0e8d8')); horn.position.set(s * r * 1.1, hy + r * 0.5, 0); horn.rotation.z = -s * 0.9; g.add(P.setShadow(horn)); } const hair = new T.Mesh(new T.CylinderGeometry(r * 1.0, r * 0.8, r * 1.2, 10, 1, true), material('flat', '#c8862e')); hair.position.set(0, hy - r * 0.5, -r * 0.2); g.add(hair); }
    else if (f === 'GREEK') { const h = new T.Mesh(new T.SphereGeometry(r * 1.08, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hero ? GOLD : GOLD); h.position.y = hy; g.add(P.setShadow(h)); const face = new T.Mesh(new T.BoxGeometry(r * 2.0, r * 1.3, r * 0.5), GOLD); face.position.set(0, hy - r * 0.55, r * 0.8); g.add(face); const slit = new T.Mesh(new T.BoxGeometry(r * 0.8, r * 0.18, r * 0.1), DARK); slit.position.set(0, hy - r * 0.3, r * 1.08); g.add(slit); const crest = new T.Mesh(new T.BoxGeometry(r * 0.3, r * 1.1, r * 2.4), crestMat); crest.position.set(0, hy + r * 0.95, -r * 0.3); g.add(P.setShadow(crest)); }
    else if (f === 'EGYPT') { const n = new T.Mesh(new T.BoxGeometry(r * 2.6, r * 1.8, r * 2.2), material('cloth', '#2f9e98')); n.position.set(0, hy - r * 0.3, -r * 0.2); g.add(P.setShadow(n)); const band = new T.Mesh(new T.BoxGeometry(r * 2.7, r * 0.25, r * 2.3), GOLD); band.position.set(0, hy + r * 0.45, -r * 0.2); g.add(band); const face = new T.Mesh(new T.SphereGeometry(r, 12, 10), SKIN); face.position.set(0, hy - r * 0.1, r * 0.25); g.add(face); }
    else if (f === 'HUN') { const cap = new T.Mesh(new T.ConeGeometry(r * 1.15, r * 1.6, 12), material('hide', '#b8341c')); cap.position.y = hy + r * 0.5; g.add(P.setShadow(cap)); const fur = new T.Mesh(new T.TorusGeometry(r * 1.05, r * 0.3, 8, 14), material('hide', '#c4b092')); fur.rotation.x = Math.PI / 2; fur.position.y = hy - r * 0.15; g.add(P.setShadow(fur)); }
    else if (f === 'SULTAN') { const t = new T.Mesh(new T.SphereGeometry(r * 1.25, 14, 10), material('cloth', hero ? '#f6f0e2' : '#f0e6d2')); t.scale.y = 0.75; t.position.y = hy + r * 0.25; g.add(P.setShadow(t)); const band = new T.Mesh(new T.TorusGeometry(r * 1.2, r * 0.14, 8, 16), material('cloth', '#259a86')); band.rotation.x = Math.PI / 2; band.position.y = hy + r * 0.05; g.add(band); const gem = new T.Mesh(new T.OctahedronGeometry(r * 0.22), material('flat', '#e8c547', { emissive: '#e8c547', emissiveIntensity: 0.3 })); gem.position.set(0, hy + r * 0.5, r * 1.1); g.add(gem); }
    else { const h = new T.Mesh(new T.SphereGeometry(r * 1.06, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), METAL); h.position.y = hy; g.add(P.setShadow(h)); }
  }

  // Soldat debout, face +z, pieds à y = 0, taille ~1.7 × s
  function soldier(g, f, cls, opts = {}) {
    const s = opts.s || 1, hero = !!opts.hero;
    const pal = PALETTES[f] || PALETTES.ROME;
    const tunic = material('cloth', cls === 'ARCHER' ? shade(pal.accent, -16) : pal.accent);
    const grp = new T.Group();
    const mk = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); grp.add(P.setShadow(m)); return m; };
    // jambes
    for (const sx of [-1, 1]) { const leg = mk(new T.CylinderGeometry(0.09 * s, 0.08 * s, 0.6 * s, 10), material('cloth', '#5a4a3a'), sx * 0.12 * s, 0.3 * s, 0); const foot = mk(new T.BoxGeometry(0.18 * s, 0.08 * s, 0.28 * s), DARK, sx * 0.12 * s, 0.04 * s, 0.04 * s); if (opts.mounted) { leg.rotation.z = sx * 0.55; leg.position.set(sx * 0.26 * s, 0.34 * s, 0); foot.position.set(sx * 0.42 * s, 0.1 * s, 0.04 * s); } }
    // torse
    const torso = mk(new T.CapsuleGeometry(0.22 * s, 0.4 * s, 4, 12), tunic, 0, 0.9 * s, 0);
    if (cls === 'INFANTRY' || cls === 'CAVALRY' || hero) { mk(new T.BoxGeometry(0.46 * s, 0.42 * s, 0.26 * s), hero ? GOLD : METAL, 0, 0.95 * s, 0.06 * s); }
    // ceinture
    mk(new T.TorusGeometry(0.24 * s, 0.03 * s, 6, 16), material('planks', '#5a3a1a'), 0, 0.68 * s, 0).rotation.x = Math.PI / 2;
    // bras
    for (const sx of [-1, 1]) { const arm = mk(new T.CapsuleGeometry(0.07 * s, 0.4 * s, 4, 8), SKIN, sx * 0.32 * s, 0.95 * s, 0.02 * s); arm.rotation.z = sx * 0.25; }
    // tête
    const hy = 1.42 * s, r = 0.16 * s;
    mk(new T.SphereGeometry(r, 14, 12), SKIN, 0, hy, 0);
    const hg = new T.Group(); headgear(hg, f, r, hy, hero); grp.add(hg);
    // cape du héros
    if (hero) { const cape = new T.Mesh(new T.PlaneGeometry(0.6 * s, 0.95 * s, 1, 4), material('cloth', pal.cloth)); cape.material.side = T.DoubleSide; const pos = cape.geometry.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, -Math.abs(pos.getY(i) + 0.4 * s) * 0.25); cape.geometry.computeVertexNormals(); cape.position.set(0, 0.85 * s, -0.22 * s); grp.add(P.setShadow(cape)); }
    // équipement
    if (cls === 'INFANTRY' || hero) {
      const spear = mk(new T.CylinderGeometry(0.02 * s, 0.025 * s, 1.9 * s, 8), WOOD, -0.4 * s, 0.95 * s, 0.1 * s);
      const tip = mk(new T.ConeGeometry(0.05 * s, 0.22 * s, 8), METAL, -0.4 * s, 2.0 * s, 0.1 * s);
      const shield = mk(new T.CylinderGeometry(0.3 * s, 0.3 * s, 0.05 * s, 20), material('cloth', pal.cloth), 0.4 * s, 0.9 * s, 0.14 * s); shield.rotation.x = Math.PI / 2;
      mk(new T.SphereGeometry(0.07 * s, 8, 6), GOLD, 0.4 * s, 0.9 * s, 0.18 * s);
      if (hero) { const sw = mk(new T.BoxGeometry(0.05 * s, 0.7 * s, 0.03 * s), METAL, -0.45 * s, 1.25 * s, 0.1 * s); sw.rotation.z = 0.2; mk(new T.BoxGeometry(0.2 * s, 0.04 * s, 0.05 * s), GOLD, -0.45 * s, 0.9 * s, 0.1 * s); spear.visible = false; tip.visible = false; }
    } else if (cls === 'ARCHER') {
      const bow = mk(new T.TorusGeometry(0.42 * s, 0.02 * s, 6, 20, Math.PI), WOOD, -0.42 * s, 0.95 * s, 0.1 * s); bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 2;
      mk(new T.CylinderGeometry(0.006 * s, 0.006 * s, 0.84 * s, 4), solid('#e8e0d0'), -0.42 * s, 0.95 * s, 0.1 * s);
      const quiver = mk(new T.CylinderGeometry(0.06 * s, 0.05 * s, 0.5 * s, 8), material('hide', '#7a5230'), 0.2 * s, 1.05 * s, -0.22 * s); quiver.rotation.x = -0.3;
    } else if (cls === 'SIEGE') {
      // catapulte à côté du servant
      const cat = new T.Group();
      const bed = new T.Mesh(new T.BoxGeometry(1.1 * s, 0.1 * s, 0.5 * s), material('planks', '#7a5a30')); bed.position.y = 0.3 * s; cat.add(P.setShadow(bed));
      for (const [dx, dz] of [[-0.4, 0.28], [0.4, 0.28], [-0.4, -0.28], [0.4, -0.28]]) { const w = new T.Mesh(new T.TorusGeometry(0.16 * s, 0.03 * s, 6, 14), WOOD); w.position.set(dx * s, 0.18 * s, dz * s); cat.add(P.setShadow(w)); }
      const arm = new T.Mesh(new T.BoxGeometry(0.08 * s, 1.2 * s, 0.08 * s), WOOD); arm.position.set(-0.1 * s, 0.75 * s, 0); arm.rotation.z = 0.7; cat.add(P.setShadow(arm));
      const frame = new T.Mesh(new T.BoxGeometry(0.1 * s, 0.7 * s, 0.1 * s), WOOD); frame.position.set(0.1 * s, 0.6 * s, 0); cat.add(P.setShadow(frame));
      const stone = new T.Mesh(new T.SphereGeometry(0.11 * s, 8, 6), material('stone', '#666', { flat: true })); stone.position.set(-0.55 * s, 1.2 * s, 0); cat.add(P.setShadow(stone));
      cat.position.set(0.85 * s, 0, 0.1 * s); grp.add(cat);
    }
    if (opts.mounted) {
      // cavalier : le soldat est posé sur un cheval, jambes écartées
      const hs = s * 2.1;
      P.horse(g, 0, 0, 0, '#6a4a2a', hs, 0);
      const backY = 0.66 * hs;
      grp.scale.set(0.95, 0.95, 0.95); grp.position.set(-0.05 * hs, backY - 0.6 * s * 0.95 + 0.1 * s, 0); grp.rotation.y = Math.PI / 2;
      const lance = new T.Mesh(new T.CylinderGeometry(0.02 * s, 0.025 * s, 2.2 * s, 8), WOOD); lance.position.set(-0.42 * s, 1.3 * s, 0.25 * s); lance.rotation.x = -0.4; grp.add(P.setShadow(lance));
      const lt = new T.Mesh(new T.ConeGeometry(0.05 * s, 0.22 * s, 8), METAL); lt.position.set(-0.42 * s, 1.3 * s + Math.cos(0.4) * 1.1 * s, 0.25 * s + Math.sin(0.4) * 1.1 * s); lt.rotation.x = -0.4; grp.add(lt);
      const saddle = new T.Mesh(new T.BoxGeometry(0.34 * hs, 0.06 * hs, 0.4 * hs), material('cloth', pal.cloth)); saddle.position.set(0, backY, 0); g.add(P.setShadow(saddle));
    }
    g.add(grp);
    return grp;
  }

  const CLASSES = ['INFANTRY', 'ARCHER', 'CAVALRY', 'SIEGE'];
  const FACTIONS = Object.keys(PALETTES);
  window.MODELS = window.MODELS || {};
  // Iso (carte, combat) : 256-frame ; 2 figurines pour l'infanterie/archers, 1 cavalier, 1 catapulte
  window.MODELS['mapunit'] = (g, cls, f) => {
    const yaw = Math.PI / 2 - 0.35;   // regarde vers la droite-bas de l'écran, un peu vers la caméra
    const grp = new T.Group();
    if (cls === 'CAVALRY') soldier(grp, f, 'CAVALRY', { s: 0.8, mounted: true });
    else if (cls === 'SIEGE') soldier(grp, f, 'SIEGE', { s: 0.9 });
    else { soldier(grp, f, cls, { s: 0.9 }).position.set(-0.42, 0, 0.3); soldier(grp, f, cls, { s: 0.9 }).position.set(0.42, 0, -0.3); }
    grp.rotation.y = yaw; g.add(grp);
    return { extent: 3 };
  };
  window.MODELS['mapmerchant'] = (g) => { const grp = new T.Group(); P.cart(grp, 0, 0.1, 0, 1.6); P.crate(grp, -0.2, 0.1, 0.34, 0.66); P.crate(grp, 0.2, 0.1, 0.3, 0.66); P.horse(grp, 1.25, 0.05, 0, '#8a6a4a', 1.3, 0); grp.rotation.y = Math.PI / 2 - 0.35; g.add(grp); return { extent: 3 }; };
  // Carte d'unité (vue 3/4, grande)
  window.MODELS['figure'] = (g, cls, f) => { const grp = new T.Group(); if (cls === 'CAVALRY') soldier(grp, f, cls, { s: 0.75, mounted: true }); else soldier(grp, f, cls, { s: 1 }); grp.rotation.y = cls === 'CAVALRY' ? -0.9 : -0.15; g.add(grp); return { extent: 3, outlinePx: 1.6 }; };
  // Emblème de classe (jeton sombre + symbole) posé devant l'épaule droite du buste
  function classBadge(g, cls) {
    const b = new T.Group();
    const disc = new T.Mesh(new T.CylinderGeometry(0.19, 0.19, 0.03, 24), material('hide', '#3a2a1a')); disc.rotation.x = Math.PI / 2; b.add(disc);
    const rim = new T.Mesh(new T.TorusGeometry(0.185, 0.018, 8, 28), GOLD); b.add(rim);
    const mk = (geo, mat, x, y, z, rz = 0, rx = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); b.add(m); return m; };
    if (cls === 'ARCHER') { mk(new T.TorusGeometry(0.11, 0.014, 8, 20, Math.PI), WOOD, 0.02, 0, 0.03, -Math.PI / 2); mk(new T.CylinderGeometry(0.004, 0.004, 0.22, 4), solid('#f0e8d8'), 0.02, 0, 0.03); mk(new T.CylinderGeometry(0.006, 0.006, 0.24, 4), WOOD, -0.03, 0, 0.04, Math.PI / 2); mk(new T.ConeGeometry(0.02, 0.05, 6), METAL, -0.16, 0, 0.04, Math.PI / 2); }
    else if (cls === 'CAVALRY') { const shoe = mk(new T.TorusGeometry(0.1, 0.025, 8, 24, Math.PI * 1.35), GOLD, 0, -0.02, 0.03, Math.PI * 0.325); void shoe; }
    else if (cls === 'SIEGE') { mk(new T.TorusGeometry(0.1, 0.022, 8, 24), WOOD, 0, 0, 0.03); for (let i = 0; i < 3; i++) mk(new T.BoxGeometry(0.02, 0.2, 0.02), WOOD, 0, 0, 0.03, i * Math.PI / 3); mk(new T.SphereGeometry(0.045, 10, 8), material('stone', '#777', { flat: true }), 0.1, 0.09, 0.05); }
    else { for (const sx of [-1, 1]) { mk(new T.BoxGeometry(0.03, 0.26, 0.015), METAL, 0, 0.02, 0.03, sx * 0.6); mk(new T.BoxGeometry(0.1, 0.02, 0.02), GOLD, sx * 0.06, -0.09, 0.035, sx * 0.6); } }
    b.position.set(0.2, 1.22, 0.42);
    g.add(b);
  }
  // Buste (jeton) : tête et épaules, emblème de classe (pas pour le héros)
  window.MODELS['bust'] = (g, cls, f, hero) => { const grp = new T.Group(); soldier(grp, f, cls || 'INFANTRY', { s: 1, hero: !!hero }); grp.rotation.y = -0.1; g.add(grp); if (!hero) classBadge(g, cls || 'INFANTRY'); return { extent: 3, cam: { ty: 1.4, ppu: 100 }, shadowCatcher: false, outlinePx: 1.6 }; };
  // Héros : debout, cape, sur scène
  window.MODELS['hero'] = (g, f, big) => { const grp = new T.Group(); soldier(grp, f, 'INFANTRY', { s: 1, hero: true }); grp.rotation.y = -0.15; g.add(grp); if (big) { const plinth = new T.Mesh(new T.CylinderGeometry(0.75, 0.85, 0.16, 24), material('stone', '#9a948a')); plinth.position.y = -0.08; g.add(P.setShadow(plinth)); } return { extent: 3, outlinePx: 1.6 }; };
  window.FIGURE_CLASSES = CLASSES;
  window.FIGURE_JOBS = () => {
    const jobs = [];
    for (const f of FACTIONS) {
      for (const cls of CLASSES) {
        jobs.push({ id: `figure/${cls}_${f}`, category: 'figures', out: `figures/${cls}_${f}.webp`, frame: 'figure', model: 'figure', args: [cls, f] });
        jobs.push({ id: `bust/${cls}_${f}`, category: 'busts', out: `busts/${cls}_${f}.webp`, frame: 'bust', model: 'bust', args: [cls, f, false] });
      }
      jobs.push({ id: `hero/${f}`, category: 'heroes', out: `heroes/${f}.webp`, frame: 'stage', model: 'hero', args: [f, true] });
      jobs.push({ id: `herobust/${f}`, category: 'heroes', out: `heroes/${f}_bust.webp`, frame: 'bust', model: 'bust', args: ['INFANTRY', f, true] });
    }
    for (const cls of CLASSES) jobs.push({ id: `bust/${cls}`, category: 'busts', out: `busts/${cls}.webp`, frame: 'bust', model: 'bust', args: [cls, 'ROME', false] });
    return jobs;
  };
  window.FIG = { soldier, headgear };
})();
