(() => {
  'use strict';

  globalThis.chrome?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'aichat:get-tab-id') return undefined;
    sendResponse({ tabId: Number.isInteger(sender?.tab?.id) ? sender.tab.id : null });
    return undefined;
  });
})();
