# Équilibrage — vérification d'octobre 2026

Vérification de ce que le jeu applique réellement (code serveur) contre ce que les données annoncent, et lecture des
courbes. Chiffres tirés de `data/*.json` et `src/config/index.js` ; calculs reproductibles avec les commandes du § 6.
Mise à jour du 30 octobre 2026 : décisions d'équilibrage D1 à D12 du propriétaire (§ 13) et chiffres refaits avec les
outils sur le moteur actuel (§ 2, 7, 8, 9, 11, 12) ; le soir, décisions sur l'économie, le placement des bâtiments et le
stock partagé entre les villes (§ 14). Mise à jour du 31 octobre 2026 : rôle des colonies (décisions du 30 octobre, puis
2 colonies par joueur, 2 000 joueurs par serveur et la spécialité du gisement), chiffres à régler plus tard (§ 15).

## 1. Bonus de civilisation : définis, appliqués, et où

| Civilisation | Bonus (data/factions.json) | Appliqué dans | Verdict |
|---|---|---|---|
| Rome | +10 % défense des unités | tout combat (attaque de ville, pillage, tribu) | ✅ |
| Rome | −15 % pertes en siège (subies ou infligées) | combats de ville et de Bastion : solidité des unités romaines × 1,15, qu'elles attaquent ou défendent ; pas en pillage ni contre les camps (combats par la puissance) | ✅ conforme à « en siège » |
| Gaule | +20 % défense chez soi | défense de ses villes, tout combat ; depuis le 30 octobre 2026, son mur encaisse aussi 1/1,2 des coups des engins | ✅ |
| Gaule | +20 % cachette | quantité cachée de chaque ressource × 1,2 (cachette en quantité fixe par niveau depuis le 31 octobre 2026 ; avant : +15 % d'une part plafonnée à 20 %) | ✅ |
| Grèce | −15 % temps de construction | chaque construction | ✅ |
| Grèce | +15 % blessés au lieu de morts | taux de blessés après combat (+15 points, plafond 70 %) | ✅ |
| Égypte | +20 % transport | butin des pillages, envoi par armée (les marchands ont leur propre charge depuis le 31 octobre 2026 : 750 pour l'Égypte) | ✅ |
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
- Monde de 374 cases de côté : le traverser prend ≈ 3 h ; un voisin à 20 cases est à 10 min pour l'infanterie, 5 min pour la cavalerie.
- Le trajet suivi est le chemin réel (contournement des montagnes et de l'eau), l'armée va à la vitesse de son unité la plus lente. ✅
- Bonus qui s'ajoutent : héros (jusqu'à +5 %, plus les talents), Cartographie (+10 % au niveau 20), Bastion d'alliance (+5 %),
  **Irrigation égyptienne de la ville de départ** (+0,5 % par niveau, +10 % au niveau 20) : depuis le 30 octobre 2026, elle
  compte dans tous les trajets (armées, retours, espions, convois du marché, ravitaillement du Bastion) et dans l'estimation
  du client. Les convois des routes commerciales gardent leur vitesse fixe.
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
  la cachette protège du pillage** : raids, pillage de siège et rapport d'espion. Depuis le 31 octobre 2026, une **quantité
  fixe de chaque ressource** par niveau (façon Travian) : 240 au niveau 1, 2 436 au niveau 10, 32 000 au niveau 20, soit
  20 % d'un Dépôt de même niveau (`HIDEOUT.effects.hideoutL1/hideoutL20`, même courbe que le stockage) ; Gaule × 1,2.
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
Les Douves n'existent plus (30 octobre 2026). Combats par la puissance (pillages, camps, rencontres,
hordes) : pertes du perdant 30 %, butin ≤ 30 % du transport, cachette seule protection (D1). Tous vérifiés
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
20, plafond 20 %) et mur gaulois à 99 coups par niveau au lieu de 83. (Depuis le 31 octobre 2026, la cachette protège une
quantité fixe et la Gaule en cache × 1,2 : 806 / 2 923 / 10 596 / 38 400 de chaque ressource aux niveaux 5, 10, 15, 20 ;
`node tools/simulate-factions.cjs`.)

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
| Bastion (10 × mur 20, D6) | 200 000 | — | 1 098 / 1 647 / 3 293 | 3,56 millions, à répartir entre les membres d'un rassemblement |

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
(comme les Natars de Travian, qui viennent avec béliers et catapultes). Un mur 20 sans défenseurs tient seul jusqu'à la
Merveille niveau 6 ; il tombe au 7e round au niveau 12, au 4e au niveau 20, dès le 1er au niveau 100, et les défenseurs doivent
alors battre la vague. À décider par le propriétaire : garder 15 % ou revenir vers 7 %, qui rendrait le seuil d'avant (mur
seul jusqu'au niveau 11) ; avec 15 %, une vague de niveau 100 bat aussi des défenseurs qui valent 80 % de sa puissance.

## 13. Décisions d'équilibrage du 30 octobre 2026

Décisions du propriétaire, appliquées le 30 octobre 2026 ; le détail des règles est dans `docs/ETAT-DES-SYSTEMES.md`.

| | Décision | Où | Chiffres |
|---|---|---|---|
| D1 | Grand Dépôt et Grand Silo = stockage (3 × un dépôt ou un silo de même niveau), plus de réserve protégée ; seule la cachette protège | `data/buildings.json`, `calculations.cityStorageCaps` | § 4 : 3 600 → 480 000 ; Dépôt 20 + Grand Dépôt 20 = 640 000 |
| D2 | Formation à la Caserne et à l'Écurie : GDD gardé (−0,5 % par niveau) | — | inchangé |
| D3 | Alliance : 60 membres au plus (adhésion sous verrou, invitation refusée quand elle est pleine) ; depuis le 31 octobre 2026, 3 membres par niveau de l'Ambassade du chef dans cette limite (§ 16) | `config.alliance.maxMembers`, `EMBASSY.effects.allianceMembersPerLevel` | 60 |
| D4 | Camps : défenseurs à leur palier et camps d'or à +40 % au combat ; rassemblements d'alliance contre les sites et plans de Merveille | `armyService`, `rallyService`, `wonderService` | § 9 |
| D5 | Brèche : au moins 5 rounds de combat après la chute du mur | `config.combat.siege.roundsAfterBreach` | § 12 |
| D6 | Seuls les engins abîment le mur ; mur du Bastion à 10 fois un mur 20 (50 avant) ; bonus des engins du Sultanat vérifié | `config.combat.siege`, `config.bastion.wallMultiplier` | § 12 : Bastion 200 000 PV |
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
| Merveille (rec. 7) | × 5 | `config.world.wonderCostBase` | 250 000 / 250 000 / 250 000 / 75 000 au niveau 1 ; niveaux 1 à 50 : 173 M ; Merveille entière : 2,15 G |
| Immortels (rec. 8) | × 5 | `config.world.immortal*` | site 3 M, plan 4,5 M ; vague 20 000 × niveau^1,35 : 3,93 M au niveau 50, 10 M au niveau 100 |
| Donjons (rec. 9) | Avant-poste du niveau 1 = max(3 000 ; 50 % de la puissance médiane des joueurs actifs), × 1,8 par niveau, étages × 1 / × 2 / × 4 ; ancienne formule sous 5 joueurs mesurés ; le trésor garde l'âge du monde | `config.invasion.powerRef`, `Invasion.basePower` | chef du niveau 1 = 2 joueurs médians ; du niveau 5 ≈ 21 |
| Trésor (rec. 2) | Capitale d'abord, puis les autres villes ; la notification dit ce qui a été perdu faute de place | `hordeService.destroyHorde` | — |
| Ciblage (rec. 10) | Coups de chaque round répartis sur toutes les lignes de soldats selon leur solidité totale ; engins visés après les soldats | `combatService.resolveCombatDetailed` | tableau ci-dessous |
| Pillage (rec. 11) | GDD gardé (30 % de la capacité, un raid par jour sur une même ville et par attaquant) ; présenté comme du harcèlement | client, documents | — |
| Plafonds (rec. 12) | Récompenses de quêtes et routes commerciales calculées sur le Dépôt et le Silo seuls | `questService.rewardCap`, `marketService.routeSendCap` | 80 000 par récompense au plus, 13 333 par envoi de route (Dépôt 20) |

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
gaulois (−1,9 %), Toxote (−11,1 %), Cavalier du désert du Sultanat (−31,0 %) ; il leur faudrait +1, +3 et +14 d'endurance
(à décider, `docs/BACKLOG.md`). Quatre intermédiaires dépassent l'indice 1,25 de la règle D12 (Archer du désert égyptien,
Archer du camp, Tireur du désert, Cavalier hun) : le test des fiches les excepte.

**Armées mélangées contre une armée de base pure, à nourriture égale** (moteur avant → après la répartition des coups) :

| Entretien | 25 % d'élite + 75 % de base | 50 % d'élite + 50 % de base |
|---|---|---|
| 5 / 9 / 13 | −10 à +8 % → **+35,8 à +42,2 %** | +1 à +39 % → **+52,3 à +65,1 %** |
| GDD 5 / 10 / 15 | −16 à −28 % → +5,5 à +12,0 % | −16 à −32 % → +10,3 à +26,4 % |

Ces gains dépassent les « +11 à 29 % sauf les Huns » du rapport : la mesure du lot B ne montre pas d'exception hunnique. Les
armées d'un seul palier ne changent pas.

**Vagues d'Immortels** (mur 20 sans défenseurs, mangonneaux pour 15 % de la vague) : le mur tient jusqu'à la Merveille 2,
tombe au 2e round au niveau 12 et dès le 1er round à partir du niveau 20 (il tenait jusqu'au niveau 6 avant le × 5).

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
| Joueurs par serveur | 2 000 | `config.world.maxPlayers` | 5 000 jusqu'au 31 octobre 2026 ; compte pour l'offre de gisements |
| Fondation | 3 000 de chaque ressource, 24 h sur place ; colon gratuit en 3 h | `config.city.foundationTransport`, `RESIDENCE.effects.cityFoundationTimeSec`, `settlerTrainTimeSec` | inchangé |
| Emplacements | anneau de 18 dans la capitale, 12 dans une colonie (et la Ville Merveille) ; Mur sur l'enceinte, emplacement 20 | `config.city.ringSlots`, `config.city.wallSlot` | autant que de bâtiments possibles, aucun libre (31 octobre 2026 ; avant : 19 partout) |
| Recrutement en colonie | Grande caserne / Grande écurie : paliers 1 / 7 / 15, temps −4 % par niveau ; prérequis Caserne 20 / Écurie 20 de la capitale | `GREAT_BARRACKS` / `GREAT_STABLE` : `unlockBaseTier`, `unlockIntermediateTier`, `unlockEliteTier`, `trainTimeReductionPctPerLevel`, `prereq` | unités vers la capitale ; pas d'engins (`config.recruit.siegeWorkshopLevel` vaut pour l'Atelier de la capitale) |
| Comptoir de commerce | capitale seulement depuis le 31 octobre 2026 (§ 16) : −1 point de taxe et +1 % de charge des marchands et des transports par niveau | `TRADE_OFFICE.effects` (`p2pTaxReductionPctPerLevel`, `armyTransportCapacityBonusPctPerLevel`), `config.market.p2pTaxPctBase` | la taxe (10 % de base) tombe à 0 dès le Comptoir 10 : les niveaux 11 à 20 ne donnent plus que de la charge (+20 % au Comptoir 20) ; à revoir à l'équilibrage |
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

**Offre de gisements** (mesure du 31 octobre 2026, même tirage que `src/game/seed.js` sur six cartes, sans base) : le
semis pose 4 895 points de bois, pierre, fer et céréales (et 636 d'or), sans en ajouter quand le monde grandit. Environ
**3 300** ont la place d'une ville 2 × 2 à l'ouverture (3 221 à 3 327 selon la carte, avant les capitales), dont 430 à 520
de niveau 3 (dont 140 à 190 dans le cercle du centre). Pour 2 000 joueurs à 2 colonies, il en faudrait 4 000 : assez pour les
premiers venus, pas pour tous. Rien n'est changé dans le semis (pas de correctif évident et sûr) : à décider avant
l'ouverture (`docs/BACKLOG.md`).

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
| Cachette | 240 de chaque ressource au niveau 1 → 32 000 au niveau 20 (courbe du stockage) ; Gaule × 1,2 | `HIDEOUT.effects.hideoutL1`, `hideoutL20` ; `data/factions.json` GAUL `hideoutCapacity` | 20 % d'un Dépôt de même niveau ; un raid prend au plus la moitié de ce qui dépasse (`config.hideout.raidStealRate`), un siège gagné 25 % (`config.combat.fall.pillagePct`) |
| Marchands : nombre | 1 par niveau du Marché de la capitale | `MARKET.effects.merchantsPerLevel` | 20 au Marché 20 |
| Marchands : charge | Rome 500, Gaule 750, Grèce 600, Égypte 750, Huns 500, Sultanat 1 000 ; + Comptoir et Poste du Désert de la capitale, +1 % par niveau chacun | `config.market.merchants.capacity` | un Romain au Marché 20 porte 10 000 par voyage : moins que 1/12 d'un Dépôt 20 (13 333), une route commerciale est donc limitée par ses marchands |
| Marchands : vitesse | Gaule 100, Huns 90, Rome 80, Égypte 80, Grèce 75, Sultanat 65 | `config.market.merchants.speed` | même échelle que les unités : 10 cases en 2,5 min (Gaule) à 3,9 min (Sultanat), contre 5 min pour une armée à vitesse 50 ; occupés à l'aller et au retour |
| Comptoir de commerce | capitale ; taxe −1 point par niveau, charge +1 % par niveau | `TRADE_OFFICE.effects` | taxe nulle dès le niveau 10 (voir § 15) |
| Taille des rassemblements | 5 armées + 1 par niveau de la Place de rassemblement du lanceur (25 au niveau 20) | `RALLY_POINT.effects.rallyMaxArmiesBase`, `rallyMaxArmiesPerLevel` | 3 à 15 avant ; la Place de rassemblement d'une alliance de 60 membres limite donc chaque rassemblement à 25 armées |
| Forge | +0,5 % d'attaque et +0,5 % de défense par niveau (+10 % au niveau 20), 50 % au plus | `FORGE.effects.attackBonusPctPerLevel`, `defenseBonusPctPerLevel` | avant : défense des villes seulement ; un côté de plusieurs joueurs prend la moyenne de leurs Forges selon les soldats |
| Vision des armées | 5 cases + 6 par niveau de la Tour de guet de la capitale, autour de chaque ville | `WATCHTOWER.effects.visionRangeL1`, `visionRangePerLevel` | 11 / 35 / 65 / 125 cases aux niveaux 1 / 5 / 10 / 20 ; une attaque se voit sur la carte en entrant dans le rayon (l'alerte, elle, est inchangée) |
| Taille d'une alliance | 3 membres par niveau de l'Ambassade du chef, 60 au plus | `EMBASSY.effects.allianceMembersPerLevel`, `config.alliance.maxMembers` | 21 au niveau 7 (fondation), 30 au 10, 60 au 20 ; le Bastion demande 15 membres (Ambassade du chef 5) |
| Bâtiments de bonus (niveau 5 au plus) | +2,5 % par niveau, +12,5 % au niveau 5 | `*ProdBonusPctL1`, `*ProdBonusPctL5` | la moitié d'avant : une colonie aux champs 20 produit 13,5 à 15 % de moins selon son gisement (§ 15) |
| Grandes casernes et écuries pour la capitale | −0,5 % de temps de formation par niveau, niveaux de toutes les villes additionnés | `GREAT_BARRACKS` / `GREAT_STABLE` `capitalTrainTimeReductionPctPerLevel` | 2 colonies au niveau 20 : −20 % ; avec la Caserne 20 (−10 %), la formation dans la capitale prend 30 % de temps en moins, sous le plafond de 60 % |
| Mur d'une colonie | 15 au plus (capitale 20) | `WALL.effects.colonyMaxLevel` | 15 000 PV de mur et +15 % de défense au plus ; il faut 75 % des engins d'un mur 20 pour une brèche (tableau du § 12) |
| Anneau | capitale 18 emplacements, colonie 12 | `config.city.ringSlots` | autant que de bâtiments possibles : aucun choix de « bâtiment en trop » à faire |
| Or des unités d'élite | 1 or par unité | `config.recruit.goldPerUnit` | la Chambre au Trésor donne 10 à 200 or par jour : de quoi payer 10 à 200 unités d'élite par jour, plus l'or des gisements d'or ; l'or sert aussi aux espions, aux soins immédiats et aux talents du héros |
| Prix en ressources de l'élite | × 0,95 | `config.recruit.eliteResourceCostMult` | voir ci-dessous |

**Élite contre intermédiaire** (moyenne des 54 unités de combat des six civilisations, prix du serveur avec × 0,95, sans
l'or) :

| Palier | Puissance pour 1 000 ressources (coefficients de puissance 1 / 1,25 / 1,55) | Puissance de bataille pour 1 000 ressources (1 / 1,35 / 1,9) | Puissance de bataille par céréale d'entretien |
|---|---|---|---|
| Base | 482 | 482 | 13,2 |
| Intermédiaire | 541 | 584 | 16,0 |
| Élite | 521 | 639 | 20,4 |

Au moteur de bataille, l'élite reste la meilleure par ressource (+9 %) et par céréale (+28 %). Avec les coefficients de
puissance (pillages, camps, rencontres, affichage), elle est 4 % sous l'intermédiaire par ressource : pour qu'elle l'égale
aussi là, il faudrait un multiplicateur d'environ 0,91 au lieu de 0,95. À trancher avec l'or par unité, par la vérification
d'équilibrage prévue par la décision 15.

**À mesurer en simulation** (pas refaite pour ce lot : pas de serveur ni de base) : le débit du marché avec les marchands
(offres prises, routes limitées par les marchands, Marché monté plus tôt), l'or disponible pour l'élite et sa part dans les
armées, l'effet de la Cachette en quantité fixe sur les raids (les petites villes sont mieux protégées, les grosses moins),
la taille réelle des rassemblements et des alliances, et l'effet de la vision sur les attaques (une armée ennemie ne se voit
qu'à l'approche).

**Outils** : les joueurs automatiques (`tools/sim`) suivent ces règles : anneau de 18 / 12 emplacements, Bâtiment principal
20, Mur des colonies 15, Marché et Comptoir dans la capitale (plus de Comptoir ni de Marché en colonie), marchands (ils lisent
leurs marchands libres une fois par tour, n'envoient jamais plus que ce qu'ils portent, et montent le Marché quand il en
manque ; plus de « Caravane »), or de l'élite (un palier d'élite qu'ils ne peuvent pas payer attend, et ils gardent l'or d'un
lot de 100 unités d'élite avant un soin à l'or, un espion ou un changement de talents), Grandes casernes pour la capitale,
taille des rassemblements (`maxArmies`), taille d'alliance (le chef monte son Ambassade quand l'alliance est pleine), Forge
dans leurs estimations de combat. Contrôles ajoutés à la simulation : bâtiment hors de l'anneau, bâtiment au-dessus de son
niveau maximum, rassemblement au-delà de sa taille, offre sans marchand, plus de marchands occupés que le Marché n'en donne,
marchands jamais arrivés ou jamais rentrés. `tools/simulate-colonies.cjs` et `tools/simulate-factions.cjs` impriment les
nouveaux chiffres (emplacements, plafonds, marchands, cachette).
