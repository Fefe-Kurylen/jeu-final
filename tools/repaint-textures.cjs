#!/usr/bin/env node
// ============================================================================
// repaint-textures.cjs — textures de sol peintes et répétables (herbe, terre, sable, neige) pour les vues ville,
// champs et carte, générées par l'API d'images d'OpenAI dans le style de l'illustration de référence, puis rendues
// raccordables (fondu croisé des bords) et écrites dans frontend/assets/images/painted/terrain/<nom>.webp.
//   OPENAI_API_KEY=sk-… node tools/repaint-textures.cjs [--only=grass,sand] [--force]
// ============================================================================
const fs = require('fs');
const path = require('path');
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) { const r = require('child_process').spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } }); process.exit(r.status ?? 1); }
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'frontend', 'assets', 'images', 'painted', 'terrain');
const RAW = path.join(__dirname, 'repaint', 'raw-textures');
const STYLE_REF = path.join(__dirname, 'repaint', 'style-ref.png');
const MODEL = 'gpt-image-2.5-sunburst';
const TEX = {
  grass: 'a seamless, tileable top-down texture of lush painted meadow grass: soft green tufts, a few tiny flowers and pebbles',
  dirt: 'a seamless, tileable top-down texture of packed earth and dirt path: warm brown, small pebbles, faint cart tracks',
  sand: 'a seamless, tileable top-down texture of desert sand: pale ochre, gentle wind ripples, a few small stones',
  snow: 'a seamless, tileable top-down texture of fresh snow: white with soft blue shadows, light drifts and sparkles'
};
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const names = args.only ? String(args.only).split(',') : Object.keys(TEX);
(async () => {
  if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY manquante'); process.exit(1); }
  const browser = await chromium.launch(); const page = await browser.newPage(); await page.setContent('<body></body>');
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(RAW, { recursive: true });
  for (const name of names) {
    const out = path.join(OUT, name + '.webp'), raw = path.join(RAW, name + '.png');
    if (fs.existsSync(out) && !args.force) { console.log(name, ': déjà peint'); continue; }
    let b64;
    if (fs.existsSync(raw) && !args.force) b64 = fs.readFileSync(raw).toString('base64');
    else {
      const prompt = `Hand-painted game texture in exactly the art style of the reference image (clean painted look, soft shading, warm palette). ${TEX[name]}. Perfectly uniform lighting, no vignette, no border, no objects larger than a pebble, no text. The texture must tile seamlessly: the left edge continues the right edge and the top edge continues the bottom edge.`;
      const form = new FormData();
      form.append('model', MODEL); form.append('prompt', prompt); form.append('size', '1024x1024'); form.append('quality', 'high'); form.append('output_format', 'png'); form.append('n', '1');
      form.append('image[]', new Blob([fs.readFileSync(STYLE_REF)], { type: 'image/png' }), 'style-ref.png');
      const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: form });
      if (!res.ok) { console.error(name, 'HTTP', res.status, (await res.text()).slice(0, 200)); continue; }
      const j = await res.json(); b64 = j.data[0].b64_json; fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
      console.log(name, ': généré (', j.usage?.output_tokens, 'jetons en sortie )');
    }
    // raccordement : décalage d'un demi-carreau puis fondu croisé des bords, réduit à 512 px
    const webp = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const N = 1024, c = document.createElement('canvas'); c.width = N; c.height = N; const x = c.getContext('2d');
      // version décalée (les bords d'origine se retrouvent au centre)
      x.drawImage(img, 0, 0, N / 2, N / 2, N / 2, N / 2, N / 2, N / 2); x.drawImage(img, N / 2, 0, N / 2, N / 2, 0, N / 2, N / 2, N / 2);
      x.drawImage(img, 0, N / 2, N / 2, N / 2, N / 2, 0, N / 2, N / 2); x.drawImage(img, N / 2, N / 2, N / 2, N / 2, 0, 0, N / 2, N / 2);
      // fondu de l'original par-dessus, masqué par une croix douce au centre (là où sont les anciens bords)
      const m = document.createElement('canvas'); m.width = N; m.height = N; const mx = m.getContext('2d');
      mx.drawImage(img, 0, 0);
      mx.globalCompositeOperation = 'destination-in';
      const g1 = mx.createLinearGradient(0, 0, N, 0); g1.addColorStop(0, 'rgba(0,0,0,1)'); g1.addColorStop(0.38, 'rgba(0,0,0,1)'); g1.addColorStop(0.5, 'rgba(0,0,0,0)'); g1.addColorStop(0.62, 'rgba(0,0,0,1)'); g1.addColorStop(1, 'rgba(0,0,0,1)');
      mx.fillStyle = g1; mx.fillRect(0, 0, N, N);
      const g2 = mx.createLinearGradient(0, 0, 0, N); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.38, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(0.62, 'rgba(0,0,0,1)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
      mx.fillStyle = g2; mx.fillRect(0, 0, N, N);
      // l'original masqué couvre les bords (qui se raccordent maintenant à eux-mêmes par le décalage)
      x.globalCompositeOperation = 'source-over'; x.drawImage(m, 0, 0);
      const o = document.createElement('canvas'); o.width = 512; o.height = 512; o.getContext('2d').drawImage(c, 0, 0, 512, 512);
      return o.toDataURL('image/webp', 0.88).split(',')[1];
    }, b64);
    fs.writeFileSync(out, Buffer.from(webp, 'base64'));
    console.log(name, '→', path.relative(ROOT, out));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
