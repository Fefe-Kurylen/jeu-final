# État des systèmes de jeu (octobre 2026, mis à jour le 31 octobre 2026)

Ce qui existe, ce qui manque, et les images ou animations à produire. Référence : Travian pour les mécaniques, Rise of Kingdoms pour la lisibilité et le mouvement.

## Décisions d'équilibrage du 30 octobre 2026 (D1 à D12)

Décisions du propriétaire, appliquées le 30 octobre 2026. Chacune est décrite dans sa section ; les chiffres sont dans
`docs/EQUILIBRAGE.md` § 13.

| | Décision | Section |
|---|---|---|
| D1 | Grand Dépôt et Grand Silo = stockage (3 fois un dépôt ou un silo de même niveau), plus de réserve protégée : seule la cachette protège du pillage | Bâtiments, Siège, Espionnage |
| D2 | Formation à la Caserne et à l'Écurie : GDD gardé (−0,5 % par niveau) | Bâtiments |
| D3 | Alliance : 60 membres au plus (depuis le 31 octobre 2026 : 3 par niveau de l'Ambassade du chef, dans cette limite) | Diplomatie et alliance |
| D4 | Défenseurs des camps à leur palier, camps d'or à +40 % au combat ; rassemblements d'alliance contre les sites et plans de Merveille | Brigands, Invasions, Cycle du serveur et Merveille |
| D5 | Brèche : le combat dure encore au moins 5 rounds après la chute du mur | Siège |
| D6 | Seuls les engins de siège abîment le mur ; mur du Bastion à 10 fois un mur 20 | Siège, Bastion, Cycle du serveur et Merveille |
| D7 | Donjons d'invasion de plus en plus forts avec l'âge du monde | Invasions |
| D8 | Défi de la semaine : 750 / 500 / 250 points par membre, seuls les membres arrivés avant le vendredi comptent | Défi d'alliance |
| D9 | XP du héros : × 1,25 par niveau | Héros |
| D10 | Moteur de bataille du GDD (option B du rapport des unités) | Combat |
| D11 | Cavalerie : coût du GDD gardé, rôle de vitesse, textes corrigés | Combat |
| D12 | 20 fiches d'unités hors norme retouchées (±3 à 10 %) | Combat |

## Revue des bâtiments (décisions du 31 octobre 2026)

Le propriétaire a revu le rôle de chaque bâtiment. Tableau complet, avec les chiffres en place et où les régler :
`docs/BATIMENTS-ROLES.md` ; chiffres à équilibrer : `docs/EQUILIBRAGE.md` § 16. Migration `0032_batiments`.

| | Décision | Section |
|---|---|---|
| 1 | Bâtiment principal : niveau 20 au plus partout, capitale comprise (30 avant) | Bâtiments, Villes secondaires |
| 2 | Cachette : une quantité fixe de chaque ressource par niveau (240 → 32 000), Gaule × 1,2 | Combat, Espionnage, Siège |
| 3 | Place du marché dans la capitale seulement, marchands façon Travian pour toutes les livraisons du marché | Marché et commerce |
| 4 | Comptoir de commerce dans la capitale seulement (avant : colonies) ; fin du « meilleur Comptoir des colonies » | Marché et commerce |
| 5 | Place de rassemblement : 5 armées + 1 par niveau du lanceur dans un rassemblement d'alliance | Invasions |
| 6 | Forge : +0,5 % d'attaque et +0,5 % de défense par niveau, dans tous les combats | Combat |
| 7 | Tour de guet : la carte se voit partout ; seules les armées des autres joueurs sont cachées hors du rayon de vision | Espionnage et vision |
| 8 | Ambassade : 3 membres par niveau de l'Ambassade du chef (60 au plus) | Diplomatie et alliance |
| 9 | Moulin, Boulangerie, Scierie, Tailleur de pierre, Fonderie : +2,5 % par niveau (bonus divisé par deux) | Bâtiments |
| 10 | Grandes casernes et Grandes écuries : +0,5 % de vitesse de formation par niveau dans la capitale, niveaux additionnés | Villes secondaires |
| 11 | Chambre au Trésor : la fiche dit que l'or ne se pille jamais | Bâtiments |
| 12 | Poste du Désert : charge des marchands, transports et récoltes +1 % par niveau, entretien −0,5 % | Marché et commerce |
| 13 | Anneau de 18 emplacements dans la capitale, 12 dans une colonie (et la Ville Merveille) ; scène de ville à la bonne taille | Économie et placement, Villes secondaires |
| 14 | Mur des colonies : niveau 15 au plus (capitale 20) | Villes secondaires |
| 15 | Or des unités d'élite : 1 or par unité, prix en ressources × 0,95 | Économie et placement |

## Économie, placement et stock partagé (décisions du 30 octobre 2026, au soir)

Décisions du propriétaire après `docs/RAPPORT-ECONOMIE.md` (ce que devient chaque recommandation : même document,
« Décisions appliquées le 30 octobre 2026 »). Chiffres dans `docs/EQUILIBRAGE.md` § 14.

**Chaque ville garde son stock ; les dépenses puisent dans toutes les villes** (`src/utils/db.js` : `lockPlayerCities`,
`debitPlayer`, `creditPlayer`) :
- Chaque ville garde ce qu'elle produit, avec son propre plafond (Dépôt, Silo, Grand dépôt, Grand silo). **Pas de convoi
  automatique** entre les villes (idée abandonnée).
- **Se paient sur la somme des stocks de toutes les villes** : constructions, recrutements (troupes, colons), recherche,
  soins des blessés, résurrection du héros, fondation d'une ville. Le prix est pris d'abord dans la ville de l'action (la
  capitale pour les soins, le héros et la fondation), puis, ressource par ressource, dans la ville **la plus pleine par
  rapport à son plafond** (Dépôt pour le bois, la pierre et le fer, Silo pour les céréales ; à égalité la plus riche ;
  décision du 30 octobre 2026 : moins de production perdue contre un plafond entre deux connexions). Toutes les villes du
  joueur sont verrouillées au début de la dépense, toujours dans le même ordre ; si ce verrou croise celui du tick
  (interblocage rare), la dépense est rejouée jusqu'à 3 fois (`withDeadlockRetry`).
- **Refus** seulement si la somme ne suffit pas, avec ce qui manque : « Ressources insuffisantes : il manque 1 200 de bois
  et 300 de fer (toutes vos villes comprises) ». Un prix plus gros que le stockage de toutes les villes réunies : « Stockage
  trop petit (bois) : il faut plus de capacité (Dépôt ou Silo, ou Grand dépôt / Grand silo dans une colonie) »
  (recommandation 14).
- **Remboursements** (annulation d'un chantier, d'un recrutement, d'une recherche) : à la ville qui a payé, puis le surplus
  aux autres villes selon leur place libre ; ce qui ne tient nulle part est perdu, et le message le dit. Un colon annulé rend
  la moitié de son prix, comme une troupe. Le trésor des invasions suit la même règle (capitale d'abord).
- **Une ville qui reçoit des ressources ne baisse jamais** (recommandation 1) : une colonie garde ses 3 000 de départ même
  au-dessus de son plafond ; seule la production s'arrête.
- **Restent propres à chaque ville** : marchandises du marché (offres, achats, marchand du serveur, envois et routes : elles
  partent de la ville choisie, avec les marchands du joueur), envois par armée, convois vers le Bastion, pillage, raids,
  siège, cachette, récompenses de quêtes.
- **Or des unités d'élite** (décision du 31 octobre 2026) : une unité d'élite coûte aussi de l'or (`config.recruit.goldPerUnit`,
  1 par unité pour commencer), pris à la mise en file sur l'or du joueur (« or ≥ prix » vérifié par la base, sinon toute la
  dépense est annulée ; refus « Il faut N or pour recruter ces unités d'élite ») et rendu à moitié à l'annulation, comme les
  ressources ; son prix en ressources est multiplié par `config.recruit.eliteResourceCostMult` (0,95). Vaut aussi pour le
  recrutement d'une colonie depuis la capitale ; ni les autres paliers ni les engins ne coûtent d'or. Les soins suivent le
  prix en ressources. Le catalogue `GET /api/units` donne le prix du serveur (`recruitCost`, `recruitGold`,
  `calculations.withRecruitPrice`).
- **Client** : la barre de ressources garde le stock et le plafond de la ville ; son info-bulle et une petite ligne « Σ »
  donnent le total du joueur. Boutons et couleur des prix suivent ce total ; un refus affiche le message du serveur.
  `GET /api/cities` porte `playerStock` sur chaque ville (stocks et plafonds réunis, bilan de nourriture de tout le
  joueur) ; `GET /api/player/me` porte `economy` (multiplicateurs de construction, entretien par palier, règles des soins),
  que le client lit au lieu de recopier des chiffres.

**Toute unité formée ou soignée apparaît dans la capitale** : les troupes formées dans la Grande caserne ou la Grande écurie
d'une colonie rejoignent la garnison de la capitale (le temps de formation reste celui du bâtiment de la colonie), les
blessés guéris aussi. **Pas de garnison propre dans les colonies** : de nouvelles unités n'y arrivent jamais seules ; une
colonie n'est défendue que par les armées qu'on y envoie (les troupes déjà présentes restent). L'entretien de toutes les
troupes se paie sur tous les greniers (« Entretien et famine »).

**Placement des bâtiments** (`data/buildings.json` : `effects.capitalOnly`, `effects.notInCapital` ; refus serveur
« Bâtiment réservé à la capitale » ou « … aux villes secondaires », bâtiment caché ou marqué dans le client) :

| Où | Bâtiments |
|---|---|
| Partout | Bâtiment principal, champs, Dépôt, Silo, Cachette, Mur |
| Capitale seulement | Place de rassemblement, Place du marché, Comptoir de commerce (ces deux-là depuis le 31 octobre 2026), Académie, Tente de soins, Tour de guet, Caserne, Écurie, Atelier, Forge, Ambassade, Chambre au Trésor, Domus du Héros, Résidence, bâtiment de la civilisation |
| Colonies seulement | Moulin, Boulangerie, Scierie, Tailleur de pierre, Fonderie, Grand dépôt, Grand silo, Grande caserne, Grande écurie |
| Supprimé | Douves : données, combat, rapport d'espion, client et outils ; la migration `0030_placement_moat` efface les Douves et les bâtiments mal placés, avec leurs chantiers |

- **Anneau à la taille de la ville** (décision du 31 octobre 2026, `config.city.ringSlots`, `calculations.ringSlotsOf`) :
  **18 emplacements dans la capitale** (ses 18 bâtiments possibles), **12 dans une colonie** (ses 12 bâtiments) et dans la
  Ville Merveille ; un emplacement au-delà est refusé (« Emplacement invalide ou déjà occupé »). Le **Mur est sur
  l'enceinte** (emplacement 20, décision du 30 octobre 2026), les champs sur 101-118. `GET /api/player/me` →
  `economy.city = { ringSlots, wallSlot }`. La migration `0032_batiments` a déplacé les bâtiments (et chantiers) posés
  au-delà sur un emplacement libre. La scène de la ville dessine 18 parcelles pour la capitale, 12 pour une colonie, avec une
  enceinte et une place plus petites.
- **Un bâtiment de la capitale vaut pour tout le joueur** (« une seule suffit », `fx.withCapital`) : nombre d'armées de
  chaque ville et taille des rassemblements lancés (Place de rassemblement), marchands, taxe et charge du commerce (Marché,
  Comptoir, Chambre au Trésor), lits et vitesse des soins (Tente de soins, Thermes), alertes et rayon de vision (Tour de
  guet), attaque et défense (Forge), défense (Brasserie), taille de l'alliance du chef (Ambassade), recherche et réduction du
  temps de construction (Académie, Résidence), production de l'Irrigation dans toutes les villes, vitesse de marche
  (Irrigation), entretien (Tente de guerre, Poste du Désert), charge des transports et des marchands (Poste du Désert). Un
  bâtiment des colonies n'agit que sur sa colonie (Moulin, Scierie…), sauf les **Grandes casernes et Grandes écuries**, qui
  accélèrent aussi la formation dans la capitale (« Villes secondaires »). La règle du « meilleur Comptoir des colonies »
  (30 octobre 2026) est retirée : le Comptoir est dans la capitale. Un prérequis « capitale seulement » d'un bâtiment de
  colonie se lit dans la capitale (Caserne 20 pour la Grande caserne, Chambre au Trésor 5 pour le Grand dépôt et le Grand
  silo).

**Coûts et temps de construction** (recommandations 3 et 4 ; `calculations.buildCostFor` / `buildSecondsFor`, seul endroit
du calcul, repris par les quêtes, le client et les outils) : les champs (Ferme, Bûcheron, Carrière, Mine de fer) coûtent
×1,45 par niveau, les autres bâtiments ×1,28 ; les champs et le Bâtiment principal prennent ×1,30 de temps par niveau, les
autres ×1,2. La recherche garde ×1,28 et ×1,2.

## Carte et déplacements

| Existe | Manque |
|---|---|
| Terrain procédural partagé client/serveur (`frontend/js/shared/terrain.js`), **façon carte de référence** (`docs/CARTE-REFERENCE.md`, 25 octobre 2026) : biomes du GDD (nord enneigé, sud désertique, tempéré ailleurs), 8 longues rivières avec **ponts** (vitesse normale) et **gués** (moitié moins vite) d'une rive à l'autre, lacs, massifs forestiers, amas de rochers, chaînes de montagnes. **Une carte par serveur**, tirée d'une graine au premier démarrage (table `WorldConfig`, `WORLD_SEED`, publiée par `/api/world/info`, appliquée par le jeu avant tout dessin) ; graine 0 = carte de référence du serveur ouvert ; seules les graines qui donnent une carte jouable sont gardées (`src/game/world.js`) | (vision façon Travian depuis le 26 octobre 2026 : section Espionnage et vision) |
| **Montagnes, rochers et eau infranchissables** : chaque départ est validé, le trajet suit un chemin A* qui contourne les obstacles ; **coût de terrain** : gué × 2, forêt −10 % de vitesse (sauf Gaulois) ; le temps de trajet est la longueur pondérée du chemin | Images de la carte au nouveau style (378, liste et prompts : `docs/PROMPTS-CARTE.md`) ; d'ici là, sprites 3D et dessins |
| **Villes sur 2 × 2 cases** : départ, fondation (les 3 cases voisines du point libres), chemins, clic, siège, rencontres ; aucune ville ni point de ressource dans l'eau ou dans une poche fermée par les montagnes (terre ferme principale, `Terrain.isMainland`) ; au démarrage, les points existants suivent le terrain (biome, sortie de l'eau) | |
| **Sol de la carte** (`frontend/js/map-world.js`) : 7 sols (herbe, herbe sèche, terre labourée, sable, eau, glace, neige) en textures projetées en isométrique, fondus irréguliers découpés par le jeu, berges de sable ; dessiné par morceaux mis en cache ; grille très légère toujours visible | |
| **Ligne de marche** verte claire en pointillé avec flèche, visible uniquement par le propriétaire ; le sprite avance le long du chemin entre départ et arrivée | Ligne rouge des attaques entrantes (données disponibles : `GET /api/city/incoming-attacks`) |
| Animation de marche (trottinement, balancement, poussière) sur sprite unique par classe et faction | Vrais cycles de marche (2 à 4 images par classe et par faction, voir plus bas) |

## Combat, rapports, espionnage

| Existe | Manque |
|---|---|
| Bataille round par round au moteur du GDD (ci-dessous : triangle des classes, mur, Forge en attaque et en défense, Brasserie, héros, équipement), raids plafonnés à 30 % de la capacité et à la moitié de ce qui dépasse la cachette (une quantité fixe de chaque ressource par niveau depuis le 31 octobre 2026, seule protection du pillage), un raid par jour sur une même ville pour chaque attaquant (le raid est un harcèlement, pas un revenu : recommandation 11) ; **siège** (section suivante) | (le renfort allié est en place depuis le 26 octobre 2026 : section Diplomatie et alliance) |
| Rapports : deux exemplaires (attaquant, défenseur), **tableau avant → après par unité**, bandeau de synthèse (pertes des deux côtés, butin, PV de mur, rounds), replay 2.5D | Rapport d'arrivée de transport |
| Espionnage par espions dédiés (section Espionnage et vision, 26 octobre 2026) | Espions dessinés en marche sur la carte (image `map/units/spy` à produire) |
| Alertes d'attaque : compte à rebours ; attaquant révélé par la Tour de guet niveau 10, effectifs niveau 15 | Son/notification native à l'arrivée (push existe pour « attaque en approche ») |

Moteur de bataille et unités (décisions du 30 octobre 2026, `src/services/combatService.js`, `data/units.json`,
`docs/RAPPORT-UNITES.md`, chiffres dans `docs/EQUILIBRAGE.md` § 2) :

- **D10, moteur du GDD (option B)** : un coup fait ATK × coefficient × triangle, sans soustraction de la défense ni plancher ;
  la défense donne la **solidité** de l'unité (END + 0,55 × DEF × coefficient, mur et bonus de défense compris ; la
  « réduction des pertes » de Rome la multiplie) ; 18 % des dégâts par round, 15 rounds. **Ciblage** (recommandation 10,
  30 octobre 2026) : les coups de chaque round se répartissent sur toutes les lignes de soldats adverses selon leur solidité
  totale (au lieu des élites d'abord) ; ce qui reste d'une ligne détruite passe aux lignes encore debout ; le triangle reste
  par classe ; les engins de siège ne sont visés qu'après les soldats. Coefficients de **bataille** 1 / 1,35 / 1,9 (siège 0,75, `config.combat.battleTierCoefficients`) ; la **puissance**
  (pillages, camps, rencontres, hordes, affichage) garde 1 / 1,25 / 1,55. **Triangle +50 %** (+20 % avant). Mesuré : chaque
  palier vaut à peu près son prix (1 intermédiaire ≈ 1,8 unité de base, 1 élite ≈ 1,7 intermédiaire) et la bonne classe gagne
  tous les combats du triangle.
- **D11, cavalerie** : coût du GDD (160) gardé. Son rôle est la vitesse (éclairer, frapper vite, intercepter, renforcer), pas
  le pillage ni le transport : les six descriptions de cavaliers de base sont corrigées (le nom « Cavalier pillard » reste).
- **D12, fiches retouchées** : 20 unités hors norme corrigées de 3 à 10 % sur l'attaque, la défense et l'endurance, sans
  changer leur caractère ; toutes reviennent entre 0,80 et 1,25 de l'indice de leur palier (quatre fiches non retouchées sont
  juste au-dessus, 1,26 à 1,29, laissées telles quelles).
- **Forge en attaque et en défense** (décision du 31 octobre 2026, `armyService.combatPct`) : la Forge de la capitale donne
  +0,5 % d'attaque et +0,5 % de défense par niveau à toutes les troupes du joueur, dans tous les combats (attaque, défense de
  ville, renforts, camps barbares, rencontres, points de ressource, donjons, Immortels, Bastion), 50 % au plus. Quand
  plusieurs joueurs combattent du même côté (renforts alliés, rassemblement, camps alliés), chacun garde sa Forge : le côté
  prend leur moyenne selon les soldats. Les technologies restent celles du joueur qui mène.

## Espionnage et vision (26 octobre 2026)

Façon Travian et GDD (`espionage_config`) : `src/services/spyService.js`, routes `/api/spies`, client
`frontend/js/app/09f-spies.js`, vision dans `src/routes/map.js` (`viewFor`).

- **Espions dédiés** : 2 au plus par compte, le 1er avec une Tour de guet niveau 5 (20 or), le 2e niveau 10 (200 or),
  prêts tout de suite (onglet Armée → Espions, ou bulle de la Tour de guet). **Les armées n'espionnent plus.**
- **Missions** depuis la carte (« Espionner » sur une ville ou un point), au choix pour une ville :
  - **Ressources et troupes** : les troupes présentes (garnison, armées en ville, renforts alliés) et **les ressources
    qu'un pillage pourrait prendre** (ce qui dépasse la cachette, seule protection depuis le 30 octobre 2026), à la centaine
    près ; pas les bâtiments ;
  - **Défenses et troupes** : les troupes, le mur (niveau, points de vie, santé de la muraille), la Tour de guet de la
    capitale, la cachette (niveau et quantité cachée de chaque ressource, `hideoutAmount`) et le bonus de défense (Forge et
    Brasserie de la capitale).
  - **Point de ressource** : stock exact, tribu (unités, puissance) ou armées qui récoltent ; le point garde son stock
    exact et ses occupants affichés pour l'espion pendant 1 h.
- **Toujours réussi** : l'espion part de la ville choisie (vitesse 80, même chemin que les armées), le rapport est écrit
  à son arrivée, puis il rentre (même durée) ; il peut être rappelé en route. **Plus d'interception.**
- **La ville espionnée est prévenue** selon sa Tour de guet : niveau 5 « un espion est venu », niveau 10 l'heure,
  niveau 15 qui (et la mission) ; rapport « Espion repéré » et notification.
- **Vision de la carte** (Tour de guet, décision du 31 octobre 2026, `services/visionService.js`) : la carte (villes,
  gisements, camps, relief, Bastions, Merveilles) se voit partout et par tous ; **seuls les mouvements d'armées des autres
  joueurs sont cachés**, sauf dans le **rayon de la Tour de guet de la capitale autour de chacune de ses villes** :
  `visionRangeL1 + visionRangePerLevel × niveau` = 5 cases + 6 par niveau (11 au niveau 1, 65 au niveau 10, 125 au niveau
  20). Une armée compte à sa position du moment (en ligne droite entre son départ et sa cible) ; une marche qui traverse la
  zone regardée sans y partir ni y arriver est aussi chargée, puis la vision décide. Ses armées et celles de son alliance se
  voient partout. Qui récolte un point se voit pour soi, son alliance, un point dans le rayon de vision, ou après l'avoir
  espionné (sinon « occupé ») ; le stock d'un point reste montré par quarts sans espion. **Changement visible** : une armée
  ennemie qui marche sur une de ses villes n'apparaît sur la carte qu'en entrant dans le rayon ; l'alerte d'attaque ne
  change pas. Les camps de siège restent publics (bandeau de la ville assiégée, `GET /api/city/:id/siege`). Pas encore de
  cercle de vision dessiné sur la carte.

## Siège (refonte du 25 octobre 2026, décisions du 30 octobre 2026)

Le siège qui dure (usure du mur pendant des heures, ville bloquée) a été remplacé, avec le joueur, par un camp court suivi
d'un combat où le mur sert de bouclier.

- **Lancer un siège** : n'importe quelle armée qui a **au moins 1 engin de siège** (`config.combat.siege.minEngines`).
  Plus de minimum selon le palier, plus d'escorte obligatoire, **plus de plafond d'engins** (l'Atelier sert seulement à les
  fabriquer, il reste réservé à la capitale). Cible : toute ville d'un autre joueur, sauf sa propre alliance et les
  alliances alliées. La cible est **toujours prévenue** d'une attaque ou d'un raid en marche, quelle que soit la façon
  dont il a été lancé.
- **Le camp** : l'armée arrivée **campe 1 h** devant la ville (statut `BESIEGING`, `campMinutes` = 60), puis le combat
  démarre tout seul. Plus de riposte automatique. **Pendant l'heure, la ville vit normalement** : production, or, marché,
  convois, recrutement, constructions, recherches et soins continuent, rien n'est mis en pause. Entretien de l'assiégeant
  +10 % et de la ville assiégée −10 % (GDD, décision du 28 octobre 2026). Le rappel est un rappel normal. Si la diplomatie change pendant la marche (ou pendant l'heure), l'armée
  fait demi-tour et les deux joueurs sont prévenus. Un camp qui perd tous ses engins rentre chez lui.
- **Camps alliés** : les camps de joueurs alliés entre eux (même joueur, même alliance ou alliance déclarée alliée)
  combattent **ensemble**, à l'heure du premier arrivé ; chacun emporte sa part du butin selon sa capacité.
- **Sorties** : pendant le camp, les armées de la ville assiégée ne sortent que pour attaquer le camp (« Briser le
  siège ») ; une armée rappelée avant d'avoir quitté sa case rentre aussitôt.
- **Le combat : le mur bouclier** (`combatService.resolveCombatDetailed`, option `wall`). Tant que le mur tient, tous les
  coups de l'attaquant tombent sur lui et les soldats de la ville ne prennent rien ; les défenseurs, eux, frappent
  normalement. **Seuls les engins abîment le mur** (décision du 30 octobre 2026, D6, GDD `onlySiegeEnginesDamageWall`) : un
  engin le frappe de toute sa force, un soldat ne lui fait rien (`wallShield.soldierMult` 0 ; un dixième de sa force avant).
  Les engins du Sultanat frappent le mur +25 % (chaque engin porte le bonus de sa civilisation), ceux d'une attaque hunnique
  +10 % ; un mur gaulois encaisse 1/1,2 des coups (défense chez soi). Le bonus de défense du mur (+1 % par niveau) baisse
  avec ses PV. Mur à 0 : les coups touchent les soldats et **le combat dure encore au moins 5 rounds** (décision du
  30 octobre 2026, D5, `config.combat.siege.roundsAfterBreach`) ; l'attaquant ne gagne que s'il bat les défenseurs. Si le mur
  tient jusqu'à la fin du combat (15 rounds), la ville gagne. Après le combat, l'armée rentre chez elle.
  - Simulation (`node tools/simulate-colonies.cjs` : Rome, Triarii et catapultes, contre 600 Triarii et 300 archers
    gaulois) : contre un mur niveau 20 intact, 1 000 soldats avec 100 engins ne percent pas ; avec 200 engins le mur tombe
    au 10e round mais la ville tient ; 3 000 soldats et 50 engins ne percent plus (ils perçaient au 6e round quand les soldats
    abîmaient le mur) ; 3 000 soldats et 150 engins percent au 14e round et gagnent. Un mur qui a perdu la moitié de ses
    vies vaut un mur 10 plein (`docs/EQUILIBRAGE.md` § 12).
- **Victoire de l'attaquant** : il pille **25 % de ce qui dépasse la cachette** (une quantité fixe de chaque ressource par
  niveau depuis le 31 octobre 2026 ; les grands dépôts ne protègent plus rien depuis le 30 octobre 2026, D1 ; l'or du joueur
  n'est jamais pillé),
  dans la limite de ce que ses armées portent ; ce qu'elles ne portent pas reste à la ville. La ville perd **une vie**.
- **Les vies** (`City.wallStructure` = part des vies restantes) : **4 pour une capitale, 2 pour une ville secondaire, une
  de plus pour une ville égyptienne (5 et 3)**. Chaque vie perdue ôte **la même part des PV du mur** (25 % pour une
  capitale, 50 % pour une colonie…). Les vies, et les PV du mur avec elles, remontent toutes en **48 h**. La fumée sur la
  carte suit les vies perdues.
- **Chute, à la dernière vie** :
  - **ville secondaire détruite** : troupes présentes perdues, héros enfui vers la capitale, armées en mission rattachées à
    la capitale, offres du marché rendues à la capitale, recherches et files perdues (les niveaux de recherche en file
    ailleurs qui en dépendaient sont remboursés à la ville qui les a payés, puis aux autres villes), le point de ressource
    redevient libre ;
  - **capitale déplacée** au hasard près d'un bord de la carte, jamais sur un point de ressource : **toutes ses armées sont
    téléportées** à la nouvelle place, même en mission (missions annulées, charge déposée), toutes ses vies reviennent, son
    alliance est prévenue de la nouvelle position.
- **Briser un siège** : **n'importe quel joueur**, sauf contre les camps de son alliance ou d'une alliance alliée, attaque
  **tous les camps à la fois**, en rase campagne. S'il gagne, les camps rentrent chez eux et **son armée reste devant la
  ville** pour la garder jusqu'à ce qu'il la rappelle ; s'il perd, il rentre. Une armée de la ville : une sortie rentre
  dans la ville ; une armée qui revient de l'extérieur **doit battre le camp** pour entrer, sinon elle attend à côté.
- **Visible** : alerte et compte à rebours du combat (`GET /api/city/incoming-attacks`, type `SIEGE`), fenêtre de siège
  (`GET /api/city/:id/siege` : mur au prochain combat, vies, camps), anneau rouge, bannière et animation de siège sur la
  carte (6 civilisations × 3 paliers, colonies normale et fortifiée), carte d'armée « Combat dans … ». **Le compte à
  rebours n'est donné qu'aux joueurs concernés et à leurs alliances** (fenêtre de siège et carte).
- **Notifications** : chaque alerte du siège (camp, combat, levée, chute, retour bloqué…) arrive dans le **fil de
  notifications du jeu**, avec un lien vers la fenêtre de siège, le rapport ou la case de la carte (voir « Fil de
  notifications »).
- **Garde** : l'armée qui garde une ville combat l'ennemi déclaré qui arrive sur la case (voir « Rencontres d'armées »).
- **Garde-fous repris de l'ancien siège** : file de recherche verrouillée par joueur ; chute en attente réglée en premier
  dans le tick ; la chute d'une colonie verrouille toutes les villes du joueur dans l'ordre ; une sortie qui rentre dépose
  sa charge avec la bataille ; un raid par ville et par 24 h même après le déplacement d'une capitale.

## Fil de notifications dans le jeu (25 octobre 2026)

- **Toutes les alertes** (camp installé, combat, raid, espionnage, levée d'un siège, chute d'une ville, retour bloqué,
  rencontre, construction et recherche terminées, attaque en approche…) sont d'abord un **message du jeu** (table
  `Notification`), visible aussi sur navigateur ; la **notification push mobile en découle** (même titre, même lien,
  anti-spam par type pour le push seulement). Elles sont gardées 30 jours.
- **Cloche** dans l'en-tête avec le nombre de messages non lus ; un toast annonce un message qui vient d'arriver. Le panneau
  liste les messages (non lus en évidence), « Tout marquer comme lu ».
- **Chaque message a un lien qui mène au bon endroit** (`services/pushService.normalizeLink`) : la case de la carte (camp,
  ville attaquée, capitale déplacée, armée qui attend), le **rapport du joueur** (bataille ou espionnage, mis en évidence
  dans la liste), la carte de l'armée, la fenêtre de siège ou la ville. Le tap sur un push mobile ouvre le même lien.
- API : `GET /api/notifications` (les plus récentes, pagination `before`), `GET /api/notifications/unread`,
  `POST /api/notifications/read` (`{ ids }` ou `{ all: true }`).

## Rencontres d'armées (25 octobre 2026)

- Deux armées de joueurs **ennemis déclarés** (une des deux alliances a déclaré l'autre ENNEMIE ; les joueurs sans
  alliance ou neutres se croisent sans combattre) qui sont sur la **même case au même moment** se battent, **même en
  marche**, en rase campagne (rapport « Rencontre »).
- Les positions des armées en marche sont calculées le long de leur route, toutes les 5 s entre deux ticks
  (`config.combat.encounters`), pour ne pas rater deux armées qui se croisent. Comptent aussi les armées immobiles hors de
  leur ville : camp devant une ville, récolte ou fondation sur un point, armée qui garde une ville ou qui attend.
- **Le vainqueur continue sa route** (ou reste là où il était) ; **le perdant rentre chez lui depuis la case de la
  rencontre** (une récolte libère le point, une fondation perd son colon). Les armées de la même alliance immobiles sur la
  case se défendent ensemble. Deux armées qui viennent de se battre ne se rebattent pas pendant 30 min (le perdant quitte
  la case).
- **La case d'une ville est laissée aux règles du siège** (camp, sortie, retour au bercail, convois) ; seule exception, la
  **garde** : une armée qui garde la ville d'un autre joueur combat l'ennemi qui arrive sur la ville (attaque, raid,
  espions, déplacement) ; battue, le propriétaire de la ville est prévenu.
- Les trajets ne sont calculés que pour les armées ennemies qui peuvent se croiser (150 au plus par tick, le reste en
  ligne droite jusqu'au tick suivant).
- Les deux joueurs reçoivent une notification avec le lien vers leur rapport ; un rapport plus ancien que la liste
  s'ouvre quand même (`GET /api/reports/battles/:id`, `/spy/:id`).

## Diplomatie et alliance

| Existe | Manque |
|---|---|
| Alliances sur invitation, rôles (chef, officier, membre), promotion, exclusion, transfert de direction, dissolution ; Ambassade requise (rejoindre niv. 5, fonder niv. 7) ; **taille selon l'Ambassade du chef** : 3 membres par niveau, 60 au plus (31 octobre 2026) | (la sortie de la garnison du Bastion est en place depuis le 29 octobre 2026 : section Bastion) |
| Diplomatie à 3 statuts (décision du 26 octobre 2026, ci-dessous) | Pacte de non-agression et guerre avec effets : écartés (3 statuts gardés, GDD) |
| Aide d'alliance, points d'alliance, boutique d'alliance, renfort allié, liste des membres détaillée, Bastion d'alliance (ci-dessous) | Classement d'alliance détaillé |

Décisions du 26 octobre 2026 (`src/routes/alliance.js`, `src/services/diplomacyService.js`, `allianceHelpService.js`,
`allianceShopService.js`, `supportService.js`, client `frontend/js/app/09d-alliance.js`) :

- **Diplomatie** : une alliance entre deux alliances se **propose** (chef ou officier) et s'**accepte** par l'autre
  alliance ; elle n'existe que des deux côtés (3 alliés au plus). **Ennemi** se déclare seul et rompt une alliance en
  cours ; revenir à neutre rompt aussi une alliance des deux côtés. Les anciennes alliances déclarées d'un seul côté sont
  devenues des propositions à accepter (migration `0013_alliance`). Tout le monde voit les statuts (fiche publique d'une
  alliance : membres, alliés, ennemis) ; seuls chef et officiers les changent ; ils sont prévenus des propositions,
  acceptations, refus et déclarations.
- **Couleurs** (GDD) sur la carte (liseré de la plaque de nom et halo de la ville), les profils et la page d'alliance :
  or chez soi, vert sa propre alliance, bleu clair les alliés, rouge les ennemis, gris les neutres.
- **Membres** : rôle, population, ancienneté dans l'alliance et dernière connexion arrondie (en ligne, il y a 3 h,
  il y a 2 j), visibles de tous les membres ; la fiche publique ne montre pas la dernière connexion.
- **Aide d'alliance** : sur une construction, une recherche ou les soins d'une ville en cours (bouton à côté de chacun,
  ou « Demander de l'aide pour tout » dans Alliance → Aide). Chaque autre membre aide une fois par demande : **1 % du
  temps restant, 1 minute au moins**. Plafond d'aides par demande selon l'Ambassade du demandeur : 0 au niveau 1, 5 au
  niveau 5, 20 au niveau 20 (en ligne droite entre les deux). Bouton « Tout aider » et pastille du nombre de demandes à
  aider (onglet Alliance). Une demande se ferme à son plafond ou quand la cible est finie ; purgée après 7 jours.
- **Points d'alliance** : 10 par aide donnée, 300 au plus par 24 h glissantes (au-delà, l'aide compte toujours mais ne
  rapporte rien). Gardés en quittant l'alliance.
- **Boutique d'alliance** (`data/alliance-shop.json`) : ressources livrées dans la ville choisie (dans la limite de
  l'entrepôt : 1 000 d'une ressource pour 80 points, convoi de 4 × 1 500 pour 400), objets de héros communs (250 points,
  dans le sac du héros), **plaques de nom** dessinées par le jeu sous ses villes (bronze 600, argent 1 200, laurier
  1 800, or et pourpre 3 000) et **bannières** plantées devant ses villes (2 000, en vente une fois leur image livrée,
  `docs/LISTE-GRAPHISMES.md`). Un cosmétique s'achète une fois et se met ou se retire à volonté.
- **Renfort allié** : bouton « Renforcer » sur la ville d'un membre de son alliance ou d'une alliance alliée. L'armée
  marche (statut `SUPPORTING`), entre et se poste (`STATIONED`) : elle **défend la ville** avec ses troupes lors des
  attaques et des raids (après les armées du propriétaire ; l'espion la voit), reçoit sa copie du rapport, et ses
  **blessés rentrent avec elle** (la Tente de l'hôte ne soigne que les siens). Son **entretien reste payé par sa ville
  d'origine**. **Pendant un siège, aucun renfort n'entre** (GDD) : il ne part pas, et celui qui arrive pendant le camp
  fait demi-tour ; ceux déjà postés restent et se battent. Le propriétaire la rappelle (Rappeler), l'hôte la renvoie
  (onglet Armée → Renforts alliés reçus). Une rupture d'alliance, une déclaration de guerre, un départ ou une exclusion
  de l'alliance, ou la chute de la ville renvoient les renforts chez eux. En marche, un renfort croise les armées
  ennemies comme toute armée.
- **Taille de l'alliance** (décision du 31 octobre 2026, qui précise D3) : **3 membres par niveau de l'Ambassade du chef**
  (`EMBASSY.effects.allianceMembersPerLevel` : 21 au niveau 7 où l'on fonde, 30 au niveau 10, 60 au niveau 20), jamais plus
  de 60 (`config.alliance.maxMembers`). L'adhésion compte les membres dans la transaction, sous verrou de la ligne de
  l'alliance (deux adhésions simultanées se suivent ; une adhésion ne passe pas pendant une dissolution) ; une alliance
  pleine refuse l'adhésion (« Alliance complète (21 membres au plus, selon l'Ambassade du chef) : un membre doit partir avant
  que vous puissiez entrer ») et l'invitation. Si le plafond baisse (changement de chef), **personne n'est exclu** : seules
  les entrées attendent. `GET /api/alliance`, `/mine` et `/:id` donnent `maxMembers` ; `GET /api/player/me` →
  `economy.alliance.maxMembers` (plafond général, pour le client).
- **Diplomatie qui change pendant une marche** (30 octobre 2026) : une attaque, un raid ou un siège vers un joueur devenu
  allié fait demi-tour (les deux joueurs sont prévenus) ; un transport ou un convoi vers un joueur devenu ennemi rentre avec
  sa cargaison ; une armée qui va prendre un point de ressource tenu par une armée alliée, même devenue alliée en route,
  rentre sans combattre. Un seul prédicat d'alliance (`diplomacyService`) sert aux armées, aux villes et au Bastion.

## Bastion d'alliance (26 octobre 2026)

Décisions du 26 octobre 2026 (`src/services/bastionService.js`, `src/routes/bastion.js`, client
`frontend/js/app/09g-bastion.js` et `frontend/js/map.js`, réglages `config.bastion`) :

- **Déblocage** : un Bastion par alliance d'au moins **15 membres** (le GDD disait 30). Le chef ou un officier le place
  sur 2 × 2 cases libres de la terre ferme, à **40 cases au plus** d'une ville de l'alliance (Alliance → Bastion, ou
  « Placer le Bastion ici » sur une case vide de la carte). Les nouvelles villes ne s'installent pas collées à un Bastion.
- **Chantier** : les membres y apportent les ressources **par convois** (armée chargée depuis sa ville, mission
  « Ravitailler ») : **500 000 bois, pierre et fer, 250 000 nourriture** ; le surplus d'un convoi revient. Une fois tout
  livré, **3 jours** de construction. Un chantier sans murs ne peut pas être attaqué.
- **Bonus pour tous les membres** tant qu'il est debout : **+10 % de production** (ressources des villes et récolte des
  points), **+5 % de vitesse** des armées (aller et retour), **+10 % de capacité de transport** des armées (convois,
  transports, pillage, butin ; pas les marchands).
- **Garnison** : les membres et les alliés y postent leurs armées (+10 % de défense) et les rappellent quand ils
  veulent ; l'entretien reste payé par leur ville. **Aucune troupe n'entre pendant un siège.** Une garnison dont le
  joueur n'est plus membre ni allié rentre seule.
- **Siège et chute** (« comme une ville, en plus dur ») : il faut au moins un engin de siège ; toute l'alliance est
  prévenue de la marche. **Camp d'1 h**, puis assaut contre la garnison derrière un **mur bouclier 10 fois plus solide
  qu'un mur 20** (200 000 PV ; 50 fois jusqu'au 30 octobre 2026, D6), que seuls les engins abîment (≈ 1 650 catapultes pour
  une brèche au 10e round : l'affaire d'un rassemblement) ; chaque assaut gagné lui ôte **une vie sur 10**, les vies
  remontent en **72 h**. À la dernière, il est
  **rasé** : plus de bonus, garnison renvoyée, **7 jours** avant d'en rebâtir un. Rapports de bataille pour chaque camp.
  Au Bastion, qui n'est la ville de personne, aucun bonus « chez soi » (défense gauloise, attaque du Sultanat) ; une garnison
  d'une seule civilisation garde ses bonus d'unités (Rome : défense, points de vie en siège), une garnison mêlée a la
  défense des unités en moyenne selon les soldats de chacune. Les assaillants ont la civilisation, le héros et les
  technologies de l'armée qui mène l'assaut.
- **Briser le siège** (décision du 29 octobre 2026) : **n'importe quel joueur** peut attaquer le camp ennemi devant un
  Bastion (Carte → Bastion → « Briser le siège »), sauf les camps de son alliance ou d'une alliance alliée. Un joueur de la
  garnison fait une **sortie** avec une de ses armées (Alliance → Bastion → « Sortie », combat 30 s après) : **chaque
  armée se bat seule**, contre tout le camp, **en terrain ouvert** (ni mur bouclier ni +10 % de garnison). Victoire : le
  camp rentre chez lui et l'armée **reste là d'où elle a attaqué** (dans le Bastion pour une sortie, devant lui sinon).
  Défaite : les survivants rentrent, **à la capitale** pour une sortie (si un emplacement d'armée y est libre, sinon
  dans leur ville). La case du Bastion relève des règles du siège : pas de rencontre d'armées dessus, sauf une armée qui
  garde le Bastion contre l'ennemi qui vient l'assiéger.
- **Carte** : le Bastion se dessine comme une forteresse 2 × 2 (image peinte `map/cities/bastion`, chantier
  `bastion_site`, en attendant la forteresse de la civilisation du chef), plaque « Bastion [TAG] » aux couleurs de la
  diplomatie, barre de vies, marque de siège ; les armées qui marchent sur un Bastion de son alliance se voient.

## Marché et commerce (27 octobre 2026, marchands le 31 octobre 2026)

Décisions du 27 octobre 2026 et de la revue des bâtiments du 31 octobre 2026 (GDD `economy_config.market`,
`src/routes/market.js`, `src/services/marketService.js`, client `frontend/js/app/11-market.js` et `11b-market-trade.js`) :

- **La Place du marché n'existe que dans la capitale** et sert toutes les villes du joueur : sans elle, ni offre, ni
  échange, ni envoi, ni route (« Construisez un Marché dans la capitale (niveau 1 minimum) pour commercer »). Les Marchés
  et les Comptoirs des colonies ont été retirés avec leurs chantiers (migration `0032_batiments`).
- **Marchands façon Travian** : **un marchand par niveau du Marché** (`MARKET.effects.merchantsPerLevel`). Un marchand porte
  une charge selon la civilisation (`config.market.merchants.capacity` : Rome 500, Gaule 750, Grèce 600, Égypte 750, Huns
  500, Sultanat 1 000), augmentée de +1 % par niveau du Comptoir et du Poste du Désert de la capitale ; il marche à la
  vitesse de sa civilisation (`config.market.merchants.speed` : Gaule 100, Huns 90, Rome et Égypte 80, Grèce 75, Sultanat
  65, sur la même échelle que les unités), sur la vraie route, sans les bonus de marche des armées (Irrigation, technologie,
  Bastion). **Un marchand est occupé à l'aller ET au retour.**
- **Toutes les livraisons du marché passent par les marchands** : offres entre joueurs, envois de ressources
  (`POST /api/trade/send`, à un joueur, à une de ses villes ou à la Ville Merveille), routes commerciales. Les marchandises
  partent de la ville choisie (capitale ou colonie) ; les marchands sont ceux du joueur. S'il en manque : « Pas assez de
  marchands libres (X libres, Y nécessaires) ». Les missions d'armée (`/api/army/:id/transport`, récoltes, pillage, convois
  du Bastion) ne changent pas ; le transport par armée demande seulement le Marché de la capitale.
- **Échanges entre joueurs** : en publiant une offre, les marchands qu'il faut pour les marchandises **attendent en ville**
  avec elles (ils sont occupés). À l'acceptation, ceux du vendeur partent vers la ville de l'acheteur, et l'acheteur envoie
  les siens avec la contrepartie ; chacun livre puis rentre (un échange accepté fait passer les marchands de l'offre sur la
  route dans la même transaction : jamais comptés deux fois). Les réponses donnent `{ merchantsUsed, arrivalAt, returnAt }`
  (pour l'acheteur : ses marchands, l'arrivée de ses marchandises, le retour de ses marchands) ; retirer une offre rend
  `merchantsFreed`. Pas d'échange avec un ennemi ; aucune marchandise n'entre ni ne sort d'une ville assiégée (on peut
  publier pendant un siège, pas conclure), et un envoi ne part pas d'une ville assiégée.
- **Livraison** : ce qui ne tient pas dans l'entrepôt d'arrivée **revient avec les marchands** (une Ville Merveille prend
  tout, sans plafond) ; une livraison vers un joueur devenu ennemi en route revient avec sa cargaison. L'acheteur est averti
  avant d'accepter si sa ville n'a pas la place de tout recevoir ; le destinataire est prévenu de la livraison.
- **Taxe des échanges** (GDD) : **10 %** de ce que livre chaque côté, **−1 point par niveau du Comptoir de commerce** de la
  capitale (capitale seulement depuis le 31 octobre 2026 ; avant : le meilleur Comptoir des colonies), **−0,25 point par
  niveau de la Chambre au Trésor** de la capitale (au plus bas 0 %). La même taxe vaut pour toutes les villes du joueur.
- **Stock propre à chaque ville** : les marchandises partent de la ville choisie et arrivent dans la ville visée, jamais dans
  les autres (le stock partagé ne vaut que pour les dépenses) ; seuls les marchands sont communs au joueur.
- **Offres de 48 h** : une offre non prise revient au vendeur (marchandises dans la ville, marchands libres), il est prévenu.
  Annuler une offre fait de même ; la chute ou le déplacement de la ville aussi.
- **Routes commerciales entre ses villes** (Marché → Routes) : ville de départ, ville d'arrivée, ressources ; toutes les
  **2 h** des marchands partent avec **1/12 du Dépôt** (du Silo pour la nourriture) de la ville de départ pour chaque
  ressource choisie, soit **100 % au plus en 24 h** (le GDD disait 30 % en 12 h), **dans la limite de ce que portent les
  marchands libres** (le chargement est réduit d'autant). Le Grand dépôt et le Grand silo ne comptent pas dans ce calcul
  (recommandation 12) : Dépôt 20 = 13 333 par envoi ; un joueur romain au Marché 20 en porte 10 000. Ce qui ne tient pas
  dans l'entrepôt d'arrivée revient. Rien ne part d'une ville assiégée ni n'y entre. 10 routes au plus, pause et
  suppression à volonté. **Une seule route active par ville de départ et par ressource** ; la cadence de 2 h appartient à
  la ville et à la ressource (30 octobre 2026) : elle survit à la pause, à la reprise et à la re-création d'une route.
- **Écrans** : `GET /api/market/state` (aussi `/api/market/tax`) et `GET /api/market/routes` donnent les marchands
  `{ total, free, capacity, speed }` ; `routes` liste aussi chaque trajet (`convoys` : `kind` ROUTE, SEND ou TRADE,
  `merchants`, `arrivalAt`, `deliveredAt`, `returnAt`), qui disparaît au retour des marchands. `GET /api/player/me` →
  `economy.market.merchants` : charge et vitesse de chaque civilisation, et ceux du joueur.
- **Marchand du serveur (PNJ)** : échange immédiat dans n'importe quelle ville du joueur, **sans marchand** ; taxe de 30 %,
  −1 point par niveau du Marché de la capitale (5 % au plus bas).

## Classements et médailles (27 octobre 2026)

Décisions du 27 octobre 2026 (GDD `world_config.server.rankings`, `src/services/rankingService.js`,
`src/routes/ranking.js`, client `frontend/js/app/09h-ranking.js`) :

- **Points de combat façon Travian** : un ennemi tué vaut son entretien en nourriture (5 de base, 9 intermédiaire,
  13 élite, 15 siège depuis le 30 octobre 2026 ; lu dans `config.army.upkeepPerTier`). L'attaquant gagne des points d'attaque, le défenseur des points de défense, partagés entre les
  joueurs d'un même camp selon les soldats engagés. Comptent : attaques et raids de villes, sièges, Bastions, combats sur
  les points et en terrain ouvert ; une tribu tuée donne des points d'attaque (comme les animaux d'une oasis Travian).
  **Pillage** : ressources prises aux autres joueurs (raids, pillage de siège).
- **Classement des joueurs** par population, attaque, défense ou pillage, 50 par page, avec **son propre rang**
  (« Voir ma place »). **Alliances** par population, attaque ou défense (somme des membres), avec le rang de la sienne.
- **Semaine** (lundi 0 h, heure de Paris) : top 10 en attaque, défense, pillage et progression de population ; top 3 des
  alliances en attaque et en défense ; ses propres chiffres de la semaine. Au lundi, la semaine close donne une
  **médaille honorifique** (or, argent, bronze, puis rang) à chaque classé, prévenu par une notification ; les médailles
  restent sur le profil public (avec les points d'attaque, de défense et le pillage) et dans l'onglet Médailles.

## Entretien et famine (28 octobre 2026, entretien de tout le joueur le 30 octobre 2026)

Décisions du 28 et du 30 octobre 2026 (`src/game/processors/resourceProcessor.js` : `foodBalanceSql`, `processUpkeep`,
`playerFoodBalance`) :

- **Entretien** : **5 (base), 9 (intermédiaire), 13 (élite), 15 (siège)** de nourriture par unité et par heure
  (`config.army.upkeepPerTier`, recommandation 5 ; le GDD disait 5 / 10 / 15), pour **toutes les armées que la ville
  nourrit** (en ville, en mission, en renfort chez un allié, en garnison de Bastion) et pour **les blessés qui attendent
  un soin** (`config.wounded.woundedPayUpkeep`), moins les réductions des bâtiments de faction de la capitale (Tente de
  guerre hunnique, Avant-poste du désert) et de la technologie Intendance, 50 % au plus. Les blessés au lit ne mangent pas.
- **Tous les greniers paient** (§ 1 bis) : à chaque tick, chaque ville paie d'abord ses propres troupes avec son grenier ;
  ce qui manque est pris dans les autres villes du joueur, la plus pleine par rapport à son Silo d'abord (comme les
  dépenses, décision du 30 octobre 2026). Une seule requête SQL
  pour tous les joueurs, écrite en différence (une écriture en même temps n'est pas perdue).
- **Siège** (GDD `upkeep.siegeModifiersPct`) : une armée qui campe devant une ville coûte **+10 %** ; les armées à
  l'arrêt dans leur ville assiégée coûtent **−10 %**.
- **Famine façon Travian**, seulement quand **tous les greniers du joueur sont vides** et que sa consommation dépasse sa
  production : chaque heure meurent **juste assez de soldats** pour que la consommation repasse sous la production ; les
  **blessés qui attendent** meurent en premier, puis **les plus gourmands** (siège et élite, puis intermédiaires, puis
  base), dans toutes les armées de toutes ses villes, en mission comprises. La nourriture est relue sous le verrou de toutes
  ses villes avant la moindre mort. Une armée qui meurt entièrement de faim perd son héros (il tombe).
- **Alertes** : une notification par joueur quand ses greniers seront vides dans **moins de 12 h**
  (`config.army.famineAlertHours`, 6 h jusqu'au 30 octobre 2026 ; une toutes les 12 h au plus, notée sur la capitale), puis
  à chaque heure de famine avec les pertes. Bandeau rouge sous la barre de ressources, au même seuil (`GET /api/player/me`
  → `economy.famineAlertHours`) : « Greniers bientôt vides … dans toutes vos villes » ; le minuteur de la nourriture compte
  jusqu'aux greniers vides.
- **Affichage** : le bilan vient du serveur, réductions et siège compris : `GET /api/cities` → `foodBalance` (la ville) et
  `playerStock.foodBalance` (tout le joueur : production, consommation, bilan, heures avant les greniers vides) ; le client
  affiche le bilan du joueur.

## Défi d'alliance de la semaine (29 octobre 2026)

GDD « Compétitions alliances » (`src/services/challengeService.js`, `GET /api/ranking/challenge`, carte dans
Classement › Semaine et dans l'aperçu de l'alliance) :

- Chaque semaine (lundi 0 h → lundi 0 h, heure de Paris), un **thème** tiré au sort, le même pour tous et jamais deux
  semaines de suite : **Assaut** (points d'attaque), **Rempart** (points de défense), **Butin** (ressources pillées),
  **Bâtisseurs** (population gagnée), **Entraide** (aides données entre membres), **Chasseurs de hordes** (dégâts aux
  donjons d'invasion).
- Classement des alliances en direct, selon ce que font leurs membres ; place de son alliance. **Seuls comptent**, pour le
  score comme pour la récompense, **les membres arrivés dans l'alliance avant le vendredi 0 h (heure de Paris)** de la
  semaine (décision du 30 octobre 2026, D8, `config.alliance.challengeJoinDeadline`, `AllianceMember.joinedAt`) : recruter
  des joueurs forts pour le week-end ne rapporte rien. La carte du défi indique la limite et si l'on compte.
- À la clôture (avec les médailles de la semaine), les **3 premières alliances** gagnent **750 / 500 / 250 points
  d'alliance pour chaque membre qui compte** (D8 ; 300 / 200 / 100 avant le 30 octobre 2026) et une **médaille d'alliance**
  « Défi … » ; seuls ces membres sont payés et prévenus.
- Pas de bonus de ressources le week-end (décision du 29 octobre 2026) ; les artefacts viendront plus tard.

## Invasions barbares (29 octobre 2026)

Décisions du 29 octobre 2026 (`src/services/hordeService.js`, `src/routes/invasion.js`, `frontend/js/app/09k-invasion.js`,
réglages `config.invasion`) — contenu **« donjon d'alliance »** : les hordes **n'attaquent jamais les joueurs**.

- **Chaque week-end**, du **vendredi 18 h au dimanche 23 h** (heure de Paris), **43 donjons** de hordes apparaissent sur
  la carte, annoncés à tous : 15 de niveau 1 près des bords, puis 12, 8, 5 et **3 de niveau 5 au centre** ; jamais à
  moins de 4 cases d'une ville. Au terme, ceux qui restent repartent. L'administrateur peut aussi lancer une invasion
  (2 à 72 h) ou terminer celle en cours (écran d'administration › Monde).
- Un donjon a **3 étages** à vaincre dans l'ordre : **avant-poste** (unités de base), **remparts** (intermédiaires),
  **chef de la horde** (élite), de force × 1, × 2, × 4. **Force réglée sur les joueurs** (recommandation 9, 30 octobre 2026,
  `config.invasion.powerRef`) : au lancement, le serveur mesure la puissance médiane des joueurs actifs (vus dans les 7
  derniers jours, puissance > 0 : toutes leurs unités, armées et garnisons) ; l'avant-poste du niveau 1 vaut la moitié de
  cette médiane (3 000 au moins), puis × 1,8 par niveau ; le chef du niveau 1 vaut donc 2 joueurs médians, celui du niveau 5
  environ 21. Cette puissance est notée sur l'invasion (`Invasion.basePower`). Avec moins de 5 joueurs mesurés, l'ancienne
  formule reste : 15 000 au niveau 1, × 2,5 par niveau, puis × l'âge du monde (ci-dessous). La **garnison de l'étage ne se reconstitue pas** : une
  attaque repoussée lui retire quand même des soldats ; un étage vaincu laisse place au suivant ; le dernier vaincu
  **détruit le donjon**.
- **Âge du monde** (décision du 30 octobre 2026, D7, `config.invasion`) : au lancement d'une invasion, multiplicateur =
  min(6 ; 1 + 0,35 × (semaine du monde − 3)), soit × 1 les trois premières semaines, × 1,35 la 4e, × 2,75 la 8e et × 6 dès la
  18e ; il est noté sur l'invasion (`Invasion.ageMult`) et ne bouge plus jusqu'à sa fin. Un donjon de niveau L en prend
  mult^((L − 1)/4) : le niveau 1 ne change jamais, le niveau 5 prend tout le facteur. Il s'applique aux **ressources** du
  trésor (pas à l'or ni aux points d'alliance), et à la puissance des étages seulement quand la force n'a pas pu être
  mesurée sur les joueurs. Tableau : `docs/EQUILIBRAGE.md` § 13.
- Un donjon ne s'attaque qu'en **rassemblement d'alliance**, façon Rise of Kingdoms (`src/services/rallyService.js`,
  `frontend/js/app/09l-rally.js`) : un membre le lance depuis le panneau du donjon avec une de ses armées et choisit
  l'attente (**5, 10, 30 ou 60 min**) ; l'alliance est prévenue. Les membres y envoient **une armée chacun**, qui marche
  jusqu'à la ville du lanceur et doit y arriver avant le départ (sinon l'envoi est refusé). Taille selon la **Place de
  rassemblement de la capitale du lanceur** (décision du 31 octobre 2026) : **5 armées + 1 par niveau** (15 au niveau 10, 25
  au niveau 20 ; `RALLY_POINT.effects.rallyMaxArmiesBase` et `rallyMaxArmiesPerLevel`), la sienne comprise ; plein :
  « Rassemblement complet (N armées au plus) ». `GET /api/rallies` donne `maxArmies` pour chaque rassemblement et pour ceux
  que le joueur lancerait. Le lanceur peut **partir
  plus tôt** ou **annuler** ; un membre peut retirer son armée. Au départ, les armées arrivées partent **ensemble, à la
  vitesse de la plus lente** (celles encore en route rentrent) et livrent **un seul combat** : le héros du lanceur en
  tête, chaque armée perd la même part de ses soldats, les **dégâts** reviennent à chacun **selon la puissance qu'il a
  amenée** (points de combat : entretien des barbares tués, aussi comptés au classement d'attaque), un rapport par
  joueur ; puis chacun rentre chez lui. Plusieurs alliances peuvent attaquer le même donjon. Les rassemblements de
  l'alliance sont dans **Alliance › Rassemblements** et dans le panneau du donjon.
- **Rassemblement contre un Bastion ennemi** (décision du 29 octobre 2026 ; **jamais contre une ville**) : bouton
  « Rassemblement » dans le panneau d'un Bastion ennemi sur la carte. Mêmes règles (attente, capacité, une armée par
  joueur), mais il faut **au moins un engin de siège dans le groupe au départ**, sinon le rassemblement est annulé et
  chacun rentre. Devant le Bastion, **tout le groupe campe 1 h** comme un siège normal (l'alliance du Bastion est prévenue
  au départ et peut briser le siège), puis **un seul assaut** avec toutes les armées. C'est **le héros de l'armée qui a lancé le rassemblement** qui donne
  ses bonus (avec les technologies du lanceur) ; si cette armée a été rappelée pendant le camp, l'assaut se fait sans héros.
- **Rassemblement contre un site ou un plan de Merveille** (décision du 30 octobre 2026, D4) : bouton « Rassemblement » dans
  le panneau d'un site ou d'un plan encore gardé par les Immortels (alliance requise). Mêmes règles qu'un donjon (attente,
  capacité, une armée par joueur, départ ensemble) ; refusé si les Immortels sont déjà vaincus ou si une Ville Merveille
  s'y dresse, et revérifié au départ puis à l'arrivée, sous verrou du point. À l'arrivée, **un seul combat de groupe** (par
  la puissance) mené par le héros et les technologies de l'armée du lanceur (sans héros si elle a été rappelée) ; chaque
  armée perd la même part de ses soldats ; la prise suit les règles d'une armée seule et **revient au lanceur** (plan dans sa
  capitale, ou site libre 24 h pour y fonder la Ville Merveille). Repoussé, le rassemblement laisse la garnison entamée.
- **Fenêtre de la cible façon Rise of Kingdoms** (29 octobre 2026, `frontend/js/map.js` : `openMapPopupAt`) : toucher
  une cible sur la carte (ville, Bastion, donjon, point de ressource, armée, case vide) ouvre une petite fenêtre juste
  au-dessus d'elle (en dessous s'il n'y a pas la place), qui suit la carte quand on la déplace. Les actions sont des boutons
  ronds à icône (Assiéger, Rassemblement, Espionner, Partager…) ; les explications et le détail des troupes d'une tribu
  se déplient avec « Détails ».
- **Trésor** à la destruction, **partagé selon les dégâts** entre tous ceux qui ont frappé : ressources livrées dans la
  capitale puis, s'il n'y tient pas, dans les autres villes du joueur (8 000 de chaque au niveau 1, × 2,5 par niveau, × l'âge
  du monde ; ce qui ne tient nulle part est perdu et la notification le dit, recommandation 2), or (40 → 640), points
  d'alliance (30 → 480) ; le **dernier coup** a une chance d'**objet** pour le héros (15 % au niveau 1, 70 % au niveau 5,
  objet rare dès le niveau 3, épique aux niveaux 4 et 5). Chaque participant est prévenu de sa part.
- **Carte** : le donjon (forteresse sur un halo rouge en attendant l'image peinte), sa barre de vie et « Donjon niv. N ·
  étage x/3 » ; panneau : les 3 étages et leur garnison restante, le trésor, les dégâts de chacun, Attaquer, Espionner.
  **Classement › Monde** : invasion en cours (fin, donjons restants par niveau, alliances par dégâts, mes dégâts,
  bouton « Donjon le plus proche ») ou la date de la prochaine.

## Administration (29 octobre 2026)

Décisions du 29 octobre 2026 (`src/services/adminService.js`, `src/routes/admin.js`, `frontend/js/app/09j-admin.js`,
outil `tools/admin.cjs`) :

- **Rôles sur le compte** : Joueur, **Modérateur**, **Administrateur**. L'équipe voit le bouton **Administration** dans les
  Paramètres. Le premier administrateur est nommé en ligne de commande (`node tools/admin.cjs <e-mail ou pseudo> ADMIN`),
  les suivants depuis la fiche d'un joueur ; le dernier administrateur ne peut pas être retiré.
- **Modérateur** : signalements du chat (classer, supprimer le message, supprimer et couper la messagerie 24 h), fiches
  des joueurs, silence, suspension jusqu'à 7 jours, journal. **Administrateur** : en plus, bannissement, suspensions
  jusqu'à 30 jours, e-mails des joueurs, le monde, l'équipe. Personne ne sanctionne un membre de l'équipe de rôle égal
  ou supérieur, ni soi-même.
- **Sanctions** (gardées d'un monde à l'autre, motif obligatoire) : **silence** du chat (1 h à 30 jours, le joueur est
  prévenu) ; **suspension** de 1 à 30 jours (déconnecté tout de suite, connexion refusée, ses villes restent attaquables,
  comme Travian) ; **bannissement** définitif. Le joueur suspendu ou banni lit le motif et la date de fin en se
  connectant. Chaque sanction peut être levée.
- **Monde** (administrateur) : durée des inscriptions, jour des sites de Merveille et des plans (vides = 60, 120, 150),
  inscriptions fermées à la main, sites ou plans « maintenant », **décaler** tout le calendrier de ±60 jours,
  **terminer le monde** (taper TERMINER : la Merveille la plus haute l'emporte, sinon « Aucun vainqueur » ; Panthéon et
  titres), **ouvrir le monde suivant** (taper NOUVEAU MONDE ; le monde doit être terminé, sauf case « sans Panthéon »).
  Le worker de tick prépare le monde suivant **sans redémarrer** (remise à zéro, nouvelle carte, points de ressource,
  quelques secondes) ; les autres processus relisent la carte ; chaque joueur est prévenu et rejoint en choisissant sa
  civilisation. Pendant la préparation, rejoindre et s'inscrire répondent « monde en préparation » (503, réessayer dans
  un instant) : aucune ville n'est posée sur l'ancienne carte.
- **Journal** : chaque action de l'équipe (rôles, sanctions, signalements, calendrier, fin et monde suivant) avec son
  auteur, sa cible et son motif ; l'historique d'un joueur est sur sa fiche.
- **Tableau de bord** : signalements en attente, joueurs, actifs sur 24 h et 7 jours, suspendus, bannis, en silence,
  équipe, état du monde.
- **Noms choquants refusés à la création** (le jeu les empêche plutôt que de les faire renommer) : pseudo, nom et tag
  d'alliance, héros, armées, ville fondée. Listes dans `data/name-filter.json` (mots refusés n'importe où dans le nom,
  mots refusés seuls, noms réservés à l'équipe comme « Admin », « Modo », « Support », « Immortels ») plus les mots du
  filtre du chat ; la comparaison ignore accents, casse, lettres répétées et chiffres « leet » (« C0nn4rd »), sans
  bloquer les noms ordinaires (« Computer », « Cocktail »). `src/utils/nameFilter.js`.
- **Annonces** (administrateur) : un titre et un texte envoyés à tous les joueurs, dans leur fil de notifications, en
  push sur les téléphones si la case est cochée (envoyé par paquets en tâche de fond), et en **bandeau** en haut de
  l'écran pendant 6 h à 30 jours (chaque joueur peut le fermer ; l'équipe peut le retirer). `src/services/announcementService.js`.
- **Statistiques** (administrateur, 30 derniers jours, jours de Paris) : inscriptions et joueurs actifs par jour,
  rétention J1 et J7, achats par jour et par produit, entonnoir du tutoriel (inscrits, premier bâtiment, chaque quête du
  tutoriel, tutoriel terminé), combats et échanges au marché par jour, ressources échangées, civilisations choisies.
  Graphiques à une couleur avec infobulle et tableau des valeurs. `src/services/statsService.js`.

## Cycle du serveur et Merveille (28 octobre 2026)

Décisions du 28 octobre 2026 (`src/services/wonderService.js`, `src/services/hallOfFameService.js`,
`src/routes/wonder.js`, `frontend/js/app/09i-world.js`, réglages `config.world`) :

- **Un monde a une fin**, façon Travian : il se termine quand une **Merveille atteint le niveau 100**. Les Natars de
  Travian s'appellent ici les **Immortels** (armée d'élite du Sultanat : fantassins du palais, archers perses, mamelouks).
- **Inscriptions** ouvertes **2 mois** (60 jours après l'ouverture du monde), **2 000 joueurs** au plus (décision du 31 octobre 2026, avant 5 000) ; ensuite
  l'inscription répond « inscriptions closes » et le joueur attend le monde suivant.
- **Calendrier** : jour 120, **12 sites de Merveille** apparaissent sur la carte, gardés par les Immortels ; jour 150,
  **13 plans de construction** apparaissent, eux aussi gardés. Tous les joueurs sont prévenus. Onglet Classement →
  **Monde** : jour du monde, dates, Merveilles en chantier, plans détenus, Panthéon.
- **Prendre un site** : battre les Immortels (attaque comme sur un camp barbare, seul ou en rassemblement d'alliance depuis
  le 30 octobre 2026), puis y **fonder une ville avec un colon** : c'est la **Ville Merveille** (une par joueur, alliance obligatoire, hors quota de colonies). Les Immortels
  reviennent sur un site libre au bout de 24 h.
- **Prendre un plan** : battre les Immortels du camp, seul ou en rassemblement d'alliance ; le plan revient au joueur (au
  lanceur pour un rassemblement). Un joueur dont la **capitale est
  prise** perd ses plans au profit de l'attaquant.
- **Construire** : chaque niveau coûte des ressources (250 000 bois, pierre et fer, 75 000 nourriture au niveau 1,
  +5 % par niveau : cinq fois plus que d'abord, décision du 30 octobre 2026, recommandation 7 ; la Merveille entière vaut
  2,15 milliards) et du temps (1 h au niveau 1, +2,5 % par niveau). Les ressources viennent de l'alliance : les envois des
  marchands et les transports par armée vers la Ville Merveille remplissent son **stock de Merveille** (sans plafond). Au-delà du **niveau 50**,
  un membre de l'alliance doit détenir un plan.
- **Immortels cinq fois plus forts** (décision du 30 octobre 2026, recommandation 8) : garnison d'un site 3 millions, d'un
  plan 4,5 millions ; vague contre une Ville Merveille = 20 000 × niveau^1,35 (3,93 millions au niveau 50, 10 millions au
  niveau 100, `wonderService.wavePower`).
- **Défendre** : toutes les 12 h, une **vague d'Immortels** attaque chaque Merveille (force croissante avec le niveau) ;
  si la défense tombe, la Merveille perd **1 niveau**. Comme seuls les engins abîment le mur (D6), chaque vague amène des
  **mangonneaux pour 15 % de sa puissance** (règle retenue le 30 octobre 2026, comme les Natars de Travian qui viennent avec
  béliers et catapultes) : un mur 20 sans défenseurs ne tient seul que jusqu'au niveau 2 de la Merveille, puis tombe au 2e
  round au niveau 12 et dès le 1er à partir du niveau 20 ; les défenseurs doivent battre la vague : ce sont, comme contre
  un joueur, les armées du propriétaire stationnées dans la Ville Merveille et les renforts alliés qui y sont postés (la
  Ville Merveille n'a pas de garnison propre ; corrigé le 30 octobre 2026 : avant, la vague ne voyait aucun défenseur et
  frappait une ville vide). Une vague ne laisse pas
  de dégâts au mur (ce n'est pas un siège). Un assaut ennemi victorieux lui ôte **2 niveaux** (au lieu des
  dégâts de rempart) ; la Ville Merveille ne peut pas être rasée.
- **Fin du monde** : au niveau 100, le monde s'arrête (le jeu se lit mais ne se joue plus : réponses 423 aux actions).
  **Panthéon** : alliance victorieuse et top 10 en population, attaque, défense et alliances, gardé d'un monde à
  l'autre. **Titres** sur le compte pour tous les membres de l'alliance victorieuse et le top 3 de chaque catégorie.
- **Monde suivant** (écran d'administration depuis le 29 octobre 2026, ou `node tools/nouveau-monde.cjs` serveur arrêté, par l'équipe, refusé tant que le monde n'est pas fini sauf
  `--force`) : comptes, pseudo, or, abonnement Plus, achats, cosmétiques, médailles, titres et Panthéon sont gardés ;
  villes, armées, héros, alliances, marché, rapports… repartent à zéro. Au démarrage suivant, une nouvelle carte
  (taille fixe 374 × 374) est tirée, numérotée d'après le Panthéon. Chaque joueur **rejoint** le nouveau monde en
  choisissant sa civilisation (`POST /api/world/join`).

## Messagerie (octobre 2026)

Onglet **Messages** de la barre du bas (pastille des non-lus), `frontend/js/app/09c-chat.js`, `src/services/chatService.js`,
`src/routes/chat.js`.

- **Canaux** : chat global (tous les joueurs du serveur), chat d'alliance, chat des amis (on y lit ses amis acceptés et
  soi-même), messages privés. Nouveaux messages en 2 à 3 s quand l'onglet est ouvert ; pastille rafraîchie avec le jeu
  sinon. Un message privé envoie une notification push (au plus une toutes les 30 s par conversation).
- **Amis** : demande à accepter (deux demandes croisées valent acceptation), retrait à tout moment.
- **Partages** joints à un message : rapport de bataille, rapport d'espionnage (les siens seulement), position sur la carte
  (avec la ville ou le point qui s'y trouve). Le message garde une copie : le partage reste lisible même après la purge
  des rapports ; il s'ouvre depuis le message.
- **Traduction** DeepL : chaque message garde la langue de son auteur ; un message d'une autre langue que la sienne est
  traduit automatiquement (« Traduit · voir l'original »), une seule fois par langue pour tout le serveur. Langue et
  traduction automatique réglables dans la messagerie.
- **Modération** (exigence App Store) : filtre de mots (`data/chat-filter.json`), 500 caractères, 1 message / 1,5 s,
  15 / min, pas de doublon en 30 s ; **Signaler** un message, **Bloquer** un joueur (ses messages disparaissent, il ne
  peut plus écrire ni rester ami) ; l'équipe traite les signalements (supprimer, couper le chat pour une durée).
  Chat global réservé aux adresses confirmées quand l'e-mail est en service.
- **Conservation** : global 7 jours, le reste 90 jours.
- Depuis le profil d'un joueur ou une ville sur la carte : Écrire, demande d'amitié, Bloquer ; bouton **Partager** sur
  les rapports et les panneaux de la carte.

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
**stock n'est connu que par quarts** (plein, bien garni, à moitié, entamé, presque vide ; jauge sur la carte), un espion donne
le stock exact pendant 1 h ; les camps **varient de ± 20 %** d'un camp à l'autre (les « étoiles » du GDD) et leur taille suit
la **difficulté de la position** : × 0,5 aux bords de la carte, où les joueurs apparaissent (camp de niveau 1 ≈ 50
soldats), jusqu'à × 1,3 au centre (niveau 3 ≈ 1 950 soldats). Une ville secondaire se fonde sur un point libéré de sa tribu
(section « Villes secondaires ») : le point disparaît de la carte tant que la ville existe. Graphismes : 18 sprites de camps prévus (`map/camps/`), affichés dès livraison.

Décidé le 30 octobre 2026 (D4, `armyService.resolveTribeCombat`, `utils/tribeDefenders.js`) : au combat, **chaque défenseur
d'un camp porte son palier** (intermédiaire, élite), comme dans la puissance affichée sur la carte ; un **camp d'or garde au
combat ses +40 %** (`config.map.camps.goldDefenseBonusPct`), comme à l'affichage. Jusque-là, les camps de niveau 2 et 3 et
les camps d'or étaient plus faibles au combat que ce que la carte annonçait. Une armée qui va prendre un point tenu par une
armée alliée (même devenue alliée pendant la marche) rentre sans combattre. Chiffres refaits : `docs/EQUILIBRAGE.md` § 9.

## Blessés et soins (revue d'octobre 2026, soins payants le 30 octobre 2026)

Règles du GDD (`wounded_and_healing.md`, `combat_config.woundedSystem`) et décision du 30 octobre 2026 (recommandation 6,
`src/services/woundedService.js`, `config.wounded`) :

- **Part des pertes qui reviennent blessées** : 30 %, + 3 % par niveau de la Tente de soins de la capitale, plafond 70 %,
  bonus grec, Médecine et bâtiments de faction de la capitale. Sans Tente dans la capitale, aucun blessé.
- **Les blessés d'une armée hors de sa ville** (attaque, tribu, combat sur un point de ressource, des deux côtés) **rentrent
  avec elle** (`Army.woundedCarry`) ; une armée sans survivant ne ramène personne. La carte d'armée affiche les blessés
  transportés.
- **Un blessé arrive en attente** dans sa ville (`WoundedUnit.waiting`) : il n'est pas soigné tout seul et **mange comme un
  soldat** ; en famine, les blessés qui attendent meurent les premiers.
- **Une seule Tente, dans la capitale, pour tout le joueur** : ses lits (**200 par niveau**, 4 000 au niveau 20) et sa
  vitesse servent aux blessés de toutes les villes ; chaque blessé reste noté dans sa ville.
- **Soin payant** (`POST /api/city/:id/wounded/start { unitKey, count? }`) : le joueur lance le soin des blessés qui
  attendent ; il paie **30 % du prix de recrutement** de l'unité (38 pour un fantassin de base), sur le stock de toutes ses
  villes, la capitale d'abord. Les blessés prennent un lit et guérissent **l'un après l'autre** : **10 % du temps de
  formation de base** par unité × 0,95^(niveau de Tente − 1), Thermes romains compris, **après les soins déjà en cours**.
  `GET /api/city/:id/wounded` donne les blessés de toutes les villes (ville, nombre au lit, nombre en attente) et, pour
  chaque ligne, combien le bouton peut soigner (`healable` : autant que de lits libres et que le stock paie), le prix et
  la durée.
- **Soin immédiat à l'or** des blessés déjà au lit : 1 / 2 / 3 / 3 or par unité (base / intermédiaire / élite / siège).
- **Les blessés guéris rejoignent la garnison de la capitale** (§ 1 bis), quelle que soit leur ville.
- **Pendant un siège**, rien n'est mis en pause : les soins continuent (voir « Siège »).
- Effet calculé (`docs/RAPPORT-ECONOMIE.md`, recommandation 6) : une perte coûte environ 51 % du prix de l'unité au lieu de 30 %, et
  4 000 lits demandent environ 15 h à la Tente 20 au lieu de 11 minutes.

## Héros

| Existe | Manque |
|---|---|
| Fiche, XP et niveaux (siège, raid, tribu, expédition), points attaque/défense/vitesse/logistique tous appliqués, talents à 3 branches, chute et résurrection (ci-dessous) | Portrait animé (pas de compétences actives : décision du 29 octobre 2026, le héros n'a que des compétences passives, GDD) |
| **Équipement réel** : catalogue de 14 objets (`data/items.json`), bonus appliqués au combat, à la vitesse et à la logistique, inventaire, équiper/déséquiper/jeter, drop à la fin d'une expédition gagnée selon le palier de butin | Forge d'objets, enchantement, objets des raids/sièges |
| Expéditions : 1 à 4 étoiles, puissance ennemie, durée, palier de butin, or, XP, objet | (les quêtes à objectifs sont en place : section Quêtes) |

Décisions du 29 octobre 2026 (GDD) :

- **Compétences passives seulement** : ses caractéristiques, son équipement et ses talents ; pas de compétence à
  déclencher. Pas de forge pour l'instant.
- Le héros ne compte que s'il est **joint à une armée depuis le panneau de l'armée**, garnison comprise (pour défendre la
  ville, on le joint à la garnison). Retiré d'une armée, son armée dissoute, ressuscité au Domus ou chassé d'une
  capitale tombée : il **attend en ville sans combattre** (`Hero.cityId`) jusqu'à ce qu'on le joigne à une armée de
  cette ville. Un nouveau joueur commence avec son héros joint à la garnison. Onglet Armée : où il attend et
  « Joindre à la garnison ».
- **Logistique** (GDD) : **réduit l'entretien en nourriture** de l'armée qui porte le héros (0,1 % par point, plafond
  5 %, plus l'équipement), au lieu d'augmenter le transport ; la capacité de transport ne vient plus que des unités et
  des talents d'Intendance (Quartier-maître, Grand intendant).

Décisions du 27 octobre 2026 (`src/utils/heroEffects.js`, `src/services/heroService.js`, `data/hero-talents.json`,
client `frontend/js/app/08b-hero-talents.js`) :

- **Caractéristiques** : **+0,1 % par point** (au lieu de 0,5 %), plafond **+5 %** par caractéristique gardé (GDD) :
  50 points pour l'atteindre. Avec 4 points par niveau, un héros de niveau 30 (136 points) en maximise 2 à 3 sur 4.
- **Équipement** inchangé (8 emplacements, 14 objets) : **+0,5 % par point d'objet**, plafonné à **+5 %** à part
  (GDD « équipement plafonné à 5 % »). Le bonus de chaque caractéristique (points + objets + talents) s'affiche en %.
- **Talents** : **1 point par niveau gagné** (29 au niveau 30), trois branches de 15 points (5 talents, paliers à 0, 5,
  10 et 14 points dans la branche) : une branche pleine et presque une deuxième.
  - Conquête : Assaut (+1 % d'attaque × 5), Ingénieur de siège (+4 % de dégâts aux murs × 3), Pillard (+4 % de butin
    en raid, pillage et sur les points × 3), Vétéran (+5 % d'XP × 3), Seigneur de guerre (+5 % d'attaque).
  - Garde : Rempart vivant (+1 % de défense × 5), Chirurgien (+3 points de blessés × 3), Gardien des murs (−5 % de
    dégâts au mur de la ville qu'il défend × 3), Endurance (−10 % de temps de résurrection × 3), Dernier carré (+5 % de
    défense).
  - Intendance : Quartier-maître (+3 % de transport × 5), Éclaireur (+2 % de vitesse × 3), Explorateur (−5 % de durée
    d'expédition × 3), Chasseur de trésors (+5 % d'or d'expédition × 3), Grand intendant (+5 % de transport, +3 % de
    vitesse).
  Les talents s'ajoutent au-delà des plafonds. Réinitialisation : la première gratuite, ensuite 100 or.
- **Chute** : le héros tombe quand l'armée qu'il mène (ou la garnison qu'il commande) perd tous ses soldats dans un
  combat (siège d'une ville, Bastion, combat en terrain ouvert). Un héros seul dans une garnison sans soldats ne combat
  pas. Tombé, il garde niveau, points, talents et objets, quitte son armée, ne gagne plus d'XP et ne peut mener aucune
  armée.
- **Résurrection** au **Domus du Héros de la capitale** : 24 h réduites de 2 % par niveau du Domus (et du talent
  Endurance), pour 250 bois, pierre, fer et 150 nourriture par niveau du héros, pris dans toutes les villes du joueur, la
  capitale d'abord (30 octobre 2026) ; il revient dans la garnison de la capitale. Le panneau du Domus montre ce temps (les faux bonus « XP » et « stats » sont retirés).
- Notifications : passage de niveau, chute, retour (lien vers l'écran du héros).
- **XP** (décision du 30 octobre 2026, D9, `heroXpService.awardHeroXp`, `config.hero`) : 100 XP pour passer au niveau 2, puis
  **× 1,25 par niveau** au lieu de × 1,5 : 27 033 XP cumulés pour le niveau 20, 254 786 pour le niveau 30 (25,6 millions
  avant, hors de portée). Les héros existants gardent leur XP ; leur seuil est recalculé à leur niveau actuel (migration
  `0029_age_rallies_indexes`).

## Quêtes et tutoriel (26 octobre 2026)

Façon Travian : un tutoriel guide les premières heures, des tâches suivent la progression, et des quêtes du jour et de
la semaine aident un peu les joueurs actifs, sans déséquilibrer la partie. Catalogue `data/quests.json` (se modifie sans
code), moteur `src/services/questService.js`, routes `/api/quests`, client `frontend/js/app/09e-quests.js`.

- **Accès** : bouton flottant « Quêtes » au-dessus de la barre du bas, avec une pastille quand une récompense est à
  prendre ; panneau à onglets Tutoriel, Tâches, Du jour, Semaine, Succès.
- **Récompenses : ressources seules**, livrées dans la ville affichée, si son entrepôt et son grenier ont la place
  (sinon refus, avec le conseil de dépenser, d'agrandir ou de choisir une autre ville). Une récompense ne se prend qu'une
  fois (table `QuestClaim`). Les récompenses calculées sur la production (quêtes du jour, de la semaine, succès) sont
  **plafonnées à la moitié du plus grand dépôt (du plus grand silo pour la nourriture)** du joueur, pour rester livrables
  dans une seule ville (30 octobre 2026) ; ce plafond ne compte que le Dépôt et le Silo, pas le Grand dépôt ni le Grand silo
  (recommandation 12 : 80 000 par ressource au plus, comme avant la décision D1).
- **Tutoriel** (16 étapes, dans l'ordre) : bûcheron, carrière, mine de fer, ferme, un champ niveau 2, Bâtiment principal
  2, entrepôt, grenier, Place de rassemblement, Bâtiment principal 3, caserne, 5 soldats, une armée, une tribu battue, une
  expédition, l'Ambassade. Bandeau de l'étape en cours au-dessus de la barre du bas (masquable) ; **« Aller »** ouvre le
  bon écran et **un doigt** (anneau doré et flèche) montre où toucher, puis le bouton du panneau qui s'ouvre ;
  « Récupérer » quand l'étape est faite. Passable à tout moment (`Player.tutorialDone`). Récompenses de 150 à 300 par
  ressource, toujours sous l'entrepôt de départ.
- **Tâches de progression** (21 familles, paliers) : tous les champs d'un type au niveau 1, 2, 3… 20 ; Bâtiment
  principal, entrepôt, grenier, Place de rassemblement, caserne, académie, mur, ambassade, marché, tente de soins, manoir
  du héros ; population, soldats recrutés, niveaux de technologie, niveau du héros, nombre de villes, entrée dans une
  alliance. Un palier visible à la fois par famille, le suivant après la récompense. Récompense d'un palier de bâtiment :
  la moitié de son coût (un champ entier pour les champs) ; autres familles : proportionnelle au palier.
- **Quêtes du jour** : 4 tirées chaque jour pour chaque joueur parmi 9 (constructions, recrutement, combat gagné, tribu,
  expédition, aides d'alliance, recherche, récolte, convoi — seulement celles que le joueur peut faire), + un bonus quand
  toutes sont prises. Récompense : **une demi-heure de production de ses villes** par quête (150 au moins), une heure pour
  le bonus. Nouvelles quêtes à minuit, heure de Paris. Une quête prise **reste dans la liste** (cochée) jusqu'au tirage
  suivant : une autre quête remplie entre-temps ne la remplace pas, et la liste ne donne jamais plus de récompenses que de
  places (même règle pour la semaine).
- **Quêtes de la semaine** : 3 tirées chaque lundi, objectifs plus gros ; 1 h 30 de production par quête (500 au moins),
  2 h pour le bonus.
- **Succès** : attaques et défenses gagnées, raids, ennemis vaincus, constructions, aides d'alliance, expéditions,
  ressources récoltées, par paliers ; 1, 2, 4, 8 puis 12 h de production selon le palier.
- **Équilibre** : un joueur qui fait tout chaque jour gagne environ 3 h de production par jour (≈ +12 %), et environ 6 h
  de plus par semaine ; le tutoriel et les tâches financent surtout le palier suivant.
- **Avancement** lu dans l'état du jeu (bâtiments de la capitale, population, technologies, héros, villes, alliance), les
  rapports de bataille (victoires, tribus) et des compteurs d'actions (`QuestCounter`, par jour et au total) que le jeu
  incrémente : constructions terminées, soldats recrutés, recherches, expéditions lancées et terminées, ressources
  récoltées, convois envoyés, aides d'alliance. Compteurs journaliers gardés 14 jours.

## Scène de la ville

Refaite en octobre 2026 d'après les captures de Rise of Kingdoms fournies : **une seule scène** où tout tient dans l'enceinte.

- Grille isométrique 2:1 : Bâtiment principal au centre (sprite 1,35 ×, plaza pavée autour), les emplacements de bâtiments sur deux anneaux, les 18 champs sur un troisième anneau le long des murs (bûcherons au fond à droite, carrières à droite, mines à gauche, fermes devant). Les numéros d'emplacement et l'API ne changent pas (champs = 101-118 côté serveur ; `citySlots` porte désormais ces numéros). **Deux plans depuis le 31 octobre 2026** (`ISO_PLANS` dans `04b-iso-scene.js`) : la capitale dessine 18 parcelles, une colonie ou la Ville Merveille 12, avec une enceinte et une place plus petites ; pas de parcelle vide en trop (des bosquets prennent les cellules libres) ; la caméra cadre toutes les villes de la même façon, si bien qu'une colonie paraît plus petite.
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

**Conformes aux données, niveaux 1 à 20** (revue des bâtiments du 31 octobre 2026 comprise, `docs/BATIMENTS-ROLES.md`) : Bâtiment principal (20 au plus partout, −2,5 %/niv. de temps de construction), production des champs (courbe 10 → 350 → 4 500/h), stockage Silo/Dépôt (1 200 → 160 000), Moulin/Boulangerie/Scierie/Tailleur/Fonderie (+2,5 %/niv., 5 niveaux : bonus divisé par deux le 31 octobre 2026), Place de rassemblement (1 → 5 armées en campagne ; rassemblements de 5 + niveau armées), Caserne/Écurie (paliers 7 et 15, −0,5 %/niv. : GDD gardé, décision du 30 octobre 2026, D2), Atelier (siège dès 5, −4 %/niv.), Académie (−1 %/niv.), Forge (+0,5 %/niv. d'attaque et de défense, dans tous les combats), Cachette (quantité fixe de chaque ressource : 240 au niveau 1 → 32 000 au niveau 20, Gaule × 1,2), Tente de soins (30 % + 3 %/niv., max 70 %), Mur (+1 %/niv., 1 000 PV/niv. ; seuls les engins l'abîment ; ses PV remontent avec les vies de la ville, en 48 h), Grand Silo/Grand Dépôt (**stockage** : 3 fois un silo ou un dépôt de même niveau, 3 600 → 480 000, ajoutés à la capacité de la ville ; plus aucune réserve protégée, seule la cachette protège : décision du 30 octobre 2026, D1), Mur des colonies (15 au plus), Ambassade (rejoindre 5, fonder 7 ; alliance du chef : 3 membres par niveau, 60 au plus), Chambre au trésor (10 → 200 or/jour ; l'or ne se pille pas), Tour de guet (attaquant niv. 10, effectifs niv. 15 ; espions niv. 5 et 10 ; alerte des espions ennemis niv. 5, 10, 15 ; vision des armées à 5 + 6 cases par niveau), Résidence (−0,25 %/niv.), Marché (capitale ; 1 marchand par niveau ; taxe du marchand du serveur 30 % −1/niv., min 5 % ; armées de transport +5 %/niv.), Comptoir (capitale ; taxe des échanges −1 point/niv., charge des marchands et des transports +1 %/niv.), Grandes caserne et écurie (−4 %/niv. dans la colonie, −0,5 %/niv. dans la capitale, niveaux additionnés), Irrigation égyptienne (production +1 %/niv., marche +0,5 %/niv.), Poste du Désert (charge des marchands, transports et récoltes +1 %/niv., entretien −0,5 %/niv.), les six bâtiments de faction (soins, défense, blessés, production, entretien).

**Douves** : supprimées du jeu le 30 octobre 2026 (données, combat, rapports, client, outils ; migration `0030_placement_moat`).

**Placement** (30 octobre 2026 ; Marché et Comptoir dans la capitale le 31 octobre 2026) : capitale seulement, colonies
seulement ou partout, selon le tableau de la section « Économie, placement et stock partagé » ; les effets d'un bâtiment de
la capitale valent pour toutes les villes du joueur.

**Capacité de stockage** (`calculations.cityStorageCaps`) : somme des dépôts et grands dépôts (bois, pierre, fer), somme des
silos et grands silos (nourriture), 1 000 au moins ; recalculée à chaque construction terminée d'un de ces quatre bâtiments et
au démarrage du serveur. Une colonie : Dépôt 20 + Grand Dépôt 20 = 160 000 + 480 000 = 640 000 ; la capitale n'a plus de
Grand dépôt (bâtiment des colonies), mais les dépenses puisent dans le stock de toutes les villes : c'est le stockage réuni
qui doit tenir un gros prix (Chambre au Trésor 20 : 313 604 de bois). Les plafonds des récompenses de quêtes et des routes
commerciales ne comptent que le Dépôt et le Silo (recommandation 12).

**File de construction** (30 octobre 2026) : deux niveaux d'un même bâtiment (même emplacement) ne sont jamais en chantier en
même temps ; le niveau suivant attend la fin du précédent, même si une file est libre.

**Écarts constatés** :

| Bâtiment | Constat | Conséquence |
|---|---|---|
| Bâtiment principal 21-30 | Les niveaux 25 à 30 n'apportaient plus rien (réductions de construction plafonnées à 60 % dès le niveau 24) | Réglé le 31 octobre 2026 : le Bâtiment principal s'arrête au niveau 20 partout (migration `0032_batiments`) |
| Domus du héros | Réglé le 27 octobre 2026 : le héros tombe au combat et ressuscite au Domus de la capitale (24 h, −2 % par niveau du Domus) | Voir la section Héros |
| Grande Caserne / Grande Écurie | Bâtiments des colonies : la file de recrutement de la colonie (clé Caserne / Écurie), −4 %/niv. de temps (cumul plafonné à 60 %) ; les recrues rejoignent la garnison de la capitale (30 octobre 2026) | Textes corrigés ; panneau de recrutement ouvert depuis le bâtiment |
| Comptoir / Marché | Le bonus de capacité (Marché 5 %/niv. + Comptoir 1 %/niv.) s'appliquait ensemble aux convois marchands et au transport par armée | Depuis le 31 octobre 2026 : les marchands portent une charge par civilisation, + Comptoir et Poste du Désert de la capitale ; le transport par armée garde Marché + Comptoir + Poste du Désert ; jamais le butin des raids |
| Bonus égyptien « santé des murs » | Portait sur le bonus de défense du mur au lieu des points de vie | Corrigé : points de vie du mur (1 250 PV par niveau pour l'Égypte avec le bonus à +25 %, dès la construction ; ils remontent avec les vies de la ville), voir `docs/EQUILIBRAGE.md` |
| Bonus de civilisation | Relevés de 5 points en octobre 2026 à la demande (Rome −15 % pertes en siège et +10 % défense, Gaule +15 % cachette et +20 % défense chez soi, Grèce −15 % temps de construction et +15 % blessés, Égypte +15 % transport et +25 % PV des murs, Huns +20 % vitesse et +10 % attaque en siège, Sultanat +25 % dégâts des engins et +15 % attaque en défense) puis défense gauloise chez soi portée à 20 % et transport égyptien à 20 % ; le 30 octobre 2026, le bonus des engins du Sultanat est vérifié actif (chaque engin porte le bonus de sa civilisation) et la défense gauloise chez soi protège aussi son mur ; le 31 octobre 2026, la cachette gauloise devient un multiplicateur de la quantité cachée, × 1,2 (`hideoutCapacity` 20) | Mesures refaites sur le moteur actuel dans `docs/EQUILIBRAGE.md` § 7 : Sultanat meilleur défenseur, Rome meilleure attaquante ; textes client lus depuis les données |
| Paliers d'unités (coefficients de combat) | L'élite (×1,21) rapportait moins de puissance par ressource et par céréale d'entretien que l'unité de base : aucune raison de la former | Réglé (octobre 2026) : coefficients de puissance 1,0 / 1,25 / 1,55 côté serveur, client et fiches ; depuis le 30 octobre 2026 (D10), la bataille utilise ceux du GDD (1 / 1,35 / 1,9) avec la solidité, et chaque palier vaut à peu près son prix ; voir `docs/EQUILIBRAGE.md` § 2 |
| Tour de guet | Les alertes d'attaque sont visibles dès le niveau 0 (la donnée `alertArmyIncomingLevel` 5 n'est pas appliquée) | Plus généreux que prévu ; à décider |
| Placement capitale / colonie (`capitalOnly`, `notInCapital`) | Tableau complet du 30 octobre 2026 (section « Économie, placement et stock partagé ») : refus serveur (« Bâtiment réservé à la capitale / aux villes secondaires ») et mention dans la liste de construction ; prérequis d'une colonie sur un bâtiment réservé lus dans la capitale ; effets des bâtiments de la capitale pour tout le joueur | Voir aussi « Villes secondaires » |
| Mur : palier visuel et palier de ville | Depuis octobre 2026 le palier (Village / Ville / Ville Fortifiée) et l'enceinte dessinée suivent le Bâtiment principal (10 et 20), plus le niveau du Mur ; le minimum d'engins par palier a été supprimé le 25 octobre 2026 (1 engin suffit) | Le Mur garde son bonus et ses points de vie, que seuls les engins abîment (30 octobre 2026) ; `docs/EQUILIBRAGE.md` § 11 et 12 |
| Résidence (colons) | En place depuis octobre 2026 (colons, fondation, bonus de colonie) | Voir la section « Villes secondaires » |
| Irrigation (vitesse de marche), Poste du Désert (taxe entre villes), Comptoir (`p2pTax`) | En place : la taxe des échanges du Comptoir depuis le marché du 27 octobre 2026 ; la vitesse de marche de l'Irrigation depuis le 30 octobre 2026, dans tous les trajets d'armées partis de la ville (armées, retours, espions, ravitaillement du Bastion) et dans l'estimation du client ; les marchands (31 octobre 2026) marchent à la vitesse de leur civilisation, sans l'Irrigation. La « taxe entre villes » du Poste du Désert n'existe plus dans les données : les envois entre ses propres villes restent sans taxe | Voir `docs/BACKLOG.md` |

## Villes secondaires : le rôle des colonies (décisions des 30 et 31 octobre 2026)

La **capitale est la tête** (armée, recherche, héros, alliance, or) ; les **colonies font tourner l'économie et nourrissent
l'armée**. Les réponses du propriétaire au questionnaire sur les colonies sont en tête de `docs/RAPPORT-COLONIES.md` (seules
elles comptent, l'étude proposait davantage) ; les chiffres à régler plus tard sont dans `docs/EQUILIBRAGE.md` § 15. Base du
GDD : `data/buildings.json` RESIDENCE, `GDD_MASTER/systems/resource_points.json` `FOUND_SECONDARY_CITY`.

**Fonder une colonie**
- **Colons** : la Résidence, réservée à la capitale (Bâtiment principal 5), forme des colons gratuits en 3 h
  (`POST /api/city/:id/settlers`) : **1 colon au niveau 10, 2 au niveau 20** ; **2 colonies au plus** depuis le 31 octobre
  2026 (`config.city.maxSecondaryCities`, `RESIDENCE.effects.unlockSettlerL10/L15/L20` ; 3 avant). Chaque colon vaut une
  colonie (villes existantes + colons prêts + colons en route + colons en formation ≤ places). Le colon attend dans la
  capitale (`City.settlers`), onglet « Colons » de la Résidence. La **Ville Merveille ne compte pas** dans ces places (hors
  quota, décision du 28 octobre 2026, à la formation comme à la fondation) ; quand toutes les places sont prises par des
  colonies fondées et qu'aucun colon n'attend, la Résidence forme **un colon de plus** pour la Ville Merveille, si le joueur
  n'en a pas encore.
- **Choisir le site** : filtre **« Sites libres »** de la carte (`GET /api/map/free-sites?limit=`, 100 au plus, gardé 15 s
  par joueur) : les gisements de bois, de pierre, de fer ou de céréales où l'on peut fonder (ni or, ni plan, ni donjon, ni
  site de Merveille ; ni ville, ni armée, ni colon en route ; la place d'une ville 2 × 2), du plus proche au plus lointain
  de la capitale, avec `{ id, x, y, type, level, bonusPct, travelSec, tribePower, central }`. Le temps de marche est en ligne
  droite, affiché « au moins » (le vrai trajet contourne le relief et l'eau) ; `central` signale le cercle du centre,
  disputé (`config.map.centerRadiusPct` = 35 % de la demi-carte, le même cercle que le semis des gisements de niveau 3).
  Filtres par ressource et niveau ; une tribu se chasse avant de fonder. La bulle d'un gisement et le panneau de fondation
  donnent aussi la spécialité qu'il apporterait (bonus sur sa ressource, baisse sur les trois autres).
- **Fondation** (`POST /api/army/:id/found-city { resourceNodeId, name }`) : une armée de la capitale (unités obligatoires)
  emmène un colon et 3 000 de chaque ressource, pris dans toutes les villes du joueur (la capitale d'abord), vers un point
  libre. À l'arrivée le point est réservé (`FOUNDING`, 24 h) ; la ville naît ensuite sur la case du point avec son
  Bâtiment principal niveau 1 et les 3 000 de chaque ressource (gardés même au-dessus du Dépôt de 1 000 : une ville qui
  reçoit ne baisse jamais), **sans garnison** (plus de ligne « Garnison » vide depuis le 30 octobre 2026), et l'armée rentre.
  Pas de champs, de Dépôt ni de Silo offerts (refusé). Si le point n'est plus libre à l'arrivée, l'armée rentre avec le colon
  et les ressources.
- **Vulnérabilité** : pendant les 24 h, l'armée fondatrice tient le point comme une récolteuse et peut être attaquée ;
  battue, elle rentre **sans le colon** (règle `settlerVulnerable`). Un rappel volontaire ramène le colon et les ressources.
- **Le point sous la ville** garde `cityId`, disparaît de la carte, des sites libres et des tirages (récolte,
  régénération, tribus) ; il redevient libre, tribu comprise, quand la ville disparaît (colonie rasée, compte supprimé).

**Ce qu'une colonie apporte**
- **Production : la spécialité du gisement** (décision 1 du 30 octobre 2026, revue le 31 octobre) : **+10 % par niveau du
  gisement** (1 à 3) sur **sa ressource** (`RESIDENCE.effects.colonyNodeBonusPctPerNodeLevel`) et **−30 % sur les trois
  autres** (`RESIDENCE.effects.colonyOtherResourcesPct`), ajoutés aux bâtiments de production de chaque ressource (Scierie,
  Tailleur de pierre, Fonderie, Moulin + Boulangerie). Le bonus de toutes les colonies est à 0 depuis le 31 octobre 2026
  (`RESIDENCE.effects.secondaryCityBonusPct` ; avant : +20 % sur tout, et +15 % par niveau du gisement le 30 octobre). Ni la
  capitale ni la Ville Merveille n'ont de gisement. Un seul calcul, `resourceProcessor.productionSql` (tick, bilan de
  nourriture, alerte « dépôt plein ») ; `GET /api/cities` donne `site: { type, level, bonusPct, otherPct }` (null pour la
  capitale et la Ville Merveille), repris par le badge du gisement dans la ville, la ligne du gisement sur les champs et
  l'aperçu de production du client. Le joueur choisit donc son gisement selon la ressource qui lui manque.
- **Grenier de l'armée et stockage** : le Moulin et la Boulangerie n'existent qu'en colonie ; chaque colonie ajoute son
  Dépôt, son Silo et ses Grands dépôt et silo à la capacité du joueur (un gros prix ne passe que si le stockage de toutes
  ses villes le tient). Son stock reste à elle (pillage, raids, marché, transports) mais paie aussi les constructions,
  recrutements, recherches, soins, héros et fondations de toutes les villes, et son grenier nourrit toutes les troupes.
- **Formation rapide** : la Grande caserne et la Grande écurie (colonies seulement ; prérequis Caserne 20 / Écurie 20 lus
  dans la capitale) forment pour le joueur. **Le palier des unités se lit sur le bâtiment de la colonie** (niveaux 1 / 7 /
  15, `unlockBaseTier` / `unlockIntermediateTier` / `unlockEliteTier` de ses données), jamais sur la Caserne de la capitale
  (décision 7) ; le temps aussi (−4 % par niveau) ; jamais d'engins de siège hors de la capitale. **Toutes les unités
  formées arrivent dans la garnison de la capitale.** On recrute pour une colonie depuis la capitale : « **Lieu de
  formation** » dans la Caserne et l'Écurie de la capitale (la capitale, puis chaque colonie avec sa Grande caserne ou sa
  Grande écurie, dans l'ordre de fondation), ou en touchant la Grande caserne / Grande écurie de la colonie (« Recruter ») :
  même route, `POST /api/city/<id de la colonie>/recruit`. Un lot lancé ainsi s'annule depuis le panneau de la capitale.
  **Pas de relance automatique** des lots.
- **Grandes casernes et Grandes écuries pour la capitale** (décision du 31 octobre 2026) : les niveaux de toutes les Grandes
  casernes du joueur s'additionnent et accélèrent la formation de l'infanterie et des archers **dans la Caserne de la
  capitale** (−0,5 % par niveau, `capitalTrainTimeReductionPctPerLevel` ; 2 Grandes casernes 20 : −20 %) ; les Grandes
  écuries font de même pour la cavalerie dans l'Écurie de la capitale ; le tout dans le plafond général de 60 % ; pas pour
  les engins. (Le Comptoir de commerce n'est plus un bâtiment des colonies depuis le 31 octobre 2026 : « Marché et
  commerce ».)

**Ce qu'une colonie n'a pas**
- **Pas de garnison propre** (§ 1 bis) : de nouvelles unités n'y arrivent jamais seules (formées ou soignées, elles vont à
  la capitale) ; une colonie n'est défendue que par les armées qu'on y envoie et les renforts alliés. Une armée rattachée à
  une colonie peut se créer (la Place de rassemblement de la capitale fixe le nombre d'armées de chaque ville) mais pas se
  remplir (refus clair) ; vide, on peut la dissoudre.
- **Bâtiments de la capitale** : Place de rassemblement, Place du marché, Comptoir de commerce, Académie, Tente de soins,
  Tour de guet, Caserne, Écurie, Atelier, Forge, Ambassade, Chambre au Trésor, Domus, Résidence, bâtiment de la
  civilisation. Leurs effets valent dans toutes les villes ; dans la liste de construction d'une colonie, ces lignes sont
  repliées en une seule (« Bâtiments de la capitale : leurs effets valent aussi ici »).
- **Défense** : **2 vies** (Égypte 3), contre 4 (5) pour une capitale ; **Mur 15 au plus** (décision du 31 octobre 2026,
  `WALL.effects.colonyMaxLevel` ; refus « Le Mur d'une colonie ne dépasse pas le niveau 15 » ; la Ville Merveille suit la
  colonie) ; ni vie en plus, ni Fort (décision 3) ; une colonie tombée est rasée. Raids, pillage, siège et cachette restent
  propres à chaque ville.
- **Refusé** (décisions 2 à 5) : bâtiment de faction de colonie, ordres groupés par type de champ, gouverneur automatique ;
  idées gardées pour plus tard dans `docs/BACKLOG.md`.

**Emplacements et Mur sur l'enceinte** (décision 6)
- Bâtiment principal sur l'emplacement 0, 18 champs sur 101-118, **Mur sur l'enceinte** à sa place fixe, l'emplacement 20
  (`config.city.wallSlot`, donné au client par `GET /api/player/me` → `economy.city`), et un anneau à la taille de la ville
  depuis le 31 octobre 2026 : **18 emplacements dans la capitale, 12 dans une colonie** (`config.city.ringSlots`), autant
  que de bâtiments possibles, sans emplacement libre (19 pour toutes les villes avant). Le serveur place le Mur sur l'emplacement 20
  quel que soit l'emplacement envoyé et refuse tout autre bâtiment sur cet emplacement ; le client construit et ouvre le Mur
  en touchant l'enceinte (dessinée selon le Bâtiment principal et le niveau du Mur), la liste d'un emplacement ne le propose
  plus. La migration `0031_colonies` a passé les Murs et les chantiers de Mur sur l'emplacement 20 (un bâtiment qui s'y
  trouvait a rejoint un emplacement libre de l'anneau).

**Aide au suivi, sans changer les règles** (« éviter la micro-gestion »)
- **Vue « Mes villes »** : une ligne par ville (capitale d'abord, puis l'ordre de fondation) : gisement, 4 stocks avec
  « plein dans X h », file de construction avec « File vide » en rouge, recrutement, armées stationnées, vies, attaque ou
  siège en approche ; en tête, les totaux du joueur et le bilan de nourriture commun. Tout vient de `GET /api/cities`, qui
  rend les villes dans cet ordre fixe.
- **Alertes** (notification dans le jeu, et sur le téléphone si les notifications sont activées) : « **File de construction
  vide à [ville]** » quand le dernier chantier d'une ville se termine (une par ville toutes les 6 h au plus,
  `config.city.idleAlertHours`, `City.idleAlertAt`) ; « **[ville] : dépôt plein dans 1 h** » quand une ressource atteindra
  son plafond dans moins de `config.city.storageAlertLeadHours` heure (une par ville toutes les 12 h au plus,
  `config.city.storageAlertHours`, `City.storageAlertAt` ; une ressource déjà pleine ne prévient plus, et un Silo plein
  que l'entretien garde juste sous son plafond compte comme plein) ; **famine 12 h à l'avance** sur le total du joueur
  (« Entretien et famine »). Le téléphone ne reçoit qu'une notification d'un même type par minute et par joueur ; le fil du
  jeu les garde toutes.
- **Ordre de prélèvement** (décision 8) : après la ville de l'action, la ville la plus pleine par rapport à son plafond
  paie d'abord, pour les dépenses et pour le manque d'entretien (« Économie, placement et stock partagé »).

**Niveaux, paliers et murailles**
- Le Bâtiment principal s'arrête au **niveau 20 partout**, capitale comprise (décision du 31 octobre 2026, `MAIN_HALL.maxLevel` ;
  avant, la capitale montait à 30) ; comme il plafonne tous les autres bâtiments, aucune ville ne dépasse 20. Le Mur d'une
  colonie s'arrête à 15. La revue des autres niveaux maximum reste à faire pendant l'équilibrage (`docs/BACKLOG.md`).
- Le palier Village / Ville / Ville Fortifiée et l'aspect de l'enceinte suivent le **niveau du Bâtiment principal** (1-9,
  10-19, 20+ ; `config.cityTiers`), plus le niveau du Mur. Le palier ne fixe plus le minimum d'engins de l'attaquant (1 engin
  suffit). Le Mur garde son rôle défensif (bonus, points de vie que seuls les engins abattent).

**Migration `0031_colonies`** (idempotente, sans remboursement : le monde n'est pas encore ouvert) : colonnes des alertes,
Murs sur l'emplacement 20 ; et ménage après la migration `0030` (Académie et Tente de soins réservées à la capitale) : les
recherches lancées depuis une colonie sont retirées avec les niveaux suivants de la même technologie (la recherche suivante
du joueur démarre au tick), les soins en cours dans une colonie s'arrêtent (ses blessés repassent en attente d'un soin, à
relancer depuis la Tente de la capitale).

**Interface** : onglet « Colons » (places, colons prêts / en route / en formation, file, formation), « Sites libres » sur
la carte, bouton « Fonder une ville » dans la bulle d'un point libre (choix de l'armée, nom, bonus du gisement), statut
« Fondation » et nombre de colons sur la carte d'armée, « Ville en fondation par … » dans la bulle du point, badge du
gisement dans la ville, vue « Mes villes », sélecteur de villes. Icône du colon à produire (`ui/settler`, guide § S9) ;
cortège, campement de fondation, colonie et portrait du colon : guide § S12. Les sprites de chantier par civilisation
(`docs/GRAPHISMES-MANQUANTS.md` § 1) sont branchés dans la scène de ville.

**Limites** : 2 colonies au plus (plus la Ville Merveille) ; pas de déplacement volontaire de la capitale ni de conquête
de colonie (`docs/BACKLOG.md`). Gisements : environ 3 300 ont la place d'une ville à l'ouverture d'un monde, pour 2 000
joueurs qui en voudraient 4 000 (analyse dans `docs/BACKLOG.md`).

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
