// AutoSolve AI Background Service Worker (Manifest V3)
// Direct Gemini Vision API & Autonomous Question Solver

const DEFAULT_SERVER_URL = 'https://ais-dev-bhivux6smdwnhrhbmoqvfc-726613400165.us-west2.run.app';

const MAX_STORED_LOGS = 150;

function logEvent(level, message, data = null) {
  const time = new Date().toLocaleTimeString();
  const logItem = {
    timestamp: time,
    time,
    level,
    message,
    data,
  };
  console.log(`[AutoSolve AI][${level}] ${message}`, data || '');

  // Persist into chrome.storage.local so console logs are retained when user clicks off the extension
  try {
    chrome.storage.local.get(['recentConsoleLogs'], (res) => {
      const logs = res.recentConsoleLogs || [];
      logs.push(logItem);
      if (logs.length > MAX_STORED_LOGS) {
        logs.splice(0, logs.length - MAX_STORED_LOGS);
      }
      chrome.storage.local.set({ recentConsoleLogs: logs }).catch(() => {});
    });
  } catch {}

  chrome.runtime.sendMessage({ action: 'NEW_LOG', log: logItem }).catch(() => {});

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'NEW_LOG', log: logItem }).catch(() => {});
    }
  });
}

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
      confidence: typeof answer.confidence === 'number' ? answer.confidence : null,
    }));
  }
  return result;
}

async function getGeminiApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
      resolve(result.geminiApiKey || '');
    });
  });
}

async function getSelectedProviderConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      [
        'selectedAiProvider',
        'geminiApiKey',
        'openaiApiKey',
        'claudeApiKey',
        'deepseekApiKey',
        'customApiKey',
        'customBaseUrl',
        'customModel',
      ],
      (res) => {
        const provider = res.selectedAiProvider || 'gemini';
        let apiKey = res.geminiApiKey || '';
        if (provider === 'openai') apiKey = res.openaiApiKey || '';
        else if (provider === 'anthropic' || provider === 'claude') apiKey = res.claudeApiKey || '';
        else if (provider === 'deepseek') apiKey = res.deepseekApiKey || '';
        else if (provider === 'custom') apiKey = res.customApiKey || '';

        resolve({
          provider,
          apiKey,
          customBaseUrl: res.customBaseUrl || '',
          customModel: res.customModel || '',
        });
      }
    );
  });
}

async function getServerUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['serverUrl'], (result) => {
      resolve(result.serverUrl || DEFAULT_SERVER_URL);
    });
  });
}

let isAutoPilotRunning = false;

async function runAutonomousLoop() {
  logEvent('ACTION', '🚀 Auto-Pilot loop started.');
  while (isAutoPilotRunning) {
    logEvent('ACTION', '📸 [Auto-Pilot] Capturing tab and querying Gemini...');
    const result = await handleCaptureAndSolve({ autoClickNext: true });

    if (!isAutoPilotRunning) break;

    if (!result || !result.success) {
      logEvent('ACTION', '[Auto-Pilot] Screen check yielded no active question or action complete. Waiting 3s...');
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    // Wait for the next question to transition after submission
    const pauseTime = 2500 + Math.random() * 1000;
    logEvent('ACTION', `[Auto-Pilot] Question solved. Pausing ${Math.round(pauseTime)}ms for page transition...`);
    await new Promise((r) => setTimeout(r, pauseTime));
  }
}

// Ensure content script is injected into tab and all nested iframes (Edgenuity stageFrame)
async function ensureContentScriptInjected(tabId) {
  try {
    // Aggressive cleanup of any legacy HUD/cursor elements across all frames
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const selectors = [
          '#autosolve-ai-hud',
          '#autosolve-ai-cursor',
          '.autosolve-hud',
          '#latest-action-bar',
          '[id*="autosolve"]',
          '[class*="autosolve"]',
          'div[style*="2147483647"]',
        ];
        document.querySelectorAll(selectors.join(',')).forEach((el) => {
          try { el.remove(); } catch {}
        });
      },
    }).catch(() => {});

    const ping = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (ping?.status === 'alive') return true;
  } catch (e) {
    // Content script not present, inject now into ALL frames!
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content.js'],
      });
      await new Promise((r) => setTimeout(r, 150));
      return true;
    } catch (injectError) {
      console.warn('[AutoSolve AI] Could not inject content script:', injectError);
      return false;
    }
  }
  return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_AUTOPILOT') {
    if (!isAutoPilotRunning) {
      isAutoPilotRunning = true;
      logEvent('ACTION', '🚀 Auto-Pilot Activated! Running continuously across all questions and videos.');
      runAutonomousLoop();
    }
    sendResponse({ status: 'running' });
    return true;
  }

  if (request.action === 'STOP_AUTOPILOT') {
    isAutoPilotRunning = false;
    logEvent('ACTION', '🛑 Auto-Pilot stopped by user command.');
    sendResponse({ status: 'stopped' });
    return true;
  }

  if (request.action === 'TRIGGER_SCAN') {
    handleCaptureAndSolve(request.options).then(sendResponse);
    return true;
  }

  if (request.action === 'PERFORM_NATIVE_CLICK') {
    const directTabId = sender.tab?.id || request.tabId;
    if (directTabId) {
      performNativeClick(directTabId, request.x, request.y, request.label).then((success) => {
        sendResponse({ success });
      });
      return true;
    }
    // Query active tab fallback
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeId = tabs[0]?.id;
      if (activeId) {
        performNativeClick(activeId, request.x, request.y, request.label).then((success) => {
          sendResponse({ success });
        });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true;
  }

  if (request.action === 'TRIGGER_MANUAL_NEXT') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        sendResponse({ success: false });
        return;
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: () => {
            if (typeof window.__AUTOSOLVE_ADVANCE_NEXT__ === 'function') {
              return window.__AUTOSOLVE_ADVANCE_NEXT__();
            }
            const el = document.querySelector('.FrameRight, .footernav.navnext a, a.navnext, #btnNext, #btnCheck');
            if (el) { el.click(); return true; }
            return false;
          },
        });
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }

  if (request.action === 'TRIGGER_TEXT_SOLVE') {
    handleTextSolve(request)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'GET_STATUS') {
    getGeminiApiKey().then((apiKey) => {
      getServerUrl().then((serverUrl) => {
        sendResponse({
          status: 'active',
          hasApiKey: !!apiKey,
          serverUrl,
          isAutoPilotRunning,
        });
      });
    });
    return true;
  }
});

// Text Mode Q&A Handler (Strictly passive: No screen interactions, no mouse clicks)
async function handleTextSolve(req) {
  const { text, imageBase64, provider = 'gemini', apiKey, model, baseUrl } = req;
  logEvent('ACTION', `[TEXT MODE] Solving question using ${provider.toUpperCase()}...`);

  // Try backend proxy first
  try {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/solve-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        imageBase64,
        provider,
        apiKey,
        model,
        baseUrl,
        systemPrompt: await getCustomPrompt(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.result) {
        const result = normalizeAndExtractAnswers(data.result, text);
        logEvent('COMPLETE', `[TEXT MODE] Solved via ${provider.toUpperCase()} (${result.model || ''})`);
        
        // Log answers with numbers directly in console
        if (Array.isArray(result.answers) && result.answers.length > 0) {
          result.answers.forEach((ans) => {
            const numStr = ans.number ? `[${ans.number}]` : '[1]';
            const letterStr = ans.letter ? `(${ans.letter}) ` : '(A) ';
            logEvent('CLICK', `👉 ANSWER ${numStr} ${letterStr}"${ans.text}"`);
          });
        }
        if (Array.isArray(result.dropdowns) && result.dropdowns.length > 0) {
          result.dropdowns.forEach((dd, idx) => {
            logEvent('CLICK', `👉 DROPDOWN [${dd.menuNumber || idx + 1}]: Pick -> [${dd.selectedNumber || 1}] "${dd.selectedAnswer}"`);
          });
        }
        if (result.conciseReasoning) {
          logEvent('REASONING', result.conciseReasoning);
        }

        return { success: true, result };
      }
    }
  } catch (backendErr) {
    console.warn('[AutoSolve AI] Backend proxy unavailable, attempting direct fetch...', backendErr);
  }

  // Direct client fetch for Gemini if backend is down
  if (provider === 'gemini') {
    const key = apiKey || await getGeminiApiKey();
    if (!key) throw new Error('Gemini API key is required. Please paste your key in the popup.');
    const promptText = `Analyze the supplied material and follow the configured output format.\n\n${text || ''}`;
    const rawResult = await queryGeminiDirectly(imageBase64 || '', key, promptText);
    const result = normalizeAndExtractAnswers(rawResult, text);

    if (Array.isArray(result.answers) && result.answers.length > 0) {
      result.answers.forEach((ans) => {
        const numStr = ans.number ? `[${ans.number}]` : '[1]';
        const letterStr = ans.letter ? `(${ans.letter}) ` : '(A) ';
        logEvent('CLICK', `👉 ANSWER ${numStr} ${letterStr}"${ans.text}"`);
      });
    }
    if (result.conciseReasoning) {
      logEvent('REASONING', result.conciseReasoning);
    }
    return { success: true, result };
  }

  throw new Error(`Provider "${provider}" could not be reached. Ensure the AutoSolve server is online or check your API key.`);
}

// Native Hardware Click via Chrome DevTools Protocol (CDP)
// Bypasses synthetic event blockers and generates real isTrusted: true clicks!
// Works seamlessly in Microsoft Edge, Google Chrome, cross-origin iframes (Edgenuity), and video players.
async function performNativeClick(tabId, x, y, label = '') {
  const target = { tabId };
  try {
    try {
      await chrome.debugger.attach(target, '1.3');
    } catch (attachErr) {
      if (!attachErr.message?.includes('Already attached')) {
        try {
          await chrome.debugger.attach(target, '1.2');
        } catch (fallbackErr) {
          if (!fallbackErr.message?.includes('Already attached')) {
            throw fallbackErr;
          }
        }
      }
    }

    const roundX = Math.round(x);
    const roundY = Math.round(y);

    // 1. Move native pointer to coordinate
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: roundX,
      y: roundY,
      buttons: 0,
    });
    await new Promise((r) => setTimeout(r, 40));

    // 2. Mouse pressed (native isTrusted: true) - buttons: 1 MANDATORY FOR CHROMIUM/EDGE!
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: roundX,
      y: roundY,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 80));

    // 3. Mouse released (native isTrusted: true) - buttons: 0
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: roundX,
      y: roundY,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });

    logEvent('CLICK', `[Native CDP Click] Dispatched hardware click at (X: ${roundX}px, Y: ${roundY}px)${label ? ` for [${label}]` : ''} (buttons: 1, isTrusted: true)`);
    return true;
  } catch (err) {
    console.warn('[AutoSolve AI] Debugger click warning:', err.message);
    logEvent('ERROR', `Native debugger click note: ${err.message}.`);
    return false;
  }
}

async function handleAutoCopyAndSolve() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      logEvent('ERROR', 'No active tab found for auto-copy.');
      return;
    }
    await ensureContentScriptInjected(activeTab.id);

    chrome.tabs.sendMessage(activeTab.id, { action: 'GRAB_PAGE_CONTENT' }, async (res) => {
      let pageText = res?.text || '';
      if (!pageText) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id, allFrames: false },
            func: () => (window.__AUTOSOLVE_GRAB_CONTENT__ ? window.__AUTOSOLVE_GRAB_CONTENT__().text : document.body.innerText),
          });
          pageText = results[0]?.result || '';
        } catch {}
      }

      if (!pageText) {
        logEvent('ERROR', 'Could not detect question text on active page.');
        return;
      }

      logEvent('ACTION', `📋 Auto-copied question from page (${pageText.slice(0, 60)}...). Solving...`);
      chrome.storage.local.set({ savedPastedText: pageText });

      const config = await getSelectedProviderConfig();
      handleTextSolve({
        text: pageText,
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.customModel,
        baseUrl: config.customBaseUrl,
      });
    });
  } catch (err) {
    logEvent('ERROR', `Auto-copy failed: ${err.message}`);
  }
}

async function handleToggleSidePanelOrPopout() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: currentWindow.id });
      logEvent('ACTION', 'Docked AutoSolve AI inside Chrome Side Panel.');
    } else {
      await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html?popout=true'),
        type: 'popup',
        width: 440,
        height: 740,
        focused: true,
      });
      logEvent('ACTION', 'Opened AutoSolve AI in persistent floating window.');
    }
  } catch (err) {
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html?popout=true'),
      type: 'popup',
      width: 440,
      height: 740,
      focused: true,
    }).catch(() => {});
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'auto_copy_solve') {
    logEvent('ACTION', 'Shortcut Alt+Shift+C detected: Auto-copying page & solving...');
    handleAutoCopyAndSolve();
  } else if (command === 'toggle_sidebar') {
    logEvent('ACTION', 'Shortcut Alt+Shift+P detected: Toggling persistent sidebar/window...');
    handleToggleSidePanelOrPopout();
  }
});

async function getCustomPrompt() {
  let basePrompt = '';
  try {
    const stored = await new Promise(resolve => chrome.storage.sync.get(['customPrompt'], resolve));
    if (typeof stored.customPrompt === 'string' && stored.customPrompt.trim()) {
      basePrompt = stored.customPrompt;
    }
  } catch (error) {
    console.warn('[AutoSolve AI] Could not read saved prompt:', error);
  }

  if (!basePrompt) {
    try {
      const response = await fetch(chrome.runtime.getURL('prompt.txt'));
      if (response.ok) basePrompt = await response.text();
    } catch (error) {
      console.warn('[AutoSolve AI] Could not load prompt.txt:', error);
    }
  }

  if (!basePrompt) {
    basePrompt = 'You are a general-purpose assistant. Use only supplied text and images. Do not assume a subject or invent missing answers. Return valid JSON.';
  }

  // This requirement is deliberately appended even when the user has a saved custom prompt.
  return `${basePrompt.trim()}

MANDATORY MULTI-QUESTION PAGE RULE:
- Inspect the ENTIRE supplied page text/image from beginning to end before answering. Never stop after finding the first question.
- Identify every distinct question and question subpart that requires its own answer, in the exact order it appears on the page (top to bottom, then left to right for columns).
- Return one answer entry for every identified question/subpart. Do not omit later questions because they are repetitive, on another section, or below the fold in supplied content.
- Put the original question wording in each answer object's "question" field. Put its answer in "text". Set "number" to its sequential position (1, 2, 3, ...) in page order.
- If a question has multiple required selections, keep those selections together in that question's answer entry unless the page clearly presents them as separate numbered subquestions.
- If a question cannot be answered from the supplied material, still include its entry and explain what is missing rather than silently skipping it or guessing.
- Keep "answers" in page order. Do not reorder by topic, confidence, or question type.
- Before returning JSON, verify that the number of answer entries matches the number of distinct questions/subparts detected. If any are missing, complete them.
`;
}

// Direct Gemini Vision API Request Handler
async function queryGeminiDirectly(base64Image, apiKey, prompt = '') {
  const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

  const systemInstruction = await getCustomPrompt();

  const parts = [];
  if (cleanBase64 && cleanBase64.length > 50) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: cleanBase64,
      },
    });
  }
  parts.push({
    text: prompt || 'Analyze the supplied image and identify the visible task, relevant text, choices, and interactive elements. Follow the configured system prompt. Do not assume a subject or invent missing information. Return valid JSON.',
  });

  const requestBody = {
    contents: [
      {
        parts,
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };

  // High-quota Gemini models with automatic fast fallback (excludes gemini-3.8-flash to avoid 20 req/day quota limit)
  const models = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-flash-latest'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Gemini returned an empty candidate response.');

      const parsed = JSON.parse(rawText);
      return normalizeAndExtractAnswers(parsed, prompt);
    } catch (err) {
      lastError = err;
      console.warn(`[AutoSolve AI] Model ${model} failed, checking next model...`, err.message);
    }
  }

  throw lastError || new Error('All Gemini models failed to process screenshot.');
}

async function handleCaptureAndSolve(options = {}) {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      throw new Error('No active browser tab found to capture.');
    }

    if (activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('edge://')) {
      throw new Error('Cannot run extensions on internal browser pages (chrome://). Please navigate to your quiz or learning tab.');
    }

    // Make sure content script is active
    await ensureContentScriptInjected(activeTab.id);

    logEvent('CAPTURE', `Capturing visible tab: ${activeTab.title || 'Active Tab'}`);
    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' });
    logEvent('CAPTURE', `Screenshot captured (${Math.round(dataUrl.length / 1024)} KB)`);

    const apiKey = await getGeminiApiKey();
    let analysis = null;

    if (apiKey) {
      // 1. Direct Mode: User pasted Gemini API key into popup!
      logEvent('AI_VISION', 'Querying Gemini Vision API directly with your saved API key...');
      analysis = await queryGeminiDirectly(dataUrl, apiKey, options.prompt);
    } else {
      // 2. Server Proxy Fallback: If user has a backend URL configured
      const serverUrl = await getServerUrl();
      logEvent('AI_VISION', `No API key saved in popup. Querying backend at ${serverUrl}/api/analyze-screen...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(`${serverUrl}/api/analyze-screen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          viewportWidth: activeTab.width || 1280,
          viewportHeight: activeTab.height || 720,
          userPrompt: options.prompt || '',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errText.slice(0, 100)}`);
      }

      const result = await response.json();
      if (!result.success || !result.analysis) {
        throw new Error(result.error || 'Server did not return a valid analysis.');
      }
      analysis = result.analysis;
    }

    if (!analysis) {
      throw new Error('Could not obtain question analysis.');
    }

    logEvent('AI_VISION', `Question detected: "${analysis.question || 'N/A'}" (Type: ${analysis.questionType})`);
    logEvent('REASONING', `Gemini Reasoning: ${analysis.conciseReasoning}`);

    // MANDATORY REQUIREMENT: Note retrieved coordinates and numbered answers in console!
    const opts = analysis.options || [];
    opts.forEach((o, i) => {
      const isAns = !!o.isCorrect;
      const num = o.number || (i + 1);
      const letter = o.letter || String.fromCharCode(65 + i);
      const xPct = o.coordinates?.xPercent ?? 50;
      const yPct = o.coordinates?.yPercent ?? 50;
      console.log(
        `[AutoSolve AI][COORDINATES] Option [${num}] (${letter}) [${isAns ? 'CORRECT' : 'INCORRECT'}]: "${o.text}" -> X=${xPct}%, Y=${yPct}%`
      );
      if (isAns) {
        logEvent('CLICK', `👉 SCREENSHOT ANSWER [${num}] (${letter}): "${o.text}"`);
      }
    });

    if (Array.isArray(analysis.dropdowns) && analysis.dropdowns.length > 0) {
      analysis.dropdowns.forEach((dd, dIdx) => {
        logEvent(
          'CLICK',
          `👉 DROPDOWN [${dd.menuNumber || dIdx + 1}]: Pick Option [${dd.selectedNumber || '✓'}] "${dd.selectedAnswer}"`
        );
      });
    }

    if (analysis.nextButton?.detected || analysis.nextButton?.coordinates) {
      const nx = analysis.nextButton.coordinates?.xPercent;
      const ny = analysis.nextButton.coordinates?.yPercent;
      console.log(`[AutoSolve AI][COORDINATES] Next Button -> (${nx}%, ${ny}%)`);
      logEvent('COORDINATES', `Next Button located at coordinate (${nx}%, ${ny}%)`);
    }

    if (analysis.hasVideo) {
      logEvent('VIDEO', 'Video module detected: Activating 16x Video Controller...');
    }

    logEvent('ACTION', 'Dispatching target coordinates to page click simulator...');

    // Await the content script solution execution to avoid race conditions and stalling
    const contentResponse = await chrome.tabs.sendMessage(activeTab.id, {
      action: 'EXECUTE_SOLUTION',
      analysis,
      options,
    }).catch(() => null);

    // Also trigger execution across all subframes (guarantees penetration into Edgenuity stageFrame!)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id, allFrames: true },
        func: (analysisData, opts) => {
          if (typeof window.__AUTOSOLVE_EXECUTE_IN_FRAME__ === 'function') {
            window.__AUTOSOLVE_EXECUTE_IN_FRAME__(analysisData, opts);
          }
          if (typeof window.__AUTOSOLVE_CLEANUP_HUD__ === 'function') {
            window.__AUTOSOLVE_CLEANUP_HUD__();
          }
        },
        args: [analysis, options],
      });
    } catch (frameErr) {
      console.warn('[AutoSolve AI] allFrames executeScript note:', frameErr.message);
    }

    logEvent('COMPLETE', `Execution complete: ${contentResponse?.clicksPerformed ?? 1} click(s) registered.`);
    return { success: true, analysis, contentResponse };
  } catch (error) {
    let msg = error.message;
    if (msg === 'Failed to fetch') {
      msg = 'Connection error. Please open the AutoSolve AI extension popup and paste your Gemini API key (AIzaSy...).';
    }
    logEvent('ERROR', `Auto-Solve failed: ${msg}`);
    return { success: false, error: msg };
  }
}

// In-place GitHub updater, using the same folder-linking mechanism as PPUSA.
importScripts("updater.js");
const AUTOSOLVE_UPDATE_ALARM = "autosolve-ai-update-check";

async function checkForExtensionUpdate() {
  const { githubFineGrainedToken, autoUpdate = true } = await chrome.storage.local.get(["githubFineGrainedToken", "autoUpdate"]);
  let update;
  try {
    update = await AutoSolveUpdater.check(githubFineGrainedToken || "");
  } catch (error) {
    const { autosolveUpdateStatus = {} } = await chrome.storage.local.get("autosolveUpdateStatus");
    update = {
      ...autosolveUpdateStatus,
      currentVersion: chrome.runtime.getManifest().version,
      checkedAt: new Date().toISOString(),
      error: error?.message || "Update check failed"
    };
    await chrome.storage.local.set({ autosolveUpdateStatus: update });
    return update;
  }
  update.autoUpdate = autoUpdate !== false;
  await chrome.storage.local.set({ autosolveUpdateStatus: update });
  chrome.runtime.sendMessage({ action: "UPDATE_STATUS_CHANGED" }).catch(() => {});

  // Do not interrupt Auto-Pilot. A later alarm or manual update can apply it.
  if (update.updateAvailable && update.linked && update.permission === "granted" &&
      autoUpdate !== false && !isAutoPilotRunning) {
    const result = await applyExtensionUpdate();
    if (result.ok && result.reload) return update;
  }
  return update;
}

async function applyExtensionUpdate() {
  const { githubFineGrainedToken } = await chrome.storage.local.get("githubFineGrainedToken");
  const result = await AutoSolveUpdater.apply(githubFineGrainedToken || "");
  if (result.ok && result.reload) setTimeout(() => chrome.runtime.reload(), 700);
  return result;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(AUTOSOLVE_UPDATE_ALARM, { periodInMinutes: 360 });
  checkForExtensionUpdate().catch(error => console.warn("[AutoSolve AI] Update check:", error.message));
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(AUTOSOLVE_UPDATE_ALARM, { periodInMinutes: 360 });
  checkForExtensionUpdate().catch(error => console.warn("[AutoSolve AI] Update check:", error.message));
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === AUTOSOLVE_UPDATE_ALARM) {
    checkForExtensionUpdate().catch(error => console.warn("[AutoSolve AI] Update check:", error.message));
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "CHECK_FOR_UPDATES") {
    checkForExtensionUpdate()
      .then(updateStatus => sendResponse({ success: !updateStatus.error, updateStatus, error: updateStatus.error || null }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message?.action === "APPLY_EXTENSION_UPDATE") {
    applyExtensionUpdate()
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
});
