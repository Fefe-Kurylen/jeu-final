// Génère docs/LISTE-GRAPHISMES.md : tout ce que le jeu affiche, par catégorie, avec l'état (peint / rendu 3D provisoire)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..') + '/';
const m3d = JSON.parse(fs.readFileSync(root + 'frontend/assets/images/3d/manifest.json', 'utf8'));
const painted = new Set(JSON.parse(fs.readFileSync(root + 'frontend/assets/images/painted/manifest.json', 'utf8')).files);
const buildingsData = JSON.parse(fs.readFileSync(root + 'data/buildings.json', 'utf8')).buildings;
const { BUILDING: SUBJECT, FACTION: ARCHI } = require('./repaint/prompts.cjs');
const { buildAllTargets } = require('./repaint/targets.cjs');
// Camps barbares : pas de rendu 3D, uniquement dans le registre des livrables
const mapCamps = buildAllTargets().filter(t => t.file.startsWith('map/camps/')).map(t => t.file);
// Un bâtiment de faction (Thermes, Brasserie…) n'est jamais affiché chez une autre civilisation : ses rendus 3D
// dans les autres dossiers ne sont pas à produire
const foreignFaction = (file) => { const m = file.match(/^buildings\/([A-Z]+)\/([A-Z_]+?)(?:_t1|_t3)?(?:_snow)?\.webp$/); if (!m) return false; const d = buildingsData.find(b => b.key === m[2]); return !!(d && d.faction && d.faction !== m[1]); };
const cat = (c) => m3d.categories[c] || [];
const n = (list) => list.length, p = (list) => list.filter(f => painted.has(f)).length;
const row = (label, list, size, usage) => `| ${label} | ${n(list)} | ${p(list)} | **${n(list) - p(list)}** | ${size} | ${usage} |`;
const FACTIONS = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
const FN = { ROME: 'Rome', GAUL: 'Gaule', GREEK: 'Grèce', EGYPT: 'Égypte', HUN: 'Huns', SULTAN: 'Sultanat' };
const b = cat('buildings').filter(f => !foreignFaction(f));
const bsel = (f, v) => b.filter(x => x.startsWith(`buildings/${f}/`) && (v === 'cur' ? !/_t1|_t3|_snow/.test(x) : v === 't1' ? /_t1\.webp$/.test(x) : v === 't3' ? /_t3\.webp$/.test(x) : /_snow\.webp$/.test(x)));
const cell = (list) => `${p(list)} / ${n(list)}`;
const walls = cat('walls'), fields = cat('fields'), plots = cat('plots'), props = cat('props').filter(x => !/puff|ripple/.test(x));
const map = cat('map'), mapCities = map.filter(x => x.startsWith('map/cities/')), mapRes = map.filter(x => x.startsWith('map/resources/')), mapTerrain = map.filter(x => x.startsWith('map/terrain/')), mapUnits = map.filter(x => x.startsWith('map/units/'));
const mapAll = [...map, ...mapCamps];
const figures = cat('figures'), busts = cat('busts'), heroes = cat('heroes'), scenes = cat('scenes'), icons = cat('icons'), frames = cat('uiframes');
const terrain = ['terrain/grass.webp', 'terrain/dirt.webp', 'terrain/sand.webp', 'terrain/snow.webp'];
// Variantes du biome neige (hors carte du monde, visible par tous) : reportées
const isSnow = (x) => !x.startsWith('map/') && (/_snow\.webp$/.test(x) || /^fields\/snow\//.test(x) || /^plots\/snow_/.test(x) || /^props\/snow/.test(x));
const everything = [...b, ...walls, ...fields, ...plots, ...props, ...mapAll, ...figures, ...busts, ...heroes, ...scenes, ...icons, ...frames, ...terrain];
const snow = everything.filter(isSnow);
const all = everything.filter(x => !isSnow(x));
const bNoSnow = b.filter(x => !isSnow(x)), wallsNoSnow = walls.filter(x => !isSnow(x)), fieldsNoSnow = fields.filter(x => !isSnow(x)), plotsNoSnow = plots.filter(x => !isSnow(x)), propsNoSnow = props.filter(x => !isSnow(x));
const missingIcons = icons.filter(f => !painted.has(f)).map(f => f.replace('ui/', '').replace('.webp', ''));
const missingFrames = frames.filter(f => !painted.has(f)).map(f => f.replace('ui/', '').replace('.webp', ''));
const missingProps = propsNoSnow.filter(f => !painted.has(f)).map(f => f.replace('props/', '').replace('.webp', ''));
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
| Visuels affichés par le jeu, hors neige et animations | **${n(all)}** |
| Déjà peints | ${p(all)} |
| Restant à produire | **${n(all) - p(all)}** |
| Variantes du biome neige, **reportées à plus tard** (bâtiments et enceinte \`_snow\`, champs, parcelles et décors enneigés) | ${n(snow)} (dont ${p(snow)} déjà peintes) |
| Animations conservées en rendu 3D (drapeaux 8 phases × 8 couleurs, fumée et ondes 4 phases) | ${n(cat('flags')) + n(cat('effects'))} |
| Emblème (icône de l'application, favicon, splash), conservé | 1 |

Rien ne bloque le jeu : chaque image manquante garde son rendu 3D. Produire par lots, dans l'ordre de la section 2.
Les variantes enneigées ne sont pas à produire pour l'instant (décision d'octobre 2026) : elles ne concernent que les villes du biome neige et gardent leur rendu 3D ; voir § 6.

## 2. Ordre de production conseillé (du plus visible au moins visible)

1. **Bâtiments de sa propre ville, palier courant** (niveaux 7-13) : 34 bâtiments × 6 civilisations (liste par civilisation : \`docs/LISTE-BATIMENTS-PAR-FACTION.md\`). Commencer par la civilisation qu'on joue le plus ; Rome, Gaule et Égypte sont les plus avancées (voir la matrice § 3.1).
2. **Champs** (4 types × 3 paliers × 3 biomes), **parcelles vides** (3 biomes × 2) et **décors** de scène : ce que l'on voit autour de la ville à chaque connexion.
3. **Enceinte** : courtines et tours par civilisation et par palier du Mur (6 × 3 × 5), puis les variantes neige.
4. **Carte du monde** : villes (${n(mapCities)}), ressources (${n(mapRes)}), camps barbares (${n(mapCamps)}), relief et eau (${n(mapTerrain)}), armées en marche (${n(mapUnits)}).
5. **Unités et héros** : figurines en pied (${n(figures)}), bustes-jetons (${n(busts)}), héros sur estrade et bustes (${n(heroes)}) ; ils apparaissent dans toutes les listes, les rapports et l'écran du héros.
6. **Scènes** : connexion (portrait + paysage), 6 estrades de héros, 5 bandeaux d'écran, champ de bataille (${n(scenes)} au total).
7. **Paliers 1 et 3 des bâtiments** (version hutte des niveaux 1-6, version monumentale des niveaux 14-20). Les **variantes neige** sont reportées (§ 6).
8. **Compléments** (§ 4) : porte de la ville par civilisation, cycles de marche, poses de combat, fonds de scène par biome.

## 3. Inventaire détaillé

Colonnes : total d'images, déjà peintes, **restant**, taille, où le joueur les voit.

### 3.1 Bâtiments — \`buildings/<CIV>/<CLÉ>[_t1|_t3][_snow].png\`

34 bâtiments par civilisation (33 communs + son bâtiment de faction ; liste détaillée par civilisation dans \`docs/LISTE-BATIMENTS-PAR-FACTION.md\`), chacun en 3 versions : courante (niveaux 7-13), **_t1** (niveaux 1-6, petite et simple),
**_t3** (niveaux 14-20, monumentale). La version **_snow** de chacune (ville du biome neige) est reportée. Taille 1024×1024, cadre « building ».

| Civilisation | Courant (peints / total) | Palier 1 (_t1) | Palier 3 (_t3) | Restant (hors neige) | Neige (_snow, reportée) |
|---|---|---|---|---|---|
`;
for (const f of FACTIONS) {
  const cur = bsel(f, 'cur'), t1 = bsel(f, 't1'), t3 = bsel(f, 't3'), snow = bsel(f, 'snow');
  const tot = [...cur, ...t1, ...t3];
  md += `| ${FN[f]} | ${cell(cur)} | ${cell(t1)} | ${cell(t3)} | **${n(tot) - p(tot)}** | ${cell(snow)} |\n`;
}
md += `| **Total** | ${cell(b.filter(x => !/_t1|_t3|_snow/.test(x)))} | ${cell(b.filter(x => /_t1\.webp$/.test(x)))} | ${cell(b.filter(x => /_t3\.webp$/.test(x)))} | **${n(bNoSnow) - p(bNoSnow)}** | ${cell(b.filter(x => /_snow\.webp$/.test(x)))} |

Priorité : le palier courant des 6 civilisations (${n(b.filter(x => !/_t1|_t3|_snow/.test(x))) - p(b.filter(x => !/_t1|_t3|_snow/.test(x)))} restants), puis _t1, puis _t3. Neige reportée.

### 3.2 Champs, parcelles, décors, textures de sol

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
${row('Champs `fields/<forest|desert>/<FARM|LUMBER|QUARRY|IRON_MINE>_<1|2|3>.png` (neige reportée)', fieldsNoSnow, '1024², cadre building', 'couronne de champs autour de la ville, 3 paliers de niveau, biomes prairie et désert')}
${row('Parcelles vides `plots/<forest|desert>_<0|1>.png` (neige reportée)', plotsNoSnow, '1024², cadre building', 'emplacements libres de la ville et des champs')}
${row('Décors `props/<nom>.png` (arbres, rochers, buissons, palmiers, cactus, dunes, souche, fleurs ; neige reportée)', propsNoSnow, '1024², cadre prop', 'autour de la ville et des champs selon le biome')}
${row('Textures de sol `terrain/<grass|dirt|sand|snow>.png` (répétables)', terrain, '1024², sans guide', 'sol de la ville, chemins, sable, neige')}

Décors restants : ${missingProps.length ? missingProps.join(', ') : 'aucun'}.

### 3.3 Enceinte — \`walls/<CIV>/<1|2|3>_<seg_x|seg_z>[_low].png\`, \`walls/<CIV>/<1|2|3>_tower.png\` (variantes _snow reportées)

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
${row('Courtines hautes (2 orientations), murets (2) et tour d\'angle, × 3 paliers du Mur, × 6 civilisations', wallsNoSnow, '1024², cadre building', 'mur d\'enceinte de la ville, change avec le niveau du Mur (1-6, 7-13, 14-20)')}

Peints : ${walls.filter(f => painted.has(f)).map(f => f.replace('walls/', '').replace('.webp', '')).join(', ') || 'aucun'} (Rome, palier 3). Ordre conseillé : palier 2 puis 3 puis 1 de chaque civilisation.

### 3.4 Carte du monde — \`map/…\`

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
${row('Villes `map/cities/<rome|gaul|greek|egypt|hun|sultan|default|capital|capital_<civ>>.png`', mapCities, '1024², cadre map', 'villes et capitales des joueurs sur la carte')}
${row('Ressources `map/resources/<wood|stone|iron|food|gold>[_desert|_snow].png`', mapRes, '1024², cadre map', 'points de ressource gardés par les tribus')}
${row('Camps barbares `map/camps/camp<1|2|3>[_desert|_snow].png`, `map/camps/ruins[_desert|_snow].png`, `map/camps/banner_<CIV>.png`', mapCamps, '1024², cadre map', 'camp de la tribu sur le point de ressource (niveau et biome), ruines jusqu\'à la réapparition, bannière de la tribu ; sans eux, l\'icône de ressource reste')}
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

Vérifié en octobre 2026 en relevant toutes les images que le client référence (icônes, scènes, carte, ville, héros, replay,
boutique) : **tout ce qui s'affiche en jeu est dans l'inventaire ci-dessus**. Restent des éléments dessinés par le code,
quelques glyphes vectoriels et les visuels hors jeu (boutique, natif). Fiches détaillées, prompts et animations : \`docs/GUIDE-COMPLEMENTS-ANIMATIONS.md\`. À produire après l'inventaire, par ordre d'intérêt :

| Besoin | Images | Taille | Pourquoi |
|---|---|---|---|
| Porte de la ville par civilisation \`walls/<CIV>/gate.png\` (neige reportée) | 6 | 1024², cadre building | le vantail de la porte sud-ouest est dessiné par le code ; une porte peinte par style d'architecture serait plus belle |
| Chantier (échafaudage) en trois tailles \`props/scaffold_<1|2|3>.png\` | 3 | 1024², cadre building | aujourd'hui le bâtiment en travaux clignote avec un marteau ; un échafaudage posé dessus fait plus « Rise of Kingdoms » |
| Panneau « construire ici » \`props/sign_build.png\` | 1 | 1024², cadre prop | l'emplacement libre est un losange pointillé avec un « + » dessiné par le code |
| Cycle de marche des unités de carte (4 images par classe + marchand), série neutre recolorée par faction | 20 | 64×64 ou 1024² recadré | animation de marche plus vivante sur la carte (le trottinement actuel est fait par le code) |
| Poses de combat (frappe, garde) par classe pour le replay de bataille | 8 | 1024², cadre figure | replay plus lisible |
| Projectiles et impacts du replay : flèche, pierre de catapulte, éclat d'impact, nuage de poussière | 4 | 256², sans guide | aujourd'hui tracés par le code (traits et ronds) |
| Emblème (blason) de chaque civilisation \`ui/crest_<CIV>.png\` | 6 | 1024², cadre icon | choix de civilisation, alliance, étiquettes de carte ; aujourd'hui on réutilise le buste du héros |
| Vignettes des destinations d'expédition (forêt, désert, montagne, ruines) | 4 | 1536×1024, cadre header | l'écran des expéditions n'a que des icônes |
| Boutons ronds des bulles d'action (normal, appuyé) \`ui/btn-round[-pressed].png\` | 2 | 1024², cadre ui | les bulles d'action utilisent un dégradé CSS |
| **Jeu complet de textures de sol** (variantes par biome, eau et glace, dallages par civilisation, chemins, champs, décalques, bordures) — fiches dans \`docs/GUIDE-COMPLEMENTS-ANIMATIONS.md\` § T | 55 | 1024², répétables (décalques : fond transparent ; bordures : 1024×256) | aujourd'hui quatre sols seulement, le reste est dessiné par le code ; c'est ce qui donne la richesse de Rise of Kingdoms |
| Fond de scène de ville par biome (horizon : forêt, désert, neige, rivage) | 4 | 1536×512 | facultatif : la ville a maintenant son propre sol et son décor |
| Portraits de héros supplémentaires (un héros par civilisation existe déjà) | 0 à 6 | 1024², cadre bust | seulement si l'on veut plusieurs héros par civilisation |

**Sols et ville** : tout ce qui compose la ville est dans l'inventaire (bâtiments, enceinte, champs, parcelles, décors, textures de sol herbe / terre / sable / neige, déjà peintes). Le sol de l'enceinte est la texture du biome éclaircie, la plaza et les avenues sont la texture de terre battue, la route extérieure aussi ; le vantail de la porte, les plans d'eau, les surlignages et les badges sont dessinés par le code. Le jeu complet de 55 textures et décalques (guide § T) couvre tout ce que le sol peut montrer ; avec lui, plus rien du sol n'est dessiné par le code.

Glyphes vectoriels conservés tels quels (fonctionnels, sans guide) : \`ui/sun.svg\`, \`moon.svg\` (jour / nuit), \`left.svg\`, \`right.svg\` (sélecteur de ville), \`plus.svg\`, \`minus.svg\` (zoom), \`close.svg\`, \`info.svg\`, \`menu.svg\` (fermer, information, menu). À repeindre seulement par souci d'unité : 9 images 1024², cadre icon.

Dans l'inventaire mais jamais affichées (peuvent être ignorées) : icônes \`amphora\`, \`bow\`, plaque \`plate-dark\`.

### 4 bis. Hors jeu : boutique et application native

| Besoin | État | Taille |
|---|---|---|
| Icône de l'application (iOS, Android adaptatif : premier plan + fond) | ✅ générée depuis l'emblème (\`frontend/assets/images/icon-1024.png\`, \`android/.../ic_launcher*\`, \`ios/.../AppIcon\`) | 1024² |
| Écran de démarrage (splash) iOS et Android | ✅ généré (\`splash-2732x2732.png\`, \`drawable-*/splash.png\`) | 2732² |
| Captures d'écran iPhone (App Store) et téléphone (Google Play) | ✅ générées par \`node tools/store-screenshots.cjs\` | 1290×2796 (6,7"), 1242×2688 (6,5") |
| **Captures d'écran iPad** : l'application cible aussi l'iPad (\`TARGETED_DEVICE_FAMILY = 1,2\`), l'App Store les exige alors | ✅ générées par le même outil (taille ajoutée) ; sinon limiter l'app à l'iPhone dans Xcode | 2048×2732 (12,9") |
| iPhone : icône (une seule image 1024, Xcode décline les tailles), écran de démarrage, pas d'icône de notification à fournir (iOS utilise l'icône de l'app) | ✅ rien à produire | — |
| **Icône de notification Android** (monochrome blanc sur fond transparent, \`ic_stat_notify\`) | ❌ à produire : sans elle Android affiche un carré blanc pour les notifications push | 96×96 (xxxhdpi) + 72, 48, 36, 24 |
| **Bannière Google Play** (feature graphic) | ❌ à produire : obligatoire sur la fiche Play | 1024×500, JPG ou PNG sans transparence |
| Image de promotion App Store (facultative) et vidéo d'aperçu | 🔧 facultatif (vidéo : enregistrer le simulateur, 15-30 s) | 1080×1920 |

## 5. Livraison et intégration

1. Nommer chaque fichier exactement comme son guide (\`docs/PROMPTS-GRAPHIQUES.md\`, kits \`guides/…\`) : \`buildings/HUN/MAIN_HALL.png\`, \`walls/GAUL/3_tower.png\`, \`map/terrain/water_xy.png\`…
2. Fond transparent (sinon magenta #FF00FF ou vert #00FF00), sujet à la place et à la taille du guide.
3. Déposer les fichiers (ou un zip) dans \`art/incoming/\`, par lots ; ce qui manque garde le rendu 3D.
4. Intégration : \`node tools/repaint.cjs --import=art/incoming\`, vérification en jeu (bureau + mobile), commit.

## 6. Reporté : les variantes du biome neige

Mises de côté pour l'instant (elles ne concernent que les villes fondées dans la neige et gardent leur rendu 3D) :

| Catégorie | Images | Déjà peintes |
|---|---|---|
| Bâtiments \`buildings/<CIV>/<CLÉ>[_t1|_t3]_snow.png\` | ${n(b.filter(isSnow))} | ${p(b.filter(isSnow))} |
| Enceinte \`walls/<CIV>/…_snow.png\` | ${n(walls.filter(isSnow))} | ${p(walls.filter(isSnow))} |
| Champs \`fields/snow/…\`, parcelles \`plots/snow_<0|1>.png\`, décors \`props/snowpine.png\` et \`props/snowrock.png\` | ${n([...fields, ...plots, ...props].filter(isSnow))} | ${p([...fields, ...plots, ...props].filter(isSnow))} |

Le relief enneigé de la carte du monde (\`map/terrain/snow_*\`, \`frozen*\`) et les ressources \`_snow\` restent dans l'inventaire : tout le monde les voit sur la carte.
`;
fs.writeFileSync(root + 'docs/LISTE-GRAPHISMES.md', md);

// ---- docs/LISTE-BATIMENTS-PAR-FACTION.md : les 34 bâtiments d'une civilisation, dans l'ordre où le joueur les voit
const ORDER = ['MAIN_HALL', 'FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'WAREHOUSE', 'SILO', 'RALLY_POINT', 'BARRACKS', 'MARKET', 'ACADEMY', 'FORGE', 'STABLE', 'WALL', 'HEALING_TENT', 'HIDEOUT', 'WATCHTOWER', 'EMBASSY', 'HERO_MANSION', 'RESIDENCE', 'WORKSHOP', 'MILL', 'SAWMILL', 'STONEMASON', 'FOUNDRY', 'BAKERY', 'TREASURE_CHAMBER', 'GREAT_SILO', 'GREAT_WAREHOUSE', 'MOAT', 'TRADE_OFFICE', 'GREAT_BARRACKS', 'GREAT_STABLE'];
const factionBuilding = Object.fromEntries(buildingsData.filter(x => x.faction).map(x => [x.faction, x.key]));
const unlockText = (d) => (d.prereq || []).length ? d.prereq.map(p => `${buildingsData.find(x => x.key === p.key)?.name || p.key} ${p.level}`).join(', ') : '—';
const mark = (file) => painted.has(file) ? '✅' : '☐';
let bf = `# Bâtiments à produire, civilisation par civilisation

Chaque civilisation affiche **34 bâtiments** : 33 communs et son bâtiment de faction. Les cinq bâtiments des autres
civilisations (Thermes, Brasserie, Temple, Poste d'irrigation, Tente de guerre, Poste du désert) ne sont jamais montrés
chez elle : inutile de les peindre pour elle.

Pour chaque bâtiment, trois images (1024×1024, fond transparent, cadre « building ») : **courant** (niveaux 7-13, fichier \`CLÉ.png\`),
**palier 1** (niveaux 1-6, \`CLÉ_t1.png\`, version petite et simple) et **palier 3** (niveaux 14-20, \`CLÉ_t3.png\`, version monumentale).
Soit 102 images par civilisation. Les versions enneigées (\`_snow\`) sont reportées. Les quatre champs (Ferme, Bûcheron, Carrière, Mine)
ont en plus leurs sprites de champ (\`fields/…\`), listés dans \`docs/LISTE-GRAPHISMES.md\`.

Prompt = style commun + consigne de cadrage + composition « building » + **sujet** ci-dessous + **architecture de la civilisation**
(voir \`docs/PROMPTS-GRAPHIQUES.md\` § 1 et § 4 ; le kit \`node tools/repaint.cjs --kit=<dossier>\` fournit le prompt complet et l'image guide de chaque fichier).
Ordre conseillé : celui du tableau (ce que le joueur construit et voit en premier). ✅ = déjà peint, ☐ = à produire.

Généré par \`node tools/liste-graphismes.cjs\`.

`;
for (const civ of FACTIONS) {
  const keys = [...ORDER, factionBuilding[civ]];
  const files = keys.flatMap(k => [`buildings/${civ}/${k}.webp`, `buildings/${civ}/${k}_t1.webp`, `buildings/${civ}/${k}_t3.webp`]);
  const done = files.filter(x => painted.has(x)).length;
  bf += `## ${FN[civ]} (\`buildings/${civ}/\`) — ${files.length - done} images à produire sur ${files.length} (${done} peintes)

Architecture à ajouter à chaque prompt : *${ARCHI[civ]}*

| # | Clé (fichier) | Bâtiment | Sujet (anglais, pour le prompt) | Débloqué par | Courant | _t1 | _t3 |
|---|---|---|---|---|---|---|---|
`;
  keys.forEach((k, i) => {
    const d = buildingsData.find(x => x.key === k) || { name: k };
    bf += `| ${i + 1} | \`${k}\` | ${d.name} | ${SUBJECT[k] || ''} | ${unlockText(d)} | ${mark(`buildings/${civ}/${k}.webp`)} | ${mark(`buildings/${civ}/${k}_t1.webp`)} | ${mark(`buildings/${civ}/${k}_t3.webp`)} |\n`;
  });
  bf += '\n';
}
fs.writeFileSync(root + 'docs/LISTE-BATIMENTS-PAR-FACTION.md', bf);

// ---- docs/A-GENERER.md : tout ce qui reste à produire, fichier par fichier, dans l'ordre conseillé ----
const { TEXTURE, DECAL, EDGE } = require('./repaint/prompts.cjs');
const remaining = (list) => list.filter(f => !painted.has(f));
const asPng = (f) => f.replace(/\.webp$/, '.png');
const sizeOf = (f) => f.startsWith('scenes/') ? (/auth-portrait|hero-/.test(f) ? '1024×1536' : '1536×1024') : '1024×1024';
const civOrder = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
const bCur = (civ) => remaining(b.filter(x => x.startsWith(`buildings/${civ}/`) && !/_t1|_t3|_snow/.test(x)));
const bT1 = (civ) => remaining(b.filter(x => x.startsWith(`buildings/${civ}/`) && /_t1\.webp$/.test(x)));
const bT3 = (civ) => remaining(b.filter(x => x.startsWith(`buildings/${civ}/`) && /_t3\.webp$/.test(x)));
const texRemaining = Object.keys(TEXTURE).filter(n => !painted.has(`terrain/${n}.webp`));
const TEX_GROUP = { base: ['grass_lawn', 'grass_dark', 'grass_dry', 'grass_flowers', 'grass_hills', 'dirt_packed', 'mud', 'gravel', 'sand_ripples', 'sand_rocky', 'cracked_earth', 'snow_fresh', 'snow_trampled', 'tundra'], water: ['water_lake', 'water_deep', 'water_river', 'water_shallow', 'ice'], paving: ['plaza_ROME', 'plaza_GAUL', 'plaza_GREEK', 'plaza_EGYPT', 'plaza_HUN', 'plaza_SULTAN', 'cobble', 'flagstone', 'road_dirt', 'road_paved', 'path_sand'], fields: ['soil_tilled', 'wheat', 'orchard'] };
const STATIC = [
  ['walls/<CIV>/gate.png × 6 (ROME, GAUL, GREEK, EGYPT, HUN, SULTAN)', '1024×1024', 'guide § S1'],
  ['props/sign_build.png', '512×768', 'guide § S2'],
  ['ui/crest_<CIV>.png × 6', '1024×1024', 'guide § S3'],
  ['scenes/expedition-<forest|desert|mountain|ruins>.png × 4', '1536×1024', 'guide § S4'],
  ['ui/btn-round.png, ui/btn-round-pressed.png', '1024×1024', 'guide § S5'],
  ['store/ic_stat_notify.png (icône de notification Android, blanc sur transparent)', '96×96', 'guide § N1'],
  ['store/feature-graphic.png (bannière Google Play)', '1024×500', 'guide § N2']
];
const ANIM = [
  ['A1', 'props/villager_<a|b|c>_<0..5>.png', 18, '512×768', 'villageois qui marchent dans la ville'],
  ['A2', 'props/flame_<0..3>.png, props/brazier_<0..3>.png', 8, '512×768', 'flammes des torches et braseros'],
  ['A3', 'props/scaffold_<1|2|3>.png, props/worker_<0..3>.png', 7, '512×768', 'chantier : échafaudage et ouvrier'],
  ['A4', 'anim/mill_sails_<0..5>.png, anim/sparks_<0..3>.png, anim/furnace_<0..3>.png', 14, '512×512', 'moulin, forge, fonderie'],
  ['A5', 'map/units/<hoplite|archer|cavalry|catapult|merchant>_walk_<0..5>.png', 30, '512×512', 'cycles de marche sur la carte'],
  ['A6', 'map/units/<classe>_attack_<0..2>.png, <classe>_hit_<0..1>.png, fx/arrow.png, fx/stone.png, fx/impact_<0..2>.png', 25, '512×512', 'replay de bataille'],
  ['A7', 'map/fx/battle_<0..3>.png, map/fx/fire_<0..3>.png, map/fx/campfire_<0..3>.png', 12, '512×512', 'combat, ville en feu, feu de camp'],
  ['A8', 'ui/fx_sparkle_<0..5>.png, ui/fx_levelup_<0..5>.png, ui/fx_coins_<0..3>.png', 16, '512×512', 'effets d\'interface'],
  ['A9', 'props/snowflake_<0..2>.png, props/leaf_<0..2>.png, props/dust_devil_<0..3>.png, props/bird_<0..2>.png', 13, '512×512', 'ambiance'],
  ['A10', 'heroes/<CIV>_idle_<0..2>.png', 18, '512×768', 'héros en pose d\'attente'],
  ['A11', 'props/cart_<0..3>.png, props/horse_idle_<0..3>.png', 8, '512×768', 'charrette et chevaux']
];
const animTotal = ANIM.reduce((t, a) => t + a[2], 0);
const staticTotal = 6 + 1 + 6 + 4 + 2 + 1 + 1;
const sections = [];
const sec = (title, files, note = '') => sections.push({ title, files, note });
sec('1. Bâtiments, palier courant (niveaux 7-13), par civilisation', civOrder.flatMap(c => bCur(c)), 'Guide et prompt de chaque fichier : `node tools/repaint.cjs --kit=<dossier>` (dossier `guides/` + `prompts/`) ou `docs/LISTE-BATIMENTS-PAR-FACTION.md`.');
sec('2. Textures de sol de base et dallages (changent le plus l\'aspect de la ville)', [...TEX_GROUP.base, ...TEX_GROUP.paving].filter(n => texRemaining.includes(n)).map(n => `terrain/${n}.webp`), 'Vue de dessus, répétables, 1024×1024 ; prompts : `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § T1 et T3 (ou `--kit`).');
sec('3. Champs, parcelles, décors de scène', [...remaining(fieldsNoSnow), ...remaining(plotsNoSnow), ...remaining(propsNoSnow)], '`--kit`.');
sec('4. Enceinte (courtines, murets, tours) par civilisation et palier du Mur', remaining(wallsNoSnow), '`--kit`.');
sec('5. Carte du monde (villes, ressources, camps barbares, relief et eau, armées en marche)', remaining(mapAll), '`--kit`.');
sec('6. Unités et héros (figurines, bustes, héros)', [...remaining(figures), ...remaining(busts), ...remaining(heroes)], '`--kit`.');
sec('7. Scènes (connexion, estrades des héros, bandeaux, champ de bataille)', remaining(scenes), '`--kit`.');
sec('8. Habillage d\'interface restant', remaining(frames), 'Sans la plaque parchemin, l\'habillage peint ne s\'active pas.');
sec('9. Compléments fixes et visuels de boutique', STATIC.map(([f, sz, ref]) => `${f} — ${sz} — ${ref}`), 'Fiches et prompts dans `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md`.');
sec('10. Eau et glace, sols des champs, décalques, bordures', [...TEX_GROUP.water.filter(n => texRemaining.includes(n)).map(n => `terrain/${n}.webp`), ...TEX_GROUP.fields.filter(n => texRemaining.includes(n)).map(n => `terrain/${n}.webp`), ...Object.keys(DECAL).filter(n => !painted.has(`decals/${n}.webp`)).map(n => `decals/${n}.webp (fond transparent)`), ...Object.keys(EDGE).filter(n => !painted.has(`terrain/${n}.webp`)).map(n => `terrain/${n}.webp (1024×256)`)], 'Guide § T2, T4, T5, T6.');
sec('11. Animations (bandes de phases, voir guide § 0 et § A1-A11)', ANIM.map(([k, f, n, sz, w]) => `${k} — ${f} — ${n} images — cases ${sz} — ${w}`), `${animTotal} images au total ; livrer une bande par animation, je découpe.`);
sec('12. Bâtiments, palier 1 (niveaux 1-6) puis palier 3 (niveaux 14-20)', [...civOrder.flatMap(c => bT1(c)), ...civOrder.flatMap(c => bT3(c))], '`--kit --tiers`. Après tout le reste.');
const countOf = (sct) => sct.files.length;
let ag = `# À générer — liste consolidée de tous les graphismes manquants

Dans l'ordre conseillé (du plus visible au moins visible). Un fichier par ligne : nom exact à livrer (extension .png,
fond transparent sauf textures), taille. Les variantes du biome neige sont reportées et absentes d'ici.
Généré par \`node tools/liste-graphismes.cjs\` ; s'actualise à chaque import (\`node tools/repaint.cjs --import=art/incoming\`).

| Étape | Contenu | Images |
|---|---|---|
${sections.map((x, i) => `| ${i + 1} | ${x.title.replace(/^\d+\. /, '')} | ${i === 10 ? animTotal : countOf(x)} |`).join('\n')}
| | **Total** | **${sections.reduce((t, x, i) => t + (i === 10 ? animTotal : countOf(x)), 0)}** |

`;
for (const x of sections) {
  ag += `## ${x.title} (${x.title.startsWith('11.') ? animTotal : countOf(x)})\n\n${x.note ? x.note + '\n\n' : ''}`;
  if (x.title.startsWith('9.') || x.title.startsWith('11.')) ag += x.files.map(f => `- ${f}`).join('\n') + '\n\n';
  else ag += x.files.map(f => `- \`${asPng(f.replace(/ \(.*\)$/, ''))}\`${/\(.*\)$/.test(f) ? ' ' + f.match(/\(.*\)$/)[0] : ''} — ${f.startsWith('terrain/') || f.startsWith('decals/') ? (f.includes('1024×256') ? '1024×256' : '1024×1024') : sizeOf(f)}`).join('\n') + '\n\n';
}
fs.writeFileSync(root + 'docs/A-GENERER.md', ag);
console.log('docs/A-GENERER.md écrit :', sections.reduce((t, x, i) => t + (i === 10 ? animTotal : countOf(x)), 0), 'images à générer');
void staticTotal;
console.log('docs/LISTE-BATIMENTS-PAR-FACTION.md écrit');
console.log('docs/LISTE-GRAPHISMES.md écrit :', n(all), 'visuels,', p(all), 'peints,', n(all) - p(all), 'restants');
