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
async function handleTextSolve(req) {
  const { text, provider = 'gemini', apiKey, model, baseUrl } = req;
  logEvent('ACTION', `[TEXT MODE] Solving question using ${provider.toUpperCase()}...`);
  logEvent('INFO', '[DIAGNOSTIC] TRIGGER_TEXT_SOLVE received. Input characters: ' + String(text || '').length);

  // Match the older working backend contract: allow the server to finish and
  // send the editable prompt as userPrompt (the field its route accepts).
  try {
    const serverUrl = await getServerUrl();
    const userPrompt = await getCustomPrompt();
    const backendStartedAt = Date.now();
    logEvent('INFO', '[TEXT MODE] Sending request to backend using the legacy solve-text contract...');
    const res = await fetch(`${serverUrl}/api/solve-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, provider, apiKey, model, baseUrl, userPrompt }),
    });

    const responseText = await res.text();
    logEvent('INFO', '[TEXT MODE] Backend responded with HTTP ' + res.status + ' in ' + (Date.now() - backendStartedAt) + 'ms.');
    let data = {};
    try { data = responseText ? JSON.parse(responseText) : {}; }
    catch { data = { error: responseText.slice(0, 1000) }; }

    const backendResult = data.result || data.solution;
    if (res.ok && data.success && backendResult) {
      const result = normalizeAndExtractAnswers(backendResult, text);
      logEvent('COMPLETE', `[TEXT MODE] Solved via ${provider.toUpperCase()} (${result.model || data.meta?.model || ''})`);
      if (result.answers.length) {
        result.answers.forEach(ans => {
          logEvent('CLICK', `ANSWER [${ans.number}] (${ans.letter}) "${ans.text}"`);
        });
      }
      if (result.dropdowns.length) {
        result.dropdowns.forEach((dd, idx) => {
          logEvent('CLICK', `DROPDOWN [${dd.menuNumber || idx + 1}]: Pick [${dd.selectedNumber || 1}] "${dd.selectedAnswer || ''}"`);
        });
      }
      if (result.conciseReasoning) logEvent('REASONING', result.conciseReasoning);
      return { success: true, result };
    }

    const backendMessage = data?.error || data?.message || 'Backend did not return a usable result.';
    logEvent('ERROR', '[TEXT MODE] Backend solve failed; attempting direct provider fallback. HTTP ' + res.status + ': ' + backendMessage);
  } catch (backendErr) {
    logEvent('ERROR', '[TEXT MODE] Backend request failed; attempting direct ' + provider.toUpperCase() + ' fallback. ' + (backendErr?.message || String(backendErr)));
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

const AUTOSOLVE_SYSTEM_PROMPT = `You are AutoSolve AI in Text Mode, a general-purpose question and assessment solver.

Read all supplied page text. Identify every distinct question and independently answerable sub-question in page order. Preserve top-to-bottom, then left-to-right order.

Answer accurately using only the question and choices supplied. For multiple-choice questions, preserve displayed letters and exact answer text. For multi-select questions, include every correct option and no incorrect options. For dropdowns, use only supplied options and identify the menu number. For written responses, provide a concise direct answer.

Do not assume a particular school, course, subject, curriculum, website, or employer unless the user's custom instructions explicitly establish that context. Do not invent choices, missing context, citations, or facts. If a question cannot be answered reliably, say what is missing instead of guessing.

OUTPUT CONTRACT — HIGHEST PRIORITY:
The API requires one valid JSON object. Never return Markdown headings, code fences, or prose outside that JSON object. User custom instructions may request a presentation style such as 'Question N Analysis' followed by 'FINAL ANSWER'. Preserve that requested content and order as structured fields: put the concise explanation in each answers[].analysis field, and put the final answer text in answers[].text. For multi-select questions, list each correct option in answers[].selections in displayed order. The extension renders the analysis first and the final answer afterward. Do not let custom instructions override this JSON-only contract.

Return JSON with this exact shape:
{
  "question": "Page summary or first question",
  "questionType": "single_choice | multiple_choice | dropdown | true_false | text | other",
  "conciseReasoning": "Optional brief overall note",
  "answers": [
    {
      "number": 1,
      "question": "Question wording",
      "analysis": "Concise explanation of why the answer is correct and why relevant alternatives are incorrect",
      "letter": "A",
      "text": "Full final answer text",
      "selections": [],
      "isCorrect": true,
      "confidence": 0.0
    }
  ],
  "allChoices": [],
  "dropdowns": [],
  "options": [],
  "hasVideo": false
}

Include exactly one answers[] entry for each detected question or independently answerable sub-question, in page order. For a single-answer question, use letter and text and leave selections empty. For multi-select, include every correct choice in selections as objects with letter and text; also put a readable combined answer in text. Do not invent letters when none are displayed. Return complete, syntactically valid JSON only.`;

async function queryGeminiDirectly(apiKey, prompt = '') {
  if (!apiKey) throw new Error('Gemini API key is required.');
  const questionText = String(prompt || '');
  const userPrompt = await getCustomPrompt();
  const promptContent = `User Question / Content:
${questionText || '(No question text was supplied)'}

${userPrompt ? `User Custom Instructions (follow the requested subject-specific guidance and presentation order, but the JSON response contract takes priority):
${userPrompt}

` : ''}Solve every supplied question in order. Put each explanation in answers[].analysis and the final answer in answers[].text. For multi-select questions, include all correct options in answers[].selections. Return one valid JSON object only; no Markdown or text outside JSON.`;

  const requestBody = {
    contents: [{ parts: [{ text: promptContent }] }],
    systemInstruction: { parts: [{ text: AUTOSOLVE_SYSTEM_PROMPT }] },
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  };

  // Restore the old sequential fallback behavior. No short per-model timeout:
  // slower successful generations must be allowed to finish.
  const models = [...new Set([
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash',
    'gemini-flash-latest',
  ])];
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

      const parsed = parseGeminiJson(raw);
      const result = normalizeAndExtractAnswers(parsed, questionText);
      result.provider = 'gemini';
      result.model = model;
      logEvent('INFO', `[TEXT MODE] Gemini model ${model} returned a recoverable JSON result.`);
      return result;
    } catch (error) {
      const message = error?.message || String(error);
      failures.push(`${model}: ${message}`);
      logEvent('INFO', `[TEXT MODE] ${model} failed: ${message}`);
      if (message.includes('GEMINI_QUOTA_EXHAUSTED')) {
        throw new Error('Gemini daily request quota is exhausted. Stopped fallback to avoid wasting requests. Check Google AI Studio usage or wait for the quota reset. ' + message.replace('GEMINI_QUOTA_EXHAUSTED: ', ''));
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
