(() => {
  'use strict';

  const core = typeof module !== 'undefined' && module.exports
    ? require('./queue-core.js')
    : globalThis.CgptQueueCore;
  const dom = typeof module !== 'undefined' && module.exports
    ? require('./queue-dom.js')
    : globalThis.CgptQueueDom;
  const viewApi = typeof module !== 'undefined' && module.exports
    ? require('./queue-view.js')
    : globalThis.CgptQueueView;

  const QUEUE_KEY = 'cgptMessageQueue';
  const SHORTCUT_KEY = 'cgptQueueShortcut';
  const RECONCILE_INTERVAL_MS = 800;

  class DispatchGate {
    constructor() {
      this.dispatching = false;
      this.awaitingBusy = false;
    }

    observeBusy(busy) {
      if (busy && this.awaitingBusy) this.awaitingBusy = false;
    }

    shouldDispatch({ busy, sendReady, queueLength }) {
      return core.canDispatch({
        busy,
        sendReady,
        queueLength,
        dispatching: this.dispatching,
        awaitingBusy: this.awaitingBusy,
      });
    }

    beginDispatch() {
      this.dispatching = true;
    }

    finishDispatch(sent) {
      this.dispatching = false;
      this.awaitingBusy = Boolean(sent);
    }
  }

  const api = { DispatchGate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.CgptQueueContent = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const gate = new DispatchGate();
  let queue = [];
  let shortcut = core.DEFAULT_SHORTCUT;
  let initialized = false;
  let mutationObserver = null;
  let reconcileFrame = 0;

  function storageArea() {
    return globalThis.chrome?.storage?.local || null;
  }

  function storageGet(keys) {
    const storage = storageArea();
    if (!storage) return Promise.resolve({});
    return new Promise((resolve) => {
      storage.get(keys, (result) => {
        void globalThis.chrome?.runtime?.lastError;
        resolve(result || {});
      });
    });
  }

  function storageSet(values) {
    const storage = storageArea();
    if (!storage) return Promise.resolve();
    return new Promise((resolve) => {
      storage.set(values, () => {
        void globalThis.chrome?.runtime?.lastError;
        resolve();
      });
    });
  }

  function persistQueue() {
    return storageSet({ [QUEUE_KEY]: queue });
  }

  function setQueue(next) {
    queue = core.normalizeQueue(next);
  }

  const view = new viewApi.QueueView({
    getQueue: () => queue,
    setQueue,
    persistQueue,
    scheduleReconcile,
  });

  function eventBelongsToComposer(event, composer) {
    const target = event.target;
    return Boolean(target && (target === composer || composer.contains?.(target)));
  }

  function onKeyDown(event) {
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    if (!core.matchesQueueShortcut(event, shortcut)) return;
    const composer = dom.findComposer();
    if (!composer || !eventBelongsToComposer(event, composer)) return;
    const item = core.createQueueItem(dom.getComposerText(composer));
    if (!item) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    queue = [...queue, item];
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
        const state = dom.classifySendAttempt({
          busy: Boolean(dom.findStopButton(currentComposer)),
          composerText: dom.getComposerText(currentComposer),
          queuedText,
          sendReady: dom.isButtonReady(dom.findSendButton(currentComposer), window),
        });
        if (state !== 'pending') return resolve(state === 'accepted');
        if (Date.now() - started >= timeoutMs) return resolve(false);
        window.setTimeout(check, 40);
      };
      check();
    });
  }

  async function dispatchNext() {
    if (!queue.length) return;
    const item = queue[0];
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

      sendButton.click();
      sent = await waitForSendAcceptance(composer, item.text);
      if (!sent) {
        if (dom.getComposerText(composer).trim() === item.text) dom.setComposerText(composer, '');
        return;
      }

      queue = queue.filter((entry) => entry.id !== item.id);
      await persistQueue();
      view.render();
    } finally {
      gate.finishDispatch(sent);
      scheduleReconcile();
    }
  }

  function reconcile() {
    reconcileFrame = 0;
    if (!initialized) return;
    const composer = dom.findComposer();
    if (!composer) return;
    view.ensureRoot(composer);

    const busy = Boolean(dom.findStopButton(composer));
    gate.observeBusy(busy);
    const safeToPrepare = dom.canPrepareQueuedSend({
      busy,
      composerText: dom.getComposerText(composer),
      hasAttachments: dom.hasComposerAttachments(composer),
    });
    if (gate.shouldDispatch({ busy, sendReady: safeToPrepare, queueLength: queue.length })) {
      void dispatchNext();
    }
  }

  function scheduleReconcile() {
    if (reconcileFrame) return;
    reconcileFrame = window.requestAnimationFrame(reconcile);
  }

  function startObserver() {
    if (!document.body || mutationObserver) return;
    mutationObserver = new MutationObserver(scheduleReconcile);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.setInterval(scheduleReconcile, RECONCILE_INTERVAL_MS);
  }

  function onStorageChanged(changes, areaName) {
    if (areaName !== 'local') return;
    if (changes[QUEUE_KEY]) {
      setQueue(changes[QUEUE_KEY].newValue);
      view.render();
      scheduleReconcile();
    }
    if (changes[SHORTCUT_KEY]) {
      shortcut = core.normalizeShortcut(changes[SHORTCUT_KEY].newValue);
    }
  }

  async function bootstrap() {
    const stored = await storageGet([QUEUE_KEY, SHORTCUT_KEY]);
    setQueue(stored[QUEUE_KEY]);
    shortcut = core.normalizeShortcut(stored[SHORTCUT_KEY]);
    initialized = true;
    document.addEventListener('keydown', onKeyDown, true);
    globalThis.chrome?.storage?.onChanged?.addListener(onStorageChanged);
    startObserver();
    view.render();
    scheduleReconcile();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    void bootstrap();
  }
})();
