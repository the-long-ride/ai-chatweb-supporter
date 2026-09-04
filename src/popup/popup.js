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
  } = namespace.constants.STORAGE_KEYS;
  const storage = namespace.storage;
  const core = namespace.queueCore;
  const updater = namespace.popupUpdate;
  const radios = [...document.querySelectorAll('input[name="queue-shortcut"]')];
  const shortcutList = document.querySelector('.shortcut-list');
  const queueEnabled = document.querySelector('#queue-enabled');
  const claudeAutoContinue = document.querySelector('#claude-auto-continue');
  const autoContinueEnabled = document.querySelector('#auto-continue-enabled');
  const autoContinueMatchText = document.querySelector('#auto-continue-match-text');
  const chatgptErrorAutoContinue = document.querySelector('#chatgpt-error-auto-continue');
  const updateNotice = document.querySelector('#update-notice');
  const updateVersion = document.querySelector('#update-version');
  const updateDownload = document.querySelector('#update-download');

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

  async function checkForUpdate() {
    if (!updater || !updateNotice || !updateVersion || !updateDownload) return;
    const currentVersion = globalThis.chrome?.runtime?.getManifest?.()?.version;
    if (!currentVersion) return;
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
  ]).then((result) => {
    selectShortcut(result?.[SHORTCUT_KEY]);
    selectQueueEnabled(result?.[QUEUE_ENABLED_KEY]);
    selectClaudeAutoContinue(result?.[CLAUDE_AUTO_CONTINUE_KEY]);
    selectAutoContinueEnabled(result?.[AUTO_CONTINUE_ENABLED_KEY]);
    selectAutoContinueMatchText(result?.[AUTO_CONTINUE_MATCH_TEXT_KEY]);
    selectChatgptErrorAutoContinue(result?.[CHATGPT_ERROR_AUTO_CONTINUE_KEY]);
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

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[SHORTCUT_KEY]) selectShortcut(changes[SHORTCUT_KEY].newValue);
    if (changes[QUEUE_ENABLED_KEY]) selectQueueEnabled(changes[QUEUE_ENABLED_KEY].newValue);
    if (changes[CLAUDE_AUTO_CONTINUE_KEY]) selectClaudeAutoContinue(changes[CLAUDE_AUTO_CONTINUE_KEY].newValue);
    if (changes[AUTO_CONTINUE_ENABLED_KEY]) selectAutoContinueEnabled(changes[AUTO_CONTINUE_ENABLED_KEY].newValue);
    if (changes[AUTO_CONTINUE_MATCH_TEXT_KEY]) selectAutoContinueMatchText(changes[AUTO_CONTINUE_MATCH_TEXT_KEY].newValue);
    if (changes[CHATGPT_ERROR_AUTO_CONTINUE_KEY]) selectChatgptErrorAutoContinue(changes[CHATGPT_ERROR_AUTO_CONTINUE_KEY].newValue);
  });

  void checkForUpdate();
})();
