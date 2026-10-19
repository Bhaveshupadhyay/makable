---
name: verify-web
description: Run the makable builder SPA in a headless browser and smoke-test the real UI (a guest is asked to sign in → a site is created from a prompt → live Sandpack preview → text edits, AI edits, the code view → publishing) against a scripted makable-backend. Use after UI changes in apps/web, before reporting a feature as done.
---

# Smoke-test the builder UI in headless Chromium

The scripts use `playwright-core` (pinned, installed in the session scratchpad: don't add Playwright to the repo for this) and the headless Chromium shell built for that version, which its own `install` puts in Playwright's cache (`~/Library/Caches/ms-playwright/chromium_headless_shell-<revision>` on a Mac; it skips the download when that revision is there). Set `CHROME_PATH` to use another Chromium.

Every builder flow needs a signed-in session and makable-backend (each site is a repo on the user's GitHub), so the
scripts run the real SPA against a **scripted backend**: Playwright routes answer `/api/v1` (`fake-backend.mjs`: the
session, the user's sites and their files, saves as commits, the AI thread; each script adds its own routes). Nothing
reaches GitHub, a model or a hosting platform. Test those by hand with the backend running.

1. **Start the dev server without mock auth** on a fixed port, in the background:
   ```sh
   cd apps/web && VITE_MOCK_AUTH=false bun --bun vite --port 5199 --strictPort > <scratchpad>/vite.log 2>&1 &
   ```
   Wait until `curl -s localhost:5199` responds.
2. **Set up the runner** (once per session):
   ```sh
   cd <scratchpad> && echo '{}' > package.json && bun add playwright-core@1.64.1
   bun x playwright-core install --only-shell chromium
   cp <repo>/.claude/skills/verify-web/*.mjs .
   ```
3. **Run them:** `bun smoke.mjs`, `bun publish-smoke.mjs`, `bun ai-models-smoke.mjs`, `bun analytics-smoke.mjs` (env: `BASE_URL`, default
   `http://localhost:5199`; `OUT_DIR` for screenshots, default cwd). Each prints its steps and exits non-zero on a
   failure or any page/console error.
4. **Look at the screenshots** with the Read tool. Check the layout, not just the assertions.
5. **Stop the dev server:** `pkill -f 'vite --port 5199'`.

**`smoke.mjs`** (the builder): a guest can type in the prompt box, and Enter or Send asks them to sign in (the text kept in the box and for after sign-in); signed in with no sites, the landing prompt
starts a creation (NDJSON stream), which asks for the name ("Chat about this" sends a message about the question, the conversation staying on screen while it's sent, and the AI's reply asks again), then shows its progress and opens the site in the preview
(elements tagged with `data-src`); Edit text patches the source and Save now commits it on the site's commit; an AI
edit on a selected element goes out on the saved commit with the element's place in the code, is tried in the preview,
reported ok and committed, then undone; an AI question is answered with an option (while a question waits, its answers take the composer's place); an AI change that breaks the preview
is reported with the error and taken back out; the code view edits (unsaved count) and keeps makable's files read-only;
GitHub Pages publishing asks before making the repo public, saves first and follows the deploy until live; a phone
layout; and a new browser opens the newest site by itself. Screenshots: `landing.png`, `sign-in.png`,
`create-brief.png`, `create-name.png`, `create-name-chat-open.png`, `create-name-chat-sending.png`, `create-name-chat.png`, `create-steps.png`, `workspace.png`, `ai-edit-popover.png`, `ai-edit.png`, `ai-question.png`, `code-view.png`,
`publish-live.png`, `workspace-mobile.png`.

**`publish-smoke.mjs`** (on an existing site): Vercel with a pasted token (sent on the site's commit, the deploy
followed by its start time until live, the token never in the chat or localStorage), a republish that builds on the
publish's commit and deploys with nothing new, Netlify with the secret added on GitHub (deploy refused until it's there,
a failed deploy), and a site changed elsewhere (a conflict, not an overwrite). Screenshots: `publish-token.png`,
`publish-live.png`, `publish-failed.png`.

**`ai-models-smoke.mjs`** (Settings and the AI box's model menu, on an existing site): no makable model and no key (AI
mode asks for a key and links to Settings), a refused key, then a good one, two models chosen, the key never on the page
or in localStorage, a model picked in the AI box and sent, picks remembered over a reload, and a refused key falling back
to makable default. Screenshots: `ai-needs-key.png`, `ai-settings-choose.png`, `ai-settings.png`, `ai-model-menu.png`.

**`analytics-smoke.mjs`** (a site's Google Analytics, on an existing site; Google's consent page is answered by a
Playwright route): the header's Analytics link, connecting Google (the redirect's `?analytics=connected` shown, then
cleared), the property and web stream picker (a property without a web stream says so; the only stream is picked),
the dashboard (the publish banner, totals with their changes, the chart's hover tooltip, metric and range switches,
the table view, the top lists), a phone without sideways scrolling, unlinking back to the picker, a refused Google
token asking to connect again, and an `?analyticsError` explained. Screenshots: `analytics-connect.png`,
`analytics-picker.png`, `analytics-dashboard.png`, `analytics-mobile.png`.

**Analytics (Mixpanel):** start the dev server with `VITE_ANALYTICS_DEBUG=true VITE_MIXPANEL_TOKEN=smoke-test-token VITE_MIXPANEL_LOCAL=true` to have
`publish-smoke.mjs` and `ai-models-smoke.mjs` list the analytics events they saw and fail if a pasted token or API key
appears in any of them. Mixpanel's requests are answered by Playwright, so nothing reaches Mixpanel.

When a feature adds a new flow, extend these scripts (and `fake-backend.mjs` for new routes) rather than writing a
one-off script.

Notes: the preview may be drawn zoomed, and Playwright's clicks inside an iframe ignore CSS zoom: click in the preview
with `clickInPreview` (real mouse coordinates). On macOS, Home/End scroll the page instead of moving the caret, even in
an editable; use `Meta+ArrowLeft/Right`. A step that breaks the preview on purpose sets `errors.expected` (the bundler
logs the broken code). Monaco reports a `Canceled` rejection when the editor switches files and then handles it; the
scripts ignore that one. The preview needs network access to the CodeSandbox bundler and the jsDelivr CDN (Tailwind and
the Monaco editor).
