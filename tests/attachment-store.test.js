const test = require('node:test');
const assert = require('node:assert/strict');

test('attachment message handler stores, reads, and deletes chunks', async () => {
  const { createMessageHandler } = require('../src/background/attachment-store.js');
  const meta = new Map();
  const chunks = new Map();
  const store = {
    async begin(attachment){ meta.set(attachment.id, attachment); },
    async putChunk(id,index,data){ chunks.set(`${id}:${index}`, data); },
    async getChunk(id,index){ return chunks.get(`${id}:${index}`); },
    async deleteAttachment(id){ meta.delete(id); for (const key of [...chunks.keys()]) if (key.startsWith(`${id}:`)) chunks.delete(key); },
  };
  const handle = createMessageHandler(store);
  const attachment = { id:'a', name:'x.png', type:'image/png', size:3, lastModified:1, kind:'image', chunkCount:1 };
  assert.deepEqual(await handle({type:'aichat:attachment-begin',attachment}), {ok:true});
  assert.deepEqual(await handle({type:'aichat:attachment-chunk',id:'a',index:0,data:'YWJj'}), {ok:true});
  assert.deepEqual(await handle({type:'aichat:attachment-get-chunk',id:'a',index:0}), {ok:true,data:'YWJj'});
  assert.deepEqual(await handle({type:'aichat:attachment-delete',id:'a'}), {ok:true});
  assert.equal(meta.size,0); assert.equal(chunks.size,0);
  assert.equal(handle({type:'other'}), undefined);
});

test('attachment message handler returns safe error responses', async () => {
  const { createMessageHandler } = require('../src/background/attachment-store.js');
  const handle = createMessageHandler({ async begin(){ throw new Error('disk failed'); } });
  assert.deepEqual(await handle({type:'aichat:attachment-begin',attachment:{id:'a'}}), {ok:false,error:'disk failed'});
});
