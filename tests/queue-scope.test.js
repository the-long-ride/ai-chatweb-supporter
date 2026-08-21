const test = require('node:test');
const assert = require('node:assert/strict');

const scope = require('../src/queue/scope.js');

const q = (id, text = id) => ({ id, text, createdAt: 1 });

test('extractConversationId reads ChatGPT conversation IDs from /c/:id routes', () => {
  assert.equal(scope.extractConversationId('https://chatgpt.com/c/abc-123'), 'abc-123');
  assert.equal(scope.extractConversationId('https://chatgpt.com/g/gpt-x/c/xyz?model=auto'), 'xyz');
  assert.equal(scope.extractConversationId('https://chatgpt.com/'), null);
});

test('resolveScope prefers conversation id and falls back to real tab id', () => {
  assert.equal(scope.resolveScope('https://chatgpt.com/c/abc', 42), 'conversation:abc');
  assert.equal(scope.resolveScope('https://chatgpt.com/', 42), 'tab:42');
  assert.equal(scope.resolveScope('https://chatgpt.com/', null), null);
});

test('queueStorageKey isolates queues by conversation or tab scope', () => {
  assert.equal(scope.queueStorageKey('conversation:abc'), 'cgptMessageQueue:conversation:abc');
  assert.equal(scope.queueStorageKey('tab:42'), 'cgptMessageQueue:tab:42');
});

test('tab to conversation transition moves remaining queue and merges without duplicates', () => {
  const plan = scope.planScopeTransition({
    previousScope: 'tab:42',
    nextScope: 'conversation:abc',
    previousQueue: [q('tab-1'), q('same')],
    nextQueue: [q('conv-1'), q('same')],
  });

  assert.equal(plan.transfer, true);
  assert.equal(plan.removePrevious, true);
  assert.deepEqual(plan.queue.map((item) => item.id), ['conv-1', 'same', 'tab-1']);
});

test('conversation to conversation navigation never transfers the old queue', () => {
  const plan = scope.planScopeTransition({
    previousScope: 'conversation:a',
    nextScope: 'conversation:b',
    previousQueue: [q('a')],
    nextQueue: [q('b')],
  });

  assert.equal(plan.transfer, false);
  assert.equal(plan.removePrevious, false);
  assert.deepEqual(plan.queue.map((item) => item.id), ['b']);
});

test('legacy queue migrates only into an empty active scope', () => {
  assert.deepEqual(
    scope.planLegacyMigration({ scopedQueue: [], legacyQueue: [q('legacy')] }),
    { migrate: true, queue: [q('legacy')], removeLegacy: true }
  );
  assert.deepEqual(
    scope.planLegacyMigration({ scopedQueue: [q('scoped')], legacyQueue: [q('legacy')] }),
    { migrate: false, queue: [q('scoped')], removeLegacy: false }
  );
});

test('tab to conversation is a continuation scope but conversation navigation is not', () => {
  assert.equal(scope.isScopeContinuation('tab:42', 'conversation:abc'), true);
  assert.equal(scope.isScopeContinuation('conversation:a', 'conversation:b'), false);
  assert.equal(scope.isScopeContinuation('tab:42', 'tab:42'), false);
});
