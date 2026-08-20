# ChatGPT Sidebar Resizer

A small Chromium Manifest V3 extension that lets you resize the left sidebar on `chatgpt.com` by dragging its right edge.

## Features

- Drag the sidebar's right edge to resize it through ChatGPT's native `--sidebar-width` CSS variable.
- Width is clamped to **220–700 px**.
- Your chosen width is remembered with `chrome.storage.local`.
- Double-click the resize edge to return to ChatGPT's native sidebar width.
- Reattaches after ChatGPT SPA/sidebar DOM replacement.
- Recents conversation titles expand with the resized sidebar instead of staying clipped to the old marquee viewport.
- Pinned conversation titles also expand with the resized sidebar while keeping their chat icon and actions intact.
- No popup, analytics, telemetry, external dependencies, or network requests.

## Install in Chrome / Edge / Brave

1. Extract `chatgpt-sidebar-resizer.zip` to a folder.
2. Open the browser's Extensions page.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted folder containing `manifest.json`.
6. Open or reload `https://chatgpt.com/`.

## Use

Move the pointer over the right edge of ChatGPT's left sidebar. A subtle vertical resize line appears. Drag left or right to resize. The extension updates ChatGPT's native `--sidebar-width` variable so the sidebar and main layout resize together.

Double-click that edge to remove the saved override and restore ChatGPT's native sidebar width.

## Privacy

The extension runs only on `https://chatgpt.com/*`. It requests only Chromium's `storage` permission to remember one numeric width value locally. It makes no network requests and contains no analytics or telemetry.

