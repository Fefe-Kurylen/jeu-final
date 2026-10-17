# État des systèmes de jeu (octobre 2026)

Ce qui existe, ce qui manque, et les images ou animations à produire. Référence : Travian pour les mécaniques, Rise of Kingdoms pour la lisibilité et le mouvement.

## Carte et déplacements

| Existe | Manque |
|---|---|
| Terrain procédural partagé client/serveur (`frontend/js/shared/terrain.js`) : biomes, rivières, lacs, chaînes de montagnes, arbres, dunes | Brouillard de guerre / portée de vision (la Tour de guet annonce 5 + 6 cases/niveau mais tout est visible) |
| **Montagnes et eau infranchissables** : chaque départ est validé, le trajet suit un chemin A* qui contourne les obstacles, le temps de trajet est la longueur du chemin | Coût de terrain (forêt, dunes plus lentes) : prévu dans `TERRAIN_MOVEMENT` côté client, non appliqué |
| **Ligne de marche** verte claire en pointillé avec flèche, visible uniquement par le propriétaire ; le sprite avance le long du chemin entre départ et arrivée | Ligne rouge des attaques entrantes (données disponibles : `GET /api/city/incoming-attacks`) |
| Animation de marche (trottinement, balancement, poussière) sur sprite unique par classe et faction | Vrais cycles de marche (2 à 4 images par classe et par faction, voir plus bas) |

## Combat, rapports, espionnage

| Existe | Manque |
|---|---|
| Siège round par round (triangle des classes, mur, douves, Forge, Brasserie, héros, équipement), raids plafonnés à 30 % de la capacité, cachette, stockage protégé, un raid par cible et par jour | Renfort allié (mission SUPPORT) |
| Rapports : deux exemplaires (attaquant, défenseur), **tableau avant → après par unité**, bandeau de synthèse (pertes des deux côtés, butin, PV de mur, rounds), replay 2.5D | Rapport d'arrivée de transport, rapport pour la cible d'un espionnage réussi |
| Espionnage : n'importe quelle unité, chance selon l'effectif, rapport ressources/bâtiments/armées ; **contre-espionnage de la Tour de guet** (interception, rapport au défenseur, nom de l'espion dès le niveau 15) | Unités d'espion dédiées (`maxSpiesFaction`, `spyUnlockL5/L10` dans les données), espionnage des points de ressource |
| Alertes d'attaque : compte à rebours ; attaquant révélé par la Tour de guet niveau 10, effectifs niveau 15 | Son/notification native à l'arrivée (push existe pour « attaque en approche ») |

## Diplomatie et alliance

| Existe | Manque |
|---|---|
| Alliances sur invitation, rôles (leader, officier, membre), promotion, exclusion, transfert de direction, dissolution ; Ambassade requise (rejoindre niv. 5, fonder niv. 7) | Pacte de non-agression distinct de l'alliance, déclaration de guerre avec effets (bonus, score) |
| Statuts ALLY / NEUTRAL / ENEMY entre alliances : pas d'attaque entre alliés, pas de transport vers un ennemi | Aide d'alliance (réduction des constructions, données `maxAllianceHelpReceived*`), chat, classement d'alliance détaillé |
| Classements joueurs, alliances, attaquants, défenseurs | Messagerie entre joueurs |

## Brigands (tribus des points de ressource)

Le système est à jour : chaque point de ressource est tenu par une tribu d'une faction aléatoire (niveau 1 à 3, effectif lié au stock restant), sa puissance est affichée sur la **même échelle que les armées**, le combat suit les règles de raid, l'XP du héros dépend des unités tuées, la tribu réapparaît après un délai (plus long sur l'or) et jamais tant qu'une armée récolte, le butin rentre avec l'armée. Un raid sur un point sans défenseurs est refusé (collecte directe), un point occupé est protégé.

Manque, façon Rise of Kingdoms : camps de barbares itinérants avec niveau et récompenses, événements temporaires, points de ressource qui s'épuisent et se déplacent.

## Héros

| Existe | Manque |
|---|---|
| Fiche, XP et niveaux (siège, raid, tribu, expédition), points attaque/défense/vitesse/logistique tous appliqués | Compétences / talents, portrait animé |
| **Équipement réel** : catalogue de 14 objets (`data/items.json`), bonus appliqués au combat, à la vitesse et à la logistique, inventaire, équiper/déséquiper/jeter, drop à la fin d'une expédition gagnée selon le palier de butin | Forge d'objets, enchantement, objets des raids/sièges |
| Expéditions (les « quêtes » du héros) : 1 à 4 étoiles, puissance ennemie, durée, palier de butin, or, XP, objet | Quêtes scénarisées à objectifs (construire X, recruter Y) avec récompenses — simple à ajouter sur la base des événements analytics déjà émis |

## Scène de la ville

- Porte au milieu de l'arête sud-ouest, flanquée de deux tourelles, vantail de bois ; route de terre qui part de la porte, descend la rampe du plateau et s'éloigne vers le sud-ouest.
- Décor périphérique tiré des cases de la carte autour de la ville : forêt dense, rochers des massifs, dunes, plans d'eau (rivière, lac, oasis, lac gelé) du côté où la carte les place ; texture de sol et végétation du biome.
- Grille carrée 5 × 5 à 1,3 largeur de cellule d'espacement, parcelles 0,74 : aucun chevauchement entre bâtiments ; les paliers 1/2/3 changent la taille (0,74 / 1 / 1,14) à l'intérieur de la parcelle.

## Animations : ce dont on a besoin (léger)

Déjà en place, sans image supplémentaire (code) : marche des armées sur la carte (trottinement, balancement, poussière), ligne de marche animée, fumée des cheminées, drapeaux en 8 phases, ondes de l'eau, lueurs de nuit, marteau et anneau de chantier, icône de production flottante, replay de bataille.

À produire si l'on veut aller plus loin, par ordre d'intérêt :

1. **Cycle de marche des unités de carte** : 4 images par classe (infanterie, archer, cavalerie, siège, marchand) ; par faction si l'on veut les couleurs (6 factions × 4 classes × 4 images = 96 images de 64 × 64) ou **une seule série neutre** recolorée par un voile de faction (4 classes × 4 images = 16 images). Recommandation : la série neutre.
2. **Porte de la ville** par faction et biome neige : 6 factions × 2 = 12 images (cadre 130 × 180, même palier que les murs), sinon le vantail dessiné reste.
3. **Combat** : 2 images (frappe, garde) par classe pour le replay : 8 images.
4. **Portrait du héros** : une pose, pas d'animation.

## Interface

Thème peint (cadres bois et parchemin, icônes 3D) en place sur toutes les vues ; rapports refaits en tableau ; file d'attente avec annulation ; bandeaux d'état.

Fiches d'information (bouton « i » partout où une unité ou un bâtiment apparaît : listes de recrutement, modale de recrutement, panneaux de bâtiment, liste de construction, onglet Bâtiments, cartes et composition d'armée, rapports de bataille, défenseurs des tribus) : unité = description, statistiques, puissance, marche, transport, entretien, triangle fort/faible, rôle de siège, coût, temps de formation dans la ville, bâtiment et niveau requis, état dans la ville et raccourci « Recruter » ; bâtiment = description, état dans la ville, prérequis cochés, ce qu'il débloque (unités par palier, bâtiments), table de tous les niveaux (effet, coût, temps). Les règles affichées sont celles du serveur (`frontend/js/app/10b-sheets.js`).

Reste à produire par l'utilisateur : les images listées dans `docs/LISTE-GRAPHISMES.md` (inventaire complet avec l'état peint / rendu 3D, prompts dans `docs/PROMPTS-GRAPHIQUES.md`).
