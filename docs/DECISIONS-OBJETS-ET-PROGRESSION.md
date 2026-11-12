# Décisions du propriétaire : système d'objets (F1-F16) et progression de fin de partie (H1-H10)

Réponses du propriétaire des 1er et 2 novembre 2026, reportées ici le 12 novembre 2026 : la première construction du système
d'objets (branche locale, jamais poussée) a été perdue avec l'environnement de travail. Ce document est la référence pour la
reconstruire. Les chiffres « conception » sont ceux du plan détaillé validé à l'époque (à reprendre tels quels sauf décision
contraire).

## Système d'objets du héros (F1-F16)

| | Décision |
|---|---|
| F1 | Les objets font progresser le héros **sous les plafonds** (+5 % par caractéristique pour l'équipement) ; les objets rares ajoutent de petits effets spéciaux plutôt que de la puissance brute. |
| F2 | **Exactement les 6 emplacements du cahier des charges** : arme, armure, casque, chaussures, monture, relique. Bouclier, jambières, anneau et amulette disparaissent (les objets existants de ces emplacements sont recyclés en matériaux de forge, avec un message). |
| F3 | **Monture** : vitesse seule, avec son propre plafond de +10 % (hors du plafond de 5 %). |
| F4 | **Relique** : petits effets spéciaux (XP, butin, moins de blessés, résurrection et expéditions plus courtes, or des expéditions), chacun avec son petit plafond. |
| F5 | **4 raretés** (Commun, Rare, Épique, Légendaire), environ 30 objets : 2 / 4 / 6 / 8 points par objet (1 point = +0,5 %), au moins un objet de chaque rareté par emplacement ; Épique et Légendaire ajoutent un petit effet spécial. |
| F6 | Niveau du héros requis : Commun 1, Rare 5, Épique 10, Légendaire 20. |
| F7 | **Sources contre le jeu seulement** : expéditions (source principale), petite chance sur les camps de tribus, donjons partagés selon les dégâts (plus seulement le dernier coup), boutique d'alliance (objets communs). Rien sur les raids, sièges, Bastion ou Merveille. |
| F8 | **Sac de 15 places** (l'équipement porté ne compte pas), consommables empilés ; un objet gagné sac plein attend 7 jours, puis devient des matériaux. |
| F9 | **Forge actuelle** : recycler un objet en matériaux ; fusionner 3 objets identiques en 1 de la rareté au-dessus ; le niveau de la Forge limite la fusion ; coût en ressources et un peu d'or. Pas de nouveau bâtiment. |
| F10 | **Aucune amélioration** d'objet (pas de +1 à +5, pas d'enchantement). |
| F11 | **Un seul consommable : « Déplacement de capitale »** (choix du nouvel emplacement, jamais pendant un siège, délai entre deux). Gagné en expéditions, donjons, boutique d'alliance. Ni eau ni ration. |
| F12 | Pas d'usure. |
| F13 | L'équipement ne change que si le **héros est vivant et son armée en ville** (corrige la faille du changement d'équipement pendant une marche). |
| F14 | Objets **liés au compte** : pas d'échange entre joueurs. |
| F15 | **Rien qui donne de la force contre de l'argent réel** (aucun objet, consommable ni or vendu ; au plus des tenues) ; règle « pas de pay-to-win » écrite. |
| F16 | Gardés des décisions antérieures : le héros tombé garde ses objets ; artefacts plus tard ; image d'attente tant que l'icône n'est pas livrée ; caractéristiques lues dans le catalogue par clé (un rééquilibrage touche les objets déjà possédés). |

### Chiffres de la conception validée

- **Catalogue** : 31 entrées. Arme, armure, casque, chaussures : 5 objets chacun (2 / 4 / 6 / 8 points selon la rareté) ;
  4 montures (+3 / +5 / +7 / +10 % de vitesse) ; 6 reliques ; le consommable `capital_move`. Les 8 objets gardés gardent leur
  clé et leur icône (`iron_sword`, `steel_sword`, `leather_armor`, `chain_mail`, `bronze_helm`, `iron_helm`, `iron_boots`,
  `war_boots`) ; `chest` devient `armor`. Équipement Légendaire complet : attaque 10, défense 10, vitesse 5, logistique 7
  points, donc le plafond de 5 % est atteint mais jamais dépassé.
- **Nouvelles clés** (23 icônes à dessiner) : hunting_spear, centurion_gladius, mars_blade, linothorax, lorica_segmentata,
  achilles_cuirass, leather_cap, crested_helm, conqueror_helm, marching_sandals, messenger_boots, winged_sandals, pack_mule,
  steppe_horse, war_horse, bucephalus, owl_charm, healer_salve, strategist_scroll, surgeon_kit, legion_eagle, golden_fleece,
  capital_move.
- **Plafonds des effets spéciaux** (talents + objets) : XP 15 %, butin 10 %, blessés 6 %, résurrection 15 %, durée des
  expéditions 15 %, or des expéditions 15 %.
- **Butin** : expéditions menées par le héros 20 / 25 / 30 / 35 % selon la difficulté ; Légendaire possible aux difficultés
  3 (1 %) et 4 (3 %) ; Déplacement de capitale 0,5 % / 1 % (difficultés 3 / 4). Camps de tribus 3 / 4 / 5 % selon le
  niveau. Donjons : chaque participant tire min(90 %, objets attendus × sa part des dégâts), objets attendus 1 / 1,5 / 2 /
  3 / 4 selon le niveau, part minimale 2 % ; le meilleur contributeur tire en plus un Déplacement de capitale (10 % / 20 %
  aux niveaux 4 / 5). Boutique d'alliance : 6 objets communs à 250 points, Déplacement de capitale à 3 000.
- **Sac** : 15 places, pile de 3 au plus pour le Déplacement de capitale, objets en attente : 30 au plus par héros.
- **Forge** (instantanée) : recyclage 2 / 6 / 18 / 54 matériaux (Forge 1) ; fusion vers Rare : Forge 5, 4 matériaux,
  5 or, 2 000 bois / pierre / fer et 1 000 céréales ; vers Épique : Forge 10, 12 matériaux, 15 or, 10 000 / 5 000 ; vers
  Légendaire : Forge 15, 36 matériaux, 40 or, 40 000 / 20 000. Matériaux : compteur du héros.
- **Déplacement de capitale** : le joueur choisit un côté de la carte (N / E / S / O, comme à l'inscription) ou un endroit
  près du Bastion de son alliance ; refusé si la capitale est assiégée, si une attaque ennemie arrive ou s'il lui manque des
  vies ; délai de 14 jours ; la ville, ses bâtiments et ses armées présentes déménagent, les armées en route reviennent au
  nouvel endroit, les colonies ne bougent pas, les offres du marché de la capitale sont annulées, les renforts alliés
  renvoyés.
- **Ordre des verrous** : villes du joueur (ordre des id), puis héros, puis armée, puis joueur.
- **Base** : migration `0035_systeme_objets` (idempotente) ; nouvelle table des objets en attente ; compteur `materials`
  du héros ; colonne `stats` des objets supprimée.

## Progression de fin de partie (H1-H10)

| | Décision |
|---|---|
| H1 | L'armée reste limitée **par la nourriture seulement** (ni solde, ni « quartiers »). |
| H2 | **Taille maximale d'une armée** : 2 000 + 150 par niveau de la Place de rassemblement de la capitale (5 000 au niveau 20) ; un engin compte 1 ; une armée déjà plus grosse garde ses soldats mais n'en prend plus ; affiché « n / max ». |
| H3 | Pas de rangs d'armée. |
| H4 | **Prêt de soldats (lot 2)** : une armée prêtée à un membre de l'alliance pour 12 h, 24 h, 48 h ou un rassemblement ; elle suit l'armée de l'allié dans les rassemblements (donjons, Immortels, Bastion) et « Briser le siège » seulement, **jamais pour défendre la ville de l'allié** ; 3 prêts par armée au plus, sous la taille maximale ; l'emprunteur paie 1 bois + 1 pierre + 1 fer par soldat et par heure ; le prêteur garde ses morts, ses blessés et sa part du trésor. |
| H5 | **Tout s'arrête au niveau 20** (bâtiments et technologies). |
| H6 | Pas de chantiers d'alliance au Bastion. |
| H7 | **Gloire et triomphes** (aucun pouvoir) : une fois par 20 h, dans les 24 h après une victoire de fin de partie, bouton « Triomphe » au Bâtiment principal ; petit triomphe 1,2 M → 1 200 Gloire + 600 XP du héros, grand triomphe 3 M → 4 500 Gloire + 1 500 XP ; livraisons à la Merveille : 2 Gloire pour 1 000 ressources ; classement, médailles, Panthéon, décors de ville à 50 000 / 150 000 / 300 000 Gloire ; jamais vendue. |
| H8 | Vagues, sites (3,0 M) et plans (5,75 M) : réglés après la troisième simulation, avec les armées plus grosses. |
| H9 | Ordre : **lot 1** = H2 + H7 + H10, puis la troisième simulation ; **lot 2** = H4, puis une nouvelle mesure. |
| H10 | **Abonnement Imperium Plus supprimé** (il vendait +5 % de production et +1 file de construction) : seules les tenues restent en vente. |
