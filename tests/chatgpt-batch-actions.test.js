const test = require('node:test');
const assert = require('node:assert/strict');
const backgroundBatch = require('../src/background/chatgpt-batch-actions.js');
const chatgpt = require('../src/providers/chatgpt.js');
const { BatchController } = require('../src/batch/controller.js');

function response({ ok = true, status = 200 } = {}) { return { ok, status }; }
function chromeWithAuth(tabId = 7) {
  const key = backgroundBatch.authKeyForTab(tabId);
  return {
    storage: {
      session: {
        async get(requested) {
          assert.equal(requested, key);
          return { [key]: { authorization: 'Bearer captured-token', chatgptAccountId: 'account-1' } };
        },
      },
    },
  };
}

test('service worker starts every ChatGPT archive request before waiting for any response', async () => {
  const started = [];
  const releases = [];
  const fetchFn = (url, options) => {
    started.push({ url, options });
    return new Promise((resolve) => releases.push(() => resolve(response())));
  };

  const pending = backgroundBatch.runBatchMutation(chromeWithAuth(), 7, 'archive', ['a', 'b', 'c'], fetchFn);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(started.map((call) => call.url), [
    'https://chatgpt.com/backend-api/conversation/a',
    'https://chatgpt.com/backend-api/conversation/b',
    'https://chatgpt.com/backend-api/conversation/c',
  ]);
  assert.equal(releases.length, 3);
  for (const call of started) {
    assert.equal(call.options.method, 'PATCH');
    assert.equal(call.options.credentials, 'include');
    assert.equal(call.options.headers.Authorization, 'Bearer captured-token');
    assert.equal(call.options.headers['ChatGPT-Account-Id'], 'account-1');
    assert.equal(call.options.headers['Content-Type'], 'application/json');
    assert.equal(call.options.body, JSON.stringify({ is_archived: true }));
  }

  releases.forEach((release) => release());
  assert.deepEqual(await pending, { succeeded: ['a', 'b', 'c'], failed: [] });
});

test('service worker returns per-conversation delete failures without cancelling siblings', async () => {
  const calls = [];
  const result = await backgroundBatch.runBatchMutation(chromeWithAuth(), 7, 'delete', ['ok', 'bad'], async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/bad') ? response({ ok: false, status: 429 }) : response();
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.body, JSON.stringify({ is_visible: false }));
  assert.deepEqual(result.succeeded, ['ok']);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].id, 'bad');
  assert.match(result.failed[0].error, /429/);
});

test('service worker reports every id as failed when captured authorization is unavailable', async () => {
  let fetchCalls = 0;
  const chromeApi = { storage: { session: { async get() { return {}; } } } };
  const result = await backgroundBatch.runBatchMutation(chromeApi, 7, 'delete', ['a', 'b'], async () => { fetchCalls += 1; return response(); });
  assert.equal(fetchCalls, 0);
  assert.deepEqual(result.succeeded, []);
  assert.deepEqual(result.failed.map((entry) => entry.id), ['a', 'b']);
  assert.match(result.failed[0].error, /authorization unavailable/i);
});

test('service worker uses fresh page authorization when captured authorization is unavailable', async () => {
  const chromeApi = { storage: { session: { async get() { return {}; } } } };
  const calls = [];
  const result = await backgroundBatch.runBatchMutation(
    chromeApi,
    7,
    'delete',
    ['a', 'b'],
    async (url, options) => { calls.push({ url, options }); return response(); },
    { authorization: 'Bearer fresh-token', chatgptAccountId: 'account-current' },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fresh-token');
  assert.equal(calls[0].options.headers['ChatGPT-Account-Id'], 'account-current');
  assert.deepEqual(result, { succeeded: ['a', 'b'], failed: [] });
});

test('runtime listener keeps the message channel open and returns the parallel result', async () => {
  const listeners = [];
  const chromeApi = chromeWithAuth(9);
  chromeApi.runtime = { onMessage: { addListener(fn) { listeners.push(fn); } } };
  const calls = [];
  assert.equal(backgroundBatch.installChatGptBatchActions(chromeApi, async (url) => { calls.push(url); return response(); }), true);
  assert.equal(listeners.length, 1);

  const reply = new Promise((resolve) => {
    const keepAlive = listeners[0]({ type: backgroundBatch.MESSAGE_TYPE, action: 'delete', ids: ['x', 'y'] }, { tab: { id: 9 } }, resolve);
    assert.equal(keepAlive, true);
  });
  assert.deepEqual(await reply, { succeeded: ['x', 'y'], failed: [] });
  assert.equal(calls.length, 2);
});

test('ChatGPT provider sends one runtime message containing the entire batch and fresh auth', async () => {
  const messages = [];
  const runtime = {
    lastError: null,
    sendMessage(message, callback) {
      messages.push(message);
      callback({ succeeded: ['a', 'b', 'c'], failed: [] });
    },
  };
  const result = await chatgpt.batch.runBatchAction('archive', ['a', 'b', 'c'], {
    runtime,
    authHeaders: { authorization: 'Bearer fresh-token', 'chatgpt-account-id': 'account-current' },
  });
  assert.deepEqual(messages, [{
    type: backgroundBatch.MESSAGE_TYPE,
    action: 'archive',
    ids: ['a', 'b', 'c'],
    auth: { authorization: 'Bearer fresh-token', chatgptAccountId: 'account-current' },
  }]);
  assert.deepEqual(result, { succeeded: ['a', 'b', 'c'], failed: [] });
});

test('ChatGPT provider treats missing runtime results as failures instead of silently dropping ids', async () => {
  const runtime = {
    lastError: null,
    sendMessage(_message, callback) { callback({ succeeded: ['a'], failed: [] }); },
  };
  const result = await chatgpt.batch.runBatchAction('delete', ['a', 'b'], { runtime });
  assert.deepEqual(result.succeeded, ['a']);
  assert.deepEqual(result.failed.map((entry) => entry.id), ['b']);
});

function makeControllerHarness({ runBatchAction }) {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const section = { addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {} };
  const adapter = {
    supportsArchive: true,
    findConversationSection: () => section,
    findConversationHeader: () => ({}),
    listConversationRows: () => rows,
    getConversationId: (row) => row.id,
    getNativeButtonTemplate: () => null,
    archiveConversation: async () => { throw new Error('per-id archive path must not run'); },
    deleteConversation: async () => { throw new Error('per-id delete path must not run'); },
    runBatchAction,
  };
  const provider = { id: 'chatgpt', batch: adapter };
  const removed = [];
  const toasts = [];
  const domApi = {
    ensureControlContainer: () => null,
    cleanupRows() {},
    decorateRow() {},
    removeRow(row) { removed.push(row.id); },
    showToast(_doc, data) { toasts.push(data); },
  };
  const win = { location: { href: 'https://chatgpt.com/' }, chrome: { runtime: {} } };
  const controller = new BatchController({ win, doc: {}, registry: { getProvider: () => provider }, domApi, confirm: () => true, logger: { warn() {} } });
  controller.reconcile();
  controller.selectionMode = true;
  controller.selection = new Set(['a', 'b', 'c']);
  return { controller, removed, toasts };
}

test('batch controller invokes the adapter once instead of per-conversation mutations', async () => {
  const calls = [];
  const { controller, removed } = makeControllerHarness({
    runBatchAction: async (action, ids, context) => {
      calls.push({ action, ids: [...ids], runtime: context.runtime });
      return { succeeded: ['a', 'b', 'c'], failed: [] };
    },
  });

  const result = await controller.runAction('archive');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].ids, ['a', 'b', 'c']);
  assert.deepEqual(result, { succeeded: ['a', 'b', 'c'], failed: [] });
  assert.deepEqual(removed, ['a', 'b', 'c']);
});

test('batch controller recovers from runtime transport failure and leaves failed ids selected', async () => {
  const { controller, removed, toasts } = makeControllerHarness({
    runBatchAction: async () => { throw new Error('runtime disconnected'); },
  });

  const result = await controller.runAction('delete');
  assert.equal(controller.busy, false);
  assert.equal(result.succeeded.length, 0);
  assert.deepEqual(result.failed.map((entry) => entry.id), ['a', 'b', 'c']);
  assert.deepEqual([...controller.selection], ['a', 'b', 'c']);
  assert.deepEqual(removed, []);
  assert.equal(toasts.at(-1).succeeded, 0);
  assert.equal(toasts.at(-1).failed, 3);
});