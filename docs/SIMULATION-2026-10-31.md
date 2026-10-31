<!-- Rapport brut de la simulation du 31 octobre 2026 (tools/sim/sim.cjs --days=180, 38 joueurs automatiques, commit 86b653a). Analyse : docs/RAPPORT-VERIFICATION-2026-10-31.md -->
# Simulation longue — rapport

- Durée simulée : **175 jours** (0.5 ans), pas de 6 h, 38 joueurs automatiques
- Appels au serveur : 289 493 ; erreurs serveur (5xx) : **0** ; erreurs écrites par le serveur : **0**
- Mondes joués : 1

## Contrôles (ce qui ne devrait jamais arriver)

| Contrôle | Jours touchés | Premier jour | Dernier jour | Max le même jour |
| --- | --- | --- | --- | --- |
| ressources au-dessus du stockage | 100 | 39 | 180 | 18 |

<details><summary>ressources au-dessus du stockage — exemple</summary>

```json
[
 {
  "id": "8c74a555-ac13-4d71-8398-ccb8c1e524ab",
  "name": "Colonie de Quintus 1",
  "wood": 185.2,
  "stone": 54,
  "iron": 383,
  "food": 2458,
  "maxStorage": 1000,
  "maxFoodStorage": 1000
 },
 {
  "id": "1efbb57b-b524-4e03-bc75-3b43b2da931a",
  "name": "Colonie de Toghrul 1",
  "wood": 3000,
  "stone": 3000,
  "iron": 3000,
  "food": 3000,
  "maxStorage": 1000,
  "maxFoodStorage": 1000
 }
]
```
</details>

## Erreurs du serveur

Aucune.

## Réponses 5xx

Aucune.

## Refus les plus fréquents (4xx)

Un refus peut être normal (ressources insuffisantes) ; un refus massif sur une action montre une règle mal comprise par les joueurs automatiques, ou un problème.

| Nombre | Route → réponse |
| --- | --- |
| 125 | `POST /api/army/:id/raid-resource -> 400 Aucun chemin terrestre vers cette destination` |
| 14 | `POST /api/rallies/:id/join -> 400 Votre armée n'arriverait pas à temps (N min de marche, départ dans N min)` |
| 6 | `POST /api/market/offer/:id/accept -> 400 Ville assiégée : aucun marchand ne passe` |

## Progression par civilisation (moyennes)

### Population

| Jour | EGYPT | GAUL | GREEK | HUN | ROME | SULTAN | Écart max/min |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 235 | 239 | 235 | 235 | 238 | 235 | 1.02 |
| 28 | 1 033 | 1 034 | 1 016 | 1 020 | 1 025 | 1 032 | 1.02 |
| 63 | 2 813 | 2 745 | 2 708 | 2 698 | 2 741 | 2 806 | 1.04 |
| 91 | 5 067 | 4 670 | 5 123 | 4 923 | 5 027 | 5 338 | 1.14 |
| 175 | 8 755 | 7 265 | 8 755 | 8 217 | 8 016 | 8 755 | 1.21 |

### Puissance militaire

| Jour | EGYPT | GAUL | GREEK | HUN | ROME | SULTAN | Écart max/min |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| 28 | 6 009 | 5 863 | 5 792 | 6 189 | 6 428 | 5 793 | 1.11 |
| 63 | 62 672 | 63 804 | 58 365 | 60 506 | 56 201 | 55 229 | 1.16 |
| 91 | 142 243 | 119 931 | 117 598 | 140 780 | 148 744 | 142 364 | 1.26 |
| 175 | 313 427 | 298 719 | 317 224 | 295 711 | 302 194 | 309 055 | 1.07 |

### Bâtiment principal (max)

| Jour | EGYPT | GAUL | GREEK | HUN | ROME | SULTAN | Écart max/min |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 3 | 3 | 3 | 3 | 3 | 3 | 1.00 |
| 28 | 9 | 9 | 8 | 8 | 9 | 9 | 1.13 |
| 63 | 19 | 18 | 18 | 18 | 18 | 18 | 1.06 |
| 91 | 20 | 20 | 20 | 20 | 20 | 20 | 1.00 |
| 175 | 20 | 20 | 20 | 20 | 20 | 20 | 1.00 |

### Villes

| Jour | EGYPT | GAUL | GREEK | HUN | ROME | SULTAN | Écart max/min |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 1 | 1 | 1 | 1 | 1 | 1 | 1.00 |
| 28 | 1 | 1 | 1 | 1 | 1 | 1 | 1.00 |
| 63 | 2 | 1,9 | 2 | 1,8 | 1,9 | 2 | 1.11 |
| 91 | 2,5 | 2,3 | 2,8 | 2,8 | 2,9 | 3 | 1.30 |
| 175 | 3 | 2,7 | 3 | 2,8 | 2,9 | 3 | 1.11 |

### Niveaux de recherche

| Jour | EGYPT | GAUL | GREEK | HUN | ROME | SULTAN | Écart max/min |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| 28 | 18 | 19 | 19 | 18 | 19 | 18 | 1.06 |
| 63 | 70 | 69 | 70 | 74 | 72 | 72 | 1.07 |
| 91 | 111 | 110 | 108 | 115 | 111 | 112 | 1.06 |
| 175 | 160 | 160 | 160 | 160 | 160 | 160 | 1.00 |

## Activité des systèmes (par semaine, moyenne sur la simulation)

| Système | Par semaine |
| --- | --- |
| Combats TRIBE | 430,4 |
| Combats RAID | 78,5 |
| Combats ATTACK | 14,5 |
| Combats ENCOUNTER | 9,9 |
| Combats HORDE | 7,5 |
| Combats NODE_FIGHT | 5 |
| Combats SIEGE_BREAK | 2,9 |
| Combats BASTION | 0,8 |
| Échanges au marché | 88,6 |
| Rapports d'espions | 483,2 |
| Messages | 19,2 |
| Aides d'alliance | 4 221,3 |
| Quêtes réclamées | 0 |
| Expéditions terminées | 111,2 |

Rassemblements : DONE 152, CANCELLED 37, MARCHING 1, GATHERING 1
Fin : 110 villes (72 colonies), Merveille niveau 0, invasions 29, donjons détruits 0, Bastions ACTIVE 2, médailles 1015

## Colonies

| Gisement | Colonies fondées |
| --- | --- |
| IRON niveau 1 | 34 |
| WOOD niveau 1 | 31 |
| STONE niveau 1 | 28 |
| FOOD niveau 1 | 25 |
| FOOD niveau 2 | 3 |
| WOOD niveau 2 | 2 |
| IRON niveau 2 | 1 |
| STONE niveau 2 | 1 |

| Colonie du joueur | Fondées | Jour médian |
| --- | --- | --- |
| n° 1 | 77 | 59 |
| n° 2 | 48 | 81 |

## Joueurs à la fin

| Joueur | Civilisation | Groupe | Population | Villes | Principal | Recherche | Puissance | Héros |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ruga | HUN | B | 8 755 | 3 | 20 | 160 | 311 852 | 24 |
| Saladin | SULTAN | A | 8 755 | 3 | 20 | 160 | 307 309 | 23 |
| Ambiorix | GAUL | A | 8 755 | 3 | 20 | 160 | 473 441 | 23 |
| Anvar | SULTAN | B | 8 755 | 3 | 20 | 160 | 320 326 | 23 |
| Djoser | EGYPT | C | 8 755 | 3 | 20 | 160 | 304 808 | 24 |
| Toghrul | SULTAN | C | 8 755 | 3 | 20 | 160 | 315 714 | 23 |
| Lysandre | GREEK | A | 8 755 | 3 | 20 | 160 | 320 380 | 23 |
| Thales | GREEK | A | 8 755 | 3 | 20 | 160 | 316 386 | 23 |
| Pericles | GREEK | B | 8 755 | 3 | 20 | 160 | 317 588 | 23 |
| Comm | GAUL | C | 8 755 | 3 | 20 | 160 | 342 722 | 23 |
| Litavic | GAUL | SOLO | 8 755 | 3 | 20 | 160 | 322 530 | 22 |
| Kilij | SULTAN | B | 8 755 | 3 | 20 | 160 | 270 202 | 23 |
| Aurelius | ROME | A | 8 755 | 3 | 20 | 160 | 326 795 | 23 |
| Kleon | GREEK | A | 8 755 | 3 | 20 | 160 | 318 858 | 24 |
| Septimus | ROME | B | 8 755 | 3 | 20 | 160 | 331 100 | 23 |
| Tiberius | ROME | B | 8 755 | 3 | 20 | 160 | 343 125 | 23 |
| Cassius | ROME | A | 8 755 | 3 | 20 | 160 | 324 525 | 23 |
| Flavius | ROME | A | 8 755 | 3 | 20 | 160 | 327 280 | 23 |
| Khafre | EGYPT | B | 8 755 | 3 | 20 | 160 | 310 220 | 22 |
| Vercassivel | GAUL | B | 8 755 | 3 | 20 | 160 | 324 501 | 23 |
| Senusret | EGYPT | A | 8 755 | 3 | 20 | 160 | 310 311 | 23 |
| Ahmose | EGYPT | B | 8 755 | 3 | 20 | 160 | 341 454 | 22 |
| Brennus | GAUL | A | 8 755 | 3 | 20 | 160 | 331 596 | 23 |
| Nebka | EGYPT | A | 8 755 | 3 | 20 | 160 | 310 339 | 22 |
| Baybars | SULTAN | A | 8 755 | 3 | 20 | 160 | 321 256 | 23 |
| Solon | GREEK | B | 8 755 | 3 | 20 | 160 | 319 737 | 22 |
| Quintus | ROME | SOLO | 8 755 | 3 | 20 | 160 | 334 970 | 22 |
| Imhotep | EGYPT | A | 8 755 | 3 | 20 | 160 | 303 428 | 23 |
| Bleda | HUN | A | 8 755 | 3 | 20 | 160 | 308 651 | 23 |
| Uldin | HUN | A | 8 755 | 3 | 20 | 160 | 302 776 | 23 |
| Agis | GREEK | C | 8 755 | 3 | 20 | 160 | 310 393 | 23 |
| Ellac | HUN | C | 8 755 | 3 | 20 | 160 | 308 090 | 23 |
| Qalawun | SULTAN | B | 8 755 | 3 | 20 | 160 | 319 522 | 23 |
| Oktar | HUN | B | 8 190 | 3 | 20 | 160 | 346 063 | 22 |
| Mundzuk | HUN | B | 6 090 | 2 | 20 | 160 | 196 835 | 22 |
| Dumnorix | GAUL | A | 3 675 | 2 | 20 | 160 | 134 063 | 21 |
| Marcellus | ROME | B | 3 580 | 2 | 20 | 160 | 127 560 | 21 |
| Orgetorix | GAUL | B | 3 405 | 2 | 20 | 160 | 162 183 | 20 |

## Derniers événements notables

- j167 invasion_end {"manual":false,"hordes":43,"destroyed":0,"byLevel":"L1 0/15 L2 0/12 L3 0/8 L4 0/5 L5 0/3","alliances":"","rallies":""}
- j168 colony_founded {"bot":"Mundzuk","faction":"HUN","city":"Colonie de Mundzuk 2","x":87,"y":4,"site":{"type":"FOOD","level":1,"bonusPct":10,"otherPct":-30},"colonies":2}
- j168 hero_summary {"step":672,"heroes":38,"avgLevel":22.5,"maxLevel":23,"fallen":0,"reviving":0,"leading":38,"inGarrison":0,"waiting":0,"onExpedition":16,"statPointsSpent":3458,"statPointsFree":4,"talentRanks":817,"tal
- j168 military_summary {"step":672,"tribeBattles":"WIN 2745","colonies":72,"colonySites":"FOOD1 19, IRON1 14, IRON2 1, STONE1 14, STONE2 1, WOOD1 23","units":94980,"fieldArmies":124,"harvesting":0,"wounded":2528,"starving":
- j168 market_summary {"step":672,"offers":"ACTIVE 1, CANCELLED 9, EXPIRED 117","sellers":0,"buyers":0,"tradedVolume":0,"merchantsWaiting":20,"merchantsOnRoad":"ROUTE 378 (19 trajets)","merchantsTotal":760,"routes":"en pau
- j168 war_summary {"step":672,"battles":"ATTACK:W 67, ATTACK:L 3, BASTION:L 7, RAID:W 589, RAID:L 16, SIEGE_BREAK:W 8, SIEGE_BREAK:L 9","spies":33,"spyReports":1529,"spyAlerts":1529,"engines":671,"sieged":0,"supportsSt
- j168 invasion_summary {"step":672,"final":false,"margin":1.08,"world":{"invasionsWeekend":24,"invasionsEnded":28,"manualStarted":4,"invasionsManual":4,"floorsCleared":118,"floorsL1":106,"repelled":16,"gone":6,"goneArmiesLo
- j168 colony_founded {"bot":"Dumnorix","faction":"GAUL","city":"Colonie de Dumnorix 1","x":-31,"y":-156,"site":{"type":"IRON","level":1,"bonusPct":10,"otherPct":-30},"colonies":1}
- j168 campaign {"alliance":"AQL","city":"Colonie de Mundzuk 2","owner":"Mundzuk","capital":false,"wall":0}
- j168 siege_wave {"alliance":"AQL","city":"Colonie de Mundzuk 2","owner":"Mundzuk","capital":false,"wave":"main","armies":3,"power":224059,"foe":167128,"engines":32,"soldiers":1153,"wall":null,"structure":1,"predicted
- j168 siege_wave {"alliance":"AQL","city":"Colonie de Mundzuk 2","owner":"Mundzuk","capital":false,"wave":"followUp","armies":3,"power":197233,"foe":167128,"engines":39,"soldiers":1152,"wall":null,"structure":0.63,"pr
- j169 city_fallen {"city":"Colonie de Mundzuk 2","owner":"Mundzuk","by":"Imhotep, Senusret, Saladin","camps":3,"fate":"RAZED","lives":2,"wallBroken":false}
- j169 campaign_end {"alliance":"AQL","city":"Colonie de Mundzuk 2","why":"tombée","waves":2,"wins":2,"losses":0}
- j169 bastion_rally {"alliance":"LUP","target":"AQL","leader":"Tiberius","armies":2,"capacity":25,"engines":26,"soldiers":795,"wallDamageEstimate":4738,"wallHp":200000}
- j170 campaign {"alliance":"AQL","city":"Colonie de Orgetorix 1","owner":"Orgetorix","capital":false,"wall":0}
- j170 colony_founded {"bot":"Marcellus","faction":"ROME","city":"Colonie de Marcellus 1","x":124,"y":33,"site":{"type":"IRON","level":1,"bonusPct":10,"otherPct":-30},"colonies":1}
- j170 bastion_assault {"by":"Tiberius, Solon","bastion":"Bastion [AQL]","won":false,"wallHpStart":200000,"wallHpEnd":197451,"lives":"10/10"}
- j170 siege_wave {"alliance":"AQL","city":"Colonie de Orgetorix 1","owner":"Orgetorix","capital":false,"wave":"main","armies":2,"power":209219,"foe":157251,"engines":14,"soldiers":1224,"wall":null,"structure":1,"predi
- j171 siege_wave {"alliance":"AQL","city":"Colonie de Orgetorix 1","owner":"Orgetorix","capital":false,"wave":"wounded","armies":2,"power":239167,"foe":152533,"engines":29,"soldiers":1374,"wall":null,"structure":0.85,
- j171 siege_wave {"alliance":"AQL","city":"Colonie de Orgetorix 1","owner":"Orgetorix","capital":false,"wave":"followUp","armies":2,"power":144174,"foe":152533,"engines":19,"soldiers":777,"wall":null,"structure":0.48,
- j172 city_fallen {"city":"Colonie de Orgetorix 1","owner":"Orgetorix","by":"Thales, Bleda","camps":2,"fate":"RAZED","lives":2,"wallBroken":false}
- j172 campaign_end {"alliance":"AQL","city":"Colonie de Orgetorix 1","why":"tombée","waves":3,"wins":3,"losses":0}
- j172 colony_founded {"bot":"Mundzuk","faction":"HUN","city":"Colonie de Mundzuk 2","x":87,"y":4,"site":{"type":"FOOD","level":1,"bonusPct":10,"otherPct":-30},"colonies":2}
- j172 invasion_start {"manual":false,"hordes":43,"endsAt":"2027-06-27T21:00:00.000Z"}
- j173 campaign {"alliance":"AQL","city":"Colonie de Mundzuk 2","owner":"Mundzuk","capital":false,"wall":0}
- j173 campaign_end {"alliance":"LUP","city":"Colonie de Nebka 2","why":"trop forte","waves":1,"wins":1,"losses":0}
- j174 siege_wave {"alliance":"AQL","city":"Colonie de Mundzuk 2","owner":"Mundzuk","capital":false,"wave":"main","armies":3,"power":312656,"foe":139212,"engines":35,"soldiers":1727,"wall":null,"structure":1,"predicted
- j174 siege_wave {"alliance":"AQL","city":"Colonie de Mundzuk 2","owner":"Mundzuk","capital":false,"wave":"followUp","armies":1,"power":167955,"foe":139212,"engines":10,"soldiers":950,"wall":null,"structure":0.63,"pre
- j174 campaign {"alliance":"LUP","city":"Colonie de Dumnorix 1","owner":"Dumnorix","capital":false,"wall":0}
- j174 siege_wave {"alliance":"LUP","city":"Colonie de Dumnorix 1","owner":"Dumnorix","capital":false,"wave":"main","armies":2,"power":266940,"foe":196124,"engines":47,"soldiers":1421,"wall":null,"structure":1,"predict
- j174 invasion_end {"manual":false,"hordes":43,"destroyed":0,"byLevel":"L1 0/15 L2 0/12 L3 0/8 L4 0/5 L5 0/3","alliances":"","rallies":""}
- j175 market_summary {"step":700,"offers":"ACTIVE 1, CANCELLED 8, EXPIRED 120","sellers":0,"buyers":0,"tradedVolume":0,"merchantsWaiting":19,"merchantsOnRoad":"ROUTE 360 (19 trajets)","merchantsTotal":760,"routes":"en pau
- j175 city_fallen {"city":"Colonie de Mundzuk 2","owner":"Mundzuk","by":"Nebka","camps":1,"fate":"RAZED","lives":2,"wallBroken":false}
- j175 campaign_end {"alliance":"AQL","city":"Colonie de Mundzuk 2","why":"tombée","waves":2,"wins":2,"losses":0}
- j175 siege_wave {"alliance":"LUP","city":"Colonie de Dumnorix 1","owner":"Dumnorix","capital":false,"wave":"followUp","armies":2,"power":338169,"foe":190240,"engines":56,"soldiers":1807,"wall":null,"structure":0.63,"
- j175 war_summary {"step":700,"battles":"ATTACK:W 72, BASTION:L 9, RAID:W 598, RAID:L 14, SIEGE_BREAK:W 4, SIEGE_BREAK:L 9","spies":33,"spyReports":1534,"spyAlerts":1534,"engines":674,"sieged":1,"supportsStationed":0,"
- j175 colony_founded {"bot":"Orgetorix","faction":"GAUL","city":"Colonie de Orgetorix 1","x":128,"y":103,"site":{"type":"IRON","level":1,"bonusPct":10,"otherPct":-30},"colonies":1}
- j175 city_fallen {"city":"Colonie de Dumnorix 1","owner":"Dumnorix","by":"Khafre, Vercassivel","camps":2,"fate":"RAZED","lives":2,"wallBroken":false}
- j175 campaign_end {"alliance":"LUP","city":"Colonie de Dumnorix 1","why":"tombée","waves":2,"wins":2,"losses":0}
- j176 campaign {"alliance":"AQL","city":"Colonie de Marcellus 1","owner":"Marcellus","capital":false,"wall":0}
- j176 bastion_rally {"alliance":"AQL","target":"LUP","leader":"Saladin","armies":3,"capacity":25,"engines":14,"soldiers":1245,"wallDamageEstimate":3189,"wallHp":200000}
- j176 campaign {"alliance":"LUP","city":"Colonie de Nebka 1","owner":"Nebka","capital":false,"wall":15}
- j176 bastion_assault {"by":"Saladin, Imhotep, Cassius","bastion":"Bastion [LUP]","won":false,"wallHpStart":200000,"wallHpEnd":198146,"lives":"10/10"}
- j176 siege_wave {"alliance":"AQL","city":"Colonie de Marcellus 1","owner":"Marcellus","capital":false,"wave":"main","armies":3,"power":196189,"foe":130985,"engines":26,"soldiers":1041,"wall":null,"structure":1,"predi
- j177 siege_wave {"alliance":"AQL","city":"Colonie de Marcellus 1","owner":"Marcellus","capital":false,"wave":"followUp","armies":2,"power":132858,"foe":127055,"engines":19,"soldiers":755,"wall":null,"structure":0.63,
- j177 city_fallen {"city":"Colonie de Marcellus 1","owner":"Marcellus","by":"Senusret, Lysandre","camps":2,"fate":"RAZED","lives":2,"wallBroken":false}
- j177 campaign_end {"alliance":"AQL","city":"Colonie de Marcellus 1","why":"tombée","waves":2,"wins":2,"losses":0}
- j178 colony_founded {"bot":"Mundzuk","faction":"HUN","city":"Colonie de Mundzuk 2","x":87,"y":4,"site":{"type":"FOOD","level":1,"bonusPct":10,"otherPct":-30},"colonies":2}
- j178 campaign {"alliance":"AQL","city":"Colonie de Mundzuk 2","owner":"Mundzuk","capital":false,"wall":0}
- j179 siege_wave {"alliance":"AQL","city":"Colonie de Mundzuk 2","owner":"Mundzuk","capital":false,"wave":"main","armies":2,"power":136141,"foe":119546,"engines":25,"soldiers":722,"wall":null,"structure":1,"predicted"
- j179 siege_wave {"alliance":"LUP","city":"Colonie de Nebka 1","owner":"Nebka","capital":false,"wave":"main","armies":4,"power":528650,"foe":168418,"engines":105,"soldiers":2798,"wall":18750,"structure":1,"predicted":
- j179 invasion_start {"manual":false,"hordes":43,"endsAt":"2027-07-04T21:00:00.000Z"}
- j179 siege_wave {"alliance":"AQL","city":"Colonie de Mundzuk 2","owner":"Mundzuk","capital":false,"wave":"followUp","armies":1,"power":148058,"foe":119546,"engines":12,"soldiers":788,"wall":null,"structure":0.63,"pre
- j179 bastion_siege {"alliance":"LUP","target":"AQL","by":"Tiberius","engines":25,"soldiers":639,"wallDamageEstimate":4556,"wallHp":200000}
- j180 hero_summary {"step":720,"heroes":38,"avgLevel":22.9,"maxLevel":24,"fallen":0,"reviving":0,"leading":38,"inGarrison":0,"waiting":0,"onExpedition":3,"statPointsSpent":3518,"statPointsFree":0,"talentRanks":832,"tale
- j180 military_summary {"step":720,"tribeBattles":"WIN 2864","colonies":72,"colonySites":"FOOD1 18, IRON1 14, IRON2 1, STONE1 15, STONE2 1, WOOD1 23","units":97689,"fieldArmies":124,"harvesting":1,"wounded":5667,"starving":
- j180 market_summary {"step":720,"offers":"ACTIVE 1, CANCELLED 8, EXPIRED 122","sellers":0,"buyers":0,"tradedVolume":0,"merchantsWaiting":20,"merchantsOnRoad":"ROUTE 378 (19 trajets)","merchantsTotal":760,"routes":"en pau
- j180 war_summary {"step":720,"battles":"ATTACK:W 79, BASTION:L 12, RAID:W 590, RAID:L 17, SIEGE_BREAK:W 4, SIEGE_BREAK:L 9","spies":33,"spyReports":1529,"spyAlerts":1529,"engines":668,"sieged":1,"supportsStationed":0,
- j180 invasion_summary {"step":720,"final":true,"margin":1.08,"world":{"invasionsWeekend":26,"invasionsEnded":29,"manualStarted":4,"invasionsManual":4,"floorsCleared":118,"floorsL1":106,"repelled":16,"gone":6,"goneArmiesLos
- j180 end {"step":720}
