(() => {
  'use strict';
  function providerList() { if (typeof module !== 'undefined' && module.exports) return [require('./chatgpt.js'), require('./claude.js'), require('./grok.js')]; return Object.values(globalThis.AiChatWebSupporter?.providers || {}); }
  function getProvider(url){for(const provider of providerList())if(provider?.matchesLocation?.(url))return provider;return null;}
  const api={getProvider};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(typeof globalThis!=='undefined')(globalThis.AiChatWebSupporter||={}).providerRegistry=api;
})();
