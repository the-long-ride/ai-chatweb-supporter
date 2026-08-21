const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/queue/core.js');

function requireFunction(name) { assert.equal(typeof core[name], 'function', `${name} should be implemented`); }

test('normalizeQueue drops malformed entries and trims text', () => {
  requireFunction('normalizeQueue');
  const input = [
    { id: 'a', text: '  hello  ', createdAt: 10 },
    { id: '', text: 'bad id', createdAt: 10 },
    { id: 'b', text: '   ', createdAt: 10 },
    { id: 'c', text: 'world', createdAt: '10' }, null,
  ];
  assert.deepEqual(core.normalizeQueue(input), [{ id: 'a', text: 'hello', createdAt: 10 }]);
});

test('createQueueItem trims text and uses supplied clock/id factory', () => {
  requireFunction('createQueueItem');
  assert.deepEqual(core.createQueueItem('  queued message  ', () => 1234, () => 'q-1'), { id: 'q-1', text: 'queued message', createdAt: 1234 });
});

test('reorderQueue moves an item without mutating the original queue', () => {
  requireFunction('reorderQueue');
  const queue = [{ id:'a',text:'A',createdAt:1 },{ id:'b',text:'B',createdAt:2 },{ id:'c',text:'C',createdAt:3 }];
  const result = core.reorderQueue(queue, 2, 0);
  assert.deepEqual(result.map((item) => item.id), ['c','a','b']);
  assert.deepEqual(queue.map((item) => item.id), ['a','b','c']);
});

test('reorderQueue clamps destination indexes and ignores invalid sources', () => {
  const queue = [{ id:'a',text:'A',createdAt:1 },{ id:'b',text:'B',createdAt:2 }];
  assert.deepEqual(core.reorderQueue(queue,0,99).map((item)=>item.id), ['b','a']);
  assert.deepEqual(core.reorderQueue(queue,8,0), queue);
});

test('matchesQueueShortcut requires the configured exact modifier plus Enter', () => {
  const base = { key:'Enter', shiftKey:false, metaKey:false };
  assert.equal(core.matchesQueueShortcut({ ...base, ctrlKey:true, altKey:false }, 'ctrl-enter'), true);
  assert.equal(core.matchesQueueShortcut({ ...base, ctrlKey:true, altKey:true }, 'ctrl-enter'), false);
  assert.equal(core.matchesQueueShortcut({ ...base, ctrlKey:false, altKey:true }, 'alt-enter'), true);
  assert.equal(core.matchesQueueShortcut({ ...base, ctrlKey:true, altKey:true }, 'alt-enter'), false);
});

test('canDispatch permits only an idle ready unlocked queue', () => {
  const ready={busy:false,sendReady:true,queueLength:1,dispatching:false,awaitingBusy:false};
  assert.equal(core.canDispatch(ready),true);
  for (const patch of [{busy:true},{sendReady:false},{queueLength:0},{dispatching:true},{awaitingBusy:true}]) assert.equal(core.canDispatch({...ready,...patch}),false);
});

test('undo record is valid before 5 seconds and invalid at expiry', () => {
  const item={id:'a',text:'A',createdAt:1};
  const record=core.createUndoRecord(item,2,1000,5000);
  assert.equal(core.canUndo(record,5999),true);
  assert.equal(core.canUndo(record,6000),false);
});

test('normalizeShortcut accepts Alt+Enter and defaults everything else to Ctrl+Enter', () => {
  assert.equal(core.normalizeShortcut('alt-enter'),'alt-enter');
  assert.equal(core.normalizeShortcut('ctrl-enter'),'ctrl-enter');
  assert.equal(core.normalizeShortcut('invalid'),'ctrl-enter');
});
