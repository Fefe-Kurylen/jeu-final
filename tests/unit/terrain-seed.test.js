// Carte tirée au hasard pour chaque serveur (décision du 26 octobre 2026) : tout le terrain se déduit de la graine du monde.
// - graine 0 = la carte de référence du serveur déjà ouvert, au bit près (sinon ses villes se retrouveraient dans l'eau) ;
// - une graine donne toujours la même carte (le client et le serveur la recalculent chacun de leur côté) ;
// - toute graine donne une carte jouable (terre d'un seul tenant, biomes à leur place, rivières traversables) ;
// - les cartes au hasard n'utilisent que des calculs identiques sur tous les moteurs JavaScript (serveur Node, téléphone).
require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const T = require('../../frontend/js/shared/terrain.js');

// Empreinte de toute la carte : élément, biome, sol, variante, sens des passages, terre ferme, case par case
function fingerprint() {
  let h = 0x811c9dc5 >>> 0;
  for (let y = T.MIN_COORD; y <= T.MAX_COORD; y++) for (let x = T.MIN_COORD; x <= T.MAX_COORD; x++) {
    const t = T.getTerrainType(x, y);
    const s = `${t.biome}|${t.feature}|${t.isMultiTile ? 1 : 0}|${T.groundAt(x, y)}|${T.groundVariantAt(x, y)}|${T.crossingAxisAt(x, y) || ''}|${T.isMainland(x, y) ? 1 : 0};`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16);
}

// Empreintes de référence : la graine 0 est la carte du serveur ouvert (25 octobre 2026) ; les deux autres gardent les
// cartes au hasard stables d'une version à l'autre (un serveur déjà ouvert sur une graine ne doit pas voir sa carte bouger).
// Une empreinte qui change = la génération a changé : il faut alors une nouvelle TERRAIN_VERSION et minClientVersion.
const GOLDEN = { 0: '44c69566', 123456: '609f1bed', 2147483646: '4f86b4c9' };

test('graine 0 : exactement la carte de référence du serveur ouvert', () => {
  T.setWorldSeed(0);
  assert.equal(T.worldSeed, 0);
  assert.equal(fingerprint(), GOLDEN[0]);
  const L = T.layout();
  assert.equal(L.rivers.length, 8); assert.equal(L.lakes.length, 6); assert.equal(L.ranges.length, 4);
  assert.deepEqual(L.lakes[0], { cx: -60, cy: -30, radius: 8 });
  assert.deepEqual(L.ranges[0], { sx: -150, sy: 0, ex: -50, ey: -80, width: 4 });
  const st = T.worldStats();
  assert.equal(st.crossings, 39); assert.equal(st.bridges, 27);
  assert.equal(T.minClientVersion, 2, 'une application en terrain 2 dessine encore bien cette carte');
});

test('une graine donne toujours la même carte, même après en avoir changé', () => {
  for (const seed of [123456, 2147483646]) {
    T.setWorldSeed(seed);
    assert.equal(fingerprint(), GOLDEN[seed], `graine ${seed}`);
  }
  T.setWorldSeed(0); T.setWorldSeed(123456);
  assert.equal(fingerprint(), GOLDEN[123456], 'revenir sur une graine redonne sa carte');
  assert.notEqual(GOLDEN[123456], GOLDEN[0]);
  assert.equal(T.minClientVersion, 3);
});

test('setWorldSeed : graine normalisée, rien ne change pour la même graine, epoch suit chaque changement', () => {
  T.setWorldSeed(42);
  const e = T.epoch;
  assert.equal(T.setWorldSeed(42), false, 'même graine : pas de travail, epoch inchangé');
  assert.equal(T.epoch, e);
  assert.equal(T.setWorldSeed(43), true);
  assert.equal(T.epoch, e + 1);
  T.setWorldSeed(-43); assert.equal(T.worldSeed, 43, 'valeur absolue');
  T.setWorldSeed('abc'); assert.equal(T.worldSeed, 0, 'une graine illisible donne la carte de référence');
  T.setWorldSeed(T.MAX_SEED + 1); assert.equal(T.worldSeed, 0, 'au-delà du maximum : on reboucle');
  T.setWorldSeed(12.9); assert.equal(T.worldSeed, 12, 'entier');
});

test('le biome du serveur suit la graine (src/utils/biome.js)', () => {
  const { getBiome } = require('../../src/utils/biome');
  T.setWorldSeed(987654);
  for (const [x, y] of [[0, 0], [-100, 50], [120, -130], [186, 186], [-187, -187], [40, 90]]) assert.equal(getBiome(x, y), T.getBiome(x, y));
});

// Comme un serveur neuf : à partir d'une graine, la première qui passe le contrôle de jouabilité (il en essaie jusqu'à 25)
function playableFrom(start) {
  for (let s = start, k = 0; k < 25; s++, k++) { T.setWorldSeed(s); const st = T.worldStats(); if (T.worldStatsOk(st)) return { seed: s, st, tries: k + 1 }; }
  return null;
}
// Graines de départ : quelques graines fixes et une au hasard (affichée en cas d'échec, pour la rejouer)
const RANDOM_SEED = crypto.randomInt(1, T.MAX_SEED - 30);
for (const start of [1, 42, 77, 31337, 2147483620, RANDOM_SEED]) {
  test(`à partir de la graine ${start} : une carte jouable, aux mêmes règles que la carte de référence`, () => {
    const p = playableFrom(start);
    assert.ok(p, `aucune carte jouable en 25 graines à partir de ${start}`);
    const { seed, st } = p;
    T.setWorldSeed(seed);
    assert.ok(st.biomeEnclave <= 150, `pas d'île de biome au-delà de 150 cases (${st.biomeEnclave}, graine ${seed})`);
    assert.ok(st.mainland >= 0.97, `presque toute la terre d'un seul tenant (${st.mainland})`);
    assert.ok(st.crossingsPerRiver.every(n => n >= 2), 'chaque rivière se traverse au moins deux fois');
    // biomes à leur place : neige au nord (x + y petit), désert au sud
    assert.equal(T.getBiome(T.MIN_COORD, T.MIN_COORD), 'snow');
    assert.equal(T.getBiome(T.MAX_COORD, T.MAX_COORD), 'desert');
    // chaque passage est une rangée de cases qui relie deux rives où l'on marche
    let crossings = 0;
    for (let y = T.MIN_COORD; y <= T.MAX_COORD; y++) for (let x = T.MIN_COORD; x <= T.MAX_COORD; x++) {
      const f = T.getTerrainType(x, y).feature;
      if (f !== 'bridge' && f !== 'ford') continue;
      const axis = T.crossingAxisAt(x, y);
      assert.ok(axis === 'x' || axis === 'y', `passage ${x},${y} sans axe`);
      const [dx, dy] = axis === 'x' ? [1, 0] : [0, 1];
      // une case du même passage : pont ou gué, dans le même sens (deux passages peuvent se toucher à angle droit)
      const isPass = (a, b) => ['bridge', 'ford'].includes(T.getTerrainType(a, b).feature) && T.crossingAxisAt(a, b) === axis;
      if (isPass(x - dx, y - dy)) continue;   // on part de la première case du passage
      let k = 0; while (isPass(x + dx * k, y + dy * k)) k++;
      for (const [ex, ey] of [[x - dx, y - dy], [x + dx * k, y + dy * k]]) {
        const f = T.getTerrainType(ex, ey).feature;
        assert.ok(T.inWorld(ex, ey) && (!T.isBlocked(ex, ey) || f === 'bridge' || f === 'ford'), `rive praticable au bout du passage ${x},${y}`);
      }
      crossings++;
    }
    assert.equal(crossings, st.crossings);
    // un trajet existe entre deux cases de terre ferme éloignées
    const land = [];
    for (let y = -150; y <= 150 && land.length < 2; y += 37) for (let x = -150; x <= 150 && land.length < 2; x += 41) if (T.isMainland(x, y) && (!land.length || Math.abs(land[0][0] - x) + Math.abs(land[0][1] - y) > 60)) land.push([x, y]);
    assert.equal(land.length, 2);
    const r = T.findPath(land[0][0], land[0][1], land[1][0], land[1][1], null, 200000);
    assert.ok(r, `trajet ${land[0]} -> ${land[1]}`);
    for (const [x, y] of r.path) assert.equal(T.isBlocked(x, y), false);
  });
}

test('une carte au hasard ne dépend d\'aucune fonction mathématique qui varie selon le moteur JavaScript', () => {
  const banned = ['sin', 'cos', 'tan', 'atan', 'atan2', 'hypot', 'pow', 'exp', 'log', 'cbrt', 'asin', 'acos'];
  const saved = {};
  for (const k of banned) { saved[k] = Math[k]; Math[k] = () => { throw new Error(`Math.${k} pendant la génération d'une carte au hasard`); }; }
  try {
    T.setWorldSeed(777);
    for (let y = T.MIN_COORD; y <= T.MAX_COORD; y++) for (let x = T.MIN_COORD; x <= T.MAX_COORD; x++) {
      T.getTerrainType(x, y); T.groundAt(x, y); T.groundVariantAt(x, y); T.isMainland(x, y); T.crossingAxisAt(x, y);
    }
    T.findPath(-50, -50, 50, 50, null, 200000);
  } finally {
    for (const k of banned) Math[k] = saved[k];
  }
});

test('un trajet d\'un bout à l\'autre de la carte est trouvé (plus de 40 000 cases explorées)', () => {
  // carte de référence : (131, −128) → (−67, 127), 426 cases de marche ; l'ancienne limite de 40 000 cases explorées le
  // refusait (« Aucun chemin terrestre »), même sur le serveur ouvert
  T.setWorldSeed(0);
  const r = T.findPath(131, -128, -67, 127);
  assert.ok(r, 'trajet trouvé');
  assert.ok(r.length > 400 && r.length < 460, `longueur ${r.length}`);
  assert.equal(T.findPath(131, -128, -67, 127, null, 40000), null, 'avec l\'ancienne limite il ne l\'était pas');
});

test('une destination dans une poche fermée est refusée tout de suite, sans parcourir toute la carte', () => {
  T.setWorldSeed(0);
  let pocket = null;
  for (let y = -186; y <= 186 && !pocket; y++) for (let x = -186; x <= 186; x++) if (!T.isBlocked(x, y) && !T.isMainland(x, y)) { pocket = [x, y]; break; }
  assert.ok(pocket, 'une poche fermée existe');
  const t0 = process.hrtime.bigint();
  assert.equal(T.findPath(0, 10, pocket[0], pocket[1]), null);
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 50, 'en moins de 50 ms');
});

test('les chaînes de montagnes d\'une carte au hasard ne se touchent pas', () => {
  for (const seed of [1, 39595, 277165, 15838, 506816]) {
    T.setWorldSeed(seed);
    const R = T.layout().ranges;
    const d = (px, py, s) => { const dx = s.ex - s.sx, dy = s.ey - s.sy, L = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((px - s.sx) * dx + (py - s.sy) * dy) / L)); return Math.hypot(px - s.sx - t * dx, py - s.sy - t * dy); };
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j], gap = Math.min(d(a.sx, a.sy, b), d(a.ex, a.ey, b), d(b.sx, b.sy, a), d(b.ex, b.ey, a));
      assert.ok(gap >= a.width + b.width + 12, `graine ${seed} : chaînes ${i} et ${j} à ${gap.toFixed(1)} cases`);
    }
  }
});

test('générateur et empreinte : une carte faite par un autre générateur est refusée, l\'empreinte suit la carte', () => {
  T.setWorldSeed(0);
  assert.equal(T.generator, 2); assert.equal(T.signature, '3bd4567c');
  T.setWorldSeed(123456);
  assert.equal(T.generator, 3); assert.equal(T.signature, '41114dc9');
  assert.throws(() => T.setWorldSeed(5, 4), /générateur 4/, 'un générateur inconnu');
  assert.throws(() => T.setWorldSeed(0, 3), /générateur 3/, 'la carte de référence n\'est pas une carte au hasard');
  assert.equal(T.worldSeed, 123456, 'un refus ne change pas la carte en cours');
  T.setWorldSeed(5, 3); assert.equal(T.worldSeed, 5);
});
