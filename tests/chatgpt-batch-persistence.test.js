const test = require('node:test');
const assert = require('node:assert/strict');
const batch = require('../src/background/chatgpt-batch-actions.js');

function chromeWithAuth(tabId = 7, auth = { authorization: 'Bearer captured', chatgptAccountId: 'workspace-captured' }) {
  const key = batch.authKeyForTab(tabId);
  return {
    storage: {
      session: {
        async get(requested) {
          assert.equal(requested, key);
          return { [key]: auth };
        },
      },
    },
  };
}

test('HTTP 200 with success false is not reported as archived', async () => {
  const result = await batch.runBatchMutation(
    chromeWithAuth(),
    7,
    'archive',
    ['chat-a'],
    async () => ({
      ok: true,
      status: 200,
      async json() { return { success: false, detail: 'workspace mismatch' }; },
    }),
    { authorization: 'Bearer fresh', chatgptAccountId: 'workspace-wrong' },
  );

  assert.deepEqual(result.succeeded, []);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].id, 'chat-a');
  assert.match(result.failed[0].error, /workspace mismatch/);
});

test('captured active workspace id is preserved while fresh bearer token is used', async () => {
  const calls = [];
  const result = await batch.runBatchMutation(
    chromeWithAuth(),
    7,
    'archive',
    ['chat-a', 'chat-b'],
    async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, async json() { return { success: true }; } };
    },
    { authorization: 'Bearer fresh', chatgptAccountId: 'workspace-wrong' },
  );

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.headers.Authorization, 'Bearer fresh');
    assert.equal(call.options.headers['ChatGPT-Account-Id'], 'workspace-captured');
  }
  assert.deepEqual(result, { succeeded: ['chat-a', 'chat-b'], failed: [] });
});
