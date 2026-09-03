const test = require('node:test');
const assert = require('node:assert/strict');
const { ActiveQueueState, clearQueuedItems } = require('../src/queue/controller.js');

function withQueue(items) {
  const state = new ActiveQueueState();
  state.setQueue(items);
  return state;
}

test('clearQueuedItems persists empty queue before attachment cleanup', async () => {
  const state = withQueue([
    { id:'a', text:'one', attachments:[{ id:'blob-a', name:'a.png', type:'image/png', size:1 }] },
    { id:'b', text:'two' },
  ]);
  const order = [];
  const result = await clearQueuedItems({
    state,
    persist: async () => order.push(['persist', state.queue.length]),
    deleteAttachments: async (items) => order.push(['delete', items.map((item) => item.id)]),
  });
  assert.deepEqual(result, { cleared:true, count:2 });
  assert.deepEqual(state.queue, []);
  assert.deepEqual(order, [['persist', 0], ['delete', ['blob-a']]]);
});

test('clearQueuedItems restores queue and does not delete attachments when persistence fails', async () => {
  const original = [{ id:'a', text:'one', attachments:[{ id:'blob-a', name:'a.png', type:'image/png', size:1 }] }];
  const state = withQueue(original);
  let deletes = 0;
  await assert.rejects(clearQueuedItems({
    state,
    persist: async () => { throw new Error('storage failed'); },
    deleteAttachments: async () => { deletes += 1; },
  }), /storage failed/);
  assert.deepEqual(state.queue, original);
  assert.equal(deletes, 0);
});
