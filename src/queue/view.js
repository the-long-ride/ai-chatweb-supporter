(() => {
  'use strict';
  const namespace = globalThis.AiChatWebSupporter || {};
  const core = typeof module !== 'undefined' && module.exports ? require('./core.js') : namespace.queueCore;
  const ui = typeof module !== 'undefined' && module.exports ? require('./ui.js') : namespace.queueUi;
  const ROOT_ID = 'cgpt-message-queue';
  const MODAL_ID = 'cgpt-message-queue-modal';
  const CLEAR_MODAL_ID = 'cgpt-message-queue-clear-modal';
  const UNDO_ID = 'cgpt-message-queue-undo';

  function isOpaqueBackground(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text || text === 'transparent') return false;
    const rgba = text.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
    return !rgba || Number(rgba[1]) > 0.02;
  }

  function applyProviderTheme(view, target) {
    const provider = view.getProvider?.();
    const composer = provider?.findComposer?.(globalThis.document, globalThis.window);
    const theme = provider?.themeContext?.(composer, globalThis.document, globalThis.window) || {};
    const values = {
      '--cgpt-provider-color': theme.color,
      '--cgpt-provider-border': theme.borderColor,
      '--cgpt-provider-radius': theme.borderRadius,
      '--cgpt-provider-font': theme.fontFamily,
      '--cgpt-provider-color-scheme': theme.colorScheme,
    };
    if (isOpaqueBackground(theme.background)) values['--cgpt-provider-background'] = theme.background;
    for (const [name, value] of Object.entries(values)) if (value) target.style.setProperty(name, value);
  }

  function renderModalAttachments(view, container, draftAttachments) {
    container.replaceChildren();
    for (const attachment of draftAttachments) {
      const chip = document.createElement('span');
      chip.className = 'cgpt-queue-modal-attachment';
      const kind = document.createElement('span');
      kind.className = 'cgpt-queue-modal-attachment-kind';
      kind.textContent = attachment.kind === 'image' ? 'Image' : 'File';
      const name = document.createElement('span');
      name.className = 'cgpt-queue-modal-attachment-name';
      name.textContent = attachment.name;
      name.title = attachment.name;
      const remove = view.actionButton('×', `Remove ${attachment.name}`, () => {
        const index = draftAttachments.findIndex((entry) => entry.id === attachment.id);
        if (index >= 0) draftAttachments.splice(index, 1);
        renderModalAttachments(view, container, draftAttachments);
      });
      remove.classList.add('cgpt-queue-modal-attachment-remove');
      chip.append(kind, name, remove);
      container.appendChild(chip);
    }
  }

  function openEditModal(view, id) {
    const item = view.getQueue().find((entry) => entry.id === id);
    if (!item) return;
    view.closeEditModal();
    const originalAttachments = core.normalizeAttachments(item.attachments);
    const draftAttachments = originalAttachments.slice();
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'cgpt-queue-modal-overlay';
    overlay.dataset.cgptQueueUi = 'true';
    overlay.setAttribute('data-cgpt-queue-ui', 'true');
    overlay.setAttribute('role', 'presentation');
    applyProviderTheme(view, overlay);
    const dialog = document.createElement('div');
    dialog.className = 'cgpt-queue-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'cgpt-queue-modal-title');
    const title = document.createElement('div');
    title.id = 'cgpt-queue-modal-title';
    title.className = 'cgpt-queue-modal-title';
    title.textContent = 'Edit queued message';
    const textarea = document.createElement('textarea');
    textarea.className = 'cgpt-queue-modal-textarea';
    textarea.value = item.text;
    textarea.rows = 6;
    const attachmentSection = document.createElement('div');
    attachmentSection.className = 'cgpt-queue-modal-attachments-section';
    const attachmentLabel = document.createElement('div');
    attachmentLabel.className = 'cgpt-queue-modal-attachments-label';
    attachmentLabel.textContent = 'Attachments';
    const attachmentList = document.createElement('div');
    attachmentList.className = 'cgpt-queue-modal-attachments';
    renderModalAttachments(view, attachmentList, draftAttachments);
    if (originalAttachments.length) attachmentSection.append(attachmentLabel, attachmentList);
    const footer = document.createElement('div');
    footer.className = 'cgpt-queue-modal-footer';
    const cancel = view.actionButton('Cancel', 'Cancel editing', () => view.closeEditModal());
    cancel.classList.add('cgpt-queue-modal-button');
    const save = view.actionButton('Save', 'Save queued message', () => {
      const text = textarea.value.trim();
      if (!text && !draftAttachments.length) return;
      const queue = view.getQueue().slice();
      const index = queue.findIndex((entry) => entry.id === id);
      if (index < 0) return view.closeEditModal();
      const previous = queue[index];
      const next = { ...previous, text };
      if (draftAttachments.length) next.attachments = draftAttachments.slice();
      else delete next.attachments;
      const keep = new Set(draftAttachments.map((entry) => entry.id));
      const removed = originalAttachments.filter((entry) => !keep.has(entry.id));
      queue[index] = next;
      view.setQueue(queue);
      void Promise.resolve(view.persistQueue()).then(async () => {
        if (removed.length) await view.deleteAttachments(removed);
        view.render();
        view.closeEditModal();
        view.scheduleReconcile();
      }).catch(() => {
        queue[index] = previous;
        view.setQueue(queue);
        view.render();
      });
    });
    save.classList.add('cgpt-queue-modal-button', 'is-primary');
    footer.append(cancel, save);
    dialog.append(title, textarea);
    if (originalAttachments.length) dialog.appendChild(attachmentSection);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) view.closeEditModal(); });
    overlay.addEventListener('keydown', (event) => { if(event.key==='Escape')view.closeEditModal(); if((event.ctrlKey||event.metaKey)&&event.key==='Enter')save.click(); });
    document.body.appendChild(overlay);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function openClearAllModal(view) {
    if (!view.getQueue().length) return;
    view.closeClearAllModal();
    const overlay = document.createElement('div');
    overlay.id = CLEAR_MODAL_ID;
    overlay.className = 'cgpt-queue-modal-overlay';
    overlay.dataset.cgptQueueUi = 'true';
    overlay.setAttribute('data-cgpt-queue-ui', 'true');
    overlay.setAttribute('role', 'presentation');
    applyProviderTheme(view, overlay);

    const dialog = document.createElement('div');
    dialog.className = 'cgpt-queue-modal cgpt-queue-clear-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'cgpt-queue-clear-modal-title');

    const title = document.createElement('div');
    title.id = 'cgpt-queue-clear-modal-title';
    title.className = 'cgpt-queue-modal-title';
    title.textContent = 'Clear all queued messages?';

    const message = document.createElement('div');
    message.className = 'cgpt-queue-clear-modal-message';
    message.textContent = 'This removes every queued message in this conversation.';

    const footer = document.createElement('div');
    footer.className = 'cgpt-queue-modal-footer';
    const cancel = view.actionButton('Cancel', 'Cancel clearing queued messages', () => view.closeClearAllModal());
    cancel.classList.add('cgpt-queue-modal-button');
    const clear = view.actionButton('Clear all', 'Clear all queued messages', () => {
      clear.disabled = true;
      cancel.disabled = true;
      void Promise.resolve(view.clearAllItems()).then((cleared) => {
        if (!cleared) {
          clear.disabled = false;
          cancel.disabled = false;
          return;
        }
        view.clearUndo({ deleteAttachments:true });
        view.closeClearAllModal();
        view.render();
        view.scheduleReconcile();
      }).catch(() => {
        clear.disabled = false;
        cancel.disabled = false;
        view.render();
      });
    });
    clear.classList.add('cgpt-queue-modal-button', 'is-primary', 'is-danger');
    footer.append(cancel, clear);
    dialog.append(title, message, footer);
    overlay.appendChild(dialog);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) view.closeClearAllModal(); });
    overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') view.closeClearAllModal(); });
    document.body.appendChild(overlay);
    cancel.focus();
  }

  const modal = { isOpaqueBackground, applyProviderTheme, renderModalAttachments, openEditModal, openClearAllModal };

  class QueueView {
    constructor({ getQueue, setQueue, getPaused = () => false, setPaused = () => {}, persistQueue, scheduleReconcile, getProvider, deleteAttachments = async () => {}, steerItem = async () => false, clearAllItems = async () => false }) {
      this.getQueue = getQueue;
      this.setQueue = setQueue;
      this.getPaused = getPaused;
      this.setPaused = setPaused;
      this.persistQueue = persistQueue;
      this.scheduleReconcile = scheduleReconcile;
      this.getProvider = getProvider;
      this.deleteAttachments = deleteAttachments;
      this.steerItem = steerItem;
      this.clearAllItems = clearAllItems;
      this.root = null;
      this.dragId = null;
      this.undoRecord = null;
      this.undoTimer = 0;
      this.undoFrame = 0;
    }

    ensureRoot(composer, provider = this.getProvider?.()) {
      const anchor = provider?.queueAnchor?.(composer);
      if (!anchor?.parentElement) return null;
      if (!this.root) {
        this.root = document.createElement('div');
        this.root.id = ROOT_ID;
        this.root.dataset.cgptQueueUi = 'true';
        this.root.setAttribute('data-cgpt-queue-ui', 'true');
        this.root.setAttribute('aria-label', 'Queued messages');
      }
      if (this.root.parentElement !== anchor.parentElement || this.root.nextSibling !== anchor) anchor.parentElement.insertBefore(this.root, anchor);
      return this.root;
    }

    actionButton(label, title, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cgpt-queue-action';
      button.textContent = label;
      button.title = title;
      button.addEventListener('click', onClick);
      return button;
    }

    iconButton(iconName, title, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cgpt-queue-action cgpt-queue-icon-button';
      button.title = title;
      button.setAttribute('aria-label', title);
      button.innerHTML = ui.ICONS[iconName];
      button.addEventListener('click', onClick);
      return button;
    }

    clearDropState() { this.root?.querySelectorAll('.cgpt-queue-row.is-drop-target').forEach((row) => row.classList.remove('is-drop-target')); }
    updateOverflowIndicator(indicator, viewport, queueLength) { indicator.hidden = !ui.shouldShowHiddenAboveIndicator(queueLength, viewport.scrollTop); }

    render(composer = null) {
      const provider = this.getProvider?.();
      const currentComposer = composer || provider?.findComposer?.(globalThis.document, globalThis.window);
      const root = currentComposer ? this.ensureRoot(currentComposer, provider) : this.root;
      if (!root) return;
      const queue = this.getQueue();
      root.replaceChildren();
      root.hidden = queue.length === 0;
      if (!queue.length) return;

      const header = document.createElement('div');
      header.className = 'cgpt-queue-header';
      const label = document.createElement('span');
      label.className = 'cgpt-queue-header-label';
      label.textContent = 'Queued messages';
      const paused = Boolean(this.getPaused());
      const toggle = this.actionButton(paused ? 'Resume' : 'Pause', paused ? 'Resume queued messages' : 'Pause queued messages', () => {
        void Promise.resolve(this.setPaused(!Boolean(this.getPaused()))).then(() => this.render()).then(() => this.scheduleReconcile()).catch(() => this.render());
      });
      toggle.classList.add('cgpt-queue-pause-button');
      const headerActions = document.createElement('span');
      headerActions.className = 'cgpt-queue-header-actions';
      const clearAll = this.iconButton('delete', 'Clear all queued messages', () => this.openClearAllModal());
      clearAll.classList.add('cgpt-queue-clear-all');
      headerActions.append(toggle, clearAll);
      header.append(label, headerActions);

      const indicator = document.createElement('div');
      indicator.className = 'cgpt-queue-overflow-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      indicator.innerHTML = ui.ICONS.up;
      indicator.hidden = true;

      const viewport = document.createElement('div');
      viewport.className = 'cgpt-queue-scroll';
      viewport.style.setProperty('--cgpt-queue-max-height', `${ui.queueViewportMaxHeightPx()}px`);
      viewport.setAttribute('role', 'list');
      viewport.setAttribute('aria-label', 'Queued messages, scroll for older queued items');
      viewport.addEventListener('scroll', () => this.updateOverflowIndicator(indicator, viewport, queue.length), { passive:true });

      for (const { item, index } of queue.map((item, index) => ({ item, index })).reverse()) {
        const attachments = core.normalizeAttachments(item.attachments);
        const row = document.createElement('div');
        row.className = 'cgpt-queue-row';
        row.dataset.queueId = item.id;
        row.draggable = false;
        row.setAttribute('role', 'listitem');

        const grab = this.iconButton('grab', `Reorder queued message ${index + 1}`, () => {});
        grab.classList.add('cgpt-queue-grab');
        grab.draggable = true;

        const number = document.createElement('span');
        number.className = 'cgpt-queue-number';
        number.textContent = String(index + 1);
        const content = document.createElement('span');
        content.className = 'cgpt-queue-content';
        const text = document.createElement('span');
        text.className = 'cgpt-queue-text';
        text.textContent = item.text || (attachments.length === 1 ? attachments[0].name : `${attachments.length} attachments`);
        text.title = item.text || attachments.map((entry) => entry.name).join(', ');
        content.appendChild(text);
        if (attachments.length) {
          const badge = document.createElement('span');
          badge.className = 'cgpt-queue-attachment-count';
          badge.textContent = attachments.length === 1 ? '1 file' : `${attachments.length} files`;
          content.appendChild(badge);
        }
        const actions = document.createElement('span');
        actions.className = 'cgpt-queue-actions';
        actions.append(
          this.iconButton('steer', 'Steer queued message', () => { void Promise.resolve(this.steerItem(item.id)).finally(() => this.scheduleReconcile()); }),
          this.iconButton('edit', 'Edit queued message', () => this.openEditModal(item.id)),
          this.iconButton('delete', 'Delete queued message', () => this.deleteItem(item.id)),
        );
        row.append(grab, number, content, actions);

        grab.addEventListener('dragstart', (event) => {
          this.dragId = item.id;
          event.dataTransfer?.setData('text/plain', item.id);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
          row.classList.add('is-dragging');
        });
        row.addEventListener('dragover', (event) => { if(!this.dragId||this.dragId===item.id)return; event.preventDefault(); this.clearDropState(); row.classList.add('is-drop-target'); if(event.dataTransfer)event.dataTransfer.dropEffect='move'; });
        row.addEventListener('drop', (event) => { event.preventDefault(); const queueNow=this.getQueue(); const sourceId=this.dragId||event.dataTransfer?.getData('text/plain'); const from=queueNow.findIndex((entry)=>entry.id===sourceId); const to=queueNow.findIndex((entry)=>entry.id===item.id); if(from>=0&&to>=0&&from!==to){this.setQueue(core.reorderQueue(queueNow,from,to));void Promise.resolve(this.persistQueue()).then(()=>this.render()).then(()=>this.scheduleReconcile());} this.dragId=null;this.clearDropState(); });
        grab.addEventListener('dragend', () => { this.dragId=null;this.clearDropState();row.classList.remove('is-dragging'); });
        viewport.appendChild(row);
      }

      root.append(header, indicator, viewport);
      const pinToNext = () => { viewport.scrollTop=viewport.scrollHeight; this.updateOverflowIndicator(indicator,viewport,queue.length); };
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(pinToNext); else pinToNext();
    }

    closeEditModal() { document.getElementById(MODAL_ID)?.remove(); }
    closeClearAllModal() { document.getElementById(CLEAR_MODAL_ID)?.remove(); }
    applyProviderTheme(target) { return modal.applyProviderTheme(this, target); }
    renderModalAttachments(container, draftAttachments) { return modal.renderModalAttachments(this, container, draftAttachments); }
    openEditModal(id) { return modal.openEditModal(this, id); }
    openClearAllModal() { return modal.openClearAllModal(this); }

    clearUndo({ deleteAttachments: shouldDeleteAttachments = false } = {}) {
      const record = this.undoRecord;
      if (this.undoTimer) window.clearTimeout(this.undoTimer);
      if (this.undoFrame && window.cancelAnimationFrame) window.cancelAnimationFrame(this.undoFrame);
      this.undoTimer = 0;
      this.undoFrame = 0;
      this.undoRecord = null;
      document.getElementById(UNDO_ID)?.remove();
      if (shouldDeleteAttachments && record?.item?.attachments?.length) void Promise.resolve(this.deleteAttachments(record.item.attachments)).catch(() => {});
    }

    showUndo() {
      document.getElementById(UNDO_ID)?.remove();
      if (!this.undoRecord) return;
      const toast = document.createElement('div');
      toast.id = UNDO_ID;
      toast.className = 'cgpt-queue-undo';
      toast.dataset.cgptQueueUi = 'true';
      toast.setAttribute('data-cgpt-queue-ui', 'true');
      const label = document.createElement('span');
      label.textContent = 'Queued message deleted';
      const undo = this.iconButton('undo', 'Restore deleted queued message', () => {
        const record = this.undoRecord;
        if (!core.canUndo(record, Date.now())) return this.clearUndo({ deleteAttachments:true });
        const queue = this.getQueue().slice();
        queue.splice(Math.max(0, Math.min(queue.length, record.index)), 0, record.item);
        this.setQueue(queue);
        this.clearUndo();
        void this.persistQueue();
        this.render();
        this.scheduleReconcile();
      });
      undo.classList.add('cgpt-queue-undo-button');
      const undoText = document.createElement('span');
      undoText.className = 'cgpt-queue-undo-countdown';
      undo.appendChild(undoText);
      const progress = document.createElement('span');
      progress.className = 'cgpt-queue-undo-progress';
      const fill = document.createElement('span');
      fill.className = 'cgpt-queue-undo-progress-fill';
      progress.appendChild(fill);
      toast.append(label, undo, progress);
      document.body.appendChild(toast);
      const update = () => {
        if (!this.undoRecord) return;
        const countdown = ui.undoCountdown({ expiresAt:this.undoRecord.expiresAt, now:Date.now() });
        undoText.textContent = `Undo · ${countdown.seconds}s`;
        fill.style.transform = `scaleX(${countdown.ratio})`;
        if (countdown.seconds <= 0) return this.clearUndo({ deleteAttachments:true });
        this.undoFrame = window.requestAnimationFrame ? window.requestAnimationFrame(update) : 0;
      };
      update();
      this.undoTimer = window.setTimeout(() => this.clearUndo({ deleteAttachments:true }), Math.max(0, this.undoRecord.expiresAt - Date.now()));
    }

    deleteItem(id) {
      const queue = this.getQueue().slice();
      const index = queue.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      const [item] = queue.splice(index, 1);
      this.setQueue(queue);
      this.clearUndo({ deleteAttachments:true });
      this.undoRecord = core.createUndoRecord(item, index, Date.now(), core.DEFAULT_UNDO_TTL_MS);
      void this.persistQueue();
      this.render();
      this.showUndo();
      this.scheduleReconcile();
    }
  }

  const api = { QueueView, isOpaqueBackground };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).queueView = api;
})();
