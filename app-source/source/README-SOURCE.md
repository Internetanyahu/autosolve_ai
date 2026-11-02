# AutoSolve AI Studio source

This directory contains the original full-stack AI Studio project source, kept separate from the browser extension at the repository root. It is source-only: this workflow does not deploy or publish the application and does not run tests.

The corrected text-answer flow removes subject-specific answer assumptions, prevents automatic model rotation after provider failures, adds request timeouts and clearer errors, and keeps text mode separate from image input. The UI includes editable additional instructions.
