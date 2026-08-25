(() => {
  'use strict';

  const namespace = globalThis.AiChatWebSupporter;
  const { queueShortcut: SHORTCUT_KEY, claudeAutoContinue: CLAUDE_AUTO_CONTINUE_KEY } = namespace.constants.STORAGE_KEYS;
  const storage = namespace.storage;
  const core = namespace.queueCore;
  const radios = [...document.querySelectorAll('input[name="queue-shortcut"]')];
  const claudeAutoContinue = document.querySelector('#claude-auto-continue');

  function selectShortcut(value) {
    const normalized = core.normalizeShortcut(value);
    for (const radio of radios) radio.checked = radio.value === normalized;
  }

  function selectClaudeAutoContinue(value) {
    if (claudeAutoContinue) claudeAutoContinue.checked = value !== false;
  }

  void storage.get([SHORTCUT_KEY, CLAUDE_AUTO_CONTINUE_KEY]).then((result) => {
    selectShortcut(result?.[SHORTCUT_KEY]);
    selectClaudeAutoContinue(result?.[CLAUDE_AUTO_CONTINUE_KEY]);
  });

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      void storage.set({ [SHORTCUT_KEY]: core.normalizeShortcut(radio.value) });
    });
  }

  claudeAutoContinue?.addEventListener('change', () => {
    void storage.set({ [CLAUDE_AUTO_CONTINUE_KEY]: claudeAutoContinue.checked });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[SHORTCUT_KEY]) selectShortcut(changes[SHORTCUT_KEY].newValue);
    if (changes[CLAUDE_AUTO_CONTINUE_KEY]) selectClaudeAutoContinue(changes[CLAUDE_AUTO_CONTINUE_KEY].newValue);
  });
})();
