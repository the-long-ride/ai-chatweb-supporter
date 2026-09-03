(() => {
  'use strict';

  function createReconcileScheduler({ doc = globalThis.document, win = globalThis.window, reconcile }) {
    let pending = false;

    const run = () => {
      pending = false;
      void Promise.resolve(reconcile?.()).catch(() => {});
    };

    const schedule = () => {
      if (pending) return;
      pending = true;
      if (doc?.visibilityState === 'hidden') {
        const enqueue = win?.queueMicrotask || globalThis.queueMicrotask || ((callback) => Promise.resolve().then(callback));
        enqueue(run);
        return;
      }
      const raf = win?.requestAnimationFrame;
      if (typeof raf === 'function') raf(run);
      else (win?.setTimeout || setTimeout)(run, 0);
    };

    return { schedule };
  }

  const api = { createReconcileScheduler };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).queueScheduler = api;
})();
