// Fournisseur SearXNG : métamoteur open-source auto-hébergé (voir docker-compose.yml).
import { config } from '../config.js';
import { fetchJSON, hostOf } from '../http.js';

export const name = 'searxng';
export const categories = ['web', 'images', 'news', 'videos'];
export const available = () => Boolean(config.searxngUrl);

const CAT = { web: 'general', images: 'images', news: 'news', videos: 'videos' };

export async function search({ q, category, page = 1, lang }) {
  const params = new URLSearchParams({ q, format: 'json', language: lang, categories: CAT[category], pageno: String(page), safesearch: '1' });
  const data = await fetchJSON(`${config.searxngUrl}/search?${params}`, { headers: { 'User-Agent': 'Qafila/0.1' } });
  const results = (data.results || []).map(r => {
    const base = { title: r.title, url: r.url, host: hostOf(r.url), snippet: r.content || '', date: r.publishedDate || '' };
    if (category === 'images') base.image = { full: r.img_src, thumb: r.thumbnail_src || r.img_src };
    if (category === 'news') { base.source = r.engine || base.host; base.thumbnail = r.thumbnail || r.img_src || ''; }
    if (category === 'videos') { base.thumbnail = r.thumbnail || r.img_src || ''; base.duration = r.length || ''; base.source = r.engine || base.host; base.channel = r.author || ''; base.views = ''; }
    return base;
  }).filter(r => r.url && r.title);
  const ib = data.infoboxes?.[0];
  const infobox = ib ? { title: ib.infobox, text: ib.content || '', image: ib.img_src || '', url: ib.urls?.[0]?.url || '' } : null;
  return { results, infobox, suggestions: data.suggestions || [] };
}
