# Mis de côté (à reprendre plus tard)

Points identifiés par l'audit du socle et volontairement non traités. Rien ici ne bloque le jeu actuel ; ce sont des choix de conception ou des fonctionnalités entières.

| Sujet | Où ça se branche | Pourquoi c'est mis de côté |
|---|---|---|
| Courbes de coût et de temps (`costL20`, `timeL20Sec` ignorés, le serveur utilise `coût L1 × 1,28^(n−1)` et `temps L1 × 1,2^(n−1)`) | `src/routes/cities.js` (`buildCost`, durée), `frontend/js/app/05-panels.js` (`getBuildCost`, `getBuildTime`) | Équilibrage à décider en jouant ; les deux côtés doivent changer ensemble |
| Colons et villes secondaires (Résidence : `unlockSettler*`, `cityFoundationTimeSec`, `secondaryCityBonusPct`) | nouvelle route de fondation, `findFreeSpawn`, `capitalOnly` / `notInCapital` à faire respecter dans `cities.js` | Fonctionnalité complète (unité colon, trajet, fondation, bonus de ville secondaire) |
| Aide d'alliance (Ambassade : `maxAllianceHelpReceived*`, `allianceHelpReductionPct`) | `src/routes/alliance.js`, file de construction | Mécanique sociale à concevoir |
| Espions comme unités (Tour de guet : `maxSpiesFaction`, `spyUnlockL5/L10`, vision) | `data/units.json`, `armies.js` (mission SPY), carte | Aujourd'hui n'importe quelle unité espionne ; le contre-espionnage est en place |
| Renfort allié (mission SUPPORT, armée stationnée chez un allié qui défend) | `armyProcessor.js` (`defendingArmies`), `armies.js` | Règle de jeu et interface à concevoir |
| Blessés de l'attaquant soignables à distance | `armyProcessor.js` (`handleAttack`), `cities.js` (`/wounded/heal`) | Règle à décider (les blessés devraient rentrer avec l'armée) |
| `bcryptjs` en JavaScript pur | `src/routes/auth.js` | Passer à `bcrypt` natif ou argon2 seulement si la charge de connexions le justifie (ajoute une compilation native à l'image Docker) |
| Taxe inter-villes (Avant-poste du désert : `interCityTaxReductionPctPerLevel`) | dépend des villes secondaires | Sans objet tant qu'il n'y a qu'une ville |

| Coût de terrain pour les trajets (forêt, dunes, neige plus lentes : table `TERRAIN_MOVEMENT` du client) | `frontend/js/shared/terrain.js` (`findPath` avec coût par case), `src/utils/pathfinding.js` | Les trajets contournent déjà montagnes et eau ; le coût par case est un réglage d'équilibrage |
| Brouillard de guerre / portée de vision de la Tour de guet | `src/routes/map.js` (viewport filtré), `frontend/js/map.js` | Tout est visible aujourd'hui ; à décider avec le rythme de jeu voulu |
| Ligne rouge des attaques entrantes sur la carte | `frontend/js/map.js` (`drawArmyRoute`), données de `GET /api/city/incoming-attacks` | La ligne verte de ses propres armées existe ; la rouge est une évolution d'interface |
| Cycles de marche par faction (sprites) | `frontend/js/map.js` (`drawIsoArmy`), images à produire | Voir `docs/ETAT-DES-SYSTEMES.md` : série neutre recommandée (16 images) |
| Quêtes à objectifs pour le héros (construire, recruter, piller) | nouveau modèle, événements analytics déjà émis côté client | Les expéditions tiennent ce rôle pour l'instant |
| Graphismes du biome neige : bâtiments et enceinte `_snow`, champs, parcelles et décors enneigés (808 images, voir `docs/LISTE-GRAPHISMES.md` § 6) | `art/incoming/`, `node tools/repaint.cjs --import` ; le client bascule déjà sur les variantes `_snow` quand elles existent | Décision d'octobre 2026 : à produire plus tard ; seules les villes fondées dans la neige les voient, elles gardent leur rendu 3D |
| Points de ressource : plusieurs alliés sur un même point (GDD `multipleAlliesSimultaneous`), stock exact visible seulement après espionnage, ville secondaire fondée sur un point | `src/routes/armies.js` (collecte, 409 sur point occupé), `src/game/processors/harvestProcessor.js`, `frontend/js/map.js` (bulle du point) | Écarts avec le GDD relevés en octobre 2026 ; dépend de la Résidence et des colons pour la fondation |
| Armée qui tient un point de ressource : inattaquable aujourd'hui (un raid sur un point occupé est refusé) | `src/routes/armies.js` (raid-resource), `armyProcessor.js` | Façon Travian, une armée sur une oasis peut être attaquée ; à décider (combat armée contre armée hors ville) |
| Invasions barbares (événement serveur évoqué par le GDD) | nouveau processeur, points temporaires, récompenses | Reporté, à garder pour plus tard (décision d'octobre 2026) ; les tribus fixes sur les points de ressource restent la base, comme Travian et le GDD |

Les constats complets sont dans `docs/AUDIT-SOCLE.md` ; l'état de chaque système dans `docs/ETAT-DES-SYSTEMES.md`.
