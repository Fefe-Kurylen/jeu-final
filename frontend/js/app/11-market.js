// ============================================================
// 11-market.js — Marché, rapports espionnage, liste des villages, sous-onglets
// Découpé depuis app.js (lignes 9285-9684) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== MARCHÉ ==========
let marketOffers = [];

async function loadMarket() {
  try {
    const res = await fetch(`${API}/api/market`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      marketOffers = await res.json();
      renderMarketOffers();
    }
  } catch (e) {
    console.error('Error loading market:', e);
  }
}

function renderMarketOffers() {
  const container = document.getElementById('market-offers');
  if (!container) return;
  
  const resourceIcons = { wood: resIconHtml('wood'), stone: resIconHtml('stone'), iron: resIconHtml('iron'), food: resIconHtml('food') };
  
  if (marketOffers.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucune offre disponible</p>';
    return;
  }
  
  container.innerHTML = marketOffers.map(offer => {
    const isMyOffer = offer.sellerId === player?.id;
    return `
      <div class="market-offer ${isMyOffer ? 'my-offer' : ''}">
        <div class="offer-seller">${isMyOffer ? '<img class="ico" src="assets/images/3d/ui/player.webp" alt=""> Votre offre' : `<img class="ico" src="assets/images/3d/ui/player.webp" alt=""> ${escapeHtml(offer.player?.name || 'Inconnu')}`}</div>
        <div class="offer-exchange">
          <span class="offer-sell">${resourceIcons[offer.sellResource]} ${formatNum(offer.sellAmount)}</span>
          <span class="offer-arrow">→</span>
          <span class="offer-buy">${resourceIcons[offer.buyResource]} ${formatNum(offer.buyAmount)}</span>
        </div>
        <div class="offer-ratio">Ratio: 1:${(offer.buyAmount / offer.sellAmount).toFixed(2)}</div>
        <div class="offer-actions">
          ${isMyOffer 
            ? `<button class="btn btn-danger btn-small" onclick="cancelMarketOffer('${offer.id}')">Annuler</button>`
            : `<button class="btn btn-success btn-small" onclick="acceptMarketOffer('${offer.id}')">Accepter</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

async function createMarketOffer() {
  if (_actionInProgress) return;
  const sellResource = document.getElementById('market-sell-resource')?.value;
  const sellAmount = parseInt(document.getElementById('market-sell-amount')?.value);
  const buyResource = document.getElementById('market-buy-resource')?.value;
  const buyAmount = parseInt(document.getElementById('market-buy-amount')?.value);

  if (!sellAmount || !buyAmount || sellAmount <= 0 || buyAmount <= 0) {
    showToast('Quantités invalides', 'error');
    return;
  }

  if (sellResource === buyResource) {
    showToast('Sélectionnez des ressources différentes', 'error');
    return;
  }

  _actionInProgress = true;
  try {
    const res = await fetch(`${API}/api/market/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sellResource, sellAmount, buyResource, buyAmount, cityId: currentCity?.id })
    });
    
    if (res.ok) {
      showToast('Offre créée!', 'success');
      document.getElementById('market-sell-amount').value = '';
      document.getElementById('market-buy-amount').value = '';
      await loadMarket();
      await loadCities();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

async function acceptMarketOffer(offerId) {
  if (_actionInProgress) return;
  _actionInProgress = true;
  try {
    const res = await fetch(`${API}/api/market/offer/${offerId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cityId: currentCity?.id })
    });
    
    if (res.ok) {
      showToast('Échange effectué!', 'success');
      await loadMarket();
      await loadCities();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

async function cancelMarketOffer(offerId) {
  if (_actionInProgress) return;
  _actionInProgress = true;
  try {
    const res = await fetch(`${API}/api/market/offer/${offerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.ok) {
      showToast('Offre annulée', 'success');
      await loadMarket();
      await loadCities();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

// ========== RAPPORTS ESPIONNAGE ==========
let spyReports = [];
let currentReportTab = 'battles';

function showReportsTab(tab) {
  currentReportTab = tab;
  const reportTabContainer = document.querySelector('#tab-reports .tab-toolbar');
  if (reportTabContainer) {
    reportTabContainer.querySelectorAll('.toolbar-btn').forEach(t => t.classList.remove('active'));
    reportTabContainer.querySelector(`.toolbar-btn[onclick*="${tab}"]`)?.classList.add('active');
  }
  
  if (tab === 'battles') {
    loadReports();
  } else if (tab === 'spy') {
    loadSpyReports();
  } else if (tab === 'trade') {
    loadTradeReports();
  }
}

let tradeReports = [];

async function loadTradeReports() {
  try {
    const res = await fetch(`${API}/api/reports/trade`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      tradeReports = await res.json();
      renderTradeReports();
    }
  } catch (e) {
    console.error('Error loading trade reports:', e);
  }
}

function renderTradeReports() {
  const container = document.getElementById('reports-list');
  if (!container) return;

  if (!tradeReports.length) {
    container.innerHTML = '<div class="empty-state">Aucun échange effectué</div>';
    return;
  }

  const resNames = { wood: 'Bois', stone: 'Pierre', iron: 'Fer', food: 'Nourriture' };
  const resIcons = { wood: resIconHtml('wood'), stone: resIconHtml('stone'), iron: resIconHtml('iron'), food: resIconHtml('food') };

  container.innerHTML = tradeReports.map(t => {
    const isSeller = t.sellerId === player?.id;
    const gave = isSeller ? { res: t.sellResource, amount: t.sellAmount } : { res: t.buyResource, amount: t.buyAmount };
    const got = isSeller ? { res: t.buyResource, amount: t.buyAmount } : { res: t.sellResource, amount: t.sellAmount };
    const date = new Date(t.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="report-item" style="padding:10px;margin-bottom:6px;background:var(--bg-tertiary);border-radius:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>${isSeller ? '<img class="ico" src="assets/images/3d/ui/send.webp" alt=""> Vendu' : '<img class="ico" src="assets/images/3d/ui/send.webp" alt=""> Achet\u00e9'}</span>
          <span style="color:var(--text-secondary);font-size:0.85em;">${date}</span>
        </div>
        <div style="margin-top:4px;">
          <span style="color:var(--error)">${resIcons[gave.res] || ''} -${formatNum(gave.amount)} ${resNames[gave.res] || gave.res}</span>
          →
          <span style="color:var(--success)">${resIcons[got.res] || ''} +${formatNum(got.amount)} ${resNames[got.res] || got.res}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function loadSpyReports() {
  try {
    const res = await fetch(`${API}/api/reports/spy`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      spyReports = await res.json();
      renderSpyReports();
    }
  } catch (e) {
    console.error('Error loading spy reports:', e);
  }
}

function renderSpyReports() {
  const container = document.getElementById('reports-list');
  if (!container) return;
  
  if (spyReports.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun rapport d\'espionnage</p>';
    return;
  }
  
  const resourceIcons = { wood: resIconHtml('wood'), stone: resIconHtml('stone'), iron: resIconHtml('iron'), food: resIconHtml('food') };
  
  container.innerHTML = spyReports.map(report => {
    const date = new Date(report.createdAt).toLocaleString('fr-FR');
    
    if (report.targetType === 'COUNTER_SPY') {
      return `
        <div class="report-card report-victory" data-report-id="${escapeHtml(String(report.id || ""))}">
          <div class="report-header">
            <span class="report-title"><img class="ico" src="assets/images/3d/ui/spy.webp" alt=""> Espion intercepté</span>
            <span class="report-date">${date}</span>
          </div>
          <p>Votre Tour de guet a repéré <strong>${report.targetName ? escapeHtml(report.targetName) : 'des espions inconnus'}</strong> aux abords de <strong>${escapeHtml(report.cityName)}</strong>.</p>
        </div>
      `;
    }
    if (!report.success) {
      return `
        <div class="report-card report-defeat" data-report-id="${escapeHtml(String(report.id || ""))}">
          <div class="report-header">
            <span class="report-title"><img class="ico" src="assets/images/3d/ui/spy.webp" alt=""> Espionnage échoué</span>
            <span class="report-date">${date}</span>
          </div>
          <p>Votre espion n'a pas réussi à infiltrer <strong>${escapeHtml(report.cityName)}</strong> à (${report.targetX}, ${report.targetY})</p>
        </div>
      `;
    }
    
    return `
      <div class="report-card report-victory" data-report-id="${escapeHtml(String(report.id || ""))}">
        <div class="report-header">
          <span class="report-title"><img class="ico" src="assets/images/3d/ui/spy.webp" alt=""> Espionnage réussi</span>
          <span class="report-date">${date}</span>
        </div>
        <p><strong>${escapeHtml(report.cityName)}</strong> à (${report.targetX}, ${report.targetY})</p>
        
        <div class="spy-section">
          <h4><img class="ico" src="assets/images/3d/ui/gold.webp" alt=""> Ressources</h4>
          <div class="spy-resources">
            ${Object.entries(report.resources || {}).map(([res, val]) => 
              `<span>${resourceIcons[res] || res} ${formatNum(val)}</span>`
            ).join('')}
          </div>
        </div>
        
        <div class="spy-section">
          <h4><img class="ico" src="assets/images/3d/ui/city.webp" alt=""> Bâtiments</h4>
          <div class="spy-buildings">
            ${(report.buildings || []).map(b => 
              `<span class="spy-building">${getBuildingName(b.key)} Niv.${b.level}</span>`
            ).join('')}
          </div>
        </div>
        
        <div class="spy-section">
          <h4><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""> Armées</h4>
          ${(report.armies || []).length === 0 ? '<p>Aucune armée détectée</p>' : 
            report.armies.map(a => `
              <div class="spy-army">
                <strong>${escapeHtml(a.name)}</strong>: 
                ${(a.units || []).map(u => `${escapeHtml(getUnitName(u.key))} x${u.count}`).join(', ')}
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }).join('');
}

function getBuildingName(key) {
  // Chercher dans buildingsData d'abord (contient les 39 bâtiments)
  const building = window.buildingsData?.find(b => b.key === key);
  if (building?.name) return building.name;

  // Fallback pour les cas où buildingsData n'est pas encore chargé
  const fallbackNames = {
    MAIN_HALL: 'Bâtiment principal', BARRACKS: 'Caserne', STABLE: 'Écurie', WORKSHOP: 'Atelier',
    WAREHOUSE: 'Dépôt', SILO: 'Silo', MARKET: 'Marché', ACADEMY: 'Académie',
    FARM: 'Ferme', LUMBER: 'Bûcheron', QUARRY: 'Carrière', IRON_MINE: 'Mine de fer',
    WALL: 'Mur', MOAT: 'Douves', HIDEOUT: 'Cachette', HEALING_TENT: 'Tente de soins',
    RALLY_POINT: 'Place de rassemblement', FORGE: 'Forge', HERO_MANSION: 'Domus du Héros',
    MILL: 'Moulin', BAKERY: 'Boulangerie', SAWMILL: 'Scierie', STONEMASON: 'Tailleur de Pierre',
    FOUNDRY: 'Fonderie', GREAT_SILO: 'Grand Silo', GREAT_WAREHOUSE: 'Grand Dépôt',
    GREAT_BARRACKS: 'Grande Caserne', GREAT_STABLE: 'Grande Écurie', WATCHTOWER: 'Tour de Guet',
    EMBASSY: 'Ambassade', TREASURE_CHAMBER: 'Chambre au Trésor', RESIDENCE: 'Résidence',
    TRADE_OFFICE: 'Comptoir de Commerce', ROMAN_THERMAE: 'Thermes', GALLIC_BREWERY: 'Brasserie',
    GREEK_TEMPLE: 'Temple', EGYPTIAN_IRRIGATION: 'Poste d\'Irrigation', HUN_WAR_TENT: 'Tente de Guerre',
    SULTAN_DESERT_OUTPOST: 'Poste du Désert', HERO_HOME: 'Domus du Héros'
  };
  return fallbackNames[key] || key;
}

// ========== VILLAGE LIST MODAL ==========
function openVillageList() {
  if (!cities || cities.length === 0) {
    showToast('Aucune ville', 'warning');
    return;
  }

  let html = '<div class="village-list">';
  cities.forEach(city => {
    const isActive = city.id === currentCity?.id;
    html += `
      <div class="village-list-item ${isActive ? 'active' : ''}" onclick="selectCity('${city.id}'); closeModal();">
        <span class="village-icon">${city.isCapital ? '<img class="ico" src="assets/images/3d/ui/crown.webp" alt="">' : '<img class="ico" src="assets/images/3d/ui/city.webp" alt="">'}</span>
        <div class="village-details">
          <span class="village-name">${escapeHtml(city.name)}</span>
          <span class="village-coords">(${city.x}|${city.y})</span>
        </div>
        <span class="village-pop">${city.cityTierName || 'Village'}</span>
      </div>
    `;
  });
  html += '</div>';

  showModal('Vos villages', html);
}

// ========== TAB SUB-TABS ==========
function showArmyTab(subTab) {
  document.querySelectorAll('#tab-army .toolbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#tab-army .toolbar-btn[onclick*="${subTab}"]`)?.classList.add('active');

  const container = document.getElementById('armies-management');
  if (!container) return;

  switch (subTab) {
    case 'overview':
      renderArmies();
      break;
    case 'train':
      container.innerHTML = '<div id="units-grid" class="units-grid"></div>';
      loadUnits();
      break;
    case 'send':
      renderSendTroopsForm();
      break;
    default:
      renderArmies();
  }
}

let currentAllianceTab = 'overview';

function showAllianceTab(subTab) {
  currentAllianceTab = subTab;
  document.querySelectorAll('#tab-alliance .toolbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#tab-alliance .toolbar-btn[onclick*="${subTab}"]`)?.classList.add('active');

  // Show/hide sections
  document.querySelectorAll('.alliance-sub-section').forEach(s => s.style.display = 'none');
  const section = document.getElementById(`alliance-sub-${subTab}`);
  if (section) section.style.display = 'block';

  // If sections don't exist yet, load fresh
  if (!section) loadAlliance();
}

function showMarketTab(subTab) {
  document.querySelectorAll('#tab-market .toolbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#tab-market .toolbar-btn[onclick*="${subTab}"]`)?.classList.add('active');

  // Hide all sections
  document.querySelectorAll('#market-content .market-section').forEach(s => s.style.display = 'none');

  // Show selected section
  const section = document.getElementById(`market-section-${subTab}`);
  if (section) section.style.display = 'block';

  if (subTab === 'offers') loadMarket();
  if (subTab === 'npc') showNpcMerchant();
}

function filterBuildings(category) {
  document.querySelectorAll('#tab-buildings .toolbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#tab-buildings .toolbar-btn[onclick*="${category}"]`)?.classList.add('active');
  renderBuildings(category);
}

