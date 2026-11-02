# À générer — tout sauf les bâtiments et les villes de la carte

**2 novembre 2026.** Liste complète des images qu'il reste à produire pour *Imperium Antiquitas*, famille par famille, **sans** les
bâtiments (tous paliers, versions neige, chantiers de bâtiments) ni les visuels des villes sur la carte du monde (capitales, villages,
colonies et leurs animations de siège). Ces deux ensembles sont comptés à la fin (§ 3) pour mémoire. Le Bastion, la Merveille et les
sites des Immortels partagent le cadrage des villes de la carte : ils ont leur propre famille « à confirmer », c'est toi qui décides.

Chaque famille dit où l'image se voit dans le jeu, sa taille et son format, comment la nommer et la livrer, la règle de style, où
trouver le prompt (ou le prompt lui-même quand aucun document ne l'a encore), si le jeu sait déjà l'afficher, puis la liste complète
des fichiers, un par ligne. Les nombres viennent du registre du jeu (`tools/repaint/targets.cjs`) et du manifeste des images déjà
peintes ; le § 5 explique les écarts avec `docs/A-GENERER.md` et `docs/GENERATION-COMPLETE.md`.

## 0. Les règles qui valent pour tout

- **Trois styles, pas plus.** (1) **Style peint** pour la ville, les unités, les héros, les scènes et l'interface : référence
  `tools/repaint/style-ref.png` (un étal de marché égyptien) donnée comme première image, et le prompt commence par la phrase de style
  ci-dessous. (2) **Style de la carte de référence** pour tout ce qui se pose sur la carte du monde : référence `docs/img/carte-reference.jpg`
  (copie : `tools/repaint/style-ref-map.jpg`), rendu 3D doux, sans contour dessiné ; les prompts complets sont dans `docs/PROMPTS-CARTE.md`
  avec une image guide par cadrage (`docs/img/guides-carte/`). (3) **Textures** (sols de la ville et de la carte) : vues de dessus, sans
  perspective, répétables, opaques.
- **Fond transparent** (PNG avec couche alpha) pour tout sauf les textures, la bannière Google Play et l'icône de l'application ; si
  l'outil ne sait pas faire de transparence, un fond uni magenta #FF00FF, détouré à l'import.
- **Aucun texte, aucune lettre, aucun cadre, aucun filigrane** dans l'image. Pas de socle ni de dalle sous les éléments de la carte.
- **Nom exact.** Chaque fichier est livré sous le nom indiqué, extension `.png`, dans `art/incoming/` en gardant les sous-dossiers
  (`art/incoming/walls/GAUL/gate.png`) ; les noms « à plat » marchent aussi (`walls__GAUL__gate.png`), majuscules indifférentes.
  Tous les noms de ce document sont reconnus par `node tools/check-incoming.cjs art/incoming`, sauf ceux dont la fiche dit que
  « l'outil d'import ne les connaît pas encore » (hordes, bannières, Bastion, Merveille et Immortels, nouveautés G et H, et les icônes d'objets
  tant que la branche objets n'est pas fusionnée) : je les ajoute à la livraison.
- **Animations : une seule image par animation**, bande horizontale de N cases égales côte à côte (N = nombre de phases), même personnage,
  même taille, même position dans chaque case, seule la pose change ; cases 512×768 en ville, 512×512 sur la carte et pour les effets.
  La bande porte le nom de base sans numéro de phase (`props/flame.png` ou `props/flame_strip.png`) ; je la découpe en `flame_0..3`.
  Exception : les cycles de marche de la carte se livrent en planche de 6 poses en 3 × 2 (1536×1024).
- **Guides 3D.** Les familles marquées « guide 3D fourni par le kit » ont un rendu provisoire qui fixe l'angle, la place et l'emprise :
  `node tools/repaint.cjs --kit=<dossier>` produit, pour chaque fichier, l'image guide et le prompt complet (je le lance à la demande).
- **Livraison par lots**, dans l'ordre du § 4 ; ce qui manque garde son rendu 3D ou son dessin provisoire. Vérification
  `node tools/check-incoming.cjs art/incoming`, import `node tools/repaint.cjs --import=art/incoming`, aperçu `node tools/preview-art.cjs`.

**Phrase de style peint** (début de chaque prompt du style peint) :

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject.
The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.
```

Compositions les plus utilisées (incluses dans les prompts de `docs/GENERATION-COMPLETE.md`) : icône = Composition: square image, a single object centered filling about 70% of the frame, three-quarter view from slightly above. Décor (prop) = Composition: 2:3 portrait image, the prop centered horizontally, its base at 89% of the image height, about 60% of the width.

## 1. Résumé

| N° | Famille | À livrer | Taille | Format | Prompt |
|---|---|---|---|---|---|
| | **Ville** | | | | |
| 1 | Textures de sol de la ville et bordures | 39 images | 1024×1024, 1024×256 | PNG opaque (bordures et textures) | GENERATION-COMPLETE |
| 2 | Décalques au sol | 16 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 3 | Champs autour de la ville | 32 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 4 | Parcelles vides | 4 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 5 | Décors de scène | 7 images | 512×768 | PNG transparent | GENERATION-COMPLETE |
| 6 | Champs en chantier | 12 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 7 | Enceinte : courtines, murets et tours | 85 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 8 | Portes de la ville | 6 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 9 | Enceinte en chantier | 18 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 10 | Échafaudages par civilisation | 18 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 11 | Ornements de plaza | 18 images | 512×768 | PNG transparent | GENERATION-COMPLETE |
| 12 | Panneau « construire ici » et parchemin « recherche en cours » | 2 images | 512×768 | PNG transparent | GENERATION-COMPLETE |
| | **Carte du monde** | | | | |
| 13 | Sol de la carte | 20 images | 1024×1024 | PNG opaque | PROMPTS-CARTE |
| 14 | Forêts, rochers et montagnes | 57 images | 1024×1024 | PNG transparent | PROMPTS-CARTE |
| 15 | Ponts, gués, désert et eau | 18 images | 1024×1024 | PNG transparent | PROMPTS-CARTE |
| 16 | Décor des cases | 26 images | 1024×1024 | PNG transparent | PROMPTS-CARTE |
| 17 | Nuages qui passent | 3 images | 1536×1024 | PNG transparent | PROMPTS-CARTE |
| 18 | Points de ressource | 45 images | 1024×1024 | PNG transparent | PROMPTS-CARTE |
| 19 | Camps des tribus et ruines | 12 images | 1024×1024 | PNG transparent | PROMPTS-CARTE |
| 20 | Campement de fondation | 3 images | 1024×1024 | PNG transparent | PROMPTS-CARTE |
| 21 | Donjons des invasions barbares (hordes) | 5 images | 1024×1024 | PNG transparent | PROMPTS-CARTE |
| 22 | Armées en marche | 29 images | 1024×1024 | PNG transparent | PROMPTS-CARTE |
| 23 | Cortège de colons | 7 images | 1024×1024 | PNG transparent | PROMPTS-CARTE |
| 24 | Héros en tête d'armée et espion | 7 images | 1024×1024 | PNG transparent | PROMPTS-CARTE |
| 25 | Cycles de marche des armées (planches) | 33 planches (198 cases) | planche 1536×1024 | une planche 3 × 2 par armée | PROMPTS-CARTE |
| 26 | Replay de bataille : poses, projectiles, impacts | 2 images + 15 bandes (41 cases) | 512×512, cases 512×512 | PNG transparent ; une bande par animation | PROMPTS-CARTE |
| 27 | Effets de la carte | 5 bandes (20 cases) | cases 512×512 | une bande par animation | PROMPTS-CARTE |
| 28 | Bannières de la boutique d'alliance | 4 images | 512×768 | PNG transparent | prompt dans ce document |
| 29 | Bastion, Merveille, Immortels (à confirmer : ce sont des villes spéciales) | 10 images | 1024×1024 | PNG transparent | prompt dans ce document |
| | **Unités et héros** | | | | |
| 30 | Figurines de classe | 24 images | 1024×1536 | PNG transparent | GENERATION-COMPLETE |
| 31 | Jetons de classe | 28 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 32 | Fiches d'unité : une figurine par unité | 60 images | 1024×1536 | PNG transparent | GENERATION-COMPLETE |
| 33 | Fiches d'unité : un jeton par unité | 60 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 34 | Héros de chaque civilisation : en pied et buste | 12 images | 1024×1536, 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 35 | Héros par palier de niveau | 24 images | 1024×1536, 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 36 | Héros en pose d'attente | 6 bandes (18 cases) | cases 512×768 | une bande par animation | GENERATION-COMPLETE |
| 37 | Chefs de tribu et colons (jetons) | 12 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| | **Scènes** | | | | |
| 38 | Scènes de connexion | 2 images | 1536×1024, 1024×1536 | PNG transparent | GENERATION-COMPLETE |
| 39 | Paysages des cartes de civilisation | 6 images | 1536×1024 | PNG transparent | GENERATION-COMPLETE |
| 40 | Estrades du héros | 6 images | 1024×1536 | PNG transparent | GENERATION-COMPLETE |
| 41 | Champ de bataille | 1 image | 1536×1024 | PNG transparent | GENERATION-COMPLETE |
| 42 | Bandeaux en tête des écrans | 7 images | 1536×1024 | PNG transparent | GENERATION-COMPLETE |
| 43 | Vignettes : fondation, tribus, expéditions | 8 images | 1536×1024 | PNG transparent | GENERATION-COMPLETE |
| | **Interface** | | | | |
| 44 | Habillage : plaque parchemin et boutons ronds | 3 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 45 | Icônes d'interface restantes (colon, tribu, siège) | 3 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE + ce document |
| 46 | Blasons des civilisations | 6 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 47 | Icônes des technologies et des branches | 12 images | 1024×1024 | PNG transparent | GENERATION-COMPLETE |
| 48 | Objets du héros : les 23 nouvelles icônes | 23 images | 1024×1024 | PNG transparent | prompt dans ce document |
| 49 | Effets d'interface | 3 bandes (16 cases) | cases 512×512 | une bande par animation | GENERATION-COMPLETE |
| 50 | Nouveautés des décisions G et H : Gloire, triomphe, échange | 6 images | 512×768, 1024×1024 | PNG transparent | prompt dans ce document |
| | **Animations de la ville** | | | | |
| 51 | Villageois de chaque civilisation | 12 bandes (72 cases) | cases 512×768 | une bande par animation | GENERATION-COMPLETE |
| 52 | Ouvriers de chantier | 6 bandes (24 cases) | cases 512×768 | une bande par animation | GENERATION-COMPLETE |
| 53 | Flammes des torches et braseros | 2 bandes (8 cases) | cases 512×768 | une bande par animation | GENERATION-COMPLETE |
| 54 | Bâtiments vivants : moulin, forge, fonderie | 3 bandes (14 cases) | cases 512×512 | une bande par animation | GENERATION-COMPLETE |
| 55 | Bâtiments vivants, suite | 6 bandes (24 cases) | cases 512×512 | une bande par animation | GENERATION-COMPLETE |
| 56 | Gens des champs au travail | 4 bandes (16 cases) | cases 512×768 | une bande par animation | GENERATION-COMPLETE |
| 57 | Animaux dans la ville | 4 bandes (16 cases) | cases 512×768 | une bande par animation | GENERATION-COMPLETE |
| 58 | Fumées peintes | 2 bandes (8 cases) | cases 512×768 | une bande par animation | GENERATION-COMPLETE |
| 59 | Drapeaux peints par civilisation | 6 bandes (48 cases) | cases 512×768 | une bande par animation | GENERATION-COMPLETE |
| 60 | Charrette et chevaux | 2 bandes (8 cases) | cases 512×768 | une bande par animation | GENERATION-COMPLETE |
| 61 | Ambiance : neige, feuilles, tourbillon, oiseaux | 4 bandes (13 cases) | cases 512×512 | une bande par animation | GENERATION-COMPLETE |
| | **Boutique et application** | | | | |
| 62 | Visuels de boutique | 3 images | voir fiche | PNG (notification transparente, bannière et icône opaques) | GENERATION-COMPLETE |
| | **Total** | **924 fichiers à livrer** : 811 images + 113 bandes ou planches | | | |

Sous-totaux par écran : Ville 257 fichiers · Carte du monde 301 fichiers · Unités et héros 226 fichiers · Scènes 30 fichiers · Interface 56 fichiers · Animations de la ville 51 fichiers · Boutique et application 3 fichiers.
Une fois les bandes découpées, cela fait **1 355 images unitaires** dans le jeu. Le total comprend 16 images du biome
neige de la ville (12 champs, 2 parcelles, 2 décors) reportées par la décision d'octobre 2026, plus 4 chantiers de champs en neige à
traiter avec elles : listées pour être complet, à faire en dernier ou à ignorer. Les nouveautés des décisions G et H
(famille 50) comptent 2 icônes facultatives.

## 2. Les familles, une par une

### 1. Textures de sol de la ville et bordures — 39 images

- **Où ça se voit** : Le sol de la ville et de ses alentours : pelouse de l'enceinte, avenues, plaza (une par civilisation), route, champs vides, étangs, puis les sols de la carte du monde en repli. C'est ce qui change le plus l'aspect général de la ville.
- **Taille et format** : 1024×1024, PNG **opaque**, vue de dessus, sans perspective, répétable sans raccord (le motif se continue d'un bord à l'autre). Les 6 bordures `terrain/edge_*` font 1024×256 : bande répétable de gauche à droite, moitié haute = sol A, moitié basse = sol B.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Prompt de texture (pas le prompt isométrique) : « seamless, tileable top-down ground texture… », palette et touche de `tools/repaint/style-ref.png`. Aucun objet plus gros qu'un caillou, aucune ombre portée, aucun texte.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Textures de sol (répétables) et bordures de transition » ; fiches par sujet : `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § T1 à T4 et T6.
- **Dans le jeu** : les textures sont déjà branchées (chacune remplace son repli dès l'import) ; les 6 bordures seront posées le long des rives et des routes à la livraison.

**Fichiers** :

- `terrain/grass_lawn.png` — sol de l'enceinte en prairie
- `terrain/grass_dark.png` — sous-bois, lisières
- `terrain/grass_dry.png` — alentours de la ville en prairie
- `terrain/grass_flowers.png` — prairie fleurie
- `terrain/grass_hills.png` — carte du monde (prairie)
- `terrain/dirt_packed.png` — terre battue, plaza hunnique
- `terrain/mud.png` — boue
- `terrain/gravel.png` — gravier
- `terrain/sand_ripples.png` — sol de l'enceinte en désert, carte
- `terrain/sand_rocky.png` — alentours en désert
- `terrain/cracked_earth.png` — terre craquelée
- `terrain/snow_fresh.png` — sol de l'enceinte en neige
- `terrain/snow_trampled.png` — avenues et plaza en neige
- `terrain/tundra.png` — alentours en neige, carte
- `terrain/water_lake.png` — étangs de la ville, lacs de la carte
- `terrain/water_deep.png` — mers et grands lacs
- `terrain/water_river.png` — rivières
- `terrain/water_shallow.png` — oasis, rives
- `terrain/ice.png` — lacs gelés
- `terrain/plaza_ROME.png` — plaza de Rome
- `terrain/plaza_GAUL.png` — plaza de Gaule
- `terrain/plaza_GREEK.png` — plaza de Grèce
- `terrain/plaza_EGYPT.png` — plaza d'Égypte
- `terrain/plaza_HUN.png` — plaza des Huns
- `terrain/plaza_SULTAN.png` — plaza du Sultanat
- `terrain/cobble.png` — avenues de la ville
- `terrain/flagstone.png` — dallages
- `terrain/road_dirt.png` — route hors de la ville
- `terrain/road_paved.png` — routes de la carte
- `terrain/path_sand.png` — pistes du désert
- `terrain/soil_tilled.png` — champs vides
- `terrain/wheat.png` — fermes développées
- `terrain/orchard.png` — vergers
- `terrain/edge_grass_sand.png` — bordure herbe verte → sable ocre
- `terrain/edge_grass_snow.png` — bordure herbe verte → neige
- `terrain/edge_shore.png` — bordure plage de sable → eau claire peu profonde
- `terrain/edge_grass_water.png` — bordure herbe et roseaux → eau de lac
- `terrain/edge_cliff.png` — bordure bord d'herbe → petite falaise de terre brune
- `terrain/edge_road.png` — bordure route pavée → bas-côté herbeux

### 2. Décalques au sol — 16 images

- **Où ça se voit** : Petits motifs semés au hasard sur le sol de la ville et des alentours (touffes, fleurs, cailloux, flaques, traces) pour casser la répétition des textures.
- **Taille et format** : 1024×1024, PNG **transparent** autour du motif, vu de dessus, bords doux qui se fondent dans la transparence. Non répétable.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Prompt « A single ground decal on a fully transparent background, seen from above… », style de la référence.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Décalques au sol » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § T5.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `decals/grass_tuft.png` — touffe d'herbe haute
- `decals/flowers_red.png` — coquelicots
- `decals/flowers_white.png` — pâquerettes blanches et jaunes
- `decals/clover.png` — trèfle et petites feuilles
- `decals/pebbles.png` — cailloux gris épars
- `decals/cracks.png` — fines craquelures de terre sèche
- `decals/puddle.png` — flaque qui reflète le ciel
- `decals/leaves.png` — feuilles mortes d'automne
- `decals/moss.png` — plaque de mousse
- `decals/mushrooms.png` — petit groupe de champignons bruns
- `decals/branches.png` — branches sèches tombées
- `decals/cart_tracks.png` — deux ornières de charrette
- `decals/hoof_prints.png` — traces de sabots
- `decals/snow_drift.png` — petite congère
- `decals/ice_patch.png` — plaque de glace fine
- `decals/sand_ripple.png` — rides de vent dans le sable

### 3. Champs autour de la ville — 32 images

- **Où ça se voit** : La couronne de champs autour de la ville : Ferme, Bûcheron, Carrière, Mine, chacun en trois paliers de niveau (1-6, 7-13, 14-20) et par biome. Les 4 champs de prairie du palier 2 sont déjà peints.
- **Taille et format** : 1024×1024, PNG transparent, cadre « building » (parcelle en losange 2:1 à 51 % de la largeur, centre à 73 % de la hauteur), même cadrage que le rendu 3D guide.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, guide 3D fourni par le kit (`node tools/repaint.cjs --kit=<dossier>`). Pas d'orientation d'entrée à respecter pour les champs.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Champs (4 types × 3 paliers × 3 biomes) » ; sujets : `docs/PROMPTS-GRAPHIQUES.md` § 3 « Champs ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.
- **Note** : Les 12 champs du biome **neige** sont marqués « reporté » : décision d'octobre 2026 (le rendu 3D enneigé reste). Ils sont listés pour que la liste soit complète ; à faire en dernier ou à ignorer.

**Fichiers** :

- `fields/desert/FARM_1.png` — Ferme, niveaux 1-6, désert
- `fields/desert/FARM_2.png` — Ferme, niveaux 7-13, désert
- `fields/desert/FARM_3.png` — Ferme, niveaux 14-20, désert
- `fields/desert/IRON_MINE_1.png` — Mine de fer, niveaux 1-6, désert
- `fields/desert/IRON_MINE_2.png` — Mine de fer, niveaux 7-13, désert
- `fields/desert/IRON_MINE_3.png` — Mine de fer, niveaux 14-20, désert
- `fields/desert/LUMBER_1.png` — Bûcheron, niveaux 1-6, désert
- `fields/desert/LUMBER_2.png` — Bûcheron, niveaux 7-13, désert
- `fields/desert/LUMBER_3.png` — Bûcheron, niveaux 14-20, désert
- `fields/desert/QUARRY_1.png` — Carrière de pierre, niveaux 1-6, désert
- `fields/desert/QUARRY_2.png` — Carrière de pierre, niveaux 7-13, désert
- `fields/desert/QUARRY_3.png` — Carrière de pierre, niveaux 14-20, désert
- `fields/forest/FARM_1.png` — Ferme, niveaux 1-6, prairie
- `fields/forest/FARM_3.png` — Ferme, niveaux 14-20, prairie
- `fields/forest/IRON_MINE_1.png` — Mine de fer, niveaux 1-6, prairie
- `fields/forest/IRON_MINE_3.png` — Mine de fer, niveaux 14-20, prairie
- `fields/forest/LUMBER_1.png` — Bûcheron, niveaux 1-6, prairie
- `fields/forest/LUMBER_3.png` — Bûcheron, niveaux 14-20, prairie
- `fields/forest/QUARRY_1.png` — Carrière de pierre, niveaux 1-6, prairie
- `fields/forest/QUARRY_3.png` — Carrière de pierre, niveaux 14-20, prairie
- `fields/snow/FARM_1.png` — Ferme, niveaux 1-6, neige (biome neige, reporté)
- `fields/snow/FARM_2.png` — Ferme, niveaux 7-13, neige (biome neige, reporté)
- `fields/snow/FARM_3.png` — Ferme, niveaux 14-20, neige (biome neige, reporté)
- `fields/snow/IRON_MINE_1.png` — Mine de fer, niveaux 1-6, neige (biome neige, reporté)
- `fields/snow/IRON_MINE_2.png` — Mine de fer, niveaux 7-13, neige (biome neige, reporté)
- `fields/snow/IRON_MINE_3.png` — Mine de fer, niveaux 14-20, neige (biome neige, reporté)
- `fields/snow/LUMBER_1.png` — Bûcheron, niveaux 1-6, neige (biome neige, reporté)
- `fields/snow/LUMBER_2.png` — Bûcheron, niveaux 7-13, neige (biome neige, reporté)
- `fields/snow/LUMBER_3.png` — Bûcheron, niveaux 14-20, neige (biome neige, reporté)
- `fields/snow/QUARRY_1.png` — Carrière de pierre, niveaux 1-6, neige (biome neige, reporté)
- `fields/snow/QUARRY_2.png` — Carrière de pierre, niveaux 7-13, neige (biome neige, reporté)
- `fields/snow/QUARRY_3.png` — Carrière de pierre, niveaux 14-20, neige (biome neige, reporté)

### 4. Parcelles vides — 4 images

- **Où ça se voit** : Le sol sous chaque bâtiment et les emplacements libres, deux variantes par biome (les deux de prairie sont peintes).
- **Taille et format** : 1024×1024, PNG transparent, cadre « building », guide 3D fourni par le kit.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Parcelles au sol (deux variantes par biome) ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.
- **Note** : Les 2 parcelles de neige sont reportées (même décision que les champs).

**Fichiers** :

- `plots/desert_0.png` — parcelle vide, désert, variante 1
- `plots/desert_1.png` — parcelle vide, désert, variante 2
- `plots/snow_0.png` — parcelle vide, neige, variante 1 (biome neige, reporté)
- `plots/snow_1.png` — parcelle vide, neige, variante 2 (biome neige, reporté)

### 5. Décors de scène — 7 images

- **Où ça se voit** : Autour de la ville et des champs, selon le biome : cactus, dune, palmier, souche, buisson fleuri (arbres, rochers et buissons de prairie déjà peints).
- **Taille et format** : 512×768 (portrait 2:3), PNG transparent, cadre « prop » : sujet centré, base à 89 % de la hauteur.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, guide 3D fourni par le kit.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Décors de scène (arbres, rochers, buissons, cactus, dunes) » ; sujets : `docs/PROMPTS-GRAPHIQUES.md` § 3 « Décors ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.
- **Note** : Le pin et le rocher enneigés sont reportés (biome neige).

**Fichiers** :

- `props/cactus.png` — un cactus
- `props/dune.png` — une petite dune de sable
- `props/flowers.png` — un buisson fleuri
- `props/palm.png` — un palmier
- `props/snowpine.png` — un pin enneigé (biome neige, reporté)
- `props/snowrock.png` — un rocher enneigé (biome neige, reporté)
- `props/stump.png` — une souche

### 6. Champs en chantier — 12 images

- **Où ça se voit** : À la place de la parcelle vide pendant la première construction d'un champ : premiers sillons et semeur, arbres abattus, première entaille dans la roche, entrée de mine étayée.
- **Taille et format** : 1024×1024, PNG transparent, cadre « building », guide = le champ fini de niveau 1 (kit).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Champs en chantier » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S10.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `fields/forest/FARM_site.png` — Ferme en chantier, prairie
- `fields/forest/LUMBER_site.png` — Bûcheron en chantier, prairie
- `fields/forest/QUARRY_site.png` — Carrière de pierre en chantier, prairie
- `fields/forest/IRON_MINE_site.png` — Mine de fer en chantier, prairie
- `fields/desert/FARM_site.png` — Ferme en chantier, désert
- `fields/desert/LUMBER_site.png` — Bûcheron en chantier, désert
- `fields/desert/QUARRY_site.png` — Carrière de pierre en chantier, désert
- `fields/desert/IRON_MINE_site.png` — Mine de fer en chantier, désert
- `fields/snow/FARM_site.png` — Ferme en chantier, neige (reporté)
- `fields/snow/LUMBER_site.png` — Bûcheron en chantier, neige (reporté)
- `fields/snow/QUARRY_site.png` — Carrière de pierre en chantier, neige (reporté)
- `fields/snow/IRON_MINE_site.png` — Mine de fer en chantier, neige (reporté)

### 7. Enceinte : courtines, murets et tours — 85 images

- **Où ça se voit** : Le mur d'enceinte de la ville, qui change avec le niveau du Mur : palier 1 (niveaux 1-6), 2 (7-13), 3 (14-20). Par civilisation : courtine haute de face droite et de face gauche (derrière la ville), muret bas des deux faces (devant), tour d'angle. Le palier 3 de Rome est déjà peint.
- **Taille et format** : 1024×1024, PNG transparent, cadre « building », guide 3D fourni par le kit (important : les tronçons doivent se raccorder).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, architecture de la civilisation (phrases du guide des bâtiments).
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Enceinte : courtines, murets et tours, 3 paliers × 6 civilisations » ; sujets : `docs/PROMPTS-GRAPHIQUES.md` § 3 « Enceinte ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.
- **Note** : Ordre conseillé : palier 2 (le plus vu), puis 3, puis 1, civilisation par civilisation. Pas de version neige.

**Fichiers** :

- `walls/EGYPT/1_seg_x.png` — Égypte, palier 1 (Mur 1-6) : courtine face droite, haute (derrière)
- `walls/EGYPT/1_seg_x_low.png` — Égypte, palier 1 (Mur 1-6) : courtine face droite, muret bas (devant)
- `walls/EGYPT/1_seg_z.png` — Égypte, palier 1 (Mur 1-6) : courtine face gauche, haute (derrière)
- `walls/EGYPT/1_seg_z_low.png` — Égypte, palier 1 (Mur 1-6) : courtine face gauche, muret bas (devant)
- `walls/EGYPT/1_tower.png` — Égypte, palier 1 (Mur 1-6) : tour d'angle
- `walls/EGYPT/2_seg_x.png` — Égypte, palier 2 (Mur 7-13) : courtine face droite, haute (derrière)
- `walls/EGYPT/2_seg_x_low.png` — Égypte, palier 2 (Mur 7-13) : courtine face droite, muret bas (devant)
- `walls/EGYPT/2_seg_z.png` — Égypte, palier 2 (Mur 7-13) : courtine face gauche, haute (derrière)
- `walls/EGYPT/2_seg_z_low.png` — Égypte, palier 2 (Mur 7-13) : courtine face gauche, muret bas (devant)
- `walls/EGYPT/2_tower.png` — Égypte, palier 2 (Mur 7-13) : tour d'angle
- `walls/EGYPT/3_seg_x.png` — Égypte, palier 3 (Mur 14-20) : courtine face droite, haute (derrière)
- `walls/EGYPT/3_seg_x_low.png` — Égypte, palier 3 (Mur 14-20) : courtine face droite, muret bas (devant)
- `walls/EGYPT/3_seg_z.png` — Égypte, palier 3 (Mur 14-20) : courtine face gauche, haute (derrière)
- `walls/EGYPT/3_seg_z_low.png` — Égypte, palier 3 (Mur 14-20) : courtine face gauche, muret bas (devant)
- `walls/EGYPT/3_tower.png` — Égypte, palier 3 (Mur 14-20) : tour d'angle
- `walls/GAUL/1_seg_x.png` — Gaule, palier 1 (Mur 1-6) : courtine face droite, haute (derrière)
- `walls/GAUL/1_seg_x_low.png` — Gaule, palier 1 (Mur 1-6) : courtine face droite, muret bas (devant)
- `walls/GAUL/1_seg_z.png` — Gaule, palier 1 (Mur 1-6) : courtine face gauche, haute (derrière)
- `walls/GAUL/1_seg_z_low.png` — Gaule, palier 1 (Mur 1-6) : courtine face gauche, muret bas (devant)
- `walls/GAUL/1_tower.png` — Gaule, palier 1 (Mur 1-6) : tour d'angle
- `walls/GAUL/2_seg_x.png` — Gaule, palier 2 (Mur 7-13) : courtine face droite, haute (derrière)
- `walls/GAUL/2_seg_x_low.png` — Gaule, palier 2 (Mur 7-13) : courtine face droite, muret bas (devant)
- `walls/GAUL/2_seg_z.png` — Gaule, palier 2 (Mur 7-13) : courtine face gauche, haute (derrière)
- `walls/GAUL/2_seg_z_low.png` — Gaule, palier 2 (Mur 7-13) : courtine face gauche, muret bas (devant)
- `walls/GAUL/2_tower.png` — Gaule, palier 2 (Mur 7-13) : tour d'angle
- `walls/GAUL/3_seg_x.png` — Gaule, palier 3 (Mur 14-20) : courtine face droite, haute (derrière)
- `walls/GAUL/3_seg_x_low.png` — Gaule, palier 3 (Mur 14-20) : courtine face droite, muret bas (devant)
- `walls/GAUL/3_seg_z.png` — Gaule, palier 3 (Mur 14-20) : courtine face gauche, haute (derrière)
- `walls/GAUL/3_seg_z_low.png` — Gaule, palier 3 (Mur 14-20) : courtine face gauche, muret bas (devant)
- `walls/GAUL/3_tower.png` — Gaule, palier 3 (Mur 14-20) : tour d'angle
- `walls/GREEK/1_seg_x.png` — Grèce, palier 1 (Mur 1-6) : courtine face droite, haute (derrière)
- `walls/GREEK/1_seg_x_low.png` — Grèce, palier 1 (Mur 1-6) : courtine face droite, muret bas (devant)
- `walls/GREEK/1_seg_z.png` — Grèce, palier 1 (Mur 1-6) : courtine face gauche, haute (derrière)
- `walls/GREEK/1_seg_z_low.png` — Grèce, palier 1 (Mur 1-6) : courtine face gauche, muret bas (devant)
- `walls/GREEK/1_tower.png` — Grèce, palier 1 (Mur 1-6) : tour d'angle
- `walls/GREEK/2_seg_x.png` — Grèce, palier 2 (Mur 7-13) : courtine face droite, haute (derrière)
- `walls/GREEK/2_seg_x_low.png` — Grèce, palier 2 (Mur 7-13) : courtine face droite, muret bas (devant)
- `walls/GREEK/2_seg_z.png` — Grèce, palier 2 (Mur 7-13) : courtine face gauche, haute (derrière)
- `walls/GREEK/2_seg_z_low.png` — Grèce, palier 2 (Mur 7-13) : courtine face gauche, muret bas (devant)
- `walls/GREEK/2_tower.png` — Grèce, palier 2 (Mur 7-13) : tour d'angle
- `walls/GREEK/3_seg_x.png` — Grèce, palier 3 (Mur 14-20) : courtine face droite, haute (derrière)
- `walls/GREEK/3_seg_x_low.png` — Grèce, palier 3 (Mur 14-20) : courtine face droite, muret bas (devant)
- `walls/GREEK/3_seg_z.png` — Grèce, palier 3 (Mur 14-20) : courtine face gauche, haute (derrière)
- `walls/GREEK/3_seg_z_low.png` — Grèce, palier 3 (Mur 14-20) : courtine face gauche, muret bas (devant)
- `walls/GREEK/3_tower.png` — Grèce, palier 3 (Mur 14-20) : tour d'angle
- `walls/HUN/1_seg_x.png` — Huns, palier 1 (Mur 1-6) : courtine face droite, haute (derrière)
- `walls/HUN/1_seg_x_low.png` — Huns, palier 1 (Mur 1-6) : courtine face droite, muret bas (devant)
- `walls/HUN/1_seg_z.png` — Huns, palier 1 (Mur 1-6) : courtine face gauche, haute (derrière)
- `walls/HUN/1_seg_z_low.png` — Huns, palier 1 (Mur 1-6) : courtine face gauche, muret bas (devant)
- `walls/HUN/1_tower.png` — Huns, palier 1 (Mur 1-6) : tour d'angle
- `walls/HUN/2_seg_x.png` — Huns, palier 2 (Mur 7-13) : courtine face droite, haute (derrière)
- `walls/HUN/2_seg_x_low.png` — Huns, palier 2 (Mur 7-13) : courtine face droite, muret bas (devant)
- `walls/HUN/2_seg_z.png` — Huns, palier 2 (Mur 7-13) : courtine face gauche, haute (derrière)
- `walls/HUN/2_seg_z_low.png` — Huns, palier 2 (Mur 7-13) : courtine face gauche, muret bas (devant)
- `walls/HUN/2_tower.png` — Huns, palier 2 (Mur 7-13) : tour d'angle
- `walls/HUN/3_seg_x.png` — Huns, palier 3 (Mur 14-20) : courtine face droite, haute (derrière)
- `walls/HUN/3_seg_x_low.png` — Huns, palier 3 (Mur 14-20) : courtine face droite, muret bas (devant)
- `walls/HUN/3_seg_z.png` — Huns, palier 3 (Mur 14-20) : courtine face gauche, haute (derrière)
- `walls/HUN/3_seg_z_low.png` — Huns, palier 3 (Mur 14-20) : courtine face gauche, muret bas (devant)
- `walls/HUN/3_tower.png` — Huns, palier 3 (Mur 14-20) : tour d'angle
- `walls/ROME/1_seg_x.png` — Rome, palier 1 (Mur 1-6) : courtine face droite, haute (derrière)
- `walls/ROME/1_seg_x_low.png` — Rome, palier 1 (Mur 1-6) : courtine face droite, muret bas (devant)
- `walls/ROME/1_seg_z.png` — Rome, palier 1 (Mur 1-6) : courtine face gauche, haute (derrière)
- `walls/ROME/1_seg_z_low.png` — Rome, palier 1 (Mur 1-6) : courtine face gauche, muret bas (devant)
- `walls/ROME/1_tower.png` — Rome, palier 1 (Mur 1-6) : tour d'angle
- `walls/ROME/2_seg_x.png` — Rome, palier 2 (Mur 7-13) : courtine face droite, haute (derrière)
- `walls/ROME/2_seg_x_low.png` — Rome, palier 2 (Mur 7-13) : courtine face droite, muret bas (devant)
- `walls/ROME/2_seg_z.png` — Rome, palier 2 (Mur 7-13) : courtine face gauche, haute (derrière)
- `walls/ROME/2_seg_z_low.png` — Rome, palier 2 (Mur 7-13) : courtine face gauche, muret bas (devant)
- `walls/ROME/2_tower.png` — Rome, palier 2 (Mur 7-13) : tour d'angle
- `walls/SULTAN/1_seg_x.png` — Sultanat, palier 1 (Mur 1-6) : courtine face droite, haute (derrière)
- `walls/SULTAN/1_seg_x_low.png` — Sultanat, palier 1 (Mur 1-6) : courtine face droite, muret bas (devant)
- `walls/SULTAN/1_seg_z.png` — Sultanat, palier 1 (Mur 1-6) : courtine face gauche, haute (derrière)
- `walls/SULTAN/1_seg_z_low.png` — Sultanat, palier 1 (Mur 1-6) : courtine face gauche, muret bas (devant)
- `walls/SULTAN/1_tower.png` — Sultanat, palier 1 (Mur 1-6) : tour d'angle
- `walls/SULTAN/2_seg_x.png` — Sultanat, palier 2 (Mur 7-13) : courtine face droite, haute (derrière)
- `walls/SULTAN/2_seg_x_low.png` — Sultanat, palier 2 (Mur 7-13) : courtine face droite, muret bas (devant)
- `walls/SULTAN/2_seg_z.png` — Sultanat, palier 2 (Mur 7-13) : courtine face gauche, haute (derrière)
- `walls/SULTAN/2_seg_z_low.png` — Sultanat, palier 2 (Mur 7-13) : courtine face gauche, muret bas (devant)
- `walls/SULTAN/2_tower.png` — Sultanat, palier 2 (Mur 7-13) : tour d'angle
- `walls/SULTAN/3_seg_x.png` — Sultanat, palier 3 (Mur 14-20) : courtine face droite, haute (derrière)
- `walls/SULTAN/3_seg_x_low.png` — Sultanat, palier 3 (Mur 14-20) : courtine face droite, muret bas (devant)
- `walls/SULTAN/3_seg_z.png` — Sultanat, palier 3 (Mur 14-20) : courtine face gauche, haute (derrière)
- `walls/SULTAN/3_seg_z_low.png` — Sultanat, palier 3 (Mur 14-20) : courtine face gauche, muret bas (devant)
- `walls/SULTAN/3_tower.png` — Sultanat, palier 3 (Mur 14-20) : tour d'angle

### 8. Portes de la ville — 6 images

- **Où ça se voit** : La porte sur l'arête sud-est de l'enceinte, aujourd'hui dessinée par le code. Une seule porte par civilisation, valable pour tous les niveaux du Mur.
- **Taille et format** : 1024×1024, PNG transparent, même cadrage que les tours (losange 51 %, centre à 73 %) ; porte vue de face droite, ouverture vers le bas-droit, battants ouverts, deux tourelles, torches.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, dans le style du palier 2 de l'enceinte de la civilisation.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Portes de la ville par civilisation » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S1.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `walls/ROME/gate.png` — porte de la ville de Rome
- `walls/GAUL/gate.png` — porte de la ville de Gaule
- `walls/GREEK/gate.png` — porte de la ville de Grèce
- `walls/EGYPT/gate.png` — porte de la ville d'Égypte
- `walls/HUN/gate.png` — porte de la ville des Huns
- `walls/SULTAN/gate.png` — porte de la ville du Sultanat

### 9. Enceinte en chantier — 18 images

- **Où ça se voit** : Le Mur en travaux : premières assises posées, échafaudage de la civilisation, ouvriers.
- **Taille et format** : 1024×1024, PNG transparent, cadre « building », guide = le tronçon fini du palier 1 (kit).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, techniques de chantier de la civilisation (guide § S10).
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Enceinte en chantier » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S10.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `walls/ROME/site_seg_x.png` — Rome : courtine face droite en chantier
- `walls/ROME/site_seg_z.png` — Rome : courtine face gauche en chantier
- `walls/ROME/site_tower.png` — Rome : tour d'angle en chantier
- `walls/GAUL/site_seg_x.png` — Gaule : courtine face droite en chantier
- `walls/GAUL/site_seg_z.png` — Gaule : courtine face gauche en chantier
- `walls/GAUL/site_tower.png` — Gaule : tour d'angle en chantier
- `walls/GREEK/site_seg_x.png` — Grèce : courtine face droite en chantier
- `walls/GREEK/site_seg_z.png` — Grèce : courtine face gauche en chantier
- `walls/GREEK/site_tower.png` — Grèce : tour d'angle en chantier
- `walls/EGYPT/site_seg_x.png` — Égypte : courtine face droite en chantier
- `walls/EGYPT/site_seg_z.png` — Égypte : courtine face gauche en chantier
- `walls/EGYPT/site_tower.png` — Égypte : tour d'angle en chantier
- `walls/HUN/site_seg_x.png` — Huns : courtine face droite en chantier
- `walls/HUN/site_seg_z.png` — Huns : courtine face gauche en chantier
- `walls/HUN/site_tower.png` — Huns : tour d'angle en chantier
- `walls/SULTAN/site_seg_x.png` — Sultanat : courtine face droite en chantier
- `walls/SULTAN/site_seg_z.png` — Sultanat : courtine face gauche en chantier
- `walls/SULTAN/site_tower.png` — Sultanat : tour d'angle en chantier

### 10. Échafaudages par civilisation — 18 images

- **Où ça se voit** : Posé par-dessus un bâtiment pendant une amélioration (structure seule, le bâtiment reste visible à travers). Trois tailles : bâtiments de niveaux 1-6, 7-13, 14-20. C'est ce qui habille tout de suite tous les chantiers.
- **Taille et format** : 1024×1024, PNG transparent, même cadrage que les bâtiments (losange 51 %, centre à 73 %), rien derrière.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint : Rome perches et grue à roue ; Gaule perches et claies ; Grèce chèvre à poulie ; Égypte rampe et traîneau ; Huns cadre de perches et feutre ; Sultanat troncs de palmier et palan.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Échafaudages par civilisation (trois tailles) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S11.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `props/scaffold_ROME_1.png` — échafaudage de Rome, taille 1 (bâtiments de niveaux 1-6)
- `props/scaffold_ROME_2.png` — échafaudage de Rome, taille 2 (bâtiments de niveaux 7-13)
- `props/scaffold_ROME_3.png` — échafaudage de Rome, taille 3 (bâtiments de niveaux 14-20)
- `props/scaffold_GAUL_1.png` — échafaudage de Gaule, taille 1 (bâtiments de niveaux 1-6)
- `props/scaffold_GAUL_2.png` — échafaudage de Gaule, taille 2 (bâtiments de niveaux 7-13)
- `props/scaffold_GAUL_3.png` — échafaudage de Gaule, taille 3 (bâtiments de niveaux 14-20)
- `props/scaffold_GREEK_1.png` — échafaudage de Grèce, taille 1 (bâtiments de niveaux 1-6)
- `props/scaffold_GREEK_2.png` — échafaudage de Grèce, taille 2 (bâtiments de niveaux 7-13)
- `props/scaffold_GREEK_3.png` — échafaudage de Grèce, taille 3 (bâtiments de niveaux 14-20)
- `props/scaffold_EGYPT_1.png` — échafaudage d'Égypte, taille 1 (bâtiments de niveaux 1-6)
- `props/scaffold_EGYPT_2.png` — échafaudage d'Égypte, taille 2 (bâtiments de niveaux 7-13)
- `props/scaffold_EGYPT_3.png` — échafaudage d'Égypte, taille 3 (bâtiments de niveaux 14-20)
- `props/scaffold_HUN_1.png` — échafaudage des Huns, taille 1 (bâtiments de niveaux 1-6)
- `props/scaffold_HUN_2.png` — échafaudage des Huns, taille 2 (bâtiments de niveaux 7-13)
- `props/scaffold_HUN_3.png` — échafaudage des Huns, taille 3 (bâtiments de niveaux 14-20)
- `props/scaffold_SULTAN_1.png` — échafaudage du Sultanat, taille 1 (bâtiments de niveaux 1-6)
- `props/scaffold_SULTAN_2.png` — échafaudage du Sultanat, taille 2 (bâtiments de niveaux 7-13)
- `props/scaffold_SULTAN_3.png` — échafaudage du Sultanat, taille 3 (bâtiments de niveaux 14-20)

### 11. Ornements de plaza — 18 images

- **Où ça se voit** : Autour du Bâtiment principal : une statue sur socle, une fontaine ou un puits, un étal de marché à auvent, dans l'architecture de chaque civilisation.
- **Taille et format** : 512×768 (portrait 2:3), PNG transparent, cadre « prop ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Ornements de plaza par civilisation (statue, fontaine, étal) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S16.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `props/plaza_ROME_statue.png` — Rome : statue sur socle
- `props/plaza_ROME_fountain.png` — Rome : fontaine ou puits
- `props/plaza_ROME_stall.png` — Rome : étal de marché à auvent
- `props/plaza_GAUL_statue.png` — Gaule : statue sur socle
- `props/plaza_GAUL_fountain.png` — Gaule : fontaine ou puits
- `props/plaza_GAUL_stall.png` — Gaule : étal de marché à auvent
- `props/plaza_GREEK_statue.png` — Grèce : statue sur socle
- `props/plaza_GREEK_fountain.png` — Grèce : fontaine ou puits
- `props/plaza_GREEK_stall.png` — Grèce : étal de marché à auvent
- `props/plaza_EGYPT_statue.png` — Égypte : statue sur socle
- `props/plaza_EGYPT_fountain.png` — Égypte : fontaine ou puits
- `props/plaza_EGYPT_stall.png` — Égypte : étal de marché à auvent
- `props/plaza_HUN_statue.png` — Huns : statue sur socle
- `props/plaza_HUN_fountain.png` — Huns : fontaine ou puits
- `props/plaza_HUN_stall.png` — Huns : étal de marché à auvent
- `props/plaza_SULTAN_statue.png` — Sultanat : statue sur socle
- `props/plaza_SULTAN_fountain.png` — Sultanat : fontaine ou puits
- `props/plaza_SULTAN_stall.png` — Sultanat : étal de marché à auvent

### 12. Panneau « construire ici » et parchemin « recherche en cours » — 2 images

- **Où ça se voit** : Le panneau sur les emplacements libres (aujourd'hui un losange pointillé avec un « + ») ; le parchemin au-dessus de l'Académie tant qu'une recherche est en cours.
- **Taille et format** : 512×768 (portrait 2:3), PNG transparent, cadre « prop ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, aucune lettre sur le panneau (un symbole de marteau).
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Panneau « construire ici », parchemin « recherche en cours » » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S2 et S6.
- **Dans le jeu** : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** :

- `props/sign_build.png` — panneau de bois « construire ici » avec un marteau dessiné, sans lettres
- `props/scroll_research.png` — grand parchemin déroulé avec une plume, dressé comme un panneau

### 13. Sol de la carte — 20 images

- **Où ça se voit** : Tout le fond de la carte du monde : 7 sols (eau, glace, sable, terre, herbe sèche, herbe, neige) en 2 à 4 variantes que le jeu mélange par taches ; les fondus entre sols sont faits par le jeu. Commencer par la variante 1 de chaque sol : 7 images qui changent toute la carte.
- **Taille et format** : 1024×1024, PNG **opaque**, vue de dessus, répétable sans raccord, détails fins (l'image couvre environ 6 × 6 cases).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : **Style de la carte de référence** (`docs/img/carte-reference.jpg`, rendu 3D doux, pas le style peint de la ville), vu de dessus.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 1 « Sol » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `map/world/ground/water_1.png` — eau, variante 1 sur 2 (rivière)
- `map/world/ground/water_2.png` — eau, variante 2 sur 2 (lac)
- `map/world/ground/ice_1.png` — glace, variante 1 sur 2 (glace lisse)
- `map/world/ground/ice_2.png` — glace, variante 2 sur 2 (glace rugueuse)
- `map/world/ground/sand_1.png` — sable, variante 1 sur 3 (sable ridé)
- `map/world/ground/sand_2.png` — sable, variante 2 sur 3 (sable caillouteux)
- `map/world/ground/sand_3.png` — sable, variante 3 sur 3 (sable sec)
- `map/world/ground/earth_1.png` — terre (champs), variante 1 sur 3 (champ labouré)
- `map/world/ground/earth_2.png` — terre (champs), variante 2 sur 3 (jeunes pousses)
- `map/world/ground/earth_3.png` — terre (champs), variante 3 sur 3 (chaume après moisson)
- `map/world/ground/drygrass_1.png` — herbe sèche, variante 1 sur 3 (steppe dorée)
- `map/world/ground/drygrass_2.png` — herbe sèche, variante 2 sur 3 (herbe sèche clairsemée)
- `map/world/ground/drygrass_3.png` — herbe sèche, variante 3 sur 3 (touffes hautes)
- `map/world/ground/grass_1.png` — herbe (prairie), variante 1 sur 4 (prairie rase)
- `map/world/ground/grass_2.png` — herbe (prairie), variante 2 sur 4 (prairie fleurie)
- `map/world/ground/grass_3.png` — herbe (prairie), variante 3 sur 4 (herbe dense au trèfle)
- `map/world/ground/grass_4.png` — herbe (prairie), variante 4 sur 4 (prairie caillouteuse)
- `map/world/ground/snow_1.png` — neige, variante 1 sur 3 (poudreuse)
- `map/world/ground/snow_2.png` — neige, variante 2 sur 3 (neige croûtée)
- `map/world/ground/snow_3.png` — neige, variante 3 sur 3 (neige fine)

### 14. Forêts, rochers et montagnes — 57 images

- **Où ça se voit** : Les massifs forestiers (forêt dense et lisières, tempérées et enneigées), les amas de rochers (infranchissables) et rochers du désert, les montagnes (isolée, chaîne dans un axe, chaîne dans l'autre, cœur de massif) × 3 biomes × 3 modèles.
- **Taille et format** : 1024×1024, PNG transparent, élément posé sur une case (losange à 50 % de la largeur, centre à 75 %), sans socle ; image guide `docs/img/guides-carte/guide-objet.png`.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 2 « Forêts » (prompt complet et image guide pour chaque fichier) et § 3 « Rochers et montagnes ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `map/world/forest/temperate_1.png` — Forêt dense en zone tempérée (variante 1
- `map/world/forest/temperate_2.png` — Forêt dense en zone tempérée (variante 2
- `map/world/forest/temperate_3.png` — Forêt dense en zone tempérée (variante 3
- `map/world/forest/temperate_4.png` — Forêt dense en zone tempérée (variante 4
- `map/world/forest/temperate_edge_1.png` — Lisière de forêt tempérée (variante 1
- `map/world/forest/temperate_edge_2.png` — Lisière de forêt tempérée (variante 2
- `map/world/forest/temperate_edge_3.png` — Lisière de forêt tempérée (variante 3
- `map/world/forest/snow_1.png` — Forêt enneigée dense (variante 1
- `map/world/forest/snow_2.png` — Forêt enneigée dense (variante 2
- `map/world/forest/snow_3.png` — Forêt enneigée dense (variante 3
- `map/world/forest/snow_4.png` — Forêt enneigée dense (variante 4
- `map/world/forest/snow_edge_1.png` — Lisière de forêt enneigée (variante 1
- `map/world/forest/snow_edge_2.png` — Lisière de forêt enneigée (variante 2
- `map/world/forest/snow_edge_3.png` — Lisière de forêt enneigée (variante 3
- `map/world/rocks/boulders_1.png` — Amas de rochers (variante 1), infranchissable
- `map/world/rocks/boulders_2.png` — Amas de rochers (variante 2), infranchissable
- `map/world/rocks/boulders_3.png` — Amas de rochers (variante 3), infranchissable
- `map/world/rocks/boulders_4.png` — Amas de rochers (variante 4), infranchissable
- `map/world/rocks/desert_1.png` — Rochers épars du désert (variante 1), franchissables
- `map/world/rocks/desert_2.png` — Rochers épars du désert (variante 2), franchissables
- `map/world/rocks/desert_3.png` — Rochers épars du désert (variante 3), franchissables
- `map/world/mountains/temperate_1.png` — Montagne tempérée isolée, modèle 1/3, infranchissable
- `map/world/mountains/temperate_x_1.png` — Chaîne de montagnes tempérée dans l'axe haut-gauche → bas-droite, modèle 1/3
- `map/world/mountains/temperate_y_1.png` — Chaîne de montagnes tempérée dans l'axe haut-droite → bas-gauche, modèle 1/3
- `map/world/mountains/temperate_xy_1.png` — Cœur de massif tempérée entouré de montagnes, modèle 1/3
- `map/world/mountains/temperate_2.png` — Montagne tempérée isolée, modèle 2/3, infranchissable
- `map/world/mountains/temperate_x_2.png` — Chaîne de montagnes tempérée dans l'axe haut-gauche → bas-droite, modèle 2/3
- `map/world/mountains/temperate_y_2.png` — Chaîne de montagnes tempérée dans l'axe haut-droite → bas-gauche, modèle 2/3
- `map/world/mountains/temperate_xy_2.png` — Cœur de massif tempérée entouré de montagnes, modèle 2/3
- `map/world/mountains/temperate_3.png` — Montagne tempérée isolée, modèle 3/3, infranchissable
- `map/world/mountains/temperate_x_3.png` — Chaîne de montagnes tempérée dans l'axe haut-gauche → bas-droite, modèle 3/3
- `map/world/mountains/temperate_y_3.png` — Chaîne de montagnes tempérée dans l'axe haut-droite → bas-gauche, modèle 3/3
- `map/world/mountains/temperate_xy_3.png` — Cœur de massif tempérée entouré de montagnes, modèle 3/3
- `map/world/mountains/snow_1.png` — Montagne enneigée isolée, modèle 1/3, infranchissable
- `map/world/mountains/snow_x_1.png` — Chaîne de montagnes enneigée dans l'axe haut-gauche → bas-droite, modèle 1/3
- `map/world/mountains/snow_y_1.png` — Chaîne de montagnes enneigée dans l'axe haut-droite → bas-gauche, modèle 1/3
- `map/world/mountains/snow_xy_1.png` — Cœur de massif enneigée entouré de montagnes, modèle 1/3
- `map/world/mountains/snow_2.png` — Montagne enneigée isolée, modèle 2/3, infranchissable
- `map/world/mountains/snow_x_2.png` — Chaîne de montagnes enneigée dans l'axe haut-gauche → bas-droite, modèle 2/3
- `map/world/mountains/snow_y_2.png` — Chaîne de montagnes enneigée dans l'axe haut-droite → bas-gauche, modèle 2/3
- `map/world/mountains/snow_xy_2.png` — Cœur de massif enneigée entouré de montagnes, modèle 2/3
- `map/world/mountains/snow_3.png` — Montagne enneigée isolée, modèle 3/3, infranchissable
- `map/world/mountains/snow_x_3.png` — Chaîne de montagnes enneigée dans l'axe haut-gauche → bas-droite, modèle 3/3
- `map/world/mountains/snow_y_3.png` — Chaîne de montagnes enneigée dans l'axe haut-droite → bas-gauche, modèle 3/3
- `map/world/mountains/snow_xy_3.png` — Cœur de massif enneigée entouré de montagnes, modèle 3/3
- `map/world/mountains/desert_1.png` — Montagne du désert (mesa) isolée, modèle 1/3, infranchissable
- `map/world/mountains/desert_x_1.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-gauche → bas-droite, modèle 1/3
- `map/world/mountains/desert_y_1.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-droite → bas-gauche, modèle 1/3
- `map/world/mountains/desert_xy_1.png` — Cœur de massif du désert (mesa) entouré de montagnes, modèle 1/3
- `map/world/mountains/desert_2.png` — Montagne du désert (mesa) isolée, modèle 2/3, infranchissable
- `map/world/mountains/desert_x_2.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-gauche → bas-droite, modèle 2/3
- `map/world/mountains/desert_y_2.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-droite → bas-gauche, modèle 2/3
- `map/world/mountains/desert_xy_2.png` — Cœur de massif du désert (mesa) entouré de montagnes, modèle 2/3
- `map/world/mountains/desert_3.png` — Montagne du désert (mesa) isolée, modèle 3/3, infranchissable
- `map/world/mountains/desert_x_3.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-gauche → bas-droite, modèle 3/3
- `map/world/mountains/desert_y_3.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-droite → bas-gauche, modèle 3/3
- `map/world/mountains/desert_xy_3.png` — Cœur de massif du désert (mesa) entouré de montagnes, modèle 3/3

### 15. Ponts, gués, désert et eau — 18 images

- **Où ça se voit** : Passages des rivières (pont = vitesse normale, gué = moitié moins vite) dans les deux axes, dunes, ruines et palmiers du désert, bateaux et quais en décor sur l'eau.
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 4 « Rivières : ponts et gués » (prompt complet et image guide pour chaque fichier), § 5 « Désert » et § 6 « Eau ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `map/world/desert/dunes_1.png` — Dunes (variante 1)
- `map/world/desert/dunes_2.png` — Dunes (variante 2)
- `map/world/desert/dunes_3.png` — Dunes (variante 3)
- `map/world/desert/ruins_1.png` — Ruines du désert (variante 1)
- `map/world/desert/ruins_2.png` — Ruines du désert (variante 2)
- `map/world/desert/ruins_3.png` — Ruines du désert (variante 3)
- `map/world/desert/palms_1.png` — Palmiers au bord d'une oasis (variante 1)
- `map/world/desert/palms_2.png` — Palmiers au bord d'une oasis (variante 2)
- `map/world/desert/palms_3.png` — Palmiers au bord d'une oasis (variante 3)
- `map/world/river/bridge_x.png` — Pont (axe haut-gauche → bas-droite)
- `map/world/river/bridge_y.png` — Pont (axe haut-droite → bas-gauche)
- `map/world/river/ford_x.png` — Gué (axe haut-gauche → bas-droite)
- `map/world/river/ford_y.png` — Gué (axe haut-droite → bas-gauche)
- `map/world/water/boat_1.png` — Bateau (décor, variante 1) sur les rivières et les lacs
- `map/world/water/boat_2.png` — Bateau (décor, variante 2) sur les rivières et les lacs
- `map/world/water/boat_3.png` — Bateau (décor, variante 3) sur les rivières et les lacs
- `map/world/water/dock_x.png` — Quai (décor) au bord de l'eau
- `map/world/water/dock_y.png` — Quai (décor) au bord de l'eau

### 16. Décor des cases — 26 images

- **Où ça se voit** : Comme sur la carte de référence : champs de blé et meules autour des villes, cailloux, agaves, cactus, buissons et arbres isolés au bord de l'eau, buissons et cailloux givrés en zone enneigée.
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 8 « Décor des cases, comme sur la carte de référence » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `map/world/fields/wheat_1.png` — Champ de blé (variante 1)
- `map/world/fields/wheat_2.png` — Champ de blé (variante 2)
- `map/world/fields/wheat_3.png` — Champ de blé (variante 3)
- `map/world/decor/haystack_1.png` — Meule de foin (variante 1)
- `map/world/decor/haystack_2.png` — Meule de foin (variante 2)
- `map/world/decor/stones_1.png` — Cailloux épars (variante 1)
- `map/world/decor/stones_2.png` — Cailloux épars (variante 2)
- `map/world/decor/stones_3.png` — Cailloux épars (variante 3)
- `map/world/decor/agave_1.png` — Agave (variante 1)
- `map/world/decor/agave_2.png` — Agave (variante 2)
- `map/world/decor/agave_3.png` — Agave (variante 3)
- `map/world/decor/cactus_1.png` — Cactus du désert (variante 1)
- `map/world/decor/cactus_2.png` — Cactus du désert (variante 2)
- `map/world/decor/bush_1.png` — Buisson (variante 1)
- `map/world/decor/bush_2.png` — Buisson (variante 2)
- `map/world/decor/bush_3.png` — Buisson (variante 3)
- `map/world/decor/tree_1.png` — Arbre isolé (variante 1)
- `map/world/decor/tree_2.png` — Arbre isolé (variante 2)
- `map/world/decor/tree_3.png` — Arbre isolé (variante 3)
- `map/world/decor/snow_bush_1.png` — Buisson givré (variante 1)
- `map/world/decor/snow_bush_2.png` — Buisson givré (variante 2)
- `map/world/decor/snow_stones_1.png` — Cailloux enneigés (variante 1)
- `map/world/decor/snow_stones_2.png` — Cailloux enneigés (variante 2)
- `map/world/decor/desert_stones_1.png` — Cailloux du désert (variante 1)
- `map/world/decor/desert_stones_2.png` — Cailloux du désert (variante 2)
- `map/world/decor/desert_stones_3.png` — Cailloux du désert (variante 3)

### 17. Nuages qui passent — 3 images

- **Où ça se voit** : Ambiance légère : quelques nuages très transparents dérivent lentement au-dessus de la carte.
- **Taille et format** : 1536×1024 (paysage), PNG transparent, bords très doux, pas d'image guide.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence, vu du même angle.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 7 « Nuages qui passent » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.
- **Note** : `docs/GENERATION-COMPLETE.md` les laisse en « non classé » (3 images) ; ils sont bien dans `docs/A-GENERER.md` étape 5.

**Fichiers** :

- `map/world/fx/cloud_1.png` — nuage léger qui dérive au-dessus de la carte, variante 1
- `map/world/fx/cloud_2.png` — nuage léger qui dérive au-dessus de la carte, variante 2
- `map/world/fx/cloud_3.png` — nuage léger qui dérive au-dessus de la carte, variante 3

### 18. Points de ressource — 45 images

- **Où ça se voit** : Les points de ressource de la carte : bois, pierre, fer, nourriture, or × 3 terrains (tempéré, désert, neige) × 3 richesses (petit, moyen, riche), sans couleur de civilisation.
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence, style rustique sans bannière.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 11 « Points de ressource » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `map/resources/wood_forest_1.png` — bois, tempéré, niveau 1 (petit)
- `map/resources/wood_forest_2.png` — bois, tempéré, niveau 2 (moyen)
- `map/resources/wood_forest_3.png` — bois, tempéré, niveau 3 (riche)
- `map/resources/wood_desert_1.png` — bois, désert, niveau 1 (petit)
- `map/resources/wood_desert_2.png` — bois, désert, niveau 2 (moyen)
- `map/resources/wood_desert_3.png` — bois, désert, niveau 3 (riche)
- `map/resources/wood_snow_1.png` — bois, neige, niveau 1 (petit)
- `map/resources/wood_snow_2.png` — bois, neige, niveau 2 (moyen)
- `map/resources/wood_snow_3.png` — bois, neige, niveau 3 (riche)
- `map/resources/stone_forest_1.png` — pierre, tempéré, niveau 1 (petit)
- `map/resources/stone_forest_2.png` — pierre, tempéré, niveau 2 (moyen)
- `map/resources/stone_forest_3.png` — pierre, tempéré, niveau 3 (riche)
- `map/resources/stone_desert_1.png` — pierre, désert, niveau 1 (petit)
- `map/resources/stone_desert_2.png` — pierre, désert, niveau 2 (moyen)
- `map/resources/stone_desert_3.png` — pierre, désert, niveau 3 (riche)
- `map/resources/stone_snow_1.png` — pierre, neige, niveau 1 (petit)
- `map/resources/stone_snow_2.png` — pierre, neige, niveau 2 (moyen)
- `map/resources/stone_snow_3.png` — pierre, neige, niveau 3 (riche)
- `map/resources/iron_forest_1.png` — fer, tempéré, niveau 1 (petit)
- `map/resources/iron_forest_2.png` — fer, tempéré, niveau 2 (moyen)
- `map/resources/iron_forest_3.png` — fer, tempéré, niveau 3 (riche)
- `map/resources/iron_desert_1.png` — fer, désert, niveau 1 (petit)
- `map/resources/iron_desert_2.png` — fer, désert, niveau 2 (moyen)
- `map/resources/iron_desert_3.png` — fer, désert, niveau 3 (riche)
- `map/resources/iron_snow_1.png` — fer, neige, niveau 1 (petit)
- `map/resources/iron_snow_2.png` — fer, neige, niveau 2 (moyen)
- `map/resources/iron_snow_3.png` — fer, neige, niveau 3 (riche)
- `map/resources/food_forest_1.png` — nourriture, tempéré, niveau 1 (petit)
- `map/resources/food_forest_2.png` — nourriture, tempéré, niveau 2 (moyen)
- `map/resources/food_forest_3.png` — nourriture, tempéré, niveau 3 (riche)
- `map/resources/food_desert_1.png` — nourriture, désert, niveau 1 (petit)
- `map/resources/food_desert_2.png` — nourriture, désert, niveau 2 (moyen)
- `map/resources/food_desert_3.png` — nourriture, désert, niveau 3 (riche)
- `map/resources/food_snow_1.png` — nourriture, neige, niveau 1 (petit)
- `map/resources/food_snow_2.png` — nourriture, neige, niveau 2 (moyen)
- `map/resources/food_snow_3.png` — nourriture, neige, niveau 3 (riche)
- `map/resources/gold_forest_1.png` — or, tempéré, niveau 1 (petit)
- `map/resources/gold_forest_2.png` — or, tempéré, niveau 2 (moyen)
- `map/resources/gold_forest_3.png` — or, tempéré, niveau 3 (riche)
- `map/resources/gold_desert_1.png` — or, désert, niveau 1 (petit)
- `map/resources/gold_desert_2.png` — or, désert, niveau 2 (moyen)
- `map/resources/gold_desert_3.png` — or, désert, niveau 3 (riche)
- `map/resources/gold_snow_1.png` — or, neige, niveau 1 (petit)
- `map/resources/gold_snow_2.png` — or, neige, niveau 2 (moyen)
- `map/resources/gold_snow_3.png` — or, neige, niveau 3 (riche)

### 19. Camps des tribus et ruines — 12 images

- **Où ça se voit** : Le camp de la tribu qui tient un point de ressource (niveau 1 petit camp, 2 camp palissadé, 3 fort de bois), par biome ; les ruines après sa défaite jusqu'à sa réapparition. Sans eux, l'icône de ressource reste.
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 12 « Camps des tribus, ruines, fondation » (prompt complet et image guide pour chaque fichier) ; sujets en français : `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § « Camps barbares de la carte ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `map/camps/camp1.png` — camp de tribu, niveau 1, prairie
- `map/camps/camp1_desert.png` — camp de tribu, niveau 1, désert
- `map/camps/camp1_snow.png` — camp de tribu, niveau 1, neige
- `map/camps/camp2.png` — camp de tribu, niveau 2, prairie
- `map/camps/camp2_desert.png` — camp de tribu, niveau 2, désert
- `map/camps/camp2_snow.png` — camp de tribu, niveau 2, neige
- `map/camps/camp3.png` — camp de tribu, niveau 3, prairie
- `map/camps/camp3_desert.png` — camp de tribu, niveau 3, désert
- `map/camps/camp3_snow.png` — camp de tribu, niveau 3, neige
- `map/camps/ruins.png` — camp détruit (ruines), prairie
- `map/camps/ruins_desert.png` — camp détruit (ruines), désert
- `map/camps/ruins_snow.png` — camp détruit (ruines), neige

### 20. Campement de fondation — 3 images

- **Où ça se voit** : Le point de ressource pendant les 24 h de fondation d'une ville : tentes, chariot bâché, piquets et cordes de la future enceinte (la bannière du fondateur est ajoutée par le jeu).
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 12 « Camps des tribus, ruines, fondation » (prompt complet et image guide pour chaque fichier) ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S12.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.
- **Note** : `docs/A-GENERER.md` les compte deux fois (étape 5 et étape 9) ; ici une seule fois.

**Fichiers** :

- `map/camps/foundation.png` — campement de fondation d'une ville, prairie
- `map/camps/foundation_desert.png` — campement de fondation d'une ville, désert
- `map/camps/foundation_snow.png` — campement de fondation d'une ville, neige

### 21. Donjons des invasions barbares (hordes) — 5 images

- **Où ça se voit** : Le repaire d'une horde de cavaliers des steppes pendant les invasions du week-end, du niveau 1 au niveau 5 ; aujourd'hui la forteresse des Huns sur un halo rouge. Style des Huns : yourtes de feutre, palissades de pieux, totems à crânes de cheval, étendards en queue de cheval rouges.
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet). Une variante par biome est possible mais pas demandée (`horde_<n>_desert`, `horde_<n>_snow` : le jeu les prend s'il les trouve).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence (même famille que les camps des tribus).
- **Prompt** : aucun prompt écrit dans les sources ; prompt ci-dessous = préfixe de la carte (`docs/PROMPTS-CARTE.md`, « Comment produire une image ») + composition d'une case + sujet.
- **Dans le jeu** : le dessin du donjon cherche déjà ces noms (`horde_<niveau>`), mais le chargeur de la carte ne les charge pas encore et l'outil d'import ne les connaît pas : petit travail de code de mon côté à la livraison (chargeur + registre, quelques lignes), compris dans l'intégration.

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours, detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel); otherwise a flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, without any plot, slab or base under it (the ground is transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width, centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.
```

Puis, pour chaque fichier :

- `map/camps/horde_1.png` — `Subject: the lair of a steppe horde, level 1: a ring of sharpened stakes, three felt yurts, a horse-skull totem, red horsetail standards, a campfire; nothing else on the tile.`
- `map/camps/horde_2.png` — `Subject: the lair of a steppe horde, level 2: a taller stake palisade with a gate and a wooden watchtower, five felt yurts, horse pens, skull totems, red horsetail standards; nothing else on the tile.`
- `map/camps/horde_3.png` — `Subject: the lair of a steppe horde, level 3: a log fort with two corner towers, the chief's large yurt on a low mound, horse pens, skull totems, several red horsetail standards; nothing else on the tile.`
- `map/camps/horde_4.png` — `Subject: the lair of a steppe horde, level 4: a stone-and-timber stronghold on a mound with ramparts and a chief's tower, yurts inside, skull totems, many red horsetail standards; nothing else on the tile.`
- `map/camps/horde_5.png` — `Subject: the lair of a steppe horde, level 5: a great fortress of stone and dark timber on a hill with three visible tiers (outpost, ramparts, chief's tower), red horsetail banners, skull totems, torches; nothing else on the tile.`

**Fichiers** :

- `map/camps/horde_1.png` — niveau 1 : palissade de pieux, trois yourtes, totem à crâne de cheval, feu
- `map/camps/horde_2.png` — niveau 2 : palissade plus haute avec porte et tour de guet, cinq yourtes, enclos
- `map/camps/horde_3.png` — niveau 3 : fort de rondins à deux tours, grande yourte du chef sur une butte
- `map/camps/horde_4.png` — niveau 4 : place forte de pierre et de bois sur une butte, remparts, tour du chef
- `map/camps/horde_5.png` — niveau 5 : grande forteresse sur une colline, trois étages visibles (avant-poste, remparts, tour du chef)

### 22. Armées en marche — 29 images

- **Où ça se voit** : Le marqueur d'une armée qui se déplace sur la carte, par classe dominante (infanterie, archers, cavalerie, engins) et par civilisation, plus la version neutre de repli et la charrette du marchand (armées de transport). Aussi utilisés dans le replay de bataille.
- **Taille et format** : 1024×1024, PNG transparent, petit groupe de figurines marchant vers le bas-droit, pieds à 75 % de la hauteur ; guide `docs/img/guides-carte/guide-armee.png`.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence, coiffes et couleurs de la civilisation.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 13 « Armées en marche » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `map/units/archer.png` — archers (neutre, sans civilisation : repli)
- `map/units/archer_EGYPT.png` — archers d'Égypte
- `map/units/archer_GAUL.png` — archers de Gaule
- `map/units/archer_GREEK.png` — archers de Grèce
- `map/units/archer_HUN.png` — archers des Huns
- `map/units/archer_ROME.png` — archers de Rome
- `map/units/archer_SULTAN.png` — archers du Sultanat
- `map/units/catapult.png` — engins de siège (neutre, sans civilisation : repli)
- `map/units/catapult_EGYPT.png` — engins de siège d'Égypte
- `map/units/catapult_GAUL.png` — engins de siège de Gaule
- `map/units/catapult_GREEK.png` — engins de siège de Grèce
- `map/units/catapult_HUN.png` — engins de siège des Huns
- `map/units/catapult_ROME.png` — engins de siège de Rome
- `map/units/catapult_SULTAN.png` — engins de siège du Sultanat
- `map/units/cavalry.png` — cavalerie (neutre, sans civilisation : repli)
- `map/units/cavalry_EGYPT.png` — cavalerie d'Égypte
- `map/units/cavalry_GAUL.png` — cavalerie de Gaule
- `map/units/cavalry_GREEK.png` — cavalerie de Grèce
- `map/units/cavalry_HUN.png` — cavalerie des Huns
- `map/units/cavalry_ROME.png` — cavalerie de Rome
- `map/units/cavalry_SULTAN.png` — cavalerie du Sultanat
- `map/units/hoplite.png` — infanterie (neutre, sans civilisation : repli)
- `map/units/hoplite_EGYPT.png` — infanterie d'Égypte
- `map/units/hoplite_GAUL.png` — infanterie de Gaule
- `map/units/hoplite_GREEK.png` — infanterie de Grèce
- `map/units/hoplite_HUN.png` — infanterie des Huns
- `map/units/hoplite_ROME.png` — infanterie de Rome
- `map/units/hoplite_SULTAN.png` — infanterie du Sultanat
- `map/units/merchant.png` — charrette du marchand (armées de transport)

### 23. Cortège de colons — 7 images

- **Où ça se voit** : L'armée partie fonder une ville : chariot bâché tiré par des bœufs, famille à pied, homme au piquet à fanion ; une version neutre et une par civilisation (charrette du marchand tant que le sprite manque).
- **Taille et format** : 1024×1024, PNG transparent, guide-armee.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 13 « Armées en marche » (prompt complet et image guide pour chaque fichier) ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S12.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `map/units/settler.png` — cortège de colons, sans civilisation (repli)
- `map/units/settler_ROME.png` — cortège de colons de Rome
- `map/units/settler_GAUL.png` — cortège de colons de Gaule
- `map/units/settler_GREEK.png` — cortège de colons de Grèce
- `map/units/settler_EGYPT.png` — cortège de colons d'Égypte
- `map/units/settler_HUN.png` — cortège de colons des Huns
- `map/units/settler_SULTAN.png` — cortège de colons du Sultanat

### 24. Héros en tête d'armée et espion — 7 images

- **Où ça se voit** : Une armée menée par le héros prend ce marqueur (héros à cheval devant la troupe) ; une mission d'espionnage prend la silhouette encapuchonnée.
- **Taille et format** : 1024×1024, PNG transparent, guide-armee.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 13 « Armées en marche » (prompt complet et image guide pour chaque fichier) ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S18.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `map/units/hero_ROME.png` — héros de Rome à cheval en tête de deux soldats
- `map/units/hero_GAUL.png` — héros de Gaule à cheval en tête de deux soldats
- `map/units/hero_GREEK.png` — héros de Grèce à cheval en tête de deux soldats
- `map/units/hero_EGYPT.png` — héros d'Égypte à cheval en tête de deux soldats
- `map/units/hero_HUN.png` — héros des Huns à cheval en tête de deux soldats
- `map/units/hero_SULTAN.png` — héros du Sultanat à cheval en tête de deux soldats
- `map/units/spy.png` — espion : silhouette encapuchonnée à cheval

### 25. Cycles de marche des armées (planches) — 33 planches (198 cases)

- **Où ça se voit** : L'animation de marche sur la carte, pour chaque groupe de la colonne : par classe et civilisation, héros en tête, marchand, colons, espion. Sans elle, l'armée trottine avec son image immobile.
- **Taille et format** : **Une planche par armée** : 6 poses en grille de 3 colonnes × 2 rangées, image 1536×1024, chaque pose dans un carré de 512×512, PNG transparent ; guide `docs/img/guides-carte/guide-armee-planche.png`. Je découpe à l'import.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une planche 3 × 2 par ligne.
- **Style** : Style de la carte de référence ; mêmes figurines, même taille et même place dans chaque case, seule la pose change.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 15 « Marche des armées (une image de 6 poses par armée) » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `map/units/settler_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cortège de colons (chariot bâché, famille à pied)
- `map/units/hoplite_ROME_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie de Rome
- `map/units/archer_ROME_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers de Rome
- `map/units/cavalry_ROME_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie de Rome
- `map/units/catapult_ROME_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège de Rome
- `map/units/hoplite_GAUL_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie de Gaule
- `map/units/archer_GAUL_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers de Gaule
- `map/units/cavalry_GAUL_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie de Gaule
- `map/units/catapult_GAUL_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège de Gaule
- `map/units/hoplite_GREEK_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie de Grèce
- `map/units/archer_GREEK_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers de Grèce
- `map/units/cavalry_GREEK_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie de Grèce
- `map/units/catapult_GREEK_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège de Grèce
- `map/units/hoplite_EGYPT_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie d'Égypte
- `map/units/archer_EGYPT_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers d'Égypte
- `map/units/cavalry_EGYPT_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie d'Égypte
- `map/units/catapult_EGYPT_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège d'Égypte
- `map/units/hoplite_HUN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie des Huns
- `map/units/archer_HUN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers des Huns
- `map/units/cavalry_HUN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie des Huns
- `map/units/catapult_HUN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège des Huns
- `map/units/hoplite_SULTAN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie du Sultanat
- `map/units/archer_SULTAN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers du Sultanat
- `map/units/cavalry_SULTAN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie du Sultanat
- `map/units/catapult_SULTAN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège du Sultanat
- `map/units/hero_ROME_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros de Rome
- `map/units/hero_GAUL_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros de Gaule
- `map/units/hero_GREEK_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros de Grèce
- `map/units/hero_EGYPT_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros d'Égypte
- `map/units/hero_HUN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros des Huns
- `map/units/hero_SULTAN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros du Sultanat
- `map/units/merchant_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : charrette du marchand
- `map/units/spy_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : espion encapuchonné à cheval

### 26. Replay de bataille : poses, projectiles, impacts — 2 images + 15 bandes (41 cases)

- **Où ça se voit** : Le replay des rapports de combat : chaque classe qui attaque (3 poses) et qui est touchée (2 poses), le héros de chaque civilisation qui attaque, une flèche, une pierre de catapulte, un éclat d'impact.
- **Taille et format** : Poses : bande horizontale de N cases de 512×512 dans une seule image, PNG transparent, même cadrage que l'armée immobile (guide-armee). Flèche et pierre : 512×512.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 16 « Plus tard : poses du replay de bataille » (prompt complet et image guide pour chaque fichier) ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A6 et A18.
- **Dans le jeu** : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** :

- `fx/arrow.png` — flèche en vol, vue de côté
- `fx/stone.png` — pierre de catapulte
- `map/units/hero_ROME_attack.png` — bande de 3 cases de 512×512 — héros de Rome : armer, frapper, retour
- `map/units/hero_GAUL_attack.png` — bande de 3 cases de 512×512 — héros de Gaule : armer, frapper, retour
- `map/units/hero_GREEK_attack.png` — bande de 3 cases de 512×512 — héros de Grèce : armer, frapper, retour
- `map/units/hero_EGYPT_attack.png` — bande de 3 cases de 512×512 — héros d'Égypte : armer, frapper, retour
- `map/units/hero_HUN_attack.png` — bande de 3 cases de 512×512 — héros des Huns : armer, frapper, retour
- `map/units/hero_SULTAN_attack.png` — bande de 3 cases de 512×512 — héros du Sultanat : armer, frapper, retour
- `map/units/hoplite_attack.png` — bande de 3 cases de 512×512 — infanterie : armer, frapper ou tirer, retour
- `map/units/hoplite_hit.png` — bande de 2 cases de 512×512 — infanterie touchés : recul, chute
- `map/units/archer_attack.png` — bande de 3 cases de 512×512 — archers : armer, frapper ou tirer, retour
- `map/units/archer_hit.png` — bande de 2 cases de 512×512 — archers touchés : recul, chute
- `map/units/cavalry_attack.png` — bande de 3 cases de 512×512 — cavalerie : armer, frapper ou tirer, retour
- `map/units/cavalry_hit.png` — bande de 2 cases de 512×512 — cavalerie touchés : recul, chute
- `map/units/catapult_attack.png` — bande de 3 cases de 512×512 — engins de siège : armer, frapper ou tirer, retour
- `map/units/catapult_hit.png` — bande de 2 cases de 512×512 — engins de siège touchés : recul, chute
- `fx/impact.png` — bande de 3 cases de 512×512 — éclat d'impact : étincelle, étoile, poussière

### 27. Effets de la carte — 5 bandes (20 cases)

- **Où ça se voit** : Combat en cours, ville en feu (déjà branché : une ville au mur abîmé brûle), feu de camp des tribus, pluie et neige.
- **Taille et format** : Bande horizontale de 4 cases de 512×512 dans une seule image, PNG transparent.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 14 « Effets de la carte » (prompt complet et image guide pour chaque fichier) et § 17 ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A7 et A17.
- **Dans le jeu** : le feu est déjà branché ; combat, feu de camp et météo : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** :

- `map/fx/rain.png` — bande de 4 cases de 512×512 — nappe de pluie translucide
- `map/fx/snowfall.png` — bande de 4 cases de 512×512 — chute de neige
- `map/fx/battle.png` — bande de 4 cases de 512×512 — deux épées qui s'entrechoquent, étincelles (combat en cours)
- `map/fx/fire.png` — bande de 4 cases de 512×512 — flammes orange et fumée sombre (ville en feu, déjà branché)
- `map/fx/campfire.png` — bande de 4 cases de 512×512 — petit feu de camp (camp des tribus)

### 28. Bannières de la boutique d'alliance — 4 images

- **Où ça se voit** : Cosmétique acheté avec les points d'alliance et planté devant les villes du joueur sur la carte. Une bannière n'est mise en vente qu'une fois son image livrée (`data/alliance-shop.json`).
- **Taille et format** : 512×768 (portrait 2:3, comme les drapeaux `props/flag_*`, affichée en 128×192), PNG transparent. Le 1024×1024 annoncé dans `docs/A-GENERER.md` convient aussi, je recadre.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint (c'est un objet posé sur la carte, mais vu comme un drapeau de ville) : étendard de tissu sur sa hampe plantée dans le sol, vu de trois quarts, emblème brodé, couleurs neutres valables pour toutes les civilisations.
- **Prompt** : aucun prompt écrit dans les sources ; prompt ci-dessous = préfixe peint + composition « prop » + sujet.
- **Dans le jeu** : la boutique (`data/alliance-shop.json`) et la carte attendent déjà ces noms sous `painted/banners/` ; seul l'outil d'import ne les connaît pas encore : je les ajoute au registre à la livraison (quelques lignes).

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Composition: 2:3 portrait image, the prop centered horizontally, its base at 89% of the image height, about 60% of the width.
```

Puis, pour chaque fichier :

- `banners/banner_eagle.png` — `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a golden eagle, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`
- `banners/banner_wolf.png` — `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a grey wolf's head, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`
- `banners/banner_sun.png` — `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a radiant sun, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`
- `banners/banner_bull.png` — `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a black bull's head, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`

**Fichiers** :

- `banners/banner_eagle.png` — bannière de l'aigle
- `banners/banner_wolf.png` — bannière du loup
- `banners/banner_sun.png` — bannière du soleil
- `banners/banner_bull.png` — bannière du taureau

### 29. Bastion, Merveille, Immortels (à confirmer : ce sont des villes spéciales) — 10 images

- **Où ça se voit** : Le Bastion d'alliance (forteresse commune, et son chantier de 3 jours), la Ville Merveille de fin de partie (5 étapes de construction) et les sites des Immortels (site gardé, site libre, plan). Aujourd'hui le jeu réutilise une forteresse de civilisation. Les noms du Bastion, de son chantier et des 5 Merveilles sont ceux que le code de la carte cherche ; les 3 noms des sites des Immortels viennent des listes (`docs/LISTE-GRAPHISMES.md` § 4), rien ne les affiche encore. **Ils partagent le cadrage 2 × 2 des villes de la carte, exclues de cette liste : à toi de dire si tu les produis maintenant ou avec les villes.**
- **Taille et format** : Bastion, chantier et 5 Merveilles : 1024×1024, PNG transparent, bloc de 2 × 2 cases (losange à 90 % de la largeur, centre à 68 %), guide `docs/img/guides-carte/guide-ville.png`. Les 3 sites des Immortels : 1024×1024, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence, style neutre valable pour toutes les civilisations. Immortels = armée d'élite perse : tentes pourpres et or, étendards au soleil ailé.
- **Prompt** : aucun prompt écrit dans les sources (seulement la description de `docs/A-GENERER.md`, en tête) ; prompts ci-dessous = préfixe de la carte + composition « ville 2 × 2 » ou « une case » + sujet.
- **Dans le jeu** : rien ne s'affiche tout seul à l'import : le chargeur de la carte ne charge que les villes de son manifeste, les sites des Immortels n'ont pas encore de dessin, et l'outil d'import ne connaît aucun de ces 10 noms. Petit travail de code de mon côté à la livraison (chargeur, affichage des sites, registre), compris dans l'intégration.

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours, detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel); otherwise a flat pure magenta (#FF00FF) background, which will be removed.

Villes 2 × 2 : Composition: square image (1024 x 1024). A walled site whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. The main gate stands in the middle of the front-right wall. No ground plate under it: outside the walls the image is transparent, only the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the site, do not draw the red diamond, the marks or the grey background.

Sites d'une case : Composition: square image (1024 x 1024). The subject stands directly on the ground, without any plot, slab or base under it (the ground is transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width, centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.
```

Puis, pour chaque fichier :

- `map/cities/bastion.png` — `Subject: a great neutral alliance fortress: massive stone curtain walls with square towers, a central keep, plain banners without emblem, a style that suits every civilisation.`
- `map/cities/bastion_site.png` — `Subject: the same alliance fortress under construction: foundations and low walls, wooden scaffolding, a wooden crane, piles of cut stones and logs, workers' tents.`
- `map/cities/wonder_0.png` — `Subject: a fortified neutral city with, in its middle, the foundations of a colossal ancient monument: a vast stone platform, trenches, first courses of stone, cranes.`
- `map/cities/wonder_25.png` — `Subject: the same fortified city with the monument a quarter built: tall scaffolding around the first storeys, cranes, ramps.`
- `map/cities/wonder_50.png` — `Subject: the same fortified city with the monument half built: the lower half finished in pale stone, scaffolding above.`
- `map/cities/wonder_75.png` — `Subject: the same fortified city with the monument almost finished: only the top still in scaffolding, gold trims appearing.`
- `map/cities/wonder_100.png` — `Subject: the same fortified city with the monument finished: a colossal gleaming monument of pale stone and gold, banners and torches, a style that suits every civilisation.`
- `map/camps/wonder_site_immortals.png` — `Subject: the camp of the Persian Immortals, an elite army, around monumental ancient ruins: purple and gold tents, winged-sun standards, spear racks, a campfire.`
- `map/camps/wonder_site.png` — `Subject: monumental ancient ruins alone: broken colossal columns, a cracked stone platform, fallen blocks, nobody around.`
- `map/camps/immortals_plan.png` — `Subject: a small fortified camp of the Persian Immortals (purple and gold tents, winged-sun standard) around a chest and a stand of rolled plans.`

**Fichiers** :

- `map/cities/bastion.png` — Bastion d'alliance debout : forteresse commune de pierre massive, tours carrées, donjon central, bannières sans emblème
- `map/cities/bastion_site.png` — chantier du Bastion : même emprise, fondations, échafaudages, grue de bois, tas de pierres
- `map/cities/wonder_0.png` — Ville Merveille, étape 1/5 : fondations tracées au centre d'une ville fortifiée
- `map/cities/wonder_25.png` — étape 2/5 : échafaudages, premiers étages
- `map/cities/wonder_50.png` — étape 3/5 : monument à moitié construit
- `map/cities/wonder_75.png` — étape 4/5 : presque achevé, dernier échafaudage au sommet
- `map/cities/wonder_100.png` — étape 5/5 : monument achevé et doré, bannières
- `map/camps/wonder_site_immortals.png` — site de Merveille gardé : camp des Immortels (tentes pourpres et or, soleil ailé) autour de ruines monumentales
- `map/camps/wonder_site.png` — site de Merveille libre : ruines monumentales seules
- `map/camps/immortals_plan.png` — plan de la Merveille : petit camp fortifié des Immortels autour d'un coffre et de rouleaux

### 30. Figurines de classe — 24 images

- **Où ça se voit** : Fiches d'unité, cartes de recrutement et onglet Armée : la figurine en pied de chaque classe (fantassin, archer, cavalier, engin) aux couleurs de chaque civilisation. Repli des 60 figurines par unité.
- **Taille et format** : 1024×1536 (portrait 2:3), PNG transparent, cadre « figure » : personnage en pied centré, pieds à 90 % de la hauteur, trois quarts, tourné vers la droite ; guide 3D fourni par le kit.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, coiffe de la civilisation (`docs/PROMPTS-GRAPHIQUES.md` § 3 « Coiffes »).
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Figurines de classe (4 classes × 6 civilisations) ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `figures/ARCHER_EGYPT.png` — archer d'Égypte, en pied
- `figures/ARCHER_GAUL.png` — archer de Gaule, en pied
- `figures/ARCHER_GREEK.png` — archer de Grèce, en pied
- `figures/ARCHER_HUN.png` — archer des Huns, en pied
- `figures/ARCHER_ROME.png` — archer de Rome, en pied
- `figures/ARCHER_SULTAN.png` — archer du Sultanat, en pied
- `figures/CAVALRY_EGYPT.png` — cavalier d'Égypte, en pied
- `figures/CAVALRY_GAUL.png` — cavalier de Gaule, en pied
- `figures/CAVALRY_GREEK.png` — cavalier de Grèce, en pied
- `figures/CAVALRY_HUN.png` — cavalier des Huns, en pied
- `figures/CAVALRY_ROME.png` — cavalier de Rome, en pied
- `figures/CAVALRY_SULTAN.png` — cavalier du Sultanat, en pied
- `figures/INFANTRY_EGYPT.png` — fantassin d'Égypte, en pied
- `figures/INFANTRY_GAUL.png` — fantassin de Gaule, en pied
- `figures/INFANTRY_GREEK.png` — fantassin de Grèce, en pied
- `figures/INFANTRY_HUN.png` — fantassin des Huns, en pied
- `figures/INFANTRY_ROME.png` — fantassin de Rome, en pied
- `figures/INFANTRY_SULTAN.png` — fantassin du Sultanat, en pied
- `figures/SIEGE_EGYPT.png` — engin de siège avec ses servants d'Égypte, en pied
- `figures/SIEGE_GAUL.png` — engin de siège avec ses servants de Gaule, en pied
- `figures/SIEGE_GREEK.png` — engin de siège avec ses servants de Grèce, en pied
- `figures/SIEGE_HUN.png` — engin de siège avec ses servants des Huns, en pied
- `figures/SIEGE_ROME.png` — engin de siège avec ses servants de Rome, en pied
- `figures/SIEGE_SULTAN.png` — engin de siège avec ses servants du Sultanat, en pied

### 31. Jetons de classe — 28 images

- **Où ça se voit** : Listes compactes, rapports de bataille, composition d'armée : tête et épaules de chaque classe, version neutre et par civilisation.
- **Taille et format** : 1024×1024, PNG transparent, cadre « bust » : tête et épaules remplissant 80 % du cadre, légèrement tourné vers la droite ; guide 3D (kit).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Jetons de classe ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `busts/ARCHER.png` — archer (neutre, sans civilisation), tête et épaules
- `busts/ARCHER_EGYPT.png` — archer d'Égypte, tête et épaules
- `busts/ARCHER_GAUL.png` — archer de Gaule, tête et épaules
- `busts/ARCHER_GREEK.png` — archer de Grèce, tête et épaules
- `busts/ARCHER_HUN.png` — archer des Huns, tête et épaules
- `busts/ARCHER_ROME.png` — archer de Rome, tête et épaules
- `busts/ARCHER_SULTAN.png` — archer du Sultanat, tête et épaules
- `busts/CAVALRY.png` — cavalier (neutre, sans civilisation), tête et épaules
- `busts/CAVALRY_EGYPT.png` — cavalier d'Égypte, tête et épaules
- `busts/CAVALRY_GAUL.png` — cavalier de Gaule, tête et épaules
- `busts/CAVALRY_GREEK.png` — cavalier de Grèce, tête et épaules
- `busts/CAVALRY_HUN.png` — cavalier des Huns, tête et épaules
- `busts/CAVALRY_ROME.png` — cavalier de Rome, tête et épaules
- `busts/CAVALRY_SULTAN.png` — cavalier du Sultanat, tête et épaules
- `busts/INFANTRY.png` — fantassin (neutre, sans civilisation), tête et épaules
- `busts/INFANTRY_EGYPT.png` — fantassin d'Égypte, tête et épaules
- `busts/INFANTRY_GAUL.png` — fantassin de Gaule, tête et épaules
- `busts/INFANTRY_GREEK.png` — fantassin de Grèce, tête et épaules
- `busts/INFANTRY_HUN.png` — fantassin des Huns, tête et épaules
- `busts/INFANTRY_ROME.png` — fantassin de Rome, tête et épaules
- `busts/INFANTRY_SULTAN.png` — fantassin du Sultanat, tête et épaules
- `busts/SIEGE.png` — engin de siège avec ses servants (neutre, sans civilisation), tête et épaules
- `busts/SIEGE_EGYPT.png` — engin de siège avec ses servants d'Égypte, tête et épaules
- `busts/SIEGE_GAUL.png` — engin de siège avec ses servants de Gaule, tête et épaules
- `busts/SIEGE_GREEK.png` — engin de siège avec ses servants de Grèce, tête et épaules
- `busts/SIEGE_HUN.png` — engin de siège avec ses servants des Huns, tête et épaules
- `busts/SIEGE_ROME.png` — engin de siège avec ses servants de Rome, tête et épaules
- `busts/SIEGE_SULTAN.png` — engin de siège avec ses servants du Sultanat, tête et épaules

### 32. Fiches d'unité : une figurine par unité — 60 images

- **Où ça se voit** : La figurine propre à chacune des 60 unités (fiche d'unité, carte de recrutement) ; sans elle, la figurine de classe sert de repli.
- **Taille et format** : 1024×1536, PNG transparent, cadre « figure » ; le kit donne la figurine de la classe comme guide.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint ; le palier se lit sur l'équipement : base = cuir, bois et toile ; intermédiaire = bronze, cotte de mailles, cimier ; élite = armure ornée, plumes, dorures, cape.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Fiches d'unité : une figurine par unité (60) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S17.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `figures/units/ROM_INF_MILICIEN.png` — Milicien romain (Rome, base)
- `figures/units/ROM_INF_TRIARII.png` — Triarii (Rome, intermédiaire)
- `figures/units/ROM_INF_LEGIONNAIRE.png` — Légionnaire romain (Rome, élite)
- `figures/units/ROM_ARC_MILICIEN.png` — Archer milicien (Rome, base)
- `figures/units/ROM_ARC_VETERAN.png` — Archer vétéran (Rome, intermédiaire)
- `figures/units/ROM_ARC_ELITE.png` — Archer d’élite romain (Rome, élite)
- `figures/units/ROM_CAV_AUXILIAIRE.png` — Cavalerie auxiliaire (Rome, base)
- `figures/units/ROM_CAV_EQUITES.png` — Equites (Rome, intermédiaire)
- `figures/units/ROM_CAV_LOURDE.png` — Cavalerie lourde romaine (Rome, élite)
- `figures/units/ROM_SIEGE_CATAPULTE.png` — Catapulte romaine (Rome, siège)
- `figures/units/GAU_INF_GUERRIER.png` — Guerrier gaulois (Gaule, base)
- `figures/units/GAU_INF_TRIARII.png` — Triarii gaulois (Gaule, intermédiaire)
- `figures/units/GAU_INF_CHAMPION.png` — Champion gaulois (Gaule, élite)
- `figures/units/GAU_ARC_CHASSEUR.png` — Chasseur gaulois (Gaule, base)
- `figures/units/GAU_ARC_GAULOIS.png` — Archer gaulois (Gaule, intermédiaire)
- `figures/units/GAU_ARC_NOBLE.png` — Archer noble (Gaule, élite)
- `figures/units/GAU_CAV_CHASSEUR.png` — Chasseur monté (Gaule, base)
- `figures/units/GAU_CAV_GAULOIS.png` — Cavalier gaulois (Gaule, intermédiaire)
- `figures/units/GAU_CAV_NOBLE.png` — Cavalier noble (Gaule, élite)
- `figures/units/GAU_SIEGE_BELIER.png` — Bélier gaulois (Gaule, siège)
- `figures/units/GRE_INF_JEUNE.png` — GRE_INF_JEUNE
- `figures/units/GRE_INF_HOPLITE.png` — GRE_INF_HOPLITE
- `figures/units/GRE_INF_SPARTIATE.png` — GRE_INF_SPARTIATE
- `figures/units/GRE_ARC_PAYSAN.png` — GRE_ARC_PAYSAN
- `figures/units/GRE_ARC_TOXOTE.png` — GRE_ARC_TOXOTE
- `figures/units/GRE_ARC_ELITE.png` — GRE_ARC_ELITE
- `figures/units/GRE_CAV_ECLAIREUR.png` — GRE_CAV_ECLAIREUR
- `figures/units/GRE_CAV_GREC.png` — GRE_CAV_GREC
- `figures/units/GRE_CAV_ELITE.png` — GRE_CAV_ELITE
- `figures/units/GRE_SIEGE_CATAPULTE.png` — GRE_SIEGE_CATAPULTE
- `figures/units/EGY_INF_ESCLAVE.png` — EGY_INF_ESCLAVE
- `figures/units/EGY_INF_NIL.png` — EGY_INF_NIL
- `figures/units/EGY_INF_TEMPLE.png` — EGY_INF_TEMPLE
- `figures/units/EGY_ARC_NIL.png` — EGY_ARC_NIL
- `figures/units/EGY_ARC_DESERT.png` — EGY_ARC_DESERT
- `figures/units/EGY_ARC_PHARAON.png` — EGY_ARC_PHARAON
- `figures/units/EGY_CAV_DESERT.png` — EGY_CAV_DESERT
- `figures/units/EGY_CAV_PHARAON.png` — EGY_CAV_PHARAON
- `figures/units/EGY_CAV_CHAR_LOURD.png` — EGY_CAV_CHAR_LOURD
- `figures/units/EGY_SIEGE_MANGONNEAU.png` — EGY_SIEGE_MANGONNEAU
- `figures/units/HUN_INF_NOMADE.png` — Guerrier nomade (Huns, base)
- `figures/units/HUN_INF_GARDE.png` — Garde tribale (Huns, intermédiaire)
- `figures/units/HUN_INF_VETERAN.png` — Nomade vétéran (Huns, élite)
- `figures/units/HUN_ARC_NOMADE.png` — Archer nomade (Huns, base)
- `figures/units/HUN_ARC_CAMP.png` — Archer du camp (Huns, intermédiaire)
- `figures/units/HUN_ARC_ELITE.png` — Archer d’élite hun (Huns, élite)
- `figures/units/HUN_CAV_PILLARD.png` — Cavalier pillard (Huns, base)
- `figures/units/HUN_CAV_INTER.png` — Cavalier hun (Huns, intermédiaire)
- `figures/units/HUN_CAV_ELITE.png` — Horde d’Attila (Huns, élite)
- `figures/units/HUN_SIEGE_SAPEUR.png` — Sapeurs huns (Huns, siège)
- `figures/units/SUL_INF_DESERT.png` — Guerrier du désert (Sultanat, base)
- `figures/units/SUL_INF_CROISSANT.png` — Guerrier du croissant (Sultanat, intermédiaire)
- `figures/units/SUL_INF_PALAIS.png` — Défenseur du palais (Sultanat, élite)
- `figures/units/SUL_ARC_DESERT.png` — Archer du désert (Sultanat, base)
- `figures/units/SUL_ARC_TIREUR.png` — Tireur du désert (Sultanat, intermédiaire)
- `figures/units/SUL_ARC_PERSE.png` — Archer perse (Sultanat, élite)
- `figures/units/SUL_CAV_BEDOUIN.png` — Cavalier bédouin (Sultanat, base)
- `figures/units/SUL_CAV_DESERT.png` — Cavalier du désert (Sultanat, intermédiaire)
- `figures/units/SUL_CAV_MAMELOUK.png` — Mamelouk du palais (Sultanat, élite)
- `figures/units/SUL_SIEGE_MANGONNEAU.png` — Mangonneau oriental (Sultanat, siège)

### 33. Fiches d'unité : un jeton par unité — 60 images

- **Où ça se voit** : Le jeton (tête et épaules) propre à chaque unité : listes, rapports, composition d'armée.
- **Taille et format** : 1024×1024, PNG transparent, cadre « bust ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, même personnage que la figurine.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Fiches d'unité : un jeton par unité (60) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S17.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `busts/units/ROM_INF_MILICIEN.png` — Milicien romain (Rome)
- `busts/units/ROM_INF_TRIARII.png` — Triarii (Rome)
- `busts/units/ROM_INF_LEGIONNAIRE.png` — Légionnaire romain (Rome)
- `busts/units/ROM_ARC_MILICIEN.png` — Archer milicien (Rome)
- `busts/units/ROM_ARC_VETERAN.png` — Archer vétéran (Rome)
- `busts/units/ROM_ARC_ELITE.png` — Archer d’élite romain (Rome)
- `busts/units/ROM_CAV_AUXILIAIRE.png` — Cavalerie auxiliaire (Rome)
- `busts/units/ROM_CAV_EQUITES.png` — Equites (Rome)
- `busts/units/ROM_CAV_LOURDE.png` — Cavalerie lourde romaine (Rome)
- `busts/units/ROM_SIEGE_CATAPULTE.png` — Catapulte romaine (Rome)
- `busts/units/GAU_INF_GUERRIER.png` — Guerrier gaulois (Gaule)
- `busts/units/GAU_INF_TRIARII.png` — Triarii gaulois (Gaule)
- `busts/units/GAU_INF_CHAMPION.png` — Champion gaulois (Gaule)
- `busts/units/GAU_ARC_CHASSEUR.png` — Chasseur gaulois (Gaule)
- `busts/units/GAU_ARC_GAULOIS.png` — Archer gaulois (Gaule)
- `busts/units/GAU_ARC_NOBLE.png` — Archer noble (Gaule)
- `busts/units/GAU_CAV_CHASSEUR.png` — Chasseur monté (Gaule)
- `busts/units/GAU_CAV_GAULOIS.png` — Cavalier gaulois (Gaule)
- `busts/units/GAU_CAV_NOBLE.png` — Cavalier noble (Gaule)
- `busts/units/GAU_SIEGE_BELIER.png` — Bélier gaulois (Gaule)
- `busts/units/GRE_INF_JEUNE.png` — GRE_INF_JEUNE
- `busts/units/GRE_INF_HOPLITE.png` — GRE_INF_HOPLITE
- `busts/units/GRE_INF_SPARTIATE.png` — GRE_INF_SPARTIATE
- `busts/units/GRE_ARC_PAYSAN.png` — GRE_ARC_PAYSAN
- `busts/units/GRE_ARC_TOXOTE.png` — GRE_ARC_TOXOTE
- `busts/units/GRE_ARC_ELITE.png` — GRE_ARC_ELITE
- `busts/units/GRE_CAV_ECLAIREUR.png` — GRE_CAV_ECLAIREUR
- `busts/units/GRE_CAV_GREC.png` — GRE_CAV_GREC
- `busts/units/GRE_CAV_ELITE.png` — GRE_CAV_ELITE
- `busts/units/GRE_SIEGE_CATAPULTE.png` — GRE_SIEGE_CATAPULTE
- `busts/units/EGY_INF_ESCLAVE.png` — EGY_INF_ESCLAVE
- `busts/units/EGY_INF_NIL.png` — EGY_INF_NIL
- `busts/units/EGY_INF_TEMPLE.png` — EGY_INF_TEMPLE
- `busts/units/EGY_ARC_NIL.png` — EGY_ARC_NIL
- `busts/units/EGY_ARC_DESERT.png` — EGY_ARC_DESERT
- `busts/units/EGY_ARC_PHARAON.png` — EGY_ARC_PHARAON
- `busts/units/EGY_CAV_DESERT.png` — EGY_CAV_DESERT
- `busts/units/EGY_CAV_PHARAON.png` — EGY_CAV_PHARAON
- `busts/units/EGY_CAV_CHAR_LOURD.png` — EGY_CAV_CHAR_LOURD
- `busts/units/EGY_SIEGE_MANGONNEAU.png` — EGY_SIEGE_MANGONNEAU
- `busts/units/HUN_INF_NOMADE.png` — Guerrier nomade (Huns)
- `busts/units/HUN_INF_GARDE.png` — Garde tribale (Huns)
- `busts/units/HUN_INF_VETERAN.png` — Nomade vétéran (Huns)
- `busts/units/HUN_ARC_NOMADE.png` — Archer nomade (Huns)
- `busts/units/HUN_ARC_CAMP.png` — Archer du camp (Huns)
- `busts/units/HUN_ARC_ELITE.png` — Archer d’élite hun (Huns)
- `busts/units/HUN_CAV_PILLARD.png` — Cavalier pillard (Huns)
- `busts/units/HUN_CAV_INTER.png` — Cavalier hun (Huns)
- `busts/units/HUN_CAV_ELITE.png` — Horde d’Attila (Huns)
- `busts/units/HUN_SIEGE_SAPEUR.png` — Sapeurs huns (Huns)
- `busts/units/SUL_INF_DESERT.png` — Guerrier du désert (Sultanat)
- `busts/units/SUL_INF_CROISSANT.png` — Guerrier du croissant (Sultanat)
- `busts/units/SUL_INF_PALAIS.png` — Défenseur du palais (Sultanat)
- `busts/units/SUL_ARC_DESERT.png` — Archer du désert (Sultanat)
- `busts/units/SUL_ARC_TIREUR.png` — Tireur du désert (Sultanat)
- `busts/units/SUL_ARC_PERSE.png` — Archer perse (Sultanat)
- `busts/units/SUL_CAV_BEDOUIN.png` — Cavalier bédouin (Sultanat)
- `busts/units/SUL_CAV_DESERT.png` — Cavalier du désert (Sultanat)
- `busts/units/SUL_CAV_MAMELOUK.png` — Mamelouk du palais (Sultanat)
- `busts/units/SUL_SIEGE_MANGONNEAU.png` — Mangonneau oriental (Sultanat)

### 34. Héros de chaque civilisation : en pied et buste — 12 images

- **Où ça se voit** : L'écran du héros (en pied, posé sur l'estrade), les cartes d'armée et le choix de civilisation (buste).
- **Taille et format** : En pied : 1024×1536, PNG transparent, cadre « stage » (pieds à 90 % de la hauteur, sans l'estrade). Buste : 1024×1024, cadre « bust ». Guides 3D fournis par le kit.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint : coiffe de la civilisation, armure dorée, cape, épée et bouclier rond.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Héros sur l'estrade (6) » et « Bustes des héros (choix de civilisation, cartes d'armée) ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `heroes/EGYPT.png` — héros d'Égypte en pied : némès rayé à bandeau d'or, armure dorée, cape, épée et bouclier
- `heroes/GAUL.png` — héros de Gaule en pied : casque à cornes et cheveux longs, armure dorée, cape, épée et bouclier
- `heroes/GREEK.png` — héros de Grèce en pied : casque corinthien doré à crête bleue, armure dorée, cape, épée et bouclier
- `heroes/HUN.png` — héros des Huns en pied : bonnet de feutre pointu bordé de fourrure, armure dorée, cape, épée et bouclier
- `heroes/ROME.png` — héros de Rome en pied : casque de légionnaire à crête rouge, armure dorée, cape, épée et bouclier
- `heroes/SULTAN.png` — héros du Sultanat en pied : turban blanc orné d'une gemme, armure dorée, cape, épée et bouclier
- `heroes/EGYPT_bust.png` — buste du héros d'Égypte : némès rayé à bandeau d'or
- `heroes/GAUL_bust.png` — buste du héros de Gaule : casque à cornes et cheveux longs
- `heroes/GREEK_bust.png` — buste du héros de Grèce : casque corinthien doré à crête bleue
- `heroes/HUN_bust.png` — buste du héros des Huns : bonnet de feutre pointu bordé de fourrure
- `heroes/ROME_bust.png` — buste du héros de Rome : casque de légionnaire à crête rouge
- `heroes/SULTAN_bust.png` — buste du héros du Sultanat : turban blanc orné d'une gemme

### 35. Héros par palier de niveau — 24 images

- **Où ça se voit** : Le héros change d'allure au niveau 10 (palier 2 : garnitures de bronze et d'argent, cape plus longue) et au niveau 20 (palier 3 : armure dorée gravée, cape brodée, couronne de laurier) : en pied et buste.
- **Taille et format** : En pied 1024×1536 (cadre « stage »), buste 1024×1024 (cadre « bust »), PNG transparent.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, même visage que le héros du palier 1.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Héros par palier de niveau (estrade et jeton) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S19.
- **Dans le jeu** : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** :

- `heroes/ROME_t2.png` — héros de Rome en pied, palier 2 (niveaux 10-19, cape plus longue)
- `heroes/ROME_bust_t2.png` — buste du héros de Rome, palier 2 (niveaux 10-19, garnitures de bronze et d'argent)
- `heroes/ROME_t3.png` — héros de Rome en pied, palier 3 (niveau 20 et plus, cape brodée)
- `heroes/ROME_bust_t3.png` — buste du héros de Rome, palier 3 (niveau 20 et plus, armure dorée gravée, laurier)
- `heroes/GAUL_t2.png` — héros de Gaule en pied, palier 2 (niveaux 10-19, cape plus longue)
- `heroes/GAUL_bust_t2.png` — buste du héros de Gaule, palier 2 (niveaux 10-19, garnitures de bronze et d'argent)
- `heroes/GAUL_t3.png` — héros de Gaule en pied, palier 3 (niveau 20 et plus, cape brodée)
- `heroes/GAUL_bust_t3.png` — buste du héros de Gaule, palier 3 (niveau 20 et plus, armure dorée gravée, laurier)
- `heroes/GREEK_t2.png` — héros de Grèce en pied, palier 2 (niveaux 10-19, cape plus longue)
- `heroes/GREEK_bust_t2.png` — buste du héros de Grèce, palier 2 (niveaux 10-19, garnitures de bronze et d'argent)
- `heroes/GREEK_t3.png` — héros de Grèce en pied, palier 3 (niveau 20 et plus, cape brodée)
- `heroes/GREEK_bust_t3.png` — buste du héros de Grèce, palier 3 (niveau 20 et plus, armure dorée gravée, laurier)
- `heroes/EGYPT_t2.png` — héros d'Égypte en pied, palier 2 (niveaux 10-19, cape plus longue)
- `heroes/EGYPT_bust_t2.png` — buste du héros d'Égypte, palier 2 (niveaux 10-19, garnitures de bronze et d'argent)
- `heroes/EGYPT_t3.png` — héros d'Égypte en pied, palier 3 (niveau 20 et plus, cape brodée)
- `heroes/EGYPT_bust_t3.png` — buste du héros d'Égypte, palier 3 (niveau 20 et plus, armure dorée gravée, laurier)
- `heroes/HUN_t2.png` — héros des Huns en pied, palier 2 (niveaux 10-19, cape plus longue)
- `heroes/HUN_bust_t2.png` — buste du héros des Huns, palier 2 (niveaux 10-19, garnitures de bronze et d'argent)
- `heroes/HUN_t3.png` — héros des Huns en pied, palier 3 (niveau 20 et plus, cape brodée)
- `heroes/HUN_bust_t3.png` — buste du héros des Huns, palier 3 (niveau 20 et plus, armure dorée gravée, laurier)
- `heroes/SULTAN_t2.png` — héros du Sultanat en pied, palier 2 (niveaux 10-19, cape plus longue)
- `heroes/SULTAN_bust_t2.png` — buste du héros du Sultanat, palier 2 (niveaux 10-19, garnitures de bronze et d'argent)
- `heroes/SULTAN_t3.png` — héros du Sultanat en pied, palier 3 (niveau 20 et plus, cape brodée)
- `heroes/SULTAN_bust_t3.png` — buste du héros du Sultanat, palier 3 (niveau 20 et plus, armure dorée gravée, laurier)

### 36. Héros en pose d'attente — 6 bandes (18 cases)

- **Où ça se voit** : Sur l'écran du héros : respiration et cape qui bouge, 3 phases en boucle, le héros seul sans l'estrade.
- **Taille et format** : Bande horizontale de 3 cases de 512×768 dans une seule image, PNG transparent, même cadrage que le héros en pied.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Héros en pose d'attente (3 phases) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A10.
- **Dans le jeu** : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** :

- `heroes/ROME_idle.png` — bande de 3 cases de 512×768 — héros de Rome au repos, respiration et cape (sans l'estrade)
- `heroes/GAUL_idle.png` — bande de 3 cases de 512×768 — héros de Gaule au repos, respiration et cape (sans l'estrade)
- `heroes/GREEK_idle.png` — bande de 3 cases de 512×768 — héros de Grèce au repos, respiration et cape (sans l'estrade)
- `heroes/EGYPT_idle.png` — bande de 3 cases de 512×768 — héros d'Égypte au repos, respiration et cape (sans l'estrade)
- `heroes/HUN_idle.png` — bande de 3 cases de 512×768 — héros des Huns au repos, respiration et cape (sans l'estrade)
- `heroes/SULTAN_idle.png` — bande de 3 cases de 512×768 — héros du Sultanat au repos, respiration et cape (sans l'estrade)

### 37. Chefs de tribu et colons (jetons) — 12 images

- **Où ça se voit** : Le portrait du colon (onglet Colons de la Résidence, modale de fondation, carte d'armée) et le chef de la tribu locale (rapports de combat contre une tribu, bulle du point), par civilisation.
- **Taille et format** : 1024×1024, PNG transparent, cadre « bust ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Chefs de tribu et colons (jetons) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S12 et S14.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `busts/SETTLER_ROME.png` — colon de Rome (cheveux courts et tunique)
- `busts/SETTLER_GAUL.png` — colon de Gaule (tresses et manteau à carreaux)
- `busts/SETTLER_GREEK.png` — colon de Grèce (bandeau et chiton)
- `busts/SETTLER_EGYPT.png` — colon d'Égypte (perruque noire et col de lin)
- `busts/SETTLER_HUN.png` — colon des Huns (bonnet de fourrure et caftan)
- `busts/SETTLER_SULTAN.png` — colon du Sultanat (turban et robe rayée)
- `busts/TRIBE_ROME.png` — chef de tribu locale, coiffe de Rome, visage peint, fourrures
- `busts/TRIBE_GAUL.png` — chef de tribu locale, coiffe de Gaule, visage peint, fourrures
- `busts/TRIBE_GREEK.png` — chef de tribu locale, coiffe de Grèce, visage peint, fourrures
- `busts/TRIBE_EGYPT.png` — chef de tribu locale, coiffe d'Égypte, visage peint, fourrures
- `busts/TRIBE_HUN.png` — chef de tribu locale, coiffe des Huns, visage peint, fourrures
- `busts/TRIBE_SULTAN.png` — chef de tribu locale, coiffe du Sultanat, visage peint, fourrures

### 38. Scènes de connexion — 2 images

- **Où ça se voit** : L'écran de connexion et d'inscription, en portrait (téléphone) et en paysage (tablette, bureau).
- **Taille et format** : Portrait 1024×1536, paysage 1536×1024, PNG transparent au-dessus de l'île ; guides 3D fournis par le kit.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Scènes de connexion (portrait, paysage) ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `scenes/auth-landscape.png` — île flottante avec quinze bâtiments des six civilisations, format paysage
- `scenes/auth-portrait.png` — la même île flottante, format portrait (téléphone)

### 39. Paysages des cartes de civilisation — 6 images

- **Où ça se voit** : Le fond (assombri) de chaque carte de choix de civilisation à l'inscription.
- **Taille et format** : 1536×1024, PNG, cadre « header » : scène centrée, sol à 70 % de la hauteur, rien de coupé aux bords.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, architecture de la civilisation, sans personnage au premier plan.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Paysages des cartes de civilisation » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S20.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `scenes/faction-ROME.png` — paysage de Rome vu de loin, sans personnage
- `scenes/faction-GAUL.png` — paysage de Gaule vu de loin, sans personnage
- `scenes/faction-GREEK.png` — paysage de Grèce vu de loin, sans personnage
- `scenes/faction-EGYPT.png` — paysage d'Égypte vu de loin, sans personnage
- `scenes/faction-HUN.png` — paysage des Huns vu de loin, sans personnage
- `scenes/faction-SULTAN.png` — paysage du Sultanat vu de loin, sans personnage

### 40. Estrades du héros — 6 images

- **Où ça se voit** : Le décor de l'écran du héros : le héros sur une estrade ronde de pierre, torches et bannières de la civilisation derrière.
- **Taille et format** : 1024×1536, PNG transparent, cadre « stage » ; guide 3D (kit).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Estrades du héros par civilisation ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `scenes/hero-EGYPT.png` — héros d'Égypte sur une estrade ronde, torches et bannières derrière
- `scenes/hero-GAUL.png` — héros de Gaule sur une estrade ronde, torches et bannières derrière
- `scenes/hero-GREEK.png` — héros de Grèce sur une estrade ronde, torches et bannières derrière
- `scenes/hero-HUN.png` — héros des Huns sur une estrade ronde, torches et bannières derrière
- `scenes/hero-ROME.png` — héros de Rome sur une estrade ronde, torches et bannières derrière
- `scenes/hero-SULTAN.png` — héros du Sultanat sur une estrade ronde, torches et bannières derrière

### 41. Champ de bataille — 1 image

- **Où ça se voit** : Le fond du replay de bataille.
- **Taille et format** : 1536×1024, PNG, panorama isométrique, ciel transparent ; guide 3D (kit).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Scène du champ de bataille ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `scenes/battlefield.png` — champ de bataille vu en isométrique (fond du replay)

### 42. Bandeaux en tête des écrans — 7 images

- **Où ça se voit** : Le bandeau en haut des écrans Marché, Alliance, Classement, Sac, Rapports (guides 3D), Armée et Recherche (nouveaux).
- **Taille et format** : 1536×1024, PNG, cadre « header ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Bandeaux en tête des écrans » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S20.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `scenes/header-alliance.png` — mur de grès, trois bannières, boucliers, torches (écran Alliance)
- `scenes/header-inventory.png` — coffre ouvert plein d'or, amphore, lance, bouclier (écran Sac)
- `scenes/header-market.png` — étal de marché à auvent rouge, caisses, tonneaux (écran Marché)
- `scenes/header-ranking.png` — podium de pierre à trois marches, trophée d'or (écran Classement)
- `scenes/header-reports.png` — parchemin déroulé, plume, encrier, torche (écran Rapports)
- `scenes/header-army.png` — armée à la parade : boucliers, lances, étendards, un cheval (écran Armée)
- `scenes/header-research.png` — bibliothèque et atelier : rouleaux, astrolabe, maquette de grue, lampes (écran Recherche)

### 43. Vignettes : fondation, tribus, expéditions — 8 images

- **Où ça se voit** : En tête des rapports de tribu (déjà branché), de l'onglet Colons et de la modale de fondation, et pour les quatre destinations d'expédition du héros.
- **Taille et format** : 1536×1024, PNG, cadre « header ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Vignettes : tribus, fondation, expéditions » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S4, S12 et S14.
- **Dans le jeu** : tribus et expéditions déjà branchées ; la vignette de fondation : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** :

- `scenes/vignette-founding.png` — fondation d'une ville : chariot déchargé, piquet à fanion, tentes, prêtre, collines à l'aube
- `scenes/vignette-tribe-forest.png` — camp de tribu en forêt : huttes rondes au toit de chaume, palissade, totem, guerriers au feu
- `scenes/vignette-tribe-desert.png` — camp de tribu du désert : tentes de peaux, palmier, chameaux, rochers rouges
- `scenes/vignette-tribe-snow.png` — camp de tribu des neiges : huttes couvertes de fourrures dans une pinède enneigée
- `scenes/expedition-forest.png` — destination d'expédition : forêt profonde, rochers moussus, ruisseau
- `scenes/expedition-desert.png` — destination d'expédition : dunes dorées, oasis, pylône en ruine
- `scenes/expedition-mountain.png` — destination d'expédition : col rocheux, sommets enneigés, entrée de grotte
- `scenes/expedition-ruins.png` — destination d'expédition : temple antique envahi par la végétation, coffre

### 44. Habillage : plaque parchemin et boutons ronds — 3 images

- **Où ça se voit** : La plaque de parchemin est la **dernière pièce** de l'habillage peint (boutons, cadres, plaques, barre) : tant qu'elle manque, tout l'habillage peint reste désactivé dans le jeu. Les boutons ronds servent aux bulles d'action sur la ville (aujourd'hui un dégradé CSS).
- **Taille et format** : 1024×1024, PNG, l'élément remplit toute l'image bord à bord, vue de face, sans perspective ; guide 3D pour la plaque.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, aucun texte ni symbole.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Habillage : boutons, cadres, plaques, barres » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S5.
- **Dans le jeu** : la plaque : déjà prévu dans le jeu : l'image s'affiche dès l'import. Les boutons ronds : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** :

- `ui/plate-parchment.png` — plaque de parchemin vieilli, bord brun usé, sans décor (dernière pièce de l'habillage)
- `ui/btn-round.png` — bouton rond de bois sombre, filet d'or, vide au centre
- `ui/btn-round-pressed.png` — le même bouton enfoncé : plus sombre, plat

### 45. Icônes d'interface restantes (colon, tribu, siège) — 3 images

- **Où ça se voit** : Le colon (onglet Colons, carte d'armée, bouton « Fonder une ville »), la tribu locale (bulle du point, rapports) et le siège (alerte de siège, carte d'armée en siège, bouton « Briser le siège »). Les 61 autres icônes sont peintes.
- **Taille et format** : 1024×1024, PNG transparent, cadre « icon » : un seul objet centré sur 70 % du cadre, trois quarts, lisible en petit.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, même famille que les icônes existantes (`ui/wood`, `ui/attack`…).
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Icônes d'interface (ressources, onglets, actions, colon, tribu) » pour le colon et la tribu ; l'icône de siège n'y a pas de prompt : prompt ci-dessous.
- **Dans le jeu** : colon et tribu déjà branchés ; l'icône de siège : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.
- **Note** : Le nom `ui/icons/siege.png` (avec le sous-dossier `icons/`) est celui que l'outil d'import attend aujourd'hui ; je le normaliserai en `ui/siege` au branchement, les deux seront acceptés.

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Composition: square image, a single object centered filling about 70% of the frame, three-quarter view from slightly above.
```

Puis, pour chaque fichier :

- `ui/icons/siege.png` — `Subject: a game interface icon: a wooden battering ram under a hide-covered shelter on four wheels (siege), a single object centered, three-quarter view, bold and readable at small size.`

**Fichiers** :

- `ui/settler.png` — colon : villageois en marche, baluchon sur l'épaule, piquet à fanion
- `ui/tribe.png` — tribu locale : totem de bois à crâne et deux massues croisées
- `ui/icons/siege.png` — siège : bélier sous abri de peaux, sur roues

### 46. Blasons des civilisations — 6 images

- **Où ça se voit** : Inscription (cartes de civilisation), alliance, étiquettes de la carte ; aujourd'hui on réutilise le buste du héros.
- **Taille et format** : 1024×1024, PNG transparent, cadre « icon », vue de face : blason sur un bouclier rond à fin liseré d'or.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Blasons des civilisations » ; sujets précis : `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S3.
- **Dans le jeu** : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** :

- `ui/crest_ROME.png` — blason de Rome : aigle d'or aux ailes déployées sur fond rouge profond
- `ui/crest_GAUL.png` — blason de Gaule : sanglier blanc sur fond vert, bord de bois sculpté
- `ui/crest_GREEK.png` — blason de Grèce : chouette d'or sur fond bleu, couronne de laurier
- `ui/crest_EGYPT.png` — blason d'Égypte : scarabée d'or sur fond turquoise, bord ocre
- `ui/crest_HUN.png` — blason des Huns : tête de cheval noire sur fond rouge, bord de fourrure
- `ui/crest_SULTAN.png` — blason du Sultanat : croissant et étoile d'or sur mosaïque turquoise

### 47. Icônes des technologies et des branches — 12 images

- **Où ça se voit** : L'onglet Recherche de l'Académie : une icône sur la carte de chaque technologie et en tête de sa fiche, une par branche.
- **Taille et format** : 1024×1024, PNG transparent, cadre « icon ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Icônes des technologies et des branches » ; sujets en français : `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S8.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** :

- `ui/tech_AGRONOMY.png` — Agronomie : gerbe de blé doré croisée d'une charrue de bois
- `ui/tech_ENGINEERING.png` — Ingénierie : grue de bois levant un bloc de pierre, équerre
- `ui/tech_TRAINING.png` — Entraînement : deux épées de bois croisées sur un bouclier rond
- `ui/tech_TACTICS.png` — Tactique : parchemin déroulé avec un plan de bataille, marqueur de bronze
- `ui/tech_DISCIPLINE.png` — Discipline : trois boucliers ronds qui se chevauchent en mur
- `ui/tech_MEDICINE.png` — Médecine : bol d'argile d'herbes vertes, bande de lin roulée
- `ui/tech_CARTOGRAPHY.png` — Cartographie : carte roulée, rose des vents, petite figurine de cheval
- `ui/tech_SUPPLY.png` — Intendance : sacs de grain empilés et tonneau de bois
- `ui/branch_ECONOMY.png` — branche Économie : gerbe de blé et pile de pièces
- `ui/branch_MILITARY.png` — branche Militaire : épée de bronze et lance croisées
- `ui/branch_DEFENSE.png` — branche Défense : grand bouclier devant un mur crénelé
- `ui/branch_LOGISTICS.png` — branche Logistique : roue de charrette chargée et poteau indicateur

### 48. Objets du héros : les 23 nouvelles icônes — 23 images

- **Où ça se voit** : Le nouveau système d'objets du héros (décisions du 1er novembre 2026, en cours dans la branche `jeu-items`) : inventaire, équipement, butin, boutique d'alliance. Les 8 objets gardés ont déjà leur icône ; les 6 objets retirés (boucliers, jambières, anneau, amulette) ne sont pas à refaire. En attendant l'icône, le jeu montre celle de l'emplacement en gris.
- **Taille et format** : 1024×1024, PNG transparent, cadre « icon » : l'objet seul, centré, trois quarts. **Ne pas dessiner de cadre coloré** : le jeu met lui-même le cadre de couleur de la rareté.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, même style que les icônes d'objets déjà faites (`ui/item_iron_sword`, `ui/item_chain_mail`…).
- **Prompt** : aucun prompt dans `docs/GENERATION-COMPLETE.md` (liste et sujets en français dans `docs/A-GENERER.md` § 9 bis de la branche objets) ; prompts ci-dessous = préfixe peint + composition « icon » + sujet.
- **Dans le jeu** : déjà prévu dans la branche objets : un fichier déposé sous ce nom s'affiche sans toucher au code ; l'outil d'import connaît ces noms dès la fusion de la branche (en cours).

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Composition: square image, a single object centered filling about 70% of the frame, three-quarter view from slightly above.
```

Puis, pour chaque fichier :

- `ui/item_hunting_spear.png` — `Subject: a game inventory icon of a hunting spear: wooden shaft, simple iron point, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_centurion_gladius.png` — `Subject: a game inventory icon of a centurion's gladius: Roman short sword, bone grip, ornate scabbard, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_mars_blade.png` — `Subject: a game inventory icon of the Blade of Mars: legendary sword, pale blade, golden guard, faint red glow, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_linothorax.png` — `Subject: a game inventory icon of a Greek linothorax: white linen cuirass with pteruges strips, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_lorica_segmentata.png` — `Subject: a game inventory icon of a Roman lorica segmentata: armour of overlapping iron bands, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_achilles_cuirass.png` — `Subject: a game inventory icon of the cuirass of Achilles: muscled bronze cuirass with gold trims, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_leather_cap.png` — `Subject: a game inventory icon of a soft leather cap, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_crested_helm.png` — `Subject: a game inventory icon of a helmet with a red horsehair crest, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_conqueror_helm.png` — `Subject: a game inventory icon of a conqueror's helmet: golden helmet with a tall plume and laurel leaves, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_marching_sandals.png` — `Subject: a game inventory icon of marching sandals: laced leather caligae, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_messenger_boots.png` — `Subject: a game inventory icon of messenger's boots: soft boots with turned-down tops, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_winged_sandals.png` — `Subject: a game inventory icon of winged sandals with small golden wings, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_pack_mule.png` — `Subject: a game inventory icon of a pack mule loaded with saddlebags, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_steppe_horse.png` — `Subject: a game inventory icon of a steppe horse: small stocky horse with a plain saddle, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_war_horse.png` — `Subject: a game inventory icon of a war horse: caparisoned destrier, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_bucephalus.png` — `Subject: a game inventory icon of Bucephalus: tall black horse with a white star on the forehead, golden harness, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_owl_charm.png` — `Subject: a game inventory icon of an owl charm: silver medallion with an owl, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_healer_salve.png` — `Subject: a game inventory icon of a healer's salve: small clay pot of ointment with herbs, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_strategist_scroll.png` — `Subject: a game inventory icon of a strategist's scroll: sealed papyrus scroll, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_surgeon_kit.png` — `Subject: a game inventory icon of a surgeon's kit: leather roll with bronze instruments, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_legion_eagle.png` — `Subject: a game inventory icon of a legion eagle: golden eagle on a standard pole, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_golden_fleece.png` — `Subject: a game inventory icon of the Golden Fleece: a golden ram's fleece hanging from a branch, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_capital_move.png` — `Subject: a game inventory icon of a loaded covered wagon with a small flag (moving the capital), a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`

**Fichiers** :

- `ui/item_hunting_spear.png` — Lance de chasse : hampe de bois, pointe de fer simple
- `ui/item_centurion_gladius.png` — Glaive du centurion : glaive romain, poignée d'os, fourreau orné
- `ui/item_mars_blade.png` — Lame de Mars : épée de légende, lame claire, garde dorée, lueur rouge
- `ui/item_linothorax.png` — Linothorax : cuirasse grecque de lin blanc à lambrequins
- `ui/item_lorica_segmentata.png` — Lorica segmentata : armure romaine à bandes de fer
- `ui/item_achilles_cuirass.png` — Cuirasse d'Achille : cuirasse de bronze musclée, dorures
- `ui/item_leather_cap.png` — Bonnet de cuir : coiffe de cuir souple
- `ui/item_crested_helm.png` — Casque à crête : casque à crin rouge
- `ui/item_conqueror_helm.png` — Casque du conquérant : casque doré à grand panache, lauriers
- `ui/item_marching_sandals.png` — Sandales de marche : caligae de cuir lacées
- `ui/item_messenger_boots.png` — Bottes du messager : bottes souples à revers
- `ui/item_winged_sandals.png` — Sandales ailées : sandales à petites ailes dorées
- `ui/item_pack_mule.png` — Mule de bât : mule chargée de sacoches
- `ui/item_steppe_horse.png` — Cheval des steppes : petit cheval trapu, selle simple
- `ui/item_war_horse.png` — Cheval de guerre : destrier caparaçonné
- `ui/item_bucephalus.png` — Bucéphale : grand cheval noir à étoile blanche, harnais doré
- `ui/item_owl_charm.png` — Talisman de la chouette : médaillon d'argent à la chouette
- `ui/item_healer_salve.png` — Baume du guérisseur : petit pot d'onguent et herbes
- `ui/item_strategist_scroll.png` — Rouleau du stratège : rouleau de papyrus scellé
- `ui/item_surgeon_kit.png` — Trousse du chirurgien : trousse de cuir, instruments de bronze
- `ui/item_legion_eagle.png` — Aigle de légion : aigle doré sur hampe
- `ui/item_golden_fleece.png` — Toison d'or : toison dorée suspendue
- `ui/item_capital_move.png` — Déplacement de capitale : chariot couvert chargé, petit drapeau

### 49. Effets d'interface — 3 bandes (16 cases)

- **Où ça se voit** : Joués une fois au-dessus d'un bâtiment terminé, d'un badge de niveau qui monte, d'un butin reçu.
- **Taille et format** : Bande horizontale de N cases de 512×512 dans une seule image, PNG transparent.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint, rien d'autre que l'effet.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Effets d'interface (construction finie, niveau, butin) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A8.
- **Dans le jeu** : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** :

- `ui/fx_sparkle.png` — bande de 6 cases de 512×512 — gerbe d'étincelles dorées (construction terminée)
- `ui/fx_levelup.png` — bande de 6 cases de 512×512 — flèche dorée montante avec anneau de lumière (niveau supérieur)
- `ui/fx_coins.png` — bande de 4 cases de 512×512 — trois pièces d'or qui rebondissent (butin reçu)

### 50. Nouveautés des décisions G et H : Gloire, triomphe, échange — 6 images

- **Où ça se voit** : Décision H7 (2 novembre 2026) : la Gloire donne des décors de ville cosmétiques à 50 000, 150 000 et 300 000 Gloire, posés autour du Bâtiment principal comme les ornements de plaza, et un bouton « Triomphe » dans le Bâtiment principal. Décision G9 : écran « Échanger ». Les autres décisions G et H ne demandent aucune image (la durabilité du mur du Bastion s'affiche en chiffres ; le verrou de la réserve utilise `ui/lock` qui existe). **Noms proposés par moi, le système n'est pas encore codé (lot 1) : à confirmer.**
- **Taille et format** : Décors : 512×768 (portrait 2:3), PNG transparent, cadre « prop » comme les ornements de plaza (l'arc est haut et étroit ; s'il doit enjamber l'avenue on passera en 1024×1024 cadre « building », à décider). Icônes : 1024×1024, cadre « icon ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, style antique neutre valable pour toutes les civilisations, or et marbre blanc.
- **Prompt** : aucun prompt dans les sources ; prompts ci-dessous = préfixe peint + composition « prop » (décors) ou « icon » (icônes) + sujet.
- **Dans le jeu** : à brancher avec le lot 1 (H7) : placement des décors, bouton Triomphe, registre d'import.

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Décors : Composition: 2:3 portrait image, the prop centered horizontally, its base at 89% of the image height, about 60% of the width.

Icônes : Composition: square image, a single object centered filling about 70% of the frame, three-quarter view from slightly above.
```

Puis, pour chaque fichier :

- `props/glory_statue.png` — `Subject: a gilded equestrian statue of a victorious general on a white marble pedestal with laurel garlands, neutral ancient style that suits every civilisation.`
- `props/glory_arch.png` — `Subject: a triumphal arch of pale stone with carved reliefs and a golden quadriga on top, small banners, neutral ancient style that suits every civilisation.`
- `props/glory_column.png` — `Subject: a tall triumphal column with a spiral carved frieze and a gilded statue on top, on a stepped base, neutral ancient style that suits every civilisation.`
- `ui/triumph.png` — `Subject: a game interface icon: a golden laurel wreath around two crossed Roman trumpets (tubae) with a small red ribbon (triumph), a single object centered, bold and readable at small size.`
- `ui/glory.png` — `Subject: a game interface icon: a golden laurel wreath with a small gold star in its middle (glory), a single object centered, bold and readable at small size.`
- `ui/exchange.png` — `Subject: a game interface icon: two curved golden arrows forming a circle around two small crossed swords (exchange of soldiers between armies), a single object centered, bold and readable at small size.`

**Fichiers** :

- `props/glory_statue.png` — 50 000 Gloire : statue équestre dorée sur socle de marbre, guirlandes de laurier
- `props/glory_arch.png` — 150 000 Gloire : arc de triomphe de pierre claire, reliefs sculptés, quadrige doré au sommet
- `props/glory_column.png` — 300 000 Gloire : colonne triomphale à frise en spirale, statue dorée au sommet
- `ui/triumph.png` — bouton « Triomphe » du Bâtiment principal : couronne de laurier d'or et deux trompettes romaines croisées
- `ui/glory.png` — (facultatif) compteur et classement de Gloire : couronne de laurier d'or autour d'une petite étoile ; sinon le jeu réutilise `ui/medal`
- `ui/exchange.png` — (facultatif, décision G9) écran « Échanger » des soldats entre deux armées : deux flèches dorées en cercle ; sinon le jeu réutilise `ui/send`

### 51. Villageois de chaque civilisation — 12 bandes (72 cases)

- **Où ça se voit** : Les petites silhouettes qui circulent sur les avenues et la plaza (l'animation qui donne le plus de vie à la ville) : un homme et une femme par civilisation, cycle de marche de 6 phases vers la droite (le jeu les retourne pour l'autre sens).
- **Taille et format** : Bande horizontale de N cases égales de 512×768 dans une seule image, PNG transparent ; même personnage, même taille, même position dans chaque case, seule la pose change. Je découpe.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Villageois de chaque civilisation (homme, femme), marche 6 phases » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A1.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `props/villager_ROME_a.png` — bande de 6 cases de 512×768 — villageois de Rome, homme (amphore sur l'épaule), marche vers la droite
- `props/villager_ROME_b.png` — bande de 6 cases de 512×768 — villageois de Rome, femme (panier de pain), marche vers la droite
- `props/villager_GAUL_a.png` — bande de 6 cases de 512×768 — villageois de Gaule, homme (amphore sur l'épaule), marche vers la droite
- `props/villager_GAUL_b.png` — bande de 6 cases de 512×768 — villageois de Gaule, femme (panier de pain), marche vers la droite
- `props/villager_GREEK_a.png` — bande de 6 cases de 512×768 — villageois de Grèce, homme (amphore sur l'épaule), marche vers la droite
- `props/villager_GREEK_b.png` — bande de 6 cases de 512×768 — villageois de Grèce, femme (panier de pain), marche vers la droite
- `props/villager_EGYPT_a.png` — bande de 6 cases de 512×768 — villageois d'Égypte, homme (amphore sur l'épaule), marche vers la droite
- `props/villager_EGYPT_b.png` — bande de 6 cases de 512×768 — villageois d'Égypte, femme (panier de pain), marche vers la droite
- `props/villager_HUN_a.png` — bande de 6 cases de 512×768 — villageois des Huns, homme (amphore sur l'épaule), marche vers la droite
- `props/villager_HUN_b.png` — bande de 6 cases de 512×768 — villageois des Huns, femme (panier de pain), marche vers la droite
- `props/villager_SULTAN_a.png` — bande de 6 cases de 512×768 — villageois du Sultanat, homme (amphore sur l'épaule), marche vers la droite
- `props/villager_SULTAN_b.png` — bande de 6 cases de 512×768 — villageois du Sultanat, femme (panier de pain), marche vers la droite

### 52. Ouvriers de chantier — 6 bandes (24 cases)

- **Où ça se voit** : Devant chaque bâtiment en travaux, à côté de l'échafaudage : un ouvrier au maillet habillé comme sa civilisation, 4 phases.
- **Taille et format** : Bande horizontale de N cases égales de 512×768 dans une seule image, PNG transparent ; même personnage, même taille, même position dans chaque case, seule la pose change. Je découpe.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Ouvriers par civilisation (animation A3) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A3.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `props/worker_ROME.png` — bande de 4 cases de 512×768 — ouvrier de Rome au maillet : lever, sommet, frappe, rebond
- `props/worker_GAUL.png` — bande de 4 cases de 512×768 — ouvrier de Gaule au maillet : lever, sommet, frappe, rebond
- `props/worker_GREEK.png` — bande de 4 cases de 512×768 — ouvrier de Grèce au maillet : lever, sommet, frappe, rebond
- `props/worker_EGYPT.png` — bande de 4 cases de 512×768 — ouvrier d'Égypte au maillet : lever, sommet, frappe, rebond
- `props/worker_HUN.png` — bande de 4 cases de 512×768 — ouvrier des Huns au maillet : lever, sommet, frappe, rebond
- `props/worker_SULTAN.png` — bande de 4 cases de 512×768 — ouvrier du Sultanat au maillet : lever, sommet, frappe, rebond

### 53. Flammes des torches et braseros — 2 bandes (8 cases)

- **Où ça se voit** : Les torches des tours, de la porte et des remparts, les braseros de la plaza la nuit, 4 phases en boucle.
- **Taille et format** : Bande horizontale de N cases égales de 512×768 dans une seule image, PNG transparent ; même personnage, même taille, même position dans chaque case, seule la pose change. Je découpe.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Flammes des torches et braseros » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A2.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `props/flame.png` — bande de 4 cases de 512×768 — flamme de torche : penchée à gauche, droite, penchée à droite, haute
- `props/brazier.png` — bande de 4 cases de 512×768 — brasero de bronze sur trois pieds, seules les flammes changent

### 54. Bâtiments vivants : moulin, forge, fonderie — 3 bandes (14 cases)

- **Où ça se voit** : Superpositions posées sur le bâtiment : ailes du moulin qui tournent, étincelles de la forge, feu de la fonderie.
- **Taille et format** : Bande horizontale de N cases de 512×512 dans une seule image, PNG transparent.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Bâtiments vivants (moulin, forge, fonderie) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A4.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `anim/mill_sails.png` — bande de 6 cases de 512×512 — ailes du moulin seules (sans la tour), tournant de 15° à chaque case
- `anim/sparks.png` — bande de 4 cases de 512×512 — gerbe d'étincelles orange au-dessus d'une enclume
- `anim/furnace.png` — bande de 4 cases de 512×512 — bouche de four en pierre, feu qui vacille

### 55. Bâtiments vivants, suite — 6 bandes (24 cases)

- **Où ça se voit** : Soldats à l'exercice devant la Caserne, badauds au Marché, cheval à l'Écurie, marteau à l'Atelier, four de la Boulangerie, feu de la Tour de guet.
- **Taille et format** : Bande horizontale de 4 cases de 512×512 dans une seule image, PNG transparent.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Bâtiments vivants, suite (caserne, marché, écurie, atelier, boulangerie, tour de guet) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A14.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `anim/barracks_drill.png` — bande de 4 cases de 512×512 — soldats à l'exercice devant la Caserne
- `anim/market_crowd.png` — bande de 4 cases de 512×512 — badauds et marchands au Marché
- `anim/stable_horse.png` — bande de 4 cases de 512×512 — cheval qui piaffe à l'Écurie
- `anim/workshop_hammer.png` — bande de 4 cases de 512×512 — marteau et copeaux à l'Atelier
- `anim/bakery_smoke.png` — bande de 4 cases de 512×512 — fumée et lueur du four de la Boulangerie
- `anim/watchtower_beacon.png` — bande de 4 cases de 512×512 — feu de veille au sommet de la Tour de guet

### 56. Gens des champs au travail — 4 bandes (16 cases)

- **Où ça se voit** : Dans l'anneau des champs : faucheur, bûcheron, carrier, mineur, 4 phases chacun (communs à toutes les civilisations).
- **Taille et format** : Bande horizontale de N cases égales de 512×768 dans une seule image, PNG transparent ; même personnage, même taille, même position dans chaque case, seule la pose change. Je découpe.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Gens des champs au travail » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A12.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `props/farmer.png` — bande de 4 cases de 512×768 — paysan qui fauche
- `props/lumberjack.png` — bande de 4 cases de 512×768 — bûcheron qui abat un arbre
- `props/quarryman.png` — bande de 4 cases de 512×768 — carrier qui taille un bloc
- `props/miner.png` — bande de 4 cases de 512×768 — mineur à la pioche

### 57. Animaux dans la ville — 4 bandes (16 cases)

- **Où ça se voit** : Poule, chien, chèvre, chat qui se promènent sur les avenues et la plaza.
- **Taille et format** : Bande horizontale de N cases égales de 512×768 dans une seule image, PNG transparent ; même personnage, même taille, même position dans chaque case, seule la pose change. Je découpe.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Animaux dans la ville » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A13.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `props/animal_chicken.png` — bande de 4 cases de 512×768 — poule qui se promène dans la ville
- `props/animal_dog.png` — bande de 4 cases de 512×768 — chien qui se promène dans la ville
- `props/animal_goat.png` — bande de 4 cases de 512×768 — chèvre qui se promène dans la ville
- `props/animal_cat.png` — bande de 4 cases de 512×768 — chat qui se promène dans la ville

### 58. Fumées peintes — 2 bandes (8 cases)

- **Où ça se voit** : Fumée des cheminées et des feux de camp, à la place des bouffées 3D actuelles (facultatif : le 3D reste sinon).
- **Taille et format** : Bande horizontale de N cases égales de 512×768 dans une seule image, PNG transparent ; même personnage, même taille, même position dans chaque case, seule la pose change. Je découpe.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Fumées peintes (cheminées, feux de camp) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A15.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `props/smoke_chimney.png` — bande de 4 cases de 512×768 — fumée de cheminée (remplace les bouffées 3D)
- `props/smoke_campfire.png` — bande de 4 cases de 512×768 — fumée de feu de camp

### 59. Drapeaux peints par civilisation — 6 bandes (48 cases)

- **Où ça se voit** : Les drapeaux sur les tours, les bâtiments et l'enceinte, 8 phases, à la place des drapeaux 3D (facultatif : le 3D reste sinon).
- **Taille et format** : Bande horizontale de N cases égales de 512×768 dans une seule image, PNG transparent ; même personnage, même taille, même position dans chaque case, seule la pose change. Je découpe.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Drapeaux peints par civilisation (8 phases) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A16.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `props/flagp_ROME.png` — bande de 8 cases de 512×768 — drapeau de Rome qui ondule, 8 phases
- `props/flagp_GAUL.png` — bande de 8 cases de 512×768 — drapeau de Gaule qui ondule, 8 phases
- `props/flagp_GREEK.png` — bande de 8 cases de 512×768 — drapeau de Grèce qui ondule, 8 phases
- `props/flagp_EGYPT.png` — bande de 8 cases de 512×768 — drapeau d'Égypte qui ondule, 8 phases
- `props/flagp_HUN.png` — bande de 8 cases de 512×768 — drapeau des Huns qui ondule, 8 phases
- `props/flagp_SULTAN.png` — bande de 8 cases de 512×768 — drapeau du Sultanat qui ondule, 8 phases

### 60. Charrette et chevaux — 2 bandes (8 cases)

- **Où ça se voit** : Une charrette qui entre et sort par la porte, des chevaux qui piaffent devant l'écurie.
- **Taille et format** : Bande horizontale de N cases égales de 512×768 dans une seule image, PNG transparent ; même personnage, même taille, même position dans chaque case, seule la pose change. Je découpe.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Charrette et chevaux » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A11.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `props/cart.png` — bande de 4 cases de 512×768 — charrette tirée par un cheval, 4 pas de marche
- `props/horse_idle.png` — bande de 4 cases de 512×768 — chevaux qui piaffent devant l'écurie

### 61. Ambiance : neige, feuilles, tourbillon, oiseaux — 4 bandes (13 cases)

- **Où ça se voit** : Particules selon le biome et l'heure : flocons (neige), feuilles (forêt), tourbillon de sable (désert), oiseaux.
- **Taille et format** : Bande horizontale de 3 ou 4 cases de 512×512 dans une seule image, PNG transparent.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Ambiance : neige, feuilles, tourbillon, oiseaux » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A9.
- **Dans le jeu** : le jeu ne sait pas encore jouer cette animation : petit travail de code de mon côté à la livraison (ancrages, cadence), compris dans l'intégration.

**Fichiers** :

- `props/snowflake.png` — bande de 3 cases de 512×512 — flocon de neige (biome neige)
- `props/leaf.png` — bande de 3 cases de 512×512 — feuille qui tombe (forêt, automne)
- `props/dust_devil.png` — bande de 4 cases de 512×512 — tourbillon de sable (désert)
- `props/bird.png` — bande de 3 cases de 512×512 — oiseau en vol vu de dessous, battement d'ailes

### 62. Visuels de boutique — 3 images

- **Où ça se voit** : Hors jeu : la fiche Google Play (bannière obligatoire), les notifications Android (sans l'icône, un carré blanc s'affiche) et l'icône des boutiques. **Les deux premières sont obligatoires pour publier.**
- **Taille et format** : Notification 96×96 PNG transparent, une seule couleur blanche, sans dégradé ni ombre (je décline 72, 48, 36, 24). Bannière 1024×500 PNG ou JPG **opaque**. Icône 1024×1024 opaque.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint pour la bannière et l'icône ; aucun texte (le titre est ajouté ensuite).
- **Prompt** : `docs/GENERATION-COMPLETE.md` § 3 « Boutique et application » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § N1, N2 et N3.
- **Dans le jeu** : copiés tels quels dans `store/` par l'import ; rien à brancher. L'emblème affiché dans le jeu (`logo/medallion`, écran de connexion et en-tête) est le même dessin en rendu 3D : je le remplace par l'icône peinte au branchement, pas d'image en plus à faire.

**Fichiers** :

- `store/ic_stat_notify.png` — icône de notification Android : silhouette du casque de l'emblème, **blanc uni sur transparent**, 96×96
- `store/feature-graphic.png` — bannière Google Play 1024×500, opaque : ville des six civilisations à l'heure dorée, héros romain à gauche, tiers droit calme pour le titre
- `store/icon-1024.png` — icône de l'application peinte 1024×1024, opaque : casque doré à crête rouge dans un médaillon de bronze et laurier sur fond rouge

## 3. Ce qui est volontairement exclu

| Ensemble | Images | Pourquoi |
|---|---|---|
| Bâtiments, palier courant (niveaux 7-13), 6 civilisations | 108 | demandé à part |
| Bâtiments, paliers 1 et 3 (niveaux 1-6 et 14-20) | 396 | demandé à part |
| Chantiers de bâtiments (`<CLÉ>_site`) | 168 | demandé à part |
| **Total bâtiments** | **672** | les versions neige des bâtiments et de l'enceinte ne sont pas demandées (le rendu 3D enneigé reste) |
| Villes de la carte : villages, villes (`_t2`), capitales, forteresse et ville par défaut | 20 | `map/cities/`, demandé à part |
| Colonies de la carte, normales et fortifiées | 12 | `map/cities/colony_*` |
| Villes et colonies assiégées (animations) | 30 bandes de 4 cases (120 images) | `map/cities/siege_*` |
| **Total villes de la carte** | **32 images + 30 bandes** | le Bastion, la Merveille et les sites des Immortels restent ici (famille 29, à confirmer) |

Avec ces exclusions, la liste complète du jeu ferait 1 658 fichiers à livrer.

## 4. Ordre conseillé (du plus visible au moins visible)

1. **Ce qui se voit à chaque connexion** : textures de sol de la ville et décalques (1-2), champs, parcelles et décors de prairie et de
   désert (3-5), enceinte et portes (7-8), la plaque parchemin qui active tout l'habillage peint (44), puis la carte :
   sol (variante 1 de chaque sol d'abord), forêts, rochers et montagnes, points de ressource, armées en marche (13, 14, 18, 22).
2. **Interface et personnages vus partout** : icônes restantes, technologies, blasons (45-47), les 23 icônes d'objets dès que la
   branche objets est fusionnée (48), héros en pied et bustes (34), figurines et jetons de classe (30-31),
   scènes de connexion et bandeaux (38, 42).
3. **Ce qui fait vivre la ville** : échafaudages et ouvriers, villageois, flammes, ornements de plaza, bâtiments vivants, panneau et
   parchemin (10, 11, 12, 51-55).
4. **Les systèmes récents** : camps des tribus et ruines, campement de fondation, colons, héros en tête d'armée, hordes des invasions,
   bannières d'alliance (19-20, 21, 23-24, 28), et, si tu les prends maintenant, le Bastion et la Merveille (29) ;
   la Gloire et le triomphe quand le lot 1 sera codé (50).
5. **Les fiches** : une figurine et un jeton par unité (32-33), héros par palier et pose d'attente, chefs de tribu et colons, estrades,
   champ de bataille, vignettes (35-37, 40-43), paysages des cartes de civilisation (39).
6. **Le reste** : cycles de marche, replay, effets de carte, nuages, ponts et décor de la carte (25-27, 17, 15-16), gens des champs, animaux,
   fumées, drapeaux, charrette, ambiance, effets d'interface, chantiers de champs et d'enceinte, boutons ronds (56-61, 49, 6, 9), puis les 20 images du biome neige.
7. **Avant de publier sur les boutiques** (à n'importe quel moment) : la bannière Google Play et l'icône de notification (62).

## 5. Pourquoi les totaux ne sont pas ceux des autres listes

- **`docs/A-GENERER.md` annonce 1 870 images.** Il compte les animations image par image (546) et non par bande ; son étape 9
  « Compléments fixes et visuels de boutique » affiche **29**, qui est un nombre de lignes et non d'images (ces lignes décrivent 283
  images, dont les 120 fiches d'unité déjà comptées à l'étape 14 et les 3 campements de fondation déjà comptés à l'étape 5) ; il ne compte
  ni les 6 villes au palier « Ville » (`_t2`), ni les 6 colonies fortifiées, ni les 30 bandes de villes assiégées, ni les 16 images du biome
  neige, ni les 23 icônes d'objets (elles sont dans la copie de la branche objets, total 1 893) ; il inclut les bâtiments et les villes
  de la carte exclus ici.
- **`docs/GENERATION-COMPLETE.md` annonce 1 461 images et 143 bandes.** C'est la base de ce document (mêmes familles, mêmes
  noms, mêmes prompts). On lui retire les 672 bâtiments et les 32 villes de la carte (+ 30 bandes de siège) ; on lui ajoute ce qu'il
  ne connaît pas : les 3 nuages qu'il laisse « non classés », les 5 hordes, les 4 bannières d'alliance, les 10 images du Bastion, de la
  Merveille et des Immortels (noms fixés par les listes et en partie par le code, absents du registre d'import), les 23 icônes d'objets, les 6 images des décisions G et H
  et les 3 visuels de boutique qu'il liste à part. Soit 1 461 − 672 − 32 + 3 + 5 + 4 + 10 + 23 + 6 + 3 = **811 images**, et
  143 − 30 = **113 bandes et planches** : **924 fichiers à livrer**.
- **`docs/GRAPHISMES-COMPLET.md` annonce 2 128 images restantes** : même périmètre que GENERATION-COMPLETE, mais les animations y sont
  comptées image par image (les 143 bandes y valent 667 images).
- Les variantes neige des bâtiments et de l'enceinte ne figurent dans aucune liste (décision d'octobre 2026 : le rendu 3D enneigé reste).

Points à confirmer de ton côté : (1) produire ou non le Bastion, la Merveille et les sites des Immortels avec cette liste ; (2) les noms et
le format des décors de Gloire et de l'icône de triomphe (proposés ici, le système n'est pas encore codé) ; (3) garder ou non les
2 icônes facultatives (Gloire, Échanger) ; (4) les 16 images du biome neige de la ville (et leurs 4 chantiers), reportées en octobre.
