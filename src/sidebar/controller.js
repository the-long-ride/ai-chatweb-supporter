(() => {
  'use strict';

  const namespace = globalThis.AiChatWebSupporter || {};
  const constants = typeof module !== 'undefined' && module.exports
    ? require('../shared/constants.js')
    : namespace.constants;
  const storage = typeof module !== 'undefined' && module.exports
    ? require('../shared/storage.js')
    : namespace.storage;
  const core = typeof module !== 'undefined' && module.exports
    ? require('./core.js')
    : namespace.sidebarCore;
  const dom = typeof module !== 'undefined' && module.exports
    ? require('./dom.js')
    : namespace.sidebarDom;

  const { sidebarWidth: CHATGPT_STORAGE_KEY, grokSidebarWidth: GROK_STORAGE_KEY } = constants.STORAGE_KEYS;

  function resolveSidebarSite(hostname = globalThis.location?.hostname || '') {
    const normalized = String(hostname || '').toLowerCase();
    if (normalized === 'grok.com' || normalized.endsWith('.grok.com')) {
      return { id: 'grok', storageKey: GROK_STORAGE_KEY, label: 'Resize Grok sidebar' };
    }
    return { id: 'chatgpt', storageKey: CHATGPT_STORAGE_KEY, label: 'Resize ChatGPT sidebar' };
  }

  class SidebarController {
    constructor({ win = globalThis.window, doc = globalThis.document } = {}) {
      this.win = win;
      this.doc = doc;
      this.site = resolveSidebarSite(win?.location?.hostname || globalThis.location?.hostname || '');
      this.storageKey = this.site.storageKey;
      this.currentSidebar = null;
      this.handle = null;
      this.savedWidth = null;
      this.dragState = null;
      this.mutationObserver = null;
      this.resizeObserver = null;
      this.discoveryFrame = 0;
      this.positionFrame = 0;
      this.widthOverrides = new Map();
    }

    applyWidth(sidebar, width) {
      return core.applySidebarWidthVariable(sidebar, width, this.widthOverrides);
    }

    clearWidth() {
      core.restoreSidebarWidthVariable(this.widthOverrides);
    }

    async loadSavedWidth() {
      const result = await storage.get([this.storageKey]);
      this.savedWidth = core.parseStoredWidth(result?.[this.storageKey]);
      if (this.savedWidth !== null && this.currentSidebar?.isConnected) this.applyWidth(this.currentSidebar, this.savedWidth);
      this.scheduleHandlePosition();
    }

    async persistWidth(width) {
      const parsed = core.parseStoredWidth(width);
      if (parsed === null) return;
      this.savedWidth = parsed;
      await storage.set({ [this.storageKey]: parsed });
    }

    async resetWidth() {
      this.savedWidth = null;
      this.clearWidth();
      await storage.remove(this.storageKey);
      this.scheduleHandlePosition();
    }

    createHandle() {
      const existing = this.doc.getElementById(dom.HANDLE_ID);
      if (existing) return existing;
      const element = this.doc.createElement('div');
      element.id = dom.HANDLE_ID;
      element.setAttribute('role', 'separator');
      element.setAttribute('aria-orientation', 'vertical');
      element.setAttribute('aria-label', this.site.label);
      element.setAttribute('aria-valuemin', String(core.MIN_WIDTH));
      element.setAttribute('aria-valuemax', String(core.MAX_WIDTH));
      element.hidden = true;
      element.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      element.addEventListener('pointermove', (event) => this.onPointerMove(event));
      element.addEventListener('pointerup', (event) => this.onPointerEnd(event));
      element.addEventListener('pointercancel', (event) => this.onPointerEnd(event));
      element.addEventListener('dblclick', (event) => this.onDoubleClick(event));
      this.doc.documentElement.appendChild(element);
      return element;
    }

    updateHandlePosition() {
      this.positionFrame = 0;
      if (!this.handle) return;
      if (!this.currentSidebar?.isConnected) {
        this.handle.hidden = true;
        return;
      }
      if (!dom.sidebarElementIsOpen(this.currentSidebar, this.win, this.site.id)) {
        this.handle.hidden = true;
        return;
      }
      const rect = this.currentSidebar.getBoundingClientRect();
      const top = Math.max(rect.top, 0);
      const bottom = Math.min(rect.bottom, this.win.innerHeight);
      const height = Math.max(0, bottom - top);
      if (height < 32) {
        this.handle.hidden = true;
        return;
      }
      this.handle.hidden = false;
      this.handle.style.left = `${Math.round(rect.right - 5)}px`;
      this.handle.style.top = `${Math.round(top)}px`;
      this.handle.style.height = `${Math.round(height)}px`;
      this.handle.setAttribute('aria-valuenow', String(Math.round(core.clampWidth(rect.width))));
    }

    scheduleHandlePosition() {
      if (this.positionFrame) return;
      this.positionFrame = this.win.requestAnimationFrame(() => this.updateHandlePosition());
    }

    connectResizeObserver() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      const ResizeObserverCtor = this.win.ResizeObserver || globalThis.ResizeObserver;
      if (!this.currentSidebar || typeof ResizeObserverCtor === 'undefined') return;
      this.resizeObserver = new ResizeObserverCtor(() => this.scheduleHandlePosition());
      const surfaces = new Set([this.currentSidebar, ...dom.listSidebarSurfaces(this.currentSidebar, this.site.id)]);
      for (const surface of surfaces) {
        try { this.resizeObserver.observe(surface); } catch {}
      }
    }

    setSidebar(nextSidebar) {
      if (nextSidebar === this.currentSidebar) {
        this.connectResizeObserver();
        this.scheduleHandlePosition();
        return;
      }
      if (this.currentSidebar) this.clearWidth();
      this.currentSidebar = nextSidebar;
      if (!this.currentSidebar) {
        if (this.handle) this.handle.hidden = true;
        this.connectResizeObserver();
        return;
      }
      if (this.savedWidth !== null) this.applyWidth(this.currentSidebar, this.savedWidth);
      this.connectResizeObserver();
      this.scheduleHandlePosition();
    }

    discoverSidebar() {
      this.discoveryFrame = 0;
      this.setSidebar(dom.findSidebar(this.doc, this.win));
    }

    scheduleDiscovery() {
      if (this.discoveryFrame) return;
      this.discoveryFrame = this.win.requestAnimationFrame(() => this.discoverSidebar());
    }

    startMutationObserver() {
      if (!this.doc.body || this.mutationObserver) return;
      const MutationObserverCtor = this.win.MutationObserver || globalThis.MutationObserver;
      this.mutationObserver = new MutationObserverCtor((mutations) => {
        if (mutations.some((mutation) => dom.mutationMayAffectSidebar(mutation, this.currentSidebar))) this.scheduleDiscovery();
      });
      this.mutationObserver.observe(this.doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-state', 'aria-expanded', 'data-collapsed', 'data-collapsible', 'hidden'],
      });
    }

    onPointerDown(event) {
      if (event.button !== 0 || !this.currentSidebar?.isConnected) return;
      if (!dom.sidebarElementIsOpen(this.currentSidebar, this.win, this.site.id)) return;
      const rect = this.currentSidebar.getBoundingClientRect();
      event.preventDefault();
      this.dragState = { pointerId: event.pointerId, startX: event.clientX, startWidth: rect.width, currentWidth: core.clampWidth(rect.width) };
      try { this.handle.setPointerCapture(event.pointerId); } catch {}
      this.doc.documentElement.classList.add('cgpt-sidebar-resizer-dragging');
    }

    onPointerMove(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId || !this.currentSidebar) return;
      event.preventDefault();
      const width = this.dragState.startWidth + event.clientX - this.dragState.startX;
      this.dragState.currentWidth = this.applyWidth(this.currentSidebar, width);
      this.handle.setAttribute('aria-valuenow', String(Math.round(this.dragState.currentWidth)));
      this.scheduleHandlePosition();
    }

    onPointerEnd(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
      const finalWidth = this.dragState.currentWidth;
      this.dragState = null;
      this.doc.documentElement.classList.remove('cgpt-sidebar-resizer-dragging');
      try {
        if (this.handle.hasPointerCapture(event.pointerId)) this.handle.releasePointerCapture(event.pointerId);
      } catch {}
      void this.persistWidth(finalWidth);
      this.scheduleHandlePosition();
    }

    onDoubleClick(event) {
      event.preventDefault();
      this.dragState = null;
      this.doc.documentElement.classList.remove('cgpt-sidebar-resizer-dragging');
      void this.resetWidth();
    }

    bootstrap() {
      this.handle = this.createHandle();
      void this.loadSavedWidth();
      this.scheduleDiscovery();
      this.startMutationObserver();
      this.win.addEventListener('resize', () => this.scheduleHandlePosition(), { passive: true });
    }
  }

  const api = { SidebarController, resolveSidebarSite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') {
    const shared = globalThis.AiChatWebSupporter ||= {};
    shared.sidebarController = api;
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const controller = new SidebarController();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => controller.bootstrap(), { once: true });
  else controller.bootstrap();
})();
