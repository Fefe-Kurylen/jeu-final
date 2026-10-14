#!/usr/bin/env node
// ============================================================================
// repaint.cjs — repeint les sprites rendus en 3D dans le style d'une illustration de référence
// (tools/repaint/style-ref.png) avec l'API d'images d'OpenAI (gpt-image-1, édition guidée par image) : le rendu
// 3D sert de guide de composition (angle, cadrage, proportions), l'illustration de référence fixe le style.
// Le résultat est recalé sur le cadre et l'ancre du sprite puis écrit dans frontend/assets/images/painted/
// (même arborescence que 3d/) ; le client préfère automatiquement un sprite peint quand il existe
// (painted/manifest.json). Murs, drapeaux, effets, icônes, habillage et bustes restent en rendu 3D.
//
//   OPENAI_API_KEY=sk-… node tools/repaint.cjs                      -> toutes les cibles manquantes
//   node tools/repaint.cjs --only='^buildings/ROME/' --quality=high  -> filtre (regex sur le chemin), qualité low|medium|high
//   node tools/repaint.cjs --dry --limit=6                           -> sans appel API : guides + prompts dans tools/repaint/out/
//   node tools/repaint.cjs --cats=buildings,fields --workers=2 --force
//   node tools/repaint.cjs --reprocess                               -> recalage seul, à partir des réponses brutes conservées
//   node tools/repaint.cjs --manifest-only                           -> réécrit painted/manifest.json
//   node tools/repaint.cjs --mock --only=…                           -> sans appel API : le guide tient lieu de réponse (test du recalage)
// Les réponses brutes de l'API sont conservées dans tools/repaint/raw/ (pas de nouvel appel pour re-traiter).
// ============================================================================
const fs = require('fs');
const path = require('path');
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {   // fetch passe par le proxy d'environnement
  const r = require('child_process').spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } });
  process.exit(r.status ?? 1);
}
const { promptFor } = require('./repaint/prompts.cjs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright requis : npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'frontend', 'assets', 'images', '3d');
const OUT = path.join(ROOT, 'frontend', 'assets', 'images', 'painted');
const RAW = path.join(__dirname, 'repaint', 'raw');
const DRY = path.join(__dirname, 'repaint', 'out');
const STYLE_REF = path.join(__dirname, 'repaint', 'style-ref.png');
const API = 'https://api.openai.com/v1/images/edits';
const COST = { low: 0.006, medium: 0.053, high: 0.211, xhigh: 0.4, max: 0.8 };   // $ par image 1024×1024 (tarif gpt-image-2 ; xhigh/max : ordre de grandeur) ; ×0,8 en format allongé

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const DEFAULT_CATS = ['buildings', 'fields', 'plots', 'props', 'map', 'heroes', 'figures', 'scenes'];
const cats = args.cats ? String(args.cats).split(',') : DEFAULT_CATS;
const quality = ['low', 'medium', 'high', 'xhigh', 'max'].includes(args.quality) ? args.quality : 'high';
const MODEL = args.model || 'gpt-image-2.5-sunburst';   // --model=gpt-image-2.5-flare | gpt-image-2 | gpt-image-1.5 …
const TAG = args.tag ? String(args.tag) : null;   // --tag=essai : sorties dans tools/repaint/out/<tag>/ (comparaison), rien dans painted/
const usage = { in: 0, inText: 0, out: 0, n: 0 };   // jetons consommés (tarif : 8 $/M image en entrée, 5 $/M texte, 30 $/M en sortie)
const usageCost = () => usage.in / 1e6 * 8 + usage.inText / 1e6 * 5 + usage.out / 1e6 * 30;
const workers = Math.max(1, Math.min(4, parseInt(args.workers, 10) || 2));
const only = args.only ? new RegExp(args.only) : null;
const limit = parseInt(args.limit, 10) || 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- cibles : fichiers du manifeste 3D dans les catégories choisies ----
const manifest3d = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
let targets = [];
for (const c of cats) for (const f of manifest3d.categories[c] || []) {
  if (c === 'map' && f.startsWith('map/units/')) continue;          // figurines de carte : trop petites, restent en 3D
  if (c === 'heroes' && f.endsWith('_bust.webp')) continue;        // bustes (jetons) : restent en 3D
  if (!promptFor(f)) continue;
  targets.push({ cat: c, file: f });
}
if (only) targets = targets.filter(t => only.test(t.file));
if (!args.force && !args.reprocess && !args['manifest-only'] && !TAG) targets = targets.filter(t => !fs.existsSync(path.join(OUT, t.file)));
if (limit) targets = targets.slice(0, limit);

// Taille de génération : carrée pour les sprites, portrait / paysage pour les scènes
function sizeFor(t) {
  if (t.cat !== 'scenes') return '1024x1024';
  const n = path.basename(t.file, '.webp');
  if (n === 'auth-portrait' || n.startsWith('hero-')) return '1024x1536';
  return '1536x1024';
}

// ---- composition du guide : le rendu 3D centré dans le canevas de génération, boîte alpha mémorisée ----
async function compose(page, srcPath, size) {
  const [W, H] = size.split('x').map(Number);
  const b64 = fs.readFileSync(srcPath).toString('base64');
  return page.evaluate(async ({ b64, W, H }) => {
    const img = new Image(); img.src = 'data:image/webp;base64,' + b64; await img.decode();
    const margin = 0.04;
    const k = Math.min(W * (1 - 2 * margin) / img.width, H * (1 - 2 * margin) / img.height);
    const dw = img.width * k, dh = img.height * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(img, ox, oy, dw, dh);
    const d = x.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (d[(j * W + i) * 4 + 3] > 40) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
    return { png: c.toDataURL('image/png').split(',')[1], k, ox, oy, sw: img.width, sh: img.height, bbox: [x0, y0, x1, y1] };
  }, { b64, W, H });
}

// ---- recalage : le résultat est aligné sur la boîte alpha du guide (largeur et bas-centre, échelle bornée),
// puis ramené au cadre d'origine du sprite ----
async function postProcess(page, resultB64, meta, size, align) {
  const [W, H] = size.split('x').map(Number);
  return page.evaluate(async ({ b64, meta, W, H, align }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
    let tx = 0, ty = 0, s = 1, drift = 0;
    if (align) {
      const d = x.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (d[(j * W + i) * 4 + 3] > 40) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
      if (x1 > x0) {
        const [gx0, gy0, gx1, gy1] = meta.bbox;
        s = Math.max(0.8, Math.min(1.25, (gx1 - gx0) / (x1 - x0)));
        tx = (gx0 + gx1) / 2 - (x0 + x1) / 2 * s; ty = gy1 - y1 * s;
        drift = Math.round(Math.hypot(tx, ty));
        void gy0;
      }
    }
    const out = document.createElement('canvas'); out.width = meta.sw; out.height = meta.sh;
    const o = out.getContext('2d');
    o.setTransform(1 / meta.k, 0, 0, 1 / meta.k, -meta.ox / meta.k, -meta.oy / meta.k);   // canevas de génération → cadre du sprite
    o.transform(s, 0, 0, s, tx, ty);                                                      // alignement dans le canevas
    o.drawImage(c, 0, 0);
    return { webp: out.toDataURL('image/webp', 0.9).split(',')[1], drift, s: Math.round(s * 100) / 100 };
  }, { b64: resultB64, meta, W, H, align });
}

// ---- appel API (réessais sur limitation de débit / erreur serveur) ----
async function callApi(prompt, guideB64, size) {
  for (let attempt = 1; ; attempt++) {
    const form = new FormData();
    form.append('model', MODEL); form.append('prompt', prompt); form.append('size', size); form.append('quality', quality);
    form.append('background', 'transparent'); form.append('output_format', 'png'); form.append('n', '1');
    form.append('image[]', new Blob([fs.readFileSync(STYLE_REF)], { type: 'image/png' }), 'style-ref.png');
    form.append('image[]', new Blob([Buffer.from(guideB64, 'base64')], { type: 'image/png' }), 'guide.png');
    const res = await fetch(API, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: form });
    if (res.ok) { const j = await res.json(); const u = j.usage || {}; usage.in += (u.input_tokens_details && u.input_tokens_details.image_tokens) || 0; usage.inText += (u.input_tokens_details && u.input_tokens_details.text_tokens) || 0; usage.out += u.output_tokens || 0; usage.n++; return j.data[0].b64_json; }
    const txt = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 6) { await sleep(3000 * 2 ** attempt); continue; }
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
}

function writeManifest() {
  const files = [];
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.webp')) files.push(path.relative(OUT, p).split(path.sep).join('/')); } };
  walk(OUT);
  files.sort();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, styleRef: 'tools/repaint/style-ref.png', files }, null, 1));
  return files.length;
}

(async () => {
  if (args['manifest-only']) { console.log(`${writeManifest()} sprites peints dans le manifeste`); return; }
  if (!args.dry && !args.reprocess && !args.mock && !process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY manquante (ou utilisez --dry pour préparer guides et prompts sans appel)'); process.exit(1); }
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  const est = targets.reduce((s, t) => s + COST[quality] * (sizeFor(t) === '1024x1024' ? 1 : 0.8), 0);
  console.log(`${targets.length} sprites à ${args.dry ? 'préparer' : args.reprocess ? 're-traiter' : 'repeindre'} (${MODEL}, qualité ${quality}${args.dry || args.reprocess ? '' : `, coût estimé ≈ ${est.toFixed(2)} $`})`);
  let next = 0, done = 0; const failures = [], drifts = [];
  async function worker() {
    while (next < targets.length) {
      const t = targets[next++];
      try {
        const size = sizeFor(t);
        const meta = await compose(page, path.join(SRC, t.file), size);
        const prompt = promptFor(t.file);
        const safe = t.file.replace(/\.webp$/, '').replace(/\//g, '__');
        if (args.dry) {
          fs.mkdirSync(DRY, { recursive: true });
          fs.writeFileSync(path.join(DRY, safe + '.guide.png'), Buffer.from(meta.png, 'base64'));
          fs.writeFileSync(path.join(DRY, safe + '.prompt.txt'), `[${size}] ${prompt}\n`);
        } else {
          const rawFile = path.join(TAG ? RAW + '-' + TAG : RAW, t.file.replace(/\.webp$/, '.png'));
          let b64;
          if (args.mock) b64 = meta.png;
          else if (fs.existsSync(rawFile)) b64 = fs.readFileSync(rawFile).toString('base64');
          else if (args.reprocess) throw new Error('réponse brute absente');
          else { b64 = await callApi(prompt, meta.png, size); fs.mkdirSync(path.dirname(rawFile), { recursive: true }); fs.writeFileSync(rawFile, Buffer.from(b64, 'base64')); }
          const r = await postProcess(page, b64, meta, size, t.cat !== 'scenes');
          const outFile = path.join(args.mock ? DRY : TAG ? path.join(DRY, TAG) : OUT, t.file);
          fs.mkdirSync(path.dirname(outFile), { recursive: true });
          fs.writeFileSync(outFile, Buffer.from(r.webp, 'base64'));
          drifts.push(r.drift);
        }
      } catch (e) { failures.push(t.file + ': ' + e.message.split('\n')[0]); }
      done++;
      if (done % 5 === 0 || done === targets.length) process.stdout.write(`\r  ${done}/${targets.length}  ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, targets.length) }, worker));
  console.log('');
  await browser.close();
  if (usage.n) console.log(`${usage.n} appels : ${usage.in + usage.inText} jetons en entrée, ${usage.out} en sortie ≈ ${usageCost().toFixed(2)} $ (${(usageCost() / usage.n).toFixed(3)} $/image)`);
  if (args.mock) console.log(`résultats du test de recalage dans ${DRY} (dérive moyenne ${drifts.length ? Math.round(drifts.reduce((a, b) => a + b, 0) / drifts.length) : 0} px)`);
  else if (TAG) console.log(`essai « ${TAG} » (${MODEL}) : résultats dans ${path.join(DRY, TAG)} ; recalage moyen ${drifts.length ? Math.round(drifts.reduce((a, b) => a + b, 0) / drifts.length) : 0} px`);
  else if (!args.dry) { const n = writeManifest(); console.log(`${n} sprites peints dans le manifeste ; recalage moyen ${drifts.length ? Math.round(drifts.reduce((a, b) => a + b, 0) / drifts.length) : 0} px`); }
  else console.log(`guides et prompts écrits dans ${DRY}`);
  if (failures.length) { console.error('Échecs :\n  ' + failures.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
