# Pipeline graphique : rendu 3D puis repeinture par IA

Le jeu affiche des sprites 2.5D (isométriques) sur canvas. Ils sont produits en deux étapes :

## 1. Rendu 3D (sans dépendance externe) — `npm run build:3d`

`tools/build-3d.cjs` rend ~1 000 sprites WebP dans `frontend/assets/images/3d/` avec Three.js dans Chromium
headless : bâtiments (39 × 6 factions, neige), champs, parcelles, décors, carte, enceinte, figurines, héros,
icônes, habillage, scènes, drapeaux animés, effets, emblème. Voir `frontend/assets/images/README.md`.
Ces rendus sont propres et cohérents (mêmes angles, mêmes tailles, mêmes ancres) et servent de **guides de
composition** à l'étape 2.

## 2. Repeinture par IA dans le style de référence — `node tools/repaint.cjs`

`tools/repaint.cjs` envoie chaque rendu 3D à l'API d'images d'OpenAI (modèle `gpt-image-1`, édition guidée)
avec l'illustration de référence `tools/repaint/style-ref.png` (marché égyptien peint) et un prompt qui
décrit le sujet (`tools/repaint/prompts.cjs` : style, grammaire architecturale par faction, description de
chaque bâtiment, champ, parcelle, décor, icône de carte, figurine, scène). Le résultat (fond transparent) est
recalé sur la boîte au sol du guide (largeur et bas-centre, échelle bornée à ±25 %), ramené au cadre du sprite
et écrit dans `frontend/assets/images/painted/` (même arborescence que `3d/`) avec `painted/manifest.json`.

Le client (`art()` dans `js/app/01-core.js`) utilise la version peinte dès qu'elle est listée dans le manifeste,
sinon le rendu 3D : la génération peut se faire par lots, catégorie par catégorie, et se compare en direct.
Restent toujours en rendu 3D : enceinte (tronçons qui doivent se raccorder), drapeaux et effets animés,
icônes, habillage de l'interface, bustes (jetons) et figurines de carte.

### Commandes

```
OPENAI_API_KEY=sk-… node tools/repaint.cjs                       # toutes les cibles manquantes (qualité high)
node tools/repaint.cjs --dry --limit=8                            # sans appel : guides + prompts dans tools/repaint/out/
node tools/repaint.cjs --only='^buildings/ROME/' --quality=medium # un sous-ensemble (regex sur le chemin)
node tools/repaint.cjs --cats=buildings,fields --workers=2        # catégories choisies, 2 requêtes en parallèle
node tools/repaint.cjs --force --only='^buildings/EGYPT/MARKET'   # refaire un sprite
node tools/repaint.cjs --reprocess                                # recalage seul depuis les réponses brutes (tools/repaint/raw/)
```

### Coût (tarif public gpt-image-1, ~630 images)

| Qualité | Coût estimé |
|---|---|
| low | ≈ 7 $ |
| medium | ≈ 27 $ |
| high | ≈ 108 $ |

Les réponses brutes sont conservées dans `tools/repaint/raw/` (ignoré par git) : un re-traitement ne coûte rien.
Pour un sprite raté, `--force --only=…` le régénère (un nouvel appel) ; le rendu 3D reste le repli.

### Qualité du résultat

- Le style est fixé par l'image de référence (passée comme première image à chaque appel) : remplacer
  `style-ref.png` suffit pour changer de direction artistique.
- Les prompts demandent de conserver l'angle, la position et la silhouette du guide ; le recalage corrige
  les petites dérives (la moyenne en pixels est affichée en fin de lot).
- Vérifier chaque lot avec les captures (`scratchpad/gfx/shots.cjs`) ou dans le jeu ; refaire les sprites
  qui débordent de leur parcelle ou changent d'orientation.
