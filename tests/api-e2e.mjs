// End-to-end API test: plays a real game session against a running server (API_BASE, default localhost:3000)
// with direct database access to fast-forward timers (DATABASE_URL via psql).
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const Terrain = createRequire(import.meta.url)('../frontend/js/shared/terrain.js');

const BASE = process.env.API_BASE || 'http://localhost:3000';
const DB = process.env.DATABASE_URL || 'postgresql://monjeu:monjeu123@localhost:5432/monjeu';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNITS = JSON.parse(readFileSync(path.join(ROOT, 'data/units.json'), 'utf8')).units;
const results = [];
const sql = (q) => execSync(`psql "${DB}" -At -c ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uid = Math.floor(performance.now() * 1000) % 1e7;
const PASSWORD = 'Test1234!';
const MAIL_LOG = process.env.EMAIL_LOG_FILE || '';
const mailsTo = (email) => MAIL_LOG && existsSync(MAIL_LOG) ? readFileSync(MAIL_LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(m => m.to === email) : [];

async function call(name, method, path, token, body, expect = 'ok') {
  let status = 0, json = null, text = '';
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    text = await res.text();
    try { json = JSON.parse(text); } catch { json = null; }
  } catch (e) { text = String(e); }
  const ok = expect === 'ok' ? status >= 200 && status < 300 : Array.isArray(expect) ? expect.includes(status) : status === expect;
  results.push({ name, method, path, status, ok, detail: ok ? '' : text.slice(0, 220) });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${status}] ${name}${ok ? '' : ' -> ' + text.slice(0, 220)}`);
  return json;
}
function assert(name, ok, detail = '') {
  results.push({ name, ok, status: 0, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' (' + detail + ')' : ''}`);
}
async function waitTick(label, cond, timeoutMs = 75000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (cond()) { console.log(`  .. ${label} OK after ${Math.round((performance.now() - t0) / 1000)}s`); return true; }
    await sleep(3000);
  }
  console.log(`  .. ${label} TIMEOUT`);
  results.push({ name: `tick: ${label}`, ok: false, status: 0, detail: 'timeout waiting for tick' });
  return false;
}
const unitKeyFor = (faction, cls, tier) => UNITS.find(z => z.faction === faction && z.class === cls && z.tier === tier)?.key || '';
const addBuilding = (cityId, key, slot, level) => sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) VALUES (gen_random_uuid(),'${cityId}','${key}',${slot},${level}) ON CONFLICT DO NOTHING`);
// armée de transport faite à la main (marché : livraison par armées, décision du 27 octobre 2026)
const mkTrader = (owner, cityId, name, unitKey, count = 100) => {
  const id = sql(`INSERT INTO "Army"(id,"ownerId","cityId",name,x,y,status) SELECT gen_random_uuid(),'${owner}','${cityId}','${name}',x,y,'IDLE' FROM "City" WHERE id='${cityId}' RETURNING id`).split('\n')[0];
  sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${id}','${unitKey}','base',${count})`);
  return id;
};
const richCity = (cityId) => sql(`UPDATE "City" SET wood=50000, stone=50000, iron=50000, food=50000, "maxStorage"=100000, "maxFoodStorage"=100000 WHERE id='${cityId}'`);
// Local test database: the shared sign-up limiter (10 per minute per address) must not fail a suite run right after another one
try { sql('DELETE FROM "RateLimitBucket" WHERE key LIKE \'register:%\' OR key LIKE \'auth:%\''); } catch (e) { /* no SQL access */ }

// ---------- CARTE DU SERVEUR ----------
// Chaque serveur a sa carte, tirée d'une graine (une base neuve en tire une au hasard) : le test calcule ses chemins et ses
// cases libres sur la même carte que le serveur
let worldInfo = null;
for (let i = 0; i < 20 && !worldInfo; i++) {
  const res = await fetch(BASE + '/api/world/info').catch(() => null);
  if (res && res.ok) worldInfo = await res.json(); else await sleep(1000);
}
assert('world info gives the map seed', Number.isInteger(worldInfo?.worldSeed) && worldInfo.worldSeed >= 0 && worldInfo.worldSeed <= Terrain.MAX_SEED, JSON.stringify(worldInfo?.worldSeed));
Terrain.setWorldSeed(worldInfo?.worldSeed ?? 0);
console.log(`  carte du serveur : graine ${Terrain.worldSeed} (pour la rejouer : base vide + WORLD_SEED=${Terrain.worldSeed})`);
try {
  assert('the seed is the one stored for this world (one WorldConfig row)', sql('SELECT count(*)||\':\'||max(seed) FROM "WorldConfig"') === `1:${Terrain.worldSeed}`);
} catch (e) { /* no SQL access */ }
assert('terrain version asked for this map', worldInfo?.terrainVersion === Terrain.minClientVersion && Terrain.minClientVersion <= Terrain.TERRAIN_VERSION, `${worldInfo?.terrainVersion}`);
assert('the server and this code draw the same map (signature)', worldInfo?.terrainSignature === Terrain.signature, `${worldInfo?.terrainSignature} / ${Terrain.signature}`);
try {
  assert('the world is open and its generator stored', sql('SELECT generator||\':\'||("readyAt" IS NOT NULL)::text FROM "WorldConfig" WHERE id=1') === `${Terrain.generator}:true`);
} catch (e) { /* no SQL access */ }

// ---------- AUTH ----------
const A = await call('register A (ROME)', 'POST', '/api/auth/register', null, { email: `a${uid}@t.fr`, password: PASSWORD, name: `Alpha${uid}`, faction: 'ROME' });
const B = await call('register B (HUN)', 'POST', '/api/auth/register', null, { email: `b${uid}@t.fr`, password: PASSWORD, name: `Beta${uid}`, faction: 'HUN' });
await call('register duplicate email -> 400', 'POST', '/api/auth/register', null, { email: `a${uid}@t.fr`, password: PASSWORD, name: `Gamma${uid}`, faction: 'GAUL' }, 400);
await call('register same pseudo other case -> 400', 'POST', '/api/auth/register', null, { email: `aa${uid}@t.fr`, password: PASSWORD, name: `alpha${uid}`, faction: 'GAUL' }, 400);
await call('register bad faction -> 400', 'POST', '/api/auth/register', null, { email: `c${uid}@t.fr`, password: PASSWORD, name: `Delta${uid}`, faction: 'ATLANTIS' }, 400);
await call('register short password -> 400', 'POST', '/api/auth/register', null, { email: `c${uid}@t.fr`, password: 'short', name: `Delta${uid}`, faction: 'GAUL' }, 400);
await call('login A', 'POST', '/api/auth/login', null, { email: `a${uid}@t.fr`, password: PASSWORD });
await call('login wrong password -> 401', 'POST', '/api/auth/login', null, { email: `a${uid}@t.fr`, password: 'nope-nope' }, 401);
await call('login with non-string email -> 400', 'POST', '/api/auth/login', null, { email: 123, password: PASSWORD }, 400);
await call('no token -> 401', 'GET', '/api/player/me', null, null, 401);
await call('bad token -> 401', 'GET', '/api/player/me', 'garbage', null, 401);
const tA = A.token, tB = B.token;

// ---------- PLAYER / CITY ----------
const meA = await call('player/me A', 'GET', '/api/player/me', tA);
await call('player/:id (B profile)', 'GET', `/api/player/${B.player.id}`, tA);
let citiesA = await call('cities A', 'GET', '/api/cities', tA);
let citiesB = await call('cities B', 'GET', '/api/cities', tB);
const cityA = citiesA[0], cityB = citiesB[0];
console.log(`  city A @(${cityA.x},${cityA.y}) buildings=${cityA.buildings.length}; city B @(${cityB.x},${cityB.y})`);
for (const c of [cityA, cityB]) {
  // la capitale est posée sur la carte du serveur : ses 2 × 2 cases sur la terre ferme, ni relief, ni eau, ni passage
  const ok = Terrain.isMainland(c.x, c.y) && Terrain.cityCells(c.x, c.y).every(([x, y]) => { const f = Terrain.getTerrainType(x, y).feature; return Terrain.inWorld(x, y) && !Terrain.BLOCKED[f] && f !== 'bridge' && f !== 'ford'; });
  assert(`capital @(${c.x},${c.y}) stands on free land of this map`, ok);
}
assert('spawn tile is not a resource node', sql(`SELECT count(*) FROM "ResourceNode" WHERE (x,y) IN ((${cityA.x},${cityA.y}),(${cityB.x},${cityB.y}))`) === '0');
richCity(cityA.id); richCity(cityB.id);

// ---------- BUILD ----------
await call('build MAIN_HALL', 'POST', `/api/city/${cityA.id}/build`, tA, { buildingKey: 'MAIN_HALL' });
await call('build FARM slot 113', 'POST', `/api/city/${cityA.id}/build`, tA, { buildingKey: 'FARM', slot: 113 });
await call('build LUMBER slot 101 (queued)', 'POST', `/api/city/${cityA.id}/build`, tA, { buildingKey: 'LUMBER', slot: 101 });
await call('build FARM on a ring slot -> 400', 'POST', `/api/city/${cityA.id}/build`, tA, { buildingKey: 'FARM', slot: 5 }, 400);
await call('build FARM slot 999 -> 400', 'POST', `/api/city/${cityA.id}/build`, tA, { buildingKey: 'FARM', slot: 999 }, 400);
assert('new city has MAIN_HALL L1 at slot 0', sql(`SELECT slot||'@'||level FROM "CityBuilding" WHERE "cityId"='${cityA.id}' AND key='MAIN_HALL'`) === '0@1');
await call('build unknown -> 400', 'POST', `/api/city/${cityA.id}/build`, tA, { buildingKey: 'NOPE' }, 400);
{
  const woodBefore = Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`));
  const q = await call('build QUARRY slot 105 (queued, to cancel)', 'POST', `/api/city/${cityA.id}/build`, tA, { buildingKey: 'QUARRY', slot: 105 });
  const woodPaid = woodBefore - Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`));
  const c = await call('cancel queued build (full refund)', 'DELETE', `/api/city/${cityA.id}/build/${q.queueItem.id}`, tA);
  const woodAfter = Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`));
  assert('queued build fully refunded', Math.abs(woodAfter - woodBefore) <= 1 && c?.refund?.wood === q.cost.wood, `paid ${woodPaid}, refund ${c?.refund?.wood}`);
  await call('cancel it again -> 404', 'DELETE', `/api/city/${cityA.id}/build/${q.queueItem.id}`, tA, null, 404);
  await call('cancel on another player city -> 404', 'DELETE', `/api/city/${cityB.id}/build/${q.queueItem.id}`, tA, null, 404);
}
await call('build on B city with A token -> 404', 'POST', `/api/city/${cityB.id}/build`, tA, { buildingKey: 'MAIN_HALL' }, 404);
await call('build GREAT_BARRACKS w/o prereqs -> 400', 'POST', `/api/city/${cityB.id}/build`, tB, { buildingKey: 'GREAT_BARRACKS' }, 400);

// ---------- RESEARCH (technologies at the Academy) ----------
{
  const techs = await call('technologies catalogue', 'GET', '/api/technologies', tA);
  assert('catalogue: 4 branches and the Agronomy technology', techs?.branches?.length === 4 && techs?.technologies?.some(t => t.key === 'AGRONOMY'));
  const r0 = await call('research state (nothing yet)', 'GET', `/api/research?cityId=${cityA.id}`, tA);
  assert('no technology researched, empty queue', r0 && Object.keys(r0.levels || {}).length === 0 && (r0.queue || []).length === 0);
  await call('start research without Academy -> 400', 'POST', '/api/research/start', tA, { cityId: cityA.id, techKey: 'AGRONOMY' }, 400);
  await call('start research unknown tech -> 400', 'POST', '/api/research/start', tA, { cityId: cityA.id, techKey: 'ALCHEMY' }, 400);
  await call('start research on B city with A token -> 404', 'POST', '/api/research/start', tA, { cityId: cityB.id, techKey: 'AGRONOMY' }, 404);
  sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) VALUES (gen_random_uuid(),'${cityA.id}','ACADEMY',9,2) ON CONFLICT ("cityId",slot) DO UPDATE SET key='ACADEMY', level=2`);
  const r1 = await call('research state with Academy L2', 'GET', `/api/research?cityId=${cityA.id}`, tA);
  const agro = r1?.city?.technologies?.find(t => t.key === 'AGRONOMY');
  assert('Agronomy startable at level 1', !!agro && agro.nextLevel === 1 && agro.blocker === null, JSON.stringify(agro));
  assert('Engineering blocked by its prerequisite', /Agronomie/.test(r1?.city?.technologies?.find(t => t.key === 'ENGINEERING')?.blocker || ''));
  const woodBefore = Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`));
  const s1 = await call('start Agronomy level 1', 'POST', '/api/research/start', tA, { cityId: cityA.id, techKey: 'AGRONOMY' });
  const woodAfter = Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`));
  assert('research cost debited', !!s1?.cost && woodBefore - woodAfter === s1.cost.wood, `paid ${woodBefore - woodAfter}, cost ${s1?.cost?.wood}`);
  assert('first research runs at once', s1?.queueItem?.status === 'RUNNING' && s1?.queueItem?.targetLevel === 1);
  await call('start Engineering without prerequisite -> 400', 'POST', '/api/research/start', tA, { cityId: cityA.id, techKey: 'ENGINEERING' }, 400);
  const s2 = await call('start Agronomy level 2 (queued)', 'POST', '/api/research/start', tA, { cityId: cityA.id, techKey: 'AGRONOMY' });
  assert('second research waits in the queue', s2?.queueItem?.status === 'QUEUED' && s2?.queueItem?.targetLevel === 2);
  await call('third research -> 400 (queue full)', 'POST', '/api/research/start', tA, { cityId: cityA.id, techKey: 'TRAINING' }, 400);
  const woodQ = Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`));
  const c2 = await call('cancel the queued research (full refund)', 'DELETE', `/api/research/${s2.queueItem.id}`, tA);
  assert('queued research fully refunded', c2?.refund?.wood === s2.cost.wood && Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`)) - woodQ === s2.cost.wood, `refund ${c2?.refund?.wood} vs ${s2?.cost?.wood}`);
  await call('cancel it again -> 404', 'DELETE', `/api/research/${s2.queueItem.id}`, tA, null, 404);
  await call('cancel A research with B token -> 404', 'DELETE', `/api/research/${s1.queueItem.id}`, tB, null, 404);
  sql(`UPDATE "ResearchQueueItem" SET "endsAt"=now()-interval '1 second' WHERE id='${s1.queueItem.id}'`);
  const r2 = await call('research state after completion', 'GET', `/api/research?cityId=${cityA.id}`, tA);
  assert('Agronomy level 1 researched, queue empty', r2?.levels?.AGRONOMY === 1 && (r2.queue || []).length === 0, JSON.stringify(r2?.levels));
  const meT = await call('player/me carries techLevels', 'GET', '/api/player/me', tA);
  assert('techLevels in the profile', meT?.techLevels?.AGRONOMY === 1, JSON.stringify(meT?.techLevels));
  const s3 = await call('start Agronomy level 2', 'POST', '/api/research/start', tA, { cityId: cityA.id, techKey: 'AGRONOMY' });
  assert('level 2 allowed by an Academy L2', s3?.queueItem?.targetLevel === 2 && s3?.queueItem?.status === 'RUNNING');
  await call('Agronomy level 3 -> 400 (above the Academy level)', 'POST', '/api/research/start', tA, { cityId: cityA.id, techKey: 'AGRONOMY' }, 400);
  const c3 = await call('cancel the running research (half refund)', 'DELETE', `/api/research/${s3.queueItem.id}`, tA);
  assert('running research refunded by half', c3?.refund?.wood === Math.floor(s3.cost.wood * 0.5), `${c3?.refund?.wood} vs ${s3?.cost?.wood}`);
  // Leave the city as it was for the rest of the run
  sql(`DELETE FROM "CityBuilding" WHERE "cityId"='${cityA.id}' AND key='ACADEMY' AND slot=9`);
  sql(`DELETE FROM "PlayerTechnology" WHERE "playerId"='${A.player.id}'`);
}
// Lazy settlement: a due item is applied when the player reads their cities, without waiting for the tick
sql(`UPDATE "BuildQueueItem" SET "endsAt"=now()-interval '1 second', "startedAt"=now()-interval '2 second' WHERE "cityId"='${cityA.id}'`);
citiesA = await call('cities A after build (settles due items)', 'GET', '/api/cities', tA);
// The two RUNNING items are applied by the read itself and the QUEUED one is promoted to RUNNING at once
assert('due builds applied on read', citiesA[0].buildings.length >= 2 && citiesA[0].buildings.some(b => b.key === 'MAIN_HALL' && b.level === 2), citiesA[0].buildings.map(b => `${b.key}:${b.level}@${b.slot}`).join(' '));
assert('queued build promoted on read', sql(`SELECT string_agg(status, ',') FROM "BuildQueueItem" WHERE "cityId"='${cityA.id}'`) === 'RUNNING');
sql(`UPDATE "BuildQueueItem" SET "endsAt"=now()-interval '1 second' WHERE "cityId"='${cityA.id}'`);
citiesA = await call('cities A after queue completion', 'GET', '/api/cities', tA);
assert('promoted build applied on read', citiesA[0].buildings.length >= 3 && citiesA[0].buildQueue.length === 0, citiesA[0].buildings.map(b => `${b.key}:${b.level}@${b.slot}`).join(' '));
console.log('  A buildings:', citiesA[0].buildings.map(b => `${b.key}:${b.level}@${b.slot}`).join(' '), '| queue:', citiesA[0].buildQueue.map(q => `${q.buildingKey}->${q.targetLevel} ${q.status}`).join(' '));
assert('population updated on build completion', Number(sql(`SELECT population FROM "Player" WHERE id='${A.player.id}'`)) > 0);

// Setup for military tests (not under test): barracks, rally point, market, main hall level 10
for (const cid of [cityA.id, cityB.id]) { addBuilding(cid, 'BARRACKS', 30, 10); addBuilding(cid, 'RALLY_POINT', 31, 10); addBuilding(cid, 'MARKET', 32, 1); addBuilding(cid, 'EMBASSY', 33, 7); }
addBuilding(cityA.id, 'WORKSHOP', 34, 2);
sql(`UPDATE "CityBuilding" SET level=10 WHERE "cityId" IN ('${cityA.id}','${cityB.id}') AND key='MAIN_HALL'`);

// ---------- RECRUIT ----------
const infKey = unitKeyFor('ROME', 'INFANTRY', 'base');
await call('recruit 5 inf (own faction)', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: infKey, count: 5 });
await call('recruit HUN unit as ROME -> 400', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: unitKeyFor('HUN', 'INFANTRY', 'base'), count: 1 }, 400);
await call('recruit count 0 -> 400', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: infKey, count: 0 }, 400);
await call('recruit elite w/ barracks 10 -> 400', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: unitKeyFor('ROME', 'INFANTRY', 'elite'), count: 1 }, 400);
await call('recruit batch #2 same unit', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: infKey, count: 7 });
await call('recruit batch #3 same unit', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: infKey, count: 11 });
await call('recruit batch #4', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: infKey, count: 1 });
await call('recruit batch #5', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: infKey, count: 1 });
await call('recruit batch #6 -> 400 (queue cap)', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: infKey, count: 1 }, 400);
{
  const last = sql(`SELECT id FROM "RecruitQueueItem" WHERE "cityId"='${cityA.id}' ORDER BY "endsAt" DESC LIMIT 1`);
  const ironBefore = Number(sql(`SELECT iron FROM "City" WHERE id='${cityA.id}'`));
  const c = await call('cancel last recruit batch (half refund)', 'DELETE', `/api/city/${cityA.id}/recruit/${last}`, tA);
  const ironAfter = Number(sql(`SELECT iron FROM "City" WHERE id='${cityA.id}'`));
  assert('recruit cancel refunds half', c?.refund && ironAfter > ironBefore && Number(sql(`SELECT count(*) FROM "RecruitQueueItem" WHERE "cityId"='${cityA.id}'`)) === 4, `iron ${ironBefore} -> ${ironAfter}, refund ${JSON.stringify(c?.refund)}`);
  await call('recruit batch #5 again after cancel', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: infKey, count: 1 });
}
sql(`UPDATE "RecruitQueueItem" SET "endsAt"=now()-interval '1 second' WHERE "cityId"='${cityA.id}'`);
await waitTick('recruits complete', () => Number(sql(`SELECT count(*) FROM "RecruitQueueItem" WHERE "cityId"='${cityA.id}'`)) === 0);
const garrisonCount = Number(sql(`SELECT coalesce(sum(u.count),0) FROM "ArmyUnit" u JOIN "Army" a ON a.id=u."armyId" WHERE a."cityId"='${cityA.id}' AND a."isGarrison" AND u."unitKey"='${infKey}'`));
assert('recruit: 5 batches (5+7+11+1+1) all credited = 25', garrisonCount === 25, `garrison has ${garrisonCount}`);

// Seed B garrison with defenders, A garrison with more attackers
const garB = sql(`SELECT id FROM "Army" WHERE "cityId"='${cityB.id}' AND "isGarrison" LIMIT 1`);
sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${garB}','${unitKeyFor('HUN', 'INFANTRY', 'base')}','base',20) ON CONFLICT ("armyId","unitKey") DO UPDATE SET count=20`);
const garA = sql(`SELECT id FROM "Army" WHERE "cityId"='${cityA.id}' AND "isGarrison" LIMIT 1`);
sql(`UPDATE "ArmyUnit" SET count=200 WHERE "armyId"='${garA}' AND "unitKey"='${infKey}'`);
sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${garA}','${unitKeyFor('ROME', 'CAVALRY', 'base')}','base',50) ON CONFLICT ("armyId","unitKey") DO UPDATE SET count=50`);
const siegeKey = UNITS.find(z => z.faction === 'ROME' && z.class === 'SIEGE').key;
sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${garA}','${siegeKey}','siege',12) ON CONFLICT ("armyId","unitKey") DO UPDATE SET count=12`);

// ---------- ARMIES ----------
await call('armies list A', 'GET', '/api/armies', tA);
await call('army create slot 4 with rally 10 -> 400', 'POST', '/api/army/create', tA, { cityId: cityA.id, slot: 4, name: 'Legio IV' }, 400);
const armyNew = await call('army create', 'POST', '/api/army/create', tA, { cityId: cityA.id, slot: 1, name: 'Legio I' });
const armyId = armyNew?.army?.id || armyNew?.id;
await call('army get', 'GET', `/api/army/${armyId}`, tA);
await call('army rename (PATCH)', 'PATCH', `/api/army/${armyId}/rename`, tA, { name: 'Legio Prima' });
await call('army rename pure-HTML name -> 400', 'PATCH', `/api/army/${armyId}/rename`, tA, { name: '<img src=x onerror=alert(1)>' }, 400);
await call('army rename mixed HTML (POST alias, sanitized)', 'POST', `/api/army/${armyId}/rename`, tA, { name: 'Legio "<b>X</b>" <script>' });
const storedName = sql(`SELECT name FROM "Army" WHERE id='${armyId}'`);
assert('army name stored without raw HTML', !/[<>]/.test(storedName), `stored: ${storedName}`);
await call('army set-unit 60 inf', 'POST', `/api/army/${armyId}/set-unit`, tA, { unitKey: infKey, count: 60 });
await call('army adjust-unit +10 cav', 'POST', `/api/army/${armyId}/adjust-unit`, tA, { unitKey: unitKeyFor('ROME', 'CAVALRY', 'base'), delta: 10 });
const clamp = await call('army set-unit 99999 (clamped to garrison)', 'POST', `/api/army/${armyId}/set-unit`, tA, { unitKey: infKey, count: 99999 });
console.log('  clamp result:', JSON.stringify(clamp));
await call('army set-unit back to 60', 'POST', `/api/army/${armyId}/set-unit`, tA, { unitKey: infKey, count: 60 });
// no siege without at least one engine (no tier minimum, no escort, no Workshop cap: décision du 25 octobre 2026)
const noEngine = await call('attack without any siege engine -> 400', 'POST', `/api/army/${armyId}/attack`, tA, { targetCityId: cityB.id }, 400);
assert('a siege needs at least one engine', /engin/.test(noEngine?.error || ''), noEngine?.error);
assert('cities list carries the tier from the Main Hall', (await call('cities A (tier)', 'GET', '/api/cities', tA))?.find(c => c.id === cityA.id)?.cityTierName === 'Ville');
const uncapped = await call('army set-unit 12 siege (no cap any more)', 'POST', `/api/army/${armyId}/set-unit`, tA, { unitKey: siegeKey, count: 12 });
assert('an army takes as many siege engines as it has', uncapped?.newCount === 12 && uncapped?.maxSiegeEngines === undefined, JSON.stringify(uncapped));
await call('army set-unit 10 siege', 'POST', `/api/army/${armyId}/set-unit`, tA, { unitKey: siegeKey, count: 10 });
await call('assign-hero (moves hero from garrison)', 'POST', `/api/army/${armyId}/assign-hero`, tA, {});
assert('hero moved garrison -> army', sql(`SELECT count(*) FROM "Army" WHERE id='${armyId}' AND "heroId" IS NOT NULL`) === '1' && sql(`SELECT count(*) FROM "Army" WHERE id='${garA}' AND "heroId" IS NOT NULL`) === '0');
await call('army unassign-hero', 'POST', `/api/army/${armyId}/unassign-hero`, tA, {});
await call('army get other player army -> 404', 'GET', `/api/army/${armyId}`, tB, null, 404);

// ---------- ATTACK ----------
// Healing Tent in A: the attacker's wounded travel home with the army and only enter the tent on arrival
const tentSlot = sql(`SELECT MIN(s) FROM generate_series(1,19) s WHERE s NOT IN (SELECT slot FROM "CityBuilding" WHERE "cityId"='${cityA.id}')`);
addBuilding(cityA.id, 'HEALING_TENT', Number(tentSlot), 5);
sql(`DELETE FROM "WoundedUnit" WHERE "cityId"='${cityA.id}'`);
await call('army attack B (70 soldiers and 10 engines are enough)', 'POST', `/api/army/${armyId}/attack`, tA, { targetCityId: cityB.id });
await call('incoming attacks B', 'GET', '/api/city/incoming-attacks', tB);
await call('attack own city -> 400', 'POST', `/api/army/${armyId}/attack`, tA, { targetCityId: cityA.id }, 400);
const bUnitsBefore = Number(sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" WHERE "armyId"='${garB}'`));
// B gets a level-5 wall (5 000 HP) for the siege
const wallSlotB = sql(`SELECT MIN(s) FROM generate_series(1,19) s WHERE s NOT IN (SELECT slot FROM "CityBuilding" WHERE "cityId"='${cityB.id}')`);
addBuilding(cityB.id, 'WALL', Number(wallSlotB), 5);
sql(`UPDATE "City" SET "wallHp"=5000, "wallMaxHp"=5000 WHERE id='${cityB.id}'`);
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
// ---------- SIEGE ----------
// The attack that arrives camps one hour before the city: no battle yet, the city is besieged
await waitTick('camp set up', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'BESIEGING');
assert('no battle when the attack arrives', Number(sql(`SELECT count(*) FROM "BattleReport" WHERE "attackerId"='${A.player.id}'`)) === 0);
assert('city flagged as besieged', sql(`SELECT "isSieged" FROM "City" WHERE id='${cityB.id}'`) === 't');
const fightAt0 = new Date(sql(`SELECT to_char("arrivalAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM "Army" WHERE id='${armyId}'`));
assert('the battle comes one hour after the camp is set up', fightAt0 - Date.now() > 55 * 60000 && fightAt0 - Date.now() <= 60 * 60000, `${Math.round((fightAt0 - Date.now()) / 60000)} min`);
const incB = await call('incoming attacks B (siege)', 'GET', '/api/city/incoming-attacks', tB);
assert('the siege shows in the alerts with its leader', Array.isArray(incB) && incB.some(a => a.type === 'SIEGE' && a.attacker));
const siegeB = await call('siege info B', 'GET', `/api/city/${cityB.id}/siege`, tB);
assert('siege info: one camp with 10 engines, B may break it, the countdown is shown to B', siegeB?.besieged === true && siegeB.besiegers?.length === 1 && siegeB.besiegers[0].engines === 10 && siegeB.canBreak === true && !!siegeB.besiegers[0].assaultAt, JSON.stringify(siegeB)?.slice(0, 200));
assert('siege info gives the lives of the city (Hun capital: 4)', siegeB?.livesLeft === 4 && siegeB?.livesTotal === 4 && siegeB?.wallHp === 5000, JSON.stringify(siegeB)?.slice(0, 300));
const siegeA = await call('siege info seen by the attacker', 'GET', `/api/city/${cityB.id}/siege`, tA);
assert('the attacker cannot break its own siege but sees its countdown', siegeA?.canBreak === false && siegeA.besiegers?.[0]?.mine === true && !!siegeA.besiegers[0].assaultAt);
assert('siege info gives both rules to the owner (sortie and homecoming)', siegeB?.canSortie === true && siegeB?.canForce === true && siegeA?.canSortie === false && siegeA?.canForce === false);
// B forms an army during the siege (allowed) and sallies out against the camp: open-field battle, B is much weaker
const sortie = await call('B forms an army while besieged', 'POST', '/api/army/create', tB, { cityId: cityB.id, slot: 1, name: 'Sortie' });
const sortieId = sortie?.army?.id;
await call('sortie set-unit 5 inf', 'POST', `/api/army/${sortieId}/set-unit`, tB, { unitKey: unitKeyFor('HUN', 'INFANTRY', 'base'), count: 5 });
const out = await call('an army of the besieged city cannot go elsewhere -> 400', 'POST', `/api/army/${sortieId}/move`, tB, { x: cityB.x + 3, y: cityB.y }, 400);
assert('the armies of a besieged city only leave to attack the camp', /attaquer le camp/.test(out?.error || ''), out?.error);
await call('break-siege with another player army -> 404', 'POST', `/api/army/${sortieId}/break-siege`, tA, { targetCityId: cityB.id }, 404);
await call('B sallies out against the besiegers', 'POST', `/api/army/${sortieId}/break-siege`, tB, { targetCityId: cityB.id });
await waitTick('sortie fought', () => Number(sql(`SELECT count(*) FROM "BattleReport" WHERE "attackerId"='${B.player.id}' AND loot->>'type'='SIEGE_BREAK'`)) >= 2);
assert('one report for each side of the sortie', sql(`SELECT count(*) FROM "BattleReport" WHERE "attackerId"='${B.player.id}' AND loot->>'type'='SIEGE_BREAK'`) === '2');
assert('the beaten sortie is back inside the city', sql(`SELECT status||':'||(x=${cityB.x} AND y=${cityB.y}) FROM "Army" WHERE id='${sortieId}'`) === 'IDLE:true');
assert('the siege holds after a failed sortie', sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'BESIEGING' && sql(`SELECT "isSieged" FROM "City" WHERE id='${cityB.id}'`) === 't');
// a sortie recalled before it has left the home tile is simply back inside: no forced fight against the camp
const recallArmy = await call('B forms a second army', 'POST', '/api/army/create', tB, { cityId: cityB.id, slot: 2, name: 'Rappel' });
const recallId = recallArmy?.army?.id;
sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${garB}','${unitKeyFor('HUN', 'INFANTRY', 'base')}','base',1) ON CONFLICT ("armyId","unitKey") DO UPDATE SET count="ArmyUnit".count+1`);
await call('second army set-unit 1 inf', 'POST', `/api/army/${recallId}/set-unit`, tB, { unitKey: unitKeyFor('HUN', 'INFANTRY', 'base'), count: 1 });
await call('second sortie launched', 'POST', `/api/army/${recallId}/break-siege`, tB, { targetCityId: cityB.id });
sql(`UPDATE "Army" SET "departedAt"=now(), "arrivalAt"=now()+interval '10 minutes' WHERE id='${recallId}'`);   // still on its home tile
const recalled = await call('sortie recalled at once', 'POST', `/api/army/${recallId}/return`, tB);
assert('a sortie recalled on its home tile is back inside at once', /rentrée en ville/.test(recalled?.message || '') && sql(`SELECT status||':'||(x=${cityB.x} AND y=${cityB.y})||':'||coalesce("missionType",'-') FROM "Army" WHERE id='${recallId}'`) === 'IDLE:true:-', recalled?.message);
assert('no battle for the recalled sortie', sql(`SELECT count(*) FROM "BattleReport" WHERE "attackerId"='${B.player.id}' AND loot->>'type'='SIEGE_BREAK'`) === '2');
assert('no manual assault: the battle comes by itself', (await fetch(`${BASE}/api/army/${armyId}/assault`, { method: 'POST', headers: { Authorization: `Bearer ${tA}` } })).status === 404);
// a camp blocks nothing in the city (décision du 25 octobre 2026): market, production, wall all go on
const siegeTrader = mkTrader(B.player.id, cityB.id, 'Mercator', unitKeyFor('HUN', 'INFANTRY', 'base'));
const siegeOffer = await call('market offer from a besieged city (allowed)', 'POST', '/api/market/offer', tB, { cityId: cityB.id, sellResource: 'wood', sellAmount: 100, buyResource: 'iron', buyAmount: 80, armyId: siegeTrader });
const siegeOfferId = siegeOffer?.offer?.id || siegeOffer?.id;
assert('the market stays open during a siege', !!siegeOfferId, JSON.stringify(siegeOffer)?.slice(0, 150));
if (siegeOfferId) await call('cancel that offer', 'DELETE', `/api/market/offer/${siegeOfferId}`, tB);
sql(`DELETE FROM "Army" WHERE id='${siegeTrader}'`);
const prodB0 = Number(sql(`SELECT wood FROM "City" WHERE id='${cityB.id}'`));
const wall0 = Number(sql(`SELECT "wallHp" FROM "City" WHERE id='${cityB.id}'`));
await sleep(32000);
assert('the camp does not wear the wall down', Number(sql(`SELECT "wallHp" FROM "City" WHERE id='${cityB.id}'`)) === wall0, `${wall0} -> ${sql(`SELECT "wallHp" FROM "City" WHERE id='${cityB.id}'`)}`);
assert('the besieged city still produces', Number(sql(`SELECT wood FROM "City" WHERE id='${cityB.id}'`)) > prodB0 || Number(sql(`SELECT wood FROM "City" WHERE id='${cityB.id}'`)) >= Number(sql(`SELECT "maxStorage" FROM "City" WHERE id='${cityB.id}'`)), `${prodB0} -> ${sql(`SELECT wood FROM "City" WHERE id='${cityB.id}'`)}`);
// the hour is over: the battle starts by itself, the wall as a shield (10 engines and 70 soldiers against 5 000 HP)
const garBBeforeBattle = Number(sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" WHERE "armyId"='${garB}'`));
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('battle resolved', () => Number(sql(`SELECT count(*) FROM "BattleReport" WHERE "attackerId"='${A.player.id}'`)) >= 1);
// the report is written inside the battle; the army leaves and the siege flag is cleared right after
await waitTick('army leaves after the battle', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'RETURNING', 20000);
assert('siege lifted after the battle', sql(`SELECT "isSieged" FROM "City" WHERE id='${cityB.id}'`) === 'f' && sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'RETURNING');
const quiet = await call('siege info of a city that is not besieged (other player)', 'GET', `/api/city/${cityB.id}/siege`, tA);
assert('no free look at the wall of a city that is not besieged', quiet?.besieged === false && quiet.wallHp === undefined && quiet.wallStructurePct === undefined, JSON.stringify(quiet));
assert('the report carries the wall as a shield and the camp time', Number(sql(`SELECT coalesce((loot->>'wallMaxHp')::int,0) FROM "BattleReport" WHERE "attackerId"='${A.player.id}' AND loot->>'type'='ATTACK' LIMIT 1`)) === 5000 && Number(sql(`SELECT coalesce((loot->>'campMinutes')::int,-1) FROM "BattleReport" WHERE "attackerId"='${A.player.id}' AND loot->>'type'='ATTACK' LIMIT 1`)) >= 0);
{ // a small army does not get through a level-5 wall: the city holds, its soldiers take nothing, no life lost
  const r = sql(`SELECT winner||':'||(loot->>'wallBroken') FROM "BattleReport" WHERE "attackerId"='${A.player.id}' AND loot->>'type'='ATTACK' LIMIT 1`);
  const ws = Number(sql(`SELECT round(("wallStructure"*100)::numeric) FROM "City" WHERE id='${cityB.id}'`));
  assert('behind a wall that holds, the city wins and keeps its lives', r === 'DEFENDER:false' && ws === 100, `${r}, lives ${ws} %`);
  assert('the defenders took no loss behind the wall', Number(sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" WHERE "armyId"='${garB}'`)) === garBBeforeBattle);
}
// ---------- IN-GAME NOTIFICATIONS ----------
// every alert is first a message in the game, with a link to what it is about (décision du 25 octobre 2026)
{
  const feedA = await call('notifications A', 'GET', '/api/notifications?limit=50', tA);
  const atkNote = feedA?.items?.find(n => /Votre attaque sur/.test(n.body));
  const atkReport = sql(`SELECT id FROM "BattleReport" WHERE "playerId"='${A.player.id}' AND loot->>'type'='ATTACK' ORDER BY "createdAt" DESC LIMIT 1`);
  assert('the battle is in the in-game feed with a link to the player\'s own report', atkNote?.link?.to === 'report' && atkNote.link.reportId === atkReport && atkNote.link.tab === 'reports', JSON.stringify(atkNote)?.slice(0, 200));
  const feedB = await call('notifications B', 'GET', '/api/notifications?limit=50', tB);
  const campNote = feedB?.items?.find(n => n.title.includes('Ville assiégée'));
  assert('the camp alert links to the siege window of the city', campNote?.link?.to === 'siege' && campNote.link.cityId === cityB.id && Number.isFinite(campNote.link.x), JSON.stringify(campNote)?.slice(0, 200));
  const defNote = feedB?.items?.find(n => /a été attaquée par/.test(n.body));
  assert('the defender\'s battle alert links to the defender\'s own report', defNote?.link?.to === 'report' && defNote.link.reportId === sql(`SELECT id FROM "BattleReport" WHERE "playerId"='${B.player.id}' AND loot->>'type'='ATTACK' ORDER BY "createdAt" DESC LIMIT 1`));
  assert('the feed counts the unread messages', feedB?.unread > 0 && feedB.items.every(n => n.playerId === B.player.id));
  const one = await call('mark one notification read', 'POST', '/api/notifications/read', tB, { ids: [campNote?.id] });
  assert('a read notification leaves the unread count', one?.marked === 1 && one.unread === feedB.unread - 1, JSON.stringify(one));
  await call('mark another player\'s notification -> nothing', 'POST', '/api/notifications/read', tA, { ids: [defNote?.id] });
  assert('nobody can mark another player\'s notifications', sql(`SELECT ("readAt" IS NULL)::text FROM "Notification" WHERE id='${defNote?.id}'`) === 'true');
  await call('mark bad ids -> 400', 'POST', '/api/notifications/read', tB, { ids: 'x' }, 400);
  const all = await call('mark all read', 'POST', '/api/notifications/read', tB, { all: true });
  const unread = await call('unread count', 'GET', '/api/notifications/unread', tB);
  assert('all read: the badge is back to zero, the latest is given for the toast', all?.unread === 0 && unread?.unread === 0 && !!unread?.latest?.id);
  const page2 = await call('older notifications (paging)', 'GET', `/api/notifications?limit=1&before=${feedB?.items?.[0]?.id}`, tB);
  assert('the feed pages backwards in time', Array.isArray(page2?.items) && page2.items.length === 1 && page2.items[0].id !== feedB.items[0].id);
}
const rep = await call('reports/battles A', 'GET', '/api/reports/battles', tA);
await call('reports/battles B', 'GET', '/api/reports/battles', tB);
if (Array.isArray(rep) && rep[0]) console.log('  battle:', JSON.stringify({ winner: rep[0].winner, aLoss: rep[0].attackerLosses?.rate, dLoss: rep[0].defenderLosses?.rate, wallDamage: rep[0].loot?.wallDamage }).slice(0, 300));
assert('exactly 2 report copies for one battle', sql(`SELECT count(*) FROM "BattleReport" WHERE "attackerId"='${A.player.id}' AND "defenderId"='${B.player.id}' AND loot->>'type'='ATTACK'`) === '2');
const bUnitsAfter = Number(sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" WHERE "armyId"='${garB}'`));
assert('defender lost units, never negative', bUnitsAfter >= 0 && bUnitsAfter <= bUnitsBefore, `${bUnitsBefore} -> ${bUnitsAfter}`);
assert('claimedAt released after resolution', sql(`SELECT count(*) FROM "Army" WHERE id='${armyId}' AND "claimedAt" IS NOT NULL`) === '0');
const carried = Number(sql(`SELECT coalesce(sum((w->>'count')::int),0) FROM "Army", jsonb_array_elements("woundedCarry") w WHERE id='${armyId}'`));
const survivors = Number(sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" WHERE "armyId"='${armyId}'`));
// at least one unit type lost 4+ soldiers -> floor(4 x 0.45) >= 1 wounded expected (tent L5: 30 % + 5 x 3 %)
const heavyLoss = Number(sql(`SELECT count(*) FROM "BattleReport" b, jsonb_array_elements(b."attackerLosses"->'units') u WHERE b."attackerId"='${A.player.id}' AND b.loot->>'type'='ATTACK' AND (u->>'killed')::int >= 4`)) > 0;
assert('attacker wounded travel with the army, not in the tent yet', sql(`SELECT coalesce(sum(count),0) FROM "WoundedUnit" WHERE "cityId"='${cityA.id}'`) === '0' && (survivors === 0 || !heavyLoss || carried > 0), `carried ${carried}, survivors ${survivors}, heavy loss ${heavyLoss}`);
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}' AND status='RETURNING'`);
await waitTick('army returned home', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');
assert('carried wounded entered the Healing Tent on return', Number(sql(`SELECT coalesce(sum(count),0) FROM "WoundedUnit" WHERE "cityId"='${cityA.id}'`)) === carried && sql(`SELECT "woundedCarry"::text FROM "Army" WHERE id='${armyId}'`) === '[]', `tent ${sql(`SELECT coalesce(sum(count),0) FROM "WoundedUnit" WHERE "cityId"='${cityA.id}'`)} vs carried ${carried}`);

// ---------- RAID / SPY / MOVE / RETURN ----------
await call('army raid B', 'POST', `/api/army/${armyId}/raid`, tA, { targetCityId: cityB.id });
sql(`UPDATE "Army" SET "departedAt"=now()-("arrivalAt"-"departedAt"), "arrivalAt"=now()+("arrivalAt"-"departedAt") WHERE id='${armyId}'`);   // halfway there
const recall = await call('army return (recall during raid)', 'POST', `/api/army/${armyId}/return`, tA, {});
assert('recall cancels outbound raid', sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'RETURNING', JSON.stringify(recall));
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('army back after recall', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');
// a raid that lands: loot and 24h cooldown
await call('army raid B (lands)', 'POST', `/api/army/${armyId}/raid`, tA, { targetCityId: cityB.id });
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('raid resolved', () => Number(sql(`SELECT count(*) FROM "BattleReport" WHERE "attackerId"='${A.player.id}' AND loot->>'type'='RAID'`)) >= 1);
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}' AND status<>'IDLE'`);
await waitTick('army home after raid', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');
console.log('  A resources after raid:', sql(`SELECT wood::int||'/'||stone::int||'/'||iron::int||'/'||food::int FROM "City" WHERE id='${cityA.id}'`));
await call('second raid within 24h -> 400 (cooldown)', 'POST', `/api/army/${armyId}/raid`, tA, { targetCityId: cityB.id }, 400);
// ---------- ESPIONS (décision du 26 octobre 2026) : espions de la Tour de guet, toujours réussis, la cible prévenue ----------
await call('army spy -> 400 (armies no longer spy)', 'POST', `/api/army/${armyId}/spy`, tA, { targetCityId: cityB.id }, 400);
await call('send SPY with an army -> 400', 'POST', '/api/armies/send', tA, { armyId, targetX: cityB.x, targetY: cityB.y, mission: 'SPY' }, 400);
{
  const s0 = await call('spies: none without a Watchtower', 'GET', '/api/spies', tA);
  assert('spies: both places locked at first', (s0?.slots || []).length === 2 && s0.slots.every(x => !x.unlocked));
  await call('spies: recruit without Watchtower -> 400', 'POST', '/api/spies/recruit', tA, { slot: 1 }, 400);
  const tower = (cid, lvl) => { sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) SELECT gen_random_uuid(),'${cid}','WATCHTOWER',(SELECT COALESCE(MAX(slot),0)+1 FROM "CityBuilding" WHERE "cityId"='${cid}' AND slot < 100),${lvl} WHERE NOT EXISTS (SELECT 1 FROM "CityBuilding" WHERE "cityId"='${cid}' AND key='WATCHTOWER')`); sql(`UPDATE "CityBuilding" SET level=${lvl} WHERE "cityId"='${cid}' AND key='WATCHTOWER'`); };
  tower(cityA.id, 5); tower(cityB.id, 15);
  sql(`UPDATE "Player" SET gold=500 WHERE id='${A.player.id}'`);
  await call('spies: recruit the first spy', 'POST', '/api/spies/recruit', tA, { slot: 1 });
  assert('spies: 20 gold paid', Number(sql(`SELECT gold FROM "Player" WHERE id='${A.player.id}'`)) === 480);
  await call('spies: recruit it twice -> 400', 'POST', '/api/spies/recruit', tA, { slot: 1 }, 400);
  await call('spies: second spy needs Watchtower 10 -> 400', 'POST', '/api/spies/recruit', tA, { slot: 2 }, 400);
  await call('spies: own city -> 400', 'POST', '/api/spies/send', tA, { fromCityId: cityA.id, targetCityId: cityA.id, mission: 'RESOURCES' }, 400);
  await call('spies: unknown mission -> 400', 'POST', '/api/spies/send', tA, { fromCityId: cityA.id, targetCityId: cityB.id, mission: 'GOLD' }, 400);
  const spyId = sql(`SELECT id FROM "Spy" WHERE "playerId"='${A.player.id}' AND slot=1`);
  const runSpy = async (label, body, done) => {
    await call(`spies: send (${label})`, 'POST', '/api/spies/send', tA, body);
    await call(`spies: no spy left (${label}) -> 400`, 'POST', '/api/spies/send', tA, body, 400);
    sql(`UPDATE "Spy" SET "arrivalAt"=now()-interval '1 second' WHERE id='${spyId}'`);
    await waitTick(`spy report (${label})`, done);
    sql(`UPDATE "Spy" SET "returnAt"=now()-interval '1 second' WHERE id='${spyId}' AND status='RETURNING'`);
    await waitTick(`spy home (${label})`, () => sql(`SELECT status FROM "Spy" WHERE id='${spyId}'`) === 'IDLE');
  };
  await runSpy('resources', { fromCityId: cityA.id, targetCityId: cityB.id, mission: 'RESOURCES' }, () => Number(sql(`SELECT count(*) FROM "SpyReport" WHERE "playerId"='${A.player.id}' AND data->>'mission'='RESOURCES'`)) >= 1);
  const rep = (await call('reports/spy A', 'GET', '/api/reports/spy', tA) || []).find(r => r.data?.mission === 'RESOURCES');
  assert('spies: resources and troops report (always a success)', rep?.success === true && rep?.targetType === 'CITY' && Array.isArray(rep?.armies) && Object.keys(rep?.resources || {}).length === 4 && (rep?.buildings || []).length === 0, String(JSON.stringify(rep)).slice(0, 200));
  assert('spies: resources shown to the hundred', Object.values(rep?.resources || {}).every(v => v % 100 === 0));
  const alert = Number(sql(`SELECT count(*) FROM "SpyReport" WHERE "playerId"='${B.player.id}' AND "targetType"='SPY_ALERT' AND "targetName"='${A.player.name}'`));
  assert('spies: Watchtower 15 tells B who spied', alert >= 1);
  await runSpy('defenses', { fromCityId: cityA.id, targetCityId: cityB.id, mission: 'DEFENSES' }, () => Number(sql(`SELECT count(*) FROM "SpyReport" WHERE "playerId"='${A.player.id}' AND data->>'mission'='DEFENSES'`)) >= 1);
  const def = sql(`SELECT data->'defenses'->>'watchtowerLevel' FROM "SpyReport" WHERE "playerId"='${A.player.id}' AND data->>'mission'='DEFENSES' ORDER BY "createdAt" DESC LIMIT 1`);
  assert('spies: defenses report shows the Watchtower level', def === '15', def);
  // un point de ressource : stock exact, affiché sur la carte pendant 1 h
  const node = sql(`SELECT id||','||x||','||y FROM "ResourceNode" WHERE "cityId" IS NULL ORDER BY abs(x-(${cityA.x}))+abs(y-(${cityA.y})) LIMIT 1`).split(',');
  await runSpy('node', { fromCityId: cityA.id, targetNodeId: node[0] }, () => Number(sql(`SELECT count(*) FROM "SpyReport" WHERE "playerId"='${A.player.id}' AND "targetType"='NODE'`)) >= 1);
  const vp = await call('spies: map after spying the node', 'GET', `/api/map/viewport?x=${node[1]}&y=${node[2]}&radius=5`, tA);
  const exact = Number(sql(`SELECT amount FROM "ResourceNode" WHERE id='${node[0]}'`));
  const seen = (vp?.resourceNodes || []).find(n => n.id === node[0]);
  assert('spies: the spied node shows its exact stock', !!seen?.spied && Math.abs(seen.amount - exact) <= 200, JSON.stringify({ shown: seen?.amount, exact }));
  // vision façon Travian : une armée de B qui marche ailleurs ne se voit pas ; vers une ville de A, si
  const tmp = sql(`INSERT INTO "Army"(id,"ownerId","cityId",name,slot,x,y,status,"targetX","targetY","missionType","arrivalAt","departedAt") VALUES (gen_random_uuid(),'${B.player.id}','${cityB.id}','Fantôme',9,${cityB.x},${cityB.y},'MOVING',${cityB.x + 3},${cityB.y + 3},'MOVE',now()+interval '2 hours',now()) RETURNING id`).split('\n')[0];
  const vA = await call('vision: A looks around B', 'GET', `/api/map/viewport?x=${cityB.x}&y=${cityB.y}&radius=10`, tA);
  const vB = await call('vision: B looks around B', 'GET', `/api/map/viewport?x=${cityB.x}&y=${cityB.y}&radius=10`, tB);
  assert('vision: A does not see B\'s army marching elsewhere, B does', !(vA?.armies || []).some(a => a.id === tmp) && (vB?.armies || []).some(a => a.id === tmp));
  sql(`UPDATE "Army" SET status='ATTACKING', "missionType"='ATTACK', "targetCityId"='${cityA.id}', "targetX"=${cityA.x}, "targetY"=${cityA.y} WHERE id='${tmp}'`);
  await sleep(3200);   // le cache de la carte (3 s)
  const vA2 = await call('vision: A looks again', 'GET', `/api/map/viewport?x=${cityB.x}&y=${cityB.y}&radius=10`, tA);
  assert('vision: an army marching on A\'s city is seen by A', (vA2?.armies || []).some(a => a.id === tmp));
  sql(`DELETE FROM "Army" WHERE id='${tmp}'`);
}
{
  // Terrain: a destination on a mountain or in water is refused; a valid move records the departure time
  let blockedTile = null;
  for (let r = 2; r < 60 && !blockedTile; r++) for (let dx = -r; dx <= r && !blockedTile; dx++) for (let dy = -r; dy <= r; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = cityA.x + dx, y = cityA.y + dy;
    // a resource node or a city on a mountain makes the tile passable, and so does the ring around a city (except over
    // water): check it the way the server does, with the cities as objects, and pick a bare tile
    const objs = new Map(); for (const c of [cityA, cityB]) for (const [cx, cy] of Terrain.cityCells(c.x, c.y)) objs.set(cx + ',' + cy, 'CITY');
    if (Terrain.inWorld(x, y) && Terrain.isBlocked(x, y, objs) && sql(`SELECT (SELECT count(*) FROM "ResourceNode" WHERE x=${x} AND y=${y}) + (SELECT count(*) FROM "City" WHERE x=${x} AND y=${y})`) === '0') { blockedTile = { x, y }; break; }
  }
  if (blockedTile) await call('army move onto mountain/water -> 400', 'POST', `/api/army/${armyId}/move`, tA, blockedTile, 400);
  else assert('a blocked tile exists near the city', false, 'none within 60 tiles');
}
// une case libre près de la ville, que l'armée peut atteindre sur cette carte (ni relief, ni eau, ni ville, ni point)
let moveTo = null;
for (let r = 0; r < 6 && !moveTo; r++) for (let dx = -r; dx <= r && !moveTo; dx++) for (let dy = -r; dy <= r; dy++) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
  const x = cityA.x + 3 + dx, y = cityA.y + 3 + dy;
  if (!Terrain.inWorld(x, y) || Terrain.isBlocked(x, y) || !Terrain.findPath(cityA.x, cityA.y, x, y)) continue;
  if (sql(`SELECT (SELECT count(*) FROM "ResourceNode" WHERE x=${x} AND y=${y}) + (SELECT count(*) FROM "City" WHERE x BETWEEN ${x - 1} AND ${x} AND y BETWEEN ${y - 1} AND ${y})`) !== '0') continue;
  moveTo = { x, y }; break;
}
if (!moveTo) assert('a free reachable tile near the city', false);
await call('army move', 'POST', `/api/army/${armyId}/move`, tA, moveTo);
assert('departure time recorded for the march', sql(`SELECT ("departedAt" IS NOT NULL)::text FROM "Army" WHERE id='${armyId}'`) === 'true');
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('army arrived at move target', () => sql(`SELECT x||','||y FROM "Army" WHERE id='${armyId}'`) === `${moveTo?.x},${moveTo?.y}`);
await call('army return home', 'POST', `/api/army/${armyId}/return`, tA, {});
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('army home', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');

// ---------- RESOURCE NODES ----------
const view = await call('map viewport around A', 'GET', `/api/map/viewport?x=${cityA.x}&y=${cityA.y}&radius=25`, tA);
await call('world info', 'GET', '/api/world/info', tA);
await call('buildings data', 'GET', '/api/buildings', tA);
await call('units data', 'GET', '/api/units', tA);
await call('viewport radius=999 (clamped)', 'GET', `/api/map/viewport?x=0&y=0&radius=999`, tA);
await call('viewport x=abc', 'GET', `/api/map/viewport?x=abc&y=0`, tA);
const nodes = (view?.resourceNodes || []);
console.log(`  viewport: cities=${(view?.cities || []).length} nodes=${nodes.length} armies=${(view?.armies || []).length}`);
// A defended node the army can actually walk to (the server refuses targets across water or mountains)
const defended = nodes.find(n => n.hasDefenders && !n.hasPlayerArmy && n.resourceType !== 'GOLD' && Terrain.findPath(cityA.x, cityA.y, n.x, n.y));
// nearest free node reachable by land (a city can be cut off by water from its closest node)
const reachableNode = (extra = '') => sql(`SELECT id||'|'||x||'|'||y FROM "ResourceNode" WHERE NOT "hasPlayerArmy" AND "resourceType"<>'GOLD' AND "cityId" IS NULL ${extra} ORDER BY abs(x-(${cityA.x}))+abs(y-(${cityA.y})) LIMIT 40`).split('\n').filter(Boolean).map(r => r.split('|')).find(([, x, y]) => Terrain.findPath(cityA.x, cityA.y, Number(x), Number(y)));
const undefendedId = reachableNode()[0];
sql(`UPDATE "ResourceNode" SET "hasDefenders"=false, "defenderPower"=0, amount=5000 WHERE id='${undefendedId}'`);
await call('raid-resource on an undefended node -> 400', 'POST', `/api/army/${armyId}/raid-resource`, tA, { resourceNodeId: undefendedId }, 400);
if (defended) {
  assert('tribe power on the army scale', defended.defenderPower > 1000, `power ${defended.defenderPower}`);
  await call('army raid-resource (defended)', 'POST', `/api/army/${armyId}/raid-resource`, tA, { resourceNodeId: defended.id });
  sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
  await waitTick('tribe fight resolved', () => ['HARVESTING', 'RETURNING', 'IDLE'].includes(sql(`SELECT status FROM "Army" WHERE id='${armyId}'`)));
  console.log('  army after tribe fight:', sql(`SELECT status||' carry='||("carryWood"+"carryStone"+"carryIron"+"carryFood")||' tgt='||coalesce("targetResourceId",'-') FROM "Army" WHERE id='${armyId}'`), '| node:', sql(`SELECT "hasDefenders"||' '||"hasPlayerArmy"||' '||amount FROM "ResourceNode" WHERE id='${defended.id}'`));
  assert('tribe fight produced a report', Number(sql(`SELECT count(*) FROM "BattleReport" WHERE "attackerId"='${A.player.id}' AND rounds->>'type'='TRIBE_RAID'`)) >= 1);
  assert('node stock never negative', Number(sql(`SELECT amount FROM "ResourceNode" WHERE id='${defended.id}'`)) >= 0);
  const cityWoodBefore = Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`));
  await call('army return from node', 'POST', `/api/army/${armyId}/return`, tA, {});
  sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
  await waitTick('army home after node', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');
  assert('node released on return', sql(`SELECT "hasPlayerArmy" FROM "ResourceNode" WHERE id='${defended.id}'`) === 'f');
  console.log('  loot deposited:', cityWoodBefore, '->', sql(`SELECT wood::int FROM "City" WHERE id='${cityA.id}'`));
} else {
  assert('a defended node exists in the viewport', false, 'no defended node');
}
// collect: two armies cannot harvest the same node
sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityA.id}'), y=(SELECT y FROM "City" WHERE id='${cityA.id}'), "arrivalAt"=NULL, "claimedAt"=NULL, "targetResourceId"=NULL WHERE "ownerId"='${A.player.id}' AND NOT "isGarrison"`);
await call('collect-resource (travel)', 'POST', `/api/army/${armyId}/collect-resource`, tA, { resourceNodeId: undefendedId });
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('harvesting started', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'HARVESTING');
const army2 = await call('army create #2', 'POST', '/api/army/create', tA, { cityId: cityA.id, slot: 2, name: 'Legio II' });
await call('army2 set-unit', 'POST', `/api/army/${army2.army.id}/set-unit`, tA, { unitKey: infKey, count: 10 });
// Allies (and one's own armies) share a node: the second army joins the harvest instead of being refused
await call('collect-resource on a node held by one\'s own army (shared)', 'POST', `/api/army/${army2.army.id}/collect-resource`, tA, { resourceNodeId: undefendedId });
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${army2.army.id}'`);
await waitTick('second army harvests the same node', () => sql(`SELECT status FROM "Army" WHERE id='${army2.army.id}'`) === 'HARVESTING');
assert('two own armies on the node', sql(`SELECT count(*) FROM "Army" WHERE status='HARVESTING' AND "targetResourceId"='${undefendedId}'`) === '2');
await waitTick('harvest fills the cargo', () => Number(sql(`SELECT "carryWood"+"carryStone"+"carryIron"+"carryFood" FROM "Army" WHERE id='${armyId}'`)) > 0, 90000);
await call('army2 return (node stays held by the first)', 'POST', `/api/army/${army2.army.id}/return`, tA, {});
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${army2.army.id}'`);
await waitTick('army2 home', () => sql(`SELECT status FROM "Army" WHERE id='${army2.army.id}'`) === 'IDLE');
assert('node still held after one army leaves', sql(`SELECT "hasPlayerArmy" FROM "ResourceNode" WHERE id='${undefendedId}'`) === 't');
await call('army return with cargo', 'POST', `/api/army/${armyId}/return`, tA, {});
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('army home with cargo', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');
await call('army2 disband', 'DELETE', `/api/army/${army2.army.id}/disband`, tA);

// ---------- TRANSPORT / SEND ----------
await call('army transport to B', 'POST', `/api/army/${armyId}/transport`, tA, { targetCityId: cityB.id, wood: 100, stone: 0, iron: 0, food: 0 });
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('transport delivered', () => !['TRANSPORTING', 'MOVING'].includes(sql(`SELECT status FROM "Army" WHERE id='${armyId}'`)));
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}' AND status<>'IDLE'`);
await waitTick('army home after transport', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');
// a city covers 2 × 2 cells: a move onto any of them is a move to the city itself (here: already there)
await call('move onto another cell of its own 2 × 2 city -> already there', 'POST', '/api/armies/send', tA, { armyId, targetX: cityA.x + 1, targetY: cityA.y + 1, mission: 'MOVE' }, 400);
// the walkable ring just outside the city block
const besideA = [[2, 0], [2, 1], [0, 2], [1, 2], [-1, 0], [-1, 1], [0, -1], [1, -1], [2, 2], [-1, -1], [3, 0], [0, 3]].map(([dx, dy]) => ({ x: cityA.x + dx, y: cityA.y + dy }))
  .find(({ x, y }) => Terrain.inWorld(x, y) && !Terrain.WATER[Terrain.getTerrainType(x, y).feature] && sql(`SELECT count(*) FROM "City" WHERE x BETWEEN ${x - 1} AND ${x} AND y BETWEEN ${y - 1} AND ${y}`) === '0');
await call('armies/send (generic mission)', 'POST', '/api/armies/send', tA, { armyId, targetX: besideA.x, targetY: besideA.y, mission: 'MOVE' });
await call('army disband while moving -> 400', 'DELETE', `/api/army/${armyId}/disband`, tA, null, 400);
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('army arrived (send)', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) !== 'MOVING');
await call('army return after send', 'POST', `/api/army/${armyId}/return`, tA, {});
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('army home final', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');
await call('army disband', 'DELETE', `/api/army/${armyId}/disband`, tA);

// ---------- WOUNDED ----------
await call('wounded list B', 'GET', `/api/city/${cityB.id}/wounded`, tB);
// Healing Tent beds (A: tent L5 -> 1 000 beds): soldiers beyond wait, and take the beds freed by healing
{
  const k = unitKeyFor('ROME', 'INFANTRY', 'base');
  const garAU = () => Number(sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" a JOIN "Army" r ON r.id=a."armyId" WHERE r."cityId"='${cityA.id}' AND r."isGarrison" AND a."unitKey"='${k}'`));
  sql(`DELETE FROM "WoundedUnit" WHERE "cityId"='${cityA.id}'`);
  sql(`INSERT INTO "WoundedUnit"(id,"cityId","unitKey",count,waiting,"healsAt") VALUES (gen_random_uuid(),'${cityA.id}','${k}',0,40,'9999-01-01')`);
  await call('heal a waiting-only row -> 400', 'POST', `/api/city/${cityA.id}/wounded/heal`, tA, { unitKey: k }, 400);
  sql(`UPDATE "WoundedUnit" SET count=1000, "healsAt"=now()-interval '1 second' WHERE "cityId"='${cityA.id}'`);
  const before = garAU();
  await waitTick('beds freed, waiting soldiers admitted', () => sql(`SELECT count||'/'||waiting FROM "WoundedUnit" WHERE "cityId"='${cityA.id}'`) === '40/0');
  assert('healed soldiers back in the garrison, the queue moved into beds', garAU() - before === 1000, `+${garAU() - before}`);
  const list = await call('wounded list A (beds)', 'GET', `/api/city/${cityA.id}/wounded`, tA);
  assert('wounded list carries the waiting count', Array.isArray(list) && list[0] && list[0].count === 40 && list[0].waiting === 0);
  // A camp before the city pauses nothing (décision du 25 octobre 2026): recruiting and healing go on
  sql(`DELETE FROM "WoundedUnit" WHERE "cityId"='${cityA.id}'`);
  const siegeId = sql(`WITH a AS (INSERT INTO "Army"(id,"ownerId",name,x,y,status,"targetCityId","arrivalAt","departedAt") VALUES (gen_random_uuid(),'${B.player.id}','Siège test',${cityA.x},${cityA.y},'BESIEGING','${cityA.id}',now()+interval '1 day',now()) RETURNING id) INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) SELECT gen_random_uuid(), a.id, u.k, u.t, u.c FROM a, (VALUES ('${UNITS.find(z => z.faction === 'HUN' && z.class === 'SIEGE').key}','siege',5)) AS u(k,t,c) RETURNING "armyId"`).split('\n')[0];   // no siege without engines
  sql(`UPDATE "City" SET "isSieged"=true WHERE id='${cityA.id}'`);
  sql(`INSERT INTO "WoundedUnit"(id,"cityId","unitKey",count,waiting,"healsAt") VALUES (gen_random_uuid(),'${cityA.id}','${k}',30,0,now()-interval '1 second')`);
  await call('recruit while a camp is before the city (allowed)', 'POST', `/api/city/${cityA.id}/recruit`, tA, { unitKey: k, count: 1 });
  await waitTick('wounded healed although a camp is there', () => sql(`SELECT count(*) FROM "WoundedUnit" WHERE "cityId"='${cityA.id}' AND "unitKey"='${k}'`) === '0');
  sql(`DELETE FROM "Army" WHERE id='${siegeId}'`);
  sql(`DELETE FROM "WoundedUnit" WHERE "cityId"='${cityA.id}'`);
}

// ---------- MARKET ----------
await call('market list', 'GET', '/api/market', tA);
// échanges livrés par armées de transport (décision du 27 octobre 2026) : l'armée du vendeur attend avec les
// marchandises, à l'acceptation chaque côté envoie son armée ; taxe de 10 % sur chaque convoi ; offres de 48 h
const traderA = mkTrader(A.player.id, cityA.id, 'Mercator', infKey), traderB = mkTrader(B.player.id, cityB.id, 'Negotiator', unitKeyFor('HUN', 'INFANTRY', 'base'));
await call('market offer too heavy for the army -> 400', 'POST', '/api/market/offer', tA, { cityId: cityA.id, sellResource: 'wood', sellAmount: 30000, buyResource: 'iron', buyAmount: 20000, armyId: traderA }, 400);
const offer = await call('market offer create', 'POST', '/api/market/offer', tA, { cityId: cityA.id, sellResource: 'wood', sellAmount: 100, buyResource: 'iron', buyAmount: 80, armyId: traderA });
const offerId = offer?.offer?.id || offer?.id;
assert('market: the seller army waits in town, the offer lasts 48 h', sql(`SELECT status FROM "Army" WHERE id='${traderA}'`) === 'MARKET' && sql(`SELECT round(extract(epoch FROM "expiresAt"-now())/3600)::int FROM "MarketOffer" WHERE id='${offerId}'`) === '48' && offer?.taxPct === 10, JSON.stringify(offer?.taxPct));
await call('market: the waiting army cannot leave -> 400', 'POST', `/api/army/${traderA}/return`, tA, {}, 400);
await call('market: nor be disbanded -> 400', 'DELETE', `/api/army/${traderA}/disband`, tA, null, 400);
await call('market offer ratio 1:10 -> 400', 'POST', '/api/market/offer', tA, { cityId: cityA.id, sellResource: 'wood', sellAmount: 1000, buyResource: 'iron', buyAmount: 100 }, 400);
await call('market offer accept own -> 400', 'POST', `/api/market/offer/${offerId}/accept`, tA, { cityId: cityA.id }, 400);
await call('market offer accept by B', 'POST', `/api/market/offer/${offerId}/accept`, tB, { cityId: cityB.id, armyId: traderB });
assert('market: both armies leave, each carrying its side less 10 % tax', sql(`SELECT status||':'||"missionType"||':'||"carryWood" FROM "Army" WHERE id='${traderA}'`) === 'TRANSPORTING:MARKET_DELIVERY:90' && sql(`SELECT status||':'||"carryIron"||':'||("targetCityId"='${cityA.id}') FROM "Army" WHERE id='${traderB}'`) === 'TRANSPORTING:72:true', sql(`SELECT status||':'||"carryWood" FROM "Army" WHERE id='${traderA}'`) + ' / ' + sql(`SELECT status||':'||"carryIron" FROM "Army" WHERE id='${traderB}'`));
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id IN ('${traderA}','${traderB}')`);
await waitTick('market goods delivered', () => sql(`SELECT count(*) FROM "Army" WHERE id IN ('${traderA}','${traderB}') AND status='RETURNING' AND "carryWood"+"carryIron"=0`) === '2');
assert('market: the buyer is told of the delivery', Number(sql(`SELECT count(*) FROM "Notification" WHERE "playerId"='${B.player.id}' AND title LIKE '%Marchandises livrées%'`)) >= 1);
sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id="cityId"), y=(SELECT y FROM "City" WHERE id="cityId"), "targetX"=NULL, "targetY"=NULL, "targetCityId"=NULL, "arrivalAt"=NULL, "missionType"=NULL WHERE id IN ('${traderA}','${traderB}')`);
const offer2 = await call('market offer #2', 'POST', '/api/market/offer', tA, { cityId: cityA.id, sellResource: 'stone', sellAmount: 50, buyResource: 'food', buyAmount: 50 });
await call('market offer cancel', 'DELETE', `/api/market/offer/${offer2?.offer?.id || offer2?.id}`, tA);
assert('market: a cancelled offer frees its army', sql(`SELECT status FROM "Army" WHERE id='${traderA}'`) === 'IDLE');
const offer3 = await call('market offer #3 (expires)', 'POST', '/api/market/offer', tA, { cityId: cityA.id, sellResource: 'stone', sellAmount: 40, buyResource: 'food', buyAmount: 40, armyId: traderA });
sql(`UPDATE "MarketOffer" SET "expiresAt"=now()-interval '1 second' WHERE id='${offer3?.offer?.id}'`);
await waitTick('market offer expired', () => sql(`SELECT status FROM "MarketOffer" WHERE id='${offer3?.offer?.id}'`) === 'EXPIRED');
assert('market: an expired offer frees its army', sql(`SELECT status FROM "Army" WHERE id='${traderA}'`) === 'IDLE');
sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) VALUES (gen_random_uuid(),'${cityA.id}','TRADE_OFFICE',(SELECT COALESCE(MAX(slot),0)+1 FROM "CityBuilding" WHERE "cityId"='${cityA.id}' AND slot < 100),4)`);
assert('market: the Trade Office lowers the tax (10 % − 4)', (await call('market tax with a Trade Office 4', 'GET', `/api/market/tax?cityId=${cityA.id}`, tA))?.taxPct === 6);
sql(`DELETE FROM "CityBuilding" WHERE "cityId"='${cityA.id}' AND key='TRADE_OFFICE'`);
sql(`DELETE FROM "Army" WHERE id IN ('${traderA}','${traderB}')`);
await call('market npc-trade', 'POST', '/api/market/npc-trade', tA, { cityId: cityA.id, giveResource: 'wood', receiveResource: 'iron', giveAmount: 100 });
await call('market npc-trade negative -> 400', 'POST', '/api/market/npc-trade', tA, { cityId: cityA.id, giveResource: 'wood', receiveResource: 'iron', giveAmount: -100 }, 400);
{ const car = await call('army create for trade', 'POST', '/api/army/create', tA, { cityId: cityA.id, slot: 1, name: 'Caravane' }); await call('caravan set-unit', 'POST', `/api/army/${car?.army?.id}/set-unit`, tA, { unitKey: infKey, count: 5 }); }
await call('trade/send to B', 'POST', '/api/trade/send', tA, { fromCityId: cityA.id, targetX: cityB.x, targetY: cityB.y, resources: { wood: 10, stone: 0, iron: 0, food: 0 } });
{ const car = sql(`SELECT id FROM "Army" WHERE "ownerId"='${A.player.id}' AND name='Caravane'`); sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${car}'`); await waitTick('caravan delivered', () => sql(`SELECT status FROM "Army" WHERE id='${car}'`) !== 'TRANSPORTING'); sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${car}' AND status<>'IDLE'`); await waitTick('caravan home', () => sql(`SELECT status FROM "Army" WHERE id='${car}'`) === 'IDLE'); await call('caravan disband', 'DELETE', `/api/army/${car}/disband`, tA); }
await call('reports/trade', 'GET', '/api/reports/trade', tA);

// ---------- HERO ----------
await call('hero get', 'GET', '/api/hero', tA);
await call('hero rename', 'POST', '/api/hero/rename', tA, { name: 'Scipio' });
await call('hero assign-points', 'POST', '/api/hero/assign-points', tA, { atk: 2, def: 1, spd: 1, log: 1 });
await call('hero assign too many points -> 400', 'POST', '/api/hero/assign-points', tA, { atk: 99, def: 0, spd: 0, log: 0 }, 400);
// talents (décision du 27 octobre 2026) : 1 point par niveau gagné, trois branches, réinitialisation gratuite puis 100 or
{
  const h0 = await call('hero: bonuses and talent points', 'GET', '/api/hero', tA);
  assert('hero: +0,1 % per point (base 5 + 2 points = +0,7 % attack), alive', h0?.bonuses?.attack === 0.7 && h0?.state === 'ALIVE' && h0?.talentPoints?.total === h0.level - 1, JSON.stringify({ b: h0?.bonuses, s: h0?.state, t: h0?.talentPoints }));
  const cat = await call('hero: talent catalogue', 'GET', '/api/hero/talents', tA);
  assert('hero: three branches of five talents', cat?.branches?.length === 3 && cat.branches.every(b => b.talents.length === 5));
  const level0 = sql(`SELECT level FROM "Hero" WHERE "playerId"='${A.player.id}'`);
  sql(`UPDATE "Hero" SET level=1, talents=NULL, "talentResets"=0 WHERE "playerId"='${A.player.id}'`);
  await call('talents: no point at level 1 -> 400', 'POST', '/api/hero/talents/learn', tA, { key: 'c_assault' }, 400);
  sql(`UPDATE "Hero" SET level=12 WHERE "playerId"='${A.player.id}'`);
  await call('talents: unknown -> 400', 'POST', '/api/hero/talents/learn', tA, { key: 'nope' }, 400);
  await call('talents: tier 2 locked before 5 points -> 400', 'POST', '/api/hero/talents/learn', tA, { key: 'c_siege' }, 400);
  for (let i = 0; i < 5; i++) await call(`talents: Assaut rank ${i + 1}`, 'POST', '/api/hero/talents/learn', tA, { key: 'c_assault' });
  await call('talents: Assaut past its max -> 400', 'POST', '/api/hero/talents/learn', tA, { key: 'c_assault' }, 400);
  for (let i = 0; i < 3; i++) await call(`talents: Ingénieur de siège rank ${i + 1}`, 'POST', '/api/hero/talents/learn', tA, { key: 'c_siege' });
  await call('talents: Vétéran needs 10 points -> 400', 'POST', '/api/hero/talents/learn', tA, { key: 'c_veteran' }, 400);
  for (let i = 0; i < 2; i++) await call(`talents: Pillard rank ${i + 1}`, 'POST', '/api/hero/talents/learn', tA, { key: 'c_plunder' });
  await call('talents: Vétéran unlocked at 10 points', 'POST', '/api/hero/talents/learn', tA, { key: 'c_veteran' });
  await call('talents: the 11 points are spent -> 400', 'POST', '/api/hero/talents/learn', tA, { key: 'g_bulwark' }, 400);
  const h1 = await call('talents: hero after learning', 'GET', '/api/hero', tA);
  assert('talents: Assaut adds +5 % attack beyond the points', h1?.bonuses?.attack === 5.7 && h1?.talentPoints?.free === 0, JSON.stringify(h1?.bonuses));
  await call('talents: first reset is free', 'POST', '/api/hero/talents/reset', tA);
  await call('talents: learn again after the reset', 'POST', '/api/hero/talents/learn', tA, { key: 'i_quartermaster' });
  sql(`UPDATE "Player" SET gold=50 WHERE id='${A.player.id}'`);
  await call('talents: second reset without 100 gold -> 400', 'POST', '/api/hero/talents/reset', tA, null, 400);
  sql(`UPDATE "Player" SET gold=150 WHERE id='${A.player.id}'`);
  await call('talents: second reset for 100 gold', 'POST', '/api/hero/talents/reset', tA);
  assert('talents: 100 gold paid, nothing left learned', sql(`SELECT gold FROM "Player" WHERE id='${A.player.id}'`) === '50' && sql(`SELECT coalesce(talents::text,'') FROM "Hero" WHERE "playerId"='${A.player.id}'`) === '{}');

  // chute et résurrection au Domus : le héros tombé n'a plus d'armée ; ressuscité, il revient dans la garnison de la capitale
  const heroA = sql(`SELECT id FROM "Hero" WHERE "playerId"='${A.player.id}'`);
  sql(`UPDATE "Army" SET "heroId"=NULL WHERE "heroId"='${heroA}'`);
  sql(`UPDATE "Hero" SET "diedAt"=now(), "reviveEndsAt"=NULL WHERE id='${heroA}'`);
  const hf = await call('hero: fallen', 'GET', '/api/hero', tA);
  assert('hero: fallen state with the price of resurrection (250 × level)', hf?.state === 'FALLEN' && hf?.revive?.cost?.wood === 250 * hf.level, JSON.stringify(hf?.revive));
  await call('hero: a fallen hero cannot lead an army -> 400', 'POST', `/api/army/${garA}/assign-hero`, tA, {}, 400);
  sql(`DELETE FROM "CityBuilding" WHERE "cityId"='${cityA.id}' AND key='HERO_MANSION'`);
  await call('hero: no resurrection without the Domus -> 400', 'POST', '/api/hero/revive', tA, null, 400);
  sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) VALUES (gen_random_uuid(),'${cityA.id}','HERO_MANSION',(SELECT COALESCE(MAX(slot),0)+1 FROM "CityBuilding" WHERE "cityId"='${cityA.id}' AND slot < 100),10)`);
  richCity(cityA.id);
  const rv = await call('hero: resurrection at the Domus', 'POST', '/api/hero/revive', tA);
  const hours = (new Date(rv?.endsAt).getTime() - Date.now()) / 3600000;
  assert('hero: 24 h less 2 % per Domus level (19,2 h at level 10)', hours > 19.1 && hours < 19.25, String(hours));
  await call('hero: resurrection twice -> 400', 'POST', '/api/hero/revive', tA, null, 400);
  sql(`UPDATE "Hero" SET "reviveEndsAt"=now()-interval '1 second' WHERE id='${heroA}'`);
  await waitTick('hero revived', () => sql(`SELECT ("diedAt" IS NULL)::text FROM "Hero" WHERE id='${heroA}'`) === 'true');
  assert('hero: back in the capital garrison', sql(`SELECT count(*) FROM "Army" WHERE "heroId"='${heroA}' AND "isGarrison" AND "cityId"='${cityA.id}'`) === '1');
  sql(`UPDATE "Hero" SET level=${level0} WHERE id='${heroA}'`);
}

// ---------- EXPEDITIONS ----------
const exps = await call('expeditions list', 'GET', '/api/expeditions', tA);
const exp = Array.isArray(exps) ? exps.find(e => e.status === 'AVAILABLE') : null;
if (exp) {
  const army3 = await call('army create for expedition', 'POST', '/api/army/create', tA, { cityId: cityA.id, slot: 2, name: 'Exploratores' });
  const a3 = army3?.army?.id;
  await call('army3 set-unit', 'POST', `/api/army/${a3}/set-unit`, tA, { unitKey: infKey, count: 30 });
  await call('expedition start', 'POST', `/api/expedition/${exp.id}/start`, tA, { armyId: a3 });
  sql(`UPDATE "Expedition" SET "endsAt"=now()-interval '1 second' WHERE id='${exp.id}'`);
  await waitTick('expedition resolved', () => sql(`SELECT status FROM "Expedition" WHERE id='${exp.id}'`) === 'COMPLETED');
  console.log('  expedition after:', sql(`SELECT status||' won='||coalesce(won::text,'-') FROM "Expedition" WHERE id='${exp.id}'`), '| army3:', sql(`SELECT status FROM "Army" WHERE id='${a3}'`));
  assert('expedition army back to IDLE', sql(`SELECT status FROM "Army" WHERE id='${a3}'`) === 'IDLE');
  await call('army3 disband', 'DELETE', `/api/army/${a3}/disband`, tA);
} else {
  assert('expedition available at start', false, JSON.stringify(exps).slice(0, 200));
}

// ---------- ALLIANCE ----------
sql(`DELETE FROM "CityBuilding" WHERE "cityId"='${cityB.id}' AND key='EMBASSY'`);
await call('alliance create without Embassy -> 400', 'POST', '/api/alliance/create', tB, { name: `NoEmb${uid}`, tag: 'NOE', description: '' }, 400);
const al = await call('alliance create', 'POST', '/api/alliance/create', tA, { name: `Senatus${uid}`, tag: 'SPQR', description: 'Roma' });
await call('alliances list', 'GET', '/api/alliances', tA);
const alId = al?.alliance?.id || al?.id;
await call('alliance join without invite -> 403', 'POST', `/api/alliance/${alId}/join`, tB, {}, 403);
await call('alliance invite B', 'POST', '/api/alliance/invite', tA, { playerName: B.player.name });
await call('B sees invite', 'GET', '/api/alliance/invites', tB);
await call('alliance join without Embassy -> 400', 'POST', `/api/alliance/${alId}/join`, tB, {}, 400);
addBuilding(cityB.id, 'EMBASSY', 33, 5);
await call('alliance join by B', 'POST', `/api/alliance/${alId}/join`, tB, {});
await call('alliance mine', 'GET', '/api/alliance/mine', tB);

// ---------- MESSAGERIE (décision du 26 octobre 2026) ----------
{
  const gap = () => sleep(1600);   // un message toutes les 1,5 s au plus par joueur
  await call('chat: empty message -> 400', 'POST', '/api/chat/messages', tA, { channel: 'global', text: '   ' }, 400);
  await call('chat: unknown channel -> 400', 'POST', '/api/chat/messages', tA, { channel: 'tavern', text: 'x' }, 400);
  await call('chat: too long -> 400', 'POST', '/api/chat/messages', tA, { channel: 'global', text: 'x'.repeat(501) }, 400);
  await call('chat: write to oneself -> 400', 'POST', '/api/chat/messages', tA, { channel: `private:${A.player.id}`, text: 'moi' }, 400);
  const g = await call('chat: global message (filtered)', 'POST', '/api/chat/messages', tA, { channel: 'global', text: `Salut ${uid}, espèce de connard` }, 201);
  assert('the word filter masks insults', g?.message?.text === `Salut ${uid}, espèce de *******`, g?.message?.text);
  await gap();
  await call('chat: alliance message', 'POST', '/api/chat/messages', tA, { channel: 'alliance', text: `Rassemblement ${uid}` }, 201);
  const ov = await call('chat: overview B', 'GET', '/api/chat/overview', tB);
  assert('B sees the alliance channel with an unread message', (ov?.channels || []).some(c => c.key === 'alliance' && c.unread >= 1));
  const am = await call('chat: B reads alliance', 'GET', '/api/chat/messages?channel=alliance', tB);
  assert('the alliance message is in the channel', (am?.messages || []).some(m => m.text === `Rassemblement ${uid}`));
  await gap();
  const pm = await call('chat: private A -> B', 'POST', '/api/chat/messages', tA, { channel: `private:${B.player.id}`, text: 'Bonjour B' }, 201);
  let ovB = await call('chat: overview B after private', 'GET', '/api/chat/overview', tB);
  const conv = (ovB?.conversations || []).find(c => c.key === `private:${A.player.id}`);
  assert('the private conversation is listed with its unread message', conv?.unread === 1 && conv?.last?.text === 'Bonjour B', JSON.stringify(conv));
  await call('chat: B marks it read', 'POST', '/api/chat/read', tB, { channel: `private:${A.player.id}` });
  ovB = await call('chat: overview B after read', 'GET', '/api/chat/overview', tB);
  assert('read: no more unread in the conversation', (ovB?.conversations || []).find(c => c.key === `private:${A.player.id}`)?.unread === 0);
  await call('chat: B reads his conversation with A', 'GET', `/api/chat/messages?channel=private:${A.player.id}`, tB);   // B lit SA conversation avec A
  // partages : position et rapport de bataille
  await gap();
  const sp = await call('chat: share a position', 'POST', '/api/chat/messages', tA, { channel: 'alliance', text: '', share: { type: 'position', x: cityA.x, y: cityA.y } }, 201);
  assert('the shared position names the city on it', sp?.message?.share?.type === 'position' && /Capitale/.test(sp?.message?.share?.summary?.label || ''), JSON.stringify(sp?.message?.share));
  const reportId = sql(`SELECT id FROM "BattleReport" WHERE "playerId"='${A.player.id}' ORDER BY "createdAt" DESC LIMIT 1`);
  if (reportId) {
    await gap();
    const sb = await call('chat: share a battle report', 'POST', '/api/chat/messages', tA, { channel: 'alliance', text: 'Regardez ça', share: { type: 'battle', reportId } }, 201);
    const full = await call('chat: B opens the shared report', 'GET', `/api/chat/messages/${sb?.message?.id}/share`, tB);
    assert('the shared report is readable by the channel', full?.type === 'battle' && full?.data?.id === reportId);
    await call('chat: share someone else\'s report -> 404', 'POST', '/api/chat/messages', tB, { channel: 'alliance', text: '', share: { type: 'battle', reportId } }, 404);
  }
  // traduction (fournisseur « log » en test)
  if (ov?.settings?.translation) {
    const tr = await call('chat: translate', 'POST', '/api/chat/translate', tB, { ids: [pm?.message?.id], lang: 'en' });
    assert('translation returned and kept', !!tr?.translations?.[pm?.message?.id]?.text && sql(`SELECT count(*) FROM "ChatTranslation" WHERE "messageId"='${pm?.message?.id}' AND lang='en'`) === '1');
  }
  // amis
  await call('friends: A asks B', 'POST', '/api/friends/requests', tA, { name: B.player.name }, 201);
  await call('friends: second request -> 400', 'POST', '/api/friends/requests', tA, { playerId: B.player.id }, 400);
  const fr = await call('friends: B sees the request', 'GET', '/api/friends', tB);
  await call('friends: B accepts', 'POST', `/api/friends/requests/${fr?.incoming?.[0]?.id}/accept`, tB);
  assert('A and B are friends', (await call('friends: A list', 'GET', '/api/friends', tA))?.friends?.some(f => f.id === B.player.id));
  await gap();
  await call('chat: friends channel', 'POST', '/api/chat/messages', tB, { channel: 'friends', text: `Entre amis ${uid}` }, 201);
  assert('a friend reads the friends channel', (await call('chat: A reads friends', 'GET', '/api/chat/messages?channel=friends', tA))?.messages?.some(m => m.text === `Entre amis ${uid}`));
  // signalement, modération
  await call('chat: report own message -> 400', 'POST', `/api/chat/messages/${pm?.message?.id}/report`, tA, { reason: 'x' }, 400);
  await call('chat: B reports A\'s message', 'POST', `/api/chat/messages/${pm?.message?.id}/report`, tB, { reason: 'insulte' });
  if (process.env.ADMIN_KEY) {
    const rep = await fetch(`${BASE}/api/chat/admin/reports`, { headers: { 'x-admin-key': process.env.ADMIN_KEY } }).then(r => r.json());
    const mine = (rep.reports || []).find(r => r.message.id === pm?.message?.id);
    assert('the report reaches the moderation', !!mine);
    const act = await fetch(`${BASE}/api/chat/admin/reports/${mine?.id}`, { method: 'POST', headers: { 'x-admin-key': process.env.ADMIN_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mute', hours: 1 }) });
    assert('moderation: message deleted and author muted', act.ok && sql(`SELECT count(*) FROM "ChatMessage" WHERE id='${pm?.message?.id}'`) === '0');
    await gap();
    await call('chat: a muted player cannot write -> 403', 'POST', '/api/chat/messages', tA, { channel: 'alliance', text: 'encore' }, 403);
    sql(`UPDATE "Player" SET "chatMutedUntil"=NULL WHERE id='${A.player.id}'`);
  }
  // blocage
  await call('chat: B blocks A', 'POST', `/api/chat/blocks/${A.player.id}`, tB);
  await gap();
  await call('chat: blocked A cannot write to B -> 403', 'POST', '/api/chat/messages', tA, { channel: `private:${B.player.id}`, text: 'tu es là ?' }, 403);
  assert('B no longer sees A\'s messages', !(await call('chat: B reads alliance after block', 'GET', '/api/chat/messages?channel=alliance', tB))?.messages?.some(m => m.sender?.id === A.player.id));
  assert('blocking ends the friendship', !(await call('friends: B list after block', 'GET', '/api/friends', tB))?.friends?.length);
  const prof = await call('profile shows the block', 'GET', `/api/player/${A.player.id}`, tB);
  assert('profile relation: blocked', prof?.relation?.blocked === true);
  await call('chat: B unblocks A', 'DELETE', `/api/chat/blocks/${A.player.id}`, tB);
  await call('chat: player search', 'GET', `/api/chat/players?q=${encodeURIComponent(B.player.name.slice(0, 5))}`, tA);
}
await call('alliance diplomacy get', 'GET', '/api/alliance/diplomacy', tA);
await call('diplomacy/player/:id', 'GET', `/api/diplomacy/player/${B.player.id}`, tA);
{ sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityA.id}'), y=(SELECT y FROM "City" WHERE id='${cityA.id}'), "arrivalAt"=NULL, "claimedAt"=NULL, "missionType"=NULL WHERE "ownerId"='${A.player.id}' AND NOT "isGarrison"`);
  const ar = await call('army create for ally test', 'POST', '/api/army/create', tA, { cityId: cityA.id, slot: 3, name: 'Socii' });
  const a4 = ar?.army?.id; await call('a4 set-unit', 'POST', `/api/army/${a4}/set-unit`, tA, { unitKey: infKey, count: 5 });
  await call('raid alliance member -> 400', 'POST', `/api/army/${a4}/raid`, tA, { targetCityId: cityB.id }, 400);
  await call('send RAID alliance member -> 400', 'POST', '/api/armies/send', tA, { armyId: a4, targetX: cityB.x, targetY: cityB.y, mission: 'RAID' }, 400); }
// ---------- ALLIANCE : aide, boutique, renfort, diplomatie (décision du 26 octobre 2026) ----------
{
  sql(`UPDATE "CityBuilding" SET level=10 WHERE "cityId" IN ('${cityA.id}','${cityB.id}') AND key='EMBASSY'`);
  // aide : B demande de l'aide sur une construction en cours, A aide (1 % du restant, 1 minute au moins) et gagne des points
  sql(`DELETE FROM "BuildQueueItem" WHERE "cityId"='${cityB.id}'`);
  const bqId = sql(`INSERT INTO "BuildQueueItem"(id,"cityId",slot,"buildingKey","targetLevel","startedAt","endsAt",status) VALUES (gen_random_uuid(),'${cityB.id}',40,'WAREHOUSE',2,now(),now() + interval '2 hours','RUNNING') RETURNING id`).split('\n')[0];
  const endsBefore = Number(sql(`SELECT extract(epoch FROM "endsAt") FROM "BuildQueueItem" WHERE id='${bqId}'`));
  const hb = await call('help: B sees what can be helped', 'GET', '/api/alliance/help', tB);
  assert('help: the running construction is listed with the Embassy cap', (hb?.targets || []).some(t => t.kind === 'BUILD' && t.targetId === bqId) && hb?.maxHelps === 10, JSON.stringify({ maxHelps: hb?.maxHelps, n: hb?.targets?.length }));
  const rq = await call('help: B asks for help on everything', 'POST', '/api/alliance/help/request', tB, {});
  assert('help: a request was created', rq?.created >= 1, JSON.stringify(rq));
  await call('help: asking twice adds nothing', 'POST', '/api/alliance/help/request', tB, { kind: 'BUILD', targetId: bqId });
  const meA = await call('help: A /me shows a pending request', 'GET', '/api/player/me', tA);
  assert('help: badge count for A', meA?.allianceHelpPending >= 1, String(meA?.allianceHelpPending));
  const pointsBefore = Number(sql(`SELECT "alliancePoints" FROM "Player" WHERE id='${A.player.id}'`));
  const ha = await call('help: A helps everyone', 'POST', '/api/alliance/help/all', tA);
  assert('help: A helped and earned 10 points', ha?.helped >= 1 && ha?.points === 10 * ha.helped && Number(sql(`SELECT "alliancePoints" FROM "Player" WHERE id='${A.player.id}'`)) === pointsBefore + ha.points, JSON.stringify(ha));
  const endsAfter = Number(sql(`SELECT extract(epoch FROM "endsAt") FROM "BuildQueueItem" WHERE id='${bqId}'`));
  assert('help: the construction is 1 % of the rest shorter (72 s on 2 h)', endsBefore - endsAfter >= 70 && endsBefore - endsAfter <= 75, String(endsBefore - endsAfter));
  const reqId = sql(`SELECT id FROM "AllianceHelpRequest" WHERE "playerId"='${B.player.id}' AND "targetId"='${bqId}'`);
  await call('help: helping twice -> 409', 'POST', `/api/alliance/help/${reqId}`, tA, null, 409);
  await call('help: helping one\'s own request -> 409', 'POST', `/api/alliance/help/${reqId}`, tB, null, 409);
  sql(`DELETE FROM "BuildQueueItem" WHERE id='${bqId}'`);
  const hb2 = await call('help: finished target closes the request', 'GET', '/api/alliance/help', tA);
  assert('help: closed request no longer listed', !(hb2?.requests || []).some(r => r.id === reqId));

  // boutique : ressources livrées dans une ville, plaque de nom achetée puis retirée, bannière sans image en attente
  sql(`UPDATE "Player" SET "alliancePoints"=1000 WHERE id='${A.player.id}'`);
  sql(`UPDATE "City" SET wood=100, "maxStorage"=100000 WHERE id='${cityA.id}'`);
  const shop = await call('shop: catalogue', 'GET', '/api/alliance/shop', tA);
  assert('shop: resources, hero items, nameplates and banners', ['resources', 'hero_item', 'nameplate', 'banner'].every(t => (shop?.items || []).some(i => i.type === t)) && shop?.points === 1000);
  await call('shop: buy wood', 'POST', '/api/alliance/shop/buy', tA, { key: 'res_wood', cityId: cityA.id });
  assert('shop: 1000 wood delivered, 80 points spent', Number(sql(`SELECT floor(wood) FROM "City" WHERE id='${cityA.id}'`)) >= 1100 && Number(sql(`SELECT "alliancePoints" FROM "Player" WHERE id='${A.player.id}'`)) === 920);
  await call('shop: buy into a city that is not yours -> 400', 'POST', '/api/alliance/shop/buy', tA, { key: 'res_wood', cityId: cityB.id }, 400);
  await call('shop: buy bronze nameplate', 'POST', '/api/alliance/shop/buy', tA, { key: 'nameplate_bronze' });
  assert('shop: nameplate owned and in place', sql(`SELECT nameplate FROM "Player" WHERE id='${A.player.id}'`) === 'bronze');
  await call('shop: buy it again -> 400', 'POST', '/api/alliance/shop/buy', tA, { key: 'nameplate_bronze' }, 400);
  await call('shop: not enough points -> 400', 'POST', '/api/alliance/shop/buy', tA, { key: 'nameplate_gold' }, 400);
  await call('shop: banner without its image -> 400', 'POST', '/api/alliance/shop/buy', tA, { key: 'banner_eagle' }, 400);
  await call('shop: take the nameplate off', 'POST', '/api/alliance/shop/equip', tA, { slot: 'nameplate', key: null });
  await call('shop: put it back', 'POST', '/api/alliance/shop/equip', tA, { slot: 'nameplate', key: 'nameplate_bronze' });
  await call('shop: equip something not bought -> 400', 'POST', '/api/alliance/shop/equip', tA, { slot: 'nameplate', key: 'nameplate_silver' }, 400);

  // renfort : A envoie une armée défendre la ville de B (même alliance), B la voit puis la renvoie
  sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityA.id}'), y=(SELECT y FROM "City" WHERE id='${cityA.id}'), "arrivalAt"=NULL, "claimedAt"=NULL, "missionType"=NULL, "targetCityId"=NULL WHERE "ownerId"='${A.player.id}' AND NOT "isGarrison"`);
  sql(`UPDATE "CityBuilding" SET level=GREATEST(level,15) WHERE "cityId"='${cityA.id}' AND key='RALLY_POINT'`);   // emplacement 4
  const sa = await call('support: army for reinforcement', 'POST', '/api/army/create', tA, { cityId: cityA.id, slot: 4, name: 'Auxilia' });
  const sId = sa?.army?.id;
  await call('support: set units', 'POST', `/api/army/${sId}/set-unit`, tA, { unitKey: infKey, count: 4 });
  await call('support: own city -> 400', 'POST', `/api/army/${sId}/support`, tA, { targetCityId: cityA.id }, 400);
  sql(`UPDATE "City" SET "isSieged"=true WHERE id='${cityB.id}'`);
  await call('support: a besieged city takes no reinforcement -> 400', 'POST', `/api/army/${sId}/support`, tA, { targetCityId: cityB.id }, 400);
  sql(`UPDATE "City" SET "isSieged"=false WHERE id='${cityB.id}'`);
  await call('support: A reinforces B', 'POST', `/api/army/${sId}/support`, tA, { targetCityId: cityB.id });
  assert('support: army marching as SUPPORTING', sql(`SELECT status FROM "Army" WHERE id='${sId}'`) === 'SUPPORTING');
  sql(`UPDATE "Army" SET "arrivalAt"=now() - interval '1 second' WHERE id='${sId}'`);
  await waitTick('reinforcement stationed', () => sql(`SELECT status FROM "Army" WHERE id='${sId}'`) === 'STATIONED');
  const rec = await call('support: B lists reinforcements received', 'GET', '/api/army/support/received', tB);
  assert('support: B sees A\'s army stationed', (rec || []).some(a => a.id === sId && a.status === 'STATIONED' && a.owner?.id === A.player.id));
  await call('support: A cannot send it back for B -> 403', 'POST', `/api/army/support/${sId}/send-back`, tA, null, 403);
  await call('support: B sends it back', 'POST', `/api/army/support/${sId}/send-back`, tB);
  assert('support: the army goes home', sql(`SELECT status FROM "Army" WHERE id='${sId}'`) === 'RETURNING');
  sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityA.id}'), y=(SELECT y FROM "City" WHERE id='${cityA.id}'), "targetX"=NULL, "targetY"=NULL, "arrivalAt"=NULL, "claimedAt"=NULL, "missionType"=NULL, "targetCityId"=NULL WHERE id='${sId}'`);

  // diplomatie : une alliance se propose et s'accepte ; ennemi se déclare seul ; renfort chez un allié rappelé à la rupture
  const D = await call('register D (GAUL)', 'POST', '/api/auth/register', null, { email: `z${uid}@t.fr`, password: PASSWORD, name: `Zeta${uid}`, faction: 'GAUL' });
  const tD = D?.token;
  const cityD = (await call('D cities', 'GET', '/api/cities', tD))?.[0];
  if (cityD) addBuilding(cityD.id, 'EMBASSY', 33, 7);
  const alD = await call('D founds an alliance', 'POST', '/api/alliance/create', tD, { name: `Gallia${uid}`, tag: 'GAL', description: '' });
  const alDId = alD?.alliance?.id;
  const prop = await call('diplomacy: A proposes an alliance to D', 'POST', `/api/alliance/diplomacy/${alDId}`, tA, { status: 'ALLY' });
  assert('diplomacy: a proposal, not an alliance yet', prop?.event === 'proposed' && (await call('diplomacy: relation A->D before acceptance', 'GET', `/api/diplomacy/player/${D.player.id}`, tA))?.status === 'NEUTRAL', JSON.stringify(prop));
  await call('diplomacy: D cannot be reinforced yet -> 400', 'POST', `/api/army/${sId}/support`, tA, { targetCityId: cityD?.id }, 400);
  const dd = await call('diplomacy: D sees the proposal', 'GET', '/api/alliance/diplomacy', tD);
  const inc = (dd?.incoming || []).find(r => r.alliance?.id === alId);
  assert('diplomacy: incoming proposal listed', !!inc);
  await call('diplomacy: D accepts', 'POST', `/api/alliance/diplomacy/requests/${inc?.id}/accept`, tD);
  const relAD = await call('diplomacy: relation A->D', 'GET', `/api/diplomacy/player/${D.player.id}`, tA);
  assert('diplomacy: allies on both sides', relAD?.status === 'ALLY' && relAD?.canAttack === false && relAD?.canSupport === true, JSON.stringify(relAD));
  const relMap = await call('diplomacy: map colours for B', 'GET', '/api/alliance/relations', tB);
  assert('diplomacy: B (same alliance as A) sees D\'s alliance as an ally', relMap?.relations?.[alDId] === 'ALLY');
  const sheet = await call('diplomacy: public sheet of D\'s alliance', 'GET', `/api/alliance/${alDId}`, tB);
  assert('diplomacy: the sheet lists A\'s alliance as an ally', (sheet?.allies || []).some(a => a.id === alId));
  await call('support: A reinforces the ally D', 'POST', `/api/army/${sId}/support`, tA, { targetCityId: cityD?.id });
  const war = await call('diplomacy: D declares A\'s alliance an enemy', 'POST', `/api/alliance/diplomacy/${alId}`, tD, { status: 'ENEMY' });
  assert('diplomacy: war breaks the alliance on both sides', war?.event === 'enemy' && sql(`SELECT status FROM "AllianceDiplomacy" WHERE "allianceId"='${alId}' AND "targetAllianceId"='${alDId}'`) === 'NEUTRAL' && (await call('diplomacy: relation after war', 'GET', `/api/diplomacy/player/${D.player.id}`, tA))?.status === 'ENEMY');
  await waitTick('reinforcement recalled by the war', () => sql(`SELECT status FROM "Army" WHERE id='${sId}'`) === 'RETURNING', 15000);
  await call('diplomacy: an enemy cannot propose while at war -> 400', 'POST', `/api/alliance/diplomacy/${alDId}`, tA, { status: 'ALLY' }, 400);
  await call('diplomacy: D makes peace', 'POST', `/api/alliance/diplomacy/${alId}`, tD, { status: 'NEUTRAL' });
  await call('diplomacy: a member cannot change diplomacy -> 403', 'POST', `/api/alliance/diplomacy/${alDId}`, tB, { status: 'ENEMY' }, 403);
  const mine = await call('members: list with last connection', 'GET', '/api/alliance/mine', tA);
  assert('members: last connection and join date given to members', (mine?.alliance?.members || []).every(m => m.player?.lastSeenAt && m.joinedAt));
  const pub = await call('members: public list', 'GET', `/api/alliance/${alId}`, tD);
  assert('members: the public sheet hides the last connection', (pub?.members || []).length > 0 && (pub?.members || []).every(m => m.player && m.player.lastSeenAt === undefined));
  await call('D leaves (dissolves)', 'POST', '/api/alliance/leave', tD, {});
  sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityA.id}'), y=(SELECT y FROM "City" WHERE id='${cityA.id}'), "targetX"=NULL, "targetY"=NULL, "arrivalAt"=NULL, "claimedAt"=NULL, "missionType"=NULL, "targetCityId"=NULL WHERE id='${sId}'`);
  await call('support: army disband', 'DELETE', `/api/army/${sId}/disband`, tA);
}
// ---------- QUÊTES (décision du 26 octobre 2026) ----------
{
  const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const q0 = await call('quests: overview', 'GET', '/api/quests', tA);
  assert('quests: tutorial, tasks, daily, weekly and achievements', !!q0?.tutorial && q0.tasks?.length > 10 && q0.daily?.quests?.length >= 2 && q0.weekly?.quests?.length >= 2 && q0.achievements?.length > 3, JSON.stringify({ t: q0?.tasks?.length, d: q0?.daily?.quests?.length }));
  assert('quests: the game counted finished constructions (counter hook)', Number(sql(`SELECT COALESCE(SUM(value),0) FROM "QuestCounter" WHERE "playerId"='${A.player.id}' AND period='ALL' AND key='build_done'`)) > 0);
  // tutoriel : l'étape 1 faite (un bûcheron), récompense prise une seule fois
  if (!sql(`SELECT id FROM "CityBuilding" WHERE "cityId"='${cityA.id}' AND key='LUMBER' LIMIT 1`)) sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) VALUES (gen_random_uuid(),'${cityA.id}','LUMBER',101,1)`);
  sql(`UPDATE "City" SET wood=0, stone=0, iron=0, food=0, "maxStorage"=100000, "maxFoodStorage"=100000 WHERE id='${cityA.id}'`);
  const t1 = await call('quests: claim tutorial step 1', 'POST', '/api/quests/t_lumber/claim', tA, { cityId: cityA.id });
  assert('quests: the reward reached the city', Number(sql(`SELECT floor(stone) FROM "City" WHERE id='${cityA.id}'`)) >= (t1?.reward?.stone || 1), JSON.stringify(t1?.reward));
  await call('quests: claim it twice -> 404', 'POST', '/api/quests/t_lumber/claim', tA, { cityId: cityA.id }, 404);
  const q1 = await call('quests: next step', 'GET', '/api/quests', tA);
  assert('quests: the tutorial moved on', q1?.tutorial?.current?.key === 't_quarry' || q1?.tutorial?.done >= 1, q1?.tutorial?.current?.key);
  if (q1?.tutorial?.current?.key === 't_quarry' && !q1.tutorial.current.done) await call('quests: unfinished step -> 400', 'POST', '/api/quests/t_quarry/claim', tA, {}, 400);
  await call('quests: unknown quest -> 404', 'POST', '/api/quests/zz_nope/claim', tA, {}, 404);
  await call('quests: someone else\'s city -> 400', 'POST', '/api/quests/b_RALLY_POINT:1/claim', tA, { cityId: cityB.id }, 400);
  // tâche faite (Place de rassemblement) : refusée si l'entrepôt est plein, prise sinon
  sql(`UPDATE "City" SET stone="maxStorage" WHERE id='${cityA.id}'`);
  const full = await call('quests: full warehouse -> 400', 'POST', '/api/quests/b_RALLY_POINT:1/claim', tA, { cityId: cityA.id }, 400);
  assert('quests: the refusal says the warehouse is full', /place/i.test(full?.error || ''), full?.error);
  sql(`UPDATE "City" SET stone=0 WHERE id='${cityA.id}'`);
  await call('quests: claim a task', 'POST', '/api/quests/b_RALLY_POINT:1/claim', tA, { cityId: cityA.id });
  const q2 = await call('quests: task moved to its next level', 'GET', '/api/quests', tA);
  assert('quests: next level of the task shown', (q2?.tasks || []).some(t => t.key === 'b_RALLY_POINT:3'));
  // quête du jour à compteur : faite par le compteur du jour, prise une fois ; le bonus attend toutes les quêtes
  const dq = (q2?.daily?.quests || []).find(x => !x.claimed && ['d_build', 'd_expedition', 'd_recruit', 'd_research', 'd_help', 'd_harvest', 'd_trade'].includes(x.key));
  if (dq) {
    const counter = { d_build: 'build_done', d_expedition: 'expedition_done', d_recruit: 'units_recruited', d_research: 'research_done', d_help: 'help_given', d_harvest: 'harvested', d_trade: 'trade_sent' }[dq.key];
    sql(`INSERT INTO "QuestCounter"(id,"playerId",period,key,value) VALUES (gen_random_uuid(),'${A.player.id}','${parisDay}','${counter}',${dq.target}) ON CONFLICT ("playerId",period,key) DO UPDATE SET value=GREATEST("QuestCounter".value, ${dq.target})`);
    await call('quests: claim a daily quest', 'POST', `/api/quests/${dq.key}/claim`, tA, { cityId: cityA.id });
    await call('quests: daily quest twice -> 404/400', 'POST', `/api/quests/${dq.key}/claim`, tA, { cityId: cityA.id }, [400, 404]);
    const q3 = await call('quests: daily after claim', 'GET', '/api/quests', tA);
    assert('quests: the daily bonus waits for every daily quest', q3?.daily?.bonus?.progress >= 1 && (q3.daily.bonus.progress < q3.daily.bonus.target ? !q3.daily.bonus.claimable : true));
  } else assert('quests: a counter-based daily quest is drawn', false, JSON.stringify((q2?.daily?.quests || []).map(x => x.key)));
  const me = await call('quests: badge count in /me', 'GET', '/api/player/me', tA);
  assert('quests: /me gives the number of rewards to take', Number.isInteger(me?.questsClaimable));
  await call('quests: skip the tutorial', 'POST', '/api/quests/tutorial/skip', tA, {});
  assert('quests: tutorial finished after skipping', (await call('quests: after skip', 'GET', '/api/quests', tA))?.tutorial?.finished === true);
}
await call('alliance promote B (member->officer)', 'POST', `/api/alliance/promote/${B.player.id}`, tA, {});
await call('alliance promote B (officer->leader)', 'POST', `/api/alliance/promote/${B.player.id}`, tA, {});
assert('leadership transferred', sql(`SELECT string_agg(role, ',' ORDER BY role) FROM "AllianceMember" WHERE "playerId" IN ('${A.player.id}','${B.player.id}')`) === 'LEADER,OFFICER');
await call('alliance kick A by new leader B', 'POST', `/api/alliance/kick/${A.player.id}`, tB, {});
await call('alliance leave B (dissolve)', 'POST', '/api/alliance/leave', tB, {});

// ---------- RANKING ----------
await call('ranking players', 'GET', '/api/ranking/players', tA);
await call('ranking alliances', 'GET', '/api/ranking/alliances', tA);
await call('ranking attackers', 'GET', '/api/ranking/attackers', tA);
await call('ranking defenders', 'GET', '/api/ranking/defenders', tA);
// classements (décision du 27 octobre 2026) : points de combat, rang personnel, semaine, médailles honorifiques
{
  const atk = await call('ranking: players by attack points', 'GET', '/api/ranking/players?sort=attack', tA);
  assert('ranking: A has attack points from its battles, with its own rank', Number(sql(`SELECT "attackPoints" FROM "PlayerStats" WHERE "playerId"='${A.player.id}'`)) > 0 && atk?.me?.rank >= 1 && atk.me.value === Number(sql(`SELECT "attackPoints" FROM "PlayerStats" WHERE "playerId"='${A.player.id}'`)), JSON.stringify(atk?.me));
  assert('ranking: sorted by value', (atk?.rows || []).every((r, i, a) => i === 0 || a[i - 1].value >= r.value) && atk.rows[0].rank === 1);
  const al = await call('ranking: alliances by defense', 'GET', '/api/ranking/alliances?sort=defense', tA);
  assert('ranking: alliance rows carry attack and defense sums', (al?.rows || []).every(r => typeof r.attackPoints === 'number' && typeof r.defensePoints === 'number'));
  const wk = await call('ranking: this week attackers', 'GET', '/api/ranking/week?category=ATTACK', tA);
  assert('ranking: the week counts A\'s points', !!wk?.me && wk.me.attackPoints > 0 && /^\d{4}-\d{2}-\d{2}$/.test(wk.week), JSON.stringify(wk?.me));
  await call('ranking: unknown week category -> 400', 'GET', '/api/ranking/week?category=NOPE', tA, null, 400);
  // la semaine précédente se clôt au tick : médailles pour le top 10 (joueurs) et le top 3 (alliances)
  const prev = new Date(new Date(wk.week + 'T12:00:00Z').getTime() - 7 * 86400000).toISOString().slice(0, 10);
  sql(`DELETE FROM "Medal" WHERE week='${prev}'`); sql(`DELETE FROM "RankingWeek" WHERE week='${prev}'`);
  sql(`INSERT INTO "PlayerWeekStats"(id,"playerId",week,"attackPoints","defensePoints",loot,"popStart") VALUES (gen_random_uuid(),'${A.player.id}','${prev}',90000000,0,5000,0), (gen_random_uuid(),'${B.player.id}','${prev}',0,80000000,0,0) ON CONFLICT ("playerId",week) DO UPDATE SET "attackPoints"=EXCLUDED."attackPoints", "defensePoints"=EXCLUDED."defensePoints", loot=EXCLUDED.loot`);
  await waitTick('last week closed', () => sql(`SELECT count(*) FROM "RankingWeek" WHERE week='${prev}'`) === '1' && Number(sql(`SELECT count(*) FROM "Medal" WHERE week='${prev}'`)) > 0);
  assert('ranking: A gets the gold medal of last week\'s attackers, B the defenders\'', sql(`SELECT rank FROM "Medal" WHERE week='${prev}' AND category='ATTACK' AND "playerId"='${A.player.id}'`) === '1' && sql(`SELECT rank FROM "Medal" WHERE week='${prev}' AND category='DEFENSE' AND "playerId"='${B.player.id}'`) === '1');
  const md = await call('ranking: my medals', 'GET', '/api/ranking/medals', tA);
  assert('ranking: the medal is listed', (md?.medals || []).some(m => m.week === prev && m.category === 'ATTACK' && m.rank === 1));
  const prof = await call('ranking: medals on the public profile', 'GET', `/api/player/${A.player.id}`, tB);
  assert('ranking: the profile shows medals and combat points', (prof?.medals || []).some(m => m.week === prev) && typeof prof?.stats?.attackPoints === 'number');
  sql(`DELETE FROM "PlayerWeekStats" WHERE week='${prev}'`);
}

// ---------- FACTION / QUEUE / GOLD ----------
await call('ROME builds GALLIC_BREWERY -> 400', 'POST', `/api/city/${cityA.id}/build`, tA, { buildingKey: 'GALLIC_BREWERY' }, 400);
const C = await call('register C (GREEK)', 'POST', '/api/auth/register', null, { email: `c${uid}@t.fr`, password: PASSWORD, name: `Gamma${uid}`, faction: 'GREEK' });
const cityC = (await call('cities C', 'GET', '/api/cities', C.token))[0];
sql(`UPDATE "City" SET wood=90000, stone=90000, iron=90000, food=90000, "maxStorage"=100000, "maxFoodStorage"=100000 WHERE id='${cityC.id}'`);
sql(`UPDATE "CityBuilding" SET level=10 WHERE "cityId"='${cityC.id}' AND key='MAIN_HALL'`);
await call('C offer without a Market -> 400', 'POST', '/api/market/offer', C.token, { cityId: cityC.id, sellResource: 'wood', sellAmount: 100, buyResource: 'stone', buyAmount: 100 }, 400);
await call('C build WAREHOUSE', 'POST', `/api/city/${cityC.id}/build`, C.token, { buildingKey: 'WAREHOUSE' });
await call('C build SILO', 'POST', `/api/city/${cityC.id}/build`, C.token, { buildingKey: 'SILO' });
const q3 = await call('C build RALLY_POINT (queued)', 'POST', `/api/city/${cityC.id}/build`, C.token, { buildingKey: 'RALLY_POINT' });
const q4 = await call('C build RALLY_POINT level 2 (same slot, queued)', 'POST', `/api/city/${cityC.id}/build`, C.token, { buildingKey: 'RALLY_POINT' });
assert('second level of a queued building keeps its slot and targets level 2', q4?.queueItem?.slot === q3?.queueItem?.slot && q4?.queueItem?.targetLevel === 2, JSON.stringify({ s3: q3?.queueItem?.slot, s4: q4?.queueItem?.slot, lvl: q4?.queueItem?.targetLevel }));
const queuedDur = q3?.durationSec;
sql(`UPDATE "BuildQueueItem" SET "endsAt"=now()-interval '1 second' WHERE "cityId"='${cityC.id}' AND status='RUNNING'`);
await waitTick('queued build promoted', () => sql(`SELECT status FROM "BuildQueueItem" WHERE id='${q3?.queueItem?.id}'`) === 'RUNNING');
const promotedDur = Number(sql(`SELECT round(extract(epoch from "endsAt"-"startedAt")) FROM "BuildQueueItem" WHERE id='${q3?.queueItem?.id}'`));
assert('promoted build keeps faction-reduced duration', Math.abs(promotedDur - queuedDur) <= 1, `queued ${queuedDur}s, promoted ${promotedDur}s`);

// the nearest gold node reachable by land (some sit behind water or mountains)
const goldNode = sql(`SELECT id||'|'||x||'|'||y FROM "ResourceNode" WHERE "resourceType"='GOLD' AND NOT "hasPlayerArmy" ORDER BY abs(x-(${cityA.x}))+abs(y-(${cityA.y})) LIMIT 40`).split('\n').filter(Boolean).map(r => r.split('|')).find(([, x, y]) => Terrain.findPath(cityA.x, cityA.y, Number(x), Number(y))) || ['', '0', '0'];
sql(`UPDATE "ResourceNode" SET "hasDefenders"=false, "defenderPower"=0, amount=5000 WHERE id='${goldNode[0]}'`);
sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityA.id}'), y=(SELECT y FROM "City" WHERE id='${cityA.id}'), "arrivalAt"=NULL, "claimedAt"=NULL, "targetResourceId"=NULL WHERE "ownerId"='${A.player.id}' AND NOT "isGarrison"`);
const ga = sql(`SELECT id FROM "Army" WHERE "ownerId"='${A.player.id}' AND NOT "isGarrison" AND EXISTS (SELECT 1 FROM "ArmyUnit" u WHERE u."armyId"="Army".id) LIMIT 1`);
const goldBefore = Number(sql(`SELECT gold FROM "Player" WHERE id='${A.player.id}'`));
await call('collect GOLD node', 'POST', `/api/army/${ga}/collect-resource`, tA, { resourceNodeId: goldNode[0] });
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${ga}'`);
await waitTick('harvesting gold', () => Number(sql(`SELECT "carryGold" FROM "Army" WHERE id='${ga}'`)) > 0, 100000);
await call('return with gold', 'POST', `/api/army/${ga}/return`, tA, {});
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${ga}'`);
await waitTick('gold deposited', () => sql(`SELECT status FROM "Army" WHERE id='${ga}'`) === 'IDLE');
const goldAfter = Number(sql(`SELECT gold FROM "Player" WHERE id='${A.player.id}'`));
assert('harvested gold credited to player', goldAfter > goldBefore, `${goldBefore} -> ${goldAfter}`);

// ---------- CONCURRENCY / RULES ----------
const D = await call('register D (GAUL)', 'POST', '/api/auth/register', null, { email: `d${uid}@t.fr`, password: PASSWORD, name: `Delta${uid}`, faction: 'GAUL' });
const cityD = (await call('cities D', 'GET', '/api/cities', D.token))[0];
sql(`UPDATE "City" SET wood=300, stone=5000, iron=5000, food=5000, "maxStorage"=100000, "maxFoodStorage"=100000 WHERE id='${cityD.id}'`);
{
  const reqs = [113, 114, 115, 116].map(slot => fetch(`${BASE}/api/city/${cityD.id}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${D.token}` }, body: JSON.stringify({ buildingKey: 'FARM', slot }) }));
  const codes = (await Promise.all(reqs)).map(r => r.status);
  const wood = Number(sql(`SELECT wood FROM "City" WHERE id='${cityD.id}'`));
  const queued = Number(sql(`SELECT count(*) FROM "BuildQueueItem" WHERE "cityId"='${cityD.id}'`));
  assert('concurrent builds: no double spend', wood >= 0 && codes.filter(c => c === 200).length === queued && wood <= 300 - queued * 40, `codes=${codes} queued=${queued} wood=${wood}`);
}
{
  sql(`UPDATE "City" SET wood=50000, stone=50000, iron=50000, food=50000 WHERE id IN ('${cityC.id}','${cityD.id}','${cityA.id}')`);
  for (const cid of [cityC.id, cityD.id]) addBuilding(cid, 'MARKET', 32, 1);
  const tC = mkTrader(C.player.id, cityC.id, 'Emporos', unitKeyFor('GREEK', 'INFANTRY', 'base')), tD = mkTrader(D.player.id, cityD.id, 'Mercator', unitKeyFor('GAUL', 'INFANTRY', 'base')), tA2 = mkTrader(A.player.id, cityA.id, 'Mercator', infKey);
  const off = await call('offer for race', 'POST', '/api/market/offer', C.token, { cityId: cityC.id, sellResource: 'wood', sellAmount: 300, buyResource: 'stone', buyAmount: 100, armyId: tC });
  const oid = off?.offer?.id;
  const [r1, r2] = await Promise.all([
    fetch(`${BASE}/api/market/offer/${oid}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${D.token}` }, body: JSON.stringify({ cityId: cityD.id }) }),
    fetch(`${BASE}/api/market/offer/${oid}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tA}` }, body: JSON.stringify({ cityId: cityA.id }) })
  ]);
  const okCount = [r1.status, r2.status].filter(c => c === 200).length;
  const sent = Number(sql(`SELECT count(*) FROM "Army" WHERE id IN ('${tD}','${tA2}') AND status='TRANSPORTING'`));
  assert('concurrent offer accept: single trade', okCount === 1 && sent === 1 && sql(`SELECT status FROM "Army" WHERE id='${tC}'`) === 'TRANSPORTING', `codes=${r1.status},${r2.status} sent=${sent}`);
  sql(`DELETE FROM "Army" WHERE id IN ('${tC}','${tD}','${tA2}')`);
}
{
  addBuilding(cityD.id, 'RALLY_POINT', 31, 10);
  const ar = await call('D army create', 'POST', '/api/army/create', D.token, { cityId: cityD.id, slot: 1, name: 'Expl' });
  const garD = sql(`SELECT id FROM "Army" WHERE "cityId"='${cityD.id}' AND "isGarrison" LIMIT 1`);
  sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${garD}','${unitKeyFor('GAUL', 'INFANTRY', 'base')}','base',50) ON CONFLICT ("armyId","unitKey") DO UPDATE SET count=50`);
  await call('D army set-unit', 'POST', `/api/army/${ar.army.id}/set-unit`, D.token, { unitKey: unitKeyFor('GAUL', 'INFANTRY', 'base'), count: 50 });
  // ---------- NODE HELD BY ANOTHER PLAYER: refused for collection, open to attack (Travian oasis rule) ----------
  {
    sql(`UPDATE "ResourceNode" SET "hasDefenders"=false, "defenderPower"=0, "hasPlayerArmy"=false, amount=5000 WHERE id='${undefendedId}'`);
    sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityA.id}'), y=(SELECT y FROM "City" WHERE id='${cityA.id}'), "arrivalAt"=NULL, "claimedAt"=NULL, "targetResourceId"=NULL, "missionType"=NULL WHERE id='${ga}'`);
    await call('A collects the node again', 'POST', `/api/army/${ga}/collect-resource`, tA, { resourceNodeId: undefendedId });
    sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${ga}'`);
    await waitTick('A harvests the node', () => sql(`SELECT status FROM "Army" WHERE id='${ga}'`) === 'HARVESTING');
    const nodeXY = sql(`SELECT x||','||y FROM "ResourceNode" WHERE id='${undefendedId}'`).split(',').map(Number);
    sql(`UPDATE "Army" SET x=${nodeXY[0] + 1}, y=${nodeXY[1]}, status='IDLE', "arrivalAt"=NULL, "claimedAt"=NULL, "targetResourceId"=NULL, "missionType"=NULL WHERE id='${ar.army.id}'`);
    await call('D cannot collect a node held by A -> 409', 'POST', `/api/army/${ar.army.id}/collect-resource`, D.token, { resourceNodeId: undefendedId }, 409);
    const fight = await call('D attacks the army holding the node (adjacent, resolved at once)', 'POST', `/api/army/${ar.army.id}/raid-resource`, D.token, { resourceNodeId: undefendedId });
    assert('node fight resolved with a result', !!fight?.combatResult && ['attacker', 'defender'].includes(fight.combatResult.winner), JSON.stringify(fight)?.slice(0, 160));
    assert('node fight reports for both players', Number(sql(`SELECT count(*) FROM "BattleReport" WHERE "playerId"='${D.player.id}' AND rounds->>'type'='NODE_FIGHT'`)) >= 1 && Number(sql(`SELECT count(*) FROM "BattleReport" WHERE "playerId"='${A.player.id}' AND rounds->>'type'='NODE_FIGHT'`)) >= 1);
    const dStatus = sql(`SELECT status FROM "Army" WHERE id='${ar.army.id}'`), aStatus = sql(`SELECT status FROM "Army" WHERE id='${ga}'`);
    const dWon = fight?.combatResult?.winner === 'attacker';
    assert('winner holds the node, loser leaves', dWon ? (dStatus === 'HARVESTING' && ['RETURNING', 'IDLE'].includes(aStatus)) : (aStatus === 'HARVESTING' && dStatus === 'IDLE'), `D ${dStatus}, A ${aStatus}, D won ${dWon}`);
    assert('node still marked as held', sql(`SELECT "hasPlayerArmy" FROM "ResourceNode" WHERE id='${undefendedId}'`) === 't');
    // A has a Healing Tent: when A's holding army loses, its wounded ride home with it (never straight into the tent)
    if (dWon && (fight?.combatResult?.defenderLosses || 0) >= 4) assert('beaten holder carries its wounded home', Number(sql(`SELECT coalesce(sum((w->>'count')::int),0) FROM "Army", jsonb_array_elements("woundedCarry") w WHERE id='${ga}'`)) > 0 || sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" WHERE "armyId"='${ga}'`) === '0');
    // Back to a clean state for the rest of the run
    sql(`UPDATE "ResourceNode" SET "hasPlayerArmy"=false, "lastArmyDeparture"=NULL WHERE id='${undefendedId}'`);
    sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityD.id}'), y=(SELECT y FROM "City" WHERE id='${cityD.id}'), "arrivalAt"=NULL, "claimedAt"=NULL, "targetResourceId"=NULL, "missionType"=NULL, "carryWood"=0, "carryStone"=0, "carryIron"=0, "carryFood"=0 WHERE id='${ar.army.id}'`);
    sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityA.id}'), y=(SELECT y FROM "City" WHERE id='${cityA.id}'), "arrivalAt"=NULL, "claimedAt"=NULL, "targetResourceId"=NULL, "missionType"=NULL, "woundedCarry"='[]' WHERE id='${ga}'`);
  }
  // ---------- SECONDARY CITIES (GDD): settler at the Residence, foundation on a free node, restrictions ----------
  {
    await call('train settler without Residence -> 400', 'POST', `/api/city/${cityA.id}/settlers`, tA, {}, 400);
    const resSlot = sql(`SELECT MIN(s) FROM generate_series(1,19) s WHERE s NOT IN (SELECT slot FROM "CityBuilding" WHERE "cityId"='${cityA.id}')`);
    addBuilding(cityA.id, 'RESIDENCE', Number(resSlot), 10);
    richCity(cityA.id);
    const st = await call('train a settler (Residence L10)', 'POST', `/api/city/${cityA.id}/settlers`, tA, {});
    assert('settler queued at the Residence', st?.queueItem?.unitKey === 'SETTLER' && st?.slots === 1, JSON.stringify(st)?.slice(0, 120));
    await call('second settler -> 400 (one slot at L10)', 'POST', `/api/city/${cityA.id}/settlers`, tA, {}, 400);
    sql(`UPDATE "RecruitQueueItem" SET "endsAt"=now()-interval '1 second' WHERE id='${st.queueItem.id}'`);
    await waitTick('settler ready in the capital', () => sql(`SELECT settlers FROM "City" WHERE id='${cityA.id}'`) === '1');
    // a colony needs its 2 × 2 block free (the node and the 3 cells beside it: no relief, water, crossing, city, node,
    // nor a foundation under way), on the main land (src/utils/spawn.js footprintFree)
    const foundable = (x, y) => Terrain.isMainland(x, y) && Terrain.cityCells(x, y).every(([cx, cy]) => { const f = Terrain.getTerrainType(cx, cy).feature; return Terrain.inWorld(cx, cy) && !Terrain.BLOCKED[f] && f !== 'bridge' && f !== 'ford'; })
      && sql(`SELECT (SELECT count(*) FROM "City" WHERE x BETWEEN ${x - 2} AND ${x + 2} AND y BETWEEN ${y - 2} AND ${y + 2}) + (SELECT count(*) FROM "ResourceNode" WHERE (x, y) IN ((${x + 1}, ${y}), (${x}, ${y + 1}), (${x + 1}, ${y + 1}))) + (SELECT count(*) FROM "Army" WHERE status='FOUNDING' AND "targetX" BETWEEN ${x - 2} AND ${x + 2} AND "targetY" BETWEEN ${y - 2} AND ${y + 2})`) === '0';
    const freeNode = sql(`SELECT id||'|'||x||'|'||y FROM "ResourceNode" WHERE NOT "hasPlayerArmy" AND "resourceType"<>'GOLD' AND "cityId" IS NULL AND id<>'${undefendedId}' ORDER BY abs(x-(${cityA.x}))+abs(y-(${cityA.y})) LIMIT 80`).split('\n').filter(Boolean).map(r => r.split('|'))
      .find(([, x, y]) => foundable(Number(x), Number(y)) && Terrain.findPath(cityA.x, cityA.y, Number(x), Number(y)));
    sql(`UPDATE "ResourceNode" SET "hasDefenders"=false, "defenderPower"=0 WHERE id='${freeNode[0]}'`);
    await call('found-city with B token on A army -> 404', 'POST', `/api/army/${ga}/found-city`, tB, { resourceNodeId: freeNode[0] }, 404);
    const woodBefore = Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`));
    const fc = await call('found-city: settler army leaves the capital', 'POST', `/api/army/${ga}/found-city`, tA, { resourceNodeId: freeNode[0], name: `Colonia${uid}` });
    assert('foundation resources debited and settler embarked', woodBefore - Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`)) === 3000 && sql(`SELECT settlers FROM "City" WHERE id='${cityA.id}'`) === '0' && sql(`SELECT settlers FROM "Army" WHERE id='${ga}'`) === '1', `wood -${woodBefore - Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`))}`);
    sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${ga}'`);
    await waitTick('army founding on the node', () => sql(`SELECT status FROM "Army" WHERE id='${ga}'`) === 'FOUNDING');
    assert('node reserved during the foundation', sql(`SELECT "hasPlayerArmy" FROM "ResourceNode" WHERE id='${freeNode[0]}'`) === 't');
    await call('D cannot collect a node being founded -> 409', 'POST', `/api/army/${ar.army.id}/collect-resource`, D.token, { resourceNodeId: freeNode[0] }, 409);
    sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${ga}'`);
    await waitTick('city founded', () => sql(`SELECT count(*) FROM "City" WHERE "playerId"='${A.player.id}' AND NOT "isCapital"`) === '1', 90000);
    const colony = sql(`SELECT id||'|'||name||'|'||x||'|'||y||'|'||wood::int FROM "City" WHERE "playerId"='${A.player.id}' AND NOT "isCapital"`).split('|');
    assert('colony stands on the node with the carried resources', colony[1] === `Colonia${uid}` && Number(colony[2]) === Number(freeNode[1]) && Number(colony[3]) === Number(freeNode[2]) && Number(colony[4]) >= 3000, colony.join(' '));
    assert('node now belongs to the colony', sql(`SELECT "cityId" FROM "ResourceNode" WHERE id='${freeNode[0]}'`) === colony[0]);
    assert('colony has a main hall and a garrison', sql(`SELECT count(*) FROM "CityBuilding" WHERE "cityId"='${colony[0]}' AND key='MAIN_HALL'`) === '1' && sql(`SELECT count(*) FROM "Army" WHERE "cityId"='${colony[0]}' AND "isGarrison"`) === '1');
    const citiesNow = await call('cities A (capital + colony)', 'GET', '/api/cities', tA);
    assert('two cities listed', Array.isArray(citiesNow) && citiesNow.length === 2);
    await call('build EMBASSY in the colony -> 400 (capital only)', 'POST', `/api/city/${colony[0]}/build`, tA, { buildingKey: 'EMBASSY' }, 400);
    await call('build BARRACKS in the colony -> 400 (capital only: Great Barracks outside)', 'POST', `/api/city/${colony[0]}/build`, tA, { buildingKey: 'BARRACKS' }, 400);
    richCity(colony[0]);
    await call('build GREAT_BARRACKS in the colony without Barracks 20 in the capital -> 400', 'POST', `/api/city/${colony[0]}/build`, tA, { buildingKey: 'GREAT_BARRACKS' }, 400);
    sql(`UPDATE "CityBuilding" SET level=20 WHERE "cityId"='${cityA.id}' AND key='BARRACKS'`);
    await call('build GREAT_BARRACKS in the colony (Barracks 20 in the capital) -> 200', 'POST', `/api/city/${colony[0]}/build`, tA, { buildingKey: 'GREAT_BARRACKS' });
    sql(`UPDATE "CityBuilding" SET level=20 WHERE "cityId"='${colony[0]}' AND key='MAIN_HALL'`);
    await call('colony Main Hall above 20 -> 400', 'POST', `/api/city/${colony[0]}/build`, tA, { buildingKey: 'MAIN_HALL' }, 400);
    assert('colony with Main Hall 20 is a Ville Fortifiée', (await call('cities A (colony tier)', 'GET', '/api/cities', tA))?.find(c => c.id === colony[0])?.cityTierName === 'Ville Fortifiée');
    sql(`UPDATE "CityBuilding" SET level=1 WHERE "cityId"='${colony[0]}' AND key='MAIN_HALL'`);
    await call('build GREAT_BARRACKS in the capital -> 400 (colonies only)', 'POST', `/api/city/${cityA.id}/build`, tA, { buildingKey: 'GREAT_BARRACKS' }, 400);
    // routes commerciales entre ses villes : 1/12 du stockage par envoi toutes les 2 h (100 % en 24 h), trajet réel
    await call('trade route to a city that is not yours -> 403', 'POST', '/api/market/routes', tA, { fromCityId: cityA.id, toCityId: cityB.id, wood: true }, 403);
    await call('trade route without resource -> 400', 'POST', '/api/market/routes', tA, { fromCityId: cityA.id, toCityId: colony[0] }, 400);
    sql(`UPDATE "City" SET wood=60000, "maxStorage"=120000 WHERE id='${cityA.id}'`);
    const colWood0 = Number(sql(`SELECT floor(wood) FROM "City" WHERE id='${colony[0]}'`));
    const rt = await call('trade route capital -> colony (wood)', 'POST', '/api/market/routes', tA, { fromCityId: cityA.id, toCityId: colony[0], wood: true });
    await waitTick('route convoy leaves', () => Number(sql(`SELECT count(*) FROM "TradeConvoy" WHERE "routeId"='${rt?.route?.id}'`)) === 1);
    assert('route: 1/12 of the storage per convoy, next one in 2 h', sql(`SELECT wood||':'||stone FROM "TradeConvoy" WHERE "routeId"='${rt?.route?.id}'`) === '10000:0' && sql(`SELECT round(extract(epoch FROM "nextSendAt"-now())/60)::int FROM "TradeRoute" WHERE id='${rt?.route?.id}'`) === '120', sql(`SELECT wood FROM "TradeConvoy" WHERE "routeId"='${rt?.route?.id}'`));
    const rl = await call('trade routes list', 'GET', '/api/market/routes', tA);
    assert('route: listed with its convoy on the way', rl?.routes?.length === 1 && rl?.convoys?.length === 1 && rl?.rules?.pctOfStoragePer24h === 100);
    sql(`UPDATE "TradeConvoy" SET "arrivalAt"=now()-interval '1 second' WHERE "routeId"='${rt?.route?.id}'`);
    await waitTick('route convoy delivered', () => Number(sql(`SELECT count(*) FROM "TradeConvoy" WHERE "routeId"='${rt?.route?.id}'`)) === 0);
    assert('route: the colony received the convoy (within its warehouse)', Number(sql(`SELECT floor(wood) FROM "City" WHERE id='${colony[0]}'`)) > colWood0);
    await call('trade route pause', 'POST', `/api/market/routes/${rt?.route?.id}/toggle`, tA);
    assert('route: paused', sql(`SELECT active::text FROM "TradeRoute" WHERE id='${rt?.route?.id}'`) === 'false');
    await call('trade route delete', 'DELETE', `/api/market/routes/${rt?.route?.id}`, tA);
    await call('D raid-resource on a node under a city -> 400', 'POST', `/api/army/${ar.army.id}/raid-resource`, D.token, { resourceNodeId: freeNode[0] }, 400);
    assert('node under the colony hidden from the viewport', !((await call('viewport around the colony', 'GET', `/api/map/viewport?x=${colony[2]}&y=${colony[3]}&radius=2`, tA))?.resourceNodes || []).some(n => n.id === freeNode[0]));
    await waitTick('founding army back home', () => sql(`SELECT status FROM "Army" WHERE id='${ga}'`) !== 'FOUNDING');
    sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${ga}' AND status='RETURNING'`);
    await waitTick('founding army idle', () => sql(`SELECT status FROM "Army" WHERE id='${ga}'`) === 'IDLE');
  }
  const exps = (await call('D expeditions', 'GET', '/api/expeditions', D.token)).filter(e => e.status === 'AVAILABLE');
  const rs = await Promise.all(exps.slice(0, 3).map(e => fetch(`${BASE}/api/expedition/${e.id}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${D.token}` }, body: JSON.stringify({ armyId: ar.army.id }) })));
  const started = rs.filter(r => r.status === 200).length;
  const inProgress = Number(sql(`SELECT count(*) FROM "Expedition" WHERE "playerId"='${D.player.id}' AND status='IN_PROGRESS'`));
  assert('concurrent expedition start: one army, one expedition', started === 1 && inProgress === 1, `codes=${rs.map(r => r.status)} inProgress=${inProgress}`);
  await call('garrison cannot move -> 400', 'POST', `/api/army/${garD}/move`, D.token, { x: cityD.x + 1, y: cityD.y }, 400);
  await call('garrison cannot raid node -> 400', 'POST', `/api/army/${garD}/raid-resource`, D.token, { resourceNodeId: goldNode[0] }, 400);
}
{
  const nid = sql(`SELECT id FROM "ResourceNode" WHERE NOT "hasPlayerArmy" AND "resourceType"<>'GOLD' ORDER BY random() LIMIT 1`);
  sql(`UPDATE "ResourceNode" SET amount=100, "lastRegen"=now()-interval '2 hours', "lastArmyDeparture"=NULL WHERE id='${nid}'`);
  await waitTick('node regenerated', () => Number(sql(`SELECT amount FROM "ResourceNode" WHERE id='${nid}'`)) > 100);
}
{
  const r = await fetch(`${BASE}/api/army/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tA}` }, body: '{bad json' });
  assert('malformed JSON body -> 400', r.status === 400, `status ${r.status}`);
}
await call('faction as number -> 400', 'POST', '/api/auth/register', null, { email: `z${uid}@t.fr`, password: PASSWORD, name: `Zeta${uid}`, faction: 123 }, 400);
await call('npc-trade huge amount -> 400', 'POST', '/api/market/npc-trade', tA, { cityId: cityA.id, giveResource: 'wood', receiveResource: 'iron', giveAmount: 3e12 }, 400);
{
  // Tick game time follows the database clock
  assert('tick timestamp recorded', sql(`SELECT count(*) FROM "TickLock" WHERE "lastTickAt" > now() - interval '2 minutes'`) === '1');
}
{
  // Login lockout: after the configured failures the e-mail is locked (429), whatever the password
  let last = 0;
  for (let i = 0; i < 11; i++) { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `d${uid}@t.fr`, password: 'wrong-' + i }) }); last = r.status; if (last === 429) break; }
  assert('login lockout after repeated failures', last === 429, `last status ${last}`);
}

// ---------- E-MAIL FLOWS (log provider: the links are read from EMAIL_LOG_FILE) ----------
if (MAIL_LOG) {
  await sleep(500);
  const verify = mailsTo(`d${uid}@t.fr`).find(m => /confirmez/i.test(m.subject));
  assert('verification mail sent at sign-up', !!verify);
  if (verify) {
    const link = verify.text.match(/https?:\/\/\S+/)[0];
    const r = await fetch(link);
    assert('verification link confirms the address', r.status === 200 && (await r.text()).includes('Adresse confirmée'));
    assert('verification link is single use', (await fetch(link)).status === 400);
    const me = await call('player/me D (verified)', 'GET', '/api/player/me', D.token);
    assert('player/me reports emailVerified', me?.emailVerified === true);
  }
  await call('forgot-password (unknown mail -> still 200)', 'POST', '/api/auth/forgot-password', null, { email: `nobody${uid}@t.fr` });
  await call('forgot-password D', 'POST', '/api/auth/forgot-password', null, { email: `c${uid}@t.fr` });
  await sleep(500);
  const reset = mailsTo(`c${uid}@t.fr`).find(m => /initialisation/i.test(m.subject));
  assert('reset mail sent', !!reset);
  if (reset) {
    const tok = reset.text.match(/token=([a-f0-9]+)/)[1];
    await call('reset with short password -> 400', 'POST', '/api/auth/reset-password', null, { token: tok, newPassword: 'short' }, 400);
    await call('reset password C', 'POST', '/api/auth/reset-password', null, { token: tok, newPassword: 'Reset1234!' });
    await call('reset token reused -> 400', 'POST', '/api/auth/reset-password', null, { token: tok, newPassword: 'Reset1234!' }, 400);
    await call('C old token refused after reset', 'GET', '/api/player/me', C.token, null, 401);
    await call('C login with the new password', 'POST', '/api/auth/login', null, { email: `c${uid}@t.fr`, password: 'Reset1234!' });
  }
} else {
  console.log('  (EMAIL_LOG_FILE not set: e-mail flows skipped)');
}

// ---------- HOMECOMING THROUGH A SIEGE ----------
// An army coming home to its besieged city must fight the camp; winning lifts the siege and lets it in
{
  const camp = sql(`WITH a AS (INSERT INTO "Army"(id,"ownerId","cityId",name,x,y,"targetX","targetY",status,"missionType","targetCityId","departedAt","arrivalAt") VALUES (gen_random_uuid(),'${A.player.id}','${cityA.id}','Camp',${cityB.x},${cityB.y},${cityB.x},${cityB.y},'BESIEGING','ATTACK','${cityB.id}',now(),now()+interval '2 hours') RETURNING id) INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) SELECT gen_random_uuid(), a.id, u.k, u.t, u.c FROM a, (VALUES ('${infKey}','base',50), ('${siegeKey}','siege',5)) AS u(k,t,c) RETURNING "armyId"`).split('\n')[0];
  const E = await call('register E (neutral)', 'POST', '/api/auth/register', null, { email: `e${uid}@t.fr`, password: PASSWORD, name: `Epsilon${uid}`, faction: 'GAUL' });
  const seenByC = await call('siege info seen by a neutral player', 'GET', `/api/city/${cityB.id}/siege`, E?.token);
  assert('any player may break a siege', seenByC?.besieged === true && seenByC?.canBreak === true, JSON.stringify(seenByC)?.slice(0, 120));
  assert('a player who is not concerned does not see the time left before the battle', seenByC?.besiegers?.[0]?.assaultAt === null, JSON.stringify(seenByC?.besiegers)?.slice(0, 160));
  const weakMove = sql(`WITH a AS (INSERT INTO "Army"(id,"ownerId","cityId",name,x,y,"targetX","targetY",status,"missionType","departedAt","arrivalAt") VALUES (gen_random_uuid(),'${B.player.id}','${cityB.id}','Faible',${cityB.x + 2},${cityB.y},${cityB.x},${cityB.y},'MOVING','MOVE',now()-interval '5 minutes',now()-interval '1 second') RETURNING id) INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) SELECT gen_random_uuid(), a.id, u.k, u.t, u.c FROM a, (VALUES ('${unitKeyFor('HUN', 'INFANTRY', 'base')}','base',3)) AS u(k,t,c) RETURNING "armyId"`).split('\n')[0];
  await waitTick('a move onto the own besieged city fights the camp', () => sql(`SELECT status FROM "Army" WHERE id='${weakMove}'`) === 'IDLE');
  assert('beaten before its besieged walls, the army waits beside the city (not inside)', sql(`SELECT (x=${cityB.x} AND y=${cityB.y})::text FROM "Army" WHERE id='${weakMove}'`) === 'false' && sql(`SELECT status FROM "Army" WHERE id='${camp}'`) === 'BESIEGING');
  const back = sql(`WITH a AS (INSERT INTO "Army"(id,"ownerId","cityId",name,x,y,"targetX","targetY",status,"missionType","departedAt","arrivalAt") VALUES (gen_random_uuid(),'${B.player.id}','${cityB.id}','Retour',${cityB.x + 3},${cityB.y},${cityB.x},${cityB.y},'RETURNING','RETURN',now()-interval '5 minutes',now()-interval '1 second') RETURNING id) INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) SELECT gen_random_uuid(), a.id, u.k, u.t, u.c FROM a, (VALUES ('${unitKeyFor('HUN', 'INFANTRY', 'elite')}','elite',500)) AS u(k,t,c) RETURNING "armyId"`).split('\n')[0];
  await waitTick('home army fights its way in', () => sql(`SELECT status||':'||(x=${cityB.x} AND y=${cityB.y}) FROM "Army" WHERE id='${back}'`) === 'IDLE:true');
  assert('the homecoming fight wrote its reports', Number(sql(`SELECT count(*) FROM "BattleReport" WHERE loot->>'type'='SIEGE_BREAK' AND rounds->>'homecoming'='true' AND "attackerId"='${B.player.id}'`)) >= 4);
  assert('an army coming home fights its way through the camp and lifts the siege', sql(`SELECT status FROM "Army" WHERE id='${camp}'`) === 'RETURNING' && sql(`SELECT status||':'||(x=${cityB.x} AND y=${cityB.y}) FROM "Army" WHERE id='${back}'`) === 'IDLE:true');
}

// ---------- RECALLED CAMP ----------
{
  const camp2 = sql(`WITH a AS (INSERT INTO "Army"(id,"ownerId","cityId",name,x,y,"targetX","targetY",status,"missionType","targetCityId","departedAt","arrivalAt") VALUES (gen_random_uuid(),'${A.player.id}','${cityA.id}','Camp rappelé',${cityB.x},${cityB.y},${cityB.x},${cityB.y},'BESIEGING','ATTACK','${cityB.id}',now(),now()+interval '2 hours') RETURNING id) INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) SELECT gen_random_uuid(), a.id, u.k, u.t, u.c FROM a, (VALUES ('${infKey}','base',100), ('${siegeKey}','siege',2)) AS u(k,t,c) RETURNING "armyId"`).split('\n')[0];
  sql(`UPDATE "City" SET "isSieged"=true WHERE id='${cityB.id}'`);
  await call('lift the siege (recall the camp)', 'POST', `/api/army/${camp2}/return`, tA, {});
  assert('a recalled camp lifts the siege at once', sql(`SELECT "isSieged" FROM "City" WHERE id='${cityB.id}'`) === 'f');
}

// ---------- NO RIPOSTE ----------
// Even a much weaker army camps before the city: there is no automatic riposte any more (décision du 25 octobre 2026)
{
  const eliteB = unitKeyFor('HUN', 'INFANTRY', 'elite');
  sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${garB}','${eliteB}','elite',3000) ON CONFLICT ("armyId","unitKey") DO UPDATE SET count=3000`);
  const weak = sql(`WITH a AS (INSERT INTO "Army"(id,"ownerId","cityId",name,x,y,"targetX","targetY",status,"missionType","targetCityId","departedAt","arrivalAt") VALUES (gen_random_uuid(),'${A.player.id}','${cityA.id}','Petit siège',${cityA.x},${cityA.y},${cityB.x},${cityB.y},'ATTACKING','ATTACK','${cityB.id}',now()-interval '1 minute',now()-interval '1 second') RETURNING id) INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) SELECT gen_random_uuid(), a.id, u.k, u.t, u.c FROM a, (VALUES ('${infKey}','base',10), ('${siegeKey}','siege',1)) AS u(k,t,c) RETURNING "armyId"`).split('\n')[0];
  await waitTick('weak army camps', () => sql(`SELECT status FROM "Army" WHERE id='${weak}'`) === 'BESIEGING');
  assert('no riposte: the weak army camps like any other', Number(sql(`SELECT count(*) FROM "BattleReport" WHERE loot->>'type'='RIPOSTE' AND x=${cityB.x} AND y=${cityB.y}`)) === 0 && sql(`SELECT "isSieged" FROM "City" WHERE id='${cityB.id}'`) === 't');
  sql(`DELETE FROM "Army" WHERE id='${weak}'`);
  sql(`UPDATE "City" SET "isSieged"=false WHERE id='${cityB.id}'`);
  sql(`DELETE FROM "ArmyUnit" WHERE "armyId"='${garB}' AND "unitKey"='${eliteB}'`);
}

// ---------- CITY FALL ----------
// A secondary city that loses its last life is destroyed; a capital cannot be taken: it flees near the edge of the map
// with all its armies. The camps are inserted with their hour already over to keep the suite short.
{
  const assault = (owner, homeCityId, city, unitKey, count) => {
    // the army and its units in one statement: a tick never sees the army without its units
    const id = sql(`WITH a AS (INSERT INTO "Army"(id,"ownerId","cityId",name,x,y,"targetX","targetY",status,"missionType","targetCityId","departedAt","arrivalAt") VALUES (gen_random_uuid(),'${owner}','${homeCityId}','Assaut final',${city.x},${city.y},${city.x},${city.y},'BESIEGING','ASSAULT','${city.id}',now()-interval '40 minutes',now()-interval '1 second') RETURNING id) INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) SELECT gen_random_uuid(), a.id, u.k, u.t, u.c FROM a, (VALUES ('${unitKey}','elite',${count}), ('${siegeKey}','siege',10)) AS u(k,t,c) RETURNING "armyId"`).split('\n')[0];   // no siege without engines
    return id;
  };
  const colonyRow = sql(`SELECT id||'|'||x||'|'||y FROM "City" WHERE "playerId"='${A.player.id}' AND NOT "isCapital" LIMIT 1`);
  if (colonyRow) {
    const [cid, cx, cy] = colonyRow.split('|');
    sql(`UPDATE "City" SET "wallStructure"=0.5 WHERE id='${cid}'`);   // Rome, secondary city: 2 assaults, one already won
    const raider = assault(B.player.id, cityB.id, { id: cid, x: cx, y: cy }, unitKeyFor('HUN', 'INFANTRY', 'elite'), 3000);
    await waitTick('colony razed', () => sql(`SELECT count(*) FROM "City" WHERE id='${cid}'`) === '0');
    assert('the razed colony gives its resource node back', sql(`SELECT count(*) FROM "ResourceNode" WHERE x=${cx} AND y=${cy} AND "cityId" IS NULL`) === '1');
    assert('the report tells the city was destroyed', sql(`SELECT loot->'lives'->>'fate' FROM "BattleReport" WHERE "attackerId"='${B.player.id}' AND loot->>'type'='ATTACK' AND x=${cx} AND y=${cy} LIMIT 1`) === 'RAZED');
    // the army is sent home just after the fall's own transaction: wait for it rather than read it at once
    await waitTick('victorious army sent home', () => sql(`SELECT status FROM "Army" WHERE id='${raider}'`) === 'RETURNING', 15000);
    assert('the victorious army heads home', sql(`SELECT status FROM "Army" WHERE id='${raider}'`) === 'RETURNING', sql(`SELECT status FROM "Army" WHERE id='${raider}'`));
  }
  const [bx0, by0] = [cityB.x, cityB.y];
  { // a won battle takes a life (a quarter for a Hun capital) and the same share of the wall's hit points; two camps of the
    // same player whose hour is over fight together; the pillage never takes more than a quarter of the unprotected stock
    sql(`UPDATE "City" SET "wallStructure"=1, "wallHp"="wallMaxHp", wood=20000, stone=20000, iron=20000, food=20000 WHERE id='${cityB.id}'`);
    const before = Number(sql(`SELECT wood FROM "City" WHERE id='${cityB.id}'`));
    const c1 = assault(A.player.id, cityA.id, cityB, unitKeyFor('ROME', 'INFANTRY', 'elite'), 3000);
    const c2 = assault(A.player.id, cityA.id, cityB, unitKeyFor('ROME', 'INFANTRY', 'elite'), 2000);
    await waitTick('allied camps fought together', () => sql(`SELECT status FROM "Army" WHERE id='${c1}'`) === 'RETURNING' && sql(`SELECT status FROM "Army" WHERE id='${c2}'`) === 'RETURNING');
    const lv = sql(`SELECT (loot->'lives'->>'before')||'>'||(loot->'lives'->>'after')||'/'||(loot->'lives'->>'total')||':'||(loot->>'camps') FROM "BattleReport" WHERE "playerId"='${A.player.id}' AND loot->>'type'='ATTACK' AND x=${bx0} AND y=${by0} ORDER BY "createdAt" DESC LIMIT 1`);
    assert('a won battle takes a life, both camps in one battle', lv === '4>3/4:2', lv);
    assert('the wall keeps the same share of its hit points as of lives', sql(`SELECT round(("wallHp"/"wallMaxHp"*100)::numeric)||':'||round(("wallStructure"*100)::numeric) FROM "City" WHERE id='${cityB.id}'`) === '75:75');
    const after = Number(sql(`SELECT wood FROM "City" WHERE id='${cityB.id}'`));
    assert('the pillage takes at most a quarter of the unprotected stock', after < before && before - after <= before / 4 + 1, `${before} -> ${after}`);
    assert('the camps carry the loot home', Number(sql(`SELECT coalesce(sum("carryWood"),0) FROM "Army" WHERE id IN ('${c1}','${c2}')`)) > 0);
  }
  sql(`UPDATE "City" SET "wallStructure"=0.25 WHERE id='${cityB.id}'`);   // Huns, capital: 4 lives, three already lost
  const breaker = assault(A.player.id, cityA.id, cityB, unitKeyFor('ROME', 'INFANTRY', 'elite'), 5000);
  await waitTick('capital relocated', () => sql(`SELECT x||','||y FROM "City" WHERE id='${cityB.id}'`) !== `${bx0},${by0}`);
  const [bx1, by1] = sql(`SELECT x||'|'||y FROM "City" WHERE id='${cityB.id}'`).split('|').map(Number);
  assert('a fallen capital is not taken: it flees near the edge of the map', Math.min(bx1 + 187, 186 - bx1, by1 + 187, 186 - by1) < 100 && sql(`SELECT "playerId" FROM "City" WHERE id='${cityB.id}'`) === B.player.id, `(${bx0}, ${by0}) -> (${bx1}, ${by1})`);
  assert('the relocated capital gets its full wall health back, siege lifted', sql(`SELECT "wallStructure"||':'||"isSieged" FROM "City" WHERE id='${cityB.id}'`) === '1:false');
  assert('its garrison moved with it', sql(`SELECT x||'|'||y FROM "Army" WHERE "cityId"='${cityB.id}' AND "isGarrison"`) === `${bx1}|${by1}`);
  assert('every army of the capital, wherever it was, is brought back to the new place', sql(`SELECT count(*) FROM "Army" WHERE "cityId"='${cityB.id}' AND NOT (x=${bx1} AND y=${by1} AND status='IDLE')`) === '0', sql(`SELECT string_agg(name||':'||status||':'||x||','||y, ' ') FROM "Army" WHERE "cityId"='${cityB.id}'`));
  assert('the report tells the capital fled', sql(`SELECT loot->'lives'->>'fate' FROM "BattleReport" WHERE "attackerId"='${A.player.id}' AND loot->>'type'='ATTACK' AND x=${bx0} AND y=${by0} ORDER BY "createdAt" DESC LIMIT 1`) === 'RELOCATED');
  await waitTick('attacker sent home', () => sql(`SELECT status FROM "Army" WHERE id='${breaker}'`) === 'RETURNING', 15000);
  assert('the attacker heads home', sql(`SELECT status FROM "Army" WHERE id='${breaker}'`) === 'RETURNING', sql(`SELECT status FROM "Army" WHERE id='${breaker}'`));
  cityB.x = bx1; cityB.y = by1;
}

// ---------- ENCOUNTERS ----------
// Two armies of declared enemies on the same tile at the same moment fight, even on the march: the winner goes on, the
// loser goes home (décision du 25 octobre 2026). Players without a declared war cross each other freely.
{
  const [ax, ay] = sql(`SELECT x||'|'||y FROM "City" WHERE id='${cityA.id}'`).split('|').map(Number);
  const tx = ax + 2, ty = ay;
  const mkArmy = (owner, home, name, status, x, y, tgtX, tgtY, unitKey, tier, count) => sql(`WITH a AS (INSERT INTO "Army"(id,"ownerId","cityId",name,x,y,"targetX","targetY",status,"missionType","departedAt","arrivalAt") VALUES (gen_random_uuid(),'${owner}','${home}','${name}',${x},${y},${tgtX === null ? 'NULL' : tgtX},${tgtY === null ? 'NULL' : tgtY},'${status}',${status === 'MOVING' ? "'MOVE'" : 'NULL'},${status === 'MOVING' ? "now()" : 'NULL'},${status === 'MOVING' ? "now()+interval '20 minutes'" : 'NULL'}) RETURNING id) INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) SELECT gen_random_uuid(), a.id, u.k, u.t, u.c FROM a, (VALUES ('${unitKey}','${tier}',${count})) AS u(k,t,c) RETURNING "armyId"`).split('\n')[0];
  // no war yet: a strong army walks through a weak one standing on its way
  sql(`DELETE FROM "AllianceMember" WHERE "playerId" IN ('${A.player.id}','${B.player.id}')`);
  const stand = mkArmy(B.player.id, cityB.id, 'Poste', 'IDLE', tx, ty, null, null, unitKeyFor('HUN', 'INFANTRY', 'base'), 'base', 10);
  const marcher = mkArmy(A.player.id, cityA.id, 'Colonne', 'MOVING', tx, ty, tx + 6, ty, unitKeyFor('ROME', 'INFANTRY', 'elite'), 'elite', 2000);
  await waitTick('a tick passes without a war', () => true);
  await sleep(31000);
  assert('without a declared war, armies on the same tile do not fight', sql(`SELECT status FROM "Army" WHERE id='${stand}'`) === 'IDLE' && Number(sql(`SELECT count(*) FROM "BattleReport" WHERE loot->>'type'='ENCOUNTER' AND x=${tx} AND y=${ty}`)) === 0);
  // war declared: the two alliances meet on the same tile and fight
  const alX = sql(`INSERT INTO "Alliance"(id,name,tag,"leaderId") VALUES (gen_random_uuid(),'Bellum${uid}','B${String(uid).slice(-4)}','${A.player.id}') RETURNING id`).split('\n')[0];
  const alY = sql(`INSERT INTO "Alliance"(id,name,tag,"leaderId") VALUES (gen_random_uuid(),'Hostis${uid}','H${String(uid).slice(-4)}','${B.player.id}') RETURNING id`).split('\n')[0];
  sql(`INSERT INTO "AllianceMember"(id,"allianceId","playerId",role) VALUES (gen_random_uuid(),'${alX}','${A.player.id}','LEADER'), (gen_random_uuid(),'${alY}','${B.player.id}','LEADER')`);
  sql(`INSERT INTO "AllianceDiplomacy"(id,"allianceId","targetAllianceId",status) VALUES (gen_random_uuid(),'${alX}','${alY}','ENEMY')`);
  sql(`UPDATE "Army" SET "departedAt"=now(), "arrivalAt"=now()+interval '20 minutes' WHERE id='${marcher}'`);   // still on the tile of the post
  const arrival0 = sql(`SELECT "arrivalAt"::text FROM "Army" WHERE id='${marcher}'`);
  await waitTick('the enemy armies meet', () => Number(sql(`SELECT count(*) FROM "BattleReport" WHERE loot->>'type'='ENCOUNTER' AND x=${tx} AND y=${ty}`)) >= 2);
  assert('one report for each side of the encounter', Number(sql(`SELECT count(*) FROM "BattleReport" WHERE loot->>'type'='ENCOUNTER' AND x=${tx} AND y=${ty}`)) === 2);
  assert('the loser goes home from the meeting tile', sql(`SELECT status||':'||x||','||y FROM "Army" WHERE id='${stand}'`) === `RETURNING:${tx},${ty}`, sql(`SELECT status||':'||x||','||y FROM "Army" WHERE id='${stand}'`));
  assert('the winner goes on its way, untouched', sql(`SELECT status||':'||("arrivalAt"::text)||':'||("claimedAt" IS NULL) FROM "Army" WHERE id='${marcher}'`) === `MOVING:${arrival0}:true`);
  const feed = await call('notifications after the encounter', 'GET', '/api/notifications?limit=10', tA);
  const meet = feed?.items?.find(n => n.title.includes('Rencontre'));
  assert('the encounter is in the feed with a link to the report', meet?.link?.to === 'report' && meet.link.reportId === sql(`SELECT id FROM "BattleReport" WHERE "playerId"='${A.player.id}' AND loot->>'type'='ENCOUNTER' ORDER BY "createdAt" DESC LIMIT 1`) && meet.link.x === tx);
  const byId = await call('the linked report, by id', 'GET', `/api/reports/battles/${meet?.link?.reportId}`, tA);
  assert('a report can be opened by id (links older than the list)', byId?.id === meet?.link?.reportId && byId?.loot?.type === 'ENCOUNTER');
  await call('another player\'s report by id -> 404', 'GET', `/api/reports/battles/${meet?.link?.reportId}`, tB, null, 404);
  await sleep(31000);
  assert('two armies that have just fought do not fight again while the loser leaves', Number(sql(`SELECT count(*) FROM "BattleReport" WHERE loot->>'type'='ENCOUNTER' AND x=${tx} AND y=${ty}`)) === 2);
  sql(`DELETE FROM "Army" WHERE id IN ('${stand}','${marcher}')`);
}

// ---------- BASTION D'ALLIANCE (décision du 26 octobre 2026) ----------
// A mène l'alliance alX, B l'alliance alY, ennemies (section précédente) : chantier, convois, achèvement, garnison, siège, chute
{
  const alX = sql(`SELECT "allianceId" FROM "AllianceMember" WHERE "playerId"='${A.player.id}'`);
  const raw = async (method, p, token, body) => { const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const b0 = await call('bastion: A sees the rules', 'GET', '/api/bastion', tA);
  assert('bastion: none yet, the leader may place it, 15 members needed', b0?.inAlliance && b0.canPlace && !b0.bastion && b0.minMembers === 15, JSON.stringify(b0).slice(0, 160));
  await call('bastion: place with 1 member -> 400', 'POST', '/api/bastion/place', tA, { x: cityA.x + 6, y: cityA.y + 6 }, 400);
  // 14 membres de plus (comptes de test sans ville)
  sql(`WITH acc AS (INSERT INTO "Account"(id,email,"passwordHash") SELECT gen_random_uuid(), 'bast'||g||'_${uid}@t.fr', 'x' FROM generate_series(1,14) g RETURNING id, email), pl AS (INSERT INTO "Player"(id,"accountId",name,faction) SELECT gen_random_uuid(), acc.id, 'Bast'||split_part(split_part(acc.email,'_',1),'t',2)||'_${uid}', 'ROME' FROM acc RETURNING id) INSERT INTO "AllianceMember"(id,"allianceId","playerId",role) SELECT gen_random_uuid(),'${alX}',pl.id,'MEMBER' FROM pl`);
  await call('bastion: too far from the alliance -> 400', 'POST', '/api/bastion/place', tA, { x: cityA.x + 45, y: cityA.y }, 400);
  let spot = null;
  for (let r = 5; r <= 25 && !spot; r++) for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
    const res = await raw('POST', '/api/bastion/place', tA, { x: cityA.x + dx, y: cityA.y + dy });
    if (res.status === 200) { spot = { x: cityA.x + dx, y: cityA.y + dy }; break; }
  }
  assert('bastion: placed on a free 2 × 2 spot near the alliance', !!spot);
  const bId = sql(`SELECT id FROM "Bastion" WHERE "allianceId"='${alX}'`);
  await call('bastion: a second one -> 400', 'POST', '/api/bastion/place', tA, { x: spot?.x, y: (spot?.y || 0) + 8 }, 400);
  const bB = await call('bastion: B sees its own alliance has none', 'GET', '/api/bastion', tB);
  assert('bastion: B has no Bastion', bB?.inAlliance && !bB.bastion);
  // armées de test : convoi et garnison pour A, armée de siège pour B
  const mk = (owner, home, name, units) => {
    const id = sql(`INSERT INTO "Army"(id,"ownerId","cityId",name,x,y,status) SELECT gen_random_uuid(),'${owner}','${home}','${name}',x,y,'IDLE' FROM "City" WHERE id='${home}' RETURNING id`).split('\n')[0];
    for (const [k, t, c] of units) sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${id}','${k}','${t}',${c})`);
    return id;
  };
  const conv = mk(A.player.id, cityA.id, 'Convoi', [['ROM_INF_MILICIEN', 'base', 100]]);
  const gar = mk(A.player.id, cityA.id, 'Praesidium', [['ROM_INF_MILICIEN', 'base', 10]]);
  const siege = mk(B.player.id, cityB.id, 'Horde', [['HUN_SIEGE_SAPEUR', 'siege', 20000], ['HUN_CAV_ELITE', 'elite', 50000]]);
  await call('bastion: no siege of a site without walls -> 400', 'POST', `/api/bastion/${bId}/send`, tB, { armyId: siege, mission: 'ATTACK' }, 400);
  await call('bastion: no garrison before it is built -> 400', 'POST', `/api/bastion/${bId}/send`, tA, { armyId: gar, mission: 'GARRISON' }, 400);
  await call('bastion: an enemy cannot supply it -> 403', 'POST', `/api/bastion/${bId}/send`, tB, { armyId: siege, mission: 'SUPPLY', resources: { wood: 10 } }, 403);
  // convoi : il ne manque que 1 000 bois ; l'armée en porte 1 500, le reste revient
  sql(`UPDATE "Bastion" SET wood=499000, stone=500000, iron=500000, food=250000 WHERE id='${bId}'`);
  richCity(cityA.id);
  await call('bastion: convoy over capacity -> 400', 'POST', `/api/bastion/${bId}/send`, tA, { armyId: conv, mission: 'SUPPLY', resources: { wood: 40000 } }, 400);
  await call('bastion: A sends a convoy', 'POST', `/api/bastion/${bId}/send`, tA, { armyId: conv, mission: 'SUPPLY', resources: { wood: 1500 } });
  sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${conv}'`);
  await waitTick('bastion fully supplied', () => sql(`SELECT status FROM "Bastion" WHERE id='${bId}'`) === 'BUILDING');
  assert('bastion: 3 days of building, the surplus goes home', sql(`SELECT round(extract(epoch FROM "buildEndsAt"-now())/86400)::int FROM "Bastion" WHERE id='${bId}'`) === '3' && sql(`SELECT status||':'||"carryWood" FROM "Army" WHERE id='${conv}'`) === 'RETURNING:500', sql(`SELECT status||':'||"carryWood" FROM "Army" WHERE id='${conv}'`));
  sql(`UPDATE "Bastion" SET "buildEndsAt"=now()-interval '1 second' WHERE id='${bId}'`);
  await waitTick('bastion built', () => sql(`SELECT status FROM "Bastion" WHERE id='${bId}'`) === 'ACTIVE');
  const vp = await call('bastion: on the map', 'GET', `/api/map/viewport?x=${spot?.x}&y=${spot?.y}&radius=8`, tB);
  assert('bastion: the map shows it with its alliance', (vp?.bastions || []).some(b => b.id === bId && b.status === 'ACTIVE' && b.allianceId === alX && b.structurePct === 100));
  // garnison de A ; B ne peut pas y entrer
  await call('bastion: B cannot garrison an enemy Bastion -> 403', 'POST', `/api/bastion/${bId}/send`, tB, { armyId: siege, mission: 'GARRISON' }, 403);
  await call('bastion: A cannot attack its own -> 400', 'POST', `/api/bastion/${bId}/send`, tA, { armyId: gar, mission: 'ATTACK' }, 400);
  await call('bastion: A garrisons it', 'POST', `/api/bastion/${bId}/send`, tA, { armyId: gar, mission: 'GARRISON' });
  sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${gar}'`);
  await waitTick('garrison stationed', () => sql(`SELECT status FROM "Army" WHERE id='${gar}'`) === 'STATIONED');
  const bA = await call('bastion: A sees the garrison', 'GET', '/api/bastion', tA);
  assert('bastion: the garrison is listed', (bA?.bastion?.garrison || []).some(g => g.id === gar && g.status === 'STATIONED'));
  // siège : camp d'1 h, puis assaut ; la garnison est battue, le Bastion perd une vie sur 10
  await call('bastion: B marches on it', 'POST', `/api/bastion/${bId}/send`, tB, { armyId: siege, mission: 'ATTACK' });
  sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${siege}'`);
  await waitTick('siege camp', () => sql(`SELECT status FROM "Army" WHERE id='${siege}'`) === 'BESIEGING');
  assert('bastion: besieged, the camp lasts 1 h', sql(`SELECT "isSieged"::text FROM "Bastion" WHERE id='${bId}'`) === 'true' && sql(`SELECT round(extract(epoch FROM "arrivalAt"-now())/60)::int FROM "Army" WHERE id='${siege}'`) === '60');
  sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityA.id}'), y=(SELECT y FROM "City" WHERE id='${cityA.id}'), "targetX"=NULL, "targetY"=NULL, "arrivalAt"=NULL, "missionType"=NULL, "targetBastionId"=NULL WHERE id='${conv}'`);
  await call('bastion: no garrison enters during a siege -> 400', 'POST', `/api/bastion/${bId}/send`, tA, { armyId: conv, mission: 'GARRISON' }, 400);
  sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${siege}'`);
  await waitTick('first assault', () => Number(sql(`SELECT count(*) FROM "BattleReport" WHERE loot->>'type'='BASTION' AND loot->>'bastionId'='${bId}'`)) >= 2);
  const lives1 = sql(`SELECT loot->'lives'->>'after' FROM "BattleReport" WHERE "playerId"='${B.player.id}' AND loot->>'bastionId'='${bId}' ORDER BY "createdAt" DESC LIMIT 1`);
  assert('bastion: assault won, 9 lives left of 10, a report for each side', lives1 === '9' && Number(sql(`SELECT count(*) FROM "BattleReport" WHERE "playerId"='${A.player.id}' AND loot->>'bastionId'='${bId}'`)) === 1, lives1);
  assert('bastion: the attacker goes home and the siege is lifted', sql(`SELECT status FROM "Army" WHERE id='${siege}'`) === 'RETURNING' && sql(`SELECT "isSieged"::text FROM "Bastion" WHERE id='${bId}'`) === 'false');
  // dernière vie : le Bastion est rasé, 7 jours avant d'en rebâtir un
  sql(`UPDATE "Bastion" SET structure=0.1, "structureAt"=now(), "isSieged"=true WHERE id='${bId}'`);
  sql(`UPDATE "Army" SET status='BESIEGING', x=${spot?.x}, y=${spot?.y}, "targetBastionId"='${bId}', "missionType"='BASTION_ATTACK', "arrivalAt"=now()-interval '1 second', "claimedAt"=NULL WHERE id='${siege}'`);
  await waitTick('bastion razed', () => sql(`SELECT status FROM "Bastion" WHERE id='${bId}'`) === 'DESTROYED');
  assert('bastion: razed with a 7-day cooldown', sql(`SELECT round(extract(epoch FROM "cooldownUntil"-now())/86400)::int FROM "Bastion" WHERE id='${bId}'`) === '7');
  await call('bastion: rebuild during the cooldown -> 400', 'POST', '/api/bastion/place', tA, { x: spot?.x, y: spot?.y }, 400);
  const vp2 = await call('bastion: map after the fall', 'GET', `/api/map/viewport?x=${spot?.x}&y=${spot?.y}&radius=8`, tB);
  assert('bastion: a razed Bastion leaves the map', !(vp2?.bastions || []).some(b => b.id === bId));
  sql(`DELETE FROM "Army" WHERE id IN ('${conv}','${gar}','${siege}')`);
  sql(`DELETE FROM "Bastion" WHERE id='${bId}'`);
  sql(`DELETE FROM "Account" WHERE email LIKE 'bast%_${uid}@t.fr'`);
}

// ---------- FAMINE (décision du 28 octobre 2026) ----------
// bilan de nourriture du serveur, alerte à 6 h, famine façon Travian (juste assez de morts, armées en mission comprises),
// siège : +10 % pour le camp, −10 % pour la ville assiégée
{
  const RP = createRequire(import.meta.url)('../src/game/processors/resourceProcessor.js');
  const hunBase = unitKeyFor('HUN', 'INFANTRY', 'base'), hunElite = unitKeyFor('HUN', 'INFANTRY', 'elite');
  const garB = sql(`SELECT id FROM "Army" WHERE "cityId"='${cityB.id}' AND "isGarrison" LIMIT 1`);
  sql(`DELETE FROM "Army" WHERE "cityId"='${cityB.id}' AND NOT "isGarrison"`);
  sql(`DELETE FROM "ArmyUnit" WHERE "armyId"='${garB}'`);
  sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${garB}','${hunBase}','base',400), (gen_random_uuid(),'${garB}','${hunElite}','elite',100)`);
  const away = mkTrader(B.player.id, cityB.id, 'Errante', hunElite, 50);
  sql(`UPDATE "Army" SET status='MOVING', "missionType"='MOVE', "targetX"=x+5, "targetY"=y, "departedAt"=now(), "arrivalAt"=now()+interval '5 hours' WHERE id='${away}'`);
  const bal = async () => (await RP.foodBalance([cityB.id])).get(cityB.id);
  const b0 = await bal();
  assert('famine: consumption counts the army on a mission (400 × 5 + 150 × 15)', b0.consumption === Math.round((400 * 5 + 150 * 15) * (1 - b0.reductionPct / 100)), JSON.stringify(b0));
  const cities = await call('famine: cities carry the food balance', 'GET', '/api/cities', tB);
  assert('famine: /api/cities gives the server balance', cities?.[0]?.foodBalance?.consumption === b0.consumption);
  // siège : la ville assiégée nourrit ses armées 10 % moins cher
  sql(`UPDATE "City" SET "isSieged"=true WHERE id='${cityB.id}'`);
  const bs = await bal();
  sql(`UPDATE "City" SET "isSieged"=false WHERE id='${cityB.id}'`);
  assert('famine: a besieged city feeds its armies 10 % cheaper (not the one away)', Math.abs(bs.consumption - Math.round((400 * 5 * 0.9 + 100 * 15 * 0.9 + 50 * 15) * (1 - b0.reductionPct / 100))) <= 1, `${bs.consumption}`);
  // alerte : grenier vide dans moins de 6 h
  const deficit = b0.consumption - b0.production;
  sql(`UPDATE "City" SET food=${Math.round(deficit * 3)}, "maxFoodStorage"=100000, "foodAlertAt"=NULL WHERE id='${cityB.id}'`);
  RP.resetFamineClock(); await RP.processUpkeep(1 / 3600);
  await sleep(500);
  assert('famine: B is warned the granary will be empty within 6 h', Number(sql(`SELECT count(*) FROM "Notification" WHERE "playerId"='${B.player.id}' AND title LIKE '%Grenier bientôt vide%'`)) >= 1 && sql(`SELECT ("foodAlertAt" IS NOT NULL)::text FROM "City" WHERE id='${cityB.id}'`) === 'true');
  // grenier vide : meurent juste assez de soldats, les plus gourmands d'abord (l'élite à 15)
  sql(`UPDATE "City" SET food=0 WHERE id='${cityB.id}'`);
  RP.resetFamineClock(); await RP.processUpkeep(1 / 3600);
  await sleep(500);
  const b1 = await bal();
  const elite = Number(sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" au JOIN "Army" a ON a.id=au."armyId" WHERE a."cityId"='${cityB.id}' AND au."unitKey"='${hunElite}'`));
  const base = Number(sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" au JOIN "Army" a ON a.id=au."armyId" WHERE a."cityId"='${cityB.id}' AND au."unitKey"='${hunBase}'`));
  assert('famine: consumption back under production, no more deaths than needed', b1.consumption <= b1.production && b1.production - b1.consumption < 15, JSON.stringify(b1));
  assert('famine: the hungriest (elite) die first', elite < 150 && (elite === 0 || base === 400), `elite=${elite} base=${base}`);
  assert('famine: B is told of the deaths', Number(sql(`SELECT count(*) FROM "Notification" WHERE "playerId"='${B.player.id}' AND title LIKE '%Famine%'`)) >= 1);
  sql(`DELETE FROM "Army" WHERE id='${away}'`);
  sql(`UPDATE "City" SET food=50000 WHERE id='${cityB.id}'`);
}

// ---------- CYCLE DU SERVEUR ET MERVEILLE (décision du 28 octobre 2026) ----------
// calendrier, inscriptions de 60 jours, sites et plans gardés par les Immortels, Ville Merveille, niveaux, vagues, victoire,
// Panthéon et titres, monde figé ; puis remise en état pour les autres tests
{
  const W0 = sql(`SELECT "readyAt"::text FROM "WorldConfig" WHERE id=1`);
  const setDay = (d) => sql(`UPDATE "WorldConfig" SET "readyAt"=now() - interval '${d - 1} days' - interval '1 hour' WHERE id=1`);
  const st0 = await call('world: calendar', 'GET', '/api/world/state', null);
  assert('world: day, registration open, wonder phases dated', st0?.day >= 1 && st0?.registration?.open === true && !!st0?.wonderSitesAt && st0?.sitesOpen === false, JSON.stringify(st0).slice(0, 200));
  // inscriptions closes après 60 jours
  setDay(61);
  sql(`DELETE FROM "RateLimitBucket" WHERE key LIKE 'register:%'`);
  const late = await call('world: sign-up after 60 days -> 403', 'POST', '/api/auth/register', null, { email: `late${uid}@t.fr`, password: PASSWORD, name: `Tardif${uid}`, faction: 'ROME' }, 403);
  assert('world: the refusal says registration is closed', late?.registrationClosed === true);
  // jour 151 : sites et plans posés par le tick
  setDay(151);
  await waitTick('wonder sites and plans appear', () => sql(`SELECT ("sitesSpawnedAt" IS NOT NULL AND "plansSpawnedAt" IS NOT NULL)::text FROM "WorldConfig" WHERE id=1`) === 'true');
  sql(`UPDATE "WorldConfig" SET "readyAt"='${W0}' WHERE id=1`);
  const sites = Number(sql(`SELECT count(*) FROM "ResourceNode" WHERE "resourceType"='WONDER'`)), plans = Number(sql(`SELECT count(*) FROM "ResourceNode" WHERE "resourceType"='PLAN'`));
  assert('world: 12 wonder sites and 13 plans, guarded by the Immortals', sites === 12 && plans === 13 && Number(sql(`SELECT min("defenderPower") FROM "ResourceNode" WHERE "resourceType"='WONDER'`)) > 500000, `${sites} ${plans}`);
  assert('world: every player is told', Number(sql(`SELECT count(*) FROM "Notification" WHERE "playerId"='${A.player.id}' AND kind='world'`)) >= 2);
  const siteNode = sql(`SELECT id||'|'||x||'|'||y FROM "ResourceNode" WHERE "resourceType"='WONDER' ORDER BY x LIMIT 1`).split('|');
  const planNode = sql(`SELECT id||'|'||x||'|'||y FROM "ResourceNode" WHERE "resourceType"='PLAN' ORDER BY x LIMIT 1`).split('|');
  // un plan pris aux Immortels (garnison réduite pour le test)
  const raider = mkTrader(A.player.id, cityA.id, 'Cohors', unitKeyFor('ROME', 'INFANTRY', 'elite'), 3000);
  sql(`UPDATE "ResourceNode" SET "defenderUnits"='{"SUL_INF_PALAIS": 5}', "defenderPower"=500 WHERE id='${planNode[0]}'`);
  await call('wonder: harvesting a plan site -> 400', 'POST', `/api/army/${raider}/collect-resource`, tA, { resourceNodeId: planNode[0] }, 400);
  await call('wonder: attack the Immortals guarding a plan', 'POST', `/api/army/${raider}/raid-resource`, tA, { resourceNodeId: planNode[0] });
  sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${raider}'`);
  await waitTick('plan taken', () => sql(`SELECT count(*) FROM "WonderPlan" WHERE "holderId"='${A.player.id}'`) === '1');
  assert('wonder: the plan site is gone, the army goes home', sql(`SELECT count(*) FROM "ResourceNode" WHERE id='${planNode[0]}'`) === '0' && sql(`SELECT status FROM "Army" WHERE id='${raider}'`) !== 'HARVESTING');
  sql(`DELETE FROM "Army" WHERE id='${raider}'`);
  // fondation de la Ville Merveille sur un site libéré
  sql(`UPDATE "ResourceNode" SET "hasDefenders"=false, "defenderPower"=0, "lastDefeat"=now() WHERE id='${siteNode[0]}'`);
  sql(`UPDATE "City" SET settlers=1, wood=50000, stone=50000, iron=50000, food=50000, "maxStorage"=100000, "maxFoodStorage"=100000 WHERE id='${cityA.id}'`);
  const settlerArmy = mkTrader(A.player.id, cityA.id, 'Coloni', infKey, 20);
  await call('wonder: found the Wonder City (no colony slot needed)', 'POST', `/api/army/${settlerArmy}/found-city`, tA, { resourceNodeId: siteNode[0], name: 'Babylone' });
  sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${settlerArmy}'`);
  await waitTick('wonder foundation started', () => sql(`SELECT status FROM "Army" WHERE id='${settlerArmy}'`) === 'FOUNDING');
  sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${settlerArmy}'`);
  await waitTick('Wonder City founded', () => sql(`SELECT count(*) FROM "City" WHERE "playerId"='${A.player.id}' AND "isWonder"`) === '1');
  const wonderId = sql(`SELECT id FROM "City" WHERE "playerId"='${A.player.id}' AND "isWonder"`);
  const wv = await call('wonder: view', 'GET', `/api/wonder/${wonderId}`, tA);
  assert('wonder: level 0, next level priced', wv?.level === 0 && wv?.next?.level === 1 && wv?.next?.cost?.wood === 50000 && wv?.mine === true, JSON.stringify(wv).slice(0, 200));
  await call('wonder: a level without stock -> 400', 'POST', `/api/wonder/${wonderId}/build`, tA, null, 400);
  await call('wonder: someone else cannot build it -> 403', 'POST', `/api/wonder/${wonderId}/build`, tB, null, 403);
  // un convoi vers la Ville Merveille remplit le chantier, sans plafond
  const conv = mkTrader(A.player.id, cityA.id, 'Plaustra', infKey, 400);
  const [wx, wy] = [Number(siteNode[1]), Number(siteNode[2])];
  await call('wonder: convoy to the Wonder City', 'POST', '/api/trade/send', tA, { fromCityId: cityA.id, targetX: wx, targetY: wy, resources: { wood: 20000, stone: 0, iron: 0, food: 0 } });
  sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${conv}'`);
  await waitTick('convoy into the wonder stock', () => Number(sql(`SELECT "wonderWood" FROM "City" WHERE id='${wonderId}'`)) >= 20000);
  sql(`DELETE FROM "Army" WHERE id='${conv}'`);
  sql(`UPDATE "City" SET "wonderWood"=10000000, "wonderStone"=10000000, "wonderIron"=10000000, "wonderFood"=10000000 WHERE id='${wonderId}'`);
  await call('wonder: level 1 started', 'POST', `/api/wonder/${wonderId}/build`, tA);
  await call('wonder: one level at a time -> 400', 'POST', `/api/wonder/${wonderId}/build`, tA, null, 400);
  sql(`UPDATE "City" SET "wonderBuildEndsAt"=now()-interval '1 second' WHERE id='${wonderId}'`);
  await waitTick('wonder level 1', () => sql(`SELECT "wonderLevel" FROM "City" WHERE id='${wonderId}'`) === '1');
  // au-delà de 50, il faut un plan dans l'alliance
  sql(`UPDATE "City" SET "wonderLevel"=50 WHERE id='${wonderId}'`);
  sql(`UPDATE "WonderPlan" SET "holderId"='${B.player.id}' WHERE "holderId"='${A.player.id}'`);
  await call('wonder: level 51 without a plan in the alliance -> 400', 'POST', `/api/wonder/${wonderId}/build`, tA, null, 400);
  sql(`UPDATE "WonderPlan" SET "holderId"='${A.player.id}' WHERE "holderId"='${B.player.id}'`);
  await call('wonder: level 51 with the plan', 'POST', `/api/wonder/${wonderId}/build`, tA);
  sql(`UPDATE "City" SET "wonderBuildEndsAt"=NULL WHERE id='${wonderId}'`);
  // une vague d'Immortels contre une Ville Merveille sans défense lui ôte un niveau
  sql(`UPDATE "City" SET "lastImmortalWave"=now()-interval '13 hours' WHERE id='${wonderId}'`);
  await waitTick('Immortal wave', () => sql(`SELECT count(*) FROM "BattleReport" WHERE "playerId"='${A.player.id}' AND loot->>'type'='IMMORTALS'`) !== '0');
  assert('wonder: the undefended Wonder City loses a level to the Immortals', sql(`SELECT "wonderLevel" FROM "City" WHERE id='${wonderId}'`) === '49');
  const list = await call('wonder: list of Wonder Cities and plans', 'GET', '/api/wonder', tB);
  assert('wonder: the list shows the city and the plan holder', (list?.wonders || []).some(w => w.cityId === wonderId) && (list?.plans || []).some(p => p.holder === A.player.name));
  // victoire : niveau 100, monde figé, Panthéon, titres
  sql(`UPDATE "City" SET "wonderLevel"=99, "wonderBuildEndsAt"=now()-interval '1 second' WHERE id='${wonderId}'`);
  await waitTick('world won', () => sql(`SELECT ("endedAt" IS NOT NULL)::text FROM "WorldConfig" WHERE id=1`) === 'true');
  const wn = sql(`SELECT number FROM "WorldConfig" WHERE id=1`);
  assert('world: winner and Hall of Fame recorded', /Babylone/.test(sql(`SELECT "winnerName" FROM "WorldConfig" WHERE id=1`)) && Number(sql(`SELECT count(*) FROM "HallOfFame" WHERE world=${wn} AND category='WONDER'`)) === 1);
  assert('world: the winners get a title on their account', /Bâtisseur de la Merveille/.test(sql(`SELECT coalesce(titles::text,'') FROM "Account" WHERE id=(SELECT "accountId" FROM "Player" WHERE id='${A.player.id}')`)));
  const hof = await call('world: Hall of Fame', 'GET', '/api/world/hall-of-fame', null);
  assert('world: the Hall of Fame lists this world', (hof || []).some(w => String(w.world) === wn && w.categories?.WONDER?.length === 1));
  await sleep(10500);   // cache « monde terminé » (10 s)
  await call('world: a finished world is frozen -> 423', 'POST', `/api/army/create`, tA, { cityId: cityA.id, slot: 4, name: 'Trop tard' }, 423);
  await call('world: reading still works', 'GET', '/api/cities', tA);
  // remise en état pour la suite
  sql(`UPDATE "WorldConfig" SET "endedAt"=NULL, "winnerName"=NULL, "winnerAllianceId"=NULL, "sitesSpawnedAt"=NULL, "plansSpawnedAt"=NULL WHERE id=1`);
  sql(`DELETE FROM "HallOfFame" WHERE world=${wn}`);
  sql(`UPDATE "Account" SET titles=NULL WHERE titles IS NOT NULL`);
  sql(`DELETE FROM "City" WHERE id='${wonderId}'`);
  sql(`DELETE FROM "ResourceNode" WHERE "resourceType" IN ('WONDER','PLAN')`);
  sql(`DELETE FROM "WonderPlan"`);
  sql(`DELETE FROM "Army" WHERE id='${settlerArmy}'`);
  await sleep(10500);
  // rejoindre le monde (compte gardé d'un monde précédent : un joueur sans ville)
  sql(`DELETE FROM "RateLimitBucket" WHERE key LIKE 'register:%'`);
  const J = await call('world: a player for the next world', 'POST', '/api/auth/register', null, { email: `next${uid}@t.fr`, password: PASSWORD, name: `Novus${uid}`, faction: 'ROME' });
  sql(`DELETE FROM "City" WHERE "playerId"='${J?.player?.id}'`); sql(`DELETE FROM "Hero" WHERE "playerId"='${J?.player?.id}'`);
  await call('world: join with a new civilization', 'POST', '/api/world/join', J?.token, { faction: 'EGYPT' });
  assert('world: a new capital in the new world, civilization changed', sql(`SELECT count(*) FROM "City" WHERE "playerId"='${J?.player?.id}' AND "isCapital"`) === '1' && sql(`SELECT faction FROM "Player" WHERE id='${J?.player?.id}'`) === 'EGYPT');
  await call('world: join twice -> 400', 'POST', '/api/world/join', J?.token, { faction: 'EGYPT' }, 400);
}

// ---------- WRAP UP ----------
const fails = results.filter(r => !r.ok);
console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`);
for (const f of fails) console.log(`FAIL: ${f.name} [${f.status}] ${f.detail}`);
process.exit(fails.length ? 1 : 0);
