const test = require('node:test');
const assert = require('node:assert/strict');

const autoContinue = require('../src/providers/claude-auto-continue.js');

function visibleButton(text = 'Continue') {
  return {
    disabled: false,
    isConnected: true,
    textContent: text,
    clicks: 0,
    getAttribute() { return null; },
    getBoundingClientRect() { return { width: 80, height: 32 }; },
    click() { this.clicks += 1; },
  };
}

const win = { getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto' }) };

test('findContinueButton only accepts Claude tool-use-limit warning with Continue button', () => {
  const button = visibleButton();
  const warning = {
    textContent: 'Claude reached its tool-use limit for this turn. Continue',
    querySelectorAll(selector) { return selector === 'button' ? [button] : []; },
  };
  const doc = { querySelectorAll(selector) { return selector === '[data-testid="message-warning"]' ? [warning] : []; } };

  assert.equal(autoContinue.findContinueButton(doc, win), button);

  warning.textContent = 'Claude hit another warning. Continue';
  assert.equal(autoContinue.findContinueButton(doc, win), null);

  warning.textContent = 'Claude reached its tool-use limit for this turn. Cancel';
  button.textContent = 'Cancel';
  assert.equal(autoContinue.findContinueButton(doc, win), null);
});

test('scan clicks a matching button at most once and respects enabled state', () => {
  const button = visibleButton();
  const warning = {
    textContent: 'Claude reached its tool-use limit for this turn. Continue',
    querySelectorAll() { return [button]; },
  };
  const doc = { querySelectorAll() { return [warning]; } };
  const controller = autoContinue.createController({ doc, win, enabled: true });

  assert.equal(controller.scan(), true);
  assert.equal(button.clicks, 1);
  assert.equal(controller.scan(), false);
  assert.equal(button.clicks, 1);

  const nextButton = visibleButton();
  warning.querySelectorAll = () => [nextButton];
  controller.setEnabled(false);
  assert.equal(controller.scan(), false);
  assert.equal(nextButton.clicks, 0);
  controller.setEnabled(true);
  assert.equal(controller.scan(), true);
  assert.equal(nextButton.clicks, 1);
});

test('start defaults missing preference to enabled and reacts to storage changes', async () => {
  const button = visibleButton();
  const warning = {
    textContent: 'Claude reached its tool-use limit for this turn. Continue',
    querySelectorAll() { return [button]; },
  };
  const doc = { querySelectorAll() { return [warning]; }, documentElement: {} };
  const listeners = [];
  const storage = { get: async () => ({}) };
  const storageEvents = { addListener(fn) { listeners.push(fn); }, removeListener() {} };
  class FakeObserver { constructor(fn) { this.fn = fn; } observe() {} disconnect() {} }
  const controller = autoContinue.createController({
    doc,
    win,
    storage,
    storageEvents,
    storageKey: 'claudeAutoContinue',
    MutationObserverCtor: FakeObserver,
  });

  await controller.start();
  assert.equal(controller.isEnabled(), true);
  assert.equal(button.clicks, 1);

  const nextButton = visibleButton();
  warning.querySelectorAll = () => [nextButton];
  listeners[0]({ claudeAutoContinue: { newValue: false } }, 'local');
  assert.equal(controller.isEnabled(), false);
  assert.equal(controller.scan(), false);
  listeners[0]({ claudeAutoContinue: { newValue: true } }, 'local');
  assert.equal(controller.isEnabled(), true);
  assert.equal(nextButton.clicks, 1);
});
