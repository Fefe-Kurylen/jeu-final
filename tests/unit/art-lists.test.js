require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildingsData } = require('../../src/config/gamedata');
const P = require('../../tools/repaint/prompts.cjs');
const { classify } = require('../../tools/repaint/families.cjs');

// Listes graphiques (docs/PROMPTS-GRAPHIQUES.md, GRAPHISMES-COMPLET.md, GENERATION-COMPLETE.md) : elles suivent les
// bâtiments des données (Douves supprimées le 30 octobre 2026), sans nombre écrit en dur

test('listes graphiques : un sujet de prompt par bâtiment des données, plus de Douves', () => {
  assert.deepEqual(Object.keys(P.BUILDING).sort(), buildingsData.map(b => b.key).sort());
  assert.equal(P.BUILDING.MOAT, undefined);
});

test('listes graphiques : la famille des bâtiments annonce le nombre de bâtiments des données', () => {
  const families = classify(['buildings/ROME/FARM.webp'], new Set()).screens.flatMap(([, list]) => list);
  const current = families.find(f => /palier courant/.test(f.title));
  assert.ok(current.title.includes(`${buildingsData.length} × 6 civilisations`), current.title);
  assert.equal(current.total, 1);
});
