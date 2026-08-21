const test=require('node:test');const assert=require('node:assert/strict');const scope=require('../src/queue/scope.js');const chatgpt=require('../src/providers/chatgpt.js');const claude=require('../src/providers/claude.js');const grok=require('../src/providers/grok.js');
const q=(id)=>({id,text:id,createdAt:1});
test('provider-qualified scopes and keys',()=>{
 assert.equal(scope.resolveScope(chatgpt,'https://chatgpt.com/c/a',9),'chatgpt:conversation:a');
 assert.equal(scope.resolveScope(claude,'https://claude.ai/chat/b',9),'claude:conversation:b');
 assert.equal(scope.resolveScope(grok,'https://grok.com/',9),'grok:tab:9');
 assert.equal(scope.queueStorageKey('grok:conversation:x'),'cgptMessageQueue:grok:conversation:x');
});
test('legacy keys belong only to ChatGPT',()=>{assert.equal(scope.legacyScopedKey('chatgpt:conversation:a'),'cgptMessageQueue:conversation:a');assert.equal(scope.legacyScopedKey('claude:conversation:a'),null);assert.equal(scope.legacyGlobalKey('grok:tab:1'),null);});
test('same-provider tab promotion transfers items and pause',()=>{
 const p=scope.planScopeTransition({previousScope:'claude:tab:9',nextScope:'claude:conversation:b',previousState:{paused:true,items:[q('tab'),q('same')]},nextState:{paused:false,items:[q('conv'),q('same')]}});
 assert.equal(p.transfer,true);assert.equal(p.removePrevious,true);assert.equal(p.state.paused,true);assert.deepEqual(p.state.items.map(x=>x.id),['conv','same','tab']);
});
test('cross-provider promotion never transfers',()=>{const p=scope.planScopeTransition({previousScope:'chatgpt:tab:9',nextScope:'claude:conversation:b',previousState:{paused:true,items:[q('old')]},nextState:{paused:false,items:[q('new')]}});assert.equal(p.transfer,false);assert.deepEqual(p.state,{paused:false,items:[q('new')]});});
test('legacy migration preserves target pause and wraps array state',()=>{assert.deepEqual(scope.planLegacyMigration({scopedState:{paused:true,items:[]},legacyQueue:[q('legacy')]}),{migrate:true,state:{paused:true,items:[q('legacy')]},removeLegacy:true});});

test('same-provider promotion transfers paused state even when the tab queue is empty', () => {
  const plan = scope.planScopeTransition({
    previousScope: 'grok:tab:9',
    nextScope: 'grok:conversation:b',
    previousState: { paused: true, items: [] },
    nextState: { paused: false, items: [] },
  });
  assert.equal(plan.transfer, true);
  assert.equal(plan.removePrevious, true);
  assert.deepEqual(plan.state, { paused: true, items: [] });
});
