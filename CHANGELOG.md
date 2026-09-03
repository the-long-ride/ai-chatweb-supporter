# Changelog

All notable changes to AI Chat Web Supporter are documented here by released version.

## [1.1.5] - 2026-09-03

### Added
- Batch conversation selection directly in supported sidebars, including ChatGPT archive/delete actions and delete actions for Claude and Grok.
- Provider-aware in-page confirmation dialogs and five-second glass completion toasts for batch actions.
- Per-item Steer action for queued messages on ChatGPT and Claude, allowing a selected queued message to fill the composer and send immediately.
- Dedicated grab handles for queued-message reordering.
- Background-safe queued-message dispatch for open inactive ChatGPT and Claude tabs, with a service-worker wake fallback.
- Compact Clear all control for the active queue scope, including attachment cleanup after successful persistence.

### Changed
- Message queue support is now limited to ChatGPT and Claude so Grok can use its native queue without duplicate extension behavior.
- ChatGPT and Grok sidebar resize handles now follow the full visible sidebar border and hide when the sidebar is collapsed, including icon-rail collapse states.
- Batch controls use provider-native button styling where possible, including ChatGPT Recents header spacing and icons.
- Queue Steer/Edit/Delete controls now use equal square hit areas, the drag handle aligns to the same footprint, and queued rows have slightly more bottom padding and vertical separation.

### Fixed
- Queue dispatch now removes and persists an item before clicking Send, preventing a recently sent queued message from being replayed after a page reload.
- Failed queue sends restore the removed item at its original position when the page remains active.
- Steer can dispatch a selected queued message while the current ChatGPT or Claude response is already active, without falsely treating the pre-existing busy state as send acceptance.
- Inactive ChatGPT/Claude tabs no longer depend exclusively on `requestAnimationFrame()` to continue queue reconciliation.
- ChatGPT batch selection remains stable across multiple checked rows and extension-owned DOM mutations no longer trigger destructive reconciliation loops.
- ChatGPT batch archive/delete requests now use the active session/account context and current conversation mutation contracts.

## [1.1.4] - 2026-08-26

### Added
- Rich queued-message content for ChatGPT, Claude, and Grok, including pasted images, dropped/selected files, and mixed text-plus-attachment messages.
- Local IndexedDB persistence for queued attachment bytes until messages are sent or permanently deleted.

### Changed
- Simplified the extension popup by removing the redundant queue-shortcut title and description block.
- Replaced the stacked shortcut radio rows with a compact animated segmented Ctrl + Enter / Alt + Enter selector.

### Fixed
- Queue dispatch now continues correctly after an AI response completes, including fast ChatGPT responses that previously could leave the next queued message blocked.

## [1.1.3] - 2026-08-26

### Added
- Message queue enable/disable toggle in the extension popup, enabled by default.
- Claude auto-continue support for tool-use continuation prompts.
- Popup update checker that compares the installed extension version with the latest stable GitHub Release.
- Bottom-of-popup update notification with an icon-only direct source ZIP download action.

### Fixed
- Queue shortcuts now always enqueue while message queue mode is enabled, including when the queue is empty and ChatGPT is still working.
- Queue interception no longer depends on fragile busy-state detection to decide whether a shortcut message should be sent directly.

## [1.1.2] - 2026-08-23

### Changed
- Updated the extension icon and branding artwork to represent ChatGPT, Claude, Grok, queued messages, and sidebar resizing.

## [1.1.1] - 2026-08-21

### Added
- Queued-message support for ChatGPT, Claude, and Grok.
- Grok sidebar resizing with an independent saved width.

### Changed
- Reorganized the extension into a dependency-free, no-build architecture with shared provider, queue, sidebar, and storage modules.
- Queue state became scoped per provider/conversation with migration support for earlier stored queues.

## [1.1.0] - 2026-08-21

### Added
- Sequential queued messages for ChatGPT.
- Configurable Ctrl + Enter or Alt + Enter queue shortcut from the extension popup.
- Queue editing, deletion, undo, drag reordering, and safe sequential dispatch.

### Changed
- Renamed the extension from ChatGPT Sidebar Resizer to AI Chat Web Supporter.

## [1.0.0] - 2026-08-20

### Added
- Initial Chromium Manifest V3 extension.
- ChatGPT sidebar resizing with persisted width and native-width reset support.
