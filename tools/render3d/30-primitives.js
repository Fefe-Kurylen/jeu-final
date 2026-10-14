// ============================================================================
// 30-primitives.js — vocabulaire de modélisation. Repère « iso » de l'ancien générateur conservé :
// ix (vers la droite-bas de l'écran), iy (vers la gauche-bas), iz (vers le haut) ; une parcelle de
// ville = 2×2 unités. En Three.js : x = ix, z = iy, y = iz.
// Toutes les fonctions ajoutent au groupe `g` et renvoient le mesh / groupe créé.
// ============================================================================
(function () {
  const T = window.THREE;
  const { material, solid, shade } = window.TEX;
  const UV_PER_UNIT = 0.9;   // répétitions de texture par unité monde

  function setShadow(m) { m.castShadow = true; m.receiveShadow = true; return m; }
  function add(g, m) { g.add(m); return m; }

  // Répétition des UV d'une BoxGeometry selon ses dimensions (groupes : +x −x +y −y +z −z)
  function boxUV(geo, w, h, d, k = UV_PER_UNIT) {
    const uv = geo.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] * k, uv.getY(i) * dims[f][1] * k); }
    uv.needsUpdate = true;
    return geo;
  }
  function cylUV(geo, r, h, k = UV_PER_UNIT) {
    const uv = geo.attributes.uv;
    const circ = 2 * Math.PI * r;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ * k, uv.getY(i) * h * k);
    uv.needsUpdate = true;
    return geo;
  }

  // Boîte : coin (ix0, iy0), largeur w (ix), profondeur d (iy), hauteur h, base à z0
  function box(g, ix0, iy0, w, d, h, mat, z0 = 0) {
    const geo = boxUV(new T.BoxGeometry(w, h, d), w, h, d);
    const m = new T.Mesh(geo, mat);
    m.position.set(ix0 + w / 2, z0 + h / 2, iy0 + d / 2);
    return add(g, setShadow(m));
  }
  // Boîte centrée
  function boxC(g, cx, cy, w, d, h, mat, z0 = 0) { return box(g, cx - w / 2, cy - d / 2, w, d, h, mat, z0); }
  function cylinder(g, cx, cy, r, h, mat, z0 = 0, segs = 28, rTop = null) {
    const geo = cylUV(new T.CylinderGeometry(rTop ?? r, r, h, segs), r, h);
    const m = new T.Mesh(geo, mat); m.position.set(cx, z0 + h / 2, cy);
    return add(g, setShadow(m));
  }
  function cone(g, cx, cy, r, h, mat, z0 = 0, segs = 28) {
    const geo = cylUV(new T.ConeGeometry(r, h, segs), r, h);
    const m = new T.Mesh(geo, mat); m.position.set(cx, z0 + h / 2, cy);
    return add(g, setShadow(m));
  }
  // Pyramide à 4 pans alignée sur les axes (toit en pavillon) : base w×d, hauteur h
  function pyramid(g, ix0, iy0, w, d, h, mat, z0 = 0) {
    const geo = new T.BufferGeometry();
    const x0 = ix0, x1 = ix0 + w, y0 = iy0, y1 = iy0 + d, cx = ix0 + w / 2, cy = iy0 + d / 2;
    const v = [
      x0, 0, y1, x1, 0, y1, cx, h, cy,   // face avant (+z)
      x1, 0, y1, x1, 0, y0, cx, h, cy,   // face droite (+x)
      x1, 0, y0, x0, 0, y0, cx, h, cy,   // arrière
      x0, 0, y0, x0, 0, y1, cx, h, cy    // gauche
    ];
    const uvs = []; for (let f = 0; f < 4; f++) { const len = f % 2 ? d : w; uvs.push(0, 0, len * UV_PER_UNIT, 0, len * UV_PER_UNIT / 2, h * UV_PER_UNIT * 1.2); }
    geo.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, mat); m.position.y = z0;
    return add(g, setShadow(m));
  }
  // Toit à deux pans, faîte parallèle à ix, débord o, épaisseur t (sous-face visible)
  function gable(g, ix0, iy0, w, d, h, mat, z0 = 0, o = 0.18, t = 0.08, trimMat = null) {
    const grp = new T.Group();
    const x0 = ix0 - o, x1 = ix0 + w + o, y0 = iy0 - o, y1 = iy0 + d + o, cy = iy0 + d / 2;
    const slope = Math.hypot(d / 2 + o, h);
    const pan = (yA, yB, flip) => {   // plan incliné de yA (bas) vers cy (haut)
      const geo = new T.PlaneGeometry(x1 - x0, slope);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) * UV_PER_UNIT, uv.getY(i) * slope * UV_PER_UNIT); uv.needsUpdate = true;
      const m = new T.Mesh(geo, mat);
      const ang = Math.atan2(h, d / 2 + o);
      m.position.set((x0 + x1) / 2, h / 2, (yA + cy) / 2);
      m.rotation.x = flip ? -(Math.PI / 2 - ang) : (Math.PI / 2 - ang);
      m.rotation.y = flip ? Math.PI : 0;
      void yB;
      return setShadow(m);
    };
    grp.add(pan(y1, cy, false));   // pan avant (+z), normale vers +z/+y
    const back = pan(y0, cy, true); grp.add(back);
    // épaisseur : planche de rive avant et pignons
    const edge = trimMat || solid(shade('#8a5a30', -10));
    const rim = new T.Mesh(boxUV(new T.BoxGeometry(x1 - x0, t, t), x1 - x0, t, t), edge); rim.position.set((x0 + x1) / 2, -t / 2 + 0.02, y1); grp.add(setShadow(rim));
    const rim2 = rim.clone(); rim2.position.z = y0; grp.add(rim2);
    // pignons (triangles) aux deux extrémités en matériau mur
    const tri = (x, dir) => {
      const geo = new T.BufferGeometry();
      const v = dir > 0 ? [x, 0, y1, x, 0, y0, x, h, cy] : [x, 0, y0, x, 0, y1, x, h, cy];
      geo.setAttribute('position', new T.Float32BufferAttribute(v, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, (y1 - y0) * UV_PER_UNIT, 0, (y1 - y0) * UV_PER_UNIT / 2, h * UV_PER_UNIT], 2));
      geo.computeVertexNormals();
      return setShadow(new T.Mesh(geo, trimMat || mat));
    };
    grp.add(tri(x1 - 0.01, 1)); grp.add(tri(x0 + 0.01, -1));
    grp.position.y = z0;
    return add(g, grp);
  }
  // Toit en pavillon (4 pans) avec débord
  function hip(g, ix0, iy0, w, d, h, mat, z0 = 0, o = 0.18) {
    return pyramid(g, ix0 - o, iy0 - o, w + 2 * o, d + 2 * o, h, mat, z0);
  }
  // Toit plat : dalle fine avec débord ; parapet optionnel à merlons
  function flatRoof(g, ix0, iy0, w, d, mat, z0, opts = {}) {
    const o = opts.o ?? 0.08, th = opts.th ?? 0.12;
    const slab = box(g, ix0 - o, iy0 - o, w + 2 * o, d + 2 * o, th, mat, z0 - th);
    if (opts.parapet) {
      const pm = opts.parapetMat || mat, ph = opts.parapetH ?? 0.22, pt = 0.1;
      box(g, ix0 - o, iy0 - o, w + 2 * o, pt, ph, pm, z0);
      box(g, ix0 - o, iy0 + d + o - pt, w + 2 * o, pt, ph, pm, z0);
      box(g, ix0 - o, iy0 - o, pt, d + 2 * o, ph, pm, z0);
      box(g, ix0 + w + o - pt, iy0 - o, pt, d + 2 * o, ph, pm, z0);
      if (opts.merlons) {
        const m = 0.14, mh = 0.16, nx = Math.max(2, Math.round((w + 2 * o) / 0.4)), ny = Math.max(2, Math.round((d + 2 * o) / 0.4));
        for (let i = 0; i < nx; i++) { const x = ix0 - o + (w + 2 * o - m) * i / (nx - 1); box(g, x, iy0 + d + o - pt, m, pt, mh, pm, z0 + ph); box(g, x, iy0 - o, m, pt, mh, pm, z0 + ph); }
        for (let i = 0; i < ny; i++) { const y = iy0 - o + (d + 2 * o - m) * i / (ny - 1); box(g, ix0 + w + o - pt, y, pt, m, mh, pm, z0 + ph); box(g, ix0 - o, y, pt, m, mh, pm, z0 + ph); }
      }
    }
    return slab;
  }
  // Dôme (demi-sphère, ou bulbe si bulb)
  function dome(g, cx, cy, r, mat, z0 = 0, bulb = false) {
    let geo;
    if (bulb) {
      const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; const ang = t * Math.PI * 0.62; const rr = r * Math.sin(ang + 0.35) * 1.12 * (1 - t * 0.08); const yy = r * (1 - Math.cos(ang)) * 1.15; pts.push(new T.Vector2(Math.max(0.001, rr), yy)); }
      pts.push(new T.Vector2(0.001, r * 1.9));
      geo = new T.LatheGeometry(pts, 32);
    } else geo = new T.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 4 * UV_PER_UNIT, uv.getY(i) * r * 2 * UV_PER_UNIT); uv.needsUpdate = true;
    const m = new T.Mesh(geo, mat); m.position.set(cx, z0, cy);
    return add(g, setShadow(m));
  }
  // Tente (pyramide sur base carrée) avec pointe
  function tent(g, cx, cy, r, h, mat, z0 = 0) { return pyramid(g, cx - r, cy - r, 2 * r, 2 * r, h, mat, z0); }
  // Colonne (fût + chapiteau + base) ; fluted = cannelures (plus de segments et léger relief)
  function column(g, cx, cy, h, mat, z0 = 0, opts = {}) {
    const r = opts.r ?? 0.1, cap = opts.capMat || mat;
    const grp = new T.Group();
    const shaft = new T.Mesh(cylUV(new T.CylinderGeometry(r, r * 1.05, h, opts.fluted ? 20 : 14), r, h), mat); shaft.position.set(cx, z0 + h / 2, cy); grp.add(setShadow(shaft));
    const b = new T.Mesh(new T.BoxGeometry(r * 2.6, 0.06, r * 2.6), cap); b.position.set(cx, z0 + 0.03, cy); grp.add(setShadow(b));
    const c = new T.Mesh(new T.BoxGeometry(r * 2.8, 0.08, r * 2.8), cap); c.position.set(cx, z0 + h - 0.04, cy); grp.add(setShadow(c));
    if (opts.lotus) { const l = new T.Mesh(new T.CylinderGeometry(r * 1.6, r * 0.9, 0.16, 12), opts.lotusMat || cap); l.position.set(cx, z0 + h - 0.16, cy); grp.add(setShadow(l)); }
    return add(g, grp);
  }
  // Porte en creux dans une face : encadrement + vantail sombre (face +z par défaut : wall à iy = y, porte en relief 0.02)
  function door(g, cx, y, w, h, mat, z0 = 0, opts = {}) {
    const grp = new T.Group();
    const dir = opts.face || '+z';   // '+z' (face avant gauche) ou '+x' (face avant droite)
    const dark = opts.leaf || solid('#2a1a0c');
    const frame = opts.frame || solid(shade('#8a6a3a', -10));
    const dd = 0.05;
    const place = (m, dx, dz) => { if (dir === '+z') { m.position.set(cx + dx, m.position.y, y + dz); } else { m.rotation.y = Math.PI / 2; m.position.set(y + dz, m.position.y, cx + dx); } grp.add(setShadow(m)); };
    const leaf = new T.Mesh(new T.BoxGeometry(w, h, dd), dark); leaf.position.y = z0 + h / 2; place(leaf, 0, 0.01);
    if (opts.arch !== false) { const a = new T.Mesh(new T.CylinderGeometry(w / 2, w / 2, dd, 20, 1, false, 0, Math.PI), dark); a.rotation.x = Math.PI / 2; a.rotation.z = 0; a.position.y = z0 + h; place(a, 0, 0.01); }
    // encadrement
    const jl = new T.Mesh(new T.BoxGeometry(0.06, h + (opts.arch !== false ? w / 2 : 0), dd * 1.6), frame); jl.position.y = z0 + (h + (opts.arch !== false ? w / 2 : 0)) / 2; place(jl, -w / 2 - 0.03, 0.02);
    const jr = jl.clone(); place(jr, w / 2 + 0.03, 0.02);
    if (opts.arch === false) { const lintel = new T.Mesh(new T.BoxGeometry(w + 0.12, 0.08, dd * 1.6), frame); lintel.position.y = z0 + h + 0.04; place(lintel, 0, 0.02); }
    return add(g, grp);
  }
  // Fenêtre : cadre + vitre claire (légèrement émissive la nuit… ici juste claire)
  function windowBox(g, cx, y, w, h, z0, opts = {}) {
    const grp = new T.Group();
    const dir = opts.face || '+z';
    const frame = opts.frame || solid('#5a3a1a');
    const pane = opts.pane || material('flat', '#f6e4a6', { emissive: '#f0c050', emissiveIntensity: 0.25 });
    const place = (m, dx, dz) => { if (dir === '+z') m.position.set(cx + dx, m.position.y, y + dz); else { m.rotation.y = Math.PI / 2; m.position.set(y + dz, m.position.y, cx + dx); } grp.add(m); };
    const f = new T.Mesh(new T.BoxGeometry(w + 0.08, h + 0.08, 0.04), frame); f.position.y = z0 + h / 2; place(f, 0, 0.01);
    const p = new T.Mesh(new T.BoxGeometry(w, h, 0.03), pane); p.position.y = z0 + h / 2; place(p, 0, 0.03);
    if (opts.arch) { const a = new T.Mesh(new T.CylinderGeometry(w / 2 + 0.04, w / 2 + 0.04, 0.04, 16, 1, false, 0, Math.PI), frame); a.rotation.x = Math.PI / 2; a.position.y = z0 + h; place(a, 0, 0.01); }
    return add(g, grp);
  }
  // Cheminée + volutes de fumée
  function chimney(g, cx, cy, z0, mat, opts = {}) {
    const grp = new T.Group();
    const h = opts.h ?? 0.5, w = opts.w ?? 0.18;
    const b = new T.Mesh(boxUV(new T.BoxGeometry(w, h, w), w, h, w), mat); b.position.set(cx, z0 + h / 2, cy); grp.add(setShadow(b));
    const cap = new T.Mesh(new T.BoxGeometry(w * 1.3, 0.06, w * 1.3), solid('#4a3626')); cap.position.set(cx, z0 + h + 0.03, cy); grp.add(setShadow(cap));
    if (opts.smoke !== false) {
      const sm = material('flat', '#f4f0ea', { transparent: true, opacity: 0.85 });
      for (let i = 0; i < 3; i++) { const s = new T.Mesh(new T.SphereGeometry(0.07 + i * 0.05, 10, 8), sm); s.position.set(cx + i * 0.06, z0 + h + 0.12 + i * 0.2, cy - i * 0.03); s.castShadow = false; grp.add(s); }
    }
    return add(g, grp);
  }
  // Mât + drapeau (tissu ondulé par déplacement de sommets)
  function flag(g, cx, cy, z0, h, clothMat, opts = {}) {
    const grp = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(0.025, 0.03, h, 8), solid('#6a4a2a')); pole.position.set(cx, z0 + h / 2, cy); grp.add(setShadow(pole));
    const fw = opts.w ?? 0.5, fh = opts.h ?? 0.3;
    const geo = new T.PlaneGeometry(fw, fh, 8, 2);
    const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin((x / fw + 0.5) * Math.PI * 1.5) * 0.05 * (x / fw + 0.5)); }
    geo.computeVertexNormals();
    const cloth = new T.Mesh(geo, clothMat); cloth.material.side = T.DoubleSide;
    cloth.position.set(cx + fw / 2 + 0.03, z0 + h - fh / 2 - 0.02, cy); grp.add(setShadow(cloth));
    const tip = new T.Mesh(new T.SphereGeometry(0.045, 10, 8), material('gold', '#e8c547', { rough: 0.35, metal: 0.4 })); tip.position.set(cx, z0 + h + 0.03, cy); grp.add(tip);
    if (opts.horsetail) { const ht = new T.Mesh(new T.ConeGeometry(0.06, 0.4, 8), solid('#2a1a0a')); ht.position.set(cx + 0.06, z0 + h - 0.2, cy); ht.rotation.z = -0.3; grp.add(setShadow(ht)); }
    if (opts.vexillum) { const bar = new T.Mesh(new T.BoxGeometry(fw + 0.1, 0.03, 0.03), material('gold', '#e8c547')); bar.position.set(cx + fw / 2, z0 + h, cy); grp.add(bar); cloth.position.set(cx + fw / 2, z0 + h - fh / 2 - 0.03, cy); }
    return add(g, grp);
  }
  // Torche : hampe + flamme émissive
  function torch(g, cx, cy, z0, h = 0.45) {
    const grp = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(0.02, 0.025, h, 8), solid('#5a3a1a')); pole.position.set(cx, z0 + h / 2, cy); grp.add(setShadow(pole));
    const fl = new T.Mesh(new T.SphereGeometry(0.07, 10, 8), material('flat', '#ff9a20', { emissive: '#ff7a10', emissiveIntensity: 1.2 })); fl.position.set(cx, z0 + h + 0.05, cy); fl.scale.y = 1.5; fl.castShadow = false; grp.add(fl);
    const core = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), material('flat', '#ffe060', { emissive: '#ffe060', emissiveIntensity: 1.5 })); core.position.copy(fl.position); core.castShadow = false; grp.add(core);
    return add(g, grp);
  }
  // Arbres
  function pine(g, cx, cy, s = 1, color = '#3f8a30', snow = false) {
    const grp = new T.Group();
    const trunk = new T.Mesh(new T.CylinderGeometry(0.05 * s, 0.07 * s, 0.35 * s, 8), material('bark', '#5a3a1a')); trunk.position.set(cx, 0.175 * s, cy); grp.add(setShadow(trunk));
    const leaf = material('leaves', color);
    const tiers = [[0.42, 0.55, 0.28], [0.34, 0.5, 0.58], [0.25, 0.42, 0.85]];
    for (const [r, h, z] of tiers) { const c = new T.Mesh(new T.ConeGeometry(r * s, h * s, 10), leaf); c.position.set(cx, (z + h / 2) * s, cy); grp.add(setShadow(c)); if (snow) { const sc = new T.Mesh(new T.ConeGeometry(r * s * 0.98, h * s * 0.45, 10), material('snow', '#f4f8fc')); sc.position.set(cx, (z + h - h * 0.45 / 2) * s + 0.02, cy); grp.add(setShadow(sc)); } }
    return add(g, grp);
  }
  function oak(g, cx, cy, s = 1, color = '#4f9e36', snow = false) {
    const grp = new T.Group();
    const trunk = new T.Mesh(new T.CylinderGeometry(0.06 * s, 0.09 * s, 0.45 * s, 8), material('bark', '#6b4423')); trunk.position.set(cx, 0.22 * s, cy); grp.add(setShadow(trunk));
    const leaf = material('leaves', color);
    for (const [dx, dz, dy, r] of [[0, 0, 0.62, 0.36], [-0.18, 0.08, 0.74, 0.26], [0.17, -0.1, 0.78, 0.24], [0.02, 0.14, 0.9, 0.2]]) { const b = new T.Mesh(new T.SphereGeometry(r * s, 12, 10), leaf); b.position.set(cx + dx * s, dy * s, cy + dz * s); grp.add(setShadow(b)); }
    if (snow) { const cap = new T.Mesh(new T.SphereGeometry(0.3 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), material('snow', '#f4f8fc')); cap.position.set(cx, 0.82 * s, cy); grp.add(setShadow(cap)); }
    return add(g, grp);
  }
  function palm(g, cx, cy, s = 1) {
    const grp = new T.Group();
    const trunk = new T.Mesh(new T.CylinderGeometry(0.05 * s, 0.08 * s, 1.0 * s, 8), material('bark', '#8a6230')); trunk.position.set(cx + 0.06 * s, 0.5 * s, cy); trunk.rotation.z = -0.12; grp.add(setShadow(trunk));
    const leaf = material('leaves', '#46a040');
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const f = new T.Mesh(new T.BoxGeometry(0.55 * s, 0.02, 0.14 * s), leaf); f.position.set(cx + 0.1 * s + Math.cos(a) * 0.28 * s, 1.0 * s - 0.05, cy + Math.sin(a) * 0.28 * s); f.rotation.y = -a; f.rotation.z = -0.5; grp.add(setShadow(f)); }
    return add(g, grp);
  }
  function cactus(g, cx, cy, s = 1) {
    const grp = new T.Group(); const m = material('flat', '#4f9a48', { rough: 0.7 });
    const body = new T.Mesh(new T.CapsuleGeometry(0.11 * s, 0.8 * s, 4, 10), m); body.position.set(cx, 0.5 * s, cy); grp.add(setShadow(body));
    for (const [dx, h, dir] of [[-0.2, 0.3, 1], [0.2, 0.22, -1]]) { const arm = new T.Mesh(new T.CapsuleGeometry(0.07 * s, 0.2 * s, 4, 8), m); arm.position.set(cx + dx * s, 0.45 * s, cy); arm.rotation.z = dir * Math.PI / 2; grp.add(setShadow(arm)); const up = new T.Mesh(new T.CapsuleGeometry(0.07 * s, h * s, 4, 8), m); up.position.set(cx + dx * s * 1.4, (0.45 + h / 2 + 0.05) * s, cy); grp.add(setShadow(up)); }
    return add(g, grp);
  }
  function rock(g, cx, cy, s = 1, color = '#8f8f8f', snow = false) {
    const geo = new T.IcosahedronGeometry(0.3 * s, 1);
    const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { pos.setXYZ(i, pos.getX(i) * (0.8 + Math.random() * 0.4), pos.getY(i) * (0.55 + Math.random() * 0.3), pos.getZ(i) * (0.8 + Math.random() * 0.4)); }
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, material('stone', color, { flat: true })); m.position.set(cx, 0.14 * s, cy); m.rotation.y = Math.random() * 3;
    add(g, setShadow(m));
    if (snow) { const cap = new T.Mesh(new T.SphereGeometry(0.22 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), material('snow', '#f4f8fc')); cap.position.set(cx, 0.24 * s, cy); add(g, setShadow(cap)); }
    return m;
  }
  function bush(g, cx, cy, s = 1, color = '#4e8a2a') { const grp = new T.Group(); const m = material('leaves', color); for (const [dx, dz, r] of [[0, 0, 0.2], [-0.14, 0.06, 0.15], [0.14, -0.04, 0.14]]) { const b = new T.Mesh(new T.SphereGeometry(r * s, 10, 8), m); b.position.set(cx + dx * s, r * s * 0.8, cy + dz * s); grp.add(setShadow(b)); } return add(g, grp); }
  function crate(g, cx, cy, s = 0.3, z0 = 0) { const m = new T.Mesh(boxUV(new T.BoxGeometry(s, s, s), s, s, s, 3), material('planks', '#b08a4c')); m.position.set(cx, z0 + s / 2, cy); m.rotation.y = 0.2; return add(g, setShadow(m)); }
  function barrel(g, cx, cy, s = 0.3, z0 = 0) { const grp = new T.Group(); const b = new T.Mesh(cylUV(new T.CylinderGeometry(s * 0.42, s * 0.42, s, 14), s * 0.42, s, 3), material('planks', '#8a5a30')); b.position.set(cx, z0 + s / 2, cy); grp.add(setShadow(b)); for (const y of [0.25, 0.75]) { const ring = new T.Mesh(new T.TorusGeometry(s * 0.43, 0.015, 6, 20), material('metal', '#3a3a3a')); ring.rotation.x = Math.PI / 2; ring.position.set(cx, z0 + s * y, cy); grp.add(ring); } return add(g, grp); }
  function fence(g, ix0, iy0, w, d, mat, opts = {}) {
    const grp = new T.Group(); const pm = mat || material('planks', '#9a7340'); const h = opts.h ?? 0.32;
    const seg = (x0, y0, x1, y1) => { const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / 0.45)); for (let i = 0; i <= n; i++) { const p = new T.Mesh(new T.BoxGeometry(0.05, h, 0.05), pm); p.position.set(x0 + (x1 - x0) * i / n, h / 2, y0 + (y1 - y0) * i / n); grp.add(setShadow(p)); } for (const yy of [h * 0.45, h * 0.8]) { const r = new T.Mesh(new T.BoxGeometry(len, 0.035, 0.03), pm); r.position.set((x0 + x1) / 2, yy, (y0 + y1) / 2); r.rotation.y = -Math.atan2(y1 - y0, x1 - x0); grp.add(setShadow(r)); } };
    seg(ix0, iy0 + d, ix0 + w, iy0 + d); seg(ix0 + w, iy0 + d, ix0 + w, iy0);
    if (opts.all) { seg(ix0, iy0, ix0 + w, iy0); seg(ix0, iy0, ix0, iy0 + d); }
    return add(g, grp);
  }
  // Rangs de culture : sillons + plants (boîtes fines)
  function cropRows(g, ix0, iy0, w, d, rows, mat, opts = {}) {
    const grp = new T.Group();
    const ph = opts.h ?? 0.22;
    for (let i = 0; i < rows; i++) { const y = iy0 + d * (i + 0.5) / rows; const r = new T.Mesh(boxUV(new T.BoxGeometry(w * 0.9, ph, d / rows * 0.55), w * 0.9, ph, 0.3, 2), mat); r.position.set(ix0 + w / 2, ph / 2, y); grp.add(setShadow(r)); }
    if (opts.channels) { const wm = material('water', '#2f78c2', { rough: 0.3 }); for (let i = 0; i <= rows; i++) { const y = iy0 + d * i / rows; const c = new T.Mesh(new T.BoxGeometry(w * 0.95, 0.02, 0.06), wm); c.position.set(ix0 + w / 2, 0.015, y); grp.add(c); } }
    return add(g, grp);
  }
  function water(g, cx, cy, rx, ry, z0 = 0) { const m = new T.Mesh(new T.CylinderGeometry(1, 1, 0.03, 32), material('water', '#2f78c2', { rough: 0.25 })); m.scale.set(rx, 1, ry); m.position.set(cx, z0 + 0.015, cy); m.receiveShadow = true; return add(g, m); }
  function wheel(g, cx, cy, z0, r = 0.18, axis = 'x') { const m = new T.Mesh(new T.TorusGeometry(r, 0.035, 8, 16), material('planks', '#6a4a2a')); if (axis === 'x') m.rotation.y = Math.PI / 2; m.position.set(cx, z0 + r, cy); add(g, setShadow(m)); for (let i = 0; i < 3; i++) { const sp = new T.Mesh(new T.BoxGeometry(0.03, r * 1.9, 0.03), material('planks', '#6a4a2a')); sp.position.set(cx, z0 + r, cy); sp.rotation.set(axis === 'x' ? i * Math.PI / 3 : 0, 0, axis === 'x' ? 0 : i * Math.PI / 3); add(g, setShadow(sp)); } return m; }
  function cart(g, cx, cy, z0 = 0, s = 1) { const grp = new T.Group(); const bed = new T.Mesh(boxUV(new T.BoxGeometry(0.6 * s, 0.22 * s, 0.4 * s), 0.6, 0.22, 0.4, 3), material('planks', '#9a7340')); bed.position.set(cx, z0 + 0.3 * s, cy); grp.add(setShadow(bed)); wheel(grp, cx - 0.2 * s, cy + 0.22 * s, z0, 0.14 * s, 'z'); wheel(grp, cx + 0.2 * s, cy + 0.22 * s, z0, 0.14 * s, 'z'); const sh = new T.Mesh(new T.BoxGeometry(0.5 * s, 0.03, 0.03), solid('#6a4a2a')); sh.position.set(cx + 0.5 * s, z0 + 0.3 * s, cy - 0.1 * s); grp.add(setShadow(sh)); return add(g, grp); }
  function anvil(g, cx, cy, z0 = 0) { const grp = new T.Group(); const m = material('metal', '#5a5a66', { rough: 0.5, metal: 0.4 }); const base = new T.Mesh(new T.BoxGeometry(0.24, 0.16, 0.16), m); base.position.set(cx, z0 + 0.08, cy); grp.add(setShadow(base)); const top = new T.Mesh(new T.BoxGeometry(0.4, 0.09, 0.14), m); top.position.set(cx, z0 + 0.2, cy); grp.add(setShadow(top)); const horn = new T.Mesh(new T.ConeGeometry(0.06, 0.18, 8), m); horn.rotation.z = -Math.PI / 2; horn.position.set(cx + 0.28, z0 + 0.2, cy); grp.add(setShadow(horn)); return add(g, grp); }
  function amphora(g, cx, cy, z0 = 0, s = 0.32) { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new T.Vector2(s * (0.12 + Math.sin(t * Math.PI) * 0.4 + (t > 0.85 ? (t - 0.85) * 1.2 : 0)), t * s * 2)); } const m = new T.Mesh(new T.LatheGeometry(pts, 16), material('flat', '#c9955a')); m.position.set(cx, z0, cy); return add(g, setShadow(m)); }
  function obelisk(g, cx, cy, z0 = 0, h = 1.2) { const grp = new T.Group(); const sh = new T.Mesh(new T.CylinderGeometry(0.06, 0.1, h, 4), material('sandstone', '#e8d4a0')); sh.rotation.y = Math.PI / 4; sh.position.set(cx, z0 + h / 2, cy); grp.add(setShadow(sh)); const tip = new T.Mesh(new T.ConeGeometry(0.085, 0.16, 4), material('gold', '#e8c547', { rough: 0.3, metal: 0.4 })); tip.rotation.y = Math.PI / 4; tip.position.set(cx, z0 + h + 0.08, cy); grp.add(tip); return add(g, grp); }
  function spear(g, cx, cy, z0, h = 0.9, lean = 0.15) { const grp = new T.Group(); const sh = new T.Mesh(new T.CylinderGeometry(0.015, 0.02, h, 6), solid('#8a6230')); sh.position.set(cx, z0 + h / 2, cy); sh.rotation.z = lean; grp.add(setShadow(sh)); const tip = new T.Mesh(new T.ConeGeometry(0.035, 0.12, 6), material('metal', '#c8c8d0', { rough: 0.4, metal: 0.5 })); tip.position.set(cx - Math.sin(lean) * h / 2, z0 + h * Math.cos(lean) + 0.05, cy); tip.rotation.z = lean; grp.add(tip); return add(g, grp); }
  function campfire(g, cx, cy, z0 = 0) { const grp = new T.Group(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const st = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), material('stone', '#8a8a8a', { flat: true })); st.position.set(cx + Math.cos(a) * 0.2, z0 + 0.04, cy + Math.sin(a) * 0.2); grp.add(setShadow(st)); } const fl = new T.Mesh(new T.ConeGeometry(0.11, 0.3, 8), material('flat', '#ff8a20', { emissive: '#ff6a10', emissiveIntensity: 1.1 })); fl.position.set(cx, z0 + 0.15, cy); fl.castShadow = false; grp.add(fl); return add(g, grp); }
  function lantern(g, cx, cy, z0, h = 0.7) { const grp = new T.Group(); const p = new T.Mesh(new T.CylinderGeometry(0.02, 0.025, h, 8), solid('#5a3a1a')); p.position.set(cx, z0 + h / 2, cy); grp.add(setShadow(p)); const l = new T.Mesh(new T.BoxGeometry(0.12, 0.16, 0.12), material('flat', '#ffd060', { emissive: '#ffb020', emissiveIntensity: 0.9 })); l.position.set(cx, z0 + h + 0.08, cy); l.castShadow = false; grp.add(l); const cap = new T.Mesh(new T.ConeGeometry(0.1, 0.08, 4), solid('#5a3a1a')); cap.rotation.y = Math.PI / 4; cap.position.set(cx, z0 + h + 0.2, cy); grp.add(cap); return add(g, grp); }
  function stakes(g, cx, cy, n = 4, s = 1) { const grp = new T.Group(); for (let i = 0; i < n; i++) { const st = new T.Mesh(new T.CylinderGeometry(0.0, 0.04 * s, 0.5 * s, 6), material('planks', '#9a7340')); st.position.set(cx + i * 0.14 * s, 0.25 * s, cy - i * 0.03 * s); st.rotation.z = 0.25; grp.add(setShadow(st)); } return add(g, grp); }
  function shieldProp(g, cx, cy, z0, color, lean = 0.2) { const grp = new T.Group(); const s = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.03, 20), material('cloth', color)); s.rotation.x = Math.PI / 2 - lean; s.position.set(cx, z0 + 0.17, cy); grp.add(setShadow(s)); const boss = new T.Mesh(new T.SphereGeometry(0.04, 8, 6), material('gold', '#e8c547')); boss.position.set(cx, z0 + 0.17, cy + 0.03); grp.add(boss); return add(g, grp); }
  function horse(g, cx, cy, z0, color = '#7a5230', s = 1, yaw = 0) {
    const grp = new T.Group(); const m = material('hide', color);
    const body = new T.Mesh(new T.CapsuleGeometry(0.16 * s, 0.5 * s, 4, 10), m); body.rotation.z = Math.PI / 2; body.position.set(0, 0.5 * s, 0); grp.add(setShadow(body));
    const neck = new T.Mesh(new T.CapsuleGeometry(0.09 * s, 0.3 * s, 4, 8), m); neck.position.set(0.3 * s, 0.72 * s, 0); neck.rotation.z = -0.9; grp.add(setShadow(neck));
    const head = new T.Mesh(new T.BoxGeometry(0.26 * s, 0.14 * s, 0.12 * s), m); head.position.set(0.52 * s, 0.86 * s, 0); head.rotation.z = -0.4; grp.add(setShadow(head));
    for (const [dx, dz] of [[-0.22, 0.08], [-0.22, -0.08], [0.2, 0.08], [0.2, -0.08]]) { const leg = new T.Mesh(new T.CylinderGeometry(0.035 * s, 0.03 * s, 0.42 * s, 8), m); leg.position.set(dx * s, 0.21 * s, dz * s); grp.add(setShadow(leg)); }
    const mane = new T.Mesh(new T.BoxGeometry(0.3 * s, 0.06 * s, 0.05 * s), solid('#2a1a0a')); mane.position.set(0.3 * s, 0.82 * s, 0); mane.rotation.z = -0.9; grp.add(mane);
    const tail = new T.Mesh(new T.ConeGeometry(0.04 * s, 0.35 * s, 6), solid('#2a1a0a')); tail.position.set(-0.5 * s, 0.4 * s, 0); tail.rotation.z = 0.3; grp.add(tail);
    grp.position.set(cx, z0, cy); grp.rotation.y = yaw;
    return add(g, grp);
  }
  // Parcelle (losange arrondi légèrement surélevé) : sol de biome
  function plot(g, kind, s = 1.0, opts = {}) {
    const shape = new T.Shape();
    const r = 0.18 * s, hw = 1.0 * s;   // demi-largeur 1 unité (parcelle 2×2), coins arrondis
    const pts = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];   // carré aligné sur les axes (losange à l'écran)
    shape.moveTo(-hw + r, -hw);
    for (let i = 0; i < 4; i++) { const p = pts[i], n = pts[(i + 1) % 4]; const d = [n[0] - p[0], n[1] - p[1]]; const len = Math.hypot(d[0], d[1]); const u = [d[0] / len, d[1] / len]; shape.lineTo(n[0] - u[0] * r, n[1] - u[1] * r); const nn = pts[(i + 2) % 4]; const d2 = [nn[0] - n[0], nn[1] - n[1]]; const l2 = Math.hypot(d2[0], d2[1]); const u2 = [d2[0] / l2, d2[1] / l2]; shape.quadraticCurveTo(n[0], n[1], n[0] + u2[0] * r, n[1] + u2[1] * r); }
    const geo = new T.ExtrudeGeometry(shape, { depth: opts.th ?? 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
    geo.rotateX(Math.PI / 2);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.9, uv.getY(i) * 0.9); uv.needsUpdate = true;
    const mats = { grass: material('grass', '#6aa63c'), sand: material('sand', '#dcc38a'), snow: material('snow', '#eef3f8'), dirt: material('dirt', '#a07a4c'), stone: material('stone', '#9a948a'), crop: material('dirt', '#8a6a3c') };
    const m = new T.Mesh(geo, mats[kind] || mats.grass); m.position.y = opts.th ?? 0.1;
    m.receiveShadow = true; m.castShadow = false;
    return add(g, m);
  }

  window.P3 = { box, boxC, cylinder, cone, pyramid, gable, hip, flatRoof, dome, tent, column, door, windowBox, chimney, flag, torch, pine, oak, palm, cactus, rock, bush, crate, barrel, fence, cropRows, water, wheel, cart, anvil, amphora, obelisk, spear, campfire, lantern, stakes, shieldProp, horse, plot, boxUV, cylUV, setShadow, add, UV_PER_UNIT };
})();
