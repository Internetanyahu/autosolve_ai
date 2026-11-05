// AutoSolve AI Background Service Worker (Manifest V3)
// Text-only solver and manual progression

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

function normalizeAndExtractAnswers(result, rawInputText = '') {
  if (!result || typeof result !== 'object' || Array.isArray(result)) result = {};
  if (!Array.isArray(result.answers)) result.answers = [];
  if (!Array.isArray(result.allChoices)) result.allChoices = [];
  if (!Array.isArray(result.dropdowns)) result.dropdowns = [];

  const choices = result.allChoices;
  if (!result.answers.length && choices.length) {
    result.answers = choices.filter(choice => choice && choice.isCorrect === true).map((choice, index) => ({
      number: Number.isInteger(choice.number) && choice.number > 0 ? choice.number : index + 1,
      letter: choice.letter || String.fromCharCode(65 + index),
      text: String(choice.text || ''),
      isCorrect: true,
      confidence: typeof choice.confidence === 'number' ? choice.confidence : 0.98,
    })).filter(answer => answer.text);
  }

  if (!result.answers.length && choices.length && result.conciseReasoning) {
    const reasoning = String(result.conciseReasoning).toLowerCase();
    const mentioned = choices.find(choice => choice && choice.text &&
      reasoning.includes(String(choice.text).trim().toLowerCase()));
    if (mentioned) {
      const index = choices.indexOf(mentioned);
      result.answers = [{
        number: Number.isInteger(mentioned.number) && mentioned.number > 0 ? mentioned.number : index + 1,
        letter: mentioned.letter || String.fromCharCode(65 + index),
        text: String(mentioned.text),
        isCorrect: true,
        confidence: 0.85,
      }];
    }
  }

  result.answers = result.answers.filter(answer => answer && typeof answer === 'object').map((answer, index) => {
    const answerText = String(answer.text || '').trim();
    let matchedIndex = -1;
    if (answerText) {
      matchedIndex = choices.findIndex(choice => choice && choice.text &&
        String(choice.text).trim().toLowerCase() === answerText.toLowerCase());
    }
    const matched = matchedIndex >= 0 ? choices[matchedIndex] : null;
    const number = matched && Number.isInteger(matched.number) && matched.number > 0
      ? matched.number
      : (Number.isInteger(answer.number) && answer.number > 0 ? answer.number : index + 1);
    return {
      ...answer,
      number,
      letter: (matched && matched.letter) || answer.letter || String.fromCharCode(64 + number),
      text: answerText,
      isCorrect: true,
      confidence: typeof answer.confidence === 'number' ? answer.confidence : 0.98,
    };
  }).filter(answer => answer.text);

  return result;
}

const MODEL_CATALOG = [
  { id: 'gemini-3.1-flash-lite', provider: 'gemini', name: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-flash-latest', provider: 'gemini', name: 'Gemini Flash Latest' },
  { id: 'openai/gpt-oss-120b', provider: 'groq', name: 'GPT-OSS 120B' },
  { id: 'qwen/qwen3.8-27b', provider: 'groq', name: 'Qwen 3.8 27B' },
  { id: 'openai/gpt-oss-20b', provider: 'groq', name: 'GPT-OSS 20B' },
  { id: 'google/gemma-4-26b-a4b-it:free', provider: 'openrouter', name: 'Gemma 4 26B A4B' },
  { id: 'nvidia/nemotron-3.5-lightning:free', provider: 'openrouter', name: 'Nemotron 3.5 Lightning' },
  { id: 'cohere/north-mini-code:free', provider: 'openrouter', name: 'North Mini Code' },
  { id: 'ministral-8b-latest', provider: 'mistral', name: 'Ministral 8B' }
];

async function getProviderSettings() {
  // Keep model priority local-first so a just-saved reorder is immediately
  // honored even while Chrome Sync is still propagating the same setting.
  const [synced, local] = await Promise.all([
    chrome.storage.sync.get(['geminiApiKey', 'providerKeys', 'modelPriority', 'disabledModels']),
    chrome.storage.local.get(['modelPriority', 'disabledModels'])
  ]);
  const keys = { ...(synced.providerKeys || {}), gemini: synced.providerKeys?.gemini || synced.geminiApiKey || '' };
  const savedOrder = Array.isArray(local.modelPriority) ? local.modelPriority :
    (Array.isArray(synced.modelPriority) ? synced.modelPriority : []);
  const savedDisabled = Array.isArray(local.disabledModels) ? local.disabledModels :
    (Array.isArray(synced.disabledModels) ? synced.disabledModels : []);
  const disabled = new Set(savedDisabled);
  const order = [...savedOrder, ...MODEL_CATALOG.map(m => m.id)]
    .filter((id, index, all) => all.indexOf(id) === index);
  const models = order.map(id => MODEL_CATALOG.find(m => m.id === id))
    .filter(Boolean).filter(m => !disabled.has(m.id) && keys[m.provider]);
  logEvent('INFO', '[MODEL PRIORITY] Effective order: ' + models.map(m => m.id).join(' → '));
  return { keys, models };
}

async function getSelectedProviderConfig() {
  const { keys, models } = await getProviderSettings();
  return { provider: models[0]?.provider || 'gemini', apiKey: keys[models[0]?.provider] || '', model: models[0]?.id || 'gemini-3.1-flash-lite' };
}

function throwIfSolveAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason || new DOMException('Solve cancelled.', 'AbortError');
  }
}

function requestSignal(parentSignal) {
  const timeoutSignal = AbortSignal.timeout(90000);
  return parentSignal ? AbortSignal.any([parentSignal, timeoutSignal]) : timeoutSignal;
}

async function abortableDelay(ms, signal) {
  throwIfSolveAborted(signal);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason || new DOMException('Solve cancelled.', 'AbortError'));
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
  throwIfSolveAborted(signal);
}

async function fetchGeminiWithRetry(url, options, modelName) {
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    throwIfSolveAborted(options.signal);
    const response = await fetch(url, {
      ...options,
      signal: requestSignal(options.signal)
    });
    const body = await response.text();
    throwIfSolveAborted(options.signal);

    if (response.ok) return { response, body };

    let data = {};
    try { data = body ? JSON.parse(body) : {}; } catch {}
    const message = data.error?.message || body.slice(0, 300);

    if (!retryableStatuses.has(response.status) || attempt === maxAttempts) {
      throw new Error('HTTP ' + response.status + ': ' + message);
    }

    const baseDelay = 1000 * (2 ** (attempt - 1));
    const delay = baseDelay + Math.floor(Math.random() * 500);
    logEvent('WARN', modelName + ' returned HTTP ' + response.status +
      '; retry ' + (attempt + 1) + '/' + maxAttempts + ' in ' + (delay / 1000).toFixed(1) + 's.');
    await abortableDelay(delay, options.signal);
  }

  throw new Error(modelName + ' failed after retry attempts.');
}


const activeTextSolves = new Set();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TRIGGER_TEXT_SOLVE') {
    const controller = new AbortController();
    activeTextSolves.add(controller);
    handleTextSolve({ ...request, signal: controller.signal })
      .then(sendResponse)
      .catch(error => sendResponse({success:false,error:error.message}))
      .finally(() => activeTextSolves.delete(controller));
    return true;
  }

  if (request.action === 'RESET_SESSION') {
    resetSession()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error?.message || String(error) }));
    return true;
  }
});
 
// Text Mode Q&A Handler.
 // Strictly passive: No screen interactions, no mouse clicks.
// Text Mode Q&A Handler — direct provider requests; no hosted backend.
async function handleTextSolve(req) {
  const text = String(req.text || '');
  const signal = req.signal;
  throwIfSolveAborted(signal);
  if (!text.trim()) throw new Error('Enter or capture page text before solving.');
  if (text.length > 500000) throw new Error('Page text exceeds the 500,000-character limit.');
  const { keys, models } = await getProviderSettings();
  if (!models.length) throw new Error('No enabled model has an API key. Add keys and enable models in Full Settings.');
  const userPrompt = await getCustomPrompt();
  throwIfSolveAborted(signal);
  const promptContent = `User Question / Content:\n${text}\n\n${userPrompt ? `User Custom Instructions:\n${userPrompt}\n\n` : ''}Answer every supplied question in order. Follow the user's requested output format.`;
  const failures = [];

  for (const model of models) {
    throwIfSolveAborted(signal);
    const key = keys[model.provider];
    try {
      logEvent('ACTION', '[TEXT MODE] Trying ' + model.name + ' (' + model.id + ')');
      let response, data = {};
      if (model.provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${encodeURIComponent(key)}`;
        const geminiRequest = await fetchGeminiWithRetry(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: AUTOSOLVE_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: promptContent }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
          })
        }, model.name);
        response = geminiRequest.response;
        const body = geminiRequest.body;
        try { data = body ? JSON.parse(body) : {}; } catch {}
        var rawOutput = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim() || '';
        if (!rawOutput) throw new Error('No response text: ' + (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'empty response'));
      } else {
        const base = model.provider === 'groq' ? 'https://api.groq.com/openai/v1' :
          model.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.mistral.ai/v1';
        response = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key,
            ...(model.provider === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/Internetanyahu/autosolve_ai', 'X-Title': 'AutoSolve AI' } : {}) },
          signal: requestSignal(signal),
          body: JSON.stringify({
            model: model.id,
            messages: [{ role: 'system', content: AUTOSOLVE_SYSTEM_PROMPT }, { role: 'user', content: promptContent }],
            temperature: 0.1, max_tokens: 4096
          })
        });
        const body = await response.text(); try { data = body ? JSON.parse(body) : {}; } catch {}
        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + (data.error?.message || body.slice(0, 300)));
        rawOutput = data.choices?.[0]?.message?.content || '';
        if (Array.isArray(rawOutput)) rawOutput = rawOutput.map(part => part.text || '').join('');
        rawOutput = String(rawOutput).trim();
        if (!rawOutput) throw new Error('Provider returned an empty response.');
      }

      throwIfSolveAborted(signal);
      let parsed = parseGeminiJson(rawOutput);
      if (parsed.parseWarning) parsed = { rawText: rawOutput, answers: [], allChoices: [], dropdowns: [] };
      const result = normalizeAndExtractAnswers(parsed, text);
      if (!result.answers.length && !result.rawText) result.rawText = rawOutput;
      result.provider = model.provider;
      result.model = model.id;
      logEvent('COMPLETE', '[TEXT MODE] Solved with ' + model.name);
      if (result.answers.length) result.answers.forEach(answer => logEvent('ANSWER', '[TEXT MODE] Question [' + answer.number + ']: ' + answer.text));
      else logEvent('INFO', '[TEXT MODE] Provider response preserved as text.');
      if (result.conciseReasoning) logEvent('REASONING', result.conciseReasoning);
      return { success: true, result };
    } catch (error) {
      if (signal?.aborted) throw signal.reason || new DOMException('Solve cancelled.', 'AbortError');
      const message = model.name + ' failed: ' + (error?.message || String(error));
      failures.push(message);
      logEvent('ERROR', message + ' — trying next enabled model.');
    }
  }
  throw new Error('All enabled models failed. ' + failures.join(' | '));
}

async function resetSession() {
  for (const controller of activeTextSolves) {
    controller.abort(new DOMException('Session reset by user.', 'AbortError'));
  }
  activeTextSolves.clear();
  await chrome.storage.local.remove([
    'savedPastedText',
    'lastAutoSolveResult',
    'recentConsoleLogs',
    'pendingAutoCopySolveClick'
  ]);
}

// Persist side-panel visibility because the MV3 service worker can be suspended
// while the side panel remains open.
const sidePanelWindowsStorageKey = 'autosolveSidePanelWindows';

if (chrome.sidePanel?.onOpened) {
  chrome.sidePanel.onOpened.addListener(async info => {
    if (info.path !== 'popup.html?view=sidebar' && info.path !== 'popup.html') return;
    const stored = await chrome.storage.local.get([sidePanelWindowsStorageKey]);
    const openWindows = stored[sidePanelWindowsStorageKey] || {};
    openWindows[String(info.windowId)] = true;
    await chrome.storage.local.set({ [sidePanelWindowsStorageKey]: openWindows });
  });
}

if (chrome.sidePanel?.onClosed) {
  chrome.sidePanel.onClosed.addListener(async info => {
    if (info.path !== 'popup.html?view=sidebar' && info.path !== 'popup.html') return;
    const stored = await chrome.storage.local.get([sidePanelWindowsStorageKey]);
    const openWindows = stored[sidePanelWindowsStorageKey] || {};
    delete openWindows[String(info.windowId)];
    await chrome.storage.local.set({ [sidePanelWindowsStorageKey]: openWindows });
  });
}

async function activateAutoCopySolveButton() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const windowId = tab?.windowId;
  if (windowId == null) {
    logEvent('ERROR', 'Could not find the active browser window.');
    return;
  }

  const stored = await chrome.storage.local.get([sidePanelWindowsStorageKey]);
  const openWindows = stored[sidePanelWindowsStorageKey] || {};
  if (openWindows[String(windowId)] === true) {
    // The side panel is already open: activate its copy/solve button in place.
    chrome.runtime.sendMessage({ action: 'ACTIVATE_AUTO_COPY_SOLVE_BUTTON' }).catch(() => {});
    return;
  }

  // Only open the popup when this window does not already have the side panel.
  await chrome.storage.local.set({ pendingAutoCopySolveClick: Date.now() });
  try {
    await chrome.action.openPopup();
  } catch (error) {
    logEvent('ERROR', 'Could not open AutoSolve AI popup: ' + (error?.message || String(error)));
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
  if (command === 'auto_copy_solve') activateAutoCopySolveButton();
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

function parseGeminiJson(raw) {
  const source = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!source) {
    return { conciseReasoning: 'Gemini returned an empty response.', answers: [], allChoices: [], dropdowns: [] };
  }

  // Match the old server's recovery order: direct JSON, fenced JSON, then
  // the first complete JSON object embedded in surrounding text.
  const candidates = [source];
  const fenced = source.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const start = source.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(source.slice(start, i + 1));
          break;
        }
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return { answers: parsed, allChoices: [], dropdowns: [] };
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }

  // The legacy server preserved non-JSON model output as reasoning instead
  // of failing the entire solve. Keep that recovery, but never invent answers.
  return {
    question: '',
    questionType: 'other',
    conciseReasoning: source,
    answers: [],
    allChoices: [],
    dropdowns: [],
    parseWarning: 'The model response was not structured JSON; raw text was preserved.',
  };
}

const AUTOSOLVE_SYSTEM_PROMPT = `You are AutoSolve AI, a general-purpose question and assessment solver.

Read all supplied page text. Identify every distinct question and independently answerable sub-question in page order. Preserve top-to-bottom, then left-to-right order.

Answer accurately using only the question and choices supplied. For multiple-choice questions, preserve displayed letters and exact answer text. For multi-select questions, include every correct option and no incorrect options. For dropdowns, use only supplied options and identify the menu number. For written responses, provide a concise direct answer.

Do not assume a particular school, course, subject, curriculum, website, or employer unless the user's custom instructions explicitly establish that context. Do not invent choices, missing context, citations, or facts. If a question cannot be answered reliably, say what is missing instead of guessing.

OUTPUT FORMAT:
Respond in plain text, not JSON. Follow the user's custom output format exactly when one is supplied. Put each question's analysis before its final answer. Do not add greetings, filler, or text after a question's FINAL ANSWER. For batches, answer every question in order. For multi-select questions, list every correct option as a separate bullet. Never wrap the response in JSON or Markdown code fences unless the user explicitly asks for them.`;

// The former GitHub token is no longer used; the CDN updater needs no token.
chrome.storage.local.remove("githubFineGrainedToken").catch(() => {});

// GitHub updater flow follows PPUSA: one branch-tree check, cached status,
// optional automatic installation, and a 15-minute background check.
importScripts("updater.js");

let updateCheckPromise = null;
let automaticApplyPromise = null;

function checkForExtensionUpdate() {
  if (updateCheckPromise) return updateCheckPromise;

  updateCheckPromise = (async () => {
    const { autoUpdate = true } = await chrome.storage.local.get(["autoUpdate"]);
    let update;

    try {
      update = await AutoSolveUpdater.check();
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
    const result = await AutoSolveUpdater.apply({ interactive });
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
