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
Engins de siège : 4 de puissance par 100 ressources, ils n'ont de valeur que contre les murs : depuis le siège qui dure (octobre 2026), 400 PV de mur par engin et par heure de siège (100 engins percent un mur niveau 20 en 30 min), 5 engins par niveau d'Atelier dans une armée ✅.

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

**En adéquation avec les constructions** (simulation `tools/simulate-research.cjs`, données du jeu) : un niveau de technologie
coûte 0,76 à 0,86 fois le niveau d'Académie qui le débloque et dure de 0,7 fois (niveau 1) à 1,1 fois (niveau 20) son chantier,
1,0 à 1,3 fois pour les technologies de second rang ; l'Académie 345 942 ressources, 2,4 j de chantier, Les 8 technologies au maximum : 2 278 246 ressources (×6,6), 19,7 j de recherche en une seule file,
La ville entière : (30 bâtiments et 18 champs au niveau 20) : 23 759 337 ressources, 53,4 j de chantier avec 2 files, La recherche complète en représente 10 % des ressources et 37 % du temps, Dans une partie simulée où le joueur monte l'Académie dès qu'il le peut et recherche en
parallèle, l'Académie atteint le niveau 20 au jour 3,7 avec des technologies autour du niveau 7, la recherche prend
environ 20 % de ses dépenses pendant la montée, et tout est au maximum vers le jour 23,0 : un objectif de long terme qui
accompagne la ville sans la concurrencer. Avant ce réglage (coût × 1,45 et temps × 1,5 par niveau sur dix niveaux), le niveau 10
d'une technologie coûtait 2,3 fois l'Académie 10 et durait 6 fois plus : trop raide, corrigé.

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

Simulation (`node tools/simulate-tribes.cjs`, 200 tribus tirées par niveau, armée de base romaine) : avant ce réglage les
pertes du vainqueur suivaient la règle des pillages (0,3 × puissance de la tribu / puissance de l'armée) et ne dépendaient pas
de la taille de l'armée : un camp coûtait toujours le même nombre d'unités, deux à trois fois la valeur du point.

| Niveau | Soldats | Puissance | Armée de base pour gagner | Pertes avant (0,3) | Pertes après (0,15) | Butin immédiat puis stock du point | Pertes remboursées en tenant le point | XP héros | Réapparition |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 98 | 6 398 | 110 (15 033 res.) | 27 (3 747 res.) | 15 (1 990 res.), dont 6 à 10 morts avec une Tente de soins | 1 500 res. puis 2 250 max (563/h) | 0,9 h | 30 | 60 min |
| 2 | 597 | 55 276 | 948 (129 560 res.) | 235 (32 078 res.) | 116 (15 841 res.), dont 46 à 78 morts avec une Tente de soins | 4 000 res. puis 6 000 max (1 500/h) | 7,9 h | 179 | 90 min |
| 3 | 1 495 | 190 796 | 3 271 (447 037 res.) | 830 (113 425 res.) | 384 (52 519 res.), dont 154 à 257 morts avec une Tente de soins | 8 000 res. puis 12 000 max (3 000/h) | 14,8 h | 449 | 120 min |
| Or 1 | 99 | 8 996 | 155 (21 183 res.) | 26 (3 530 res.) | 15 (2 058 res.), dont 6 à 10 morts avec une Tente de soins | 10 or puis 10 max (1/h) | — | 30 | 120 min |
| Or 2 | 597 | 77 474 | 1 329 (181 630 res.) | 239 (32 714 res.) | 119 (16 327 res.), dont 48 à 80 morts avec une Tente de soins | 20 or puis 20 max (2/h) | — | 179 | 180 min |
| Or 3 | 1 495 | 266 998 | 4 578 (625 660 res.) | 822 (112 406 res.) | 402 (55 008 res.), dont 161 à 270 morts avec une Tente de soins | 30 or puis 30 max (3/h) | — | 449 | 240 min |

Réglages appliqués :
- **Pertes contre un camp divisées par deux** (`config.combat.tribeLossMultiplier` 0,15) : la cible est fixe, et l'on garde
  les morts du perdant à 30 %. Un camp de niveau 1 coûte 14 unités de base (1 900 ressources) pour 1 500 ressources de butin
  immédiat, 2 250 avec le stock, puis 560 par heure tant qu'une armée tient le point : rentable sans être gratuit ; le
  niveau 3 reste une opération de fin de partie (3 300 unités pour y aller).
- **Stock des points relevé aux niveaux 2 et 3** (`config.map.resourceNode` : 1 500 / 4 000 / 8 000 au lieu de 1 500 / 3 500 /
  6 000, maximum × 1,5, plein en 4 h) : un camp trente fois plus fort qu'un camp de niveau 1 ne gardait que quatre fois plus ;
  les pertes d'un camp de niveau 2 sont remboursées en 8 h de récolte, celles d'un niveau 3 en 16 h, contre 0,7 h au niveau 1.
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

Le cadre reste celui du GDD et de Travian (tribus fixes sur les points, décision confirmée). Les écarts relevés avec le GDD
ont été tranchés depuis : alliés sur un même point, stock approximatif et armée tenant un point attaquable (§ 9 bis), ville
secondaire fondée sur un point (§ 10) ; seul l'espionnage d'un point pour en connaître le stock exact reste au
`docs/BACKLOG.md`. Graphismes : les camps n'avaient aucun visuel prévu ; 18 sprites sont ajoutés aux listes
(`map/camps/`, niveaux 1 à 3 par biome, ruines, bannières de tribu) et la carte les affiche dès qu'ils sont livrés.

### 9 bis. Points de ressource : décisions appliquées (octobre 2026)

- **Une armée qui tient un point peut être attaquée** (`POST /api/army/:id/raid-resource` sur un point tenu) : combat en rase
  campagne résolu par la puissance, sans mur ni « défense chez soi », pertes selon la règle des pillages (perdant 30 %,
  vainqueur 0,3 × rapport des puissances), blessés et XP de héros des deux côtés, un rapport pour chacun ; les tenants
  battus rentrent chez eux et le point passe au vainqueur. Une armée alliée ou la sienne n'est jamais attaquée.
- **Alliés sur un même point** : les armées d'un même joueur ou d'une même alliance récoltent ensemble, à parts égales à
  chaque tick ; le point n'est libéré qu'au départ de la dernière.
- **Stock approximatif** : le serveur arrondit le stock au quart dans la carte, le client affiche plein / bien garni / à
  moitié / entamé / presque vide et une jauge ; les chiffres exacts n'apparaissent plus (GDD : « requires a spy »).
- **Camps variables et difficulté de position** (`config.map.camps`) : chaque camp varie de ± 20 % ; la taille est
  multipliée par 0,5 au bord de la carte et 1,3 au centre, linéairement avec la distance. Un premier camp de niveau 1 au
  bord demande ≈ 57 unités de base, un camp de niveau 3 au centre ≈ 3 900. Le renfort horaire des tribus et la
  réapparition suivent la même règle.

## 10. Villes secondaires : colons, fondation, bonus (octobre 2026)

Valeurs du GDD, appliquées sans changement (`data/buildings.json` RESIDENCE, `config.city.foundationTransport`).

| Élément | Valeur | Ce que ça coûte au joueur |
|---|---|---|
| Résidence (capitale, Hôtel de ville 5) | niveau 1 : 700 bois, 500 pierre, 300 fer, 1 200 nourriture, 33 min ; courbes ×1,28 / ×1,2 | niveau 10 cumulé ≈ 104 000 ressources et 14 h de chantier ; niveau 15 ≈ 382 000 et 40 h ; niveau 20 ≈ 1 334 000 et 103 h |
| Colons | 1 au niveau 10, 2 au 15, 3 au 20 (3 colonies au plus) ; formation 3 h, gratuite, un à la fois | la Résidence est le vrai prix de la colonie |
| Fondation | 3 000 de chaque ressource transportées + 24 h sur place, l'armée immobilisée | 12 000 ressources, ≈ 2 jours de production des champs de départ |
| Colonie | Hôtel de ville 1, garnison, 3 000 de chaque, +20 % de production | base 6 / 6 / 6 / 12 par heure avant les champs |

Lecture : la première colonie arrive quand la capitale a déjà une Résidence 10, soit environ au moment où ses champs de
niveau 8 à 10 produisent 1 000 à 1 500 de chaque ressource par heure ; les 12 000 de la fondation représentent alors moins
d'une journée. Le +20 % d'une colonie développée comme la capitale (4 champs de niveau 10 par ressource ≈ 1 400/h) vaut
≈ 280/h par ressource, soit le prix de la fondation en ≈ 11 h de production de la colonie elle-même ; la Résidence 10
(104 000) est amortie en ≈ 4 jours par ce seul bonus, sans compter les champs supplémentaires. Le rythme reste celui de
Travian : première colonie après plusieurs jours, troisième après plusieurs semaines (Résidence 20 ≈ 1,3 M).

Risques : le colon est perdu si l'armée fondatrice est battue sur le point pendant les 24 h ; les 12 000 ressources
rentrent avec l'armée si elle n'est pas battue. Rien n'est changé aux autres systèmes : les restrictions de bâtiments
(capitale / colonie) suivent les données, le point occupé par une ville sort des tirages de tribus et de récolte.

## 11. Villes secondaires : règles complètes du GDD, paliers de ville par Bâtiment principal (octobre 2026)

Relecture complète du GDD (`GDD_MASTER`, `GDD_Tech_Dev_v2`, `GDD_COMPLET.md`, données des bâtiments) : le GDD ne
plafonne pas explicitement les niveaux des villes secondaires, mais il réserve à la capitale la Forge, la Chambre au trésor,
l'Ambassade et la Résidence, et décrit les Grandes caserne et écurie comme ce qui « permet de recruter hors capitale ».
Règles appliquées, chiffrées par `node tools/simulate-colonies.cjs` :

| Règle | Source | Effet |
|---|---|---|
| Caserne, Écurie, Atelier réservés à la capitale ; Grandes caserne / écurie seulement en colonie, prérequis (Caserne 20, Écurie 20) lus dans la capitale | GDD (descriptions « hors capitale ») | une colonie ne forme des troupes qu'après Caserne 20 dans la capitale : 360 777 ressources et 4,3 j de chantier cumulés ; jamais d'engins de siège hors capitale |
| Bâtiment principal 20 au plus en colonie (30 dans la capitale) | décision (le GDD ne chiffre pas) | aucun effet sur la production (les autres bâtiments s'arrêtent à 20) ; les niveaux 21-30 restent le privilège de la capitale (population, réduction de temps déjà plafonnée) |
| Palier de ville, enceinte et minimum d'engins de siège fixés par le Bâtiment principal (1-9 Village, 10-19 Ville, 20+ Ville Fortifiée) | décision (« le Bâtiment principal fait évoluer les murailles ») | voir ci-dessous |

**Paliers de ville.** Ancienne règle : Ville = Mur 10 (15 442 ressources, 13 h), Ville Fortifiée = Mur 15 (56 525, 36 h).
Nouvelle règle : Ville = Bâtiment principal 10 (23 157 ressources, 1,3 h de chantier brut), Ville Fortifiée = Bâtiment
principal 20 (296 531, 9,3 h). Comme tout le monde monte le Bâtiment principal (il plafonne les autres bâtiments), le palier
arrive dans le cours normal du développement, sans détour par un Mur que l'on ne voulait pas ; un joueur qui veut rester
« Village » (1 engin suffit pour l'attaquer) se prive de tous les niveaux au-dessus de 9. L'attaquant d'une Ville doit
aligner 10 engins (21 600 ressources, 10 h de fabrication sur une file, soit 93 % de ce que la cible a mis dans son
Bâtiment principal), celui d'une Ville Fortifiée 20 engins (43 200, 15 % du Bâtiment principal 20) : l'exigence reste un
ticket d'entrée, pas un mur de coût, et le Mur de la cible garde toute sa valeur (bonus de défense, points de vie à
abattre, réparation). Une colonie au Bâtiment principal 20 est aussi une Ville Fortifiée.

**Économie d'une colonie** (4 champs par ressource, bonus +20 %) :

| Champs | Capitale, par ressource et par heure | Colonie | Gain du bonus | Coût cumulé des 16 champs |
|---|---|---|---|---|
| niveau 5 | 201 | 241 | +40/h | 35 144 |
| niveau 10 | 1 405 | 1 686 | +281/h | 155 900 |
| niveau 15 | 5 025 | 6 030 | +1 005/h | 570 840 |
| niveau 20 | 18 005 | 21 606 | +3 601/h | 1 996 600 |

Aux champs de niveau 10, le bonus seul rapporte 1 124 ressources de plus par heure : la fondation (12 000) est amortie en
11 h, la Résidence 10 (104 201) en 3,9 j ; sans le bonus, une colonie reste une seconde ville complète. Trois colonies
plafonnées à 20 valent donc 3 × 1,2 = 3,6 capitales en production, pour quatre fois les champs à payer : le jeu récompense
l'expansion comme Travian, sans effet multiplicateur caché. La colonie est une ville économique ; le cœur militaire reste la
capitale (Caserne, Écurie, Atelier, Forge, Résidence, Ambassade, Chambre au trésor, Domus), et les Grandes caserne et
écurie n'ouvrent le recrutement en colonie qu'après plusieurs semaines. Les simulations précédentes (civilisations,
recherche, camps) ne dépendent pas de ces règles et restent valables.

## 12. Coût d'un siège pour l'attaquant (octobre 2026)

Entretien par heure : 5 (base), 10 (intermédiaire), 15 (élite et engins). Un siège dure au plus 3 h (30 min avec 100 engins
contre un mur 20) ; chaque assaut gagné pille 25 % du stock non protégé.

| Armée de siège | Entretien/h normal | Siège de 3 h à +10 % (GDD) | Siège de 3 h à +100 % (retenu) | Butin d'un assaut gagné |
|---|---|---|---|---|
| 100 soldats + 5 engins (village) | 575 | 1 900 | 3 450 | ~5 000 |
| 300 soldats + 20 engins (ville) | 2 300 | 7 600 | 13 800 | ~20 000 |
| 1 000 soldats + 100 engins (ville fortifiée, 30 min) | 10 500 | 5 800 | 10 500 | 50 000 et plus |

À +10 %, le surcoût est négligeable et un siège rapporte dès le premier assaut. À +100 %, un siège moyen reste à peine
rentable sur un seul assaut (le gain vient de la chute de la ville), le spam de petits sièges coûte plus qu'il ne rapporte,
et une grosse armée d'engins garde un siège court et donc abordable. La ville assiégée ne paie rien de plus.

