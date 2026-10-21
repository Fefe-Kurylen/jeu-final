// ============================================================================
// targets.cjs — registre de TOUTES les images que le jeu peut recevoir : sprites du manifeste 3D (avec guide),
// textures / décalques / bordures (sans guide), compléments et animations du guide (docs/GUIDE-COMPLEMENTS-ANIMATIONS.md).
// Utilisé par repaint.cjs (import, kit) et check-incoming.cjs (vérification des livraisons).
// Chaque cible : { file (chemin final .webp dans painted/), cat, frame (famille → taille en pixels du fichier final),
//                  fit ('canvas' : composition du kit sur un canevas 1024, 'direct' : mise à l'échelle dans le cadre,
//                  'flat' : copie à taille fixe), anim { base, n, i } pour une phase d'animation, role (à quoi ça sert) }
// ============================================================================
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const prompts = require('./prompts.cjs');
const { TEXTURE, DECAL, EDGE, ICON_DESC, BUILDING, PROP, MAP, RES, TERRAIN, CLASS, SCENE } = prompts;

const CIVS = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
const CIV_FR = { ROME: 'Rome', GAUL: 'Gaule', GREEK: 'Grèce', EGYPT: 'Égypte', HUN: 'Huns', SULTAN: 'Sultanat' };
// Taille en pixels des fichiers finaux par famille (rendus 3D : cadre logique × 2)
const FRAMES = { building: [260, 360], plot: [260, 360], field: [260, 360], prop: [128, 192], map: [512, 512], figure: [256, 384], bust: [128, 128], icon: [128, 128], stage: [512, 768], header: [480, 240], battlefield: [1280, 480], sceneP: [1080, 1920], sceneL: [1920, 1080], button: [320, 112], frame: [384, 384], plate: [320, 192], puff: [128, 128], fx: [256, 256], texture: [1024, 1024], edge: [1024, 256], decal: [1024, 1024], store: null };
// Taille de livraison attendue (ce que le graphiste produit) par famille
const DELIVERY = { building: '1024x1024', plot: '1024x1024', field: '1024x1024', prop: '512x768', map: '1024x1024', figure: '1024x1536', bust: '1024x1024', icon: '1024x1024', stage: '1024x1536', header: '1536x1024', battlefield: '1536x1024', sceneP: '1024x1536', sceneL: '1536x1024', button: '1024x1024', frame: '1024x1024', plate: '1024x1024', puff: '1024x1024', fx: '512x512', texture: '1024x1024', edge: '1024x256', decal: '1024x1024' };

let buildingsData = null;
try { buildingsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'buildings.json'), 'utf8')).buildings; } catch (e) { buildingsData = []; }
const bName = (key) => buildingsData.find(b => b.key === key)?.name || key;
let unitsData = [];
try { const uj = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'units.json'), 'utf8')); unitsData = Array.isArray(uj) ? uj : (uj.units || []); } catch (e) { unitsData = []; }

// ---- famille d'un fichier du manifeste 3D ----
function frameOfFile(file) {
  if (file.startsWith('buildings/')) return 'building';
  if (file.startsWith('plots/')) return 'plot';
  if (file.startsWith('fields/')) return 'field';
  if (file.startsWith('walls/')) return 'building';
  if (file.startsWith('props/puff') || file.startsWith('props/ripple')) return 'puff';
  if (file.startsWith('props/')) return 'prop';
  if (file.startsWith('map/')) return 'map';
  if (file.startsWith('figures/')) return 'figure';
  if (file.startsWith('busts/') || /^heroes\/\w+_bust\.webp$/.test(file)) return 'bust';
  if (file.startsWith('heroes/')) return 'stage';
  if (/^scenes\/auth-portrait/.test(file)) return 'sceneP';
  if (/^scenes\/auth-landscape/.test(file)) return 'sceneL';
  if (/^scenes\/hero-/.test(file)) return 'stage';
  if (/^scenes\/(header|vignette)-/.test(file)) return 'header';
  if (/^scenes\/battlefield/.test(file)) return 'battlefield';
  if (/^ui\/btn-/.test(file)) return 'button';
  if (/^ui\/frame-/.test(file)) return 'frame';
  if (/^ui\/(plate-|bar-)/.test(file)) return 'plate';
  if (file.startsWith('ui/')) return 'icon';
  if (file.startsWith('logo/')) return 'icon';
  return 'icon';
}

// ---- rôle (à quoi sert l'image dans le jeu) ----
function describe(file) {
  let m;
  if ((m = file.match(/^buildings\/(\w+)\/([A-Z_]+?)(_t1|_t3)?(_snow)?\.webp$/))) {
    const tier = m[3] === '_t1' ? 'niveaux 1-6' : m[3] === '_t3' ? 'niveaux 14-20' : 'niveaux 7-13';
    return `Bâtiment « ${bName(m[2])} » de ${CIV_FR[m[1]] || m[1]}, ${tier}${m[4] ? ', version enneigée' : ''} : vue ville, vignettes des panneaux et fiches`;
  }
  if ((m = file.match(/^walls\/(\w+)\/(\d)_(seg_x|seg_z|tower)(_low)?(_snow)?\.webp$/))) {
    const what = m[3] === 'tower' ? 'tour d\'angle' : `courtine ${m[3] === 'seg_x' ? 'de face droite' : 'de face gauche'}${m[4] ? ' (muret bas, devant la ville)' : ' (haute, derrière)'}`;
    return `Enceinte de ${CIV_FR[m[1]]}, palier ${m[2]} du Mur (${['1-6', '7-13', '14-20'][m[2] - 1]}) : ${what}${m[5] ? ', enneigée' : ''}`;
  }
  if ((m = file.match(/^fields\/(\w+)\/([A-Z_]+)_(\d)\.webp$/))) return `Champ « ${bName(m[2])} » niveaux ${['1-6', '7-13', '14-20'][m[3] - 1]}, biome ${m[1]} : troisième anneau de la ville`;
  if ((m = file.match(/^plots\/(\w+)_(\d)\.webp$/))) return `Parcelle au sol (variante ${m[2]}) du biome ${m[1]} : sous chaque bâtiment et pour les emplacements libres`;
  if ((m = file.match(/^props\/flag_(\w+)_(\d)\.webp$/))) return `Drapeau ${m[1]}, phase ${m[2]}/8 (animé, conservé en 3D)`;
  if ((m = file.match(/^props\/(puff|ripple)_(\d)\.webp$/))) return `${m[1] === 'puff' ? 'Fumée' : 'Onde d\'eau'}, phase ${m[2]}/4 (animé)`;
  if ((m = file.match(/^props\/(\w+)\.webp$/)) && PROP[m[1]]) return `Décor de scène « ${m[1]} » : autour de la ville et des champs (${PROP[m[1]]})`;
  if ((m = file.match(/^map\/cities\/(\w+)\.webp$/))) return `Carte du monde : ville « ${m[1]} » (${MAP[m[1]] ? MAP[m[1]].slice(0, 60) : ''}…)`;
  if ((m = file.match(/^map\/resources\/(\w+?)(_desert|_snow)?\.webp$/))) return `Carte du monde : point de ressource ${m[1]}${m[2] ? ` (${m[2].slice(1)})` : ''}`;
  if ((m = file.match(/^map\/terrain\/(\w+)\.webp$/))) return `Carte du monde : relief « ${m[1]} » (${(TERRAIN[m[1]] || '').slice(0, 70)})`;
  if ((m = file.match(/^map\/camps\/(camp[123]|ruins)(_desert|_snow)?\.webp$/))) return `Carte du monde : camp barbare ${m[1] === 'ruins' ? 'détruit, en attente de la réapparition de la tribu' : 'de niveau ' + m[1].slice(4) + ' (tribu qui tient un point de ressource)'}${m[2] ? ` (${m[2].slice(1)})` : ''}`;
  if ((m = file.match(/^map\/camps\/banner_([A-Z]+)\.webp$/))) return `Carte du monde : bannière de tribu ${CIV_FR[m[1]] || m[1]} posée sur son camp`;
  if ((m = file.match(/^map\/units\/(\w+?)(_[A-Z]+)?\.webp$/))) return `Carte du monde : armée en marche « ${m[1]} »${m[2] ? ' de ' + (CIV_FR[m[2].slice(1)] || m[2].slice(1)) : ''} (aussi dans le replay de bataille)`;
  if ((m = file.match(/^figures\/([A-Z]+)_(\w+)\.webp$/))) return `Figurine en pied : ${CLASS[m[1]] || m[1]} de ${CIV_FR[m[2]]} (fiches d'unité, cartes de recrutement)`;
  if ((m = file.match(/^busts\/([A-Z]+)(?:_(\w+))?\.webp$/))) return `Buste-jeton : ${CLASS[m[1]] || m[1]}${m[2] ? ' de ' + CIV_FR[m[2]] : ' (neutre)'} (listes, rapports, composition d'armée)`;
  if ((m = file.match(/^heroes\/(\w+)_bust\.webp$/))) return `Buste du héros de ${CIV_FR[m[1]]} (cartes d'armée, choix de civilisation)`;
  if ((m = file.match(/^heroes\/(\w+)\.webp$/))) return `Héros de ${CIV_FR[m[1]]} en pied`;
  if ((m = file.match(/^scenes\/(\S+)\.webp$/))) return `Scène « ${m[1]} » : ${m[1].startsWith('auth') ? 'écran de connexion' : m[1].startsWith('hero-') ? 'estrade de l\'écran du héros' : m[1].startsWith('header-') ? 'bandeau en tête d\'écran' : 'fond du replay de bataille'}`;
  if ((m = file.match(/^ui\/item_(\w+)\.webp$/))) return `Icône de l'objet du héros « ${m[1]} » (inventaire, équipement)`;
  if ((m = file.match(/^ui\/btn-(\w+?)(-pressed)?\.webp$/))) return `Habillage : bouton ${m[1]}${m[2] ? ' enfoncé' : ''}`;
  if ((m = file.match(/^ui\/(frame-\w+|plate-\w+|bar-\w+)\.webp$/))) return `Habillage : ${m[1]} (cadres, plaques, barres de l'interface)`;
  if ((m = file.match(/^ui\/fx_(\w+)_(\d)\.webp$/))) return `Effet d'interface « ${m[1]} », phase ${m[2]}`;
  if ((m = file.match(/^ui\/crest_(\w+)\.webp$/))) return `Blason de ${CIV_FR[m[1]]} (inscription, alliance, étiquettes de carte)`;
  if ((m = file.match(/^ui\/(\w+)\.webp$/))) return `Icône d'interface « ${m[1]} »${ICON_DESC[m[1]] ? ` (${ICON_DESC[m[1]]})` : ''}`;
  if ((m = file.match(/^terrain\/edge_(\w+)\.webp$/))) return `Bordure de transition « ${m[1]} » (rives, routes)`;
  if ((m = file.match(/^terrain\/(\w+)\.webp$/))) return `Texture de sol « ${m[1]} » : ${TEXTURE_ROLE[m[1]] || 'sol'}`;
  if ((m = file.match(/^decals\/(\w+)\.webp$/))) return `Décalque au sol « ${m[1]} » (${DECAL[m[1]] || ''}), semé dans la ville et aux alentours`;
  if (file.startsWith('logo/')) return 'Emblème (icône de l\'application, favicon, splash)';
  const ex = EXTRAS.find(t => t.file === file);
  return ex ? ex.role : 'Image du jeu';
}
const TEXTURE_ROLE = {
  grass: 'sol de base prairie', dirt: 'terre battue (plaza, avenues, route par défaut)', sand: 'sol de base désert', snow: 'sol de base neige',
  grass_lawn: 'sol de l\'enceinte en prairie', grass_dark: 'sous-bois, lisières', grass_dry: 'alentours de la ville en prairie', grass_flowers: 'prairie fleurie', grass_hills: 'carte du monde (prairie)',
  dirt_packed: 'terre battue, plaza hunnique', mud: 'boue', gravel: 'gravier', sand_ripples: 'sol de l\'enceinte en désert, carte', sand_rocky: 'alentours en désert', cracked_earth: 'terre craquelée',
  snow_fresh: 'sol de l\'enceinte en neige', snow_trampled: 'avenues et plaza en neige', tundra: 'alentours en neige, carte',
  water_lake: 'étangs de la ville, lacs de la carte', water_deep: 'mers et grands lacs', water_river: 'rivières', water_shallow: 'oasis, rives, douves', ice: 'lacs gelés, douves en neige',
  plaza_ROME: 'plaza de Rome', plaza_GAUL: 'plaza de Gaule', plaza_GREEK: 'plaza de Grèce', plaza_EGYPT: 'plaza d\'Égypte', plaza_HUN: 'plaza des Huns', plaza_SULTAN: 'plaza du Sultanat',
  cobble: 'avenues de la ville', flagstone: 'dallages', road_dirt: 'route hors de la ville', road_paved: 'routes de la carte', path_sand: 'pistes du désert',
  soil_tilled: 'champs vides', wheat: 'fermes développées', orchard: 'vergers'
};

// ---- compléments et animations (sans guide 3D) ----
const EXTRAS = [];
const add = (file, frame, role, extra = {}) => EXTRAS.push({ file, cat: file.split('/')[0], frame, fit: frame === 'building' ? 'canvas' : 'direct', role, ...extra });
const anim = (base, n, frame, role) => { for (let i = 0; i < n; i++) add(`${base}_${i}.webp`, frame, `${role} — phase ${i + 1}/${n}`, { anim: { base, n, i } }); };
for (const c of CIVS) add(`walls/${c}/gate.webp`, 'building', `Porte de la ville de ${CIV_FR[c]} (arête sud-est de l'enceinte)`);
// Camps barbares de la carte (tribus des points de ressource) : niveau 1 à 3, variantes désert / neige, ruines, bannières
for (const lvl of [1, 2, 3]) for (const b of ['', '_desert', '_snow']) add(`map/camps/camp${lvl}${b}.webp`, 'map', `Camp barbare de niveau ${lvl} sur la carte${b ? ` (${b.slice(1)})` : ''} : remplace l'icône de ressource tant que la tribu tient le point`);
for (const b of ['', '_desert', '_snow']) add(`map/camps/ruins${b}.webp`, 'map', `Camp barbare détruit${b ? ` (${b.slice(1)})` : ''} : affiché jusqu'à la réapparition de la tribu`);
for (const c of CIVS) add(`map/camps/banner_${c}.webp`, 'map', `Bannière de tribu ${CIV_FR[c]} posée sur le camp`);
add('props/sign_build.webp', 'prop', 'Panneau « construire ici » sur les emplacements libres');
add('props/scroll_research.webp', 'prop', 'Parchemin « recherche en cours » au-dessus de l\'Académie');
// Technologies : une icône par technologie (cartes de l'onglet Recherche, fiches) et par branche
for (const k of ['AGRONOMY', 'ENGINEERING', 'TRAINING', 'TACTICS', 'DISCIPLINE', 'MEDICINE', 'CARTOGRAPHY', 'SUPPLY']) add(`ui/tech_${k}.webp`, 'icon', `Icône de la technologie ${k} (onglet Recherche de l'Académie, fiche)`);
for (const k of ['ECONOMY', 'MILITARY', 'DEFENSE', 'LOGISTICS']) add(`ui/branch_${k}.webp`, 'icon', `Icône de la branche de recherche ${k}`);
add('ui/settler.webp', 'icon', 'Icône du colon (onglet Colons de la Résidence, carte d\'armée, bouton « Fonder une ville » de la carte)');
for (const c of CIVS) add(`ui/crest_${c}.webp`, 'icon', `Blason de ${CIV_FR[c]}`);

// ---- villes secondaires, tribus, chantiers (octobre 2026 ; docs/GUIDE-COMPLEMENTS-ANIMATIONS.md § S10-S15) ----
// Chantiers : chaque bâtiment en construction, par civilisation ; le guide de composition est le rendu 3D du bâtiment fini
// (même emprise, même cadrage) ; les champs en chantier par biome ; l'enceinte en chantier
const SITE_SKIP = ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'WALL', 'MOAT'];
for (const c of CIVS) for (const b of buildingsData) {
  if (SITE_SKIP.includes(b.key) || (b.faction && b.faction !== c)) continue;
  EXTRAS.push({ file: `buildings/${c}/${b.key}_site.webp`, cat: 'buildings', frame: 'building', fit: 'canvas', guide: true, guideFile: `buildings/${c}/${b.key}.webp`, site: true, role: `Chantier « ${b.name} » de ${CIV_FR[c]} : à la place du bâtiment pendant sa première construction (techniques de chantier de ${CIV_FR[c]})` });
}
for (const biome of ['forest', 'desert', 'snow']) for (const k of ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE']) add(`fields/${biome}/${k}_site.webp`, 'field', `Champ « ${bName(k)} » en chantier (biome ${biome}) : à la place de la parcelle vide pendant la première construction`, { fit: 'canvas', guide: true, guideFile: `fields/${biome}/${k}_1.webp`, site: true });
for (const c of CIVS) for (const k of ['seg_x', 'seg_z', 'tower']) add(`walls/${c}/site_${k}.webp`, 'building', `Enceinte de ${CIV_FR[c]} en chantier : ${k === 'tower' ? 'tour d\'angle' : 'courtine'} en travaux (premier palier du Mur)`, { guide: true, guideFile: `walls/${c}/1_${k}.webp`, site: true });
// Colons et villes secondaires : cortège sur la carte (+ cycle de marche), campement de fondation, colonie, portraits, vignette
add('map/units/settler.webp', 'map', 'Carte du monde : cortège de colons en marche (armée partie fonder une ville ; charrette du marchand tant que ce sprite manque)');
for (const c of CIVS) add(`map/units/settler_${c}.webp`, 'map', `Carte du monde : cortège de colons de ${CIV_FR[c]}`);
anim('map/units/settler_walk', 6, 'map', 'Cycle de marche sur la carte : cortège de colons');
for (const b of ['', '_desert', '_snow']) add(`map/camps/foundation${b}.webp`, 'map', `Carte du monde : campement de fondation${b ? ` (${b.slice(1)})` : ''} pendant les 24 h de fondation d'une ville (remplace l'icône du point)`);
// Ville à l'état normal, palier 2 « Ville » (Bâtiment principal ≥ 10) : entre le village (sprite <civ>) et la forteresse (capital_<civ>)
for (const c of CIVS) add(`map/cities/${c.toLowerCase()}_t2.webp`, 'map', `Carte du monde : ville de ${CIV_FR[c]} au palier « Ville » (Bâtiment principal 10 à 19), plus grande que le village, avec un premier mur bas ; état normal`, { guide: true, guideFile: `map/cities/${c.toLowerCase()}.webp` });
for (const c of CIVS) add(`map/cities/colony_${c.toLowerCase()}.webp`, 'map', `Carte du monde : ville secondaire (colonie) de ${CIV_FR[c]}, plus petite que la ville de départ`);
// Villes secondaires : deux paliers, normal (colony_<civ>, Bâtiment principal < 20) et fortifié (Bâtiment principal ≥ 20)
for (const c of CIVS) add(`map/cities/colony_${c.toLowerCase()}_fortified.webp`, 'map', `Carte du monde : ville secondaire fortifiée de ${CIV_FR[c]} (Bâtiment principal 20 et plus), état normal, plus modeste que la capitale fortifiée`);
for (const c of CIVS) add(`busts/SETTLER_${c}.webp`, 'bust', `Portrait du colon de ${CIV_FR[c]} (onglet Colons de la Résidence, modale de fondation, carte d'armée)`);
add('scenes/vignette-founding.webp', 'header', 'Vignette « fondation d\'une ville » (onglet Colons, modale de fondation)');
// Tribus des points de ressource : chefs (rapports, bulle), vignettes des rapports, icône
for (const c of CIVS) add(`busts/TRIBE_${c}.webp`, 'bust', `Chef de la tribu locale ${CIV_FR[c]} (rapports de combat contre une tribu, bulle du point)`);
for (const b of ['forest', 'desert', 'snow']) add(`scenes/vignette-tribe-${b}.webp`, 'header', `Vignette du camp d'une tribu locale (${b}) en tête des rapports « Combat contre la tribu »`);
add('ui/tribe.webp', 'icon', 'Icône « tribu locale » (bulle du point, rapports, listes)');

// ---- le tour complet (octobre 2026 ; docs/GUIDE-COMPLEMENTS-ANIMATIONS.md § S16-S20, A12-A18) ----
// Ville fidèle à sa civilisation : ornements de plaza, drapeaux peints, douves ; vie de la ville : gens des champs, animaux,
// bâtiments vivants, fumées peintes
for (const c of CIVS) for (const k of ['statue', 'fountain', 'stall']) add(`props/plaza_${c}_${k}.webp`, 'prop', `Ornement de plaza de ${CIV_FR[c]} : ${k === 'statue' ? 'statue' : k === 'fountain' ? 'fontaine ou puits' : 'étal de marché'} (autour du Bâtiment principal)`);
for (const c of CIVS) anim(`props/flagp_${c}`, 8, 'prop', `Drapeau peint de ${CIV_FR[c]} (remplace le drapeau 3D animé)`);
for (const c of CIVS) for (const k of ['seg_x', 'seg_z', 'corner']) add(`walls/${c}/moat_${k}.webp`, 'building', `Douves de ${CIV_FR[c]} au pied de l'enceinte : ${k === 'corner' ? 'angle' : 'tronçon'} (bâtiment Douves, à brancher à la livraison)`);
for (const k of ['farmer', 'lumberjack', 'quarryman', 'miner']) anim(`props/${k}`, 4, 'prop', `${({ farmer: 'Paysan qui fauche', lumberjack: 'Bûcheron qui abat un arbre', quarryman: 'Carrier qui taille un bloc', miner: 'Mineur à la pioche' })[k]} (champs de la ville)`);
for (const k of ['chicken', 'dog', 'goat', 'cat']) anim(`props/animal_${k}`, 4, 'prop', `${({ chicken: 'Poule', dog: 'Chien', goat: 'Chèvre', cat: 'Chat' })[k]} qui se promène dans la ville`);
for (const k of ['barracks_drill', 'market_crowd', 'stable_horse', 'workshop_hammer', 'bakery_smoke', 'watchtower_beacon']) anim(`anim/${k}`, 4, 'fx', `Bâtiment vivant : ${({ barracks_drill: 'soldats à l\'exercice devant la Caserne', market_crowd: 'badauds et marchands au Marché', stable_horse: 'cheval qui piaffe à l\'Écurie', workshop_hammer: 'marteau et copeaux à l\'Atelier', bakery_smoke: 'fumée et lueur du four de la Boulangerie', watchtower_beacon: 'feu de veille au sommet de la Tour de guet' })[k]}`);
anim('props/smoke_chimney', 4, 'prop', 'Fumée de cheminée peinte (remplace les bouffées 3D)'); anim('props/smoke_campfire', 4, 'prop', 'Fumée de feu de camp peinte');
// Fiches d'unité : une figurine et un jeton par unité (les classes génériques restent en repli)
for (const u of unitsData) { add(`figures/units/${u.key}.webp`, 'figure', `Figurine en pied de l'unité « ${u.name} » (${CIV_FR[u.faction] || u.faction}, ${u.tier}) : fiche d'unité, carte de recrutement`); add(`busts/units/${u.key}.webp`, 'bust', `Jeton de l'unité « ${u.name} » (${CIV_FR[u.faction] || u.faction}) : listes, rapports, composition d'armée`); }
// Carte : héros en tête d'armée, espion en mission, météo
for (const c of CIVS) add(`map/units/hero_${c}.webp`, 'map', `Carte du monde : armée menée par le héros de ${CIV_FR[c]} (marqueur avec le héros devant la troupe)`);
add('map/units/spy.webp', 'map', 'Carte du monde : espion en mission (silhouette encapuchonnée à cheval)');
anim('map/fx/rain', 4, 'fx', 'Carte du monde : pluie (nappe translucide)'); anim('map/fx/snowfall', 4, 'fx', 'Carte du monde : chute de neige sur les régions enneigées');
// Héros : apparence par palier de niveau, héros au combat dans le replay
for (const c of CIVS) for (const t of [2, 3]) { add(`heroes/${c}_t${t}.webp`, 'stage', `Héros de ${CIV_FR[c]} au palier ${t} (niveaux ${t === 2 ? '10-19' : '20+'}) : armure et cape plus riches`); add(`heroes/${c}_bust_t${t}.webp`, 'bust', `Buste du héros de ${CIV_FR[c]} au palier ${t}`); }
for (const c of CIVS) anim(`map/units/hero_${c}_attack`, 3, 'map', `Replay : le héros de ${CIV_FR[c]} attaque`);
// Inscription et bandeaux
for (const c of CIVS) add(`scenes/faction-${c}.webp`, 'header', `Paysage de ${CIV_FR[c]} derrière sa carte de civilisation (inscription)`);
for (const k of ['army', 'research']) add(`scenes/header-${k}.webp`, 'header', `Bandeau en tête de l'écran ${k === 'army' ? 'Armée' : 'Recherche'}`);
for (const d of ['forest', 'desert', 'mountain', 'ruins']) add(`scenes/expedition-${d}.webp`, 'header', `Vignette de destination d'expédition : ${d}`);
add('ui/btn-round.webp', 'frame', 'Bouton rond des bulles d\'action'); add('ui/btn-round-pressed.webp', 'frame', 'Bouton rond des bulles d\'action, enfoncé');
// Échafaudages génériques par civilisation (posés sur un bâtiment amélioré, ou sur un nouveau bâtiment sans sprite de chantier)
for (const c of CIVS) for (const k of [1, 2, 3]) add(`props/scaffold_${c}_${k}.webp`, 'building', `Échafaudage de chantier de ${CIV_FR[c]}, taille ${k} (paliers ${['1-6', '7-13', '14-20'][k - 1]}) : posé sur le bâtiment en travaux`);
for (const c of CIVS) for (const v of ['a', 'b']) anim(`props/villager_${c}_${v}`, 6, 'prop', `Villageois de ${CIV_FR[c]} (${v === 'a' ? 'homme' : 'femme'}) qui marche dans la ville`);
anim('props/flame', 4, 'prop', 'Flamme de torche (tours, porte, remparts)'); anim('props/brazier', 4, 'prop', 'Brasero de la plaza');
for (const c of CIVS) anim(`props/worker_${c}`, 4, 'prop', `Ouvrier de chantier de ${CIV_FR[c]} au marteau`);
anim('anim/mill_sails', 6, 'fx', 'Ailes du moulin'); anim('anim/sparks', 4, 'fx', 'Étincelles de la forge'); anim('anim/furnace', 4, 'fx', 'Feu de la fonderie');
for (const u of ['hoplite', 'archer', 'cavalry', 'catapult', 'merchant']) anim(`map/units/${u}_walk`, 6, 'map', `Cycle de marche sur la carte : ${u}`);
for (const u of ['hoplite', 'archer', 'cavalry', 'catapult']) { anim(`map/units/${u}_attack`, 3, 'map', `Replay : ${u} attaque`); anim(`map/units/${u}_hit`, 2, 'map', `Replay : ${u} touché`); }
add('fx/arrow.webp', 'fx', 'Replay : flèche en vol'); add('fx/stone.webp', 'fx', 'Replay : pierre de catapulte'); anim('fx/impact', 3, 'fx', 'Replay : éclat d\'impact');
// Siège qui dure (octobre 2026, GDD combat_config.siege.visuals) : campement d'engins et de barricades autour d'une ville assiégée
// La ville assiégée elle-même, animée en boucle : même cadrage que le sprite de ville de la carte, qu'elle remplace tant que
// le siège dure (6 civilisations × 3 paliers : Village, Ville, Ville fortifiée × 4 phases)
const SIEGE_TIER_FR = { 1: 'village', 2: 'ville', 3: 'ville fortifiée' };
// Villes secondaires assiégées : deux paliers (normal, fortifié), bandes à part pour garder la silhouette de la colonie
for (const c of CIVS) for (const t of ['normal', 'fortified']) for (let i = 0; i < 4; i++) {
  const base = `map/cities/siege_colony_${c}_${t}`;
  add(`${base}_${i}.webp`, 'map', `Carte du monde : ville secondaire ${t === 'fortified' ? 'fortifiée' : ''} de ${CIV_FR[c]} assiégée, même cadrage que son sprite normal — phase ${i + 1}/4`.replace('  ', ' '), { anim: { base, n: 4, i } });
}
for (const c of CIVS) for (const t of [1, 2, 3]) for (let i = 0; i < 4; i++) {
  const base = `map/cities/siege_${c}_t${t}`;
  add(`${base}_${i}.webp`, 'map', `Carte du monde : ${SIEGE_TIER_FR[t]} de ${CIV_FR[c]} assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase ${i + 1}/4`,
    { anim: { base, n: 4, i }, guide: true, guideFile: `map/cities/${t === 3 ? 'capital_' : ''}${c.toLowerCase()}${t === 2 ? '_t2' : ''}.webp` });
}
add('ui/icons/siege.webp', 'icons', 'Icône « siège » (bélier ou tour de siège) : alerte de siège, carte d\'armée en siège, bouton « Briser le siège »');
anim('map/fx/battle', 4, 'fx', 'Carte : combat en cours'); anim('map/fx/fire', 4, 'fx', 'Carte : ville en feu'); anim('map/fx/campfire', 4, 'fx', 'Carte : feu de camp des tribus');
anim('ui/fx_sparkle', 6, 'fx', 'Interface : construction terminée'); anim('ui/fx_levelup', 6, 'fx', 'Interface : niveau supérieur'); anim('ui/fx_coins', 4, 'fx', 'Interface : butin reçu');
anim('props/snowflake', 3, 'fx', 'Ambiance : flocon'); anim('props/leaf', 3, 'fx', 'Ambiance : feuille'); anim('props/dust_devil', 4, 'fx', 'Ambiance : tourbillon de sable'); anim('props/bird', 3, 'fx', 'Ambiance : oiseau');
for (const c of CIVS) anim(`heroes/${c}_idle`, 3, 'stage', `Héros de ${CIV_FR[c]} en pose d'attente`);
anim('props/cart', 4, 'prop', 'Charrette sur la route'); anim('props/horse_idle', 4, 'prop', 'Chevaux devant l\'écurie');
// Visuels hors jeu (copiés dans store/, pas dans painted/)
const STORE = [
  { file: 'store/ic_stat_notify.png', role: 'Icône de notification Android (blanc sur transparent)', size: [96, 96] },
  { file: 'store/feature-graphic.png', role: 'Bannière Google Play', size: [1024, 500] },
  { file: 'store/icon-1024.png', role: 'Icône de l\'application peinte (boutiques, écran d\'accueil)', size: [1024, 1024] }
];

// ---- toutes les cibles ----
function buildAllTargets() {
  const manifest3d = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend', 'assets', 'images', '3d', 'manifest.json'), 'utf8'));
  const out = [];
  for (const c of Object.keys(manifest3d.categories)) for (const f of manifest3d.categories[c]) {
    if (!f.endsWith('.webp')) continue;
    if (c === 'flags' || c === 'effects' || c === 'logo') continue;   // animés en 3D, emblème : conservés
    if ((c === 'buildings' || c === 'walls') && /_snow\.webp$/.test(f)) continue;   // variantes neige retirées de la liste (octobre 2026) : le rendu 3D enneigé reste
    if (!prompts.promptFor(f)) continue;
    out.push({ cat: c, file: f, frame: frameOfFile(f), fit: 'canvas', guide: true, role: describe(f) });
  }
  for (const n of Object.keys(TEXTURE)) out.push({ cat: 'terrain', file: `terrain/${n}.webp`, frame: 'texture', fit: 'flat', opaque: true, role: describe(`terrain/${n}.webp`) });
  for (const n of Object.keys(EDGE)) out.push({ cat: 'terrain', file: `terrain/${n}.webp`, frame: 'edge', fit: 'flat', opaque: true, role: describe(`terrain/${n}.webp`) });
  for (const n of Object.keys(DECAL)) out.push({ cat: 'decals', file: `decals/${n}.webp`, frame: 'decal', fit: 'flat', opaque: false, role: describe(`decals/${n}.webp`) });
  out.push(...EXTRAS);
  return out;
}
function frameSize(t) { return FRAMES[t.frame] || [1024, 1024]; }
function deliverySize(t) { return DELIVERY[t.frame] || '1024x1024'; }

// ---- correspondance d'un fichier livré ----
// Clé de recherche : chemin relatif sans extension, séparateurs « __ » acceptés, insensible à la casse, dossier guides/ ignoré,
// préfixes parasites avant une catégorie connue retirés
const CATS = 'buildings|fields|plots|props|map|figures|busts|heroes|scenes|walls|ui|terrain|decals|anim|fx|store';
function lookupKey(rel) {
  let k = rel.replace(/\\/g, '/').replace(/\.(png|jpe?g|webp)$/i, '').replace(/^guides\//, '').replace(/__/g, '/').toLowerCase();
  const m = k.match(new RegExp(`(?:^|/)(${CATS})/(.*)$`));
  if (m) k = `${m[1]}/${m[2]}`;
  return k;
}
function buildIndex(all) {
  const byKey = new Map();
  for (const t of all) byKey.set(t.file.replace(/\.webp$/, '').toLowerCase(), t);
  const anims = new Map();   // base -> { base, n, frame, fit, targets[] }
  // Keyed by the lowercased base so that a delivered strip resolves whatever the case (props/worker_EGYPT, heroes/ROME_idle)
  for (const t of all) if (t.anim) { const key = t.anim.base.toLowerCase(); const a = anims.get(key) || { base: t.anim.base, n: t.anim.n, frame: t.frame, fit: t.fit, targets: [] }; a.targets[t.anim.i] = t; anims.set(key, a); }
  return { byKey, anims };
}
// Résout un fichier livré : { target } pour une image simple, { strip } pour une bande d'animation, { store } pour un visuel de boutique
function resolveDelivered(rel, index) {
  const k = lookupKey(rel);
  if (index.byKey.has(k)) return { target: index.byKey.get(k) };
  const k2 = k.replace(/_strip$/, '');
  if (index.anims.has(k2)) return { strip: index.anims.get(k2) };
  for (const s of STORE) if (s.file.replace(/\.png$/, '').toLowerCase() === k || s.file.replace(/^store\//, '').replace(/\.png$/, '').toLowerCase() === k) return { store: s };
  return null;
}
// Suggestions de noms proches (distance de Levenshtein sur les clés)
function suggest(rel, index, n = 3) {
  const k = lookupKey(rel);
  const keys = [...index.byKey.keys(), ...[...index.anims.keys()].map(b => b.toLowerCase())];
  const lev = (a, b) => { const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) dp[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return dp[a.length][b.length]; };
  const base = k.split('/').pop();
  return keys.map(x => ({ x, d: Math.min(lev(k, x), lev(base, x.split('/').pop()) + 1) })).sort((a, b) => a.d - b.d).slice(0, n).filter(s => s.d <= Math.max(4, base.length / 2)).map(s => s.x);
}

module.exports = { FRAMES, DELIVERY, EXTRAS, STORE, CIVS, buildAllTargets, buildIndex, resolveDelivered, suggest, lookupKey, frameSize, deliverySize, describe, frameOfFile };
