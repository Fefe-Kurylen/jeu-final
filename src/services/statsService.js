// Statistiques de l'écran d'administration (décision du 29 octobre 2026, administrateurs) : 30 derniers jours, jours de
// Paris. Inscriptions, joueurs actifs (analytics interne : au moins un événement dans la journée), rétention J1 et J7,
// achats vérifiés par produit, entonnoir du tutoriel, combats, échanges au marché, civilisations.
const prisma = require('../config/database');

const DAYS = 30;
const DAY_SQL = (col) => `to_char(("${col}" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')`;

// les 30 jours (Paris), du plus ancien au plus récent
function dayKeys(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
  const keys = [];
  for (let i = DAYS - 1; i >= 0; i--) keys.push(fmt.format(new Date(now.getTime() - i * 86400000)));
  return [...new Set(keys)];
}
// [{ d, n }] -> une valeur par jour (0 les jours sans rien)
function series(keys, rows, field = 'n') {
  const by = new Map(rows.map(r => [r.d, Number(r[field]) || 0]));
  return keys.map(d => ({ d, v: by.get(d) || 0 }));
}

async function stats(now = new Date()) {
  const keys = dayKeys(now);
  const since = new Date(now.getTime() - (DAYS + 1) * 86400000);
  const q = (sqlText, ...args) => prisma.$queryRawUnsafe(sqlText, ...args);
  const [signups, active, battles, trades, purchases, factions, products] = await Promise.all([
    q(`SELECT ${DAY_SQL('createdAt')} AS d, count(*)::int AS n FROM "Account" WHERE "createdAt" >= $1 GROUP BY 1`, since),
    q(`SELECT ${DAY_SQL('createdAt')} AS d, count(DISTINCT "playerId")::int AS n FROM "AnalyticsEvent" WHERE "createdAt" >= $1 AND "playerId" IS NOT NULL GROUP BY 1`, since),
    q(`SELECT ${DAY_SQL('createdAt')} AS d, count(*)::int AS n FROM "BattleReport" WHERE "createdAt" >= $1 AND "playerId" = "attackerId" GROUP BY 1`, since),
    q(`SELECT ${DAY_SQL('acceptedAt')} AS d, count(*)::int AS n, coalesce(sum("sellAmount" + "buyAmount"), 0)::bigint AS vol FROM "MarketOffer" WHERE "acceptedAt" >= $1 GROUP BY 1`, since),
    q(`SELECT ${DAY_SQL('purchasedAt')} AS d, "productId" AS p, count(*)::int AS n FROM "Purchase" WHERE "purchasedAt" >= $1 AND status <> 'REFUNDED' GROUP BY 1, 2`, since),
    q(`SELECT faction AS f, count(*)::int AS n FROM "Player" GROUP BY 1 ORDER BY 2 DESC`),
    Promise.resolve((() => { try { return require('../../data/products.json'); } catch (e) { return []; } })())
  ]);
  // rétention : parmi les comptes créés sur la période, la part revenue le lendemain (J1) et 7 jours après (J7)
  const retention = await q(`
    WITH c AS (SELECT p.id, (a."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date AS d0 FROM "Account" a JOIN "Player" p ON p."accountId" = a.id WHERE a."createdAt" >= $1),
         e AS (SELECT DISTINCT "playerId" AS id, ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date AS d FROM "AnalyticsEvent" WHERE "createdAt" >= $1 AND "playerId" IS NOT NULL)
    SELECT
      count(*) FILTER (WHERE c.d0 <= (now() AT TIME ZONE 'Europe/Paris')::date - 1)::int AS n1,
      count(*) FILTER (WHERE c.d0 <= (now() AT TIME ZONE 'Europe/Paris')::date - 1 AND EXISTS (SELECT 1 FROM e WHERE e.id = c.id AND e.d = c.d0 + 1))::int AS r1,
      count(*) FILTER (WHERE c.d0 <= (now() AT TIME ZONE 'Europe/Paris')::date - 7)::int AS n7,
      count(*) FILTER (WHERE c.d0 <= (now() AT TIME ZONE 'Europe/Paris')::date - 7 AND EXISTS (SELECT 1 FROM e WHERE e.id = c.id AND e.d = c.d0 + 7))::int AS r7
    FROM c`, since);
  const R = retention[0] || {};
  // entonnoir du tutoriel : les nouveaux joueurs de la période, étape par étape
  const quests = (() => { try { return require('../../data/quests.json').tutorial || []; } catch (e) { return []; } })();
  const [cohort, firstBuild, claims, done] = await Promise.all([
    q(`SELECT count(*)::int AS n FROM "Player" WHERE "createdAt" >= $1`, since),
    q(`SELECT count(DISTINCT e."playerId")::int AS n FROM "AnalyticsEvent" e JOIN "Player" p ON p.id = e."playerId" WHERE e.event = 'first_build' AND p."createdAt" >= $1`, since),
    q(`SELECT c."questKey" AS k, count(DISTINCT c."playerId")::int AS n FROM "QuestClaim" c JOIN "Player" p ON p.id = c."playerId" WHERE p."createdAt" >= $1 GROUP BY 1`, since),
    q(`SELECT count(*)::int AS n FROM "Player" WHERE "createdAt" >= $1 AND "tutorialDone"`, since)
  ]);
  const claimed = new Map(claims.map(c => [c.k, c.n]));
  const funnel = [
    { label: 'Inscrits', n: cohort[0]?.n || 0 },
    { label: 'Premier bâtiment', n: firstBuild[0]?.n || 0 },
    ...quests.map(t => ({ label: t.title || t.key, n: claimed.get(t.key) || 0 })),
    { label: 'Tutoriel terminé ou passé', n: done[0]?.n || 0 }
  ];
  const productName = new Map(products.map(p => [p.id, p.name]));
  const byProduct = new Map();
  for (const r of purchases) byProduct.set(r.p, (byProduct.get(r.p) || 0) + r.n);
  const purchaseDays = new Map();
  for (const r of purchases) purchaseDays.set(r.d, (purchaseDays.get(r.d) || 0) + r.n);
  return {
    days: keys,
    signups: series(keys, signups),
    active: series(keys, active),
    retention: { d1: R.n1 ? R.r1 / R.n1 : null, d7: R.n7 ? R.r7 / R.n7 : null, n1: R.n1 || 0, n7: R.n7 || 0 },
    purchases: { days: keys.map(d => ({ d, v: purchaseDays.get(d) || 0 })), products: [...byProduct.entries()].map(([id, n]) => ({ id, name: productName.get(id) || id, n })).sort((a, b) => b.n - a.n) },
    funnel,
    battles: series(keys, battles),
    trades: series(keys, trades),
    tradeVolume: trades.reduce((t, r) => t + Number(r.vol || 0), 0),
    factions: factions.map(f => ({ faction: f.f, n: f.n }))
  };
}

module.exports = { stats, dayKeys, series, DAYS };
