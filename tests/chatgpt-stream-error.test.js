const test = require('node:test');
const assert = require('node:assert/strict');
const chatgpt = require('../src/providers/chatgpt.js');

function visibleNode(textContent = '') {
  return {
    textContent,
    isConnected: true,
    getBoundingClientRect: () => ({ width: 200, height: 40 }),
    closest: () => null,
  };
}
function win() { return { getComputedStyle: () => ({ display:'block', visibility:'visible' }), Event: class { constructor(type){this.type=type;} } }; }
function composer(value = '') {
  const node = Object.create({});
  Object.assign(node, { tagName:'TEXTAREA', value, ownerDocument:{ defaultView:win() }, dispatchEvent() {}, isConnected:true, getBoundingClientRect:()=>({width:300,height:80}), closest:()=>null });
  return node;
}

test('fills continuation when ChatGPT regenerate-thread stream error is visible', () => {
  const retry = visibleNode('Retry');
  const box = visibleNode('Error in message stream Retry');
  const input = composer('');
  const doc = {
    querySelectorAll(selector) {
      if (selector === 'button[data-testid="regenerate-thread-error-button"]') return [retry];
      if (selector.includes('text-token-text-error')) return [box];
      if (selector.includes('prompt-textarea') || selector === '#prompt-textarea') return [input];
      return [];
    },
  };
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(input, doc, win()), true);
  assert.equal(input.value, 'continue remaining works');
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(input, doc, win()), false);
});

test('does not overwrite a non-empty composer', () => {
  const retry = visibleNode('Retry');
  const input = composer('my draft');
  const doc = { querySelectorAll(selector) { return selector.includes('regenerate-thread-error-button') ? [retry] : []; } };
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(input, doc, win()), false);
  assert.equal(input.value, 'my draft');
});

test('recognizes Error in message stream fallback without the retry testid', () => {
  const box = visibleNode('Error in message stream');
  const input = composer('');
  const doc = { querySelectorAll(selector) { return selector.includes('text-token-text-error') ? [box] : []; } };
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(input, doc, win()), true);
  assert.equal(input.value, 'continue remaining works');
});
