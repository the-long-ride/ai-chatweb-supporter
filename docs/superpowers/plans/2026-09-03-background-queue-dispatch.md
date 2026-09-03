# Background Queue Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep queued-message dispatch working in open inactive ChatGPT/Claude tabs, while making queue action buttons equal-sized, increasing row spacing, and adding a safe Clear all control for the active queue scope.

**Architecture:** Add a dedicated content-script reconcile scheduler that uses rAF while visible and microtasks while hidden. Register open ChatGPT/Claude queue tabs with a small service-worker registry stored in `chrome.storage.session`; a periodic `chrome.alarms` wake sends only `aichat:queue-reconcile` to those tabs. Sending remains inside the authenticated provider page and keeps the existing durable remove-before-Send transaction. Clear all is implemented as an active-scope transaction in `queue/controller.js` and surfaced through the existing queue modal styling.

**Tech Stack:** Chromium Manifest V3, dependency-free JavaScript IIFEs/CommonJS test exports, `chrome.runtime`, `chrome.storage.session`, `chrome.alarms`, `chrome.tabs.sendMessage`, Node built-in `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-03-background-queue-dispatch-design.md`

## Global Constraints

- Queue support remains limited to ChatGPT and Claude; Grok must load no `src/queue/*` runtime or queue CSS.
- Background sending requires the provider tab to remain open and executable; closed/fully discarded tabs are out of scope.
- Do not call private ChatGPT/Claude message-send APIs.
- Preserve durable remove-before-Send and failed-send restoration semantics.
- Preserve Pause behavior and Steer's explicit busy override.
- Clear all affects only the currently visible active queue scope.
- Clear all deletes attachment blobs only after persisting the empty queue succeeds.
- Keep the extension dependency-free and Manifest V3 compatible.
- Target release remains `1.1.5`.

---

### Task 1: Queue action sizing, row spacing, and Clear all

**Files:**
- Modify: `src/queue/controller.js`
- Modify: `src/queue/view.js`
- Modify: `src/queue/styles.css`
- Modify: `src/queue/runtime.js`
- Test: `tests/queue-clear-all.test.js`
- Test: `tests/queue-action-layout.test.js`

**Interfaces:**
- Produces `clearQueuedItems({ state, persist, deleteAttachments }): Promise<{ cleared:boolean, count:number }>` from `src/queue/controller.js`.
- Extends `QueueView` constructor with `clearAllItems: () => Promise<boolean>`.
- Adds `openClearAllModal()` and `closeClearAllModal()` methods with a distinct `CLEAR_MODAL_ID`.

- [ ] **Step 1: Write failing Clear all transaction tests**

Create `tests/queue-clear-all.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { ActiveQueueState, clearQueuedItems } = require('../src/queue/controller.js');

function withQueue(items) {
  const state = new ActiveQueueState();
  state.setQueue(items);
  return state;
}

test('clearQueuedItems persists empty queue before attachment cleanup', async () => {
  const state = withQueue([
    { id:'a', text:'one', attachments:[{ id:'blob-a', name:'a.png', type:'image/png', size:1 }] },
    { id:'b', text:'two' },
  ]);
  const order = [];
  const result = await clearQueuedItems({
    state,
    persist: async () => order.push(['persist', state.queue.length]),
    deleteAttachments: async (items) => order.push(['delete', items.map((item) => item.id)]),
  });
  assert.deepEqual(result, { cleared:true, count:2 });
  assert.deepEqual(state.queue, []);
  assert.deepEqual(order, [['persist', 0], ['delete', ['blob-a']]]);
});

test('clearQueuedItems restores queue and does not delete attachments when persistence fails', async () => {
  const original = [{ id:'a', text:'one', attachments:[{ id:'blob-a', name:'a.png', type:'image/png', size:1 }] }];
  const state = withQueue(original);
  let deletes = 0;
  await assert.rejects(clearQueuedItems({
    state,
    persist: async () => { throw new Error('storage failed'); },
    deleteAttachments: async () => { deletes += 1; },
  }), /storage failed/);
  assert.deepEqual(state.queue, original);
  assert.equal(deletes, 0);
});
```

- [ ] **Step 2: Run RED test**

```bash
node --test tests/queue-clear-all.test.js
```

Expected: FAIL because `clearQueuedItems` does not exist.

- [ ] **Step 3: Implement `clearQueuedItems`**

Add to `src/queue/controller.js`:

```js
async function clearQueuedItems({ state, persist, deleteAttachments }) {
  const previous = state?.queue?.slice?.() || [];
  if (!previous.length) return { cleared:false, count:0 };
  const attachments = previous.flatMap((item) => core.normalizeAttachments(item.attachments));
  state.setQueue([]);
  try {
    await persist?.();
  } catch (error) {
    state.setQueue(previous);
    throw error;
  }
  if (attachments.length) {
    try { await deleteAttachments?.(attachments); } catch { /* queue remains cleared */ }
  }
  return { cleared:true, count:previous.length };
}
```

Export it through the existing controller API.

- [ ] **Step 4: Run GREEN test**

```bash
node --test tests/queue-clear-all.test.js
```

Expected: 2 passed, 0 failed.

- [ ] **Step 5: Write failing layout/UI tests**

Create `tests/queue-action-layout.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.resolve(__dirname, '../src/queue/styles.css'), 'utf8');
const view = fs.readFileSync(path.resolve(__dirname, '../src/queue/view.js'), 'utf8');

test('queue icon actions use the same fixed 28px square', () => {
  const block = css.match(/\.cgpt-queue-icon-button\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(block, /width:\s*28px/);
  assert.match(block, /min-width:\s*28px/);
  assert.match(block, /height:\s*28px/);
  assert.doesNotMatch(block, /width:\s*auto/);
});

test('queue rows have six pixels of vertical separation', () => {
  const block = css.match(/\.cgpt-queue-scroll\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(block, /gap:\s*6px/);
});

test('queue header exposes dedicated Clear all modal lifecycle', () => {
  assert.match(view, /Clear all queued messages/);
  assert.match(view, /CLEAR_MODAL_ID/);
  assert.match(view, /openClearAllModal/);
  assert.match(view, /closeClearAllModal/);
  assert.match(view, /clearAllItems/);
});
```

- [ ] **Step 6: Run RED layout/UI tests**

```bash
node --test tests/queue-action-layout.test.js
```

Expected: FAIL for old `width:auto`, old `gap:4px`, and missing Clear all modal.

- [ ] **Step 7: Implement queue UI changes**

In `src/queue/view.js`:

- Add `const CLEAR_MODAL_ID = 'cgpt-message-queue-clear-modal';`.
- Extend constructor: `clearAllItems = async () => false` and set `this.clearAllItems`.
- Add `closeClearAllModal() { document.getElementById(CLEAR_MODAL_ID)?.remove(); }`.
- Add `openClearAllModal()` using existing `.cgpt-queue-modal-overlay` and `.cgpt-queue-modal` classes. Copy:

```text
Clear all queued messages?
This removes every queued message in this conversation.
Cancel | Clear all
```

- On Cancel, call `this.closeClearAllModal()`.
- On confirmed Clear all:

```js
void Promise.resolve(this.clearAllItems()).then((cleared) => {
  if (!cleared) return;
  this.closeClearAllModal();
  this.render();
  this.scheduleReconcile();
}).catch(() => this.render());
```

- Wrap Pause/Resume and the new icon-only Clear all button in `span.cgpt-queue-header-actions`:

```js
const headerActions = document.createElement('span');
headerActions.className = 'cgpt-queue-header-actions';
const clearAll = this.iconButton('delete', 'Clear all queued messages', () => this.openClearAllModal());
clearAll.classList.add('cgpt-queue-clear-all');
headerActions.append(toggle, clearAll);
header.append(label, headerActions);
```

In `src/queue/runtime.js`, destructure `clearQueuedItems` from controller API and pass:

```js
clearAllItems: async () => {
  const result = await clearQueuedItems({
    state,
    persist: persistQueue,
    deleteAttachments: (items) => attachmentApiDefault.deleteAttachments(items),
  });
  return result.cleared;
},
```

In `src/queue/styles.css` change/add:

```css
.cgpt-queue-scroll{gap:6px}
.cgpt-queue-header-actions{display:inline-flex;align-items:center;gap:4px}
.cgpt-queue-icon-button{display:inline-flex;align-items:center;justify-content:center;width:28px;min-width:28px;height:28px;padding:5px;gap:0}
.cgpt-queue-clear-all{flex:none}
```

Keep Steer/Edit/Delete icon size equal and keep grab cursor behavior unchanged.

- [ ] **Step 8: Verify Task 1**

```bash
node --test tests/queue-clear-all.test.js tests/queue-action-layout.test.js tests/queue-steer-reorder.test.js tests/queue-dispatch-transaction.test.js
```

Expected: 0 failures.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/queue/controller.js src/queue/view.js src/queue/styles.css src/queue/runtime.js tests/queue-clear-all.test.js tests/queue-action-layout.test.js
git commit -m "feat(queue): add clear-all controls and align queue actions"
```

---

### Task 2: Background-safe content-script scheduler

**Files:**
- Create: `src/queue/scheduler.js`
- Modify: `src/queue/runtime.js`
- Modify: `manifest.json`
- Modify: `tests/manifest.test.js`
- Test: `tests/queue-background-scheduler.test.js`

**Interfaces:**
- Produces `createReconcileScheduler({ doc, win, reconcile }) -> { schedule() }`.
- Runtime accepts `aichat:queue-reconcile` wake messages and sends `aichat:queue-register`.

- [ ] **Step 1: Write failing scheduler tests**

Create `tests/queue-background-scheduler.test.js`:

```js
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
```

- [ ] **Step 2: Run RED scheduler tests**

```bash
node --test tests/queue-background-scheduler.test.js
```

Expected: FAIL because `scheduler.js` does not exist.

- [ ] **Step 3: Implement `src/queue/scheduler.js`**

```js
(() => {
  'use strict';
  function createReconcileScheduler({ doc = globalThis.document, win = globalThis.window, reconcile }) {
    let pending = false;
    const run = () => {
      pending = false;
      void Promise.resolve(reconcile?.()).catch(() => {});
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      if (doc?.visibilityState === 'hidden') {
        const enqueue = win?.queueMicrotask || globalThis.queueMicrotask || ((cb) => Promise.resolve().then(cb));
        enqueue(run);
        return;
      }
      const raf = win?.requestAnimationFrame;
      if (typeof raf === 'function') raf(run);
      else (win?.setTimeout || setTimeout)(run, 0);
    };
    return { schedule };
  }
  const api = { createReconcileScheduler };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).queueScheduler = api;
})();
```

- [ ] **Step 4: Run GREEN scheduler tests**

```bash
node --test tests/queue-background-scheduler.test.js
```

Expected: 2 passed, 0 failed.

- [ ] **Step 5: Add failing runtime wiring assertions**

Append to `tests/queue-background-scheduler.test.js`:

```js
const runtime = fs.readFileSync(path.resolve(__dirname, '../src/queue/runtime.js'), 'utf8');
test('runtime uses scheduler, visibility wake, worker wake, and registration', () => {
  assert.match(runtime, /queueScheduler/);
  assert.match(runtime, /visibilitychange/);
  assert.match(runtime, /aichat:queue-reconcile/);
  assert.match(runtime, /aichat:queue-register/);
});
```

Update `tests/manifest.test.js` expected ChatGPT/Claude queue runtime to include `src/queue/scheduler.js` immediately before `src/queue/runtime.js` and continue asserting Grok contains no queue files.

- [ ] **Step 6: Run RED wiring tests**

```bash
node --test tests/queue-background-scheduler.test.js tests/manifest.test.js
```

Expected: FAIL until runtime and manifest are wired.

- [ ] **Step 7: Integrate scheduler and wake listener**

In ChatGPT/Claude manifest entries add `src/queue/scheduler.js` immediately before runtime; do not add it to Grok.

In `src/queue/runtime.js`:

```js
const schedulerApi = namespace.queueScheduler;
```

Replace `reconcileFrame` scheduling with:

```js
const reconcileScheduler = schedulerApi.createReconcileScheduler({
  doc: document,
  win: window,
  reconcile: () => reconcile(),
});
function scheduleReconcile() { reconcileScheduler.schedule(); }
```

During bootstrap add:

```js
document.addEventListener('visibilitychange', scheduleReconcile, { passive:true });
globalThis.chrome?.runtime?.onMessage?.addListener((message) => {
  if (message?.type !== 'aichat:queue-reconcile') return undefined;
  scheduleReconcile();
  return undefined;
});
void globalThis.chrome?.runtime?.sendMessage?.({
  type:'aichat:queue-register',
  provider:activeProvider?.id,
});
```

The wake path must only schedule normal `reconcile()`; it must not call `dispatchQueuedItem()` directly.

- [ ] **Step 8: Verify Task 2**

```bash
node --test tests/queue-background-scheduler.test.js tests/manifest.test.js tests/queue-steer-busy.test.js tests/queue-dispatch-transaction.test.js
```

Expected: 0 failures.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/queue/scheduler.js src/queue/runtime.js manifest.json tests/queue-background-scheduler.test.js tests/manifest.test.js
git commit -m "feat(queue): reconcile queued sends in inactive tabs"
```

---

### Task 3: Service-worker wake registry and alarm fallback

**Files:**
- Create: `src/background/queue-wake.js`
- Modify: `src/background/service-worker.js`
- Modify: `manifest.json`
- Modify: `tests/manifest.test.js`
- Test: `tests/background-queue-wake.test.js`

**Interfaces:**
- Registry key: `aichat.queue.registeredTabs` in `chrome.storage.session`.
- Alarm name: `aichat:queue-wake`.
- Registration message: `aichat:queue-register`.
- Wake message: `aichat:queue-reconcile`.
- Only providers `chatgpt` and `claude` are accepted.

- [ ] **Step 1: Write failing worker tests**

Create `tests/background-queue-wake.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerQueueTab, wakeRegisteredQueueTabs, REGISTRY_KEY } = require('../src/background/queue-wake.js');

function fakeChrome() {
  const session = {};
  const sent = [];
  return {
    session,
    sent,
    storage:{ session:{
      async get(key){ return { [key]:session[key] }; },
      async set(values){ Object.assign(session, values); },
    } },
    tabs:{ async sendMessage(tabId, message){ sent.push([tabId, message]); } },
  };
}

test('registration accepts only ChatGPT and Claude', async () => {
  const chrome = fakeChrome();
  assert.equal(await registerQueueTab(chrome, 7, 'chatgpt'), true);
  assert.equal(await registerQueueTab(chrome, 8, 'claude'), true);
  assert.equal(await registerQueueTab(chrome, 9, 'grok'), false);
  assert.deepEqual(chrome.session[REGISTRY_KEY], { '7':'chatgpt', '8':'claude' });
});

test('wake sends only queue reconcile messages', async () => {
  const chrome = fakeChrome();
  chrome.session[REGISTRY_KEY] = { '7':'chatgpt', '8':'claude' };
  await wakeRegisteredQueueTabs(chrome);
  assert.deepEqual(chrome.sent, [
    [7, { type:'aichat:queue-reconcile' }],
    [8, { type:'aichat:queue-reconcile' }],
  ]);
});

test('unreachable tabs are pruned', async () => {
  const chrome = fakeChrome();
  chrome.session[REGISTRY_KEY] = { '7':'chatgpt', '8':'claude' };
  chrome.tabs.sendMessage = async (tabId) => { if (tabId === 7) throw new Error('gone'); };
  await wakeRegisteredQueueTabs(chrome);
  assert.deepEqual(chrome.session[REGISTRY_KEY], { '8':'claude' });
});
```

- [ ] **Step 2: Run RED worker tests**

```bash
node --test tests/background-queue-wake.test.js
```

Expected: FAIL because `queue-wake.js` does not exist.

- [ ] **Step 3: Implement worker helper**

Create `src/background/queue-wake.js` with:

```js
const REGISTRY_KEY = 'aichat.queue.registeredTabs';
const ALARM_NAME = 'aichat:queue-wake';
const WAKE_PERIOD_MINUTES = 1;
const ALLOWED_PROVIDERS = new Set(['chatgpt', 'claude']);
```

Implement `readRegistry`, `registerQueueTab`, and `wakeRegisteredQueueTabs` exactly around `chrome.storage.session` and `chrome.tabs.sendMessage` so unreachable tab IDs are pruned.

Implement `installQueueWake(chromeApi)` so it:

```js
chromeApi.alarms.create(ALARM_NAME, { periodInMinutes:WAKE_PERIOD_MINUTES });
chromeApi.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'aichat:queue-register') return undefined;
  void registerQueueTab(chromeApi, sender?.tab?.id, message.provider);
  return undefined;
});
chromeApi.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === ALARM_NAME) void wakeRegisteredQueueTabs(chromeApi);
});
```

Export all helpers for Node and attach API to `globalThis.AiChatWebQueueWake` for the service worker.

- [ ] **Step 4: Run GREEN worker tests**

```bash
node --test tests/background-queue-wake.test.js
```

Expected: 3 passed, 0 failed.

- [ ] **Step 5: Add failing service-worker/manifest wiring tests**

Append to worker test:

```js
const fs = require('node:fs');
const path = require('node:path');
const worker = fs.readFileSync(path.resolve(__dirname, '../src/background/service-worker.js'), 'utf8');
test('service worker imports and installs queue wake helper', () => {
  assert.match(worker, /queue-wake\.js/);
  assert.match(worker, /installQueueWake/);
});
```

Update `tests/manifest.test.js` to require permissions exactly `['storage', 'alarms']` in manifest order.

- [ ] **Step 6: Run RED wiring tests**

```bash
node --test tests/background-queue-wake.test.js tests/manifest.test.js
```

Expected: FAIL until permission/import/install are present.

- [ ] **Step 7: Wire service worker and manifest**

Change worker import to:

```js
importScripts('attachment-store.js', 'queue-wake.js');
```

Keep the existing `aichat:get-tab-id` listener and then call:

```js
globalThis.AiChatWebQueueWake?.installQueueWake?.(globalThis.chrome);
```

Change manifest permissions to:

```json
"permissions": ["storage", "alarms"]
```

Do not add new host permissions and do not modify Grok queue exclusion.

- [ ] **Step 8: Verify Task 3**

```bash
node --test tests/background-queue-wake.test.js tests/manifest.test.js tests/manifest-rich-content.test.js
```

Expected: 0 failures.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/background/queue-wake.js src/background/service-worker.js manifest.json tests/background-queue-wake.test.js tests/manifest.test.js
git commit -m "feat(queue): wake open provider tabs from service worker"
```

---

### Task 4: Release notes and full verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update existing 1.1.5 changelog section**

Add these entries without creating another version heading:

```markdown
### Added
- Background-safe queued-message dispatch for open inactive ChatGPT and Claude tabs, with a service-worker wake fallback.
- Compact Clear all control for the active queue scope, including attachment cleanup after successful persistence.

### Changed
- Queue Steer/Edit/Delete controls now use equal square hit areas and queued rows have slightly more vertical separation.
```

- [ ] **Step 2: Run focused queue/background tests**

```bash
node --test \
  tests/queue-clear-all.test.js \
  tests/queue-action-layout.test.js \
  tests/queue-background-scheduler.test.js \
  tests/background-queue-wake.test.js \
  tests/queue-dispatch-transaction.test.js \
  tests/queue-steer-busy.test.js \
  tests/queue-steer-reorder.test.js \
  tests/manifest.test.js \
  tests/manifest-rich-content.test.js \
  tests/product.test.js
```

Expected: 0 failures.

- [ ] **Step 3: Run syntax checks**

```bash
node --check src/queue/controller.js
node --check src/queue/view.js
node --check src/queue/runtime.js
node --check src/queue/scheduler.js
node --check src/background/queue-wake.js
node --check src/background/service-worker.js
```

Expected: every command exits 0.

- [ ] **Step 4: Run complete suite**

```bash
node --test tests/*.test.js
```

Expected: 0 failures. If this runtime cannot run the complete suite, record that limitation explicitly and do not claim full-suite success.

- [ ] **Step 5: Verify final manifest invariants**

Confirm:

- `version` remains `1.1.5`
- permissions are `storage` + `alarms`
- ChatGPT and Claude load `src/queue/scheduler.js`
- Grok loads no `src/queue/*` files and no queue CSS
- no queue text, cookies, bearer tokens, or attachment bytes are stored in the worker registry

- [ ] **Step 6: Commit release notes**

```bash
git add CHANGELOG.md
git commit -m "docs(release): document background queue dispatch"
```

- [ ] **Step 7: Update PR #11 validation notes**

Record exact focused/full-suite results, inactive-tab scheduler behavior, worker wake behavior, Clear all persistence/attachment ordering, equal action sizing, row spacing, Grok exclusion, and any environment limitation.
