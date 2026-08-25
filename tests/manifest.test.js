const test=require('node:test');const assert=require('node:assert/strict');const manifest=require('../manifest.json');
const sidebarPrefix=['src/shared/constants.js','src/shared/storage.js','src/sidebar/core.js','src/sidebar/dom.js','src/sidebar/controller.js'];
const queueRuntime=(provider)=>['src/queue/core.js','src/queue/dom.js',`src/providers/${provider}.js`,'src/providers/registry.js','src/queue/scope.js','src/queue/ui.js','src/queue/view.js','src/queue/controller.js'];
const sidebarAndQueue=(provider)=>[...sidebarPrefix,...queueRuntime(provider)];
const claudeRuntime=['src/shared/constants.js','src/shared/storage.js','src/queue/core.js','src/queue/dom.js','src/providers/claude.js','src/providers/claude-auto-continue.js','src/providers/registry.js','src/queue/scope.js','src/queue/ui.js','src/queue/view.js','src/queue/controller.js'];
test('manifest version and exact three provider entries',()=>{assert.equal(manifest.version,'1.1.2');assert.equal(manifest.content_scripts.length,3);assert.deepEqual(manifest.content_scripts.map(x=>x.matches[0]),['https://chatgpt.com/*','https://claude.ai/*','https://grok.com/*']);});
test('content script order gives sidebar resizing to ChatGPT and Grok and auto-continue to Claude only',()=>{const [c,cl,g]=manifest.content_scripts;assert.deepEqual(c.js,sidebarAndQueue('chatgpt'));assert.deepEqual(cl.js,claudeRuntime);assert.deepEqual(g.js,sidebarAndQueue('grok'));assert.deepEqual(c.css,['src/sidebar/styles.css','src/queue/styles.css']);assert.deepEqual(g.css,['src/sidebar/styles.css','src/queue/styles.css']);assert.deepEqual(cl.css,['src/queue/styles.css']);assert.equal(cl.js.some(x=>x.includes('/sidebar/')),false);assert.equal(c.js.some(x=>x.includes('claude-auto-continue')),false);assert.equal(g.js.some(x=>x.includes('claude-auto-continue')),false);});

test('manifest keeps popup/background wiring and every referenced runtime path exists', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  assert.equal(manifest.action?.default_popup, 'src/popup/popup.html');
  assert.equal(manifest.background?.service_worker, 'src/background/service-worker.js');
  const paths = new Set([
    ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css]),
    manifest.action.default_popup,
    manifest.background.service_worker,
    'src/popup/popup.css',
    'src/popup/popup.js',
  ]);
  for (const file of paths) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
});

test('popup keeps queue shortcut choices and exposes Claude auto-continue toggle', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.resolve(__dirname, '../src/popup/popup.html'), 'utf8');
  assert.match(html, /value="ctrl-enter"/);
  assert.match(html, /value="alt-enter"/);
  assert.match(html, /id="claude-auto-continue"/);
  assert.match(html, /Auto-continue tools/);
  assert.match(html, /\.\.\/shared\/constants\.js/);
  assert.match(html, /\.\.\/shared\/storage\.js/);
  assert.match(html, /\.\.\/queue\/core\.js/);
});
