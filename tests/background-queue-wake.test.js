const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registerQueueTab, wakeRegisteredQueueTabs, REGISTRY_KEY } = require('../src/background/queue-wake.js');

function fakeChrome() {
  const session = {};
  const sent = [];
  return {
    session,
    sent,
    storage:{ session:{
      async get(key){ return { [key]:session[key] }; },
      async set(values){ Object.assign(session, values); },
    } },
    tabs:{ async sendMessage(tabId, message){ sent.push([tabId, message]); } },
  };
}

test('registration accepts only ChatGPT and Claude', async () => {
  const chrome = fakeChrome();
  assert.equal(await registerQueueTab(chrome, 7, 'chatgpt'), true);
  assert.equal(await registerQueueTab(chrome, 8, 'claude'), true);
  assert.equal(await registerQueueTab(chrome, 9, 'grok'), false);
  assert.deepEqual(chrome.session[REGISTRY_KEY], { '7':'chatgpt', '8':'claude' });
});

test('wake sends only queue reconcile messages', async () => {
  const chrome = fakeChrome();
  chrome.session[REGISTRY_KEY] = { '7':'chatgpt', '8':'claude' };
  await wakeRegisteredQueueTabs(chrome);
  assert.deepEqual(chrome.sent, [
    [7, { type:'aichat:queue-reconcile' }],
    [8, { type:'aichat:queue-reconcile' }],
  ]);
});

test('unreachable tabs are pruned', async () => {
  const chrome = fakeChrome();
  chrome.session[REGISTRY_KEY] = { '7':'chatgpt', '8':'claude' };
  chrome.tabs.sendMessage = async (tabId, message) => {
    chrome.sent.push([tabId, message]);
    if (tabId === 7) throw new Error('gone');
  };
  await wakeRegisteredQueueTabs(chrome);
  assert.deepEqual(chrome.session[REGISTRY_KEY], { '8':'claude' });
});

test('service worker imports and installs queue wake helper', () => {
  const worker = fs.readFileSync(path.resolve(__dirname, '../src/background/service-worker.js'), 'utf8');
  assert.match(worker, /queue-wake\.js/);
  assert.match(worker, /installQueueWake/);
});
