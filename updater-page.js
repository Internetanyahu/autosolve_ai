const $ = id => document.getElementById(id);
const logEl = $("log");
const linkButton = $("link");
const checkButton = $("check");
const applyButton = $("apply");
const autoUpdateEl = $("autoUpdate");
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
  if (!info) {
    updateStatus.className = "msg error";
    updateStatus.textContent = response?.error || "Couldn't reach the extension's background worker.";
    return info;
  }
  linkStatus.className = "msg" + (info.linked ? " good" : "");
  linkStatus.textContent = info.linked
    ? (info.permission === "granted" ? "Linked. Folder access is active." : "Linked. Chrome will ask again for folder access when needed.")
    : "Not linked yet.";
  applyButton.disabled = !info.linked || !info.updateAvailable;
  if (info.error) {
    updateStatus.className = "msg error";
    updateStatus.textContent = info.error;
  } else if (info.updateAvailable) {
    updateStatus.className = "msg";
    updateStatus.textContent = "An update is available (" + short(info.remoteSha) + ").";
  } else {
    updateStatus.className = "msg good";
    updateStatus.textContent = "Up to date." + (info.linked ? "" : " Link the folder to enable automatic updates.");
  }
  return info;
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
  await installUpdate();
  if (!busy) await render();
});
checkButton.addEventListener("click", async () => {
  if (busy) return;
  log("Checking GitHub…");
  const info = await render();
  if (info && !info.error) log(info.updateAvailable ? "Update available." : "Already up to date.");
});
applyButton.addEventListener("click", installUpdate);
autoUpdateEl.addEventListener("change", () => chrome.storage.local.set({ autoUpdate: autoUpdateEl.checked }));
(async () => {
  const settings = await chrome.storage.local.get("autoUpdate");
  autoUpdateEl.checked = settings.autoUpdate !== false;
  const info = await render();
  if (new URLSearchParams(location.search).get("apply") === "1" && info?.linked) {
    if (info.permission === "granted") installUpdate();
    else log("Click Install update and allow folder access when Chrome asks.");
  }
})();
