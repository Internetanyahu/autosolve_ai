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

## Deploy to Google Cloud Run

The included Dockerfile is suitable for Cloud Run. The source is not live until it is deployed.

1. Open [Google Cloud Shell](https://console.cloud.google.com/?cloudshell=true) in the Google account that owns the current Cloud Run project.
2. Confirm the active project:
   ```sh
   gcloud config get-value project
   ```
3. Clone the repository and deploy the backend as a separate service:
   ```sh
   git clone https://github.com/Internetanyahu/autosolve_ai.git
   cd autosolve_ai
   gcloud run deploy autosolve-ai-backend --source backend --region us-west2 --allow-unauthenticated
   ```
4. Copy the service URL printed by the deployment. Check it with:
   ```sh
   gcloud run services describe autosolve-ai-backend --region us-west2 --format='value(status.url)'
   ```
5. The extension must then be pointed at that new URL by changing `DEFAULT_SERVER_URL` in the repository-root `background.js`. Do not change it before the new service responds successfully at `/api/status`.

If Cloud Run asks to enable APIs or create a build service account, approve the requested setup. The deployment creates a new Cloud Run service; it does not overwrite the existing AI Studio service.
