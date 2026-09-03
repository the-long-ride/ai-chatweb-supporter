const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

function fakeElement({ rect, attrs = {}, matches = () => false, children = [] } = {}) {
  const element = {
    nodeType: 1,
    isConnected: true,
    parentElement: null,
    children,
    attrs: { ...attrs },
    getBoundingClientRect: () => ({ ...rect }),
    getAttribute(name) { return this.attrs[name] ?? null; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
    matches(selector) { return matches(selector); },
    querySelectorAll(selector) { return this.children.filter((child) => child.matches?.(selector)); },
    contains(node) {
      if (node === this) return true;
      return this.children.some((child) => child === node || child.contains?.(node));
    },
  };
  for (const child of children) child.parentElement = element;
  return element;
}

const visibleStyleWindow = {
  innerWidth: 1440,
  innerHeight: 1000,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
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

test('resize handle treats a mostly off-screen sidebar as collapsed', () => {
  const win = { innerWidth: 1440 };
  assert.equal(dom.sidebarIsOpen({ left: 0, right: 320, width: 320, height: 900 }, win), true);
  assert.equal(dom.sidebarIsOpen({ left: -24, right: 296, width: 320, height: 900 }, win), true);
  assert.equal(dom.sidebarIsOpen({ left: -304, right: 16, width: 320, height: 900 }, win), false);
});

test('wide sidebar shell with only a narrow icon rail is treated as collapsed', () => {
  const narrowRail = fakeElement({
    rect: { left: 0, right: 76, width: 76, height: 940, top: 0, bottom: 940 },
    matches: (selector) => selector.includes('nav') || selector.includes('[role="navigation"]'),
  });
  const shell = fakeElement({
    rect: { left: 0, right: 350, width: 350, height: 940, top: 0, bottom: 940 },
    children: [narrowRail],
  });
  assert.equal(dom.sidebarElementIsOpen(shell, visibleStyleWindow), false);
});

test('wide sidebar shell with expanded navigation surface stays resizable', () => {
  const expandedNavigation = fakeElement({
    rect: { left: 0, right: 320, width: 320, height: 940, top: 0, bottom: 940 },
    matches: (selector) => selector.includes('nav') || selector.includes('[role="navigation"]'),
  });
  const shell = fakeElement({
    rect: { left: 0, right: 320, width: 320, height: 940, top: 0, bottom: 940 },
    children: [expandedNavigation],
  });
  assert.equal(dom.sidebarElementIsOpen(shell, visibleStyleWindow), true);
});

test('ChatGPT collapsed shell ignores unrelated wide navigation without Recents surface', () => {
  const unrelatedWideNav = fakeElement({
    rect: { left: 76, right: 350, width: 274, height: 940, top: 0, bottom: 940 },
    matches: (selector) => selector.includes('nav') || selector.includes('[role="navigation"]'),
  });
  const shell = fakeElement({
    rect: { left: 0, right: 350, width: 350, height: 940, top: 0, bottom: 940 },
    children: [unrelatedWideNav],
  });
  assert.equal(dom.sidebarElementIsOpen(shell, visibleStyleWindow, 'chatgpt'), false);
});

test('ChatGPT expanded Recents surface enables resizer', () => {
  const history = fakeElement({
    rect: { left: 0, right: 320, width: 320, height: 700, top: 180, bottom: 880 },
    matches: (selector) => selector.includes('#history'),
  });
  const shell = fakeElement({
    rect: { left: 0, right: 320, width: 320, height: 940, top: 0, bottom: 940 },
    children: [history],
  });
  assert.equal(dom.sidebarElementIsOpen(shell, visibleStyleWindow, 'chatgpt'), true);
});

test('ChatGPT surface selector is provider-specific', () => {
  assert.match(dom.CHATGPT_EXPANDED_SURFACE_SELECTOR, /#history/);
  assert.match(dom.CHATGPT_EXPANDED_SURFACE_SELECTOR, /sidebar-expando-section/);
  assert.doesNotMatch(dom.CHATGPT_EXPANDED_SURFACE_SELECTOR, /\bnav\b/);
});

test('explicit collapsed state on sidebar shell or ancestor hides resizer', () => {
  const expandedNavigation = fakeElement({
    rect: { left: 0, right: 320, width: 320, height: 940, top: 0, bottom: 940 },
    matches: (selector) => selector.includes('nav') || selector.includes('[role="navigation"]'),
  });
  const shell = fakeElement({
    rect: { left: 0, right: 320, width: 320, height: 940, top: 0, bottom: 940 },
    attrs: { 'data-state': 'collapsed' },
    children: [expandedNavigation],
  });
  assert.equal(dom.sidebarElementIsOpen(shell, visibleStyleWindow), false);

  const ancestor = fakeElement({
    rect: { left: 0, right: 320, width: 320, height: 940, top: 0, bottom: 940 },
    attrs: { 'data-collapsed': 'true' },
    children: [shell],
  });
  delete shell.attrs['data-state'];
  assert.equal(dom.sidebarElementIsOpen(shell, visibleStyleWindow), false);
  assert.equal(ancestor.contains(shell), true);
});

test('sidebar state attribute changes are treated as handle-affecting mutations', () => {
  const currentSidebar = { isConnected: true };
  const shell = { contains: (node) => node === currentSidebar };
  const unrelated = { contains: () => false };
  assert.equal(dom.mutationMayAffectSidebar({ type: 'attributes', target: shell, addedNodes: [], removedNodes: [] }, currentSidebar), true);
  assert.equal(dom.mutationMayAffectSidebar({ type: 'attributes', target: unrelated, addedNodes: [], removedNodes: [] }, currentSidebar), false);
});

test('child-list mutations inside current sidebar are handle-affecting', () => {
  const target = {};
  const currentSidebar = {
    isConnected: true,
    contains: (node) => node === target,
  };
  assert.equal(dom.mutationMayAffectSidebar({ type: 'childList', target, addedNodes: [], removedNodes: [] }, currentSidebar), true);
});

test('sidebar observer watches attributes that can represent collapse state', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/sidebar/controller.js'), 'utf8');
  assert.match(source, /observe\(this\.doc\.body,\s*\{[\s\S]*?childList:\s*true[\s\S]*?subtree:\s*true[\s\S]*?attributes:\s*true/);
  assert.match(source, /attributeFilter:\s*\[[^\]]*['"]class['"][^\]]*['"]style['"][^\]]*['"]data-state['"][^\]]*['"]aria-expanded['"]/);
});

test('sidebar controller passes provider id to open-state detection', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/sidebar/controller.js'), 'utf8');
  const calls = source.match(/dom\.sidebarElementIsOpen\(this\.currentSidebar,\s*this\.win,\s*this\.site\.id\)/g) || [];
  assert.ok(calls.length >= 2);
  assert.match(source, /dom\.listSidebarSurfaces\(this\.currentSidebar,\s*this\.site\.id\)/);
});

test('resize observer also tracks inner sidebar surfaces that collapse independently', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/sidebar/controller.js'), 'utf8');
  assert.match(source, /for\s*\(const surface of[\s\S]*?this\.resizeObserver\.observe\(surface\)/);
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
