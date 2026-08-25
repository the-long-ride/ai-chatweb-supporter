const test=require('node:test');const assert=require('node:assert/strict');const controller=require('../src/queue/controller.js');
const q=(id)=>({id,text:id,createdAt:1});
test('ActiveQueueState stores pause and serializes state',()=>{const s=new controller.ActiveQueueState();s.switchTo('claude:conversation:a',{paused:true,items:[q('a')]});assert.equal(s.paused,true);assert.deepEqual(s.storageValue(),{paused:true,items:[q('a')]});s.setPaused(false);assert.equal(s.paused,false);});
test('durable capture clears only after persistence succeeds',async()=>{const s=new controller.ActiveQueueState();s.switchTo('grok:tab:1',{paused:false,items:[]});const calls=[];await controller.captureQueuedMessage({state:s,text:'hello',persist:async()=>calls.push('persist'),clearComposer:()=>calls.push('clear'),now:()=>1,idFactory:()=> 'id'});assert.deepEqual(calls,['persist','clear']);assert.deepEqual(s.queue,[{id:'id',text:'hello',createdAt:1}]);});
test('durable capture rolls back and does not clear on persistence failure',async()=>{const s=new controller.ActiveQueueState();s.switchTo('grok:tab:1',{paused:false,items:[q('old')]});let cleared=false;await assert.rejects(()=>controller.captureQueuedMessage({state:s,text:'hello',persist:async()=>{throw new Error('fail')},clearComposer:()=>{cleared=true},now:()=>1,idFactory:()=> 'id'}));assert.equal(cleared,false);assert.deepEqual(s.queue,[q('old')]);});
test('queue enable and paused state are included in dispatch gate decision helper',()=>{assert.equal(controller.canAutoDispatch({enabled:false,paused:false,busy:false,sendReady:true,queueLength:1,dispatching:false,awaitingBusy:false}),false);assert.equal(controller.canAutoDispatch({enabled:true,paused:true,busy:false,sendReady:true,queueLength:1,dispatching:false,awaitingBusy:false}),false);assert.equal(controller.canAutoDispatch({enabled:true,paused:false,busy:false,sendReady:true,queueLength:1,dispatching:false,awaitingBusy:false}),true);});
test('coordinator migrates ChatGPT legacy array to state object but Claude does not claim it',async()=>{const data={'cgptMessageQueue:conversation:a':[q('legacy')]};const storage={async get(keys){return Object.fromEntries(keys.filter(k=>k in data).map(k=>[k,data[k]]));},async set(v){Object.assign(data,v);},async remove(k){delete data[k];}};const s=new controller.ActiveQueueState();const c=new controller.QueueScopeCoordinator({storageApi:storage,state:s});await c.switchTo('chatgpt:conversation:a');assert.deepEqual(data['cgptMessageQueue:chatgpt:conversation:a'],{paused:false,items:[q('legacy')]});assert.equal('cgptMessageQueue:conversation:a' in data,false);const s2=new controller.ActiveQueueState();const c2=new controller.QueueScopeCoordinator({storageApi:storage,state:s2});await c2.switchTo('claude:conversation:a');assert.deepEqual(s2.queue,[]);});

test('handleQueueShortcut queues an idle empty-queue prompt instead of sending directly', async () => {
  const state = new controller.ActiveQueueState();
  state.switchTo('chatgpt:conversation:a', { paused: false, items: [] });
  const calls = [];
  const provider = {
    getComposerText(){ return 'hello'; },
    findSendButton(){ throw new Error('queue shortcut must not send directly'); },
    setComposerText(_composer, text){ if (text === '') calls.push('clear'); },
  };
  const event = { preventDefault(){calls.push('prevent');}, stopImmediatePropagation(){calls.push('stop');} };
  const result = await controller.handleQueueShortcut({ provider, state, composer:{}, event, persist:async()=>calls.push('persist'), enabled:true, now:()=>1, idFactory:()=> 'q0' });
  assert.equal(result, 'queued');
  assert.deepEqual(calls, ['prevent','stop','persist','clear']);
  assert.deepEqual(state.queue, [{id:'q0',text:'hello',createdAt:1}]);
});

test('handleQueueShortcut passes through without interception when queue is disabled', async () => {
  const state = new controller.ActiveQueueState();
  state.switchTo('chatgpt:conversation:a', { paused: false, items: [] });
  const calls = [];
  const provider = {
    getComposerText(){ return 'hello'; },
    setComposerText(){ calls.push('clear'); },
  };
  const event = { preventDefault(){calls.push('prevent');}, stopImmediatePropagation(){calls.push('stop');} };
  const result = await controller.handleQueueShortcut({ provider, state, composer:{}, event, persist:async()=>calls.push('persist'), enabled:false });
  assert.equal(result, 'ignored');
  assert.deepEqual(calls, []);
  assert.deepEqual(state.queue, []);
});

test('handleQueueShortcut queues during generation and clears only after persistence', async () => {
  const state = new controller.ActiveQueueState();
  state.switchTo('claude:conversation:a', { paused: false, items: [] });
  const calls = [];
  const provider = {
    getComposerText(){ return 'hello'; },
    findStopButton(){ return {}; },
    findSendButton(){ throw new Error('should not send directly'); },
    setComposerText(_composer, text){ if (text === '') calls.push('clear'); },
  };
  const event = { preventDefault(){calls.push('prevent');}, stopImmediatePropagation(){calls.push('stop');} };
  const result = await controller.handleQueueShortcut({ provider, state, composer:{}, event, persist:async()=>calls.push('persist'), now:()=>1, idFactory:()=> 'q1' });
  assert.equal(result, 'queued');
  assert.deepEqual(calls, ['prevent','stop','persist','clear']);
  assert.deepEqual(state.queue, [{id:'q1',text:'hello',createdAt:1}]);
});

test('handleQueueShortcut preserves composer and queue when persistence fails', async () => {
  const state = new controller.ActiveQueueState();
  state.switchTo('grok:conversation:a', { paused: false, items:[{id:'old',text:'old',createdAt:1}] });
  let cleared = false;
  const provider = {
    getComposerText(){ return 'hello'; },
    findStopButton(){ return null; },
    setComposerText(){ cleared = true; },
  };
  const event = { preventDefault(){}, stopImmediatePropagation(){} };
  const result = await controller.handleQueueShortcut({ provider, state, composer:{}, event, persist:async()=>{throw new Error('disk');}, now:()=>2, idFactory:()=> 'q2' });
  assert.equal(result, 'failed');
  assert.equal(cleared, false);
  assert.deepEqual(state.queue, [{id:'old',text:'old',createdAt:1}]);
});

test('updatePausedState persists and rolls back when storage fails', async () => {
  const state = new controller.ActiveQueueState();
  state.switchTo('grok:conversation:a', { paused:false, items:[{id:'q',text:'q',createdAt:1}] });
  const calls=[];
  await controller.updatePausedState({ state, paused:true, persist:async()=>calls.push(state.paused) });
  assert.equal(state.paused, true);
  assert.deepEqual(calls, [true]);
  await assert.rejects(() => controller.updatePausedState({ state, paused:false, persist:async()=>{throw new Error('disk');} }));
  assert.equal(state.paused, true);
});

test('DispatchGate sends exactly one item across a busy then idle response cycle', () => {
  const gate = new controller.DispatchGate();
  const ready = { enabled:true, paused:false, busy:false, sendReady:true, queueLength:2 };
  gate.observeBusy(false); assert.equal(gate.shouldDispatch(ready), true);
  gate.beginDispatch(); assert.equal(gate.shouldDispatch(ready), false);
  gate.finishDispatch(true); assert.equal(gate.shouldDispatch(ready), false);
  gate.observeBusy(true); assert.equal(gate.shouldDispatch({ ...ready, busy:true }), false);
  gate.observeBusy(false); assert.equal(gate.shouldDispatch(ready), true);
});

test('DispatchGate releases a failed dispatch so the same queue item can retry', () => {
  const gate = new controller.DispatchGate();
  const ready = { enabled:true, paused:false, busy:false, sendReady:true, queueLength:1 };
  gate.beginDispatch(); gate.finishDispatch(false);
  assert.equal(gate.shouldDispatch(ready), true);
});

test('requestTabId asks the service worker for the sender tab id', async () => {
  const calls = [];
  const runtime = { lastError:null, sendMessage(message, callback) { calls.push(message); callback({ tabId:77 }); } };
  assert.equal(await controller.requestTabId(runtime), 77);
  assert.deepEqual(calls, [{ type:'aichat:get-tab-id' }]);
});

test('neutral DOM helpers preserve textarea/contenteditable and send-attempt semantics', () => {
  const dom = require('../src/queue/dom.js');
  assert.equal(dom.getComposerText({tagName:'TEXTAREA',value:'draft'}), 'draft');
  assert.equal(dom.getComposerText({tagName:'DIV',isContentEditable:true,innerText:'editable draft',textContent:'fallback'}), 'editable draft');
  const win={getComputedStyle:()=>({display:'block',visibility:'visible',pointerEvents:'auto'})};
  const visible={isConnected:true,getBoundingClientRect:()=>({width:10,height:10})};
  assert.equal(dom.isElementVisible(visible, win), true);
  const button={...visible,disabled:false,getAttribute:()=>null};
  assert.equal(dom.isButtonReady(button, win), true);
  assert.equal(dom.classifySendAttempt({busy:true,composerText:'queued',queuedText:'queued',sendReady:true}), 'accepted');
  assert.equal(dom.classifySendAttempt({busy:false,composerText:'',queuedText:'queued',sendReady:false}), 'accepted');
  assert.equal(dom.classifySendAttempt({busy:false,composerText:'user draft',queuedText:'queued',sendReady:true}), 'interrupted');
  assert.equal(dom.canPrepareQueuedSend({busy:false,composerText:'',hasAttachments:false}), true);
  assert.equal(dom.canPrepareQueuedSend({busy:true,composerText:'',hasAttachments:false}), false);
});
