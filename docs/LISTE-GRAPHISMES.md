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
| Visuels affichés par le jeu, hors neige et animations | **1074** |
| Déjà peints | 189 |
| Restant à produire | **885** |
| Champs, parcelles et décors du biome neige, **reportés à plus tard** (les variantes `_snow` des bâtiments et de l'enceinte sont retirées de la liste : le rendu 3D enneigé reste en jeu) | 16 (dont 0 déjà peintes) |
| Animations conservées en rendu 3D (drapeaux 8 phases × 8 couleurs, fumée et ondes 4 phases) | 72 |
| Emblème (icône de l'application, favicon, splash), conservé | 1 |

Rien ne bloque le jeu : chaque image manquante garde son rendu 3D. Produire par lots, dans l'ordre de la section 2.
Les variantes enneigées ne sont pas à produire pour l'instant (décision d'octobre 2026) : elles ne concernent que les villes du biome neige et gardent leur rendu 3D ; voir § 6.

## 2. Ordre de production conseillé (du plus visible au moins visible)

1. **Bâtiments de sa propre ville, palier courant** (niveaux 7-13) : 34 bâtiments × 6 civilisations (liste par civilisation : `docs/LISTE-BATIMENTS-PAR-FACTION.md`). Commencer par la civilisation qu'on joue le plus ; Rome, Gaule et Égypte sont les plus avancées (voir la matrice § 3.1).
2. **Champs** (4 types × 3 paliers × 3 biomes), **parcelles vides** (3 biomes × 2) et **décors** de scène : ce que l'on voit autour de la ville à chaque connexion.
3. **Enceinte** : courtines et tours par civilisation et par palier du Mur (6 × 3 × 5), puis les variantes neige.
4. **Carte du monde** : villes (14), ressources (15), camps barbares (21), sol, relief et décor (95), armées en marche (29).
5. **Unités et héros** : figurines en pied (24), bustes-jetons (28), héros sur estrade et bustes (12) ; ils apparaissent dans toutes les listes, les rapports et l'écran du héros.
6. **Scènes** : connexion (portrait + paysage), 6 estrades de héros, 5 bandeaux d'écran, champ de bataille (14 au total).
7. **Paliers 1 et 3 des bâtiments** (version hutte des niveaux 1-6, version monumentale des niveaux 14-20). Les **variantes neige** sont reportées (§ 6).
8. **Compléments** (§ 4) : porte de la ville par civilisation, cycles de marche, poses de combat, fonds de scène par biome.

## 3. Inventaire détaillé

Colonnes : total d'images, déjà peintes, **restant**, taille, où le joueur les voit.

### 3.1 Bâtiments — `buildings/<CIV>/<CLÉ>[_t1|_t3].png`

34 bâtiments par civilisation (33 communs + son bâtiment de faction ; liste détaillée par civilisation dans `docs/LISTE-BATIMENTS-PAR-FACTION.md`), chacun en 3 versions : courante (niveaux 7-13), **_t1** (niveaux 1-6, petite et simple),
**_t3** (niveaux 14-20, monumentale). Pas de version neige à produire (décision d'octobre 2026 : le rendu 3D enneigé reste). Taille 1024×1024, cadre « building ».

| Civilisation | Courant (peints / total) | Palier 1 (_t1) | Palier 3 (_t3) | Restant |
|---|---|---|---|---|---|
| Rome | 20 / 34 | 0 / 34 | 0 / 34 | **82** |
| Gaule | 34 / 34 | 0 / 34 | 0 / 34 | **68** |
| Grèce | 4 / 34 | 0 / 34 | 0 / 34 | **98** |
| Égypte | 34 / 34 | 0 / 34 | 0 / 34 | **68** |
| Huns | 0 / 34 | 0 / 34 | 0 / 34 | **102** |
| Sultanat | 0 / 34 | 0 / 34 | 0 / 34 | **102** |
| **Total** | 92 / 204 | 0 / 204 | 0 / 204 | **520** |

Priorité : le palier courant des 6 civilisations (112 restants), puis _t1, puis _t3. Neige reportée.

### 3.2 Champs, parcelles, décors, textures de sol

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
| Champs `fields/<forest|desert>/<FARM|LUMBER|QUARRY|IRON_MINE>_<1|2|3>.png` (neige reportée) | 24 | 4 | **20** | 1024², cadre building | couronne de champs autour de la ville, 3 paliers de niveau, biomes prairie et désert |
| Parcelles vides `plots/<forest|desert>_<0|1>.png` (neige reportée) | 4 | 2 | **2** | 1024², cadre building | emplacements libres de la ville et des champs |
| Décors `props/<nom>.png` (arbres, rochers, buissons, palmiers, cactus, dunes, souche, fleurs ; neige reportée) | 12 | 7 | **5** | 1024², cadre prop | autour de la ville et des champs selon le biome |
| Textures de sol `terrain/<grass|dirt|sand|snow>.png` (répétables) | 4 | 4 | **0** | 1024², sans guide | sol de la ville, chemins, sable, neige |

Décors restants : cactus, dune, flowers, palm, stump.

### 3.3 Enceinte — `walls/<CIV>/<1|2|3>_<seg_x|seg_z>[_low].png`, `walls/<CIV>/<1|2|3>_tower.png` (pas de version neige)

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
| Courtines hautes (2 orientations), murets (2) et tour d'angle, × 3 paliers du Mur, × 6 civilisations | 90 | 5 | **85** | 1024², cadre building | mur d'enceinte de la ville, change avec le niveau du Mur (1-6, 7-13, 14-20) |

Peints : ROME/3_seg_x, ROME/3_seg_x_low, ROME/3_seg_z, ROME/3_seg_z_low, ROME/3_tower (Rome, palier 3). Ordre conseillé : palier 2 puis 3 puis 1 de chaque civilisation.

### 3.4 Carte du monde — `map/…`

| Catégorie | Total | Peints | Restant | Taille | Utilisation |
|---|---|---|---|---|---|
| Villes `map/cities/<rome|gaul|greek|egypt|hun|sultan|default|capital|capital_<civ>>.png` | 14 | 0 | **14** | 1024², cadre mapcity (2 × 2 cases) | villes et capitales des joueurs sur la carte |
| Ressources `map/resources/<wood|stone|iron|food|gold>[_desert|_snow].png` | 15 | 0 | **15** | 1024², cadre mapobject | points de ressource gardés par les tribus |
| Camps barbares `map/camps/camp<1|2|3>[_desert|_snow].png`, `map/camps/ruins[_desert|_snow].png`, `map/camps/banner_<CIV>.png` | 21 | 0 | **21** | 1024², cadre mapobject | camp de la tribu sur le point de ressource (niveau et biome), ruines jusqu'à la réapparition, bannière de la tribu ; sans eux, l'icône de ressource reste |
| Sol, forêts, rochers, montagnes, ponts, gués, décor `map/world/…` (carte de référence, liste et prompts : docs/PROMPTS-CARTE.md) | 95 | 0 | **95** | 1024², cadres mapobject / texture | fond et relief de la carte du monde (remplace `map/terrain/…`) |
| Armées en marche `map/units/<hoplite|archer|cavalry|catapult>[_<CIV>].png`, `map/units/merchant.png` | 29 | 0 | **29** | 1024², cadre mapobject | marqueurs des armées et marchands en déplacement |

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

Vérifié en octobre 2026 en relevant toutes les images que le client référence (icônes, scènes, carte, ville, héros, replay,
boutique) : **tout ce qui s'affiche en jeu est dans l'inventaire ci-dessus**. Restent des éléments dessinés par le code,
quelques glyphes vectoriels et les visuels hors jeu (boutique, natif). Fiches détaillées, prompts et animations : `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md`. À produire après l'inventaire, par ordre d'intérêt :

| Besoin | Images | Taille | Pourquoi |
|---|---|---|---|
| Porte de la ville par civilisation `walls/<CIV>/gate.png` (neige reportée) | 6 | 1024², cadre building | le vantail de la porte sud-est est dessiné par le code ; une porte peinte par style d'architecture serait plus belle |
| Chantier (échafaudage) en trois tailles `props/scaffold_<1|2|3>.png` | 3 | 1024², cadre building | aujourd'hui le bâtiment en travaux clignote avec un marteau ; un échafaudage posé dessus fait plus « Rise of Kingdoms » |
| Panneau « construire ici » `props/sign_build.png` | 1 | 1024², cadre prop | l'emplacement libre est un losange pointillé avec un « + » dessiné par le code |
| Cycle de marche des unités de carte (4 images par classe + marchand), série neutre recolorée par faction | 20 | 64×64 ou 1024² recadré | animation de marche plus vivante sur la carte (le trottinement actuel est fait par le code) |
| Poses de combat (frappe, garde) par classe pour le replay de bataille | 8 | 1024², cadre figure | replay plus lisible |
| Projectiles et impacts du replay : flèche, pierre de catapulte, éclat d'impact, nuage de poussière | 4 | 256², sans guide | aujourd'hui tracés par le code (traits et ronds) |
| Emblème (blason) de chaque civilisation `ui/crest_<CIV>.png` | 6 | 1024², cadre icon | choix de civilisation, alliance, étiquettes de carte ; aujourd'hui on réutilise le buste du héros |
| Vignettes des destinations d'expédition (forêt, désert, montagne, ruines) | 4 | 1536×1024, cadre header | l'écran des expéditions n'a que des icônes |
| Boutons ronds des bulles d'action (normal, appuyé) `ui/btn-round[-pressed].png` | 2 | 1024², cadre ui | les bulles d'action utilisent un dégradé CSS |
| **Jeu complet de textures de sol** (variantes par biome, eau et glace, dallages par civilisation, chemins, champs, décalques, bordures) — fiches dans `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § T | 55 | 1024², répétables (décalques : fond transparent ; bordures : 1024×256) | aujourd'hui quatre sols seulement, le reste est dessiné par le code ; c'est ce qui donne la richesse de Rise of Kingdoms |
| Fond de scène de ville par biome (horizon : forêt, désert, neige, rivage) | 4 | 1536×512 | facultatif : la ville a maintenant son propre sol et son décor |
| Portraits de héros supplémentaires (un héros par civilisation existe déjà) | 0 à 6 | 1024², cadre bust | seulement si l'on veut plusieurs héros par civilisation |

**Sols et ville** : tout ce qui compose la ville est dans l'inventaire (bâtiments, enceinte, champs, parcelles, décors, textures de sol herbe / terre / sable / neige, déjà peintes). Le sol de l'enceinte est la texture du biome éclaircie, la plaza et les avenues sont la texture de terre battue, la route extérieure aussi ; le vantail de la porte, les plans d'eau, les surlignages et les badges sont dessinés par le code. Le jeu complet de 55 textures et décalques (guide § T) couvre tout ce que le sol peut montrer ; avec lui, plus rien du sol n'est dessiné par le code.

Glyphes vectoriels conservés tels quels (fonctionnels, sans guide) : `ui/sun.svg`, `moon.svg` (jour / nuit), `left.svg`, `right.svg` (sélecteur de ville), `plus.svg`, `minus.svg` (zoom), `close.svg`, `info.svg`, `menu.svg` (fermer, information, menu). À repeindre seulement par souci d'unité : 9 images 1024², cadre icon.

Dans l'inventaire mais jamais affichées (peuvent être ignorées) : icônes `amphora`, `bow`, plaque `plate-dark`.

### 4 bis. Hors jeu : boutique et application native

| Besoin | État | Taille |
|---|---|---|
| Icône de l'application (iOS, Android adaptatif : premier plan + fond) | ✅ générée depuis l'emblème (`frontend/assets/images/icon-1024.png`, `android/.../ic_launcher*`, `ios/.../AppIcon`) | 1024² |
| Écran de démarrage (splash) iOS et Android | ✅ généré (`splash-2732x2732.png`, `drawable-*/splash.png`) | 2732² |
| Captures d'écran iPhone (App Store) et téléphone (Google Play) | ✅ générées par `node tools/store-screenshots.cjs` | 1290×2796 (6,7"), 1242×2688 (6,5") |
| **Captures d'écran iPad** : l'application cible aussi l'iPad (`TARGETED_DEVICE_FAMILY = 1,2`), l'App Store les exige alors | ✅ générées par le même outil (taille ajoutée) ; sinon limiter l'app à l'iPhone dans Xcode | 2048×2732 (12,9") |
| iPhone : icône (une seule image 1024, Xcode décline les tailles), écran de démarrage, pas d'icône de notification à fournir (iOS utilise l'icône de l'app) | ✅ rien à produire | — |
| **Icône de notification Android** (monochrome blanc sur fond transparent, `ic_stat_notify`) | ❌ à produire : sans elle Android affiche un carré blanc pour les notifications push | 96×96 (xxxhdpi) + 72, 48, 36, 24 |
| **Bannière Google Play** (feature graphic) | ❌ à produire : obligatoire sur la fiche Play | 1024×500, JPG ou PNG sans transparence |
| Image de promotion App Store (facultative) et vidéo d'aperçu | 🔧 facultatif (vidéo : enregistrer le simulateur, 15-30 s) | 1080×1920 |

## 5. Livraison et intégration

1. Nommer chaque fichier exactement comme son guide (`docs/PROMPTS-GRAPHIQUES.md`, kits `guides/…`) : `buildings/HUN/MAIN_HALL.png`, `walls/GAUL/3_tower.png`, `map/terrain/water_xy.png`…
2. Fond transparent (sinon magenta #FF00FF ou vert #00FF00), sujet à la place et à la taille du guide.
3. Déposer les fichiers (ou un zip) dans `art/incoming/`, par lots ; ce qui manque garde le rendu 3D.
4. Intégration : `node tools/repaint.cjs --import=art/incoming`, vérification en jeu (bureau + mobile), commit.

## 6. Biome neige

Les variantes `_snow` des bâtiments et de l'enceinte sont **retirées de la liste** (décision d'octobre 2026) : le jeu garde
leur rendu 3D enneigé pour les villes fondées dans la neige. Restent reportés, pour le même biome :

| Catégorie | Images | Déjà peintes |
|---|---|---|
| Champs `fields/snow/…`, parcelles `plots/snow_<0|1>.png`, décors `props/snowpine.png` et `props/snowrock.png` | 16 | 0 |

Le relief enneigé de la carte du monde (`map/terrain/snow_*`, `frozen*`) et les ressources `_snow` restent dans l'inventaire : tout le monde les voit sur la carte.
La liste complète de tout ce qu'il faut produire, famille par famille, est dans `docs/GRAPHISMES-COMPLET.md`.
