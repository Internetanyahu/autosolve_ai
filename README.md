# AutoSolve AI

Chrome extension that answers page questions using a configured AI provider.

## Automatic GitHub updates

Every commit pushed to `main` triggers GitHub Actions to build a versioned extension ZIP and publish it as a GitHub Release. The extension checks for releases when it starts, when its popup opens, and every six hours while Chrome is running.

When an update is available, open the extension popup and choose **Download update**. The ZIP is saved through Chrome's download manager.

### First-time setup of the updater

The updater is included in the release ZIP. If you are using an older copy of the extension, download the current release once and install it manually:

1. Download the ZIP from [GitHub Releases](https://github.com/SK64HD/autosolve_ai/releases/latest).
2. Extract it in the ChromeOS Files app.
3. Open `chrome://extensions`, enable Developer mode, and use **Load unpacked** to select the extracted extension folder.

### Applying later updates

1. Download the update from the extension popup.
2. Extract the ZIP to a temporary folder.
3. Copy the extracted files into the **same folder** you originally loaded as an unpacked extension, replacing the older files.
4. Open `chrome://extensions` and click **Reload** on AutoSolve AI.

Keep the original extension folder path unchanged. Chrome ties unpacked-extension storage to its identity, and changing the folder can cause saved API keys and preferences to appear missing. The ZIP does not contain your API keys or settings.

An unpacked extension cannot replace its own installed files or silently reload itself. The updater automates release detection and downloading; the final file replacement and reload remain manual.
