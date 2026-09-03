const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dom = require('../src/queue/dom.js');

test('Steer may prepare an empty composer while the current response is busy', () => {
  assert.equal(dom.canPrepareQueuedSend({ busy:true, composerText:'', hasAttachments:false, allowBusy:true }), true);
  assert.equal(dom.canPrepareQueuedSend({ busy:true, composerText:'', hasAttachments:false }), false);
});

test('Steer does not accept pre-existing busy state until the queued text leaves the composer', () => {
  assert.equal(dom.classifySendAttempt({ busy:true, composerText:'queued', queuedText:'queued', sendReady:false, acceptBusy:false }), 'pending');
  assert.equal(dom.classifySendAttempt({ busy:true, composerText:'', queuedText:'queued', sendReady:false, acceptBusy:false }), 'accepted');
  assert.equal(dom.classifySendAttempt({ busy:true, composerText:'queued', queuedText:'queued', sendReady:false }), 'accepted');
});

test('runtime opts Steer into busy preparation and ignores pre-existing busy for acceptance', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  assert.match(source, /allowBusy:\s*steer/);
  assert.match(source, /acceptBusy:\s*!\(steer\s*&&\s*busyBefore\)/);
});
