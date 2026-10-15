# Consignes pour Claude — Imperium Antiquitas

## Répartition du travail
- **Claude** : vérifie les images envoyées, les range au bon endroit et les compresse **sans perte**.
- **Le propriétaire du projet** s'occupe du reste (dessin, recadrage, code d'affichage).
- Ne jamais modifier le code ou les données du jeu sans demande explicite.
- Ne jamais toucher à `main` : travailler dans la branche `Fefe-Kurylen-patch-1` (images).

## Images de bâtiments
### Vérifications à faire à chaque image
- Format **PNG** avec **fond transparent**
- Taille **1024 × 1024 px** (à conserver : qualité maximale voulue)
- Style isométrique

### Rangement
- Dossier : `frontend/assets/images/buildings/<faction>/`
  - factions : `rome`, `gaul`, `greek`, `egypt`, `hun`, `sultan`
  - bâtiment commun à toutes les factions : `common/`
- Nom : la clé du bâtiment en **minuscules** (`ACADEMY.png` → `academy.png`).
  Les 39 clés valides sont dans `data/buildings.json` et `frontend/assets/images/buildings/README.md`.
- Éléments de carte (villes, unités, ressources) : `frontend/assets/images/map/`
- Si la faction ou le bâtiment n'est pas évident : demander.

### Compression
- Compression PNG **sans perte uniquement** (ex. Pillow `optimize=True`).
- Vérifier que les pixels sont **strictement identiques** à l'original avant d'enregistrer.
- Pas de réduction de taille, pas de compression avec perte.

## Fait
- `egypt/academy.png` : rangée et compressée (499 Ko → 374 Ko, 1024 px conservé).

## Style des réponses
Réponses en français, claires, avec émojis, tableaux si utile et cases à cocher.
