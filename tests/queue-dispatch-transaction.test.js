const test = require('node:test');
const assert = require('node:assert/strict');
const {
  stageQueuedItemForDispatch,
  restoreQueuedItemAfterFailedSend,
  isQueueSupportedHostname,
} = require('../src/queue/controller.js');

function makeState(items) {
  return {
    queue: items.slice(),
    setQueue(next) { this.queue = next.slice(); return this.queue; },
  };
}

test('queued item is removed before persistence resolves', async () => {
  const state = makeState([
    { id: 'a', text: 'first', createdAt: 1 },
    { id: 'b', text: 'second', createdAt: 2 },
  ]);
  let persistedSnapshot = null;
  const record = await stageQueuedItemForDispatch({
    state,
    itemId: 'a',
    persist: async () => { persistedSnapshot = state.queue.map((item) => item.id); },
  });

  assert.deepEqual(persistedSnapshot, ['b']);
  assert.deepEqual(state.queue.map((item) => item.id), ['b']);
  assert.equal(record.item.id, 'a');
  assert.equal(record.index, 0);
});

test('failed pre-send persistence restores the queue', async () => {
  const state = makeState([
    { id: 'a', text: 'first', createdAt: 1 },
    { id: 'b', text: 'second', createdAt: 2 },
  ]);

  await assert.rejects(() => stageQueuedItemForDispatch({
    state,
    itemId: 'a',
    persist: async () => { throw new Error('storage failed'); },
  }));
  assert.deepEqual(state.queue.map((item) => item.id), ['a', 'b']);
});

test('failed send restores item at its original index and persists it', async () => {
  const state = makeState([
    { id: 'b', text: 'second', createdAt: 2 },
    { id: 'c', text: 'third', createdAt: 3 },
  ]);
  const record = { item: { id: 'a', text: 'first', createdAt: 1 }, index: 0 };
  let persistCount = 0;
  await restoreQueuedItemAfterFailedSend({
    state,
    record,
    persist: async () => { persistCount += 1; },
  });
  assert.deepEqual(state.queue.map((item) => item.id), ['a', 'b', 'c']);
  assert.equal(persistCount, 1);
});

test('Grok is explicitly excluded from extension queue runtime', () => {
  assert.equal(isQueueSupportedHostname('chatgpt.com'), true);
  assert.equal(isQueueSupportedHostname('claude.ai'), true);
  assert.equal(isQueueSupportedHostname('grok.com'), false);
  assert.equal(isQueueSupportedHostname('www.grok.com'), false);
});
