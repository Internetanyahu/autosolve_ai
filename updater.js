// In-place updater for the unpacked extension.
//
// Chrome never auto-updates an unpacked extension, so this script does it
// directly: it compares the AutoSolve AI repository files on GitHub's main branch with the
// folder you loaded unpacked, downloads only the files that differ, writes them
// into that folder (via the File System Access API), and reloads the extension.
//
// Shared by background.js (importScripts) and updater.html (script tag).
(() => {
  if (self.AutoSolveUpdater) return;

  const REPO = "SK64HD/autosolve_ai";
  const BRANCH = "main";
  const EXPECTED_NAME = "AutoSolve AI - Text Q&A";
  const API = "https://api.github.com/repos/" + REPO;
  const HANDLE_KEY = "extensionDir";

  // ---- IndexedDB storage for the folder handle -------------------------------
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("autosolve-ai-updater", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("handles");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function idbRun(mode, action) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("handles", mode);
        const request = action(tx.objectStore("handles"));
        tx.oncomplete = () => resolve(request?.result ?? null);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  const getHandle = () => idbRun("readonly", store => store.get(HANDLE_KEY));
  const setHandle = handle => idbRun("readwrite", store => store.put(handle, HANDLE_KEY));
  const clearHandle = () => idbRun("readwrite", store => store.delete(HANDLE_KEY));

  // ---- GitHub helpers -----------------------------------------------------------
  async function gh(path, token) {
    if (!token) throw new Error("No GitHub token saved. Add a fine-grained GitHub token in the updater settings.");
    const response = await fetch(API + path, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      cache: "no-store"
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("GitHub rejected the saved token (" + response.status + ").");
    }
    if (response.status === 404) {
      throw new Error("Repository or branch not found (404). Check that the token can read " + REPO + ".");
    }
    if (!response.ok) throw new Error("GitHub request failed (" + response.status + ").");
    return response.json();
  }
  async function remoteExtensionSha(token) {
    // The Git Trees API accepts a branch name directly. This is the same
    // one-request check used by the PPUSA extension updater.
    const tree = await gh("/git/trees/" + BRANCH, token);
    const treeSha = tree?.sha;
    if (!treeSha) throw new Error("No repository tree found on " + BRANCH + ".");
    return treeSha;
  }
  async function remoteFiles(token, extensionSha) {
    const listing = await gh("/git/trees/" + extensionSha + "?recursive=1", token);
    if (listing.truncated) throw new Error("GitHub returned a truncated file list; refusing to update.");
    return (listing.tree || []).filter(item => item.type === "blob" && item.path !== "README.md" && !item.path.startsWith(".github/")).map(item => ({ path: item.path, sha: item.sha }));
  }
  async function downloadBlob(token, sha) {
    const blob = await gh("/git/blobs/" + sha, token);
    if (blob.encoding !== "base64") throw new Error("Unexpected blob encoding from GitHub.");
    const binary = atob(String(blob.content).replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // ---- Local file helpers -----------------------------------------------------------
  // Git identifies a file by SHA-1("blob <length>\0" + bytes), so local files can
  // be compared with GitHub's tree without downloading them.
  async function gitBlobSha(bytes) {
    const header = new TextEncoder().encode("blob " + bytes.length + "\0");
    const all = new Uint8Array(header.length + bytes.length);
    all.set(header);
    all.set(bytes, header.length);
    const digest = await crypto.subtle.digest("SHA-1", all);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  function stableJson(value) {
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
    }
    return JSON.stringify(value);
  }
  function manifestsEqualExceptVersion(leftBytes, rightBytes) {
    try {
      const left = JSON.parse(new TextDecoder().decode(leftBytes));
      const right = JSON.parse(new TextDecoder().decode(rightBytes));
      delete left.version;
      delete right.version;
      return stableJson(left) === stableJson(right);
    } catch { return false; }
  }
  function preserveInstalledManifestVersion(remoteBytes, localBytes) {
    const remote = JSON.parse(new TextDecoder().decode(remoteBytes));
    const local = JSON.parse(new TextDecoder().decode(localBytes));
    if (local.version) remote.version = local.version;
    return new TextEncoder().encode(JSON.stringify(remote, null, 2) + "\n");
  }
  async function readLocal(root, relativePath) {
    const parts = relativePath.split("/");
    const name = parts.pop();
    try {
      let dir = root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      const file = await (await dir.getFileHandle(name)).getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      if (error?.name === "NotFoundError" || error?.name === "TypeMismatchError") return null;
      throw error;
    }
  }
  async function writeLocal(root, relativePath, bytes) {
    const parts = relativePath.split("/");
    const name = parts.pop();
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  // ---- Folder linking (needs a visible page + user click) -------------------------
  async function findExtensionRoot(picked) {
    const candidates = [picked];
    try { candidates.push(await picked.getDirectoryHandle("autosolve_ai")); } catch { /* not the extension root */ }
    for (const candidate of candidates) {
      try {
        const file = await (await candidate.getFileHandle("manifest.json")).getFile();
        if (JSON.parse(await file.text()).name === EXPECTED_NAME) return candidate;
      } catch { /* try next */ }
    }
    throw new Error("That does not look like the AutoSolve AI folder. Choose the same folder you used for \"Load unpacked\" (the one containing manifest.json).");
  }
  async function linkFolder() {
    if (!self.showDirectoryPicker) throw new Error("This browser cannot open a folder picker. Use the latest Chrome version.");
    const picked = await self.showDirectoryPicker({ id: "autosolve-ai-extension", mode: "readwrite" });
    const root = await findExtensionRoot(picked);
    await setHandle(root);
    return root.name;
  }

  // ---- Public API ---------------------------------------------------------------------------
  async function getUpdaterState() {
    return (await chrome.storage.local.get("updaterState")).updaterState || {};
  }

  // Check the configured GitHub repository first. A local folder link is
  // relevant only when installing, never when discovering repository updates.
  async function check(token) {
    const prior = await getUpdaterState();
    try {
      const handle = await getHandle().catch(() => null);
      const activeToken = String(token || "").trim();
      const remoteSha = await remoteExtensionSha(activeToken);
      let appliedSha = prior.appliedSha;
      if (!appliedSha) {
        appliedSha = remoteSha;
        await chrome.storage.local.set({ updaterState: { ...prior, appliedSha } });
      }
      let permission = "none";
      if (handle) permission = await handle.queryPermission({ mode: "readwrite" }).catch(() => "prompt");
      return {
        currentVersion: chrome.runtime.getManifest().version,
        remoteSha, appliedSha,
        updateAvailable: remoteSha !== appliedSha,
        linked: Boolean(handle), permission,
        lastApplied: prior.lastApplied || null,
        checkedAt: new Date().toISOString(),
        githubUrl: "https://github.com/" + REPO,
        error: null
      };
    } catch (error) {
      const handle = await getHandle().catch(() => null);
      const message = error?.message || "GitHub check failed.";
      const authHint = !token
        ? " If the repository is private, save a fine-grained GitHub token with Contents: Read-only access."
        : "";
      return {
        currentVersion: chrome.runtime.getManifest().version,
        linked: Boolean(handle),
        lastApplied: prior.lastApplied || null,
        checkedAt: new Date().toISOString(),
        githubUrl: "https://github.com/" + REPO,
        error: message + authHint
      };
    }
  }

  // Downloads changed files and writes them into the linked folder.
  // The caller reloads the extension when result.reload is true.
  async function apply(token, { interactive = false } = {}) {
    if (!navigator.locks) return runApply(token, interactive);
    return navigator.locks.request("autosolve-ai-extension-update", { ifAvailable: true }, async lock => {
      if (!lock) return { ok: false, busy: true, error: "Another update is already running." };
      return runApply(token, interactive);
    });
  }
  async function runApply(token, interactive) {
    const handle = await getHandle();
    if (!handle) return { ok: false, needsLink: true, error: "The extension folder isn't linked yet. Link the folder containing manifest.json." };
    token = String(token || "").trim();
    let permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted" && interactive) permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") return { ok: false, needsPermission: true, error: "Folder access needs to be granted again." };

    const remoteSha = await remoteExtensionSha(token);
    const files = await remoteFiles(token, remoteSha);
    if (!files.some(file => file.path === "manifest.json")) throw new Error("The remote extension folder has no manifest.json; refusing to update.");

    const changed = [];
    for (const file of files) {
      const local = await readLocal(handle, file.path);
      if (file.path === "manifest.json" && local) {
        const remoteBytes = await downloadBlob(token, file.sha);
        if (await gitBlobSha(remoteBytes) !== file.sha) throw new Error("Download of manifest.json failed its integrity check.");
        if (!manifestsEqualExceptVersion(local, remoteBytes)) {
          changed.push({ ...file, preloadedBytes: remoteBytes, localManifest: local });
        }
      } else if (!local || await gitBlobSha(local) !== file.sha) {
        changed.push(file);
      }
    }
    // manifest.json goes last so a failure never leaves it pointing at missing files.
    changed.sort((a, b) => (a.path === "manifest.json") - (b.path === "manifest.json"));

    // Download and verify everything before writing anything.
    const downloaded = [];
    for (const file of changed) {
      const sourceBytes = file.preloadedBytes || await downloadBlob(token, file.sha);
      if (await gitBlobSha(sourceBytes) !== file.sha) throw new Error("Download of " + file.path + " failed its integrity check.");
      const bytes = file.path === "manifest.json" && file.localManifest
        ? preserveInstalledManifestVersion(sourceBytes, file.localManifest)
        : sourceBytes;
      downloaded.push({ file, bytes, sourceBytes });
    }
    const manifest = downloaded.find(item => item.file.path === "manifest.json");
    if (manifest) {
      const parsed = JSON.parse(new TextDecoder().decode(manifest.sourceBytes));
      if (parsed.manifest_version !== 3 || parsed.name !== EXPECTED_NAME) throw new Error("The new manifest.json doesn't look right; refusing to install it.");
    }

    for (const { file, bytes, sourceBytes } of downloaded) {
      await writeLocal(handle, file.path, bytes);
      const written = await readLocal(handle, file.path);
      const verified = file.path === "manifest.json"
        ? written && manifestsEqualExceptVersion(written, sourceBytes)
        : written && await gitBlobSha(written) === file.sha;
      if (!verified) throw new Error("Could not verify " + file.path + " after writing it.");
    }

    const prior = await getUpdaterState();
    await chrome.storage.local.set({
      updaterState: {
        ...prior,
        appliedSha: remoteSha,
        lastApplied: new Date().toISOString(),
        lastAppliedFiles: changed.map(file => file.path)
      }
    });
    return { ok: true, changed: changed.map(file => file.path), reload: changed.length > 0 };
  }

  self.AutoSolveUpdater = { check, apply, linkFolder, getHandle, clearHandle };
})();
