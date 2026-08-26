(() => {
  'use strict';

  const DEFAULT_CHUNK_BYTES = 256 * 1024;
  const CAPTURE_GRACE_MS = 1500;

  function defaultIdFactory() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    return `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function fileFingerprint(file) {
    if (!file) return '';
    return [file.name || '', Number(file.size) || 0, file.type || '', Number(file.lastModified) || 0].join('\u0000');
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
    return globalThis.btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(String(value || ''), 'base64'));
    const binary = globalThis.atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function sendRuntimeMessage(runtime, message) {
    if (!runtime?.sendMessage) return Promise.reject(new Error('Extension runtime messaging is unavailable'));
    return new Promise((resolve, reject) => {
      try {
        runtime.sendMessage(message, (response) => {
          const lastError = runtime.lastError;
          if (lastError) return reject(new Error(lastError.message || String(lastError)));
          if (!response?.ok) return reject(new Error(response?.error || 'Attachment storage request failed'));
          resolve(response);
        });
      } catch (error) { reject(error); }
    });
  }

  async function storeFiles(files, runtime = globalThis.chrome?.runtime, idFactory = defaultIdFactory, chunkBytes = DEFAULT_CHUNK_BYTES) {
    const input = Array.from(files || []).filter(Boolean);
    const stored = [];
    try {
      for (const file of input) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const size = Number.isFinite(file.size) ? file.size : bytes.byteLength;
        const count = bytes.byteLength ? Math.ceil(bytes.byteLength / chunkBytes) : 0;
        const attachment = {
          id: String(idFactory()),
          name: String(file.name || 'attachment'),
          type: String(file.type || ''),
          size,
          lastModified: Number.isFinite(file.lastModified) ? file.lastModified : 0,
          kind: String(file.type || '').startsWith('image/') ? 'image' : 'file',
          chunkCount: count,
        };
        await sendRuntimeMessage(runtime, { type:'aichat:attachment-begin', attachment });
        stored.push(attachment);
        for (let index = 0; index < count; index += 1) {
          const start = index * chunkBytes;
          const chunk = bytes.subarray(start, Math.min(bytes.length, start + chunkBytes));
          await sendRuntimeMessage(runtime, { type:'aichat:attachment-chunk', id:attachment.id, index, data:bytesToBase64(chunk) });
        }
      }
      return stored;
    } catch (error) {
      await Promise.allSettled(stored.map((attachment) => sendRuntimeMessage(runtime, { type:'aichat:attachment-delete', id:attachment.id })));
      throw error;
    }
  }

  async function loadFiles(metadata, runtime = globalThis.chrome?.runtime, FileCtor = globalThis.File) {
    if (typeof FileCtor !== 'function') throw new Error('File constructor is unavailable');
    const result = [];
    for (const attachment of Array.from(metadata || [])) {
      const parts = [];
      for (let index = 0; index < Number(attachment.chunkCount || 0); index += 1) {
        const response = await sendRuntimeMessage(runtime, { type:'aichat:attachment-get-chunk', id:attachment.id, index });
        parts.push(base64ToBytes(response.data));
      }
      result.push(new FileCtor(parts, attachment.name, { type:attachment.type || '', lastModified:Number(attachment.lastModified) || 0 }));
    }
    return result;
  }

  async function deleteAttachments(metadata, runtime = globalThis.chrome?.runtime) {
    for (const attachment of Array.from(metadata || [])) {
      if (attachment?.id) await sendRuntimeMessage(runtime, { type:'aichat:attachment-delete', id:attachment.id });
    }
  }

  class AttachmentCapture {
    constructor({ graceMs = CAPTURE_GRACE_MS } = {}) {
      this.graceMs = graceMs;
      this.files = [];
      this.lastCaptureAt = 0;
    }
    remember(files, now = Date.now()) {
      const seen = new Set(this.files.map(fileFingerprint));
      for (const file of Array.from(files || [])) {
        const fingerprint = fileFingerprint(file);
        if (!fingerprint || seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        this.files.push(file);
      }
      if (Array.from(files || []).length) this.lastCaptureAt = Number(now);
      return this.files.slice();
    }
    captureEvent(event, now = Date.now()) {
      const files = event?.clipboardData?.files || event?.dataTransfer?.files || event?.target?.files || [];
      return this.remember(files, now);
    }
    currentFiles(provider, composer, doc = globalThis.document, win = globalThis.window) {
      const selected = provider?.getSelectedFiles?.(composer, doc, win) || [];
      this.remember(selected);
      return this.files.slice();
    }
    reconcile(provider, composer, now = Date.now()) {
      if (provider?.hasAttachments?.(composer) || Number(now) - this.lastCaptureAt <= this.graceMs) return false;
      this.clear();
      return true;
    }
    clear() { this.files = []; this.lastCaptureAt = 0; }
  }

  const api = { DEFAULT_CHUNK_BYTES, CAPTURE_GRACE_MS, fileFingerprint, bytesToBase64, base64ToBytes, sendRuntimeMessage, storeFiles, loadFiles, deleteAttachments, AttachmentCapture };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).queueAttachments = api;
})();
