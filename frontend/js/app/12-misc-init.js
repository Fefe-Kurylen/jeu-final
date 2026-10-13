// ============================================================
// 12-misc-init.js — Envoi de ressources, inventaire, initialisation
// Découpé depuis app.js (lignes 9685-10126) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== SEND RESOURCES ==========
async function sendResources() {
  const target = document.getElementById('send-target')?.value;
  const wood = parseInt(document.getElementById('send-wood')?.value) || 0;
  const stone = parseInt(document.getElementById('send-stone')?.value) || 0;
  const iron = parseInt(document.getElementById('send-iron')?.value) || 0;
  const food = parseInt(document.getElementById('send-food')?.value) || 0;

  if (!target) {
    showToast('Entrez une destination', 'error');
    return;
  }

  if (wood + stone + iron + food === 0) {
    showToast('Entrez des ressources à envoyer', 'error');
    return;
  }

  // Parse coordinates (format: "x|y" or "x,y")
  let targetX, targetY;
  const coordMatch = target.match(/(-?\d+)[|,](-?\d+)/);
  if (coordMatch) {
    targetX = parseInt(coordMatch[1]);
    targetY = parseInt(coordMatch[2]);
  } else {
    showToast('Format invalide. Utilisez x|y', 'error');
    return;
  }

  try {
    const res = await fetch(`${API}/api/trade/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fromCityId: currentCity.id,
        targetX,
        targetY,
        resources: { wood, stone, iron, food }
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Ressources envoyées!', 'success');
      loadCities();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

function renderSendTroopsForm() {
  const container = document.getElementById('armies-management');
  if (!container) return;

  container.innerHTML = `
    <div class="send-troops-form">
      <h3>Envoyer des troupes</h3>
      <div class="form-row">
        <label>Destination</label>
        <input type="text" id="troops-target" placeholder="x|y">
      </div>
      <div class="form-row">
        <label>Mission</label>
        <select id="troops-mission">
          <option value="ATTACK">⚔️ Attaque</option>
          <option value="RAID">💰 Raid</option>
          <option value="SUPPORT">🛡️ Renfort</option>
          <option value="SPY">🔍 Espionnage</option>
        </select>
      </div>
      <div id="troops-selection" class="troops-selection">
        <p style="color:var(--text-muted)">Chargement des troupes...</p>
      </div>
      <button class="btn-primary" onclick="sendTroops()">Envoyer</button>
    </div>
  `;

  loadTroopsForSending();
}

async function loadTroopsForSending() {
  const cityArmy = armies.find(a => a.cityId === currentCity?.id && a.status === 'IDLE');
  const container = document.getElementById('troops-selection');
  if (!container) return;

  if (!cityArmy || !cityArmy.units || cityArmy.units.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted)">Aucune troupe disponible</p>';
    return;
  }

  container.innerHTML = cityArmy.units.map(u => `
    <div class="troop-row">
      <span class="troop-name">${getUnitName(u.unitKey)}</span>
      <span class="troop-available">Dispo: ${u.count}</span>
      <input type="number" id="send-${u.unitKey}" min="0" max="${u.count}" value="0">
    </div>
  `).join('');
}

async function sendTroops() {
  const target = document.getElementById('troops-target')?.value?.trim();
  const mission = document.getElementById('troops-mission')?.value || 'ATTACK';

  if (!target) {
    showToast('Veuillez entrer une destination', 'error');
    return;
  }

  // Parse coordinates
  const coordMatch = target.match(/(-?\d+)[|,](-?\d+)/);
  if (!coordMatch) {
    showToast('Format invalide. Utilisez x|y', 'error');
    return;
  }

  const targetX = parseInt(coordMatch[1]);
  const targetY = parseInt(coordMatch[2]);

  // Collect selected troops
  const cityArmy = armies.find(a => a.cityId === currentCity?.id && a.status === 'IDLE');
  if (!cityArmy) {
    showToast('Aucune armée disponible', 'error');
    return;
  }

  const units = {};
  let totalTroops = 0;

  cityArmy.units?.forEach(u => {
    const input = document.getElementById(`send-${u.unitKey}`);
    const count = parseInt(input?.value) || 0;
    if (count > 0) {
      units[u.unitKey] = count;
      totalTroops += count;
    }
  });

  if (totalTroops === 0) {
    showToast('Sélectionnez au moins une unité', 'error');
    return;
  }

  try {
    const res = await fetch(`${API}/api/armies/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        armyId: cityArmy.id,
        targetX,
        targetY,
        mission,
        units
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`Troupes envoyées en mission ${mission}!`, 'success');
      loadArmies();
      loadCities();
    } else {
      showToast(data.error || 'Erreur lors de l\'envoi', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

function showNpcMerchant() {
  const container = document.getElementById('market-section-npc');
  if (!container) return;

  const resources = [
    { key: 'wood', icon: '🪵', name: 'Bois', current: Math.floor(currentCity?.wood || 0) },
    { key: 'stone', icon: '🧱', name: 'Argile', current: Math.floor(currentCity?.stone || 0) },
    { key: 'iron', icon: '⛏️', name: 'Fer', current: Math.floor(currentCity?.iron || 0) },
    { key: 'food', icon: '🌾', name: 'Ble', current: Math.floor(currentCity?.food || 0) }
  ];

  // NPC exchange rate: give X resources, receive Y of another type
  // Rate: 3:2 (give 3, get 2) - NPC takes a 33% cut
  const NPC_RATE_GIVE = 3;
  const NPC_RATE_RECEIVE = 2;

  container.innerHTML = `
    <div class="npc-merchant">
      <h3>🏪 Marchand Itinerant</h3>
      <p style="color:var(--text-muted);margin-bottom:12px;">
        Echangez vos ressources entre elles. Taux: <strong>${NPC_RATE_GIVE} → ${NPC_RATE_RECEIVE}</strong> (le marchand prend sa part)
      </p>

      <div class="npc-exchange-form">
        <div class="npc-row">
          <label>Je donne</label>
          <select id="npc-give-resource">
            ${resources.map(r => `<option value="${r.key}">${r.icon} ${r.name} (${formatNum(r.current)})</option>`).join('')}
          </select>
          <input type="number" id="npc-give-amount" placeholder="Quantite" min="1"
                 oninput="updateNpcPreview()">
        </div>
        <div class="npc-arrow">⬇️</div>
        <div class="npc-row">
          <label>Je recois</label>
          <select id="npc-receive-resource" onchange="updateNpcPreview()">
            ${resources.map((r, i) => `<option value="${r.key}" ${i === 1 ? 'selected' : ''}>${r.icon} ${r.name}</option>`).join('')}
          </select>
          <span id="npc-receive-preview" class="npc-preview">0</span>
        </div>
        <button onclick="executeNpcTrade()" class="btn-primary" style="margin-top:12px;">Echanger</button>
      </div>

      <div class="npc-stock" style="margin-top:16px;">
        <h4>Vos ressources</h4>
        <div class="npc-resources-grid">
          ${resources.map(r => `
            <div class="npc-res-item">
              <span>${r.icon}</span>
              <span>${formatNum(r.current)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function updateNpcPreview() {
  const giveAmount = parseInt(document.getElementById('npc-give-amount')?.value) || 0;
  const preview = document.getElementById('npc-receive-preview');
  if (preview) {
    const received = Math.floor(giveAmount * 2 / 3); // 3:2 rate
    preview.textContent = formatNum(received);
  }
}

async function executeNpcTrade() {
  if (_actionInProgress) return;
  const giveResource = document.getElementById('npc-give-resource')?.value;
  const receiveResource = document.getElementById('npc-receive-resource')?.value;
  const giveAmount = parseInt(document.getElementById('npc-give-amount')?.value) || 0;

  if (!giveResource || !receiveResource || giveAmount <= 0) {
    showToast('Entrez une quantite valide', 'error');
    return;
  }
  if (giveResource === receiveResource) {
    showToast('Choisissez des ressources differentes', 'error');
    return;
  }
  if (giveAmount < 3) {
    showToast('Minimum 3 ressources pour un echange', 'error');
    return;
  }

  _actionInProgress = true;
  try {
    const res = await fetch(`${API}/api/market/npc-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cityId: currentCity?.id, giveResource, receiveResource, giveAmount })
    });

    if (res.ok) {
      const data = await res.json();
      showToast(`Echange reussi! -${formatNum(data.given)} ${giveResource} → +${formatNum(data.received)} ${receiveResource}`, 'success');
      await loadCities();
      showNpcMerchant(); // Refresh display
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

// ========== INVENTORY ==========
async function loadInventory() {
  const container = document.getElementById('inventory-content');
  if (!container) return;

  try {
    const res = await fetch(`${API}/api/hero`, { headers: { Authorization: `Bearer ${token}` } });
    let heroItems = [];
    if (res.ok) {
      const hero = await res.json();
      heroItems = hero?.items || [];
    }

    renderInventory(heroItems);
  } catch (e) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:20px;">Erreur de chargement</p>';
  }
}

function renderInventory(items) {
  const container = document.getElementById('inventory-content');
  if (!container) return;

  // Define item categories
  const categories = {
    items: { name: 'Objets', filter: i => ['weapon', 'shield', 'head', 'chest', 'legs', 'boots', 'ring', 'amulet'].includes(i.slot) },
    materials: { name: 'Materiaux', filter: i => !['weapon', 'shield', 'head', 'chest', 'legs', 'boots', 'ring', 'amulet'].includes(i.slot) }
  };

  const currentTab = document.querySelector('#tab-inventory .toolbar-btn.active')?.textContent?.includes('Materiaux') ? 'materials' : 'items';
  const filteredItems = items.filter(categories[currentTab]?.filter || (() => true));

  if (filteredItems.length === 0) {
    container.innerHTML = `
      <div class="inventory-empty">
        <div style="font-size:48px;margin-bottom:12px;">🎒</div>
        <h3>Inventaire vide</h3>
        <p style="color:var(--text-muted)">Trouvez des objets en expedition, en pillant des tribus locales ou au combat.</p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:8px;">
          Accedez a vos troupes via la
          <strong style="color:var(--gold)">Place de rassemblement</strong> 🚩 dans votre village.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="inventory-grid">
      ${filteredItems.map(item => `
        <div class="inventory-item" onclick="showItemDetails('${item.id}')">
          <div class="item-icon">${getItemIcon(item.itemKey)}</div>
          <div class="item-info">
            <div class="item-name">${item.itemKey.replace(/_/g, ' ')}</div>
            <div class="item-slot">${EQUIPMENT_SLOTS[item.slot]?.name || item.slot}</div>
          </div>
          ${item.stats ? `
            <div class="item-stats-mini">
              ${Object.entries(item.stats).slice(0, 2).map(([k, v]) => `<span>+${v} ${k}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
    <div class="inventory-hint" style="margin-top:16px;padding:12px;background:var(--bg-dark);border-radius:6px;text-align:center;">
      <p style="color:var(--text-muted);font-size:12px;">
        Gerez vos troupes via la <strong style="color:var(--gold)">Place de rassemblement</strong> 🚩 dans votre village.
      </p>
    </div>
  `;
}

function showInventoryTab(subTab) {
  document.querySelectorAll('#tab-inventory .toolbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#tab-inventory .toolbar-btn[onclick*="${subTab}"]`)?.classList.add('active');
  loadInventory();
}

function showItemDetails(itemId) {
  const item = heroData?.items?.find(i => i.id === itemId);
  if (!item) return;

  const slotInfo = EQUIPMENT_SLOTS[item.slot] || { name: item.slot, icon: '📦' };
  showModal(`${item.itemKey.replace(/_/g, ' ')}`, `
    <div style="text-align:center;">
      <div style="font-size:48px;margin:10px 0;">${getItemIcon(item.itemKey)}</div>
      <p style="color:var(--text-muted);">Emplacement: ${slotInfo.name}</p>
      ${item.stats ? `
        <div style="margin-top:10px;text-align:left;">
          ${Object.entries(item.stats).map(([k, v]) => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-dark);">
              <span>${k}</span><span style="color:var(--green-light);">+${v}</span>
            </div>
          `).join('')}
        </div>
      ` : '<p style="color:var(--text-muted)">Aucun bonus</p>'}
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">
        <button class="btn-primary" onclick="equipItem('${item.id}');closeModal();">Equiper</button>
        <button class="btn btn-danger btn-small" onclick="dropItem('${item.id}');closeModal();" style="padding:8px 16px;">Jeter</button>
      </div>
    </div>
  `);
}

async function equipItem(itemId) {
  try {
    const res = await fetch(`${API}/api/hero/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ itemId })
    });
    if (res.ok) {
      showToast('Objet equipe!', 'success');
      loadInventory();
      loadHero();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  }
}

async function dropItem(itemId) {
  try {
    const res = await fetch(`${API}/api/hero/drop-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ itemId })
    });
    if (res.ok) {
      showToast('Objet jete', 'success');
      loadInventory();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  }
}

// ========== INIT ==========
window.onload = () => {
  if (token) {
    showGame();
  }
};

// Close modal on outside click
document.getElementById('modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

