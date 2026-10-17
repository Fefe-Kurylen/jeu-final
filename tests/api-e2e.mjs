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
const richCity = (cityId) => sql(`UPDATE "City" SET wood=50000, stone=50000, iron=50000, food=50000, "maxStorage"=100000, "maxFoodStorage"=100000 WHERE id='${cityId}'`);

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
sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${garA}','${siegeKey}','siege',5) ON CONFLICT ("armyId","unitKey") DO UPDATE SET count=5`);

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
await call('army set-unit 2 siege', 'POST', `/api/army/${armyId}/set-unit`, tA, { unitKey: siegeKey, count: 2 });
await call('assign-hero (moves hero from garrison)', 'POST', `/api/army/${armyId}/assign-hero`, tA, {});
assert('hero moved garrison -> army', sql(`SELECT count(*) FROM "Army" WHERE id='${armyId}' AND "heroId" IS NOT NULL`) === '1' && sql(`SELECT count(*) FROM "Army" WHERE id='${garA}' AND "heroId" IS NOT NULL`) === '0');
await call('army unassign-hero', 'POST', `/api/army/${armyId}/unassign-hero`, tA, {});
await call('army get other player army -> 404', 'GET', `/api/army/${armyId}`, tB, null, 404);

// ---------- ATTACK ----------
await call('army attack B', 'POST', `/api/army/${armyId}/attack`, tA, { targetCityId: cityB.id });
await call('incoming attacks B', 'GET', '/api/city/incoming-attacks', tB);
await call('attack own city -> 400', 'POST', `/api/army/${armyId}/attack`, tA, { targetCityId: cityA.id }, 400);
const bUnitsBefore = Number(sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" WHERE "armyId"='${garB}'`));
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('battle resolved', () => Number(sql(`SELECT count(*) FROM "BattleReport" WHERE "attackerId"='${A.player.id}'`)) >= 1);
const rep = await call('reports/battles A', 'GET', '/api/reports/battles', tA);
await call('reports/battles B', 'GET', '/api/reports/battles', tB);
if (Array.isArray(rep) && rep[0]) console.log('  battle:', JSON.stringify({ winner: rep[0].winner, aLoss: rep[0].attackerLosses?.rate, dLoss: rep[0].defenderLosses?.rate, wallDamage: rep[0].loot?.wallDamage }).slice(0, 300));
assert('exactly 2 report copies for one battle', sql(`SELECT count(*) FROM "BattleReport" WHERE "attackerId"='${A.player.id}' AND "defenderId"='${B.player.id}' AND loot->>'type'='ATTACK'`) === '2');
const bUnitsAfter = Number(sql(`SELECT coalesce(sum(count),0) FROM "ArmyUnit" WHERE "armyId"='${garB}'`));
assert('defender lost units, never negative', bUnitsAfter >= 0 && bUnitsAfter <= bUnitsBefore, `${bUnitsBefore} -> ${bUnitsAfter}`);
assert('claimedAt released after resolution', sql(`SELECT count(*) FROM "Army" WHERE id='${armyId}' AND "claimedAt" IS NOT NULL`) === '0');
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}' AND status='RETURNING'`);
await waitTick('army returned home', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');

// ---------- RAID / SPY / MOVE / RETURN ----------
await call('army raid B', 'POST', `/api/army/${armyId}/raid`, tA, { targetCityId: cityB.id });
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
await call('army spy B', 'POST', `/api/army/${armyId}/spy`, tA, { targetCityId: cityB.id });
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('spy report', () => Number(sql(`SELECT count(*) FROM "SpyReport" WHERE "playerId"='${A.player.id}'`)) >= 1);
await call('reports/spy A', 'GET', '/api/reports/spy', tA);
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}' AND status<>'IDLE'`);
await waitTick('army idle after spy', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');
{
  // Terrain: a destination on a mountain or in water is refused; a valid move records the departure time
  let blockedTile = null;
  for (let r = 2; r < 60 && !blockedTile; r++) for (let dx = -r; dx <= r && !blockedTile; dx++) for (let dy = -r; dy <= r; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = cityA.x + dx, y = cityA.y + dy;
    if (Terrain.inWorld(x, y) && Terrain.isBlocked(x, y)) { blockedTile = { x, y }; break; }
  }
  if (blockedTile) await call('army move onto mountain/water -> 400', 'POST', `/api/army/${armyId}/move`, tA, blockedTile, 400);
  else assert('a blocked tile exists near the city', false, 'none within 60 tiles');
}
await call('army move', 'POST', `/api/army/${armyId}/move`, tA, { x: cityA.x + 3, y: cityA.y + 3 });
assert('departure time recorded for the march', sql(`SELECT ("departedAt" IS NOT NULL)::text FROM "Army" WHERE id='${armyId}'`) === 'true');
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('army arrived at move target', () => sql(`SELECT x||','||y FROM "Army" WHERE id='${armyId}'`) === `${cityA.x + 3},${cityA.y + 3}`);
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
const undefendedId = sql(`SELECT id FROM "ResourceNode" WHERE NOT "hasPlayerArmy" AND "resourceType"<>'GOLD' ORDER BY abs(x-(${cityA.x}))+abs(y-(${cityA.y})) LIMIT 1`);
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
await call('collect-resource on an occupied node -> 409', 'POST', `/api/army/${army2.army.id}/collect-resource`, tA, { resourceNodeId: undefendedId }, 409);
await waitTick('harvest fills the cargo', () => Number(sql(`SELECT "carryWood"+"carryStone"+"carryIron"+"carryFood" FROM "Army" WHERE id='${armyId}'`)) > 0, 90000);
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
await call('armies/send (generic mission)', 'POST', '/api/armies/send', tA, { armyId, targetX: cityA.x + 1, targetY: cityA.y, mission: 'MOVE' });
await call('army disband while moving -> 400', 'DELETE', `/api/army/${armyId}/disband`, tA, null, 400);
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('army arrived (send)', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) !== 'MOVING');
await call('army return after send', 'POST', `/api/army/${armyId}/return`, tA, {});
sql(`UPDATE "Army" SET "arrivalAt"=now()-interval '1 second' WHERE id='${armyId}'`);
await waitTick('army home final', () => sql(`SELECT status FROM "Army" WHERE id='${armyId}'`) === 'IDLE');
await call('army disband', 'DELETE', `/api/army/${armyId}/disband`, tA);

// ---------- WOUNDED ----------
await call('wounded list B', 'GET', `/api/city/${cityB.id}/wounded`, tB);

// ---------- MARKET ----------
await call('market list', 'GET', '/api/market', tA);
const offer = await call('market offer create', 'POST', '/api/market/offer', tA, { cityId: cityA.id, sellResource: 'wood', sellAmount: 100, buyResource: 'iron', buyAmount: 80 });
const offerId = offer?.offer?.id || offer?.id;
await call('market offer ratio 1:10 -> 400', 'POST', '/api/market/offer', tA, { cityId: cityA.id, sellResource: 'wood', sellAmount: 1000, buyResource: 'iron', buyAmount: 100 }, 400);
await call('market offer accept own -> 400', 'POST', `/api/market/offer/${offerId}/accept`, tA, { cityId: cityA.id }, 400);
await call('market offer accept by B', 'POST', `/api/market/offer/${offerId}/accept`, tB, { cityId: cityB.id });
const offer2 = await call('market offer #2', 'POST', '/api/market/offer', tA, { cityId: cityA.id, sellResource: 'stone', sellAmount: 50, buyResource: 'food', buyAmount: 50 });
await call('market offer cancel', 'DELETE', `/api/market/offer/${offer2?.offer?.id || offer2?.id}`, tA);
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
await call('alliance diplomacy get', 'GET', '/api/alliance/diplomacy', tA);
await call('diplomacy/player/:id', 'GET', `/api/diplomacy/player/${B.player.id}`, tA);
{ sql(`UPDATE "Army" SET status='IDLE', x=(SELECT x FROM "City" WHERE id='${cityA.id}'), y=(SELECT y FROM "City" WHERE id='${cityA.id}'), "arrivalAt"=NULL, "claimedAt"=NULL, "missionType"=NULL WHERE "ownerId"='${A.player.id}' AND NOT "isGarrison"`);
  const ar = await call('army create for ally test', 'POST', '/api/army/create', tA, { cityId: cityA.id, slot: 3, name: 'Socii' });
  const a4 = ar?.army?.id; await call('a4 set-unit', 'POST', `/api/army/${a4}/set-unit`, tA, { unitKey: infKey, count: 5 });
  await call('raid alliance member -> 400', 'POST', `/api/army/${a4}/raid`, tA, { targetCityId: cityB.id }, 400);
  await call('send RAID alliance member -> 400', 'POST', '/api/armies/send', tA, { armyId: a4, targetX: cityB.x, targetY: cityB.y, mission: 'RAID' }, 400); }
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

const goldNode = sql(`SELECT id||'|'||x||'|'||y FROM "ResourceNode" WHERE "resourceType"='GOLD' AND NOT "hasPlayerArmy" ORDER BY abs(x-(${cityA.x}))+abs(y-(${cityA.y})) LIMIT 1`).split('|');
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
  const off = await call('offer for race', 'POST', '/api/market/offer', C.token, { cityId: cityC.id, sellResource: 'wood', sellAmount: 300, buyResource: 'stone', buyAmount: 100 });
  const oid = off?.offer?.id;
  const [r1, r2] = await Promise.all([
    fetch(`${BASE}/api/market/offer/${oid}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${D.token}` }, body: JSON.stringify({ cityId: cityD.id }) }),
    fetch(`${BASE}/api/market/offer/${oid}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tA}` }, body: JSON.stringify({ cityId: cityA.id }) })
  ]);
  const okCount = [r1.status, r2.status].filter(c => c === 200).length;
  const dWood = Number(sql(`SELECT wood FROM "City" WHERE id='${cityD.id}'`)), aWood = Number(sql(`SELECT wood FROM "City" WHERE id='${cityA.id}'`));
  const credited = (dWood > 50000 ? 1 : 0) + (aWood > 50000 ? 1 : 0);
  assert('concurrent offer accept: single trade', okCount === 1 && credited === 1, `codes=${r1.status},${r2.status} credited=${credited}`);
}
{
  addBuilding(cityD.id, 'RALLY_POINT', 31, 10);
  const ar = await call('D army create', 'POST', '/api/army/create', D.token, { cityId: cityD.id, slot: 1, name: 'Expl' });
  const garD = sql(`SELECT id FROM "Army" WHERE "cityId"='${cityD.id}' AND "isGarrison" LIMIT 1`);
  sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${garD}','${unitKeyFor('GAUL', 'INFANTRY', 'base')}','base',50) ON CONFLICT ("armyId","unitKey") DO UPDATE SET count=50`);
  await call('D army set-unit', 'POST', `/api/army/${ar.army.id}/set-unit`, D.token, { unitKey: unitKeyFor('GAUL', 'INFANTRY', 'base'), count: 50 });
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

// ---------- WRAP UP ----------
const fails = results.filter(r => !r.ok);
console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`);
for (const f of fails) console.log(`FAIL: ${f.name} [${f.status}] ${f.detail}`);
process.exit(fails.length ? 1 : 0);
