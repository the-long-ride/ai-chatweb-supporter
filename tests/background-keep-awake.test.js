const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../src/background/service-worker.js'), 'utf8');

function runWorker(initialValue) {
  const powerCalls = [];
  const storageListeners = [];
  const messageListeners = [];
  const context = {
    importScripts() {},
    console,
    Promise,
    setTimeout,
  };
  const chrome = {
    power: {
      requestKeepAwake(level) { powerCalls.push(['request', level]); },
      releaseKeepAwake() { powerCalls.push(['release']); },
    },
    storage: {
      local: {
        async get(key) { return { [key]: initialValue }; },
      },
      onChanged: {
        addListener(listener) { storageListeners.push(listener); },
      },
    },
    runtime: {
      onMessage: { addListener(listener) { messageListeners.push(listener); } },
    },
  };
  context.globalThis = context;
  context.chrome = chrome;
  vm.runInNewContext(source, context, { filename: 'service-worker.js' });
  return { powerCalls, storageListeners, messageListeners };
}

test('service worker restores system keep-awake when preference is enabled', async () => {
  const env = runWorker(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(env.powerCalls, [['request', 'system']]);
});

test('service worker releases keep-awake when preference is disabled', async () => {
  const env = runWorker(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(env.powerCalls, [['release']]);
});

test('local storage changes update system keep-awake immediately', async () => {
  const env = runWorker(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.storageListeners.length, 1);
  env.powerCalls.length = 0;

  env.storageListeners[0]({ backgroundKeepAwake: { newValue: true } }, 'local');
  env.storageListeners[0]({ backgroundKeepAwake: { newValue: false } }, 'local');

  assert.deepEqual(env.powerCalls, [['request', 'system'], ['release']]);
});
