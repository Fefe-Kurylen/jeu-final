#!/usr/bin/env node
// Retourne horizontalement des images peintes (miroir gauche-droite). Utilisé une fois, en octobre 2026, pour passer les
// bâtiments peints avec l'entrée au sud-ouest à l'orientation sud-est du jeu. Le miroir d'un sprite iso vu à 45° est la
// réflexion du modèle par le plan de la caméra pour la forme (losange au sol et cadre inchangés), mais il retourne aussi
// la lumière peinte : ombres à gauche au lieu de la droite. Seule une nouvelle peinture depuis les guides sud-est corrige ça.
// Idempotent : les fichiers déjà retournés sont notés dans tools/repaint/oriented-se.json et ne sont jamais retournés deux
// fois (une image livrée au sud-est n'y figure pas et n'est pas concernée : ne lancez l'outil que sur d'anciennes images).
//   node tools/flip-painted.cjs <motif regex sur le chemin relatif> [--raw] [--dry]
//   --raw : retourne aussi la réponse brute tools/repaint/raw/<fichier>.png, pour qu'un --reprocess reste cohérent
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const PAINTED = path.join(ROOT, 'frontend', 'assets', 'images', 'painted');
const RAW = path.join(__dirname, 'repaint', 'raw');
const LOG = path.join(__dirname, 'repaint', 'oriented-se.json');
const re = new RegExp(process.argv[2] || '^$');
const dry = process.argv.includes('--dry'), raw = process.argv.includes('--raw'), rawOnly = process.argv.includes('--raw-only');
const log = Object.assign({ note: 'Images peintes retournées vers le sud-est par tools/flip-painted.cjs', files: [], raw: [], keep: [] }, fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : {});   // keep : déjà au sud-est, jamais retournées
const manifest = JSON.parse(fs.readFileSync(path.join(PAINTED, 'manifest.json'), 'utf8'));
const files = rawOnly ? [] : manifest.files.filter(f => re.test(f) && fs.existsSync(path.join(PAINTED, f)) && !log.files.includes(f) && !log.keep.includes(f));
const rawFiles = (raw || rawOnly) ? log.files.concat(files).filter(f => re.test(f) && !log.raw.includes(f) && fs.existsSync(path.join(RAW, f.replace(/\.webp$/, '.png')))) : [];
console.log(`${files.length} image(s) peinte(s) et ${rawFiles.length} réponse(s) brute(s) à retourner`);
if (dry || (!files.length && !rawFiles.length)) process.exit(0);
(async () => {
  const b = await chromium.launch(); const page = await b.newPage(); await page.setContent('<!doctype html><body></body>');
  const flip = (b64, mime, outMime) => page.evaluate(async ({ b64, mime, outMime }) => {
    const img = new Image(); img.src = `data:${mime};base64,` + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.translate(img.width, 0); x.scale(-1, 1); x.drawImage(img, 0, 0);
    return outMime === 'image/png' ? c.toDataURL('image/png').split(',')[1] : c.toDataURL('image/webp', 0.92).split(',')[1];
  }, { b64, mime, outMime });
  for (const f of files) { const p = path.join(PAINTED, f); fs.writeFileSync(p, Buffer.from(await flip(fs.readFileSync(p).toString('base64'), 'image/webp', 'image/webp'), 'base64')); log.files.push(f); }
  for (const f of rawFiles) { const p = path.join(RAW, f.replace(/\.webp$/, '.png')); fs.writeFileSync(p, Buffer.from(await flip(fs.readFileSync(p).toString('base64'), 'image/png', 'image/png'), 'base64')); log.raw.push(f); }
  await b.close();
  log.files.sort(); log.raw.sort();
  fs.writeFileSync(LOG, JSON.stringify(log, null, 1) + '\n');
  console.log(`${files.length} image(s) et ${rawFiles.length} réponse(s) brute(s) retournée(s) ; journal : ${path.relative(ROOT, LOG)}`);
})();
