// Orchestrateur : interroge les fournisseurs dans l'ordre configuré et bascule au suivant en cas d'échec ou de résultat vide.
import { config, CATEGORIES } from '../config.js';
import { TTLCache } from '../cache.js';
import * as brave from './brave.js';
import * as searxng from './searxng.js';
import * as bing from './bing.js';
import * as ddg from './ddg.js';
import * as openverse from './openverse.js';

const REGISTRY = { brave, searxng, ddg, bing, openverse };
const cache = new TTLCache({ ttlSeconds: config.cacheTtl, max: 1000 });

export function providerChain(category) {
  const chain = config.providers.map(n => REGISTRY[n]).filter(Boolean);
  if (!chain.includes(ddg)) chain.push(ddg);            // filets de sécurité sans clé
  if (!chain.includes(bing)) chain.push(bing);
  if (category === 'images') chain.push(openverse);      // images libres en dernier recours
  return chain.filter(p => p.available() && p.categories.includes(category));
}

export function status() {
  return Object.values(REGISTRY).map(p => ({ name: p.name, available: p.available(), categories: p.categories, enabled: config.providers.includes(p.name) || p === ddg || p === bing || p === openverse }));
}

export async function search({ q, category = 'web', page = 1, lang = config.defaultLang }) {
  if (!CATEGORIES.includes(category)) throw Object.assign(new Error('Catégorie inconnue'), { status: 400 });
  q = q.trim().slice(0, 300);
  page = Math.min(Math.max(1, Number(page) || 1), 10);
  const key = `${category}|${lang}|${page}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };

  const started = Date.now();
  const errors = [];
  for (const p of providerChain(category)) {
    try {
      const raw = await p.search({ q, category, page, lang });
      const payload = Array.isArray(raw) ? { results: raw } : raw;
      const results = dedupe(payload.results || []);
      if (!results.length) { errors.push(`${p.name}: aucun résultat`); continue; }
      if (!looksRelevant(q, results)) { errors.push(`${p.name}: résultats hors sujet (réponse anti-robot probable)`); continue; }
      const out = {
        query: q, category, page, lang, provider: p.name,
        results, infobox: payload.infobox || null, suggestions: payload.suggestions || [],
        took: Date.now() - started, cached: false,
      };
      cache.set(key, out);
      return out;
    } catch (e) {
      errors.push(`${p.name}: ${e.message}`);
    }
  }
  const err = new Error('Aucun fournisseur de résultats disponible');
  err.status = 503; err.details = errors;
  throw err;
}

// Certains moteurs servent des résultats « leurres » aux IP de centres de données. On vérifie qu'une part
// raisonnable des résultats contient au moins un mot significatif de la requête avant de les accepter.
function looksRelevant(q, results) {
  const terms = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) || [];
  if (!terms.length) return true;
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Un résultat est pertinent s'il contient au moins la moitié des mots de la requête.
  const hits = results.filter(r => {
    const hay = norm(`${r.title} ${r.snippet} ${r.url}`);
    return terms.filter(t => hay.includes(t)).length >= Math.ceil(terms.length / 2);
  }).length;
  return hits / results.length >= 0.3;
}

function dedupe(results) {
  const seen = new Set();
  return results.filter(r => {
    const k = (r.image?.full || r.url || '').replace(/\/$/, '').toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });
}
