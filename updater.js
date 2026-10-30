// AutoSolve AI update status and download controls.
document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('update-status');
  const downloadButton = document.getElementById('update-download');
  const releaseLink = document.getElementById('update-release-link');
  if (!status || !downloadButton) return;

  async function checkForUpdates() {
    status.textContent = 'Checking GitHub for updates...';
    downloadButton.disabled = true;
    downloadButton.style.opacity = '0.55';
    try {
      const result = await chrome.runtime.sendMessage({ action: 'CHECK_FOR_UPDATES' });
      if (!result || !result.success) throw new Error(result?.error || 'Update check failed');
      if (result.updateAvailable) {
        status.textContent = `Update available: v${result.latestVersion} (installed: v${result.currentVersion})`;
        downloadButton.disabled = false;
        downloadButton.style.opacity = '1';
        releaseLink.href = result.releaseUrl;
        releaseLink.style.display = 'inline';
        downloadButton.dataset.downloadUrl = result.downloadUrl;
        downloadButton.dataset.filename = `AutoSolveAI-v${result.latestVersion}.zip`;
      } else {
        status.textContent = `AutoSolve AI is up to date (v${result.currentVersion}).`;
        releaseLink.style.display = 'none';
      }
    } catch (error) {
      status.textContent = `Update check unavailable: ${error.message}`;
    }
  }

  downloadButton.addEventListener('click', async () => {
    const url = downloadButton.dataset.downloadUrl;
    if (!url) return;
    downloadButton.disabled = true;
    downloadButton.textContent = 'Starting...';
    status.textContent = 'Preparing update download...';
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'DOWNLOAD_EXTENSION_UPDATE',
        url,
        filename: downloadButton.dataset.filename || 'AutoSolveAI-update.zip',
      });
      if (!result?.success) throw new Error(result?.error || 'Download could not be started');
      status.textContent = 'Download started. Extract the ZIP, then load the extracted folder from chrome://extensions.';
      downloadButton.textContent = 'Download started';
    } catch (error) {
      status.textContent = `Download failed: ${error.message}`;
      downloadButton.disabled = false;
      downloadButton.textContent = 'Download update';
    }
  });

  checkForUpdates();
});