const test = require('node:test');
const assert = require('node:assert/strict');
const dom = require('../src/queue/dom.js');
const chatgpt = require('../src/providers/chatgpt.js');
const claude = require('../src/providers/claude.js');
const grok = require('../src/providers/grok.js');

class FakeEvent { constructor(type, options={}) { this.type=type; this.bubbles=Boolean(options.bubbles); } }
class FakeDataTransfer {
  constructor(){ const values=[]; this.items={add(file){values.push(file);}}; Object.defineProperty(this,'files',{get(){return values.slice();}}); }
}
const win = { Event:FakeEvent, DataTransfer:FakeDataTransfer, getComputedStyle:()=>({display:'block',visibility:'visible',pointerEvents:'auto'}) };

function fixture() {
  const events=[];
  const input={ files:[], multiple:true, dispatchEvent(event){events.push(event); return true;} };
  const removeA={clicks:0,click(){this.clicks++;}};
  const removeB={clicks:0,click(){this.clicks++;}};
  const scope={
    parentElement:{},
    querySelectorAll(selector){
      if(selector==='input[type="file"]') return [input];
      if(selector.includes('Remove attachment') || selector.includes('Remove file') || selector.includes('Remove image')) return [removeA,removeB];
      return [];
    },
    querySelector(selector){
      if(selector==='input[type="file"]') return input;
      return null;
    },
  };
  const composer={ parentElement:{}, closest(selector){ return selector==='form' || selector==='fieldset' || selector==='[data-testid*="composer" i]' ? scope : null; } };
  const doc={ querySelectorAll(selector){ return selector==='input[type="file"]'?[input]:[]; }, querySelector(selector){ return selector==='input[type="file"]'?input:null; } };
  return {events,input,removeA,removeB,scope,composer,doc};
}

test('DOM helper assigns many files to a hidden input and dispatches change', () => {
  const input={files:[],events:[],dispatchEvent(e){this.events.push(e);}};
  const files=[{name:'a.png'},{name:'b.pdf'}];
  assert.equal(dom.assignFilesToInput(input,files,win),true);
  assert.deepEqual(input.files,files);
  assert.deepEqual(input.events.map(e=>e.type),['change']);
});

test('all providers expose selected-file capture, attachment replay, and clearing', () => {
  for (const provider of [chatgpt,claude,grok]) {
    const f=fixture();
    const files=[{name:'a.png'},{name:'b.pdf'}];
    f.input.files=[files[0]];
    assert.deepEqual(provider.getSelectedFiles(f.composer,f.doc,win),[files[0]]);
    assert.equal(provider.attachFiles(f.composer,files,f.doc,win),true);
    assert.deepEqual(f.input.files,files);
    assert.equal(provider.clearAttachments(f.composer,f.doc,win),true);
    assert.equal(f.input.files.length,0);
    assert.ok(f.removeA.clicks>0);
    assert.ok(f.removeB.clicks>0);
  }
});

test('providers detect and clear a file input rendered outside composer scope', () => {
  for (const provider of [chatgpt, claude, grok]) {
    const events=[];
    const input={ files:[{name:'outside.png'}], dispatchEvent(event){events.push(event); return true;} };
    const scope={ parentElement:{}, querySelectorAll(){return [];}, querySelector(){return null;} };
    const composer={ parentElement:{}, closest(selector){ return ['form','fieldset','[data-testid*="composer" i]'].includes(selector) ? scope : null; } };
    const doc={
      querySelectorAll(selector){ return selector==='input[type="file"]' ? [input] : []; },
      querySelector(selector){ return selector==='input[type="file"]' ? input : null; },
    };
    assert.equal(provider.hasAttachments(composer,doc), true);
    assert.equal(provider.clearAttachments(composer,doc,win), true);
    assert.equal(input.files.length,0);
    assert.deepEqual(events.map((event)=>event.type),['change']);
  }
});
