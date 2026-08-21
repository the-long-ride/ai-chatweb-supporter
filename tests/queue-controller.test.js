const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const controller = require('../src/queue/controller.js');
const dom = require('../src/queue/dom.js');

test('queue controller consumes shared storage keys instead of redefining them', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/controller.js'),'utf8');
  assert.doesNotMatch(source, /const\s+QUEUE_KEY\s*=\s*['"]cgptMessageQueue/);
  assert.doesNotMatch(source, /const\s+SHORTCUT_KEY\s*=\s*['"]cgptQueueShortcut/);
  assert.match(source, /STORAGE_KEYS/);
});

test('ActiveQueueState replaces the active queue when conversation scope changes', () => {
  const state = new controller.ActiveQueueState();
  state.switchTo('conversation:a', [{ id: 'a', text: 'A', createdAt: 1 }]);
  state.switchTo('conversation:b', [{ id: 'b', text: 'B', createdAt: 2 }]);
  assert.equal(state.scopeId, 'conversation:b');
  assert.deepEqual(state.queue.map((item) => item.id), ['b']);
  assert.equal(state.isCurrentScope('conversation:a'), false);
  assert.equal(state.isCurrentScope('conversation:b'), true);
});

test('ActiveQueueState identifies only the active scoped storage key', () => {
  const state = new controller.ActiveQueueState();
  state.switchTo('tab:9', []);
  assert.equal(state.isActiveStorageKey('cgptMessageQueue:tab:9'), true);
  assert.equal(state.isActiveStorageKey('cgptMessageQueue:tab:10'), false);
  assert.equal(state.isActiveStorageKey('cgptMessageQueue'), false);
});

test('DispatchGate sends exactly one item across a busy then idle response cycle', () => {
  const gate=new controller.DispatchGate(); const ready={busy:false,sendReady:true,queueLength:2};
  gate.observeBusy(false); assert.equal(gate.shouldDispatch(ready),true);
  gate.beginDispatch(); assert.equal(gate.shouldDispatch(ready),false);
  gate.finishDispatch(true); assert.equal(gate.shouldDispatch(ready),false);
  gate.observeBusy(true); assert.equal(gate.shouldDispatch({...ready,busy:true}),false);
  gate.observeBusy(false); assert.equal(gate.shouldDispatch(ready),true);
});

test('DispatchGate releases a failed dispatch so the same queue item can retry', () => {
  const gate=new controller.DispatchGate(); const ready={busy:false,sendReady:true,queueLength:1};
  gate.beginDispatch(); gate.finishDispatch(false); assert.equal(gate.shouldDispatch(ready),true);
});

test('getComposerText supports textarea and contenteditable composers', () => {
  assert.equal(dom.getComposerText({tagName:'TEXTAREA',value:'draft'}),'draft');
  assert.equal(dom.getComposerText({tagName:'DIV',isContentEditable:true,innerText:'editable draft',textContent:'fallback'}),'editable draft');
});

test('isElementVisible and isButtonReady reject unusable controls', () => {
  const win={getComputedStyle:()=>({display:'block',visibility:'visible',pointerEvents:'auto'})};
  const visible={isConnected:true,getBoundingClientRect:()=>({width:10,height:10})};
  assert.equal(dom.isElementVisible(visible,win),true);
  assert.equal(dom.isElementVisible({...visible,isConnected:false},win),false);
  const button={...visible,disabled:false,getAttribute:()=>null};
  assert.equal(dom.isButtonReady(button,win),true);
  assert.equal(dom.isButtonReady({...button,disabled:true},win),false);
  const blocked={getComputedStyle:()=>({display:'block',visibility:'visible',pointerEvents:'none'})};
  assert.equal(dom.isButtonReady(button,blocked),false);
});

test('hasComposerAttachments detects pending file input and attachment chips', () => {
  const makeComposer=(scope)=>({closest(selector){return selector==='form'?scope:null;},parentElement:null});
  const none={querySelectorAll(){return [];},querySelector(){return null;}};
  const file={querySelectorAll(selector){return selector==='input[type="file"]'?[{files:{length:1}}]:[];},querySelector(){return null;}};
  const chip={querySelectorAll(){return [];},querySelector(selector){return selector.includes('attachment')?{}:null;}};
  assert.equal(dom.hasComposerAttachments(makeComposer(none)),false);
  assert.equal(dom.hasComposerAttachments(makeComposer(file)),true);
  assert.equal(dom.hasComposerAttachments(makeComposer(chip)),true);
});

test('classifySendAttempt requires evidence that ChatGPT consumed the queued prompt', () => {
  assert.equal(dom.classifySendAttempt({busy:true,composerText:'queued',queuedText:'queued',sendReady:true}),'accepted');
  assert.equal(dom.classifySendAttempt({busy:false,composerText:'',queuedText:'queued',sendReady:false}),'accepted');
  assert.equal(dom.classifySendAttempt({busy:false,composerText:'queued',queuedText:'queued',sendReady:true}),'pending');
  assert.equal(dom.classifySendAttempt({busy:false,composerText:'user draft',queuedText:'queued',sendReady:true}),'interrupted');
});

test('canPrepareQueuedSend does not require an empty-state send button', () => {
  assert.equal(dom.canPrepareQueuedSend({busy:false,composerText:'',hasAttachments:false}),true);
  assert.equal(dom.canPrepareQueuedSend({busy:true,composerText:'',hasAttachments:false}),false);
  assert.equal(dom.canPrepareQueuedSend({busy:false,composerText:'draft',hasAttachments:false}),false);
  assert.equal(dom.canPrepareQueuedSend({busy:false,composerText:'',hasAttachments:true}),false);
});

test('setComposerText updates textarea and emits a bubbling input event', () => {
  class FakeEvent{constructor(type,options){this.type=type;this.bubbles=Boolean(options?.bubbles);}}
  const events=[]; const composer={tagName:'TEXTAREA',value:'old',ownerDocument:{defaultView:{Event:FakeEvent,InputEvent:FakeEvent}},dispatchEvent(event){events.push(event);return true;}};
  dom.setComposerText(composer,'queued');
  assert.equal(composer.value,'queued');
  assert.deepEqual(events.map((e)=>[e.type,e.bubbles]),[['input',true]]);
});

test('requestTabId asks the service worker for the sender tab id', async () => {
  const calls = [];
  const runtime = {
    lastError: null,
    sendMessage(message, callback) {
      calls.push(message);
      callback({ tabId: 77 });
    },
  };
  assert.equal(await controller.requestTabId(runtime), 77);
  assert.deepEqual(calls, [{ type: 'aichat:get-tab-id' }]);
});

test('QueueScopeCoordinator migrates legacy global queue into first empty active scope', async () => {
  const data = {
    cgptMessageQueue: [{ id: 'legacy', text: 'Legacy', createdAt: 1 }],
  };
  const removed = [];
  const fakeStorage = {
    async get(keys) { return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]])); },
    async set(values) { Object.assign(data, values); },
    async remove(key) { removed.push(key); delete data[key]; },
  };
  const state = new controller.ActiveQueueState();
  const coordinator = new controller.QueueScopeCoordinator({ storageApi: fakeStorage, state });

  const changed = await coordinator.switchTo('conversation:abc');

  assert.equal(changed, true);
  assert.equal(state.scopeId, 'conversation:abc');
  assert.deepEqual(state.queue.map((item) => item.id), ['legacy']);
  assert.deepEqual(data['cgptMessageQueue:conversation:abc'].map((item) => item.id), ['legacy']);
  assert.equal('cgptMessageQueue' in data, false);
  assert.deepEqual(removed, ['cgptMessageQueue']);
});

test('QueueScopeCoordinator transfers tab queue to conversation and removes tab key', async () => {
  const data = {
    'cgptMessageQueue:tab:5': [{ id: 'tab-a', text: 'Tab A', createdAt: 1 }],
    'cgptMessageQueue:conversation:abc': [{ id: 'conv-a', text: 'Conv A', createdAt: 2 }],
  };
  const fakeStorage = {
    async get(keys) { return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]])); },
    async set(values) { Object.assign(data, values); },
    async remove(key) { delete data[key]; },
  };
  const state = new controller.ActiveQueueState();
  state.switchTo('tab:5', data['cgptMessageQueue:tab:5']);
  const coordinator = new controller.QueueScopeCoordinator({ storageApi: fakeStorage, state });

  await coordinator.switchTo('conversation:abc');

  assert.deepEqual(state.queue.map((item) => item.id), ['conv-a', 'tab-a']);
  assert.deepEqual(data['cgptMessageQueue:conversation:abc'].map((item) => item.id), ['conv-a', 'tab-a']);
  assert.equal('cgptMessageQueue:tab:5' in data, false);
});

test('runtime controller resolves and persists only the active scoped queue', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/controller.js'), 'utf8');
  assert.match(source, /scope\.resolveScope\(/);
  assert.match(source, /coordinator\.switchTo\(/);
  assert.match(source, /state\.isActiveStorageKey\(/);
  assert.doesNotMatch(source, /\[QUEUE_KEY\]/);
});
