// ============================================================================
// map-kit.cjs — la liste des images de la CARTE DU MONDE à produire (style de la carte de référence) :
//   node tools/repaint/map-kit.cjs
//     -> docs/PROMPTS-CARTE.md   : chaque image (nom, taille, rôle, image guide, prompt complet prêt à coller), par ordre de priorité
//     -> docs/prompts-carte.csv  : la même liste en tableau (Excel, Numbers, Sheets)
//     -> docs/img/guides-carte/  : les 4 images guides de cadrage (élément d'une case, ville 2 × 2, armée, planche de marche)
//   node tools/repaint/map-kit.cjs --kit=<dossier>
//     -> en plus, un kit à emporter : un dossier par partie, un prompt par image (<nom à plat>.txt, le PNG livré se range à
//        côté sous le même nom), la référence de style, les guides, la liste et le tableau, un LISEZMOI
// Les prompts viennent de tools/repaint/prompts.cjs (qui délègue à map-world.cjs) ; le registre des images de
// tools/repaint/targets.cjs. Ne pas éditer les fichiers produits à la main : relancer ce script.
// ============================================================================
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const T = require('./targets.cjs');
const P = require('./prompts.cjs');

const DOC = path.join(ROOT, 'docs', 'PROMPTS-CARTE.md');
const CSV = path.join(ROOT, 'docs', 'prompts-carte.csv');
const GUIDES = path.join(ROOT, 'docs', 'img', 'guides-carte');

// Sections dans l'ordre où produire les images (le plus visible d'abord)
const SECTIONS = [
  { key: 'ground', title: 'Sol', test: f => /^map\/world\/ground\//.test(f), intro: 'Plusieurs textures répétables par type de sol (4 prairies, 3 neiges, 3 sables, 3 herbes sèches, 3 champs, 2 eaux, 2 glaces), vues de dessus. Le jeu les projette en isométrique, les mélange par taches de quelques cases et fait lui-même les fondus irréguliers entre sols voisins (berges de sable, taches d\'herbe sèche, champs) : pas de tuiles de transition à produire. Les variantes d\'un même sol doivent avoir les mêmes couleurs et la même échelle. Pas d\'image guide.' },
  { key: 'forest', title: 'Forêts', test: f => /^map\/world\/forest\//.test(f), intro: 'Une case de forêt dense (4 types par biome : mixte, pins, feuillus, bouleaux…) ; le jeu prend une « lisière » pour une case peu entourée de forêt. Les cases voisines se fondent en un seul massif.' },
  { key: 'relief', title: 'Rochers et montagnes', test: f => /^map\/world\/(rocks|mountains)\//.test(f), intro: 'Amas de rochers (infranchissables) et rochers épars du désert (franchissables), en plusieurs variantes. Montagnes tempérées, enneigées et mesas du désert (infranchissables) : 3 modèles par forme, la forme isolée, _x et _y pour une chaîne dans l\'axe de la grille, _xy pour le cœur d\'un massif.' },
  { key: 'river', title: 'Rivières : ponts et gués', test: f => /^map\/world\/river\//.test(f), intro: 'L\'eau fait partie du sol. Un pont ou un gué traverse la rivière d\'une rive à l\'autre, case par case : _x de haut-gauche vers bas-droite, _y de haut-droite vers bas-gauche. Pont : vitesse normale ; gué : moitié moins vite.' },
  { key: 'desert', title: 'Désert : dunes, ruines, palmiers', test: f => /^map\/world\/desert\//.test(f), intro: 'Décor du désert. Les palmiers se posent autour des oasis.' },
  { key: 'water', title: 'Eau : bateaux et quais (décor)', test: f => /^map\/world\/water\//.test(f), intro: 'Décor seulement (décision du 25 octobre 2026) : sur les rivières et les lacs, sans effet sur le jeu.' },
  { key: 'ambience', title: 'Nuages qui passent (ambiance légère)', test: f => /^map\/world\/fx\//.test(f), intro: 'Comme dans la vidéo de référence : quelques nuages légers dérivent lentement au-dessus de la carte. Image large, fond transparent, bords très doux. Pas d\'image guide.' },
  { key: 'decor', title: 'Décor des cases, comme sur la carte de référence', test: f => /^map\/world\/(fields|decor)\//.test(f), intro: 'Pas semé au hasard partout (décision du 26 octobre 2026) : champs de blé autour des villes et sur la terre labourée, une meule à côté d\'un champ, buissons et arbres isolés au bord de l\'eau, agaves sur l\'herbe sèche, cactus au désert, quelques cailloux, décor givré sous la neige. Un chemin de terre part de la porte de chaque ville (texture de sol, rien à produire). Chaque élément reste petit et bas.' },
  { key: 'cities', title: 'Villes sur 2 × 2 cases', test: f => /^map\/cities\//.test(f) && !/\/siege_/.test(f), intro: 'Une ville couvre 2 × 2 cases. Village, ville (palier 2), capitale fortifiée (palier 3), ville secondaire normale et fortifiée, pour chaque civilisation.' },
  { key: 'siege', title: 'Villes assiégées (animation en 4 images)', test: f => /^map\/cities\/siege_/.test(f), intro: 'Remplacent la ville tant que le siège dure : même cadrage que la ville normale, 4 images qui bouclent.' },
  { key: 'resources', title: 'Points de ressource', test: f => /^map\/resources\//.test(f), intro: 'Comme sur la carte de référence, chaque point a son visuel : par ressource (camp de bûcherons, carrière, mine de fer, ferme, mine d\'or), par terrain (tempéré, désert, neige) et par richesse (niveau 1 petit, 2 moyen, 3 riche). Aucune couleur de civilisation : seules les villes et les armées changent de style avec la civilisation.' },
  { key: 'camps', title: 'Camps des tribus, ruines, fondation', test: f => /^map\/camps\//.test(f), intro: 'Camp de la tribu qui tient un point (niveaux 1 à 3, par biome), ruines après sa défaite, campement de fondation d\'une ville. Sans bannière de civilisation.' },
  { key: 'units', title: 'Armées en marche', test: f => /^map\/units\//.test(f) && !/_(walk|attack|hit)_\d+\.webp$/.test(f), intro: 'L\'armée sur la carte, par classe et par civilisation, le héros en tête, l\'espion, le cortège de colons.' },
  { key: 'fx', title: 'Effets de la carte', test: f => /^map\/fx\/fire_/.test(f), intro: 'Ville en feu (ville très endommagée), par images qui bouclent.' },
  { key: 'unitwalk', title: 'Marche des armées (une image de 6 poses par armée)', test: f => /^map\/units\/.*_walk_\d+\.webp$/.test(f), sheets: true, intro: 'Une seule image par armée : les 6 poses de la marche en grille de 3 colonnes × 2 rangées (1536 × 1024, chaque pose dans un carré de 512 × 512), lues de gauche à droite puis la rangée du bas. Je les découpe à l\'import. Le jeu les joue en boucle pendant la marche, pour chaque groupe de la colonne (une grosse armée marche en 2 ou 3 groupes, comme sur la carte de référence). Une armée sans son cycle trottine avec son image immobile.' },
  { key: 'unitanim', title: 'Plus tard : poses du replay de bataille (pas encore affichées dans le jeu)', test: f => /^map\/units\/.*_(attack|hit)_\d+\.webp$/.test(f), intro: 'Attaque et touché, même cadrage que l\'armée immobile. Le jeu ne les joue pas encore : à produire en dernier, je les brancherai à leur livraison.' },
  { key: 'fxlater', title: 'Plus tard : autres effets de la carte (pas encore affichés dans le jeu)', test: f => /^map\/fx\//.test(f), intro: 'Combat en cours, feu de camp, pluie, neige. Le jeu ne les affiche pas encore : à produire en dernier.' }
];

const GUIDE_OF = (t) => {
  if (/^map\/world\/(ground|fx)\//.test(t.file)) return null;
  if (t.frame === 'mapcity') return 'guide-ville.png';
  if (/^map\/units\//.test(t.file)) return 'guide-armee.png';
  return 'guide-objet.png';
};

// ---- les 3 images guides (fond gris, losange rouge, croix au centre ; aucun texte) ----
async function writeGuides() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.NODE_PATH || '/opt/node-tools/node_modules', 'playwright'))); }
  fs.mkdirSync(GUIDES, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  const specs = [
    { file: 'guide-objet.png', w: 0.5, cy: 0.75, cells: 1 },
    { file: 'guide-ville.png', w: 0.9, cy: 0.68, cells: 2 },
    { file: 'guide-armee.png', w: 0.5, cy: 0.75, cells: 1, feet: true },
    // planche de marche : 6 carrés de 512 × 512 en 3 colonnes × 2 rangées, la même case au sol dans chacun
    { file: 'guide-armee-planche.png', w: 0.5, cy: 0.75, cells: 1, feet: true, cols: 3, rows: 2, size: 512 }
  ];
  for (const s of specs) {
    const b64 = await page.evaluate((s) => {
      const Z = s.size || 1024, cols = s.cols || 1, rows = s.rows || 1;
      const c = document.createElement('canvas'); c.width = Z * cols; c.height = Z * rows;
      const g = c.getContext('2d');
      g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, c.width, c.height);
      for (let k = 0; k < cols * rows; k++) {
      g.save(); g.translate((k % cols) * Z, Math.floor(k / cols) * Z); g.scale(Z / 1024, Z / 1024);
      if (cols * rows > 1) { g.setLineDash([]); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 6; g.strokeRect(0, 0, 1024, 1024); g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = 'bold 72px sans-serif'; g.fillText(String(k + 1), 36, 96); }
      const W = 1024 * s.w, H = W / 2, cx = 512, cy = 1024 * s.cy;
      // cases intérieures (ville 2 × 2) en trait fin
      g.strokeStyle = 'rgba(220,40,40,0.55)'; g.lineWidth = 3;
      if (s.cells === 2) { g.beginPath(); g.moveTo(cx - W / 4, cy - H / 4); g.lineTo(cx + W / 4, cy + H / 4); g.moveTo(cx + W / 4, cy - H / 4); g.lineTo(cx - W / 4, cy + H / 4); g.stroke(); }
      g.strokeStyle = '#dc2828'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(cx, cy - H / 2); g.lineTo(cx + W / 2, cy); g.lineTo(cx, cy + H / 2); g.lineTo(cx - W / 2, cy); g.closePath(); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 18, cy); g.lineTo(cx + 18, cy); g.moveTo(cx, cy - 18); g.lineTo(cx, cy + 18); g.stroke();
      if (s.feet) { g.setLineDash([14, 10]); g.strokeStyle = 'rgba(220,40,40,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 220, cy - 1024 * 0.4); g.lineTo(cx + 220, cy - 1024 * 0.4); g.stroke(); }
      g.restore();
      }
      return c.toDataURL('image/png').split(',')[1];
    }, s);
    fs.writeFileSync(path.join(GUIDES, s.file), Buffer.from(b64, 'base64'));
  }
  await browser.close();
}

function main() {
  const all = T.buildAllTargets().filter(t => t.file.startsWith('map/'));
  const seen = new Set();
  const groups = SECTIONS.map(s => ({ ...s, items: [] }));
  const rest = [];
  for (const t of all) {
    if (seen.has(t.file)) continue;
    seen.add(t.file);
    const g = groups.find(s => s.test(t.file));
    (g ? g.items : rest).push(t);
  }
  if (rest.length) groups.push({ key: 'other', title: 'Autres images de la carte', intro: '', items: rest });
  const GROUND_FIRST = ['grass', 'drygrass', 'earth', 'sand', 'water', 'snow', 'ice'];
  const rank = (f) => { const m = f.match(/^map\/world\/ground\/([a-z]+)_/); return m ? GROUND_FIRST.indexOf(m[1]) : 0; };
  for (const g of groups) g.items.sort((a, b) => rank(a.file) - rank(b.file) || a.file.localeCompare(b.file, 'en'));
  // une partie « sheets » : une entrée par animation (une image de toutes ses poses), pas une par pose
  for (const g of groups) if (g.sheets) {
    const seenBase = new Set(), sheets = [];
    for (const t of g.items) {
      const base = (t.anim ? t.anim.base : t.file.replace(/_\d+\.webp$/, '')).replace(/\.webp$/, '');
      if (seenBase.has(base)) continue;
      seenBase.add(base);
      sheets.push({ file: base + '.webp', role: t.role.replace(/ — phase \d+\/\d+$/, ''), sheet: base, frames: t.anim ? t.anim.n : 6 });
    }
    g.items = sheets;
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const png = (f) => f.replace(/\.webp$/, '.png');
  let md = `# Carte du monde — les ${total} images à produire, avec leurs prompts

Généré par \`node tools/repaint/map-kit.cjs\` (ne pas éditer à la main). Style et découpage : [la carte de référence](img/carte-reference.jpg)
et [CARTE-REFERENCE.md](CARTE-REFERENCE.md) (décisions du 25 octobre 2026). Seule la carte du monde change de style ; la vue de la
ville et l'interface gardent le style peint.

## Comment produire une image

1. Donne à l'outil d'images **la référence de style** en première image : [carte-reference.jpg](img/carte-reference.jpg) (toujours la même).
2. Sauf pour le sol, donne **l'image guide** indiquée en deuxième image : elle montre en rouge la place de la case au sol
   ([élément d'une case](img/guides-carte/guide-objet.png), [ville 2 × 2](img/guides-carte/guide-ville.png),
   [armée](img/guides-carte/guide-armee.png), [planche de marche 3 × 2](img/guides-carte/guide-armee-planche.png)). Le guide sert seulement à placer le sujet : ni le losange rouge ni le fond gris ne doivent apparaître.
3. Colle **le prompt** de l'image (bloc de texte sous son nom), demande une image carrée 1024 × 1024 (512 × 512 pour les effets).
4. Enregistre en **PNG** sous **exactement le nom indiqué** (avec ses dossiers), par exemple \`map/world/forest/temperate_1.png\`.
   Fond transparent ; sinon un fond uni magenta (#FF00FF), détouré à l'import. Le sol, lui, est opaque.
5. Envoie les PNG (un dossier ou un zip, par petits lots si tu veux) : je les importe
   (\`node tools/repaint.cjs --import=<dossier>\`), ils remplacent aussitôt le dessin provisoire. Une image absente garde le dessin actuel.

Ordre conseillé : le sol d'abord (commence par la variante 1 de chaque sol : 7 images qui changent toute la carte ; les
autres variantes s'ajoutent ensuite), puis les forêts, les rochers et les villes.

## Sommaire

| # | Partie | Images |
|---|---|---|
${groups.map((g, i) => `| ${i + 1} | [${g.title}](#partie-${i + 1}) | ${g.items.length} |`).join('\n')}
| | **Total** | **${total}** |

`;
  const csv = ['partie;fichier;taille;guide;role;prompt'];
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  groups.forEach((g, i) => {
    md += `<a id="partie-${i + 1}"></a>\n\n## ${i + 1}. ${g.title}\n\n${g.intro ? g.intro + '\n\n' : ''}`;
    for (const t of g.items) {
      g.entries = g.entries || [];
      if (t.sheet) {
        const prompt = P.walkSheetPrompt(t.sheet) || t.role;
        md += `### \`${t.sheet}.png\`\n\n${t.role}  \n**Taille** : 1536x1024, ${t.frames} poses en grille 3 × 2 (fond transparent) · **Guide** : [guide-armee-planche.png](img/guides-carte/guide-armee-planche.png) (les 6 cases)\n\n\`\`\`text\n${prompt}\n\`\`\`\n\n`;
        csv.push([g.title, t.sheet + '.png', '1536x1024', 'guide-armee-planche.png', t.role, prompt].map(esc).join(';'));
        g.entries.push({ name: t.sheet + '.png', size: '1536x1024 (6 poses en 3 × 2)', guide: 'guide-armee-planche.png', role: t.role, prompt });
        continue;
      }
      const prompt = P.promptFor(t.file) || t.role;
      const guide = GUIDE_OF(t);
      const size = T.deliverySize(t);
      md += `### \`${png(t.file)}\`\n\n${t.role}  \n**Taille** : ${size}${t.opaque ? ' (opaque)' : ' (fond transparent)'} · **Guide** : ${guide ? `[${guide}](img/guides-carte/${guide})` : 'aucun'}\n\n\`\`\`text\n${prompt}\n\`\`\`\n\n`;
      csv.push([g.title, png(t.file), size, guide || '', t.role, prompt].map(esc).join(';'));
      g.entries.push({ name: png(t.file), size: size + (t.opaque ? ', opaque' : ', fond transparent'), guide, role: t.role, prompt });
    }
  });
  fs.writeFileSync(DOC, md);
  fs.writeFileSync(CSV, '﻿' + csv.join('\n') + '\n');
  console.log(`${total} images de carte : ${path.relative(ROOT, DOC)}, ${path.relative(ROOT, CSV)}`);
  for (const g of groups) console.log(`  ${g.title} : ${g.items.length}`);
  return { groups, total };
}

// ---- le kit à emporter ----
function writeKit(dir, { groups, total }) {
  const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 48);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, '0-reference-et-guides'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'docs', 'img', 'carte-reference.jpg'), path.join(dir, '0-reference-et-guides', 'carte-reference.jpg'));
  for (const f of fs.readdirSync(GUIDES)) fs.copyFileSync(path.join(GUIDES, f), path.join(dir, '0-reference-et-guides', f));
  fs.copyFileSync(DOC, path.join(dir, 'PROMPTS-CARTE.md'));
  fs.copyFileSync(CSV, path.join(dir, 'prompts-carte.csv'));
  const flat = (n) => n.replace(/\//g, '__');
  groups.forEach((g, i) => {
    const sub = path.join(dir, `${String(i + 1).padStart(2, '0')}-${slug(g.title)}`);
    fs.mkdirSync(sub, { recursive: true });
    for (const e of g.entries || []) {
      const head = `Fichier à livrer : ${e.name}  (ou à plat : ${flat(e.name)}, rangé dans ce dossier)\nTaille : ${e.size}\nRôle : ${e.role}\nImages à joindre : 0-reference-et-guides/carte-reference.jpg${e.guide ? ` puis 0-reference-et-guides/${e.guide}` : ''}\n\n--- PROMPT À COLLER ---\n\n`;
      fs.writeFileSync(path.join(sub, flat(e.name).replace(/\.png$/, '.txt')), head + e.prompt + '\n');
    }
  });
  fs.writeFileSync(path.join(dir, 'LISEZMOI.txt'), `KIT DES IMAGES DE LA CARTE DU MONDE — ${total} images
=====================================================

Un dossier par partie, dans l'ordre où produire les images (le sol d'abord). Dans chaque dossier, un fichier .txt par
image : il donne le nom du fichier à livrer, la taille, les images à joindre et le prompt complet à coller.

Pour chaque image :
  1. Joins 0-reference-et-guides/carte-reference.jpg (le style à imiter, toujours la même) puis, si le .txt l'indique,
     le guide de cadrage (guide-objet.png, guide-ville.png, guide-armee.png ou guide-armee-planche.png : le losange rouge montre la case au sol ;
     il ne doit pas apparaître sur l'image).
  2. Colle le prompt (tout ce qui suit « PROMPT À COLLER »).
  3. Enregistre le résultat en PNG sous le nom indiqué, à côté de son .txt (le nom à plat convient : map__world__ground__grass_1.png).
     Fond transparent, sauf le sol (opaque). Les marches des armées : une seule image de 6 poses en 3 colonnes × 2 rangées.
  4. Renvoie le dossier (ou un zip) quand tu veux, même incomplet : j'importe ce qui est là, le reste garde le dessin actuel.

PROMPTS-CARTE.md : la même liste en un seul document ; prompts-carte.csv : en tableau (Excel, Numbers, Sheets).
Commence par la variante 1 de chaque sol (7 images) : c'est ce qui change le plus la carte.
`);
  console.log(`kit : ${path.relative(ROOT, dir) || dir}`);
}

const kitArg = process.argv.find(a => a.startsWith('--kit='));
const built = main();
writeGuides().then(() => {
  console.log(`guides : ${path.relative(ROOT, GUIDES)}/`);
  if (kitArg) writeKit(path.resolve(kitArg.slice(6)), built);
}).catch(e => { console.error('guides :', e.message); process.exit(1); });
