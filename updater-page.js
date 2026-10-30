const $ = id => document.getElementById(id);
const logEl = $("log");
const linkButton = $("link");
const checkButton = $("check");
const applyButton = $("apply");
let busy = false;
let checkPromise = null;

const log = message => { logEl.textContent += "\n" + message; };
const getToken = async () => (await chrome.storage.local.get("githubFineGrainedToken")).githubFineGrainedToken || "";
const short = sha => (sha || "").slice(0, 7);

function setBusy(value) {
  busy = value;
  linkButton.disabled = value;
  checkButton.disabled = value || Boolean(checkPromise);
  applyButton.disabled = value;
}

function render() {
  // Coalesce startup, button, and post-link refreshes into one GitHub request.
  if (checkPromise) return checkPromise;

  $("version").textContent = "Installed version v" + chrome.runtime.getManifest().version;
  $("updateStatus").className = "msg";
  $("updateStatus").textContent = "Checking GitHub…";
  checkButton.disabled = true;

  checkPromise = (async () => {
    const updateStatus = $("updateStatus");
    const linkStatus = $("linkStatus");
    const repoLink = $("repoLink");

    try {
      const response = await chrome.runtime.sendMessage({ action: "CHECK_FOR_UPDATES" });
      const info = response?.updateStatus;

      if (!info) {
        throw new Error(response?.error || "Couldn't reach the extension's background worker.");
      }

      if (repoLink) {
        repoLink.href = info.githubUrl || "https://github.com/SK64HD/autosolve_ai";
        repoLink.style.display = info.error ? "inline" : "none";
      }

      linkStatus.className = "msg" + (info.linked ? " good" : "");
      linkStatus.textContent = info.linked
        ? (info.permission === "granted"
          ? "Linked. Folder access is active."
          : "Linked. Chrome will ask again for folder access when needed.")
        : "Not linked yet.";

      applyButton.disabled = busy || !info.linked || !info.updateAvailable;

      if (info.error) {
        updateStatus.className = "msg error";
        updateStatus.textContent = info.error;
      } else if (info.updateAvailable) {
        updateStatus.className = "msg";
        updateStatus.textContent = "An update is available (" + short(info.remoteSha) + ").";
      } else {
        updateStatus.className = "msg good";
        updateStatus.textContent = "Up to date.";
      }
      return info;
    } catch (error) {
      if (repoLink) {
        repoLink.href = "https://github.com/SK64HD/autosolve_ai";
        repoLink.style.display = "inline";
      }
      updateStatus.className = "msg error";
      updateStatus.textContent = error?.message || String(error);
      applyButton.disabled = true;
      return null;
    }
  })().finally(() => {
    checkPromise = null;
    checkButton.disabled = busy;
  });

  return checkPromise;
}

async function installUpdate() {
  if (busy) return;
  setBusy(true);
  try {
    log("Comparing installed files with GitHub…");
    const result = await AutoSolveUpdater.apply(await getToken(), { interactive: true });
    if (!result.ok) {
      log(result.error || "Update failed.");
      return;
    }
    if (result.reload) {
      log("Replaced " + result.changed.length + " changed file(s):\n  " + result.changed.join("\n  "));
      log("Reloading AutoSolve AI…");
      setTimeout(() => chrome.runtime.reload(), 700);
      return;
    }
    log("All installed files already match GitHub.");
    await render();
  } catch (error) {
    log("Update failed: " + (error?.message || error));
  } finally {
    setBusy(false);
  }
}

linkButton.addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try {
    const name = await AutoSolveUpdater.linkFolder();
    log("Linked folder: " + name);
  } catch (error) {
    if (error?.name === "AbortError") log("Folder selection cancelled.");
    else log("Couldn't link folder: " + (error?.message || error));
    setBusy(false);
    await render();
    return;
  }
  setBusy(false);
  await render();
});

checkButton.addEventListener("click", async () => {
  if (busy || checkPromise) return;
  log("Checking GitHub…");
  const info = await render();
  if (info && !info.error) {
    log(info.updateAvailable ? "Update available." : "Already up to date.");
  }
});

applyButton.addEventListener("click", installUpdate);

// Exactly one initial check. Further checks happen only after a manual click
// or after the user links the folder.
render();
