# Décisions du 31 octobre 2026 au soir (rapport de vérification)

Le rapport `docs/RAPPORT-VERIFICATION-2026-10-31.md` (simulation de 175 jours, calculs, lecture du code) posait 20 questions
au propriétaire (§ 7). Ce document donne ses réponses (décisions D1 à D19), les deux mises à jour qu'il a faites ensuite sur
le Bastion, ce qui a été fait dans le jeu et les chiffres finaux. Les valeurs sont dans `src/config/index.js` et
`data/*.json`, avec la mention « décision du 31 octobre 2026 (rapport de vérification) ». Tableau des valeurs :
`docs/EQUILIBRAGE.md` § 17 ; règles détaillées : `docs/ETAT-DES-SYSTEMES.md`.

## Les 20 questions et les réponses

| Question du rapport (§ 7) | Réponse du propriétaire | Décision |
|---|---|---|
| 1. Gisements : la carte ne tient qu'environ 1 000 joueurs à 2 colonies | « La taille a été calculée comme Travian, c'est étrange ; adaptez la taille de la carte et les gisements pour tenir 2 000 joueurs » | D1 |
| 2. Or des expéditions (environ 834 or par jour sans risque) | Or seulement quand le héros mène l'expédition | D4 |
| 3. Prix de l'élite | 2 or et ressources × 0,85 | D5 |
| 4. Les 7 changements d'endurance des unités intermédiaires | Non : pas de changement | D6 |
| 5. Routes commerciales (une route prend tous les marchands) | « Pas de transport de marchandises entre ses villes, on l'avait dit : stock commun. Retirez les marchands pour l'instant. Pour envoyer des ressources à un joueur, on passe par une armée, avec la capacité de transport de ses troupes » | D7 |
| 6. Mur du Bastion | « Prenez ce qui équilibre le mieux le jeu, comme le fort barbare de Rise of Kingdoms » | D9 |
| 7. Bastion défendu par toute l'alliance, imprenable | Même réponse que la question 6 (puis deux mises à jour, plus bas) | D9 |
| 8. Rassemblements : alliances dispersées | Les deux : choisir son côté de la carte à l'inscription, et des attentes de 120 et 180 min | D2, D3 |
| 9. Merveille : durée du monde | Coût de la Merveille divisé par deux | D10 |
| 10. Taille d'alliance visée pour la fin de partie | Fin de partie réglée pour des alliances de 15 à 20 joueurs ; alliances jusqu'à 100 membres (d'abord 30, corrigé) | D11 |
| 11. Immortels usés par une autre alliance | Pas de réponse à part dans les décisions : rien n'a changé (une alliance peut finir un site usé par une autre) | — |
| 12. Colonies neuves rasées dans la simulation | Une protection de 72 h après la fondation | D12 |
| 13. Grandes casernes | 0,75 % par niveau | D13 |
| 14. Défi de la semaine | Classer sur total ÷ max(membres, 20) | D11 |
| 15. Spécialité des colonies | Garder +10 % par niveau | D14 |
| 16. Comptoir de commerce | Taxe des échanges entre joueurs à 30 % de base (baisses inchangées) | D8 |
| 17. Cachette des colonies | « On avait dit 30 % des ressources » : 30 % du stockage de la ville au niveau 20 | D15 |
| 18. Chambre au Trésor sans colonie | Pas de changement | D16 |
| 19. Trésor des invasions | 200 or au niveau 1 | D17 |
| 20. Nouvelle simulation | Oui, après les changements, avec des joueurs automatiques corrigés | D18 |

D19 : les corrections de textes et de documents sans débat (rapport, § 3) sont faites (plus bas).

## Les deux mises à jour du Bastion

1. **Première mise à jour** (après la mesure du lot fin de partie) : un rassemblement plein de 25 armées médianes ne bat
   **jamais** une garnison pleine de 25 armées médianes, quel que soit le mur (0 % de × 3 à × 10 ; 64 % sans mur du tout).
   Choix du propriétaire : garnison de 17 armées, mur × 3.
2. **Mise à jour finale** : un rassemblement ne prend qu'une armée par joueur, donc une alliance de 15 à 20 n'aligne jamais
   25 armées. Le propriétaire : « une alliance de 20 n'attaque pas d'habitude une alliance de 100 ; garnison à 10 ; les
   assaillants peuvent être attaqués par les renforts, comme un siège ». **Garnison de 10 armées au plus, mur × 3**
   (60 000 PV). Le camp devant un Bastion se brise par une sortie de la garnison ou une attaque du dehors (« Briser le
   siège »), aussi le camp d'un rassemblement ; les joueurs automatiques doivent s'en servir.

Choix faits sans nouvelle question (cibles de D11) : vagues d'Immortels à **14 000** × niveau^1,35 (14 500 proposé
d'abord) : une alliance de 15 à 20 tient le niveau 100 derrière le Mur 15 de la Ville Merveille avec 80 % de son armée en
moyenne ; site 3,0 M, plan 5,75 M et donjons gardés.

## Ce qui a été fait, décision par décision

### D1. Carte et gisements pour 2 000 joueurs
- **Monde neuf : carte de 420 × 420** (générateur 4 ; coordonnées −210 à 209). Un monde ouvert avant garde sa carte de 374,
  case pour case. La disposition (rivières, lacs, chaînes, biomes) est celle de 374 agrandie ; le serveur et le téléphone
  dessinent la même carte (`Terrain.setWorldSeed(graine, générateur)`). `/api/world/info` donne la vraie taille, le
  générateur et les côtés.
- **6 000 gisements et 780 points d'or (13 %)**, posés seulement là où une ville 2 × 2 tient, à 3 cases au moins des autres
  points et des villes ; même règle de niveaux (plus de niveau 3 au centre).
- **Capitales à 3 cases au moins de tout gisement libre**, avec repli sur la règle d'avant.
- Les longueurs liées à la taille suivent : bande de départ 112 cases (100), anneaux des donjons 168-200 / 135-168 /
  101-135 / 62-101 / 25-62. Sur une carte pleine, un donjon qui ne trouve pas de place à 4 cases des villes se pose comme une
  ville (`config.invasion.placement`). Anneaux des sites et plans de Merveille gardés (`config.world.wonderSiteRing`,
  `wonderPlanRing`).
- **Pourquoi la carte de Travian ne suffisait pas** : une ville prend 2 × 2 cases et une case libre autour, elle ne tient que
  sur 70 % des cases ; l'ancien semis posait 35 % des gisements là où aucune ville ne tient, et les capitales en rendaient un
  tiers infondables. Résultat : 1 770 à 1 836 colonies possibles sur les 4 000 voulues.
- **Mesure** (`node tools/measure-map-capacity.cjs`, vrai code, 5 graines dont la 0) : 6 000 gisements fondables après
  2 000 capitales (objectif 4 600), 4 000 colonies fondées, place pour environ 5 100 villes de plus, tous les sites, plans
  et donjons posés ; si les 2 000 joueurs choisissent le même côté : 4 998 à 5 087.

### D2. Côté de la carte à l'inscription
- `POST /api/auth/register { …, side }` et `POST /api/world/join { faction, side }` : `N`, `E`, `S`, `W` ou `RANDOM` (par
  défaut). Côté inconnu : 400 « Côté de la carte invalide : Nord, Est, Sud, Ouest ou au hasard ». Côté plein : un des deux
  voisins, puis l'opposé ; la réponse donne le côté réel (`player.side`, `side`) et le jeu le dit au joueur.
- Écran d'inscription et « Rejoindre le nouveau monde » : cinq boutons (Nord, Est, Sud, Ouest, Au hasard) et une ligne
  « Rejoignez vos amis du même côté ». Une capitale tombée est reposée de son côté.

### D3. Attentes des rassemblements
- 5, 10, 30, 60, **120** ou **180** minutes (`config.rally.waitMinutes`) ; le client lit la liste du serveur ; « départ dans
  3 h ».

### D4. Or des expéditions
- Seulement quand le héros mène l'expédition : une chance sur deux, 10 + 10 × difficulté en moyenne (± 50 %), soit 10 / 15 /
  20 / 25 or espérés ; Chasseur de trésors compris. Sans héros : ni or, ni objet, ni XP. Le client envoie d'abord l'armée du
  héros ; les textes le disent.

### D5. Prix de l'élite
- 2 or par unité, ressources × 0,85 (légionnaire romain 340, archer d'élite 339, cavalerie lourde 435) ; soin immédiat
  inchangé (1 / 2 / 3 / 3 or).

### D6. Unités intermédiaires
- Pas de changement.

### D7. Plus de marchands ni de routes entre ses villes
- Marchands et routes retirés (données, serveur, client, migration `0033_sans_marchands`) ; un envoi ou un transport vers
  une de ses villes est refusé (« Vos villes partagent leur stock : rien à transporter entre elles »), sauf vers une Ville
  Merveille.
- Échanges entre joueurs : l'offre réserve une armée du vendeur (statut `MARKET`), qui attend en ville avec les
  marchandises 48 h au plus ; à l'acceptation, elle part chez l'acheteur et une armée de l'acheteur part chez le vendeur
  (`MARKET_DELIVERY`), chacune avec ce qu'elle livre moins sa taxe ; livraison à l'arrivée, puis retour.
- Garde-fous : une armée réservée ne part pas, ne se défait pas, ne change ni de troupes ni de héros (« Armée réservée pour
  une offre du marché : annulez l'offre pour la libérer ») ; une armée d'échange conclu ne se rappelle pas (« Armée d'un
  échange conclu : elle livre puis rentre seule, on ne peut pas la rappeler ») ; un simple transport se rappelle toujours.
  Une armée réservée tombe avec sa colonie.
- Envois et aide d'alliance : `POST /api/trade/send` avec une armée de transport. Livraisons à la Merveille et
  ravitaillement du Bastion : par des armées.
- Charge : troupes et héros × civilisation × (Marché +5 %, Comptoir +1 %, Poste du Désert +1 % par niveau de la capitale) ×
  Bastion +10 %.

### D8. Taxe des échanges entre joueurs
- 30 % de base (10 % avant), −1 % par niveau du Comptoir, −0,25 % par niveau de la Chambre au Trésor : 5 % avec les deux au
  niveau 20.

### D9. Bastion façon fort barbare de Rise of Kingdoms
- **Un assaut = un rassemblement ou une armée seule** : la règle qui réunissait tous les camps d'une alliance finissant
  ensemble en un assaut sans plafond est retirée ; chaque autre camp livre son propre assaut.
- **Garnison de 10 armées au plus**, celles en route et en sortie comprises : refus à l'envoi (« Garnison du Bastion
  complète : 10 armées au plus, celles en route comprises »), demi-tour à l'arrivée si elle s'est remplie entre-temps.
- **Mur 3 fois un mur 20 : 60 000 PV** (10 fois et 200 000 avant). Vies (10) et remontée (72 h) inchangées.
- Le camp devant un Bastion, rassemblement compris, se brise par une sortie ou une attaque du dehors ; chassé avant son
  heure, il ne livre pas d'assaut.
- Chiffres (vrai moteur, armées de la simulation au jour 150, 65 engins par armée) : contre une garnison pleine de
  10 armées médianes, un rassemblement de 15 / 16 / 17 / 18 / 20 armées prend une vie 4 / 19 / 50 / 83 / 100 % des fois ;
  sans garnison, 5 armées suffisent (4 sous un chef du Sultanat).

### D10. Merveille à moitié prix
- 125 000 / 125 000 / 125 000 / 37 500 au niveau 1, × 1,05 par niveau : 1,08 milliard en tout (2,15 avant), 86 millions pour
  les niveaux 1 à 50. La fiche de la Merveille dit que l'armée est le vrai moyen de la ravitailler.

### D11. Alliances de 100, fin de partie pour 15 à 20 joueurs
- Ambassade : 5 membres par niveau, 100 au plus (35 au niveau 7, 50 au 10, 100 au 20).
- Défi de la semaine : score = total ÷ max(membres, 20), au dixième ; récompenses 750 / 500 / 250 inchangées.
- Immortels : site 3,0 M (47 à 35 % de l'armée de 15 à 20 joueurs), plan **5,75 M** (74 à 55 %), vagues **14 000** ×
  niveau^1,35 (2,75 M au niveau 50, 7,02 M au niveau 100 ; 89 / 85 / 82 / 76 / 68 % de l'armée pour tenir le niveau 100
  derrière le Mur 15). Donjons gardés (chefs des niveaux 1, 4 et 5 : 2, 11 et 19 joueurs).

### D12. Colonies neuves protégées 72 h
- Ni attaque, ni raid, ni siège pendant 72 h après la fondation : refus à l'envoi (« Colonie protégée encore … ») et
  demi-tour à l'arrivée pour une armée déjà en route ; espions permis ; la colonie sort librement ses armées ; ni la
  capitale ni la Ville Merveille. `protectedUntil` dans `GET /api/cities` et sur la carte ; badge sur l'écran de la ville,
  dans « Mes villes » et sur la carte.

### D13. Grandes casernes et écuries : 0,75 % par niveau pour la capitale (deux au niveau 20 : 30 %).

### D14. Spécialité des gisements : +10 % par niveau, gardé.

### D15. Cachette : 1,5 % du stockage de la ville par niveau
- Pour chaque ressource (Dépôt et Grand dépôt, Silo et Grand silo) : 30 % au niveau 20, Gaule 36 %. Raids, pillage de
  siège, rapport d'espion (`hideoutPct` et `hideoutAmount` par ressource) et client. Plus faible qu'avant au début (151 à
  la cachette 3 avec un Dépôt 5, 402 avant), bien plus forte à la fin (48 000 dans une capitale pleine, 192 000 dans une
  colonie pleine).

### D16. Chambre au Trésor : pas de changement.

### D17. Trésor des invasions : 200 / 400 / 800 / 1 600 / 3 200 or aux niveaux 1 à 5.

### D18. Nouvelle simulation
- Outil corrigé (puissance au palier des unités, donjons de l'invasion en cours seulement) ; joueurs automatiques repris :
  module Merveille (sites, plans, livraisons par armée, défense contre les vagues), invasions avec toutes les troupes et
  attaques d'usure, Forge et Atelier 20 avec 60 à 70 engins, Mur en premier chantier d'une colonie et une armée stationnée,
  alliances entre voisins grâce au choix du côté, gisement choisi selon son niveau, cachette plus haute, quêtes prises,
  assauts de Bastion par rassemblement et camps brisés par la garnison, échanges par armée, expéditions menées par le héros.
  Les résultats viendront avec la simulation.

### D19. Textes et documents
- Phrases fausses corrigées : la carte de 374 tenait environ 1 000 à 1 050 joueurs à 2 colonies (et non « 4 900 gisements,
  assez pour environ 2 450 joueurs ») ; un compte complet arrive vers les jours **114 à 154** (et non 84 à 132) ; une
  récompense de quête plafonnée vaut **1,4 h** de production d'un compte complet (et non 20 minutes) ; les vraies premières
  colonies de la simulation sont aux jours médians **52 et 79** (59 et 81 comptaient les colonies refondées).
- Mis à jour : `docs/ETAT-DES-SYSTEMES.md`, `docs/EQUILIBRAGE.md` (§ 17), `docs/BATIMENTS-ROLES.md`, `docs/BACKLOG.md`,
  `docs/CARTE-REFERENCE.md`, `docs/RAPPORT-COLONIES.md`. Les documents datés (rapport de vérification, simulation du
  31 octobre) restent tels quels.

## Ce qui change pour le jeu (API)

- `POST /api/auth/register` et `POST /api/world/join` : `side` ; réponse avec le côté réel.
- `GET /api/world/info` : `worldSize`, `minCoord`, `maxCoord` réels, `worldGenerator`, `sides`.
- Marché : `POST /api/market/offer { …, armyId? }` → `{ message, offer, armyId, armyName, taxPct }` ;
  `POST /api/market/offer/:id/accept { cityId, armyId? }` → `{ toBuyer, toSeller, sellerTax, buyerTax, armyId, arrivalAt,
  returnAt, … }` ; `POST /api/trade/send { fromCityId, armyId?, targetX, targetY, resources }` ; `GET /api/market/state`
  → `{ taxPct, basePct, offerHours, armies }` ; `/api/market/routes` n'existe plus ; `GET /api/player/me` →
  `economy.market = { p2pTaxPctBase: 30, treasureTaxReductionPctPerLevel: 0.25, offerHours: 48 }`,
  `economy.alliance.maxMembers = 100`.
- Armées : statut `MARKET` (réservée à une offre) ; refus 400 pour partir, se défaire, changer de troupes ou de héros ;
  `TRANSPORTING` / `MARKET_DELIVERY` ne se rappelle pas ; `POST /api/army/:id/transport` vers sa propre ville : 400.
- Bastion : `rules.maxGarrisonArmies = 10`, `rules.wallMultiplier = 3`, `bastion.wallMaxHp = 60000` (règles données même
  sans alliance) ; 11e armée en garnison : 400.
- Rassemblements : `GET /api/rallies` → `waits: [5, 10, 30, 60, 120, 180]`.
- Colonies : `protectedUntil` dans `GET /api/cities` et `/api/map/viewport` ; attaque, raid ou siège d'une colonie protégée :
  400 « Colonie protégée encore … ».
- Espions : `defenses.hideoutPct` et `defenses.hideoutAmount = { wood, stone, iron, food }`.
- Défi : `GET /api/ranking/challenge` → `minMembers: 20`, `rows[].total`, `rows[].value` (score par membre).
- Expéditions : `lootGained.gold` seulement si le héros menait l'armée.

## Vérifications

- Tests unitaires : chaque lot a ajouté ou repris ses tests (carte et gisements, côtés, marché par armée, taxe, or,
  élite, cachette, protection des colonies, défi, Bastion, rassemblements, Merveille, donjons).
- Tests de bout en bout (`tests/api-e2e.mjs`) : une vérification par décision qui touche l'API (D1 à D5, D7 à D13, D15,
  D17), avec les chiffres finaux (garnison de 10, mur de 60 000 PV, vague de base 14 000) ; un monde de test récent a
  sa carte de 420 et ses 6 000 gisements, et chaque colonie fondée pendant le test est vieillie de 73 h avant d'être
  attaquée. Test du navigateur (`tests/browser-smoke.cjs`) : boutons du côté de la carte, marché sans marchands ni routes.
  Ces tests demandent un serveur et une base : à lancer avant d'ouvrir le monde.
- Questions encore ouvertes (taille maximale d'une armée, poids des engins dans l'assaut d'un Bastion, armée réservée qui
  ne défend pas sa ville, cachette du début de partie…) : `docs/BACKLOG.md`.
