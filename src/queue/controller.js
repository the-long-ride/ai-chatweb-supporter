(() => {
  'use strict';

  const namespace = globalThis.AiChatWebSupporter || {};
  const constants = typeof module !== 'undefined' && module.exports ? require('../shared/constants.js') : namespace.constants;
  const storage = typeof module !== 'undefined' && module.exports ? require('../shared/storage.js') : namespace.storage;
  const core = typeof module !== 'undefined' && module.exports ? require('./core.js') : namespace.queueCore;
  const dom = typeof module !== 'undefined' && module.exports ? require('./dom.js') : namespace.queueDom;
  const scope = typeof module !== 'undefined' && module.exports ? require('./scope.js') : namespace.queueScope;
  const viewApi = typeof module !== 'undefined' && module.exports ? require('./view.js') : namespace.queueView;

  const { queueShortcut: SHORTCUT_KEY } = constants.STORAGE_KEYS;
  const RECONCILE_INTERVAL_MS = 800;

  class DispatchGate {
    constructor() {
      this.dispatching = false;
      this.awaitingBusy = false;
    }
    observeBusy(busy) { if (busy && this.awaitingBusy) this.awaitingBusy = false; }
    shouldDispatch({ busy, sendReady, queueLength }) {
      return core.canDispatch({ busy, sendReady, queueLength, dispatching: this.dispatching, awaitingBusy: this.awaitingBusy });
    }
    beginDispatch() { this.dispatching = true; }
    finishDispatch(sent) { this.dispatching = false; this.awaitingBusy = Boolean(sent); }
    reset() { this.dispatching = false; this.awaitingBusy = false; }
  }

  class ActiveQueueState {
    constructor() {
      this.scopeId = null;
      this.storageKey = null;
      this.queue = [];
    }
    switchTo(scopeId, nextQueue) {
      this.scopeId = scopeId || null;
      this.storageKey = scope.queueStorageKey(this.scopeId);
      this.queue = core.normalizeQueue(nextQueue);
      return this.queue;
    }
    setQueue(nextQueue) {
      this.queue = core.normalizeQueue(nextQueue);
      return this.queue;
    }
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
      } catch {
        resolve(null);
      }
    });
  }

  class QueueScopeCoordinator {
    constructor({ storageApi = storage, state = new ActiveQueueState() } = {}) {
      this.storageApi = storageApi;
      this.state = state;
    }

    async switchTo(nextScope) {
      if (!nextScope || this.state.isCurrentScope(nextScope)) return false;

      const previousScope = this.state.scopeId;
      const previousKey = this.state.storageKey;
      const previousQueue = this.state.queue.slice();
      const nextKey = scope.queueStorageKey(nextScope);
      if (!nextKey) return false;

      const stored = await this.storageApi.get([nextKey, scope.LEGACY_QUEUE_KEY]);
      const nextQueue = core.normalizeQueue(stored[nextKey]);
      const transition = scope.planScopeTransition({ previousScope, nextScope, previousQueue, nextQueue });

      let resolvedQueue = transition.queue;
      let persistNext = transition.transfer;
      const removePrevious = transition.removePrevious;
      let removeLegacy = false;

      if (!transition.transfer) {
        const migration = scope.planLegacyMigration({ scopedQueue: nextQueue, legacyQueue: stored[scope.LEGACY_QUEUE_KEY] });
        resolvedQueue = migration.queue;
        persistNext = migration.migrate;
        removeLegacy = migration.removeLegacy;
      }

      if (persistNext) await this.storageApi.set({ [nextKey]: resolvedQueue });
      if (removePrevious && previousKey) await this.storageApi.remove(previousKey);
      if (removeLegacy) await this.storageApi.remove(scope.LEGACY_QUEUE_KEY);

      this.state.switchTo(nextScope, resolvedQueue);
      return true;
    }
  }

  const api = { DispatchGate, ActiveQueueState, QueueScopeCoordinator, requestTabId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const shared = globalThis.AiChatWebSupporter ||= {};
    shared.queueController = api;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const gate = new DispatchGate();
  const state = new ActiveQueueState();
  const coordinator = new QueueScopeCoordinator({ storageApi: storage, state });
  let shortcut = core.DEFAULT_SHORTCUT;
  let tabId = null;
  let initialized = false;
  let mutationObserver = null;
  let reconcileFrame = 0;
  let scopeSwitchPromise = null;

  function persistQueue() {
    if (!state.storageKey) return Promise.resolve();
    return storage.set({ [state.storageKey]: state.queue });
  }

  function setQueue(next) {
    state.setQueue(next);
  }

  const view = new viewApi.QueueView({ getQueue: () => state.queue, setQueue, persistQueue, scheduleReconcile });

  function eventBelongsToComposer(event, composer) {
    const target = event.target;
    return Boolean(target && (target === composer || composer.contains?.(target)));
  }

  async function ensureActiveScope() {
    if (scopeSwitchPromise) await scopeSwitchPromise;

    const nextScope = scope.resolveScope(globalThis.location?.href || '', tabId);
    if (!nextScope) return false;
    if (state.isCurrentScope(nextScope)) return true;

    const previousScope = state.scopeId;
    const continuation = scope.isScopeContinuation(previousScope, nextScope);
    scopeSwitchPromise = coordinator.switchTo(nextScope);
    let changed = false;
    try {
      changed = await scopeSwitchPromise;
    } finally {
      scopeSwitchPromise = null;
    }

    if (changed) {
      if (!continuation) gate.awaitingBusy = false;
      view.render();
    }

    const latestScope = scope.resolveScope(globalThis.location?.href || '', tabId);
    if (latestScope && !state.isCurrentScope(latestScope)) return ensureActiveScope();
    return Boolean(state.scopeId);
  }

  function onKeyDown(event) {
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    if (!state.scopeId || !core.matchesQueueShortcut(event, shortcut)) return;
    const composer = dom.findComposer();
    if (!composer || !eventBelongsToComposer(event, composer)) return;
    const item = core.createQueueItem(dom.getComposerText(composer));
    if (!item) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    state.setQueue([...state.queue, item]);
    dom.setComposerText(composer, '');
    void persistQueue();
    view.render(composer);
    scheduleReconcile();
  }

  function waitForSendReady(composer, timeoutMs = 1600) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const button = dom.findSendButton(composer);
        if (dom.isButtonReady(button, window)) return resolve(button);
        if (Date.now() - started >= timeoutMs) return resolve(null);
        window.setTimeout(check, 40);
      };
      check();
    });
  }

  function waitForSendAcceptance(composer, queuedText, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const currentComposer = dom.findComposer() || composer;
        const attemptState = dom.classifySendAttempt({
          busy: Boolean(dom.findStopButton(currentComposer)),
          composerText: dom.getComposerText(currentComposer),
          queuedText,
          sendReady: dom.isButtonReady(dom.findSendButton(currentComposer), window),
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
      const oldQueue = core.normalizeQueue(stored[dispatchStorageKey]);
      const nextOldQueue = oldQueue.filter((entry) => entry.id !== itemId);
      if (nextOldQueue.length !== oldQueue.length) await storage.set({ [dispatchStorageKey]: nextOldQueue });
    }
  }

  async function dispatchNext() {
    if (!state.queue.length || !state.scopeId || gate.dispatching) return;
    const item = state.queue[0];
    const dispatchScope = state.scopeId;
    const dispatchStorageKey = state.storageKey;
    const composer = dom.findComposer();
    if (!composer || !dom.canPrepareQueuedSend({
      busy: Boolean(dom.findStopButton(composer)),
      composerText: dom.getComposerText(composer),
      hasAttachments: dom.hasComposerAttachments(composer),
    })) return;

    gate.beginDispatch();
    let sent = false;
    try {
      dom.setComposerText(composer, item.text);
      const sendButton = await waitForSendReady(composer);
      if (!sendButton || dom.getComposerText(composer).trim() !== item.text) {
        if (dom.getComposerText(composer).trim() === item.text) dom.setComposerText(composer, '');
        return;
      }

      if (!state.isCurrentScope(dispatchScope)) {
        if (dom.getComposerText(composer).trim() === item.text) dom.setComposerText(composer, '');
        return;
      }

      sendButton.click();
      sent = await waitForSendAcceptance(composer, item.text);
      if (!sent) {
        if (dom.getComposerText(composer).trim() === item.text) dom.setComposerText(composer, '');
        return;
      }

      await ensureActiveScope();
      await removeAcceptedItem(item.id, dispatchStorageKey);
    } finally {
      const sameResponseScope = state.isCurrentScope(dispatchScope) || scope.isScopeContinuation(dispatchScope, state.scopeId);
      gate.finishDispatch(sent && sameResponseScope);
      scheduleReconcile();
    }
  }

  async function reconcile() {
    reconcileFrame = 0;
    if (!initialized) return;
    if (!await ensureActiveScope()) return;

    const composer = dom.findComposer();
    if (!composer) return;
    view.ensureRoot(composer);

    const busy = Boolean(dom.findStopButton(composer));
    gate.observeBusy(busy);
    const safeToPrepare = dom.canPrepareQueuedSend({ busy, composerText: dom.getComposerText(composer), hasAttachments: dom.hasComposerAttachments(composer) });
    if (gate.shouldDispatch({ busy, sendReady: safeToPrepare, queueLength: state.queue.length })) void dispatchNext();
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

    const activeKey = state.storageKey;
    if (activeKey && changes[activeKey] && state.isActiveStorageKey(activeKey)) {
      state.setQueue(changes[activeKey].newValue);
      view.render();
      scheduleReconcile();
    }
  }

  async function bootstrap() {
    tabId = await requestTabId();
    const stored = await storage.get([SHORTCUT_KEY]);
    shortcut = core.normalizeShortcut(stored[SHORTCUT_KEY]);
    await ensureActiveScope();

    initialized = true;
    document.addEventListener('keydown', onKeyDown, true);
    globalThis.chrome?.storage?.onChanged?.addListener(onStorageChanged);
    startObserver();
    view.render();
    scheduleReconcile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else void bootstrap();
})();
