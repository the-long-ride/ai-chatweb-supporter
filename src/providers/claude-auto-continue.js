(() => {
  'use strict';

  const WARNING_SELECTOR = '[data-testid="message-warning"]';
  const LIMIT_TEXT = 'Claude reached its tool-use limit for this turn.';

  function normalizedText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isButtonReady(button, win = globalThis.window) {
    if (!button || button.disabled || button.isConnected === false || !button.getBoundingClientRect) return false;
    if (button.getAttribute?.('aria-disabled') === 'true') return false;
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = win?.getComputedStyle ? win.getComputedStyle(button) : null;
    return !style || (style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none');
  }

  function findContinueButton(doc = globalThis.document, win = globalThis.window) {
    if (!doc?.querySelectorAll) return null;
    for (const warning of doc.querySelectorAll(WARNING_SELECTOR)) {
      if (!normalizedText(warning?.textContent).includes(LIMIT_TEXT)) continue;
      for (const button of warning.querySelectorAll?.('button') || []) {
        if (normalizedText(button?.textContent) === 'Continue' && isButtonReady(button, win)) return button;
      }
    }
    return null;
  }

  function createController(options = {}) {
    const doc = options.doc || globalThis.document;
    const win = options.win || globalThis.window;
    const storage = options.storage || null;
    const storageEvents = options.storageEvents || null;
    const storageKey = options.storageKey || 'claudeAutoContinue';
    const MutationObserverCtor = options.MutationObserverCtor || globalThis.MutationObserver;
    const clickedButtons = new WeakSet();
    let enabled = typeof options.enabled === 'boolean' ? options.enabled : true;
    let observer = null;
    let started = false;

    function scan() {
      if (!enabled) return false;
      const button = findContinueButton(doc, win);
      if (!button || clickedButtons.has(button)) return false;
      clickedButtons.add(button);
      try {
        button.click();
        return true;
      } catch {
        clickedButtons.delete(button);
        return false;
      }
    }

    function setEnabled(value) {
      enabled = value !== false;
    }

    function isEnabled() {
      return enabled;
    }

    function onStorageChanged(changes, areaName) {
      if (areaName !== 'local' || !changes?.[storageKey]) return;
      setEnabled(changes[storageKey].newValue);
      if (enabled) scan();
    }

    async function start() {
      if (started) return;
      started = true;
      if (storage?.get) {
        const result = await storage.get([storageKey]);
        setEnabled(result?.[storageKey]);
      }
      if (MutationObserverCtor && doc?.documentElement) {
        observer = new MutationObserverCtor(() => { scan(); });
        observer.observe(doc.documentElement, { childList: true, subtree: true });
      }
      storageEvents?.addListener?.(onStorageChanged);
      scan();
    }

    function stop() {
      observer?.disconnect?.();
      observer = null;
      storageEvents?.removeListener?.(onStorageChanged);
      started = false;
    }

    return { scan, start, stop, setEnabled, isEnabled };
  }

  const api = { WARNING_SELECTOR, LIMIT_TEXT, findContinueButton, createController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof globalThis !== 'undefined') {
    const namespace = globalThis.AiChatWebSupporter ||= {};
    namespace.claudeAutoContinue = api;
    if (globalThis.document && globalThis.location?.hostname === 'claude.ai') {
      const storageKey = namespace.constants?.STORAGE_KEYS?.claudeAutoContinue || 'claudeAutoContinue';
      const controller = createController({
        storage: namespace.storage,
        storageEvents: globalThis.chrome?.storage?.onChanged,
        storageKey,
      });
      namespace.claudeAutoContinueController = controller;
      void controller.start();
    }
  }
})();
