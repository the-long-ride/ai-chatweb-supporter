(() => {
  'use strict';

  const MIN_WIDTH = 220;
  const MAX_WIDTH = 700;
  const SIDEBAR_WIDTH_VAR = '--sidebar-width';

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
        element.style.setProperty(SIDEBAR_WIDTH_VAR, original.value, original.priority || '');
      } else {
        element.style.removeProperty(SIDEBAR_WIDTH_VAR);
      }
    }
    overrides.clear();
  }

  const api = {
    MIN_WIDTH,
    MAX_WIDTH,
    SIDEBAR_WIDTH_VAR,
    clampWidth,
    parseStoredWidth,
    scoreSidebarCandidate,
    collectSidebarWidthTargets,
    applySidebarWidthVariable,
    restoreSidebarWidthVariable,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const namespace = globalThis.AiChatWebSupporter ||= {};
    namespace.sidebarCore = api;
  }
})();
