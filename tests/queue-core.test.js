const test=require('node:test');const assert=require('node:assert/strict');const core=require('../src/queue/core.js');
const q=(id,text=id)=>({id,text,createdAt:1});
test('normalizes queue items',()=>assert.deepEqual(core.normalizeQueue([q('a',' A '),{id:'',text:'x',createdAt:1}]),[q('a','A')]));
test('normalizes legacy array and state object queue persistence',()=>{
  assert.deepEqual(core.normalizeQueueState([q('a')]),{paused:false,items:[q('a')]});
  assert.deepEqual(core.normalizeQueueState({paused:true,items:[q('a')]}),{paused:true,items:[q('a')]});
  assert.deepEqual(core.normalizeQueueState(null),{paused:false,items:[]});
});
test('shortcut normalization remains shared',()=>{assert.equal(core.normalizeShortcut('alt-enter'),'alt-enter');assert.equal(core.normalizeShortcut('wat'),'ctrl-enter');});
test('dispatch helper remains unchanged',()=>{assert.equal(core.canDispatch({busy:false,sendReady:true,queueLength:1,dispatching:false,awaitingBusy:false}),true);assert.equal(core.canDispatch({busy:true,sendReady:true,queueLength:1,dispatching:false,awaitingBusy:false}),false);});
test('undo record has five-second expiry',()=>{const r=core.createUndoRecord(q('a'),0,1000);assert.equal(r.expiresAt,6000);assert.equal(core.canUndo(r,5999),true);assert.equal(core.canUndo(r,6000),false);});

test('createQueueItem trims text and uses supplied clock/id factory', () => {
  assert.deepEqual(core.createQueueItem('  queued message  ', () => 1234, () => 'q-1'), { id: 'q-1', text: 'queued message', createdAt: 1234 });
});

test('reorderQueue moves without mutating and clamps destinations', () => {
  const queue = [q('a'), q('b'), q('c')];
  assert.deepEqual(core.reorderQueue(queue, 2, 0).map((item) => item.id), ['c','a','b']);
  assert.deepEqual(queue.map((item) => item.id), ['a','b','c']);
  assert.deepEqual(core.reorderQueue(queue, 0, 99).map((item) => item.id), ['b','c','a']);
  assert.deepEqual(core.reorderQueue(queue, 8, 0), queue);
});

test('matchesQueueShortcut requires the exact configured modifier', () => {
  const base = { key:'Enter', shiftKey:false, metaKey:false };
  assert.equal(core.matchesQueueShortcut({ ...base, ctrlKey:true, altKey:false }, 'ctrl-enter'), true);
  assert.equal(core.matchesQueueShortcut({ ...base, ctrlKey:true, altKey:true }, 'ctrl-enter'), false);
  assert.equal(core.matchesQueueShortcut({ ...base, ctrlKey:false, altKey:true }, 'alt-enter'), true);
  assert.equal(core.matchesQueueShortcut({ ...base, ctrlKey:true, altKey:true }, 'alt-enter'), false);
});
