const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const batchDom = require('../src/batch/dom.js');

function element(name) {
  return {
    nodeName: name,
    className: '',
    attrs: {},
    children: [],
    listeners: {},
    parentElement: null,
    firstChild: null,
    ownerDocument: null,
    setAttribute(key, value) { this.attrs[key] = String(value); },
    getAttribute(key) { return this.attrs[key] ?? null; },
    hasAttribute(key) { return Object.prototype.hasOwnProperty.call(this.attrs, key); },
    appendChild(child) { this.children.push(child); child.parentElement = this; this.firstChild ||= child; return child; },
    insertBefore(child) { this.children.unshift(child); child.parentElement = this; this.firstChild = child; return child; },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    replaceChildren(...children) { this.children = children; this.firstChild = children[0] || null; for (const child of children) child.parentElement = this; },
    matches(selector) { return this.nodeName === 'a' && selector.includes('a'); },
    querySelector(selector) {
      if (selector.includes('data-ai-chatweb-batch-select')) return this.children.find((child) => child.attrs?.['data-ai-chatweb-batch-select'] === 'true') || null;
      return null;
    },
  };
}

function fakeDocument() {
  const doc = {
    createElement(name) { const node = element(name); node.ownerDocument = doc; return node; },
    createElementNS(_ns, name) { const node = element(name); node.ownerDocument = doc; return node; },
  };
  return doc;
}

test('row selection control stays visible without inheriting header hover-hidden classes', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/batch/styles.css'), 'utf8');
  assert.match(
    css,
    /\[data-ai-chatweb-batch-select="true"\][\s\S]*opacity:\s*1\s*!important[\s\S]*visibility:\s*visible\s*!important[\s\S]*pointer-events:\s*auto\s*!important/
  );

  const doc = fakeDocument();
  const row = doc.createElement('a');
  const template = doc.createElement('button');
  template.className = 'native-chatgpt can-hover:opacity-0';
  const control = batchDom.decorateRow(doc, row, { selected: false, template });
  assert.equal(control.className, '');
});

test('row selection control owns click and blocks anchor navigation', () => {
  const doc = fakeDocument();
  const row = doc.createElement('a');
  let toggles = 0;
  const control = batchDom.decorateRow(doc, row, { selected: false, onToggle: () => { toggles += 1; } });
  assert.equal(typeof control.listeners.click, 'function');

  let prevented = false;
  let stopped = false;
  control.listeners.click({
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
  });

  assert.equal(toggles, 1);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test('header toggle selection uses requested 24px dashed-square glyph', () => {
  const button = batchDom.createIconButton(fakeDocument(), { label: 'Select conversations', icon: 'select' });
  const svg = button.children[0];
  assert.equal(svg.attrs.viewBox, '0 0 24 24');
  assert.equal(svg.children.length, 1);
  assert.equal(svg.children[0].nodeName, 'path');
  assert.equal(svg.children[0].attrs.d, 'M8 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40973 4.40973 4.71569 4.21799 5.09202C4 5.51984 4 6.07989 4 7.2V8M4 11V13M4 16V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.07989 20 7.2 20H8M11 20H13M16 20H16.8C17.9201 20 18.4802 20 18.908 19.782C19.2843 19.5903 19.5903 19.2843 19.782 18.908C20 18.4802 20 17.9201 20 16.8V16M20 13V11M20 8V7.2C20 6.0799 20 5.51984 19.782 5.09202C19.5903 4.71569 19.2843 4.40973 18.908 4.21799C18.4802 4 17.9201 4 16.8 4H16M13 4H11');
  assert.equal(svg.children[0].attrs.stroke, 'currentColor');
  assert.equal(svg.children[0].attrs['stroke-width'], '2');
});

test('unchecked row checkbox uses requested rounded-square glyph', () => {
  const doc = fakeDocument();
  const row = doc.createElement('a');
  const control = batchDom.decorateRow(doc, row, { selected: false });
  const svg = control.children[0];
  assert.equal(svg.attrs.viewBox, '0 0 24 24');
  assert.equal(svg.children.length, 1);
  const rect = svg.children[0];
  assert.equal(rect.nodeName, 'rect');
  assert.equal(rect.attrs.x, '4');
  assert.equal(rect.attrs.y, '4');
  assert.equal(rect.attrs.width, '16');
  assert.equal(rect.attrs.height, '16');
  assert.equal(rect.attrs.rx, '2');
  assert.equal(rect.attrs.stroke, 'currentColor');
  assert.equal(rect.attrs['stroke-width'], '2');
});

test('checked row checkbox uses requested check-square glyph', () => {
  const doc = fakeDocument();
  const row = doc.createElement('a');
  const control = batchDom.decorateRow(doc, row, { selected: false });
  batchDom.setRowSelected(row, true);
  const svg = control.children[0];
  assert.equal(svg.attrs.viewBox, '0 0 24 24');
  assert.equal(svg.children.length, 1);
  assert.equal(svg.children[0].nodeName, 'path');
  assert.equal(svg.children[0].attrs.d, 'M8 12.5L10.5 15L16 9M7.2 20H16.8C17.9201 20 18.4802 20 18.908 19.782C19.2843 19.5903 19.5903 19.2843 19.782 18.908C20 18.4802 20 17.9201 20 16.8V7.2C20 6.0799 20 5.51984 19.782 5.09202C19.5903 4.71569 19.2843 4.40973 18.908 4.21799C18.4802 4 17.9201 4 16.8 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40973 4.40973 4.71569 4.21799 5.09202C4 5.51984 4 6.07989 4 7.2V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.07989 20 7.2 20Z');
  assert.equal(svg.children[0].attrs.stroke, 'currentColor');
  assert.equal(svg.children[0].attrs['stroke-width'], '2');
});

test('header controls preserve native ChatGPT template classes', () => {
  const doc = fakeDocument();
  const template = doc.createElement('button');
  template.className = 'native-chatgpt rounded-lg hover:bg-token-sidebar-surface-secondary';
  const control = batchDom.createIconButton(doc, { label: 'Archive selected', template, icon: 'archive' });
  assert.equal(control.className, template.className);
});

test('archive icon matches requested 24px archive glyph and follows current text color', () => {
  const button = batchDom.createIconButton(fakeDocument(), { label: 'Archive selected', icon: 'archive' });
  const svg = button.children[0];
  assert.equal(svg.attrs.viewBox, '0 0 24 24');
  assert.equal(svg.attrs.stroke, undefined);
  assert.equal(svg.children.length, 3);
  assert.equal(svg.children[0].attrs.d, 'M20.5 7V13C20.5 16.7712 20.5 18.6569 19.3284 19.8284C18.1569 21 16.2712 21 12.5 21H11.5C7.72876 21 5.84315 21 4.67157 19.8284C3.5 18.6569 3.5 16.7712 3.5 13V7');
  assert.equal(svg.children[0].attrs.opacity, '0.5');
  assert.equal(svg.children[0].attrs.stroke, 'currentColor');
  assert.equal(svg.children[0].attrs['stroke-width'], '1.5');
  assert.equal(svg.children[1].attrs.d, 'M2 5C2 4.05719 2 3.58579 2.29289 3.29289C2.58579 3 3.05719 3 4 3H20C20.9428 3 21.4142 3 21.7071 3.29289C22 3.58579 22 4.05719 22 5C22 5.94281 22 6.41421 21.7071 6.70711C21.4142 7 20.9428 7 20 7H4C3.05719 7 2.58579 7 2.29289 6.70711C2 6.41421 2 5.94281 2 5Z');
  assert.equal(svg.children[1].attrs['stroke-linecap'], undefined);
  assert.equal(svg.children[1].attrs['stroke-linejoin'], undefined);
  assert.equal(svg.children[2].attrs['stroke-linecap'], 'round');
  assert.equal(svg.children[2].attrs['stroke-linejoin'], 'round');
  assert.equal(svg.children[2].attrs.d, 'M12 7L12 16M12 16L15 12.6667M12 16L9 12.6667');
});

test('delete icon matches requested 24px delete glyph and follows current text color', () => {
  const button = batchDom.createIconButton(fakeDocument(), { label: 'Delete selected', icon: 'delete' });
  const svg = button.children[0];
  assert.equal(svg.attrs.viewBox, '0 0 24 24');
  assert.equal(svg.children.length, 1);
  assert.equal(svg.children[0].attrs.d, 'M10 12L14 16M14 12L10 16M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6');
  assert.equal(svg.children[0].attrs.stroke, 'currentColor');
  assert.equal(svg.children[0].attrs['stroke-width'], '2');
});
