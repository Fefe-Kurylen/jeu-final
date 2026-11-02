# Guide : images qui restent à faire pour la carte et l'interface

Mis à jour le 2 novembre 2026, après l'import de tes 261 images de la carte : ce que tu as livré reste dans la liste, coché ✅ ; ce qui reste à faire est marqué ⬜. Sans les animations de siège (tu as choisi une image fixe par ville assiégée : c'est déjà fait). Les bâtiments ne sont pas dans ce guide.

## Comment faire, en 5 étapes

1. **Le style.** Mets toujours en première image de référence `tools/repaint/style-ref.png` (style peint) — sauf pour la carte, qui suit `docs/img/carte-reference.jpg` (le même rendu doux que tes 261 images). Pas de texte, pas de cadre, pas de filigrane.
2. **Le prompt.** Chaque famille ci-dessous dit où est son prompt : `docs/PROMPTS-CARTE.md` pour la carte, `docs/GENERATION-COMPLETE.md` pour le reste (le fichier par fichier, avec son prompt exact et son image guide), ou directement ici quand le prompt n'existe nulle part ailleurs.
3. **La taille.** 1024 × 1024 en général (c'est ce que tu fais déjà) ; les exceptions sont écrites dans chaque famille. **Fond transparent** (PNG avec canal alpha) pour tout ce qui est posé sur la carte ou l'interface.
4. **Le nom.** Nomme chaque fichier **exactement** comme dans la liste, avec ses dossiers (ex. `map/units/hoplite_ROME_walk.png`). Le nom suffit pour que je range l'image au bon endroit.
5. **L'envoi.** Un zip qui garde les sous-dossiers, partagé sur Drive avec « Tous les utilisateurs disposant du lien » (comme la dernière fois). Je l'importe, je vérifie dans le jeu et je te montre une capture.

**Animations** (armées en marche, replay) : une seule image par animation, avec les poses côte à côte (le nombre et la taille des cases sont écrits dans la famille). Je découpe à l'import.

## Le point : 432 images en tout, 246 livrées, 186 à faire

| Groupe | Famille | Livrées | À faire |
|---|---|---|---|
| Carte | Villes de la carte (normales et assiégées, image fixe) | 60 | 0 |
| Carte | Sol de la carte | 20 | 0 |
| Carte | Forêts, rochers et montagnes | 57 | 0 |
| Carte | Ponts, gués, désert et eau | 18 | 0 |
| Carte | Décor des cases | 23 | 3 |
| Carte | Nuages qui passent | 3 | 0 |
| Carte | Points de ressource | 45 | 0 |
| Carte | Camps des tribus et ruines | 12 | 0 |
| Carte | Campement de fondation | 3 | 0 |
| Carte | Donjons des invasions barbares (hordes) | 0 | 5 |
| Carte | Armées en marche | 0 | 29 |
| Carte | Cortège de colons | 0 | 7 |
| Carte | Héros en tête d'armée et espion | 0 | 7 |
| Carte | Cycles de marche des armées (planches) | 0 | 33 |
| Carte | Replay de bataille : poses, projectiles, impacts | 0 | 17 |
| Carte | Effets de la carte | 5 | 0 |
| Carte | Bannières de la boutique d'alliance | 0 | 4 |
| Carte | Bastion, Merveille, Immortels (à confirmer : ce sont des villes spéciales) | 0 | 10 |
| Interface | Bandeaux en tête des écrans | 0 | 7 |
| Interface | Vignettes : fondation, tribus, expéditions | 0 | 8 |
| Interface | Habillage : plaque parchemin et boutons ronds | 0 | 3 |
| Interface | Icônes d'interface restantes (colon, tribu, siège) | 0 | 3 |
| Interface | Blasons des civilisations | 0 | 6 |
| Interface | Icônes des technologies et des branches | 0 | 12 |
| Interface | Objets du héros : les 23 nouvelles icônes | 0 | 23 |
| Interface | Effets d'interface | 0 | 3 |
| Interface | Nouveautés des décisions G et H : Gloire, triomphe, échange | 0 | 6 |

**Ordre conseillé** : armées en marche et planches de marche (la carte bouge enfin), puis donjons et décor manquant, puis interface (objets du héros, blasons, technologies, bandeaux), puis replay de bataille, bannières et le reste. La famille « Bastion, Merveille, Immortels » est à confirmer : ce sont des villes spéciales.

## Carte — 115 images

### Sol de la carte — 20 livrée(s), 0 à faire ✅

- **Où ça se voit** : Tout le fond de la carte du monde : 7 sols (eau, glace, sable, terre, herbe sèche, herbe, neige) en 2 à 4 variantes que le jeu mélange par taches ; les fondus entre sols sont faits par le jeu. Commencer par la variante 1 de chaque sol : 7 images qui changent toute la carte.
- **Taille et format** : 1024×1024, PNG **opaque**, vue de dessus, répétable sans raccord, détails fins (l'image couvre environ 6 × 6 cases).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : **Style de la carte de référence** (`docs/img/carte-reference.jpg`, rendu 3D doux, pas le style peint de la ville), vu de dessus.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 1 « Sol » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ✅ `map/world/ground/water_1.png` — eau, variante 1 sur 2 (rivière)
- ✅ `map/world/ground/water_2.png` — eau, variante 2 sur 2 (lac)
- ✅ `map/world/ground/ice_1.png` — glace, variante 1 sur 2 (glace lisse)
- ✅ `map/world/ground/ice_2.png` — glace, variante 2 sur 2 (glace rugueuse)
- ✅ `map/world/ground/sand_1.png` — sable, variante 1 sur 3 (sable ridé)
- ✅ `map/world/ground/sand_2.png` — sable, variante 2 sur 3 (sable caillouteux)
- ✅ `map/world/ground/sand_3.png` — sable, variante 3 sur 3 (sable sec)
- ✅ `map/world/ground/earth_1.png` — terre (champs), variante 1 sur 3 (champ labouré)
- ✅ `map/world/ground/earth_2.png` — terre (champs), variante 2 sur 3 (jeunes pousses)
- ✅ `map/world/ground/earth_3.png` — terre (champs), variante 3 sur 3 (chaume après moisson)
- ✅ `map/world/ground/drygrass_1.png` — herbe sèche, variante 1 sur 3 (steppe dorée)
- ✅ `map/world/ground/drygrass_2.png` — herbe sèche, variante 2 sur 3 (herbe sèche clairsemée)
- ✅ `map/world/ground/drygrass_3.png` — herbe sèche, variante 3 sur 3 (touffes hautes)
- ✅ `map/world/ground/grass_1.png` — herbe (prairie), variante 1 sur 4 (prairie rase)
- ✅ `map/world/ground/grass_2.png` — herbe (prairie), variante 2 sur 4 (prairie fleurie)
- ✅ `map/world/ground/grass_3.png` — herbe (prairie), variante 3 sur 4 (herbe dense au trèfle)
- ✅ `map/world/ground/grass_4.png` — herbe (prairie), variante 4 sur 4 (prairie caillouteuse)
- ✅ `map/world/ground/snow_1.png` — neige, variante 1 sur 3 (poudreuse)
- ✅ `map/world/ground/snow_2.png` — neige, variante 2 sur 3 (neige croûtée)
- ✅ `map/world/ground/snow_3.png` — neige, variante 3 sur 3 (neige fine)

### Forêts, rochers et montagnes — 57 livrée(s), 0 à faire ✅

- **Où ça se voit** : Les massifs forestiers (forêt dense et lisières, tempérées et enneigées), les amas de rochers (infranchissables) et rochers du désert, les montagnes (isolée, chaîne dans un axe, chaîne dans l'autre, cœur de massif) × 3 biomes × 3 modèles.
- **Taille et format** : 1024×1024, PNG transparent, élément posé sur une case (losange à 50 % de la largeur, centre à 75 %), sans socle ; image guide `docs/img/guides-carte/guide-objet.png`.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 2 « Forêts » (prompt complet et image guide pour chaque fichier) et § 3 « Rochers et montagnes ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ✅ `map/world/forest/temperate_1.png` — Forêt dense en zone tempérée (variante 1
- ✅ `map/world/forest/temperate_2.png` — Forêt dense en zone tempérée (variante 2
- ✅ `map/world/forest/temperate_3.png` — Forêt dense en zone tempérée (variante 3
- ✅ `map/world/forest/temperate_4.png` — Forêt dense en zone tempérée (variante 4
- ✅ `map/world/forest/temperate_edge_1.png` — Lisière de forêt tempérée (variante 1
- ✅ `map/world/forest/temperate_edge_2.png` — Lisière de forêt tempérée (variante 2
- ✅ `map/world/forest/temperate_edge_3.png` — Lisière de forêt tempérée (variante 3
- ✅ `map/world/forest/snow_1.png` — Forêt enneigée dense (variante 1
- ✅ `map/world/forest/snow_2.png` — Forêt enneigée dense (variante 2
- ✅ `map/world/forest/snow_3.png` — Forêt enneigée dense (variante 3
- ✅ `map/world/forest/snow_4.png` — Forêt enneigée dense (variante 4
- ✅ `map/world/forest/snow_edge_1.png` — Lisière de forêt enneigée (variante 1
- ✅ `map/world/forest/snow_edge_2.png` — Lisière de forêt enneigée (variante 2
- ✅ `map/world/forest/snow_edge_3.png` — Lisière de forêt enneigée (variante 3
- ✅ `map/world/rocks/boulders_1.png` — Amas de rochers (variante 1), infranchissable
- ✅ `map/world/rocks/boulders_2.png` — Amas de rochers (variante 2), infranchissable
- ✅ `map/world/rocks/boulders_3.png` — Amas de rochers (variante 3), infranchissable
- ✅ `map/world/rocks/boulders_4.png` — Amas de rochers (variante 4), infranchissable
- ✅ `map/world/rocks/desert_1.png` — Rochers épars du désert (variante 1), franchissables
- ✅ `map/world/rocks/desert_2.png` — Rochers épars du désert (variante 2), franchissables
- ✅ `map/world/rocks/desert_3.png` — Rochers épars du désert (variante 3), franchissables
- ✅ `map/world/mountains/temperate_1.png` — Montagne tempérée isolée, modèle 1/3, infranchissable
- ✅ `map/world/mountains/temperate_x_1.png` — Chaîne de montagnes tempérée dans l'axe haut-gauche → bas-droite, modèle 1/3
- ✅ `map/world/mountains/temperate_y_1.png` — Chaîne de montagnes tempérée dans l'axe haut-droite → bas-gauche, modèle 1/3
- ✅ `map/world/mountains/temperate_xy_1.png` — Cœur de massif tempérée entouré de montagnes, modèle 1/3
- ✅ `map/world/mountains/temperate_2.png` — Montagne tempérée isolée, modèle 2/3, infranchissable
- ✅ `map/world/mountains/temperate_x_2.png` — Chaîne de montagnes tempérée dans l'axe haut-gauche → bas-droite, modèle 2/3
- ✅ `map/world/mountains/temperate_y_2.png` — Chaîne de montagnes tempérée dans l'axe haut-droite → bas-gauche, modèle 2/3
- ✅ `map/world/mountains/temperate_xy_2.png` — Cœur de massif tempérée entouré de montagnes, modèle 2/3
- ✅ `map/world/mountains/temperate_3.png` — Montagne tempérée isolée, modèle 3/3, infranchissable
- ✅ `map/world/mountains/temperate_x_3.png` — Chaîne de montagnes tempérée dans l'axe haut-gauche → bas-droite, modèle 3/3
- ✅ `map/world/mountains/temperate_y_3.png` — Chaîne de montagnes tempérée dans l'axe haut-droite → bas-gauche, modèle 3/3
- ✅ `map/world/mountains/temperate_xy_3.png` — Cœur de massif tempérée entouré de montagnes, modèle 3/3
- ✅ `map/world/mountains/snow_1.png` — Montagne enneigée isolée, modèle 1/3, infranchissable
- ✅ `map/world/mountains/snow_x_1.png` — Chaîne de montagnes enneigée dans l'axe haut-gauche → bas-droite, modèle 1/3
- ✅ `map/world/mountains/snow_y_1.png` — Chaîne de montagnes enneigée dans l'axe haut-droite → bas-gauche, modèle 1/3
- ✅ `map/world/mountains/snow_xy_1.png` — Cœur de massif enneigée entouré de montagnes, modèle 1/3
- ✅ `map/world/mountains/snow_2.png` — Montagne enneigée isolée, modèle 2/3, infranchissable
- ✅ `map/world/mountains/snow_x_2.png` — Chaîne de montagnes enneigée dans l'axe haut-gauche → bas-droite, modèle 2/3
- ✅ `map/world/mountains/snow_y_2.png` — Chaîne de montagnes enneigée dans l'axe haut-droite → bas-gauche, modèle 2/3
- ✅ `map/world/mountains/snow_xy_2.png` — Cœur de massif enneigée entouré de montagnes, modèle 2/3
- ✅ `map/world/mountains/snow_3.png` — Montagne enneigée isolée, modèle 3/3, infranchissable
- ✅ `map/world/mountains/snow_x_3.png` — Chaîne de montagnes enneigée dans l'axe haut-gauche → bas-droite, modèle 3/3
- ✅ `map/world/mountains/snow_y_3.png` — Chaîne de montagnes enneigée dans l'axe haut-droite → bas-gauche, modèle 3/3
- ✅ `map/world/mountains/snow_xy_3.png` — Cœur de massif enneigée entouré de montagnes, modèle 3/3
- ✅ `map/world/mountains/desert_1.png` — Montagne du désert (mesa) isolée, modèle 1/3, infranchissable
- ✅ `map/world/mountains/desert_x_1.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-gauche → bas-droite, modèle 1/3
- ✅ `map/world/mountains/desert_y_1.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-droite → bas-gauche, modèle 1/3
- ✅ `map/world/mountains/desert_xy_1.png` — Cœur de massif du désert (mesa) entouré de montagnes, modèle 1/3
- ✅ `map/world/mountains/desert_2.png` — Montagne du désert (mesa) isolée, modèle 2/3, infranchissable
- ✅ `map/world/mountains/desert_x_2.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-gauche → bas-droite, modèle 2/3
- ✅ `map/world/mountains/desert_y_2.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-droite → bas-gauche, modèle 2/3
- ✅ `map/world/mountains/desert_xy_2.png` — Cœur de massif du désert (mesa) entouré de montagnes, modèle 2/3
- ✅ `map/world/mountains/desert_3.png` — Montagne du désert (mesa) isolée, modèle 3/3, infranchissable
- ✅ `map/world/mountains/desert_x_3.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-gauche → bas-droite, modèle 3/3
- ✅ `map/world/mountains/desert_y_3.png` — Chaîne de montagnes du désert (mesa) dans l'axe haut-droite → bas-gauche, modèle 3/3
- ✅ `map/world/mountains/desert_xy_3.png` — Cœur de massif du désert (mesa) entouré de montagnes, modèle 3/3

### Ponts, gués, désert et eau — 18 livrée(s), 0 à faire ✅

- **Où ça se voit** : Passages des rivières (pont = vitesse normale, gué = moitié moins vite) dans les deux axes, dunes, ruines et palmiers du désert, bateaux et quais en décor sur l'eau.
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 4 « Rivières : ponts et gués » (prompt complet et image guide pour chaque fichier), § 5 « Désert » et § 6 « Eau ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ✅ `map/world/desert/dunes_1.png` — Dunes (variante 1)
- ✅ `map/world/desert/dunes_2.png` — Dunes (variante 2)
- ✅ `map/world/desert/dunes_3.png` — Dunes (variante 3)
- ✅ `map/world/desert/ruins_1.png` — Ruines du désert (variante 1)
- ✅ `map/world/desert/ruins_2.png` — Ruines du désert (variante 2)
- ✅ `map/world/desert/ruins_3.png` — Ruines du désert (variante 3)
- ✅ `map/world/desert/palms_1.png` — Palmiers au bord d'une oasis (variante 1)
- ✅ `map/world/desert/palms_2.png` — Palmiers au bord d'une oasis (variante 2)
- ✅ `map/world/desert/palms_3.png` — Palmiers au bord d'une oasis (variante 3)
- ✅ `map/world/river/bridge_x.png` — Pont (axe haut-gauche → bas-droite)
- ✅ `map/world/river/bridge_y.png` — Pont (axe haut-droite → bas-gauche)
- ✅ `map/world/river/ford_x.png` — Gué (axe haut-gauche → bas-droite)
- ✅ `map/world/river/ford_y.png` — Gué (axe haut-droite → bas-gauche)
- ✅ `map/world/water/boat_1.png` — Bateau (décor, variante 1) sur les rivières et les lacs
- ✅ `map/world/water/boat_2.png` — Bateau (décor, variante 2) sur les rivières et les lacs
- ✅ `map/world/water/boat_3.png` — Bateau (décor, variante 3) sur les rivières et les lacs
- ✅ `map/world/water/dock_x.png` — Quai (décor) au bord de l'eau
- ✅ `map/world/water/dock_y.png` — Quai (décor) au bord de l'eau

### Décor des cases — 23 livrée(s), 3 à faire

- **Où ça se voit** : Comme sur la carte de référence : champs de blé et meules autour des villes, cailloux, agaves, cactus, buissons et arbres isolés au bord de l'eau, buissons et cailloux givrés en zone enneigée.
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 8 « Décor des cases, comme sur la carte de référence » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ✅ `map/world/fields/wheat_1.png` — Champ de blé (variante 1)
- ✅ `map/world/fields/wheat_2.png` — Champ de blé (variante 2)
- ✅ `map/world/fields/wheat_3.png` — Champ de blé (variante 3)
- ✅ `map/world/decor/haystack_1.png` — Meule de foin (variante 1)
- ✅ `map/world/decor/haystack_2.png` — Meule de foin (variante 2)
- ✅ `map/world/decor/stones_1.png` — Cailloux épars (variante 1)
- ✅ `map/world/decor/stones_2.png` — Cailloux épars (variante 2)
- ✅ `map/world/decor/stones_3.png` — Cailloux épars (variante 3)
- ✅ `map/world/decor/agave_1.png` — Agave (variante 1)
- ✅ `map/world/decor/agave_2.png` — Agave (variante 2)
- ✅ `map/world/decor/agave_3.png` — Agave (variante 3)
- ✅ `map/world/decor/cactus_1.png` — Cactus du désert (variante 1)
- ✅ `map/world/decor/cactus_2.png` — Cactus du désert (variante 2)
- ✅ `map/world/decor/bush_1.png` — Buisson (variante 1)
- ✅ `map/world/decor/bush_2.png` — Buisson (variante 2)
- ✅ `map/world/decor/bush_3.png` — Buisson (variante 3)
- ✅ `map/world/decor/tree_1.png` — Arbre isolé (variante 1)
- ✅ `map/world/decor/tree_2.png` — Arbre isolé (variante 2)
- ✅ `map/world/decor/tree_3.png` — Arbre isolé (variante 3)
- ✅ `map/world/decor/snow_bush_1.png` — Buisson givré (variante 1)
- ✅ `map/world/decor/snow_bush_2.png` — Buisson givré (variante 2)
- ✅ `map/world/decor/snow_stones_1.png` — Cailloux enneigés (variante 1)
- ✅ `map/world/decor/snow_stones_2.png` — Cailloux enneigés (variante 2)
- ⬜ `map/world/decor/desert_stones_1.png` — Cailloux du désert (variante 1)
- ⬜ `map/world/decor/desert_stones_2.png` — Cailloux du désert (variante 2)
- ⬜ `map/world/decor/desert_stones_3.png` — Cailloux du désert (variante 3)

### Nuages qui passent — 3 livrée(s), 0 à faire ✅

- **Où ça se voit** : Ambiance légère : quelques nuages très transparents dérivent lentement au-dessus de la carte.
- **Taille et format** : 1536×1024 (paysage), PNG transparent, bords très doux, pas d'image guide.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence, vu du même angle.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 7 « Nuages qui passent » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.
- **Note** : `docs/GENERATION-COMPLETE.md` les laisse en « non classé » (3 images) ; ils sont bien dans `docs/A-GENERER.md` étape 5.

**Fichiers** (✅ = livré et dans le jeu) :

- ✅ `map/world/fx/cloud_1.png` — nuage léger qui dérive au-dessus de la carte, variante 1
- ✅ `map/world/fx/cloud_2.png` — nuage léger qui dérive au-dessus de la carte, variante 2
- ✅ `map/world/fx/cloud_3.png` — nuage léger qui dérive au-dessus de la carte, variante 3

### Points de ressource — 45 livrée(s), 0 à faire ✅

- **Où ça se voit** : Les points de ressource de la carte : bois, pierre, fer, nourriture, or × 3 terrains (tempéré, désert, neige) × 3 richesses (petit, moyen, riche), sans couleur de civilisation.
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence, style rustique sans bannière.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 11 « Points de ressource » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ✅ `map/resources/wood_forest_1.png` — bois, tempéré, niveau 1 (petit)
- ✅ `map/resources/wood_forest_2.png` — bois, tempéré, niveau 2 (moyen)
- ✅ `map/resources/wood_forest_3.png` — bois, tempéré, niveau 3 (riche)
- ✅ `map/resources/wood_desert_1.png` — bois, désert, niveau 1 (petit)
- ✅ `map/resources/wood_desert_2.png` — bois, désert, niveau 2 (moyen)
- ✅ `map/resources/wood_desert_3.png` — bois, désert, niveau 3 (riche)
- ✅ `map/resources/wood_snow_1.png` — bois, neige, niveau 1 (petit)
- ✅ `map/resources/wood_snow_2.png` — bois, neige, niveau 2 (moyen)
- ✅ `map/resources/wood_snow_3.png` — bois, neige, niveau 3 (riche)
- ✅ `map/resources/stone_forest_1.png` — pierre, tempéré, niveau 1 (petit)
- ✅ `map/resources/stone_forest_2.png` — pierre, tempéré, niveau 2 (moyen)
- ✅ `map/resources/stone_forest_3.png` — pierre, tempéré, niveau 3 (riche)
- ✅ `map/resources/stone_desert_1.png` — pierre, désert, niveau 1 (petit)
- ✅ `map/resources/stone_desert_2.png` — pierre, désert, niveau 2 (moyen)
- ✅ `map/resources/stone_desert_3.png` — pierre, désert, niveau 3 (riche)
- ✅ `map/resources/stone_snow_1.png` — pierre, neige, niveau 1 (petit)
- ✅ `map/resources/stone_snow_2.png` — pierre, neige, niveau 2 (moyen)
- ✅ `map/resources/stone_snow_3.png` — pierre, neige, niveau 3 (riche)
- ✅ `map/resources/iron_forest_1.png` — fer, tempéré, niveau 1 (petit)
- ✅ `map/resources/iron_forest_2.png` — fer, tempéré, niveau 2 (moyen)
- ✅ `map/resources/iron_forest_3.png` — fer, tempéré, niveau 3 (riche)
- ✅ `map/resources/iron_desert_1.png` — fer, désert, niveau 1 (petit)
- ✅ `map/resources/iron_desert_2.png` — fer, désert, niveau 2 (moyen)
- ✅ `map/resources/iron_desert_3.png` — fer, désert, niveau 3 (riche)
- ✅ `map/resources/iron_snow_1.png` — fer, neige, niveau 1 (petit)
- ✅ `map/resources/iron_snow_2.png` — fer, neige, niveau 2 (moyen)
- ✅ `map/resources/iron_snow_3.png` — fer, neige, niveau 3 (riche)
- ✅ `map/resources/food_forest_1.png` — nourriture, tempéré, niveau 1 (petit)
- ✅ `map/resources/food_forest_2.png` — nourriture, tempéré, niveau 2 (moyen)
- ✅ `map/resources/food_forest_3.png` — nourriture, tempéré, niveau 3 (riche)
- ✅ `map/resources/food_desert_1.png` — nourriture, désert, niveau 1 (petit)
- ✅ `map/resources/food_desert_2.png` — nourriture, désert, niveau 2 (moyen)
- ✅ `map/resources/food_desert_3.png` — nourriture, désert, niveau 3 (riche)
- ✅ `map/resources/food_snow_1.png` — nourriture, neige, niveau 1 (petit)
- ✅ `map/resources/food_snow_2.png` — nourriture, neige, niveau 2 (moyen)
- ✅ `map/resources/food_snow_3.png` — nourriture, neige, niveau 3 (riche)
- ✅ `map/resources/gold_forest_1.png` — or, tempéré, niveau 1 (petit)
- ✅ `map/resources/gold_forest_2.png` — or, tempéré, niveau 2 (moyen)
- ✅ `map/resources/gold_forest_3.png` — or, tempéré, niveau 3 (riche)
- ✅ `map/resources/gold_desert_1.png` — or, désert, niveau 1 (petit)
- ✅ `map/resources/gold_desert_2.png` — or, désert, niveau 2 (moyen)
- ✅ `map/resources/gold_desert_3.png` — or, désert, niveau 3 (riche)
- ✅ `map/resources/gold_snow_1.png` — or, neige, niveau 1 (petit)
- ✅ `map/resources/gold_snow_2.png` — or, neige, niveau 2 (moyen)
- ✅ `map/resources/gold_snow_3.png` — or, neige, niveau 3 (riche)

### Camps des tribus et ruines — 12 livrée(s), 0 à faire ✅

- **Où ça se voit** : Le camp de la tribu qui tient un point de ressource (niveau 1 petit camp, 2 camp palissadé, 3 fort de bois), par biome ; les ruines après sa défaite jusqu'à sa réapparition. Sans eux, l'icône de ressource reste.
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 12 « Camps des tribus, ruines, fondation » (prompt complet et image guide pour chaque fichier) ; sujets en français : `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § « Camps barbares de la carte ».
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ✅ `map/camps/camp1.png` — camp de tribu, niveau 1, prairie
- ✅ `map/camps/camp1_desert.png` — camp de tribu, niveau 1, désert
- ✅ `map/camps/camp1_snow.png` — camp de tribu, niveau 1, neige
- ✅ `map/camps/camp2.png` — camp de tribu, niveau 2, prairie
- ✅ `map/camps/camp2_desert.png` — camp de tribu, niveau 2, désert
- ✅ `map/camps/camp2_snow.png` — camp de tribu, niveau 2, neige
- ✅ `map/camps/camp3.png` — camp de tribu, niveau 3, prairie
- ✅ `map/camps/camp3_desert.png` — camp de tribu, niveau 3, désert
- ✅ `map/camps/camp3_snow.png` — camp de tribu, niveau 3, neige
- ✅ `map/camps/ruins.png` — camp détruit (ruines), prairie
- ✅ `map/camps/ruins_desert.png` — camp détruit (ruines), désert
- ✅ `map/camps/ruins_snow.png` — camp détruit (ruines), neige

### Campement de fondation — 3 livrée(s), 0 à faire ✅

- **Où ça se voit** : Le point de ressource pendant les 24 h de fondation d'une ville : tentes, chariot bâché, piquets et cordes de la future enceinte (la bannière du fondateur est ajoutée par le jeu).
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 12 « Camps des tribus, ruines, fondation » (prompt complet et image guide pour chaque fichier) ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S12.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.
- **Note** : `docs/A-GENERER.md` les compte deux fois (étape 5 et étape 9) ; ici une seule fois.

**Fichiers** (✅ = livré et dans le jeu) :

- ✅ `map/camps/foundation.png` — campement de fondation d'une ville, prairie
- ✅ `map/camps/foundation_desert.png` — campement de fondation d'une ville, désert
- ✅ `map/camps/foundation_snow.png` — campement de fondation d'une ville, neige

### Donjons des invasions barbares (hordes) — 0 livrée(s), 5 à faire

- **Où ça se voit** : Le repaire d'une horde de cavaliers des steppes pendant les invasions du week-end, du niveau 1 au niveau 5 ; aujourd'hui la forteresse des Huns sur un halo rouge. Style des Huns : yourtes de feutre, palissades de pieux, totems à crânes de cheval, étendards en queue de cheval rouges.
- **Taille et format** : 1024×1024, PNG transparent, cadrage d'une case (guide-objet). Une variante par biome est possible mais pas demandée (`horde_<n>_desert`, `horde_<n>_snow` : le jeu les prend s'il les trouve).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence (même famille que les camps des tribus).
- **Prompt** : aucun prompt écrit dans les sources ; prompt ci-dessous = préfixe de la carte (`docs/PROMPTS-CARTE.md`, « Comment produire une image ») + composition d'une case + sujet.
- **Dans le jeu** : le dessin du donjon cherche déjà ces noms (`horde_<niveau>`), mais le chargeur de la carte ne les charge pas encore et l'outil d'import ne les connaît pas : petit travail de code de mon côté à la livraison (chargeur + registre, quelques lignes), compris dans l'intégration.

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours, detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel); otherwise a flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, without any plot, slab or base under it (the ground is transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width, centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.
```

Puis, pour chaque fichier :

- `map/camps/horde_1.png` — `Subject: the lair of a steppe horde, level 1: a ring of sharpened stakes, three felt yurts, a horse-skull totem, red horsetail standards, a campfire; nothing else on the tile.`
- `map/camps/horde_2.png` — `Subject: the lair of a steppe horde, level 2: a taller stake palisade with a gate and a wooden watchtower, five felt yurts, horse pens, skull totems, red horsetail standards; nothing else on the tile.`
- `map/camps/horde_3.png` — `Subject: the lair of a steppe horde, level 3: a log fort with two corner towers, the chief's large yurt on a low mound, horse pens, skull totems, several red horsetail standards; nothing else on the tile.`
- `map/camps/horde_4.png` — `Subject: the lair of a steppe horde, level 4: a stone-and-timber stronghold on a mound with ramparts and a chief's tower, yurts inside, skull totems, many red horsetail standards; nothing else on the tile.`
- `map/camps/horde_5.png` — `Subject: the lair of a steppe horde, level 5: a great fortress of stone and dark timber on a hill with three visible tiers (outpost, ramparts, chief's tower), red horsetail banners, skull totems, torches; nothing else on the tile.`

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `map/camps/horde_1.png` — niveau 1 : palissade de pieux, trois yourtes, totem à crâne de cheval, feu
  - prompt : `Subject: the lair of a steppe horde, level 1: a ring of sharpened stakes, three felt yurts, a horse-skull totem, red horsetail standards, a campfire; nothing else on the tile.`
- ⬜ `map/camps/horde_2.png` — niveau 2 : palissade plus haute avec porte et tour de guet, cinq yourtes, enclos
  - prompt : `Subject: the lair of a steppe horde, level 2: a taller stake palisade with a gate and a wooden watchtower, five felt yurts, horse pens, skull totems, red horsetail standards; nothing else on the tile.`
- ⬜ `map/camps/horde_3.png` — niveau 3 : fort de rondins à deux tours, grande yourte du chef sur une butte
  - prompt : `Subject: the lair of a steppe horde, level 3: a log fort with two corner towers, the chief's large yurt on a low mound, horse pens, skull totems, several red horsetail standards; nothing else on the tile.`
- ⬜ `map/camps/horde_4.png` — niveau 4 : place forte de pierre et de bois sur une butte, remparts, tour du chef
  - prompt : `Subject: the lair of a steppe horde, level 4: a stone-and-timber stronghold on a mound with ramparts and a chief's tower, yurts inside, skull totems, many red horsetail standards; nothing else on the tile.`
- ⬜ `map/camps/horde_5.png` — niveau 5 : grande forteresse sur une colline, trois étages visibles (avant-poste, remparts, tour du chef)
  - prompt : `Subject: the lair of a steppe horde, level 5: a great fortress of stone and dark timber on a hill with three visible tiers (outpost, ramparts, chief's tower), red horsetail banners, skull totems, torches; nothing else on the tile.`

### Armées en marche — 0 livrée(s), 29 à faire

- **Où ça se voit** : Le marqueur d'une armée qui se déplace sur la carte, par classe dominante (infanterie, archers, cavalerie, engins) et par civilisation, plus la version neutre de repli et la charrette du marchand (armées de transport). Aussi utilisés dans le replay de bataille.
- **Taille et format** : 1024×1024, PNG transparent, petit groupe de figurines marchant vers le bas-droit, pieds à 75 % de la hauteur ; guide `docs/img/guides-carte/guide-armee.png`.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence, coiffes et couleurs de la civilisation.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 13 « Armées en marche » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `map/units/archer.png` — archers (neutre, sans civilisation : repli)
- ⬜ `map/units/archer_EGYPT.png` — archers d'Égypte
- ⬜ `map/units/archer_GAUL.png` — archers de Gaule
- ⬜ `map/units/archer_GREEK.png` — archers de Grèce
- ⬜ `map/units/archer_HUN.png` — archers des Huns
- ⬜ `map/units/archer_ROME.png` — archers de Rome
- ⬜ `map/units/archer_SULTAN.png` — archers du Sultanat
- ⬜ `map/units/catapult.png` — engins de siège (neutre, sans civilisation : repli)
- ⬜ `map/units/catapult_EGYPT.png` — engins de siège d'Égypte
- ⬜ `map/units/catapult_GAUL.png` — engins de siège de Gaule
- ⬜ `map/units/catapult_GREEK.png` — engins de siège de Grèce
- ⬜ `map/units/catapult_HUN.png` — engins de siège des Huns
- ⬜ `map/units/catapult_ROME.png` — engins de siège de Rome
- ⬜ `map/units/catapult_SULTAN.png` — engins de siège du Sultanat
- ⬜ `map/units/cavalry.png` — cavalerie (neutre, sans civilisation : repli)
- ⬜ `map/units/cavalry_EGYPT.png` — cavalerie d'Égypte
- ⬜ `map/units/cavalry_GAUL.png` — cavalerie de Gaule
- ⬜ `map/units/cavalry_GREEK.png` — cavalerie de Grèce
- ⬜ `map/units/cavalry_HUN.png` — cavalerie des Huns
- ⬜ `map/units/cavalry_ROME.png` — cavalerie de Rome
- ⬜ `map/units/cavalry_SULTAN.png` — cavalerie du Sultanat
- ⬜ `map/units/hoplite.png` — infanterie (neutre, sans civilisation : repli)
- ⬜ `map/units/hoplite_EGYPT.png` — infanterie d'Égypte
- ⬜ `map/units/hoplite_GAUL.png` — infanterie de Gaule
- ⬜ `map/units/hoplite_GREEK.png` — infanterie de Grèce
- ⬜ `map/units/hoplite_HUN.png` — infanterie des Huns
- ⬜ `map/units/hoplite_ROME.png` — infanterie de Rome
- ⬜ `map/units/hoplite_SULTAN.png` — infanterie du Sultanat
- ⬜ `map/units/merchant.png` — charrette du marchand (armées de transport)

### Cortège de colons — 0 livrée(s), 7 à faire

- **Où ça se voit** : L'armée partie fonder une ville : chariot bâché tiré par des bœufs, famille à pied, homme au piquet à fanion ; une version neutre et une par civilisation (charrette du marchand tant que le sprite manque).
- **Taille et format** : 1024×1024, PNG transparent, guide-armee.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 13 « Armées en marche » (prompt complet et image guide pour chaque fichier) ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S12.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `map/units/settler.png` — cortège de colons, sans civilisation (repli)
- ⬜ `map/units/settler_ROME.png` — cortège de colons de Rome
- ⬜ `map/units/settler_GAUL.png` — cortège de colons de Gaule
- ⬜ `map/units/settler_GREEK.png` — cortège de colons de Grèce
- ⬜ `map/units/settler_EGYPT.png` — cortège de colons d'Égypte
- ⬜ `map/units/settler_HUN.png` — cortège de colons des Huns
- ⬜ `map/units/settler_SULTAN.png` — cortège de colons du Sultanat

### Héros en tête d'armée et espion — 0 livrée(s), 7 à faire

- **Où ça se voit** : Une armée menée par le héros prend ce marqueur (héros à cheval devant la troupe) ; une mission d'espionnage prend la silhouette encapuchonnée.
- **Taille et format** : 1024×1024, PNG transparent, guide-armee.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 13 « Armées en marche » (prompt complet et image guide pour chaque fichier) ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S18.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `map/units/hero_ROME.png` — héros de Rome à cheval en tête de deux soldats
- ⬜ `map/units/hero_GAUL.png` — héros de Gaule à cheval en tête de deux soldats
- ⬜ `map/units/hero_GREEK.png` — héros de Grèce à cheval en tête de deux soldats
- ⬜ `map/units/hero_EGYPT.png` — héros d'Égypte à cheval en tête de deux soldats
- ⬜ `map/units/hero_HUN.png` — héros des Huns à cheval en tête de deux soldats
- ⬜ `map/units/hero_SULTAN.png` — héros du Sultanat à cheval en tête de deux soldats
- ⬜ `map/units/spy.png` — espion : silhouette encapuchonnée à cheval

### Cycles de marche des armées (planches) — 0 livrée(s), 33 à faire

- **Où ça se voit** : L'animation de marche sur la carte, pour chaque groupe de la colonne : par classe et civilisation, héros en tête, marchand, colons, espion. Sans elle, l'armée trottine avec son image immobile.
- **Taille et format** : **Une planche par armée** : 6 poses en grille de 3 colonnes × 2 rangées, image 1536×1024, chaque pose dans un carré de 512×512, PNG transparent ; guide `docs/img/guides-carte/guide-armee-planche.png`. Je découpe à l'import.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une planche 3 × 2 par ligne.
- **Style** : Style de la carte de référence ; mêmes figurines, même taille et même place dans chaque case, seule la pose change.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 15 « Marche des armées (une image de 6 poses par armée) » (prompt complet et image guide pour chaque fichier)
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `map/units/settler_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cortège de colons (chariot bâché, famille à pied)
- ⬜ `map/units/hoplite_ROME_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie de Rome
- ⬜ `map/units/archer_ROME_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers de Rome
- ⬜ `map/units/cavalry_ROME_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie de Rome
- ⬜ `map/units/catapult_ROME_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège de Rome
- ⬜ `map/units/hoplite_GAUL_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie de Gaule
- ⬜ `map/units/archer_GAUL_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers de Gaule
- ⬜ `map/units/cavalry_GAUL_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie de Gaule
- ⬜ `map/units/catapult_GAUL_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège de Gaule
- ⬜ `map/units/hoplite_GREEK_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie de Grèce
- ⬜ `map/units/archer_GREEK_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers de Grèce
- ⬜ `map/units/cavalry_GREEK_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie de Grèce
- ⬜ `map/units/catapult_GREEK_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège de Grèce
- ⬜ `map/units/hoplite_EGYPT_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie d'Égypte
- ⬜ `map/units/archer_EGYPT_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers d'Égypte
- ⬜ `map/units/cavalry_EGYPT_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie d'Égypte
- ⬜ `map/units/catapult_EGYPT_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège d'Égypte
- ⬜ `map/units/hoplite_HUN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie des Huns
- ⬜ `map/units/archer_HUN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers des Huns
- ⬜ `map/units/cavalry_HUN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie des Huns
- ⬜ `map/units/catapult_HUN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège des Huns
- ⬜ `map/units/hoplite_SULTAN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : infanterie du Sultanat
- ⬜ `map/units/archer_SULTAN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : archers du Sultanat
- ⬜ `map/units/cavalry_SULTAN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : cavalerie du Sultanat
- ⬜ `map/units/catapult_SULTAN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : engins de siège du Sultanat
- ⬜ `map/units/hero_ROME_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros de Rome
- ⬜ `map/units/hero_GAUL_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros de Gaule
- ⬜ `map/units/hero_GREEK_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros de Grèce
- ⬜ `map/units/hero_EGYPT_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros d'Égypte
- ⬜ `map/units/hero_HUN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros des Huns
- ⬜ `map/units/hero_SULTAN_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : armée menée par le héros du Sultanat
- ⬜ `map/units/merchant_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : charrette du marchand
- ⬜ `map/units/spy_walk.png` — planche 3 × 2 de 1536×1024 (6 poses de 512×512) — marche : espion encapuchonné à cheval

### Replay de bataille : poses, projectiles, impacts — 0 livrée(s), 17 à faire

- **Où ça se voit** : Le replay des rapports de combat : chaque classe qui attaque (3 poses) et qui est touchée (2 poses), le héros de chaque civilisation qui attaque, une flèche, une pierre de catapulte, un éclat d'impact.
- **Taille et format** : Poses : bande horizontale de N cases de 512×512 dans une seule image, PNG transparent, même cadrage que l'armée immobile (guide-armee). Flèche et pierre : 512×512.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 16 « Plus tard : poses du replay de bataille » (prompt complet et image guide pour chaque fichier) ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A6 et A18.
- **Dans le jeu** : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `fx/arrow.png` — flèche en vol, vue de côté
- ⬜ `fx/stone.png` — pierre de catapulte
- ⬜ `map/units/hero_ROME_attack.png` — bande de 3 cases de 512×512 — héros de Rome : armer, frapper, retour
- ⬜ `map/units/hero_GAUL_attack.png` — bande de 3 cases de 512×512 — héros de Gaule : armer, frapper, retour
- ⬜ `map/units/hero_GREEK_attack.png` — bande de 3 cases de 512×512 — héros de Grèce : armer, frapper, retour
- ⬜ `map/units/hero_EGYPT_attack.png` — bande de 3 cases de 512×512 — héros d'Égypte : armer, frapper, retour
- ⬜ `map/units/hero_HUN_attack.png` — bande de 3 cases de 512×512 — héros des Huns : armer, frapper, retour
- ⬜ `map/units/hero_SULTAN_attack.png` — bande de 3 cases de 512×512 — héros du Sultanat : armer, frapper, retour
- ⬜ `map/units/hoplite_attack.png` — bande de 3 cases de 512×512 — infanterie : armer, frapper ou tirer, retour
- ⬜ `map/units/hoplite_hit.png` — bande de 2 cases de 512×512 — infanterie touchés : recul, chute
- ⬜ `map/units/archer_attack.png` — bande de 3 cases de 512×512 — archers : armer, frapper ou tirer, retour
- ⬜ `map/units/archer_hit.png` — bande de 2 cases de 512×512 — archers touchés : recul, chute
- ⬜ `map/units/cavalry_attack.png` — bande de 3 cases de 512×512 — cavalerie : armer, frapper ou tirer, retour
- ⬜ `map/units/cavalry_hit.png` — bande de 2 cases de 512×512 — cavalerie touchés : recul, chute
- ⬜ `map/units/catapult_attack.png` — bande de 3 cases de 512×512 — engins de siège : armer, frapper ou tirer, retour
- ⬜ `map/units/catapult_hit.png` — bande de 2 cases de 512×512 — engins de siège touchés : recul, chute
- ⬜ `fx/impact.png` — bande de 3 cases de 512×512 — éclat d'impact : étincelle, étoile, poussière

### Effets de la carte — 5 livrée(s), 0 à faire ✅

- **Où ça se voit** : Combat en cours, ville en feu (déjà branché : une ville au mur abîmé brûle), feu de camp des tribus, pluie et neige.
- **Taille et format** : Bande horizontale de 4 cases de 512×512 dans une seule image, PNG transparent.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style de la carte de référence.
- **Prompt** : `docs/PROMPTS-CARTE.md` § 14 « Effets de la carte » (prompt complet et image guide pour chaque fichier) et § 17 ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A7 et A17.
- **Dans le jeu** : le feu est déjà branché ; combat, feu de camp et météo : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** (✅ = livré et dans le jeu) :

- ✅ `map/fx/rain.png` — bande de 4 cases de 512×512 — nappe de pluie translucide
- ✅ `map/fx/snowfall.png` — bande de 4 cases de 512×512 — chute de neige
- ✅ `map/fx/battle.png` — bande de 4 cases de 512×512 — deux épées qui s'entrechoquent, étincelles (combat en cours)
- ✅ `map/fx/fire.png` — bande de 4 cases de 512×512 — flammes orange et fumée sombre (ville en feu, déjà branché)
- ✅ `map/fx/campfire.png` — bande de 4 cases de 512×512 — petit feu de camp (camp des tribus)

### Bannières de la boutique d'alliance — 0 livrée(s), 4 à faire

- **Où ça se voit** : Cosmétique acheté avec les points d'alliance et planté devant les villes du joueur sur la carte. Une bannière n'est mise en vente qu'une fois son image livrée (`data/alliance-shop.json`).
- **Taille et format** : 512×768 (portrait 2:3, comme les drapeaux `props/flag_*`, affichée en 128×192), PNG transparent. Le 1024×1024 annoncé dans `docs/A-GENERER.md` convient aussi, je recadre.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint (c'est un objet posé sur la carte, mais vu comme un drapeau de ville) : étendard de tissu sur sa hampe plantée dans le sol, vu de trois quarts, emblème brodé, couleurs neutres valables pour toutes les civilisations.
- **Prompt** : aucun prompt écrit dans les sources ; prompt ci-dessous = préfixe peint + composition « prop » + sujet.
- **Dans le jeu** : la boutique (`data/alliance-shop.json`) et la carte attendent déjà ces noms sous `painted/banners/` ; seul l'outil d'import ne les connaît pas encore : je les ajoute au registre à la livraison (quelques lignes).

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Composition: 2:3 portrait image, the prop centered horizontally, its base at 89% of the image height, about 60% of the width.
```

Puis, pour chaque fichier :

- `banners/banner_eagle.png` — `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a golden eagle, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`
- `banners/banner_wolf.png` — `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a grey wolf's head, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`
- `banners/banner_sun.png` — `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a radiant sun, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`
- `banners/banner_bull.png` — `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a black bull's head, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `banners/banner_eagle.png` — bannière de l'aigle
  - prompt : `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a golden eagle, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`
- ⬜ `banners/banner_wolf.png` — bannière du loup
  - prompt : `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a grey wolf's head, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`
- ⬜ `banners/banner_sun.png` — bannière du soleil
  - prompt : `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a radiant sun, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`
- ⬜ `banners/banner_bull.png` — bannière du taureau
  - prompt : `Subject: a cloth banner on a tall wooden pole planted in the ground, seen in three-quarter view and waving gently, embroidered with a black bull's head, cream and dark-red cloth with gold fringes, neutral colours that suit every civilisation.`

### Bastion, Merveille, Immortels (à confirmer : ce sont des villes spéciales) — 0 livrée(s), 10 à faire

- **Où ça se voit** : Le Bastion d'alliance (forteresse commune, et son chantier de 3 jours), la Ville Merveille de fin de partie (5 étapes de construction) et les sites des Immortels (site gardé, site libre, plan). Aujourd'hui le jeu réutilise une forteresse de civilisation. Les noms du Bastion, de son chantier et des 5 Merveilles sont ceux que le code de la carte cherche ; les 3 noms des sites des Immortels viennent des listes (`docs/LISTE-GRAPHISMES.md` § 4), rien ne les affiche encore. **Ils partagent le cadrage 2 × 2 des villes de la carte, exclues de cette liste : à toi de dire si tu les produis maintenant ou avec les villes.**
- **Taille et format** : Bastion, chantier et 5 Merveilles : 1024×1024, PNG transparent, bloc de 2 × 2 cases (losange à 90 % de la largeur, centre à 68 %), guide `docs/img/guides-carte/guide-ville.png`. Les 3 sites des Immortels : 1024×1024, cadrage d'une case (guide-objet).
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style de la carte de référence, style neutre valable pour toutes les civilisations. Immortels = armée d'élite perse : tentes pourpres et or, étendards au soleil ailé.
- **Prompt** : aucun prompt écrit dans les sources (seulement la description de `docs/A-GENERER.md`, en tête) ; prompts ci-dessous = préfixe de la carte + composition « ville 2 × 2 » ou « une case » + sujet.
- **Dans le jeu** : rien ne s'affiche tout seul à l'import : le chargeur de la carte ne charge que les villes de son manifeste, les sites des Immortels n'ont pas encore de dessin, et l'outil d'import ne connaît aucun de ces 10 noms. Petit travail de code de mon côté à la livraison (chargeur, affichage des sites, registre), compris dans l'intégration.

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours, detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel); otherwise a flat pure magenta (#FF00FF) background, which will be removed.

Villes 2 × 2 : Composition: square image (1024 x 1024). A walled site whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. The main gate stands in the middle of the front-right wall. No ground plate under it: outside the walls the image is transparent, only the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the site, do not draw the red diamond, the marks or the grey background.

Sites d'une case : Composition: square image (1024 x 1024). The subject stands directly on the ground, without any plot, slab or base under it (the ground is transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width, centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.
```

Puis, pour chaque fichier :

- `map/cities/bastion.png` — `Subject: a great neutral alliance fortress: massive stone curtain walls with square towers, a central keep, plain banners without emblem, a style that suits every civilisation.`
- `map/cities/bastion_site.png` — `Subject: the same alliance fortress under construction: foundations and low walls, wooden scaffolding, a wooden crane, piles of cut stones and logs, workers' tents.`
- `map/cities/wonder_0.png` — `Subject: a fortified neutral city with, in its middle, the foundations of a colossal ancient monument: a vast stone platform, trenches, first courses of stone, cranes.`
- `map/cities/wonder_25.png` — `Subject: the same fortified city with the monument a quarter built: tall scaffolding around the first storeys, cranes, ramps.`
- `map/cities/wonder_50.png` — `Subject: the same fortified city with the monument half built: the lower half finished in pale stone, scaffolding above.`
- `map/cities/wonder_75.png` — `Subject: the same fortified city with the monument almost finished: only the top still in scaffolding, gold trims appearing.`
- `map/cities/wonder_100.png` — `Subject: the same fortified city with the monument finished: a colossal gleaming monument of pale stone and gold, banners and torches, a style that suits every civilisation.`
- `map/camps/wonder_site_immortals.png` — `Subject: the camp of the Persian Immortals, an elite army, around monumental ancient ruins: purple and gold tents, winged-sun standards, spear racks, a campfire.`
- `map/camps/wonder_site.png` — `Subject: monumental ancient ruins alone: broken colossal columns, a cracked stone platform, fallen blocks, nobody around.`
- `map/camps/immortals_plan.png` — `Subject: a small fortified camp of the Persian Immortals (purple and gold tents, winged-sun standard) around a chest and a stand of rolled plans.`

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `map/cities/bastion.png` — Bastion d'alliance debout : forteresse commune de pierre massive, tours carrées, donjon central, bannières sans emblème
  - prompt : `Subject: a great neutral alliance fortress: massive stone curtain walls with square towers, a central keep, plain banners without emblem, a style that suits every civilisation.`
- ⬜ `map/cities/bastion_site.png` — chantier du Bastion : même emprise, fondations, échafaudages, grue de bois, tas de pierres
  - prompt : `Subject: the same alliance fortress under construction: foundations and low walls, wooden scaffolding, a wooden crane, piles of cut stones and logs, workers' tents.`
- ⬜ `map/cities/wonder_0.png` — Ville Merveille, étape 1/5 : fondations tracées au centre d'une ville fortifiée
  - prompt : `Subject: a fortified neutral city with, in its middle, the foundations of a colossal ancient monument: a vast stone platform, trenches, first courses of stone, cranes.`
- ⬜ `map/cities/wonder_25.png` — étape 2/5 : échafaudages, premiers étages
  - prompt : `Subject: the same fortified city with the monument a quarter built: tall scaffolding around the first storeys, cranes, ramps.`
- ⬜ `map/cities/wonder_50.png` — étape 3/5 : monument à moitié construit
  - prompt : `Subject: the same fortified city with the monument half built: the lower half finished in pale stone, scaffolding above.`
- ⬜ `map/cities/wonder_75.png` — étape 4/5 : presque achevé, dernier échafaudage au sommet
  - prompt : `Subject: the same fortified city with the monument almost finished: only the top still in scaffolding, gold trims appearing.`
- ⬜ `map/cities/wonder_100.png` — étape 5/5 : monument achevé et doré, bannières
  - prompt : `Subject: the same fortified city with the monument finished: a colossal gleaming monument of pale stone and gold, banners and torches, a style that suits every civilisation.`
- ⬜ `map/camps/wonder_site_immortals.png` — site de Merveille gardé : camp des Immortels (tentes pourpres et or, soleil ailé) autour de ruines monumentales
  - prompt : `Subject: the camp of the Persian Immortals, an elite army, around monumental ancient ruins: purple and gold tents, winged-sun standards, spear racks, a campfire.`
- ⬜ `map/camps/wonder_site.png` — site de Merveille libre : ruines monumentales seules
  - prompt : `Subject: monumental ancient ruins alone: broken colossal columns, a cracked stone platform, fallen blocks, nobody around.`
- ⬜ `map/camps/immortals_plan.png` — plan de la Merveille : petit camp fortifié des Immortels autour d'un coffre et de rouleaux
  - prompt : `Subject: a small fortified camp of the Persian Immortals (purple and gold tents, winged-sun standard) around a chest and a stand of rolled plans.`

## Interface — 71 images

### Bandeaux en tête des écrans — 0 livrée(s), 7 à faire

- **Où ça se voit** : Le bandeau en haut des écrans Marché, Alliance, Classement, Sac, Rapports (guides 3D), Armée et Recherche (nouveaux).
- **Taille et format** : 1536×1024, PNG, cadre « header ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Bandeaux en tête des écrans » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S20.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `scenes/header-alliance.png` — mur de grès, trois bannières, boucliers, torches (écran Alliance)
- ⬜ `scenes/header-inventory.png` — coffre ouvert plein d'or, amphore, lance, bouclier (écran Sac)
- ⬜ `scenes/header-market.png` — étal de marché à auvent rouge, caisses, tonneaux (écran Marché)
- ⬜ `scenes/header-ranking.png` — podium de pierre à trois marches, trophée d'or (écran Classement)
- ⬜ `scenes/header-reports.png` — parchemin déroulé, plume, encrier, torche (écran Rapports)
- ⬜ `scenes/header-army.png` — armée à la parade : boucliers, lances, étendards, un cheval (écran Armée)
- ⬜ `scenes/header-research.png` — bibliothèque et atelier : rouleaux, astrolabe, maquette de grue, lampes (écran Recherche)

### Vignettes : fondation, tribus, expéditions — 0 livrée(s), 8 à faire

- **Où ça se voit** : En tête des rapports de tribu (déjà branché), de l'onglet Colons et de la modale de fondation, et pour les quatre destinations d'expédition du héros.
- **Taille et format** : 1536×1024, PNG, cadre « header ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Vignettes : tribus, fondation, expéditions » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S4, S12 et S14.
- **Dans le jeu** : tribus et expéditions déjà branchées ; la vignette de fondation : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `scenes/vignette-founding.png` — fondation d'une ville : chariot déchargé, piquet à fanion, tentes, prêtre, collines à l'aube
- ⬜ `scenes/vignette-tribe-forest.png` — camp de tribu en forêt : huttes rondes au toit de chaume, palissade, totem, guerriers au feu
- ⬜ `scenes/vignette-tribe-desert.png` — camp de tribu du désert : tentes de peaux, palmier, chameaux, rochers rouges
- ⬜ `scenes/vignette-tribe-snow.png` — camp de tribu des neiges : huttes couvertes de fourrures dans une pinède enneigée
- ⬜ `scenes/expedition-forest.png` — destination d'expédition : forêt profonde, rochers moussus, ruisseau
- ⬜ `scenes/expedition-desert.png` — destination d'expédition : dunes dorées, oasis, pylône en ruine
- ⬜ `scenes/expedition-mountain.png` — destination d'expédition : col rocheux, sommets enneigés, entrée de grotte
- ⬜ `scenes/expedition-ruins.png` — destination d'expédition : temple antique envahi par la végétation, coffre

### Habillage : plaque parchemin et boutons ronds — 0 livrée(s), 3 à faire

- **Où ça se voit** : La plaque de parchemin est la **dernière pièce** de l'habillage peint (boutons, cadres, plaques, barre) : tant qu'elle manque, tout l'habillage peint reste désactivé dans le jeu. Les boutons ronds servent aux bulles d'action sur la ville (aujourd'hui un dégradé CSS).
- **Taille et format** : 1024×1024, PNG, l'élément remplit toute l'image bord à bord, vue de face, sans perspective ; guide 3D pour la plaque.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, aucun texte ni symbole.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Habillage : boutons, cadres, plaques, barres » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S5.
- **Dans le jeu** : la plaque : déjà prévu dans le jeu : l'image s'affiche dès l'import. Les boutons ronds : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `ui/plate-parchment.png` — plaque de parchemin vieilli, bord brun usé, sans décor (dernière pièce de l'habillage)
- ⬜ `ui/btn-round.png` — bouton rond de bois sombre, filet d'or, vide au centre
- ⬜ `ui/btn-round-pressed.png` — le même bouton enfoncé : plus sombre, plat

### Icônes d'interface restantes (colon, tribu, siège) — 0 livrée(s), 3 à faire

- **Où ça se voit** : Le colon (onglet Colons, carte d'armée, bouton « Fonder une ville »), la tribu locale (bulle du point, rapports) et le siège (alerte de siège, carte d'armée en siège, bouton « Briser le siège »). Les 61 autres icônes sont peintes.
- **Taille et format** : 1024×1024, PNG transparent, cadre « icon » : un seul objet centré sur 70 % du cadre, trois quarts, lisible en petit.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, même famille que les icônes existantes (`ui/wood`, `ui/attack`…).
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Icônes d'interface (ressources, onglets, actions, colon, tribu) » pour le colon et la tribu ; l'icône de siège n'y a pas de prompt : prompt ci-dessous.
- **Dans le jeu** : colon et tribu déjà branchés ; l'icône de siège : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.
- **Note** : Le nom `ui/icons/siege.png` (avec le sous-dossier `icons/`) est celui que l'outil d'import attend aujourd'hui ; je le normaliserai en `ui/siege` au branchement, les deux seront acceptés.

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Composition: square image, a single object centered filling about 70% of the frame, three-quarter view from slightly above.
```

Puis, pour chaque fichier :

- `ui/icons/siege.png` — `Subject: a game interface icon: a wooden battering ram under a hide-covered shelter on four wheels (siege), a single object centered, three-quarter view, bold and readable at small size.`

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `ui/icons/siege.png` — siège : bélier sous abri de peaux, sur roues
  - prompt : `Subject: a game interface icon: a wooden battering ram under a hide-covered shelter on four wheels (siege), a single object centered, three-quarter view, bold and readable at small size.`
- ⬜ `ui/settler.png` — colon : villageois en marche, baluchon sur l'épaule, piquet à fanion
- ⬜ `ui/tribe.png` — tribu locale : totem de bois à crâne et deux massues croisées

### Blasons des civilisations — 0 livrée(s), 6 à faire

- **Où ça se voit** : Inscription (cartes de civilisation), alliance, étiquettes de la carte ; aujourd'hui on réutilise le buste du héros.
- **Taille et format** : 1024×1024, PNG transparent, cadre « icon », vue de face : blason sur un bouclier rond à fin liseré d'or.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Blasons des civilisations » ; sujets précis : `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S3.
- **Dans le jeu** : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `ui/crest_ROME.png` — blason de Rome : aigle d'or aux ailes déployées sur fond rouge profond
- ⬜ `ui/crest_GAUL.png` — blason de Gaule : sanglier blanc sur fond vert, bord de bois sculpté
- ⬜ `ui/crest_GREEK.png` — blason de Grèce : chouette d'or sur fond bleu, couronne de laurier
- ⬜ `ui/crest_EGYPT.png` — blason d'Égypte : scarabée d'or sur fond turquoise, bord ocre
- ⬜ `ui/crest_HUN.png` — blason des Huns : tête de cheval noire sur fond rouge, bord de fourrure
- ⬜ `ui/crest_SULTAN.png` — blason du Sultanat : croissant et étoile d'or sur mosaïque turquoise

### Icônes des technologies et des branches — 0 livrée(s), 12 à faire

- **Où ça se voit** : L'onglet Recherche de l'Académie : une icône sur la carte de chaque technologie et en tête de sa fiche, une par branche.
- **Taille et format** : 1024×1024, PNG transparent, cadre « icon ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Icônes des technologies et des branches » ; sujets en français : `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § S8.
- **Dans le jeu** : déjà prévu dans le jeu : l'image s'affiche dès l'import.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `ui/tech_AGRONOMY.png` — Agronomie : gerbe de blé doré croisée d'une charrue de bois
- ⬜ `ui/tech_ENGINEERING.png` — Ingénierie : grue de bois levant un bloc de pierre, équerre
- ⬜ `ui/tech_TRAINING.png` — Entraînement : deux épées de bois croisées sur un bouclier rond
- ⬜ `ui/tech_TACTICS.png` — Tactique : parchemin déroulé avec un plan de bataille, marqueur de bronze
- ⬜ `ui/tech_DISCIPLINE.png` — Discipline : trois boucliers ronds qui se chevauchent en mur
- ⬜ `ui/tech_MEDICINE.png` — Médecine : bol d'argile d'herbes vertes, bande de lin roulée
- ⬜ `ui/tech_CARTOGRAPHY.png` — Cartographie : carte roulée, rose des vents, petite figurine de cheval
- ⬜ `ui/tech_SUPPLY.png` — Intendance : sacs de grain empilés et tonneau de bois
- ⬜ `ui/branch_ECONOMY.png` — branche Économie : gerbe de blé et pile de pièces
- ⬜ `ui/branch_MILITARY.png` — branche Militaire : épée de bronze et lance croisées
- ⬜ `ui/branch_DEFENSE.png` — branche Défense : grand bouclier devant un mur crénelé
- ⬜ `ui/branch_LOGISTICS.png` — branche Logistique : roue de charrette chargée et poteau indicateur

### Objets du héros : les 23 nouvelles icônes — 0 livrée(s), 23 à faire

- **Où ça se voit** : Le nouveau système d'objets du héros (décisions du 1er novembre 2026, en cours dans la branche `jeu-items`) : inventaire, équipement, butin, boutique d'alliance. Les 8 objets gardés ont déjà leur icône ; les 6 objets retirés (boucliers, jambières, anneau, amulette) ne sont pas à refaire. En attendant l'icône, le jeu montre celle de l'emplacement en gris.
- **Taille et format** : 1024×1024, PNG transparent, cadre « icon » : l'objet seul, centré, trois quarts. **Ne pas dessiner de cadre coloré** : le jeu met lui-même le cadre de couleur de la rareté.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, même style que les icônes d'objets déjà faites (`ui/item_iron_sword`, `ui/item_chain_mail`…).
- **Prompt** : aucun prompt dans `docs/GENERATION-COMPLETE.md` (liste et sujets en français dans `docs/A-GENERER.md` § 9 bis de la branche objets) ; prompts ci-dessous = préfixe peint + composition « icon » + sujet.
- **Dans le jeu** : déjà prévu dans la branche objets : un fichier déposé sous ce nom s'affiche sans toucher au code ; l'outil d'import connaît ces noms dès la fusion de la branche (en cours).

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Composition: square image, a single object centered filling about 70% of the frame, three-quarter view from slightly above.
```

Puis, pour chaque fichier :

- `ui/item_hunting_spear.png` — `Subject: a game inventory icon of a hunting spear: wooden shaft, simple iron point, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_centurion_gladius.png` — `Subject: a game inventory icon of a centurion's gladius: Roman short sword, bone grip, ornate scabbard, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_mars_blade.png` — `Subject: a game inventory icon of the Blade of Mars: legendary sword, pale blade, golden guard, faint red glow, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_linothorax.png` — `Subject: a game inventory icon of a Greek linothorax: white linen cuirass with pteruges strips, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_lorica_segmentata.png` — `Subject: a game inventory icon of a Roman lorica segmentata: armour of overlapping iron bands, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_achilles_cuirass.png` — `Subject: a game inventory icon of the cuirass of Achilles: muscled bronze cuirass with gold trims, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_leather_cap.png` — `Subject: a game inventory icon of a soft leather cap, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_crested_helm.png` — `Subject: a game inventory icon of a helmet with a red horsehair crest, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_conqueror_helm.png` — `Subject: a game inventory icon of a conqueror's helmet: golden helmet with a tall plume and laurel leaves, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_marching_sandals.png` — `Subject: a game inventory icon of marching sandals: laced leather caligae, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_messenger_boots.png` — `Subject: a game inventory icon of messenger's boots: soft boots with turned-down tops, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_winged_sandals.png` — `Subject: a game inventory icon of winged sandals with small golden wings, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_pack_mule.png` — `Subject: a game inventory icon of a pack mule loaded with saddlebags, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_steppe_horse.png` — `Subject: a game inventory icon of a steppe horse: small stocky horse with a plain saddle, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_war_horse.png` — `Subject: a game inventory icon of a war horse: caparisoned destrier, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_bucephalus.png` — `Subject: a game inventory icon of Bucephalus: tall black horse with a white star on the forehead, golden harness, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_owl_charm.png` — `Subject: a game inventory icon of an owl charm: silver medallion with an owl, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_healer_salve.png` — `Subject: a game inventory icon of a healer's salve: small clay pot of ointment with herbs, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_strategist_scroll.png` — `Subject: a game inventory icon of a strategist's scroll: sealed papyrus scroll, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_surgeon_kit.png` — `Subject: a game inventory icon of a surgeon's kit: leather roll with bronze instruments, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_legion_eagle.png` — `Subject: a game inventory icon of a legion eagle: golden eagle on a standard pole, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_golden_fleece.png` — `Subject: a game inventory icon of the Golden Fleece: a golden ram's fleece hanging from a branch, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- `ui/item_capital_move.png` — `Subject: a game inventory icon of a loaded covered wagon with a small flag (moving the capital), a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `ui/item_hunting_spear.png` — Lance de chasse : hampe de bois, pointe de fer simple
  - prompt : `Subject: a game inventory icon of a hunting spear: wooden shaft, simple iron point, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_centurion_gladius.png` — Glaive du centurion : glaive romain, poignée d'os, fourreau orné
  - prompt : `Subject: a game inventory icon of a centurion's gladius: Roman short sword, bone grip, ornate scabbard, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_mars_blade.png` — Lame de Mars : épée de légende, lame claire, garde dorée, lueur rouge
  - prompt : `Subject: a game inventory icon of the Blade of Mars: legendary sword, pale blade, golden guard, faint red glow, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_linothorax.png` — Linothorax : cuirasse grecque de lin blanc à lambrequins
  - prompt : `Subject: a game inventory icon of a Greek linothorax: white linen cuirass with pteruges strips, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_lorica_segmentata.png` — Lorica segmentata : armure romaine à bandes de fer
  - prompt : `Subject: a game inventory icon of a Roman lorica segmentata: armour of overlapping iron bands, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_achilles_cuirass.png` — Cuirasse d'Achille : cuirasse de bronze musclée, dorures
  - prompt : `Subject: a game inventory icon of the cuirass of Achilles: muscled bronze cuirass with gold trims, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_leather_cap.png` — Bonnet de cuir : coiffe de cuir souple
  - prompt : `Subject: a game inventory icon of a soft leather cap, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_crested_helm.png` — Casque à crête : casque à crin rouge
  - prompt : `Subject: a game inventory icon of a helmet with a red horsehair crest, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_conqueror_helm.png` — Casque du conquérant : casque doré à grand panache, lauriers
  - prompt : `Subject: a game inventory icon of a conqueror's helmet: golden helmet with a tall plume and laurel leaves, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_marching_sandals.png` — Sandales de marche : caligae de cuir lacées
  - prompt : `Subject: a game inventory icon of marching sandals: laced leather caligae, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_messenger_boots.png` — Bottes du messager : bottes souples à revers
  - prompt : `Subject: a game inventory icon of messenger's boots: soft boots with turned-down tops, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_winged_sandals.png` — Sandales ailées : sandales à petites ailes dorées
  - prompt : `Subject: a game inventory icon of winged sandals with small golden wings, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_pack_mule.png` — Mule de bât : mule chargée de sacoches
  - prompt : `Subject: a game inventory icon of a pack mule loaded with saddlebags, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_steppe_horse.png` — Cheval des steppes : petit cheval trapu, selle simple
  - prompt : `Subject: a game inventory icon of a steppe horse: small stocky horse with a plain saddle, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_war_horse.png` — Cheval de guerre : destrier caparaçonné
  - prompt : `Subject: a game inventory icon of a war horse: caparisoned destrier, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_bucephalus.png` — Bucéphale : grand cheval noir à étoile blanche, harnais doré
  - prompt : `Subject: a game inventory icon of Bucephalus: tall black horse with a white star on the forehead, golden harness, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_owl_charm.png` — Talisman de la chouette : médaillon d'argent à la chouette
  - prompt : `Subject: a game inventory icon of an owl charm: silver medallion with an owl, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_healer_salve.png` — Baume du guérisseur : petit pot d'onguent et herbes
  - prompt : `Subject: a game inventory icon of a healer's salve: small clay pot of ointment with herbs, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_strategist_scroll.png` — Rouleau du stratège : rouleau de papyrus scellé
  - prompt : `Subject: a game inventory icon of a strategist's scroll: sealed papyrus scroll, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_surgeon_kit.png` — Trousse du chirurgien : trousse de cuir, instruments de bronze
  - prompt : `Subject: a game inventory icon of a surgeon's kit: leather roll with bronze instruments, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_legion_eagle.png` — Aigle de légion : aigle doré sur hampe
  - prompt : `Subject: a game inventory icon of a legion eagle: golden eagle on a standard pole, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_golden_fleece.png` — Toison d'or : toison dorée suspendue
  - prompt : `Subject: a game inventory icon of the Golden Fleece: a golden ram's fleece hanging from a branch, a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`
- ⬜ `ui/item_capital_move.png` — Déplacement de capitale : chariot couvert chargé, petit drapeau
  - prompt : `Subject: a game inventory icon of a loaded covered wagon with a small flag (moving the capital), a single object centered, three-quarter view, bold and readable at small size, no frame, no background.`

### Effets d'interface — 0 livrée(s), 3 à faire

- **Où ça se voit** : Joués une fois au-dessus d'un bâtiment terminé, d'un badge de niveau qui monte, d'un butin reçu.
- **Taille et format** : Bande horizontale de N cases de 512×512 dans une seule image, PNG transparent.
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous ; une bande par ligne, nommée sans numéro de phase.
- **Style** : Style peint, rien d'autre que l'effet.
- **Prompt** : `docs/GENERATION-COMPLETE.md`, famille « Effets d'interface (construction finie, niveau, butin) » ; `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § A8.
- **Dans le jeu** : le jeu ne sait pas encore afficher ces images : petit travail de code de mon côté à la livraison, compris dans l'intégration.

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `ui/fx_sparkle.png` — bande de 6 cases de 512×512 — gerbe d'étincelles dorées (construction terminée)
- ⬜ `ui/fx_levelup.png` — bande de 6 cases de 512×512 — flèche dorée montante avec anneau de lumière (niveau supérieur)
- ⬜ `ui/fx_coins.png` — bande de 4 cases de 512×512 — trois pièces d'or qui rebondissent (butin reçu)

### Nouveautés des décisions G et H : Gloire, triomphe, échange — 0 livrée(s), 6 à faire

- **Où ça se voit** : Décision H7 (2 novembre 2026) : la Gloire donne des décors de ville cosmétiques à 50 000, 150 000 et 300 000 Gloire, posés autour du Bâtiment principal comme les ornements de plaza, et un bouton « Triomphe » dans le Bâtiment principal. Décision G9 : écran « Échanger ». Les autres décisions G et H ne demandent aucune image (la durabilité du mur du Bastion s'affiche en chiffres ; le verrou de la réserve utilise `ui/lock` qui existe). **Noms proposés par moi, le système n'est pas encore codé (lot 1) : à confirmer.**
- **Taille et format** : Décors : 512×768 (portrait 2:3), PNG transparent, cadre « prop » comme les ornements de plaza (l'arc est haut et étroit ; s'il doit enjamber l'avenue on passera en 1024×1024 cadre « building », à décider). Icônes : 1024×1024, cadre « icon ».
- **Nom et livraison** : `art/incoming/<nom>.png`, nom exact de la liste ci-dessous.
- **Style** : Style peint, style antique neutre valable pour toutes les civilisations, or et marbre blanc.
- **Prompt** : aucun prompt dans les sources ; prompts ci-dessous = préfixe peint + composition « prop » (décors) ou « icon » (icônes) + sujet.
- **Dans le jeu** : à brancher avec le lot 1 (H7) : placement des décors, bouton Triomphe, registre d'import.

**Prompts (en anglais).** Préfixe commun, à mettre avant chaque sujet :

```
Hand-painted isometric game asset in exactly the art style of the first reference image (an Egyptian market stall): clean dark-brown ink outlines, flat painted textures with soft shading and subtle gradients, warm earthy palette with a few saturated accents, small lively details, 2:1 isometric projection viewed from the front at 30 degrees of elevation, light coming from the upper left. No text, no letters, no watermark, no ground tile under the subject. The image must have a fully transparent background (alpha channel): absolutely nothing painted around the subject, no backdrop, no vignette, no glow, no halo, no gradient. Only the subject and its small cast shadow on the right are opaque.

Décors : Composition: 2:3 portrait image, the prop centered horizontally, its base at 89% of the image height, about 60% of the width.

Icônes : Composition: square image, a single object centered filling about 70% of the frame, three-quarter view from slightly above.
```

Puis, pour chaque fichier :

- `props/glory_statue.png` — `Subject: a gilded equestrian statue of a victorious general on a white marble pedestal with laurel garlands, neutral ancient style that suits every civilisation.`
- `props/glory_arch.png` — `Subject: a triumphal arch of pale stone with carved reliefs and a golden quadriga on top, small banners, neutral ancient style that suits every civilisation.`
- `props/glory_column.png` — `Subject: a tall triumphal column with a spiral carved frieze and a gilded statue on top, on a stepped base, neutral ancient style that suits every civilisation.`
- `ui/triumph.png` — `Subject: a game interface icon: a golden laurel wreath around two crossed Roman trumpets (tubae) with a small red ribbon (triumph), a single object centered, bold and readable at small size.`
- `ui/glory.png` — `Subject: a game interface icon: a golden laurel wreath with a small gold star in its middle (glory), a single object centered, bold and readable at small size.`
- `ui/exchange.png` — `Subject: a game interface icon: two curved golden arrows forming a circle around two small crossed swords (exchange of soldiers between armies), a single object centered, bold and readable at small size.`

**Fichiers** (✅ = livré et dans le jeu) :

- ⬜ `props/glory_statue.png` — 50 000 Gloire : statue équestre dorée sur socle de marbre, guirlandes de laurier
  - prompt : `Subject: a gilded equestrian statue of a victorious general on a white marble pedestal with laurel garlands, neutral ancient style that suits every civilisation.`
- ⬜ `props/glory_arch.png` — 150 000 Gloire : arc de triomphe de pierre claire, reliefs sculptés, quadrige doré au sommet
  - prompt : `Subject: a triumphal arch of pale stone with carved reliefs and a golden quadriga on top, small banners, neutral ancient style that suits every civilisation.`
- ⬜ `props/glory_column.png` — 300 000 Gloire : colonne triomphale à frise en spirale, statue dorée au sommet
  - prompt : `Subject: a tall triumphal column with a spiral carved frieze and a gilded statue on top, on a stepped base, neutral ancient style that suits every civilisation.`
- ⬜ `ui/triumph.png` — bouton « Triomphe » du Bâtiment principal : couronne de laurier d'or et deux trompettes romaines croisées
  - prompt : `Subject: a game interface icon: a golden laurel wreath around two crossed Roman trumpets (tubae) with a small red ribbon (triumph), a single object centered, bold and readable at small size.`
- ⬜ `ui/glory.png` — (facultatif) compteur et classement de Gloire : couronne de laurier d'or autour d'une petite étoile ; sinon le jeu réutilise `ui/medal`
  - prompt : `Subject: a game interface icon: a golden laurel wreath with a small gold star in its middle (glory), a single object centered, bold and readable at small size.`
- ⬜ `ui/exchange.png` — (facultatif, décision G9) écran « Échanger » des soldats entre deux armées : deux flèches dorées en cercle ; sinon le jeu réutilise `ui/send`
  - prompt : `Subject: a game interface icon: two curved golden arrows forming a circle around two small crossed swords (exchange of soldiers between armies), a single object centered, bold and readable at small size.`

## Villes de la carte — 60 livrées ✅

Livrées le 2 novembre 2026 : pour chaque civilisation (Rome, Gaule, Grèce, Égypte, Huns, Sultanat) le village, la ville, la capitale fortifiée, la colonie et la colonie fortifiée, chacun en version normale et assiégée (image fixe). Fichiers : `map/cities/<civ>.png`, `<civ>_t2`, `capital_<civ>`, `colony_<civ>`, `colony_<civ>_fortified`, `siege_<CIV>_t1|t2|t3`, `siege_colony_<CIV>_normal|fortified`.
