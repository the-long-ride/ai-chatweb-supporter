const test = require('node:test');
const assert = require('node:assert/strict');
const chatgpt = require('../src/providers/chatgpt.js');

function makeWin() {
  return {
    getComputedStyle: () => ({ display:'block', visibility:'visible', pointerEvents:'auto' }),
    Event: class { constructor(type){this.type=type;} },
    InputEvent: class { constructor(type){this.type=type;} },
  };
}
function visibleNode(textContent = '') {
  return {
    textContent,
    isConnected: true,
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 200, height: 40 }),
    closest: () => null,
  };
}
function composer(value = '', win = makeWin()) {
  return {
    tagName:'TEXTAREA', value,
    ownerDocument:{ defaultView:win },
    dispatchEvent() {},
    isConnected:true,
    getBoundingClientRect:()=>({width:300,height:80}),
    closest:()=>null,
    parentElement:null,
  };
}
function environment({ draft='', sendReady=true, fallback=false }={}) {
  const win = makeWin();
  const input = composer(draft, win);
  const retry = visibleNode('Retry');
  const box = visibleNode('Error in message stream Retry');
  retry.closest = (selector) => selector === '.text-token-text-error' ? box : null;
  let clicks = 0;
  const send = visibleNode('Send');
  send.disabled = !sendReady;
  send.click = () => { clicks += 1; input.value = ''; };
  const doc = {
    querySelectorAll(selector) {
      if (selector === 'button[data-testid="regenerate-thread-error-button"]') return fallback ? [] : [retry];
      if (selector === 'button[data-testid="send-button"]') return [send];
      if (selector.includes('text-token-text-error')) return [box];
      return [];
    },
  };
  return { win, doc, input, send, box, clicks:()=>clicks };
}

test('fills continuation and clicks ChatGPT native Send when stream error is visible', () => {
  const env = environment();
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(env.input, env.doc, env.win), true);
  assert.equal(env.clicks(), 1);
  assert.equal(env.input.value, '');
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(env.input, env.doc, env.win), true);
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(env.input, env.doc, env.win), false);
  assert.equal(env.clicks(), 1);
});

test('retries when ChatGPT Send becomes ready later', () => {
  const env = environment({ sendReady:false });
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(env.input, env.doc, env.win), true);
  assert.equal(env.input.value, 'continue remaining works');
  assert.equal(env.clicks(), 0);
  env.send.disabled = false;
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(env.input, env.doc, env.win), true);
  assert.equal(env.clicks(), 1);
});

test('does not overwrite an existing composer draft', () => {
  const env = environment({ draft:'my draft' });
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(env.input, env.doc, env.win), false);
  assert.equal(env.input.value, 'my draft');
  assert.equal(env.clicks(), 0);
});

test('aborts auto-send if user edits the auto-filled continuation', () => {
  const env = environment({ sendReady:false });
  chatgpt.maybeFillStreamErrorContinuation(env.input, env.doc, env.win);
  env.input.value = 'continue remaining works please';
  env.send.disabled = false;
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(env.input, env.doc, env.win), false);
  assert.equal(env.clicks(), 0);
  env.input.value = '';
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(env.input, env.doc, env.win), false);
});

test('supports Error in message stream fallback without Retry testid', () => {
  const env = environment({ fallback:true });
  assert.equal(chatgpt.maybeFillStreamErrorContinuation(env.input, env.doc, env.win), true);
  assert.equal(env.clicks(), 1);
});
