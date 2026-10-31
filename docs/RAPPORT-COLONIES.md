# Colonies : un vrai rôle, peu de clics

Étude du 30 octobre 2026 sur le rôle des colonies, avec les réponses du propriétaire. **Seules les décisions ci-dessous
s'appliquent** : l'étude (plus bas) proposait davantage, elle reste là pour mémoire. Ce que fait le jeu aujourd'hui :
`docs/ETAT-DES-SYSTEMES.md` (« Villes secondaires ») ; les chiffres à régler plus tard : `docs/EQUILIBRAGE.md` § 15 ; les
idées refusées gardées pour plus tard : `docs/BACKLOG.md`.

## Décisions du propriétaire (questionnaire du 30 octobre 2026)

| N° | Question de l'étude | Réponse | Ce qui est fait |
|---|---|---|---|
| 1 | Bonus de gisement | **Oui, +15 % par niveau du gisement** (1 à 3) | Sur la seule ressource du gisement (bois, pierre, fer ou céréales), en plus du +20 % des colonies, gardé. Ni la capitale ni la Ville Merveille. Affiché avant de fonder (bulle du gisement, panneau de fondation, « Sites libres ») et dans la ville. Donnée : `RESIDENCE.effects.colonyNodeBonusPctPerNodeLevel` = 15 |
| 2 | Bâtiment de faction de colonie | **Non** | Aucun nouveau bâtiment |
| 3 | Défense en plus (vie en plus au Mur 20, ou un Fort) | **Non** | Une colonie garde ses 2 vies (Égypte 3) |
| 4 | Ordres groupés par type de champ | **Non** | Un ordre par champ, comme avant |
| 5 | Gouverneur automatique | **Non** | Construction manuelle (GDD) |
| 6 | Emplacements | **« Mur sur l'enceinte »** | Le Mur a sa place fixe, l'emplacement 20 (`config.city.wallSlot`), hors de l'anneau 1-19 et des champs 101-118. On garde 19 emplacements autour du Bâtiment principal : capitale 17 bâtiments dans l'anneau (2 libres), colonie 14 (5 libres). Les Murs déjà bâtis et leurs chantiers sont passés sur l'emplacement 20 (migration `0031_colonies`). Le Mur se construit et s'ouvre en touchant l'enceinte |
| 7 | Recrutement des colonies depuis la capitale | **Oui** | « Lieu de formation » dans la Caserne et l'Écurie de la capitale (la capitale, et chaque colonie avec sa Grande caserne ou sa Grande écurie) ; le palier des unités et le temps viennent du bâtiment de la colonie choisie ; les unités arrivent dans la capitale. Toucher la Grande caserne ou la Grande écurie d'une colonie propose aussi « Recruter ». **Pas de relance automatique** |
| 8 | Ordre de prélèvement dans les autres villes | **La ville la plus pleine d'abord** | Après la ville de l'action, on prend dans la ville dont le stock est le plus haut par rapport à son plafond (Dépôt pour le bois, la pierre et le fer ; Silo pour les céréales), pour les dépenses et pour le manque d'entretien |

Aussi, pour « éviter la micro-gestion » (aide au suivi, sans changer les règles du jeu) :
- **Vue « Mes villes »** : une ligne par ville (gisement, 4 stocks avec « plein dans X h », file de construction avec « File
  vide » en rouge, recrutement, armées stationnées, vies, attaque en approche), et en tête les totaux du joueur et le bilan
  de nourriture commun.
- **Alertes** : « File de construction vide à [ville] » (au plus une par ville toutes les 6 h), « [ville] : dépôt plein dans
  1 h » (au plus une par ville toutes les 12 h), alerte de famine 12 h à l'avance sur le total du joueur (au lieu de 6 h).
- **Liste de construction d'une colonie** : les lignes « réservé à la capitale » repliées en une seule ligne.
- **Comptoir de commerce** : le meilleur Comptoir des colonies vaut pour toutes les villes (taxe et transport), sans somme.
- **Filtre « Sites libres »** sur la carte : type, niveau, bonus, temps de trajet depuis la capitale, force de la tribu.
- **Pas de garnison vide** créée pour une nouvelle colonie (pas de troupes propres en colonie).
- **Gisements** : vérifier qu'il y en a assez pour fonder (analyse dans `docs/BACKLOG.md`, le semis n'est pas changé).
- **Niveaux maximum** : rien ne change maintenant (Bâtiment principal 20 en colonie, 30 dans la capitale) ; le propriétaire
  veut revoir le niveau de tous les bâtiments pendant l'équilibrage (`docs/BACKLOG.md`).

**Ne pas faire** : colonie fondée avec ses champs, son Dépôt et son Silo offerts ; ordres groupés ; bâtiments de faction de
colonie ; Fort ; vie en plus ; gouverneur ; relance automatique du recrutement.

**Mise à jour du 31 octobre 2026** (décisions suivantes du propriétaire) : **2 colonies par joueur** au plus (la Résidence
forme le 1er colon au niveau 10 et le 2e au niveau 20 ; la Ville Merveille reste hors quota) et **2 000 joueurs par serveur**
(avant 5 000). L'étude ci-dessous raisonne encore avec 3 colonies et 5 000 joueurs.

## Rapport de l'étude (30 octobre 2026, pour mémoire)

### En bref
- Les colonies font tourner l'économie et nourrissent l'armée. La capitale reste la tête : armée, recherche, héros, alliance, or.
- Chaque colonie a sa spécialité : le **gisement** sur lequel elle est fondée lui donne un bonus. Le gisement est de bois, de pierre, de fer ou de céréales, et de niveau 1 à 3.
- **Un seul nouveau bâtiment** : le **bâtiment de faction de colonie**. Il en existe un par faction, avec 10 niveaux.
- Moins de clics :
  - un seul ordre pour monter tous les champs d'un même type ;
  - une colonie qui démarre avec ses champs déjà posés ;
  - une vue qui montre toutes les villes ;
  - des alertes utiles ;
  - le recrutement des colonies lancé depuis la capitale.
- **Emplacements** : on garde 19 emplacements autour du Bâtiment principal, donc 20 avec lui, comme le dit le GDD.
  - Capitale : 18 bâtiments, 1 emplacement libre.
  - Colonie : 16 bâtiments, 3 emplacements libres.

### Rappel de vos règles (tout part de là)
- Chaque ville garde ce qu'elle produit, dans son propre stock et avec son propre plafond.
- Construire, recruter, rechercher, soigner, le héros et fonder une ville se paient sur **la somme de toutes vos villes**. On prend d'abord dans la ville de l'action.
- L'entretien des troupes se paie sur **la somme de tous les greniers**. La famine n'arrive que si ce total est vide.
- Toute unité formée apparaît dans la capitale. Une colonie n'a pas de garnison propre : seules les armées qu'on y envoie la défendent.
- Raids, pillage, siège, cachette, marché et transports restent propres à chaque ville. Les routes commerciales entre vos villes ne changent pas.
- Les convois automatiques sont abandonnés. Tout ce qui ne servait qu'aux convois est retiré de ce projet.

### Le rôle des colonies

Chiffres avec tout au niveau 20.

| Rôle | Ce que la colonie apporte | Chiffres |
|---|---|---|
| 1. Production | Environ 80 % des ressources du joueur | Colonie : 129 630 par heure (plus avec le gisement). Capitale : 81 025 par heure. Avec 3 colonies : 388 890 sur 469 915 par heure. |
| 2. Grenier de l'armée | Le Moulin et la Boulangerie n'existent qu'en colonie. L'entretien se paie sur tous les greniers. | Céréales : capitale 27 010 par heure, colonie 48 612, jusqu'à 63 192 sur un gisement de céréales de niveau 3 |
| 3. Stockage | Un gros prix ne passe que si la capacité totale de vos villes est assez grande | Capitale seule : 160 000 par ressource. Chaque colonie ajoute 640 000 (Dépôt 20 + Grand dépôt 20). |
| 4. Formation rapide | La Grande caserne et la Grande écurie forment 2,25 fois plus vite. Les troupes arrivent dans la capitale. | 2 lignes de formation en plus par colonie |
| 5. Carte | Une colonie occupe un gisement. Les gisements de niveau 3 sont surtout au centre. | Le choix du site devient un vrai choix |

**Pourquoi vouloir 3 colonies.** Trois colonies donnent :
- 3 gisements différents ;
- 6 lignes de formation ;
- 3 fois plus de stockage ;
- 3 bâtiments de faction de colonie.

**Le prix à payer.** Chaque colonie est une cible : elle a 2 vies, son stock peut être pillé, et elle n'a pas de garnison.

### La spécialité : le gisement
- Le joueur la choisit une seule fois, en choisissant où fonder. Elle ne change jamais et ne demande aucun clic ensuite.
- Bonus : **+15 % par niveau du gisement, sur la ressource du gisement seulement**. Il s'ajoute au +20 % des colonies, qu'on garde.
- On ne peut toujours pas fonder sur un gisement d'or. La Ville Merveille n'a pas de bonus de gisement.

Production par heure, avec les champs au niveau 20 :

| Gisement | Bonus | Bois par heure (Scierie 5) | Céréales par heure (Moulin 5 + Boulangerie 5) |
|---|---|---|---|
| Aucun (aujourd'hui) | aucun | 27 006 | 48 612 |
| Niveau 1 | +15 % | 30 246 | 53 472 |
| Niveau 2 | +30 % | 33 486 | 58 332 |
| Niveau 3 | +45 % | 36 726 | 63 192 |

- Sur tout le compte, cela fait **+4 %** avec 3 gisements de niveau 2, et **+7 %** avec 3 gisements de niveau 3. L'équilibre du jeu tient.
- Le bonus est affiché avant de fonder, par exemple : « Gisement de fer niveau 3 : +45 % de fer dans une colonie ».

### Nouveau bâtiment : le bâtiment de faction de colonie
Le GDD prévoit 4 sortes de bâtiments : base, intermédiaire, avancé et faction. Les colonies ont tout, sauf un bâtiment de faction.

Votre bâtiment de faction actuel reste **dans la capitale seulement**. Celui-ci est un autre bâtiment, réservé aux colonies.

Règles communes aux 6 versions :
- colonie seulement ;
- 10 niveaux ;
- l'effet ne vaut que dans sa colonie ;
- il faut le Bâtiment principal 10 dans la colonie ;
- coût : environ 3 000 au niveau 1 et environ 116 000 pour les 10 niveaux ;
- environ 26 h de chantier, environ 10 h avec les réductions.

| Faction | Bâtiment | Effet (valeur au niveau 10) | Pourquoi (histoire) | Condition en plus |
|---|---|---|---|---|
| Rome | Quartier des vétérans | +2 % de défense par niveau pour les armées qui défendent cette colonie (+20 %) | Rome installait ses vétérans pour tenir une province | Mur 5 |
| Gaule | Oppidum | La Cachette de la colonie protège jusqu'à 30 % au lieu de 20 %. Le Mur a +2,5 % de points de vie par niveau (+25 %). | Les oppida étaient des refuges fortifiés | Cachette 5 |
| Grèce | Emporion | La taxe du marché du serveur baisse de 1,5 point par niveau dans cette colonie (−15), sans jamais passer sous 5 % | Les comptoirs grecs (Massalia, Naucratis) | Place du marché 10 |
| Égypte | Grenier du nome | Céréales de la colonie : +3 % par niveau (+30 %) | Les greniers d'État des nomes | Moulin 5 |
| Huns | Camp du tribut | Les 4 ressources de la colonie : +1 % par niveau (+10 %) | Les Huns vivaient du tribut des peuples soumis | Silo 10 |
| Sultanat | Caravansérail | Stockage de la colonie : +3 % par niveau (+30 %, donc 640 000 → 832 000) | Les entrepôts des villes caravanières | Dépôt 10 |

L'Égypte et les Huns gagnent exactement la même chose : +9 720 par heure et par colonie, avec les champs au niveau 20.

### Bâtiments modifiés

| Bâtiment | Changement | Pourquoi |
|---|---|---|
| Résidence | Elle porte le bonus de gisement (+15 % par niveau). Son texte l'explique. | C'est votre demande. Le bonus reste rangé avec les autres règles des colonies. |
| Mur (en colonie) | Au niveau 20, la colonie gagne une vie : 2 → 3 (Égypte 3 → 4). Nouveau texte : « Une colonie n'a pas de garnison propre : seuls le Mur et les armées qui y stationnent la défendent. » | Une défense qui marche sans troupes et sans nouveau bâtiment |
| Comptoir de commerce | Le meilleur Comptoir de vos colonies vaut pour toutes vos villes (taxe et capacité de transport). On ne fait pas la somme des niveaux. | Aujourd'hui, la capitale n'en profite jamais. Un seul Comptoir suffit, ce qui libère des emplacements. |
| Grande caserne et Grande écurie | Les troupes formées vont dans la capitale (déjà décidé). Les unités débloquées dépendent du niveau de la Grande caserne ou de la Grande écurie de la colonie, jamais de la Caserne de la capitale. Toucher le bâtiment propose « Recruter ». | Sinon, une colonie sans Grande caserne pourrait former l'élite |
| Dépôt, Silo, Grand dépôt, Grand silo (en colonie) | Aucun changement. Ils plafonnent le stock de la colonie et comptent dans la capacité totale. | Votre règle finale : chaque ville stocke ce qu'elle produit |
| Cachette (en colonie) | Aucun changement. Elle protège 20 % du stock de la colonie. | Les colonies ont de gros stocks et pas de garnison |
| Place du marché (en colonie) | Aucun changement. Ventes, transports et routes partent de la colonie. | Le marché reste propre à chaque ville (votre décision) |

Comme les convois sont abandonnés, il n'y a **plus besoin de redéfinir** le Dépôt, le Silo, la Cachette et le Marché des colonies.

### Moins de micro-gestion

| Outil | Ce que fait le joueur | Ce qu'il gagne |
|---|---|---|
| Ordre groupé par type de champ | « Monter les 4 Bûcherons au niveau 8 » : un seul ordre, payé en une fois, dont la durée est la somme des durées | Par colonie, les ordres de champs passent de 360 à 76. Au niveau 15, la file tient environ 6 h au lieu de 1 h 20. |
| Colonie prête à la fondation | Rien à faire : la colonie arrive avec ses 18 champs au niveau 1, le Dépôt 1 et le Silo 1 | 20 ordres de moins, et la colonie produit dès la première heure |
| Vue « Mes villes » | Un seul écran avec une ligne par ville : stocks, « plein dans 2 h », file vide en rouge, recrutement, armées, vies, attaque en approche | Plus besoin d'ouvrir chaque ville pour vérifier |
| Alertes | Le joueur reçoit : « File vide à [ville] », « [ville] : dépôt plein dans 1 h », et l'alerte famine 12 h à l'avance au lieu de 6 h. Les « Construction terminée » sont regroupées. | On réagit au lieu de vérifier, même avec 2 connexions par jour |
| Recruter depuis la capitale | Il choisit un « Lieu de formation » dans la Caserne ou l'Écurie de la capitale | 3 touches au lieu de 7 ou 8 |
| Liste de construction d'une colonie | Les quelque 13 lignes grises « réservé à la capitale » deviennent une seule ligne | Moins de défilement |
| Filtre « Sites libres » sur la carte | Il voit le type, le niveau, le bonus, la distance à la capitale et la force de la tribu | Le choix du site se fait sur un seul écran |
| Prélèvement plus malin (question 8) | Rien à faire : après la ville de l'action, on prend d'abord dans la ville la plus pleine par rapport à son Dépôt ou son Silo | Moins de production perdue entre deux connexions |

Au total, un compte complet (capitale + 3 colonies) passe d'environ **2 560 ordres à environ 1 400**.

### Ce qu'on ne fait pas, et pourquoi
- **Un gouverneur qui construit tout seul** : c'est contraire au GDD (« Construction manuelle uniquement »). La question 5 vous laisse trancher.
- **Une tour de défense avec des archers gratuits et immortels** : ce serait une garnison cachée, contraire à votre règle.
- **Une Cachette de colonie à 100 %** : les colonies deviendraient impossibles à piller, et tous les raids iraient sur la capitale.
- **Les convois, les échanges automatiques, un relais vers la Merveille** : ils reposent sur les convois automatiques, que vous avez abandonnés.
- **Des colonies limitées à 14 emplacements, avec un bouton « Démolir »** : c'est un casse-tête, et un piège pour le joueur occasionnel.
- **Un Fort qui baisse l'entretien de 20 %** : tout le monde garerait son armée dans une colonie.
- **Un bonus de gisement sur toutes les ressources, plus un palais** : +20 % sur tout le compte, ce qui défait l'équilibrage des champs.

### Emplacements

Dans toutes les villes, deux choses restent hors de l'anneau :
- le **Bâtiment principal**, sur l'emplacement 0 ;
- les **18 champs** : 4 Bûcherons, 4 Carrières de pierre, 4 Mines de fer et 6 Fermes.

**Capitale : 18 bâtiments**

| Bâtiments réservés à la capitale (13) | Bâtiments présents aussi dans les colonies (5) |
|---|---|
| Place de rassemblement, Académie, Tente de soins, Tour de guet, Caserne, Écurie, Atelier, Forge, Ambassade, Chambre au Trésor, Domus du Héros, Résidence, Bâtiment de faction (Thermes, Brasserie, Temple, Poste d'Irrigation, Tente de guerre ou Poste du Désert) | Place du marché, Dépôt, Silo, Cachette, Mur |

**Colonie : 16 bâtiments**

| Bâtiments présents aussi dans la capitale (5) | Bâtiments réservés aux colonies (11) |
|---|---|
| Place du marché, Dépôt, Silo, Cachette, Mur | Moulin, Boulangerie, Scierie, Tailleur de pierre, Fonderie, Comptoir de commerce, Grand dépôt, Grand silo, Grande caserne, Grande écurie, **Bâtiment de faction de colonie (nouveau)** |

| Ville | Bâtiments autour du Bâtiment principal | Emplacements | Libres |
|---|---|---|---|
| Capitale | 18 | 19 | 1 |
| Colonie | 16 | 19 | 3 |

**Recommandation : ne rien changer.**
- 19 emplacements plus le Bâtiment principal font 20, comme le GDD (« 20 emplacements max ») et comme le dessin de la ville.
- C'est le même nombre pour la capitale et pour les colonies.
- Si un jour la capitale manque de place, on mettra le Mur sur l'enceinte. Cela libère 1 emplacement dans chaque ville.

### Risques
- **Course aux gisements de céréales de niveau 3.** Avec 6 fermes, le bonus y pèse plus lourd, et une colonie égyptienne peut monter à environ 72 900 céréales par heure. Solution de repli : seulement +10 % par niveau pour les céréales.
- **Il risque de manquer de gisements.**
  - La carte en crée au plus environ 4 900, dont 13 % d'or. Il en reste environ 4 260 où l'on peut fonder, dont environ 720 de niveau 3.
  - La carte n'en ajoute pas quand le monde grandit, alors que 5 000 joueurs × 3 colonies demanderaient 15 000 gisements.
  - À vérifier avant l'ouverture.
- **Les ordres groupés font avancer plus vite** les joueurs qui se connectent peu. Il faut relancer la simulation « 2 connexions par jour ».
- **Les 6 bâtiments de faction de colonie sont difficiles à comparer**, surtout ceux de la Grèce, du Sultanat et de Rome. À vérifier en simulation.
- **Des colonies riches sans garnison attirent les raids.** Les garde-fous :
  - la Cachette à 20 % (30 % avec l'Oppidum) ;
  - le Mur, que seuls les engins de siège percent ;
  - les alertes d'attaque ;
  - la vie en plus au Mur 20.
- **Égypte** : une colonie égyptienne avec Mur 20 aura 4 vies, autant qu'une capitale normale.
- **Le bâtiment de faction de colonie** peut sembler aller contre votre règle « bâtiment de faction : capitale seulement ». C'est un autre bâtiment ; c'est la question 2.

### Ce qui reste à décider
1. Le chiffre du bonus de gisement.
2. Le bâtiment de faction de colonie : oui, non, ou une version commune à toutes les factions.
3. La défense passive : vie en plus au Mur 20, ou un bâtiment Fort.
4. Les ordres groupés pour les champs.
5. Le gouverneur automatique (non recommandé).
6. Le nombre d'emplacements.
7. Le recrutement depuis la capitale, et la relance automatique des lots.
8. L'ordre de prélèvement dans les autres villes.

Travail estimé : environ 7 à 9 jours, plus 6 modèles 3D (un bâtiment par faction).
