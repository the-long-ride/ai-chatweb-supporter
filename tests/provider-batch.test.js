const test = require('node:test');
const assert = require('node:assert/strict');
const chatgpt = require('../src/providers/chatgpt.js');
const claude = require('../src/providers/claude.js');
const grok = require('../src/providers/grok.js');

function response({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, async json() { return json; } };
}

function anchor(href, extra = {}) {
  return {
    href,
    matches(selector) { return selector.includes('a[href'); },
    getAttribute(name) { return name === 'href' ? href : extra[name] ?? null; },
    querySelector() { return null; },
    ...extra,
  };
}

test('provider batch capabilities match supported actions', () => {
  assert.equal(chatgpt.batch.supportsArchive, true);
  assert.equal(claude.batch.supportsArchive, false);
  assert.equal(grok.batch.supportsArchive, false);
});

test('ChatGPT batch extracts ids and uses runtime token plus _account cookie for archive/delete', async () => {
  const row = anchor('/c/abc-123?messageId=x');
  assert.equal(chatgpt.batch.getConversationId(row), 'abc-123');

  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/auth/session') return response({ json: { accessToken: 'dynamic-token' } });
    return response();
  };
  const context = {
    fetch: fakeFetch,
    document: { cookie: 'theme=dark; _account=account-current; foo=bar' },
  };
  await chatgpt.batch.archiveConversation('abc-123', context);
  await chatgpt.batch.deleteConversation('def-456', context);

  const archive = calls.find((call) => call.url === '/backend-api/conversation/abc-123');
  assert.equal(archive.options.method, 'PATCH');
  assert.equal(archive.options.credentials, 'include');
  assert.equal(archive.options.headers.authorization, 'Bearer dynamic-token');
  assert.equal(archive.options.headers['chatgpt-account-id'], 'account-current');
  assert.equal(archive.options.headers['content-type'], 'application/json');
  assert.equal(archive.options.body, JSON.stringify({ is_archived: true }));

  const deletion = calls.find((call) => call.url === '/backend-api/conversation/def-456');
  assert.equal(deletion.options.method, 'PATCH');
  assert.equal(deletion.options.credentials, 'include');
  assert.equal(deletion.options.headers.authorization, 'Bearer dynamic-token');
  assert.equal(deletion.options.headers['chatgpt-account-id'], 'account-current');
  assert.equal(deletion.options.headers['content-type'], 'application/json');
  assert.equal(deletion.options.body, JSON.stringify({ is_visible: false }));
  assert.equal(calls.filter((call) => call.url === '/api/auth/session').length, 1);
});

test('Claude batch extracts data-row-key ids and resolves organization from current cookie', async () => {
  const row = {
    getAttribute(name) { return name === 'data-row-key' ? 'chat:claude-123' : null; },
    querySelector() { return anchor('/chat/fallback'); },
  };
  assert.equal(claude.batch.getConversationId(row), 'claude-123');

  const calls = [];
  await claude.batch.deleteConversation('claude-123', {
    document: { cookie: 'theme=dark; lastActiveOrg=org-current; foo=bar' },
    fetch: async (url, options = {}) => { calls.push({ url, options }); return response(); },
  });
  assert.equal(calls[0].url, '/api/organizations/org-current/chat_conversations/claude-123');
  assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.equal(calls[0].options.body, JSON.stringify({ uuid: 'claude-123' }));
});

test('parallel provider deletions share cached auth and organization resolution', async () => {
  let sessionCalls = 0;
  const chatgptContext = {
    document: { cookie: '_account=acc-1' },
    fetch: async (url) => {
      if (url === '/api/auth/session') {
        sessionCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return response({ json: { accessToken: 'tok' } });
      }
      return response();
    },
  };
  await Promise.all([
    chatgpt.batch.deleteConversation('c1', chatgptContext),
    chatgpt.batch.deleteConversation('c2', chatgptContext),
    chatgpt.batch.deleteConversation('c3', chatgptContext),
  ]);
  assert.equal(sessionCalls, 1);

  let orgResolves = 0;
  const claudeContext = {
    resolveOrganizationId: async () => {
      orgResolves++;
      await new Promise((r) => setTimeout(r, 10));
      return 'org-cached';
    },
    fetch: async () => response(),
  };
  await Promise.all([
    claude.batch.deleteConversation('cl1', claudeContext),
    claude.batch.deleteConversation('cl2', claudeContext),
  ]);
  assert.equal(orgResolves, 1);
});

test('Grok batch extracts ids and calls soft-delete endpoint', async () => {
  const row = { querySelector() { return anchor('/c/grok-123?rid=1'); } };
  assert.equal(grok.batch.getConversationId(row), 'grok-123');
  const calls = [];
  await grok.batch.deleteConversation('grok-123', {
    fetch: async (url, options = {}) => { calls.push({ url, options }); return response(); },
  });
  assert.equal(calls[0].url, '/rest/app-chat/conversations/soft/grok-123');
  assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(calls[0].options.credentials, 'include');
});

test('provider batch requests throw on non-2xx responses', async () => {
  await assert.rejects(() => grok.batch.deleteConversation('bad', { fetch: async () => response({ ok: false, status: 500 }) }), /500/);
});


test('ChatGPT batch discovers the new Recents section and keyed conversation rows', () => {
  const rowAnchor = anchor('/c/recent-123');
  const row = {
    matches() { return false; },
    querySelector(selector) {
      if (selector.includes('a[href*="/c/"]')) return rowAnchor;
      return null;
    },
  };

  const filterButton = { parentElement: null };
  const header = {
    parentElement: null,
    querySelector(selector) {
      if (selector.includes('button[aria-label="Filter chats and work"]')) return filterButton;
      return null;
    },
  };
  filterButton.parentElement = header;

  const toggle = { parentElement: header };
  const section = {
    querySelector(selector) {
      if (selector.includes('data-app-action-sidebar-section-toggle')) return toggle;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('data-sidebar-chatgpt-conversation-key')) return [row];
      return [];
    },
  };

  const doc = {
    querySelector(selector) {
      if (selector.includes('data-app-action-sidebar-section-heading="Recents"')) return section;
      return null;
    },
  };

  assert.equal(chatgpt.batch.findConversationSection(doc), section);
  assert.equal(chatgpt.batch.findConversationHeader(section), header);
  assert.deepEqual(chatgpt.batch.listConversationRows(section), [row]);
  assert.equal(chatgpt.batch.getConversationId(row), 'recent-123');
  assert.equal(chatgpt.batch.getNativeButtonTemplate(section), filterButton);
});
