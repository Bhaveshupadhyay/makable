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
   cd apps/web && VITE_MOCK_AUTH=false VITE_ANALYTICS_DEBUG=true bun --bun vite --port 5199 --strictPort > <scratchpad>/vite.log 2>&1 &
   ```
   Wait until `curl -s localhost:5199` responds. `VITE_ANALYTICS_DEBUG=true` logs the analytics events to the console,
   where `smoke.mjs` checks the demo's (without it those checks are skipped).
2. **Set up the runner** (once per session):
   ```sh
   cd <scratchpad> && echo '{}' > package.json && bun add playwright-core@1.64.1
   bun x playwright-core install --only-shell chromium
   cp <repo>/.claude/skills/verify-web/*.mjs .
   ```
3. **Run them:** `bun smoke.mjs`, `bun publish-smoke.mjs`, `bun ai-models-smoke.mjs`, `bun theme-smoke.mjs`, `bun reconnect-smoke.mjs`, `bun new-site-smoke.mjs` (env: `BASE_URL`, default
   `http://localhost:5199`; `OUT_DIR` for screenshots, default cwd). Each prints its steps and exits non-zero on a
   failure or any page/console error.
4. **Look at the screenshots** with the Read tool. Check the layout, not just the assertions.
5. **Stop the dev server:** `pkill -f 'vite --port 5199'`.

**`smoke.mjs`** (the builder): a guest can type in the prompt box, and Enter or Send asks them to sign in (the text kept in the box and for after sign-in); the resume's links (`?utm_source=res` and `resume`) play the product demo over the page (muted until **Turn on sound**, since headless Chromium won't play sound by itself), it closes by itself when R2's video ends, showing the site, other links don't open it, and with R2 down (an error) or hanging (nothing to play 15 s after a play) the backup on Google Drive shows in its place, in Drive's player (its play button and the file checked; it doesn't close the dialog at the end); the landing page has the demo under how it works (its poster, nothing loaded until **Watch the demo** plays it); each step's analytics event (shown, played, every quarter seen, closed, failed) is checked; signed in with no sites, the landing prompt
starts a creation (NDJSON stream), which asks for the name ("Chat about this" sends a message about the question, the conversation staying on screen while it's sent, and the AI's reply asks again), then shows its progress and opens the site in the preview
(elements tagged with `data-src`); Edit text patches the source and Save now commits it on the site's commit; an AI
edit on a selected element goes out on the saved commit with the element's place in the code (while the AI works, the chat and the AI box say "Thinking…" with the time so far ticking), is tried in the preview,
reported ok and committed (what it took, sent for the user's own key, under the reply, its details on a click), then undone; an AI question is answered with an option (while a question waits, its answers take the composer's place); an AI change that breaks the preview
is reported with the error and taken back out; the code view edits (unsaved count) and keeps makable's files read-only;
GitHub Pages publishing asks before making the repo public, saves first and follows the deploy until live; a phone
layout; and a new browser opens the newest site by itself. Screenshots: `sign-in.png`, `demo-video.png`, `demo-video-mobile.png`, `landing-demo.png`, `landing-demo-mobile.png`, `demo-video-backup.png`, `landing.png`,
`create-brief.png`, `create-name.png`, `create-name-chat-open.png`, `create-name-chat-sending.png`, `create-name-chat.png`, `create-steps.png`, `workspace.png`, `ai-edit-popover.png`, `ai-thinking.png`, `ai-edit.png`, `ai-usage.png`, `ai-question.png`, `code-view.png`,
`publish-live.png`, `workspace-mobile.png`.

**`publish-smoke.mjs`** (on an existing site): Vercel with a pasted token (sent on the site's commit, the deploy
followed by its start time until live, the token never in the chat or localStorage), a republish that builds on the
publish's commit and deploys with nothing new, Netlify with the secret added on GitHub (deploy refused until it's there,
a failed deploy), and a site changed elsewhere (a conflict, not an overwrite). Screenshots: `publish-token.png`,
`publish-live.png`, `publish-failed.png`.

**`ai-models-smoke.mjs`** (Settings and the AI box's model menu, on an existing site): no makable model and no key (a
chat message isn't sent: the chat asks for a key, **What’s an API key?** explains it (with Gemini's free tier and each company's page for making a key), the button opens Settings and goes once there's a model;
nor is a new site's prompt from the landing page;
AI mode asks for a key and links to Settings, which suggests Gemini's free tier and links to the chosen company's key page), a refused key, then a good one, two models chosen, the key never on the page
or in localStorage, a model picked in the AI box and sent, picks remembered over a reload, and a refused key falling back
to makable default. Screenshots: `chat-needs-key.png`, `chat-api-key-help.png`, `create-needs-key.png`, `ai-needs-key.png`, `ai-settings-no-keys.png`, `ai-settings-choose.png`, `ai-settings.png`, `ai-model-menu.png`.

**`new-site-smoke.mjs`** (the new site page, `/new`): the site menu's New site opens it and going back returns to
the open site with its unsaved edits; a description that's too long stays in the box; a prompt sent there saves the
open site's unsaved edits first (a conflict keeps the prompt waiting, with why and the way back to the site, and it's
still in the box after going there and back), then the builder starts the new site on a new id; a guest's too-long
description is refused before sign-in, another is asked to sign in, kept for after; back from sign-in with the open
site's edits unsaved, the prompt goes to `/new` in the box; a phone. Screenshots:
`new-site.png`, `new-site-conflict.png`, `new-site-created.png`, `new-site-guest.png`, `new-site-mobile.png`.

**`reconnect-smoke.mjs`** (makable's GitHub token stops working: the fake answers 401 `github_reconnect`, and signing in
is a page that goes straight back to `returnTo`, as GitHub does for an app already allowed): opening a site signs in
again by itself, back to the same page, with no session refresh; refused again right after, it shows **Connect GitHub
again** instead of looping, and that button works; back from GitHub's page instead of signing in (the page restored
from the back/forward cache: Playwright turns that cache off, so the sign-in answers 204, which leaves the page as it
was, and a persisted `pageshow` is fired through the DevTools protocol, since Playwright's own calls wait for that
cancelled navigation), the page loads afresh and offers Connect GitHub again; a refused save signs in again and the edits are saved
after; a refused AI request is kept in the chat (sent once) with "send it again"; a refused publish carries on by itself
once back, on the loaded site, and asks to connect GitHub again when the site is still refused then; a refused creation (in its stream) offers **Try again**, which builds the same prompt. Each step
clears the tab's `makable:github-reconnect` so it can reconnect again. Screenshots: `reconnect-manual.png`,
`reconnect-ai.png`, `reconnect-publish.png`, `reconnect-create.png`.

**`theme-smoke.mjs`** (light and dark mode, on a dark system): with no choice the system's theme (System checked), Light
picked, saved and kept over a reload, the saved theme set by `index.html` before the app runs (the app's script
blocked; a broken saved value falls back to the system), System following the system's setting live while an explicit
choice ignores it, another tab following, the workspace and the code view (Monaco's `vs` / `vs-dark` and the editor
chrome), Settings, and the header on a phone. Screenshots: `theme-landing-dark.png`, `theme-menu.png`,
`theme-sign-in-dark.png`, `theme-landing-light.png`, `theme-about-dark.png`, `theme-workspace-dark.png`,
`theme-code-dark.png`, `theme-code-light.png`, `theme-workspace-light.png`, `theme-settings-dark.png`,
`theme-workspace-mobile-dark.png`, `theme-landing-mobile-dark.png`.

**Analytics:** start the dev server with `VITE_ANALYTICS_DEBUG=true VITE_MIXPANEL_TOKEN=smoke-test-token VITE_MIXPANEL_LOCAL=true` to have
`publish-smoke.mjs` and `ai-models-smoke.mjs` list the analytics events they saw and fail if a pasted token or API key
appears in any of them. Mixpanel's requests are answered by Playwright, so nothing reaches Mixpanel.

When a feature adds a new flow, extend these scripts (and `fake-backend.mjs` for new routes) rather than writing a
one-off script.

Notes: the preview may be drawn zoomed, and Playwright's clicks inside an iframe ignore CSS zoom: click in the preview
with `clickInPreview` (real mouse coordinates). On macOS, Home/End scroll the page instead of moving the caret, even in
an editable; use `Meta+ArrowLeft/Right`. A step that breaks the preview on purpose sets `errors.expected` (the bundler
logs the broken code). Monaco reports a `Canceled` rejection when the editor switches files and then handles it; the
scripts ignore that one. The preview needs network access to the CodeSandbox bundler and the jsDelivr CDN (Tailwind and
the Monaco editor), and the demo step to the video's R2 bucket and Google Drive (its backup).
