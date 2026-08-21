(() => {
  'use strict';
  const namespace = globalThis.AiChatWebSupporter || {};
  const core = typeof module !== 'undefined' && module.exports ? require('./core.js') : namespace.queueCore;
  const ui = typeof module !== 'undefined' && module.exports ? require('./ui.js') : namespace.queueUi;
  const ROOT_ID = 'cgpt-message-queue';
  const MODAL_ID = 'cgpt-message-queue-modal';
  const UNDO_ID = 'cgpt-message-queue-undo';

  class QueueView {
    constructor({ getQueue, setQueue, getPaused = () => false, setPaused = () => {}, persistQueue, scheduleReconcile, getProvider }) {
      this.getQueue = getQueue;
      this.setQueue = setQueue;
      this.getPaused = getPaused;
      this.setPaused = setPaused;
      this.persistQueue = persistQueue;
      this.scheduleReconcile = scheduleReconcile;
      this.getProvider = getProvider;
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
      header.append(label, toggle);

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
      viewport.addEventListener('scroll', () => this.updateOverflowIndicator(indicator, viewport, queue.length), { passive: true });

      for (const { item, index } of queue.map((item, index) => ({ item, index })).reverse()) {
        const row = document.createElement('div');
        row.className = 'cgpt-queue-row';
        row.dataset.queueId = item.id;
        row.draggable = true;
        row.setAttribute('role', 'listitem');
        const number = document.createElement('span'); number.className = 'cgpt-queue-number'; number.textContent = String(index + 1);
        const text = document.createElement('span'); text.className = 'cgpt-queue-text'; text.textContent = item.text; text.title = item.text;
        const actions = document.createElement('span'); actions.className = 'cgpt-queue-actions';
        actions.append(this.iconButton('edit', 'Edit queued message', () => this.openEditModal(item.id)), this.iconButton('delete', 'Delete queued message', () => this.deleteItem(item.id)));
        row.append(number, text, actions);
        row.addEventListener('dragstart', (event) => { this.dragId = item.id; event.dataTransfer?.setData('text/plain', item.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; row.classList.add('is-dragging'); });
        row.addEventListener('dragover', (event) => { if (!this.dragId || this.dragId === item.id) return; event.preventDefault(); this.clearDropState(); row.classList.add('is-drop-target'); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; });
        row.addEventListener('drop', (event) => { event.preventDefault(); const queueNow=this.getQueue(); const sourceId=this.dragId||event.dataTransfer?.getData('text/plain'); const from=queueNow.findIndex((entry)=>entry.id===sourceId); const to=queueNow.findIndex((entry)=>entry.id===item.id); if(from>=0&&to>=0&&from!==to){this.setQueue(core.reorderQueue(queueNow,from,to));void this.persistQueue();this.render();} this.dragId=null;this.clearDropState(); });
        row.addEventListener('dragend', () => { this.dragId=null;this.clearDropState();row.classList.remove('is-dragging'); });
        viewport.appendChild(row);
      }

      root.append(header, indicator, viewport);
      const pinToNext = () => { viewport.scrollTop = viewport.scrollHeight; this.updateOverflowIndicator(indicator, viewport, queue.length); };
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(pinToNext); else pinToNext();
    }

    closeEditModal() { document.getElementById(MODAL_ID)?.remove(); }

    applyProviderTheme(target) {
      const provider = this.getProvider?.();
      const composer = provider?.findComposer?.(globalThis.document, globalThis.window);
      const theme = provider?.themeContext?.(composer, globalThis.document, globalThis.window) || {};
      const values = {
        '--cgpt-provider-color': theme.color,
        '--cgpt-provider-background': theme.background,
        '--cgpt-provider-border': theme.borderColor,
        '--cgpt-provider-radius': theme.borderRadius,
        '--cgpt-provider-font': theme.fontFamily,
        '--cgpt-provider-color-scheme': theme.colorScheme,
      };
      for (const [name, value] of Object.entries(values)) if (value) target.style.setProperty(name, value);
    }

    openEditModal(id) {
      const item = this.getQueue().find((entry) => entry.id === id);
      if (!item) return;
      this.closeEditModal();
      const overlay = document.createElement('div');
      overlay.id = MODAL_ID; overlay.className = 'cgpt-queue-modal-overlay'; overlay.dataset.cgptQueueUi='true'; overlay.setAttribute('data-cgpt-queue-ui','true'); overlay.setAttribute('role','presentation');
      this.applyProviderTheme(overlay);
      const dialog=document.createElement('div');dialog.className='cgpt-queue-modal';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','cgpt-queue-modal-title');
      const title=document.createElement('div');title.id='cgpt-queue-modal-title';title.className='cgpt-queue-modal-title';title.textContent='Edit queued message';
      const textarea=document.createElement('textarea');textarea.className='cgpt-queue-modal-textarea';textarea.value=item.text;textarea.rows=6;
      const footer=document.createElement('div');footer.className='cgpt-queue-modal-footer';
      const cancel=this.actionButton('Cancel','Cancel editing',()=>this.closeEditModal());cancel.classList.add('cgpt-queue-modal-button');
      const save=this.actionButton('Save','Save queued message',()=>{const text=textarea.value.trim();if(!text)return;const queue=this.getQueue().slice();const index=queue.findIndex((entry)=>entry.id===id);if(index<0)return this.closeEditModal();queue[index]={...queue[index],text};this.setQueue(queue);void this.persistQueue();this.render();this.closeEditModal();this.scheduleReconcile();});save.classList.add('cgpt-queue-modal-button','is-primary');
      footer.append(cancel,save);dialog.append(title,textarea,footer);overlay.appendChild(dialog);overlay.addEventListener('mousedown',(event)=>{if(event.target===overlay)this.closeEditModal();});overlay.addEventListener('keydown',(event)=>{if(event.key==='Escape')this.closeEditModal();if((event.ctrlKey||event.metaKey)&&event.key==='Enter')save.click();});document.body.appendChild(overlay);textarea.focus();textarea.setSelectionRange(textarea.value.length,textarea.value.length);
    }

    clearUndo() {
      if (this.undoTimer) window.clearTimeout(this.undoTimer);
      if (this.undoFrame && window.cancelAnimationFrame) window.cancelAnimationFrame(this.undoFrame);
      this.undoTimer = 0; this.undoFrame = 0; this.undoRecord = null; document.getElementById(UNDO_ID)?.remove();
    }

    showUndo() {
      document.getElementById(UNDO_ID)?.remove();
      if (!this.undoRecord) return;
      const toast=document.createElement('div');toast.id=UNDO_ID;toast.className='cgpt-queue-undo';toast.dataset.cgptQueueUi='true';toast.setAttribute('data-cgpt-queue-ui','true');
      const label=document.createElement('span');label.textContent='Queued message deleted';
      const undo=this.iconButton('undo','Restore deleted queued message',()=>{const record=this.undoRecord;if(!core.canUndo(record,Date.now()))return this.clearUndo();const queue=this.getQueue().slice();queue.splice(Math.max(0,Math.min(queue.length,record.index)),0,record.item);this.setQueue(queue);this.clearUndo();void this.persistQueue();this.render();this.scheduleReconcile();});undo.classList.add('cgpt-queue-undo-button');
      const undoText=document.createElement('span');undoText.className='cgpt-queue-undo-countdown';undo.appendChild(undoText);
      const progress=document.createElement('span');progress.className='cgpt-queue-undo-progress';const fill=document.createElement('span');fill.className='cgpt-queue-undo-progress-fill';progress.appendChild(fill);
      toast.append(label,undo,progress);document.body.appendChild(toast);
      const update=()=>{if(!this.undoRecord)return;const countdown=ui.undoCountdown({expiresAt:this.undoRecord.expiresAt,now:Date.now()});undoText.textContent=`Undo · ${countdown.seconds}s`;fill.style.transform=`scaleX(${countdown.ratio})`;if(countdown.seconds<=0)return this.clearUndo();this.undoFrame=window.requestAnimationFrame?window.requestAnimationFrame(update):0;};
      update();
      this.undoTimer=window.setTimeout(()=>this.clearUndo(),Math.max(0,this.undoRecord.expiresAt-Date.now()));
    }

    deleteItem(id) {
      const queue=this.getQueue().slice();const index=queue.findIndex((entry)=>entry.id===id);if(index<0)return;const[item]=queue.splice(index,1);this.setQueue(queue);this.clearUndo();this.undoRecord=core.createUndoRecord(item,index,Date.now(),core.DEFAULT_UNDO_TTL_MS);void this.persistQueue();this.render();this.showUndo();this.scheduleReconcile();
    }
  }

  const api={QueueView};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(typeof globalThis!=='undefined')(globalThis.AiChatWebSupporter||={}).queueView=api;
})();
