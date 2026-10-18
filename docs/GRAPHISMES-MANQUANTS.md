# Graphismes manquants : chantiers, colons, villes secondaires, tribus, technologies, fiches

> La liste **complète** de tout ce qu'il faut graphiquement (tour de tous les écrans, état, ordre conseillé) est dans
> `docs/GRAPHISMES-COMPLET.md` ; ce document détaille les familles ajoutées en octobre 2026.

Liste demandée en octobre 2026, à jour des systèmes ajoutés ce mois-ci (villes secondaires, camps barbares, technologies).
Tout ce qui est ici est **enregistré dans le registre des images** (`tools/repaint/targets.cjs`) : les fichiers livrés sous
ces noms sont reconnus par `node tools/check-incoming.cjs art/incoming`, importés par `node tools/repaint.cjs --import=art/incoming`,
et **le jeu les affiche dès l'import** (accroches déjà en place dans le client, listées en § 7). Les prompts complets sont dans
`docs/PROMPTS-GRAPHIQUES.md` et le détail de chaque sujet dans `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` (sections citées).
La liste consolidée fichier par fichier reste `docs/A-GENERER.md` (étapes 9, 11 et 13 pour ce qui suit).

Rappels de format : style de `tools/repaint/style-ref.png`, fond transparent, aucun texte ; icônes et sprites 1024×1024 ;
vignettes 1536×1024 ; animations = une bande horizontale de N cases égales (512×768 en ville, 512×512 sur la carte).

## 1. Chantiers : chaque bâtiment en construction (guide § S10 et S11)

Aujourd'hui un bâtiment en travaux clignote, avec un marteau au-dessus. Trois couches, de la plus rapide à la plus complète :

| Couche | Fichiers | Nombre | Ce que ça change en jeu |
|---|---|---|---|
| **A. Échafaudages par civilisation** | `props/scaffold_<CIV>_<1|2|3>.png` (trois tailles : paliers 1-6, 7-13, 14-20) | 18 | posés sur tout bâtiment en amélioration, et sur tout nouveau bâtiment tant que son chantier (B) n'existe pas : **tous les chantiers sont habillés d'un coup** |
| **B. Chantier de chaque bâtiment** | `buildings/<CIV>/<CLÉ>_site.png` (28 bâtiments × 6 civilisations ; les bâtiments propres à une civilisation seulement chez elle) | 168 | affiché à la place du bâtiment pendant sa première construction |
| **B'. Champs et enceinte en chantier** | `fields/<forest|desert|snow>/<FARM|LUMBER|QUARRY|IRON_MINE>_site.png` ; `walls/<CIV>/site_<seg_x|seg_z|tower>.png` | 12 + 18 | parcelle en défrichage / labour / première taille / entrée de mine ; enceinte aux premières assises |
| **C. Ouvriers par civilisation** (animation A3) | `props/worker_<CIV>_<0..3>.png` (bande de 4 cases 512×768) | 24 | l'ouvrier frappe au marteau devant le chantier |

**Avis historique, une technique par civilisation** (c'est ce qui rend un chantier reconnaissable, plus que le bâtiment) :

- **Rome** : échafaudage de perches liées reposant dans des trous de boulin, grue à roue de cage (*polyspastos*) qui lève un
  bloc, murs de béton parementés de brique (*opus testaceum*) à mi-hauteur, cintre de bois sous un arc, auges de mortier
  de chaux, groma d'arpenteur, piles de tuiles et de blocs.
- **Gaule** : ossature de poteaux et poutres de chêne (lacis du *murus gallicus*), clayonnage en cours de torchis, lattis
  de toit qui attend son chaume, bottes de roseau, échelles et perches liées, herminettes, paniers de terre ; **pas de grue**.
- **Grèce** : chèvre de levage à poulie qui soulève un tambour de colonne par sa louve, tambours empilés, échafaudage de
  perches et planches, ciseaux et maillets, blocs aux bossages encore bruts, mur de marbre à mi-hauteur avec crampons.
- **Égypte** : rampe de terre et de gravats jusqu'aux murs à mi-hauteur, bloc sur traîneau tiré à la corde sur du limon
  mouillé, leviers et berceaux à bascule, léger échafaudage de roseaux pour les enduiseurs, briques crues qui sèchent au
  soleil, fil à plomb ; **pas de grue**.
- **Huns** : treillis de bois rond dressé et lié de lanières, panneaux de feutre et de peaux à moitié posés, palissade de
  rondins appointés, charrettes de perches et de feutre roulé, cordes et piquets, un cheval attaché ; **ni maçonnerie ni grue**.
- **Sultanat** : murs de brique cuite à mi-hauteur, cintre de bois sous un arc brisé, échafaudage de troncs de palmier liés
  de corde, palan, piles de carreaux émaillés turquoise et de panneaux de stuc, coupole sur coffrage.

Règles : même emprise et même silhouette que le bâtiment fini (le kit `node tools/repaint.cjs --kit=<dossier>` fournit son
rendu comme guide de cadrage), bâtiment à moitié construit (murs bas montés, étage et toit absents ou seulement charpentés),
deux ou trois ouvriers, matériaux au sol. Ordre conseillé : A (18), puis B pour les bâtiments les plus construits (Hôtel de
ville, Dépôt, Silo, Caserne, Marché, Académie, Résidence, Mur), puis le reste de B et B', puis C.

## 2. Colons et villes secondaires (guide § S9 et S12)

| Fichier | Nombre | Où ça s'affiche |
|---|---|---|
| `ui/settler.png` — icône du colon (villageois, baluchon au bout d'un bâton, piquet à fanion) | 1 | onglet Colons de la Résidence, carte d'armée (« 1 colon »), bouton « Fonder une ville », icône de mission |
| `map/units/settler.png` + `map/units/settler_<CIV>.png` — cortège de colons (chariot bâché à bœufs, famille à pied, homme au piquet à fanion), variante aux couleurs de chaque civilisation | 7 | l'armée partie fonder une ville, sur la carte (charrette du marchand en attendant) |
| `map/units/settler_walk_<0..5>.png` — cycle de marche du cortège (bande de 6 cases 512×512, animation A5) | 6 | même chose, animé |
| `map/camps/foundation.png`, `foundation_desert.png`, `foundation_snow.png` — campement de fondation (tentes, chariot, piquets et cordes, tranchée, feu, mât) | 3 | le point de ressource pendant les 24 h de fondation ; la bannière de la civilisation du fondateur est posée dessus par le code |
| `map/cities/colony_<rome|gaul|greek|egypt|hun|sultan>.png` — colonie fraîchement fondée (palissade basse, trois ou quatre maisons, puits, bannière) | 6 | les villes secondaires sur la carte (sprite de ville ordinaire sinon) |
| `busts/SETTLER_<CIV>.png` — portrait du colon, coiffe civile de sa civilisation | 6 | en-tête de l'onglet Colons et de la modale de fondation |
| `scenes/vignette-founding.png` — fondation d'une ville (chariot déchargé, piquet planté, libation, aube) | 1 | onglet Colons et modale (branché à la livraison) |

## 3. Barbares : les tribus des points de ressource (guide « Camps barbares » et § S14)

| Fichier | Nombre | Où ça s'affiche |
|---|---|---|
| `map/camps/camp<1|2|3>[_desert|_snow].png` — camp de la tribu selon le niveau du point et le biome | 9 | à la place de l'icône du point tant que la tribu le tient |
| `map/camps/ruins[_desert|_snow].png` — camp détruit | 3 | jusqu'à la réapparition de la tribu |
| `map/camps/banner_<CIV>.png` — bannière de la tribu (sa civilisation) | 6 | posée sur le camp, et sur le campement de fondation |
| `busts/TRIBE_<CIV>.png` — chef de la tribu (visage peint, fourrure, collier de dents) | 6 | rapports « Combat contre la tribu », bulle du point |
| `scenes/vignette-tribe-<forest|desert|snow>.png` — le camp de la tribu selon le biome | 3 | en tête des rapports de tribu (déjà branché) |
| `ui/tribe.png` — totem à crâne et massues croisées | 1 | bulle « Tribu locale » (déjà branché), rapports |

## 4. Technologies (guide § S6 et S8)

| Fichier | Nombre | Où ça s'affiche |
|---|---|---|
| `props/scroll_research.png` — parchemin « recherche en cours » | 1 | au-dessus de l'Académie pendant une recherche |
| `ui/tech_<AGRONOMY|ENGINEERING|TRAINING|TACTICS|DISCIPLINE|MEDICINE|CARTOGRAPHY|SUPPLY>.png` | 8 | cartes de l'onglet Recherche, fiches |
| `ui/branch_<ECONOMY|MILITARY|DEFENSE|LOGISTICS>.png` | 4 | en-têtes des branches |

## 5. Fiches d'information (guide § S15)

Les fiches de bâtiments montrent les trois paliers du bâtiment (`buildings/<CIV>/<CLÉ>`, `_t1`, `_t3`), les fiches d'unités la
figurine en pied (`figures/<CLASSE>_<CIV>`) et le jeton (`busts/<CLASSE>_<CIV>`), la fiche d'une technologie son icône.
Tout cela existe en rendu 3D : ce qui manque pour les fiches est la **version peinte** de ces images (`docs/A-GENERER.md`
étapes 1, 6 et 12 : 234 bâtiments courants, 24 figurines, 28 jetons, 468 paliers 1 et 3), plus les icônes de technologies
(§ 4), le portrait du colon et les chefs de tribu (§ 2 et § 3).

## 6. Récapitulatif et ordre conseillé

| Priorité | Lot | Images |
|---|---|---|
| 1 | Échafaudages par civilisation (chantiers habillés partout) | 18 |
| 2 | Camps barbares (9 + 3 + 6) | 18 |
| 3 | Colons : icône, cortège, campement de fondation, colonie | 1 + 7 + 3 + 6 = 17 |
| 4 | Technologies : parchemin et 12 icônes | 13 |
| 5 | Portraits : colons et chefs de tribu | 12 |
| 6 | Vignettes : fondation, camps de tribu | 4 |
| 7 | Icône tribu | 1 |
| 8 | Chantiers de chaque bâtiment, champs et enceinte en chantier | 168 + 12 + 18 = 198 |
| 9 | Animations : ouvriers (24), marche du cortège (6) | 30 |
| | **Total de cette liste** | **311** |

## 7. Ce qui est déjà branché dans le jeu (s'affiche dès l'import)

| Image | Accroche |
|---|---|
| `buildings/<CIV>/<CLÉ>_site`, `props/scaffold_<CIV>_<k>`, `fields/<biome>/<TYPE>_site` | `frontend/js/app/04-buildings-render.js` (`draw25DBuilding`), `03-fields-render.js` (`drawFieldSlot`), chemins dans `01-core.js` (`buildingSiteUrl`, `scaffoldUrl`, `fieldSiteUrl`) |
| `map/camps/camp*`, `ruins*`, `banner_*`, `foundation*` | `frontend/js/map.js` (`CAMP_SPRITES`, dessin des points) |
| `map/units/settler[_CIV]` | `map.js` (`armySpriteName`, repli charrette), serveur `src/routes/map.js` (`mainUnitSprite`) |
| `map/cities/colony_<civ>` | `map.js` (sprite de ville, `tile.isCapital === false`) |
| `busts/SETTLER_<CIV>` | `frontend/js/app/06c-colonies.js` (`settlerPortrait`) |
| `scenes/vignette-tribe-<biome>`, `ui/tribe` | `09-social.js` (rapports), `map.js` (bulle) |
| `ui/settler`, `ui/tech_*`, `ui/branch_*`, `props/scroll_research` | `06c-colonies.js`, `06b-research.js`, scène de ville |

À brancher à la livraison (petit travail de code) : `scenes/vignette-founding` (en-tête de l'onglet Colons), `busts/TRIBE_<CIV>`
dans les rapports, `walls/<CIV>/site_*` (enceinte en travaux), `props/worker_<CIV>_*` et `map/units/settler_walk_*` (animations,
comme les autres bandes du guide § 4).
