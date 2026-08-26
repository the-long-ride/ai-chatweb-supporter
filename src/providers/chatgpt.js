(() => {
  'use strict';
  const dom = typeof module !== 'undefined' && module.exports ? require('../queue/dom.js') : globalThis.AiChatWebSupporter.queueDom;
  const COMPOSER_SELECTORS = ['#prompt-textarea','textarea[data-testid="prompt-textarea"]','div[contenteditable="true"][data-virtualkeyboard="true"]','form div[contenteditable="true"]'];
  const SEND_SELECTORS = ['button[data-testid="send-button"]','button[aria-label="Send prompt"]','button[type="submit"]'];
  const STOP_SELECTORS = ['button[data-testid="stop-button"]','button[aria-label*="Stop generating" i]','button[aria-label*="Stop streaming" i]'];
  const ATTACHMENT_SELECTOR = ['[data-testid*="attachment" i]','[data-testid*="file-preview" i]','[data-testid*="file-thumbnail" i]','button[aria-label*="Remove attachment" i]','button[aria-label*="Remove file" i]','button[aria-label*="Remove image" i]'].join(',');
  const REMOVE_ATTACHMENT_SELECTOR = ['button[aria-label*="Remove attachment" i]','button[aria-label*="Remove file" i]','button[aria-label*="Remove image" i]'].join(',');
  const STREAM_ERROR_BUTTON_SELECTOR = 'button[data-testid="regenerate-thread-error-button"]';
  const STREAM_ERROR_CONTAINER_SELECTORS = ['div.text-token-text-error','[class*="text-token-text-error"]'];
  const STREAM_ERROR_TEXT = 'Error in message stream';
  const STREAM_ERROR_CONTINUATION = 'continue remaining works';
  const handledStreamErrors = new WeakSet();
  function parsedUrl(url) { try { return new URL(url, 'https://chatgpt.com/'); } catch { return null; } }
  function matchesLocation(url) { return parsedUrl(url)?.hostname === 'chatgpt.com'; }
  function extractConversationId(url) { const parsed=parsedUrl(url); const pathname=parsed?.pathname||String(url||''); const match=pathname.match(/(?:^|\/)c\/([^\/?#]+)/); if(!match?.[1])return null; try{return decodeURIComponent(match[1]);}catch{return match[1];} }
  function composerScope(composer) { return composer?.closest?.('form') || composer?.closest?.('[data-type="unified-composer"]') || composer?.parentElement || null; }
  function findComposer(doc=globalThis.document,win=globalThis.window) { return dom.firstVisible(doc,COMPOSER_SELECTORS,win); }
  function findSendButton(composer,doc=globalThis.document,win=globalThis.window) { return dom.firstVisible(composerScope(composer)||doc,SEND_SELECTORS,win); }
  function findStopButton(composer,doc=globalThis.document,win=globalThis.window) { const local=dom.firstVisible(composerScope(composer)||doc,STOP_SELECTORS,win); return local||dom.firstVisible(doc,STOP_SELECTORS,win); }
  function hasAttachments(composer,doc=globalThis.document) { const scope=composerScope(composer); if(scope?.querySelectorAll){for(const input of scope.querySelectorAll('input[type="file"]'))if(input?.files?.length)return true;if(scope.querySelector?.(ATTACHMENT_SELECTOR))return true;} return dom.selectedFiles(doc).length>0; }
  function getSelectedFiles(composer,doc=globalThis.document) { const scope=composerScope(composer); const local=dom.selectedFiles(scope); return local.length?local:dom.selectedFiles(doc); }
  function findFileInput(composer,doc=globalThis.document) { return dom.findFileInput(composerScope(composer),doc); }
  function attachFiles(composer,files,doc=globalThis.document,win=globalThis.window) { if(!Array.from(files||[]).length)return true; return dom.assignFilesToInput(findFileInput(composer,doc),files,win); }
  function clearAttachments(composer,doc=globalThis.document,win=globalThis.window) { const scope=composerScope(composer)||doc; let changed=false; for(const button of Array.from(scope?.querySelectorAll?.(REMOVE_ATTACHMENT_SELECTOR)||[])){button.click?.();changed=true;} const input=findFileInput(composer,doc); if(input?.files?.length)changed=dom.assignFilesToInput(input,[],win)||changed; else changed=dom.clearFileInputs(scope,win)||changed; return changed; }
  function queueAnchor(composer) { const form=composer?.closest?.('form'); if(form?.parentElement)return form; const shell=composer?.closest?.('[data-type="unified-composer"]'); if(shell?.parentElement)return shell; return composer?.parentElement||null; }
  function themeContext(composer,doc=globalThis.document,win=globalThis.window) { return dom.themeContext(composerScope(composer)||composer||doc?.body,win); }
  function findStreamError(doc=globalThis.document,win=globalThis.window) {
    const retry = dom.firstVisible(doc,[STREAM_ERROR_BUTTON_SELECTOR],win);
    if(retry)return retry.closest?.('.text-token-text-error')||retry;
    for(const selector of STREAM_ERROR_CONTAINER_SELECTORS){
      for(const element of Array.from(doc?.querySelectorAll?.(selector)||[])){
        if(String(element.textContent||'').includes(STREAM_ERROR_TEXT)&&dom.isElementVisible(element,win))return element;
      }
    }
    return null;
  }
  function maybeFillStreamErrorContinuation(composer,doc=globalThis.document,win=globalThis.window) {
    const error = findStreamError(doc,win);
    if(!error||handledStreamErrors.has(error))return false;
    const target = composer||findComposer(doc,win);
    if(!target||dom.getComposerText(target).trim())return false;
    if(!dom.setComposerText(target,STREAM_ERROR_CONTINUATION))return false;
    handledStreamErrors.add(error);
    return true;
  }
  const api={id:'chatgpt',matchesLocation,extractConversationId,findComposer,getComposerText:dom.getComposerText,setComposerText:dom.setComposerText,queueAnchor,findSendButton,findStopButton,hasAttachments,getSelectedFiles,findFileInput,attachFiles,clearAttachments,themeContext,findStreamError,maybeFillStreamErrorContinuation};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof globalThis!=='undefined'){const namespace=globalThis.AiChatWebSupporter||={};const providers=namespace.providers||={};providers.chatgpt=api;}
})();
