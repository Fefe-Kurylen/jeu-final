# Sprites de la vue ville (bâtiments, champs, décors, textures)

Tous les fichiers de `frontend/assets/images` sont **générés** par `node tools/build-assets.cjs`
(`--png` pour les PNG de carte, icônes et écrans de lancement) : ne pas les retoucher à la main,
modifier le générateur.

```
buildings/<FACTION>/<biome>/<KEY>.svg   # 39 bâtiments × ROME GAUL GREEK EGYPT HUN SULTAN × forest desert snow
fields/<FACTION>/<biome>/<TYPE>_<n>.svg # FARM LUMBER QUARRY IRON_MINE × paliers 1 (nv 1-6), 2 (7-13), 3 (14-20)
props/<nom>.svg                          # décors de scène : pine oak bush rock palm cactus dune snowpine snowrock
terrain/<nom>.svg                        # tuiles 128×128 répétables : grass dirt sand snow
buildings/manifest.json                  # factions, clés, biomes, cadre commun (viewBox + ancre)
```

## Cadre commun des sprites ville/champs

- Projection isométrique 2:1, tuile de 2×2 unités (largeur 100 px, hauteur 50 px dans le SVG source).
- `viewBox` identique pour tous (voir `manifest.json`) : le centre de la parcelle au sol est à l'ancre
  `(0.5, 0.697)` de l'image. `drawSprite()` (01-core.js) pose cette ancre sur le centre de l'emplacement.
- Fond transparent ; la parcelle (losange arrondi d'herbe, de sable, de neige…) fait partie du sprite.
- Décors (`props/`) : cadre 64×84, ancre bas-centre (32, 80), `drawProp()`.

## Style

Peint « Travian » avec un trait brun léger : dégradés par face, grain, occlusion au pied des murs,
rangées de tuiles, ombres de contact. Le trait, les sols et les palettes sont centralisés dans
`STYLE`, `GROUND` et `PALETTES` du générateur.

## Architecture par faction (`CUR` dans le générateur)

| Faction | Murs | Toits | Portes / fenêtres | Colonnes | Drapeau | Ornements |
|---|---|---|---|---|---|---|
| ROME | pierre | tuiles terracotta | arc | lisses | vexillum | amphore, buisson |
| GAUL | planches | chaume à poutres croisées | bois | poteaux | pennon | pieux, tonneau |
| GREEK | marbre + méandre | tuiles bleues, fronton | arc | cannelées | pennon | olivier, amphore |
| EGYPT | grès + frise d'or | terrasses à merlons | trapèze, fentes | lotus | banderole | palmier, obélisque |
| HUN | peaux + cordes | feutre, yourte | bois | poteaux | queue de cheval | lances, feu de camp |
| SULTAN | enduit + mosaïque | dômes à croissant, arcades | arc brisé | arcades | croissant | palmier, lanterne |

## Biomes (`BIOME` dans le générateur)

Le biome d'une ville découle de sa position (`getBiome` de la carte). Il change la parcelle au sol
(herbe, sable, neige), les arbres (pins/chênes, palmiers/cactus, sapins enneigés) et, côté canvas,
le ciel, le sol texturé, les montagnes, la rivière et les décors de la scène.

## Portraits (`units/`, `heroes/`) et replay de bataille

- `units/<CLASSE>_<FACTION>.svg` (et `units/<CLASSE>.svg` neutre) : jetons 64×64 des quatre classes
  (INFANTRY, ARCHER, CAVALRY, SIEGE) aux couleurs de la faction, utilisés dans les panneaux (armées,
  entraînement, garnison, rapports, fiches d'unité) via `unitIconHtml()` (01-core.js), la faction étant
  déduite du préfixe de la clé d'unité (ROM, GAU, GRE, EGY, HUN, SUL).
- `heroes/<FACTION>.svg` : bustes de héros 128×128 (`heroPortraitHtml()`), coiffe propre à chaque faction.
- Le replay de bataille (`frontend/js/app/09b-battle-scene.js`) dessine un champ isométrique avec les
  sprites de carte des unités (`map/units/*_<FACTION>.svg`), le mur du défenseur et ces portraits.
