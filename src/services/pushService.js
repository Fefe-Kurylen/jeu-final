// Notifications push sans dépendance : APNs (HTTP/2 + jeton JWT ES256) et FCM v1 (compte de service).
// Inactif tant que les clés ne sont pas configurées ; ne lève jamais d'erreur vers la logique de jeu.
const http2 = require('http2');
const crypto = require('crypto');
const config = require('../config');
const prisma = require('../config/database');

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

// ---- APNs ----
let apnsJwt = { token: null, issuedAt: 0 };
function apnsToken() {
  const { keyId, teamId, privateKey } = config.push.apns;
  if (!keyId || !teamId || !privateKey) return null;
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt.token && now - apnsJwt.issuedAt < 50 * 60) return apnsJwt.token;   // Apple : renouveler entre 20 et 60 min
  const unsigned = `${b64url({ alg: 'ES256', kid: keyId })}.${b64url({ iss: teamId, iat: now })}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  apnsJwt = { token: `${unsigned}.${signature}`, issuedAt: now };
  return apnsJwt.token;
}

function sendApns(deviceToken, { title, body, data }) {
  return new Promise((resolve) => {
    const jwt = apnsToken();
    if (!jwt) return resolve({ skipped: true });
    const host = config.push.apns.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
    const client = http2.connect(host);
    const timer = setTimeout(() => { client.close(); resolve({ status: 0, error: 'timeout' }); }, 10000);
    client.on('error', (e) => { clearTimeout(timer); resolve({ status: 0, error: e.message }); });
    const req = client.request({
      ':method': 'POST', ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`, 'apns-topic': config.push.apns.bundleId, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': '0',
      'content-type': 'application/json'
    });
    let chunks = '';
    let status = 0;
    req.on('response', (headers) => { status = headers[':status']; });
    req.on('data', (d) => { chunks += d; });
    req.on('end', () => { clearTimeout(timer); client.close(); resolve({ status, body: chunks }); });
    req.on('error', (e) => { clearTimeout(timer); client.close(); resolve({ status: 0, error: e.message }); });
    // custom keys at the top level of the payload: the app reads them from notification.data (the whole userInfo on iOS)
    req.end(JSON.stringify({ ...(data || {}), aps: { alert: { title, body }, sound: 'default' }, data: data || {} }));
  });
}

// ---- FCM v1 ----
let fcmAuth = { token: null, expiresAt: 0 };
function fcmServiceAccount() {
  try { return config.push.fcm.serviceAccount ? JSON.parse(config.push.fcm.serviceAccount) : null; } catch (e) { return null; }
}
async function fcmAccessToken() {
  const sa = fcmServiceAccount();
  if (!sa || !sa.client_email || !sa.private_key) return null;
  if (fcmAuth.token && Date.now() < fcmAuth.expiresAt - 60000) return fcmAuth.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${signature}` });
  if (!res.ok) throw new Error('FCM auth ' + res.status);
  const json = await res.json();
  fcmAuth = { token: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
  return fcmAuth.token;
}
async function sendFcm(deviceToken, { title, body, data }) {
  const sa = fcmServiceAccount();
  const accessToken = await fcmAccessToken();
  if (!sa || !accessToken) return { skipped: true };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token: deviceToken, notification: { title, body }, data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])) } })
  });
  return { status: res.status, body: await res.text() };
}

// ---- Envoi ----
const lastSent = new Map();   // `${playerId}:${kind}` -> timestamp (anti-spam)
function configured() { return !!(apnsToken() || fcmServiceAccount()); }

// Where a notification leads (décision du 25 octobre 2026) — the client opens it on a tap:
//   { to: 'map', x, y }            the spot on the map (a camp, a city, a moved capital, a halted army)
//   { to: 'report', reportId }     a battle report        { to: 'spy', reportId }   a spy report
//   { to: 'army', armyId }         the army's card        { to: 'siege', cityId }   the siege window of a city
//   { to: 'city', cityId }         a city of the player (constructions, research)
//   { to: 'chat', channel }        a channel of the messaging ("private:<id>", "friends"…)
//   { to: 'alliance', sub }        a section of the alliance tab (diplomacy, help, members)
//   { to: 'hero' }                 the hero screen (level up, fall, resurrection)
// `tab` is kept for the mobile apps already installed (they only know the tab).
const TAB_OF = { map: 'map', report: 'reports', spy: 'reports', army: 'army', siege: 'map', city: 'city', chat: 'messages', alliance: 'alliance', hero: 'hero' };
const TO_OF_TAB = { reports: 'report', army: 'army', map: 'map', city: 'city' };
function normalizeLink(data) {
  if (!data || typeof data !== 'object') return null;
  const link = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null));
  if (!link.to) link.to = TO_OF_TAB[link.tab] || 'city';
  if (!link.tab) link.tab = TAB_OF[link.to] || 'city';
  return link;
}

// Every alert is first a message in the game (fil de notifications) ; the mobile push is sent from it, throttled.
// opts.feed = false: push only (a private message already has its badge in the Messages tab)
async function notifyPlayer(playerId, kind, title, body, data = {}, opts = {}) {
  try {
    if (!playerId) return;
    const link = normalizeLink(data);
    const row = opts.feed === false ? null : await prisma.notification.create({ data: { playerId, kind, title: String(title).slice(0, 120), body: String(body).slice(0, 500), link } });
    if (!configured()) return;
    data = { ...(link || {}), ...(row ? { notificationId: row.id } : {}) };
    const key = `${playerId}:${kind}`;
    const minGap = config.push.throttleMs[kind] ?? 60000;
    const now = Date.now();
    if (now - (lastSent.get(key) || 0) < minGap) return;
    lastSent.set(key, now);
    if (lastSent.size > 50000) lastSent.clear();
    const tokens = await prisma.pushToken.findMany({ where: { playerId } });
    for (const t of tokens) {
      const result = t.platform === 'ios' ? await sendApns(t.token, { title, body, data: { kind, ...data } }) : await sendFcm(t.token, { title, body, data: { kind, ...data } });
      const dead = result.status === 410 || (result.status === 400 && /BadDeviceToken/.test(result.body || '')) || (result.status === 404 && /UNREGISTERED/.test(result.body || ''));
      if (dead) await prisma.pushToken.delete({ where: { id: t.id } }).catch(() => {});
    }
  } catch (e) {
    console.warn('push:', e.message);
  }
}

// Variante non bloquante pour la logique de jeu
function notify(playerId, kind, title, body, data, opts) { notifyPlayer(playerId, kind, title, body, data, opts).catch(() => {}); }

module.exports = { notify, notifyPlayer, configured, normalizeLink };
