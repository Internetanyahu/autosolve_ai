# AutoSolve AI

Text-first Chrome extension that extracts visible webpage text, sends the full question set to the configured AI provider, and returns numbered answers in page order. Page progression remains manual.

## Initial setup

1. On GitHub, open **Code → Download ZIP** and extract the repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the extracted AutoSolve AI folder.
4. Open **Full Settings**, select an AI provider, enter its API key, and save.

## Updating

The built-in updater checks the `main` branch through jsDelivr's CDN mirror. It does not use a GitHub API token.

1. Open **Update settings** from the extension.
2. Select the exact folder originally loaded with Chrome's **Load unpacked** button.
3. Grant Chrome permission to read and write that folder.
4. The updater checks for changed files on startup and every 15 minutes. It installs available changes into that same folder and reloads the extension.

Keep the original folder in the same location. If Chrome revokes folder permission, reopen the updater page and grant it again.

## Solving

- Paste question text or use **Auto-Copy Page & Solve**.
- AutoSolve processes the entire supplied text and returns answers in page order.
- It does not click answer choices or automatically advance the page.
- The editable instructions in Full Settings are sent to the backend with each solve request.

API keys and preferences are stored in the browser's extension storage and are not included in repository files.

## Backend

The standalone API source is in `backend/`.

- `GET /api/status` checks service availability.
- `POST /api/solve-text` routes a text-solving request to Gemini, OpenAI, Anthropic, DeepSeek, or a custom OpenAI-compatible endpoint.
- Provider API keys are supplied by the extension per request and are not stored or logged by the backend.
- The backend makes one model request per solve. It does not rotate through fallback model IDs after quota or response errors.
- JSON output is parsed; plain-text output is preserved for the extension to display.

The extension currently points to the existing Cloud Run URL. Adding backend source to GitHub does not deploy it or change that live service. The included `backend/Dockerfile` can be used to deploy the new source to Cloud Run when deployment credentials and service settings are configured.
