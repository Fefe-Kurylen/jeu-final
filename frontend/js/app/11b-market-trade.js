// ============================================================
// 11b-market-trade.js — Marché (décisions du 27 et du 31 octobre 2026) : armées qui portent les échanges et les envois,
// taxe des échanges. La Place du marché n'existe que dans la capitale et sert toutes les villes du joueur. Plus de
// marchands ni de routes entre ses villes : le stock du joueur est commun. Une armée libre de la ville porte les échanges
// entre joueurs et les envois de ressources, selon la charge de ses troupes ; le marchand du serveur (échange immédiat)
// n'en demande pas. Ce qu'elle emporte se prend dans toutes les villes du joueur, la ville de départ d'abord : ce qui peut
// partir est le total de ses villes (décision du 1er novembre 2026, simulation de 200 jours).
// Serveur : src/routes/market.js, src/services/marketService.js.
// ============================================================
const MARKET_RES = [['wood', 'Bois'], ['stone', 'Pierre'], ['iron', 'Fer'], ['food', 'Nourriture']];

// État du marché vu de la ville affichée (GET /api/market/state) : taxe des échanges qui en partent et armées libres de la
// ville avec leur charge [{ id, name, capacity, hero }], la plus petite d'abord
let marketState = null;
async function loadMarketState() {
  if (!currentCity) return null;
  try { marketState = await fetchJson(`/api/market/state?cityId=${encodeURIComponent(currentCity.id)}`); } catch (e) { /* le dernier état connu reste affiché */ }
  return marketState;
}
// Armées parmi lesquelles le serveur choisit : celle demandée, sinon toutes (marketService.pickTransportArmy)
const marketArmies = (armyId = '') => (marketState?.armies || []).filter(a => !armyId || a.id === armyId);
const armyLabel = (a) => `${escapeHtml(a.name)} · ${formatNum(a.capacity)} de charge${a.hero ? ' · avec le héros' : ''}`;
// Aide d'une livraison de `amount` ressources : l'armée qui partira (la plus petite qui suffit, sans le héros quand c'est
// possible, comme le serveur), ou le refus du serveur. '' tant que rien n'est saisi. `offer` : l'armée d'une offre attend
// d'abord en ville avec les marchandises
function transportNeedHtml(amount, armyId = '', offer = false) {
  if (!marketState || !(amount > 0)) return '';
  const list = marketArmies(armyId);
  if (!list.length) return `<span class="missing">${armyId ? 'Cette armée n\'est pas libre en ville' : 'Aucune armée libre en ville pour transporter (formez-en une au point de ralliement)'}</span>`;
  const fits = list.filter(a => a.capacity >= amount);
  const army = fits.find(a => !a.hero) || fits[0];
  if (!army) return `<span class="missing">Capacité de transport insuffisante : ${formatNum(amount)} à porter, ${formatNum(list.at(-1).capacity)} au mieux</span>`;
  return `${armyLabel(army)} : ${offer ? `elle attend en ville avec les ${formatNum(amount)} ressources jusqu'à l'échange` : `elle porte les ${formatNum(amount)} ressources, puis rentre`}`;
}
// Liste des armées libres de la ville dans un <select> : « Choix automatique » (la plus petite qui suffit), puis chacune
function fillArmySelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const list = marketArmies();
  const keep = sel.value;
  sel.innerHTML = list.length
    ? `<option value="">Choix automatique</option>${list.map(a => `<option value="${chatSafeId(a.id)}">${armyLabel(a)}</option>`).join('')}`
    : '<option value="">Aucune armée libre en ville</option>';
  if (list.some(a => a.id === keep)) sel.value = keep;
}
// Après une livraison (réponse du serveur { arrivalAt, returnAt }) : quand les ressources arrivent et quand l'armée rentre
const deliveryTimesText = (d) => (d?.arrivalAt ? ` · arrivée dans ${formatTime(d.arrivalAt)}${d.returnAt ? `, retour de l'armée dans ${formatTime(d.returnAt)}` : ''}` : '');
// Ce qui peut partir pour ces ressources : le stock de toutes les villes du joueur (playerStock, GET /api/cities, comme la
// barre de ressources), en rouge celles dont `want` ({ wood: n, … }) dépasse le total. '' tant que le stock n'est pas connu
function availableStockHtml(want = {}, keys = RES_KEYS) {
  const total = playerStock();
  if (!RES_KEYS.some(r => r in total)) return '';
  const parts = keys.map(r => `<span${(want[r] || 0) > (total[r] || 0) ? ' class="missing"' : ''}>${formatNum(total[r] || 0)} ${RES_NAMES[r]}</span>`);
  return `Disponible dans toutes vos villes : ${parts.join(' · ')}`;
}
const helpLines = (...lines) => lines.filter(Boolean).join('<br>');

// ---- envoi de ressources ----
// Formulaire « Envoyer » : armées libres de la ville, puis l'armée qui partira à chaque saisie
function refreshSendForm() {
  fillArmySelect('send-army');
  updateSendHelp();
}
function updateSendHelp() {
  const el = document.getElementById('send-help');
  if (!el) return;
  const want = Object.fromEntries(RES_KEYS.map(r => [r, parseInt(document.getElementById(`send-${r}`)?.value) || 0]));
  const amount = RES_KEYS.reduce((t, r) => t + want[r], 0);
  el.innerHTML = helpLines(transportNeedHtml(amount, document.getElementById('send-army')?.value || ''), availableStockHtml(want));
}

// ---- offres entre joueurs ----
// Formulaire « Créer une offre » (état du marché déjà chargé) : taxe des échanges qui partent de cette ville, armées libres
// et celle que l'offre réservera
function refreshOfferForm() {
  const t = marketState;
  const help = document.getElementById('market-offer-help');
  if (help && t) {
    const office = fmtTechPct(buildingEffectOf('TRADE_OFFICE', 'p2pTaxReductionPctPerLevel', 1));
    const treasure = player?.economy?.market?.treasureTaxReductionPctPerLevel;
    help.innerHTML = `L'armée choisie attend en ville avec les marchandises jusqu'à l'échange (${t.offerHours} h au plus). À l'échange, chaque côté envoie une armée, qui livre puis rentre ; taxe sur ce qu'elle porte : <strong>${fmtTechPct(t.taxPct)} %</strong> depuis cette ville (${t.basePct} % de base, −${office} % par niveau du Comptoir de la capitale${treasure ? `, −${fmtTechPct(treasure)} % par niveau de la Chambre au Trésor` : ''}).`;
  }
  fillArmySelect('market-offer-army');
  // la ressource vendue change ce qui peut partir (stock commun) : l'aide suit le choix
  const sell = document.getElementById('market-sell-resource');
  if (sell && !sell.onchange) sell.onchange = updateOfferHelp;
  updateOfferHelp();
}
function updateOfferHelp() {
  const el = document.getElementById('market-offer-transport');
  if (!el) return;
  const amount = parseInt(document.getElementById('market-sell-amount')?.value) || 0;
  const res = document.getElementById('market-sell-resource')?.value || 'wood';
  el.innerHTML = helpLines(transportNeedHtml(amount, document.getElementById('market-offer-army')?.value || '', true), availableStockHtml({ [res]: amount }, [res]));
}

// Accepter une offre : une armée de la ville porte la contrepartie vers la ville du vendeur (celles qui peuvent la porter)
function openAcceptOffer(offer) {
  const name = (k) => (MARKET_RES.find(r => r[0] === k) || [k, k])[1].toLowerCase();
  const fit = marketArmies().filter(a => a.capacity >= offer.buyAmount);
  const have = availableStockHtml({ [offer.buyResource]: offer.buyAmount }, [offer.buyResource]);   // stock commun
  openSheetModal('Accepter l\'offre', `
    <p>Vous donnez <strong>${formatNum(offer.buyAmount)} ${name(offer.buyResource)}</strong> et recevez <strong>${formatNum(offer.sellAmount)} ${name(offer.sellResource)}</strong> (moins la taxe de chaque côté).</p>
    <p class="diplo-help">Une armée de ${escapeHtml(currentCity?.name || 'votre ville')} part vers ${escapeHtml(offer.city?.name || 'la ville du vendeur')} avec votre part, prise dans vos villes (celle-ci d'abord) ; celle du vendeur vient vers vous. Livraison à l'arrivée, puis retour.</p>
    ${have ? `<p class="diplo-help">${have}</p>` : ''}
    ${fit.length
      ? `<label class="form-row">Armée <select id="accept-army"><option value="">Choix automatique</option>${fit.map(a => `<option value="${chatSafeId(a.id)}">${armyLabel(a)}</option>`).join('')}</select></label>`
      : `<p class="diplo-help">${transportNeedHtml(offer.buyAmount) || '<span class="missing">Aucune armée libre en ville</span>'}</p>`}
    <div class="profile-actions">
      <button class="btn btn-primary" ${fit.length ? '' : 'disabled'} onclick="confirmAcceptOffer('${chatSafeId(offer.id)}', document.getElementById('accept-army')?.value || null)">Accepter</button>
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    </div>`);
}
