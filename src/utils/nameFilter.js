// Noms choisis par les joueurs (décision du 29 octobre 2026) : le jeu refuse à la création les noms choquants et ceux de
// l'équipe, pour le pseudo, l'alliance et son tag, le héros, une armée, une ville fondée. Listes : data/name-filter.json
// (plus les mots du filtre du chat). La comparaison ignore accents, casse, lettres répétées et chiffres « leet ».
let lists = null;
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e' };
// NFKD : les lettres « larges » ou « mathématiques » (ｃｏｎｎａｒｄ, 𝐂𝐨𝐧𝐧𝐚𝐫𝐝) redeviennent des lettres simples
const fold = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const squash = (s) => s.replace(/(.)\1+/g, '$1');   // « conaaard » -> « conard »
function leet(s) { return [...s].map(c => LEET[c] ?? c).join(''); }
const letters = (s) => leet(fold(s)).replace(/[^a-z]/g, '');
const REFUSED = 'Ce nom n\'est pas autorisé : choisissez-en un autre.';

// Motif d'un mot de la liste : chaque lettre peut être répétée (« Conaaard ») ; une lettre doublée reste exigée quand
// l'écraser donnerait un mot court ordinaire (« chatte » -> « chate » de « Château », « nigger » -> « Niger », « ss » -> « S »)
function pattern(w) {
  const strict = squash(w).length < 6;
  return w.replace(/([a-z])\1*/g, (run, c) => (strict && run.length > 1 ? `${c}{${run.length},}` : `${c}+`));
}

function load() {
  if (lists) return lists;
  let f = {}, chat = [];
  try { f = require('../../data/name-filter.json'); } catch (e) { f = {}; }
  try { chat = require('../../data/chat-filter.json').words || []; } catch (e) { chat = []; }
  const norm = (w) => squash(leet(fold(w)).replace(/[^a-z ]/g, '')).trim();
  const phrases = chat.filter(w => /\s/.test(w));
  // les expressions du chat sont aussi refusées collées (« Salejuif », « Tagueule »)
  const contains = [...(f.contains || []).map(letters).filter(w => squash(w).length >= 4),
    ...phrases.map(letters).filter(w => squash(w).length >= 7)];
  const tokens = [...(f.tokens || []), ...chat.filter(w => !/\s/.test(w))].map(letters).filter(Boolean);
  lists = {
    contains: [...new Set(contains)].map(w => new RegExp(pattern(w))),
    tokens: [...new Set(tokens)].map(w => new RegExp(`^${pattern(w)}$`)),
    phrases: [...new Set(phrases.map(norm).filter(Boolean))],
    reserved: [...new Set((f.reserved || []).map(norm).filter(Boolean))]
  };
  return lists;
}

// Mots du nom tels qu'écrits : découpé aux séparateurs, aux chiffres et aux majuscules (« SaleNoir92 » -> sale, noir)
function rawWordsOf(name) {
  const spaced = String(name).normalize('NFKC').replace(/([a-zà-ÿ])([A-ZÀ-Ý])/g, '$1 $2');
  return fold(spaced).split(/[^a-z]+/).filter(Boolean);
}
// Mêmes mots, lettres répétées écrasées
function wordsOf(name) { return rawWordsOf(name).map(squash); }

// null si le nom est accepté, sinon la raison (à montrer telle quelle)
function nameProblem(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  const L = load();
  name = name.normalize('NFKC');
  const raw = rawWordsOf(name), words = raw.map(squash);
  // le nom entier collé, chiffres « leet » traduits
  const glued = letters(name);
  const gluedRaw = fold(name).replace(/[^a-z]/g, '');
  if (L.contains.some(re => re.test(glued) || re.test(gluedRaw))) return REFUSED;
  // mots en « leet » ; un nombre seul reste un nombre (« Armée 5 » n'est pas « Armée S »)
  const leetWords = name.split(/[^\p{L}\p{N}@$!|€]+/u).filter(w => !/^\p{N}+$/u.test(w)).map(letters).filter(Boolean);
  // sigles épelés lettre par lettre (« K K K », « S.S. ») : les lettres seules qui se suivent sont recollées
  const initials = (raw.join(' ').match(/\b[a-z](?: [a-z]\b)+/g) || []).map(s => s.replace(/ /g, ''));
  if ([...raw, ...leetWords, ...initials].some(w => L.tokens.some(re => re.test(w)))) return REFUSED;
  const sentence = ` ${words.join(' ')} `;
  if (L.phrases.some(p => sentence.includes(` ${p} `))) return REFUSED;
  const sq = squash(glued), sqRaw = squash(gluedRaw);
  if (L.reserved.some(r => words.includes(r) || (r.length >= 5 && (sq.startsWith(r) || sqRaw.startsWith(r))))) return 'Ce nom est réservé à l\'équipe du jeu : choisissez-en un autre.';
  return null;
}

module.exports = { nameProblem, wordsOf, _reset: () => { lists = null; } };
