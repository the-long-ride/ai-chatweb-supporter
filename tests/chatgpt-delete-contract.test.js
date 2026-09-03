const test = require('node:test');
const assert = require('node:assert/strict');
const chatgpt = require('../src/providers/chatgpt.js');

function response({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, async json() { return json; } };
}

test('ChatGPT delete uses the current soft-delete PATCH contract', async () => {
  const calls = [];
  const context = {
    document: { cookie: '_account=account-current' },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === '/api/auth/session') return response({ json: { accessToken: 'dynamic-token' } });
      return response();
    },
  };

  await chatgpt.batch.deleteConversation('def-456', context);

  const deletion = calls.find((call) => call.url === '/backend-api/conversation/def-456');
  assert.ok(deletion, 'expected PATCH request to the conversation endpoint');
  assert.equal(deletion.options.method, 'PATCH');
  assert.equal(deletion.options.credentials, 'include');
  assert.equal(deletion.options.headers.authorization, 'Bearer dynamic-token');
  assert.equal(deletion.options.headers['chatgpt-account-id'], 'account-current');
  assert.equal(deletion.options.headers['content-type'], 'application/json');
  assert.equal(deletion.options.body, JSON.stringify({ is_visible: false }));
});
