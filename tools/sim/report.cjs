// Rapport de la simulation longue (tools/sim/sim.cjs) : RAPPORT.md à partir de l'état, des mesures et des événements.
// Décisions du 31 octobre 2026 (rapport de vérification) : une section par décision à juger (carte et colonies, or,
// cachette, échanges par armée, rassemblements, Bastion, Merveille, invasions, quêtes), lue dans les mesures de chaque
// semaine (checks.cjs, ledger.cjs) et les événements des modules.
// Analyse de la simulation du 1er novembre 2026 : les échanges entre joueurs, les offres expirées et les caravanes se lisent
// dans les compteurs des joueurs automatiques (le jeu efface les offres closes après 30 jours) ; la Chambre au Trésor
// est mesurée à chaque tick ; colonies sans garde à la fin ; garnisons des Bastions sans les armées vides, vies remontées ;
// camps devant un Bastion un combat par ligne ; chefs des donjons combattus et donjons détruits par niveau ; rythme de la
// simulation (pas qui pressent, ticks d'une heure en plus).
// Décisions du 1er novembre 2026 (simulation de 200 jours) : une section par décision, D1 à D19 et E1 à E6, avec les
// nombres qui la jugent (stock commun : chargements pris dans les colonies, céréales livrées à la Merveille ; armées
// rattachées aux colonies ; vies et pauses des Bastions, chaînes d'assauts ; camps brisés par un groupe arrivé dans la même
// minute ; chefs des donjons battus par niveau ; sites de Merveille réservés).
// Analyse de la simulation du 2 novembre 2026 (sim-e) :
// - une reprise sur une base en avance avait relu des rapports déjà lus (assauts, vagues, Villes Merveille comptés deux
//   fois) : les événements relus sont écartés des comptes (dropReplays), les reprises sont dites en tête du rapport ;
// - D8 : la taxe des échanges conclus, pondérée par les volumes (la ligne d'avant donnait la taxe de la dernière offre de
//   chaque vendeur) ; D17 : le trésor versé aux joueurs à part du trésor de la formule (la ligne d'avant donnait la formule
//   pour « reçu ») ;
// - les nombres des questions ouvertes : armées d'un rassemblement contre un Bastion rapportées à l'alliance, assauts
//   gagnés, vies, pauses ; vagues tenues et perdues, défenseurs postés ; plans pris ; chefs des donjons par niveau 1 à 5 ;
//   or par source, camps compris ; taille des gardes des colonies (colonies comptées sans les Villes Merveille) ;
// - le bandeau « Update available » de Prisma n'est pas une erreur du serveur.
// Décisions du 2 novembre 2026 (deuxième simulation de 200 jours) : une section par décision G2 à G12 avec les nombres qui
// la jugent (decisionsG) : mur du Bastion avant et après chaque assaut, réparation lue d'un assaut au suivant, chaînes
// d'usure ; combats par type au moteur de bataille ; butin des raids contre la charge des survivants et le stock des villes ;
// pertes d'un assaut repoussé ; écart entre deux vagues d'Immortels ; plans tentés et pris ; chefs des donjons par niveau ;
// échanges de soldats vers les gardes des colonies ; défenseurs des villes contre la réserve et armées « Défense » ; camps
// d'or et or par joueur et par jour ; parts du trésor des donjons et points d'alliance donnés pour ce qui n'a pas tenu.
'use strict';
const fs = require('fs');

// ce qui n'est pas une erreur du jeu : le bandeau de mise à jour de Prisma (« npx prisma migrate deploy » au démarrage du
// serveur), un cadre (┌ │ └) qui annonce « Update available x -> y », seul dans le texte (une vraie erreur écrite avec lui
// reste comptée) ; sim.cjs ne le compte plus, le rapport l'écarte des états écrits avant
const isNoise = (text) => {
  const t = String(text || '');
  return /Update available \S+ -> \S+/.test(t) && t.split('\n').every(l => !l.trim() || /^[┌│└]/.test(l.trim()));
};

// Événements relus après une reprise (sim-e : la reprise du jour 156 est repartie d'un état vieux de 24 h, les modules ont
// relu des rapports de bataille déjà lus ; l'heure des événements recule dans le journal) :
// - un événement qui porte l'id de son rapport (reportId) ne compte qu'une fois ;
// - une Ville Merveille n'est fondée qu'une fois (alliance, propriétaire, case) ;
// - quand l'heure recule, un événement de la partie reprise écrit avant l'heure la plus avancée de la partie d'avant, avec
//   les mêmes données qu'un événement déjà écrit dans cette fenêtre (hors heure, jour et, pour une vague, le niveau lu au
//   moment de la relecture), ne compte qu'une fois ; la fenêtre dure un pas de plus (marginMs) : la première lecture
//   après avoir rattrapé l'heure de la partie d'avant relit encore ses derniers rapports ;
// - depuis le 2 novembre 2026, l'heure ne recule plus (sim.cjs recale l'horloge sur la base), mais les joueurs repartent de
//   leur mémoire de la dernière sauvegarde : les événements écrits après elle (linesAfterSave de l'événement « resume »)
//   peuvent l'être une 2e fois par la partie reprise. Pendant le pas qui suit la reprise (marginMs), un événement aux mêmes
//   données qu'un de ces événements perdus ne compte qu'une fois (chaque événement perdu n'en écarte qu'un).
// Renvoie { events, dropped, jumps } (jumps : fois où l'heure recule).
const VOLATILE = { wonder_wave: ['level'] };
const fingerprint = (e) => { const skip = new Set(['at', 'day', ...(VOLATILE[e.kind] || [])]); return e.kind + JSON.stringify(Object.keys(e).filter(k => !skip.has(k)).sort().map(k => [k, e[k]])); };
function dropReplays(list, marginMs = 6 * 3600000) {
  const out = [], byId = new Set(), cities = new Set();
  let dropped = 0, jumps = 0, prevAt = '', maxAt = '', until = null, seen = null, lost = null, lostUntil = null;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const back = prevAt && e.at < prevAt;
    prevAt = e.at;
    if (e.kind === 'resume' && e.linesAfterSave > 0) {   // les événements écrits après la dernière sauvegarde
      lost = new Map();
      for (const x of list.slice(Math.max(0, i - e.linesAfterSave), i)) { const f = fingerprint(x); lost.set(f, (lost.get(f) || 0) + 1); }
      lostUntil = new Date(Date.parse(e.at) + marginMs).toISOString();
    }
    if (lost !== null && e.at <= lostUntil && e.kind !== 'resume') {
      const f = fingerprint(e), k = lost.get(f) || 0;
      if (k > 0) { lost.set(f, k - 1); dropped++; continue; }
    }
    if (e.reportId !== undefined && e.reportId !== null) { const k = `${e.kind}|${e.reportId}`; if (byId.has(k)) { dropped++; continue; } byId.add(k); }
    if (e.kind === 'wonder_city_founded') { const k = `${e.alliance}|${e.owner}|${e.x}|${e.y}`; if (cities.has(k)) { dropped++; continue; } cities.add(k); }
    if (back) {   // l'heure recule : reprise d'un état plus ancien que la base ; la fenêtre va jusqu'à l'heure la plus avancée
      jumps++; until = new Date(Date.parse(maxAt) + marginMs).toISOString();
      seen = new Set(out.filter(x => x.at >= e.at).map(fingerprint));
    }
    if (until !== null && e.at <= until) {
      const f = fingerprint(e);
      if (seen.has(f)) { dropped++; continue; }
      seen.add(f);
    }
    out.push(e);
    if (e.at > maxAt) maxAt = e.at;
  }
  return { events: out, dropped, jumps };
}

const readLines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []);
const n = (x) => (typeof x === 'number' ? x.toLocaleString('fr-FR') : x ?? '');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.map(n).join(' | ')} |`)].join('\n');
const kv = (o) => Object.entries(o || {}).map(([k, v]) => `${k} ${n(v)}`).join(', ') || '—';
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const lastOf = (events, kind) => events.filter(e => e.kind === kind).slice(-1)[0] || null;
const byKey = (list, key) => list.reduce((o, e) => { const k = e[key] ?? '?'; o[k] = (o[k] || 0) + 1; return o; }, {});
// événements écrits avant le 1er novembre 2026 : le champ `kind` des rassemblements de la Merveille (WONDER, PLAN)
// remplaçait le nom de l'événement ; ils retrouvent leur nom (lancement : un lanceur ; repoussé : une marge) et leur cible
function normalize(e) {
  if ((e.kind === 'WONDER' || e.kind === 'PLAN') && e.target === undefined) return { ...e, target: e.kind, kind: e.leader === undefined && e.margin !== undefined ? 'wonder_rally_repelled' : 'wonder_rally' };
  return e;
}

function write(FILES, live) {
  const state = fs.existsSync(FILES.state) ? JSON.parse(fs.readFileSync(FILES.state, 'utf8')) : {};
  const metrics = readLines(FILES.metrics);
  const { events, dropped, jumps } = dropReplays(readLines(FILES.events).map(normalize), (state.opt?.stepHours || 6) * 3600000);
  const CALLS = live?.CALLS || state.calls || { total: 0, byRoute: {}, fails: [], refusals: {} };
  // le texte entier (sample) décide : une vraie erreur écrite après le bandeau a pour clé les deux premières lignes du bandeau
  const ERRORS = (live?.ERRORS || state.errors || []).filter(e => !isNoise(e.sample || e.key));
  const last = metrics[metrics.length - 1];
  const days = last?.day || 0;
  const L = [];
  L.push(`# Simulation longue — rapport`, '');
  L.push(`- Durée simulée : **${days} jours** (${(days / 365).toFixed(1)} ans), pas de ${state.opt?.stepHours || '?'} h, ${state.bots?.length || '?'} joueurs automatiques`);
  L.push(`- Appels au serveur : ${n(CALLS.total)} ; erreurs serveur (5xx) : **${CALLS.fails.length}** ; erreurs écrites par le serveur : **${n(ERRORS.reduce((t, e) => t + e.count, 0))}**`);
  const worlds = [...new Set(metrics.map(m => m.world?.worldNumber))].filter(Boolean);
  L.push(`- Mondes joués : ${worlds.join(', ') || '1'}`);
  // rythme (sim.cjs pressing, playTicks) : pas où des joueurs jouent chaque pas, pas avec des ticks d'une heure en plus
  const pace = state.pace;
  if (pace?.steps) L.push(`- Rythme : ${n(pace.steps)} pas, dont ${n(pace.pressed)} qui pressent (${n(pace.allPlay)} pour tous les joueurs : week-end ou invasion en cours) ; ${n(pace.fine)} pas avec des ticks d'une heure en plus (départ, arrivée ou assaut à l'heure près), ${n(pace.ticks)} ticks en tout ; ${n(pace.extraTurns)} tours de joueur en plus d'un pas sur deux.`);
  // reprises (sim.cjs resumeFromDb) ; journaux plus anciens : l'heure des événements qui recule
  const resumes = state.resumes?.length ? state.resumes : events.filter(e => e.kind === 'resume');
  const resumeText = resumes.map(r => `jour ${r.day}${r.resynced ? ` (la base avait ${fixed(r.gapH)} h d'avance : horloge recalée, rien de rejoué)` : ''}${r.linesAfterSave ? `, ${n(r.linesAfterSave)} événements écrits après la dernière sauvegarde` : ''}`).join(' ; ');
  const replayText = jumps ? `l'heure des événements recule ${jumps} fois (reprise d'un état plus ancien que la base : des heures rejouées) ; ${n(dropped)} événements relus écartés des comptes` : dropped ? `${n(dropped)} événements en double écartés des comptes` : '';
  if (resumes.length || replayText) L.push(`- Reprises : ${[resumes.length ? `${resumes.length} (${resumeText})` : '', replayText].filter(Boolean).join(' ; ')}.`);
  L.push('');

  // contrôles
  const viol = {};
  for (const e of events.filter(e => e.kind === 'violation')) { const v = (viol[e.check] ||= { days: 0, first: e.day, last: e.day, max: 0, sample: e.sample }); v.days++; v.last = e.day; v.max = Math.max(v.max, e.count); }
  L.push('## Contrôles (ce qui ne devrait jamais arriver)', '');
  L.push(Object.keys(viol).length ? table(['Contrôle', 'Jours touchés', 'Premier jour', 'Dernier jour', 'Max le même jour'], Object.entries(viol).sort((a, b) => b[1].days - a[1].days).map(([k, v]) => [k, v.days, v.first, v.last, v.max])) : 'Aucun problème détecté.');
  for (const [k, v] of Object.entries(viol)) L.push('', `<details><summary>${k} — exemple</summary>\n\n\`\`\`json\n${JSON.stringify(v.sample, null, 1).slice(0, 1500)}\n\`\`\`\n</details>`);
  L.push('');

  // erreurs
  L.push('## Erreurs du serveur', '');
  const errs = [...ERRORS].sort((a, b) => b.count - a.count).slice(0, 40);
  L.push(errs.length ? table(['Nombre', 'Première', 'Message'], errs.map(e => [e.count, (e.first || '').slice(0, 10), '`' + e.key.replace(/\|/g, '/').slice(0, 160) + '`'])) : 'Aucune.');
  L.push('', '## Réponses 5xx', '');
  const fails = {};
  for (const f of CALLS.fails) { const k = `${f.route} ${f.status} ${f.error || ''}`.slice(0, 200); fails[k] = (fails[k] || 0) + 1; }
  L.push(Object.keys(fails).length ? table(['Nombre', 'Route et erreur'], Object.entries(fails).sort((a, b) => b[1] - a[1]).map(([k, v]) => [v, '`' + k.replace(/\|/g, '/') + '`'])) : 'Aucune.');
  L.push('', '## Refus les plus fréquents (4xx)', '', 'Un refus peut être normal (ressources insuffisantes) ; un refus massif sur une action montre une règle mal comprise par les joueurs automatiques, ou un problème.', '');
  L.push(table(['Nombre', 'Route → réponse'], Object.entries(CALLS.refusals || {}).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => [v, '`' + k.replace(/\|/g, '/') + '`'])));
  L.push('');

  // progression par civilisation
  L.push('## Progression par civilisation (moyennes)', '');
  const marks = [7, 30, 60, 90, 180, 365, 545, 730, 1095, 1460, 1825, 2190].filter(d => d <= days + 6);
  const at = (d) => metrics.reduce((best, m) => (Math.abs(m.day - d) < Math.abs((best?.day ?? 1e9) - d) ? m : best), null);
  const factions = [...new Set(metrics.flatMap(m => Object.keys(m.factions || {})))].sort();
  for (const key of [['population', 'Population'], ['power', 'Puissance militaire'], ['hall', 'Bâtiment principal (max)'], ['cities', 'Villes'], ['tech', 'Niveaux de recherche']]) {
    L.push(`### ${key[1]}`, '');
    L.push(table(['Jour', ...factions, 'Écart max/min'], marks.map(d => { const m = at(d); const vals = factions.map(f => m?.factions?.[f]?.[key[0]] ?? 0); const pos = vals.filter(v => v > 0); return [m?.day ?? d, ...vals, pos.length > 1 ? (Math.max(...pos) / Math.min(...pos)).toFixed(2) : '']; })));
    L.push('');
  }
  // activité
  L.push('## Activité des systèmes (par semaine, moyenne sur la simulation)', '');
  const sumBy = {};
  for (const m of metrics) for (const b of m.week?.battles || []) sumBy[b.t] = (sumBy[b.t] || 0) + b.n;
  const weeks = Math.max(1, ((last?.day || 0) - (metrics[0]?.day || 0)) / 7);   // semaines couvertes par les relevés
  const avgW = (k) => Math.round(metrics.reduce((t, m) => t + (m.week?.[k] || 0), 0) / weeks * 10) / 10;
  L.push(table(['Système', 'Par semaine'], [
    ...Object.entries(sumBy).sort((a, b) => b[1] - a[1]).map(([t, v]) => [`Combats ${t}`, Math.round(v / weeks * 10) / 10]),
    ['Échanges au marché', avgW('trades')], ['Rapports d\'espions', avgW('spyReports')], ['Messages', avgW('chat')], ['Aides d\'alliance', avgW('helps')], ['Quêtes réclamées', avgW('quests')], ['Expéditions terminées', avgW('expeditions')]
  ]));
  const rallies = {};
  for (const m of metrics) for (const r of m.week?.rallies || []) rallies[r.status] = (rallies[r.status] || 0) + r.n;
  L.push('', `Rassemblements : ${Object.entries(rallies).map(([k, v]) => `${k} ${v}`).join(', ') || 'aucun'}`);
  if (last) L.push(`Fin : ${last.world.cities} villes (${standingColonies(last)} colonies, ${wonderCities(last)} Villes Merveille), Merveille niveau ${last.world.wonder}, invasions ${last.world.invasions}, donjons détruits ${last.world.hordesDestroyed} (vivants dans l'invasion en cours : ${last.world.hordesAlive}), Bastions ${(last.world.bastions || []).map(b => `${b.status} ${b.n}`).join(', ') || 'aucun'}, médailles ${last.world.medals}`);
  L.push('');
  // colonies (décisions du 30 octobre 2026) : gisements choisis par les joueurs automatiques (bonus de gisement) et jour de
  // la 1re, 2e, 3e colonie de chacun
  const founded = events.filter(e => e.kind === 'colony_founded');
  if (founded.length) {
    const bySite = {}, byRank = {};
    for (const e of founded) {
      const k = e.site ? `${e.site.type} niveau ${e.site.level}` : 'inconnu';
      bySite[k] = (bySite[k] || 0) + 1;
      (byRank[e.colonies] ||= []).push(e.day);
    }
    L.push('## Colonies', '');
    L.push(table(['Gisement', 'Colonies fondées'], Object.entries(bySite).sort((a, b) => b[1] - a[1])));
    L.push('', table(['Colonie du joueur', 'Fondées', 'Jour médian'], Object.entries(byRank).map(([k, d]) => [`n° ${k}`, d.length, d.sort((a, b) => a - b)[Math.floor(d.length / 2)]])));
    L.push('');
  }
  decisions(L, { metrics, events, CALLS, first: metrics[0], last, startMs: state.startMs, bots: state.bots || [] });
  decisionsG(L, { metrics, events, CALLS, last, bots: state.bots || [] });
  // classement final
  if (last) {
    L.push('## Joueurs à la fin', '');
    L.push(table(['Joueur', 'Civilisation', 'Groupe', 'Population', 'Villes', 'Principal', 'Recherche', 'Puissance', 'Héros'], [...last.players].sort((a, b) => b.population - a.population).map(p => [p.name, p.faction, p.group || '', p.population, p.cities, p.hall, p.tech, p.power, p.hero])));
  }
  // événements notables
  const notable = events.filter(e => e.kind !== 'violation').slice(-60);
  if (notable.length) { L.push('', '## Derniers événements notables', '', ...notable.map(e => `- j${e.day} ${e.kind} ${JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['at', 'day', 'kind'].includes(k)))).slice(0, 200)}`)); }
  fs.writeFileSync(FILES.report, L.join('\n') + '\n');
}

// ---------- les décisions : une section par décision (D1 à D19 du 31 octobre 2026, E1 à E6 du 1er novembre 2026) ----------
// Chaque section donne les nombres qui la jugent, lus dans les relevés de chaque semaine (checks.cjs, ledger.cjs), les
// événements des modules et les compteurs des joueurs automatiques (état de la simulation : bots[].mem).
const sum = (list, f) => list.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const pct = (a, b) => (b ? `${Math.round(100 * a / b)} %` : '—');
const share = (x) => (typeof x === 'number' && Number.isFinite(x) ? `${Math.round(100 * x)} %` : '—');   // une part (0,42 -> 42 %)
const fixed = (x, d = 1) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const lvKv = (o) => kv(Object.fromEntries(Object.entries(o || {}).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => [`niveau ${k}`, v])));
const nums = (list) => list.filter(x => typeof x === 'number' && Number.isFinite(x));
// Villes Merveille, et colonies debout sans elles (relevés d'avant le 2 novembre 2026 : world.colonies comptait les Villes
// Merveille, « 78 colonies » pour 76)
const wonderCities = (m) => m?.world?.wonderCities ?? m?.endgame?.wonders?.length ?? 0;
const standingColonies = (m) => m?.map?.unguarded?.of ?? Math.max(0, (m?.world?.colonies ?? 0) - wonderCities(m));
// Les alliances : sigle -> id (sigles lus dans la base ; relevés plus anciens : retrouvés par un joueur nommé dans un
// événement), alliance d'un joueur, et pour un relevé, membres et soldats (sans les engins ; relevés plus anciens : toutes
// les unités) d'une alliance
function allianceIndex(metrics, events) {
  const idOf = new Map(), playerAlliance = new Map();
  for (const m of metrics) for (const a of m.endgame?.alliances || []) idOf.set(a.tag, a.id);
  for (const m of metrics) for (const p of m.players || []) if (p.alliance) playerAlliance.set(p.name, p.alliance);
  for (const e of events) {
    const who = e.kind === 'bastion_rally' ? e.leader : e.kind === 'wonder_city_founded' ? e.owner : null;
    if (e.alliance && who && !idOf.has(e.alliance) && playerAlliance.has(who)) idOf.set(e.alliance, playerAlliance.get(who));
  }
  const tagOfId = new Map([...idOf].map(([t, id]) => [id, t]));
  return {
    tagOfPlayer: (name) => tagOfId.get(playerAlliance.get(String(name || '').trim())) || null,
    sizeAt: (m, tag) => { const id = idOf.get(tag); const ps = id ? (m?.players || []).filter(p => p.alliance === id) : []; return { members: ps.length, soldiers: ps.reduce((t, p) => t + (p.soldiers ?? p.units ?? 0), 0) }; }
  };
}
function decisions(L, { metrics, events, CALLS, first, last, startMs, bots = [] }) {
  const nn = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : n(x));   // une médiane sans valeur : un tiret
  const refusals = (re) => Object.entries(CALLS.refusals || {}).filter(([k]) => re.test(k)).reduce((t, [, v]) => t + v, 0);
  const ev = (kind) => events.filter(e => e.kind === kind);
  const counters = (kind) => lastOf(events, kind)?.counters || {};
  const mem = (path) => sum(bots, b => path.split('.').reduce((o, k) => o?.[k], b.mem));
  const marks = [30, 60, 90, 120, 150, 180, 365, 730].filter(d => d <= (last?.day || 0) + 6);
  const at = (d) => metrics.reduce((best, m) => (Math.abs(m.day - d) < Math.abs((best?.day ?? 1e9) - d) ? m : best), null);
  const mil = counters('military_summary'), wk = counters('war_summary'), mkt = lastOf(events, 'market_summary');
  const mk = mkt?.counters || {};
  const inv = lastOf(events, 'invasion_summary'), wsum = lastOf(events, 'wonder_summary');
  const won = wsum?.counters || {};
  const lg = last?.ledger;
  const AX = allianceIndex(metrics, events);
  const H = (title) => L.push(`### ${title}`, '');
  const end = () => L.push('');
  L.push('## Décisions : ce que la simulation en montre', '', 'Une section par décision (D1 à D19 : 31 octobre 2026, rapport de vérification ; E1 à E6 : 1er novembre 2026, simulation de 200 jours ; G2 à G12 : 2 novembre 2026, deuxième simulation de 200 jours).', '');

  // D1 — carte et gisements
  H('D1. Carte et gisements pour 2 000 joueurs');
  L.push(`- Carte : ${n(last?.map?.size) || '?'} × ${n(last?.map?.size) || '?'}. Gisements où une colonie peut encore être fondée : ${n(first?.map?.foundable?.total)} au début (${lvKv(first?.map?.foundable?.byLevel)}), ${n(last?.map?.foundable?.total)} à la fin (${lvKv(last?.map?.foundable?.byLevel)}).`);
  const perPlayer = Object.entries(last?.map?.coloniesPerPlayer || {}).map(([k, v]) => `${n(v)} avec ${k} colonie${Number(k) > 1 ? 's' : ''}`).join(', ') || '—';
  L.push(`- Joueurs à la fin : ${perPlayer} ; colonies debout : ${n(standingColonies(last))} (gisements : ${lvKv(last?.map?.colonySiteLevels)}) ; Villes Merveille : ${n(wonderCities(last))}.`); end();

  // D2 — côté de la carte
  H('D2. Côté de la carte à l\'inscription');
  const sides = {};
  for (const e of ev('registered')) { const k = `${e.asked} → ${e.side || '?'}`; sides[k] = (sides[k] || 0) + 1; }
  L.push(`- Côtés (demandé → obtenu) : ${kv(sides)}. Capitales par côté à la fin : ${kv(last?.map?.capitalsBySide)}.`); end();

  // D3 — attentes des rassemblements
  H('D3. Attentes des rassemblements (5 à 180 min)');
  const ral = {};
  for (const r of last?.endgame?.rallies || []) { const k = `${r.kind} ${r.wait} min`; ral[k] = (ral[k] || 0) + r.n; }
  L.push(Object.keys(ral).length ? table(['Cible et attente', 'Rassemblements'], Object.entries(ral).sort((a, b) => b[1] - a[1])) : 'Aucun rassemblement.'); end();

  // D4, D5, D16, D17 — or
  H('D4. Or des expéditions : seulement avec le héros');
  // l'or rapporté par les armées (camps d'or, récoltes) : mesuré aux étapes du tick depuis le 2 novembre 2026 (ledger.cjs),
  // sinon compté dans « Autres sources »
  const gm = [...new Set(marks.map(d => at(d)).filter(m => m?.ledger))];
  const carried = gm.some(m => typeof m.ledger.income.carried === 'number');
  const rowsGold = gm.map(m => [m.day, m.ledger.income.treasury, m.ledger.income.expeditions, m.ledger.income.invasion, ...(carried ? [m.ledger.income.carried ?? '—'] : []), m.ledger.income.other, m.ledger.spent.elite, m.ledger.spent.instantHeal, m.ledger.spent.spies + m.ledger.spent.talents, m.ledger.goldNow]);
  L.push(rowsGold.length ? table(['Jour', 'Chambre au Trésor', 'Expéditions (héros)', 'Trésor des donjons', ...(carried ? ['Camps d\'or et récoltes'] : []), 'Autres sources', 'Élites', 'Soins à l\'or', 'Espions et talents', 'Or des joueurs'], rowsGold) : 'Pas de relevé de l\'or.');
  const hero = counters('hero_summary');
  if (lg) {
    const inc = lg.income;
    const src = [['Chambre au Trésor', inc.treasury], ['expéditions du héros', inc.expeditions], [typeof lg.invasionCredited === 'number' && !lg.invasionCreditedFrom ? 'trésor des donjons versé' : 'trésor des donjons (formule)', inc.invasion], ...(typeof inc.carried === 'number' ? [['camps d\'or et récoltes', inc.carried]] : []), ['autres', inc.other]];
    const total = sum(src, x => Math.max(0, x[1] || 0));
    L.push('', `- Or gagné par source (cumul à la fin) : ${src.map(([k, v]) => `${k} ${n(v || 0)} (${pct(Math.max(0, v || 0), total)})`).join(', ')} ; camps d'or vus par les joueurs automatiques : ${n(mil.goldCampRaids || 0)} attaques, ${n(mil.goldCampGold || 0)} or rapporté.`);
    L.push(`- Expéditions finies : ${n(lg.expeditions.done)}, dont ${n(lg.expeditions.withGold)} avec de l'or (${pct(lg.expeditions.withGold, lg.expeditions.done)}) ; expéditions lancées par les joueurs automatiques : ${n(hero.exp || 0)} (gardées pour la Merveille : ${n(hero.expKeptForWonder || 0)}, pour un assaut de Bastion : ${n(hero.expKeptForMuster || 0)}). Cumuls depuis le début, tous joueurs ; « Autres sources » : la variation de l'or moins ce qui est compté (${carried ? 'défi de la semaine, remboursements, or rapporté hors du tick' : 'camps d\'or, défi, remboursements'}…).`);
  }
  end();
  H('D5. Prix de l\'élite (2 or par unité, ressources × 0,85)');
  const tiers = last?.totals?.unitsByTier || {};
  const allUnits = Object.values(tiers).reduce((t, v) => t + v, 0);
  L.push(`- Or dépensé pour l'élite : ${n(lg?.spent?.elite || 0)} ; soins à l'or : ${n(lg?.spent?.instantHeal || 0)} (${n(mil.healed || 0)} blessés soignés à l'or pour ${n(mil.healGold || 0)} or, ${n(mil.healGoldWait || 0)} soins remis faute d'or). Soldats d'élite à la fin : ${n(tiers.elite || 0)} (${pct(tiers.elite || 0, allUnits)} des unités).`); end();
  H('D6. Unités intermédiaires (pas de changement)');
  L.push(`- Unités à la fin par palier : ${kv(tiers)} ; intermédiaires : ${pct(tiers.intermediate || 0, allUnits)}.`); end();

  // D7, D8 — échanges entre joueurs par armée, taxe
  H('D7. Plus de marchands ni de transport entre ses villes : échanges par armée');
  if (mkt) {
    const paid = mk.paidVolume === undefined ? '' : ` + ${n(mk.paidVolume)} payées`;
    L.push(`- Échanges conclus : ${n(mk.accepted || 0)} pour ${n(mk.boughtVolume || 0)} ressources vendues${paid} (compteurs des joueurs automatiques : le jeu efface les offres closes après 30 jours) ; offres expirées : ${n(mk.expired || 0)} (rendues dans des villes toutes pleines : ${n(mk.expiredIntoFullStore || 0)}).`);
    L.push(`- Offres publiées ${n(mk.posted || 0)} (caravane réservée, statut MARKET), acceptées ${n(mk.accepted || 0)} (dont ${n(mk.acceptBorrowedArmy || 0)} portées par une autre armée que la caravane, ${n(mk.acceptAlly || 0)} d'un membre de l'alliance), prises par un autre au même instant ${n(mk.acceptRaced || 0)}, retirées ${n((mk.cancelStale || 0) + (mk.cancelChanged || 0))}.`);
    L.push(`- Envois à un allié : ${n(mk.aidSent || 0)} (${n(mk.aidVolume || 0)} ressources) ; marchand du serveur : ${n(mk.npcTrades || 0)} échanges, dont ${n(mk.npcFoodTrades || 0)} achats de céréales (${n(mk.npcFoodBought || 0)} reçues ; ${n(mk.npcFoodSkipped || 0)} fois écartés, greniers du joueur assez pleins). Caravanes formées : ${n(mk.caravans || 0)} (${n(mkt.caravans || 0)} à la fin) ; armées qui attendent avec une offre : ${n(mkt.armiesWaiting || 0)}, en livraison : ${n(mkt.armiesDelivering || 0)}.`);
  } else L.push('- Pas de point d\'étape du marché.');
  L.push(`- Refus « Vos villes partagent leur stock » : ${n(refusals(/partagent leur stock/))} ; « Armée réservée pour une offre du marché » : ${n(refusals(/réservée pour une offre/))}.`); end();
  H('D8. Taxe des échanges entre joueurs (30 % de base)');
  // la taxe vraiment prise sur les échanges conclus : 1 − reçu / échangé, pondérée par les volumes (sim-e : 9,1 %, alors que
  // la ligne d'avant donnait 5 %, la taxe de la dernière offre de chaque vendeur, 60 % du volume ayant été échangé avant)
  const taken = (got, of) => (of ? `${fixed(100 * (1 - got / of))} %` : '—');
  L.push(`- Taxe prise sur les échanges conclus, pondérée par les volumes : ${taken(mk.receivedFromSeller || 0, mk.boughtVolume || 0)} côté acheteurs (reçu ${n(mk.receivedFromSeller || 0)} sur ${n(mk.boughtVolume || 0)} vendus)${mk.paidVolume === undefined ? '' : `, ${taken(mk.deliveredToSeller || 0, mk.paidVolume)} côté vendeurs (reçu ${n(mk.deliveredToSeller || 0)} sur ${n(mk.paidVolume)} payés)`}.`);
  // taxe à la publication de chaque offre (compteurs taxSum, taxN et tax_<taux> des joueurs automatiques) ; sinon la taxe de
  // la dernière offre de chaque vendeur, dite comme telle
  const taxHist = Object.entries(mk).filter(([k]) => /^tax_[\d.]+$/.test(k)).map(([k, v]) => [Number(k.slice(4)), v]).sort((a, b) => a[0] - b[0]);
  if (mk.taxN) L.push(`- Taxe à la publication des offres : moyenne ${fixed(mk.taxSum / mk.taxN)} % sur ${n(mk.taxN)} offres${taxHist.length ? ` (de ${n(taxHist[0][0])} à ${n(taxHist[taxHist.length - 1][0])} % ; offres par taxe : ${taxHist.slice(0, 12).map(([t, v]) => `${n(t)} % ${n(v)}`).join(', ')}${taxHist.length > 12 ? '…' : ''})` : ''}.`);
  else {
    const taxes = bots.map(b => b.mem?.mkt?.taxPct).filter(x => typeof x === 'number');
    L.push(`- Taxe de la dernière offre publiée par chaque vendeur (pas celle des échanges conclus) : médiane ${nn(median(taxes))} % (de ${n(taxes.length ? Math.min(...taxes) : null)} à ${n(taxes.length ? Math.max(...taxes) : null)} %).`);
  }
  end();

  // D9 — Bastion
  H('D9. Bastion : un assaut = un rassemblement, garnison de 10, mur × 3');
  const br = ev('bastion_rally'), ba = ev('bastion_assault');
  L.push(`- Rassemblements contre un Bastion : ${br.length} ; armées par rassemblement (médiane) ${nn(median(br.map(e => e.armies)))}, engins (médiane) ${nn(median(br.map(e => e.engines)))}, attente (médiane) ${nn(median(br.map(e => e.wait)))} min, dégâts au mur attendus sans garnison (médiane) ${nn(median(br.map(e => e.wallDamageEstimate)))} sur ${n(br[0]?.wallHp)}.`);
  L.push(`- Assauts livrés : ${ba.length}, gagnés ${ba.filter(e => e.won).length} ; armées par assaut (médiane) ${nn(median(ba.map(e => e.armies)))} ; dégâts au mur (médiane) ${nn(median(ba.map(e => e.wallDamage).filter(x => x !== null && x !== undefined)))} ; garnison restée après l'assaut (médiane, armées avec des soldats) ${nn(median(ba.map(e => e.garrisonAfter).filter(x => x !== null && x !== undefined)))}. Bastions rasés : ${ev('bastion_destroyed').length}.`);
  // question ouverte (Bastion) : ce qu'un rassemblement emporte de l'alliance qui le lance (armées par membre, soldats sur
  // ceux de l'alliance au relevé le plus proche), assauts gagnés ; chaque assaut gagné prend une vie et relance la pause
  const attackers = [...new Set(br.map(e => e.alliance).filter(Boolean))].sort();
  if (attackers.length) {
    const rowsAl = attackers.map(tag => {
      const rs = br.filter(e => e.alliance === tag);
      const parts = rs.map(e => { const s = AX.sizeAt(at(e.day), tag); return { members: s.members ? e.armies / s.members : null, soldiers: s.soldiers && typeof e.soldiers === 'number' ? e.soldiers / s.soldiers : null }; });
      const as = ba.filter(e => AX.tagOfPlayer(String(e.by || '').split(',')[0]) === tag);
      const size = AX.sizeAt(last, tag);
      return [tag, size.members || '—', rs.length, nn(median(rs.map(e => e.armies))), nn(median(nums(rs.map(e => e.readyMembers)))), share(median(nums(parts.map(p => p.members)))), nn(median(nums(rs.map(e => e.soldiers)))), share(median(nums(parts.map(p => p.soldiers)))), as.length, as.filter(e => e.won).length];
    });
    L.push('', table(['Alliance qui attaque', 'Membres (fin)', 'Rassemblements', 'Armées par rassemblement (médiane)', 'Membres prêts (médiane)', 'Armées / membres (médiane)', 'Soldats par rassemblement (médiane)', 'Part des soldats de l\'alliance (médiane)', 'Assauts', 'Gagnés (une vie et une pause chacun)'], rowsAl));
  }
  if (ba.length) L.push('', table(['Jour', 'Assaillants', 'Bastion', 'Armées', 'Gagné', 'Mur avant', 'Mur après', 'Vies', 'Défenseurs', 'Garnison après'], ba.slice(-15).map(e => [e.day, String(e.by || '').slice(0, 40), e.bastion, e.armies, e.won ? 'oui' : 'non', e.wallHpStart, e.wallHpEnd, e.lives, e.defenders ?? '', e.garrisonAfter])), '');
  L.push(`- Garnisons (joueurs automatiques) : ${n(mem('al.garrisons'))} envois, ${n(mem('al.garrisonSoldiers'))} soldats ; ${n(mem('al.refills'))} retours pour se regarnir après un assaut, ${n(mem('al.relief'))} relèves en tout ; ${n(mem('al.foodWait'))} recrues remises faute de céréales. Refus « Garnison du Bastion complète » : ${n(refusals(/Garnison du Bastion complète/))}.`);
  L.push(`- Garnisons à la fin : ${(last?.endgame?.bastions || []).map(b => `${b.tag} ${b.status} ${b.garrison} armées${b.soldiers !== undefined ? ` (${n(b.soldiers)} soldats postés)` : ''}, ${b.lives} vies`).join(' ; ') || 'aucun Bastion'}.`); end();

  // D10, D11 — Merveille et fin de partie
  H('D10. Merveille à moitié prix');
  const lv = ev('wonder_level');
  // les vagues : alliance de la Ville Merveille (sigle de l'événement, sinon son nom dans les relevés, sinon « Merveille de »
  // + son fondateur) et niveau avant la vague (levelBefore, sinon le niveau lu après : +1 pour une vague perdue)
  const waves = ev('wonder_wave');
  const cityTag = new Map();
  for (const m of metrics) for (const w of m.endgame?.wonders || []) if (w.name && w.tag) cityTag.set(w.name, w.tag);
  for (const e of ev('wonder_city_founded')) if (e.owner && e.alliance && !cityTag.has(`Merveille de ${e.owner}`)) cityTag.set(`Merveille de ${e.owner}`, e.alliance);
  const waveTag = (e) => e.alliance || cityTag.get(e.city) || '?';
  // level : avant le 2 novembre 2026, le niveau lu au pas suivant (après la vague : +1 pour une vague perdue) ; depuis, le
  // niveau frappé (événement avec la puissance de la vague, `wave`), déjà le niveau d'avant la vague
  const waveLevel = (e) => {
    if (typeof e.levelBefore === 'number') return e.levelBefore;
    if (typeof e.level !== 'number') return null;
    return e.wave !== undefined ? e.level : e.level + (e.held ? 0 : 1);
  };
  // niveau le plus haut de chaque alliance (premier jour vu) : points d'étape de la Merveille, relevés, niveaux, vagues ; et le
  // premier jour de chaque palier (une Merveille qui perd et reprend le niveau 20 ne le compte qu'une fois)
  const peak = {}, firstAt = {};
  const see = (tag, level, day) => { if (!tag || typeof level !== 'number') return; if (!peak[tag] || level > peak[tag].level) peak[tag] = { level, day }; };
  for (const e of ev('wonder_summary')) for (const w of e.wonders || []) see(w.alliance, w.level, e.day);
  for (const m of metrics) for (const w of m.endgame?.wonders || []) see(w.tag, w.level, m.day);
  for (const e of waves) if (typeof e.levelBefore === 'number') see(waveTag(e), e.levelBefore, e.day);   // le niveau lu après une vague n'est qu'une estimation
  for (const e of lv) { see(e.alliance, e.level, e.day); const f = (firstAt[e.alliance] ||= {}); if (f[e.level] === undefined) f[e.level] = e.day; }
  const peakText = Object.entries(peak).sort().map(([t, p]) => `${t} ${p.level} (vu au jour ${p.day})`).join(', ') || '—';
  const firstText = Object.entries(firstAt).sort().map(([t, f]) => `${t} ${Object.entries(f).sort((a, b) => a[0] - b[0]).map(([l, d]) => `${l} (j${d})`).join(', ')}`).join(' ; ') || '—';
  L.push(`- Niveau le plus haut : ${peakText}. Premier jour de chaque palier : ${firstText}. Niveaux à la fin : ${(last?.endgame?.wonders || []).map(w => `${w.tag || '?'} ${w.level}`).join(', ') || '—'}.`);
  if (wsum) L.push(`- Livraisons par armée : ${n(won.deliveries || 0)} convois, ${n(won.delivered || 0)} ressources (bois ${n(won.delivered_wood || 0)}, pierre ${n(won.delivered_stone || 0)}, fer ${n(won.delivered_iron || 0)}, céréales ${n(won.delivered_food || 0)}) ; caravane ${n(won.deliveredByCaravan || 0)}, convoi ${n(won.deliveredByConvoy || 0)}, armée de campagne ${n(won.deliveredByFieldArmy || 0)} ; niveaux lancés ${n(won.levelsStarted || 0)} ; attentes du stock ${n(won.buildWaitStock || 0)}, d'un plan ${n(won.buildWaitPlan || 0)} ; livraisons remises pendant qu'un assaut de Bastion se prépare ${n(won.deliverMuster || 0)} ; stock des chantiers à la fin : ${(wsum.wonders || []).map(w => `${w.alliance || '?'} ${n(w.stock)}`).join(', ') || '—'}.`);
  end();
  H('D11. Fin de partie pour des alliances de 15 à 20 joueurs');
  const wr = ev('wonder_rally');
  L.push(`- Rassemblements contre les Immortels : ${wr.length} (sites ${wr.filter(e => e.target === 'WONDER').length}, plans ${wr.filter(e => e.target === 'PLAN').length}, dont ${wr.filter(e => e.wear).length} pour les user) ; armées (médiane) ${nn(median(wr.map(e => e.armies)))} ; puissance du rassemblement / Immortels (médiane) ${fixed(median(wr.map(e => (e.immortals ? e.power / e.immortals : 0))), 2)}. Sites libérés : ${ev('wonder_site_beaten').length} (premier au jour ${ev('wonder_site_beaten')[0]?.day ?? '—'}) ; rassemblements repoussés : ${ev('wonder_rally_repelled').length}.`);
  // question ouverte (plans) : plans pris, détenus à la fin (base), rassemblements de plan et ce qu'ils ont usé
  const planRallies = wr.filter(e => e.target === 'PLAN');
  const plansHeld = (last?.endgame?.plans || []).map(p => `${p.tag || '?'} ${n(p.n)}`).join(', ') || 'aucun';
  const planSites = (last?.endgame?.sites || []).find(x => x.kind === 'PLAN');
  L.push(`- Plans : pris ${ev('wonder_plan_taken').length} (détenus à la fin : ${plansHeld} ; sur la carte : ${n(planSites?.n ?? 0)}) ; rassemblements de plan ${planRallies.length} (${kv(byKey(planRallies, 'alliance'))} ; repoussés ${ev('wonder_rally_repelled').filter(e => e.target === 'PLAN').length}, pour user ${planRallies.filter(e => e.wear).length}) ; armées (médiane) ${nn(median(planRallies.map(e => e.armies)))}, puissance / Immortels (médiane) ${fixed(median(planRallies.map(e => (e.immortals ? e.power / e.immortals : 0))), 2)} ; conseils : plan trop fort ${n(sum(Object.values(wsum?.alliances || {}), x => x.PLANTooWeak))}, personne à la maison ${n(sum(Object.values(wsum?.alliances || {}), x => x.PLANNobodyHome))} ; attentes d'un plan pour bâtir ${n(won.buildWaitPlan || 0)}.`);
  // vagues d'Immortels (événements, chacun une fois) : une vague perdue ôte un niveau (wonderService.loseLevels) ; défenseurs
  // postés, part des soldats de l'alliance au relevé le plus proche
  // (la part lue par le module au pas de la vague, postedShare, quand l'événement l'a)
  const posted = (e) => { if (typeof e.postedShare === 'number') return e.postedShare; const s = AX.sizeAt(at(e.day), waveTag(e)); return s.soldiers ? (e.defenders || 0) / s.soldiers : null; };
  const lost = waves.filter(e => !e.held);
  L.push(`- Vagues d'Immortels : ${waves.length}, tenues ${waves.filter(e => e.held).length}, perdues ${lost.length} (niveaux perdus ${lost.length}, un par vague perdue) ; défenseurs postés (médiane) ${nn(median(waves.map(e => e.defenders || 0)))}, part des soldats de l'alliance (médiane) ${share(median(nums(waves.map(posted))))} ; gardes de la Merveille envoyées ${n(won.guardsSent || 0)} (Ost prêté ${n(won.ostToWonder || 0)}, sans place ${n(won.guardNoSlot || 0)}).`);
  if (waves.length) {
    const wTags = [...new Set(waves.map(waveTag))].sort();
    const heldMax = (list) => { const h = nums(list.filter(e => e.held).map(waveLevel)); return h.length ? Math.max(...h) : '—'; };
    L.push('', table(['Ville Merveille de', 'Vagues', 'Tenues', 'Perdues', 'Défenseurs postés (médiane)', 'Part des soldats de l\'alliance (médiane)', 'Plus haut niveau tenu', 'Dernière vague tenue (jour)'], wTags.map(t => { const ws = waves.filter(e => waveTag(e) === t); const held = ws.filter(e => e.held); return [t, ws.length, held.length, ws.length - held.length, nn(median(ws.map(e => e.defenders || 0))), share(median(nums(ws.map(posted)))), heldMax(ws), held.length ? held[held.length - 1].day : '—']; })));
    const band = (e) => { const l = waveLevel(e); return l === null ? '?' : `${Math.floor(l / 10) * 10}-${Math.floor(l / 10) * 10 + 9}`; };
    const bands = [...new Set(waves.map(band))].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    L.push('', table(['Niveau avant la vague', 'Vagues', 'Tenues', 'Perdues', 'Défenseurs postés (médiane)', 'Part des soldats de l\'alliance (médiane)'], bands.map(b => { const ws = waves.filter(e => band(e) === b); return [b, ws.length, ws.filter(e => e.held).length, ws.filter(e => !e.held).length, nn(median(ws.map(e => e.defenders || 0))), share(median(nums(ws.map(posted))))]; })), '');
  }
  const al = {};
  for (const p of last?.players || []) if (p.alliance) al[p.alliance] = (al[p.alliance] || 0) + 1;
  L.push(`- Membres par alliance à la fin : ${Object.values(al).sort((a, b) => b - a).join(', ') || '—'}.`);
  if (inv) {
    const w = inv.world || {}, b = inv.bots || {};
    const by = (re) => Object.fromEntries(Object.entries(w).filter(([k]) => re.test(k)).map(([k, v]) => [k.replace(re, ''), v]));
    L.push(`- Donjons : étages battus ${lvKv(by(/^floorsL/))} ; détruits ${lvKv(by(/^destroyedL/))} ; étages usés ${lvKv(by(/^woreL/))} ; rassemblements lancés ${n(b.launched || 0)} (pour user un étage ${n(b.launchedToWear || 0)}), armées envoyées ${n(b.joined || 0)}, repoussés ${n(w.repelled || 0)}.`);
  }
  end();

  // D12 — colonies protégées
  H('D12. Colonies neuves protégées 72 h');
  const fallen = ev('city_fallen');
  L.push(`- Refus « Colonie protégée » : ${n(refusals(/Colonie protégée/))} ; raids écartés d'eux-mêmes pour une colonie protégée : ${n(wk.raidSkipProtected || 0)}. Villes tombées : ${fallen.length} (${kv(byKey(fallen, 'fate'))}).`); end();

  // D13, D14 — Grandes caserne et écurie, gisements
  H('D13. Grande caserne et Grande écurie : 0,75 % par niveau');
  const tr = last?.totals?.trainers || {};
  L.push(`- Colonies : Grande caserne dans ${n(tr.GREAT_BARRACKS?.built || 0)} sur ${n(tr.GREAT_BARRACKS?.of || 0)} (niveau moyen ${fixed(tr.GREAT_BARRACKS?.avg)}, ${n(tr.GREAT_BARRACKS?.at20 || 0)} au niveau 20) ; Grande écurie dans ${n(tr.GREAT_STABLE?.built || 0)} (niveau moyen ${fixed(tr.GREAT_STABLE?.avg)}, ${n(tr.GREAT_STABLE?.at20 || 0)} au niveau 20).`); end();
  H('D14. Spécialité des gisements (pas de changement)');
  const founded = ev('colony_founded');
  const foundedByLevel = founded.reduce((o, e) => { const l = e.site?.level ?? '?'; o[l] = (o[l] || 0) + 1; return o; }, {});
  L.push(`- Colonies fondées par niveau de gisement : ${lvKv(foundedByLevel)} ; debout à la fin : ${lvKv(last?.map?.colonySiteLevels)} (détail par type : section « Colonies »).`); end();

  // D15 — cachette
  H('D15. Cachette : 1,5 % du stockage par niveau');
  L.push(`- Raids gagnés lus : ${n(wk.raidsWonCounted || 0)}. Stock des villes pillées avant le raid : ${n(wk.raidStockBefore || 0)} ; à l'abri dans la cachette : ${n(wk.raidSheltered || 0)} (${pct(wk.raidSheltered || 0, wk.raidStockBefore || 0)}) ; butin : ${n(wk.raidLoot || 0)}. Niveau moyen de la cachette pillée : ${wk.raidsWonCounted ? fixed(wk.raidHideoutLevels / wk.raidsWonCounted) : '—'}.`);
  L.push(`- Cachettes à la fin : capitales ${kv(last?.totals?.hideout?.capital)} ; colonies ${kv(last?.totals?.hideout?.colony)}.`); end();

  H('D16. Chambre au Trésor (pas de changement)');
  L.push(`- Or versé par la Chambre au Trésor, mesuré à chaque tick : ${n(lg?.income?.treasury || 0)} (tableau D4).`); end();
  H('D17. Trésor des invasions : 200 or');
  // la formule du niveau (avant partage) et ce qui a été versé (parts selon les dégâts, arrondies à l'or près, ledger.cjs) ;
  // la ligne d'avant appelait « reçu par les joueurs » le total de la formule
  const formula = lg?.invasionFormula ?? lg?.income?.invasion ?? 0;
  const paidTxt = typeof lg?.invasionCredited === 'number'
    ? `${n(lg.invasionCredited)} or versé aux joueurs (parts selon les dégâts, arrondies à l'or près${lg.invasionCreditedFrom && startMs ? `, mesuré depuis le jour ${Math.floor((lg.invasionCreditedFrom - startMs) / 86400000)}` : `, ${pct(lg.invasionCredited, formula)} de la formule`})`
    : 'or versé aux joueurs non mesuré (relevé d\'avant le 2 novembre 2026)';
  L.push(`- Trésor des donjons détruits (formule du niveau, avant partage) : ${n(formula)} or ; ${paidTxt} ; trésor annoncé par le module des invasions : ${n(inv?.world?.treasureGold || 0)} or. Donjons détruits : ${kv(lg?.invasionDestroyed)}.`); end();

  // D18 — joueurs automatiques
  H('D18. Joueurs automatiques');
  const ug = last?.map?.unguarded;
  L.push(`- Gardes des colonies : ${n(mil.guardsCreated || 0)} formées, ${n(mil.guardsPosted || 0)} départs vers une colonie, ${n(mil.guardsAttached || 0)} rattachées (E2), ${n(mil.guardNoSlot || 0)} fois sans place à la capitale ; relèves demandées ${n(mil.guardReliefAsked || 0)}, parties ${n(mil.guardReliefs || 0)}, gardes relevées ${n(mil.guardRelieved || 0)}, relèves abandonnées ${n(mil.guardReliefDropped || 0)} ; gardes vides dissoutes sur place ${n(mil.guardDisbandedEmpty || 0)} ; gardes sans poste reprises ${n(mil.guardAdopted || 0)}, dissoutes ${n(mil.guardDisbanded || 0)}.${ug ? ` Colonies sans garde en poste à la fin (jour ${last.day}) : ${n(ug.n)} sur ${n(standingColonies(last))}${ug.n ? ` — ${ug.list.join(', ')}` : ''}.` : ''}`);
  L.push(`- Armées de campagne : secondes armées rendues ${n(mil.yielded || 0)} (rappelées pour cela ${n(mil.yieldRecalls || 0)}), armées presque vides dissoutes ${n(mil.disbandedTiny || 0)}, sites de colonie libérés avec la garnison ${n(mil.clearFilled || 0)}, armées gardées pour l'escorte du colon ${n(mil.keptHomeForEscort || 0)}. Camps d'or attaqués ${n(mil.goldCampRaids || 0)} (or vu au départ ${n(mil.goldCampExpected || 0)}, au retour ${n(mil.goldCampGold || 0)}).`);
  const siegeWaves = ev('siege_wave');
  L.push(`- Sièges : ${siegeWaves.length} vagues (marche médiane ${fixed(median(siegeWaves.map(e => e.marchH)))} h, armées médianes ${nn(median(siegeWaves.map(e => e.armies)))}) ; vagues hors du tick prévu ${n(wk.waveOffTick || 0)}, annulées ${n(wk.waveAborted || 0)}, remises pendant une chaîne d'assauts ${n(wk.waveChainPause || 0)} ; engins à la fin : ${n(lastOf(events, 'war_summary')?.engines || 0)}.`);
  const ib = inv?.bots || {}, iw = inv?.world || {};
  if (inv) L.push(`- Invasions : rassemblements lancés à l'étage 1 / 2 / 3 : ${n(ib.launchedF1 || 0)} / ${n(ib.launchedF2 || 0)} / ${n(ib.launchedF3 || 0)} (donjon commencé ${n(ib.launchedStarted || 0)}, entre deux pas ${n(ib.launchedBetweenSteps || 0)}) ; chef rejoint ${n(ib.joinedBoss || 0)}, seulement rejoindre ${n(ib.onlyJoin || 0)}, trop loin ${n(ib.joinTooFar || 0)}, armées fondues ${n(ib.merged || 0)}, enchaînements ${n(ib.chainTurns || 0)} ; chefs battus ${n(iw.bossBeaten || 0)}, repoussés ${n(iw.bossRepelled || 0)}.`);
  const wa = wsum?.alliances || {};
  const wsumA = (k) => sum(Object.values(wa), x => x[k]);
  if (wsum) L.push(`- Merveille (conseils d'alliance) : fondations à la notification ${n(wsumA('foundByNotification'))}, rassemblements annoncés ${n(wsumA('announced'))} (pauses ${n(wsumA('announcePaused'))}), personne à la maison ${n(wsumA('WONDERNobodyHome') + wsumA('PLANNobodyHome'))}, trop faibles ${n(wsumA('WONDERTooWeak') + wsumA('PLANTooWeak'))}, rassemblements de plan ${n(wsumA('PLANRallies'))}, armées fondues ${n(wsumA('rallyMerged'))} ; joueurs : achats de céréales pour la Merveille ${n(won.npcForWonder || 0)} (${n(won.npcForWonderFood || 0)} reçues pour ${n(won.npcForWonderGiven || 0)} données, refus ${n(won.npcForWonderRefused || 0)}), fondation au début du tour ${n(won.foundEarly || 0)}, colons partis ${n(won.foundSent || 0)}, sans escorte ${n(won.founderNoEscort || 0)}.`);
  const q = counters('quest_summary');
  L.push(`- Quêtes : ${n(last?.totals?.quests || 0)} récompenses (tâches ${n(q.claimed_task || 0)}, tutoriel ${n(q.claimed_tutorial || 0)}, jour ${n(q.claimed_daily || 0)}, semaine ${n(q.claimed_weekly || 0)}, succès ${n(q.claimed_achievement || 0)}), ${n(q.volume || 0)} ressources ; attentes faute de place : ${n(q.waitRoom || 0)}.`); end();

  H('D19. Textes et documents');
  L.push('- Rien à mesurer ici : les documents (docs/) sont relus à part.'); end();

  // E1 — stock commun
  H('E1. Stock commun pour tout ce qu\'une armée emporte');
  const fillOf = (m) => m?.fill || {};
  const fillRows = ev('market_summary').filter((e, i, a) => i === a.length - 1 || i % 4 === 0).map(e => [e.day, fillOf(e).cap?.food ?? '', fillOf(e).col?.food ?? '', fillOf(e).cap?.wood ?? '', fillOf(e).col?.wood ?? '', e.counters?.accepted || 0, e.counters?.expired || 0]);
  L.push(`- Chargements pris hors de la capitale (dans les colonies), tous les autres stocks compris : marché ${n(mk.loadFromOthers || 0)} ; Merveille ${n(won.deliveredFromOthers || 0)} (dont céréales ${n(won.deliveredFoodFromOthers || 0)}) ; ravitaillement du Bastion ${n(mem('al.suppliedFromOthers'))} sur ${n(mem('al.supplied'))}.`);
  L.push(`- Céréales livrées à la Merveille : ${n(won.delivered_food || 0)} ; achetées au marchand du serveur pour elle : ${n(won.npcForWonderFood || 0)}. Refus « Ressources insuffisantes » sur les envois et offres : ${n(refusals(/(trade\/send|market\/offer|\/transport|bastion\/:id\/send).*Ressources insuffisantes/))}.`);
  if (fillRows.length) L.push('', table(['Jour', 'Céréales capitales %', 'Céréales colonies %', 'Bois capitales %', 'Bois colonies %', 'Échanges conclus (cumul)', 'Offres expirées (cumul)'], fillRows));
  end();

  // E2 — armées rattachées aux colonies
  H('E2. Armées rattachées aux colonies');
  const ca = last?.map?.colonyArmies;
  if (ca) L.push(`- À la fin : ${n(ca.attached)} armées rattachées à une colonie (${n(ca.manned)} avec des soldats), dans ${n(ca.colonies)} colonies sur ${n(standingColonies(last))} (sans les Villes Merveille), chez ${n(ca.players)} joueurs ; armées sur les emplacements des capitales : ${n(ca.capitalArmies)} (${n(ca.capitals)} capitales).`);
  // taille des gardes contre la part que vise le joueur automatique (checks.cjs colonyGuards : 15 % de ses soldats)
  const cg = last?.map?.colonyGuards;
  if (cg) L.push(`- Taille des gardes rattachées à la fin : ${n(cg.n)} gardes ; soldats d'une garde (médiane) ${nn(cg.median)} pour une part visée de ${nn(cg.target)} (${share(cg.share)} des soldats du joueur, médiane) ; garde / part visée (médiane) ${share(cg.ratio)} ; ${n(cg.under30)} sous 30 % de leur part, ${n(cg.under50)} sous 50 %, ${n(cg.empty)} vides.`);
  const caRows = [...new Set(marks.map(d => at(d)).filter(m => m?.map?.colonyArmies))].map(m => [m.day, m.map.colonyArmies.attached, m.map.colonyArmies.manned, m.map.colonyArmies.capitalArmies, m.map.unguarded?.n ?? '', m.map.colonyGuards ? `${n(m.map.colonyGuards.median)} / ${n(m.map.colonyGuards.target)}` : '—', m.map.colonyGuards?.under30 ?? '—', m.map.colonyGuards?.empty ?? '—']);
  if (caRows.length) L.push('', table(['Jour', 'Armées rattachées', 'Avec des soldats', 'Armées des capitales', 'Colonies sans garde', 'Soldats d\'une garde / part visée (médianes)', 'Gardes sous 30 %', 'Gardes vides'], caRows), '');
  L.push(`- Gardes : rattachées ${n(mil.guardsAttached || 0)}, rattachement refusé ${n(mil.guardAttachRefused || 0)} ; renvoyées à la capitale ${n(mil.guardDetached || 0)} (sans place à la capitale ${n(mil.guardDetachNoSlot || 0)}, autres refus ${n(mil.guardDetachRefused || 0)}). Refus du serveur : rattacher ${n(refusals(/attach-colony/))}, renvoyer ${n(refusals(/detach-colony/))}.`); end();

  // E3 — pause des vies du Bastion
  H('E3. Bastion : une vie ne revient qu\'après 24 h sans assaut gagné');
  const chains = ev('bastion_chain'), chainEnds = ev('bastion_chain_end');
  const gaps = br.map(e => e.gapH).filter(x => typeof x === 'number');
  // la fenêtre d'une chaîne : la pause des vies que les joueurs automatiques ont suivie (bastion_rally windowH :
  // config.bastion.regenPauseHours) ; 24 h (décision E3) pour les mesures écrites avant
  const windowH = br.find(e => typeof e.windowH === 'number')?.windowH ?? 24;
  L.push(`- Chaînes d'assauts : ${chains.length} commencées, ${chainEnds.length} finies (${kv(byKey(chainEnds, 'why'))}) ; rassemblements par chaîne (médiane) ${nn(median(chainEnds.map(e => e.rallies || 0)))}, assauts gagnés par chaîne (médiane) ${nn(median(chainEnds.map(e => e.wins || 0)))}, vies les plus basses (médiane) ${nn(median(chainEnds.map(e => e.lowestLives).filter(x => x !== null && x !== undefined)))}.`);
  L.push(`- Écart entre deux assauts d'une chaîne : médiane ${fixed(median(gaps))} h ; ${pct(gaps.filter(g => g < windowH).length, gaps.length)} sous ${windowH} h (${gaps.length} écarts) ; chaînes reparties d'un assaut trop tardif ${n(wk.chainRestart || 0)}, pas sans groupe assez fort ${n(wk.chainWait || 0)}, sans lanceur ${n(wk.chainNoLeader || 0)}.`);
  // vies perdues et revenues, lues assaut par assaut sur chaque Bastion
  const byBastion = {};
  for (const e of ba) (byBastion[e.bastion] ||= []).push(e);
  const livesRows = Object.entries(byBastion).map(([tag, list]) => {
    let regained = 0, prev = null, lowest = null;
    for (const e of list) {
      const after = Number(String(e.lives || '').split('/')[0]);
      const before = e.won ? after + 1 : after;
      if (prev !== null && Number.isFinite(before) && before > prev) regained += before - prev;
      if (Number.isFinite(after)) lowest = lowest === null ? after : Math.min(lowest, after);
      prev = Number.isFinite(after) && after > 0 ? after : null;   // rasé : le Bastion rebâti repart de toutes ses vies
    }
    const end = (last?.endgame?.bastions || []).find(b => `Bastion [${b.tag}]` === tag || b.tag === tag);
    return [tag, list.length, list.filter(e => e.won).length, regained, lowest ?? '—', end ? end.lives : '', end?.pausedUntil ? end.pausedUntil.slice(0, 16).replace('T', ' ') : '—'];
  });
  if (livesRows.length) L.push('', table(['Bastion', 'Assauts', 'Gagnés (vie prise, pause relancée)', 'Vies revenues entre deux assauts', 'Vies les plus basses', 'Vies à la fin', 'Pause jusqu\'à'], livesRows));
  end();

  // E4 — briser le camp ensemble
  H('E4. Briser le camp devant un Bastion : ensemble dans la même minute');
  const sent = ev('bastion_break_sent');
  const sentBy = sent.reduce((o, e) => { const k = e.sortie ? 'sortie' : e.mode || 'envoi'; o[k] = (o[k] || 0) + (e.armies || 1); return o; }, {});
  const groups = sent.filter(e => (e.armies || 1) > 1);
  L.push(`- Envois : ${sent.length} groupes, ${n(Object.values(sentBy).reduce((t, v) => t + v, 0))} armées (${kv(sentBy)}) ; groupes de plusieurs armées ${groups.length} (armées par groupe, médiane ${nn(median(groups.map(e => e.armies)))} ; armées du camp, médiane ${nn(median(sent.map(e => e.camps)))}) ; écart entre la première et la dernière arrivée (médiane) ${nn(median(groups.map(e => e.spreadS)))} s ; arrivées hors de la minute ${n(wk.breakSyncMissed || 0)} ; attente avant le départ des dernières armées ${n(Math.round((wk.breakSyncWaitS || 0) / 60))} min en tout ; camp trop fort pour tout le monde ${n(wk.bastionBreakTooWeak || 0)}, groupe remis faute d'appels ${n(wk.bastionBreakNoBudget || 0)}.`);
  const breaks = metrics.flatMap(m => m.week?.bastionBreaks || []);
  if (metrics.some(m => Array.isArray(m.week?.bastionBreaks))) {
    const dayOf = (iso) => (startMs ? Math.floor((Date.parse(iso) - startMs) / 86400000) : '?');
    const grouped = breaks.filter(b => (b.armies || 1) > 1);
    L.push(`- Combats contre un camp (un par groupe, rapports de bataille) : ${breaks.length}, camp brisé ${breaks.filter(b => b.won).length} ; à plusieurs armées ${grouped.length}, camp brisé ${grouped.filter(b => b.won).length} ; puissance du groupe / du camp (médiane) ${fixed(median(breaks.map(b => (b.dp ? b.ap / b.dp : 0))), 2)}. Compteurs des joueurs automatiques : gagnés ${n(wk.bastionBreak_won || 0)}, perdus ${n(wk.bastionBreak_lost || 0)} (à plusieurs : ${n(wk.bastionBreakGroup_won || 0)} / ${n(wk.bastionBreakGroup_lost || 0)}).`);
    if (breaks.length) L.push('', table(['Jour', 'Bastion', 'Armées de', 'Armées', 'Camp', 'Puissance groupe', 'Puissance camp', 'Camp brisé'], breaks.slice(-15).map(b => [dayOf(b.at), b.tag, String(b.by || '').slice(0, 40), b.armies || 1, String(b.camp || '').slice(0, 40), b.ap, b.dp, b.won ? 'oui' : 'non'])));
  } else L.push(`- Combats contre un camp (compteurs des joueurs automatiques) : gagnés ${n(wk.bastionBreak_won || 0)}, perdus ${n(wk.bastionBreak_lost || 0)}.`);
  end();

  // E5 — donjons sur une armée par joueur
  H('E5. Donjons réglés sur une armée par joueur (celle de la capitale)');
  const boss = last?.world?.bossFloor || 3;
  const fights = events.filter(e => ['rally_repelled', 'horde_floor_cleared', 'horde_destroyed'].includes(e.kind) && e.floor === boss);
  const beaten = fights.filter(e => e.kind !== 'rally_repelled');
  const armiesBy = {};
  for (const e of beaten) (armiesBy[e.level ?? '?'] ||= []).push(Number(e.armies?.length ?? e.armies) || 0);
  const fromDb = (rows) => Object.fromEntries((rows || []).map(r => [r.level, r.n]));
  L.push(`- Chefs (étage ${boss}) combattus : ${fights.length} (${lvKv(byKey(fights, 'level'))}), battus ${beaten.length} (${lvKv(byKey(beaten, 'level'))}) ; armées d'un rassemblement qui bat le chef (médiane, une par joueur) : ${lvKv(Object.fromEntries(Object.entries(armiesBy).map(([k, v]) => [k, median(v)])))}.`);
  L.push(`- Étages du chef ouverts (base, toutes invasions) : ${lvKv(fromDb(last?.world?.hordesBossByLevel))} ; donjons détruits : ${ev('horde_destroyed').length} par les rassemblements (${lvKv(byKey(ev('horde_destroyed'), 'level'))}), dans la base ${lvKv(fromDb(last?.world?.hordesDestroyedByLevel))}.`);
  // question ouverte (E5) : les chefs de chaque niveau de donjon, 1 à 5, même ceux que personne n'a attaqués (un 0 se lit)
  const opened = fromDb(last?.world?.hordesBossByLevel), destroyedDb = fromDb(last?.world?.hordesDestroyedByLevel);
  L.push('', table(['Niveau du donjon', 'Étages du chef ouverts (base)', 'Chefs combattus', 'Battus', 'Repoussés', 'Armées d\'un rassemblement qui bat le chef (médiane)', 'Donjons détruits (base)'], [1, 2, 3, 4, 5].map(l => { const f = fights.filter(e => Number(e.level) === l); return [l, opened[l] || 0, f.length, f.filter(e => e.kind !== 'rally_repelled').length, f.filter(e => e.kind === 'rally_repelled').length, nn(median(armiesBy[l] || [])), destroyedDb[l] || 0]; })));
  end();

  // E6 — site de Merveille réservé
  H('E6. Site de Merveille réservé 6 h à l\'alliance qui l\'a libéré');
  const beatenSites = ev('wonder_site_beaten'), fsent = ev('wonder_found_sent'), cities = ev('wonder_city_founded');
  L.push(`- Sites libérés : ${beatenSites.length} (${kv(byKey(beatenSites, 'alliance'))}). Colons partis : ${fsent.length}, dont ${fsent.filter(e => e.reserved).length} pendant la réservation de leur alliance et ${fsent.filter(e => e.freedBy && !e.reserved).length} sur un site libéré par une autre alliance, après sa réservation ; heures après la bataille (médiane) ${fixed(median(fsent.map(e => e.hoursAfterBattle).filter(x => typeof x === 'number')))}. Colons qui ont attendu la fin de la réservation d'une autre alliance : ${n(won.foundWaitReserve || 0)} fois.`);
  L.push(`- Villes Merveille fondées : ${cities.length} (${cities.map(e => `${e.alliance} jour ${e.day}${e.freedBy ? (e.sameAlliance ? ', site qu\'elle a libéré' : `, site libéré par ${e.freedBy}`) : ''}`).join(' ; ') || '—'}). Refus « Site réservé » : ${n(refusals(/Site réservé/))}.`); end();
}

// ---------- décisions du 2 novembre 2026 (deuxième simulation de 200 jours) : G2 à G12 ----------
// Les nombres qui jugent chaque décision, lus dans les événements des modules (50-war.cjs, 70-wonder.cjs, 60-invasion.cjs),
// les compteurs des joueurs automatiques, les relevés de chaque semaine (checks.cjs : defense, week.combat, week.goldCamps,
// endgame.bastions) et le relevé de l'or (ledger.cjs : income.carried, treasure).
const hoursBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 3600000;
// Mur au début d'un assaut tel que la réparation le prévoit depuis l'assaut d'avant (G2) : les PV qu'il a laissés, réparés en
// ligne droite jusqu'au plein à l'heure que donne le rapport d'avant (wallFullAt) ; null sans ces nombres
function repairedWall(prev, cur) {
  const end = Number(prev.wallHpEnd), max = Number(prev.wallMaxHp);
  if (!Number.isFinite(end) || !Number.isFinite(max) || !prev.assaultAt || !cur.assaultAt) return null;
  if (!prev.wallFullAt) return max;
  const span = Date.parse(prev.wallFullAt) - Date.parse(prev.assaultAt);
  const done = span > 0 ? Math.min(1, Math.max(0, (Date.parse(cur.assaultAt) - Date.parse(prev.assaultAt)) / span)) : 1;
  return end + (max - end) * done;
}
function decisionsG(L, { metrics, events, CALLS, last, bots = [] }) {
  const nn = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : n(x));
  const ev = (kind) => events.filter(e => e.kind === kind);
  const counters = (kind) => lastOf(events, kind)?.counters || {};
  const refusals = (re) => Object.entries(CALLS.refusals || {}).filter(([k]) => re.test(k)).reduce((t, [, v]) => t + v, 0);
  const calls = (route) => Object.values(CALLS.byRoute?.[route] || {}).reduce((t, v) => t + v, 0);
  const H = (title) => L.push(`### ${title}`, '');
  const end = () => L.push('');
  const mil = counters('military_summary'), wk = counters('war_summary');
  const marks = [30, 60, 90, 120, 150, 180, 200].filter(d => d <= (last?.day || 0) + 6);
  const at = (d) => metrics.reduce((best, m) => (Math.abs(m.day - d) < Math.abs((best?.day ?? 1e9) - d) ? m : best), null);

  // G2 — mur du Bastion
  H('G2. Mur du Bastion : 36 000 PV, les dégâts restent, plein 12 h après le dernier');
  const ba = ev('bastion_assault');
  const withWall = ba.filter(e => typeof e.wallHpStart === 'number' && typeof e.wallMaxHp === 'number');
  const worn = withWall.filter(e => e.wallHpStart < e.wallMaxHp - 1), full = withWall.filter(e => e.wallHpStart >= e.wallMaxHp - 1);
  L.push(`- Assauts : ${ba.length} (gagnés ${ba.filter(e => e.won).length}) ; mur plein au début ${full.length} (gagnés ${full.filter(e => e.won).length}, ${pct(full.filter(e => e.won).length, full.length)}), mur usé au début ${worn.length} (gagnés ${worn.filter(e => e.won).length}, ${pct(worn.filter(e => e.won).length, worn.length)}). Mur au plus : ${nn(withWall[0]?.wallMaxHp)} PV.`);
  L.push(`- PV du mur avant l'assaut (médiane) ${nn(median(withWall.map(e => e.wallHpStart)))}, après ${nn(median(withWall.map(e => Number(e.wallHpEnd) || 0)))} ; dégâts d'un assaut (médiane) ${nn(median(nums(ba.map(e => e.wallDamage))))} ; assauts qui ont fait tomber le mur ${withWall.filter(e => Number(e.wallHpEnd) <= 0).length}.`);
  // réparation lue d'un assaut au suivant sur le même Bastion : le mur trouvé au début contre celui que la règle prévoit
  const pairs = [];
  const byB = {};
  for (const e of ba.filter(x => x.assaultAt && (x.bastionId || x.bastion))) (byB[x => x][0] ||= []);
  const groups = {};
  for (const e of ba.filter(x => x.assaultAt)) (groups[e.bastionId || e.bastion] ||= []).push(e);
  for (const list of Object.values(groups)) {
    list.sort((a, b) => Date.parse(a.assaultAt) - Date.parse(b.assaultAt));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i];
      const expected = repairedWall(prev, cur);
      if (expected === null || typeof cur.wallHpStart !== 'number') continue;
      pairs.push({ prev, cur, gapH: hoursBetween(prev.assaultAt, cur.assaultAt), expected, diff: cur.wallHpStart - expected, wornLeft: Number(prev.wallHpEnd) < Number(prev.wallMaxHp) - 1 });
    }
  }
  const inWindow = pairs.filter(p => p.wornLeft && p.prev.wallFullAt && Date.parse(p.cur.assaultAt) < Date.parse(p.prev.wallFullAt));
  L.push(`- Réparation : ${pairs.length} assauts suivis d'un autre sur le même Bastion ; ${inWindow.length} tombés avant la fin de la réparation du précédent (écart médian ${fixed(median(inWindow.map(p => p.gapH)))} h, mur trouvé (médiane) ${nn(median(inWindow.map(p => p.cur.wallHpStart)))} PV) ; écart entre le mur trouvé et la réparation en ligne droite (médiane des écarts absolus) ${nn(median(pairs.map(p => Math.round(Math.abs(p.diff)))))} PV.`);
  const chains = ev('bastion_chain'), chainEnds = ev('bastion_chain_end'), br = ev('bastion_rally');
  const wearRallies = br.filter(e => e.mode === 'mur');
  L.push(`- Chaînes d'assauts : ${chains.length} commencées (${kv(byKey(chains, 'mode'))} ; « mur » : après un assaut repoussé qui a laissé le mur sous 60 %), ${chainEnds.length} finies (${kv(byKey(chainEnds, 'why'))}) ; rassemblements contre un mur usé ${n(wk.chainWornWall || 0)}, dont chaînes d'usure ${wearRallies.length} ; mur le plus bas d'une chaîne (médiane) ${nn(median(nums(chainEnds.map(e => e.lowestWall))))} PV.`);
  const endB = (last?.endgame?.bastions || []).filter(b => b.wallMaxHp);
  if (endB.length) L.push(`- Murs à la fin : ${endB.map(b => `${b.tag} ${b.status} ${n(b.wallHp ?? 0)} / ${n(b.wallMaxHp)} PV${b.wallFullAt ? `, plein le ${b.wallFullAt.slice(0, 16).replace('T', ' ')}` : ''}`).join(' ; ')}.`);
  if (pairs.length) L.push('', table(['Jour', 'Bastion', 'Armées', 'Gagné', 'Écart avec l\'assaut d\'avant (h)', 'Mur laissé avant', 'Mur prévu (réparation)', 'Mur trouvé', 'Mur après', 'Vies'], pairs.slice(-15).map(p => [p.cur.day, p.cur.bastion, p.cur.armies, p.cur.won ? 'oui' : 'non', fixed(p.gapH), p.prev.wallHpEnd, Math.round(p.expected), p.cur.wallHpStart, p.cur.wallHpEnd, p.cur.lives])));
  end();

  // G3 — tous les combats au moteur de bataille
  H('G3. Tous les combats au moteur de bataille (raid arrêté à 30 % de pertes)');
  const cw = {};
  for (const m of metrics) for (const r of m.week?.combat || []) {
    const k = `${r.t}|${r.won ? 1 : 0}`;
    const x = (cw[k] ||= { t: r.t, won: r.won, n: 0, al: 0, dl: 0, alN: 0, dlN: 0, rounds: 0, roundsN: 0 });
    x.n += r.n;
    if (typeof r.al === 'number') { x.al += r.al * r.n; x.alN += r.n; }
    if (typeof r.dl === 'number') { x.dl += r.dl * r.n; x.dlN += r.n; }
    if (typeof r.rounds === 'number') { x.rounds += r.rounds * r.n; x.roundsN += r.n; }
  }
  const cwRows = Object.values(cw).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : b.won - a.won));
  L.push(cwRows.length ? table(['Combat', 'Issue pour l\'attaquant', 'Combats', 'Pertes de l\'attaquant (moyenne)', 'Pertes du défenseur (moyenne)', 'Rounds (moyenne)'], cwRows.map(x => [x.t, x.won ? 'gagné' : 'perdu', x.n, x.alN ? share(x.al / x.alN) : '—', x.dlN ? share(x.dl / x.dlN) : '—', x.roundsN ? fixed(x.rounds / x.roundsN) : '—'])) : 'Aucun combat relevé (relevés d\'avant le 2 novembre 2026).');
  L.push('', '- Un raid s\'arrête quand un camp a perdu 30 % de ses soldats : le perdant d\'un raid perd environ 30 %, le vainqueur moins ; les autres combats jouent tous leurs rounds.'); end();

  // G4 — raids à 100 % de la charge
  H('G4. Raid : jusqu\'à 100 % de la charge des pillards survivants');
  const raids = wk.raidsWonCounted || 0;
  L.push(`- Raids gagnés lus : ${n(raids)} ; butin ${n(wk.raidLoot || 0)} (par raid, moyenne ${raids ? n(Math.round((wk.raidLoot || 0) / raids)) : '—'}) ; charge des survivants (sans bonus de transport) ${n(wk.raidCarry || 0)}, butin / charge ${pct(wk.raidLoot || 0, wk.raidCarry || 0)}.`);
  L.push(`- Ce qui a limité le butin : la charge ${n(wk.raidCarryCapped || 0)} raids, la ville (moitié de ce qui dépasse la cachette) ${n(wk.raidStockCapped || 0)} raids. Stock des villes pillées avant le raid ${n(wk.raidStockBefore || 0)}, butin / stock ${pct(wk.raidLoot || 0, wk.raidStockBefore || 0)}, à l'abri dans la cachette ${pct(wk.raidSheltered || 0, wk.raidStockBefore || 0)}.`);
  L.push(`- Raids lancés par les joueurs automatiques : ${n(wk.raids || 0)} (butin estimé au départ ${n(wk.raidLootEst || 0)}) ; raids des alliances perdus ${n(wk.RAID_lost || 0)}, gagnés ${n(wk.RAID_won || 0)}.`); end();

  // G5 — assaut repoussé jusqu'au dernier soldat
  H('G5. Assaut de Bastion repoussé : jusqu\'au dernier soldat (inchangé)');
  const lostA = ba.filter(e => !e.won), wonA = ba.filter(e => e.won);
  L.push(`- Assauts repoussés : ${lostA.length}, part des assaillants tombés (médiane) ${share(median(nums(lostA.map(e => e.attackerLossRate))))}, soldats engagés (médiane) ${nn(median(nums(lostA.map(e => e.attackers))))} ; assauts gagnés : ${wonA.length}, pertes (médiane) ${share(median(nums(wonA.map(e => e.attackerLossRate))))}.`); end();

  // G6 — vagues toutes les 24 h
  H('G6. Vagues d\'Immortels toutes les 24 h (même force)');
  const waves = ev('wonder_wave');
  const wByCity = {};
  for (const e of waves) (wByCity[e.cityId || e.city || '?'] ||= []).push(e);
  const wRows = Object.entries(wByCity).map(([, list]) => {
    const timed = list.filter(e => e.waveAt).sort((a, b) => Date.parse(a.waveAt) - Date.parse(b.waveAt));
    const gaps = timed.slice(1).map((e, i) => hoursBetween(timed[i].waveAt, e.waveAt));
    const spanD = timed.length > 1 ? hoursBetween(timed[0].waveAt, timed[timed.length - 1].waveAt) / 24 : null;
    return [list[0].alliance || list[0].city || '?', list.length, list.filter(e => e.held).length, list.filter(e => !e.held).length, fixed(median(gaps)), spanD ? fixed((timed.length - 1) / spanD, 2) : '—', share(median(nums(list.map(e => e.postedShare)))), fixed(median(nums(list.map(e => e.ratio))), 2)];
  });
  L.push(`- Vagues : ${waves.length}, tenues ${waves.filter(e => e.held).length}, perdues ${waves.filter(e => !e.held).length}.`);
  if (wRows.length) L.push('', table(['Ville Merveille de', 'Vagues', 'Tenues', 'Perdues', 'Écart entre deux vagues (médiane, h)', 'Vagues par jour', 'Part de l\'alliance postée (médiane)', 'Défense / vague (médiane)'], wRows));
  end();

  // G7 — plans (inchangés, remesurés)
  H('G7. Plans à 5,75 M (inchangés, remesurés après G3)');
  const wr = ev('wonder_rally'), planR = wr.filter(e => e.target === 'PLAN'), taken = ev('wonder_plan_taken');
  const planRep = ev('wonder_rally_repelled').filter(e => e.target === 'PLAN');
  L.push(`- Plans tentés (rassemblements) : ${planR.length} (${kv(byKey(planR, 'alliance'))}), repoussés ${planRep.length}, pris ${taken.length} : ${pct(taken.length, planR.length)} des rassemblements ; puissance du rassemblement / Immortels (médiane) ${fixed(median(planR.map(e => (e.immortals ? e.power / e.immortals : null)).filter(x => typeof x === 'number')), 2)}, armées (médiane) ${nn(median(planR.map(e => e.armies)))}. Sites : rassemblements ${wr.filter(e => e.target === 'WONDER').length}, libérés ${ev('wonder_site_beaten').length}.`); end();

  // G8 — donjons (inchangés, remesurés)
  H('G8. Donjons à 42 % (inchangés, remesurés après G3)');
  const boss = last?.world?.bossFloor || 3;
  const fights = events.filter(e => ['rally_repelled', 'horde_floor_cleared', 'horde_destroyed'].includes(e.kind) && e.floor === boss);
  const players = (e) => Number(e.armies?.length ?? e.armies) || 0;
  L.push(table(['Niveau du donjon', 'Chefs combattus', 'Battus', 'Repoussés', 'Joueurs d\'un rassemblement qui bat le chef (médiane, une armée chacun)', 'Joueurs d\'un rassemblement repoussé (médiane)'], [1, 2, 3, 4, 5].map(l => { const f = fights.filter(e => Number(e.level) === l); const win = f.filter(e => e.kind !== 'rally_repelled'), lose = f.filter(e => e.kind === 'rally_repelled'); return [l, f.length, win.length, lose.length, nn(median(win.map(players))), nn(median(lose.map(players)))]; })));
  end();

  // G9 — échanger des soldats
  H('G9. Échanger des soldats entre deux armées au même endroit');
  L.push(`- Gardes des colonies regarnies par échange : ${n(mil.guardSwaps || 0)} échanges, ${n(mil.guardSwapSoldiers || 0)} soldats donnés (demandés ${n(mil.guardTopUps || 0)}, refusés ${n(mil.guardSwapRefused || 0)}, abandonnés après trois refus ${n(mil.guardSwapGaveUp || 0)}${mil.guardSwapMissing ? `, route absente ${n(mil.guardSwapMissing)}` : ''}) ; armées vidées par l'échange puis dissoutes à la capitale ${n(mil.guardCourierDisbanded || 0)}.`);
  L.push(`- Appels POST /api/army/:id/exchange : ${n(calls('POST /api/army/:id/exchange'))}, refus du serveur ${n(refusals(/\/exchange/))}. Relèves d'avant (nouvelle garde, l'ancienne rentre) : ${n(mil.guardReliefs || 0)} ; renvois à la capitale ${n(mil.guardDetached || 0)}, sans place ${n(mil.guardDetachNoSlot || 0)}.`);
  const cg = last?.map?.colonyGuards;
  if (cg) L.push(`- Gardes rattachées à la fin : ${n(cg.n)} ; garde / part visée (médiane) ${share(cg.ratio)} ; ${n(cg.under50)} sous 50 %, ${n(cg.under30)} sous 30 %, ${n(cg.empty)} vides.`);
  end();

  // G10 — seules les armées défendent
  H('G10. Seules les armées défendent une ville (la réserve ne combat plus)');
  const d = last?.defense;
  if (d) {
    L.push(`- À la fin : capitales défendues par une armée ${n(d.capital?.defended ?? 0)} sur ${n(d.capital?.n ?? 0)}, colonies ${n(d.colony?.defended ?? 0)} sur ${n(d.colony?.n ?? 0)} ; soldats qui défendent (capitales) ${n(d.capital?.defending ?? 0)}, en réserve ${n(d.capital?.reserve ?? 0)} ; part des soldats d'un joueur en réserve (médiane) ${share(d.reserveShare)} ; armées « Défense » ${n(d.defenseArmies)} (${n(d.defenseSoldiers)} soldats).`);
    const dRows = [...new Set(marks.map(x => at(x)).filter(m => m?.defense))].map(m => [m.day, `${m.defense.capital?.defended ?? 0} / ${m.defense.capital?.n ?? 0}`, `${m.defense.colony?.defended ?? 0} / ${m.defense.colony?.n ?? 0}`, m.defense.capital?.defending ?? 0, m.defense.capital?.reserve ?? 0, share(m.defense.reserveShare), m.defense.defenseArmies, m.defense.defenseSoldiers]);
    if (dRows.length) L.push('', table(['Jour', 'Capitales défendues', 'Colonies défendues', 'Soldats qui défendent les capitales', 'Soldats en réserve', 'Part en réserve (médiane)', 'Armées « Défense »', 'Leurs soldats'], dRows), '');
  } else L.push('- Pas de relevé des défenseurs (relevés d\'avant le 2 novembre 2026).');
  L.push(`- Raids qui n'ont trouvé aucune armée dans la ville : ${n(wk.raidNoDefender || 0)} gagnés, ${n(wk.raidNoDefenderLost || 0)} perdus ; attaques de siège sans défenseur : ${n(wk.attackNoDefender_won || 0)} gagnées, ${n(wk.attackNoDefender_lost || 0)} perdues.`);
  L.push(`- Armées « Défense » (joueurs automatiques) : ${n(mil.defenseCreated || 0)} formées, ${n(mil.defenseFills || 0)} fois regarnies (${n(mil.defenseSoldiers || 0)} soldats pris dans la réserve), ${n(mil.defenseNoSlot || 0)} fois sans place à la capitale, ${n(mil.defenseWaitSoldiers || 0)} fois sans soldats.`); end();

  // G11 — camps d'or
  H('G11. Camps d\'or (mesure avant décision)');
  const gold = {};
  for (const m of metrics) for (const r of m.week?.goldCamps || []) gold[r.result] = (gold[r.result] || 0) + r.n;
  const lg = last?.ledger;
  const nPlayers = bots.length || last?.players?.length || 0;
  const days = last?.day || 0;
  const carried = lg?.income?.carried;
  const income = lg ? Object.values(lg.income || {}).reduce((t, v) => t + (Number(v) || 0), 0) : null;
  L.push(`- Attaques de camps d'or (rapports de bataille) : ${n((gold.WIN || 0) + (gold.LOSE || 0))} (gagnées ${n(gold.WIN || 0)}, perdues ${n(gold.LOSE || 0)}) ; envois des joueurs automatiques ${n(mil.goldCampRaids || 0)}, or vu dans le camp au départ ${n(mil.goldCampExpected || 0)}, or vu rapporté ${n(mil.goldCampGold || 0)}.`);
  L.push(`- Or rapporté par les armées (mesuré aux étapes du tick) : ${typeof carried === 'number' ? n(carried) : 'non mesuré'}${typeof carried === 'number' && nPlayers && days ? `, soit ${fixed(carried / nPlayers / days, 2)} or par joueur et par jour` : ''} ; toutes sources : ${income !== null && nPlayers && days ? `${fixed(income / nPlayers / days, 1)} or par joueur et par jour` : '—'}.`); end();

  // G12 — trésor des invasions
  H('G12. Trésor des invasions : stock commun, ce qui ne tient nulle part en points d\'alliance');
  const t = lg?.treasure;
  if (t && t.shares) {
    L.push(`- Parts du trésor : ${n(t.shares)} (points d'alliance de la part : ${n(t.shareAp)}) ; ressources données ${n(t.given)}, sans place dans aucune ville ${n(t.lost)} (${pct(t.lost, t.given)}, ${n(t.lostShares)} parts).`);
    L.push(`- Points d'alliance donnés pour ce qui n'a pas tenu : ${n(t.overflowAp)} (${n(t.overflowShares)} parts ; plafonnés à 2 fois ceux de la part ${n(t.capped)} fois) ; ressources vraiment perdues (moins de 1 000, ou au-delà du plafond) ${n(t.unconverted)} (${pct(t.unconverted, t.given)} du trésor).${t.from ? ' Mesuré depuis le début de cette mesure dans la partie.' : ''}`);
  } else L.push('- Aucune part du trésor lue (pas de donjon détruit, ou relevé d\'avant le 2 novembre 2026).');
  end();
}

module.exports = { write, isNoise, dropReplays, repairedWall };
