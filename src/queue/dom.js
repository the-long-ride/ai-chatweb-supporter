(() => {
  'use strict';

  const COMPOSER_SELECTORS = [
    '#prompt-textarea',
    'textarea[data-testid="prompt-textarea"]',
    'div[contenteditable="true"][data-virtualkeyboard="true"]',
    'form div[contenteditable="true"]',
  ];
  const SEND_SELECTORS = [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[type="submit"]',
  ];
  const STOP_SELECTORS = [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop generating" i]',
    'button[aria-label*="Stop streaming" i]',
  ];
  const ATTACHMENT_SELECTOR = [
    '[data-testid*="attachment" i]',
    '[data-testid*="file-preview" i]',
    '[data-testid*="file-thumbnail" i]',
    'button[aria-label*="Remove attachment" i]',
    'button[aria-label*="Remove file" i]',
  ].join(',');

  function getComposerText(composer) {
    if (!composer) return '';
    const tagName = String(composer.tagName || '').toUpperCase();
    if (tagName === 'TEXTAREA' || tagName === 'INPUT') return typeof composer.value === 'string' ? composer.value : '';
    if (composer.isContentEditable) return typeof composer.innerText === 'string' ? composer.innerText : String(composer.textContent || '');
    return String(composer.textContent || '');
  }

  function isElementVisible(element, win = globalThis.window) {
    if (!element || element.isConnected === false || !element.getBoundingClientRect) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = win?.getComputedStyle ? win.getComputedStyle(element) : null;
    return !style || (style.display !== 'none' && style.visibility !== 'hidden');
  }

  function isButtonReady(button, win = globalThis.window) {
    if (!isElementVisible(button, win) || button.disabled) return false;
    if (button.getAttribute?.('aria-disabled') === 'true') return false;
    const style = win?.getComputedStyle ? win.getComputedStyle(button) : null;
    return !style || style.pointerEvents !== 'none';
  }

  function composerScope(composer) {
    return composer?.closest?.('form') || composer?.closest?.('[data-type="unified-composer"]') || composer?.parentElement || null;
  }

  function firstVisible(scope, selectors, win = globalThis.window) {
    if (!scope?.querySelectorAll) return null;
    for (const selector of selectors) {
      for (const element of scope.querySelectorAll(selector)) {
        if (element.closest?.('[data-cgpt-queue-ui="true"]')) continue;
        if (isElementVisible(element, win)) return element;
      }
    }
    return null;
  }

  function findComposer(doc = globalThis.document, win = globalThis.window) {
    return firstVisible(doc, COMPOSER_SELECTORS, win);
  }

  function findSendButton(composer, doc = globalThis.document, win = globalThis.window) {
    return firstVisible(composerScope(composer) || doc, SEND_SELECTORS, win);
  }

  function findStopButton(composer, doc = globalThis.document, win = globalThis.window) {
    const local = firstVisible(composerScope(composer) || doc, STOP_SELECTORS, win);
    return local || firstVisible(doc, STOP_SELECTORS, win);
  }

  function hasComposerAttachments(composer) {
    const scope = composerScope(composer);
    if (!scope?.querySelectorAll) return false;
    for (const input of scope.querySelectorAll('input[type="file"]')) {
      if (input?.files?.length) return true;
    }
    return Boolean(scope.querySelector?.(ATTACHMENT_SELECTOR));
  }

  function classifySendAttempt({ busy, composerText, queuedText, sendReady }) {
    if (busy) return 'accepted';
    const current = String(composerText ?? '').trim();
    const queued = String(queuedText ?? '').trim();
    if (!current && !sendReady) return 'accepted';
    if (current && current !== queued) return 'interrupted';
    return 'pending';
  }

  function canPrepareQueuedSend({ busy, composerText, hasAttachments }) {
    return !busy && !String(composerText ?? '').trim() && !hasAttachments;
  }

  function setComposerText(composer, text) {
    if (!composer) return false;
    const next = String(text ?? '');
    const tagName = String(composer.tagName || '').toUpperCase();

    if (tagName === 'TEXTAREA' || tagName === 'INPUT') {
      const proto = Object.getPrototypeOf(composer);
      const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor?.set) descriptor.set.call(composer, next);
      else composer.value = next;
    } else {
      const doc = composer.ownerDocument;
      const view = doc?.defaultView || globalThis.window;
      let inserted = false;
      if (doc?.execCommand && view?.getSelection && composer.focus) {
        try {
          composer.focus();
          const selection = view.getSelection();
          const range = doc.createRange();
          range.selectNodeContents(composer);
          selection.removeAllRanges();
          selection.addRange(range);
          inserted = doc.execCommand('insertText', false, next);
        } catch { inserted = false; }
      }
      if (inserted) return true;
      composer.textContent = next;
    }

    const view = composer.ownerDocument?.defaultView || globalThis.window;
    let event;
    try {
      const InputEventCtor = view?.InputEvent || view?.Event;
      event = new InputEventCtor('input', { bubbles: true, inputType: next ? 'insertText' : 'deleteContentBackward', data: next || null });
    } catch {
      event = new (view?.Event || Event)('input', { bubbles: true });
    }
    composer.dispatchEvent?.(event);
    return true;
  }

  const api = {
    getComposerText,
    isElementVisible,
    isButtonReady,
    composerScope,
    findComposer,
    findSendButton,
    findStopButton,
    hasComposerAttachments,
    classifySendAttempt,
    canPrepareQueuedSend,
    setComposerText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const namespace = globalThis.AiChatWebSupporter ||= {};
    namespace.queueDom = api;
  }
})();
