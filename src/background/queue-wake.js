(() => {
  'use strict';

  const REGISTRY_KEY = 'aichat.queue.registeredTabs';
  const BACKGROUND_KEEP_AWAKE_KEY = 'backgroundKeepAwake';
  const ALARM_NAME = 'aichat:queue-wake';
  const WAKE_PERIOD_MINUTES = 0.5;
  const IDLE_DETECTION_SECONDS = 30;
  const TAB_READY_TIMEOUT_MS = 15000;
  const TAB_READY_POLL_MS = 250;
  const RECONCILE_MESSAGE = Object.freeze({ type:'aichat:queue-reconcile' });
  const ALLOWED_PROVIDERS = new Set(['chatgpt', 'claude', 'grok']);
  const SUPPORTED_HOSTS = new Set(['chatgpt.com', 'claude.ai', 'grok.com']);

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

  function isSupportedChatUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
      return SUPPORTED_HOSTS.has(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  async function discoverOpenTabs(chromeApi) {
    if (!chromeApi?.tabs?.query) return [];
    try {
      return Array.from(await chromeApi.tabs.query({}) || []).filter((tab) => Number.isInteger(tab?.id));
    } catch {
      return [];
    }
  }

  async function discoverOpenTabIds(chromeApi) {
    const tabs = await discoverOpenTabs(chromeApi);
    return Array.from(new Set(tabs.map((tab) => tab.id)));
  }

  async function readBackgroundKeepAwake(chromeApi) {
    const local = chromeApi?.storage?.local;
    if (!local?.get) return false;
    try {
      const stored = await local.get(BACKGROUND_KEEP_AWAKE_KEY);
      return stored?.[BACKGROUND_KEEP_AWAKE_KEY] === true;
    } catch {
      return false;
    }
  }

  async function readMachineState(chromeApi) {
    if (!chromeApi?.idle?.queryState) return 'active';
    try {
      const state = await chromeApi.idle.queryState(IDLE_DETECTION_SECONDS);
      return state === 'locked' || state === 'idle' ? state : 'active';
    } catch {
      return 'active';
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function getTab(chromeApi, tabId) {
    if (!chromeApi?.tabs?.get) return null;
    try {
      return await chromeApi.tabs.get(tabId);
    } catch {
      return null;
    }
  }

  async function waitForRunnableTab(chromeApi, tabId, timeoutMs = TAB_READY_TIMEOUT_MS) {
    if (!chromeApi?.tabs?.get) return true;
    const deadline = Date.now() + timeoutMs;
    do {
      const tab = await getTab(chromeApi, tabId);
      if (!tab) return false;
      if (tab.discarded !== true && tab.frozen !== true && tab.status !== 'loading') return true;
      await delay(TAB_READY_POLL_MS);
    } while (Date.now() < deadline);
    return false;
  }

  async function sendReconcile(chromeApi, tabId, attempts = 1) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await chromeApi.tabs.sendMessage(tabId, RECONCILE_MESSAGE);
        return true;
      } catch {
        if (attempt + 1 >= attempts) return false;
        await delay(TAB_READY_POLL_MS);
      }
    }
    return false;
  }

  async function findActiveTabInWindow(chromeApi, windowId) {
    if (!chromeApi?.tabs?.query || !Number.isInteger(windowId)) return null;
    try {
      const tabs = await chromeApi.tabs.query({ active:true, windowId });
      return Array.from(tabs || []).find((tab) => Number.isInteger(tab?.id)) || null;
    } catch {
      return null;
    }
  }

  async function activateFrozenTabAndReconcile(chromeApi, tab) {
    if (!chromeApi?.tabs?.update || !Number.isInteger(tab?.id)) return false;
    const previousActive = await findActiveTabInWindow(chromeApi, tab.windowId);
    const shouldRestore = Number.isInteger(previousActive?.id) && previousActive.id !== tab.id;

    try {
      await chromeApi.tabs.update(tab.id, { active:true, autoDiscardable:false });
      if (!await waitForRunnableTab(chromeApi, tab.id)) return false;
      return await sendReconcile(chromeApi, tab.id, 8);
    } catch {
      return false;
    } finally {
      if (shouldRestore) {
        try { await chromeApi.tabs.update(previousActive.id, { active:true }); } catch { /* best effort */ }
      }
    }
  }

  async function wakeRegisteredQueueTabs(chromeApi) {
    const registry = await readRegistry(chromeApi);
    const openTabs = await discoverOpenTabs(chromeApi);
    const tabsById = new Map(openTabs.map((tab) => [tab.id, tab]));
    const registeredIds = Object.keys(registry)
      .map((value) => Number(value))
      .filter(Number.isInteger);

    if (chromeApi?.tabs?.get) {
      for (const tabId of registeredIds) {
        if (tabsById.has(tabId)) continue;
        const tab = await getTab(chromeApi, tabId);
        if (tab) tabsById.set(tabId, tab);
      }
    } else {
      for (const tabId of registeredIds) {
        if (!tabsById.has(tabId)) tabsById.set(tabId, { id:tabId });
      }
    }

    const keepAwakeEnabled = await readBackgroundKeepAwake(chromeApi);
    const machineState = keepAwakeEnabled ? await readMachineState(chromeApi) : 'active';
    let changed = false;

    for (const [tabId, tab] of tabsById) {
      const key = String(tabId);
      const isRegistered = ALLOWED_PROVIDERS.has(registry[key]);
      const hasKnownUrl = typeof tab?.url === 'string' && tab.url.length > 0;
      const isKnownSupported = isRegistered || isSupportedChatUrl(tab?.url);

      if (hasKnownUrl && !isKnownSupported) continue;

      if (keepAwakeEnabled && isKnownSupported && chromeApi?.tabs?.update) {
        try { await chromeApi.tabs.update(tabId, { autoDiscardable:false }); } catch { /* handled below if needed */ }
      }

      const isSuspended = tab?.frozen === true || tab?.discarded === true;
      let sent = false;

      if (keepAwakeEnabled && isKnownSupported && isSuspended && machineState !== 'active') {
        sent = await activateFrozenTabAndReconcile(chromeApi, tab);
      } else if (isSuspended && machineState === 'active' && isKnownSupported) {
        // Do not steal the user's active tab while they are using the machine.
        // The next locked/idle wake can activate and unfreeze this tab safely.
        continue;
      } else {
        sent = await sendReconcile(chromeApi, tabId);
      }

      if (!sent && isRegistered && !(isSuspended && machineState === 'active')) {
        const stillExists = chromeApi?.tabs?.get ? Boolean(await getTab(chromeApi, tabId)) : false;
        if (!stillExists) {
          delete registry[key];
          changed = true;
        } else if (!chromeApi?.tabs?.get) {
          delete registry[key];
          changed = true;
        }
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
    BACKGROUND_KEEP_AWAKE_KEY,
    ALARM_NAME,
    WAKE_PERIOD_MINUTES,
    IDLE_DETECTION_SECONDS,
    RECONCILE_MESSAGE,
    isSupportedChatUrl,
    registerQueueTab,
    discoverOpenTabs,
    discoverOpenTabIds,
    readBackgroundKeepAwake,
    readMachineState,
    waitForRunnableTab,
    activateFrozenTabAndReconcile,
    wakeRegisteredQueueTabs,
    installQueueWake,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.AiChatWebQueueWake = api;
})();
