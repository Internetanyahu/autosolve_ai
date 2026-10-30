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
    const headers = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    async function request(authToken) {
      const requestHeaders = { ...headers };
      if (authToken) requestHeaders.Authorization = "Bearer " + authToken;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        return await fetch(API + path, {
          headers: requestHeaders,
          cache: "no-store",
          signal: controller.signal
        });
      } catch (error) {
        if (error?.name === "AbortError") throw new Error("GitHub request timed out after 15 seconds.");
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    // Always try the public repository anonymously first. Only retry with the
    // saved token when GitHub says authentication/access may be required.
    let response = await request("");
    if ([401, 403, 404].includes(response.status) && token) {
      response = await request(token);
    }

    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) {
        throw new Error(
          response.status === 404
            ? "GitHub could not find this repository or branch. It may be private; verify the repository URL and saved token."
            : "GitHub denied access (" + response.status + "). Check the saved token's repository access."
        );
      }
      throw new Error("GitHub request failed (" + response.status + ").");
    }
    return response.json();
  }
  async function remoteExtensionSha(token) {
    // Resolve the branch to its commit, then use the commit's tree SHA.
    // The Git Trees API expects a SHA, not a branch name.
    const ref = await gh("/git/ref/heads/" + BRANCH, token);
    const commitSha = ref?.object?.sha;
    if (!commitSha) throw new Error("Could not resolve branch " + BRANCH + " on GitHub.");
    const commit = await gh("/git/commits/" + commitSha, token);
    const treeSha = commit?.tree?.sha;
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
      const remoteSha = await remoteExtensionSha(token);
      let appliedSha = prior.appliedSha;
      if (!appliedSha) {
        appliedSha = remoteSha;
        await chrome.storage.local.set({ updaterState: { ...prior, appliedSha } });
      }
      const handle = await getHandle().catch(() => null);
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

