// End-to-end checks of the store-compliance endpoints: analytics, catalog, push tokens, entitlements, account deletion.
// Needs a running API (API_BASE, default http://localhost:3000).
import { execSync } from 'node:child_process';
const API = process.env.API_BASE || 'http://localhost:3000';
const DB = process.env.DATABASE_URL || 'postgresql://monjeu:monjeu123@localhost:5432/monjeu';
const sql = (q) => execSync(`psql "${DB}" -At -c ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();
const giveEmbassy = (playerId, level) => sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) SELECT gen_random_uuid(), id, 'EMBASSY', 33, ${level} FROM "City" WHERE "playerId"='${playerId}' ON CONFLICT DO NOTHING`);
// Local test database: the shared sign-up limiter (10 per minute per address) must not fail a suite run right after another one
try { sql('DELETE FROM "RateLimitBucket" WHERE key LIKE \'register:%\' OR key LIKE \'auth:%\''); } catch (e) { /* no SQL access: the limiter stays */ }
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name, extra); } else { fail++; console.log('FAIL', name, extra); } };
const j = async (path, opts = {}, token) => {
  const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  let body = null; try { body = await res.json(); } catch (e) {}
  return { status: res.status, body };
};
const uid = Math.floor(Math.random() * 1e6);
const email = `compl${uid}@t.fr`, password = 'Test1234!';
const reg = await j('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name: `Compl${uid}`, faction: 'GREEK' }) });
check('register', reg.status === 200 && !!reg.body.token);
const token = reg.body.token;
const me = await j('/api/player/me', {}, token);
check('me exposes premiumUntil/cosmetics', me.status === 200 && 'premiumUntil' in me.body && 'cosmetics' in me.body);
// analytics
const an = await j('/api/analytics/events', { method: 'POST', body: JSON.stringify({ events: [{ event: 'app_open', platform: 'web' }, { event: 'bad event!' }, { event: 'first_build', props: { key: 'FARM', n: 1, bad: { x: 1 } } }] }) });
check('analytics anonymous accepts valid events only', an.status === 200 && an.body.stored === 2, JSON.stringify(an.body));
const an2 = await j('/api/analytics/events', { method: 'POST', body: JSON.stringify({ events: [{ event: 'tab_view', props: { tab: 'city' } }] }) }, token);
check('analytics authenticated', an2.status === 200 && an2.body.stored === 1);
const funnelNoKey = await j('/api/analytics/funnel');
check('funnel requires admin key', funnelNoKey.status === 401);
// catalog + entitlements
const cat = await j('/api/purchases/catalog');
check('catalog lists products', cat.status === 200 && cat.body.products.length >= 3 && cat.body.products.some(p => p.type === 'subscription'));
const pm = await j('/api/purchases/me', {}, token);
check('purchases/me default entitlements', pm.status === 200 && pm.body.premium === false && Array.isArray(pm.body.cosmetics) && pm.body.purchases.length === 0);
const sync = await j('/api/purchases/sync', { method: 'POST' }, token);
check('sync without RevenueCat key -> 503', sync.status === 503);
const wh = await j('/api/purchases/webhook', { method: 'POST', body: JSON.stringify({ event: { app_user_id: 'x' } }) });
check('webhook rejects without auth', wh.status === 401);
// push tokens
const push = await j('/api/push/register', { method: 'POST', body: JSON.stringify({ token: 'devicetoken-' + uid, platform: 'ios' }) }, token);
check('push register', push.status === 200 && push.body.delivery === 'server_not_configured', JSON.stringify(push.body));
const pushBad = await j('/api/push/register', { method: 'POST', body: JSON.stringify({ token: 'x', platform: 'ios' }) }, token);
check('push register validates token', pushBad.status === 400);
const pushDel = await j('/api/push/register', { method: 'DELETE', body: JSON.stringify({ token: 'devicetoken-' + uid }) }, token);
check('push unregister', pushDel.status === 200);
// public pages
const priv = await fetch(API + '/privacy'); const privTxt = await priv.text();
check('privacy page served', priv.status === 200 && /Politique de confidentialité/.test(privTxt));
const sup = await fetch(API + '/support');
check('support page served', sup.status === 200);
// password change revokes the previous token
const pwBad = await j('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: 'nope-nope', newPassword: 'NewPass1234!' }) }, token);
check('password change refuses wrong current password', pwBad.status === 400);
const pw = await j('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: password, newPassword: 'NewPass1234!' }) }, token);
check('password change returns a new token', pw.status === 200 && !!pw.body.token);
const oldTok = await j('/api/player/me', {}, token);
check('old token revoked after password change', oldTok.status === 401, 'status ' + oldTok.status);
const newTok = await j('/api/player/me', {}, pw.body.token);
check('new token works', newTok.status === 200);
const password2 = 'NewPass1234!', token2 = pw.body.token;
// account deletion
const delWrong = await j('/api/auth/account', { method: 'DELETE', body: JSON.stringify({ password: 'nope' }) }, token2);
check('delete account refuses wrong password', delWrong.status === 400);
const del = await j('/api/auth/account', { method: 'DELETE', body: JSON.stringify({ password: password2 }) }, token2);
check('delete account', del.status === 204);
const login = await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: password2 }) });
check('login after deletion fails', login.status === 401 || login.status === 404 || login.status === 400, 'status ' + login.status);
const meAfter = await j('/api/player/me', {}, token2);
check('token unusable after deletion', meAfter.status === 401, 'status ' + meAfter.status);
const cityAfter = await j('/api/cities', {}, token2);
check('every route refuses the deleted account token', cityAfter.status === 401, 'status ' + cityAfter.status);
// re-register with the same email must work (email freed)
const reg2 = await j('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name: `Compl${uid}b`, faction: 'ROME' }) });
check('email reusable after deletion', reg2.status === 200);
// alliance leadership handover on deletion
const leader = await j('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `lead${uid}@t.fr`, password, name: `Lead${uid}`, faction: 'HUN' }) });
const member = await j('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `memb${uid}@t.fr`, password, name: `Memb${uid}`, faction: 'GAUL' }) });
check('leader and member registered', leader.status === 200 && member.status === 200, `status ${leader.status}/${member.status} ${JSON.stringify(member.body).slice(0, 80)}`);
giveEmbassy(leader.body.player.id, 7); giveEmbassy(member.body.player.id, 5);
const al = await j('/api/alliance/create', { method: 'POST', body: JSON.stringify({ name: `Alliance${uid}`, tag: uid.toString(36).toUpperCase().padStart(5, 'Z').slice(-5) }) }, leader.body.token);   // 5-character tag: no clash with earlier runs
check('alliance created', al.status === 200 || al.status === 201, 'status ' + al.status);
const inv = await j('/api/alliance/invite', { method: 'POST', body: JSON.stringify({ playerName: `Memb${uid}` }) }, leader.body.token);
const invites = await j('/api/alliance/invites', {}, member.body.token);
const inviteId = invites.body && invites.body[0] && invites.body[0].id;
const join = inviteId ? await j(`/api/alliance/${invites.body[0].allianceId}/join`, { method: 'POST' }, member.body.token) : { status: 0 };
check('member joined', join.status === 200, 'invite ' + inv.status + ' join ' + join.status + ' ' + JSON.stringify(join.body));
const delLeader = await j('/api/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) }, leader.body.token);
check('leader deleted', delLeader.status === 204);
const mine = await j('/api/alliance/mine', {}, member.body.token);
check('alliance survives with new leader', mine.status === 200 && mine.body && (mine.body.leaderId === member.body.player.id || mine.body.alliance?.leaderId === member.body.player.id), JSON.stringify(mine.body).slice(0, 160));
// ReDoS guard: a huge name is refused immediately
const t0 = Date.now();
const redos = await j('/api/alliance/create', { method: 'POST', body: JSON.stringify({ name: '<'.repeat(150000), tag: 'ZZZ' }) }, member.body.token);
check('oversized text refused quickly (no ReDoS)', redos.status === 400 && Date.now() - t0 < 2000, `status ${redos.status} in ${Date.now() - t0} ms`);
console.log(`\n==== ${pass}/${pass + fail} PASS ====`);
process.exit(fail ? 1 : 0);
