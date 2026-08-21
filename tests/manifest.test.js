const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const expectedJs = [
  'src/shared/constants.js',
  'src/shared/storage.js',
  'src/sidebar/core.js',
  'src/sidebar/dom.js',
  'src/sidebar/controller.js',
  'src/queue/core.js',
  'src/queue/dom.js',
  'src/queue/scope.js',
  'src/queue/ui.js',
  'src/queue/view.js',
  'src/queue/controller.js',
];
const expectedCss = ['src/sidebar/styles.css', 'src/queue/styles.css'];

test('manifest wires no-build modules in dependency order and keeps version 1.1.0', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.1.0');
  assert.ok(manifest.permissions.includes('storage'));
  assert.deepEqual(manifest.content_scripts[0].js, expectedJs);
  assert.deepEqual(manifest.content_scripts[0].css, expectedCss);
  assert.equal(manifest.background?.service_worker, 'src/background/service-worker.js');
  assert.equal(manifest.content_scripts[0].matches.length, 1);
  assert.equal(manifest.content_scripts[0].matches[0], 'https://chatgpt.com/*');
});

test('manifest exposes relocated popup and every referenced runtime file exists', () => {
  assert.equal(manifest.action?.default_popup, 'src/popup/popup.html');
  for (const file of [...expectedJs, ...expectedCss, manifest.action.default_popup, 'src/background/service-worker.js', 'src/popup/popup.css', 'src/popup/popup.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('popup contains exactly the supported queue shortcut choices', () => {
  const html = fs.readFileSync(path.join(root, 'src/popup/popup.html'), 'utf8');
  assert.match(html, /value="ctrl-enter"/);
  assert.match(html, /value="alt-enter"/);
  assert.match(html, /\.\.\/shared\/constants\.js/);
  assert.match(html, /\.\.\/shared\/storage\.js/);
  assert.match(html, /\.\.\/queue\/core\.js/);
  assert.match(html, /popup\.js/);
});
