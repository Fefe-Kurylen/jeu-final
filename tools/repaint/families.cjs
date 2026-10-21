// families.cjs — le tour du jeu écran par écran : chaque famille d'images (test sur le nom de fichier), où elle se voit,
// la référence du prompt et la priorité. Partagé par liste-graphismes.cjs (docs/GRAPHISMES-COMPLET.md) et
// generation-complete.cjs (docs/GENERATION-COMPLETE.md).
function classify(files, painted) {
  const taken = new Set();
  const fam = (title, test, where, ref, prio, note = '') => {
    const list = files.filter(f => !taken.has(f) && test(f)); list.forEach(f => taken.add(f));
    return { title, list, where, ref, prio, note, total: list.length, done: list.filter(f => painted.has(f)).length };
  };
  const screens = [
    ['Inscription et connexion', [
      fam('Scènes de connexion (portrait, paysage)', f => /^scenes\/auth-/.test(f), 'écran de connexion', '§ 3.6', '★★★'),
      fam('Paysages des cartes de civilisation', f => /^scenes\/faction-/.test(f), 'cartes de choix de civilisation', 'guide § S20', '★★☆'),
      fam('Blasons des civilisations', f => /^ui\/crest_/.test(f), 'inscription, alliance, étiquettes', 'guide § S3', '★★☆'),
      fam('Bustes des héros (choix de civilisation, cartes d\'armée)', f => /^heroes\/[A-Z]+_bust\.webp$/.test(f), 'cartes de civilisation, armées', '§ 3.5', '★★☆')
    ]],
    ['Ville : scène isométrique', [
      fam('Bâtiments, palier courant (niveaux 7-13), 39 × 6 civilisations', f => /^buildings\/[A-Z]+\/[A-Z_]+\.webp$/.test(f), 'vue ville, vignettes, fiches', '§ 3.1', '★★★'),
      fam('Bâtiments, paliers 1 et 3 (niveaux 1-6 et 14-20)', f => /^buildings\/[A-Z]+\/[A-Z_]+_t[13]\.webp$/.test(f), 'vue ville, fiches (3 paliers)', '§ 3.1', '★☆☆'),
      fam('Chantiers : chaque bâtiment en construction par civilisation', f => /^buildings\/.*_site\.webp$/.test(f), 'bâtiment en première construction', 'guide § S10', '★★☆'),
      fam('Échafaudages par civilisation (trois tailles)', f => /^props\/scaffold_/.test(f), 'bâtiment en amélioration', 'guide § S11', '★★★'),
      fam('Ouvriers par civilisation (animation A3)', f => /^props\/worker_/.test(f), 'devant les chantiers', 'guide § A3', '★★★'),
      fam('Parcelles au sol (deux variantes par biome)', f => /^plots\//.test(f), 'sous chaque bâtiment', '§ 3.2', '★★☆'),
      fam('Champs (4 types × 3 paliers × 3 biomes)', f => /^fields\/\w+\/[A-Z_]+_\d\.webp$/.test(f), 'anneau des champs', '§ 3.2', '★★★'),
      fam('Champs en chantier', f => /^fields\/.*_site\.webp$/.test(f), 'champ en première construction', 'guide § S10', '★☆☆'),
      fam('Enceinte : courtines, murets et tours, 3 paliers × 6 civilisations', f => /^walls\/[A-Z]+\/\d_/.test(f), 'autour de la ville (palier du Bâtiment principal)', '§ 3.3', '★★★'),
      fam('Portes de la ville par civilisation', f => /^walls\/[A-Z]+\/gate\.webp$/.test(f), 'arête sud-est de l\'enceinte', 'guide § S1', '★★★'),
      fam('Enceinte en chantier', f => /^walls\/[A-Z]+\/site_/.test(f), 'Mur en travaux', 'guide § S10', '★☆☆'),
      fam('Douves par civilisation', f => /^walls\/[A-Z]+\/moat_/.test(f), 'bâtiment Douves (à brancher)', 'guide § S16', '★☆☆'),
      fam('Ornements de plaza par civilisation (statue, fontaine, étal)', f => /^props\/plaza_/.test(f), 'autour du Bâtiment principal', 'guide § S16', '★★☆'),
      fam('Villageois de chaque civilisation (homme, femme), marche 6 phases', f => /^props\/villager_/.test(f), 'avenues et plaza', 'guide § A1', '★★★'),
      fam('Gens des champs au travail', f => /^props\/(farmer|lumberjack|quarryman|miner)_/.test(f), 'anneau des champs', 'guide § A12', '★★☆'),
      fam('Animaux dans la ville', f => /^props\/animal_/.test(f), 'avenues, plaza', 'guide § A13', '★☆☆'),
      fam('Flammes des torches et braseros', f => /^props\/(flame|brazier)_/.test(f), 'tours, porte, plaza (nuit)', 'guide § A2', '★★★'),
      fam('Bâtiments vivants (moulin, forge, fonderie)', f => /^anim\/(mill_sails|sparks|furnace)_/.test(f), 'sur les bâtiments', 'guide § A4', '★★☆'),
      fam('Bâtiments vivants, suite (caserne, marché, écurie, atelier, boulangerie, tour de guet)', f => /^anim\//.test(f), 'sur les bâtiments', 'guide § A14', '★★☆'),
      fam('Fumées peintes (cheminées, feux de camp)', f => /^props\/smoke_/.test(f), 'toits, campements', 'guide § A15', '★☆☆'),
      fam('Drapeaux peints par civilisation (8 phases)', f => /^props\/flagp_/.test(f), 'tours, bâtiments, enceinte', 'guide § A16', '★☆☆'),
      fam('Charrette et chevaux', f => /^props\/(cart|horse_idle)_/.test(f), 'route, écurie', 'guide § A11', '★☆☆'),
      fam('Ambiance : neige, feuilles, tourbillon, oiseaux', f => /^props\/(snowflake|leaf|dust_devil|bird)_/.test(f), 'selon le biome et l\'heure', 'guide § A9', '★☆☆'),
      fam('Panneau « construire ici », parchemin « recherche en cours »', f => /^props\/(sign_build|scroll_research)\.webp$/.test(f), 'emplacements libres, Académie', 'guide § S2, S6', '★★☆'),
      fam('Décors de scène (arbres, rochers, buissons, cactus, dunes)', f => /^props\//.test(f), 'autour de la ville et des champs', '§ 3.2', '★★☆'),
      fam('Textures de sol (répétables) et bordures de transition', f => /^terrain\//.test(f), 'sols de la ville, des champs, de la carte', 'guide § T', '★★★'),
      fam('Décalques au sol', f => /^decals\//.test(f), 'semés dans la ville et aux alentours', 'guide § T', '★☆☆')
    ]],
    ['Carte du monde', [
      fam('Villes par civilisation et forteresses', f => /^map\/cities\/(?!colony_|siege_)/.test(f), 'villes des joueurs (palier du Bâtiment principal)', '§ 3.4', '★★★'),
      fam('Villes secondaires (colonies) par civilisation, normale et fortifiée', f => /^map\/cities\/colony_/.test(f), 'colonies des joueurs (fortifiée dès le Bâtiment principal 20)', 'guide § S12, A19', '★★☆'),
      fam('Points de ressource (5 types × 3 biomes)', f => /^map\/resources\//.test(f), 'points de ressource libres', '§ 3.4', '★★★'),
      fam('Relief et eau (forêts, montagnes, dunes, lacs, oasis, glace)', f => /^map\/terrain\//.test(f), 'fond de la carte', '§ 3.4', '★★★'),
      fam('Camps barbares (niveaux 1-3 × 3 biomes, ruines, bannières)', f => /^map\/camps\/(camp|ruins|banner)/.test(f), 'points tenus par une tribu', 'guide « Camps barbares »', '★★★'),
      fam('Campement de fondation (3 biomes)', f => /^map\/camps\/foundation/.test(f), 'point pendant la fondation d\'une ville', 'guide § S12', '★★☆'),
      fam('Ville secondaire assiégée animée (6 civilisations × normale / fortifiée × 4 phases)', f => /^map\/cities\/siege_colony_/.test(f), 'colonie assiégée sur la carte (remplace son sprite pendant le siège)', 'guide § A19', '★★☆'),
      fam('Ville assiégée animée (6 civilisations × 3 paliers × 4 phases)', f => /^map\/cities\/siege_(?!colony_)/.test(f), 'ville assiégée sur la carte (remplace le sprite de ville pendant le siège)', 'guide § A19', '★★☆'),
      fam('Armées en marche (4 classes × 6 civilisations, marchand)', f => /^map\/units\/(hoplite|archer|cavalry|catapult|merchant)(_[A-Z]+)?\.webp$/.test(f), 'armées, convois', '§ 3.4', '★★★'),
      fam('Cortège de colons (+ 6 civilisations)', f => /^map\/units\/settler(_[A-Z]+)?\.webp$/.test(f), 'armée partie fonder une ville', 'guide § S12', '★★☆'),
      fam('Héros en tête d\'armée, espion', f => /^map\/units\/(hero_[A-Z]+|spy)\.webp$/.test(f), 'armées avec héros, missions d\'espionnage', 'guide § S18', '★★☆'),
      fam('Cycles de marche (armées, marchand, colons)', f => /^map\/units\/\w+_walk_\d\.webp$/.test(f), 'armées en mouvement', 'guide § A5', '★★☆'),
      fam('Replay de bataille : poses, héros, projectiles, impacts', f => /^(map\/units\/\w+_(attack|hit)_\d\.webp|fx\/)/.test(f), 'rapports de combat', 'guide § A6, A18', '★★☆'),
      fam('Effets de carte : combat, ville en feu, feu de camp, météo', f => /^map\/fx\//.test(f), 'carte', 'guide § A7, A17', '★☆☆')
    ]],
    ['Armée, combat, héros', [
      fam('Figurines de classe (4 classes × 6 civilisations)', f => /^figures\/[A-Z]+_[A-Z]+\.webp$/.test(f), 'fiches et cartes de recrutement (repli)', '§ 3.5', '★★☆'),
      fam('Jetons de classe', f => /^busts\/[A-Z]+(_[A-Z]+)?\.webp$/.test(f) && !/^busts\/(SETTLER|TRIBE)_/.test(f), 'listes, rapports, composition (repli)', '§ 3.5', '★★☆'),
      fam('Fiches d\'unité : une figurine par unité (60)', f => /^figures\/units\//.test(f), 'fiche d\'unité, carte de recrutement', 'guide § S17', '★★☆'),
      fam('Fiches d\'unité : un jeton par unité (60)', f => /^busts\/units\//.test(f), 'listes, rapports, composition d\'armée', 'guide § S17', '★★☆'),
      fam('Héros sur l\'estrade (6)', f => /^heroes\/[A-Z]+\.webp$/.test(f), 'écran du héros', '§ 3.5', '★★☆'),
      fam('Héros par palier de niveau (estrade et jeton)', f => /^heroes\/[A-Z]+_(t[23]|bust_t[23])\.webp$/.test(f), 'écran du héros, cartes d\'armée (à brancher)', 'guide § S19', '★☆☆'),
      fam('Héros en pose d\'attente (3 phases)', f => /^heroes\/[A-Z]+_idle_/.test(f), 'écran du héros', 'guide § A10', '★☆☆'),
      fam('Scène du champ de bataille', f => /^scenes\/battlefield/.test(f), 'replay de bataille', '§ 3.6', '★★☆'),
      fam('Estrades du héros par civilisation', f => /^scenes\/hero-/.test(f), 'écran du héros', '§ 3.6', '★★☆'),
      fam('Chefs de tribu et colons (jetons)', f => /^busts\/(TRIBE|SETTLER)_/.test(f), 'rapports de tribu, Résidence, fondation', 'guide § S12, S14', '★☆☆'),
      fam('Vignettes : tribus, fondation, expéditions', f => /^scenes\/(vignette-|expedition-)/.test(f), 'rapports, Résidence, expéditions', 'guide § S4, S12, S14', '★☆☆')
    ]],
    ['Écrans et interface', [
      fam('Bandeaux en tête des écrans', f => /^scenes\/header-/.test(f), 'marché, alliance, classement, sac, rapports, armée, recherche', '§ 3.6, guide § S20', '★★☆'),
      fam('Icônes des technologies et des branches', f => /^ui\/(tech|branch)_/.test(f), 'onglet Recherche, fiches', 'guide § S8', '★★☆'),
      fam('Objets du héros', f => /^ui\/item_/.test(f), 'inventaire, équipement', '§ 3.7', '★★☆'),
      fam('Habillage : boutons, cadres, plaques, barres', f => /^ui\/(btn-|frame-|plate-|bar-)/.test(f), 'toute l\'interface', '§ 3.7', '★★★'),
      fam('Effets d\'interface (construction finie, niveau, butin)', f => /^ui\/fx_/.test(f), 'événements', 'guide § A8', '★☆☆'),
      fam('Icônes d\'interface (ressources, onglets, actions, colon, tribu)', f => /^ui\//.test(f), 'partout', '§ 3.7, guide § S9, S14', '★★★')
    ]]
  ];
  const rest = files.filter(f => !taken.has(f));
  return { screens, rest };
}
module.exports = { classify };
