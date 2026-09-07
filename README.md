# AI Chat Web Supporter

A dependency-free Chromium extension with local productivity tools for **ChatGPT, Claude, and Grok**.

## Features

- Queue **text, images, and files** on **ChatGPT and Claude** with one shared **Ctrl + Enter** or **Alt + Enter** shortcut. Grok keeps its native queue.
- If the AI is responding/generating, prompts wait in the queue; otherwise queued work dispatches automatically.
- Queues are isolated per provider and conversation. Pause/resume state persists per conversation.
- Keep up to **5 queued messages visible** with drag reorder, edit, delete, Clear all, Steer, and five-second undo.
- Queued attachment bytes stay in extension-owned IndexedDB until sent or permanently deleted.
- On **Claude**, optionally auto-click **Continue** after the per-turn tool-use limit. This is enabled by default and can be disabled in the popup.
- On **ChatGPT, Claude, and Grok**, optionally match configurable text in the latest finished AI response and send `continue remaining works` once for that response.
- On **ChatGPT**, message-stream errors can trigger the same continuation through a separate popup toggle.
- Background automation can optionally keep the system awake. Frozen supported tabs may be temporarily activated while the machine is locked or idle, then the previous active tab is restored.
- Resize **ChatGPT and Grok sidebars** from **220–700 px** with independent saved widths; Claude has no sidebar resizing.
- Popup settings include explicit light/dark mode and the installed version read from the extension manifest.
- Settings and queue state are stored in `chrome.storage.local`.

## Install

1. Clone or download this repository.
2. Open Chromium Extensions and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Open or reload ChatGPT, Claude, or Grok.

## Tests

```bash
node --test tests/*.test.js
```

## Privacy

The extension uses Chromium `storage`, `alarms`, `power`, and `idle` permissions. Settings, queue state, and queued attachment bytes stay local to the extension except when a queued message is sent to the selected AI site.
