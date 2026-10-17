# Liste de tous les graphismes du jeu

Document de référence pour la production des images : **tout ce que le jeu affiche**, catégorie par catégorie, avec
le nombre d'images, leur état (déjà peinte, ou rendu 3D provisoire à remplacer) et la priorité conseillée.
Les prompts détaillés de chaque sujet sont dans `docs/PROMPTS-GRAPHIQUES.md`, les règles de livraison dans `art/incoming/README.md`
(nom identique au guide, fond transparent, 1024×1024 pour les sprites, 1024×1536 / 1536×1024 pour les scènes).

Généré par `node tools/liste-graphismes.cjs` à partir des manifestes `frontend/assets/images/3d/manifest.json`
(rendus 3D, utilisés tant qu'une version peinte n'existe pas) et `frontend/assets/images/painted/manifest.json` (versions peintes).

## 1. Résumé

| | Images |
|---|---|
| Visuels affichés par le jeu, hors neige et animations | **1076** |
| Déjà peints | 200 |
| Restant à produire | **876** |
| Variantes du biome neige, **reportées à plus tard** (bâtiments et enceinte `_snow`, champs, parcelles et décors enneigés) | 808 (dont 83 déjà peintes) |
| Animations conservées en rendu 3D (drapeaux 8 phases × 8 couleurs, fumée et ondes 4 phases) | 72 |
| Emblème (icône de l'application, favicon, splash), conservé | 1 |

Rien ne bloque le jeu : chaque image manquante garde son rendu 3D. Produire par lots, dans l'ordre de la section 2.
Les variantes enneigées ne sont pas à produire pour l'instant (décision d'octobre 2026) : elles ne concernent que les villes du biome neige et gardent leur rendu 3D ; voir § 6.

## 2. Ordre de production conseillé (du plus visible au moins visible)

1. **Bâtiments de sa propre ville, palier courant** (niveaux 7-13) : 39 bâtiments × 6 civilisations. Commencer par la civilisation qu'on joue le plus ; Rome, Gaule et Égypte sont les plus avancées (voir la matrice § 3.1).
2. **Champs** (4 types × 3 paliers × 3 biomes), **parcelles vides** (3 biomes × 2) et **décors** de scène : ce que l'on voit autour de la ville à chaque connexion.
3. **Enceinte** : courtines et tours par civilisation et par palier du Mur (6 × 3 × 5), puis les variantes neige.
4. **Carte du monde** : villes (14), ressources (15), relief et eau (28), armées en marche (29).
5. **Unités et héros** : figurines en pied (24), bustes-jetons (28), héros sur estrade et bustes (12) ; ils apparaissent dans toutes les listes, les rapports et l'écran du héros.
6. **Scènes** : connexion (portrait + paysage), 6 estrades de héros, 5 bandeaux d'écran, champ de bataille (14 au total).
7. **Paliers 1 et 3 des bâtiments** (version hutte des niveaux 1-6, version monumentale des niveaux 14-20). Les **variantes neige** sont reportées (§ 6).
8. **Compléments** (§ 4) : porte de la ville par civilisation, cycles de marche, poses de combat, fonds de scène par biome.

## 3. Inventaire détaillé

Colonnes : total d'images, déjà peintes, **restant**, taille, où le joueur les voit.

### 3.1 Bâtiments — `buildings/<CIV>/<CLÉ>[_t1|_t3][_snow].png`

39 bâtiments (liste dans `docs/PROMPTS-GRAPHIQUES.md` § 3), chacun en 3 versions : courante (niveaux 7-13), **_t1** (niveaux 1-6, petite et simple),
**_t3** (niveaux 14-20, monumentale). La version **_snow** de chacune (ville du biome neige) est reportée. Taille 1024×1024, cadre « building ».

| Civilisation | Courant (peints / total) | Palier 1 (_t1) | Palier 3 (_t3) | Restant (hors neige) | Neige (_snow, reportée) |
|---|---|---|---|---|---|
| Rome | 20 / 39 | 0 / 39 | 0 / 39 | **97** | 0 / 117 |
| Gaule | 39 / 39 | 0 / 39 | 0 / 39 | **78** | 37 / 117 |
| Grèce | 5 / 39 | 0 / 39 | 0 / 39 | **112** | 7 / 117 |
| Égypte | 39 / 39 | 0 / 39 | 0 / 39 | **78** | 39 / 117 |
| Huns | 0 / 39 | 0 / 39 | 0 / 39 | **117** | 0 / 117 |
| Sultanat | 0 / 39 | 0 / 39 | 0 / 39 | **117** | 0 / 117 |
| **Total** | 103 / 234 | 0 / 234 | 0 / 234 | **599** | 83 / 702 |

Priorité : le palier courant des 6 civilisations (131 restants), puis _t1, puis _t3. Neige reportée.

### 3.2 Champs, parcelles, décors, textures de sol

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
| Champs `fields/<forest|desert>/<FARM|LUMBER|QUARRY|IRON_MINE>_<1|2|3>.png` (neige reportée) | 24 | 4 | **20** | 1024², cadre building | couronne de champs autour de la ville, 3 paliers de niveau, biomes prairie et désert |
| Parcelles vides `plots/<forest|desert>_<0|1>.png` (neige reportée) | 4 | 2 | **2** | 1024², cadre building | emplacements libres de la ville et des champs |
| Décors `props/<nom>.png` (arbres, rochers, buissons, palmiers, cactus, dunes, souche, fleurs ; neige reportée) | 12 | 7 | **5** | 1024², cadre prop | autour de la ville et des champs selon le biome |
| Textures de sol `terrain/<grass|dirt|sand|snow>.png` (répétables) | 4 | 4 | **0** | 1024², sans guide | sol de la ville, chemins, sable, neige |

Décors restants : cactus, dune, flowers, palm, stump.

### 3.3 Enceinte — `walls/<CIV>/<1|2|3>_<seg_x|seg_z>[_low].png`, `walls/<CIV>/<1|2|3>_tower.png` (variantes _snow reportées)

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
| Courtines hautes (2 orientations), murets (2) et tour d'angle, × 3 paliers du Mur, × 6 civilisations | 90 | 5 | **85** | 1024², cadre building | mur d'enceinte de la ville, change avec le niveau du Mur (1-6, 7-13, 14-20) |

Peints : ROME/3_seg_x, ROME/3_seg_x_low, ROME/3_seg_z, ROME/3_seg_z_low, ROME/3_tower (Rome, palier 3). Ordre conseillé : palier 2 puis 3 puis 1 de chaque civilisation.

### 3.4 Carte du monde — `map/…`

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
| Villes `map/cities/<rome|gaul|greek|egypt|hun|sultan|default|capital|capital_<civ>>.png` | 14 | 0 | **14** | 1024², cadre map | villes et capitales des joueurs sur la carte |
| Ressources `map/resources/<wood|stone|iron|food|gold>[_desert|_snow].png` | 15 | 0 | **15** | 1024², cadre map | points de ressource gardés par les tribus |
| Relief et eau `map/terrain/…` (forêt, montagnes, dunes, ruines, rochers, sapins, montagnes de glace, lacs, lacs gelés, oasis ; formes isolée, _x, _y, _xy) | 28 | 0 | **28** | 1024², cadre map | obstacles infranchissables (montagnes, eau) et décor de la carte |
| Armées en marche `map/units/<hoplite|archer|cavalry|catapult>[_<CIV>].png`, `map/units/merchant.png` | 29 | 0 | **29** | 1024², cadre mapunit | marqueurs des armées et marchands en déplacement |

### 3.5 Unités et héros

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
| Figurines en pied `figures/<INFANTRY|ARCHER|CAVALRY|SIEGE>_<CIV>.png` | 24 | 0 | **24** | 1024², cadre figure | fiches d'unité, cartes de recrutement, onglet Armée |
| Bustes-jetons `busts/<CLASSE>[_<CIV>].png` (neutre + 6 civilisations) | 28 | 0 | **28** | 1024², cadre bust | listes compactes, rapports de bataille, composition d'armée, carte |
| Héros `heroes/<CIV>.png` (en pied) et `heroes/<CIV>_bust.png` | 12 | 0 | **12** | 1024², cadres figure / bust | écran du héros, cartes d'armée, choix de civilisation |

### 3.6 Scènes — `scenes/<nom>.png`

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
| Connexion `auth-portrait` (1024×1536) et `auth-landscape` (1536×1024) | 2 | 0 | **2** | voir libellé | écran de connexion et d'inscription |
| Estrades de héros `hero-<CIV>` | 6 | 0 | **6** | 1024×1536, cadre stage | écran du héros |
| Bandeaux `header-<market|alliance|ranking|inventory|reports>` | 5 | 0 | **5** | 1536×1024, cadre header | bandeau en tête des écrans Marché, Alliance, Classement, Sac, Rapports |
| Champ de bataille `battlefield` | 1 | 0 | **1** | 1536×1024, cadre scene | fond du replay de bataille |

### 3.7 Interface — `ui/…`

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
| Icônes (ressources, actions, onglets, objets du héros `item_<clé>`) | 61 | 61 | **0** | 1024², cadre icon | partout : barre de ressources, navigation, boutons, fiches, inventaire |
| Habillage : boutons `btn-<primary|secondary|danger|gold|info>[-pressed]`, cadres `frame-panel`, `frame-modal`, plaques `plate-parchment`, `plate-dark`, barre `bar-wood` | 15 | 14 | **1** | 1024², cadre ui | boutons, fenêtres, panneaux, barres de ressources et de navigation |

Icônes restantes : aucune. Habillage restant : plate-parchment.
> L'habillage peint ne s'active dans le jeu que lorsque **toutes** ses pièces sont peintes (boutons, cadres, plaques, barre) : il manque aujourd'hui `plate-parchment`.

### 3.8 Emblème et animations (conservés)

- `logo/medallion.png` : casque doré dans un médaillon de laurier (icône de l'application, favicon, splash). À repeindre seulement si l'on veut changer l'identité visuelle.
- Drapeaux (8 phases × 8 couleurs) et fumée / ondes (4 phases) : animations générées en 3D, cohérentes entre elles, à garder.

## 4. Compléments non couverts par les manifestes (nouveaux besoins)

À produire après l'inventaire ci-dessus, si l'on veut aller plus loin (voir aussi `docs/ETAT-DES-SYSTEMES.md` § Animations) :

| Besoin | Images | Taille | Pourquoi |
|---|---|---|---|
| Porte de la ville par civilisation `walls/<CIV>/gate[_snow].png` | 6 (+ 6 neige) | 1024², cadre building | la porte sud-ouest est aujourd'hui dessinée par le code ; une porte peinte par style d'architecture serait plus belle |
| Cycle de marche des unités de carte (4 images par classe + marchand), série neutre recolorée par faction | 20 | 64×64 ou 1024² recadré | animation de marche plus vivante sur la carte (le trottinement actuel est fait par le code) |
| Poses de combat (frappe, garde) par classe pour le replay de bataille | 8 | 1024², cadre figure | replay plus lisible |
| Fond de scène de ville par biome (horizon : forêt, désert, neige, rivage) | 4 | 1536×512 | arrière-plan derrière la ville (aujourd'hui tuiles de carte + décors) |
| Portraits de héros supplémentaires (un héros par civilisation existe déjà) | 0 à 6 | 1024², cadre bust | seulement si l'on veut plusieurs héros par civilisation |

## 5. Livraison et intégration

1. Nommer chaque fichier exactement comme son guide (`docs/PROMPTS-GRAPHIQUES.md`, kits `guides/…`) : `buildings/HUN/MAIN_HALL.png`, `walls/GAUL/3_tower.png`, `map/terrain/water_xy.png`…
2. Fond transparent (sinon magenta #FF00FF ou vert #00FF00), sujet à la place et à la taille du guide.
3. Déposer les fichiers (ou un zip) dans `art/incoming/`, par lots ; ce qui manque garde le rendu 3D.
4. Intégration : `node tools/repaint.cjs --import=art/incoming`, vérification en jeu (bureau + mobile), commit.

## 6. Reporté : les variantes du biome neige

Mises de côté pour l'instant (elles ne concernent que les villes fondées dans la neige et gardent leur rendu 3D) :

| Catégorie | Images | Déjà peintes |
|---|---|---|
| Bâtiments `buildings/<CIV>/<CLÉ>[_t1|_t3]_snow.png` | 702 | 83 |
| Enceinte `walls/<CIV>/…_snow.png` | 90 | 0 |
| Champs `fields/snow/…`, parcelles `plots/snow_<0|1>.png`, décors `props/snowpine.png` et `props/snowrock.png` | 16 | 0 |

Le relief enneigé de la carte du monde (`map/terrain/snow_*`, `frozen*`) et les ressources `_snow` restent dans l'inventaire : tout le monde les voit sur la carte.
