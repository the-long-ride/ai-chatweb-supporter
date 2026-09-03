const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/batch/core.js');

test('selection toggles and clears deterministically', () => {
  const selected = core.createSelection(['a']);
  assert.equal(core.toggleSelection(selected, 'b'), true);
  assert.deepEqual([...selected], ['a', 'b']);
  assert.equal(core.toggleSelection(selected, 'a'), false);
  assert.deepEqual([...selected], ['b']);
  assert.equal(core.clearSelection(selected), selected);
  assert.equal(selected.size, 0);
});

test('confirmation copy includes action and exact count', () => {
  assert.equal(core.confirmationMessage('archive', 8), 'Archive 8 selected conversations?');
  assert.equal(core.confirmationMessage('delete', 1), 'Delete 1 selected conversation?');
});

test('actions require support, selection, and idle state', () => {
  const selection = new Set(['x']);
  assert.equal(core.actionEnabled({ selection, busy: false, supported: true }), true);
  assert.equal(core.actionEnabled({ selection, busy: true, supported: true }), false);
  assert.equal(core.actionEnabled({ selection: new Set(), busy: false, supported: true }), false);
  assert.equal(core.actionEnabled({ selection, busy: false, supported: false }), false);
});

test('sequential runner preserves order and continues after failures', async () => {
  const calls = [];
  const result = await core.runSequential(['a', 'b', 'c'], async (id) => {
    calls.push(id);
    if (id === 'b') throw new Error('boom');
  });
  assert.deepEqual(calls, ['a', 'b', 'c']);
  assert.deepEqual(result.succeeded, ['a', 'c']);
  assert.deepEqual(result.failed.map((entry) => entry.id), ['b']);
});
