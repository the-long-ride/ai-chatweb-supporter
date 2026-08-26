(() => {
  'use strict';
  const SHORTCUT_CTRL_ENTER = 'ctrl-enter';
  const SHORTCUT_ALT_ENTER = 'alt-enter';
  const DEFAULT_SHORTCUT = SHORTCUT_CTRL_ENTER;
  const DEFAULT_UNDO_TTL_MS = 5000;
  function normalizeAttachment(value) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id) return null;
    if (typeof value.name !== 'string' || !value.name || !Number.isFinite(value.size) || value.size < 0) return null;
    const type = typeof value.type === 'string' ? value.type : '';
    const kind = value.kind === 'image' || type.startsWith('image/') ? 'image' : 'file';
    const normalized = {
      id: value.id,
      name: value.name,
      type,
      size: value.size,
      lastModified: Number.isFinite(value.lastModified) ? value.lastModified : 0,
      kind,
      chunkCount: Number.isInteger(value.chunkCount) && value.chunkCount >= 0 ? value.chunkCount : 0,
    };
    return normalized;
  }

  function normalizeAttachments(value) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((attachment) => {
      const normalized = normalizeAttachment(attachment);
      return normalized ? [normalized] : [];
    });
  }

  function normalizeQueue(value) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      if (typeof item.id !== 'string' || !item.id) return [];
      if (typeof item.text !== 'string') return [];
      if (!Number.isFinite(item.createdAt)) return [];
      const text = item.text.trim();
      const attachments = normalizeAttachments(item.attachments);
      if (!text && !attachments.length) return [];
      const normalized = { id: item.id, text, createdAt: item.createdAt };
      if (attachments.length) normalized.attachments = attachments;
      return [normalized];
    });
  }
  function normalizeQueueState(value) { if(Array.isArray(value))return{paused:false,items:normalizeQueue(value)};if(!value||typeof value!=='object')return{paused:false,items:[]};return{paused:Boolean(value.paused),items:normalizeQueue(value.items)}; }
  function defaultIdFactory(){const cryptoApi=globalThis.crypto;if(cryptoApi&&typeof cryptoApi.randomUUID==='function')return cryptoApi.randomUUID();return`q-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
  function createQueueItem(content, now = Date.now, idFactory = defaultIdFactory) {
    const source = typeof content === 'string' ? { text: content, attachments: [] } : (content || {});
    const text = typeof source.text === 'string' ? source.text.trim() : '';
    const attachments = normalizeAttachments(source.attachments);
    if (!text && !attachments.length) return null;
    const item = { id: String(idFactory()), text, createdAt: Number(now()) };
    if (attachments.length) item.attachments = attachments;
    return item;
  }
  function reorderQueue(queue,fromIndex,toIndex){if(!Array.isArray(queue))return[];if(!Number.isInteger(fromIndex)||fromIndex<0||fromIndex>=queue.length)return queue.slice();const next=queue.slice();const[item]=next.splice(fromIndex,1);const destination=Math.max(0,Math.min(next.length,Number.isFinite(toIndex)?Math.trunc(toIndex):fromIndex));next.splice(destination,0,item);return next;}
  function normalizeShortcut(value){return value===SHORTCUT_ALT_ENTER?SHORTCUT_ALT_ENTER:SHORTCUT_CTRL_ENTER;}
  function matchesQueueShortcut(eventLike,shortcut){if(!eventLike||eventLike.key!=='Enter')return false;if(eventLike.shiftKey||eventLike.metaKey)return false;if(shortcut===SHORTCUT_ALT_ENTER)return Boolean(eventLike.altKey)&&!eventLike.ctrlKey;return Boolean(eventLike.ctrlKey)&&!eventLike.altKey;}
  function canDispatch({busy,sendReady,queueLength,dispatching,awaitingBusy}){return!busy&&Boolean(sendReady)&&Number(queueLength)>0&&!dispatching&&!awaitingBusy;}
  function createUndoRecord(item,index,deletedAt,ttlMs=DEFAULT_UNDO_TTL_MS){return{item:item&&typeof item==='object'?{...item}:item,index:Number.isInteger(index)?index:0,deletedAt,expiresAt:deletedAt+ttlMs};}
  function canUndo(record,now){return Boolean(record&&Number.isFinite(record.expiresAt)&&now<record.expiresAt);}
  const api={SHORTCUT_CTRL_ENTER,SHORTCUT_ALT_ENTER,DEFAULT_SHORTCUT,DEFAULT_UNDO_TTL_MS,normalizeAttachment,normalizeAttachments,normalizeQueue,normalizeQueueState,createQueueItem,reorderQueue,normalizeShortcut,matchesQueueShortcut,canDispatch,createUndoRecord,canUndo};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof globalThis!=='undefined')(globalThis.AiChatWebSupporter||={}).queueCore=api;
})();
