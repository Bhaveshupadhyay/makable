---
name: verify-web
description: Run the makable builder SPA in a headless browser and smoke-test the real UI (guest chat → Sandpack preview → connect GitHub from the chat → visual edits) with mock auth. Use after UI changes in apps/web or the portfolio template, before reporting a feature as done.
---

# Smoke-test the builder UI in headless Chromium

Playwright's Chromium is already cached at `~/Library/Caches/ms-playwright/chromium_headless_shell-*`. Don't add Playwright to the repo for this. Install `playwright-core` in the session scratchpad.

1. **Start the dev server** with mock auth on a fixed port, in the background:
   ```sh
   cd apps/web && VITE_MOCK_AUTH=true bun --bun vite --port 5199 --strictPort > <scratchpad>/vite.log 2>&1 &
   ```
   Wait until `curl -s localhost:5199` responds.

   **AI edits run on makable-backend (`POST /api/v1/ai/edit`) and need a real signed-in session.** The script checks
   first: with mock auth (or no backend) it prints `- AI edit: skipped` and only checks the code view, and the rest of
   the run continues. To run the AI steps, start the fake model (`bun .claude/skills/verify-web/mock-model.mjs &`) and
   the backend with `AI_BASE_URL=http://localhost:9999/v1 AI_DEBUG=true`, and sign in with real GitHub, which a
   headless browser can't do. Until then, test AI edits by hand.
2. **Set up the runner** (once per session):
   ```sh
   cd <scratchpad> && echo '{}' > package.json && bun add playwright-core
   cp <repo>/.claude/skills/verify-web/smoke.mjs .
   ```
3. **Run it:** `bun smoke.mjs` (env: `BASE_URL`, default `http://localhost:5199`; `OUT_DIR` for screenshots, default cwd). It prints each step and exits non-zero on failure or on any page/console error.
4. **Look at the screenshots** it writes (`about.png`, `chat-start.png`, `connect-github.png`, `ai-edit-pending.png`, `ai-edit-popover.png`, `ai-edit.png`, `code-view.png`, `builder.png`, `builder-static.png`, `builder-remote-assets.png`, `builder-mobile.png`, `session-import.png`, `account-menu.png`) with the Read tool. Check the layout, not just the assertions.
5. **Stop the servers:** `pkill -f 'vite --port 5199'; pkill -f mock-model.mjs`.

The run also exports the session (checks the file), starts over, refuses a broken file, then imports the export (Cancel first, then Replace) and checks the site comes back. The exported file lands in `OUT_DIR`.

**Publishing** needs a signed-in session, so it has its own script, `publish-smoke.mjs`: the real SPA against a scripted
makable-backend (Playwright routes answer `/api/v1`). Start the dev server **without** mock auth
(`VITE_MOCK_AUTH=false bun --bun vite --port 5199 --strictPort`), copy the script next to `smoke.mjs` and run
`bun publish-smoke.mjs`. It covers Vercel with a pasted token (saved first, the saved SHA sent, the deploy followed by its start time until
live, and the token never in the chat, localStorage or the workspace saves), a republish with an overwrite prompt that
still deploys with nothing new, and
Netlify with the secret added on GitHub (deploy refused until it's there, a failed deploy). Screenshots:
`publish-token.png`, `publish-live.png`, `publish-failed.png`. It never reaches GitHub or a hosting platform; test a real
publish by hand with the backend running.

**AI models** (Settings and the AI box's model menu) also need a signed-in session: `ai-models-smoke.mjs`, run like
`publish-smoke.mjs` (dev server without mock auth). It starts with no makable model and no key (AI mode asks for a key
and links to Settings), adds a refused key, then a good one, chooses two models, checks
the key is never on the page or in localStorage, picks a model in the AI box and checks it's sent, reloads, and checks a
refused key falls back to makable default. Screenshots: `ai-needs-key.png`, `ai-settings-choose.png`, `ai-settings.png`, `ai-model-menu.png`.

When a feature adds a new flow, extend `smoke.mjs` here (or `publish-smoke.mjs` for publishing), rather than writing a
one-off script.
Notes: on macOS, Home/End scroll the page instead of moving the caret, even in an editable. Use `Meta+ArrowLeft/Right` to move the caret in tests. The chat's GitHub lookup calls the public GitHub API (60 req/h per IP), and the preview needs network access to the CodeSandbox bundler, the jsDelivr CDN (Tailwind and the Monaco editor) and the published template catalog on GitHub Pages.
