const test = require('node:test');
const assert = require('node:assert/strict');
const batchDom = require('../src/batch/dom.js');
const { BatchController } = require('../src/batch/controller.js');

function element(name) {
  return {
    nodeType: 1,
    nodeName: name.toUpperCase(),
    attrs: {},
    children: [],
    listeners: {},
    parentElement: null,
    ownerDocument: null,
    textContent: '',
    setAttribute(key, value) { this.attrs[key] = String(value); },
    getAttribute(key) { return this.attrs[key] ?? null; },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
    remove() {
      if (!this.parentElement) return;
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    },
    matches(selector) {
      if (selector.includes('[data-ai-chatweb-batch-toast')) return this.attrs['data-ai-chatweb-batch-toast'] === 'true';
      return false;
    },
    closest(selector) {
      let node = this;
      while (node) {
        if (node.matches?.(selector)) return node;
        node = node.parentElement;
      }
      return null;
    },
  };
}

function fakeDocument() {
  const timers = [];
  const doc = { body: null, createElement: null, defaultView: null };
  doc.defaultView = {
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
  };
  doc.createElement = (name) => {
    const node = element(name);
    node.ownerDocument = doc;
    return node;
  };
  doc.body = doc.createElement('body');
  return { doc, timers };
}

function findByAttr(root, attr) {
  if (root?.attrs?.[attr] != null) return root;
  for (const child of root?.children || []) {
    const found = findByAttr(child, attr);
    if (found) return found;
  }
  return null;
}

function row(id) {
  return {
    id,
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
  };
}

function controllerHarness({ failIds = [], confirmed = true } = {}) {
  const rows = [row('a'), row('b')];
  const section = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    addEventListener() {},
    removeEventListener() {},
  };
  const controls = { setAttribute() {}, replaceChildren() {} };
  const toastCalls = [];
  const adapter = {
    supportsArchive: true,
    findConversationSection: () => section,
    findConversationHeader: () => ({}),
    listConversationRows: () => rows,
    getConversationId: (item) => item.id,
    getNativeButtonTemplate: () => null,
    archiveConversation: async (id) => { if (failIds.includes(id)) throw new Error('fail'); },
    deleteConversation: async (id) => { if (failIds.includes(id)) throw new Error('fail'); },
  };
  const domApi = {
    SELECT_ATTR: 'data-ai-chatweb-batch-select',
    ensureControlContainer: () => controls,
    createIconButton(_doc, options) { return { disabled: false, click: options.onClick }; },
    decorateRow(_doc, item, options) { item.onToggle = options.onToggle; },
    setRowSelected() {},
    cleanupRows() {},
    removeRow() {},
    showToast(_doc, options) { toastCalls.push(options); },
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
    confirm: async () => confirmed,
    fetch: win.fetch,
    logger: { warn() {} },
  });
  return { controller, rows, toastCalls };
}

test('showToast renders a bottom-right status message and removes it after five seconds', () => {
  const { doc, timers } = fakeDocument();
  const toast = batchDom.showToast(doc, { action: 'delete', succeeded: 4, failed: 0, providerId: 'claude' });
  assert.ok(toast);
  assert.equal(toast.attrs['data-ai-chatweb-batch-toast'], 'true');
  assert.equal(toast.attrs['data-ai-chatweb-provider'], 'claude');
  assert.equal(toast.attrs.role, 'status');
  assert.equal(toast.attrs['aria-live'], 'polite');
  assert.equal(toast.textContent, 'Deleted 4 chats');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 5000);
  assert.equal(findByAttr(doc.body, 'data-ai-chatweb-batch-toast'), toast);
  timers[0].callback();
  assert.equal(findByAttr(doc.body, 'data-ai-chatweb-batch-toast'), null);
});

test('showToast summarizes partial and total failures', () => {
  const partial = fakeDocument();
  const partialToast = batchDom.showToast(partial.doc, { action: 'archive', succeeded: 3, failed: 1, providerId: 'chatgpt' });
  assert.equal(partialToast.textContent, 'Archived 3 chats · 1 failed');

  const failed = fakeDocument();
  const failedToast = batchDom.showToast(failed.doc, { action: 'delete', succeeded: 0, failed: 2, providerId: 'grok' });
  assert.equal(failedToast.textContent, 'Delete failed for 2 chats');
});

test('completed batch action emits one five-second toast with result counts', async () => {
  const { controller, rows, toastCalls } = controllerHarness({ failIds: ['b'] });
  controller.reconcile();
  controller.enterSelectionMode();
  controller.toggleRow(rows[0]);
  controller.toggleRow(rows[1]);
  await controller.runAction('delete');
  assert.deepEqual(toastCalls, [{ action: 'delete', succeeded: 1, failed: 1, providerId: 'chatgpt', durationMs: 5000 }]);
});

test('cancelled batch action emits no toast', async () => {
  const { controller, rows, toastCalls } = controllerHarness({ confirmed: false });
  controller.reconcile();
  controller.enterSelectionMode();
  controller.toggleRow(rows[0]);
  await controller.runAction('delete');
  assert.deepEqual(toastCalls, []);
});

test('toast nodes are extension-owned for mutation reconciliation', () => {
  const node = element('div');
  node.setAttribute('data-ai-chatweb-batch-toast', 'true');
  assert.equal(batchDom.mutationIsExtensionOnly({ target: node, addedNodes: [], removedNodes: [] }), true);
});
