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
const COLOUR_QUESTION = { question: 'Which colour should the buttons be?', options: ['#e11d48', '#2563eb'], allowFreeText: true }
const WEEKEND = '<p className="mt-2 text-amber-800">Open weekends 8–2</p>'

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
    site.thread = { projectId: body.projectId, status: 'needs_input', turns: [], run: { runId: id, mode: 'create', instruction: body.prompt, target: null, question: NAME_QUESTION } }
    return ndjson([
      { type: 'progress', stage: 'name', message: 'Thinking of a name' },
      { type: 'result', data: { status: 'needs_input', runId: id, question: NAME_QUESTION } },
    ])
  }
  if (method === 'POST' && path === `/ai/create/${site.projectId}/answer`) {
    seen.answers.push(body)
    site.create(site.projectId)
    site.thread.status = 'idle'
    site.thread.run = null
    site.turn({ instruction: PROMPT, reply: 'Built Crumb Bakery: a warm landing page with your hours.', questions: [{ question: NAME_QUESTION.question, answer: body.answer }] })
    return ndjson([
      { type: 'progress', stage: 'setup', message: 'Creating the repository for Crumb Bakery on your GitHub' },
      { type: 'progress', stage: 'plan', message: 'Planning the site' },
      { type: 'progress', stage: 'write', message: 'Writing src/index.css', path: 'src/index.css', done: 0, total: 2 },
      { type: 'ping' },
      { type: 'progress', stage: 'write', message: 'Writing src/App.tsx', path: 'src/App.tsx', done: 1, total: 2 },
      { type: 'progress', stage: 'check', message: 'Checking the code' },
      { type: 'progress', stage: 'commit', message: 'Saving the site to your GitHub' },
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
  // 0. A guest: the landing page's prompt box asks them to sign in, and nothing is sent.
  site.signedIn = false
  await page.goto(BASE_URL)
  await page.getByPlaceholder('Describe the site you want to build…').click()
  const signIn = page.getByRole('dialog')
  await signIn.getByRole('button', { name: 'Continue with GitHub' }).waitFor()
  await shot('sign-in.png')
  await signIn.getByRole('button', { name: 'Close' }).click()
  expect(seen.creates.length === 0, 'a guest must not start a creation')
  console.log('✓ guest: the prompt box asks to sign in first')
  site.signedIn = true

  // 1. The landing page, signed in, with no sites: the prompt builds one.
  await page.goto(BASE_URL)
  await page.getByRole('button', { name: 'Account menu' }).waitFor()
  await page.getByPlaceholder('Describe the site you want to build…').waitFor()
  await shot('landing.png')
  await say(PROMPT)
  await chatSays(NAME_QUESTION.question)
  expect(seen.creates[0]?.prompt === PROMPT, `create body: ${JSON.stringify(seen.creates[0])}`)
  await shot('create-name.png')
  console.log('✓ create: the prompt starts a creation, which asks for the name')

  await page.getByRole('button', { name: 'Crumb Bakery', exact: true }).click()
  await frame.getByRole('heading', { name: 'Crumb Bakery' }).waitFor({ timeout: 90_000 })
  expect(seen.answers[0]?.answer === 'Crumb Bakery', `answer body: ${JSON.stringify(seen.answers[0])}`)
  await chatSays('Built Crumb Bakery: a warm landing page with your hours.')
  const tagged = await frame.locator('[data-src^="src/App.tsx:"]').count()
  expect(tagged >= 3, `the preview's elements must carry data-src (found ${tagged})`)
  await shot('workspace.png')
  console.log(`✓ create: the site opens in the live preview, its elements tagged with their place in the code (${tagged})`)

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
    () => ok({ status: 'awaiting_result', runId: runId(), summary: 'Added the weekend hours.', files: withWeekend() }),
    (body) => {
      if (!body.ok) return fail(502, 'ai_edit_broke_preview', 'broke')
      const files = withWeekend()
      const commitSha = site.commitChanges(files)
      site.turn({ instruction: 'Add our weekend hours under this', target: 'p “Warm bread all day”', reply: 'Added the weekend hours.' })
      return ok({ status: 'applied', runId: body.runId, summary: 'Added the weekend hours.', commitSha, files })
    },
  )
  await page.getByRole('button', { name: 'Edit with AI' }).click()
  await clickInPreview(page, frame.getByText('Warm bread all day'))
  const ask = page.getByRole('textbox', { name: 'Ask AI to make changes' })
  await ask.fill('Add our weekend hours under this')
  await shot('ai-edit-popover.png')
  await ask.press('Enter')
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
  await page.getByRole('button', { name: '#2563eb' }).click()
  await chatSays('That needs a deeper change than AI edits make.')
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
