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

// takeFromNode : RETURNING voit la ligne après l'UPDATE, la prise doit se lire sur le stock d'avant (CTE `old`)
test('takeFromNode reads the amount taken from the stock before the debit', async () => {
  const { takeFromNode } = require('../../src/utils/db');
  let sql = '', values = [];
  const tx = { $queryRaw: async (strings, ...v) => { sql = strings.join('?'); values = v; return [{ taken: 800n }]; } };
  assert.equal(await takeFromNode(tx, 'node-1', 1000), 800);
  assert.match(sql, /WITH old AS \(SELECT id, amount FROM "ResourceNode" WHERE id = \? FOR UPDATE\)/);
  assert.match(sql, /SET amount = n\.amount - LEAST\(old\.amount, \?\)/);
  assert.match(sql, /RETURNING LEAST\(old\.amount, \?\) AS taken/);
  assert.deepEqual(values, ['node-1', 1000, 1000]);
  assert.equal(await takeFromNode({ $queryRaw: async () => { throw new Error('no query expected'); } }, 'node-1', 0), 0);
  assert.equal(await takeFromNode({ $queryRaw: async () => [] }, 'node-1', 50), 0);   // nœud vide ou absent
});
