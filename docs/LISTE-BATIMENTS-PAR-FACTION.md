# Bâtiments à produire, civilisation par civilisation

Chaque civilisation affiche **34 bâtiments** : 33 communs et son bâtiment de faction. Les cinq bâtiments des autres
civilisations (Thermes, Brasserie, Temple, Poste d'irrigation, Tente de guerre, Poste du désert) ne sont jamais montrés
chez elle : inutile de les peindre pour elle.

Pour chaque bâtiment, trois images (1024×1024, fond transparent, cadre « building ») : **courant** (niveaux 7-13, fichier `CLÉ.png`),
**palier 1** (niveaux 1-6, `CLÉ_t1.png`, version petite et simple) et **palier 3** (niveaux 14-20, `CLÉ_t3.png`, version monumentale).
Soit 102 images par civilisation. Les versions enneigées (`_snow`) sont reportées. Les quatre champs (Ferme, Bûcheron, Carrière, Mine)
ont en plus leurs sprites de champ (`fields/…`), listés dans `docs/LISTE-GRAPHISMES.md`.

Prompt = style commun + consigne de cadrage + composition « building » + **sujet** ci-dessous + **architecture de la civilisation**
(voir `docs/PROMPTS-GRAPHIQUES.md` § 1 et § 4 ; le kit `node tools/repaint.cjs --kit=<dossier>` fournit le prompt complet et l'image guide de chaque fichier).
Ordre conseillé : celui du tableau (ce que le joueur construit et voit en premier). ✅ = déjà peint, ☐ = à produire.

Généré par `node tools/liste-graphismes.cjs`.

## Rome (`buildings/ROME/`) — 82 images à produire sur 102 (20 peintes)

Architecture à ajouter à chaque prompt : *Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae*

Orientation : entrée principale sur la face avant droite (sud-est), comme le guide 3D.

| # | Clé (fichier) | Bâtiment | Sujet (anglais, pour le prompt) | Débloqué par | Courant | _t1 | _t3 |
|---|---|---|---|---|---|---|---|
| 1 | `MAIN_HALL` | Bâtiment principal | the main hall, the seat of power of the city, with a banner on top | — | ✅ | ☐ | ☐ |
| 2 | `FARM` | Ferme | a wheat farm plot with golden crop rows | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 3 | `LUMBER` | Bûcheron | a lumber camp with trees and stacked logs | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 4 | `QUARRY` | Carrière de pierre | a stone quarry with big rocks | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 5 | `IRON_MINE` | Mine de fer | an iron mine entrance dug into a rock wall with a mine cart | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 6 | `WAREHOUSE` | Dépôt de ressources | a goods warehouse with crates and barrels at the door | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 7 | `SILO` | Silo à céréales | a round grain silo | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 8 | `RALLY_POINT` | Place de rassemblement | a military rally point: a tall flag on a paved square with torches and shields | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 9 | `BARRACKS` | Caserne | a military barracks with a training yard, weapon racks and a banner | Place de rassemblement 1, Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 10 | `MARKET` | Place du marché | a market stall with a striped awning, crates, pots, baskets of goods and a scale | Bâtiment principal 3, Silo à céréales 1, Dépôt de ressources 1 | ✅ | ☐ | ☐ |
| 11 | `ACADEMY` | Académie | an academy with columns and scrolls | Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 12 | `FORGE` | Forge | a blacksmith forge with a smoking chimney, an anvil and glowing embers | Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 13 | `STABLE` | Écurie | a horse stable with hay bales and a horse | Forge 3, Académie 5 | ✅ | ☐ | ☐ |
| 14 | `WALL` | Mur | a fortified city gate with two towers, torches and a heavy wooden door | Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 15 | `HEALING_TENT` | Tente de soins | a field hospital tent with a red cross banner | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 16 | `HIDEOUT` | Cachette | a hidden underground cache: a grassy mound with a small wooden trapdoor and bushes | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 17 | `WATCHTOWER` | Tour de Guet | a tall watchtower with a lookout platform and a torch | Bâtiment principal 1, Caserne 1 | ✅ | ☐ | ☐ |
| 18 | `EMBASSY` | Ambassade | an embassy with two different banners | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 19 | `HERO_MANSION` | Domus du Héros | the hero's mansion with a tower and a banner | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 20 | `RESIDENCE` | Résidence | a comfortable residence house with a garden | Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 21 | `WORKSHOP` | Atelier | a siege workshop with catapult parts, gears and a smoking chimney | Académie 10, Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 22 | `MILL` | Moulin | a windmill with four sails | Ferme 5 | ✅ | ☐ | ☐ |
| 23 | `SAWMILL` | Scierie | a sawmill with stacked logs and a saw | Bûcheron 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 24 | `STONEMASON` | Tailleur de Pierre | a stonemason's yard with cut stone blocks and tools | Carrière de pierre 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 25 | `FOUNDRY` | Fonderie | a foundry with two furnace chimneys | Mine de fer 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 26 | `BAKERY` | Boulangerie | a bakery with a stone oven, a smoking chimney and loaves of bread | Ferme 10, Bâtiment principal 5, Moulin 5 | ✅ | ☐ | ☐ |
| 27 | `TREASURE_CHAMBER` | Chambre au Trésor | a fortified treasure chamber in dark stone with torches and a heavy door | Bâtiment principal 10 | ✅ | ☐ | ☐ |
| 28 | `GREAT_SILO` | Grand Silo | two tall grain silos side by side | Bâtiment principal 10, Chambre au Trésor 5 | ☐ | ☐ | ☐ |
| 29 | `GREAT_WAREHOUSE` | Grand Dépôt | a large storehouse with crates and barrels | Bâtiment principal 10, Chambre au Trésor 5 | ☐ | ☐ | ☐ |
| 30 | `MOAT` | Douves | a ring-shaped moat filled with water around a small grassy island with a wooden footbridge | Bâtiment principal 10, Mur 5 | ☐ | ☐ | ☐ |
| 31 | `TRADE_OFFICE` | Comptoir de Commerce | a trade office with caravan goods, sacks and a cart | Place du marché 10, Bâtiment principal 10 | ☐ | ☐ | ☐ |
| 32 | `GREAT_BARRACKS` | Grande Caserne | a large barracks with two banners | Caserne 20 | ☐ | ☐ | ☐ |
| 33 | `GREAT_STABLE` | Grande Écurie | a large stable with horses | Écurie 20 | ☐ | ☐ | ☐ |
| 34 | `ROMAN_THERMAE` | Thermes | Roman baths with a pool of blue water and columns | Bâtiment principal 10, Tente de soins 5 | ✅ | ☐ | ☐ |

## Gaule (`buildings/GAUL/`) — 68 images à produire sur 102 (34 peintes)

Architecture à ajouter à chaque prompt : *Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels*

Orientation : entrée principale sur la face avant droite (sud-est), comme le guide 3D.

| # | Clé (fichier) | Bâtiment | Sujet (anglais, pour le prompt) | Débloqué par | Courant | _t1 | _t3 |
|---|---|---|---|---|---|---|---|
| 1 | `MAIN_HALL` | Bâtiment principal | the main hall, the seat of power of the city, with a banner on top | — | ✅ | ☐ | ☐ |
| 2 | `FARM` | Ferme | a wheat farm plot with golden crop rows | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 3 | `LUMBER` | Bûcheron | a lumber camp with trees and stacked logs | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 4 | `QUARRY` | Carrière de pierre | a stone quarry with big rocks | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 5 | `IRON_MINE` | Mine de fer | an iron mine entrance dug into a rock wall with a mine cart | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 6 | `WAREHOUSE` | Dépôt de ressources | a goods warehouse with crates and barrels at the door | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 7 | `SILO` | Silo à céréales | a round grain silo | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 8 | `RALLY_POINT` | Place de rassemblement | a military rally point: a tall flag on a paved square with torches and shields | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 9 | `BARRACKS` | Caserne | a military barracks with a training yard, weapon racks and a banner | Place de rassemblement 1, Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 10 | `MARKET` | Place du marché | a market stall with a striped awning, crates, pots, baskets of goods and a scale | Bâtiment principal 3, Silo à céréales 1, Dépôt de ressources 1 | ✅ | ☐ | ☐ |
| 11 | `ACADEMY` | Académie | an academy with columns and scrolls | Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 12 | `FORGE` | Forge | a blacksmith forge with a smoking chimney, an anvil and glowing embers | Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 13 | `STABLE` | Écurie | a horse stable with hay bales and a horse | Forge 3, Académie 5 | ✅ | ☐ | ☐ |
| 14 | `WALL` | Mur | a fortified city gate with two towers, torches and a heavy wooden door | Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 15 | `HEALING_TENT` | Tente de soins | a field hospital tent with a red cross banner | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 16 | `HIDEOUT` | Cachette | a hidden underground cache: a grassy mound with a small wooden trapdoor and bushes | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 17 | `WATCHTOWER` | Tour de Guet | a tall watchtower with a lookout platform and a torch | Bâtiment principal 1, Caserne 1 | ✅ | ☐ | ☐ |
| 18 | `EMBASSY` | Ambassade | an embassy with two different banners | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 19 | `HERO_MANSION` | Domus du Héros | the hero's mansion with a tower and a banner | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 20 | `RESIDENCE` | Résidence | a comfortable residence house with a garden | Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 21 | `WORKSHOP` | Atelier | a siege workshop with catapult parts, gears and a smoking chimney | Académie 10, Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 22 | `MILL` | Moulin | a windmill with four sails | Ferme 5 | ✅ | ☐ | ☐ |
| 23 | `SAWMILL` | Scierie | a sawmill with stacked logs and a saw | Bûcheron 10, Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 24 | `STONEMASON` | Tailleur de Pierre | a stonemason's yard with cut stone blocks and tools | Carrière de pierre 10, Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 25 | `FOUNDRY` | Fonderie | a foundry with two furnace chimneys | Mine de fer 10, Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 26 | `BAKERY` | Boulangerie | a bakery with a stone oven, a smoking chimney and loaves of bread | Ferme 10, Bâtiment principal 5, Moulin 5 | ✅ | ☐ | ☐ |
| 27 | `TREASURE_CHAMBER` | Chambre au Trésor | a fortified treasure chamber in dark stone with torches and a heavy door | Bâtiment principal 10 | ✅ | ☐ | ☐ |
| 28 | `GREAT_SILO` | Grand Silo | two tall grain silos side by side | Bâtiment principal 10, Chambre au Trésor 5 | ✅ | ☐ | ☐ |
| 29 | `GREAT_WAREHOUSE` | Grand Dépôt | a large storehouse with crates and barrels | Bâtiment principal 10, Chambre au Trésor 5 | ✅ | ☐ | ☐ |
| 30 | `MOAT` | Douves | a ring-shaped moat filled with water around a small grassy island with a wooden footbridge | Bâtiment principal 10, Mur 5 | ✅ | ☐ | ☐ |
| 31 | `TRADE_OFFICE` | Comptoir de Commerce | a trade office with caravan goods, sacks and a cart | Place du marché 10, Bâtiment principal 10 | ✅ | ☐ | ☐ |
| 32 | `GREAT_BARRACKS` | Grande Caserne | a large barracks with two banners | Caserne 20 | ✅ | ☐ | ☐ |
| 33 | `GREAT_STABLE` | Grande Écurie | a large stable with horses | Écurie 20 | ✅ | ☐ | ☐ |
| 34 | `GALLIC_BREWERY` | Brasserie | a Gallic brewery with barrels and a smoking chimney | Bâtiment principal 10, Ferme 10 | ✅ | ☐ | ☐ |

## Grèce (`buildings/GREEK/`) — 98 images à produire sur 102 (4 peintes)

Architecture à ajouter à chaque prompt : *Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae*

Orientation : entrée principale sur la face avant droite (sud-est), comme le guide 3D.

| # | Clé (fichier) | Bâtiment | Sujet (anglais, pour le prompt) | Débloqué par | Courant | _t1 | _t3 |
|---|---|---|---|---|---|---|---|
| 1 | `MAIN_HALL` | Bâtiment principal | the main hall, the seat of power of the city, with a banner on top | — | ☐ | ☐ | ☐ |
| 2 | `FARM` | Ferme | a wheat farm plot with golden crop rows | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 3 | `LUMBER` | Bûcheron | a lumber camp with trees and stacked logs | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 4 | `QUARRY` | Carrière de pierre | a stone quarry with big rocks | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 5 | `IRON_MINE` | Mine de fer | an iron mine entrance dug into a rock wall with a mine cart | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 6 | `WAREHOUSE` | Dépôt de ressources | a goods warehouse with crates and barrels at the door | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 7 | `SILO` | Silo à céréales | a round grain silo | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 8 | `RALLY_POINT` | Place de rassemblement | a military rally point: a tall flag on a paved square with torches and shields | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 9 | `BARRACKS` | Caserne | a military barracks with a training yard, weapon racks and a banner | Place de rassemblement 1, Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 10 | `MARKET` | Place du marché | a market stall with a striped awning, crates, pots, baskets of goods and a scale | Bâtiment principal 3, Silo à céréales 1, Dépôt de ressources 1 | ☐ | ☐ | ☐ |
| 11 | `ACADEMY` | Académie | an academy with columns and scrolls | Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 12 | `FORGE` | Forge | a blacksmith forge with a smoking chimney, an anvil and glowing embers | Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 13 | `STABLE` | Écurie | a horse stable with hay bales and a horse | Forge 3, Académie 5 | ☐ | ☐ | ☐ |
| 14 | `WALL` | Mur | a fortified city gate with two towers, torches and a heavy wooden door | Bâtiment principal 3 | ☐ | ☐ | ☐ |
| 15 | `HEALING_TENT` | Tente de soins | a field hospital tent with a red cross banner | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 16 | `HIDEOUT` | Cachette | a hidden underground cache: a grassy mound with a small wooden trapdoor and bushes | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 17 | `WATCHTOWER` | Tour de Guet | a tall watchtower with a lookout platform and a torch | Bâtiment principal 1, Caserne 1 | ☐ | ☐ | ☐ |
| 18 | `EMBASSY` | Ambassade | an embassy with two different banners | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 19 | `HERO_MANSION` | Domus du Héros | the hero's mansion with a tower and a banner | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 20 | `RESIDENCE` | Résidence | a comfortable residence house with a garden | Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 21 | `WORKSHOP` | Atelier | a siege workshop with catapult parts, gears and a smoking chimney | Académie 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 22 | `MILL` | Moulin | a windmill with four sails | Ferme 5 | ☐ | ☐ | ☐ |
| 23 | `SAWMILL` | Scierie | a sawmill with stacked logs and a saw | Bûcheron 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 24 | `STONEMASON` | Tailleur de Pierre | a stonemason's yard with cut stone blocks and tools | Carrière de pierre 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 25 | `FOUNDRY` | Fonderie | a foundry with two furnace chimneys | Mine de fer 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 26 | `BAKERY` | Boulangerie | a bakery with a stone oven, a smoking chimney and loaves of bread | Ferme 10, Bâtiment principal 5, Moulin 5 | ✅ | ☐ | ☐ |
| 27 | `TREASURE_CHAMBER` | Chambre au Trésor | a fortified treasure chamber in dark stone with torches and a heavy door | Bâtiment principal 10 | ☐ | ☐ | ☐ |
| 28 | `GREAT_SILO` | Grand Silo | two tall grain silos side by side | Bâtiment principal 10, Chambre au Trésor 5 | ☐ | ☐ | ☐ |
| 29 | `GREAT_WAREHOUSE` | Grand Dépôt | a large storehouse with crates and barrels | Bâtiment principal 10, Chambre au Trésor 5 | ☐ | ☐ | ☐ |
| 30 | `MOAT` | Douves | a ring-shaped moat filled with water around a small grassy island with a wooden footbridge | Bâtiment principal 10, Mur 5 | ☐ | ☐ | ☐ |
| 31 | `TRADE_OFFICE` | Comptoir de Commerce | a trade office with caravan goods, sacks and a cart | Place du marché 10, Bâtiment principal 10 | ☐ | ☐ | ☐ |
| 32 | `GREAT_BARRACKS` | Grande Caserne | a large barracks with two banners | Caserne 20 | ☐ | ☐ | ☐ |
| 33 | `GREAT_STABLE` | Grande Écurie | a large stable with horses | Écurie 20 | ☐ | ☐ | ☐ |
| 34 | `GREEK_TEMPLE` | Temple | a Greek temple with fluted columns and a pediment | Bâtiment principal 10, Académie 10 | ☐ | ☐ | ☐ |

## Égypte (`buildings/EGYPT/`) — 68 images à produire sur 102 (34 peintes)

Architecture à ajouter à chaque prompt : *Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks*

Orientation : entrée principale sur la face avant droite (sud-est), comme le guide 3D.

| # | Clé (fichier) | Bâtiment | Sujet (anglais, pour le prompt) | Débloqué par | Courant | _t1 | _t3 |
|---|---|---|---|---|---|---|---|
| 1 | `MAIN_HALL` | Bâtiment principal | the main hall, the seat of power of the city, with a banner on top | — | ✅ | ☐ | ☐ |
| 2 | `FARM` | Ferme | a wheat farm plot with golden crop rows | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 3 | `LUMBER` | Bûcheron | a lumber camp with trees and stacked logs | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 4 | `QUARRY` | Carrière de pierre | a stone quarry with big rocks | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 5 | `IRON_MINE` | Mine de fer | an iron mine entrance dug into a rock wall with a mine cart | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 6 | `WAREHOUSE` | Dépôt de ressources | a goods warehouse with crates and barrels at the door | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 7 | `SILO` | Silo à céréales | a round grain silo | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 8 | `RALLY_POINT` | Place de rassemblement | a military rally point: a tall flag on a paved square with torches and shields | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 9 | `BARRACKS` | Caserne | a military barracks with a training yard, weapon racks and a banner | Place de rassemblement 1, Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 10 | `MARKET` | Place du marché | a market stall with a striped awning, crates, pots, baskets of goods and a scale | Bâtiment principal 3, Silo à céréales 1, Dépôt de ressources 1 | ✅ | ☐ | ☐ |
| 11 | `ACADEMY` | Académie | an academy with columns and scrolls | Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 12 | `FORGE` | Forge | a blacksmith forge with a smoking chimney, an anvil and glowing embers | Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 13 | `STABLE` | Écurie | a horse stable with hay bales and a horse | Forge 3, Académie 5 | ✅ | ☐ | ☐ |
| 14 | `WALL` | Mur | a fortified city gate with two towers, torches and a heavy wooden door | Bâtiment principal 3 | ✅ | ☐ | ☐ |
| 15 | `HEALING_TENT` | Tente de soins | a field hospital tent with a red cross banner | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 16 | `HIDEOUT` | Cachette | a hidden underground cache: a grassy mound with a small wooden trapdoor and bushes | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 17 | `WATCHTOWER` | Tour de Guet | a tall watchtower with a lookout platform and a torch | Bâtiment principal 1, Caserne 1 | ✅ | ☐ | ☐ |
| 18 | `EMBASSY` | Ambassade | an embassy with two different banners | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 19 | `HERO_MANSION` | Domus du Héros | the hero's mansion with a tower and a banner | Bâtiment principal 1 | ✅ | ☐ | ☐ |
| 20 | `RESIDENCE` | Résidence | a comfortable residence house with a garden | Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 21 | `WORKSHOP` | Atelier | a siege workshop with catapult parts, gears and a smoking chimney | Académie 10, Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 22 | `MILL` | Moulin | a windmill with four sails | Ferme 5 | ✅ | ☐ | ☐ |
| 23 | `SAWMILL` | Scierie | a sawmill with stacked logs and a saw | Bûcheron 10, Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 24 | `STONEMASON` | Tailleur de Pierre | a stonemason's yard with cut stone blocks and tools | Carrière de pierre 10, Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 25 | `FOUNDRY` | Fonderie | a foundry with two furnace chimneys | Mine de fer 10, Bâtiment principal 5 | ✅ | ☐ | ☐ |
| 26 | `BAKERY` | Boulangerie | a bakery with a stone oven, a smoking chimney and loaves of bread | Ferme 10, Bâtiment principal 5, Moulin 5 | ✅ | ☐ | ☐ |
| 27 | `TREASURE_CHAMBER` | Chambre au Trésor | a fortified treasure chamber in dark stone with torches and a heavy door | Bâtiment principal 10 | ✅ | ☐ | ☐ |
| 28 | `GREAT_SILO` | Grand Silo | two tall grain silos side by side | Bâtiment principal 10, Chambre au Trésor 5 | ✅ | ☐ | ☐ |
| 29 | `GREAT_WAREHOUSE` | Grand Dépôt | a large storehouse with crates and barrels | Bâtiment principal 10, Chambre au Trésor 5 | ✅ | ☐ | ☐ |
| 30 | `MOAT` | Douves | a ring-shaped moat filled with water around a small grassy island with a wooden footbridge | Bâtiment principal 10, Mur 5 | ✅ | ☐ | ☐ |
| 31 | `TRADE_OFFICE` | Comptoir de Commerce | a trade office with caravan goods, sacks and a cart | Place du marché 10, Bâtiment principal 10 | ✅ | ☐ | ☐ |
| 32 | `GREAT_BARRACKS` | Grande Caserne | a large barracks with two banners | Caserne 20 | ✅ | ☐ | ☐ |
| 33 | `GREAT_STABLE` | Grande Écurie | a large stable with horses | Écurie 20 | ✅ | ☐ | ☐ |
| 34 | `EGYPTIAN_IRRIGATION` | Poste d'Irrigation | irrigation channels of blue water crossing green crops, with a shaduf | Bâtiment principal 10, Ferme 10 | ✅ | ☐ | ☐ |

## Huns (`buildings/HUN/`) — 102 images à produire sur 102 (0 peintes)

Architecture à ajouter à chaque prompt : *Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires*

Orientation : entrée principale sur la face avant droite (sud-est), comme le guide 3D.

| # | Clé (fichier) | Bâtiment | Sujet (anglais, pour le prompt) | Débloqué par | Courant | _t1 | _t3 |
|---|---|---|---|---|---|---|---|
| 1 | `MAIN_HALL` | Bâtiment principal | the main hall, the seat of power of the city, with a banner on top | — | ☐ | ☐ | ☐ |
| 2 | `FARM` | Ferme | a wheat farm plot with golden crop rows | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 3 | `LUMBER` | Bûcheron | a lumber camp with trees and stacked logs | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 4 | `QUARRY` | Carrière de pierre | a stone quarry with big rocks | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 5 | `IRON_MINE` | Mine de fer | an iron mine entrance dug into a rock wall with a mine cart | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 6 | `WAREHOUSE` | Dépôt de ressources | a goods warehouse with crates and barrels at the door | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 7 | `SILO` | Silo à céréales | a round grain silo | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 8 | `RALLY_POINT` | Place de rassemblement | a military rally point: a tall flag on a paved square with torches and shields | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 9 | `BARRACKS` | Caserne | a military barracks with a training yard, weapon racks and a banner | Place de rassemblement 1, Bâtiment principal 3 | ☐ | ☐ | ☐ |
| 10 | `MARKET` | Place du marché | a market stall with a striped awning, crates, pots, baskets of goods and a scale | Bâtiment principal 3, Silo à céréales 1, Dépôt de ressources 1 | ☐ | ☐ | ☐ |
| 11 | `ACADEMY` | Académie | an academy with columns and scrolls | Bâtiment principal 3 | ☐ | ☐ | ☐ |
| 12 | `FORGE` | Forge | a blacksmith forge with a smoking chimney, an anvil and glowing embers | Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 13 | `STABLE` | Écurie | a horse stable with hay bales and a horse | Forge 3, Académie 5 | ☐ | ☐ | ☐ |
| 14 | `WALL` | Mur | a fortified city gate with two towers, torches and a heavy wooden door | Bâtiment principal 3 | ☐ | ☐ | ☐ |
| 15 | `HEALING_TENT` | Tente de soins | a field hospital tent with a red cross banner | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 16 | `HIDEOUT` | Cachette | a hidden underground cache: a grassy mound with a small wooden trapdoor and bushes | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 17 | `WATCHTOWER` | Tour de Guet | a tall watchtower with a lookout platform and a torch | Bâtiment principal 1, Caserne 1 | ☐ | ☐ | ☐ |
| 18 | `EMBASSY` | Ambassade | an embassy with two different banners | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 19 | `HERO_MANSION` | Domus du Héros | the hero's mansion with a tower and a banner | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 20 | `RESIDENCE` | Résidence | a comfortable residence house with a garden | Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 21 | `WORKSHOP` | Atelier | a siege workshop with catapult parts, gears and a smoking chimney | Académie 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 22 | `MILL` | Moulin | a windmill with four sails | Ferme 5 | ☐ | ☐ | ☐ |
| 23 | `SAWMILL` | Scierie | a sawmill with stacked logs and a saw | Bûcheron 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 24 | `STONEMASON` | Tailleur de Pierre | a stonemason's yard with cut stone blocks and tools | Carrière de pierre 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 25 | `FOUNDRY` | Fonderie | a foundry with two furnace chimneys | Mine de fer 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 26 | `BAKERY` | Boulangerie | a bakery with a stone oven, a smoking chimney and loaves of bread | Ferme 10, Bâtiment principal 5, Moulin 5 | ☐ | ☐ | ☐ |
| 27 | `TREASURE_CHAMBER` | Chambre au Trésor | a fortified treasure chamber in dark stone with torches and a heavy door | Bâtiment principal 10 | ☐ | ☐ | ☐ |
| 28 | `GREAT_SILO` | Grand Silo | two tall grain silos side by side | Bâtiment principal 10, Chambre au Trésor 5 | ☐ | ☐ | ☐ |
| 29 | `GREAT_WAREHOUSE` | Grand Dépôt | a large storehouse with crates and barrels | Bâtiment principal 10, Chambre au Trésor 5 | ☐ | ☐ | ☐ |
| 30 | `MOAT` | Douves | a ring-shaped moat filled with water around a small grassy island with a wooden footbridge | Bâtiment principal 10, Mur 5 | ☐ | ☐ | ☐ |
| 31 | `TRADE_OFFICE` | Comptoir de Commerce | a trade office with caravan goods, sacks and a cart | Place du marché 10, Bâtiment principal 10 | ☐ | ☐ | ☐ |
| 32 | `GREAT_BARRACKS` | Grande Caserne | a large barracks with two banners | Caserne 20 | ☐ | ☐ | ☐ |
| 33 | `GREAT_STABLE` | Grande Écurie | a large stable with horses | Écurie 20 | ☐ | ☐ | ☐ |
| 34 | `HUN_WAR_TENT` | Tente de Guerre | a large war tent with a banner, spears and a campfire | Bâtiment principal 10, Écurie 10 | ☐ | ☐ | ☐ |

## Sultanat (`buildings/SULTAN/`) — 102 images à produire sur 102 (0 peintes)

Architecture à ajouter à chaque prompt : *Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns*

Orientation : entrée principale sur la face avant droite (sud-est), comme le guide 3D.

| # | Clé (fichier) | Bâtiment | Sujet (anglais, pour le prompt) | Débloqué par | Courant | _t1 | _t3 |
|---|---|---|---|---|---|---|---|
| 1 | `MAIN_HALL` | Bâtiment principal | the main hall, the seat of power of the city, with a banner on top | — | ☐ | ☐ | ☐ |
| 2 | `FARM` | Ferme | a wheat farm plot with golden crop rows | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 3 | `LUMBER` | Bûcheron | a lumber camp with trees and stacked logs | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 4 | `QUARRY` | Carrière de pierre | a stone quarry with big rocks | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 5 | `IRON_MINE` | Mine de fer | an iron mine entrance dug into a rock wall with a mine cart | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 6 | `WAREHOUSE` | Dépôt de ressources | a goods warehouse with crates and barrels at the door | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 7 | `SILO` | Silo à céréales | a round grain silo | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 8 | `RALLY_POINT` | Place de rassemblement | a military rally point: a tall flag on a paved square with torches and shields | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 9 | `BARRACKS` | Caserne | a military barracks with a training yard, weapon racks and a banner | Place de rassemblement 1, Bâtiment principal 3 | ☐ | ☐ | ☐ |
| 10 | `MARKET` | Place du marché | a market stall with a striped awning, crates, pots, baskets of goods and a scale | Bâtiment principal 3, Silo à céréales 1, Dépôt de ressources 1 | ☐ | ☐ | ☐ |
| 11 | `ACADEMY` | Académie | an academy with columns and scrolls | Bâtiment principal 3 | ☐ | ☐ | ☐ |
| 12 | `FORGE` | Forge | a blacksmith forge with a smoking chimney, an anvil and glowing embers | Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 13 | `STABLE` | Écurie | a horse stable with hay bales and a horse | Forge 3, Académie 5 | ☐ | ☐ | ☐ |
| 14 | `WALL` | Mur | a fortified city gate with two towers, torches and a heavy wooden door | Bâtiment principal 3 | ☐ | ☐ | ☐ |
| 15 | `HEALING_TENT` | Tente de soins | a field hospital tent with a red cross banner | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 16 | `HIDEOUT` | Cachette | a hidden underground cache: a grassy mound with a small wooden trapdoor and bushes | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 17 | `WATCHTOWER` | Tour de Guet | a tall watchtower with a lookout platform and a torch | Bâtiment principal 1, Caserne 1 | ☐ | ☐ | ☐ |
| 18 | `EMBASSY` | Ambassade | an embassy with two different banners | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 19 | `HERO_MANSION` | Domus du Héros | the hero's mansion with a tower and a banner | Bâtiment principal 1 | ☐ | ☐ | ☐ |
| 20 | `RESIDENCE` | Résidence | a comfortable residence house with a garden | Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 21 | `WORKSHOP` | Atelier | a siege workshop with catapult parts, gears and a smoking chimney | Académie 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 22 | `MILL` | Moulin | a windmill with four sails | Ferme 5 | ☐ | ☐ | ☐ |
| 23 | `SAWMILL` | Scierie | a sawmill with stacked logs and a saw | Bûcheron 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 24 | `STONEMASON` | Tailleur de Pierre | a stonemason's yard with cut stone blocks and tools | Carrière de pierre 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 25 | `FOUNDRY` | Fonderie | a foundry with two furnace chimneys | Mine de fer 10, Bâtiment principal 5 | ☐ | ☐ | ☐ |
| 26 | `BAKERY` | Boulangerie | a bakery with a stone oven, a smoking chimney and loaves of bread | Ferme 10, Bâtiment principal 5, Moulin 5 | ☐ | ☐ | ☐ |
| 27 | `TREASURE_CHAMBER` | Chambre au Trésor | a fortified treasure chamber in dark stone with torches and a heavy door | Bâtiment principal 10 | ☐ | ☐ | ☐ |
| 28 | `GREAT_SILO` | Grand Silo | two tall grain silos side by side | Bâtiment principal 10, Chambre au Trésor 5 | ☐ | ☐ | ☐ |
| 29 | `GREAT_WAREHOUSE` | Grand Dépôt | a large storehouse with crates and barrels | Bâtiment principal 10, Chambre au Trésor 5 | ☐ | ☐ | ☐ |
| 30 | `MOAT` | Douves | a ring-shaped moat filled with water around a small grassy island with a wooden footbridge | Bâtiment principal 10, Mur 5 | ☐ | ☐ | ☐ |
| 31 | `TRADE_OFFICE` | Comptoir de Commerce | a trade office with caravan goods, sacks and a cart | Place du marché 10, Bâtiment principal 10 | ☐ | ☐ | ☐ |
| 32 | `GREAT_BARRACKS` | Grande Caserne | a large barracks with two banners | Caserne 20 | ☐ | ☐ | ☐ |
| 33 | `GREAT_STABLE` | Grande Écurie | a large stable with horses | Écurie 20 | ☐ | ☐ | ☐ |
| 34 | `SULTAN_DESERT_OUTPOST` | Poste du Désert | a desert outpost with a minaret, a small dome and a palm tree | Bâtiment principal 10, Place du marché 5 | ☐ | ☐ | ☐ |

