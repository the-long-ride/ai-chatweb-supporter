const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/sidebar/controller.js'), 'utf8');
const start = source.indexOf('    updateHandlePosition() {');
const end = source.indexOf('    scheduleHandlePosition() {', start);
const updateHandlePosition = source.slice(start, end);

test('resizer spans the full visible sidebar right border', () => {
  assert.match(updateHandlePosition, /const top = Math\.max\(rect\.top, 0\);/);
  assert.match(updateHandlePosition, /const bottom = Math\.min\(rect\.bottom, this\.win\.innerHeight\);/);
  assert.match(updateHandlePosition, /const height = Math\.max\(0, bottom - top\);/);
  assert.doesNotMatch(updateHandlePosition, /TOP_SAFETY_INSET|BOTTOM_SAFETY_INSET/);
});

test('full-height geometry is shared by ChatGPT and Grok', () => {
  assert.doesNotMatch(updateHandlePosition, /this\.site\.id\s*===/);
  assert.match(updateHandlePosition, /this\.handle\.style\.top = `\$\{Math\.round\(top\)\}px`/);
  assert.match(updateHandlePosition, /this\.handle\.style\.height = `\$\{Math\.round\(height\)\}px`/);
});
