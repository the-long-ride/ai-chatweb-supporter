(() => {
  'use strict';

  function storageArea() {
    return globalThis.chrome?.storage?.local || null;
  }

  function get(keys) {
    const storage = storageArea();
    if (!storage) return Promise.resolve({});
    return new Promise((resolve) => {
      storage.get(keys, (result) => {
        void globalThis.chrome?.runtime?.lastError;
        resolve(result || {});
      });
    });
  }

  function set(values) {
    const storage = storageArea();
    if (!storage) return Promise.resolve();
    return new Promise((resolve) => {
      storage.set(values, () => {
        void globalThis.chrome?.runtime?.lastError;
        resolve();
      });
    });
  }

  function remove(keys) {
    const storage = storageArea();
    if (!storage) return Promise.resolve();
    return new Promise((resolve) => {
      storage.remove(keys, () => {
        void globalThis.chrome?.runtime?.lastError;
        resolve();
      });
    });
  }

  const api = { storageArea, get, set, remove };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const namespace = globalThis.AiChatWebSupporter ||= {};
    namespace.storage = api;
  }
})();
