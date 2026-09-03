(() => {
  'use strict';
  const dom = typeof module !== 'undefined' && module.exports ? require('../queue/dom.js') : globalThis.AiChatWebSupporter.queueDom;
  const COMPOSER_SELECTORS = ['div.ProseMirror[contenteditable="true"]','.ProseMirror[contenteditable="true"]','div[contenteditable="true"][data-placeholder]','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]'];
  const SEND_SELECTORS = ['button[data-testid="send-button"]','button[aria-label="Send message"]','button[aria-label="Send Message"]','button[aria-label*="Send message" i]','button[type="submit"]'];
  const STOP_SELECTORS = ['button[aria-label="Stop response"]','button[aria-label="Stop Response"]','button[aria-label*="Stop response" i]','button[data-testid="stop-button"]'];
  const ATTACHMENT_SELECTOR = ['[data-testid*="attachment" i]','[data-testid*="file-preview" i]','button[aria-label*="Remove attachment" i]','button[aria-label*="Remove file" i]','button[aria-label*="Remove image" i]'].join(',');
  const REMOVE_ATTACHMENT_SELECTOR = ['button[aria-label*="Remove attachment" i]','button[aria-label*="Remove file" i]','button[aria-label*="Remove image" i]'].join(',');
  function parsedUrl(url) { try { return new URL(url, 'https://claude.ai/'); } catch { return null; } }
  function matchesLocation(url) { return parsedUrl(url)?.hostname === 'claude.ai'; }
  function extractConversationId(url) { const parsed=parsedUrl(url); const pathname=parsed?.pathname||String(url||''); const match=pathname.match(/(?:^|\/)chat\/([^\/?#]+)/); if(!match?.[1])return null; try{return decodeURIComponent(match[1]);}catch{return match[1];} }
  function composerScope(composer) { return composer?.closest?.('form') || composer?.closest?.('fieldset') || composer?.closest?.('[data-testid*="composer" i]') || composer?.parentElement || null; }
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
  function findConversationSection(doc=globalThis.document){return doc?.querySelector?.('[data-testid="sidebar-recents"]')||null;}
  function findConversationHeader(section){return section?.querySelector?.('[data-row-key="label:recents"] [data-sidebar-group-label]')||section?.querySelector?.('[data-row-key="label:recents"]')||null;}
  function listConversationRows(section){return Array.from(section?.querySelectorAll?.('[data-row-key^="chat:"]')||[]);}
  function getConversationAnchor(row){return row?.querySelector?.('a[data-row-main-button][href*="/chat/"],a[href*="/chat/"]')||null;}
  function getConversationId(row){const key=String(row?.getAttribute?.('data-row-key')||'');if(key.startsWith('chat:')&&key.length>5)return key.slice(5);const anchor=getConversationAnchor(row);return extractConversationId(anchor?.getAttribute?.('href')||anchor?.href||'');}
  function getNativeButtonTemplate(section){const header=findConversationHeader(section);return header?.querySelector?.('button[data-cds-icon-only],button[data-row-action]')||null;}
  function cookieValue(doc,name){const text=String(doc?.cookie||'');for(const part of text.split(';')){const [key,...rest]=part.trim().split('=');if(key===name){try{return decodeURIComponent(rest.join('='));}catch{return rest.join('=');}}}return null;}
  async function resolveOrganizationId(context={}){
    if(context.organizationId)return String(context.organizationId);
    if(typeof context.resolveOrganizationId==='function'){const resolved=await context.resolveOrganizationId(context);if(resolved)return String(resolved);}
    const doc=context.document||globalThis.document;
    const fromCookie=cookieValue(doc,'lastActiveOrg');if(fromCookie)return fromCookie;
    const win=context.window||globalThis.window;
    const fromStorage=win?.localStorage?.getItem?.('lastActiveOrg');if(fromStorage)return fromStorage;
    const node=doc?.querySelector?.('[data-organization-id],[data-org-id]');const fromDom=node?.getAttribute?.('data-organization-id')||node?.getAttribute?.('data-org-id');if(fromDom)return fromDom;
    throw new Error('Claude active organization could not be resolved');
  }
  function ensureBatchResponse(response,id){if(!response?.ok){const status=response?.status??'unknown';throw new Error(`Claude delete failed for ${id}: ${status}`);}return true;}
  async function deleteConversation(id,context={}){const fetchFn=context.fetch||globalThis.fetch;const organizationId=await resolveOrganizationId(context);const response=await fetchFn(`/api/organizations/${encodeURIComponent(organizationId)}/chat_conversations/${encodeURIComponent(id)}`,{method:'DELETE',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({uuid:id})});return ensureBatchResponse(response,id);}
  const batch={supportsArchive:false,findConversationSection,findConversationHeader,listConversationRows,getConversationId,getConversationAnchor,getNativeButtonTemplate,resolveOrganizationId,deleteConversation};
  const api={id:'claude',matchesLocation,extractConversationId,findComposer,getComposerText:dom.getComposerText,setComposerText:dom.setComposerText,queueAnchor,findSendButton,findStopButton,hasAttachments,getSelectedFiles,findFileInput,attachFiles,clearAttachments,themeContext,batch};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof globalThis!=='undefined'){const namespace=globalThis.AiChatWebSupporter||={};const providers=namespace.providers||={};providers.claude=api;}
})();
