const $ = id => document.getElementById(id);
const logEl = $("log");
const linkButton = $("link");
const checkButton = $("check");
const applyButton = $("apply");
let busy = false;

const log = message => { logEl.textContent += "\n" + message; };
const getToken = async () => (await chrome.storage.local.get("githubFineGrainedToken")).githubFineGrainedToken || "";
const short = sha => (sha || "").slice(0, 7);

function setBusy(value) {
  busy = value;
  for (const button of [linkButton, checkButton, applyButton]) button.disabled = value;
}

async function render() {
  $("version").textContent = "Installed version v" + chrome.runtime.getManifest().version;
  const response = await chrome.runtime.sendMessage({ action: "CHECK_FOR_UPDATES" });
  const info = response?.updateStatus;
  const linkStatus = $("linkStatus");
  const updateStatus = $("updateStatus");
  const repoLink = $("repoLink");

  if (!info) {
    updateStatus.className = "msg error";
    updateStatus.textContent = response?.error || "Couldn't reach the extension's background worker.";
    if (repoLink) repoLink.style.display = "inline";
    return info;
  }

  if (repoLink) {
    repoLink.href = info.githubUrl || "https://github.com/SK64HD/autosolve_ai";
    repoLink.style.display = info.error ? "inline" : "none";
  }

  linkStatus.className = "msg" + (info.linked ? " good" : "");
  linkStatus.textContent = info.linked
    ? (info.permission === "granted"
      ? "Linked. Folder access is active."
      : "Linked. Chrome will ask once more to allow access when you install an update.")
    : "Not linked yet.";

  applyButton.disabled = !info.linked;
  if (info.error) {
    updateStatus.className = "msg error";
    updateStatus.textContent = info.error;
  } else if (info.updateAvailable) {
    updateStatus.className = "msg";
    updateStatus.textContent = "An update is available (" + short(info.remoteSha) + ").";
  } else {
    updateStatus.className = "msg good";
    updateStatus.textContent = "Up to date." + (info.linked ? "" : " Link the folder so future updates install automatically.");
  }
  return info;
}

async function installUpdate() {
  if (busy) return;
  setBusy(true);
  try {
    log("Comparing local files with GitHub…");
    const result = await AutoSolveUpdater.apply(await getToken(), { interactive: true });
    if (!result.ok) {
      log(result.error || "Update failed.");
      return;
    }
    if (result.reload) {
      log("Updated " + result.changed.length + " file(s):\n  " + result.changed.join("\n  "));
      log("Reloading AutoSolve AI…");
      setTimeout(() => chrome.runtime.reload(), 700);
      return;
    }
    log("Everything already matches GitHub. Nothing to install.");
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
  // Match PPUSA: immediately bring the linked folder up to date.
  await installUpdate();
  if (!busy) await render();
});

checkButton.addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  log("Checking GitHub…");
  try {
    const info = await render();
    if (info && !info.error) log(info.updateAvailable ? "Update available." : "Already up to date.");
  } catch (error) {
    log("GitHub check failed: " + (error?.message || error));
  } finally {
    setBusy(false);
  }
});
applyButton.addEventListener("click", installUpdate);

(async () => {
  try {
    const info = await render();
    if (new URLSearchParams(location.search).get("apply") === "1" && info?.linked) {
      if (info.permission === "granted") installUpdate();
      else log("Click \"Install update\" and allow folder access when Chrome asks.");
    }
  } catch (error) {
    $("updateStatus").className = "msg error";
    $("updateStatus").textContent = error?.message || String(error);
  }
})();
