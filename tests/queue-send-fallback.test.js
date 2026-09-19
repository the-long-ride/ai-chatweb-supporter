const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dom = require('../src/queue/dom.js');

test('requestComposerSubmit uses the native form submit path with the send button', () => {
  const calls = [];
  const button = {};
  const form = { requestSubmit(submitter) { calls.push(submitter); } };
  button.form = form;

  assert.equal(dom.requestComposerSubmit({}, button), true);
  assert.deepEqual(calls, [button]);
});

test('requestComposerSubmit retries without an invalid submitter', () => {
  const calls = [];
  const button = {};
  const form = {
    requestSubmit(submitter) {
      calls.push(submitter);
      if (submitter) throw new TypeError('not a submit button');
    },
  };
  button.form = form;

  assert.equal(dom.requestComposerSubmit({}, button), true);
  assert.deepEqual(calls, [button, undefined]);
});

test('queue runtime falls back to click only when native form submission is not accepted', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  assert.match(source, /requestComposerSubmit\?\.\(sendComposer, sendButton\)/);
  assert.match(source, /FORM_SUBMIT_ACCEPTANCE_TIMEOUT_MS/);
  assert.match(source, /if \(!sent && submittedByForm\)/);
  assert.match(source, /fallbackButton\.click\(\)/);
  assert.match(source, /queuedStillPresent/);
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

test('send attempt does not abort solely because ProseMirror changes paragraph newline count', () => {
  assert.equal(dom.classifySendAttempt({
    busy:false,
    composerText:'one\n\n\ntwo',
    queuedText:'one\n\ntwo',
    sendReady:true,
  }), 'pending');
});

test('runtime refreshes the live composer before validating and submitting queued text', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  assert.match(source, /const sendComposer = provider\.findComposer\(document, window\) \|\| composer/);
  assert.match(source, /composerTextMatchesQueued\(provider\.getComposerText\(sendComposer\), item\.text\)/);
  assert.match(source, /requestComposerSubmit\?\.\(sendComposer, sendButton\)/);
});


test('prepared queued message waits while the platform Send button is disabled', () => {
  assert.equal(dom.classifyPreparedSendState({
    active:true,
    composerMatches:true,
    sendReady:false,
  }), 'waiting');
  assert.equal(dom.classifyPreparedSendState({
    active:true,
    composerMatches:true,
    sendReady:true,
  }), 'ready');
  assert.equal(dom.classifyPreparedSendState({
    active:false,
    composerMatches:true,
    sendReady:false,
  }), 'interrupted');
});

test('runtime waits for Send readiness without upload or large-text timeout retry loops', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  assert.doesNotMatch(source, /ATTACHMENT_SEND_READY_TIMEOUT_MS/);
  assert.match(source, /waitForSendReady\(composer, provider, item, \{ steer \}\)/);
  assert.match(source, /window\.setTimeout\(check, SEND_READY_POLL_MS\)/);
  assert.match(source, /state\.queue\.some\(\(entry\) => entry\.id === item\.id\)/);
  assert.match(source, /readiness\.status !== 'ready'/);
});

test('queued item is staged only after Send becomes ready', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  const readyIndex = source.indexOf("readiness.status !== 'ready'");
  const stageIndex = source.indexOf('stageQueuedItemForDispatch({');
  assert.ok(readyIndex >= 0);
  assert.ok(stageIndex > readyIndex);
});
