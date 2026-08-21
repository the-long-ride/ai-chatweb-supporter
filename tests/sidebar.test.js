const test = require('node:test');
const assert = require('node:assert/strict');
const sidebar = require('../src/sidebar/core.js');

const goodMetrics = {
  visible: true,
  left: 0,
  right: 320,
  width: 320,
  heightRatio: 0.9,
  widthRatio: 0.25,
  semanticHint: true,
  containsNavigation: true,
  isBodyLike: false,
};

test('sidebar width rules are preserved', () => {
  assert.equal(sidebar.MIN_WIDTH, 220);
  assert.equal(sidebar.MAX_WIDTH, 700);
  assert.equal(sidebar.clampWidth(100), 220);
  assert.equal(sidebar.clampWidth(400), 400);
  assert.equal(sidebar.clampWidth(900), 700);
  assert.equal(sidebar.parseStoredWidth(400), 400);
  assert.equal(sidebar.parseStoredWidth(100), null);
  assert.equal(sidebar.parseStoredWidth(701), null);
});

test('sidebar scoring favors a visible left navigation rail', () => {
  assert.ok(sidebar.scoreSidebarCandidate(goodMetrics) > 7);
  assert.equal(sidebar.scoreSidebarCandidate({ ...goodMetrics, visible: false }), Number.NEGATIVE_INFINITY);
  assert.equal(sidebar.scoreSidebarCandidate({ ...goodMetrics, isBodyLike: true, widthRatio: 0.95 }), 8);
});
