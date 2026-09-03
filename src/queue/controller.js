(() => {
  'use strict';

  const namespace = globalThis.AiChatWebSupporter || {};
  const constants = typeof module !== 'undefined' && module.exports ? require('../shared/constants.js') : namespace.constants;
  const storage = typeof module !== 'undefined' && module.exports ? require('../shared/storage.js') : namespace.storage;
  const core = typeof module !== 'undefined' && module.exports ? require('./core.js') : namespace.queueCore;
  const dom = typeof module !== 'undefined' && module.exports ? require('./dom.js') : namespace.queueDom;
  const attachmentApiDefault = typeof module !== 'undefined' && module.exports ? require('./attachments.js') : namespace.queueAttachments;
  const registry = typeof module !== 'undefined' && module.exports ? require('../providers/registry.js') : namespace.providerRegistry;
  const scope = typeof module !== 'undefined' && module.exports ? require('./scope.js') : namespace.queueScope;
  const viewApi = typeof module !== 'undefined' && module.exports ? require('./view.js') : namespace.queueView;

  const { queueShortcut: SHORTCUT_KEY, queueEnabled: QUEUE_ENABLED_KEY } = constants.STORAGE_KEYS;
  const RECONCILE_INTERVAL_MS = 800;
  const ATTACHMENT_SEND_READY_TIMEOUT_MS = 30000;

  function canAutoDispatch({ enabled = true, paused, busy, sendReady, queueLength, dispatching, awaitingBusy }) {
    return enabled !== false && !paused && core.canDispatch({ busy, sendReady, queueLength, dispatching, awaitingBusy });
  }

  function isQueueSupportedHostname(hostname = '') {
    const normalized = String(hostname || '').trim().toLowerCase();
    return normalized !== 'grok.com' && !normalized.endsWith('.grok.com');
  }

  async function stageQueuedItemForDispatch({ state, itemId, persist }) {
    const queue = state?.queue?.slice?.() || [];
    const index = queue.findIndex((entry) => entry.id === itemId);
    if (index < 0) return null;
    const [item] = queue.splice(index, 1);
    state.setQueue(queue);
    try {
      await persist?.();
    } catch (error) {
      const restored = state.queue.slice();
      if (!restored.some((entry) => entry.id === item.id)) restored.splice(Math.max(0, Math.min(index, restored.length)), 0, item);
      state.setQueue(restored);
      throw error;
    }
    return { item, index };
  }

  async function restoreQueuedItemAfterFailedSend({ state, record, persist }) {
    if (!record?.item) return false;
    if (state.queue.some((entry) => entry.id === record.item.id)) return false;
    const next = state.queue.slice();
    next.splice(Math.max(0, Math.min(record.index, next.length)), 0, record.item);
    state.setQueue(next);
    await persist?.();
    return true;
  }

  async function captureQueuedMessage({ state, text, attachments = [], persist, clearComposer, now = Date.now, idFactory }) {
    const item = core.createQueueItem({ text, attachments }, now, idFactory);
    if (!item) return null;
    const previous = state.queue.slice();
    state.setQueue([...previous, item]);
    try {
      await persist();
    } catch (error) {
      state.setQueue(previous);
      throw error;
    }
    await clearComposer?.();
    return item;
  }

  async function handleQueueShortcut({
    provider,
    state,
    composer,
    event,
    persist,
    enabled = true,
    now = Date.now,
    idFactory,
    attachmentFiles = [],
    attachmentApi = attachmentApiDefault,
    doc = globalThis.document,
    win = globalThis.window,
  }) {
    if (enabled === false) return 'ignored';
    const text = provider?.getComposerText?.(composer) || '';
    const files = Array.from(attachmentFiles || []).filter(Boolean);
    if (!String(text).trim() && !files.length) return 'ignored';

    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    let staged = [];
    try {
      if (files.length) staged = await attachmentApi.storeFiles(files);
      await captureQueuedMessage({
        state,
        text,
        attachments: staged,
        persist,
        clearComposer: async () => {
          provider.setComposerText?.(composer, '');
          if (files.length) provider.clearAttachments?.(composer, doc, win);
        },
        now,
        idFactory,
      });
      return 'queued';
    } catch {
      if (staged.length) {
        try { await attachmentApi.deleteAttachments(staged); } catch { /* best-effort rollback */ }
      }
      return 'failed';
    }
  }

  async function restoreQueuedAttachments({ item, provider, composer, attachmentApi = attachmentApiDefault, doc = globalThis.document, win = globalThis.window }) {
    const metadata = core.normalizeAttachments(item?.attachments);
    if (!metadata.length) return [];
    const files = await attachmentApi.loadFiles(metadata);
    if (!files.length || provider?.attachFiles?.(composer, files, doc, win) !== true) throw new Error('Unable to restore queued attachments');
    return files;
  }

  async function updatePausedState({ state, paused, persist }) {
    const previous = state.paused;
    state.setPaused(paused);
    try { await persist(); } catch (error) { state.setPaused(previous); throw error; }
    return state.paused;
  }

  class DispatchGate {
    constructor() { this.dispatching = false; this.awaitingBusy = false; this.responseObserved = false; }
    observeBusy(busy) {
      if (!busy) return;
      if (this.dispatching) this.responseObserved = true;
      if (this.awaitingBusy) this.awaitingBusy = false;
    }
    shouldDispatch({ enabled = true, paused = false, busy, sendReady, queueLength }) {
      return canAutoDispatch({ enabled, paused, busy, sendReady, queueLength, dispatching: this.dispatching, awaitingBusy: this.awaitingBusy });
    }
    beginDispatch() { this.dispatching = true; this.responseObserved = false; }
    finishDispatch(sent) {
      const responseObserved = this.responseObserved;
      this.dispatching = false;
      this.responseObserved = false;
      this.awaitingBusy = Boolean(sent) && !responseObserved;
    }
    reset() { this.dispatching = false; this.awaitingBusy = false; this.responseObserved = false; }
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
        runtime.sendMessage({ type:'aichat:get-tab-id' }, (response) => {
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
          const migration = scope.planLegacyMigration({ scopedState:nextState, legacyQueue:stored[oldScopedKey] });
          if (migration.migrate) { resolvedState = migration.state; persistNext = true; removeOldScoped = true; }
        }
        if (!persistNext && globalLegacyKey) {
          const migration = scope.planLegacyMigration({ scopedState:nextState, legacyQueue:stored[globalLegacyKey] });
          if (migration.migrate) { resolvedState = migration.state; persistNext = true; removeGlobalLegacy = true; }
        }
      }
      if (persistNext) await this.storageApi.set({ [nextKey]:resolvedState });
      if (transition.removePrevious && previousKey) await this.storageApi.remove(previousKey);
      if (removeOldScoped && oldScopedKey) await this.storageApi.remove(oldScopedKey);
      if (removeGlobalLegacy && globalLegacyKey) await this.storageApi.remove(globalLegacyKey);
      this.state.switchTo(nextScope, resolvedState);
      return true;
    }
  }

  const api = {
    DispatchGate,
    ActiveQueueState,
    QueueScopeCoordinator,
    requestTabId,
    captureQueuedMessage,
    handleQueueShortcut,
    restoreQueuedAttachments,
    updatePausedState,
    canAutoDispatch,
    isQueueSupportedHostname,
    stageQueuedItemForDispatch,
    restoreQueuedItemAfterFailedSend,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).queueController = api;
})();
