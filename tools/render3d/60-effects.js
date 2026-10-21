// ============================================================================
// 60-effects.js — effets animés par le client : volutes de fumée (4 variantes, vue de face) et ondes d'eau
// (4 phases d'un anneau qui s'élargit et s'estompe, vue iso). props/puff_<k>.webp, props/ripple_<k>.webp
// ============================================================================
(function () {
  const T = window.THREE;
  const { material, resetSeed, rnd } = window.TEX;
  window.MODELS = window.MODELS || {};
  window.MODELS.puff = (g, k) => {
    resetSeed(400 + k * 17);
    const m = material('flat', '#f4f0ea', { rough: 1, transparent: true, opacity: 0.82 });
    for (let i = 0; i < 7; i++) { const a = rnd() * Math.PI * 2, r = rnd() * 0.5; const s = new T.Mesh(new T.SphereGeometry(0.28 + rnd() * 0.3, 12, 10), m); s.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.8, (rnd() - 0.5) * 0.3); g.add(s); }
    return { extent: 2, shadowCatcher: false, outline: false };
  };
  window.MODELS.ripple = (g, k) => {
    const r = 0.25 + k * 0.2;
    const ring = new T.Mesh(new T.TorusGeometry(r, 0.035 + k * 0.004, 8, 48), material('flat', '#ffffff', { rough: 1, transparent: true, opacity: 0.8 - k * 0.18, emissive: '#ffffff', emissiveIntensity: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    if (k === 0) { const glint = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.01, 16), material('flat', '#ffffff', { transparent: true, opacity: 0.5, emissive: '#ffffff', emissiveIntensity: 0.5 })); glint.position.set(0.05, 0.02, 0.03); g.add(glint); }
    return { extent: 2, shadowCatcher: false, outline: false };
  };
  window.EFFECT_JOBS = () => { const jobs = []; for (let k = 0; k < 4; k++) { jobs.push({ id: `effect/puff/${k}`, category: 'effects', out: `props/puff_${k}.webp`, frame: 'puff', model: 'puff', args: [k] }); jobs.push({ id: `effect/ripple/${k}`, category: 'effects', out: `props/ripple_${k}.webp`, frame: 'ripple', model: 'ripple', args: [k] }); } return jobs; };
})();
