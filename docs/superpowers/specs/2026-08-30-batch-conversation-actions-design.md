# Batch Conversation Actions Design

## Goal

Add an in-page batch-selection mode for recent conversations on ChatGPT, Claude, and Grok. The extension must visually blend into each site's existing sidebar UI and must never persist or hard-code captured authentication material.

Supported destructive actions:

- ChatGPT: archive selected conversations and delete selected conversations.
- Claude: delete selected conversations.
- Grok: delete selected conversations.

Every archive/delete operation requires an explicit second confirmation before any network request is sent.

## Scope

This feature is independent from prompt queueing and sidebar resizing. It adds a small shared batch-action controller with provider-specific adapters for sidebar discovery, conversation identification, native-looking control placement, and request execution.

Out of scope:

- restoring archived/deleted conversations;
- selecting conversations outside the currently rendered recent-chat list;
- bulk pin/unpin or project operations;
- storing conversation titles or IDs in extension storage;
- reproducing captured cookies, bearer tokens, Cloudflare values, device IDs, or session IDs.

## Source contracts

The implementation follows the supplied browser captures rather than embedding the literal captured headers.

### ChatGPT

Recent rows are discoverable from the `#history` list and `a[data-sidebar-item="true"][href*="/c/"]`; the conversation UUID is available in the `/c/{id}` href and also on `data-conversation-options-trigger`.

Delete request:

- `DELETE /backend-api/conversation/id/{conversationId}`

Archive request:

- `PATCH /backend-api/conversation/{conversationId}`
- JSON body: `{ "is_archived": true }`

Authentication/account metadata must be resolved at runtime from the current logged-in browser session. Captured bearer tokens and account identifiers are test fixtures only and must never enter production source.

### Grok

Recent rows use `/c/{conversationId}` links in the left sidebar.

Delete request:

- `DELETE /rest/app-chat/conversations/soft/{conversationId}`

The request uses the current same-origin browser session and must not manually copy session cookies from the capture.

### Claude

The recent section is rooted at `[data-testid="sidebar-recents"]`. Conversation rows expose `data-row-key="chat:{conversationId}"` and `/chat/{conversationId}` links.

Delete request:

- `DELETE /api/organizations/{organizationId}/chat_conversations/{conversationId}`

The active organization ID must be resolved dynamically. Prefer current page/session data such as the active organization state; if a lightweight authenticated organization lookup is needed, keep that resolution inside the Claude adapter.

The captured DELETE includes the conversation JSON as its request body. To preserve compatibility without fabricating metadata, the Claude adapter should retrieve the current conversation representation when required and send the server-provided object back as the DELETE body, ensuring its `uuid` matches the selected conversation. If the endpoint is verified in tests/manual validation to accept the UUID-only or bodyless form, prefer the minimal accepted payload.

## Architecture

Create a dedicated subsystem:

```text
src/batch/
  core.js
  dom.js
  controller.js
  styles.css
```

Provider files remain responsible for site-specific behavior:

```text
src/providers/chatgpt.js
src/providers/claude.js
src/providers/grok.js
```

### `src/batch/core.js`

Pure state and execution helpers:

- selection set operations;
- action availability (`archive` only when the provider supports it);
- confirmation message generation;
- sequential batch execution;
- success/failure result aggregation;
- continue-on-error semantics.

No DOM access and no network access. This keeps the destructive behavior easy to test.

### `src/batch/dom.js`

Shared DOM utilities:

- create icon-only buttons with `aria-label` and `title`;
- create/check selection controls;
- mark/unmark selected rows without overwriting provider-owned inline styles;
- prevent row navigation while selection mode is active;
- safe cloning/copying of existing native button classes where possible;
- remove all injected controls when leaving selection mode.

Injected nodes use stable `data-ai-chatweb-batch-*` attributes so MutationObservers can ignore or reconcile them.

### `src/batch/controller.js`

Owns lifecycle and orchestration:

- resolve the active provider from the existing provider registry;
- discover/re-discover the rendered recent-chat section;
- inject one icon-only "Select conversations" control into the section header;
- enter/exit selection mode;
- decorate currently rendered conversation rows;
- preserve selected IDs across harmless React rerenders while selection mode stays active;
- clear state on cancel, provider navigation, or when the sidebar section disappears;
- ask for confirmation before archive/delete;
- execute selected actions sequentially;
- remove successful rows immediately;
- leave failed rows visible and selected for retry;
- disable action buttons while a batch is executing.

A single MutationObserver schedules reconciliation through `requestAnimationFrame` to avoid duplicate controls during React updates.

## Provider adapter contract

Extend each provider with optional batch methods rather than mixing site checks into the shared controller:

```js
batch: {
  supportsArchive: boolean,
  findConversationSection(doc),
  findConversationHeader(section),
  listConversationRows(section),
  getConversationId(row),
  getConversationAnchor(row),
  getNativeButtonTemplate(section),
  archiveConversation?(id, context),
  deleteConversation(id, context),
}
```

`context` contains `window`, `document`, and an injectable `fetch` implementation for tests.

The controller only calls capabilities exposed by the active provider.

## Authentication strategy

All requests run against the currently open first-party site and use the logged-in browser session.

- Never serialize auth data into `chrome.storage`.
- Never copy literal cookies or bearer tokens from the supplied cURL captures.
- Use `credentials: "include"` for same-origin requests.
- For ChatGPT, resolve any required bearer/account headers dynamically from current authenticated session endpoints/page state immediately before the batch. Cache only in memory for the current operation, not across reloads.
- For Claude, resolve organization/session context dynamically; do not embed the captured organization ID.
- Grok should rely on same-origin session credentials unless runtime validation proves an additional ephemeral header is required.

If runtime auth context cannot be resolved, fail the affected action cleanly and keep the row selected. Do not fall back to captured values.

## UI behavior

### Normal mode

Add exactly one icon-only "Select conversations" button to the native recent-chat header controls.

Placement:

- ChatGPT: beside the existing Recents header actions (for example New chat / Organize chats).
- Claude: beside the existing Chats and tasks header actions.
- Grok: beside the existing Chats header controls.

The button should reuse a nearby native icon-button class set or native CSS variables. Extension CSS supplies only structural fallback rules and selected-state hooks.

### Selection mode

When selection mode is enabled:

- every rendered recent conversation receives an icon-only checkbox/select affordance;
- clicking the row or its selection affordance toggles selection instead of navigating;
- existing row option/pin buttons are suppressed or made inert for the duration of selection mode so row clicks cannot trigger unrelated actions;
- selected rows use the site's own selected/active background variable where available;
- the original select button is replaced by action controls.

ChatGPT controls:

1. Archive selected (icon only)
2. Delete selected (icon only)
3. Cancel (icon only)

Claude/Grok controls:

1. Delete selected (icon only)
2. Cancel (icon only)

Archive/delete remain disabled when the selection set is empty or while an operation is running.

All icon-only controls still expose accessible labels and tooltips.

## Confirmation

Before sending any mutation request, invoke the browser's native confirmation dialog with an exact count, for example:

- `Archive 8 selected conversations?`
- `Delete 12 selected conversations?`

Canceling the confirmation must result in zero requests and no state changes.

Confirmation is per batch action, not per conversation.

## Execution semantics

Run conversations sequentially, not with unbounded parallel requests.

For each selected ID:

1. invoke the provider action;
2. treat any non-2xx response as failure;
3. on success, remove that ID from the selection set and remove/reconcile the row;
4. on failure, retain the row and selection state and record the error;
5. continue with the next selected ID.

After completion:

- if every item succeeded, exit selection mode;
- if any failed, remain in selection mode with only failed IDs selected;
- update disabled/busy state deterministically;
- log concise provider/action/status diagnostics to the console without auth headers or response bodies that may contain private data.

## DOM resilience

Provider selectors should prefer semantic/stable attributes from the captures and use href fallbacks:

- ChatGPT: `#history`, `data-sidebar-item`, `data-conversation-options-trigger`, `/c/` href.
- Claude: `data-testid="sidebar-recents"`, `data-row-key^="chat:"`, `data-row-main-button`, `/chat/` href.
- Grok: `data-sidebar="menu"`, `data-sidebar="menu-item"`, `/c/` href.

Do not depend on generated React/Radix IDs, obfuscated class names, sprite asset hashes, or captured positional indices.

The controller must be idempotent under repeated reconciliation and must tolerate virtualized/replaced sidebar rows.

## Manifest integration

Load the new batch subsystem for all three sites after provider registration is available and before/independent of queue runtime initialization. Add `src/batch/styles.css` to the three site content-script CSS lists.

Do not broaden permissions unless runtime requests require it. Any required host permission change must be limited to the three already-supported first-party origins.

## Testing strategy

Use the repository's existing dependency-free `node --test tests/*.test.js` style.

Add focused tests for:

### Core

- toggle/select/unselect behavior;
- clear selection;
- action availability;
- sequential execution order;
- continue-on-error aggregation;
- failed IDs retained;
- confirmation message counts.

### Provider contracts

ChatGPT:

- extract IDs from `/c/{id}` rows, including query strings;
- detect the Recents section/header from the supplied capture shape;
- delete URL/method;
- archive URL/method/body exactly `{is_archived:true}`;
- runtime auth resolver output is used instead of fixture credentials.

Claude:

- extract IDs from both `data-row-key="chat:{id}"` and `/chat/{id}`;
- detect `[data-testid="sidebar-recents"]`;
- dynamic organization ID resolution;
- delete URL/method;
- DELETE payload uses fetched current conversation representation when required.

Grok:

- extract IDs from `/c/{id}`;
- detect the Chats group/menu shape;
- delete URL/method `/rest/app-chat/conversations/soft/{id}`.

### Controller/DOM

- one select button injected despite repeated reconciliation;
- entering selection mode decorates rows;
- clicking a row in selection mode prevents navigation and toggles selection;
- zero selections disables mutation actions;
- cancel removes injected selection state and controls;
- rejected confirmation produces zero provider calls;
- successful rows are removed/unselected;
- partial failures remain selected;
- provider rerender/replacement does not duplicate controls.

### Manifest

- new batch scripts and stylesheet are loaded on ChatGPT, Claude, and Grok;
- no captured auth material appears in manifest/source fixtures intended for production.

## Manual validation

After automated tests pass, load the unpacked extension and validate on each site with disposable test conversations:

1. confirm controls visually match the native sidebar in light and dark modes;
2. select multiple rows and cancel without navigation;
3. reject confirmation and verify no network request occurs;
4. perform a small successful batch;
5. simulate/observe one failed request and verify only the failed row remains selected;
6. confirm ChatGPT archive removes the conversation from Recents without deleting it;
7. confirm Claude/Grok delete behavior matches their native single-conversation delete behavior;
8. reload each page and confirm no stale selection state persists.

## Security and privacy

The supplied cURL captures contain active-looking session material. They are evidence for endpoint shape only. Production code, tests, documentation, logs, and commits must not reproduce those secrets.

Batch operations act only on conversation IDs that are currently rendered and explicitly selected by the user. No background scan or automatic deletion/archive behavior is introduced.
