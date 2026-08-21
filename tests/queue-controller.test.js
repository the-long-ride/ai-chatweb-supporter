const test = require('node:test');
const assert = require('node:assert/strict');

const controller = require('../queue-content.js');
const dom = require('../queue-dom.js');

test('DispatchGate sends exactly one item across a busy then idle response cycle', () => {
  assert.equal(typeof controller.DispatchGate, 'function', 'DispatchGate should be implemented');
  const gate = new controller.DispatchGate();
  const ready = { busy: false, sendReady: true, queueLength: 2 };

  gate.observeBusy(false);
  assert.equal(gate.shouldDispatch(ready), true);

  gate.beginDispatch();
  assert.equal(gate.shouldDispatch(ready), false);

  gate.finishDispatch(true);
  assert.equal(gate.shouldDispatch(ready), false, 'must wait for ChatGPT to enter busy state');

  gate.observeBusy(true);
  assert.equal(gate.shouldDispatch({ ...ready, busy: true }), false);

  gate.observeBusy(false);
  assert.equal(gate.shouldDispatch(ready), true, 'next item becomes eligible only after response completes');
});

test('DispatchGate releases a failed dispatch so the same queue item can retry', () => {
  assert.equal(typeof controller.DispatchGate, 'function', 'DispatchGate should be implemented');
  const gate = new controller.DispatchGate();
  const ready = { busy: false, sendReady: true, queueLength: 1 };

  gate.beginDispatch();
  gate.finishDispatch(false);

  assert.equal(gate.shouldDispatch(ready), true);
});

test('DispatchGate never dispatches while initial ChatGPT state is busy', () => {
  assert.equal(typeof controller.DispatchGate, 'function', 'DispatchGate should be implemented');
  const gate = new controller.DispatchGate();

  gate.observeBusy(true);
  assert.equal(gate.shouldDispatch({ busy: true, sendReady: true, queueLength: 3 }), false);
  gate.observeBusy(false);
  assert.equal(gate.shouldDispatch({ busy: false, sendReady: true, queueLength: 3 }), true);
});

test('getComposerText supports textarea and contenteditable composers', () => {
  assert.equal(typeof dom.getComposerText, 'function', 'getComposerText should be implemented');
  assert.equal(dom.getComposerText({ tagName: 'TEXTAREA', value: 'draft' }), 'draft');
  assert.equal(
    dom.getComposerText({ tagName: 'DIV', isContentEditable: true, innerText: 'editable draft', textContent: 'fallback' }),
    'editable draft'
  );
});

test('isElementVisible rejects disconnected, hidden, and zero-size elements', () => {
  assert.equal(typeof dom.isElementVisible, 'function', 'isElementVisible should be implemented');
  const win = { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) };
  const visible = { isConnected: true, getBoundingClientRect: () => ({ width: 10, height: 10 }) };
  const hidden = { isConnected: true, getBoundingClientRect: () => ({ width: 10, height: 10 }) };
  const hiddenWin = { getComputedStyle: () => ({ display: 'none', visibility: 'visible' }) };

  assert.equal(dom.isElementVisible(visible, win), true);
  assert.equal(dom.isElementVisible({ ...visible, isConnected: false }, win), false);
  assert.equal(dom.isElementVisible({ ...visible, getBoundingClientRect: () => ({ width: 0, height: 10 }) }, win), false);
  assert.equal(dom.isElementVisible(hidden, hiddenWin), false);
});

test('isButtonReady requires a visible enabled button', () => {
  assert.equal(typeof dom.isButtonReady, 'function', 'isButtonReady should be implemented');
  const win = { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) };
  const makeButton = (overrides = {}) => ({
    isConnected: true,
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 24, height: 24 }),
    ...overrides,
  });

  assert.equal(dom.isButtonReady(makeButton(), win), true);
  assert.equal(dom.isButtonReady(makeButton({ disabled: true }), win), false);
  assert.equal(dom.isButtonReady(makeButton({ getAttribute: (name) => (name === 'aria-disabled' ? 'true' : null) }), win), false);
  const blockedWin = { getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'none' }) };
  assert.equal(dom.isButtonReady(makeButton(), blockedWin), false);
});

test('hasComposerAttachments detects pending file input and attachment chips', () => {
  assert.equal(typeof dom.hasComposerAttachments, 'function', 'hasComposerAttachments should be implemented');

  const makeComposer = (scope) => ({
    closest(selector) { return selector === 'form' ? scope : null; },
    parentElement: null,
  });
  const noAttachments = {
    querySelectorAll(selector) { return selector === 'input[type="file"]' ? [] : []; },
    querySelector() { return null; },
  };
  const pendingFile = {
    querySelectorAll(selector) {
      return selector === 'input[type="file"]' ? [{ files: { length: 1 } }] : [];
    },
    querySelector() { return null; },
  };
  const chip = {
    querySelectorAll() { return []; },
    querySelector(selector) {
      return selector.includes('attachment') ? {} : null;
    },
  };

  assert.equal(dom.hasComposerAttachments(makeComposer(noAttachments)), false);
  assert.equal(dom.hasComposerAttachments(makeComposer(pendingFile)), true);
  assert.equal(dom.hasComposerAttachments(makeComposer(chip)), true);
});

test('classifySendAttempt requires evidence that ChatGPT consumed the queued prompt', () => {
  assert.equal(typeof dom.classifySendAttempt, 'function', 'classifySendAttempt should be implemented');

  assert.equal(dom.classifySendAttempt({ busy: true, composerText: 'queued', queuedText: 'queued', sendReady: true }), 'accepted');
  assert.equal(dom.classifySendAttempt({ busy: false, composerText: '', queuedText: 'queued', sendReady: false }), 'accepted');
  assert.equal(dom.classifySendAttempt({ busy: false, composerText: 'queued', queuedText: 'queued', sendReady: true }), 'pending');
  assert.equal(dom.classifySendAttempt({ busy: false, composerText: 'user draft', queuedText: 'queued', sendReady: true }), 'interrupted');
});



test('canPrepareQueuedSend does not require an empty-state send button', () => {
  assert.equal(typeof dom.canPrepareQueuedSend, 'function', 'canPrepareQueuedSend should be implemented');
  assert.equal(dom.canPrepareQueuedSend({ busy: false, composerText: '', hasAttachments: false }), true);
  assert.equal(dom.canPrepareQueuedSend({ busy: true, composerText: '', hasAttachments: false }), false);
  assert.equal(dom.canPrepareQueuedSend({ busy: false, composerText: 'draft', hasAttachments: false }), false);
  assert.equal(dom.canPrepareQueuedSend({ busy: false, composerText: '', hasAttachments: true }), false);
});
test('setComposerText updates textarea value and emits a bubbling input event', () => {
  assert.equal(typeof dom.setComposerText, 'function', 'setComposerText should be implemented');
  class FakeEvent {
    constructor(type, options) {
      this.type = type;
      this.bubbles = Boolean(options?.bubbles);
    }
  }
  const events = [];
  const composer = {
    tagName: 'TEXTAREA',
    value: 'old',
    ownerDocument: { defaultView: { Event: FakeEvent, InputEvent: FakeEvent } },
    dispatchEvent(event) { events.push(event); return true; },
  };

  dom.setComposerText(composer, 'queued');

  assert.equal(composer.value, 'queued');
  assert.deepEqual(events.map((event) => [event.type, event.bubbles]), [['input', true]]);
});

test('setComposerText updates contenteditable text content', () => {
  assert.equal(typeof dom.setComposerText, 'function', 'setComposerText should be implemented');
  class FakeEvent {
    constructor(type) { this.type = type; }
  }
  const composer = {
    tagName: 'DIV',
    isContentEditable: true,
    textContent: 'old',
    ownerDocument: { defaultView: { Event: FakeEvent, InputEvent: FakeEvent } },
    dispatchEvent() { return true; },
  };

  dom.setComposerText(composer, 'new text');
  assert.equal(composer.textContent, 'new text');
});
