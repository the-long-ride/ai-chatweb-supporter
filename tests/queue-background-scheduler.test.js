const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createReconcileScheduler } = require('../src/queue/scheduler.js');

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('visible scheduler coalesces through requestAnimationFrame', async () => {
  let frame;
  let calls = 0;
  const scheduler = createReconcileScheduler({
    doc:{ visibilityState:'visible' },
    win:{ requestAnimationFrame(cb){ frame = cb; return 1; } },
    reconcile:async () => { calls += 1; },
  });
  scheduler.schedule();
  scheduler.schedule();
  assert.equal(calls, 0);
  frame();
  await flush();
  assert.equal(calls, 1);
});

test('hidden scheduler does not depend on requestAnimationFrame', async () => {
  let rafCalls = 0;
  let calls = 0;
  const scheduler = createReconcileScheduler({
    doc:{ visibilityState:'hidden' },
    win:{ requestAnimationFrame(){ rafCalls += 1; } },
    reconcile:async () => { calls += 1; },
  });
  scheduler.schedule();
  scheduler.schedule();
  await flush();
  assert.equal(rafCalls, 0);
  assert.equal(calls, 1);
});

test('runtime uses scheduler, visibility wake, worker wake, and registration', () => {
  const runtime = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
  assert.match(runtime, /queueScheduler/);
  assert.match(runtime, /visibilitychange/);
  assert.match(runtime, /aichat:queue-reconcile/);
  assert.match(runtime, /aichat:queue-register/);
});
