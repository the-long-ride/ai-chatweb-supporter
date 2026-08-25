const test = require('node:test');
const assert = require('node:assert/strict');
const update = require('../src/popup/update.js');

test('release update detects a newer stable v-prefixed GitHub tag', () => {
  assert.deepEqual(update.releaseUpdate('1.1.2', { tag_name:'v1.2.0', draft:false, prerelease:false }), {
    version:'1.2.0',
    tag:'v1.2.0',
    downloadUrl:'https://github.com/the-long-ride/ai-chatweb-supporter/archive/refs/tags/v1.2.0.zip',
  });
});

test('release update ignores equal, older, prerelease, draft, and invalid tags', () => {
  assert.equal(update.releaseUpdate('1.1.2', { tag_name:'v1.1.2' }), null);
  assert.equal(update.releaseUpdate('1.1.2', { tag_name:'v1.0.9' }), null);
  assert.equal(update.releaseUpdate('1.1.2', { tag_name:'v2.0.0-beta', prerelease:true }), null);
  assert.equal(update.releaseUpdate('1.1.2', { tag_name:'v2.0.0', draft:true }), null);
  assert.equal(update.releaseUpdate('1.1.2', { tag_name:'latest' }), null);
});

test('version comparison is numeric and tolerates different segment counts', () => {
  assert.equal(update.compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(update.compareVersions('2.0', '2.0.0'), 0);
  assert.equal(update.compareVersions('1.2.3', '1.3.0'), -1);
});
