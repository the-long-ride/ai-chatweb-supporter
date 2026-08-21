# AI Chat Web Supporter

A dependency-free Chromium Manifest V3 extension for `chatgpt.com` that adds practical local UI tools: a resizable ChatGPT sidebar and a sequential queued-message workflow.

## Features

### Sidebar resizer

- Drag the sidebar's right edge to resize it through ChatGPT's native `--sidebar-width` CSS variable.
- Width is clamped to **220–700 px**.
- Your chosen width is remembered with `chrome.storage.local`.
- Double-click the resize edge to return to ChatGPT's native sidebar width.
- Reattaches after ChatGPT SPA/sidebar DOM replacement.
- Recents and pinned conversation titles expand with the resized sidebar.

### Queued messages

- Press the configured shortcut to move the current **text** prompt into the queue instead of sending immediately.
- Choose **Ctrl + Enter** or **Alt + Enter** from the extension popup.
- Queue entries and shortcut settings are stored only in `chrome.storage.local`.
- Queue item **1** is always the next prompt and stays closest to the composer.
- The queue displays at most **5 messages at once**. Longer queues become vertically scrollable.
- When queued messages are hidden above the visible five-row window, an **up-arrow indicator** reminds you to scroll upward. The indicator disappears when you reach the top.
- Each row keeps its message to one ellipsized line and uses compact icon buttons for **Edit** and **Delete**.
- Drag rows to change send order.
- Edit a queued prompt in a centered in-page modal without pausing or resetting the queue.
- Delete a queued prompt and use the icon-based **Undo** action for 5 seconds.
- When ChatGPT is idle, the extension prepares one queued prompt, triggers ChatGPT's native Send control, and removes that queue entry only after the composer shows evidence that ChatGPT accepted it.
- The next queued prompt waits until the current response has entered and exited ChatGPT's generating state.
- Automatic dispatch waits instead of overwriting a normal draft.
- Automatic dispatch also waits while attachment evidence is present, preventing a text-only queued prompt from inheriting a pending image or file.

> Queue replay is text-only. Files and images attached in ChatGPT are not serialized into queued entries.

## Install in Chrome / Edge / Brave

1. Clone or download this repository.
2. Open the browser's Extensions page.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository folder containing `manifest.json`.
6. Open or reload `https://chatgpt.com/`.

## Use the sidebar resizer

Move the pointer over the right edge of ChatGPT's left sidebar. Drag left or right to resize. Double-click the edge to remove the saved override and restore ChatGPT's native sidebar width.

## Use the queue

1. Click the **AI Chat Web Supporter** extension icon and choose **Ctrl + Enter** or **Alt + Enter**.
2. Type a text prompt in ChatGPT.
3. Press the configured shortcut. The prompt is cleared from the composer and appears above it in the local queue.
4. Add more prompts the same way.
5. Drag, edit, delete, or undo entries as needed. Item `1` sends next.
6. If the queue grows past five items, use the mouse wheel or trackpad to scroll it. The up arrow indicates that additional queued messages are hidden above the current viewport.
7. Once ChatGPT is idle and the composer has no draft or pending attachment, prompts dispatch sequentially, one response cycle at a time.

Normal ChatGPT send behavior remains unchanged when you do not press the configured queue shortcut.

## Tests

No dependencies are required. With Node.js installed:

```bash
node --test tests/*.test.js
```

Syntax-check extension scripts with:

```bash
for f in content.js queue-core.js queue-dom.js queue-ui.js queue-view.js queue-content.js popup.js; do node --check "$f"; done
```

## Privacy

The extension runs only on `https://chatgpt.com/*` and requests only Chromium's `storage` permission. Sidebar width, queued text, and shortcut selection are stored locally in extension storage. There are no analytics, telemetry, external dependencies, or extension-originated network requests.
