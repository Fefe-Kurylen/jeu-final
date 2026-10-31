// Rapport de la simulation longue (tools/sim/sim.cjs) : RAPPORT.md à partir de l'état, des mesures et des événements.
'use strict';
const fs = require('fs');

const readLines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []);
const n = (x) => (typeof x === 'number' ? x.toLocaleString('fr-FR') : x ?? '');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.map(n).join(' | ')} |`)].join('\n');

function write(FILES, live) {
  const state = fs.existsSync(FILES.state) ? JSON.parse(fs.readFileSync(FILES.state, 'utf8')) : {};
  const metrics = readLines(FILES.metrics), events = readLines(FILES.events);
  const CALLS = live?.CALLS || state.calls || { total: 0, byRoute: {}, fails: [], refusals: {} };
  const ERRORS = live?.ERRORS || state.errors || [];
  const last = metrics[metrics.length - 1];
  const days = last?.day || 0;
  const L = [];
  L.push(`# Simulation longue — rapport`, '');
  L.push(`- Durée simulée : **${days} jours** (${(days / 365).toFixed(1)} ans), pas de ${state.opt?.stepHours || '?'} h, ${state.bots?.length || '?'} joueurs automatiques`);
  L.push(`- Appels au serveur : ${n(CALLS.total)} ; erreurs serveur (5xx) : **${CALLS.fails.length}** ; erreurs écrites par le serveur : **${n(ERRORS.reduce((t, e) => t + e.count, 0))}**`);
  const worlds = [...new Set(metrics.map(m => m.world?.worldNumber))].filter(Boolean);
  L.push(`- Mondes joués : ${worlds.join(', ') || '1'}`, '');

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
  const weeks = Math.max(1, metrics.length);
  const avgW = (k) => Math.round(metrics.reduce((t, m) => t + (m.week?.[k] || 0), 0) / weeks * 10) / 10;
  L.push(table(['Système', 'Par semaine'], [
    ...Object.entries(sumBy).sort((a, b) => b[1] - a[1]).map(([t, v]) => [`Combats ${t}`, Math.round(v / weeks * 10) / 10]),
    ['Échanges au marché', avgW('trades')], ['Rapports d\'espions', avgW('spyReports')], ['Messages', avgW('chat')], ['Aides d\'alliance', avgW('helps')], ['Quêtes réclamées', avgW('quests')], ['Expéditions terminées', avgW('expeditions')]
  ]));
  const rallies = {};
  for (const m of metrics) for (const r of m.week?.rallies || []) rallies[r.status] = (rallies[r.status] || 0) + r.n;
  L.push('', `Rassemblements : ${Object.entries(rallies).map(([k, v]) => `${k} ${v}`).join(', ') || 'aucun'}`);
  if (last) L.push(`Fin : ${last.world.cities} villes (${last.world.colonies} colonies), Merveille niveau ${last.world.wonder}, invasions ${last.world.invasions}, donjons détruits ${last.world.hordesDestroyed}, Bastions ${(last.world.bastions || []).map(b => `${b.status} ${b.n}`).join(', ') || 'aucun'}, médailles ${last.world.medals}`);
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

module.exports = { write };
