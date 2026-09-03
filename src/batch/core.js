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

  const api = {
    createSelection,
    toggleSelection,
    clearSelection,
    confirmationMessage,
    actionEnabled,
    runSequential,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).batchCore = api;
})();
