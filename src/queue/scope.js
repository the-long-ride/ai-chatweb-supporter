(() => {
  'use strict';

  const namespace = globalThis.AiChatWebSupporter || {};
  const constants = typeof module !== 'undefined' && module.exports ? require('../shared/constants.js') : namespace.constants;
  const core = typeof module !== 'undefined' && module.exports ? require('./core.js') : namespace.queueCore;
  const LEGACY_QUEUE_KEY = constants.STORAGE_KEYS.messageQueue;

  function normalizeTabId(tabId) {
    if (Number.isInteger(tabId) && tabId >= 0) return String(tabId);
    if (typeof tabId === 'string' && /^\d+$/.test(tabId)) return tabId;
    return null;
  }

  function parseScope(scopeId) {
    if (typeof scopeId !== 'string') return null;
    const match = scopeId.match(/^([^:]+):(conversation|tab):(.+)$/);
    return match ? { providerId: match[1], kind: match[2], value: match[3] } : null;
  }

  function resolveScope(provider, url, tabId) {
    if (!provider?.id || !provider?.extractConversationId) return null;
    const conversationId = provider.extractConversationId(url);
    if (conversationId) return `${provider.id}:conversation:${conversationId}`;
    const normalizedTabId = normalizeTabId(tabId);
    return normalizedTabId === null ? null : `${provider.id}:tab:${normalizedTabId}`;
  }

  function queueStorageKey(scopeId) {
    return parseScope(scopeId) ? `${LEGACY_QUEUE_KEY}:${scopeId}` : null;
  }

  function legacyScopedKey(scopeId) {
    const parsed = parseScope(scopeId);
    if (!parsed || parsed.providerId !== 'chatgpt') return null;
    return `${LEGACY_QUEUE_KEY}:${parsed.kind}:${parsed.value}`;
  }

  function legacyGlobalKey(scopeId) {
    return parseScope(scopeId)?.providerId === 'chatgpt' ? LEGACY_QUEUE_KEY : null;
  }

  function isScopeContinuation(previousScope, nextScope) {
    const previous = parseScope(previousScope);
    const next = parseScope(nextScope);
    return Boolean(previous && next && previous.providerId === next.providerId && previous.kind === 'tab' && next.kind === 'conversation' && previousScope !== nextScope);
  }

  function mergeQueues(primary, secondary) {
    const first = core.normalizeQueue(primary);
    const second = core.normalizeQueue(secondary);
    const seen = new Set(first.map((item) => item.id));
    return [...first, ...second.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })];
  }

  function planScopeTransition({ previousScope, nextScope, previousState, nextState }) {
    const previous = core.normalizeQueueState(previousState);
    const target = core.normalizeQueueState(nextState);
    if (!isScopeContinuation(previousScope, nextScope) || (!previous.items.length && !previous.paused)) {
      return { transfer: false, state: target, removePrevious: false };
    }
    return {
      transfer: true,
      state: { paused: target.paused || previous.paused, items: mergeQueues(target.items, previous.items) },
      removePrevious: true,
    };
  }

  function planLegacyMigration({ scopedState, legacyQueue }) {
    const scoped = core.normalizeQueueState(scopedState);
    const legacy = core.normalizeQueue(legacyQueue);
    if (!scoped.items.length && legacy.length) {
      return { migrate: true, state: { paused: scoped.paused, items: legacy }, removeLegacy: true };
    }
    return { migrate: false, state: scoped, removeLegacy: false };
  }

  const api = { LEGACY_QUEUE_KEY, normalizeTabId, parseScope, resolveScope, queueStorageKey, legacyScopedKey, legacyGlobalKey, isScopeContinuation, mergeQueues, planScopeTransition, planLegacyMigration };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).queueScope = api;
})();
