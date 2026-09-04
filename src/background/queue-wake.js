(() => {
  'use strict';

  const REGISTRY_KEY = 'aichat.queue.registeredTabs';
  const ALARM_NAME = 'aichat:queue-wake';
  const WAKE_PERIOD_MINUTES = 1;
  const ALLOWED_PROVIDERS = new Set(['chatgpt', 'claude', 'grok']);

  async function readRegistry(chromeApi) {
    const stored = await chromeApi.storage.session.get(REGISTRY_KEY);
    const value = stored?.[REGISTRY_KEY];
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  }

  async function writeRegistry(chromeApi, registry) {
    await chromeApi.storage.session.set({ [REGISTRY_KEY]: registry });
  }

  async function registerQueueTab(chromeApi, tabId, providerId) {
    if (!Number.isInteger(tabId) || !ALLOWED_PROVIDERS.has(providerId)) return false;
    const registry = await readRegistry(chromeApi);
    registry[String(tabId)] = providerId;
    await writeRegistry(chromeApi, registry);
    return true;
  }

  async function wakeRegisteredQueueTabs(chromeApi) {
    const registry = await readRegistry(chromeApi);
    let changed = false;
    for (const tabIdText of Object.keys(registry)) {
      const tabId = Number(tabIdText);
      try {
        await chromeApi.tabs.sendMessage(tabId, { type:'aichat:queue-reconcile' });
      } catch {
        delete registry[tabIdText];
        changed = true;
      }
    }
    if (changed) await writeRegistry(chromeApi, registry);
    return registry;
  }

  function installQueueWake(chromeApi = globalThis.chrome) {
    if (!chromeApi?.runtime?.onMessage || !chromeApi?.alarms || !chromeApi?.storage?.session || !chromeApi?.tabs?.sendMessage) return false;

    try { chromeApi.alarms.create(ALARM_NAME, { periodInMinutes:WAKE_PERIOD_MINUTES }); } catch { /* best effort */ }

    chromeApi.runtime.onMessage.addListener((message, sender) => {
      if (message?.type !== 'aichat:queue-register') return undefined;
      void registerQueueTab(chromeApi, sender?.tab?.id, message.provider).catch(() => {});
      return undefined;
    });

    chromeApi.alarms.onAlarm?.addListener?.((alarm) => {
      if (alarm?.name !== ALARM_NAME) return;
      void wakeRegisteredQueueTabs(chromeApi).catch(() => {});
    });

    return true;
  }

  const api = {
    REGISTRY_KEY,
    ALARM_NAME,
    WAKE_PERIOD_MINUTES,
    registerQueueTab,
    wakeRegisteredQueueTabs,
    installQueueWake,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.AiChatWebQueueWake = api;
})();
