document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("update-status");
  const button = document.getElementById("update-download");
  const releaseLink = document.getElementById("update-release-link");
  if (!status || !button) return;

  // The setup page must remain reachable even if GitHub's background check is slow.
  // Checking status must never disable the only button that opens the folder picker.
  button.disabled = false;
  button.style.opacity = "1";

  async function refreshUpdateStatus() {
    status.textContent = "Checking GitHub for updates…";
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
    } catch (error) {
      status.textContent = "Update check unavailable: " + (error?.message || error);
      button.textContent = "Set up";
    } finally {
      button.disabled = false;
      button.style.opacity = "1";
    }
  }

  button.addEventListener("click", async () => {
    // Open immediately; do not wait for a second GitHub check before showing setup.
    button.disabled = true;
    button.textContent = "Opening…";
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL("updater.html") });
    } catch (error) {
      status.textContent = "Could not open updater: " + (error?.message || error);
    } finally {
      button.disabled = false;
      button.textContent = "Set up";
    }
  });

  refreshUpdateStatus();
});
