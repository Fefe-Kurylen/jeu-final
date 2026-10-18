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

Refaite en octobre 2026 d'après les captures de Rise of Kingdoms fournies : **une seule scène** où tout tient dans l'enceinte.

- Grille isométrique 2:1 : Bâtiment principal au centre (sprite 1,35 ×, plaza pavée autour), 19 emplacements de bâtiments sur deux anneaux, les 18 champs sur un troisième anneau le long des murs (bûcherons au fond à droite, carrières à droite, mines à gauche, fermes devant). Les numéros d'emplacement et l'API ne changent pas (champs = 101-118 côté serveur ; `citySlots` porte désormais ces numéros).
- Enceinte carrée à tours d'angle (sprites par civilisation et par palier du Mur), murets bas sur les deux faces avant pour laisser voir la ville, porte sur l'arête sud-ouest dans l'axe de l'avenue, route de terre qui s'en éloigne. Une enceinte octogonale n'est pas possible avec la projection 2:1 et les sprites actuels (les pans coupés se projettent en lignes) ; la forme carrée est celle de la première capture.
- Sol de l'enceinte plus clair (herbe, sable ou neige selon le biome), avenues de terre (porte → plaza → fond, et une transversale) dans les couloirs entre les parcelles.
- Décor dense : bosquets sur les cellules libres, rangée d'arbres au pied des murs du fond et de buissons devant, petits décors (buissons, fleurs, rochers, cactus, souches) dans les interstices ; paysage extérieur tiré de la carte (forêt, rochers, dunes, lacs, oasis, glace).
- Toucher / clic sur un bâtiment, un champ ou un emplacement libre : **bulle d'action** au-dessus (nom, niveau, boutons ronds : Améliorer ou Construire, Recruter pour Caserne/Écurie/Atelier, Marché, Armées, Héros, Alliance, Rapports, Sac, Blessés selon le bâtiment, Infos = fiche). Le bâtiment reste surligné tant que la bulle est ouverte ; déplacement, zoom, toucher sur le terrain, Échap ou changement d'onglet la referment. L'infobulle de survol reste sur bureau.
- Textures de sol : le moteur accepte le jeu complet (55 textures et décalques, `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` § T) avec repli sur les quatre sols de base ; sol de l'enceinte, alentours, plaza par civilisation, avenues, route, champs vides, eau et décalques en ville, sols et eau sur la carte.
- Badges de niveau et icônes de production affichés seulement en zoom rapproché (cellule ≥ 96 px) ou sur l'emplacement survolé, pour une vue d'ensemble épurée.
- L'onglet Champs cadre la même ville et souligne les parcelles de champ.
- Caméra : vue d'ensemble par défaut sur grand écran, cellules de 84 px sur téléphone (déplacement au doigt, pincement, double tap pour recadrer). Nuit : voile bleu, lueurs des bâtiments et torches de la porte.

Fichiers : `frontend/js/app/04b-iso-scene.js` (scène, décor, bulles), `02-city-render.js`, `03-fields-render.js`, `04-buildings-render.js`, feuille de style `.city-actions`.

## Animations : ce dont on a besoin (léger)

Déjà en place, sans image supplémentaire (code) : marche des armées sur la carte (trottinement, balancement, poussière), ligne de marche animée, fumée des cheminées, drapeaux en 8 phases, ondes de l'eau, lueurs de nuit, marteau et anneau de chantier, icône de production flottante, replay de bataille.

À produire si l'on veut aller plus loin, par ordre d'intérêt :

1. **Cycle de marche des unités de carte** : 4 images par classe (infanterie, archer, cavalerie, siège, marchand) ; par faction si l'on veut les couleurs (6 factions × 4 classes × 4 images = 96 images de 64 × 64) ou **une seule série neutre** recolorée par un voile de faction (4 classes × 4 images = 16 images). Recommandation : la série neutre.
2. **Porte de la ville** par faction et biome neige : 6 factions × 2 = 12 images (cadre 130 × 180, même palier que les murs), sinon le vantail dessiné reste.
3. **Combat** : 2 images (frappe, garde) par classe pour le replay : 8 images.
4. **Portrait du héros** : une pose, pas d'animation.

## Bâtiments : effets et valeurs par niveau (vérification d'octobre 2026)

Vérifié dans le code serveur (`src/utils/buildingEffects.js`, `routes/cities.js`, `game/processors/*`, `services/combatService.js`, `services/woundedService.js`, `routes/market.js`, `routes/alliance.js`) et comparé aux données (`data/buildings.json`) et à l'affichage client (`getBuildingEffect`).

**Conformes aux données, niveaux 1 à 20** : production des champs (courbe 10 → 350 → 4 500/h), stockage Silo/Dépôt (1 200 → 160 000), Moulin/Boulangerie/Scierie/Tailleur/Fonderie (+5 %/niv., 5 niveaux), Place de rassemblement (1 → 5 armées), Caserne/Écurie (paliers 7 et 15, −0,5 %/niv.), Atelier (siège dès 5, −4 %/niv.), Académie (−1 %/niv.), Forge (+0,5 %/niv.), Cachette (1 %/niv., max 20 %), Tente de soins (30 % + 3 %/niv., max 70 %), Mur (+1 %/niv., 1 000 PV/niv., réparation +1 %/niv.), Douves (+0,5 %/niv. attaque et défense), Grand Silo/Grand Dépôt (3 600 → 600 000 protégés), Ambassade (rejoindre 5, fonder 7), Chambre au trésor (10 → 200 or/jour), Tour de guet (attaquant niv. 10, effectifs niv. 15, contre-espionnage 3,5 %/niv.), Résidence (−0,25 %/niv.), Marché (taxe 30 % −1/niv., min 5 %, convois +5 %/niv.), Comptoir (+1 %/niv.), les six bâtiments de faction (soins, défense, blessés, production, entretien).

**Écarts constatés** :

| Bâtiment | Constat | Conséquence |
|---|---|---|
| Bâtiment principal 25-30 | Les réductions de construction (principal + Académie + Résidence) sont plafonnées à 60 % : atteint dès le niveau 24, les niveaux 25 à 30 n'apportent plus rien (sauf 5 points de population par niveau) | Affichage corrigé (plafond indiqué) ; à décider : relever le plafond ou donner un effet propre aux niveaux 25 et 30 |
| Domus du héros | Aucun effet serveur : le héros (équipement, expéditions) est accessible sans elle, il n'a ni mort ni résurrection (`heroResurrection*` sans objet) | Textes corrigés ; à décider : lui donner un vrai effet (XP du héros, durée des expéditions…) |
| Grande Caserne / Grande Écurie | Pas de seconde file de recrutement : même file que la Caserne/Écurie ; apporte seulement −4 %/niv. de temps (cumul plafonné à 60 %) et l'accès au recrutement sans Caserne | Textes corrigés |
| Comptoir / Marché | Le bonus de capacité (Marché 5 %/niv. + Comptoir 1 %/niv.) s'applique ensemble aux convois marchands et au transport par armée, pas au butin des raids | Textes corrigés |
| Bonus égyptien « santé des murs » | Portait sur le bonus de défense du mur au lieu des points de vie | Corrigé : points de vie du mur (1 250 PV par niveau pour l'Égypte avec le bonus à +25 %, construction et réparation), voir `docs/EQUILIBRAGE.md` |
| Bonus de civilisation | Relevés de 5 points en octobre 2026 à la demande (Rome −15 % pertes en siège et +10 % défense, Gaule +15 % cachette et +20 % défense chez soi, Grèce −15 % temps de construction et +15 % blessés, Égypte +15 % transport et +25 % PV des murs, Huns +20 % vitesse et +10 % attaque en siège, Sultanat +25 % dégâts des engins et +15 % attaque en défense) puis défense gauloise chez soi portée à 20 % et transport égyptien à 20 % | Simulation avant/après dans `docs/EQUILIBRAGE.md` § 7 : classement inchangé, Rome et le Sultanat renforcés ; textes client lus depuis les données |
| Paliers d'unités (coefficients de combat) | L'élite (×1,21) rapportait moins de puissance par ressource et par céréale d'entretien que l'unité de base : aucune raison de la former | Réglé (octobre 2026) : coefficients 1,0 / 1,25 / 1,55 côté serveur, client et fiches ; l'élite devient le meilleur rapport puissance / entretien, l'intermédiaire le meilleur rapport puissance / ressources, voir `docs/EQUILIBRAGE.md` |
| Tour de guet | Les alertes d'attaque sont visibles dès le niveau 0 (la donnée `alertArmyIncomingLevel` 5 n'est pas appliquée) | Plus généreux que prévu ; à décider |
| Forge, Ambassade, Chambre, Domus, Résidence (`capitalOnly`), Grande Caserne/Écurie (`notInCapital`) | Non appliqué : une seule ville par joueur aujourd'hui | Sans effet tant que les villes secondaires n'existent pas |
| Académie et Temple grec (recherche), Résidence (colons), Ambassade (aide d'alliance), Tour de guet (espions, portée de vision), Irrigation (vitesse de marche), Poste du désert (taxe entre villes), Comptoir (`p2pTax`) | Fonctions absentes du jeu | Voir `docs/BACKLOG.md` |

## Interface

Thème peint (cadres bois et parchemin, icônes 3D) en place sur toutes les vues ; rapports refaits en tableau ; file d'attente avec annulation ; bandeaux d'état.

Fiches d'information (bouton « i » partout où une unité ou un bâtiment apparaît : listes de recrutement, modale de recrutement, panneaux de bâtiment, liste de construction, onglet Bâtiments, cartes et composition d'armée, rapports de bataille, défenseurs des tribus) : unité = description, statistiques, puissance, marche, transport, entretien, triangle fort/faible, rôle de siège, coût, temps de formation dans la ville, bâtiment et niveau requis, état dans la ville et raccourci « Recruter » ; bâtiment = description, état dans la ville, prérequis cochés, ce qu'il débloque (unités par palier, bâtiments), table de tous les niveaux (effet, coût, temps). Les règles affichées sont celles du serveur (`frontend/js/app/10b-sheets.js`). Depuis octobre 2026, façon Travian / Rise of Kingdoms : galerie d'aperçu (grande image du bâtiment et ses trois paliers visuels ; figurine, jeton et marqueur de carte de l'unité), section « Fonctions et activation » (chaque fonction du bâtiment avec le niveau qui l'active, son état et un raccourci quand elle est utilisable), bouton « Voir dans la ville » qui recentre la caméra sur le bâtiment et ouvre sa bulle, raccourci vers le bâtiment d'entraînement depuis la fiche d'unité. Ces parcours sont couverts par le test navigateur.

Reste à produire par l'utilisateur : les images listées dans `docs/LISTE-GRAPHISMES.md` (inventaire complet avec l'état peint / rendu 3D, prompts dans `docs/PROMPTS-GRAPHIQUES.md`).
