// ============================================================
// 09b-battle-scene.js — Replay de bataille en 2.5D : un champ isométrique où les deux armées se font
// face, chaque type d'unité représenté par un petit bloc de figurines (sprites de carte aux couleurs de
// la faction) dont l'effectif fond au fil des rounds, avec volées de flèches et impacts.
// Branché sur window.replayState (09-social.js) : battleScene.render(state) à chaque changement de round.
// ============================================================
const battleScene = {
  canvas: null, ctx: null, w: 0, h: 0, raf: null, shown: 0, anim: null, state: null, lastDraw: 0,

  attach(state) {
    this.canvas = document.getElementById('replay-canvas');
    if (!this.canvas) return false;
    this.ctx = this.canvas.getContext('2d');
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(280, Math.round(rect.width || this.canvas.parentElement.clientWidth || 400));
    this.h = 240;
    sizeCanvasForDpr(this.canvas, this.ctx, this.w, this.h);
    this.state = state;
    this.shown = state.currentRound;
    this.anim = null;
    this.prepare(state);
    return true;
  },

  // Effectifs par type et par round (0 = avant la bataille), figurines dimensionnées sur l'effectif initial
  prepare(state) {
    const rep = state.report;
    const aFaction = unitFactionOf((rep.attackerUnits || [])[0]?.key) || 'ROME';
    const dFaction = unitFactionOf((rep.defenderUnits || [])[0]?.key) || 'ROME';
    const mk = (units, faction) => (units || []).map(u => ({ key: u.key, name: u.name || getUnitName(u.key), cls: unitClassOf(u.key) || 'INFANTRY', faction, initial: u.count, counts: [u.count] }));
    this.att = mk(rep.attackerUnits, aFaction);
    this.def = mk(rep.defenderUnits, dFaction);
    for (const r of state.rounds) {
      const killsOnDef = Object.fromEntries((r.attackerKills || []).map(k => [k.key, k.killed]));
      const killsOnAtt = Object.fromEntries((r.defenderKills || []).map(k => [k.key, k.killed]));
      for (const u of this.def) u.counts.push(Math.max(0, u.counts[u.counts.length - 1] - (killsOnDef[u.key] || 0)));
      for (const u of this.att) u.counts.push(Math.max(0, u.counts[u.counts.length - 1] - (killsOnAtt[u.key] || 0)));
    }
    const order = { INFANTRY: 0, ARCHER: 1, CAVALRY: 2, SIEGE: 3 };
    this.att.sort((a, b) => order[a.cls] - order[b.cls]);
    this.def.sort((a, b) => order[a.cls] - order[b.cls]);
    this.aFaction = aFaction; this.dFaction = dFaction;
    this.hasWall = !!(rep.loot && rep.loot.type === 'ATTACK');
  },

  render(state) {
    if (!this.canvas || !document.getElementById('replay-canvas')) { if (!this.attach(state)) return; }
    this.state = state;
    const target = state.currentRound;
    if (target !== this.shown) {
      this.anim = { from: this.shown, to: target, t0: performance.now(), dur: 650 / (state.speed || 1) };
      this.shown = target;
      if (typeof haptic === 'function' && target > 0) haptic('light');
    }
    this.loop();
  },

  loop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    const step = () => {
      this.raf = null;
      const now = performance.now();
      let progress = 1;
      if (this.anim) { progress = Math.min(1, (now - this.anim.t0) / this.anim.dur); if (progress >= 1) this.anim = null; }
      this.draw(progress);
      if (this.anim || this.state?.playing) this.raf = requestAnimationFrame(step);
    };
    step();
  },

  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; this.anim = null; this.canvas = null; },

  // ---- dessin ----
  draw(progress) {
    const ctx = this.ctx, w = this.w, h = this.h;
    if (!ctx) return;
    const night = isNightMode();
    ctx.clearRect(0, 0, w, h);
    // terrain : scène 3D du champ de bataille (cadrage « cover »), sinon herbe texturée ; puis vignette
    const bg = getSprite(art('scenes/battlefield.webp'));
    if (bg) { const k = Math.max(w / 640, h / 240); const bw = 640 * k, bh = 240 * k; ctx.drawImage(bg, (w - bw) / 2, (h - bh) / 2, bw, bh); }
    else { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, night ? '#2a3a28' : '#6a9a4a'); g.addColorStop(1, night ? '#1a2a18' : '#4a7a2a'); ctx.beginPath(); ctx.rect(0, 0, w, h); fillTextured(ctx, 'grass', g, night ? 0.85 : 0.45); }
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    // mur du défenseur
    if (this.hasWall) { const wall = getSprite(art(`buildings/${this.dFaction}/WALL.webp`)); if (wall) { const wx = w * 0.86; ctx.save(); ctx.translate(wx, 0); ctx.scale(-1, 1); ctx.translate(-wx, 0); drawSprite(ctx, wall, wx, h * 0.42, 150, night ? 'night' : 'day'); ctx.restore(); } }   // mur tourné vers l'attaquant, à gauche

    const from = this.anim ? this.anim.from : this.shown, to = this.shown;
    const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    this.drawSide(this.att, 'left', from, to, ease, progress);
    this.drawSide(this.def, 'right', from, to, ease, progress);
    // volées et impacts pendant la transition
    if (this.anim && to > from) this.drawVolleys(progress);
    // bannières
    this.drawBanner(w * 0.17, 22, this.aFaction, 'Attaquant');
    this.drawBanner(w * 0.83, 22, this.dFaction, 'Défenseur');
    if (night) { ctx.fillStyle = 'rgba(12,16,46,0.32)'; ctx.fillRect(0, 0, w, h); }
  },

  // Positions des blocs : rangs par classe, de l'avant (centre) vers l'arrière
  blockPositions(side, n) {
    const w = this.w, h = this.h;
    const cols = { left: [0.37, 0.27, 0.17, 0.08], right: [0.63, 0.73, 0.83, 0.92] }[side];
    const out = [];
    for (let i = 0; i < n; i++) { const col = cols[Math.min(i, 3)]; out.push({ x: w * col, y: h * (0.52 + (i % 2) * 0.12) + (side === 'right' ? 6 : 0) }); }
    return out;
  },

  drawSide(units, side, from, to, ease, progress) {
    const ctx = this.ctx;
    const pos = this.blockPositions(side, units.length);
    units.forEach((u, i) => {
      const cFrom = u.counts[Math.min(from, u.counts.length - 1)], cTo = u.counts[Math.min(to, u.counts.length - 1)];
      const count = Math.round(cFrom + (cTo - cFrom) * ease);
      const perFig = Math.max(1, Math.ceil(u.initial / 6));
      const figs = count > 0 ? Math.max(1, Math.min(6, Math.ceil(count / perFig))) : 0;
      const figsFrom = cFrom > 0 ? Math.max(1, Math.min(6, Math.ceil(cFrom / perFig))) : 0;
      const sprite = getSprite(`assets/images/3d/map/units/${({ INFANTRY: 'hoplite', ARCHER: 'archer', CAVALRY: 'cavalry', SIEGE: 'catapult' })[u.cls]}_${u.faction}.webp`);
      const p = pos[i], fh = u.cls === 'SIEGE' ? 40 : 34;
      // formation 2 rangs décalés, les figurines perdues s'estompent
      for (let k = 0; k < Math.max(figs, figsFrom); k++) {
        const row = k % 2, colk = Math.floor(k / 2);
        const fx = p.x + (side === 'left' ? -1 : 1) * (colk * 14 + row * 7), fy = p.y - row * 10 + colk * 3;
        const dying = k >= figs && k < figsFrom;
        ctx.save();
        if (dying) ctx.globalAlpha = Math.max(0, 1 - progress);
        if (side === 'right') { ctx.translate(fx, 0); ctx.scale(-1, 1); ctx.translate(-fx, 0); }   // le défenseur regarde vers la gauche
        if (sprite) { const sc = fh / 83; ctx.drawImage(sprite, fx - 128 * sc, fy - 204 * sc, 256 * sc, 256 * sc); }   // cadre carte 256 px, ancre (128, 204), figurines ≈ 83 px
        else { ctx.fillStyle = '#8b1a1a'; ctx.fillRect(fx - 5, fy - 20, 10, 20); }
        ctx.restore();
      }
      // étiquette effectif
      const label = `${count}`;
      ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lw = ctx.measureText(label).width + 10;
      ctx.fillStyle = count > 0 ? 'rgba(20,12,4,0.75)' : 'rgba(90,20,10,0.7)';
      ctx.beginPath(); ctx.roundRect(p.x - lw / 2, p.y + 14, lw, 16, 8); ctx.fill();
      ctx.fillStyle = count > 0 ? '#ffd700' : '#ffb0a0'; ctx.fillText(label, p.x, p.y + 22);
      // petit portrait
      const tok = getSprite(unitIconUrl(u.key));
      if (tok) ctx.drawImage(tok, p.x - lw / 2 - 20, p.y + 11, 20, 20);
    });
  },

  drawVolleys(progress) {
    const ctx = this.ctx, w = this.w, h = this.h;
    const sides = [{ units: this.att, dir: 1, x0: w * 0.3, x1: w * 0.68 }, { units: this.def, dir: -1, x0: w * 0.7, x1: w * 0.32 }];
    for (const s of sides) {
      const archers = s.units.some(u => u.cls === 'ARCHER' && u.counts[this.shown - 1] > 0);
      const siege = s.units.some(u => u.cls === 'SIEGE' && u.counts[this.shown - 1] > 0);
      if (archers) {
        for (let i = 0; i < 6; i++) {
          const t = Math.min(1, Math.max(0, progress * 1.6 - i * 0.06));
          if (t <= 0 || t >= 1) continue;
          const x = s.x0 + (s.x1 - s.x0) * t, y = h * 0.6 - Math.sin(t * Math.PI) * 60 + (i - 3) * 5;
          const nx = s.dir * 10, ny = -Math.cos(t * Math.PI) * 10;
          ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - nx * 0.6, y - ny * 0.6); ctx.lineTo(x, y); ctx.stroke();
          ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - nx * 0.6, y - ny * 0.6); ctx.lineTo(x - nx * 0.2, y - ny * 0.2); ctx.stroke();
        }
      }
      if (siege) {
        const t = Math.min(1, progress * 1.3);
        if (t < 1) { const x = s.x0 + (s.x1 - s.x0) * t, y = h * 0.55 - Math.sin(t * Math.PI) * 90; ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
      }
      // impact : éclat au moment où la volée arrive
      if (progress > 0.55 && progress < 0.85 && (archers || siege || true)) {
        const a = 1 - (progress - 0.55) / 0.3;
        ctx.fillStyle = `rgba(255,220,120,${0.5 * a})`;
        ctx.beginPath(); ctx.ellipse(s.x1, h * 0.6, 28 * (1.2 - a * 0.4), 10, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  },

  drawBanner(x, y, faction, label) {
    const ctx = this.ctx;
    const tok = getSprite(`assets/images/3d/heroes/${faction}_bust.webp`);
    ctx.fillStyle = 'rgba(20,12,4,0.65)'; ctx.beginPath(); ctx.roundRect(x - 54, y - 14, 108, 28, 14); ctx.fill();
    if (tok) ctx.drawImage(tok, x - 50, y - 12, 24, 24);
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 12px Cinzel, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, x - 22, y + 1);
  }
};
