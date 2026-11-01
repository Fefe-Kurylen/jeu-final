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
// Options : --days, --step=<heures>, --bots=<n>, --db=<nom>, --port=<n>, --out=<dossier>, --modules=a,b, --seed=<n>,
//           --subticks=<n> (ticks d'un pas qui presse, 6 par défaut ; 1 = un seul tick), --press=0 (jamais de pas qui presse)
// Mesures (décision D9) : --full-rallies (tous les membres rejoignent les rassemblements contre un Bastion, sans tirage de la
//           notification), --full-garrison (chaque joueur poste sa plus forte armée de campagne en garnison au Bastion) ;
//           sans elles, le jeu habituel des joueurs automatiques
// Modules (noms pour --modules) : alliance, quests, war, market, military, economy, hero, invasion, wonder
// Base : SIM_DATABASE_URL, sinon DATABASE_URL avec le nom de base remplacé par --db. JWT_SECRET pris de l'environnement.
// Décisions du 31 octobre 2026 (rapport de vérification) : chaque joueur choisit son côté de la carte à l'inscription (les
// membres d'une même alliance le même : des alliances de voisins) ; la carte de ce processus suit celle du serveur
// (GET /api/world/info : graine et générateur, 420 × 420 pour un nouveau monde) au départ, à la reprise et chaque jour ; un
// relevé de l'or (./ledger.cjs) est tenu chaque jour.
// Analyse de la simulation du 1er novembre 2026 (pas de 6 h) :
// - pas qui presse : pendant le week-end d'invasion et pendant un rassemblement ou une chaîne d'assauts contre un Bastion,
//   les joueurs concernés jouent chaque pas (au lieu d'un sur deux) et le pas joue un tick aux heures où un rassemblement
//   doit partir ou arriver avant la fin du pas (voir pressing(), playTicks()) ;
// - l'or de la Chambre au Trésor est mesuré à l'étape « gold » du tick (avant et après), plus estimé ;
// - un événement garde toujours son nom : un champ `kind` des données ne le remplace plus (voir event()).
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
  subTicks: Math.max(1, Math.round(Number(ARGS.subticks || 6))),                   // ticks d'un pas qui presse (un par heure)
  press: ARGS.press !== '0',                                                       // pas qui pressent (voir pressing())
  fullRallies: !!ARGS['full-rallies'],                                             // 50-war.cjs bastionOps : tous les membres rejoignent
  fullGarrison: !!ARGS['full-garrison'],                                           // 20-alliance.cjs garrisonTurn : la plus forte armée de campagne
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
// arrêt (Ctrl-C, fin de délai) : la simulation finit l'action en cours, enregistre son état et s'arrête ; le serveur
// ne ferme pas ses connexions sous ses pieds (sinon des « erreurs » d'appels fausseraient le rapport)
let STOP = false;
process.removeAllListeners('SIGTERM'); process.removeAllListeners('SIGINT');
const onStop = (sig) => { if (STOP) process.exit(1); STOP = true; origConsole.log(`[sim] ${sig} : arrêt après l'action en cours…`); setTimeout(() => process.exit(1), 60000).unref(); };
process.on('SIGTERM', () => onStop('SIGTERM')); process.on('SIGINT', () => onStop('SIGINT'));
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
  if (STOP) return;
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
  // monde suivant (après la Merveille 100) : le joueur revient avec sa civilisation et son côté de la carte
  async joinWorld() {
    const r = await this.post('/api/world/join', { faction: this.faction, side: SIDE_OF_GROUP[this.group] || 'RANDOM' });
    return r.ok;
  }
  toJSON() { return { email: this.email, password: this.password, name: this.name, faction: this.faction, group: this.group, side: this.side, role: this.role, playerId: this.playerId, turn: this.turn, admin: !!this.admin, mem: this.mem }; }
}

// côté de la carte choisi à l'inscription (décision du 31 octobre 2026) : les membres d'une alliance se mettent du même côté.
// A au nord, B à l'est (voisins de A, en guerre avec lui), C à l'ouest (voisins et alliés de A), les solitaires au hasard.
const SIDE_OF_GROUP = { A: 'N', B: 'E', C: 'W', SOLO: 'RANDOM' };
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
// Le nom de l'événement, son heure et le jour de l'horloge ne sont jamais remplacés par un champ des données (un `kind`
// dans les données effaçait le nom : 0 « wonder_rally » dans le rapport du 1er novembre 2026). Ces champs des données sont
// gardés sous un autre nom : `kind` (la cible d'un rassemblement) sous `target`, `day` (le jour du monde) sous `worldDay`,
// `at` sous `dataAt` ; si ce nom est déjà pris, sous `data_<champ>`.
const RESERVED = { kind: 'target', day: 'worldDay', at: 'dataAt' };
const event = (kind, data = {}) => {
  const e = { at: clock.iso(), day: clock.day(), kind };
  for (const [k, v] of Object.entries(data || {})) {
    if (!(k in RESERVED)) { if (!(k in e)) e[k] = v; continue; }
    if (v === undefined) continue;
    const to = data[RESERVED[k]] === undefined ? RESERVED[k] : `data_${k}`;
    e[to] = v;
  }
  appendLine(FILES.events, e);
};

// ---------- modules de comportement ----------
const MODULE_DIR = path.join(__dirname, 'modules');
const MODULES = fs.readdirSync(MODULE_DIR).filter(f => f.endsWith('.cjs')).sort().map(f => require(path.join(MODULE_DIR, f))).filter(m => !OPT.modules || OPT.modules.includes(m.name));

// ---------- contrôles et mesures (lecture directe de la base) ----------
const checks = require('./checks.cjs');
const ledger = require('./ledger.cjs');
const Terrain = require(path.join(ROOT, 'frontend/js/shared/terrain.js'));   // la carte partagée avec le client

async function waitServer() {
  for (let i = 0; i < 600; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) { const d = await r.json(); if (d.status === 'ok') return; } } catch (e) { /* pas encore */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('le serveur de simulation ne démarre pas');
}

// la carte de ce processus : celle du serveur (graine et générateur du monde), pour les contrôles de place et les modules
// (bords, empreinte d'une ville) ; relue au départ, à la reprise et chaque jour (un monde suivant peut changer de carte)
async function syncTerrain() {
  const r = await http('GET', '/api/world/info', null);
  if (!r.ok || r.data?.worldSeed === undefined) return false;
  const changed = Terrain.setWorldSeed(r.data.worldSeed, r.data.worldGenerator);
  if (changed) say(`carte : graine ${r.data.worldSeed}, générateur ${r.data.worldGenerator}, ${r.data.worldSize} × ${r.data.worldSize}`);
  return true;
}

// Un tick complet du jeu. L'étape « gold » (Chambre au Trésor, seule à verser de l'or pendant qu'elle tourne) est mesurée :
// l'or des joueurs avant et après va au relevé (ledger.cjs). L'estimation d'avant comptait le niveau du jour entier alors
// que le jeu paie l'or avant les constructions du tick (« Autres sources » négatives, rapport du 1er novembre 2026).
async function tick(hours, playerIds) {
  const now = new Date();
  const t0 = performance.now();
  await runTickSteps(now, hours, async (name, fn) => {
    try {
      if (name === 'gold' && playerIds?.length) return await ledger.measureTreasury(prisma, LEDGER, playerIds, fn);
      return await fn();
    } catch (e) { console.error(`[TICK] ${name} error:`, e); }
  });
  return performance.now() - t0;
}

function saveState(bots, step) {
  const s = { version: 1, simNow, startMs: STATE?.startMs ?? OPT.start, step, rng: rngState, opt: { stepHours: OPT.stepHours, days: OPT.days, bots: OPT.bots }, bots: bots.map(b => b.toJSON()), calls: CALLS, errors: [...ERRORS.entries()].map(([k, v]) => ({ key: k, ...v })), world: WORLD, ledger: LEDGER, pace: PACE, lastSnapAt, savedAt: new RealDate().toISOString() };
  fs.writeFileSync(FILES.state + '.tmp', JSON.stringify(s));
  fs.renameSync(FILES.state + '.tmp', FILES.state);
}
const WORLD = STATE?.world || { index: 1, endedAt: null, worlds: [] };
const LEDGER = STATE?.ledger || ledger.empty();   // relevé de l'or, cumulé (./ledger.cjs)
if (STATE?.errors) for (const e of STATE.errors) ERRORS.set(e.key, e);
// rythme : pas qui pressent, ticks en plus, tours en plus des joueurs (cumulés, pour le rapport)
const PACE = STATE?.pace || { steps: 0, pressed: 0, allPlay: 0, fine: 0, ticks: 0, extraTurns: 0 };
// heure du dernier relevé de la semaine : la fenêtre du relevé suivant commence là (avant : maintenant − 7 jours, des
// fenêtres qui se chevauchaient de quelques minutes). Reprise d'un état plus ancien : la dernière ligne des mesures.
let lastSnapAt = STATE?.lastSnapAt ?? (() => {
  try { const lines = fs.readFileSync(FILES.metrics, 'utf8').trim().split('\n'); return Date.parse(JSON.parse(lines[lines.length - 1]).at) || null; } catch (e) { return null; }
})();

// ---------- pas qui presse (analyse de la simulation du 1er novembre 2026) ----------
// Avec un seul tick par pas de 6 h, un étage de donjon prenait 12 h (départ au tick suivant, combat au tick d'après) et une
// armée arrivée restait sur la case du donjon jusqu'au tick (elle s'y battait contre le rassemblement d'une autre
// alliance) ; un joueur qui ne joue qu'un pas sur deux laisse passer un étage, un assaut, un camp à briser. Un pas presse :
// - pour tous les joueurs pendant le week-end d'invasion (les pas du vendredi 20 h au lundi 2 h, heures des ticks : le
//   calendrier du jeu, hordeService.weekendWindow, au début ou à la fin du pas) ou une invasion lancée par l'équipe ;
// - pour les membres d'une alliance qui a un rassemblement en cours (en attente ou en marche) contre un site ou un plan de
//   Merveille ou contre un Bastion, ou un camp devant un Bastion ; les défenseurs de ce Bastion aussi ;
// - pour une alliance dont le Bastion n'a pas retrouvé toutes ses vies (une chaîne d'assauts peut être en cours) et pour
//   celles qui l'ont attaqué depuis moins de config.bastion.regenPauseHours + regenHours (24 h sans assaut gagné avant
//   qu'une vie ne remonte, puis 72 h pour toutes : décision du 1er novembre 2026, E3).
// Ces joueurs jouent alors chaque pas, pas un sur deux. Le pas joue en plus des ticks d'une heure (--subticks) aux heures
// où un rassemblement doit partir ou arriver, ou un camp devant un Bastion donner l'assaut (nextDue) : départs, arrivées et
// assauts se jouent à l'heure près (le vrai serveur : tick de 30 s), sans tick pour les heures où rien ne se joue. La
// production et l'entretien suivent les heures du tick : le total d'un pas ne change pas.
let HS = null, BS = null;
const hordeService = () => (HS ||= require(path.join(ROOT, 'src/services/hordeService')));
const bastionService = () => (BS ||= require(path.join(ROOT, 'src/services/bastionService')));
const LIVE = ['GATHERING', 'MARCHING'];
async function pressing(from, to) {
  const out = { all: false, alliances: new Set(), fine: false };
  if (!OPT.press) return out;
  const win = hordeService().weekendWindow;
  out.all = !!(win(new Date(from)) || win(new Date(to))) || (await prisma.invasion.count({ where: { endedAt: null } })) > 0;
  const rallies = await prisma.rally.findMany({ where: { status: { in: LIVE } }, select: { allianceId: true, targetKind: true, targetBastionId: true } });
  const camps = await prisma.army.findMany({ where: { status: 'BESIEGING', targetBastionId: { not: null } }, select: { targetBastionId: true, owner: { select: { alliance: { select: { allianceId: true } } } } } });
  // la ligne entière : les vies se lisent avec la règle du serveur (structureNow), quels que soient les champs qu'elle lit
  const bastions = await prisma.bastion.findMany({ where: { status: 'ACTIVE' } });
  const owner = new Map(bastions.map(b => [b.id, b.allianceId]));
  for (const r of rallies) {
    if (r.targetBastionId || ['WONDER', 'PLAN', 'BASTION'].includes(r.targetKind)) out.alliances.add(r.allianceId);
    if (r.targetBastionId && owner.has(r.targetBastionId)) out.alliances.add(owner.get(r.targetBastionId));
  }
  for (const c of camps) {
    if (c.owner?.alliance?.allianceId) out.alliances.add(c.owner.alliance.allianceId);
    if (owner.has(c.targetBastionId)) out.alliances.add(owner.get(c.targetBastionId));
  }
  const regenMs = ((Number(config.bastion.regenPauseHours) || 0) + config.bastion.regenHours) * 3600000;
  for (const b of bastions) {
    if (bastionService().structureNow(b, from) >= 1) continue;
    out.alliances.add(b.allianceId);
    const by = await prisma.$queryRawUnsafe(`SELECT DISTINCT m."allianceId" AS id FROM "BattleReport" r JOIN "AllianceMember" m ON m."playerId" = r."attackerId" WHERE r."playerId" = r."attackerId" AND r.loot->>'type' = 'BASTION' AND r.x = $1 AND r.y = $2 AND r."createdAt" >= $3`, b.x, b.y, new Date(from - regenMs));
    for (const x of by) out.alliances.add(x.id);
  }
  out.fine = OPT.subTicks > 1 && (out.all || rallies.length > 0 || camps.length > 0);
  return out;
}
// La plus proche échéance avant la fin du pas : un rassemblement qui doit partir (fin de l'attente) ou arriver, un camp
// devant un Bastion qui donne l'assaut, pendant une invasion (joins) une armée qui rejoint un rassemblement (le lanceur
// d'un rassemblement de donjon le fait partir plus tôt une fois au complet : 60-invasion.cjs, subTick ; hors invasion,
// aucun module ne le fait, ce tick ne servirait à rien), et les échéances que donne un module (crochet nextDue(ctx, to) :
// une heure en ms ou null ; 60-invasion.cjs y met le retour des armées d'un rassemblement, pour enchaîner l'étage
// suivant). null : rien avant le tick de la fin du pas. Seules les échéances après `from` comptent : le tick de `from` a
// déjà joué les autres, une ligne restée en retard (une erreur du serveur) ne doit pas faire jouer tous les ticks d'une
// heure de chaque pas qui presse.
async function nextDue(ctx, from, to, joins) {
  const span = { gt: new Date(from), lte: new Date(to) };
  const none = { _min: {} };
  const [g, m, j, c] = await Promise.all([
    prisma.rally.aggregate({ where: { status: 'GATHERING', launchAt: span }, _min: { launchAt: true } }),
    prisma.rally.aggregate({ where: { status: 'MARCHING', arrivalAt: span }, _min: { arrivalAt: true } }),
    joins ? prisma.army.aggregate({ where: { status: 'RALLY_JOIN', arrivalAt: span }, _min: { arrivalAt: true } }) : none,
    prisma.army.aggregate({ where: { status: 'BESIEGING', targetBastionId: { not: null }, arrivalAt: span }, _min: { arrivalAt: true } })
  ]);
  const t = [g._min.launchAt, m._min.arrivalAt, j._min.arrivalAt, c._min.arrivalAt].filter(Boolean).map(d => new Date(d).getTime());
  for (const mod of MODULES) {
    if (!mod.nextDue) continue;
    try { const x = Number(await mod.nextDue(ctx, to)); if (Number.isFinite(x) && x > from && x <= to) t.push(x); } catch (e) { console.error(`[SIM] nextDue ${mod.name}:`, e); }
  }
  return t.length ? Math.min(...t) : null;
}
// Les ticks du pas, de `from` (le tick précédent) à `to`. Pas qui presse (fine) : un tick à la première heure (grille de
// --subticks ticks par pas) où une échéance est passée, et ainsi de suite tant qu'il en reste avant la fin du pas ; les
// heures sans rien à jouer sont sautées. Après chaque tick intermédiaire, le crochet subTick(ctx) des modules
// (60-invasion.cjs : départs anticipés, issues, étage suivant), pas après le dernier : le tour des joueurs suit. Chaque
// tick compte les heures écoulées depuis le précédent. press : le pas qui presse (pressing()).
async function playTicks(ctx, from, to, press, playerIds) {
  let ms = 0, last = from, n = 0;
  if (press.fine) {
    const sub = (to - from) / OPT.subTicks;
    let k = 0;
    while (!STOP) {
      const due = await nextDue(ctx, from, to, press.all);
      if (due === null) break;
      k = Math.max(k + 1, Math.ceil((due - from) / sub));   // l'heure de la grille où l'échéance est passée
      if (k >= OPT.subTicks) break;   // le tick de la fin du pas s'en charge
      const at = from + k * sub;
      clock.set(at);
      ms += await tick((at - last) / 3600000, playerIds);
      last = at; n++;
      for (const mod of MODULES) if (mod.subTick) { try { await mod.subTick(ctx); } catch (e) { console.error(`[SIM] subTick ${mod.name}:`, e); } }
    }
  }
  clock.set(to);
  ms += await tick((to - last) / 3600000, playerIds);
  return { ms, ticks: n + 1 };
}

// relevé de la semaine (checks.snapshot) : l'activité depuis le relevé précédent, l'état du monde, le relevé de l'or ;
// final : le dernier, à la fin de la partie
async function weeklySnapshot(bots, day, step, final = false) {
  try {
    const at = clock.now();
    const snap = await checks.snapshot(prisma, clock, bots, lastSnapAt);
    appendLine(FILES.metrics, { at: clock.iso(), day, step, ...(final ? { final: true } : {}), ...snap, ledger: ledger.view(LEDGER, bots) });
    lastSnapAt = at;
  } catch (e) { console.error('[SIM] mesures :', e); }
}

async function createBots() {
  const bots = [];
  for (let i = 0; i < OPT.bots; i++) {
    const faction = FACTIONS[i % FACTIONS.length];
    const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? i : ''}`;
    const b = new Bot({ email: `bot${i}@sim.test`, password: 'Simulation1!', name, faction, group: groupFor(i, OPT.bots), turn: i % 2, admin: i === 0 });
    const side = SIDE_OF_GROUP[b.group] || 'RANDOM';
    const r = await http('POST', '/api/auth/register', null, { email: b.email, password: b.password, name: b.name, faction, side });
    record('POST', '/api/auth/register', r, b.name);
    if (!r.ok) throw new Error(`inscription de ${name} refusée : ${r.status} ${JSON.stringify(r.data)}`);
    b.token = r.data.token; b.playerId = r.data.player?.id;
    b.side = r.data.player?.side || null;   // le côté où la capitale est vraiment posée (un côté plein renvoie au voisin)
    event('registered', { bot: b.name, group: b.group, asked: side, side: b.side });
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
  try { if (!(await syncTerrain())) say('carte : GET /api/world/info sans réponse, carte du serveur gardée'); } catch (e) { say(`carte : ${e.message}`); }
  let bots, step;
  if (STATE) {
    bots = STATE.bots.map(o => new Bot(o));
    // chaque joueur relu dès la reprise (villes, armées, fiche) : les modules qui regardent les autres joueurs (conseils de
    // guerre et de la Merveille, aides) ne les voient plus vides jusqu'à leur premier tour
    for (const b of bots) { await b.login(); try { await b.refresh(); } catch (e) { console.error(`[SIM] relecture ${b.name}:`, e); } }
    step = STATE.step;
  } else {
    bots = await createBots();
    step = 0;
    event('start', { bots: bots.length, modules: MODULES.map(m => m.name) });
  }
  const ctx = { clock, OPT, DATA, prisma, bots, rand, pick, event, say, WORLD, http, record, LEDGER, byGroup: (g) => bots.filter(b => b.group === g) };
  // qui joue ce pas-ci : chaque joueur un pas sur deux (décalés, environ 2 connexions par jour avec des pas de 6 h), un
  // joueur « toujours là » chaque pas, et chaque pas aussi quand le pas presse pour lui (pressing()). Les modules lisent
  // ctx.plays(b) (un joueur qui ne joue pas ce pas-ci répond seulement aux notifications) ; ctx.ticks : ticks joués ce pas.
  let press = { all: false, alliances: new Set(), fine: false };
  const regular = (b) => (ctx.step + (b.turn || 0)) % 2 === 0 || !!b.mem.alwaysOn;
  ctx.plays = (b) => regular(b) || press.all || (!!b.me?.alliance?.allianceId && press.alliances.has(b.me.alliance.allianceId));
  ctx.ticks = 1;
  for (const b of bots) b.ctx = ctx;
  if (!STATE) for (const m of MODULES) if (m.setup) for (const b of bots) { try { await m.setup(b, ctx); } catch (e) { console.error(`[SIM] setup ${m.name} ${b.name}:`, e); } }
  saveState(bots, step);

  const totalSteps = Math.round(OPT.days * 24 / OPT.stepHours);
  const stepMs = OPT.stepHours * 3600000;
  const startMs = STATE?.startMs ?? OPT.start;
  let lastDay = -1, ran = 0;
  const t0 = RealDate.now();
  while (step < totalSteps && ran < OPT.maxSteps && !STOP) {
    step++; ran++;
    ctx.step = step;
    const from = startMs + (step - 1) * stepMs, to = startMs + step * stepMs;
    try { press = await pressing(from, to); } catch (e) { console.error('[SIM] pas qui presse :', e); press = { all: false, alliances: new Set(), fine: false }; }
    const { ms: tickMs, ticks } = await playTicks(ctx, from, to, press, bots.map(b => b.playerId).filter(Boolean));
    ctx.ticks = ticks;
    PACE.steps++; PACE.ticks += ticks;
    if (ticks > 1) PACE.fine++;
    if (press.all || press.alliances.size) PACE.pressed++;
    if (press.all) PACE.allPlay++;
    for (const b of bots) {
      if (STOP) break;
      if (!ctx.plays(b)) continue;
      if (!regular(b)) PACE.extraTurns++;
      try {
        await b.refresh();
        // monde suivant ouvert, plus aucune ville : le joueur le rejoint
        if (Array.isArray(b.cities) && !b.cities.length && (await b.joinWorld())) await b.refresh();
      } catch (e) { console.error(`[SIM] refresh ${b.name}:`, e); continue; }
      for (const m of MODULES) {
        if (m.every && step % m.every !== 0) continue;
        try { await m.act(b, ctx); } catch (e) { console.error(`[SIM] ${m.name} ${b.name}:`, e); }
      }
    }
    for (const m of MODULES) if (m.afterStep) { try { await m.afterStep(ctx); } catch (e) { console.error(`[SIM] afterStep ${m.name}:`, e); } }
    const day = clock.day();
    if (day !== lastDay) {
      lastDay = day;
      try { await syncTerrain(); } catch (e) { console.error('[SIM] carte :', e); }
      try { const v = await checks.invariants(prisma, clock); if (v.length) for (const x of v) event('violation', x); } catch (e) { console.error('[SIM] contrôles :', e); }
      try { await ledger.daily(prisma, clock, LEDGER, bots); } catch (e) { console.error('[SIM] relevé de l\'or :', e); }
      if (day % 7 === 0) {
        await weeklySnapshot(bots, day, step);
        const el = (RealDate.now() - t0) / 1000;
        say(`jour ${day}/${OPT.days} · pas ${step}/${totalSteps} · tick ${Math.round(tickMs)} ms · ${CALLS.total} appels · ${CALLS.fails.length} erreurs 5xx · ${[...ERRORS.values()].reduce((t, e) => t + e.count, 0)} erreurs serveur · ${Math.round(el / ran * 1000)} ms/pas · pas pressés ${PACE.pressed}/${PACE.steps}, ${PACE.ticks} ticks`);
      }
      saveState(bots, step);
    }
  }
  // fin de la partie : un dernier relevé (le rapport lit l'état de la fin, pas celui du dernier relevé de la semaine)
  if (step >= totalSteps && lastSnapAt !== null && Math.floor((lastSnapAt - startMs) / 86400000) < clock.day()) await weeklySnapshot(bots, clock.day(), step, true);
  saveState(bots, step);
  if (step >= totalSteps) { event('end', { step, pace: PACE }); say('simulation terminée'); }
  require('./report.cjs').write(FILES, { CALLS, ERRORS: [...ERRORS.entries()].map(([k, v]) => ({ key: k, ...v })), WORLD, OPT });
  say(`rapport : ${FILES.report}`);
  serverLog.end();
  setTimeout(() => process.exit(0), 500);
}

process.on('unhandledRejection', (e) => console.error('[SIM] promesse rejetée :', e));
main().catch((e) => { origConsole.error('[SIM] échec :', e); process.exit(1); });
