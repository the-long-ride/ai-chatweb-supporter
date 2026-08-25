# Changelog

All notable changes to AI Chat Web Supporter are documented here by released version.

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
