# Map Tileset Images

Ce dossier contient les images pour la carte du monde isométrique.

## Structure des dossiers

```
map/
├── tileset.png          # Tileset principal (optionnel)
├── cities/              # Images des villes
│   ├── rome.png
│   ├── gaul.png
│   ├── greek.png
│   ├── egypt.png
│   ├── hun.png
│   ├── sultan.png
│   ├── capital.png
│   └── default.png
├── units/               # Images des unités
│   ├── hoplite.png
│   ├── archer.png
│   ├── cavalry.png
│   ├── catapult.png
│   ├── trireme.png
│   ├── merchant.png
│   └── settler.png
├── resources/           # Images des ressources
│   ├── wood.png
│   ├── stone.png
│   ├── iron.png
│   ├── food.png
│   └── gold.png
└── terrain/             # Tuiles de terrain
    ├── grass.png
    ├── desert.png
    ├── snow.png
    ├── water.png
    ├── forest.png
    └── mountain.png
```

## Spécifications des images

### Format recommandé
- **Format**: PNG avec transparence (fond transparent)
- **Style**: Isométrique, angle ~30 degrés
- **Taille recommandée**: 128x128 ou 256x256 pixels

### Tileset principal (optionnel)
Si vous utilisez un tileset combiné (`tileset.png`), configurez-le dans `/assets/tileset-config.json`.

Le tileset doit avoir:
- Largeur de tuile: 190px
- Hauteur de tuile: 160px
- 6 colonnes x 4 lignes

## Fallback
Si les images ne sont pas trouvées, le jeu utilisera automatiquement le rendu procédural (formes géométriques).
