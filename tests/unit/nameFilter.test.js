// Noms choquants refusés à la création (décision du 29 octobre 2026) : variantes leet, lettres répétées, mots collés,
// mots réservés à l'équipe ; les noms ordinaires qui contiennent un mot court passent (Computer, Cocktail, Scunthorpe)
require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { nameProblem, wordsOf } = require('../../src/utils/nameFilter');

test('noms choquants refusés, variantes comprises', () => {
  for (const n of ['XxConnardxX', 'C0nn4rd', 'Conaaard', 'SaleNoir', 'sale_noir', 'Pd_du_92', 'Hitler88', 'N1gg3r', 'Fils de pute', 'Grand_Batard', 'KKK', 'fuck', 'B1tch']) {
    assert.ok(nameProblem(n), n);
  }
});
test('noms réservés à l\'équipe refusés', () => {
  for (const n of ['Admin', 'AdminRome', 'Modo', 'Le_Moderateur', 'Support', 'Immortels', 'GM']) assert.match(nameProblem(n) || '', /réservé/, n);
});
test('noms ordinaires acceptés', () => {
  for (const n of ['Hadrien', 'Cesar_92', 'Computer', 'Scunthorpe', 'Dickens', 'Badminton', 'Classe', 'Analyse', 'Sexton', 'Essex', 'Assassin', 'Kiss', 'Bastien', 'Nazareth', 'Anastasia', 'Cockpit', 'Cocktail', 'Gmail', 'Team_Rome', 'SPQR', 'Les Légions de Rome', 'Arbiter', 'Habitant', 'Rabiteau']) {
    assert.equal(nameProblem(n), null, n);
  }
});
test('découpage des mots : séparateurs, chiffres, majuscules', () => {
  assert.deepEqual(wordsOf('SaleNoir92'), ['sale', 'noir']);
  assert.deepEqual(wordsOf('Pd_du_92'), ['pd', 'du']);
});
