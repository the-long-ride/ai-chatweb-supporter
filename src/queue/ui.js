(() => {
  'use strict';
  const MAX_VISIBLE_ITEMS = 5;
  const ROW_HEIGHT_PX = 34;
  const ROW_GAP_PX = 4;
  const UNDO_TTL_MS = 5000;

  function hasQueueOverflow(count) { return Number(count) > MAX_VISIBLE_ITEMS; }
  function shouldShowHiddenAboveIndicator(count, scrollTop) { return hasQueueOverflow(count) && Number(scrollTop) > 1; }
  function queueViewportMaxHeightPx() { return (MAX_VISIBLE_ITEMS * ROW_HEIGHT_PX) + ((MAX_VISIBLE_ITEMS - 1) * ROW_GAP_PX); }
  function undoCountdown({ expiresAt, now = Date.now(), ttlMs = UNDO_TTL_MS }) {
    const remaining = Math.max(0, Number(expiresAt) - Number(now));
    return { seconds: remaining > 0 ? Math.ceil(remaining / 1000) : 0, ratio: Math.max(0, Math.min(1, remaining / ttlMs)) };
  }

  const ICONS = Object.freeze({
    edit: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 21l3-1 13-13-2-2L4 18l-1 3z" stroke="currentColor"/></svg>',
    delete: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8" stroke="currentColor"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 7H4v-5M4 7c3-4 10-5 14-1s3 11-2 14" stroke="currentColor"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 14L12 9L17 14" stroke="currentColor"/></svg>',
  });

  const api = { MAX_VISIBLE_ITEMS, ROW_HEIGHT_PX, ROW_GAP_PX, hasQueueOverflow, shouldShowHiddenAboveIndicator, queueViewportMaxHeightPx, undoCountdown, ICONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).queueUi = api;
})();
