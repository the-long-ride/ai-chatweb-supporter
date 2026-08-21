const test = require('node:test');
const assert = require('node:assert/strict');
const sidebar = require('../src/sidebar/core.js');
const dom = require('../src/sidebar/dom.js');
const controller = require('../src/sidebar/controller.js');
const constants = require('../src/shared/constants.js');

const goodMetrics = {
  visible: true,
  left: 0,
  right: 320,
  width: 320,
  heightRatio: 0.9,
  widthRatio: 0.25,
  semanticHint: true,
  containsNavigation: true,
  isBodyLike: false,
};

test('sidebar width rules are preserved', () => {
  assert.equal(sidebar.MIN_WIDTH, 220);
  assert.equal(sidebar.MAX_WIDTH, 700);
  assert.equal(sidebar.clampWidth(100), 220);
  assert.equal(sidebar.clampWidth(400), 400);
  assert.equal(sidebar.clampWidth(900), 700);
  assert.equal(sidebar.parseStoredWidth(400), 400);
  assert.equal(sidebar.parseStoredWidth(100), null);
  assert.equal(sidebar.parseStoredWidth(701), null);
});

test('sidebar scoring favors a visible left navigation rail', () => {
  assert.ok(sidebar.scoreSidebarCandidate(goodMetrics) > 7);
  assert.equal(sidebar.scoreSidebarCandidate({ ...goodMetrics, visible: false }), Number.NEGATIVE_INFINITY);
  assert.equal(sidebar.scoreSidebarCandidate({ ...goodMetrics, isBodyLike: true, widthRatio: 0.95 }), 8);
});

test('Grok native sidebar selector is preferred when present', () => {
  const grokSidebar = {
    getBoundingClientRect: () => ({ left: 0, right: 288, width: 288, height: 900 }),
    matches: () => false,
    querySelector: () => null,
  };
  const doc = {
    body: {},
    documentElement: {},
    querySelector: (selector) => selector === dom.GROK_SIDEBAR_SELECTOR ? grokSidebar : null,
    querySelectorAll: () => [],
  };
  const win = {
    innerHeight: 1000,
    innerWidth: 1400,
    getComputedStyle: () => ({ display: 'flex', visibility: 'visible' }),
  };
  assert.equal(dom.findSidebar(doc, win), grokSidebar);
});

test('Grok and ChatGPT persist sidebar widths independently', () => {
  const grok = controller.resolveSidebarSite('grok.com');
  const chatgpt = controller.resolveSidebarSite('chatgpt.com');
  assert.equal(grok.storageKey, constants.STORAGE_KEYS.grokSidebarWidth);
  assert.equal(chatgpt.storageKey, constants.STORAGE_KEYS.sidebarWidth);
  assert.notEqual(grok.storageKey, chatgpt.storageKey);
  assert.equal(grok.label, 'Resize Grok sidebar');
});

test('width variable is applied to Grok sidebar and its variable-owning ancestors', () => {
  const style = () => {
    const values = new Map();
    return {
      getPropertyValue: (key) => values.get(key) || '',
      getPropertyPriority: () => '',
      setProperty: (key, value) => values.set(key, value),
      removeProperty: (key) => values.delete(key),
    };
  };
  const shell = { style: style(), parentElement: null };
  const inner = { style: style(), parentElement: shell };
  const overrides = new Map();
  sidebar.applySidebarWidthVariable(inner, 420, overrides);
  assert.equal(inner.style.getPropertyValue('--sidebar-width'), '420px');
  assert.equal(shell.style.getPropertyValue('--sidebar-width'), '420px');
});
