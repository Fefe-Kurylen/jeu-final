# Sprites de la carte du monde

Générés par `node tools/build-assets.cjs` (SVG) puis `node tools/build-assets.cjs --png` (rendu PNG via
Playwright/Chromium). Ne pas retoucher les fichiers à la main : modifier le générateur (`M.cities`,
`M.resources`, `M.units`).

```
map/
├── manifest.json      # listes cities / resources / units, format, taille, ancre
├── cities/            # rome gaul greek egypt hun sultan capital default  (.svg + .png)
├── resources/         # wood stone iron food gold
└── units/             # hoplite archer cavalry catapult merchant
```

## Spécifications

- PNG 256×256, fond transparent ; le centre du losange au sol du sprite est au point (128, 204) de
  l'image, soit l'ancre `(0.5, 0.797)` publiée dans `manifest.json` : `drawTileImage()` de
  `frontend/js/map.js` pose ce point sur le centre de la tuile.
- `map.js` ne charge que les fichiers listés dans `manifest.json` ; si le PNG manque, le rendu procédural
  (formes géométriques) prend le relais.
