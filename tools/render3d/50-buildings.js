// ============================================================================
// 50-buildings.js — les 39 bâtiments de la ville, modélisés avec la grammaire de chaque faction.
// Chaque modèle : (g, faction, opts{snow}) -> construit dans g, centré sur la parcelle (2×2 unités,
// coordonnées iso de −1 à 1). La parcelle au sol est un sprite séparé (plots).
// ============================================================================
(function () {
  const T = window.THREE;
  const P = window.P3;
  const { material, solid, shade } = window.TEX;
  const { style } = window.FAC;
  const M = {};
  const G = () => new T.Group();

  // Bâtiment « standard » : corps + toit de faction + porte + fenêtres
  function house(g, S, ix0, iy0, w, d, h, opts = {}) {
    P.box(g, ix0, iy0, w, d, h, opts.wall || S.wall);
    (opts.hip ? S.hip : S.roof)(g, ix0, iy0, w, d, opts.rh ?? Math.min(w, d) * 0.55, h, { snow: opts.snow });
    if (opts.door !== false) S.door(g, ix0 + w * (opts.doorAt ?? 0.5), iy0 + d, opts.dw ?? 0.3, opts.dh ?? 0.5, 0);
    if (opts.windows) for (let i = 0; i < opts.windows; i++) S.win(g, iy0 + d * (i + 1) / (opts.windows + 1), ix0 + w, 0.2, 0.26, h * 0.5, { face: '+x' });
    if (opts.winFront) for (let i = 0; i < opts.winFront; i++) { const x = ix0 + w * (i + 1) / (opts.winFront + 1); if (Math.abs(x - (ix0 + w * (opts.doorAt ?? 0.5))) > 0.3) S.win(g, x, iy0 + d, 0.2, 0.26, h * 0.5); }
  }

  M.MAIN_HALL = (g, f, o) => { const S = style(f); P.box(g, -0.95, -0.7, 1.9, 1.4, 0.18, S.stone); P.box(g, -0.85, -0.6, 1.7, 1.2, 1.5, S.wall, 0.18); S.columns(g, -0.72, 0.62, 1.44, 1.5, 4, 0.18); S.hip(g, -0.85, -0.6, 1.7, 1.2, 0.6, 1.68, { snow: o.snow }); S.win(g, -0.1, 0.85, 0.22, 0.3, 0.9, { face: '+x' }); S.door(g, 0.05, 0.6, 0.34, 0.6, 0.18); if (!o.noFlag) S.flag(g, 0, 0, 2.28, 0.8); if (f === 'GREEK' || f === 'ROME') { P.box(g, -0.3, 0.62, 0.6, 0.3, 0.18, S.stone, 0); } };
  M.BARRACKS = (g, f, o) => { const S = style(f); house(g, S, -0.9, -0.5, 1.8, 1.0, 1.1, { wall: S.wallDark, windows: 2, winFront: 2, snow: o.snow }); if (!o.noFlag) S.flag(g, -0.95, -0.55, 1.1, 0.7); P.shieldProp(g, 0.95, 0.1, 0.4, S.p.accent); P.spear(g, -0.5, 0.85, 0, 0.8, 0.1); P.spear(g, -0.35, 0.9, 0, 0.75, -0.1); P.crate(g, 0.75, 0.8, 0.26); };
  M.STABLE = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.7, 1.4, 1.0, 0.9, S.trim); S.roof(g, -0.9, -0.7, 1.4, 1.0, 0.5, 0.9, { snow: o.snow }); S.door(g, -0.2, 0.3, 0.44, 0.6, 0, { arch: false }); P.fence(g, 0.45, -0.25, 0.5, 1.1, null, { all: true }); P.horse(g, 0.72, 0.3, 0, '#7a5230', 0.55, -0.5); P.box(g, -0.95, 0.75, 0.3, 0.18, 0.12, material('wheat', '#d8b840')); };
  M.WORKSHOP = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.6, 1.5, 1.2, 1.2, material('stone', '#6a5a4a')); P.flatRoof(g, -0.9, -0.6, 1.5, 1.2, material('planks', '#4a4440'), 1.2, { parapet: true, parapetMat: material('stone', '#5a4e44') }); P.chimney(g, -0.5, -0.3, 1.2, material('stone', '#5a4e44'), { h: 0.55 }); P.wheel(g, 0.95, 0.5, 0, 0.26, 'x'); P.box(g, 0.44, -0.95, 0.24, 0.24, 0.9, S.wood); S.door(g, 0.1, 0.6, 0.4, 0.6, 0, { arch: false }); P.crate(g, -0.75, 0.85, 0.24); if (o.snow) P.box(g, -0.98, -0.68, 1.66, 1.36, 0.06, S.snow, 1.3); };
  M.ACADEMY = (g, f, o) => { const S = style(f); P.box(g, -0.95, -0.75, 1.9, 1.5, 0.15, S.stone); P.box(g, -0.85, -0.65, 1.7, 1.3, 1.1, S.wallLight, 0.15); S.columns(g, -0.72, 0.68, 1.44, 1.1, 5, 0.15); S.roof(g, -0.85, -0.65, 1.7, 1.3, 0.5, 1.25, { snow: o.snow }); S.win(g, -0.2, 0.85, 0.22, 0.3, 0.75, { face: '+x' }); S.win(g, 0.35, 0.85, 0.22, 0.3, 0.75, { face: '+x' }); S.door(g, 0, 0.65, 0.3, 0.55, 0.15); P.box(g, -0.15, -0.1, 0.3, 0.2, 0.3, material('cloth', '#f0e2b0'), 1.9); };
  M.FORGE = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.5, 1.4, 1.0, 1.0, material('stone', '#5a4a3a')); S.roof(g, -0.9, -0.5, 1.4, 1.0, 0.45, 1.0, { snow: o.snow }); P.chimney(g, 0.2, -0.3, 1.2, material('stone', '#4a3e34'), { h: 0.6 }); P.anvil(g, 0.75, 0.62, 0); const fire = new T.Mesh(new T.SphereGeometry(0.12, 10, 8), material('flat', '#ff7a20', { emissive: '#ff6a10', emissiveIntensity: 1.2 })); fire.position.set(-0.25, 0.2, 0.75); g.add(fire); P.box(g, -0.5, 0.55, 0.5, 0.4, 0.24, material('stone', '#4a3e34')); P.barrel(g, 0.85, -0.6, 0.28); };
  M.HIDEOUT = (g, f, o) => { const S = style(f); const mound = new T.Mesh(new T.SphereGeometry(0.75, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), material(o.snow ? 'snow' : 'grass', o.snow ? '#eef3f8' : '#5e9a32')); mound.scale.set(1, 0.5, 0.8); mound.position.set(0.1, 0, 0.15); g.add(P.setShadow(mound)); S.door(g, 0.1, 0.75, 0.36, 0.3, 0, { arch: true, leaf: solid('#15100a') }); P.oak(g, -0.7, -0.5, 0.9, '#4a8a34', o.snow); P.rock(g, 0.8, -0.6, 0.8, '#7a8a6a', o.snow); P.crate(g, 0.8, 0.75, 0.22); };
  M.HEALING_TENT = (g, f, o) => { const S = style(f); const tm = material('cloth', '#f0ece0'); P.tent(g, 0, 0, 0.85, 1.4, tm); const cross = (x, y, z, rot) => { const a = new T.Mesh(new T.BoxGeometry(0.06, 0.26, 0.02), material('flat', '#c0202a')); a.position.set(x, z, y); a.rotation.set(rot, 0, 0); g.add(a); const b = a.clone(); b.rotation.z = Math.PI / 2; g.add(b); }; cross(0.25, 0.62, 0.7, -0.5); P.barrel(g, -0.85, 0.7, 0.3); P.box(g, 0.55, 0.75, 0.5, 0.26, 0.18, material('cloth', '#dcd6c6')); void S; };
  M.MARKET = (g, f, o) => { const S = style(f); P.box(g, -0.95, -0.95, 1.9, 1.9, 0.08, material('stone', '#b8a888')); P.box(g, -0.8, -0.8, 1.0, 0.7, 0.5, S.wall, 0.08); const awning = new T.Mesh(new T.BoxGeometry(1.3, 0.04, 1.1), material('cloth', S.p.accent)); awning.position.set(-0.3, 0.95, -0.45); awning.rotation.x = 0.28; g.add(P.setShadow(awning)); for (const [x, y] of [[-0.9, 0.05], [0.3, 0.05], [-0.9, -0.95], [0.3, -0.95]]) P.cylinder(g, x, y, 0.03, 0.95, S.wood, 0.08, 8); P.crate(g, 0.6, 0.4, 0.3, 0.08); P.crate(g, 0.75, 0.75, 0.26, 0.08); P.barrel(g, 0.25, 0.8, 0.32, 0.08); P.amphora(g, -0.5, 0.6, 0.08, 0.22); P.box(g, -0.5, 0.2, 0.5, 0.3, 0.1, material('wheat', '#d8b840'), 0.08); if (o.snow) P.box(g, -0.95, -0.95, 1.9, 1.9, 0.03, S.snow, 0.16); };
  M.WALL = (g, f, o) => { const S = style(f); const wm = S.wallDark; P.box(g, -1.0, -0.3, 2.0, 0.5, 1.0, wm); for (const x of [-1.0, 0.55]) P.box(g, x, -0.4, 0.45, 0.7, 1.45, wm); for (let i = 0; i < 4; i++) P.box(g, -0.5 + i * 0.32, -0.3, 0.16, 0.2, 0.22, wm, 1.0); P.torch(g, -0.78, 0.35, 1.45, 0.3); P.torch(g, 0.78, 0.35, 1.45, 0.3); S.door(g, 0, 0.2, 0.36, 0.62, 0, { arch: true, leaf: solid('#1a1410') }); if (o.snow) { P.box(g, -1.02, -0.32, 2.04, 0.54, 0.05, S.snow, 1.0); for (const x of [-1.02, 0.53]) P.box(g, x, -0.42, 0.49, 0.74, 0.05, S.snow, 1.45); } };
  M.MOAT = (g, f, o) => { const S = style(f); const wm = material('water', '#2f78c2', { rough: 0.25 }); const ring = new T.Mesh(new T.RingGeometry(0.55, 1.0, 4), wm); ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 4; ring.scale.set(1.38, 1.38, 1); ring.position.y = 0.02; ring.receiveShadow = true; g.add(ring); P.box(g, -0.55, -0.55, 1.1, 1.1, 0.12, material(o.snow ? 'snow' : 'grass', o.snow ? '#eef3f8' : '#6aa63c')); P.box(g, -0.12, -1.0, 0.24, 0.5, 0.06, S.wood, 0.03); P.box(g, -1.0, -0.12, 0.5, 0.24, 0.06, S.wood, 0.03); P.bush(g, 0.2, 0.2, 0.7); };
  M.MILL = (g, f, o) => { const S = style(f); P.cylinder(g, 0.1, 0.1, 0.5, 1.5, S.wall); S.cone(g, 0.1, 0.1, 0.55, 0.55, 1.5, { snow: o.snow }); const hub = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.12, 8), S.wood); hub.rotation.x = Math.PI / 2; hub.position.set(0.1, 1.35, 0.72); g.add(hub); for (let i = 0; i < 4; i++) { const blade = new T.Mesh(new T.BoxGeometry(0.16, 0.85, 0.02), material('cloth', '#e8e0d0')); blade.position.set(0.1, 1.35, 0.78); blade.rotation.z = i * Math.PI / 2 + 0.4; blade.geometry.translate(0, 0.42, 0); g.add(P.setShadow(blade)); } S.door(g, 0.1, 0.6, 0.28, 0.45, 0); P.box(g, -0.9, 0.55, 0.4, 0.3, 0.12, material('wheat', '#d8b840')); };
  M.BAKERY = (g, f, o) => { const S = style(f); house(g, S, -0.8, -0.6, 1.4, 1.1, 0.9, { windows: 1, winFront: 1, doorAt: 0.5, snow: o.snow }); P.chimney(g, 0.3, -0.4, 1.3, material('stone', '#6a5a4a'), { h: 0.45 }); for (const [x, y] of [[0.78, 0.3], [0.78, 0.6]]) { const loaf = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), material('flat', '#d8a050')); loaf.scale.set(1.4, 0.7, 1); loaf.position.set(x, 0.2, y); g.add(P.setShadow(loaf)); } P.box(g, 0.6, 0.2, 0.4, 0.55, 0.14, S.wood); };
  M.GREAT_SILO = (g, f, o) => { const S = style(f); P.cylinder(g, -0.45, 0.1, 0.52, 1.9, S.wall); P.cylinder(g, 0.5, -0.3, 0.52, 2.2, S.wallDark); S.cone(g, -0.45, 0.1, 0.58, 0.6, 1.9, { snow: o.snow }); S.cone(g, 0.5, -0.3, 0.58, 0.6, 2.2, { snow: o.snow }); S.door(g, 0, 0.6, 0.26, 0.42, 0); P.box(g, -0.95, 0.6, 0.5, 0.3, 0.12, material('wheat', '#d8b840')); };
  M.SILO = (g, f, o) => { const S = style(f); P.cylinder(g, 0, 0, 0.68, 1.8, S.wall); S.cone(g, 0, 0, 0.75, 0.7, 1.8, { snow: o.snow }); S.door(g, 0.3, 0.62, 0.26, 0.42, 0); P.box(g, -0.95, 0.55, 0.45, 0.35, 0.12, material('wheat', '#d8b840')); };
  M.WAREHOUSE = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.7, 1.8, 1.4, 1.0, S.trim); S.roof(g, -0.9, -0.7, 1.8, 1.4, 0.6, 1.0, { snow: o.snow }); S.door(g, 0.1, 0.7, 0.44, 0.62, 0, { arch: false }); P.crate(g, 0.8, 0.9, 0.28); P.crate(g, -0.85, 0.85, 0.24); P.barrel(g, -0.95, 0.2, 0.3); };
  M.GREAT_WAREHOUSE = (g, f, o) => { const S = style(f); P.box(g, -1.0, -0.8, 2.0, 1.6, 1.3, S.trim); S.roof(g, -1.0, -0.8, 2.0, 1.6, 0.7, 1.3, { snow: o.snow }); S.door(g, 0.1, 0.8, 0.5, 0.7, 0, { arch: false }); P.crate(g, 0.85, 1.0, 0.28); P.crate(g, 0.85, 1.0, 0.28, 0.28); P.barrel(g, -1.0, 0.95, 0.3); P.barrel(g, -0.7, 1.0, 0.3); };
  M.GREAT_BARRACKS = (g, f, o) => { const S = style(f); house(g, S, -1.0, -0.7, 2.0, 1.4, 1.4, { wall: S.wallDark, windows: 3, winFront: 3, snow: o.snow }); S.flag(g, -1.05, -0.75, 1.4, 0.7); if (!o.noFlag) S.flag(g, 1.05, -0.75, 1.4, 0.7); P.shieldProp(g, 1.05, -0.2, 0.75, S.p.accent); P.shieldProp(g, 1.05, 0.3, 0.75, S.p.accent); };
  M.GREAT_STABLE = (g, f, o) => { const S = style(f); P.box(g, -1.0, -0.8, 1.5, 1.6, 1.0, S.trim); S.roof(g, -1.0, -0.8, 1.5, 1.6, 0.6, 1.0, { snow: o.snow }); S.door(g, -0.3, 0.8, 0.5, 0.7, 0, { arch: false }); P.fence(g, 0.5, -0.8, 0.5, 1.7, null, { all: true }); P.horse(g, 0.75, -0.3, 0, '#7a5230', 0.5, -0.4); P.horse(g, 0.78, 0.5, 0, '#8a6a4a', 0.5, 0.6); };
  M.EMBASSY = (g, f, o) => { const S = style(f); P.box(g, -0.95, -0.65, 1.9, 1.3, 0.15, S.stone); P.box(g, -0.85, -0.55, 1.7, 1.1, 1.4, S.wallLight, 0.15); S.columns(g, -0.72, 0.58, 1.44, 1.4, 4, 0.15); S.hip(g, -0.85, -0.55, 1.7, 1.1, 0.5, 1.55, { snow: o.snow }); if (!o.noFlag) S.flag(g, -0.9, -0.6, 2.05, 0.7); if (!o.noFlag) P.flag(g, 0.9, -0.6, 2.05, 0.7, material('cloth', '#2d5c9c')); S.door(g, 0.05, 0.55, 0.3, 0.6, 0.15); };
  M.TREASURE_CHAMBER = (g, f, o) => { const S = style(f); P.box(g, -0.8, -0.6, 1.6, 1.2, 1.1, material('stone', '#8a8a92')); P.flatRoof(g, -0.8, -0.6, 1.6, 1.2, material('stone', '#6a6a72'), 1.1, { parapet: true, merlons: true, parapetMat: material('stone', '#7a7a82') }); S.door(g, 0.1, 0.6, 0.4, 0.6, 0, { arch: true, frame: S.gold, leaf: solid('#2a2a30') }); for (let i = 0; i < 5; i++) { const c = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.02, 12), S.gold); c.position.set(-0.6 + (i % 3) * 0.14, 0.02 + Math.floor(i / 3) * 0.02, 0.85 + (i % 2) * 0.08); g.add(c); } P.torch(g, -0.4, 0.68, 0, 0.5); P.torch(g, 0.6, 0.68, 0, 0.5); if (o.snow) P.box(g, -0.88, -0.68, 1.76, 1.36, 0.05, S.snow, 1.36); };
  M.HERO_MANSION = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.5, 1.4, 1.0, 1.2, S.wallLight); P.box(g, 0.5, -0.5, 0.5, 0.5, 1.7, S.wallDark); S.hip(g, -0.9, -0.5, 1.4, 1.0, 0.45, 1.2, { snow: o.snow }); S.cone(g, 0.75, -0.25, 0.36, 0.6, 1.7, { snow: o.snow }); if (!o.noFlag) S.flag(g, 0.75, -0.25, 2.35, 0.6); S.door(g, -0.2, 0.5, 0.3, 0.55, 0); S.win(g, 0.0, 0.5, 0.2, 0.26, 0.7, { face: '+x' }); P.oak(g, -0.75, 0.78, 0.7); };
  M.WATCHTOWER = (g, f, o) => { const S = style(f); P.box(g, -0.35, -0.35, 0.7, 0.7, 2.6, S.wallDark); P.box(g, -0.45, -0.45, 0.9, 0.9, 0.35, S.wall, 2.6); S.hip(g, -0.45, -0.45, 0.9, 0.9, 0.5, 2.95, { snow: o.snow }); S.win(g, 0.0, 0.35, 0.18, 0.26, 2.0, { face: '+x' }); S.win(g, 0.0, 0.35, 0.18, 0.26, 1.2, { face: '+x' }); P.torch(g, -0.5, 0.5, 2.95, 0.3); S.door(g, 0, 0.35, 0.26, 0.45, 0); };
  M.FOUNDRY = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.6, 1.5, 1.2, 1.1, material('stone', '#5a4a40')); S.roof(g, -0.9, -0.6, 1.5, 1.2, 0.4, 1.1, { snow: o.snow }); P.chimney(g, -0.4, -0.4, 1.35, material('stone', '#4a3e34'), { h: 0.7 }); P.chimney(g, 0.2, -0.4, 1.35, material('stone', '#4a3e34'), { h: 0.55 }); const glow = new T.Mesh(new T.SphereGeometry(0.14, 10, 8), material('flat', '#ff6a10', { emissive: '#ff5a00', emissiveIntensity: 1.3 })); glow.position.set(0.65, 0.2, 0.5); g.add(glow); for (let i = 0; i < 3; i++) { const ingot = new T.Mesh(new T.BoxGeometry(0.22, 0.07, 0.1), material('metal', '#8a8a96', { rough: 0.5, metal: 0.4 })); ingot.position.set(0.85, 0.035 + i * 0.07, 0.85 - i * 0.02); g.add(P.setShadow(ingot)); } };
  M.STONEMASON = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.4, 1.3, 0.9, 0.9, S.wallDark); S.roof(g, -0.9, -0.4, 1.3, 0.9, 0.4, 0.9, { snow: o.snow }); for (const [x, y, w] of [[0.7, 0.3, 0.4], [0.7, 0.3, 0.3], [0.5, 0.75, 0.36]]) { P.box(g, x - w / 2, y - 0.15, w, 0.3, 0.2, material('stone', '#b0b0b0'), 0); } P.box(g, 0.55, 0.15, 0.3, 0.3, 0.2, material('stone', '#c4c4c4'), 0.2); P.rock(g, -0.7, 0.8, 0.7, '#a0a0a0'); };
  M.SAWMILL = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.5, 1.5, 1.0, 0.8, S.trim); S.roof(g, -0.9, -0.5, 1.5, 1.0, 0.45, 0.8, { snow: o.snow }); P.wheel(g, 0.95, 0.2, 0, 0.3, 'x'); for (let i = 0; i < 3; i++) { const log = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.7, 10), material('bark', '#8a5a30')); log.rotation.z = Math.PI / 2; log.position.set(-0.5, 0.09 + (i === 2 ? 0.16 : 0), 0.75 + (i < 2 ? (i - 0.5) * 0.19 : 0)); g.add(P.setShadow(log)); } P.pine(g, 0.6, 0.8, 0.7); };
  M.RESIDENCE = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.5, 1.6, 1.0, 1.1, S.wallLight); S.hip(g, -0.9, -0.5, 1.6, 1.0, 0.5, 1.1, { snow: o.snow }); S.columns(g, -0.7, 0.52, 1.2, 1.1, 3, 0); S.win(g, 0.0, 0.7, 0.2, 0.26, 0.65, { face: '+x' }); S.door(g, -0.1, 0.5, 0.28, 0.5, 0); P.oak(g, 0.85, 0.8, 0.6); P.oak(g, -0.9, 0.85, 0.55); };
  M.TRADE_OFFICE = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.6, 1.4, 1.2, 1.2, S.wall); S.hip(g, -0.9, -0.6, 1.4, 1.2, 0.4, 1.2, { snow: o.snow }); const awning = new T.Mesh(new T.BoxGeometry(1.5, 0.04, 0.5), material('cloth', S.p.accent)); awning.position.set(-0.2, 0.85, 0.82); awning.rotation.x = 0.35; g.add(P.setShadow(awning)); P.crate(g, 0.8, 0.5, 0.26); P.crate(g, 0.8, 0.9, 0.26); P.cart(g, -0.55, 0.95, 0, 0.7); S.win(g, -0.2, 0.5, 0.2, 0.26, 0.7, { face: '+x' }); };
  M.ROMAN_THERMAE = (g, f, o) => { const S = style(f); P.box(g, -0.95, -0.95, 1.9, 0.9, 0.12, S.stone); P.box(g, -0.9, -0.9, 1.8, 0.8, 1.0, material('marble', '#ece4d4'), 0.12); S.columns(g, -0.8, -0.08, 1.6, 1.0, 5, 0.12, { r: 0.09 }); S.roof(g, -0.9, -0.9, 1.8, 0.8, 0.4, 1.12, { snow: o.snow }); P.water(g, 0, 0.5, 0.85, 0.4, 0.02); P.box(g, -0.95, 0.05, 1.9, 0.05, 0.08, material('marble', '#d8d0c0')); P.box(g, -0.95, 0.92, 1.9, 0.05, 0.08, material('marble', '#d8d0c0')); P.dome(g, 0, -0.5, 0.42, material('metal', '#c8b8a8', { rough: 0.5 }), 1.5); };
  M.GALLIC_BREWERY = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.6, 1.4, 1.0, 0.9, material('planks', '#a08060')); S.roof(g, -0.9, -0.6, 1.4, 1.0, 0.5, 0.9, { snow: o.snow }); P.chimney(g, 0.2, -0.4, 1.2, material('stone', '#6a5a4a'), { h: 0.4 }); P.barrel(g, 0.7, 0.3, 0.32); P.barrel(g, 0.85, 0.7, 0.32); P.barrel(g, 0.45, 0.8, 0.3); S.door(g, -0.2, 0.4, 0.3, 0.5, 0, { arch: false }); };
  M.GREEK_TEMPLE = (g, f, o) => { const S = style(f); const marble = material('marble', '#f6f2e8'); P.box(g, -1.0, -0.8, 2.0, 1.6, 0.12, material('marble', '#e4dccc')); P.box(g, -0.9, -0.7, 1.8, 1.4, 0.13, material('marble', '#ede6d6'), 0.12); P.box(g, -0.6, -0.6, 1.2, 1.1, 1.3, marble, 0.25); const col = (x, y) => P.column(g, x, y, 1.3, material('marble', '#faf6ec'), 0.25, { r: 0.09, fluted: true, capMat: material('marble', '#f0e8d8') }); for (let i = 0; i < 6; i++) { col(-0.8 + 1.6 * i / 5, 0.7); col(-0.8 + 1.6 * i / 5, -0.7); } for (let i = 1; i < 4; i++) { col(0.8, -0.7 + 1.4 * i / 4); col(-0.8, -0.7 + 1.4 * i / 4); } P.gable(g, -0.95, -0.75, 1.9, 1.5, 0.5, material('slate', '#4a7fb8'), 1.55, 0.12, 0.1, material('marble', '#e0d8c8')); const statue = new T.Mesh(new T.BoxGeometry(0.1, 0.3, 0.1), S.gold); statue.position.set(0, 2.2, 0); g.add(statue); if (o.snow) P.box(g, -1.05, -0.85, 2.1, 1.7, 0.04, S.snow, 2.05); };
  M.EGYPTIAN_IRRIGATION = (g, f, o) => { const S = style(f); const wm = material('water', '#2f78c2', { rough: 0.25 }); P.box(g, -1.0, -0.18, 2.0, 0.36, 0.03, wm); P.box(g, -0.18, -1.0, 0.36, 2.0, 0.03, wm); P.cropRows(g, -0.95, 0.3, 0.7, 0.6, 2, material('wheat', '#7fb050'), { h: 0.16 }); P.cropRows(g, 0.3, -0.95, 0.6, 0.6, 2, material('wheat', '#7fb050'), { h: 0.16 }); P.wheel(g, 0, 0, 0, 0.3, 'x'); P.palm(g, -0.65, -0.6, 0.9); P.palm(g, 0.7, 0.65, 0.8); void S; };
  M.HUN_WAR_TENT = (g, f, o) => { const S = style(f); P.tent(g, 0, 0, 0.95, 1.6, material('hide', '#9b7355')); P.tent(g, -0.72, 0.52, 0.32, 0.75, material('hide', '#8a6a4a')); if (!o.noFlag) S.flag(g, 0, 0, 1.6, 0.5); P.shieldProp(g, 0.85, 0.75, 0, '#8a2a10'); P.spear(g, 0.6, 0.95, 0, 0.9, 0.15); P.torch(g, -0.9, -0.5, 0, 0.5); if (o.snow) { const sn = new T.Mesh(new T.ConeGeometry(0.98, 0.5, 4), S.snow); sn.rotation.y = Math.PI / 4; sn.position.set(0, 1.42, 0); g.add(P.setShadow(sn)); } };
  M.SULTAN_DESERT_OUTPOST = (g, f, o) => { const S = style(f); P.box(g, -0.9, -0.6, 1.5, 1.2, 1.1, material('plaster', '#e4c8a6')); P.flatRoof(g, -0.9, -0.6, 1.5, 1.2, material('plaster', '#d4b896'), 1.1, { parapet: true, parapetMat: material('plaster', '#e4c8a6') }); P.dome(g, -0.15, 0.0, 0.48, material('mosaic', '#2a7a6a'), 1.16, true); window.FAC.finial(g, -0.15, 0.0, 1.16 + 0.48 * 1.9, 'crescent', S); P.cylinder(g, 0.75, -0.55, 0.16, 2.4, material('plaster', '#ead9b6')); P.dome(g, 0.75, -0.55, 0.2, material('mosaic', '#2a7a6a'), 2.4, true); S.door(g, 0.1, 0.6, 0.3, 0.55, 0); P.palm(g, 0.9, 0.8, 0.8); if (!o.noFlag) P.flag(g, 0.75, -0.55, 2.8, 0.4, material('cloth', '#c9a227')); };
  M.FARM = (g, f, o) => { const S = style(f); P.cropRows(g, -0.95, -0.95, 1.9, 1.9, 4, material('wheat', '#e8c248'), { channels: f === 'EGYPT' || f === 'SULTAN' }); P.fence(g, -1, -1, 2, 2); P.box(g, 0.3, -0.95, 0.55, 0.45, 0.5, S.trim); S.roof(g, 0.3, -0.95, 0.55, 0.45, 0.3, 0.5, { snow: o.snow }); };
  M.LUMBER = (g, f, o) => { const S = style(f); const biome = o.biome || 'forest'; [[-0.6, -0.5, 1.0], [0.5, -0.7, 0.9], [-0.1, 0.1, 1.05]].forEach(([x, y, s], i) => S.tree(g, x, y, s, i, biome)); P.box(g, 0.2, 0.3, 0.7, 0.5, 0.45, S.trim); S.roof(g, 0.2, 0.3, 0.7, 0.5, 0.3, 0.45, { snow: o.snow }); const log = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.6, 10), material('bark', '#8a5a30')); log.rotation.z = Math.PI / 2; log.position.set(-0.6, 0.08, 0.75); g.add(P.setShadow(log)); };
  M.QUARRY = (g, f, o) => { P.rock(g, -0.4, -0.3, 1.5, '#8f8f8f', o.snow); P.rock(g, 0.4, 0.2, 1.2, '#9a9a9a', o.snow); P.rock(g, 0.1, -0.7, 0.9, '#a4a4a4', o.snow); const crane = new T.Mesh(new T.CylinderGeometry(0.03, 0.04, 1.0, 8), material('planks', '#6a4a2a')); crane.position.set(-0.6, 0.5, 0.6); g.add(P.setShadow(crane)); const arm = new T.Mesh(new T.BoxGeometry(0.8, 0.05, 0.05), material('planks', '#6a4a2a')); arm.position.set(-0.3, 0.95, 0.5); arm.rotation.y = 0.5; g.add(P.setShadow(arm)); P.crate(g, 0.7, 0.75, 0.24); };
  M.IRON_MINE = (g, f, o) => { P.box(g, -0.9, -0.9, 1.8, 0.9, 1.0, material('stone', '#6a5a4a')); P.box(g, -0.9, -0.9, 1.8, 0.2, 1.3, material('stone', '#7a6a5a')); const mouth = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 0.1, 16, 1, false, 0, Math.PI), solid('#15100a')); mouth.rotation.x = Math.PI / 2; mouth.rotation.z = 0; mouth.position.set(-0.1, 0, 0.02); g.add(mouth); P.box(g, -0.3, -0.05, 0.4, 0.1, 0.5, solid('#15100a')); for (const y of [0.5, 0.7]) P.box(g, -0.8, y, 1.6, 0.04, 0.03, material('metal', '#5a4a3a')); P.cart(g, 0.3, 0.6, 0, 0.6); P.rock(g, 0.7, -0.4, 0.8, '#7a7a8a', o.snow); if (o.snow) P.box(g, -0.95, -0.95, 1.9, 0.95, 0.05, material('snow', '#f4f8fc'), 1.0); };
  M.RALLY_POINT = (g, f, o) => { const S = style(f); P.box(g, -0.6, -0.6, 1.2, 1.2, 0.06, material('dirt', '#9a8a6a')); if (!o.noFlag) S.flag(g, 0, 0, 0.06, 1.4); P.torch(g, -0.7, 0.7, 0, 0.5); P.torch(g, 0.7, -0.7, 0, 0.5); P.shieldProp(g, 0.6, 0.4, 0, S.p.accent); P.spear(g, -0.5, 0.75, 0, 0.9, 0.2); P.spear(g, -0.35, 0.8, 0, 0.85, -0.1); if (f === 'HUN') P.campfire(g, 0.5, -0.4); };

  window.MODELS = window.MODELS || {};
  // Paliers visuels, comme dans les jeux mobiles : le même bâtiment évolue avec son niveau.
  //   1 (niv. 1-6)   : hutte modeste — réduit à 74 %, murs de torchis / planches / pisé, toits de chaume ou de bardeaux, sans ornement
  //   2 (niv. 7-13)  : bâtiment courant (modèle de base)
  //   3 (niv. 14-20) : édifice prestigieux — agrandi à 114 %, esplanade dallée bordée d'or, corniches dorées sur tous les murs,
  //                    toits ravivés, torches aux quatre coins, balustrade de pierre, ornements de la faction
  const TIER_SCALE = { 1: 0.74, 2: 1, 3: 1.14 };
  const RUSTIC = {
    ROME:   { wall: ['plaster', '#d4c2a0'], roof: ['planks', '#8a5a30'], column: ['planks', '#9a7340'] },
    GAUL:   { wall: ['planks', '#8f7048'],  roof: ['thatch', '#a88a3e'], column: ['planks', '#7a5a30'] },
    GREEK:  { wall: ['plaster', '#e0d8c4'], roof: ['planks', '#7a6a5a'], column: ['planks', '#a08a6a'] },
    EGYPT:  { wall: ['plaster', '#c9ad80'], roof: ['planks', '#9a7a50'], column: ['planks', '#b09060'] },
    HUN:    { wall: ['hide', '#8e7558'],    roof: ['hide', '#6e4a30'],   column: ['planks', '#7a5a30'] },
    SULTAN: { wall: ['plaster', '#d8c8a4'], roof: ['planks', '#8a6a3a'], column: ['plaster', '#d8c8a4'] }
  };
  const GOLD_TRIM = material('gold', '#e2b93c', { rough: 0.35, metal: 0.5 });
  const PAVING = material('stone', '#cfc6b4');
  // Permutation des matériaux d'un modèle construit (les matériaux de faction sont des singletons : comparaison directe)
  function swapMaterials(root, map) { root.traverse(o => { if (o.isMesh && map.has(o.material)) o.material = map.get(o.material); }); }
  // Corniches dorées : un liseré au sommet de chaque mur (boîte) ou tour (cylindre) assez grand
  function goldCornices(root, S) {
    const walls = new Set([S.wall, S.wallDark, S.wallLight]);
    root.updateMatrixWorld(true);
    const add = [];
    root.traverse(o => {
      if (!o.isMesh || !walls.has(o.material) || !o.geometry.parameters) return;
      const p = o.geometry.parameters, wp = new T.Vector3(); o.getWorldPosition(wp);
      if (o.geometry.type === 'BoxGeometry' && p.height >= 0.5 && p.width >= 0.4 && p.depth >= 0.4) {
        const top = wp.y + p.height / 2 - 0.04, w = p.width + 0.05, d = p.depth + 0.05, t = 0.055;
        for (const [x, z, bw, bd] of [[0, -d / 2, w, t], [0, d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d]]) { const m = new T.Mesh(new T.BoxGeometry(bw, t, bd), GOLD_TRIM); m.position.set(wp.x + x, top, wp.z + z); add.push(m); }
      } else if (o.geometry.type === 'CylinderGeometry' && p.height >= 0.6 && p.radiusTop >= 0.2) {
        const m = new T.Mesh(new T.TorusGeometry(p.radiusTop + 0.02, 0.03, 8, 32), GOLD_TRIM); m.rotation.x = Math.PI / 2; m.position.set(wp.x, wp.y + p.height / 2 - 0.05, wp.z); add.push(m);
      }
    });
    for (const m of add) root.add(P.setShadow(m));
  }
  const NO_KIT = new Set(['WALL', 'MOAT', 'EGYPTIAN_IRRIGATION', 'RALLY_POINT', 'HIDEOUT']);
  for (const [key, fn] of Object.entries(M)) window.MODELS['building:' + key] = (g, faction, opts) => {
    const o = opts || {}, tier = o.tier || 2, S = style(faction);
    const b = new T.Group();
    fn(b, faction, o);
    if (tier === 1) {
      const r = RUSTIC[faction] || RUSTIC.ROME;
      const wall = material(r.wall[0], r.wall[1]), roof = material(r.roof[0], r.roof[1]);
      swapMaterials(b, new Map([[S.wall, wall], [S.wallLight, material(r.wall[0], shade(r.wall[1], 6))], [S.wallDark, material(r.wall[0], shade(r.wall[1], -10))], [S.roofMat, roof], [S.domeMat, material('plaster', shade(r.wall[1], -4))], [S.column, material(r.column[0], r.column[1])], [S.gold, material('planks', '#8a6a3a')]]));
    } else {
      S.flourish(b, key);
    }
    if (tier === 3) {
      swapMaterials(b, new Map([[S.wall, S.wallLight], [S.roofMat, material(S.p.roofKind === 'flat' ? 'sandstone' : S.p.roofKind === 'dome' ? 'plaster' : S.p.roofKind, S.p.roofKind === 'flat' ? shade(S.p.wall, -6) : S.p.roofKind === 'dome' ? shade(S.p.wall, 10) : shade(S.p.roof, 8))]]));
      goldCornices(b, S);
      if (!NO_KIT.has(key)) {
        // esplanade dallée bordée d'or, balustrade de pierre sur les deux faces avant, torches aux coins
        b.position.y = 0.08;
        P.box(g, -1.0, -1.0, 2.0, 2.0, 0.08, PAVING, 0);
        for (const [x0, y0, w, d] of [[-1.0, -1.0, 2.0, 0.05], [-1.0, 0.95, 2.0, 0.05], [-1.0, -1.0, 0.05, 2.0], [0.95, -1.0, 0.05, 2.0]]) P.box(g, x0, y0, w, d, 0.03, GOLD_TRIM, 0.08);
        for (const x of [-0.75, -0.45, 0.45, 0.75]) { P.box(g, x - 0.04, 0.9, 0.08, 0.08, 0.22, S.stone, 0.08); P.box(g, 0.9, x - 0.04, 0.08, 0.08, 0.22, S.stone, 0.08); }
        P.box(g, -0.8, 0.92, 0.4, 0.04, 0.04, S.stone, 0.3); P.box(g, 0.4, 0.92, 0.4, 0.04, 0.04, S.stone, 0.3); P.box(g, 0.92, -0.8, 0.04, 0.4, 0.04, S.stone, 0.3); P.box(g, 0.92, 0.4, 0.04, 0.4, 0.04, S.stone, 0.3);
        for (const [x, y] of [[-0.95, 0.95], [0.95, 0.95], [0.95, -0.95], [-0.95, -0.95]]) P.torch(g, x, y, 0.08, 0.45);
      }
    }
    // paliers 3 trop larges pour le cadre (pignon coupé au bord) : légèrement réduits
    const T3_FIT = { ROMAN_THERMAE: 0.92, FARM: 0.92 };
    const k = (TIER_SCALE[tier] || 1) * (tier === 3 ? (T3_FIT[key] || 1) : 1); b.scale.set(k, k, k);
    g.add(b);
    // Entrées au sud-est (octobre 2026) : les modèles sont écrits entrée sur la face avant gauche (+z) ; on les
    // réfléchit par le plan vertical x = z, qui contient l'axe de la caméra iso (lacet 45°) : façade, porte et
    // portique passent sur la face avant droite (+x), sans rien décaler dans le cadre. La lumière reste à gauche.
    // (x, y, z) -> (z, y, x) = rotation de 90° autour de y après une symétrie en x ; Three.js inverse les faces seul.
    // Exception : le temple grec a déjà son fronton (son entrée) sur la face avant droite, il n'est pas réfléchi
    if (o.mirror !== false && window.BUILDINGS_FACE_SE !== false && key !== 'GREEK_TEMPLE') {
      const kids = [...g.children], mir = new T.Group();
      mir.scale.x = -1; mir.rotation.y = Math.PI / 2;
      for (const c of kids) mir.add(c);
      g.add(mir);
    }
    return { extent: 4 };
  };
  window.BUILDING_KEYS = Object.keys(M);
})();
