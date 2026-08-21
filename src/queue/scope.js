(() => {
  'use strict';

  const namespace = globalThis.AiChatWebSupporter || {};
  const constants = typeof module !== 'undefined' && module.exports
    ? require('../shared/constants.js')
    : namespace.constants;
  const core = typeof module !== 'undefined' && module.exports
    ? require('./core.js')
    : namespace.queueCore;

  const LEGACY_QUEUE_KEY = constants.STORAGE_KEYS.messageQueue;

  function extractConversationId(url) {
    if (typeof url !== 'string' || !url) return null;
    try {
      const parsed = new URL(url, 'https://chatgpt.com/');
      const match = parsed.pathname.match(/(?:^|\/)c\/([^/?#]+)/);
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    } catch {
      const match = url.match(/(?:^|\/)c\/([^/?#]+)/);
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    }
  }

  function normalizeTabId(tabId) {
    if (Number.isInteger(tabId) && tabId >= 0) return String(tabId);
    if (typeof tabId === 'string' && /^\d+$/.test(tabId)) return tabId;
    return null;
  }

  function resolveScope(url, tabId) {
    const conversationId = extractConversationId(url);
    if (conversationId) return `conversation:${conversationId}`;
    const normalizedTabId = normalizeTabId(tabId);
    return normalizedTabId === null ? null : `tab:${normalizedTabId}`;
  }

  function isScopeContinuation(previousScope, nextScope) {
    return (
      typeof previousScope === 'string' && previousScope.startsWith('tab:') &&
      typeof nextScope === 'string' && nextScope.startsWith('conversation:') &&
      previousScope !== nextScope
    );
  }

  function queueStorageKey(scopeId) {
    return typeof scopeId === 'string' && scopeId
      ? `${LEGACY_QUEUE_KEY}:${scopeId}`
      : null;
  }

  function mergeQueues(primary, secondary) {
    const first = core.normalizeQueue(primary);
    const second = core.normalizeQueue(secondary);
    const seen = new Set(first.map((item) => item.id));
    return [
      ...first,
      ...second.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }),
    ];
  }

  function planScopeTransition({ previousScope, nextScope, previousQueue, nextQueue }) {
    const targetQueue = core.normalizeQueue(nextQueue);
    const canTransfer =
      typeof previousScope === 'string' && previousScope.startsWith('tab:') &&
      typeof nextScope === 'string' && nextScope.startsWith('conversation:') &&
      previousScope !== nextScope &&
      core.normalizeQueue(previousQueue).length > 0;

    if (!canTransfer) {
      return { transfer: false, queue: targetQueue, removePrevious: false };
    }

    return {
      transfer: true,
      queue: mergeQueues(targetQueue, previousQueue),
      removePrevious: true,
    };
  }

  function planLegacyMigration({ scopedQueue, legacyQueue }) {
    const scoped = core.normalizeQueue(scopedQueue);
    const legacy = core.normalizeQueue(legacyQueue);
    if (!scoped.length && legacy.length) {
      return { migrate: true, queue: legacy, removeLegacy: true };
    }
    return { migrate: false, queue: scoped, removeLegacy: false };
  }

  const api = {
    LEGACY_QUEUE_KEY,
    extractConversationId,
    resolveScope,
    queueStorageKey,
    isScopeContinuation,
    mergeQueues,
    planScopeTransition,
    planLegacyMigration,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const shared = globalThis.AiChatWebSupporter ||= {};
    shared.queueScope = api;
  }
})();
