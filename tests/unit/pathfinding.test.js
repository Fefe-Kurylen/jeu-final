require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../frontend/js/shared/terrain.js');
// Ces tests portent sur la carte de référence (graine 0, celle du serveur ouvert) : coordonnées de ses lacs et de ses
// chaînes. Les cartes tirées au hasard sont testées dans terrain-seed.test.js.
T.setWorldSeed(0);

test('the shared terrain is deterministic and matches the server biome helper', () => {
  const { getBiome } = require('../../src/utils/biome');
  for (const [x, y] of [[0, 0], [-100, 50], [120, -130], [186, 186], [-187, -187]]) {
    assert.equal(T.getBiome(x, y), getBiome(x, y));
    assert.deepEqual(T.getTerrainType(x, y), T.computeTerrainType(x, y));
  }
});

test('mountains and water block, everything else and object cells pass', () => {
  assert.equal(T.isBlocked(-60, -30), true, 'lake');
  assert.equal(T.isBlocked(-100, -40), true, 'mountain range');
  assert.equal(T.isBlocked(0, 0), false);
  assert.equal(T.isBlocked(10000, 0), true, 'outside the world');
  const objects = new Map([['-60,-30', 'CITY']]);
  assert.equal(T.isBlocked(-60, -30, objects), false, 'a city tile is always passable');
  assert.equal(T.isBlocked(-59, -30, objects), true, 'but the ring around it stays blocked over water (no bridge made of two cities)');
  const onRange = new Map([['-100,-40', 'CITY']]);
  assert.equal(T.isBlocked(-99, -40), true, 'mountain range');
  assert.equal(T.isBlocked(-99, -40, onRange), false, 'the ring around a city is passable over relief');
});

test('A* finds contiguous routes that never cross a blocked tile and are at least as long as the straight line', () => {
  const cases = [[-120, -60, -40, -100], [0, 0, 60, 60], [100, 100, 150, 40], [-150, 150, -170, 100]];
  for (const [ax, ay, bx, by] of cases) {
    const r = T.findPath(ax, ay, bx, by);
    assert.ok(r, `route ${ax},${ay} -> ${bx},${by}`);
    assert.deepEqual(r.path[0], [ax, ay]);
    assert.deepEqual(r.path[r.path.length - 1], [bx, by]);
    for (let i = 1; i < r.path.length; i++) {
      const [x0, y0] = r.path[i - 1], [x1, y1] = r.path[i];
      assert.ok(Math.abs(x1 - x0) <= 1 && Math.abs(y1 - y0) <= 1, 'one step at a time');
      assert.equal(T.isBlocked(x1, y1), false, 'never on a blocked tile');
    }
    assert.ok(r.length >= Math.hypot(bx - ax, by - ay) - 1e-9);
  }
});

test('a blocked destination has no route; a trivial route has length 0', () => {
  assert.equal(T.findPath(0, 0, -60, -30), null);
  assert.deepEqual(T.findPath(5, 5, 5, 5), { path: [[5, 5]], length: 0 });
});

// Carte de référence (25 octobre 2026) : sols, passages des rivières, terre ferme principale
test('every cell has one of the seven grounds; water features lie on water or ice', () => {
  const layers = new Set(T.GROUND_LAYERS);
  for (let x = -187; x <= 186; x += 7) for (let y = -187; y <= 186; y += 7) {
    const g = T.groundAt(x, y), f = T.getTerrainType(x, y).feature;
    assert.ok(layers.has(g), `${x},${y} ${g}`);
    if (f === 'river' || f === 'bridge' || f === 'ford') assert.ok(g === 'water' || g === 'ice');
  }
});

test('each bridge or ford is one row across the river, from bank to bank, along its axis', () => {
  const N = { x: [1, 0], y: [0, 1] };
  let crossings = 0;
  for (let x = -187; x <= 186; x++) for (let y = -187; y <= 186; y++) {
    const kind = T.riverAt(x, y);
    if (kind !== 'bridge' && kind !== 'ford') continue;
    const axis = T.crossingAxisAt(x, y);
    assert.ok(axis === 'x' || axis === 'y');
    const [dx, dy] = N[axis];
    if (T.riverAt(x - dx, y - dy) === kind) continue;   // start of the row only
    crossings++;
    assert.equal(T.isBlocked(x - dx, y - dy), false, `bank before ${x},${y}`);
    let k = 0;
    while (T.riverAt(x + dx * k, y + dy * k) === kind) k++;
    assert.ok(k >= 1 && k <= 9);
    assert.equal(T.isBlocked(x + dx * k, y + dy * k), false, `bank after ${x},${y}`);
  }
  assert.ok(crossings >= 30, `${crossings} crossings`);
});

test('fords cost twice as much, forests 10 % more except for the Gauls', () => {
  let ford = null, tree = null;
  for (let x = -187; x <= 186 && !(ford && tree); x++) for (let y = -187; y <= 186; y++) {
    const f = T.getTerrainType(x, y).feature;
    if (!ford && f === 'ford') ford = [x, y];
    if (!tree && f === 'tree') tree = [x, y];
  }
  assert.equal(T.moveCost(...ford), 2);
  assert.ok(Math.abs(T.moveCost(...tree, null, { faction: 'ROME' }) - 1 / 0.9) < 1e-9);
  assert.equal(T.moveCost(...tree, null, { faction: 'GAUL' }), 1);
});

test('the main land holds almost every walkable cell', () => {
  let walk = 0, main = 0;
  for (let x = -187; x <= 186; x += 3) for (let y = -187; y <= 186; y += 3) {
    if (T.isBlocked(x, y)) { assert.equal(T.isMainland(x, y), false); continue; }
    walk++; if (T.isMainland(x, y)) main++;
  }
  assert.ok(main / walk > 0.97, `${(main / walk * 100).toFixed(1)} %`);
});

// Import des animations livrées en une image (tools/repaint.cjs) : bande ou grille selon la forme des cases
test('an animation delivered as one image is cut as a strip or as a grid, whichever gives frame-shaped cells', () => {
  const { gridFor } = require('../../tools/repaint/targets.cjs');
  const grid = (...a) => { const { cols, rows } = gridFor(...a); return { cols, rows }; };
  assert.deepEqual(grid(6, 1536, 1024, 512, 512), { cols: 3, rows: 2 }, '6 poses in a 3 × 2 sheet');
  assert.deepEqual(grid(6, 3072, 512, 512, 512), { cols: 6, rows: 1 }, 'a horizontal strip still works');
  assert.deepEqual(grid(4, 1024, 1024, 512, 512), { cols: 2, rows: 2 }, '4 poses in a 2 × 2 sheet');
  assert.deepEqual(grid(6, 3072, 768, 128, 192), { cols: 6, rows: 1 }, 'tall prop frames in a strip');
  assert.equal(gridFor(6, 1536, 1024, 512, 512).error, 0, 'an exact sheet has no error');
  assert.ok(gridFor(6, 1000, 1000, 512, 512).error > 0.1, 'a square image of 6 poses is flagged');
  assert.deepEqual(grid(2, 1024, 1024, 1024, 1024), { cols: 2, rows: 1 }, 'on a tie, more columns than rows');
});
