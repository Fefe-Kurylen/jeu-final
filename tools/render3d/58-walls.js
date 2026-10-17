// ============================================================================
// 58-walls.js — enceinte de la ville : tronçons de courtine d'une cellule (2 unités) dans les deux
// orientations (le long de x et le long de z), hauts (arrière) ou bas (avant, pour ne pas masquer la ville),
// tours d'angle ; grammaire par faction (pierre, marbre, grès, enduit, palissades gauloise et hunnique)
// et trois paliers selon le niveau du Mur (1-6, 7-13, 14-20), variante enneigée.
// ============================================================================
(function () {
  const T = window.THREE;
  const P = window.P3;
  const { material, solid } = window.TEX;
  const { style, PALETTES } = window.FAC;
  const TIER = { 1: 0.75, 2: 1.05, 3: 1.35 };   // hauteur de la courtine haute
  const TH = 0.36;                               // épaisseur de la courtine

  // Courtine le long de x (de −1 à 1), centrée en z = 0 ; les ornements (torches, drapeau) sont côté +z (intérieur)
  function curtain(g, f, tier, low, snow) {
    const S = style(f);
    const h = TIER[tier] * (low ? 0.45 : 1);
    if (f === 'GAUL' || f === 'HUN') {
      const log = material('bark', f === 'HUN' ? '#7a5a36' : '#8a6a40');
      const n = 12, r = 0.075;
      for (let i = 0; i < n; i++) {
        const x = -1 + (i + 0.5) * 2 / n;
        P.cylinder(g, x, 0, r, h, log, 0, 8);
        const tip = new T.Mesh(new T.ConeGeometry(r, 0.12, 8), log); tip.position.set(x, h + 0.06, 0); g.add(P.setShadow(tip));
        if (snow) { const cap = new T.Mesh(new T.SphereGeometry(r * 0.9, 8, 6), S.snow); cap.position.set(x, h + 0.1, 0); g.add(cap); }
      }
      for (const z of [-0.09, 0.09]) P.box(g, -1, z - 0.02, 2, 0.04, 0.06, material('planks', '#6a4a2a'), h * 0.55);
      if (tier >= 2 && !low) {   // hourd : plancher et parapet de planches au sommet
        P.box(g, -1, -0.25, 2, 0.5, 0.08, material('planks', '#8a6a3a'), h + 0.06);
        P.box(g, -1, -0.25, 2, 0.08, 0.3, material('planks', '#7a5a30'), h + 0.14);
        P.box(g, -1, 0.17, 2, 0.08, 0.3, material('planks', '#7a5a30'), h + 0.14);
        if (snow) P.box(g, -1, -0.25, 2, 0.5, 0.05, S.snow, h + 0.44);
      }
      if (tier >= 3 && !low) { P.torch(g, -0.55, 0.3, h + 0.1, 0.25); P.torch(g, 0.55, 0.3, h + 0.1, 0.25); if (f === 'HUN') P.shieldProp(g, 0, 0.3, h + 0.14, PALETTES.HUN.cloth, 0.1); }
      return;
    }
    const wm = S.wallDark;
    P.box(g, -1, -TH / 2, 2, TH, h, wm);
    if (f === 'GREEK') P.box(g, -1, -TH / 2 - 0.03, 2, TH + 0.06, 0.08, S.wallLight, h);   // corniche de marbre
    else if (tier >= 2 || !low) {   // merlons des deux côtés
      const m = 0.18, gap = 0.14, mh = tier >= 2 ? 0.2 : 0.14;
      for (let x = -1; x < 1 - 0.02; x += m + gap) for (const z of [-TH / 2, TH / 2 - 0.1]) P.box(g, x, z, Math.min(m, 1 - x), 0.1, mh, wm, h);
    }
    if (f === 'EGYPT' && tier >= 2) P.box(g, -1, -TH / 2 - 0.02, 2, TH + 0.04, 0.06, S.gold, h - 0.2);   // frise dorée
    if (f === 'SULTAN' && tier >= 2) for (let i = 0; i < 4; i++) { const a = new T.Mesh(new T.TorusGeometry(0.11, 0.03, 8, 16, Math.PI), S.wall); a.position.set(-0.75 + i * 0.5, h * 0.5, TH / 2 + 0.01); g.add(a); }
    if (tier >= 3 && !low) { P.torch(g, -0.6, TH / 2 + 0.05, h * 0.6, 0.22); P.torch(g, 0.6, TH / 2 + 0.05, h * 0.6, 0.22); }   // le drapeau est animé côté client
    if (snow) P.box(g, -1, -TH / 2 - 0.01, 2, TH + 0.02, 0.05, S.snow, h);
  }

  // Tour d'angle
  function tower(g, f, tier, snow) {
    const S = style(f);
    const h = TIER[tier] * 1.45 + 0.35, r = 0.42;
    if (f === 'GAUL' || f === 'HUN') {   // tour de guet en rondins : fût, plateforme à balustrade, toit
      const log = material('bark', f === 'HUN' ? '#7a5a36' : '#8a6a40');
      P.cylinder(g, 0, 0, r, h, log, 0, 10);
      P.cylinder(g, 0, 0, r + 0.14, 0.08, material('planks', '#8a6a3a'), h, 10);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; P.cylinder(g, Math.cos(a) * (r + 0.1), Math.sin(a) * (r + 0.1), 0.03, 0.3, log, h + 0.08, 6); }
      S.cone(g, 0, 0, r + 0.16, 0.6, h + 0.38, { snow });
      return;
    }
    if (f === 'EGYPT') {   // pylône à quatre pans légèrement rentrants, merlons, frise
      const py = new T.Mesh(P.cylUV(new T.CylinderGeometry(r * 1.15, r * 1.35, h, 4), r * 1.3, h), S.wallDark); py.rotation.y = Math.PI / 4; py.position.y = h / 2; g.add(P.setShadow(py));
      const top = r * 1.15 / Math.SQRT2;
      P.box(g, -top - 0.02, -top - 0.02, (top + 0.02) * 2, (top + 0.02) * 2, 0.08, S.gold, h - 0.25);
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; P.box(g, Math.cos(a) * top * 0.9 - 0.08, Math.sin(a) * top * 0.9 - 0.08, 0.16, 0.16, 0.2, S.wallDark, h); }
      if (snow) P.box(g, -top, -top, top * 2, top * 2, 0.05, S.snow, h);
      return;
    }
    if (f === 'GREEK') {   // tour carrée de marbre à corniche, toit d'ardoise en pavillon
      P.box(g, -r, -r, r * 2, r * 2, h, S.wallDark);
      P.box(g, -r - 0.04, -r - 0.04, r * 2 + 0.08, r * 2 + 0.08, 0.08, S.wallLight, h - 0.08);
      S.hip(g, -r, -r, r * 2, r * 2, 0.5, h, { snow });
      return;
    }
    // ROME, SULTAN : tour ronde, anneau de merlons, toit de la faction
    P.cylinder(g, 0, 0, r, h, S.wallDark, 0, 24);
    P.cylinder(g, 0, 0, r + 0.06, 0.08, S.wall, h - 0.08, 24);
    if (f === 'ROME') for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P.box(g, Math.cos(a) * r - 0.07, Math.sin(a) * r - 0.07, 0.14, 0.14, 0.16, S.wallDark, h); }
    S.cone(g, 0, 0, r * (f === 'SULTAN' ? 0.95 : 1.05), 0.7, h + (f === 'ROME' ? 0.14 : 0), { snow });
  }

  window.MODELS = window.MODELS || {};
  window.MODELS['wall:seg'] = (g, f, tier, along, low, snow) => { const grp = new T.Group(); curtain(grp, f, tier, low, snow); if (along === 'z') grp.rotation.y = Math.PI / 2; g.add(grp); return { extent: 3 }; };
  window.MODELS['wall:tower'] = (g, f, tier, snow) => { tower(g, f, tier, snow); return { extent: 3 }; };
  window.WALL_JOBS = () => {
    const jobs = [];
    for (const f of Object.keys(PALETTES)) for (const tier of [1, 2, 3]) for (const snow of [false, true]) {
      const sfx = snow ? '_snow' : '';
      for (const along of ['x', 'z']) for (const low of [false, true]) jobs.push({ id: `wall/${f}/${tier}/seg_${along}${low ? '_low' : ''}${sfx}`, category: 'walls', out: `walls/${f}/${tier}_seg_${along}${low ? '_low' : ''}${sfx}.webp`, frame: 'building', model: 'wall:seg', args: [f, tier, along, low, snow] });
      jobs.push({ id: `wall/${f}/${tier}/tower${sfx}`, category: 'walls', out: `walls/${f}/${tier}_tower${sfx}.webp`, frame: 'building', model: 'wall:tower', args: [f, tier, snow] });
    }
    return jobs;
  };
})();
