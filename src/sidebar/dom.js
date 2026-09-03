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
    '[data-sidebar="sidebar"]',
    '[data-side="left"][data-variant="sidebar"]',
  ].join(',');
  const NAV_SELECTOR = 'nav, [role="navigation"]';
  const GROK_SIDEBAR_SELECTOR = '[data-side="left"][data-variant="sidebar"] [data-sidebar="sidebar"]';
  const CHATGPT_EXPANDED_SURFACE_SELECTOR = '#history, [class*="sidebar-expando-section"]';
  const GROK_EXPANDED_SURFACE_SELECTOR = '[data-sidebar="menu"], [data-sidebar="sidebar"]';
  const SIDEBAR_SURFACE_SELECTOR = [
    CHATGPT_EXPANDED_SURFACE_SELECTOR,
    GROK_EXPANDED_SURFACE_SELECTOR,
    '[data-testid="sidebar-recents"]',
    'nav',
    '[role="navigation"]',
  ].join(',');

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
    const grokSidebar = doc.querySelector?.(GROK_SIDEBAR_SELECTOR);
    if (grokSidebar && candidateMetrics(grokSidebar, win, doc).visible) return grokSidebar;

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
    const viewportWidth = Math.max(Number(win?.innerWidth) || 0, 1);
    const visibleLeft = Math.max(rect.left, 0);
    const visibleRight = Math.min(rect.right, viewportWidth);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const minimumVisibleWidth = Math.min(160, rect.width * 0.5);
    return rect.width >= 180
      && rect.height > TOP_SAFETY_INSET + 24
      && rect.left < viewportWidth
      && rect.left <= 24
      && visibleWidth >= minimumVisibleWidth;
  }

  function elementSignalsCollapsed(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.hidden || element.hasAttribute?.('hidden')) return true;

    const state = String(element.getAttribute?.('data-state') || '').trim().toLowerCase();
    if (state === 'collapsed') return true;

    if (element.hasAttribute?.('data-collapsed')) {
      const collapsed = String(element.getAttribute?.('data-collapsed') || '').trim().toLowerCase();
      if (!['false', '0', 'open', 'expanded'].includes(collapsed)) return true;
    }

    const collapsible = String(element.getAttribute?.('data-collapsible') || '').trim().toLowerCase();
    if (collapsible === 'icon' || collapsible === 'offcanvas') return true;

    return false;
  }

  function sidebarSignalsCollapsed(sidebar) {
    let element = sidebar;
    let depth = 0;
    while (element && depth < 8) {
      if (elementSignalsCollapsed(element)) return true;
      element = element.parentElement || null;
      depth += 1;
    }
    return false;
  }

  function surfaceSelectorForSite(siteId) {
    if (siteId === 'chatgpt') return CHATGPT_EXPANDED_SURFACE_SELECTOR;
    if (siteId === 'grok') return GROK_EXPANDED_SURFACE_SELECTOR;
    return SIDEBAR_SURFACE_SELECTOR;
  }

  function listSidebarSurfaces(sidebar, siteId = '') {
    if (!sidebar) return [];
    const selector = surfaceSelectorForSite(siteId);
    const surfaces = [];
    const seen = new Set();
    if (sidebar.matches?.(selector)) {
      seen.add(sidebar);
      surfaces.push(sidebar);
    }
    for (const element of Array.from(sidebar.querySelectorAll?.(selector) || [])) {
      if (!element || seen.has(element)) continue;
      seen.add(element);
      surfaces.push(element);
    }
    return surfaces;
  }

  function surfaceIsExpanded(surface, sidebarRect, win = globalThis.window) {
    if (!surface?.getBoundingClientRect) return false;
    const rect = surface.getBoundingClientRect();
    const style = win?.getComputedStyle?.(surface) || {};
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;

    const viewportWidth = Math.max(Number(win?.innerWidth) || 0, 1);
    const visibleLeft = Math.max(rect.left, 0);
    const visibleRight = Math.min(rect.right, viewportWidth);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const minimumExpandedWidth = Math.min(160, Math.max(120, sidebarRect.width * 0.45));
    return rect.height >= 48 && visibleWidth >= minimumExpandedWidth;
  }

  function sidebarElementIsOpen(sidebar, win = globalThis.window, siteId = '') {
    if (!sidebar?.getBoundingClientRect || sidebar.isConnected === false) return false;
    const rect = sidebar.getBoundingClientRect();
    if (!sidebarIsOpen(rect, win)) return false;
    if (sidebarSignalsCollapsed(sidebar)) return false;

    const surfaces = listSidebarSurfaces(sidebar, siteId);
    if (!surfaces.length) return false;
    return surfaces.some((surface) => surfaceIsExpanded(surface, rect, win));
  }

  function nodeMayContainSidebar(node) {
    if (!node || typeof node.matches !== 'function') return false;
    if (node.id === HANDLE_ID) return false;
    return node.matches(CANDIDATE_SELECTOR) || Boolean(node.querySelector?.(CANDIDATE_SELECTOR));
  }

  function mutationMayAffectSidebar(mutation, currentSidebar) {
    if (!currentSidebar?.isConnected) return true;
    const target = mutation?.target;
    if (target && (
      target === currentSidebar
      || target?.contains?.(currentSidebar)
      || currentSidebar?.contains?.(target)
    )) return true;

    for (const node of Array.from(mutation?.removedNodes || [])) {
      if (node === currentSidebar || (typeof node.contains === 'function' && node.contains(currentSidebar))) return true;
    }
    for (const node of Array.from(mutation?.addedNodes || [])) {
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
    GROK_SIDEBAR_SELECTOR,
    CHATGPT_EXPANDED_SURFACE_SELECTOR,
    GROK_EXPANDED_SURFACE_SELECTOR,
    SIDEBAR_SURFACE_SELECTOR,
    candidateMetrics,
    addNavigationAncestors,
    findSidebar,
    sidebarIsOpen,
    sidebarSignalsCollapsed,
    listSidebarSurfaces,
    sidebarElementIsOpen,
    nodeMayContainSidebar,
    mutationMayAffectSidebar,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const namespace = globalThis.AiChatWebSupporter ||= {};
    namespace.sidebarDom = api;
  }
})();
