const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../manifest.json');

test('extension is branded AI Chat Web Supporter', () => {
  assert.equal(manifest.name, 'AI Chat Web Supporter');
});

test('queue UI policy loads before the queue view', () => {
  const scripts = manifest.content_scripts[0].js;
  assert.ok(scripts.includes('queue-ui.js'));
  assert.ok(scripts.indexOf('queue-ui.js') < scripts.indexOf('queue-view.js'));
});
