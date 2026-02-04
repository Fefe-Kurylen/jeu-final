// ============================================================================
// MODALS.JS - Modal Dialog System
// ============================================================================

function showModal(title, content, buttons = []) {
  const container = document.getElementById('modal-container');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  modalTitle.textContent = title;
  modalBody.innerHTML = content;

  // Build footer buttons
  modalFooter.innerHTML = buttons.map((btn, i) => `
    <button class="btn ${btn.class || 'btn-secondary'}" data-action="${i}">${btn.text}</button>
  `).join('') + '<button class="btn btn-secondary" data-action="close">Fermer</button>';

  // Attach button handlers
  modalFooter.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'close') {
        closeModal();
      } else {
        const callback = buttons[parseInt(action)]?.action;
        if (callback) callback();
      }
    });
  });

  // Show modal
  container.classList.remove('hidden');

  // Close on backdrop click
  container.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);

  // Close on Escape
  document.addEventListener('keydown', handleEscapeKey);
}

function closeModal() {
  const container = document.getElementById('modal-container');
  container.classList.add('hidden');
  document.removeEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e) {
  if (e.key === 'Escape') closeModal();
}

// ============================================================================
// SPECIFIC MODALS
// ============================================================================

function openMoveModal(armyId) {
  showModal('Déplacer l\'armée', `
    <div class="form-group">
      <label>Destination X</label>
      <input type="number" id="move-x" class="form-control" placeholder="X">
    </div>
    <div class="form-group">
      <label>Destination Y</label>
      <input type="number" id="move-y" class="form-control" placeholder="Y">
    </div>
  `, [
    { text: '🚶 Déplacer', class: 'btn-primary', action: async () => {
      const x = parseInt(document.getElementById('move-x').value);
      const y = parseInt(document.getElementById('move-y').value);
      if (isNaN(x) || isNaN(y)) { showToast('Coordonnées invalides', 'error'); return; }
      try {
        await api.moveArmy(armyId, x, y);
        showToast('Armée en marche !', 'success');
        closeModal();
        loadArmiesView();
      } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    }}
  ]);
}

function openAttackModal(armyId) {
  showModal('Attaquer', `
    <div class="form-group">
      <label>Cible X</label>
      <input type="number" id="attack-x" class="form-control" placeholder="X">
    </div>
    <div class="form-group">
      <label>Cible Y</label>
      <input type="number" id="attack-y" class="form-control" placeholder="Y">
    </div>
  `, [
    { text: '⚔️ Attaquer', class: 'btn-danger', action: async () => {
      const x = parseInt(document.getElementById('attack-x').value);
      const y = parseInt(document.getElementById('attack-y').value);
      if (isNaN(x) || isNaN(y)) { showToast('Coordonnées invalides', 'error'); return; }
      try {
        await api.attackArmy(armyId, x, y);
        showToast('Attaque lancée !', 'success');
        closeModal();
        loadArmiesView();
      } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    }}
  ]);
}

function openMoveTargetModal(x, y) {
  // Select army then move
  const armies = gameState.armies.filter(a => a.status === 'IDLE' || a.status === 'IN_CITY');
  if (armies.length === 0) {
    showToast('Aucune armée disponible', 'warning');
    closeModal();
    return;
  }

  showModal(`Déplacer vers (${x}, ${y})`, `
    <div class="form-group">
      <label>Sélectionner une armée</label>
      <select id="select-army">
        ${armies.map(a => `<option value="${a.id}">Armée #${a.id.slice(0, 6)} (${a.units?.length || 0} unités)</option>`).join('')}
      </select>
    </div>
  `, [
    { text: '🚶 Déplacer', class: 'btn-primary', action: async () => {
      const armyId = document.getElementById('select-army').value;
      try {
        await api.moveArmy(armyId, x, y);
        showToast('Armée en marche !', 'success');
        closeModal();
        loadMapData();
      } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    }}
  ]);
}

function openAttackTargetModal(x, y) {
  const armies = gameState.armies.filter(a => a.status === 'IDLE' || a.status === 'IN_CITY');
  if (armies.length === 0) {
    showToast('Aucune armée disponible', 'warning');
    closeModal();
    return;
  }

  showModal(`Attaquer (${x}, ${y})`, `
    <div class="form-group">
      <label>Sélectionner une armée</label>
      <select id="select-army">
        ${armies.map(a => `<option value="${a.id}">Armée #${a.id.slice(0, 6)} (${a.units?.length || 0} unités)</option>`).join('')}
      </select>
    </div>
  `, [
    { text: '⚔️ Attaquer', class: 'btn-danger', action: async () => {
      const armyId = document.getElementById('select-army').value;
      try {
        await api.attackArmy(armyId, x, y);
        showToast('Attaque lancée !', 'success');
        closeModal();
        loadMapData();
      } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    }}
  ]);
}

function openRaidModal(x, y) {
  const armies = gameState.armies.filter(a => a.status === 'IDLE' || a.status === 'IN_CITY');
  if (armies.length === 0) {
    showToast('Aucune armée disponible', 'warning');
    closeModal();
    return;
  }

  showModal(`Raid sur (${x}, ${y})`, `
    <div class="form-group">
      <label>Sélectionner une armée</label>
      <select id="select-army">
        ${armies.map(a => `<option value="${a.id}">Armée #${a.id.slice(0, 6)} (${a.units?.length || 0} unités)</option>`).join('')}
      </select>
    </div>
  `, [
    { text: '💰 Raid', class: 'btn-primary', action: async () => {
      const armyId = document.getElementById('select-army').value;
      try {
        await api.raidArmy(armyId, x, y);
        showToast('Raid lancé !', 'success');
        closeModal();
        loadMapData();
      } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    }}
  ]);
}

function openSpyModal(x, y, targetType) {
  const armies = gameState.armies.filter(a => a.status === 'IDLE' || a.status === 'IN_CITY');
  if (armies.length === 0) {
    showToast('Aucune armée disponible', 'warning');
    closeModal();
    return;
  }

  showModal(`Espionner (${x}, ${y})`, `
    <div class="form-group">
      <label>Sélectionner une armée</label>
      <select id="select-army">
        ${armies.map(a => `<option value="${a.id}">Armée #${a.id.slice(0, 6)}</option>`).join('')}
      </select>
    </div>
  `, [
    { text: '🕵️ Espionner', class: 'btn-secondary', action: async () => {
      const armyId = document.getElementById('select-army').value;
      try {
        await api.spyArmy(armyId, x, y, targetType);
        showToast('Mission d\'espionnage lancée !', 'success');
        closeModal();
      } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    }}
  ]);
}

function openCreateOfferModal() {
  const city = gameState.currentCity;
  if (!city) { showToast('Sélectionnez une ville', 'warning'); return; }

  showModal('Créer une offre', `
    <div class="form-group">
      <label>Je propose</label>
      <select id="offer-type">
        <option value="wood">🪵 Bois</option>
        <option value="stone">🪨 Pierre</option>
        <option value="iron">⛏️ Fer</option>
        <option value="food">🌾 Nourriture</option>
      </select>
      <input type="number" id="offer-amount" min="100" max="100000" placeholder="Quantité">
    </div>
    <div class="form-group">
      <label>Je veux</label>
      <select id="want-type">
        <option value="stone">🪨 Pierre</option>
        <option value="wood">🪵 Bois</option>
        <option value="iron">⛏️ Fer</option>
        <option value="food">🌾 Nourriture</option>
      </select>
      <input type="number" id="want-amount" min="100" max="100000" placeholder="Quantité">
    </div>
  `, [
    { text: '📝 Créer offre', class: 'btn-primary', action: async () => {
      try {
        await api.createOffer(
          city.id,
          document.getElementById('offer-type').value,
          parseInt(document.getElementById('offer-amount').value),
          document.getElementById('want-type').value,
          parseInt(document.getElementById('want-amount').value)
        );
        showToast('Offre créée !', 'success');
        closeModal();
        loadMarketOffers();
      } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    }}
  ]);
}

function openCreateRouteModal() {
  const cities = gameState.cities;
  if (cities.length < 2) {
    showToast('Vous avez besoin de 2 villes minimum', 'warning');
    return;
  }

  showModal('Créer une route commerciale', `
    <div class="form-group">
      <label>Ville source</label>
      <select id="route-from">
        ${cities.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Ville destination</label>
      <select id="route-to">
        ${cities.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Ressource</label>
      <select id="route-resource">
        <option value="wood">🪵 Bois</option>
        <option value="stone">🪨 Pierre</option>
        <option value="iron">⛏️ Fer</option>
        <option value="food">🌾 Nourriture</option>
      </select>
    </div>
    <div class="form-group">
      <label>Pourcentage (1-30%)</label>
      <input type="number" id="route-percent" min="1" max="30" value="5">
    </div>
  `, [
    { text: '🛤️ Créer route', class: 'btn-primary', action: async () => {
      try {
        await api.createTradeRoute(
          document.getElementById('route-from').value,
          document.getElementById('route-to').value,
          document.getElementById('route-resource').value,
          parseInt(document.getElementById('route-percent').value),
          2
        );
        showToast('Route créée !', 'success');
        closeModal();
        loadTradeRoutes();
      } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    }}
  ]);
}

function openCreateAllianceModal() {
  showModal('Créer une Alliance', `
    <div class="form-group">
      <label>Tag (3-5 caractères)</label>
      <input type="text" id="alliance-tag" maxlength="5" placeholder="TAG">
    </div>
    <div class="form-group">
      <label>Nom de l'alliance</label>
      <input type="text" id="alliance-name-input" placeholder="Nom">
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="alliance-desc-input" rows="3" placeholder="Description..."></textarea>
    </div>
  `, [
    { text: '🏰 Créer', class: 'btn-primary', action: async () => {
      try {
        await api.createAlliance(
          document.getElementById('alliance-tag').value,
          document.getElementById('alliance-name-input').value,
          document.getElementById('alliance-desc-input').value
        );
        showToast('Alliance créée !', 'success');
        closeModal();
        loadAllianceView();
      } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    }}
  ]);
}

function openSearchAllianceModal() {
  showModal('Rechercher une Alliance', `
    <div class="form-group">
      <label>Recherche</label>
      <input type="text" id="alliance-search" placeholder="Nom ou Tag">
    </div>
    <div id="alliance-search-results" class="mt-md">
      <p class="text-muted">Entrez un terme de recherche</p>
    </div>
  `, []);

  document.getElementById('alliance-search').addEventListener('input', async (e) => {
    const query = e.target.value;
    if (query.length < 2) return;

    try {
      const results = await api.searchAlliances(query);
      const container = document.getElementById('alliance-search-results');
      
      if (!results || results.length === 0) {
        container.innerHTML = '<p class="text-muted">Aucun résultat</p>';
        return;
      }

      container.innerHTML = results.map(a => `
        <div class="alliance-result">
          <span>[${a.tag}] ${a.name}</span>
          <span>${a.totalMembers} membres</span>
          <button class="btn btn-small btn-primary" onclick="requestJoinAlliance('${a.id}')">Rejoindre</button>
        </div>
      `).join('');

    } catch (e) {
      console.error(e);
    }
  });
}

async function requestJoinAlliance(allianceId) {
  showToast('Demande envoyée !', 'info');
  closeModal();
}

function openStartExpeditionModal(expeditionId) {
  const armies = gameState.armies.filter(a => 
    (a.status === 'IDLE' || a.status === 'IN_CITY') && a.heroId
  );
  
  if (armies.length === 0) {
    showToast('Aucune armée avec héros disponible', 'warning');
    return;
  }

  showModal('Lancer l\'expédition', `
    <p>Sélectionnez une armée avec un héros pour cette expédition.</p>
    <div class="form-group">
      <label>Armée</label>
      <select id="expedition-army">
        ${armies.map(a => `<option value="${a.id}">Armée #${a.id.slice(0, 6)} (${a.units?.length || 0} unités)</option>`).join('')}
      </select>
    </div>
  `, [
    { text: '🗺️ Lancer', class: 'btn-primary', action: async () => {
      const armyId = document.getElementById('expedition-army').value;
      try {
        const result = await api.startExpedition(expeditionId, armyId);
        showToast('Expédition lancée !', 'success');
        closeModal();
        loadExpeditionView();
      } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    }}
  ]);
}
