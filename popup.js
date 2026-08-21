(() => {
  'use strict';

  const SHORTCUT_KEY = 'cgptQueueShortcut';
  const core = globalThis.CgptQueueCore;
  const radios = [...document.querySelectorAll('input[name="queue-shortcut"]')];

  function selectShortcut(value) {
    const normalized = core.normalizeShortcut(value);
    for (const radio of radios) radio.checked = radio.value === normalized;
  }

  chrome.storage.local.get([SHORTCUT_KEY], (result) => {
    void chrome.runtime.lastError;
    selectShortcut(result?.[SHORTCUT_KEY]);
  });

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      chrome.storage.local.set({ [SHORTCUT_KEY]: core.normalizeShortcut(radio.value) });
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[SHORTCUT_KEY]) {
      selectShortcut(changes[SHORTCUT_KEY].newValue);
    }
  });
})();
