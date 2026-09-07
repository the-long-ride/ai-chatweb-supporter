const test = require('node:test');
const assert = require('node:assert/strict');
const { wakeRegisteredQueueTabs } = require('../src/background/queue-wake.js');

function fakeChrome(machineState = 'locked') {
  const session = {};
  const sent = [];
  const updates = [];
  const tabs = new Map([
    [1, { id:1, windowId:10, active:true, url:'https://example.com/', frozen:false, discarded:false, status:'complete', autoDiscardable:true }],
    [7, { id:7, windowId:10, active:false, url:'https://chatgpt.com/c/test', frozen:true, discarded:false, status:'complete', autoDiscardable:true }],
  ]);

  function snapshot(tab) { return tab ? { ...tab } : undefined; }

  return {
    session,
    sent,
    updates,
    tabState: tabs,
    storage: {
      session: {
        async get(key) { return { [key]:session[key] }; },
        async set(values) { Object.assign(session, values); },
      },
      local: {
        async get(key) { return { [key]:true }; },
      },
    },
    idle: {
      async queryState() { return machineState; },
    },
    tabs: {
      async query(queryInfo = {}) {
        const values = [...tabs.values()];
        return values
          .filter((tab) => queryInfo.windowId == null || tab.windowId === queryInfo.windowId)
          .filter((tab) => queryInfo.active == null || tab.active === queryInfo.active)
          .map(snapshot);
      },
      async get(tabId) { return snapshot(tabs.get(tabId)); },
      async update(tabId, properties) {
        updates.push([tabId, { ...properties }]);
        const tab = tabs.get(tabId);
        if (!tab) throw new Error('missing tab');
        if (properties.active === true) {
          for (const candidate of tabs.values()) {
            if (candidate.windowId === tab.windowId) candidate.active = false;
          }
          tab.active = true;
          tab.frozen = false;
          tab.discarded = false;
          tab.status = 'complete';
        }
        if (typeof properties.autoDiscardable === 'boolean') tab.autoDiscardable = properties.autoDiscardable;
        return snapshot(tab);
      },
      async sendMessage(tabId, message) {
        const tab = tabs.get(tabId);
        if (!tab || tab.frozen || tab.discarded) throw new Error('tab cannot execute');
        if (!/^https:\/\/(chatgpt\.com|claude\.ai|grok\.com)\//.test(tab.url)) throw new Error('no content script');
        sent.push([tabId, message]);
      },
    },
  };
}

test('locked machine temporarily activates a frozen supported tab, reconciles it, then restores the previous active tab', async () => {
  const chrome = fakeChrome('locked');

  await wakeRegisteredQueueTabs(chrome);

  assert.deepEqual(chrome.sent, [[7, { type:'aichat:queue-reconcile' }]]);
  assert.equal(chrome.tabState.get(7).autoDiscardable, false);
  assert.equal(chrome.tabState.get(7).frozen, false);
  assert.equal(chrome.tabState.get(7).active, false);
  assert.equal(chrome.tabState.get(1).active, true);
  assert.ok(chrome.updates.some(([tabId, props]) => tabId === 7 && props.active === true));
  assert.ok(chrome.updates.some(([tabId, props]) => tabId === 1 && props.active === true));
});

test('active machine never steals activation from a frozen supported tab', async () => {
  const chrome = fakeChrome('active');

  await wakeRegisteredQueueTabs(chrome);

  assert.equal(chrome.tabState.get(1).active, true);
  assert.equal(chrome.tabState.get(7).active, false);
  assert.equal(chrome.updates.some(([tabId, props]) => tabId === 7 && props.active === true), false);
});
