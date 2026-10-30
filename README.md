# AutoSolve AI

Chrome extension that answers page questions using a configured AI provider.

## Automatic GitHub updates

Every commit pushed to `main` triggers GitHub Actions to build a versioned extension ZIP and publish it as a GitHub Release. The extension checks for releases when it starts, when its popup opens, and every six hours while Chrome is running.

When an update is available, open the extension popup and choose **Download update**. The ZIP is saved through Chrome's download manager.

### Apply an update on Chromebook / Chrome

An unpacked extension cannot replace its own installed files or silently reload itself. After downloading:

1. Open the downloaded ZIP in the ChromeOS Files app and extract it.
2. Keep the extracted extension folder in a permanent location (do not delete it after loading).
3. Open `chrome://extensions`.
4. Find AutoSolve AI and click **Reload** if you replaced the files in the same folder. If you extracted to a new folder, remove the old unpacked entry and choose **Load unpacked**, then select the new extracted folder.
5. The extension should now show the version from the downloaded release.

Your saved API keys and settings are stored by Chrome and are not included in the update ZIP.

The updater downloads code only from this repository's GitHub Releases. It does not install or activate updates automatically.
