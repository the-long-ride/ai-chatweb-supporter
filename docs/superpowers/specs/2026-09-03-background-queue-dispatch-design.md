# Background Queue Dispatch Design

Date: 2026-09-03
Branch: `feat/batch-conversation-actions`
Target release: 1.1.5

## Goal

Keep queued-message dispatch working on ChatGPT and Claude while their browser tab remains open but is not the active tab, without reverse-engineering or directly calling private provider message-send APIs.

Also tighten the queued-message UI so Steer, Edit, and Delete use equal square hit areas, each queued row has a small amount of additional bottom spacing, and the queue header exposes a compact Clear all control for the currently visible queue scope.

Grok remains excluded from the extension queue because Grok already provides its own queue behavior.

## Current Problem

The queue runtime coalesces reconciliation through `requestAnimationFrame()`. Browsers pause or heavily suppress animation frames for hidden tabs. As a result, response-completion DOM mutations can schedule queue reconciliation, but the scheduled callback may not run until the tab becomes visible again.

The current service worker only responds to `aichat:get-tab-id`; it does not coordinate queue runtimes or wake inactive provider tabs.

The queue UI also allows icon action widths to differ because `.cgpt-queue-icon-button` uses `width:auto` with only a minimum width, and there is no single-action way to clear every queued item in the current conversation scope.

## Scope

### In scope

- ChatGPT queue dispatch while an open ChatGPT tab is inactive.
- Claude queue dispatch while an open Claude tab is inactive.
- Existing text and attachment queue messages.
- Existing durable remove-before-Send semantics.
- Existing Pause behavior.
- Existing Steer behavior.
- Equal Steer/Edit/Delete button dimensions.
- Small bottom spacing between queued rows.
- Compact Clear all button in the queue header.
- Clear all removes the currently visible queue scope only, including persisted queue records and attachment blobs owned by those queued items.
- Service-worker wake fallback for open registered queue tabs.

### Out of scope

- Sending after the provider tab has been closed.
- Sending after Chrome has fully discarded/frozen a tab such that its page context cannot execute.
- Direct private ChatGPT/Claude message API calls.
- Grok queue integration.
- Changing the queue persistence format.
- Clearing queues belonging to other conversations/providers from the current queue header.

## Architecture

### 1. Visibility-aware reconciliation scheduler

`src/queue/runtime.js` will stop relying exclusively on `requestAnimationFrame()`.

The runtime will expose one coalesced `scheduleReconcile()` path with two scheduling modes:

- **Visible document:** use `requestAnimationFrame()` for normal DOM/UI coalescing.
- **Hidden document:** queue reconciliation through a background-safe immediate task such as `queueMicrotask()` or a resolved Promise, guarded by an explicit boolean so repeated MutationObserver events collapse into one run.

The scheduler must preserve the existing invariant that only one pending reconcile exists at a time.

A `visibilitychange` listener will schedule reconciliation whenever the page changes visibility. This allows a newly hidden or newly visible page to immediately re-check queue state.

### 2. Content-script wake message

`src/queue/runtime.js` will listen for a dedicated extension message such as:

`aichat:queue-reconcile`

When received, it will call the same `scheduleReconcile()` function. It must not bypass Pause, provider scope, busy-state gates, durable dispatch staging, or any existing queue safety checks.

The message is only a wake signal; all send preparation and clicking still happen in the authenticated provider page.

### 3. Open-tab registration

When a ChatGPT or Claude queue runtime initializes, it will send a registration message to the extension service worker containing only non-sensitive routing metadata:

- provider ID
- tab ID derived by the worker from `sender.tab.id`, not trusted from page payload
- current URL/scope information only if needed for cleanup/debugging

No cookies, tokens, conversation contents, queued message text, or attachment bytes are sent to the worker.

The service worker will persist the set of registered queue tab IDs in `chrome.storage.session` so registration survives service-worker suspension during the browser session.

Grok never registers because its manifest entry does not load the queue runtime and the runtime hostname guard remains in place.

### 4. Service-worker fallback wake

`src/background/service-worker.js` will create a low-frequency repeating `chrome.alarms` wake used only as a fallback for open registered queue tabs.

This requires adding the `alarms` permission to `manifest.json`.

On each alarm:

1. Read registered queue tab IDs from `chrome.storage.session`.
2. Send `aichat:queue-reconcile` to each registered tab.
3. If `tabs.sendMessage` reports that the tab/content script no longer exists, remove that tab from the registry.

The worker does not inspect queue contents and does not decide which item to send. It only wakes the page runtime.

Immediate response-to-response chaining is still expected to come from MutationObserver + background-safe scheduling; the alarm is recovery/fallback only.

### 5. Background dispatch safety

The existing queue dispatch transaction remains authoritative:

1. Validate current provider/scope.
2. Ensure dispatch is allowed by Pause/busy/Steer rules.
3. Prepare text/attachments in the provider composer.
4. Remove the queue item from in-memory state.
5. Persist that removal to storage.
6. Only then click Send.
7. If send fails while the page remains alive, restore the item at its original index and persist restoration.

No background wake path may call Send directly or skip these steps.

### 6. Queue row action sizing

`src/queue/styles.css` will make all queue icon actions use the same fixed square geometry, including Steer/Edit/Delete:

- fixed width and height (target 28px)
- identical padding
- identical icon dimensions
- centered with inline-flex

The dedicated drag handle may retain its own cursor semantics but should visually align to the same square footprint.

### 7. Queue row spacing

Each `.cgpt-queue-row` will receive a small visual separation at the bottom. Prefer increasing the scroll container row gap or adding a small bottom margin rather than increasing internal content padding enough to disturb the fixed row alignment.

Target: approximately 5–6px visible vertical separation while preserving compact density.

### 8. Clear all queue control

The queue header will gain a small icon-only **Clear all** button in its top-right controls area, visually aligned with the existing Pause/Resume control without making the header noticeably taller.

Behavior:

1. Operate only on the queue currently rendered by `QueueView` for the active scope.
2. Snapshot all current queue items before changing state.
3. Clear the in-memory queue and persist the empty queue state.
4. Delete attachment blobs referenced by the cleared items on a best-effort basis after persistence succeeds.
5. Re-render immediately so the queue UI disappears when empty.
6. Schedule reconciliation after the clear completes.
7. If persistence of the empty queue fails, restore the previous in-memory queue and render it again; attachment blobs must not be deleted in this failure path.

This control intentionally does not clear queues belonging to other conversations or providers.

Because this is a destructive bulk action, the button will use a concise confirmation before clearing, following the same in-page interaction principle already used elsewhere in the extension rather than a browser `alert()`/`confirm()` popup.

## Data Flow

### Normal foreground dispatch

Provider DOM mutation -> MutationObserver -> rAF scheduler -> `reconcile()` -> existing gate -> `dispatchQueuedItem()`.

### Hidden-tab dispatch

Provider DOM mutation -> MutationObserver -> microtask scheduler -> `reconcile()` -> existing gate -> `dispatchQueuedItem()`.

### Fallback wake

Service-worker alarm -> registered tab IDs -> `tabs.sendMessage(aichat:queue-reconcile)` -> hidden/visible scheduler -> `reconcile()` -> existing gate -> `dispatchQueuedItem()`.

### Clear all

Header Clear all -> confirm -> snapshot active queue -> set active queue empty -> persist -> delete referenced attachment blobs -> render/schedule reconcile.

## Failure Handling

- Worker cannot reach a registered tab: prune that tab ID.
- Worker is suspended: alarm wakes it later; registrations survive in `storage.session`.
- Page is hidden but executable: microtask wake continues queue processing.
- Page is fully discarded/frozen: sending is not guaranteed; this is out of scope.
- Queue is paused: wake does nothing beyond reconciliation.
- Provider is currently generating: normal FIFO waits; Steer retains its explicit busy override behavior.
- Persistence failure before Send: do not click Send and restore queue state.
- Send failure after durable staging: restore queue item at the original index.
- Clear all persistence failure: restore the pre-clear queue and keep attachment blobs intact.
- Attachment cleanup failure after successful Clear all persistence: queue remains cleared; orphan cleanup is best effort and must not resurrect cleared items.

## Permissions

Add `alarms` to extension permissions. Existing `storage` permission remains.

No new remote host permissions are required. No private provider API is introduced.

## Files Expected to Change

- `src/queue/runtime.js`
- `src/background/service-worker.js`
- `src/queue/styles.css`
- `src/queue/view.js`
- `src/queue/ui.js` if a dedicated Clear all icon is added there
- `manifest.json`
- queue/background/manifest tests
- `CHANGELOG.md` if implementation materially changes the 1.1.5 release description

## Testing Strategy

### Scheduler tests

- visible document schedules through rAF
- hidden document does not require rAF
- repeated hidden mutations coalesce into one reconcile
- `visibilitychange` schedules reconciliation
- worker wake message schedules reconciliation

### Worker tests

- ChatGPT/Claude queue runtimes register
- worker derives tab ID from sender metadata
- registrations persist in session storage
- alarm wake sends only the reconcile message
- unreachable/closed tabs are pruned
- Grok never registers

### Dispatch regression tests

- background wake still respects Pause
- normal FIFO still waits while provider is busy
- Steer busy override remains unchanged
- remove/persist happens before Send click
- failed sends restore the original queue index

### UI tests

- Steer/Edit/Delete have equal fixed width and height
- icons remain centered
- drag handle remains usable
- queue rows have the requested additional vertical spacing
- Clear all is rendered in the top-right header controls
- Clear all affects only the active queue scope
- Clear all persistence failure restores the queue
- successful Clear all deletes attachment blobs owned by cleared items

## Acceptance Criteria

1. With ChatGPT or Claude open in a background tab, completion of the current response can trigger the next queued message without activating that tab.
2. If page scheduling is throttled, the service-worker fallback periodically wakes the open queue tab and gives it another chance to reconcile.
3. Activating the tab is not required for normal queued dispatch.
4. Closing or fully discarding the provider tab is explicitly not supported for background sending.
5. Grok exposes no extension queue behavior.
6. Durable remove-before-Send behavior is unchanged.
7. Steer/Edit/Delete buttons are equal square size.
8. Queued rows have slightly more bottom separation without becoming visually oversized.
9. A compact Clear all control appears in the queue header for ChatGPT and Claude.
10. Clear all removes only the active visible queue scope and cleans up its attachment blobs after persistence succeeds.
11. Clear all never deletes attachment blobs if persisting the empty queue fails.
