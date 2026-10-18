#!/usr/bin/env node
// docs/GENERATION-COMPLETE.md : un seul fichier, autonome, avec TOUT ce qu'il faut générer et COMMENT — règles communes
// (style, fond, cadrage, tailles, nommage, bandes d'animation, livraison), puis chaque image restante (non peinte) avec son
// prompt complet, famille par famille, écran par écran. docs/generation-complete.csv : la même chose pour un générateur
// automatique (une ligne par image ou par bande).
//   node tools/generation-complete.cjs        (aussi lancé par node tools/liste-graphismes.cjs)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const T = require('./repaint/targets.cjs');
const P = require('./repaint/prompts.cjs');
const { classify } = require('./repaint/families.cjs');

let buildingsData = [];
try { buildingsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'buildings.json'), 'utf8')).buildings; } catch (e) { buildingsData = []; }
const foreignFaction = (file) => { const m = file.match(/^buildings\/([A-Z]+)\/([A-Z_]+?)(?:_t1|_t3|_site)?\.webp$/); if (!m) return false; const d = buildingsData.find(b => b.key === m[2]); return !!(d && d.faction && d.faction !== m[1]); };
let painted = new Set();
try { painted = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend', 'assets', 'images', 'painted', 'manifest.json'), 'utf8')).files); } catch (e) { painted = new Set(); }

const all = T.buildAllTargets();
const byFile = new Map(all.map(t => [t.file, t]));
const files = all.map(t => t.file).filter(f => !foreignFaction(f));
const { screens, rest } = classify(files, painted);

// ---- prompt d'une image : préfixe (style, fond, guide éventuel, composition) + sujet ----
const KEEP_RE = /^Repaint the subject shown in the second image/;
function promptParts(file) {
  const full = P.promptFor(file) || '';
  const idx = full.indexOf('Subject: ');
  if (idx < 0) {   // textures, bordures, décalques : pas de marqueur « Subject », le prompt entier moins la phrase de style est le sujet
    let rest = full.trim();
    for (const st of [P.STYLE, P.STYLE.replace(/No text[^.]*\./, '')]) { const st2 = st.trim(); if (rest.startsWith(st2)) { rest = rest.slice(st2.length).trim(); break; } }
    return { prefix: 'Phrase de style (section 1), puis :', subject: rest };
  }
  const prefix = full.slice(0, idx).split('\n\n').map(x => x.trim()).filter(Boolean);
  const t = byFile.get(file);
  const kept = prefix.filter(x => t && t.guide ? true : !KEEP_RE.test(x));   // sans guide 3D, pas de consigne « repeins la deuxième image »
  return { prefix: kept.join('\n'), subject: full.slice(idx + 'Subject: '.length).trim() };
}
const png = (f) => f.replace(/\.webp$/, '.png');
const sizeOf = (t) => (T.deliverySize(t) || '1024x1024').replace('x', '×');
// Case d'une bande d'animation (guide § 0) : 512×768 en ville, 512×512 sur la carte et pour les effets
const cellOf = (t) => t.frame === 'prop' || t.frame === 'building' || t.frame === 'stage' ? '512×768' : '512×512';
const stripSubject = (subject) => subject.replace(/^A sprite sheet frame: /, '').replace(/,?\s*(walk cycle |attack |idle breathing pose )?frame \d+( of \d+)?( \([^)]*\))?\s*(\(raise, top, strike, rebound\))?/g, '').replace(/\s+/g, ' ').trim();

// ---- regroupe les phases d'animation en bandes ----
function entriesOf(list) {
  const strips = new Map(); const singles = [];
  for (const f of list) {
    const t = byFile.get(f);
    if (t && t.anim) { const key = t.anim.base; const s = strips.get(key) || { base: key, n: t.anim.n, frames: [], t }; s.frames[t.anim.i] = f; strips.set(key, s); }
    else singles.push(f);
  }
  return { strips: [...strips.values()], singles };
}
const remaining = (list) => list.filter(f => !painted.has(f));

// ---- document ----
const style = P.STYLE, bg = P.BG.transparent;
const comp = P.COMPOSITION;
let md = `# Tout ce qu'il faut générer, et comment

Un seul fichier pour produire les images du jeu : les règles communes (section 1), puis **chaque image restante avec son
prompt complet** (section 2), famille par famille, écran par écran, et les visuels de boutique (section 3). Généré par
\`node tools/generation-complete.cjs\` ; le fichier jumeau \`docs/generation-complete.csv\` donne la même liste à un
générateur automatique (une ligne par image ou par bande d'animation : fichier, taille, cases, prompt).

## 1. Comment générer

1. **Référence de style** : joindre \`tools/repaint/style-ref.png\` (un étal de marché égyptien peint) comme **première image**
   de chaque génération. Chaque prompt commence par la phrase de style ci-dessous, puis la phrase de fond, puis la
   consigne de cadrage de la famille, puis le sujet.
2. **Phrase de style** (début de chaque prompt) :
   \`${style}\`
3. **Fond** : transparent de préférence (phrase ci-dessous) ; sinon magenta #FF00FF uniforme, détouré à l'import.
   \`${bg}\`
4. **Guide de cadrage** : les images marquées « guide : … » ont un rendu 3D provisoire qui fixe l'angle, la place dans le
   cadre et l'emprise ; le joindre comme **deuxième image** avec la phrase « Repaint the subject shown in the second
   image… » (elle est incluse dans leur prompt). Les guides se produisent avec \`node tools/repaint.cjs --kit=<dossier>\`
   (dossiers \`guides/\` et \`prompts/\`). Sans guide, respecter la consigne de composition du prompt.
5. **Compositions par type d'image** (incluses dans chaque prompt) :

| Type | Consigne |
|---|---|
${Object.entries(comp).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

6. **Tailles de livraison** : ${Object.entries(T.DELIVERY).map(([k, v]) => `${k} ${v.replace('x', '×')}`).join(' · ')} ; les scènes de connexion et les estrades de héros 1024×1536, les bandeaux et vignettes 1536×1024 ; bannière Google Play 1024×500 ; icône de notification 96×96.
7. **Nommage** : exactement le nom indiqué, extension \`.png\`, sous-dossiers respectés (\`buildings/ROME/MAIN_HALL.png\`).
8. **Animations** : **une seule image par animation**, bande horizontale de N cases égales côte à côte (N = nombre de phases),
   même personnage, même taille, même position dans chaque case, seule la pose change ; cases 512×768 (ville) ou 512×512
   (carte, effets) ; nommer la bande du nom de base sans numéro (\`props/villager_ROME_a.png\` pour \`villager_ROME_a_0..5\`),
   elle est découpée à l'import. Phrase incluse dans le prompt : « A sprite sheet: N equal frames side by side… ».
9. **Livraison** : dossier ou zip dans \`art/incoming/\`, par lots ; vérification \`node tools/check-incoming.cjs art/incoming\`
   (noms, tailles, transparence, cases des bandes) ; import \`node tools/repaint.cjs --import=art/incoming\` ; aperçu en jeu
   \`node tools/preview-art.cjs <CIV> <biome>\`. Ce qui manque garde son rendu 3D ou son dessin provisoire.
10. **Ordre conseillé** : ce qui se voit tout le temps (bâtiments courants, champs, enceinte et portes, sols, interface, carte),
    puis la vie de la ville (échafaudages, ouvriers, villageois, flammes, bâtiments vivants), les systèmes récents (camps,
    colons, technologies, chantiers), les fiches (unités, héros), le reste (paliers 1 et 3, ambiance, météo, douves).

## 2. Ce qu'il faut générer

`;
const csv = [['fichier', 'taille', 'cases', 'guide', 'famille', 'prompt']];
const csvEsc = (v) => '"' + String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
let totalImages = 0, totalStrips = 0;
const summary = [];
for (const [screen, fams] of screens) {
  const famsLeft = fams.map(x => ({ ...x, left: remaining(x.list) })).filter(x => x.left.length);
  if (!famsLeft.length) continue;
  md += `### ${screen}\n\n`;
  for (const x of famsLeft) {
    const { strips, singles } = entriesOf(x.left);
    const nImg = singles.length + strips.length;
    summary.push([screen, x.title, singles.length, strips.length]);
    totalImages += singles.length; totalStrips += strips.length;
    md += `#### ${x.title} — ${singles.length ? `${singles.length} image${singles.length > 1 ? 's' : ''}` : ''}${singles.length && strips.length ? ', ' : ''}${strips.length ? `${strips.length} bande${strips.length > 1 ? 's' : ''} d'animation` : ''}\n\n`;
    md += `Où : ${x.where}. Priorité ${x.prio}.${x.note ? ' ' + x.note : ''}\n\n`;
    // préfixe commun de la famille (style, fond, guide, composition) : celui de la première image
    const sample = singles[0] || (strips[0] && strips[0].frames.find(Boolean));
    const { prefix } = promptParts(sample);
    md += `Début du prompt, commun à la famille :\n\n\`\`\`\n${prefix}\n\`\`\`\n\n`;
    if (singles.length) {
      md += `| Fichier | Taille | Guide | Sujet (fin du prompt, après « Subject: ») |\n|---|---|---|---|\n`;
      for (const f of singles) {
        const t = byFile.get(f); const { prefix: pf, subject } = promptParts(f);
        const guide = t.guide ? `rendu 3D \`${png(t.guideFile || f)}\`` : '—';
        md += `| \`${png(f)}\` | ${sizeOf(t)} | ${guide} | ${subject.replace(/\|/g, '/')} |\n`;
        csv.push([png(f), sizeOf(t), 1, t.guide ? png(t.guideFile || f) : '', x.title, `${pf}\n\nSubject: ${subject}`]);
      }
      md += '\n';
    }
    if (strips.length) {
      md += `| Bande (fichier) | Cases | Taille d'une case | Sujet de la bande |\n|---|---|---|---|\n`;
      for (const s of strips) {
        const first = s.frames.find(Boolean); const t = byFile.get(first); const { prefix: pf, subject } = promptParts(first);
        const base = stripSubject(subject);
        const phases = s.n;
        const stripPrompt = `A sprite sheet: ${phases} equal frames side by side in a single row, the exact same subject at the exact same size and position in every frame, only the pose changes from one frame to the next, frame 1 to frame ${phases}: ${base}.`;
        md += `| \`${s.base}.png\` | ${phases} | ${cellOf(t)} | ${stripPrompt.replace(/\|/g, '/')} |\n`;
        csv.push([`${s.base}.png`, `${cellOf(t).split('×')[0] * phases}×${cellOf(t).split('×')[1]}`, phases, '', x.title, `${pf}\n\nSubject: ${stripPrompt}`]);
      }
      md += '\n';
    }
  }
}
// ---- boutique et application ----
const STORE_PROMPTS = {
  'store/ic_stat_notify.png': 'A flat white silhouette on a fully transparent background, no shading: a Roman helmet with a crest seen from the side, simple and readable at 24 pixels (Android notification icon).',
  'store/feature-graphic.png': `${style} A wide painted banner for a mobile strategy game set in antiquity: a fortified city of six ancient civilisations on a green plateau at golden hour, a Roman hero with a red-crested helmet in the foreground on the left, banners and marching soldiers, warm earthy palette, the right third of the image left calmer for a title. No text. Opaque image, 1024×500.`,
  'store/icon-1024.png': `${style} The game emblem as an app icon, filling the square: a golden Roman legionary helmet with a red horsehair crest in three-quarter view inside a dark bronze medallion rimmed with gold and two golden laurel branches, on a deep red background. No text. Opaque image.`
};
md += `## 3. Boutique et application\n\n| Fichier | Taille | Rôle | Prompt |\n|---|---|---|---|\n`;
for (const s of T.STORE) { md += `| \`${s.file}\` | ${s.size[0]}×${s.size[1]} | ${s.role} | ${STORE_PROMPTS[s.file] || ''} |\n`; csv.push([s.file, `${s.size[0]}×${s.size[1]}`, 1, '', 'Boutique', STORE_PROMPTS[s.file] || s.role]); }
md += `\n## Récapitulatif\n\n| Écran | Famille | Images | Bandes |\n|---|---|---|---|\n${summary.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`).join('\n')}\n| **Total** | | **${totalImages}** | **${totalStrips}** |\n\nDéjà peint et donc absent d'ici : ${[...painted].length} images. Variantes neige des bâtiments et de l'enceinte : non demandées.\n`;
if (rest.length) md += `\nNon classé : ${rest.map(f => '`' + f + '`').join(', ')}\n`;
fs.writeFileSync(path.join(ROOT, 'docs', 'GENERATION-COMPLETE.md'), md);
fs.writeFileSync(path.join(ROOT, 'docs', 'generation-complete.csv'), csv.map(r => r.map(csvEsc).join(',')).join('\n') + '\n');
console.log(`GENERATION-COMPLETE : ${totalImages} images + ${totalStrips} bandes (${Math.round(md.length / 1024)} Ko), CSV ${csv.length - 1} lignes`);
