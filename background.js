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
 (Strictly passive: No screen interactions, no mouse clicks)
async function handleTextSolve(req) {
  const { text, provider = 'gemini', apiKey, model, baseUrl } = req;
  logEvent('ACTION', `[TEXT MODE] Solving question using ${provider.toUpperCase()}...`);

  // Try backend proxy first
  try {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/solve-text`, {
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

// Text-only Gemini fallback.
async function queryGeminiDirectly(base64Image, apiKey, prompt = '') {
  const systemPrompt = await getCustomPrompt();
  const body = {
    contents: [{ parts: [{ text: String(prompt || '') }] }],
    ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
  };
  let lastError;
  for (const model of ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest']) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error?.message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw new Error('Gemini returned an empty response.');
      return normalizeAndExtractAnswers(JSON.parse(raw), prompt);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Gemini request failed.');
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

  if (update.updateAvailable && update.linked && update.permission === "granted" &&
      autoUpdate !== false) {
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
