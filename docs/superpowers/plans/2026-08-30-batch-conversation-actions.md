# Batch Conversation Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native-looking in-page multi-select controls that batch-archive ChatGPT conversations and batch-delete ChatGPT, Claude, and Grok conversations after explicit confirmation.

**Architecture:** A provider-agnostic batch core owns selection and sequential execution; shared DOM/controller modules own lifecycle and injected UI; each existing provider adapter owns its site-specific sidebar selectors and request contract. Requests use the current same-origin browser session and never persist or embed captured authentication material.

**Tech Stack:** Manifest V3 Chromium content scripts, dependency-free CommonJS/browser modules, DOM APIs, `fetch`, Node built-in `node:test` and `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-08-30-batch-conversation-actions-design.md`

## Global Constraints

- ChatGPT supports archive and delete; Claude and Grok support delete only.
- Every destructive batch requires one native confirmation dialog before the first request.
- Run mutations sequentially and continue after individual failures.
- Successful IDs are removed from selection; failed IDs remain selected for retry.
- Do not persist conversation IDs, titles, cookies, bearer tokens, device IDs, Cloudflare values, or session IDs.
- Prefer semantic attributes and hrefs from the supplied DOM captures; never depend on generated React/Radix IDs or hashed asset names.
- Reuse native button classes/CSS variables where possible; extension CSS is structural fallback only.
- Keep the subsystem independent of prompt queueing and sidebar resizing.
- Use dependency-free `node --test tests/*.test.js` tests.

---

## File map

- Create `src/batch/core.js`: pure selection and sequential batch helpers.
- Create `src/batch/dom.js`: injected control creation, row decoration, selected-state attributes, cleanup helpers.
- Create `src/batch/controller.js`: provider resolution, reconciliation, selection mode, confirmation, execution lifecycle.
- Create `src/batch/styles.css`: minimal fallback layout/selection styles keyed by extension data attributes.
- Modify `src/providers/chatgpt.js`: ChatGPT recent-list selectors plus archive/delete fetch adapters.
- Modify `src/providers/claude.js`: Claude recent-list selectors, active-organization resolver, delete adapter.
- Modify `src/providers/grok.js`: Grok recent-list selectors and soft-delete adapter.
- Modify `manifest.json`: load batch modules/styles on all three sites after provider registry.
- Create `tests/batch-core.test.js`: pure state and execution tests.
- Create `tests/provider-batch.test.js`: provider DOM/request contract tests using fakes.
- Create `tests/batch-controller.test.js`: controller lifecycle tests with a minimal fake DOM/provider surface.
- Modify `tests/manifest.test.js`: exact batch script/style ordering and file-existence expectations.

---

### Task 1: Pure batch core

**Files:**
- Create: `src/batch/core.js`
- Test: `tests/batch-core.test.js`

**Interfaces:**
- Produces: `createSelection(initial?) -> Set<string>`
- Produces: `toggleSelection(selection, id) -> boolean` where return value is the new selected state.
- Produces: `clearSelection(selection) -> Set<string>`
- Produces: `confirmationMessage(action, count) -> string`
- Produces: `actionEnabled({ selection, busy, supported }) -> boolean`
- Produces: `runSequential(ids, operation) -> Promise<{ succeeded:string[], failed:Array<{id,error}> }>`

- [ ] **Step 1: Write the failing core tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/batch/core.js');

test('selection toggles and clears deterministically', () => {
  const selected = core.createSelection(['a']);
  assert.equal(core.toggleSelection(selected, 'b'), true);
  assert.deepEqual([...selected], ['a', 'b']);
  assert.equal(core.toggleSelection(selected, 'a'), false);
  assert.deepEqual([...selected], ['b']);
  assert.equal(core.clearSelection(selected), selected);
  assert.equal(selected.size, 0);
});

test('confirmation copy includes action and exact count', () => {
  assert.equal(core.confirmationMessage('archive', 8), 'Archive 8 selected conversations?');
  assert.equal(core.confirmationMessage('delete', 1), 'Delete 1 selected conversation?');
});

test('actions require support, selection, and idle state', () => {
  const selection = new Set(['x']);
  assert.equal(core.actionEnabled({ selection, busy: false, supported: true }), true);
  assert.equal(core.actionEnabled({ selection, busy: true, supported: true }), false);
  assert.equal(core.actionEnabled({ selection: new Set(), busy: false, supported: true }), false);
  assert.equal(core.actionEnabled({ selection, busy: false, supported: false }), false);
});

test('sequential runner preserves order and continues after failures', async () => {
  const calls = [];
  const result = await core.runSequential(['a', 'b', 'c'], async (id) => {
    calls.push(id);
    if (id === 'b') throw new Error('boom');
  });
  assert.deepEqual(calls, ['a', 'b', 'c']);
  assert.deepEqual(result.succeeded, ['a', 'c']);
  assert.deepEqual(result.failed.map((entry) => entry.id), ['b']);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/batch-core.test.js`

Expected: FAIL because `src/batch/core.js` does not exist.

- [ ] **Step 3: Implement the minimal pure core**

```js
(() => {
  'use strict';
  function createSelection(initial = []) { return new Set(Array.from(initial || []).filter(Boolean)); }
  function toggleSelection(selection, id) { if (!selection || !id) return false; if (selection.has(id)) { selection.delete(id); return false; } selection.add(id); return true; }
  function clearSelection(selection) { selection?.clear?.(); return selection; }
  function confirmationMessage(action, count) { const verb = action === 'archive' ? 'Archive' : 'Delete'; return `${verb} ${count} selected conversation${count === 1 ? '' : 's'}?`; }
  function actionEnabled({ selection, busy = false, supported = true } = {}) { return Boolean(supported && !busy && selection?.size); }
  async function runSequential(ids, operation) { const succeeded = []; const failed = []; for (const id of Array.from(ids || [])) { try { await operation(id); succeeded.push(id); } catch (error) { failed.push({ id, error }); } } return { succeeded, failed }; }
  const api = { createSelection, toggleSelection, clearSelection, confirmationMessage, actionEnabled, runSequential };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).batchCore = api;
})();
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/batch-core.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/batch/core.js tests/batch-core.test.js
git commit -m "feat: add batch conversation core"
```

---

### Task 2: Provider batch adapters

**Files:**
- Modify: `src/providers/chatgpt.js`
- Modify: `src/providers/claude.js`
- Modify: `src/providers/grok.js`
- Create: `tests/provider-batch.test.js`

**Interfaces:**
- Consumes: existing provider `id`, `matchesLocation`, and URL parsing helpers.
- Produces on each provider: `batch` object matching the design spec contract.
- Network methods throw `Error` on non-2xx responses and return `true` on success.

- [ ] **Step 1: Write provider contract tests**

Tests must use fake DOM objects implementing only the queried selectors and fake `fetch` functions that record URL/options. Cover:

```js
assert.equal(chatgpt.batch.supportsArchive, true);
assert.equal(claude.batch.supportsArchive, false);
assert.equal(grok.batch.supportsArchive, false);

// ChatGPT ID from href with query string and options-trigger fallback.
// Claude ID from data-row-key="chat:{id}" and /chat/{id} fallback.
// Grok ID from /c/{id}.

await chatgpt.batch.archiveConversation('abc', { fetch: fakeFetch });
assert.deepEqual(calls[0], {
  url: '/backend-api/conversation/abc',
  method: 'PATCH',
  body: JSON.stringify({ is_archived: true }),
});

await chatgpt.batch.deleteConversation('abc', { fetch: fakeFetch });
assert.equal(calls[0].url, '/backend-api/conversation/id/abc');
assert.equal(calls[0].method, 'DELETE');

await grok.batch.deleteConversation('abc', { fetch: fakeFetch });
assert.equal(calls[0].url, '/rest/app-chat/conversations/soft/abc');
assert.equal(calls[0].method, 'DELETE');

await claude.batch.deleteConversation('abc', {
  fetch: fakeFetch,
  document: fakeDocumentWithLastActiveOrg('org-1'),
});
assert.equal(calls.at(-1).url, '/api/organizations/org-1/chat_conversations/abc');
assert.equal(calls.at(-1).method, 'DELETE');
```

Also assert every mutation uses `credentials: 'include'`, ChatGPT archive uses `content-type: application/json`, and no captured token/cookie literals appear in provider source.

- [ ] **Step 2: Run provider tests and verify RED**

Run: `node --test tests/provider-batch.test.js`

Expected: FAIL because provider `.batch` adapters do not exist.

- [ ] **Step 3: Implement semantic DOM selectors and request helpers**

ChatGPT methods:

```js
function findConversationSection(doc = globalThis.document) { return doc?.querySelector?.('#history') || null; }
function findConversationHeader(section) { return section?.closest?.('.group/sidebar-expando-section')?.querySelector?.('.group/sidebar-expando-section-header') || section?.parentElement?.previousElementSibling || null; }
function listConversationRows(section) { return Array.from(section?.querySelectorAll?.('a[data-sidebar-item="true"][href*="/c/"]') || []); }
function getConversationAnchor(row) { return row?.matches?.('a[href*="/c/"]') ? row : row?.querySelector?.('a[href*="/c/"]') || null; }
function getConversationId(row) { const anchor = getConversationAnchor(row); const fromHref = extractConversationId(anchor?.getAttribute?.('href') || anchor?.href || ''); if (fromHref) return fromHref; return row?.querySelector?.('[data-conversation-options-trigger]')?.getAttribute?.('data-conversation-options-trigger') || null; }
```

ChatGPT network methods use same-origin relative URLs, `credentials: 'include'`, no hard-coded auth headers, and `ensureOk(response, action, id)`.

Claude methods:

```js
function findConversationSection(doc = globalThis.document) { return doc?.querySelector?.('[data-testid="sidebar-recents"]') || null; }
function listConversationRows(section) { return Array.from(section?.querySelectorAll?.('[data-row-key^="chat:"]') || []); }
function getConversationId(row) { const key = row?.getAttribute?.('data-row-key') || ''; if (key.startsWith('chat:')) return key.slice(5); return extractConversationId(row?.querySelector?.('a[href*="/chat/"]')?.getAttribute?.('href') || ''); }
```

Resolve active organization in this order without persisting it: a DOM/page-state hint when available, `document.cookie` `lastActiveOrg`, then an authenticated lightweight resolver endpoint only if needed. The initial implementation should support `lastActiveOrg` from the current page cookie and an injectable `resolveOrganizationId` override in context for tests/future hardening.

Claude delete should first attempt the minimal server-compatible body `{uuid:id}` only when a body is required by the contract; keep body construction local and do not reproduce captured conversation metadata. If runtime validation later shows bodyless delete works, it can be simplified.

Grok methods mirror ChatGPT href extraction and use the soft-delete endpoint.

- [ ] **Step 4: Run provider tests and existing provider tests**

Run:

```bash
node --test tests/provider-batch.test.js tests/providers.test.js tests/provider-attachments.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/chatgpt.js src/providers/claude.js src/providers/grok.js tests/provider-batch.test.js
git commit -m "feat: add provider batch conversation adapters"
```

---

### Task 3: Batch DOM and controller lifecycle

**Files:**
- Create: `src/batch/dom.js`
- Create: `src/batch/controller.js`
- Create: `src/batch/styles.css`
- Create: `tests/batch-controller.test.js`

**Interfaces:**
- Consumes: `batchCore`, `providerRegistry`, provider `.batch` adapter.
- Produces: `BatchController` with `bootstrap()`, `reconcile()`, `enterSelectionMode()`, `exitSelectionMode()`, `toggleRow(row)`, `runAction(action)`.
- Produces DOM helpers: `createIconButton`, `decorateRow`, `setRowSelected`, `cleanupInjected`, `findInjected`.

- [ ] **Step 1: Write controller/DOM tests**

Use a deliberately small fake DOM/provider surface and test behavior rather than CSS implementation details:

```js
test('reconcile injects one select control and is idempotent', ...);
test('selection mode decorates rows and row click prevents navigation', ...);
test('delete/archive actions are disabled with zero selected IDs', ...);
test('cancel cleans controls and selection state', ...);
test('rejected confirmation performs zero provider mutations', ...);
test('partial failures leave only failed IDs selected', ...);
test('successful completion exits selection mode', ...);
```

For `runAction`, inject `confirm`, `fetch`, and provider action functions so tests never touch the network.

- [ ] **Step 2: Run controller tests and verify RED**

Run: `node --test tests/batch-controller.test.js`

Expected: FAIL because batch DOM/controller modules do not exist.

- [ ] **Step 3: Implement minimal DOM utilities**

`createIconButton(doc, { label, template, icon, onClick })` creates a `button[type=button]`, copies the nearby native button `className` when available, sets `aria-label`, `title`, and `data-ai-chatweb-batch-control`, then inserts a small inline SVG fallback icon. Do not clone generated IDs, `aria-controls`, `aria-expanded`, or site event handlers.

`decorateRow` adds one `data-ai-chatweb-batch-row` selector and one selection button; repeated calls reuse the existing injected button. `setRowSelected` toggles only extension-owned attributes/classes. `cleanupInjected` removes extension-owned controls/attributes only.

- [ ] **Step 4: Implement the controller**

Core controller flow:

```js
class BatchController {
  constructor({ win = globalThis.window, doc = globalThis.document, registry = providerRegistry, confirm = (...args) => win.confirm(...args), fetch = (...args) => win.fetch(...args) } = {}) { /* state */ }

  reconcile() {
    this.provider = this.registry.getProvider(this.win.location.href);
    this.adapter = this.provider?.batch || null;
    const section = this.adapter?.findConversationSection?.(this.doc);
    if (!section) { this.exitSelectionMode(); return; }
    this.section = section;
    this.ensureHeaderControls();
    if (this.selectionMode) this.decorateRows();
  }

  async runAction(action) {
    const ids = [...this.selection];
    if (!ids.length || this.busy) return;
    const operation = action === 'archive' ? this.adapter.archiveConversation : this.adapter.deleteConversation;
    if (typeof operation !== 'function') return;
    if (!this.confirm(core.confirmationMessage(action, ids.length))) return;
    this.busy = true;
    this.renderActionState();
    const result = await core.runSequential(ids, (id) => operation(id, { window: this.win, document: this.doc, fetch: this.fetch }));
    for (const id of result.succeeded) this.selection.delete(id);
    this.busy = false;
    if (!result.failed.length) this.exitSelectionMode();
    else this.reconcile();
  }
}
```

Attach one capturing click listener while selection mode is active so clicks on conversation anchors prevent default/navigation and toggle the provider-derived conversation ID. Keep the listener scoped to the current section.

Use one `MutationObserver` with `requestAnimationFrame` scheduling and ignore mutations whose added/removed nodes are entirely extension-owned.

- [ ] **Step 5: Add fallback CSS**

CSS must use only extension selectors such as:

```css
[data-ai-chatweb-batch-controls] { display: inline-flex; align-items: center; gap: .25rem; }
[data-ai-chatweb-batch-select] { flex: 0 0 auto; }
[data-ai-chatweb-batch-selected="true"] { background: var(--interactive-bg-secondary-selected, var(--df-selected, var(--button-ghost-active, rgba(127,127,127,.14)))); }
[data-ai-chatweb-batch-mode="true"] [data-ai-chatweb-batch-native-action] { pointer-events: none; opacity: 0; }
```

Do not assign fixed theme colors.

- [ ] **Step 6: Run focused and existing sidebar/queue tests**

Run:

```bash
node --test tests/batch-controller.test.js tests/sidebar-controller.test.js tests/sidebar-dom.test.js tests/queue-controller.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/batch/dom.js src/batch/controller.js src/batch/styles.css tests/batch-controller.test.js
git commit -m "feat: add batch conversation selection UI"
```

---

### Task 4: Manifest integration and regression coverage

**Files:**
- Modify: `manifest.json`
- Modify: `tests/manifest.test.js`

**Interfaces:**
- Consumes: new batch source files from Tasks 1–3.
- Produces: deterministic content-script order for all three sites.

- [ ] **Step 1: Change manifest test expectations first**

Expected provider/runtime ordering:

```js
const batchRuntime = ['src/batch/core.js', 'src/batch/dom.js', 'src/batch/controller.js'];
```

For each content script, provider file and `src/providers/registry.js` must load before `batchRuntime`, then queue-specific modules continue as before. Each site CSS list gains `src/batch/styles.css` while preserving existing sidebar/queue CSS.

Add an assertion that production `src/` files do not contain known secret marker strings such as `__Secure-next-auth.session-token`, `sk-ant-sid`, `cf_clearance`, or literal `authorization"="Bearer` copied from the captures.

- [ ] **Step 2: Run manifest test and verify RED**

Run: `node --test tests/manifest.test.js`

Expected: FAIL because batch files are not yet referenced.

- [ ] **Step 3: Update `manifest.json`**

ChatGPT/Grok order:

```text
shared constants/storage
sidebar core/dom/controller
queue core/dom/attachments
provider
provider registry
batch core/dom/controller
queue scope/ui/view/controller/runtime
```

Claude order is the same minus sidebar modules and retaining `claude-auto-continue.js` immediately after `claude.js` and before registry.

CSS:

- ChatGPT/Grok: sidebar + queue + batch.
- Claude: queue + batch.

Do not add new permissions.

- [ ] **Step 4: Run manifest and full tests**

Run:

```bash
node --test tests/manifest.test.js
node --test tests/*.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add manifest.json tests/manifest.test.js
git commit -m "feat: load batch conversation actions"
```

---

### Task 5: Final verification and branch audit

**Files:**
- Review all files changed from `master...feat/batch-conversation-actions`.

**Interfaces:**
- Produces: verified branch ready for browser/manual testing or PR.

- [ ] **Step 1: Run complete automated test suite**

Run: `node --test tests/*.test.js`

Expected: every test passes with exit code 0.

- [ ] **Step 2: Audit secrets and permissions**

Run searches equivalent to:

```bash
grep -R -n -E 'sk-ant-sid|__Secure-next-auth\.session-token|cf_clearance|Bearer eyJ' src tests manifest.json || true
```

Expected: no production secret material.

Verify `manifest.json` permissions remain `['storage']` and host permissions remain `['https://api.github.com/*']`.

- [ ] **Step 3: Review diff for scope**

Confirm the branch contains only:

- approved design/plan docs;
- batch subsystem files;
- provider adapter extensions;
- batch tests;
- manifest integration.

No unrelated popup, queue, sidebar-resizer, release-version, or changelog changes.

- [ ] **Step 4: Record browser validation items**

Manual validation remains required for live-site request acceptance and exact native visual matching because automated Node tests cannot exercise the authenticated ChatGPT/Claude/Grok browser sessions. Validate on disposable conversations before using a large batch.
