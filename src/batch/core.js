(() => {
  'use strict';

  function createSelection(initial = []) {
    return new Set(Array.from(initial || []).filter(Boolean));
  }

  function toggleSelection(selection, id) {
    if (!selection || !id) return false;
    if (selection.has(id)) {
      selection.delete(id);
      return false;
    }
    selection.add(id);
    return true;
  }

  function clearSelection(selection) {
    selection?.clear?.();
    return selection;
  }

  function confirmationMessage(action, count) {
    const verb = action === 'archive' ? 'Archive' : 'Delete';
    return `${verb} ${count} selected conversation${count === 1 ? '' : 's'}?`;
  }

  function actionEnabled({ selection, busy = false, supported = true } = {}) {
    return Boolean(supported && !busy && selection?.size);
  }

  async function runSequential(ids, operation) {
    const succeeded = [];
    const failed = [];
    for (const id of Array.from(ids || [])) {
      try {
        await operation(id);
        succeeded.push(id);
      } catch (error) {
        failed.push({ id, error });
      }
    }
    return { succeeded, failed };
  }

  async function runParallel(ids, operation, { concurrency = 0 } = {}) {
    const list = Array.from(ids || []);
    if (!list.length) return { succeeded: [], failed: [] };

    const limit = typeof concurrency === 'number' && concurrency > 0
      ? Math.min(concurrency, list.length)
      : list.length;

    const results = new Array(list.length);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < list.length) {
        const index = nextIndex++;
        const id = list[index];
        try {
          await operation(id);
          results[index] = { ok: true, id };
        } catch (error) {
          results[index] = { ok: false, id, error };
        }
      }
    }

    const workers = Array.from({ length: limit }, () => worker());
    await Promise.all(workers);

    const succeeded = [];
    const failed = [];
    for (const res of results) {
      if (res.ok) {
        succeeded.push(res.id);
      } else {
        failed.push({ id: res.id, error: res.error });
      }
    }
    return { succeeded, failed };
  }

  const api = {
    createSelection,
    toggleSelection,
    clearSelection,
    confirmationMessage,
    actionEnabled,
    runSequential,
    runParallel,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).batchCore = api;
})();
