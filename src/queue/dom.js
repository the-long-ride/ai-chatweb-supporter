(() => {
  'use strict';
  function getComposerText(composer){if(!composer)return'';const tagName=String(composer.tagName||'').toUpperCase();if(tagName==='TEXTAREA'||tagName==='INPUT')return typeof composer.value==='string'?composer.value:'';if(composer.isContentEditable)return typeof composer.innerText==='string'?composer.innerText:String(composer.textContent||'');return String(composer.textContent||'');}
  function isElementVisible(element,win=globalThis.window){if(!element||element.isConnected===false||!element.getBoundingClientRect)return false;const rect=element.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return false;const style=win?.getComputedStyle?win.getComputedStyle(element):null;return!style||(style.display!=='none'&&style.visibility!=='hidden');}
  function isButtonReady(button,win=globalThis.window){if(!isElementVisible(button,win)||button.disabled)return false;if(button.getAttribute?.('aria-disabled')==='true')return false;const style=win?.getComputedStyle?win.getComputedStyle(button):null;return!style||style.pointerEvents!=='none';}
  function firstVisible(scope,selectors,win=globalThis.window){if(!scope?.querySelectorAll)return null;for(const selector of selectors){for(const element of scope.querySelectorAll(selector)){if(element.closest?.('[data-cgpt-queue-ui="true"]'))continue;if(isElementVisible(element,win))return element;}}return null;}
  function themeContext(element,win=globalThis.window){const style=element&&win?.getComputedStyle?win.getComputedStyle(element):null;return{color:style?.color||'',background:style?.backgroundColor||'',borderColor:style?.borderColor||'',borderRadius:style?.borderRadius||'',fontFamily:style?.fontFamily||'',colorScheme:style?.colorScheme||''};}
  function classifySendAttempt({busy,composerText,queuedText,sendReady}){if(busy)return'accepted';const current=String(composerText??'').trim();const queued=String(queuedText??'').trim();if(!current&&!sendReady)return'accepted';if(current&&current!==queued)return'interrupted';return'pending';}
  function canPrepareQueuedSend({busy,composerText,hasAttachments}){return!busy&&!String(composerText??'').trim()&&!hasAttachments;}

  function fileInputs(scope) {
    return scope?.querySelectorAll ? Array.from(scope.querySelectorAll('input[type="file"]')) : [];
  }
  function selectedFiles(scope) {
    const result = [];
    const seen = new Set();
    for (const input of fileInputs(scope)) {
      for (const file of Array.from(input?.files || [])) {
        if (seen.has(file)) continue;
        seen.add(file);
        result.push(file);
      }
    }
    return result;
  }
  function findFileInput(scope, doc = globalThis.document) {
    return scope?.querySelector?.('input[type="file"]') || doc?.querySelector?.('input[type="file"]') || null;
  }
  function assignFilesToInput(input, files, win = globalThis.window) {
    if (!input || typeof win?.DataTransfer !== 'function') return false;
    const transfer = new win.DataTransfer();
    for (const file of Array.from(files || [])) transfer.items.add(file);
    try { input.files = transfer.files; } catch { return false; }
    const EventCtor = win?.Event || globalThis.Event;
    input.dispatchEvent?.(new EventCtor('change', { bubbles:true }));
    return true;
  }
  function clearFileInputs(scope, win = globalThis.window) {
    let changed = false;
    for (const input of fileInputs(scope)) changed = assignFilesToInput(input, [], win) || changed;
    return changed;
  }

  function setComposerText(composer,text){if(!composer)return false;const next=String(text??'');const tagName=String(composer.tagName||'').toUpperCase();if(tagName==='TEXTAREA'||tagName==='INPUT'){const proto=Object.getPrototypeOf(composer);const descriptor=proto&&Object.getOwnPropertyDescriptor(proto,'value');if(descriptor?.set)descriptor.set.call(composer,next);else composer.value=next;}else{const doc=composer.ownerDocument;const view=doc?.defaultView||globalThis.window;let inserted=false;if(doc?.execCommand&&view?.getSelection&&composer.focus){try{composer.focus();const selection=view.getSelection();const range=doc.createRange();range.selectNodeContents(composer);selection.removeAllRanges();selection.addRange(range);inserted=doc.execCommand('insertText',false,next);}catch{inserted=false;}}if(inserted)return true;composer.textContent=next;}const view=composer.ownerDocument?.defaultView||globalThis.window;let event;try{const InputEventCtor=view?.InputEvent||view?.Event;event=new InputEventCtor('input',{bubbles:true,inputType:next?'insertText':'deleteContentBackward',data:next||null});}catch{event=new(view?.Event||Event)('input',{bubbles:true});}composer.dispatchEvent?.(event);return true;}
  const api={getComposerText,setComposerText,isElementVisible,isButtonReady,firstVisible,themeContext,classifySendAttempt,canPrepareQueuedSend,fileInputs,selectedFiles,findFileInput,assignFilesToInput,clearFileInputs};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;if(typeof globalThis!=='undefined')(globalThis.AiChatWebSupporter||={}).queueDom=api;
})();
