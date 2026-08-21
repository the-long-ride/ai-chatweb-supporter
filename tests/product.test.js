const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('../manifest.json');
const root = path.resolve(__dirname, '..');

test('extension branding and version remain stable', () => {
  assert.equal(manifest.name,'AI Chat Web Supporter');
  assert.equal(manifest.version,'1.1.0');
});

test('queue UI policy loads before the queue view', () => {
  const scripts=manifest.content_scripts[0].js;
  assert.ok(scripts.includes('src/queue/ui.js'));
  assert.ok(scripts.indexOf('src/queue/ui.js') < scripts.indexOf('src/queue/view.js'));
});

test('compact README documents current support and test command', () => {
  const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
  assert.match(readme,/currently supports.*ChatGPT/i);
  assert.match(readme,/node --test tests\/\*\.test\.js/);
  assert.doesNotMatch(readme,/find src -name|node --check|for f in content\.js/);
  assert.ok(readme.length < 2600, `README should be compact; got ${readme.length} characters`);
});

test('README documents conversation-scoped queues with tab fallback', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /queue.*conversation/i);
  assert.match(readme, /tab fallback|fallback.*tab/i);
});
