# AI Chat Web Supporter

A dependency-free Chromium extension for practical local enhancements across AI chat websites. It currently supports **ChatGPT**, with the architecture and branding designed for future providers such as Claude, Grok, Gemini, and others.

## Features

- Resize the ChatGPT sidebar from **220–700 px** and restore the native width with a double-click.
- Queue text prompts with **Ctrl + Enter** or **Alt + Enter**.
- Send queued prompts sequentially after each AI response finishes.
- Keep each queue isolated to its ChatGPT conversation; new/unsaved chats use a per-tab fallback until a conversation ID exists.
- Keep up to **5 queued messages visible** with scrolling for longer queues.
- Drag to reorder, edit in place, delete, and undo deletion for 5 seconds.
- Pause automatic queue dispatch while a draft or attachment is present.
- Store sidebar width, queue data, and shortcut choice only in `chrome.storage.local`.
- Use no analytics, telemetry, external dependencies, or extension-originated network requests.

## Install

1. Clone or download this repository.
2. Open your Chromium browser's Extensions page and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Open or reload `https://chatgpt.com/`.

## Usage

Drag the right edge of the ChatGPT sidebar to resize it. Open the extension popup to choose the queue shortcut, type a prompt, then press that shortcut to add it to the local queue. Item **1** sends next when ChatGPT is idle. Queues follow the current conversation; before ChatGPT creates a conversation ID, the queue uses the current tab as a fallback.

Queue replay is text-only; pending files or images are never attached to an automatically queued prompt.

## Tests

```bash
node --test tests/*.test.js
```

## Privacy

The extension currently runs only on `https://chatgpt.com/*` and requests only Chromium's `storage` permission. All extension state remains local to the browser.
