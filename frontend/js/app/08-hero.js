// ============================================================
// 08-hero.js — Héros : fiche, Domus, expéditions
// Découpé depuis app.js (lignes 7754-8255) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== HERO ==========

// Equipment slots definition
// Emplacements d'équipement : position sur la scène du héros et objet de référence (icône 3D de l'emplacement vide)
const EQUIPMENT_SLOTS = {
  head: { name: 'Tete', item: 'bronze_helm', x: 50, y: 5 },
  chest: { name: 'Torse', item: 'leather_armor', x: 50, y: 28 },
  weapon: { name: 'Arme', item: 'iron_sword', x: 15, y: 35 },
  shield: { name: 'Bouclier', item: 'wooden_shield', x: 85, y: 35 },
  legs: { name: 'Jambes', item: 'leather_pants', x: 50, y: 55 },
  boots: { name: 'Bottes', item: 'iron_boots', x: 50, y: 78 },
  ring: { name: 'Anneau', item: 'gold_ring', x: 15, y: 60 },
  amulet: { name: 'Amulette', item: 'war_amulet', x: 85, y: 60 }
};

let heroData = null;

async function loadHero() {
  let res;
  try {
    res = await fetch(`${API}/api/hero`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    console.error('loadHero error:', e);
    showToast('Erreur réseau', 'error');
    return;
  }
  const panel = document.getElementById('hero-panel');

  if (res.ok) {
    const hero = await res.json();
    heroData = hero;
    if (hero) {
      const xpPct = Math.min(100, (hero.xp / hero.xpToNextLevel) * 100);
      const xpRemaining = hero.xpToNextLevel - hero.xp;

      // Build equipment map from hero items
      const equippedItems = {};
      if (hero.items) {
        hero.items.forEach(item => { equippedItems[item.slot] = item; });
      }

      panel.innerHTML = `
        <div class="hero-full-panel">
          <!-- Left: Hero info + Stats -->
          <div class="hero-left-col">
            <div class="hero-identity">
              <div class="hero-portrait-large">${heroPortraitHtml(player?.faction, 'hero-ico-lg')}</div>
              <div class="hero-name-level">
                <h3>${escapeHtml(hero.name)}</h3>
                <span class="hero-level-badge">Niv. ${hero.level}</span>
              </div>
            </div>

            <!-- XP Bar -->
            <div class="hero-xp-section">
              <div class="xp-label">
                <span>Experience</span>
                <span class="xp-numbers">${formatNum(hero.xp)} / ${formatNum(hero.xpToNextLevel)}</span>
              </div>
              <div class="xp-bar-outer">
                <div class="xp-bar-inner" style="width:${xpPct}%">
                  <span class="xp-bar-text">${xpPct.toFixed(1)}%</span>
                </div>
              </div>
              <div class="xp-remaining">${formatNum(xpRemaining)} XP restants</div>
            </div>

            <!-- Stats -->
            <div class="hero-stats-grid">
              <div class="hero-stat-row">
                <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""></span>
                <span class="stat-label">Attaque</span>
                <span class="stat-val">${hero.attack + hero.atkPoints}</span>
                ${hero.statPoints > 0 ? `<button class="stat-plus-btn" onclick="assignPoint('atk')">+</button>` : ''}
              </div>
              <div class="hero-stat-row">
                <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""></span>
                <span class="stat-label">Defense</span>
                <span class="stat-val">${hero.defense + hero.defPoints}</span>
                ${hero.statPoints > 0 ? `<button class="stat-plus-btn" onclick="assignPoint('def')">+</button>` : ''}
              </div>
              <div class="hero-stat-row">
                <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/expedition.webp" alt=""></span>
                <span class="stat-label">Vitesse</span>
                <span class="stat-val">${hero.speed + hero.spdPoints}</span>
                ${hero.statPoints > 0 ? `<button class="stat-plus-btn" onclick="assignPoint('spd')">+</button>` : ''}
              </div>
              <div class="hero-stat-row">
                <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/item_crate.webp" alt=""></span>
                <span class="stat-label">Logistique</span>
                <span class="stat-val">${hero.logistics + hero.logPoints}</span>
                ${hero.statPoints > 0 ? `<button class="stat-plus-btn" onclick="assignPoint('log')">+</button>` : ''}
              </div>
            </div>
            ${hero.statPoints > 0 ? `
              <div class="hero-free-points">
                <span>Points a distribuer:</span>
                <span class="free-points-count">${hero.statPoints}</span>
              </div>
            ` : ''}
          </div>

          <!-- Right: Body Equipment -->
          <div class="hero-right-col">
            <h4 class="equipment-title">Equipement</h4>
            <div class="hero-body-container">
              <!-- Body silhouette -->
              <div class="hero-body-silhouette">
                <img class="body-sprite" src="${heroStageUrl(player?.faction)}" alt="">

                <!-- Equipment slot overlays -->
                ${Object.entries(EQUIPMENT_SLOTS).map(([slot, info]) => {
                  const equipped = equippedItems[slot];
                  const isEmpty = !equipped;
                  return `
                    <div class="equip-slot ${isEmpty ? 'empty' : 'filled'}"
                         style="left:${info.x}%;top:${info.y}%"
                         onclick="onEquipSlotClick('${slot}')"
                         title="${info.name}${equipped ? ': ' + equipped.itemKey : ' (vide)'}">
                      <span class="equip-slot-icon">${equipped ? getItemIcon(equipped.itemKey) : getItemIcon(info.item)}</span>
                      ${!isEmpty ? '<span class="equip-slot-badge">!</span>' : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>

          <!-- Expeditions -->
          <div class="hero-expeditions">
            <h4 class="equipment-title"><img class="ico" src="assets/images/3d/ui/expedition.webp" alt=""> Expéditions</h4>
            <p style="font-size:12px;color:var(--text-muted)">Envoyez une armée (hors garnison) en expédition : XP pour le héros qui l'accompagne, or en récompense, quelques pertes selon la difficulté.</p>
            <div id="expeditions-available" class="expeditions-grid"><p style="color:var(--text-muted)">Chargement…</p></div>
            <h4 class="equipment-title" style="margin-top:12px">Historique</h4>
            <div id="expeditions-history"></div>
          </div>
        </div>
      `;
      loadExpeditions();
    } else {
      panel.innerHTML = '<p style="color:var(--text-muted)">Aucun heros. Construisez une Demeure du Heros.</p>';
    }
  }
}

// Icône 3D d'un objet (assets/images/3d/ui/item_<clé>.webp), caisse pour les objets sans icône dédiée
const ITEM_ICON_KEYS = new Set(['iron_sword', 'steel_sword', 'bronze_helm', 'iron_helm', 'leather_armor', 'chain_mail', 'iron_boots', 'war_boots', 'gold_ring', 'war_amulet', 'wooden_shield', 'iron_shield', 'leather_pants', 'chain_legs']);
function getItemIcon(itemKey) {
  return `<img class="item-ico" src="assets/images/3d/ui/item_${ITEM_ICON_KEYS.has(itemKey) ? itemKey : 'crate'}.webp" alt="">`;
}

function onEquipSlotClick(slotKey) {
  const slotInfo = EQUIPMENT_SLOTS[slotKey];
  const equipped = heroData?.items?.find(i => i.slot === slotKey);

  if (equipped) {
    // Show equipped item details
    showModal(`${slotInfo.name} - ${equipped.itemKey}`, `
      <div style="text-align:center;">
        <div style="font-size:48px;margin:10px 0;">${getItemIcon(equipped.itemKey)}</div>
        <h4>${equipped.itemKey.replace(/_/g, ' ')}</h4>
        ${equipped.stats ? `
          <div style="margin-top:10px;text-align:left;">
            ${Object.entries(equipped.stats).map(([k, v]) => `
              <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-dark);">
                <span>${k}</span><span style="color:var(--green-light);">+${v}</span>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color:var(--text-muted)">Aucun bonus</p>'}
        <button class="btn-primary" onclick="unequipItem('${equipped.id}');closeModal();" style="margin-top:12px;">Desequiper</button>
      </div>
    `);
  } else {
    // Show empty slot info
    showModal(`${slotInfo.name} - Vide`, `
      <div style="text-align:center;">
        <div style="font-size:48px;margin:10px 0;opacity:0.35;">${getItemIcon(slotInfo.item)}</div>
        <p style="color:var(--text-muted)">Emplacement vide</p>
        <p style="color:var(--text-muted);font-size:12px;">Trouvez des objets en expedition ou au combat.</p>
      </div>
    `);
  }
}

async function unequipItem(itemId) {
  try {
    const res = await fetch(`${API}/api/hero/unequip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ itemId })
    });
    if (res.ok) {
      showToast('Objet desequipe', 'success');
      loadHero();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  }
}

async function assignPoint(stat) {
  try {
    const body = { atk: 0, def: 0, spd: 0, log: 0 };
    body[stat] = 1;

    const res = await fetch(`${API}/api/hero/assign-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      showToast('Point assigne!', 'success');
      loadHero();
    } else {
      const data = await res.json();
      showToast(data.error || 'Plus de points disponibles', 'error');
    }
  } catch (e) {
    console.error('assignPoint error:', e);
    showToast('Erreur reseau', 'error');
  }
}

// ========== HERO MANAGEMENT PANEL (Domus du héros) ==========
async function openHeroManagementPanel(buildingLevel, slotNum) {
  const panel = document.getElementById('build-panel');
  const content = document.getElementById('build-panel-content');
  const title = document.getElementById('build-panel-title');

  // Fetch hero data
  let hero = null;
  try {
    const res = await fetch(`${API}/api/hero`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      hero = await res.json();
    }
  } catch (e) {
    console.error('Error loading hero:', e);
  }

  // Calculate bonuses from building level
  const xpBonus = buildingLevel * 2;
  const statBonus = buildingLevel * 1;

  title.innerHTML = `<span class="building-detail-icon"><img class="ico" src="assets/images/3d/ui/city.webp" alt=""></span> Domus du héros`;

  if (!hero) {
    content.innerHTML = `
      <div class="hero-management-panel">
        <div class="hero-empty-state">
          <div class="hero-empty-icon"><img class="ico" src="assets/images/3d/ui/player.webp" alt=""></div>
          <h3>Aucun héros</h3>
          <p>Votre héros n'a pas encore été créé.</p>
          <button class="btn btn-primary" onclick="createHero()">Créer un héros</button>
        </div>
        <div class="building-bonus-section">
          <h4><img class="ico" src="assets/images/3d/ui/stats.webp" alt=""> Bonus du bâtiment (Niv.${buildingLevel})</h4>
          <div class="bonus-grid">
            <div class="bonus-item"><span><img class="ico" src="assets/images/3d/ui/bolt.webp" alt=""> XP Bonus:</span><span>+${xpBonus}%</span></div>
            <div class="bonus-item"><span><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""> Stats Bonus:</span><span>+${statBonus}%</span></div>
          </div>
        </div>
      </div>
    `;
  } else {
    const xpPct = (hero.xp / hero.xpToNextLevel) * 100;
    const canAssignPoints = hero.statPoints > 0;

    content.innerHTML = `
      <div class="hero-management-panel">
        <!-- Hero Profile Section -->
        <div class="hero-profile-section">
          <div class="hero-avatar-large">${heroPortraitHtml(player?.faction, 'hero-ico-lg')}</div>
          <div class="hero-profile-info">
            <h3 class="hero-name-large">${escapeHtml(hero.name)}</h3>
            <div class="hero-level-badge">Niveau ${hero.level}</div>
            <div class="hero-xp-bar-container">
              <div class="hero-xp-bar">
                <div class="hero-xp-fill" style="width:${xpPct}%"></div>
              </div>
              <div class="hero-xp-text">${hero.xp} / ${hero.xpToNextLevel} XP</div>
            </div>
          </div>
        </div>

        <!-- Stats Section -->
        <div class="hero-stats-section">
          <h4><img class="ico" src="assets/images/3d/ui/stats.webp" alt=""> Statistiques</h4>
          <div class="hero-stats-grid">
            <div class="hero-stat-card">
              <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""></span>
              <span class="stat-name">Attaque</span>
              <span class="stat-value">${hero.atkPoints}</span>
              ${canAssignPoints ? `<button class="stat-plus-btn" onclick="assignPointFromPanel('atk')">+</button>` : ''}
            </div>
            <div class="hero-stat-card">
              <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""></span>
              <span class="stat-name">Défense</span>
              <span class="stat-value">${hero.defPoints}</span>
              ${canAssignPoints ? `<button class="stat-plus-btn" onclick="assignPointFromPanel('def')">+</button>` : ''}
            </div>
            <div class="hero-stat-card">
              <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/expedition.webp" alt=""></span>
              <span class="stat-name">Vitesse</span>
              <span class="stat-value">${hero.spdPoints}</span>
              ${canAssignPoints ? `<button class="stat-plus-btn" onclick="assignPointFromPanel('spd')">+</button>` : ''}
            </div>
            <div class="hero-stat-card">
              <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/item_crate.webp" alt=""></span>
              <span class="stat-name">Logistique</span>
              <span class="stat-value">${hero.logPoints}</span>
              ${canAssignPoints ? `<button class="stat-plus-btn" onclick="assignPointFromPanel('log')">+</button>` : ''}
            </div>
          </div>
          ${canAssignPoints ? `<div class="points-available-banner"><img class="ico" src="assets/images/3d/ui/target.webp" alt=""> ${hero.statPoints} points à distribuer</div>` : ''}
        </div>

        <!-- Building Bonus Section -->
        <div class="building-bonus-section">
          <h4><img class="ico" src="assets/images/3d/ui/city.webp" alt=""> Bonus du Domus (Niv.${buildingLevel})</h4>
          <div class="bonus-grid">
            <div class="bonus-item"><span><img class="ico" src="assets/images/3d/ui/bolt.webp" alt=""> XP Bonus:</span><span class="bonus-value">+${xpBonus}%</span></div>
            <div class="bonus-item"><span><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""> Stats Bonus:</span><span class="bonus-value">+${statBonus}%</span></div>
          </div>
        </div>

        <!-- Actions Section -->
        <div class="hero-actions-section">
          <button class="btn btn-secondary" onclick="renameHero()">✏️ Renommer</button>
          <button class="btn btn-info" onclick="showHeroEquipment()">${resIconHtml('inventory')} Équipement</button>
          <button class="btn btn-warning" onclick="showTab('hero'); closeBuildPanel();"><img class="ico" src="assets/images/3d/ui/reports.webp" alt=""> Expéditions</button>
        </div>
      </div>
    `;
  }

  // Show panel
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  overlay.classList.add('fade-in');

  panel.classList.add('open');
  panel.style.display = 'flex';
}

// Assign point from hero panel and refresh
async function assignPointFromPanel(stat) {
  await assignPoint(stat);
  // Refresh the panel
  const heroHomeBuilding = currentCity?.buildings?.find(b => b.key === 'HERO_HOME' || b.key === 'HERO_MANSION');
  if (heroHomeBuilding) {
    openHeroManagementPanel(heroHomeBuilding.level, selectedBuildSlot);
  }
}

// Create hero (placeholder)
async function createHero() {
  const name = await promptModal('Comment s\'appelle votre héros ?', { title: 'Nom du héros', placeholder: 'Nom', maxLength: 30 });
  if (!name) return;

  try {
    const res = await fetch(`${API}/api/hero/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name })
    });

    if (res.ok) {
      showToast('Héros créé!', 'success');
      const heroHomeBuilding = currentCity?.buildings?.find(b => b.key === 'HERO_HOME' || b.key === 'HERO_MANSION');
      if (heroHomeBuilding) {
        openHeroManagementPanel(heroHomeBuilding.level, selectedBuildSlot);
      }
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur lors de la création', 'error');
    }
  } catch (e) {
    showToast('Erreur de connexion', 'error');
  }
}

// Rename hero
async function renameHero() {
  const newName = await promptModal('Nouveau nom du héros', { title: 'Renommer le héros', placeholder: 'Nom', maxLength: 30 });
  if (!newName) return;

  try {
    const res = await fetch(`${API}/api/hero/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName })
    });

    if (res.ok) {
      showToast('Heros renomme!', 'success');
      const heroHomeBuilding = currentCity?.buildings?.find(b => b.key === 'HERO_HOME' || b.key === 'HERO_MANSION');
      if (heroHomeBuilding) {
        openHeroManagementPanel(heroHomeBuilding.level, selectedBuildSlot);
      }
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur lors du renommage', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  }
}

// Show hero equipment (placeholder)
function showHeroEquipment() {
  showToast('Équipement bientôt disponible!', 'info');
}

// ========== EXPEDITIONS ==========
async function loadExpeditions() {
  let res;
  try {
    res = await fetch(`${API}/api/expeditions`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    console.error('loadExpeditions error:', e);
    showToast('Erreur réseau', 'error');
    return;
  }
  
  const availableEl = document.getElementById('expeditions-available');
  const historyEl = document.getElementById('expeditions-history');
  if (!availableEl || !historyEl) return;
  if (res.ok) {
    const expeditions = await res.json();
    const available = expeditions.filter(e => e.status === 'AVAILABLE');
    const inProgress = expeditions.filter(e => e.status === 'IN_PROGRESS');
    const history = expeditions.filter(e => e.status === 'COMPLETED' || e.status === 'EXPIRED');
    const sendable = armies.filter(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
    
    availableEl.innerHTML = [
      ...inProgress.map(e => `
          <div class="expedition-card in-progress">
            <div class="exp-difficulty"><span class="exp-stars">${'<img class="ico" src="assets/images/3d/ui/star.webp" alt="">'.repeat(e.difficulty)}</span></div>
            <h4>En cours</h4>
            <p>Retour: <span class="qd-timer" data-ends-at="${e.endsAt}">${formatTime(e.endsAt)}</span></p>
          </div>`),
      ...available.map(e => `
          <div class="expedition-card">
            <div class="exp-difficulty"><span class="exp-stars">${'<img class="ico" src="assets/images/3d/ui/star.webp" alt="">'.repeat(e.difficulty)}</span></div>
            <h4>Expédition ${e.difficulty > 2 ? 'Difficile' : 'Standard'}</h4>
            <p>Puissance ennemie: ${e.enemyPower}</p>
            <p>Durée: ${Math.floor(e.duration / 60)} min</p>
            <div class="exp-loot"><span class="loot-badge ${e.lootTier}">${e.lootTier}</span></div>
            <button onclick="startExpedition('${e.id}')" class="btn" ${sendable.length ? '' : 'disabled title="Aucune armée prête"'}>Lancer</button>
          </div>`)
    ].join('') || '<p style="color:var(--text-muted)">Aucune expédition disponible (une nouvelle apparaît environ chaque heure)</p>';
    
    historyEl.innerHTML = history.slice(0, 10).map(e => `
      <div class="queue-item">
        <span>${e.status === 'EXPIRED' ? '⌛ Expirée' : e.won ? '✅ Victoire' : '❌ Défaite'} · Difficulté ${e.difficulty}</span>
        <span class="loot-badge ${e.lootTier}">${e.xpGained || 0} XP${e.lootGained?.gold ? ` · ${e.lootGained.gold} or` : ''}</span>
      </div>
    `).join('') || '<p style="color:var(--text-muted)">Aucun historique</p>';
  } else {
    availableEl.innerHTML = '<p style="color:var(--text-muted)">Impossible de charger les expéditions</p>';
  }
}

async function startExpedition(id) {
  const army = armies.find(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0 && a.cityId === currentCity?.id) || armies.find(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
  if (!army) {
    showToast('Aucune armée disponible', 'error');
    return;
  }

  try {
    const res = await fetch(`${API}/api/expedition/${id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ armyId: army.id })
    });

    if (res.ok) {
      showToast('Expédition lancée!', 'success');
      await loadArmies();
      loadExpeditions();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('startExpedition error:', e);
    showToast('Erreur réseau', 'error');
  }
}


// Map system extracted to js/map.js

