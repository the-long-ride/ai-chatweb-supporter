(() => {
  'use strict';

  const MESSAGE_TYPE = 'aichat:chatgpt-batch-mutate';
  const CHATGPT_API = 'https://chatgpt.com/backend-api';
  const AUTH_KEY_PREFIX = 'aichat.chatgpt.auth.';

  function normalizeIds(ids) {
    const result = [];
    const seen = new Set();
    for (const value of Array.from(ids || [])) {
      const id = String(value || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
    return result;
  }

  function authKeyForTab(tabId) {
    const shared = globalThis.AiChatWebQueueDispatch?.authKeyForTab;
    return typeof shared === 'function' ? shared(tabId) : `${AUTH_KEY_PREFIX}${tabId}`;
  }

  async function loadAuth(chromeApi, tabId) {
    if (!Number.isInteger(tabId) || tabId < 0) return null;
    const session = chromeApi?.storage?.session;
    if (!session?.get) return null;
    const key = authKeyForTab(tabId);
    try {
      const stored = await session.get(key);
      const value = stored?.[key];
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  function mutationBody(action) {
    if (action === 'archive') return { is_archived: true };
    if (action === 'delete') return { is_visible: false };
    return null;
  }

  function errorText(error) {
    if (error instanceof Error && error.message) return error.message;
    const value = String(error || '').trim();
    return value || 'ChatGPT batch request failed';
  }

  function mutationFailureDetail(payload, response) {
    const detail = payload?.detail?.message ?? payload?.detail ?? payload?.message;
    if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail);
    if (response?.ok) return 'response success was not true';
    return `HTTP ${response?.status ?? 'unknown'}`;
  }

  async function mutateConversation(id, action, auth, fetchFn = globalThis.fetch) {
    const body = mutationBody(action);
    if (!body) throw new Error(`Unsupported ChatGPT batch action: ${action}`);
    if (typeof fetchFn !== 'function') throw new Error('ChatGPT batch fetch unavailable');

    const headers = { 'Content-Type': 'application/json' };
    if (auth?.authorization) headers.Authorization = auth.authorization;
    if (auth?.chatgptAccountId) headers['ChatGPT-Account-Id'] = auth.chatgptAccountId;

    const response = await fetchFn(`${CHATGPT_API}/conversation/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });

    let payload = null;
    let parsedPayload = false;
    if (typeof response?.json === 'function') {
      try {
        payload = await response.json();
        parsedPayload = true;
      } catch {}
    }

    if (!response?.ok || (parsedPayload && payload?.success !== true)) {
      const status = response?.status ?? 'unknown';
      const detail = mutationFailureDetail(payload, response);
      throw new Error(`ChatGPT ${action} failed for ${id}: ${status} (${detail})`);
    }
    return true;
  }

  function failedResult(ids, error) {
    const message = errorText(error);
    return { succeeded: [], failed: normalizeIds(ids).map((id) => ({ id, error: message })) };
  }

  async function runBatchMutation(chromeApi, tabId, action, ids, fetchFn = globalThis.fetch, authOverride = null) {
    const list = normalizeIds(ids);
    if (!list.length) return { succeeded: [], failed: [] };
    if (!mutationBody(action)) return failedResult(list, `Unsupported ChatGPT batch action: ${action}`);
    if (!Number.isInteger(tabId) || tabId < 0) return failedResult(list, 'ChatGPT tab context unavailable');

    const capturedAuth = await loadAuth(chromeApi, tabId);
    const auth = {
      authorization: authOverride?.authorization || capturedAuth?.authorization,
      chatgptAccountId: capturedAuth?.chatgptAccountId || authOverride?.chatgptAccountId,
    };
    if (!auth.authorization) return failedResult(list, 'ChatGPT authorization unavailable');

    const settled = await Promise.allSettled(
      list.map((id) => mutateConversation(id, action, auth, fetchFn)),
    );
    const succeeded = [];
    const failed = [];
    settled.forEach((result, index) => {
      const id = list[index];
      if (result.status === 'fulfilled') succeeded.push(id);
      else failed.push({ id, error: errorText(result.reason) });
    });
    return { succeeded, failed };
  }

  function installChatGptBatchActions(chromeApi = globalThis.chrome, fetchFn = globalThis.fetch) {
    const onMessage = chromeApi?.runtime?.onMessage;
    if (!onMessage?.addListener || !chromeApi?.storage?.session) return false;

    onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type !== MESSAGE_TYPE) return undefined;
      const ids = normalizeIds(message?.ids);
      const tabId = sender?.tab?.id;
      void runBatchMutation(chromeApi, tabId, message?.action, ids, fetchFn, message?.auth)
        .then((result) => sendResponse?.(result))
        .catch((error) => sendResponse?.(failedResult(ids, error)));
      return true;
    });
    return true;
  }

  const api = {
    MESSAGE_TYPE,
    CHATGPT_API,
    normalizeIds,
    authKeyForTab,
    loadAuth,
    mutationBody,
    mutateConversation,
    runBatchMutation,
    installChatGptBatchActions,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.AiChatWebBatchActions = api;
})();
