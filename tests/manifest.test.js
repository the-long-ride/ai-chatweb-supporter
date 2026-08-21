const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest wires queue scripts and styles in dependency order', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('storage'));
  assert.deepEqual(manifest.content_scripts[0].js, [
    'content.js',
    'queue-core.js',
    'queue-dom.js',
    'queue-ui.js',
    'queue-view.js',
    'queue-content.js',
  ]);
  assert.deepEqual(manifest.content_scripts[0].css, [
    'styles.css',
    'queue-content.css',
  ]);
});

test('manifest exposes the queue settings popup', () => {
  assert.equal(manifest.action?.default_popup, 'popup.html');
  for (const file of ['popup.html', 'popup.css', 'popup.js', 'queue-core.js', 'queue-dom.js', 'queue-ui.js', 'queue-view.js', 'queue-content.js', 'queue-content.css']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('popup contains exactly the supported queue shortcut choices', () => {
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  assert.match(html, /value="ctrl-enter"/);
  assert.match(html, /value="alt-enter"/);
  assert.match(html, /queue-core\.js/);
  assert.match(html, /popup\.js/);
});
