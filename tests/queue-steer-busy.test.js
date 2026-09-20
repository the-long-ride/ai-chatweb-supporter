const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dom = require('../src/queue/dom.js');

test('Steer may prepare an empty composer while the current response is busy', () => {
  assert.equal(dom.canPrepareQueuedSend({ busy:true, composerText:'', hasAttachments:false, allowBusy:true }), true);
  assert.equal(dom.canPrepareQueuedSend({ busy:true, composerText:'', hasAttachments:false }), false);
});

test('runtime preserves Steer busy override and uses composer departure as acceptance signal', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  assert.match(source, /allowBusy:\s*steer/);
  assert.match(source, /if \(busyBefore && !dom\.composerTextMatchesQueued\(provider\.getComposerText\(currentComposer\), queuedText\)\) return resolve\(true\)/);
});
