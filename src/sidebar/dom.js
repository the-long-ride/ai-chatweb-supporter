(() => {
  'use strict';

  const core = typeof module !== 'undefined' && module.exports
    ? require('./core.js')
    : globalThis.AiChatWebSupporter.sidebarCore;

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

  function candidateMetrics(element, win = globalThis.window, doc = globalThis.document) {
    const rect = element.getBoundingClientRect();
    const style = win.getComputedStyle(element);
    return {
      visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      left: rect.left,
      right: rect.right,
      width: rect.width,
      heightRatio: rect.height / Math.max(win.innerHeight, 1),
      widthRatio: rect.width / Math.max(win.innerWidth, 1),
      semanticHint: element.matches(CANDIDATE_SELECTOR),
      containsNavigation: Boolean(element.matches(NAV_SELECTOR) || element.querySelector(NAV_SELECTOR)),
      isBodyLike: element === doc.body || element === doc.documentElement,
    };
  }

  function addNavigationAncestors(candidateSet, doc = globalThis.document, win = globalThis.window) {
    for (const navigation of doc.querySelectorAll(NAV_SELECTOR)) {
      const navRect = navigation.getBoundingClientRect();
      let element = navigation;
      let depth = 0;
      while (element && depth < 8) {
        if (element.nodeType === 1) {
          const rect = element.getBoundingClientRect();
          const isSidebarSized = rect.width >= 180 && rect.width <= 760 && rect.height >= win.innerHeight * 0.6 && rect.left <= 24 && Math.abs(rect.right - navRect.right) <= 32;
          if (isSidebarSized) candidateSet.add(element);
        }
        if (element === doc.body || element === doc.documentElement) break;
        element = element.parentElement;
        depth += 1;
      }
    }
  }

  function findSidebar(doc = globalThis.document, win = globalThis.window) {
    const candidates = new Set(doc.querySelectorAll(CANDIDATE_SELECTOR));
    addNavigationAncestors(candidates, doc, win);
    let best = null;
    let bestScore = 7;
    for (const candidate of candidates) {
      if (!candidate || typeof candidate.matches !== 'function' || candidate.id === HANDLE_ID) continue;
      const score = core.scoreSidebarCandidate(candidateMetrics(candidate, win, doc));
      if (score < bestScore) continue;
      if (score > bestScore || !best || (candidate !== best && candidate.contains(best))) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  function sidebarIsOpen(rect, win = globalThis.window) {
    return rect.width >= 180 && rect.height > TOP_SAFETY_INSET + 24 && rect.right > 0 && rect.left < win.innerWidth && rect.left <= 24;
  }

  function nodeMayContainSidebar(node) {
    if (!node || typeof node.matches !== 'function') return false;
    if (node.id === HANDLE_ID) return false;
    return node.matches(CANDIDATE_SELECTOR) || Boolean(node.querySelector?.(CANDIDATE_SELECTOR));
  }

  function mutationMayAffectSidebar(mutation, currentSidebar) {
    if (!currentSidebar?.isConnected) return true;
    for (const node of mutation.removedNodes) {
      if (node === currentSidebar || (typeof node.contains === 'function' && node.contains(currentSidebar))) return true;
    }
    for (const node of mutation.addedNodes) {
      if (nodeMayContainSidebar(node)) return true;
    }
    return false;
  }

  const api = {
    HANDLE_ID,
    TOP_SAFETY_INSET,
    BOTTOM_SAFETY_INSET,
    CANDIDATE_SELECTOR,
    NAV_SELECTOR,
    candidateMetrics,
    addNavigationAncestors,
    findSidebar,
    sidebarIsOpen,
    nodeMayContainSidebar,
    mutationMayAffectSidebar,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const namespace = globalThis.AiChatWebSupporter ||= {};
    namespace.sidebarDom = api;
  }
})();
