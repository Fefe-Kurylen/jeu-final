# Guides des villes (à utiliser avant de générer les images)

Générés par `node tools/guides-villes.cjs` à partir des plans du jeu (`frontend/js/app/04b-iso-scene.js`) : ils restent justes
si les plans changent (relancer l'outil).

## Vue de la ville
- `ville-capitale.png` : la capitale, 18 emplacements de bâtiment (bleu, numéros du jeu), le Bâtiment principal au centre
  (doré, 1,35 × plus grand), les 18 champs (101-104 Bûcherons, 105-108 Carrières, 109-112 Mines de fer, 113-118 Fermes),
  l'enceinte et la porte (P) au sud-est.
- `ville-colonie.png` : la colonie, 12 emplacements de bâtiment, même logique, enceinte plus petite.
- Chaque bâtiment se dessine seul sur son image (1024 × 1024, fond transparent), posé sur une parcelle en losange 2:1,
  entrée vers le bas à droite (sud-est). Le cadrage exact d'un bâtiment : `node tools/repaint.cjs --kit=<dossier>` (guide 3D
  par bâtiment).

## Villes de la carte (sprite d'une ville sur 2 × 2 cases, 1024 × 1024, fond transparent)
- `carte-village.png`, `carte-ville.png`, `carte-capitale-fortifiee.png`, `carte-colonie.png`, `carte-colonie-fortifiee.png`.
- Rouge : l'emprise de 2 × 2 cases (rien ne dépasse à gauche, à droite ni en bas). Pointillé blanc : hauteur maximale des
  toits et tours. Point rouge : la porte au sud-est. Bleu : les emplacements de bâtiment, à la même place que dans la vue de
  la ville, pour que la ville de la carte ressemble à la ville du joueur.
- Une ville assiégée garde exactement le même cadrage que sa version normale (une image fixe).
