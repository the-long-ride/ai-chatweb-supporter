# AI Chat Web Supporter No-Build Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor AI Chat Web Supporter into a responsibility-focused no-build `src/` architecture, shorten the README, and ship a vendor-neutral connected-chat-nodes icon set without changing extension behavior or version `1.1.0`.

**Architecture:** Chromium continues loading plain JavaScript and CSS directly from `manifest.json`. Shared constants/storage move into `src/shared`; sidebar, queue, and popup each own their DOM, state, controller, and styling responsibilities. Existing storage keys and queue data remain unchanged so the refactor is transparent to installed users.

**Tech Stack:** Chromium Manifest V3, plain JavaScript IIFEs/CommonJS-compatible exports, CSS, `chrome.storage.local`, Node.js built-in test runner. No packages, bundler, transpiler, or generated runtime output.

**Spec:** `docs/superpowers/specs/2026-08-21-no-build-architecture-refactor-design.md`

## Global Constraints

- Keep Manifest V3 and extension version exactly `1.1.0`.
- Do not add npm/package-manager requirements, third-party dependencies, a bundler, or transpilation.
- Preserve `cgptSidebarResizerWidth`, `cgptMessageQueue`, and `cgptQueueShortcut` storage keys.
- Preserve queue item shape `{ id, text, createdAt }` and current ChatGPT-only runtime behavior.
- Preserve queue shortcuts Ctrl+Enter and Alt+Enter.
- ChatGPT remains the only runtime host in this change; branding and module boundaries stay vendor-neutral for future providers.
- All runtime JavaScript must remain directly loadable by Chromium in manifest order and `require()`-able where tests need pure APIs.

---

### Task 1: Lock the new manifest/storage architecture with failing tests

**Files:**
- Modify: `tests/manifest.test.js`
- Create: `tests/shared.test.js`

**Interfaces:**
- Consumes: current `manifest.json` and existing storage-key behavior.
- Produces: executable contract requiring version `1.1.0`, the new `src/` load order, popup location, CSS locations, and stable storage constants.

- [ ] **Step 1: Write manifest tests that require the new no-build paths**

```js
assert.equal(manifest.version, '1.1.0');
assert.deepEqual(manifest.content_scripts[0].js, [
  'src/shared/constants.js',
  'src/shared/storage.js',
  'src/sidebar/core.js',
  'src/sidebar/dom.js',
  'src/sidebar/controller.js',
  'src/queue/core.js',
  'src/queue/dom.js',
  'src/queue/ui.js',
  'src/queue/view.js',
  'src/queue/controller.js',
]);
assert.deepEqual(manifest.content_scripts[0].css, [
  'src/sidebar/styles.css',
  'src/queue/styles.css',
]);
assert.equal(manifest.action.default_popup, 'src/popup/popup.html');
```

- [ ] **Step 2: Write shared-constants tests**

```js
const constants = require('../src/shared/constants.js');
assert.equal(constants.STORAGE_KEYS.sidebarWidth, 'cgptSidebarResizerWidth');
assert.equal(constants.STORAGE_KEYS.messageQueue, 'cgptMessageQueue');
assert.equal(constants.STORAGE_KEYS.queueShortcut, 'cgptQueueShortcut');
```

- [ ] **Step 3: Run the tests and verify RED**

Run: `node --test tests/manifest.test.js tests/shared.test.js`

Expected: failures because `src/` modules and the new manifest paths do not exist yet.

---

### Task 2: Introduce shared constants/storage and extract the sidebar feature

**Files:**
- Create: `src/shared/constants.js`
- Create: `src/shared/storage.js`
- Create: `src/sidebar/core.js`
- Create: `src/sidebar/dom.js`
- Create: `src/sidebar/controller.js`
- Create: `src/sidebar/styles.css`
- Modify: `tests/manifest.test.js`
- Create: `tests/sidebar.test.js`

**Interfaces:**
- `src/shared/constants.js` exports/globalizes `STORAGE_KEYS`.
- `src/shared/storage.js` exports/globalizes `get`, `set`, and `remove` Promise wrappers over `chrome.storage.local`.
- `src/sidebar/core.js` exports `MIN_WIDTH`, `MAX_WIDTH`, `clampWidth`, `parseStoredWidth`, `scoreSidebarCandidate`, `applySidebarWidthVariable`, and `restoreSidebarWidthVariable`.
- `src/sidebar/dom.js` exports ChatGPT sidebar discovery/measurement helpers and width-variable application helpers that accept browser/document dependencies rather than owning persistence.
- `src/sidebar/controller.js` owns handle lifecycle, storage synchronization, pointer events, observers, and bootstrap.

- [ ] **Step 1: Add sidebar extraction tests before implementation**

```js
const sidebar = require('../src/sidebar/core.js');
assert.equal(sidebar.clampWidth(100), 220);
assert.equal(sidebar.clampWidth(900), 700);
assert.equal(sidebar.parseStoredWidth(400), 400);
assert.equal(sidebar.parseStoredWidth(100), null);
assert.ok(sidebar.scoreSidebarCandidate({
  visible: true, left: 0, right: 300, width: 300,
  heightRatio: 0.9, widthRatio: 0.2,
  semanticHint: true, containsNavigation: true, isBodyLike: false,
}) > 7);
```

- [ ] **Step 2: Run sidebar tests and verify RED**

Run: `node --test tests/sidebar.test.js`

Expected: module-not-found/failing assertions because extraction has not been created.

- [ ] **Step 3: Implement the shared modules and sidebar extraction**

Keep the existing sidebar algorithms and selectors intact while moving pure calculations to `core.js`, DOM discovery/width helpers to `dom.js`, and lifecycle/persistence to `controller.js`. Use `CgptSupporterConstants` and `CgptSupporterStorage` globals in Chromium and CommonJS exports in Node tests.

- [ ] **Step 4: Move sidebar CSS unchanged into `src/sidebar/styles.css`**

Preserve handle positioning/drag styling and the current Recents/Project/Pinned width corrections exactly.

- [ ] **Step 5: Run sidebar/shared tests and verify GREEN**

Run: `node --test tests/sidebar.test.js tests/shared.test.js`

Expected: all pass.

---

### Task 3: Relocate and simplify the queue feature around explicit dependencies

**Files:**
- Create: `src/queue/core.js`
- Create: `src/queue/dom.js`
- Create: `src/queue/ui.js`
- Create: `src/queue/view.js`
- Create: `src/queue/controller.js`
- Create: `src/queue/styles.css`
- Modify: `tests/queue-core.test.js`
- Modify: `tests/queue-controller.test.js`
- Modify: `tests/queue-ui.test.js`

**Interfaces:**
- `core.js`: existing pure queue, shortcut, dispatch-eligibility, and undo functions.
- `dom.js`: existing ChatGPT composer/send/stop/attachment adapter only.
- `ui.js`: existing five-row viewport rules and sanitized SVG icon templates only.
- `view.js`: rendering/edit/delete/undo/drag/scroll-cue behavior; persistence injected by constructor.
- `controller.js`: `DispatchGate`, storage sync, keyboard shortcut handling, dispatch/reconcile lifecycle; reads keys from shared constants and uses shared storage wrapper.

- [ ] **Step 1: Update queue tests to import the new paths**

```js
const core = require('../src/queue/core.js');
const controller = require('../src/queue/controller.js');
const dom = require('../src/queue/dom.js');
const ui = require('../src/queue/ui.js');
```

Add an assertion that controller source does not redefine the stable queue/shortcut storage-key strings.

- [ ] **Step 2: Run queue tests and verify RED**

Run: `node --test tests/queue-core.test.js tests/queue-controller.test.js tests/queue-ui.test.js`

Expected: failures because the new paths do not exist.

- [ ] **Step 3: Move queue pure/DOM/UI modules without behavior changes**

Retain all currently-tested semantics: queue normalization/order, strict shortcut modifiers, attachment detection, send acceptance classification, 5-row viewport, sanitized Edit/Delete/Undo icons, and up-arrow overflow cue.

- [ ] **Step 4: Refactor queue controller to shared storage/constants**

Replace duplicated `storageArea`, `storageGet`, and `storageSet` helpers with `CgptSupporterStorage.get/set`; replace literal storage keys with `CgptSupporterConstants.STORAGE_KEYS`.

- [ ] **Step 5: Move queue CSS to `src/queue/styles.css`**

Preserve current ChatGPT-theme-aware CSS variables, five-row max-height/scrolling, modal, icon-button, drag, and undo-toast behavior.

- [ ] **Step 6: Run queue tests and verify GREEN**

Run: `node --test tests/queue-core.test.js tests/queue-controller.test.js tests/queue-ui.test.js`

Expected: all pass with existing behavioral assertions unchanged apart from import paths.

---

### Task 4: Relocate popup and update the manifest

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.js`
- Create: `src/popup/popup.css`
- Modify: `manifest.json`
- Modify: `tests/manifest.test.js`
- Modify: `tests/product.test.js`

**Interfaces:**
- Popup continues reading/writing `cgptQueueShortcut` and offering only `ctrl-enter` and `alt-enter`.
- Manifest loads shared/sidebar/queue scripts directly in deterministic order and points `default_popup` to `src/popup/popup.html`.

- [ ] **Step 1: Update popup tests before moving files**

```js
const html = fs.readFileSync(path.join(root, 'src/popup/popup.html'), 'utf8');
assert.match(html, /value="ctrl-enter"/);
assert.match(html, /value="alt-enter"/);
assert.match(html, /\.\.\/shared\/constants\.js/);
assert.match(html, /popup\.js/);
```

- [ ] **Step 2: Run popup/manifest tests and verify RED**

Run: `node --test tests/manifest.test.js tests/product.test.js`

Expected: failures until the new popup and manifest wiring exist.

- [ ] **Step 3: Move popup files and use the shared queue-shortcut constant**

Preserve current UI and shortcut behavior. Keep popup CSS self-contained under `src/popup/`.

- [ ] **Step 4: Update `manifest.json` while preserving version `1.1.0`**

Use only `src/` runtime paths and retain `https://chatgpt.com/*` as the sole match target.

- [ ] **Step 5: Run manifest/product tests and verify GREEN**

Run: `node --test tests/manifest.test.js tests/product.test.js`

Expected: all pass.

---

### Task 5: Create the vendor-neutral logo/icon system and shorten README

**Files:**
- Create: `icons/logo.svg`
- Replace: `icons/icon16.png`
- Replace: `icons/icon32.png`
- Replace: `icons/icon48.png`
- Replace: `icons/icon128.png`
- Modify: `README.md`
- Modify: `tests/product.test.js`

**Interfaces:**
- Canonical mark: rounded speech bubble containing three connected nodes; no vendor marks or text.
- PNG icons are rasterizations of the same mark at exact 16, 32, 48, and 128 square sizes.
- README accurately states ChatGPT is currently supported and future providers are intended, without claiming runtime support that does not exist.

- [ ] **Step 1: Add product tests before changing branding/docs**

```js
assert.equal(manifest.name, 'AI Chat Web Supporter');
assert.equal(manifest.version, '1.1.0');
assert.ok(fs.existsSync(path.join(root, 'icons/logo.svg')));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
assert.match(readme, /currently supports.*ChatGPT/i);
assert.match(readme, /node --test tests\/\*\.test\.js/);
```

Also assert the README no longer contains the old verbose syntax-check shell loop.

- [ ] **Step 2: Run product tests and verify RED**

Run: `node --test tests/product.test.js`

Expected: failure because `icons/logo.svg` does not yet exist and README is still verbose.

- [ ] **Step 3: Create the connected-chat-nodes visual identity**

Use a simple geometric speech-bubble silhouette and three linked circular nodes with sufficient padding/stroke weight to remain legible at 16 px. Avoid any OpenAI/Anthropic/Google/xAI logos or recognizable vendor motifs.

- [ ] **Step 4: Produce exact-size PNG icons from the canonical design**

Verify dimensions programmatically: 16×16, 32×32, 48×48, and 128×128.

- [ ] **Step 5: Rewrite README to the approved compact structure**

Keep: one-sentence description, 6–8 feature bullets, short install, short usage, one test command, short privacy note. Remove implementation-detail prose and the separate syntax-check instructions.

- [ ] **Step 6: Run product tests and verify GREEN**

Run: `node --test tests/product.test.js`

Expected: all pass.

---

### Task 6: Remove obsolete root runtime files and perform full verification

**Files:**
- Delete: `content.js`
- Delete: `styles.css`
- Delete: `queue-core.js`
- Delete: `queue-dom.js`
- Delete: `queue-ui.js`
- Delete: `queue-view.js`
- Delete: `queue-content.js`
- Delete: `queue-content.css`
- Delete: `popup.html`
- Delete: `popup.js`
- Delete: `popup.css`
- Modify: tests as needed only to remove references to obsolete paths

**Interfaces:**
- `manifest.json` is the single runtime entrypoint and references only `src/` files.
- No duplicate root implementation remains.

- [ ] **Step 1: Add/confirm a manifest assertion that every referenced file exists and obsolete root runtime files are not referenced**

```js
for (const file of [...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css, manifest.action.default_popup]) {
  assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
}
assert.equal(JSON.stringify(manifest).includes('queue-content.js'), false);
```

- [ ] **Step 2: Remove the obsolete root runtime files**

Delete only files replaced by `src/`; retain `LICENSE`, `README.md`, `manifest.json`, icons, tests, and design/plan docs.

- [ ] **Step 3: Run the complete Node test suite**

Run: `node --test tests/*.test.js`

Expected: 0 failures.

- [ ] **Step 4: Syntax-check every runtime JavaScript file**

Run:

```bash
find src -name '*.js' -print0 | xargs -0 -n1 node --check
```

Expected: exit 0 for every file.

- [ ] **Step 5: Verify manifest version and icon dimensions**

Confirm `manifest.json` reports `1.1.0`; confirm PNG dimensions are exactly 16, 32, 48, and 128 pixels respectively.

- [ ] **Step 6: Compare branch to `master`**

Confirm the branch is based on latest `master`, contains only the architecture/docs/branding refactor, and introduces no runtime-provider claims beyond ChatGPT.
