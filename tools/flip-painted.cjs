#!/usr/bin/env node
// Retourne horizontalement des images peintes (miroir gauche-droite), par exemple pour passer les bâtiments peints avec
// l'entrée au sud-ouest à l'orientation sud-est du jeu (octobre 2026). Le miroir gauche-droite d'un sprite iso vu à 45°
// est exactement la réflexion du modèle par le plan de la caméra : le losange au sol et le cadre ne bougent pas.
//   node tools/flip-painted.cjs <motif regex sur le chemin relatif> [--dry]
//   ex. node tools/flip-painted.cjs '^buildings/'
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const PAINTED = path.join(ROOT, 'frontend', 'assets', 'images', 'painted');
const re = new RegExp(process.argv[2] || '^$');
const dry = process.argv.includes('--dry');
const manifest = JSON.parse(fs.readFileSync(path.join(PAINTED, 'manifest.json'), 'utf8'));
const files = manifest.files.filter(f => re.test(f) && fs.existsSync(path.join(PAINTED, f)));
console.log(`${files.length} image(s) à retourner`);
if (dry || !files.length) process.exit(0);
(async () => {
  const b = await chromium.launch(); const page = await b.newPage(); await page.setContent('<!doctype html><body></body>');
  let n = 0;
  for (const f of files) {
    const src = path.join(PAINTED, f);
    const out = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/webp;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.translate(img.width, 0); x.scale(-1, 1); x.drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.92).split(',')[1];
    }, fs.readFileSync(src).toString('base64'));
    fs.writeFileSync(src, Buffer.from(out, 'base64'));
    if (++n % 25 === 0) process.stdout.write(`\r  ${n}/${files.length}`);
  }
  await b.close();
  console.log(`\r${n} image(s) retournée(s)`);
})();
