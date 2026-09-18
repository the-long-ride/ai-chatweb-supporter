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
  assert.match(source, /requestComposerSubmit\?\.\(composer, sendButton\)/);
  assert.match(source, /FORM_SUBMIT_ACCEPTANCE_TIMEOUT_MS/);
  assert.match(source, /if \(!sent && submittedByForm\)/);
  assert.match(source, /fallbackButton\.click\(\)/);
  assert.match(source, /queuedStillPresent/);
});
