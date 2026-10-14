import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.js';
import { search, status } from './src/providers/index.js';
import { suggest } from './src/suggest.js';
import { instantAnswer } from './src/instant.js';
import { imageProxy, faviconProxy } from './src/imageProxy.js';
import { rateLimit } from './src/rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());

// En-têtes de confidentialité et de sécurité sur toutes les réponses.
app.use((req, res, next) => {
  res.set({
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'interest-cohort=(), browsing-topics=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'",
  });
  next();
});

// Journalisation minimale : méthode + chemin, jamais la requête de recherche ni l'IP.
app.use((req, res, next) => { if (!req.path.startsWith('/api/')) console.log(`${req.method} ${req.path}`); next(); });

const api = express.Router();
// Quota de recherches par IP ; le proxy d'images a son propre quota, bien plus large (une page = des dizaines de vignettes).
const searchLimit = rateLimit({ perMinute: config.rateLimitPerMin });
const imageLimit = rateLimit({ perMinute: config.rateLimitPerMin * 20 });

api.get('/search', searchLimit, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Paramètre q manquant' });
  const category = String(req.query.type || 'web');
  const lang = /^[a-z]{2}-[A-Z]{2}$/.test(String(req.query.lang)) ? String(req.query.lang) : config.defaultLang;
  try {
    const data = await search({ q, category, page: req.query.page, lang });
    const instant = category === 'web' && data.page === 1 ? instantAnswer(q) : null;
    res.set('Cache-Control', 'private, max-age=60');
    res.json({ ...data, instant });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.details });
  }
});

api.get('/suggest', searchLimit, async (req, res) => {
  const list = await suggest(String(req.query.q || ''), config.defaultLang).catch(() => []);
  res.set('Cache-Control', 'private, max-age=300');
  res.json(list);
});

api.get('/img', imageLimit, imageProxy);
api.get('/fav', imageLimit, faviconProxy);
api.get('/status', (req, res) => res.json({ ok: true, providers: status(), lang: config.defaultLang }));
app.use('/api', api);

// OpenSearch : permet d'ajouter Furtif comme moteur dans Chrome/Firefox/Safari.
app.get('/opensearch.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('application/opensearchdescription+xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">
  <ShortName>Furtif</ShortName>
  <Description>Recherche privée Furtif</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="64" height="64" type="image/svg+xml">${base}/logo.svg</Image>
  <Url type="text/html" method="get" template="${base}/?q={searchTerms}"/>
  <Url type="application/x-suggestions+json" template="${base}/api/suggest?q={searchTerms}"/>
  <moz:SearchForm>${base}/</moz:SearchForm>
</OpenSearchDescription>`);
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(config.port, () => {
  const active = status().filter(p => p.available && p.enabled).map(p => p.name).join(', ');
  console.log(`Furtif démarré sur http://localhost:${config.port} — fournisseurs actifs : ${active}`);
});
