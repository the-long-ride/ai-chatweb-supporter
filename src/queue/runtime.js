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
  if (typeof window === 'undefined' || typeof document === 'undefined' || !controllerApi) return;
  const { DispatchGate, ActiveQueueState, QueueScopeCoordinator, requestTabId, handleQueueShortcut, restoreQueuedAttachments, updatePausedState } = controllerApi;
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
  let reconcileFrame = 0;
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
  });

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

  function waitForSendAcceptance(composer, queuedText, provider, timeoutMs = 5000) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const currentComposer = provider.findComposer(document, window) || composer;
        const busy = Boolean(provider.findStopButton(currentComposer, document, window));
        gate.observeBusy(busy);
        const attemptState = dom.classifySendAttempt({ busy, composerText:provider.getComposerText(currentComposer), queuedText, sendReady:dom.isButtonReady(provider.findSendButton(currentComposer, document, window), window) });
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
      if (nextItems.length !== oldState.items.length) await storage.set({ [dispatchStorageKey]:{ paused:oldState.paused, items:nextItems } });
    }
  }

  function clearPreparedMessage(provider, composer, item, restoredFiles) {
    const current = provider.getComposerText(composer).trim();
    if (current === String(item.text || '').trim()) provider.setComposerText(composer, '');
    if (restoredFiles.length) provider.clearAttachments?.(composer, document, window);
  }

  async function dispatchNext() {
    if (!queueEnabled || !state.queue.length || !state.scopeId || gate.dispatching || state.paused) return;
    const provider = currentProvider();
    if (!provider) return;
    const resolvedScope = scope.resolveScope(provider, globalThis.location?.href || '', tabId);
    if (!state.isCurrentScope(resolvedScope)) return;
    const item = state.queue[0];
    const metadata = core.normalizeAttachments(item.attachments);
    const dispatchScope = state.scopeId;
    const dispatchStorageKey = state.storageKey;
    const dispatchProviderId = provider.id;
    const composer = provider.findComposer(document, window);
    if (!composer || !dom.canPrepareQueuedSend({ busy:Boolean(provider.findStopButton(composer, document, window)), composerText:provider.getComposerText(composer), hasAttachments:provider.hasAttachments(composer) })) return;

    gate.beginDispatch();
    let sent = false;
    let restoredFiles = [];
    try {
      if (metadata.length) {
        replayingAttachments = true;
        try { restoredFiles = await restoreQueuedAttachments({ item, provider, composer, attachmentApi:attachmentApiDefault, doc:document, win:window }); }
        finally { replayingAttachments = false; }
        if (!await waitForAttachmentEvidence(composer, provider)) { clearPreparedMessage(provider, composer, item, restoredFiles); return; }
      }
      provider.setComposerText(composer, item.text);
      const sendButton = await waitForSendReady(composer, provider, metadata.length ? ATTACHMENT_SEND_READY_TIMEOUT_MS : 1600);
      if (!sendButton || provider.getComposerText(composer).trim() !== item.text) { clearPreparedMessage(provider, composer, item, restoredFiles); return; }
      const latestProvider = currentProvider();
      if (!queueEnabled || !latestProvider || latestProvider.id !== dispatchProviderId || !state.isCurrentScope(dispatchScope) || state.paused) { clearPreparedMessage(provider, composer, item, restoredFiles); return; }
      sendButton.click();
      sent = await waitForSendAcceptance(composer, item.text, provider);
      if (!sent) { clearPreparedMessage(provider, composer, item, restoredFiles); return; }
      await ensureActiveScope();
      await removeAcceptedItem(item.id, dispatchStorageKey);
      if (metadata.length) {
        try { await attachmentApiDefault.deleteAttachments(metadata); } catch { /* sent item must not be re-queued because cleanup failed */ }
      }
    } catch {
      clearPreparedMessage(provider, composer, item, restoredFiles);
    } finally {
      replayingAttachments = false;
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
    attachmentCapture.reconcile(provider, composer);
    const busy = Boolean(provider.findStopButton(composer, document, window));
    gate.observeBusy(busy);
    const safeToPrepare = dom.canPrepareQueuedSend({ busy, composerText:provider.getComposerText(composer), hasAttachments:provider.hasAttachments(composer) });
    if (gate.shouldDispatch({ enabled:queueEnabled, paused:state.paused, busy, sendReady:safeToPrepare, queueLength:state.queue.length })) void dispatchNext();
  }

  function scheduleReconcile() {
    if (reconcileFrame) return;
    reconcileFrame = window.requestAnimationFrame(() => { void reconcile(); });
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
    initialized = true;
    document.addEventListener('keydown', (event) => { void onKeyDown(event); }, true);
    document.addEventListener('paste', onAttachmentEvent, true);
    document.addEventListener('drop', onAttachmentEvent, true);
    document.addEventListener('change', onAttachmentEvent, true);
    globalThis.chrome?.storage?.onChanged?.addListener(onStorageChanged);
    startObserver();
    view.render();
    scheduleReconcile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once:true });
  else void bootstrap();
})();
