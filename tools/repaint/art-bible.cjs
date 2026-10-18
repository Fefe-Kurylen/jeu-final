#!/usr/bin/env node
// ============================================================================
// art-bible.cjs — écrit docs/PROMPTS-GRAPHIQUES.md : la « bible graphique » du jeu, générée depuis prompts.cjs :
// style, règles (cadres, fonds, nommage, retour), composition par type d'image, tables des sujets (bâtiments,
// civilisations, paliers, biomes, champs, décors, carte, relief, unités, héros, scènes, icônes, habillage, textures)
// et inventaire chiffré. Tout ce qu'il faut pour produire les images avec n'importe quel outil.
//   node tools/repaint/art-bible.cjs
// ============================================================================
const fs = require('fs');
const path = require('path');
const P = require('./prompts.cjs');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'assets', 'images', '3d', 'manifest.json'), 'utf8'));
const counts = Object.fromEntries(Object.entries(manifest.categories).map(([k, v]) => [k, v.filter(f => f.endsWith('.webp')).length]));
const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n` + rows.map(r => `| ${r.map(c => String(c).replace(/\|/g, '/')).join(' | ')} |`).join('\n') + '\n';
const ex = (f) => '```\n' + P.promptFor(f) + '\n```\n';
let md = `# Bible graphique — prompts de tout l'univers visuel

Généré par \`node tools/repaint/art-bible.cjs\` depuis \`tools/repaint/prompts.cjs\` (ne pas éditer à la main).
Chaque image du jeu se décrit par : **style** (commun) + **consigne de cadrage** (commune, variante par palier) +
**composition** (par type d'image) + **sujet** (ci-dessous). Le kit complet (\`node tools/repaint.cjs --kit=<dossier> --everything\`)
fournit en plus, pour chaque image, le prompt assemblé prêt à coller (\`prompts/…txt\`, \`PROMPTS.csv\`) et l'image guide
(\`guides/…webp\`, le rendu 3D qui fixe l'angle et la position).

## 1. Règles communes

- **Référence de style** : \`tools/repaint/style-ref.png\` (marché égyptien peint). À donner à l'outil comme première image, à chaque fois.
- **Image guide** : le rendu 3D de l'élément (deuxième image). Sans guide, la phrase « Composition » du prompt suffit à placer le sujet.
- **Format** : PNG, fond transparent (sinon fond uni magenta #FF00FF ou vert #00FF00, détouré à l'import). Carré 1024×1024,
  sauf scènes : connexion portrait 1024×1536, paysage 1536×1024, estrades de héros 1024×1536, bandeaux et champ de bataille 1536×1024.
- **Nommage** : exactement le nom du guide, extension .png : \`buildings/HUN/MAIN_HALL.png\`, \`buildings/HUN/MAIN_HALL_t1_snow.png\`,
  \`walls/GAUL/3_tower.png\`, \`map/terrain/forest_mountain_xy.png\`, \`busts/ARCHER_EGYPT.png\`, \`scenes/hero-ROME.png\`, \`terrain/grass.png\`…
  (les noms plats \`buildings__HUN__MAIN_HALL.png\` sont acceptés).
- **Retour** : un dossier ou un zip, par lots si besoin → \`node tools/repaint.cjs --import=<dossier>\` recale et publie ; le reste garde le rendu 3D.
- **Lumière** : toujours en haut à gauche, ombre portée vers la droite. **Angle** : isométrique 2:1 vu de face à 30°, sauf figurines (trois-quarts), bustes et icônes (de face / légère plongée), habillage (de face).

### Style (début de chaque prompt)

\`\`\`
${P.STYLE}
\`\`\`

Fond : \`${P.BG.transparent}\`

### Consigne de cadrage (après le style)

Courant : \`${P.KEEP}\`

Palier 1 : \`${P.KEEP_T1}\`

Palier 3 : \`${P.KEEP_T3}\`

### Composition par type d'image

${table(['Type', 'Images concernées', 'Composition'], Object.entries(P.COMPOSITION).map(([k, v]) => [k, { building: 'bâtiments, champs, parcelles, enceinte', prop: 'décors', map: 'villes, ressources, relief de carte', mapunit: 'armées en marche sur la carte', figure: 'figurines des unités', bust: 'jetons (bustes) des unités et des héros', icon: 'icônes et emblème', ui: 'boutons, cadres, plaques, barres', stage: 'héros sur estrade', header: 'bandeaux d\'écran', scene: 'panoramas de connexion, champ de bataille' }[k] || '', v]))}
## 2. Inventaire

${table(['Catégorie', 'Fichiers', 'Détail'], [
  ['buildings', counts.buildings, '39 bâtiments × 6 civilisations × 3 paliers (courant, _t1, _t3) × 2 (normal, _snow)'],
  ['fields', counts.fields, '4 types × 3 paliers × 3 biomes'], ['plots', counts.plots, '3 biomes × 2 variantes'], ['props', counts.props, 'décors de scène + volutes de fumée + ondes'],
  ['map', counts.map, 'villes (6 + capitales + défaut), ressources × biomes, relief (isolé, _x, _y, _xy), unités en marche'],
  ['walls', counts.walls, '6 civilisations × 3 paliers × (2 courtines hautes, 2 murets, 1 tour) × neige'],
  ['figures', counts.figures, '4 classes × 6 civilisations'], ['busts', counts.busts, 'jetons : 4 classes × (neutre + 6 civilisations)'], ['heroes', counts.heroes, '6 héros sur estrade + 6 bustes'],
  ['scenes', counts.scenes, 'connexion (portrait, paysage), 6 estrades de héros, 5 bandeaux, champ de bataille'],
  ['icons', counts.icons, 'icônes d\'interface et objets'], ['uiframes', counts.uiframes, 'boutons (5 couleurs × normal/enfoncé), cadres, plaques, barre'],
  ['effects / flags', (counts.effects || 0) + (counts.flags || 0), 'fumée et ondes (4 phases), drapeaux (8 phases × 8 couleurs) — animés, restent en rendu 3D'],
  ['terrain', 4, 'textures de sol répétables : grass, dirt, sand, snow (sans guide)'], ['logo', 1, 'emblème (médaillon)']
])}
## 3. Sujets

### Civilisations (ajouté à chaque bâtiment, mur, figurine)

${table(['Clé', 'Architecture'], Object.entries(P.FACTION))}
### Coiffes des unités et héros par civilisation

${table(['Clé', 'Coiffe'], Object.entries(P.HEAD))}
### Les 39 bâtiments (\`buildings/<CIV>/<CLÉ>[_t1|_t3][_snow].png\`)

${table(['Clé', 'Sujet'], Object.entries(P.BUILDING))}
Paliers : **_t1** (niveaux 1-6) « ${P.TIER[1]} », version niveau 1 de jeu mobile (hutte basse de bois, sans ornement) ;
courant (7-13) ; **_t3** (14-20) version niveau max (étage ou tour en plus, marbre, or, bannières, esplanade). **_snow** : tout est enneigé.

### Champs (\`fields/<biome>/<TYPE>_<1|2|3>.png\`) et parcelles (\`plots/<biome>_<0|1>.png\`)

${table(['Type', 'Sujet'], Object.entries(P.FIELD))}
${table(['Palier', 'Développement'], Object.entries(P.TIER))}
${table(['Biome', 'Sol'], Object.entries(P.BIOME))}
Parcelle vide : dalle carrée arrondie d'herbe / de sable / de neige, quelques touffes, cailloux ou congères, rien de construit.

### Décors (\`props/<nom>.png\`)

${table(['Nom', 'Sujet'], Object.entries(P.PROP))}
Fumée : \`props/puff_0..3.png\` — une volute de fumée gris pâle, ronde et duveteuse, bords doux, vue de face, rien d'autre.

### Carte du monde (\`map/…\`)

Villes (\`map/cities/<nom>.png\`) :

${table(['Nom', 'Sujet'], Object.entries(P.MAP).map(([k, v]) => [k.replace('cities/', ''), v]))}
Ressources (\`map/resources/<res>[_desert|_snow].png\`) :

${table(['Ressource', 'Sujet'], Object.entries(P.RES))}
Camps barbares (\`map/camps/<camp1|camp2|camp3|ruins>[_desert|_snow].png\`, \`map/camps/banner_<CIV>.png\`) — la tribu qui tient un point de ressource, ses ruines après la défaite, sa bannière :

${table(['Nom', 'Sujet'], Object.entries(P.CAMP))}
${table(['Variante', 'Ajout au sujet'], Object.entries(P.CAMP_BIOME))}
Relief (\`map/terrain/<nom>.png\`) — les variantes _x, _y s'allongent en diagonale comme le guide, _xy est un massif / un lac large :

${table(['Nom', 'Sujet'], Object.entries(P.TERRAIN))}
Armées en marche (\`map/units/<hoplite|archer|cavalry|catapult>[_<CIV>].png\`, \`map/units/merchant.png\`, \`map/units/settler[_<CIV>].png\` : cortège de colons, chariot bâché et famille à pied) : petit marqueur de carte, deux fantassins / archers, un cavalier, un servant et sa catapulte, aux couleurs et coiffe de la civilisation, marchant vers le bas-droite ; marchand : charrette de caisses tirée par un cheval.

### Chantiers (\`buildings/<CIV>/<CLÉ>_site.png\`, \`fields/<biome>/<TYPE>_site.png\`, \`walls/<CIV>/site_<seg_x|seg_z|tower>.png\`, \`props/scaffold_<CIV>_<1|2|3>.png\`, \`props/worker_<CIV>_<0..3>.png\`)

Un chantier garde l'emprise et la silhouette du bâtiment fini (son rendu sert de guide), à moitié construit, avec les techniques de sa civilisation (\`docs/GRAPHISMES-MANQUANTS.md\` § 1) :

${table(['Civilisation', 'Chantier (ajouté au sujet du bâtiment)'], Object.entries(P.SITE))}
${table(['Civilisation', 'Échafaudage générique'], Object.entries(P.SCAFFOLD))}
${table(['Taille', 'Ajout'], Object.entries(P.SCAFFOLD_SIZE))}
${table(['Civilisation', 'Ouvrier'], Object.entries(P.WORKER))}
${table(['Champ', 'Chantier'], Object.entries(P.FIELD_SITE))}
Coiffes civiles (colons, chefs de tribu) : ${table(['Civilisation', 'Coiffe'], Object.entries(P.CIVIL_HEAD))}
### Enceinte (\`walls/<CIV>/<1|2|3>_<seg_x|seg_z>[_low][_snow].png\`, \`walls/<CIV>/<1|2|3>_tower[_snow].png\`)

${table(['Civilisation', 'Courtine', 'Tour d\'angle'], Object.keys(P.WALL_KIND).map(k => [k, P.WALL_KIND[k], P.TOWER_KIND[k]]))}
${table(['Palier', 'État'], Object.entries(P.WALL_TIER))}
Un tronçon est coupé net et droit aux deux bouts pour se raccorder à ses copies ; \`_low\` = muret à hauteur de genou (devant la ville).

### Unités et héros

Classes (\`figures/<CLASSE>_<CIV>.png\` en pied, \`busts/<CLASSE>[_<CIV>].png\` en jeton) :

${table(['Classe', 'Sujet'], Object.entries(P.CLASS))}
Héros (\`heroes/<CIV>.png\` sur estrade, \`heroes/<CIV>_bust.png\` en jeton) : héros de la civilisation avec sa coiffe, cape, épée et bouclier rond, sur un socle de pierre rond.

### Scènes (\`scenes/<nom>.png\`)

${table(['Nom', 'Sujet'], Object.entries(P.SCENE))}
### Icônes (\`ui/<nom>.png\`) — un seul objet centré, lisible en petit

${table(['Nom', 'Sujet'], Object.entries(P.ICON_DESC))}
Objets du héros (\`ui/item_<clé>.png\`) : iron_sword, steel_sword, bronze_helm, iron_helm, leather_armor, chain_mail, iron_boots, war_boots, gold_ring, war_amulet, wooden_shield, iron_shield, leather_pants, chain_legs, crate — l'objet seul, centré, vue trois-quarts.

### Habillage d'interface (\`ui/…\`)

Boutons (\`ui/btn-<primary|secondary|danger|gold|info>[-pressed].png\`, 1024 carré puis utilisés étirés) : plaque rectangulaire arrondie de face, couleur ${Object.entries(P.UI_BUTTON).map(([k, v]) => `${k} = ${v}`).join(', ')}, reflet doux en haut, liseré doré, contour sombre ; \`-pressed\` plus sombre et plat.

${table(['Nom', 'Sujet'], Object.entries(P.UI_FRAME))}
### Textures de sol (\`terrain/<grass|dirt|sand|snow>.png\`, sans guide)

${table(['Nom', 'Sujet'], Object.entries(P.TEXTURE))}
### Emblème (\`logo/medallion.png\`)

Casque de légionnaire doré à cimier rouge en vue trois-quarts, dans un médaillon de bronze cerclé d'or encadré de deux branches de laurier dorées ; de face, centré, fond transparent.

## 4. Exemples de prompts assemblés

Bâtiment principal hun, palier courant :
${ex('buildings/HUN/MAIN_HALL.webp')}
Caserne gauloise, palier 1, enneigée :
${ex('buildings/GAUL/BARRACKS_t1_snow.webp')}
Chaîne de montagnes (variante _xy) :
${ex('map/terrain/forest_mountain_xy.webp')}
Figurine de cavalerie sultane :
${ex('figures/CAVALRY_SULTAN.webp')}
Jeton d'archer égyptien :
${ex('busts/ARCHER_EGYPT.webp')}
Texture d'herbe :
${ex('terrain/grass.webp')}
`;
fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', 'PROMPTS-GRAPHIQUES.md'), md);
console.log('docs/PROMPTS-GRAPHIQUES.md :', md.split('\n').length, 'lignes');
