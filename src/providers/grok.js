(() => {
  'use strict';
  const dom = typeof module !== 'undefined' && module.exports ? require('../queue/dom.js') : globalThis.AiChatWebSupporter.queueDom;
  const COMPOSER_SELECTORS = ['div.ProseMirror[contenteditable="true"][role="textbox"]','div.tiptap.ProseMirror[contenteditable="true"]','textarea[aria-label="Ask Grok anything"]','textarea[data-testid="grok-compose-input"]','textarea[placeholder*="Grok" i]','div[contenteditable="true"][data-lexical-editor="true"]','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]','textarea'];
  const SEND_SELECTORS = ['button[data-testid="chat-submit"]','button[aria-label="Submit"]','button[aria-label="Send message"]','button[aria-label*="Send" i]','button[data-testid="send-button"]','button[data-testid*="submit" i]','button[type="submit"]'];
  const STOP_SELECTORS = ['button[aria-label="Stop"]','button[aria-label*="stop" i]','button[data-testid*="stop" i]'];
  const ATTACHMENT_SELECTOR = ['[data-testid*="attachment" i]','[data-testid*="file-preview" i]','button[aria-label*="Remove attachment" i]','button[aria-label*="Remove file" i]','button[aria-label*="Remove image" i]'].join(',');
  const REMOVE_ATTACHMENT_SELECTOR = ['button[aria-label*="Remove attachment" i]','button[aria-label*="Remove file" i]','button[aria-label*="Remove image" i]'].join(',');
  function parsedUrl(url) { try { return new URL(url, 'https://grok.com/'); } catch { return null; } }
  function matchesLocation(url) { return parsedUrl(url)?.hostname === 'grok.com'; }
  function extractConversationId(url) { const parsed=parsedUrl(url); const pathname=parsed?.pathname||String(url||''); const match=pathname.match(/(?:^|\/)c\/([^\/?#]+)/); if(!match?.[1])return null; try{return decodeURIComponent(match[1]);}catch{return match[1];} }
  function composerScope(composer) { return composer?.closest?.('form') || composer?.closest?.('[data-testid*="composer" i]') || composer?.parentElement || null; }
  function findComposer(doc=globalThis.document,win=globalThis.window) { return dom.firstVisible(doc,COMPOSER_SELECTORS,win); }
  function findSendButton(composer,doc=globalThis.document,win=globalThis.window) { return dom.firstVisible(composerScope(composer)||doc,SEND_SELECTORS,win); }
  function findStopButton(composer,doc=globalThis.document,win=globalThis.window) { const local=dom.firstVisible(composerScope(composer)||doc,STOP_SELECTORS,win); return local||dom.firstVisible(doc,STOP_SELECTORS,win); }
  function hasAttachments(composer,doc=globalThis.document) { const scope=composerScope(composer); if(scope?.querySelectorAll){for(const input of scope.querySelectorAll('input[type="file"]'))if(input?.files?.length)return true;if(scope.querySelector?.(ATTACHMENT_SELECTOR))return true;} return dom.selectedFiles(doc).length>0; }
  function getSelectedFiles(composer,doc=globalThis.document) { const scope=composerScope(composer); const local=dom.selectedFiles(scope); return local.length?local:dom.selectedFiles(doc); }
  function findFileInput(composer,doc=globalThis.document) { return dom.findFileInput(composerScope(composer),doc); }
  function attachFiles(composer,files,doc=globalThis.document,win=globalThis.window) { if(!Array.from(files||[]).length)return true; return dom.assignFilesToInput(findFileInput(composer,doc),files,win); }
  function clearAttachments(composer,doc=globalThis.document,win=globalThis.window) { const scope=composerScope(composer)||doc; let changed=false; for(const button of Array.from(scope?.querySelectorAll?.(REMOVE_ATTACHMENT_SELECTOR)||[])){button.click?.();changed=true;} const input=findFileInput(composer,doc); if(input?.files?.length)changed=dom.assignFilesToInput(input,[],win)||changed; else changed=dom.clearFileInputs(scope,win)||changed; return changed; }
  function queueAnchor(composer) { const scope=composerScope(composer); if(scope?.parentElement)return scope; return composer?.parentElement||null; }
  function themeContext(composer,doc=globalThis.document,win=globalThis.window) { return dom.themeContext(composerScope(composer)||composer||doc?.body,win); }
  function findConversationSection(doc=globalThis.document){for(const menu of Array.from(doc?.querySelectorAll?.('[data-sidebar="menu"]')||[])){if(menu?.querySelector?.('a[href*="/c/"]'))return menu?.closest?.('[data-sidebar="group"]')||menu;}return null;}
  function findConversationHeader(section){const menu=section?.matches?.('[data-sidebar="menu"]')?section:section?.querySelector?.('[data-sidebar="menu"]');return menu?.previousElementSibling||section?.querySelector?.(':scope > div')||null;}
  function listConversationRows(section){const menu=section?.matches?.('[data-sidebar="menu"]')?section:section?.querySelector?.('[data-sidebar="menu"]')||section;return Array.from(menu?.querySelectorAll?.('[data-sidebar="menu-item"]')||[]).filter((row)=>Boolean(getConversationAnchor(row)));}
  function getConversationAnchor(row){if(row?.matches?.('a[href*="/c/"]'))return row;return row?.querySelector?.('a[href*="/c/"]')||null;}
  function getConversationId(row){const anchor=getConversationAnchor(row);return extractConversationId(anchor?.getAttribute?.('href')||anchor?.href||'');}
  function getNativeButtonTemplate(section){const header=findConversationHeader(section);return header?.querySelector?.('button[data-slot="button"],button')||null;}
  function ensureBatchResponse(response,id){if(!response?.ok){const status=response?.status??'unknown';throw new Error(`Grok delete failed for ${id}: ${status}`);}return true;}
  async function deleteConversation(id,context={}){const fetchFn=context.fetch||globalThis.fetch;const response=await fetchFn(`/rest/app-chat/conversations/soft/${encodeURIComponent(id)}`,{method:'DELETE',credentials:'include'});return ensureBatchResponse(response,id);}
  const batch={supportsArchive:false,findConversationSection,findConversationHeader,listConversationRows,getConversationId,getConversationAnchor,getNativeButtonTemplate,deleteConversation};
  const api={id:'grok',matchesLocation,extractConversationId,findComposer,getComposerText:dom.getComposerText,setComposerText:dom.setComposerText,queueAnchor,findSendButton,findStopButton,hasAttachments,getSelectedFiles,findFileInput,attachFiles,clearAttachments,themeContext,batch};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof globalThis!=='undefined'){const namespace=globalThis.AiChatWebSupporter||={};const providers=namespace.providers||={};providers.grok=api;}
})();
