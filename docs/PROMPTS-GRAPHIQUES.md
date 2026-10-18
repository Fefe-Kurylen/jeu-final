# Bible graphique — prompts de tout l'univers visuel

Généré par `node tools/repaint/art-bible.cjs` depuis `tools/repaint/prompts.cjs` (ne pas éditer à la main).
Chaque image du jeu se décrit par : **style** (commun) + **consigne de cadrage** (commune, variante par palier) +
**composition** (par type d'image) + **sujet** (ci-dessous). Le kit complet (`node tools/repaint.cjs --kit=<dossier> --everything`)
fournit en plus, pour chaque image, le prompt assemblé prêt à coller (`prompts/…txt`, `PROMPTS.csv`) et l'image guide
(`guides/…webp`, le rendu 3D qui fixe l'angle et la position).

## 1. Règles communes

- **Référence de style** : `tools/repaint/style-ref.png` (marché égyptien peint). À donner à l'outil comme première image, à chaque fois.
- **Image guide** : le rendu 3D de l'élément (deuxième image). Sans guide, la phrase « Composition » du prompt suffit à placer le sujet.
- **Format** : PNG, fond transparent (sinon fond uni magenta #FF00FF ou vert #00FF00, détouré à l'import). Carré 1024×1024,
  sauf scènes : connexion portrait 1024×1536, paysage 1536×1024, estrades de héros 1024×1536, bandeaux et champ de bataille 1536×1024.
- **Nommage** : exactement le nom du guide, extension .png : `buildings/HUN/MAIN_HALL.png`, `buildings/HUN/MAIN_HALL_t1_snow.png`,
  `walls/GAUL/3_tower.png`, `map/terrain/forest_mountain_xy.png`, `busts/ARCHER_EGYPT.png`, `scenes/hero-ROME.png`, `terrain/grass.png`…
  (les noms plats `buildings__HUN__MAIN_HALL.png` sont acceptés).
- **Retour** : un dossier ou un zip, par lots si besoin → `node tools/repaint.cjs --import=<dossier>` recale et publie ; le reste garde le rendu 3D.
- **Lumière** : toujours en haut à gauche, ombre portée vers la droite. **Angle** : isométrique 2:1 vu de face à 30°, sauf figurines (trois-quarts), bustes et icônes (de face / légère plongée), habillage (de face).

### Style (début de chaque prompt)

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject.
```

Fond : `The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.`

### Consigne de cadrage (après le style)

Courant : `Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle, the same position in the frame, the same footprint, proportions and overall silhouette as the second image. Do not add anything outside its silhouette except small props at its base and a soft cast shadow to the right.`

Palier 1 : `Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle and the same position in the frame; the building is a smaller, humbler early version, so it may be simpler and lower than the guide, but it must stay centered on the same spot and fit inside the same footprint. Do not add anything outside the footprint except small props at its base and a soft cast shadow to the right.`

Palier 3 : `Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle and the same position and footprint in the frame; the building is a grander developed version, so it may be taller than the guide with an extra storey or a tower, but it must keep the same footprint and the same position. Do not add anything outside the footprint except small props at its base and a soft cast shadow to the right.`

### Composition par type d'image

| Type | Images concernées | Composition |
|---|---|---|
| building | bâtiments, champs, parcelles, enceinte | Composition: square image. The building stands on a square ground plot seen as a 2:1 diamond, centered horizontally; the diamond is about 51% of the image width, its center is at 73% of the image height and its bottom corner at 86%; the building rises from the plot toward the top and never goes outside the plot footprint. |
| prop | décors | Composition: square image, the prop centered horizontally, its base at 89% of the image height, about 60% of the width. |
| map | villes, ressources, relief de carte | Composition: square image, the subject on a small square ground plot seen as a 2:1 diamond centered horizontally, diamond width about 57% of the image, center at 77% of the height. |
| mapunit | armées en marche sur la carte | Composition: square image, the marching figures centered, feet at about 77% of the image height, overall height about 45% of the image. |
| figure | figurines des unités | Composition: square image, a full-body character centered, feet at 90% of the image height, head near 12%, three-quarter view slightly from above, facing the viewer's right. |
| bust | jetons (bustes) des unités et des héros | Composition: square image, head and shoulders filling about 80% of the frame, centered, slightly turned to the right. |
| icon | icônes et emblème | Composition: square image, a single object centered filling about 70% of the frame, three-quarter view from slightly above. |
| ui | boutons, cadres, plaques, barres | Composition: the element fills the whole square image edge to edge, front view, no perspective. |
| stage | héros sur estrade | Composition: portrait image (2:3), the hero centered, feet at 90% of the height, standing on a round platform, banners and torches behind. |
| header | bandeaux d'écran | Composition: wide image, the scene centered, ground at 70% of the height, nothing cut at the edges. |
| scene | panoramas de connexion, champ de bataille | Composition: the panorama fills the whole image, isometric view from the front at 30 degrees, sky transparent above the island. |

## 2. Inventaire

| Catégorie | Fichiers | Détail |
|---|---|---|
| buildings | 1404 | 39 bâtiments × 6 civilisations × 3 paliers (courant, _t1, _t3) × 2 (normal, _snow) |
| fields | 36 | 4 types × 3 paliers × 3 biomes |
| plots | 6 | 3 biomes × 2 variantes |
| props | 14 | décors de scène + volutes de fumée + ondes |
| map | 86 | villes (6 + capitales + défaut), ressources × biomes, relief (isolé, _x, _y, _xy), unités en marche |
| walls | 180 | 6 civilisations × 3 paliers × (2 courtines hautes, 2 murets, 1 tour) × neige |
| figures | 24 | 4 classes × 6 civilisations |
| busts | 28 | jetons : 4 classes × (neutre + 6 civilisations) |
| heroes | 12 | 6 héros sur estrade + 6 bustes |
| scenes | 14 | connexion (portrait, paysage), 6 estrades de héros, 5 bandeaux, champ de bataille |
| icons | 61 | icônes d'interface et objets |
| uiframes | 15 | boutons (5 couleurs × normal/enfoncé), cadres, plaques, barre |
| effects / flags | 72 | fumée et ondes (4 phases), drapeaux (8 phases × 8 couleurs) — animés, restent en rendu 3D |
| terrain | 4 | textures de sol répétables : grass, dirt, sand, snow (sans guide) |
| logo | 1 | emblème (médaillon) |

## 3. Sujets

### Civilisations (ajouté à chaque bâtiment, mur, figurine)

| Clé | Architecture |
|---|---|
| ROME | Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae |
| GAUL | Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels |
| GREEK | Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae |
| EGYPT | Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks |
| HUN | Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires |
| SULTAN | Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns |

### Coiffes des unités et héros par civilisation

| Clé | Coiffe |
|---|---|
| ROME | Roman legionary helmet with a red crest |
| GAUL | horned helmet and long hair |
| GREEK | golden Corinthian helmet with a blue crest |
| EGYPT | striped nemes headdress with a gold band |
| HUN | fur-trimmed pointed felt cap |
| SULTAN | white turban with a gem |

### Les 39 bâtiments (`buildings/<CIV>/<CLÉ>[_t1|_t3][_snow].png`)

| Clé | Sujet |
|---|---|
| MAIN_HALL | the main hall, the seat of power of the city, with a banner on top |
| BARRACKS | a military barracks with a training yard, weapon racks and a banner |
| STABLE | a horse stable with hay bales and a horse |
| WORKSHOP | a siege workshop with catapult parts, gears and a smoking chimney |
| ACADEMY | an academy with columns and scrolls |
| FORGE | a blacksmith forge with a smoking chimney, an anvil and glowing embers |
| HIDEOUT | a hidden underground cache: a grassy mound with a small wooden trapdoor and bushes |
| HEALING_TENT | a field hospital tent with a red cross banner |
| MARKET | a market stall with a striped awning, crates, pots, baskets of goods and a scale |
| WALL | a fortified city gate with two towers, torches and a heavy wooden door |
| MOAT | a ring-shaped moat filled with water around a small grassy island with a wooden footbridge |
| MILL | a windmill with four sails |
| BAKERY | a bakery with a stone oven, a smoking chimney and loaves of bread |
| GREAT_SILO | two tall grain silos side by side |
| SILO | a round grain silo |
| WAREHOUSE | a goods warehouse with crates and barrels at the door |
| GREAT_WAREHOUSE | a large storehouse with crates and barrels |
| GREAT_BARRACKS | a large barracks with two banners |
| GREAT_STABLE | a large stable with horses |
| EMBASSY | an embassy with two different banners |
| TREASURE_CHAMBER | a fortified treasure chamber in dark stone with torches and a heavy door |
| HERO_MANSION | the hero's mansion with a tower and a banner |
| WATCHTOWER | a tall watchtower with a lookout platform and a torch |
| FOUNDRY | a foundry with two furnace chimneys |
| STONEMASON | a stonemason's yard with cut stone blocks and tools |
| SAWMILL | a sawmill with stacked logs and a saw |
| RESIDENCE | a comfortable residence house with a garden |
| TRADE_OFFICE | a trade office with caravan goods, sacks and a cart |
| ROMAN_THERMAE | Roman baths with a pool of blue water and columns |
| GALLIC_BREWERY | a Gallic brewery with barrels and a smoking chimney |
| GREEK_TEMPLE | a Greek temple with fluted columns and a pediment |
| EGYPTIAN_IRRIGATION | irrigation channels of blue water crossing green crops, with a shaduf |
| HUN_WAR_TENT | a large war tent with a banner, spears and a campfire |
| SULTAN_DESERT_OUTPOST | a desert outpost with a minaret, a small dome and a palm tree |
| FARM | a wheat farm plot with golden crop rows |
| LUMBER | a lumber camp with trees and stacked logs |
| QUARRY | a stone quarry with big rocks |
| IRON_MINE | an iron mine entrance dug into a rock wall with a mine cart |
| RALLY_POINT | a military rally point: a tall flag on a paved square with torches and shields |

Paliers : **_t1** (niveaux 1-6) « at an early stage of development, small and simple », version niveau 1 de jeu mobile (hutte basse de bois, sans ornement) ;
courant (7-13) ; **_t3** (14-20) version niveau max (étage ou tour en plus, marbre, or, bannières, esplanade). **_snow** : tout est enneigé.

### Champs (`fields/<biome>/<TYPE>_<1|2|3>.png`) et parcelles (`plots/<biome>_<0|1>.png`)

| Type | Sujet |
|---|---|
| FARM | a wheat farm with golden crop rows |
| LUMBER | a lumber camp with trees and stacked logs |
| QUARRY | a stone quarry with big grey rocks |
| IRON_MINE | an iron mine entrance dug into a rock wall with a mine cart |

| Palier | Développement |
|---|---|
| 1 | at an early stage of development, small and simple |
| 2 | at a middle stage of development, with a fence and more equipment |
| 3 | fully developed, with a small hut and plenty of equipment |

| Biome | Sol |
|---|---|
| forest | on a green grass plot |
| desert | on a sandy desert plot |
| snow | on a snow-covered plot, with snow on every top surface |

Parcelle vide : dalle carrée arrondie d'herbe / de sable / de neige, quelques touffes, cailloux ou congères, rien de construit.

### Décors (`props/<nom>.png`)

| Nom | Sujet |
|---|---|
| scroll_research | a large unrolled parchment scroll with a quill, standing upright like a signpost, glowing softly (marker of a research in progress above the Academy) |
| pine | a single pine tree |
| pine2 | a single light-green pine tree |
| oak | a single round leafy oak tree |
| oak2 | a single light-green leafy tree |
| bush | a small bush |
| rock | a grey boulder |
| rock2 | two grey boulders |
| palm | a single palm tree |
| cactus | a single cactus |
| dune | a low sand dune |
| snowpine | a single pine tree covered with snow |
| snowrock | a grey boulder capped with snow |
| stump | a tree stump |
| flowers | a small flowering bush |

Fumée : `props/puff_0..3.png` — une volute de fumée gris pâle, ronde et duveteuse, bords doux, vue de face, rien d'autre.

### Carte du monde (`map/…`)

Villes (`map/cities/<nom>.png`) :

| Nom | Sujet |
|---|---|
| rome | a small Roman town icon for a world map: a few terracotta-roofed houses, a columned hall and a red banner |
| gaul | a small Gallic village icon for a world map: thatched huts and a green banner |
| greek | a small Greek town icon for a world map: marble buildings with blue roofs and a blue banner |
| egypt | a small Egyptian town icon for a world map: sandstone buildings with flat roofs and a teal banner |
| hun | a small Hunnic camp icon for a world map: felt yurts with conical roofs and a red banner |
| sultan | a small Sultanate town icon for a world map: whitewashed houses with a teal dome and a minaret |
| capital | a fortified capital icon for a world map: walls with corner towers around a columned palace, Roman style, a red banner |
| default | a small generic ancient town icon for a world map: a few stone houses with terracotta roofs |
| capital_rome | a fortified capital icon for a world map: walls with corner towers around a palace, Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae |
| capital_gaul | a fortified capital icon for a world map: walls with corner towers around a palace, Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels |
| capital_greek | a fortified capital icon for a world map: walls with corner towers around a palace, Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae |
| capital_egypt | a fortified capital icon for a world map: walls with corner towers around a palace, Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks |
| capital_hun | a fortified capital icon for a world map: walls with corner towers around a palace, Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires |
| capital_sultan | a fortified capital icon for a world map: walls with corner towers around a palace, Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns |
| colony_rome | a small newly founded colony village: Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around |
| colony_gaul | a small newly founded colony village: Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around |
| colony_greek | a small newly founded colony village: Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around |
| colony_egypt | a small newly founded colony village: Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around |
| colony_hun | a small newly founded colony village: Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around |
| colony_sultan | a small newly founded colony village: Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around |

Ressources (`map/resources/<res>[_desert|_snow].png`) :

| Ressource | Sujet |
|---|---|
| wood | a forest clearing with trees and a cut log |
| stone | a group of grey boulders |
| iron | an iron mine entrance in a rock wall with a mine cart |
| food | a fenced wheat field |
| gold | rocks with glittering gold nuggets |

Camps barbares (`map/camps/<camp1|camp2|camp3|ruins>[_desert|_snow].png`, `map/camps/banner_<CIV>.png`) — la tribu qui tient un point de ressource, ses ruines après la défaite, sa bannière :

| Nom | Sujet |
|---|---|
| camp1 | a small barbarian camp: two hide tents around a campfire, a wooden totem topped with a skull, a few crude spears planted in the ground |
| camp2 | a palisaded barbarian camp: a ring of sharpened log stakes with a gate, several hide tents, a wooden watchtower, a campfire and a tall banner |
| camp3 | a barbarian wooden fort: a tall log palisade with two corner towers and a gate, a longhouse with a thatched roof inside, skull totems, several banners and a smoking fire |
| ruins | the burnt remains of a barbarian camp: charred stakes, a collapsed tent, a broken totem, embers and a thin wisp of smoke |
| foundation | a settlers' camp where a new city is being founded: three canvas tents, a covered ox-wagon, wooden stakes and rope marking the future walls, a dug trench, piles of logs and stones, a small campfire and a banner pole |

| Variante | Ajout au sujet |
|---|---|
| desert | , desert variant standing on sand with a palm tree and red rocks |
| snow | , snowy variant with snow on the tents and roofs and snow drifts around |

Relief (`map/terrain/<nom>.png`) — les variantes _x, _y s'allongent en diagonale comme le guide, _xy est un massif / un lac large :

| Nom | Sujet |
|---|---|
| forest_tree | a small cluster of leafy trees and pines with bushes |
| forest_mountain | a rugged rocky mountain with a snowy peak, boulders and a few trees at its foot |
| forest_mountain_x | a long rugged mountain ridge with several rocky peaks and snow caps, running diagonally exactly like the guide, boulders and trees at its foot |
| forest_mountain_y | a long rugged mountain ridge with several rocky peaks and snow caps, running diagonally exactly like the guide, boulders and trees at its foot |
| forest_mountain_xy | a rugged mountain massif with several rocky peaks and snow caps, boulders and trees at its foot |
| desert_dunes | two golden sand dunes with wind ripples |
| desert_dunes_x | a long line of golden sand dunes with wind ripples, running diagonally like the guide |
| desert_dunes_y | a long line of golden sand dunes with wind ripples, running diagonally like the guide |
| desert_dunes_xy | a field of several golden sand dunes with wind ripples |
| desert_ruins | ancient sandstone ruins: broken columns, fallen blocks and a sand-covered pedestal |
| desert_rocks | red desert rocks and a cactus |
| snow_snowtree | snow-covered pine trees and a snowy rock |
| snow_icemountain | a steep icy mountain covered with snow and blue ice, snowy boulders at its foot |
| snow_icemountain_x | a long icy mountain ridge with several snow-covered peaks, running diagonally like the guide, snowy boulders at its foot |
| snow_icemountain_y | a long icy mountain ridge with several snow-covered peaks, running diagonally like the guide, snowy boulders at its foot |
| snow_icemountain_xy | an icy mountain massif with several snow-covered peaks and blue ice, snowy boulders at its foot |
| water | a round pond of clear blue water with a sandy shore, reeds and lily pads |
| water_x | an elongated lake of clear blue water with a sandy shore, reeds and lily pads, stretched diagonally like the guide |
| water_y | an elongated lake of clear blue water with a sandy shore, reeds and lily pads, stretched diagonally like the guide |
| water_xy | a wide lake of clear blue water with a sandy shore, reeds and lily pads |
| frozen | a round frozen pond: pale blue cracked ice with snow drifts and a snowy shore |
| frozen_x | an elongated frozen lake: pale blue cracked ice with snow drifts and a snowy shore, stretched diagonally like the guide |
| frozen_y | an elongated frozen lake: pale blue cracked ice with snow drifts and a snowy shore, stretched diagonally like the guide |
| frozen_xy | a wide frozen lake: pale blue cracked ice with snow drifts and a snowy shore |
| oasis | a desert oasis: a round pond of blue water ringed with green grass, two palm trees and rocks |
| oasis_x | an elongated desert oasis: a lake of blue water ringed with green grass, palm trees and rocks, stretched diagonally like the guide |
| oasis_y | an elongated desert oasis: a lake of blue water ringed with green grass, palm trees and rocks, stretched diagonally like the guide |
| oasis_xy | a wide desert oasis: a lake of blue water ringed with green grass, palm trees and rocks |

Armées en marche (`map/units/<hoplite|archer|cavalry|catapult>[_<CIV>].png`, `map/units/merchant.png`, `map/units/settler[_<CIV>].png` : cortège de colons, chariot bâché et famille à pied) : petit marqueur de carte, deux fantassins / archers, un cavalier, un servant et sa catapulte, aux couleurs et coiffe de la civilisation, marchant vers le bas-droite ; marchand : charrette de caisses tirée par un cheval.

### Chantiers (`buildings/<CIV>/<CLÉ>_site.png`, `fields/<biome>/<TYPE>_site.png`, `walls/<CIV>/site_<seg_x|seg_z|tower>.png`, `props/scaffold_<CIV>_<1|2|3>.png`, `props/worker_<CIV>_<0..3>.png`)

Un chantier garde l'emprise et la silhouette du bâtiment fini (son rendu sert de guide), à moitié construit, avec les techniques de sa civilisation (`docs/GRAPHISMES-MANQUANTS.md` § 1) :

| Civilisation | Chantier (ajouté au sujet du bâtiment) |
|---|---|
| ROME | a Roman building site: a timber scaffold of lashed poles and planks resting in putlog holes, a treadwheel crane (polyspastos) lifting a stone block on a rope, brick-faced concrete walls (opus testaceum) half raised, wooden centering under an arch, troughs of lime mortar, a surveyor's groma, stacks of terracotta tiles and ashlar blocks |
| GAUL | a Gallic building site: a frame of oak posts and horizontal beams (murus gallicus lacing) half raised, wattle panels being daubed with clay, a roof lattice waiting for its thatch, bundles of reed thatch, ladders and lashed poles instead of a scaffold, adzes, baskets of earth and rubble, no crane |
| GREEK | a Greek building site: a wooden derrick crane with a pulley hoisting a marble drum by its lewis iron, column drums stacked and waiting, a wooden scaffold of poles and planks, masons' chisels and mallets, stone blocks with their bosses still unfinished, a half-raised marble wall with iron clamps, terracotta roof tiles |
| EGYPT | an Egyptian building site: a sloping ramp of mud and rubble up to the half-raised sandstone and mud-brick walls, a stone block on a wooden sledge pulled with ropes over wetted silt, wooden levers and rocking cradles, light reed scaffolding only for the plasterers, copper chisels, plumb-bob and square, no crane, baskets of mud bricks drying in the sun |
| HUN | a Hunnic steppe building site: a round timber lattice frame being raised and tied with leather straps, felt and hide panels half laid over it, a palisade of sharpened logs being planted, carts loaded with poles and rolled felt, ropes and stakes, a horse tethered nearby, no masonry, no crane |
| SULTAN | a Sultanate building site: fired-brick walls half raised with lime mortar, a wooden centering supporting a pointed arch, a scaffold of palm trunks lashed with rope, a rope-and-pulley hoist, stacks of glazed teal tiles and stucco panels waiting, mortar troughs, a dome on wooden formwork |

| Civilisation | Échafaudage générique |
|---|---|
| ROME | a Roman timber scaffold: upright poles and horizontal putlogs lashed with rope, plank walkways, a small treadwheel crane on top with a rope and pulley |
| GAUL | a Gallic scaffold of rough lashed poles and wicker hurdles, oak ladders leaning on it, bundles of thatch and a basket of clay |
| GREEK | a Greek scaffold of straight poles and planks with a wooden derrick and pulley hoisting a marble block |
| EGYPT | an Egyptian earthen ramp with a wooden sledge and ropes, light reed scaffolding, baskets of mud bricks |
| HUN | a Hunnic timber frame of poles tied with leather straps, rolled felt and hides, ropes and stakes, a cart of poles |
| SULTAN | a Sultanate scaffold of palm trunks lashed with rope, a pulley, a wooden arch centering, stacks of fired bricks and glazed tiles |

| Taille | Ajout |
|---|---|
| 1 | small, one storey high |
| 2 | medium, two storeys high |
| 3 | large, three storeys high |

| Civilisation | Ouvrier |
|---|---|
| ROME | a Roman builder in a short belted wool tunic and sandals |
| GAUL | a Gallic builder with long hair and a moustache, checked wool braies and a leather belt |
| GREEK | a Greek builder in a short chiton pinned at one shoulder and a felt cap |
| EGYPT | an Egyptian builder in a white linen shendyt kilt, shaved head, bare chest |
| HUN | a Hunnic builder in a belted caftan, trousers, boots and a fur-trimmed cap |
| SULTAN | a Sultanate builder in a striped robe with rolled sleeves and a turban |

| Champ | Chantier |
|---|---|
| FARM | the first furrows being ploughed with an ox-drawn ard, a farmer sowing, stakes marking the plot |
| LUMBER | freshly felled trees and stumps, an axeman at work, a first stack of logs and a cart |
| QUARRY | a first cut into the rock face, wedges and mallets, a few extracted blocks on rollers |
| IRON_MINE | a mine entrance being dug into the rock, timber props being set, baskets of ore and a pick |

Coiffes civiles (colons, chefs de tribu) : | Civilisation | Coiffe |
|---|---|
| ROME | a short Roman haircut and a wool tunic |
| GAUL | long braided hair, a moustache and a checked cloak |
| GREEK | curly hair with a headband and a chiton |
| EGYPT | a black wig with kohl-lined eyes and a linen collar |
| HUN | a fur-trimmed cap and a caftan |
| SULTAN | a turban and a striped robe |

### Enceinte (`walls/<CIV>/<1|2|3>_<seg_x|seg_z>[_low][_snow].png`, `walls/<CIV>/<1|2|3>_tower[_snow].png`)

| Civilisation | Courtine | Tour d'angle |
|---|---|---|
| ROME | ashlar stone curtain wall with battlements | round stone tower with a conical terracotta roof |
| GAUL | wooden palisade of sharpened logs with a plank walkway | wooden watchtower on log posts with a thatched roof |
| GREEK | white marble wall with a cornice | square marble tower with a blue slate hip roof |
| EGYPT | sandstone wall with merlons and a gold frieze | tapered sandstone pylon tower with merlons and a gold frieze |
| HUN | rough timber palisade with hides and shields | wooden watchtower with a felt conical roof |
| SULTAN | whitewashed plaster wall with battlements and small arches | round whitewashed tower topped by a small teal mosaic dome |

| Palier | État |
|---|---|
| 1 | early and simple |
| 2 | reinforced, with crenellations |
| 3 | fully developed, with crenellations, torches and banners |

Un tronçon est coupé net et droit aux deux bouts pour se raccorder à ses copies ; `_low` = muret à hauteur de genou (devant la ville).

### Unités et héros

Classes (`figures/<CLASSE>_<CIV>.png` en pied, `busts/<CLASSE>[_<CIV>].png` en jeton) :

| Classe | Sujet |
|---|---|
| INFANTRY | an infantry soldier with spear and round shield |
| ARCHER | an archer with a bow and a quiver |
| CAVALRY | a cavalryman riding a horse with a lance |
| SIEGE | a siege engineer standing next to a catapult |
| SETTLER | a settler villager carrying a bundle on a stick over the shoulder and holding a wooden stake with a small flag |
| TRIBE | a fierce chieftain of a local tribe with a painted face, a fur cloak and a necklace of teeth |

Héros (`heroes/<CIV>.png` sur estrade, `heroes/<CIV>_bust.png` en jeton) : héros de la civilisation avec sa coiffe, cape, épée et bouclier rond, sur un socle de pierre rond.

### Scènes (`scenes/<nom>.png`)

| Nom | Sujet |
|---|---|
| auth-portrait | a lush floating island diorama seen in isometric view, with fifteen buildings of six ancient civilisations (Roman, Gallic, Greek, Egyptian, Hunnic, Sultanate) on grass plots along dirt roads, trees and rocks around the edge, a brown earth cliff under the island |
| auth-landscape | a lush floating island diorama seen in isometric view, wide format, with fifteen buildings of six ancient civilisations on grass plots along dirt roads, trees and rocks around the edge, a brown earth cliff under the island |
| battlefield | a wide grassy battlefield seen in isometric view with a dirt road crossing it diagonally, a few trees and rocks |
| header-market | a market stall with a red awning, crates, barrels, sacks and amphorae |
| header-alliance | a sandstone wall with three colored banners, shields and torches |
| header-ranking | a three-step stone podium with a golden trophy on top and two banners |
| header-inventory | an open wooden treasure chest full of gold coins, with an amphora, a spear and a shield |
| header-reports | an unrolled parchment scroll with a quill, an ink pot and a torch |
| hero-ROME | a rome hero with Roman legionary helmet with a red crest, cape, sword and round shield standing on a round paved stone platform, with two torches and two banners of the faction behind him, three-quarter view |
| hero-GAUL | a gaul hero with horned helmet and long hair, cape, sword and round shield standing on a round paved stone platform, with two torches and two banners of the faction behind him, three-quarter view |
| hero-GREEK | a greek hero with golden Corinthian helmet with a blue crest, cape, sword and round shield standing on a round paved stone platform, with two torches and two banners of the faction behind him, three-quarter view |
| hero-EGYPT | a egypt hero with striped nemes headdress with a gold band, cape, sword and round shield standing on a round paved stone platform, with two torches and two banners of the faction behind him, three-quarter view |
| hero-HUN | a hun hero with fur-trimmed pointed felt cap, cape, sword and round shield standing on a round paved stone platform, with two torches and two banners of the faction behind him, three-quarter view |
| hero-SULTAN | a sultan hero with white turban with a gem, cape, sword and round shield standing on a round paved stone platform, with two torches and two banners of the faction behind him, three-quarter view |
| vignette-founding | a wide painted vignette of settlers founding a new city: a covered ox-wagon being unloaded, a man planting a wooden stake with a small flag, tents, stakes and rope marking the future walls, a priest pouring a libation, green hills at dawn |
| vignette-tribe-forest | a wide painted vignette of a local tribe camp in a forest clearing: round huts with thatched roofs, a palisade of stakes, a totem pole with a skull, warriors with painted faces around a campfire, smoke, late afternoon light |
| vignette-tribe-desert | a wide painted vignette of a local tribe camp among dunes and red rocks: hide tents, a palm tree, camels, warriors with turbans and spears around a fire, a totem with a skull, dusk light |
| vignette-tribe-snow | a wide painted vignette of a local tribe camp in a snowy pine forest: fur-covered huts, a frozen stream, warriors in furs around a fire, smoke rising, a totem with a skull, pale winter light |

### Icônes (`ui/<nom>.png`) — un seul objet centré, lisible en petit

| Nom | Sujet |
|---|---|
| tech_AGRONOMY | a sheaf of golden wheat crossed with a wooden plough (technology: Agronomy) |
| tech_ENGINEERING | a wooden crane with a stone block on a rope and a set square (technology: Engineering) |
| tech_TRAINING | two crossed wooden training swords over a round shield (technology: Training) |
| tech_TACTICS | an unrolled parchment with a battle plan drawn on it and a small bronze arrow marker (technology: Art of war) |
| tech_DISCIPLINE | a row of three overlapping round shields forming a wall (technology: Discipline) |
| tech_MEDICINE | a clay bowl with green herbs and a rolled linen bandage (technology: Medicine) |
| tech_CARTOGRAPHY | a rolled map with a compass rose and a small horse figure (technology: Cartography) |
| tech_SUPPLY | a stack of grain sacks and a wooden barrel (technology: Supply) |
| branch_ECONOMY | a sheaf of wheat and a pile of coins (research branch: economy) |
| branch_MILITARY | a bronze sword and a spear crossed (research branch: military) |
| branch_DEFENSE | a tower shield with a crenellated wall behind (research branch: defense) |
| branch_LOGISTICS | a loaded cart wheel and a signpost (research branch: logistics) |
| settler | a villager walking with a bundle on a stick over the shoulder and a wooden stake with a small flag in the other hand (settler founding a new city) |
| wood | a bundle of cut logs |
| stone | a block of grey stone |
| iron | a stack of iron ingots |
| food | a sheaf of golden wheat |
| gold | a pile of gold coins |
| population | two villagers side by side |
| build | a wooden mallet |
| army | two crossed swords |
| recruit | two crossed swords |
| city | a small house with a terracotta roof |
| fields | a small square plot of wheat |
| map | an unrolled parchment map on two wooden rods |
| reports | a parchment scroll |
| ranking | a golden trophy cup |
| inventory | a wooden treasure chest with brass fittings |
| hero | a golden Roman helmet with a red crest |
| alliance | two overlapping shields, one blue and one red |
| market | a brass balance scale |
| settings | an iron cogwheel |
| attack | a red shield with a crossed sword |
| defense | a blue shield with a golden boss |
| expedition | a brass compass rose |
| clock | an hourglass with golden sand |
| home | a small house |
| endurance | a red heart |
| stats | three bar-chart columns of bronze, gold and silver |
| spy | a magnifying glass |
| crown | a golden crown with red gems |
| player | a villager figure on a stone base |
| lock | a golden padlock |
| list | a clipboard with a parchment list |
| star | a golden five-pointed star |
| horse | a brown horse |
| medal | a gold medal on a red and blue ribbon |
| medal_silver | a silver medal on a red and blue ribbon |
| medal_bronze | a bronze medal on a red and blue ribbon |
| bolt | a golden lightning bolt |
| bow | a wooden bow with an arrow |
| rally | a red flag on a pole on a stone base |
| send | a parchment letter with a golden arrow |
| target | an archery target with an arrow |
| pin | a red map pin |
| skull | a bone skull |
| tree | a pine tree |
| amphora | a clay amphora |
| tools | a crossed hammer and pickaxe |
| tribe | a wooden totem pole topped with a skull and two crossed clubs (local tribe) |

Objets du héros (`ui/item_<clé>.png`) : iron_sword, steel_sword, bronze_helm, iron_helm, leather_armor, chain_mail, iron_boots, war_boots, gold_ring, war_amulet, wooden_shield, iron_shield, leather_pants, chain_legs, crate — l'objet seul, centré, vue trois-quarts.

### Habillage d'interface (`ui/…`)

Boutons (`ui/btn-<primary|secondary|danger|gold|info>[-pressed].png`, 1024 carré puis utilisés étirés) : plaque rectangulaire arrondie de face, couleur primary = bright green, secondary = warm brown leather, danger = deep red, gold = polished gold, info = royal blue, reflet doux en haut, liseré doré, contour sombre ; `-pressed` plus sombre et plat.

| Nom | Sujet |
|---|---|
| frame-panel | a square ornamental frame for a game panel: four straight edges of dark polished wood with brass studs, carved golden ornaments only in the four corners, and a completely empty transparent center (nothing inside the frame) |
| frame-modal | a square game window frame: a thin border of dark wood with golden corner ornaments and a plain, uniform, lightly aged parchment filling the entire inside; no title, no buttons, no decoration in the middle |
| plate-parchment | a plain rectangular plate of aged parchment with a thin dark-brown worn edge, uniform in the middle, no decoration, no text |
| plate-dark | a plain rectangular plate of dark worn leather with a thin brass edge, uniform in the middle, no decoration |
| bar-wood | a horizontal band of dark polished wooden planks with a thin golden rail along the top edge, uniform, no decoration |

### Textures de sol (`terrain/<grass|dirt|sand|snow>.png`, sans guide)

| Nom | Sujet |
|---|---|
| grass | a seamless, tileable top-down texture of lush painted meadow grass: soft green tufts, a few tiny flowers and pebbles |
| dirt | a seamless, tileable top-down texture of packed earth and dirt path: warm brown, small pebbles, faint cart tracks |
| sand | a seamless, tileable top-down texture of desert sand: pale ochre, gentle wind ripples, a few small stones |
| snow | a seamless, tileable top-down texture of fresh snow: white with soft blue shadows, light drifts and sparkles |
| grass_lawn | a seamless, tileable top-down texture of short well-kept green lawn, fine blades, a few tiny daisies |
| grass_dark | a seamless, tileable top-down texture of dense dark-green undergrowth with moss and small ferns |
| grass_dry | a seamless, tileable top-down texture of dry yellow-green summer grass with some bare earth |
| grass_flowers | a seamless, tileable top-down texture of meadow grass dotted with small red, white and yellow wildflowers |
| grass_hills | a seamless, tileable top-down texture of rolling meadow grass with lighter crests and darker hollows |
| dirt_packed | a seamless, tileable top-down texture of packed brown earth with small pebbles and faint footprints |
| mud | a seamless, tileable top-down texture of wet dark mud with shallow puddles reflecting the sky |
| gravel | a seamless, tileable top-down texture of small grey and beige gravel stones |
| sand_ripples | a seamless, tileable top-down texture of pale ochre desert sand with gentle wind ripples |
| sand_rocky | a seamless, tileable top-down texture of sand with scattered small dark stones and a few dry tufts |
| cracked_earth | a seamless, tileable top-down texture of dry cracked clay ground in warm ochre |
| snow_fresh | a seamless, tileable top-down texture of fresh untouched snow, soft blue shadows, a few sparkles |
| snow_trampled | a seamless, tileable top-down texture of trampled grey-white snow with footprints and dirt showing through |
| tundra | a seamless, tileable top-down texture of frosted short grass and frozen earth, white edges on the blades |
| water_lake | a seamless, tileable top-down texture of calm clear blue lake water, soft ripples, a few light reflections |
| water_deep | a seamless, tileable top-down texture of deep dark-blue water with slow swells |
| water_river | a seamless, tileable top-down texture of flowing water with diagonal streaks and small white foam lines |
| water_shallow | a seamless, tileable top-down texture of shallow turquoise water with a sandy bottom visible |
| ice | a seamless, tileable top-down texture of pale blue cracked ice with white frost lines |
| plaza_ROME | a seamless, tileable top-down texture of large pale sandstone flagstones with thin dark joints and a faint mosaic meander border |
| plaza_GAUL | a seamless, tileable top-down texture of rough wooden planks and packed earth with straw |
| plaza_GREEK | a seamless, tileable top-down texture of white marble slabs with grey veins and thin joints |
| plaza_EGYPT | a seamless, tileable top-down texture of golden sandstone tiles with a few carved hieroglyph bands |
| plaza_HUN | a seamless, tileable top-down texture of trampled dark earth with hoof prints and scattered straw |
| plaza_SULTAN | a seamless, tileable top-down texture of teal, white and gold geometric mosaic tiles |
| cobble | a seamless, tileable top-down texture of worn rounded cobblestones in warm beige and grey, thin dark joints, tufts of grass in the cracks |
| flagstone | a seamless, tileable top-down texture of irregular flat grey flagstones with moss in the joints |
| road_dirt | a seamless, tileable top-down texture of a packed dirt road with two cart ruts and grass at the sides, the road running vertically |
| road_paved | a seamless, tileable top-down texture of an ancient paved road of large basalt stones, the road running vertically |
| path_sand | a seamless, tileable top-down texture of a sandy trail with camel tracks, the trail running vertically |
| soil_tilled | a seamless, tileable top-down texture of tilled brown soil in straight furrows |
| wheat | a seamless, tileable top-down texture of golden ripe wheat seen from above in neat rows |
| orchard | a seamless, tileable top-down texture of green grass with rows of small round tree crowns |

### Emblème (`logo/medallion.png`)

Casque de légionnaire doré à cimier rouge en vue trois-quarts, dans un médaillon de bronze cerclé d'or encadré de deux branches de laurier dorées ; de face, centré, fond transparent.

## 4. Exemples de prompts assemblés

Bâtiment principal hun, palier courant :
```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle, the same position in the frame, the same footprint, proportions and overall silhouette as the second image. Do not add anything outside its silhouette except small props at its base and a soft cast shadow to the right.

Composition: square image. The building stands on a square ground plot seen as a 2:1 diamond, centered horizontally; the diamond is about 51% of the image width, its center is at 73% of the image height and its bottom corner at 86%; the building rises from the plot toward the top and never goes outside the plot footprint.

Subject: the main hall, the seat of power of the city, with a banner on top. Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires.
```

Caserne gauloise, palier 1, enneigée :
```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle and the same position in the frame; the building is a smaller, humbler early version, so it may be simpler and lower than the guide, but it must stay centered on the same spot and fit inside the same footprint. Do not add anything outside the footprint except small props at its base and a soft cast shadow to the right.

Composition: square image. The building stands on a square ground plot seen as a 2:1 diamond, centered horizontally; the diamond is about 51% of the image width, its center is at 73% of the image height and its bottom corner at 86%; the building rises from the plot toward the top and never goes outside the plot footprint.

Subject: a military barracks with a training yard, weapon racks and a banner. Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels. This is the LEVEL 1 version of the building, as in a mobile strategy game where buildings evolve with their level: noticeably smaller and humbler, a single low storey of rough timber, wattle and plain plaster, a simple thatched or wooden-shingle roof, no decoration, a few crates, barrels or tools around, slightly worn. Everything is covered with a layer of snow: snow on the roofs, ledges and ground.
```

Chaîne de montagnes (variante _xy) :
```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle, the same position in the frame, the same footprint, proportions and overall silhouette as the second image. Do not add anything outside its silhouette except small props at its base and a soft cast shadow to the right.

Composition: square image, the subject on a small square ground plot seen as a 2:1 diamond centered horizontally, diamond width about 57% of the image, center at 77% of the height.

Subject: a world-map terrain icon: a rugged mountain massif with several rocky peaks and snow caps, boulders and trees at its foot
```

Figurine de cavalerie sultane :
```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle, the same position in the frame, the same footprint, proportions and overall silhouette as the second image. Do not add anything outside its silhouette except small props at its base and a soft cast shadow to the right.

Composition: square image, a full-body character centered, feet at 90% of the image height, head near 12%, three-quarter view slightly from above, facing the viewer's right.

Subject: a full-body character sprite in three-quarter view: a cavalryman riding a horse with a lance, sultan faction with white turban with a gem and Sultanate colors, standing on a small round base
```

Jeton d'archer égyptien :
```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle, the same position in the frame, the same footprint, proportions and overall silhouette as the second image. Do not add anything outside its silhouette except small props at its base and a soft cast shadow to the right.

Composition: square image, head and shoulders filling about 80% of the frame, centered, slightly turned to the right.

Subject: a round token portrait, head and shoulders, of an archer with a bow and a quiver, egypt faction with striped nemes headdress with a gold band, with a small class emblem (bow and arrow) on a dark round badge by the shoulder
```

Texture d'herbe :
```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left.  a seamless, tileable top-down texture of lush painted meadow grass: soft green tufts, a few tiny flowers and pebbles. Perfectly uniform lighting, no vignette, no border, no object larger than a pebble, no text. The texture must tile seamlessly: the left edge continues the right edge and the top edge continues the bottom edge. Square image, opaque.
```

