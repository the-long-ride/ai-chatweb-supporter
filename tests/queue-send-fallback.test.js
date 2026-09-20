const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dom = require('../src/queue/dom.js');

test('dispatchEnterKey focuses composer and emits Enter keydown then keyup', () => {
  class FakeKeyboardEvent {
    constructor(type, options={}) { this.type=type; Object.assign(this, options); }
  }
  const events=[];
  const composer={
    focused:false,
    focus(){ this.focused=true; },
    dispatchEvent(event){ events.push(event); return true; },
  };
  assert.equal(dom.dispatchEnterKey(composer, { KeyboardEvent:FakeKeyboardEvent }), true);
  assert.equal(composer.focused, true);
  assert.deepEqual(events.map((event) => [event.type,event.key,event.code,event.keyCode]), [
    ['keydown','Enter','Enter',13],
    ['keyup','Enter','Enter',13],
  ]);
});

test('composer comparison tolerates ProseMirror paragraph and invisible-character normalization', () => {
  assert.equal(dom.composerTextMatchesQueued(
    'first paragraph\n\n\nsecond paragraph\u200b',
    'first paragraph\n\nsecond paragraph'
  ), true);
  assert.equal(dom.composerTextMatchesQueued(
    'keep  internal spaces',
    'keep internal spaces'
  ), false);
});

test('queue dispatch waits one second then presses Enter without Send-button readiness gating', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  assert.match(source, /const PREPARED_SEND_DELAY_MS = 1000/);
  assert.match(source, /await delay\(PREPARED_SEND_DELAY_MS\)/);
  assert.match(source, /dom\.dispatchEnterKey\(sendComposer, window\)/);
  assert.doesNotMatch(source, /waitForSendReady/);
  assert.doesNotMatch(source, /FORM_SUBMIT_ACCEPTANCE_TIMEOUT_MS/);
});

test('queue dispatch waits up to 30 seconds for processing state', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  assert.match(source, /const PROCESSING_START_TIMEOUT_MS = 30000/);
  assert.match(source, /waitForProcessingStart\(sendComposer, item\.text, provider, \{ busyBefore \}\)/);
  assert.match(source, /provider\.findStopButton\(currentComposer, document, window\)/);
  assert.match(source, /if \(!busyBefore && busy\) return resolve\(true\)/);
});

test('failed processing watchdog restores the staged queue item for retry', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  const enterIndex=source.indexOf('dom.dispatchEnterKey(sendComposer, window)');
  const watchdogIndex=source.indexOf('waitForProcessingStart(sendComposer');
  const restoreIndex=source.indexOf('restoreQueuedItemAfterFailedSend({', watchdogIndex);
  assert.ok(enterIndex >= 0);
  assert.ok(watchdogIndex > enterIndex);
  assert.ok(restoreIndex > watchdogIndex);
});

test('queued item is staged only after the one-second preparation delay', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  const delayIndex=source.indexOf('await delay(PREPARED_SEND_DELAY_MS)');
  const stageIndex=source.indexOf('stageQueuedItemForDispatch({');
  assert.ok(delayIndex >= 0);
  assert.ok(stageIndex > delayIndex);
});
