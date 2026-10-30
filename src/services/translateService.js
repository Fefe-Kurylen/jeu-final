// ============================================================
// Traduction automatique des messages (décision du 26 octobre 2026 : DeepL).
// TRANSLATE_PROVIDER : deepl (défaut si DEEPL_API_KEY est donnée), log (tests : « [en] texte »), none (désactivée).
// La clé DeepL se met dans les réglages du serveur (DEEPL_API_KEY), jamais dans le code. Une clé gratuite (qui finit par
// « :fx ») passe par api-free.deepl.com, une clé payante par api.deepl.com. Chaque message n'est traduit qu'une fois par
// langue (table ChatTranslation) ; une panne, un quota dépassé ou une clé refusée laissent simplement le texte d'origine.
// ============================================================
const KEY = () => process.env.DEEPL_API_KEY || '';
function provider() {
  const p = (process.env.TRANSLATE_PROVIDER || '').toLowerCase();
  if (p === 'none' || p === 'log' || p === 'deepl') return p === 'deepl' && !KEY() ? 'none' : p;
  return KEY() ? 'deepl' : 'none';
}
const enabled = () => provider() !== 'none';

// Langues proposées aux joueurs (code à deux lettres -> code cible DeepL)
const LANGS = {
  fr: 'FR', en: 'EN-GB', es: 'ES', de: 'DE', it: 'IT', pt: 'PT-PT', nl: 'NL', pl: 'PL', ru: 'RU', uk: 'UK', tr: 'TR',
  ar: 'AR', zh: 'ZH', ja: 'JA', ko: 'KO', ro: 'RO', sv: 'SV', da: 'DA', fi: 'FI', nb: 'NB', cs: 'CS', el: 'EL', hu: 'HU', id: 'ID'
};
const LANG_NAMES = {
  fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português', nl: 'Nederlands', pl: 'Polski',
  ru: 'Русский', uk: 'Українська', tr: 'Türkçe', ar: 'العربية', zh: '中文', ja: '日本語', ko: '한국어', ro: 'Română', sv: 'Svenska',
  da: 'Dansk', fi: 'Suomi', nb: 'Norsk', cs: 'Čeština', el: 'Ελληνικά', hu: 'Magyar', id: 'Bahasa Indonesia'
};
// "fr-FR", "pt_BR", "EN" -> "fr", "pt", "en" ; null si la langue n'est pas proposée
function normalizeLang(v) {
  const l = String(v || '').toLowerCase().split(/[-_]/)[0];
  return LANGS[l] ? l : null;
}

let disabledUntil = 0;   // après un refus de DeepL (clé, quota), on attend avant de réessayer
async function deepl(texts, lang) {
  const key = KEY();
  const url = key.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, target_lang: LANGS[lang] })
  });
  if (res.status === 403 || res.status === 456) { disabledUntil = Date.now() + 60 * 60 * 1000; throw new Error(`DeepL ${res.status} (${res.status === 456 ? 'quota du mois atteint' : 'clé refusée'})`); }
  if (!res.ok) throw new Error(`DeepL ${res.status}`);
  const json = await res.json();
  return (json.translations || []).map(t => ({ text: t.text, from: normalizeLang(t.detected_source_language) || String(t.detected_source_language || '').toLowerCase() }));
}

// Traduit des textes vers lang : [{ text, from }] dans le même ordre, ou null si la traduction n'est pas possible
async function translateTexts(texts, lang) {
  if (!texts.length || !LANGS[lang] || !enabled() || Date.now() < disabledUntil) return null;
  if (provider() === 'log') return texts.map(t => ({ text: `[${lang}] ${t}`, from: 'xx' }));
  const out = [];
  for (let i = 0; i < texts.length; i += 50) out.push(...await deepl(texts.slice(i, i + 50), lang));   // 50 textes par requête
  return out;
}

module.exports = { enabled, provider, translateTexts, normalizeLang, LANGS, LANG_NAMES };
