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
const GOLDEN = { 0: '44c69566', 123456: '3577a564', 2147483646: '5854d84f' };

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

// Graines essayées : quelques graines fixes et une au hasard (affichée en cas d'échec, pour la rejouer)
const RANDOM_SEED = crypto.randomInt(1, T.MAX_SEED + 1);
for (const seed of [1, 42, 77, 31337, 2147483646, RANDOM_SEED]) {
  test(`graine ${seed} : une carte jouable, aux mêmes règles que la carte de référence`, () => {
    T.setWorldSeed(seed);
    const st = T.worldStats();
    assert.ok(T.worldStatsOk(st), `contrôle de jouabilité : ${JSON.stringify(st)}`);
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
  // graine 432062107, deux capitales à 310 cases : l'ancienne limite de 40 000 cases explorées refusait l'attaque
  T.setWorldSeed(432062107);
  const r = T.findPath(176, 120, -133, -14);
  assert.ok(r, 'trajet trouvé');
  assert.ok(r.length > 400 && r.length < 480, `longueur ${r.length}`);
  assert.equal(T.findPath(176, 120, -133, -14, null, 40000), null, 'avec l\'ancienne limite il ne l\'était pas');
});

test('générateur et empreinte : une carte faite par un autre générateur est refusée, l\'empreinte suit la carte', () => {
  T.setWorldSeed(0);
  assert.equal(T.generator, 2); assert.equal(T.signature, '3bd4567c');
  T.setWorldSeed(432062107);
  assert.equal(T.generator, 3); assert.equal(T.signature, 'feae179c');
  assert.throws(() => T.setWorldSeed(5, 4), /générateur 4/, 'un générateur inconnu');
  assert.throws(() => T.setWorldSeed(0, 3), /générateur 3/, 'la carte de référence n\'est pas une carte au hasard');
  assert.equal(T.worldSeed, 432062107, 'un refus ne change pas la carte en cours');
  T.setWorldSeed(5, 3); assert.equal(T.worldSeed, 5);
});
