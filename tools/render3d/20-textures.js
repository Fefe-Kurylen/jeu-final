// ============================================================================
// 20-textures.js — matériaux « peints » générés sur canvas (pierre, tuiles, chaume, planches, enduit,
// grès, marbre, mosaïque, feutre, sable, herbe, neige, eau, métal, or, tissu). Chaque matériau est
// mis en cache par (nom, couleur) ; les UV des primitives décident de la répétition.
// ============================================================================
(function () {
  const T = window.THREE;
  const cache = new Map();

  // ---- utilitaires couleur ----
  function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function shade(hex, pct) { const [r, g, b] = hexToRgb(hex); const k = pct / 100 * 255; return rgbToHex(r + k, g + k, b + k); }
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  function resetSeed(s) { seed = s; }

  function canvasTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    draw(x, size);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = T.LinearMipmapLinearFilter;
    return t;
  }
  // grain / variations de teinte : donne l'aspect peint
  function grain(x, size, strength = 0.08, count = 900) {
    for (let i = 0; i < count; i++) {
      const v = (rnd() - 0.5) * 2 * strength;
      x.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      const s = 2 + rnd() * 6;
      x.fillRect(rnd() * size, rnd() * size, s, s * (0.5 + rnd()));
    }
  }
  function blotches(x, size, color, n = 18, alpha = 0.12) {
    x.fillStyle = color; x.globalAlpha = alpha;
    for (let i = 0; i < n; i++) { x.beginPath(); x.ellipse(rnd() * size, rnd() * size, 10 + rnd() * 40, 6 + rnd() * 24, rnd() * Math.PI, 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = 1;
  }

  // ---- peintres de texture : (ctx, size, baseColor) ----
  const PAINTERS = {
    stone: (x, s, c) => {   // appareil de pierres avec joints clairs/ombrés
      x.fillStyle = shade(c, -18); x.fillRect(0, 0, s, s);
      const rows = 6, rh = s / rows;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? s / 8 : 0; const cols = 4, cw = s / cols;
        for (let k = -1; k < cols + 1; k++) {
          const bx = k * cw + off + 2, by = r * rh + 2, bw = cw - 4, bh = rh - 4;
          x.fillStyle = mix(c, shade(c, (rnd() - 0.5) * 18), 0.7); x.fillRect(bx, by, bw, bh);
          x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(bx, by, bw, 2); x.fillRect(bx, by, 2, bh);
          x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(bx, by + bh - 2, bw, 2); x.fillRect(bx + bw - 2, by, 2, bh);
        }
      }
      grain(x, s, 0.07, 700); blotches(x, s, '#000', 10, 0.06);
    },
    sandstone: (x, s, c) => {
      x.fillStyle = shade(c, -12); x.fillRect(0, 0, s, s);
      const rows = 5, rh = s / rows;
      for (let r = 0; r < rows; r++) { const off = r % 2 ? s / 6 : 0; for (let k = -1; k < 4; k++) { const bx = k * s / 3 + off + 1.5, by = r * rh + 1.5; x.fillStyle = mix(c, shade(c, (rnd() - 0.5) * 12), 0.6); x.fillRect(bx, by, s / 3 - 3, rh - 3); x.fillStyle = 'rgba(255,255,255,0.14)'; x.fillRect(bx, by, s / 3 - 3, 1.5); } }
      grain(x, s, 0.05, 900); blotches(x, s, '#a0702a', 12, 0.08);
    },
    marble: (x, s, c) => {
      x.fillStyle = c; x.fillRect(0, 0, s, s);
      blotches(x, s, '#ffffff', 14, 0.18); blotches(x, s, '#b8b0a4', 10, 0.1);
      x.strokeStyle = 'rgba(120,110,100,0.35)'; x.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) { x.beginPath(); let px = rnd() * s, py = rnd() * s; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (rnd() - 0.5) * 60; py += (rnd() - 0.3) * 40; x.lineTo(px, py); } x.stroke(); }
      x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2; for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(0, i * s / 3); x.lineTo(s, i * s / 3); x.stroke(); }
      grain(x, s, 0.03, 400);
    },
    plaster: (x, s, c) => { x.fillStyle = c; x.fillRect(0, 0, s, s); grain(x, s, 0.06, 1400); blotches(x, s, shade(c, -20), 14, 0.08); blotches(x, s, '#fff', 8, 0.08); },
    planks: (x, s, c) => {   // planches verticales
      const n = 6, pw = s / n;
      for (let i = 0; i < n; i++) {
        x.fillStyle = mix(c, shade(c, (rnd() - 0.5) * 24), 0.7); x.fillRect(i * pw, 0, pw, s);
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i * pw, 0, 2, s);
        x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(i * pw + 2, 0, 2, s);
        x.strokeStyle = 'rgba(0,0,0,0.15)'; x.lineWidth = 1;
        for (let k = 0; k < 4; k++) { x.beginPath(); const gx = i * pw + 6 + rnd() * (pw - 12); x.moveTo(gx, 0); x.bezierCurveTo(gx + 4, s * 0.3, gx - 4, s * 0.7, gx + 2, s); x.stroke(); }
      }
      grain(x, s, 0.05, 500);
    },
    logs: (x, s, c) => {   // rondins horizontaux
      const n = 5, lh = s / n;
      for (let i = 0; i < n; i++) {
        const g = x.createLinearGradient(0, i * lh, 0, (i + 1) * lh); g.addColorStop(0, shade(c, 18)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, -30));
        x.fillStyle = g; x.fillRect(0, i * lh, s, lh);
        x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(0, i * lh, s, 2);
      }
      grain(x, s, 0.05, 400);
    },
    thatch: (x, s, c) => {
      x.fillStyle = shade(c, -22); x.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i++) { x.strokeStyle = mix(c, shade(c, (rnd() - 0.5) * 50), 0.7); x.globalAlpha = 0.8; x.lineWidth = 1 + rnd() * 1.5; const px = rnd() * s, py = rnd() * s; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - 0.5) * 6, py + 10 + rnd() * 16); x.stroke(); }
      x.globalAlpha = 1;
      for (let r = 0; r < 4; r++) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, r * s / 4 + s / 4 - 4, s, 4); }
    },
    tiles: (x, s, c) => {   // tuiles canal
      x.fillStyle = shade(c, -28); x.fillRect(0, 0, s, s);
      const rows = 7, rh = s / rows, cols = 7, cw = s / cols;
      for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) {
        const off = r % 2 ? cw / 2 : 0; const bx = k * cw + off, by = r * rh;
        const g = x.createLinearGradient(bx, 0, bx + cw, 0); g.addColorStop(0, shade(c, -22)); g.addColorStop(0.4, shade(c, 12)); g.addColorStop(1, shade(c, -18));
        x.fillStyle = g; x.beginPath(); x.moveTo(bx, by + rh); x.lineTo(bx, by + 3); x.quadraticCurveTo(bx + cw / 2, by - 5, bx + cw, by + 3); x.lineTo(bx + cw, by + rh); x.closePath(); x.fill();
        x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(bx, by + rh - 2, cw, 2);
      }
      grain(x, s, 0.05, 400);
    },
    slate: (x, s, c) => {
      x.fillStyle = shade(c, -20); x.fillRect(0, 0, s, s);
      const rows = 8, rh = s / rows, cols = 6, cw = s / cols;
      for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) { const off = r % 2 ? cw / 2 : 0; x.fillStyle = mix(c, shade(c, (rnd() - 0.5) * 20), 0.7); x.fillRect(k * cw + off + 1, r * rh + 1, cw - 2, rh - 2); x.fillStyle = 'rgba(255,255,255,0.1)'; x.fillRect(k * cw + off + 1, r * rh + 1, cw - 2, 1.5); }
      grain(x, s, 0.05, 400);
    },
    hide: (x, s, c) => {   // feutre / peaux cousues
      x.fillStyle = c; x.fillRect(0, 0, s, s); grain(x, s, 0.09, 1600); blotches(x, s, shade(c, -24), 16, 0.12);
      x.strokeStyle = 'rgba(40,24,12,0.55)'; x.lineWidth = 1.5; x.setLineDash([4, 4]);
      for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(0, i * s / 3); x.lineTo(s, i * s / 3); x.stroke(); x.beginPath(); x.moveTo(i * s / 3, 0); x.lineTo(i * s / 3, s); x.stroke(); }
      x.setLineDash([]);
    },
    mosaic: (x, s, c) => {
      const n = 10, cw = s / n; const pal = [c, shade(c, 18), shade(c, -18), '#e8c547', '#f6f0e2'];
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) { x.fillStyle = pal[(r * 3 + k * 7 + ((r + k) % 2) * 2) % pal.length]; x.fillRect(k * cw + 1, r * cw + 1, cw - 2, cw - 2); }
      x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i <= n; i++) { x.fillRect(i * cw - 0.5, 0, 1, s); x.fillRect(0, i * cw - 0.5, s, 1); }
    },
    cloth: (x, s, c) => { x.fillStyle = c; x.fillRect(0, 0, s, s); grain(x, s, 0.05, 900); x.strokeStyle = 'rgba(0,0,0,0.08)'; x.lineWidth = 1; for (let i = 0; i < s; i += 6) { x.beginPath(); x.moveTo(0, i); x.lineTo(s, i); x.stroke(); } },
    metal: (x, s, c) => { const g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, shade(c, 22)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, -24)); x.fillStyle = g; x.fillRect(0, 0, s, s); grain(x, s, 0.04, 400); },
    gold: (x, s, c) => { const g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#ffe9a0'); g.addColorStop(0.45, c); g.addColorStop(1, '#8a5a14'); x.fillStyle = g; x.fillRect(0, 0, s, s); grain(x, s, 0.04, 300); },
    grass: (x, s, c) => { x.fillStyle = c; x.fillRect(0, 0, s, s); blotches(x, s, shade(c, 18), 16, 0.3); blotches(x, s, shade(c, -16), 14, 0.25); for (let i = 0; i < 700; i++) { x.strokeStyle = shade(c, -28 + rnd() * 50); x.lineWidth = 1; const px = rnd() * s, py = rnd() * s; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 1, py - 4, px + (rnd() - 0.5) * 4, py - 7); x.stroke(); } },
    dirt: (x, s, c) => { x.fillStyle = c; x.fillRect(0, 0, s, s); grain(x, s, 0.1, 1800); blotches(x, s, shade(c, -18), 18, 0.14); blotches(x, s, shade(c, 14), 12, 0.12); for (let i = 0; i < 40; i++) { x.fillStyle = shade(c, -30 + rnd() * 20); x.beginPath(); x.ellipse(rnd() * s, rnd() * s, 2 + rnd() * 3, 1 + rnd() * 2, 0, 0, Math.PI * 2); x.fill(); } },
    sand: (x, s, c) => { x.fillStyle = c; x.fillRect(0, 0, s, s); grain(x, s, 0.06, 1800); x.strokeStyle = 'rgba(120,90,40,0.18)'; x.lineWidth = 1.5; for (let i = 0; i < 14; i++) { x.beginPath(); const py = rnd() * s; x.moveTo(0, py); x.quadraticCurveTo(s * 0.5, py + (rnd() - 0.5) * 30, s, py); x.stroke(); } },
    snow: (x, s, c) => { x.fillStyle = c; x.fillRect(0, 0, s, s); blotches(x, s, '#ffffff', 16, 0.5); blotches(x, s, '#c4d2e0', 10, 0.25); grain(x, s, 0.03, 500); for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(rnd() * s, rnd() * s, 1 + rnd() * 1.5, 0, Math.PI * 2); x.fill(); } },
    water: (x, s, c) => { x.fillStyle = c; x.fillRect(0, 0, s, s); blotches(x, s, '#9fd0ff', 12, 0.35); x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 1.5; for (let i = 0; i < 12; i++) { x.beginPath(); const px = rnd() * s, py = rnd() * s; x.moveTo(px, py); x.quadraticCurveTo(px + 12, py - 3, px + 24, py); x.stroke(); } },
    wheat: (x, s, c) => { x.fillStyle = shade(c, -30); x.fillRect(0, 0, s, s); for (let i = 0; i < 2200; i++) { x.strokeStyle = mix(c, shade(c, (rnd() - 0.5) * 40), 0.7); x.lineWidth = 1.2; const px = rnd() * s, py = rnd() * s; x.beginPath(); x.moveTo(px, py + 8); x.lineTo(px + (rnd() - 0.5) * 3, py - 6); x.stroke(); x.fillStyle = shade(c, 16); x.fillRect(px - 1, py - 8, 2.5, 4); } },
    leaves: (x, s, c) => { x.fillStyle = shade(c, -14); x.fillRect(0, 0, s, s); for (let i = 0; i < 900; i++) { x.fillStyle = mix(c, shade(c, (rnd() - 0.5) * 50), 0.7); x.beginPath(); x.ellipse(rnd() * s, rnd() * s, 3 + rnd() * 5, 2 + rnd() * 3, rnd() * Math.PI, 0, Math.PI * 2); x.fill(); } blotches(x, s, '#000', 8, 0.1); },
    bark: (x, s, c) => { x.fillStyle = c; x.fillRect(0, 0, s, s); x.strokeStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 40; i++) { x.lineWidth = 1 + rnd() * 2; x.beginPath(); const px = rnd() * s; x.moveTo(px, 0); x.bezierCurveTo(px + 6, s * 0.3, px - 6, s * 0.6, px + 3, s); x.stroke(); } grain(x, s, 0.06, 600); },
    flat: (x, s, c) => { x.fillStyle = c; x.fillRect(0, 0, s, s); grain(x, s, 0.03, 300); }
  };

  // Matériau : { kind, color, rough, metal, emissive, size }
  function material(kind, color, opts = {}) {
    const key = `${kind}|${color}|${opts.rough ?? ''}|${opts.metal ?? ''}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}|${opts.flat ? 1 : 0}|${opts.transparent ? opts.opacity ?? 0.85 : ''}|${opts.side ?? ''}|${opts.size ?? ''}`;
    if (cache.has(key)) return cache.get(key);
    resetSeed(1234 + key.length * 31 + kind.charCodeAt(0) * 7);
    const painter = PAINTERS[kind] || PAINTERS.flat;
    const map = canvasTex(opts.size || 256, (x, s) => painter(x, s, color));
    const mat = new T.MeshStandardMaterial({ map, roughness: opts.rough ?? 0.88, metalness: opts.metal ?? 0, flatShading: !!opts.flat });
    if (opts.emissive) { mat.emissive = new T.Color(opts.emissive); mat.emissiveIntensity = opts.emissiveIntensity ?? 0.6; }
    if (opts.side) mat.side = opts.side;
    if (opts.transparent) { mat.transparent = true; mat.opacity = opts.opacity ?? 0.85; }
    cache.set(key, mat);
    return mat;
  }
  function solid(color, opts = {}) { return material('flat', color, Object.assign({ rough: 0.9 }, opts)); }

  window.TEX = { material, solid, shade, mix, hexToRgb, rgbToHex, resetSeed, rnd };
})();
