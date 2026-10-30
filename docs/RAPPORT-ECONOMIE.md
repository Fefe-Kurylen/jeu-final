# L'économie du jeu : coûts, entretien, nourriture et stockage

*Imperium Antiquitas — rapport de décision — 30 octobre 2026*

> **Mise à jour du 30 octobre 2026 au soir** : les décisions sont prises et appliquées. Ce que devient chaque recommandation :
> dernière partie, « Décisions appliquées le 30 octobre 2026 ». Les chiffres ci-dessous sont ceux d'avant ces décisions.

**Votre question.** Les coûts sont-ils équilibrés face à l'entretien des armées, à la production de nourriture et au stockage ?

**D'où viennent les chiffres.**
- Tous les calculs utilisent les vraies formules du jeu.
- Plusieurs simulations de 120 jours ont tourné à part, avec 12 joueurs automatiques, sur des bases de test. La base du jeu n'a pas été touchée.
- Un second contrôle a refait chaque calcul. Seuls les chiffres qu'il a confirmés ou corrigés figurent ici.
- Les décisions (a) à (d) sont prises en compte. Elles ne sont pas rediscutées.

**Petit lexique.**
- « M » = million. « G » = milliard.
- « Heures de production » : le temps qu'il faut à une ville pour produire une somme, toutes ressources comptées.
- « Remboursement » d'un champ : le temps pour que la production gagnée paie le prix du niveau.
- « Puissance » : la force d'une armée, telle que le jeu l'affiche.
- Joueur « actif » : il se connecte toutes les heures. Joueur « occasionnel » : 2 à 4 fois par jour.

**Déjà en place dans le code.**
- (a) Grand Dépôt et Grand Silo : 3 600 au niveau 1, 480 000 au niveau 20, comptés dans le stockage. Le Grand Dépôt ne protège plus du pillage. C'est enregistré.
- (c) Moteur de bataille du GDD, coefficients 1 / 1,35 / 1,9. C'est enregistré.
- (d) Alliance de 60 membres au plus : enregistré. Donjons qui suivent l'âge du monde et XP du héros ×1,25 : en cours d'ajout, pas encore enregistrés.

---

## 1. En bref

- **Nourriture contre entretien : c'est équilibré.** Une armée au maximum de ce qu'une ville peut nourrir mange 37,5 % (champs au niveau 20) à 42,8 % (champs au niveau 10) de toute la production de la ville. C'est proche d'un village d'attaque de Travian. Aucune famine dans les simulations.
- **Recruter ne coûte presque rien.** Une unité mange son prix en nourriture en un jour environ. Dans Travian, il faut 10 à 25 jours. La nourriture décide donc seule de la taille des armées. Le bois, la pierre et le fer s'accumulent : au jour 120 de la simulation, les dépôts des capitales sont pleins.
- **Les champs se remboursent trop vite.** Un champ rembourse son prix en 20 à 64 heures, à tous les niveaux. Dans Travian, c'est 104 heures au niveau 2 et 9 470 heures au niveau 20. Résultat : une capitale est complète entre le jour 39 et le jour 94 selon le rythme de connexion, bien avant la Merveille (jour 120).
- **Le vrai frein, ce sont les connexions, pas les ressources.** Un joueur qui se connecte toutes les heures finit ses champs au jour 21. Un joueur qui se connecte 3 fois par jour, au jour 39.
- **Stockage : la décision (a) règle tout.** Sans elle, 13 niveaux étaient impossibles à payer. Avec Dépôt 20 + Grand Dépôt 20 = 640 000, le niveau le plus cher ne prend plus que 49 % du stockage.
- **Unités : l'intermédiaire est un piège.** À nourriture égale, une armée de base bat une armée intermédiaire dans les 6 civilisations, de 30 à 43 %.
- **Perdre une armée ne coûte presque rien.** Les soins sont gratuits : jusqu'à 70 % des pertes reviennent en 11 à 30 minutes.
- **La fin de partie est trop facile.** La Merveille entière coûte une demi-journée à une journée de production d'une alliance de 60 joueurs. Un site des Immortels se prend avec 37 % de la nourriture d'un seul joueur occasionnel.

---

## 2. Nourriture contre entretien

### 2.1 Ce que mange une armée

| | Base | Intermédiaire | Élite | Engin de siège |
|---|---|---|---|---|
| Entretien (céréales par heure) | 5 | 10 | 15 | 15 |

- Ce sont les valeurs du GDD.
- Sur 120 jours, une unité de base mange 14 400 céréales : 115 fois son prix.

### 2.2 L'armée qu'une capitale peut nourrir

Ici, toute la nourriture va à l'armée.

| Stade de la capitale | Armée nourrie | Temps pour la former dans la capitale |
|---|---|---|
| Champs au niveau 5 | 61 unités de base | Ce sont les ressources qui manquent |
| Champs au niveau 10, Moulin 5 | 527 unités de base, ou 264 intermédiaires | 17 à 22 heures |
| Champs au niveau 15 | 754 élites | 4 jours environ |
| Champs au niveau 20, Moulin et Boulangerie | 8 102 unités de base, ou 2 701 élites | 13 à 16 jours |

- **Part de l'économie.** Cette armée mange 42,8 % de toute la production de la ville aux champs 10, et 37,5 % aux champs 20. **L'entretien n'est pas trop lourd.**
- **Prix de cette armée.** L'acheter coûte 20,6 à 26,4 heures de production de fer (infanterie), ou 22,5 à 28,8 heures de production de bois (archers).
- **Une journée d'entretien** vaut 0,90 à 1,07 fois le prix de toute l'armée.
- **Avec les colonies.** Leurs Grandes casernes et Grandes écuries forment plus vite. L'armée d'une capitale se reforme alors en 1,7 jour. L'armée de 4 villes (13 665 élites), en 8,8 jours.
- **Civilisations.** L'Égypte nourrit 20 % de soldats en plus. Les Huns et le Sultanat, 11 % de plus.
- **Dans les simulations.** Vers le jour 48, l'entretien prenait 68 à 70 % de la nourriture des capitales. En fin de partie, 10,6 à 35 % seulement, car les joueurs automatiques limitent eux-mêmes leur armée. Aucune famine. Les chiffres du tableau sont donc calculés, pas observés.

### 2.3 La nourriture selon le rythme de connexion

Joueur qui met tout dans l'économie, une seule ville. Nourriture produite par heure :

| Rythme | Jour 14 | Jour 21 | Jour 30 | Champs tous au niveau 20 |
|---|---|---|---|---|
| Actif (toutes les heures, de 7 h à 23 h) | 3 055 | 40 510 | (déjà au maximum) | jour 21 |
| 4 connexions par jour | 1 203 | 5 257 | 24 310 | jours 33 à 35 |
| 2 connexions par jour | 304 | — | 1 923 | jours 60 à 65 |

*Le modèle de la partie 4 donne des dates un peu différentes (à 2 connexions par jour : jour 54 au lieu de 60 à 65). L'ordre de grandeur est le même.*

- Entre l'actif et le joueur à 4 connexions, l'écart est de ×2,5 au jour 14 et de ×8 au jour 21.
- Il se referme vers le jour 35 (4 connexions) ou le jour 65 (2 connexions).
- La cause : un champ se rembourse en 20 à 64 heures, à tous les niveaux (voir partie 4). Plus on construit, plus on construit vite.

### 2.4 Ce que le jeu demande, face à ce qu'on peut nourrir

**Ce que le jeu demande**

| Contenu | Puissance |
|---|---|
| Donjon d'invasion niveau 1 (3 étages) | 15 000 / 30 000 / 60 000 |
| Donjon d'invasion niveau 5 (3 étages) | 586 000 / 1,17 M / 2,34 M |
| Site des Immortels (jour 120) | 600 000 |
| Plan de la Merveille (jour 150) | 900 000 |
| Vague des Immortels contre la Merveille, toutes les 12 h | 89 500 (Merveille 10), 786 000 (50), 2,00 M (100) |

**Ce que les joueurs peuvent aligner**

| Qui | Quand | Puissance |
|---|---|---|
| Rassemblement de joueurs occasionnels | jour 14 | 13 000 à 22 000 |
| Rassemblement de joueurs occasionnels | jour 30 | 55 000 environ |
| Rassemblement de joueurs occasionnels | jour 56 | 1,2 à 1,4 M |
| Un joueur occasionnel seul, 3 villes | jour 120 | 1,64 M |
| Le même, 4 villes | jour 120 | 2,2 M |
| Un joueur actif, 4 villes | jour 120 | 3,0 M (3,46 M avec Plus et le Bastion, 4,16 M en Égypte) |
| Une alliance de 60 joueurs | jour 120 | 98 à 132 M |

Ce qu'il faut retenir :
- **Début de partie : les donjons sont hors de portée.** La Place de rassemblement limite le nombre d'armées d'un rassemblement : 3 au niveau 1, 5 au niveau 5, 8 au niveau 10, 11 au niveau 15, 15 au niveau 20.
- **Fin de partie : tout devient facile.** Un seul joueur occasionnel prend un site des Immortels avec 37 % de sa nourriture. La vague du niveau 100 vaut l'armée maximale d'un seul joueur occasionnel.
- Avec le nouveau moteur (décision c), les Immortels, tous élites, sont environ 23 % plus forts au combat que leur puissance affichée. Cela ne change pas l'ordre de grandeur.
- **Donjons et âge du monde (décision d).** La formule en cours d'ajout ne renforce jamais le niveau 1 (chef à 60 000). Elle multiplie le niveau 5 jusqu'à 6 fois (chef à 13,8 M environ au jour 120). L'écart entre petits et grands donjons se creuse. Voir la recommandation 9.

---

## 3. Stockage contre coûts

### 3.1 La courbe de stockage est saine

- Dépôt et Silo : 1 200 au niveau 1, 12 182 au niveau 10, 160 000 au niveau 20.
- Le stockage grandit un peu plus vite que les prix : ×1,294 par niveau, contre ×1,28.
- Travian : Dépôt 10 = 11 800, Dépôt 20 = 80 000. Le nôtre est proche au niveau 10 et double au niveau 20.
- Des champs du même niveau remplissent le Dépôt en 26,7 h au niveau 1, 16,7 h au niveau 5, 9,9 h au niveau 9, puis 8,7 à 8,9 h du niveau 10 au niveau 20.

### 3.2 Sans la décision (a) : 13 niveaux impossibles à payer

Le prix d'une ressource dépassait les 160 000 du Dépôt 20 :

| Bâtiment | Niveaux bloqués | Plus grosse ressource |
|---|---|---|
| Bâtiment principal | 29, 30 | 200 867 ; 257 110 |
| Chambre au Trésor | 18, 19, 20 | 191 408 ; 245 003 ; 313 604 |
| Temple grec | 18, 19, 20 | 166 153 ; 212 676 ; 272 225 |
| Thermes romains | 19, 20 | 187 155 ; 239 558 |
| Irrigation égyptienne | 20 | 196 002 |
| Brasserie gauloise, Tente de guerre hunnique | 20 | 174 224 |

- Même avec la recherche Ingénierie 20 (−10 %), 10 niveaux restaient impossibles.
- C'était injuste entre civilisations : Rome perdait 2 niveaux, la Grèce 3, l'Égypte, la Gaule et les Huns 1, le Sultanat aucun.
- Dans la simulation, les 12 capitales sont restées bloquées au Bâtiment principal 28, atteint entre les jours 87 et 98, jusqu'à la fin.

### 3.3 Avec la décision (a) : tout se paie

- Dépôt 20 + Grand Dépôt 20 = 640 000.
- Le niveau le plus cher, la Chambre au Trésor 20 (313 604), en prend 49 %.

Niveau de Grand Dépôt nécessaire :

| Pour construire | Grand Dépôt minimum | Avec 15 % de marge |
|---|---|---|
| Bâtiment principal 29 | 11 | 13 |
| Bâtiment principal 30 | 14 | 16 |
| Chambre au Trésor 18 / 19 / 20 | 10 / 14 / 16 | 13 / 15 / 17 |
| Temple grec 20 | 15 | 16 |
| Thermes romains 20 | 14 | 15 |
| Irrigation égyptienne 20 | 10 | 13 |
| Brasserie gauloise 20, Tente de guerre hunnique 20 | 7 | 11 |

- Avec un Grand Dépôt au même niveau que le bâtiment visé, tout reste sous 85 % du stockage. Pire cas : Chambre au Trésor 60 %, Temple 52 %, Thermes 46 %, Bâtiment principal 30 40 %.
- Le Grand Dépôt 17 coûte 116 887 en tout (niveaux 1 à 17) et environ 82 heures de construction. Son vrai prix, c'est **un emplacement** : la capitale a 19 emplacements pour 27 bâtiments possibles.
- Le Bastion et la Merveille ne dépendent pas du stockage. On les remplit par convois, dans leur propre réserve.
- Dépôt + Grand Dépôt (640 000) se remplissent en 28,4 à 35,5 heures selon les bâtiments de bonus. Une nuit ne fait plus déborder.

### 3.4 La nourriture et le Silo

- Aucun prix en nourriture ne dépasse le Silo 20. Le plus cher : la Résidence 20, 130 668 (82 % du Silo).
- Le Silo se remplit plus vite que le Dépôt : 6 fermes contre 4 champs par ressource, et +50 % avec Moulin et Boulangerie.
  - Capitale au maximum : Silo plein en 3,6 h, Dépôt plein en 6,5 h.
  - Colonie au maximum : Silo plein en 3,0 h.
- Le Silo ne gêne qu'avec des fermes au niveau 18 ou plus et une Boulangerie.
- Avec le Grand Silo de la décision (a) : 15,8 h en capitale, 12 h en colonie. **Rien d'autre à changer.**

### 3.5 Ce qui reste à corriger

- **Colonie neuve.** Elle naît avec 3 000 de chaque ressource, pour une place de 1 000.
  - Tant que ses 4 ressources dépassent 1 000, sa production est perdue.
  - Le premier gain reçu (convoi, achat au marché, butin, remboursement) ramène tout à 1 000 : jusqu'à 2 000 perdus par ressource.
  - Simulation : 23 jours touchés, jusqu'à 12 colonies le même jour.
- **Trésor des invasions.**
  - Par ressource : 8 000 / 20 000 / 50 000 / 125 000 / 312 500 (niveaux 1 à 5).
  - Ce qui ne tient pas dans le stockage est perdu, sans message. Au niveau 5, le trésor fait 195 % d'un Dépôt 20.
  - Avec (a), le trésor complet du niveau 5 tient dans 48,8 % du stockage. Mais il faut un Grand Dépôt et de la place libre. Et la part en nourriture demande un Grand Silo, dont aucun autre prix n'a besoin.
  - L'âge du monde (décision d) va multiplier ce trésor, jusqu'à 6 fois au niveau 5.
- **Message trompeur.** Quand un prix dépasse le stockage, le jeu affiche « Ressources insuffisantes ». Le joueur attend des ressources qui ne tiendront jamais dans sa ville.
- **Effets de bord de la décision (a).** Deux plafonds suivent le stockage total :
  - Récompenses de quêtes (la moitié du plus grand stockage) : 80 000 → 320 000 par ressource. Les succès de palier 5 valent 12 h de production (648 000 pour 3 villes aux champs 20) : ils seraient plafonnés à 320 000 au lieu de 80 000. Le bonus de la semaine passe de 80 000 à 108 000.
  - Routes commerciales (8,33 % du stockage par envoi) : 13 333 → 53 333 par envoi.

---

## 4. Rythme de progression

### 4.1 Un champ se rembourse trop vite

| Bûcheron | Niveau 1 | Niveau 10 | Niveau 20 |
|---|---|---|---|
| Prix du niveau (4 ressources) | 240 | 2 212 | 26 132 |
| Production par heure | 10 | 350 | 4 500 |

- Le prix monte de ×1,28 par niveau.
- La production monte de ×1,48 par niveau jusqu'au niveau 10, puis de ×1,29.
- Le remboursement ne s'allonge donc jamais :

| Remboursement d'un niveau | Niveau 2 | Niveau 10 | Niveau 20 |
|---|---|---|---|
| Bûcheron | 61 h | 19 h | 26 h |
| Autres champs | 64 à 69 h | 20 à 22 h | 27 à 29 h |
| Travian (bûcheron) | 104 h | 459 h | 9 470 h |

- Un étage complet (les 18 champs, d'un niveau au suivant) coûte 28 heures de production de la ville au niveau 1, 7,1 h au niveau 10, 5,4 h au niveau 19.
- À partir du stade 10, un niveau de plus coûte 0,3 à 1,2 heure de production pour un champ, le Bâtiment principal, le Dépôt ou la Caserne.

**Et le GDD ?**
- Le GDD prévoyait des champs à ×1,67 par niveau (4,09 M au niveau 20). Mais leur production montait encore plus vite (×1,78). Le remboursement au niveau 20 y était de 7,8 h, encore plus court qu'aujourd'hui. Et cette table était impossible à construire (1,70 M d'une seule ressource).
- Le vrai frein du GDD était le **temps** : 633 heures brutes pour un champ niveau 20 (26 jours), 700 heures pour le Bâtiment principal. Les autres longs bâtiments restaient modérés au niveau 20 : Dépôt 50 h, Douves 120 h, Chambre au Trésor 45 h.
- Seul Travian fait monter les prix plus vite que la production.

### 4.2 Le calendrier d'aujourd'hui

Modèle d'un joueur qui joue au mieux, avec les vraies règles de la file de construction :

| Connexions par jour | Champs tous au niveau 20 | Bâtiment principal 30 | Capitale complète |
|---|---|---|---|
| 17 (actif) | jour 21 | jour 26 | jour 39 |
| 5 (régulier) | jour 27 | jour 37 | jour 52 |
| 3 (occasionnel) | jour 39 | jour 53 | jour 70 |
| 2 | jour 54 | jour 75 | jour 94 |

- Les sites de la Merveille ouvrent au jour 120. Il reste donc 50 à 80 jours sans objectif économique à 3 à 17 connexions par jour, et environ 26 jours à 2 connexions.
- Une capitale complète coûte 18,5 à 26,8 M. C'est 6,5 à 9,4 jours de production d'une capitale au maximum (118 828 par heure, soit 2,85 M par jour).
- Les 18 champs d'une colonie, du niveau 1 au 20, coûtent 2,24 M.
- Les grands chantiers ne pèsent rien face à une alliance :
  - Bastion (1,75 M) : moins d'une heure de production à 15 membres.
  - Merveille entière (niveaux 1 à 100) : 430,7 M, dont 130,5 M de bois, autant de pierre et de fer, et 39,2 M de nourriture. C'est 0,55 jour de production de 60 joueurs au maximum, environ 1 jour en réalité au jour 120. Seuls ses 18 jours de chantier la freinent.

### 4.3 Où la progression bloque

**Ce n'est pas l'argent, c'est la file et les connexions.**
- La file permet 2 chantiers en cours et 2 en attente.
- Temps de construction, réductions comprises :
  - un champ : 8 min au niveau 10, 14 min au niveau 15, 32 min au niveau 20 ;
  - le Bâtiment principal 20 : 38 min ;
  - mais le Dépôt 20 : 7 h, le Grand Dépôt 20 : 24,7 h, la Chambre au Trésor 20 : 28,3 h, les Douves 20 : 51 h.
- Une capitale complète, c'est 695 niveaux à lancer.
- Moins de 2 chantiers tournent pendant 67 % du temps (actif) à 92 % du temps (2 connexions par jour).

**Les dépôts débordent** (simulation, 2 connexions par jour) :
- Une ressource est à 98 % ou plus de son plafond dans 72 à 75 % des relevés (jours 14 à 63), puis dans 84 à 92 % (jours 63 à 98).
- Bois, pierre et fer sont pleins dans 83 % des relevés des jours 63 à 98, et dans 99 % ensuite.

**Des niveaux qui servent peu.**
- Bâtiment principal 1 à 20 : 296 000 en tout, 2,5 heures d'une capitale au maximum.
- La réduction du temps de construction atteint son plafond de 60 % dès le Bâtiment principal 16 (avec Académie et Résidence 16).
- Les niveaux 21 à 30 du Bâtiment principal coûtent 3,2 M et n'apportent que de la population.

### 4.4 Ce que changeraient les réglages proposés

Dates en jours : champs tous au niveau 20 / capitale complète.

| Réglage | Régulier (5 par jour) | Occasionnel (3 par jour) | 2 connexions par jour |
|---|---|---|---|
| Aujourd'hui | 27 / 52 | 39 / 70 | 54 / 94 |
| **V7b** : champs ×1,45 ; temps ×1,30 sur les champs et le Bâtiment principal | 48 / 63 | 52 / 75 | 67 / 98 |
| **V7** : champs ×1,45 ; temps ×1,30 sur tous les bâtiments | 50 / 105 | 56 / 114 | — / 136 |

- **V7b** freine surtout les champs, donc la course à la nourriture et à l'armée. Les ressources redeviennent une vraie limite : bois, pierre et fer sont pleins 11 à 53 % du temps (contre 45 à 66 % avec V7). La capitale est complète vers les jours 63 à 75.
- **V7** repousse la capitale complète vers les jours 96 à 114. Mais elle étire les longs bâtiments bien au-delà du GDD, au niveau 20 :
  - Douves : 585 h brutes (GDD : 120 h) ;
  - Chambre au Trésor : 324 h (GDD : 45 h) ;
  - Grand Dépôt : 283 h (GDD : 48 h).
  
  Une ligne complète de Douves occuperait une place de file 42 jours (12,4 aujourd'hui). Et à 2 connexions par jour, la capitale n'est complète qu'au jour 136, après l'ouverture des sites.
- Monter seulement le prix des champs à ×1,40 ralentit le joueur régulier (champs au 20 : jour 35 au lieu de 27), mais presque pas l'occasionnel (jour 41 au lieu de 39).
- Baisser la production du niveau 20 à celle de Travian (2 450 par heure) ne change presque rien : jour 27,0 au lieu de 26,9.

---

## 5. Unités : prix, entretien, formation

### 5.1 Le prix ne pèse presque rien face à l'entretien

| Unité | Prix (4 ressources) | Entretien par heure | Jours pour manger son prix |
|---|---|---|---|
| Infanterie ou archer, base | 125 | 5 | 1,04 |
| Infanterie ou archer, intermédiaire | 225 | 10 | 0,94 |
| Infanterie ou archer, élite | 400 | 15 | 1,11 |
| Cavalerie, base | 160 | 5 | 1,33 |
| Cavalerie, intermédiaire | 288 | 10 | 1,20 |
| Cavalerie, élite | 512 | 15 | 1,42 |
| Engin de siège | 2 160 | 15 | 6,0 |

Travian, même calcul : Combattant au gourdin 10,4 jours, Légionnaire 16,7, Equites Imperatoris 19,6, Equites Caesaris 22,6, Imperian 25.

Conséquences :
- L'armée qu'une ville peut nourrir vaut 7,5 à 14,6 heures de production de la ville.
- Une armée détruite se rachète en moins d'une demi-journée. Seul le temps de formation freine sa reconstruction.
- Les prix des paliers (×1,8 et ×3,2) comptent peu. C'est la nourriture par heure qui fait le budget d'une armée.
- Ce sont bien les valeurs du GDD. Multiplier tous les prix par 2,5 donnerait 2,3 à 3,6 jours, mais la cavalerie de base passerait à 400 : c'est contraire à la décision (c). **Non recommandé.**

### 5.2 Le piège de l'intermédiaire

La « valeur au combat » est une mesure qui prédit exactement le résultat des batailles du nouveau moteur.

| Valeur moyenne au combat | Base | Intermédiaire | Élite |
|---|---|---|---|
| Par céréale d'entretien | 9,25 | 8,46 | 9,52 |
| Pour 100 ressources de prix | 34,0 | 34,7 | 33,0 |
| Par heure de formation | 434 | 498 | 498 |

- **Par ressource, les trois paliers se valent.** C'est la règle du GDD.
- **Par céréale, l'intermédiaire est le pire.** Il fait moins bien que la base dans 17 lignes sur 18 (6 civilisations × 3 classes).
- À nourriture égale, une armée de base bat une armée intermédiaire dans les 6 civilisations : de 29,9 % (Grèce) à 43,4 % (Huns).
- La puissance affichée aux joueurs dit le contraire (13,1 / 13,4 / 14,6 par céréale). Le joueur est trompé.
- Ce piège vient du GDD lui-même, pas de la décision (c). Un prix proportionnel à la valeur (1 / 1,8 / 3,2) avec un entretien 5 / 10 / 15 met l'intermédiaire 10 % sous la base par céréale.
- Le piège ne joue que tant que la nourriture limite l'armée. Par ressource et par heure de formation, l'intermédiaire est le meilleur.

**L'élite est un peu faible.**
- 1 élite vaut 1,69 intermédiaire. Le GDD vise 1,8.
- Par céréale, l'élite fait moins bien que la base dans 7 lignes sur 18, surtout chez les Huns.
- À ressources égales, une armée d'élite perd contre une armée intermédiaire dans les 6 civilisations : de 2,2 % (Gaule) à 36,2 % (Huns).
- Par céréale, l'élite reste meilleure que l'intermédiaire dans les 18 lignes (+12,6 % en moyenne).

### 5.3 Les armées mélangées sont punies

- La règle de ciblage du GDD fait frapper les élites en premier. Une armée mélangée perd donc d'abord sa force de frappe.
- À nourriture égale, 25 % d'élites et 75 % d'unités de base perdent contre une armée de base pure dans les 6 civilisations : de 9,6 % (Rome) à 29,1 % (Huns).
- Un mélange moitié-moitié perd aussi partout (de 7 à 37 %). Pourtant, l'élite pure bat la base pure dans 5 civilisations sur 6.
- Si les coups se répartissaient sur tous les paliers selon leur résistance, ces mêmes mélanges gagneraient de 11 à 29 % (sauf chez les Huns).
- Or les vrais joueurs ont des armées mélangées : la base du début, puis les élites ajoutées.

### 5.4 Les soins rendent les pertes presque gratuites

- 30 % des pertes deviennent des blessés, +3 % par niveau de Tente de soins, jusqu'à 70 % dès le niveau 14.
- Les soins ne coûtent aucune ressource.
- Leur durée ne dépend pas du nombre de blessés : 30 min à la Tente 1, 18,9 min à la Tente 10, 11,3 min à la Tente 20. La Tente 20 a 4 000 lits : jusqu'à 21 200 soldats soignés par heure.
- Soin immédiat : 1 or par unité, que ce soit une unité de 125 ou un engin de 2 160.
- Perdre 1 000 fantassins de base coûte donc 37 500 ressources : 0,4 heure de production d'une capitale au niveau 20.
- Les blessés du défenseur guérissent avant la fin du camp d'une heure. La fiche « État des systèmes » dit le contraire : elle est périmée.
- Les blessés en attente ne mangent rien.

### 5.5 Le pillage ne paie pas

- Un raid ramène au plus 30 % de ce que l'armée peut porter, une fois par cible et par 24 h (valeurs du GDD). Il prend aussi au plus 50 % du stock non caché de la cible.
- Unité de base : 16,5 à 21 ressources par raid, pour 120 céréales mangées par jour. Il faut piller 5,7 à 7,3 cibles différentes par jour pour rentrer dans ses frais.
- Élite : 13,5 à 15 ressources par raid, pour 360 céréales par jour. Il faut 24 à 26,7 cibles par jour.
- Travian : un raid d'Equites Imperatoris paie 1,39 jour de leur entretien.
- Seuls le butin d'un siège gagné et la récolte des points de ressources rapportent vraiment.

### 5.6 Formation, colons, espions, héros : cohérents

- **Formation.** Ce qui limite change au fil de la partie : les ressources au début, la nourriture au milieu, le temps de formation à la fin. C'est sain.
- La Grande caserne et la Grande écurie des colonies forment 2,25 fois plus vite que la capitale (27,8 fantassins de base par heure contre 12,35).
- **Colons.** Ils sont gratuits, mais la Résidence les limite : 104 200, 381 500 puis 1,334 M cumulés (44 % en nourriture), 3 colonies au plus. C'est bien.
- **Espions.** Bien réglés.
- **Engins de siège.** 2 160 ressources, remboursés en 6 jours d'entretien. C'est bien.
- **Héros.** Sa résurrection coûte au plus 108 000 ressources, soit 1,33 heure de production : bon marché en fin de partie.

---

## 6. Recommandations

**[Correctif]** = une erreur à corriger, sans choix à faire. **[À décider]** = demande votre décision.

| N° | Sujet | Type | Priorité |
|---|---|---|---|
| 1 | Ne plus perdre de ressources à la réception | Correctif | Haute |
| 2 | Trésor des invasions à réclamer | Correctif | Haute |
| 3 | Champs plus chers (×1,45) | À décider | Haute |
| 4 | Champs et Bâtiment principal plus longs (×1,30) | À décider | Haute |
| 5 | Entretien 5 / 9 / 13 | À décider | Haute |
| 6 | Soins payants et plus lents | À décider | Haute |
| 7 | Merveille ×5 | À décider | Moyenne |
| 8 | Immortels plus forts | À décider | Moyenne |
| 9 | Donjons : comment suivre l'âge du monde | À décider | Moyenne |
| 10 | Ciblage des armées mélangées | À décider | Moyenne |
| 11 | Pillage | À décider | Moyenne |
| 12 | Plafonds des quêtes et des routes après (a) | À décider | Moyenne |
| 13 | Emplacements de la capitale | À décider | Basse |
| 14 | Message « Dépôt trop petit » | Correctif | Basse |
| 15 | Joueurs automatiques de la simulation | Correctif | Basse |
| 16 | Documents périmés | Correctif | Basse |

**1. [Correctif] Ne plus jamais perdre de ressources à la réception.**
- Changer : quand une ville reçoit des ressources, écrire « le plus grand entre le stock actuel et (stock + gain, limité au plafond) ». C'est ce que fait déjà la production.
- Effet : un gain ne fait plus jamais baisser un stock. Les colonies gardent leurs 3 000 de départ. Aucun réglage d'équilibre ne change.
- À ne pas faire : mettre le plafond d'une colonie à 3 000 à sa fondation. Le premier Dépôt 1 le ramène à 1 200, et le problème revient.

**2. [Correctif] Trésor des invasions : ne plus le perdre.**
- Changer : verser la part de chaque joueur comme une récompense de quête, à réclamer pendant 7 jours, avec le choix de la ville et le contrôle de place libre.
- Variante plus simple : créditer la capitale, puis verser le reste dans les autres villes.
- À défaut : `invasion.treasure.resourceFactor` de 2,5 à 2,0 (niveau 5 : 128 000 par ressource).
- Effet : la récompense principale des invasions n'est plus perdue en silence. C'est à faire avant que l'âge du monde (décision d) ne la multiplie.

**3. [À décider] Champs plus chers : ×1,45 par niveau.**
- Changer : un nouveau réglage `config.build.fieldCostMultiplier = 1.45`, pour la Ferme, le Bûcheron, la Carrière de pierre et la Mine de fer seulement. Tout le reste garde ×1,28.
- Effet :
  - remboursement d'un champ : 60 h au niveau 10, 276 h au niveau 20 (Travian : 459 h et 9 470 h) ;
  - 18 champs du niveau 1 au 20 : 17,0 M par ville, au lieu de 2,24 M. C'est aussi vrai pour chaque colonie ;
  - le plus gros prix d'un champ 20 (116 400 d'une ressource) tient dans un Dépôt 19 (123 675). ×1,45 est le maximum qui tient sans Grand Dépôt : à ×1,50, il faudrait 222 000 de pierre.
- Variante plus douce : ×1,40 (9,48 M ; remboursement 45 h et 147 h).
- Le ×1,28 est recopié à plusieurs endroits : tout changer ensemble (liste en annexe).
- À vérifier ensuite en simulation, colonies comprises. Les dates de la recommandation 4 ne portent que sur la capitale.

**4. [À décider] Constructions plus longues : ×1,30 par niveau, sur les champs et le Bâtiment principal seulement (V7b).**
- Changer : le temps de ces 5 bâtiments monte de ×1,30 par niveau au lieu de ×1,2. Les autres restent à ×1,2. Le plus propre : un rythme par bâtiment dans les données. Le fichier des bâtiments contient déjà les valeurs du GDD, que le code n'utilise pas.
- Effet, avec la recommandation 3 : champs au niveau 20 vers le jour 48 (régulier), 52 (occasionnel), 67 (2 connexions par jour), au lieu de 27, 39 et 54. Les ressources redeviennent une limite.
- Ne pas l'appliquer à tous les bâtiments (V7) : les Douves, la Chambre au Trésor et le Grand Dépôt deviendraient bien plus longs que dans le GDD (voir 4.4).
- Garder la recherche à ×1,2. Si elle suivait à ×1,30, les 8 technologies prendraient environ 63 jours au lieu de 18,7.
- Votre choix porte sur le calendrier : avec V7b, la capitale reste complète vers les jours 63 à 75. Les recommandations 7 et 8 donnent alors des objectifs pour la suite.

**5. [À décider] Entretien 5 / 9 / 13 au lieu de 5 / 10 / 15.**
- Changer : `config.army.upkeepPerTier` = base 5, intermédiaire 9, élite 13, siège 15.
- Effet :
  - valeur par céréale : 9,25 / 9,40 / 10,98 ;
  - plus aucune élite sous sa base (0 ligne sur 18) ;
  - l'élite fait +17 % par céréale sur l'intermédiaire (GDD : +20 %) ;
  - un peu moins de pression sur la nourriture.
- L'intermédiaire reste sous la base dans 8 lignes sur 18. De petites retouches suffisent, à faire avec celles déjà prévues :

| Unité | Écart par céréale | Retouche minimale |
|---|---|---|
| Equites (Rome) | −1,0 % | +5 d'endurance |
| Triarii gaulois | −0,4 % | +5 d'endurance |
| Cavalier gaulois | −0,6 % | +5 d'endurance |
| Archer du désert (Égypte) | −1,1 % | +5 d'endurance |
| Cavalerie du pharaon | −2,0 % | +5 d'endurance |
| Archer du camp (Huns) | −3,7 % | +7 d'endurance |
| Tireur du désert (Sultanat) | −5,2 % | +10 d'endurance |
| Cavalier hun | −8,1 % | +18 d'endurance, ou +12 d'attaque |

- Cela s'écarte du GDD (5 / 10 / 15) : c'est votre décision.
- L'entretien est aussi écrit dans l'écran du joueur et sert aux points de classement : tout changer ensemble.

**6. [À décider] Soins payants et plus lents.**
- Changer :
  - prix d'un soin : 30 % du prix de recrutement (38 pour un fantassin de base, 120 pour un fantassin d'élite, 648 pour un engin) ;
  - durée par unité : 10 % du temps de formation de base × 0,95^(niveau de Tente − 1). Garder 200 lits par niveau ;
  - soin immédiat : 1 / 2 / 3 / 3 or par unité (base / intermédiaire / élite / siège) ;
  - blessés en attente : leur faire payer l'entretien, ou limiter la file.
- Effet : une perte coûte 51 % du prix au lieu de 30 %. À la Tente 20, il faut 13,6 secondes par unité de base, et 15,1 heures pour 4 000 lits au lieu de 11 minutes. Les combats ont enfin un coût.
- Siège : soit corriger la fiche « État des systèmes », soit revenir à la règle du GDD (pas de soins du défenseur pendant le camp, soin à l'or compris).

**7. [À décider] Merveille cinq fois plus chère.**
- Changer : `world.wonderCostBase` de 50 000 / 50 000 / 50 000 / 15 000 à 250 000 / 250 000 / 250 000 / 75 000.
- Effet : la Merveille entière passe de 430,7 M à 2,15 G, dont 173 M pour les niveaux 1 à 50. Elle demande plusieurs jours de production d'une alliance.
- Préférer cela à `wonderCostFactor` 1,07 (2,04 G), qui met presque tout à la fin : 67 M pour les niveaux 1 à 50, 134 M pour le seul niveau 100.
- Chaque assaut des Immortels perdu retire 2 niveaux : le vrai coût est plus haut.
- À recaler après les recommandations 3 et 4 : des colonies plus lentes font des alliances moins riches au jour 150.

**8. [À décider] Immortels plus forts.**
- Changer :
  - `world.immortalSitePower` : 600 000 → 3 000 000 ;
  - `world.immortalPlanPower` : 900 000 → 4 500 000 ;
  - vague : 4 000 × niveau^1,35 → 20 000 × niveau^1,35, soit 3,93 M au niveau 50 et 10,0 M au niveau 100.
- Effet : un site demande 1,5 à 2 fois l'armée maximale d'un joueur occasionnel au jour 120. La vague du niveau 100 demande l'armée de plusieurs joueurs.
- À recaler après le passage au nouveau moteur (décision c) et après la recommandation 3 : les joueurs nourriront moins au jour 120.

**9. [À décider] Donjons d'invasion : comment suivre l'âge du monde.**
- La décision (d) reste. Seule la façon de mesurer l'âge est à choisir.
- La formule en cours d'ajout : le niveau 1 ne change jamais (chef à 60 000), le niveau 5 monte jusqu'à ×6 (chef à 13,8 M environ au jour 120).
- Ce que peut aligner un rassemblement de joueurs occasionnels : 13 000 à 22 000 au jour 14, 55 000 environ au jour 30, 1,2 à 1,4 M au jour 56.
- Le niveau 1 est donc hors de portée les deux premières semaines, puis trivial. Le niveau 5 devient de plus en plus inaccessible.
- Proposition : régler tous les niveaux sur une mesure prise sur le serveur, par exemple la puissance médiane des joueurs actifs, plutôt que sur une courbe fixe.
- Attention : avec ×2,5 par niveau, le chef du niveau 5 vaut 39 fois celui du niveau 1. Si le niveau 1 suit les joueurs, il faut aussi revoir ce ×2,5.

**10. [À décider] Ciblage des armées mélangées.**
- Option A : répartir les coups sur tous les paliers selon leur résistance. Les armées mélangées gagnent alors de 11 à 29 % (sauf chez les Huns).
- Option B : garder la règle du GDD (élites d'abord) et l'expliquer aux joueurs : une armée d'un seul palier est plus forte.

**11. [À décider] Pillage.**
- Option A : `combat.raidLootPctOfCarry` de 0,30 à 1,0, comme Travian. Une cavalerie de base ramène 65 à 70 par raid. Elle est rentable dès 1,7 à 1,85 raid par jour.
- Option B : garder 30 % et 24 h (valeurs du GDD), et présenter le raid comme du harcèlement, pas comme un revenu.
- Raccourcir seulement l'attente à 6 h ne suffit pas.

**12. [À décider] Plafonds des quêtes et des routes après la décision (a).**
- Option A (conseillée, car les ressources débordent déjà) : calculer ces deux plafonds sur le Dépôt et le Silo seuls, sans les Grands. Rien ne change pour les joueurs.
- Option B : accepter. Récompenses plafonnées à 320 000 au lieu de 80 000, routes à 53 333 par envoi au lieu de 13 333.

**13. [À décider] Emplacements de la capitale.**
- 27 bâtiments possibles pour 19 emplacements. Avec (a), le Grand Dépôt devient obligatoire pour la fin de partie. Au jour 119 de la simulation, les 12 capitales utilisent 19 emplacements sur 19.
- Choix : accepter qu'il prenne la place d'un autre bâtiment, ou ajouter des emplacements.
- Idée liée : donner un rôle aux niveaux 21 à 30 du Bâtiment principal, qui n'apportent aujourd'hui que de la population.

**14. [Correctif] Message « Dépôt trop petit ».**
- Quand une ressource du prix dépasse le stockage, afficher « Dépôt trop petit : niveau X requis » ou « Grand Dépôt niveau Y requis », au lieu de « Ressources insuffisantes ».
- Dans la fiche de la Chambre au Trésor, prévenir que ses niveaux 18 à 20 demandent un Grand Dépôt.

**15. [Correctif] Joueurs automatiques de la simulation (outil de test seulement).**
- Aujourd'hui, ils :
  - ne construisent jamais de Grand Dépôt, ni de Scierie, Tailleur de Pierre, Fonderie ou Boulangerie en capitale ;
  - s'arrêtent à la Chambre au Trésor 15 et à la Tente de soins 3 (les Thermes demandent 5) ;
  - gardent une marge de 95 % qui bloque des niveaux payables ;
  - ne fondent pas de troisième colonie, à cause d'un calcul faussé par leur pas de 6 h ;
  - ne se battent jamais entre joueurs : le module de guerre n'était pas chargé.
- Sans ces corrections, aucune simulation ne peut mesurer la décision (a) ni les recommandations 3 à 11.

**16. [Correctif] Documents périmés.**
- « État des systèmes » : le Grand Dépôt y est encore décrit comme « 3 600 → 600 000 protégés ». Le paragraphe sur les soins pendant un siège est faux.
- Deux commentaires du code sont faux : l'Agronomie y est notée à +1 % par niveau (la donnée vaut 0,5 %), et celui de la puissance des sites des Immortels.

---

## 7. Vérifié équilibré : ne pas toucher

- **Niveau général de l'entretien** (5 céréales par heure pour une unité de base) : une armée au plafond mange 37,5 à 42,8 % de la production, comme un village d'attaque de Travian.
- **Prix des unités du GDD** (125 / 225 / 400 ; cavalerie 160 / 288 / 512 ; engin 2 160) : les paliers se valent par ressource. À garder, comme le veut la décision (c).
- **Courbe du Dépôt et du Silo** (1 200 → 160 000), et valeurs de la décision (a) (3 600 → 480 000).
- **Silo** : pas besoin de l'agrandir, le Grand Silo suffit.
- **Production des champs** (4 500 par heure au niveau 20).
- **Prix de la recherche** : au plus 17,7 % du Dépôt 20 (Tactique 20 : 28 311 de fer).
- **Lots de recrutement** : ils tiennent dans le Dépôt 20.
- **Bastion** : rempli par convois. À 15 membres, chacun apporte 33 333 par ressource, soit 20,8 % d'un Dépôt 20.
- **Quêtes et boutique d'alliance** : une récompense qui ne tient pas dans la ville est refusée proprement.
- **Cachette** : elle protège jusqu'à 20 % du stock (niveau 20, ou niveau 18 pour la Gaule), comme le veut la décision (a).
- **Formation** : rythme cohérent, et réduction de 0,5 % par niveau de Caserne et d'Écurie (décision b).
- **Colons et Résidence, espions, engins de siège.**
- **Élite contre intermédiaire** : l'élite est meilleure par céréale dans les 18 lignes.
- **Bâtiments de bonus** : bon marché (Scierie 1 à 5 : 11 900 ; Moulin : 21 600 ; Boulangerie : 44 500). Leur vrai prix est l'emplacement. C'est bien ainsi.
- **Prix en nourriture de la Résidence et du Moulin** : valeurs du GDD, jouables.
- **Camps de tribus** : à garder, mais à revérifier si les champs deviennent plus chers.

---

## Annexe pour le développeur

- **Prix des champs (recommandation 3).** Le ×1,28 est recopié dans : `src/routes/cities.js` (buildCost), `src/services/questService.js` (buildCost des récompenses), `frontend/js/app/05-panels.js` (×1,28 et ×1,2 écrits en dur), les modules de `tools/sim/modules/` (10-economy, 20-alliance, 30-military, 40-market, 50-war), `simulate-2years.js`, `tools/simulate-research.cjs`, `tools/batiments-pdf.cjs`.
- **Temps (recommandation 4).** `tests/unit/research.test.js` exige que la recherche suive les multiplicateurs de construction : à adapter si la recherche reste à ×1,2.
- **Entretien (recommandation 5).** Aussi écrit en dur dans `frontend/js/app/01-core.js` et `frontend/js/app/10b-sheets.js`. `src/services/rankingService.js` pondère les points de combat par l'entretien.
- **Réception des ressources (recommandation 1).** `creditCity` dans `src/utils/db.js` : `GREATEST(x, LEAST(x + gain, max))` pour les 4 colonnes.
- **Vague des Immortels (recommandation 8).** `wavePower` dans `src/services/wonderService.js` (4 000 écrit en dur).
- **Plafonds après (a) (recommandation 12).** `rewardCap` dans `src/services/questService.js` et `routePct` dans `src/services/marketService.js`.
- **Soins (recommandation 6).** `config.wounded` et `src/services/woundedService.js`. Fiche périmée : `docs/ETAT-DES-SYSTEMES.md` (soins pendant un siège, Grand Dépôt « protégé »).
- **Simulation (recommandation 15).** `CAPITAL_SKIP` et `COLONY_SKIP` dans `tools/sim/modules/10-economy.cjs`. Ajouter `--modules=economy,military,war` pour mesurer les combats entre joueurs.

---

## Décisions appliquées le 30 octobre 2026

Décisions du propriétaire du jeu, prises le 30 octobre 2026 et appliquées le même jour (serveur, client, outils, documents).
Les règles sont décrites dans `docs/ETAT-DES-SYSTEMES.md` (« Économie, placement et stock partagé »), les chiffres dans
`docs/EQUILIBRAGE.md` § 14.

### Deux décisions nouvelles, hors des recommandations

- **Stock partagé entre les villes d'un joueur.** Chaque ville garde ce qu'elle produit, avec son propre plafond. Les
  constructions, les recrutements, la recherche, les soins, le héros et la fondation d'une ville se paient sur la somme des
  stocks de toutes les villes (la ville de l'action d'abord, puis celle qui en a le plus). L'entretien des troupes se paie
  sur tous les greniers ; la famine ne vient que quand ils sont tous vides. Toute unité formée ou soignée apparaît dans la
  capitale ; une colonie n'a pas de garnison propre. Pillage, raids, siège, cachette, marché et transports restent propres
  à chaque ville. L'idée de convois automatiques vers la capitale est abandonnée.
- **Placement des bâtiments.** 18 bâtiments sont réservés à la capitale et valent pour tout le joueur (Place de
  rassemblement, Académie, Tente de soins, Tour de guet, Caserne, Écurie, Atelier, Forge, Ambassade, Chambre au Trésor,
  Domus, Résidence, bâtiment de la civilisation) ; 10 sont réservés aux colonies (Moulin, Boulangerie, Scierie, Tailleur de
  pierre, Fonderie, Comptoir, Grand dépôt, Grand silo, Grande caserne, Grande écurie) ; Marché, Dépôt, Silo, Cachette, Mur,
  Bâtiment principal et champs vont partout. **Les Douves sont supprimées du jeu.**

### Recommandation par recommandation

| N° | Recommandation | Décision | Ce qui a été fait |
|---|---|---|---|
| 1 | Ne plus perdre de ressources à la réception | Appliquée | Une ville qui reçoit ne baisse jamais : `GREATEST(x, LEAST(x + gain, plafond))` dans `creditCity`. |
| 2 | Trésor des invasions | Appliquée (variante simple) | La part de chaque joueur va dans sa capitale, puis dans ses autres villes (`creditPlayer`) ; la notification dit ce qui a été versé et ce qui a été perdu faute de place. |
| 3 | Champs plus chers (× 1,45) | Appliquée | Ferme, Bûcheron, Carrière et Mine de fer coûtent × 1,45 par niveau, le reste × 1,28 ; un seul calcul (`buildCostFor`) pour le serveur, les quêtes, le client et les outils. |
| 4 | Champs et Bâtiment principal plus longs (V7b, × 1,30) | Appliquée | Temps × 1,30 par niveau pour ces 5 bâtiments, × 1,2 pour les autres ; la recherche reste à × 1,2. |
| 5 | Entretien 5 / 9 / 13 | Appliquée | 5 / 9 / 13, engins 15 ; les 8 retouches d'endurance du tableau sont faites. Mesure refaite : 3 intermédiaires restent sous leur base (Archer gaulois, Toxote, Cavalier du désert du Sultanat), à décider. |
| 6 | Soins payants et plus lents | Appliquée | 30 % du prix de recrutement ; 10 % du temps de formation × 0,95^(Tente − 1) par unité, les soins à la suite ; or 1 / 2 / 3 / 3 par unité ; les blessés qui attendent mangent. Une seule Tente, dans la capitale, pour tout le joueur ; les soignés rejoignent la capitale. Pendant un siège, les soins continuent ; la fiche « État des systèmes » est corrigée. |
| 7 | Merveille × 5 | Appliquée | 250 000 / 250 000 / 250 000 / 75 000 au niveau 1 ; la Merveille entière vaut 2,15 G. |
| 8 | Immortels plus forts | Appliquée | Site 3 M, plan 4,5 M, vague 20 000 × niveau^1,35. Un mur 20 sans défenseurs ne tient plus seul que jusqu'à la Merveille 2. |
| 9 | Donjons et âge du monde | Appliquée : force réglée sur les joueurs | Au lancement, avant-poste du niveau 1 = la moitié de la puissance médiane des joueurs actifs (3 000 au moins), × 1,8 par niveau ; notée sur l'invasion. Sous 5 joueurs mesurés, l'ancienne formule (âge du monde) reste. Le trésor garde l'âge du monde. |
| 10 | Ciblage des armées mélangées | Option A appliquée | Les coups de chaque round se répartissent sur toutes les lignes de soldats selon leur solidité ; les engins sont visés après les soldats. Mesure refaite : 25 % d'élite et 75 % de base gagnent de 36 à 42 % contre une armée de base pure à entretien 5 / 9 / 13, sans exception hunnique. |
| 11 | Pillage | Option B appliquée | 30 % et 24 h gardés (GDD) ; le raid est présenté comme du harcèlement dans le client (fenêtre de raid, carte) et les documents. |
| 12 | Plafonds des quêtes et des routes | Option A appliquée | Récompenses de quêtes et routes commerciales calculées sur le Dépôt et le Silo seuls (80 000 et 13 333 au plus). |
| 13 | Emplacements de la capitale | Réglée par le placement | La capitale n'a plus que 18 bâtiments possibles pour 19 emplacements (le Grand dépôt est un bâtiment des colonies) ; les gros prix se paient sur le stock de toutes les villes. Rôle des niveaux 21 à 30 du Bâtiment principal : toujours à décider. |
| 14 | Message « Dépôt trop petit » | Appliquée | « Ressources insuffisantes : il manque … (toutes vos villes comprises) », ou « Stockage trop petit (…) : il faut plus de capacité (Dépôt ou Silo, ou Grand dépôt / Grand silo dans une colonie) », affichés par le client. |
| 15 | Joueurs automatiques de la simulation | Appliquée (sauf le module de guerre) | Plan de construction lu dans les données (plus de liste à part, plus de Douves), coûts du serveur, paiement sur le stock de toutes les villes, plus de marge de 95 %, Grand dépôt et Grand silo en colonie, Chambre au Trésor et Tente de soins jusqu'au 20, soins payés, entretien sur tous les greniers. Troisième colonie : la Résidence 20 (130 668 de nourriture) se compare au stockage de toutes les villes moins l'entretien d'un pas, au lieu du seul grenier de la capitale moins 6 h d'entretien. Le module de guerre reste inachevé. |
| 16 | Documents périmés | Appliquée | « État des systèmes » (Grand dépôt, soins pendant un siège), commentaires du code (Agronomie à 0,5 % par niveau, puissance des Immortels) corrigés. |

### Ce qui reste à décider

- Les 3 intermédiaires encore sous leur base par céréale (Archer gaulois −1,9 %, Toxote −11,1 %, Cavalier du désert du
  Sultanat −31,0 %) : il faudrait +1, +3 et +14 d'endurance.
- Le rôle des niveaux 21 à 30 du Bâtiment principal (recommandation 13).
- Une nouvelle simulation longue (6 ans) avec ces règles, module de guerre compris, pour vérifier les dates de la partie 4.

