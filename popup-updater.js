document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("update-status");
  const button = document.getElementById("update-download");
  const releaseLink = document.getElementById("update-release-link");
  if (!status || !button) return;

  async function refreshUpdateStatus() {
    status.textContent = "Checking GitHub for updates…";
    button.disabled = true;
    button.style.opacity = "0.55";
    try {
      const response = await chrome.runtime.sendMessage({ action: "CHECK_FOR_UPDATES" });
      const info = response?.updateStatus;
      if (!info) throw new Error(response?.error || "Update check failed.");
      if (releaseLink) releaseLink.style.display = "none";
      if (info.error) throw new Error(info.error);
      if (!info.linked) {
        status.textContent = info.updateAvailable
          ? "Update available. Link the extension folder to install it in place."
          : "Link the extension folder once to enable in-place updates.";
        button.textContent = "Set up";
      } else if (info.updateAvailable) {
        status.textContent = "Update available. Changed files can be installed directly.";
        button.textContent = "Install update";
      } else {
        status.textContent = "AutoSolve AI is up to date.";
        button.textContent = "Update settings";
      }
      button.disabled = false;
      button.style.opacity = "1";
    } catch (error) {
      status.textContent = "Update check unavailable: " + error.message;
      button.textContent = "Update settings";
      button.disabled = false;
      button.style.opacity = "1";
    }
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Opening…";
    try {
      const response = await chrome.runtime.sendMessage({ action: "CHECK_FOR_UPDATES" });
      const info = response?.updateStatus;
      if (info?.linked && info.permission === "granted" && info.updateAvailable) {
        status.textContent = "Installing changed files…";
        const result = await chrome.runtime.sendMessage({ action: "APPLY_EXTENSION_UPDATE" });
        if (result?.ok) {
          status.textContent = result.reload ? "Files replaced. Reloading AutoSolve AI…" : "Already up to date.";
          if (!result.reload) await refreshUpdateStatus();
          return;
        }
      }
      await chrome.tabs.create({ url: chrome.runtime.getURL("updater.html?apply=1") });
    } catch (error) {
      status.textContent = "Could not open updater: " + error.message;
      button.disabled = false;
      button.textContent = "Update settings";
    }
  });
  refreshUpdateStatus();
});
