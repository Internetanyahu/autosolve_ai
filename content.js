// AutoSolve AI passive content helper.
// Extracts rendered page text/dropdowns, adjusts video playback, and supports explicit manual Next only.
(() => {
  const clean = value => String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' && Number(style.opacity) !== 0 &&
      element.getClientRects().length > 0;
  }

  function extractPageQuestionAndChoices() {
    if (!document.body) return { source: 'visible_page_text_and_dropdowns', text: '' };
    const selection = clean(window.getSelection?.()?.toString());
    if (selection.length > 8) return { source: 'user_selection', text: selection };
    const parts = [clean(document.body.innerText || '')].filter(Boolean);
    const dropdowns = [];
    const controls = Array.from(document.querySelectorAll('select,[role="combobox"],[aria-haspopup="listbox"]'));
    controls.forEach((element, index) => {
      if (!isVisible(element)) return;
      const labelElement = element.labels?.[0] || element.closest('label') ||
        (element.id ? document.querySelector('label[for="' + CSS.escape(element.id) + '"]') : null);
      const label = clean(labelElement?.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('name') || '');
      let options = [];
      if (element.tagName === 'SELECT') {
        options = Array.from(element.options).map(option => clean(option.textContent)).filter(Boolean);
      } else {
        const listId = element.getAttribute('aria-controls') || element.getAttribute('aria-owns');
        const list = listId ? document.getElementById(listId) : null;
        const scope = list && isVisible(list) ? list : element.parentElement;
        options = Array.from(scope?.querySelectorAll('[role="option"]') || []).filter(isVisible)
          .map(option => clean(option.innerText || option.textContent)).filter(Boolean);
      }
      const current = element.tagName === 'SELECT' ? clean(element.selectedOptions?.[0]?.textContent || '') :
        clean(element.getAttribute('aria-valuetext') || element.getAttribute('aria-label') || '');
      const description = [
        'Dropdown ' + (index + 1) + (label ? ' (' + label + ')' : ''),
        current ? 'Selected: ' + current : '',
        options.length ? 'Options: ' + options.join(' | ') : ''
      ].filter(Boolean).join('\n');
      if (description) dropdowns.push(description);
    });
    if (dropdowns.length) parts.push('=== DROPDOWNS ===\n' + dropdowns.join('\n\n'));
    return { source: 'visible_page_text_and_dropdowns', text: clean(parts.join('\n\n')) };
  }

  function setVideoBoost(enabled, speed = 16) {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return { success: false, count: 0 };
    videos.forEach(video => { video.playbackRate = enabled ? speed : 1; });
    return { success: true, count: videos.length };
  }

  window.__AUTOSOLVE_GRAB_CONTENT__ = extractPageQuestionAndChoices;
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GRAB_PAGE_CONTENT' || request.action === 'AUTO_COPY_PAGE') {
      try {
        const extracted = extractPageQuestionAndChoices();
        if (extracted.text) navigator.clipboard?.writeText(extracted.text).catch(() => {});
        sendResponse({ success: true, ...extracted });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
    if (request.action === 'SET_VIDEO_BOOST') {
      try {
        sendResponse(setVideoBoost(Boolean(request.enabled), Math.min(16, Math.max(1, Number(request.speed) || 16))));
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
    if (request.action === 'PING') {
      sendResponse({ status: 'alive', injected: true });
      return true;
    }
  });
})();
