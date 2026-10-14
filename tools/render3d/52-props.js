// ============================================================================
// 52-props.js — décors de scène (arbres, rochers, dunes…) posés autour de la ville et des champs
// ============================================================================
(function () {
  const T = window.THREE;
  const P = window.P3;
  const { material } = window.TEX;
  const PR = {};
  PR.pine = (g) => P.pine(g, 0, 0, 1.15);
  PR.pine2 = (g) => P.pine(g, 0, 0, 1.0, '#4a9a3c');
  PR.oak = (g) => P.oak(g, 0, 0, 1.15);
  PR.oak2 = (g) => P.oak(g, 0, 0, 1.0, '#6aa844');
  PR.bush = (g) => P.bush(g, 0, 0, 1.1);
  PR.rock = (g) => P.rock(g, 0, 0, 1.3);
  PR.rock2 = (g) => { P.rock(g, -0.15, 0.1, 1.0, '#7f7f7f'); P.rock(g, 0.22, -0.05, 0.7, '#9a9a9a'); };
  PR.palm = (g) => P.palm(g, 0, 0, 1.15);
  PR.cactus = (g) => P.cactus(g, 0, 0, 1.1);
  PR.dune = (g) => { const m = new T.Mesh(new T.SphereGeometry(0.8, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), material('sand', '#e2c98a')); m.scale.set(1.2, 0.35, 0.7); m.rotation.y = 0.5; g.add(P.setShadow(m)); return { outline: false }; };
  PR.snowpine = (g) => P.pine(g, 0, 0, 1.15, '#2f6a3a', true);
  PR.snowrock = (g) => P.rock(g, 0, 0, 1.3, '#8a93a0', true);
  PR.stump = (g) => { const m = new T.Mesh(new T.CylinderGeometry(0.16, 0.2, 0.22, 10), material('bark', '#6b4423')); m.position.y = 0.11; g.add(P.setShadow(m)); const top = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 0.02, 10), material('planks', '#c9a66a')); top.position.y = 0.23; g.add(top); };
  PR.flowers = (g) => { P.bush(g, 0, 0, 0.8, '#4e8a2a'); const cols = ['#e84a5a', '#f0c040', '#ffffff', '#c060e0']; for (let i = 0; i < 8; i++) { const f = new T.Mesh(new T.SphereGeometry(0.035, 6, 5), material('flat', cols[i % 4], { emissive: cols[i % 4], emissiveIntensity: 0.2 })); const a = i / 8 * Math.PI * 2; f.position.set(Math.cos(a) * 0.14, 0.22 + (i % 2) * 0.05, Math.sin(a) * 0.14); g.add(f); } };
  window.MODELS = window.MODELS || {};
  for (const [key, fn] of Object.entries(PR)) window.MODELS['prop:' + key] = (g) => Object.assign({ extent: 2 }, fn(g) || {});
  window.PROP_KEYS = Object.keys(PR);
})();
