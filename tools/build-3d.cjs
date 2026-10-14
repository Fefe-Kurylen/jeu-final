#!/usr/bin/env node
// ============================================================================
// build-3d.cjs — rend tous les sprites 2.5D du jeu (modèles 3D éclairés, ombres, contour) en WebP,
// via Three.js dans Chromium headless (Playwright). Sorties : frontend/assets/images/3d/**.
//
//   node tools/build-3d.cjs                 -> tout
//   node tools/build-3d.cjs --only=ROME/MAIN  (filtre regex sur l'identifiant du travail)
//   node tools/build-3d.cjs --sheet          (planche de contrôle PNG dans tools/render3d/out/)
//   node tools/build-3d.cjs --workers=3
//   node tools/build-3d.cjs --manifest-only (réécrit 3d/manifest.json et 3d/map/manifest.json sans rendre)
// Prérequis : npm i -D playwright three ; npx playwright install chromium
// ============================================================================
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright requis : npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'frontend', 'assets', 'images', '3d');
const SRC = path.join(__dirname, 'render3d');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const only = args.only ? new RegExp(args.only) : null;
const workers = Math.max(1, Math.min(4, parseInt(args.workers, 10) || 3));

// Three.js (module ESM) exposé en global : le bloc `export { … }` final devient window.THREE
function threeShim() {
  const src = fs.readFileSync(path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js'), 'utf8');
  const i = src.lastIndexOf('export {');
  const names = src.slice(i).replace(/^export \{/, '').replace(/\};?\s*$/, '').split(',').map(s => s.trim()).filter(Boolean).map(s => s.split(' as ').pop());
  return src.slice(0, i) + `\nwindow.THREE = { ${names.join(', ')} };\n`;
}
const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent"><canvas id="c" width="260" height="360"></canvas></body></html>`;

async function makePage(browser) {
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('console:', m.text().slice(0, 300)); });
  await page.setContent(PAGE);
  await page.addScriptTag({ content: threeShim(), type: 'module' });
  await page.waitForFunction(() => !!window.THREE);
  for (const f of fs.readdirSync(SRC).filter(f => /^\d\d-.*\.js$/.test(f)).sort()) await page.addScriptTag({ content: fs.readFileSync(path.join(SRC, f), 'utf8') });
  await page.waitForFunction(() => !!window.JOBS && !!window.R3D);
  return page;
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const first = await makePage(browser);
  let jobs = await first.evaluate(() => window.JOBS.list());
  if (only) jobs = jobs.filter(j => only.test(j.id));
  console.log(`${jobs.length} sprites à rendre (${workers} rendus en parallèle)`);
  const manifestOnly = !!args['manifest-only'];   // ne rend rien : réécrit seulement les manifestes à partir de la liste des rendus
  const pages = [first];
  if (!manifestOnly) for (let i = 1; i < Math.min(workers, jobs.length); i++) pages.push(await makePage(browser));
  const manifest = {};
  let done = 0, next = 0;
  const failures = [];
  async function worker(page) {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (manifestOnly) { if (fs.existsSync(path.join(OUT, job.out))) (manifest[job.category] = manifest[job.category] || []).push(job.out); else failures.push(job.id + ': fichier absent'); done++; continue; }
      try {
        const data = await page.evaluate(async (j) => {
          const fn = window.MODELS[j.model];
          if (!fn) throw new Error('modèle inconnu ' + j.model);
          return await window.R3D.renderJob({ frame: j.frame, build: (g) => fn(g, ...(j.args || [])), cam: j.cam, quality: j.quality, format: j.format });
        }, job);
        const file = path.join(OUT, job.out);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
        (manifest[job.category] = manifest[job.category] || []).push(job.out);
      } catch (e) { failures.push(job.id + ': ' + e.message.split('\n')[0]); }
      done++;
      if (done % 25 === 0 || done === jobs.length) process.stdout.write(`\r  ${done}/${jobs.length}  ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  }
  await Promise.all(pages.map(worker));
  console.log('');
  const frames = await first.evaluate(() => window.R3D.FRAMES);
  if (!only) {
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), scale: 2, frames, categories: Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, v.sort()])) }, null, 1));
    // Manifeste de la carte (lu par frontend/js/map.js) : noms disponibles par catégorie, ancre du cadre
    const map = { format: 'webp', scale: 2, anchor: { x: frames.map.ax, y: frames.map.ay }, cities: [], resources: [], units: [], terrain: [] };
    for (const j of jobs) { const m = j.out.match(/^map\/(cities|resources|units|terrain)\/([^/]+)\.webp$/); if (m && !failures.some(f => f.startsWith(j.id + ':'))) map[m[1]].push(m[2]); }
    fs.writeFileSync(path.join(OUT, 'map', 'manifest.json'), JSON.stringify(map, null, 1));
  }
  if (failures.length) { console.error('Échecs :\n  ' + failures.join('\n  ')); }
  if (args.sheet) {
    const outDir = path.join(SRC, 'out'); fs.mkdirSync(outDir, { recursive: true });
    const files = jobs.filter(j => !failures.some(f => f.startsWith(j.id + ':'))).map(j => ({ id: j.id, file: path.join(OUT, j.out) }));
    const cell = 150;
    const html = `<body style="margin:0;background:#2f3e2a;font:10px sans-serif;color:#fff"><div style="display:flex;flex-wrap:wrap">` + files.map(f => `<div style="width:${cell}px;text-align:center;margin:3px"><img src="data:image/webp;base64,${fs.readFileSync(f.file).toString('base64')}" style="max-width:${cell - 6}px;max-height:${cell - 6}px;background:rgba(0,0,0,0.15)"><br>${f.id}</div>`).join('') + '</div></body>';
    const sheet = await browser.newPage({ viewport: { width: 1560, height: 900 } });
    await sheet.setContent(html); await sheet.waitForTimeout(300);
    const name = (args.sheet === true ? 'sheet' : String(args.sheet)) + '.png';
    await sheet.screenshot({ path: path.join(outDir, name), fullPage: true });
    console.log('planche :', path.join(outDir, name));
  }
  await browser.close();
  console.log(`${jobs.length - failures.length} sprites rendus en ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
