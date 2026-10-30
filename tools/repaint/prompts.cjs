// ============================================================================
// prompts.cjs — texte des demandes de repeinture : style de référence + grammaire architecturale par faction
// + description de chaque sujet (bâtiment, champ, parcelle, décor, icône de carte, figurine, scène)
// ============================================================================
const fs = require('fs'); const path = require('path');
let UNITS = [];
try { const uj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'units.json'), 'utf8')); UNITS = Array.isArray(uj) ? uj : (uj.units || []); } catch (e) { UNITS = []; }
const STYLE = 'Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject.';
const BG = {
  transparent: 'The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.',
  magenta: 'The background must be a perfectly flat, uniform, pure magenta color (#FF00FF) everywhere around the subject: no vignette, no glow, no gradient, no texture, no shadow on the magenta except the subject\'s own small cast shadow on the right.',
  white: 'The background must be a perfectly flat, uniform, pure white (#FFFFFF) everywhere around the subject: no vignette, no glow, no gradient, no texture.'
};
const KEEP = 'Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle, the same position in the frame, the same footprint, proportions and overall silhouette as the second image. Do not add anything outside its silhouette except small props at its base and a soft cast shadow to the right.';
const FACTION = {
  ROME: 'Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae',
  GAUL: 'Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels',
  GREEK: 'Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae',
  EGYPT: 'Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks',
  HUN: 'Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires',
  SULTAN: 'Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns'
};
const BUILDING = {
  MAIN_HALL: 'the main hall, the seat of power of the city, with a banner on top', BARRACKS: 'a military barracks with a training yard, weapon racks and a banner', STABLE: 'a horse stable with hay bales and a horse', WORKSHOP: 'a siege workshop with catapult parts, gears and a smoking chimney', ACADEMY: 'an academy with columns and scrolls', FORGE: 'a blacksmith forge with a smoking chimney, an anvil and glowing embers', HIDEOUT: 'a hidden underground cache: a grassy mound with a small wooden trapdoor and bushes', HEALING_TENT: 'a field hospital tent with a red cross banner', MARKET: 'a market stall with a striped awning, crates, pots, baskets of goods and a scale', WALL: 'a fortified city gate with two towers, torches and a heavy wooden door', MILL: 'a windmill with four sails', BAKERY: 'a bakery with a stone oven, a smoking chimney and loaves of bread', GREAT_SILO: 'two tall grain silos side by side', SILO: 'a round grain silo', WAREHOUSE: 'a goods warehouse with crates and barrels at the door', GREAT_WAREHOUSE: 'a large storehouse with crates and barrels', GREAT_BARRACKS: 'a large barracks with two banners', GREAT_STABLE: 'a large stable with horses', EMBASSY: 'an embassy with two different banners', TREASURE_CHAMBER: 'a fortified treasure chamber in dark stone with torches and a heavy door', HERO_MANSION: 'the hero\'s mansion with a tower and a banner', WATCHTOWER: 'a tall watchtower with a lookout platform and a torch', FOUNDRY: 'a foundry with two furnace chimneys', STONEMASON: 'a stonemason\'s yard with cut stone blocks and tools', SAWMILL: 'a sawmill with stacked logs and a saw', RESIDENCE: 'a comfortable residence house with a garden', TRADE_OFFICE: 'a trade office with caravan goods, sacks and a cart', ROMAN_THERMAE: 'Roman baths with a pool of blue water and columns', GALLIC_BREWERY: 'a Gallic brewery with barrels and a smoking chimney', GREEK_TEMPLE: 'a Greek temple with fluted columns and a pediment', EGYPTIAN_IRRIGATION: 'irrigation channels of blue water crossing green crops, with a shaduf', HUN_WAR_TENT: 'a large war tent with a banner, spears and a campfire', SULTAN_DESERT_OUTPOST: 'a desert outpost with a minaret, a small dome and a palm tree', FARM: 'a wheat farm plot with golden crop rows', LUMBER: 'a lumber camp with trees and stacked logs', QUARRY: 'a stone quarry with big rocks', IRON_MINE: 'an iron mine entrance dug into a rock wall with a mine cart', RALLY_POINT: 'a military rally point: a tall flag on a paved square with torches and shields'
};
const FIELD = { FARM: 'a wheat farm with golden crop rows', LUMBER: 'a lumber camp with trees and stacked logs', QUARRY: 'a stone quarry with big grey rocks', IRON_MINE: 'an iron mine entrance dug into a rock wall with a mine cart' };
const TIER = { 1: 'at an early stage of development, small and simple', 2: 'at a middle stage of development, with a fence and more equipment', 3: 'fully developed, with a small hut and plenty of equipment' };
const BIOME = { forest: 'on a green grass plot', desert: 'on a sandy desert plot', snow: 'on a snow-covered plot, with snow on every top surface' };
const PROP = { scroll_research: 'a large unrolled parchment scroll with a quill, standing upright like a signpost, glowing softly (marker of a research in progress above the Academy)', pine: 'a single pine tree', pine2: 'a single light-green pine tree', oak: 'a single round leafy oak tree', oak2: 'a single light-green leafy tree', bush: 'a small bush', rock: 'a grey boulder', rock2: 'two grey boulders', palm: 'a single palm tree', cactus: 'a single cactus', dune: 'a low sand dune', snowpine: 'a single pine tree covered with snow', snowrock: 'a grey boulder capped with snow', stump: 'a tree stump', flowers: 'a small flowering bush' };
const MAP = {
  'cities/rome': 'a small Roman town icon for a world map: a few terracotta-roofed houses, a columned hall and a red banner', 'cities/gaul': 'a small Gallic village icon for a world map: thatched huts and a green banner', 'cities/greek': 'a small Greek town icon for a world map: marble buildings with blue roofs and a blue banner', 'cities/egypt': 'a small Egyptian town icon for a world map: sandstone buildings with flat roofs and a teal banner', 'cities/hun': 'a small Hunnic camp icon for a world map: felt yurts with conical roofs and a red banner', 'cities/sultan': 'a small Sultanate town icon for a world map: whitewashed houses with a teal dome and a minaret', 'cities/capital': 'a fortified capital icon for a world map: walls with corner towers around a columned palace, Roman style, a red banner', 'cities/default': 'a small generic ancient town icon for a world map: a few stone houses with terracotta roofs'
};
for (const f of ['rome', 'gaul', 'greek', 'egypt', 'hun', 'sultan']) MAP['cities/' + f + '_t2'] = `${MAP['cities/' + f].replace('a small ', 'a larger ').replace(' icon for a world map', ' icon for a world map, grown into a real town')}, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village of the guide and a fortified city)`;
for (const f of ['rome', 'gaul', 'greek', 'egypt', 'hun', 'sultan']) {
  const F = f.toUpperCase();
  MAP['cities/colony_' + f + '_fortified'] = `a fortified secondary city grown from a colony: ${FACTION[F]}, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital`;
}
// Ville assiégée sur la carte (octobre 2026) : le sprite de ville de chaque palier (village, ville, ville fortifiée) sous le siège
const SIEGE_TOWN = {
  1: (c) => `${MAP['cities/' + c.toLowerCase()]}, as a modest village (level 1 town)`,
  2: (c) => `${MAP['cities/' + c.toLowerCase() + '_t2']}`,
  3: (c) => `a fortified capital icon for a world map: walls with corner towers around a palace, ${FACTION[c]} (level 3 fortified city)`
};
for (const f of ['rome', 'gaul', 'greek', 'egypt', 'hun', 'sultan']) MAP['cities/capital_' + f] = `a fortified capital icon for a world map: walls with corner towers around a palace, ${FACTION[f.toUpperCase()]}`;
const RES = { wood: 'a forest clearing with trees and a cut log', stone: 'a group of grey boulders', iron: 'an iron mine entrance in a rock wall with a mine cart', food: 'a fenced wheat field', gold: 'rocks with glittering gold nuggets' };
// Camps barbares (tribus) sur la carte du monde : par niveau, variantes désert / neige, ruines après la défaite, bannière
const CAMP = {
  camp1: 'a small barbarian camp: two hide tents around a campfire, a wooden totem topped with a skull, a few crude spears planted in the ground',
  camp2: 'a palisaded barbarian camp: a ring of sharpened log stakes with a gate, several hide tents, a wooden watchtower, a campfire and a tall banner',
  camp3: 'a barbarian wooden fort: a tall log palisade with two corner towers and a gate, a longhouse with a thatched roof inside, skull totems, several banners and a smoking fire',
  ruins: 'the burnt remains of a barbarian camp: charred stakes, a collapsed tent, a broken totem, embers and a thin wisp of smoke'
};
const CAMP_BIOME = { desert: ', desert variant standing on sand with a palm tree and red rocks', snow: ', snowy variant with snow on the tents and roofs and snow drifts around' };
const TERRAIN = {
  forest_tree: 'a small cluster of leafy trees and pines with bushes', forest_mountain: 'a rugged rocky mountain with a snowy peak, boulders and a few trees at its foot',
  forest_mountain_x: 'a long rugged mountain ridge with several rocky peaks and snow caps, running diagonally exactly like the guide, boulders and trees at its foot', forest_mountain_y: 'a long rugged mountain ridge with several rocky peaks and snow caps, running diagonally exactly like the guide, boulders and trees at its foot', forest_mountain_xy: 'a rugged mountain massif with several rocky peaks and snow caps, boulders and trees at its foot',
  desert_dunes: 'two golden sand dunes with wind ripples', desert_dunes_x: 'a long line of golden sand dunes with wind ripples, running diagonally like the guide', desert_dunes_y: 'a long line of golden sand dunes with wind ripples, running diagonally like the guide', desert_dunes_xy: 'a field of several golden sand dunes with wind ripples',
  desert_ruins: 'ancient sandstone ruins: broken columns, fallen blocks and a sand-covered pedestal', desert_rocks: 'red desert rocks and a cactus',
  snow_snowtree: 'snow-covered pine trees and a snowy rock', snow_icemountain: 'a steep icy mountain covered with snow and blue ice, snowy boulders at its foot',
  snow_icemountain_x: 'a long icy mountain ridge with several snow-covered peaks, running diagonally like the guide, snowy boulders at its foot', snow_icemountain_y: 'a long icy mountain ridge with several snow-covered peaks, running diagonally like the guide, snowy boulders at its foot', snow_icemountain_xy: 'an icy mountain massif with several snow-covered peaks and blue ice, snowy boulders at its foot',
  water: 'a round pond of clear blue water with a sandy shore, reeds and lily pads', water_x: 'an elongated lake of clear blue water with a sandy shore, reeds and lily pads, stretched diagonally like the guide', water_y: 'an elongated lake of clear blue water with a sandy shore, reeds and lily pads, stretched diagonally like the guide', water_xy: 'a wide lake of clear blue water with a sandy shore, reeds and lily pads',
  frozen: 'a round frozen pond: pale blue cracked ice with snow drifts and a snowy shore', frozen_x: 'an elongated frozen lake: pale blue cracked ice with snow drifts and a snowy shore, stretched diagonally like the guide', frozen_y: 'an elongated frozen lake: pale blue cracked ice with snow drifts and a snowy shore, stretched diagonally like the guide', frozen_xy: 'a wide frozen lake: pale blue cracked ice with snow drifts and a snowy shore',
  oasis: 'a desert oasis: a round pond of blue water ringed with green grass, two palm trees and rocks', oasis_x: 'an elongated desert oasis: a lake of blue water ringed with green grass, palm trees and rocks, stretched diagonally like the guide', oasis_y: 'an elongated desert oasis: a lake of blue water ringed with green grass, palm trees and rocks, stretched diagonally like the guide', oasis_xy: 'a wide desert oasis: a lake of blue water ringed with green grass, palm trees and rocks'
};
const CLASS = { INFANTRY: 'an infantry soldier with spear and round shield', ARCHER: 'an archer with a bow and a quiver', CAVALRY: 'a cavalryman riding a horse with a lance', SIEGE: 'a siege engineer standing next to a catapult' };
const HEAD = { ROME: 'Roman legionary helmet with a red crest', GAUL: 'horned helmet and long hair', GREEK: 'golden Corinthian helmet with a blue crest', EGYPT: 'striped nemes headdress with a gold band', HUN: 'fur-trimmed pointed felt cap', SULTAN: 'white turban with a gem' };
const SCENE = {
  'auth-portrait': 'a lush floating island diorama seen in isometric view, with fifteen buildings of six ancient civilisations (Roman, Gallic, Greek, Egyptian, Hunnic, Sultanate) on grass plots along dirt roads, trees and rocks around the edge, a brown earth cliff under the island',
  'auth-landscape': 'a lush floating island diorama seen in isometric view, wide format, with fifteen buildings of six ancient civilisations on grass plots along dirt roads, trees and rocks around the edge, a brown earth cliff under the island',
  'battlefield': 'a wide grassy battlefield seen in isometric view with a dirt road crossing it diagonally, a few trees and rocks',
  'header-market': 'a market stall with a red awning, crates, barrels, sacks and amphorae', 'header-alliance': 'a sandstone wall with three colored banners, shields and torches', 'header-ranking': 'a three-step stone podium with a golden trophy on top and two banners', 'header-inventory': 'an open wooden treasure chest full of gold coins, with an amphora, a spear and a shield', 'header-reports': 'an unrolled parchment scroll with a quill, an ink pot and a torch'
};
for (const f of Object.keys(FACTION)) SCENE['hero-' + f] = `a ${f.toLowerCase()} hero with ${HEAD[f]}, cape, sword and round shield standing on a round paved stone platform, with two torches and two banners of the faction behind him, three-quarter view`;
const WALL_TIER = { 1: 'early and simple', 2: 'reinforced, with crenellations', 3: 'fully developed, with crenellations, torches and banners' };
const WALL_KIND = { ROME: 'ashlar stone curtain wall with battlements', GAUL: 'wooden palisade of sharpened logs with a plank walkway', GREEK: 'white marble wall with a cornice', EGYPT: 'sandstone wall with merlons and a gold frieze', HUN: 'rough timber palisade with hides and shields', SULTAN: 'whitewashed plaster wall with battlements and small arches' };
const TOWER_KIND = { ROME: 'round stone tower with a conical terracotta roof', GAUL: 'wooden watchtower on log posts with a thatched roof', GREEK: 'square marble tower with a blue slate hip roof', EGYPT: 'tapered sandstone pylon tower with merlons and a gold frieze', HUN: 'wooden watchtower with a felt conical roof', SULTAN: 'round whitewashed tower topped by a small teal mosaic dome' };
const UI_FRAME = {
  'frame-panel': 'a square ornamental frame for a game panel: four straight edges of dark polished wood with brass studs, carved golden ornaments only in the four corners, and a completely empty transparent center (nothing inside the frame)',
  'frame-modal': 'a square game window frame: a thin border of dark wood with golden corner ornaments and a plain, uniform, lightly aged parchment filling the entire inside; no title, no buttons, no decoration in the middle',
  'plate-parchment': 'a plain rectangular plate of aged parchment with a thin dark-brown worn edge, uniform in the middle, no decoration, no text',
  'plate-dark': 'a plain rectangular plate of dark worn leather with a thin brass edge, uniform in the middle, no decoration',
  'bar-wood': 'a horizontal band of dark polished wooden planks with a thin golden rail along the top edge, uniform, no decoration'
};
const UI_BUTTON = { primary: 'bright green', secondary: 'warm brown leather', danger: 'deep red', gold: 'polished gold', info: 'royal blue' };
const ICON_DESC = { tech_AGRONOMY: 'a sheaf of golden wheat crossed with a wooden plough (technology: Agronomy)', tech_ENGINEERING: 'a wooden crane with a stone block on a rope and a set square (technology: Engineering)', tech_TRAINING: 'two crossed wooden training swords over a round shield (technology: Training)', tech_TACTICS: 'an unrolled parchment with a battle plan drawn on it and a small bronze arrow marker (technology: Art of war)', tech_DISCIPLINE: 'a row of three overlapping round shields forming a wall (technology: Discipline)', tech_MEDICINE: 'a clay bowl with green herbs and a rolled linen bandage (technology: Medicine)', tech_CARTOGRAPHY: 'a rolled map with a compass rose and a small horse figure (technology: Cartography)', tech_SUPPLY: 'a stack of grain sacks and a wooden barrel (technology: Supply)', branch_ECONOMY: 'a sheaf of wheat and a pile of coins (research branch: economy)', branch_MILITARY: 'a bronze sword and a spear crossed (research branch: military)', branch_DEFENSE: 'a tower shield with a crenellated wall behind (research branch: defense)', branch_LOGISTICS: 'a loaded cart wheel and a signpost (research branch: logistics)', settler: 'a villager walking with a bundle on a stick over the shoulder and a wooden stake with a small flag in the other hand (settler founding a new city)', wood: 'a bundle of cut logs', stone: 'a block of grey stone', iron: 'a stack of iron ingots', food: 'a sheaf of golden wheat', gold: 'a pile of gold coins', population: 'two villagers side by side', build: 'a wooden mallet', army: 'two crossed swords', recruit: 'two crossed swords', city: 'a small house with a terracotta roof', fields: 'a small square plot of wheat', map: 'an unrolled parchment map on two wooden rods', reports: 'a parchment scroll', ranking: 'a golden trophy cup', inventory: 'a wooden treasure chest with brass fittings', hero: 'a golden Roman helmet with a red crest', alliance: 'two overlapping shields, one blue and one red', market: 'a brass balance scale', settings: 'an iron cogwheel', attack: 'a red shield with a crossed sword', defense: 'a blue shield with a golden boss', expedition: 'a brass compass rose', clock: 'an hourglass with golden sand', home: 'a small house', endurance: 'a red heart', stats: 'three bar-chart columns of bronze, gold and silver', spy: 'a magnifying glass', crown: 'a golden crown with red gems', player: 'a villager figure on a stone base', lock: 'a golden padlock', list: 'a clipboard with a parchment list', star: 'a golden five-pointed star', horse: 'a brown horse', medal: 'a gold medal on a red and blue ribbon', medal_silver: 'a silver medal on a red and blue ribbon', medal_bronze: 'a bronze medal on a red and blue ribbon', bolt: 'a golden lightning bolt', bow: 'a wooden bow with an arrow', rally: 'a red flag on a pole on a stone base', send: 'a parchment letter with a golden arrow', target: 'an archery target with an arrow', pin: 'a red map pin', skull: 'a bone skull', tree: 'a pine tree', amphora: 'a clay amphora', tools: 'a crossed hammer and pickaxe' };
const KEEP_T1 = 'Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle and the same position in the frame; the building is a smaller, humbler early version, so it may be simpler and lower than the guide, but it must stay centered on the same spot and fit inside the same footprint. Do not add anything outside the footprint except small props at its base and a soft cast shadow to the right.';
const KEEP_T3 = 'Repaint the subject shown in the second image (a plain 3D render used as a layout guide). Keep exactly the same camera angle and the same position and footprint in the frame; the building is a grander developed version, so it may be taller than the guide with an extra storey or a tower, but it must keep the same footprint and the same position. Do not add anything outside the footprint except small props at its base and a soft cast shadow to the right.';
// Composition de chaque type de cadre, pour les outils qui ne peuvent pas recevoir l'image guide (la silhouette
// doit tomber au même endroit que sur le guide pour que le sprite se pose correctement dans le jeu)
// ---- chantiers, colons, tribus (octobre 2026) : techniques de construction historiques par civilisation ----
const SITE = {
  ROME: 'a Roman building site: a timber scaffold of lashed poles and planks resting in putlog holes, a treadwheel crane (polyspastos) lifting a stone block on a rope, brick-faced concrete walls (opus testaceum) half raised, wooden centering under an arch, troughs of lime mortar, a surveyor\'s groma, stacks of terracotta tiles and ashlar blocks',
  GAUL: 'a Gallic building site: a frame of oak posts and horizontal beams (murus gallicus lacing) half raised, wattle panels being daubed with clay, a roof lattice waiting for its thatch, bundles of reed thatch, ladders and lashed poles instead of a scaffold, adzes, baskets of earth and rubble, no crane',
  GREEK: 'a Greek building site: a wooden derrick crane with a pulley hoisting a marble drum by its lewis iron, column drums stacked and waiting, a wooden scaffold of poles and planks, masons\' chisels and mallets, stone blocks with their bosses still unfinished, a half-raised marble wall with iron clamps, terracotta roof tiles',
  EGYPT: 'an Egyptian building site: a sloping ramp of mud and rubble up to the half-raised sandstone and mud-brick walls, a stone block on a wooden sledge pulled with ropes over wetted silt, wooden levers and rocking cradles, light reed scaffolding only for the plasterers, copper chisels, plumb-bob and square, no crane, baskets of mud bricks drying in the sun',
  HUN: 'a Hunnic steppe building site: a round timber lattice frame being raised and tied with leather straps, felt and hide panels half laid over it, a palisade of sharpened logs being planted, carts loaded with poles and rolled felt, ropes and stakes, a horse tethered nearby, no masonry, no crane',
  SULTAN: 'a Sultanate building site: fired-brick walls half raised with lime mortar, a wooden centering supporting a pointed arch, a scaffold of palm trunks lashed with rope, a rope-and-pulley hoist, stacks of glazed teal tiles and stucco panels waiting, mortar troughs, a dome on wooden formwork'
};
const SCAFFOLD = {
  ROME: 'a Roman timber scaffold: upright poles and horizontal putlogs lashed with rope, plank walkways, a small treadwheel crane on top with a rope and pulley',
  GAUL: 'a Gallic scaffold of rough lashed poles and wicker hurdles, oak ladders leaning on it, bundles of thatch and a basket of clay',
  GREEK: 'a Greek scaffold of straight poles and planks with a wooden derrick and pulley hoisting a marble block',
  EGYPT: 'an Egyptian earthen ramp with a wooden sledge and ropes, light reed scaffolding, baskets of mud bricks',
  HUN: 'a Hunnic timber frame of poles tied with leather straps, rolled felt and hides, ropes and stakes, a cart of poles',
  SULTAN: 'a Sultanate scaffold of palm trunks lashed with rope, a pulley, a wooden arch centering, stacks of fired bricks and glazed tiles'
};
const SCAFFOLD_SIZE = { 1: 'small, one storey high', 2: 'medium, two storeys high', 3: 'large, three storeys high' };
const WORKER = {
  ROME: 'a Roman builder in a short belted wool tunic and sandals', GAUL: 'a Gallic builder with long hair and a moustache, checked wool braies and a leather belt',
  GREEK: 'a Greek builder in a short chiton pinned at one shoulder and a felt cap', EGYPT: 'an Egyptian builder in a white linen shendyt kilt, shaved head, bare chest',
  HUN: 'a Hunnic builder in a belted caftan, trousers, boots and a fur-trimmed cap', SULTAN: 'a Sultanate builder in a striped robe with rolled sleeves and a turban'
};
const CIVIL_HEAD = {
  ROME: 'a short Roman haircut', GAUL: 'long braided hair and a moustache', GREEK: 'curly hair with a headband',
  EGYPT: 'a black wig with kohl-lined eyes', HUN: 'a fur-trimmed felt cap', SULTAN: 'a turban'
};
const FIELD_SITE = { FARM: 'the first furrows being ploughed with an ox-drawn ard, a farmer sowing, stakes marking the plot', LUMBER: 'freshly felled trees and stumps, an axeman at work, a first stack of logs and a cart', QUARRY: 'a first cut into the rock face, wedges and mallets, a few extracted blocks on rollers', IRON_MINE: 'a mine entrance being dug into the rock, timber props being set, baskets of ore and a pick' };
CLASS.SETTLER = 'a settler villager carrying a bundle on a stick over the shoulder and holding a wooden stake with a small flag';
CLASS.TRIBE = 'a fierce chieftain of a local tribe with a painted face, a fur cloak and a necklace of teeth';
CAMP.foundation = 'a settlers\' camp where a new city is being founded: three canvas tents, a covered ox-wagon, wooden stakes and rope marking the future walls, a dug trench, piles of logs and stones, a small campfire and a banner pole';
for (const c of Object.keys(FACTION)) MAP['cities/colony_' + c.toLowerCase()] = `a small newly founded colony village: ${FACTION[c]}, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around`;
for (const c of Object.keys(FACTION)) SCENE['faction-' + c] = `a wide painted landscape of the ${c.toLowerCase()} people seen from a distance: ${FACTION[c]}, under a warm sky, no characters in the foreground`;
SCENE['header-army'] = 'a wide painted banner of an ancient army on parade: ranks of soldiers with shields and spears, standards and a horse, seen from the front at 30 degrees';
SCENE['header-research'] = 'a wide painted banner of an ancient library and workshop: scrolls, an astrolabe, a wooden model of a crane, oil lamps, a scholar at a table';
SCENE['vignette-founding'] = 'a wide painted vignette of settlers founding a new city: a covered ox-wagon being unloaded, a man planting a wooden stake with a small flag, tents, stakes and rope marking the future walls, a priest pouring a libation, green hills at dawn';
SCENE['vignette-tribe-forest'] = 'a wide painted vignette of a local tribe camp in a forest clearing: round huts with thatched roofs, a palisade of stakes, a totem pole with a skull, warriors with painted faces around a campfire, smoke, late afternoon light';
SCENE['vignette-tribe-desert'] = 'a wide painted vignette of a local tribe camp among dunes and red rocks: hide tents, a palm tree, camels, warriors with turbans and spears around a fire, a totem with a skull, dusk light';
SCENE['vignette-tribe-snow'] = 'a wide painted vignette of a local tribe camp in a snowy pine forest: fur-covered huts, a frozen stream, warriors in furs around a fire, smoke rising, a totem with a skull, pale winter light';
ICON_DESC.tribe = 'a wooden totem pole topped with a skull and two crossed clubs (local tribe)';
// ---- le tour complet (octobre 2026) : animations, vie de la ville, fiches d'unité, héros, inscription ----
const CIVIL_DRESS = { ROME: 'a knee-length wool tunic and sandals', GAUL: 'checked wool braies, a short cloak with a brooch', GREEK: 'a chiton and a himation', EGYPT: 'white linen, a broad bead collar', HUN: 'a belted caftan, trousers and felt boots', SULTAN: 'a striped robe and a sash' };
const TIER_LOOK = { base: 'simple gear of leather, wood and plain cloth, no decoration', intermediate: 'better gear: bronze scales or chain mail, a helmet crest, a painted shield', elite: 'splendid gear: ornate armour, plumes, gold trims, a cape, an emblem on the shield', siege: 'a siege crew with their engine' };
const UNIT_FLAVOUR = Object.fromEntries(UNITS.map(u => [u.key, u]));
const ANIM_DESC = {
  flame: 'a torch flame', brazier: 'a burning brazier', worker: 'a builder swinging a mallet (raise, top, strike, rebound)',
  mill_sails: 'the four sails of a windmill turning', sparks: 'a burst of orange sparks', furnace: 'the glowing fire of a furnace',
  battle: 'a world-map clash of swords with dust (a battle marker)', fire: 'a world-map burning town (flames and black smoke)', campfire: 'a world-map campfire',
  fx_sparkle: 'golden sparkles bursting (interface effect)', fx_levelup: 'a golden level-up glow rising (interface effect)', fx_coins: 'gold coins falling (interface effect)',
  snowflake: 'a single snowflake drifting', leaf: 'a single autumn leaf drifting', dust_devil: 'a small sand whirlwind', bird: 'a small bird flapping',
  cart: 'a wooden cart pulled by an ox rolling along', horse_idle: 'a tethered horse shifting its weight',
  farmer: 'a peasant swinging a scythe in a wheat field', lumberjack: 'a lumberjack chopping a tree with an axe', quarryman: 'a stone cutter striking a block with a mallet and chisel', miner: 'a miner swinging a pickaxe at a mine entrance',
  animal_chicken: 'a chicken pecking and walking', animal_dog: 'a dog trotting', animal_goat: 'a goat walking and grazing', animal_cat: 'a cat walking',
  barracks_drill: 'two soldiers drilling with wooden swords in front of the barracks', market_crowd: 'merchants and customers moving around a market stall', stable_horse: 'a horse stamping in front of a stable', workshop_hammer: 'a craftsman hammering a wooden frame, chips flying', bakery_smoke: 'smoke and a warm glow from a bakery oven', watchtower_beacon: 'a signal fire burning at the top of a watchtower',
  smoke_chimney: 'soft grey chimney smoke rising', smoke_campfire: 'thin white campfire smoke rising',
  rain: 'a translucent sheet of falling rain (world-map weather)', snowfall: 'falling snowflakes (world-map weather)',
  settler_walk: 'a settlers\' party (covered ox-wagon, walking family with bundles, a man with a flagged stake) walking toward the lower right'
};
// Orientation des bâtiments (octobre 2026) : entrée au sud-est, vers la porte de la ville (face avant droite)
const ENTRANCE = 'Its main entrance (door, porch, steps or gateway) is on the front-RIGHT face of the building, facing the lower right of the image, exactly like the guide; the front-left face has no main door.';
// Pas d'entrée à orienter (champs, eau, place de rassemblement), ou une entrée qui n'est pas une porte
const NO_ENTRANCE = new Set(['FARM', 'LUMBER', 'QUARRY', 'EGYPTIAN_IRRIGATION', 'RALLY_POINT']);
const ENTRANCE_FOR = {
  WALL: 'The gate opening faces the lower right of the image (front-right face), exactly like the guide.',
  IRON_MINE: 'The mine mouth faces the lower right of the image (front-right face), exactly like the guide.',
  HIDEOUT: 'The hidden entrance (trapdoor or low opening) faces the lower right of the image (front-right face), exactly like the guide.',
  GREEK_TEMPLE: 'The temple entrance, its pediment end with the columned porch, is on the front-RIGHT face, facing the lower right of the image, exactly like the guide.'
};
const entranceFor = (key) => NO_ENTRANCE.has(key) ? '' : ' ' + (ENTRANCE_FOR[key] || ENTRANCE);
const COMPOSITION = {
  building: 'Composition: square image. The building stands on a square ground plot seen as a 2:1 diamond, centered horizontally; the diamond is about 51% of the image width, its center is at 73% of the image height and its bottom corner at 86%; the building rises from the plot toward the top and never goes outside the plot footprint.',
  prop: 'Composition: square image, the prop centered horizontally, its base at 89% of the image height, about 60% of the width.',
  map: 'Composition: square image, the subject on a small square ground plot seen as a 2:1 diamond centered horizontally, diamond width about 57% of the image, center at 77% of the height.',
  mapunit: 'Composition: square image, the marching figures centered, feet at about 77% of the image height, overall height about 45% of the image.',
  figure: 'Composition: square image, a full-body character centered, feet at 90% of the image height, head near 12%, three-quarter view slightly from above, facing the viewer\'s right.',
  bust: 'Composition: square image, head and shoulders filling about 80% of the frame, centered, slightly turned to the right.',
  icon: 'Composition: square image, a single object centered filling about 70% of the frame, three-quarter view from slightly above.',
  ui: 'Composition: the element fills the whole square image edge to edge, front view, no perspective.',
  stage: 'Composition: portrait image (2:3), the hero centered, feet at 90% of the height, standing on a round platform, banners and torches behind.',
  header: 'Composition: wide image, the scene centered, ground at 70% of the height, nothing cut at the edges.',
  scene: 'Composition: the panorama fills the whole image, isometric view from the front at 30 degrees, sky transparent above the island.'
};
// Textures de sol répétables (sans guide) et emblème
// Textures de sol répétables (vue de dessus) : les quatre de base, puis le jeu complet (docs/GUIDE-COMPLEMENTS-ANIMATIONS.md § T)
const TEXTURE = {
  grass: 'a seamless, tileable top-down texture of lush painted meadow grass: soft green tufts, a few tiny flowers and pebbles',
  dirt: 'a seamless, tileable top-down texture of packed earth and dirt path: warm brown, small pebbles, faint cart tracks',
  sand: 'a seamless, tileable top-down texture of desert sand: pale ochre, gentle wind ripples, a few small stones',
  snow: 'a seamless, tileable top-down texture of fresh snow: white with soft blue shadows, light drifts and sparkles',
  // sols de base, variantes par biome
  grass_lawn: 'a seamless, tileable top-down texture of short well-kept green lawn, fine blades, a few tiny daisies',
  grass_dark: 'a seamless, tileable top-down texture of dense dark-green undergrowth with moss and small ferns',
  grass_dry: 'a seamless, tileable top-down texture of dry yellow-green summer grass with some bare earth',
  grass_flowers: 'a seamless, tileable top-down texture of meadow grass dotted with small red, white and yellow wildflowers',
  grass_hills: 'a seamless, tileable top-down texture of rolling meadow grass with lighter crests and darker hollows',
  dirt_packed: 'a seamless, tileable top-down texture of packed brown earth with small pebbles and faint footprints',
  mud: 'a seamless, tileable top-down texture of wet dark mud with shallow puddles reflecting the sky',
  gravel: 'a seamless, tileable top-down texture of small grey and beige gravel stones',
  sand_ripples: 'a seamless, tileable top-down texture of pale ochre desert sand with gentle wind ripples',
  sand_rocky: 'a seamless, tileable top-down texture of sand with scattered small dark stones and a few dry tufts',
  cracked_earth: 'a seamless, tileable top-down texture of dry cracked clay ground in warm ochre',
  snow_fresh: 'a seamless, tileable top-down texture of fresh untouched snow, soft blue shadows, a few sparkles',
  snow_trampled: 'a seamless, tileable top-down texture of trampled grey-white snow with footprints and dirt showing through',
  tundra: 'a seamless, tileable top-down texture of frosted short grass and frozen earth, white edges on the blades',
  // eau et glace
  water_lake: 'a seamless, tileable top-down texture of calm clear blue lake water, soft ripples, a few light reflections',
  water_deep: 'a seamless, tileable top-down texture of deep dark-blue water with slow swells',
  water_river: 'a seamless, tileable top-down texture of flowing water with diagonal streaks and small white foam lines',
  water_shallow: 'a seamless, tileable top-down texture of shallow turquoise water with a sandy bottom visible',
  ice: 'a seamless, tileable top-down texture of pale blue cracked ice with white frost lines',
  // dallages et chemins
  plaza_ROME: 'a seamless, tileable top-down texture of large pale sandstone flagstones with thin dark joints and a faint mosaic meander border',
  plaza_GAUL: 'a seamless, tileable top-down texture of rough wooden planks and packed earth with straw',
  plaza_GREEK: 'a seamless, tileable top-down texture of white marble slabs with grey veins and thin joints',
  plaza_EGYPT: 'a seamless, tileable top-down texture of golden sandstone tiles with a few carved hieroglyph bands',
  plaza_HUN: 'a seamless, tileable top-down texture of trampled dark earth with hoof prints and scattered straw',
  plaza_SULTAN: 'a seamless, tileable top-down texture of teal, white and gold geometric mosaic tiles',
  cobble: 'a seamless, tileable top-down texture of worn rounded cobblestones in warm beige and grey, thin dark joints, tufts of grass in the cracks',
  flagstone: 'a seamless, tileable top-down texture of irregular flat grey flagstones with moss in the joints',
  road_dirt: 'a seamless, tileable top-down texture of a packed dirt road with two cart ruts and grass at the sides, the road running vertically',
  road_paved: 'a seamless, tileable top-down texture of an ancient paved road of large basalt stones, the road running vertically',
  path_sand: 'a seamless, tileable top-down texture of a sandy trail with camel tracks, the trail running vertically',
  // champs
  soil_tilled: 'a seamless, tileable top-down texture of tilled brown soil in straight furrows',
  wheat: 'a seamless, tileable top-down texture of golden ripe wheat seen from above in neat rows',
  orchard: 'a seamless, tileable top-down texture of green grass with rows of small round tree crowns'
};
// Décalques au sol (fond transparent, bords fondus, non répétables) semés par le code pour casser la répétition
const DECAL = {
  grass_tuft: 'a tuft of taller grass', flowers_red: 'a small patch of red poppies', flowers_white: 'a small patch of white and yellow daisies',
  clover: 'a patch of clover and small leaves', pebbles: 'a scatter of small grey pebbles', cracks: 'thin dry cracks in the earth',
  puddle: 'a shallow puddle reflecting the sky', leaves: 'scattered fallen autumn leaves', moss: 'a soft patch of green moss',
  mushrooms: 'a small cluster of brown mushrooms', branches: 'a few fallen dry branches', cart_tracks: 'two parallel cart ruts',
  hoof_prints: 'a trail of hoof prints', snow_drift: 'a small drift of snow', ice_patch: 'a patch of thin ice', sand_ripple: 'a patch of wind ripples in sand'
};
// Bordures et transitions : bandes 1024×256 répétables horizontalement, A en haut fondu vers B en bas
const EDGE = {
  edge_grass_sand: ['green grass', 'ochre sand'], edge_grass_snow: ['green grass', 'white snow'], edge_shore: ['sandy shore', 'shallow clear water'],
  edge_grass_water: ['green grass with reeds', 'lake water'], edge_cliff: ['grass', 'a short brown earth cliff face seen slightly from the front'], edge_road: ['cobblestone road', 'grass verge']
};
const UNIT_NAME = { hoplite: 'INFANTRY', archer: 'ARCHER', cavalry: 'CAVALRY', catapult: 'SIEGE' };
function frameOf(file) {
  if (/^(buildings|fields|plots|walls)\//.test(file)) return 'building';
  if (/^props\//.test(file)) return 'prop';
  if (/^map\/units\//.test(file)) return 'mapunit';
  if (/^map\//.test(file)) return 'map';
  if (/^figures\//.test(file)) return 'figure';
  if (/^(busts\/|heroes\/[A-Z]+_bust)/.test(file)) return 'bust';
  if (/^heroes\//.test(file) || /^scenes\/hero-/.test(file)) return 'stage';
  if (/^scenes\/(header|vignette)-/.test(file)) return 'header';
  if (/^scenes\//.test(file)) return 'scene';
  if (/^ui\/(btn|frame|plate|bar)/.test(file)) return 'ui';
  if (/^(ui|logo)\//.test(file)) return 'icon';
  return 'building';
}
// Carte du monde (décision du 25 octobre 2026) : style de la carte de référence, éléments sans socle, villes sur 2 × 2 cases
const MW = require('./map-world.cjs');
// Cycles de marche de la carte (décision du 26 octobre 2026) : 6 poses qui bouclent, livrées en une image de 3 × 2 poses
const WALK_POSES = ['left foot forward, touching the ground', 'body lowest, weight on the left foot, right leg bending', 'right leg passing the left one, body highest', 'right foot forward, touching the ground', 'body lowest, weight on the right foot, left leg bending', 'left leg passing the right one, body highest'];
const WALK_RE = /^map\/units\/(hoplite|archer|cavalry|catapult|hero|merchant|settler|spy)(?:_([A-Z]+))?_walk(?:_(\d))?\.webp$/;
// mêmes sujets que les images immobiles de la carte (promptFor, map/units/<nom>.webp) : la marche les remplace pendant le trajet
function walkWho(u, civ) {
  const civLook = civ ? `, ${civ.toLowerCase()} faction with ${HEAD[civ]} and faction colors` : ', Roman style';
  if (u === 'merchant') return 'a merchant: a wooden cart loaded with crates pulled by a horse';
  if (u === 'spy') return 'a spy: a hooded rider on a dark horse, cloak flying';
  if (u === 'cavalry') return `${CLASS.CAVALRY}${civLook}`;
  if (u === 'catapult') return `a siege engineer with his catapult on wooden wheels${civLook}`;
  if (u === 'hoplite' || u === 'archer') return `two ${CLASS[UNIT_NAME[u]].replace(/^an? /, '').replace('soldier', 'soldiers').replace('archer ', 'archers ')}${civLook}`;
  if (u === 'settler') return 'a settlers\' party: a covered ox-wagon with a family walking beside it carrying bundles, a man holding a wooden stake with a small flag';
  if (u === 'hero') return `the ${civ.toLowerCase()} hero with ${HEAD[civ]}, golden armor and a cape, riding a horse in front of two soldiers`;
  return `a small squad of marching figures${civLook}`;
}
const WALK_HOW = (u) => (u === 'cavalry' || u === 'hero' || u === 'spy' ? 'the horses walk (legs in the walking gait), riders bob slightly' : u === 'catapult' ? 'the engineer pushes the catapult, its wheels turn' : u === 'merchant' || u === 'settler' ? 'the animals and people walk, the wheels turn' : 'the soldiers march in step');
function walkFramePrompt(file) {
  const m = file.match(WALK_RE);
  if (!m || m[3] === undefined) return null;
  const i = Number(m[3]);
  return `${MW.MAP_STYLE} ${MW.BG}\n\n${MW.COMPOSITION.unit}\n\nSubject: ${walkWho(m[1], m[2])}, walking toward the lower right (${WALK_HOW(m[1])}): frame ${i + 1} of a 6-frame looping walk cycle, ${WALK_POSES[i]}. Same figures, same size and same position as in the other frames; only the legs, arms and wheels move.`;
}
// Le prompt de l'image entière d'un cycle (map/units/<nom>_walk.png) : 6 poses en grille 3 × 2
function walkSheetPrompt(base) {
  const m = (base + '.webp').match(WALK_RE);
  if (!m) return null;
  return `${MW.MAP_STYLE} ${MW.BG}\n\nComposition: a SPRITE SHEET of 6 frames in a grid of 3 columns and 2 rows: image 1536 x 1024, each frame a 512 x 512 square, no gap, no border, no numbers; frames read left to right, top row then bottom row. In every square the same figures, with the same size and the same position: they stand on the centre of a one-tile isometric diamond (50% of the square width, its centre at 75% of the square height, not drawn), overall height about 40% of the square. Only the pose changes from one frame to the next, so that the six frames loop as a walk. The second image is a layout guide that shows the six squares and, in each one, that diamond in red: use it only to place the figures, do not draw the red diamonds, the numbers, the marks or the grey background.\n\nSubject: ${walkWho(m[1], m[2])}, walking toward the lower right (${WALK_HOW(m[1])}). The six poses of the cycle: ${WALK_POSES.map((p, k) => `${k + 1}) ${p}`).join('; ')}.`;
}
function promptFor(file, opts = {}) {
  if (file.startsWith('map/')) {
    const walk = walkFramePrompt(file);
    if (walk) return walk;
    const own = MW.promptFor(file);   // sol, éléments posés, villes
    if (own) return own;
    const base = promptForBase(file, opts);
    if (!base) return null;
    const kind = /^map\/cities\//.test(file) ? 'city' : /^map\/units\//.test(file) ? 'unit' : 'object';   // toute ville : 2 × 2 cases
    const subject = base.split('\n\nSubject: ')[1] || '';
    const clean = subject.replace(/,? standing on a small (square grass plot|round patch of ground)/g, '').replace(/a world-map (resource |terrain )?icon( of| for a world map)?:? ?/g, '').replace(/a small world-map (army )?marker( of)?:? ?/g, '')
      .replace(/\btwo (an?) /g, 'a small squad of three or four marching figures, each one $1 ').replace(/ (town|city|village) icon for a world map/g, ' $1').replace(/ icon for a world map/g, '')
      .replace(/the silhouette and size of the guide \(its normal world-map icon\)/g, 'the silhouette and size of its normal world-map image').replace(/between the village of the guide and/g, 'between the village and')
      .replace(/a world-map burning town/g, 'a burning town');
    return `${MW.MAP_STYLE} ${MW.BG}\n\n${MW.COMPOSITION[kind]}\n\nSubject: ${clean}`;
  }
  return promptForBase(file, opts);
}
function promptForBase(file, opts = {}) {
  const bg = BG[opts.bg || 'transparent'] || BG.transparent;
  let m, subject = '';
  let keep = KEEP;
  if ((m = file.match(/^buildings\/([A-Z]+)\/([A-Z_]+?)(?:_t([13]))?(_snow)?\.webp$/))) {
    const tier = m[3];
    subject = `${BUILDING[m[2]] || 'an ancient building'}. ${FACTION[m[1]]}.${tier === '1' ? ' This is the LEVEL 1 version of the building, as in a mobile strategy game where buildings evolve with their level: noticeably smaller and humbler, a single low storey of rough timber, wattle and plain plaster, a simple thatched or wooden-shingle roof, no decoration, a few crates, barrels or tools around, slightly worn.' : tier === '3' ? ' This is the MAX LEVEL version of the building, as in a mobile strategy game where buildings evolve with their level: larger and grander, with an additional storey or a tower, polished stone and marble, gold trims and finials, banners, torches, statues or carvings, a paved esplanade with a stone balustrade, impeccable and lush.' : ''}${m[4] ? ' Everything is covered with a layer of snow: snow on the roofs, ledges and ground.' : ''}${entranceFor(m[2])}`;
    if (tier === '1') keep = KEEP_T1; else if (tier === '3') keep = KEEP_T3;
  }
  else if ((m = file.match(/^buildings\/([A-Z]+)\/([A-Z_]+)_site\.webp$/))) subject = `${BUILDING[m[2]] || 'an ancient building'} as a CONSTRUCTION SITE, about half built, with the same footprint and the same silhouette as the finished building shown in the guide: ${SITE[m[1]]}, two or three workers at work, ${FACTION[m[1]]}. The lower walls are up, the upper part and the roof are still missing or only framed; no finished decoration.${entranceFor(m[2])}`;
  else if ((m = file.match(/^props\/villager_([A-Z]+)_([ab])_(\d)\.webp$/))) subject = `A sprite sheet frame: a ${m[2] === 'a' ? 'man' : 'woman'} villager of the ${m[1].toLowerCase()} people walking, ${CIVIL_DRESS[m[1]]}, ${CIVIL_HEAD[m[1]]}, walk cycle frame ${Number(m[3]) + 1} of 6`;
  else if ((m = file.match(/^props\/plaza_([A-Z]+)_(statue|fountain|stall)\.webp$/))) subject = `${m[2] === 'statue' ? 'a statue on a pedestal' : m[2] === 'fountain' ? 'a small fountain or well' : 'a small market stall with an awning'} for the main square of a city: ${FACTION[m[1]]}, a stand-alone prop`;
  else if ((m = file.match(/^props\/flagp_([A-Z]+)_(\d)\.webp$/))) subject = `a cloth banner on a wooden pole waving in the wind, in the colors and with the emblem of the ${m[1].toLowerCase()} people (${FACTION[m[1]].split(':')[0].replace(' architecture', '')}), wave cycle frame ${Number(m[2]) + 1} of 8`;
  else if ((m = file.match(/^walls\/([A-Z]+)\/gate\.webp$/))) subject = `a fortified city gate with two small flanking turrets, an arched opening with open wooden doors, torches on each side, seen from the front-right so that the opening faces the lower right; ${WALL_KIND[m[1]]}, ${FACTION[m[1]]}`;
  else if ((m = file.match(/^figures\/units\/([A-Z_]+)\.webp$/)) && UNIT_FLAVOUR[m[1]]) { const u = UNIT_FLAVOUR[m[1]]; subject = `a full-body character sprite in three-quarter view: ${u.name} (${CLASS[u.class]}) of the ${u.faction.toLowerCase()} people, ${TIER_LOOK[u.tier]}, ${HEAD[u.faction]} and ${FACTION[u.faction].split(':')[0].replace(' architecture', '')} colors, standing on a small round base. Flavour: ${u.description || ''}`; }
  else if ((m = file.match(/^busts\/units\/([A-Z_]+)\.webp$/)) && UNIT_FLAVOUR[m[1]]) { const u = UNIT_FLAVOUR[m[1]]; subject = `a round token portrait, head and shoulders, of ${u.name} (${CLASS[u.class]}) of the ${u.faction.toLowerCase()} people, ${TIER_LOOK[u.tier]}, ${HEAD[u.faction]}, with a small class emblem on a dark round badge by the shoulder`; }
  else if ((m = file.match(/^map\/units\/hero_([A-Z]+)\.webp$/))) subject = `a small world-map army marker: the ${m[1].toLowerCase()} hero with ${HEAD[m[1]]}, golden armor and a cape, on a horse in front of two soldiers, marching toward the lower right`;
  else if ((m = file.match(/^map\/units\/hero_([A-Z]+)_attack_(\d)\.webp$/))) subject = `a small battle-replay sprite: the ${m[1].toLowerCase()} hero with ${HEAD[m[1]]}, golden armor and a cape, striking with a sword, attack frame ${Number(m[2]) + 1} of 3`;
  else if ((m = file.match(/^map\/units\/spy\.webp$/))) subject = 'a small world-map marker of a spy: a hooded rider on a dark horse, cloak flying, riding toward the lower right';
  else if ((m = file.match(/^heroes\/([A-Z]+)_t([23])\.webp$/))) subject = `a full-body hero character sprite in three-quarter view: ${m[1].toLowerCase()} hero with ${HEAD[m[1]]}, ${m[2] === '2' ? 'richer armor with bronze and silver trims, a longer cape' : 'magnificent armor with gold trims and engravings, a flowing embroidered cape, a laurel or jewelled crown'}, sword and round shield, standing on a round stone plinth`;
  else if ((m = file.match(/^heroes\/([A-Z]+)_bust_t([23])\.webp$/))) subject = `a round token portrait, head and shoulders, of the ${m[1].toLowerCase()} hero: ${HEAD[m[1]]}, ${m[2] === '2' ? 'richer armor with silver trims' : 'magnificent gold-trimmed armor and a jewelled crown'}, proud expression`;
  else if ((m = file.match(/^(?:props|anim|map\/fx|fx|ui)\/([a-z_]+?)_(\d)\.webp$/)) && ANIM_DESC[m[1]]) subject = `A sprite sheet frame: ${ANIM_DESC[m[1]]}, frame ${Number(m[2]) + 1} (same subject, same size and position in every frame, only the pose changes)`;
  else if ((m = file.match(/^map\/units\/(hoplite|archer|cavalry|catapult|merchant)_walk_(\d)\.webp$/))) subject = `a small world-map army marker (${m[1] === 'merchant' ? 'a merchant cart pulled by a horse' : CLASS[UNIT_NAME[m[1]]]}) marching toward the lower right, walk cycle frame ${Number(m[2]) + 1} of 6`;
  else if ((m = file.match(/^map\/units\/(hoplite|archer|cavalry|catapult)_(attack|hit)_(\d)\.webp$/))) subject = `a small battle-replay sprite: ${CLASS[UNIT_NAME[m[1]]]} ${m[2] === 'attack' ? 'striking' : 'being hit and recoiling'}, frame ${Number(m[3]) + 1}`;
  else if ((m = file.match(/^fx\/(arrow|stone|impact_\d)\.webp$/))) subject = m[1] === 'arrow' ? 'a single flying arrow (battle replay projectile)' : m[1] === 'stone' ? 'a single flying catapult stone (battle replay projectile)' : 'a small dust and sparks impact burst (battle replay)';
  else if ((m = file.match(/^heroes\/([A-Z]+)_idle_(\d)\.webp$/))) subject = `a full-body hero character sprite in three-quarter view: ${m[1].toLowerCase()} hero with ${HEAD[m[1]]}, golden armor, cape, sword and round shield, standing on a round stone plinth, idle breathing pose frame ${Number(m[2]) + 1} of 3`;
  else if ((m = file.match(/^fields\/(\w+)\/([A-Z_]+)_site\.webp$/))) subject = `${FIELD[m[2]]} being established: ${FIELD_SITE[m[2]]}, ${BIOME[m[1]]}. The plot itself is part of the subject: a rounded square slab of ground.`;
  else if ((m = file.match(/^walls\/([A-Z]+)\/site_(seg_x|seg_z|tower)\.webp$/))) subject = `${m[2] === 'tower' ? 'a corner tower of the city wall' : 'one straight segment of a city wall'} under construction, same footprint as the guide: the lower courses laid, ${SCAFFOLD[m[1]]} along it, workers and materials; ${WALL_KIND[m[1]]}.${m[2] !== 'tower' ? ' It runs diagonally exactly like the guide and is cut flat and square at both ends.' : ''}`;
  else if ((m = file.match(/^props\/scaffold_([A-Z]+)_(\d)\.webp$/))) subject = `${SCAFFOLD[m[1]]}, ${SCAFFOLD_SIZE[m[2]]}, free-standing around an invisible building (nothing behind it), to be overlaid on a building under construction`;
  else if ((m = file.match(/^props\/worker_([A-Z]+)_(\d)\.webp$/))) subject = `${WORKER[m[1]]} swinging a wooden mallet, frame ${Number(m[2]) + 1} of 4 (raise, top, strike, rebound)`;
  else if ((m = file.match(/^busts\/(SETTLER|TRIBE)_([A-Z]+)\.webp$/))) subject = `a round token portrait, head and shoulders, of ${CLASS[m[1]]}, ${m[2].toLowerCase()} people with ${CIVIL_HEAD[m[2]]}, ${CIVIL_DRESS[m[2]]}`;
  else if ((m = file.match(/^map\/units\/settler(?:_([A-Z]+))?\.webp$/))) subject = `a small world-map marker of a settlers' party: a covered ox-wagon with a family walking beside it carrying bundles, a man holding a wooden stake with a small flag, marching toward the lower right${m[1] ? `, ${m[1].toLowerCase()} people with ${CIVIL_HEAD[m[1]]} and faction colors` : ''}`;
  else if ((m = file.match(/^map\/units\/settler_walk_(\d)\.webp$/))) subject = `a small world-map marker of a settlers' party (covered ox-wagon, walking family with bundles, a man with a flagged stake) marching toward the lower right, walk cycle frame ${Number(m[1]) + 1} of 6`;
  else if ((m = file.match(/^fields\/(\w+)\/([A-Z_]+)_(\d)\.webp$/))) subject = `${FIELD[m[2]]} ${TIER[m[3]]}, ${BIOME[m[1]]}. The plot itself is part of the subject: a rounded square slab of ground.`;
  else if ((m = file.match(/^plots\/(\w+)_(\d)\.webp$/))) subject = `an empty ground plot: a rounded square slab of ${m[1] === 'desert' ? 'sand' : m[1] === 'snow' ? 'snow' : 'grass'} with a few ${m[1] === 'snow' ? 'snow drifts' : m[1] === 'desert' ? 'pebbles' : 'tufts and small bushes'}, nothing built on it`;
  else if ((m = file.match(/^props\/(puff)_(\d)\.webp$/))) subject = 'a single soft puff of pale grey-white chimney smoke, round and fluffy, painted with soft edges, seen from the front, nothing else';
  else if ((m = file.match(/^props\/(ripple|flag)_/))) return null;
  else if ((m = file.match(/^props\/(\w+)\.webp$/))) subject = `${PROP[m[1]] || 'a small nature prop'}, a stand-alone scenery prop`;
  else if ((m = file.match(/^map\/cities\/siege_(colony_)?([A-Z]+)_(t[123]|normal|fortified)_(\d)\.webp$/))) subject = `A sprite sheet frame: ${m[1] ? MAP['cities/colony_' + m[2].toLowerCase() + (m[3] === 'fortified' ? '_fortified' : '')] : SIEGE_TOWN[m[3].slice(1)](m[2])}, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of the guide (its normal world-map icon), standing on a small square grass plot, frame ${Number(m[4]) + 1} (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)`;
  else if ((m = file.match(/^map\/cities\/(\w+)\.webp$/))) subject = `${MAP['cities/' + m[1]]}, standing on a small square grass plot`;
  else if ((m = file.match(/^map\/resources\/(\w+?)(?:_(desert|snow))?\.webp$/))) subject = `a world-map resource icon: ${RES[m[1]]}${m[2] === 'desert' ? ', desert variant with sand and a palm tree' : m[2] === 'snow' ? ', snowy variant covered with snow' : ''}`;
  else if ((m = file.match(/^map\/terrain\/(\w+)\.webp$/))) subject = `a world-map terrain icon: ${TERRAIN[m[1]]}`;
  else if ((m = file.match(/^map\/camps\/(camp[123]|ruins|foundation)(?:_(desert|snow))?\.webp$/))) subject = `a world-map icon of ${CAMP[m[1]]}${m[2] ? CAMP_BIOME[m[2]] : ''}, standing on a small round patch of ground`;
  else if ((m = file.match(/^map\/camps\/banner_([A-Z]+)\.webp$/))) subject = `a small world-map marker: a square cloth banner on a wooden pole, waving, in the colors and with the emblem of the ${m[1].toLowerCase()} people (${FACTION[m[1]].split(':')[0].replace(' architecture', '')}), nothing else`;
  else if ((m = file.match(/^figures\/([A-Z]+)_([A-Z]+)\.webp$/))) subject = `a full-body character sprite in three-quarter view: ${CLASS[m[1]]}, ${m[2].toLowerCase()} faction with ${HEAD[m[2]]} and ${FACTION[m[2]].split(':')[0].replace(' architecture', '')} colors, standing on a small round base`;
  else if ((m = file.match(/^heroes\/([A-Z]+)_bust\.webp$/))) subject = `a round token portrait, head and shoulders, of the ${m[1].toLowerCase()} hero: ${HEAD[m[1]]}, golden armor, cape, proud expression`;
  else if ((m = file.match(/^busts\/([A-Z]+)(?:_([A-Z]+))?\.webp$/))) subject = `a round token portrait, head and shoulders, of ${CLASS[m[1]]}${m[2] ? `, ${m[2].toLowerCase()} faction with ${HEAD[m[2]]}` : ', Roman style'}, with a small class emblem (${m[1] === 'ARCHER' ? 'bow and arrow' : m[1] === 'CAVALRY' ? 'horseshoe' : m[1] === 'SIEGE' ? 'wheel and stone' : 'crossed swords'}) on a dark round badge by the shoulder`;
  else if ((m = file.match(/^map\/units\/(hoplite|archer|cavalry|catapult|merchant)(?:_([A-Z]+))?\.webp$/))) subject = m[1] === 'merchant' ? 'a small world-map marker of a merchant: a wooden cart loaded with crates pulled by a horse, marching toward the lower right' : `a small world-map army marker: ${m[1] === 'cavalry' || m[1] === 'catapult' ? '' : 'two '}${CLASS[UNIT_NAME[m[1]]]}${m[2] ? `, ${m[2].toLowerCase()} faction with ${HEAD[m[2]]} and faction colors` : ', Roman style'}, marching toward the lower right`;
  else if ((m = file.match(/^logo\/medallion\.webp$/))) subject = 'the game emblem: a golden Roman legionary helmet with a red horsehair crest, seen in three-quarter view, inside a dark bronze medallion rimmed with gold and framed by two golden laurel branches; front view, centered';
  else if ((m = file.match(/^terrain\/(edge_\w+)\.webp$/)) && EDGE[m[1]]) return `${STYLE.replace(/No text[^.]*\./, '')} A seamless horizontally tileable top-down strip: the top half is ${EDGE[m[1]][0]} blending softly into ${EDGE[m[1]][1]} in the bottom half. Perfectly uniform lighting, no vignette, no text; the left edge continues the right edge. Wide image (4:1), opaque.`;
  else if ((m = file.match(/^terrain\/(\w+)\.webp$/)) && TEXTURE[m[1]]) return `${STYLE.replace(/No text[^.]*\./, '')} ${TEXTURE[m[1]]}. Perfectly uniform lighting, no vignette, no border, no object larger than a pebble, no text. The texture must tile seamlessly: the left edge continues the right edge and the top edge continues the bottom edge. Square image, opaque.`;
  else if ((m = file.match(/^decals\/(\w+)\.webp$/)) && DECAL[m[1]]) return `${STYLE.replace(/No text[^.]*\./, '')} A single ground decal seen from above: ${DECAL[m[1]]}, soft edges that fade into transparency, nothing else. ${BG[opts.bg || 'transparent']}`;
  else if ((m = file.match(/^heroes\/([A-Z]+)\.webp$/))) subject = `a full-body hero character sprite in three-quarter view: ${m[1].toLowerCase()} hero with ${HEAD[m[1]]}, cape, sword and round shield, standing on a round stone plinth`;
  else if ((m = file.match(/^scenes\/([\w-]+)\.webp$/))) subject = SCENE[m[1]] || 'an isometric scene';
  else if ((m = file.match(/^ui\/btn-(\w+?)(-pressed)?\.webp$/))) subject = `a wide rounded rectangular game button, front view, flat, filling the frame edge to edge: ${UI_BUTTON[m[1]] || 'brown'} enamel-like surface with a soft glossy highlight along the top, a thin golden rim and a dark outline${m[2] ? ', in its pressed state: darker, flatter, no highlight' : ''}. No text, no symbol on it.`;
  else if ((m = file.match(/^ui\/(frame-[\w-]+|plate-[\w-]+|bar-wood)\.webp$/))) subject = `${UI_FRAME[m[1]]}, front view, flat, filling the frame edge to edge, no perspective, no shadow outside`;
  else if ((m = file.match(/^ui\/item_(\w+)\.webp$/))) subject = `a game inventory icon of ${m[1].replace(/_/g, ' ')}, a single object centered, three-quarter view`;
  else if ((m = file.match(/^ui\/(\w+)\.webp$/))) subject = `a game interface icon: ${ICON_DESC[m[1]] || m[1].replace(/_/g, ' ')}, a single object centered, three-quarter view, bold and readable at small size`;
  else if ((m = file.match(/^walls\/([A-Z]+)\/(\d)_seg_([xz])(_low)?(_snow)?\.webp$/))) subject = `one straight segment of a city wall, ${m[4] ? 'a low knee-high parapet' : 'a tall curtain wall'}: ${WALL_KIND[m[1]]}, ${WALL_TIER[m[3 + 1 - 1] && m[2]]}. It runs diagonally exactly like the guide and is cut flat and square at both ends so that identical copies can be joined end to end seamlessly; both ends must look the same. No tower, no gate.${m[5] ? ' Snow covers the top.' : ''}`;
  else if ((m = file.match(/^walls\/([A-Z]+)\/(\d)_tower(_snow)?\.webp$/))) subject = `a corner tower of the city wall: ${TOWER_KIND[m[1]]}, ${WALL_TIER[m[2]]}, standing alone.${m[3] ? ' Snow covers the roof.' : ''}`;
  else return null;
  const comp = COMPOSITION[frameOf(file)] || '';
  return `${STYLE} ${bg}\n\n${keep}\n\n${comp}\n\nSubject: ${subject}`;
}
module.exports = { promptFor, walkSheetPrompt, frameOf, ENTRANCE, NO_ENTRANCE, ENTRANCE_FOR, ANIM_DESC, CIVIL_DRESS, TIER_LOOK, SITE, SCAFFOLD, SCAFFOLD_SIZE, WORKER, CIVIL_HEAD, FIELD_SITE, STYLE, KEEP, KEEP_T1, KEEP_T3, BG, COMPOSITION, FACTION, BUILDING, FIELD, TIER, BIOME, PROP, MAP, RES, CAMP, CAMP_BIOME, TERRAIN, CLASS, HEAD, SCENE, WALL_TIER, WALL_KIND, TOWER_KIND, UI_FRAME, UI_BUTTON, ICON_DESC, TEXTURE, DECAL, EDGE };
