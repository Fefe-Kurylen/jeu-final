// Noms choisis par les joueurs (décision du 29 octobre 2026) : le jeu refuse à la création les noms choquants et ceux de
// l'équipe, pour le pseudo, l'alliance et son tag, le héros, une armée, une ville fondée. Listes : data/name-filter.json
// (plus les mots du filtre du chat). La comparaison ignore accents, casse, lettres répétées et chiffres « leet ».
let lists = null;
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e' };
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const squash = (s) => s.replace(/(.)\1+/g, '$1');   // « conaaard » -> « conard »
function leet(s) { return [...s].map(c => LEET[c] ?? c).join(''); }

function load() {
  if (lists) return lists;
  let f = {}, chat = [];
  try { f = require('../../data/name-filter.json'); } catch (e) { f = {}; }
  try { chat = require('../../data/chat-filter.json').words || []; } catch (e) { chat = []; }
  const norm = (w) => squash(leet(fold(w)).replace(/[^a-z ]/g, '')).trim();
  lists = {
    contains: [...new Set((f.contains || []).map(w => norm(w).replace(/ /g, '')).filter(w => w.length >= 4))],
    tokens: new Set([...(f.tokens || []), ...chat.filter(w => !/\s/.test(w))].map(w => norm(w)).filter(Boolean)),
    phrases: [...new Set(chat.filter(w => /\s/.test(w)).map(norm).filter(Boolean))],
    reserved: [...new Set((f.reserved || []).map(norm).filter(Boolean))]
  };
  return lists;
}

// Mots du nom : découpé aux séparateurs, aux chiffres et aux majuscules (« SaleNoir92 » -> sale, noir)
function wordsOf(name) {
  const spaced = String(name).replace(/([a-zà-ÿ])([A-ZÀ-Ý])/g, '$1 $2');
  return fold(spaced).split(/[^a-z]+/).map(squash).filter(Boolean);
}

// null si le nom est accepté, sinon la raison (à montrer telle quelle)
function nameProblem(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  const L = load();
  const words = wordsOf(name);
  // le nom entier collé, chiffres « leet » traduits
  const glued = squash(leet(fold(name)).replace(/[^a-z]/g, ''));
  const gluedRaw = squash(fold(name).replace(/[^a-z]/g, ''));
  if (L.contains.some(w => glued.includes(w) || gluedRaw.includes(w))) return 'Ce nom n\'est pas autorisé : choisissez-en un autre.';
  const leetWords = String(name).split(/[^\p{L}\p{N}@$!|€]+/u).map(w => squash(leet(fold(w)).replace(/[^a-z]/g, ''))).filter(Boolean);
  if ([...words, ...leetWords].some(w => L.tokens.has(w))) return 'Ce nom n\'est pas autorisé : choisissez-en un autre.';
  const sentence = ` ${words.join(' ')} `;
  if (L.phrases.some(p => sentence.includes(` ${p} `))) return 'Ce nom n\'est pas autorisé : choisissez-en un autre.';
  if (L.reserved.some(r => words.includes(r) || (r.length >= 5 && (glued.startsWith(r) || gluedRaw.startsWith(r))))) return 'Ce nom est réservé à l\'équipe du jeu : choisissez-en un autre.';
  return null;
}

module.exports = { nameProblem, wordsOf, _reset: () => { lists = null; } };
