// AutoSolve AI Background Service Worker (Manifest V3)
// Text-only solver and manual progression

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TRIGGER_TEXT_SOLVE') {
    handleTextSolve(request).then(sendResponse).catch(error => sendResponse({success:false,error:error.message}));
    return true;
  }
  if (request.action === 'TRIGGER_MANUAL_NEXT') {
    chrome.tabs.query({active:true,currentWindow:true}, async tabs => {
      const tabId=tabs[0]?.id;
      if(!tabId){sendResponse({success:false,error:'No active tab found.'});return;}
      try {
        const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>{
          const selectors=['.FrameRight','.footernav.navnext a','a.navnext','#btnNext','#btnCheck','button[aria-label*="next" i]','a[aria-label*="next" i]'];
          for(const selector of selectors){const el=document.querySelector(selector);if(!el)continue;const s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden'||!el.getClientRects().length||el.disabled)continue;el.click();return true;}return false;
        }});
        const success=results.some(x=>x.result===true);
        sendResponse({success,error:success?null:'No visible Next button found.'});
      } catch(error){sendResponse({success:false,error:error.message});}
    });return true;
  }
  if(request.action==='GET_STATUS'){
    Promise.all([getGeminiApiKey(),getServerUrl()]).then(([apiKey,serverUrl])=>sendResponse({status:'active',hasApiKey:!!apiKey,serverUrl}));
    return true;
  }
});
 
// Text Mode Q&A Handler.
 // Strictly passive: No screen interactions, no mouse clicks.
async function handleTextSolve(req) {
  const { text, provider = 'gemini', apiKey, model, baseUrl } = req;
  logEvent('ACTION', `[TEXT MODE] Solving question using ${provider.toUpperCase()}...`);
  logEvent('INFO', '[DIAGNOSTIC] Background build 2026-11-02-b: TRIGGER_TEXT_SOLVE received; backend-first path enabled. Input characters: ' + String(text || '').length);

  // Try backend proxy first
  try {
    const serverUrl = await getServerUrl();
    logEvent('INFO', '[TEXT MODE] Attempting backend request at ' + serverUrl + '/api/solve-text (20-second limit)...');
    const backendStartedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    let res;
    let data;
    try {
      res = await fetch(`${serverUrl}/api/solve-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          provider,
          apiKey,
          model,
          baseUrl,
          systemPrompt: await getCustomPrompt(),
        }),
        signal: controller.signal,
      });
        const responseText = await res.text();
        logEvent('INFO', '[TEXT MODE] Backend responded with HTTP ' + res.status + ' in ' + (Date.now() - backendStartedAt) + 'ms.');
      try { data = responseText ? JSON.parse(responseText) : {}; }
      catch { data = { error: responseText.slice(0, 1000) }; }
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.ok && data.success && data.result) {
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
    const backendMessage = data?.error || data?.message || (data?.success === false ? 'Backend returned success=false without an error message.' : '');
    logEvent('ERROR', '[TEXT MODE] Backend solve failed; attempting direct ' + provider.toUpperCase() + ' fallback. HTTP ' + res.status + (backendMessage ? ': ' + backendMessage : ''));
    console.warn('[AutoSolve AI] Backend solve failed; attempting direct provider fallback.', { status: res.status, response: data });
  } catch (backendErr) {
    const detail = backendErr?.name === 'AbortError' ? '20-second timeout' : (backendErr?.message || String(backendErr));
    logEvent('ERROR', '[TEXT MODE] Backend request failed; switching to direct ' + provider.toUpperCase() + ' API. ' + detail);
    console.warn('[AutoSolve AI] Backend request failed; attempting direct provider fallback...', backendErr);
  }

  // Direct client fetch for Gemini if backend is down
  if (provider === 'gemini') {
    const key = apiKey || await getGeminiApiKey();
    if (!key) throw new Error('Gemini API key is required. Please paste your key in the popup.');
    const result = await queryGeminiDirectly(key, text || '');

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

async function getCustomPrompt() {
  try {
    const saved = await chrome.storage.sync.get(['customPrompt']);
    if (typeof saved.customPrompt === 'string' && saved.customPrompt.trim()) return saved.customPrompt.trim();
  } catch (error) { console.warn('[AutoSolve AI] Could not read saved prompt:', error); }
  try {
    const response = await fetch(chrome.runtime.getURL('prompt.txt'));
    if (response.ok) return (await response.text()).trim();
  } catch (error) { console.warn('[AutoSolve AI] Could not load prompt.txt:', error); }
  return '';
}

async function openAutoSolveSidePanel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.windowId) throw new Error('No active browser window found.');
    await chrome.sidePanel.open({ windowId: tab.windowId });
    logEvent('ACTION', 'Opened AutoSolve AI in the Chrome side panel.');
  } catch (error) {
    logEvent('ERROR', 'Could not open Chrome side panel: ' + error.message);
  }
}

chrome.commands.onCommand.addListener(command => {
  if (command === 'toggle_sidebar') openAutoSolveSidePanel();
  if (command === 'auto_copy_solve') handleAutoCopyAndSolve();
  if (command === 'manual_next') chrome.tabs.query({active:true,currentWindow:true}, async tabs => {
    const tabId=tabs[0]?.id;
    if(!tabId)return;
    try {
      const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>{
        const selectors=['.FrameRight','.footernav.navnext a','a.navnext','#btnNext','#btnCheck','button[aria-label*="next" i]','a[aria-label*="next" i]'];
        for(const selector of selectors){const el=document.querySelector(selector);if(!el)continue;const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden'||!el.getClientRects().length||el.disabled)continue;el.click();return true;}return false;
      }});
      const clicked=results.some(item=>item.result===true);
      logEvent(clicked?'ACTION':'ERROR',clicked?'Manual Next shortcut activated the page Next button.':'No visible Next button was found.');
    } catch(error){logEvent('ERROR','Manual Next failed: '+error.message);}
  });
});

async function getAvailableGeminiModels(apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey), { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || ('Gemini model discovery failed (HTTP ' + response.status + ').'));
    const preferred = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
    const models = (data.models || []).filter(item =>
      Array.isArray(item.supportedGenerationMethods) && item.supportedGenerationMethods.includes('generateContent') &&
      /^models\/gemini-.*flash/i.test(item.name || '')
    ).map(item => String(item.name).replace(/^models\//, ''));
    models.sort((a, b) => {
      const ai = preferred.indexOf(a), bi = preferred.indexOf(b);
      if (ai !== -1 || bi !== -1) return ai === -1 ? 1 : bi === -1 ? -1 : ai - bi;
      return (a.includes('latest') ? 0 : 1) - (b.includes('latest') ? 0 : 1) || a.localeCompare(b);
    });
    if (!models.length) throw new Error('Google listed no Gemini Flash models supporting generateContent for this API key.');
    return models;
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('Gemini model discovery timed out after 8 seconds.');
    throw error;
  } finally { clearTimeout(timeoutId); }
}
function parseGeminiJson(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('Gemini returned an empty response.');

  const candidates = [];
  const unfenced = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  candidates.push(unfenced);

  // Models sometimes add a short sentence before or after an otherwise valid JSON object.
  const start = unfenced.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < unfenced.length; i++) {
      const ch = unfenced[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        candidates.push(unfenced.slice(start, i + 1));
        break;
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed)) return { answers: parsed };
    } catch {}
  }

  throw new Error('Gemini response was not parseable JSON. Response excerpt: ' + text.slice(0, 240));
}

// Text-only Gemini fallback. Each model request is bounded so a stalled
// provider cannot leave the extension waiting forever.
async function queryGeminiDirectly(apiKey, prompt = '') {
  if (!apiKey) throw new Error('Gemini API key is required.');
  const questionText = String(prompt || '');
  logEvent('INFO', '[TEXT MODE] Preparing direct Gemini request...');
  const systemPrompt = await getCustomPrompt();
  const body = {
    contents: [{ role: 'user', parts: [{ text: questionText }] }],
    ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
  };

  const models = await getAvailableGeminiModels(apiKey);
  logEvent('INFO', '[TEXT MODE] Google reports available Flash models: ' + models.join(', '));
  const failures = [];

  for (const model of models.slice(0, 3)) {
    // Move to the next model immediately when one is slow or overloaded.
    for (let attempt = 1; attempt <= 1; attempt++) {
      logEvent('INFO', `[TEXT MODE] Trying Gemini model ${model} (attempt ${attempt}/1)...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const requestStartedAt = Date.now();

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          const message = detail.error?.message || `Gemini HTTP ${response.status}`;
          const error = new Error(message);
          error.status = response.status;
          throw error;
        }

        logEvent('INFO', `[TEXT MODE] Gemini ${model} returned HTTP ${response.status} in ${Date.now() - requestStartedAt}ms; reading response...`);
        const data = await response.json();
        const raw = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
        if (!raw) throw new Error('Gemini returned an empty response.');

        const parsed = parseGeminiJson(raw);
        if (!Array.isArray(parsed.answers)) {
          throw new Error('Gemini JSON did not contain an answers array.');
        }

        logEvent('INFO', `[TEXT MODE] Gemini model ${model} responded successfully.`);
        return normalizeAndExtractAnswers(parsed, questionText);
      } catch (error) {
        const failure = error?.name === 'AbortError'
          ? new Error(`Gemini model ${model} timed out after 12 seconds.`)
          : error;
        const message = String(failure?.message || failure);
        const temporary = failure?.status === 429 ||
          [500, 502, 503, 504].includes(failure?.status) ||
          /high demand|overload|temporar(il|y)|try again later|resource exhausted|rate.?limit|unavailable/i.test(message);

        failures.push(`${model}: ${message}`);
        logEvent('INFO', `[TEXT MODE] ${model} failed: ${message}`);

        if (temporary) {
          logEvent('INFO', `[TEXT MODE] ${model} is temporarily unavailable; moving to the next model.`);
        }
        break;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  const allTemporary = failures.length > 0 && failures.every(item =>
    /high demand|overload|temporar(il|y)|try again later|resource exhausted|rate.?limit|unavailable|HTTP (429|500|502|503|504)/i.test(item)
  );
  if (allTemporary) {
    throw new Error('Gemini is temporarily overloaded or rate-limited across the available models. AutoSolve retried each model and none was available. Wait briefly and try again. Details: ' + failures.join(' | '));
  }
  throw new Error('All direct Gemini attempts failed. ' + (failures.join(' | ') || 'Gemini request failed.'));
}

// GitHub updater flow follows PPUSA: one branch-tree check, cached status,
// optional automatic installation, and a 15-minute background check.
importScripts("updater.js");

let updateCheckPromise = null;
let automaticApplyPromise = null;

function checkForExtensionUpdate() {
  if (updateCheckPromise) return updateCheckPromise;

  updateCheckPromise = (async () => {
    const { githubFineGrainedToken, autoUpdate = true } =
      await chrome.storage.local.get(["githubFineGrainedToken", "autoUpdate"]);
    let update;

    try {
      update = await AutoSolveUpdater.check(githubFineGrainedToken || "");
    } catch (error) {
      const { autosolveUpdateStatus = {} } = await chrome.storage.local.get("autosolveUpdateStatus");
      update = {
        ...autosolveUpdateStatus,
        currentVersion: chrome.runtime.getManifest().version,
        checkedAt: new Date().toISOString(),
        githubUrl: "https://github.com/Internetanyahu/autosolve_ai",
        error: error?.message || "GitHub update check failed."
      };
    }

    update.autoUpdate = autoUpdate;
    await chrome.storage.local.set({ autosolveUpdateStatus: update });

    if (update.updateAvailable && update.linked && update.permission === "granted" &&
        autoUpdate && !update.error) {
      await applyExtensionUpdate(false);
    }
    return update;
  })().finally(() => {
    updateCheckPromise = null;
  });

  return updateCheckPromise;
}

async function applyExtensionUpdate(interactive = false) {
  if (automaticApplyPromise) return automaticApplyPromise;

  automaticApplyPromise = (async () => {
    const { githubFineGrainedToken } = await chrome.storage.local.get("githubFineGrainedToken");
    const result = await AutoSolveUpdater.apply(githubFineGrainedToken || "", { interactive });
    if (result.ok && result.reload) setTimeout(() => chrome.runtime.reload(), 700);
    return result;
  })().finally(() => {
    automaticApplyPromise = null;
  });

  return automaticApplyPromise;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "CHECK_FOR_UPDATES") {
    checkForExtensionUpdate()
      .then(updateStatus => sendResponse({
        success: !updateStatus.error,
        updateStatus,
        error: updateStatus.error || null
      }))
      .catch(error => sendResponse({ success: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.action === "APPLY_EXTENSION_UPDATE") {
    applyExtensionUpdate(true)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
});

// Match PPUSA's periodic and lifecycle checks. In-flight checks/installations
// are coalesced above so these triggers cannot create overlapping loops.
chrome.alarms.create("autosolve-extension-update-check", { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "autosolve-extension-update-check") checkForExtensionUpdate();
});
chrome.runtime.onInstalled.addListener(() => checkForExtensionUpdate());
chrome.runtime.onStartup.addListener(() => checkForExtensionUpdate());
