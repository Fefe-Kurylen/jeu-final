// ============================================================================
// map-kit.cjs — la liste des images de la CARTE DU MONDE à produire (style de la carte de référence) :
//   node tools/repaint/map-kit.cjs
//     -> docs/PROMPTS-CARTE.md   : chaque image (nom, taille, rôle, image guide, prompt complet prêt à coller), par ordre de priorité
//     -> docs/prompts-carte.csv  : la même liste en tableau (Excel, Numbers, Sheets)
//     -> docs/img/guides-carte/  : les 3 images guides de cadrage (élément d'une case, ville 2 × 2, armée)
// Les prompts viennent de tools/repaint/prompts.cjs (qui délègue à map-world.cjs) ; le registre des images de
// tools/repaint/targets.cjs. Ne pas éditer les fichiers produits à la main : relancer ce script.
// ============================================================================
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const T = require('./targets.cjs');
const P = require('./prompts.cjs');
const MW = require('./map-world.cjs');

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
  { key: 'cities', title: 'Villes sur 2 × 2 cases', test: f => /^map\/cities\//.test(f) && !/\/siege_/.test(f), intro: 'Une ville couvre 2 × 2 cases. Village, ville (palier 2), capitale fortifiée (palier 3), ville secondaire normale et fortifiée, pour chaque civilisation.' },
  { key: 'siege', title: 'Villes assiégées (animation en 4 images)', test: f => /^map\/cities\/siege_/.test(f), intro: 'Remplacent la ville tant que le siège dure : même cadrage que la ville normale, 4 images qui bouclent.' },
  { key: 'resources', title: 'Points de ressource', test: f => /^map\/resources\//.test(f), intro: 'Le point de ressource libre (sans tribu), par ressource et par biome.' },
  { key: 'camps', title: 'Camps des tribus, fondation, bannières', test: f => /^map\/camps\//.test(f), intro: 'Camp de la tribu qui tient un point (niveaux 1 à 3, par biome), ruines après sa défaite, campement de fondation d\'une ville, bannière de chaque civilisation posée sur le camp.' },
  { key: 'units', title: 'Armées en marche', test: f => /^map\/units\//.test(f) && !/_(walk|attack|hit)_\d+\.webp$/.test(f), intro: 'L\'armée sur la carte, par classe et par civilisation, le héros en tête, l\'espion, le cortège de colons.' },
  { key: 'unitanim', title: 'Animations des armées', test: f => /^map\/units\/.*_(walk|attack|hit)_\d+\.webp$/.test(f), intro: 'Cycles de marche (6 images) et images du replay de bataille (attaque, touché). Même cadrage que l\'armée immobile.' },
  { key: 'fx', title: 'Effets de la carte', test: f => /^map\/fx\//.test(f), intro: 'Combat en cours, ville en feu, feu de camp, pluie, neige : par images qui bouclent.' }
];

const GUIDE_OF = (t) => {
  if (/^map\/world\/ground\//.test(t.file)) return null;
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
    { file: 'guide-armee.png', w: 0.5, cy: 0.75, cells: 1, feet: true }
  ];
  for (const s of specs) {
    const b64 = await page.evaluate((s) => {
      const c = document.createElement('canvas'); c.width = c.height = 1024;
      const g = c.getContext('2d');
      g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, 1024, 1024);
      const W = 1024 * s.w, H = W / 2, cx = 512, cy = 1024 * s.cy;
      // cases intérieures (ville 2 × 2) en trait fin
      g.strokeStyle = 'rgba(220,40,40,0.55)'; g.lineWidth = 3;
      if (s.cells === 2) { g.beginPath(); g.moveTo(cx - W / 4, cy - H / 4); g.lineTo(cx + W / 4, cy + H / 4); g.moveTo(cx + W / 4, cy - H / 4); g.lineTo(cx - W / 4, cy + H / 4); g.stroke(); }
      g.strokeStyle = '#dc2828'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(cx, cy - H / 2); g.lineTo(cx + W / 2, cy); g.lineTo(cx, cy + H / 2); g.lineTo(cx - W / 2, cy); g.closePath(); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 18, cy); g.lineTo(cx + 18, cy); g.moveTo(cx, cy - 18); g.lineTo(cx, cy + 18); g.stroke();
      if (s.feet) { g.setLineDash([14, 10]); g.strokeStyle = 'rgba(220,40,40,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 220, cy - 1024 * 0.4); g.lineTo(cx + 220, cy - 1024 * 0.4); g.stroke(); }
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
   [armée](img/guides-carte/guide-armee.png)). Le guide sert seulement à placer le sujet : ni le losange rouge ni le fond gris ne doivent apparaître.
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
      const prompt = P.promptFor(t.file) || t.role;
      const guide = GUIDE_OF(t);
      const size = T.deliverySize(t);
      md += `### \`${png(t.file)}\`\n\n${t.role}  \n**Taille** : ${size}${t.opaque ? ' (opaque)' : ' (fond transparent)'} · **Guide** : ${guide ? `[${guide}](img/guides-carte/${guide})` : 'aucun'}\n\n\`\`\`text\n${prompt}\n\`\`\`\n\n`;
      csv.push([g.title, png(t.file), size, guide || '', t.role, prompt].map(esc).join(';'));
    }
  });
  fs.writeFileSync(DOC, md);
  fs.writeFileSync(CSV, '﻿' + csv.join('\n') + '\n');
  console.log(`${total} images de carte : ${path.relative(ROOT, DOC)}, ${path.relative(ROOT, CSV)}`);
  for (const g of groups) console.log(`  ${g.title} : ${g.items.length}`);
}

main();
writeGuides().then(() => console.log(`guides : ${path.relative(ROOT, GUIDES)}/`)).catch(e => { console.error('guides :', e.message); process.exit(1); });
