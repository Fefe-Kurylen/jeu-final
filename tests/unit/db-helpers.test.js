require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { RESOURCES, isId } = require('../../src/utils/db');

test('resource list and id validation', () => {
  assert.deepEqual(RESOURCES, ['wood', 'stone', 'iron', 'food']);
  assert.equal(isId('6f1c2d3e-aaaa-bbbb-cccc-000000000000'), true);
  assert.equal(isId(''), false);
  assert.equal(isId(42), false);
  assert.equal(isId('x'.repeat(65)), false);
});
