# AI Chat Web Supporter No-Build Architecture Refactor Design

## Goal

Refactor the extension into a clearer no-build source layout, shorten the README, replace the branding with a vendor-neutral multi-AI logo system, and fix queued-message isolation so queues belong to the intended ChatGPT conversation. Keep extension version **1.1.0**.

## Constraints

- Keep Chromium Manifest V3.
- Keep version exactly `1.1.0`.
- No bundler, transpiler, package manager requirement, generated runtime output, or third-party dependency.
- Load plain source files directly from `manifest.json`.
- Preserve sidebar resize and queue UI/dispatch behavior.
- Preserve queue item shape `{ id, text, createdAt }` and shortcut choices.
- Preserve legacy storage data instead of discarding it.
- ChatGPT remains the only supported runtime site in this refactor; architecture/branding must stay suitable for Claude, Grok, Gemini, and other AI chat sites later.

## Source Architecture

```text
src/
  shared/
    constants.js
    storage.js

  background/
    service-worker.js

  sidebar/
    core.js
    dom.js
    controller.js
    styles.css

  queue/
    core.js
    dom.js
    scope.js
    ui.js
    view.js
    controller.js
    styles.css

  popup/
    popup.html
    popup.js
    popup.css

icons/
  icon16.png
  icon32.png
  icon48.png
  icon128.png
  logo.svg

tests/
```

### Shared

`src/shared/constants.js` owns stable storage keys and product constants. `src/shared/storage.js` owns Promise wrappers around `chrome.storage.local`.

### Background service worker

`src/background/service-worker.js` has one narrow responsibility: reply to a content-script request with `sender.tab.id`. This supplies a real Chromium tab ID when a ChatGPT conversation ID is not yet available. It requires no extra permission.

### Sidebar

`core.js` contains pure width/scoring logic. `dom.js` owns ChatGPT sidebar discovery and CSS-variable application. `controller.js` owns handle lifecycle, persistence, pointer events, observers, and SPA reattachment. `styles.css` contains sidebar-only styling.

### Queue

- `core.js`: pure queue/shortcut/undo/dispatch policy.
- `dom.js`: ChatGPT composer/send/stop/attachment adapter.
- `scope.js`: queue identity parsing and scoped storage-key policy.
- `ui.js`: pure viewport/icon presentation policy.
- `view.js`: rows, scrolling cue, drag reorder, edit modal, delete/undo UI.
- `controller.js`: scope lifecycle, storage sync, shortcuts, dispatch/reconcile, response-cycle gating.
- `styles.css`: queue/modal/toast styling.

Provider-specific selectors remain isolated from state and storage rules.

## Queue scope model

The current global `cgptMessageQueue` array is the root cause of cross-conversation queue mismatch. The refactor replaces active queue persistence with scoped keys.

### Scope resolution

When the page URL contains a ChatGPT conversation ID (currently `/c/<conversation_id>`):

```text
conversation:<conversation_id>
```

Otherwise, use the actual Chromium tab ID returned by the service worker:

```text
tab:<tab_id>
```

The scoped storage key is deterministic:

```text
cgptMessageQueue:<scope>
```

Examples:

```text
cgptMessageQueue:conversation:abc123
cgptMessageQueue:tab:42
```

### New-chat transition

A new-chat page starts under `tab:<id>`. When ChatGPT creates a conversation and changes the URL to `/c/<id>`, any remaining tab-scoped queue is moved to that conversation scope, then the tab-scoped key is removed. This prevents queued messages from disappearing when the first prompt creates a conversation.

### Navigation

The controller re-resolves scope on ChatGPT SPA URL changes. Navigating to another conversation switches to that conversation's independent queue. Returning to the original conversation restores its queue. A queue from one scope must never auto-dispatch in another.

### Legacy migration

`cgptMessageQueue` remains recognized as the legacy global key. On the first active scope that finds legacy data and no scoped data, normalize and move the legacy queue into that scope, then remove only the legacy key. The migration is one-time and does not duplicate messages across conversations.

`cgptQueueShortcut` and `cgptSidebarResizerWidth` remain unchanged.

## Runtime Loading

`manifest.json` directly loads content scripts in deterministic order:

1. `src/shared/constants.js`
2. `src/shared/storage.js`
3. sidebar modules
4. queue core/DOM/scope/UI/view/controller

The service worker is declared separately under `background.service_worker`. CSS loads directly from `src/sidebar/styles.css` and `src/queue/styles.css`. No dynamic loader or build step is introduced.

## Branding and Logo

Use a vendor-neutral **connected chat nodes** mark:

- rounded speech-bubble silhouette
- three connected nodes inside
- geometric and legible at 16×16
- no OpenAI, Anthropic, Google, xAI, or other vendor motifs
- one canonical `icons/logo.svg`
- matching 16/32/48/128 PNG extension icons

The mark communicates one helper spanning multiple AI conversations/providers.

## README

Reduce README to:

1. title + one-sentence description
2. 6–8 feature bullets
3. short install section
4. short usage section
5. one test command
6. short privacy section

State that ChatGPT is currently supported and other AI chat sites are future targets. Mention that queued prompts are isolated per conversation, with tab fallback for unsaved/new chats. Remove implementation-detail prose and the syntax-check shell loop.

## Tests

Use only Node's built-in test runner:

```bash
node --test tests/*.test.js
```

Coverage includes:

- manifest paths/load order/service worker/version `1.1.0`
- stable storage constants
- sidebar pure logic
- queue core and dispatch gating
- conversation ID parsing and tab fallback
- scoped queue-key generation
- tab → conversation queue transfer
- legacy global queue migration
- scope switching without cross-conversation dispatch
- queue UI viewport/icon rules
- popup shortcut options
- README/branding/icon existence

Syntax-check every runtime JavaScript file before completion.

## Migration / Cleanup

After new modules are verified, remove obsolete root runtime files (`content.js`, `styles.css`, root `queue-*.js`, `queue-content.css`, and root popup files). `manifest.json` references only `src/` runtime files.

## Non-Goals

- Do not add Claude/Grok/Gemini runtime support yet.
- Do not add a build system, dependency manager, or third-party package.
- Do not change queue item shape or shortcut choices.
- Do not increment the extension version.
- Do not make tab ID the primary identity when a conversation ID is available.

## Success Criteria

- Branch is based on latest `master`.
- Version remains `1.1.0`.
- Source responsibilities are separated under `src/`.
- No build step exists.
- Queue messages are isolated to their conversation, or to their tab before a conversation ID exists.
- New-chat queues transfer to the created conversation.
- Legacy global queued messages are migrated once without loss.
- README is materially shorter.
- New logo/icon set is vendor-neutral and consistent.
- Full Node test suite and runtime syntax checks pass.
