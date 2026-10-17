# Équilibrage — vérification d'octobre 2026

Vérification de ce que le jeu applique réellement (code serveur) contre ce que les données annoncent, et lecture des
courbes. Chiffres tirés de `data/*.json` et `src/config/index.js` ; calculs reproductibles avec les commandes en fin de page.

## 1. Bonus de civilisation : définis, appliqués, et où

| Civilisation | Bonus (data/factions.json) | Appliqué dans | Verdict |
|---|---|---|---|
| Rome | +5 % défense des unités | tout combat (attaque de ville, pillage, tribu) | ✅ |
| Rome | −10 % pertes en siège (subies ou infligées) | attaques de ville (points de vie des unités romaines ×1,1, des deux côtés) ; pas en pillage | ✅ conforme à « en siège » |
| Gaule | +10 % défense chez soi | défense de ses villes, tout combat | ✅ |
| Gaule | +10 % cachette | part des ressources protégée des pillages | ✅ |
| Grèce | −10 % temps de construction | chaque construction | ✅ |
| Grèce | +10 % blessés au lieu de morts | taux de blessés après combat (+10 points) | ✅ |
| Égypte | +10 % transport | butin des pillages, envoi par armée, convois marchands | ✅ |
| Égypte | +20 % santé des murs | **corrigé** : portait sur le bonus de défense du mur (+1 %/niv. × 1,2) au lieu des points de vie ; porte désormais sur les points de vie du mur (1 200 PV/niv. au lieu de 1 000), en construction comme à la réparation | ✅ après correction |
| Huns | +15 % vitesse des armées | tout déplacement | ✅ |
| Huns | +5 % attaque en siège | attaques de ville | ✅ |
| Sultanat | +20 % dégâts des engins aux murs | points de mur abattus par les engins | ✅ |
| Sultanat | +10 % attaque en défendant sa ville | attaques de ville subies | ✅ |

Les cartes de l'inscription n'affichaient qu'un bonus sur deux par civilisation : elles montrent maintenant les deux.

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

**Point à décider : les unités d'élite sont moins rentables que les unités de base.**

| Palier (ex. infanterie romaine) | Coût | Puissance (atk + déf) × coef. | Puissance / 100 ressources | Puissance / céréale d'entretien | Temps |
|---|---|---|---|---|---|
| Base (Milicien) | 125 | 70 | 56 | 14,0 | 6 min |
| Intermédiaire (Triarii) | 225 | 127 | 56 | 12,7 | 10 min |
| Élite (Légionnaire) | 400 | 188 | 47 | 12,5 | 16 min |

Les coefficients de palier (×1,0 / ×1,1 / ×1,21) ne compensent ni le coût (×1,8 / ×3,2) ni l'entretien (5 / 10 / 15). Un joueur
qui optimise n'a aucune raison de former de l'élite, sauf la limite de place dans la file. Dans Travian et Rise of Kingdoms,
le palier supérieur coûte plus par unité mais vaut plus par unité d'entretien. Recommandation (données, sans toucher au code) :
coefficients de palier **1,0 / 1,25 / 1,55** dans `config.combat.tierCoefficients` → élite à 15,9 de puissance par céréale
(contre 14 pour la base) et 60 par 100 ressources ; le ciblage « l'élite est visée en premier » garde son sens.
Variante plus douce : entretien de l'élite ramené de 15 à 12.

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
- Mur : +1 % de défense par niveau (max +20 %) et 1 000 PV par niveau (1 200 pour l'Égypte) ; 25 catapultes abattent un niveau par assaut
  gagné. Le mur est volontairement modeste par rapport à Travian (+80 % au niveau 20) ; à relever si les défenseurs souffrent trop.

## 5. Combat

Triangle +20 % (infanterie > cavalerie > archers > infanterie), coefficients de palier, mur, douves (+0,5 %/niv.), bonus de ville
(Forge, Brasserie), héros plafonné à +5 %, pertes du perdant 30 %, butin ≤ 30 % du transport, cachette, stocks protégés : tous
vérifiés en place (`tests/unit/combat.test.js`, `tests/api-e2e.mjs`).

## 6. Commandes de contrôle

```
NODE_ENV=test JWT_SECRET=<32 car.> node -e "…"        # tableaux d'unités (voir l'historique de la vérification)
npm run test:unit && npm run test:e2e                   # règles de combat, économie, routes
```
