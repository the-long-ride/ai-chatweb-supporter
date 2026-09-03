const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '../src/batch/styles.css'), 'utf8');

test('toast uses the requested glass-card treatment at bottom right', () => {
  assert.match(css, /\[data-ai-chatweb-batch-toast="true"\]\s*\{[\s\S]*?position:\s*fixed[\s\S]*?right:[\s\S]*?bottom:[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.16\)[\s\S]*?backdrop-filter:\s*blur\(5px\)[\s\S]*?border-radius:\s*20px[\s\S]*?box-shadow:/);
  assert.match(css, /\[data-ai-chatweb-batch-toast="true"\]::before\s*\{[\s\S]*?linear-gradient/);
  assert.match(css, /\[data-ai-chatweb-batch-toast="true"\]::after\s*\{[\s\S]*?linear-gradient/);
});

test('toast is compact and vertically centers its message', () => {
  const block = css.match(/\[data-ai-chatweb-batch-toast="true"\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(block, /width:\s*min\(18rem,\s*calc\(100vw - 2\.5rem\)\)/);
  assert.match(block, /min-height:\s*2\.75rem/);
  assert.match(block, /padding:\s*0\.625rem\s+0\.875rem/);
  assert.match(block, /display:\s*flex/);
  assert.match(block, /align-items:\s*center/);
});

test('Claude dialog uses compact native-like panel and rectangular action buttons', () => {
  assert.match(css, /data-ai-chatweb-provider="claude"[\s\S]*?data-ai-chatweb-batch-dialog-panel="true"[\s\S]*?border-radius:\s*1rem[\s\S]*?padding:\s*1\.75rem\s+2rem/);
  assert.match(css, /data-ai-chatweb-provider="claude"[\s\S]*?data-ai-chatweb-batch-dialog-cancel="true"[\s\S]*?border-radius:\s*0\.75rem[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.12\)/);
  assert.match(css, /data-ai-chatweb-provider="claude"[\s\S]*?data-ai-chatweb-batch-dialog-confirm="true"\]\[data-action="delete"\][\s\S]*?background:\s*#d84a4a[\s\S]*?box-shadow:/);
});
