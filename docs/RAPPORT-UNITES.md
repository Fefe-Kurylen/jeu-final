# Rétablir l'équilibre des unités

*Imperium Antiquitas — rapport de décision — 30 octobre 2026*

## En bref

- **Les fiches des unités n'ont jamais changé.** Les 60 unités du jeu ont exactement les valeurs du GDD : attaque, défense, endurance, vitesse, transport, coût, temps de formation et entretien. Nous avons trouvé 0 différence.
- **Ce qui a cassé l'équilibre, c'est le moteur de bataille.** Deux changements récents en sont la cause : une nouvelle formule de dégâts le 13 octobre 2026, puis des coefficients de palier plus forts le 17 octobre 2026.
- **Aujourd'hui, 1 intermédiaire vaut environ 3 unités de base, et 1 élite vaut 2,3 intermédiaires.** Le GDD voulait 1,8 dans les deux cas, c'est-à-dire exactement leur prix.
- **Vous avez raison pour la cavalerie.** Dans le GDD, elle porte autant que l'infanterie. Elle paie sa vitesse, pas un meilleur transport. Les textes du jeu qui en font « le meilleur pillard » ne viennent pas du GDD.
- **Notre recommandation est l'option B.** On remet la formule de dégâts du GDD et ses coefficients d'origine (1 / 1,35 / 1,9), et on renforce le triangle de +20 % à +50 %. Mesuré : chaque palier redevient proportionnel à son prix, et le triangle fonctionne dans 78 à 100 % des combats.
- **Certaines unités restent trop fortes ou trop faibles, quelle que soit l'option.** Cela vient de petits écarts dans les fiches elles-mêmes. On pourra les corriger ensuite, fiche par fiche, si vous le souhaitez (liste au point 6).
- **Mise à jour du 30 octobre 2026 : c'est fait.** L'option B est en place, les textes de la cavalerie sont corrigés et les 20 fiches du point 6 sont retouchées (±3 à 10 %). Elles sont toutes revenues entre 0,80 et 1,25, et le triangle marche partout. Quatre fiches non retouchées passent juste au-dessus (1,26 à 1,29) : voir le point 7 « Retouches appliquées ».

---

## 1. Ce que voulait le GDD

### 1.1 Le coût de chaque palier

Le coût dépend seulement de la classe et du palier. Toutes les unités d'une même classe et d'un même palier coûtent le même prix.

| Classe | Base | Intermédiaire (×1,8) | Élite (×3,2) |
|---|---|---|---|
| Infanterie | 125 | 225 | 400 |
| Archers | 125 | 225 | 400 |
| Cavalerie | 160 | 288 | 512 |
| Engins de siège | — | — | 2 160 |

*Total bois + pierre + fer + céréales. À la base : infanterie 30/20/55/20, archers 60/20/25/20, cavalerie 45/35/50/30.*

| | Base | Intermédiaire | Élite |
|---|---|---|---|
| Temps, infanterie et archers | 6 min | 9,6 min | 16,2 min |
| Temps, cavalerie (+20 %) | 7,2 min | 11,5 min | 19,4 min |
| Entretien (céréales/heure) | 5 | 10 | 15 |

Engins de siège : 60 minutes, 15 céréales/heure.

**Le jeu utilise déjà exactement ces valeurs.**

### 1.2 La force pour le prix : la même à chaque palier

- Le GDD fixe une règle : **« 1 élite ≈ 1,8 intermédiaire »** (le texte dit aussi « ≈ 1,9 »).
- C'est exactement le rapport des prix : une élite coûte 400, un intermédiaire 225, soit 1,78 fois plus.
- C'est pareil entre l'intermédiaire et la base : un intermédiaire coûte 1,8 fois plus cher et doit valoir 1,8 unité de base.
- **Donc, pour la même dépense, une armée de base, une armée intermédiaire et une armée d'élite doivent se valoir.**
- Un palier plus haut n'est pas « plus rentable ». Il donne la même force avec moins d'unités.
- Les coefficients d'origine du prototype étaient **1 / 1,35 / 1,9**. Nous les avons re-testés dans le moteur du GDD : il faut 1,80 Triarii pour battre 1 Légionnaire, et 1,91 Milicien pour battre 1 Triarii. C'est exactement la règle.

### 1.3 Les fiches, une par une

- Chaque unité a 5 valeurs : attaque, défense, endurance, vitesse et transport.
- Elles donnent une petite couleur à chaque faction. Avec la formule du GDD, chaque unité reste **à ±10 % de la moyenne** de sa classe et de son palier (de 0,88 à 1,11).
- Les fiches sont donc bien équilibrées entre elles, pour un prix commun.
- À noter : dans les fichiers du GDD, nous n'avons trouvé ni coût par unité, ni bonus de rôle par unité, ni test avec le triangle. Les seuls tests trouvés comparent des nombres égaux d'unités (par exemple 100 Miliciens contre 100 Triarii). Les étoiles servent seulement à l'affichage.

### 1.4 Le rôle de chaque classe et le triangle

| Classe | Rôle dans le GDD |
|---|---|
| Infanterie | Solide (défense, endurance). La plus forte pour son prix. Bat la cavalerie. |
| Archers | Même prix que l'infanterie. Plus d'attaque, moins de défense. Battent l'infanterie. |
| Cavalerie | Rapide (84 contre 55 pour l'infanterie de base). Coûte 28 % de plus et se forme 20 % plus lentement. Bat les archers. |
| Siège | Grosse attaque, très lent. Sert à abattre les murs. |

**Triangle :** infanterie > cavalerie > archers > infanterie. Le gagnant reçoit **+20 %** d'attaque.

### 1.5 Cavalerie et transport : vous avez raison

| Palier | Transport infanterie | Transport cavalerie | Vitesse infanterie | Vitesse cavalerie |
|---|---|---|---|---|
| Base | 65,8 | 66,7 | 55 | 84 |
| Intermédiaire | 55,0 | 56,7 | 50 | 78 |
| Élite | 46,7 | 46,7 | 45 | 74 |

*Moyennes des 6 factions.*

- La cavalerie porte autant que l'infanterie. Elle va seulement beaucoup plus vite.
- **Pour 100 ressources dépensées, l'infanterie porte plus** : 52,7 contre 41,7 à la base.
- Chez Rome et l'Égypte, l'infanterie de base porte même plus que la cavalerie (70 contre 65).
- Le transport baisse avec le palier pour toutes les classes. Les meilleurs porteurs sont donc les troupes de base.
- **Ce qui est faux, ce sont des textes, pas des chiffres :**
  - le document d'équilibrage dit « meilleur transport : rôle de pillard » ;
  - 6 descriptions de cavaliers les présentent comme des pillards (« idéal pour piller », « fait pour piller »…). Celle du Bédouin dit « capacité de pillage maximales », alors qu'il porte 70, comme l'infanterie du Sultanat.
  - Ces textes ont été écrits le 17 octobre 2026. Ils ne viennent pas du GDD.

---

## 2. Ce qui a changé, et pourquoi l'équilibre a cassé

### 2.1 Les dates

| Date | Changement | Effet |
|---|---|---|
| Janvier 2026 (prototype) | Moteur du GDD : la défense rend l'unité plus solide. Coefficients 1 / 1,35 / 1,9. | Paliers proportionnels au prix. |
| 31 janvier 2026 | Une session d'IA passe les coefficients à 1 / 1,10 / 1,21 et annonce « 1,82 intermédiaire par élite ». | C'est faux : re-mesuré, on obtient 1,50. Les élites deviennent un peu faibles. |
| 4 février 2026 | Première version du jeu actuel. Le combat détaillé n'utilise plus la défense. | — |
| 27 février 2026 | Coûts, temps et entretien du GDD v4 appliqués. Triangle +20 % ajouté. Coefficients laissés à 1,10 / 1,21. | Encore à peu près juste (élites un peu faibles). |
| 13 octobre 2026, matin | Dégâts amortis à 18 % par manche. | Combats plus longs. |
| **13 octobre 2026, soir** | **Nouvelle formule : dégâts = attaque − 0,55 × défense, avec un minimum de 20 %.** Le coefficient de palier multiplie l'attaque **et** la défense. | **Cassure principale** : l'intermédiaire devient 3,1 fois plus rentable que la base. |
| **17 octobre 2026** | **Coefficients montés à 1 / 1,25 / 1,55.** Ils ont été choisis avec un calcul simple (attaque + défense), sans essai en bataille. | **Amplificateur** : on arrive aux 4,4 et 2,45 de votre audit. |
| 17 octobre 2026 | Descriptions des unités et document d'équilibrage : « cavalerie = meilleur transport ». | Texte faux. Aucun chiffre changé. |

### 2.2 Pourquoi la formule du 13 octobre casse tout

- **Dans le GDD**, la défense s'ajoute à la solidité de l'unité. Une petite unité fait toujours des dégâts, en proportion de son attaque.
- **Aujourd'hui**, la défense de la cible est soustraite de l'attaque. Contre une cible solide, une petite unité ne fait plus que le minimum (20 %).
- **Exemple : Milicien romain (attaque 30) contre Légionnaire (défense 90, endurance 85).**
  - Moteur du GDD : il faut **6 coups** de Milicien pour abattre un Légionnaire.
  - Aujourd'hui : il en faut **14**.
  - Dans les deux cas, le Légionnaire abat environ 2 Miliciens par coup.
  - Résultat : en moyenne, une élite vaut aujourd'hui **4,95 unités de base, pour un prix de 3,2**.
- Le 0,55 vient bien du GDD, mais il y avait un autre sens : c'était le poids de la défense dans la solidité, pas une soustraction. Le minimum de 20 % n'existe pas dans le GDD.
- **Le 17 octobre**, les coefficients ont été choisis avec le calcul « puissance = (attaque + défense) × coefficient ». Ce calcul est juste pour les pillages. Mais en bataille, le coefficient compte deux fois : sur l'attaque et sur la défense. Le document dit « rien d'autre ne dépend de ces coefficients » : c'est faux.
- **La même formule grossit aussi les petits écarts entre les fiches.** Une différence de 10 % dans les stats devient un écart de 3 à 5 fois. Aujourd'hui, à prix égal, les unités d'une même classe et d'un même palier vont de 0,35 à 2,20.

### 2.3 Ce que le texte du GDD dit, et ce que le moteur du GDD faisait

- Le texte PDF du GDD écrit : « Dégâts = ATK × modificateurs − DEF ». C'est une soustraction.
- Mais le seul moteur du GDD qui a été programmé et testé utilisait la défense comme solidité. C'est lui qui donne la règle « 1 élite ≈ 1,8 intermédiaire ».
- **Le 13 octobre, on a suivi la phrase du texte et non le moteur testé.** C'est ce qui a cassé l'équilibre.

---

## 3. Trois options pour rétablir l'équilibre

### 3.1 Comment nous avons mesuré

- Nous avons utilisé le vrai moteur de bataille du jeu, lancé hors ligne. Nous n'avons touché ni à la base de données, ni au serveur, ni aux fichiers du jeu. Les changements ont été faits en mémoire seulement.
- Chaque camp dépense **240 000 ressources**.
- Chaque armée est composée pour ⅓ d'infanterie, ⅓ d'archers et ⅓ de cavalerie, de la même faction et du même palier.
- Nous testons les 6 factions. Chaque camp attaque une fois et défend une fois.
- Nous testons les fiches seules : sans héros, sans bonus de faction, sans technologies.
- **Nos chiffres retrouvent ceux de votre audit :** 4,35 (audit : 4,4) et 2,43 (audit : 2,45).

### 3.2 Ce que change chaque option

| | Option A — Le GDD à l'identique | Option B — GDD + triangle renforcé | Option C — Réglage rapide |
|---|---|---|---|
| Formule de dégâts | Celle du GDD : la défense redevient de la solidité | Celle du GDD | Inchangée (soustraction) |
| Poids de la défense | 0,55 (GDD) | 0,55 (GDD) | 0,55 → **0,30** |
| Minimum de dégâts 20 % | Supprimé | Supprimé | 20 % → **30 %** |
| Coefficients de palier (bataille) | 1 / 1,25 / 1,55 → **1 / 1,35 / 1,9** | → **1 / 1,35 / 1,9** | Inchangés |
| Triangle | +20 % (inchangé) | +20 % → **+50 %** | +20 % → **+50 %** |
| Travail de programmation | Oui, une petite fonction | Oui, une petite fonction | Non, seulement des réglages |

**Ne changent dans aucune option :** les fiches, les coûts, les temps, l'entretien, les engins de siège (coefficient 0,75), les 15 manches maximum et l'amortissement de 18 % par manche.

### 3.3 Résultat 1 : les paliers

*Combien d'unités du palier inférieur vaut une unité ?*

| | Prix (but du GDD) | Aujourd'hui | A | B | C |
|---|---|---|---|---|---|
| 1 intermédiaire vaut … unités de base | 1,8 | 2,95 | **1,84** | **1,84** | 2,07 |
| 1 élite vaut … intermédiaires | 1,78 | 2,32 | **1,69** | **1,69** | 1,72 |
| 1 élite vaut … unités de base | 3,2 | 4,95 | **3,11** | **3,11** | 3,78 |

*À dépense égale, combien de ressources le palier supérieur détruit-il pour 1 ressource perdue ? (but : 1,00)*

| | Aujourd'hui | A | B | C |
|---|---|---|---|---|
| Intermédiaire contre base | 4,35 | 1,15 | 1,16 | 1,78 |
| Élite contre intermédiaire | 2,43 | 0,75 | 0,75 | 0,91 |
| Élite contre base | 3,78 | 0,88 | 0,88 | 1,81 |

- Avec A et B, chaque palier vaut à peu près son prix. L'élite est même un peu en dessous (5 % par unité).
- Avec C, l'intermédiaire reste trop fort (2,07 au lieu de 1,8), et l'élite contre la base aussi.
- Avec A et B, pour la même force, l'élite consomme un peu moins de céréales que la base (−4 %), et l'intermédiaire un peu plus (+9 %).

### 3.4 Résultat 2 : le triangle

*Part des combats gagnés par la bonne classe, à prix égal (36 combats entre factions, base / intermédiaire / élite).*

| Lien | Aujourd'hui | A | B | C |
|---|---|---|---|---|
| Infanterie bat cavalerie | 94 / 100 / 100 % | 100 / 100 / 100 % | 100 / 100 / 100 % | 100 / 100 / 100 % |
| Cavalerie bat archers | 72 / 89 / 100 % | **36 / 6 / 3 %** | 78 / 94 / 100 % | 94 / 100 / 100 % |
| Archers battent infanterie | 92 / 89 / **39 %** | 97 / 94 / **36 %** | 100 / 100 / 100 % | 100 / 100 / 100 % |

- **Avec A, la cavalerie ne bat plus les archers.** Elle paie 28 % de plus pour des stats proches de l'infanterie. Un bonus de +20 % ne compense pas ce surcoût.
- **Archers d'élite contre infanterie d'élite** : le lien ne marche ni aujourd'hui, ni avec A. Les fantassins d'élite, sauf ceux des Huns, ont une défense et une endurance de 70 à 90. Ils sont trop solides.
- **Avec +50 % (B et C), les 3 liens fonctionnent à tous les paliers.**

### 3.5 Résultat 3 : les factions

*Faction la plus forte et la plus faible à chaque palier. Indice à prix égal contre les 5 autres factions (1,00 = moyenne), avec le nombre de victoires sur 5. Fiches seules, sans bonus de faction.*

| Palier | Aujourd'hui | A | B | C |
|---|---|---|---|---|
| Base | Huns 1,35 / Gaule 0,71 (0 sur 5) | Huns 1,31 / Gaule 0,81 (0 sur 5) | Huns 1,32 / Gaule 0,80 (0 sur 5) | Huns 1,42 / Grèce 0,75 (0 sur 5) |
| Intermédiaire | Égypte 1,42 / Gaule 0,75 (0 sur 5) | Égypte 1,31 / Gaule 0,81 (0 sur 5) | Égypte 1,30 / Gaule 0,81 (0 sur 5) | Égypte 1,38 / Gaule 0,76 (0 sur 5) |
| Élite | Rome 1,42 / Huns 0,58 (0 sur 5) | Rome 1,25 / Huns 0,67 (0 sur 5) | Rome 1,25 / Huns 0,68 (0 sur 5) | Égypte 1,26 / Huns 0,70 (0 sur 5) |
| Écart fort ÷ faible | 1,9 / 1,9 / 2,4 | 1,6 / 1,6 / 1,9 | 1,7 / 1,6 / 1,8 | 1,9 / 1,8 / 1,8 |

- Les écarts entre factions se réduisent avec A et B, mais ne disparaissent pas.
- **La Gaule de base et les Huns d'élite restent derniers dans toutes les options.** Cela vient de leurs fiches. La Gaule de base a peu de défense (25), et les Huns d'élite ont la défense la plus basse de leur palier (55 et 45).
- Les bonus de faction (non comptés ici) peuvent changer un peu ce classement.

### 3.6 Autres effets

| | Aujourd'hui | A | B | C |
|---|---|---|---|---|
| Écart entre la meilleure et la moins bonne unité d'un palier | 4,6 | 3,6 | 3,5 | 3,5 |
| Durée d'un combat (4 combats types) | 9 à 15 manches | 9 à 15 | 9 à 15 | 7 à 15 |

- Les combats restent aussi longs. Avec A et B, le vainqueur perd un peu plus de troupes qu'aujourd'hui.
- Le mur garde un petit effet, comme aujourd'hui.
- **Pillages, camps barbares et hordes** utilisent un autre calcul, plus simple (« puissance »). Avec les coefficients actuels, ce calcul respecte déjà les prix (1,14 / 0,92 / 1,05). Avec 1 / 1,35 / 1,9, les élites y deviendraient 29 % trop rentables. **Nous conseillons donc de ne pas y toucher** : 1 / 1,35 / 1,9 en bataille, et on garde 1 / 1,25 / 1,55 pour la puissance.

---

## 4. Notre recommandation : l'option B

**Pourquoi B :**
- C'est la formule de dégâts du GDD avec les coefficients du GDD, c'est-à-dire ceux qui donnent sa règle « 1 élite ≈ 1,8 intermédiaire ».
- Les paliers redeviennent proportionnels à leur prix : 1,84 / 1,69 / 3,11 pour un prix de 1,8 / 1,78 / 3,2.
- Le triangle fonctionne partout (78 à 100 %).
- Il n'y a qu'un seul écart par rapport au GDD : le triangle passe de +20 % à +50 %. Sans cela, la cavalerie, qui coûte plus cher, ne bat plus les archers.

**Pourquoi pas A :** c'est le plus fidèle au GDD, mais la cavalerie ne bat presque jamais les archers (3 à 36 %), et les archers d'élite ne battent pas l'infanterie d'élite.

**Pourquoi pas C :** il n'y a rien à programmer, mais on garde la soustraction, qui est la cause du problème. L'intermédiaire reste trop fort (2,07 unités de base au lieu de 1,8). L'élite reste 1,8 fois trop rentable face à la base.

**À faire avec l'option B :**
1. Remettre la formule de dégâts du GDD dans le moteur de bataille et supprimer le minimum de 20 %.
2. Coefficients de bataille : 1 / 1,35 / 1,9 (siège 0,75). Garder 1 / 1,25 / 1,55 pour la puissance (pillages, camps, hordes, affichage de la puissance de l'armée).
3. Triangle : +50 % sur les 3 liens.
4. Corriger les textes sur la cavalerie : les 6 descriptions de cavaliers et le document d'équilibrage. La cavalerie, c'est la vitesse : éclairer, frapper vite, intercepter, renforcer. Ce n'est pas le transport.
5. Refaire les mesures une fois la modification faite.
6. Ensuite, si vous le souhaitez : une deuxième étape, fiche par fiche, pour les unités du point 6.

*Note technique : une autre variante (coefficient sur l'attaque et l'endurance, 1 / 1,25 / 1,70, triangle +50 %) donne presque les mêmes chiffres. Nous préférons B, parce que ce sont la formule et les coefficients du GDD.*

---

## 5. Les décisions à prendre

1. **Formule de dégâts.** Le texte du GDD dit « attaque − défense ». Le moteur testé du GDD utilisait la défense comme solidité.
   → Nous conseillons la solidité (options A et B), parce que c'est avec elle que l'équilibre du GDD fonctionne.
2. **Force du triangle.** +20 % (GDD) ou +50 % (conseillé).
3. **Prix de la cavalerie.** Avec l'option B, la cavalerie vaut environ 0,60 de son prix en bataille. En échange, elle est 1,5 fois plus rapide, et c'est la meilleure classe pour les céréales d'entretien (environ 1,3).

   | Prix de la cavalerie de base | Valeur de la cavalerie à prix égal (1,00 = juste prix) |
   |---|---|
   | 160 (GDD, actuel) | 0,60 |
   | 144 (−10 %) | 0,81 |
   | 128 (−20 %) | 1,26 (trop forte) |

   *Mesures indicatives, faites avec l'option B.*
   - Gardez 160 si la vitesse doit se payer : c'est le choix du GDD.
   - Passez à 144 si vous voulez que la cavalerie se batte presque aussi bien que l'infanterie pour son prix.
   - Remarque : avec l'option A, passer à 144 suffit à ce que la cavalerie batte les archers (78 à 100 %). Mais les archers d'élite ne battent toujours pas l'infanterie d'élite.
4. **Sens du triangle.** Nous conseillons de garder infanterie > cavalerie > archers > infanterie. C'est ce que disent le GDD v4 et le PDF, et c'est logique historiquement. Une ancienne version (v0.2.0) disait l'inverse.
5. **Coûts et temps par palier.** Nous conseillons de garder ×1 / ×1,8 / ×3,2, comme dans le GDD v4 et dans le jeu aujourd'hui. Les +30 / +70 / +90 % demandés le 31 janvier, et les temps courts de l'alpha (60 / 120 / 180 s), ne sont pas dans le GDD v4.

---

## 6. Les unités qui restent hors équilibre

*Situation avant les retouches, avec les fiches du GDD. Pour les valeurs appliquées et les nouvelles mesures, voir le point 7.*

**Comment lire :** l'indice compare une armée faite de cette seule unité à une armée mixte du même palier, à prix égal.
- 1,00 = l'unité vaut son prix.
- **Trop forte** : 1,30 ou plus. **Trop faible** : 0,77 ou moins.

### 6.1 Infanterie et archers

**Trop fortes**

| Unité | Faction, palier | Att./Déf./End. | Aujourd'hui | A | B | C |
|---|---|---|---|---|---|---|
| Archer du désert | Sultanat, base | 40/30/45 | **2,13** | **1,88** | **1,82** | **1,87** |
| Archer du Nil | Égypte, base | 40/30/40 | **1,81** | **1,65** | **1,61** | **1,57** |
| Archer nomade | Huns, base | 40/25/40 | **1,47** | **1,53** | **1,48** | **1,46** |
| Fantassin du Nil | Égypte, inter. | 55/55/60 | **1,65** | **1,56** | **1,47** | **1,40** |
| Hoplite | Grèce, inter. | 48/70/60 | **1,60** | **1,50** | **1,39** | 1,15 |
| Archer du désert | Égypte, inter. | 60/45/55 | **1,48** | **1,49** | **1,45** | **1,44** |
| Tireur du désert | Sultanat, inter. | 60/45/55 | **1,48** | **1,49** | **1,45** | **1,44** |
| Triarii | Rome, inter. | 45/70/60 | 1,22 | **1,31** | 1,18 | 0,81 |
| Guerrier du croissant | Sultanat, inter. | 55/50/55 | 1,09 | **1,33** | 1,23 | 1,05 |
| Champion gaulois | Gaule, élite | 85/70/75 | **2,00** | **1,75** | **1,66** | **1,64** |
| Guerrier du temple | Égypte, élite | 80/70/80 | **1,92** | **1,71** | **1,61** | **1,61** |
| Spartiate | Grèce, élite | 70/78/90 | **1,90** | **1,67** | **1,58** | **1,60** |
| Légionnaire romain | Rome, élite | 65/90/85 | **1,87** | **1,60** | **1,51** | **1,36** |
| Défenseur du palais | Sultanat, élite | 70/75/70 | 1,10 | **1,33** | 1,22 | 0,85 |

**Trop faibles**

| Unité | Faction, palier | Att./Déf./End. | Aujourd'hui | A | B | C |
|---|---|---|---|---|---|---|
| Chasseur gaulois | Gaule, base | 30/25/40 | **0,47** | **0,70** | **0,68** | **0,59** |
| Esclave égyptien | Égypte, base | 28/30/45 | **0,57** | 0,82 | **0,75** | **0,62** |
| Guerrier du désert | Sultanat, base | 30/25/45 | **0,57** | 0,87 | 0,78 | **0,68** |
| Archer paysan | Grèce, base | 30/30/40 | **0,59** | 0,81 | **0,76** | **0,63** |
| Milicien romain | Rome, base | 30/40/40 | 1,03 | 1,00 | 0,91 | **0,70** |
| Triarii gaulois | Gaule, inter. | 45/60/55 | **0,64** | 0,89 | 0,78 | **0,63** |
| Archer gaulois | Gaule, inter. | 55/45/50 | **0,71** | 1,04 | 0,98 | 0,81 |
| Toxote | Grèce, inter. | 55/45/50 | **0,71** | 1,04 | 0,98 | 0,81 |
| Nomade vétéran | Huns, élite | 70/55/65 | **0,56** | **0,75** | **0,71** | **0,66** |
| Archer d'élite hun | Huns, élite | 80/45/60 | **0,65** | 0,77 (limite) | 0,77 (limite) | 0,78 |
| Archer perse | Sultanat, élite | 80/55/60 | **0,76** | 1,09 | 1,06 | 0,85 |

### 6.2 Cavalerie

À prix égal, **presque toute la cavalerie** est en dessous de son prix : de 0,52 à 0,70 avec A et B, de 0,54 à 0,76 avec C. Seul le Cavalier pillard fait exception (0,99 avec A, 0,93 avec B, 1,26 avec C). C'est le prix de la vitesse (voir la décision 3). Nous comparons donc chaque cavalier aux autres cavaliers de son palier (1,00 = moyenne des cavaliers).

| Unité | Faction, palier | Att./Déf./End. | Aujourd'hui | A | B | C |
|---|---|---|---|---|---|---|
| Cavalier pillard | Huns, base | 45/30/50 | **1,71** | **1,46** | **1,41** | **1,71** |
| Cavalier bédouin | Sultanat, base | 35/25/50 | **0,53** | **0,78** | **0,79** | **0,74** |
| Éclaireur | Grèce, base | 38/32/45 | 0,80 (limite) | 0,86 | 0,87 | 0,81 |
| Cavalerie lourde romaine | Rome, élite | 80/75/80 | **1,26** | 1,12 | 1,12 | 1,09 |

Les autres cavaliers restent entre 0,82 et 1,18.

*Pour la cavalerie, la limite est différente : trop forte à 1,25 ou plus, trop faible à 0,80 ou moins.*

### 6.3 Résumé par option

| Option | Trop fortes | Trop faibles |
|---|---|---|
| Aujourd'hui | 12 (dont le Cavalier pillard) | 10, plus presque toute la cavalerie |
| A | 14 : 3 archers de base à 40 d'attaque, 6 intermédiaires, 5 élites d'infanterie, + Cavalier pillard (parmi les cavaliers) | Chasseur gaulois, Nomade vétéran, Archer d'élite hun (limite), Bédouin (parmi les cavaliers) |
| **B** | **11 : 3 archers de base à 40 d'attaque, 4 intermédiaires, 4 élites d'infanterie, + Cavalier pillard (parmi les cavaliers)** | **Chasseur gaulois, Nomade vétéran, Esclave égyptien, Archer paysan, Archer d'élite hun (limite), Bédouin (parmi les cavaliers)** |
| C | 10, + Cavalier pillard (parmi les cavaliers) | 7, + Bédouin (parmi les cavaliers) |

### 6.4 D'où viennent ces écarts

- **Les archers de base à 40 d'attaque** (Sultanat, Égypte, Huns), alors que les autres ont 30 à 35.
- **L'infanterie d'élite très solide** (défense et endurance de 70 à 90), sauf chez les Huns.
- **Les Huns d'élite trop fragiles** (défense 55 et 45).
- **Les unités de base gauloises** ont peu de défense (25).
- Dans le GDD, ces écarts sont petits (±10 %). Mais dans une bataille où toutes les unités frappent à chaque manche, le nombre compte beaucoup. Un petit avantage devient alors un gros écart. Aucune option ne peut l'effacer sans toucher aux fiches.
- Si vous voulez corriger ces fiches dans un deuxième temps, il faudra les régler une par une, puis les mesurer à nouveau. Nous ne proposons pas encore de valeurs : elles n'ont pas été mesurées.

---

## 7. Retouches appliquées

*30 octobre 2026. Décisions D10 (option B), D11 (textes de la cavalerie) et D12 (retouches des fiches).*

### 7.1 Ce qui a été fait

- **Moteur de bataille : option B** (D10), déjà en place. La défense redevient de la solidité. Coefficients de bataille 1 / 1,35 / 1,9, triangle +50 %. La puissance (pillages, camps, hordes) garde 1 / 1,25 / 1,55.
- **Cavalerie : textes corrigés** (D11). Son coût reste celui du GDD (160 à la base).
  - Les 6 descriptions de cavaliers de base parlent maintenant de vitesse : éclairer, frapper vite, intercepter, renforcer.
  - Plus aucune description de cavalier ne parle de pillage ni de transport. Le nom « Cavalier pillard » est gardé.
- **20 fiches retouchées** (D12) : les unités trop fortes et trop faibles du point 6.
  - Seules l'attaque, la défense et l'endurance changent, de 3 à 10 % par valeur.
  - Vitesse, transport, coût, temps de formation et entretien ne changent pas.
  - Les 34 autres fiches restent exactement celles du GDD.
- **Chaque fiche garde son caractère :**
  - le Champion gaulois reste l'infanterie la plus offensive (77) ;
  - le Spartiate garde la plus grande endurance de l'infanterie (86) ;
  - le Légionnaire garde la meilleure défense de l'infanterie d'élite (82) ;
  - l'Archer d'élite hun garde la plus forte attaque des archers (84) ;
  - l'Archer nomade garde sa défense fragile (25) ;
  - le Fantassin du Nil reste équilibré (53 en attaque et en défense) ;
  - l'Hoplite reste un peu plus offensif que les Triarii (46 contre 45) ;
  - l'Esclave égyptien reste peu combatif (30) mais endurant (49) ;
  - l'Archer du désert (Égypte) et le Tireur du désert (Sultanat) avaient la même fiche : ils la gardent commune.

### 7.2 Comment nous avons mesuré

- Même méthode qu'au point 6, avec le moteur du jeu tel qu'il est maintenant (option B).
- Une armée faite de cette seule unité affronte l'armée de référence de son palier (ses 18 unités à parts égales), à prix égal (240 000 ressources), une fois en attaque et une fois en défense.
- 1,00 = l'unité vaut son prix. La cavalerie est comparée aux cavaliers de son palier (1,00 = moyenne des cavaliers).
- **But : chaque fiche retouchée entre 0,80 et 1,25.**
- La colonne « indice avant » est mesurée avec le même moteur et les fiches du GDD. Elle diffère de la colonne B du point 6 de 0,03 au plus.
- Les valeurs ont été cherchées une à une (valeurs entières, essais automatiques). Ensuite, nous avons vérifié les paliers, le triangle et les factions.

### 7.3 Tableau avant / après

*Fiche : attaque / défense / endurance. Variation : attaque / défense / endurance.*

**Trop fortes : baissées**

| Unité | Faction, palier | Avant | Après | Variation | Indice avant | Indice après |
|---|---|---|---|---|---|---|
| Archer du désert | Sultanat, base | 40/30/45 | **36/27/41** | −10 % / −10 % / −9 % | 1,82 | **1,23** |
| Archer du Nil | Égypte, base | 40/30/40 | **38/28/37** | −5 % / −7 % / −8 % | 1,60 | **1,21** |
| Archer nomade | Huns, base | 40/25/40 | **38/25/38** | −5 % / = / −5 % | 1,48 | **1,17** |
| Fantassin du Nil | Égypte, inter. | 55/55/60 | **53/53/55** | −4 % / −4 % / −8 % | 1,45 | **1,23** |
| Hoplite | Grèce, inter. | 48/70/60 | **46/67/58** | −4 % / −4 % / −3 % | 1,37 | **1,19** |
| Archer du désert | Égypte, inter. | 60/45/55 | **57/43/52** | −5 % / −4 % / −5 % | 1,44 | **1,23** |
| Tireur du désert | Sultanat, inter. | 60/45/55 | **57/43/52** | −5 % / −4 % / −5 % | 1,44 | **1,23** |
| Champion gaulois | Gaule, élite | 85/70/75 | **77/63/68** | −9 % / −10 % / −9 % | 1,65 | **1,24** |
| Guerrier du temple | Égypte, élite | 80/70/80 | **72/64/75** | −10 % / −9 % / −6 % | 1,61 | **1,22** |
| Spartiate | Grèce, élite | 70/78/90 | **64/71/86** | −9 % / −9 % / −4 % | 1,58 | **1,23** |
| Légionnaire romain | Rome, élite | 65/90/85 | **63/82/77** | −3 % / −9 % / −9 % | 1,49 | **1,23** |
| Cavalier pillard *(parmi les cavaliers)* | Huns, base | 45/30/50 | **43/30/50** | −4 % / = / = | 1,41 | **1,16** |

**Trop faibles : montées**

| Unité | Faction, palier | Avant | Après | Variation | Indice avant | Indice après |
|---|---|---|---|---|---|---|
| Chasseur gaulois | Gaule, base | 30/25/40 | **33/26/44** | +10 % / +4 % / +10 % | 0,68 | **1,06** |
| Esclave égyptien | Égypte, base | 28/30/45 | **30/33/49** | +7 % / +10 % / +9 % | 0,74 | **1,09** |
| Guerrier du désert | Sultanat, base | 30/25/45 | **33/26/47** | +10 % / +4 % / +4 % | 0,78 | **1,11** |
| Archer paysan | Grèce, base | 30/30/40 | **33/31/43** | +10 % / +3 % / +8 % | 0,76 | **1,15** |
| Triarii gaulois | Gaule, inter. | 45/60/55 | **45/66/60** | = / +10 % / +9 % | 0,77 | **1,12** |
| Nomade vétéran | Huns, élite | 70/55/65 | **76/60/71** | +9 % / +9 % / +9 % | 0,71 | **1,19** |
| Archer d'élite hun | Huns, élite | 80/45/60 | **84/49/65** | +5 % / +9 % / +8 % | 0,77 | **1,23** |
| Cavalier bédouin *(parmi les cavaliers)* | Sultanat, base | 35/25/50 | **38/27/55** | +9 % / +8 % / +10 % | 0,79 | **1,01** |

**Les 20 fiches retouchées sont maintenant entre 1,01 et 1,24.**

### 7.4 Les mesures finales

**Paliers** *(combien d'unités du palier inférieur vaut une unité ; moyenne des 6 factions)*

| | Prix | Avant retouches | Après |
|---|---|---|---|
| 1 intermédiaire vaut … unités de base | 1,80 | 1,84 | **1,81** |
| 1 élite vaut … intermédiaires | 1,78 | 1,69 | **1,68** |
| 1 élite vaut … unités de base | 3,20 | 3,11 | **3,05** |

- Les paliers restent proportionnels à leur prix.
- L'élite perd un peu (−2 %), parce que les 4 fantassins d'élite les plus forts ont été baissés. Elle reste environ 5 % sous son prix, comme avant.
- À dépense égale (but : 1,00), intermédiaire contre base passe de 1,17 à 1,04, et élite contre intermédiaire de 0,75 à 0,73.
- Élite contre base passe de 0,89 à 0,74 : les unités de base les plus faibles ont été montées, et les fantassins d'élite les plus forts baissés. Par unité, l'écart au prix reste petit (3,05 pour 3,2).
- Puissance (pillages, camps, hordes) : 1,14 / 0,92 / 1,05 avant, 1,13 / 0,91 / 1,03 après. Presque rien ne change.

**Triangle** *(part des 36 combats entre factions gagnés par la bonne classe, à prix égal)*

| Lien | Base | Intermédiaire | Élite |
|---|---|---|---|
| Infanterie bat cavalerie | 100 → 100 % | 100 → 100 % | 100 → 100 % |
| Cavalerie bat archers | 78 → **100 %** | 94 → **100 %** | 100 → 100 % |
| Archers battent infanterie | 100 → 100 % | 100 → 100 % | 100 → 100 % |

- Le triangle marche maintenant dans tous les combats, à tous les paliers, aussi derrière un mur 10.

**Factions** *(armées mixtes, indice contre les 5 autres factions, avec le nombre de victoires sur 5 ; fiches seules, sans bonus de faction)*

| Palier | Rome | Gaule | Grèce | Égypte | Huns | Sultanat | Écart fort ÷ faible |
|---|---|---|---|---|---|---|---|
| Base, avant | 0,98 (2) | 0,79 (0) | 0,82 (1) | 1,13 (4) | 1,32 (5) | 1,05 (3) | 1,66 |
| **Base, après** | 0,92 (0) | 0,92 (1) | 0,93 (2) | 1,11 (5) | 1,05 (3) | 1,09 (4) | **1,20** |
| Intermédiaire, avant | 1,03 (3) | 0,81 (0) | 0,99 (2) | 1,30 (5) | 0,90 (1) | 1,04 (4) | 1,59 |
| **Intermédiaire, après** | 1,13 (5) | 1,05 (4) | 0,90 (0) | 1,06 (3) | 0,97 (2) | 0,90 (1) | **1,25** |
| Élite, avant | 1,26 (5) | 1,12 (3) | 1,06 (2) | 1,13 (4) | 0,68 (0) | 0,87 (1) | 1,86 |
| **Élite, après** | 1,20 (5) | 0,94 (0) | 1,00 (3) | 1,01 (4) | 0,94 (1) | 0,94 (0) | **1,28** |

- L'écart entre la faction la plus forte et la plus faible passe de 1,6–1,9 à 1,2–1,3.
- La Gaule de base (0,79 → 0,92) et les Huns d'élite (0,68 → 0,94) ne sont plus loin derrière.
- Rome devient première à l'intermédiaire et à l'élite (1,13 et 1,20). Ses fiches n'ont pas changé : ce sont les autres factions qui se sont rapprochées d'elle.

**Unités**

| | Avant | Après |
|---|---|---|
| Unités hors de 0,80–1,25 | 20 | **4** (non retouchées, voir 7.5) |
| Écart entre la meilleure et la moins bonne unité d'un palier | 2,69 | **1,43** |
| Rapportées à leur classe *(infanterie et archers ensemble, cavalerie à part)* | 0,59 à 1,77 | **0,82 à 1,16** |

### 7.5 Ce qui reste à surveiller

**4 fiches non retouchées passent juste au-dessus de 1,25.**

| Unité | Faction, palier | Indice avant | Après | Rapporté à sa classe |
|---|---|---|---|---|
| Archer vétéran | Rome, inter. | 1,23 | 1,27 | 1,07 |
| Guerrier du croissant | Sultanat, inter. | 1,20 | 1,26 | 1,06 |
| Archer d'élite romain | Rome, élite | 1,25 | 1,29 | 1,06 |
| Défenseur du palais | Sultanat, élite | 1,22 | 1,26 | 1,03 |

- Leurs fiches n'ont pas changé. Elles montent parce que l'armée de référence de leur palier s'est affaiblie : on y a baissé 4 unités trop fortes pour 1 ou 2 montées.
- Comparées à l'infanterie et aux archers de leur palier, elles sont dans la norme (1,03 à 1,07).
- Le chiffre brut est haut parce que la cavalerie, qui paie sa vitesse, tire la référence vers le bas. L'infanterie et les archers sont en moyenne à 1,07 (base), 1,19 (intermédiaire) et 1,22 (élite).
- Les baisser à leur tour ferait monter les autres de la même façon. **Nous conseillons de ne pas y toucher.**
- Pour la même raison, les fiches baissées de l'intermédiaire et de l'élite finissent près de 1,25 (1,19 à 1,24). Plus bas, ce sont les autres fiches qui passaient au-dessus de 1,25.
- Mesuré à la relecture : −3 % sur ces 4 fiches fait passer 5 autres fiches à 1,25 ou plus (Triarii romains 1,28 ; Champion gaulois et Archer du pharaon 1,26 ; Fantassin du Nil et Spartiate 1,25). Les Triarii romains, non retouchés, sont déjà à la limite (1,15 → 1,24).
- En ne retouchant que les 20 fiches de la liste (±10 %), le meilleur réglage trouvé laisse encore une fiche à 1,26 à l'intermédiaire et à 1,28 à l'élite. Mettre les 54 fiches sous 1,25 demande donc de toucher d'autres fiches que celles de la liste.

**Autres remarques**

- Les mesures sont très sensibles : 1 point d'attaque sur un archer de base change son indice de 8 à 9 %. C'est pourquoi les retouches restent petites.
- Les indices bougent un peu avec la taille des armées. Fiches hors de 0,80–1,25, avant → après : 22 → 6 à 60 000 ressources par camp (6 fiches de base et intermédiaires non retouchées entre 0,76 et 0,80), 20 → 0 à 120 000, 20 → 4 à 240 000 (la mesure du rapport), 20 → 3 à 480 000 (Archer d'élite romain 1,29, Défenseur du palais 1,26, Archer du désert du Sultanat 1,25).
- Rien n'est mesuré avec les bonus de faction, les héros ou les technologies.
- Les camps barbares, les hordes et les Immortels utilisent les mêmes fiches : leur force bouge un peu avec elles.

### 7.6 Textes de la cavalerie (D11)

| Unité | Avant | Après |
|---|---|---|
| Cavalerie auxiliaire (Rome) | … rapide, idéal pour éclairer et piller. | … rapide, idéal pour éclairer et frapper vite. |
| Chasseur monté (Gaule) | … l'un des plus rapides pour piller et éclairer. | … l'un des plus rapides pour éclairer et surprendre l'ennemi. |
| Éclaireur (Grèce) | … très rapide, parfait pour reconnaître et piller. | … très rapide, parfait pour reconnaître le terrain et intercepter. |
| Cavalier du désert (Égypte) | … très rapide, idéal pour piller. | … très rapide : le premier arrivé pour frapper ou renforcer. |
| Cavalier pillard (Huns) | Cavalier des razzias, le plus rapide de tous : fait pour piller et s'évanouir dans la steppe. | Cavalier hunnique, l'un des plus rapides du jeu : il frappe vite, intercepte et s'évanouit dans la steppe. |
| Cavalier bédouin (Sultanat) | … vitesse et capacité de pillage maximales. | … l'un des plus rapides du jeu : il éclaire, intercepte et renforce au loin. |

### 7.7 Pour refaire les mesures

- `node /tmp/claude-0/-home-user-jeu-final/32df8b96-a8b5-5bff-befe-027768644bdf/scratchpad/units-measure.cjs` : mesure complète, avant (fiches du GDD) et après (`data/units.json`). Le script écrit `units-measure.md` et `units-measure.json` à côté de lui.
- Option `--quick` : indices des unités seulement. Option `--try fiches.json` : essayer d'autres valeurs, en mémoire seulement.
- Test : `tests/unit/units-retouches.test.js` (fiches, textes de la cavalerie, indices des 20 fiches, triangle).
- L'ancien script des options A, B et C (point 3) est gardé sous `units-measure.v1-options.cjs.bak`. Il ne tourne plus, car le moteur a changé.

---

## Annexe technique (pour le développeur)

- Moteur : `src/services/combatService.js`, fonction `hitDamage`. Option A/B : `return raw * t.hp / (t.hp + config.combat.defenseDamageMult * t.def);`. Cela équivaut au moteur GDD v0.1.6 : morts = ATK·c / (END + 0,55·DEF·c). `makeSide` ne change pas (coefficient sur ATK et DEF, END sans coefficient). `minDamageRatio` n'est plus utilisé.
- Config : `combat.tierCoefficients` 1 / 1,35 / 1,9 / 0,75 pour la bataille. Prévoir une clé séparée à 1 / 1,25 / 1,55 pour `resolveCombat` et `calculateArmyPower`. `combat.triangle` 1,5 ×3.
- Option C : `defenseDamageMult` 0,30, `minDamageRatio` 0,30, `triangle` 1,5 ×3.
- Copies des coefficients à mettre à jour : `frontend/js/app/10b-sheets.js:16`, `frontend/js/app/07-army.js:300`, `tools/simulate-factions.cjs`, et le commentaire de `config.expedition.powerDivisor`.
- Textes : 6 descriptions de cavaliers de base dans `data/units.json`, et `docs/EQUILIBRAGE.md` (« meilleur transport : rôle de pillard »).
- Correspondance avec les mesures : Aujourd'hui = CUR, A = O1, B = O1T, C = T2.
- Scripts de mesure : `/tmp/claude-0/-home-user-jeu-final/32df8b96-a8b5-5bff-befe-027768644bdf/scratchpad/units-measure.cjs`, `/tmp/claude-0/-home-user-jeu-final/32df8b96-a8b5-5bff-befe-027768644bdf/scratchpad/rapport/options.cjs`, `/tmp/claude-0/-home-user-jeu-final/32df8b96-a8b5-5bff-befe-027768644bdf/scratchpad/rapport/optC.cjs`, `/tmp/claude-0/-home-user-jeu-final/32df8b96-a8b5-5bff-befe-027768644bdf/scratchpad/rapport/cav.cjs`, `/tmp/claude-0/-home-user-jeu-final/32df8b96-a8b5-5bff-befe-027768644bdf/scratchpad/rapport/power.cjs`, `/tmp/claude-0/-home-user-jeu-final/32df8b96-a8b5-5bff-befe-027768644bdf/scratchpad/rapport/rounds.cjs`, `/tmp/claude-0/-home-user-jeu-final/32df8b96-a8b5-5bff-befe-027768644bdf/scratchpad/rapport/summarize.cjs`, `/tmp/claude-0/-home-user-jeu-final/32df8b96-a8b5-5bff-befe-027768644bdf/scratchpad/rapport/tables.cjs`.
- Aucun fichier du jeu, aucune base de données et aucun serveur n'ont été modifiés.
