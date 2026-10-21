// The builder, end to end in the browser: the real SPA against a scripted makable-backend (see fake-backend.mjs).
// A site is created from a prompt (the name question, progress), opened in the live preview, edited by hand (text in
// the preview, the code), changed with AI (tried in the preview, then committed; undone; a question; a change that
// breaks the preview) and published. Run the dev server WITHOUT mock auth. See SKILL.md.
import { join } from 'node:path'
import { clickInPreview, expect, fail, fakeSites, launch, ndjson, ok, REPO_URL, routeBackend, sha, siteAnswer, watchErrors } from './fake-backend.mjs'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'
const PROMPT = 'A site for my bakery, Crumb, with our opening hours'
const NAME_QUESTION = { question: 'What should the site be called?', options: ['Crumb Bakery'], allowFreeText: true, kind: 'project_name' }
const KIND_QUESTION = { question: 'What kind of site is it?', options: ['A landing page', 'An online shop'], allowFreeText: true, kind: 'site_brief' }
const NAME_REPLY = "It becomes your site's title and its repository's name on your GitHub, so anything works. What should we call it?"
const COLOUR_QUESTION = { question: 'Which colour should the buttons be?', options: ['#e11d48', '#2563eb'], allowFreeText: true }
const WEEKEND = '<p className="mt-2 text-amber-800">Open weekends 8–2</p>'
const DEMO_VIDEO = 'https://pub-4a29d5bc45754e1e9ab37c133e4e92b9.r2.dev/mak.mp4'
// What an AI request took, as the server sends it for the user's own key.
const USAGE = {
  modelCalls: 2,
  inputTokens: 11_200,
  outputTokens: 1_240,
  totalTokens: 12_440,
  reasoningTokens: 640,
  cachedTokens: 8_192,
  costUsd: 0.0213,
  modelSeconds: 9.46,
  seconds: 12.3,
}

const site = fakeSites({ exists: false })
const seen = { creates: [], answers: [], edits: [], results: [], editAnswers: [], undos: [], publishes: [], statusSince: [] }
// What the next AI request answers, in order.
const editAnswers = []
let runs = 0
const runId = () => `00000000-0000-4000-8000-${String(++runs).padStart(12, '0')}`

function answer(method, path, body, query) {
  const known = siteAnswer(site, method, path, body)
  if (known) return known
  if (method === 'POST' && path === '/ai/create') {
    seen.creates.push(body)
    const id = runId()
    site.projectId = body.projectId
    site.thread = { projectId: body.projectId, status: 'needs_input', turns: [], run: { runId: id, mode: 'create', instruction: body.prompt, target: null, question: KIND_QUESTION, steps: ['Thinking about your site'] } }
    return ndjson([
      { type: 'progress', stage: 'brief', message: 'Thinking about your site' },
      { type: 'result', data: { status: 'needs_input', runId: id, question: KIND_QUESTION } },
    ])
  }
  if (method === 'POST' && path === `/ai/create/${site.projectId}/answer`) {
    seen.answers.push(body)
    if (body.chat) {
      // "Chat about this": the AI replies and asks again; the thread keeps what was said.
      const run = site.thread.run
      run.questions = [...(run.questions ?? []), { question: run.question.question, answer: body.answer, chat: true }]
      run.question = { ...NAME_QUESTION, question: NAME_REPLY }
      const reply = ndjson([
        { type: 'progress', stage: 'name', message: 'Reading your answer' },
        { type: 'result', data: { status: 'needs_input', runId: body.runId, question: run.question } },
      ])
      // Held back a moment, so the script can see the chat while the answer is on its way.
      return new Promise((resolve) => setTimeout(() => resolve(reply), 2_000))
    }
    // A question about the site, then the name, then the site.
    const run = site.thread.run
    if (run.question.kind === 'site_brief') {
      run.questions = [...(run.questions ?? []), { question: run.question.question, answer: body.answer, steps: run.steps }]
      run.question = NAME_QUESTION
      run.steps = ['Thinking about your site']
      return ndjson([
        { type: 'progress', stage: 'brief', message: 'Thinking about your site' },
        { type: 'result', data: { status: 'needs_input', runId: body.runId, question: NAME_QUESTION } },
      ])
    }
    site.create(site.projectId)
    site.thread.status = 'idle'
    site.thread.run = null
    const built = [
      { type: 'progress', stage: 'setup', message: 'Creating the repository for Crumb Bakery on your GitHub' },
      { type: 'progress', stage: 'plan', message: 'Planning the site' },
      { type: 'progress', stage: 'write', message: 'Writing src/index.css', path: 'src/index.css', done: 0, total: 2 },
      { type: 'progress', stage: 'write', message: 'Writing src/App.tsx', path: 'src/App.tsx', done: 1, total: 2 },
      { type: 'progress', stage: 'check', message: 'Checking the code' },
      { type: 'progress', stage: 'commit', message: 'Saving the site to your GitHub' },
    ]
    site.turn({
      instruction: PROMPT,
      reply: 'Built Crumb Bakery: a warm landing page with your hours.',
      questions: [...run.questions, { question: run.question.question, answer: body.answer, steps: run.steps }],
      steps: built.map((e) => e.message),
    })
    return ndjson([
      ...built.slice(0, 3),
      { type: 'ping' },
      ...built.slice(3),
      { type: 'result', data: { status: 'created', runId: body.runId, summary: 'Built it.', commitSha: site.commit, site: site.sites[0] } },
    ])
  }
  if (method === 'POST' && path === '/ai/edit') {
    seen.edits.push(body)
    return editAnswers.shift()?.(body) ?? fail(500, 'internal_error', 'unscripted AI edit')
  }
  if (method === 'POST' && path === `/ai/edit/${site.projectId}/answer`) {
    seen.editAnswers.push(body)
    return editAnswers.shift()?.(body) ?? fail(500, 'internal_error', 'unscripted answer')
  }
  if (method === 'POST' && path === `/ai/edit/${site.projectId}/result`) {
    seen.results.push(body)
    return editAnswers.shift()?.(body) ?? fail(500, 'internal_error', 'unscripted result')
  }
  if (method === 'DELETE' && path === `/ai/threads/${site.projectId}/run`) {
    site.thread.status = 'idle'
    site.thread.run = null
    return { status: 204 }
  }
  if (method === 'POST' && path === `/sites/${site.projectId}/undo`) {
    seen.undos.push(body)
    if (body.baseCommit !== site.commit) return fail(409, 'site_conflict', 'Changed elsewhere', { commitSha: site.commit })
    const files = { 'src/App.tsx': site.files['src/App.tsx'].replace(`\n      ${WEEKEND}`, '') }
    return ok({ commitSha: site.commitChanges(files), files })
  }
  if (method === 'POST' && path === `/publish/${site.projectId}`) {
    seen.publishes.push(body)
    if (body.baseCommit !== site.commit) return fail(409, 'site_conflict', 'Changed elsewhere', { commitSha: site.commit })
    const commitSha = site.commitChanges({ '.github/workflows/makable-deploy.yml': 'name: deploy\n' })
    return ok({
      target: 'github-pages',
      repoFullName: 'octocat/crumb-bakery',
      repoUrl: REPO_URL,
      branch: 'main',
      commitSha,
      changed: true,
      deploy: 'started',
      deployStartedAt: '2026-10-15T12:00:00Z',
      siteUrl: 'https://octocat.github.io/crumb-bakery/',
      projectName: null,
      missingSecrets: [],
      secretsUrl: `${REPO_URL}/settings/secrets/actions`,
      actionsUrl: `${REPO_URL}/actions/workflows/makable-deploy.yml`,
    })
  }
  if (method === 'GET' && path === `/publish/${site.projectId}/status`) {
    seen.statusSince.push(query.get('since'))
    const done = seen.statusSince.length > 1
    return ok({
      target: 'github-pages',
      siteUrl: 'https://octocat.github.io/crumb-bakery/',
      run: { status: done ? 'completed' : 'in_progress', conclusion: done ? 'success' : null, headSha: site.commit, htmlUrl: `${REPO_URL}/actions/runs/1`, createdAt: '2026-10-15T12:00:01Z' },
    })
  }
  return null
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = watchErrors(page)
// The analytics events, read from the console logger (start the dev server with VITE_ANALYTICS_DEBUG=true; without
// it nothing is logged and the event checks are skipped).
const events = []
page.on('console', (m) => {
  if (!m.text().startsWith('%c[analytics]')) return
  Promise.all(m.args().map((arg) => arg.jsonValue().catch(() => null))).then(([, , name, props]) => events.push({ name, props }))
})
async function expectEvent(name, match = {}) {
  if (!events.length) return
  const seenIt = () => events.some((e) => e.name === name && Object.entries(match).every(([k, v]) => e.props?.[k] === v))
  for (const deadline = Date.now() + 5_000; !seenIt(); await new Promise((r) => setTimeout(r, 100))) {
    expect(Date.now() < deadline, `analytics: no ${name} ${JSON.stringify(match)} (seen: ${[...new Set(events.map((e) => e.name))].join(', ')})`)
  }
}
await routeBackend(page, answer)
const shot = (name) => page.screenshot({ path: join(OUT_DIR, name) })
const frame = page.frameLocator('iframe[title="Site preview"]')
const composer = page.getByRole('textbox', { name: 'Message' })
const say = async (text) => {
  await composer.fill(text)
  await composer.press('Enter')
}
const chatSays = (text, timeout = 30_000) => page.getByText(text).last().waitFor({ timeout })
const until = async (check, what, timeout = 60_000) => {
  const end = Date.now() + timeout
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await page.waitForTimeout(100)
  }
}

try {
  // 0. A guest types freely; sending opens the chat, which asks them to sign in with GitHub (what GitHub is a click
  // away), keeps the prompt for after sign-in, and sends nothing.
  site.signedIn = false
  await page.goto(BASE_URL)
  const guestBox = page.getByPlaceholder('Describe the site you want to build…')
  await guestBox.fill(PROMPT)
  expect(!(await page.getByRole('button', { name: 'Continue with GitHub' }).isVisible()), 'typing must not ask to sign in')
  await guestBox.press('Enter')
  await page.getByRole('button', { name: 'Continue with GitHub' }).waitFor()
  expect(!(await page.getByRole('dialog').isVisible()), 'the guest must get the chat, not a dialog')
  await chatSays(PROMPT)
  await chatSays('100% private and 100% yours')
  expect(await page.getByRole('textbox', { name: 'Message' }).isDisabled(), 'the chat waits for sign-in')
  expect(!!(await page.getByRole('link', { name: 'Create one for free' }).getAttribute('href')), 'a guest without GitHub gets a sign-up link')
  await shot('sign-in.png')
  await page.getByRole('button', { name: 'What’s GitHub?' }).click()
  await page.getByText('like Google Drive, but for code').waitFor()
  await shot('sign-in-github-explainer.png')
  await page.keyboard.press('Escape')
  await page.getByText('like Google Drive, but for code').waitFor({ state: 'detached' })
  const pending = await page.evaluate(() => sessionStorage.getItem('makable:pending-prompt'))
  expect(pending === PROMPT, `the prompt must wait for sign-in (saved ${JSON.stringify(pending)})`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.getByRole('button', { name: 'Continue with GitHub' }).waitFor()
  await shot('sign-in-mobile.png')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: 'Back' }).click()
  expect((await guestBox.inputValue()) === PROMPT, 'Back must put the prompt back in the box')
  expect((await page.evaluate(() => sessionStorage.getItem('makable:pending-prompt'))) === null, 'Back must forget the prompt')
  await page.getByRole('button', { name: 'A portfolio for a product designer' }).click()
  await page.getByRole('button', { name: 'Continue with GitHub' }).waitFor()
  await chatSays('A portfolio for a product designer')
  await page.getByRole('button', { name: 'Back' }).click()
  await page.evaluate(() => sessionStorage.removeItem('makable:pending-prompt'))
  expect(seen.creates.length === 0, 'a guest must not start a creation')
  console.log('✓ guest: types freely; sending opens the chat asking to sign in with GitHub (with What’s GitHub?), keeps the prompt over a reload, Back edits it')

  // 0b. The resume's links play the product demo over the page. A browser that won't play sound by itself (headless
  // Chromium doesn't) plays it muted, with a button to turn the sound on. Other links don't open it.
  await page.goto(`${BASE_URL}/?utm_source=res`)
  const demo = page.getByRole('dialog', { name: 'See makable in action' })
  await demo.waitFor()
  const video = demo.locator('video')
  const demoPlays = () => page.waitForFunction(() => document.querySelector('[role="dialog"] video')?.currentTime > 0.5, null, { timeout: 30_000 })
  await demoPlays()
  await expectEvent('demo_video_shown', { placement: 'dialog', source: 'res' })
  await expectEvent('demo_video_played', { placement: 'dialog' })
  const soundButton = demo.getByRole('button', { name: 'Turn on sound' })
  if (await video.evaluate((v) => v.muted)) {
    await soundButton.waitFor()
    await shot('demo-video.png')
    await soundButton.click()
    await soundButton.waitFor({ state: 'detached' })
    expect(await video.evaluate((v) => !v.muted && !v.paused), 'Turn on sound must unmute the demo and keep it playing')
  } else await shot('demo-video.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot('demo-video-mobile.png')
  await page.setViewportSize({ width: 1280, height: 900 })
  await demo.getByRole('button', { name: 'Close' }).click()
  await demo.waitFor({ state: 'detached' })
  await expectEvent('demo_video_closed', { reason: 'dismissed', ended: false })
  // Once the video ends, the dialog closes by itself and shows the site.
  await page.goto(`${BASE_URL}/?utm_source=resume`)
  await demo.waitFor()
  await demoPlays()
  await expectEvent('demo_video_shown', { placement: 'dialog', source: 'resume' })
  await video.evaluate((v) => (v.currentTime = v.duration - 1))
  await demo.waitFor({ state: 'detached', timeout: 10_000 })
  await page.getByPlaceholder('Describe the site you want to build…').waitFor()
  await expectEvent('demo_video_closed', { reason: 'ended', ended: true })
  await page.goto(`${BASE_URL}/?utm_source=twitter`)
  await page.getByPlaceholder('Describe the site you want to build…').waitFor()
  expect(!(await page.getByRole('dialog').isVisible()), 'only the resume links open the demo')
  // The landing page has it too, under how it works: its poster until it's played, nothing loaded before.
  const landingDemo = page.locator('figure[data-analytics-section="demo_landing"]')
  const landingVideo = landingDemo.locator('video')
  expect(
    await landingVideo.evaluate((v) => v.paused && v.preload === 'none' && v.readyState === 0 && v.poster.endsWith('/demo-poster.jpg')),
    'the landing demo must wait for a click, showing its poster and loading nothing',
  )
  const stepsBottom = await page.getByRole('heading', { name: 'Edit and publish' }).evaluate((el) => el.closest('li').getBoundingClientRect().bottom)
  expect((await landingDemo.boundingBox()).y > stepsBottom, 'the landing demo must sit under the how-it-works steps')
  await landingDemo.scrollIntoViewIfNeeded()
  await expectEvent('demo_video_shown', { placement: 'landing' })
  await shot('landing-demo.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await landingDemo.scrollIntoViewIfNeeded()
  await shot('landing-demo-mobile.png')
  await page.setViewportSize({ width: 1280, height: 900 })
  // Its play button plays it (with sound: the click allows it); played fast to the end, each quarter seen is reported.
  const watchDemo = landingDemo.getByRole('button', { name: 'Watch the demo · 1 min' })
  await watchDemo.click()
  await watchDemo.waitFor({ state: 'detached' })
  await page.waitForFunction(() => document.querySelector('figure video')?.currentTime > 0.5, null, { timeout: 30_000 })
  await expectEvent('demo_video_played', { placement: 'landing', muted: false })
  await landingVideo.evaluate((v) => (v.playbackRate = 16))
  // At 16× it plays faster than the 33 MB video downloads, so the time it takes is the network's: give it room.
  await page.waitForFunction(() => document.querySelector('figure video')?.ended, null, { timeout: 120_000 })
  for (const percent of [25, 50, 75, 100]) await expectEvent('demo_video_progress', { placement: 'landing', percent })
  // A video that can't load says so, and Try again plays it once it's back.
  await page.route(DEMO_VIDEO, (route) => route.fulfill({ status: 404 }))
  await page.goto(`${BASE_URL}/?utm_source=res`)
  await demo.getByRole('alert').getByText('The demo couldn’t load').waitFor()
  expect(!(await soundButton.isVisible()), 'a demo that failed must not offer sound')
  await expectEvent('demo_video_failed', { placement: 'dialog' })
  await shot('demo-video-failed.png')
  await page.unroute(DEMO_VIDEO)
  await demo.getByRole('button', { name: 'Try again' }).click()
  await demo.getByRole('alert').waitFor({ state: 'detached' })
  await demoPlays()
  await demo.getByRole('button', { name: 'Close' }).click()
  console.log(
    `✓ the resume links (res, resume) play the demo (muted until asked), it closes (by itself once it ends), other links leave it shut, a failed load can be tried again; the landing page plays it on a click${events.length ? ', and every step is tracked' : ' (events not checked: VITE_ANALYTICS_DEBUG is off)'}`,
  )
  site.signedIn = true

  // 1. The landing page, signed in, with no sites: the prompt builds one.
  await page.goto(BASE_URL)
  await page.getByRole('button', { name: 'Account menu' }).waitFor()
  await page.getByPlaceholder('Describe the site you want to build…').waitFor()
  await shot('landing.png')
  await say(PROMPT)
  // First a question about the site, before its name.
  await chatSays(KIND_QUESTION.question)
  expect(seen.creates[0]?.prompt === PROMPT, `create body: ${JSON.stringify(seen.creates[0])}`)
  await page.getByPlaceholder('Type something else…').waitFor()
  await shot('create-brief.png')
  await page.getByRole('button', { name: 'A landing page', exact: true }).click()
  expect(seen.answers[0]?.answer === 'A landing page' && !seen.answers[0].chat, `brief answer body: ${JSON.stringify(seen.answers[0])}`)
  await chatSays(NAME_QUESTION.question)
  await page.getByPlaceholder('Type a name…').waitFor()
  expect(await page.getByText('A landing page', { exact: true }).last().isVisible(), 'the answer about the site stays in the chat')
  await shot('create-name.png')
  console.log('✓ create: the prompt starts a creation, which asks about the site, then for the name')

  // While a question waits, its answers take the composer's place.
  expect((await page.getByRole('textbox', { name: 'Message' }).count()) === 0, 'the composer is hidden while the name is asked')
  await page.getByRole('button', { name: 'Chat about this' }).click()
  const chatBox = page.getByPlaceholder('Ask about this question…')
  await chatBox.fill('What is the name for?')
  await shot('create-name-chat-open.png')
  await chatBox.press('Enter')
  // While it's on its way, the conversation stays: the question and what was just sent.
  await page.getByRole('button', { name: 'Stop' }).waitFor({ timeout: 1_500 })
  for (const text of [PROMPT, NAME_QUESTION.question, 'What is the name for?']) {
    expect(await page.getByText(text, { exact: true }).last().isVisible(), `"${text}" stays in the chat while the answer is sent`)
  }
  await shot('create-name-chat-sending.png')
  await chatSays(NAME_REPLY)
  await chatSays('What is the name for?')
  expect(seen.answers[1]?.chat === true && seen.answers[1].answer === 'What is the name for?', `chat body: ${JSON.stringify(seen.answers[1])}`)
  await shot('create-name-chat.png')
  console.log('✓ create: "Chat about this" sends a message about the name question; the AI replies and asks again')

  await page.getByRole('button', { name: 'Crumb Bakery', exact: true }).click()
  await frame.getByRole('heading', { name: 'Crumb Bakery' }).waitFor({ timeout: 90_000 })
  expect(seen.answers[2]?.answer === 'Crumb Bakery' && !seen.answers[2].chat, `answer body: ${JSON.stringify(seen.answers[2])}`)
  await chatSays('Built Crumb Bakery: a warm landing page with your hours.')
  // What it did stays in the chat once it's done, collapsed above the reply.
  const buildSteps = page.getByRole('button', { name: '6 steps' })
  await buildSteps.waitFor()
  expect((await buildSteps.getAttribute('aria-expanded')) === 'false', 'the steps start collapsed')
  expect((await page.getByText('Planning the site', { exact: true }).count()) === 0, 'collapsed steps are hidden')
  await buildSteps.click()
  await page.getByText('Planning the site', { exact: true }).waitFor()
  expect((await page.getByRole('button', { name: '1 step' }).count()) === 2, 'each question keeps the step before it')
  await shot('create-steps.png')
  await buildSteps.click()
  console.log('✓ create: the steps stay in the chat after the build, collapsed, and open on a click')
  const tagged = await frame.locator('[data-src^="src/App.tsx:"]').count()
  expect(tagged >= 3, `the preview's elements must carry data-src (found ${tagged})`)
  await shot('workspace.png')
  console.log(`✓ create: the site opens in the live preview, its elements tagged with their place in the code (${tagged})`)
  // The page is drawn scaled down beside the chat; its viewport must end with its box, or the bottom of
  // the site can't be scrolled into view.
  const fit = await page.locator('iframe[title="Site preview"]').evaluate((f) => {
    const box = f.parentElement.getBoundingClientRect()
    const drawn = f.getBoundingClientRect()
    return { scaled: drawn.width < f.offsetWidth, overflow: drawn.bottom - (box.bottom - 1) }
  })
  expect(fit.scaled && Math.abs(fit.overflow) <= 1, `the scaled preview must fill its box exactly: ${JSON.stringify(fit)}`)
  console.log('✓ preview: a scaled-down page fills its box, so it scrolls to the bottom')

  // 2. Edit text in the preview: it changes the code, and Save now commits it.
  await page.getByRole('button', { name: 'Edit text' }).click()
  await clickInPreview(page, frame.getByText('Fresh bread every morning'))
  const editor = frame.getByRole('textbox', { name: 'Edit text' })
  await editor.fill('Warm bread all day')
  await editor.press('Enter')
  await frame.getByText('Warm bread all day').waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: /^Saving to GitHub/ }).click()
  await page.getByRole('menuitem', { name: 'Save now' }).click()
  await until(() => site.saves.length === 1, 'the save')
  const [saved] = site.saves
  expect(saved.baseCommit === sha(1), `the save must build on the site's commit: ${saved.baseCommit}`)
  const savedApp = saved.files['src/App.tsx'] ?? ''
  expect(savedApp.includes('Warm bread all day') && !savedApp.includes('data-src'), `the save must carry the edited source, without the preview tags: ${savedApp}`)
  await page.keyboard.press('Escape')
  console.log('✓ text edit: the source is patched where the element is written, and saved as a commit')

  // 3. AI edit on a selected element: tried in the preview, then committed; the chat offers Undo.
  const withWeekend = () => ({ 'src/App.tsx': site.files['src/App.tsx'].replace('</p>', `</p>\n      ${WEEKEND}`) })
  editAnswers.push(
    // The AI takes a moment, so the time it's taking can be seen ticking.
    () => new Promise((resolve) => setTimeout(() => resolve(ok({ status: 'awaiting_result', runId: runId(), summary: 'Added the weekend hours.', files: withWeekend() })), 2_300)),
    (body) => {
      if (!body.ok) return fail(502, 'ai_edit_broke_preview', 'broke')
      const files = withWeekend()
      const commitSha = site.commitChanges(files)
      // The request was made with the user's own key, so the server says what it took.
      site.turn({ instruction: 'Add our weekend hours under this', target: 'p “Warm bread all day”', reply: 'Added the weekend hours.', usage: USAGE })
      return ok({ status: 'applied', runId: body.runId, summary: 'Added the weekend hours.', commitSha, files, usage: USAGE })
    },
  )
  await page.getByRole('button', { name: 'Edit with AI' }).click()
  await clickInPreview(page, frame.getByText('Warm bread all day'))
  const ask = page.getByRole('textbox', { name: 'Ask AI to make changes' })
  await ask.fill('Add our weekend hours under this')
  await shot('ai-edit-popover.png')
  await ask.press('Enter')
  // While it works, the chat and the AI box say so, with the time so far, from the request's start.
  const elapsed = page.locator('[data-elapsed]')
  await page.getByText('Thinking…').first().waitFor()
  expect((await elapsed.count()) === 2, `the chat and the AI box both show the time so far (${await elapsed.count()})`)
  const first = await elapsed.first().innerText()
  expect(/^\([01]s · manual edits paused\)$/.test(first), `the time starts at the request: ${first}`)
  // Screen readers hear what it's doing and that manual edits wait, not every second.
  const spoken = await page.locator('p[role=status]:has([data-elapsed])').first().ariaSnapshot()
  expect(spoken.includes('Thinking… manual edits paused') && !/\ds\b/.test(spoken), `what screen readers hear: ${spoken}`)
  await page.waitForFunction(() => [...document.querySelectorAll('[data-elapsed]')].every((e) => e.textContent?.startsWith('(1s')), null, { timeout: 3_000 })
  await shot('ai-thinking.png')
  console.log('✓ thinking: the chat and the AI box show the AI at work, its time ticking from the request’s start')
  await frame.getByText('Open weekends 8–2').waitFor({ timeout: 60_000 })
  await until(() => seen.results.length === 1, 'the preview report')
  const [edit] = seen.edits
  expect(edit.baseCommit === sha(2), `the AI edit must build on the saved commit: ${edit.baseCommit}`)
  expect(edit.target?.source?.path === 'src/App.tsx' && edit.target.source.line === 6, `the selection's place in the code: ${JSON.stringify(edit.target?.source)}`)
  expect(!edit.target.html.includes('data-src'), 'the selection html must not carry the preview tags')
  expect(seen.results[0].ok === true, `the preview must report ok: ${JSON.stringify(seen.results[0])}`)
  await chatSays('Added the weekend hours.')
  await page.getByRole('button', { name: 'Undo this change' }).last().waitFor()
  await shot('ai-edit.png')
  console.log('✓ AI edit: sent on the saved commit with the selection’s source, tried in the preview, reported ok, committed')

  // What it took, under the reply: one line, the details on a click. The creation's reply (makable's model) has none.
  const usageLine = page.getByRole('button', { name: '12s · 12.4k tokens' })
  expect((await usageLine.count()) === 1, 'only the request made with the user’s key says what it took')
  await usageLine.click()
  for (const text of ['11,200 tokens, 8,192 from the cache', '1,240 tokens, 640 thinking', '$0.0213', '9.5s over 2 calls']) {
    await page.getByText(text, { exact: true }).waitFor()
  }
  await shot('ai-usage.png')
  await usageLine.click()
  console.log('✓ AI edit usage: time and tokens under the reply, the details on a click')

  await page.getByRole('button', { name: 'Undo this change' }).last().click()
  await chatSays('Undone.')
  await frame.getByText('Open weekends 8–2').waitFor({ state: 'detached', timeout: 30_000 })
  expect(seen.undos[0]?.commitSha === sha(3) && seen.undos[0].baseCommit === sha(3), `undo body: ${JSON.stringify(seen.undos[0])}`)
  console.log('✓ undo: the AI change is undone with a new commit, and the preview follows')

  // 4. A question from the AI, answered with an option; the change is escalated.
  await page.getByRole('button', { name: 'Edit with AI' }).click()
  editAnswers.push(
    (body) => {
      const id = runId()
      site.thread.status = 'needs_input'
      site.thread.run = { runId: id, mode: 'edit', instruction: body.instruction, target: null, question: COLOUR_QUESTION }
      return ok({ status: 'needs_input', runId: id, question: COLOUR_QUESTION })
    },
    (body) => {
      site.thread.status = 'idle'
      site.thread.run = null
      site.turn({ instruction: 'Change the button colours', outcome: 'escalated', reply: 'That needs a deeper change than AI edits make.', commitSha: null, questions: [{ question: COLOUR_QUESTION.question, answer: body.answer }] })
      return ok({ status: 'escalated', runId: body.runId, reason: 'a deeper change' })
    },
  )
  await say('Change the button colours')
  await chatSays(COLOUR_QUESTION.question)
  expect(seen.edits[1]?.target === null, 'chat text is about the whole site')
  await shot('ai-question.png')
  expect((await page.getByRole('textbox', { name: 'Message' }).count()) === 0, 'the composer is hidden while the AI asks')
  await page.getByRole('button', { name: '#2563eb' }).click()
  await chatSays('That needs a deeper change than AI edits make.')
  await page.getByRole('textbox', { name: 'Message' }).waitFor()
  expect(seen.editAnswers[0]?.answer === '#2563eb' && seen.editAnswers[0].baseCommit === sha(4), `answer body: ${JSON.stringify(seen.editAnswers[0])}`)
  console.log('✓ question: the AI asks, the option answers it on the current commit')

  // 5. An AI change that breaks the preview is reported with the error, and taken back out of the preview.
  editAnswers.push(
    () => ok({ status: 'awaiting_result', runId: runId(), summary: 'Oops.', files: { 'src/App.tsx': 'export function App() {\n  return (<main>\n' } }),
    () => fail(502, 'ai_edit_broke_preview', "The AI's change broke the preview, and it couldn't fix it. Nothing was changed."),
  )
  errors.expected = true
  await say('Make the heading bigger')
  await chatSays("The AI's change broke the preview", 90_000)
  await page.getByText('Make the heading bigger', { exact: true }).waitFor()
  const broken = seen.results.at(-1)
  expect(broken.ok === false && broken.error?.message, `the broken preview must be reported: ${JSON.stringify(broken)}`)
  await frame.getByRole('heading', { name: 'Crumb Bakery' }).waitFor({ timeout: 60_000 })
  await page.waitForTimeout(1_000)
  errors.expected = false
  console.log(`✓ broken preview: reported (${broken.error.message.slice(0, 60)}…), and the preview is back to the site`)

  // 6. The code: editable, makable's own files read-only.
  await page.getByRole('radio', { name: 'Code' }).click()
  await page.getByText('Editing', { exact: true }).waitFor({ timeout: 60_000 })
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.type('// edited by hand\n')
  await page.getByText('1 unsaved').waitFor()
  await page.getByRole('button', { name: 'manifest.json' }).click()
  await page.getByText('Read-only', { exact: true }).waitFor()
  await shot('code-view.png')
  console.log('✓ code view: edits count as unsaved; makable’s files are read-only')
  await page.getByRole('radio', { name: 'Preview' }).click()

  // 7. Publish to GitHub Pages: the repo is made public with the user's OK, the edits saved first.
  await page.getByRole('button', { name: 'Publish', exact: true }).first().click()
  await chatSays('Where should I publish your site?')
  await page.getByRole('button', { name: 'GitHub Pages', exact: true }).last().click()
  await chatSays('https://octocat.github.io/crumb-bakery/')
  await page.getByRole('button', { name: 'Make it public and publish' }).click()
  await chatSays('Your site is live at https://octocat.github.io/crumb-bakery/', 60_000)
  const [published] = seen.publishes
  expect(published.makePublic === true && published.target === 'github-pages', `publish body: ${JSON.stringify(published)}`)
  expect(published.baseCommit === sha(5), `publish must build on the commit of the saved code edit: ${published.baseCommit}`)
  expect(site.saves.at(-1).files['src/App.tsx']?.includes('// edited by hand'), 'the code edit must be saved before publishing')
  expect(seen.statusSince.every((since) => since === '2026-10-15T12:00:00Z'), `status checks follow the deploy: ${seen.statusSince}`)
  await shot('publish-live.png')
  console.log('✓ publish: edits saved first, the repo made public with consent, the deploy followed until live')

  // 8. A phone: the chat above the preview.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await shot('workspace-mobile.png')
  await page.setViewportSize({ width: 1280, height: 900 })

  // 9. A new device: the newest site opens by itself.
  await page.evaluate(() => localStorage.removeItem('makable:site'))
  await page.reload()
  await frame.getByRole('heading', { name: 'Crumb Bakery' }).waitFor({ timeout: 90_000 })
  console.log('✓ new device: the newest site opens from GitHub')

  // 10. A change left waiting for the preview check (the tab closed while it checked) is tried again on the next visit.
  const waitingFiles = { 'src/App.tsx': site.files['src/App.tsx'].replace('Order now', 'Order online') }
  site.thread.status = 'awaiting_result'
  site.thread.run = { runId: runId(), mode: 'edit', instruction: 'Say order online', target: null, preview: { summary: 'Renamed the button.', files: waitingFiles } }
  editAnswers.push((body) => {
    site.thread.status = 'idle'
    site.thread.run = null
    const commitSha = site.commitChanges(waitingFiles)
    site.turn({ instruction: 'Say order online', reply: 'Renamed the button.' })
    return ok({ status: 'applied', runId: body.runId, summary: 'Renamed the button.', commitSha, files: waitingFiles })
  })
  const reports = seen.results.length
  await page.reload()
  await frame.getByText('Order online').waitFor({ timeout: 90_000 })
  await until(() => seen.results.length === reports + 1, 'the resumed preview report')
  expect(seen.results.at(-1).ok === true, `resumed report: ${JSON.stringify(seen.results.at(-1))}`)
  await chatSays('Renamed the button.')
  console.log('✓ resume: a change waiting for the preview check is tried and reported on the next visit')

  if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`)
  console.log('✓ no page errors')
} catch (e) {
  await shot('failure.png').catch(() => {})
  console.error(`✗ ${e.message}`)
  if (errors.length) console.error(errors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
