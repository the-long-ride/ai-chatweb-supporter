const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/popup/popup.js'), 'utf8');

test('popup reads, writes, and reacts to background keep-awake preference', () => {
  assert.match(source, /backgroundKeepAwake:\s*BACKGROUND_KEEP_AWAKE_KEY/);
  assert.match(source, /querySelector\('#background-keep-awake'\)/);
  assert.match(source, /BACKGROUND_KEEP_AWAKE_KEY,[\s\S]*\]\)\.then/);
  assert.match(source, /storage\.set\(\{ \[BACKGROUND_KEEP_AWAKE_KEY\]: backgroundKeepAwake\.checked \}\)/);
  assert.match(source, /changes\[BACKGROUND_KEEP_AWAKE_KEY\]/);
});
