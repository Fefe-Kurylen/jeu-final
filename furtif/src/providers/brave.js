// Fournisseur officiel : Brave Search API (https://brave.com/search/api/). Index indépendant, gratuit jusqu'à 2000 req/mois.
import { config } from '../config.js';
import { fetchJSON, hostOf } from '../http.js';

export const name = 'brave';
export const categories = ['web', 'images', 'news'];
export const available = () => Boolean(config.braveApiKey);

const BASE = 'https://api.search.brave.com/res/v1';

async function call(path, params) {
  const url = `${BASE}/${path}?${new URLSearchParams(params)}`;
  return fetchJSON(url, { headers: { 'X-Subscription-Token': config.braveApiKey, 'Accept-Encoding': 'gzip' } });
}

export async function search({ q, category, page = 1, lang }) {
  const [l, c] = lang.split('-');
  const common = { q, country: (c || 'FR').toUpperCase(), search_lang: l || 'fr', ui_lang: lang, safesearch: 'moderate' };

  if (category === 'web') {
    const data = await call('web/search', { ...common, count: 20, offset: page - 1 });
    const results = (data.web?.results || []).map(r => ({
      title: r.title, url: r.url, host: hostOf(r.url), snippet: r.description || '', date: r.age || '',
      thumbnail: r.thumbnail?.src || '',
    }));
    const ib = data.infobox?.results?.[0];
    const infobox = ib ? { title: ib.title, text: ib.long_desc || ib.description || '', image: ib.thumbnail?.src || '', url: ib.url || '' } : null;
    return { results, infobox };
  }
  if (category === 'images') {
    const data = await call('images/search', { ...common, count: 50 });
    return (data.results || []).map(r => ({
      title: r.title, url: r.url, host: hostOf(r.url), snippet: '',
      image: { full: r.properties?.url || r.thumbnail?.src, thumb: r.thumbnail?.src || r.properties?.url },
    }));
  }
  if (category === 'news') {
    const data = await call('news/search', { ...common, count: 20, offset: page - 1 });
    return (data.results || []).map(r => ({
      title: r.title, url: r.url, host: hostOf(r.url), snippet: r.description || '',
      source: r.meta_url?.hostname || hostOf(r.url), date: r.age || '', thumbnail: r.thumbnail?.src || '',
    }));
  }
  return [];
}
