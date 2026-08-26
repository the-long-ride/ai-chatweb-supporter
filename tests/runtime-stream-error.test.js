const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../src/queue/runtime.js'),'utf8');
test('queue reconcile lets providers react to stream-error UI without a second observer',()=>{assert.match(source,/provider\.maybeFillStreamErrorContinuation\?\.\(composer, document, window\)/);});
