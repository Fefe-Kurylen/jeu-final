#!/usr/bin/env node
// ============================================================
// Simulation longue d'Imperium Antiquitas (décision du 29 octobre 2026)
// Le vrai serveur (src/server.js) tourne dans ce processus, sur une base à part (monjeu_sim par défaut), avec une
// horloge simulée : chaque pas avance le temps (6 h par défaut), joue un tick complet (src/game/tick.js runTickSteps,
// exactement les étapes du jeu), puis des joueurs automatiques agissent par les vraies routes HTTP, comme le client.
// Contrôles réguliers (ressources, armées bloquées, sièges, rassemblements…), mesures par civilisation pour
// l'équilibrage, et un rapport à la fin. La partie se reprend où elle s'est arrêtée (état dans --out).
//
//   node tools/sim/sim.cjs --days=2190 --fresh          # 6 ans, base neuve
//   node tools/sim/sim.cjs                              # reprendre
//   node tools/sim/sim.cjs --report                     # refaire le rapport à partir des mesures
// Options : --days, --step=<heures>, --bots=<n>, --db=<nom>, --port=<n>, --out=<dossier>, --modules=a,b, --seed=<n>
// Base : SIM_DATABASE_URL, sinon DATABASE_URL avec le nom de base remplacé par --db. JWT_SECRET pris de l'environnement.
// ============================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');

// ---------- options ----------
const ARGS = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const OPT = {
  days: Number(ARGS.days || 2190),
  stepHours: Number(ARGS.step || 6),
  bots: Number(ARGS.bots || 38),
  db: String(ARGS.db || 'monjeu_sim'),
  port: Number(ARGS.port || 3010),
  out: path.resolve(String(ARGS.out || path.join(ROOT, 'sim-out'))),
  fresh: !!ARGS.fresh,
  reportOnly: !!ARGS.report,
  modules: ARGS.modules ? String(ARGS.modules).split(',') : null,
  seed: Number(ARGS.seed || 20261029),
  start: ARGS.start ? Date.parse(ARGS.start) : Date.parse('2027-01-04T08:00:00Z'),   // un lundi
  maxSteps: ARGS['max-steps'] ? Number(ARGS['max-steps']) : Infinity,             // pour essayer : s'arrêter après N pas
  verbose: !!ARGS.verbose
};
fs.mkdirSync(OPT.out, { recursive: true });
const FILES = { state: path.join(OPT.out, 'state.json'), metrics: path.join(OPT.out, 'metrics.jsonl'), events: path.join(OPT.out, 'events.jsonl'), serverLog: path.join(OPT.out, 'server.log'), report: path.join(OPT.out, 'RAPPORT.md') };

if (OPT.reportOnly) { require('./report.cjs').write(FILES, null); process.exit(0); }

// ---------- état (reprise) ----------
let STATE = null;
if (!OPT.fresh && fs.existsSync(FILES.state)) STATE = JSON.parse(fs.readFileSync(FILES.state, 'utf8'));
if (OPT.fresh) for (const f of [FILES.state, FILES.metrics, FILES.events, FILES.serverLog, FILES.report]) fs.rmSync(f, { force: true });

// ---------- horloge simulée (avant tout autre module) ----------
const RealDate = Date;
let simNow = STATE ? STATE.simNow : OPT.start;
class SimDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(simNow); else super(...a); }
  static now() { return simNow; }
  static [Symbol.hasInstance](x) { return x instanceof RealDate; }   // les dates créées avant l'horloge restent des dates
}
global.Date = SimDate;
const clock = {
  now: () => simNow,
  set: (ms) => { simNow = Math.max(simNow, Math.floor(ms)); },
  advance: (ms) => { simNow += Math.floor(ms); },
  day: () => Math.floor((simNow - (STATE?.startMs ?? OPT.start)) / 86400000),
  iso: () => new RealDate(simNow).toISOString()
};

// ---------- base de la simulation ----------
const baseUrl = process.env.SIM_DATABASE_URL || (process.env.DATABASE_URL || 'postgresql://monjeu:monjeu123@localhost:5432/monjeu').replace(/\/[^/?]+(\?|$)/, `/${OPT.db}$1`);
const adminUrl = baseUrl.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
const psql = (url, sql) => execSync(`psql "${url}" -At -v ON_ERROR_STOP=1 -c ${JSON.stringify(sql)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
if (!STATE) {
  try { psql(adminUrl, `DROP DATABASE IF EXISTS "${OPT.db}" WITH (FORCE)`); } catch (e) { /* droits limités : on essaie quand même de créer */ }
  psql(adminUrl, `CREATE DATABASE "${OPT.db}"`);
}

process.env.DATABASE_URL = baseUrl;
process.env.PORT = String(OPT.port);
process.env.CLUSTER_WORKERS = '1';
process.env.NODE_ENV = 'development';
process.env.RATE_MAX_API = '1000000';
process.env.RATE_MAX_AUTH = '1000000';
process.env.RATE_MAX_REGISTER = '1000000';
process.env.MAIL_PROVIDER = 'log';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) process.env.JWT_SECRET = 'simulation-secret-' + 'x'.repeat(40);
if (!STATE) process.env.WORLD_SEED = String(OPT.seed % 100000);

// ---------- journaux du serveur : dans un fichier, erreurs comptées ----------
const serverLog = fs.createWriteStream(FILES.serverLog, { flags: 'a' });
const ERRORS = new Map();   // première ligne -> { count, first, last, sample }
const origConsole = { log: console.log, warn: console.warn, error: console.error };
const say = (...a) => origConsole.log(`[sim ${clock.iso().slice(0, 16)} j${clock.day()}]`, ...a);
const fmt = (a) => a.map(x => (x instanceof Error ? (x.stack || x.message) : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch (e) { return String(x); } })())).join(' ');
let logBytes = 0;
const toLog = (lvl, a) => { if (logBytes > 200e6) return; const line = `${clock.iso()} ${lvl} ${fmt(a)}\n`; logBytes += line.length; serverLog.write(line); };
console.log = (...a) => { if (OPT.verbose) toLog('LOG', a); };
console.info = console.log;
console.warn = (...a) => toLog('WARN', a);
console.error = (...a) => {
  toLog('ERROR', a);
  const key = fmt(a).split('\n').slice(0, 2).join(' ').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>').replace(/\d+/g, 'N').slice(0, 220);
  const e = ERRORS.get(key) || { count: 0, first: clock.iso(), sample: fmt(a).slice(0, 1500) };
  e.count++; e.last = clock.iso(); ERRORS.set(key, e);
};

// ---------- serveur ----------
const config = require(path.join(ROOT, 'src/config'));
config.tick.intervalMs = 2 ** 31 - 1;   // la boucle du serveur ne tourne pas : la simulation joue les ticks elle-même
const prisma = require(path.join(ROOT, 'src/config/database'));
{
  // Prisma remplit createdAt/updatedAt avec l'horloge réelle : on les remplit avec l'horloge simulée
  const { Prisma } = require('@prisma/client');
  const STAMP = {};
  for (const m of Prisma.dmmf.datamodel.models) STAMP[m.name] = { created: m.fields.filter(f => f.default && f.default.name === 'now').map(f => f.name), updated: m.fields.filter(f => f.isUpdatedAt).map(f => f.name) };
  prisma.$use(async (params, next) => {
    const s = params.model && STAMP[params.model];
    if (s && (s.created.length || s.updated.length)) {
      const now = new Date();
      const fill = (d, create) => { if (!d || typeof d !== 'object') return; if (create) for (const f of s.created) if (d[f] === undefined) d[f] = now; for (const f of s.updated) if (d[f] === undefined) d[f] = now; };
      const a = params.args || {};
      if (params.action === 'create') fill(a.data, true);
      else if (params.action === 'createMany') (Array.isArray(a.data) ? a.data : [a.data]).forEach(d => fill(d, true));
      else if (params.action === 'upsert') { fill(a.create, true); fill(a.update, false); }
      else if (params.action === 'update' || params.action === 'updateMany') fill(a.data, false);
    }
    return next(params);
  });
}
require(path.join(ROOT, 'src/server.js'));
const { runTickSteps } = require(path.join(ROOT, 'src/game/tick.js'));
const BASE = `http://127.0.0.1:${OPT.port}`;
const gamedata = require(path.join(ROOT, 'src/config/gamedata'));
const DATA = {
  buildings: gamedata.buildingsData, units: gamedata.unitsData, factions: gamedata.factionsData,
  technologies: (() => { try { return require(path.join(ROOT, 'data/technologies.json')); } catch (e) { return null; } })(),
  items: (() => { try { return require(path.join(ROOT, 'data/items.json')); } catch (e) { return null; } })(),
  talents: (() => { try { return require(path.join(ROOT, 'data/hero-talents.json')); } catch (e) { return null; } })(),
  shop: (() => { try { return require(path.join(ROOT, 'data/alliance-shop.json')); } catch (e) { return null; } })(),
  config
};

// ---------- hasard reproductible ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rngState = STATE ? STATE.rng : OPT.seed;
const rand = () => { const r = mulberry32(rngState)(); rngState = (rngState + 0x9E3779B9) | 0; return r; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- appels HTTP, statistiques ----------
const CALLS = STATE?.calls || { total: 0, byRoute: {}, fails: [], refusals: {} };
const routeKey = (method, p) => `${method} ${p.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ':id').replace(/\/-?\d+(?=\/|$)/g, '/:n')}`;
async function http(method, p, token, body) {
  clock.advance(1000);   // chaque action prend un instant : les horodatages restent dans l'ordre
  let res, data = null;
  try {
    res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text.slice(0, 300) }; }
  } catch (e) { return { ok: false, status: 0, data: { error: e.message } }; }
  return { ok: res.ok, status: res.status, data };
}
function record(method, p, r, who) {
  const k = routeKey(method, p);
  CALLS.total++;
  const s = (CALLS.byRoute[k] ||= {});
  s[r.status] = (s[r.status] || 0) + 1;
  if (r.status >= 500 || r.status === 0) { if (CALLS.fails.length < 400) CALLS.fails.push({ at: clock.iso(), who, route: k, status: r.status, error: r.data?.error || r.data?.raw || null }); }
  else if (r.status >= 400 && r.status !== 401) {
    const key = `${k} -> ${r.status} ${String(r.data?.error || '').replace(/\d+/g, 'N').slice(0, 140)}`;
    CALLS.refusals[key] = (CALLS.refusals[key] || 0) + 1;
  }
}

// ---------- joueurs automatiques ----------
const FACTIONS = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
const NAMES = ['Aurelius', 'Brennus', 'Kleon', 'Imhotep', 'Bleda', 'Saladin', 'Cassius', 'Ambiorix', 'Lysandre', 'Nebka', 'Uldin', 'Baybars', 'Flavius', 'Dumnorix', 'Thales', 'Senusret', 'Oktar', 'Qalawun', 'Marcellus', 'Orgetorix', 'Pericles', 'Ahmose', 'Ruga', 'Kilij', 'Septimus', 'Vercassivel', 'Solon', 'Khafre', 'Mundzuk', 'Anvar', 'Tiberius', 'Comm', 'Agis', 'Djoser', 'Ellac', 'Toghrul', 'Quintus', 'Litavic', 'Dion', 'Sneferu', 'Dengiz', 'Malik'];
class Bot {
  constructor(o) { Object.assign(this, o); this.mem ||= {}; this.me = null; this.cities = []; this.armies = []; }
  get capital() { return this.cities.find(c => c.isCapital) || this.cities[0] || null; }
  async login() {
    const r = await http('POST', '/api/auth/login', null, { email: this.email, password: this.password });
    record('POST', '/api/auth/login', r, this.name);
    if (r.ok && r.data?.token) { this.token = r.data.token; this.playerId = r.data.player?.id || this.playerId; return true; }
    return false;
  }
  async api(method, p, body) {
    let r = await http(method, p, this.token, body);
    if (r.status === 401 && !r.data?.sanction) { if (await this.login()) r = await http(method, p, this.token, body); }
    record(method, p, r, this.name);
    if (OPT.verbose && !r.ok) toLog('BOT', [this.name, method, p, r.status, r.data?.error || '']);
    return r;
  }
  get(p) { return this.api('GET', p); }
  post(p, body = {}) { return this.api('POST', p, body); }
  del(p, body) { return this.api('DELETE', p, body); }
  async refresh(what = ['me', 'cities', 'armies']) {
    if (what.includes('me')) { const r = await this.get('/api/player/me'); if (r.ok) this.me = r.data; }
    if (what.includes('cities')) { const r = await this.get('/api/cities'); if (r.ok) this.cities = r.data; }
    if (what.includes('armies')) { const r = await this.get('/api/army'); if (r.ok) this.armies = r.data; }
    return this;
  }
  toJSON() { return { email: this.email, password: this.password, name: this.name, faction: this.faction, group: this.group, role: this.role, playerId: this.playerId, turn: this.turn, admin: !!this.admin, mem: this.mem }; }
}

// groupes : deux grandes alliances rivales (Bastion : 15 membres au moins), une petite, des solitaires
function groupFor(i, n) {
  const a = Math.min(16, Math.ceil(n * 0.42)), b = Math.min(15, Math.ceil(n * 0.4)), c = Math.max(0, Math.min(5, n - a - b - 2));
  if (i < a) return 'A';
  if (i < a + b) return 'B';
  if (i < a + b + c) return 'C';
  return 'SOLO';
}

// ---------- événements et mesures ----------
const appendLine = (file, obj) => fs.appendFileSync(file, JSON.stringify(obj) + '\n');
const event = (kind, data = {}) => appendLine(FILES.events, { at: clock.iso(), day: clock.day(), kind, ...data });

// ---------- modules de comportement ----------
const MODULE_DIR = path.join(__dirname, 'modules');
const MODULES = fs.readdirSync(MODULE_DIR).filter(f => f.endsWith('.cjs')).sort().map(f => require(path.join(MODULE_DIR, f))).filter(m => !OPT.modules || OPT.modules.includes(m.name));

// ---------- contrôles et mesures (lecture directe de la base) ----------
const checks = require('./checks.cjs');

async function waitServer() {
  for (let i = 0; i < 600; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) { const d = await r.json(); if (d.status === 'ok') return; } } catch (e) { /* pas encore */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('le serveur de simulation ne démarre pas');
}

async function tick(hours) {
  const now = new Date();
  const t0 = performance.now();
  await runTickSteps(now, hours, async (name, fn) => {
    try { return await fn(); } catch (e) { console.error(`[TICK] ${name} error:`, e); }
  });
  return performance.now() - t0;
}

function saveState(bots, step) {
  const s = { version: 1, simNow, startMs: STATE?.startMs ?? OPT.start, step, rng: rngState, opt: { stepHours: OPT.stepHours, days: OPT.days, bots: OPT.bots }, bots: bots.map(b => b.toJSON()), calls: CALLS, errors: [...ERRORS.entries()].map(([k, v]) => ({ key: k, ...v })), world: WORLD, savedAt: new RealDate().toISOString() };
  fs.writeFileSync(FILES.state + '.tmp', JSON.stringify(s));
  fs.renameSync(FILES.state + '.tmp', FILES.state);
}
const WORLD = STATE?.world || { index: 1, endedAt: null, worlds: [] };
if (STATE?.errors) for (const e of STATE.errors) ERRORS.set(e.key, e);

async function createBots() {
  const bots = [];
  for (let i = 0; i < OPT.bots; i++) {
    const faction = FACTIONS[i % FACTIONS.length];
    const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? i : ''}`;
    const b = new Bot({ email: `bot${i}@sim.test`, password: 'Simulation1!', name, faction, group: groupFor(i, OPT.bots), turn: i % 2, admin: i === 0 });
    const r = await http('POST', '/api/auth/register', null, { email: b.email, password: b.password, name: b.name, faction });
    record('POST', '/api/auth/register', r, b.name);
    if (!r.ok) throw new Error(`inscription de ${name} refusée : ${r.status} ${JSON.stringify(r.data)}`);
    b.token = r.data.token; b.playerId = r.data.player?.id;
    bots.push(b);
  }
  // le premier joueur est aussi administrateur (écran d'administration, fin de monde, annonces)
  await prisma.account.updateMany({ where: { email: bots[0].email }, data: { role: 'ADMIN' } });
  await bots[0].login();
  return bots;
}

async function main() {
  say(`démarrage : ${OPT.days} jours, pas de ${OPT.stepHours} h, ${OPT.bots} joueurs, base ${OPT.db}, sortie ${OPT.out}${STATE ? ` (reprise au pas ${STATE.step})` : ''}`);
  await waitServer();
  say('serveur prêt');
  let bots, step;
  if (STATE) {
    bots = STATE.bots.map(o => new Bot(o));
    for (const b of bots) await b.login();
    step = STATE.step;
  } else {
    bots = await createBots();
    step = 0;
    event('start', { bots: bots.length, modules: MODULES.map(m => m.name) });
  }
  const ctx = { clock, OPT, DATA, prisma, bots, rand, pick, event, say, WORLD, http, record, byGroup: (g) => bots.filter(b => b.group === g) };
  for (const b of bots) b.ctx = ctx;
  if (!STATE) for (const m of MODULES) if (m.setup) for (const b of bots) { try { await m.setup(b, ctx); } catch (e) { console.error(`[SIM] setup ${m.name} ${b.name}:`, e); } }
  saveState(bots, step);

  const totalSteps = Math.round(OPT.days * 24 / OPT.stepHours);
  const stepMs = OPT.stepHours * 3600000;
  const startMs = STATE?.startMs ?? OPT.start;
  let lastDay = -1, ran = 0;
  const t0 = RealDate.now();
  while (step < totalSteps && ran < OPT.maxSteps) {
    step++; ran++;
    clock.set(startMs + step * stepMs);
    const tickMs = await tick(OPT.stepHours);
    ctx.step = step;
    // chaque joueur se connecte un pas sur deux (environ 2 connexions par jour avec des pas de 6 h), décalés
    for (const b of bots) {
      if ((step + b.turn) % 2 !== 0 && !b.mem.alwaysOn) continue;
      try { await b.refresh(); } catch (e) { console.error(`[SIM] refresh ${b.name}:`, e); continue; }
      for (const m of MODULES) {
        if (m.every && step % m.every !== 0) continue;
        try { await m.act(b, ctx); } catch (e) { console.error(`[SIM] ${m.name} ${b.name}:`, e); }
      }
    }
    for (const m of MODULES) if (m.afterStep) { try { await m.afterStep(ctx); } catch (e) { console.error(`[SIM] afterStep ${m.name}:`, e); } }
    const day = clock.day();
    if (day !== lastDay) {
      lastDay = day;
      try { const v = await checks.invariants(prisma, clock); if (v.length) for (const x of v) event('violation', x); } catch (e) { console.error('[SIM] contrôles :', e); }
      if (day % 7 === 0) {
        try { const snap = await checks.snapshot(prisma, clock, bots); appendLine(FILES.metrics, { at: clock.iso(), day, step, ...snap }); } catch (e) { console.error('[SIM] mesures :', e); }
        const el = (RealDate.now() - t0) / 1000;
        say(`jour ${day}/${OPT.days} · pas ${step}/${totalSteps} · tick ${Math.round(tickMs)} ms · ${CALLS.total} appels · ${CALLS.fails.length} erreurs 5xx · ${[...ERRORS.values()].reduce((t, e) => t + e.count, 0)} erreurs serveur · ${Math.round(el / ran * 1000)} ms/pas`);
      }
      saveState(bots, step);
    }
  }
  saveState(bots, step);
  if (step >= totalSteps) { event('end', { step }); say('simulation terminée'); }
  require('./report.cjs').write(FILES, { CALLS, ERRORS: [...ERRORS.entries()].map(([k, v]) => ({ key: k, ...v })), WORLD, OPT });
  say(`rapport : ${FILES.report}`);
  serverLog.end();
  setTimeout(() => process.exit(0), 500);
}

process.on('unhandledRejection', (e) => console.error('[SIM] promesse rejetée :', e));
main().catch((e) => { origConsole.error('[SIM] échec :', e); process.exit(1); });
