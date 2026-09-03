(() => {
  'use strict';
  const namespace = globalThis.AiChatWebSupporter || {};
  const constants = namespace.constants;
  const storage = namespace.storage;
  const core = namespace.queueCore;
  const dom = namespace.queueDom;
  const attachmentApiDefault = namespace.queueAttachments;
  const registry = namespace.providerRegistry;
  const scope = namespace.queueScope;
  const viewApi = namespace.queueView;
  const controllerApi = namespace.queueController;
  const schedulerApi = namespace.queueScheduler;
  if (typeof window === 'undefined' || typeof document === 'undefined' || !controllerApi || !schedulerApi) return;
  const {
    DispatchGate,
    ActiveQueueState,
    QueueScopeCoordinator,
    requestTabId,
    handleQueueShortcut,
    restoreQueuedAttachments,
    updatePausedState,
    isQueueSupportedHostname,
    stageQueuedItemForDispatch,
    restoreQueuedItemAfterFailedSend,
    clearQueuedItems,
  } = controllerApi;
  if (!isQueueSupportedHostname(globalThis.location?.hostname || '')) return;

  const { queueShortcut: SHORTCUT_KEY, queueEnabled: QUEUE_ENABLED_KEY } = constants.STORAGE_KEYS;
  const RECONCILE_INTERVAL_MS = 800;
  const ATTACHMENT_SEND_READY_TIMEOUT_MS = 30000;

  const gate = new DispatchGate();
  const state = new ActiveQueueState();
  const coordinator = new QueueScopeCoordinator({ storageApi:storage, state });
  const attachmentCapture = new attachmentApiDefault.AttachmentCapture();
  let shortcut = core.DEFAULT_SHORTCUT;
  let queueEnabled = true;
  let tabId = null;
  let activeProvider = null;
  let initialized = false;
  let mutationObserver = null;
  let scopeSwitchPromise = null;
  let replayingAttachments = false;

  function currentProvider() { return registry.getProvider(globalThis.location?.href || ''); }
  function persistQueue() { return state.storageKey ? storage.set({ [state.storageKey]:state.storageValue() }) : Promise.resolve(); }
  function setQueue(next) { state.setQueue(next); }
  async function setPaused(next) { await updatePausedState({ state, paused:next, persist:persistQueue }); view.render(); scheduleReconcile(); }

  const view = new viewApi.QueueView({
    getQueue: () => state.queue,
    setQueue,
    getPaused: () => state.paused,
    setPaused,
    persistQueue,
    scheduleReconcile,
    getProvider: () => activeProvider || currentProvider(),
    deleteAttachments: (metadata) => attachmentApiDefault.deleteAttachments(metadata),
    steerItem: (itemId) => dispatchQueuedItem(itemId, { steer: true }),
    clearAllItems: async () => {
      const result = await clearQueuedItems({
        state,
        persist:persistQueue,
        deleteAttachments:(metadata) => attachmentApiDefault.deleteAttachments(metadata),
      });
      return result.cleared;
    },
  });

  const reconcileScheduler = schedulerApi.createReconcileScheduler({
    doc:document,
    win:window,
    reconcile:() => reconcile(),
  });

  function scheduleReconcile() { reconcileScheduler.schedule(); }

  function eventBelongsToComposer(event, composer) {
    const target = event.target;
    return Boolean(target && (target === composer || composer.contains?.(target)));
  }

  function eventBelongsToComposerSurface(event, composer) {
    const target = event.target;
    if (!target) return false;
    if (eventBelongsToComposer(event, composer)) return true;
    const form = composer.closest?.('form');
    if (form?.contains?.(target)) return true;
    return Boolean(composer.parentElement?.contains?.(target));
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

  function registerQueueTab() {
    const runtime = globalThis.chrome?.runtime;
    const provider = activeProvider || currentProvider();
    if (!runtime?.sendMessage || !provider) return;
    try {
      runtime.sendMessage({ type:'aichat:queue-register', provider:provider.id }, () => { void runtime.lastError; });
    } catch { /* registration is best effort */ }
  }

  function onRuntimeMessage(message) {
    if (message?.type !== 'aichat:queue-reconcile') return undefined;
    scheduleReconcile();
    return undefined;
  }

  function onAttachmentEvent(event) {
    if (replayingAttachments || !queueEnabled) return;
    const provider = currentProvider();
    const composer = provider?.findComposer?.(document, window);
    if (!provider || !composer) return;
    if (event.type === 'change') {
      if (!event.target?.matches?.('input[type="file"]')) return;
    } else if (!eventBelongsToComposerSurface(event, composer)) return;
    attachmentCapture.captureEvent(event);
  }

  async function onKeyDown(event) {
    if (event.defaultPrevented || event.isComposing || event.repeat || !queueEnabled) return;
    const provider = currentProvider();
    if (!provider || !state.scopeId || !core.matchesQueueShortcut(event, shortcut)) return;
    const expectedScope = scope.resolveScope(provider, globalThis.location?.href || '', tabId);
    if (!state.isCurrentScope(expectedScope)) { void ensureActiveScope(); return; }
    const composer = provider.findComposer(document, window);
    if (!composer || !eventBelongsToComposer(event, composer)) return;
    const attachmentFiles = attachmentCapture.currentFiles(provider, composer, document, window);
    const result = await handleQueueShortcut({ provider, state, composer, event, persist:persistQueue, enabled:queueEnabled, attachmentFiles, attachmentApi:attachmentApiDefault, doc:document, win:window });
    if (result === 'queued') { attachmentCapture.clear(); view.render(composer); scheduleReconcile(); }
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

  function waitForAttachmentEvidence(composer, provider, timeoutMs = 5000) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const currentComposer = provider.findComposer(document, window) || composer;
        if (provider.hasAttachments(currentComposer)) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(false);
        window.setTimeout(check, 40);
      };
      check();
    });
  }

  function waitForSendAcceptance(composer, queuedText, provider, { timeoutMs = 5000, acceptBusy = true } = {}) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const currentComposer = provider.findComposer(document, window) || composer;
        const busy = Boolean(provider.findStopButton(currentComposer, document, window));
        gate.observeBusy(busy);
        const attemptState = dom.classifySendAttempt({ busy, composerText:provider.getComposerText(currentComposer), queuedText, sendReady:dom.isButtonReady(provider.findSendButton(currentComposer, document, window), window), acceptBusy });
        if (attemptState !== 'pending') return resolve(attemptState === 'accepted');
        if (Date.now() - started >= timeoutMs) return resolve(false);
        window.setTimeout(check, 40);
      };
      check();
    });
  }

  function clearPreparedMessage(provider, composer, item, restoredFiles) {
    const current = provider.getComposerText(composer).trim();
    if (current === String(item.text || '').trim()) provider.setComposerText(composer, '');
    if (restoredFiles.length) provider.clearAttachments?.(composer, document, window);
  }

  async function persistDispatchQueue(storageKey, paused) {
    if (!storageKey) return;
    await storage.set({ [storageKey]: { paused:Boolean(paused), items:state.queue.slice() } });
  }

  async function dispatchQueuedItem(itemId, { steer = false } = {}) {
    if (!queueEnabled || !state.scopeId || gate.dispatching || (!steer && state.paused)) return false;
    const item = state.queue.find((entry) => entry.id === itemId);
    if (!item) return false;
    const provider = currentProvider();
    if (!provider) return false;
    const resolvedScope = scope.resolveScope(provider, globalThis.location?.href || '', tabId);
    if (!state.isCurrentScope(resolvedScope)) return false;

    const metadata = core.normalizeAttachments(item.attachments);
    const dispatchScope = state.scopeId;
    const dispatchStorageKey = state.storageKey;
    const dispatchPaused = state.paused;
    const dispatchProviderId = provider.id;
    const composer = provider.findComposer(document, window);
    if (!composer) return false;
    const busyBefore = Boolean(provider.findStopButton(composer, document, window));
    if (!dom.canPrepareQueuedSend({ busy:busyBefore, composerText:provider.getComposerText(composer), hasAttachments:provider.hasAttachments(composer), allowBusy:steer })) return false;

    gate.beginDispatch();
    let sent = false;
    let restoredFiles = [];
    let dispatchRecord = null;
    try {
      if (metadata.length) {
        replayingAttachments = true;
        try { restoredFiles = await restoreQueuedAttachments({ item, provider, composer, attachmentApi:attachmentApiDefault, doc:document, win:window }); }
        finally { replayingAttachments = false; }
        if (!await waitForAttachmentEvidence(composer, provider)) { clearPreparedMessage(provider, composer, item, restoredFiles); return false; }
      }

      provider.setComposerText(composer, item.text);
      const sendButton = await waitForSendReady(composer, provider, metadata.length ? ATTACHMENT_SEND_READY_TIMEOUT_MS : 1600);
      if (!sendButton || provider.getComposerText(composer).trim() !== item.text) { clearPreparedMessage(provider, composer, item, restoredFiles); return false; }
      const latestProvider = currentProvider();
      if (!queueEnabled || !latestProvider || latestProvider.id !== dispatchProviderId || !state.isCurrentScope(dispatchScope) || (!steer && state.paused)) { clearPreparedMessage(provider, composer, item, restoredFiles); return false; }

      dispatchRecord = await stageQueuedItemForDispatch({
        state,
        itemId:item.id,
        persist:() => persistDispatchQueue(dispatchStorageKey, dispatchPaused),
      });
      if (!dispatchRecord) { clearPreparedMessage(provider, composer, item, restoredFiles); return false; }
      view.render();

      sendButton.click();
      sent = await waitForSendAcceptance(composer, item.text, provider, { acceptBusy: !(steer && busyBefore) });
      if (!sent) {
        clearPreparedMessage(provider, composer, item, restoredFiles);
        await restoreQueuedItemAfterFailedSend({
          state,
          record:dispatchRecord,
          persist:() => persistDispatchQueue(dispatchStorageKey, dispatchPaused),
        });
        dispatchRecord = null;
        view.render();
        return false;
      }

      if (metadata.length) {
        try { await attachmentApiDefault.deleteAttachments(metadata); } catch { /* sent item stays removed even if attachment cleanup fails */ }
      }
      await ensureActiveScope();
      return true;
    } catch {
      clearPreparedMessage(provider, composer, item, restoredFiles);
      if (dispatchRecord && !sent) {
        try {
          await restoreQueuedItemAfterFailedSend({
            state,
            record:dispatchRecord,
            persist:() => persistDispatchQueue(dispatchStorageKey, dispatchPaused),
          });
          view.render();
        } catch { /* best effort: pre-send storage removal already prevents duplicate replay */ }
      }
      return false;
    } finally {
      replayingAttachments = false;
      const latestProvider = currentProvider();
      const sameProvider = latestProvider?.id === dispatchProviderId;
      const sameResponseScope = state.isCurrentScope(dispatchScope) || scope.isScopeContinuation(dispatchScope, state.scopeId);
      gate.finishDispatch(sent && sameProvider && sameResponseScope);
      scheduleReconcile();
    }
  }

  async function dispatchNext() {
    if (!state.queue.length) return false;
    return dispatchQueuedItem(state.queue[0].id);
  }

  async function reconcile() {
    if (!initialized || !await ensureActiveScope()) return;
    const provider = activeProvider || currentProvider();
    if (!provider) return;
    const composer = provider.findComposer(document, window);
    if (!composer) return;
    provider.maybeFillStreamErrorContinuation?.(composer, document, window);
    view.ensureRoot(composer, provider);
    attachmentCapture.reconcile(provider, composer);
    const busy = Boolean(provider.findStopButton(composer, document, window));
    gate.observeBusy(busy);
    const safeToPrepare = dom.canPrepareQueuedSend({ busy, composerText:provider.getComposerText(composer), hasAttachments:provider.hasAttachments(composer) });
    if (gate.shouldDispatch({ enabled:queueEnabled, paused:state.paused, busy, sendReady:safeToPrepare, queueLength:state.queue.length })) void dispatchNext();
  }

  function startObserver() {
    if (!document.body || mutationObserver) return;
    mutationObserver = new MutationObserver(scheduleReconcile);
    mutationObserver.observe(document.body, { childList:true, subtree:true });
    window.setInterval(scheduleReconcile, RECONCILE_INTERVAL_MS);
    window.addEventListener('popstate', scheduleReconcile, { passive:true });
  }

  function onStorageChanged(changes, areaName) {
    if (areaName !== 'local') return;
    if (changes[SHORTCUT_KEY]) shortcut = core.normalizeShortcut(changes[SHORTCUT_KEY].newValue);
    if (changes[QUEUE_ENABLED_KEY]) { queueEnabled = changes[QUEUE_ENABLED_KEY].newValue !== false; if (!queueEnabled) gate.reset(); scheduleReconcile(); }
    const activeKey = state.storageKey;
    if (activeKey && changes[activeKey] && state.isActiveStorageKey(activeKey)) { state.setState(changes[activeKey].newValue); view.render(); scheduleReconcile(); }
  }

  async function bootstrap() {
    tabId = await requestTabId();
    const stored = await storage.get([SHORTCUT_KEY, QUEUE_ENABLED_KEY]);
    shortcut = core.normalizeShortcut(stored[SHORTCUT_KEY]);
    queueEnabled = stored[QUEUE_ENABLED_KEY] !== false;
    await ensureActiveScope();
    registerQueueTab();
    initialized = true;
    document.addEventListener('keydown', (event) => { void onKeyDown(event); }, true);
    document.addEventListener('paste', onAttachmentEvent, true);
    document.addEventListener('drop', onAttachmentEvent, true);
    document.addEventListener('change', onAttachmentEvent, true);
    document.addEventListener('visibilitychange', scheduleReconcile, { passive:true });
    globalThis.chrome?.runtime?.onMessage?.addListener(onRuntimeMessage);
    globalThis.chrome?.storage?.onChanged?.addListener(onStorageChanged);
    startObserver();
    view.render();
    scheduleReconcile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once:true });
  else void bootstrap();
})();
