// ============================================================================
// map-world.cjs — les images de la CARTE DU MONDE au style de la carte de référence (docs/img/carte-reference.jpg,
// décision du 25 octobre 2026 : la carte seule change de style, la ville et l'interface gardent le style peint).
//
// Découpage (docs/CARTE-REFERENCE.md, point 10) :
//  - le SOL en textures répétables vues de dessus (une par type de sol : eau, glace, sable, terre, herbe sèche, herbe,
//    neige) ; le jeu les projette en isométrique et découpe lui-même les fondus irréguliers entre sols (grille décalée
//    d'une demi-case), d'où des raccords toujours parfaits et les berges de sable des rivières ;
//  - les ÉLÉMENTS POSÉS sans socle : forêts, rochers, montagnes, ponts, gués, bateaux, quais, points de ressource, camps,
//    armées ; les VILLES sur 2 × 2 cases.
// Les noms des fichiers sont ceux que l'import attend (node tools/repaint.cjs --import=<dossier>).
// ============================================================================

const CIVS = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
const CIV_LOOK = {
  ROME: 'in Roman style: terracotta tile roofs, white plaster and stone, red banners with a golden eagle',
  GAUL: 'in Gallic style: round timber and wattle houses with thick thatched roofs, a wooden palisade, green and gold banners',
  GREEK: 'in Greek style: a white marble temple with columns, blue-grey roofs, blue and white banners',
  EGYPT: 'in Egyptian style: sandstone and mudbrick buildings with flat roofs, an obelisk and a small pylon gate, blue and gold banners',
  HUN: 'in Hunnic style: felt yurts and timber longhouses inside a log stockade, horse pens, red and black banners with horse-tail standards',
  SULTAN: 'in Sultanate style: domed buildings and slender towers of pale stone with turquoise tiles, green and gold banners'
};

// ---- style commun de la carte ----
const MAP_STYLE = 'Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface.';
// Le sol : même rendu que la référence, mais vu de dessus (le jeu le projette en isométrique), opaque
const GROUND_STYLE = 'Ground texture for the world map of a stylised 3D-rendered mobile strategy game, in exactly the colours and the soft realistic rendering of the ground of the first reference image (an ancient-world map): natural saturated colours, fine realistic detail, soft ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. Fully opaque image, no transparency. No text, no letters, no numbers, no watermark.';
const BG = 'Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.';
const STYLE_REF = 'tools/repaint/style-ref-map.jpg';

// ---- compositions ----
const COMPOSITION = {
  ground: 'Composition: a SEAMLESS TILEABLE square ground texture (1024 x 1024) seen straight from above (top-down, no perspective, no horizon): the left edge continues the right edge and the top edge continues the bottom edge with no visible seam. Even lighting with only very soft relief shading (no cast shadows, no light gradient across the image), even density everywhere, no single feature that stands out and would be seen repeating. Ground only: nothing taller than a pebble or a tuft of grass. The image covers about 6 x 6 map tiles: details are small (a tuft of grass is about 1/100 of the image width).',
  object: 'Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.',
  city: 'Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.',
  unit: 'Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.'
};

// ---- le sol : 7 types, une texture répétable chacun ----
// Ordre des couches, de la plus basse à la plus haute (dans un fondu, une couche couvre celles d'en dessous)
const GROUND_ORDER = ['water', 'ice', 'sand', 'earth', 'drygrass', 'grass', 'snow'];
const GROUND = {
  water: 'clear deep blue river and lake water with gentle ripples and soft light reflections, as in the river of the reference',
  ice: 'pale blue frozen water: smooth ice with fine white cracks and a light dusting of snow',
  sand: 'warm ochre sand, like the riverbanks and beaches of the reference: fine wind ripples and a few small pebbles',
  earth: 'brown ploughed field earth with straight parallel furrows running exactly horizontally across the image (the furrows must continue across the left and right edges), a few clods, like the brown fields of the reference',
  drygrass: 'golden dry steppe grass, short and slightly patchy with a little bare earth showing, like the yellow areas of the reference',
  grass: 'lush short green meadow grass with very small flowers and subtle colour variations, like the green areas of the reference',
  snow: 'fresh white snow with soft blue shadows and small wind drifts'
};
const GROUND_FR = { water: 'eau', ice: 'glace', sand: 'sable', earth: 'terre labourée', drygrass: 'herbe sèche', grass: 'herbe', snow: 'neige' };

function groundSubject(terrain) { return `${GROUND[terrain]}.`; }

// ---- éléments posés ----
const OBJECTS = {};
const obj = (file, subject, role) => { OBJECTS[file] = { subject, role }; };
for (let i = 1; i <= 4; i++) obj(`map/world/forest/temperate_${i}.webp`, 'a dense clump of mixed forest filling the whole tile: tall dark-green pines and round deciduous trees packed close together, a few bushes at their feet, as in the forests of the reference; trees may overflow the tile by up to 15% so that neighbouring clumps merge into one forest', `Forêt dense en zone tempérée (variante ${i}), une case`);
for (let i = 1; i <= 3; i++) obj(`map/world/forest/temperate_edge_${i}.webp`, 'the edge of a forest on one tile: five or six pines and deciduous trees, less dense, a few bushes', `Lisière de forêt tempérée (variante ${i}) : case de forêt peu entourée`);
for (let i = 1; i <= 4; i++) obj(`map/world/forest/snow_${i}.webp`, 'a dense clump of snow-covered pine trees filling the whole tile, snow on the branches and drifts at their feet; trees may overflow the tile by up to 15% so that neighbouring clumps merge', `Forêt de sapins enneigés (variante ${i}), une case`);
for (let i = 1; i <= 3; i++) obj(`map/world/forest/snow_edge_${i}.webp`, 'the edge of a snowy pine forest on one tile: four or five snow-covered pines', `Lisière de forêt enneigée (variante ${i})`);
for (let i = 1; i <= 4; i++) obj(`map/world/rocks/boulders_${i}.webp`, 'a grey rock outcrop on one tile: a few large angular boulders with patches of moss and grass, like the rock outcrops of the reference (impassable for armies)', `Amas de rochers (variante ${i}), infranchissable`);
for (let i = 1; i <= 3; i++) obj(`map/world/rocks/desert_${i}.webp`, 'a cluster of low red sandstone rocks with a small cactus, on one tile; neighbouring clusters join into a rocky ridge that armies can still walk through', `Rochers du désert (variante ${i}) : isolés ou en chaîne, franchissables`);
for (const [biome, look] of [['temperate', 'a rugged grey mountain with rocky slopes, a few pines at its foot and a light snow cap'], ['snow', 'a steep icy mountain covered with snow and blue ice']]) {   // les chaînes du désert se traversent : rochers
  obj(`map/world/mountains/${biome}.webp`, `${look}, standing on one tile`, `Montagne isolée (${biome}), infranchissable`);
  obj(`map/world/mountains/${biome}_x.webp`, `${look}: a long ridge running along the tile from its top-left side to its bottom-right side, cut so that it continues into the next tile in that direction`, `Chaîne de montagnes (${biome}) dans l'axe haut-gauche → bas-droite`);
  obj(`map/world/mountains/${biome}_y.webp`, `${look}: a long ridge running along the tile from its top-right side to its bottom-left side, cut so that it continues into the next tile in that direction`, `Chaîne de montagnes (${biome}) dans l'axe haut-droite → bas-gauche`);
  obj(`map/world/mountains/${biome}_xy.webp`, `${look}: a massif with several peaks filling the whole tile, so that it merges with mountain tiles on every side`, `Massif montagneux (${biome}) entouré de montagnes`);
}
for (let i = 1; i <= 3; i++) obj(`map/world/desert/dunes_${i}.webp`, 'two or three golden sand dunes with wind ripples on one tile', `Dunes (variante ${i})`);
for (let i = 1; i <= 2; i++) obj(`map/world/desert/ruins_${i}.webp`, 'ancient sandstone ruins on one tile: broken columns, fallen blocks, half buried in sand', `Ruines du désert (variante ${i})`);
for (let i = 1; i <= 3; i++) obj(`map/world/desert/palms_${i}.webp`, 'two or three date palms and green bushes, the vegetation at the edge of a desert oasis, on one tile', `Palmiers au bord d'une oasis (variante ${i})`);
obj('map/world/river/bridge_x.webp', 'one section of a wooden bridge deck with railings over river water, running along the tile from its top-left side to its bottom-right side and cut square at both ends so that sections join into one bridge across the river; the water under it is NOT drawn (transparent)', 'Pont (axe haut-gauche → bas-droite) : passage à vitesse normale');
obj('map/world/river/bridge_y.webp', 'one section of a wooden bridge deck with railings over river water, running along the tile from its top-right side to its bottom-left side and cut square at both ends so that sections join into one bridge across the river; the water under it is NOT drawn (transparent)', 'Pont (axe haut-droite → bas-gauche)');
obj('map/world/river/ford_x.webp', 'a ford: a line of flat stepping stones and a gravel shoal with small white riffles, running across the tile from its top-left side to its bottom-right side; the water around it is NOT drawn (transparent)', 'Gué (axe haut-gauche → bas-droite) : passage moitié moins vite');
obj('map/world/river/ford_y.webp', 'a ford: a line of flat stepping stones and a gravel shoal with small white riffles, running across the tile from its top-right side to its bottom-left side; the water around it is NOT drawn (transparent)', 'Gué (axe haut-droite → bas-gauche)');
for (let i = 1; i <= 3; i++) obj(`map/world/water/boat_${i}.webp`, ['a small wooden sailing boat with a white sail', 'a small fishing rowboat with two oars and a net', 'a flat river barge loaded with crates and barrels'][i - 1] + ', floating; the water is NOT drawn (transparent), only the boat and a few soft ripples', `Bateau (décor, variante ${i}) sur les rivières et les lacs`);
obj('map/world/water/dock_x.webp', 'a short wooden pier on posts reaching out over the water from the top-left side of the tile toward the bottom-right, a moored rowboat; the water is NOT drawn (transparent)', 'Quai (décor) au bord de l\'eau');
obj('map/world/water/dock_y.webp', 'a short wooden pier on posts reaching out over the water from the top-right side of the tile toward the bottom-left, a moored rowboat; the water is NOT drawn (transparent)', 'Quai (décor) au bord de l\'eau');

// ---- villes 2 × 2 (même noms qu'avant, cadrage 2 × 2) ----
const CITY = {
  t1: (c) => `a small walled village ${CIV_LOOK[c]}; a low wall or palisade around a dozen houses, a main hall in the middle, two banners`,
  t2: (c) => `a walled town ${CIV_LOOK[c]}; a stone wall with a gate and two towers around about twenty houses and a larger central building, banners`,
  t3: (c) => `a fortified capital city ${CIV_LOOK[c]}; high stone walls with corner towers and a gatehouse around a dense town and a grand palace or temple in the middle, many banners`,
  colony: (c) => `a small secondary settlement ${CIV_LOOK[c]}; a wooden palisade around a few houses and a storehouse, one banner`,
  colony_fortified: (c) => `a fortified secondary city ${CIV_LOOK[c]}; a stone wall with two towers around a compact town, banners`
};
const cityFile = { t1: (c) => `map/cities/${c.toLowerCase()}.webp`, t2: (c) => `map/cities/${c.toLowerCase()}_t2.webp`, t3: (c) => `map/cities/capital_${c.toLowerCase()}.webp`, colony: (c) => `map/cities/colony_${c.toLowerCase()}.webp`, colony_fortified: (c) => `map/cities/colony_${c.toLowerCase()}_fortified.webp` };

// ---- liste complète ----
function targets() {
  const out = [];
  for (const t of GROUND_ORDER) out.push({ file: `map/world/ground/${t}.webp`, frame: 'texture', kind: 'ground', terrain: t, role: `Sol de la carte : ${GROUND_FR[t]} (texture répétable ; le jeu fait les fondus avec les sols voisins)` });
  for (const [file, o] of Object.entries(OBJECTS)) out.push({ file, frame: 'mapobject', kind: 'object', role: o.role });
  for (const c of CIVS) for (const k of Object.keys(CITY)) out.push({ file: cityFile[k](c), frame: 'mapcity', kind: 'city', civ: c, tier: k, role: `Ville ${k} de ${c} sur 2 × 2 cases (carte du monde)` });
  return out;
}

function promptFor(file) {
  let subject = null, comp = COMPOSITION.object, m;
  if ((m = file.match(/^map\/world\/ground\/(\w+)\.webp$/)) && GROUND[m[1]]) { subject = groundSubject(m[1]); comp = COMPOSITION.ground; }
  else if (OBJECTS[file]) subject = OBJECTS[file].subject;
  else {
    for (const c of CIVS) for (const k of Object.keys(CITY)) if (cityFile[k](c) === file) { subject = CITY[k](c); comp = COMPOSITION.city; }
  }
  if (!subject) return null;
  if (comp === COMPOSITION.ground) return `${GROUND_STYLE}\n\n${comp}\n\nSubject: ${subject}`;
  return `${MAP_STYLE} ${BG}\n\n${comp}\n\nSubject: ${subject}`;
}

// Images de la carte à l'ancien format remplacées par celles-ci (ne plus les générer)
const SUPERSEDED = /^map\/terrain\//;

module.exports = { MAP_STYLE, GROUND_STYLE, BG, STYLE_REF, COMPOSITION, GROUND, GROUND_FR, GROUND_ORDER, OBJECTS, CITY, CIVS, targets, promptFor, SUPERSEDED };
