document.addEventListener('DOMContentLoaded', () => {
  const geminiKeyInput = document.getElementById('geminiApiKey');
  const customPromptInput = document.getElementById('customPrompt');
  const speedInput = document.getElementById('videoSpeed');
  const saveBtn = document.getElementById('save-btn');
  const testBtn = document.getElementById('test-btn');
  const statusMsg = document.getElementById('status-msg');

  function showStatus(message, isError = false) {
    statusMsg.textContent = message;
    statusMsg.className = isError ? 'status-error' : 'status-success';
    statusMsg.style.display = 'block';
  }

  chrome.storage.sync.get({ geminiApiKey: '', customPrompt: '', videoSpeed: 16 }, data => {
    geminiKeyInput.value = data.geminiApiKey || '';
    customPromptInput.value = data.customPrompt || '';
    speedInput.value = data.videoSpeed || 16;
    if (!customPromptInput.value) {
      fetch(chrome.runtime.getURL('prompt.txt')).then(response => response.text())
        .then(prompt => { if (!customPromptInput.value) customPromptInput.value = prompt; }).catch(() => {});
    }
  });

  async function verifyGeminiKey(key) {
    if (!key || key.trim().length < 5) throw new Error('Enter a Gemini API key first.');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite?key=' + encodeURIComponent(key);
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || ('HTTP ' + response.status));
    return true;
  }

  testBtn.onclick = async () => {
    testBtn.disabled = true;
    try {
      await verifyGeminiKey(geminiKeyInput.value.trim());
      showStatus('Gemini API key accepted. AutoSolve is locked to gemini-3.1-flash-lite.');
    } catch (error) {
      showStatus('Gemini key check failed: ' + error.message, true);
    } finally { testBtn.disabled = false; }
  };

  saveBtn.onclick = async () => {
    await chrome.storage.sync.set({
      selectedAiProvider: 'gemini',
      geminiApiKey: geminiKeyInput.value.trim(),
      customPrompt: customPromptInput.value,
      videoSpeed: Math.min(16, Math.max(1, Number(speedInput.value) || 16))
    });
    showStatus('Settings saved. Only Gemini 3.1 Flash-Lite will be used.');
  };
});
