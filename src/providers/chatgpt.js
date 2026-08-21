(() => {
  'use strict';
  const dom = typeof module !== 'undefined' && module.exports ? require('../queue/dom.js') : globalThis.AiChatWebSupporter.queueDom;
  const COMPOSER_SELECTORS = ['#prompt-textarea','textarea[data-testid="prompt-textarea"]','div[contenteditable="true"][data-virtualkeyboard="true"]','form div[contenteditable="true"]'];
  const SEND_SELECTORS = ['button[data-testid="send-button"]','button[aria-label="Send prompt"]','button[type="submit"]'];
  const STOP_SELECTORS = ['button[data-testid="stop-button"]','button[aria-label*="Stop generating" i]','button[aria-label*="Stop streaming" i]'];
  const ATTACHMENT_SELECTOR = ['[data-testid*="attachment" i]','[data-testid*="file-preview" i]','[data-testid*="file-thumbnail" i]','button[aria-label*="Remove attachment" i]','button[aria-label*="Remove file" i]'].join(',');
  function parsedUrl(url) { try { return new URL(url, 'https://chatgpt.com/'); } catch { return null; } }
  function matchesLocation(url) { return parsedUrl(url)?.hostname === 'chatgpt.com'; }
  function extractConversationId(url) { const parsed=parsedUrl(url); const pathname=parsed?.pathname||String(url||''); const match=pathname.match(/(?:^|\/)c\/([^/?#]+)/); if(!match?.[1]) return null; try{return decodeURIComponent(match[1]);}catch{return match[1];} }
  function composerScope(composer) { return composer?.closest?.('form') || composer?.closest?.('[data-type="unified-composer"]') || composer?.parentElement || null; }
  function findComposer(doc=globalThis.document,win=globalThis.window){return dom.firstVisible(doc,COMPOSER_SELECTORS,win);}
  function findSendButton(composer,doc=globalThis.document,win=globalThis.window){return dom.firstVisible(composerScope(composer)||doc,SEND_SELECTORS,win);}
  function findStopButton(composer,doc=globalThis.document,win=globalThis.window){const local=dom.firstVisible(composerScope(composer)||doc,STOP_SELECTORS,win);return local||dom.firstVisible(doc,STOP_SELECTORS,win);}
  function hasAttachments(composer){const scope=composerScope(composer);if(!scope?.querySelectorAll)return false;for(const input of scope.querySelectorAll('input[type="file"]'))if(input?.files?.length)return true;return Boolean(scope.querySelector?.(ATTACHMENT_SELECTOR));}
  function queueAnchor(composer){const form=composer?.closest?.('form');if(form?.parentElement)return form;const shell=composer?.closest?.('[data-type="unified-composer"]');if(shell?.parentElement)return shell;return composer?.parentElement||null;}
  function themeContext(composer, doc=globalThis.document, win=globalThis.window){return dom.themeContext(composerScope(composer)||composer||doc?.body,win);}
  const api={id:'chatgpt',matchesLocation,extractConversationId,findComposer,getComposerText:dom.getComposerText,setComposerText:dom.setComposerText,queueAnchor,findSendButton,findStopButton,hasAttachments,themeContext};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;if(typeof globalThis!=='undefined'){const namespace=globalThis.AiChatWebSupporter||={};const providers=namespace.providers||={};providers.chatgpt=api;}
})();
