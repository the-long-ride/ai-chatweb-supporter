(() => {
  'use strict';

  const MAX_VISIBLE_ITEMS = 5;
  const ROW_HEIGHT_PX = 34;
  const ROW_GAP_PX = 4;

  function hasQueueOverflow(count) { return Number(count) > MAX_VISIBLE_ITEMS; }
  function shouldShowHiddenAboveIndicator(count, scrollTop) { return hasQueueOverflow(count) && Number(scrollTop) > 1; }
  function queueViewportMaxHeightPx() { return (MAX_VISIBLE_ITEMS * ROW_HEIGHT_PX) + ((MAX_VISIBLE_ITEMS - 1) * ROW_GAP_PX); }

  const ICONS = Object.freeze({
    edit: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true"><path d="M20,16v4a2,2,0,0,1-2,2H4a2,2,0,0,1-2-2V6A2,2,0,0,1,4,4H8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><polygon fill="none" points="12.5 15.8 22 6.2 17.8 2 8.3 11.5 8 16 12.5 15.8" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
    delete: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 12L14 16M14 12L10 16M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    undo: '<svg viewBox="-0.5 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 21.4199H15C16.8565 21.4199 18.637 20.6824 19.9497 19.3696C21.2625 18.0569 22 16.2764 22 14.4199C22 12.5634 21.2625 10.783 19.9497 9.47021C18.637 8.15746 16.8565 7.41992 15 7.41992H2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11.4199L2 7.41992L6 3.41992" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7 14L12 9L17 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  });

  const api = { MAX_VISIBLE_ITEMS, ROW_HEIGHT_PX, ROW_GAP_PX, hasQueueOverflow, shouldShowHiddenAboveIndicator, queueViewportMaxHeightPx, ICONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const namespace = globalThis.AiChatWebSupporter ||= {};
    namespace.queueUi = api;
  }
})();
