// Fournisseur sans clé : version « lite » de DuckDuckGo (résultats web). Les liens de redirection sont décodés,
// les liens sponsorisés sont retirés : la page de résultats Qafila ne contient aucune publicité.
import * as cheerio from 'cheerio';
import { fetchText, hostOf } from '../http.js';
import { TTLCache } from '../cache.js';

export const name = 'ddg';
export const categories = ['web'];
export const available = () => true;

const BASE = 'https://lite.duckduckgo.com/lite/';
const tokens = new TTLCache({ ttlSeconds: 600, max: 500 }); // vqd par requête, nécessaire à la pagination

function decode(href = '') {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    if (u.hostname.endsWith('duckduckgo.com') && u.pathname === '/l/') return u.searchParams.get('uddg') || href;
    return u.href;
  } catch { return href; }
}

function parse(html) {
  const $ = cheerio.load(html);
  const out = [];
  let vqd = $('input[name="vqd"]').first().attr('value') || '';
  let dc = $('input[name="dc"]').first().attr('value') || '';
  $('tr').each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass('result-sponsored')) return;
    const a = $tr.find('a.result-link').first();
    if (!a.length) return;
    const href = decode(a.attr('href') || '');
    if (!/^https?:/.test(href) || /duckduckgo\.com\/y\.js/.test(a.attr('href') || '')) return;
    const title = a.text().trim();
    const snippet = $tr.next('tr').find('td.result-snippet').text().replace(/\s+/g, ' ').trim();
    if (title) out.push({ title, url: href, host: hostOf(href), snippet });
  });
  return { results: out, vqd, dc };
}

export async function search({ q, page = 1, lang }) {
  const kl = lang.toLowerCase();
  const headers = { Accept: 'text/html' };
  if (page === 1) {
    const page1 = parse(await fetchText(`${BASE}?q=${encodeURIComponent(q)}&kl=${kl}`, { headers }));
    if (page1.vqd) tokens.set(`${kl}|${q}`, page1);
    return page1.results;
  }
  let tok = tokens.get(`${kl}|${q}`);
  if (!tok) {
    tok = parse(await fetchText(`${BASE}?q=${encodeURIComponent(q)}&kl=${kl}`, { headers }));
    tokens.set(`${kl}|${q}`, tok);
  }
  const body = new URLSearchParams({ q, s: String((page - 1) * 10), nextParams: '', v: 'l', o: 'json', dc: String((page - 1) * 10 + 1), api: 'd.js', vqd: tok.vqd || '', kl });
  const html = await fetchText(`${BASE}?kl=${kl}`, { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: `kl=${kl}` }, method: 'POST', body: body.toString() });
  return parse(html).results;
}
