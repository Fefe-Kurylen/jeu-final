// Fournisseur d'images libres (Creative Commons) : Openverse, sans clé. Utilisé en dernier recours pour les images.
import { fetchJSON, hostOf } from '../http.js';

export const name = 'openverse';
export const categories = ['images'];
export const available = () => true;

export async function search({ q, page = 1 }) {
  const params = new URLSearchParams({ q, page_size: '30', page: String(page) });
  const data = await fetchJSON(`https://api.openverse.org/v1/images/?${params}`, { headers: { 'User-Agent': 'Qafila/0.1' } });
  return (data.results || []).map(r => ({
    title: r.title || '', url: r.foreign_landing_url || r.url, host: hostOf(r.foreign_landing_url || r.url), snippet: r.creator ? `© ${r.creator} (${r.license.toUpperCase()})` : '',
    image: { full: r.url, thumb: r.thumbnail || r.url },
  }));
}
