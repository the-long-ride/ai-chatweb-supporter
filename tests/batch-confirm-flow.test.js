const test = require('node:test');
const assert = require('node:assert/strict');
const { BatchController } = require('../src/batch/controller.js');

function row(id) {
  return {
    id,
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

function makeController(confirm) {
  const rows = [row('a')];
  const section = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    addEventListener() {},
    removeEventListener() {},
  };
  const controls = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    replaceChildren() {},
  };
  const calls = [];
  const adapter = {
    supportsArchive: true,
    findConversationSection: () => section,
    findConversationHeader: () => ({}),
    listConversationRows: () => rows,
    getConversationId: (item) => item.id,
    getNativeButtonTemplate: () => null,
    archiveConversation: async (id) => { calls.push(['archive', id]); },
    deleteConversation: async (id) => { calls.push(['delete', id]); },
  };
  const domApi = {
    SELECT_ATTR: 'data-ai-chatweb-batch-select',
    ensureControlContainer: () => controls,
    createIconButton(_doc, options) { return { disabled: false, click: options.onClick }; },
    decorateRow(_doc, item, options) { item.onToggle = options.onToggle; },
    setRowSelected() {},
    cleanupRows() {},
    removeRow() {},
    mutationIsExtensionOnly() { return false; },
  };
  const win = {
    location: { href: 'https://chatgpt.com/' },
    fetch: async () => ({ ok: true }),
    requestAnimationFrame(callback) { callback(); return 1; },
    MutationObserver: class { observe() {} disconnect() {} },
  };
  const controller = new BatchController({
    win,
    doc: { body: {}, documentElement: {} },
    registry: { getProvider: () => ({ id: 'chatgpt', batch: adapter }) },
    domApi,
    confirm,
    fetch: win.fetch,
    logger: { warn() {} },
  });
  return { controller, rows, calls, controls };
}

test('runAction awaits asynchronous confirmation before provider mutation', async () => {
  const gate = deferred();
  const { controller, rows, calls } = makeController(() => gate.promise);
  controller.reconcile();
  controller.enterSelectionMode();
  controller.toggleRow(rows[0]);

  const pendingAction = controller.runAction('delete');
  await Promise.resolve();
  assert.deepEqual(calls, []);

  gate.resolve(true);
  await pendingAction;
  assert.deepEqual(calls, [['delete', 'a']]);
});

test('asynchronous cancellation performs zero provider mutations', async () => {
  const { controller, rows, calls } = makeController(async () => false);
  controller.reconcile();
  controller.enterSelectionMode();
  controller.toggleRow(rows[0]);

  await controller.runAction('archive');
  assert.deepEqual(calls, []);
  assert.deepEqual([...controller.selection], ['a']);
});
