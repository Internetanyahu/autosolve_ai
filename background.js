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
// Text Mode Q&A Handler — direct provider requests; no hosted backend.
async function handleTextSolve(req) {
  const text = String(req.text || '');
  const provider = String(req.provider || 'gemini').toLowerCase();
  const apiKey = String(req.apiKey || '').trim();
  const model = String(req.model || '').trim();
  const baseUrl = String(req.baseUrl || '').trim();

  if (!text.trim()) throw new Error('Enter or capture page text before solving.');
  if (!apiKey) throw new Error(`A ${provider.toUpperCase()} API key is required. Add it in Settings.`);
  if (text.length > 500000) throw new Error('Page text exceeds the 500,000-character limit.');

  logEvent('ACTION', `[TEXT MODE] Sending page text directly to ${provider.toUpperCase()} (no hosted backend)...`);
  logEvent('INFO', `[DIAGNOSTIC] Direct provider request. Input characters: ${text.length}`);

  const userPrompt = await getCustomPrompt();
  const promptContent = `User Question / Content:
${text}

${userPrompt ? `User Custom Instructions:
${userPrompt}

` : ''}Answer every supplied question in order. Follow the user's requested output format.`;

  // The system prompt deliberately accepts plain text. JSON is parsed when a
  // provider returns it, but a valid non-JSON answer is never rejected.
  const systemPrompt = AUTOSOLVE_SYSTEM_PROMPT;

  const configs = {
    gemini: { model: 'gemini-3.8-flash' },
    openai: { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
    anthropic: { model: 'claude-3-5-haiku-20241022' },
    claude: { model: 'claude-3-5-haiku-20241022' },
    deepseek: { model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
    custom: { model: model || 'openai/gpt-4o-mini', baseUrl: baseUrl || 'https://openrouter.ai/api/v1' },
  };
  const config = configs[provider];
  if (!config) throw new Error(`Unsupported AI provider: ${provider}`);
  const selectedModel = model || config.model;
  let rawOutput = '';
  let response;

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(185000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: promptContent }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    });
    const body = await response.text();
    let data = {};
    try { data = body ? JSON.parse(body) : {}; } catch {}
    if (!response.ok) throw new Error(`Gemini API HTTP ${response.status} (${selectedModel}): ${data.error?.message || body.slice(0, 700) || 'Request failed'}`);
    rawOutput = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim() || '';
    if (!rawOutput) {
      const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'No response text';
      throw new Error(`Gemini returned no answer text: ${reason}`);
    }
  } else if (provider === 'anthropic' || provider === 'claude') {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal: AbortSignal.timeout(185000),
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: promptContent }],
        temperature: 0.1,
      }),
    });
    const body = await response.text();
    let data = {};
    try { data = body ? JSON.parse(body) : {}; } catch {}
    if (!response.ok) throw new Error(`Anthropic API HTTP ${response.status}: ${data.error?.message || body.slice(0, 700) || 'Request failed'}`);
    rawOutput = Array.isArray(data.content) ? data.content.map(part => part.text || '').join('').trim() : '';
  } else {
    const endpoint = (config.baseUrl || baseUrl || '').replace(/\/+$/, '');
    if (!endpoint || !/^https:\/\//i.test(endpoint)) throw new Error('The custom provider endpoint must be a valid HTTPS URL.');
    response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(185000),
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptContent },
        ],
        temperature: 0.1,
      }),
    });
    const body = await response.text();
    let data = {};
    try { data = body ? JSON.parse(body) : {}; } catch {}
    if (!response.ok) throw new Error(`${provider.toUpperCase()} API HTTP ${response.status}: ${data.error?.message || body.slice(0, 700) || 'Request failed'}`);
    const content = data.choices?.[0]?.message?.content;
    rawOutput = typeof content === 'string' ? content.trim() :
      Array.isArray(content) ? content.map(part => part?.text || '').join('').trim() : '';
  }

  if (!rawOutput) throw new Error(`${provider.toUpperCase()} returned an empty response.`);
  let parsed = parseGeminiJson(rawOutput);
  if (parsed.parseWarning) parsed = { rawText: rawOutput, answers: [], allChoices: [], dropdowns: [] };
  const result = normalizeAndExtractAnswers(parsed, text);
  if (!result.answers.length && !result.rawText) result.rawText = rawOutput;
  result.provider = provider === 'claude' ? 'anthropic' : provider;
  result.model = selectedModel;

  logEvent('COMPLETE', `[TEXT MODE] Solved directly with ${result.provider.toUpperCase()} (${selectedModel})`);
  if (result.answers.length) {
    result.answers.forEach(answer => logEvent('ANSWER', `[TEXT MODE] Question [${answer.number}]: ${answer.text}`));
  } else {
    logEvent('INFO', '[TEXT MODE] Provider response preserved as text; no structured answer array was detected.');
  }
  if (result.conciseReasoning) logEvent('REASONING', result.conciseReasoning);
  return { success: true, result };
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
        model: config.provider === 'custom' ? config.customModel : '',
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

async function queryGeminiDirectly(apiKey, prompt = '') {
  if (!apiKey) throw new Error('Gemini API key is required.');
  const questionText = String(prompt || '');
  const userPrompt = await getCustomPrompt();
  const promptContent = `User Question / Content:
${questionText || '(No question text was supplied)'}

${userPrompt ? `User Custom Instructions:
${userPrompt}

` : ''}Answer every supplied question in order. Follow the user's requested plain-text format. Do not return JSON or code fences.`;

  const requestBody = {
    contents: [{ parts: [{ text: promptContent }] }],
    systemInstruction: { parts: [{ text: AUTOSOLVE_SYSTEM_PROMPT }] },
    generationConfig: { temperature: 0.1 },
  };

  // Restore the old sequential fallback behavior. No short per-model timeout:
  // slower successful generations must be allowed to finish.
  // Use distinct, documented model IDs. Avoid aliases such as
  // gemini-flash-latest that can resolve to the same exhausted model.
  const models = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
  ];
  const failures = [];

  for (const model of models) {
    logEvent('INFO', `[TEXT MODE] Trying Gemini model ${model}...`);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const detail = await response.text();
        if (/quota exceeded|generate_content_free_tier_requests|resource_exhausted|requests per day limit exceeded/i.test(detail)) {
          throw new Error(`GEMINI_QUOTA_EXHAUSTED: ${detail.slice(0, 500)}`);
        }
        throw new Error(`Gemini API error (${response.status}) on ${model}: ${detail.slice(0, 300)}`);
      }

      const data = await response.json();
      const raw = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
      if (!raw) {
        const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'No candidate text returned';
        throw new Error(`Gemini returned no answer text (${reason}).`);
      }

      let parsed;
      try {
        parsed = parseGeminiJson(raw);
        if (parsed.parseWarning) parsed = { rawText: raw, answers: [], allChoices: [], dropdowns: [] };
      } catch {
        parsed = { rawText: raw, answers: [], allChoices: [], dropdowns: [] };
      }
      const result = normalizeAndExtractAnswers(parsed, questionText);
      if (!result.answers.length && !result.rawText) result.rawText = raw;
      result.provider = 'gemini';
      result.model = model;
      logEvent('INFO', `[TEXT MODE] Gemini model ${model} returned a plain-text response.`);
      return result;
    } catch (error) {
      const message = error?.message || String(error);
      failures.push(`${model}: ${message}`);
      logEvent('INFO', `[TEXT MODE] ${model} failed: ${message}`);
      if (message.includes('GEMINI_QUOTA_EXHAUSTED')) {
        // Gemini quotas are model-specific in many projects. Continue only
        // to a different model ID; aliases have already been removed above.
        logEvent('INFO', `[TEXT MODE] Quota exhausted for ${model}; trying the next distinct model.`);
      }
    }
  }

  throw new Error('All direct Gemini models failed. ' + failures.join(' | '));
}

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
