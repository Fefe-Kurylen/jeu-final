// Messagerie : nettoyage du texte, filtre de mots, canaux, langues de traduction
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const chat = require('../../src/services/chatService');
const translate = require('../../src/services/translateService');

test('le texte d\'un message est nettoyé et borné', () => {
  assert.equal(chat.cleanMessage('  Bonjour\n\n\n\n à tous  '), 'Bonjour\n\nà tous');
  assert.equal(chat.cleanMessage('a‮b\u0007c'), 'abc', 'inversion de sens et caractères de contrôle retirés');
  assert.equal(chat.cleanMessage('   '), null);
  assert.equal(chat.cleanMessage('x'.repeat(501)), null);
  assert.equal(chat.cleanMessage(42), null);
  assert.equal(chat.cleanMessage("l'alliance \"SPQR\" <b>"), "l'alliance \"SPQR\" <b>", 'apostrophes et guillemets gardés (le jeu échappe à l\'affichage)');
});

test('le filtre masque les insultes sans toucher aux mots courants', () => {
  assert.equal(chat.filterText('espèce de CONNNARD !'), 'espèce de ******** !');
  assert.equal(chat.filterText('Enculé de première'), '****** de première');
  assert.equal(chat.filterText('fils de pute'), '**** ** ****');
  for (const ok of ['le départ est retardé', 'Les Mongols et les Huns', 'elle a un succès fou', 'on attaque à 20h ?']) assert.equal(chat.filterText(ok), ok);
});

test('canaux : global, alliance, amis, message privé', () => {
  assert.deepEqual(chat.parseChannel('global'), { key: 'global', channel: 'GLOBAL' });
  assert.equal(chat.parseChannel('alliance').channel, 'ALLIANCE');
  assert.equal(chat.parseChannel('friends').channel, 'FRIENDS');
  assert.deepEqual(chat.parseChannel('private:abc-123'), { key: 'private:abc-123', channel: 'PRIVATE', otherId: 'abc-123' });
  for (const bad of ['taverne', 'private:', 'private:a b', '', null]) assert.equal(chat.parseChannel(bad), null);
  assert.equal(chat.conversationKey('b', 'a'), chat.conversationKey('a', 'b'), 'une conversation, quel que soit celui qui écrit');
});

test('langues de traduction (DeepL)', () => {
  assert.equal(translate.normalizeLang('fr-FR'), 'fr');
  assert.equal(translate.normalizeLang('pt_BR'), 'pt');
  assert.equal(translate.normalizeLang('EN'), 'en');
  assert.equal(translate.normalizeLang('xx'), null);
  assert.equal(translate.LANGS.en, 'EN-GB');
  assert.ok(Object.keys(translate.LANG_NAMES).every(k => translate.LANGS[k]), 'chaque langue proposée a son code DeepL');
});
