# Mis de côté (à reprendre plus tard)

Points identifiés par l'audit du socle et volontairement non traités. Rien ici ne bloque le jeu actuel ; ce sont des choix de conception ou des fonctionnalités entières.

| Sujet | Où ça se branche | Pourquoi c'est mis de côté |
|---|---|---|
| Courbes de coût et de temps (`costL20`, `timeL20Sec` ignorés, le serveur utilise `coût L1 × 1,28^(n−1)` et `temps L1 × 1,2^(n−1)`) | `src/routes/cities.js` (`buildCost`, durée), `frontend/js/app/05-panels.js` (`getBuildCost`, `getBuildTime`) | Équilibrage à décider en jouant ; les deux côtés doivent changer ensemble |
| Aide d'alliance (Ambassade : `maxAllianceHelpReceived*`, `allianceHelpReductionPct`) | `src/routes/alliance.js`, file de construction | Mécanique sociale à concevoir |
| Espions comme unités (Tour de guet : `maxSpiesFaction`, `spyUnlockL5/L10`, vision) | `data/units.json`, `armies.js` (mission SPY), carte | Aujourd'hui n'importe quelle unité espionne ; le contre-espionnage est en place |
| Renfort allié (mission SUPPORT, armée stationnée chez un allié qui défend) | `armyProcessor.js` (`defendingArmies`), `armies.js` | Règle de jeu et interface à concevoir |
| Rencontres d'armées : deux armées de joueurs ennemis déclarés sur la même case au même moment se battent, même en marche ; le vainqueur continue, le perdant rentre (décision du 25 octobre 2026) | `armyProcessor.js` (trajets case par case), `utils/pathfinding.js` | Touche tous les déplacements ; chantier séparé du siège, validé avec le joueur |
| Fil de notifications dans le jeu (camp installé, combat, chute, retour bloqué…), dont le push mobile découle (décision du 25 octobre 2026) | `services/pushService.js` (`notify`), nouveau modèle, interface | Aujourd'hui seules les notifications push existent ; chantier séparé validé avec le joueur |
| `bcryptjs` en JavaScript pur | `src/routes/auth.js` | Passer à `bcrypt` natif ou argon2 seulement si la charge de connexions le justifie (ajoute une compilation native à l'image Docker) |
| Taxe inter-villes (Avant-poste du désert : `interCityTaxReductionPctPerLevel`) | transports entre ses propres villes (`armies.js` mission TRANSPORT, marché) | Les villes secondaires existent depuis octobre 2026 ; aucune taxe n'est prélevée entre ses villes pour l'instant, l'effet reste sans objet |

| Coût de terrain pour les trajets (forêt, dunes, neige plus lentes : table `TERRAIN_MOVEMENT` du client) | `frontend/js/shared/terrain.js` (`findPath` avec coût par case), `src/utils/pathfinding.js` | Les trajets contournent déjà montagnes et eau ; le coût par case est un réglage d'équilibrage |
| Brouillard de guerre / portée de vision de la Tour de guet | `src/routes/map.js` (viewport filtré), `frontend/js/map.js` | Tout est visible aujourd'hui ; à décider avec le rythme de jeu voulu |
| Ligne rouge des attaques entrantes sur la carte | `frontend/js/map.js` (`drawArmyRoute`), données de `GET /api/city/incoming-attacks` | La ligne verte de ses propres armées existe ; la rouge est une évolution d'interface |
| Cycles de marche par faction (sprites) | `frontend/js/map.js` (`drawIsoArmy`), images à produire | Voir `docs/ETAT-DES-SYSTEMES.md` : série neutre recommandée (16 images) |
| Quêtes à objectifs pour le héros (construire, recruter, piller) | nouveau modèle, événements analytics déjà émis côté client | Les expéditions tiennent ce rôle pour l'instant |
| Graphismes du biome neige : champs, parcelles et décors enneigés (`docs/LISTE-GRAPHISMES.md` § 6) | `art/incoming/`, `node tools/repaint.cjs --import` | Les variantes `_snow` des bâtiments et de l'enceinte sont retirées de la liste (décision d'octobre 2026, le rendu 3D enneigé reste) ; le reste du biome neige est reporté |
| Points de ressource : espionnage d'un point pour connaître son stock exact (GDD `requiresSpyToKnowExactState`) | `src/routes/armies.js` (espionnage), bulle du point | Le stock n'est affiché que par quarts depuis octobre 2026 ; l'espionnage des points reste à faire (la fondation d'une ville sur un point est en place) |
| Invasions barbares (événement serveur évoqué par le GDD) | nouveau processeur, points temporaires, récompenses | Reporté, à garder pour plus tard (décision d'octobre 2026) ; les tribus fixes sur les points de ressource restent la base, comme Travian et le GDD |

Les constats complets sont dans `docs/AUDIT-SOCLE.md` ; l'état de chaque système dans `docs/ETAT-DES-SYSTEMES.md`.
| Villes secondaires : déplacement volontaire de la capitale (objet « déplacement capitale » du GDD) | `cities.js`, `services/conquestService.js` (`relocateCapital`) | Fait en octobre 2026 : colonie rasée et capitale déplacée près du bord quand leur muraille tombe (`docs/ETAT-DES-SYSTEMES.md`) ; reste le déplacement voulu par le joueur |
