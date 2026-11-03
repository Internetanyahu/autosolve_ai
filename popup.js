document.addEventListener('DOMContentLoaded', async () => {
  // Provider & Key controls
  const selectAiProvider = document.getElementById('select-ai-provider');
  const inputApiKey = document.getElementById('input-api-key');
  const btnToggleKey = document.getElementById('btn-toggle-key');
  const btnSaveKey = document.getElementById('btn-save-key');
  const statusBadge = document.getElementById('api-status');

  // Open the persistent native Chrome side panel. No pop-out window is created.
  const btnSidepanel = document.getElementById('btn-sidepanel');
  if (btnSidepanel) {
    btnSidepanel.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.windowId) throw new Error('No active browser window found.');
        await chrome.sidePanel.open({ windowId: tab.windowId });
        appendLog('INFO', 'AutoSolve AI opened in the Chrome side panel.');
      } catch (error) {
        appendLog('ERROR', 'Could not open Chrome side panel: ' + error.message);
      }
    });
  }

  // Text Mode controls
  const textQuestionInput = document.getElementById('text-question-input');
  const btnSolveText = document.getElementById('btn-solve-text');
  const btnPasteClipboard = document.getElementById('btn-paste-clipboard');
  const btnClearText = document.getElementById('btn-clear-text');
  // Common controls
  const consoleBox = document.getElementById('console-box');
  const btnClear = document.getElementById('btn-clear');
  const btnOptions = document.getElementById('btn-options');

  // Attach Settings immediately so unrelated popup initialization cannot disable it.
  if (btnOptions) {
    btnOptions.addEventListener('click', (event) => {
      event.preventDefault();
      const optionsUrl = chrome.runtime.getURL('options.html');
      try {
        chrome.runtime.openOptionsPage(() => {
          if (chrome.runtime.lastError) {
            chrome.tabs.create({ url: optionsUrl });
          }
        });
      } catch (error) {
        chrome.tabs.create({ url: optionsUrl });
      }
    });
  }

  const keyStorageMap = { gemini: 'geminiApiKey' };
  const keyPlaceholderMap = { gemini: 'AIzaSy...' };

  const MAX_STORED_LOGS = 150;

  function removeAccessibilityCredits(value) {
  return String(value || '').replace(
    /Credits\\?[\s\S]*?trash icon in the highlighter menu to delete it\.?\\?\s*EN\\?/i,
    ''
  );
}


  function appendLog(level, msg, saveToStorage = true) {
    const time = new Date().toLocaleTimeString();
    const d = document.createElement('div');
    d.className = `log-item log-${level || 'INFO'}`;
    d.textContent = `[${time}] ${msg}`;
    consoleBox.appendChild(d);
    consoleBox.scrollTop = consoleBox.scrollHeight;

    if (saveToStorage) {
      try {
        chrome.storage.local.get(['recentConsoleLogs'], (res) => {
          const logs = res.recentConsoleLogs || [];
          logs.push({ level: level || 'INFO', message: msg, time });
          if (logs.length > MAX_STORED_LOGS) {
            logs.splice(0, logs.length - MAX_STORED_LOGS);
          }
          chrome.storage.local.set({ recentConsoleLogs: logs }).catch(() => {});
        });
      } catch {}
    }
  }

  // BIG GREEN ANSWER BANNER (Prominent, High-Visibility, End of Solution)
  function renderBigGreenAnswer(answers, dropdowns = [], saveToStorage = true, rawText = '') {
    const box = document.createElement('div');
    box.className = 'big-answer-box';

    let itemsHtml = '';
    if (Array.isArray(answers) && answers.length > 0) {
      itemsHtml = answers
        .map((ans) => {
          const num = ans.number || 1;
          const letter = ans.letter ? `(${ans.letter}) ` : '';
          const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
          })[char]);
          const question = ans.question
            ? `<div class="big-answer-sub">Question [${num}]: ${escapeHtml(ans.question)}</div>`
            : '';
          const analysis = ans.analysis
            ? `<div class="big-answer-sub"><strong>Question [${num}] Analysis:</strong> ${escapeHtml(ans.analysis)}</div>`
            : '';
          const finalAnswer = `<div class="big-answer-main"><strong>FINAL ANSWER:</strong> ${letter}${escapeHtml(ans.text)}</div>`;
          return `${question}${analysis}${finalAnswer}`;
        })
        .join('');
    } else if (rawText) {
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[char]);
      itemsHtml = `<div class="big-answer-main" style="white-space:pre-wrap">${escapeHtml(rawText)}</div>`;
    } else {
      itemsHtml = `<div class="big-answer-main">No answer was returned by the API.</div>`;
    }

    let dropdownsHtml = '';
    if (Array.isArray(dropdowns) && dropdowns.length > 0) {
      dropdownsHtml = dropdowns
        .map((dd, idx) => {
          return `<div class="big-answer-sub">Dropdown [${dd.menuNumber || idx + 1}]: Pick Option [${dd.selectedNumber || 1}] "${dd.selectedAnswer}"</div>`;
        })
        .join('');
    }

    box.innerHTML = `
      <div class="big-answer-tag">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>CORRECT ANSWER</span>
      </div>
      ${itemsHtml}
      ${dropdownsHtml}
    `;

    consoleBox.appendChild(box);
    consoleBox.scrollTop = consoleBox.scrollHeight;

    if (saveToStorage) {
      try {
        chrome.storage.local.get(['recentConsoleLogs'], (res) => {
          const logs = res.recentConsoleLogs || [];
          logs.push({
            level: 'BIG_ANSWER',
            answers,
            dropdowns,
            rawText,
            time: new Date().toLocaleTimeString(),
            message: `CORRECT ANSWER: ${answers.map((a) => `[${a.number}] (${a.letter || ''}) "${a.text}"`).join(', ')}`,
          });
          if (logs.length > MAX_STORED_LOGS) logs.splice(0, logs.length - MAX_STORED_LOGS);
          chrome.storage.local.set({ recentConsoleLogs: logs }).catch(() => {});
        });
      } catch {}
    }
  }

  function loadSavedLogs() {
    chrome.storage.local.get(['recentConsoleLogs'], (res) => {
      const logs = res.recentConsoleLogs;
      if (Array.isArray(logs) && logs.length > 0) {
        consoleBox.innerHTML = '';
        logs.forEach((item) => {
          if (item.level === 'BIG_ANSWER' && Array.isArray(item.answers)) {
            renderBigGreenAnswer(item.answers, item.dropdowns || [], false, item.rawText || '');
          } else {
            const d = document.createElement('div');
            d.className = `log-item log-${item.level || 'INFO'}`;
            d.textContent = `[${item.time || ''}] ${item.message}`;
            consoleBox.appendChild(d);
          }
        });
        consoleBox.scrollTop = consoleBox.scrollHeight;
      }
    });
  }

  // Load and retain console logs when user re-opens popup
  loadSavedLogs();

  function normalizeAndExtractAnswers(result) {
    if (!result || typeof result !== 'object') result = {};
    if (!Array.isArray(result.answers)) result.answers = [];
    if (!Array.isArray(result.allChoices)) result.allChoices = [];
    if (!Array.isArray(result.dropdowns)) result.dropdowns = [];
    if (result.answers.length) {
      result.answers = result.answers.map((answer, index) => ({
        ...answer,
        number: Number.isInteger(answer.number) && answer.number > 0 ? answer.number : index + 1,
        letter: answer.letter || String.fromCharCode(65 + index),
        text: String(answer.text || (Array.isArray(answer.selections) ? answer.selections.map(item => [item.letter, item.text].filter(Boolean).join(' — ')).join('; ') : '') || ''),
        analysis: String(answer.analysis || ''),
        selections: Array.isArray(answer.selections) ? answer.selections : [],
        isCorrect: true,
      }));
    }
    return result;
  }
  // Multi-AI Key Management & Live Online Verification
  async function discoverGeminiModelsForKey(key) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key), { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || ('HTTP ' + response.status));
    const models = (data.models || []).filter(model => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent') && /^models\/gemini-.*flash/i.test(model.name || '')).map(model => model.name.replace(/^models\//, ''));
    if (!models.length) throw new Error('Google listed no Gemini Flash models supporting text generation for this key.');
    return models;
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('Google model-list request timed out after 8 seconds.');
    throw error;
  } finally { clearTimeout(timeoutId); }
}
  async function testAndVerifyKey(provider, key) {
    if (!key || key.trim().length < 5) {
      statusBadge.innerHTML = '<span style="color:#ef4444;">● Paste Gemini API Key</span>';
      statusBadge.title = 'Enter your Gemini API key and save.';
      return false;
    }
    statusBadge.innerHTML = '<span style="color:#eab308;">⟳ Testing Gemini Flash-Lite...</span>';
    try {
      const started = Date.now();
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite?key=' + encodeURIComponent(key);
      const response = await fetch(url);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || ('HTTP ' + response.status));
      statusBadge.innerHTML = '<span style="color:#10b981;">● Gemini Key Valid</span>';
      statusBadge.title = 'Gemini API key accepted. Solver is locked to gemini-3.1-flash-lite.';
      appendLog('INFO', 'Gemini API key verified (' + (Date.now() - started) + 'ms).');
      return true;
    } catch (error) {
      statusBadge.innerHTML = '<span style="color:#ef4444;">● Gemini Key Check Failed</span>';
      statusBadge.title = error.message;
      appendLog('ERROR', 'Gemini key verification failed: ' + error.message);
      return false;
    }
  }

  function loadKeyForProvider() {
    inputApiKey.placeholder = 'AIzaSy...';
    inputApiKey.value = '';
    chrome.storage.sync.get(['geminiApiKey'], (res) => {
      const savedKey = res.geminiApiKey || '';
      inputApiKey.value = savedKey;
      if (savedKey) testAndVerifyKey('gemini', savedKey);
      else {
        statusBadge.innerHTML = '<span style="color:#ef4444;">● Paste Gemini Key</span>';
        statusBadge.title = 'No Gemini API key saved.';
      }
    });
  }

  statusBadge.style.cursor = 'pointer';
  statusBadge.onclick = () => testAndVerifyKey('gemini', inputApiKey.value.trim());
  selectAiProvider.value = 'gemini';
  chrome.storage.sync.set({ selectedAiProvider: 'gemini' });
  loadKeyForProvider();

  btnToggleKey.onclick = () => {
    if (inputApiKey.type === 'password') {
      inputApiKey.type = 'text';
      btnToggleKey.textContent = 'Hide';
    } else {
      inputApiKey.type = 'password';
      btnToggleKey.textContent = 'Show';
    }
  };
  inputApiKey.addEventListener('change', () => {
    const rawKey = inputApiKey.value.trim();
    if (rawKey) {
      chrome.storage.sync.set({ geminiApiKey: rawKey, selectedAiProvider: 'gemini' });
      testAndVerifyKey('gemini', rawKey);
    }
  });
  btnSaveKey.onclick = () => {
    const rawKey = inputApiKey.value.trim();
    if (!rawKey) {
      chrome.storage.sync.remove(['geminiApiKey'], () => {
        statusBadge.innerHTML = '<span style="color:#ef4444;">● No Key</span>';
        appendLog('INFO', 'Gemini API key removed.');
      });
      return;
    }
    btnSaveKey.disabled = true;
    btnSaveKey.textContent = 'Verifying...';
    chrome.storage.sync.set({ geminiApiKey: rawKey, selectedAiProvider: 'gemini' }, async () => {
      btnSaveKey.disabled = false;
      btnSaveKey.textContent = 'Save Key';
      await testAndVerifyKey('gemini', rawKey);
    });
  };

  // Text Mode Solver (passive; page progression is always manual).
  // Retain pasted question text across popup closes
  chrome.storage.local.get(['savedPastedText'], (res) => {
    if (res.savedPastedText && !textQuestionInput.value) {
      textQuestionInput.value = res.savedPastedText;
    }
  });

  textQuestionInput.addEventListener('input', () => {
    chrome.storage.local.set({ savedPastedText: textQuestionInput.value });
  });

  // Multi-tier robust clipboard reader (overcomes permissions and iframe barriers)
  async function readClipboardTextRobust() {
    // 1. Native navigator.clipboard.readText()
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().length > 0) return removeAccessibilityCredits(text).trim();
      }
    } catch (e1) {
      console.warn('[AutoSolve] navigator.clipboard.readText:', e1);
    }

    // 2. Hidden textarea execCommand paste
    try {
      const ta = document.createElement('textarea');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      const success = document.execCommand('paste');
      const val = ta.value;
      document.body.removeChild(ta);
      if (success && val && val.trim().length > 0) return val.trim();
    } catch (e2) {
      console.warn('[AutoSolve] execCommand paste:', e2);
    }

    // 3. Fallback: extract directly from active tab
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const resp = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, { action: 'GRAB_PAGE_CONTENT' }, resolve);
        });
        if (resp && resp.text && resp.text.trim().length > 0) {
          return removeAccessibilityCredits(resp.text).trim();
        }
      }
    } catch (e3) {
      console.warn('[AutoSolve] tab grab fallback:', e3);
    }

    return '';
  }

  btnPasteClipboard.onclick = async () => {
    btnPasteClipboard.textContent = 'Pasting...';
    const text = await readClipboardTextRobust();
    btnPasteClipboard.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg><span>Paste Clipboard</span>`;

    if (text) {
      textQuestionInput.value = text;
      chrome.storage.local.set({ savedPastedText: text });
      appendLog('INFO', `Question pasted successfully (${text.length} chars).`);
    } else {
      appendLog('ACTION', 'Clipboard was empty. Click "⚡ Auto-Copy Page & Solve" to grab question directly from page!');
    }
  };

  btnClearText.onclick = () => {
    textQuestionInput.value = '';
    chrome.storage.local.remove(['savedPastedText']);
  };

  // Extract only rendered, user-facing text plus dropdown labels and choices.
  async function grabContentFromActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active browser tab found.');
    if (/^(chrome|edge|about):/i.test(tab.url || '')) throw new Error('This browser page does not allow page extraction.');

    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        const clean = value => String(value || '')
          .replace(/\u00a0/g, ' ')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        const isVisible = el => {
          if (!el || !el.isConnected) return false;
          const style = getComputedStyle(el);
          return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.visibility !== 'collapse' &&
            Number(style.opacity) !== 0 &&
            el.getClientRects().length > 0;
        };

        if (!document.body) return { text: '' };
        const parts = [];
        const selection = clean(window.getSelection?.()?.toString());
        if (selection.length > 8) return { text: selection };

        // innerText reflects rendered page text and excludes script/style source and most hidden UI.
        const visibleText = clean(document.body.innerText || '');
        if (visibleText) parts.push(visibleText);

        const dropdowns = [];
        const controls = Array.from(document.querySelectorAll('select, [role="combobox"], [aria-haspopup="listbox"]'));
        controls.forEach((el, index) => {
          if (!isVisible(el)) return;
          const labelEl = el.labels?.[0] ||
            el.closest('label') ||
            (el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null);
          const label = clean(
            labelEl?.innerText ||
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            el.getAttribute('name') ||
            ''
          );
          let options = [];
          if (el.tagName === 'SELECT') {
            options = Array.from(el.options)
              .map(option => clean(option.textContent))
              .filter(Boolean);
          } else {
            const listId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
            const list = listId ? document.getElementById(listId) : null;
            const scope = list && isVisible(list) ? list : el.parentElement;
            options = Array.from(scope?.querySelectorAll('[role="option"]') || [])
              .filter(isVisible)
              .map(option => clean(option.innerText || option.textContent))
              .filter(Boolean);
          }
          const current = el.tagName === 'SELECT'
            ? clean(el.selectedOptions?.[0]?.textContent || '')
            : clean(el.getAttribute('aria-valuetext') || el.getAttribute('aria-label') || '');
          const description = [
            'Dropdown ' + (index + 1) + (label ? ' (' + label + ')' : ''),
            current ? 'Selected: ' + current : '',
            options.length ? 'Options: ' + options.join(' | ') : ''
          ].filter(Boolean).join('\n');
          if (description) dropdowns.push(description);
        });

        if (dropdowns.length) {
          parts.push('=== DROPDOWNS ===\n' + dropdowns.join('\n\n'));
        }
        return { text: clean(parts.join('\n\n')) };
      },
    });

    const seen = new Set();
    const chunks = [];
    for (const frame of frames || []) {
      const text = String(frame.result?.text || '').trim();
      if (text.length < 2) continue;
      const key = text.replace(/\s+/g, ' ').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      chunks.push(text);
    }
    if (!chunks.length) throw new Error('No visible page text or dropdown content was found.');
    const combined = removeAccessibilityCredits(chunks.join('\n\n===== EMBEDDED FRAME =====\n\n'));
    appendLog('INFO', 'Extracted visible text from ' + chunks.length + ' frame(s), ' + combined.length.toLocaleString() + ' characters.');
    return combined;
  }

  // 1-Click Auto-Copy & Solve Page Workflow
  const btnAutoCopySolve = document.getElementById('btn-auto-copy-solve');
  const btnGrabPage = document.getElementById('btn-grab-page');

  // Toggle video playback boost on the active tab.
  const btnVideoBoost = document.getElementById('btn-video-boost');
  const videoBoostStatus = document.getElementById('video-boost-status');
  let videoBoostEnabled = false;

  function renderVideoBoostState() {
    if (!btnVideoBoost) return;
    btnVideoBoost.textContent = videoBoostEnabled ? 'ON' : 'OFF';
    btnVideoBoost.setAttribute('aria-pressed', String(videoBoostEnabled));
    btnVideoBoost.style.background = videoBoostEnabled ? '#047857' : '#334155';
    btnVideoBoost.style.borderColor = videoBoostEnabled ? '#10b981' : '#475569';
    if (videoBoostStatus) videoBoostStatus.textContent = videoBoostEnabled
      ? 'On · videos play at boosted speed'
      : 'Off · normal playback speed';
  }

  chrome.storage.local.get(['videoBoostEnabled'], (data) => {
    videoBoostEnabled = Boolean(data.videoBoostEnabled);
    renderVideoBoostState();
  });

  if (btnVideoBoost) {
    btnVideoBoost.addEventListener('click', async () => {
      const nextState = !videoBoostEnabled;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        appendLog('ERROR', 'Could not find the active tab for Video Boost.');
        return;
      }
      const settings = await chrome.storage.sync.get(['videoSpeed']);
      const speed = Math.min(16, Math.max(1, Number(settings.videoSpeed) || 16));
      chrome.tabs.sendMessage(tab.id, {
        action: 'SET_VIDEO_BOOST', enabled: nextState, speed,
      }, (response) => {
        if (chrome.runtime.lastError) {
          appendLog('ERROR', 'Video Boost could not reach this page. Reload the page and try again.');
          return;
        }
        if (!response?.success) {
          appendLog('ERROR', 'No accessible HTML5 video was found on this page.');
          return;
        }
        videoBoostEnabled = nextState;
        chrome.storage.local.set({ videoBoostEnabled });
        renderVideoBoostState();
        appendLog('VIDEO', nextState ? `Video Boost enabled at ${speed}x.` : 'Video Boost disabled; playback reset to 1x.');
      });
    });
  }

  if (btnGrabPage) {
    btnGrabPage.onclick = async () => {
      try {
        btnGrabPage.textContent = 'Copying...';
        const pageText = await grabContentFromActiveTab();
        btnGrabPage.textContent = 'Copy Page';
        if (pageText) {
          textQuestionInput.value = pageText;
          chrome.storage.local.set({ savedPastedText: pageText });
          appendLog('INFO', `Page content copied to box (${pageText.slice(0, 60)}...).`);
        } else {
          appendLog('ERROR', 'Could not detect question text on active page.');
        }
      } catch (err) {
        btnGrabPage.textContent = 'Copy Page';
        appendLog('ERROR', `Copy page note: ${err.message}`);
      }
    };
  }

  if (btnAutoCopySolve) {
    btnAutoCopySolve.onclick = async () => {
      try {
        btnAutoCopySolve.disabled = true;
        btnAutoCopySolve.innerHTML = `<span>⏳ Copying page...</span>`;
        appendLog('ACTION', 'Grabbing question and choices from active page...');
        const pageText = await grabContentFromActiveTab();
        if (!pageText) {
          btnAutoCopySolve.disabled = false;
          btnAutoCopySolve.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>⚡ Auto-Copy Page & Solve</span>`;
          appendLog('ERROR', 'Could not detect question text on page. Please paste manually.');
          return;
        }

        textQuestionInput.value = pageText;
        chrome.storage.local.set({ savedPastedText: pageText });
        appendLog('INFO', `Page question extracted (${pageText.slice(0, 60)}...). Solving...`);

        btnAutoCopySolve.disabled = false;
        btnAutoCopySolve.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>⚡ Auto-Copy Page & Solve</span>`;

        btnSolveText.click();
      } catch (err) {
        btnAutoCopySolve.disabled = false;
        btnAutoCopySolve.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>⚡ Auto-Copy Page & Solve</span>`;
        appendLog('ERROR', `Auto-copy error: ${err.message}`);
      }
    };
  }

  btnSolveText.onclick = async () => {
    const text = removeAccessibilityCredits(textQuestionInput.value);
    textQuestionInput.value = text;
    const provider = 'gemini';
    const storageKey = 'geminiApiKey';

    if (!text) {
      appendLog('ERROR', 'Please paste question text or click "⚡ Auto-Copy Page & Solve".');
      return;
    }

    btnSolveText.disabled = true;
    btnSolveText.textContent = `Solving with ${provider.toUpperCase()}...`;
    appendLog('ACTION', `[TEXT MODE] Sending question to ${provider.toUpperCase()}...`);

    // Get current provider key
    chrome.storage.sync.get([storageKey], async (store) => {
      const apiKey = store[storageKey] || '';

      // Send to background service worker for processing
      let responseHandled = false;
      const solveTimeoutId = setTimeout(() => {
        if (responseHandled) return;
        responseHandled = true;
        btnSolveText.disabled = false;
        btnSolveText.textContent = 'Solve & Number Answers';
        appendLog('ERROR', 'Gemini request timed out after 190 seconds. Check your API quota and try again.');
      }, 190000);

      try {
        chrome.runtime.sendMessage(
          {
            action: 'TRIGGER_TEXT_SOLVE',
            text,
            provider: 'gemini',
            apiKey,
          },
          (res) => {
            if (responseHandled) return;
            responseHandled = true;
            clearTimeout(solveTimeoutId);

            const runtimeError = chrome.runtime.lastError;
            btnSolveText.disabled = false;
            btnSolveText.textContent = 'Solve & Number Answers';

            if (runtimeError) {
              appendLog('ERROR', `Solve failed: ${runtimeError.message}`);
              return;
            }
            if (!res || !res.success) {
              appendLog('ERROR', `Solve failed: ${res?.error || 'Background worker returned no result.'}`);
              return;
            }

            const result = normalizeAndExtractAnswers(res.result, text);

            appendLog('COMPLETE', `=== [TEXT MODE RESULTS] (${result.provider || provider}) ===`);
            if (result.question) {
              appendLog('INFO', `Q: "${result.question}"`);
            }

            if (Array.isArray(result.answers) && result.answers.length > 0) {
              result.answers.forEach((ans) => {
                const numStr = ans.number ? `[${ans.number}]` : '[1]';
                if (ans.analysis) {
                  appendLog('REASONING', `Question ${numStr} Analysis: ${ans.analysis}`);
                }
                const letterStr = ans.letter ? `${ans.letter} — ` : '';
                appendLog('CLICK', `FINAL ANSWER ${numStr}: ${letterStr}${ans.text}`);
              });
            }

            if (Array.isArray(result.dropdowns) && result.dropdowns.length > 0) {
              result.dropdowns.forEach((dd, idx) => {
                appendLog('CLICK', `👉 DROPDOWN [${dd.menuNumber || idx + 1}]: Choose [${dd.selectedNumber || 1}] "${dd.selectedAnswer}"`);
              });
            }

            if (result.conciseReasoning) {
              appendLog('REASONING', `Reasoning: ${result.conciseReasoning}`);
            }

            renderBigGreenAnswer(result.answers, result.dropdowns || [], true, result.rawText || (!result.answers.length ? result.conciseReasoning || '' : ''));
          }
        );
      } catch (error) {
        if (!responseHandled) {
          responseHandled = true;
          clearTimeout(solveTimeoutId);
          btnSolveText.disabled = false;
          btnSolveText.textContent = 'Solve & Number Answers';
          appendLog('ERROR', `Could not send solve request: ${error.message}`);
        }
      }
    });
  };


  btnClear.onclick = () => {
    consoleBox.innerHTML = '';
    chrome.storage.local.remove(['recentConsoleLogs']);
  };

  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'NEW_LOG' && req.log) {
      appendLog(req.log.level, req.log.message, false);
    }
  });
});