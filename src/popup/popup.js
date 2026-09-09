(() => {
  'use strict';

  const namespace = globalThis.AiChatWebSupporter;
  const {
    queueShortcut: SHORTCUT_KEY,
    queueEnabled: QUEUE_ENABLED_KEY,
    claudeAutoContinue: CLAUDE_AUTO_CONTINUE_KEY,
    autoContinueEnabled: AUTO_CONTINUE_ENABLED_KEY,
    autoContinueMatchText: AUTO_CONTINUE_MATCH_TEXT_KEY,
    chatgptErrorAutoContinue: CHATGPT_ERROR_AUTO_CONTINUE_KEY,
    backgroundKeepAwake: BACKGROUND_KEEP_AWAKE_KEY,
    popupTheme: POPUP_THEME_KEY,
    messageQueue: MESSAGE_QUEUE_KEY,
  } = namespace.constants.STORAGE_KEYS;
  const storage = namespace.storage;
  const core = namespace.queueCore;
  const updater = namespace.popupUpdate;

  const MOON_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const SUN_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const TRASH_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8" stroke="currentColor"/></svg>`;
  const radios = [...document.querySelectorAll('input[name="queue-shortcut"]')];
  const shortcutList = document.querySelector('.shortcut-list');
  const queueEnabled = document.querySelector('#queue-enabled');
  const claudeAutoContinue = document.querySelector('#claude-auto-continue');
  const autoContinueEnabled = document.querySelector('#auto-continue-enabled');
  const autoContinueMatchText = document.querySelector('#auto-continue-match-text');
  const chatgptErrorAutoContinue = document.querySelector('#chatgpt-error-auto-continue');
  const backgroundKeepAwake = document.querySelector('#background-keep-awake');
  const extensionVersion = document.querySelector('#extension-version');
  const themeToggle = document.querySelector('#theme-toggle');
  const clearQueueAll = document.querySelector('#clear-queue-all');
  const updateNotice = document.querySelector('#update-notice');
  const updateVersion = document.querySelector('#update-version');
  const updateDownload = document.querySelector('#update-download');
  const themeMedia = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  const currentVersion = globalThis.chrome?.runtime?.getManifest?.()?.version || '';
  let explicitTheme = null;

  if (extensionVersion && currentVersion) extensionVersion.textContent = `v${currentVersion}`;

  function normalizeTheme(value) {
    return value === 'light' || value === 'dark' ? value : null;
  }

  function preferredTheme() {
    return themeMedia?.matches ? 'dark' : 'light';
  }

  function applyTheme(value) {
    const theme = normalizeTheme(value) || preferredTheme();
    document.documentElement.dataset.theme = theme;
    if (themeToggle) {
      const isDark = theme === 'dark';
      themeToggle.innerHTML = isDark ? SUN_SVG : MOON_SVG;
      themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    return theme;
  }

  function selectShortcut(value) {
    const normalized = core.normalizeShortcut(value);
    for (const radio of radios) radio.checked = radio.value === normalized;
  }

  function selectQueueEnabled(value) {
    const enabled = value !== false;
    if (queueEnabled) queueEnabled.checked = enabled;
    if (shortcutList) shortcutList.disabled = !enabled;
  }

  function selectClaudeAutoContinue(value) {
    if (claudeAutoContinue) claudeAutoContinue.checked = value !== false;
  }

  function selectAutoContinueEnabled(value) {
    const enabled = value === true;
    if (autoContinueEnabled) autoContinueEnabled.checked = enabled;
    if (autoContinueMatchText) autoContinueMatchText.disabled = !enabled;
  }

  function selectAutoContinueMatchText(value) {
    if (autoContinueMatchText) autoContinueMatchText.value = String(value || '');
  }

  function selectChatgptErrorAutoContinue(value) {
    if (chatgptErrorAutoContinue) chatgptErrorAutoContinue.checked = value !== false;
  }

  function selectBackgroundKeepAwake(value) {
    if (backgroundKeepAwake) backgroundKeepAwake.checked = value === true;
  }

  async function checkForUpdate() {
    if (!updater || !updateNotice || !updateVersion || !updateDownload || !currentVersion) return;
    try {
      const response = await globalThis.fetch(updater.LATEST_RELEASE_URL, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) return;
      const available = updater.releaseUpdate(currentVersion, await response.json());
      if (!available) return;
      updateVersion.textContent = available.version;
      updateDownload.href = available.downloadUrl;
      updateDownload.title = `Download ${available.version} source ZIP`;
      updateDownload.setAttribute('aria-label', `Download ${available.version} source ZIP`);
      updateNotice.hidden = false;
    } catch {
      // Update checks are best-effort and must not affect popup settings.
    }
  }

  void storage.get([
    SHORTCUT_KEY,
    QUEUE_ENABLED_KEY,
    CLAUDE_AUTO_CONTINUE_KEY,
    AUTO_CONTINUE_ENABLED_KEY,
    AUTO_CONTINUE_MATCH_TEXT_KEY,
    CHATGPT_ERROR_AUTO_CONTINUE_KEY,
    BACKGROUND_KEEP_AWAKE_KEY,
    POPUP_THEME_KEY,
  ]).then((result) => {
    selectShortcut(result?.[SHORTCUT_KEY]);
    selectQueueEnabled(result?.[QUEUE_ENABLED_KEY]);
    selectClaudeAutoContinue(result?.[CLAUDE_AUTO_CONTINUE_KEY]);
    selectAutoContinueEnabled(result?.[AUTO_CONTINUE_ENABLED_KEY]);
    selectAutoContinueMatchText(result?.[AUTO_CONTINUE_MATCH_TEXT_KEY]);
    selectChatgptErrorAutoContinue(result?.[CHATGPT_ERROR_AUTO_CONTINUE_KEY]);
    selectBackgroundKeepAwake(result?.[BACKGROUND_KEEP_AWAKE_KEY]);
    explicitTheme = normalizeTheme(result?.[POPUP_THEME_KEY]);
    applyTheme(explicitTheme);
  });

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      void storage.set({ [SHORTCUT_KEY]: core.normalizeShortcut(radio.value) });
    });
  }

  queueEnabled?.addEventListener('change', () => {
    void storage.set({ [QUEUE_ENABLED_KEY]: queueEnabled.checked });
  });

  claudeAutoContinue?.addEventListener('change', () => {
    void storage.set({ [CLAUDE_AUTO_CONTINUE_KEY]: claudeAutoContinue.checked });
  });

  autoContinueEnabled?.addEventListener('change', () => {
    selectAutoContinueEnabled(autoContinueEnabled.checked);
    void storage.set({ [AUTO_CONTINUE_ENABLED_KEY]: autoContinueEnabled.checked });
  });

  autoContinueMatchText?.addEventListener('input', () => {
    void storage.set({ [AUTO_CONTINUE_MATCH_TEXT_KEY]: autoContinueMatchText.value });
  });

  chatgptErrorAutoContinue?.addEventListener('change', () => {
    void storage.set({ [CHATGPT_ERROR_AUTO_CONTINUE_KEY]: chatgptErrorAutoContinue.checked });
  });

  backgroundKeepAwake?.addEventListener('change', () => {
    void storage.set({ [BACKGROUND_KEEP_AWAKE_KEY]: backgroundKeepAwake.checked });
  });

  themeToggle?.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    explicitTheme = theme;
    applyTheme(theme);
    void storage.set({ [POPUP_THEME_KEY]: theme });
  });

  clearQueueAll?.addEventListener('click', async () => {
    clearQueueAll.disabled = true;
    try {
      const allStorage = await new Promise((resolve) => {
        chrome.storage.local.get(null, resolve);
      });
      const keys = Object.keys(allStorage).filter(
        (k) => k === MESSAGE_QUEUE_KEY || k.startsWith(MESSAGE_QUEUE_KEY + ':')
      );
      if (keys.length) await Promise.all(keys.map((k) => storage.remove(k)));
      clearQueueAll.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      setTimeout(() => {
        clearQueueAll.disabled = false;
        clearQueueAll.innerHTML = TRASH_SVG;
      }, 1200);
    } catch {
      clearQueueAll.disabled = false;
    }
  });

  themeMedia?.addEventListener?.('change', () => {
    if (!explicitTheme) applyTheme(null);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[SHORTCUT_KEY]) selectShortcut(changes[SHORTCUT_KEY].newValue);
    if (changes[QUEUE_ENABLED_KEY]) selectQueueEnabled(changes[QUEUE_ENABLED_KEY].newValue);
    if (changes[CLAUDE_AUTO_CONTINUE_KEY]) selectClaudeAutoContinue(changes[CLAUDE_AUTO_CONTINUE_KEY].newValue);
    if (changes[AUTO_CONTINUE_ENABLED_KEY]) selectAutoContinueEnabled(changes[AUTO_CONTINUE_ENABLED_KEY].newValue);
    if (changes[AUTO_CONTINUE_MATCH_TEXT_KEY]) selectAutoContinueMatchText(changes[AUTO_CONTINUE_MATCH_TEXT_KEY].newValue);
    if (changes[CHATGPT_ERROR_AUTO_CONTINUE_KEY]) selectChatgptErrorAutoContinue(changes[CHATGPT_ERROR_AUTO_CONTINUE_KEY].newValue);
    if (changes[BACKGROUND_KEEP_AWAKE_KEY]) selectBackgroundKeepAwake(changes[BACKGROUND_KEEP_AWAKE_KEY].newValue);
    if (changes[POPUP_THEME_KEY]) {
      explicitTheme = normalizeTheme(changes[POPUP_THEME_KEY].newValue);
      applyTheme(explicitTheme);
    }
  });

  applyTheme(null);
  void checkForUpdate();
})();
