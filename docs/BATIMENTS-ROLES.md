# Le rôle de chaque bâtiment (revue du propriétaire, 30 et 31 octobre 2026)

Le propriétaire a revu les bâtiments un par un. Ce tableau donne sa décision pour chacun, avec les chiffres en place dans le
jeu. Tous les chiffres sont dans les données (`data/buildings.json`) ou la configuration (`src/config/index.js`) : ils se
règlent sans toucher au code. Ce qui reste à équilibrer est listé dans `docs/EQUILIBRAGE.md` § 16 ; le fonctionnement
détaillé de chaque système est dans `docs/ETAT-DES-SYSTEMES.md`.

« Capitale » : le bâtiment ne se construit que dans la capitale et son effet vaut pour toutes les villes du joueur.
« Colonies » : il ne se construit que dans une colonie (ou la Ville Merveille) et n'agit que sur elle, sauf mention.

## Les bâtiments

| Bâtiment | Où | Niveau max | Décision | Chiffres en place | Où les régler |
|---|---|---|---|---|---|
| Bâtiment principal | Partout | **20 partout** (avant : 30 dans la capitale) | Rôle gardé : il réduit le temps de construction et fixe le niveau maximum des autres bâtiments de sa ville | −2,5 % de temps par niveau (−50 % au niveau 20, plafond commun de 60 % avec l'Académie et la Résidence) ; niveau 20 : 21 778 bois, 21 778 pierre, 16 333 fer, 5 444 céréales, 7 h 18 sans réduction | `MAIN_HALL.maxLevel`, `buildTimeReductionPctPerLevel` |
| Bûcheron, Carrière, Mine de fer, Ferme | Partout | 20 | Rôle gardé | 10 → 350 → 4 500 par heure (niveaux 1, 10, 20) | `*ProdL1`, `*ProdL10`, `*ProdL20` |
| Dépôt de ressources | Partout | 20 | Rôle gardé | 1 200 → 160 000 (bois, pierre, fer) | `WAREHOUSE.effects.storageL1/L20` |
| Silo à céréales | Partout | 20 | Rôle gardé | 1 200 → 160 000 | `SILO.effects.foodStorageL1/L20` |
| Cachette | Partout | 20 | **Quantité fixe par niveau** (façon Travian) au lieu d'un pourcentage ; seule protection du pillage (raid, pillage de siège, rapport d'espion) | De chaque ressource : 240 (niveau 1), 672 (5), 2 436 (10), 8 830 (15), 32 000 (20), soit 20 % d'un Dépôt de même niveau ; Gaule × 1,2 (38 400 au niveau 20) | `HIDEOUT.effects.hideoutL1`, `hideoutL20` ; Gaule : `data/factions.json` `hideoutCapacity` (20) |
| Mur | Partout, sur l'enceinte | **Capitale 20, colonie 15** | Rôle gardé (sur l'enceinte, hors de l'anneau) ; Mur des colonies limité au niveau 15 | +1 % de défense et 1 000 points de vie par niveau (Égypte 1 250) ; seuls les engins l'abîment ; une colonie a 15 000 PV de mur au plus | `WALL.effects.colonyMaxLevel`, `config.combat.wallHpPerLevel` |
| Place du marché | **Capitale** (avant : partout) | 20 | Rôle gardé (marchand du serveur, échanges) **+ marchands façon Travian** : toutes les livraisons du marché partent avec eux | 1 marchand par niveau ; charge d'un marchand : Rome 500, Gaule 750, Grèce 600, Égypte 750, Huns 500, Sultanat 1 000 ; vitesse : Gaule 100, Huns 90, Rome 80, Égypte 80, Grèce 75, Sultanat 65 (10 cases en 2,5 à 3,9 min) ; occupé à l'aller et au retour ; taxe du marchand du serveur 30 % −1 point par niveau (5 % au plus bas) ; armées de transport +5 % par niveau | `MARKET.effects.merchantsPerLevel`, `serverMarketTax*`, `playerTransportBonusPctPerLevel` ; `config.market.merchants` |
| Place de rassemblement | Capitale | 20 | Rôle gardé (armées en campagne) **+ taille des rassemblements** d'alliance que le joueur lance | 1 armée en campagne au niveau 1, 3 au niveau 10, 5 au niveau 20 ; rassemblement : 5 armées + 1 par niveau du lanceur (15 au niveau 10, 25 au niveau 20), la sienne comprise | `RALLY_POINT.effects.maxArmies`, `rallyMaxArmiesBase`, `rallyMaxArmiesPerLevel` |
| Caserne | Capitale | 20 | Rôle gardé | Paliers 1 / 7 / 15 ; −0,5 % de temps de formation par niveau | `BARRACKS.effects` |
| Écurie | Capitale | 20 | Rôle gardé | Paliers 1 / 7 / 15 ; −0,5 % par niveau | `STABLE.effects` |
| Atelier | Capitale | 20 | Rôle gardé | Engins dès le niveau 5 ; −4 % par niveau | `config.recruit.siegeWorkshopLevel`, `WORKSHOP.effects` |
| Forge | Capitale | 20 | **Attaque ET défense** de toutes les troupes du joueur, dans tous les combats (avant : défense des villes seulement) | +0,5 % d'attaque et +0,5 % de défense par niveau (+10 % au niveau 20, 50 % au plus) ; un groupe de plusieurs joueurs prend la moyenne de leurs Forges selon leurs soldats | `FORGE.effects.attackBonusPctPerLevel`, `defenseBonusPctPerLevel` |
| Académie | Capitale | 20 | Rôle gardé | Recherche ; −1 % de temps de construction par niveau | `ACADEMY.effects` |
| Tente de soins | Capitale | 20 | Rôle gardé | 30 % + 3 % par niveau des pertes en blessés (70 % au plus) ; 200 lits par niveau | `config.wounded` |
| Tour de guet | Capitale | 20 | **La vision ne concerne que les armées** : la carte se voit partout ; les armées des autres joueurs ne se voient que dans le rayon de la Tour de guet autour de chacune de ses villes ; alertes et espions gardés | Rayon : 5 cases + 6 par niveau (11 au niveau 1, 35 au 5, 65 au 10, 125 au 20) ; espions aux niveaux 5 et 10 ; alertes des espions ennemis aux niveaux 5, 10 et 15 | `WATCHTOWER.effects.visionRangeL1`, `visionRangePerLevel` |
| Ambassade | Capitale | 20 | Rôle gardé **+ taille d'alliance** : l'Ambassade du chef fixe le nombre de membres | Rejoindre au niveau 5, fonder au niveau 7 ; 3 membres par niveau du chef (21 au niveau 7, 30 au 10, 60 au 20), jamais plus de 60 ; si le plafond baisse, personne n'est exclu | `EMBASSY.effects.allianceMembersPerLevel`, `config.alliance.maxMembers` |
| Chambre au Trésor | Capitale | 20 | Rôle gardé ; la fiche dit que l'or du joueur ne peut jamais être pillé (il n'est pas dans le stock des villes) | 10 → 200 or par jour ; taxe des échanges −0,25 point par niveau ; prérequis du Grand dépôt et du Grand silo (niveau 5) | `TREASURE_CHAMBER.effects.goldProdPerDayL1/L20`, `config.market.treasureTaxReductionPctPerLevel` |
| Domus du Héros | Capitale | 20 | Rôle gardé | Résurrection du héros −2 % de temps par niveau | `HERO_MANSION.effects` |
| Résidence | Capitale | 20 | Rôle gardé | Colons : 1 au niveau 10, 2 au niveau 20 (2 colonies au plus) ; −0,25 % de temps de construction par niveau ; spécialité du gisement des colonies (+10 % par niveau du gisement sur sa ressource, −30 % sur les trois autres) | `RESIDENCE.effects`, `config.city.maxSecondaryCities` |
| Moulin, Boulangerie | Colonies | 5 | Rôle gardé ; **bonus divisé par deux** (tous les bâtiments de bonus limités au niveau 5) | +2,5 % de céréales par niveau (+12,5 % au niveau 5 ; les deux ensemble : +25 %) | `foodProdBonusPctL1`, `foodProdBonusPctL5` |
| Scierie, Tailleur de pierre, Fonderie | Colonies | 5 | Rôle gardé ; **bonus divisé par deux** | +2,5 % par niveau de bois, de pierre ou de fer (+12,5 % au niveau 5) | `woodProdBonusPctL1/L5`, `stoneProdBonusPctL1/L5`, `ironProdBonusPctL1/L5` |
| Grand Dépôt, Grand Silo | Colonies | 20 | Rôle gardé (stockage) | 3 600 → 480 000, trois fois un Dépôt ou un Silo de même niveau | `storageL1/L20`, `foodStorageL1/L20` |
| Grande Caserne | Colonies | 20 | Rôle gardé (formation dans la colonie, unités vers la capitale, « Lieu de formation ») **+ accélère la Caserne de la capitale** : les niveaux de toutes ses Grandes casernes s'additionnent | Paliers 1 / 7 / 15, −4 % de temps par niveau dans la colonie ; capitale : −0,5 % par niveau pour l'infanterie et les archers (2 Grandes casernes 20 : −20 %), dans le plafond général de 60 % | `GREAT_BARRACKS.effects.capitalTrainTimeReductionPctPerLevel` |
| Grande Écurie | Colonies | 20 | Rôle gardé **+ même règle pour la cavalerie** dans l'Écurie de la capitale | Comme la Grande caserne | `GREAT_STABLE.effects.capitalTrainTimeReductionPctPerLevel` |
| Comptoir de commerce | **Capitale** (avant : colonies) | 20 | Rôle gardé, comme le Marché ; la règle « meilleur Comptoir des colonies pour toutes les villes » est retirée | Taxe des échanges −1 point par niveau (10 % de base : 0 dès le niveau 10) ; charge des marchands et des armées de transport +1 % par niveau | `TRADE_OFFICE.effects.p2pTaxReductionPctPerLevel`, `armyTransportCapacityBonusPctPerLevel`, `config.market.p2pTaxPctBase` |
| Thermes (Rome) | Capitale | 20 | Rôle gardé | Soins plus rapides, plus de blessés | `ROMAN_THERMAE.effects` |
| Brasserie (Gaule) | Capitale | 20 | Rôle gardé | +1 % de défense des villes par niveau | `GALLIC_BREWERY.effects` |
| Temple (Grèce) | Capitale | 20 | Rôle gardé | Blessés au lieu de morts +0,5 % par niveau | `GREEK_TEMPLE.effects` |
| Poste d'Irrigation (Égypte) | Capitale | 20 | Rôle gardé | Production de toutes les villes +1 % par niveau ; marche +0,5 % par niveau | `EGYPTIAN_IRRIGATION.effects` |
| Tente de Guerre (Huns) | Capitale | 20 | Rôle gardé | Entretien −0,5 % par niveau ; blessés +0,5 % par niveau | `HUN_WAR_TENT.effects` |
| Poste du Désert (Sultanat) | Capitale | 20 | Rôle gardé (revu le 31 octobre) | Charge +1 % par niveau des marchands, des armées de transport et des récoltes ; entretien −0,5 % par niveau | `SULTAN_DESERT_OUTPOST.effects` |

## Ce qui va avec

- **Emplacements à la taille de la ville** (décision 13) : autant d'emplacements dans l'anneau que de bâtiments possibles.
  - **Capitale : 18 emplacements**, pour ses 18 bâtiments : Place de rassemblement, Marché, Comptoir, Académie, Dépôt,
    Silo, Cachette, Tente de soins, Tour de guet, Caserne, Écurie, Atelier, Forge, Ambassade, Chambre au Trésor, Domus,
    Résidence, bâtiment de la civilisation.
  - **Colonie : 12 emplacements**, pour ses 12 bâtiments : Dépôt, Silo, Cachette, Moulin, Boulangerie, Scierie, Tailleur
    de pierre, Fonderie, Grand dépôt, Grand silo, Grande caserne, Grande écurie. La Ville Merveille suit la colonie.
  - Hors de l'anneau : le Bâtiment principal (emplacement 0), le Mur (sur l'enceinte, emplacement 20) et les 18 champs.
  - Réglage : `config.city.ringSlots = { capital: 18, colony: 12 }`, `config.city.wallSlot`. La scène de la ville dessine
    18 parcelles pour la capitale, 12 pour une colonie, avec une enceinte et une place plus petites.
- **Or des unités d'élite** (décision 15) : chaque unité d'élite coûte de l'or en plus de ses ressources, pris à la mise en
  file sur l'or du joueur (refus : « Il faut N or pour recruter ces unités d'élite ») et rendu à moitié à l'annulation,
  comme les ressources. Pour compenser, son prix en ressources est multiplié par 0,95. Les autres paliers et les engins de
  siège ne coûtent pas d'or. Réglage : `config.recruit.goldPerUnit = { elite: 1 }`, `config.recruit.eliteResourceCostMult
  = 0.95` ; le prix du serveur est dans le catalogue `GET /api/units` (`recruitCost`, `recruitGold`).
- **2 colonies par joueur** (décision 16), **2 000 joueurs par serveur** (décision 17), **spécialité du gisement**
  (décision 18) : décidés le 31 octobre 2026, déjà en place (`docs/ETAT-DES-SYSTEMES.md`, « Villes secondaires »).
- **Migration `0032_batiments`** (idempotente, sans remboursement : le monde n'est pas encore ouvert) : Bâtiments principaux
  ramenés à 20 et chantiers au-delà supprimés ; Murs des colonies ramenés à 15 (points de vie du mur recalculés) et
  chantiers au-delà supprimés ; Marchés et Comptoirs des colonies supprimés avec leurs chantiers ; bâtiments posés au-delà de
  l'anneau déplacés sur un emplacement libre ; offres du marché tenues par une armée annulées (marchandises rendues) ;
  colonnes des marchands.

## Graphismes

Aucun bâtiment ne disparaît du jeu : le Marché et le Comptoir ne se construisent plus dans une colonie, mais leurs images
servent toujours dans la capitale. Rien n'est donc retiré des listes de graphismes (`docs/LISTE-GRAPHISMES.md`,
`docs/LISTE-BATIMENTS-PAR-FACTION.md`). Les marchands en route ne sont pas dessinés sur la carte aujourd'hui (le trajet se
suit dans l'écran du marché) ; leur cycle de marche `map/units/merchant_walk` est déjà dans la liste à produire. La scène
d'une colonie, plus petite, n'a pas besoin d'images nouvelles (mêmes parcelles, enceinte et décor).
