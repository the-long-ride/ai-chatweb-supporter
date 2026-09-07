const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registerQueueTab, wakeRegisteredQueueTabs, REGISTRY_KEY, WAKE_PERIOD_MINUTES } = require('../src/background/queue-wake.js');

function fakeChrome() {
  const session = {};
  const sent = [];
  const queriedTabs = [];
  return {
    session,
    sent,
    queriedTabs,
    storage:{ session:{
      async get(key){ return { [key]:session[key] }; },
      async set(values){ Object.assign(session, values); },
    } },
    tabs:{
      async query(){ queriedTabs.push(true); return []; },
      async sendMessage(tabId, message){ sent.push([tabId, message]); },
    },
  };
}

test('background wake runs every 30 seconds', () => {
  assert.equal(WAKE_PERIOD_MINUTES, 0.5);
});

test('registration accepts ChatGPT, Claude, and Grok', async () => {
  const chrome = fakeChrome();
  assert.equal(await registerQueueTab(chrome, 7, 'chatgpt'), true);
  assert.equal(await registerQueueTab(chrome, 8, 'claude'), true);
  assert.equal(await registerQueueTab(chrome, 9, 'grok'), true);
  assert.equal(await registerQueueTab(chrome, 10, 'unknown'), false);
  assert.deepEqual(chrome.session[REGISTRY_KEY], { '7':'chatgpt', '8':'claude', '9':'grok' });
});

test('wake sends reconcile messages to all registered provider tabs', async () => {
  const chrome = fakeChrome();
  chrome.session[REGISTRY_KEY] = { '7':'chatgpt', '8':'claude', '9':'grok' };
  await wakeRegisteredQueueTabs(chrome);
  assert.deepEqual(chrome.sent, [
    [7, { type:'aichat:queue-reconcile' }],
    [8, { type:'aichat:queue-reconcile' }],
    [9, { type:'aichat:queue-reconcile' }],
  ]);
});

test('wake discovers unregistered open tabs and reconciles them too', async () => {
  const chrome = fakeChrome();
  chrome.session[REGISTRY_KEY] = { '7':'chatgpt' };
  chrome.tabs.query = async () => { chrome.queriedTabs.push(true); return [{ id:7 }, { id:8 }, { id:42 }]; };
  chrome.tabs.sendMessage = async (tabId, message) => {
    chrome.sent.push([tabId, message]);
    if (tabId === 42) throw new Error('no content script');
  };
  await wakeRegisteredQueueTabs(chrome);
  assert.equal(chrome.queriedTabs.length, 1);
  assert.deepEqual(chrome.sent, [
    [7, { type:'aichat:queue-reconcile' }],
    [8, { type:'aichat:queue-reconcile' }],
    [42, { type:'aichat:queue-reconcile' }],
  ]);
  assert.deepEqual(chrome.session[REGISTRY_KEY], { '7':'chatgpt' });
});

test('unreachable registered tabs are pruned', async () => {
  const chrome = fakeChrome();
  chrome.session[REGISTRY_KEY] = { '7':'chatgpt', '8':'claude', '9':'grok' };
  chrome.tabs.sendMessage = async (tabId, message) => {
    chrome.sent.push([tabId, message]);
    if (tabId === 7) throw new Error('gone');
  };
  await wakeRegisteredQueueTabs(chrome);
  assert.deepEqual(chrome.session[REGISTRY_KEY], { '8':'claude', '9':'grok' });
});

test('service worker imports and installs queue wake helper', () => {
  const worker = fs.readFileSync(path.resolve(__dirname, '../src/background/service-worker.js'), 'utf8');
  assert.match(worker, /queue-wake\.js/);
  assert.match(worker, /installQueueWake/);
});
