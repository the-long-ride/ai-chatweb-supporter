(() => {
  'use strict';

  const MIN_WIDTH = 220;
  const MAX_WIDTH = 700;

  function clampWidth(value) {
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
  }

  function parseStoredWidth(value) {
    return Number.isFinite(value) && value >= MIN_WIDTH && value <= MAX_WIDTH
      ? value
      : null;
  }

  function scoreSidebarCandidate(metrics) {
    let score = 0;
    if (!metrics.visible) return Number.NEGATIVE_INFINITY;
    if (metrics.left <= 24 && metrics.right > 180) score += 5;
    if (metrics.width >= 180 && metrics.width <= 760) score += 4;
    if (metrics.heightRatio >= 0.65) score += 4;
    if (metrics.semanticHint) score += 3;
    if (metrics.containsNavigation) score += 2;
    if (metrics.isBodyLike || metrics.widthRatio > 0.8) score -= 10;
    return score;
  }

  const SIDEBAR_WIDTH_VAR = '--sidebar-width';

  function collectSidebarWidthTargets(sidebar) {
    const targets = [];
    let element = sidebar;

    while (element) {
      if (element.style) targets.push(element);
      element = element.parentElement || null;
    }

    return targets;
  }

  function applySidebarWidthVariable(sidebar, width, overrides) {
    const next = clampWidth(width);
    if (!sidebar || !overrides) return next;

    for (const element of collectSidebarWidthTargets(sidebar)) {
      if (!overrides.has(element)) {
        overrides.set(element, {
          value: element.style.getPropertyValue(SIDEBAR_WIDTH_VAR),
          priority: element.style.getPropertyPriority(SIDEBAR_WIDTH_VAR),
        });
      }

      element.style.setProperty(SIDEBAR_WIDTH_VAR, `${next}px`, 'important');
    }

    return next;
  }

  function restoreSidebarWidthVariable(overrides) {
    if (!overrides) return;

    for (const [element, original] of overrides) {
      if (!element?.style) continue;

      if (original.value) {
        element.style.setProperty(
          SIDEBAR_WIDTH_VAR,
          original.value,
          original.priority || ''
        );
      } else {
        element.style.removeProperty(SIDEBAR_WIDTH_VAR);
      }
    }

    overrides.clear();
  }

  const api = {
    clampWidth,
    parseStoredWidth,
    scoreSidebarCandidate,
    applySidebarWidthVariable,
    restoreSidebarWidthVariable,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const STORAGE_KEY = 'cgptSidebarResizerWidth';
  const HANDLE_ID = 'cgpt-sidebar-resizer-handle';
  const TOP_SAFETY_INSET = 48;
  const BOTTOM_SAFETY_INSET = 8;
  const CANDIDATE_SELECTOR = [
    'aside',
    'nav',
    '[role="navigation"]',
    '[class*="sidebar" i]',
    '[id*="sidebar" i]',
    '[data-testid*="sidebar" i]',
  ].join(',');
  const NAV_SELECTOR = 'nav, [role="navigation"]';

  let currentSidebar = null;
  let handle = null;
  let savedWidth = null;
  let dragState = null;
  let mutationObserver = null;
  let resizeObserver = null;
  let discoveryFrame = 0;
  let positionFrame = 0;
  const widthOverrides = new Map();

  function candidateMetrics(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const semanticHint = element.matches(CANDIDATE_SELECTOR);

    return {
      visible:
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden',
      left: rect.left,
      right: rect.right,
      width: rect.width,
      heightRatio: rect.height / Math.max(window.innerHeight, 1),
      widthRatio: rect.width / Math.max(window.innerWidth, 1),
      semanticHint,
      containsNavigation: Boolean(
        element.matches(NAV_SELECTOR) || element.querySelector(NAV_SELECTOR)
      ),
      isBodyLike: element === document.body || element === document.documentElement,
    };
  }

  function addNavigationAncestors(candidateSet) {
    for (const navigation of document.querySelectorAll(NAV_SELECTOR)) {
      const navRect = navigation.getBoundingClientRect();
      let element = navigation;
      let depth = 0;

      while (element && depth < 8) {
        if (element.nodeType === Node.ELEMENT_NODE) {
          const rect = element.getBoundingClientRect();
          const isSidebarSized =
            rect.width >= 180 &&
            rect.width <= 760 &&
            rect.height >= window.innerHeight * 0.6 &&
            rect.left <= 24 &&
            Math.abs(rect.right - navRect.right) <= 32;

          if (isSidebarSized) candidateSet.add(element);
        }

        if (element === document.body || element === document.documentElement) break;
        element = element.parentElement;
        depth += 1;
      }
    }
  }

  function findSidebar() {
    const candidates = new Set(document.querySelectorAll(CANDIDATE_SELECTOR));
    addNavigationAncestors(candidates);

    let best = null;
    let bestScore = 7;

    for (const candidate of candidates) {
      if (!(candidate instanceof Element) || candidate.id === HANDLE_ID) continue;

      const metrics = candidateMetrics(candidate);
      const score = scoreSidebarCandidate(metrics);
      if (score < bestScore) continue;

      if (
        score > bestScore ||
        !best ||
        (candidate !== best && candidate.contains(best))
      ) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  function applyWidth(sidebar, width) {
    return applySidebarWidthVariable(sidebar, width, widthOverrides);
  }

  function clearWidth() {
    restoreSidebarWidthVariable(widthOverrides);
  }

  function storageArea() {
    return globalThis.chrome && globalThis.chrome.storage
      ? globalThis.chrome.storage.local
      : null;
  }

  function loadSavedWidth() {
    const storage = storageArea();
    if (!storage) return;

    storage.get([STORAGE_KEY], (result) => {
      savedWidth = parseStoredWidth(result?.[STORAGE_KEY]);
      if (savedWidth !== null && currentSidebar?.isConnected) {
        applyWidth(currentSidebar, savedWidth);
      }
      scheduleHandlePosition();
    });
  }

  function persistWidth(width) {
    const parsed = parseStoredWidth(width);
    if (parsed === null) return;

    savedWidth = parsed;
    const storage = storageArea();
    if (storage) storage.set({ [STORAGE_KEY]: parsed });
  }

  function resetWidth() {
    savedWidth = null;
    clearWidth();
    const storage = storageArea();
    if (storage) storage.remove(STORAGE_KEY);
    scheduleHandlePosition();
  }

  function createHandle() {
    const existing = document.getElementById(HANDLE_ID);
    if (existing) return existing;

    const element = document.createElement('div');
    element.id = HANDLE_ID;
    element.setAttribute('role', 'separator');
    element.setAttribute('aria-orientation', 'vertical');
    element.setAttribute('aria-label', 'Resize ChatGPT sidebar');
    element.setAttribute('aria-valuemin', String(MIN_WIDTH));
    element.setAttribute('aria-valuemax', String(MAX_WIDTH));
    element.hidden = true;

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerEnd);
    element.addEventListener('pointercancel', onPointerEnd);
    element.addEventListener('dblclick', onDoubleClick);

    document.documentElement.appendChild(element);
    return element;
  }

  function sidebarIsOpen(rect) {
    return (
      rect.width >= 180 &&
      rect.height > TOP_SAFETY_INSET + 24 &&
      rect.right > 0 &&
      rect.left < window.innerWidth &&
      rect.left <= 24
    );
  }

  function updateHandlePosition() {
    positionFrame = 0;
    if (!handle) return;

    if (!currentSidebar?.isConnected) {
      handle.hidden = true;
      return;
    }

    const rect = currentSidebar.getBoundingClientRect();
    if (!sidebarIsOpen(rect)) {
      handle.hidden = true;
      return;
    }

    const top = Math.max(rect.top + TOP_SAFETY_INSET, TOP_SAFETY_INSET);
    const bottom = Math.min(rect.bottom - BOTTOM_SAFETY_INSET, window.innerHeight);
    const height = Math.max(0, bottom - top);

    if (height < 32) {
      handle.hidden = true;
      return;
    }

    handle.hidden = false;
    handle.style.left = `${Math.round(rect.right - 5)}px`;
    handle.style.top = `${Math.round(top)}px`;
    handle.style.height = `${Math.round(height)}px`;
    handle.setAttribute(
      'aria-valuenow',
      String(Math.round(clampWidth(rect.width)))
    );
  }

  function scheduleHandlePosition() {
    if (positionFrame) return;
    positionFrame = window.requestAnimationFrame(updateHandlePosition);
  }

  function connectResizeObserver() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    if (!currentSidebar || typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver(scheduleHandlePosition);
    resizeObserver.observe(currentSidebar);
  }

  function setSidebar(nextSidebar) {
    if (nextSidebar === currentSidebar) {
      scheduleHandlePosition();
      return;
    }

    if (currentSidebar) {
      clearWidth();
    }

    currentSidebar = nextSidebar;

    if (!currentSidebar) {
      if (handle) handle.hidden = true;
      connectResizeObserver();
      return;
    }

    if (savedWidth !== null) applyWidth(currentSidebar, savedWidth);
    connectResizeObserver();
    scheduleHandlePosition();
  }

  function discoverSidebar() {
    discoveryFrame = 0;
    const discovered = findSidebar();
    setSidebar(discovered);
  }

  function scheduleDiscovery() {
    if (discoveryFrame) return;
    discoveryFrame = window.requestAnimationFrame(discoverSidebar);
  }

  function nodeMayContainSidebar(node) {
    if (!(node instanceof Element)) return false;
    if (node.id === HANDLE_ID) return false;
    return node.matches(CANDIDATE_SELECTOR) || Boolean(node.querySelector(CANDIDATE_SELECTOR));
  }

  function mutationMayAffectSidebar(mutation) {
    if (!currentSidebar?.isConnected) return true;

    for (const node of mutation.removedNodes) {
      if (node === currentSidebar || (node instanceof Element && node.contains(currentSidebar))) {
        return true;
      }
    }

    for (const node of mutation.addedNodes) {
      if (nodeMayContainSidebar(node)) return true;
    }

    return false;
  }

  function startMutationObserver() {
    if (!document.body || mutationObserver) return;

    mutationObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutationMayAffectSidebar)) scheduleDiscovery();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  function onPointerDown(event) {
    if (event.button !== 0 || !currentSidebar?.isConnected) return;

    const rect = currentSidebar.getBoundingClientRect();
    if (!sidebarIsOpen(rect)) return;

    event.preventDefault();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: rect.width,
      currentWidth: clampWidth(rect.width),
    };

    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail if Chromium has already cancelled the pointer.
    }

    document.documentElement.classList.add('cgpt-sidebar-resizer-dragging');
  }

  function onPointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId || !currentSidebar) return;

    event.preventDefault();
    const width = dragState.startWidth + event.clientX - dragState.startX;
    dragState.currentWidth = applyWidth(currentSidebar, width);
    handle.setAttribute('aria-valuenow', String(Math.round(dragState.currentWidth)));
    scheduleHandlePosition();
  }

  function onPointerEnd(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const finalWidth = dragState.currentWidth;
    dragState = null;
    document.documentElement.classList.remove('cgpt-sidebar-resizer-dragging');

    try {
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore release races after pointer cancellation.
    }

    persistWidth(finalWidth);
    scheduleHandlePosition();
  }

  function onDoubleClick(event) {
    event.preventDefault();
    dragState = null;
    document.documentElement.classList.remove('cgpt-sidebar-resizer-dragging');
    resetWidth();
  }

  function bootstrap() {
    handle = createHandle();
    loadSavedWidth();
    scheduleDiscovery();
    startMutationObserver();
    window.addEventListener('resize', scheduleHandlePosition, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
