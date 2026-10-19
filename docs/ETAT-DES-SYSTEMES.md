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
| Bataille round par round (triangle des classes, mur, douves, Forge, Brasserie, héros, équipement), raids plafonnés à 30 % de la capacité, cachette, stockage protégé, un raid par cible et par jour ; **siège qui dure** (section suivante) | Renfort allié qui reste dans la ville (mission SUPPORT) |
| Rapports : deux exemplaires (attaquant, défenseur), **tableau avant → après par unité**, bandeau de synthèse (pertes des deux côtés, butin, PV de mur, rounds), replay 2.5D | Rapport d'arrivée de transport, rapport pour la cible d'un espionnage réussi |
| Espionnage : n'importe quelle unité, chance selon l'effectif, rapport ressources/bâtiments/armées ; **contre-espionnage de la Tour de guet** (interception, rapport au défenseur, nom de l'espion dès le niveau 15) | Unités d'espion dédiées (`maxSpiesFaction`, `spyUnlockL5/L10` dans les données), espionnage des points de ressource |
| Alertes d'attaque : compte à rebours ; attaquant révélé par la Tour de guet niveau 10, effectifs niveau 15 | Son/notification native à l'arrivée (push existe pour « attaque en approche ») |

## Siège qui dure (octobre 2026)

Règles du GDD (`combat_config.siege`) décidées avec le joueur : le siège est un état qui dure, seuls les engins abîment
le mur, et tout est bloqué dans la ville assiégée sauf la formation d'armées.

- **Début** : une attaque (mission ATTACK, avec le minimum d'engins du palier de la ville) qui arrive ne se règle plus
  d'un coup. L'armée **campe devant la ville** (statut `BESIEGING`) et la ville passe « assiégée » (`City.isSieged`).
  Le défenseur, les membres de son alliance et l'attaquant sont prévenus. Une ville déjà alliée à l'arrivée renvoie l'armée.
- **Usure du mur** : à chaque tick, chaque engin abat **500 PV de mur par heure** (bonus d'engins du Sultanat compris ;
  le mur égyptien a 25 % de PV en plus). Le minimum d'engins (1 / 10 / 20) perce un mur du même niveau (1 / 10 / 20) en
  2 h environ. La réparation du mur est arrêtée pendant le siège et reprend ensuite (24 h pour 100 %).
- **Assaut** : à la brèche, **jamais avant 30 min** de siège (GDD `minDestroyMinutesReference`), **au plus tard 12 h**
  après le début. L'attaquant peut aussi donner l'assaut lui-même après 30 min (bouton « Assaut »), ou lever le siège
  (« Lever le siège », l'armée rentre). Pendant l'assaut, le mur ne protège qu'en proportion de ses PV restants ;
  il ne perd plus de niveau. Le rapport indique les dégâts au mur et la durée du siège.
- **Bloqué dans la ville assiégée** : production des champs, or de la Chambre au trésor, réparation du mur,
  recrutement, formation de colons, soins (en pause, ils reprennent seuls), **convois et envois de ressources**
  (refusés au départ ; un convoi qui arrive pendant le siège rentre avec sa cargaison). **Former une armée reste permis**
  avec les troupes présentes.
- **Briser le siège** : le propriétaire, son alliance et les alliances alliées peuvent attaquer l'armée qui assiège
  (mission `BREAK_SIEGE`, bouton « Briser le siège » sur la carte, la fenêtre de siège ou l'alerte). Bataille en rase
  campagne, sans mur ; si elle gagne, les assiégeants rentrent chez eux et le siège est levé ; sinon le siège continue
  (avec des engins en moins, la brèche est retardée). L'armée de sortie rentre ensuite dans sa ville.
- **Nourriture** : l'armée qui assiège consomme **+10 %**, la ville assiégée et ses armées **−10 %** (GDD).
- **Visible** : alerte avec compte à rebours de l'assaut et nom de l'assiégeant (`GET /api/city/incoming-attacks`, type
  `SIEGE`), fenêtre de siège (`GET /api/city/:id/siege`), anneau rouge autour de la ville sur la carte, carte d'armée
  « Siège » avec l'heure de l'assaut.
- **Animation de siège sur la carte** (GDD `visuals`) : la ville assiégée joue une animation en boucle à la place de son
  sprite, une bande par civilisation et par palier de ville (6 × 3 × 4 phases, guide § A19 ; villes secondaires :
  normale et fortifiée, 6 × 2 × 4), avec la bannière de la
  civilisation qui assiège plantée devant. Branché ; en attendant les images, anneau rouge et icône d'épées.
- **Chute d'une ville (décidé et appliqué, octobre 2026)** : une ville ne change jamais de propriétaire.
  - Chaque **assaut gagné** ôte une part de la **santé de la muraille** (`City.wallStructure`) : il faut **4 assauts gagnés
    pour une capitale, 2 pour une ville secondaire, un de plus pour une ville égyptienne (5 et 3)**. Le héros n'est pas
    nécessaire. La santé remonte de 0 à 100 % en **48 h** hors siège (`config.combat.fall`) ; les PV du mur, eux, se
    réparent en 24 h comme dans le GDD.
  - Chaque assaut gagné **pille 25 % du stock** au-dessus des grands entrepôts et de la part de la cachette ; l'armée en
    rapporte ce qu'elle peut porter, le reste est détruit.
  - **Ville secondaire à 0 : rasée.** Les troupes et les blessés présents sont perdus, le héros s'enfuit vers la capitale,
    les armées en mission sont rattachées à la capitale, le point de ressource redevient libre (une tribu s'y réinstalle).
  - **Capitale à 0 : elle ne peut pas être prise.** Elle est **déplacée au hasard près du bord de la carte** avec ses
    bâtiments ; ses armées présentes la suivent, celles qui rentrent sont redirigées ; santé remise à 100 %, siège levé, les
    armées hostiles en route font demi-tour.
  - Visible dans la fenêtre de siège (santé, assauts restants, sort de la ville) et dans le rapport (muraille avant → après,
    « ville rasée » ou « capitale déplacée »).

## Diplomatie et alliance

| Existe | Manque |
|---|---|
| Alliances sur invitation, rôles (leader, officier, membre), promotion, exclusion, transfert de direction, dissolution ; Ambassade requise (rejoindre niv. 5, fonder niv. 7) | Pacte de non-agression distinct de l'alliance, déclaration de guerre avec effets (bonus, score) |
| Statuts ALLY / NEUTRAL / ENEMY entre alliances : pas d'attaque entre alliés, pas de transport vers un ennemi | Aide d'alliance (réduction des constructions, données `maxAllianceHelpReceived*`), chat, classement d'alliance détaillé |
| Classements joueurs, alliances, attaquants, défenseurs | Messagerie entre joueurs |

## Brigands : les camps barbares (tribus des points de ressource)

Cadre voulu par le GDD (`resource_points.json`) : **façon Travian**, une tribu locale fixe sur chaque point de ressource, de force
liée au niveau du point, qui réapparaît avec la régénération ; pas de camps itinérants (les « invasions barbares » restent une
idée d'événement). Vérifié en octobre 2026 : génération (100 / 600 / 1 500 soldats, composition aléatoire par faction, niveau 3
au centre), affichage sur la carte (puissance sur l'échelle des armées, défenseurs nommés avec fiche), attaque (adjacente ou en
marche, chemin terrestre), combat par puissance, butin borné au transport puis récolte sur place, réapparition, XP du héros.
Corrigé : pertes contre un camp divisées par deux (`tribeLossMultiplier`), blessés récupérés comme après une bataille, renfort
horaire des tribus affaiblies, puissance recalculée après un assaut repoussé, bonus de transport appliqué au butin et à la
récolte, points d'or au barème du GDD (10 / 20 / 30 or par 12 h), notification du résultat. Simulation et chiffres dans
`docs/EQUILIBRAGE.md` § 9, outil `node tools/simulate-tribes.cjs`.

Décision confirmée en octobre 2026 : le système reste **celui du GDD, façon Travian** (tribus fixes sur les points de
ressource) ; les invasions barbares sont gardées pour plus tard comme événement. Écarts avec le GDD tranchés et appliqués :
une armée qui tient un point **peut être attaquée** (combat en rase campagne par la puissance, sans bonus « chez soi », le
perdant rentre chez lui, le vainqueur prend le point, rapports et blessés des deux côtés) ; les armées d'un même joueur ou
d'une **même alliance partagent un point** (récolte partagée à parts égales, point libéré au départ de la dernière) ; le
**stock n'est connu que par quarts** (plein, bien garni, à moitié, entamé, presque vide ; jauge sur la carte), l'espionnage
des points reste à faire ; les camps **varient de ± 20 %** d'un camp à l'autre (les « étoiles » du GDD) et leur taille suit
la **difficulté de la position** : × 0,5 aux bords de la carte, où les joueurs apparaissent (camp de niveau 1 ≈ 50
soldats), jusqu'à × 1,3 au centre (niveau 3 ≈ 1 950 soldats). Une ville secondaire se fonde sur un point libéré de sa tribu
(section « Villes secondaires ») : le point disparaît de la carte tant que la ville existe. Graphismes : 18 sprites de camps prévus (`map/camps/`), affichés dès livraison.

## Blessés et soins (revue d'octobre 2026)

Règles du GDD (`wounded_and_healing.md`, `combat_config.woundedSystem`) : une part des pertes devient des blessés, soignés à
la Tente de soins, capacité limitée avec file d'attente, soins du défenseur bloqués pendant un siège.

- **Appliqué** : 30 % des pertes deviennent des blessés, + 3 % par niveau de Tente, plafond 70 %, bonus grec, Médecine et
  bâtiments ; guérison avec le temps ou immédiate contre 1 or par soldat.
- **Décidé et appliqué (octobre 2026)** : les blessés d'une armée hors de sa ville (attaque, tribu, combat sur un point de
  ressource, des deux côtés) **rentrent avec elle** (`Army.woundedCarry`) et n'entrent à la Tente qu'au retour ; une armée
  sans survivant ne ramène personne. La carte d'armée affiche les blessés transportés.
- **Décidé et appliqué (octobre 2026)** : la Tente a **200 lits par niveau** (`config.wounded.bedsPerLevel`, 4 000 au niveau
  20) ; les blessés au-delà attendent en file (`WoundedUnit.waiting`) et prennent les lits libérés par les guérisons ou par
  un soin à l'or, qui ne soigne que les blessés au lit. Aucun soldat n'est perdu dans la file.
- **Décidé et appliqué (octobre 2026)** : une ville est **assiégée quand l'armée attaquante campe devant elle** (statut
  `BESIEGING`, voir « Siège qui dure »). Tant que l'attaque marche encore,
  la ville peut tout faire. Pendant le siège : **recrutement et formation de colons refusés**, **aucun soin** (ni guérison
  avec le temps, ni soin à l'or) ; **former une armée reste permis** avec les troupes présentes. Le compte à rebours des soins est en pause pendant le
  siège et repart de lui-même à sa levée ; les blessés dont le temps était déjà écoulé reviennent aussitôt. Soin à l'or et
  accélération des soins : à revoir plus tard. Les blessés d'une armée en déplacement ne se soignent qu'une fois rentrés en ville (règle 1).

## Héros

| Existe | Manque |
|---|---|
| Fiche, XP et niveaux (siège, raid, tribu, expédition), points attaque/défense/vitesse/logistique tous appliqués | Compétences / talents, portrait animé |
| **Équipement réel** : catalogue de 14 objets (`data/items.json`), bonus appliqués au combat, à la vitesse et à la logistique, inventaire, équiper/déséquiper/jeter, drop à la fin d'une expédition gagnée selon le palier de butin | Forge d'objets, enchantement, objets des raids/sièges |
| Expéditions (les « quêtes » du héros) : 1 à 4 étoiles, puissance ennemie, durée, palier de butin, or, XP, objet | Quêtes scénarisées à objectifs (construire X, recruter Y) avec récompenses — simple à ajouter sur la base des événements analytics déjà émis |

## Scène de la ville

Refaite en octobre 2026 d'après les captures de Rise of Kingdoms fournies : **une seule scène** où tout tient dans l'enceinte.

- Grille isométrique 2:1 : Bâtiment principal au centre (sprite 1,35 ×, plaza pavée autour), 19 emplacements de bâtiments sur deux anneaux, les 18 champs sur un troisième anneau le long des murs (bûcherons au fond à droite, carrières à droite, mines à gauche, fermes devant). Les numéros d'emplacement et l'API ne changent pas (champs = 101-118 côté serveur ; `citySlots` porte désormais ces numéros).
- Enceinte carrée à tours d'angle (sprites par civilisation et par palier du Mur), murets bas sur les deux faces avant pour laisser voir la ville, porte sur l'arête sud-est dans l'axe de l'avenue, route de terre qui s'en éloigne vers le bas à droite (octobre 2026 : la porte est passée du sud-ouest au sud-est ; tout ce qui en dépend passe par un seul repère, `ISO_GATE_SIDE` dans `frontend/js/app/04b-iso-scene.js` ; le décor extérieur évite toute la courbe de la route ; sur la carte, la ville fortifiée a aussi sa porte sur la face sud-est). Les bâtiments ont leur entrée au sud-est eux aussi : modèles 3D réfléchis par le plan de la caméra (`tools/render3d/50-buildings.js`), accroches des drapeaux, cheminées et plans d'eau échangées en conséquence (`isoBuildingAnchor`), images peintes existantes retournées, prompts de génération avec l'entrée sur la face avant droite. Une enceinte octogonale n'est pas possible avec la projection 2:1 et les sprites actuels (les pans coupés se projettent en lignes) ; la forme carrée est celle de la première capture.
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
| Forge, Ambassade, Chambre, Domus, Résidence, Caserne, Écurie, Atelier (`capitalOnly`), Grande Caserne/Écurie (`notInCapital`) | Appliqué depuis octobre 2026 : refus serveur (« Bâtiment réservé à la capitale / aux villes secondaires ») et mention dans la liste de construction ; prérequis d'une colonie sur un bâtiment réservé lus dans la capitale | Voir la section « Villes secondaires » |
| Mur : palier visuel et palier de ville | Depuis octobre 2026 le palier (Village / Ville / Ville Fortifiée), l'enceinte dessinée et le minimum d'engins de siège suivent le Bâtiment principal (10 et 20), plus le niveau du Mur | Le Mur garde bonus, points de vie et réparation ; `docs/EQUILIBRAGE.md` § 11 |
| Résidence (colons) | En place depuis octobre 2026 (colons, fondation, bonus de colonie) | Voir la section « Villes secondaires » |
| Ambassade (aide d'alliance), Tour de guet (espions, portée de vision), Irrigation (vitesse de marche), Poste du désert (taxe entre villes), Comptoir (`p2pTax`) | Fonctions absentes du jeu | Voir `docs/BACKLOG.md` |

## Villes secondaires (octobre 2026)

Le GDD est appliqué tel quel (`data/buildings.json` RESIDENCE, `GDD_MASTER/systems/resource_points.json`
`FOUND_SECONDARY_CITY`) :

- **Colons** : la Résidence, réservée à la capitale (Hôtel de ville 5), forme des colons gratuits en 3 h
  (`POST /api/city/:id/settlers`) : 1 colon au niveau 10, 2 au niveau 15, 3 au niveau 20, chaque colon valant une ville
  secondaire (villes existantes + colons prêts + colons en route + colons en formation ≤ places). Le colon attend dans la
  capitale (`City.settlers`), onglet « Colons » de la Résidence.
- **Fondation** (`POST /api/army/:id/found-city { resourceNodeId, name }`) : une armée de la capitale (unités obligatoires)
  emmène un colon et 3 000 de chaque ressource, prélevés dans la capitale, vers un point de ressource libre (ni tribu, ni
  armée, ni ville). À l'arrivée le point est réservé (`FOUNDING`, 24 h) ; la ville naît ensuite sur la case du point avec
  son Hôtel de ville niveau 1, sa garnison et les 3 000 de chaque ressource (le stock de départ reste disponible même au-dessus
  du dépôt de 1 000 : la production ne fait jamais baisser un stock), et l'armée rentre. Si le point n'est plus libre à
  l'arrivée, l'armée rentre avec le colon et les ressources.
- **Vulnérabilité** : pendant les 24 h, l'armée fondatrice tient le point comme une récolteuse et peut être attaquée
  (« Attaquer l'armée qui tient le point ») ; battue, elle rentre **sans le colon** (règle `settlerVulnerable`). Un rappel
  volontaire ramène le colon et les ressources.
- **Le point sous la ville** : il garde `cityId`, disparaît de la carte et des tirages (pas de récolte, de régénération, de
  renfort de tribu ni de réapparition) ; il redevient libre, tribu comprise, quand la ville disparaît (suppression du compte).
- **Bonus** : une ville secondaire produit +20 % (SQL de production et affichage client).
- **Restrictions** (relecture complète du GDD, octobre 2026) : Forge (table du GDD), Chambre au trésor (`economy_config`),
  Ambassade (`alliance.md` : « capitale uniquement »), Résidence (`resource_points.json`) et Domus seulement dans la
  capitale ; **Caserne, Écurie et Atelier aussi** : le GDD décrit les Grandes caserne et écurie comme ce qui « permet de
  recruter hors capitale », une colonie ne forme donc des troupes qu'avec elles (prérequis Caserne 20 / Écurie 20 lus dans
  la capitale), et jamais d'engins de siège. Grande Caserne et Grande Écurie seulement dans les colonies. Refus serveur et
  mention dans la liste de construction.
- **Niveaux** : le Bâtiment principal d'une ville secondaire s'arrête au niveau 20 (`config.city.secondaryMainHallMaxLevel`,
  la capitale seule monte à 30) ; comme il plafonne tous les autres bâtiments, une colonie ne dépasse 20 nulle part. Le GDD
  ne chiffre pas ce plafond : décision d'octobre 2026, à ajuster en jouant.
- **Paliers de ville et murailles** (décision d'octobre 2026) : le palier Village / Ville / Ville Fortifiée, l'aspect de
  l'enceinte dans la scène de ville et sur la carte, et le minimum d'engins de siège de l'attaquant (1 / 10 / 20) suivent le
  **niveau du Bâtiment principal** (1-9, 10-19, 20+ ; `config.cityTiers`), plus le niveau du Mur. Le Mur garde son rôle
  défensif (bonus, points de vie à abattre, réparation) et reste nécessaire pour qu'une enceinte soit dessinée.
- **Interface** : onglet « Colons » (places, colons prêts / en route / en formation, file, formation), bouton « Fonder une
  ville » dans la bulle d'un point libre (choix de l'armée, nom), statut « Fondation » et nombre de colons sur la carte
  d'armée, « Ville en fondation par … » dans la bulle du point, sélecteur de villes. Icône du colon à produire
  (`ui/settler`, guide § S9), repli sur l'icône de ville en attendant ; cortège, campement de fondation, colonie et portrait du colon : guide § S12.
- **Limites** : trois villes secondaires au plus (`config.city.maxSecondaryCities`) ; pas de déplacement de capitale ni de
  conquête de colonie (`docs/BACKLOG.md`).
- **Chantiers** : les sprites peints de bâtiment en construction, d'échafaudage par civilisation et de champ en chantier
  (`docs/GRAPHISMES-MANQUANTS.md` § 1) sont branchés dans la scène de ville ; sans image livrée, le bâtiment clignote comme avant.

## Interface

Thème peint (cadres bois et parchemin, icônes 3D) en place sur toutes les vues ; rapports refaits en tableau ; file d'attente avec annulation ; bandeaux d'état.

Fiches d'information (bouton « i » partout où une unité ou un bâtiment apparaît : listes de recrutement, modale de recrutement, panneaux de bâtiment, liste de construction, onglet Bâtiments, cartes et composition d'armée, rapports de bataille, défenseurs des tribus) : unité = description, statistiques, puissance, marche, transport, entretien, triangle fort/faible, rôle de siège, coût, temps de formation dans la ville, bâtiment et niveau requis, état dans la ville et raccourci « Recruter » ; bâtiment = description, état dans la ville, prérequis cochés, ce qu'il débloque (unités par palier, bâtiments), table de tous les niveaux (effet, coût, temps). Les règles affichées sont celles du serveur (`frontend/js/app/10b-sheets.js`). Depuis octobre 2026, façon Travian / Rise of Kingdoms : galerie d'aperçu (grande image du bâtiment et ses trois paliers visuels ; figurine, jeton et marqueur de carte de l'unité), section « Fonctions et activation » (chaque fonction du bâtiment avec le niveau qui l'active, son état et un raccourci quand elle est utilisable), bouton « Voir dans la ville » qui recentre la caméra sur le bâtiment et ouvre sa bulle, raccourci vers le bâtiment d'entraînement depuis la fiche d'unité. Ces parcours sont couverts par le test navigateur.

Reste à produire par l'utilisateur : les images listées dans `docs/LISTE-GRAPHISMES.md` (inventaire complet avec l'état peint / rendu 3D, prompts dans `docs/PROMPTS-GRAPHIQUES.md`).

## Technologies (recherche à l'Académie) — octobre 2026

Arbre de huit technologies en quatre branches (économie, militaire, défense, logistique), façon Travian : petits bonus par niveau
(0,25 à 0,5 % ; +5 % au maximum pour le combat, +10 % pour l'économie), vingt niveaux sur les courbes de coût et de temps des
constructions, une recherche à la fois (une seconde en attente),
niveau d'une technologie limité par celui de l'Académie, temps réduit par l'Académie et le Temple grec. Serveur : tables
`PlayerTechnology` et `ResearchQueueItem` (migration `0005_research`), routes `GET /api/technologies`, `GET /api/research?cityId`,
`POST /api/research/start`, `DELETE /api/research/:id`, étape `research` de la boucle de jeu, effets appliqués dans les coûts de
construction, le temps de recrutement, les combats (ville, pillage, tribus), les blessés, la vitesse de marche, la production et
l'entretien. Client : onglet « Recherche » du panneau de l'Académie (file avec compte à rebours et annulation, cartes par branche,
coûts et raisons de blocage fournis par le serveur), fiche « i » par technologie, niveaux dans `player.techLevels` pour les coûts
affichés. Détail et tableau des valeurs dans `docs/EQUILIBRAGE.md` § 8 ; tests dans `tests/unit/research.test.js`, le test API et
le test navigateur. Visuels prévus et branchés (affichés dès livraison) : une icône par technologie et par branche
(`ui/tech_<CLÉ>`, `ui/branch_<CLÉ>`), un parchemin « recherche en cours » au-dessus de l'Académie (`props/scroll_research`).

## Interface : plus d'emoji dans les écrans de jeu (octobre 2026)

Les derniers emoji des panneaux (carte : bulles des villes, des points de ressource et des tribus, profils, espionnage, envoi
de ressources, résultat d'un raid ; ville : onglets et boutons de construction, sections de recrutement ; armées, héros,
marché, diplomatie) sont remplacés par les icônes 3D ou peintes existantes, ou par du texte. Restent des marques typographiques
(✓ ✗ ✕ ★), le soleil et la lune de l'horloge, les messages furtifs et les journaux de console.
