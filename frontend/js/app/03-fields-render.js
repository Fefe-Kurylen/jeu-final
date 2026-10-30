// ============================================================
// 03-fields-render.js — Vue champs : emplacement de champ (sprite 3D ou parcelle vide, badge de niveau,
// indicateur de production, chantier) et recherche du champ d'un emplacement
// Découpé depuis app.js (lignes 2466-3457) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
const FIELD_RESOURCE_ICON = { FARM: 'food', LUMBER: 'wood', QUARRY: 'stone', IRON_MINE: 'iron' };
function drawFieldSlot(slot, building, isHovered, isBuilding) {
  const { x, y, size, fieldType } = slot;
  const level = building?.level || 0;
  // Sprite 2.5D (assets/images/3d/fields/<biome>/<TYPE>_<palier>.webp) : largeur 1,5·size, losange au sol de
  // ±0.577·size en x et ±0.288·size en y qui recouvre la cellule ; l'ombre portée fait partie du rendu
  // Champ en chantier peint (guide § S10) : à la place de la parcelle vide pendant la première construction
  const siteUrl = isBuilding && level === 0 ? fieldSiteUrl(fieldType) : null;
  const sprite = level > 0 ? getSprite(fieldSpriteUrl(fieldType, level)) : (siteUrl ? getSprite(siteUrl) : null);
  if (isHovered) {   // halo doré au sol
    cityCtx.fillStyle = 'rgba(255,215,0,0.2)';
    cityCtx.beginPath(); cityCtx.ellipse(x, y, size * 0.85, size * 0.45, 0, 0, Math.PI * 2); cityCtx.fill();
  }
  if (sprite) {
    drawSprite(cityCtx, sprite, x, y, size * 1.5, spriteVariant(isHovered));
    if (isHovered) {   // contour doré du losange au sol
      cityCtx.strokeStyle = '#ffd700'; cityCtx.lineWidth = 3; cityCtx.shadowColor = '#ffd700'; cityCtx.shadowBlur = 15;
      cityCtx.beginPath(); cityCtx.moveTo(x - size * 0.577, y); cityCtx.lineTo(x, y - size * 0.288); cityCtx.lineTo(x + size * 0.577, y); cityCtx.lineTo(x, y + size * 0.288); cityCtx.closePath(); cityCtx.stroke();
      cityCtx.shadowBlur = 0;
    }
  } else if (level === 0) {
    // Emplacement vide : parcelle 3D du biome au gabarit des sprites, puis losange pointillé
    const night = isNightMode();
    const plot = getSprite(plotSpriteUrl((Math.round(slot.gx || 0) * 3 + Math.round(slot.gy || 0) * 5 + 10) & 1));
    if (plot) drawSprite(cityCtx, plot, x, y, size * 1.5, spriteVariant(false));
    cityCtx.beginPath(); cityCtx.moveTo(x - size * 0.577, y); cityCtx.lineTo(x, y - size * 0.288); cityCtx.lineTo(x + size * 0.577, y); cityCtx.lineTo(x, y + size * 0.288); cityCtx.closePath();
    const soil = hasPaintedTexture('soil_tilled');   // terre labourée peinte quand elle existe
    if (soil) fillTextured(cityCtx, 'soil_tilled', night ? 'rgba(20,16,10,0.5)' : 'rgba(110,88,60,0.1)', 1);
    else { cityCtx.fillStyle = plot ? (night ? 'rgba(40,36,30,0.45)' : 'rgba(110,88,60,0.22)') : (night ? 'rgba(40,36,30,0.75)' : 'rgba(110,88,60,0.55)'); cityCtx.fill(); }
    if (isHovered) { cityCtx.shadowColor = '#ffd700'; cityCtx.shadowBlur = 15; }
    cityCtx.strokeStyle = isHovered ? '#ffd700' : 'rgba(255,255,255,0.45)';
    cityCtx.lineWidth = isHovered ? 3 : 2;
    cityCtx.setLineDash([5, 5]); cityCtx.stroke(); cityCtx.setLineDash([]);
    cityCtx.shadowBlur = 0;
    // « + » dessiné avec la parcelle (ordre de profondeur) : une tour ou un mur devant le cache, comme pour les bâtiments
    cityCtx.fillStyle = isHovered ? '#ffd700' : 'rgba(255,255,255,0.6)';
    cityCtx.font = `bold ${size * 0.4}px Arial`; cityCtx.textAlign = 'center'; cityCtx.textBaseline = 'middle';
    cityCtx.fillText('+', x, y);
  }
  // Couche d'overlay (dessinée après tous les sprites) : production, « + », badge de niveau, chantier
  const showBadges = isoShowBadges(isHovered);
  const badge = level > 0 && showBadges ? isoBadgeSpec(x, y, size * 0.73, size * 0.37) : null;
  isoOverlay(() => {
    const time = Date.now() / 1000;   // lu à chaque image : les animations ne sont pas figées dans la couche statique
    if (level > 0 && !isBuilding && showBadges) {   // indicateur de production : icône 3D de la ressource, flottante
      const icon = getSprite(`assets/images/3d/ui/${FIELD_RESOURCE_ICON[fieldType] || 'food'}.webp`);
      if (icon) {
        const s = Math.max(14, size * 0.3), prodY = y - size * 0.75 + Math.sin(time * 2) * 3;
        cityCtx.globalAlpha = 0.85 + Math.sin(time * 3) * 0.1;
        cityCtx.drawImage(icon, x - s / 2, prodY - s / 2, s, s);
        cityCtx.globalAlpha = 1;
      }
    }
    if (badge) drawTravianLevelBadge(level, isHovered, badge);   // badge de niveau (même style que les bâtiments)
    if (isBuilding) {   // chantier : marteau 3D flottant et anneau de progression
      cityCtx.globalAlpha = 0.6 + Math.sin(time * 5) * 0.2;
      drawBuildIndicator(cityCtx, x, y - size * 0.55 + Math.sin(time * 8) * 3, Math.max(16, size * 0.36));
      const progress = (time % 2) / 2;
      cityCtx.strokeStyle = '#ffa500'; cityCtx.lineWidth = 3;
      cityCtx.beginPath(); cityCtx.arc(x, y, size * 0.4, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); cityCtx.stroke();
      cityCtx.globalAlpha = 1;
    }
  });
}

function getFieldBuildingAtSlot(slotNum, fieldType) {
  // Les champs de ressources sont stockés différemment
  // On cherche le bâtiment de ce type avec ce numéro de slot
  const serverSlot = slotNum >= 100 ? slotNum : slotNum + 100;   // numérotation du serveur (101-118) ou ancienne (1-18)
  return currentCity?.buildings?.find(b => b.key === fieldType && b.slot === serverSlot);
}


