# Conversation-Scoped Queue Addendum

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This addendum extends the approved no-build architecture plan.

**Goal:** Isolate queued prompts to the active ChatGPT conversation, falling back to the Chromium tab ID before a conversation ID exists, without changing extension version `1.1.0`.

**Spec:** `docs/superpowers/specs/2026-08-21-no-build-architecture-refactor-design.md`

## Constraints

- Preserve queue item shape `{ id, text, createdAt }`.
- Preserve `cgptQueueShortcut` and `cgptSidebarResizerWidth`.
- Keep legacy `cgptMessageQueue` readable for one-time migration.
- Prefer `conversation:<conversation_id>` whenever `/c/<conversation_id>` is available.
- Use `tab:<tab_id>` only when no conversation ID can be resolved.
- Move a new-chat tab queue into the created conversation scope after URL transition.
- Never dispatch a queue belonging to a different active scope.
- Keep version exactly `1.1.0` and add no dependency/build step.

---

### Task A: Lock queue scope behavior with failing tests

**Files:**
- Create: `tests/queue-scope.test.js`
- Modify: `tests/manifest.test.js`

- [ ] Test conversation ID extraction from `https://chatgpt.com/c/abc123`.
- [ ] Test tab fallback scope `tab:42` when the URL has no conversation ID.
- [ ] Test scoped key generation `cgptMessageQueue:conversation:abc123` and `cgptMessageQueue:tab:42`.
- [ ] Test legacy migration policy and tab-to-conversation transfer policy as pure functions.
- [ ] Require `src/background/service-worker.js` and `src/queue/scope.js` in the manifest contract.
- [ ] Run `node --test tests/queue-scope.test.js tests/manifest.test.js` and confirm RED.

### Task B: Implement scope policy and tab-ID bridge

**Files:**
- Create: `src/queue/scope.js`
- Create: `src/background/service-worker.js`
- Modify: `src/shared/constants.js`
- Modify: `manifest.json`

**Interfaces:**
- `scope.extractConversationId(url)` -> string|null.
- `scope.resolveScope(url, tabId)` -> `conversation:<id>` or `tab:<id>`.
- `scope.queueStorageKey(scopeId)` -> scoped queue storage key.
- `scope.planScopeTransition({ previousScope, nextScope, previousQueue, nextQueue })` -> transfer decision for tab -> conversation transitions only.
- `scope.planLegacyMigration({ scopedQueue, legacyQueue })` -> migration decision without duplication.
- service worker answers `{ type: 'aichat:get-tab-id' }` with `{ tabId }` from `sender.tab.id`.

- [ ] Implement minimal pure scope module.
- [ ] Implement service-worker message bridge.
- [ ] Keep `cgptMessageQueue` as `STORAGE_KEYS.legacyMessageQueue`; scoped queues derive from it via `queueStorageKey`.
- [ ] Run scope/manifest tests and confirm GREEN.

### Task C: Make queue controller scope-aware

**Files:**
- Modify: `src/queue/controller.js`
- Modify: `tests/queue-controller.test.js`

- [ ] Add a test proving a controller state change to another scope replaces the active queue instead of merging/dispatching the old queue.
- [ ] Add a test for tab -> conversation transfer preserving remaining queued items.
- [ ] Add a test for one-time legacy queue migration when no scoped queue exists.
- [ ] Request tab ID once during bootstrap through `chrome.runtime.sendMessage`.
- [ ] Resolve active scope from `location.href` plus tab ID.
- [ ] Load/persist only the active scoped queue key.
- [ ] Detect SPA URL changes during reconcile and switch scope before any dispatch decision.
- [ ] On `tab:*` -> `conversation:*`, transfer remaining queue if the conversation scope is empty, then remove the tab key.
- [ ] Migrate legacy global queue once into the first empty active scope, then remove legacy key.
- [ ] Ignore storage-change events for queue keys outside the active scope.
- [ ] Run queue-controller/scope tests and confirm GREEN.

### Task D: Final regression verification

- [ ] Run `node --test tests/*.test.js`.
- [ ] Syntax-check every runtime JS file.
- [ ] Confirm manifest version is `1.1.0`.
- [ ] Confirm no global queue is used for normal persistence after migration.
- [ ] Confirm navigating between conversation scopes cannot consume another scope's queue.
