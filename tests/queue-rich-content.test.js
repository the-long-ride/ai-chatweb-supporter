const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/queue/core.js');
const controller = require('../src/queue/controller.js');

const image = { id:'att-1', name:'one.png', type:'image/png', size:12, lastModified:7, kind:'image', chunkCount:1 };
const file = { id:'att-2', name:'notes.pdf', type:'application/pdf', size:50, lastModified:8, kind:'file', chunkCount:2 };

test('queue items can contain text plus many attachments', () => {
  const item = core.createQueueItem({ text:'  pasted\ntext  ', attachments:[image,file] }, () => 10, () => 'q1');
  assert.deepEqual(item, { id:'q1', text:'pasted\ntext', attachments:[image,file], createdAt:10 });
  assert.deepEqual(core.normalizeQueue([item]), [item]);
});

test('image-only queue items are valid and legacy text items stay backward compatible', () => {
  assert.deepEqual(core.createQueueItem({ text:'', attachments:[image] }, () => 2, () => 'q2'), {
    id:'q2', text:'', attachments:[image], createdAt:2,
  });
  assert.equal(core.createQueueItem({ text:'   ', attachments:[] }, () => 2, () => 'q3'), null);
  assert.deepEqual(core.normalizeQueue([{ id:'old', text:' hello ', createdAt:1 }]), [{ id:'old', text:'hello', createdAt:1 }]);
});

test('dispatch gate does not get stuck if busy happened before async scope migration completed', () => {
  const gate = new controller.DispatchGate();
  const ready = { enabled:true, paused:false, busy:false, sendReady:true, queueLength:1 };
  gate.beginDispatch();
  gate.observeBusy(true);
  gate.observeBusy(false);
  gate.finishDispatch(true);
  assert.equal(gate.awaitingBusy, false);
  assert.equal(gate.shouldDispatch(ready), true);
});
