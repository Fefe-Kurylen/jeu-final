// ============================================================================
// VIEWS.JS - Detailed View Handlers
// ============================================================================

// ============================================================================
// ARMY VIEW
// ============================================================================

async function loadArmiesView() {
  const container = document.getElementById('armies-list');
  const recruitPanel = document.getElementById('recruit-panel');
  
  try {
    const armies = await api.getArmies();
    gameState.armies = armies || [];

    if (gameState.armies.length === 0) {
      container.innerHTML = '<p class="empty-queue text-center">Aucune armée disponible</p>';
    } else {
      container.innerHTML = gameState.armies.map(army => `
        <div class="army-card" data-army-id="${army.id}">
          <div class="army-header">
            <h4>Armée #${army.id.slice(0, 6)}</h4>
            <span class="army-status status-${army.status.toLowerCase()}">${getStatusLabel(army.status)}</span>
          </div>
          <div class="army-location">📍 ${army.x}, ${army.y}</div>
          <div class="army-units">
            ${(army.units || []).map(u => `
              <span class="army-unit">${getUnitIcon(u.unitKey)} ${u.count}</span>
            `).join('')}
          </div>
          <div class="army-actions">
            ${army.status === 'IDLE' || army.status === 'IN_CITY' ? `
              <button class="btn btn-small btn-secondary" onclick="openMoveModal('${army.id}')">Déplacer</button>
              <button class="btn btn-small btn-danger" onclick="openAttackModal('${army.id}')">Attaquer</button>
            ` : ''}
          </div>
        </div>
      `).join('');
    }

    // Load recruit panel
    loadRecruitPanel();

  } catch (error) {
    console.error('Error loading armies:', error);
    container.innerHTML = '<p class="text-danger">Erreur de chargement</p>';
  }
}

function loadRecruitPanel() {
  const panel = document.getElementById('recruit-panel');
  if (!panel) return;

  const city = gameState.currentCity;
  if (!city) {
    panel.innerHTML = '<p class="text-muted">Sélectionnez une ville</p>';
    return;
  }

  // Check for military buildings
  const buildings = city.buildings || [];
  const barracks = buildings.find(b => b.key === 'BARRACKS');
  const stable = buildings.find(b => b.key === 'STABLE');
  const workshop = buildings.find(b => b.key === 'WORKSHOP');

  if (!barracks && !stable && !workshop) {
    panel.innerHTML = '<p class="text-muted">Construisez une Caserne, Écurie ou Atelier pour recruter</p>';
    return;
  }

  const faction = gameState.player?.faction || 'ROME';
  const factionPrefix = { ROME: 'ROM', GAUL: 'GAU', GREEK: 'GRE', EGYPT: 'EGY', HUN: 'HUN', SULTAN: 'SUL' }[faction] || 'ROM';

  const units = [];
  
  if (barracks) {
    units.push(
      { key: `${factionPrefix}_INF_MILICIEN`, name: 'Milicien', tier: 'base', building: 'BARRACKS', icon: '🗡️' },
      { key: `${factionPrefix}_INF_TRIARII`, name: 'Triarii', tier: 'intermediate', building: 'BARRACKS', icon: '🗡️' },
      { key: `${factionPrefix}_INF_LEGIONNAIRE`, name: 'Légionnaire', tier: 'elite', building: 'BARRACKS', icon: '🗡️' },
      { key: `${factionPrefix}_ARC_MILICIEN`, name: 'Archer Base', tier: 'base', building: 'BARRACKS', icon: '🏹' },
    );
  }
  
  if (stable) {
    units.push(
      { key: `${factionPrefix}_CAV_AUXILIAIRE`, name: 'Cavalerie Base', tier: 'base', building: 'STABLE', icon: '🐎' },
      { key: `${factionPrefix}_CAV_EQUITES`, name: 'Equites', tier: 'intermediate', building: 'STABLE', icon: '🐎' },
    );
  }
  
  if (workshop) {
    units.push(
      { key: `${factionPrefix}_SIEGE_CATAPULTE`, name: 'Catapulte', tier: 'siege', building: 'WORKSHOP', icon: '💣' },
    );
  }

  panel.innerHTML = `
    <div class="recruit-grid">
      ${units.map(u => `
        <div class="recruit-card" data-unit="${u.key}" data-building="${u.building}">
          <div class="recruit-icon">${u.icon}</div>
          <div class="recruit-name">${u.name}</div>
          <div class="recruit-tier tier-${u.tier}">${u.tier.toUpperCase()}</div>
          <input type="number" class="recruit-count" min="1" max="100" value="10" placeholder="Qté">
          <button class="btn btn-small btn-primary" onclick="recruitUnits('${u.key}', '${u.building}', this)">Recruter</button>
        </div>
      `).join('')}
    </div>
  `;
}

async function recruitUnits(unitKey, buildingKey, btn) {
  const card = btn.closest('.recruit-card');
  const count = parseInt(card.querySelector('.recruit-count').value) || 10;
  
  try {
    await api.recruit(gameState.currentCity.id, unitKey, count, buildingKey);
    showToast(`Recrutement de ${count} unités lancé !`, 'success');
    await loadCityDetails(gameState.currentCity.id);
  } catch (error) {
    showToast(error.message || 'Erreur de recrutement', 'error');
  }
}

function getStatusLabel(status) {
  const labels = {
    IDLE: '🏠 Au repos',
    MOVING: '🚶 En marche',
    RETURNING: '🔙 Retour',
    IN_CITY: '🏰 En ville',
    SIEGING: '⚔️ Siège',
    GARRISONED: '🛡️ Garnison',
  };
  return labels[status] || status;
}

// ============================================================================
// MARKET VIEW
// ============================================================================

async function loadMarketView() {
  await loadMarketOffers();
  setupServerExchange();
  await loadTradeRoutes();
  setupMarketButtons();
}

async function loadMarketOffers() {
  const list = document.getElementById('offers-list');
  if (!list) return;

  try {
    const offerType = document.getElementById('filter-offer')?.value || '';
    const wantType = document.getElementById('filter-want')?.value || '';
    const result = await api.getMarketOffers(offerType, wantType);
    
    if (!result.offers || result.offers.length === 0) {
      list.innerHTML = '<p class="empty-queue text-center">Aucune offre disponible</p>';
      return;
    }

    list.innerHTML = result.offers.map(o => `
      <div class="offer-card">
        <div class="offer-exchange">
          <div class="offer-item">
            <div class="amount">${formatNumber(o.offerAmount)}</div>
            <div class="type">${RESOURCE_ICONS[o.offerType]} ${o.offerType}</div>
          </div>
          <div class="offer-arrow">➡️</div>
          <div class="offer-item">
            <div class="amount">${formatNumber(o.wantAmount)}</div>
            <div class="type">${RESOURCE_ICONS[o.wantType]} ${o.wantType}</div>
          </div>
        </div>
        <div class="offer-rate">Ratio: ${o.rate}:1</div>
        <button class="btn btn-small btn-primary" onclick="acceptOffer('${o.id}')">Accepter</button>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading offers:', error);
    list.innerHTML = '<p class="text-danger">Erreur de chargement</p>';
  }
}

function setupServerExchange() {
  const sellAmount = document.getElementById('sell-amount');
  const sellType = document.getElementById('sell-type');
  const buyType = document.getElementById('buy-type');
  const receiveAmount = document.getElementById('receive-amount');
  
  if (!sellAmount) return;

  const updateReceive = () => {
    const amount = parseInt(sellAmount.value) || 0;
    const marketLevel = getMarketLevel();
    const taxPercent = Math.max(10, 30 - marketLevel);
    const afterTax = Math.floor(amount * (1 - taxPercent / 100));
    
    receiveAmount.textContent = formatNumber(afterTax);
    document.getElementById('tax-percent').textContent = taxPercent;
    document.getElementById('market-level').textContent = marketLevel;
  };

  sellAmount.addEventListener('input', updateReceive);
  sellType.addEventListener('change', updateReceive);
  buyType.addEventListener('change', updateReceive);
  
  updateReceive();

  document.getElementById('btn-exchange')?.addEventListener('click', async () => {
    const city = gameState.currentCity;
    if (!city) { showToast('Sélectionnez une ville', 'warning'); return; }
    
    try {
      const result = await api.serverExchange(
        city.id,
        sellType.value,
        parseInt(sellAmount.value),
        buyType.value
      );
      showToast(`Échangé ! Reçu ${result.received.amount} ${result.received.type}`, 'success');
      await loadCityDetails(city.id);
    } catch (error) {
      showToast(error.message || 'Erreur', 'error');
    }
  });
}

function getMarketLevel() {
  const city = gameState.currentCity;
  if (!city) return 0;
  const market = (city.buildings || []).find(b => b.key === 'MARKET');
  return market?.level || 0;
}

async function loadTradeRoutes() {
  const list = document.getElementById('routes-list');
  if (!list) return;

  try {
    const routes = await api.getTradeRoutes();
    
    if (!routes || routes.length === 0) {
      list.innerHTML = '<p class="empty-queue">Aucune route commerciale</p>';
      return;
    }

    list.innerHTML = routes.map(r => `
      <div class="route-card">
        <div class="route-info">
          <span>${r.fromCityName} ➡️ ${r.toCityName}</span>
          <span class="route-resource">${RESOURCE_ICONS[r.resourceType]} ${r.percentage}%</span>
        </div>
        <div class="route-actions">
          <span class="route-status ${r.isActive ? 'active' : 'paused'}">${r.isActive ? '✅ Actif' : '⏸️ Pause'}</span>
          <button class="btn btn-small" onclick="toggleRoute('${r.id}')">${r.isActive ? 'Pause' : 'Activer'}</button>
          <button class="btn btn-small btn-danger" onclick="deleteRoute('${r.id}')">🗑️</button>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading routes:', error);
  }
}

function setupMarketButtons() {
  document.getElementById('btn-create-offer')?.addEventListener('click', openCreateOfferModal);
  document.getElementById('btn-create-route')?.addEventListener('click', openCreateRouteModal);
  
  document.getElementById('filter-offer')?.addEventListener('change', loadMarketOffers);
  document.getElementById('filter-want')?.addEventListener('change', loadMarketOffers);
}

async function acceptOffer(offerId) {
  if (!gameState.currentCity) { showToast('Sélectionnez une ville', 'warning'); return; }
  try {
    await api.acceptOffer(offerId, gameState.currentCity.id);
    showToast('Offre acceptée !', 'success');
    await loadMarketOffers();
    await loadCityDetails(gameState.currentCity.id);
  } catch (error) {
    showToast(error.message || 'Erreur', 'error');
  }
}

async function toggleRoute(routeId) {
  try {
    await api.toggleTradeRoute(routeId);
    await loadTradeRoutes();
  } catch (error) {
    showToast(error.message || 'Erreur', 'error');
  }
}

async function deleteRoute(routeId) {
  if (!confirm('Supprimer cette route ?')) return;
  try {
    await api.deleteTradeRoute(routeId);
    showToast('Route supprimée', 'success');
    await loadTradeRoutes();
  } catch (error) {
    showToast(error.message || 'Erreur', 'error');
  }
}

// ============================================================================
// ALLIANCE VIEW
// ============================================================================

async function loadAllianceView() {
  try {
    const alliance = await api.getMyAlliance();
    gameState.alliance = alliance;

    if (!alliance) {
      document.getElementById('no-alliance').classList.remove('hidden');
      document.getElementById('alliance-panel').classList.add('hidden');
      setupNoAllianceButtons();
    } else {
      document.getElementById('no-alliance').classList.add('hidden');
      document.getElementById('alliance-panel').classList.remove('hidden');
      displayAllianceInfo(alliance);
      await loadAllianceMembers(alliance.id);
    }
  } catch (error) {
    console.error('Error loading alliance:', error);
  }
}

function setupNoAllianceButtons() {
  document.getElementById('btn-create-alliance')?.addEventListener('click', openCreateAllianceModal);
  document.getElementById('btn-join-alliance')?.addEventListener('click', openSearchAllianceModal);
}

function displayAllianceInfo(alliance) {
  document.getElementById('alliance-name').textContent = `[${alliance.tag}] ${alliance.name}`;
  document.getElementById('alliance-desc').textContent = alliance.description || 'Pas de description';
  document.getElementById('alliance-members').textContent = alliance.totalMembers;
  document.getElementById('alliance-pop').textContent = formatNumber(alliance.totalPopulation);
}

async function loadAllianceMembers(allianceId) {
  const list = document.getElementById('members-list');
  if (!list) return;

  try {
    const data = await api.getAlliance(allianceId);
    const members = data.members || [];

    list.innerHTML = members.map(m => `
      <div class="member-row">
        <div class="member-info">
          <span class="member-role ${m.role.toLowerCase()}">${m.role}</span>
          <span class="member-name">${m.player?.name || 'Unknown'}</span>
        </div>
        <div class="member-stats">
          <span>👥 ${formatNumber(m.player?.population || 0)}</span>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading members:', error);
  }
}

// ============================================================================
// EXPEDITION VIEW
// ============================================================================

async function loadExpeditionView() {
  try {
    const [available, active, completed, stats] = await Promise.all([
      api.getAvailableExpeditions(),
      api.getActiveExpeditions(),
      api.getCompletedExpeditions(10),
      api.getExpeditionStats(),
    ]);

    document.getElementById('exp-available').textContent = stats.available || 0;
    document.getElementById('exp-active').textContent = stats.inProgress || 0;

    displayExpeditions('expeditions-available', available, true);
    displayExpeditions('expeditions-active', active, false);
    displayExpeditions('expeditions-completed', completed, false, true);

  } catch (error) {
    console.error('Error loading expeditions:', error);
  }
}

function displayExpeditions(containerId, expeditions, canStart, showResults = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!expeditions || expeditions.length === 0) {
    container.innerHTML = '<p class="empty-queue">Aucune expédition</p>';
    return;
  }

  container.innerHTML = expeditions.map(exp => {
    const difficulty = exp.difficulty || exp.expedition?.difficulty || 'NORMAL';
    const diffClass = difficulty.toLowerCase();
    
    return `
      <div class="expedition-card ${diffClass}">
        <span class="expedition-difficulty ${diffClass}">${difficulty}</span>
        <div class="expedition-info">
          <p>⚔️ Puissance: ${formatNumber(exp.enemyPower || exp.expedition?.enemyPower || 0)}</p>
          <p>⏱️ Durée: ${formatDuration((exp.durationSec || exp.expedition?.durationSec || 3600) * 1000)}</p>
          ${showResults && exp.won !== null ? `<p>${exp.won ? '✅ Victoire' : '❌ Défaite'} - XP: ${exp.xpGained}</p>` : ''}
        </div>
        <div class="expedition-rewards">
          <span>🎁 ${exp.lootTier || exp.expedition?.lootTier || 'COMMON'}</span>
          <span>⭐ ${exp.xpReward || exp.expedition?.xpReward || 0} XP</span>
        </div>
        ${canStart ? `<button class="btn btn-small btn-primary mt-md" onclick="openStartExpeditionModal('${exp.id}')">Lancer</button>` : ''}
      </div>
    `;
  }).join('');
}

// ============================================================================
// REPORTS VIEW
// ============================================================================

async function loadReportsView() {
  const list = document.getElementById('reports-list');
  if (!list) return;

  try {
    const battles = await api.getBattleReports();
    
    if (!battles || battles.length === 0) {
      list.innerHTML = '<p class="empty-queue text-center">Aucun rapport</p>';
      return;
    }

    list.innerHTML = battles.map(r => `
      <div class="report-card ${r.winner === 'ATTACKER' ? 'victory' : r.winner === 'DEFENDER' ? 'defeat' : 'draw'}">
        <div class="report-header">
          <span class="report-type">${r.type}</span>
          <span class="report-date">${new Date(r.createdAt).toLocaleString()}</span>
        </div>
        <div class="report-result">
          ${r.winner === 'ATTACKER' ? '⚔️ Victoire attaquant' : r.winner === 'DEFENDER' ? '🛡️ Victoire défenseur' : '🤝 Match nul'}
        </div>
        <div class="report-rounds">Rounds: ${r.rounds}</div>
        <button class="btn btn-small" onclick="viewReport('${r.id}')">Voir détails</button>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading reports:', error);
    list.innerHTML = '<p class="text-danger">Erreur de chargement</p>';
  }
}

async function viewReport(reportId) {
  try {
    const report = await api.getBattleReport(reportId);
    showModal('Rapport de bataille', `
      <div class="report-details">
        <p><strong>Type:</strong> ${report.type}</p>
        <p><strong>Rounds:</strong> ${report.rounds}</p>
        <p><strong>Résultat:</strong> ${report.winner}</p>
        <pre>${JSON.stringify(report.payload, null, 2)}</pre>
      </div>
    `);
  } catch (error) {
    showToast('Erreur de chargement du rapport', 'error');
  }
}

// ============================================================================
// QUESTS VIEW
// ============================================================================

async function loadQuestsView() {
  const container = document.getElementById('quests-content');
  if (!container) return;

  try {
    const data = await api.getQuests();
    
    container.innerHTML = `
      <div class="quests-section">
        <h3>📅 Quêtes quotidiennes</h3>
        <div class="quests-grid">
          ${(data.daily || []).map(q => renderQuestCard(q)).join('')}
        </div>
      </div>
      
      <div class="quests-section mt-lg">
        <h3>🏆 Succès</h3>
        <div class="quests-grid">
          ${(data.achievements || []).map(q => renderQuestCard(q)).join('')}
        </div>
      </div>
    `;

  } catch (error) {
    console.error('Error loading quests:', error);
    container.innerHTML = '<p class="text-danger">Erreur de chargement des quêtes</p>';
  }
}

function renderQuestCard(quest) {
  const progressPct = Math.min(100, Math.floor((quest.progress / quest.target) * 100));
  const statusClass = quest.claimed ? 'claimed' : quest.canClaim ? 'claimable' : quest.completed ? 'completed' : '';
  
  return `
    <div class="quest-card ${statusClass}">
      <div class="quest-header">
        <h4>${quest.name}</h4>
        ${quest.claimed ? '<span class="badge badge-success">✓ Réclamé</span>' : ''}
      </div>
      <p class="quest-description">${quest.description}</p>
      <div class="quest-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPct}%"></div>
        </div>
        <span class="progress-text">${quest.progress}/${quest.target}</span>
      </div>
      <div class="quest-rewards">
        ${quest.rewards.wood ? `<span>🪵 ${quest.rewards.wood}</span>` : ''}
        ${quest.rewards.stone ? `<span>🪨 ${quest.rewards.stone}</span>` : ''}
        ${quest.rewards.iron ? `<span>⛏️ ${quest.rewards.iron}</span>` : ''}
        ${quest.rewards.food ? `<span>🌾 ${quest.rewards.food}</span>` : ''}
        ${quest.rewards.xp ? `<span>⭐ ${quest.rewards.xp} XP</span>` : ''}
      </div>
      ${quest.canClaim ? `
        <button class="btn btn-primary btn-small mt-sm" onclick="claimQuest('${quest.id}')">
          Réclamer récompense
        </button>
      ` : ''}
    </div>
  `;
}

async function claimQuest(questId) {
  try {
    const result = await api.claimQuest(questId);
    showToast(result.message, 'success');
    loadQuestsView(); // Refresh
    refreshResources(); // Update resources display
  } catch (error) {
    showToast(error.message || 'Erreur', 'error');
  }
}

// ============================================================================
// MESSAGES VIEW
// ============================================================================

async function loadMessagesView() {
  const container = document.getElementById('messages-content');
  if (!container) return;

  try {
    const inbox = await api.getInbox();
    
    container.innerHTML = `
      <div class="messages-header">
        <div class="messages-tabs">
          <button class="tab-btn active" onclick="loadInbox()">📥 Boîte de réception (${inbox.unreadCount || 0})</button>
          <button class="tab-btn" onclick="loadSentMessages()">📤 Envoyés</button>
        </div>
        <button class="btn btn-primary" onclick="openComposeModal()">✉️ Nouveau message</button>
      </div>
      
      <div id="messages-list" class="messages-list">
        ${renderMessageList(inbox.messages, 'inbox')}
      </div>
    `;

  } catch (error) {
    console.error('Error loading messages:', error);
    container.innerHTML = '<p class="text-danger">Erreur de chargement des messages</p>';
  }
}

async function loadInbox() {
  try {
    const inbox = await api.getInbox();
    document.getElementById('messages-list').innerHTML = renderMessageList(inbox.messages, 'inbox');
  } catch (error) {
    showToast('Erreur de chargement', 'error');
  }
}

async function loadSentMessages() {
  try {
    const sent = await api.getSentMessages();
    document.getElementById('messages-list').innerHTML = renderMessageList(sent.messages, 'sent');
  } catch (error) {
    showToast('Erreur de chargement', 'error');
  }
}

function renderMessageList(messages, type) {
  if (!messages || messages.length === 0) {
    return '<p class="empty-queue text-center">Aucun message</p>';
  }

  return messages.map(m => `
    <div class="message-card ${!m.isRead && type === 'inbox' ? 'unread' : ''}" onclick="openMessage('${m.id}')">
      <div class="message-header">
        <span class="message-from">
          ${type === 'inbox' ? `De: ${m.sender?.name || 'Inconnu'}` : `À: ${m.receiver?.name || 'Inconnu'}`}
        </span>
        <span class="message-date">${new Date(m.createdAt).toLocaleString()}</span>
      </div>
      <div class="message-subject">${m.subject}</div>
    </div>
  `).join('');
}

async function openMessage(messageId) {
  try {
    const msg = await api.getMessage(messageId);
    showModal(msg.subject, `
      <div class="message-view">
        <div class="message-meta">
          <p><strong>De:</strong> ${msg.sender?.name || 'Inconnu'} (${msg.sender?.faction || ''})</p>
          <p><strong>À:</strong> ${msg.receiver?.name || 'Inconnu'}</p>
          <p><strong>Date:</strong> ${new Date(msg.createdAt).toLocaleString()}</p>
        </div>
        <div class="message-body">
          ${msg.content.replace(/\n/g, '<br>')}
        </div>
      </div>
    `, [
      { text: 'Répondre', class: 'btn-primary', action: () => openReplyModal(msg) },
      { text: 'Supprimer', class: 'btn-danger', action: () => deleteMessage(messageId) },
      { text: 'Fermer', class: 'btn-secondary', action: closeModal }
    ]);
  } catch (error) {
    showToast('Erreur de chargement', 'error');
  }
}

function openComposeModal() {
  showModal('Nouveau message', `
    <div class="compose-form">
      <div class="form-group">
        <label>Destinataire</label>
        <input type="text" id="msg-recipient" placeholder="Nom du joueur" class="form-input" />
      </div>
      <div class="form-group">
        <label>Sujet</label>
        <input type="text" id="msg-subject" placeholder="Sujet" class="form-input" />
      </div>
      <div class="form-group">
        <label>Message</label>
        <textarea id="msg-content" rows="5" placeholder="Votre message..." class="form-input"></textarea>
      </div>
    </div>
  `, [
    { text: 'Envoyer', class: 'btn-primary', action: sendNewMessage },
    { text: 'Annuler', class: 'btn-secondary', action: closeModal }
  ]);
}

async function sendNewMessage() {
  const recipient = document.getElementById('msg-recipient').value.trim();
  const subject = document.getElementById('msg-subject').value.trim();
  const content = document.getElementById('msg-content').value.trim();

  if (!recipient || !subject || !content) {
    showToast('Tous les champs sont requis', 'error');
    return;
  }

  try {
    await api.sendMessage(recipient, subject, content);
    showToast('Message envoyé !', 'success');
    closeModal();
    loadMessagesView();
  } catch (error) {
    showToast(error.message || 'Erreur d\'envoi', 'error');
  }
}

function openReplyModal(originalMsg) {
  closeModal();
  showModal(`Re: ${originalMsg.subject}`, `
    <div class="compose-form">
      <p class="text-muted">Réponse à: ${originalMsg.sender?.name}</p>
      <div class="form-group">
        <label>Message</label>
        <textarea id="reply-content" rows="5" placeholder="Votre réponse..." class="form-input"></textarea>
      </div>
    </div>
  `, [
    { text: 'Envoyer', class: 'btn-primary', action: () => sendReply(originalMsg.id) },
    { text: 'Annuler', class: 'btn-secondary', action: closeModal }
  ]);
}

async function sendReply(messageId) {
  const content = document.getElementById('reply-content').value.trim();
  if (!content) {
    showToast('Message requis', 'error');
    return;
  }

  try {
    await api.replyToMessage(messageId, content);
    showToast('Réponse envoyée !', 'success');
    closeModal();
    loadMessagesView();
  } catch (error) {
    showToast(error.message || 'Erreur d\'envoi', 'error');
  }
}

async function deleteMessage(messageId) {
  if (!confirm('Supprimer ce message ?')) return;
  
  try {
    await api.deleteMessage(messageId);
    showToast('Message supprimé', 'success');
    closeModal();
    loadMessagesView();
  } catch (error) {
    showToast(error.message || 'Erreur', 'error');
  }
}

// ============================================================================
// INVENTORY / HERO VIEW
// ============================================================================

async function loadInventoryView() {
  const container = document.getElementById('inventory-content');
  if (!container) return;

  try {
    const [inventory, heroEquip] = await Promise.all([
      api.getInventory(),
      api.getHeroEquipment()
    ]);

    container.innerHTML = `
      <div class="inventory-layout">
        <!-- Hero Panel -->
        <div class="hero-panel">
          <h3>🦸 ${heroEquip.hero?.name || 'Héros'}</h3>
          <div class="hero-stats">
            <div class="stat">Niveau: <strong>${heroEquip.hero?.level || 1}</strong></div>
            <div class="stat">XP: <strong>${heroEquip.hero?.xp || 0}</strong></div>
          </div>
          
          <h4>Stats effectives</h4>
          <div class="hero-effective-stats">
            <div class="stat">⚔️ Attaque: <strong>${heroEquip.effectiveStats?.attack || 10}</strong></div>
            <div class="stat">🛡️ Défense: <strong>${heroEquip.effectiveStats?.defense || 10}</strong></div>
            <div class="stat">👟 Vitesse: <strong>${heroEquip.effectiveStats?.speed || 10}</strong></div>
            <div class="stat">📦 Logistique: <strong>${heroEquip.effectiveStats?.logistics || 10}</strong></div>
          </div>
          
          <h4>Équipement</h4>
          <div class="equipment-slots">
            ${renderEquipmentSlot('WEAPON', heroEquip.equipment?.WEAPON, '⚔️')}
            ${renderEquipmentSlot('ARMOR', heroEquip.equipment?.ARMOR, '🛡️')}
            ${renderEquipmentSlot('BOOTS', heroEquip.equipment?.BOOTS, '👟')}
            ${renderEquipmentSlot('MOUNT', heroEquip.equipment?.MOUNT, '🐎')}
            ${renderEquipmentSlot('ACCESSORY', heroEquip.equipment?.ACCESSORY, '💍')}
          </div>
        </div>
        
        <!-- Inventory Panel -->
        <div class="inventory-panel">
          <h3>🎒 Inventaire (${inventory.totalItems || 0} items)</h3>
          
          <div class="inventory-filters">
            <select id="filter-slot" onchange="filterInventory()">
              <option value="">Tous les types</option>
              <option value="WEAPON">Armes</option>
              <option value="ARMOR">Armures</option>
              <option value="BOOTS">Bottes</option>
              <option value="MOUNT">Montures</option>
              <option value="ACCESSORY">Accessoires</option>
            </select>
            <select id="filter-rarity" onchange="filterInventory()">
              <option value="">Toutes raretés</option>
              <option value="COMMON">Commun</option>
              <option value="RARE">Rare</option>
              <option value="EPIC">Épique</option>
              <option value="LEGENDARY">Légendaire</option>
            </select>
          </div>
          
          <div class="inventory-grid" id="inventory-items">
            ${renderInventoryItems(inventory.items)}
          </div>
        </div>
      </div>
    `;

  } catch (error) {
    console.error('Error loading inventory:', error);
    container.innerHTML = '<p class="text-danger">Erreur de chargement de l\'inventaire</p>';
  }
}

function renderEquipmentSlot(slot, item, icon) {
  if (item) {
    return `
      <div class="equipment-slot filled rarity-${item.rarity?.toLowerCase() || 'common'}">
        <span class="slot-icon">${icon}</span>
        <span class="item-name">${item.name}</span>
        <button class="btn btn-tiny btn-secondary" onclick="unequipItem('${slot}')">✕</button>
      </div>
    `;
  }
  return `
    <div class="equipment-slot empty">
      <span class="slot-icon">${icon}</span>
      <span class="slot-name">${slot}</span>
    </div>
  `;
}

function renderInventoryItems(items) {
  if (!items || items.length === 0) {
    return '<p class="empty-queue text-center">Inventaire vide</p>';
  }

  return items.map(item => `
    <div class="inventory-item rarity-${item.rarity?.toLowerCase() || 'common'} ${item.equipped ? 'equipped' : ''}">
      <div class="item-icon">${getSlotIcon(item.slot)}</div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-rarity">${item.rarity}</div>
        <div class="item-stats">${formatItemStats(item.stats)}</div>
      </div>
      <div class="item-actions">
        ${!item.equipped ? `
          <button class="btn btn-tiny btn-primary" onclick="equipItem('${item.id}')">Équiper</button>
          <button class="btn btn-tiny btn-danger" onclick="sellItem('${item.id}', '${item.name}')">Vendre</button>
        ` : '<span class="badge">Équipé</span>'}
      </div>
    </div>
  `).join('');
}

function getSlotIcon(slot) {
  const icons = { WEAPON: '⚔️', ARMOR: '🛡️', BOOTS: '👟', MOUNT: '🐎', ACCESSORY: '💍' };
  return icons[slot] || '📦';
}

function formatItemStats(stats) {
  if (!stats || typeof stats !== 'object') return '';
  return Object.entries(stats)
    .filter(([k, v]) => v && v !== 0)
    .map(([k, v]) => `+${v} ${k.replace('Bonus', '')}`)
    .join(', ');
}

async function filterInventory() {
  const slot = document.getElementById('filter-slot').value;
  const rarity = document.getElementById('filter-rarity').value;
  
  try {
    const inventory = await api.getInventory(slot, rarity);
    document.getElementById('inventory-items').innerHTML = renderInventoryItems(inventory.items);
  } catch (error) {
    showToast('Erreur de filtrage', 'error');
  }
}

async function equipItem(playerItemId) {
  try {
    const result = await api.equipItem(playerItemId);
    showToast(result.message, 'success');
    loadInventoryView();
  } catch (error) {
    showToast(error.message || 'Erreur', 'error');
  }
}

async function unequipItem(slot) {
  try {
    const result = await api.unequipItem(slot);
    showToast(result.message, 'success');
    loadInventoryView();
  } catch (error) {
    showToast(error.message || 'Erreur', 'error');
  }
}

async function sellItem(playerItemId, itemName) {
  if (!confirm(`Vendre ${itemName} ?`)) return;
  
  try {
    const result = await api.sellItem(playerItemId);
    showToast(result.message, 'success');
    loadInventoryView();
    refreshResources();
  } catch (error) {
    showToast(error.message || 'Erreur', 'error');
  }
}
