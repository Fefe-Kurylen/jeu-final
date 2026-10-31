// ============================================================
// 09f-spies.js — Espions (décision du 26 octobre 2026, façon Travian) : 2 espions par compte débloqués par la Tour de
// guet (niv. 5 : 20 or, niv. 10 : 200 or), recrutés tout de suite ; missions « Ressources et troupes » ou « Défenses et
// troupes » vers une ville, ou espionnage d'un point de ressource. Section Espions dans l'onglet Armée.
// ============================================================
let spiesState = null, spiesLoadedAt = 0;
async function loadSpies(force = false) {
  if (!token) return null;
  if (!force && spiesState && Date.now() - spiesLoadedAt < 15000) return spiesState;
  try { spiesState = await fetchJson('/api/spies'); spiesLoadedAt = Date.now(); } catch (e) { /* garde le dernier état */ }
  return spiesState;
}
const spyCityName = (id) => (cities || []).find(c => c.id === id)?.name || '';
function spyStatusHtml(s) {
  if (s.status === 'OUT') return `en route vers (${s.targetX}, ${s.targetY}) · arrivée dans <span class="qd-timer" data-ends-at="${s.arrivalAt}">${formatTime(s.arrivalAt)}</span> <button class="btn btn-secondary btn-sm" onclick="recallSpy('${chatSafeId(s.id)}')">Rappeler</button>`;
  if (s.status === 'RETURNING') return `revient vers ${escapeHtml(spyCityName(s.fromCityId) || 'sa ville')} · <span class="qd-timer" data-ends-at="${s.returnAt}">${formatTime(s.returnAt)}</span>`;
  return '<span class="spy-free">prêt</span>';
}

// Section « Espions » en tête de l'onglet Armée
async function renderSpiesSection(container) {
  if (!container) return;
  const d = await loadSpies();
  if (!d) return;
  let box = document.getElementById('spies-section');
  if (!box) { box = document.createElement('div'); box.id = 'spies-section'; box.className = 'spies-section'; container.parentNode.insertBefore(box, container); }
  box.innerHTML = `
    <h4>${resIconHtml('spy')} Espions <small>Tour de guet niveau ${d.watchtowerLevel}</small></h4>
    <div class="spy-slots">
      ${d.slots.map(sl => {
        const spy = d.spies.find(s => s.slot === sl.slot);
        if (spy) return `<div class="spy-slot ready"><strong>Espion ${sl.slot}</strong> · ${spyStatusHtml(spy)}</div>`;
        if (!sl.unlocked) return `<div class="spy-slot locked">${resIconHtml('lock')} Espion ${sl.slot} : Tour de guet niveau ${sl.unlockLevel}</div>`;
        return `<div class="spy-slot"><strong>Espion ${sl.slot}</strong> · <button class="btn btn-primary btn-sm" onclick="recruitSpy(${sl.slot})" ${d.gold < sl.cost ? `disabled title="Il vous faut ${sl.cost} or"` : ''}>Recruter (${resIconHtml('gold')} ${sl.cost})</button></div>`;
      }).join('')}
    </div>
    <p class="diplo-help">Un espion rapporte toujours ; la ville espionnée en est prévenue selon sa Tour de guet. Espionnez depuis la carte : touchez une ville ou un point de ressource, puis « Espionner ».</p>`;
}
async function recruitSpy(slot) {
  const ok = await allianceRequestNoReload('/api/spies/recruit', 'POST', { slot });
  if (ok) { await loadSpies(true); if (typeof loadPlayer === 'function') loadPlayer(); renderSpiesSection(document.getElementById('armies-management')); }
}
async function recallSpy(id) {
  const ok = await allianceRequestNoReload(`/api/spies/${id}/recall`, 'POST');
  if (ok) { await loadSpies(true); renderSpiesSection(document.getElementById('armies-management')); }
}

// Envoyer un espion : vers une ville (choix de la mission) ou un point de ressource
async function openSpyMission({ cityId, nodeId, label }) {
  const d = await loadSpies(true);
  const free = (d?.spies || []).filter(s => s.status === 'IDLE');
  if (!d || !d.spies.length) {
    openSheetModal('Espionner', `<p>Il vous faut d'abord un espion : construisez la Tour de guet jusqu'au niveau ${d?.slots?.[0]?.unlockLevel || 5}, puis recrutez-le dans l'onglet Armée.</p>
      <div class="profile-actions"><button class="btn btn-primary" onclick="closeModal(); showTab('army')">Onglet Armée</button><button class="btn btn-secondary" onclick="closeModal()">Fermer</button></div>`);
    return;
  }
  if (!free.length) { showToast('Vos espions sont tous en mission', 'info'); return; }
  const myCities = cities || [];
  openSheetModal(`Espionner ${label || ''}`, `
    ${cityId ? `<div class="support-pick">
      <label class="support-option"><input type="radio" name="spy-mission" value="RESOURCES" checked> <strong>Ressources et troupes</strong><br><small>Les troupes présentes dans la ville et les ressources qu'un pillage pourrait prendre (hors cachette).</small></label>
      <label class="support-option"><input type="radio" name="spy-mission" value="DEFENSES"> <strong>Défenses et troupes</strong><br><small>Les troupes, le mur (niveau et santé), la Tour de guet de la capitale, la cachette (ce qu'elle met à l'abri de chaque ressource) et le bonus de défense.</small></label>
    </div>` : '<p class="diplo-help">L\'espion rapporte le stock exact du point, sa tribu ou l\'armée qui le récolte ; le point garde son stock exact affiché pendant 1 h.</p>'}
    ${myCities.length > 1 ? `<label class="form-row">Départ <select id="spy-from">${myCities.map(c => `<option value="${chatSafeId(c.id)}" ${c.id === currentCity?.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></label>` : ''}
    <p class="diplo-help">${free.length} espion${free.length > 1 ? 's' : ''} prêt${free.length > 1 ? 's' : ''}. Il réussit toujours, mais la cible peut être prévenue (Tour de guet).</p>
    <div class="profile-actions">
      <button class="btn btn-primary" onclick="sendSpy(${cityId ? `'${chatSafeId(cityId)}'` : 'null'}, ${nodeId ? `'${chatSafeId(nodeId)}'` : 'null'})">${resIconHtml('spy')} Envoyer l'espion</button>
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function sendSpy(targetCityId, targetNodeId) {
  const mission = document.querySelector('input[name="spy-mission"]:checked')?.value || null;
  const fromCityId = document.getElementById('spy-from')?.value || currentCity?.id || null;
  const r = await allianceRequestNoReload('/api/spies/send', 'POST', { fromCityId, targetCityId, targetNodeId, mission });
  if (r) { closeModal(); await loadSpies(true); }
}
