// ============================================================================
// 53-map.js — sprites de la carte du monde : villes (par faction, forteresse, générique), ressources
// (avec variantes par biome), éléments de terrain par biome, unités en déplacement
// ============================================================================
(function () {
  const T = window.THREE;
  const P = window.P3;
  const { material, solid } = window.TEX;
  const { style, PALETTES } = window.FAC;
  const MP = {};

  function cityBase(g, kind) { P.plot(g, kind, 1.0, { th: 0.08 }); }
  MP.city = (g, f) => {
    const S = style(f); cityBase(g, S.p.ground);
    P.box(g, -0.9, 0.0, 0.7, 0.7, 0.6, S.wall, 0.08); S.roof(g, -0.9, 0.0, 0.7, 0.7, 0.35, 0.68);
    P.box(g, 0.2, 0.2, 0.7, 0.6, 0.55, S.wallDark, 0.08); S.roof(g, 0.2, 0.2, 0.7, 0.6, 0.3, 0.63);
    P.box(g, -0.4, -0.9, 1.1, 0.8, 0.95, S.wallLight, 0.08); S.columns(g, -0.3, -0.08, 0.9, 0.95, 4, 0.08, { r: 0.07 }); S.hip(g, -0.4, -0.9, 1.1, 0.8, 0.45, 1.03);
    S.flag(g, 0.15, -0.5, 1.5, 0.7); S.tree(g, -0.85, -0.8, 0.6, 0);
    return { extent: 3 };
  };
  MP.capital = (g, f) => {
    const S = style(f || 'ROME'); cityBase(g, S.p.ground);
    const wm = S.wallDark;
    P.box(g, -1.0, -1.0, 2.0, 0.25, 0.7, wm, 0.08); P.box(g, -1.0, -1.0, 0.25, 2.0, 0.7, wm, 0.08); P.box(g, 0.75, -1.0, 0.25, 2.0, 0.7, wm, 0.08); P.box(g, -1.0, 0.75, 2.0, 0.25, 0.7, wm, 0.08);
    for (const [x, y] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]]) { P.cylinder(g, x, y, 0.22, 1.1, S.wall, 0.08); S.cone(g, x, y, 0.26, 0.4, 1.18); }
    P.box(g, -0.5, -0.5, 1.0, 1.0, 1.2, S.wallLight, 0.08); S.columns(g, -0.4, 0.52, 0.8, 1.2, 4, 0.08, { r: 0.07 }); S.hip(g, -0.5, -0.5, 1.0, 1.0, 0.5, 1.28);
    S.flag(g, 0, 0, 1.78, 0.8); S.door(g, 0, 1.0, 0.3, 0.5, 0.08, { leaf: solid('#1a1410') });
    return { extent: 3 };
  };
  MP.defaultCity = (g) => { cityBase(g, 'grass'); const w = material('stone', '#c8b89a'), r = material('tiles', '#8a5a2a'); P.box(g, -0.8, 0.0, 0.7, 0.7, 0.6, w, 0.08); P.gable(g, -0.8, 0.0, 0.7, 0.7, 0.35, r, 0.68); P.box(g, 0.2, 0.2, 0.7, 0.6, 0.55, w, 0.08); P.gable(g, 0.2, 0.2, 0.7, 0.6, 0.3, r, 0.63); P.box(g, -0.3, -0.8, 0.9, 0.7, 0.85, material('stone', '#d8c8a8'), 0.08); P.hip(g, -0.3, -0.8, 0.9, 0.7, 0.4, r, 0.93); return { extent: 3 }; };

  const tree = (g, biome, x, y, s, i) => biome === 'desert' ? (i % 3 === 2 ? P.cactus(g, x, y, s * 0.8) : P.palm(g, x, y, s * 0.9)) : biome === 'snow' ? P.pine(g, x, y, s, '#2f6a3a', true) : (i % 2 ? P.oak(g, x, y, s * 0.9) : P.pine(g, x, y, s));
  MP.res_wood = (g, biome) => { [[-0.5, -0.4, 1.1], [0.5, -0.6, 0.95], [0.0, 0.4, 1.2], [0.7, 0.5, 0.8]].forEach(([x, y, s], i) => tree(g, biome, x, y, s, i)); const log = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.7, 10), material('bark', '#8a5a30')); log.rotation.z = Math.PI / 2; log.position.set(-0.6, 0.09, 0.7); g.add(P.setShadow(log)); return { extent: 3 }; };
  MP.res_stone = (g, biome) => { const c = biome === 'desert' ? ['#b8865a', '#c9966a', '#d4a070'] : biome === 'snow' ? ['#8a93a0', '#9aa3b0', '#a4acb8'] : ['#8a8a8a', '#9a9a9a', '#a4a4a4']; P.rock(g, -0.4, -0.2, 1.5, c[0], biome === 'snow'); P.rock(g, 0.45, 0.25, 1.2, c[1], biome === 'snow'); P.rock(g, 0.1, -0.7, 0.9, c[2], biome === 'snow'); P.rock(g, -0.5, 0.6, 0.7, c[0], biome === 'snow'); return { extent: 3 }; };
  MP.res_iron = (g, biome) => { P.box(g, -0.9, -0.9, 1.8, 1.0, 1.0, material('stone', '#6a5a4a')); P.box(g, -0.9, -0.9, 1.8, 0.2, 1.25, material('stone', '#7a6a5a')); const mouth = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.1, 16, 1, false, 0, Math.PI), solid('#15100a')); mouth.rotation.x = Math.PI / 2; mouth.position.set(-0.05, 0, 0.12); g.add(mouth); P.box(g, -0.33, 0.05, 0.56, 0.1, 0.55, solid('#15100a')); P.cart(g, 0.4, 0.6, 0, 0.6); P.rock(g, -0.7, 0.5, 0.7, '#7a7a8a', biome === 'snow'); if (biome === 'snow') P.box(g, -0.95, -0.95, 1.9, 1.05, 0.05, material('snow', '#f4f8fc'), 1.0); return { extent: 3 }; };
  MP.res_food = (g, biome) => { P.plot(g, biome === 'snow' ? 'snow' : 'crop', 1.0, { th: 0.06 }); P.cropRows(g, -0.95, -0.95, 1.9, 1.9, 6, material('wheat', '#e8c84a'), { channels: biome === 'desert', h: 0.2 }); P.fence(g, -1, -1, 2, 2); if (biome === 'desert') P.palm(g, 0.9, -0.9, 0.8); return { extent: 3 }; };
  MP.res_gold = (g, biome) => { P.rock(g, -0.3, -0.2, 1.4, '#8a7a5a', biome === 'snow'); P.rock(g, 0.45, 0.3, 1.1, '#9a8a6a', biome === 'snow'); const gold = material('gold', '#e8c547', { rough: 0.3, metal: 0.5 }); for (let i = 0; i < 6; i++) { const n = new T.Mesh(new T.OctahedronGeometry(0.07 + (i % 3) * 0.02), gold); n.position.set(-0.6 + i * 0.22, 0.06 + (i % 2) * 0.03, 0.55 + (i % 3) * 0.1); g.add(P.setShadow(n)); } const vein = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), gold); vein.position.set(-0.35, 0.45, 0.05); g.add(vein); return { extent: 3 }; };

  function mountain(g, icy) { const geo = new T.ConeGeometry(1.3, 2.0, 7); const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { if (pos.getY(i) < 0.5) { pos.setX(i, pos.getX(i) * (0.85 + Math.random() * 0.3)); pos.setZ(i, pos.getZ(i) * (0.85 + Math.random() * 0.3)); } } geo.computeVertexNormals(); const m = new T.Mesh(geo, material('stone', icy ? '#b8c8d8' : '#8a8478', { flat: true })); m.position.y = 1.0; g.add(P.setShadow(m)); const cap = new T.Mesh(new T.ConeGeometry(0.5, 0.8, 7), material('snow', '#f4f8fc', { flat: true })); cap.position.y = 1.62; g.add(P.setShadow(cap)); return { extent: 4 }; }
  MP.terrain = {
    forest_tree: (g) => { P.pine(g, -0.35, 0.15, 1.2); P.oak(g, 0.4, -0.2, 1.1); P.pine(g, 0.15, 0.55, 0.95); P.bush(g, -0.5, -0.5, 0.8); return { extent: 3 }; },
    forest_mountain: (g) => mountain(g, false),
    desert_dunes: (g) => { for (const [x, y, s, r] of [[-0.3, 0.25, 1.1, 0.3], [0.45, -0.15, 0.85, -0.4]]) { const m = new T.Mesh(new T.SphereGeometry(0.8 * s, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), material('sand', '#e2c98a')); m.scale.set(1.2, 0.35, 0.7); m.rotation.y = r; m.position.set(x, 0, y); g.add(P.setShadow(m)); } return { extent: 3, outline: false }; },
    desert_ruins: (g) => { const sm = material('sandstone', '#e4d4b0'); for (const [x, y, h] of [[-0.6, 0.3, 0.9], [-0.2, 0.3, 0.5], [0.2, 0.3, 1.1], [0.6, 0.3, 0.3]]) P.column(g, x, y, h, sm, 0, { r: 0.09, capMat: material('sandstone', '#c9ad80') }); P.box(g, -0.1, -0.7, 0.9, 0.35, 0.3, material('sandstone', '#d4c096')); P.rock(g, 0.5, -0.6, 0.8, '#c9b48a'); return { extent: 3 }; },
    desert_rocks: (g) => { P.rock(g, -0.35, 0, 1.4, '#b07a52'); P.rock(g, 0.4, 0.35, 1.0, '#c48a5e'); P.cactus(g, 0.45, -0.5, 0.9); return { extent: 3 }; },
    snow_snowtree: (g) => { P.pine(g, -0.35, 0.15, 1.2, '#2f6a3a', true); P.pine(g, 0.4, -0.2, 1.05, '#2f6a3a', true); P.rock(g, 0.3, 0.6, 0.7, '#8a93a0', true); return { extent: 3 }; },
    snow_icemountain: (g) => mountain(g, true)
  };

  window.MODELS = window.MODELS || {};
  for (const f of Object.keys(PALETTES)) window.MODELS['mapcity:' + f] = (g) => MP.city(g, f);
  window.MODELS['mapcity:capital'] = (g) => MP.capital(g, 'ROME');
  for (const f of Object.keys(PALETTES)) window.MODELS['mapcity:capital:' + f] = (g) => MP.capital(g, f);
  window.MODELS['mapcity:default'] = (g) => MP.defaultCity(g);
  for (const r of ['wood', 'stone', 'iron', 'food', 'gold']) window.MODELS['mapres:' + r] = (g, biome) => MP['res_' + r](g, biome);
  for (const [k, fn] of Object.entries(MP.terrain)) window.MODELS['mapterrain:' + k] = fn;
  window.MAP_JOBS = () => {
    const jobs = [];
    for (const f of Object.keys(PALETTES)) jobs.push({ id: `map/cities/${f.toLowerCase()}`, category: 'map', out: `map/cities/${f.toLowerCase()}.webp`, frame: 'map', model: 'mapcity:' + f, args: [] });
    jobs.push({ id: 'map/cities/capital', category: 'map', out: 'map/cities/capital.webp', frame: 'map', model: 'mapcity:capital', args: [] });
    for (const f of Object.keys(PALETTES)) jobs.push({ id: `map/cities/capital_${f.toLowerCase()}`, category: 'map', out: `map/cities/capital_${f.toLowerCase()}.webp`, frame: 'map', model: 'mapcity:capital:' + f, args: [] });
    jobs.push({ id: 'map/cities/default', category: 'map', out: 'map/cities/default.webp', frame: 'map', model: 'mapcity:default', args: [] });
    for (const r of ['wood', 'stone', 'iron', 'food', 'gold']) for (const b of ['forest', 'desert', 'snow']) jobs.push({ id: `map/resources/${r}_${b}`, category: 'map', out: `map/resources/${r}${b === 'forest' ? '' : '_' + b}.webp`, frame: 'map', model: 'mapres:' + r, args: [b] });
    for (const k of Object.keys(MP.terrain)) jobs.push({ id: `map/terrain/${k}`, category: 'map', out: `map/terrain/${k}.webp`, frame: 'map', model: 'mapterrain:' + k, args: [] });
    const unitName = { INFANTRY: 'hoplite', ARCHER: 'archer', CAVALRY: 'cavalry', SIEGE: 'catapult' };
    for (const [cls, name] of Object.entries(unitName)) { jobs.push({ id: `map/units/${name}`, category: 'map', out: `map/units/${name}.webp`, frame: 'map', model: 'mapunit', args: [cls, 'ROME'] }); for (const f of Object.keys(PALETTES)) jobs.push({ id: `map/units/${name}_${f}`, category: 'map', out: `map/units/${name}_${f}.webp`, frame: 'map', model: 'mapunit', args: [cls, f] }); }
    jobs.push({ id: 'map/units/merchant', category: 'map', out: 'map/units/merchant.webp', frame: 'map', model: 'mapmerchant', args: [] });
    return jobs;
  };
})();
