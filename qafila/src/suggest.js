// Suggestions de saisie. Bing OSJSON (sans clé) puis DuckDuckGo en secours. Aucune donnée utilisateur transmise.
import { fetchJSON } from './http.js';
import { TTLCache } from './cache.js';

const cache = new TTLCache({ ttlSeconds: 3600, max: 2000 });

export async function suggest(q, lang = 'fr-FR') {
  q = q.trim().slice(0, 100);
  if (q.length < 2) return [];
  const key = `${lang}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const sources = [
    async () => (await fetchJSON(`https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}&market=${lang}`, { timeoutMs: 2500 }))[1],
    async () => (await fetchJSON(`https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list&kl=${lang.toLowerCase()}`, { timeoutMs: 2500 }))[1],
  ];
  for (const src of sources) {
    try {
      const list = (await src() || []).filter(s => typeof s === 'string').slice(0, 8);
      if (list.length) { cache.set(key, list); return list; }
    } catch { /* source suivante */ }
  }
  return [];
}
