// ============================================================
// 08b-hero-talents.js — Talents du héros et état (tombé, résurrection) — décision du 27 octobre 2026.
// Serveur : src/services/heroService.js, src/utils/heroEffects.js, data/hero-talents.json.
// ============================================================
let heroTalentCatalog = null;
async function loadTalentCatalog() {
  if (heroTalentCatalog) return heroTalentCatalog;
  try { heroTalentCatalog = await fetchJson('/api/hero/talents'); } catch (e) { /* réessayé au prochain affichage */ }
  return heroTalentCatalog;
}

// « +1,2 % » à côté d'une caractéristique (points, équipement et talents compris)
function heroBonusLabel(hero, stat) {
  const v = hero?.bonuses?.[stat];
  return typeof v === 'number' ? `+${String(v).replace('.', ',')} %` : '';
}

// Bandeau d'état : tombé (bouton Ressusciter, prix, durée) ou résurrection en cours
function heroStateHtml(hero) {
  if (!hero || hero.state === 'ALIVE' || !hero.revive) return '';
  const r = hero.revive;
  if (hero.state === 'REVIVING') {
    return `<div class="hero-state reviving">${resIconHtml('clock')} <strong>Résurrection en cours</strong> au Domus du Héros : de retour dans <span class="qd-timer" data-ends-at="${r.endsAt}">${formatTime(r.endsAt)}</span>.</div>`;
  }
  const cost = ['wood', 'stone', 'iron', 'food'].map(k => `${resIconHtml(k)} ${formatNum(r.cost[k])}`).join(' ');
  return `<div class="hero-state fallen">
    <div>${resIconHtml('skull')} <strong>${escapeHtml(hero.name)} est tombé au combat.</strong> Il garde son niveau, ses talents et ses objets, mais n'apporte plus rien tant qu'il n'est pas ressuscité.</div>
    ${r.domusLevel > 0
      ? `<div class="hero-revive-row">Résurrection au Domus de la capitale : ${cost} · ${resIconHtml('clock')} ${formatDuration(r.seconds)}
          <button class="btn btn-primary btn-sm" onclick="reviveHero()">Ressusciter</button></div>`
      : '<div class="hero-revive-row">Construisez le Domus du Héros dans votre capitale pour le ressusciter.</div>'}
  </div>`;
}
async function reviveHero() {
  const ok = await allianceRequestNoReload('/api/hero/revive', 'POST');
  if (ok) { if (typeof loadPlayer === 'function') loadPlayer(); loadHero(); }
}

// Section des talents : trois branches, rang par talent, points libres, réinitialisation
async function renderHeroTalents(hero) {
  const box = document.getElementById('hero-talents');
  if (!box || !hero) return;
  const cat = await loadTalentCatalog();
  if (!cat) { box.innerHTML = ''; return; }
  const ranks = hero.talents || {};
  const pts = hero.talentPoints || { total: 0, spent: 0, free: 0 };
  const inBranch = (b) => b.talents.reduce((t, x) => t + (ranks[x.key] || 0), 0);
  box.innerHTML = `
    <h4 class="equipment-title">${resIconHtml('star')} Talents
      <small>${pts.free} point${pts.free > 1 ? 's' : ''} libre${pts.free > 1 ? 's' : ''} · ${pts.spent} / ${pts.total} placés (1 par niveau)</small></h4>
    <div class="talent-branches">
      ${cat.branches.map(b => {
        const spentHere = inBranch(b);
        return `<div class="talent-branch">
          <div class="talent-branch-head">${resIconHtml(b.icon)} <strong>${escapeHtml(b.name)}</strong> <small>${spentHere} pt${spentHere > 1 ? 's' : ''}</small></div>
          <p class="diplo-help">${escapeHtml(b.description)}</p>
          ${b.talents.map(t => {
            const r = ranks[t.key] || 0, locked = spentHere < t.requires, maxed = r >= t.maxRank;
            const can = !locked && !maxed && pts.free > 0 && hero.state !== 'FALLEN' && hero.state !== 'REVIVING';
            return `<div class="talent ${locked ? 'locked' : ''} ${r > 0 ? 'learned' : ''} ${maxed ? 'maxed' : ''}">
              <div class="talent-head"><strong>${escapeHtml(t.name)}</strong> <span class="talent-rank">${r} / ${t.maxRank}</span></div>
              <div class="talent-desc">${escapeHtml(t.description)}</div>
              ${locked ? `<div class="talent-lock">${resIconHtml('lock')} ${t.requires} points dans la branche</div>` : ''}
              ${can ? `<button class="btn btn-primary btn-sm" onclick="learnTalent('${chatSafeId(t.key)}')">+1 rang</button>` : ''}
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>
    ${pts.spent > 0 ? `<button class="btn btn-secondary btn-sm talent-reset" onclick="resetTalents()">Réinitialiser les talents (${hero.talentResetGold ? `${resIconHtml('gold')} ${hero.talentResetGold}` : 'gratuit la première fois'})</button>` : ''}`;
}
async function learnTalent(key) {
  const ok = await allianceRequestNoReload('/api/hero/talents/learn', 'POST', { key });
  if (ok) loadHero();
}
function resetTalents() {
  const price = heroData?.talentResetGold || 0;
  openSheetModal('Réinitialiser les talents', `<p>Tous les points de talent reviennent libres${price ? `, pour ${price} or` : ' (gratuit la première fois, ensuite ' + (heroTalentCatalog?.resetGold || 100) + ' or)'}.</p>
    <div class="profile-actions"><button class="btn btn-primary" onclick="closeModal(); confirmResetTalents()">Réinitialiser</button><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>`);
}
async function confirmResetTalents() {
  const ok = await allianceRequestNoReload('/api/hero/talents/reset', 'POST');
  if (ok) { if (typeof loadPlayer === 'function') loadPlayer(); loadHero(); }
}
