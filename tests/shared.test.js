const test = require('node:test');
const assert = require('node:assert/strict');
const constants = require('../src/shared/constants.js');

test('stable storage keys include queue, Claude, auto-continue, background, and popup settings', () => {
  assert.deepEqual(constants.STORAGE_KEYS, {
    sidebarWidth: 'cgptSidebarResizerWidth',
    grokSidebarWidth: 'grokSidebarResizerWidth',
    messageQueue: 'cgptMessageQueue',
    queueShortcut: 'cgptQueueShortcut',
    queueEnabled: 'queueEnabled',
    claudeAutoContinue: 'claudeAutoContinue',
    autoContinueEnabled: 'autoContinueEnabled',
    autoContinueMatchText: 'autoContinueMatchText',
    chatgptErrorAutoContinue: 'chatgptErrorAutoContinue',
    backgroundKeepAwake: 'backgroundKeepAwake',
    popupTheme: 'popupTheme',
  });
});
