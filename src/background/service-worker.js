importScripts('attachment-store.js', 'queue-wake.js');

(() => {
  'use strict';

  const BACKGROUND_KEEP_AWAKE_KEY = 'backgroundKeepAwake';

  function applyKeepAwake(enabled) {
    const power = globalThis.chrome?.power;
    if (!power?.requestKeepAwake || !power?.releaseKeepAwake) return false;
    try {
      if (enabled) power.requestKeepAwake('system');
      else power.releaseKeepAwake();
      return true;
    } catch {
      return false;
    }
  }

  async function syncKeepAwake() {
    const local = globalThis.chrome?.storage?.local;
    if (!local?.get) return false;
    try {
      const stored = await local.get(BACKGROUND_KEEP_AWAKE_KEY);
      return applyKeepAwake(stored?.[BACKGROUND_KEEP_AWAKE_KEY] === true);
    } catch {
      return false;
    }
  }

  function onStorageChanged(changes, areaName) {
    if (areaName !== 'local' || !changes?.[BACKGROUND_KEEP_AWAKE_KEY]) return;
    applyKeepAwake(changes[BACKGROUND_KEEP_AWAKE_KEY].newValue === true);
  }

  globalThis.chrome?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'aichat:get-tab-id') return undefined;
    sendResponse({ tabId: Number.isInteger(sender?.tab?.id) ? sender.tab.id : null });
    return undefined;
  });

  globalThis.chrome?.storage?.onChanged?.addListener(onStorageChanged);
  void syncKeepAwake();
  globalThis.AiChatWebQueueWake?.installQueueWake?.(globalThis.chrome);
})();
