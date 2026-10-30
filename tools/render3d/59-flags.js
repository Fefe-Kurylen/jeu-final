// ============================================================================
// 59-flags.js — drapeaux animés : mât d'une unité et étoffe ondulante rendus en 8 phases, aux couleurs de
// chaque faction (+ « ally » bleu, « gold » doré). Le client les pose sur les bâtiments et l'enceinte et fait
// défiler les phases (props/flag_<faction>_<k>.webp, cadre 64×96 ancré au pied du mât).
// ============================================================================
(function () {
  const P = window.P3;
  const { material } = window.TEX;
  const { style, PALETTES } = window.FAC;
  const N = 8;
  const CLOTHS = { ally: '#2d5c9c', gold: '#c9a227' };
  window.MODELS = window.MODELS || {};
  window.MODELS.flag = (g, kind, k) => {
    const phase = k / N * Math.PI * 2;
    if (PALETTES[kind]) style(kind).flag(g, 0, 0, 0, 1.0, { phase });
    else P.flag(g, 0, 0, 0, 1.0, material('cloth', CLOTHS[kind] || '#b22a22'), { phase });
    return { extent: 2, shadowCatcher: false, outlinePx: 1.0 };
  };
  window.FLAG_JOBS = () => { const jobs = []; for (const kind of [...Object.keys(PALETTES), 'ally', 'gold']) for (let k = 0; k < N; k++) jobs.push({ id: `flag/${kind}/${k}`, category: 'flags', out: `props/flag_${kind}_${k}.webp`, frame: 'prop', model: 'flag', args: [kind, k] }); return jobs; };
})();
