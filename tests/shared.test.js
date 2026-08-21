const test = require('node:test');
const assert = require('node:assert/strict');
const constants = require('../src/shared/constants.js');

test('stable storage keys remain backward-compatible', () => {
  assert.deepEqual(constants.STORAGE_KEYS, {
    sidebarWidth: 'cgptSidebarResizerWidth',
    grokSidebarWidth: 'grokSidebarResizerWidth',
    messageQueue: 'cgptMessageQueue',
    queueShortcut: 'cgptQueueShortcut',
  });
});
