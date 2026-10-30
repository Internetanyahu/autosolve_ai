document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('selectedAiProvider');
  const githubTokenInput = document.getElementById('githubFineGrainedToken');
  const geminiKeyInput = document.getElementById('geminiApiKey');
  const openaiKeyInput = document.getElementById('openaiApiKey');
  const claudeKeyInput = document.getElementById('claudeApiKey');
  const deepseekKeyInput = document.getElementById('deepseekApiKey');
  const customBaseUrlInput = document.getElementById('customBaseUrl');
  const customModelInput = document.getElementById('customModel');
  const customApiKeyInput = document.getElementById('customApiKey');
  const customPromptInput = document.getElementById('customPrompt');

  const speedInput = document.getElementById('videoSpeed');
  const waitInput = document.getElementById('videoWaitSeconds');
  const saveBtn = document.getElementById('save-btn');
  const testBtn = document.getElementById('test-btn');
  const statusMsg = document.getElementById('status-msg');

  function showStatus(text, isError = false) {
    statusMsg.textContent = text;
    statusMsg.className = isError ? 'status-error' : 'status-success';
    statusMsg.style.display = 'block';
  }

  // Load saved preferences
  chrome.storage.sync.get(
    {
      selectedAiProvider: 'gemini',
      geminiApiKey: '',
      openaiApiKey: '',
      claudeApiKey: '',
      deepseekApiKey: '',
      customBaseUrl: '',
      customModel: '',
      customApiKey: '',
      videoSpeed: 16,
      videoWaitSeconds: 15,
      customPrompt: '',
    },
    (data) => {
      if (providerSelect) providerSelect.value = data.selectedAiProvider || 'gemini';
      geminiKeyInput.value = data.geminiApiKey || '';
      openaiKeyInput.value = data.openaiApiKey || '';
      claudeKeyInput.value = data.claudeApiKey || '';
      deepseekKeyInput.value = data.deepseekApiKey || '';
      customBaseUrlInput.value = data.customBaseUrl || '';
      customModelInput.value = data.customModel || '';
      customApiKeyInput.value = data.customApiKey || '';
      if (customPromptInput) {
        if (data.customPrompt) customPromptInput.value = data.customPrompt;
        else fetch(chrome.runtime.getURL('prompt.txt')).then(r => r.text()).then(t => { if (!customPromptInput.value) customPromptInput.value = t; }).catch(() => {});
      }
      speedInput.value = data.videoSpeed || 16;
      waitInput.value = data.videoWaitSeconds || 15;
    }
  );

  chrome.storage.local.get(['githubFineGrainedToken'], (data) => {
    githubTokenInput.value = data.githubFineGrainedToken || '';
  });

  saveBtn.onclick = () => {
    const payload = {
      selectedAiProvider: providerSelect ? providerSelect.value : 'gemini',
      geminiApiKey: geminiKeyInput.value.trim(),
      openaiApiKey: openaiKeyInput.value.trim(),
      claudeApiKey: claudeKeyInput.value.trim(),
      deepseekApiKey: deepseekKeyInput.value.trim(),
      customBaseUrl: customBaseUrlInput.value.trim(),
      customModel: customModelInput.value.trim(),
      customApiKey: customApiKeyInput.value.trim(),
      customPrompt: customPromptInput ? customPromptInput.value : '',
      videoSpeed: Math.min(16, Math.max(1, Number(speedInput.value) || 16)),
      videoWaitSeconds: Math.max(3, Number(waitInput.value) || 15),
    };

    chrome.storage.sync.set(payload, () => {
      chrome.storage.local.set({ githubFineGrainedToken: githubTokenInput.value.trim() }, () => {
      showStatus('Settings, API keys, and GitHub token saved successfully.');
      setTimeout(() => {
        statusMsg.style.display = 'none';
      }, 3500);
      });
    });
  };

  testBtn.onclick = async () => {
    const activeProvider = providerSelect ? providerSelect.value : 'gemini';
    const geminiKey = geminiKeyInput.value.trim();
    const openaiKey = openaiKeyInput.value.trim();
    const claudeKey = claudeKeyInput.value.trim();
    const deepseekKey = deepseekKeyInput.value.trim();
    const customKey = customApiKeyInput.value.trim();

    let targetKey = geminiKey;
    if (activeProvider === 'openai') targetKey = openaiKey;
    else if (activeProvider === 'anthropic' || activeProvider === 'claude') targetKey = claudeKey;
    else if (activeProvider === 'deepseek') targetKey = deepseekKey;
    else if (activeProvider === 'custom') targetKey = customKey;

    if (!targetKey) {
      targetKey = geminiKey || openaiKey || claudeKey || deepseekKey || customKey;
    }

    if (!targetKey) {
      showStatus('Please enter an API key for your chosen provider before testing.', true);
      return;
    }

    showStatus(`Verifying ${activeProvider.toUpperCase()} API key online...`);

    // 1. Try server verification first
    try {
      const res = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider,
          apiKey: targetKey,
          baseUrl: customBaseUrlInput.value.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.valid) {
          showStatus(`✓ ${activeProvider.toUpperCase()} Key Verified & Online! Latency: ${data.latencyMs}ms`);
          return;
        } else {
          showStatus(`✗ Key Verification Failed: ${data.error || 'Authentication rejected'}`, true);
          return;
        }
      }
    } catch {
      // Proceed to direct ping
    }

    // 2. Direct browser verification
    try {
      if (activeProvider === 'gemini') {
        const testModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
        let verified = false;
        let lastErr = '';
        for (const m of testModels) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${targetKey}`;
            const r = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
            });
            if (r.ok || r.status === 429) { verified = true; break; }
            const errData = await r.json().catch(() => ({}));
            lastErr = errData.error?.message || `HTTP ${r.status}`;
            if (r.status === 400 || r.status === 401 || r.status === 403) break;
          } catch (e) {
            lastErr = e.message;
          }
        }
        if (verified) {
          showStatus('✓ Google Gemini API Key Verified & Online!');
        } else {
          showStatus(`✗ Gemini Verification Error: ${lastErr || 'Invalid Key'}`, true);
        }
      } else if (activeProvider === 'openai') {
        const r = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${targetKey}` },
        });
        if (r.ok) {
          showStatus('✓ OpenAI API Key Verified & Online!');
        } else {
          showStatus(`✗ OpenAI Authentication Failed (HTTP ${r.status})`, true);
        }
      } else if (activeProvider === 'deepseek') {
        const r = await fetch('https://api.deepseek.com/models', {
          headers: { Authorization: `Bearer ${targetKey}` },
        });
        if (r.ok) {
          showStatus('✓ DeepSeek API Key Verified & Online!');
        } else {
          showStatus(`✗ DeepSeek Authentication Failed (HTTP ${r.status})`, true);
        }
      } else {
        showStatus(`✓ ${activeProvider.toUpperCase()} Key format saved. Ready to use.`);
      }
    } catch (e) {
      showStatus(`Connection failed: ${e.message}`, true);
    }
  };
});