(() => {
  'use strict';

  const DB_NAME = 'aichat-queue-attachments';
  const DB_VERSION = 1;
  const ATTACHMENTS = 'attachments';
  const CHUNKS = 'chunks';
  const PREFIX = 'aichat:attachment-';

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function openDatabase(indexedDb = globalThis.indexedDB) {
    if (!indexedDb?.open) return Promise.reject(new Error('IndexedDB is unavailable'));
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ATTACHMENTS)) db.createObjectStore(ATTACHMENTS, { keyPath:'id' });
        if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { keyPath:'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open attachment database'));
    });
  }

  function createIndexedDbStore(indexedDb = globalThis.indexedDB) {
    let dbPromise = null;
    const db = () => dbPromise ||= openDatabase(indexedDb);
    return {
      async begin(attachment) {
        const database = await db();
        const tx = database.transaction([ATTACHMENTS], 'readwrite');
        tx.objectStore(ATTACHMENTS).put({ ...attachment });
        await transactionDone(tx);
      },
      async putChunk(id, index, data) {
        const database = await db();
        const tx = database.transaction([CHUNKS], 'readwrite');
        tx.objectStore(CHUNKS).put({ key:`${id}:${index}`, id, index, data:String(data || '') });
        await transactionDone(tx);
      },
      async getChunk(id, index) {
        const database = await db();
        const tx = database.transaction([CHUNKS], 'readonly');
        const record = await requestResult(tx.objectStore(CHUNKS).get(`${id}:${index}`));
        return record?.data;
      },
      async deleteAttachment(id) {
        const database = await db();
        const readTx = database.transaction([ATTACHMENTS], 'readonly');
        const attachment = await requestResult(readTx.objectStore(ATTACHMENTS).get(id));
        const tx = database.transaction([ATTACHMENTS, CHUNKS], 'readwrite');
        tx.objectStore(ATTACHMENTS).delete(id);
        const count = Number(attachment?.chunkCount || 0);
        for (let index = 0; index < count; index += 1) tx.objectStore(CHUNKS).delete(`${id}:${index}`);
        await transactionDone(tx);
      },
    };
  }

  function createMessageHandler(store) {
    return function handle(message) {
      const type = message?.type;
      if (typeof type !== 'string' || !type.startsWith(PREFIX)) return undefined;
      return (async () => {
        try {
          if (type === 'aichat:attachment-begin') await store.begin(message.attachment);
          else if (type === 'aichat:attachment-chunk') await store.putChunk(message.id, message.index, message.data);
          else if (type === 'aichat:attachment-get-chunk') return { ok:true, data:await store.getChunk(message.id, message.index) };
          else if (type === 'aichat:attachment-delete') await store.deleteAttachment(message.id);
          else return { ok:false, error:'Unknown attachment operation' };
          return { ok:true };
        } catch (error) {
          return { ok:false, error:error?.message || String(error) };
        }
      })();
    };
  }

  const api = { DB_NAME, DB_VERSION, createIndexedDbStore, createMessageHandler };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.AiChatAttachmentStore = api;

  const runtime = globalThis.chrome?.runtime;
  if (runtime?.onMessage?.addListener && globalThis.indexedDB) {
    const handle = createMessageHandler(createIndexedDbStore());
    runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const pending = handle(message);
      if (!pending) return undefined;
      Promise.resolve(pending).then(sendResponse, (error) => sendResponse({ ok:false, error:error?.message || String(error) }));
      return true;
    });
  }
})();
