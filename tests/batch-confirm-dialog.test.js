const test = require('node:test');
const assert = require('node:assert/strict');
const batchDom = require('../src/batch/dom.js');

function element(name) {
  return {
    nodeName: name.toUpperCase(),
    attrs: {},
    children: [],
    listeners: {},
    parentElement: null,
    ownerDocument: null,
    textContent: '',
    open: false,
    setAttribute(key, value) { this.attrs[key] = String(value); },
    getAttribute(key) { return this.attrs[key] ?? null; },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
    remove() {
      if (!this.parentElement) return;
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    },
    showModal() { this.open = true; },
    close() { this.open = false; },
    focus() {},
    matches(selector) {
      if (selector.includes('[data-ai-chatweb-batch-dialog')) return this.attrs['data-ai-chatweb-batch-dialog'] === 'true';
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
  const doc = { body: null, createElement: null };
  doc.createElement = (name) => {
    const node = element(name);
    node.ownerDocument = doc;
    return node;
  };
  doc.body = doc.createElement('body');
  return doc;
}

function findByAttr(root, attr) {
  if (root?.attrs?.[attr] != null) return root;
  for (const child of root?.children || []) {
    const found = findByAttr(child, attr);
    if (found) return found;
  }
  return null;
}

function click(node) {
  const handlers = node?.listeners?.click || [];
  for (const handler of handlers) handler({ target: node, preventDefault() {}, stopPropagation() {} });
}

test('shared confirmation dialog renders provider-aware delete copy and resolves cancel', async () => {
  const doc = fakeDocument();
  const pending = batchDom.confirmAction(doc, { action: 'delete', count: 3, providerId: 'chatgpt' });
  const dialog = findByAttr(doc.body, 'data-ai-chatweb-batch-dialog');
  assert.ok(dialog);
  assert.equal(dialog.attrs['data-ai-chatweb-provider'], 'chatgpt');
  assert.equal(dialog.open, true);

  const title = findByAttr(dialog, 'data-ai-chatweb-batch-dialog-title');
  const message = findByAttr(dialog, 'data-ai-chatweb-batch-dialog-message');
  const cancel = findByAttr(dialog, 'data-ai-chatweb-batch-dialog-cancel');
  assert.equal(title.textContent, 'Delete selected chats?');
  assert.equal(message.textContent, 'This will delete 3 selected chats.');

  click(cancel);
  assert.equal(await pending, false);
  assert.equal(findByAttr(doc.body, 'data-ai-chatweb-batch-dialog'), null);
});

test('shared confirmation dialog resolves destructive confirmation', async () => {
  const doc = fakeDocument();
  const pending = batchDom.confirmAction(doc, { action: 'delete', count: 1, providerId: 'grok' });
  const dialog = findByAttr(doc.body, 'data-ai-chatweb-batch-dialog');
  const confirm = findByAttr(dialog, 'data-ai-chatweb-batch-dialog-confirm');
  assert.equal(confirm.textContent, 'Delete');
  assert.equal(confirm.attrs['data-action'], 'delete');

  click(confirm);
  assert.equal(await pending, true);
});

test('archive confirmation uses archive-specific copy', async () => {
  const doc = fakeDocument();
  const pending = batchDom.confirmAction(doc, { action: 'archive', count: 2, providerId: 'chatgpt' });
  const dialog = findByAttr(doc.body, 'data-ai-chatweb-batch-dialog');
  assert.equal(findByAttr(dialog, 'data-ai-chatweb-batch-dialog-title').textContent, 'Archive selected chats?');
  assert.equal(findByAttr(dialog, 'data-ai-chatweb-batch-dialog-message').textContent, 'This will archive 2 selected chats.');
  const confirm = findByAttr(dialog, 'data-ai-chatweb-batch-dialog-confirm');
  assert.equal(confirm.textContent, 'Archive');
  click(confirm);
  assert.equal(await pending, true);
});
