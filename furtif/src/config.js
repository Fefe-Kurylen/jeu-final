const env = process.env;

export const config = {
  port: Number(env.PORT) || 4000,
  providers: (env.PROVIDERS || 'brave,searxng,ddg,bing').split(',').map(s => s.trim()).filter(Boolean),
  braveApiKey: env.BRAVE_API_KEY || '',
  searxngUrl: (env.SEARXNG_URL || '').replace(/\/$/, ''),
  defaultLang: env.DEFAULT_LANG || 'fr-FR',
  cacheTtl: Number(env.CACHE_TTL) || 300,
  rateLimitPerMin: Number(env.RATE_LIMIT_PER_MIN) || 60,
  fetchTimeoutMs: 8000,
  // User-Agent "navigateur" utilisé pour les fournisseurs lus en HTML.
  browserUA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
};

export const CATEGORIES = ['web', 'images', 'news'];
