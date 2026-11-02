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

  const keyStorageMap = {
    gemini: 'geminiApiKey',
    openai: 'openaiApiKey',
    anthropic: 'claudeApiKey',
    deepseek: 'deepseekApiKey',
    custom: 'customApiKey',
  };

  const keyPlaceholderMap = {
    gemini: 'AIzaSy...',
    openai: 'sk-...',
    anthropic: 'sk-ant-...',
    deepseek: 'sk-...',
    custom: 'Bearer key...',
  };

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
  function renderBigGreenAnswer(answers, dropdowns = [], saveToStorage = true) {
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
          return `${question}<div class="big-answer-main">👉 [${num}] ${letter}"${escapeHtml(ans.text)}"</div>`;
        })
        .join('');
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
            renderBigGreenAnswer(item.answers, item.dropdowns || [], false);
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
        text: String(answer.text || ''),
        isCorrect: true,
      }));
    }
    return result;
  }
  // Multi-AI Key Management & Live Online Verification
  async function testAndVerifyKey(provider, key) {
    if (!key || key.trim().length < 5) {
      statusBadge.innerHTML = `<span style="color:#ef4444;">● Paste ${provider.toUpperCase()} Key</span>`;
      statusBadge.title = 'Enter key and click Save Key';
      return false;
    }

    statusBadge.innerHTML = `<span style="color:#eab308;">⟳ Testing ${provider.toUpperCase()}...</span>`;
    statusBadge.title = 'Verifying key validity with server & provider...';

    // 1. Try backend verification endpoint first
    try {
      const serverUrl = await getServerUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${serverUrl}/api/verify-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.valid) {
          statusBadge.innerHTML = `<span style="color:#10b981;">● ${provider.toUpperCase()} Online (${data.latencyMs || 0}ms)</span>`;
          statusBadge.title = `Valid & online (${data.latencyMs || 0}ms). Click to re-test.`;
          appendLog('INFO', `${provider.toUpperCase()} API key verified online (${data.latencyMs || 0}ms).`);
          return true;
        } else {
          const cleanErr = (data.error || 'Invalid key').slice(0, 24);
          statusBadge.innerHTML = `<span style="color:#ef4444;">● Invalid Key (${cleanErr})</span>`;
          statusBadge.title = data.error || 'Invalid API Key';
          appendLog('ERROR', `${provider.toUpperCase()} key error: ${data.error}`);
          return false;
        }
      }
    } catch {
      // Backend unavailable; proceed to direct browser verification fallback
    }

    // 2. Direct browser verification fallback
    try {
      const startTime = Date.now();
      if (provider === 'gemini') {
        const testModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
        let ok = false;
        let lastErr = '';
        for (const m of testModels) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
            const r = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
            });
            if (r.ok || r.status === 429) { ok = true; break; }
            const errData = await r.json().catch(() => ({}));
            lastErr = errData.error?.message || `HTTP ${r.status}`;
            if (r.status === 400 || r.status === 401 || r.status === 403) break;
          } catch (e) {
            lastErr = e.message;
          }
        }
        if (ok) {
          const latency = Date.now() - startTime;
          statusBadge.innerHTML = `<span style="color:#10b981;">● Online & Valid (${latency}ms)</span>`;
          statusBadge.title = 'Google Gemini API is active and online. Click to re-test.';
          appendLog('INFO', `Gemini API key verified directly (${latency}ms).`);
          return true;
        } else {
          statusBadge.innerHTML = `<span style="color:#ef4444;">● Invalid Key (${(lastErr || 'Error').slice(0, 18)})</span>`;
          statusBadge.title = lastErr || 'Key rejected by Google';
          appendLog('ERROR', `Gemini key error: ${lastErr}`);
          return false;
        }
      } else if (provider === 'openai') {
        const r = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (r.ok) {
          const latency = Date.now() - startTime;
          statusBadge.innerHTML = `<span style="color:#10b981;">● OpenAI Online (${latency}ms)</span>`;
          statusBadge.title = 'OpenAI API key is valid. Click to re-test.';
          return true;
        } else {
          statusBadge.innerHTML = `<span style="color:#ef4444;">● Invalid OpenAI Key</span>`;
          statusBadge.title = 'OpenAI authentication failed';
          return false;
        }
      } else if (provider === 'deepseek') {
        const r = await fetch('https://api.deepseek.com/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (r.ok) {
          const latency = Date.now() - startTime;
          statusBadge.innerHTML = `<span style="color:#10b981;">● DeepSeek Online (${latency}ms)</span>`;
          statusBadge.title = 'DeepSeek API key is valid. Click to re-test.';
          return true;
        } else {
          statusBadge.innerHTML = `<span style="color:#ef4444;">● Invalid DeepSeek Key</span>`;
          return false;
        }
      } else if (provider === 'anthropic') {
        if (key.startsWith('sk-ant-') && key.length > 20) {
          statusBadge.innerHTML = `<span style="color:#10b981;">● Claude Ready</span>`;
          return true;
        } else {
          statusBadge.innerHTML = `<span style="color:#ef4444;">● Invalid Claude Key</span>`;
          return false;
        }
      } else {
        statusBadge.innerHTML = `<span style="color:#10b981;">● Custom Key Set</span>`;
        return true;
      }
    } catch (netErr) {
      statusBadge.innerHTML = `<span style="color:#f87171;">● Offline / Net Error</span>`;
      statusBadge.title = netErr.message || 'Network error';
      appendLog('ERROR', `Network error testing key: ${netErr.message}`);
      return false;
    }
  }

  function loadKeyForProvider(provider) {
    const storageKey = keyStorageMap[provider] || 'geminiApiKey';
    inputApiKey.placeholder = keyPlaceholderMap[provider] || 'API key...';
    inputApiKey.value = '';

    chrome.storage.sync.get([storageKey], (res) => {
      const savedKey = res[storageKey] || '';
      inputApiKey.value = savedKey;
      if (savedKey) {
        testAndVerifyKey(provider, savedKey);
      } else {
        statusBadge.innerHTML = `<span style="color:#ef4444;">● Paste ${provider.toUpperCase()} Key</span>`;
        statusBadge.title = 'No key saved. Paste key and save.';
      }
    });
  }

  // Click status badge to manually re-test active key
  statusBadge.style.cursor = 'pointer';
  statusBadge.onclick = () => {
    testAndVerifyKey(selectAiProvider.value, inputApiKey.value.trim());
  };

  // Persist provider selection immediately when dropdown changes
  selectAiProvider.onchange = () => {
    const chosen = selectAiProvider.value;
    chrome.storage.sync.set({ selectedAiProvider: chosen }, () => {
      appendLog('INFO', `Switched active provider to ${chosen.toUpperCase()}`);
    });
    loadKeyForProvider(chosen);
  };

  btnToggleKey.onclick = () => {
    if (inputApiKey.type === 'password') {
      inputApiKey.type = 'text';
      btnToggleKey.textContent = 'Hide';
    } else {
      inputApiKey.type = 'password';
      btnToggleKey.textContent = 'Show';
    }
  };

  // Auto-save key on blur/change so user never loses it
  inputApiKey.addEventListener('change', () => {
    const provider = selectAiProvider.value;
    const storageKey = keyStorageMap[provider] || 'geminiApiKey';
    const rawKey = inputApiKey.value.trim();
    if (rawKey) {
      chrome.storage.sync.set({ [storageKey]: rawKey, selectedAiProvider: provider });
      testAndVerifyKey(provider, rawKey);
    }
  });

  btnSaveKey.onclick = () => {
    const provider = selectAiProvider.value;
    const storageKey = keyStorageMap[provider] || 'geminiApiKey';
    const rawKey = inputApiKey.value.trim();

    if (!rawKey) {
      chrome.storage.sync.remove([storageKey], () => {
        statusBadge.innerHTML = `<span style="color:#ef4444;">● No Key</span>`;
        appendLog('INFO', `${provider.toUpperCase()} API key removed.`);
      });
      return;
    }

    btnSaveKey.disabled = true;
    btnSaveKey.textContent = 'Verifying...';

    // Store both the key and the active provider selection, and run live verification
    chrome.storage.sync.set({ [storageKey]: rawKey, selectedAiProvider: provider }, async () => {
      btnSaveKey.disabled = false;
      btnSaveKey.textContent = 'Save Key';
      await testAndVerifyKey(provider, rawKey);
    });
  };

  // Initial load: Restore whichever provider the user previously picked
  chrome.storage.sync.get(['selectedAiProvider'], (res) => {
    const activeProvider = res.selectedAiProvider || 'gemini';
    selectAiProvider.value = activeProvider;
    loadKeyForProvider(activeProvider);
  });

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
    const text = removeAccessibilityCredits(textQuestionInput.value);\n    textQuestionInput.value = text;
    const provider = selectAiProvider.value;
    const storageKey = keyStorageMap[provider] || 'geminiApiKey';

    if (!text) {
      appendLog('ERROR', 'Please paste question text or click "⚡ Auto-Copy Page & Solve".');
      return;
    }

    btnSolveText.disabled = true;
    btnSolveText.textContent = `Solving with ${provider.toUpperCase()}...`;
    appendLog('ACTION', `[TEXT MODE] Sending question to ${provider.toUpperCase()}...`);

    // Get current provider key
    chrome.storage.sync.get([storageKey, 'customBaseUrl', 'customModel'], async (store) => {
      const apiKey = store[storageKey] || '';

      // Send to background service worker for processing
      chrome.runtime.sendMessage(
        {
          action: 'TRIGGER_TEXT_SOLVE',
          text,
          provider,
          apiKey,
          model: store.customModel || '',
          baseUrl: store.customBaseUrl || '',
        },
        (res) => {
          btnSolveText.disabled = false;
          btnSolveText.textContent = 'Solve & Number Answers';

          if (!res || !res.success) {
            appendLog('ERROR', `Solve failed: ${res?.error || 'Unknown error'}`);
            return;
          }

          const result = normalizeAndExtractAnswers(res.result, text);

          // STRICT REQUIREMENT: Output answers in the console with numbers!
          appendLog('COMPLETE', `=== [TEXT MODE RESULTS] (${result.provider || provider}) ===`);
          if (result.question) {
            appendLog('INFO', `Q: "${result.question}"`);
          }

          if (Array.isArray(result.answers) && result.answers.length > 0) {
            result.answers.forEach((ans) => {
              const numStr = ans.number ? `[${ans.number}]` : '[1]';
              const letterStr = ans.letter ? `(${ans.letter}) ` : '(A) ';
              appendLog('CLICK', `👉 ANSWER ${numStr} ${letterStr}"${ans.text}"`);
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

          // BIG GLOWING GREEN ANSWER BANNER AT THE END (OBVIOUS & UNMISTAKABLE)
          renderBigGreenAnswer(result.answers, result.dropdowns || []);
        }
      );
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