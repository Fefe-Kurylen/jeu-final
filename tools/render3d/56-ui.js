// ============================================================================
// 56-ui.js — habillage d'interface rendu en 3D (caméra de face, unités = pixels à 1×) :
// cadres de panneau (9-slice), boutons (normal / enfoncé), plaques, barre de navigation
// ============================================================================
(function () {
  const T = window.THREE;
  const P = window.P3;
  const { material, solid, shade } = window.TEX;
  const UI = {};
  // Rectangle arrondi extrudé (dans le plan x-y, face +z vers la caméra)
  function roundedBox(w, h, r, depth, bevel = 3) {
    const s = new T.Shape();
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const geo = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64); uv.needsUpdate = true;
    return geo;
  }
  const mk = (g, geo, mat, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  // Bouton : plaque bombée + liseré ; pressed = plus sombre, biseau réduit
  function button(g, color, pressed, kind = 'planks') {
    const w = 152, h = 48;
    mk(g, roundedBox(w, h, 10, pressed ? 4 : 9, pressed ? 2 : 4), material(kind, pressed ? shade(color, -18) : color, { rough: 0.75 }), 0, 0, 0);
    mk(g, roundedBox(w + 6, h + 6, 12, 2, 1), material('gold', '#c9a227', { rough: 0.4, metal: 0.4 }), 0, 0, -3);
    if (!pressed) { const hl = new T.Mesh(roundedBox(w - 16, 10, 5, 1, 0.5), material('flat', '#ffffff', { transparent: true, opacity: 0.22 })); hl.position.set(0, h / 2 - 11, 12); g.add(hl); }
    return { extent: 110, shadowCatcher: false, outline: false, cam: { pitch: 0, yaw: 0 } };
  }
  UI['btn-primary'] = (g) => button(g, '#3f8a2a', false, 'flat');
  UI['btn-primary-pressed'] = (g) => button(g, '#3f8a2a', true, 'flat');
  UI['btn-secondary'] = (g) => button(g, '#7a5a3a', false, 'hide');
  UI['btn-secondary-pressed'] = (g) => button(g, '#7a5a3a', true, 'hide');
  UI['btn-danger'] = (g) => button(g, '#9a2a22', false, 'flat');
  UI['btn-danger-pressed'] = (g) => button(g, '#9a2a22', true, 'flat');
  UI['btn-gold'] = (g) => button(g, '#c9a227', false, 'gold');
  UI['btn-gold-pressed'] = (g) => button(g, '#c9a227', true, 'gold');
  UI['btn-info'] = (g) => button(g, '#2d5c9c', false, 'flat');
  UI['btn-info-pressed'] = (g) => button(g, '#2d5c9c', true, 'flat');
  // Cadre de panneau 192×192 : quatre traverses de bois biseautées avec clous d'or ; centre vide (9-slice 48 px)
  UI['frame-panel'] = (g) => {
    const wood = material('planks', '#6a4a2a', { rough: 0.8 }), gold = material('gold', '#c9a227', { rough: 0.35, metal: 0.45 });
    const t = 34, L = 192;
    mk(g, new T.BoxGeometry(L, t, 10), wood, 0, L / 2 - t / 2, 0); mk(g, new T.BoxGeometry(L, t, 10), wood, 0, -L / 2 + t / 2, 0);
    mk(g, new T.BoxGeometry(t, L, 10), wood, -L / 2 + t / 2, 0, 0.5); mk(g, new T.BoxGeometry(t, L, 10), wood, L / 2 - t / 2, 0, 0.5);
    mk(g, new T.BoxGeometry(L - 2 * t + 8, 6, 4), gold, 0, L / 2 - t + 2, 6); mk(g, new T.BoxGeometry(L - 2 * t + 8, 6, 4), gold, 0, -L / 2 + t - 2, 6);
    mk(g, new T.BoxGeometry(6, L - 2 * t + 8, 4), gold, -L / 2 + t - 2, 0, 6); mk(g, new T.BoxGeometry(6, L - 2 * t + 8, 4), gold, L / 2 - t + 2, 0, 6);
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { mk(g, new T.CylinderGeometry(11, 11, 6, 20), gold, x * (L / 2 - t / 2), y * (L / 2 - t / 2), 6).rotation.x = Math.PI / 2; mk(g, new T.SphereGeometry(5, 10, 8), gold, x * (L / 2 - t / 2), y * (L / 2 - t / 2), 10); }
    return { extent: 110, shadowCatcher: false, outline: false, cam: { pitch: 0, yaw: 0 } };
  };
  // Cadre de modale (en-tête bois sombre + corps parchemin)
  UI['frame-modal'] = (g) => {
    const wood = material('planks', '#4a3220', { rough: 0.85 }), gold = material('gold', '#c9a227', { rough: 0.35, metal: 0.45 });
    const t = 26, L = 192;
    mk(g, roundedBox(L, L, 14, 6, 3), wood, 0, 0, -8);
    mk(g, roundedBox(L - 2 * t, L - 2 * t, 8, 2, 1), material('plaster', '#f0e2c0', { rough: 0.95 }), 0, 0, 0);
    mk(g, roundedBox(L - 2 * t + 6, L - 2 * t + 6, 9, 2, 1), gold, 0, 0, -2);
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) mk(g, new T.SphereGeometry(6, 10, 8), gold, x * (L / 2 - 13), y * (L / 2 - 13), 2);
    return { extent: 110, shadowCatcher: false, outline: false, cam: { pitch: 0, yaw: 0 } };
  };
  // Plaque parchemin (boîtes de ressources, cartes) 160×96, 9-slice 24
  UI['plate-parchment'] = (g) => { mk(g, roundedBox(156, 92, 10, 4, 2), material('plaster', '#ecdcb8', { rough: 0.95 }), 0, 0, 0); mk(g, roundedBox(160, 96, 12, 2, 1), material('planks', '#8a6a3a'), 0, 0, -4); return { extent: 110, shadowCatcher: false, outline: false, cam: { pitch: 0, yaw: 0 } }; };
  UI['plate-dark'] = (g) => { mk(g, roundedBox(156, 92, 10, 4, 2), material('planks', '#3a2a1c', { rough: 0.9 }), 0, 0, 0); mk(g, roundedBox(160, 96, 12, 2, 1), material('gold', '#8a6a1a', { rough: 0.5, metal: 0.3 }), 0, 0, -4); return { extent: 110, shadowCatcher: false, outline: false, cam: { pitch: 0, yaw: 0 } }; };
  // Barre (nav / en-tête) : planche de bois sombre avec liseré d'or en haut, 160×96 étirée en largeur
  UI['bar-wood'] = (g) => { mk(g, new T.BoxGeometry(160, 96, 6), material('planks', '#3a2e22', { rough: 0.9 }), 0, 0, 0); mk(g, new T.BoxGeometry(160, 4, 2), material('gold', '#c9a227', { rough: 0.4, metal: 0.4 }), 0, 44, 4); mk(g, new T.BoxGeometry(160, 3, 2), solid('#1a1208'), 0, -46, 4); return { extent: 110, shadowCatcher: false, outline: false, cam: { pitch: 0, yaw: 0 } }; };
  window.MODELS = window.MODELS || {};
  for (const [k, fn] of Object.entries(UI)) window.MODELS['ui:' + k] = fn;
  window.UI_JOBS = () => Object.keys(UI).map(k => ({ id: `ui/${k}`, category: 'uiframes', out: `ui/${k}.webp`, frame: k.startsWith('btn') ? 'button' : k.startsWith('frame') ? 'frame' : 'plate', model: 'ui:' + k, args: [], quality: 0.92 }));
})();
