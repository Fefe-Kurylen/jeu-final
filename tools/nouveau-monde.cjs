#!/usr/bin/env node
// Ouvre le monde suivant (décision du 28 octobre 2026) : remet le jeu à zéro en gardant les comptes, les joueurs (pseudo,
// or, abonnement Plus, achats, cosmétiques), les médailles, les titres et le Panthéon. La nouvelle carte est tirée au
// prochain démarrage du serveur. À lancer serveur arrêté :  node tools/nouveau-monde.cjs [--force]
// --force : remet à zéro un monde qui n'est pas terminé (sans Panthéon pour lui).
process.chdir(require('path').join(__dirname, '..'));
const { newWorld } = require('../src/services/hallOfFameService');
newWorld({ force: process.argv.includes('--force') })
  .then(r => { console.log(`Monde ${r.number} prêt à ouvrir (${r.tables} tables remises à zéro). Redémarrez le serveur : il tirera la nouvelle carte.`); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
