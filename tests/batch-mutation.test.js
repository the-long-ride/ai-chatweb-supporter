const test = require('node:test');
const assert = require('node:assert/strict');
const batchDom = require('../src/batch/dom.js');

function extensionControl() {
  return {
    nodeType: 1,
    matches(selector) {
      return selector.includes('data-ai-chatweb-batch-select');
    },
    closest() {
      return null;
    },
  };
}

function detachedSvg() {
  return {
    nodeType: 1,
    matches() {
      return false;
    },
    closest() {
      return null;
    },
  };
}

test('icon replacement inside an extension checkbox is ignored by the mutation observer', () => {
  const mutation = {
    target: extensionControl(),
    addedNodes: [],
    removedNodes: [detachedSvg()],
  };

  assert.equal(batchDom.mutationIsExtensionOnly(mutation), true);
});
