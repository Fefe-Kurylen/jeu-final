# Vérification des décisions des 30 et 31 octobre 2026

*Rapport pour le propriétaire. Il répond à la demande : « vérifie tout ça avec une simulation, fais-moi un rapport : voir si cela marche et si cela est équilibré ».*

**D'où viennent les chiffres.** Chaque chiffre porte sa source entre crochets :

| Code | Source |
| --- | --- |
| [S] | Simulation longue : vrai serveur, 38 joueurs automatiques, 175 jours simulés (relevés et événements) |
| [B] | Base de données de cette simulation, lue directement à la fin |
| [C] | Calcul avec les vraies formules du jeu et les vrais fichiers de données |
| [M] | Vrai moteur de combat du jeu, sur des armées types ou sur les vraies armées de la simulation |
| [L] | Lecture du code du jeu |
| [T] | Tests automatiques |

**Verdicts.** **OK** = marche comme décidé, et les chiffres vont. **CASSÉ** = ne marche pas comme décidé. **DÉSÉQUILIBRÉ** = marche, mais un chiffre ne va pas (avec une valeur proposée). **NON TESTÉ** = la simulation n'a pas pu le jouer.

**Puissance.** Toutes les puissances de ce rapport sont celles du jeu, élites et engins comptés à leur vraie valeur. L'outil de simulation les sous-estimait d'un facteur 1,44 (voir § 3).

---

## 1. En bref

- **Ça marche.** 175 jours simulés, 289 493 appels au serveur, 0 erreur serveur [S]. Tous les tests passent : unitaires 375/375, de bout en bout 1 024/1 024, conformité 30/30, navigateur OK [T].
- **Un seul bug du jeu trouvé** (les ressources d'une colonie neuve dépassaient son stockage). Il est **déjà corrigé**. Un texte périmé (fiche de l'Atelier) est aussi corrigé. Il reste une erreur dans l'outil de simulation, pas dans le jeu.
- **L'équilibre est bon dans l'ensemble** : rythme, stockage, colonies, entretien, combat, Immortels, donjons.
- **Deux points urgents.** Avec 2 000 joueurs, la carte n'a de gisements que pour 44 % des colonies voulues. Les expéditions donnent trop d'or : jusqu'à 834 or par jour, plus de 4 fois la Chambre au Trésor 20.
- **À régler ensuite** : prix de l'élite (2 or, ressources ×0,85), 7 unités intermédiaires, routes qui prennent tous les marchands, mur du Bastion, transport vers la Merveille. La fin de partie n'a pas été jouée par les joueurs automatiques : elle est jugée par le calcul.

---

## 2. Ce qui marche

### 2.1 Économie et villes

| Décision | Verdict | Preuve |
| --- | --- | --- |
| Champs : prix ×1,45 et temps ×1,30 par niveau | OK | Un champ niveau 20 coûte au plus 116 410 d'une ressource : il tient dans un Dépôt 19 (123 675). 26,3 h de chantier du niveau 1 au 20 [C]. Mêmes chiffres qu'EQUILIBRAGE § 14. |
| Bâtiment principal limité à 20 partout | OK | Niveau 20 au plus dans les 38 capitales et les 72 colonies. 0 dépassement en 175 jours [B][S]. |
| Toutes les dépenses payées sur le stock de toutes les villes | OK | 65 280 constructions acceptées, 9 015 recrutements, 6 080 recherches, 10 291 soins, 21 résurrections du héros, 127 colons, 129 fondations, sans aucune erreur [S]. La Chambre au Trésor 18 à 20 (191 408 à 313 604 de bois) a été bâtie alors qu'une capitale ne stocke que 160 000 [B]. |
| Refus « Stockage trop petit » si aucune ville ne peut payer | OK | Vérifié par les tests [T]. Jamais vu dans la simulation, car les joueurs automatiques vérifient avant d'acheter [S]. |
| On prend d'abord dans la ville la plus pleine (dépenses et entretien) | OK | Lu dans le code des dépenses et de l'entretien [L], tests unitaires [T]. |
| Entretien payé sur les greniers de toutes les villes ; famine seulement si tout est vide | OK | 0 famine en 175 jours. Le joueur médian produit 98 043 céréales/h et en consomme 26 112 (26 %) ; le pire joueur 53 % [B]. |
| Emplacements : 18 dans la capitale, 12 dans une colonie | OK | Vérifié dans toutes les villes, 0 bâtiment hors de l'anneau [B][S]. |
| Spécialité des colonies : +10/20/30 % sur la ressource du gisement, −30 % sur les autres | OK | Colonie de bois : 77 425 / 79 225 / 81 025 par heure (gisement 1/2/3). Colonie de céréales : 81 025 / 83 725 / 86 425 [C]. Exactement EQUILIBRAGE § 15. |
| Bâtiments de bonus divisés par deux (+2,5 % par niveau) | OK | +12,5 % au niveau 5. Les 69 colonies complètes les ont tous au niveau 5 [B]. |
| 2 colonies par joueur (Résidence 10 puis 20) | OK | 72 colonies pour 38 joueurs (76 au plus). 35 joueurs sur 38 ont eu leur 2e colonie [B]. |
| Soins payants : 30 % du prix, 10 % du temps × 0,95 par niveau de Tente | OK | 145 100 unités soignées. Coût total environ 14 à 15 M, soit environ 0,4 M par joueur en 175 jours [S][C]. |
| Recherche : prix ×1,28 et temps ×1,2 par niveau | OK | Prix le plus haut 28 311 (Tactique 20). Les 8 recherches au niveau 20 au jour 119 en médiane [S]. |
| Plafond des routes commerciales (Dépôt et Silo seuls) | OK | 13 333 par ressource et par envoi au Dépôt 20 [C]. 209 routes créées [S]. Mais voir § 4 (marchands). |

### 2.2 Combat et armée

| Décision | Verdict | Preuve |
| --- | --- | --- |
| Nouveau moteur de bataille et triangle +50 % | OK | À prix égal, sur les 36 couples de civilisations : l'infanterie bat la cavalerie dans 100 % des cas, les archers battent l'infanterie dans 100 %, la cavalerie bat les archers dans 92 à 100 % [M]. |
| Coups répartis sur tous les paliers | OK | À entretien égal, 25 % d'élites + 75 % de base bat 100 % de base dans les 6 civilisations [M]. |
| Entretien 5 / 9 / 13 (engins 15) | OK | Le même réglage sert partout (production, classement, écran du joueur) [L]. |
| 8 retouches d'endurance du 30 octobre | OK (en place) | Les 8 valeurs sont dans les données. Leur effet est à revoir : voir § 4. |
| Or des élites (1 or) et prix en ressources ×0,95 | OK (en place) | 202 981 élites recrutées pour 202 981 or [S]. Annulation : la moitié de l'or rendue [L]. Le prix est à revoir : voir § 5. |
| Forge : +0,5 % d'attaque et de défense par niveau, dans tous les combats | OK | Forge 20 = armée 7,8 % plus forte [M]. Appliquée dans tous les types de combat (tribus, villes, raids, donjons, Immortels, vagues, Bastion) [L]. |
| Grandes casernes et écuries accélèrent la formation dans la capitale | OK (en place) | +15 % dans la simulation [B]. Le chiffre est à revoir : voir § 4. |
| Siège : seuls les engins abîment le mur | OK | 83 catapultes pour abattre un Mur 15, 110 pour un Mur 20, en un combat [C]. Deux vrais Murs 15 abattus dans la simulation, par 101 et 105 engins [S]. |
| Mur des colonies limité au niveau 15 | OK | Mur 15 dans 68 colonies, Mur 20 dans les 38 capitales, 0 dépassement [B]. |
| 5 rounds de combat après la brèche | OK | Brèche au round 4, fin au round 9 [M]. |
| Rassemblement : 5 + niveau de la Place armées | OK | 25 armées à la Place 20 [S]. Le plafond n'a jamais gêné : 5 armées au plus [S]. |
| Donjons d'invasion réglés sur la puissance médiane | OK | Force de base 3 000 au début, 235 961 à la fin, soit environ 50 % de la puissance médiane (466 192) comme voulu [B]. |
| Bastion : mur non cumulé, régénération, 10 victoires | OK | Un assaut perdu n'enlève rien. Une vie revient toutes les 7,2 h [L]. |

### 2.3 Or, marchands, cachette

| Décision | Verdict | Preuve |
| --- | --- | --- |
| Chambre au Trésor : 10 à 200 or par jour | OK | 41 or/jour au niveau 10, 125 au 17, 200 au 20 [C]. 35 capitales au niveau 20 à la fin [B]. |
| L'or ne peut pas être pillé | OK | Raids et pillages ne prennent que bois, pierre, fer et céréales [L]. |
| Soin immédiat : 1 / 2 / 3 / 3 or par unité | OK | 2 503 unités soignées pour 7 509 or [S]. Il n'achète que du temps : les ressources du soin sont déjà payées [L]. |
| Espions (20 et 200 or), talents (100 or) | OK | 33 espions, 1 remise des talents payée [S]. |
| Nombre de marchands = niveau du Marché ; occupés à l'aller et au retour | OK | 760 marchands = 38 × 20. Jamais plus de marchands occupés que permis [S]. |
| Charge des marchands par civilisation, Comptoir, Poste du Désert | OK | Au Comptoir 20 : Rome 600, Huns 600, Grèce 720, Gaule 900, Égypte 900, Sultanat 1 400 [C]. |
| Marché et Comptoir dans la capitale seulement ; marchand du serveur | OK | 0 Marché en colonie [B]. Marchand du serveur : 69,2 M donnés, 61,6 M reçus (11 % de taxe) [S]. |
| Ravitaillement du Bastion par armée | OK | 2 Bastions financés et bâtis aux jours 47 à 51 [S]. |
| Cachette en quantité fixe (240 à 32 000 ; Gaule ×1,2) | OK | 20 % d'un Dépôt de même niveau [C]. Les joueurs automatiques s'arrêtent au niveau 3 : les niveaux plus hauts n'ont pas été joués. |

### 2.4 Monde et alliances

| Décision | Verdict | Preuve |
| --- | --- | --- |
| 2 000 joueurs au plus | OK | L'inscription se ferme à 2 000 [L]. 2 000 capitales se placent sans échec [C]. |
| Gisements semés | OK (comme codé) | 4 895 gisements à coloniser et 636 gisements d'or [B]. Mais il n'y en a pas assez : voir § 4. |
| Taille d'alliance : 3 par niveau d'Ambassade, 60 au plus | OK | Tests [T]. Alliances de 16, 15 et 5 membres [B]. |
| Vision : Tour de guet 5 + 6 × niveau | OK | Rayon 125 au niveau 20 ; armées de son alliance visibles partout [L]. |
| Rythme des invasions | OK | 29 invasions terminées, 43 donjons chacune [B]. |
| Calendrier de la Merveille | OK | Sites au jour 120 (12 sites à 3,0 M), plans au jour 150 (13 plans à 4,5 M) [B]. |
| Défi d'alliance de la semaine | OK (marche) | Médailles chaque semaine [B]. Le classement est à revoir : voir § 4. |

### 2.5 Non testé par la simulation (jugé par le calcul)

| Décision | Pourquoi non testé | Ce que dit le calcul |
| --- | --- | --- |
| Merveille ×5 (2,15 milliards au total) | Les joueurs automatiques n'ont pas de module Merveille. « Merveille niveau 0 » ne dit donc rien. | Voir § 4 (M6) et § 6.8. |
| Immortels ×5 et vagues ×5 | Même raison. | Une alliance de 15 à 16 prend un site et un plan : voir § 6.8. |
| Livraisons à la Merveille | Même raison. | Le chantier accepte tout, sans plafond, même avant le plan [L]. |
| Plafond des récompenses de quêtes | Aucune quête réclamée. | 80 000 par ressource (320 000 en tout), soit 1,4 h de production d'un compte complet [C]. |
| Trésor des invasions | Aucun donjon détruit. | Au plus 6 360 or par week-end pour tout le serveur [C]. |
| Camps d'or | Pas de compteur dans la simulation. | 636 camps, environ 0,3 par joueur à 2 000 joueurs : source marginale [B]. |

---

## 3. Ce qui ne marche pas (bugs)

| # | Problème | Verdict | À faire |
| --- | --- | --- | --- |
| 1 | **Fondation d'une colonie** : la colonie recevait les 3 000 de chaque ressource portés par les colons, alors que son stockage de départ est de 1 000. Le contrôle « ressources au-dessus du stockage » s'est déclenché 100 jours (jours 39 à 180) [S]. | **Trouvé et corrigé** (commit ce3c88c) | Rien. La colonie garde ce qu'elle peut stocker ; le reste va aux autres villes du joueur. Vérifié par les tests : la colonie démarre à 1 000 / 1 000 [T]. La simulation a tourné avec l'ancien code : les stocks des colonies sont un peu gonflés au début (8 000 de trop au plus par colonie), ce qui ne change rien aux conclusions. |
| 2 | **Fiche de l'Atelier** : elle dit « un engin frappe le mur dix fois plus fort qu'un soldat ». Depuis le 30 octobre, les soldats ne touchent plus du tout le mur [L]. | **Corrigé** (texte) | Remplacé par : « Seuls les engins de siège abîment le mur ; il en faut au moins un pour assiéger une ville. » C'était le seul texte périmé trouvé. |
| 3 | **Outil de simulation, mesure de puissance** : il ne lit pas le palier des unités. Il compte une élite comme une unité de base et ignore la valeur des engins. Sa puissance est trop basse d'un facteur 1,44 (médiane 326 946 au lieu de 466 192) [B]. | CASSÉ (outil seulement) | Le jeu lui-même compte juste (donjons, rassemblements). Corriger l'outil (il doit lire le palier) avant la prochaine simulation. Le tableau « Puissance militaire » du rapport brut de la simulation est donc faux d'autant. |
| 4 | **Outil de simulation, compteur des donjons vivants** : il affiche 1 247, alors qu'il n'y a que 43 donjons actifs. Il compte de vieilles lignes jamais marquées [B]. | Défaut d'affichage de l'outil | Ne compter que les donjons de l'invasion en cours. |

**Phrases fausses à corriger dans les documents :**

- « 4 900 gisements, assez pour environ 2 450 joueurs » (SPEC-BATIMENTS et SPEC-COLONIES) : faux. La carte tient environ 1 000 à 1 050 joueurs à 2 colonies (voir § 4, H1).
- « Compte complet entre les jours 84 et 132 » : avec les vraies dates de fondation des colonies, c'est plutôt entre les jours 114 et 154.
- « Une récompense de quête vaut 20 minutes de production » : c'est 1,4 heure.
- Dans le rapport brut de la simulation, « colonies aux jours médians 59 et 81 » compte aussi les colonies refondées après avoir été rasées. Les vraies premières fondations sont aux jours 52 et 79.

**Effets de bord (le code fait ce qui est écrit, mais cela gêne) :** les routes commerciales prennent tous les marchands libres (§ 4, M3) ; devant un Bastion, tous les camps d'une alliance qui finissent dans la même demi-minute font un seul assaut, sans plafond d'armées (§ 4, M4).

---

## 4. Équilibrage

### 4.1 Les points à régler, par priorité

| Priorité | Point | Proposition | Réglage concerné |
| --- | --- | --- | --- |
| **Haute** | H1. Pas assez de gisements pour 2 000 joueurs | Refaire le semis : 6 000 points, posés seulement là où une ville tient | Semis de la carte |
| **Haute** | H2. Trop d'or par les expéditions | Or seulement si le héros mène l'expédition ; 10 / 15 / 20 / 25 or espérés | Nouvelle règle + réglage de l'or des expéditions |
| Moyenne | M1. Élite pas assez rentable par ressource ; or sans usage | 2 or par élite, ressources ×0,85 (voir § 5) | `recruit.goldPerUnit.elite`, `recruit.eliteResourceCostMult` |
| Moyenne | M2. 3 intermédiaires sous leur unité de base, 4 trop forts | 7 endurances à changer | Fiches d'unités |
| Moyenne | M3. Une route prend tous les marchands | Toutes les routes ensemble : la moitié des marchands au plus | Nouvelle clé `market.routes.maxMerchantPct` = 50 |
| Moyenne | M4. Bastion : mur ×10 et assaut réuni sans plafond | Mur ×5 ; même plafond d'armées pour l'assaut réuni | `bastion.wallMultiplier` |
| Moyenne | M5. Alliances dispersées : peu de membres à portée d'un rassemblement | Choisir son côté de la carte à l'inscription ; attentes de 120 et 180 min | Inscription + attentes des rassemblements |
| Moyenne | M6. Merveille : c'est le transport qui fixe la fin (jours 175 à 220) | Charge ×3 pour les livraisons à la Merveille | Nouvelle règle |
| Basse | B1. Grandes casernes : 20 % au lieu des 30 % visés | 0,5 → 0,75 % par niveau | `capitalTrainTimeReductionPctPerLevel` |
| Basse | B2. Défi de la semaine gagné par la plus grosse alliance | Classer sur total ÷ max(membres, 20) | Calcul du défi |
| Basse | B3. Le niveau du gisement compte peu | Garder +10 % ; corriger les joueurs automatiques | — |
| Basse | B4. Comptoir faible en fin de partie | Garder (votre décision) ; option +10 % de charge par niveau | — |
| Basse | B5. Cachette faible dans une colonie pleine | Garder ; option ×2 dans les colonies | — |
| Basse | B6. Creux entre la fin du compte et la Merveille | Pas de changement (plus petit que prévu) | — |

### 4.2 Ce qui va bien

| Sujet | Chiffres | Objectif | Verdict |
| --- | --- | --- | --- |
| Rythme : capitale complète | Jours 73 / 80 / 102 à 5 / 3 / 2 connexions par jour [C] | 63 / 75 / 98 (RAPPORT-ECONOMIE § 4.4) | OK, 4 à 10 jours plus tard |
| Rythme : compte complet (avec les dates de colonies de la simulation) | Jour 114 (joueur actif), 124 (3 connexions), 154 (2 connexions) [C]. Les joueurs automatiques finissent leur plan au jour 161 [S]. | Avant ou vers les sites (jour 120) pour l'actif | OK |
| Blocage par le stockage | 0 refus [S]. Bois, pierre et fer de la capitale pleins 11 % du temps (toujours connecté) à 58 % (2 connexions) [C]. Doubler le stockage ne fait gagner que 2,4 jours [C]. | Pleins 11 à 53 % du temps | OK (5 points de trop à 2 connexions) |
| Stockage de la capitale (160 000) face aux niveaux 18 à 20 | Chambre au Trésor 18-20, Temple 18-20, Thermes 19-20, Irrigation 20, Brasserie 20, Tente de guerre 20 dépassent 160 000 [C]. Payés grâce au stockage des colonies [B]. | Le message « Stockage trop petit » explique quoi faire | OK |
| Une colonie vaut-elle la peine ? | Colonie complète 77 425 à 86 425/h ; compte à 2 colonies = 2,9 à 3,1 fois la capitale seule ; une colonie se rembourse en 223 à 249 h [C] | Rentable sans être obligatoire tout de suite | OK |
| Entretien 5 / 9 / 13 | 26 % des céréales à la médiane, 53 % au pire [B]. Le joueur médian pourrait nourrir 7 500 élites ; il garde environ 2 600 unités. | Pas de famine pour une armée raisonnable | OK |
| Coût des combats (soins) | Une perte coûte 51 % du prix à partir de la Tente 14 [C]. 4 000 élites prennent 41 à 49 h de soins à la Tente 20 [C]. | Les combats ont un coût | OK |
| Paliers base / intermédiaire / élite | Par céréale, l'élite vaut 1,74 intermédiaire et 1,86 base (18 lignes sur 18 au-dessus) [M]. Écart entre civilisations : 1,20 en base, 1,29 en élite [M]. | Chaque palier vaut plus que le précédent par céréale | OK |
| Forge | Forge 20 = +7,8 % [M] | Bonus modeste | OK |
| Sièges contre un mur défendu | Mur 15 : 83 catapultes (60 mangonneaux du Sultanat, 103 contre un mur égyptien). Mur 20 : 110 à 138 engins [C] | Un mur défendu demande un vrai effort | OK |
| Colonies neuves rasées | 54 colonies sur 125 rasées, 5 jours après leur fondation en médiane, 53 sur 54 sans mur [S]. Mais un vrai joueur bâtit un Mur 10 en 13 h de chantier pour 15 442 ressources [C]. | Votre décision : « défense en plus : NON » | OK (règle). Ce sont les joueurs automatiques qui ne bâtissent pas le mur et ne laissent aucune armée en colonie. |
| Immortels : sites (3,0 M) et plans (4,5 M) | Une alliance de 16 prend un site avec 40 % de son armée, un plan avec 60 % [M] | Demander une vraie alliance | OK |
| Vagues contre la Merveille | Une alliance de 16 tient jusqu'au niveau 92 avec toute son armée, 55 avec la moitié [M] | Fin de partie difficile | OK si la cible est une alliance de 40 à 60 joueurs |
| Donjons d'invasion | Niveau 1 battu par 2 joueurs ; niveau 4 par 16 ; chef du niveau 5 (9,7 à 9,9 M) par un rassemblement plein de 25 armées médianes (10,7 M) [M] | Niveau 5 réservé aux grandes alliances | OK. 0 donjon détruit à cause des joueurs automatiques (§ 6.6). |
| Taille des rassemblements, vision, taille d'alliance | Aucun plafond n'a gêné [S] | — | OK |
| Charge des marchands selon la civilisation | Écart de débit ×1,90 entre Rome et le Sultanat (×2,25 dans Travian) [C] | « Charges comme Travian » | OK |
| Trésor des invasions (part en or) | 3 520 or pour une alliance qui détruit les donjons 4 et 5, soit environ 59 or par membre et par semaine [C] | Bonus symbolique | OK |
| Cachette | Forte au début (le niveau 3 protège 29 % d'un petit stock), faible à la fin (5,5 % d'une capitale pleine au niveau 15, 20 % au niveau 20) [C] | Le raid reste du harcèlement | OK |

### 4.3 Ce qui ne va pas, point par point

#### H1. Pas assez de gisements pour 2 000 joueurs — priorité HAUTE

- **Constat.** 4 895 gisements sont semés [B]. Mais sur une carte vide, seuls 3 196 peuvent porter une ville : les autres sont hors de la terre principale, ou ont une case bloquée, ou un autre point trop près [C].
- Après les 2 000 capitales, on ne place que **1 737 à 1 762 colonies sur les 4 000 voulues, soit 44 %** [C].
- La carte tient en fait **environ 1 000 à 1 050 joueurs** à 2 colonies. À 1 200 joueurs, il manque déjà environ 320 colonies ; à 1 500, environ 1 000 [C].
- Les inscriptions restent ouvertes 2 mois : ce sont les derniers inscrits qui n'auront plus de gisement.
- **Proposition.** Ne poser un gisement que là où une ville tient, et poser les capitales à 3 cases au moins d'un gisement, avec un repli sur la règle actuelle si aucune place n'est trouvée (indispensable : 2 capitales sur 2 000 n'en trouvent pas). Avec les 4 895 points actuels : 92 % des colonies voulues. **Avec 6 000 points : 3 996 colonies sur 4 000** [C]. Pour cela, passer le facteur du semis de 0,035 à environ 0,043 et son plafond de 5 000 à 6 000. L'or garde 13 % : 780 camps.
- **Autre solution :** limiter le serveur à environ 1 000 joueurs.

#### H2. Or des expéditions — priorité HAUTE

- **Constat.** Une expédition rapporte en moyenne 50 / 75 / 60 / 37,5 or selon la difficulté 1 à 4 [L]. Il en apparaît environ une par heure, 15 ouvertes au plus. Il ne faut ni héros, ni grande armée, et la perte est arrondie à zéro sous 13 à 50 unités par troupe [L].
- Chaque ville a 5 armées de campagne (Place de la capitale au niveau 20), soit 15 armées avec 2 colonies [L].
- **Une seule connexion par jour avec 15 armées rapporte environ 834 or par jour, sans risque. Avec 2 connexions : 1 335** [C]. La Chambre au Trésor 20 en donne 200.
- Avec autant d'or, le prix en or de l'élite ne compte plus.
- La simulation ne le voit pas : les joueurs automatiques font 0,53 expédition par jour (environ 13 or par jour) et n'ont d'armées que dans leur capitale [S].
- **Proposition.**
  1. De l'or seulement quand le héros mène l'expédition, comme pour les objets aujourd'hui : une seule expédition payante à la fois.
  2. Mettre l'or dans les réglages : 50 % de chance, 10 + 10 × difficulté en moyenne, soit **10 / 15 / 20 / 25 or espérés**, qui croissent avec la difficulté.
- **Effet** : 2 à 8 expéditions par jour avec le héros rapportent 50 à 200 or par jour [C]. La Chambre au Trésor reste la source principale. Attention : les nouvelles valeurs sans la règle du héros ne suffisent pas (encore 263 or par jour).

#### M1. Prix de l'élite — priorité moyenne

Voir § 5.

#### M2. Unités intermédiaires après les retouches du 30 octobre — priorité moyenne

- **Constat.** Votre décision : chaque intermédiaire vaut au moins son unité de base par céréale d'entretien. Trois n'y arrivent pas : Cavalier du désert du Sultanat 0,69, Toxote 0,89, Archer gaulois 0,98 [M].
- Quatre retouches dépassent leur but par ressource : Tireur du désert 1,43, Archer du camp 1,35, Archer du désert 1,30, Cavalier hun 1,25 [M].
- L'écart entre la civilisation la plus forte et la plus faible au palier intermédiaire est passé de 1,25 (avant le 30 octobre) à **1,55** (Huns 1,23 contre Grèce 0,80) [M].
- **Proposition** (endurance) :

| Unité | Civilisation | Aujourd'hui | Proposé |
| --- | --- | --- | --- |
| Archer gaulois | Gaule | 50 | **51** |
| Toxote | Grèce | 50 | **54** |
| Cavalier du désert (intermédiaire) | Sultanat | 60 | **74** |
| Tireur du désert | Sultanat | 62 | **55** |
| Archer du désert (intermédiaire) | Égypte | 57 | **55** |
| Archer du camp | Huns | 57 | **52** |
| Cavalier hun | Huns | 78 | **74** |

- **Effet** [M] : les 18 intermédiaires valent au moins leur base par céréale (1,02 à 1,41). L'écart entre civilisations tombe de 1,55 à 1,30. Il ne reste que 2 fiches un peu fortes, déjà connues : Archer d'élite romain et Défenseur du palais.
- **Attention :** 4 de ces 7 changements reviennent en partie sur vos retouches du 30 octobre (Tireur du désert, Archer du désert, Archer du camp, Cavalier hun). Il faut votre accord. À mesurer en même temps que le nouveau prix de l'élite.

#### M3. Routes commerciales : elles prennent tous les marchands — priorité moyenne

- **Constat.** Un envoi de route charge autant que tous les marchands libres peuvent porter [L]. Une route de colonie vise jusqu'à 53 332 toutes les 2 h : il faudrait 38 à 89 marchands, alors qu'on en a 20 [C].
- Le code ne regarde pas si la ville d'arrivée a de la place. Ce qui ne tient pas repart avec les marchands, qui ont été bloqués pour rien [L].
- Dans la simulation, à partir du jour 105, **312 à 398 des 760 marchands sont sur des routes** : environ la moitié des joueurs n'a plus aucun marchand libre [S].
- Les échanges entre joueurs tombent de 233-322 par semaine (avant le jour 98) à 0 après le jour 140 [S]. Le stock plein des capitales y joue aussi.
- **Proposition.** Toutes les routes d'un joueur ensemble utilisent **au plus la moitié de ses marchands** (nouvelle clé `market.routes.maxMerchantPct` = 50). Et un envoi ne charge que ce que la ville d'arrivée peut encore recevoir.

#### M4. Bastion — priorité moyenne

**Un Bastion peut-il tomber ?** Oui, mais pas avec ce que les joueurs automatiques amènent.

- **Simulation.** 10 assauts, tous perdus. Dégâts au mur : 198 à 8 468 PV sur 200 000 (environ 1 700 en médiane) [S]. Les assauts comptaient 4 à 48 engins. Les joueurs automatiques ont un Atelier 10 et 24 engins chacun en médiane, alors que les alliances LUP et AQL ont 347 et 292 engins en tout [B]. (Le chiffre « 6 000 à 9 000 PV par assaut » était une estimation des joueurs automatiques, pas les vrais dégâts.)
- **Calcul avec la vraie garnison** [M]. Un engin fait environ 190 PV par combat. Engins nécessaires pour gagner le premier assaut, avec 30 % des soldats d'une alliance de 15 :

| Mur | PV | Engins pour la 1re vie |
| --- | --- | --- |
| ×10 (aujourd'hui) | 200 000 | 925 à 1 075 |
| ×5 | 100 000 | 475 à 550 |
| ×3 | 60 000 | 300 à 325 (les 347 engins actuels de LUP gagnent déjà) |

- Les engins survivent presque tous : ils resservent pour les 10 victoires, à condition d'aller plus vite que la régénération (1 vie toutes les 7,2 h).
- **Le coût n'est pas le frein** : 1 000 engins valent 2,16 M de ressources, soit environ 27 h d'Atelier pour chacun des 15 membres [C].
- **Le frein, c'est de réunir les engins dans un seul assaut.** Avec des engins (vitesse 20), seuls 3 à 5 membres sont à portée d'un rassemblement d'une heure. Sinon, il faut des arrivées synchronisées à la demi-minute près.
- **Effet de bord :** devant un Bastion, tous les camps d'une alliance qui finissent dans la même demi-minute font un seul assaut, **sans plafond d'armées**. Cela contourne la taille de rassemblement décidée le 31 octobre (5 + niveau de la Place) [L].
- **Une garnison faite de TOUTE l'armée d'une alliance reste imprenable** : 15 000 engins à ×10, 8 000 à ×5 [M].
- **Proposition.** Passer le mur de ×10 à **×5** (100 000 PV, environ 500 engins réunis pour la première vie), et appliquer à l'assaut réuni la même limite d'armées que les rassemblements. Garder ×10 si vous voulez des Bastions presque imprenables.

#### M5. Alliances dispersées : peu de membres à portée d'un rassemblement — priorité moyenne

- **Constat.** Les capitales apparaissent au hasard sur les 4 bords. Deux capitales d'une même alliance sont à 215 à 224 cases l'une de l'autre en médiane [B].
- Membres à portée d'un rassemblement d'une heure au plus (vitesse 40) : AQL 7 sur 16, LUP 4 sur 15, CMR 2 sur 5. À 3 h : 16 sur 16 et 15 sur 15 [C].
- Ce n'est pas un blocage total : les Immortels et les étages de donjon gardent leurs pertes, on peut donc les user. Mais cela coûte cher. Au jour 120, AQL prend un site en 2 vagues d'armées seules et y perd **environ 20 % de sa force**, contre 6 à 8 % avec un vrai rassemblement des 16 [M].
- Avec de vrais joueurs, les alliances se formeront plutôt entre voisins. La dispersion vient en partie de la simulation.
- **Proposition.** Laisser choisir un côté de la carte à l'inscription, comme dans Travian, avec un repli sur les 4 côtés. Et ajouter des attentes de 120 et 180 minutes aux rassemblements.

#### M6. Merveille : c'est le transport qui fixe la fin — priorité moyenne

- **Coût** [C] : 2,15 milliards pour les niveaux 1 à 100. Niveaux 1 à 50 : 172,7 M. Chantier : 432,5 h en tout (18 jours) ; les niveaux 51 à 100 durent à eux seuls 336 h, donc pas de fin avant le jour 164 environ.
- **Production** [C] : c'est 5,5 jours de production d'une alliance de 60, 20,5 jours d'une alliance de 16. Votre objectif « plusieurs jours de production d'une alliance » est tenu pour une grande alliance.
- **Transport** [C] : une armée en transport porte au plus 1,2 M par jour ; les marchands 0,2 à 0,4 M par jour et par joueur. Une alliance de 60 met **au moins 25 jours** de transport sans arrêt, et environ 40 à 70 jours à 3 transports par jour. La fin arrive donc vers les **jours 175 à 220** selon l'activité.
- Le chantier accepte les livraisons sans plafond dès qu'on tient une Ville Merveille, même pour les niveaux qui demandent un plan [L]. On peut donc livrer dès le jour 120.
- **Proposition (à choisir selon la durée de monde voulue)** :
  1. **Recommandé :** une charge ×3 pour les livraisons vers une Ville Merveille (nouvelle règle). Le transport devient environ 3 fois plus court, et la fin se rapproche du minimum du chantier. Votre coût ×5 et le grand débouché de fin de partie sont gardés.
  2. Diviser le coût par deux : 125 000 / 125 000 / 125 000 / 37 500 au niveau 1 (1,07 milliard). Fin vers les jours 180 à 190 (estimation). Il suffit de changer un réglage.
  3. Garder tel quel, et écrire dans les documents que la fin est vers le jour 220.
- Dans tous les cas, écrire dans la fiche de la Merveille que l'armée est le vrai moyen de la ravitailler.

#### B1. Grandes casernes et grandes écuries — priorité basse

- **Constat.** Avec 2 colonies, le bonus de la capitale plafonne à 2 × 20 × 0,5 = **20 %**. La décision visait 30 % (calcul fait avec 3 colonies) [C].
- **Proposition.** 0,5 → **0,75 % par niveau** : on retrouve 30 % avec deux bâtiments au niveau 20. La capitale avec Caserne 20 forme alors en 60 % du temps normal, sous le plafond de 60 % de réduction.

#### B2. Défi d'alliance de la semaine — priorité basse

- **Constat.** Le score est la somme des membres. AQL (16 membres) a gagné 12 semaines sur 18 [B]. Avec 2 000 joueurs, les alliances de 60 gagneront presque toujours. 750 points ne valent que 9 375 à 11 250 ressources à la boutique, alors qu'un joueur en produit environ 243 000 par heure [C].
- **Proposition.** Classer sur **total ÷ max(membres, 20)**, en gardant 750 / 500 / 250 points. Prévoir plus tard des achats de fin de partie pour les points d'alliance (17 690 points non dépensés en médiane [B]).

#### B3. Spécialité des colonies : le niveau du gisement compte peu — priorité basse

- **Constat.** Un gisement de niveau 3 rapporte 4,6 % (bois) à 6,7 % (céréales) de plus qu'un niveau 1, soit environ 1,5 à 2,2 % du compte entier [C]. Le type de gisement compte bien plus : une colonie de céréales fait 42 % de céréales de plus qu'une colonie de bois [C].
- Dans la simulation : 118 fondations sur un niveau 1, 7 sur un niveau 2, 0 sur un niveau 3 [S]. C'est d'abord la faute des joueurs automatiques : dans leur choix, la force de la tribu pèse 100 fois plus que le bonus [L].
- Un vrai joueur bat une tribu de niveau 2 du bord de carte vers le jour 56, et une tribu de niveau 3 du bord (91 000 à 110 000) vers les jours 70 à 84 [M][S]. Il reste 334 à 340 gisements de niveau 3 libres après 2 000 capitales [C].
- **Proposition.** Garder +10 % par niveau (votre choix, qui évite une course aux gisements de céréales de niveau 3). Corriger les joueurs automatiques. Passer à 15 % plus tard si le niveau 3 n'attire aucun combat. (Passer à 20 % donnerait +2,3 à 3,3 % à toutes les colonies.)

#### B4. Comptoir de commerce faible en fin de partie — priorité basse

- **Constat.** La taxe entre joueurs tombe à 0 dès le Comptoir 5 avec une Chambre au Trésor 20. Les niveaux 6 à 20 n'ajoutent ensuite que +1 % de charge chacun [C]. L'enjeu est faible : le marchand du serveur a fait 69,2 M d'échanges, contre 8,9 M entre joueurs [S].
- **Proposition.** Garder (votre décision « +1 % par niveau »). Option : +10 % de charge par niveau pour les seuls marchands (un Romain porterait 30 000 par voyage au lieu de 12 000).

#### B5. Cachette des colonies — priorité basse

- **Constat.** Avec la cachette fixe, une colonie pleine (640 000 par ressource) n'est protégée qu'à 5 % au niveau 20 [C]. L'ancienne règle des colonies protégeait 20 % du stock. (L'Oppidum à 30 % a été refusé.)
- **Proposition.** Garder. Option : doubler la cachette dans les colonies (64 000 au niveau 20, soit 10 %).

#### B6. Creux entre la fin du compte et la Merveille — priorité basse

- **Constat.** À partir du jour 154, les stocks sont pleins à 97 % (médiane 5,41 M) et les échanges s'arrêtent [S]. Mais le chantier de la Merveille accepte les livraisons sans plafond dès le jour 120 [L]. Le creux n'est donc que d'environ 6 jours pour le joueur actif (compte fini vers le jour 114).
- Pour les alliances sans site de Merveille (il n'y a que 12 sites), il reste la guerre, le Bastion et les soins.
- **Proposition.** Pas de changement. (Les idées « plans au jour 135 » ou « 70 niveaux sans plan » ne sont pas nécessaires.)

---

## 5. L'or et l'élite

### 5.1 Ce que montrent les chiffres

| Mesure | Chiffre | Source |
| --- | --- | --- |
| Valeur au combat d'une élite | **1,657 intermédiaire** en moyenne (Rome 1,689, Gaule 1,639, Grèce 1,697, Égypte 1,649, Huns 1,610, Sultanat 1,658). Même valeur pour de petites et de grandes armées. | [M] |
| Prix actuel d'une élite | 380 ressources + 1 or (cavalerie 486 + 1 or), soit **1,689 fois** un intermédiaire | [C] |
| Rentabilité par ressource | L'élite est **2 % moins rentable** que l'intermédiaire, même sans compter l'or. C'est contraire à votre décision 15 (« au moins aussi rentable par ressource et par céréale »). | [M][C] |
| Point le plus faible | Cavalerie d'élite hun : 12 % trop chère | [M] |
| Rentabilité par céréale | L'élite est meilleure : 15 % de plus par céréale d'entretien | [M][C] |
| Revenu d'or par joueur et par jour | 47 (jours 56-84), 132 (84-112), 217 (112-140), 220 (140-168) | [S] |
| Or jamais dépensé | **72 %** : 544 649 or restent (environ 15 000 par joueur en médiane, soit 73 jours de Chambre 20), pour 211 250 dépensés. Personne n'a manqué d'or. | [S][B] |
| Part des élites | 54 % des recrues (202 981 sur 372 782) | [S] |
| Part du revenu prise par l'or des élites, au rythme de la simulation | 1 or : 24 à 34 % ; 2 or : 49 à 69 % ; 3 or : 73 à 103 % (impayable aux jours 84-112) | [S][C] |
| Un vrai joueur | Il nourrit environ 6 000 élites et en perd environ 110 à 125 par jour : 55 % de son or à 1 or, environ 100 % à 2 or | [C] |

**Deux remarques.**

- L'or ne s'échange contre aucune ressource dans le jeu : le soin immédiat n'achète que du temps. On ne peut donc pas donner un « prix de l'or en ressources ». L'or sert à **limiter le nombre d'élites**.
- Les joueurs automatiques plafonnent leur armée à environ 2 700 unités (règle de l'outil, pas du jeu). Une partie de l'or non dépensé vient de là.

### 5.2 Proposition

| Option | Or par élite | Ressources (infanterie et archers / cavalerie) | Rentabilité par ressource face à l'intermédiaire, sans compter l'or | Remarque |
| --- | --- | --- | --- | --- |
| Aujourd'hui | 1 | ×0,95 : 380 / 486 | −2 % | Contraire à la décision 15 ; l'or ne freine rien |
| **Recommandé** | **2** | **×0,85 : 340 / 435** | **+9,7 %** | À égalité tant qu'un or vaut moins de 16 à 21 ressources. L'or devient une vraie limite : environ la moitié du revenu au rythme de la simulation, presque tout pour une grosse armée. L'intermédiaire, sans or, garde un rôle. |
| Élite nettement favorisée | 2 | ×0,80 : 320 / 410 | +16,5 % | À égalité jusqu'à 26 à 34 ressources par or |
| Si l'or reste à 1 | 1 | ×0,90 : 360 / 461 | +3,6 % en moyenne | L'élite vaut au moins l'intermédiaire dans les 6 civilisations ; elle n'est pas bradée (au plus 6 % sous sa valeur) |
| Parité seulement | 1 | ×0,93 : 373 / 476 | 0 % en moyenne | Quelques civilisations restent en dessous |
| 3 or | 3 | — | — | **À éviter** : impayable en milieu de partie |

**Recommandation : 2 or par élite, prix en ressources ×0,85.** Réglages : `recruit.goldPerUnit.elite` = 2 et `recruit.eliteResourceCostMult` = 0,85.

**Conditions et suites :**

- Cela ne vaut que si l'or des expéditions est corrigé (§ 4, H2). Sinon, avec 834 or par jour, l'or ne limite rien.
- La cavalerie d'élite hun reste un peu trop chère même à ×0,85 (environ 2 %). Il vaut mieux corriger sa fiche que le prix de toutes les élites. À mesurer avec la retouche du Cavalier hun intermédiaire (§ 4, M2).
- Le Mamelouk du palais, qui baisserait un peu avec le renfort du Cavalier du désert intermédiaire, reste rentable à ×0,85.
- Soin immédiat : garder 1 / 2 / 3 / 3 or. Avec 2 or au recrutement, 3 or pour soigner tout de suite une élite reste cohérent.
- Chambre au Trésor : ne rien changer.

---

## 6. Ce que montre la simulation

### 6.1 Déroulé

- 38 joueurs automatiques, 175 jours simulés, un tour toutes les 6 h [S].
- 289 493 appels au serveur, **0 erreur serveur et 0 erreur écrite par le serveur** [S].
- Coupée par une limite de temps au jour 117, puis reprise sur le même monde [S].
- Refus les plus fréquents, tous normaux : 125 raids sans chemin terrestre, 14 rassemblements rejoints trop tard, 6 offres vers une ville assiégée [S].

### 6.2 Rythme des joueurs

| Étape | Toujours connecté | 5 connexions/jour | 3 connexions/jour | 2 connexions/jour | Source |
| --- | --- | --- | --- | --- | --- |
| Capitale complète | jour 84 * | jour 73 | jour 80 | jour 102 | [C] |
| Compte complet (colonies aux jours 52 et 79, comme dans la simulation) | jour 114 | — | jour 124 | jour 154 | [C] |
| Objectif capitale (RAPPORT-ECONOMIE § 4.4) | — | 63 | 75 | 98 | — |

\* Le joueur toujours connecté finit sa capitale plus tard, car il fait passer ses colonies d'abord.

- Les joueurs automatiques (2 connexions par jour, avec une armée) finissent leur plan de construction au jour 161 : 33 sur 38 [S].
- Les 8 recherches sont au niveau 20 au jour 119 en médiane [S].
- Stock médian : 1,18 M au jour 112, 3,00 M au jour 126, 5,41 M au jour 154 (97 % du stockage) [S].

### 6.3 Colonies

- **72 colonies pour 38 joueurs** (76 au plus) ; 35 joueurs ont eu leur 2e colonie [B].
- 1re colonie au jour 52 en médiane (90 % des joueurs avant le jour 54), 2e colonie au jour 79 [S]. Les joueurs automatiques devaient d'abord battre la tribu du gisement.
- **Niveaux des gisements** [B] : 2 555 de niveau 1, 1 641 de niveau 2, 699 de niveau 3. Fondations : 118 sur un niveau 1, 7 sur un niveau 2, 0 sur un niveau 3 [S]. Les niveaux 2 et 3 sont à portée d'un vrai joueur vers les jours 56 et 70-84 ; c'est le choix des joueurs automatiques qui les écarte (§ 4, B3).
- **54 colonies rasées sur 125 fondations**, chez 5 joueurs seulement (16, 12, 11, 10 et 5 colonies), 5 jours après leur fondation en médiane [S]. Ces 5 joueurs restent à 3 405 à 8 190 de population, contre 8 755 pour un compte complet [B].
- **Murs des colonies** : 162 vagues de siège sur 180 contre des colonies n'ont trouvé aucun mur [S]. À la fin, 69 colonies sur 72 ont un mur (68 au niveau 15) [B]. Aucune armée n'est stationnée en colonie [B]. C'est une limite des joueurs automatiques, pas de la règle.

### 6.4 Armées, nourriture, puissance

| Jour | Puissance médiane d'un joueur (du jeu) | Source |
| --- | --- | --- |
| 56 | environ 47 000 | [S] × 1,44 |
| 84 | environ 165 000 | [S] × 1,44 |
| 112 | environ 348 000 | [S] × 1,44 |
| fin | 466 192 | [B] |

- Aucune famine. L'entretien prend 26 à 27 % des céréales en fin de partie [B].
- Les joueurs automatiques ont réduit leurs recrutements faute de céréales 1 503 fois, presque toutes avant le jour 112 [S]. Les céréales limitent l'armée jusqu'au jour 84 environ, puis plus du tout.
- L'armée plafonne vers 2 600 unités par joueur dès le jour 140 environ [S]. C'est une règle des joueurs automatiques (40 + 45 × somme des niveaux du Bâtiment principal), pas une limite du jeu.
- Élites : 59 % des unités vivantes à la fin [B].
- Soins : 145 100 unités soignées en 10 291 lancements, 210 attentes faute de ressources [S].

### 6.5 Alliances, Bastions, défi

- 3 alliances : AQL (16 membres, 7,55 M de puissance à la fin), LUP (15 membres, 6,31 M), CMR (5 membres) [B].
- Bastions placés au jour 25, financés aux jours 47-48, bâtis aux jours 50-51 [S].
- 10 assauts de Bastion, aucun gagné (voir § 4, M4).
- Défi de la semaine : AQL 1re 12 fois sur 18, LUP 4 fois, CMR 2 fois [B]. Les 4 semaines « Chasseurs de hordes » n'ont pas de gagnant, faute de dégâts aux donjons.

### 6.6 Invasions

- 29 invasions terminées, 43 donjons chacune, **0 donjon détruit** [B].
- 118 étages battus : 104 avant-postes du niveau 1, 2 remparts du niveau 1, 12 avant-postes du niveau 2. Dernière victoire au jour 76 [S].
- **Les donjons sont-ils trop forts ? Non.** Force des donjons en fin de partie [M] : niveau 1 = 0,24 / 0,47 / 0,94 M (avant-poste / remparts / chef), soit 0,5 / 1 / 2 joueurs médians. Le plus fort joueur d'AQL (673 000) bat seul 2 étages sur 3 du niveau 1. 2 joueurs battent tout le niveau 1. 16 joueurs battent tout le niveau 4. Un rassemblement plein de 25 armées médianes (10,7 M) bat le chef du niveau 5 (9,7 à 9,9 M).
- **C'est une limite des joueurs automatiques** [L] : ils n'attaquent qu'avec 1,08 fois la force de l'étage, avec leurs 2 troupes les plus nombreuses, et sans les armées de garnison (10 718 unités à la fin). Ils n'usent jamais un étage, alors que les pertes des étages restent. Après le jour 76, « pas de cible » passe de 800 à 3 015 fois.

### 6.7 Marché

- Les 38 joueurs ont le Marché 20 dès le jour 84 : 760 marchands [S].
- 2 300 offres acceptées, 8,9 M échangés entre joueurs. Le marchand du serveur a échangé 69,2 M [S].
- « Pas assez de marchands » : 137 fois au jour 49, 1 989 au jour 98, 14 367 à la fin. Ce sont des contrôles des joueurs automatiques, pas des refus du serveur [S]. La cause principale, après le jour 98 : les routes (§ 4, M3).
- **Les marchands suffisent-ils ?** Oui, une fois les routes limitées. 20 marchands portent 12 000 (Rome) à 28 000 (Sultanat) par voyage [C]. C'est peu face à une colonie qui produit 77 000 à 86 000 par heure, mais on transporte peu : les dépenses puisent dans toutes les villes, le marchand du serveur convertit sans marchand, et une armée de transport porte environ 25 fois plus qu'un Marché romain.

### 6.8 Merveille (jugée par le calcul)

Les joueurs automatiques n'ont pas de module Merveille. Voici ce que donnent les vraies armées de la simulation contre les vrais chiffres du jeu [M] :

| Cible | Force | AQL (16 membres) | LUP (15 membres) | CMR (5 membres) |
| --- | --- | --- | --- | --- |
| Site (jour 120) | 3,0 M | pris avec 40 % de l'armée | 45 % | non |
| Plan (jour 150) | 4,5 M | pris avec 60 % de l'armée | 70 % | non |
| Vagues (3,9 M au niveau 50, 10,0 M au niveau 100) | — | tient jusqu'au niveau 92 (toute l'armée), 55 (la moitié) | 81 / 49 | — |

- Au jour 119, AQL vaut environ 5,9 M. Un site vaut environ 6 joueurs médians.
- **Portée** : seuls 7 membres d'AQL sur 16 sont à portée d'un rassemblement d'une heure. Ensemble, ils prennent un site (14 % de pertes) mais pas un plan. En usant les Immortels avec des armées seules, AQL prend un site en perdant environ 20 % de sa force (§ 4, M5).
- Les Immortels gardent leurs pertes, et la prise revient au dernier vainqueur. **Une alliance peut donc finir un site usé par une autre** [L].
- **Coût et transport** : voir § 4, M6. Fin vers les jours 175 à 220 avec les chiffres actuels.

### 6.9 Limites des joueurs automatiques (à corriger avant la prochaine simulation)

| Limite | Effet dans la simulation |
| --- | --- |
| Pas de module Merveille | Merveille, sites, plans et vagues non joués |
| Invasions : 2 troupes, sans la garnison, jamais d'usure | 0 donjon détruit |
| Atelier 10, 24 engins chacun | 0 Bastion tombé |
| Mur bâti tard en colonie, aucune armée stationnée | 54 colonies rasées |
| Alliances formées au hasard sur la carte | Membres loin les uns des autres |
| Choix du gisement dominé par la force de la tribu | 0 colonie de niveau 3 |
| Armée plafonnée à environ 2 700 unités | Entretien et or peu sollicités |
| Cachette arrêtée au niveau 3, aucune quête réclamée | Ces règles non jouées plus haut |
| Ils vérifient avant d'acheter ou d'envoyer | Les refus du serveur (stockage, marchands) jamais vus |

---

## 7. Questions pour le propriétaire

*La proposition recommandée est en premier.*

**Priorité haute**

1. **Gisements.** Sur la carte actuelle, il n'y a de la place que pour 44 % des 4 000 colonies voulues ; le serveur tient environ 1 000 à 1 050 joueurs à 2 colonies.
   **Recommandé :** refaire le semis (6 000 points posés là où une ville tient, capitales à 3 cases au moins d'un gisement, avec un repli). *Autre choix :* limiter le serveur à environ 1 000 joueurs.
2. **Or des expéditions.** Aujourd'hui, une connexion par jour avec 15 armées rapporte environ 834 or par jour, sans risque.
   **Recommandé :** or seulement quand le héros mène l'expédition, et 10 / 15 / 20 / 25 or espérés selon la difficulté (50 à 200 or par jour). *Autre choix :* garder (l'or ne limitera rien).

**Priorité moyenne**

3. **Prix de l'élite.**
   **Recommandé :** 2 or + ressources ×0,85 (340 / 435). *Autres choix :* 2 or + ×0,80 (320 / 410) ; ou garder 1 or avec ×0,90 (360 / 461). Aujourd'hui, l'élite est 2 % moins rentable que l'intermédiaire, contrairement à votre décision 15.
4. **Unités intermédiaires.** Acceptez-vous les 7 changements d'endurance du § 4 (M2), dont 4 reviennent en partie sur vos retouches du 30 octobre ?
   **Recommandé :** oui. Chaque intermédiaire vaut alors au moins sa base par céréale, et l'écart entre civilisations passe de 1,55 à 1,30.
5. **Routes commerciales.**
   **Recommandé :** toutes les routes ensemble prennent au plus la moitié des marchands, et un envoi ne charge que ce que la ville d'arrivée peut recevoir. *Autre choix :* garder, et l'écrire dans la fiche de la route.
6. **Mur du Bastion.**
   **Recommandé :** ×5 (environ 500 engins réunis pour la première vie), et la même limite d'armées pour l'assaut réuni que pour un rassemblement. *Autres choix :* ×10 (environ 1 000 engins dans un même assaut) ; ×3 (les engins qu'une alliance a déjà suffisent).
7. **Bastion défendu par toute l'alliance.** Il reste imprenable (8 000 engins à ×5, 15 000 à ×10). Est-ce voulu ?
   **Recommandé :** oui, c'est le prix de la défense : toute l'armée est alors bloquée dans le Bastion.
8. **Rassemblements.**
   **Recommandé :** les deux : choisir son côté de la carte à l'inscription, et ajouter des attentes de 120 et 180 minutes. *Autre choix :* garder ; une alliance dispersée prend quand même les sites, mais y perd environ 20 % de ses troupes au lieu de 6 à 8 %.
9. **Merveille : quelle durée de monde voulez-vous ?** Avec les chiffres actuels, le transport fixe la fin vers les jours 175 à 220.
   **Recommandé :** charge ×3 pour les livraisons vers la Merveille (votre coût ×5 est gardé). *Autres choix :* coût divisé par deux (125 000 / 125 000 / 125 000 / 37 500) ; ou garder, et écrire « fin vers le jour 220 ».
10. **Taille d'alliance visée pour la fin de partie.** Avec 15 à 16 membres, la Merveille plafonne vers les niveaux 81 à 92 et le chef du donjon niveau 5 est hors de portée.
    **Recommandé :** viser des alliances de 40 à 60 joueurs, et ne rien changer aux Immortels.

**Priorité basse**

11. **Immortels usés.** Une alliance, ou même un joueur seul, peut finir un site usé par une autre.
    **Recommandé :** garder, cela crée de la rivalité autour des sites.
12. **Colonies neuves.** Elles tombent dans la simulation parce que les joueurs automatiques ne bâtissent pas le mur et ne laissent pas d'armée.
    **Recommandé :** garder votre décision « défense en plus : NON » et corriger seulement les joueurs automatiques. *Autre choix :* une protection de 24 à 72 h après la fondation.
13. **Grandes casernes.**
    **Recommandé :** 0,75 % par niveau, pour retrouver les 30 % visés avec 2 colonies.
14. **Défi de la semaine.**
    **Recommandé :** classer sur total ÷ max(membres, 20). *Autre choix :* garder le total des membres.
15. **Spécialité des colonies.**
    **Recommandé :** garder +10 % par niveau. *Autres choix :* 15 % ou 20 % (le niveau 2 vaudrait un combat, mais toutes les colonies produiraient 2,3 à 3,3 % de plus).
16. **Comptoir de commerce.**
    **Recommandé :** garder +1 % par niveau (votre décision). *Autre choix :* +10 % de charge par niveau pour les marchands.
17. **Cachette des colonies.**
    **Recommandé :** garder (5 % d'une colonie pleine). *Autre choix :* la doubler dans les colonies (10 %).
18. **Chambre au Trésor sans colonie.** Elle s'arrête au niveau 17 (125 or par jour), car le niveau 18 coûte plus de bois qu'un Dépôt 20 n'en contient.
    **Recommandé :** garder ; c'est une raison de fonder ses colonies.
19. **Trésor des invasions.**
    **Recommandé :** garder 40 or par niveau (bonus symbolique). *Autre choix :* 200, si vous voulez qu'il compte.
20. **Nouvelle simulation.**
    **Recommandé :** oui, une simulation de fin de partie avec des joueurs automatiques corrigés (§ 6.9), après vos choix.

---

## 8. Ce qu'il reste à faire avant de tester le jeu

**A. Vos décisions**

- [ ] Répondre aux questions du § 7, au moins les 10 premières.

**B. Corrections sans débat**

- [x] Corriger la fiche de l'Atelier (§ 3, n° 2) — fait.
- [ ] Corriger les phrases fausses des documents (§ 3).
- [ ] Ajouter dans la fiche de la Merveille que l'armée est le vrai moyen de la ravitailler.
- [ ] Corriger l'outil de simulation : puissance avec le palier des unités, compteur des donjons vivants.

**C. Changements importants, selon vos choix**

- [ ] Refaire le semis des gisements, ou limiter le serveur à environ 1 000 joueurs (H1).
- [ ] Or des expéditions : héros seul, 10 à 25 or (H2).
- [ ] Prix de l'élite (§ 5), à appliquer avec le point précédent.
- [ ] Les 7 endurances d'intermédiaires (M2), mesurées avec le nouveau prix de l'élite.
- [ ] Limite des marchands pour les routes, et envoi limité à la place libre (M3).
- [ ] Mur du Bastion et limite de l'assaut réuni (M4).
- [ ] Côté de la carte à l'inscription, attentes de 120 et 180 minutes (M5).
- [ ] Transport vers la Merveille ou coût de la Merveille (M6).
- [ ] Les réglages de priorité basse retenus (B1, B2, …).
- [ ] Mettre à jour EQUILIBRAGE.md avec les valeurs finales.

**D. Vérifier**

- [ ] Relancer tous les tests (lint, unitaires, de bout en bout, conformité, navigateur).
- [ ] Améliorer les joueurs automatiques (§ 6.9) : module Merveille ; invasions avec toutes les troupes, garnison comprise, et attaques d'usure ; Forge et Atelier au niveau 20 avec 60 à 70 engins chacun ; mur en premier chantier d'une colonie neuve et armée stationnée ; alliances entre voisins ; meilleur choix des gisements ; cachette plus haute ; quêtes réclamées.
- [ ] Relancer une simulation, au moins de la fin de partie (jours 110 à 200), pour valider la Merveille, les Bastions, les invasions et le nouvel équilibre de l'or.
