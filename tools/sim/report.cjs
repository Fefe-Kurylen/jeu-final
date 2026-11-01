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
  decisions(L, { metrics, events, CALLS, first: metrics[0], last, startMs: state.startMs, bots: state.bots || [] });
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
const fixed = (x, d = 1) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const lvKv = (o) => kv(Object.fromEntries(Object.entries(o || {}).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => [`niveau ${k}`, v])));
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
  const won = wsum?.counters || {}, wonW = wsum?.world || {};
  const lg = last?.ledger;
  const H = (title) => L.push(`### ${title}`, '');
  const end = () => L.push('');
  L.push('## Décisions : ce que la simulation en montre', '', 'Une section par décision (D1 à D19 : 31 octobre 2026, rapport de vérification ; E1 à E6 : 1er novembre 2026, simulation de 200 jours).', '');

  // D1 — carte et gisements
  H('D1. Carte et gisements pour 2 000 joueurs');
  L.push(`- Carte : ${n(last?.map?.size) || '?'} × ${n(last?.map?.size) || '?'}. Gisements où une colonie peut encore être fondée : ${n(first?.map?.foundable?.total)} au début (${lvKv(first?.map?.foundable?.byLevel)}), ${n(last?.map?.foundable?.total)} à la fin (${lvKv(last?.map?.foundable?.byLevel)}).`);
  const perPlayer = Object.entries(last?.map?.coloniesPerPlayer || {}).map(([k, v]) => `${n(v)} avec ${k} colonie${Number(k) > 1 ? 's' : ''}`).join(', ') || '—';
  L.push(`- Joueurs à la fin : ${perPlayer} ; colonies debout : ${n(last?.world?.colonies ?? 0)} (gisements : ${lvKv(last?.map?.colonySiteLevels)}).`); end();

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
  const rowsGold = [...new Set(marks.map(d => at(d)).filter(m => m?.ledger))].map(m => [m.day, m.ledger.income.treasury, m.ledger.income.expeditions, m.ledger.income.invasion, m.ledger.income.other, m.ledger.spent.elite, m.ledger.spent.instantHeal, m.ledger.spent.spies + m.ledger.spent.talents, m.ledger.goldNow]);
  L.push(rowsGold.length ? table(['Jour', 'Chambre au Trésor', 'Expéditions (héros)', 'Trésor des invasions', 'Autres sources', 'Élites', 'Soins à l\'or', 'Espions et talents', 'Or des joueurs'], rowsGold) : 'Pas de relevé de l\'or.');
  const hero = counters('hero_summary');
  if (lg) L.push('', `- Expéditions finies : ${n(lg.expeditions.done)}, dont ${n(lg.expeditions.withGold)} avec de l'or (${pct(lg.expeditions.withGold, lg.expeditions.done)}) ; expéditions lancées par les joueurs automatiques : ${n(hero.exp || 0)} (gardées pour la Merveille : ${n(hero.expKeptForWonder || 0)}, pour un assaut de Bastion : ${n(hero.expKeptForMuster || 0)}). Cumuls depuis le début, tous joueurs ; « Autres sources » : la variation de l'or moins ce qui est compté (camps d'or, défi, remboursements…).`);
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
  const taxes = bots.map(b => b.mem?.mkt?.taxPct).filter(x => typeof x === 'number');
  L.push(`- Taxe vue par les vendeurs à la publication : médiane ${nn(median(taxes))} % (de ${n(taxes.length ? Math.min(...taxes) : null)} à ${n(taxes.length ? Math.max(...taxes) : null)} %). Reçu par les acheteurs : ${n(mk.receivedFromSeller || 0)} sur ${n(mk.boughtVolume || 0)} vendus (${pct(mk.receivedFromSeller || 0, mk.boughtVolume || 0)}) ; reçu par les vendeurs : ${n(mk.deliveredToSeller || 0)}${mk.paidVolume === undefined ? '' : ` sur ${n(mk.paidVolume)} payés (${pct(mk.deliveredToSeller || 0, mk.paidVolume)})`}.`); end();

  // D9 — Bastion
  H('D9. Bastion : un assaut = un rassemblement, garnison de 10, mur × 3');
  const br = ev('bastion_rally'), ba = ev('bastion_assault');
  L.push(`- Rassemblements contre un Bastion : ${br.length} ; armées par rassemblement (médiane) ${nn(median(br.map(e => e.armies)))}, engins (médiane) ${nn(median(br.map(e => e.engines)))}, attente (médiane) ${nn(median(br.map(e => e.wait)))} min, dégâts au mur attendus sans garnison (médiane) ${nn(median(br.map(e => e.wallDamageEstimate)))} sur ${n(br[0]?.wallHp)}.`);
  L.push(`- Assauts livrés : ${ba.length}, gagnés ${ba.filter(e => e.won).length} ; armées par assaut (médiane) ${nn(median(ba.map(e => e.armies)))} ; dégâts au mur (médiane) ${nn(median(ba.map(e => e.wallDamage).filter(x => x !== null && x !== undefined)))} ; garnison restée après l'assaut (médiane, armées avec des soldats) ${nn(median(ba.map(e => e.garrisonAfter).filter(x => x !== null && x !== undefined)))}. Bastions rasés : ${ev('bastion_destroyed').length}.`);
  if (ba.length) L.push('', table(['Jour', 'Assaillants', 'Bastion', 'Armées', 'Gagné', 'Mur avant', 'Mur après', 'Vies', 'Défenseurs', 'Garnison après'], ba.slice(-15).map(e => [e.day, String(e.by || '').slice(0, 40), e.bastion, e.armies, e.won ? 'oui' : 'non', e.wallHpStart, e.wallHpEnd, e.lives, e.defenders ?? '', e.garrisonAfter])), '');
  L.push(`- Garnisons (joueurs automatiques) : ${n(mem('al.garrisons'))} envois, ${n(mem('al.garrisonSoldiers'))} soldats ; ${n(mem('al.refills'))} retours pour se regarnir après un assaut, ${n(mem('al.relief'))} relèves en tout ; ${n(mem('al.foodWait'))} recrues remises faute de céréales. Refus « Garnison du Bastion complète » : ${n(refusals(/Garnison du Bastion complète/))}.`);
  L.push(`- Garnisons à la fin : ${(last?.endgame?.bastions || []).map(b => `${b.tag} ${b.status} ${b.garrison} armées${b.soldiers !== undefined ? ` (${n(b.soldiers)} soldats postés)` : ''}, ${b.lives} vies`).join(' ; ') || 'aucun Bastion'}.`); end();

  // D10, D11 — Merveille et fin de partie
  H('D10. Merveille à moitié prix');
  const lv = ev('wonder_level');
  L.push(`- Niveaux (jour atteint) : ${lv.map(e => `${e.alliance} ${e.level} (j${e.day})`).join(', ') || '—'}. Niveaux à la fin : ${(last?.endgame?.wonders || []).map(w => `${w.tag || '?'} ${w.level}`).join(', ') || '—'}.`);
  if (wsum) L.push(`- Livraisons par armée : ${n(won.deliveries || 0)} convois, ${n(won.delivered || 0)} ressources (bois ${n(won.delivered_wood || 0)}, pierre ${n(won.delivered_stone || 0)}, fer ${n(won.delivered_iron || 0)}, céréales ${n(won.delivered_food || 0)}) ; caravane ${n(won.deliveredByCaravan || 0)}, convoi ${n(won.deliveredByConvoy || 0)}, armée de campagne ${n(won.deliveredByFieldArmy || 0)} ; niveaux lancés ${n(won.levelsStarted || 0)} ; attentes du stock ${n(won.buildWaitStock || 0)}, d'un plan ${n(won.buildWaitPlan || 0)} ; livraisons remises pendant qu'un assaut de Bastion se prépare ${n(won.deliverMuster || 0)} ; stock des chantiers à la fin : ${(wsum.wonders || []).map(w => `${w.alliance || '?'} ${n(w.stock)}`).join(', ') || '—'}.`);
  end();
  H('D11. Fin de partie pour des alliances de 15 à 20 joueurs');
  const wr = ev('wonder_rally');
  L.push(`- Rassemblements contre les Immortels : ${wr.length} (sites ${wr.filter(e => e.target === 'WONDER').length}, plans ${wr.filter(e => e.target === 'PLAN').length}, dont ${wr.filter(e => e.wear).length} pour les user) ; armées (médiane) ${nn(median(wr.map(e => e.armies)))} ; puissance du rassemblement / Immortels (médiane) ${fixed(median(wr.map(e => (e.immortals ? e.power / e.immortals : 0))), 2)}. Sites libérés : ${ev('wonder_site_beaten').length} (premier au jour ${ev('wonder_site_beaten')[0]?.day ?? '—'}) ; plans pris : ${ev('wonder_plan_taken').length} ; rassemblements repoussés : ${ev('wonder_rally_repelled').length}.`);
  L.push(`- Vagues d'Immortels : tenues ${n(wonW.wavesHeld || 0)}, perdues ${n(wonW.wavesLost || 0)} (niveaux perdus ${n(wonW.levelsLost || 0)}) ; gardes de la Merveille envoyées ${n(won.guardsSent || 0)} (Ost prêté ${n(won.ostToWonder || 0)}, sans place ${n(won.guardNoSlot || 0)}).`);
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
  L.push(`- Or des donjons détruits : ${n(lg?.income?.invasion || 0)} reçu par les joueurs ; trésor annoncé : ${n(inv?.world?.treasureGold || 0)} or (avant partage). Donjons détruits : ${kv(lg?.invasionDestroyed)}.`); end();

  // D18 — joueurs automatiques
  H('D18. Joueurs automatiques');
  const ug = last?.map?.unguarded;
  L.push(`- Gardes des colonies : ${n(mil.guardsCreated || 0)} formées, ${n(mil.guardsPosted || 0)} départs vers une colonie, ${n(mil.guardsAttached || 0)} rattachées (E2), ${n(mil.guardRefills || 0)} renvoyées se regarnir, ${n(mil.guardNoSlot || 0)} fois sans place à la capitale ; gardes sans poste reprises ${n(mil.guardAdopted || 0)}, dissoutes ${n(mil.guardDisbanded || 0)}.${ug ? ` Colonies sans garde en poste à la fin (jour ${last.day}) : ${n(ug.n)} sur ${n(ug.of ?? last.world?.colonies ?? '?')}${ug.n ? ` — ${ug.list.join(', ')}` : ''}.` : ''}`);
  L.push(`- Armées de campagne : secondes armées rendues ${n(mil.yielded || 0)} (rappelées pour cela ${n(mil.yieldRecalls || 0)}), armées presque vides dissoutes ${n(mil.disbandedTiny || 0)}, sites de colonie libérés avec la garnison ${n(mil.clearFilled || 0)}, armées gardées pour l'escorte du colon ${n(mil.keptHomeForEscort || 0)}. Camps d'or attaqués ${n(mil.goldCampRaids || 0)} (or vu au départ ${n(mil.goldCampExpected || 0)}, au retour ${n(mil.goldCampGold || 0)}).`);
  const waves = ev('siege_wave');
  L.push(`- Sièges : ${waves.length} vagues (marche médiane ${fixed(median(waves.map(e => e.marchH)))} h, armées médianes ${nn(median(waves.map(e => e.armies)))}) ; vagues hors du tick prévu ${n(wk.waveOffTick || 0)}, annulées ${n(wk.waveAborted || 0)}, remises pendant une chaîne d'assauts ${n(wk.waveChainPause || 0)} ; engins à la fin : ${n(lastOf(events, 'war_summary')?.engines || 0)}.`);
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
  if (ca) L.push(`- À la fin : ${n(ca.attached)} armées rattachées à une colonie (${n(ca.manned)} avec des soldats), dans ${n(ca.colonies)} colonies sur ${n(last?.world?.colonies ?? '?')}, chez ${n(ca.players)} joueurs ; armées sur les emplacements des capitales : ${n(ca.capitalArmies)} (${n(ca.capitals)} capitales).`);
  const caRows = [...new Set(marks.map(d => at(d)).filter(m => m?.map?.colonyArmies))].map(m => [m.day, m.map.colonyArmies.attached, m.map.colonyArmies.manned, m.map.colonyArmies.capitalArmies, m.map.unguarded?.n ?? '']);
  if (caRows.length) L.push('', table(['Jour', 'Armées rattachées', 'Avec des soldats', 'Armées des capitales', 'Colonies sans garde'], caRows), '');
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
    let regained = 0, prev = null;
    for (const e of list) {
      const after = Number(String(e.lives || '').split('/')[0]);
      const before = e.won ? after + 1 : after;
      if (prev !== null && Number.isFinite(before) && before > prev) regained += before - prev;
      prev = Number.isFinite(after) && after > 0 ? after : null;   // rasé : le Bastion rebâti repart de toutes ses vies
    }
    const end = (last?.endgame?.bastions || []).find(b => `Bastion [${b.tag}]` === tag || b.tag === tag);
    return [tag, list.length, list.filter(e => e.won).length, regained, end ? end.lives : '', end?.pausedUntil ? end.pausedUntil.slice(0, 16).replace('T', ' ') : '—'];
  });
  if (livesRows.length) L.push('', table(['Bastion', 'Assauts', 'Gagnés', 'Vies revenues entre deux assauts', 'Vies à la fin', 'Pause jusqu\'à'], livesRows));
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
  L.push(`- Étages du chef ouverts (base, toutes invasions) : ${lvKv(fromDb(last?.world?.hordesBossByLevel))} ; donjons détruits : ${ev('horde_destroyed').length} par les rassemblements (${lvKv(byKey(ev('horde_destroyed'), 'level'))}), dans la base ${lvKv(fromDb(last?.world?.hordesDestroyedByLevel))}.`); end();

  // E6 — site de Merveille réservé
  H('E6. Site de Merveille réservé 6 h à l\'alliance qui l\'a libéré');
  const beatenSites = ev('wonder_site_beaten'), fsent = ev('wonder_found_sent'), cities = ev('wonder_city_founded');
  L.push(`- Sites libérés : ${beatenSites.length} (${kv(byKey(beatenSites, 'alliance'))}). Colons partis : ${fsent.length}, dont ${fsent.filter(e => e.reserved).length} pendant la réservation de leur alliance et ${fsent.filter(e => e.freedBy && !e.reserved).length} sur un site libéré par une autre alliance, après sa réservation ; heures après la bataille (médiane) ${fixed(median(fsent.map(e => e.hoursAfterBattle).filter(x => typeof x === 'number')))}. Colons qui ont attendu la fin de la réservation d'une autre alliance : ${n(won.foundWaitReserve || 0)} fois.`);
  L.push(`- Villes Merveille fondées : ${cities.length} (${cities.map(e => `${e.alliance} jour ${e.day}${e.freedBy ? (e.sameAlliance ? ', site qu\'elle a libéré' : `, site libéré par ${e.freedBy}`) : ''}`).join(' ; ') || '—'}). Refus « Site réservé » : ${n(refusals(/Site réservé/))}.`); end();
}

module.exports = { write };
