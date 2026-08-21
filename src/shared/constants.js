(() => {
  'use strict';

  const STORAGE_KEYS = Object.freeze({
    sidebarWidth: 'cgptSidebarResizerWidth',
    messageQueue: 'cgptMessageQueue',
    queueShortcut: 'cgptQueueShortcut',
  });

  const api = { STORAGE_KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const namespace = globalThis.AiChatWebSupporter ||= {};
    namespace.constants = api;
  }
})();
