const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../src/queue/controller.js');

const metadata=[{id:'att',name:'p.png',type:'image/png',size:3,lastModified:1,kind:'image',chunkCount:1}];

test('handleQueueShortcut queues image-only content after blob persistence then clears composer', async () => {
  const state=new controller.ActiveQueueState(); state.switchTo('chatgpt:conversation:a',{paused:false,items:[]});
  const calls=[]; const image={name:'p.png'};
  const provider={
    getComposerText(){return '';},
    setComposerText(_c,text){assert.equal(text,'');calls.push('clear-text');},
    clearAttachments(){calls.push('clear-attachments');return true;},
  };
  const attachmentApi={async storeFiles(files){assert.deepEqual(files,[image]);calls.push('store');return metadata;},async deleteAttachments(){calls.push('delete');}};
  const event={preventDefault(){calls.push('prevent');},stopImmediatePropagation(){calls.push('stop');}};
  const result=await controller.handleQueueShortcut({provider,state,composer:{},event,persist:async()=>calls.push('persist'),attachmentFiles:[image],attachmentApi,now:()=>2,idFactory:()=> 'q'});
  assert.equal(result,'queued');
  assert.deepEqual(calls,['prevent','stop','store','persist','clear-text','clear-attachments']);
  assert.deepEqual(state.queue,[{id:'q',text:'',attachments:metadata,createdAt:2}]);
});

test('attachment persistence or queue persistence failure never clears composer and removes staged blobs', async () => {
  const state=new controller.ActiveQueueState(); state.switchTo('chatgpt:conversation:a',{paused:false,items:[]});
  let cleared=false, deleted=false;
  const provider={getComposerText(){return 'caption';},setComposerText(){cleared=true;},clearAttachments(){cleared=true;}};
  const attachmentApi={async storeFiles(){return metadata;},async deleteAttachments(value){deleted=true;assert.deepEqual(value,metadata);}};
  const result=await controller.handleQueueShortcut({provider,state,composer:{},event:{preventDefault(){},stopImmediatePropagation(){}},persist:async()=>{throw new Error('disk');},attachmentFiles:[{name:'p.png'}],attachmentApi});
  assert.equal(result,'failed'); assert.equal(cleared,false); assert.equal(deleted,true); assert.deepEqual(state.queue,[]);
});

test('restoreQueuedAttachments reconstructs and attaches every queued file', async () => {
  const files=[{name:'a.png'},{name:'b.pdf'}]; let attached;
  const attachmentApi={async loadFiles(value){assert.deepEqual(value,metadata);return files;}};
  const provider={attachFiles(_composer,value){attached=value;return true;}};
  const result=await controller.restoreQueuedAttachments({item:{attachments:metadata},provider,composer:{},attachmentApi,doc:{},win:{}});
  assert.deepEqual(result,files); assert.deepEqual(attached,files);
});
