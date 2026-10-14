// Fournisseur sans clé : lecture directe des pages Bing (web, images) et du flux RSS (actus).
// Les liens de redirection Bing sont décodés pour renvoyer l'URL réelle : aucun clic ne transite par Bing.
import * as cheerio from 'cheerio';
import { fetchText, hostOf, decodeEntities } from '../http.js';

export const name = 'bing';
export const categories = ['web', 'images', 'news', 'videos'];
export const available = () => true;

function decodeBingRedirect(href = '') {
  try {
    const u = new URL(href, 'https://www.bing.com');
    if (!u.hostname.endsWith('bing.com')) return href;
    if (u.pathname === '/ck/a') {
      const enc = u.searchParams.get('u') || '';
      if (enc.startsWith('a1')) {
        const b64 = enc.slice(2).replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(b64, 'base64').toString('utf8');
      }
    }
    if (u.pathname.startsWith('/news/apiclick')) {
      return u.searchParams.get('url') || href;
    }
    return href;
  } catch { return href; }
}

function langParams(lang) {
  const [l, c] = lang.split('-');
  return `setlang=${l || 'fr'}&cc=${(c || 'FR').toUpperCase()}`;
}

export async function search({ q, category, page = 1, lang }) {
  if (category === 'web') return web(q, page, lang);
  if (category === 'images') return images(q, page, lang);
  if (category === 'news') return news(q, page, lang);
  if (category === 'videos') return videos(q, page, lang);
  return [];
}

async function web(q, page, lang) {
  const first = 1 + (page - 1) * 10;
  const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&first=${first}&${langParams(lang)}`;
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const out = [];
  $('li.b_algo').each((_, li) => {
    const a = $(li).find('h2 a').first();
    const href = decodeBingRedirect(a.attr('href') || '');
    const title = a.text().trim();
    if (!href || !title || !/^https?:/.test(href)) return;
    let snippet = $(li).find('p[class*="b_lineclamp"], .b_caption p, .b_algoSlug').first().text().trim();
    snippet = snippet.replace(/^\s*(il y a \d+ \w+|\d+ \w+\.? \d{4})\s*·\s*/i, '');
    out.push({ title, url: href, host: hostOf(href), snippet });
  });
  return out;
}

async function images(q, page, lang) {
  const first = (page - 1) * 35;
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&first=${first}&count=35`;
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const out = [];
  $('a.iusc').each((_, a) => {
    const raw = $(a).attr('m');
    if (!raw) return;
    try {
      const m = JSON.parse(raw);
      if (!m.murl) return;
      out.push({
        title: m.t || m.desc || '',
        url: m.purl || m.murl,
        host: hostOf(m.purl || m.murl),
        snippet: '',
        image: { full: m.murl, thumb: m.turl || m.murl },
      });
    } catch { /* entrée illisible, ignorée */ }
  });
  return out;
}

async function news(q, page, lang) {
  const first = 1 + (page - 1) * 10;
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&first=${first}&${langParams(lang)}`;
  const xml = await fetchText(url);
  const $ = cheerio.load(xml, { xml: true });
  const out = [];
  $('item').each((_, it) => {
    const $it = $(it);
    const href = decodeBingRedirect($it.find('link').text().trim());
    const title = decodeEntities($it.find('title').text().trim());
    if (!href || !title) return;
    const img = $it.find('News\\:Image, Image').first().text().trim();
    out.push({
      title,
      url: href,
      host: hostOf(href),
      snippet: decodeEntities($it.find('description').text().trim()),
      source: $it.find('News\\:Source, Source').first().text().trim(),
      date: $it.find('pubDate').text().trim(),
      thumbnail: img ? `${img}&w=240&h=135&c=14` : '',
    });
  });
  return out;
}

async function videos(q, page, lang) {
  const first = 1 + (page - 1) * 20;
  const url = `https://www.bing.com/videos/search?q=${encodeURIComponent(q)}&first=${first}`;
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const out = [];
  $('.mc_vtvc_con_rc').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('ourl') || '';
    const title = $el.find('.mc_vtvc_title').attr('title') || $el.find('.mc_vtvc_title').text().trim();
    if (!/^https?:/.test(href) || !title) return;
    const rows = $el.find('.mc_vtvc_meta_row');
    const views = rows.eq(0).find('.meta_vc_content').text().trim();
    const date = rows.eq(0).find('.meta_pd_content').text().trim();
    const platform = rows.eq(1).find('span').first().text().trim();
    const channel = rows.eq(1).find('.mc_vtvc_meta_row_channel').text().trim();
    out.push({
      title, url: href, host: hostOf(href), snippet: '',
      thumbnail: $el.find('.rms_iac').attr('data-src') || $el.find('img').attr('src') || '',
      duration: $el.find('.mc_bc_rc.items').first().text().trim(),
      source: platform || hostOf(href), channel, views, date,
    });
  });
  return out;
}
