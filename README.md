# AutoSolve AI

Text-first Chrome extension that extracts visible webpage text, sends the full question set to the configured AI provider, and returns numbered answers in page order. Page progression remains manual.

## Setup

1. Open the repository and download the extension files, or use the repository's current release package.
2. Extract the extension folder.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Select **Load unpacked** and choose the extension folder.
5. Open **Full Settings**, select an AI provider, enter its API key, and save.

## Updating

The built-in updater checks the repository's current branch through jsDelivr rather than relying on GitHub's anonymous REST API rate limit. Open the updater page from the extension to link the exact folder loaded in Chrome and configure update access. Keep that folder in the same location.

After an update is installed, reload AutoSolve AI at `chrome://extensions` if Chrome does not reload it automatically. The updater does not replace the folder selected in Chrome with a new folder.

## Solving

- Paste question text or use **Auto-Copy Page & Solve**.
- AutoSolve reads the full supplied text and returns answers in page order.
- It does not click answer choices or automatically advance the page.
- The editable instructions in Full Settings are added to the built-in solving instructions; they do not replace the core JSON/output requirements.

API keys and preferences are stored in the browser's extension storage and are not included in repository files.
