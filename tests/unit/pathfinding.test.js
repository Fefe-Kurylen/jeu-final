require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../frontend/js/shared/terrain.js');

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
  assert.equal(T.isBlocked(-59, -30, objects), false, 'and so is its neighbour');
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
