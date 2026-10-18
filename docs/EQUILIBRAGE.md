# Équilibrage — vérification d'octobre 2026

Vérification de ce que le jeu applique réellement (code serveur) contre ce que les données annoncent, et lecture des
courbes. Chiffres tirés de `data/*.json` et `src/config/index.js` ; calculs reproductibles avec les commandes en fin de page.

## 1. Bonus de civilisation : définis, appliqués, et où

| Civilisation | Bonus (data/factions.json) | Appliqué dans | Verdict |
|---|---|---|---|
| Rome | +10 % défense des unités | tout combat (attaque de ville, pillage, tribu) | ✅ |
| Rome | −15 % pertes en siège (subies ou infligées) | attaques de ville (points de vie des unités romaines ×1,15, des deux côtés) ; pas en pillage | ✅ conforme à « en siège » |
| Gaule | +20 % défense chez soi | défense de ses villes, tout combat | ✅ |
| Gaule | +15 % cachette | part des ressources protégée des pillages (plafond 20 %) | ✅ |
| Grèce | −15 % temps de construction | chaque construction | ✅ |
| Grèce | +15 % blessés au lieu de morts | taux de blessés après combat (+15 points, plafond 70 %) | ✅ |
| Égypte | +20 % transport | butin des pillages, envoi par armée, convois marchands | ✅ |
| Égypte | +25 % santé des murs | points de vie du mur (1 250 PV/niv. au lieu de 1 000), en construction comme à la réparation ; **corrigé** en octobre : portait auparavant sur le bonus de défense du mur | ✅ après correction |
| Huns | +20 % vitesse des armées | tout déplacement | ✅ |
| Huns | +10 % attaque en siège | attaques de ville | ✅ |
| Sultanat | +25 % dégâts des engins aux murs | points de mur abattus par les engins | ✅ |
| Sultanat | +15 % attaque en défendant sa ville | attaques de ville subies | ✅ |

Les cartes de l'inscription n'affichaient qu'un bonus sur deux par civilisation : elles montrent maintenant les deux, avec les
valeurs que le serveur applique (reçues avec `/api/world/info`). Valeurs relevées de 5 points en octobre 2026, voir § 7.

## 2. Unités : l'avantage de chaque civilisation est-il là où on l'a mis ?

Moyennes des 9 unités de combat (hors siège) :

| Civilisation | Attaque | Défense | Endurance | Vitesse | Transport | Identité lue dans les chiffres |
|---|---|---|---|---|---|---|
| Rome | 53,9 | **55,6** | 59,4 | 56,7 | 55,6 | la meilleure défense, la plus lente : infanterie de ligne ✅ |
| Gaule | 56,7 | 47,8 | 56,7 | 60,0 | 53,9 | attaque et vitesse, défense faible ✅ (Champion gaulois = meilleure attaque d'infanterie) |
| Grèce | 54,2 | 52,0 | 58,6 | 60,0 | 52,2 | équilibrée, infanterie défensive (Spartiate 90 d'endurance) ✅ |
| Égypte | 57,6 | 47,8 | **60,6** | 61,1 | 54,4 | endurance et attaque, cavalerie rapide ✅ |
| Huns | **59,4** | 40,6 | 55,0 | **66,7** | 56,1 | attaque et vitesse maximales, défense minimale ✅ (cavalerie à 90 de vitesse) |
| Sultanat | 57,2 | 45,6 | 56,7 | 65,0 | 56,1 | rapide, bon transport : pillards et marchands ✅ |

Coûts : les coûts des 60 unités dans les données sont exactement ceux que le serveur facture (base de classe × palier). ✅

**Appliqué (octobre 2026) : les unités d'élite valent désormais plus par unité d'entretien.**

Avant ce réglage, les coefficients de palier (×1,0 / ×1,1 / ×1,21) ne compensaient ni le coût (×1,8 / ×3,2) ni l'entretien
(5 / 10 / 15) : un joueur qui optimisait n'avait aucune raison de former de l'élite, sauf la limite de place dans la file. Dans
Travian et Rise of Kingdoms, le palier supérieur coûte plus par unité mais vaut plus par unité d'entretien. Les coefficients de
palier sont passés à **1,0 / 1,25 / 1,55** (`config.combat.tierCoefficients`, repris à l'identique dans le calcul de puissance du
client et dans les fiches d'unités) ; le siège reste à 0,75, les coûts, temps et entretiens ne changent pas.

| Palier (ex. infanterie romaine) | Coût | Puissance (atk + déf) × coef. | Puissance / 100 ressources | Puissance / céréale d'entretien | Temps |
|---|---|---|---|---|---|
| Base (Milicien) | 125 | 70 × 1,0 = 70 | 56 | 14,0 | 6 min |
| Intermédiaire (Triarii) | 225 | 115 × 1,25 = 144 (127 avant) | 64 (56 avant) | 14,4 (12,7 avant) | 10 min |
| Élite (Légionnaire) | 400 | 155 × 1,55 = 240 (188 avant) | 60 (47 avant) | 16,0 (12,5 avant) | 16 min |

Lecture : la base reste le choix du début de partie (unité la moins chère et la plus rapide à former, aucun niveau de caserne
exigé) ; l'intermédiaire est le meilleur rapport puissance / ressources ; l'élite est le meilleur rapport puissance / entretien,
donc le choix de qui a des ressources mais peu de champs. Le ciblage « l'élite est visée en premier » garde son sens. Sur les
18 lignes faction × classe, l'élite vaut au moins autant que la base par céréale dans 14 cas ; les 4 exceptions tiennent aux
statistiques des unités de base, voulues fortes pour l'identité de la faction (cavalerie hunnique, archers égyptiens, huns et
sultanaux), et restent à 0,1 à 0,5 point près.

Conséquences vérifiées : la puissance affichée des armées et des tribus (recalculée au démarrage du serveur) augmente pour les
paliers supérieurs ; les expéditions sont un peu plus faciles pour une armée d'élite (puissance / 7 : ≈ 10 par unité de base,
20 intermédiaire, 35 élite) ; rien d'autre ne dépend de ces coefficients. Variante non retenue : entretien de l'élite ramené de
15 à 12.

Cavalerie : moins de puissance par ressource (coût 160 contre 125) mais 1,5 à 1,8 × plus rapide et meilleur transport : rôle de
pillard cohérent ✅. Archers : coût égal à l'infanterie, un peu moins de puissance, mais +20 % contre l'infanterie ✅.
Engins de siège : 4 de puissance par 100 ressources, ils n'ont de valeur que contre les murs (40 PV par engin et par assaut) ✅.

## 3. Déplacements

- 1 case toutes les 30 s à vitesse 50 (≈ 120 cases/h) ; cavalerie hunnique à 90 ≈ 216 cases/h (+15 % de civilisation).
- Monde de 374 cases de côté : le traverser prend ≈ 3 h ; un voisin à 20 cases est à 10 min pour l'infanterie, 5 min pour la cavalerie.
- Le trajet suivi est le chemin réel (contournement des montagnes et de l'eau), l'armée va à la vitesse de son unité la plus lente, le héros ajoute jusqu'à +5 %. ✅
- C'est un rythme rapide (Travian : 1 à 7 min par case). Il convient à des sessions mobiles courtes ; le délai de 24 h entre deux
  pillages d'une même ville empêche le harcèlement. Si l'on veut un rythme plus posé : `config.army.baseSpeedTilesPerSec` à 1/60.

## 4. Bâtiments : courbes

- Coût × 1,28 par niveau, temps × 1,2 par niveau (serveur et client identiques) ; `costL20` / `timeL20Sec` des données sont ignorés (backlog).
- Champs : amortissement d'une amélioration entre 20 h et 64 h (niveau 2 : 64 h, niveau 10 : 20 h, niveau 20 : 27 h). Début de partie lent
  mais régulier ; production × 450 entre les niveaux 1 et 20 (10 → 4 500/h), comme Travian.
- Stockage : un entrepôt se remplit en ≈ 9 h avec quatre champs du même niveau, du niveau 5 au niveau 20 : une connexion toutes les 8 h suffit. ✅
- Temps cumulés : Bâtiment principal 1 → 30 en 59 h ; un champ 1 → 20 en 8 h ; tous les bâtiments au maximum ≈ 111 jours avec deux files
  et sans réduction, ≈ 45 à 60 jours avec le Bâtiment principal au maximum. Rythme d'une saison de quelques mois. ✅
- Nourriture : six fermes niveau 10 nourrissent ≈ 420 unités de base ; niveau 20, ≈ 5 400. Cohérent avec les files de recrutement.
- Mur : +1 % de défense par niveau (max +20 %) et 1 000 PV par niveau (1 250 pour l'Égypte) ; 25 catapultes abattent un niveau par assaut
  gagné. Le mur est volontairement modeste par rapport à Travian (+80 % au niveau 20) ; à relever si les défenseurs souffrent trop.

## 5. Combat

Triangle +20 % (infanterie > cavalerie > archers > infanterie), coefficients de palier, mur, douves (+0,5 %/niv.), bonus de ville
(Forge, Brasserie), héros plafonné à +5 %, pertes du perdant 30 %, butin ≤ 30 % du transport, cachette, stocks protégés : tous
vérifiés en place (`tests/unit/combat.test.js`, `tests/api-e2e.mjs`).

## 6. Commandes de contrôle

```
NODE_ENV=test JWT_SECRET=<32 car.> node -e "…"        # tableaux d'unités (voir l'historique de la vérification)
node tools/simulate-factions.cjs 5                      # matrices de combat avec les bonus de civilisation actuels et +5 points
npm run test:unit && npm run test:e2e                   # règles de combat, économie, routes
```

## 7. Bonus de civilisation : +5 points (octobre 2026)

Demande : relever tous les bonus de 5 points et vérifier que rien ne se dérègle. Simulation avec le moteur de combat réel
(`node tools/simulate-factions.cjs 5` : 200 unités de base par classe de chaque côté, mur niveau 10, sans héros).

Effet isolé (mêmes unités des deux côtés, seule la civilisation change). Indice de défense de ville = pertes de l'attaquant /
pertes du défenseur ; indice d'attaque de ville = pertes du défenseur / pertes de l'attaquant :

| Civilisation | Défense de ville (avant → après) | Attaque de ville (avant → après) |
|---|---|---|
| Rome | 1,61 → 1,91 | 1,07 → 1,27 |
| Gaule | 1,53 → 1,72 | 0,81 (inchangé) |
| Grèce | 1,24 (inchangé) | 0,81 (inchangé) |
| Égypte | 1,24 (inchangé) | 0,81 (inchangé) |
| Huns | 1,24 (inchangé) | 0,99 → 1,21 |
| Sultanat | 1,86 → 2,17 | 0,81 (inchangé) |

Matrice réelle (chaque civilisation avec ses propres unités, effectifs égaux) : 2 résultats sur 36 basculent. Rome prend
désormais une ville hunnique à effectifs égaux ; l'Égypte ne prend plus une ville gauloise. Le classement ne change pas : le
Sultanat reste le meilleur défenseur, les Huns le meilleur attaquant avec leurs propres unités, Rome la plus complète (attaque et
défense) ; Grèce et Égypte restent des civilisations économiques qui ne gagnent pas une bataille à effectifs égaux.

Économie et logistique : Grèce −15 % de temps de construction (79 h au lieu de 84 h pour vingt niveaux d'un bâtiment de 30 min)
et +15 points de blessés (le plafond de 70 % est atteint dès la tente niveau 9 au lieu de 10) ; Égypte transport ×1,15 et mur à
1 250 PV par niveau (32 catapultes par niveau au lieu de 30, 25 ailleurs) ; Huns 100 cases en 41,7 min au lieu de 43,5 (50 sans
bonus) ; Sultanat 50 PV de mur par engin (20 engins par niveau au lieu de 21, 25 ailleurs) ; Gaule cachette ×1,15 (plafond
20 % : +0,3 à +0,8 point de protection avant le plafond).

**Verdict : acceptable, appliqué** (`data/factions.json`, cartes d'inscription et textes du Mur et de la Tente de soins lus
depuis les données du serveur). Deux points à garder à l'œil :

- Rome : le +5 double son bonus de défense (5 → 10 %) et porte ses points de vie en siège de +10 à +15 %. Elle devient la
  meilleure attaquante à unités égales (1,27 contre 1,21 pour les Huns) et défend mieux chez elle que la Gaule (1,91 contre
  1,72) alors que la Gaule est la civilisation « défensive ». C'était déjà le cas avant (1,61 contre 1,53), l'écart s'est creusé.
  Pour rendre à la Gaule son identité : défense chez soi à 20 %, ou défense romaine ramenée à 8 %.
- Gaule (cachette) et Sultanat (engins) gagnent très peu en pratique, plafond et arrondis obligent : les bonus affichés sont
  exacts, leur effet est marginal.

**Suite (même jour, décision du jeu)** : défense gauloise chez soi portée à **20 %** et transport égyptien à **20 %** ; le reste
est inchangé. Re-simulation :

| Civilisation | Défense de ville | Attaque de ville | Changement |
|---|---|---|---|
| Rome | 1,91 | 1,27 | — |
| Gaule | 1,72 → **1,92** | 0,81 | redevient la meilleure défenseuse chez elle hors Sultanat (devant Rome 1,91) |
| Sultanat | 2,17 | 0,81 | — |
| Égypte | 1,24 | 0,81 | sans effet au combat ; transport ×1,20 sur le butin des pillages, les envois par armée et les convois |

Matrice réelle : aucun résultat ne bascule par rapport à l'étape précédente ; la Gaule attaquée par les Huns à effectifs égaux
perd toujours sa garnison mais leur coûte 61,7 % au lieu de 59,0 % ; Rome prend encore une ville gauloise (54,0 % de pertes au
lieu de 52,3 %).

## 8. Technologies : arbre de recherche à l'Académie (octobre 2026)

Système ajouté à la demande, façon Travian : de **petits bonus par niveau** qui récompensent l'investissement sans renverser une
bataille. Données dans `data/technologies.json`, formules dans `src/utils/techEffects.js` (reprises à l'identique par le client),
simulation possible avec `tests/unit/research.test.js`.

Règles : la recherche se fait à l'**Académie** et une technologie ne dépasse jamais le niveau de l'Académie ; **une recherche à la
fois** par joueur, une seconde peut attendre dans la file ; coût = coût du niveau 1 × 1,45^(niveau − 1), temps = temps du niveau 1 ×
1,5^(niveau − 1), réduit par l'Académie et le Temple grec (−1 % par niveau chacun, plafond 60 %) ; annulation remboursée
intégralement en attente, de moitié une fois lancée (même règle que les constructions). Les effets sont ceux du joueur : ils
s'appliquent à toutes ses villes et à toutes ses armées.

| Branche | Technologie | Niveau 1 | Niveau 10 | Coût bois / pierre / fer / céréales (niv. 1 → 10) | Temps (niv. 1 → 10) | Total niv. 1-10 | Prérequis |
|---|---|---|---|---|---|---|---|
| Économie | Agronomie | +1,0 % production des champs | +10,0 % production des champs | 150 / 100 / 80 / 200 → 4 250 / 2 833 / 2 266 / 5 666 | 0,3 h → 12,8 h | 37,8 h | — |
| Économie | Ingénierie | −1,0 % coût de construction | −10,0 % coût de construction | 200 / 200 / 120 / 80 → 5 666 / 5 666 / 3 400 / 2 266 | 0,5 h → 19,2 h | 2,4 j | Agronomie 3 |
| Militaire | Entraînement | −1,0 % temps de recrutement | −10,0 % temps de recrutement | 120 / 80 / 160 / 160 → 3 400 / 2 266 / 4 533 / 4 533 | 0,3 h → 12,8 h | 37,8 h | — |
| Militaire | Art de la guerre | +0,5 % attaque | +5,0 % attaque | 150 / 100 / 260 / 120 → 4 250 / 2 833 / 7 366 / 3 400 | 0,5 h → 19,2 h | 2,4 j | Entraînement 3 |
| Défense | Discipline | +0,5 % défense | +5,0 % défense | 120 / 200 / 180 / 100 → 3 400 / 5 666 / 5 100 / 2 833 | 0,3 h → 12,8 h | 37,8 h | — |
| Défense | Médecine | +1,0 pt de blessés sauvés | +10,0 pt de blessés sauvés | 160 / 120 / 80 / 220 → 4 533 / 3 400 / 2 266 / 6 233 | 0,5 h → 19,2 h | 2,4 j | Discipline 3 |
| Logistique | Cartographie | +1,0 % vitesse des armées | +10,0 % vitesse des armées | 200 / 80 / 100 / 150 → 5 666 / 2 266 / 2 833 / 4 250 | 0,3 h → 12,8 h | 37,8 h | — |
| Logistique | Intendance | −1,0 % entretien | −10,0 % entretien | 150 / 120 / 100 / 250 → 4 250 / 3 400 / 2 833 / 7 083 | 0,5 h → 19,2 h | 2,4 j | Cartographie 3 |

Pourquoi cela ne déséquilibre pas : les bonus de combat plafonnent à **+5 %**, soit le plafond du héros, et à peu près la moitié
d'un bonus de civilisation ; les bonus économiques à **+10 %**, soit la moitié de l'Irrigation égyptienne au niveau 20 ; attaque
et défense sont symétriques (Art de la guerre contre Discipline). Tout rechercher demande environ **15,7 j** de recherche
cumulée sans réduction (≈ 12,6 j avec une Académie niveau 20) et 410 526 ressources : c'est un
objectif de long terme, pas une bascule. Où chaque effet est appliqué : production et entretien dans les requêtes du tick
(`resourceProcessor.js`), coût de construction et temps de recrutement dans `routes/cities.js`, attaque et défense dans
`combatService.js` (attaque de ville ligne par ligne, pillage et tribus par la puissance), blessés dans `woundedService.js`,
vitesse dans `calculations.js` (armées, espions, convois, retours).
