# État des systèmes de jeu (octobre 2026)

Ce qui existe, ce qui manque, et les images ou animations à produire. Référence : Travian pour les mécaniques, Rise of Kingdoms pour la lisibilité et le mouvement.

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
| Bataille round par round (triangle des classes, mur, douves, Forge, Brasserie, héros, équipement), raids plafonnés à 30 % de la capacité, cachette, stockage protégé, un raid par cible et par jour ; **siège qui dure** (section suivante) | (le renfort allié est en place depuis le 26 octobre 2026 : section Diplomatie et alliance) |
| Rapports : deux exemplaires (attaquant, défenseur), **tableau avant → après par unité**, bandeau de synthèse (pertes des deux côtés, butin, PV de mur, rounds), replay 2.5D | Rapport d'arrivée de transport |
| Espionnage par espions dédiés (section Espionnage et vision, 26 octobre 2026) | Espions dessinés en marche sur la carte (image `map/units/spy` à produire) |
| Alertes d'attaque : compte à rebours ; attaquant révélé par la Tour de guet niveau 10, effectifs niveau 15 | Son/notification native à l'arrivée (push existe pour « attaque en approche ») |

## Espionnage et vision (26 octobre 2026)

Façon Travian et GDD (`espionage_config`) : `src/services/spyService.js`, routes `/api/spies`, client
`frontend/js/app/09f-spies.js`, vision dans `src/routes/map.js` (`viewFor`).

- **Espions dédiés** : 2 au plus par compte, le 1er avec une Tour de guet niveau 5 (20 or), le 2e niveau 10 (200 or),
  prêts tout de suite (onglet Armée → Espions, ou bulle de la Tour de guet). **Les armées n'espionnent plus.**
- **Missions** depuis la carte (« Espionner » sur une ville ou un point), au choix pour une ville :
  - **Ressources et troupes** : les troupes présentes (garnison, armées en ville, renforts alliés) et **les ressources
    qu'un pillage pourrait prendre** (hors cachette et réserves protégées), à la centaine près ; pas les bâtiments ;
  - **Défenses et troupes** : les troupes, le mur (niveau, points de vie, santé de la muraille), les douves, la Tour de
    guet, la cachette (part cachée) et le bonus de défense.
  - **Point de ressource** : stock exact, tribu (unités, puissance) ou armées qui récoltent ; le point garde son stock
    exact et ses occupants affichés pour l'espion pendant 1 h.
- **Toujours réussi** : l'espion part de la ville choisie (vitesse 80, même chemin que les armées), le rapport est écrit
  à son arrivée, puis il rentre (même durée) ; il peut être rappelé en route. **Plus d'interception.**
- **La ville espionnée est prévenue** selon sa Tour de guet : niveau 5 « un espion est venu », niveau 10 l'heure,
  niveau 15 qui (et la mission) ; rapport « Espion repéré » et notification.
- **Vision de la carte** : les villes, les points et le relief se voient partout ; **les armées des autres ne se voient
  que si elles vont vers (ou campent devant) une ville à soi ou à son alliance** ; ses armées et celles de son alliance
  toujours. Qui récolte un point ne se voit que pour soi et son alliance, ou après l'avoir espionné (sinon « occupé ») ;
  le stock d'un point reste montré par quarts sans espion.

## Siège (refonte du 25 octobre 2026)

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
  normalement. Un engin frappe le mur avec toute sa force, un soldat avec un dixième (`wallShield`) : **un engin frappe le
  mur environ 10 fois plus fort qu'un soldat**. Le bonus de défense du mur (+1 % par niveau) baisse avec ses PV. Mur à 0 :
  les coups touchent les soldats. Si le mur tient jusqu'à la fin du combat (15 rounds), la ville gagne. Après le combat,
  l'armée rentre chez elle.
  - Simulation (Rome contre 600 fantassins et 300 archers gaulois) : contre un mur niveau 20 intact, 1 000 soldats avec
    20 engins ne passent pas ; avec 100 engins le mur tombe au 10e round ; 3 000 soldats et 50 engins percent au 6e round
    et gagnent. Un mur qui a perdu la moitié de ses vies tombe deux fois plus vite.
- **Victoire de l'attaquant** : il pille **25 % du stock non protégé** (au-dessus des grands entrepôts et de la cachette),
  dans la limite de ce que ses armées portent ; ce qu'elles ne portent pas reste à la ville. La ville perd **une vie**.
- **Les vies** (`City.wallStructure` = part des vies restantes) : **4 pour une capitale, 2 pour une ville secondaire, une
  de plus pour une ville égyptienne (5 et 3)**. Chaque vie perdue ôte **la même part des PV du mur** (25 % pour une
  capitale, 50 % pour une colonie…). Les vies, et les PV du mur avec elles, remontent toutes en **48 h**. La fumée sur la
  carte suit les vies perdues.
- **Chute, à la dernière vie** :
  - **ville secondaire détruite** : troupes présentes perdues, héros enfui vers la capitale, armées en mission rattachées à
    la capitale, offres du marché rendues à la capitale, recherches et files perdues, le point de ressource redevient libre ;
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
| Alliances sur invitation, rôles (chef, officier, membre), promotion, exclusion, transfert de direction, dissolution ; Ambassade requise (rejoindre niv. 5, fonder niv. 7) | Sortie de la garnison du Bastion contre le camp ennemi (briser le siège) |
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
  points), **+5 % de vitesse** des armées (aller et retour), **+10 % de capacité de transport** (convois, commerce,
  pillage, butin).
- **Garnison** : les membres et les alliés y postent leurs armées (+10 % de défense) et les rappellent quand ils
  veulent ; l'entretien reste payé par leur ville. **Aucune troupe n'entre pendant un siège.** Une garnison dont le
  joueur n'est plus membre ni allié rentre seule.
- **Siège et chute** (« comme une ville, en plus dur ») : il faut au moins un engin de siège ; toute l'alliance est
  prévenue de la marche. **Camp d'1 h**, puis assaut contre la garnison derrière un **mur bouclier 50 fois plus solide
  qu'un mur 20** ; chaque assaut gagné lui ôte **une vie sur 10**, les vies remontent en **72 h**. À la dernière, il est
  **rasé** : plus de bonus, garnison renvoyée, **7 jours** avant d'en rebâtir un. Rapports de bataille pour chaque camp.
- **Carte** : le Bastion se dessine comme une forteresse 2 × 2 (image peinte `map/cities/bastion`, chantier
  `bastion_site`, en attendant la forteresse de la civilisation du chef), plaque « Bastion [TAG] » aux couleurs de la
  diplomatie, barre de vies, marque de siège ; les armées qui marchent sur un Bastion de son alliance se voient.

## Marché et commerce (27 octobre 2026)

Décisions du 27 octobre 2026 (GDD `economy_config.market`, `src/routes/market.js`, `src/services/marketService.js`,
client `frontend/js/app/11-market.js` et `11b-market-trade.js`) :

- **Échanges entre joueurs livrés par armées de transport** (GDD strict) : en publiant une offre, le vendeur choisit
  une armée libre de la ville qui peut porter les marchandises ; elle **attend en ville** avec elles (statut « Offre du
  marché » : elle ne part pas, ne se modifie pas, ne défend pas). À l'acceptation, l'acheteur choisit une armée de sa
  ville qui porte la contrepartie ; **les deux armées partent**, chacune à sa vitesse, livrent à l'arrivée puis
  rentrent. Le vendeur est prévenu de l'acceptation, chacun de la livraison. Pas d'échange avec un ennemi ; aucun convoi
  n'entre ni ne sort d'une ville assiégée (on peut publier pendant un siège, pas conclure).
- **Taxe des échanges** (GDD) : **10 %** de ce que transporte chaque convoi, **−1 % par niveau du Comptoir de
  Commerce** de la ville qui envoie, **−0,25 % par niveau de la Chambre au Trésor** de sa capitale (au plus bas 0 %).
- **Offres de 48 h** : une offre non prise revient au vendeur (marchandises dans la ville, armée libre), il est prévenu.
  Annuler une offre fait de même ; la chute ou le déplacement de la ville aussi.
- **Routes commerciales entre ses villes** (Marché → Routes) : ville de départ (avec un Marché), ville d'arrivée,
  ressources ; toutes les **2 h** un convoi part, sans armée, avec **1/12 du stockage** de la ville de départ pour
  chaque ressource choisie, soit **100 % au plus en 24 h** (le GDD disait 30 % en 12 h). Il voyage à vitesse fixe ; ce
  qui ne tient pas dans l'entrepôt d'arrivée revient. Rien ne part d'une ville assiégée ni n'y entre. 10 routes au
  plus, pause et suppression à volonté.
- Le marchand du serveur (PNJ) est inchangé : taxe de 30 %, −1 % par niveau du Marché (GDD).

## Classements et médailles (27 octobre 2026)

Décisions du 27 octobre 2026 (GDD `world_config.server.rankings`, `src/services/rankingService.js`,
`src/routes/ranking.js`, client `frontend/js/app/09h-ranking.js`) :

- **Points de combat façon Travian** : un ennemi tué vaut son entretien en nourriture (5 de base, 10 intermédiaire,
  15 élite et siège, GDD). L'attaquant gagne des points d'attaque, le défenseur des points de défense, partagés entre les
  joueurs d'un même camp selon les soldats engagés. Comptent : attaques et raids de villes, sièges, Bastions, combats sur
  les points et en terrain ouvert ; une tribu tuée donne des points d'attaque (comme les animaux d'une oasis Travian).
  **Pillage** : ressources prises aux autres joueurs (raids, pillage de siège).
- **Classement des joueurs** par population, attaque, défense ou pillage, 50 par page, avec **son propre rang**
  (« Voir ma place »). **Alliances** par population, attaque ou défense (somme des membres), avec le rang de la sienne.
- **Semaine** (lundi 0 h, heure de Paris) : top 10 en attaque, défense, pillage et progression de population ; top 3 des
  alliances en attaque et en défense ; ses propres chiffres de la semaine. Au lundi, la semaine close donne une
  **médaille honorifique** (or, argent, bronze, puis rang) à chaque classé, prévenu par une notification ; les médailles
  restent sur le profil public (avec les points d'attaque, de défense et le pillage) et dans l'onglet Médailles.

## Entretien et famine (28 octobre 2026)

Décisions du 28 octobre 2026 (`src/game/processors/resourceProcessor.js` : `foodBalanceSql`, `processUpkeep`) :

- **Entretien** : 5 (base), 10 (intermédiaire), 15 (élite, siège) de nourriture par unité et par heure (GDD), pour
  **toutes les armées que la ville nourrit** (en ville, en mission, en renfort chez un allié, en garnison de Bastion),
  moins les réductions des bâtiments de faction (Tente du chef de guerre hun, Avant-poste du désert) et de la technologie
  Intendance, 50 % au plus.
- **Siège** (GDD `upkeep.siegeModifiersPct`) : une armée qui campe devant une ville coûte **+10 %** ; les armées à
  l'arrêt dans leur ville assiégée coûtent **−10 %**.
- **Famine façon Travian** : quand le grenier est vide et que la consommation dépasse la production, chaque heure
  meurent **juste assez de soldats** pour que la consommation repasse sous la production, **les plus gourmands d'abord**
  (élite et siège, puis intermédiaires, puis base), dans toutes les armées de la ville, en mission comprises. Une armée
  qui meurt entièrement de faim perd son héros (il tombe).
- **Alertes** : notification quand le grenier sera vide dans **moins de 6 h** (une toutes les 6 h au plus), puis à
  chaque heure de famine avec les pertes. Bandeau rouge sous la barre de ressources ; le minuteur de la nourriture compte
  jusqu'au grenier vide.
- L'affichage de la consommation vient du serveur (`/api/cities` → `foodBalance`) : il tient compte des réductions et du
  siège, alors qu'il les ignorait.

## Invasions barbares (29 octobre 2026)

Décisions du 29 octobre 2026 (`src/services/hordeService.js`, `src/routes/invasion.js`, `frontend/js/app/09k-invasion.js`,
réglages `config.invasion`) — contenu **« donjon d'alliance »** : les hordes **n'attaquent jamais les joueurs**.

- **Chaque week-end**, du **vendredi 18 h au dimanche 23 h** (heure de Paris), **43 donjons** de hordes apparaissent sur
  la carte, annoncés à tous : 15 de niveau 1 près des bords, puis 12, 8, 5 et **3 de niveau 5 au centre** ; jamais à
  moins de 4 cases d'une ville. Au terme, ceux qui restent repartent. L'administrateur peut aussi lancer une invasion
  (2 à 72 h) ou terminer celle en cours (écran d'administration › Monde).
- Un donjon a **3 étages** à vaincre dans l'ordre : **avant-poste** (unités de base), **remparts** (intermédiaires),
  **chef de la horde** (élite), de force × 1, × 2, × 4 ; × 2,5 par niveau (avant-poste : 15 000 de puissance au niveau
  1, 586 000 au niveau 5 ; chef : 2,3 millions au niveau 5). La **garnison de l'étage ne se reconstitue pas** : une
  attaque repoussée lui retire quand même des soldats ; un étage vaincu laisse place au suivant ; le dernier vaincu
  **détruit le donjon**.
- **Seuls les joueurs en alliance** attaquent un donjon (attaque comme sur un camp, toujours à l'arrivée de l'armée,
  qui rentre ensuite chez elle) ; plusieurs alliances peuvent attaquer le même donjon. Chaque attaque compte les
  **dégâts** du joueur (points de combat : entretien des barbares tués), aussi comptés au classement d'attaque ; pertes
  divisées comme contre un camp, blessés rapportés, expérience du héros.
- **Trésor** à la destruction, **partagé selon les dégâts** entre tous ceux qui ont frappé : ressources livrées dans la
  capitale (8 000 de chaque au niveau 1, × 2,5 par niveau ; dans la limite des entrepôts), or (40 → 640), points
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
  civilisation.
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
- **Inscriptions** ouvertes **2 mois** (60 jours après l'ouverture du monde), **5 000 joueurs** au plus ; ensuite
  l'inscription répond « inscriptions closes » et le joueur attend le monde suivant.
- **Calendrier** : jour 120, **12 sites de Merveille** apparaissent sur la carte, gardés par les Immortels ; jour 150,
  **13 plans de construction** apparaissent, eux aussi gardés. Tous les joueurs sont prévenus. Onglet Classement →
  **Monde** : jour du monde, dates, Merveilles en chantier, plans détenus, Panthéon.
- **Prendre un site** : battre les Immortels (attaque comme sur un camp barbare), puis y **fonder une ville avec un
  colon** : c'est la **Ville Merveille** (une par joueur, alliance obligatoire, hors quota de colonies). Les Immortels
  reviennent sur un site libre au bout de 24 h.
- **Prendre un plan** : battre les Immortels du camp ; le plan revient au joueur. Un joueur dont la **capitale est
  prise** perd ses plans au profit de l'attaquant.
- **Construire** : chaque niveau coûte des ressources (50 000 bois, pierre et fer, 15 000 nourriture au niveau 1,
  +5 % par niveau) et du temps (1 h au niveau 1, +2,5 % par niveau). Les ressources viennent de l'alliance : les convois
  et transports vers la Ville Merveille remplissent son **stock de Merveille** (sans plafond). Au-delà du **niveau 50**,
  un membre de l'alliance doit détenir un plan.
- **Défendre** : toutes les 12 h, une **vague d'Immortels** attaque chaque Merveille (force croissante avec le niveau) ;
  si la défense tombe, la Merveille perd **1 niveau**. Un assaut ennemi victorieux lui ôte **2 niveaux** (au lieu des
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
| Fiche, XP et niveaux (siège, raid, tribu, expédition), points attaque/défense/vitesse/logistique tous appliqués, talents à 3 branches, chute et résurrection (ci-dessous) | Compétences actives, portrait animé |
| **Équipement réel** : catalogue de 14 objets (`data/items.json`), bonus appliqués au combat, à la vitesse et à la logistique, inventaire, équiper/déséquiper/jeter, drop à la fin d'une expédition gagnée selon le palier de butin | Forge d'objets, enchantement, objets des raids/sièges |
| Expéditions : 1 à 4 étoiles, puissance ennemie, durée, palier de butin, or, XP, objet | (les quêtes à objectifs sont en place : section Quêtes) |

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
  Endurance), pour 250 bois, pierre, fer et 150 nourriture par niveau du héros ; il revient dans la garnison de la
  capitale. Le panneau du Domus montre ce temps (les faux bonus « XP » et « stats » sont retirés).
- Notifications : passage de niveau, chute, retour (lien vers l'écran du héros).

## Quêtes et tutoriel (26 octobre 2026)

Façon Travian : un tutoriel guide les premières heures, des tâches suivent la progression, et des quêtes du jour et de
la semaine aident un peu les joueurs actifs, sans déséquilibrer la partie. Catalogue `data/quests.json` (se modifie sans
code), moteur `src/services/questService.js`, routes `/api/quests`, client `frontend/js/app/09e-quests.js`.

- **Accès** : bouton flottant « Quêtes » au-dessus de la barre du bas, avec une pastille quand une récompense est à
  prendre ; panneau à onglets Tutoriel, Tâches, Du jour, Semaine, Succès.
- **Récompenses : ressources seules**, livrées dans la ville affichée, si son entrepôt et son grenier ont la place
  (sinon refus, avec le conseil de dépenser, d'agrandir ou de choisir une autre ville). Une récompense ne se prend qu'une
  fois (table `QuestClaim`).
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
  le bonus. Nouvelles quêtes à minuit, heure de Paris.
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

**Conformes aux données, niveaux 1 à 20** : production des champs (courbe 10 → 350 → 4 500/h), stockage Silo/Dépôt (1 200 → 160 000), Moulin/Boulangerie/Scierie/Tailleur/Fonderie (+5 %/niv., 5 niveaux), Place de rassemblement (1 → 5 armées), Caserne/Écurie (paliers 7 et 15, −0,5 %/niv.), Atelier (siège dès 5, −4 %/niv.), Académie (−1 %/niv.), Forge (+0,5 %/niv.), Cachette (1 %/niv., max 20 %), Tente de soins (30 % + 3 %/niv., max 70 %), Mur (+1 %/niv., 1 000 PV/niv., réparation +1 %/niv.), Douves (+0,5 %/niv. attaque et défense), Grand Silo/Grand Dépôt (3 600 → 600 000 protégés), Ambassade (rejoindre 5, fonder 7), Chambre au trésor (10 → 200 or/jour), Tour de guet (attaquant niv. 10, effectifs niv. 15 ; espions niv. 5 et 10 ; alerte des espions ennemis niv. 5, 10, 15), Résidence (−0,25 %/niv.), Marché (taxe 30 % −1/niv., min 5 %, convois +5 %/niv.), Comptoir (+1 %/niv.), les six bâtiments de faction (soins, défense, blessés, production, entretien).

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
| Mur : palier visuel et palier de ville | Depuis octobre 2026 le palier (Village / Ville / Ville Fortifiée), l'enceinte dessinée suivent le Bâtiment principal (le minimum d'engins par palier a été supprimé le 25 octobre 2026 : 1 engin suffit) (10 et 20), plus le niveau du Mur | Le Mur garde bonus, points de vie et réparation ; `docs/EQUILIBRAGE.md` § 11 |
| Résidence (colons) | En place depuis octobre 2026 (colons, fondation, bonus de colonie) | Voir la section « Villes secondaires » |
| Irrigation (vitesse de marche), Poste du désert (taxe entre villes), Comptoir (`p2pTax`) | Fonctions absentes du jeu | Voir `docs/BACKLOG.md` |

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
