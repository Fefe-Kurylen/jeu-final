# Sprites des bâtiments (vue ville)

Tous les fichiers de ce dossier sont **générés** par `node tools/build-assets.cjs` : ne pas les retoucher à la main, modifier le générateur.

```
buildings/
├── manifest.json          # factions, clés, cadre commun (viewBox + ancre)
├── ROME/ GAUL/ GREEK/ EGYPT/ HUN/ SULTAN/
│   └── <KEY>.svg          # un sprite par bâtiment (39) dans la palette de la faction
../fields/
    └── <TYPE>_<tier>.svg  # FARM / LUMBER / QUARRY / IRON_MINE × paliers 1 (nv 1-6), 2 (7-13), 3 (14-20)
```

## Cadre commun

- Projection isométrique 2:1, tuile de 2×2 unités (largeur 100 px, hauteur 50 px dans le SVG source).
- `viewBox` identique pour tous les sprites (voir `manifest.json`) : le centre du losange au sol est à
  l'ancre `(0.5, 0.697)` de l'image. Pour dessiner un bâtiment dont le centre au sol est en `(x, y)` sur
  le canvas avec une largeur `w` : `drawImage(img, x - w/2, y - w*0.697*(h/w), w, w*(h/w))`.
- Fond transparent, le terrain (losange d'herbe/sable/pierre) fait partie du sprite.
- Style « cartoon × Travian » : contours bruns, dégradés peints, toits et accessoires généreux. Le trait,
  les couleurs de sol et les palettes de faction sont centralisés dans `STYLE`, `GROUND` et `PALETTES`
  du générateur.

## Ajouter ou modifier un bâtiment

Ajouter une entrée `B.<KEY> = (p) => ...` dans `tools/build-assets.cjs` (`p` = palette de faction :
`wall`, `roof`, `accent`, `trim`, `ground`) à partir des primitives `box`, `roofGable`, `roofHip`,
`cylinder`, `cone`, `dome`, `tent`, `columns`, et des accessoires (`tree`, `rock`, `crate`, `barrel`,
`flag`, `chimney`, `door`, `windowRect`, `torch`, `fence`, `wheel`, `cart`, `horse`, `coins`…), puis relancer
le générateur.
