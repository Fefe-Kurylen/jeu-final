require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../../src/utils/validation');

test('cleanText strips markup and refuses oversized input quickly (no ReDoS)', () => {
  assert.equal(v.cleanText('  Legio <b>X</b>  ', 2, 30), 'Legio X');
  assert.equal(v.cleanText('<img src=x onerror=alert(1)>', 2, 30), null);
  assert.equal(v.cleanText('ab', 3, 30), null);
  const t0 = Date.now();
  assert.equal(v.cleanText('<'.repeat(200000), 1, 30), null);
  assert.ok(Date.now() - t0 < 50, 'a 200 kB string is rejected before any regex runs');
  assert.equal(v.cleanText(12345), null);
});

test('email, password, name and faction rules', () => {
  assert.equal(v.validateEmail('felix@example.com'), true);
  assert.equal(v.validateEmail('not an email'), false);
  assert.equal(v.validateEmail('a@b.c' + 'x'.repeat(300)), false);
  assert.equal(v.validatePassword('short7!'), false);
  assert.equal(v.validatePassword('Test1234!'), true);
  assert.equal(v.validateName('Alpha_1'), true);
  assert.equal(v.validateName('al'), false);
  assert.equal(v.validateName('<script>'), false);
  assert.equal(v.validateFaction('rome'), true);
  assert.equal(v.validateFaction('ATLANTIS'), false);
  assert.equal(v.validateFaction(123), false);
});

test('amounts and coordinates are bounded integers', () => {
  assert.equal(v.isAmount(10), true);
  assert.equal(v.isAmount(-1), false);
  assert.equal(v.isAmount(1.5), false);
  assert.equal(v.isAmount(3e12), false);
  assert.equal(v.validateCoordinates(0, 0), true);
  assert.equal(v.validateCoordinates(10000, 0), false);
  assert.equal(v.validateCoordinates('1', 0), false);
});

test('safeEqual compares secrets in constant time and refuses non-strings', () => {
  assert.equal(v.safeEqual('abc', 'abc'), true);
  assert.equal(v.safeEqual('abc', 'abd'), false);
  assert.equal(v.safeEqual(undefined, 'abc'), false);
  assert.equal(v.safeEqual('a', 'aaaa'), false);
});
