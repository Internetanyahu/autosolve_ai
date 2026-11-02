# Existing Google AI Studio App — Corrected Source

This folder contains corrected source files for the **existing Gemini-built AutoSolve AI application**. It is not a separate backend service and does not require creating or deploying another endpoint.

## Files to replace in the existing AI Studio project

- Replace the project's root `server.ts` with `aistudio-app/server.ts`.
- Replace the project's `src/App.tsx` with `aistudio-app/src/App.tsx`.

Keep the rest of the original AI Studio project files and dependencies. The replacement server preserves the original app's other routes and Vite hosting setup while correcting the text-solving path.

After replacing the files in the existing AI Studio project, save the project there. Continue using its existing app URL; no new Cloud Run service or endpoint is required.

## Text-mode corrections

- One model request per solve. No Gemini model rotation or automatic retry after quota, network, timeout, or response errors.
- Provider requests have a 180-second timeout and return a clear timeout error.
- Gemini API-key verification uses the model-list endpoint instead of spending `generateContent` quota on multiple test prompts.
- Removed hardcoded English 4 / Edgenuity assumptions and canned answer reconstruction from the text solver.
- No invented answer choices or forced answers when the page is incomplete.
- Parses valid JSON, fenced JSON, and embedded JSON objects.
- Preserves ordinary plain-text model responses instead of failing on JSON parsing.
- The text-mode UI starts blank, has no screenshot attachment control, and includes editable additional instructions saved in the browser.
- The text-mode UI no longer silently sends English 4-specific instructions.
- The Chrome extension now stops waiting after 185 seconds; its popup reports timeout at 190 seconds.
- The extension sends the custom model only when the Custom provider is selected.

## Important

A GitHub commit does not automatically alter an already-running AI Studio project unless that project is connected to and syncing this repository. These files are the corrected source to place into the existing AI Studio project. Do not create a second backend service.
