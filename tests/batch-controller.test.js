const test = require('node:test');
const assert = require('node:assert/strict');
const batchDom = require('../src/batch/dom.js');
const { BatchController } = require('../src/batch/controller.js');

function row(id) {
  return { id, attrs: {}, setAttribute(name, value) { this.attrs[name] = String(value); }, removeAttribute(name) { delete this.attrs[name]; } };
}

function harness({ supportsArchive = true, failIds = [], providerId = 'fake' } = {}) {
  const rows = [row('a'), row('b')];
  const section = { attrs: {}, setAttribute(name, value) { this.attrs[name] = String(value); }, removeAttribute(name) { delete this.attrs[name]; }, addEventListener() {}, removeEventListener() {} };
  const header = {};
  const calls = [];
  const controlContainer = { attrs: {}, setAttribute(name, value) { this.attrs[name] = String(value); }, replaceChildren(...children) { controls.splice(0, controls.length, ...children); } };
  const adapter = {
    supportsArchive,
    findConversationSection: () => section,
    findConversationHeader: () => header,
    listConversationRows: () => rows,
    getConversationId: (item) => item.id,
    getNativeButtonTemplate: () => null,
    archiveConversation: async (id) => { calls.push(['archive', id]); if (failIds.includes(id)) throw new Error('fail'); },
    deleteConversation: async (id) => { calls.push(['delete', id]); if (failIds.includes(id)) throw new Error('fail'); },
  };
  const provider = { id: providerId, batch: adapter };
  const controls = [];
  const removed = [];
  const domApi = {
    SELECT_ATTR: 'data-ai-chatweb-batch-select',
    ensureControlContainer() { return controlContainer; },
    createIconButton(_doc, options) { return { label: options.label, disabled: false, click: options.onClick }; },
    decorateRow(_doc, item, options) { item.decorated = true; item.selected = options.selected; item.onToggle = options.onToggle; },
    setRowSelected(item, selected) { item.selected = selected; },
    cleanupRows() { for (const item of rows) { item.decorated = false; item.selected = false; item.onToggle = null; } },
    removeRow(item) { removed.push(item.id); },
    mutationIsExtensionOnly() { return false; },
  };
  const win = { location: { href: 'https://example.test/' }, fetch: async () => ({ ok: true }), requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {}, MutationObserver: class { observe() {} disconnect() {} } };
  const doc = { body: {}, documentElement: {} };
  const controller = new BatchController({ win, doc, registry: { getProvider: () => provider }, domApi, confirm: () => true, fetch: win.fetch, logger: { warn() {} } });
  return { controller, rows, section, controls, calls, removed, controlContainer };
}

test('reconcile injects one normal-mode select control idempotently', () => {
  const { controller, controls } = harness();
  controller.reconcile();
  controller.reconcile();
  assert.deepEqual(controls.map((control) => control.label), ['Select conversations']);
});

test('reconcile tags controls with provider for provider-specific layout', () => {
  const { controller, controlContainer } = harness({ providerId: 'chatgpt' });
  controller.reconcile();
  assert.equal(controlContainer.attrs['data-ai-chatweb-provider'], 'chatgpt');
});

test('selection mode decorates rows and toggles selection without navigation state', () => {
  const { controller, rows, controls } = harness();
  controller.reconcile();
  controller.enterSelectionMode();
  assert.equal(rows.every((item) => item.decorated), true);
  controller.toggleRow(rows[0]);
  assert.deepEqual([...controller.selection], ['a']);
  assert.equal(rows[0].selected, true);
  assert.deepEqual(controls.map((control) => control.label), ['Archive selected', 'Delete selected', 'Cancel selection']);
});

test('row checkbox owns its click while section capture ignores checkbox targets', () => {
  const { controller, rows } = harness();
  controller.reconcile();
  controller.enterSelectionMode();
  assert.equal(typeof rows[0].onToggle, 'function');

  let prevented = false;
  let stopped = false;
  const control = {};
  controller.onSectionClick({
    target: {
      closest(selector) {
        if (selector === '[data-ai-chatweb-batch-select]') return control;
        if (selector === '[data-ai-chatweb-batch-row]') return rows[0];
        return null;
      },
    },
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
    stopImmediatePropagation() { stopped = true; },
  });

  assert.equal(controller.selection.size, 0);
  assert.equal(prevented, false);
  assert.equal(stopped, false);

  rows[0].onToggle();
  assert.deepEqual([...controller.selection], ['a']);
  assert.equal(rows[0].selected, true);
});

test('rejected confirmation performs zero provider mutations', async () => {
  const { controller, rows, calls } = harness();
  controller.confirm = async () => false;
  controller.reconcile();
  controller.enterSelectionMode();
  controller.toggleRow(rows[0]);
  await controller.runAction('delete');
  assert.deepEqual(calls, []);
  assert.deepEqual([...controller.selection], ['a']);
});

test('partial failures remove successful rows and retain failed ids selected', async () => {
  const { controller, rows, removed } = harness({ failIds: ['b'] });
  controller.reconcile();
  controller.enterSelectionMode();
  controller.toggleRow(rows[0]);
  controller.toggleRow(rows[1]);
  await controller.runAction('delete');
  assert.deepEqual(removed, ['a']);
  assert.deepEqual([...controller.selection], ['b']);
  assert.equal(controller.selectionMode, true);
});

test('successful batch exits selection mode and clears selection', async () => {
  const { controller, rows } = harness();
  controller.reconcile();
  controller.enterSelectionMode();
  controller.toggleRow(rows[0]);
  await controller.runAction('archive');
  assert.equal(controller.selectionMode, false);
  assert.equal(controller.selection.size, 0);
});

test('Claude/Grok-style adapters omit archive control', () => {
  const { controller, controls } = harness({ supportsArchive: false });
  controller.reconcile();
  controller.enterSelectionMode();
  assert.deepEqual(controls.map((control) => control.label), ['Delete selected', 'Cancel selection']);
});

test('DOM selected-state helper only touches extension-owned attributes', () => {
  const item = row('x');
  batchDom.setRowSelected(item, true);
  assert.equal(item.attrs['data-ai-chatweb-batch-selected'], 'true');
  batchDom.setRowSelected(item, false);
  assert.equal(item.attrs['data-ai-chatweb-batch-selected'], 'false');
});

test('batch header controls preserve native visibility and do not impose icon padding', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/batch/styles.css'), 'utf8');
  const genericControlBlock = css.match(/\[data-ai-chatweb-batch-control="true"\]\s*\{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(genericControlBlock, /opacity:\s*1\s*!important/);
  assert.doesNotMatch(genericControlBlock, /visibility:\s*visible\s*!important/);
  const iconBlock = css.match(/\[data-ai-chatweb-batch-control="true"\]\s+svg\s*\{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(iconBlock, /padding:/);
  assert.match(iconBlock, /pointer-events:\s*none/);
});
