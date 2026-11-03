#!/usr/bin/env node
// ============================================================================
// guides-villes.cjs — images guides des villes avant la livraison des images (décision du propriétaire, 3 novembre 2026) :
// 1. la vue de la ville (capitale 18 emplacements, colonie 12) : chaque emplacement numéroté, à sa place exacte dans le jeu
//    (mêmes plans que frontend/js/app/04b-iso-scene.js : ISO_PLANS, espacement ISO_SP, parcelle ISO_PLOT), les 18 champs,
//    l'enceinte et la porte au sud-est ;
// 2. les villes de la carte (village, ville, capitale fortifiée, colonie, colonie fortifiée) : l'emprise de 2 × 2 cases au
//    cadrage exact des sprites de ville de la carte (docs/img/guides-carte/guide-ville.png), avec le plan de la ville dedans.
//   node tools/guides-villes.cjs            -> docs/img/guides-villes/*.png
// ============================================================================
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'img', 'guides-villes');
// les plans de la ville tels que le jeu les dessine (lus dans le client, pas recopiés)
const src = fs.readFileSync(path.join(ROOT, 'frontend/js/app/04b-iso-scene.js'), 'utf8');
const plansSrc = src.slice(src.indexOf('const ISO_PLANS'), src.indexOf('const ISO_FIELD_TYPE'));
const num = (re) => Number(src.match(re)[1]);
const C = { SP: num(/const ISO_SP = ([\d.]+)/), PLOT: num(/const ISO_PLOT = ([\d.]+)/), HALL: num(/const ISO_MAIN_HALL_SCALE = ([\d.]+)/) };
const PLANS = new Function(plansSrc + '; return ISO_PLANS;')();

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(); const page = await b.newPage();
  const shots = await page.evaluate(({ PLANS, C }) => {
    const out = {};
    const FIELD = (s) => s <= 4 ? ['Bûcheron', '#3f7d2c'] : s <= 8 ? ['Carrière', '#7d7468'] : s <= 12 ? ['Mine de fer', '#4b5a73'] : ['Ferme', '#c9a227'];
    const gateOf = (plan) => { const gi = Math.round((plan.wall + plan.lane) / (2 * plan.wall) * plan.segments - 0.5); return -plan.wall + 2 * plan.wall * (gi + 0.5) / plan.segments; };
    // ---- 1. vue de la ville ----
    for (const [name, plan, n] of [['capitale', PLANS[1], 18], ['colonie', PLANS[0], 12]]) {
      const Wc = 2400, Hc = 1500, cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc; const x = cv.getContext('2d');
      x.fillStyle = '#e9e2cf'; x.fillRect(0, 0, Wc, Hc);
      const W = 150, cx = Wc / 2, cy = Hc / 2 + 40;
      const P = (gx, gy) => ({ x: cx + (gx - gy) * W * C.SP / 2, y: cy + (gx + gy) * W * C.SP / 4 });
      const dia = (p, hw, hh, fill, stroke, lw = 3, dash) => { x.beginPath(); x.moveTo(p.x - hw, p.y); x.lineTo(p.x, p.y - hh); x.lineTo(p.x + hw, p.y); x.lineTo(p.x, p.y + hh); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.setLineDash(dash || []); x.strokeStyle = stroke; x.lineWidth = lw; x.stroke(); x.setLineDash([]); } };
      // enceinte (losange de demi-côté wall) et porte sur l'arête sud-est (gx = wall)
      const wl = plan.wall, corners = [P(-wl, -wl), P(wl, -wl), P(wl, wl), P(-wl, wl)];
      x.beginPath(); corners.forEach((c, i) => i ? x.lineTo(c.x, c.y) : x.moveTo(c.x, c.y)); x.closePath(); x.fillStyle = '#d8ccab'; x.fill(); x.strokeStyle = '#7a4a1f'; x.lineWidth = 10; x.stroke();
      const g = gateOf(plan), gp = P(wl, g);
      x.fillStyle = '#c0392b'; x.beginPath(); x.arc(gp.x, gp.y, 22, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('P', gp.x, gp.y);
      // plaza
      dia(P(0, 0), plan.plaza * W * C.SP, plan.plaza * W * C.SP / 2, '#cbbd96', '#a08c5c', 2);
      const hw = W * C.PLOT / 2, hh = W * C.PLOT / 4;
      // champs 101-118
      plan.fields.forEach(([gx, gy], i) => { const s = i + 1, [lab, col] = FIELD(s), p = P(gx, gy); dia(p, hw, hh, col + '55', col, 3); x.fillStyle = '#222'; x.font = 'bold 24px sans-serif'; x.fillText(String(100 + s), p.x, p.y - 6); x.font = '15px sans-serif'; x.fillText(lab, p.x, p.y + 15); });
      // bâtiment principal (0) et anneau 1..n
      const hp = P(0, 0); dia(hp, hw * C.HALL, hh * C.HALL, '#f3d36b', '#8a6d10', 4); x.fillStyle = '#222'; x.font = 'bold 30px sans-serif'; x.fillText('0', hp.x, hp.y - 8); x.font = '15px sans-serif'; x.fillText('Bâtiment principal', hp.x, hp.y + 16);
      plan.ring.slice(0, n).forEach(([gx, gy], i) => { const p = P(gx, gy); dia(p, hw, hh, '#ffffffcc', '#1e5aa8', 4); x.fillStyle = '#1e5aa8'; x.font = 'bold 32px sans-serif'; x.fillText(String(i + 1), p.x, p.y); });
      // repères : nord, sud-est (porte), légende
      x.textAlign = 'left'; x.fillStyle = '#222'; x.font = 'bold 40px sans-serif';
      x.fillText(name === 'capitale' ? 'Capitale — 18 emplacements de bâtiment + Bâtiment principal + 18 champs' : 'Colonie — 12 emplacements de bâtiment + Bâtiment principal + 18 champs', 40, 60);
      x.font = '26px sans-serif';
      ['Bleu : emplacement de bâtiment (numéro du jeu). Doré : Bâtiment principal, 1,35 × plus grand.', 'Couleurs : champs 101-104 Bûcherons, 105-108 Carrières, 109-112 Mines de fer, 113-118 Fermes.', 'Marron : enceinte. P : la porte, au sud-est (en bas à droite), en face de l\'avenue.', `Chaque parcelle est un losange 2:1 ; un bâtiment se dessine posé dessus, entrée vers le bas à droite (sud-est).`].forEach((t, i) => x.fillText(t, 40, 110 + i * 36));
      out['ville-' + name] = cv.toDataURL('image/png');
    }
    // ---- 2. villes de la carte : 1024 × 1024, emprise 2 × 2 cases (centre 512, 695 ; demi-axes 462 × 231) ----
    const tiers = [
      ['carte-village', PLANS[1], 18, 'none', 'Village (Bâtiment principal 1 à 9) : sans mur, maisons basses'],
      ['carte-ville', PLANS[1], 18, 'low', 'Ville (Bâtiment principal 10 à 19) : premier mur bas'],
      ['carte-capitale-fortifiee', PLANS[1], 18, 'high', 'Capitale fortifiée (Bâtiment principal 20) : grandes murailles et tours'],
      ['carte-colonie', PLANS[0], 12, 'low', 'Colonie : plus petite que la ville de départ, mur bas'],
      ['carte-colonie-fortifiee', PLANS[0], 12, 'high', 'Colonie fortifiée (Bâtiment principal 20) : murailles plus modestes que la capitale']
    ];
    for (const [name, plan, n, wall, label] of tiers) {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024; const x = cv.getContext('2d');
      x.fillStyle = '#8c8c8c'; x.fillRect(0, 0, 1024, 1024);
      const cx = 512, cy = 695, HW = 462, HH = 231;
      const dia = (px, py, hw, hh, fill, stroke, lw, dash) => { x.beginPath(); x.moveTo(px - hw, py); x.lineTo(px, py - hh); x.lineTo(px + hw, py); x.lineTo(px, py + hh); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.setLineDash(dash || []); x.strokeStyle = stroke; x.lineWidth = lw; x.stroke(); x.setLineDash([]); } };
      dia(cx, cy, HW, HH, null, '#e0312b', 6);   // emprise 2 × 2 cases
      x.strokeStyle = '#e0312b88'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - HW / 2, cy - HH / 2); x.lineTo(cx + HW / 2, cy + HH / 2); x.moveTo(cx + HW / 2, cy - HH / 2); x.lineTo(cx - HW / 2, cy + HH / 2); x.stroke();
      // le plan de la ville dans l'emprise : l'enceinte occupe 88 % de l'emprise
      const k = 0.9 * HW / PLANS[1].wall;   // px par cellule de grille : l'enceinte de la capitale occupe 90 % de l'emprise ; la colonie, plus petite, garde son échelle (comme dans le jeu)
      const P = (gx, gy) => ({ x: cx + (gx - gy) * k / 2, y: cy + (gx + gy) * k / 4 });
      const R = plan.wall * 2 / 2;
      const wc = [P(-R, -R), P(R, -R), P(R, R), P(-R, R)];
      x.beginPath(); wc.forEach((c, i) => i ? x.lineTo(c.x, c.y) : x.moveTo(c.x, c.y)); x.closePath();
      x.fillStyle = '#b8ab8a66'; x.fill();
      if (wall !== 'none') { x.strokeStyle = '#5b3a1a'; x.lineWidth = wall === 'high' ? 12 : 5; x.stroke(); }
      else { x.setLineDash([10, 10]); x.strokeStyle = '#5b3a1a99'; x.lineWidth = 3; x.stroke(); x.setLineDash([]); }
      if (wall === 'high') for (const c of wc) { x.fillStyle = '#5b3a1a'; x.fillRect(c.x - 12, c.y - 30, 24, 30); }
      const gp = P(R, gateOf(plan)); x.fillStyle = '#c0392b'; x.beginPath(); x.arc(gp.x, gp.y, 12, 0, 7); x.fill();
      const hw = k * C.PLOT / 2, hh = hw / 2;
      plan.fields.forEach(([gx, gy]) => { const p = P(gx / C.SP * C.SP, gy); dia(p.x, p.y, hw * 0.8, hh * 0.8, '#6e9a4a88', null); });
      plan.ring.slice(0, n).forEach(([gx, gy], i) => { const p = P(gx, gy); dia(p.x, p.y, hw * 0.8, hh * 0.8, '#ffffffaa', '#1e5aa8', 2); x.fillStyle = '#1e5aa8'; x.font = 'bold 15px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), p.x, p.y); });
      const hp = P(0, 0); dia(hp.x, hp.y, hw * C.HALL * 0.8, hh * C.HALL * 0.8, '#f3d36b', '#8a6d10', 3);
      // hauteur utile : les bâtiments montent dans le haut de l'image (jusqu'à 120 px du bord)
      x.setLineDash([8, 8]); x.strokeStyle = '#ffffffaa'; x.lineWidth = 2; x.beginPath(); x.moveTo(40, 120); x.lineTo(984, 120); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#fff'; x.font = 'bold 26px sans-serif'; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillText(label, 30, 50);
      x.font = '19px sans-serif'; x.fillText('Rouge : emprise 2 × 2 cases (la ville s\'y pose, rien ne dépasse à gauche, à droite ni en bas).', 30, 82);
      x.fillText('Pointillé blanc : hauteur maximale des toits et des tours. Point rouge : la porte (sud-est).', 30, 106);
      x.fillText(`Bleu : les ${n} emplacements de bâtiment du jeu ; doré : Bâtiment principal ; vert : champs.`, 30, 1000);
      out[name] = cv.toDataURL('image/png');
    }
    return out;
  }, { PLANS, C });
  for (const [n, d] of Object.entries(shots)) fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(d.split(',')[1], 'base64'));
  await b.close();
  console.log(Object.keys(shots).length, 'guides dans', path.relative(ROOT, OUT));
}
main().catch(e => { console.error(e); process.exit(1); });
