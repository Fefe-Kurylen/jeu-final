// Noms choquants refusés à la création (décision du 29 octobre 2026) : variantes leet, lettres répétées, mots collés,
// lettres « larges » Unicode, mots réservés à l'équipe ; les noms ordinaires qui contiennent un mot court passent
// (Computer, Cocktail, Scunthorpe, Château, Niger, Nazim) ainsi que les nombres et lettres seuls (« Armée 5 », « Bob_S »)
require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { nameProblem, wordsOf } = require('../../src/utils/nameFilter');

test('noms choquants refusés, variantes comprises', () => {
  for (const n of ['XxConnardxX', 'C0nn4rd', 'Conaaard', 'SaleNoir', 'sale_noir', 'Pd_du_92', 'Hitler88', 'N1gg3r', 'Fils de pute', 'Grand_Batard', 'KKK', 'fuck', 'B1tch']) {
    assert.ok(nameProblem(n), n);
  }
});
test('expressions du chat refusées même collées', () => {
  for (const n of ['Salejuif', 'salenoir', 'SALEARABE', 'Tagueule', 'Killyourself', 'Putaindetamere', 'SaleJuif', 'Kill yourself']) {
    assert.ok(nameProblem(n), n);
  }
});
test('mots refusés malgré les lettres répétées, sigles épelés compris', () => {
  for (const n of ['Nigger', 'Niiigger', 'Nigga', 'Niga', 'Nig@', 'Chatte', 'Chatte_noire', 'Boobs', 'Faggot', 'SS', 'Les SS', 'KKK', 'Kkkk', 'Coonnnard', 'Conard']) {
    assert.ok(nameProblem(n), n);
  }
  // sigles épelés lettre par lettre
  for (const n of ['K K K', 'k.k.k', 'S.S.', 'P D']) assert.ok(nameProblem(n), n);
});
test('lettres Unicode « larges » ou « mathématiques » ramenées aux lettres simples', () => {
  for (const n of ['ｃｏｎｎａｒｄ', '𝐂𝐨𝐧𝐧𝐚𝐫𝐝', 'Le ｃｏｎｎａｒｄ', 'Ⓒⓞⓝⓝⓐⓡⓓ', 'ＳａｌｅＮｏｉｒ']) assert.ok(nameProblem(n), n);
  assert.match(nameProblem('Ａｄｍｉｎ') || '', /réservé/);
});
test('nazi et negro refusés comme mot entier seulement', () => {
  for (const n of ['Nazi', 'Nazi_88', 'Les Nazis', 'XxNaziXx', 'N4z1', 'Neonazi', 'Nazism', 'Nazisme', 'Negro', 'Negros']) assert.ok(nameProblem(n), n);
});
test('noms réservés à l\'équipe refusés', () => {
  for (const n of ['Admin', 'AdminRome', 'Modo', 'Le_Moderateur', 'Support', 'Immortels', 'GM']) assert.match(nameProblem(n) || '', /réservé/, n);
});
test('noms ordinaires acceptés', () => {
  for (const n of ['Hadrien', 'Cesar_92', 'Computer', 'Scunthorpe', 'Dickens', 'Badminton', 'Classe', 'Analyse', 'Sexton', 'Essex', 'Assassin', 'Kiss', 'Bastien', 'Nazareth', 'Anastasia', 'Cockpit', 'Cocktail', 'Gmail', 'Team_Rome', 'SPQR', 'Les Légions de Rome', 'Arbiter', 'Habitant', 'Rabiteau']) {
    assert.equal(nameProblem(n), null, n);
  }
});
test('nombres et lettres seuls acceptés (armée par défaut, pseudos, tags)', () => {
  for (const n of ['Armée 1', 'Armée 4', 'Armée 5', 'Armée 55', 'Marcus_5', 'Gaius-5', 'Legion 5', 'Rome 5', 'Gladiator_5', 'Bob_S', 'Titus_S', 'Léon K', 'K9', 'KK']) {
    assert.equal(nameProblem(n), null, n);
  }
});
test('mots ordinaires proches d\'un mot de la liste acceptés', () => {
  for (const n of ['Châteauroux', 'Château-Thierry', 'Chateaubriand', 'Le Châtelet', 'Neufchâtel', 'Châtelain', 'Château Fort',
    'Niger', 'Nigeria', 'Pescennius Niger', 'Lapis Niger', 'Bobsleigh', 'Les Bobs', 'Fagot', 'Nigaud',
    'Nazim', 'Nazir', 'Ignazio', 'Grégoire de Nazianze', 'Montenegro', 'Negroni', 'Héroïne', 'Isis', 'Temple d Isis']) {
    assert.equal(nameProblem(n), null, n);
  }
});
test('découpage des mots : séparateurs, chiffres, majuscules', () => {
  assert.deepEqual(wordsOf('SaleNoir92'), ['sale', 'noir']);
  assert.deepEqual(wordsOf('Pd_du_92'), ['pd', 'du']);
  assert.deepEqual(wordsOf('ＳａｌｅＮｏｉｒ'), ['sale', 'noir']);
});
