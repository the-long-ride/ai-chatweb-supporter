const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '../src/batch/styles.css'), 'utf8');

test('batch header actions defer general visual styling to copied native ChatGPT classes', () => {
  const directRule = css.match(/\[data-ai-chatweb-batch-controls="true"\]\s*>\s*\[data-ai-chatweb-batch-control="true"\]\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.doesNotMatch(directRule, /padding:/);
  assert.doesNotMatch(directRule, /border-radius:/);
  assert.doesNotMatch(directRule, /background:/);
  assert.doesNotMatch(directRule, /transform:/);
});

test('ChatGPT batch controls participate directly in the native header flex layout', () => {
  assert.match(
    css,
    /\[data-ai-chatweb-batch-controls="true"\]\[data-ai-chatweb-provider="chatgpt"\]\s*\{[\s\S]*?display:\s*contents/
  );
});

test('ChatGPT batch actions use a native-sized symmetric hit area', () => {
  assert.match(
    css,
    /\[data-ai-chatweb-batch-controls="true"\]\[data-ai-chatweb-provider="chatgpt"\]\s+\[data-ai-chatweb-batch-control="true"\]\s*\{[\s\S]*?min-width:\s*2rem[\s\S]*?min-height:\s*2rem[\s\S]*?padding-inline:\s*0\.4375rem\s*!important[\s\S]*?display:\s*inline-flex[\s\S]*?align-items:\s*center[\s\S]*?justify-content:\s*center/
  );
  assert.match(
    css,
    /\[data-ai-chatweb-batch-controls="true"\]\[data-ai-chatweb-provider="chatgpt"\]\s+\[data-ai-chatweb-batch-control="true"\]\s+svg\s*\{[\s\S]*?width:\s*1\.1875rem[\s\S]*?height:\s*1\.1875rem/
  );
});

test('batch icon SVGs cannot steal pointer interaction from native buttons', () => {
  assert.match(
    css,
    /\[data-ai-chatweb-batch-control="true"\]\s+svg\s*\{[\s\S]*?pointer-events:\s*none/
  );
});

test('ChatGPT and Claude confirmation dialogs are forced to the viewport center', () => {
  assert.match(
    css,
    /\[data-ai-chatweb-batch-dialog="true"\]\[data-ai-chatweb-provider="chatgpt"\]\[open\][\s\S]*?,\s*\[data-ai-chatweb-batch-dialog="true"\]\[data-ai-chatweb-provider="claude"\]\[open\]\s*\{[\s\S]*?position:\s*fixed\s*!important[\s\S]*?inset:\s*0\s*!important[\s\S]*?width:\s*100dvw\s*!important[\s\S]*?height:\s*100dvh\s*!important[\s\S]*?display:\s*grid\s*!important[\s\S]*?place-items:\s*center\s*!important/
  );
});

test('custom rounded confirmation styling is scoped to ChatGPT and Claude, not Grok', () => {
  assert.match(
    css,
    /\[data-ai-chatweb-batch-dialog="true"\]\[data-ai-chatweb-provider="chatgpt"\][\s\S]*?,\s*\[data-ai-chatweb-batch-dialog="true"\]\[data-ai-chatweb-provider="claude"\][\s\S]*?::backdrop/
  );
  assert.match(css, /data-ai-chatweb-provider="chatgpt"[\s\S]*data-ai-chatweb-batch-dialog-panel/);
  assert.match(css, /data-ai-chatweb-provider="claude"[\s\S]*data-ai-chatweb-batch-dialog-panel/);
  assert.doesNotMatch(css, /data-ai-chatweb-provider="grok"[^\n]*data-ai-chatweb-batch-dialog-panel/);
  assert.doesNotMatch(css, /data-ai-chatweb-provider="grok"[^\n]*data-ai-chatweb-batch-dialog-confirm/);
});
