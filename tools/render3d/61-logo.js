// ============================================================================
// 61-logo.js — emblème du jeu rendu en 3D : casque de légionnaire doré à cimier rouge dans un médaillon de
// bronze cerclé d'or, couronne de laurier. « medallion » (fond transparent : logo de l'écran de connexion,
// icône adaptative Android) et « icon » (fond sombre opaque : icône d'application 1024 px, PNG).
// ============================================================================
(function () {
  const T = window.THREE;
  const P = window.P3;
  const { material } = window.TEX;
  const GOLD = material('gold', '#e2b93c', { rough: 0.32, metal: 0.55 });
  const GOLD_D = material('gold', '#a87a1c', { rough: 0.4, metal: 0.5 });
  const BRONZE = material('metal', '#3a3024', { rough: 0.55, metal: 0.4 });
  const RED = material('cloth', '#b8261e');
  const mk = (g, geo, mat, x, y, z, rot) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); g.add(P.setShadow(m)); return m; };
  function laurel(g, side) {
    const n = 8, r = 0.74;
    for (let i = 0; i < n; i++) {
      const a = (-95 + 125 * (i + 0.5) / n) * Math.PI / 180;   // de bas en haut
      const x = side * Math.cos(a) * r, y = Math.sin(a) * r;
      const tangent = Math.atan2(Math.cos(a), -side * Math.sin(a));
      for (const off of [-0.55, 0.55]) { const leaf = mk(g, new T.SphereGeometry(1, 10, 8), off < 0 ? GOLD : GOLD_D, x + Math.cos(tangent + off) * 0.1, y + Math.sin(tangent + off) * 0.1, 0.12); leaf.scale.set(0.045, 0.17, 0.03); leaf.rotation.z = tangent + off; }
      mk(g, new T.SphereGeometry(0.035, 8, 6), GOLD_D, x, y, 0.13);
    }
    const stem = mk(g, new T.TorusGeometry(r, 0.022, 8, 48, 125 * Math.PI / 180), GOLD_D, 0, 0, 0.1);
    stem.rotation.z = -95 * Math.PI / 180; if (side < 0) stem.scale.x = -1;
  }
  function helmet(g) {
    const h = new T.Group();
    const DARK = material('flat', '#1a1208', { rough: 1 });
    const dome = mk(h, new T.SphereGeometry(0.42, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.6), GOLD, 0, 0.1, 0); dome.scale.set(1, 0.95, 1.05);
    mk(h, new T.TorusGeometry(0.42, 0.05, 10, 48), GOLD_D, 0, -0.06, 0, [Math.PI / 2, 0, 0]);                  // bandeau frontal
    mk(h, new T.BoxGeometry(0.6, 0.06, 0.1), GOLD_D, 0, -0.03, 0.4, [0.35, 0, 0]);                               // visière
    mk(h, new T.BoxGeometry(0.62, 0.42, 0.12), DARK, 0, -0.3, 0.3);                                             // ombre du visage
    mk(h, new T.BoxGeometry(0.09, 0.44, 0.08), GOLD_D, 0, -0.3, 0.42);                                          // nasal
    for (const sx of [-1, 1]) { const c = mk(h, new T.BoxGeometry(0.2, 0.48, 0.22), GOLD, sx * 0.34, -0.4, 0.18); c.rotation.z = sx * 0.06; }   // paragnathides
    mk(h, new T.BoxGeometry(0.84, 0.16, 0.44), GOLD_D, 0, -0.18, -0.3, [0.5, 0, 0]);                            // couvre-nuque
    const crest = mk(h, new T.TorusGeometry(0.6, 0.17, 14, 56, Math.PI * 1.2), RED, 0, 0.0, -0.06, [0, Math.PI / 2, 0]); crest.scale.set(0.42, 1, 1.05); crest.rotation.z = -0.3;
    const holder = mk(h, new T.TorusGeometry(0.45, 0.04, 8, 48, Math.PI * 1.1), GOLD_D, 0, 0.04, -0.02, [0, Math.PI / 2, 0]); holder.rotation.z = -0.25;
    h.position.set(0.02, 0.08, 0.28); h.rotation.y = -0.75; h.rotation.x = 0.14; h.scale.setScalar(1.12);
    g.add(h);
  }
  window.MODELS = window.MODELS || {};
  window.MODELS.logo = (g, variant) => {
    if (variant === 'icon') { mk(g, new T.PlaneGeometry(6, 6), material('flat', '#1a150f', { rough: 1 }), 0, 0, -0.9); mk(g, new T.CircleGeometry(1.5, 48), material('flat', '#2b241a', { rough: 1 }), 0, 0, -0.85); }
    const disc = mk(g, new T.CylinderGeometry(1.08, 1.08, 0.14, 64), BRONZE, 0, 0, -0.3, [Math.PI / 2, 0, 0]);
    void disc;
    mk(g, new T.TorusGeometry(1.08, 0.065, 12, 72), GOLD, 0, 0, -0.23);
    mk(g, new T.TorusGeometry(0.95, 0.025, 8, 72), GOLD_D, 0, 0, -0.22);
    laurel(g, 1); laurel(g, -1);
    helmet(g);
    return { extent: 3, shadowCatcher: false, outline: variant !== 'icon', outlinePx: 1.2, cam: { pitch: 8, yaw: 0 } };
  };
  window.LOGO_JOBS = () => [
    { id: 'logo/medallion', category: 'logo', out: 'logo/medallion.webp', frame: 'logo', model: 'logo', args: ['medallion'], quality: 0.95 },
    { id: 'logo/medallion-png', category: 'logo', out: 'logo/medallion.png', frame: 'logo', model: 'logo', args: ['medallion'], format: 'png' },
    { id: 'logo/icon', category: 'logo', out: 'logo/icon.png', frame: 'logo', model: 'logo', args: ['icon'], format: 'png' }
  ];
})();
