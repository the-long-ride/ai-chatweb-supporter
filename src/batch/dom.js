(() => {
  'use strict';
  const CONTROLS_ATTR = 'data-ai-chatweb-batch-controls';
  const CONTROL_ATTR = 'data-ai-chatweb-batch-control';
  const SELECT_ATTR = 'data-ai-chatweb-batch-select';
  const ROW_ATTR = 'data-ai-chatweb-batch-row';
  const SELECTED_ATTR = 'data-ai-chatweb-batch-selected';
  const DIALOG_ATTR = 'data-ai-chatweb-batch-dialog';
  const TOAST_ATTR = 'data-ai-chatweb-batch-toast';
  const SAFE_TEMPLATE_ATTRS = ['data-cds','data-cds-icon-only','data-cds-ghost','data-size','data-slot'];
  const ICONS = {
    select: { viewBox: '0 0 24 24', paths: [{ d: 'M8 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40973 4.40973 4.71569 4.21799 5.09202C4 5.51984 4 6.07989 4 7.2V8M4 11V13M4 16V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.07989 20 7.2 20H8M11 20H13M16 20H16.8C17.9201 20 18.4802 20 18.908 19.782C19.2843 19.5903 19.5903 19.2843 19.782 18.908C20 18.4802 20 17.9201 20 16.8V16M20 13V11M20 8V7.2C20 6.0799 20 5.51984 19.782 5.09202C19.5903 4.71569 19.2843 4.40973 18.908 4.21799C18.4802 4 17.9201 4 16.8 4H16M13 4H11', strokeWidth: '2', linecap: 'round', linejoin: 'round' }] },
    archive: { viewBox: '0 0 24 24', paths: [
      { d: 'M20.5 7V13C20.5 16.7712 20.5 18.6569 19.3284 19.8284C18.1569 21 16.2712 21 12.5 21H11.5C7.72876 21 5.84315 21 4.67157 19.8284C3.5 18.6569 3.5 16.7712 3.5 13V7', opacity: '0.5', strokeWidth: '1.5', linecap: 'round' },
      { d: 'M2 5C2 4.05719 2 3.58579 2.29289 3.29289C2.58579 3 3.05719 3 4 3H20C20.9428 3 21.4142 3 21.7071 3.29289C22 3.58579 22 4.05719 22 5C22 5.94281 22 6.41421 21.7071 6.70711C21.4142 7 20.9428 7 20 7H4C3.05719 7 2.58579 7 2.29289 6.70711C2 6.41421 2 5.94281 2 5Z', strokeWidth: '1.5' },
      { d: 'M12 7L12 16M12 16L15 12.6667M12 16L9 12.6667', strokeWidth: '1.5', linecap: 'round', linejoin: 'round' }
    ] },
    delete: { viewBox: '0 0 24 24', paths: [{ d: 'M10 12L14 16M14 12L10 16M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6', strokeWidth: '2', linecap: 'round', linejoin: 'round' }] },
    cancel: { viewBox: '0 0 20 20', strokeWidth: '1.8', linecap: 'round', linejoin: 'round', paths: [{ d: 'M5 5l10 10' }, { d: 'M15 5L5 15' }] },
    checkboxOff: { viewBox: '0 0 24 24', paths: [{ type: 'rect', x: '4', y: '4', width: '16', height: '16', rx: '2', strokeWidth: '2', linecap: 'round', linejoin: 'round' }] },
    checkboxOn: { viewBox: '0 0 24 24', paths: [{ d: 'M8 12.5L10.5 15L16 9M7.2 20H16.8C17.9201 20 18.4802 20 18.908 19.782C19.2843 19.5903 19.5903 19.2843 19.782 18.908C20 18.4802 20 17.9201 20 16.8V7.2C20 6.0799 20 5.51984 19.782 5.09202C19.5903 4.71569 19.2843 4.40973 18.908 4.21799C18.4802 4 17.9201 4 16.8 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40973 4.40973 4.71569 4.21799 5.09202C4 5.51984 4 6.07989 4 7.2V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.07989 20 7.2 20Z', strokeWidth: '2', linecap: 'round', linejoin: 'round' }] }
  };
  function setAttr(element, name, value = '') { element?.setAttribute?.(name, String(value)); }
  function createIcon(doc, name) {
    if (!doc?.createElementNS) { const fallback = doc?.createElement?.('span'); if (fallback) fallback.textContent = name === 'delete' || name === 'cancel' ? '×' : '✓'; return fallback; }
    const ns = 'http://www.w3.org/2000/svg'; const svg = doc.createElementNS(ns, 'svg'); setAttr(svg, 'width', '18'); setAttr(svg, 'height', '18'); const icon = ICONS[name] || ICONS.select; setAttr(svg, 'viewBox', icon.viewBox); setAttr(svg, 'fill', 'none'); setAttr(svg, 'aria-hidden', 'true');
    for (const item of icon.paths) { const node = doc.createElementNS(ns, item.type === 'rect' ? 'rect' : 'path'); if (item.type === 'rect') { setAttr(node, 'x', item.x); setAttr(node, 'y', item.y); setAttr(node, 'width', item.width); setAttr(node, 'height', item.height); setAttr(node, 'rx', item.rx); } else setAttr(node, 'd', item.d); setAttr(node, 'fill', 'none'); setAttr(node, 'stroke', 'currentColor'); setAttr(node, 'stroke-width', item.strokeWidth || icon.strokeWidth || '1.8'); setAttr(node, 'pointer-events', 'none'); const linecap = item.linecap ?? icon.linecap; const linejoin = item.linejoin ?? icon.linejoin; if (linecap) setAttr(node, 'stroke-linecap', linecap); if (linejoin) setAttr(node, 'stroke-linejoin', linejoin); if (item.opacity != null) setAttr(node, 'opacity', item.opacity); svg.appendChild(node); }
    return svg;
  }
  function copyTemplatePresentation(button, template) { if (!button || !template) return; if (typeof template.className === 'string') button.className = template.className; for (const name of SAFE_TEMPLATE_ATTRS) if (template.hasAttribute?.(name)) setAttr(button, name, template.getAttribute?.(name) ?? ''); }
  function createIconButton(doc, { label, template = null, icon = 'select', onClick = null } = {}) { const button = doc?.createElement?.('button'); if (!button) return null; button.type = 'button'; copyTemplatePresentation(button, template); setAttr(button, CONTROL_ATTR, 'true'); setAttr(button, 'aria-label', label || 'Batch action'); setAttr(button, 'title', label || 'Batch action'); const iconNode = createIcon(doc, icon); if (iconNode) button.appendChild?.(iconNode); if (typeof onClick === 'function') button.addEventListener?.('click', onClick); return button; }
  function bindRowToggle(control, onToggle) { if (!control) return control; control.__aiChatWebBatchOnToggle = typeof onToggle === 'function' ? onToggle : null; if (control.__aiChatWebBatchToggleBound) return control; control.__aiChatWebBatchToggleBound = true; control.addEventListener?.('click', (event) => { event?.preventDefault?.(); event?.stopPropagation?.(); control.__aiChatWebBatchOnToggle?.(event); }); return control; }
  function ensureControlContainer(doc, header, template = null) { const existing = header?.querySelector?.(`[${CONTROLS_ATTR}]`); if (existing) return existing; const container = doc?.createElement?.('span'); if (!container) return null; setAttr(container, CONTROLS_ATTR, 'true'); const parent = template?.parentElement || header; parent?.appendChild?.(container); return container; }
  function setRowSelected(row, selected) { setAttr(row, SELECTED_ATTR, selected ? 'true' : 'false'); const visual = row?.matches?.('a') ? row : row?.querySelector?.('[data-row],a[href]'); if (visual && visual !== row) setAttr(visual, SELECTED_ATTR, selected ? 'true' : 'false'); const control = row?.querySelector?.(`[${SELECT_ATTR}]`); if (control) { setAttr(control, 'aria-pressed', selected ? 'true' : 'false'); const iconNode = createIcon(control.ownerDocument, selected ? 'checkboxOn' : 'checkboxOff'); if (iconNode) control.replaceChildren?.(iconNode); } }
  function decorateRow(doc, row, { selected = false, template = null, onToggle = null } = {}) { if (!row) return null; setAttr(row, ROW_ATTR, 'true'); setRowSelected(row, selected); const existing = row.querySelector?.(`[${SELECT_ATTR}]`); if (existing) return bindRowToggle(existing, onToggle); const anchor = row.matches?.('a') ? row : row.querySelector?.('a[data-row-main-button],a[href]'); if (!anchor) return null; const button = createIconButton(doc, { label: 'Toggle conversation selection', template: null, icon: selected ? 'checkboxOn' : 'checkboxOff' }); if (!button) return null; setAttr(button, SELECT_ATTR, 'true'); setAttr(button, 'aria-pressed', selected ? 'true' : 'false'); bindRowToggle(button, onToggle); if (anchor.insertBefore) anchor.insertBefore(button, anchor.firstChild || null); else anchor.appendChild?.(button); return button; }
  function cleanupRows(root) { const rows = []; if (root?.matches?.(`[${ROW_ATTR}]`)) rows.push(root); rows.push(...Array.from(root?.querySelectorAll?.(`[${ROW_ATTR}]`) || [])); for (const row of rows) { for (const control of Array.from(row.querySelectorAll?.(`[${SELECT_ATTR}]`) || [])) control.remove?.(); row.removeAttribute?.(ROW_ATTR); row.removeAttribute?.(SELECTED_ATTR); for (const visual of Array.from(row.querySelectorAll?.(`[${SELECTED_ATTR}]`) || [])) visual.removeAttribute?.(SELECTED_ATTR); } }
  function removeRow(row) { if (!row) return; const tag = String(row.tagName || '').toUpperCase(); const target = tag === 'A' ? row.closest?.('li') || row : row; target?.remove?.(); }
  function confirmAction(doc, { action = 'delete', count = 1, providerId = 'unknown' } = {}) {
    if (!doc?.createElement || !doc?.body) return Promise.resolve(false);
    const verb = action === 'archive' ? 'Archive' : 'Delete'; const lowerVerb = verb.toLowerCase(); const noun = count === 1 ? 'chat' : 'chats';
    const dialog = doc.createElement('dialog'); const panel = doc.createElement('div'); const title = doc.createElement('h2'); const message = doc.createElement('p'); const actions = doc.createElement('div'); const cancel = doc.createElement('button'); const confirm = doc.createElement('button');
    setAttr(dialog, DIALOG_ATTR, 'true'); setAttr(dialog, 'data-ai-chatweb-provider', providerId || 'unknown'); setAttr(dialog, 'aria-modal', 'true'); setAttr(dialog, 'aria-labelledby', 'ai-chatweb-batch-dialog-title'); setAttr(panel, 'data-ai-chatweb-batch-dialog-panel', 'true'); setAttr(title, 'data-ai-chatweb-batch-dialog-title', 'true'); setAttr(title, 'id', 'ai-chatweb-batch-dialog-title'); setAttr(message, 'data-ai-chatweb-batch-dialog-message', 'true'); setAttr(actions, 'data-ai-chatweb-batch-dialog-actions', 'true'); setAttr(cancel, 'data-ai-chatweb-batch-dialog-cancel', 'true'); setAttr(confirm, 'data-ai-chatweb-batch-dialog-confirm', 'true'); setAttr(confirm, 'data-action', action);
    cancel.type = 'button'; confirm.type = 'button'; title.textContent = `${verb} selected chats?`; message.textContent = `This will ${lowerVerb} ${count} selected ${noun}.`; cancel.textContent = 'Cancel'; confirm.textContent = verb;
    actions.appendChild(cancel); actions.appendChild(confirm); panel.appendChild(title); panel.appendChild(message); panel.appendChild(actions); dialog.appendChild(panel); doc.body.appendChild(dialog);
    return new Promise((resolve) => { let settled = false; const finish = (value) => { if (settled) return; settled = true; try { dialog.close?.(); } catch {} dialog.remove?.(); resolve(Boolean(value)); }; cancel.addEventListener?.('click', (event) => { event?.preventDefault?.(); finish(false); }); confirm.addEventListener?.('click', (event) => { event?.preventDefault?.(); finish(true); }); dialog.addEventListener?.('cancel', (event) => { event?.preventDefault?.(); finish(false); }); dialog.addEventListener?.('click', (event) => { if (event?.target === dialog) finish(false); }); dialog.addEventListener?.('keydown', (event) => { if (event?.key === 'Escape') { event?.preventDefault?.(); finish(false); } }); try { if (typeof dialog.showModal === 'function') dialog.showModal(); else setAttr(dialog, 'open', ''); } catch { setAttr(dialog, 'open', ''); } cancel.focus?.(); });
  }
  function toastMessage(action, succeeded, failed) {
    const successCount = Math.max(0, Number(succeeded) || 0);
    const failedCount = Math.max(0, Number(failed) || 0);
    const pastVerb = action === 'archive' ? 'Archived' : 'Deleted';
    const baseVerb = action === 'archive' ? 'Archive' : 'Delete';
    if (successCount > 0 && failedCount === 0) return `${pastVerb} ${successCount} ${successCount === 1 ? 'chat' : 'chats'}`;
    if (successCount > 0) return `${pastVerb} ${successCount} ${successCount === 1 ? 'chat' : 'chats'} · ${failedCount} failed`;
    return `${baseVerb} failed for ${failedCount} ${failedCount === 1 ? 'chat' : 'chats'}`;
  }
  function showToast(doc, { action = 'delete', succeeded = 0, failed = 0, providerId = 'unknown', durationMs = 5000 } = {}) {
    if (!doc?.createElement || !doc?.body) return null;
    const toast = doc.createElement('div');
    setAttr(toast, TOAST_ATTR, 'true');
    setAttr(toast, 'data-ai-chatweb-provider', providerId || 'unknown');
    setAttr(toast, 'role', 'status');
    setAttr(toast, 'aria-live', 'polite');
    setAttr(toast, 'aria-atomic', 'true');
    toast.textContent = toastMessage(action, succeeded, failed);
    doc.body.appendChild?.(toast);
    const schedule = doc.defaultView?.setTimeout?.bind(doc.defaultView) || globalThis.setTimeout;
    if (typeof schedule === 'function') schedule(() => toast.remove?.(), durationMs);
    return toast;
  }
  function nodeIsExtensionOwned(node) { if (!node || node.nodeType !== 1) return false; const selector = `[${CONTROLS_ATTR}],[${CONTROL_ATTR}],[${SELECT_ATTR}],[${DIALOG_ATTR}],[${TOAST_ATTR}]`; return Boolean(node.matches?.(selector) || node.closest?.(selector)); }
  function mutationIsExtensionOnly(mutation) { if (nodeIsExtensionOwned(mutation?.target)) return true; const nodes = [...Array.from(mutation?.addedNodes || []), ...Array.from(mutation?.removedNodes || [])]; return nodes.length > 0 && nodes.every(nodeIsExtensionOwned); }
  const api = { CONTROLS_ATTR, CONTROL_ATTR, SELECT_ATTR, ROW_ATTR, SELECTED_ATTR, DIALOG_ATTR, TOAST_ATTR, createIconButton, ensureControlContainer, decorateRow, setRowSelected, cleanupRows, removeRow, confirmAction, showToast, mutationIsExtensionOnly };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).batchDom = api;
})();
