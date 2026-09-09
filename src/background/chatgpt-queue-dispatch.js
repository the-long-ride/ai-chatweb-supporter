(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  /** Session storage key prefix for captured auth headers, keyed by tabId. */
  const AUTH_KEY_PREFIX = 'aichat.chatgpt.auth.';

  /** Local storage key prefix for queued messages, keyed by conversationId. */
  const QUEUE_KEY_PREFIX = 'cgptMessageQueue:chatgpt:conversation:';

  /** ChatGPT backend API base URL. */
  const CHATGPT_API = 'https://chatgpt.com/backend-api';

  /** URL pattern that covers all ChatGPT backend requests. */
  const CHATGPT_API_PATTERN = 'https://chatgpt.com/backend-api/*';

  /**
   * Conversation endpoint suffix - we only dispatch on completions of requests
   * to /backend-api/conversation (with an optional trailing slash + id).
   */
  const CONVERSATION_PATH_RE = /\/backend-api\/conversation(?:\/([^/?#]+))?(?:[/?#]|$)/i;

  /**
   * How long (ms) to suppress duplicate dispatches for the same conversation.
   * Prevents double-fire when two responses arrive in quick succession.
   */
  const DISPATCH_COOLDOWN_MS = 10_000;

  // ---------------------------------------------------------------------------
  // In-memory cooldown tracker  { conversationId -> expiresAt (ms) }
  // ---------------------------------------------------------------------------

  const recentlyDispatched = new Map();

  function isOnCooldown(conversationId) {
    const expiresAt = recentlyDispatched.get(conversationId);
    if (expiresAt === undefined) return false;
    if (Date.now() < expiresAt) return true;
    recentlyDispatched.delete(conversationId);
    return false;
  }

  function markDispatched(conversationId) {
    recentlyDispatched.set(conversationId, Date.now() + DISPATCH_COOLDOWN_MS);
    // Prune stale entries to prevent unbounded growth.
    for (const [id, exp] of recentlyDispatched) {
      if (Date.now() >= exp) recentlyDispatched.delete(id);
    }
  }

  // ---------------------------------------------------------------------------
  // UUID helper (crypto.randomUUID when available, otherwise manual)
  // ---------------------------------------------------------------------------

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback: manual RFC-4122 v4 UUID.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---------------------------------------------------------------------------
  // Auth capture - store auth headers per tab in chrome.storage.session
  // ---------------------------------------------------------------------------

  function authKeyForTab(tabId) {
    return `${AUTH_KEY_PREFIX}${tabId}`;
  }

  /**
   * Persist captured auth headers for a tab into session storage.
   * @param {object} chromeApi
   * @param {number} tabId
   * @param {{ authorization?: string, chatgptAccountId?: string }} headers
   */
  async function saveTabAuth(chromeApi, tabId, headers) {
    const key = authKeyForTab(tabId);
    try {
      await chromeApi.storage.session.set({ [key]: headers });
    } catch {
      // best-effort; ignore session quota errors
    }
  }

  /**
   * Read the most recently captured auth for a tab.
   * @param {object} chromeApi
   * @param {number} tabId
   * @returns {Promise<{ authorization?: string, chatgptAccountId?: string } | null>}
   */
  async function loadTabAuth(chromeApi, tabId) {
    const key = authKeyForTab(tabId);
    try {
      const stored = await chromeApi.storage.session.get(key);
      const value = stored?.[key];
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  /**
   * Listener for chrome.webRequest.onBeforeSendHeaders - captures auth headers.
   * @param {object} chromeApi
   * @param {object} details  webRequest details object
   */
  function onBeforeSendHeaders(chromeApi, details) {
    const { tabId, requestHeaders } = details;
    if (!Number.isInteger(tabId) || tabId < 0 || !Array.isArray(requestHeaders)) return;

    let authorization;
    let chatgptAccountId;

    for (const header of requestHeaders) {
      const name = (header.name || '').toLowerCase();
      if (name === 'authorization' && header.value) {
        authorization = header.value;
      } else if (name === 'chatgpt-account-id' && header.value) {
        chatgptAccountId = header.value;
      }
    }

    if (!authorization) return; // no bearer token found - skip

    void saveTabAuth(chromeApi, tabId, {
      ...(authorization !== undefined && { authorization }),
      ...(chatgptAccountId !== undefined && { chatgptAccountId }),
    }).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Queue helpers - read/write chrome.storage.local
  // ---------------------------------------------------------------------------

  function queueKeyForConversation(conversationId) {
    return `${QUEUE_KEY_PREFIX}${conversationId}`;
  }

  /**
   * Read the queue state for a conversation from local storage.
   * @param {object} chromeApi
   * @param {string} conversationId
   * @returns {Promise<{ paused: boolean, items: Array } | null>}
   */
  async function readQueue(chromeApi, conversationId) {
    const key = queueKeyForConversation(conversationId);
    try {
      const stored = await chromeApi.storage.local.get(key);
      const value = stored?.[key];
      if (!value || typeof value !== 'object' || !Array.isArray(value.items)) return null;
      return value;
    } catch {
      return null;
    }
  }

  /**
   * Remove the first item from the queue (shift) and persist.
   * @param {object} chromeApi
   * @param {string} conversationId
   * @param {string} itemId  id of the item to remove (must match queue[0].id for safety)
   */
  async function dequeueItem(chromeApi, conversationId, itemId) {
    const key = queueKeyForConversation(conversationId);
    try {
      // Re-read to avoid TOCTOU race.
      const stored = await chromeApi.storage.local.get(key);
      const state = stored?.[key];
      if (!state || !Array.isArray(state.items) || state.items.length === 0) return;
      if (state.items[0]?.id !== itemId) return; // guard: item already removed
      const updated = { ...state, items: state.items.slice(1) };
      await chromeApi.storage.local.set({ [key]: updated });
    } catch {
      // best-effort
    }
  }

  // ---------------------------------------------------------------------------
  // Dispatch - POST next queue item to ChatGPT backend API
  // ---------------------------------------------------------------------------

  /**
   * Build the ChatGPT conversation POST body for a queued text item.
   * @param {string} conversationId
   * @param {{ id: string, text: string, createdAt: number }} item
   * @returns {object}
   */
  function buildMessageBody(conversationId, item) {
    return {
      action: 'next',
      messages: [
        {
          id: generateUUID(),
          author: { role: 'user' },
          content: {
            content_type: 'text',
            parts: [String(item.text || '')],
          },
          create_time: Math.floor(Date.now() / 1000),
        },
      ],
      conversation_id: conversationId,
      // Use a random UUID - ChatGPT accepts this and threads the message correctly.
      parent_message_id: generateUUID(),
      model: 'auto',
      history_and_training_disabled: false,
    };
  }

  /**
   * Fire-and-forget POST to the ChatGPT conversation endpoint.
   * @param {string} conversationId
   * @param {{ authorization?: string, chatgptAccountId?: string }} auth
   * @param {object} body
   * @returns {Promise<boolean>} true if the request was accepted (2xx response)
   */
  async function postToConversation(conversationId, auth, body) {
    const url = `${CHATGPT_API}/conversation`;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (auth.authorization) headers['Authorization'] = auth.authorization;
    if (auth.chatgptAccountId) headers['ChatGPT-Account-Id'] = auth.chatgptAccountId;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Core dispatch routine - called when a conversation completion is detected.
   * @param {object} chromeApi
   * @param {number} tabId
   * @param {string} conversationId
   */
  async function maybeDispatchNext(chromeApi, tabId, conversationId) {
    if (!conversationId || typeof conversationId !== 'string') return;
    if (isOnCooldown(conversationId)) return;

    // 1. Read queue; bail if empty or paused.
    const queueState = await readQueue(chromeApi, conversationId);
    if (!queueState) return;
    if (queueState.paused === true) return;
    if (!Array.isArray(queueState.items) || queueState.items.length === 0) return;

    const nextItem = queueState.items[0];
    if (!nextItem || !nextItem.id || typeof nextItem.text !== 'string') return;

    // 2. Load captured auth for this tab.
    const auth = await loadTabAuth(chromeApi, tabId);
    if (!auth || !auth.authorization) return; // no auth token - cannot dispatch

    // 3. Mark cooldown immediately to prevent races.
    markDispatched(conversationId);

    // 4. Build and POST the message.
    const body = buildMessageBody(conversationId, nextItem);
    const sent = await postToConversation(conversationId, auth, body);

    // 5. On success, remove the item from the queue.
    if (sent) {
      await dequeueItem(chromeApi, conversationId, nextItem.id);
    }
  }

  // ---------------------------------------------------------------------------
  // webRequest completion listener
  // ---------------------------------------------------------------------------

  /**
   * Extract the conversationId from a ChatGPT backend URL.
   * Handles:
   *   /backend-api/conversation          -> null (fresh conv, no id yet)
   *   /backend-api/conversation/{id}     -> id
   * @param {string} url
   * @returns {string | null}
   */
  function extractConversationId(url) {
    try {
      const { pathname } = new URL(url);
      const match = CONVERSATION_PATH_RE.exec(pathname);
      if (!match) return null;
      const id = match[1];
      return id && id.length > 0 ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * Listener for chrome.webRequest.onCompleted - triggers dispatch when a
   * ChatGPT conversation POST completes successfully (HTTP 200).
   * @param {object} chromeApi
   * @param {object} details  webRequest details object
   */
  function onRequestCompleted(chromeApi, details) {
    // Only care about successful POSTs to /backend-api/conversation/{id}
    if (details.method !== 'POST') return;
    if (details.statusCode !== 200) return;

    const conversationId = extractConversationId(details.url);
    if (!conversationId) return; // fresh conversation without an id - skip

    const tabId = details.tabId;
    if (!Number.isInteger(tabId) || tabId < 0) return;

    void maybeDispatchNext(chromeApi, tabId, conversationId).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Install
  // ---------------------------------------------------------------------------

  /**
   * Wire up the ChatGPT queue dispatcher to webRequest listeners.
   * @param {object} [chromeApi]  defaults to globalThis.chrome
   * @returns {boolean} true if listeners were successfully installed
   */
  function installChatGptQueueDispatch(chromeApi = globalThis.chrome) {
    if (!chromeApi?.webRequest?.onBeforeSendHeaders?.addListener) return false;
    if (!chromeApi?.webRequest?.onCompleted?.addListener) return false;
    if (!chromeApi?.storage?.session || !chromeApi?.storage?.local) return false;

    const filter = { urls: [CHATGPT_API_PATTERN] };
    // 'extraHeaders' is required to intercept sensitive headers like Authorization.
    // Try with extraHeaders first; fall back without for environments that don't support it.
    const extraInfoSpecWithSensitive = ['requestHeaders', 'extraHeaders'];
    const extraInfoSpecBasic = ['requestHeaders'];

    try {
      chromeApi.webRequest.onBeforeSendHeaders.addListener(
        (details) => onBeforeSendHeaders(chromeApi, details),
        filter,
        extraInfoSpecWithSensitive,
      );
    } catch {
      try {
        chromeApi.webRequest.onBeforeSendHeaders.addListener(
          (details) => onBeforeSendHeaders(chromeApi, details),
          filter,
          extraInfoSpecBasic,
        );
      } catch {
        return false;
      }
    }

    try {
      chromeApi.webRequest.onCompleted.addListener(
        (details) => onRequestCompleted(chromeApi, details),
        filter,
      );
    } catch {
      return false;
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  const api = {
    AUTH_KEY_PREFIX,
    QUEUE_KEY_PREFIX,
    CHATGPT_API,
    DISPATCH_COOLDOWN_MS,
    generateUUID,
    authKeyForTab,
    queueKeyForConversation,
    extractConversationId,
    buildMessageBody,
    maybeDispatchNext,
    installChatGptQueueDispatch,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.AiChatWebQueueDispatch = api;
})();
