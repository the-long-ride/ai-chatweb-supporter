(() => {
  'use strict';

  const CONTINUATION_TEXT = 'continue remaining works';
  const RESPONSE_SELECTORS = Object.freeze({
    chatgpt: [
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"]',
    ],
    claude: [
      '.font-claude-response',
      '.font-claude-response-body',
      '[data-message-author-role="assistant"]',
      '[data-is-streaming]',
    ],
    grok: [
      '[data-testid="assistant-message"] .response-content-markdown',
      '[data-testid="assistant-message"]',
      '.message-bubble.assistant',
      '.response-content-markdown',
    ],
  });

  function normalizedText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  }

  function responseMatches(responseText, configuredText) {
    const haystack = normalizedText(responseText);
    const needle = normalizedText(configuredText);
    return Boolean(needle && haystack.includes(needle));
  }

  function listAssistantMessages(providerId, doc = globalThis.document) {
    const selectors = RESPONSE_SELECTORS[providerId];
    if (!selectors?.length || !doc?.querySelectorAll) return [];
    try {
      return Array.from(doc.querySelectorAll(selectors.join(',')) || []);
    } catch {
      const messages = [];
      const seen = new Set();
      for (const selector of selectors) {
        try {
          for (const message of Array.from(doc.querySelectorAll(selector) || [])) {
            if (seen.has(message)) continue;
            seen.add(message);
            messages.push(message);
          }
        } catch { /* ignore stale selector */ }
      }
      return messages;
    }
  }

  function findLatestAssistantMessage(providerId, doc = globalThis.document) {
    const messages = listAssistantMessages(providerId, doc);
    return messages.length ? messages[messages.length - 1] : null;
  }

  function messageIdentity(providerId, message, doc = globalThis.document) {
    if (!message) return '';
    const owner = message.closest?.('[data-message-id],[data-message-uuid],[data-testid^="conversation-turn-"]') || message;
    for (const attr of ['data-message-id', 'data-message-uuid']) {
      const value = owner.getAttribute?.(attr) || message.getAttribute?.(attr);
      if (value) return `${providerId}:${attr}:${value}`;
    }
    const testId = owner.getAttribute?.('data-testid');
    if (testId && /^conversation-turn-/.test(testId)) return `${providerId}:turn:${testId}`;
    const messages = listAssistantMessages(providerId, doc);
    const index = messages.indexOf(message);
    return `${providerId}:fallback:${index}:${messages.length}:${normalizedText(message.textContent)}`;
  }

  function isButtonReady(button, win = globalThis.window) {
    if (!button || button.disabled || button.isConnected === false || !button.getBoundingClientRect) return false;
    if (button.getAttribute?.('aria-disabled') === 'true') return false;
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = win?.getComputedStyle ? win.getComputedStyle(button) : null;
    return !style || (style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none');
  }

  function createController(options = {}) {
    const provider = options.provider || null;
    const doc = options.doc || globalThis.document;
    const win = options.win || globalThis.window;
    const storage = options.storage || null;
    const storageEvents = options.storageEvents || null;
    const runtime = options.runtime || null;
    const MutationObserverCtor = options.MutationObserverCtor || globalThis.MutationObserver;
    const setIntervalFn = options.setIntervalFn || win?.setInterval?.bind(win) || null;
    const clearIntervalFn = options.clearIntervalFn || win?.clearInterval?.bind(win) || null;
    const storageKeys = {
      textEnabled: options.textEnabledKey || 'autoContinueEnabled',
      matchText: options.matchTextKey || 'autoContinueMatchText',
      chatgptError: options.chatgptErrorKey || 'chatgptErrorAutoContinue',
    };

    const handledMessages = new WeakSet();
    const handledMessageKeys = new Set();
    let textEnabled = options.textEnabled === true;
    let matchText = String(options.matchText || '');
    let chatgptErrorEnabled = typeof options.chatgptErrorEnabled === 'boolean' ? options.chatgptErrorEnabled : (storage ? null : true);
    let pendingMessageKey = null;
    let observer = null;
    let intervalId = null;
    let started = false;
    const originalStreamErrorContinuation = provider?.id === 'chatgpt' && typeof provider.maybeFillStreamErrorContinuation === 'function'
      ? provider.maybeFillStreamErrorContinuation.bind(provider)
      : null;
    if (originalStreamErrorContinuation) {
      provider.maybeFillStreamErrorContinuation = (...args) => chatgptErrorEnabled === true
        ? originalStreamErrorContinuation(...args)
        : false;
    }

    function setTextEnabled(value) { textEnabled = value === true; }
    function setMatchText(value) { matchText = String(value || ''); }
    function setChatgptErrorEnabled(value) { chatgptErrorEnabled = value !== false; }

    function scanTextTrigger() {
      if (!provider || !textEnabled || !normalizedText(matchText)) return false;
      const composer = provider.findComposer?.(doc, win);
      if (!composer || provider.findStopButton?.(composer, doc, win)) return false;
      const message = findLatestAssistantMessage(provider.id, doc);
      if (!message || !responseMatches(message.textContent, matchText)) return false;
      const messageKey = messageIdentity(provider.id, message, doc);
      if (handledMessages.has(message) || handledMessageKeys.has(messageKey)) return false;

      const current = String(provider.getComposerText?.(composer) || '').trim();
      if (pendingMessageKey) {
        if (pendingMessageKey !== messageKey) {
          handledMessageKeys.add(pendingMessageKey);
          pendingMessageKey = null;
          return false;
        }
        if (current !== CONTINUATION_TEXT) {
          handledMessages.add(message);
          handledMessageKeys.add(messageKey);
          pendingMessageKey = null;
          return false;
        }
      } else {
        if (current) return false;
        if (!provider.setComposerText?.(composer, CONTINUATION_TEXT)) return false;
        pendingMessageKey = messageKey;
      }

      const sendButton = provider.findSendButton?.(composer, doc, win);
      if (!isButtonReady(sendButton, win)) return true;
      if (String(provider.getComposerText?.(composer) || '').trim() !== CONTINUATION_TEXT) {
        handledMessages.add(message);
        handledMessageKeys.add(messageKey);
        pendingMessageKey = null;
        return false;
      }
      try {
        sendButton.click();
        handledMessages.add(message);
        handledMessageKeys.add(messageKey);
        pendingMessageKey = null;
        return true;
      } catch {
        return true;
      }
    }

    function scan() {
      if (!provider) return false;
      let acted = false;
      if (provider.id === 'chatgpt' && chatgptErrorEnabled === true && provider.maybeFillStreamErrorContinuation) {
        const composer = provider.findComposer?.(doc, win);
        if (composer) acted = provider.maybeFillStreamErrorContinuation(composer, doc, win) || acted;
      }
      return scanTextTrigger() || acted;
    }

    function onStorageChanged(changes, areaName) {
      if (areaName !== 'local') return;
      let changed = false;
      if (changes?.[storageKeys.textEnabled]) { setTextEnabled(changes[storageKeys.textEnabled].newValue); changed = true; }
      if (changes?.[storageKeys.matchText]) { setMatchText(changes[storageKeys.matchText].newValue); changed = true; }
      if (changes?.[storageKeys.chatgptError]) { setChatgptErrorEnabled(changes[storageKeys.chatgptError].newValue); changed = true; }
      if (changed) scan();
    }

    function onRuntimeMessage(message) {
      if (message?.type === 'aichat:queue-reconcile') scan();
      return undefined;
    }

    function registerBackgroundWake() {
      if (!runtime?.sendMessage || !provider?.id) return;
      try {
        runtime.sendMessage({ type:'aichat:queue-register', provider:provider.id }, () => { void runtime.lastError; });
      } catch { /* best effort */ }
    }

    async function start() {
      if (started) return;
      started = true;
      if (storage?.get) {
        const result = await storage.get([storageKeys.textEnabled, storageKeys.matchText, storageKeys.chatgptError]);
        setTextEnabled(result?.[storageKeys.textEnabled]);
        setMatchText(result?.[storageKeys.matchText]);
        setChatgptErrorEnabled(result?.[storageKeys.chatgptError]);
      }
      if (MutationObserverCtor && doc?.documentElement) {
        observer = new MutationObserverCtor(() => { scan(); });
        observer.observe(doc.documentElement, { childList:true, subtree:true, characterData:true });
      }
      if (typeof setIntervalFn === 'function') intervalId = setIntervalFn(() => { scan(); }, 1200);
      storageEvents?.addListener?.(onStorageChanged);
      runtime?.onMessage?.addListener?.(onRuntimeMessage);
      registerBackgroundWake();
      scan();
    }

    function stop() {
      observer?.disconnect?.();
      observer = null;
      if (intervalId != null && typeof clearIntervalFn === 'function') clearIntervalFn(intervalId);
      intervalId = null;
      storageEvents?.removeListener?.(onStorageChanged);
      runtime?.onMessage?.removeListener?.(onRuntimeMessage);
      started = false;
    }

    return {
      scan,
      start,
      stop,
      setTextEnabled,
      setMatchText,
      setChatgptErrorEnabled,
      isTextEnabled: () => textEnabled,
      getMatchText: () => matchText,
      isChatgptErrorEnabled: () => chatgptErrorEnabled,
    };
  }

  const api = { CONTINUATION_TEXT, RESPONSE_SELECTORS, normalizedText, responseMatches, listAssistantMessages, findLatestAssistantMessage, messageIdentity, isButtonReady, createController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof globalThis !== 'undefined') {
    const namespace = globalThis.AiChatWebSupporter ||= {};
    namespace.autoContinue = api;
    const hostname = globalThis.location?.hostname || '';
    if (globalThis.document && ['chatgpt.com', 'claude.ai', 'grok.com'].includes(hostname)) {
      const provider = namespace.providerRegistry?.getProvider?.(globalThis.location?.href || '');
      if (provider) {
        const keys = namespace.constants?.STORAGE_KEYS || {};
        const controller = createController({
          provider,
          storage: namespace.storage,
          storageEvents: globalThis.chrome?.storage?.onChanged,
          runtime: globalThis.chrome?.runtime,
          textEnabledKey: keys.autoContinueEnabled || 'autoContinueEnabled',
          matchTextKey: keys.autoContinueMatchText || 'autoContinueMatchText',
          chatgptErrorKey: keys.chatgptErrorAutoContinue || 'chatgptErrorAutoContinue',
        });
        namespace.autoContinueController = controller;
        void controller.start();
      }
    }
  }
})();
