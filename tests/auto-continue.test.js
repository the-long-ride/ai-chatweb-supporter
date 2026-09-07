const test = require('node:test');
const assert = require('node:assert/strict');
const autoContinue = require('../src/auto-continue/controller.js');

function node(text = '') {
  return { textContent: text };
}

function makeProvider(id = 'chatgpt') {
  const composer = { value:'', tagName:'TEXTAREA' };
  const send = { disabled:false, clicks:0, isConnected:true, getAttribute:()=>null, getBoundingClientRect:()=>({width:20,height:20}), click(){ this.clicks += 1; composer.value=''; } };
  return {
    id,
    composer,
    send,
    busy:false,
    findComposer(){ return composer; },
    getComposerText(){ return composer.value; },
    setComposerText(_composer, value){ composer.value = value; return true; },
    findSendButton(){ return send; },
    findStopButton(){ return this.busy ? {} : null; },
  };
}

const win = { getComputedStyle:()=>({ display:'block', visibility:'visible', pointerEvents:'auto' }) };
function docWith(messages = []) { return { querySelectorAll(){ return messages; }, documentElement:{} }; }

test('matching is case-insensitive and whitespace-normalized', () => {
  assert.equal(autoContinue.responseMatches('Do abc\n status:   Incompleted', ' incompleted '), true);
  assert.equal(autoContinue.responseMatches('status: complete', 'Incompleted'), false);
});

test('findLatestAssistantMessage returns the last provider response', () => {
  const first = node('one');
  const last = node('two');
  assert.equal(autoContinue.findLatestAssistantMessage('chatgpt', docWith([first, last])), last);
});

test('scan sends the fixed continuation once for one matching response', () => {
  const provider = makeProvider('chatgpt');
  const message = node('Do abc xyz, status: Incompleted');
  const controller = autoContinue.createController({ provider, doc:docWith([message]), win, textEnabled:true, matchText:'Incompleted' });
  assert.equal(controller.scan(), true);
  assert.equal(provider.send.clicks, 1);
  assert.equal(controller.scan(), false);
  assert.equal(provider.send.clicks, 1);
});

test('a later matching response can trigger again', () => {
  const provider = makeProvider('claude');
  const first = node('Incompleted');
  const doc = docWith([first]);
  const controller = autoContinue.createController({ provider, doc, win, textEnabled:true, matchText:'Incompleted' });
  controller.scan();
  const second = node('Still Incompleted');
  doc.querySelectorAll = () => [first, second];
  controller.scan();
  assert.equal(provider.send.clicks, 2);
});

test('disabled, empty config, busy generation, and user draft do not send', () => {
  const provider = makeProvider('grok');
  const message = node('Incompleted');
  const doc = docWith([message]);
  let controller = autoContinue.createController({ provider, doc, win, textEnabled:false, matchText:'Incompleted' });
  assert.equal(controller.scan(), false);
  controller = autoContinue.createController({ provider, doc, win, textEnabled:true, matchText:'' });
  assert.equal(controller.scan(), false);
  provider.busy = true;
  controller = autoContinue.createController({ provider, doc, win, textEnabled:true, matchText:'Incompleted' });
  assert.equal(controller.scan(), false);
  provider.busy = false;
  provider.composer.value = 'my draft';
  assert.equal(controller.scan(), false);
  assert.equal(provider.composer.value, 'my draft');
  assert.equal(provider.send.clicks, 0);
});

test('auto-filled continuation waits for send readiness and aborts if user edits it', () => {
  const provider = makeProvider('chatgpt');
  const message = node('Incompleted');
  provider.send.disabled = true;
  const controller = autoContinue.createController({ provider, doc:docWith([message]), win, textEnabled:true, matchText:'Incompleted' });
  assert.equal(controller.scan(), true);
  assert.equal(provider.composer.value, autoContinue.CONTINUATION_TEXT);
  provider.composer.value = 'user changed it';
  provider.send.disabled = false;
  assert.equal(controller.scan(), false);
  assert.equal(provider.send.clicks, 0);
  assert.equal(controller.scan(), false);
});

test('ChatGPT error continuation is controlled independently by its toggle', () => {
  const provider = makeProvider('chatgpt');
  let calls = 0;
  provider.maybeFillStreamErrorContinuation = () => { calls += 1; return true; };
  const controller = autoContinue.createController({ provider, doc:docWith([]), win, textEnabled:false, chatgptErrorEnabled:true });
  assert.equal(controller.scan(), true);
  assert.equal(calls, 1);
  controller.setChatgptErrorEnabled(false);
  assert.equal(controller.scan(), false);
  assert.equal(calls, 1);
});

test('background reconcile and storage changes rescan with current settings', async () => {
  const provider = makeProvider('grok');
  const message = node('Incompleted');
  const runtimeListeners = [];
  const storageListeners = [];
  const sentMessages = [];
  const runtime = {
    sendMessage(message, callback){ sentMessages.push(message); callback?.(); },
    onMessage:{ addListener(fn){ runtimeListeners.push(fn); }, removeListener(){} },
    lastError:null,
  };
  const storage = { get:async()=>({ autoContinueEnabled:false, autoContinueMatchText:'Incompleted', chatgptErrorAutoContinue:true }) };
  const storageEvents = { addListener(fn){ storageListeners.push(fn); }, removeListener(){} };
  class FakeObserver { observe(){} disconnect(){} }
  const controller = autoContinue.createController({ provider, doc:docWith([message]), win, storage, storageEvents, runtime, MutationObserverCtor:FakeObserver });
  await controller.start();
  assert.deepEqual(sentMessages, [{ type:'aichat:queue-register', provider:'grok' }]);
  assert.equal(provider.send.clicks, 0);
  storageListeners[0]({ autoContinueEnabled:{ newValue:true } }, 'local');
  assert.equal(provider.send.clicks, 1);
  runtimeListeners[0]({ type:'aichat:queue-reconcile' });
  assert.equal(provider.send.clicks, 1);
});

test('ChatGPT provider hook also respects the toggle for queue-runtime calls', async () => {
  const provider = makeProvider('chatgpt');
  let originalCalls = 0;
  provider.maybeFillStreamErrorContinuation = () => { originalCalls += 1; return true; };
  const listeners = [];
  const storage = { get:async()=>({ chatgptErrorAutoContinue:false }) };
  const storageEvents = { addListener(fn){ listeners.push(fn); }, removeListener(){} };
  const controller = autoContinue.createController({ provider, doc:docWith([]), win, storage, storageEvents, MutationObserverCtor:null });
  await controller.start();
  assert.equal(provider.maybeFillStreamErrorContinuation(provider.composer, docWith([]), win), false);
  assert.equal(originalCalls, 0);
  listeners[0]({ chatgptErrorAutoContinue:{ newValue:true } }, 'local');
  assert.equal(originalCalls, 1);
  assert.equal(provider.maybeFillStreamErrorContinuation(provider.composer, docWith([]), win), true);
  assert.equal(originalCalls, 2);
});

test('rerendering the same last response does not duplicate the continuation', () => {
  const provider = makeProvider('grok');
  const doc = docWith([node('Status: Incompleted')]);
  const controller = autoContinue.createController({ provider, doc, win, textEnabled:true, matchText:'Incompleted' });
  controller.scan();
  const replacement = node('Status: Incompleted');
  doc.querySelectorAll = () => [replacement];
  assert.equal(controller.scan(), false);
  assert.equal(provider.send.clicks, 1);
});
