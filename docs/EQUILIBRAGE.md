# Équilibrage — vérification d'octobre 2026

Vérification de ce que le jeu applique réellement (code serveur) contre ce que les données annoncent, et lecture des
courbes. Chiffres tirés de `data/*.json` et `src/config/index.js` ; calculs reproductibles avec les commandes du § 6.
Mise à jour du 30 octobre 2026 : décisions d'équilibrage D1 à D12 du propriétaire (§ 13) et chiffres refaits avec les
outils sur le moteur actuel (§ 2, 7, 8, 9, 11, 12) ; le soir, décisions sur l'économie, le placement des bâtiments et le
stock partagé entre les villes (§ 14). Mise à jour du 31 octobre 2026 : rôle des colonies (décisions du 30 octobre, puis
2 colonies par joueur, 2 000 joueurs par serveur et la spécialité du gisement), chiffres à régler plus tard (§ 15), revue des
bâtiments (§ 16). **Le soir du 31 octobre 2026 : décisions du rapport de vérification (§ 17)**, qui remplacent les chiffres
plus anciens des paragraphes précédents (cachette, marchands, taxe, élite, Ambassade, Grandes casernes, Bastion, Merveille,
Immortels, trésor des invasions, carte et gisements). **Le 1er novembre 2026 : décisions après la simulation de 200 jours
(§ 18)** : stock commun pour ce qu'une armée emporte, armées rattachées aux colonies, vies du Bastion, camp brisé ensemble,
donjons, site de Merveille réservé.

## 1. Bonus de civilisation : définis, appliqués, et où

| Civilisation | Bonus (data/factions.json) | Appliqué dans | Verdict |
|---|---|---|---|
| Rome | +10 % défense des unités | tout combat (attaque de ville, pillage, tribu) | ✅ |
| Rome | −15 % pertes en siège (subies ou infligées) | combats de ville et de Bastion : solidité des unités romaines × 1,15, qu'elles attaquent ou défendent ; pas en pillage ni contre les camps (combats par la puissance) | ✅ conforme à « en siège » |
| Gaule | +20 % défense chez soi | défense de ses villes, tout combat ; depuis le 30 octobre 2026, son mur encaisse aussi 1/1,2 des coups des engins | ✅ |
| Gaule | +20 % cachette | part du stockage à l'abri × 1,2 (cachette à 1,5 % du stockage par niveau depuis le 31 octobre 2026 au soir : 36 % au niveau 20 pour la Gaule ; quantité fixe le matin, +15 % d'une part plafonnée à 20 % avant) | ✅ |
| Grèce | −15 % temps de construction | chaque construction | ✅ |
| Grèce | +15 % blessés au lieu de morts | taux de blessés après combat (+15 points, plafond 70 %) | ✅ |
| Égypte | +20 % transport | butin des pillages, envois et échanges par armée (plus de marchands depuis le 31 octobre 2026 au soir) | ✅ |
| Égypte | +25 % santé des murs | points de vie du mur (1 250 PV/niv. au lieu de 1 000), en construction comme à la réparation ; **corrigé** en octobre : portait auparavant sur le bonus de défense du mur | ✅ après correction |
| Huns | +20 % vitesse des armées | tout déplacement | ✅ |
| Huns | +10 % attaque en siège | attaques de ville et de Bastion, engins compris (dégâts au mur) | ✅ |
| Sultanat | +25 % dégâts des engins aux murs | dégâts au mur des engins du Sultanat : chaque engin porte le bonus de sa civilisation (vérifié le 30 octobre 2026, l'audit le croyait inactif ; testé dans `tests/unit/combat.test.js`) | ✅ |
| Sultanat | +15 % attaque en défendant sa ville | attaques de ville subies | ✅ |

Les cartes de l'inscription n'affichaient qu'un bonus sur deux par civilisation : elles montrent maintenant les deux, avec les
valeurs que le serveur applique (reçues avec `/api/world/info`). Valeurs relevées de 5 points en octobre 2026, voir § 7.

## 2. Unités : l'avantage de chaque civilisation est-il là où on l'a mis ?

Moyennes des 9 unités de combat (hors siège), fiches retouchées le 30 octobre 2026 comprises (D12, ci-dessous) :

| Civilisation | Attaque | Défense | Endurance | Vitesse | Transport | Identité lue dans les chiffres |
|---|---|---|---|---|---|---|
| Rome | 53,7 | **54,7** | 58,6 | 56,7 | 55,6 | la meilleure défense, la plus lente : infanterie de ligne ✅ (Légionnaire : meilleure défense de l'infanterie d'élite, 82) |
| Gaule | 56,1 | 47,8 | 56,9 | 60,0 | 53,9 | attaque et vitesse, défense faible ✅ (Champion gaulois = meilleure attaque d'infanterie, 77) |
| Grèce | 53,7 | 51,0 | 58,2 | 60,0 | 52,2 | équilibrée, infanterie défensive ✅ (Spartiate : 86 d'endurance, la plus haute de l'infanterie) |
| Égypte | 56,1 | 46,8 | **59,2** | 61,1 | 54,4 | endurance et attaque, cavalerie rapide ✅ |
| Huns | **60,1** | 41,6 | 56,0 | **66,7** | 56,1 | attaque et vitesse maximales, défense minimale ✅ (cavalerie de base à 90 de vitesse) |
| Sultanat | 57,1 | 45,3 | 56,7 | 65,0 | 56,1 | rapide et offensive ; sa force est en défense de ville (+15 % d'attaque) et dans ses engins (+25 % au mur) ✅ |

Coûts : les coûts des 60 unités dans les données sont exactement ceux que le serveur facture (base de classe × palier). ✅

**Moteur de bataille du GDD (décision du 30 octobre 2026, D10, option B de `docs/RAPPORT-UNITES.md`).** Un coup fait
ATK × coefficient × triangle, sans soustraction de la défense ni plancher ; la défense entre dans la **solidité** de l'unité :
END + 0,55 × DEF × coefficient (`config.combat.defenseDamageMult`), mur et bonus de défense compris. On garde
l'amortissement (18 % des dégâts par round) et les 15 rounds ; depuis le 30 octobre 2026 au soir, les coups de chaque round se
répartissent sur toutes les lignes de soldats selon leur solidité totale (§ 14). Deux jeux de coefficients :

- **bataille** (combats de ville, Bastion, vagues d'Immortels) : ceux du GDD, **1 / 1,35 / 1,9** (siège 0,75),
  `config.combat.battleTierCoefficients` ;
- **puissance** (pillages, camps, rencontres, hordes, affichage) : **1 / 1,25 / 1,55** (siège 0,75), `config.combat.tierCoefficients`,
  le réglage d'octobre ci-dessous ;
- **triangle +50 %** (+20 % dans le GDD ; sans cela la cavalerie, plus chère, ne bat plus les archers).

Mesuré sur le moteur actuel (`docs/RAPPORT-UNITES.md` § 7) : 1 intermédiaire vaut 1,81 unité de base (prix 1,8), 1 élite
1,68 intermédiaire (prix 1,78) et 3,05 unités de base (prix 3,2) ; la bonne classe gagne 100 % des combats du triangle à
tous les paliers, aussi derrière un mur 10 ; l'écart entre la faction la plus forte et la plus faible tombe de 1,6–1,9 à
1,2–1,3.

**Retouches des fiches hors norme (décision du 30 octobre 2026, D12).** 20 fiches retouchées de 3 à 10 % sur l'attaque, la
défense et l'endurance seulement (vitesse, transport, coût, temps et entretien inchangés), sans changer leur caractère :
toutes reviennent entre 0,80 et 1,25 de l'indice de leur palier. Quatre fiches non retouchées passent juste au-dessus (1,26 à
1,29 : Archer vétéran et Archer d'élite romains, Guerrier du croissant et Défenseur du palais du Sultanat) ; le rapport
conseille de ne pas y toucher. Tableau avant / après : `docs/RAPPORT-UNITES.md` § 7.

**Appliqué (octobre 2026) : les unités d'élite valent davantage par unité d'entretien.**

Avant ce réglage, les coefficients de palier (×1,0 / ×1,1 / ×1,21) ne compensaient ni le coût (×1,8 / ×3,2) ni l'entretien
(5 / 10 / 15) : un joueur qui optimisait n'avait aucune raison de former de l'élite, sauf la limite de place dans la file. Dans
Travian et Rise of Kingdoms, le palier supérieur coûte plus par unité mais vaut plus par unité d'entretien. Les coefficients de
puissance sont passés à **1,0 / 1,25 / 1,55** (`config.combat.tierCoefficients`, repris à l'identique dans le calcul de
puissance du client et dans les fiches d'unités) ; le siège reste à 0,75, les coûts, temps et entretiens ne changent pas.

| Palier (ex. infanterie romaine) | Coût | Puissance (atk + déf) × coef. | Puissance / 100 ressources | Puissance / céréale d'entretien | Temps |
|---|---|---|---|---|---|
| Base (Milicien) | 125 | 70 × 1,0 = 70 | 56 | 14,0 | 6 min |
| Intermédiaire (Triarii) | 225 | 115 × 1,25 = 144 | 64 | 14,4 | 10 min |
| Élite (Légionnaire, 63 / 82 depuis D12) | 400 | 145 × 1,55 = 225 | 56 | 15,0 | 16 min |

Lecture : la base reste le choix du début de partie (unité la moins chère et la plus rapide à former, aucun niveau de caserne
exigé) ; l'intermédiaire est le meilleur rapport puissance / ressources ; l'élite est le meilleur rapport puissance / entretien,
donc le choix de qui a des ressources mais peu de champs. Sur les 18 lignes faction × classe, l'élite vaut au moins autant
que la base par céréale dans 16 cas ; les 2 exceptions (infanterie grecque, cavalerie hunnique) restent à 0,1 point près.
Depuis le 30 octobre 2026 au soir, l'entretien est de 5 / 9 / 13 (§ 14) : puissance par céréale 14,0 / 16,0 / 17,3 dans
l'exemple ci-dessus.

Conséquences vérifiées : la puissance affichée des armées et des tribus (recalculée au démarrage du serveur) augmente pour les
paliers supérieurs ; les expéditions sont un peu plus faciles pour une armée d'élite (puissance / 7 : ≈ 10 par unité de base,
20 intermédiaire, 35 élite) ; rien d'autre ne dépend de ces coefficients. Variante non retenue en octobre : entretien de
l'élite ramené de 15 à 12 (le 30 octobre 2026 au soir, l'entretien est passé à 5 / 9 / 13, § 14). Pour le prix de chaque palier à nourriture égale, voir aussi `docs/RAPPORT-ECONOMIE.md`.

Cavalerie (décision du 30 octobre 2026, D11) : moins de puissance par ressource (coût 160 du GDD, gardé, contre 125) mais 1,5
à 1,8 × plus rapide. **Son rôle est la vitesse** : éclairer, frapper vite, intercepter, renforcer ; pas le pillage ni le
transport (dans le GDD elle ne porte pas plus que l'infanterie). Les six descriptions de cavaliers de base le disent
désormais. Archers : coût égal à l'infanterie, un peu moins de puissance, mais +50 % contre l'infanterie ✅.
Engins de siège : 4 de puissance par 100 ressources ; ils n'ont de valeur que contre les murs, et **seuls eux abîment le mur**
(décision du 30 octobre 2026, D6) : une catapulte ôte 12,15 PV par round ; un mur 20 (20 000 PV) tombe en un combat avec
≈ 110 catapultes (brèche au dernier round), 165 pour une brèche au 10e round, 330 au 5e (§ 12). Plus de plafond d'engins par
armée depuis le 25 octobre 2026 ✅.

## 3. Déplacements

- 1 case toutes les 30 s à vitesse 50 (≈ 120 cases/h) ; cavalerie hunnique de base à 90 ≈ 216 cases/h, 259 avec le bonus de
  civilisation (+20 %).
- Monde de 374 cases de côté (420 pour un monde neuf depuis le 31 octobre 2026 au soir, D1) : le traverser prend ≈ 3 h
  (environ 3 h 20 à 420) ; un voisin à 20 cases est à 10 min pour l'infanterie, 5 min pour la cavalerie.
- Le trajet suivi est le chemin réel (contournement des montagnes et de l'eau), l'armée va à la vitesse de son unité la plus lente. ✅
- Bonus qui s'ajoutent : héros (jusqu'à +5 %, plus les talents), Cartographie (+10 % au niveau 20), Bastion d'alliance (+5 %),
  **Irrigation égyptienne de la ville de départ** (+0,5 % par niveau, +10 % au niveau 20) : depuis le 30 octobre 2026, elle
  compte dans tous les trajets (armées, retours, espions, armées d'échange et de transport, ravitaillement du Bastion) et
  dans l'estimation du client. (Les marchands et les routes commerciales n'existent plus depuis le 31 octobre 2026 au soir.)
- C'est un rythme rapide (Travian : 1 à 7 min par case). Il convient à des sessions mobiles courtes ; le délai de 24 h entre deux
  pillages d'une même ville empêche le harcèlement. Si l'on veut un rythme plus posé : les 30 s par case de
  `calculateTravelTime` (`src/utils/calculations.js`, repris par le client).

## 4. Bâtiments : courbes

- Depuis le 30 octobre 2026 (recommandations 3 et 4, `calculations.buildCostFor` / `buildSecondsFor`, mêmes chiffres au
  serveur, au client, dans les quêtes et les outils) : **champs × 1,45 de coût par niveau**, autres bâtiments × 1,28 ; **champs et
  Bâtiment principal × 1,30 de temps par niveau**, autres bâtiments et recherche × 1,2. `costL20` / `timeL20Sec` des données
  restent ignorés (backlog).
- Champs : amortissement d'une amélioration de 69 h au niveau 2, 60 h au niveau 10 et 276 h au niveau 20 (20 à 64 h avant,
  Travian : 104 h et 9 470 h) ; les 18 champs d'une ville du niveau 1 au 20 coûtent 17,0 M (2,24 M avant). Le plus gros prix
  d'un champ 20 (116 410 de pierre) tient dans un Dépôt 19. Production × 450 entre les niveaux 1 et 20 (10 → 4 500/h), comme Travian. Analyse complète des coûts, de
  l'entretien et du stockage : `docs/RAPPORT-ECONOMIE.md` (30 octobre 2026).
- Stockage : un dépôt se remplit en ≈ 9 h avec quatre champs du même niveau, du niveau 5 au niveau 20 : une connexion toutes les 8 h suffit. ✅
- **Grand Dépôt et Grand Silo = stockage, façon Travian (décision du 30 octobre 2026, D1).** Ils ne protègent plus rien : chacun
  ajoute à la ville trois fois la capacité d'un dépôt (d'un silo) de même niveau, 3 600 au niveau 1 et 480 000 au niveau 20
  (`storageL1/L20`, `foodStorageL1/L20` dans `data/buildings.json`) ; Dépôt 20 + Grand Dépôt 20 = 160 000 + 480 000 = 640 000.
  Pas de nouveau plafond de coût : les derniers niveaux, qui dépassaient la capacité d'un dépôt 20, deviennent payables. **Seule
  la cachette protège du pillage** : raids, pillage de siège et rapport d'espion. Depuis le 31 octobre 2026 au soir (D15,
  § 17), elle garde **1,5 % du stockage de la ville par niveau** pour chaque ressource (Dépôt et Grand dépôt pour le bois, la
  pierre et le fer, Silo et Grand silo pour les céréales) : 30 % au niveau 20, Gaule × 1,2
  (`HIDEOUT.effects.hideoutStoragePctPerLevel`). Le matin du même jour, c'était une quantité fixe (240 → 32 000).
- **Bâtiments de bonus limités au niveau 5** (Moulin, Boulangerie, Scierie, Tailleur de pierre, Fonderie) : +2,5 % par
  niveau depuis le 31 octobre 2026 (+12,5 % au niveau 5 ; Moulin + Boulangerie +25 %), la moitié d'avant.
- Formation : Caserne et Écurie −0,5 % de temps par niveau, comme le GDD (décision du 30 octobre 2026, D2 : inchangé).
- Temps cumulés bruts (sans réduction) depuis le 30 octobre 2026 : Bâtiment principal 1 → 20 en 31,5 h (il s'arrête au niveau
  20 partout depuis le 31 octobre 2026 ; 1 → 30 prenait 437 h) ; un champ 1 → 20 en 26 h (8 h avant). Les réductions de temps (60 % au plus) divisent ces durées par 2,5.
  Dates attendues pour un joueur (`docs/RAPPORT-ECONOMIE.md` § 4.4, réglage V7b) : champs au niveau 20 vers les jours 48 à 67
  selon le rythme de connexion, capitale complète vers les jours 63 à 98. ✅
- Nourriture : six fermes niveau 10 nourrissent ≈ 420 unités de base ; niveau 20, ≈ 5 400. Cohérent avec les files de recrutement.
- Mur : +1 % de défense par niveau (max +20 %) et 1 000 PV par niveau (1 250 pour l'Égypte). Seuls les engins l'abîment
  (12,15 PV par catapulte et par round) ; ses PV suivent les vies de la ville et remontent avec elles en 48 h (§ 12). Le bonus
  reste volontairement modeste par rapport à Travian (+80 % au niveau 20) : la force du mur est d'être un bouclier à abattre.

## 5. Combat

Moteur de bataille du GDD (D10, § 2) : triangle +50 % (infanterie > cavalerie > archers > infanterie), coefficients de bataille
1 / 1,35 / 1,9 (siège 0,75), solidité END + 0,55 × DEF, 15 rounds à 18 %, coups répartis sur toutes les lignes de soldats
selon leur solidité (engins visés après les soldats, § 14) ; mur en bouclier au siège (seuls les engins l'abîment, au moins
5 rounds après la brèche : D5, D6), bonus du mur, bonus de ville (Forge et Brasserie de la capitale), héros plafonné à +5 %.
Les Douves n'existent plus (30 octobre 2026). Depuis le 2 novembre 2026 (G3, § 19), tous les combats passent par le moteur
(pillages, camps, rencontres, donjons, sites et plans) : plus de pertes forfaitaires ; un raid s'arrête dès qu'un camp a perdu
30 % de ses soldats, son butin monte jusqu'à 100 % du transport des survivants (G4 ; 30 % avant), cachette seule protection
(D1). Tous vérifiés
(`tests/unit/combat.test.js`, `tests/unit/units-retouches.test.js`, `tests/api-e2e.mjs`).

## 6. Commandes de contrôle

```
node tools/simulate-factions.cjs 5                      # bonus de civilisation : matrices de siège (mur bouclier, engins), +5 points
node tools/simulate-colonies.cjs                        # paliers de ville, percer le mur (engins, Bastion, combats de siège), colonies
node tools/simulate-research.cjs                        # recherche contre constructions, partie simulée
node tools/simulate-tribes.cjs --samples=1000           # camps barbares : armée nécessaire, pertes, butin
npm run test:unit && npm run test:e2e                   # règles de combat, économie, routes
```
Mesure des unités (paliers, triangle, factions, fiches) : voir `docs/RAPPORT-UNITES.md` § 7.7.

## 7. Bonus de civilisation : +5 points (octobre 2026), mesures refaites le 30 octobre 2026

Demande d'octobre : relever tous les bonus de 5 points et vérifier que rien ne se dérègle ; puis, le même jour, défense
gauloise chez soi portée à **20 %** et transport égyptien à **20 %** (valeurs actuelles : § 1). Les chiffres de l'époque
(moteur d'avant, mur en simple bonus de défense) ne sont plus comparables : les tableaux ci-dessous sont refaits avec le moteur
actuel (option B, mur bouclier que seuls les engins abîment, brèche suivie de 5 rounds).

Simulation : `node tools/simulate-factions.cjs 5`. Chaque attaque de ville se joue comme en jeu : 200 unités de base par classe
de chaque côté, sans héros ni technologie, mur 10 en bouclier (10 000 PV, 12 500 pour l'Égypte) et **200 engins** de la
civilisation de l'attaquant (avec leur bonus). 200 engins, c'est ce qu'il faut pour qu'à unités égales et sans bonus
l'attaquant passe de justesse (brèche au 5e round, 86 % de pertes contre 83 %) : chaque bonus se lit dans l'écart.

Effet isolé (mêmes unités des deux côtés, seule la civilisation change). Indice de défense de ville = pertes de l'attaquant /
pertes du défenseur ; indice d'attaque = l'inverse. Sans bonus : 1,04 en défense, 0,96 en attaque (catapultes romaines) :

| Civilisation | Défense de ville (actuel → +5) | Attaque de ville (actuel → +5) | Ce qui joue |
|---|---|---|---|
| Rome | 1,39 → 1,53 | **1,44** → 1,56 | défense des unités et solidité en siège, dans les deux sens |
| Gaule | 1,64 → 1,83 | 0,83 (inchangé) | défense chez soi, et son mur encaisse 1/1,2 des coups (99 coups de catapulte par niveau au lieu de 83) ; en attaque, son bélier frappe moins fort (85 d'attaque au lieu de 90) |
| Grèce | 1,04 (inchangé) | 0,96 (inchangé) | aucun bonus de combat |
| Égypte | 1,62 → 1,76 | 0,98 (inchangé) | mur à 1 250 PV par niveau : brèche au 6e round au lieu du 5e |
| Huns | 1,04 (inchangé) | 1,13 → 1,29 | attaque en siège, engins compris : brèche au 4e round |
| Sultanat | **1,72** → 1,95 | 1,32 → 1,35 | attaque en défendant sa ville ; ses engins (×1,25) percent au 4e round |

Matrice réelle (chaque civilisation avec ses propres unités et ses engins, effectifs égaux) : **Rome prend toutes les villes**,
la sienne comprise, et le **Sultanat toutes sauf la sienne** ; la Gaule, la Grèce, l'Égypte et les Huns ne prennent qu'une
ville grecque. Avec +5 points, un seul résultat bascule sur 36 (les Huns prennent une ville hunnique).

Lecture : le Sultanat est le meilleur défenseur (1,72), devant la Gaule (1,64) et l'Égypte (1,62), dont les bonus de mur
comptent enfin depuis que le mur est un bouclier ; Rome est la meilleure attaquante (1,44), devant le Sultanat (1,32) et les
Huns (1,13). Le souci noté en octobre (Rome défendait mieux chez elle que la Gaule) est réglé : la Gaule est à 1,64, Rome à
1,39. Les bonus du Sultanat (engins) et de la Gaule (mur) ont un effet réel ; Grèce et Égypte restent des civilisations
économiques en attaque.

Économie et logistique (bonus actuels) : Grèce −15 % de temps de construction (79 h au lieu de 93 h pour vingt niveaux d'un
bâtiment de 30 min) et +15 points de blessés (le plafond de 70 % est atteint dès la tente niveau 9) ; Égypte transport ×1,20
et mur à 1 250 PV par niveau (103 coups de catapulte par niveau au lieu de 83) ; Huns 100 cases en 41,7 min au lieu de 50, et
leurs sapeurs frappent le mur ×1,10 (12,62 PV par round au lieu de 11,47) ; Sultanat 15,19 PV de mur par engin et par round
au lieu de 12,15 (66 coups par niveau au lieu de 83) ; Gaule cachette ×1,15 (5,8 / 11,5 / 17,3 / 20 % aux niveaux 5, 10, 15,
20, plafond 20 %) et mur gaulois à 99 coups par niveau au lieu de 83. (Depuis le 31 octobre 2026 au soir, D15, la cachette
garde 1,5 % du stockage de la ville par niveau et la Gaule × 1,2 : 9 / 18 / 27 / 36 % du stockage aux niveaux 5, 10, 15,
20 ; `node tools/simulate-factions.cjs`.)

**Verdict : acceptable, appliqué** (`data/factions.json`, cartes d'inscription et textes du Mur et de la Tente de soins lus
depuis les données du serveur). À garder à l'œil : Rome reste la civilisation la plus complète (meilleure attaquante, bonne
défenseuse) ; la Gaule attaque mal avec ses propres engins.

## 8. Technologies : arbre de recherche à l'Académie (octobre 2026)

Système ajouté à la demande, façon Travian : de **petits bonus par niveau** qui récompensent l'investissement sans renverser une
bataille. Données dans `data/technologies.json`, formules dans `src/utils/techEffects.js` (reprises à l'identique par le client),
vérification contre les constructions avec `node tools/simulate-research.cjs`.

Règles : la recherche se fait à l'**Académie** et une technologie ne dépasse jamais le niveau de l'Académie ; **une recherche à la
fois** par joueur, une seconde peut attendre dans la file ; **mêmes courbes que les constructions** : coût × 1,28 et temps
× 1,2 par niveau, vingt niveaux ; temps réduit par l'Académie et le Temple grec (−1 % par niveau chacun, plafond 60 %) ;
annulation remboursée intégralement en attente, de moitié une fois lancée (même règle que les constructions). Les effets sont
ceux du joueur : ils s'appliquent à toutes ses villes et à toutes ses armées.

| Branche | Technologie | Niveau 1 | Niveau 20 | Coût total d'un niveau (niv. 1 → 10 → 20) | Temps (niv. 1 → 10 → 20) | Total niv. 1-20 | Prérequis |
|---|---|---|---|---|---|---|---|
| Économie | Agronomie | +0,5 % production des champs | +10,0 % production des champs | 530 → 4 886 → 57 711 | 0,3 h → 1,7 h → 10,6 h | 261 894 / 2,6 j | — |
| Économie | Ingénierie | −0,5 % coût de construction | −10,0 % coût de construction | 600 → 5 531 → 65 333 | 0,4 h → 2,1 h → 13,3 h | 296 489 / 3,2 j | Agronomie 5 |
| Militaire | Entraînement | −0,5 % temps de recrutement | −10,0 % temps de recrutement | 520 → 4 793 → 56 621 | 0,3 h → 1,7 h → 10,6 h | 256 945 / 2,6 j | — |
| Militaire | Art de la guerre | +0,25 % attaque | +5,0 % attaque | 630 → 5 809 → 68 599 | 0,4 h → 2,1 h → 13,3 h | 311 314 / 3,2 j | Entraînement 5 |
| Défense | Discipline | +0,25 % défense | +5,0 % défense | 600 → 5 532 → 65 333 | 0,3 h → 1,7 h → 10,6 h | 296 493 / 2,6 j | — |
| Défense | Médecine | +0,5 pt de blessés sauvés | +10,0 pt de blessés sauvés | 580 → 5 347 → 63 154 | 0,4 h → 2,1 h → 13,3 h | 286 601 / 3,2 j | Discipline 5 |
| Logistique | Cartographie | +0,5 % vitesse des armées | +10,0 % vitesse des armées | 530 → 4 886 → 57 711 | 0,3 h → 1,7 h → 10,6 h | 261 894 / 2,6 j | — |
| Logistique | Intendance | −0,5 % entretien | −10,0 % entretien | 620 → 5 716 → 67 510 | 0,4 h → 2,1 h → 13,3 h | 306 372 / 3,2 j | Cartographie 5 |

**En adéquation avec les constructions** (`node tools/simulate-research.cjs`, données du jeu, refait le 30 octobre 2026) :

- niveau par niveau, une technologie coûte 0,76 à 0,86 fois le niveau d'Académie qui la débloque et dure de 0,7 fois
  (niveau 1) à 1,1 fois (niveau 20) son chantier, 1,0 à 1,3 fois pour les technologies de second rang ;
- l'Académie 1 → 20 coûte 345 942 ressources et 2,4 j de chantier ; les 8 technologies au maximum, 2 278 246 ressources
  (× 6,6) et 19,7 j de recherche en une seule file ;
- la ville entière (30 bâtiments et 18 champs au niveau 20) : 23 759 337 ressources et 53,4 j de chantier avec 2 files ; la
  recherche complète en représente 10 % des ressources et 37 % du temps.

Partie simulée aux règles du serveur : départ à 500 de chaque ressource, Bâtiment principal 1 et aucun champ ; champs, Bâtiment
principal, dépôt, silo et Académie payés ressource par ressource (− Ingénierie) ; deux files de construction et une de
recherche ; rien au-dessus du Bâtiment principal ; stocks plafonnés ; ni armée ni autre bâtiment. Le Bâtiment principal atteint
le niveau 20 au jour 20,9, l'Académie au jour 21,4 (technologies aux niveaux 12 à 13), tous les champs au jour 21,5 ; toutes
les technologies sont au maximum au jour 35,5. Part de la recherche dans les dépenses :

| Académie | 2 | 5 | 8 | 10 | 12 | 15 | 18 | 20 | Total au jour 35,5 |
|---|---|---|---|---|---|---|---|---|---|
| Jour | 4,6 | 8,7 | 13,8 | 15,5 | 16,8 | 18,6 | 20,0 | 21,4 | — |
| Recherche / dépenses | 7 % | 19 % | **35 %** | 31 % | 25 % | 17 % | 14 % | 12 % | 43 % (2 278 002 contre 3 052 589 de constructions) |

L'ancienne version de l'outil, qui ne faisait payer que l'Académie, donnait l'Académie 20 au jour 3,7 et tout au maximum vers le
jour 23 : elle sous-estimait la montée. Lecture : sur une ville entière, la recherche reste un complément (10 % des ressources) ;
pendant la montée, elle pèse jusqu'au tiers des dépenses vers l'Académie 8 à 10, quand les technologies rattrapent l'Académie,
puis retombe à 12 %. Elle **accompagne la ville** (les technologies restent en retrait de l'Académie) mais la **concurrence**
vers les jours 13 à 16 ; pour l'alléger, il suffirait de baisser le coût des niveaux 5 à 10, sans toucher au reste de la courbe.
Avant le réglage d'octobre (coût × 1,45 et temps × 1,5 par niveau sur dix niveaux), le niveau 10 d'une technologie coûtait
2,3 fois l'Académie 10 et durait 6 fois plus : trop raide, corrigé.

Pourquoi cela ne déséquilibre pas : les bonus de combat plafonnent à **+5 %**, soit le plafond du héros et la moitié d'un bonus de
civilisation ; les bonus économiques à **+10 %**, soit la moitié de l'Irrigation égyptienne au niveau 20 ; attaque et défense sont
symétriques (Art de la guerre contre Discipline). Où chaque effet est appliqué : production et entretien dans les requêtes du tick
(`resourceProcessor.js`), coût de construction et temps de recrutement dans `routes/cities.js`, attaque et défense dans
`combatService.js` (attaque de ville ligne par ligne, pillage et tribus par la puissance), blessés dans `woundedService.js`,
vitesse dans `calculations.js` (armées, espions, convois, retours).

## 9. Camps barbares : les tribus des points de ressource (octobre 2026)

Le GDD (`resource_points.json`, janvier 2026) fixe un système **façon Travian** : chaque point de ressource est tenu par une
« tribu locale » fixe, de force liée au niveau du point (1 à 3), qui réapparaît avec la régénération du point ; les points
d'or sont rares et ne donnent qu'un petit butin (10 / 20 / 30 or par 12 h). Pas de camps itinérants : les « invasions
barbares » n'étaient qu'une idée d'événement serveur, jamais spécifiée. L'implémentation suit ce cadre : tribu sur chaque point,
composition aléatoire par faction, 100 / 600 / 1 500 soldats au niveau 1 / 2 / 3 (moins quand le point est entamé), niveau 3
surtout au centre de la carte, combat par puissance (règles de pillage), butin limité au transport puis récolte sur place à
100 par minute, réapparition après 60 / 90 / 120 min (10 min après le départ d'une armée), XP du héros par soldat tué.

Simulation (`node tools/simulate-tribes.cjs --samples=1000`, refaite le 30 octobre 2026 : 1 000 camps tirés par niveau, armée
de base romaine sans bonus de civilisation ni héros, chaque défenseur à son palier, camp d'or à +40 % au combat). L'armée de
base nécessaire (puissance moyenne du camp × 1,2) bat 95 à 98 % des camps tirés ; les pertes sont des moyennes, échecs
compris. Avant le réglage d'octobre, les pertes du vainqueur suivaient la règle des pillages (0,3 × puissance de la tribu /
puissance de l'armée) et ne dépendaient pas de la taille de l'armée : un camp coûtait toujours le même nombre d'unités, deux à
trois fois la valeur du point (avec 0,3, les pertes doublent : 28 / 236 / 808 unités aux niveaux 1 / 2 / 3, `--loss=0.3`).

| Niveau | Soldats | Puissance | Armée de base pour gagner | Pertes (0,15) | Butin immédiat puis stock du point | Pertes remboursées en tenant le point | XP héros | Réapparition |
|---|---|---|---|---|---|---|---|---|
| 1 | 98 | 6 415 | 110 (15 033 res.) | 14 (1 967 res.), dont 6 à 10 morts avec une Tente de soins | 1 500 res. puis 2 250 max (563/h) | 0,8 h | 29 | 60 min |
| 2 | 599 | 55 324 | 949 (129 697 res.) | 123 (16 848 res.), dont 49 à 83 morts | 4 000 res. puis 6 000 max (1 500/h) | 8,6 h | 180 | 90 min |
| 3 | 1 487 | 188 223 | 3 227 (441 023 res.) | 415 (56 728 res.), dont 166 à 278 morts | 8 000 res. puis 12 000 max (3 000/h) | 16,2 h | 446 | 120 min |
| Or 1 | 98 | 9 040 | 155 (21 183 res.) | 20 (2 770 res.), dont 8 à 14 morts | 10 or puis 10 max (1/h) | — | 30 | 120 min |
| Or 2 | 594 | 76 827 | 1 318 (180 127 res.) | 172 (23 496 res.), dont 69 à 115 morts | 20 or puis 20 max (2/h) | — | 178 | 180 min |
| Or 3 | 1 491 | 264 632 | 4 537 (620 057 res.) | 587 (80 253 res.), dont 235 à 393 morts | 30 or puis 30 max (3/h) | — | 447 | 240 min |

Réglages appliqués :
- **Pertes contre un camp divisées par deux** (`config.combat.tribeLossMultiplier` 0,15) : la cible est fixe, et l'on garde
  les morts du perdant à 30 %. Un camp de niveau 1 coûte 14 unités de base (≈ 2 000 ressources) pour 1 500 ressources de butin
  immédiat, 2 250 avec le stock, puis 560 par heure tant qu'une armée tient le point : rentable sans être gratuit ; le
  niveau 3 reste une opération de fin de partie (≈ 3 200 unités pour y aller).
- **Stock des points relevé aux niveaux 2 et 3** (`config.map.resourceNode` : 1 500 / 4 000 / 8 000 au lieu de 1 500 / 3 500 /
  6 000, maximum × 1,5, plein en 4 h) : un camp trente fois plus fort qu'un camp de niveau 1 ne gardait que quatre fois plus ;
  les pertes d'un camp de niveau 2 sont remboursées en 8,6 h de récolte, celles d'un niveau 3 en 16 h, contre 0,8 h au niveau 1.
  Les points existants sont relevés au plancher de leur niveau au démarrage.
- **Blessés** : comme après une bataille de ville, une part des pertes revient blessée à la Tente de soins (30 % + 3 % par
  niveau, Grèce, Médecine) ; les combats contre les tribus en étaient exclus.
- **Renfort des camps** : une tribu affaiblie (réapparue sur un point vide, assaut repoussé) regagne l'effectif du stock
  courant toutes les heures, en gardant son peuple : un point plein n'est plus gardé par dix soldats (`tribeReinforceMinutes`).
- Après un assaut repoussé, la puissance affichée est recalculée sur les survivants (elle était estimée par un simple ratio).
- Le **bonus de transport** (Égypte, Sultanat, Marché, Comptoir) s'applique au butin des camps et à la récolte, comme aux
  pillages et aux convois : il ne s'y appliquait pas.
- **Points d'or au barème du GDD** : 10 / 20 / 30 or par niveau, rechargés en 12 h (`config.map.goldNode`), au lieu de
  500 à 3 000 or rechargés en 24 h, trente fois le barème prévu et plus que la Chambre au trésor ; les points existants sont
  ramenés au barème au démarrage.
- Notification du résultat quand le combat se résout à l'arrivée de l'armée, comme pour les attaques de ville.
- **Défenseurs à leur palier, camps d'or à +40 % au combat** (décision du 30 octobre 2026, D4) : chaque défenseur combat avec
  le coefficient de puissance de son palier, comme dans la puissance affichée sur la carte, et le +40 % des camps d'or
  (`config.map.camps.goldDefenseBonusPct`) s'applique au combat comme à l'affichage. Jusque-là, les camps de niveau 2 et 3 et
  les camps d'or étaient plus faibles au combat que ce que la carte annonçait. Le tableau ci-dessus en tient compte.

Le cadre reste celui du GDD et de Travian (tribus fixes sur les points, décision confirmée). Les écarts relevés avec le GDD
ont été tranchés depuis : alliés sur un même point, stock approximatif et armée tenant un point attaquable (§ 9 bis), ville
secondaire fondée sur un point (§ 10) ; seul l'espionnage d'un point pour en connaître le stock exact reste au
`docs/BACKLOG.md`. Graphismes : les camps n'avaient aucun visuel prévu ; 18 sprites sont ajoutés aux listes
(`map/camps/`, niveaux 1 à 3 par biome, ruines, bannières de tribu) et la carte les affiche dès qu'ils sont livrés.

### 9 bis. Points de ressource : décisions appliquées (octobre 2026)

- **Une armée qui tient un point peut être attaquée** (`POST /api/army/:id/raid-resource` sur un point tenu) : combat en rase
  campagne résolu par la puissance, sans mur ni « défense chez soi », pertes selon la règle des pillages (perdant 30 %,
  vainqueur 0,3 × rapport des puissances), blessés et XP de héros des deux côtés, un rapport pour chacun ; les tenants
  battus rentrent chez eux et le point passe au vainqueur. Une armée alliée ou la sienne n'est jamais attaquée, même quand
  l'alliance est devenue alliée pendant la marche : l'armée rentre sans combattre (30 octobre 2026).
- **Alliés sur un même point** : les armées d'un même joueur ou d'une même alliance récoltent ensemble, à parts égales à
  chaque tick ; le point n'est libéré qu'au départ de la dernière.
- **Stock approximatif** : le serveur arrondit le stock au quart dans la carte, le client affiche plein / bien garni / à
  moitié / entamé / presque vide et une jauge ; les chiffres exacts n'apparaissent plus (GDD : « requires a spy »).
- **Camps variables et difficulté de position** (`config.map.camps`) : chaque camp varie de ± 20 % ; la taille est
  multipliée par 0,5 au bord de la carte et 1,3 au centre, linéairement avec la distance. Un premier camp de niveau 1 au
  bord demande ≈ 54 unités de base, un camp de niveau 3 au centre (≈ 1 950 soldats) ≈ 4 250 (outil, partie « Difficulté par
  position »). Le renfort horaire des tribus et la réapparition suivent la même règle.

## 10. Villes secondaires : colons, fondation, bonus (octobre 2026)

Valeurs du GDD, appliquées sans changement (`data/buildings.json` RESIDENCE, `config.city.foundationTransport`).

| Élément | Valeur | Ce que ça coûte au joueur |
|---|---|---|
| Résidence (capitale, Hôtel de ville 5) | niveau 1 : 700 bois, 500 pierre, 300 fer, 1 200 nourriture, 33 min ; courbes ×1,28 / ×1,2 | niveau 10 cumulé ≈ 104 000 ressources et 14 h de chantier ; niveau 15 ≈ 382 000 et 40 h ; niveau 20 ≈ 1 334 000 et 103 h |
| Colons | 1 au niveau 10, 2 au niveau 20 (2 colonies au plus depuis le 31 octobre 2026 ; avant 1 / 2 / 3 aux niveaux 10 / 15 / 20) ; formation 3 h, gratuite, un à la fois | la Résidence est le vrai prix de la colonie |
| Fondation | 3 000 de chaque ressource transportées (prises sur toutes les villes, la capitale d'abord) + 24 h sur place, l'armée immobilisée | 12 000 ressources, ≈ 2 jours de production des champs de départ |
| Colonie | Bâtiment principal 1, sans garnison (les unités formées vont à la capitale), 3 000 de chaque ; production : la spécialité de son gisement (§ 15 ; +20 % pour toutes les colonies jusqu'au 31 octobre 2026) | base 5 / 5 / 5 / 10 par heure avant les champs |

Lecture (règle d'octobre, avec le +20 % de toutes les colonies ; depuis le 31 octobre 2026, la spécialité du gisement au
§ 15) : la première colonie arrive quand la capitale a déjà une Résidence 10, soit environ au moment où ses champs de
niveau 8 à 10 produisent 1 000 à 1 500 de chaque ressource par heure ; les 12 000 de la fondation représentent alors moins
d'une journée. Le +20 % d'une colonie développée comme la capitale (4 champs de niveau 10 par ressource ≈ 1 400/h) vaut
≈ 280/h par ressource, soit le prix de la fondation en ≈ 11 h de production de la colonie elle-même ; la Résidence 10
(104 000) est amortie en ≈ 4 jours par ce seul bonus, sans compter les champs supplémentaires. Le rythme reste celui de
Travian : première colonie après plusieurs jours, deuxième (la dernière) après plusieurs semaines (Résidence 20 ≈ 1,3 M).

Risques : le colon est perdu si l'armée fondatrice est battue sur le point pendant les 24 h ; les 12 000 ressources
rentrent avec l'armée si elle n'est pas battue. Rien n'est changé aux autres systèmes : les restrictions de bâtiments
(capitale / colonie) suivent les données, le point occupé par une ville sort des tirages de tribus et de récolte.

## 11. Villes secondaires : règles complètes du GDD, paliers de ville par Bâtiment principal (octobre 2026)

Relecture complète du GDD (`GDD_MASTER`, `GDD_Tech_Dev_v2`, `GDD_COMPLET.md`, données des bâtiments) : le GDD ne
plafonne pas explicitement les niveaux des villes secondaires, mais il réserve à la capitale la Forge, la Chambre au trésor,
l'Ambassade et la Résidence, et décrit les Grandes caserne et écurie comme ce qui « permet de recruter hors capitale ».
Règles appliquées, chiffrées par `node tools/simulate-colonies.cjs` (refait le 30 octobre 2026) :

| Règle | Source | Effet |
|---|---|---|
| Caserne, Écurie, Atelier réservés à la capitale ; Grandes caserne / écurie seulement en colonie, prérequis (Caserne 20, Écurie 20) lus dans la capitale | GDD (descriptions « hors capitale ») | une colonie ne forme des troupes qu'après Caserne 20 dans la capitale : 360 734 ressources et 4,3 j de chantier cumulés ; jamais d'engins de siège hors capitale ; les recrues rejoignent la capitale (30 octobre 2026) |
| Bâtiment principal 20 au plus en colonie (30 dans la capitale jusqu'au 31 octobre 2026 ; depuis, 20 partout : § 16) | décision (le GDD ne chiffre pas) | aucun effet sur la production (les autres bâtiments s'arrêtent à 20) ; les niveaux 21-30 de la capitale n'apportaient que de la population (réduction de temps déjà plafonnée) et ont été retirés |
| Palier de ville et enceinte fixés par le Bâtiment principal (1-9 Village, 10-19 Ville, 20+ Ville Fortifiée) ; plus de minimum d'engins par palier depuis le 25 octobre 2026 | décision (« le Bâtiment principal fait évoluer les murailles ») | voir ci-dessous |

**Paliers de ville.** Ancienne règle : Ville = Mur 10 (15 442 ressources, 13 h), Ville Fortifiée = Mur 15 (56 525, 36 h).
Règle actuelle : Ville = Bâtiment principal 10 (23 157 ressources, 1,3 h de chantier brut), Ville Fortifiée = Bâtiment
principal 20 (296 531, 9,3 h). Comme tout le monde monte le Bâtiment principal (il plafonne les autres bâtiments), le palier
arrive dans le cours normal du développement, sans détour par un Mur que l'on ne voulait pas. Le palier ne fixe plus que
l'aspect de la ville et de son enceinte : depuis le 25 octobre 2026, **1 engin suffit pour assiéger n'importe quelle ville**
(`config.combat.siege.minEngines` ; avant : 1 / 10 / 20 engins selon le palier). Ce qui coûte à l'attaquant, c'est le Mur de
la cible, que seuls les engins abîment (§ 12) : pour une brèche au 10e round, un mur 10 (15 442 ressources) demande
83 catapultes (179 280 ressources, 3,5 j de fabrication sur une file), un mur 20 (197 689) en demande 165 (356 400, 6,9 j).
Une colonie au Bâtiment principal 20 est aussi une Ville Fortifiée ; sans Mur, une ville n'a pas de bouclier.

**Économie d'une colonie** (règle d'octobre : 4 champs par ressource, bonus +20 % ; depuis le 31 octobre 2026 la colonie se
spécialise selon son gisement, chiffres au § 15 et dans la section 3 de `tools/simulate-colonies.cjs`) :

| Champs | Capitale, par ressource et par heure | Colonie | Gain du bonus | Coût cumulé des 16 champs |
|---|---|---|---|---|
| niveau 5 | 201 | 241 | +40/h | 35 144 |
| niveau 10 | 1 405 | 1 686 | +281/h | 155 900 |
| niveau 15 | 5 025 | 6 030 | +1 005/h | 570 840 |
| niveau 20 | 18 005 | 21 606 | +3 601/h | 1 996 600 |

Aux champs de niveau 10, le bonus seul rapporte 1 124 ressources de plus par heure : la fondation (12 000) est amortie en
11 h, la Résidence 10 (104 201) en 3,9 j ; sans le bonus, une colonie reste une seconde ville complète. Avec cette règle,
trois colonies plafonnées à 20 valaient 3 × 1,2 = 3,6 capitales en production, pour quatre fois les champs à payer : le
jeu récompensait l'expansion comme Travian, sans effet multiplicateur caché (depuis le 31 octobre 2026 : 2 colonies et
la spécialité du gisement, § 15). La colonie est une ville économique ; le cœur militaire reste la
capitale (Caserne, Écurie, Atelier, Forge, Résidence, Ambassade, Chambre au trésor, Domus), et les Grandes caserne et
écurie n'ouvrent le recrutement en colonie qu'après plusieurs semaines. Les simulations précédentes (civilisations,
recherche, camps) ne dépendent pas de ces règles et restent valables.

## 12. Siège : camp d'1 h et mur bouclier (refonte du 25 octobre 2026, décisions du 30 octobre 2026)

Le camp dure 1 h et ne coûte que l'entretien (+10 % pour l'assiégeant pendant l'heure, GDD). Ce qui fait le prix d'un siège,
c'est le mur au combat : tant qu'il tient, l'attaquant encaisse les coups des défenseurs sans en rendre. Depuis le 30 octobre 2026 :

- **seuls les engins abîment le mur** (D6, GDD `onlySiegeEnginesDamageWall` ; `config.combat.siege.wallShield.soldierMult` = 0 ;
  un soldat frappait avant le mur avec un dixième de sa force) : une catapulte ôte 12,15 PV par round (× 1,25 pour les engins du
  Sultanat, × 1,10 en attaque hunnique ; un mur gaulois encaisse 1/1,2 des coups, un mur égyptien a 25 % de PV en plus) ;
- **brèche : au moins 5 rounds de combat après la chute du mur** (D5, `roundsAfterBreach`) : un mur qui tombe au 13e round
  laisse 18 rounds ; l'attaquant ne gagne que s'il bat réellement les défenseurs ;
- moteur de bataille du GDD (D10, § 2).

Engins pour percer un mur (`node tools/simulate-colonies.cjs`, § 2 de l'outil ; armée qui garde des soldats devant ses engins,
visés en dernier) :

| Mur | PV | Coût cumulé du Mur | Catapultes pour une brèche au round 15 / 10 / 5 | Catapultes pour le round 10 : coût, fabrication sur une file |
|---|---|---|---|---|
| niveau 5 | 5 000 | 3 483 | 28 / 42 / 83 | 90 720 ressources, 42 h |
| niveau 10 | 10 000 | 15 442 | 55 / 83 / 165 | 179 280, 3,5 j |
| niveau 15 | 15 000 | 56 525 | 83 / 124 / 247 | 267 840, 5,2 j |
| niveau 20 | 20 000 | 197 689 | 110 / 165 / 330 | 356 400, 6,9 j |
| Bastion (1,8 × mur 20, G2 du 2 novembre 2026 ; 3 × du 31 octobre au 2 novembre, 10 × avant) | 36 000 | — | 198 / 297 / 593 | 641 520, à répartir entre les membres d'un rassemblement (60 000 PV et 1,07 million à × 3 ; 200 000 PV et 3,56 millions à × 10) ; le mur garde ses dégâts et se répare en 12 h (§ 19) |

Combats réels (même outil : Rome, Triarii et catapultes, contre une ville gauloise gardée par 600 Triarii gaulois et
300 archers gaulois, sans héros ni technologie ; pertes de l'attaquant, engins compris / du défenseur) :

| Attaque | Mur 10 plein | Mur 20 plein | Mur 20 à moitié des vies |
|---|---|---|---|
| 1 000 soldats + 1 engin | pas de brèche, la ville tient (100 % / 0 %) | pas de brèche, la ville tient | pas de brèche, la ville tient |
| 1 000 soldats + 20 engins | pas de brèche, la ville tient (100 % / 0 %) | pas de brèche, la ville tient | pas de brèche, la ville tient |
| 1 000 soldats + 100 engins | brèche round 10, la ville tient (100 % / 3 %) | pas de brèche, la ville tient | brèche round 10, la ville tient |
| 1 000 soldats + 200 engins | brèche round 5, la ville tient (99 % / 46 %) | brèche round 10, la ville tient (100 % / 6 %) | brèche round 5, la ville tient (99 % / 46 %) |
| 3 000 soldats + 50 engins | pas de brèche, la ville tient (46 % / 0 %) | pas de brèche, la ville tient | pas de brèche, la ville tient |
| 3 000 soldats + 150 engins | brèche round 7, l'attaquant gagne (26 % / 100 %) | brèche round 14, l'attaquant gagne (48 % / 100 %) | brèche round 7, l'attaquant gagne (26 % / 100 %) |

Lecture : avec les soldats à × 0,1 sur le mur (avant le 30 octobre), 3 000 soldats et 50 engins perçaient un mur 20 au 6e round
et gagnaient ; désormais il faut amener les engins (≈ 150 contre ce mur, 324 000 ressources) et assez de soldats pour finir le
combat après la brèche. Un mur à la moitié de ses vies vaut un mur 10 plein. Une victoire pille un quart (25 %) du stock hors
cachette (seule protection depuis D1), dans la limite de ce que l'armée porte, et ôte une vie (et la même part des PV du mur) :
les attaques suivantes, dans les 48 h, trouvent un mur plus faible.

**Vagues d'Immortels contre la Ville Merveille** (lot du 30 octobre 2026, `src/services/wonderService.js`) : comme seuls les
engins abîment le mur, chaque vague amène des **mangonneaux du Sultanat pour 15 % de sa puissance**, pris sur ses soldats
(comme les Natars de Travian, qui viennent avec béliers et catapultes). Avant les Immortels × 5, un mur 20 sans défenseurs
tenait seul jusqu'à la Merveille niveau 6 ; il tombait au 7e round au niveau 12, au 4e au niveau 20, dès le 1er au niveau 100.
Chiffres en place (Mur 15 de la Ville Merveille, base 14 000) : § 17. À décider par le propriétaire : garder 15 % ou revenir vers 7 %, qui rendrait le seuil d'avant (mur
seul jusqu'au niveau 11) ; avec 15 %, une vague de niveau 100 bat aussi des défenseurs qui valent 80 % de sa puissance.

## 13. Décisions d'équilibrage du 30 octobre 2026

Décisions du propriétaire, appliquées le 30 octobre 2026 ; le détail des règles est dans `docs/ETAT-DES-SYSTEMES.md`.

| | Décision | Où | Chiffres |
|---|---|---|---|
| D1 | Grand Dépôt et Grand Silo = stockage (3 × un dépôt ou un silo de même niveau), plus de réserve protégée ; seule la cachette protège | `data/buildings.json`, `calculations.cityStorageCaps` | § 4 : 3 600 → 480 000 ; Dépôt 20 + Grand Dépôt 20 = 640 000 |
| D2 | Formation à la Caserne et à l'Écurie : GDD gardé (−0,5 % par niveau) | — | inchangé |
| D3 | Alliance : 60 membres au plus (adhésion sous verrou, invitation refusée quand elle est pleine) ; le 31 octobre 2026, 3 membres par niveau de l'Ambassade du chef dans cette limite (§ 16) ; le soir même, 5 par niveau et 100 au plus (§ 17) | `config.alliance.maxMembers`, `EMBASSY.effects.allianceMembersPerLevel` | 100 |
| D4 | Camps : défenseurs à leur palier et camps d'or à +40 % au combat ; rassemblements d'alliance contre les sites et plans de Merveille | `armyService`, `rallyService`, `wonderService` | § 9 |
| D5 | Brèche : au moins 5 rounds de combat après la chute du mur | `config.combat.siege.roundsAfterBreach` | § 12 |
| D6 | Seuls les engins abîment le mur ; mur du Bastion à 10 fois un mur 20 (50 avant ; 3 depuis le 31 octobre 2026 au soir, § 17 ; 1,8 depuis le 2 novembre 2026, § 19) ; bonus des engins du Sultanat vérifié | `config.combat.siege`, `config.bastion.wallMultiplier` | § 12 : Bastion 36 000 PV (60 000 à × 3, 200 000 à × 10) |
| D7 | Donjons d'invasion de plus en plus forts avec l'âge du monde | `config.invasion`, colonne `Invasion.ageMult` | tableau ci-dessous |
| D8 | Défi de la semaine : 750 / 500 / 250 points par membre ; seuls comptent les membres arrivés avant le vendredi 0 h (Paris) | `config.alliance.challengeRewardPoints`, `challengeJoinDeadline` | — |
| D9 | XP du héros : × 1,25 par niveau (× 1,5 avant), seuils des héros existants recalculés, XP gardée | `config.hero`, migration `0029` | tableau ci-dessous |
| D10 | Moteur de bataille du GDD (option B) : solidité END + 0,55 × DEF, coefficients de bataille 1 / 1,35 / 1,9, triangle +50 % | `combatService`, `config.combat` | § 2, `docs/RAPPORT-UNITES.md` |
| D11 | Cavalerie : coût GDD 160 gardé ; textes corrigés (vitesse, pas pillage ni transport) | `data/units.json` | § 2 |
| D12 | 20 fiches hors norme retouchées de 3 à 10 % (attaque, défense, endurance) | `data/units.json` | § 2, `docs/RAPPORT-UNITES.md` § 7 |

**D7 — âge du monde.** Semaine du monde = ⌊(jour − 1) / 7⌋ + 1 ; multiplicateur = min(6 ; 1 + 0,35 × max(0, semaine − 3)),
fixé au lancement de l'invasion. Au niveau L d'un donjon : × mult^((L − 1)/4) sur la puissance des étages et sur les
ressources du trésor (pas sur l'or ni les points d'alliance) ; le niveau 1 ne change jamais, le niveau 5 prend le facteur
complet.

| Jour du monde (semaine) | Multiplicateur | Niveau 2 | Niveau 3 | Niveau 4 | Niveau 5 | Avant-poste niv. 5 | Chef niv. 5 | Ressources du trésor niv. 5 |
|---|---|---|---|---|---|---|---|---|
| 1 à 21 (1 à 3) | × 1,00 | × 1,00 | × 1,00 | × 1,00 | × 1,00 | 585 938 | 2,34 M | 312 500 de chaque |
| 22 (4) | × 1,35 | × 1,08 | × 1,16 | × 1,25 | × 1,35 | 791 016 | 3,16 M | 421 875 |
| 35 (5) | × 1,70 | × 1,14 | × 1,30 | × 1,49 | × 1,70 | 996 094 | 3,98 M | 531 250 |
| 50 (8) | × 2,75 | × 1,29 | × 1,66 | × 2,14 | × 2,75 | 1,61 M | 6,45 M | 859 375 |
| 70 (10) | × 3,45 | × 1,36 | × 1,86 | × 2,53 | × 3,45 | 2,02 M | 8,09 M | 1,08 M |
| 100 (15) | × 5,20 | × 1,51 | × 2,28 | × 3,44 | × 5,20 | 3,05 M | 12,2 M | 1,63 M |
| 120 et après (18+) | × 6,00 | × 1,57 | × 2,45 | × 3,83 | × 6,00 | 3,52 M | 14,1 M | 1,88 M |

**D9 — XP du héros.** 100 XP pour passer au niveau 2, puis × 1,25 par niveau : 125, 156, 195, 243… 6 851 (niveau 20 → 21),
51 027 (niveau 29 → 30). Cumul : 2 562 XP pour le niveau 10, 27 033 pour le niveau 20, 254 786 pour le niveau 30 (25,6 millions
avec l'ancien × 1,5, hors de portée). Les héros existants gardent leur XP ; leur seuil est recalculé à leur niveau actuel
(migration `0029_age_rallies_indexes`).

## 14. Économie, placement et stock partagé (décisions du 30 octobre 2026, au soir)

Décisions du propriétaire après `docs/RAPPORT-ECONOMIE.md` ; règles détaillées dans `docs/ETAT-DES-SYSTEMES.md`
(« Économie, placement et stock partagé »), correspondance recommandation par recommandation à la fin du rapport.

| Sujet | Règle appliquée | Où | Chiffres |
|---|---|---|---|
| Stock | Chaque ville garde son stock et son plafond ; constructions, recrutements, recherche, soins, héros et fondation se paient sur la somme des villes (ville de l'action d'abord, puis la plus pleine par rapport à son plafond, § 15) ; pas de convoi automatique | `src/utils/db.js` (`debitPlayer`, `creditPlayer`) | refus : « il manque … (toutes vos villes comprises) » |
| Entretien | Tous les greniers paient : chaque ville ses troupes d'abord, le manque pris dans les autres ; famine seulement greniers tous vides | `resourceProcessor.processUpkeep` | — |
| Unités | Toute unité formée ou soignée apparaît dans la capitale ; pas de garnison propre dans les colonies | `recruitProcessor`, `woundedService` | — |
| Placement | 20 bâtiments « capitale seulement » (effets pour tout le joueur ; Marché et Comptoir depuis le 31 octobre 2026), 9 « colonies seulement », 9 partout ; Douves supprimées | `data/buildings.json`, migrations `0030` et `0032` | anneau de 18 emplacements dans la capitale, 12 dans une colonie ; Mur sur l'enceinte (§ 15 et 16) |
| Coûts (rec. 3) | Champs × 1,45 par niveau, le reste × 1,28 | `config.build.fieldCostMultiplier` | 18 champs 1 → 20 : 17,0 M par ville (2,24 M avant) ; remboursement d'un champ 60 h au niveau 10, 276 h au niveau 20 |
| Temps (rec. 4) | Champs et Bâtiment principal × 1,30 par niveau, le reste et la recherche × 1,2 | `config.build.slowTimeMultiplier` | champ 1 → 20 : 26 h brutes ; Bâtiment principal 1 → 20 : 31,5 h brutes (20 au plus depuis le 31 octobre 2026) |
| Entretien (rec. 5) | 5 / 9 / 13, engins 15 ; 8 fiches retouchées (endurance seule) | `config.army.upkeepPerTier`, `data/units.json` | tableau ci-dessous |
| Soins (rec. 6) | 30 % du prix de recrutement ; 10 % du temps de formation × 0,95^(Tente − 1) par unité, l'un après l'autre ; or 1 / 2 / 3 / 3 ; les blessés qui attendent mangent | `config.wounded`, `woundedService` | fantassin de base : 38 ressources, 13,6 s à la Tente 20 ; 4 000 lits ≈ 15 h |
| Merveille (rec. 7) | × 5 (moitié prix depuis le 31 octobre 2026 au soir, § 17) | `config.world.wonderCostBase` | 250 000 / 250 000 / 250 000 / 75 000 au niveau 1 ; niveaux 1 à 50 : 173 M ; Merveille entière : 2,15 G (aujourd'hui 125 000 / … / 37 500, 86 M, 1,08 G) |
| Immortels (rec. 8) | × 5 (réglés le 31 octobre 2026 au soir pour une alliance de 15 à 20 joueurs, § 17) | `config.world.immortal*` | site 3 M, plan 4,5 M ; vague 20 000 × niveau^1,35 : 3,93 M au niveau 50, 10 M au niveau 100 (aujourd'hui plan 5,75 M, vague 14 000 × niveau^1,35) |
| Donjons (rec. 9) | Avant-poste du niveau 1 = max(3 000 ; 50 % de la puissance médiane des joueurs actifs), × 1,8 par niveau, étages × 1 / × 2 / × 4 ; ancienne formule sous 5 joueurs mesurés ; le trésor garde l'âge du monde | `config.invasion.powerRef`, `Invasion.basePower` | chef du niveau 1 = 2 joueurs médians ; du niveau 5 ≈ 21 |
| Trésor (rec. 2) | Capitale d'abord, puis les autres villes ; la notification dit ce qui a été perdu faute de place | `hordeService.destroyHorde` | — |
| Ciblage (rec. 10) | Coups de chaque round répartis sur toutes les lignes de soldats selon leur solidité totale ; engins visés après les soldats | `combatService.resolveCombatDetailed` | tableau ci-dessous |
| Pillage (rec. 11) | GDD gardé en octobre (30 % de la capacité, un raid par jour sur une même ville et par attaquant) ; depuis le 2 novembre 2026 : combat au moteur arrêté à 30 % de pertes d'un camp et butin jusqu'à 100 % de la charge des survivants (G3, G4, § 19), un raid par jour inchangé | `config.combat.raidLootPctOfCarry`, client, documents | — |
| Plafonds (rec. 12) | Récompenses de quêtes calculées sur le Dépôt et le Silo seuls (les routes commerciales n'existent plus depuis le 31 octobre 2026 au soir) | `questService.rewardCap` | 80 000 par ressource et par récompense au plus (320 000 en tout), soit **1,4 h** de production d'un compte complet (et non 20 minutes) |

**Intermédiaire contre base, à entretien égal** (X = indice d'échange à céréale égale, R = contre une armée de référence ;
mesure du lot B, `units-measure.cjs`) :

| Unité | Endurance avant → après | X avant → après | R avant → après |
|---|---|---|---|
| Equites (Rome) | 60 → 65 | −6,0 % → +10,3 % | −3,7 % → +4,5 % |
| Triarii gaulois | 60 → 65 | +26,0 % → +41,2 % | +17,0 % → +35,2 % |
| Cavalier gaulois | 60 → 65 | −3,6 % → +14,9 % | −2,8 % → +5,3 % |
| Archer du désert (Égypte) | 52 → 57 | +0,9 % → +26,1 % | +1,4 % → +11,6 % |
| Cavalerie du pharaon | 65 → 70 | −12,4 % → +2,4 % | −7,4 % → +0,4 % |
| Archer du camp (Huns) | 50 → 57 | +6,8 % → +36,0 % | +2,8 % → +19,8 % |
| Tireur du désert (Sultanat) | 52 → 62 | −3,0 % → +38,9 % | 0,0 % → +25,2 % |
| Cavalier hun | 60 → 78 | −29,9 % → +20,7 % | −18,8 % → +7,5 % |

Intermédiaires sous leur base : 8 lignes sur 18 avant, 3 après. Restent sous leur base, hors de la liste décidée : Archer
gaulois (−1,9 %), Toxote (−11,1 %), Cavalier du désert du Sultanat (−31,0 %) ; il leur faudrait +1, +3 et +14 d'endurance.
Le propriétaire a refusé les 7 changements d'endurance proposés par le rapport de vérification (D6, 31 octobre 2026 au
soir) : pas de changement. Quatre intermédiaires dépassent l'indice 1,25 de la règle D12 (Archer du désert égyptien,
Archer du camp, Tireur du désert, Cavalier hun) : le test des fiches les excepte.

**Armées mélangées contre une armée de base pure, à nourriture égale** (moteur avant → après la répartition des coups) :

| Entretien | 25 % d'élite + 75 % de base | 50 % d'élite + 50 % de base |
|---|---|---|
| 5 / 9 / 13 | −10 à +8 % → **+35,8 à +42,2 %** | +1 à +39 % → **+52,3 à +65,1 %** |
| GDD 5 / 10 / 15 | −16 à −28 % → +5,5 à +12,0 % | −16 à −32 % → +10,3 à +26,4 % |

Ces gains dépassent les « +11 à 29 % sauf les Huns » du rapport : la mesure du lot B ne montre pas d'exception hunnique. Les
armées d'un seul palier ne changent pas.

**Vagues d'Immortels** (mangonneaux pour 15 % de la vague) : la Ville Merveille n'est pas une capitale, son Mur s'arrête au
niveau 15. Avec la base de 14 000 (§ 17), un mur 15 sans défenseurs tient jusqu'à la Merveille 2, tombe au 2e round au
niveau 10 et dès le 1er round à partir du niveau 17 (il tenait jusqu'au niveau 6 avant le × 5).

**Outils** : `tools/simulate-colonies.cjs`, `tools/simulate-research.cjs`, `tools/simulate-factions.cjs` et
`simulate-2years.js` calculent coûts et temps avec `buildCostFor` / `buildSecondsFor`. Les joueurs automatiques de la
simulation longue (`tools/sim`) suivent le placement des données, paient sur le stock de toutes leurs villes
(`tools/sim/stock.cjs`, même répartition que le serveur), bâtissent Grand dépôt et Grand silo dans les colonies, la
Chambre au Trésor jusqu'au niveau 20 et la Tente de soins jusqu'au 20, paient leurs soins et comptent l'entretien sur tous
leurs greniers.

## 15. Rôle des colonies : chiffres à régler plus tard (décisions des 30 et 31 octobre 2026)

Décisions du propriétaire en tête de `docs/RAPPORT-COLONIES.md` ; règles détaillées dans `docs/ETAT-DES-SYSTEMES.md`
(« Villes secondaires »). Le propriétaire veut équilibrer ensuite : chaque chiffre est dans les données ou la config.
Chiffres refaits par `node tools/simulate-colonies.cjs` (section 5).

| Sujet | Valeur aujourd'hui | Où le régler | Remarque |
|---|---|---|---|
| Spécialité du gisement | +10 % par niveau du gisement (1 à 3) sur sa ressource, −30 % sur les trois autres ; colonies seulement | `RESIDENCE.effects.colonyNodeBonusPctPerNodeLevel`, `colonyOtherResourcesPct` | s'ajoute aux bâtiments de production de chaque ressource ; le 30 octobre : +15 % par niveau sans baisse des autres ; tableau ci-dessous |
| Bonus de toutes les colonies | 0 | `RESIDENCE.effects.secondaryCityBonusPct` | +20 % sur tout jusqu'au 31 octobre 2026 |
| Nombre de colonies | 2 au plus (1er colon à la Résidence 10, 2e à la Résidence 20) ; Ville Merveille hors quota | `config.city.maxSecondaryCities`, `RESIDENCE.effects.unlockSettlerL10/L15/L20` | 3 jusqu'au 31 octobre 2026 |
| Joueurs par serveur | 2 000 | `config.world.maxPlayers` | 5 000 jusqu'au 31 octobre 2026 ; la carte et les gisements sont taillés pour eux depuis le soir même (§ 17, D1) |
| Fondation | 3 000 de chaque ressource, 24 h sur place ; colon gratuit en 3 h | `config.city.foundationTransport`, `RESIDENCE.effects.cityFoundationTimeSec`, `settlerTrainTimeSec` | inchangé |
| Emplacements | anneau de 18 dans la capitale, 12 dans une colonie (et la Ville Merveille) ; Mur sur l'enceinte, emplacement 20 | `config.city.ringSlots`, `config.city.wallSlot` | autant que de bâtiments possibles, aucun libre (31 octobre 2026 ; avant : 19 partout) |
| Recrutement en colonie | Grande caserne / Grande écurie : paliers 1 / 7 / 15, temps −4 % par niveau ; prérequis Caserne 20 / Écurie 20 de la capitale | `GREAT_BARRACKS` / `GREAT_STABLE` : `unlockBaseTier`, `unlockIntermediateTier`, `unlockEliteTier`, `trainTimeReductionPctPerLevel`, `prereq` | unités vers la capitale ; pas d'engins (`config.recruit.siegeWorkshopLevel` vaut pour l'Atelier de la capitale) |
| Comptoir de commerce | capitale seulement depuis le 31 octobre 2026 (§ 16) : −1 point de taxe et +1 % de charge des armées de transport par niveau | `TRADE_OFFICE.effects` (`p2pTaxReductionPctPerLevel`, `armyTransportCapacityBonusPctPerLevel`), `config.market.p2pTaxPctBase` | taxe de 30 % de base depuis le soir même (§ 17, D8) : chaque niveau compte, 10 % au Comptoir 20, 5 % avec la Chambre au Trésor 20 (avec 10 % de base, elle tombait à 0 dès le Comptoir 10) |
| Vies d'une colonie | 2 (Égypte 3) ; capitale 4 (5) | `config.combat.fall.assaults`, `extraAssaults` | ni vie en plus au Mur 20, ni Fort (décision 3) |
| Bâtiment principal | 20 au plus partout, capitale comprise (31 octobre 2026) ; Mur d'une colonie 15 | `MAIN_HALL.maxLevel`, `WALL.effects.colonyMaxLevel` | revue des autres niveaux maximum à faire (`docs/BACKLOG.md`) |
| Alerte « File de construction vide » | au plus une par ville toutes les 6 h | `config.city.idleAlertHours` | quand le dernier chantier d'une ville finit |
| Alerte « dépôt plein dans 1 h » | prévient 1 h avant ; au plus une par ville toutes les 12 h | `config.city.storageAlertLeadHours`, `config.city.storageAlertHours` | bois, pierre, fer contre le Dépôt ; céréales (production moins entretien) contre le Silo |
| Alerte de famine | 12 h avant les greniers vides, sur le total du joueur ; au plus une toutes les 12 h | `config.army.famineAlertHours` | 6 h jusqu'au 30 octobre 2026 ; le bandeau du client lit le même chiffre |
| Notifications sur le téléphone | une par type et par joueur toutes les 60 s | `config.push.throttleMs` (pas d'entrée pour `build_idle` et `storage_full` : 60 s par défaut) | le fil du jeu garde toutes les alertes |
| Cercle du centre | 35 % de la demi-largeur de la carte de base | `config.map.centerRadiusPct` | gisements de niveau 3 surtout là (60 % des points du cercle contre 10 % ailleurs) ; drapeau « centre disputé » des sites libres |
| Ordre de prélèvement | après la ville de l'action, la plus pleine par rapport à son plafond (à égalité la plus riche) ; même ordre pour le manque d'entretien | règle du code (`utils/db.js` `planDebit`, `resourceProcessor.processUpkeep`) | pas un chiffre ; l'ancien ordre « la plus riche » est perdu |

**Production d'une colonie selon son gisement** (champs au niveau 20, bâtiments de production au niveau 5 ;
`node tools/simulate-colonies.cjs`, section 5) :

| Gisement | Sa ressource / les 3 autres | Bois par heure (gisement de bois) | Céréales par heure (gisement de céréales) | Pierre et fer par heure (gisement de bois) | Céréales par heure (gisement de bois) | Total de la colonie (gisement de bois / de céréales) |
|---|---|---|---|---|---|---|
| niveau 1 | +10 % / −30 % | 22 055 | 36 460 | 14 855 | 25 660 | 77 425 / 81 025 |
| niveau 2 | +20 % / −30 % | 23 855 | 39 160 | 14 855 | 25 660 | 79 225 / 83 725 |
| niveau 3 | +30 % / −30 % | 25 655 | 41 860 | 14 855 | 25 660 | 81 025 / 86 425 |

Chiffres avec les bâtiments de production à +2,5 % par niveau (bonus divisé par deux le 31 octobre 2026, § 16 ; avec +5 %
par niveau, une colonie sur un gisement de bois de niveau 3 faisait 94 525 par heure). La capitale (ni gisement ni
bâtiments de production) produit 81 025 par heure au niveau 20. Un compte complet (capitale + 2 colonies au niveau 20) fait
243 075 par heure avec deux gisements de bois de niveau 3, 253 875 avec deux gisements de céréales de niveau 3 (270 075 et
280 875 avant la division par deux). Avec la règle du 30 octobre (+20 % pour toutes les colonies, +15 % par niveau du gisement), le même
compte faisait 340 285 par heure sans gisement, et les gisements y ajoutaient 4 à 9 % : la spécialité baisse la production
totale d'une colonie (environ −27 %) mais la concentre sur une ressource. Le gisement de céréales donne le plus (6 Fermes
contre 4 champs des autres ressources) : la course aux gisements de céréales de niveau 3 reste le risque à surveiller.

**Offre de gisements** (réglée le 31 octobre 2026 au soir, D1, § 17) : sur l'ancienne carte de 374, le semis posait
4 895 points (et 636 d'or) n'importe où sur la terre ; environ 3 300 avaient la place d'une ville, et après 2 000 capitales il
ne restait de quoi fonder que **1 770 à 1 836 colonies sur les 4 000** voulues (environ 1 000 joueurs à 2 colonies, et non
« 4 900 gisements pour environ 2 450 joueurs »). Un monde neuf a désormais une carte de 420, **6 000 gisements tous
fondables** et 780 points d'or : les 4 000 colonies de 2 000 joueurs se fondent sur les 5 cartes mesurées.

**À mesurer en simulation** (la simulation longue n'a pas été refaite pour ce lot : pas de serveur ni de base) :
- le rythme des deux colonies avec 2 connexions par jour, et les gisements que choisissent les joueurs ;
- la course aux gisements de céréales de niveau 3, et l'effet de la baisse de −30 % sur les trois autres ressources (une
  colonie produit moins au total qu'avant le 31 octobre 2026) ;
- la pression des raids sur des colonies riches, sans garnison et à 2 vies ;
- les vagues d'Immortels contre la Ville Merveille, qui combattent désormais les armées du propriétaire stationnées et les
  renforts alliés (avant le 30 octobre 2026, elles frappaient une ville vide) : l'équilibre de la fin de partie change.

**Outils** : les joueurs automatiques de la simulation longue (`tools/sim`) choisissent le site de leur colonie dans les
« Sites libres » (type et niveau du gisement, la ressource qui leur manque d'abord : céréales quand l'armée mange presque
tout, sinon la plus basse ; un type déjà tenu par une colonie compte moins), bâtissent le Mur sur l'enceinte, montent
l'Écurie 20 puis les Grandes caserne et écurie jusqu'à l'élite et recrutent avec elles (palier de la colonie, unités vers la
capitale) ; leur stock suit le même ordre de prélèvement que le serveur. Le rapport de la simulation compte les gisements
choisis et le jour de chaque colonie ; deux contrôles s'ajoutent (Mur hors de l'enceinte, garnison dans une colonie).
`simulate-2years.js` pose aussi le Mur sur l'emplacement 20.

## 16. Revue des bâtiments : chiffres à régler (décisions du 31 octobre 2026)

Décisions du propriétaire, bâtiment par bâtiment : `docs/BATIMENTS-ROLES.md` ; règles détaillées : `docs/ETAT-DES-SYSTEMES.md`
(« Revue des bâtiments »). Chaque chiffre est dans les données ou la config : le propriétaire équilibre ensuite.
`node tools/batiments-pdf.cjs` refait le récapitulatif `docs/BATIMENTS.pdf` avec ces chiffres.

| Sujet | Valeur aujourd'hui | Où le régler | Remarque |
|---|---|---|---|
| Bâtiment principal | niveau 20 au plus partout | `MAIN_HALL.maxLevel` | 1 → 20 : 296 491 ressources et 31,5 h brutes ; −50 % de temps de construction au niveau 20 (plafond commun 60 %) |
| Cachette | 1,5 % du stockage de la ville par niveau, pour chaque ressource (30 % au niveau 20) ; Gaule × 1,2 (§ 17, D15 ; le matin : 240 → 32 000) | `HIDEOUT.effects.hideoutStoragePctPerLevel` ; `data/factions.json` GAUL `hideoutCapacity` | un raid prend au plus la moitié de ce qui dépasse (`config.hideout.raidStealRate`), un siège gagné 25 % (`config.combat.fall.pillagePct`) |
| Marchands | retirés le 31 octobre 2026 au soir (§ 17, D7) : des armées de transport portent les échanges et les envois | — | le matin : 1 par niveau du Marché, charge et vitesse par civilisation |
| Comptoir de commerce | capitale ; taxe −1 point par niveau (30 % de base), charge des armées de transport +1 % par niveau | `TRADE_OFFICE.effects` | 10 % au Comptoir 20, 5 % avec la Chambre au Trésor 20 (voir § 15 et § 17) |
| Taille des rassemblements | 5 armées + 1 par niveau de la Place de rassemblement du lanceur (25 au niveau 20) ; attentes de 5 à 180 min (§ 17, D3) | `RALLY_POINT.effects.rallyMaxArmiesBase`, `rallyMaxArmiesPerLevel`, `config.rally.waitMinutes` | 3 à 15 avant ; une alliance de 100 membres ne fait donc pas de plus gros rassemblement (25 armées), elle peut seulement en lancer plusieurs |
| Forge | +0,5 % d'attaque et +0,5 % de défense par niveau (+10 % au niveau 20), 50 % au plus | `FORGE.effects.attackBonusPctPerLevel`, `defenseBonusPctPerLevel` | avant : défense des villes seulement ; un côté de plusieurs joueurs prend la moyenne de leurs Forges selon les soldats |
| Vision des armées | 5 cases + 6 par niveau de la Tour de guet de la capitale, autour de chaque ville | `WATCHTOWER.effects.visionRangeL1`, `visionRangePerLevel` | 11 / 35 / 65 / 125 cases aux niveaux 1 / 5 / 10 / 20 ; une attaque se voit sur la carte en entrant dans le rayon (l'alerte, elle, est inchangée) |
| Taille d'une alliance | 5 membres par niveau de l'Ambassade du chef, 100 au plus (§ 17, D11 ; le matin : 3 et 60) | `EMBASSY.effects.allianceMembersPerLevel`, `config.alliance.maxMembers` | 35 au niveau 7 (fondation), 50 au 10, 100 au 20 ; le Bastion demande 15 membres (Ambassade du chef 3) |
| Bâtiments de bonus (niveau 5 au plus) | +2,5 % par niveau, +12,5 % au niveau 5 | `*ProdBonusPctL1`, `*ProdBonusPctL5` | la moitié d'avant : une colonie aux champs 20 produit 13,5 à 15 % de moins selon son gisement (§ 15) |
| Grandes casernes et écuries pour la capitale | −0,75 % de temps de formation par niveau, niveaux de toutes les villes additionnés (§ 17, D13 ; le matin : 0,5) | `GREAT_BARRACKS` / `GREAT_STABLE` `capitalTrainTimeReductionPctPerLevel` | 2 colonies au niveau 20 : −30 % (le but visé) ; avec la Caserne 20 (−10 %), la formation dans la capitale prend 40 % de temps en moins, sous le plafond de 60 % |
| Mur d'une colonie | 15 au plus (capitale 20) | `WALL.effects.colonyMaxLevel` | 15 000 PV de mur et +15 % de défense au plus ; il faut 75 % des engins d'un mur 20 pour une brèche (tableau du § 12) |
| Anneau | capitale 18 emplacements, colonie 12 | `config.city.ringSlots` | autant que de bâtiments possibles : aucun choix de « bâtiment en trop » à faire |
| Or des unités d'élite | 2 or par unité (§ 17, D5 ; le matin : 1) | `config.recruit.goldPerUnit` | la Chambre au Trésor donne 10 à 200 or par jour : de quoi payer 5 à 100 unités d'élite par jour, plus l'or des gisements d'or, des expéditions menées par le héros et du trésor des invasions ; l'or sert aussi aux espions, aux soins immédiats et aux talents du héros |
| Prix en ressources de l'élite | × 0,85 (§ 17, D5 ; le matin : × 0,95) | `config.recruit.eliteResourceCostMult` | voir ci-dessous et § 17 |

**Élite contre intermédiaire** (mesure du matin du 31 octobre 2026 : moyenne des 54 unités de combat des six civilisations,
prix du serveur avec × 0,95, sans l'or ; avec × 0,85 depuis le soir, l'élite gagne encore environ 12 % par ressource, § 17) :

| Palier | Puissance pour 1 000 ressources (coefficients de puissance 1 / 1,25 / 1,55) | Puissance de bataille pour 1 000 ressources (1 / 1,35 / 1,9) | Puissance de bataille par céréale d'entretien |
|---|---|---|---|
| Base | 482 | 482 | 13,2 |
| Intermédiaire | 541 | 584 | 16,0 |
| Élite | 521 | 639 | 20,4 |

Au moteur de bataille, l'élite reste la meilleure par ressource (+9 %) et par céréale (+28 %). Avec les coefficients de
puissance (pillages, camps, rencontres, affichage), elle est 4 % sous l'intermédiaire par ressource : pour qu'elle l'égale
aussi là, il faudrait un multiplicateur d'environ 0,91 au lieu de 0,95. À trancher avec l'or par unité, par la vérification
d'équilibrage prévue par la décision 15.

**À mesurer en simulation** (nouvelle simulation décidée le 31 octobre 2026 au soir, D18) : le débit du marché porté par des
armées, l'or disponible pour l'élite et sa part dans les armées, l'effet de la cachette à 1,5 % du stockage par niveau sur
les raids (les petites villes moins protégées qu'avec la quantité fixe, les grosses bien plus), la taille réelle des
rassemblements et des alliances, et l'effet de la vision sur les attaques (une armée ennemie ne se voit qu'à l'approche).

**Outils** : les joueurs automatiques (`tools/sim`) suivent ces règles : anneau de 18 / 12 emplacements, Bâtiment principal
20, Mur des colonies 15, Marché et Comptoir dans la capitale (plus de Comptoir ni de Marché en colonie), échanges et envois
par armée (plus de marchands ni de routes depuis le 31 octobre 2026 au soir), or de l'élite (un palier d'élite qu'ils ne peuvent pas payer attend, et ils gardent l'or d'un
lot de 100 unités d'élite avant un soin à l'or, un espion ou un changement de talents), Grandes casernes pour la capitale,
taille des rassemblements (`maxArmies`), taille d'alliance (le chef monte son Ambassade quand l'alliance est pleine), Forge
dans leurs estimations de combat. Contrôles ajoutés à la simulation : bâtiment hors de l'anneau, bâtiment au-dessus de son
niveau maximum, rassemblement au-delà de sa taille, armée d'échange ou de transport bloquée après son arrivée, armée réservée
au marché sans offre active. `tools/simulate-colonies.cjs` et `tools/simulate-factions.cjs` impriment les nouveaux chiffres
(emplacements, plafonds, taxe des échanges, cachette).

## 17. Décisions du rapport de vérification (31 octobre 2026, au soir)

Réponses du propriétaire aux 20 questions de `docs/RAPPORT-VERIFICATION-2026-10-31.md`, ce qui a été fait et pourquoi :
`docs/DECISIONS-2026-10-31-SOIR.md` ; règles détaillées : `docs/ETAT-DES-SYSTEMES.md`. Chaque chiffre est dans
`src/config/index.js` ou `data/*.json`, avec la mention « décision du 31 octobre 2026 (rapport de vérification) ». Les
mesures de la fin de partie utilisent le vrai moteur de combat et les armées de la simulation du 31 octobre (jours 120 à
175 ; une « armée médiane » = toute l'armée d'un joueur médian, environ 475 000 de puissance au jour 150 ; +15 % pour
l'assaillant avec les recherches et la Forge 20, Forge 20 pour les défenseurs, 65 engins par armée assaillante avec
l'Atelier 20).

| | Sujet | Avant → maintenant | Où le régler | Pourquoi, et ce que donnent les chiffres |
|---|---|---|---|---|
| D1 | Carte et gisements | 374 × 374, 4 895 gisements n'importe où sur la terre (+ 636 d'or) → **420 × 420 pour un monde neuf, 6 000 gisements + 780 d'or (13 %)**, posés là où une ville tient, à 3 cases des autres ; capitales à 3 cases des gisements libres (repli : la règle d'avant) | `config.map.nodeSeeding`, `config.map.spawn.tries`, `Terrain.SIZE_BY_GENERATOR` | avant : 1 770 à 1 836 colonies sur 4 000 pour 2 000 joueurs (35 % des gisements infondables, un tiers des autres pris par les capitales) ; maintenant : 6 000 gisements fondables après 2 000 capitales et les 4 000 colonies fondées sur 5 graines ; 4 998 à 5 087 si tous choisissent le même côté (objectif 4 600). Bande de départ 100 → 112 cases, anneaux des donjons agrandis de 420/374. Mondes ouverts avant : inchangés |
| D2 | Côté de la carte | au hasard → **au choix : Nord, Est, Sud, Ouest ou au hasard** (inscription et monde suivant) ; côté plein : un voisin, puis l'opposé | `src/utils/spawn.js` | pour former des alliances entre voisins : seuls 7 membres d'une alliance de 16 étaient à portée d'un rassemblement d'une heure |
| D3 | Attentes des rassemblements | 5, 10, 30, 60 min → **5, 10, 30, 60, 120, 180 min** | `config.rally.waitMinutes` | une alliance dispersée rassemble plus de membres |
| D4 | Or des expéditions | 50 + hasard × 100 × difficulté, sans héros (≈ 834 or par jour avec 15 armées, sans risque) → **seulement avec le héros**, une chance sur deux, 10 + 10 × difficulté en moyenne (± 50 %) : **10 / 15 / 20 / 25 or espérés** pour les difficultés 1 à 4 ; talent Chasseur de trésors compris | `config.expedition.gold` | l'or redevient rare : 50 à 200 or par jour avec un héros actif |
| D5 | Prix de l'élite | 1 or, ressources × 0,95 → **2 or, ressources × 0,85** | `config.recruit.goldPerUnit.elite`, `eliteResourceCostMult` | l'élite était 2 % moins rentable que l'intermédiaire par ressource ; légionnaire romain 361 → 340 ressources, cavalerie lourde 462 → 435 ; soin immédiat inchangé (1 / 2 / 3 / 3 or) |
| D6 | Unités intermédiaires | 7 endurances proposées → **pas de changement** (refus du propriétaire) | `data/units.json` | — |
| D7 | Marchands et routes | 1 marchand par niveau du Marché (20 au niveau 20), routes entre ses villes → **retirés** ; échanges et envois entre joueurs par des armées de transport, à la charge de leurs troupes | `config.market` (plus de `merchants` ni `routes`), migration `0033_sans_marchands` | le stock du joueur est commun : rien à transporter entre ses villes. Charge d'une armée de transport × civilisation × (Marché +5 %, Comptoir +1 %, Poste du Désert +1 % par niveau ; Marché 10 + Comptoir 5 + Poste 4 = +59 %, les trois au niveau 20 = +140 %) × Bastion +10 % |
| D8 | Taxe des échanges entre joueurs | 10 % de base (0 % dès le Comptoir 5 avec la Chambre au Trésor 20) → **30 % de base**, −1 % par niveau du Comptoir, −0,25 % par niveau de la Chambre au Trésor | `config.market.p2pTaxPctBase`, `treasureTaxReductionPctPerLevel` | chaque niveau du Comptoir compte : 30 % sans rien, 25 % avec la Chambre 20, 20 / 15 / 10 % avec le Comptoir 5 / 10 / 15 et la Chambre 20, **5 % avec les deux au niveau 20**, 23 % avec le Comptoir 7 seul ; un échange de 1 000 contre 1 000 sans bâtiment livre 700 de chaque côté. Le marchand du serveur (30 / 21 / 11 % aux Marchés 1 / 10 / 20, d'un seul côté) reste moins cher jusqu'au Comptoir 15 avec la Chambre 20 |
| D9 | Bastion | mur 10 × un mur 20 (200 000 PV), garnison sans plafond, tous les camps d'une alliance finissant ensemble en un assaut → **mur 3 × un mur 20 (60 000 PV), garnison de 10 armées au plus (celles en route et en sortie comprises), un assaut = un rassemblement ou une armée seule** ; vies (10) et remontée (72 h) inchangées (depuis le 1er novembre 2026 : 24 h sans assaut gagné avant qu'une vie revienne, E3 ; camp brisé par plusieurs armées ensemble, E4 ; § 18) | `config.bastion.wallMultiplier`, `maxGarrisonArmies` | façon fort barbare de Rise of Kingdoms. Contre une garnison pleine de 25 armées médianes, un rassemblement plein de 25 ne gagnait jamais, quel que soit le mur (0 % de × 3 à × 10 ; 64 % sans mur). Un rassemblement ne prend qu'une armée par joueur : une alliance de 15 à 20 n'aligne que 15 à 20 armées. **Contre une garnison pleine de 10 armées médianes, un rassemblement de 15 / 16 / 17 / 18 / 20 armées prend une vie 4 / 19 / 50 / 83 / 100 % des fois** (contre 17 armées : 0 % jusqu'à 20 armées) ; sans garnison, **5 armées de 65 engins** suffisent (4 sous un chef du Sultanat). Le camp devant un Bastion peut être attaqué par les renforts (sortie de la garnison, « Briser le siège » du dehors), rassemblement compris |
| D10 | Coût de la Merveille | 250 000 / 250 000 / 250 000 / 75 000 au niveau 1 → **125 000 / 125 000 / 125 000 / 37 500** (× 1,05 par niveau inchangé) | `config.world.wonderCostBase` | le transport fixait la fin du monde vers les jours 175 à 220 ; Merveille entière 2,15 G → **1,08 G** ; niveaux 1 à 50 : 173 M → **86 M** ; l'armée est le vrai moyen de la ravitailler |
| D11 | Taille des alliances | 3 membres par niveau de l'Ambassade, 60 au plus → **5 par niveau, 100 au plus** | `EMBASSY.effects.allianceMembersPerLevel`, `config.alliance.maxMembers` | la fin de partie reste réglée pour 15 à 20 joueurs : les rassemblements gardent 25 armées au plus, une alliance de 100 ne frappe pas plus fort une même cible |
| D11 | Défi de la semaine | total des membres → **total ÷ max(membres, 20)**, au dixième ; récompenses 750 / 500 / 250 inchangées | `config.alliance.challengeMinMembers` | la plus grosse alliance gagnait 12 semaines sur 18 |
| D11 | Immortels : site | **3,0 M** (inchangé) | `config.world.immortalSitePower` | une alliance de 15 / 16 / 17 / 18 / 20 joueurs le prend avec 47 / 44 / 41 / 39 / 35 % de son armée (jour 120) |
| D11 | Immortels : plan | 4,5 M → **5,75 M** | `config.world.immortalPlanPower` | avant 58 / 54 / 51 / 48 / 43 % de l'armée, hors de la cible ; maintenant **74 / 69 / 65 / 61 / 55 %** (65 % à 17 joueurs ; jour 150) |
| D11 | Vagues contre la Ville Merveille | 20 000 × niveau^1,35 → **14 000 × niveau^1,35** (14 500 proposé d'abord) : 2,75 M au niveau 50, 7,02 M au niveau 100 | `config.world.immortalWaveBase`, `immortalWaveExp` | derrière le Mur 15 de la Ville Merveille (son Mur s'arrête au niveau 15), une alliance de 15 / 16 / 17 / 18 / 20 joueurs tient le niveau 100 avec **89 / 85 / 82 / 76 / 68 %** de son armée, 80 % en moyenne comme visé (avant, 16 joueurs plafonnaient au niveau 86 avec toute leur armée ; à 14 500 : 92 / 88 / 85 / 78 / 70 %). Un mur 15 seul tient jusqu'au niveau 2, tombe au 2e round au niveau 10, au 1er dès le 17 |
| D11 | Donjons d'invasion | inchangés (avant-poste du niveau 1 = la moitié de la médiane, × 1,8 par niveau, étages × 1 / 2 / 4 ; 42 % de la médiane des soldats depuis le 1er novembre 2026, E5, § 18) | `config.invasion.powerRef` | médiane 466 000 : chef du niveau 1 (0,93 M) battu par 2 joueurs, du niveau 4 (5,44 M) par 11, du niveau 5 (9,79 M) par 19 : toutes les cibles sont tenues |
| D12 | Colonies neuves | aucune protection → **72 h sans attaque, raid ni siège** après la fondation (espions permis) | `config.city.newColonyProtectionHours` | 54 colonies sur 125 rasées dans la simulation, 5 jours après leur fondation en médiane, presque toutes sans mur : 72 h laissent le temps de bâtir le Mur |
| D13 | Grandes casernes et écuries pour la capitale | 0,5 → **0,75 % par niveau** | `capitalTrainTimeReductionPctPerLevel` | deux à 20 : 20 → **30 %** (le but) ; avec la Caserne 20 : 40 %, sous le plafond de 60 % |
| D14 | Spécialité des gisements | **+10 % par niveau, gardé** | `RESIDENCE.effects.colonyNodeBonusPctPerNodeLevel` | — |
| D15 | Cachette | quantité fixe (240 → 32 000, 20 % d'une capitale pleine et 5 % d'une colonie pleine au niveau 20) → **1,5 % du stockage de la ville par niveau**, pour chaque ressource ; Gaule × 1,2 | `HIDEOUT.effects.hideoutStoragePctPerLevel` | « on avait dit 30 % des ressources ». Capitale pleine (160 000) : 7 200 / 24 000 / 36 000 / 48 000 aux niveaux 3 / 10 / 15 / 20 (Gaule 8 640 / 28 800 / 43 200 / 57 600) ; colonie pleine (640 000) : 28 800 / 96 000 / 144 000 / 192 000. Au début, plus faible qu'avant : cachette 3 avec un Dépôt 5 garde 151 (402 avant), sans Dépôt 15 par niveau |
| D16 | Chambre au Trésor | **inchangée** | — | — |
| D17 | Trésor des invasions (or) | 40 × 2^(niveau − 1) → **200 × 2^(niveau − 1)** : 200 / 400 / 800 / 1 600 / 3 200 | `config.invasion.treasure.gold` | 3 520 or par semaine pour une alliance qui détruit les donjons 4 et 5 avant : un bonus symbolique ; maintenant il compte |

**Phrases fausses corrigées** (rapport, § 3) : la carte de 374 ne tenait pas « 4 900 gisements, assez pour environ
2 450 joueurs », mais environ 1 000 à 1 050 joueurs à 2 colonies ; un compte complet (capitale et 2 colonies au niveau 20)
arrive vers les jours **114 à 154** (et non 84 à 132) avec les vraies dates de fondation ; une récompense de quête plafonnée
vaut **1,4 h** de production d'un compte complet (et non 20 minutes) ; dans la simulation, les vraies premières fondations
de colonies sont aux jours médians **52 et 79** (59 et 81 comptaient aussi les colonies refondées après avoir été rasées).


## 18. Décisions du 1er novembre 2026 (simulation de 200 jours)

Réponses du propriétaire aux constats de la simulation de 200 jours (38 joueurs automatiques qui jouent par le vrai serveur),
ce qui a été fait et pourquoi : `docs/DECISIONS-2026-10-31-SOIR.md`, section « Décisions du 1er novembre après la
simulation » ; règles détaillées : `docs/ETAT-DES-SYSTEMES.md`. Chaque chiffre est dans `src/config/index.js`, avec la
mention « décision du 1er novembre 2026 (simulation de 200 jours) ». Les mesures de combat utilisent le vrai moteur et les
armées de la simulation au jour 200 (+15 % pour l'assaillant avec les recherches et la Forge 20).

| | Sujet | Avant → maintenant | Où le régler | Pourquoi, et ce que donnent les chiffres |
|---|---|---|---|---|
| E1 | Ce qu'une armée emporte (offre, échange, envoi, transport, Merveille, Bastion) | pris dans la seule ville de l'armée → **pris dans toutes les villes du joueur**, la ville de départ d'abord puis la plus pleine ; une offre rendue ou une livraison va à la ville visée d'abord, puis aux autres selon la place | `src/utils/db.js` (`debitPlayer`, `creditPlayer`, `lockCitiesOfPlayers`) | les colonies tiennent 89 % du stockage (640 000 par ressource contre 160 000) et finissent pleines (céréales à 96 %), la capitale à 4 % de céréales : 90 échanges, aucun après le jour 119 ; la Merveille de LUP bloquée 41 jours au niveau 1 faute de 1 235 céréales avec 46,8 M de bois, pierre et fer en stock |
| E2 | Armées des colonies | une armée d'une colonie ne recevait jamais de troupes (5 armées utiles par joueur) → **une armée à l'arrêt dans sa colonie s'y rattache** : place de la colonie, défense de la colonie, retour à la colonie ; pas de troupes ajoutées ni retirées là-bas ; « Renvoyer à la capitale » s'il y a une place libre | `config.army.colonyArmies` (Ville Merveille : non) | 190 armées sur les places de la capitale, 0 sur celles des colonies ; 16 joueurs sur 38 auraient eu besoin d'une armée de plus |
| E3 | Vies du Bastion | une vie toutes les 7,2 h sans arrêt → **aucune pendant 24 h après un assaut gagné**, puis une toutes les 7,2 h ; chaque assaut gagné relance la pause | `config.bastion.regenPauseHours` (24), `regenHours` (72) | 100 assauts, 76 gagnés, 0 Bastion rasé : il fallait 10 assauts gagnés à moins de 7,2 h l'un de l'autre (3 groupes en relais pendant 54 à 65 h). Avec la pause, un groupe qui revient toutes les 14 à 17 h prend une vie à chaque fois : 6 à 7 jours pour 10 vies, environ 2,5 jours avec 3 groupes |
| E4 | Briser le siège d'un Bastion | chaque armée seule contre tout le camp → **les armées du côté du Bastion qui atteignent le camp dans la même minute se battent ensemble** (une bataille, pertes par armée) | `config.bastion.breakGroupSeconds` (60) | 233 armées en 72 vagues, 2 combats gagnés ; toute l'armée d'un joueur, réunie, bat un camp de 1 / 2 / 3 / 5 / 9 armées 100 / 77 / 2 / 0 / 0 % des fois (une seule armée de campagne : 47 / 0 / 0 / 0 / 0 %) ; groupées : autant d'armées que le camp gagnent 35 à 38 %, deux de plus 99 à 100 % |
| E5 | Donjons d'invasion | avant-poste du niveau 1 = 50 % de la médiane de toutes les unités → **42 % de la médiane des soldats** (sans les engins de siège) ; × 1,8 par niveau et étages × 1 / 2 / 4 inchangés | `config.invasion.powerRef.outpostPctOfMedian`, `hordeService.measuredBasePower` | un joueur n'envoie que l'armée de sa capitale (84 % de son armée). Chefs des niveaux 1 / 4 / 5 : 3 / 13 / 22-23 joueurs avec 50 % → **2 / 11 / 19** avec 42 % (2 / 10 / 18 avec la médiane sans engins) ; chef du niveau 5 : 11,1 M. Médiane au jour 200 : 599 000 sans engins, 628 000 avec |
| E6 | Site de Merveille libéré | libre 24 h pour toute alliance → **réservé 6 h à l'alliance qui a battu les Immortels**, puis libre pour toutes jusqu'à la fin des 24 h | `config.world.wonderSiteReserveHours` (6), migration `0034_site_merveille_reserve` | LUP a fondé sur le site qu'AQL venait de libérer, 3 minutes après son combat ; AQL a libéré 9 fois un site avant de fonder (jour 197) |
| E7 | Vagues d'Immortels | **14 000 × niveau^1,35, gardé** | `config.world.immortalWaveBase` | armées du jour 200 : une alliance de 16 / 15 tient le niveau 100 avec 61 / 67 % de son armée (80 % visés : il faudrait 17 000 à 18 000) ; 83 vagues tenues au niveau 1 dans la simulation. À mesurer de nouveau quand une simulation atteint la Merveille 50 |
| E8 | Taxe des échanges entre joueurs | **30 % de base, gardée** | `config.market.p2pTaxPctBase` | taxe réelle côté vendeur dans la simulation : 17,3 % (Comptoir 5 à 15, Chambre au Trésor jusqu'à 20) ; plus avantageux que le marchand du serveur (11 % au Marché 20) seulement avec le Comptoir 15 et la Chambre 20 |

## 19. Décisions du 2 novembre 2026 (deuxième simulation de 200 jours)

Réponses du propriétaire aux constats de la deuxième simulation de 200 jours (38 joueurs automatiques avec D1 à D19 et
E1 à E8, deux alliances rivales voisines), ce qui a été fait et pourquoi : `docs/DECISIONS-2026-10-31-SOIR.md`, section
« Décisions du 2 novembre après la deuxième simulation » ; règles détaillées : `docs/ETAT-DES-SYSTEMES.md`. Chaque chiffre
est dans `src/config/index.js`, avec la mention « décision du 2 novembre 2026 (deuxième simulation de 200 jours) ». Les
mesures de combat utilisent le vrai moteur et les armées de la simulation au jour 200 (médiane 3 486 soldats par joueur,
+15 % pour l'assaillant avec les recherches et la Forge 20, 65 engins par armée assaillante, 200 tirages).

| | Sujet | Avant → maintenant | Où le régler | Pourquoi, et ce que donnent les chiffres |
|---|---|---|---|---|
| G1 | Garnison du Bastion | **10 armées au plus, gardé** | `config.bastion.maxGarrisonArmies` | contre 10 armées médianes derrière le mur d'avant (60 000), 15 / 16 / 17 / 18 armées prenaient une vie 8-10 / 30-34 / 70-77 / 97 % des fois ; avec le mur de 36 000 (G2) : 13 / 14 / 15 / 16 armées → 5 / 36 / 84 / 99 % |
| G2 | Mur du Bastion | 3 × un mur 20 (60 000 PV), remis à neuf à chaque assaut → **1,8 × un mur 20 (36 000 PV)**, qui **garde les dégâts de chaque assaut** (gagné ou repoussé) et **redevient plein 12 h après le dernier dégât**, en ligne droite ; les vies n'y entrent plus | `config.bastion.wallMultiplier` (1,8), `wallRepairHours` (12), `Bastion.wallHp` / `wallAt`, migration `0036_mur_bastion` | 105 assauts, 5 gagnés, 0 Bastion rasé ; après le jour 120, 52 assauts repoussés d'affilée, dégâts médians 8 897 sur 60 000 et un mur neuf à chaque fois. Maintenant un premier assaut repoussé laisse un second de la même taille, 6 h plus tard, face à 18 000 PV : **33 / 83 / 100 % avec 12 / 13 / 14 armées** contre une garnison remise à neuf, presque toujours si elle n'a pas remplacé ses pertes ; sans garnison, 3 armées de campagne suffisent (5 avant) |
| G3 | Tous les combats | raids, camps, donjons, sites, plans et terrain ouvert par comparaison de puissance (pertes forfaitaires : perdant 30 %, vainqueur 30 % × 0,3, camp 15 %) → **moteur de bataille partout** (attaque, défense, endurance, paliers, triangle, rounds), pertes par type d'unité partagées entre les armées au total exact ; **un raid s'arrête dès qu'un camp a perdu 30 % de ses soldats** (règle du GDD), les autres combats jouent leurs rounds | `combatService.resolveCombat` (`opts.raid`), `config.combat.loserLossRate` (0,30), `armyUnits.splitLosses` ; `winnerLossMultiplier` et `tribeLossMultiplier` retirés | une ligne de 1 à 3 soldats ne mourait jamais (30 % arrondis à l'entier inférieur : 225 raids gagnés sans tuer un défenseur) ; des gardes usées éternelles et inutiles ; les sièges et le Bastion avaient déjà le moteur. Blessés, plafonds et bonus de chaque combat gardés |
| G4 | Butin d'un raid | ≤ 30 % de la charge des survivants → **≤ 100 %**, sur au plus la moitié de ce qui dépasse la cachette (inchangé) | `config.combat.raidLootPctOfCarry` (1,0), `config.hideout.raidStealRate` (0,5) | 1 215 raids gagnés, 10,56 M de butin : **8 691 par raid, 0,52 % du stock d'une ville pleine** ; le plafond de 30 % bornait le butin bien avant la cachette (30,5 % du stock à l'abri) |
| G5 | Assaut de Bastion perdu | **jusqu'au dernier soldat, gardé** | — | les 20 derniers assauts : 57 731 soldats et 6 243 engins perdus (100 %), 0 défenseur tué |
| G6 | Vagues d'Immortels | toutes les 12 h → **toutes les 24 h**, même force (14 000 × niveau^1,35) | `config.world.immortalWaveHours` (24) | une vague tenue tue 27 à 53 % des soldats postés ; à deux par jour, tenir le niveau 50 coûtait 14 000 à 20 000 soldats par jour à une alliance de 50 000 à 54 000 ; 312 vagues, 14 tenues, Merveilles à 23 et 17 (92 % des 377 M livrés détruits) |
| G7 | Plan des Immortels | **5,75 M, gardé**, à mesurer de nouveau après G3 | `config.world.immortalPlanPower` | aucun plan pris : 3 rassemblements de 3,90 / 2,95 / 3,07 M l'ont usé de 5,75 à 3,84 M ; il demande 68 à 77 % de tous les soldats d'une alliance de 15-16 (90 à 100 % des armées de capitale) ; une usure en 2 à 3 rassemblements le met à la portée de 12-13 joueurs |
| G8 | Donjons d'invasion | **42 % de la médiane des soldats, gardé**, à mesurer de nouveau | `config.invasion.powerRef.outpostPctOfMedian` | l'armée de la capitale pèse 74 % des soldats (84 % quand E5 a été réglé) : chefs des niveaux 1 / 4 / 5 pour 3 / 12 / 21 joueurs (37 % donnerait 2 / 11 / 19) ; aucun donjon 4 ou 5 attaqué par les joueurs automatiques |
| G9 | Échange de soldats | une armée ne recevait des soldats que de la réserve de sa capitale → **« Échanger »** : deux armées du même joueur au même endroit, toutes deux à l'arrêt (ou en garnison dans le même Bastion), se passent des soldats dans les deux sens ; la garde rattachée à une colonie reçoit sans emplacement de la capitale ; une armée vidée hors de chez elle rentre aussitôt | `POST /api/army/:id/exchange`, onglet Armée › Échanger | gardes des colonies à 227 soldats pour 524 voulus, 5 vides, 8 061 « Renvoyer à la capitale » refusés (5 659 faute de place : 27 capitales sur 38 pleines) ; 477 raids sur 480 gagnés par le pillard sur les colonies |
| G10 | Défense d'une ville | la réserve (garnison) défendait avec les armées → **seules les armées défendent** : la réserve ne combat pas, n'est ni tuée ni blessée et reste en ville ; le joueur en est prévenu (onglet Armée, carte, siège, alerte d'attaque, rapport d'espion) | `armyProcessor.defendingArmies`, client | la réserve (6 % des soldats, une salle d'attente) défendait la capitale sans décision du joueur ; une colonie non : une seule règle, et « Échanger » pour remplir une garde |
| G11 | Camps d'or | **à mesurer** dans la prochaine simulation | `config.map.goldNode`, joueurs automatiques | 0 camp pillé sur 780 (les joueurs automatiques jugeaient leur besoin sur la seule capitale) ; 166 camps à 20 cases d'une capitale donneraient environ 111 or par joueur et par jour |
| G12 | Trésor des donjons | ce qui ne tenait nulle part était perdu → **1 point d'alliance par 1 000 ressources perdues, au plus 2 fois les points de la part**, et le message le dit | `config.invasion.treasureOverflow` | 322 parts sur 324 perdaient leur bois, pierre et fer (1 494 801 sur 1 524 267, 98 %) ; l'or (7 653 sur 7 800) et les points étaient bien versés |
| G13 | Progression de fin de partie | comptes complets au jour 126, plus rien à faire progresser → **étude faite**, réponses H1 à H10 du propriétaire (taille maximale d'une armée, Gloire et triomphes, prêt de soldats, retrait de Plus), lots à venir | `docs/BACKLOG.md` | 34 joueurs sur 38 identiques au jour 200 |
