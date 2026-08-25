(() => {
  'use strict';

  const REPOSITORY = 'the-long-ride/ai-chatweb-supporter';
  const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;

  function normalizeVersion(value) {
    const match = String(value || '').trim().match(/^v?(\d+(?:\.\d+)*)$/i);
    if (!match) return null;
    return match[1].split('.').map((segment) => Number(segment));
  }

  function compareVersions(left, right) {
    const a = normalizeVersion(left);
    const b = normalizeVersion(right);
    if (!a || !b) return null;
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const av = a[index] || 0;
      const bv = b[index] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  function sourceZipUrl(tag) {
    return `https://github.com/${REPOSITORY}/archive/refs/tags/${encodeURIComponent(tag)}.zip`;
  }

  function releaseUpdate(currentVersion, release) {
    if (!release || release.draft || release.prerelease) return null;
    const tag = typeof release.tag_name === 'string' ? release.tag_name.trim() : '';
    const version = normalizeVersion(tag);
    if (!version || compareVersions(tag, currentVersion) !== 1) return null;
    return { version: version.join('.'), tag, downloadUrl: sourceZipUrl(tag) };
  }

  const api = { REPOSITORY, LATEST_RELEASE_URL, normalizeVersion, compareVersions, sourceZipUrl, releaseUpdate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') (globalThis.AiChatWebSupporter ||= {}).popupUpdate = api;
})();
