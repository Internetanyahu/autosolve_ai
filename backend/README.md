# AutoSolve AI Backend

Standalone text-solving API used by the Chrome extension in the repository root.

## Endpoints

- `GET /api/status` — health and configuration status.
- `POST /api/solve-text` — solves the supplied page text using the selected provider.

## Request

```json
{
  "text": "Full extracted page text",
  "provider": "gemini",
  "apiKey": "USER_API_KEY",
  "model": "",
  "baseUrl": "",
  "userPrompt": "Editable instructions from the extension"
}
```

Supported providers: `gemini`, `openai`, `anthropic` (also accepts `claude`), `deepseek`, and `custom` (OpenAI-compatible endpoints such as OpenRouter).

The extension supplies the API key from its own settings. Keys are used for the request only; they are not written to logs or persisted by this service. Do not add API keys to repository files or commit them.

## Response behavior

The API returns both `result` and `solution` for compatibility with the extension. Valid JSON model output is parsed into an object. Plain-text output is preserved in `result.rawText` and `result.conciseReasoning`, rather than being rejected as malformed JSON.

The backend makes one model request per solve. It does not cycle through Gemini model aliases or retry quota failures, preventing an exhausted quota from triggering additional requests.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

The service listens on port 8080 by default. Set `GEMINI_MODEL` to change the default Gemini model.

## Deploy

The included Dockerfile is suitable for Google Cloud Run. Deploying this source does not automatically change the currently hosted Cloud Run service; a deployment must be run separately.
