// Proxy d'images : les vignettes sont chargées par le serveur, l'IP de l'utilisateur n'est jamais exposée aux sites tiers.
// Protection SSRF : https uniquement, résolution DNS et refus des plages d'adresses privées, taille et durée limitées.
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.js';

const MAX_BYTES = 5 * 1024 * 1024;
const favCache = new Map(); // host -> { buf, type, expires } (null = absent)
const FAV_TTL = 24 * 3600 * 1000;

function isPrivate(ip) {
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return low === '::1' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80') || low.startsWith('::ffff:');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export async function imageProxy(req, res) {
  const raw = req.query.u;
  let url;
  try { url = new URL(String(raw)); } catch { return res.status(400).end(); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return res.status(400).end();
  if (net.isIP(url.hostname) && isPrivate(url.hostname)) return res.status(403).end();
  try {
    const addrs = await dns.lookup(url.hostname, { all: true });
    if (!addrs.length || addrs.some(a => isPrivate(a.address))) return res.status(403).end();
  } catch { return res.status(404).end(); }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  try {
    const up = await fetch(url, { headers: { 'User-Agent': config.browserUA, Accept: 'image/*' }, signal: ctrl.signal, redirect: 'follow' });
    const type = up.headers.get('content-type') || '';
    if (!up.ok || !type.startsWith('image/')) return res.status(415).end();
    const len = Number(up.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return res.status(413).end();
    res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' });
    const buf = Buffer.from(await up.arrayBuffer());
    if (buf.length > MAX_BYTES) return res.status(413).end();
    res.end(buf);
  } catch {
    if (!res.headersSent) res.status(502).end();
  } finally { clearTimeout(timer); }
}

// Favicon d'un domaine, récupérée côté serveur (l'utilisateur ne contacte jamais le site). 204 si introuvable.
export async function faviconProxy(req, res) {
  const host = String(req.query.host || '').toLowerCase().replace(/[^a-z0-9.-]/g, '');
  if (!host || host.length > 253) return res.status(400).end();
  const hit = favCache.get(host);
  if (hit && hit.expires > Date.now()) return hit.buf ? res.set({ 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=86400' }).end(hit.buf) : res.status(204).end();
  if (net.isIP(host) && isPrivate(host)) return res.status(403).end();
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some(a => isPrivate(a.address))) return res.status(403).end();
  } catch { return res.status(204).end(); }
  for (const url of [`https://${host}/favicon.ico`, `https://www.${host}/favicon.ico`, `https://icons.duckduckgo.com/ip3/${host}.ico`]) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    try {
      const up = await fetch(url, { headers: { 'User-Agent': config.browserUA, Accept: 'image/*' }, signal: ctrl.signal, redirect: 'follow' });
      const type = up.headers.get('content-type') || '';
      if (up.ok && /image\//.test(type)) {
        const buf = Buffer.from(await up.arrayBuffer());
        if (buf.length > 0 && buf.length < 512 * 1024) {
          favCache.set(host, { buf, type, expires: Date.now() + FAV_TTL });
          return res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' }).end(buf);
        }
      }
    } catch { /* essai suivant */ } finally { clearTimeout(timer); }
  }
  favCache.set(host, { buf: null, expires: Date.now() + FAV_TTL });
  res.status(204).end();
}
