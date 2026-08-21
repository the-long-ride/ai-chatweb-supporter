(() => {
  'use strict';
  const dom = typeof module !== 'undefined' && module.exports ? require('../queue/dom.js') : globalThis.AiChatWebSupporter.queueDom;
  const COMPOSER_SELECTORS = ['div.ProseMirror[contenteditable="true"][role="textbox"]','div.tiptap.ProseMirror[contenteditable="true"]','textarea[aria-label="Ask Grok anything"]','textarea[data-testid="grok-compose-input"]','textarea[placeholder*="Grok" i]','div[contenteditable="true"][data-lexical-editor="true"]','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]','textarea'];
  const SEND_SELECTORS = ['button[data-testid="chat-submit"]','button[aria-label="Submit"]','button[aria-label="Send message"]','button[aria-label*="Send" i]','button[data-testid="send-button"]','button[data-testid*="submit" i]','button[type="submit"]'];
  const STOP_SELECTORS = ['button[aria-label="Stop"]','button[aria-label*="stop" i]','button[data-testid*="stop" i]'];
  const ATTACHMENT_SELECTOR = ['[data-testid*="attachment" i]','[data-testid*="file-preview" i]','button[aria-label*="Remove attachment" i]','button[aria-label*="Remove file" i]','button[aria-label*="Remove image" i]'].join(',');
  function parsedUrl(url){try{return new URL(url,'https://grok.com/');}catch{return null;}}
  function matchesLocation(url){return parsedUrl(url)?.hostname==='grok.com';}
  function extractConversationId(url){const parsed=parsedUrl(url);const pathname=parsed?.pathname||String(url||'');const match=pathname.match(/(?:^|\/)c\/([^/?#]+)/);if(!match?.[1])return null;try{return decodeURIComponent(match[1]);}catch{return match[1];}}
  function composerScope(composer){return composer?.closest?.('form')||composer?.closest?.('[data-testid*="composer" i]')||composer?.parentElement||null;}
  function findComposer(doc=globalThis.document,win=globalThis.window){return dom.firstVisible(doc,COMPOSER_SELECTORS,win);}
  function findSendButton(composer,doc=globalThis.document,win=globalThis.window){return dom.firstVisible(composerScope(composer)||doc,SEND_SELECTORS,win);}
  function findStopButton(composer,doc=globalThis.document,win=globalThis.window){const local=dom.firstVisible(composerScope(composer)||doc,STOP_SELECTORS,win);return local||dom.firstVisible(doc,STOP_SELECTORS,win);}
  function hasAttachments(composer){const scope=composerScope(composer);if(!scope?.querySelectorAll)return false;for(const input of scope.querySelectorAll('input[type="file"]'))if(input?.files?.length)return true;return Boolean(scope.querySelector?.(ATTACHMENT_SELECTOR));}
  function queueAnchor(composer){const scope=composerScope(composer);if(scope?.parentElement)return scope;return composer?.parentElement||null;}
  function themeContext(composer,doc=globalThis.document,win=globalThis.window){return dom.themeContext(composerScope(composer)||composer||doc?.body,win);}
  const api={id:'grok',matchesLocation,extractConversationId,findComposer,getComposerText:dom.getComposerText,setComposerText:dom.setComposerText,queueAnchor,findSendButton,findStopButton,hasAttachments,themeContext};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof globalThis!=='undefined'){const namespace=globalThis.AiChatWebSupporter||={};const providers=namespace.providers||={};providers.grok=api;}
})();
