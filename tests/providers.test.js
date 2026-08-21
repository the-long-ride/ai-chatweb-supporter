const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../src/providers/registry.js');
const chatgpt = require('../src/providers/chatgpt.js');
const claude = require('../src/providers/claude.js');
const grok = require('../src/providers/grok.js');

test('registry selects supported providers and rejects unsupported hosts', () => {
  assert.equal(registry.getProvider('https://chatgpt.com/c/abc')?.id, 'chatgpt');
  assert.equal(registry.getProvider('https://claude.ai/chat/abc')?.id, 'claude');
  assert.equal(registry.getProvider('https://grok.com/c/abc')?.id, 'grok');
  assert.equal(registry.getProvider('https://example.com/'), null);
});

test('ChatGPT adapter owns conversation parsing', () => {
  assert.equal(chatgpt.extractConversationId('https://chatgpt.com/c/abc-123'), 'abc-123');
  assert.equal(chatgpt.extractConversationId('https://chatgpt.com/g/gpt-x/c/xyz?model=auto'), 'xyz');
  assert.equal(chatgpt.extractConversationId('https://chatgpt.com/'), null);
  assert.equal(chatgpt.matchesLocation('https://chatgpt.com/c/x'), true);
  assert.equal(chatgpt.matchesLocation('https://claude.ai/chat/x'), false);
});

test('ChatGPT adapter preserves queue anchor precedence', () => {
  const form = { parentElement: {} };
  const shell = { parentElement: {} };
  const parent = {};
  const composer = {
    parentElement: parent,
    closest(selector) {
      if (selector === 'form') return form;
      if (selector === '[data-type="unified-composer"]') return shell;
      return null;
    },
  };
  assert.equal(chatgpt.queueAnchor(composer), form);
});

test('Claude adapter parses /chat/:id and matches only claude.ai', () => {
  assert.equal(claude.extractConversationId('https://claude.ai/chat/508a22e2-30af-4815-badc-7c3aed4c8827'), '508a22e2-30af-4815-badc-7c3aed4c8827');
  assert.equal(claude.extractConversationId('https://claude.ai/new'), null);
  assert.equal(claude.matchesLocation('https://claude.ai/chat/x'), true);
  assert.equal(claude.matchesLocation('https://chatgpt.com/c/x'), false);
});

test('Grok adapter parses /c/:id, ignores rid query, and matches only grok.com', () => {
  assert.equal(
    grok.extractConversationId('https://grok.com/c/7f2ae2fc-872a-4844-9ed4-0d963fef615e?rid=1f69b171-aefd-4c76-ab40-af1619eced8f'),
    '7f2ae2fc-872a-4844-9ed4-0d963fef615e'
  );
  assert.equal(grok.extractConversationId('https://grok.com/'), null);
  assert.equal(grok.matchesLocation('https://grok.com/c/x'), true);
  assert.equal(grok.matchesLocation('https://claude.ai/chat/x'), false);
});

function visibleElement(extra = {}) {
  return {
    isConnected: true,
    getBoundingClientRect() { return { width: 100, height: 30 }; },
    closest() { return null; },
    getAttribute() { return null; },
    ...extra,
  };
}

const win = {
  getComputedStyle: () => ({
    display: 'block', visibility: 'visible', pointerEvents: 'auto',
    color: 'rgb(1, 2, 3)', backgroundColor: 'rgb(4, 5, 6)', borderColor: 'rgb(7, 8, 9)',
    borderRadius: '12px', fontFamily: 'Provider Sans', colorScheme: 'dark',
  }),
};

test('Claude adapter finds ProseMirror composer and scoped send/stop controls', () => {
  const send = visibleElement({ disabled: false });
  const stop = visibleElement({ disabled: false });
  const scope = {
    parentElement: {},
    querySelectorAll(selector) {
      if (selector === 'button[data-testid="send-button"]') return [send];
      if (selector === 'button[aria-label="Stop response"]') return [stop];
      if (selector === 'input[type="file"]') return [];
      return [];
    },
    querySelector() { return null; },
  };
  const composer = visibleElement({
    tagName: 'DIV', isContentEditable: true, innerText: 'draft', textContent: 'draft', parentElement: {},
    closest(selector) { return selector === 'fieldset' ? scope : null; },
  });
  const doc = { querySelectorAll(selector) { return selector === 'div.ProseMirror[contenteditable="true"]' ? [composer] : []; } };

  assert.equal(claude.findComposer(doc, win), composer);
  assert.equal(claude.findSendButton(composer, doc, win), send);
  assert.equal(claude.findStopButton(composer, doc, win), stop);
  assert.equal(claude.queueAnchor(composer), scope);
});

test('Claude adapter writes contenteditable text and detects attachment evidence', () => {
  class FakeEvent { constructor(type, options) { this.type = type; this.bubbles = Boolean(options?.bubbles); } }
  const events = [];
  const scope = {
    parentElement: {},
    querySelectorAll(selector) {
      if (selector === 'input[type="file"]') return [{ files: { length: 1 } }];
      return [];
    },
    querySelector() { return null; },
  };
  const composer = {
    tagName: 'DIV', isContentEditable: true, innerText: 'old', textContent: 'old', parentElement: {},
    ownerDocument: { defaultView: { Event: FakeEvent, InputEvent: FakeEvent } },
    closest(selector) { return selector === 'fieldset' ? scope : null; },
    dispatchEvent(event) { events.push(event); return true; },
  };

  assert.equal(claude.getComposerText(composer), 'old');
  assert.equal(claude.setComposerText(composer, 'queued'), true);
  assert.equal(composer.textContent, 'queued');
  assert.deepEqual(events.map((event) => [event.type, event.bubbles]), [['input', true]]);
  assert.equal(claude.hasAttachments(composer), true);
});

test('ChatGPT adapter preserves composer, send, stop, and attachment behavior', () => {
  const send = visibleElement({ disabled: false });
  const stop = visibleElement({ disabled: false });
  const scope = {
    parentElement: {},
    querySelectorAll(selector) {
      if (selector === 'button[data-testid="send-button"]') return [send];
      if (selector === 'button[data-testid="stop-button"]') return [stop];
      if (selector === 'input[type="file"]') return [{ files: { length: 1 } }];
      return [];
    },
    querySelector() { return null; },
  };
  const composer = visibleElement({
    tagName: 'DIV', isContentEditable: true, innerText: 'draft', textContent: 'draft', parentElement: {},
    closest(selector) { return selector === 'form' ? scope : null; },
  });
  const doc = { querySelectorAll(selector) { return selector === '#prompt-textarea' ? [composer] : []; } };

  assert.equal(chatgpt.findComposer(doc, win), composer);
  assert.equal(chatgpt.findSendButton(composer, doc, win), send);
  assert.equal(chatgpt.findStopButton(composer, doc, win), stop);
  assert.equal(chatgpt.hasAttachments(composer), true);
});

test('Grok adapter prioritizes current ProseMirror composer and chat-submit control', () => {
  const send = visibleElement({ disabled: false });
  const stop = visibleElement({ disabled: false });
  const scope = {
    parentElement: {},
    querySelectorAll(selector) {
      if (selector === 'button[data-testid="chat-submit"]') return [send];
      if (selector === 'button[aria-label="Stop"]') return [stop];
      if (selector === 'input[type="file"]') return [];
      return [];
    },
    querySelector() { return null; },
  };
  const composer = visibleElement({
    tagName: 'DIV', isContentEditable: true, innerText: 'draft', textContent: 'draft', parentElement: {},
    closest(selector) { return selector === 'form' ? scope : null; },
  });
  const doc = {
    querySelectorAll(selector) {
      return selector === 'div.ProseMirror[contenteditable="true"][role="textbox"]' ? [composer] : [];
    },
  };

  assert.equal(grok.findComposer(doc, win), composer);
  assert.equal(grok.findSendButton(composer, doc, win), send);
  assert.equal(grok.findStopButton(composer, doc, win), stop);
  assert.equal(grok.queueAnchor(composer), scope);
});

test('Grok adapter detects attachments and all providers expose theme context', () => {
  const scope = {
    parentElement: {},
    querySelectorAll(selector) {
      if (selector === 'input[type="file"]') return [{ files: { length: 1 } }];
      return [];
    },
    querySelector() { return null; },
  };
  const composer = visibleElement({ closest(selector) { return selector === 'form' ? scope : null; } });
  assert.equal(grok.hasAttachments(composer), true);
  for (const provider of [chatgpt, claude, grok]) {
    assert.equal(typeof provider.themeContext, 'function');
    assert.deepEqual(provider.themeContext(composer, {}, win), {
      color: 'rgb(1, 2, 3)', background: 'rgb(4, 5, 6)', borderColor: 'rgb(7, 8, 9)',
      borderRadius: '12px', fontFamily: 'Provider Sans', colorScheme: 'dark',
    });
  }
});
