const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../src/queue/ui.js');

test('queue viewport is capped at five visible items', () => {
  assert.equal(ui.MAX_VISIBLE_ITEMS,5);
  assert.equal(ui.hasQueueOverflow(5),false);
  assert.equal(ui.hasQueueOverflow(6),true);
  assert.equal(ui.queueViewportMaxHeightPx(),186);
});

test('up-arrow is shown only while overflow items remain hidden above', () => {
  assert.equal(ui.shouldShowHiddenAboveIndicator(6,40),true);
  assert.equal(ui.shouldShowHiddenAboveIndicator(6,0),false);
  assert.equal(ui.shouldShowHiddenAboveIndicator(5,40),false);
});

test('all action icons are sanitized and theme-aware', () => {
  for (const name of ['edit','delete','undo','up']) {
    const svg=ui.ICONS[name];
    assert.match(svg,/^<svg\b/);
    assert.doesNotMatch(svg,/SVGRepo_/);
    assert.doesNotMatch(svg,/id=/);
    assert.match(svg,/currentColor/);
  }
});
