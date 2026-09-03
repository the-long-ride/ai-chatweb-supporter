const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../src/queue/ui.js');
const css = fs.readFileSync(path.resolve(__dirname, '../src/queue/styles.css'), 'utf8');
const view = fs.readFileSync(path.resolve(__dirname, '../src/queue/view.js'), 'utf8');

test('queue icon actions use the same fixed 28px square', () => {
  const block = css.match(/\.cgpt-queue-icon-button\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(block, /width:\s*28px/);
  assert.match(block, /min-width:\s*28px/);
  assert.match(block, /height:\s*28px/);
  assert.doesNotMatch(block, /width:\s*auto/);
});

test('queue rows and viewport geometry both use six pixels of vertical separation', () => {
  const block = css.match(/\.cgpt-queue-scroll\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(block, /gap:\s*6px/);
  assert.equal(ui.ROW_GAP_PX, 6);
  assert.equal(ui.queueViewportMaxHeightPx(), (ui.MAX_VISIBLE_ITEMS * ui.ROW_HEIGHT_PX) + ((ui.MAX_VISIBLE_ITEMS - 1) * 6));
});

test('queue header exposes dedicated Clear all modal lifecycle and clears pending undo after success', () => {
  assert.match(view, /Clear all queued messages/);
  assert.match(view, /CLEAR_MODAL_ID/);
  assert.match(view, /openClearAllModal/);
  assert.match(view, /closeClearAllModal/);
  assert.match(view, /clearAllItems/);
  assert.match(view, /clearUndo\(\{\s*deleteAttachments:\s*true\s*\}\)/);
});
