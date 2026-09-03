(() => {
  'use strict';
  const namespace = globalThis.AiChatWebSupporter || {};
  const core = typeof module !== 'undefined' && module.exports ? require('./core.js') : namespace.batchCore;
  const defaultDom = typeof module !== 'undefined' && module.exports ? require('./dom.js') : namespace.batchDom;
  const defaultRegistry = typeof module !== 'undefined' && module.exports ? require('../providers/registry.js') : namespace.providerRegistry;

  class BatchController {
    constructor({ win = globalThis.window, doc = globalThis.document, registry = defaultRegistry, domApi = defaultDom, confirm = null, fetch = null, logger = console } = {}) {
      this.win = win;
      this.doc = doc;
      this.registry = registry;
      this.dom = domApi;
      this.confirm = confirm || ((options) => this.dom.confirmAction?.(this.doc, options) ?? Promise.resolve(false));
      this.fetch = fetch || ((...args) => this.win.fetch(...args));
      this.logger = logger;
      this.provider = null;
      this.adapter = null;
      this.section = null;
      this.header = null;
      this.controls = null;
      this.selection = core.createSelection();
      this.selectionMode = false;
      this.busy = false;
      this.observer = null;
      this.frame = 0;
      this.boundSectionClick = (event) => this.onSectionClick(event);
    }
    resolveProvider() { return this.registry?.getProvider?.(this.win?.location?.href || '') || null; }
    reconcile() {
      const nextProvider = this.resolveProvider();
      const providerChanged = Boolean(this.provider && nextProvider?.id !== this.provider.id);
      if (providerChanged) this.exitSelectionMode();
      this.provider = nextProvider;
      this.adapter = nextProvider?.batch || null;
      if (!this.adapter) { this.detachSection(); return; }
      const nextSection = this.adapter.findConversationSection?.(this.doc) || null;
      if (!nextSection) { if (this.selectionMode) this.exitSelectionMode(); this.detachSection(); return; }
      if (nextSection !== this.section) {
        const old = this.section;
        if (old) { old.removeEventListener?.('click', this.boundSectionClick, true); this.dom.cleanupRows?.(old); }
        this.section = nextSection;
        if (this.selectionMode) this.section.addEventListener?.('click', this.boundSectionClick, true);
      }
      this.header = this.adapter.findConversationHeader?.(this.section) || this.section;
      const template = this.adapter.getNativeButtonTemplate?.(this.section) || null;
      this.controls = this.dom.ensureControlContainer?.(this.doc, this.header, template) || this.controls;
      this.controls?.setAttribute?.('data-ai-chatweb-provider', this.provider?.id || 'unknown');
      if (this.selectionMode) { this.section.setAttribute?.('data-ai-chatweb-batch-mode', 'true'); this.decorateRows(); }
      this.renderHeaderControls(template);
    }
    detachSection() { if (this.section) { this.section.removeEventListener?.('click', this.boundSectionClick, true); this.dom.cleanupRows?.(this.section); } this.section = null; this.header = null; this.controls = null; }
    renderHeaderControls(template = this.adapter?.getNativeButtonTemplate?.(this.section) || null) {
      if (!this.controls) return;
      const buttons = [];
      if (!this.selectionMode) buttons.push(this.dom.createIconButton(this.doc, { label: 'Select conversations', template, icon: 'select', onClick: () => this.enterSelectionMode() }));
      else {
        if (this.adapter?.supportsArchive) { const archive = this.dom.createIconButton(this.doc, { label: 'Archive selected', template, icon: 'archive', onClick: () => void this.runAction('archive') }); if (archive) archive.disabled = !core.actionEnabled({ selection: this.selection, busy: this.busy, supported: true }); buttons.push(archive); }
        const deletion = this.dom.createIconButton(this.doc, { label: 'Delete selected', template, icon: 'delete', onClick: () => void this.runAction('delete') });
        if (deletion) deletion.disabled = !core.actionEnabled({ selection: this.selection, busy: this.busy, supported: Boolean(this.adapter?.deleteConversation) }); buttons.push(deletion);
        const cancel = this.dom.createIconButton(this.doc, { label: 'Cancel selection', template, icon: 'cancel', onClick: () => this.exitSelectionMode() }); if (cancel) cancel.disabled = this.busy; buttons.push(cancel);
      }
      this.controls.replaceChildren?.(...buttons.filter(Boolean));
    }
    enterSelectionMode() { if (!this.section || !this.adapter || this.selectionMode) return; this.selectionMode = true; this.section.setAttribute?.('data-ai-chatweb-batch-mode', 'true'); this.section.addEventListener?.('click', this.boundSectionClick, true); this.decorateRows(); this.renderHeaderControls(); }
    exitSelectionMode() { this.selectionMode = false; this.busy = false; core.clearSelection(this.selection); if (this.section) { this.section.removeEventListener?.('click', this.boundSectionClick, true); this.section.removeAttribute?.('data-ai-chatweb-batch-mode'); this.dom.cleanupRows?.(this.section); } if (this.controls && this.adapter) this.renderHeaderControls(); }
    decorateRows() { if (!this.section || !this.adapter) return; const template = this.adapter.getNativeButtonTemplate?.(this.section) || null; for (const row of this.adapter.listConversationRows?.(this.section) || []) { const id = this.adapter.getConversationId?.(row); if (!id) continue; this.dom.decorateRow?.(this.doc, row, { selected: this.selection.has(id), template, onToggle: () => this.toggleRow(row) }); } }
    toggleRow(row) { if (!row || this.busy || !this.selectionMode) return false; const id = this.adapter?.getConversationId?.(row); if (!id) return false; const selected = core.toggleSelection(this.selection, id); this.dom.setRowSelected?.(row, selected); this.renderHeaderControls(); return selected; }
    onSectionClick(event) { if (!this.selectionMode || this.busy) return; const selectAttr = this.dom?.SELECT_ATTR || 'data-ai-chatweb-batch-select'; if (event?.target?.closest?.(`[${selectAttr}]`)) return; let row = event?.target?.closest?.('[data-ai-chatweb-batch-row]') || null; if (!row) row = (this.adapter?.listConversationRows?.(this.section) || []).find((candidate) => candidate === event?.target || candidate?.contains?.(event?.target)) || null; if (!row) return; event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.(); this.toggleRow(row); }
    findRowById(id) { return (this.adapter?.listConversationRows?.(this.section) || []).find((row) => this.adapter.getConversationId?.(row) === id) || null; }
    async runAction(action) {
      const ids = [...this.selection]; if (!ids.length || this.busy || !this.adapter) return null;
      const operation = action === 'archive' ? this.adapter.archiveConversation : this.adapter.deleteConversation; if (typeof operation !== 'function') return null;
      this.busy = true; this.renderHeaderControls();
      let confirmed = false;
      try { confirmed = await Promise.resolve(this.confirm({ action, count: ids.length, providerId: this.provider?.id || 'unknown', message: core.confirmationMessage(action, ids.length) })); }
      catch (error) { this.logger?.warn?.('[AI Chat Web Supporter] batch confirmation failed', { provider: this.provider?.id, action }); }
      if (!confirmed) { this.busy = false; this.renderHeaderControls(); return null; }
      const context = { window: this.win, document: this.doc, fetch: this.fetch };
      const result = await core.runSequential(ids, (id) => operation(id, context));
      for (const id of result.succeeded) { this.selection.delete(id); const row = this.findRowById(id); if (row) this.dom.removeRow?.(row); }
      this.busy = false;
      this.dom.showToast?.(this.doc, {
        action,
        succeeded: result.succeeded.length,
        failed: result.failed.length,
        providerId: this.provider?.id || 'unknown',
        durationMs: 5000,
      });
      if (result.failed.length) { this.logger?.warn?.('[AI Chat Web Supporter] batch conversation action partially failed', { provider: this.provider?.id, action, failed: result.failed.length }); this.decorateRows(); this.renderHeaderControls(); } else this.exitSelectionMode();
      return result;
    }
    scheduleReconcile() { if (this.frame) return; const raf = this.win?.requestAnimationFrame || ((callback) => setTimeout(callback, 0)); this.frame = raf(() => { this.frame = 0; this.reconcile(); }); }
    startObserver() { if (this.observer || !this.doc?.body) return; const MutationObserverCtor = this.win?.MutationObserver || globalThis.MutationObserver; if (typeof MutationObserverCtor === 'undefined') return; this.observer = new MutationObserverCtor((mutations) => { if (mutations?.length && mutations.every((mutation) => this.dom.mutationIsExtensionOnly?.(mutation))) return; this.scheduleReconcile(); }); this.observer.observe(this.doc.body, { childList: true, subtree: true }); }
    bootstrap() { this.reconcile(); this.startObserver(); }
  }
  const api = { BatchController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).batchController = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const controller = new BatchController();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => controller.bootstrap(), { once: true }); else controller.bootstrap();
})();
