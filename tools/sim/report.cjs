// Rapport de la simulation longue (tools/sim/sim.cjs) : RAPPORT.md à partir de l'état, des mesures et des événements.
// Décisions du 31 octobre 2026 (rapport de vérification) : une section par décision à juger (carte et colonies, or,
// cachette, échanges par armée, rassemblements, Bastion, Merveille, invasions, quêtes), lue dans les mesures de chaque
// semaine (checks.cjs, ledger.cjs) et les événements des modules.
// Analyse de la simulation du 1er novembre 2026 : les échanges entre joueurs, les offres expirées et les caravanes se lisent
// dans les compteurs des joueurs automatiques (le jeu efface les offres conclues après 30 jours) ; la Chambre au Trésor
// est mesurée à chaque tick ; colonies sans garde à la fin ; garnisons des Bastions sans les armées vides, vies remontées ;
// camps devant un Bastion un combat par ligne ; chefs des donjons combattus et donjons détruits par niveau ; rythme de la
// simulation (pas qui pressent, ticks d'une heure en plus).
'use strict';
const fs = require('fs');

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
  const metrics = readLines(FILES.metrics), events = readLines(FILES.events).map(normalize);
  const CALLS = live?.CALLS || state.calls || { total: 0, byRoute: {}, fails: [], refusals: {} };
  const ERRORS = live?.ERRORS || state.errors || [];
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
  if (last) L.push(`Fin : ${last.world.cities} villes (${last.world.colonies} colonies), Merveille niveau ${last.world.wonder}, invasions ${last.world.invasions}, donjons détruits ${last.world.hordesDestroyed} (vivants dans l'invasion en cours : ${last.world.hordesAlive}), Bastions ${(last.world.bastions || []).map(b => `${b.status} ${b.n}`).join(', ') || 'aucun'}, médailles ${last.world.medals}`);
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
  decisions(L, { metrics, events, CALLS, first: metrics[0], last, startMs: state.startMs });
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

// ---------- les décisions du 31 octobre 2026 ----------
function decisions(L, { metrics, events, CALLS, first, last, startMs }) {
  const refusals = (re) => Object.entries(CALLS.refusals || {}).filter(([k]) => re.test(k)).reduce((t, [, v]) => t + v, 0);
  const ev = (kind) => events.filter(e => e.kind === kind);
  L.push('## Décisions du 31 octobre 2026 : ce que la simulation en montre', '');

  // carte, côtés, colonies (D1, D2, D12)
  L.push('### Carte, côtés, colonies (D1, D2, D12)', '');
  const reg = ev('registered');
  const sides = {};
  for (const e of reg) { const k = `${e.asked} → ${e.side || '?'}`; sides[k] = (sides[k] || 0) + 1; }
  L.push(`- Carte : ${n(last?.map?.size) || '?'} × ${n(last?.map?.size) || '?'}. Côtés à l'inscription (demandé → obtenu) : ${kv(sides)}. Capitales par côté à la fin : ${kv(last?.map?.capitalsBySide)}.`);
  L.push(`- Gisements où une colonie peut encore être fondée : ${n(first?.map?.foundable?.total)} au début (niveaux ${kv(first?.map?.foundable?.byLevel)}), ${n(last?.map?.foundable?.total)} à la fin (niveaux ${kv(last?.map?.foundable?.byLevel)}).`);
  const perPlayer = Object.entries(last?.map?.coloniesPerPlayer || {}).map(([k, v]) => `${n(v)} avec ${k} colonie${Number(k) > 1 ? 's' : ''}`).join(', ') || '—';
  const siteLevels = Object.entries(last?.map?.colonySiteLevels || {}).map(([k, v]) => `niveau ${k} : ${n(v)}`).join(', ') || '—';
  L.push(`- Joueurs à la fin : ${perPlayer}. Gisement des colonies debout : ${siteLevels}.`);
  const fallen = ev('city_fallen');
  L.push(`- Villes tombées : ${fallen.length} (${kv(fallen.reduce((o, e) => { o[e.fate || '?'] = (o[e.fate || '?'] || 0) + 1; return o; }, {}))}). Refus « Colonie protégée » (72 h) : ${n(refusals(/Colonie protégée/))} ; raids écartés d'eux-mêmes pour une colonie protégée : ${n(lastOf(events, 'war_summary')?.counters?.raidSkipProtected || 0)}.`);
  const mil = lastOf(events, 'military_summary')?.counters || {};
  L.push(`- Gardes des colonies (D18) : ${n(mil.guardsCreated || 0)} formées, ${n(mil.guardsPosted || 0)} départs vers une colonie, ${n(mil.guardRefills || 0)} retours pour se regarnir, ${n(mil.guardNoSlot || 0)} fois sans place à la Place de rassemblement.`);
  const ug = last?.map?.unguarded;
  if (ug) L.push(`- Colonies sans garde en poste à la fin (jour ${last.day}) : ${n(ug.n)} sur ${n(ug.of ?? last.world?.colonies ?? '?')}${ug.n ? ` — ${ug.list.join(', ')}` : ''}.`);
  L.push('');

  // or (D4, D5, D17)
  L.push('### Or (D4, D5, D17)', '');
  const marks = [30, 60, 90, 120, 150, 180, 365, 730].filter(d => d <= (last?.day || 0) + 6);
  const at = (d) => metrics.reduce((best, m) => (Math.abs(m.day - d) < Math.abs((best?.day ?? 1e9) - d) ? m : best), null);
  const rowsGold = [...new Set(marks.map(d => at(d)).filter(m => m?.ledger))].map(m => [m.day, m.ledger.income.treasury, m.ledger.income.expeditions, m.ledger.income.invasion, m.ledger.income.other, m.ledger.spent.elite, m.ledger.spent.instantHeal, m.ledger.spent.spies + m.ledger.spent.talents, m.ledger.goldNow]);
  L.push(rowsGold.length ? table(['Jour', 'Chambre au Trésor', 'Expéditions (héros)', 'Trésor des invasions', 'Autres sources', 'Élites', 'Soins à l\'or', 'Espions et talents', 'Or des joueurs'], rowsGold) : 'Pas de relevé.');
  const lg = last?.ledger;
  if (lg) L.push('', `Expéditions finies : ${n(lg.expeditions.done)}, dont ${n(lg.expeditions.withGold)} avec de l'or (seules celles menées par le héros en rapportent). Donjons détruits : ${kv(lg.invasionDestroyed)}. Cumuls depuis le début, tous joueurs. Chambre au Trésor : l'or versé à chaque tick, mesuré (avant le 1er novembre 2026 : estimé d'après le niveau du jour, un peu trop haut les jours d'amélioration). « Autres sources » : la variation de l'or moins ce qui est compté (camps d'or, défi, remboursements…).`);
  L.push('');

  // cachette (D15)
  L.push('### Cachette (D15)', '');
  const wk = lastOf(events, 'war_summary')?.counters || {};
  L.push(`- Raids gagnés lus : ${n(wk.raidsWonCounted || 0)}. Stock des villes pillées avant le raid : ${n(wk.raidStockBefore || 0)} ; à l'abri dans la cachette : ${n(wk.raidSheltered || 0)} (${wk.raidStockBefore ? Math.round(100 * wk.raidSheltered / wk.raidStockBefore) : 0} %) ; butin : ${n(wk.raidLoot || 0)}. Niveau moyen de la cachette pillée : ${wk.raidsWonCounted ? (wk.raidHideoutLevels / wk.raidsWonCounted).toFixed(1) : '—'} (par niveau : ${kv(Object.fromEntries(Object.entries(wk).filter(([k]) => k.startsWith('raidHideout_')).map(([k, v]) => [k.slice(12), v])))}).`);
  L.push(`- Cachettes à la fin : capitales ${kv(last?.totals?.hideout?.capital)} ; colonies ${kv(last?.totals?.hideout?.colony)}.`, '');

  // échanges entre joueurs par armée (D7, D8)
  L.push('### Échanges entre joueurs par armée (D7, D8)', '');
  // compteurs des joueurs automatiques (40-market.cjs) : le jeu efface les offres conclues après 30 jours, la base ne les
  // compte plus à la fin. Un échange accepté = un échange conclu ; volume : ce que l'acheteur reçoit et ce qu'il paie.
  const mk = lastOf(events, 'market_summary');
  if (mk) {
    const k = mk.counters || {};
    const paid = k.paidVolume === undefined ? '' : ` + ${n(k.paidVolume)} payées`;
    L.push(`- Échanges conclus : ${n(k.accepted || 0)} pour ${n(k.boughtVolume || 0)} ressources vendues${paid} (compteurs des joueurs automatiques) ; offres expirées : ${n(k.expired || 0)}.`);
    L.push(`- Offres publiées ${n(k.posted || 0)} (caravane réservée, statut MARKET), acceptées ${n(k.accepted || 0)} (dont ${n(k.acceptBorrowedArmy || 0)} portées par une autre armée que la caravane, ${n(k.acceptAlly || 0)} d'un membre de l'alliance), prises par un autre au même instant ${n(k.acceptRaced || 0)}, retirées ${n((k.cancelStale || 0) + (k.cancelChanged || 0))}, expirées ${n(k.expired || 0)}.`);
    L.push(`- Envois à un allié : ${n(k.aidSent || 0)} (${n(k.aidVolume || 0)} ressources) ; marchand du serveur : ${n(k.npcTrades || 0)} échanges. Caravanes formées : ${n(k.caravans || 0)} (${n(mk.caravans || 0)} à la fin) ; armées qui attendent avec une offre : ${n(mk.armiesWaiting || 0)}, en livraison : ${n(mk.armiesDelivering || 0)}.`);
  } else L.push('- Pas de point d\'étape du marché.');
  L.push(`- Refus « Vos villes partagent leur stock » : ${n(refusals(/partagent leur stock/))} ; refus « Armée réservée pour une offre du marché » : ${n(refusals(/réservée pour une offre/))}.`, '');

  // rassemblements (D3)
  L.push('### Rassemblements (D3)', '');
  const ral = {};
  for (const r of last?.endgame?.rallies || []) { const k = `${r.kind} ${r.wait} min`; ral[k] = (ral[k] || 0) + r.n; }
  L.push(Object.keys(ral).length ? table(['Cible et attente', 'Rassemblements'], Object.entries(ral).sort((a, b) => b[1] - a[1])) : 'Aucun.', '');

  // Bastion (D9)
  L.push('### Bastion (D9)', '');
  const br = ev('bastion_rally'), ba = ev('bastion_assault');
  L.push(`- Rassemblements contre un Bastion : ${br.length} ; armées par rassemblement (médiane) ${n(median(br.map(e => e.armies)))}, engins (médiane) ${n(median(br.map(e => e.engines)))}, attente (médiane) ${n(median(br.map(e => e.wait)))} min, dégâts au mur attendus sans garnison (médiane) ${n(median(br.map(e => e.wallDamageEstimate)))} sur ${n(br[0]?.wallHp)}.`);
  L.push(`- Assauts livrés : ${ba.length}, gagnés ${ba.filter(e => e.won).length} ; armées par assaut (médiane) ${n(median(ba.map(e => e.armies)))} ; dégâts au mur (médiane) ${n(median(ba.map(e => e.wallDamage).filter(x => x !== null)))} ; garnison restée après l'assaut (médiane) ${n(median(ba.map(e => e.garrisonAfter).filter(x => x !== null)))} armées. Bastions rasés : ${ev('bastion_destroyed').length}.`);
  if (ba.length) L.push('', table(['Jour', 'Assaillants', 'Bastion', 'Armées', 'Gagné', 'Mur avant', 'Mur après', 'Vies', 'Défenseurs', 'Garnison après'], ba.slice(-15).map(e => [e.day, String(e.by || '').slice(0, 40), e.bastion, e.armies, e.won ? 'oui' : 'non', e.wallHpStart, e.wallHpEnd, e.lives, e.defenders ?? '', e.garrisonAfter])));
  // chaînes d'assauts (50-war.cjs) : commencées par un assaut gagné, finies par un assaut repoussé ou le Bastion rasé
  const chains = ev('bastion_chain'), chainEnds = ev('bastion_chain_end');
  if (chains.length || chainEnds.length) L.push('', `- Chaînes d'assauts : ${chains.length} commencées, ${chainEnds.length} finies (${kv(byKey(chainEnds, 'why'))}) ; rassemblements par chaîne (médiane) ${n(median(chainEnds.map(e => e.rallies || 0)))}, vies les plus basses (médiane) ${n(median(chainEnds.map(e => e.lowestLives).filter(x => x !== null && x !== undefined)))}.`);
  // camps brisés : un combat par ligne, lu dans les rapports de bataille de chaque semaine (checks.cjs bastionBreaks) ;
  // envois des joueurs automatiques : pour briser le camp seule (break), pour l'user (wear), sorties de la garnison
  const sent = ev('bastion_break_sent');
  const sentBy = sent.reduce((o, e) => { const k = e.sortie ? 'sortie' : e.mode || 'envoi'; o[k] = (o[k] || 0) + (e.armies || 1); return o; }, {});
  L.push('', `- Camps devant un Bastion attaqués (mission BREAK) : ${sent.length} tours d'envoi, ${n(Object.values(sentBy).reduce((t, v) => t + v, 0))} armées (${kv(sentBy)}). Refus « Garnison du Bastion complète » : ${n(refusals(/Garnison du Bastion complète/))}.`);
  const breaks = metrics.flatMap(m => m.week?.bastionBreaks || []);
  if (metrics.some(m => Array.isArray(m.week?.bastionBreaks))) {
    const dayOf = (at) => (startMs ? Math.floor((Date.parse(at) - startMs) / 86400000) : '?');
    L.push(`- Combats contre un camp (un par armée, rapports de bataille) : ${breaks.length}, camp brisé ${breaks.filter(b => b.won).length}, repoussés ${breaks.filter(b => !b.won).length} ; puissance de l'armée / du camp (médiane) ${median(breaks.map(b => (b.dp ? b.ap / b.dp : 0)))?.toFixed(2) ?? '—'}.`);
    if (breaks.length) L.push('', table(['Jour', 'Bastion', 'Armée de', 'Camp', 'Puissance armée', 'Puissance camp', 'Camp brisé'], breaks.slice(-15).map(b => [dayOf(b.at), b.tag, b.by, String(b.camp || '').slice(0, 40), b.ap, b.dp, b.won ? 'oui' : 'non'])), '');
  } else L.push(`- Combats contre un camp (compteurs des joueurs automatiques, plusieurs combats d'un même tick comptés une fois) : gagnés ${n(wk.bastionBreak_won || 0)}, perdus ${n(wk.bastionBreak_lost || 0)}.`);
  L.push(`- Garnisons à la fin : ${(last?.endgame?.bastions || []).map(b => `${b.tag} ${b.status} ${b.garrison} armées${b.soldiers !== undefined ? ` (${n(b.soldiers)} soldats postés)` : ''}, ${b.lives} vies`).join(' ; ') || 'aucun Bastion'}.`, '');

  // Merveille (D10, D11)
  L.push('### Merveille (D10, D11)', '');
  const wr = ev('wonder_rally'), sum = lastOf(events, 'wonder_summary');
  L.push(`- Colons du fondateur : ${ev('wonder_settler').length}. Rassemblements contre les Immortels : ${wr.length} (sites ${wr.filter(e => e.target === 'WONDER').length}, plans ${wr.filter(e => e.target === 'PLAN').length}, dont ${wr.filter(e => e.wear).length} pour les user) ; armées (médiane) ${n(median(wr.map(e => e.armies)))}, puissance du rassemblement / Immortels (médiane) ${median(wr.map(e => e.immortals ? e.power / e.immortals : 0))?.toFixed(2) ?? '—'}.`);
  L.push(`- Sites libérés : ${ev('wonder_site_beaten').length} (premier au jour ${ev('wonder_site_beaten')[0]?.day ?? '—'}) ; Villes Merveille fondées : ${ev('wonder_city_founded').length} (${ev('wonder_city_founded').map(e => `${e.alliance} jour ${e.day}`).join(', ') || '—'}) ; plans pris : ${ev('wonder_plan_taken').length} (${ev('wonder_plan_taken').map(e => `${e.alliance} jour ${e.day}`).join(', ') || '—'}) ; rassemblements repoussés : ${ev('wonder_rally_repelled').length}.`);
  const lv = ev('wonder_level');
  L.push(`- Niveaux (jour atteint) : ${lv.map(e => `${e.alliance} ${e.level} (j${e.day})`).join(', ') || '—'}. Niveaux à la fin : ${(last?.endgame?.wonders || []).map(w => `${w.tag || '?'} ${w.level}`).join(', ') || '—'}.`);
  if (sum) {
    const k = sum.counters || {}, w = sum.world || {};
    L.push(`- Livraisons par armée : ${n(k.deliveries || 0)} convois, ${n(k.delivered || 0)} ressources (caravane ${n(k.deliveredByCaravan || 0)}, convoi ${n(k.deliveredByConvoy || 0)}, armée de campagne ${n(k.deliveredByFieldArmy || 0)}) ; niveaux lancés ${n(k.levelsStarted || 0)} ; attentes du stock ${n(k.buildWaitStock || 0)}, d'un plan ${n(k.buildWaitPlan || 0)}.`);
    L.push(`- Vagues d'Immortels : tenues ${n(w.wavesHeld || 0)}, perdues ${n(w.wavesLost || 0)} (niveaux perdus ${n(w.levelsLost || 0)}) ; gardes de la Merveille envoyées ${n(k.guardsSent || 0)} (Ost prêté ${n(k.ostToWonder || 0)}, sans place ${n(k.guardNoSlot || 0)}).`);
  }
  L.push('');

  // invasions (D11, D17)
  L.push('### Invasions (D11, D17)', '');
  const inv = lastOf(events, 'invasion_summary');
  if (inv) {
    const w = inv.world || {}, b = inv.bots || {};
    const by = (re) => Object.fromEntries(Object.entries(w).filter(([k]) => re.test(k)).map(([k, v]) => [k.replace(re, 'niveau '), v]));
    L.push(`- Étages battus par niveau : ${kv(by(/^floorsL/))} ; donjons détruits par niveau : ${kv(by(/^destroyedL/))} ; étages usés (rassemblement d'usure repoussé, pertes gardées) : ${kv(by(/^woreL/))}.`);
    L.push(`- Rassemblements lancés ${n(b.launched || 0)} (pour user un étage ${n(b.launchedToWear || 0)}), armées envoyées ${n(b.joined || 0)}, repoussés ${n(w.repelled || 0)} ; attentes : ${kv(Object.fromEntries(Object.entries(b).filter(([k]) => /^wait\d+$/.test(k)).map(([k, v]) => [`${k.slice(4)} min`, v])))}.`);
    L.push(`- Trésor : ${n(w.treasureGold || 0)} or, ${n(w.treasureRes || 0)} de chaque ressource (par donjon détruit, avant partage).`);
  } else L.push('Pas de point d\'étape des invasions.');
  // chefs (dernier étage) : combats des rassemblements des joueurs automatiques, par niveau du donjon ; donjons détruits par
  // niveau (événements et base) ; étages du chef ouverts (base, toutes invasions)
  const boss = last?.world?.bossFloor || 3;
  const lvKv = (o) => kv(Object.fromEntries(Object.entries(o).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => [`niveau ${k}`, v])));
  const fights = events.filter(e => ['rally_repelled', 'horde_floor_cleared', 'horde_destroyed'].includes(e.kind) && e.floor === boss);
  const destroyed = ev('horde_destroyed');
  const fromDb = (rows) => Object.fromEntries((rows || []).map(r => [r.level, r.n]));
  L.push(`- Chefs (étage ${boss}) combattus : ${fights.length} (${lvKv(byKey(fights, 'level'))}), battus ${fights.filter(e => e.kind !== 'rally_repelled').length} (${lvKv(byKey(fights.filter(e => e.kind !== 'rally_repelled'), 'level'))}) ; étages du chef ouverts (base) : ${lvKv(fromDb(last?.world?.hordesBossByLevel))}.`);
  L.push(`- Donjons détruits par niveau : ${destroyed.length} par les rassemblements (${lvKv(byKey(destroyed, 'level'))}) ; dans la base : ${lvKv(fromDb(last?.world?.hordesDestroyedByLevel))}.`);
  L.push('');

  // quêtes
  L.push('### Quêtes', '');
  const q = lastOf(events, 'quest_summary')?.counters || {};
  L.push(`- Récompenses prises : ${n(last?.totals?.quests || 0)} (tâches ${n(q.claimed_task || 0)}, tutoriel ${n(q.claimed_tutorial || 0)}, jour ${n(q.claimed_daily || 0)}, semaine ${n(q.claimed_weekly || 0)}, succès ${n(q.claimed_achievement || 0)}), ${n(q.volume || 0)} ressources ; attentes faute de place : ${n(q.waitRoom || 0)}.`, '');
}

module.exports = { write };
