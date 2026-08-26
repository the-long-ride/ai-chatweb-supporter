const test = require('node:test');
const assert = require('node:assert/strict');

function fakeFile(name, type, text, lastModified = 1) {
  const bytes = Buffer.from(text);
  return { name, type, size: bytes.length, lastModified, async arrayBuffer(){ return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } };
}

function memoryRuntime() {
  const meta = new Map();
  const chunks = new Map();
  const calls = [];
  return {
    calls, meta, chunks,
    sendMessage(message, callback) {
      calls.push(message.type);
      let response = { ok:true };
      if (message.type === 'aichat:attachment-begin') meta.set(message.attachment.id, message.attachment);
      else if (message.type === 'aichat:attachment-chunk') chunks.set(`${message.id}:${message.index}`, message.data);
      else if (message.type === 'aichat:attachment-get-chunk') response = { ok:true, data:chunks.get(`${message.id}:${message.index}`) };
      else if (message.type === 'aichat:attachment-delete') { meta.delete(message.id); for (const key of [...chunks.keys()]) if (key.startsWith(`${message.id}:`)) chunks.delete(key); }
      callback(response);
    },
    lastError: null,
  };
}

test('storeFiles chunks many images/files and loadFiles reconstructs them', async () => {
  const attachments = require('../src/queue/attachments.js');
  const runtime = memoryRuntime();
  let id = 0;
  const files = [fakeFile('a.png','image/png','abcdef'), fakeFile('b.txt','text/plain','12345')];
  const meta = await attachments.storeFiles(files, runtime, () => `att-${++id}`, 3);
  assert.deepEqual(meta.map(x => ({name:x.name,kind:x.kind,chunkCount:x.chunkCount})), [
    {name:'a.png',kind:'image',chunkCount:2},
    {name:'b.txt',kind:'file',chunkCount:2},
  ]);
  class FakeFile {
    constructor(parts, name, options) { this.bytes = Buffer.concat(parts.map(part => Buffer.from(part))); this.name=name; this.type=options.type; this.lastModified=options.lastModified; }
  }
  const restored = await attachments.loadFiles(meta, runtime, FakeFile);
  assert.deepEqual(restored.map(f => [f.name,f.type,f.bytes.toString()]), [['a.png','image/png','abcdef'],['b.txt','text/plain','12345']]);
  await attachments.deleteAttachments(meta, runtime);
  assert.equal(runtime.meta.size, 0);
  assert.equal(runtime.chunks.size, 0);
});

test('AttachmentCapture keeps pasted/dropped and selected files without duplicates', () => {
  const { AttachmentCapture } = require('../src/queue/attachments.js');
  const image = fakeFile('p.png','image/png','x',9);
  const doc = fakeFile('d.pdf','application/pdf','y',10);
  const capture = new AttachmentCapture();
  capture.captureEvent({ clipboardData:{ files:[image] } });
  capture.captureEvent({ dataTransfer:{ files:[doc,image] } });
  const provider = { getSelectedFiles(){ return [image,doc]; }, hasAttachments(){ return true; } };
  const current = capture.currentFiles(provider, {});
  assert.deepEqual(current.map(f => f.name), ['p.png','d.pdf']);
});

test('AttachmentCapture clears stale captures only after composer has no attachment evidence', () => {
  const { AttachmentCapture } = require('../src/queue/attachments.js');
  const capture = new AttachmentCapture({ graceMs:100 });
  const image = fakeFile('p.png','image/png','x',9);
  capture.remember([image], 1000);
  const provider = { hasAttachments(){ return false; }, getSelectedFiles(){ return []; } };
  capture.reconcile(provider, {}, 1050);
  assert.equal(capture.files.length, 1);
  capture.reconcile(provider, {}, 1201);
  assert.equal(capture.files.length, 0);
});
