const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../src/queue/ui.js');

const viewSource = fs.readFileSync(path.resolve(__dirname, '../src/queue/view.js'), 'utf8');
const runtimeSource = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'));

test('Steer icon uses supplied 24x24 glyph with theme-aware fill', () => {
  assert.match(ui.ICONS.steer, /viewBox="0 0 24 24"/);
  assert.match(ui.ICONS.steer, /M18\.2102 5\.19087/);
  assert.match(ui.ICONS.steer, /fill="currentColor"/);
});

test('queue row exposes Steer and a dedicated draggable grab handle', () => {
  assert.match(viewSource, /Steer queued message/);
  assert.match(viewSource, /this\.steerItem\(item\.id\)/);
  assert.match(viewSource, /classList\.add\('cgpt-queue-grab'/);
  assert.match(viewSource, /grab\.draggable\s*=\s*true/);
  assert.match(viewSource, /row\.draggable\s*=\s*false/);
  assert.match(viewSource, /grab\.addEventListener\('dragstart'/);
});

test('runtime wires Steer to targeted immediate dispatch', () => {
  assert.match(runtimeSource, /steerItem:\s*\(itemId\)\s*=>\s*dispatchQueuedItem\(itemId,\s*\{\s*steer:\s*true\s*\}\)/);
  assert.match(runtimeSource, /await stageQueuedItemForDispatch/);
  const stageIndex = runtimeSource.indexOf('await stageQueuedItemForDispatch');
  const clickIndex = runtimeSource.indexOf('sendButton.click()', stageIndex);
  assert.ok(stageIndex >= 0 && clickIndex > stageIndex, 'storage removal must happen before send click');
  assert.match(runtimeSource, /restoreQueuedItemAfterFailedSend/);
});

test('Grok manifest entry contains no extension queue runtime or queue CSS', () => {
  const grok = manifest.content_scripts.find((entry) => entry.matches?.includes('https://grok.com/*'));
  assert.ok(grok);
  assert.equal(grok.js.some((file) => file.startsWith('src/queue/')), false);
  assert.equal(grok.css.includes('src/queue/styles.css'), false);
});
