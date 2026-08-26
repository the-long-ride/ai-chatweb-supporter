# AI Chat Web Supporter

A dependency-free Chromium extension with local productivity tools for **ChatGPT, Claude, and Grok**.

## Features

- Queue **text, pasted text, multiple images, and files** on **ChatGPT, Claude, and Grok** with one shared **Ctrl + Enter** or **Alt + Enter** setting.
- When the AI is idle and the queue is empty, the shortcut behaves like a normal send. If the AI is responding/generating, it queues the prompt instead.
- Keep queues isolated per provider and conversation; new chats use a per-tab fallback until a conversation ID exists.
- Pause or resume automatic queue dispatch per conversation; paused state persists and follows a new chat from tab scope to conversation scope.
- Keep up to **5 queued messages visible**, with drag reorder, edit, delete, and a 5-second animated undo countdown.
- Rich queued messages persist attachment metadata in queue state and attachment bytes in extension-owned IndexedDB; replay restores files before sending.
- Pause automatic replay while an unrelated draft or attachment would make dispatch unsafe.
- On **Claude**, optionally auto-click the specific **Continue** action shown after Claude reaches its per-turn tool-use limit. This is enabled by default and can be disabled in the extension popup.
- Resize **ChatGPT and Grok sidebars** from **220–700 px** with independent saved widths; Claude has no sidebar resizing.
- Store queue/settings in `chrome.storage.local`; queued attachment bytes stay local in extension IndexedDB. No attachment data is sent anywhere except the selected AI site when its queued message is replayed.

## Install

1. Clone or download this repository.
2. Open the Chromium Extensions page and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Open or reload ChatGPT, Claude, or Grok.

## Tests

```bash
node --test tests/*.test.js
```

## Privacy

The extension requests only Chromium's `storage` permission and keeps extension state in local browser storage.
