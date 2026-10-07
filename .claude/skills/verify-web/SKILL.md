---
name: verify-web
description: Run the makable builder SPA in a headless browser and smoke-test the real UI (guest chat → Sandpack preview → connect GitHub from the chat → visual edits) with mock auth. Use after UI changes in apps/web or the portfolio template, before reporting a feature as done.
---

# Smoke-test the builder UI in headless Chromium

Playwright's Chromium is already cached at `~/Library/Caches/ms-playwright/chromium_headless_shell-*`. Don't add Playwright to the repo for this. Install `playwright-core` in the session scratchpad.

1. **Start the dev server** with mock auth on a fixed port, in the background:
   ```sh
   bun .claude/skills/verify-web/mock-model.mjs &      # fake model on :9999 for the AI edit step
   cd apps/web && VITE_MOCK_AUTH=true AI_BASE_URL=http://localhost:9999/v1 bun --bun vite --port 5199 --strictPort > <scratchpad>/vite.log 2>&1 &
   ```
   Wait until `curl -s localhost:5199` responds.
2. **Set up the runner** (once per session):
   ```sh
   cd <scratchpad> && echo '{}' > package.json && bun add playwright-core
   cp <repo>/.claude/skills/verify-web/smoke.mjs .
   ```
3. **Run it:** `bun smoke.mjs` (env: `BASE_URL`, default `http://localhost:5199`; `OUT_DIR` for screenshots, default cwd). It prints each step and exits non-zero on failure or on any page/console error.
4. **Look at the screenshots** it writes (`chat-start.png`, `connect-github.png`, `ai-edit-pending.png`, `ai-edit-popover.png`, `ai-edit.png`, `code-view.png`, `builder.png`, `builder-static.png`, `builder-remote-assets.png`, `builder-mobile.png`) with the Read tool. Check the layout, not just the assertions.
5. **Stop the servers:** `pkill -f 'vite --port 5199'; pkill -f mock-model.mjs`.

When a feature adds a new flow, extend `smoke.mjs` here, rather than writing a one-off script.
Notes: on macOS, Home/End scroll the page instead of moving the caret, even in an editable. Use `Meta+ArrowLeft/Right` to move the caret in tests. The chat's GitHub lookup calls the public GitHub API (60 req/h per IP), and the preview needs network access to the CodeSandbox bundler, the jsDelivr CDN (Tailwind and the Monaco editor) and the published template catalog on GitHub Pages.
