# Dépôt des images peintes

Pose ici (ou envoie-moi en zip) les images que tu produis avec le guide, et je les intègre :
vérification des noms, recalage, détourage si besoin, publication, aperçu en jeu, commit.

## Règles

- Nom identique au guide, extension .png / .jpg / .webp : `buildings/HUN/MAIN_HALL.png`, `walls/GAUL/3_tower.png`,
  `map/terrain/forest_mountain_xy.png`, `scenes/hero-ROME.png`, `ui/btn-primary.png`, `terrain/cobble.png`, `decals/moss.png`,
  `props/villager_a.png` (bande d'animation)… Sous-dossiers ou noms plats (`buildings__HUN__MAIN_HALL.png`), majuscules indifférentes.
- Fond transparent de préférence, sinon fond uni magenta #FF00FF ou vert #00FF00 (détouré à l'import). Textures : opaques.
- Tailles de livraison : sprites et icônes 1024×1024 ; personnages et décors (props, figurines, héros) 1024×1536 ou cases 512×768 ;
  scènes 1024×1536 (portrait) ou 1536×1024 (paysage) ; textures 1024×1024 répétables ; bordures 1024×256 ; effets 512×512.
- Le sujet à la même place et à la même taille que sur le guide (petits écarts corrigés automatiquement).
- **Bâtiments et chantiers** : entrée principale sur la face avant droite (vers le bas à droite, le sud-est), comme le guide.
  L'import produit une planche de contrôle (chaque bâtiment à côté de son guide) vérifiée avant publication.
- **Animations** : une seule image contenant toutes les phases côte à côte, cases égales, même personnage, même taille
  (`props/villager_a.png` = 6 cases) ; je découpe en `villager_a_0.png` … `villager_a_5.png`. Les phases séparées sont acceptées aussi.
- Visuels de boutique (`store/ic_stat_notify.png`, `store/feature-graphic.png`) : copiés tels quels dans `store/`.
- Par lots : ce qui manque garde le rendu 3D ou le dessin du code.

## Marche à suivre

1. `node tools/check-incoming.cjs art/incoming` — vérifie chaque fichier : nom reconnu (sinon suggestions), rôle dans le jeu,
   proportions, transparence, nombre de cases d'une bande. Rien n'est modifié.
2. `node tools/repaint.cjs --import=art/incoming` — recale, détoure, découpe les bandes, publie dans `frontend/assets/images/painted/`
   et met le manifeste à jour (les images sont alors utilisées par le jeu).
3. `node tools/preview-art.cjs <FACTION> <biome>` — captures en jeu (ville jour/nuit, zoom, bulle, carte, armée, héros, marché,
   liste de construction, fiche d'unité, bureau et mobile) dans `store/preview/` pour contrôler le résultat.
4. Commit.

Références : `docs/A-GENERER.md` (ce qui reste à produire), `docs/PROMPTS-GRAPHIQUES.md` (sujets et prompts des sprites),
`docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` (compléments, textures, animations), `docs/LISTE-GRAPHISMES.md` (inventaire et état).
