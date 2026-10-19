# Tout ce qu'il faut graphiquement — liste complète, écran par écran

Le tour complet du jeu (octobre 2026) : chaque famille d'images que le jeu affiche ou affichera, avec le nombre d'images,
ce qui est déjà peint, où ça se voit, la référence du prompt et la priorité. **Pour générer : `docs/GENERATION-COMPLETE.md`**
(un seul fichier : règles, puis chaque image restante avec son prompt exact). Les variantes neige des bâtiments et de
l'enceinte ne sont plus demandées (le rendu 3D enneigé reste). Fichier par fichier : `docs/A-GENERER.md` ; prompts :
`docs/PROMPTS-GRAPHIQUES.md` ; sujets et formats : `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` (références « guide § »).

Règles : style de `tools/repaint/style-ref.png`, fond transparent, aucun texte ; bâtiments et chantiers avec l'entrée sur la face avant droite (sud-est) ; sprites 1024×1024, figurines et estrades
1024×1536, vignettes et bandeaux 1536×1024, animations en bande de N cases (512×768 en ville, 512×512 sur la carte).
Tout nom de cette liste est reconnu par l'import (`node tools/check-incoming.cjs art/incoming`) ; les accroches marquées
« à brancher » demandent un petit travail de code à la livraison, les autres s'affichent dès l'import.

## Résumé

| Écran | Familles | Images | Déjà peintes | Restant |
|---|---|---|---|---|
| Inscription et connexion | 4 | 20 | 0 | **20** |
| Ville : scène isométrique | 27 | 1328 | 114 | **1214** |
| Carte du monde | 13 | 236 | 0 | **236** |
| Armée, combat, héros | 11 | 247 | 0 | **247** |
| Écrans et interface | 6 | 116 | 75 | **41** |
| Boutique et application | 3 | 3 | 0 | **3** |
| **Total** | 64 | **1950** | 189 | **1761** |

## Inscription et connexion

| Famille | Images | Peintes | Où | Prompt | Priorité |
|---|---|---|---|---|---|
| Scènes de connexion (portrait, paysage) | 2 | 0 | écran de connexion | § 3.6 | ★★★ |
| Paysages des cartes de civilisation | 6 | 0 | cartes de choix de civilisation | guide § S20 | ★★☆ |
| Blasons des civilisations | 6 | 0 | inscription, alliance, étiquettes | guide § S3 | ★★☆ |
| Bustes des héros (choix de civilisation, cartes d'armée) | 6 | 0 | cartes de civilisation, armées | § 3.5 | ★★☆ |

## Ville : scène isométrique

| Famille | Images | Peintes | Où | Prompt | Priorité |
|---|---|---|---|---|---|
| Bâtiments, palier courant (niveaux 7-13), 39 × 6 civilisations | 204 | 92 | vue ville, vignettes, fiches | § 3.1 | ★★★ |
| Bâtiments, paliers 1 et 3 (niveaux 1-6 et 14-20) | 408 | 0 | vue ville, fiches (3 paliers) | § 3.1 | ★☆☆ |
| Chantiers : chaque bâtiment en construction par civilisation | 168 | 0 | bâtiment en première construction | guide § S10 | ★★☆ |
| Échafaudages par civilisation (trois tailles) | 18 | 0 | bâtiment en amélioration | guide § S11 | ★★★ |
| Ouvriers par civilisation (animation A3) | 24 | 0 | devant les chantiers | guide § A3 | ★★★ |
| Parcelles au sol (deux variantes par biome) | 6 | 2 | sous chaque bâtiment | § 3.2 | ★★☆ |
| Champs (4 types × 3 paliers × 3 biomes) | 36 | 4 | anneau des champs | § 3.2 | ★★★ |
| Champs en chantier | 12 | 0 | champ en première construction | guide § S10 | ★☆☆ |
| Enceinte : courtines, murets et tours, 3 paliers × 6 civilisations | 90 | 5 | autour de la ville (palier du Bâtiment principal) | § 3.3 | ★★★ |
| Portes de la ville par civilisation | 6 | 0 | arête sud-est de l'enceinte | guide § S1 | ★★★ |
| Enceinte en chantier | 18 | 0 | Mur en travaux | guide § S10 | ★☆☆ |
| Douves par civilisation | 18 | 0 | bâtiment Douves (à brancher) | guide § S16 | ★☆☆ |
| Ornements de plaza par civilisation (statue, fontaine, étal) | 18 | 0 | autour du Bâtiment principal | guide § S16 | ★★☆ |
| Villageois de chaque civilisation (homme, femme), marche 6 phases | 72 | 0 | avenues et plaza | guide § A1 | ★★★ |
| Gens des champs au travail | 16 | 0 | anneau des champs | guide § A12 | ★★☆ |
| Animaux dans la ville | 16 | 0 | avenues, plaza | guide § A13 | ★☆☆ |
| Flammes des torches et braseros | 8 | 0 | tours, porte, plaza (nuit) | guide § A2 | ★★★ |
| Bâtiments vivants (moulin, forge, fonderie) | 14 | 0 | sur les bâtiments | guide § A4 | ★★☆ |
| Bâtiments vivants, suite (caserne, marché, écurie, atelier, boulangerie, tour de guet) | 24 | 0 | sur les bâtiments | guide § A14 | ★★☆ |
| Fumées peintes (cheminées, feux de camp) | 8 | 0 | toits, campements | guide § A15 | ★☆☆ |
| Drapeaux peints par civilisation (8 phases) | 48 | 0 | tours, bâtiments, enceinte | guide § A16 | ★☆☆ |
| Charrette et chevaux | 8 | 0 | route, écurie | guide § A11 | ★☆☆ |
| Ambiance : neige, feuilles, tourbillon, oiseaux | 13 | 0 | selon le biome et l'heure | guide § A9 | ★☆☆ |
| Panneau « construire ici », parchemin « recherche en cours » | 2 | 0 | emplacements libres, Académie | guide § S2, S6 | ★★☆ |
| Décors de scène (arbres, rochers, buissons, cactus, dunes) | 14 | 7 | autour de la ville et des champs | § 3.2 | ★★☆ |
| Textures de sol (répétables) et bordures de transition | 43 | 4 | sols de la ville, des champs, de la carte | guide § T | ★★★ |
| Décalques au sol | 16 | 0 | semés dans la ville et aux alentours | guide § T | ★☆☆ |

## Carte du monde

| Famille | Images | Peintes | Où | Prompt | Priorité |
|---|---|---|---|---|---|
| Villes par civilisation et forteresses | 14 | 0 | villes des joueurs (palier du Bâtiment principal) | § 3.4 | ★★★ |
| Villes secondaires (colonies) par civilisation | 6 | 0 | colonies des joueurs | guide § S12 | ★★☆ |
| Points de ressource (5 types × 3 biomes) | 15 | 0 | points de ressource libres | § 3.4 | ★★★ |
| Relief et eau (forêts, montagnes, dunes, lacs, oasis, glace) | 28 | 0 | fond de la carte | § 3.4 | ★★★ |
| Camps barbares (niveaux 1-3 × 3 biomes, ruines, bannières) | 18 | 0 | points tenus par une tribu | guide « Camps barbares » | ★★★ |
| Campement de fondation (3 biomes) | 3 | 0 | point pendant la fondation d'une ville | guide § S12 | ★★☆ |
| Campement de siège (6 civilisations) | 6 | 0 | ville assiégée (armée qui campe devant la ville) | ETAT-DES-SYSTEMES « Siège qui dure » | ★★☆ |
| Armées en marche (4 classes × 6 civilisations, marchand) | 29 | 0 | armées, convois | § 3.4 | ★★★ |
| Cortège de colons (+ 6 civilisations) | 7 | 0 | armée partie fonder une ville | guide § S12 | ★★☆ |
| Héros en tête d'armée, espion | 7 | 0 | armées avec héros, missions d'espionnage | guide § S18 | ★★☆ |
| Cycles de marche (armées, marchand, colons) | 36 | 0 | armées en mouvement | guide § A5 | ★★☆ |
| Replay de bataille : poses, héros, projectiles, impacts | 43 | 0 | rapports de combat | guide § A6, A18 | ★★☆ |
| Effets de carte : combat, ville en feu, feu de camp, météo | 24 | 0 | carte | guide § A7, A17 | ★☆☆ |

## Armée, combat, héros

| Famille | Images | Peintes | Où | Prompt | Priorité |
|---|---|---|---|---|---|
| Figurines de classe (4 classes × 6 civilisations) | 24 | 0 | fiches et cartes de recrutement (repli) | § 3.5 | ★★☆ |
| Jetons de classe | 28 | 0 | listes, rapports, composition (repli) | § 3.5 | ★★☆ |
| Fiches d'unité : une figurine par unité (60) | 60 | 0 | fiche d'unité, carte de recrutement | guide § S17 | ★★☆ |
| Fiches d'unité : un jeton par unité (60) | 60 | 0 | listes, rapports, composition d'armée | guide § S17 | ★★☆ |
| Héros sur l'estrade (6) | 6 | 0 | écran du héros | § 3.5 | ★★☆ |
| Héros par palier de niveau (estrade et jeton) | 24 | 0 | écran du héros, cartes d'armée (à brancher) | guide § S19 | ★☆☆ |
| Héros en pose d'attente (3 phases) | 18 | 0 | écran du héros | guide § A10 | ★☆☆ |
| Scène du champ de bataille | 1 | 0 | replay de bataille | § 3.6 | ★★☆ |
| Estrades du héros par civilisation | 6 | 0 | écran du héros | § 3.6 | ★★☆ |
| Chefs de tribu et colons (jetons) | 12 | 0 | rapports de tribu, Résidence, fondation | guide § S12, S14 | ★☆☆ |
| Vignettes : tribus, fondation, expéditions | 8 | 0 | rapports, Résidence, expéditions | guide § S4, S12, S14 | ★☆☆ |

## Écrans et interface

| Famille | Images | Peintes | Où | Prompt | Priorité |
|---|---|---|---|---|---|
| Bandeaux en tête des écrans | 7 | 0 | marché, alliance, classement, sac, rapports, armée, recherche | § 3.6, guide § S20 | ★★☆ |
| Icônes des technologies et des branches | 12 | 0 | onglet Recherche, fiches | guide § S8 | ★★☆ |
| Objets du héros | 15 | 15 | inventaire, équipement | § 3.7 | ★★☆ |
| Habillage : boutons, cadres, plaques, barres | 17 | 14 | toute l'interface | § 3.7 | ★★★ |
| Effets d'interface (construction finie, niveau, butin) | 16 | 0 | événements | guide § A8 | ★☆☆ |
| Icônes d'interface (ressources, onglets, actions, colon, tribu) | 49 | 46 | partout | § 3.7, guide § S9, S14 | ★★★ |

## Boutique et application

| Fichier | Taille | Rôle |
|---|---|---|
| `store/ic_stat_notify.png` | 96×96 | Icône de notification Android (blanc sur transparent) |
| `store/feature-graphic.png` | 1024×500 | Bannière Google Play |
| `store/icon-1024.png` | 1024×1024 | Icône de l'application peinte (boutiques, écran d'accueil) |

## Conservé en rendu 3D (rien à produire)

Drapeaux animés 3D (8 phases × 8 couleurs, remplaçables par A16), bouffées de fumée et ondes d'eau 3D (remplaçables par A15),
emblème 3D (icône, favicon, splash ; version peinte : N3). Les variantes neige des bâtiments et de l'enceinte restent en 3D.

## Ordre conseillé

1. Ce qui se voit à chaque instant : bâtiments courants, champs, enceinte et portes, textures de sol, habillage et icônes, villes et relief de la carte.
2. Ce qui fait vivre la ville : échafaudages, ouvriers, villageois, flammes, bâtiments vivants, ornements de plaza.
3. Les systèmes récents : camps barbares, colons et colonies, technologies, chantiers par bâtiment.
4. Les fiches : une figurine et un jeton par unité, héros par palier, vignettes.
5. Le reste : paliers 1 et 3 des bâtiments, animations d'ambiance, météo, drapeaux et fumées peints, douves.
