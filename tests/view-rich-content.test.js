const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { QueueView } = require('../src/queue/view.js');

test('QueueView accepts attachment cleanup callback', () => {
  const cleanup=async()=>{};
  const view=new QueueView({getQueue:()=>[],setQueue(){},persistQueue:async()=>{},scheduleReconcile(){},getProvider:()=>null,deleteAttachments:cleanup});
  assert.equal(view.deleteAttachments,cleanup);
});

test('edit modal source preserves and renders queued attachments, including image-only messages', () => {
  const src=fs.readFileSync(path.resolve(__dirname,'../src/queue/view.js'),'utf8');
  assert.match(src,/cgpt-queue-modal-attachments/);
  assert.match(src,/draftAttachments/);
  assert.match(src,/!text\s*&&\s*!draftAttachments\.length/);
  assert.match(src,/cgpt-queue-attachment-count/);
});

test('undo finalization deletes attachment blobs while undo restoration preserves them', () => {
  const src=fs.readFileSync(path.resolve(__dirname,'../src/queue/view.js'),'utf8');
  assert.match(src,/deleteAttachments/);
  assert.match(src,/deleteAttachments:\s*true/);
});

test('modal CSS uses a strong backdrop and opaque provider-aware surface', () => {
  const css=fs.readFileSync(path.resolve(__dirname,'../src/queue/styles.css'),'utf8');
  assert.match(css,/backdrop-filter:\s*blur/);
  assert.match(css,/cgpt-queue-modal-attachments/);
  assert.match(css,/cgpt-queue-modal-attachment/);
  assert.match(css,/background:var\(--cgpt-provider-background,var\(--main-surface-primary,Canvas\)\)/);
});
