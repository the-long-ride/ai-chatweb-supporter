(() => {
  'use strict';

  const namespace = globalThis.AiChatWebSupporter || {};
  const constants = typeof module !== 'undefined' && module.exports ? require('../shared/constants.js') : namespace.constants;
  const storage = typeof module !== 'undefined' && module.exports ? require('../shared/storage.js') : namespace.storage;
  const core = typeof module !== 'undefined' && module.exports ? require('./core.js') : namespace.queueCore;
  const dom = typeof module !== 'undefined' && module.exports ? require('./dom.js') : namespace.queueDom;
  const registry = typeof module !== 'undefined' && module.exports ? require('../providers/registry.js') : namespace.providerRegistry;
  const scope = typeof module !== 'undefined' && module.exports ? require('./scope.js') : namespace.queueScope;
  const viewApi = typeof module !== 'undefined' && module.exports ? require('./view.js') : namespace.queueView;

  const { queueShortcut: SHORTCUT_KEY, queueEnabled: QUEUE_ENABLED_KEY } = constants.STORAGE_KEYS;
  const RECONCILE_INTERVAL_MS = 800;

  function canAutoDispatch({ enabled = true, paused, busy, sendReady, queueLength, dispatching, awaitingBusy }) {
    return enabled !== false && !paused && core.canDispatch({ busy, sendReady, queueLength, dispatching, awaitingBusy });
  }

  async function captureQueuedMessage({ state, text, persist, clearComposer, now = Date.now, idFactory }) {
    const item = core.createQueueItem(text, now, idFactory);
    if (!item) return null;
    const previous = state.queue.slice();
    state.setQueue([...previous, item]);
    try {
      await persist();
    } catch (error) {
      state.setQueue(previous);
      throw error;
    }
    clearComposer();
    return item;
  }

  async function updatePausedState({ state, paused, persist }) {
    const previous = state.paused;
    state.setPaused(paused);
    try {
      await persist();
    } catch (error) {
      state.setPaused(previous);
      throw error;
    }
    return state.paused;
  }

  async function handleQueueShortcut({ provider, state, composer, event, persist, enabled = true, now = Date.now, idFactory }) {
    if (enabled === false) return 'ignored';
    const text = provider?.getComposerText?.(composer);
    if (!String(text || '').trim()) return 'ignored';

    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    try {
      await captureQueuedMessage({
        state,
        text,
        persist,
        clearComposer: () => provider.setComposerText(composer, ''),
        now,
        idFactory,
      });
      return 'queued';
    } catch {
      return 'failed';
    }
  }

  class DispatchGate {
    constructor() { this.dispatching = false; this.awaitingBusy = false; }
    observeBusy(busy) { if (busy && this.awaitingBusy) this.awaitingBusy = false; }
    shouldDispatch({ enabled = true, paused = false, busy, sendReady, queueLength }) {
      return canAutoDispatch({ enabled, paused, busy, sendReady, queueLength, dispatching: this.dispatching, awaitingBusy: this.awaitingBusy });
    }
    beginDispatch() { this.dispatching = true; }
    finishDispatch(sent) { this.dispatching = false; this.awaitingBusy = Boolean(sent); }
    reset() { this.dispatching = false; this.awaitingBusy = false; }
  }

  class ActiveQueueState {
    constructor() { this.scopeId = null; this.storageKey = null; this.queue = []; this.paused = false; }
    switchTo(scopeId, nextState) {
      this.scopeId = scopeId || null;
      this.storageKey = scope.queueStorageKey(this.scopeId);
      const normalized = core.normalizeQueueState(nextState);
      this.queue = normalized.items;
      this.paused = normalized.paused;
      return this.storageValue();
    }
    setState(nextState) {
      const normalized = core.normalizeQueueState(nextState);
      this.queue = normalized.items;
      this.paused = normalized.paused;
      return this.storageValue();
    }
    setQueue(nextQueue) { this.queue = core.normalizeQueue(nextQueue); return this.queue; }
    setPaused(nextPaused) { this.paused = Boolean(nextPaused); return this.paused; }
    storageValue() { return { paused: this.paused, items: this.queue.slice() }; }
    isCurrentScope(scopeId) { return Boolean(this.scopeId && this.scopeId === scopeId); }
    isActiveStorageKey(key) { return Boolean(this.storageKey && this.storageKey === key); }
  }

  function requestTabId(runtime = globalThis.chrome?.runtime) {
    if (!runtime?.sendMessage) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        runtime.sendMessage({ type: 'aichat:get-tab-id' }, (response) => {
          void runtime.lastError;
          resolve(Number.isInteger(response?.tabId) ? response.tabId : null);
        });
      } catch { resolve(null); }
    });
  }

  class QueueScopeCoordinator {
    constructor({ storageApi = storage, state = new ActiveQueueState() } = {}) { this.storageApi = storageApi; this.state = state; }
    async switchTo(nextScope) {
      if (!nextScope || this.state.isCurrentScope(nextScope)) return false;
      const previousScope = this.state.scopeId;
      const previousKey = this.state.storageKey;
      const previousState = this.state.storageValue();
      const nextKey = scope.queueStorageKey(nextScope);
      if (!nextKey) return false;

      const oldScopedKey = scope.legacyScopedKey(nextScope);
      const globalLegacyKey = scope.legacyGlobalKey(nextScope);
      const keys = [nextKey];
      if (oldScopedKey) keys.push(oldScopedKey);
      if (globalLegacyKey) keys.push(globalLegacyKey);
      const stored = await this.storageApi.get(keys);
      const nextState = core.normalizeQueueState(stored[nextKey]);
      const transition = scope.planScopeTransition({ previousScope, nextScope, previousState, nextState });

      let resolvedState = transition.state;
      let persistNext = transition.transfer || (stored[nextKey] !== undefined && Array.isArray(stored[nextKey]));
      let removeOldScoped = false;
      let removeGlobalLegacy = false;

      if (!transition.transfer && !nextState.items.length) {
        if (oldScopedKey) {
          const migration = scope.planLegacyMigration({ scopedState: nextState, legacyQueue: stored[oldScopedKey] });
          if (migration.migrate) { resolvedState = migration.state; persistNext = true; removeOldScoped = true; }
        }
        if (!persistNext && globalLegacyKey) {
          const migration = scope.planLegacyMigration({ scopedState: nextState, legacyQueue: stored[globalLegacyKey] });
          if (migration.migrate) { resolvedState = migration.state; persistNext = true; removeGlobalLegacy = true; }
        }
      }

      if (persistNext) await this.storageApi.set({ [nextKey]: resolvedState });
      if (transition.removePrevious && previousKey) await this.storageApi.remove(previousKey);
      if (removeOldScoped && oldScopedKey) await this.storageApi.remove(oldScopedKey);
      if (removeGlobalLegacy && globalLegacyKey) await this.storageApi.remove(globalLegacyKey);
      this.state.switchTo(nextScope, resolvedState);
      return true;
    }
  }

  const api = { DispatchGate, ActiveQueueState, QueueScopeCoordinator, requestTabId, captureQueuedMessage, handleQueueShortcut, updatePausedState, canAutoDispatch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).queueController = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const gate = new DispatchGate();
  const state = new ActiveQueueState();
  const coordinator = new QueueScopeCoordinator({ storageApi: storage, state });
  let shortcut = core.DEFAULT_SHORTCUT;
  let queueEnabled = true;
  let tabId = null;
  let activeProvider = null;
  let initialized = false;
  let mutationObserver = null;
  let reconcileFrame = 0;
  let scopeSwitchPromise = null;

  function currentProvider() { return registry.getProvider(globalThis.location?.href || ''); }
  function persistQueue() { return state.storageKey ? storage.set({ [state.storageKey]: state.storageValue() }) : Promise.resolve(); }
  function setQueue(next) { state.setQueue(next); }
  async function setPaused(next) { await updatePausedState({ state, paused: next, persist: persistQueue }); view.render(); scheduleReconcile(); }

  const view = new viewApi.QueueView({
    getQueue: () => state.queue,
    setQueue,
    getPaused: () => state.paused,
    setPaused,
    persistQueue,
    scheduleReconcile,
    getProvider: () => activeProvider || currentProvider(),
  });

  function eventBelongsToComposer(event, composer) {
    const target = event.target;
    return Boolean(target && (target === composer || composer.contains?.(target)));
  }

  async function ensureActiveScope() {
    if (scopeSwitchPromise) await scopeSwitchPromise;
    const url = globalThis.location?.href || '';
    const provider = registry.getProvider(url);
    if (!provider) { activeProvider = null; return false; }
    const nextScope = scope.resolveScope(provider, url, tabId);
    if (!nextScope) return false;
    if (state.isCurrentScope(nextScope)) { activeProvider = provider; return true; }
    const previousScope = state.scopeId;
    const continuation = scope.isScopeContinuation(previousScope, nextScope);
    scopeSwitchPromise = coordinator.switchTo(nextScope);
    let changed = false;
    try { changed = await scopeSwitchPromise; } finally { scopeSwitchPromise = null; }
    activeProvider = provider;
    if (changed) { if (!continuation) gate.awaitingBusy = false; view.render(); }
    const latestUrl = globalThis.location?.href || '';
    const latestProvider = registry.getProvider(latestUrl);
    const latestScope = latestProvider ? scope.resolveScope(latestProvider, latestUrl, tabId) : null;
    if (latestScope && !state.isCurrentScope(latestScope)) return ensureActiveScope();
    activeProvider = latestProvider;
    return Boolean(state.scopeId && activeProvider);
  }

  async function onKeyDown(event) {
    if (event.defaultPrevented || event.isComposing || event.repeat || !queueEnabled) return;
    const provider = currentProvider();
    if (!provider || !state.scopeId || !core.matchesQueueShortcut(event, shortcut)) return;
    const expectedScope = scope.resolveScope(provider, globalThis.location?.href || '', tabId);
    if (!state.isCurrentScope(expectedScope)) { void ensureActiveScope(); return; }
    const composer = provider.findComposer(document, window);
    if (!composer || !eventBelongsToComposer(event, composer)) return;
    const result = await handleQueueShortcut({
      provider,
      state,
      composer,
      event,
      persist: persistQueue,
      enabled: queueEnabled,
    });
    if (result === 'queued') {
      view.render(composer);
      scheduleReconcile();
    }
  }

  function waitForSendReady(composer, provider, timeoutMs = 1600) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const button = provider.findSendButton(composer, document, window);
        if (dom.isButtonReady(button, window)) return resolve(button);
        if (Date.now() - started >= timeoutMs) return resolve(null);
        window.setTimeout(check, 40);
      };
      check();
    });
  }

  function waitForSendAcceptance(composer, queuedText, provider, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const currentComposer = provider.findComposer(document, window) || composer;
        const attemptState = dom.classifySendAttempt({
          busy: Boolean(provider.findStopButton(currentComposer, document, window)),
          composerText: provider.getComposerText(currentComposer),
          queuedText,
          sendReady: dom.isButtonReady(provider.findSendButton(currentComposer, document, window), window),
        });
        if (attemptState !== 'pending') return resolve(attemptState === 'accepted');
        if (Date.now() - started >= timeoutMs) return resolve(false);
        window.setTimeout(check, 40);
      };
      check();
    });
  }

  async function removeAcceptedItem(itemId, dispatchStorageKey) {
    if (state.queue.some((entry) => entry.id === itemId)) {
      state.setQueue(state.queue.filter((entry) => entry.id !== itemId));
      await persistQueue();
      view.render();
    }
    if (dispatchStorageKey && dispatchStorageKey !== state.storageKey) {
      const stored = await storage.get([dispatchStorageKey]);
      const oldState = core.normalizeQueueState(stored[dispatchStorageKey]);
      const nextItems = oldState.items.filter((entry) => entry.id !== itemId);
      if (nextItems.length !== oldState.items.length) await storage.set({ [dispatchStorageKey]: { paused: oldState.paused, items: nextItems } });
    }
  }

  async function dispatchNext() {
    if (!queueEnabled || !state.queue.length || !state.scopeId || gate.dispatching || state.paused) return;
    const provider = currentProvider();
    if (!provider) return;
    const resolvedScope = scope.resolveScope(provider, globalThis.location?.href || '', tabId);
    if (!state.isCurrentScope(resolvedScope)) return;
    const item = state.queue[0];
    const dispatchScope = state.scopeId;
    const dispatchStorageKey = state.storageKey;
    const dispatchProviderId = provider.id;
    const composer = provider.findComposer(document, window);
    if (!composer || !dom.canPrepareQueuedSend({ busy: Boolean(provider.findStopButton(composer, document, window)), composerText: provider.getComposerText(composer), hasAttachments: provider.hasAttachments(composer) })) return;

    gate.beginDispatch();
    let sent = false;
    try {
      provider.setComposerText(composer, item.text);
      const sendButton = await waitForSendReady(composer, provider);
      if (!sendButton || provider.getComposerText(composer).trim() !== item.text) {
        if (provider.getComposerText(composer).trim() === item.text) provider.setComposerText(composer, '');
        return;
      }
      const latestProvider = currentProvider();
      if (!queueEnabled || !latestProvider || latestProvider.id !== dispatchProviderId || !state.isCurrentScope(dispatchScope) || state.paused) {
        if (provider.getComposerText(composer).trim() === item.text) provider.setComposerText(composer, '');
        return;
      }
      sendButton.click();
      sent = await waitForSendAcceptance(composer, item.text, provider);
      if (!sent) {
        if (provider.getComposerText(composer).trim() === item.text) provider.setComposerText(composer, '');
        return;
      }
      await ensureActiveScope();
      await removeAcceptedItem(item.id, dispatchStorageKey);
    } finally {
      const latestProvider = currentProvider();
      const sameProvider = latestProvider?.id === dispatchProviderId;
      const sameResponseScope = state.isCurrentScope(dispatchScope) || scope.isScopeContinuation(dispatchScope, state.scopeId);
      gate.finishDispatch(sent && sameProvider && sameResponseScope);
      scheduleReconcile();
    }
  }

  async function reconcile() {
    reconcileFrame = 0;
    if (!initialized || !await ensureActiveScope()) return;
    const provider = activeProvider || currentProvider();
    if (!provider) return;
    const composer = provider.findComposer(document, window);
    if (!composer) return;
    view.ensureRoot(composer, provider);
    const busy = Boolean(provider.findStopButton(composer, document, window));
    gate.observeBusy(busy);
    const safeToPrepare = dom.canPrepareQueuedSend({ busy, composerText: provider.getComposerText(composer), hasAttachments: provider.hasAttachments(composer) });
    if (gate.shouldDispatch({ enabled: queueEnabled, paused: state.paused, busy, sendReady: safeToPrepare, queueLength: state.queue.length })) void dispatchNext();
  }

  function scheduleReconcile() {
    if (reconcileFrame) return;
    reconcileFrame = window.requestAnimationFrame(() => { void reconcile(); });
  }

  function startObserver() {
    if (!document.body || mutationObserver) return;
    mutationObserver = new MutationObserver(scheduleReconcile);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.setInterval(scheduleReconcile, RECONCILE_INTERVAL_MS);
    window.addEventListener('popstate', scheduleReconcile, { passive: true });
  }

  function onStorageChanged(changes, areaName) {
    if (areaName !== 'local') return;
    if (changes[SHORTCUT_KEY]) shortcut = core.normalizeShortcut(changes[SHORTCUT_KEY].newValue);
    if (changes[QUEUE_ENABLED_KEY]) {
      queueEnabled = changes[QUEUE_ENABLED_KEY].newValue !== false;
      if (!queueEnabled) gate.reset();
      scheduleReconcile();
    }
    const activeKey = state.storageKey;
    if (activeKey && changes[activeKey] && state.isActiveStorageKey(activeKey)) {
      state.setState(changes[activeKey].newValue);
      view.render();
      scheduleReconcile();
    }
  }

  async function bootstrap() {
    tabId = await requestTabId();
    const stored = await storage.get([SHORTCUT_KEY, QUEUE_ENABLED_KEY]);
    shortcut = core.normalizeShortcut(stored[SHORTCUT_KEY]);
    queueEnabled = stored[QUEUE_ENABLED_KEY] !== false;
    await ensureActiveScope();
    initialized = true;
    document.addEventListener('keydown', (event) => { void onKeyDown(event); }, true);
    globalThis.chrome?.storage?.onChanged?.addListener(onStorageChanged);
    startObserver();
    view.render();
    scheduleReconcile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else void bootstrap();
})();
