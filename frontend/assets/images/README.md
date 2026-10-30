# Images du jeu

Tout est généré par du code, rien n'est dessiné à la main. Deux générateurs :

## Sprites 2.5D rendus en 3D — `npm run build:3d` (`node tools/build-3d.cjs`) → `3d/`

Three.js dans Chromium headless (Playwright, SwiftShader) : modèles 3D éclairés (soleil + ombres douces,
lumière d'ambiance), textures peintes procédurales (pierre, marbre, grès, enduit, planches, chaume, tuiles,
ardoise, peau, mosaïque, tissu, métal, or, herbe, terre, sable, neige, eau), contour à l'encre, sortie WebP
avec transparence rendue en 2× (écrans haute densité). Modules dans `tools/render3d/` :

| Module | Rôle |
|---|---|
| `10-engine.js` | caméras orthographiques (iso 2:1, trois-quarts, buste, icône, face), lumières, cadres/ancres, contour, export |
| `20-textures.js` | textures peintes (CanvasTexture) et matériaux |
| `30-primitives.js` | boîtes, cylindres, toits (pignon, pavillon, plat, dôme, tente), colonnes, portes, fenêtres, arbres, rochers, objets |
| `40-factions.js` | grammaire architecturale par civilisation (toits, portes, colonnes, drapeaux, ornements, neige) |
| `50-buildings.js` | les 39 bâtiments |
| `51-fields.js` | champs (3 paliers × 3 biomes) et parcelles |
| `52-props.js` | décors de scène |
| `53-map.js` | sprites de la carte : villes, ressources, terrain, unités en marche |
| `54-figures.js` | figurines (4 classes × 6 factions), bustes, héros |
| `55-icons.js` | icônes 3D de l'interface |
| `56-ui.js` | boutons, cadres, plaques, barres (9-slice) |
| `57-scenes.js` | panorama de connexion, estrades de héros, en-têtes d'écrans, champ de bataille |
| `58-walls.js` | enceinte : courtines et tours d'angle par faction et palier du Mur |
| `90-jobs.js` | liste des rendus |

| Dossier | Contenu | Cadre (1×) | Ancre |
|---|---|---|---|
| `buildings/<FACTION>/<KEY>[_snow].webp` | 39 bâtiments × ROME GAUL GREEK EGYPT HUN SULTAN, variante enneigée | 130×180 | (0.5, 0.75) = centre du losange au sol, qui fait 100 px de large |
| `plots/<biome>_<0\|1>.webp` | parcelle au sol du biome, sous chaque cellule de la ville et sous les emplacements vides | 130×180 | idem |
| `fields/<biome>/<TYPE>_<1\|2\|3>.webp` | FARM LUMBER QUARRY IRON_MINE × paliers (nv 1-6, 7-13, 14-20) × forest desert snow | 130×180 | idem |
| `walls/<FACTION>/<palier>_<seg_x\|seg_z>[_low][_snow].webp`, `walls/<FACTION>/<palier>_tower[_snow].webp` | enceinte : tronçon de courtine d'une cellule le long de x ou de z, haut ou muret (avant de la ville), tour d'angle ; paliers 1-3 selon le niveau du Mur (1-6, 7-13, 14-20), variante enneigée | 130×180 | (0.5, 0.75) = milieu du tronçon au sol |
| `props/<nom>.webp` | pine pine2 oak oak2 bush rock rock2 palm cactus dune snowpine snowrock stump flowers | 64×96 | bas-centre (0.5, 0.92) |
| `map/{cities,resources,terrain,units}/*.webp`, `map/manifest.json` | carte du monde (villes par faction + capital + default, ressources avec variantes `_desert` `_snow`, terrain par biome, unités `<type>_<FACTION>`, merchant) | 256×256 | (0.5, 0.797) |
| `figures/<CLASSE>_<FACTION>.webp` | figurines en vue trois-quarts (cartes d'unités) | 128×192 | pieds (0.5, 0.94) |
| `busts/<CLASSE>[_<FACTION>].webp` | jetons d'unités (`unitIconHtml()`) | 64×64 | centre |
| `heroes/<FACTION>.webp`, `heroes/<FACTION>_bust.webp` | héros sur son socle, buste (`heroPortraitHtml()`) | 256×384, 64×64 | |
| `ui/<nom>.webp` | icônes 3D : wood stone iron food gold population build army recruit city fields map reports ranking inventory hero alliance market settings attack defense expedition clock home | 64×64 | |
| `ui/btn-*.webp`, `ui/frame-*.webp`, `ui/plate-*.webp`, `ui/bar-wood.webp` | habillage de l'interface, utilisé en `border-image` 9-slice (voir la section « Habillage 2.5D » de `css/style.css`) | 160×56, 192×192, 160×96 | |
| `logo/medallion.webp`, `logo/medallion.png`, `logo/icon.png` | emblème : casque de légionnaire doré, laurier, médaillon ; version opaque 1024 px pour l'icône d'application | 512×512 (1024 px) | |
| `scenes/*.webp` | `auth-portrait`, `auth-landscape` (île des six civilisations), `hero-<FACTION>` (estrade), `header-<écran>` (marché, alliance, classement, inventaire, rapports), `battlefield` | | |

`3d/manifest.json` donne les cadres (`w h ax ay ppu`) et la liste des fichiers par catégorie.
Options : `--only=<regex sur l'identifiant du rendu>`, `--workers=N` (défaut 3), `--sheet[=nom]` (planche de contrôle
PNG dans `tools/render3d/out/`), `--manifest-only` (réécrit les manifestes sans rendre). Un rendu complet (~700 sprites) prend environ 90 s avec 4 rendus en parallèle.

Côté client : `SPRITE_FRAME`, `SPRITE_PLOT_W`, `PROP_FRAME` (`js/app/01-core.js`) décrivent les cadres ;
`buildingSpriteUrl`, `fieldSpriteUrl`, `plotSpriteUrl`, `unitIconHtml`, `heroPortraitHtml`, `heroStageUrl`,
`resIconHtml` construisent les chemins ; `drawSprite` / `drawProp` dessinent un sprite par son point au sol.

## SVG et PNG — `npm run build:assets` (`node tools/build-assets.cjs [--png]`)

- `terrain/<grass|dirt|sand|snow>.svg` : tuiles 128×128 répétables (textures de sol des vues ville, champs et carte)
- `ui/<close|info|left|right|menu|minus|plus|moon|sun>.svg` : glyphes d'interface (`ui/manifest.json`)
- avec `--png` : `icon-1024.png`, `favicon.png`, icônes de lanceur Android/iOS et écrans de démarrage (médaillon 3D + titre en Cinzel), `splash-preview.png`
