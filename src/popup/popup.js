(() => {
  'use strict';

  const namespace = globalThis.AiChatWebSupporter;
  const { queueShortcut: SHORTCUT_KEY } = namespace.constants.STORAGE_KEYS;
  const storage = namespace.storage;
  const core = namespace.queueCore;
  const radios = [...document.querySelectorAll('input[name="queue-shortcut"]')];

  function selectShortcut(value) {
    const normalized = core.normalizeShortcut(value);
    for (const radio of radios) radio.checked = radio.value === normalized;
  }

  void storage.get([SHORTCUT_KEY]).then((result) => selectShortcut(result?.[SHORTCUT_KEY]));

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      void storage.set({ [SHORTCUT_KEY]: core.normalizeShortcut(radio.value) });
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[SHORTCUT_KEY]) selectShortcut(changes[SHORTCUT_KEY].newValue);
  });
})();
