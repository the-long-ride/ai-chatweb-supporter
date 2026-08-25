(() => {
  'use strict';

  const STORAGE_KEYS = Object.freeze({
    sidebarWidth: 'cgptSidebarResizerWidth',
    grokSidebarWidth: 'grokSidebarResizerWidth',
    messageQueue: 'cgptMessageQueue',
    queueShortcut: 'cgptQueueShortcut',
    claudeAutoContinue: 'claudeAutoContinue',
  });

  const api = { STORAGE_KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const namespace = globalThis.AiChatWebSupporter ||= {};
    namespace.constants = api;
  }
})();
