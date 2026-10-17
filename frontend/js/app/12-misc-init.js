// ============================================================
// 12-misc-init.js — Envoi de ressources, inventaire, initialisation
// Découpé depuis app.js (lignes 9685-10126) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== SEND RESOURCES ==========
async function sendResources() {
  const target = readCoordPair('send-target');
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

// Field armies of the current city that are home and have units
function sendableArmies() {
  return armies.filter(a => a.cityId === currentCity?.id && !a.isGarrison && a.status === 'IDLE' && a.units?.length > 0 && a.x === currentCity?.x && a.y === currentCity?.y);
}

function renderSendTroopsForm() {
  const container = document.getElementById('armies-management');
  if (!container) return;
  const available = sendableArmies();

  container.innerHTML = `
    <div class="send-troops-form">
      <h3>Envoyer une armée</h3>
      <p style="font-size:12px;color:var(--text-muted)">Composez vos armées dans l'onglet Aperçu, puis envoyez-les ici ou depuis la carte.</p>
      <div class="form-row">
        <label>Armée</label>
        <select id="troops-army">
          ${available.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${a.units.reduce((s, u) => s + u.count, 0)} unités)</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>Destination</label>
        <div class="coord-pair"><input type="number" id="troops-target-x" placeholder="X" inputmode="numeric" pattern="-?[0-9]*" enterkeyhint="next"><span class="coord-sep">|</span><input type="number" id="troops-target-y" placeholder="Y" inputmode="numeric" pattern="-?[0-9]*" enterkeyhint="done"></div>
      </div>
      <div class="form-row">
        <label>Mission</label>
        <select id="troops-mission">
          <option value="ATTACK">⚔️ Attaque (engins de siège requis)</option>
          <option value="RAID">💰 Pillage</option>
          <option value="SPY">🔍 Espionnage</option>
          <option value="MOVE">🚶 Déplacement</option>
        </select>
      </div>
      ${available.length ? '<button class="btn-primary" onclick="sendTroops()">Envoyer</button>' : '<p style="color:var(--text-muted)">Aucune armée prête : créez-en une au point de ralliement et ajoutez-y des unités.</p>'}
    </div>
  `;
}

async function sendTroops() {
  const target = readCoordPair('troops-target');
  const mission = document.getElementById('troops-mission')?.value || 'ATTACK';
  const armyId = document.getElementById('troops-army')?.value;

  if (!armyId) {
    showToast('Aucune armée disponible', 'error');
    return;
  }
  if (!target) {
    showToast('Veuillez entrer une destination', 'error');
    return;
  }

  const coordMatch = target.match(/(-?\d+)[|,](-?\d+)/);
  if (!coordMatch) {
    showToast('Format invalide. Utilisez x|y', 'error');
    return;
  }
  const targetX = parseInt(coordMatch[1]);
  const targetY = parseInt(coordMatch[2]);

  try {
    if (typeof trackOnce === 'function') trackOnce('first_army_send');
    const res = await fetch(`${API}/api/armies/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ armyId, targetX, targetY, mission })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Armée envoyée !', 'success');
      await loadArmies();
      renderSendTroopsForm();
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
    { key: 'wood', icon: resIconHtml('wood'), name: 'Bois', current: Math.floor(currentCity?.wood || 0) },
    { key: 'stone', icon: resIconHtml('stone'), name: 'Argile', current: Math.floor(currentCity?.stone || 0) },
    { key: 'iron', icon: resIconHtml('iron'), name: 'Fer', current: Math.floor(currentCity?.iron || 0) },
    { key: 'food', icon: resIconHtml('food'), name: 'Blé', current: Math.floor(currentCity?.food || 0) }
  ];

  // NPC exchange rate: give X resources, receive Y of another type
  // Rate: 3:2 (give 3, get 2) - NPC takes a 33% cut
  const NPC_RATE_GIVE = 3;
  const NPC_RATE_RECEIVE = 2;

  container.innerHTML = `
    <div class="npc-merchant">
      <h3><img class="ico" src="assets/images/3d/ui/market.webp" alt=""> Marchand itinérant</h3>
      <p style="color:var(--text-muted);margin-bottom:12px;">
        Échangez vos ressources entre elles. Taux: <strong>${NPC_RATE_GIVE} → ${NPC_RATE_RECEIVE}</strong> (le marchand prend sa part)
      </p>

      <div class="npc-exchange-form">
        <div class="npc-row">
          <label>Je donne</label>
          <select id="npc-give-resource">
            ${resources.map(r => `<option value="${r.key}">${r.icon} ${r.name} (${formatNum(r.current)})</option>`).join('')}
          </select>
          <input type="number" id="npc-give-amount" placeholder="Quantité" min="1"
                 oninput="updateNpcPreview()">
        </div>
        <div class="npc-arrow">⬇️</div>
        <div class="npc-row">
          <label>Je reçois</label>
          <select id="npc-receive-resource" onchange="updateNpcPreview()">
            ${resources.map((r, i) => `<option value="${r.key}" ${i === 1 ? 'selected' : ''}>${r.icon} ${r.name}</option>`).join('')}
          </select>
          <span id="npc-receive-preview" class="npc-preview">0</span>
        </div>
        <button onclick="executeNpcTrade()" class="btn-primary" style="margin-top:12px;">Échanger</button>
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
      showToast(`Échange réussi ! -${formatNum(data.given)} ${giveResource} → +${formatNum(data.received)} ${receiveResource}`, 'success');
      await loadCities();
      showNpcMerchant(); // Refresh display
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
    materials: { name: 'Matériaux', filter: i => !['weapon', 'shield', 'head', 'chest', 'legs', 'boots', 'ring', 'amulet'].includes(i.slot) }
  };

  const currentTab = document.querySelector('#tab-inventory .toolbar-btn.active')?.textContent?.includes('Matériaux') ? 'materials' : 'items';
  const filteredItems = items.filter(categories[currentTab]?.filter || (() => true));

  if (filteredItems.length === 0) {
    container.innerHTML = `
      <div class="inventory-empty">
        <div style="font-size:48px;margin-bottom:12px;">${resIconHtml('inventory')}</div>
        <h3>Inventaire vide</h3>
        <p style="color:var(--text-muted)">Trouvez des objets en expedition, en pillant des tribus locales ou au combat.</p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:8px;">
          Accédez à vos troupes via la
          <strong style="color:var(--gold)">Place de rassemblement</strong> <img class="ico" src="assets/images/3d/ui/rally.webp" alt=""> dans votre village.
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
            <div class="item-name">${escapeHtml(getItemName(item.itemKey))}</div>
            <div class="item-slot">${EQUIPMENT_SLOTS[item.slot]?.name || (item.slot === 'inventory' ? 'Dans le sac' : item.slot)} · ${itemStatsHtml(item.stats || itemDef(item.itemKey)?.stats)}</div>
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
        Gérez vos troupes via la <strong style="color:var(--gold)">Place de rassemblement</strong> <img class="ico" src="assets/images/3d/ui/rally.webp" alt=""> dans votre village.
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

  const slotInfo = EQUIPMENT_SLOTS[item.slot] || { name: item.slot, item: 'crate' };
  showModal(`${getItemName(item.itemKey)}`, `
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
        <button class="btn-primary" onclick="equipItem('${item.id}');closeModal();">Équiper</button>
        <button class="btn btn-danger btn-small" onclick="confirmDropItem('${item.id}')" style="padding:8px 16px;">Jeter</button>
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
      showToast('Objet équipé !', 'success');
      loadInventory();
      loadHero();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
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
      showToast('Objet jeté', 'success');
      loadInventory();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
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


// Lit une paire de champs numériques <id>-x / <id>-y (ou l'ancien champ texte "x|y") et renvoie "x|y"
function readCoordPair(id) {
  const xEl = document.getElementById(id + '-x'), yEl = document.getElementById(id + '-y');
  if (xEl && yEl) return (xEl.value.trim() === '' || yEl.value.trim() === '') ? '' : `${parseInt(xEl.value, 10)}|${parseInt(yEl.value, 10)}`;
  return document.getElementById(id)?.value?.trim() || '';
}

async function confirmDropItem(itemId) {
  closeModal();
  if (await confirmModal('Jeter définitivement cet objet ?', { title: 'Jeter', okLabel: 'Jeter', danger: true })) dropItem(itemId);
}
