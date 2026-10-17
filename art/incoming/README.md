# Dépôt des images peintes

Pose ici (ou envoie-moi en zip) les images que tu produis avec le kit graphique, et je les intègre :
recalage sur le cadre du jeu, détourage si besoin, publication, vérification en jeu, commit.

Règles :
- nom identique au guide, extension .png / .jpg / .webp : `buildings/HUN/MAIN_HALL.png`, `walls/GAUL/3_tower.png`,
  `map/terrain/forest_mountain_xy.png`, `scenes/hero-ROME.png`, `ui/btn-primary.png`, `terrain/grass.png`…
  (sous-dossiers ou noms plats `buildings__HUN__MAIN_HALL.png`, majuscules indifférentes) ;
- fond transparent de préférence, sinon fond uni magenta #FF00FF ou vert #00FF00 ;
- 1024×1024 pour les sprites ; scènes : 1024×1536 (connexion portrait, estrades) ou 1536×1024 (paysage, bandeaux, champ de bataille) ;
- le sujet à la même place et à la même taille que sur le guide (petits écarts corrigés automatiquement) ;
- par lots : ce qui manque garde le rendu 3D.

Commande d'intégration : `node tools/repaint.cjs --import=art/incoming` puis vérification et commit.
Référence complète des sujets et prompts : `docs/PROMPTS-GRAPHIQUES.md` ; inventaire et état de chaque image (peinte ou encore en rendu 3D), ordre conseillé : `docs/LISTE-GRAPHISMES.md`.
