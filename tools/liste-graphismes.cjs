// Génère docs/LISTE-GRAPHISMES.md : tout ce que le jeu affiche, par catégorie, avec l'état (peint / rendu 3D provisoire)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..') + '/';
const m3d = JSON.parse(fs.readFileSync(root + 'frontend/assets/images/3d/manifest.json', 'utf8'));
const painted = new Set(JSON.parse(fs.readFileSync(root + 'frontend/assets/images/painted/manifest.json', 'utf8')).files);
const cat = (c) => m3d.categories[c] || [];
const n = (list) => list.length, p = (list) => list.filter(f => painted.has(f)).length;
const row = (label, list, size, usage) => `| ${label} | ${n(list)} | ${p(list)} | **${n(list) - p(list)}** | ${size} | ${usage} |`;
const FACTIONS = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
const FN = { ROME: 'Rome', GAUL: 'Gaule', GREEK: 'Grèce', EGYPT: 'Égypte', HUN: 'Huns', SULTAN: 'Sultanat' };
const b = cat('buildings');
const bsel = (f, v) => b.filter(x => x.startsWith(`buildings/${f}/`) && (v === 'cur' ? !/_t1|_t3|_snow/.test(x) : v === 't1' ? /_t1\.webp$/.test(x) : v === 't3' ? /_t3\.webp$/.test(x) : /_snow\.webp$/.test(x)));
const cell = (list) => `${p(list)} / ${n(list)}`;
const walls = cat('walls'), fields = cat('fields'), plots = cat('plots'), props = cat('props').filter(x => !/puff|ripple/.test(x));
const map = cat('map'), mapCities = map.filter(x => x.startsWith('map/cities/')), mapRes = map.filter(x => x.startsWith('map/resources/')), mapTerrain = map.filter(x => x.startsWith('map/terrain/')), mapUnits = map.filter(x => x.startsWith('map/units/'));
const figures = cat('figures'), busts = cat('busts'), heroes = cat('heroes'), scenes = cat('scenes'), icons = cat('icons'), frames = cat('uiframes');
const terrain = ['terrain/grass.webp', 'terrain/dirt.webp', 'terrain/sand.webp', 'terrain/snow.webp'];
const all = [...b, ...walls, ...fields, ...plots, ...props, ...map, ...figures, ...busts, ...heroes, ...scenes, ...icons, ...frames, ...terrain];
const missingIcons = icons.filter(f => !painted.has(f)).map(f => f.replace('ui/', '').replace('.webp', ''));
const missingFrames = frames.filter(f => !painted.has(f)).map(f => f.replace('ui/', '').replace('.webp', ''));
const missingProps = props.filter(f => !painted.has(f)).map(f => f.replace('props/', '').replace('.webp', ''));
const missingWalls = walls.filter(f => !painted.has(f));

let md = `# Liste de tous les graphismes du jeu

Document de référence pour la production des images : **tout ce que le jeu affiche**, catégorie par catégorie, avec
le nombre d'images, leur état (déjà peinte, ou rendu 3D provisoire à remplacer) et la priorité conseillée.
Les prompts détaillés de chaque sujet sont dans \`docs/PROMPTS-GRAPHIQUES.md\`, les règles de livraison dans \`art/incoming/README.md\`
(nom identique au guide, fond transparent, 1024×1024 pour les sprites, 1024×1536 / 1536×1024 pour les scènes).

Généré par \`node tools/liste-graphismes.cjs\` à partir des manifestes \`frontend/assets/images/3d/manifest.json\`
(rendus 3D, utilisés tant qu'une version peinte n'existe pas) et \`frontend/assets/images/painted/manifest.json\` (versions peintes).

## 1. Résumé

| | Images |
|---|---|
| Visuels affichés par le jeu (hors animations qui restent en 3D) | **${n(all)}** |
| Déjà peints | ${p(all)} |
| Restant à produire | **${n(all) - p(all)}** |
| Animations conservées en rendu 3D (drapeaux 8 phases × 8 couleurs, fumée et ondes 4 phases) | ${n(cat('flags')) + n(cat('effects'))} |
| Emblème (icône de l'application, favicon, splash), conservé | 1 |

Rien ne bloque le jeu : chaque image manquante garde son rendu 3D. Produire par lots, dans l'ordre de la section 2.

## 2. Ordre de production conseillé (du plus visible au moins visible)

1. **Bâtiments de sa propre ville, palier courant** (niveaux 7-13) : 39 bâtiments × 6 civilisations. Commencer par la civilisation qu'on joue le plus ; Rome, Gaule et Égypte sont les plus avancées (voir la matrice § 3.1).
2. **Champs** (4 types × 3 paliers × 3 biomes), **parcelles vides** (3 biomes × 2) et **décors** de scène : ce que l'on voit autour de la ville à chaque connexion.
3. **Enceinte** : courtines et tours par civilisation et par palier du Mur (6 × 3 × 5), puis les variantes neige.
4. **Carte du monde** : villes (${n(mapCities)}), ressources (${n(mapRes)}), relief et eau (${n(mapTerrain)}), armées en marche (${n(mapUnits)}).
5. **Unités et héros** : figurines en pied (${n(figures)}), bustes-jetons (${n(busts)}), héros sur estrade et bustes (${n(heroes)}) ; ils apparaissent dans toutes les listes, les rapports et l'écran du héros.
6. **Scènes** : connexion (portrait + paysage), 6 estrades de héros, 5 bandeaux d'écran, champ de bataille (${n(scenes)} au total).
7. **Paliers 1 et 3 des bâtiments** (version hutte des niveaux 1-6, version monumentale des niveaux 14-20) puis **variantes neige** de tout (bâtiments, champs, murs) : seulement pour les villes du biome neige.
8. **Compléments** (§ 4) : porte de la ville par civilisation, cycles de marche, poses de combat, fonds de scène par biome.

## 3. Inventaire détaillé

Colonnes : total d'images, déjà peintes, **restant**, taille, où le joueur les voit.

### 3.1 Bâtiments — \`buildings/<CIV>/<CLÉ>[_t1|_t3][_snow].png\`

39 bâtiments (liste dans \`docs/PROMPTS-GRAPHIQUES.md\` § 3), chacun en 4 versions : courante (niveaux 7-13), **_t1** (niveaux 1-6, petite et simple),
**_t3** (niveaux 14-20, monumentale), et chacune des trois en **_snow** (ville du biome neige). Taille 1024×1024, cadre « building ».

| Civilisation | Courant (peints / total) | Palier 1 (_t1) | Palier 3 (_t3) | Neige (_snow, les 3 paliers) | Restant |
|---|---|---|---|---|---|
`;
for (const f of FACTIONS) {
  const cur = bsel(f, 'cur'), t1 = bsel(f, 't1'), t3 = bsel(f, 't3'), snow = bsel(f, 'snow');
  const tot = [...cur, ...t1, ...t3, ...snow];
  md += `| ${FN[f]} | ${cell(cur)} | ${cell(t1)} | ${cell(t3)} | ${cell(snow)} | **${n(tot) - p(tot)}** |\n`;
}
md += `| **Total** | ${cell(b.filter(x => !/_t1|_t3|_snow/.test(x)))} | ${cell(b.filter(x => /_t1\.webp$/.test(x)))} | ${cell(b.filter(x => /_t3\.webp$/.test(x)))} | ${cell(b.filter(x => /_snow\.webp$/.test(x)))} | **${n(b) - p(b)}** |

Priorité : le palier courant des 6 civilisations (${n(b.filter(x => !/_t1|_t3|_snow/.test(x))) - p(b.filter(x => !/_t1|_t3|_snow/.test(x)))} restants), puis _t1, puis _t3, et la neige en dernier.

### 3.2 Champs, parcelles, décors, textures de sol

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
${row('Champs `fields/<forest|desert|snow>/<FARM|LUMBER|QUARRY|IRON_MINE>_<1|2|3>.png`', fields, '1024², cadre building', 'couronne de champs autour de la ville, 3 paliers de niveau, 3 biomes')}
${row('Parcelles vides `plots/<biome>_<0|1>.png`', plots, '1024², cadre building', 'emplacements libres de la ville et des champs')}
${row('Décors `props/<nom>.png` (arbres, rochers, buissons, palmiers, cactus, dunes, souche, fleurs)', props, '1024², cadre prop', 'autour de la ville et des champs selon le biome')}
${row('Textures de sol `terrain/<grass|dirt|sand|snow>.png` (répétables)', terrain, '1024², sans guide', 'sol de la ville, chemins, sable, neige')}

Décors restants : ${missingProps.length ? missingProps.join(', ') : 'aucun'}.

### 3.3 Enceinte — \`walls/<CIV>/<1|2|3>_<seg_x|seg_z>[_low][_snow].png\`, \`walls/<CIV>/<1|2|3>_tower[_snow].png\`

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
${row('Courtines hautes (2 orientations), murets (2) et tour d\'angle, × 3 paliers du Mur, × 6 civilisations, × neige', walls, '1024², cadre building', 'mur d\'enceinte de la ville, change avec le niveau du Mur (1-6, 7-13, 14-20)')}

Peints : ${walls.filter(f => painted.has(f)).map(f => f.replace('walls/', '').replace('.webp', '')).join(', ') || 'aucun'} (Rome, palier 3). Ordre conseillé : palier 2 puis 3 puis 1 de chaque civilisation ; neige en dernier.

### 3.4 Carte du monde — \`map/…\`

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
${row('Villes `map/cities/<rome|gaul|greek|egypt|hun|sultan|default|capital|capital_<civ>>.png`', mapCities, '1024², cadre map', 'villes et capitales des joueurs sur la carte')}
${row('Ressources `map/resources/<wood|stone|iron|food|gold>[_desert|_snow].png`', mapRes, '1024², cadre map', 'points de ressource gardés par les tribus')}
${row('Relief et eau `map/terrain/…` (forêt, montagnes, dunes, ruines, rochers, sapins, montagnes de glace, lacs, lacs gelés, oasis ; formes isolée, _x, _y, _xy)', mapTerrain, '1024², cadre map', 'obstacles infranchissables (montagnes, eau) et décor de la carte')}
${row('Armées en marche `map/units/<hoplite|archer|cavalry|catapult>[_<CIV>].png`, `map/units/merchant.png`', mapUnits, '1024², cadre mapunit', 'marqueurs des armées et marchands en déplacement')}

### 3.5 Unités et héros

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
${row('Figurines en pied `figures/<INFANTRY|ARCHER|CAVALRY|SIEGE>_<CIV>.png`', figures, '1024², cadre figure', 'fiches d\'unité, cartes de recrutement, onglet Armée')}
${row('Bustes-jetons `busts/<CLASSE>[_<CIV>].png` (neutre + 6 civilisations)', busts, '1024², cadre bust', 'listes compactes, rapports de bataille, composition d\'armée, carte')}
${row('Héros `heroes/<CIV>.png` (en pied) et `heroes/<CIV>_bust.png`', heroes, '1024², cadres figure / bust', 'écran du héros, cartes d\'armée, choix de civilisation')}

### 3.6 Scènes — \`scenes/<nom>.png\`

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
${row('Connexion `auth-portrait` (1024×1536) et `auth-landscape` (1536×1024)', scenes.filter(x => x.includes('auth-')), 'voir libellé', 'écran de connexion et d\'inscription')}
${row('Estrades de héros `hero-<CIV>`', scenes.filter(x => x.includes('hero-')), '1024×1536, cadre stage', 'écran du héros')}
${row('Bandeaux `header-<market|alliance|ranking|inventory|reports>`', scenes.filter(x => x.includes('header-')), '1536×1024, cadre header', 'bandeau en tête des écrans Marché, Alliance, Classement, Sac, Rapports')}
${row('Champ de bataille `battlefield`', scenes.filter(x => x.includes('battlefield')), '1536×1024, cadre scene', 'fond du replay de bataille')}

### 3.7 Interface — \`ui/…\`

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
${row('Icônes (ressources, actions, onglets, objets du héros `item_<clé>`)', icons, '1024², cadre icon', 'partout : barre de ressources, navigation, boutons, fiches, inventaire')}
${row('Habillage : boutons `btn-<primary|secondary|danger|gold|info>[-pressed]`, cadres `frame-panel`, `frame-modal`, plaques `plate-parchment`, `plate-dark`, barre `bar-wood`', frames, '1024², cadre ui', 'boutons, fenêtres, panneaux, barres de ressources et de navigation')}

Icônes restantes : ${missingIcons.length ? missingIcons.join(', ') : 'aucune'}. Habillage restant : ${missingFrames.length ? missingFrames.join(', ') : 'aucun'}.
> L'habillage peint ne s'active dans le jeu que lorsque **toutes** ses pièces sont peintes (boutons, cadres, plaques, barre) : il manque aujourd'hui ${missingFrames.length ? '`' + missingFrames.join('`, `') + '`' : 'rien'}.

### 3.8 Emblème et animations (conservés)

- \`logo/medallion.png\` : casque doré dans un médaillon de laurier (icône de l'application, favicon, splash). À repeindre seulement si l'on veut changer l'identité visuelle.
- Drapeaux (8 phases × 8 couleurs) et fumée / ondes (4 phases) : animations générées en 3D, cohérentes entre elles, à garder.

## 4. Compléments non couverts par les manifestes (nouveaux besoins)

À produire après l'inventaire ci-dessus, si l'on veut aller plus loin (voir aussi \`docs/ETAT-DES-SYSTEMES.md\` § Animations) :

| Besoin | Images | Taille | Pourquoi |
|---|---|---|---|
| Porte de la ville par civilisation \`walls/<CIV>/gate[_snow].png\` | 6 (+ 6 neige) | 1024², cadre building | la porte sud-ouest est aujourd'hui dessinée par le code ; une porte peinte par style d'architecture serait plus belle |
| Cycle de marche des unités de carte (4 images par classe + marchand), série neutre recolorée par faction | 20 | 64×64 ou 1024² recadré | animation de marche plus vivante sur la carte (le trottinement actuel est fait par le code) |
| Poses de combat (frappe, garde) par classe pour le replay de bataille | 8 | 1024², cadre figure | replay plus lisible |
| Fond de scène de ville par biome (horizon : forêt, désert, neige, rivage) | 4 | 1536×512 | arrière-plan derrière la ville (aujourd'hui tuiles de carte + décors) |
| Portraits de héros supplémentaires (un héros par civilisation existe déjà) | 0 à 6 | 1024², cadre bust | seulement si l'on veut plusieurs héros par civilisation |

## 5. Livraison et intégration

1. Nommer chaque fichier exactement comme son guide (\`docs/PROMPTS-GRAPHIQUES.md\`, kits \`guides/…\`) : \`buildings/HUN/MAIN_HALL.png\`, \`walls/GAUL/3_tower.png\`, \`map/terrain/water_xy.png\`…
2. Fond transparent (sinon magenta #FF00FF ou vert #00FF00), sujet à la place et à la taille du guide.
3. Déposer les fichiers (ou un zip) dans \`art/incoming/\`, par lots ; ce qui manque garde le rendu 3D.
4. Intégration : \`node tools/repaint.cjs --import=art/incoming\`, vérification en jeu (bureau + mobile), commit.
`;
fs.writeFileSync(root + 'docs/LISTE-GRAPHISMES.md', md);
console.log('docs/LISTE-GRAPHISMES.md écrit :', n(all), 'visuels,', p(all), 'peints,', n(all) - p(all), 'restants');
