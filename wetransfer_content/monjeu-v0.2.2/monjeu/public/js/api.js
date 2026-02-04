// ============================================================================
// API CLIENT - MonJeu v0.2.1
// ============================================================================

const API_BASE = '';

class GameAPI {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  // --------------------------------------------------------------------------
  // HTTP Methods
  // --------------------------------------------------------------------------

  async request(method, endpoint, data = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const config = { method, headers };
    if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, config);
      
      if (response.status === 401) {
        this.logout();
        throw new Error('Session expirée');
      }

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Erreur serveur');
      return result;
    } catch (error) {
      console.error(\`API Error [\${method} \${endpoint}]:\`, error);
      throw error;
    }
  }

  get(endpoint) { return this.request('GET', endpoint); }
  post(endpoint, data) { return this.request('POST', endpoint, data); }
  patch(endpoint, data) { return this.request('PATCH', endpoint, data); }
  delete(endpoint) { return this.request('DELETE', endpoint); }

  // --------------------------------------------------------------------------
  // Auth
  // --------------------------------------------------------------------------

  async login(email, password) {
    const result = await this.post('/auth/login', { email, password });
    if (result.access_token) {
      this.token = result.access_token;
      localStorage.setItem('token', this.token);
    }
    return result;
  }

  async register(name, email, password, faction) {
    const result = await this.post('/auth/register', { name, email, password, faction });
    if (result.access_token) {
      this.token = result.access_token;
      localStorage.setItem('token', this.token);
    }
    return result;
  }

  logout() {
    this.token = null;
    localStorage.removeItem('token');
    window.location.reload();
  }

  isAuthenticated() { return !!this.token; }

  // --------------------------------------------------------------------------
  // Player
  // --------------------------------------------------------------------------

  getPlayer() { return this.get('/player/me'); }
  bootstrap() { return this.post('/player/bootstrap'); }

  // --------------------------------------------------------------------------
  // City
  // --------------------------------------------------------------------------

  getCity(cityId) { return this.get(\`/city/\${cityId}\`); }
  getCities() { return this.get('/player/cities'); }
  startBuild(cityId, slot, buildingKey) { return this.post(\`/city/\${cityId}/build/start\`, { slot, buildingKey }); }
  cancelBuild(cityId, queueId) { return this.post(\`/city/\${cityId}/build/cancel\`, { queueId }); }
  recruit(cityId, unitKey, count, buildingKey) { return this.post(\`/city/\${cityId}/recruit\`, { unitKey, count, buildingKey }); }

  // --------------------------------------------------------------------------
  // Army
  // --------------------------------------------------------------------------

  getArmies() { return this.get('/army/list'); }
  moveArmy(armyId, x, y) { return this.post('/army/move', { armyId, x, y }); }
  attackArmy(armyId, x, y) { return this.post('/army/attack', { armyId, x, y }); }
  raidArmy(armyId, x, y) { return this.post('/army/raid', { armyId, x, y }); }
  spyArmy(armyId, x, y, targetType) { return this.post('/army/spy', { armyId, x, y, targetType }); }

  // --------------------------------------------------------------------------
  // Map
  // --------------------------------------------------------------------------

  getMapViewport(x, y, zoom = 10) { return this.get(\`/map/viewport?x=\${x}&y=\${y}&zoom=\${zoom}\`); }
  getTileInfo(x, y) { return this.get(\`/map/tile?x=\${x}&y=\${y}\`); }

  // --------------------------------------------------------------------------
  // Market
  // --------------------------------------------------------------------------

  getMarketOffers(offerType = '', wantType = '', page = 1) {
    let url = \`/market/offers?page=\${page}\`;
    if (offerType) url += \`&offerType=\${offerType}\`;
    if (wantType) url += \`&wantType=\${wantType}\`;
    return this.get(url);
  }
  getMyOffers() { return this.get('/market/my-offers'); }
  createOffer(cityId, offerType, offerAmount, wantType, wantAmount) { return this.post('/market/offer', { cityId, offerType, offerAmount, wantType, wantAmount }); }
  acceptOffer(offerId, cityId) { return this.post(\`/market/offer/\${offerId}/accept\`, { cityId }); }
  cancelOffer(offerId) { return this.delete(\`/market/offer/\${offerId}\`); }
  serverExchange(cityId, sellType, sellAmount, buyType) { return this.post('/market/server/exchange', { cityId, sellType, sellAmount, buyType }); }
  getTradeRoutes() { return this.get('/market/routes'); }
  createTradeRoute(fromCityId, toCityId, resourceType, percentage, intervalHours) { return this.post('/market/routes', { fromCityId, toCityId, resourceType, percentage, intervalHours }); }
  toggleTradeRoute(routeId) { return this.post(\`/market/routes/\${routeId}/toggle\`); }
  deleteTradeRoute(routeId) { return this.delete(\`/market/routes/\${routeId}\`); }

  // --------------------------------------------------------------------------
  // Alliance
  // --------------------------------------------------------------------------

  getAlliance(allianceId) { return this.get(\`/alliance/\${allianceId}\`); }
  getMyAlliance() { return this.get('/alliance/my'); }
  createAlliance(tag, name, description) { return this.post('/alliance/create', { tag, name, description }); }
  searchAlliances(query) { return this.get(\`/alliance/search?q=\${encodeURIComponent(query)}\`); }
  inviteToAlliance(allianceId, playerName) { return this.post(\`/alliance/\${allianceId}/invite\`, { playerName }); }
  acceptInvite(inviteId) { return this.post(\`/alliance/invite/\${inviteId}/accept\`); }
  declineInvite(inviteId) { return this.post(\`/alliance/invite/\${inviteId}/decline\`); }
  leaveAlliance(allianceId) { return this.post(\`/alliance/\${allianceId}/leave\`); }
  kickMember(allianceId, playerId) { return this.delete(\`/alliance/\${allianceId}/kick/\${playerId}\`); }
  promoteMember(allianceId, playerId) { return this.post(\`/alliance/\${allianceId}/promote/\${playerId}\`); }
  demoteMember(allianceId, playerId) { return this.post(\`/alliance/\${allianceId}/demote/\${playerId}\`); }
  setDiplomacy(allianceId, targetId, status) { return this.post(\`/alliance/\${allianceId}/diplomacy/\${targetId}\`, { status }); }
  sendAllianceMessage(allianceId, content) { return this.post(\`/alliance/\${allianceId}/message\`, { content }); }
  getAllianceMessages(allianceId, limit = 50) { return this.get(\`/alliance/\${allianceId}/messages?limit=\${limit}\`); }

  // --------------------------------------------------------------------------
  // Bastion
  // --------------------------------------------------------------------------

  getBastionStatus(allianceId) { return this.get(\`/bastion/\${allianceId}\`); }
  initiateBastion(allianceId, x, y) { return this.post(\`/bastion/\${allianceId}/initiate\`, { x, y }); }
  contributeToBastion(allianceId, cityId, wood, stone, iron, food) { return this.post(\`/bastion/\${allianceId}/contribute\`, { cityId, wood, stone, iron, food }); }
  garrisonAtBastion(allianceId, armyId) { return this.post(\`/bastion/\${allianceId}/garrison\`, { armyId }); }
  withdrawFromBastion(allianceId, armyId) { return this.post(\`/bastion/\${allianceId}/withdraw\`, { armyId }); }
  getBastionLeaderboard(allianceId) { return this.get(\`/bastion/\${allianceId}/leaderboard\`); }

  // --------------------------------------------------------------------------
  // Expedition
  // --------------------------------------------------------------------------

  getAvailableExpeditions() { return this.get('/expedition/available'); }
  getActiveExpeditions() { return this.get('/expedition/active/list'); }
  getCompletedExpeditions(limit = 20) { return this.get(\`/expedition/completed/list?limit=\${limit}\`); }
  getExpedition(expeditionId) { return this.get(\`/expedition/\${expeditionId}\`); }
  startExpedition(expeditionId, armyId) { return this.post(\`/expedition/\${expeditionId}/start\`, { armyId }); }
  generateExpedition() { return this.post('/expedition/generate'); }
  getExpeditionStats() { return this.get('/expedition/stats/summary'); }

  // --------------------------------------------------------------------------
  // Reports
  // --------------------------------------------------------------------------

  getBattleReports(limit = 20) { return this.get(\`/reports/battles?limit=\${limit}\`); }
  getSpyReports(limit = 20) { return this.get(\`/reports/spy?limit=\${limit}\`); }
  getBattleReport(reportId) { return this.get(\`/reports/battle/\${reportId}\`); }

  // --------------------------------------------------------------------------
  // Quests
  // --------------------------------------------------------------------------

  getQuests() { return this.get('/quests'); }
  claimQuest(questId) { return this.post(\`/quests/\${questId}/claim\`); }

  // --------------------------------------------------------------------------
  // Messages
  // --------------------------------------------------------------------------

  getInbox(page = 1, limit = 20, unreadOnly = false) { return this.get(\`/messages/inbox?page=\${page}&limit=\${limit}&unreadOnly=\${unreadOnly}\`); }
  getSentMessages(page = 1, limit = 20) { return this.get(\`/messages/sent?page=\${page}&limit=\${limit}\`); }
  getMessage(messageId) { return this.get(\`/messages/\${messageId}\`); }
  sendMessage(receiverName, subject, content) { return this.post('/messages/send', { receiverName, subject, content }); }
  replyToMessage(messageId, content) { return this.post(\`/messages/\${messageId}/reply\`, { content }); }
  deleteMessage(messageId) { return this.delete(\`/messages/\${messageId}\`); }
  markAllMessagesRead() { return this.post('/messages/mark-all-read'); }
  getUnreadCount() { return this.get('/messages/unread/count'); }
  searchPlayers(query) { return this.get(\`/messages/players/search?q=\${encodeURIComponent(query)}\`); }

  // --------------------------------------------------------------------------
  // Inventory & Hero Equipment
  // --------------------------------------------------------------------------

  getInventory(slot = '', rarity = '') {
    let url = '/inventory';
    const params = [];
    if (slot) params.push(\`slot=\${slot}\`);
    if (rarity) params.push(\`rarity=\${rarity}\`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.get(url);
  }
  getHeroEquipment() { return this.get('/inventory/hero'); }
  equipItem(playerItemId) { return this.post(\`/inventory/equip/\${playerItemId}\`); }
  unequipItem(slot) { return this.post(\`/inventory/unequip/\${slot}\`); }
  sellItem(playerItemId) { return this.delete(\`/inventory/\${playerItemId}/sell\`); }
  allocateHeroPoints(attack, defense, speed, logistics) { return this.post('/inventory/hero/allocate', { attack, defense, speed, logistics }); }
}

// Global API instance
const api = new GameAPI();
