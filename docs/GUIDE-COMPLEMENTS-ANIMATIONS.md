# Guide des compléments et des animations

Ce guide couvre **ce qui manquait** après la vérification de couverture (`docs/LISTE-GRAPHISMES.md` § 4 et 4 bis)
et **toutes les animations** que le jeu peut recevoir, de la plus visible à la plus accessoire. Chaque fiche donne
le fichier attendu, la taille, le nombre de phases et le prompt complet à coller. Le style, le fond et la livraison
sont les mêmes que pour le reste du jeu (`docs/PROMPTS-GRAPHIQUES.md` § 1, `art/incoming/README.md`).

## 0. Règles communes

- **Référence de style** : `tools/repaint/style-ref.png` (marché égyptien peint), à donner comme première image à chaque fois.
- **Début de chaque prompt** (le « style ») :

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject.
```

- **Fond** : transparent de préférence, sinon magenta #FF00FF ou vert #00FF00 (détouré à l'import). Phrase à ajouter :
  `The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient.`
- **Nommage** : exactement le nom indiqué, extension .png ; les phases d'une animation se numérotent `_0`, `_1`, … (comme les drapeaux `props/flag_ROME_0..7`).
- **Animations : une bande de phases dans une seule image.** Les générateurs d'images ne savent pas reproduire le même personnage d'une image à l'autre ; demander **une image paysage contenant toutes les phases côte à côte, cases égales, même personnage, même taille, même position dans chaque case, seule la pose change**. Je découpe la bande en fichiers `_k`. Phrase à ajouter :
  `A sprite sheet: N equal frames side by side in a single row, the exact same character at the exact same size and position in every frame, only the pose changes from one frame to the next; frame 1 … frame N: (description des phases).`
- **Tailles** : décors et personnages de ville : cases 2:3 (512×768) ; unités de carte et effets : cases carrées (512×512) ; icônes et habillage : 1024×1024 ; textures : 1024×1024 répétables.
- **Livraison** : dossier ou zip dans `art/incoming/`, par lots. Ce qui manque garde le rendu actuel (3D ou dessin du code).
  Vérification avant import : `node tools/check-incoming.cjs art/incoming` (noms, rôles, tailles, transparence, cases des bandes) ;
  import : `node tools/repaint.cjs --import=art/incoming` ; aperçu en jeu : `node tools/preview-art.cjs <FACTION> <biome>`.
  Intégration : `node tools/repaint.cjs --import=art/incoming`, puis je branche les nouvelles animations dans le code (ancrages, cadence) et je vérifie en jeu.

## 1. Liste récapitulative

| # | Élément | Fichiers | Images | Taille d'une case | Priorité |
|---|---|---|---|---|---|
| A1 | Villageois de chaque civilisation (homme, femme) qui marchent dans la ville | `props/villager_<CIV>_<a|b>_<0..5>` | 72 | 512×768 | ★★★ |
| A2 | Flammes des torches et braseros | `props/flame_<0..3>`, `props/brazier_<0..3>` | 8 | 512×768 | ★★★ |
| A3 | Chantier : ouvrier au marteau de chaque civilisation (échafaudages : § S11) | `props/worker_<CIV>_<0..3>` | 24 | 512×768 | ★★★ |
| A4 | Bâtiments vivants : ailes du moulin, étincelles de la forge, feu de la fonderie, fumée du four | `anim/mill_sails_<0..5>`, `anim/sparks_<0..3>`, `anim/furnace_<0..3>` | 14 | 512×512 | ★★☆ |
| A5 | Cycles de marche des armées sur la carte | `map/units/<hoplite|archer|cavalry|catapult|merchant>_walk_<0..5>` | 30 | 512×512 | ★★☆ |
| A6 | Replay de bataille : poses et projectiles | `map/units/<classe>_<attack|hit>_<k>`, `fx/arrow`, `fx/stone`, `fx/impact_<0..2>` | 21 | 512×512 | ★★☆ |
| A7 | Carte : combat, ville en feu, feu de camp des tribus | `map/fx/battle_<0..3>`, `map/fx/fire_<0..3>`, `map/fx/campfire_<0..3>` | 12 | 512×512 | ★★☆ |
| A8 | Effets d'interface : construction terminée, niveau supérieur, butin | `ui/fx_sparkle_<0..5>`, `ui/fx_levelup_<0..5>`, `ui/fx_coins_<0..3>` | 16 | 512×512 | ★☆☆ |
| A9 | Ambiance : neige, feuilles, tourbillon de sable, oiseaux | `props/snowflake_<0..2>`, `props/leaf_<0..2>`, `props/dust_devil_<0..3>`, `props/bird_<0..2>` | 13 | 512×512 | ★☆☆ |
| A10 | Héros : pose d'attente sur l'estrade | `heroes/<CIV>_idle_<0..2>` | 18 | 512×768 | ★☆☆ |
| A11 | Charrette sur la route et chevaux à l'écurie | `props/cart_<0..3>`, `props/horse_idle_<0..3>` | 8 | 512×768 | ★☆☆ |
| A12 | Gens des champs au travail (faucheur, bûcheron, carrier, mineur) | `props/<farmer|lumberjack|quarryman|miner>_<0..3>` | 16 | 512×768 | ★★☆ |
| A13 | Animaux dans la ville (poule, chien, chèvre, chat) | `props/animal_<chicken|dog|goat|cat>_<0..3>` | 16 | 512×768 | ★☆☆ |
| A14 | Bâtiments vivants, suite (exercice à la Caserne, badauds au Marché, cheval à l'Écurie, marteau à l'Atelier, four de la Boulangerie, feu de la Tour de guet) | `anim/<barracks_drill|market_crowd|stable_horse|workshop_hammer|bakery_smoke|watchtower_beacon>_<0..3>` | 24 | 512×512 | ★★☆ |
| A15 | Fumées peintes (cheminées, feux de camp) à la place des bouffées 3D | `props/smoke_<chimney|campfire>_<0..3>` | 8 | 512×768 | ★☆☆ |
| A16 | Drapeaux peints par civilisation à la place des drapeaux 3D | `props/flagp_<CIV>_<0..7>` | 48 | 512×768 | ★☆☆ |
| A17 | Météo sur la carte (pluie, neige) | `map/fx/<rain|snowfall>_<0..3>` | 8 | 512×512 | ★☆☆ |
| A18 | Héros au combat dans le replay | `map/units/hero_<CIV>_attack_<0..2>` | 18 | 512×512 | ★☆☆ |
| S1 | Porte de la ville par civilisation | `walls/<CIV>/gate` | 6 | 1024×1024 | ★★★ |
| S2 | Panneau « construire ici » | `props/sign_build` | 1 | 512×768 | ★★☆ |
| S3 | Blasons des civilisations | `ui/crest_<CIV>` | 6 | 1024×1024 | ★★☆ |
| S4 | Vignettes des destinations d'expédition | `scenes/expedition-<forest|desert|mountain|ruins>` | 4 | 1536×1024 | ★☆☆ |
| S5 | Boutons ronds des bulles d'action | `ui/btn-round`, `ui/btn-round-pressed` | 2 | 1024×1024 | ★☆☆ |
| T1 | Sols de base, variantes par biome | `terrain/<grass_*|dirt_*|sand_*|snow_*>` | 14 | 1024×1024 répétable | ★★★ |
| T2 | Eau et glace | `terrain/water_<lake|deep|river|shallow>`, `terrain/ice` | 5 | 1024×1024 répétable | ★★★ |
| T3 | Dallages et chemins (plaza par civilisation, avenues, routes) | `terrain/plaza_<CIV>`, `terrain/cobble`, `terrain/flagstone`, `terrain/road_*` | 11 | 1024×1024 répétable | ★★★ |
| T4 | Sols des champs | `terrain/soil_tilled`, `terrain/wheat`, `terrain/orchard` | 3 | 1024×1024 répétable | ★★☆ |
| T5 | Décalques au sol (non répétables, fond transparent) | `decals/<nom>` | 16 | 1024×1024 | ★★☆ |
| T6 | Bordures et transitions (bandes répétables sur un axe) | `terrain/edge_<nom>` | 6 | 1024×256 | ★☆☆ |
| S7 | Glyphes (facultatif) | `ui/sun`, `moon`, `left`, `right`, `plus`, `minus`, `close`, `info`, `menu` | 9 | 1024×1024 | ☆☆☆ |
| N1 | Icône de notification Android | `store/ic_stat_notify` | 1 (+ déclinaisons automatiques) | 96×96 | ★★★ |
| N2 | Bannière Google Play | `store/feature-graphic` | 1 | 1024×500 | ★★★ |

Priorité ★★★ = visible dès la première minute de jeu ou obligatoire pour publier.

## 2. Compléments fixes

### S1. Porte de la ville par civilisation — `walls/<CIV>/gate.png` (6)

Aujourd'hui le vantail est dessiné par le code entre deux tourelles. La porte peinte remplace le vantail et les deux tourelles
(elle tient sur un tronçon et demi de courtine). Même cadrage que les tours d'enceinte : un losange de parcelle 2:1, la porte vue de face
gauche (arête sud-ouest), battants ouverts.

Prompt (ajouter le style, puis) :
`Composition: square image, the gate stands on a square ground plot seen as a 2:1 diamond, centered horizontally; the diamond is about 51% of the image width, its center at 73% of the image height. Subject: a fortified city gate with two small flanking turrets, an arched opening with open wooden doors, torches on each side, seen from the front-left so that the opening faces the lower left, <ARCHITECTURE>.`

Architecture par civilisation (même phrases que le guide des bâtiments) : ROME `Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners` ; GAUL `Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners` ; GREEK `Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners` ; EGYPT `Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents` ; HUN `Hunnic steppe architecture: felt and hides over timber, pointed conical roofs, horsetail standards, red banners` ; SULTAN `Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, gold crescents, lanterns`.

### S2. Panneau « construire ici » — `props/sign_build.png` (1)

`Composition: 2:3 portrait image, the prop centered horizontally, its base at 89% of the image height, about 60% of the width. Subject: a small wooden signpost planted in the ground with a parchment sheet showing a simple hammer symbol, a mallet leaning against the post, no letters.`

### S3. Blasons des civilisations — `ui/crest_<CIV>.png` (6)

`Composition: square image, a single object centered filling about 70% of the frame, front view. Subject: a heraldic crest on a round shield with a thin gold rim: <SUJET>.`
ROME `a golden eagle with spread wings on a deep red field` ; GAUL `a white boar on a green field with a carved wood rim` ; GREEK `a golden owl on a blue field with a laurel wreath` ; EGYPT `a golden scarab on a teal field with an ochre border` ; HUN `a black horse head on a red field with fur trim` ; SULTAN `a golden crescent and star on a teal mosaic field`.

### S4. Vignettes des destinations d'expédition — `scenes/expedition-<forest|desert|mountain|ruins>.png` (4)

`Composition: wide image, the scene centered, ground at 70% of the height, nothing cut at the edges. Subject: <SUJET>, a small winding path leading into the scene, a hero's banner planted in the foreground.`
forest `a deep green forest with mossy rocks and a stream` ; desert `golden dunes with an oasis and a ruined pylon` ; mountain `a rocky mountain pass with snow caps and a cave entrance` ; ruins `the overgrown ruins of an ancient temple with broken columns and a treasure chest`.

### S5. Boutons ronds des bulles d'action — `ui/btn-round.png`, `ui/btn-round-pressed.png` (2)

`Composition: the element fills the whole square image edge to edge, front view, no perspective. Subject: a round game button of dark polished wood with a thin golden rim and a soft highlight at the top, completely empty in the middle (no icon).` Version `-pressed` : `darker and flat, no highlight`.

### T. Textures de sol — le jeu complet (55 images)

Les quatre sols actuels (`terrain/grass`, `dirt`, `sand`, `snow`) sont peints ; tout le reste est dessiné par le code avec
des dégradés. Pour obtenir la richesse de Rise of Kingdoms, voici le jeu complet. **Toutes vues de dessus, sans perspective,
sans ombre portée, répétables sans raccord visible** (le motif se continue d'un bord à l'autre), 1024×1024, sauf indication.

Prompt commun (remplace le style isométrique) :
`A seamless, tileable top-down ground texture for a hand-painted strategy game, in the art style of the first reference image: flat painted textures with soft shading, clean subtle dark-brown outlines on details, warm palette, no perspective, no cast shadow, no vignette, uniform lighting, the pattern continues across all four edges so the tile repeats without visible seams. Subject: <SUJET>.`

#### T1. Sols de base (14)

| Fichier | Sujet | Où |
|---|---|---|
| `terrain/grass_lawn` | short well-kept green lawn, fine blades, a few tiny daisies | sol de l'enceinte (prairie) |
| `terrain/grass_dark` | dense dark-green undergrowth with moss and small ferns | lisières, sous les bosquets |
| `terrain/grass_dry` | dry yellow-green summer grass with some bare earth | alentours de la ville, carte |
| `terrain/grass_flowers` | meadow grass dotted with small red, white and yellow wildflowers | parcelles libres, bords des avenues |
| `terrain/grass_hills` | rolling meadow grass with lighter crests and darker hollows | carte du monde (prairie) |
| `terrain/dirt_packed` | packed brown earth with small pebbles and faint footprints | plaza hunnique, chantiers |
| `terrain/mud` | wet dark mud with shallow puddles reflecting the sky | abords des étangs, pluie |
| `terrain/gravel` | small grey and beige gravel stones | cours des ateliers, carrières |
| `terrain/sand_ripples` | pale ochre desert sand with gentle wind ripples | sol de l'enceinte (désert), dunes de carte |
| `terrain/sand_rocky` | sand with scattered small dark stones and a few dry tufts | alentours désertiques |
| `terrain/cracked_earth` | dry cracked clay ground in warm ochre | oasis asséchées, routes du désert |
| `terrain/snow_fresh` | fresh untouched snow, soft blue shadows, a few sparkles | sol de l'enceinte (neige) |
| `terrain/snow_trampled` | trampled grey-white snow with footprints and dirt showing through | avenues et plaza en biome neige |
| `terrain/tundra` | frosted short grass and frozen earth, white edges on the blades | alentours en biome neige, carte |

#### T2. Eau et glace (5)

| Fichier | Sujet | Où |
|---|---|---|
| `terrain/water_lake` | calm clear blue lake water, soft ripples, a few light reflections | étangs de la ville, lacs de carte |
| `terrain/water_deep` | deep dark-blue water with slow swells | mers et grands lacs de carte |
| `terrain/water_river` | flowing water with diagonal streaks and small white foam lines | rivières (le code oriente le courant) |
| `terrain/water_shallow` | shallow turquoise water with a sandy bottom visible | oasis, rives, douves |
| `terrain/ice` | pale blue cracked ice with white frost lines | lacs gelés, douves en biome neige |

#### T3. Dallages et chemins (11)

| Fichier | Sujet | Où |
|---|---|---|
| `terrain/plaza_ROME` | large pale sandstone flagstones with thin dark joints, a faint mosaic meander border | plaza romaine |
| `terrain/plaza_GAUL` | rough wooden planks and packed earth with straw | plaza gauloise |
| `terrain/plaza_GREEK` | white marble slabs with grey veins and thin joints | plaza grecque |
| `terrain/plaza_EGYPT` | golden sandstone tiles with a few carved hieroglyph bands | plaza égyptienne |
| `terrain/plaza_HUN` | trampled dark earth with hoof prints and scattered straw | plaza hunnique |
| `terrain/plaza_SULTAN` | teal, white and gold geometric mosaic tiles | plaza du Sultanat |
| `terrain/cobble` | worn rounded cobblestones in warm beige and grey, thin dark joints, tufts of grass in the cracks | avenues de la ville |
| `terrain/flagstone` | irregular flat grey flagstones with moss in the joints | abords des bâtiments avancés |
| `terrain/road_dirt` | a packed dirt road with two cart ruts and grass at the sides, running vertically | route hors de la ville (le code l'oriente) |
| `terrain/road_paved` | an ancient paved road of large basalt stones, running vertically | routes entre villes sur la carte |
| `terrain/path_sand` | a sandy trail with camel tracks, running vertically | chemins du désert |

#### T4. Sols des champs (3)

| Fichier | Sujet | Où |
|---|---|---|
| `terrain/soil_tilled` | tilled brown soil in straight furrows | champs en chantier, niveaux 1-6 |
| `terrain/wheat` | golden ripe wheat seen from above in neat rows | fermes développées |
| `terrain/orchard` | green grass with rows of small round tree crowns | vergers, fermes de haut niveau |

#### T5. Décalques au sol (16, fond transparent, non répétables)

Petits motifs posés par le code au hasard (graine fixe) pour casser la répétition, 1024×1024 avec transparence autour :
`A single ground decal on a fully transparent background, seen from above, soft edges that fade into transparency, hand-painted style of the first reference image. Subject: <SUJET>.`

| Fichier | Sujet |
|---|---|
| `decals/grass_tuft` | a tuft of taller grass |
| `decals/flowers_red` | a small patch of red poppies |
| `decals/flowers_white` | a small patch of white and yellow daisies |
| `decals/clover` | a patch of clover and small leaves |
| `decals/pebbles` | a scatter of small grey pebbles |
| `decals/cracks` | thin dry cracks in the earth |
| `decals/puddle` | a shallow puddle reflecting the sky |
| `decals/leaves` | scattered fallen autumn leaves |
| `decals/moss` | a soft patch of green moss |
| `decals/mushrooms` | a small cluster of brown mushrooms |
| `decals/branches` | a few fallen dry branches |
| `decals/cart_tracks` | two parallel cart ruts |
| `decals/hoof_prints` | a trail of hoof prints |
| `decals/snow_drift` | a small drift of snow |
| `decals/ice_patch` | a patch of thin ice |
| `decals/sand_ripple` | a patch of wind ripples in sand |

#### T6. Bordures et transitions (6, bandes de 1024×256 répétables horizontalement)

Le code les pose le long des bords (plateau, rivage, routes). `A seamless horizontally tileable top-down strip, the top half is <A> blending softly into <B> in the bottom half, hand-painted style of the first reference image.`

| Fichier | Transition |
|---|---|
| `terrain/edge_grass_sand` | green grass → ochre sand |
| `terrain/edge_grass_snow` | green grass → white snow |
| `terrain/edge_shore` | sandy shore → shallow clear water |
| `terrain/edge_grass_water` | green grass with reeds → lake water |
| `terrain/edge_cliff` | grass edge → a short brown earth cliff face (seen slightly from the front) |
| `terrain/edge_road` | cobblestone road → grass verge |

**Déjà branché dans le code** (octobre 2026) : chaque texture est utilisée dès qu'elle est déposée, avec repli automatique sur une variante plus générale puis sur les quatre sols de base tant qu'elle manque. Alentours (`grass_dry`, `sand_rocky`, `tundra`), sol de l'enceinte (`grass_lawn`, `sand_ripples`, `snow_fresh`), plaza par civilisation (`plaza_<CIV>`), avenues (`cobble`, `snow_trampled` dans la neige), route (`road_dirt`, `path_sand`), champs vides (`soil_tilled`), étangs et lacs (`water_lake`, `water_shallow`, `ice`) en ville comme sur la carte, sols de carte (`grass_hills`, `sand_ripples`, `tundra`), décalques du biome semés à graine fixe hors parcelles, avenues et plaza. Les bordures (T6) seront posées le long des rives et des routes dans une étape suivante. Import : `node tools/repaint.cjs --import=art/incoming` reconnaît `terrain/<nom>.png` et `decals/<nom>.png` (sans guide, sans recalage) ; le kit (`--kit`) fournit leurs prompts.

### S7. Glyphes (facultatif) — `ui/<nom>.png` (9)

Seulement par souci d'unité : `a single simple symbol centered filling 70% of the frame, painted in gold on nothing` pour sun (soleil), moon (croissant), left / right (flèche), plus, minus, close (croix), info (lettre i dans un cercle), menu (trois traits).

### N1. Icône de notification Android — `store/ic_stat_notify.png`

Obligatoire pour que les notifications push ne s'affichent pas en carré blanc. **Pictogramme blanc sur fond transparent, une seule couleur, sans dégradé ni ombre**, 96×96 px (je produis les tailles 72, 48, 36, 24). Sujet : la silhouette du casque de l'emblème (vu de côté, cimier compris), traits épais lisibles à 24 px.

### N2. Bannière Google Play — `store/feature-graphic.png` (1024×500, sans transparence)

`A wide painted banner for a mobile strategy game set in antiquity: a fortified city of six ancient civilisations on a green plateau at golden hour, a Roman hero with a red-crested helmet in the foreground on the left, banners and marching soldiers, warm earthy palette, the right third of the image left calmer for a title.` Le titre est ajouté ensuite par moi (police du jeu), ne pas écrire de texte.

## 3. Animations

### 3.1 Déjà animé (rien à produire)

Fumée des cheminées (4 volutes 3D), drapeaux (8 phases × 8 couleurs), ondes des bassins et des douves (4 phases), marche des armées sur la carte (trottinement, balancement, poussière), ligne de marche, oiseaux, lueurs de nuit, marteau du chantier, icône de production flottante, replay de bataille (déplacements, flèches et pierres tracés), ondulation du clic, apparition des bulles d'action.

### A1. Villageois dans la ville — `props/villager_<a|b|c>_<0..5>.png` (3 personnages × 6 phases) ★★★

C'est l'animation qui donne le plus de vie (les petites silhouettes qui circulent dans Rise of Kingdoms). Trois personnages génériques (un homme avec une amphore, une femme avec un panier, un enfant), cycle de marche de 6 phases vers la droite ; le code les fait aller et venir sur les avenues et la plaza, et les retourne pour l'autre sens.

Prompt : style + `A sprite sheet: 6 equal frames side by side in a single row, the exact same character at the exact same size and position in every frame, only the pose changes; a walk cycle seen in three-quarter view walking towards the viewer's right: contact, down, passing, up, contact, passing. Subject: <PERSONNAGE>, small lively ancient villager, simple linen tunic, sandals, earthy colours.` Personnages : a `a man carrying a clay amphora on his shoulder` ; b `a woman carrying a wicker basket of bread on her hip` ; c `a child holding a wooden toy sword`. Fond transparent. Cadence prévue : 8 i/s.

### A2. Flammes — `props/flame_<0..3>.png`, `props/brazier_<0..3>.png` (8) ★★★

Les torches des tours, de la porte et des remparts, les braseros de la plaza la nuit. 4 phases en boucle.
flame : `A sprite sheet: 4 equal frames in a row, a single torch flame on a short wooden torch head, same size and position, the flame flickers differently in each frame (lean left, upright, lean right, tall), warm orange and yellow with a soft inner glow.`
brazier : `A sprite sheet: 4 equal frames in a row, a bronze brazier on three legs with a burning fire, same size and position, only the flames change.` Cadence : 8 i/s.

### A3. Chantier — `props/worker_<CIV>_<0..3>.png` (6 civilisations × 4 phases) ★★★

L'ouvrier frappe au marteau devant le bâtiment en travaux (4 phases : lever, sommet, frappe, rebond), habillé comme sa
civilisation : Rome tunique courte de laine ceinturée et sandales ; Gaule cheveux longs, moustache, braies de laine à carreaux ;
Grèce chiton court agrafé à une épaule et bonnet de feutre ; Égypte pagne shendyt de lin blanc, crâne rasé ; Huns caftan
ceinturé, pantalon, bottes, bonnet bordé de fourrure ; Sultanat robe rayée aux manches retroussées et turban. Les échafaudages
(trois tailles par civilisation) sont des compléments fixes, § S11 ; les chantiers de chaque bâtiment, § S10.
worker : `A sprite sheet: 4 equal frames in a row, the same <ouvrier de la civilisation> swinging a wooden mallet: raise, top, strike, rebound; same size and position in every frame.`

### A4. Bâtiments vivants — `anim/mill_sails_<0..5>`, `anim/sparks_<0..3>`, `anim/furnace_<0..3>` (14) ★★☆

Superpositions posées sur le bâtiment (je règle l'ancrage par bâtiment et par civilisation, comme pour la fumée).
mill_sails : `A sprite sheet: 6 equal frames in a row, the four canvas sails of a windmill seen from the front-left in isometric view, rotating by 15 degrees from one frame to the next, same hub position in every frame, nothing else (no tower).`
sparks : `A sprite sheet: 4 equal frames in a row, a burst of orange sparks flying up from an anvil, growing then fading, nothing else.`
furnace : `A sprite sheet: 4 equal frames in a row, the glowing orange mouth of a stone furnace with flames flickering, same size and position, only the fire changes.`

### A5. Cycles de marche des armées — `map/units/<hoplite|archer|cavalry|catapult|merchant>_walk_<0..5>.png` (30) ★★☆

Remplace le trottinement calculé par le code. Série neutre (le code teinte la bannière aux couleurs de la civilisation).
`A sprite sheet: 6 equal frames in a row, a small map marker of <SUJET> walking towards the lower right, three-quarter view from above, same size and position in every frame, only the legs and arms move (walk cycle).` Sujets : hoplite `two infantrymen with spears and round shields` ; archer `two archers with bows and quivers` ; cavalry `a rider on a trotting horse with a lance` ; catapult `a siege crew pushing a wooden catapult on wheels` ; merchant `a merchant leading a horse-drawn cart loaded with crates`. Cases carrées.

### A6. Replay de bataille — poses et projectiles (21) ★★☆

Par classe (hoplite, archer, cavalry, catapult), même cadrage que A5 : `_attack_<0..2>` (3 phases : armer, frapper ou tirer, retour) et `_hit_<0..1>` (2 phases : recul, chute) = 20 images ; plus `fx/arrow.png` (une flèche en vol, vue de côté), `fx/stone.png` (une pierre de catapulte) et `fx/impact_<0..2>.png` (éclat d'impact : étincelle, étoile, poussière). Cases carrées.

### A7. Carte du monde — `map/fx/battle_<0..3>`, `map/fx/fire_<0..3>`, `map/fx/campfire_<0..3>` (12) ★★☆

battle : `A sprite sheet: 4 equal frames in a row, two crossed swords clashing with a flash of sparks that grows and fades, nothing else.` (combat en cours sur une ville ou un point de ressource)
fire : `A sprite sheet: 4 equal frames in a row, a cluster of orange flames with dark smoke, flickering, nothing else.` (ville assiégée ou pillée)
campfire : `A sprite sheet: 4 equal frames in a row, a small campfire of logs with flickering flames, nothing else.` (camp des tribus qui gardent une ressource)

### A8. Effets d'interface — `ui/fx_sparkle_<0..5>`, `ui/fx_levelup_<0..5>`, `ui/fx_coins_<0..3>` (16) ★☆☆

Joués une fois au-dessus d'un bâtiment terminé, d'un badge de niveau qui monte, d'un butin reçu.
sparkle : `A sprite sheet: 6 equal frames in a row, a burst of golden sparkles expanding from the center then fading, nothing else.`
levelup : `A sprite sheet: 6 equal frames in a row, a golden upward arrow with a ring of light rising and fading, nothing else.`
coins : `A sprite sheet: 4 equal frames in a row, three gold coins bouncing up then settling, nothing else.`

### A9. Ambiance — `props/snowflake_<0..2>`, `props/leaf_<0..2>`, `props/dust_devil_<0..3>`, `props/bird_<0..2>` (13) ★☆☆

Flocons (biome neige), feuilles (forêt, automne), tourbillon de sable (désert), oiseaux en vol (3 phases de battement). Petits éléments, cases carrées : `a single <snowflake / falling leaf / small spinning dust devil / flying bird seen from below>, three variants / phases side by side, nothing else`.

### A10. Héros — `heroes/<CIV>_idle_<0..2>.png` (18) ★☆☆

Pose d'attente sur l'écran du héros (respiration, cape qui bouge) : 3 phases par civilisation, même cadrage que le héros sur estrade (`scenes/hero-<CIV>`), **le héros seul sans l'estrade** : `A sprite sheet: 3 equal frames in a row, the same hero (<COIFFE>, cape, sword and round shield) standing at ease, breathing: shoulders slightly down, neutral, slightly up, the cape swaying a little, same size and position.` Coiffes : voir `docs/PROMPTS-GRAPHIQUES.md` § 3.

### A11. Charrette et chevaux — `props/cart_<0..3>`, `props/horse_idle_<0..3>` (8) ★☆☆

Une charrette tirée par un cheval qui entre et sort par la porte (4 phases de marche), des chevaux qui piaffent devant l'écurie (4 phases). Même consigne de bande que A1, cases 2:3.

## 4. Ce que je branche côté code à la réception

- A1, A11 : trajets aléatoires sur les avenues et la plaza, retournement selon le sens, 2 à 4 personnages visibles, cadence 8 i/s, pause quand l'onglet est caché.
- A2 : torches sur chaque tour et tourelle de porte (nuit : lueur en plus), braseros aux coins de la plaza.
- A3 : échafaudage à la place du clignotement du bâtiment en travaux, ouvrier devant ; retiré à la fin du chantier.
- A4 : ancrages par bâtiment et civilisation (comme `ISO_CHIMNEYS`), cadence 10 i/s pour le moulin, 12 i/s pour les étincelles.
- A5, A6, A7 : marqueurs de carte et replay à partir des bandes découpées ; les effets jouent en boucle tant que l'état dure.
- A8 : lecture unique à l'événement (construction terminée, niveau, butin).
- A9 : particules selon le biome et l'heure ; A10 : écran du héros.

Chaque lot livré est intégré, vérifié sur bureau et mobile, puis commité.

## Camps barbares de la carte (`map/camps/`, 18 images, 1024×1024, cadre map)

Les tribus qui gardent les points de ressource n'avaient aucun visuel : la carte affiche l'icône de ressource et la bulle dit
« Tribu locale ». Dès qu'ils sont livrés, le camp remplace l'icône de ressource (gardée en petit) tant que la tribu tient le
point, les ruines prennent le relais jusqu'à sa réapparition, et la bannière de la tribu se pose sur le camp.

| Fichier | Sujet |
|---|---|
| `map/camps/camp1.png` (+ `_desert`, `_snow`) | petit camp : deux tentes de peau autour d'un feu, un totem à crâne, quelques lances plantées |
| `map/camps/camp2.png` (+ `_desert`, `_snow`) | camp palissadé : pieux taillés avec une porte, plusieurs tentes, une tour de guet en bois, un feu, une grande bannière |
| `map/camps/camp3.png` (+ `_desert`, `_snow`) | fort de bois : haute palissade avec deux tours d'angle et une porte, une maison longue au toit de chaume, totems, bannières, feu qui fume |
| `map/camps/ruins.png` (+ `_desert`, `_snow`) | restes brûlés d'un camp : pieux calcinés, tente effondrée, totem brisé, braises et un filet de fumée |
| `map/camps/banner_<CIV>.png` × 6 | petite bannière carrée sur un mât en bois, aux couleurs et à l'emblème du peuple de la tribu |

Variante désert : sur du sable, un palmier et des rochers rouges ; variante neige : neige sur les tentes et les toits, congères.
Prompts complets : `node tools/repaint.cjs --kit=<dossier>` ou `docs/PROMPTS-GRAPHIQUES.md`. L'animation du feu de camp
(`map/fx/campfire_<0..3>.png`, § A7) se pose au centre du camp.

## S6. Parchemin « recherche en cours » (`props/scroll_research.png`, 512×768, cadre prop)

Un grand parchemin déroulé avec une plume, dressé comme un panneau, légèrement lumineux : il se pose au-dessus de l'Académie
tant qu'une recherche est en cours, comme l'échafaudage sur un chantier. Même cadre et même ancre que `props/sign_build.png`.

## S8. Icônes des technologies et des branches de recherche (`ui/tech_<CLÉ>.png` × 8, `ui/branch_<CLÉ>.png` × 4, 1024×1024, cadre icon)

L'onglet Recherche de l'Académie et les fiches de technologie n'ont aujourd'hui aucune image propre (l'en-tête de branche
réutilise une icône de ressource). Dès qu'elles sont livrées, l'icône de la technologie apparaît sur sa carte et en tête de sa
fiche, celle de la branche dans l'en-tête de la branche.

| Fichier | Sujet |
|---|---|
| `ui/tech_AGRONOMY.png` | gerbe de blé doré croisée d'une charrue de bois |
| `ui/tech_ENGINEERING.png` | grue de bois avec un bloc de pierre au bout d'une corde et une équerre |
| `ui/tech_TRAINING.png` | deux épées d'entraînement en bois croisées sur un bouclier rond |
| `ui/tech_TACTICS.png` | parchemin déroulé portant un plan de bataille et un petit marqueur de bronze |
| `ui/tech_DISCIPLINE.png` | trois boucliers ronds qui se chevauchent en mur |
| `ui/tech_MEDICINE.png` | bol d'argile d'herbes vertes et bande de lin roulée |
| `ui/tech_CARTOGRAPHY.png` | carte roulée avec une rose des vents et une petite figurine de cheval |
| `ui/tech_SUPPLY.png` | sacs de grain empilés et un tonneau de bois |
| `ui/branch_ECONOMY.png` | gerbe de blé et pile de pièces |
| `ui/branch_MILITARY.png` | épée de bronze et lance croisées |
| `ui/branch_DEFENSE.png` | grand bouclier devant un mur crénelé |
| `ui/branch_LOGISTICS.png` | roue de charrette chargée et poteau indicateur |

Mêmes règles que les autres icônes d'interface (§ 3.7 de `docs/LISTE-GRAPHISMES.md`) ; prompts complets dans
`docs/PROMPTS-GRAPHIQUES.md`.

## S9. Icône du colon (`ui/settler.png`, 1024×1024, cadre icon)

Les villes secondaires (octobre 2026) ont besoin d'une icône pour le colon : onglet « Colons » de la Résidence, ligne
« 1 colon » sur la carte d'une armée en route, bouton « Fonder une ville » de la bulle d'un point libre, icône de mission.
Tant qu'elle n'est pas livrée, le client affiche l'icône de ville (`ui/city`).

| Fichier | Sujet |
|---|---|
| `ui/settler.png` | villageois qui marche, baluchon au bout d'un bâton sur l'épaule, piquet de bois à petit fanion dans l'autre main |

Mêmes règles que les autres icônes d'interface ; prompt complet dans `docs/PROMPTS-GRAPHIQUES.md`.

## S10. Chantiers : chaque bâtiment en construction (`buildings/<CIV>/<CLÉ>_site.png` × 168, `fields/<biome>/<TYPE>_site.png` × 12, `walls/<CIV>/site_<seg_x|seg_z|tower>.png` × 18, 1024×1024)

Un sprite par bâtiment et par civilisation, affiché **à la place du bâtiment pendant sa première construction** (le code
clignotait jusqu'ici) ; les améliorations gardent le bâtiment fini sous l'échafaudage générique (§ S11). Même emprise, même
cadrage et même silhouette que le bâtiment fini : le kit (`node tools/repaint.cjs --kit=<dossier>`) donne le rendu du bâtiment
comme image-guide, le chantier doit tenir dans sa silhouette, à moitié construit (murs bas montés, étage et toit absents ou
seulement charpentés, aucune décoration finie), deux ou trois ouvriers, matériaux au sol.

Avis historique, une technique par civilisation (c'est ce qui rend chaque chantier reconnaissable, plus que le bâtiment lui-même) :

| Civilisation | Ce qu'on voit sur le chantier | Pourquoi |
|---|---|---|
| Rome | échafaudage de perches liées reposant dans des trous de boulin, grue à roue de cage (*polyspastos*) levant un bloc, murs de béton parementés de brique (*opus testaceum*) à mi-hauteur, cintre de bois sous un arc, auges de mortier de chaux, groma d'arpenteur, piles de tuiles et de blocs | la grue à roue et le béton de brique sont les deux signatures du chantier romain (Vitruve, colonne Trajane) |
| Gaule | ossature de poteaux et poutres de chêne (lacis du *murus gallicus*), clayonnage en cours de torchis, lattis de toit attendant son chaume, bottes de roseau, échelles et perches liées, herminettes, paniers de terre ; **pas de grue** | architecture de bois, de terre et de chaume : rien de levé, tout est porté et lié |
| Grèce | chèvre de levage à poulie soulevant un tambour de colonne par sa louve, tambours empilés, échafaudage de perches et planches, ciseaux et maillets de tailleurs de pierre, blocs aux bossages encore bruts, mur de marbre à mi-hauteur avec crampons, tuiles | le marbre monté tambour par tambour et fini en place |
| Égypte | rampe de terre et de gravats jusqu'aux murs de grès et de brique crue à mi-hauteur, bloc sur traîneau de bois tiré à la corde sur du limon mouillé, leviers et berceaux à bascule, léger échafaudage de roseaux pour les enduiseurs, ciseaux de cuivre, fil à plomb, briques séchant au soleil ; **pas de grue** | la rampe et le traîneau, pas l'échafaudage : c'est l'Égypte |
| Huns | treillis de bois rond en train d'être dressé et lié de lanières, panneaux de feutre et de peaux à moitié posés, palissade de rondins appointés plantée, charrettes de perches et de feutre roulé, cordes et piquets, un cheval attaché ; **ni maçonnerie ni grue** | peuple nomade : on monte, on tend, on attache |
| Sultanat | murs de brique cuite à mi-hauteur au mortier de chaux, cintre de bois soutenant un arc brisé, échafaudage de troncs de palmier liés de corde, palan, piles de carreaux émaillés turquoise et de panneaux de stuc, auges, coupole sur coffrage | brique, arc et coupole sur cintre : le chantier des villes d'Orient |

Champs en chantier (`fields/<biome>/<TYPE>_site`, guide = `<TYPE>_1`) : premiers sillons à l'araire et semeur (ferme), arbres
fraîchement abattus et souches (bûcheron), première entaille dans la roche et blocs sur rouleaux (carrière), entrée de mine
en cours d'étayage et paniers de minerai (mine). Enceinte en chantier (`walls/<CIV>/site_*`, guide = palier 1) : premières
assises posées, échafaudage de la civilisation le long, ouvriers.

Ordre conseillé : d'abord les 18 échafaudages génériques (§ S11) qui habillent tous les chantiers d'un coup, puis les
chantiers des bâtiments les plus souvent construits (Hôtel de ville, champs, Dépôt, Silo, Caserne, Marché, Académie, Mur),
puis le reste.

## S11. Échafaudages génériques par civilisation (`props/scaffold_<CIV>_<1|2|3>.png` × 18, 1024×1024, cadre building)

Posé par-dessus le bâtiment pendant une amélioration (ou un nouveau bâtiment sans sprite de chantier), trois tailles pour
les paliers 1-6, 7-13 et 14-20, **rien derrière** (structure seule, le bâtiment reste visible à travers). Même cadrage que
les bâtiments (losange 51 %, centre à 73 %). Rome : perches et boulins liés, passerelles de planches, petite grue à roue
au sommet ; Gaule : perches brutes liées et claies d'osier, échelles de chêne, bottes de chaume ; Grèce : perches droites
et planches, chèvre à poulie levant un bloc de marbre ; Égypte : rampe de terre, traîneau et cordes, léger échafaudage de
roseaux, paniers de briques ; Huns : cadre de perches lié de lanières, feutre roulé, cordes et piquets, charrette ;
Sultanat : troncs de palmier liés de corde, palan, cintre d'arc, briques et carreaux émaillés.

## S12. Colons et villes secondaires (cortège, campement de fondation, colonie, portraits, vignette)

| Fichier | Taille | Sujet | Où |
|---|---|---|---|
| `map/units/settler.png`, `map/units/settler_<CIV>.png` × 6 | 1024×1024 (cadre map) | cortège de colons : chariot bâché tiré par des bœufs, famille à pied portant des baluchons, un homme tenant un piquet à fanion, en marche vers le bas-droit ; variante aux couleurs et coiffes civiles de la civilisation | armée partie fonder une ville (charrette du marchand tant que ce sprite manque) |
| `map/units/settler_walk_<0..5>.png` | bande 6 cases 512×512 | même cortège, cycle de marche | A5 |
| `map/camps/foundation.png`, `_desert`, `_snow` | 1024×1024 (cadre map) | campement de fondation : trois tentes de toile, chariot bâché, piquets et cordes marquant la future enceinte, tranchée, piles de troncs et de pierres, feu, mât de bannière (la bannière de la civilisation du fondateur est ajoutée par le code) | point de ressource pendant les 24 h de fondation |
| `map/cities/colony_<rome|gaul|greek|egypt|hun|sultan>.png` × 6 | 1024×1024 (cadre map) | colonie fraîchement fondée : palissade basse, trois ou quatre maisons modestes, un puits, une bannière, sol fraîchement défriché, architecture de la civilisation | villes secondaires sur la carte (sprite de ville ordinaire sinon) |
| `busts/SETTLER_<CIV>.png` × 6 | 1024×1024 (cadre bust) | jeton tête-épaules du colon, coiffe civile de la civilisation (Rome cheveux courts et tunique, Gaule tresses et manteau à carreaux, Grèce bandeau et chiton, Égypte perruque noire et col de lin, Huns bonnet de fourrure et caftan, Sultanat turban et robe rayée) | onglet Colons, modale de fondation, carte d'armée |
| `scenes/vignette-founding.png` | 1536×1024 (cadre header) | chariot déchargé, homme plantant un piquet à fanion, tentes, cordes et piquets, prêtre versant une libation, collines à l'aube | onglet Colons et modale (à brancher à la livraison) |

## S13. Icône du colon : voir § S9

## S14. Tribus locales (chefs, vignettes des rapports, icône)

| Fichier | Taille | Sujet | Où |
|---|---|---|---|
| `busts/TRIBE_<CIV>.png` × 6 | 1024×1024 (cadre bust) | chef de la tribu locale : visage peint, manteau de fourrure, collier de dents, coiffe civile de la civilisation | rapports « Combat contre la tribu », bulle du point |
| `scenes/vignette-tribe-<forest|desert|snow>.png` × 3 | 1536×1024 (cadre header) | camp de la tribu selon le biome : huttes rondes au toit de chaume et palissade dans une clairière / tentes de peaux, palmier et chameaux entre dunes et rochers rouges / huttes couvertes de fourrures dans une pinède enneigée ; totem à crâne, guerriers autour du feu | en tête des rapports de tribu (déjà branché : s'affiche dès la livraison) |
| `ui/tribe.png` | 1024×1024 (cadre icon) | totem de bois surmonté d'un crâne et deux massues croisées | bulle « Tribu locale » (déjà branché), rapports, listes |

Les 18 sprites de camps (`map/camps/`, section « Camps barbares de la carte ») restent la pièce principale.

## S15. Fiches d'information

Les fiches de bâtiments montrent les trois paliers du bâtiment (`buildings/<CIV>/<CLÉ>`, `_t1`, `_t3`), les fiches d'unités la
figurine en pied (`figures/<CLASSE>_<CIV>`) et le jeton (`busts/`), la fiche d'une technologie son icône (§ S8). Tout cela
existe en rendu 3D ; ce qui manque pour les fiches est donc la version peinte de ces images (`docs/A-GENERER.md` étapes 1,
6 et 12), plus les icônes de technologies (§ S8), le portrait du colon (§ S12) et les chefs de tribu (§ S14).

## S16. Ville fidèle à sa civilisation : ornements de plaza, douves (`props/plaza_<CIV>_<statue|fountain|stall>.png` × 18, `walls/<CIV>/moat_<seg_x|seg_z|corner>.png` × 18)

Autour du Bâtiment principal, trois ornements par civilisation (statue sur socle, fontaine ou puits, étal de marché à auvent)
dans son architecture ; cadre prop 512×768. Les douves (bâtiment Douves) : tronçons diagonaux coupés net aux deux bouts et
angle, eau calme bordée de pierre, même cadrage que l'enceinte ; à brancher dans la scène à la livraison. Les villageois
(A1) et les ouvriers (A3) sont déjà par civilisation ; les gens des champs (A12) et les animaux (A13) restent communs.

## S17. Fiches d'unité : une figurine et un jeton par unité (`figures/units/<CLÉ>.png` × 60, `busts/units/<CLÉ>.png` × 60)

Aujourd'hui une fiche d'unité montre la figurine de sa classe (fantassin, archer, cavalier, siège) aux couleurs de sa
civilisation. Avec ces images, chaque unité a la sienne (déjà branché : fiche, carte de recrutement, listes, rapports,
composition d'armée). Le prompt de chacune vient des données du jeu : nom, classe, palier (base : cuir, bois et toile ;
intermédiaire : bronze, cotte de mailles, cimier ; élite : armure ornée, plumes, dorures, cape) et coiffe de la
civilisation, plus sa description. Figurine 1024×1536 (cadre figure), jeton 1024×1024 (cadre bust) ; le kit donne la
figurine de la classe comme guide.

## S18. Carte : héros en tête d'armée, espion (`map/units/hero_<CIV>.png` × 6, `map/units/spy.png`)

Une armée menée par le héros prend le marqueur du héros de sa civilisation (à cheval devant deux soldats) ; une armée en
mission d'espionnage prend la silhouette encapuchonnée. Déjà branché (le serveur signale `hasHero`), cadre map 1024×1024.

## S19. Héros par palier de niveau (`heroes/<CIV>_t<2|3>.png` × 12, `heroes/<CIV>_bust_t<2|3>.png` × 12)

Le héros change d'allure aux niveaux 10 (palier 2 : armure aux garnitures de bronze et d'argent, cape plus longue) et 20
(palier 3 : armure dorée gravée, cape brodée, couronne de laurier ou sertie). Estrade 1024×1536, jeton 1024×1024 ; à brancher
à la livraison (écran du héros, cartes d'armée, choix de civilisation). Les trois poses d'attente (A10) restent au palier 1.

## S20. Inscription et bandeaux (`scenes/faction-<CIV>.png` × 6, `scenes/header-<army|research>.png` × 2)

Un paysage par civilisation derrière sa carte de choix (forum romain, oppidum gaulois, acropole, temple du Nil, campement
de la steppe, ville du désert), sans personnage au premier plan : déjà branché (fond de la carte, assombri). Deux bandeaux
d'écran manquants : Armée (troupe à la parade) et Recherche (bibliothèque et atelier). 1536×1024, cadre header.

## N3. Icône de l'application peinte (`store/icon-1024.png`, 1024×1024, opaque)

L'emblème 3D (casque et médaillon) reste la référence ; sa version peinte, même composition, sert d'icône de boutique et
d'écran d'accueil. Pas de texte.
