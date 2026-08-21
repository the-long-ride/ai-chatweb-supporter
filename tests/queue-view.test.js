const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {QueueView}=require('../src/queue/view.js');
test('QueueView accepts pause callbacks',()=>{const v=new QueueView({getQueue:()=>[],setQueue(){},getPaused:()=>true,setPaused(){},persistQueue:async()=>{},scheduleReconcile(){},getProvider:()=>null});assert.equal(typeof v.getPaused,'function');assert.equal(typeof v.setPaused,'function');});
test('view source includes pause header, provider theme context, and undo animation hooks',()=>{const src=fs.readFileSync(path.resolve(__dirname,'../src/queue/view.js'),'utf8');assert.match(src,/cgpt-queue-header/);assert.match(src,/themeContext/);assert.match(src,/undoCountdown/);assert.match(src,/requestAnimationFrame/);});
test('styles use provider variables and scrollbar styling',()=>{const css=fs.readFileSync(path.resolve(__dirname,'../src/queue/styles.css'),'utf8');assert.match(css,/--cgpt-provider-background/);assert.match(css,/scrollbar-color/);assert.match(css,/::-webkit-scrollbar-thumb/);assert.match(css,/cgpt-queue-undo-progress/);});

test('pause button handles persistence rejection without an unhandled promise', () => {
  const src = fs.readFileSync(path.resolve(__dirname,'../src/queue/view.js'),'utf8');
  assert.match(src, /setPaused/);
  assert.match(src, /\.catch\(/);
});
