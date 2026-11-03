# AutoSolve AI

Text-first Chrome extension that extracts visible webpage text and answers questions in page order. Page progression remains manual.

## AI model and cost

AutoSolve uses exactly one model: `gemini-3.1-flash-lite`.

- Uses Google's Gemini Developer API.
- Configured for the Gemini API free tier.
- No OpenAI, Claude, DeepSeek, OpenRouter, custom-provider, or paid-model fallback.
- No automatic model switching when quota is exhausted.
- Output is capped at 4,096 tokens per request to limit unnecessary generation.
- Free-tier rate limits and availability are controlled by Google and can change. If the free quota is exhausted, the request stops instead of switching to a paid model.

Google model and pricing references:
- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
- https://ai.google.dev/gemini-api/docs/pricing

## Initial setup

1. Open **Full Settings** from the extension.
2. Create or use a Gemini API key from Google AI Studio.
3. Paste the key into **Google Gemini API Key** and save.
4. Use **Test Gemini Key** to verify access to the fixed model.

## Updating

The built-in updater checks the `main` branch through jsDelivr's CDN mirror. It does not use a GitHub API token.

1. Open **Update settings** from the extension.
2. Select the exact folder originally loaded with Chrome's **Load unpacked** button.
3. Grant Chrome permission to read and write that folder.
4. The updater checks for changed files on startup and every 15 minutes. It installs available changes into that same folder and reloads the extension.

Keep the original folder in the same location. If Chrome revokes folder permission, reopen the updater page and grant it again.

## Solving

- Paste question text or use **Auto-Copy Page & Solve**.
- AutoSolve processes the supplied text and returns answers in page order.
- It does not click answer choices or automatically advance the page.
- Optional custom instructions are added to the built-in solving instructions.
- API keys and preferences are stored in browser extension storage and are not included in repository files.
